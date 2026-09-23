import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AccountService } from '../../core/services/account.service';
import { CategoryService } from '../../core/services/category.service';
import { NotificationService } from '../../core/services/notification.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { RecurrenceInput, RecurrenceEditScope, RecurrenceService } from '../../core/services/recurrence.service';
import { formatCents, parseMoneyToCents } from '../../core/domain/money';
import { formatCivilDate, todayCivilDate } from '../../core/domain/civil-date';
import { CATEGORY_TYPE_LABELS, CategoryType, PAYMENT_METHOD_LABELS, PaymentMethod, RecurrenceDatePolicy, RecurrenceFrequency, RecurrenceRule, Transaction, TransactionStatus, TRANSACTION_STATUS_LABELS } from '../../core/domain/models';
import { datePolicyLabel, recurrenceFrequencyLabel } from '../../core/domain/recurrence-rules';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

@Component({
  selector: 'app-recurrences',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (persistence.status() === 'loading') {
      <div class="loading-state"><span class="spinner" aria-hidden="true"></span>Carregando recorrências…</div>
    } @else if (persistence.status() === 'error') {
      <section class="card card-padding error-state" role="alert"><h2>Não foi possível carregar as recorrências</h2><p>{{ persistence.errorMessage() }}</p></section>
    } @else {
      <app-page-header eyebrow="Automatize o que se repete" title="Recorrências" description="Crie modelos de receitas e despesas previstas ou pendentes, com calendário e histórico preservados.">
        <button page-actions type="button" class="button-primary" (click)="startNew()">+ Nova recorrência</button>
      </app-page-header>

      <div class="two-column-layout recurrence-layout">
        <section class="card card-padding">
          <div class="section-heading" style="margin-top:0"><div><h2>Regras cadastradas</h2><p class="muted small">A geração é segura para repetir: uma ocorrência já materializada nunca é duplicada.</p></div></div>
          @if (recurrenceService.rules().length === 0) { <app-empty-state icon="↻" title="Nenhuma recorrência" description="Cadastre aluguel, salário, assinaturas ou outros compromissos repetitivos."></app-empty-state> }
          @else {
            <div class="list">
              @for (rule of recurrenceService.rules(); track rule.id) {
                <article class="list-row recurrence-rule-row">
                  <span class="entity-icon" aria-hidden="true">↻</span>
                  <div class="list-row-main"><div class="list-row-title"><strong>{{ rule.description }}</strong><span class="status-chip" [class.active]="rule.status === 'active'" [class.archived]="rule.status === 'ended'">{{ rule.status === 'active' ? 'Ativa' : 'Encerrada' }}</span></div><div class="list-row-meta">{{ recurrenceFrequencyLabel(rule.frequency) }} · {{ money(rule.amountCents) }} · {{ accountName(rule.accountId) }} · {{ categoryName(rule.categoryId) }}</div><div class="list-row-meta">{{ occurrencesLabel(rule) }} · {{ datePolicyLabel(rule.datePolicy) }}</div></div>
                  <div class="row-actions"><button type="button" class="button-quiet" (click)="editRule(rule)">Editar</button><button type="button" class="button-quiet" (click)="generate(rule)">Gerar 90 dias</button>@if (rule.status === 'active') { <button type="button" class="button-quiet danger-text" (click)="end(rule)">Encerrar</button> }</div>
                </article>
                @if (occurrences(rule.id).length > 0) {
                  <div class="recurrence-occurrences"><span class="label">Ocorrências materializadas</span>@for (occurrence of occurrences(rule.id); track occurrence.id) { <div class="recurrence-occurrence"><span>{{ date(occurrence.movementDate) }} · {{ occurrence.status === 'paid' ? 'Paga' : TRANSACTION_STATUS_LABELS[occurrence.status] }}</span><strong>{{ money(occurrence.amountCents) }}</strong>@if (occurrence.status !== 'paid') { <button type="button" class="button-quiet" (click)="editOccurrence(rule, occurrence)">Editar ocorrência</button> }</div> }</div>
                }
              }
            </div>
          }
        </section>

        @if (showForm()) {
          <section class="card card-padding">
            <div class="section-heading" style="margin-top:0"><div><h2>{{ editingRuleId() ? 'Editar recorrência' : 'Nova recorrência' }}</h2>@if (editingOccurrenceId()) { <p class="muted small">Escolha o alcance da alteração antes de salvar.</p> }</div>@if (editingRuleId()) { <button type="button" class="button-quiet" (click)="startNew()">Cancelar</button> }</div>
            <form [formGroup]="form" (ngSubmit)="save()" class="stack" novalidate>
              @if (editingOccurrenceId()) { <div class="field"><label for="recurrence-scope">Aplicar alteração</label><select id="recurrence-scope" formControlName="scope"><option value="occurrence">Somente esta ocorrência</option><option value="future">Esta e as futuras</option><option value="rule">Regra completa</option></select></div> }
              <div class="field"><label for="recurrence-description">Descrição <span aria-hidden="true">*</span></label><input id="recurrence-description" formControlName="description" maxlength="140"></div>
              <div class="form-grid"><div class="field"><label for="recurrence-type">Tipo</label><select id="recurrence-type" formControlName="type"><option value="expense">Despesa</option><option value="income">Receita</option></select></div><div class="field"><label for="recurrence-amount">Valor <span aria-hidden="true">*</span></label><input id="recurrence-amount" formControlName="amount" inputmode="decimal" placeholder="0,00"></div></div>
              <div class="form-grid"><div class="field"><label for="recurrence-account">Conta <span aria-hidden="true">*</span></label><select id="recurrence-account" formControlName="accountId"><option value="">Selecione</option>@for (account of accountService.activeAccounts(); track account.id) { <option [value]="account.id">{{ account.name }}</option> }</select></div><div class="field"><label for="recurrence-category">Categoria <span aria-hidden="true">*</span></label><select id="recurrence-category" formControlName="categoryId"><option value="">Selecione</option>@for (category of categoriesFor(form.controls.type.value); track category.id) { <option [value]="category.id">{{ category.name }}</option> }</select></div></div>
              <div class="form-grid"><div class="field"><label for="recurrence-frequency">Frequência</label><select id="recurrence-frequency" formControlName="frequency"><option value="weekly">Semanal</option><option value="monthly">Mensal</option><option value="yearly">Anual</option><option value="custom">Intervalo de dias</option></select></div><div class="field"><label for="recurrence-interval">Intervalo</label><input id="recurrence-interval" type="number" min="1" step="1" formControlName="interval"></div></div>
              <div class="form-grid"><div class="field"><label for="recurrence-start">Data inicial</label><input id="recurrence-start" type="date" formControlName="startDate"></div><div class="field"><label for="recurrence-end">Data final <span class="muted">(opcional)</span></label><input id="recurrence-end" type="date" formControlName="endDate"></div></div>
              <div class="form-grid"><div class="field"><label for="recurrence-max">Máximo de ocorrências <span class="muted">(opcional)</span></label><input id="recurrence-max" type="number" min="1" step="1" formControlName="maxOccurrences"></div><div class="field"><label for="recurrence-policy">Data inexistente</label><select id="recurrence-policy" formControlName="datePolicy"><option value="clamp">Ajustar para o último dia</option><option value="skip">Pular o mês</option></select></div></div>
              <div class="form-grid"><div class="field"><label for="recurrence-status">Criar ocorrência como</label><select id="recurrence-status" formControlName="creationStatus"><option value="planned">Prevista</option><option value="pending">Pendente</option></select></div><div class="field"><label for="recurrence-payment">Forma de pagamento</label><select id="recurrence-payment" formControlName="paymentMethod">@for (method of paymentMethods; track method.value) { <option [value]="method.value">{{ method.label }}</option> }</select></div></div>
              <div class="field"><label for="recurrence-tags">Tags <span class="muted">(opcional)</span></label><input id="recurrence-tags" formControlName="tags" placeholder="casa, fixa"></div>
              <div class="field"><label for="recurrence-notes">Observações <span class="muted">(opcional)</span></label><textarea id="recurrence-notes" rows="3" formControlName="notes"></textarea></div>
              @if (formError()) { <p class="field-error" role="alert">{{ formError() }}</p> }
              <div class="form-actions"><button type="submit" class="button-primary" [disabled]="saving()">{{ saving() ? 'Salvando…' : 'Salvar recorrência' }}</button></div>
            </form>
          </section>
        }
      </div>
    }
  `,
})
export class RecurrencesComponent {
  readonly recurrenceService = inject(RecurrenceService);
  readonly accountService = inject(AccountService);
  readonly categoryService = inject(CategoryService);
  readonly persistence = inject(PersistenceService);
  private readonly notifications = inject(NotificationService);
  private readonly formBuilder = inject(FormBuilder);
  readonly editingRuleId = signal<string | null>(null);
  readonly editingOccurrenceId = signal<string | null>(null);
  readonly showForm = signal(true);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly TRANSACTION_STATUS_LABELS = TRANSACTION_STATUS_LABELS;
  readonly paymentMethods: readonly { value: PaymentMethod; label: string }[] = Object.entries(PAYMENT_METHOD_LABELS).filter(([value]) => value !== 'credit-card').map(([value, label]) => ({ value: value as PaymentMethod, label }));
  readonly form = this.formBuilder.nonNullable.group({
    scope: ['rule' as RecurrenceEditScope],
    description: ['', Validators.required],
    amount: ['', Validators.required],
    type: ['expense' as CategoryType],
    categoryId: ['', Validators.required],
    accountId: ['', Validators.required],
    paymentMethod: ['pix' as PaymentMethod],
    creationStatus: ['planned' as Extract<TransactionStatus, 'planned' | 'pending'>],
    frequency: ['monthly' as RecurrenceFrequency],
    interval: [1, [Validators.required, Validators.min(1)]],
    startDate: [todayCivilDate(), Validators.required],
    endDate: [''],
    maxOccurrences: [''],
    datePolicy: ['clamp' as RecurrenceDatePolicy],
    tags: [''],
    notes: [''],
  });

  money(cents: number): string { return formatCents(cents); }
  date(value: string): string { return formatCivilDate(value); }
  recurrenceFrequencyLabel(value: RecurrenceFrequency): string { return recurrenceFrequencyLabel(value); }
  datePolicyLabel(value: RecurrenceDatePolicy): string { return datePolicyLabel(value); }
  accountName(id: string | null): string { return id ? this.accountService.accounts().find((account) => account.id === id)?.name ?? 'Conta não encontrada' : 'Conta não definida'; }
  categoryName(id: string | null): string { return id ? this.categoryService.categories().find((category) => category.id === id)?.name ?? 'Categoria não encontrada' : 'Categoria não definida'; }
  categoriesFor(type: CategoryType) { return this.categoryService.activeCategories().filter((category) => category.type === type); }
  occurrences(id: string): readonly Transaction[] { return this.recurrenceService.occurrences(id); }
  occurrencesLabel(rule: RecurrenceRule): string { return `${this.occurrences(rule.id).length} ocorrência(s)`; }

  startNew(): void {
    this.editingRuleId.set(null);
    this.editingOccurrenceId.set(null);
    this.showForm.set(true);
    this.formError.set(null);
    this.form.reset({ scope: 'rule', description: '', amount: '', type: 'expense', categoryId: '', accountId: this.accountService.defaultAccountId() ?? '', paymentMethod: 'pix', creationStatus: 'planned', frequency: 'monthly', interval: 1, startDate: todayCivilDate(), endDate: '', maxOccurrences: '', datePolicy: 'clamp', tags: '', notes: '' });
  }

  editRule(rule: RecurrenceRule): void {
    this.editingRuleId.set(rule.id);
    this.editingOccurrenceId.set(null);
    this.formError.set(null);
    this.form.reset(this.formValue(rule, 'rule'));
  }

  editOccurrence(rule: RecurrenceRule, occurrence: Transaction): void {
    this.editingRuleId.set(rule.id);
    this.editingOccurrenceId.set(occurrence.id);
    this.formError.set(null);
    this.form.reset({ ...this.formValue(rule, 'occurrence'), description: occurrence.description, amount: (occurrence.amountCents / 100).toFixed(2).replace('.', ','), categoryId: occurrence.categoryId ?? rule.categoryId ?? '', accountId: occurrence.accountId ?? rule.accountId ?? '', tags: occurrence.tags.join(', '), notes: occurrence.notes });
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    this.formError.set(null);
    try {
      const value = this.form.getRawValue();
      const input: RecurrenceInput = { description: value.description, amountCents: parseMoneyToCents(value.amount), type: value.type, categoryId: value.categoryId, accountId: value.accountId, paymentMethod: value.paymentMethod, creationStatus: value.creationStatus, tags: value.tags, notes: value.notes, frequency: value.frequency, interval: Number(value.interval), startDate: value.startDate, endDate: value.endDate || null, maxOccurrences: value.maxOccurrences ? Number(value.maxOccurrences) : null, datePolicy: value.datePolicy };
      if (!this.editingRuleId()) await this.recurrenceService.create(input);
      else if (this.editingOccurrenceId() && value.scope !== 'rule') await this.recurrenceService.updateFromOccurrence(this.editingRuleId()!, this.editingOccurrenceId()!, input, value.scope);
      else await this.recurrenceService.updateRule(this.editingRuleId()!, input);
      this.notifications.success(this.editingRuleId() ? 'Recorrência atualizada.' : 'Recorrência criada.');
      this.startNew();
    } catch (error) { this.formError.set(error instanceof Error ? error.message : 'Não foi possível salvar a recorrência.'); }
    finally { this.saving.set(false); }
  }

  async generate(rule: RecurrenceRule): Promise<void> {
    try { const created = await this.recurrenceService.generate(rule.id, addDays(todayCivilDate(), 90)); this.notifications.success(created.length ? `${created.length} ocorrência(s) gerada(s).` : 'A série já está atualizada.'); } catch (error) { this.notifications.error(error instanceof Error ? error.message : 'Não foi possível gerar a série.'); }
  }

  async end(rule: RecurrenceRule): Promise<void> {
    try { await this.recurrenceService.end(rule.id); this.notifications.success('Recorrência encerrada; o histórico foi preservado.'); } catch (error) { this.notifications.error(error instanceof Error ? error.message : 'Não foi possível encerrar a recorrência.'); }
  }

  private formValue(rule: RecurrenceRule, scope: RecurrenceEditScope) {
    return { scope, description: rule.description, amount: (rule.amountCents / 100).toFixed(2).replace('.', ','), type: rule.type, categoryId: rule.categoryId ?? '', accountId: rule.accountId ?? '', paymentMethod: rule.paymentMethod, creationStatus: rule.creationStatus, frequency: rule.frequency, interval: rule.interval, startDate: rule.startDate, endDate: rule.endDate ?? '', maxOccurrences: rule.maxOccurrences?.toString() ?? '', datePolicy: rule.datePolicy, tags: rule.tags.join(', '), notes: rule.notes };
  }
}

function addDays(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
