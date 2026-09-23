import { describe, expect, it } from 'vitest';
import { calculateTransactionTotals, canDeleteTransaction, EMPTY_TRANSACTION_FILTER, filterTransactions, normalizeTags, paginateTransactions } from './transaction-rules';
import { Transaction } from './models';

const transaction = (overrides: Partial<Transaction>): Transaction => ({
  id: 'tx', createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z', archived: false,
  description: 'Mercado', amountCents: 1000, type: 'expense', movementDate: '2026-09-20', dueDate: null, paymentDate: '2026-09-20', paymentMethod: 'pix', status: 'paid', categoryId: 'food', accountId: 'main', fromAccountId: null, toAccountId: null, creditCardId: null, tags: ['casa'], notes: '', recurrenceRuleId: null, recurrenceOccurrenceKey: null, transferId: null, installmentGroupId: null, cardInvoiceId: null, ...overrides,
});

describe('consulta e regras de movimentações', () => {
  it('filtra por texto, período, situação, conta e tags', () => {
    const result = filterTransactions([
      transaction({ id: '1', description: 'Mercado', movementDate: '2026-09-20', tags: ['Casa', 'fixa'] }),
      transaction({ id: '2', description: 'Salário', type: 'income', status: 'planned', paymentDate: null, accountId: 'other', movementDate: '2026-09-30', tags: ['trabalho'] }),
    ], { ...EMPTY_TRANSACTION_FILTER, search: 'mercado', movementFrom: '2026-09-01', movementTo: '2026-09-25', tag: 'fix' });
    expect(result.map((item) => item.id)).toEqual(['1']);
  });

  it('calcula realizados e previstos sem incluir cancelados', () => {
    const totals = calculateTransactionTotals([
      transaction({ id: 'paid-expense', amountCents: 1000 }),
      transaction({ id: 'paid-income', amountCents: 5000, type: 'income' }),
      transaction({ id: 'pending-expense', amountCents: 700, status: 'pending', paymentDate: null }),
      transaction({ id: 'cancelled', amountCents: 9999, status: 'cancelled', paymentDate: null }),
    ]);
    expect(totals).toMatchObject({ count: 3, realizedIncomeCents: 5000, realizedExpenseCents: 1000, forecastExpenseCents: 700, netRealizedCents: 4000, netForecastCents: -700 });
  });

  it('não duplica o pagamento da fatura nos totais de receitas e despesas', () => {
    const totals = calculateTransactionTotals([
      transaction({ id: 'installment', amountCents: 1200, status: 'pending', paymentDate: null, accountId: null, creditCardId: 'card', cardInvoiceId: 'invoice', installmentGroupId: 'group' }),
      transaction({ id: 'invoice-payment', amountCents: 1200, accountId: 'main', status: 'paid', cardInvoiceId: 'invoice', creditCardId: null, categoryId: null }),
    ]);
    expect(totals).toMatchObject({ count: 1, forecastExpenseCents: 1200, realizedExpenseCents: 0 });
  });

  it('pagina sem perder a página válida e normaliza tags duplicadas', () => {
    const page = paginateTransactions([transaction({ id: '1' }), transaction({ id: '2', movementDate: '2026-09-19' }), transaction({ id: '3', movementDate: '2026-09-18' })], EMPTY_TRANSACTION_FILTER, 2, 2);
    expect(page.items.map((item) => item.id)).toEqual(['3']);
    expect(normalizeTags(' Casa, casa, fixas , , viagem ')).toEqual(['Casa', 'fixas', 'viagem']);
  });

  it('impede exclusão quando há vínculo especial', () => {
    expect(canDeleteTransaction(transaction({}))).toBe(true);
    expect(canDeleteTransaction(transaction({ recurrenceRuleId: 'rec-1' }))).toBe(false);
    expect(canDeleteTransaction(transaction({ installmentGroupId: 'installment-1' }))).toBe(false);
  });

  it('filtra grupos de categorias, sem categoria e somente lançamentos em aberto', () => {
    const result = filterTransactions([
      transaction({ id: 'category-a', categoryId: 'a', status: 'pending' }),
      transaction({ id: 'category-b', categoryId: 'b', status: 'paid' }),
      transaction({ id: 'uncategorized', categoryId: null, status: 'planned' }),
    ], { ...EMPTY_TRANSACTION_FILTER, categoryIds: ['a', 'b'], uncategorized: true, openOnly: true });
    expect(result.map((item) => item.id)).toEqual(['category-a', 'uncategorized']);
  });

  it('não conta transferências como receita ou despesa', () => {
    const totals = calculateTransactionTotals([
      transaction({ id: 'income', type: 'income', categoryId: 'salary' }),
      transaction({ id: 'transfer', type: 'transfer', categoryId: null, accountId: null, fromAccountId: 'main', toAccountId: 'reserve', transferId: 'transfer' }),
    ]);
    expect(totals.count).toBe(1);
    expect(totals.realizedIncomeCents).toBe(1000);
    expect(totals.realizedExpenseCents).toBe(0);
  });
});
