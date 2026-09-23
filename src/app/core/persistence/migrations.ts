import { CURRENT_SCHEMA_VERSION } from '../domain/models';

export type SnapshotMigration = (snapshot: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrações são aplicadas antes da validação estrutural. Cada função deve ser
 * pura: se lançar erro, o chamador não inicia a restauração. A atualização do
 * IndexedDB também ocorre dentro da transação nativa de upgrade, que faz
 * rollback automático quando o callback falha.
 */
export const SNAPSHOT_MIGRATIONS: Readonly<Record<number, SnapshotMigration>> = {
  1: (snapshot) => {
    const settings = isRecord(snapshot['settings']) ? snapshot['settings'] : {};
    const creditCards = Array.isArray(snapshot['creditCards'])
      ? snapshot['creditCards'].map((card) => isRecord(card) ? { brand: null, paymentAccountId: null, ...card } : card)
      : [];
    const transactions = Array.isArray(snapshot['transactions'])
      ? snapshot['transactions'].map((transaction) => isRecord(transaction) ? { cardInvoiceId: null, ...transaction } : transaction)
      : [];
    return {
      ...snapshot,
      settings: { ...settings, schemaVersion: 2 },
      creditCards,
      transactions,
      cardPurchases: Array.isArray(snapshot['cardPurchases']) ? snapshot['cardPurchases'] : [],
      cardInvoices: Array.isArray(snapshot['cardInvoices']) ? snapshot['cardInvoices'] : [],
    };
  },
  2: (snapshot) => {
    const settings = isRecord(snapshot['settings']) ? snapshot['settings'] : {};
    const transactions = Array.isArray(snapshot['transactions'])
      ? snapshot['transactions'].map((transaction) => isRecord(transaction) ? { recurrenceOccurrenceKey: null, ...transaction } : transaction)
      : [];
    const recurrenceRules = Array.isArray(snapshot['recurrenceRules'])
      ? snapshot['recurrenceRules'].map((rule) => {
        if (!isRecord(rule)) return rule;
        const nextDate = typeof rule['nextDate'] === 'string' ? rule['nextDate'] : '1970-01-01';
        return {
          description: 'Recorrência migrada',
          amountCents: 0,
          type: 'expense',
          categoryId: null,
          accountId: null,
          paymentMethod: 'other',
          startDate: nextDate,
          endDate: null,
          maxOccurrences: null,
          datePolicy: 'clamp',
          creationStatus: 'planned',
          tags: [],
          notes: '',
          status: 'ended',
          ...rule,
        };
      })
      : [];
    return {
      ...snapshot,
      settings: { ...settings, schemaVersion: 3 },
      transactions,
      recurrenceRules,
    };
  },
  3: (snapshot) => {
    const settings = isRecord(snapshot['settings']) ? snapshot['settings'] : {};
    const budgets = Array.isArray(snapshot['budgets'])
      ? snapshot['budgets'].map((budget) => isRecord(budget) ? {
        commitmentPolicy: 'planned-and-pending',
        alertThresholds: { attentionPercent: 80, warningPercent: 100 },
        ...budget,
      } : budget)
      : [];
    const goals = Array.isArray(snapshot['goals'])
      ? snapshot['goals'].map((goal) => {
        if (!isRecord(goal)) return goal;
        const accumulatedCents = typeof goal['accumulatedCents'] === 'number' ? goal['accumulatedCents'] : 0;
        const { accumulatedCents: _legacyAccumulatedCents, ...withoutLegacyAccumulated } = goal;
        return {
          description: '',
          initialCents: accumulatedCents,
          color: '#0d6b63',
          icon: '◇',
          status: 'active',
          ...withoutLegacyAccumulated,
        };
      })
      : [];
    return {
      ...snapshot,
      settings: { ...settings, schemaVersion: 4 },
      budgets,
      goals,
      goalContributions: Array.isArray(snapshot['goalContributions']) ? snapshot['goalContributions'] : [],
    };
  },
};

export function migrateSnapshot(value: unknown): unknown {
  if (!isRecord(value) || typeof value['schemaVersion'] !== 'number') {
    throw new Error('O backup não informa uma versão de esquema válida.');
  }
  let version = value['schemaVersion'];
  let current = value;
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error('A versão deste backup é mais nova que a versão do aplicativo.');
  }
  while (version < CURRENT_SCHEMA_VERSION) {
    const migration = SNAPSHOT_MIGRATIONS[version];
    if (!migration) {
      throw new Error(`Não existe migração disponível da versão ${version}.`);
    }
    current = migration(current);
    version += 1;
    current['schemaVersion'] = version;
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
