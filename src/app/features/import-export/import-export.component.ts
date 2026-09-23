import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { formatCivilDate } from '../../core/domain/civil-date';
import { BackupSummary, MAX_BACKUP_FILE_BYTES, summarizeSnapshot } from '../../core/domain/import-export';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { ImportExportService, ImportPreview } from '../../core/services/import-export.service';
import { NotificationService } from '../../core/services/notification.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { SettingsService } from '../../core/services/settings.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';

@Component({
  selector: 'app-import-export',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (persistence.status() === 'loading') {
      <div class="loading-state"><span class="spinner" aria-hidden="true"></span>Carregando dados para portabilidade…</div>
    } @else if (persistence.status() === 'error') {
      <section class="card card-padding error-state" role="alert">
        <h2>Não foi possível acessar seus dados</h2>
        <p>{{ persistence.errorMessage() }}</p>
        <button type="button" class="button-secondary" (click)="reload()">Tentar novamente</button>
      </section>
    } @else {
      <app-page-header
        eyebrow="Portabilidade local"
        title="Importar e exportar"
        description="Baixe um backup completo ou revise um arquivo antes de substituir os dados deste dispositivo."
      >
        <a page-actions routerLink="/transactions" class="button-secondary">Ver movimentações</a>
      </app-page-header>

      <div class="grid grid-2 import-export-grid">
        <section class="card card-padding" aria-labelledby="backup-export-title">
          <div class="section-heading" style="margin-top:0">
            <div><h2 id="backup-export-title">Backup JSON completo</h2><p class="muted small">Inclui configurações, cadastros, movimentações e entidades preparadas para as próximas etapas.</p></div>
            <span class="entity-icon small" aria-hidden="true">⇩</span>
          </div>
          @if (summary().totalRecords === 0) {
            <app-empty-state
              icon="∅"
              title="Ainda não há dados para exportar"
              description="Crie a primeira movimentação ou importe um backup para começar seu arquivo financeiro."
              actionLabel="Começar arquivo novo"
              (action)="startNewFile()"
            ></app-empty-state>
          } @else {
            <div class="import-summary-grid" aria-label="Resumo dos dados atuais">
              <div><span class="label">Registros</span><strong>{{ summary().totalRecords }}</strong></div>
              <div><span class="label">Movimentações</span><strong>{{ summary().transactions }}</strong></div>
              <div><span class="label">Período</span><strong>{{ periodLabel(summary()) }}</strong></div>
            </div>
            <p class="help-text">O arquivo é gerado localmente, sem envio para a internet.</p>
            <button type="button" class="button-primary" (click)="downloadCurrentBackup()">Baixar backup JSON</button>
          }
          @if (exportMessage()) { <p class="success-note" role="status">{{ exportMessage() }}</p> }
        </section>

        <section class="card card-padding" aria-labelledby="backup-import-title">
          <div class="section-heading" style="margin-top:0">
            <div><h2 id="backup-import-title">Restaurar backup</h2><p class="muted small">O arquivo só será gravado depois da leitura, validação e sua confirmação.</p></div>
            <span class="entity-icon small" aria-hidden="true">⇧</span>
          </div>
          <div class="file-picker">
            <label for="backup-file">Escolha um arquivo JSON</label>
            <input id="backup-file" type="file" accept="application/json,.json" [disabled]="busy()" (change)="selectBackup($event)">
            <span class="help-text">Limite: {{ maxBackupSizeMb }} MiB. Backups antigos só são aceitos quando houver migração conhecida.</span>
          </div>

          @if (busy()) {
            <div class="loading-state compact-loading"><span class="spinner" aria-hidden="true"></span>Processando backup…</div>
          }
          @if (importError()) {
            <div class="error-state import-feedback" role="alert"><strong>Backup não importado</strong><p>{{ importError() }}</p></div>
          }
          @if (importSuccess()) {
            <div class="success-note import-feedback" role="status"><strong>Importação concluída</strong><p>{{ importSuccess() }}</p><a routerLink="/dashboard" class="button-quiet">Ir para o Dashboard</a></div>
          }

          @if (importPreview(); as preview) {
            <div class="import-preview" aria-live="polite">
              <div class="import-preview-heading"><div><h3>Prévia pronta para revisão</h3><p class="muted small">{{ preview.fileName }} · {{ formatBytes(preview.fileSizeBytes) }}</p></div><span class="status-chip active">JSON válido</span></div>
              <div class="import-summary-grid import-summary-grid-wide">
                <div><span class="label">Registros</span><strong>{{ preview.summary.totalRecords }}</strong></div>
                <div><span class="label">Contas</span><strong>{{ preview.summary.accounts }}</strong></div>
                <div><span class="label">Categorias</span><strong>{{ preview.summary.categories }}</strong></div>
                <div><span class="label">Movimentações</span><strong>{{ preview.summary.transactions }}</strong></div>
                <div><span class="label">Cartões</span><strong>{{ preview.summary.creditCards }}</strong></div>
                <div><span class="label">Período</span><strong>{{ periodLabel(preview.summary) }}</strong></div>
              </div>
              @if (preview.summary.warnings.length) {
                <div class="warning-note"><strong>Avisos</strong><ul>@for (warning of preview.summary.warnings; track warning) { <li>{{ warning }}</li> }</ul></div>
              }
              <p class="danger-note small">A confirmação substituirá todos os dados atuais. Antes da gravação, um backup de segurança será preparado localmente.</p>
              <div class="form-actions">
                <button type="button" class="button-secondary" (click)="cancelPreview()" [disabled]="busy()">Cancelar</button>
                <button type="button" class="button-danger" (click)="confirmImport(preview)" [disabled]="busy()">Substituir dados</button>
              </div>
            </div>
          }

          @if (importExport.lastAutomaticBackup(); as safetyBackup) {
            <div class="safety-backup-note" role="status">
              <span><strong>Backup de segurança preparado.</strong><br><span class="muted small">{{ safetyBackup.fileName }} permanece disponível para download nesta tela.</span></span>
              <button type="button" class="button-quiet" (click)="downloadSafetyBackup(safetyBackup)">Baixar segurança</button>
            </div>
          }
        </section>
      </div>

      <section class="card card-padding import-format-card" aria-labelledby="csv-export-title">
        <h2 id="csv-export-title">Exportação CSV</h2>
        <p class="muted">Para exportar uma consulta, abra <a routerLink="/transactions">Movimentações</a> e use “Exportar CSV”. O arquivo contém exatamente os filtros ativos, em UTF-8 com BOM, separador ponto e vírgula, valores decimais em pt-BR e sem linha de totais.</p>
      </section>
    }
  `,
})
export class ImportExportComponent {
  readonly persistence = inject(PersistenceService);
  readonly importExport = inject(ImportExportService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly notifications = inject(NotificationService);
  private readonly settings = inject(SettingsService);
  private readonly router = inject(Router);
  readonly maxBackupSizeMb = MAX_BACKUP_FILE_BYTES / (1024 * 1024);
  readonly summary = computed(() => summarizeSnapshot(this.persistence.snapshot()));
  readonly importPreview = signal<ImportPreview | null>(null);
  readonly importError = signal<string | null>(null);
  readonly importSuccess = signal<string | null>(null);
  readonly exportMessage = signal<string | null>(null);
  readonly busy = signal(false);

  periodLabel(summary: BackupSummary): string {
    return summary.period ? `${formatCivilDate(summary.period.from)} a ${formatCivilDate(summary.period.to)}` : 'Sem movimentações';
  }

  formatBytes(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  async downloadCurrentBackup(): Promise<void> {
    this.exportMessage.set(null);
    try {
      this.importExport.download(this.importExport.createCurrentBackup());
      this.exportMessage.set('Backup JSON baixado com sucesso.');
    } catch (error) {
      this.exportMessage.set(error instanceof Error ? error.message : 'Não foi possível gerar o backup.');
    }
  }

  async selectBackup(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importPreview.set(null);
    this.importError.set(null);
    this.importSuccess.set(null);
    this.busy.set(true);
    try {
      if (file.size > MAX_BACKUP_FILE_BYTES) {
        throw new Error(`O backup excede o limite de ${this.maxBackupSizeMb} MiB.`);
      }
      const text = await file.text();
      this.importPreview.set(this.importExport.previewImport(text, file.size, file.name));
    } catch (error) {
      this.importError.set(error instanceof Error ? error.message : 'Não foi possível ler o arquivo selecionado.');
    } finally {
      this.busy.set(false);
      input.value = '';
    }
  }

  cancelPreview(): void {
    this.importPreview.set(null);
    this.importError.set(null);
  }

  async confirmImport(preview: ImportPreview): Promise<void> {
    let proceed = false;
    try {
      proceed = await this.confirm.ask({
        title: 'Substituir os dados atuais?',
        message: `O backup contém ${preview.summary.totalRecords} registro(s). Os dados atuais serão substituídos depois de um backup de segurança local.`,
        confirmLabel: 'Substituir dados',
        destructive: true,
      });
    } catch (error) {
      this.importError.set(error instanceof Error ? error.message : 'Não foi possível abrir a confirmação.');
      return;
    }
    if (!proceed) return;
    this.busy.set(true);
    this.importError.set(null);
    this.importSuccess.set(null);
    try {
      const result = await this.importExport.replaceWithPreview(preview);
      this.importPreview.set(null);
      this.importSuccess.set(`Foram restaurados ${result.summary.totalRecords} registro(s). Os dados foram recarregados e conferidos.`);
      this.notifications.success('Backup restaurado com sucesso.');
    } catch (error) {
      this.importError.set(error instanceof Error ? error.message : 'Não foi possível restaurar o backup.');
    } finally {
      this.busy.set(false);
    }
  }

  downloadSafetyBackup(backup: BackupDocumentLike): void {
    try {
      this.importExport.download(backup);
      this.notifications.success('Backup de segurança baixado.');
    } catch (error) {
      this.importError.set(error instanceof Error ? error.message : 'Não foi possível baixar o backup de segurança.');
    }
  }

  async startNewFile(): Promise<void> {
    const completed = await this.settings.completeOnboarding();
    if (!completed) {
      this.importError.set(this.persistence.errorMessage() ?? 'Não foi possível iniciar o arquivo.');
      return;
    }
    await this.router.navigateByUrl('/dashboard');
  }

  goToTransactions(): void { void this.router.navigateByUrl('/transactions'); }
  reload(): void { void this.persistence.initialize(); }

}

type BackupDocumentLike = { readonly fileName: string; readonly content: string; readonly mimeType: string };
