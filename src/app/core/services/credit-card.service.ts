import { Injectable, computed } from '@angular/core';
import { calculateAvailableCreditLimit, calculateCreditLimitUsed, calculateInvoiceClosingDate, calculateInvoiceCompetence, calculateInvoiceDueDate, calculateInvoiceTotal, planCardInstallments } from '../domain/card-rules';
import { isCivilDate, todayCivilDate, utcNow } from '../domain/civil-date';
import { createId } from '../domain/ids';
import { CardPurchase, CreditCard, CreditCardInvoice, CreditCardInvoiceStatus, DatabaseSnapshot, Transaction } from '../domain/models';
import { PersistenceService } from '../persistence/persistence.service';
import { AccountService } from './account.service';
import { CategoryService } from './category.service';

export interface CreditCardInput {
  readonly name: string;
  readonly brand: string;
  readonly paymentAccountId: string;
  readonly creditLimitCents: number;
  readonly closingDay: number;
  readonly dueDay: number;
  readonly color: string;
  readonly icon: string;
}

export interface CardPurchaseInput {
  readonly description: string;
  readonly totalAmountCents: number;
  readonly purchaseDate: string;
  readonly categoryId: string;
  readonly creditCardId: string;
  readonly installmentCount: number;
  readonly firstCompetence: string;
}

@Injectable({ providedIn: 'root' })
export class CreditCardService {
  readonly cards = computed(() => this.persistence.snapshot().creditCards);
  readonly activeCards = computed(() => this.cards().filter((card) => !card.archived));
  readonly purchases = computed(() => this.persistence.snapshot().cardPurchases);
  readonly invoices = computed(() => this.persistence.snapshot().cardInvoices);
  readonly activePurchases = computed(() => this.purchases().filter((purchase) => !purchase.archived && purchase.status === 'active'));

  constructor(
    private readonly persistence: PersistenceService,
    private readonly accountService: AccountService,
    private readonly categoryService: CategoryService,
  ) {}

  getById(id: string): CreditCard | undefined { return this.cards().find((card) => card.id === id); }
  getPurchaseById(id: string): CardPurchase | undefined { return this.purchases().find((purchase) => purchase.id === id); }
  getInvoiceById(id: string): CreditCardInvoice | undefined { return this.invoices().find((invoice) => invoice.id === id); }
  purchasesFor(cardId: string): readonly CardPurchase[] { return this.purchases().filter((purchase) => purchase.creditCardId === cardId); }
  invoicesFor(cardId: string): readonly CreditCardInvoice[] { return this.invoices().filter((invoice) => invoice.creditCardId === cardId).sort((left, right) => left.competence.localeCompare(right.competence)); }
  transactionsFor(invoice: CreditCardInvoice): readonly Transaction[] { return this.persistence.snapshot().transactions.filter((transaction) => !transaction.archived && transaction.cardInvoiceId === invoice.id && transaction.creditCardId === invoice.creditCardId && transaction.status !== 'cancelled'); }
  invoiceTransactions(invoice: CreditCardInvoice): readonly Transaction[] { return this.transactionsFor(invoice); }
  purchaseForTransaction(transaction: Transaction): CardPurchase | undefined { return transaction.installmentGroupId ? this.purchases().find((purchase) => purchase.installmentGroupId === transaction.installmentGroupId) : undefined; }
  invoiceTotal(invoice: CreditCardInvoice): number { return calculateInvoiceTotal(invoice, this.persistence.snapshot().transactions); }
  limitUsed(card: CreditCard): number { return calculateCreditLimitUsed(this.persistence.snapshot().transactions, card.id); }
  availableLimit(card: CreditCard): number { return calculateAvailableCreditLimit(card, this.persistence.snapshot().transactions, card.id); }
  hasHistory(card: CreditCard): boolean {
    const snapshot = this.persistence.snapshot();
    return snapshot.cardPurchases.some((purchase) => purchase.creditCardId === card.id) || snapshot.cardInvoices.some((invoice) => invoice.creditCardId === card.id) || snapshot.transactions.some((transaction) => transaction.creditCardId === card.id || transaction.cardInvoiceId !== null && snapshot.cardInvoices.some((invoice) => invoice.id === transaction.cardInvoiceId && invoice.creditCardId === card.id));
  }

  nextInvoice(card: CreditCard): CreditCardInvoice | undefined {
    return this.invoicesFor(card.id).find((invoice) => invoice.status === 'open' || invoice.status === 'closed' || invoice.status === 'overdue');
  }

  invoiceStatus(invoice: CreditCardInvoice, today = todayCivilDate()): CreditCardInvoiceStatus {
    if (invoice.status === 'open' || invoice.status === 'closed') {
      if (invoice.dueDate < today) return 'overdue';
    }
    return invoice.status;
  }

  async createCard(input: CreditCardInput): Promise<CreditCard> {
    this.validateCardInput(input);
    const now = utcNow();
    const card: CreditCard = {
      id: createId(), createdAt: now, updatedAt: now, archived: false,
      name: input.name.trim(), brand: input.brand.trim() || null, institution: null,
      paymentAccountId: input.paymentAccountId, color: input.color, icon: input.icon.trim(),
      creditLimitCents: input.creditLimitCents, closingDay: input.closingDay, dueDay: input.dueDay,
    };
    await this.persist((current) => ({ ...current, creditCards: [...current.creditCards, card] }));
    return this.getById(card.id) ?? card;
  }

  async updateCard(id: string, input: CreditCardInput): Promise<CreditCard> {
    const current = this.getById(id);
    if (!current) throw new Error('Cartão não encontrado.');
    this.validateCardInput(input);
    const now = utcNow();
    const updated: CreditCard = {
      ...current, name: input.name.trim(), brand: input.brand.trim() || null, paymentAccountId: input.paymentAccountId,
      color: input.color, icon: input.icon.trim(), creditLimitCents: input.creditLimitCents,
      closingDay: input.closingDay, dueDay: input.dueDay, updatedAt: now,
    };
    await this.persist((snapshot) => {
      const invoices = snapshot.cardInvoices.map((invoice) => {
        if (invoice.creditCardId !== id || invoice.status === 'paid' || invoice.status === 'cancelled') return invoice;
        return { ...invoice, closingDate: calculateInvoiceClosingDate(invoice.competence, input.closingDay), dueDate: calculateInvoiceDueDate(invoice.competence, input.closingDay, input.dueDay), updatedAt: now };
      });
      const invoiceMap = new Map(invoices.map((invoice) => [invoice.id, invoice]));
      const transactions = snapshot.transactions.map((transaction) => {
        const invoice = transaction.cardInvoiceId ? invoiceMap.get(transaction.cardInvoiceId) : undefined;
        if (!invoice || invoice.creditCardId !== id || transaction.creditCardId !== id || transaction.status === 'paid') return transaction;
        return { ...transaction, dueDate: invoice.dueDate, updatedAt: now };
      });
      return { ...snapshot, creditCards: snapshot.creditCards.map((card) => card.id === id ? updated : card), cardInvoices: invoices, transactions };
    });
    return this.getById(id) ?? updated;
  }

  async archive(id: string): Promise<void> {
    const card = this.getById(id);
    if (!card) throw new Error('Cartão não encontrado.');
    if (card.archived) return;
    await this.persist((snapshot) => ({ ...snapshot, creditCards: snapshot.creditCards.map((item) => item.id === id ? { ...item, archived: true, updatedAt: utcNow() } : item) }));
  }

  async reactivate(id: string): Promise<void> {
    const card = this.getById(id);
    if (!card) throw new Error('Cartão não encontrado.');
    if (!card.paymentAccountId || !this.accountService.accounts().some((account) => account.id === card.paymentAccountId)) throw new Error('Associe uma conta de pagamento antes de reativar o cartão.');
    await this.persist((snapshot) => ({ ...snapshot, creditCards: snapshot.creditCards.map((item) => item.id === id ? { ...item, archived: false, updatedAt: utcNow() } : item) }));
  }

  async createPurchase(input: CardPurchaseInput): Promise<CardPurchase> {
    this.validatePurchaseInput(input);
    const card = this.getById(input.creditCardId)!;
    const plan = planCardInstallments(input.totalAmountCents, input.installmentCount, input.firstCompetence);
    this.assertInvoicesCanReceive(plan.map((item) => item.competence), card.id);
    const now = utcNow();
    const purchase: CardPurchase = { id: createId(), createdAt: now, updatedAt: now, archived: false, description: input.description.trim(), totalAmountCents: input.totalAmountCents, purchaseDate: input.purchaseDate, firstCompetence: input.firstCompetence, categoryId: input.categoryId, creditCardId: input.creditCardId, installmentCount: input.installmentCount, installmentGroupId: createId(), status: 'active' };
    await this.persist((snapshot) => this.addPurchaseToSnapshot(snapshot, purchase, plan, now));
    return this.getPurchaseById(purchase.id) ?? purchase;
  }

  async updatePurchase(id: string, input: CardPurchaseInput): Promise<CardPurchase> {
    const current = this.getPurchaseById(id);
    if (!current || current.archived || current.status !== 'active') throw new Error('Compra de cartão não encontrada ou cancelada.');
    this.assertPurchaseNotPaid(current);
    this.validatePurchaseInput(input, current);
    const card = this.getById(input.creditCardId)!;
    const plan = planCardInstallments(input.totalAmountCents, input.installmentCount, input.firstCompetence);
    this.assertInvoicesCanReceive(plan.map((item) => item.competence), card.id, current.installmentGroupId);
    const now = utcNow();
    const updated: CardPurchase = { ...current, description: input.description.trim(), totalAmountCents: input.totalAmountCents, purchaseDate: input.purchaseDate, firstCompetence: input.firstCompetence, categoryId: input.categoryId, creditCardId: input.creditCardId, installmentCount: input.installmentCount, updatedAt: now };
    await this.persist((snapshot) => {
      const cancelledIds = new Set(snapshot.transactions.filter((transaction) => transaction.installmentGroupId === current.installmentGroupId).map((transaction) => transaction.id));
      const transactions = snapshot.transactions.map((transaction) => cancelledIds.has(transaction.id) ? { ...transaction, archived: true, status: 'cancelled' as const, paymentDate: null, updatedAt: now } : transaction);
      const withOld = { ...snapshot, transactions, cardPurchases: snapshot.cardPurchases.map((purchase) => purchase.id === id ? updated : purchase) };
      const withNew = this.addPurchaseToSnapshot(withOld, updated, plan, now);
      return { ...withNew, cardInvoices: this.cancelEmptyInvoices([...withNew.cardInvoices], withNew.transactions, now) };
    });
    return this.getPurchaseById(id) ?? updated;
  }

  async cancelPurchase(id: string): Promise<void> {
    const current = this.getPurchaseById(id);
    if (!current || current.archived || current.status !== 'active') throw new Error('Compra de cartão não encontrada ou cancelada.');
    this.assertPurchaseNotPaid(current);
    const now = utcNow();
    await this.persist((snapshot) => {
      const transactions = snapshot.transactions.map((transaction) => transaction.installmentGroupId === current.installmentGroupId ? { ...transaction, archived: true, status: 'cancelled' as const, paymentDate: null, updatedAt: now } : transaction);
      const invoices = this.cancelEmptyInvoices(snapshot.cardInvoices.map((invoice) => ({ ...invoice })), transactions, now);
      return { ...snapshot, transactions, cardInvoices: invoices, cardPurchases: snapshot.cardPurchases.map((purchase) => purchase.id === id ? { ...purchase, status: 'cancelled' as const, archived: true, updatedAt: now } : purchase) };
    });
  }

  async closeInvoice(id: string): Promise<CreditCardInvoice> {
    const invoice = this.getInvoiceById(id);
    if (!invoice) throw new Error('Fatura não encontrada.');
    if (invoice.status === 'paid' || invoice.status === 'cancelled') throw new Error('Esta fatura não pode ser fechada.');
    const updated = { ...invoice, status: 'closed' as const, updatedAt: utcNow() };
    await this.persist((snapshot) => ({ ...snapshot, cardInvoices: snapshot.cardInvoices.map((item) => item.id === id ? updated : item) }));
    return this.getInvoiceById(id) ?? updated;
  }

  async refreshInvoiceStatuses(today = todayCivilDate()): Promise<void> {
    if (!isCivilDate(today)) throw new Error('Informe uma data de atualização válida.');
    const now = utcNow();
    await this.persist((snapshot) => ({ ...snapshot, cardInvoices: snapshot.cardInvoices.map((invoice) => invoice.status === 'open' || invoice.status === 'closed' ? (invoice.dueDate < today ? { ...invoice, status: 'overdue' as const, updatedAt: now } : invoice) : invoice) }));
  }

  async payInvoice(id: string, paymentDate = todayCivilDate()): Promise<Transaction> {
    const invoice = this.getInvoiceById(id);
    if (!invoice) throw new Error('Fatura não encontrada.');
    if (invoice.status === 'paid') throw new Error('Esta fatura já foi paga.');
    if (invoice.status === 'cancelled') throw new Error('Faturas canceladas não podem ser pagas.');
    if (invoice.paymentTransactionId !== null) throw new Error('Esta fatura já possui um pagamento registrado.');
    if (!isCivilDate(paymentDate)) throw new Error('Informe uma data de pagamento válida.');
    const card = this.getById(invoice.creditCardId);
    if (!card?.paymentAccountId) throw new Error('O cartão não possui conta de pagamento vinculada.');
    const account = this.accountService.accounts().find((item) => item.id === card.paymentAccountId);
    if (!account || account.archived) throw new Error('A conta de pagamento está arquivada ou não existe.');
    const amountCents = this.invoiceTotal(invoice);
    if (amountCents <= 0) throw new Error('Não é possível pagar uma fatura sem lançamentos ativos.');
    const now = utcNow();
    const payment: Transaction = { id: createId(), createdAt: now, updatedAt: now, archived: false, description: `Pagamento da fatura ${card.name} ${invoice.competence}`, amountCents, type: 'expense', movementDate: paymentDate, dueDate: null, paymentDate, paymentMethod: 'bank-transfer', status: 'paid', categoryId: null, accountId: account.id, fromAccountId: null, toAccountId: null, creditCardId: null, tags: [], notes: `Fatura ${invoice.id}`, recurrenceRuleId: null, recurrenceOccurrenceKey: null, transferId: null, installmentGroupId: null, cardInvoiceId: invoice.id };
    const updatedInvoice: CreditCardInvoice = { ...invoice, status: 'paid', paidAt: paymentDate, paymentTransactionId: payment.id, updatedAt: now };
    await this.persist((snapshot) => {
      if (snapshot.cardInvoices.some((item) => item.id === id && item.status === 'paid')) throw new Error('Esta fatura já foi paga.');
      return { ...snapshot, transactions: [...snapshot.transactions, payment], cardInvoices: snapshot.cardInvoices.map((item) => item.id === id ? updatedInvoice : item) };
    });
    return payment;
  }

  private validateCardInput(input: CreditCardInput): void {
    if (!input.name.trim()) throw new Error('Informe o nome do cartão.');
    if (input.name.trim().length > 80) throw new Error('O nome do cartão deve ter no máximo 80 caracteres.');
    if (!Number.isSafeInteger(input.creditLimitCents) || input.creditLimitCents < 0) throw new Error('O limite deve ser um valor inteiro em centavos.');
    if (!Number.isSafeInteger(input.closingDay) || input.closingDay < 1 || input.closingDay > 31) throw new Error('Informe um dia de fechamento entre 1 e 31.');
    if (!Number.isSafeInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 31) throw new Error('Informe um dia de vencimento entre 1 e 31.');
    if (!input.paymentAccountId || !this.accountService.accounts().some((account) => account.id === input.paymentAccountId && !account.archived)) throw new Error('Selecione uma conta de pagamento ativa.');
    if (!input.color.trim() || !input.icon.trim()) throw new Error('Informe cor e ícone do cartão.');
  }

  private validatePurchaseInput(input: CardPurchaseInput, current?: CardPurchase): void {
    if (!input.description.trim()) throw new Error('Informe a descrição da compra.');
    if (input.description.trim().length > 140) throw new Error('A descrição deve ter no máximo 140 caracteres.');
    if (!isCivilDate(input.purchaseDate)) throw new Error('Informe uma data de compra válida.');
    const card = this.getById(input.creditCardId);
    if (!card || card.archived) throw new Error('Selecione um cartão ativo.');
    const category = this.categoryService.categories().find((item) => item.id === input.categoryId);
    if (!category || category.type !== 'expense') throw new Error('Selecione uma categoria de despesa.');
    if (category.archived && category.id !== current?.categoryId) throw new Error('Categorias arquivadas não podem ser usadas em novas compras.');
    const minimumCompetence = calculateInvoiceCompetence(input.purchaseDate, card.closingDay);
    if (!/^\d{4}-\d{2}$/.test(input.firstCompetence) || input.firstCompetence < minimumCompetence) throw new Error(`A primeira competência não pode ser anterior a ${minimumCompetence}.`);
    planCardInstallments(input.totalAmountCents, input.installmentCount, input.firstCompetence);
  }

  private assertInvoicesCanReceive(competences: readonly string[], cardId: string, ignoredGroupId?: string): void {
    const keys = new Set(competences);
    for (const invoice of this.invoicesFor(cardId)) {
      if (!keys.has(invoice.competence) || invoice.status === 'open') continue;
      const hasIgnoredPurchase = ignoredGroupId ? this.persistence.snapshot().transactions.some((transaction) => transaction.installmentGroupId === ignoredGroupId && transaction.cardInvoiceId === invoice.id) : false;
      if (!hasIgnoredPurchase) throw new Error(`A fatura de ${invoice.competence} já foi fechada e não aceita alterações retroativas.`);
    }
  }

  private assertPurchaseNotPaid(purchase: CardPurchase): void {
    const paid = this.persistence.snapshot().transactions.some((transaction) => transaction.installmentGroupId === purchase.installmentGroupId && transaction.cardInvoiceId !== null && this.getInvoiceById(transaction.cardInvoiceId)?.status === 'paid');
    if (paid) throw new Error('A compra possui fatura paga; estorne ou trate a fatura antes de alterá-la.');
  }

  private addPurchaseToSnapshot(snapshot: DatabaseSnapshot, purchase: CardPurchase, plan: readonly { sequence: number; amountCents: number; competence: string }[], now: string): DatabaseSnapshot {
    const invoiceMap = new Map(snapshot.cardInvoices.map((invoice) => [`${invoice.creditCardId}|${invoice.competence}`, invoice]));
    const invoices = [...snapshot.cardInvoices];
    const invoiceByCompetence = new Map<string, CreditCardInvoice>();
    for (const item of plan) {
      const key = `${purchase.creditCardId}|${item.competence}`;
      let invoice = invoiceMap.get(key);
      if (!invoice) {
        const card = snapshot.creditCards.find((candidate) => candidate.id === purchase.creditCardId);
        if (!card) throw new Error('Cartão não encontrado.');
        invoice = { id: createId(), createdAt: now, updatedAt: now, archived: false, creditCardId: purchase.creditCardId, competence: item.competence, closingDate: calculateInvoiceClosingDate(item.competence, card.closingDay), dueDate: calculateInvoiceDueDate(item.competence, card.closingDay, card.dueDay), status: 'open', paidAt: null, paymentTransactionId: null };
        invoices.push(invoice);
        invoiceMap.set(key, invoice);
      }
      invoiceByCompetence.set(item.competence, invoice);
    }
    const transactions = plan.map((item) => {
      const invoice = invoiceByCompetence.get(item.competence)!;
      return { id: createId(), createdAt: now, updatedAt: now, archived: false, description: purchase.installmentCount === 1 ? purchase.description : `${purchase.description} (${item.sequence}/${purchase.installmentCount})`, amountCents: item.amountCents, type: 'expense' as const, movementDate: `${item.competence}-01`, dueDate: invoice.dueDate, paymentDate: null, paymentMethod: 'credit-card' as const, status: 'pending' as const, categoryId: purchase.categoryId, accountId: null, fromAccountId: null, toAccountId: null, creditCardId: purchase.creditCardId, tags: [], notes: `Compra ${purchase.id}`, recurrenceRuleId: null, recurrenceOccurrenceKey: null, transferId: null, installmentGroupId: purchase.installmentGroupId, cardInvoiceId: invoice.id } satisfies Transaction;
    });
    return { ...snapshot, cardInvoices: invoices, cardPurchases: snapshot.cardPurchases.some((item) => item.id === purchase.id) ? snapshot.cardPurchases : [...snapshot.cardPurchases, purchase], transactions: [...snapshot.transactions, ...transactions] };
  }

  private cancelEmptyInvoices(invoices: CreditCardInvoice[], transactions: readonly Transaction[], now: string): CreditCardInvoice[] {
    return invoices.map((invoice) => {
      if (invoice.status === 'paid' || invoice.status === 'cancelled') return invoice;
      const hasItems = transactions.some((transaction) => !transaction.archived && transaction.status !== 'cancelled' && transaction.cardInvoiceId === invoice.id && transaction.creditCardId === invoice.creditCardId);
      return hasItems ? invoice : { ...invoice, status: 'cancelled' as const, updatedAt: now };
    });
  }

  private async persist(mutator: (current: DatabaseSnapshot) => DatabaseSnapshot): Promise<void> {
    const saved = await this.persistence.update(mutator);
    if (!saved) throw new Error(this.persistence.errorMessage() ?? 'Não foi possível salvar os dados do cartão.');
  }
}
