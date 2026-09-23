import { Injectable, signal } from '@angular/core';
import { DatabaseService } from './database';
import { DatabaseSnapshot, EMPTY_SNAPSHOT, Settings } from '../domain/models';
import { utcNow } from '../domain/civil-date';
import { validateSnapshot } from '../domain/snapshot-validator';
import { migrateSnapshot } from './migrations';

export type PersistenceStatus = 'loading' | 'ready' | 'empty' | 'error';

@Injectable({ providedIn: 'root' })
export class PersistenceService {
  readonly status = signal<PersistenceStatus>('loading');
  readonly snapshot = signal<DatabaseSnapshot>(EMPTY_SNAPSHOT);
  readonly lastSavedAt = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly hasData = signal(false);
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly database: DatabaseService) {}

  async initialize(): Promise<void> {
    this.status.set('loading');
    this.errorMessage.set(null);
    try {
      await this.database.open();
      const value = await this.database.readSnapshot();
      this.snapshot.set(value);
      this.hasData.set(value.accounts.length > 0 || value.categories.length > 0 || value.transactions.length > 0 || value.creditCards.length > 0 || value.budgets.length > 0 || value.goals.length > 0);
      this.lastSavedAt.set(value.settings.updatedAt || null);
      this.status.set(this.hasData() ? 'ready' : 'empty');
    } catch (error) {
      this.fail(error);
    }
  }

  async save(next: DatabaseSnapshot): Promise<boolean> {
    return this.enqueueWrite(() => next);
  }

  async update(mutator: (current: DatabaseSnapshot) => DatabaseSnapshot): Promise<boolean> {
    return this.enqueueWrite(() => mutator(this.snapshot()));
  }

  async updateSettings(changes: Partial<Omit<Settings, 'id' | 'schemaVersion'>>): Promise<boolean> {
    return this.update((current) => ({
      ...current,
      settings: { ...current.settings, ...changes, updatedAt: utcNow() },
    }));
  }

  async restore(value: unknown): Promise<boolean> {
    let migrated: unknown;
    try {
      migrated = migrateSnapshot(value);
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Não foi possível migrar o backup.');
      return false;
    }
    const validation = validateSnapshot(migrated);
    if (!validation.valid) {
      this.errorMessage.set(validation.error);
      return false;
    }
    return this.save(validation.snapshot);
  }

  async clear(): Promise<boolean> {
    const operation = this.writeQueue.then(async () => {
      this.errorMessage.set(null);
      try {
        await this.database.clearAll();
        const reset = { ...EMPTY_SNAPSHOT, exportedAt: utcNow(), settings: { ...EMPTY_SNAPSHOT.settings, updatedAt: utcNow() } };
        this.snapshot.set(reset);
        this.lastSavedAt.set(null);
        this.hasData.set(false);
        this.status.set('empty');
        return true;
      } catch (error) {
        this.recordWriteFailure(error);
        return false;
      }
    });
    this.writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private enqueueWrite(resolve: () => DatabaseSnapshot): Promise<boolean> {
    const operation = this.writeQueue.then(async () => {
      this.errorMessage.set(null);
      try {
        const next = resolve();
        const updatedAt = utcNow();
        const normalized: DatabaseSnapshot = {
          ...next,
          exportedAt: utcNow(),
          settings: { ...next.settings, updatedAt },
        };
        await this.database.replaceSnapshot(normalized);
        this.snapshot.set(normalized);
        this.lastSavedAt.set(updatedAt);
        this.hasData.set(normalized.accounts.length > 0 || normalized.categories.length > 0 || normalized.transactions.length > 0 || normalized.creditCards.length > 0 || normalized.budgets.length > 0 || normalized.goals.length > 0);
        this.status.set('ready');
        return true;
      } catch (error) {
        this.recordWriteFailure(error);
        return false;
      }
    });
    this.writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private fail(error: unknown): void {
    this.status.set('error');
    this.errorMessage.set(error instanceof Error ? error.message : 'Não foi possível carregar os dados locais.');
  }

  private recordWriteFailure(error: unknown): void {
    this.errorMessage.set(error instanceof Error ? error.message : 'Não foi possível salvar os dados locais.');
  }
}
