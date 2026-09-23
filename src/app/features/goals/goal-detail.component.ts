import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { formatCivilDate, todayCivilDate } from '../../core/domain/civil-date';
import { formatCents, parseMoneyToCents } from '../../core/domain/money';
import { GOAL_CONTRIBUTION_TYPE_LABELS, GOAL_STATUS_LABELS, GoalContributionType, GoalStatus } from '../../core/domain/models';
import { AccountService } from '../../core/services/account.service';
import { GoalService } from '../../core/services/goal.service';
import { NotificationService } from '../../core/services/notification.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';

@Component({
  selector: 'app-goal-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (persistence.status() === 'loading') {
      <div class="loading-state" aria-live="polite"><span class="spinner" aria-hidden="true"></span>Carregando detalhe da meta…</div>
    } @else if (persistence.status() === 'error') {
      <section class="card card-padding error-state" role="alert"><h2>Não foi possível carregar a meta</h2><p>{{ persistence.errorMessage() }}</p><button type="button" class="button-secondary" (click)="reload()">Tentar novamente</button></section>
    } @else if (!goal()) {
      <section class="card"><app-empty-state icon="?" title="Meta não encontrada" description="A meta pode ter sido removida ou o endereço não é mais válido." actionLabel="Voltar para metas" (action)="goBack()"></app-empty-state></section>
    } @else {
      @let current = goal()!;
      @let currentProgress = progress()!;
      <app-page-header eyebrow="Detalhe da meta" [title]="current.title" [description]="current.description || 'Acompanhe o progresso e o histórico deste objetivo.'">
        <a page-actions routerLink="/goals" class="button-secondary">← Voltar para metas</a>
        @if (current.status === 'active' || current.status === 'paused') { <button page-actions type="button" class="button-primary" (click)="showContribution.set(!showContribution())">{{ showContribution() ? 'Fechar formulário' : 'Registrar movimentação' }}</button> }
      </app-page-header>

      <section class="grid grid-3 goal-detail-summary">
        <article class="card card-padding"><span class="label">Progresso</span><div class="value-xl" [style.color]="current.color">{{ currentProgress.percentage.toFixed(0) }}%</div><p class="muted small">{{ money(currentProgress.balanceCents) }} de {{ money(current.targetCents) }}</p></article>
        <article class="card card-padding"><span class="label">Falta</span><div class="value-xl" [class.positive]="currentProgress.remainingCents === 0" [class.negative]="currentProgress.remainingCents > 0">{{ money(currentProgress.remainingCents) }}</div><p class="muted small">{{ currentProgress.remainingCents === 0 ? 'Objetivo alcançado' : 'Saldo restante para atingir o objetivo' }}</p></article>
        <article class="card card-padding"><span class="label">Status</span><div class="goal-status-large" [attr.data-goal-status]="current.status">{{ statusLabel(current.status) }}</div><p class="muted small">{{ current.deadline ? 'Data-alvo: ' + date(current.deadline) : 'Sem data-alvo definida' }}</p></article>
      </section>

      <section class="grid grid-2 goal-detail-grid">
        <article class="card card-padding"><div class="section-heading" style="margin-top:0"><div><h2>Progresso e estimativa</h2><p class="muted small">A retirada reduz o saldo da meta, sem apagar o histórico.</p></div></div><div class="progress-track goal-progress goal-progress-large" role="progressbar" [attr.aria-valuenow]="currentProgress.percentage" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="'Progresso da meta: ' + currentProgress.percentage.toFixed(0) + '%'"><span [style.width.%]="currentProgress.percentage" [style.background]="current.color"></span></div><div class="goal-detail-values"><span>Valor inicial <b>{{ money(current.initialCents) }}</b></span><span>Aportes <b class="positive">{{ money(currentProgress.contributedCents) }}</b></span><span>Retiradas <b class="negative">{{ money(currentProgress.withdrawnCents) }}</b></span><span>Saldo atual <b>{{ money(currentProgress.balanceCents) }}</b></span></div>@if (currentProgress.estimatedMonthlyContributionCents !== null) { <div class="notice warning"><strong>Estimativa mensal: {{ money(currentProgress.estimatedMonthlyContributionCents) }}</strong><p class="small">Este valor é uma estimativa matemática para o prazo informado, não uma garantia de resultado.</p></div> } @else if (current.deadline && currentProgress.remainingCents > 0) { <p class="help-text">Não há estimativa mensal porque o prazo já passou. Defina uma nova data-alvo para recalcular.</p> }<div class="goal-status-actions"><span class="label">Alterar status</span><div class="row"><button type="button" class="button-quiet" [class.active-status-action]="current.status === 'active'" (click)="setStatus('active')">Ativa</button><button type="button" class="button-quiet" [class.active-status-action]="current.status === 'paused'" (click)="setStatus('paused')">Pausada</button><button type="button" class="button-quiet" [class.active-status-action]="current.status === 'completed'" (click)="setStatus('completed')">Concluída</button><button type="button" class="button-quiet danger-text" [class.active-status-action]="current.status === 'cancelled'" (click)="setStatus('cancelled')">Cancelada</button></div></div></article>

        @if (showContribution() && (current.status === 'active' || current.status === 'paused')) {
          <section class="card card-padding"><div class="section-heading" style="margin-top:0"><div><h2>Registrar movimentação</h2><p class="muted small">Isso atualiza imediatamente o progresso da meta, sem criar uma despesa ou receita.</p></div></div><form [formGroup]="form" (ngSubmit)="saveContribution()" class="stack" novalidate><div class="field"><label for="goal-entry-type">Tipo</label><select id="goal-entry-type" formControlName="type"><option value="contribution">Aporte</option><option value="withdrawal">Retirada</option></select></div><div class="form-grid"><div class="field"><label for="goal-entry-amount">Valor <span aria-hidden="true">*</span></label><input id="goal-entry-amount" formControlName="amount" inputmode="decimal" placeholder="0,00"></div><div class="field"><label for="goal-entry-date">Data</label><input id="goal-entry-date" type="date" formControlName="date"></div></div><div class="field"><label for="goal-entry-notes">Observações <span class="muted">(opcional)</span></label><textarea id="goal-entry-notes" rows="3" formControlName="notes" maxlength="300"></textarea></div>@if (formError()) { <p class="field-error" role="alert">{{ formError() }}</p> }<div class="form-actions"><button type="submit" class="button-primary" [disabled]="saving()">{{ saving() ? 'Salvando…' : 'Salvar movimentação' }}</button></div></form></section>
        } @else {
          <article class="card card-padding goal-detail-info"><div class="section-heading" style="margin-top:0"><div><h2>Dados da meta</h2><p class="muted small">Conta relacionada e organização visual.</p></div></div><div class="detail-grid goal-info-grid"><div><span class="label">Conta relacionada</span><strong>{{ accountName(current.accountId) }}</strong></div><div><span class="label">Cor e ícone</span><strong [style.color]="current.color">{{ current.icon }} {{ current.color }}</strong></div><div><span class="label">Criada em</span><span>{{ date(current.createdAt.slice(0, 10)) }}</span></div><div><span class="label">Prazo</span><span>{{ current.deadline ? date(current.deadline) : 'Não definido' }}</span></div></div><a class="button-secondary" routerLink="/goals">Editar dados na lista</a></article>
        }
      </section>

      <section class="card card-padding goal-history-card"><div class="section-heading" style="margin-top:0"><div><h2>Histórico</h2><p class="muted small">Cada entrada preserva data, tipo e observações.</p></div><span class="muted small">{{ goalService.contributionsFor(current.id).length }} registro(s)</span></div>@if (goalService.contributionsFor(current.id).length === 0) { <p class="dashboard-inline-empty">Ainda não há aportes ou retiradas. Registre o primeiro passo desta meta.</p> } @else { <div class="list">@for (entry of goalService.contributionsFor(current.id); track entry.id) { <div class="list-row goal-history-row"><span class="entity-icon small" [class.income-icon]="entry.type === 'contribution'" [class.expense-icon]="entry.type === 'withdrawal'" aria-hidden="true">{{ entry.type === 'contribution' ? '+' : '−' }}</span><div class="list-row-main"><strong>{{ contributionLabel(entry.type) }}</strong><div class="list-row-meta">{{ date(entry.date) }}@if (entry.notes) { · {{ entry.notes }} }</div></div><strong [class.positive]="entry.type === 'contribution'" [class.negative]="entry.type === 'withdrawal'">{{ entry.type === 'contribution' ? '+' : '−' }}{{ money(entry.amountCents) }}</strong></div> }</div> }</section>
    }
  `,
})
export class GoalDetailComponent {
  readonly persistence = inject(PersistenceService);
  readonly goalService = inject(GoalService);
  private readonly accountService = inject(AccountService);
  private readonly route = inject(ActivatedRoute);
  private readonly notifications = inject(NotificationService);
  private readonly formBuilder = inject(FormBuilder);
  readonly goalId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly goal = computed(() => this.goalService.getById(this.goalId));
  readonly progress = computed(() => { const goal = this.goal(); return goal ? this.goalService.progress(goal.id) : null; });
  readonly showContribution = signal(this.route.snapshot.queryParamMap.get('action') === 'contribute');
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly form = this.formBuilder.nonNullable.group({ type: ['contribution' as GoalContributionType, Validators.required], amount: ['', Validators.required], date: [todayCivilDate(), Validators.required], notes: [''] });

  money(cents: number): string { return formatCents(cents); }
  date(value: string): string { return formatCivilDate(value); }
  statusLabel(status: GoalStatus): string { return GOAL_STATUS_LABELS[status]; }
  contributionLabel(type: GoalContributionType): string { return GOAL_CONTRIBUTION_TYPE_LABELS[type]; }
  accountName(id: string | null): string { return id ? this.accountService.accounts().find((account) => account.id === id)?.name ?? 'Conta não encontrada' : 'Nenhuma conta relacionada'; }

  async saveContribution(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    this.formError.set(null);
    try {
      const value = this.form.getRawValue();
      await this.goalService.contribute(this.goalId, { type: value.type, amountCents: parseMoneyToCents(value.amount), date: value.date, notes: value.notes });
      this.notifications.success(value.type === 'contribution' ? 'Aporte registrado.' : 'Retirada registrada.');
      this.form.reset({ type: 'contribution', amount: '', date: todayCivilDate(), notes: '' });
      this.showContribution.set(false);
    } catch (error) { this.formError.set(error instanceof Error ? error.message : 'Não foi possível salvar a movimentação.'); }
    finally { this.saving.set(false); }
  }

  async setStatus(status: GoalStatus): Promise<void> {
    try { await this.goalService.setStatus(this.goalId, status); this.notifications.success(`Meta marcada como ${this.statusLabel(status).toLocaleLowerCase('pt-BR')}.`); }
    catch (error) { this.notifications.error(error instanceof Error ? error.message : 'Não foi possível atualizar o status.'); }
  }

  goBack(): void { window.history.back(); }
  reload(): void { void this.persistence.initialize(); }
}
