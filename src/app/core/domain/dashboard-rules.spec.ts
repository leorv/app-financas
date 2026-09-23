import { describe, expect, it } from 'vitest';
import { consolidateDashboard, periodForMonth, periodForRange, variationPercent } from './dashboard-rules';
import { Account, Category, Transaction } from './models';

const account = (overrides: Partial<Account> = {}): Account => ({
  id: 'account', createdAt: '', updatedAt: '', archived: false, name: 'Conta', normalizedName: 'conta', type: 'checking', institution: null, color: '#000', icon: '◉', initialBalanceCents: 10000, isDefault: true, ...overrides,
});

const category = (overrides: Partial<Category> = {}): Category => ({
  id: 'category', createdAt: '', updatedAt: '', archived: false, type: 'expense', name: 'Casa', normalizedName: 'casa', color: '#0d6b63', icon: '⌂', parentId: null, sortOrder: 0, ...overrides,
});

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'transaction', createdAt: '', updatedAt: '', archived: false, description: 'Lançamento', amountCents: 1000, type: 'expense', movementDate: '2026-09-10', dueDate: null, paymentDate: '2026-09-10', paymentMethod: 'pix', status: 'paid', categoryId: 'category', accountId: 'account', fromAccountId: null, toAccountId: null, creditCardId: null, tags: [], notes: '', recurrenceRuleId: null, recurrenceOccurrenceKey: null, transferId: null, installmentGroupId: null, cardInvoiceId: null, ...overrides,
});

describe('consolidação do dashboard', () => {
  it('separa realizado e previsto, ignora cancelados e não converte transferências em receita ou despesa', () => {
    const summary = consolidateDashboard(
      [
        transaction({ id: 'paid', amountCents: 2000 }),
        transaction({ id: 'income', type: 'income', amountCents: 5000, categoryId: 'income', paymentDate: '2026-09-11' }),
        transaction({ id: 'pending', amountCents: 3000, status: 'pending', paymentDate: null }),
        transaction({ id: 'cancelled', amountCents: 9000, status: 'cancelled', paymentDate: null }),
        transaction({ id: 'transfer', type: 'transfer', amountCents: 4000, status: 'planned', categoryId: null, accountId: null, fromAccountId: 'account', toAccountId: 'other', paymentDate: null }),
      ],
      [account()],
      [category(), category({ id: 'income', type: 'income', name: 'Salário' })],
      periodForMonth('2026-09'),
      '2026-09-20',
    );
    expect(summary.realizedIncomeCents).toBe(5000);
    expect(summary.realizedExpenseCents).toBe(2000);
    expect(summary.forecastExpenseCents).toBe(3000);
    expect(summary.projectedResultCents).toBe(0);
    expect(summary.transactionCount).toBe(3);
  });

  it('calcula vencidas, próximas e os principais gastos sem apagar o detalhamento de Outras', () => {
    const categories = Array.from({ length: 7 }, (_, index) => category({ id: `cat-${index}`, name: `Categoria ${index}`, normalizedName: `categoria-${index}` }));
    const transactions = categories.map((item, index) => transaction({ id: item.id, categoryId: item.id, amountCents: 1000 - index * 50, status: index === 0 ? 'pending' : 'paid', paymentDate: index === 0 ? null : '2026-09-10', dueDate: index === 0 ? '2026-09-19' : null }));
    transactions.push(transaction({ id: 'upcoming', description: 'Conta próxima', categoryId: 'cat-1', amountCents: 2500, status: 'planned', paymentDate: null, movementDate: '2026-08-25', dueDate: '2026-09-25' }));
    const summary = consolidateDashboard(transactions, [account()], categories, periodForMonth('2026-09'), '2026-09-20');
    expect(summary.overdueCount).toBe(1);
    expect(summary.overdueAmountCents).toBe(1000);
    expect(summary.upcomingItems.map((item) => item.transaction.id)).toEqual(['upcoming']);
    expect(summary.expenseChart.at(-1)?.isOther).toBe(true);
    expect(summary.expenseChart.at(-1)?.details).toHaveLength(2);
    expect(summary.expensesByCategory).toHaveLength(7);
  });

  it('debit a conta ao pagar a fatura sem somar a despesa novamente no dashboard', () => {
    const summary = consolidateDashboard(
      [
        transaction({ id: 'installment', amountCents: 2000, status: 'pending', paymentDate: null, accountId: null, creditCardId: 'card', cardInvoiceId: 'invoice', installmentGroupId: 'group' }),
        transaction({ id: 'payment', amountCents: 2000, categoryId: null, accountId: 'account', creditCardId: null, cardInvoiceId: 'invoice', paymentMethod: 'bank-transfer' }),
      ],
      [account()],
      [category()],
      periodForMonth('2026-09'),
      '2026-09-20',
    );
    expect(summary.realizedExpenseCents).toBe(0);
    expect(summary.forecastExpenseCents).toBe(2000);
    expect(summary.balanceCents).toBe(8000);
  });

  it('compara períodos equivalentes e evolui o saldo com base no saldo inicial', () => {
    const summary = consolidateDashboard(
      [
        transaction({ id: 'before', movementDate: '2026-08-31', paymentDate: '2026-08-31', amountCents: 500 }),
        transaction({ id: 'current', movementDate: '2026-09-01', paymentDate: '2026-09-01', amountCents: 1000 }),
        transaction({ id: 'forecast', movementDate: '2026-09-02', amountCents: 300, status: 'planned', paymentDate: null }),
      ],
      [account()],
      [category()],
      periodForRange('2026-09-01', '2026-09-02'),
      '2026-09-20',
    );
    expect(summary.period.previousFrom).toBe('2026-08-30');
    expect(summary.period.previousTo).toBe('2026-08-31');
    expect(summary.balanceEvolution.at(-1)?.realizedBalanceCents).toBe(8500);
    expect(summary.balanceEvolution.at(-1)?.projectedBalanceCents).toBe(8200);
    expect(summary.expenseComparison.previousCents).toBe(500);
    expect(summary.expenseComparison.variationPercent).toBe(100);
  });

  it('posiciona o saldo pela data de pagamento e não inclui dias fora do intervalo', () => {
    const summary = consolidateDashboard(
      [transaction({ id: 'paid-later', movementDate: '2026-09-01', paymentDate: '2026-09-20', amountCents: 1000 })],
      [account()],
      [category()],
      periodForRange('2026-09-20', '2026-09-20'),
      '2026-09-20',
    );
    expect(summary.balanceEvolution).toHaveLength(1);
    expect(summary.balanceEvolution[0].realizedBalanceCents).toBe(9000);
  });

  it('retorna ausência de base quando não existe valor anterior', () => {
    expect(variationPercent(100, 0)).toBeNull();
    expect(variationPercent(0, 0)).toBe(0);
  });
});
