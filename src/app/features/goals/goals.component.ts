import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FinancialGoal, GOAL_STATUS_LABELS, GoalStatus } from '../../core/domain/models';
import { formatCivilDate, todayCivilDate } from '../../core/domain/civil-date';
import { formatCents, parseMoneyToCents } from '../../core/domain/money';
import { AccountService } from '../../core/services/account.service';
import { GoalService } from '../../core/services/goal.service';
import { NotificationService } from '../../core/services/notification.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';

@Component({
  selector: 'app-goals',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (persistence.status() === 'loading') {
      <div class="loading-state" aria-live="polite"><span class="spinner" aria-hidden="true"></span>Carregando metas…</div>
    } @else if (persistence.status() === 'error') {
      <section class="card card-padding error-state" role="alert"><h2>Não foi possível carregar as metas</h2><p>{{ persistence.errorMessage() }}</p><button type="button" class="button-secondary" (click)="reload()">Tentar novamente</button></section>
    } @else {
      <app-page-header eyebrow="Objetivos que cabem na vida real" title="Metas financeiras" description="Acompanhe aportes e retiradas, veja o quanto falta e mantenha o prazo como uma estimativa transparente.">
        <button page-actions type="button" class="button-primary" (click)="startNew()">+ Nova meta</button>
      </app-page-header>

      <div class="two-column-layout goal-layout">
        <section class="card card-padding">
          <div class="section-heading" style="margin-top:0"><div><h2>Suas metas</h2><p class="muted small">Aportes e retiradas são um histórico de planejamento e não lançam valores automaticamente nas contas.</p></div></div>
          @if (goalService.activeGoals().length === 0) {
            <app-empty-state icon="◇" title="Nenhuma meta cadastrada" description="Crie um objetivo, defina o valor inicial e acompanhe cada passo até lá." actionLabel="Criar primeira meta" (action)="startNew()"></app-empty-state>
          } @else {
            <div class="goal-list">
              @for (goal of goalService.activeGoals(); track goal.id) {
                @let progress = goalService.progress(goal.id);
                <article class="goal-card" [style.--goal-color]="goal.color">
                  <div class="goal-card-heading"><span class="entity-icon" [style.background]="goal.color + '22'" [style.color]="goal.color" aria-hidden="true">{{ goal.icon }}</span><div class="goal-card-title"><strong>{{ goal.title }}</strong><span class="status-chip" [attr.data-goal-status]="goal.status">{{ statusLabel(goal.status) }}</span><small>{{ goal.deadline ? 'Prazo: ' + date(progress.goal.deadline!) : 'Sem data-alvo' }}</small></div><button type="button" class="button-quiet" (click)="editGoal(goal)">Editar</button></div>
                  <div class="goal-progress-label"><span>{{ money(progress.balanceCents) }} de {{ money(goal.targetCents) }}</span><strong>{{ progress.percentage.toFixed(0) }}%</strong></div><div class="progress-track goal-progress" role="progressbar" [attr.aria-valuenow]="progress.percentage" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="'Progresso da meta ' + goal.title + ': ' + progress.percentage.toFixed(0) + '%'"><span [style.width.%]="progress.percentage"></span></div><div class="goal-card-footer"><span [class.positive]="progress.remainingCents === 0" [class.negative]="progress.remainingCents > 0">{{ progress.remainingCents === 0 ? 'Objetivo alcançado' : 'Faltam ' + money(progress.remainingCents) }}</span>@if (progress.estimatedMonthlyContributionCents !== null) { <span class="help-text">Estimativa mensal: {{ money(progress.estimatedMonthlyContributionCents) }} <abbr title="O valor é uma estimativa baseada no prazo e pode mudar.">*</abbr></span> } @else if (goal.deadline) { <span class="help-text">Sem estimativa: prazo vencido ou meta concluída.</span> }</div><div class="row-actions goal-card-actions"><a class="button-secondary button-small" [routerLink]="['/goals', goal.id]">Ver detalhes</a>@if (goal.status === 'active' || goal.status === 'paused') { <a class="button-primary button-small" [routerLink]="['/goals', goal.id]" [queryParams]="{ action: 'contribute' }">Registrar aporte</a> }</div>
                </article>
              }
            </div>
          }
        </section>

        @if (showForm()) {
          <section class="card card-padding">
            <div class="section-heading" style="margin-top:0"><div><h2>{{ editingGoalId() ? 'Editar meta' : 'Nova meta' }}</h2><p class="muted small">O valor inicial é a base da meta; o histórico começa nos próximos aportes.</p></div><button type="button" class="button-quiet" (click)="cancelForm()">Fechar</button></div>
            <form [formGroup]="form" (ngSubmit)="save()" class="stack" novalidate>
              <div class="field"><label for="goal-title">Título <span aria-hidden="true">*</span></label><input id="goal-title" formControlName="title" maxlength="100" placeholder="Ex.: Reserva de emergência"></div>
              <div class="field"><label for="goal-description">Descrição <span class="muted">(opcional)</span></label><textarea id="goal-description" rows="3" formControlName="description" maxlength="400" placeholder="Por que esta meta é importante?"></textarea></div>
              <div class="form-grid"><div class="field"><label for="goal-target">Objetivo <span aria-hidden="true">*</span></label><input id="goal-target" formControlName="target" inputmode="decimal" placeholder="0,00"></div><div class="field"><label for="goal-initial">Valor inicial</label><input id="goal-initial" formControlName="initial" inputmode="decimal" placeholder="0,00"></div></div>
              <div class="form-grid"><div class="field"><label for="goal-deadline">Data-alvo <span class="muted">(opcional)</span></label><input id="goal-deadline" type="date" formControlName="deadline"></div><div class="field"><label for="goal-account">Conta relacionada <span class="muted">(opcional)</span></label><select id="goal-account" formControlName="accountId"><option value="">Nenhuma</option>@for (account of accountService.activeAccounts(); track account.id) { <option [value]="account.id">{{ account.name }}</option> }</select></div></div>
              <div class="form-grid"><div class="field"><label for="goal-color">Cor</label><input id="goal-color" class="color-input" type="color" formControlName="color"></div><div class="field"><label for="goal-icon">Ícone</label><input id="goal-icon" formControlName="icon" maxlength="4" aria-label="Ícone da meta"></div></div>
              @if (formError()) { <p class="field-error" role="alert">{{ formError() }}</p> }
              <div class="form-actions"><button type="submit" class="button-primary" [disabled]="saving()">{{ saving() ? 'Salvando…' : 'Salvar meta' }}</button></div>
            </form>
          </section>
        }
      </div>
    }
  `,
})
export class GoalsComponent {
  readonly persistence = inject(PersistenceService);
  readonly goalService = inject(GoalService);
  readonly accountService = inject(AccountService);
  private readonly notifications = inject(NotificationService);
  private readonly formBuilder = inject(FormBuilder);
  readonly editingGoalId = signal<string | null>(null);
  readonly showForm = signal(true);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly form = this.formBuilder.nonNullable.group({
    title: ['', Validators.required],
    description: [''],
    target: ['', Validators.required],
    initial: ['0,00', Validators.required],
    deadline: [''],
    accountId: [''],
    color: ['#0d6b63', Validators.required],
    icon: ['◇', Validators.required],
  });

  money(cents: number): string { return formatCents(cents); }
  date(value: string): string { return formatCivilDate(value); }
  statusLabel(status: GoalStatus): string { return GOAL_STATUS_LABELS[status]; }

  startNew(): void {
    this.editingGoalId.set(null);
    this.showForm.set(true);
    this.formError.set(null);
    this.form.reset({ title: '', description: '', target: '', initial: '0,00', deadline: '', accountId: this.accountService.defaultAccountId() ?? '', color: '#0d6b63', icon: '◇' });
  }

  editGoal(goal: FinancialGoal): void {
    this.editingGoalId.set(goal.id);
    this.showForm.set(true);
    this.formError.set(null);
    this.form.reset({ title: goal.title, description: goal.description, target: this.displayMoney(goal.targetCents), initial: this.displayMoney(goal.initialCents), deadline: goal.deadline ?? '', accountId: goal.accountId ?? '', color: goal.color, icon: goal.icon });
  }

  cancelForm(): void { this.showForm.set(false); this.editingGoalId.set(null); this.formError.set(null); }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    this.formError.set(null);
    try {
      const value = this.form.getRawValue();
      const input = { title: value.title, description: value.description, targetCents: parseMoneyToCents(value.target), initialCents: parseMoneyToCents(value.initial), deadline: value.deadline || null, accountId: value.accountId || null, color: value.color, icon: value.icon };
      if (this.editingGoalId()) await this.goalService.update(this.editingGoalId()!, input);
      else await this.goalService.create(input);
      this.notifications.success(this.editingGoalId() ? 'Meta atualizada.' : 'Meta criada.');
      this.startNew();
    } catch (error) { this.formError.set(error instanceof Error ? error.message : 'Não foi possível salvar a meta.'); }
    finally { this.saving.set(false); }
  }

  reload(): void { void this.persistence.initialize(); }
  private displayMoney(cents: number): string { return (cents / 100).toFixed(2).replace('.', ','); }
}
