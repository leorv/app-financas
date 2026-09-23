import { Account, Category, Transaction } from './models';
import { calculateAccountBalance } from './account-balance';
import { isCivilDate } from './civil-date';
import { isCardInvoicePayment } from './transaction-rules';

export interface DashboardPeriod {
  readonly from: string;
  readonly to: string;
  readonly previousFrom: string;
  readonly previousTo: string;
}

export interface DashboardPeriodComparison {
  readonly currentCents: number;
  readonly previousCents: number;
  readonly variationPercent: number | null;
}

export interface DashboardExpenseCategory {
  readonly categoryId: string | null;
  readonly name: string;
  readonly color: string;
  readonly icon: string;
  readonly amountCents: number;
  readonly realizedCents: number;
  readonly forecastCents: number;
  readonly percentage: number;
}

export interface DashboardExpenseChartEntry {
  readonly categoryId: string | null;
  readonly name: string;
  readonly color: string;
  readonly amountCents: number;
  readonly percentage: number;
  readonly isOther: boolean;
  readonly details: readonly DashboardExpenseCategory[];
}

export interface DashboardMonthlySeries {
  readonly key: string;
  readonly label: string;
  readonly realizedIncomeCents: number;
  readonly forecastIncomeCents: number;
  readonly realizedExpenseCents: number;
  readonly forecastExpenseCents: number;
}

export interface DashboardBalancePoint {
  readonly key: string;
  readonly label: string;
  readonly realizedBalanceCents: number;
  readonly projectedBalanceCents: number;
}

export interface DashboardDueItem {
  readonly transaction: Transaction;
  readonly categoryName: string;
  readonly accountName: string;
}

export interface DashboardAccountSummary {
  readonly account: Account;
  readonly balanceCents: number;
  readonly periodResultCents: number;
}

export interface DashboardSummary {
  readonly period: DashboardPeriod;
  readonly transactionCount: number;
  readonly balanceCents: number;
  readonly realizedIncomeCents: number;
  readonly realizedExpenseCents: number;
  readonly forecastIncomeCents: number;
  readonly forecastExpenseCents: number;
  readonly realizedResultCents: number;
  readonly projectedResultCents: number;
  readonly accumulatedExpenseCents: number;
  readonly overdueCount: number;
  readonly overdueAmountCents: number;
  readonly overdueItems: readonly DashboardDueItem[];
  readonly upcomingItems: readonly DashboardDueItem[];
  readonly incomeComparison: DashboardPeriodComparison;
  readonly expenseComparison: DashboardPeriodComparison;
  readonly resultComparison: DashboardPeriodComparison;
  readonly expensesByCategory: readonly DashboardExpenseCategory[];
  readonly expenseChart: readonly DashboardExpenseChartEntry[];
  readonly monthlySeries: readonly DashboardMonthlySeries[];
  readonly balanceEvolution: readonly DashboardBalancePoint[];
  readonly accounts: readonly DashboardAccountSummary[];
}

const EMPTY_COLOR = '#7c8d88';
const OTHER_COLOR = '#8b9a96';
const MAX_CHART_CATEGORIES = 5;

export function periodForMonth(month: string): DashboardPeriod {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Informe um mês válido.');
  }
  const from = `${month}-01`;
  if (!isCivilDate(from)) {
    throw new Error('Informe um mês válido.');
  }
  const previousMonth = shiftMonths(month, -1);
  return {
    from,
    to: lastDayOfMonth(month),
    previousFrom: `${previousMonth}-01`,
    previousTo: lastDayOfMonth(previousMonth),
  };
}

export function periodForRange(from: string, to: string): DashboardPeriod {
  if (!isCivilDate(from) || !isCivilDate(to) || from > to) {
    throw new Error('Informe um intervalo de datas válido.');
  }
  const days = daysBetween(from, to) + 1;
  const previousTo = shiftDays(from, -1);
  return {
    from,
    to,
    previousFrom: shiftDays(previousTo, -(days - 1)),
    previousTo,
  };
}

export function consolidateDashboard(
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  categories: readonly Category[],
  period: DashboardPeriod,
  today: string,
): DashboardSummary {
  const currentTransactions = inPeriod(transactions, period.from, period.to);
  const previousTransactions = inPeriod(transactions, period.previousFrom, period.previousTo);
  const currentTotals = summarize(currentTransactions);
  const previousTotals = summarize(previousTransactions);
  const activeAccounts = accounts.filter((account) => !account.archived);
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const expensesByCategory = summarizeCategories(currentTransactions, categoryMap);
  const currentDueTransactions = transactions.filter((transaction) =>
    !transaction.archived && transaction.dueDate !== null && transaction.dueDate >= period.from && transaction.dueDate <= period.to,
  );
  const overdueItems = dueItems(currentDueTransactions, categoryMap, accountMap, (transaction) =>
    isOpen(transaction) && transaction.dueDate !== null && transaction.dueDate < today,
  );
  const upcomingEnd = shiftDays(today, 7);
  const upcomingItems = dueItems(currentDueTransactions, categoryMap, accountMap, (transaction) =>
    isOpen(transaction) && transaction.dueDate !== null && transaction.dueDate >= today && transaction.dueDate <= upcomingEnd,
  );
  const balanceEvolution = buildBalanceEvolution(activeAccounts, transactions, period);
  const accountsSummary = activeAccounts.map((account) => ({
    account,
    balanceCents: calculateAccountBalance(account, transactions),
    periodResultCents: currentTransactions.reduce((total, transaction) => total + accountDelta(transaction, account.id), 0),
  }));

  return {
    period,
    transactionCount: currentTransactions.filter(isIncluded).length,
    balanceCents: accountsSummary.reduce((total, item) => total + item.balanceCents, 0),
    realizedIncomeCents: currentTotals.realizedIncomeCents,
    realizedExpenseCents: currentTotals.realizedExpenseCents,
    forecastIncomeCents: currentTotals.forecastIncomeCents,
    forecastExpenseCents: currentTotals.forecastExpenseCents,
    realizedResultCents: currentTotals.realizedIncomeCents - currentTotals.realizedExpenseCents,
    projectedResultCents: currentTotals.realizedIncomeCents + currentTotals.forecastIncomeCents - currentTotals.realizedExpenseCents - currentTotals.forecastExpenseCents,
    accumulatedExpenseCents: currentTotals.realizedExpenseCents + currentTotals.forecastExpenseCents,
    overdueCount: overdueItems.length,
    overdueAmountCents: overdueItems.reduce((total, item) => total + item.transaction.amountCents, 0),
    overdueItems,
    upcomingItems,
    incomeComparison: comparison(currentTotals.realizedIncomeCents, previousTotals.realizedIncomeCents),
    expenseComparison: comparison(currentTotals.realizedExpenseCents, previousTotals.realizedExpenseCents),
    resultComparison: comparison(currentTotals.realizedIncomeCents - currentTotals.realizedExpenseCents, previousTotals.realizedIncomeCents - previousTotals.realizedExpenseCents),
    expensesByCategory,
    expenseChart: groupSmallCategories(expensesByCategory),
    monthlySeries: buildMonthlySeries(currentTransactions, period),
    balanceEvolution,
    accounts: accountsSummary,
  };
}

export function variationPercent(currentCents: number, previousCents: number): number | null {
  if (previousCents === 0) return currentCents === 0 ? 0 : null;
  return ((currentCents - previousCents) / Math.abs(previousCents)) * 100;
}

function summarize(transactions: readonly Transaction[]): { realizedIncomeCents: number; realizedExpenseCents: number; forecastIncomeCents: number; forecastExpenseCents: number } {
  return transactions.reduce((result, transaction) => {
    if (!isIncluded(transaction)) return result;
    if (transaction.status === 'paid') {
      if (transaction.type === 'income') result.realizedIncomeCents += transaction.amountCents;
      if (transaction.type === 'expense') result.realizedExpenseCents += transaction.amountCents;
    }
    if (transaction.status === 'planned' || transaction.status === 'pending') {
      if (transaction.type === 'income') result.forecastIncomeCents += transaction.amountCents;
      if (transaction.type === 'expense') result.forecastExpenseCents += transaction.amountCents;
    }
    return result;
  }, { realizedIncomeCents: 0, realizedExpenseCents: 0, forecastIncomeCents: 0, forecastExpenseCents: 0 });
}

function summarizeCategories(transactions: readonly Transaction[], categoryMap: ReadonlyMap<string, Category>): DashboardExpenseCategory[] {
  const grouped = new Map<string | null, DashboardExpenseCategory>();
  for (const transaction of transactions) {
    if (!isIncluded(transaction) || transaction.type !== 'expense') continue;
    const category = transaction.categoryId ? categoryMap.get(transaction.categoryId) : undefined;
    const id = category?.id ?? null;
    const existing = grouped.get(id);
    const amountCents = (existing?.amountCents ?? 0) + transaction.amountCents;
    const realizedCents = (existing?.realizedCents ?? 0) + (transaction.status === 'paid' ? transaction.amountCents : 0);
    const forecastCents = (existing?.forecastCents ?? 0) + (transaction.status === 'planned' || transaction.status === 'pending' ? transaction.amountCents : 0);
    grouped.set(id, existing ? { ...existing, amountCents, realizedCents, forecastCents } : {
      categoryId: id,
      name: category?.name ?? 'Sem categoria',
      color: category?.color ?? EMPTY_COLOR,
      icon: category?.icon ?? '•',
      amountCents,
      realizedCents,
      forecastCents,
      percentage: 0,
    });
  }
  const total = [...grouped.values()].reduce((sum, item) => sum + item.amountCents, 0);
  return [...grouped.values()]
    .map((item) => ({ ...item, percentage: total === 0 ? 0 : (item.amountCents / total) * 100 }))
    .sort((left, right) => right.amountCents - left.amountCents || left.name.localeCompare(right.name, 'pt-BR'));
}

function groupSmallCategories(categories: readonly DashboardExpenseCategory[]): DashboardExpenseChartEntry[] {
  const visible = categories.slice(0, MAX_CHART_CATEGORIES);
  const other = categories.slice(MAX_CHART_CATEGORIES);
  const result: DashboardExpenseChartEntry[] = visible.map((item) => ({ ...item, isOther: false, details: [item] }));
  if (other.length > 0) {
    const amountCents = other.reduce((sum, item) => sum + item.amountCents, 0);
    const total = categories.reduce((sum, item) => sum + item.amountCents, 0);
    result.push({
      categoryId: null,
      name: 'Outras',
      color: OTHER_COLOR,
      amountCents,
      percentage: total === 0 ? 0 : (amountCents / total) * 100,
      isOther: true,
      details: other,
    });
  }
  return result;
}

function buildMonthlySeries(transactions: readonly Transaction[], period: DashboardPeriod): DashboardMonthlySeries[] {
  const series: DashboardMonthlySeries[] = [];
  let month = period.from.slice(0, 7);
  const lastMonth = period.to.slice(0, 7);
  while (month <= lastMonth) {
    const monthTransactions = transactions.filter((transaction) => transaction.movementDate.slice(0, 7) === month);
    const totals = summarize(monthTransactions);
    series.push({
      key: month,
      label: new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`)),
      realizedIncomeCents: totals.realizedIncomeCents,
      forecastIncomeCents: totals.forecastIncomeCents,
      realizedExpenseCents: totals.realizedExpenseCents,
      forecastExpenseCents: totals.forecastExpenseCents,
    });
    month = shiftMonths(month, 1);
  }
  return series;
}

function buildBalanceEvolution(accounts: readonly Account[], transactions: readonly Transaction[], period: DashboardPeriod): DashboardBalancePoint[] {
  const useMonths = daysBetween(period.from, period.to) > 62;
  const keys = useMonths ? monthKeys(period.from, period.to) : dateKeys(period.from, period.to);
  let realizedBalance = accounts.reduce((total, account) => total + account.initialBalanceCents, 0);
  for (const transaction of transactions) {
    if (!isPaid(transaction) || balanceDate(transaction) >= period.from) continue;
    realizedBalance += totalTransferAwareDelta(transaction, accounts);
  }
  let projectedBalance = realizedBalance;
  return keys.map((key) => {
    const bucketFrom = useMonths ? `${key}-01` : key;
    const bucketTo = useMonths ? lastDayOfMonth(key) : key;
    const from = bucketFrom < period.from ? period.from : bucketFrom;
    const to = bucketTo > period.to ? period.to : bucketTo;
    const inBucket = transactions.filter((transaction) => {
      const date = balanceDate(transaction);
      return date >= from && date <= to;
    });
    for (const transaction of inBucket) {
      if (isPaid(transaction)) {
        const delta = totalTransferAwareDelta(transaction, accounts);
        realizedBalance += delta;
        projectedBalance += delta;
      } else if (isForecast(transaction)) {
        projectedBalance += totalTransferAwareDelta(transaction, accounts, true);
      }
    }
    return {
      key,
      label: useMonths
        ? new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`))
        : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`)),
      realizedBalanceCents: realizedBalance,
      projectedBalanceCents: projectedBalance,
    };
  });
}

function dueItems(
  transactions: readonly Transaction[],
  categoryMap: ReadonlyMap<string, Category>,
  accountMap: ReadonlyMap<string, Account>,
  predicate: (transaction: Transaction) => boolean,
): DashboardDueItem[] {
  return transactions
    .filter(predicate)
    .sort((left, right) => (left.dueDate ?? '').localeCompare(right.dueDate ?? ''))
    .map((transaction) => ({
      transaction,
      categoryName: transaction.categoryId ? categoryMap.get(transaction.categoryId)?.name ?? 'Sem categoria' : 'Sem categoria',
      accountName: transaction.accountId ? accountMap.get(transaction.accountId)?.name ?? 'Sem conta' : 'Sem conta',
    }));
}

function inPeriod(transactions: readonly Transaction[], from: string, to: string): Transaction[] {
  return transactions.filter((transaction) => !transaction.archived && transaction.movementDate >= from && transaction.movementDate <= to);
}

function isIncluded(transaction: Transaction): boolean {
  return !transaction.archived && transaction.status !== 'cancelled' && !isCardInvoicePayment(transaction) && (transaction.type === 'income' || transaction.type === 'expense');
}

function isOpen(transaction: Transaction): boolean {
  return isIncluded(transaction) && (transaction.status === 'planned' || transaction.status === 'pending');
}

function isPaid(transaction: Transaction): boolean {
  return !transaction.archived && transaction.status === 'paid';
}

function isForecast(transaction: Transaction): boolean {
  return !transaction.archived && (transaction.status === 'planned' || transaction.status === 'pending');
}

function balanceDate(transaction: Transaction): string {
  if (transaction.status === 'paid') return transaction.paymentDate ?? transaction.movementDate;
  return transaction.dueDate ?? transaction.movementDate;
}

function accountDelta(transaction: Transaction, accountId: string, includeForecast = false): number {
  if (includeForecast ? !isForecast(transaction) : !isPaid(transaction)) return 0;
  if (transaction.type === 'income' && transaction.accountId === accountId) return transaction.amountCents;
  if (transaction.type === 'expense' && transaction.accountId === accountId) return -transaction.amountCents;
  if (transaction.type === 'transfer' && transaction.fromAccountId === accountId) return -transaction.amountCents;
  if (transaction.type === 'transfer' && transaction.toAccountId === accountId) return transaction.amountCents;
  return 0;
}

function totalTransferAwareDelta(transaction: Transaction, accounts: readonly Account[], includeForecast = false): number {
  return accounts.reduce((total, account) => total + accountDelta(transaction, account.id, includeForecast), 0);
}

function comparison(currentCents: number, previousCents: number): DashboardPeriodComparison {
  return { currentCents, previousCents, variationPercent: variationPercent(currentCents, previousCents) };
}

function dateKeys(from: string, to: string): string[] {
  const result: string[] = [];
  for (let date = from; date <= to; date = shiftDays(date, 1)) result.push(date);
  return result;
}

function monthKeys(from: string, to: string): string[] {
  const result: string[] = [];
  for (let month = from.slice(0, 7); month <= to.slice(0, 7); month = shiftMonths(month, 1)) result.push(month);
  return result;
}

function lastDayOfMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${year}-${String(monthNumber).padStart(2, '0')}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, '0')}`;
}

function shiftDays(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function shiftMonths(value: string, amount: number): string {
  const [year, month] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
