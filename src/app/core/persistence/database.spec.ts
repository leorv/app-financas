import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseService, DATABASE_NAME } from './database';
import { EMPTY_SNAPSHOT } from '../domain/models';

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

describe('persistência IndexedDB', () => {
  afterEach(async () => { await deleteDatabase(); });

  it('cria a estrutura e recupera os dados depois de uma gravação transacional', async () => {
    const database = new DatabaseService();
    await database.open();
    const saved = { ...EMPTY_SNAPSHOT, exportedAt: '2026-09-20T12:00:00.000Z', settings: { ...EMPTY_SNAPSHOT.settings, firstAccessCompleted: true, updatedAt: '2026-09-20T12:00:00.000Z' } };
    await database.replaceSnapshot(saved);
    const result = await database.readSnapshot();
    expect(result.settings.firstAccessCompleted).toBe(true);
    expect(result.schemaVersion).toBe(4);
  });

  it('limpa todos os stores sem deixar registros órfãos', async () => {
    const database = new DatabaseService();
    await database.open();
    await database.replaceSnapshot({ ...EMPTY_SNAPSHOT, exportedAt: '2026-09-20T12:00:00.000Z' });
    await database.clearAll();
    expect((await database.readSnapshot()).categories).toHaveLength(0);
  });

  it('persiste o cadastro de cartão nos stores próprios da etapa', async () => {
    const database = new DatabaseService();
    await database.open();
    const timestamp = '2026-09-20T12:00:00.000Z';
    const account = { id: 'account', createdAt: timestamp, updatedAt: timestamp, archived: false, name: 'Conta', normalizedName: 'conta', type: 'checking' as const, institution: null, color: '#000', icon: '◉', initialBalanceCents: 0, isDefault: true };
    const card = { id: 'card', createdAt: timestamp, updatedAt: timestamp, archived: false, name: 'Cartão', brand: 'Visa', institution: null, paymentAccountId: 'account', color: '#3155a6', icon: '▣', creditLimitCents: 10000, closingDay: 20, dueDay: 5 };
    await database.replaceSnapshot({ ...EMPTY_SNAPSHOT, exportedAt: timestamp, accounts: [account], creditCards: [card] });
    const result = await database.readSnapshot();
    expect(result.creditCards[0]).toMatchObject({ name: 'Cartão', brand: 'Visa', paymentAccountId: 'account' });
    expect(result.cardPurchases).toEqual([]);
    expect(result.cardInvoices).toEqual([]);
  });

  it('não aceita snapshot incompatível antes de abrir uma transação de gravação', async () => {
    const database = new DatabaseService();
    await database.open();
    await expect(database.replaceSnapshot({ ...EMPTY_SNAPSHOT, schemaVersion: 1, settings: { ...EMPTY_SNAPSHOT.settings, schemaVersion: 1 }, exportedAt: '2026-09-20T12:00:00.000Z' })).rejects.toThrow('compatível');
  });
});
