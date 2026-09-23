import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { formatCivilDate, todayCivilDate } from '../../core/domain/civil-date';
import {
  DEFAULT_REPORT_SECTIONS,
  REPORT_SECTION_LABELS,
  REPORT_STATUS_OPTIONS,
  REPORT_TYPE_LABELS,
  ReportConfig,
  ReportModel,
  ReportOrientation,
  ReportSectionKey,
  ReportType,
} from '../../core/domain/report-rules';
import { TransactionStatus, TRANSACTION_STATUS_LABELS } from '../../core/domain/models';
import { ReportPdfService } from '../../core/services/report-pdf.service';
import { ReportService } from '../../core/services/report.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (persistence.status() === 'loading') {
      <div class="loading-state" aria-live="polite"><span class="spinner" aria-hidden="true"></span>Carregando dados para os relatórios…</div>
    } @else if (persistence.status() === 'error') {
      <section class="card card-padding error-state" role="alert">
        <h2>Não foi possível carregar os relatórios</h2>
        <p>{{ persistence.errorMessage() }}</p>
        <button type="button" class="button-secondary" (click)="reload()">Tentar novamente</button>
      </section>
    } @else {
      <app-page-header
        eyebrow="Análise local"
        title="Relatórios e PDF"
        description="Monte uma visão financeira com período e filtros explícitos. A consolidação acontece neste dispositivo e não altera seus lançamentos."
      >
        <a page-actions routerLink="/dashboard" class="button-secondary">Voltar ao Dashboard</a>
        <button page-actions type="button" class="button-primary" (click)="downloadPdf()" [disabled]="busy() || !preview() || preview()?.isEmpty">
          {{ busy() ? 'Gerando PDF…' : 'Baixar PDF' }}
        </button>
      </app-page-header>

      @if (formError()) { <div class="error-state report-feedback" role="alert">{{ formError() }}</div> }
      @if (successMessage()) { <div class="success-note report-feedback" role="status">{{ successMessage() }}</div> }

      <div class="reports-layout">
        <section class="card card-padding report-config" aria-labelledby="report-config-title">
          <div class="section-heading" style="margin-top:0">
            <div><h2 id="report-config-title">Configuração</h2><p class="muted small">Escolha exatamente o recorte que deve aparecer na prévia e no arquivo.</p></div>
            <span class="entity-icon small" aria-hidden="true">▤</span>
          </div>

          <div class="form-grid">
            <div class="field full">
              <label for="report-type">Tipo de relatório</label>
              <select id="report-type" [value]="reportType()" (change)="setReportType($event)">
                @for (option of typeOptions; track option.value) { <option [value]="option.value">{{ option.label }}</option> }
              </select>
            </div>
            <div class="field"><label for="report-from">Data inicial</label><input id="report-from" type="date" [value]="from()" (change)="from.set(selectValue($event))"></div>
            <div class="field"><label for="report-to">Data final</label><input id="report-to" type="date" [value]="to()" (change)="to.set(selectValue($event))"></div>
            <div class="field"><label for="report-account">Conta</label><select id="report-account" [value]="accountId()" (change)="accountId.set(selectValue($event))"><option value="">Todas as contas</option>@for (account of activeAccounts(); track account.id) { <option [value]="account.id">{{ account.name }}</option> }</select></div>
            <div class="field"><label for="report-card">Cartão</label><select id="report-card" [value]="creditCardId()" (change)="creditCardId.set(selectValue($event))"><option value="">Todos os cartões</option>@for (card of activeCards(); track card.id) { <option [value]="card.id">{{ card.name }}</option> }</select></div>
            <div class="field full"><label for="report-category">Categoria de despesa</label><select id="report-category" [value]="categoryId()" (change)="categoryId.set(selectValue($event))"><option value="">Todas as categorias</option>@for (category of expenseCategories(); track category.id) { <option [value]="category.id">{{ category.name }}</option> }</select></div>
          </div>

          <fieldset class="report-fieldset">
            <legend>Situações incluídas</legend>
            <div class="report-check-grid">
              @for (status of statusOptions; track status) {
                <label class="checkbox-field"><input type="checkbox" [checked]="isStatusSelected(status)" [disabled]="!includeForecast() && status !== 'paid'" (change)="toggleStatus(status, checked($event))"><span>{{ statusLabels[status] }}</span></label>
              }
            </div>
          </fieldset>

          <fieldset class="report-fieldset">
            <legend>Seções do documento</legend>
            <div class="report-check-grid">
              @for (option of sectionOptions; track option.value) {
                @if (availableSections().includes(option.value)) {
                  <label class="checkbox-field"><input type="checkbox" [checked]="isSectionSelected(option.value)" (change)="toggleSection(option.value, checked($event))"><span>{{ option.label }}</span></label>
                }
              }
            </div>
          </fieldset>

          <div class="report-options">
            <label class="checkbox-field"><input type="checkbox" [checked]="includeForecast()" (change)="setForecast(checked($event))"><span>Incluir valores previstos e pendentes</span></label>
            <label class="checkbox-field"><input type="checkbox" [checked]="showSensitiveBalances()" (change)="showSensitiveBalances.set(checked($event))"><span>Exibir saldos de contas e cartões</span></label>
          </div>

          <div class="field report-orientation-field">
            <label for="report-orientation">Orientação do PDF</label>
            <select id="report-orientation" [value]="orientation()" (change)="setOrientation($event)">
              <option value="portrait">Retrato</option>
              <option value="landscape">Paisagem</option>
            </select>
          </div>

          <div class="form-actions">
            <button type="button" class="button-primary" (click)="previewReport()">Atualizar prévia</button>
          </div>
          <p class="help-text report-offline-note">O PDF é montado com pdfmake localmente. Nenhum dado é enviado ou armazenado fora deste dispositivo.</p>
        </section>

        <section class="card card-padding report-preview" aria-labelledby="report-preview-title">
          <div class="section-heading" style="margin-top:0">
            <div><h2 id="report-preview-title">Prévia</h2><p class="muted small">Confira o período, moeda, filtros e as tabelas antes de baixar.</p></div>
            @if (preview(); as report) { <span class="status-chip active">{{ report.fileName }}</span> }
          </div>

          @if (preview(); as report) {
            <header class="report-preview-header">
              <h3>{{ report.title }}</h3>
              <p>{{ report.filters.period }} · BRL · gerado em {{ report.generatedAtLabel }}</p>
              <p>Filtros: {{ report.filters.account }} · {{ report.filters.card }} · {{ report.filters.category }} · {{ report.filters.statuses }}</p>
            </header>
            @if (report.warnings.length) { <div class="warning-note" role="status"><strong>Avisos da prévia</strong><ul>@for (warning of report.warnings; track warning) { <li>{{ warning }}</li> }</ul></div> }

            @if (report.isEmpty) {
              <app-empty-state icon="∅" title="Nenhum dado para este recorte" description="A configuração está válida, mas não há lançamentos, faturas ou orçamentos compatíveis. Ajuste o período ou os filtros para gerar um PDF."></app-empty-state>
            } @else {
              @for (section of report.sections; track section.key) {
                <article class="report-section-preview">
                  <div class="report-section-heading"><div><h3>{{ section.title }}</h3><p>{{ section.description }}</p></div></div>
                  @if (section.metrics.length) {
                    <div class="report-metrics">
                      @for (metric of section.metrics; track metric.label) { <div><span>{{ metric.label }}</span><strong>{{ metric.value }}</strong></div> }
                    </div>
                  }
                  @if (section.table; as table) {
                    <div class="report-table-wrap">
                      <table><thead><tr>@for (column of table.columns; track column) { <th scope="col">{{ column }}</th> }</tr></thead><tbody>@for (row of table.rows; track $index) { <tr>@for (cell of row; track $index) { <td>{{ cell }}</td> }</tr> }</tbody></table>
                    </div>
                  } @else if (section.emptyMessage) { <p class="muted small report-empty-section">{{ section.emptyMessage }}</p> }
                </article>
              }
            }
          } @else {
            <app-empty-state icon="▤" title="Prévia ainda não gerada" description="Escolha os filtros e atualize a prévia para revisar o relatório antes do download." actionLabel="Gerar prévia" (action)="previewReport()"></app-empty-state>
          }
        </section>
      </div>
    }
  `,
})
export class ReportsComponent implements OnInit {
  readonly persistence = inject(PersistenceService);
  private readonly reports = inject(ReportService);
  private readonly reportPdf = inject(ReportPdfService);

  readonly reportType = signal<ReportType>('monthly-summary');
  readonly from = signal(`${todayCivilDate().slice(0, 7)}-01`);
  readonly to = signal(lastDayOfMonth(todayCivilDate().slice(0, 7)));
  readonly accountId = signal('');
  readonly creditCardId = signal('');
  readonly categoryId = signal('');
  readonly selectedStatuses = signal<readonly TransactionStatus[]>([...REPORT_STATUS_OPTIONS]);
  readonly selectedSections = signal<readonly ReportSectionKey[]>([...DEFAULT_REPORT_SECTIONS]);
  readonly includeForecast = signal(true);
  readonly showSensitiveBalances = signal(true);
  readonly orientation = signal<ReportOrientation>('portrait');
  readonly preview = signal<ReportModel | null>(null);
  readonly formError = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly busy = signal(false);

  readonly typeOptions = (Object.keys(REPORT_TYPE_LABELS) as ReportType[]).map((value) => ({ value, label: REPORT_TYPE_LABELS[value] }));
  readonly sectionOptions = (Object.keys(REPORT_SECTION_LABELS) as ReportSectionKey[]).map((value) => ({ value, label: REPORT_SECTION_LABELS[value] }));
  readonly statusOptions = REPORT_STATUS_OPTIONS;
  readonly statusLabels = TRANSACTION_STATUS_LABELS;

  readonly activeAccounts = () => this.persistence.snapshot().accounts.filter((account) => !account.archived);
  readonly activeCards = () => this.persistence.snapshot().creditCards.filter((card) => !card.archived);
  readonly expenseCategories = () => this.persistence.snapshot().categories.filter((category) => !category.archived && category.type === 'expense');

  ngOnInit(): void {
    if (this.persistence.status() !== 'error') this.previewReport();
  }

  setReportType(event: Event): void {
    const value = this.selectValue(event) as ReportType;
    if (!(value in REPORT_TYPE_LABELS)) return;
    this.reportType.set(value);
    this.selectedSections.set(this.availableSectionsFor(value));
    this.preview.set(null);
  }

  setForecast(value: boolean): void {
    this.includeForecast.set(value);
    this.selectedStatuses.set(value ? [...REPORT_STATUS_OPTIONS] : ['paid']);
  }

  setOrientation(event: Event): void {
    const value = this.selectValue(event);
    if (value === 'portrait' || value === 'landscape') this.orientation.set(value);
  }

  toggleStatus(status: TransactionStatus, value: boolean): void {
    this.selectedStatuses.update((current) => value ? [...new Set([...current, status])] : current.filter((item) => item !== status));
  }

  toggleSection(section: ReportSectionKey, value: boolean): void {
    this.selectedSections.update((current) => value ? [...new Set([...current, section])] : current.filter((item) => item !== section));
  }

  isStatusSelected(status: TransactionStatus): boolean { return this.selectedStatuses().includes(status); }
  isSectionSelected(section: ReportSectionKey): boolean { return this.selectedSections().includes(section); }
  availableSections(): readonly ReportSectionKey[] { return this.availableSectionsFor(this.reportType()); }

  previewReport(): void {
    this.formError.set(null);
    this.successMessage.set(null);
    try {
      this.preview.set(this.reports.build(this.config()));
    } catch (error) {
      this.preview.set(null);
      this.formError.set(error instanceof Error ? error.message : 'Não foi possível montar a prévia.');
    }
  }

  async downloadPdf(): Promise<void> {
    this.formError.set(null);
    this.successMessage.set(null);
    let report = this.preview();
    if (!report) {
      this.previewReport();
      report = this.preview();
    }
    if (!report || report.isEmpty) return;
    this.busy.set(true);
    try {
      await this.reportPdf.download(report);
      this.successMessage.set(`PDF ${report.fileName} gerado com sucesso.`);
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'Não foi possível gerar o PDF.');
    } finally {
      this.busy.set(false);
    }
  }

  async reload(): Promise<void> { await this.persistence.initialize(); }

  selectValue(event: Event): string { return (event.target as HTMLSelectElement).value; }
  checked(event: Event): boolean { return (event.target as HTMLInputElement).checked; }

  private config(): ReportConfig {
    return {
      type: this.reportType(),
      from: this.from(),
      to: this.to(),
      accountId: this.accountId() || null,
      creditCardId: this.creditCardId() || null,
      categoryId: this.categoryId() || null,
      statuses: this.selectedStatuses(),
      includeForecast: this.includeForecast(),
      showSensitiveBalances: this.showSensitiveBalances(),
      orientation: this.orientation(),
      sections: this.selectedSections(),
    };
  }

  private availableSectionsFor(type: ReportType): readonly ReportSectionKey[] {
    if (type === 'transactions') return ['summary', 'transactions'];
    if (type === 'category-expenses') return ['summary', 'categories', 'chart'];
    if (type === 'account-statement') return ['summary', 'accounts', 'transactions'];
    if (type === 'card-invoice') return ['summary', 'cards', 'transactions'];
    if (type === 'budget-vs-realized') return ['summary', 'budgets'];
    return DEFAULT_REPORT_SECTIONS;
  }
}

function lastDayOfMonth(month: string): string {
  const [year, numericMonth] = month.split('-').map(Number);
  const day = new Date(Date.UTC(year, numericMonth, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, '0')}`;
}
