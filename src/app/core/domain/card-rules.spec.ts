import { describe, expect, it } from 'vitest';
import { calculateAvailableCreditLimit, calculateCreditLimitUsed, calculateInstallmentAmounts, calculateInvoiceClosingDate, calculateInvoiceCompetence, calculateInvoiceDueDate, calculateInvoicePeriod, calculateInvoiceTotal, planCardInstallments } from './card-rules';
import { CreditCard, CreditCardInvoice, Transaction } from './models';

const card = (overrides: Partial<CreditCard> = {}): CreditCard => ({
  id: 'card', createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z', archived: false,
  name: 'Cartão', brand: null, institution: null, paymentAccountId: 'account', color: '#000', icon: '▣', creditLimitCents: 10000, closingDay: 20, dueDay: 5, ...overrides,
});

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx', createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z', archived: false,
  description: 'Parcela', amountCents: 1000, type: 'expense', movementDate: '2026-09-01', dueDate: '2026-10-05', paymentDate: null, paymentMethod: 'credit-card', status: 'pending', categoryId: 'category', accountId: null, fromAccountId: null, toAccountId: null, creditCardId: 'card', tags: [], notes: '', recurrenceRuleId: null, recurrenceOccurrenceKey: null, transferId: null, installmentGroupId: 'group', cardInvoiceId: 'invoice', ...overrides,
});

const invoice: CreditCardInvoice = { id: 'invoice', createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z', archived: false, creditCardId: 'card', competence: '2026-09', closingDate: '2026-09-20', dueDate: '2026-10-05', status: 'paid', paidAt: '2026-10-01', paymentTransactionId: 'payment' };

describe('regras de cartões, parcelamento e faturas', () => {
  it('distribui centavos de forma determinística e preserva a soma', () => {
    const installments = calculateInstallmentAmounts(1000, 3);
    expect(installments).toEqual([334, 333, 333]);
    expect(installments.reduce((sum, value) => sum + value, 0)).toBe(1000);
    expect(planCardInstallments(1000, 3, '2026-09').map((item) => item.competence)).toEqual(['2026-09', '2026-10', '2026-11']);
  });

  it('envia compra posterior ao fechamento para a competência seguinte', () => {
    expect(calculateInvoiceCompetence('2026-09-20', 20)).toBe('2026-09');
    expect(calculateInvoiceCompetence('2026-09-21', 20)).toBe('2026-10');
  });

  it('ajusta fechamento e vencimento para meses curtos', () => {
    expect(calculateInvoiceClosingDate('2026-02', 31)).toBe('2026-02-28');
    expect(calculateInvoiceDueDate('2028-02', 20, 31)).toBe('2028-02-29');
    expect(calculateInvoiceDueDate('2026-02', 20, 5)).toBe('2026-03-05');
    expect(calculateInvoicePeriod('2026-03', 20)).toEqual({ from: '2026-02-21', to: '2026-03-20' });
  });

  it('mantém limite comprometido depois do pagamento da fatura', () => {
    const transactions = [transaction({ amountCents: 4000 }), transaction({ id: 'cancelled', amountCents: 9000, status: 'cancelled' }), transaction({ id: 'payment', creditCardId: null, accountId: 'account', cardInvoiceId: 'invoice', status: 'paid', paymentDate: '2026-10-01', paymentMethod: 'bank-transfer' })];
    expect(calculateCreditLimitUsed(transactions, 'card')).toBe(4000);
    expect(calculateAvailableCreditLimit(card({ creditLimitCents: 10000 }), transactions, 'card')).toBe(6000);
  });

  it('calcula o total somente pelas parcelas da fatura, não pelo débito de pagamento', () => {
    expect(calculateInvoiceTotal(invoice, [transaction({ amountCents: 1234 }), transaction({ id: 'payment', creditCardId: null, accountId: 'account', amountCents: 1234, status: 'paid', paymentDate: '2026-10-01', paymentMethod: 'bank-transfer' })])).toBe(1234);
  });
});
