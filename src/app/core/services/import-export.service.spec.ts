import { describe, expect, it } from 'vitest';
import { createBackupDocument, MAX_BACKUP_FILE_BYTES } from '../domain/import-export';
import { DatabaseSnapshot, EMPTY_SNAPSHOT, Transaction } from '../domain/models';
import { EMPTY_TRANSACTION_FILTER } from '../domain/transaction-rules';
import { DatabaseService } from '../persistence/database';
import { PersistenceService } from '../persistence/persistence.service';
import { ImportExportService } from './import-export.service';

const timestamp = '2026-09-20T12:00:00.000Z';

function makeTransaction(id: string, status: Transaction['status'] = 'paid'): Transaction {
  return {
    id, createdAt: timestamp, updatedAt: timestamp, archived: false,
    description: id === 'paid' ? 'Despesa paga' : 'Despesa prevista', amountCents: 1010, type: 'expense', movementDate: '2026-09-20',
    dueDate: '2026-09-21', paymentDate: status === 'paid' ? '2026-09-20' : null, paymentMethod: 'pix', status,
    categoryId: 'category-1', accountId: 'account-1', fromAccountId: null, toAccountId: null, creditCardId: null,
    tags: [], notes: '', recurrenceRuleId: null, recurrenceOccurrenceKey: null, transferId: null, installmentGroupId: null, cardInvoiceId: null,
  };
}

function makeSnapshot(transactions: readonly Transaction[] = [makeTransaction('paid')]): DatabaseSnapshot {
  return {
    ...EMPTY_SNAPSHOT,
    exportedAt: timestamp,
    settings: { ...EMPTY_SNAPSHOT.settings, updatedAt: timestamp, firstAccessCompleted: true },
    accounts: [{
      id: 'account-1', createdAt: timestamp, updatedAt: timestamp, archived: false, name: 'Conta', normalizedName: 'conta',
      type: 'checking', institution: null, color: '#123456', icon: '◉', initialBalanceCents: 0, isDefault: true,
    }],
    categories: [{
      id: 'category-1', createdAt: timestamp, updatedAt: timestamp, archived: false, type: 'expense', name: 'Casa',
      normalizedName: 'casa', color: '#654321', icon: '⌂', parentId: null, sortOrder: 0,
    }],
    transactions,
  };
}

class MemoryDatabase {
  snapshot: DatabaseSnapshot = { ...EMPTY_SNAPSHOT, exportedAt: timestamp };

  async open(): Promise<void> { return; }
  async readSnapshot(): Promise<DatabaseSnapshot> { return this.snapshot; }
  async replaceSnapshot(snapshot: DatabaseSnapshot): Promise<void> { this.snapshot = snapshot; }
  async clearAll(): Promise<void> { this.snapshot = { ...EMPTY_SNAPSHOT, exportedAt: timestamp }; }
}

class FailingDatabase extends MemoryDatabase {
  override async replaceSnapshot(): Promise<void> { throw new Error('Falha simulada ao substituir os dados.'); }
}

describe('ImportExportService', () => {
  it('valida JSON, versão e limite de tamanho sem tocar no snapshot atual', async () => {
    const database = new MemoryDatabase();
    const persistence = new PersistenceService(database as unknown as DatabaseService);
    await persistence.initialize();
    const service = new ImportExportService(persistence);
    const before = database.snapshot;

    expect(() => service.previewImport('{malformado', 12)).toThrow('JSON válido');
    expect(() => service.previewImport('{}', MAX_BACKUP_FILE_BYTES + 1)).toThrow('10 MiB');
    expect(() => service.previewImport(JSON.stringify({ schemaVersion: 99 }), 30)).toThrow('mais nova');
    expect(database.snapshot).toBe(before);
  });

  it('reporta vínculos inexistentes e identificadores duplicados antes da confirmação', async () => {
    const persistence = new PersistenceService(new MemoryDatabase() as unknown as DatabaseService);
    await persistence.initialize();
    const service = new ImportExportService(persistence);
    const document = JSON.parse(createBackupDocument(makeSnapshot()).content) as Record<string, unknown>;
    const brokenReference = structuredClone(document) as Record<string, unknown>;
    const brokenTransactions = brokenReference['transactions'] as Array<Record<string, unknown>>;
    brokenTransactions[0]['accountId'] = 'missing-account';
    expect(() => service.previewImport(JSON.stringify(brokenReference))).toThrow('referências inexistentes');

    const duplicate = structuredClone(document) as Record<string, unknown>;
    const accounts = duplicate['accounts'] as Array<Record<string, unknown>>;
    accounts.push({ ...accounts[0] });
    expect(() => service.previewImport(JSON.stringify(duplicate))).toThrow('duplicados');
  });

  it('mostra a prévia, prepara backup de segurança e substitui em uma operação conferida', async () => {
    const database = new MemoryDatabase();
    const persistence = new PersistenceService(database as unknown as DatabaseService);
    await persistence.initialize();
    await persistence.save(makeSnapshot([makeTransaction('old')]));
    const service = new ImportExportService(persistence);
    const imported = makeSnapshot([makeTransaction('paid')]);
    const document = createBackupDocument(imported, new Date(2026, 8, 21, 14, 5));
    const preview = service.previewImport(document.content, new TextEncoder().encode(document.content).byteLength, document.fileName);

    expect(preview.summary.transactions).toBe(1);
    const result = await service.replaceWithPreview(preview);

    expect(result.summary.transactions).toBe(1);
    expect(database.snapshot.transactions[0].id).toBe('paid');
    expect(service.lastAutomaticBackup()?.snapshot.transactions[0].id).toBe('old');
    expect(service.lastAutomaticBackup()?.fileName).toMatch(/^financas-backup-/);
  });

  it('não grava nada quando o usuário apenas cancela a prévia', async () => {
    const database = new MemoryDatabase();
    const persistence = new PersistenceService(database as unknown as DatabaseService);
    await persistence.initialize();
    await persistence.save(makeSnapshot([makeTransaction('current')]));
    const before = database.snapshot;
    const service = new ImportExportService(persistence);
    const document = createBackupDocument(makeSnapshot([makeTransaction('other')]));

    service.previewImport(document.content, document.content.length, document.fileName);

    expect(database.snapshot).toBe(before);
    expect(service.lastAutomaticBackup()).toBeNull();
  });

  it('preserva os dados atuais quando a transação de substituição falha', async () => {
    const database = new FailingDatabase();
    const persistence = new PersistenceService(database as unknown as DatabaseService);
    await persistence.initialize();
    const before = persistence.snapshot();
    const service = new ImportExportService(persistence);
    const document = createBackupDocument(makeSnapshot());
    const preview = service.previewImport(document.content, document.content.length, document.fileName);

    await expect(service.replaceWithPreview(preview)).rejects.toThrow('Falha simulada');
    expect(persistence.snapshot()).toEqual(before);
    expect(service.lastAutomaticBackup()).not.toBeNull();
  });

  it('exporta exatamente as movimentações retornadas pelo filtro ativo', async () => {
    const database = new MemoryDatabase();
    const persistence = new PersistenceService(database as unknown as DatabaseService);
    await persistence.initialize();
    await persistence.save(makeSnapshot([makeTransaction('paid', 'paid'), makeTransaction('planned', 'planned')]));
    const service = new ImportExportService(persistence);

    const file = service.createFilteredCsv({ ...EMPTY_TRANSACTION_FILTER, status: 'paid' }, new Date(2026, 8, 21, 14, 5));

    expect(file.rowCount).toBe(1);
    expect(file.content).toContain('Despesa paga');
    expect(file.content).not.toContain('Despesa prevista');
  });
});
