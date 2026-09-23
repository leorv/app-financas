import { formatCivilDate, isCivilDate, todayCivilDate, utcNow } from './civil-date';
import { consolidateDashboard, periodForRange } from './dashboard-rules';
import { formatCents, formatSignedCents } from './money';
import {
  Account,
  BUDGET_COMMITMENT_POLICY_LABELS,
  Budget,
  Category,
  CREDIT_CARD_INVOICE_STATUS_LABELS,
  CreditCard,
  CreditCardInvoice,
  DatabaseSnapshot,
  TRANSACTION_STATUS_LABELS,
  Transaction,
  TransactionStatus,
} from './models';
import { summarizeBudgets } from './budget-rules';
import { isCardInvoicePayment } from './transaction-rules';

export type ReportType =
  | 'monthly-summary'
  | 'transactions'
  | 'category-expenses'
  | 'account-statement'
  | 'card-invoice'
  | 'budget-vs-realized';

export type ReportOrientation = 'portrait' | 'landscape';

export type ReportSectionKey =
  | 'summary'
  | 'categories'
  | 'accounts'
  | 'cards'
  | 'budgets'
  | 'transactions'
  | 'due'
  | 'top-expenses'
  | 'chart';

export interface ReportConfig {
  readonly type: ReportType;
  readonly from: string;
  readonly to: string;
  readonly accountId: string | null;
  readonly creditCardId: string | null;
  readonly categoryId: string | null;
  readonly statuses: readonly TransactionStatus[];
  readonly includeForecast: boolean;
  readonly showSensitiveBalances: boolean;
  readonly orientation: ReportOrientation;
  readonly sections: readonly ReportSectionKey[];
}

export interface ReportFilters {
  readonly period: string;
  readonly account: string;
  readonly card: string;
  readonly category: string;
  readonly statuses: string;
  readonly forecast: string;
  readonly balances: string;
}

export interface ReportMetric {
  readonly label: string;
  readonly value: string;
  readonly valueCents?: number;
  readonly kind: 'money' | 'number' | 'text';
}

export interface ReportTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface ReportSection {
  readonly key: ReportSectionKey;
  readonly title: string;
  readonly description: string;
  readonly metrics: readonly ReportMetric[];
  readonly table: ReportTable | null;
  readonly emptyMessage: string | null;
}

export interface ReportChartEntry {
  readonly label: string;
  readonly valueCents: number;
  readonly percentage: number;
  readonly color: string;
}

export interface ReportChartModel {
  readonly title: string;
  readonly alternativeText: string;
  readonly entries: readonly ReportChartEntry[];
}

export interface ReportSummary {
  readonly transactionCount: number;
  readonly realizedIncomeCents: number;
  readonly realizedExpenseCents: number;
  readonly realizedResultCents: number;
  readonly forecastIncomeCents: number;
  readonly forecastExpenseCents: number;
  readonly projectedResultCents: number;
  readonly currentBalanceCents: number | null;
  readonly initialBalanceCents: number | null;
  readonly finalBalanceCents: number | null;
  readonly projectedBalanceCents: number | null;
}

export interface ReportModel {
  readonly type: ReportType;
  readonly title: string;
  readonly period: { readonly from: string; readonly to: string };
  readonly generatedAt: string;
  readonly generatedAtLabel: string;
  readonly currency: 'BRL';
  readonly orientation: ReportOrientation;
  readonly showSensitiveBalances: boolean;
  readonly filters: ReportFilters;
  readonly summary: ReportSummary;
  readonly sections: readonly ReportSection[];
  readonly chart: ReportChartModel | null;
  readonly warnings: readonly string[];
  readonly transactionCount: number;
  readonly isEmpty: boolean;
  readonly fileName: string;
}

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  'monthly-summary': 'Resumo financeiro mensal',
  transactions: 'Movimentações filtradas',
  'category-expenses': 'Despesas por categoria',
  'account-statement': 'Extrato de conta',
  'card-invoice': 'Faturas de cartão',
  'budget-vs-realized': 'Orçado x realizado',
};

export const REPORT_SECTION_LABELS: Record<ReportSectionKey, string> = {
  summary: 'Resumo e indicadores',
  categories: 'Categorias',
  accounts: 'Contas e saldos',
  cards: 'Cartões e faturas',
  budgets: 'Orçamentos',
  transactions: 'Movimentações',
  due: 'Pendências e vencimentos',
  'top-expenses': 'Maiores despesas',
  chart: 'Gráfico de despesas',
};

export const REPORT_STATUS_OPTIONS: readonly TransactionStatus[] = ['paid', 'pending', 'planned'];

export const DEFAULT_REPORT_SECTIONS: readonly ReportSectionKey[] = [
  'summary',
  'categories',
  'accounts',
  'cards',
  'budgets',
  'transactions',
  'due',
  'top-expenses',
  'chart',
];

const REPORT_TYPES = Object.keys(REPORT_TYPE_LABELS) as ReportType[];
const REPORT_SECTIONS = Object.keys(REPORT_SECTION_LABELS) as ReportSectionKey[];

export function buildReportModel(
  snapshot: DatabaseSnapshot,
  config: ReportConfig,
  generatedAt = utcNow(),
): ReportModel {
  validateReportConfig(snapshot, config);
  if (!isValidGeneratedAt(generatedAt)) throw new Error('A data de geração do relatório é inválida.');

  const period = periodForRange(config.from, config.to);
  const today = todayCivilDate(new Date(generatedAt));
  const matchingTransactions = snapshot.transactions.filter((transaction) => matchesReportFilters(transaction, snapshot, config));
  const periodTransactions = matchingTransactions.filter((transaction) => transaction.movementDate >= config.from && transaction.movementDate <= config.to);
  const accounts = snapshot.accounts.filter((account) => !account.archived && (config.accountId === null || account.id === config.accountId));
  const categories = snapshot.categories;
  const dashboard = consolidateDashboard(matchingTransactions, accounts, categories, period, today);
  const summary: ReportSummary = {
    transactionCount: dashboard.transactionCount,
    realizedIncomeCents: dashboard.realizedIncomeCents,
    realizedExpenseCents: dashboard.realizedExpenseCents,
    realizedResultCents: dashboard.realizedResultCents,
    forecastIncomeCents: config.includeForecast ? dashboard.forecastIncomeCents : 0,
    forecastExpenseCents: config.includeForecast ? dashboard.forecastExpenseCents : 0,
    projectedResultCents: config.includeForecast ? dashboard.projectedResultCents : dashboard.realizedResultCents,
    currentBalanceCents: config.showSensitiveBalances ? dashboard.balanceCents : null,
    initialBalanceCents: config.showSensitiveBalances ? balanceAt(accounts, matchingTransactions, config.from, false) : null,
    finalBalanceCents: config.showSensitiveBalances ? balanceAt(accounts, matchingTransactions, config.to, false) : null,
    projectedBalanceCents: config.showSensitiveBalances && config.includeForecast ? balanceAt(accounts, matchingTransactions, config.to, true) : null,
  };

  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const accountMap = new Map(snapshot.accounts.map((account) => [account.id, account]));
  const cardMap = new Map(snapshot.creditCards.map((card) => [card.id, card]));
  const invoices = matchingInvoices(snapshot, config);
  const budgetsByMonth = budgetSummaries(snapshot.budgets, matchingTransactions, config.from, config.to, categoryMap);
  const chart = createChartModel(dashboard.expenseChart);
  const sections = buildSections({
    snapshot,
    config,
    summary,
    dashboard,
    periodTransactions,
    categoryMap,
    accountMap,
    cardMap,
    invoices,
    budgetsByMonth,
    chart,
  });

  const isEmpty = hasNoRelevantContent(config.type, periodTransactions, invoices, budgetsByMonth, dashboard);
  const warnings = isEmpty
    ? ['Não há dados compatíveis com o período e os filtros escolhidos. Ajuste os filtros ou cadastre uma movimentação.']
    : [];
  return {
    type: config.type,
    title: REPORT_TYPE_LABELS[config.type],
    period: { from: config.from, to: config.to },
    generatedAt,
    generatedAtLabel: formatGeneratedAt(generatedAt),
    currency: 'BRL',
    orientation: config.orientation,
    showSensitiveBalances: config.showSensitiveBalances,
    filters: createFilters(snapshot, config),
    summary,
    sections,
    chart,
    warnings,
    transactionCount: periodTransactions.length,
    isEmpty,
    fileName: reportFileName(config.type, config.from, config.to),
  };
}

function hasNoRelevantContent(
  type: ReportType,
  periodTransactions: readonly Transaction[],
  invoices: readonly CreditCardInvoice[],
  budgetsByMonth: readonly BudgetMonthRows[],
  dashboard: ReturnType<typeof consolidateDashboard>,
): boolean {
  if (type === 'category-expenses') return dashboard.expensesByCategory.length === 0;
  if (type === 'card-invoice') return invoices.length === 0;
  if (type === 'budget-vs-realized') return budgetsByMonth.every((item) => item.rows.length === 0);
  if (type === 'account-statement') return periodTransactions.length === 0 && dashboard.accounts.length === 0;
  return periodTransactions.length === 0 && invoices.length === 0 && budgetsByMonth.every((item) => item.rows.length === 0);
}

export function validateReportConfig(snapshot: DatabaseSnapshot, config: ReportConfig): void {
  if (!REPORT_TYPES.includes(config.type)) throw new Error('Escolha um tipo de relatório válido.');
  if (!isCivilDate(config.from) || !isCivilDate(config.to) || config.from > config.to) {
    throw new Error('Informe um período de relatório válido.');
  }
  if (config.accountId !== null && !snapshot.accounts.some((account) => account.id === config.accountId)) {
    throw new Error('A conta selecionada não existe mais.');
  }
  if (config.creditCardId !== null && !snapshot.creditCards.some((card) => card.id === config.creditCardId)) {
    throw new Error('O cartão selecionado não existe mais.');
  }
  if (config.categoryId !== null && !snapshot.categories.some((category) => category.id === config.categoryId)) {
    throw new Error('A categoria selecionada não existe mais.');
  }
  if (config.statuses.length === 0 || config.statuses.some((status) => !REPORT_STATUS_OPTIONS.includes(status))) {
    throw new Error('Selecione ao menos uma situação válida.');
  }
  if (!REPORT_SECTIONS.includes(config.sections[0]) || config.sections.some((section) => !REPORT_SECTIONS.includes(section))) {
    throw new Error('Selecione ao menos uma seção válida para o relatório.');
  }
  if (config.orientation !== 'portrait' && config.orientation !== 'landscape') {
    throw new Error('A orientação do relatório é inválida.');
  }
}

interface SectionContext {
  readonly snapshot: DatabaseSnapshot;
  readonly config: ReportConfig;
  readonly summary: ReportSummary;
  readonly dashboard: ReturnType<typeof consolidateDashboard>;
  readonly periodTransactions: readonly Transaction[];
  readonly categoryMap: ReadonlyMap<string, Category>;
  readonly accountMap: ReadonlyMap<string, Account>;
  readonly cardMap: ReadonlyMap<string, CreditCard>;
  readonly invoices: readonly CreditCardInvoice[];
  readonly budgetsByMonth: readonly BudgetMonthRows[];
  readonly chart: ReportChartModel | null;
}

interface BudgetMonthRows {
  readonly month: string;
  readonly rows: readonly (readonly string[])[];
}

function buildSections(context: SectionContext): ReportSection[] {
  const sections: ReportSection[] = [];
  const wants = (key: ReportSectionKey): boolean => context.config.sections.includes(key);
  if (wants('summary')) sections.push(summarySection(context));
  if (wants('categories') && (context.config.type === 'monthly-summary' || context.config.type === 'category-expenses')) sections.push(categorySection(context));
  if (wants('accounts') && (context.config.type === 'monthly-summary' || context.config.type === 'account-statement')) sections.push(accountSection(context));
  if (wants('cards') && (context.config.type === 'monthly-summary' || context.config.type === 'card-invoice')) sections.push(cardSection(context));
  if (wants('budgets') && (context.config.type === 'monthly-summary' || context.config.type === 'budget-vs-realized')) sections.push(budgetSection(context));
  if (wants('transactions') && (context.config.type === 'monthly-summary' || context.config.type === 'transactions' || context.config.type === 'account-statement' || context.config.type === 'card-invoice')) sections.push(transactionSection(context));
  if (wants('due') && context.config.type === 'monthly-summary') sections.push(dueSection(context));
  if (wants('top-expenses') && context.config.type === 'monthly-summary') sections.push(topExpensesSection(context));
  if (wants('chart') && (context.config.type === 'monthly-summary' || context.config.type === 'category-expenses')) sections.push(chartSection(context));
  return sections;
}

function summarySection(context: SectionContext): ReportSection {
  const { summary, config } = context;
  const metrics: ReportMetric[] = [
    metricNumber('Movimentações consolidadas', summary.transactionCount),
    metricMoney('Receitas realizadas', summary.realizedIncomeCents),
    metricMoney('Despesas realizadas', summary.realizedExpenseCents),
    metricMoney('Resultado realizado', summary.realizedResultCents),
  ];
  if (config.includeForecast) {
    metrics.push(
      metricMoney('Receitas previstas', summary.forecastIncomeCents),
      metricMoney('Despesas previstas', summary.forecastExpenseCents),
      metricMoney('Resultado projetado', summary.projectedResultCents),
    );
  }
  if (config.showSensitiveBalances) {
    if (summary.currentBalanceCents !== null) metrics.push(metricMoney('Saldo atual das contas', summary.currentBalanceCents));
    if (summary.initialBalanceCents !== null) metrics.push(metricMoney('Saldo inicial do período', summary.initialBalanceCents));
    if (summary.finalBalanceCents !== null) metrics.push(metricMoney('Saldo final realizado', summary.finalBalanceCents));
    if (summary.projectedBalanceCents !== null) metrics.push(metricMoney('Saldo final projetado', summary.projectedBalanceCents));
  }
  return {
    key: 'summary',
    title: 'Resumo consolidado',
    description: config.showSensitiveBalances
      ? 'Valores consolidados com as mesmas regras financeiras do Dashboard.'
      : 'Valores consolidados com os saldos de contas e cartões ocultos por segurança.',
    metrics,
    table: null,
    emptyMessage: null,
  };
}

function categorySection(context: SectionContext): ReportSection {
  const rows = context.dashboard.expensesByCategory.map((item) => [
    item.name,
    formatCents(item.amountCents),
    formatCents(item.realizedCents),
    formatCents(item.forecastCents),
    formatPercent(item.percentage),
  ]);
  return {
    key: 'categories',
    title: 'Despesas por categoria',
    description: 'Transferências e pagamentos de fatura não entram no total de despesas.',
    metrics: [],
    table: rows.length ? { columns: ['Categoria', 'Total', 'Realizado', 'Previsto', 'Participação'], rows } : null,
    emptyMessage: rows.length ? null : 'Não há despesas categorizadas no período.',
  };
}

function accountSection(context: SectionContext): ReportSection {
  const columns = context.config.showSensitiveBalances ? ['Conta', 'Saldo atual', 'Resultado no período'] : ['Conta', 'Resultado no período'];
  const rows = context.dashboard.accounts.map((item) => context.config.showSensitiveBalances
    ? [item.account.name, formatCents(item.balanceCents), formatSignedCents(item.periodResultCents)]
    : [item.account.name, formatSignedCents(item.periodResultCents)]);
  return {
    key: 'accounts',
    title: 'Contas e saldos',
    description: context.config.showSensitiveBalances ? 'Saldos atuais e resultado produzido no período.' : 'Os saldos foram ocultados; o resultado do período permanece disponível.',
    metrics: [],
    table: rows.length ? { columns, rows } : null,
    emptyMessage: rows.length ? null : 'Não há contas ativas compatíveis com o filtro.',
  };
}

function cardSection(context: SectionContext): ReportSection {
  const rows = context.invoices.map((invoice) => {
    const card = context.cardMap.get(invoice.creditCardId);
    return [
      card?.name ?? 'Cartão não encontrado',
      invoice.competence,
      formatCivilDate(invoice.dueDate),
      CREDIT_CARD_INVOICE_STATUS_LABELS[invoice.status],
      formatCents(invoiceTotal(invoice, context.snapshot.transactions)),
    ];
  });
  return {
    key: 'cards',
    title: 'Cartões e faturas',
    description: 'As compras aparecem na competência da fatura; o pagamento da fatura não duplica as despesas consolidadas.',
    metrics: [],
    table: rows.length ? { columns: ['Cartão', 'Competência', 'Vencimento', 'Situação', 'Total da fatura'], rows } : null,
    emptyMessage: rows.length ? null : 'Não há faturas compatíveis com o período e o cartão escolhido.',
  };
}

function budgetSection(context: SectionContext): ReportSection {
  const rows = context.budgetsByMonth.flatMap((item) => item.rows);
  return {
    key: 'budgets',
    title: 'Orçado x realizado',
    description: 'O comprometido segue a política registrada em cada orçamento; transferências e pagamentos de fatura ficam fora.',
    metrics: [],
    table: rows.length ? { columns: ['Mês', 'Escopo', 'Orçado', 'Realizado', 'Comprometido', 'Disponível', 'Política'], rows } : null,
    emptyMessage: rows.length ? null : 'Não há orçamentos definidos nos meses selecionados.',
  };
}

function transactionSection(context: SectionContext): ReportSection {
  const rows = context.periodTransactions.map((transaction) => [
    formatCivilDate(transaction.movementDate),
    transaction.description,
    transactionKind(transaction),
    categoryName(transaction, context.categoryMap),
    accountName(transaction, context.accountMap, context.cardMap),
    TRANSACTION_STATUS_LABELS[transaction.status],
    formatCents(transaction.amountCents),
  ]);
  return {
    key: 'transactions',
    title: 'Movimentações filtradas',
    description: 'Lançamentos cancelados não são exibidos. Valores de transferências e pagamentos de fatura são informativos e não compõem os indicadores consolidados.',
    metrics: [],
    table: rows.length ? { columns: ['Data', 'Descrição', 'Tipo', 'Categoria', 'Conta/cartão', 'Situação', 'Valor'], rows } : null,
    emptyMessage: rows.length ? null : 'Não há movimentações compatíveis com os filtros.',
  };
}

function dueSection(context: SectionContext): ReportSection {
  const overdue = context.dashboard.overdueItems.map((item) => [
    'Vencida',
    formatCivilDate(item.transaction.dueDate ?? item.transaction.movementDate),
    item.transaction.description,
    item.categoryName,
    item.accountName,
    formatCents(item.transaction.amountCents),
  ]);
  const upcoming = context.dashboard.upcomingItems
    .filter((item) => !context.dashboard.overdueItems.some((overdueItem) => overdueItem.transaction.id === item.transaction.id))
    .map((item) => [
      'Próxima',
      formatCivilDate(item.transaction.dueDate ?? item.transaction.movementDate),
      item.transaction.description,
      item.categoryName,
      item.accountName,
      formatCents(item.transaction.amountCents),
    ]);
  const rows = [...overdue, ...upcoming];
  return {
    key: 'due',
    title: 'Pendências e vencimentos',
    description: 'Itens em aberto com vencimento no período selecionado.',
    metrics: [metricNumber('Itens vencidos', overdue.length), metricNumber('Próximos vencimentos', upcoming.length)],
    table: rows.length ? { columns: ['Status', 'Vencimento', 'Descrição', 'Categoria', 'Conta', 'Valor'], rows } : null,
    emptyMessage: rows.length ? null : 'Não há pendências ou vencimentos em aberto no período.',
  };
}

function topExpensesSection(context: SectionContext): ReportSection {
  const rows = context.periodTransactions
    .filter((transaction) => transaction.type === 'expense' && !isCardInvoicePayment(transaction))
    .sort((left, right) => right.amountCents - left.amountCents)
    .slice(0, 5)
    .map((transaction) => [formatCents(transaction.amountCents), transaction.description, categoryName(transaction, context.categoryMap), formatCivilDate(transaction.movementDate)]);
  return {
    key: 'top-expenses',
    title: 'Maiores despesas',
    description: 'As cinco maiores despesas do período, ordenadas pelo valor nominal.',
    metrics: [],
    table: rows.length ? { columns: ['Valor', 'Descrição', 'Categoria', 'Data'], rows } : null,
    emptyMessage: rows.length ? null : 'Não há despesas no período.',
  };
}

function chartSection(context: SectionContext): ReportSection {
  const rows = context.chart?.entries.map((entry) => [entry.label, formatCents(entry.valueCents), formatPercent(entry.percentage)]) ?? [];
  return {
    key: 'chart',
    title: 'Gráfico de despesas',
    description: context.chart?.alternativeText ?? 'O gráfico será omitido porque não há valores positivos para representar; esta mensagem também aparecerá no PDF.',
    metrics: [],
    table: rows.length ? { columns: ['Categoria', 'Valor', 'Participação'], rows } : null,
    emptyMessage: rows.length ? null : 'Não foi possível criar um gráfico com os dados selecionados.',
  };
}

function createFilters(snapshot: DatabaseSnapshot, config: ReportConfig): ReportFilters {
  return {
    period: `${formatCivilDate(config.from)} a ${formatCivilDate(config.to)}`,
    account: config.accountId ? snapshot.accounts.find((account) => account.id === config.accountId)?.name ?? 'Conta selecionada' : 'Todas as contas',
    card: config.creditCardId ? snapshot.creditCards.find((card) => card.id === config.creditCardId)?.name ?? 'Cartão selecionado' : 'Todos os cartões',
    category: config.categoryId ? snapshot.categories.find((category) => category.id === config.categoryId)?.name ?? 'Categoria selecionada' : 'Todas as categorias',
    statuses: config.statuses.map((status) => TRANSACTION_STATUS_LABELS[status]).join(', '),
    forecast: config.includeForecast ? 'Inclui realizado e previsto' : 'Somente realizado',
    balances: config.showSensitiveBalances ? 'Saldos visíveis' : 'Saldos ocultos',
  };
}

function matchesReportFilters(transaction: Transaction, snapshot: DatabaseSnapshot, config: ReportConfig): boolean {
  if (transaction.archived || transaction.status === 'cancelled') return false;
  const statuses = config.includeForecast ? config.statuses : config.statuses.filter((status) => status === 'paid');
  if (!statuses.includes(transaction.status)) return false;
  if (config.accountId !== null && !transactionTouchesAccount(transaction, config.accountId)) return false;
  if (config.categoryId !== null && transaction.categoryId !== config.categoryId) return false;
  if (config.creditCardId !== null && !transactionTouchesCard(transaction, snapshot, config.creditCardId)) return false;
  return true;
}

function transactionTouchesAccount(transaction: Transaction, accountId: string): boolean {
  return transaction.accountId === accountId || transaction.fromAccountId === accountId || transaction.toAccountId === accountId;
}

function transactionTouchesCard(transaction: Transaction, snapshot: DatabaseSnapshot, cardId: string): boolean {
  if (transaction.creditCardId === cardId) return true;
  return transaction.cardInvoiceId !== null && snapshot.cardInvoices.some((invoice) => invoice.id === transaction.cardInvoiceId && invoice.creditCardId === cardId);
}

function matchingInvoices(snapshot: DatabaseSnapshot, config: ReportConfig): CreditCardInvoice[] {
  const fromMonth = config.from.slice(0, 7);
  const toMonth = config.to.slice(0, 7);
  return snapshot.cardInvoices
    .filter((invoice) => !invoice.archived && invoice.competence >= fromMonth && invoice.competence <= toMonth)
    .filter((invoice) => config.creditCardId === null || invoice.creditCardId === config.creditCardId)
    .sort((left, right) => left.competence.localeCompare(right.competence));
}

function budgetSummaries(
  budgets: readonly Budget[],
  transactions: readonly Transaction[],
  from: string,
  to: string,
  categories: ReadonlyMap<string, Category>,
): BudgetMonthRows[] {
  const months = monthKeys(from, to);
  return months.map((month) => {
    const summary = summarizeBudgets(transactions, budgets, month);
    const rows: (readonly string[])[] = [];
    if (summary.totalMetric) {
      rows.push([
        month,
        'Total',
        formatCents(summary.totalMetric.budget.amountCents),
        formatCents(summary.totalMetric.realizedCents),
        formatCents(summary.totalMetric.committedCents),
        formatCents(summary.totalMetric.availableCents),
        BUDGET_COMMITMENT_POLICY_LABELS[summary.totalMetric.budget.commitmentPolicy],
      ]);
    }
    for (const metric of summary.categoryMetrics) {
      rows.push([
        month,
        metric.budget.categoryId ? categories.get(metric.budget.categoryId)?.name ?? 'Categoria arquivada' : 'Categoria',
        formatCents(metric.budget.amountCents),
        formatCents(metric.realizedCents),
        formatCents(metric.committedCents),
        formatCents(metric.availableCents),
        BUDGET_COMMITMENT_POLICY_LABELS[metric.budget.commitmentPolicy],
      ]);
    }
    return { month, rows };
  });
}

function createChartModel(entries: ReturnType<typeof consolidateDashboard>['expenseChart']): ReportChartModel | null {
  if (entries.length === 0) return null;
  return {
    title: 'Despesas por categoria',
    alternativeText: `Distribuição das despesas: ${entries.map((entry) => `${entry.name} ${formatCents(entry.amountCents)} (${formatPercent(entry.percentage)})`).join('; ')}.`,
    entries: entries.map((entry) => ({ label: entry.name, valueCents: entry.amountCents, percentage: entry.percentage, color: entry.color })),
  };
}

function balanceAt(accounts: readonly Account[], transactions: readonly Transaction[], date: string, includeForecast: boolean): number {
  return accounts.reduce((total, account) => {
    const balance = transactions.reduce((current, transaction) => {
      const transactionDate = transaction.status === 'paid'
        ? transaction.paymentDate ?? transaction.movementDate
        : transaction.dueDate ?? transaction.movementDate;
      const included = transactionDate <= date && (transaction.status === 'paid' || includeForecast && (transaction.status === 'planned' || transaction.status === 'pending'));
      return included ? current + accountDelta(transaction, account.id) : current;
    }, account.initialBalanceCents);
    return total + balance;
  }, 0);
}

function accountDelta(transaction: Transaction, accountId: string): number {
  if (transaction.type === 'income' && transaction.accountId === accountId) return transaction.amountCents;
  if (transaction.type === 'expense' && transaction.accountId === accountId) return -transaction.amountCents;
  if (transaction.type === 'transfer' && transaction.fromAccountId === accountId) return -transaction.amountCents;
  if (transaction.type === 'transfer' && transaction.toAccountId === accountId) return transaction.amountCents;
  return 0;
}

function invoiceTotal(invoice: CreditCardInvoice, transactions: readonly Transaction[]): number {
  return transactions
    .filter((transaction) => !transaction.archived && transaction.status !== 'cancelled' && transaction.cardInvoiceId === invoice.id && transaction.creditCardId === invoice.creditCardId)
    .reduce((total, transaction) => total + transaction.amountCents, 0);
}

function categoryName(transaction: Transaction, categories: ReadonlyMap<string, Category>): string {
  return transaction.categoryId ? categories.get(transaction.categoryId)?.name ?? 'Categoria arquivada' : 'Sem categoria';
}

function accountName(transaction: Transaction, accounts: ReadonlyMap<string, Account>, cards: ReadonlyMap<string, CreditCard>): string {
  if (transaction.type === 'transfer') {
    const from = transaction.fromAccountId ? accounts.get(transaction.fromAccountId)?.name ?? 'Conta de origem' : 'Origem';
    const to = transaction.toAccountId ? accounts.get(transaction.toAccountId)?.name ?? 'Conta de destino' : 'Destino';
    return `${from} → ${to}`;
  }
  if (transaction.creditCardId) return cards.get(transaction.creditCardId)?.name ?? 'Cartão arquivado';
  return transaction.accountId ? accounts.get(transaction.accountId)?.name ?? 'Conta arquivada' : 'Sem conta';
}

function transactionKind(transaction: Transaction): string {
  if (transaction.type === 'transfer') return 'Transferência';
  if (isCardInvoicePayment(transaction)) return 'Pagamento de fatura';
  return transaction.type === 'income' ? 'Receita' : 'Despesa';
}

function metricMoney(label: string, valueCents: number): ReportMetric {
  return { label, value: formatCents(valueCents), valueCents, kind: 'money' };
}

function metricNumber(label: string, value: number): ReportMetric {
  return { label, value: new Intl.NumberFormat('pt-BR').format(value), valueCents: value, kind: 'number' };
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatGeneratedAt(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function reportFileName(type: ReportType, from: string, to: string): string {
  const slug = REPORT_TYPE_LABELS[type].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const period = from.slice(0, 7) === to.slice(0, 7) ? from.slice(0, 7) : `${from}-${to}`;
  return `${slug}-${period}.pdf`;
}

function isValidGeneratedAt(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function monthKeys(from: string, to: string): string[] {
  const result: string[] = [];
  let current = from.slice(0, 7);
  const last = to.slice(0, 7);
  while (current <= last) {
    result.push(current);
    const [year, month] = current.split('-').map(Number);
    const next = new Date(Date.UTC(year, month, 1));
    current = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return result;
}
