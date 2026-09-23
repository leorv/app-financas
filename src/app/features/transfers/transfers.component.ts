import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AccountService } from '../../core/services/account.service';
import { NotificationService } from '../../core/services/notification.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { TransferInput, TransferService } from '../../core/services/transfer.service';
import { formatCents, parseMoneyToCents } from '../../core/domain/money';
import { formatCivilDate, todayCivilDate } from '../../core/domain/civil-date';
import { TRANSACTION_STATUS_LABELS, Transaction, TransactionStatus } from '../../core/domain/models';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

@Component({
  selector: 'app-transfers',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (persistence.status() === 'loading') {
      <div class="loading-state"><span class="spinner" aria-hidden="true"></span>Carregando transferências…</div>
    } @else if (persistence.status() === 'error') {
      <section class="card card-padding error-state" role="alert"><h2>Não foi possível carregar as transferências</h2><p>{{ persistence.errorMessage() }}</p></section>
    } @else {
      <app-page-header eyebrow="Movimente entre suas contas" title="Transferências" description="Mova dinheiro entre contas sem criar receitas ou despesas artificiais.">
        <button page-actions type="button" class="button-primary" (click)="startNew()">+ Nova transferência</button>
      </app-page-header>

      <div class="two-column-layout transfer-layout">
        <section class="card card-padding">
          <div class="section-heading" style="margin-top:0"><div><h2>Histórico</h2><p class="muted small">Uma transferência paga reduz a origem e aumenta o destino pelo mesmo valor.</p></div></div>
          @if (transferService.transfers().length === 0) {
            <app-empty-state icon="⇄" title="Nenhuma transferência" description="Registre seu primeiro movimento entre contas."></app-empty-state>
          } @else {
            <div class="list">
              @for (transfer of transferService.transfers(); track transfer.id) {
                <article class="list-row transfer-row">
                  <span class="entity-icon" aria-hidden="true">⇄</span>
                  <div class="list-row-main"><div class="list-row-title"><strong>{{ transfer.description }}</strong><span class="status-chip" [class.active]="transfer.status === 'paid'" [class.archived]="transfer.status === 'cancelled'">{{ statusLabel(transfer.status) }}</span></div><div class="list-row-meta">{{ accountName(transfer.fromAccountId) }} → {{ accountName(transfer.toAccountId) }} · {{ date(transfer.movementDate) }}</div></div>
                  <strong class="transaction-amount">{{ money(transfer.amountCents) }}</strong>
                  <div class="row-actions"><button type="button" class="button-quiet" (click)="edit(transfer)">Editar</button>@if (transfer.status !== 'paid') { <button type="button" class="button-quiet" (click)="markPaid(transfer)">Marcar paga</button> } @if (transfer.status !== 'cancelled') { <button type="button" class="button-quiet danger-text" (click)="cancel(transfer)">Cancelar</button> } @else { <button type="button" class="button-quiet" (click)="reopen(transfer)">Reabrir</button> }</div>
                </article>
              }
            </div>
          }
        </section>

        @if (showForm()) {
          <section class="card card-padding">
            <div class="section-heading" style="margin-top:0"><h2>{{ editingId() ? 'Editar transferência' : 'Nova transferência' }}</h2>@if (editingId()) { <button type="button" class="button-quiet" (click)="startNew()">Cancelar</button> }</div>
            <form [formGroup]="form" (ngSubmit)="save()" class="stack" novalidate>
              <p class="notice">Taxas bancárias, quando houver, são despesas separadas e podem ser registradas em Movimentações.</p>
              <div class="form-grid"><div class="field"><label for="transfer-from">Origem <span aria-hidden="true">*</span></label><select id="transfer-from" formControlName="fromAccountId"><option value="">Selecione</option>@for (account of accountService.activeAccounts(); track account.id) { <option [value]="account.id">{{ account.name }}</option> }</select></div><div class="field"><label for="transfer-to">Destino <span aria-hidden="true">*</span></label><select id="transfer-to" formControlName="toAccountId"><option value="">Selecione</option>@for (account of accountService.activeAccounts(); track account.id) { <option [value]="account.id">{{ account.name }}</option> }</select></div></div>
              <div class="field"><label for="transfer-amount">Valor <span aria-hidden="true">*</span></label><input id="transfer-amount" formControlName="amount" inputmode="decimal" placeholder="0,00"></div>
              <div class="form-grid"><div class="field"><label for="transfer-date">Data <span aria-hidden="true">*</span></label><input id="transfer-date" type="date" formControlName="movementDate"></div><div class="field"><label for="transfer-status">Situação</label><select id="transfer-status" formControlName="status"><option value="planned">Prevista</option><option value="pending">Pendente</option><option value="paid">Paga</option></select></div></div>
              @if (form.controls.status.value === 'paid') { <div class="field"><label for="transfer-payment-date">Data de pagamento</label><input id="transfer-payment-date" type="date" formControlName="paymentDate"></div> }
              <div class="field"><label for="transfer-description">Descrição <span class="muted">(opcional)</span></label><input id="transfer-description" formControlName="description" maxlength="140"></div>
              <div class="field"><label for="transfer-notes">Observações <span class="muted">(opcional)</span></label><textarea id="transfer-notes" rows="3" formControlName="notes"></textarea></div>
              @if (formError()) { <p class="field-error" role="alert">{{ formError() }}</p> }
              <div class="form-actions"><button type="submit" class="button-primary" [disabled]="saving()">{{ saving() ? 'Salvando…' : 'Salvar transferência' }}</button></div>
            </form>
          </section>
        }
      </div>
    }
  `,
})
export class TransfersComponent {
  readonly transferService = inject(TransferService);
  readonly accountService = inject(AccountService);
  readonly persistence = inject(PersistenceService);
  private readonly notifications = inject(NotificationService);
  private readonly formBuilder = inject(FormBuilder);
  readonly editingId = signal<string | null>(null);
  readonly showForm = signal(true);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly form = this.formBuilder.nonNullable.group({
    fromAccountId: ['', Validators.required],
    toAccountId: ['', Validators.required],
    amount: ['', Validators.required],
    movementDate: [todayCivilDate(), Validators.required],
    paymentDate: [todayCivilDate()],
    status: ['planned' as Extract<TransactionStatus, 'planned' | 'pending' | 'paid'>],
    description: [''],
    notes: [''],
  });

  money(cents: number): string { return formatCents(cents); }
  date(value: string): string { return formatCivilDate(value); }
  statusLabel(status: TransactionStatus): string { return TRANSACTION_STATUS_LABELS[status]; }
  accountName(id: string | null): string { return this.transferService.accountFor(id)?.name ?? 'Conta não encontrada'; }

  startNew(): void {
    this.editingId.set(null);
    this.showForm.set(true);
    this.formError.set(null);
    const defaultId = this.accountService.defaultAccountId();
    this.form.reset({ fromAccountId: defaultId ?? '', toAccountId: '', amount: '', movementDate: todayCivilDate(), paymentDate: todayCivilDate(), status: 'planned', description: '', notes: '' });
  }

  edit(transfer: Transaction): void {
    this.editingId.set(transfer.id);
    this.showForm.set(true);
    this.formError.set(null);
    this.form.reset({ fromAccountId: transfer.fromAccountId ?? '', toAccountId: transfer.toAccountId ?? '', amount: (transfer.amountCents / 100).toFixed(2).replace('.', ','), movementDate: transfer.movementDate, paymentDate: transfer.paymentDate ?? todayCivilDate(), status: transfer.status === 'cancelled' ? 'pending' : transfer.status, description: transfer.description, notes: transfer.notes });
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    this.formError.set(null);
    try {
      const value = this.form.getRawValue();
      const input: TransferInput = { ...value, amountCents: parseMoneyToCents(value.amount), paymentDate: value.status === 'paid' ? value.paymentDate : null };
      if (this.editingId()) await this.transferService.update(this.editingId()!, input);
      else await this.transferService.create(input);
      this.notifications.success(this.editingId() ? 'Transferência atualizada.' : 'Transferência criada.');
      this.startNew();
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'Não foi possível salvar a transferência.');
    } finally { this.saving.set(false); }
  }

  async markPaid(transfer: Transaction): Promise<void> { try { await this.transferService.markAsPaid(transfer.id); this.notifications.success('Transferência marcada como paga.'); } catch (error) { this.notifications.error(error instanceof Error ? error.message : 'Não foi possível atualizar a transferência.'); } }
  async cancel(transfer: Transaction): Promise<void> { try { await this.transferService.cancel(transfer.id); this.notifications.success('Transferência cancelada; os dois efeitos foram desfeitos.'); } catch (error) { this.notifications.error(error instanceof Error ? error.message : 'Não foi possível cancelar.'); } }
  async reopen(transfer: Transaction): Promise<void> { try { await this.transferService.reopen(transfer.id); this.notifications.success('Transferência reaberta.'); } catch (error) { this.notifications.error(error instanceof Error ? error.message : 'Não foi possível reabrir.'); } }
}
