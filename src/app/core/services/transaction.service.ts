import { Injectable, computed } from '@angular/core';
import { AccountService } from './account.service';
import { CategoryService } from './category.service';
import { PersistenceService } from '../persistence/persistence.service';
import { createId } from '../domain/ids';
import { isCivilDate, todayCivilDate, utcNow } from '../domain/civil-date';
import { Account, Category, PaymentMethod, Transaction, TransactionStatus, TransactionType } from '../domain/models';
import { canDeleteTransaction, calculateTransactionTotals, filterTransactions, normalizeTags, paginateTransactions, TransactionFilter, TransactionPage, TransactionTotals } from '../domain/transaction-rules';

export interface TransactionInput {
  description: string;
  amountCents: number;
  type: Exclude<TransactionType, 'transfer'>;
  movementDate: string;
  dueDate: string | null;
  paymentDate: string | null;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  categoryId: string;
  accountId: string;
  tags: string | readonly string[];
  notes: string;
}

@Injectable({ providedIn: 'root' })
export class TransactionService {
  readonly transactions = computed(() => this.persistence.snapshot().transactions);
  readonly activeTransactions = computed(() => this.transactions().filter((transaction) => !transaction.archived));

  constructor(
    private readonly persistence: PersistenceService,
    private readonly accountService: AccountService,
    private readonly categoryService: CategoryService,
  ) {}

  page(filter: TransactionFilter, page: number, pageSize: number): TransactionPage {
    return paginateTransactions(this.transactions(), filter, page, pageSize);
  }

  totals(filter: TransactionFilter): TransactionTotals {
    return calculateTransactionTotals(filterTransactions(this.transactions(), filter));
  }

  getById(id: string): Transaction | undefined {
    return this.transactions().find((transaction) => transaction.id === id);
  }

  categoryFor(transaction: Transaction): Category | undefined {
    return this.categoryService.categories().find((category) => category.id === transaction.categoryId);
  }

  accountFor(transaction: Transaction): Account | undefined {
    return this.accountService.accounts().find((account) => account.id === transaction.accountId);
  }

  canDelete(transaction: Transaction): boolean {
    return canDeleteTransaction(transaction);
  }

  async create(input: TransactionInput): Promise<Transaction> {
    this.validateInput(input);
    const now = utcNow();
    const transaction = this.toTransaction(createId(), now, now, input);
    await this.persist((current) => [...current, transaction]);
    return transaction;
  }

  async update(id: string, input: TransactionInput): Promise<Transaction> {
    const current = this.getById(id);
    if (!current) {
      throw new Error('Movimentação não encontrada.');
    }
    if (current.type === 'transfer') {
      throw new Error('Transferências são gerenciadas pelo fluxo de transferências.');
    }
    if (current.creditCardId !== null || current.cardInvoiceId !== null || current.installmentGroupId !== null) {
      throw new Error('Esta movimentação é gerenciada pelo fluxo do cartão.');
    }
    if (current.recurrenceRuleId !== null) {
      throw new Error('Esta ocorrência é gerenciada pelo fluxo de recorrências.');
    }
    this.validateInput(input, current);
    const updated = this.toTransaction(id, current.createdAt, utcNow(), input, current);
    await this.persist((current) => current.map((transaction) => transaction.id === id ? updated : transaction));
    return updated;
  }

  async duplicate(id: string): Promise<Transaction> {
    const current = this.getById(id);
    if (!current) {
      throw new Error('Movimentação não encontrada.');
    }
    if (current.type === 'transfer') {
      throw new Error('Transferências não podem ser duplicadas como lançamentos simples.');
    }
    return this.create({
      description: `${current.description} (cópia)`,
      amountCents: current.amountCents,
      type: current.type as Exclude<TransactionType, 'transfer'>,
      movementDate: current.movementDate,
      dueDate: current.dueDate,
      paymentDate: null,
      paymentMethod: current.paymentMethod,
      status: 'planned',
      categoryId: current.categoryId ?? '',
      accountId: current.accountId ?? '',
      tags: current.tags,
      notes: current.notes,
    });
  }

  async markAsPaid(id: string, paymentDate = todayCivilDate()): Promise<Transaction> {
    const current = this.getById(id);
    if (!current) {
      throw new Error('Movimentação não encontrada.');
    }
    if (!isCivilDate(paymentDate)) {
      throw new Error('Informe uma data de pagamento válida.');
    }
    return this.updateStatus(current, 'paid', paymentDate);
  }

  async setStatus(id: string, status: TransactionStatus, paymentDate: string | null = null): Promise<Transaction> {
    const current = this.getById(id);
    if (!current) {
      throw new Error('Movimentação não encontrada.');
    }
    const resolvedPaymentDate = status === 'paid' ? (paymentDate ?? current.paymentDate ?? todayCivilDate()) : null;
    return this.updateStatus(current, status, resolvedPaymentDate);
  }

  async delete(id: string): Promise<void> {
    const current = this.getById(id);
    if (!current) {
      throw new Error('Movimentação não encontrada.');
    }
    if (!canDeleteTransaction(current)) {
      throw new Error('Esta movimentação possui vínculo especial e não pode ser excluída.');
    }
    await this.persist((current) => current.filter((transaction) => transaction.id !== id));
  }

  private validateInput(input: TransactionInput, current?: Transaction): void {
    if (!input.description.trim()) throw new Error('Informe a descrição da movimentação.');
    if (input.description.trim().length > 140) throw new Error('A descrição deve ter no máximo 140 caracteres.');
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error('O valor deve ser maior que zero.');
    if (!isCivilDate(input.movementDate)) throw new Error('Informe uma data de competência válida.');
    if (input.dueDate !== null && !isCivilDate(input.dueDate)) throw new Error('Informe um vencimento válido.');
    if (input.status === 'paid' && input.paymentDate !== null && !isCivilDate(input.paymentDate)) throw new Error('Informe uma data de pagamento válida.');
    if (input.type !== 'income' && input.type !== 'expense') throw new Error('O tipo da movimentação é inválido.');
    const category = this.findCategory(input.categoryId);
    if (!category) throw new Error('Selecione uma categoria.');
    if (category.type !== input.type) throw new Error('A categoria não é compatível com o tipo do lançamento.');
    if (category.archived && category.id !== current?.categoryId) throw new Error('Categorias arquivadas não podem ser usadas em novos lançamentos.');
    const account = this.findAccount(input.accountId);
    if (!account) throw new Error('Selecione uma conta.');
    if (account.archived && account.id !== current?.accountId) throw new Error('Contas arquivadas não podem receber novos lançamentos.');
    if (!Object.values(['planned', 'pending', 'paid', 'cancelled'] as TransactionStatus[]).includes(input.status)) throw new Error('A situação da movimentação é inválida.');
  }

  private toTransaction(id: string, createdAt: string, updatedAt: string, input: TransactionInput, current?: Transaction): Transaction {
    const status = input.status;
    return {
      id,
      createdAt,
      updatedAt,
      archived: current?.archived ?? false,
      description: input.description.trim(),
      amountCents: input.amountCents,
      type: input.type,
      movementDate: input.movementDate,
      dueDate: input.dueDate,
      paymentDate: status === 'paid' ? (input.paymentDate ?? input.movementDate) : null,
      paymentMethod: input.paymentMethod,
      status,
      categoryId: input.categoryId,
      accountId: input.accountId,
      fromAccountId: null,
      toAccountId: null,
      creditCardId: null,
      tags: normalizeTags(input.tags),
      notes: input.notes.trim(),
      recurrenceRuleId: current?.recurrenceRuleId ?? null,
      recurrenceOccurrenceKey: null,
      transferId: current?.transferId ?? null,
      installmentGroupId: current?.installmentGroupId ?? null,
      cardInvoiceId: null,
    };
  }

  private toInput(transaction: Transaction, changes: Partial<Pick<TransactionInput, 'status' | 'paymentDate'>> = {}): TransactionInput {
    return {
      description: transaction.description,
      amountCents: transaction.amountCents,
      type: transaction.type as Exclude<TransactionType, 'transfer'>,
      movementDate: transaction.movementDate,
      dueDate: transaction.dueDate,
      paymentDate: changes.paymentDate === undefined ? transaction.paymentDate : changes.paymentDate,
      paymentMethod: transaction.paymentMethod,
      status: changes.status ?? transaction.status,
      categoryId: transaction.categoryId ?? '',
      accountId: transaction.accountId ?? '',
      tags: transaction.tags,
      notes: transaction.notes,
    };
  }

  private findCategory(id: string): Category | undefined {
    return this.categoryService.categories().find((category) => category.id === id);
  }

  private findAccount(id: string): Account | undefined {
    return this.accountService.accounts().find((account) => account.id === id);
  }

  private async persist(mutator: (current: readonly Transaction[]) => readonly Transaction[]): Promise<void> {
    const saved = await this.persistence.update((current) => ({ ...current, transactions: mutator(current.transactions) }));
    if (!saved) throw new Error(this.persistence.errorMessage() ?? 'Não foi possível salvar a movimentação.');
  }

  private async updateStatus(current: Transaction, status: TransactionStatus, paymentDate: string | null): Promise<Transaction> {
    if (current.type === 'transfer') {
      throw new Error('Transferências são gerenciadas pelo fluxo de transferências.');
    }
    if (current.creditCardId !== null || current.cardInvoiceId !== null || current.installmentGroupId !== null) {
      throw new Error('Esta movimentação é gerenciada pelo fluxo do cartão.');
    }
    if (status === 'paid' && paymentDate !== null && !isCivilDate(paymentDate)) {
      throw new Error('Informe uma data de pagamento válida.');
    }
    const updated: Transaction = { ...current, status, paymentDate: status === 'paid' ? (paymentDate ?? current.movementDate) : null, updatedAt: utcNow() };
    await this.persist((transactions) => transactions.map((transaction) => transaction.id === current.id ? updated : transaction));
    return this.getById(current.id) ?? updated;
  }
}
