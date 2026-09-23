import { describe, expect, it } from 'vitest';
import { consolidateDashboard, periodForRange } from './dashboard-rules';
import { buildReportModel, DEFAULT_REPORT_SECTIONS, ReportConfig } from './report-rules';
import { DatabaseSnapshot, EMPTY_SNAPSHOT, Transaction } from './models';

const timestamp = '2026-09-20T12:00:00.000Z';

const account = (id: string, name: string, initialBalanceCents = 10000) => ({
  id, createdAt: timestamp, updatedAt: timestamp, archived: false, name, normalizedName: name.toLocaleLowerCase('pt-BR'), type: 'checking' as const,
  institution: null, color: '#0d6b63', icon: '◉', initialBalanceCents, isDefault: id === 'main',
});

const category = (id: string, name: string, type: 'expense' | 'income' = 'expense') => ({
  id, createdAt: timestamp, updatedAt: timestamp, archived: false, type, name, normalizedName: name.toLocaleLowerCase('pt-BR'),
  color: type === 'expense' ? '#e2745b' : '#0d6b63', icon: type === 'expense' ? '⌂' : '↗', parentId: null, sortOrder: 0,
});

function transaction(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id, createdAt: timestamp, updatedAt: timestamp, archived: false, description: id, amountCents: 1000, type: 'expense', movementDate: '2026-09-10',
    dueDate: null, paymentDate: '2026-09-10', paymentMethod: 'pix', status: 'paid', categoryId: 'food', accountId: 'main', fromAccountId: null,
    toAccountId: null, creditCardId: null, tags: [], notes: '', recurrenceRuleId: null, recurrenceOccurrenceKey: null, transferId: null,
    installmentGroupId: null, cardInvoiceId: null, ...overrides,
  };
}

function fixture(): DatabaseSnapshot {
  return {
    ...EMPTY_SNAPSHOT,
    exportedAt: timestamp,
    settings: { ...EMPTY_SNAPSHOT.settings, updatedAt: timestamp, firstAccessCompleted: true },
    accounts: [account('main', 'Conta principal'), account('reserve', 'Reserva', 5000)],
    categories: [category('food', 'Casa'), category('salary', 'Salário', 'income')],
    creditCards: [{
      id: 'card', createdAt: timestamp, updatedAt: timestamp, archived: false, name: 'Cartão principal', brand: 'Visa', institution: null,
      paymentAccountId: 'main', color: '#0d6b63', icon: '▣', creditLimitCents: 100000, closingDay: 10, dueDay: 20,
    }],
    cardInvoices: [{
      id: 'invoice', createdAt: timestamp, updatedAt: timestamp, archived: false, creditCardId: 'card', competence: '2026-09', closingDate: '2026-09-10',
      dueDate: '2026-09-20', status: 'open', paidAt: null, paymentTransactionId: null,
    }],
    transactions: [
      transaction('paid-expense', { description: 'Aluguel', amountCents: 2000 }),
      transaction('income', { description: 'Salário', type: 'income', categoryId: 'salary', amountCents: 5000 }),
      transaction('pending-expense', { description: 'Mercado pendente', amountCents: 3000, status: 'pending', dueDate: '2026-09-25', paymentDate: null }),
      transaction('planned-expense', { description: 'Viagem prevista', amountCents: 1500, status: 'planned', dueDate: '2026-09-28', paymentDate: null }),
      transaction('card-installment', { description: 'Compra no cartão', amountCents: 1200, status: 'pending', categoryId: 'food', accountId: null, paymentDate: null, creditCardId: 'card', cardInvoiceId: 'invoice', installmentGroupId: 'group' }),
      transaction('invoice-payment', { description: 'Pagamento da fatura', amountCents: 1200, categoryId: null, accountId: 'main', cardInvoiceId: 'invoice', paymentMethod: 'bank-transfer' }),
      transaction('transfer', { description: 'Transferência', amountCents: 800, type: 'transfer', categoryId: null, accountId: null, fromAccountId: 'main', toAccountId: 'reserve', transferId: 'transfer-1' }),
      transaction('cancelled', { description: 'Cancelada', amountCents: 99999, status: 'cancelled', paymentDate: null }),
    ],
    budgets: [{
      id: 'budget-food', createdAt: timestamp, updatedAt: timestamp, archived: false, month: '2026-09', categoryId: 'food', amountCents: 5000,
      commitmentPolicy: 'planned-and-pending', alertThresholds: { attentionPercent: 80, warningPercent: 100 },
    }],
  };
}

function config(overrides: Partial<ReportConfig> = {}): ReportConfig {
  return {
    type: 'monthly-summary', from: '2026-09-01', to: '2026-09-30', accountId: null, creditCardId: null, categoryId: null,
    statuses: ['paid', 'pending', 'planned'], includeForecast: true, showSensitiveBalances: true, orientation: 'portrait',
    sections: DEFAULT_REPORT_SECTIONS, ...overrides,
  };
}

describe('modelo independente de relatórios', () => {
  it('mantém os mesmos valores financeiros do Dashboard no mesmo período', () => {
    const snapshot = fixture();
    const report = buildReportModel(snapshot, config(), timestamp);
    const dashboard = consolidateDashboard(snapshot.transactions, snapshot.accounts, snapshot.categories, periodForRange('2026-09-01', '2026-09-30'), '2026-09-20');

    expect(report.summary.realizedIncomeCents).toBe(dashboard.realizedIncomeCents);
    expect(report.summary.realizedExpenseCents).toBe(dashboard.realizedExpenseCents);
    expect(report.summary.currentBalanceCents).toBe(dashboard.balanceCents);
    expect(report.summary.forecastIncomeCents).toBe(dashboard.forecastIncomeCents);
    expect(report.summary.forecastExpenseCents).toBe(dashboard.forecastExpenseCents);
    expect(report.summary.realizedResultCents).toBe(dashboard.realizedResultCents);
    expect(report.summary.projectedResultCents).toBe(dashboard.projectedResultCents);
  });

  it('exclui cancelamentos, transferências e pagamento de fatura dos indicadores sem perder o movimento informativo', () => {
    const report = buildReportModel(fixture(), config(), timestamp);
    expect(report.summary.realizedExpenseCents).toBe(2000);
    expect(report.summary.forecastExpenseCents).toBe(5700);
    const movements = report.sections.find((section) => section.key === 'transactions')?.table?.rows ?? [];
    expect(movements.some((row) => row.includes('Pagamento de fatura'))).toBe(true);
    expect(movements.some((row) => row.includes('Cancelada'))).toBe(false);
    expect(report.summary.realizedExpenseCents).not.toBe(2000 + 1200);
  });

  it('aplica conta, categoria e modo somente realizado ao mesmo consolidado', () => {
    const report = buildReportModel(fixture(), config({ accountId: 'main', categoryId: 'food', includeForecast: false, statuses: ['paid'] }), timestamp);
    expect(report.summary.realizedExpenseCents).toBe(2000);
    expect(report.summary.forecastExpenseCents).toBe(0);
    expect(report.filters.account).toBe('Conta principal');
    expect(report.filters.category).toBe('Casa');
    expect(report.filters.forecast).toBe('Somente realizado');
    expect(report.transactionCount).toBe(1);
  });

  it('remove todos os valores de saldo quando a configuração os oculta', () => {
    const report = buildReportModel(fixture(), config({ showSensitiveBalances: false }), timestamp);
    expect(report.summary.initialBalanceCents).toBeNull();
    expect(report.summary.currentBalanceCents).toBeNull();
    expect(report.summary.finalBalanceCents).toBeNull();
    expect(report.summary.projectedBalanceCents).toBeNull();
    const accountSection = report.sections.find((section) => section.key === 'accounts');
    expect(accountSection?.table?.columns).toEqual(['Conta', 'Resultado no período']);
    expect(accountSection?.table?.rows.flat()).not.toContain('R$ 100,00');
  });

  it('gera a tabela de orçado x realizado e nomeia a categoria, sem truncar descrições longas', () => {
    const longDescription = 'Descrição longa '.repeat(8).trim();
    const snapshot = fixture();
    const withLongText = { ...snapshot, transactions: [...snapshot.transactions, transaction('long', { description: longDescription, amountCents: 600, status: 'paid' })] };
    const report = buildReportModel(withLongText, config(), timestamp);
    const budgetRows = report.sections.find((section) => section.key === 'budgets')?.table?.rows ?? [];
    const movementRows = report.sections.find((section) => section.key === 'transactions')?.table?.rows ?? [];
    expect(budgetRows[0]).toContain('Casa');
    expect(budgetRows[0]?.map((cell) => cell.replace(/\u00a0/g, ' '))).toContain('R$ 50,00');
    expect(budgetRows[0]?.map((cell) => cell.replace(/\u00a0/g, ' '))).toContain('R$ 26,00');
    expect(movementRows.some((row) => row.includes(longDescription))).toBe(true);
  });

  it('entrega faturas, nome de arquivo previsível e uma descrição textual do gráfico', () => {
    const report = buildReportModel(fixture(), config({ type: 'card-invoice', sections: ['summary', 'cards', 'transactions'] }), timestamp);
    expect(report.fileName).toBe('faturas-de-cartao-2026-09.pdf');
    expect(report.sections.find((section) => section.key === 'cards')?.table?.rows[0]?.map((cell) => cell.replace(/\u00a0/g, ' '))).toContain('R$ 12,00');

    const categoryReport = buildReportModel(fixture(), config({ type: 'category-expenses', sections: ['summary', 'categories', 'chart'] }), timestamp);
    expect(categoryReport.chart?.alternativeText).toContain('Casa');
  });

  it('expõe estado vazio sem inventar valores', () => {
    const report = buildReportModel(fixture(), config({ from: '2027-01-01', to: '2027-01-31' }), timestamp);
    expect(report.isEmpty).toBe(true);
    expect(report.warnings[0]).toContain('Não há dados compatíveis');
    expect(report.summary.realizedIncomeCents).toBe(0);
    expect(report.summary.realizedExpenseCents).toBe(0);

    const incomeOnly = { ...fixture(), transactions: [transaction('only-income', { type: 'income', categoryId: 'salary' })], budgets: [] };
    const categoryReport = buildReportModel(incomeOnly, config({ type: 'category-expenses', sections: ['summary', 'categories', 'chart'] }), timestamp);
    expect(categoryReport.isEmpty).toBe(true);
  });

  it('valida período, referências e seleção de seções antes de consolidar', () => {
    expect(() => buildReportModel(fixture(), config({ from: '2026-09-31' }), timestamp)).toThrow('período');
    expect(() => buildReportModel(fixture(), config({ accountId: 'missing' }), timestamp)).toThrow('conta');
    expect(() => buildReportModel(fixture(), config({ sections: [] }), timestamp)).toThrow('seção');
  });
});
