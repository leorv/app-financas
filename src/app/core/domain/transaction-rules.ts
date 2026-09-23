import { Transaction, TransactionStatus, TransactionType, PaymentMethod } from './models';

export type TransactionSortField = 'movementDate' | 'dueDate' | 'amount' | 'description';

export interface TransactionFilter {
  readonly movementFrom: string | null;
  readonly movementTo: string | null;
  readonly dueFrom: string | null;
  readonly dueTo: string | null;
  readonly type: TransactionType | 'all';
  readonly status: TransactionStatus | 'all';
  readonly categoryId: string | null;
  readonly categoryIds: readonly string[];
  readonly uncategorized: boolean;
  readonly accountId: string | null;
  readonly openOnly: boolean;
  readonly paymentMethod: PaymentMethod | 'all';
  readonly search: string;
  readonly tag: string;
  readonly sortBy: TransactionSortField;
  readonly sortDirection: 'asc' | 'desc';
}

export interface TransactionTotals {
  readonly count: number;
  readonly realizedIncomeCents: number;
  readonly realizedExpenseCents: number;
  readonly forecastIncomeCents: number;
  readonly forecastExpenseCents: number;
  readonly netRealizedCents: number;
  readonly netForecastCents: number;
}

export interface TransactionPage {
  readonly items: readonly Transaction[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

export const EMPTY_TRANSACTION_FILTER: TransactionFilter = {
  movementFrom: null,
  movementTo: null,
  dueFrom: null,
  dueTo: null,
  type: 'all',
  status: 'all',
  categoryId: null,
  categoryIds: [],
  uncategorized: false,
  accountId: null,
  openOnly: false,
  paymentMethod: 'all',
  search: '',
  tag: '',
  sortBy: 'movementDate',
  sortDirection: 'desc',
};

export function filterTransactions(transactions: readonly Transaction[], filter: TransactionFilter): Transaction[] {
  const search = filter.search.trim().toLocaleLowerCase('pt-BR');
  const tag = filter.tag.trim().toLocaleLowerCase('pt-BR');
  return transactions
    .filter((transaction) => !transaction.archived)
    .filter((transaction) => filter.type === 'all' || transaction.type === filter.type)
    .filter((transaction) => filter.status === 'all' || transaction.status === filter.status)
    .filter((transaction) => filter.categoryId === null || transaction.categoryId === filter.categoryId)
    .filter((transaction) => filter.categoryIds.length === 0 || (transaction.categoryId !== null && filter.categoryIds.includes(transaction.categoryId)) || (filter.uncategorized && transaction.categoryId === null))
    .filter((transaction) => !filter.uncategorized || filter.categoryIds.length > 0 || transaction.categoryId === null)
    .filter((transaction) => filter.accountId === null || transaction.accountId === filter.accountId)
    .filter((transaction) => !filter.openOnly || (transaction.status === 'planned' || transaction.status === 'pending'))
    .filter((transaction) => filter.paymentMethod === 'all' || transaction.paymentMethod === filter.paymentMethod)
    .filter((transaction) => inRange(transaction.movementDate, filter.movementFrom, filter.movementTo))
    .filter((transaction) => inRange(transaction.dueDate, filter.dueFrom, filter.dueTo))
    .filter((transaction) => !tag || transaction.tags.some((item) => item.toLocaleLowerCase('pt-BR').includes(tag)))
    .filter((transaction) => {
      if (!search) return true;
      const haystack = [transaction.description, transaction.notes, ...transaction.tags].join(' ').toLocaleLowerCase('pt-BR');
      return haystack.includes(search);
    })
    .sort((left, right) => compareTransactions(left, right, filter));
}

export function paginateTransactions(transactions: readonly Transaction[], filter: TransactionFilter, page: number, pageSize: number): TransactionPage {
  const filtered = filterTransactions(transactions, filter);
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(filtered.length / safePageSize));
  const safePage = Math.min(Math.max(1, Math.floor(page)), totalPages);
  const start = (safePage - 1) * safePageSize;
  return { items: filtered.slice(start, start + safePageSize), total: filtered.length, page: safePage, pageSize: safePageSize, totalPages };
}

export function calculateTransactionTotals(transactions: readonly Transaction[]): TransactionTotals {
  const totals = transactions.reduce((result, transaction) => {
    if (transaction.archived || transaction.status === 'cancelled' || transaction.type === 'transfer' || isCardInvoicePayment(transaction)) return result;
    if (transaction.status === 'paid') {
      if (transaction.type === 'income') result.realizedIncomeCents += transaction.amountCents;
      if (transaction.type === 'expense') result.realizedExpenseCents += transaction.amountCents;
    } else if (transaction.status === 'planned' || transaction.status === 'pending') {
      if (transaction.type === 'income') result.forecastIncomeCents += transaction.amountCents;
      if (transaction.type === 'expense') result.forecastExpenseCents += transaction.amountCents;
    }
    return result;
  }, { count: 0, realizedIncomeCents: 0, realizedExpenseCents: 0, forecastIncomeCents: 0, forecastExpenseCents: 0, netRealizedCents: 0, netForecastCents: 0 });
  totals.count = transactions.filter((transaction) => !transaction.archived && transaction.status !== 'cancelled' && transaction.type !== 'transfer' && !isCardInvoicePayment(transaction)).length;
  totals.netRealizedCents = totals.realizedIncomeCents - totals.realizedExpenseCents;
  totals.netForecastCents = totals.forecastIncomeCents - totals.forecastExpenseCents;
  return totals;
}

export function transactionAffectsBalance(transaction: Pick<Transaction, 'status' | 'archived'>): boolean {
  return !transaction.archived && transaction.status === 'paid';
}

export function isCardInvoicePayment(transaction: Pick<Transaction, 'cardInvoiceId' | 'creditCardId'>): boolean {
  return transaction.cardInvoiceId != null && transaction.creditCardId === null;
}

export function canDeleteTransaction(transaction: Pick<Transaction, 'recurrenceRuleId' | 'transferId' | 'installmentGroupId'> & Partial<Pick<Transaction, 'cardInvoiceId'>>): boolean {
  return transaction.recurrenceRuleId === null && transaction.transferId === null && transaction.installmentGroupId === null && transaction.cardInvoiceId == null;
}

export function normalizeTags(value: string | readonly string[]): string[] {
  const raw = typeof value === 'string' ? value.split(',') : value;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const tag = item.trim().replace(/\s+/g, ' ');
    const normalized = tag.toLocaleLowerCase('pt-BR');
    if (tag && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(tag);
    }
  }
  return result.slice(0, 20);
}

function inRange(value: string | null, from: string | null, to: string | null): boolean {
  if (from !== null && (value === null || value < from)) return false;
  if (to !== null && (value === null || value > to)) return false;
  return true;
}

function compareTransactions(left: Transaction, right: Transaction, filter: TransactionFilter): number {
  let result: number;
  if (filter.sortBy === 'amount') result = left.amountCents - right.amountCents;
  else if (filter.sortBy === 'description') result = left.description.localeCompare(right.description, 'pt-BR');
  else if (filter.sortBy === 'dueDate') result = (left.dueDate ?? '9999-99-99').localeCompare(right.dueDate ?? '9999-99-99');
  else result = left.movementDate.localeCompare(right.movementDate);
  if (result === 0) result = left.updatedAt.localeCompare(right.updatedAt);
  return filter.sortDirection === 'asc' ? result : -result;
}
