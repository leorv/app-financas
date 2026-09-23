import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Account, ACCOUNT_TYPE_LABELS, AccountType } from '../../core/domain/models';
import { parseMoneyToCents, formatCents } from '../../core/domain/money';
import { AccountService } from '../../core/services/account.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

@Component({
  selector: 'app-accounts',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (persistence.status() === 'loading') {
      <div class="loading-state"><span class="spinner" aria-hidden="true"></span>Carregando contas…</div>
    } @else if (persistence.status() === 'error') {
      <section class="card card-padding error-state" role="alert"><h2>Não foi possível carregar as contas</h2><p>{{ persistence.errorMessage() }}</p></section>
    } @else {
      <app-page-header eyebrow="Onde seu dinheiro está" title="Contas" description="Acompanhe cada lugar onde o seu dinheiro fica guardado.">
        <button page-actions type="button" class="button-primary" (click)="startNew()">+ Nova conta</button>
      </app-page-header>
      <div class="grid" style="grid-template-columns: minmax(0, 1.35fr) minmax(320px, .8fr); align-items: start">
        <section class="card card-padding">
          @if (accountService.accounts().length === 0) {
            <app-empty-state icon="◉" title="Nenhuma conta cadastrada" description="Cadastre sua primeira conta para que o saldo inicial fique organizado." actionLabel="Criar primeira conta" (action)="startNew()"></app-empty-state>
          } @else {
            <div class="section-heading" style="margin-top:0"><h2>Suas contas</h2><span class="muted small">{{ accountService.activeAccounts().length }} ativa(s)</span></div>
            <div class="list">
              @for (account of accountService.accounts(); track account.id) {
                <div class="list-row">
                  <span class="entity-icon" [style.background]="account.color + '22'" [style.color]="account.color" aria-hidden="true">{{ account.icon }}</span>
                  <div class="list-row-main"><div class="list-row-title">{{ account.name }} @if (account.isDefault && !account.archived) { <span class="status-chip default">Padrão</span> }</div><div class="list-row-meta">{{ account.institution || ACCOUNT_TYPE_LABELS[account.type] }} · <span class="status-chip" [class.active]="!account.archived" [class.archived]="account.archived">{{ account.archived ? 'Arquivada' : 'Ativa' }}</span></div></div>
                  <div class="account-balance" [class.negative]="accountService.balance(account) < 0">{{ money(accountService.balance(account)) }}</div>
                  <a class="button-icon" [routerLink]="['/accounts', account.id]" [attr.aria-label]="'Abrir detalhes de ' + account.name">›</a>
                  <button type="button" class="button-icon" [attr.aria-label]="'Editar ' + account.name" (click)="edit(account)">✎</button>
                  @if (!account.archived) { <button type="button" class="button-quiet" (click)="archive(account)">Arquivar</button> } @else { <button type="button" class="button-quiet" (click)="reactivate(account)">Reativar</button> }
                </div>
              }
            </div>
          }
        </section>

        <section class="card card-padding">
          <div class="section-heading" style="margin-top:0"><h2>{{ editingId() ? 'Editar conta' : 'Nova conta' }}</h2>@if (editingId()) { <button type="button" class="button-quiet" (click)="startNew()">Cancelar</button> }</div>
          <p class="muted small">O saldo atual é calculado pelo saldo inicial e apenas pelas movimentações efetivadas.</p>
          <form [formGroup]="form" (ngSubmit)="save()" class="stack" novalidate>
            <div class="field"><label for="account-name">Nome <span aria-hidden="true">*</span></label><input id="account-name" formControlName="name" autocomplete="off"><span class="field-error" *ngIf="form.controls.name.touched && form.controls.name.hasError('required')">Informe um nome.</span></div>
            <div class="field"><label for="account-type">Tipo</label><select id="account-type" formControlName="type">@for (type of accountTypes; track type.value) { <option [value]="type.value">{{ type.label }}</option> }</select></div>
            <div class="field"><label for="account-institution">Instituição <span class="muted">(opcional)</span></label><input id="account-institution" formControlName="institution" autocomplete="organization"></div>
            <div class="field"><label for="account-balance">Saldo inicial</label><input id="account-balance" formControlName="initialBalance" inputmode="decimal" placeholder="0,00"><span class="help-text">Use centavos no armazenamento; aqui você pode digitar no formato R$ 1.234,56.</span></div>
            <div class="form-grid"><div class="field"><label for="account-color">Cor</label><input id="account-color" class="color-input" type="color" formControlName="color"></div><div class="field"><label for="account-icon">Ícone</label><input id="account-icon" formControlName="icon" maxlength="3"></div></div>
            <label class="checkbox-field"><input type="checkbox" formControlName="isDefault"> Definir como conta padrão para novos lançamentos</label>
            @if (formError()) { <p class="field-error" role="alert">{{ formError() }}</p> }
            <div class="form-actions"><button type="submit" class="button-primary" [disabled]="saving()">{{ saving() ? 'Salvando…' : 'Salvar conta' }}</button></div>
          </form>
        </section>
      </div>
    }
  `,
})
export class AccountsComponent {
  readonly accountService = inject(AccountService);
  readonly persistence = inject(PersistenceService);
  private readonly notifications = inject(NotificationService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly formBuilder = inject(FormBuilder);
  readonly ACCOUNT_TYPE_LABELS = ACCOUNT_TYPE_LABELS;
  readonly accountTypes: readonly { value: AccountType; label: string }[] = Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => ({ value: value as AccountType, label }));
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    type: ['checking' as AccountType],
    institution: [''],
    initialBalance: ['0,00'],
    color: ['#0d6b63'],
    icon: ['◉', [Validators.required, Validators.maxLength(3)]],
    isDefault: [false],
  });

  money(cents: number): string { return formatCents(cents); }

  startNew(): void {
    this.editingId.set(null);
    this.formError.set(null);
    this.form.reset({ name: '', type: 'checking', institution: '', initialBalance: '0,00', color: '#0d6b63', icon: '◉', isDefault: this.accountService.activeAccounts().length === 0 });
  }

  edit(account: Account): void {
    this.editingId.set(account.id);
    this.formError.set(null);
    this.form.reset({ name: account.name, type: account.type, institution: account.institution ?? '', initialBalance: this.centsInput(account.initialBalanceCents), color: account.color, icon: account.icon, isDefault: account.isDefault });
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    this.formError.set(null);
    try {
      const value = this.form.getRawValue();
      const input = { ...value, initialBalanceCents: parseMoneyToCents(value.initialBalance) };
      if (this.editingId()) await this.accountService.update(this.editingId()!, input);
      else await this.accountService.create(input);
      this.notifications.success(this.editingId() ? 'Conta atualizada.' : 'Conta criada.');
      this.startNew();
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'Não foi possível salvar a conta.');
    } finally {
      this.saving.set(false);
    }
  }

  async archive(account: Account): Promise<void> {
    const proceed = await this.confirm.ask({ title: 'Arquivar conta?', message: `“${account.name}” não poderá receber novos lançamentos, mas o histórico será preservado.`, confirmLabel: 'Arquivar', destructive: true });
    if (!proceed) return;
    try { await this.accountService.archive(account.id); this.notifications.success('Conta arquivada.'); } catch (error) { this.notifications.error(error instanceof Error ? error.message : 'Não foi possível arquivar.'); }
  }

  async reactivate(account: Account): Promise<void> {
    try { await this.accountService.reactivate(account.id); this.notifications.success('Conta reativada.'); } catch (error) { this.notifications.error(error instanceof Error ? error.message : 'Não foi possível reativar.'); }
  }

  private centsInput(cents: number): string {
    return (cents / 100).toFixed(2).replace('.', ',');
  }
}
