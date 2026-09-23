import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { EChartsOption } from 'echarts';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { EchartsChartComponent, EchartsPointClick } from '../../shared/echarts-chart/echarts-chart.component';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { TransactionService } from '../../core/services/transaction.service';
import { DashboardService } from '../../core/services/dashboard.service';
import { BudgetService } from '../../core/services/budget.service';
import { BUDGET_ALERT_BAND_LABELS } from '../../core/domain/models';
import { DashboardExpenseChartEntry, DashboardPeriodComparison, periodForMonth, periodForRange } from '../../core/domain/dashboard-rules';
import { formatCivilDate, todayCivilDate } from '../../core/domain/civil-date';
import { formatCents } from '../../core/domain/money';

type PeriodMode = 'month' | 'custom';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent, EmptyStateComponent, EchartsChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (persistence.status() === 'loading') {
      <div class="loading-state" aria-live="polite"><span class="spinner" aria-hidden="true"></span>Carregando seu painel…</div>
    } @else if (persistence.status() === 'error') {
      <section class="card card-padding error-state" role="alert"><h2>Não foi possível carregar seu painel</h2><p>{{ persistence.errorMessage() }}</p><button type="button" class="button-secondary" (click)="reload()">Tentar novamente</button></section>
    } @else {
      <app-page-header eyebrow="Visão geral" title="Dashboard" description="Uma leitura consolidada do seu período, com acesso rápido aos lançamentos que formam cada número.">
        <a page-actions routerLink="/transactions" [queryParams]="{ new: 1 }" class="button-primary">+ Novo lançamento</a>
      </app-page-header>

      <section class="card card-padding dashboard-period-picker" aria-labelledby="dashboard-period-title">
        <div class="section-heading" style="margin-top:0"><div><span class="label">Período de análise</span><h2 id="dashboard-period-title">{{ periodTitle() }}</h2></div><span class="muted small">Comparação: {{ comparisonPeriodLabel() }}</span></div>
        <div class="dashboard-period-controls">
          <div class="segmented" role="tablist" aria-label="Modo do período"><button type="button" role="tab" [attr.aria-selected]="periodMode() === 'month'" [class.active]="periodMode() === 'month'" (click)="setPeriodMode('month')">Mês</button><button type="button" role="tab" [attr.aria-selected]="periodMode() === 'custom'" [class.active]="periodMode() === 'custom'" (click)="setPeriodMode('custom')">Intervalo</button></div>
          @if (periodMode() === 'month') { <div class="field dashboard-period-field"><label for="dashboard-month">Mês</label><input id="dashboard-month" type="month" [value]="selectedMonth()" (change)="setMonth($event)"></div> } @else { <div class="field dashboard-period-field"><label for="dashboard-from">De</label><input id="dashboard-from" type="date" [value]="customFrom()" (change)="setCustomDate('from', $event)"></div><div class="field dashboard-period-field"><label for="dashboard-to">Até</label><input id="dashboard-to" type="date" [value]="customTo()" (change)="setCustomDate('to', $event)"></div> }
          <button type="button" class="button-secondary dashboard-today" (click)="setCurrentMonth()">Mês atual</button><label class="checkbox-field dashboard-projection-toggle"><input type="checkbox" [checked]="includeForecast()" (change)="setIncludeForecast($event)"> Incluir projeções na evolução do saldo</label>
        </div>
        @if (periodError()) { <p class="field-error" role="alert">{{ periodError() }}</p> }
      </section>

      @if (!hasAnyTransactions()) {
        <section class="card" style="margin-top:18px"><app-empty-state icon="✦" title="Seu painel começa aqui" description="Registre sua primeira receita ou despesa para acompanhar resultado, vencimentos e evolução do saldo." actionLabel="Criar primeiro lançamento" (action)="goToTransactions()"></app-empty-state></section>
        @if (transactionService.transactions().length === 0 && persistence.snapshot().accounts.length === 0) { <p class="dashboard-empty-hint">Ainda não há contas cadastradas. <a routerLink="/accounts">Cadastrar uma conta</a> ajuda a selecionar onde cada lançamento acontece.</p> }
      } @else {
        <section class="grid grid-3 dashboard-indicators" aria-label="Indicadores financeiros">
          <article class="card card-padding dashboard-indicator"><span class="label">Saldo total atual</span><div class="value-xl" [class.positive]="summary().balanceCents >= 0" [class.negative]="summary().balanceCents < 0">{{ money(summary().balanceCents) }}</div><p class="muted small">Contas ativas e lançamentos pagos</p><a class="button-quiet" routerLink="/accounts">Ver contas →</a></article>
          <article class="card card-padding dashboard-indicator"><span class="label">Receitas no período</span><div class="value-xl positive">{{ money(summary().realizedIncomeCents) }}</div><p class="muted small">Previstas: {{ money(summary().forecastIncomeCents) }}</p><p class="dashboard-comparison" [class.positive]="comparisonIncreased(summary().incomeComparison)" [class.negative]="comparisonDecreased(summary().incomeComparison)">{{ comparisonText(summary().incomeComparison) }}</p></article>
          <article class="card card-padding dashboard-indicator"><span class="label">Despesas no período</span><div class="value-xl negative">{{ money(summary().realizedExpenseCents) }}</div><p class="muted small">Previstas: {{ money(summary().forecastExpenseCents) }}</p><p class="dashboard-comparison" [class.positive]="expensesDecreased(summary().expenseComparison)" [class.negative]="expensesIncreased(summary().expenseComparison)">{{ comparisonText(summary().expenseComparison) }}</p></article>
          <article class="card card-padding dashboard-indicator"><span class="label">Resultado realizado</span><div class="value-xl" [class.positive]="summary().realizedResultCents >= 0" [class.negative]="summary().realizedResultCents < 0">{{ signedMoney(summary().realizedResultCents) }}</div><p class="muted small">Projetado: {{ signedMoney(summary().projectedResultCents) }}</p><p class="dashboard-comparison" [class.positive]="comparisonIncreased(summary().resultComparison)" [class.negative]="comparisonDecreased(summary().resultComparison)">{{ comparisonText(summary().resultComparison) }}</p></article>
          <article class="card card-padding dashboard-indicator"><span class="label">Contas vencidas</span><div class="value-xl" [class.negative]="summary().overdueCount > 0" [class.positive]="summary().overdueCount === 0">{{ summary().overdueCount }}</div><p class="muted small">{{ money(summary().overdueAmountCents) }} em aberto</p><a class="button-quiet" [routerLink]="['/transactions']" [queryParams]="dueQuery('overdue')">Ver vencidas →</a></article>
          <article class="card card-padding dashboard-indicator"><span class="label">Gastos acumulados</span><div class="value-xl negative">{{ money(summary().accumulatedExpenseCents) }}</div><p class="muted small">Realizados + previstos no período</p><a class="button-quiet" [routerLink]="['/transactions']" [queryParams]="periodQuery('expense')">Ver despesas →</a></article>
        </section>

        <section class="card card-padding dashboard-budget-card" aria-labelledby="dashboard-budget-title"><div class="section-heading" style="margin-top:0"><div><h2 id="dashboard-budget-title">Orçamento de {{ monthLabel(budgetMonth()) }}</h2><p class="muted small">Atalhos para os limites que precisam de atenção.</p></div><a class="button-quiet" routerLink="/budgets" [queryParams]="{ month: budgetMonth() }">Gerenciar orçamento →</a></div>@if (budgetSummary().alerts.length > 0) { <div class="dashboard-budget-alert-list">@for (metric of budgetSummary().alerts.slice(0, 4); track metric.budget.id) { <a class="dashboard-budget-alert" [routerLink]="['/budgets']" [queryParams]="{ month: budgetMonth() }"><span><strong>{{ metric.budget.categoryId ? categoryName(metric.budget.categoryId) : 'Limite total do mês' }}</strong><small>{{ money(metric.committedCents) }} comprometido de {{ money(metric.budget.amountCents) }}</small></span><span class="alert-badge" [attr.data-band]="metric.alertBand">{{ budgetBandLabel(metric.alertBand) }}</span></a> }</div> } @else if (budgetSummary().totalMetric; as total) { <p class="dashboard-inline-empty">{{ money(total.committedCents) }} comprometido de {{ money(total.budget.amountCents) }}. <span class="alert-badge" data-band="none">Dentro do limite</span></p> } @else { <p class="dashboard-inline-empty">Ainda não há limite total para este mês. <a routerLink="/budgets" [queryParams]="{ month: budgetMonth() }">Definir agora</a></p> }</section>

        <section class="grid grid-2 dashboard-due-grid" aria-label="Vencimentos"><article class="card card-padding"><div class="section-heading" style="margin-top:0"><div><h2>Vencidas</h2><p class="muted small">Pendentes até {{ formatDate(today()) }}</p></div><a class="button-quiet" [routerLink]="['/transactions']" [queryParams]="dueQuery('overdue')">Abrir lista →</a></div>@if (summary().overdueItems.length === 0) { <p class="dashboard-inline-empty">Não há contas vencidas no período selecionado.</p> } @else { <div class="dashboard-due-list">@for (item of summary().overdueItems.slice(0, 5); track item.transaction.id) { <a class="dashboard-due-item" [routerLink]="['/transactions']" [queryParams]="{ edit: item.transaction.id }"><span><strong>{{ item.transaction.description }}</strong><small>{{ item.categoryName }} · {{ item.accountName }} · venceu em {{ formatDate(item.transaction.dueDate!) }}</small></span><b class="negative">{{ money(item.transaction.amountCents) }}</b></a> }</div> }</article><article class="card card-padding"><div class="section-heading" style="margin-top:0"><div><h2>Próximos 7 dias</h2><p class="muted small">Vencimentos em aberto a partir de hoje</p></div><a class="button-quiet" [routerLink]="['/transactions']" [queryParams]="dueQuery('upcoming')">Abrir lista →</a></div>@if (summary().upcomingItems.length === 0) { <p class="dashboard-inline-empty">Nenhuma conta próxima do vencimento.</p> } @else { <div class="dashboard-due-list">@for (item of summary().upcomingItems.slice(0, 5); track item.transaction.id) { <a class="dashboard-due-item" [routerLink]="['/transactions']" [queryParams]="{ edit: item.transaction.id }"><span><strong>{{ item.transaction.description }}</strong><small>{{ item.categoryName }} · vence em {{ formatDate(item.transaction.dueDate!) }}</small></span><b class="negative">{{ money(item.transaction.amountCents) }}</b></a> }</div> }</article></section>

        <section class="grid grid-2 dashboard-charts" aria-label="Gráficos financeiros">
          <article class="card card-padding dashboard-chart-card"><div class="section-heading" style="margin-top:0"><div><h2>Despesas por categoria</h2><p class="muted small">Realizadas e previstas no período</p></div></div>@if (summary().expenseChart.length === 0) { <div class="dashboard-chart-empty" role="status"><span class="empty-icon" aria-hidden="true">◌</span><p>Não há despesas no período para formar este gráfico.</p></div> } @else { <app-echarts-chart [options]="expenseChartOptions()" [ariaLabel]="categoryChartLabel()" (pointClick)="openExpenseChartPoint($event)"></app-echarts-chart> } @if (summary().expensesByCategory.length > 0) { <div class="dashboard-table-wrap"><table><caption class="visually-hidden">Despesas detalhadas por categoria</caption><thead><tr><th scope="col">Categoria</th><th scope="col">Realizado</th><th scope="col">Previsto</th><th scope="col">Total</th></tr></thead><tbody>@for (item of summary().expensesByCategory; track item.categoryId ?? item.name) { <tr><th scope="row"><a [routerLink]="['/transactions']" [queryParams]="categoryQuery(item.categoryId, item.categoryId === null ? [null] : [])">{{ item.icon }} {{ item.name }}</a></th><td>{{ money(item.realizedCents) }}</td><td>{{ money(item.forecastCents) }}</td><td><strong>{{ money(item.amountCents) }}</strong></td></tr> }</tbody></table></div> }</article>
          <article class="card card-padding dashboard-chart-card"><div class="section-heading" style="margin-top:0"><div><h2>Receitas versus despesas</h2><p class="muted small">Valores separados por realizado e previsto</p></div></div>@if (summary().transactionCount === 0) { <div class="dashboard-chart-empty" role="status"><span class="empty-icon" aria-hidden="true">◌</span><p>Não há lançamentos no período selecionado.</p></div> } @else { <app-echarts-chart [options]="trendChartOptions()" [ariaLabel]="trendChartLabel()"></app-echarts-chart><div class="dashboard-table-wrap"><table><caption class="visually-hidden">Receitas e despesas por mês</caption><thead><tr><th scope="col">Período</th><th scope="col">Receita realizada</th><th scope="col">Receita prevista</th><th scope="col">Despesa realizada</th><th scope="col">Despesa prevista</th></tr></thead><tbody>@for (item of summary().monthlySeries; track item.key) { <tr><th scope="row">{{ item.label }}</th><td>{{ money(item.realizedIncomeCents) }}</td><td>{{ money(item.forecastIncomeCents) }}</td><td>{{ money(item.realizedExpenseCents) }}</td><td>{{ money(item.forecastExpenseCents) }}</td></tr> }</tbody></table></div> }</article>
        </section>

        <section class="grid grid-2 dashboard-charts"><article class="card card-padding dashboard-chart-card"><div class="section-heading" style="margin-top:0"><div><h2>Evolução do saldo</h2><p class="muted small">{{ includeForecast() ? 'Realizado e projeção' : 'Somente realizado' }} · {{ summary().balanceEvolution.length > 31 ? 'por mês' : 'por dia' }}</p></div><a class="button-quiet" routerLink="/accounts">Ver contas →</a></div>@if (summary().balanceEvolution.length === 0) { <div class="dashboard-chart-empty" role="status"><p>Não há dados suficientes para exibir a evolução.</p></div> } @else { <app-echarts-chart [options]="balanceChartOptions()" [ariaLabel]="balanceChartLabel()"></app-echarts-chart><div class="dashboard-table-wrap"><table><caption class="visually-hidden">Evolução do saldo</caption><thead><tr><th scope="col">Data</th><th scope="col">Realizado</th><th scope="col">Projetado</th></tr></thead><tbody>@for (item of summary().balanceEvolution; track item.key) { <tr><th scope="row">{{ item.label }}</th><td>{{ money(item.realizedBalanceCents) }}</td><td>{{ money(item.projectedBalanceCents) }}</td></tr> }</tbody></table></div> }</article>
          <article class="card card-padding dashboard-chart-card"><div class="section-heading" style="margin-top:0"><div><h2>Visão por conta</h2><p class="muted small">Saldo atual e resultado no período</p></div></div>@if (summary().accounts.length === 0) { <div class="dashboard-chart-empty"><p>Nenhuma conta ativa para exibir.</p><a class="button-secondary" routerLink="/accounts">Cadastrar conta</a></div> } @else { <div class="dashboard-account-list">@for (item of summary().accounts; track item.account.id) { <a class="dashboard-account-item" [routerLink]="['/transactions']" [queryParams]="accountQuery(item.account.id)"><span class="entity-icon" [style.background]="item.account.color + '22'" [style.color]="item.account.color" aria-hidden="true">{{ item.account.icon }}</span><span><strong>{{ item.account.name }}</strong><small>Resultado no período: <em [class.positive]="item.periodResultCents >= 0" [class.negative]="item.periodResultCents < 0">{{ signedMoney(item.periodResultCents) }}</em></small></span><b [class.positive]="item.balanceCents >= 0" [class.negative]="item.balanceCents < 0">{{ money(item.balanceCents) }}</b></a> }</div> }</article></section>
      }
    }
  `,
})
export class DashboardComponent {
  readonly persistence = inject(PersistenceService);
  readonly transactionService = inject(TransactionService);
  private readonly dashboardService = inject(DashboardService);
  private readonly budgetService = inject(BudgetService);
  private readonly router = inject(Router);
  readonly periodMode = signal<PeriodMode>('month');
  readonly selectedMonth = signal(todayCivilDate().slice(0, 7));
  readonly customFrom = signal(`${todayCivilDate().slice(0, 7)}-01`);
  readonly customTo = signal(todayCivilDate());
  readonly includeForecast = signal(false);
  readonly periodError = computed(() => { try { this.periodMode() === 'month' ? periodForMonth(this.selectedMonth()) : periodForRange(this.customFrom(), this.customTo()); return null; } catch (error) { return error instanceof Error ? error.message : 'Informe um período válido.'; } });
  readonly period = computed(() => { if (this.periodError()) return periodForMonth(todayCivilDate().slice(0, 7)); return this.periodMode() === 'month' ? periodForMonth(this.selectedMonth()) : periodForRange(this.customFrom(), this.customTo()); });
  readonly summary = computed(() => this.dashboardService.consolidate(this.period(), todayCivilDate()));
  readonly budgetMonth = computed(() => this.period().from.slice(0, 7));
  readonly budgetSummary = computed(() => this.budgetService.summary(this.budgetMonth()));
  readonly hasAnyTransactions = computed(() => this.transactionService.activeTransactions().some((transaction) => transaction.status !== 'cancelled' && (transaction.type === 'income' || transaction.type === 'expense')));
  readonly expenseChartOptions = computed<EChartsOption>(() => ({ animation: false, aria: { enabled: true }, tooltip: { trigger: 'item' }, legend: { bottom: 0, type: 'scroll' }, series: [{ type: 'pie', radius: ['42%', '72%'], center: ['50%', '43%'], avoidLabelOverlap: true, label: { formatter: '{b}: {d}%' }, data: this.summary().expenseChart.map((item) => ({ name: item.name, value: item.amountCents, itemStyle: { color: item.color } })) }] }));
  readonly trendChartOptions = computed<EChartsOption>(() => ({ animation: false, aria: { enabled: true }, tooltip: { trigger: 'axis' }, legend: { bottom: 0, type: 'scroll' }, grid: { left: 12, right: 12, top: 16, bottom: 54, containLabel: true }, xAxis: { type: 'category', data: this.summary().monthlySeries.map((item) => item.label) }, yAxis: { type: 'value', axisLabel: { formatter: (value: number) => formatCents(value) } }, series: [{ name: 'Receita realizada', type: 'bar', data: this.summary().monthlySeries.map((item) => item.realizedIncomeCents), itemStyle: { color: '#17745c' } }, { name: 'Receita prevista', type: 'bar', data: this.summary().monthlySeries.map((item) => item.forecastIncomeCents), itemStyle: { color: '#72c8ba', decal: { symbol: 'dashed' } } }, { name: 'Despesa realizada', type: 'bar', data: this.summary().monthlySeries.map((item) => item.realizedExpenseCents), itemStyle: { color: '#b83a43' } }, { name: 'Despesa prevista', type: 'bar', data: this.summary().monthlySeries.map((item) => item.forecastExpenseCents), itemStyle: { color: '#f28b91', decal: { symbol: 'dashed' } } }] }));
  readonly balanceChartOptions = computed<EChartsOption>(() => ({ animation: false, aria: { enabled: true }, tooltip: { trigger: 'axis' }, legend: { bottom: 0 }, grid: { left: 12, right: 12, top: 16, bottom: 54, containLabel: true }, xAxis: { type: 'category', data: this.summary().balanceEvolution.map((item) => item.label), boundaryGap: false }, yAxis: { type: 'value', axisLabel: { formatter: (value: number) => formatCents(value) } }, series: [{ name: 'Saldo realizado', type: 'line', smooth: true, data: this.summary().balanceEvolution.map((item) => item.realizedBalanceCents), itemStyle: { color: '#0d6b63' }, lineStyle: { color: '#0d6b63', width: 3 } }, ...(this.includeForecast() ? [{ name: 'Saldo projetado', type: 'line' as const, smooth: true, data: this.summary().balanceEvolution.map((item) => item.projectedBalanceCents), itemStyle: { color: '#9b6900' }, lineStyle: { color: '#9b6900', type: 'dashed' as const, width: 2 } }] : [])] }));

  money(cents: number): string { return formatCents(cents); }
  signedMoney(cents: number): string { return `${cents >= 0 ? '+' : '−'}${formatCents(Math.abs(cents))}`; }
  formatDate(value: string): string { return formatCivilDate(value); }
  today(): string { return todayCivilDate(); }
  monthLabel(month: string): string { return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`)); }
  categoryName(categoryId: string): string { return this.persistence.snapshot().categories.find((category) => category.id === categoryId)?.name ?? 'Categoria'; }
  budgetBandLabel(value: keyof typeof BUDGET_ALERT_BAND_LABELS): string { return BUDGET_ALERT_BAND_LABELS[value]; }
  periodTitle(): string { const period = this.summary().period; return this.periodMode() === 'month' ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${period.from}T00:00:00Z`)) : `${this.formatDate(period.from)} a ${this.formatDate(period.to)}`; }
  comparisonPeriodLabel(): string { const period = this.summary().period; return `${this.formatDate(period.previousFrom)} a ${this.formatDate(period.previousTo)}`; }
  comparisonText(comparison: DashboardPeriodComparison): string { if (comparison.variationPercent === null) return 'Sem base comparável'; if (comparison.variationPercent === 0) return 'Sem variação vs. período anterior'; const sign = comparison.variationPercent > 0 ? '+' : '−'; return `${sign}${Math.abs(comparison.variationPercent).toFixed(1).replace('.', ',')}% vs. período anterior`; }
  comparisonIncreased(comparison: DashboardPeriodComparison): boolean { return comparison.variationPercent !== null && comparison.variationPercent > 0; }
  comparisonDecreased(comparison: DashboardPeriodComparison): boolean { return comparison.variationPercent !== null && comparison.variationPercent < 0; }
  expensesDecreased(comparison: DashboardPeriodComparison): boolean { return comparison.variationPercent !== null && comparison.variationPercent < 0; }
  expensesIncreased(comparison: DashboardPeriodComparison): boolean { return comparison.variationPercent !== null && comparison.variationPercent > 0; }
  categoryChartLabel(): string { return `Despesas por categoria no período. ${this.summary().expenseChart.map((item) => `${item.name}: ${this.money(item.amountCents)}`).join('; ')}.`; }
  trendChartLabel(): string { return `Receitas e despesas no período. ${this.summary().monthlySeries.map((item) => `${item.label}: receita realizada ${this.money(item.realizedIncomeCents)}, receita prevista ${this.money(item.forecastIncomeCents)}, despesa realizada ${this.money(item.realizedExpenseCents)}, despesa prevista ${this.money(item.forecastExpenseCents)}`).join('; ')}.`; }
  balanceChartLabel(): string { return `Evolução do saldo. ${this.summary().balanceEvolution.map((item) => `${item.label}: ${this.money(item.realizedBalanceCents)} realizado e ${this.money(item.projectedBalanceCents)} projetado`).join('; ')}.`; }

  setPeriodMode(mode: PeriodMode): void { this.periodMode.set(mode); }
  setMonth(event: Event): void { this.selectedMonth.set((event.target as HTMLInputElement).value); }
  setCustomDate(key: 'from' | 'to', event: Event): void { const value = (event.target as HTMLInputElement).value; if (key === 'from') this.customFrom.set(value); else this.customTo.set(value); }
  setCurrentMonth(): void { this.periodMode.set('month'); this.selectedMonth.set(todayCivilDate().slice(0, 7)); }
  setIncludeForecast(event: Event): void { this.includeForecast.set((event.target as HTMLInputElement).checked); }

  periodQuery(type?: 'expense' | 'income'): Record<string, string> { return { ...(type ? { type } : {}), movementFrom: this.summary().period.from, movementTo: this.summary().period.to }; }
  categoryQuery(categoryId: string | null, categoryIds: readonly (string | null)[] = []): Record<string, string> {
    const ids = categoryIds.filter((id): id is string => id !== null);
    return {
      ...this.periodQuery('expense'),
      ...(categoryId ? { categoryId } : {}),
      ...(ids.length ? { categoryIds: ids.join(',') } : {}),
      ...(categoryIds.some((id) => id === null) ? { uncategorized: '1' } : {}),
    };
  }
  accountQuery(accountId: string): Record<string, string> { return { ...this.periodQuery(), accountId }; }
  dueQuery(kind: 'overdue' | 'upcoming'): Record<string, string> { const today = this.today(); const period = this.summary().period; return kind === 'overdue' ? { dueFrom: period.from, dueTo: today < period.to ? today : period.to, openOnly: '1' } : { dueFrom: today > period.from ? today : period.from, dueTo: this.shiftDays(today, 7) < period.to ? this.shiftDays(today, 7) : period.to, openOnly: '1' }; }
  openExpenseChartPoint(event: EchartsPointClick): void { const item = this.summary().expenseChart[event.dataIndex]; if (item) this.openCategory(item); }
  openCategory(item: DashboardExpenseChartEntry): void { void this.router.navigate(['/transactions'], { queryParams: item.isOther ? this.categoryQuery(null, item.details.map((detail) => detail.categoryId)) : this.categoryQuery(item.categoryId) }); }
  goToTransactions(): void { void this.router.navigate(['/transactions'], { queryParams: { new: 1 } }); }
  reload(): void { void this.persistence.initialize(); }

  private shiftDays(value: string, amount: number): string { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); }
}
