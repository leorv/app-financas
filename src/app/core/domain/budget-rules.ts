import { isCivilDate } from './civil-date';
import { Budget, BudgetAlertBand, BudgetCommitmentPolicy, Transaction } from './models';
import { isCardInvoicePayment } from './transaction-rules';

export const DEFAULT_BUDGET_COMMITMENT_POLICY: BudgetCommitmentPolicy = 'planned-and-pending';
export const DEFAULT_BUDGET_ALERT_THRESHOLDS = { attentionPercent: 80, warningPercent: 100 } as const;
export const BUDGET_CARD_COMPETENCE_POLICY = 'invoice-competence' as const;

export interface BudgetMetric {
  readonly budget: Budget;
  readonly realizedCents: number;
  readonly committedCents: number;
  readonly availableCents: number;
  readonly usedPercent: number;
  readonly alertBand: BudgetAlertBand;
}

export interface BudgetCategorySpending {
  readonly categoryId: string | null;
  readonly realizedCents: number;
  readonly committedCents: number;
  readonly hasBudget: boolean;
}

export interface BudgetSummary {
  readonly month: string;
  readonly totalBudget: Budget | null;
  readonly totalMetric: BudgetMetric | null;
  readonly totalRealizedCents: number;
  readonly totalCommittedCents: number;
  readonly unbudgetedRealizedCents: number;
  readonly unbudgetedCommittedCents: number;
  readonly categoryMetrics: readonly BudgetMetric[];
  readonly spendingByCategory: readonly BudgetCategorySpending[];
  readonly alerts: readonly BudgetMetric[];
}

export interface BudgetDraft {
  readonly month: string;
  readonly categoryId: string | null;
  readonly amountCents: number;
  readonly commitmentPolicy: BudgetCommitmentPolicy;
  readonly alertThresholds: {
    readonly attentionPercent: number;
    readonly warningPercent: number;
  };
}

export function isBudgetMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value) && isCivilDate(`${value}-01`);
}

export function budgetMonthPeriod(month: string): { readonly from: string; readonly to: string } {
  assertBudgetMonth(month);
  const [year, numericMonth] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, numericMonth, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

export function previousBudgetMonth(month: string): string {
  assertBudgetMonth(month);
  const [year, numericMonth] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, numericMonth - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function calculateBudgetMetric(
  budget: Budget,
  transactions: readonly Transaction[],
): BudgetMetric {
  const tracked = transactions.filter((transaction) => matchesBudget(transaction, budget));
  const realizedCents = tracked
    .filter((transaction) => transaction.status === 'paid')
    .reduce((total, transaction) => total + transaction.amountCents, 0);
  const committedCents = tracked
    .filter((transaction) => isCommitted(transaction, budget.commitmentPolicy))
    .reduce((total, transaction) => total + transaction.amountCents, 0);
  return createMetric(budget, realizedCents, committedCents);
}

export function summarizeBudgets(
  transactions: readonly Transaction[],
  budgets: readonly Budget[],
  month: string,
): BudgetSummary {
  assertBudgetMonth(month);
  const activeBudgets = budgets.filter((budget) => !budget.archived && budget.month === month);
  const totalBudget = activeBudgets.find((budget) => budget.categoryId === null) ?? null;
  const categoryBudgets = activeBudgets.filter((budget) => budget.categoryId !== null);
  const totalRealizedCents = sumExpense(transactions, month, undefined, 'paid');
  const totalCommittedCents = sumExpense(
    transactions,
    month,
    undefined,
    totalBudget?.commitmentPolicy ?? DEFAULT_BUDGET_COMMITMENT_POLICY,
  );
  const totalMetric = totalBudget ? createMetric(totalBudget, totalRealizedCents, totalCommittedCents) : null;
  const categoryMetrics = categoryBudgets.map((budget) => calculateBudgetMetric(budget, transactions));
  const spendingByCategory = collectCategorySpending(transactions, month, categoryBudgets, totalBudget);
  const unbudgetedRealizedCents = spendingByCategory
    .filter((item) => !item.hasBudget)
    .reduce((total, item) => total + item.realizedCents, 0);
  const unbudgetedCommittedCents = spendingByCategory
    .filter((item) => !item.hasBudget)
    .reduce((total, item) => total + item.committedCents, 0);
  const alerts = [
    ...(totalMetric && totalMetric.alertBand !== 'none' ? [totalMetric] : []),
    ...categoryMetrics.filter((metric) => metric.alertBand !== 'none'),
  ];
  return {
    month,
    totalBudget,
    totalMetric,
    totalRealizedCents,
    totalCommittedCents,
    unbudgetedRealizedCents,
    unbudgetedCommittedCents,
    categoryMetrics,
    spendingByCategory,
    alerts,
  };
}

export function copyBudgetMonth(
  budgets: readonly Budget[],
  sourceMonth: string,
  targetMonth: string,
): readonly BudgetDraft[] {
  assertBudgetMonth(sourceMonth);
  assertBudgetMonth(targetMonth);
  if (sourceMonth === targetMonth) throw new Error('Escolha um mês diferente para copiar o orçamento.');
  return budgets
    .filter((budget) => !budget.archived && budget.month === sourceMonth)
    .map((budget) => ({
      month: targetMonth,
      categoryId: budget.categoryId,
      amountCents: budget.amountCents,
      commitmentPolicy: budget.commitmentPolicy,
      alertThresholds: { ...budget.alertThresholds },
    }));
}

export function budgetAlertBand(usedPercent: number, budget: Pick<Budget, 'amountCents' | 'alertThresholds'>): BudgetAlertBand {
  if (budget.amountCents === 0) return usedPercent > 0 ? 'exceeded' : 'none';
  if (usedPercent > 100) return 'exceeded';
  if (usedPercent >= budget.alertThresholds.warningPercent) return 'warning';
  if (usedPercent >= budget.alertThresholds.attentionPercent) return 'attention';
  return 'none';
}

export function matchesBudget(transaction: Transaction, budget: Pick<Budget, 'month' | 'categoryId'>): boolean {
  return isTrackedExpense(transaction) &&
    transaction.movementDate.slice(0, 7) === budget.month &&
    (budget.categoryId === null || transaction.categoryId === budget.categoryId);
}

function createMetric(budget: Budget, realizedCents: number, committedCents: number): BudgetMetric {
  const usedPercent = budget.amountCents === 0
    ? (committedCents === 0 ? 0 : Number.POSITIVE_INFINITY)
    : (committedCents / budget.amountCents) * 100;
  return {
    budget,
    realizedCents,
    committedCents,
    availableCents: budget.amountCents - committedCents,
    usedPercent,
    alertBand: budgetAlertBand(usedPercent, budget),
  };
}

function collectCategorySpending(
  transactions: readonly Transaction[],
  month: string,
  categoryBudgets: readonly Budget[],
  totalBudget: Budget | null,
): BudgetCategorySpending[] {
  const categoryIds = new Set<string | null>();
  for (const transaction of transactions) {
    if (isTrackedExpense(transaction) && transaction.movementDate.slice(0, 7) === month) categoryIds.add(transaction.categoryId);
  }
  for (const budget of categoryBudgets) categoryIds.add(budget.categoryId);
  return [...categoryIds]
    .map((categoryId) => {
      const budget = categoryBudgets.find((item) => item.categoryId === categoryId);
      const policy = budget?.commitmentPolicy ?? totalBudget?.commitmentPolicy ?? DEFAULT_BUDGET_COMMITMENT_POLICY;
      return {
        categoryId,
        realizedCents: sumExpense(transactions, month, categoryId, 'paid'),
        committedCents: sumExpense(transactions, month, categoryId, policy),
        hasBudget: budget !== undefined,
      };
    })
    .sort((left, right) => right.committedCents - left.committedCents);
}

function sumExpense(
  transactions: readonly Transaction[],
  month: string,
  categoryId: string | null | undefined,
  mode: 'paid' | BudgetCommitmentPolicy,
): number {
  return transactions
    .filter((transaction) => isTrackedExpense(transaction) && transaction.movementDate.slice(0, 7) === month &&
      (categoryId === undefined || transaction.categoryId === categoryId))
    .filter((transaction) => mode === 'paid' ? transaction.status === 'paid' : isCommitted(transaction, mode))
    .reduce((total, transaction) => total + transaction.amountCents, 0);
}

function isTrackedExpense(transaction: Transaction): boolean {
  return !transaction.archived && transaction.status !== 'cancelled' && transaction.type === 'expense' && !isCardInvoicePayment(transaction);
}

function isCommitted(transaction: Transaction, policy: BudgetCommitmentPolicy): boolean {
  if (transaction.status === 'paid') return true;
  if (policy === 'realized-only') return false;
  if (transaction.status === 'pending') return true;
  return policy === 'planned-and-pending' && transaction.status === 'planned';
}

function assertBudgetMonth(month: string): void {
  if (!isBudgetMonth(month)) throw new Error('Informe um mês de orçamento válido.');
}
