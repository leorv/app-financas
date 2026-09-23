import { describe, expect, it } from 'vitest';
import { EMPTY_SNAPSHOT, DatabaseSnapshot } from '../domain/models';
import { PersistenceService } from './persistence.service';
import { DatabaseService } from './database';

class FailingDatabase {
  async open(): Promise<void> { return; }
  async readSnapshot(): Promise<DatabaseSnapshot> { return { ...EMPTY_SNAPSHOT, exportedAt: new Date().toISOString() }; }
  async replaceSnapshot(): Promise<void> { throw new Error('Falha simulada de gravação.'); }
  async clearAll(): Promise<void> { throw new Error('Falha simulada de limpeza.'); }
}

class MemoryDatabase {
  snapshot: DatabaseSnapshot = { ...EMPTY_SNAPSHOT, exportedAt: new Date().toISOString() };
  async open(): Promise<void> { return; }
  async readSnapshot(): Promise<DatabaseSnapshot> { return this.snapshot; }
  async replaceSnapshot(snapshot: DatabaseSnapshot): Promise<void> { this.snapshot = snapshot; }
  async clearAll(): Promise<void> { this.snapshot = { ...EMPTY_SNAPSHOT, exportedAt: new Date().toISOString() }; }
}

describe('estado de persistência diante de falhas', () => {
  it('diferencia carregamento com erro e preserva o snapshot exibido', async () => {
    const persistence = new PersistenceService(new FailingDatabase() as unknown as DatabaseService);
    await persistence.initialize();
    expect(persistence.status()).toBe('empty');
    const before = persistence.snapshot();
    const saved = await persistence.save({ ...before, exportedAt: new Date().toISOString() });
    expect(saved).toBe(false);
    expect(persistence.status()).toBe('empty');
    expect(persistence.snapshot()).toEqual(before);
    expect(persistence.errorMessage()).toContain('Falha simulada');
  });

  it('serializa atualizações e aplica cada uma sobre o snapshot mais recente', async () => {
    const persistence = new PersistenceService(new MemoryDatabase() as unknown as DatabaseService);
    await persistence.initialize();
    const first = persistence.update((current) => ({
      ...current,
      categories: [{
        id: 'category', createdAt: '', updatedAt: '', archived: false, type: 'expense', name: 'Casa', normalizedName: 'casa', color: '#000', icon: '⌂', parentId: null, sortOrder: 0,
      }],
    }));
    const second = persistence.update((current) => ({
      ...current,
      accounts: [{
        id: 'account', createdAt: '', updatedAt: '', archived: false, name: 'Conta', normalizedName: 'conta', type: 'checking', institution: null, color: '#000', icon: '◉', initialBalanceCents: 0, isDefault: true,
      }],
    }));
    await Promise.all([first, second]);
    expect(persistence.snapshot().categories).toHaveLength(1);
    expect(persistence.snapshot().accounts).toHaveLength(1);
  });
});
