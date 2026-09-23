import { Injectable, computed } from '@angular/core';
import { AccountService } from './account.service';
import { CategoryService } from './category.service';
import { PersistenceService } from '../persistence/persistence.service';
import { createId } from '../domain/ids';
import { isCivilDate, utcNow } from '../domain/civil-date';
import { generateRecurrenceOccurrences, nextOccurrenceDate } from '../domain/recurrence-rules';
import { normalizeTags } from '../domain/transaction-rules';
import { PaymentMethod, RecurrenceDatePolicy, RecurrenceFrequency, RecurrenceRule, Transaction, TransactionStatus, TransactionType } from '../domain/models';

export interface RecurrenceTemplateInput {
  readonly description: string;
  readonly amountCents: number;
  readonly type: Exclude<TransactionType, 'transfer'>;
  readonly categoryId: string;
  readonly accountId: string;
  readonly paymentMethod: PaymentMethod;
  readonly creationStatus: Extract<TransactionStatus, 'planned' | 'pending'>;
  readonly tags: string | readonly string[];
  readonly notes: string;
}

export interface RecurrenceInput extends RecurrenceTemplateInput {
  readonly frequency: RecurrenceFrequency;
  readonly interval: number;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly maxOccurrences: number | null;
  readonly datePolicy: RecurrenceDatePolicy;
}

export type RecurrenceEditScope = 'occurrence' | 'future' | 'rule';

@Injectable({ providedIn: 'root' })
export class RecurrenceService {
  readonly rules = computed(() => this.persistence.snapshot().recurrenceRules);
  readonly activeRules = computed(() => this.rules().filter((rule) => !rule.archived && rule.status === 'active'));

  constructor(
    private readonly persistence: PersistenceService,
    private readonly accountService: AccountService,
    private readonly categoryService: CategoryService,
  ) {}

  getById(id: string): RecurrenceRule | undefined {
    return this.rules().find((rule) => rule.id === id);
  }

  occurrences(ruleId: string): readonly Transaction[] {
    return this.persistence.snapshot().transactions
      .filter((transaction) => transaction.recurrenceRuleId === ruleId)
      .sort((left, right) => left.movementDate.localeCompare(right.movementDate) || left.createdAt.localeCompare(right.createdAt));
  }

  async create(input: RecurrenceInput): Promise<RecurrenceRule> {
    this.validateInput(input);
    const now = utcNow();
    const rule: RecurrenceRule = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      archived: false,
      ...this.toRuleFields(input),
      nextDate: input.startDate,
      status: 'active',
    };
    await this.persist((current) => [...current, rule]);
    return this.getById(rule.id) ?? rule;
  }

  async generate(ruleId: string, throughDate: string): Promise<readonly Transaction[]> {
    if (!isCivilDate(throughDate)) throw new Error('Informe até qual data a recorrência deve ser gerada.');
    const created: Transaction[] = [];
    const saved = await this.persistence.update((current) => {
      const rule = current.recurrenceRules.find((item) => item.id === ruleId);
      if (!rule) throw new Error('Recorrência não encontrada.');
      if (rule.status !== 'active' || rule.archived) return current;
      if (rule.accountId === null || rule.categoryId === null) throw new Error('A recorrência não possui conta e categoria válidas.');
      const existingRuleTransactions = current.transactions.filter((transaction) => transaction.recurrenceRuleId === rule.id);
      const existingKeys = new Set(existingRuleTransactions.map((transaction) => transaction.recurrenceOccurrenceKey).filter((key): key is string => key !== null));
      const existingDates = new Set(existingRuleTransactions.map((transaction) => transaction.movementDate));
      const occurrences = generateRecurrenceOccurrences(rule, throughDate);
      const now = utcNow();
      for (const occurrence of occurrences) {
        if (existingKeys.has(occurrence.key) || existingDates.has(occurrence.date)) continue;
        const transaction: Transaction = this.toTransaction(createId(), now, now, rule, occurrence.date, occurrence.key);
        created.push(transaction);
      }
      const lastSequence = occurrences.at(-1)?.sequence ?? 0;
      const nextDate = lastSequence > 0 ? nextOccurrenceDate(rule, lastSequence) : rule.nextDate;
      const updatedRule: RecurrenceRule = {
        ...rule,
        nextDate: nextDate ?? rule.nextDate,
        status: nextDate === null ? 'ended' : rule.status,
        updatedAt: now,
      };
      return {
        ...current,
        transactions: created.length ? [...current.transactions, ...created] : current.transactions,
        recurrenceRules: current.recurrenceRules.map((item) => item.id === rule.id ? updatedRule : item),
      };
    });
    if (!saved) throw new Error(this.persistence.errorMessage() ?? 'Não foi possível gerar as ocorrências.');
    return created;
  }

  async generateAll(throughDate: string): Promise<readonly Transaction[]> {
    const created: Transaction[] = [];
    for (const rule of this.activeRules()) {
      created.push(...await this.generate(rule.id, throughDate));
    }
    return created;
  }

  async end(id: string): Promise<RecurrenceRule> {
    const rule = this.getById(id);
    if (!rule) throw new Error('Recorrência não encontrada.');
    const updated = { ...rule, status: 'ended' as const, updatedAt: utcNow() };
    await this.persist((current) => current.map((item) => item.id === id ? updated : item));
    return updated;
  }

  async updateRule(id: string, input: RecurrenceInput): Promise<RecurrenceRule> {
    const rule = this.getById(id);
    if (!rule) throw new Error('Recorrência não encontrada.');
    if (this.occurrences(id).some((item) => item.status === 'paid')) {
      throw new Error('A regra completa não pode ser alterada após ocorrências pagas.');
    }
    this.validateInput(input, rule);
    const fields = this.toRuleFields(input);
    const now = utcNow();
    const updatedRule = { ...rule, ...fields, nextDate: input.startDate, updatedAt: now };
    await this.persistSnapshot((current) => ({
      ...current,
      recurrenceRules: current.recurrenceRules.map((item) => item.id === id ? updatedRule : item),
      transactions: current.transactions.map((item) => {
        if (item.recurrenceRuleId !== id || item.status === 'paid') return item;
        return { ...this.toTransaction(item.id, item.createdAt, now, updatedRule, item.movementDate, item.recurrenceOccurrenceKey), status: item.status, paymentDate: null };
      }),
    }));
    return this.getById(id) ?? { ...rule, ...fields, nextDate: input.startDate, updatedAt: now };
  }

  async updateOccurrence(transactionId: string, input: RecurrenceTemplateInput): Promise<Transaction> {
    const transaction = this.findOccurrence(transactionId);
    const rule = transaction.recurrenceRuleId ? this.getById(transaction.recurrenceRuleId) : undefined;
    if (!rule) throw new Error('A ocorrência não está vinculada a uma recorrência.');
    if (transaction.status === 'paid') throw new Error('Ocorrências pagas anteriores permanecem imutáveis.');
    this.validateTemplate(input, rule);
    const updated = this.toTransaction(transaction.id, transaction.createdAt, utcNow(), { ...rule, ...this.toTemplateFields(input) }, transaction.movementDate, transaction.recurrenceOccurrenceKey);
    await this.persistSnapshot((current) => ({ ...current, transactions: current.transactions.map((item) => item.id === transaction.id ? { ...updated, status: transaction.status, paymentDate: null } : item) }));
    return this.findOccurrence(transaction.id);
  }

  async updateFromOccurrence(ruleId: string, occurrenceId: string, input: RecurrenceInput, scope: RecurrenceEditScope): Promise<void> {
    const rule = this.getById(ruleId);
    if (!rule) throw new Error('Recorrência não encontrada.');
    const occurrence = this.findOccurrence(occurrenceId);
    if (occurrence.recurrenceRuleId !== ruleId) throw new Error('A ocorrência não pertence a esta recorrência.');
    if (scope === 'occurrence') {
      await this.updateOccurrence(occurrenceId, input);
      return;
    }
    const realizedConflict = this.occurrences(ruleId).some((item) => item.status === 'paid');
    if (scope === 'rule' && realizedConflict) throw new Error('A regra completa não pode ser alterada após ocorrências pagas.');
    if (occurrence.status === 'paid') throw new Error('Escolha uma ocorrência ainda não paga para alterar as futuras.');
    this.validateInput(input, rule);
    const fields = this.toRuleFields(input);
    const now = utcNow();
    await this.persistSnapshot((current) => ({
      ...current,
      recurrenceRules: current.recurrenceRules.map((item) => item.id === ruleId ? { ...item, ...fields, nextDate: scope === 'future' ? occurrence.movementDate : input.startDate, updatedAt: now } : item),
      transactions: current.transactions.map((item) => {
        if (item.recurrenceRuleId !== ruleId || item.status === 'paid') return item;
        if (scope === 'future' && item.movementDate < occurrence.movementDate) return item;
        return { ...this.toTransaction(item.id, item.createdAt, now, { ...rule, ...fields }, item.movementDate, item.recurrenceOccurrenceKey), status: item.status, paymentDate: null };
      }),
    }));
  }

  private findOccurrence(id: string): Transaction {
    const transaction = this.persistence.snapshot().transactions.find((item) => item.id === id && item.recurrenceRuleId !== null);
    if (!transaction) throw new Error('Ocorrência não encontrada.');
    return transaction;
  }

  private validateInput(input: RecurrenceInput, current?: RecurrenceRule): void {
    this.validateTemplate(input, current);
    if (!['weekly', 'monthly', 'yearly', 'custom'].includes(input.frequency)) throw new Error('A frequência da recorrência é inválida.');
    if (!Number.isSafeInteger(input.interval) || input.interval < 1) throw new Error('O intervalo deve ser um número inteiro positivo.');
    if (!isCivilDate(input.startDate)) throw new Error('Informe uma data inicial válida.');
    if (input.endDate !== null && (!isCivilDate(input.endDate) || input.endDate < input.startDate)) throw new Error('A data final deve ser válida e posterior à inicial.');
    if (input.maxOccurrences !== null && (!Number.isSafeInteger(input.maxOccurrences) || input.maxOccurrences < 1)) throw new Error('A quantidade máxima deve ser um inteiro positivo.');
    if (!['clamp', 'skip'].includes(input.datePolicy)) throw new Error('A política de data inexistente é inválida.');
  }

  private validateTemplate(input: RecurrenceTemplateInput, current?: RecurrenceRule): void {
    if (!input.description.trim()) throw new Error('Informe a descrição da recorrência.');
    if (input.description.trim().length > 140) throw new Error('A descrição deve ter no máximo 140 caracteres.');
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error('O valor da recorrência deve ser maior que zero.');
    if (input.type !== 'income' && input.type !== 'expense') throw new Error('O tipo da recorrência é inválido.');
    if (!['planned', 'pending'].includes(input.creationStatus)) throw new Error('A recorrência deve criar lançamentos previstos ou pendentes.');
    if (input.paymentMethod === 'credit-card') throw new Error('Recorrências com cartão de crédito devem ser cadastradas pelo fluxo de cartões.');
    const account = this.accountService.accounts().find((item) => item.id === input.accountId);
    if (!account || (account.archived && account.id !== current?.accountId)) throw new Error('Selecione uma conta ativa.');
    const category = this.categoryService.categories().find((item) => item.id === input.categoryId);
    if (!category || category.type !== input.type || (category.archived && category.id !== current?.categoryId)) throw new Error('Selecione uma categoria ativa compatível.');
  }

  private toRuleFields(input: RecurrenceInput | RecurrenceTemplateInput): Omit<RecurrenceRule, keyof import('../domain/models').AuditFields | 'nextDate' | 'status'> {
    const scheduled = input as RecurrenceInput;
    return {
      ...this.toTemplateFields(input),
      startDate: scheduled.startDate,
      endDate: scheduled.endDate,
      maxOccurrences: scheduled.maxOccurrences,
      datePolicy: scheduled.datePolicy,
      frequency: scheduled.frequency,
      interval: scheduled.interval,
    };
  }

  private toTemplateFields(input: RecurrenceTemplateInput): Pick<RecurrenceRule, 'description' | 'amountCents' | 'type' | 'categoryId' | 'accountId' | 'paymentMethod' | 'creationStatus' | 'tags' | 'notes'> {
    return {
      description: input.description.trim(),
      amountCents: input.amountCents,
      type: input.type,
      categoryId: input.categoryId,
      accountId: input.accountId,
      paymentMethod: input.paymentMethod,
      creationStatus: input.creationStatus,
      tags: normalizeTags(input.tags),
      notes: input.notes.trim(),
    };
  }

  private toTransaction(id: string, createdAt: string, updatedAt: string, rule: RecurrenceRule, date: string, occurrenceKey: string | null): Transaction {
    return {
      id,
      createdAt,
      updatedAt,
      archived: false,
      description: rule.description,
      amountCents: rule.amountCents,
      type: rule.type,
      movementDate: date,
      dueDate: date,
      paymentDate: null,
      paymentMethod: rule.paymentMethod,
      status: rule.creationStatus,
      categoryId: rule.categoryId,
      accountId: rule.accountId,
      fromAccountId: null,
      toAccountId: null,
      creditCardId: null,
      tags: rule.tags,
      notes: rule.notes,
      recurrenceRuleId: rule.id,
      recurrenceOccurrenceKey: occurrenceKey,
      transferId: null,
      installmentGroupId: null,
      cardInvoiceId: null,
    };
  }

  private async persist(mutator: (current: readonly RecurrenceRule[]) => readonly RecurrenceRule[]): Promise<void> {
    const saved = await this.persistence.update((current) => ({ ...current, recurrenceRules: mutator(current.recurrenceRules) }));
    if (!saved) throw new Error(this.persistence.errorMessage() ?? 'Não foi possível salvar a recorrência.');
  }

  private async persistSnapshot(mutator: (current: import('../domain/models').DatabaseSnapshot) => import('../domain/models').DatabaseSnapshot): Promise<void> {
    const saved = await this.persistence.update(mutator);
    if (!saved) throw new Error(this.persistence.errorMessage() ?? 'Não foi possível salvar a recorrência.');
  }
}
