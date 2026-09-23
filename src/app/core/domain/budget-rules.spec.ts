import { describe, expect, it } from 'vitest';
import { Budget, Transaction } from './models';
import {
  budgetAlertBand,
  budgetMonthPeriod,
  calculateBudgetMetric,
  copyBudgetMonth,
  previousBudgetMonth,
  summarizeBudgets,
} from './budget-rules';

const timestamp = '2026-09-20T12:00:00.000Z';

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'budget-1', createdAt: timestamp, updatedAt: timestamp, archived: false,
    month: '2026-09', categoryId: null, amountCents: 10000,
    commitmentPolicy: 'planned-and-pending', alertThresholds: { attentionPercent: 80, warningPercent: 100 },
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'transaction-1', createdAt: timestamp, updatedAt: timestamp, archived: false,
    description: 'Despesa', amountCents: 1000, type: 'expense', movementDate: '2026-09-10', dueDate: null,
    paymentDate: '2026-09-10', paymentMethod: 'pix', status: 'paid', categoryId: 'category-1', accountId: 'account-1',
    fromAccountId: null, toAccountId: null, creditCardId: null, tags: [], notes: '', recurrenceRuleId: null,
    recurrenceOccurrenceKey: null, transferId: null, installmentGroupId: null, cardInvoiceId: null, ...overrides,
  };
}

describe('regras de orçamento', () => {
  it('calcula realizado e comprometido conforme a política explícita', () => {
    const budget = makeBudget({ categoryId: 'category-1' });
    const transactions = [
      makeTransaction({ id: 'paid', amountCents: 1000, status: 'paid', paymentDate: '2026-09-10' }),
      makeTransaction({ id: 'pending', amountCents: 2000, status: 'pending', paymentDate: null }),
      makeTransaction({ id: 'planned', amountCents: 3000, status: 'planned', paymentDate: null }),
      makeTransaction({ id: 'cancelled', amountCents: 4000, status: 'cancelled', paymentDate: null }),
    ];

    expect(calculateBudgetMetric(budget, transactions)).toMatchObject({ realizedCents: 1000, committedCents: 6000, availableCents: 4000 });
    expect(calculateBudgetMetric({ ...budget, commitmentPolicy: 'realized-only' }, transactions).committedCents).toBe(1000);
    expect(calculateBudgetMetric({ ...budget, commitmentPolicy: 'pending' }, transactions).committedCents).toBe(3000);
  });

  it('não conta transferências nem pagamento de fatura como nova despesa', () => {
    const budget = makeBudget();
    const transactions = [
      makeTransaction({ id: 'normal', amountCents: 1000 }),
      makeTransaction({ id: 'transfer', amountCents: 2000, type: 'transfer', status: 'paid', paymentDate: '2026-09-10', categoryId: null, accountId: null, fromAccountId: 'account-1', toAccountId: 'account-2' }),
      makeTransaction({ id: 'invoice-payment', amountCents: 3000, categoryId: null, cardInvoiceId: 'invoice-1', paymentDate: '2026-09-17' }),
      makeTransaction({ id: 'card-installment', amountCents: 4000, categoryId: 'category-1', creditCardId: 'card-1', cardInvoiceId: 'invoice-1', accountId: null, paymentDate: null, status: 'pending' }),
    ];

    const metric = calculateBudgetMetric(budget, transactions);
    expect(metric.realizedCents).toBe(1000);
    expect(metric.committedCents).toBe(5000);
  });

  it('atribui compras parceladas à competência da movimentação da fatura', () => {
    const budget = makeBudget({ month: '2026-10' });
    const installment = makeTransaction({ movementDate: '2026-10-01', status: 'pending', paymentDate: null, creditCardId: 'card-1', cardInvoiceId: 'invoice-2', accountId: null });
    const previousInvoiceInstallment = { ...installment, id: 'previous', movementDate: '2026-09-01' };
    expect(calculateBudgetMetric(budget, [installment, previousInvoiceInstallment]).committedCents).toBe(1000);
  });

  it('mantém categorias sem limite no total e expõe o consumo por categoria', () => {
    const total = makeBudget({ id: 'total', amountCents: 5000 });
    const categoryBudget = makeBudget({ id: 'cat', categoryId: 'category-1', amountCents: 2000 });
    const summary = summarizeBudgets([
      makeTransaction({ id: 'limited', amountCents: 1000 }),
      makeTransaction({ id: 'unbudgeted', amountCents: 3000, categoryId: 'category-2' }),
    ], [total, categoryBudget], '2026-09');

    expect(summary.totalRealizedCents).toBe(4000);
    expect(summary.totalMetric?.availableCents).toBe(1000);
    expect(summary.unbudgetedRealizedCents).toBe(3000);
    expect(summary.spendingByCategory.find((item) => item.categoryId === 'category-2')).toMatchObject({ hasBudget: false, realizedCents: 3000 });
  });

  it('usa rótulos de alerta perceptíveis e trata limite zero como excedido quando há gasto', () => {
    const budget = makeBudget({ amountCents: 10000, alertThresholds: { attentionPercent: 70, warningPercent: 90 } });
    expect(budgetAlertBand(69.9, budget)).toBe('none');
    expect(budgetAlertBand(70, budget)).toBe('attention');
    expect(budgetAlertBand(90, budget)).toBe('warning');
    expect(budgetAlertBand(100.01, budget)).toBe('exceeded');
    expect(budgetAlertBand(Number.POSITIVE_INFINITY, { ...budget, amountCents: 0 })).toBe('exceeded');
  });

  it('copia apenas os limites ativos para um novo mês sem alterar o período anterior', () => {
    const source = makeBudget({ id: 'source', categoryId: 'category-1' });
    const archived = makeBudget({ id: 'archived', archived: true, categoryId: 'category-2' });
    const copy = copyBudgetMonth([source, archived], '2026-09', '2026-10');
    expect(copy).toEqual([{ month: '2026-10', categoryId: 'category-1', amountCents: 10000, commitmentPolicy: 'planned-and-pending', alertThresholds: { attentionPercent: 80, warningPercent: 100 } }]);
    expect(source.month).toBe('2026-09');
    expect(previousBudgetMonth('2027-01')).toBe('2026-12');
    expect(budgetMonthPeriod('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});
