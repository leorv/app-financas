import { isCivilDate } from './civil-date';
import { Transaction, TransactionStatus } from './models';

export interface TransferDraft {
  readonly fromAccountId: string;
  readonly toAccountId: string;
  readonly amountCents: number;
  readonly movementDate: string;
  readonly paymentDate: string | null;
  readonly status: TransactionStatus;
  readonly description: string;
  readonly notes: string;
}

export function validateTransferDraft(input: TransferDraft): void {
  if (!input.fromAccountId || !input.toAccountId || input.fromAccountId === input.toAccountId) {
    throw new Error('Escolha contas de origem e destino diferentes.');
  }
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error('O valor da transferência deve ser maior que zero.');
  }
  if (!isCivilDate(input.movementDate)) {
    throw new Error('Informe uma data de transferência válida.');
  }
  if (input.status === 'paid' && input.paymentDate !== null && !isCivilDate(input.paymentDate)) {
    throw new Error('Informe uma data de pagamento válida.');
  }
  if (input.status !== 'paid' && input.paymentDate !== null) {
    throw new Error('Transferências não pagas não podem ter data de pagamento.');
  }
  if (!['planned', 'pending', 'paid', 'cancelled'].includes(input.status)) {
    throw new Error('A situação da transferência é inválida.');
  }
  if (input.description.trim().length > 140) {
    throw new Error('A descrição deve ter no máximo 140 caracteres.');
  }
}

export function transferAccountDelta(transaction: Pick<Transaction, 'type' | 'status' | 'amountCents' | 'fromAccountId' | 'toAccountId'>, accountId: string): number {
  if (transaction.type !== 'transfer' || transaction.status !== 'paid') return 0;
  if (transaction.fromAccountId === accountId) return -transaction.amountCents;
  if (transaction.toAccountId === accountId) return transaction.amountCents;
  return 0;
}

export function transferPreservesConsolidatedTotal(transaction: Pick<Transaction, 'type' | 'amountCents' | 'fromAccountId' | 'toAccountId'>): boolean {
  return transaction.type === 'transfer' && transaction.fromAccountId !== null && transaction.toAccountId !== null;
}

export function isTransfer(transaction: Pick<Transaction, 'type'>): boolean {
  return transaction.type === 'transfer';
}
