import { describe, expect, it } from 'vitest';
import { calculateAccountBalance } from './account-balance';
import { Account, Transaction } from './models';

const account = (id: string): Account => ({ id, createdAt: '', updatedAt: '', archived: false, name: id, normalizedName: id, type: 'checking', institution: null, color: '#000', icon: '◉', initialBalanceCents: 10000, isDefault: false });
const transaction = (overrides: Partial<Transaction>): Transaction => ({ id: 'tx', createdAt: '', updatedAt: '', archived: false, description: 'teste', amountCents: 1000, type: 'expense', movementDate: '2026-09-20', dueDate: null, paymentDate: '2026-09-20', paymentMethod: 'pix', status: 'paid', categoryId: null, accountId: 'a', fromAccountId: null, toAccountId: null, creditCardId: null, tags: [], notes: '', recurrenceRuleId: null, recurrenceOccurrenceKey: null, transferId: null, installmentGroupId: null, cardInvoiceId: null, ...overrides });

describe('saldo de conta', () => {
  it('usa saldo inicial e somente movimentações efetivadas', () => {
    const result = calculateAccountBalance(account('a'), [
      transaction({ id: 'expense', amountCents: 2500 }),
      transaction({ id: 'planned', amountCents: 9000, status: 'planned' }),
      transaction({ id: 'income', amountCents: 5000, type: 'income' }),
      transaction({ id: 'cancelled', amountCents: 8000, status: 'cancelled' }),
    ]);
    expect(result).toBe(12500);
  });

  it('lança transferências nos dois lados, sem transformá-las em receita/despesa', () => {
    const source = calculateAccountBalance(account('a'), [transaction({ type: 'transfer', fromAccountId: 'a', toAccountId: 'b', amountCents: 3000 })]);
    const target = calculateAccountBalance(account('b'), [transaction({ type: 'transfer', fromAccountId: 'a', toAccountId: 'b', amountCents: 3000 })]);
    expect(source).toBe(7000);
    expect(target).toBe(13000);
  });
});
