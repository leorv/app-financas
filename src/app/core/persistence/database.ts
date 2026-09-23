import { Injectable } from '@angular/core';
import { DatabaseSnapshot, EMPTY_SNAPSHOT, Account, Category, Transaction, Settings, CURRENT_SCHEMA_VERSION } from '../domain/models';
import { utcNow } from '../domain/civil-date';
import { validateSnapshot } from '../domain/snapshot-validator';
import { migrateSnapshot } from './migrations';

export const DATABASE_NAME = 'meu-bolso';
export const DATABASE_VERSION = CURRENT_SCHEMA_VERSION;
export const STORE_NAMES = [
  'settings',
  'accounts',
  'creditCards',
  'cardPurchases',
  'cardInvoices',
  'categories',
  'transactions',
  'budgets',
  'goals',
  'goalContributions',
  'recurrenceRules',
] as const;

export type StoreName = (typeof STORE_NAMES)[number];

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private database: IDBDatabase | null = null;

  async open(): Promise<void> {
    if (this.database) {
      return;
    }
    if (typeof indexedDB === 'undefined') {
      throw new Error('Este navegador não disponibiliza armazenamento local.');
    }
    this.database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const storeName of STORE_NAMES) {
          if (!database.objectStoreNames.contains(storeName)) {
            database.createObjectStore(storeName, { keyPath: 'id' });
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(this.toStorageError(request.error));
      request.onblocked = () => reject(new Error('O armazenamento local está bloqueado por outra aba.'));
    });
    this.database.onversionchange = () => {
      this.database?.close();
      this.database = null;
    };
  }

  async readSnapshot(): Promise<DatabaseSnapshot> {
    const database = await this.getDatabase();
    const records = await this.readAll(database, [...STORE_NAMES]);
    const settings = (records.settings[0] as Settings | undefined) ?? this.defaultSettings();
    const rawSnapshot: DatabaseSnapshot = {
      schemaVersion: settings.schemaVersion,
      appVersion: settings.appVersion,
      exportedAt: utcNow(),
      settings,
      accounts: records.accounts as Account[],
      creditCards: records.creditCards as DatabaseSnapshot['creditCards'],
      cardPurchases: records.cardPurchases as DatabaseSnapshot['cardPurchases'],
      cardInvoices: records.cardInvoices as DatabaseSnapshot['cardInvoices'],
      categories: records.categories as Category[],
      transactions: records.transactions as Transaction[],
      budgets: records.budgets as DatabaseSnapshot['budgets'],
      goals: records.goals as DatabaseSnapshot['goals'],
      goalContributions: records.goalContributions as DatabaseSnapshot['goalContributions'],
      recurrenceRules: records.recurrenceRules as DatabaseSnapshot['recurrenceRules'],
    };
    const validation = validateSnapshot(migrateSnapshot(rawSnapshot));
    if (!validation.valid) {
      throw new Error(`Os dados locais estão inválidos: ${validation.error}`);
    }
    return validation.snapshot;
  }

  async replaceSnapshot(snapshot: DatabaseSnapshot): Promise<void> {
    const validation = validateSnapshot(snapshot);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    const database = await this.getDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([...STORE_NAMES], 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(this.toStorageError(transaction.error));
      transaction.onabort = () => reject(this.toStorageError(transaction.error));
      const data: Record<StoreName, readonly unknown[]> = {
        settings: [snapshot.settings],
        accounts: snapshot.accounts,
        creditCards: snapshot.creditCards,
        cardPurchases: snapshot.cardPurchases,
        cardInvoices: snapshot.cardInvoices,
        categories: snapshot.categories,
        transactions: snapshot.transactions,
        budgets: snapshot.budgets,
        goals: snapshot.goals,
        goalContributions: snapshot.goalContributions,
        recurrenceRules: snapshot.recurrenceRules,
      };
      for (const storeName of STORE_NAMES) {
        const store = transaction.objectStore(storeName);
        store.clear();
        for (const record of data[storeName]) {
          store.put(record);
        }
      }
    });
  }

  async clearAll(): Promise<void> {
    const database = await this.getDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([...STORE_NAMES], 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(this.toStorageError(transaction.error));
      transaction.onabort = () => reject(this.toStorageError(transaction.error));
      for (const storeName of STORE_NAMES) {
        transaction.objectStore(storeName).clear();
      }
    });
  }

  private async getDatabase(): Promise<IDBDatabase> {
    await this.open();
    if (!this.database) {
      throw new Error('O armazenamento local não foi inicializado.');
    }
    return this.database;
  }

  private readAll(database: IDBDatabase, stores: readonly StoreName[]): Promise<Record<StoreName, unknown[]>> {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([...stores], 'readonly');
      const result = {} as Record<StoreName, unknown[]>;
      let pending = stores.length;
      for (const storeName of stores) {
        const request = transaction.objectStore(storeName).getAll();
        request.onsuccess = () => {
          result[storeName] = request.result as unknown[];
          pending -= 1;
          if (pending === 0) {
            resolve(result);
          }
        };
        request.onerror = () => reject(this.toStorageError(request.error));
      }
      transaction.onerror = () => reject(this.toStorageError(transaction.error));
    });
  }

  private defaultSettings(): Settings {
    return {
      ...EMPTY_SNAPSHOT.settings,
      updatedAt: '',
    };
  }

  private toStorageError(error: DOMException | null): Error {
    if (error?.name === 'QuotaExceededError') {
      return new Error('Não há espaço suficiente. Exporte um backup e libere espaço no navegador.');
    }
    return new Error(error?.message || 'Não foi possível acessar o armazenamento local.');
  }
}
