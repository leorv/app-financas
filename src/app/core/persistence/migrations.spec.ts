import { describe, expect, it } from 'vitest';
import { EMPTY_SNAPSHOT } from '../domain/models';
import { migrateSnapshot } from './migrations';

describe('migrações do esquema', () => {
  it('mantém snapshots na versão atual sem alterar seus dados', () => {
    const snapshot = { ...EMPTY_SNAPSHOT, exportedAt: '2026-09-20T12:00:00.000Z' };
    expect(migrateSnapshot(snapshot)).toEqual(snapshot);
  });

  it('rejeita backup sem versão ou mais novo que o aplicativo', () => {
    expect(() => migrateSnapshot({})).toThrow('versão de esquema');
    expect(() => migrateSnapshot({ schemaVersion: 99 })).toThrow('mais nova');
  });

  it('migra o esquema anterior sem perder cartões e lançamentos existentes', () => {
    const oldSnapshot = {
      ...EMPTY_SNAPSHOT,
      schemaVersion: 1,
      settings: { ...EMPTY_SNAPSHOT.settings, schemaVersion: 1 },
      creditCards: [{ id: 'card', createdAt: '2026-09-20T12:00:00.000Z', updatedAt: '2026-09-20T12:00:00.000Z', archived: false, name: 'Cartão', institution: null, color: '#000', icon: '▣', creditLimitCents: 1000, closingDay: 10, dueDay: 17 }],
      transactions: [],
    };
    const migrated = migrateSnapshot(oldSnapshot) as typeof oldSnapshot & { settings: { schemaVersion: number }; creditCards: Array<Record<string, unknown>>; cardPurchases: unknown[]; cardInvoices: unknown[] };
    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.settings.schemaVersion).toBe(4);
    expect(migrated.creditCards[0]).toMatchObject({ brand: null, paymentAccountId: null });
    expect(migrated.cardPurchases).toEqual([]);
    expect(migrated.cardInvoices).toEqual([]);
  });

  it('completa o modelo de recorrência ao migrar da versão 2', () => {
    const oldSnapshot = {
      ...EMPTY_SNAPSHOT,
      schemaVersion: 2,
      settings: { ...EMPTY_SNAPSHOT.settings, schemaVersion: 2 },
      recurrenceRules: [{ id: 'rule', createdAt: '2026-09-20T12:00:00.000Z', updatedAt: '2026-09-20T12:00:00.000Z', archived: false, frequency: 'monthly', interval: 1, nextDate: '2026-10-01' }],
      transactions: [],
    };
    const migrated = migrateSnapshot(oldSnapshot) as typeof oldSnapshot & { recurrenceRules: Array<Record<string, unknown>>; settings: { schemaVersion: number } };
    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.settings.schemaVersion).toBe(4);
    expect(migrated.recurrenceRules[0]).toMatchObject({ status: 'ended', amountCents: 0, datePolicy: 'clamp', startDate: '2026-10-01' });
  });

  it('migra limites e metas legadas para o modelo de planejamento da versão 4', () => {
    const { goalContributions: _legacyGoalContributions, ...snapshotWithoutGoalStore } = EMPTY_SNAPSHOT;
    const oldSnapshot = {
      ...snapshotWithoutGoalStore,
      schemaVersion: 3,
      settings: { ...EMPTY_SNAPSHOT.settings, schemaVersion: 3 },
      budgets: [{ id: 'budget', createdAt: '2026-09-20T12:00:00.000Z', updatedAt: '2026-09-20T12:00:00.000Z', archived: false, month: '2026-09', categoryId: null, amountCents: 1000 }],
      goals: [{ id: 'goal', createdAt: '2026-09-20T12:00:00.000Z', updatedAt: '2026-09-20T12:00:00.000Z', archived: false, title: 'Reserva', targetCents: 10000, deadline: null, accumulatedCents: 2500, accountId: null }],
    };
    const migrated = migrateSnapshot(oldSnapshot) as typeof oldSnapshot & { budgets: Array<Record<string, unknown>>; goals: Array<Record<string, unknown>>; goalContributions: unknown[] };
    expect(migrated.budgets[0]).toMatchObject({ commitmentPolicy: 'planned-and-pending', alertThresholds: { attentionPercent: 80, warningPercent: 100 } });
    expect(migrated.goals[0]).toMatchObject({ initialCents: 2500, description: '', status: 'active' });
    expect(migrated.goals[0]).not.toHaveProperty('accumulatedCents');
    expect(migrated.goalContributions).toEqual([]);
  });
});
