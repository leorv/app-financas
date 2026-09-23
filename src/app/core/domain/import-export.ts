import { formatCivilDate } from './civil-date';
import {
  Account,
  CURRENT_SCHEMA_VERSION,
  DatabaseSnapshot,
  PAYMENT_METHOD_LABELS,
  Transaction,
  TRANSACTION_STATUS_LABELS,
} from './models';
import { filterTransactions, TransactionFilter } from './transaction-rules';
import { validateSnapshot } from './snapshot-validator';

export const BACKUP_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;
export const MAX_BACKUP_FILE_BYTES = 10 * 1024 * 1024;

export interface BackupSummary {
  readonly totalRecords: number;
  readonly accounts: number;
  readonly creditCards: number;
  readonly cardPurchases: number;
  readonly cardInvoices: number;
  readonly categories: number;
  readonly transactions: number;
  readonly budgets: number;
  readonly goals: number;
  readonly goalContributions: number;
  readonly recurrenceRules: number;
  readonly period: { readonly from: string; readonly to: string } | null;
  readonly warnings: readonly string[];
}

export interface DownloadableTextFile {
  readonly fileName: string;
  readonly content: string;
  readonly mimeType: string;
}

export interface BackupDocument extends DownloadableTextFile {
  readonly snapshot: DatabaseSnapshot;
  readonly summary: BackupSummary;
}

export interface CsvExport extends DownloadableTextFile {
  readonly rowCount: number;
}

const CSV_HEADERS = [
  'Descrição',
  'Tipo',
  'Valor (BRL)',
  'Data de competência',
  'Vencimento',
  'Pagamento',
  'Situação',
  'Categoria',
  'Conta',
  'Forma de pagamento',
  'Tags',
  'Observações',
] as const;

const TRANSACTION_TYPE_LABELS: Record<Transaction['type'], string> = {
  income: 'Receita',
  expense: 'Despesa',
  transfer: 'Transferência',
};

export function createBackupDocument(snapshot: DatabaseSnapshot, now = new Date()): BackupDocument {
  if (Number.isNaN(now.getTime())) {
    throw new Error('Não foi possível gerar a data do backup.');
  }
  const normalized: DatabaseSnapshot = {
    ...snapshot,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: snapshot.settings.appVersion,
    exportedAt: now.toISOString(),
    settings: { ...snapshot.settings, schemaVersion: BACKUP_SCHEMA_VERSION, appVersion: snapshot.settings.appVersion },
  };
  const validation = validateSnapshot(normalized);
  if (!validation.valid) {
    throw new Error(`Não foi possível exportar os dados: ${validation.error}`);
  }
  return {
    fileName: formatBackupFilename(now),
    content: JSON.stringify(validation.snapshot, null, 2),
    mimeType: 'application/json;charset=utf-8',
    snapshot: validation.snapshot,
    summary: summarizeSnapshot(validation.snapshot),
  };
}

export function summarizeSnapshot(snapshot: DatabaseSnapshot): BackupSummary {
  const counts = {
    accounts: snapshot.accounts.length,
    creditCards: snapshot.creditCards.length,
    cardPurchases: snapshot.cardPurchases.length,
    cardInvoices: snapshot.cardInvoices.length,
    categories: snapshot.categories.length,
    transactions: snapshot.transactions.length,
    budgets: snapshot.budgets.length,
    goals: snapshot.goals.length,
    goalContributions: snapshot.goalContributions.length,
    recurrenceRules: snapshot.recurrenceRules.length,
  };
  const archivedCount = [
    ...snapshot.accounts,
    ...snapshot.creditCards,
    ...snapshot.cardPurchases,
    ...snapshot.cardInvoices,
    ...snapshot.categories,
    ...snapshot.transactions,
    ...snapshot.budgets,
    ...snapshot.goals,
    ...snapshot.goalContributions,
    ...snapshot.recurrenceRules,
  ].filter((record) => record.archived).length;
  const cancelledCount = snapshot.transactions.filter((transaction) => transaction.status === 'cancelled').length;
  const dates = snapshot.transactions.map((transaction) => transaction.movementDate).sort();
  const warnings: string[] = [];
  if (archivedCount > 0) {
    warnings.push(`${archivedCount} registro(s) arquivado(s) serão preservados para o histórico.`);
  }
  if (cancelledCount > 0) {
    warnings.push(`${cancelledCount} movimentação(ões) cancelada(s) serão preservadas, mas não entram nos totais.`);
  }
  return {
    ...counts,
    totalRecords: Object.values(counts).reduce((total, count) => total + count, 0),
    period: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    warnings,
  };
}

export function createTransactionsCsv(
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  categories: DatabaseSnapshot['categories'],
  now = new Date(),
): CsvExport {
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const rows = transactions.map((transaction) => [
    transaction.description,
    TRANSACTION_TYPE_LABELS[transaction.type],
    formatCentsForCsv(transaction.amountCents),
    formatCsvDate(transaction.movementDate),
    formatCsvDate(transaction.dueDate),
    formatCsvDate(transaction.paymentDate),
    TRANSACTION_STATUS_LABELS[transaction.status],
    transaction.type === 'transfer' ? 'Transferência' : (categoryNames.get(transaction.categoryId ?? '') ?? 'Sem categoria'),
    accountLabelForCsv(transaction, accountNames),
    PAYMENT_METHOD_LABELS[transaction.paymentMethod],
    transaction.tags.join(', '),
    transaction.notes,
  ]);
  const lines = [CSV_HEADERS, ...rows].map((row) => row.map(escapeCsv).join(';'));
  const content = `\uFEFF${lines.join('\r\n')}\r\n`;
  return {
    fileName: formatTransactionsFilename(now),
    content,
    mimeType: 'text/csv;charset=utf-8',
    rowCount: transactions.length,
  };
}

export function formatBackupFilename(now: Date): string {
  return `financas-backup-${formatLocalDateTime(now)}.json`;
}

export function formatTransactionsFilename(now: Date): string {
  return `financas-movimentacoes-${formatLocalDateTime(now)}.csv`;
}

export function filterTransactionsForCsv(snapshot: DatabaseSnapshot, filter: TransactionFilter): CsvExport {
  const filtered = filterTransactions(snapshot.transactions, filter);
  return createTransactionsCsv(filtered, snapshot.accounts, snapshot.categories);
}

export function snapshotsHaveSameData(left: DatabaseSnapshot, right: DatabaseSnapshot): boolean {
  return stableSerialize(snapshotWithoutVolatileMetadata(left)) === stableSerialize(snapshotWithoutVolatileMetadata(right));
}

function snapshotWithoutVolatileMetadata(snapshot: DatabaseSnapshot): unknown {
  return {
    schemaVersion: snapshot.schemaVersion,
    appVersion: snapshot.appVersion,
    settings: { ...snapshot.settings, updatedAt: '' },
    accounts: sortById(snapshot.accounts),
    creditCards: sortById(snapshot.creditCards),
    cardPurchases: sortById(snapshot.cardPurchases),
    cardInvoices: sortById(snapshot.cardInvoices),
    categories: sortById(snapshot.categories),
    transactions: sortById(snapshot.transactions),
    budgets: sortById(snapshot.budgets),
    goals: sortById(snapshot.goals),
    goalContributions: sortById(snapshot.goalContributions),
    recurrenceRules: sortById(snapshot.recurrenceRules),
  };
}

function sortById<T extends { readonly id: string }>(records: readonly T[]): T[] {
  return records.slice().sort((left, right) => left.id.localeCompare(right.id));
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function accountLabelForCsv(transaction: Transaction, accounts: ReadonlyMap<string, string>): string {
  if (transaction.type === 'transfer') {
    const from = accounts.get(transaction.fromAccountId ?? '') ?? 'Conta não encontrada';
    const to = accounts.get(transaction.toAccountId ?? '') ?? 'Conta não encontrada';
    return `${from} → ${to}`;
  }
  return accounts.get(transaction.accountId ?? '') ?? 'Sem conta';
}

function formatCentsForCsv(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

function formatCsvDate(value: string | null): string {
  return value ? formatCivilDate(value) : '';
}

function escapeCsv(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function formatLocalDateTime(now: Date): string {
  if (Number.isNaN(now.getTime())) {
    throw new Error('Não foi possível gerar o nome do arquivo.');
  }
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${date}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
