import { describe, expect, it } from 'vitest';
import {
  createBackupDocument,
  createTransactionsCsv,
  formatBackupFilename,
  snapshotsHaveSameData,
  summarizeSnapshot,
} from './import-export';
import { Account, Budget, Category, CreditCard, DatabaseSnapshot, EMPTY_SNAPSHOT, FinancialGoal, RecurrenceRule, Transaction } from './models';

const timestamp = '2026-09-20T12:00:00.000Z';

function makeSnapshot(transactions: readonly Transaction[] = [makeTransaction()]): DatabaseSnapshot {
  const account: Account = {
    id: 'account-1', createdAt: timestamp, updatedAt: timestamp, archived: false,
    name: 'Conta principal', normalizedName: 'conta principal', type: 'checking', institution: null,
    color: '#123456', icon: '◉', initialBalanceCents: 10000, isDefault: true,
  };
  const category: Category = {
    id: 'category-1', createdAt: timestamp, updatedAt: timestamp, archived: false,
    type: 'expense', name: 'Casa', normalizedName: 'casa', color: '#654321', icon: '⌂', parentId: null, sortOrder: 0,
  };
  return {
    ...EMPTY_SNAPSHOT,
    exportedAt: timestamp,
    settings: { ...EMPTY_SNAPSHOT.settings, updatedAt: timestamp, firstAccessCompleted: true },
    accounts: [account],
    categories: [category],
    transactions,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'transaction-1', createdAt: timestamp, updatedAt: timestamp, archived: false,
    description: 'Mercado', amountCents: 1010, type: 'expense', movementDate: '2026-09-20', dueDate: null,
    paymentDate: '2026-09-20', paymentMethod: 'pix', status: 'paid', categoryId: 'category-1', accountId: 'account-1',
    fromAccountId: null, toAccountId: null, creditCardId: null, tags: ['casa'], notes: 'Compra do mês',
    recurrenceRuleId: null, recurrenceOccurrenceKey: null, transferId: null, installmentGroupId: null, cardInvoiceId: null, ...overrides,
  };
}

describe('regras de importação e exportação', () => {
  it('gera um backup JSON versionado com nome e resumo consistentes', () => {
    const snapshot = makeSnapshot();
    const file = createBackupDocument(snapshot, new Date(2026, 8, 21, 14, 5));
    const parsed = JSON.parse(file.content) as DatabaseSnapshot;

    expect(file.fileName).toBe('financas-backup-2026-09-21-1405.json');
    expect(parsed.schemaVersion).toBe(4);
    expect(parsed.exportedAt).toBe(new Date(2026, 8, 21, 14, 5).toISOString());
    expect(file.summary.totalRecords).toBe(3);
    expect(file.summary.period).toEqual({ from: '2026-09-20', to: '2026-09-20' });
  });

  it('inclui todas as coleções e vínculos do snapshot no backup', () => {
    const card: CreditCard = {
      id: 'card-1', createdAt: timestamp, updatedAt: timestamp, archived: false, name: 'Cartão', brand: null, institution: null, paymentAccountId: 'account-1',
      color: '#123456', icon: '▣', creditLimitCents: 100000, closingDay: 10, dueDay: 17,
    };
    const budget: Budget = {
      id: 'budget-1', createdAt: timestamp, updatedAt: timestamp, archived: false, month: '2026-09', categoryId: 'category-1', amountCents: 50000,
      commitmentPolicy: 'planned-and-pending', alertThresholds: { attentionPercent: 80, warningPercent: 100 },
    };
    const goal: FinancialGoal = {
      id: 'goal-1', createdAt: timestamp, updatedAt: timestamp, archived: false, title: 'Reserva', description: 'Segurança', targetCents: 100000, initialCents: 1000,
      deadline: '2027-09-20', accountId: 'account-1', color: '#0d6b63', icon: '◇', status: 'active',
    };
    const recurrence: RecurrenceRule = {
      id: 'recurrence-1', createdAt: timestamp, updatedAt: timestamp, archived: false, description: 'Mensalidade', amountCents: 1010, type: 'expense', categoryId: 'category-1', accountId: 'account-1', paymentMethod: 'pix', startDate: '2026-09-20', endDate: null, maxOccurrences: null, datePolicy: 'clamp', creationStatus: 'planned', tags: [], notes: '', frequency: 'monthly', interval: 1, nextDate: '2026-10-20', status: 'active',
    };
    const snapshot = {
      ...makeSnapshot([makeTransaction({ creditCardId: 'card-1', recurrenceRuleId: 'recurrence-1', installmentGroupId: 'installment-1' })]),
      creditCards: [card], budgets: [budget], goals: [goal], recurrenceRules: [recurrence],
    };
    const file = createBackupDocument(snapshot);

    expect(file.snapshot.creditCards).toHaveLength(1);
    expect(file.snapshot.budgets[0].categoryId).toBe('category-1');
    expect(file.snapshot.goals[0].accountId).toBe('account-1');
    expect(file.snapshot.transactions[0].creditCardId).toBe('card-1');
    expect(JSON.parse(file.content).recurrenceRules).toHaveLength(1);
  });

  it('resume avisos sem apagar registros históricos', () => {
    const snapshot = makeSnapshot([
      makeTransaction({ id: 'paid', status: 'paid' }),
      makeTransaction({ id: 'cancelled', status: 'cancelled', paymentDate: null, description: 'Cancelada' }),
    ]);
    const archived = { ...snapshot.categories[0], archived: true };
    const summary = summarizeSnapshot({ ...snapshot, categories: [archived] });

    expect(summary.transactions).toBe(2);
    expect(summary.warnings).toEqual([
      '1 registro(s) arquivado(s) serão preservados para o histórico.',
      '1 movimentação(ões) cancelada(s) serão preservadas, mas não entram nos totais.',
    ]);
  });

  it('gera CSV UTF-8 com cabeçalho, valores em pt-BR e escape de textos', () => {
    const transaction = makeTransaction({ description: 'Mercado; "São José"', notes: 'Linha 1\nLinha 2' });
    const base = makeSnapshot();
    const file = createTransactionsCsv([transaction], base.accounts, base.categories, new Date(2026, 8, 21, 14, 5));

    expect(file.content.startsWith('\uFEFF')).toBe(true);
    expect(file.content).toContain('Descrição;Tipo;Valor (BRL);Data de competência');
    expect(file.content).toContain('"Mercado; ""São José"""');
    expect(file.content).toContain('10,10');
    expect(file.content).toContain('20 de set. de 2026');
    expect(file.content).not.toContain('Total');
    expect(file.rowCount).toBe(1);
    expect(file.fileName).toBe('financas-movimentacoes-2026-09-21-1405.csv');
  });

  it('confere os dados ignorando somente metadados voláteis e ordem de stores', () => {
    const snapshot = makeSnapshot([
      makeTransaction({ id: 'b' }),
      makeTransaction({ id: 'a', description: 'Outra' }),
    ]);
    const sameData = {
      ...snapshot,
      exportedAt: '2026-09-21T00:00:00.000Z',
      settings: { ...snapshot.settings, updatedAt: '2026-09-21T00:00:00.000Z' },
      transactions: [snapshot.transactions[1], snapshot.transactions[0]],
    };

    expect(snapshotsHaveSameData(snapshot, sameData)).toBe(true);
    expect(snapshotsHaveSameData(snapshot, { ...sameData, transactions: [{ ...sameData.transactions[0], amountCents: 999 }] })).toBe(false);
  });

  it('formata o nome do arquivo sem alterar a data civil local', () => {
    expect(formatBackupFilename(new Date(2026, 1, 3, 9, 7))).toBe('financas-backup-2026-02-03-0907.json');
  });
});
