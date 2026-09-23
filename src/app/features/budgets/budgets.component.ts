import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Budget, BudgetAlertBand, BudgetCommitmentPolicy, BUDGET_ALERT_BAND_LABELS, BUDGET_COMMITMENT_POLICY_LABELS } from '../../core/domain/models';
import { formatCents, parseMoneyToCents } from '../../core/domain/money';
import { DEFAULT_BUDGET_ALERT_THRESHOLDS, DEFAULT_BUDGET_COMMITMENT_POLICY, isBudgetMonth, previousBudgetMonth } from '../../core/domain/budget-rules';
import { todayCivilDate } from '../../core/domain/civil-date';
import { BudgetService } from '../../core/services/budget.service';
import { CategoryService } from '../../core/services/category.service';
import { NotificationService } from '../../core/services/notification.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

@Component({
  selector: 'app-budgets',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (persistence.status() === 'loading') {
      <div class="loading-state" aria-live="polite"><span class="spinner" aria-hidden="true"></span>Carregando orçamentos…</div>
    } @else if (persistence.status() === 'error') {
      <section class="card card-padding error-state" role="alert"><h2>Não foi possível carregar os orçamentos</h2><p>{{ persistence.errorMessage() }}</p><button type="button" class="button-secondary" (click)="reload()">Tentar novamente</button></section>
    } @else {
      <app-page-header eyebrow="Planejamento mensal" title="Orçamentos" description="Defina limites e acompanhe o que já foi realizado, o que está comprometido e o que ainda está disponível.">
        <a page-actions routerLink="/transactions" [queryParams]="{ new: 1 }" class="button-secondary">+ Novo lançamento</a>
        <button page-actions type="button" class="button-primary" (click)="startNew()">+ Novo limite</button>
      </app-page-header>

      <section class="card card-padding budget-period-bar" aria-labelledby="budget-period-title">
        <div class="section-heading" style="margin-top:0"><div><span class="label">Período de planejamento</span><h2 id="budget-period-title">{{ monthLabel(selectedMonth()) }}</h2></div><button type="button" class="button-secondary" (click)="copyPrevious()" [disabled]="copying()">{{ copying() ? 'Copiando…' : 'Copiar mês anterior' }}</button></div>
        <div class="budget-period-controls"><div class="field"><label for="budget-month">Mês</label><input id="budget-month" type="month" [value]="selectedMonth()" (change)="setMonth($event)"></div><div class="budget-month-history" aria-label="Histórico mensal"><span class="label">Histórico</span>@if (budgetMonths().length === 0) { <span class="muted small">Os meses aparecerão quando houver limites ou lançamentos.</span> } @else { @for (month of budgetMonths().slice(0, 12); track month) { <button type="button" class="history-month" [class.active]="month === selectedMonth()" (click)="selectedMonth.set(month)">{{ monthLabel(month) }}</button> } }</div></div>
        @if (formError()) { <p class="field-error" role="alert">{{ formError() }}</p> }
      </section>

      <div class="two-column-layout budget-layout">
        <section class="card card-padding">
          <div class="section-heading" style="margin-top:0"><div><h2>Resumo do mês</h2><p class="muted small">A política de comprometimento fica registrada em cada limite.</p></div></div>
          @if (summary().totalMetric; as total) {
            <div class="budget-total-card"><div><span class="label">Limite total</span><strong>{{ money(total.budget.amountCents) }}</strong><small>{{ policyLabel(total.budget.commitmentPolicy) }}</small></div><div class="budget-total-values"><span>Realizado <b>{{ money(total.realizedCents) }}</b></span><span>Comprometido <b>{{ money(total.committedCents) }}</b></span><span [class.positive]="total.availableCents >= 0" [class.negative]="total.availableCents < 0">Disponível <b>{{ money(total.availableCents) }}</b></span></div></div>
            <div class="budget-progress-block"><div class="budget-progress-label"><span>{{ percent(total.usedPercent) }} do limite comprometido</span><span class="alert-badge" [attr.data-band]="total.alertBand">{{ bandLabel(total.alertBand) }}</span></div><div class="progress-track" role="progressbar" [attr.aria-valuenow]="progressValue(total.usedPercent)" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="'Consumo do limite total: ' + percent(total.usedPercent)"><span [style.width.%]="progressValue(total.usedPercent)" [attr.data-band]="total.alertBand"></span></div><p class="help-text">Realizado considera apenas despesas pagas. Comprometido inclui {{ policyLabel(total.budget.commitmentPolicy).toLocaleLowerCase('pt-BR') }}; transferências e pagamentos de fatura ficam fora.</p></div>
          } @else {
            <div class="notice warning"><strong>Você ainda não definiu um limite total.</strong><p class="small">As despesas por categoria continuam visíveis abaixo e categorias sem limite não desaparecem do total realizado.</p><button type="button" class="button-secondary button-small" (click)="startNew(null)">Definir limite total</button></div>
          }

          @if (summary().categoryMetrics.length === 0 && summary().spendingByCategory.length === 0) {
            <app-empty-state icon="◒" title="Nenhum limite ou gasto neste mês" description="Comece pelo limite total ou por uma categoria para transformar o mês em um plano acompanhável." actionLabel="Criar limite" (action)="startNew()"></app-empty-state>
          } @else {
            <div class="section-heading"><div><h3>Limites por categoria</h3><p class="muted small">O consumo usa a categoria do lançamento e a competência da fatura do cartão.</p></div></div>
            <div class="budget-list">
              @for (metric of summary().categoryMetrics; track metric.budget.id) {
                <article class="budget-row"><div class="budget-row-heading"><div><strong>{{ categoryName(metric.budget.categoryId) }}</strong><span class="budget-policy">{{ policyLabel(metric.budget.commitmentPolicy) }}</span></div><div class="row-actions"><button type="button" class="button-quiet" (click)="editBudget(metric.budget)">Editar</button><button type="button" class="button-quiet danger-text" (click)="archive(metric.budget)">Arquivar</button></div></div><div class="budget-values"><span>Limite <b>{{ money(metric.budget.amountCents) }}</b></span><span>Realizado <b>{{ money(metric.realizedCents) }}</b></span><span>Comprometido <b>{{ money(metric.committedCents) }}</b></span><span [class.positive]="metric.availableCents >= 0" [class.negative]="metric.availableCents < 0">Disponível <b>{{ money(metric.availableCents) }}</b></span></div><div class="budget-progress-label"><span>{{ percent(metric.usedPercent) }}</span><span class="alert-badge" [attr.data-band]="metric.alertBand">{{ bandLabel(metric.alertBand) }}</span></div><div class="progress-track" role="progressbar" [attr.aria-valuenow]="progressValue(metric.usedPercent)" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="'Consumo de ' + categoryName(metric.budget.categoryId) + ': ' + percent(metric.usedPercent)"><span [style.width.%]="progressValue(metric.usedPercent)" [attr.data-band]="metric.alertBand"></span></div></article>
              }
              @for (spending of summary().spendingByCategory; track spending.categoryId ?? 'uncategorized') {
                @if (!spending.hasBudget) { <article class="budget-row budget-row-unlimited"><div class="budget-row-heading"><div><strong>{{ categoryName(spending.categoryId) }}</strong><span class="budget-policy">Sem limite definido</span></div><button type="button" class="button-quiet" (click)="startNew(spending.categoryId)">Criar limite</button></div><div class="budget-values"><span>Realizado <b>{{ money(spending.realizedCents) }}</b></span><span>Comprometido <b>{{ money(spending.committedCents) }}</b></span></div><p class="help-text">Esta despesa aparece no realizado geral, mas não é comparada a um limite de categoria.</p></article> }
              }
            </div>
            @if (summary().unbudgetedRealizedCents > 0) { <p class="notice warning small"><strong>{{ money(summary().unbudgetedRealizedCents) }}</strong> em despesas realizadas estão sem limite de categoria.</p> }
          }
        </section>

        @if (showForm()) {
          <section class="card card-padding">
            <div class="section-heading" style="margin-top:0"><div><h2>{{ editingBudgetId() ? 'Editar limite' : 'Novo limite' }}</h2><p class="muted small">Alterar um limite nunca altera os lançamentos do mês.</p></div><button type="button" class="button-quiet" (click)="cancelForm()">Fechar</button></div>
            <form [formGroup]="form" (ngSubmit)="save()" class="stack" novalidate>
              <div class="field"><label for="budget-category">Escopo</label><select id="budget-category" formControlName="categoryId"><option value="">Limite total do mês</option>@for (category of expenseCategories(); track category.id) { <option [value]="category.id">{{ category.icon }} {{ category.name }}</option> }</select></div>
              <div class="field"><label for="budget-amount">Limite <span aria-hidden="true">*</span></label><input id="budget-amount" formControlName="amount" inputmode="decimal" placeholder="0,00"><span class="help-text">Use zero para sinalizar que qualquer despesa ultrapassa este limite.</span></div>
              <div class="field"><label for="budget-policy">O que entra como comprometido?</label><select id="budget-policy" formControlName="commitmentPolicy"><option value="realized-only">Somente despesas pagas</option><option value="pending">Despesas pagas e pendentes</option><option value="planned-and-pending">Pagas, pendentes e previstas</option></select></div>
              <div class="form-grid"><div class="field"><label for="budget-attention">Faixa de atenção (%)</label><input id="budget-attention" type="number" min="0" max="99" step="1" formControlName="attentionPercent"></div><div class="field"><label for="budget-warning">Faixa de alerta (%)</label><input id="budget-warning" type="number" min="1" max="100" step="1" formControlName="warningPercent"></div></div>
              <p class="help-text">Atenção e alerta têm rótulo textual; acima de 100% o estado é Excedido. Assim o aviso não depende apenas da cor.</p>
              @if (formError()) { <p class="field-error" role="alert">{{ formError() }}</p> }
              <div class="form-actions"><button type="submit" class="button-primary" [disabled]="saving()">{{ saving() ? 'Salvando…' : 'Salvar limite' }}</button></div>
            </form>
          </section>
        }
      </div>
    }
  `,
})
export class BudgetsComponent {
  readonly persistence = inject(PersistenceService);
  readonly budgetService = inject(BudgetService);
  private readonly categoryService = inject(CategoryService);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(FormBuilder);
  private readonly initialMonth = this.route.snapshot.queryParamMap.get('month');
  readonly selectedMonth = signal(isBudgetMonth(this.initialMonth ?? '') ? this.initialMonth! : todayCivilDate().slice(0, 7));
  readonly editingBudgetId = signal<string | null>(null);
  readonly showForm = signal(true);
  readonly saving = signal(false);
  readonly copying = signal(false);
  readonly formError = signal<string | null>(null);
  readonly summary = computed(() => this.budgetService.summary(this.selectedMonth()));
  readonly budgetMonths = computed(() => this.budgetService.availableMonths());
  readonly expenseCategories = computed(() => this.categoryService.activeCategories().filter((category) => category.type === 'expense'));
  readonly form = this.formBuilder.nonNullable.group({
    categoryId: [''],
    amount: ['', Validators.required],
    commitmentPolicy: [DEFAULT_BUDGET_COMMITMENT_POLICY as BudgetCommitmentPolicy],
    attentionPercent: [DEFAULT_BUDGET_ALERT_THRESHOLDS.attentionPercent as number, [Validators.required, Validators.min(0), Validators.max(99)]],
    warningPercent: [DEFAULT_BUDGET_ALERT_THRESHOLDS.warningPercent as number, [Validators.required, Validators.min(1), Validators.max(100)]],
  });

  monthLabel(month: string): string { return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`)); }
  money(cents: number): string { return formatCents(cents); }
  percent(value: number): string { return Number.isFinite(value) ? `${value.toFixed(0)}%` : '>100%'; }
  progressValue(value: number): number { return Number.isFinite(value) ? Math.min(Math.max(value, 0), 100) : 100; }
  bandLabel(band: BudgetAlertBand): string { return BUDGET_ALERT_BAND_LABELS[band]; }
  policyLabel(policy: BudgetCommitmentPolicy): string { return BUDGET_COMMITMENT_POLICY_LABELS[policy]; }
  categoryName(categoryId: string | null): string { return categoryId ? this.categoryService.categories().find((category) => category.id === categoryId)?.name ?? 'Categoria não encontrada' : 'Todas as categorias'; }

  startNew(categoryId: string | null = null): void {
    this.editingBudgetId.set(null);
    this.showForm.set(true);
    this.formError.set(null);
    this.form.reset({ categoryId: categoryId ?? '', amount: '', commitmentPolicy: DEFAULT_BUDGET_COMMITMENT_POLICY, attentionPercent: DEFAULT_BUDGET_ALERT_THRESHOLDS.attentionPercent, warningPercent: DEFAULT_BUDGET_ALERT_THRESHOLDS.warningPercent });
  }

  editBudget(budget: Budget): void {
    this.editingBudgetId.set(budget.id);
    this.showForm.set(true);
    this.formError.set(null);
    this.form.reset({ categoryId: budget.categoryId ?? '', amount: (budget.amountCents / 100).toFixed(2).replace('.', ','), commitmentPolicy: budget.commitmentPolicy, attentionPercent: budget.alertThresholds.attentionPercent, warningPercent: budget.alertThresholds.warningPercent });
  }

  cancelForm(): void { this.showForm.set(false); this.editingBudgetId.set(null); this.formError.set(null); }
  setMonth(event: Event): void { const value = (event.target as HTMLInputElement).value; if (value) this.selectedMonth.set(value); }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    this.formError.set(null);
    try {
      const value = this.form.getRawValue();
      const input = { month: this.selectedMonth(), categoryId: value.categoryId || null, amountCents: parseMoneyToCents(value.amount), commitmentPolicy: value.commitmentPolicy, attentionPercent: Number(value.attentionPercent), warningPercent: Number(value.warningPercent) };
      if (this.editingBudgetId()) await this.budgetService.update(this.editingBudgetId()!, input);
      else await this.budgetService.create(input);
      this.notifications.success(this.editingBudgetId() ? 'Limite atualizado.' : 'Limite criado.');
      this.startNew();
    } catch (error) { this.formError.set(error instanceof Error ? error.message : 'Não foi possível salvar o limite.'); }
    finally { this.saving.set(false); }
  }

  async archive(budget: Budget): Promise<void> {
    try { await this.budgetService.archive(budget.id); this.notifications.success('Limite arquivado; o histórico do mês foi preservado.'); } catch (error) { this.notifications.error(error instanceof Error ? error.message : 'Não foi possível arquivar o limite.'); }
  }

  async copyPrevious(): Promise<void> {
    this.copying.set(true);
    this.formError.set(null);
    try { await this.budgetService.copyMonth(previousBudgetMonth(this.selectedMonth()), this.selectedMonth()); this.notifications.success('Limites do mês anterior copiados.'); }
    catch (error) { this.formError.set(error instanceof Error ? error.message : 'Não foi possível copiar o mês anterior.'); }
    finally { this.copying.set(false); }
  }

  reload(): void { void this.persistence.initialize(); }
}
