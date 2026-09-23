import { Injectable, signal } from '@angular/core';
import { migrateSnapshot } from '../persistence/migrations';
import { PersistenceService } from '../persistence/persistence.service';
import {
  BACKUP_SCHEMA_VERSION,
  BackupDocument,
  BackupSummary,
  createBackupDocument,
  createTransactionsCsv,
  CsvExport,
  DownloadableTextFile,
  MAX_BACKUP_FILE_BYTES,
  snapshotsHaveSameData,
  summarizeSnapshot,
} from '../domain/import-export';
import { DatabaseSnapshot } from '../domain/models';
import { filterTransactions, TransactionFilter } from '../domain/transaction-rules';
import { validateSnapshot } from '../domain/snapshot-validator';

export interface ImportPreview {
  readonly fileName: string;
  readonly fileSizeBytes: number;
  readonly snapshot: DatabaseSnapshot;
  readonly summary: BackupSummary;
}

export interface ImportResult {
  readonly safetyBackup: BackupDocument;
  readonly summary: BackupSummary;
}

@Injectable({ providedIn: 'root' })
export class ImportExportService {
  readonly lastAutomaticBackup = signal<BackupDocument | null>(null);

  constructor(private readonly persistence: PersistenceService) {}

  createCurrentBackup(now = new Date()): BackupDocument {
    return createBackupDocument(this.persistence.snapshot(), now);
  }

  previewImport(text: string, fileSizeBytes = utf8ByteLength(text), fileName = 'backup.json'): ImportPreview {
    if (!Number.isSafeInteger(fileSizeBytes) || fileSizeBytes < 0) {
      throw new Error('O tamanho do backup não pôde ser determinado.');
    }
    if (fileSizeBytes > MAX_BACKUP_FILE_BYTES) {
      throw new Error(`O backup excede o limite de ${MAX_BACKUP_FILE_BYTES / (1024 * 1024)} MiB.`);
    }
    let value: unknown;
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      throw new Error('O arquivo selecionado não contém um JSON válido.');
    }
    let migrated: unknown;
    try {
      migrated = migrateSnapshot(value);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Não foi possível migrar o backup.');
    }
    const validation = validateSnapshot(migrated);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    if (validation.snapshot.schemaVersion !== BACKUP_SCHEMA_VERSION) {
      throw new Error('A versão deste backup não é compatível.');
    }
    const snapshot: DatabaseSnapshot = { ...validation.snapshot, appVersion: validation.snapshot.settings.appVersion };
    return {
      fileName: fileName || 'backup.json',
      fileSizeBytes,
      snapshot,
      summary: summarizeSnapshot(snapshot),
    };
  }

  createFilteredCsv(filter: TransactionFilter, now = new Date()): CsvExport {
    const snapshot = this.persistence.snapshot();
    return createTransactionsCsv(filterTransactions(snapshot.transactions, filter), snapshot.accounts, snapshot.categories, now);
  }

  async replaceWithPreview(preview: ImportPreview): Promise<ImportResult> {
    const validation = validateSnapshot(preview.snapshot);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    const safetyBackup = createBackupDocument(this.persistence.snapshot());
    this.lastAutomaticBackup.set(safetyBackup);
    const saved = await this.persistence.save(validation.snapshot);
    if (!saved) {
      throw new Error(this.persistence.errorMessage() ?? 'Não foi possível substituir os dados atuais.');
    }
    await this.persistence.initialize();
    if (this.persistence.status() === 'error') {
      throw new Error(this.persistence.errorMessage() ?? 'Os dados foram gravados, mas não puderam ser conferidos.');
    }
    if (!snapshotsHaveSameData(validation.snapshot, this.persistence.snapshot())) {
      throw new Error('A conferência do backup restaurado encontrou diferenças; os dados não foram considerados importados.');
    }
    return { safetyBackup, summary: summarizeSnapshot(this.persistence.snapshot()) };
  }

  download(file: DownloadableTextFile): void {
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
      throw new Error('O download só pode ser iniciado no navegador.');
    }
    const blob = new Blob([file.content], { type: file.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
