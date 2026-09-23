import { describe, expect, it } from 'vitest';
import { EMPTY_SNAPSHOT } from './models';
import { validateSnapshot } from './snapshot-validator';

describe('validação de snapshots', () => {
  it('aceita um snapshot da versão atual', () => {
    const result = validateSnapshot({ ...EMPTY_SNAPSHOT, exportedAt: '2026-09-20T12:00:00.000Z' });
    expect(result.valid).toBe(true);
  });

  it('rejeita versão incompatível, coleções inválidas e datas civis inválidas', () => {
    expect(validateSnapshot({ ...EMPTY_SNAPSHOT, exportedAt: '2026-09-20T12:00:00.000Z', schemaVersion: 1, settings: { ...EMPTY_SNAPSHOT.settings, schemaVersion: 1 } }).valid).toBe(false);
    expect(validateSnapshot({ ...EMPTY_SNAPSHOT, exportedAt: '2026-09-20T12:00:00.000Z', categories: {} }).valid).toBe(false);
    expect(validateSnapshot({ ...EMPTY_SNAPSHOT, exportedAt: '2026-09-20T12:00:00.000Z', transactions: [{ id: 'tx', movementDate: '2026-02-31' }] }).valid).toBe(false);
  });

  it('rejeita entidades incompletas antes de restaurar o backup', () => {
    expect(validateSnapshot({
      ...EMPTY_SNAPSHOT,
      exportedAt: '2026-09-20T12:00:00.000Z',
      accounts: [{ id: 'account' }],
    }).valid).toBe(false);
  });

  it('rejeita referências inexistentes em orçamento e meta', () => {
    expect(validateSnapshot({
      ...EMPTY_SNAPSHOT,
      exportedAt: '2026-09-20T12:00:00.000Z',
      budgets: [{ id: 'budget', createdAt: '2026-09-20T12:00:00.000Z', updatedAt: '2026-09-20T12:00:00.000Z', archived: false, month: '2026-09', categoryId: 'missing', amountCents: 1000, commitmentPolicy: 'planned-and-pending', alertThresholds: { attentionPercent: 80, warningPercent: 100 } }],
    }).valid).toBe(false);
  });

  it('rejeita faixa de alerta inválida e movimentação de meta sem meta vinculada', () => {
    const timestamp = '2026-09-20T12:00:00.000Z';
    const invalidBudget = {
      id: 'budget', createdAt: timestamp, updatedAt: timestamp, archived: false, month: '2026-09', categoryId: null, amountCents: 1000,
      commitmentPolicy: 'planned-and-pending', alertThresholds: { attentionPercent: 100, warningPercent: 80 },
    };
    expect(validateSnapshot({ ...EMPTY_SNAPSHOT, exportedAt: timestamp, budgets: [invalidBudget] }).valid).toBe(false);
    const invalidContribution = { id: 'entry', createdAt: timestamp, updatedAt: timestamp, archived: false, goalId: 'missing', type: 'contribution', amountCents: 1000, date: '2026-09-20', notes: '', accountId: null };
    expect(validateSnapshot({ ...EMPTY_SNAPSHOT, exportedAt: timestamp, goalContributions: [invalidContribution] }).valid).toBe(false);
  });

  it('valida o vínculo de uma transferência e de uma ocorrência recorrente', () => {
    const timestamp = '2026-09-20T12:00:00.000Z';
    const accounts = [
      { id: 'from', createdAt: timestamp, updatedAt: timestamp, archived: false, name: 'Origem', normalizedName: 'origem', type: 'checking' as const, institution: null, color: '#000', icon: '◉', initialBalanceCents: 0, isDefault: true },
      { id: 'to', createdAt: timestamp, updatedAt: timestamp, archived: false, name: 'Destino', normalizedName: 'destino', type: 'savings' as const, institution: null, color: '#000', icon: '◌', initialBalanceCents: 0, isDefault: false },
    ];
    const categories = [{ id: 'category', createdAt: timestamp, updatedAt: timestamp, archived: false, type: 'expense' as const, name: 'Casa', normalizedName: 'casa', color: '#000', icon: '⌂', parentId: null, sortOrder: 0 }];
    const rule = { id: 'rule', createdAt: timestamp, updatedAt: timestamp, archived: false, description: 'Aluguel', amountCents: 1000, type: 'expense' as const, categoryId: 'category', accountId: 'from', paymentMethod: 'pix' as const, startDate: '2026-09-01', endDate: null, maxOccurrences: null, datePolicy: 'clamp' as const, creationStatus: 'planned' as const, tags: [], notes: '', frequency: 'monthly' as const, interval: 1, nextDate: '2026-10-01', status: 'active' as const };
    const transfer = { id: 'transfer', createdAt: timestamp, updatedAt: timestamp, archived: false, description: 'Reserva', amountCents: 1000, type: 'transfer' as const, movementDate: '2026-09-20', dueDate: null, paymentDate: '2026-09-20', paymentMethod: 'bank-transfer' as const, status: 'paid' as const, categoryId: null, accountId: null, fromAccountId: 'from', toAccountId: 'to', creditCardId: null, tags: [], notes: '', recurrenceRuleId: null, recurrenceOccurrenceKey: null, transferId: 'transfer', installmentGroupId: null, cardInvoiceId: null };
    const occurrence = { id: 'occurrence', createdAt: timestamp, updatedAt: timestamp, archived: false, description: 'Aluguel', amountCents: 1000, type: 'expense' as const, movementDate: '2026-09-01', dueDate: '2026-09-01', paymentDate: null, paymentMethod: 'pix' as const, status: 'planned' as const, categoryId: 'category', accountId: 'from', fromAccountId: null, toAccountId: null, creditCardId: null, tags: [], notes: '', recurrenceRuleId: 'rule', recurrenceOccurrenceKey: 'rule:1', transferId: null, installmentGroupId: null, cardInvoiceId: null };
    const snapshot = { ...EMPTY_SNAPSHOT, exportedAt: timestamp, accounts, categories, recurrenceRules: [rule], transactions: [transfer, occurrence] };
    expect(validateSnapshot(snapshot).valid).toBe(true);
    expect(validateSnapshot({ ...snapshot, transactions: [{ ...occurrence, accountId: 'missing' }] }).valid).toBe(false);
  });
});
