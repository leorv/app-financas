import { Injectable, computed } from '@angular/core';
import { Account, Transaction, TransactionStatus } from '../domain/models';
import { createId } from '../domain/ids';
import { todayCivilDate, utcNow } from '../domain/civil-date';
import { validateTransferDraft } from '../domain/transfer-rules';
import { PersistenceService } from '../persistence/persistence.service';
import { AccountService } from './account.service';

export interface TransferInput {
  readonly fromAccountId: string;
  readonly toAccountId: string;
  readonly amountCents: number;
  readonly movementDate: string;
  readonly paymentDate: string | null;
  readonly status: TransactionStatus;
  readonly description: string;
  readonly notes: string;
}

@Injectable({ providedIn: 'root' })
export class TransferService {
  readonly transfers = computed(() => this.persistence.snapshot().transactions.filter((transaction) => transaction.type === 'transfer' && !transaction.archived));

  constructor(
    private readonly persistence: PersistenceService,
    private readonly accountService: AccountService,
  ) {}

  getById(id: string): Transaction | undefined {
    return this.persistence.snapshot().transactions.find((transaction) => transaction.type === 'transfer' && (transaction.id === id || transaction.transferId === id));
  }

  accountFor(id: string | null): Account | undefined {
    return id ? this.accountService.accounts().find((account) => account.id === id) : undefined;
  }

  async create(input: TransferInput): Promise<Transaction> {
    this.validateInput(input);
    const now = utcNow();
    const id = createId();
    const transaction = this.toTransaction(id, now, now, input);
    await this.persist((current) => [...current, transaction]);
    return this.getById(id) ?? transaction;
  }

  async update(id: string, input: TransferInput): Promise<Transaction> {
    const current = this.getById(id);
    if (!current) throw new Error('Transferência não encontrada.');
    this.validateInput(input, current);
    const updated = this.toTransaction(current.id, current.createdAt, utcNow(), input, current);
    await this.persist((transactions) => transactions.map((transaction) => transaction.id === current.id ? updated : transaction));
    return this.getById(current.id) ?? updated;
  }

  async setStatus(id: string, status: TransactionStatus, paymentDate: string | null = null): Promise<Transaction> {
    const current = this.getById(id);
    if (!current) throw new Error('Transferência não encontrada.');
    const nextPaymentDate = status === 'paid' ? (paymentDate ?? current.paymentDate ?? todayCivilDate()) : null;
    return this.update(id, this.toInput(current, { status, paymentDate: nextPaymentDate }));
  }

  async markAsPaid(id: string, paymentDate = todayCivilDate()): Promise<Transaction> {
    return this.setStatus(id, 'paid', paymentDate);
  }

  async cancel(id: string): Promise<Transaction> {
    return this.setStatus(id, 'cancelled');
  }

  async reopen(id: string, status: Extract<TransactionStatus, 'planned' | 'pending'> = 'pending'): Promise<Transaction> {
    return this.setStatus(id, status);
  }

  private validateInput(input: TransferInput, current?: Transaction): void {
    validateTransferDraft(input);
    const from = this.accountService.accounts().find((account) => account.id === input.fromAccountId);
    const to = this.accountService.accounts().find((account) => account.id === input.toAccountId);
    if (!from || (from.archived && from.id !== current?.fromAccountId)) throw new Error('A conta de origem precisa estar ativa.');
    if (!to || (to.archived && to.id !== current?.toAccountId)) throw new Error('A conta de destino precisa estar ativa.');
  }

  private toTransaction(id: string, createdAt: string, updatedAt: string, input: TransferInput, current?: Transaction): Transaction {
    return {
      id,
      createdAt,
      updatedAt,
      archived: current?.archived ?? false,
      description: input.description.trim() || 'Transferência',
      amountCents: input.amountCents,
      type: 'transfer',
      movementDate: input.movementDate,
      dueDate: null,
      paymentDate: input.status === 'paid' ? (input.paymentDate ?? input.movementDate) : null,
      paymentMethod: 'bank-transfer',
      status: input.status,
      categoryId: null,
      accountId: null,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      creditCardId: null,
      tags: [],
      notes: input.notes.trim(),
      recurrenceRuleId: null,
      recurrenceOccurrenceKey: null,
      transferId: current?.transferId ?? id,
      installmentGroupId: null,
      cardInvoiceId: null,
    };
  }

  private toInput(transaction: Transaction, changes: Partial<Pick<TransferInput, 'status' | 'paymentDate'>> = {}): TransferInput {
    return {
      fromAccountId: transaction.fromAccountId ?? '',
      toAccountId: transaction.toAccountId ?? '',
      amountCents: transaction.amountCents,
      movementDate: transaction.movementDate,
      paymentDate: changes.paymentDate === undefined ? transaction.paymentDate : changes.paymentDate,
      status: changes.status ?? transaction.status,
      description: transaction.description,
      notes: transaction.notes,
    };
  }

  private async persist(mutator: (current: readonly Transaction[]) => readonly Transaction[]): Promise<void> {
    const saved = await this.persistence.update((current) => ({ ...current, transactions: mutator(current.transactions) }));
    if (!saved) throw new Error(this.persistence.errorMessage() ?? 'Não foi possível salvar a transferência.');
  }
}
