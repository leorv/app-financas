import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CreditCard, Account } from '../../core/domain/models';
import { formatCents, parseMoneyToCents } from '../../core/domain/money';
import { CreditCardInput, CreditCardService } from '../../core/services/credit-card.service';
import { AccountService } from '../../core/services/account.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

@Component({
  selector: 'app-cards',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (persistence.status() === 'loading') {
      <div class="loading-state"><span class="spinner" aria-hidden="true"></span>Carregando cartões…</div>
    } @else if (persistence.status() === 'error') {
      <section class="card card-padding error-state" role="alert"><h2>Não foi possível carregar os cartões</h2><p>{{ persistence.errorMessage() }}</p></section>
    } @else {
      <app-page-header eyebrow="Crédito sob controle" title="Cartões" description="Acompanhe o limite comprometido, as compras e as faturas sem duplicar o saldo das suas contas.">
        <button page-actions type="button" class="button-primary" (click)="startNew()">+ Novo cartão</button>
      </app-page-header>
      <div class="grid credit-cards-layout">
        <section class="card card-padding">
          @if (cardService.cards().length === 0) {
            <app-empty-state icon="▣" title="Nenhum cartão cadastrado" description="Cadastre um cartão para controlar compras parceladas e faturas." actionLabel="Cadastrar primeiro cartão" (action)="startNew()"></app-empty-state>
          } @else {
            <div class="section-heading" style="margin-top:0"><h2>Seus cartões</h2><span class="muted small">{{ cardService.activeCards().length }} ativo(s)</span></div>
            <div class="list">
              @for (card of cardService.cards(); track card.id) {
                <article class="list-row credit-card-row" [class.archived-row]="card.archived">
                  <span class="entity-icon" [style.background]="card.color + '22'" [style.color]="card.color" aria-hidden="true">{{ card.icon }}</span>
                  <div class="list-row-main"><div class="list-row-title"><a [routerLink]="['/cards', card.id]">{{ card.name }}</a> @if (card.brand) { <span class="muted small">· {{ card.brand }}</span> }</div><div class="list-row-meta">Fecha dia {{ card.closingDay }} · vence dia {{ card.dueDay }} · <span class="status-chip" [class.active]="!card.archived" [class.archived]="card.archived">{{ card.archived ? 'Arquivado' : 'Ativo' }}</span></div></div>
                  <div class="card-limit-summary"><span class="muted small">Disponível</span><strong [class.negative]="cardService.availableLimit(card) < 0">{{ money(cardService.availableLimit(card)) }}</strong><span class="muted small">de {{ money(card.creditLimitCents) }}</span><span class="muted small">{{ cardService.nextInvoice(card)?.competence ? 'Próxima: ' + cardService.nextInvoice(card)?.competence : 'Sem fatura aberta' }}</span></div>
                  <a class="button-icon" [routerLink]="['/cards', card.id]" [attr.aria-label]="'Abrir detalhes de ' + card.name">›</a>
                  @if (!card.archived) { <button type="button" class="button-icon" [attr.aria-label]="'Editar ' + card.name" (click)="edit(card)">✎</button><button type="button" class="button-quiet" (click)="archive(card)">Arquivar</button> } @else { <button type="button" class="button-quiet" (click)="reactivate(card)">Reativar</button> }
                </article>
              }
            </div>
          }
        </section>

        <section class="card card-padding">
          <div class="section-heading" style="margin-top:0"><h2>{{ editingId() ? 'Editar cartão' : 'Novo cartão' }}</h2>@if (editingId()) { <button type="button" class="button-quiet" (click)="startNew()">Cancelar</button> }</div>
          <p class="muted small">A conta vinculada só é debitada quando a fatura for paga.</p>
          <form [formGroup]="form" (ngSubmit)="save()" class="stack" novalidate>
            <div class="field"><label for="card-name">Nome <span aria-hidden="true">*</span></label><input id="card-name" formControlName="name" autocomplete="off"></div>
            <div class="field"><label for="card-brand">Bandeira <span class="muted">(opcional)</span></label><input id="card-brand" formControlName="brand" autocomplete="organization"></div>
            <div class="field"><label for="card-account">Conta para pagamento <span aria-hidden="true">*</span></label><select id="card-account" formControlName="paymentAccountId"><option value="">Selecione uma conta</option>@for (account of paymentAccounts(); track account.id) { <option [value]="account.id">{{ account.name }}</option> }</select></div>
            <div class="field"><label for="card-limit">Limite total <span aria-hidden="true">*</span></label><input id="card-limit" formControlName="creditLimit" inputmode="decimal" placeholder="0,00"></div>
            <div class="form-grid"><div class="field"><label for="card-closing">Fechamento</label><input id="card-closing" type="number" min="1" max="31" formControlName="closingDay"><span class="help-text">Dia do mês.</span></div><div class="field"><label for="card-due">Vencimento</label><input id="card-due" type="number" min="1" max="31" formControlName="dueDay"><span class="help-text">Meses curtos são ajustados para o último dia.</span></div></div>
            <div class="form-grid"><div class="field"><label for="card-color">Cor</label><input id="card-color" class="color-input" type="color" formControlName="color"></div><div class="field"><label for="card-icon">Ícone</label><input id="card-icon" formControlName="icon" maxlength="3"></div></div>
            @if (formError()) { <p class="field-error" role="alert">{{ formError() }}</p> }
            <div class="form-actions"><button type="submit" class="button-primary" [disabled]="saving()">{{ saving() ? 'Salvando…' : 'Salvar cartão' }}</button></div>
          </form>
        </section>
      </div>
    }
  `,
})
export class CardsComponent {
  readonly cardService = inject(CreditCardService);
  readonly accountService = inject(AccountService);
  readonly persistence = inject(PersistenceService);
  private readonly notifications = inject(NotificationService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly formBuilder = inject(FormBuilder);
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    brand: [''],
    paymentAccountId: ['', Validators.required],
    creditLimit: ['0,00', Validators.required],
    closingDay: [10, [Validators.required, Validators.min(1), Validators.max(31)]],
    dueDay: [17, [Validators.required, Validators.min(1), Validators.max(31)]],
    color: ['#3155a6'],
    icon: ['▣', [Validators.required, Validators.maxLength(3)]],
  });

  paymentAccounts(): Account[] {
    const selected = this.form.controls.paymentAccountId.value;
    return this.accountService.accounts().filter((account) => !account.archived || account.id === selected);
  }

  money(cents: number): string { return formatCents(cents); }

  startNew(): void {
    this.editingId.set(null);
    this.formError.set(null);
    this.form.reset({ name: '', brand: '', paymentAccountId: this.accountService.defaultAccountId() ?? '', creditLimit: '0,00', closingDay: 10, dueDay: 17, color: '#3155a6', icon: '▣' });
  }

  edit(card: CreditCard): void {
    this.editingId.set(card.id);
    this.formError.set(null);
    this.form.reset({ name: card.name, brand: card.brand ?? '', paymentAccountId: card.paymentAccountId ?? '', creditLimit: this.centsInput(card.creditLimitCents), closingDay: card.closingDay, dueDay: card.dueDay, color: card.color, icon: card.icon });
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) { this.formError.set('Preencha os campos obrigatórios.'); return; }
    this.saving.set(true);
    this.formError.set(null);
    try {
      const value = this.form.getRawValue();
      const input: CreditCardInput = { name: value.name, brand: value.brand, paymentAccountId: value.paymentAccountId, creditLimitCents: parseMoneyToCents(value.creditLimit), closingDay: value.closingDay, dueDay: value.dueDay, color: value.color, icon: value.icon };
      if (this.editingId()) await this.cardService.updateCard(this.editingId()!, input); else await this.cardService.createCard(input);
      this.notifications.success(this.editingId() ? 'Cartão atualizado.' : 'Cartão criado.');
      this.startNew();
    } catch (error) { this.formError.set(error instanceof Error ? error.message : 'Não foi possível salvar o cartão.'); }
    finally { this.saving.set(false); }
  }

  async archive(card: CreditCard): Promise<void> {
    const proceed = await this.confirm.ask({ title: 'Arquivar cartão?', message: `“${card.name}” deixará de aceitar novas compras, mas todas as faturas e parcelas serão preservadas.`, confirmLabel: 'Arquivar', destructive: true });
    if (!proceed) return;
    try { await this.cardService.archive(card.id); this.notifications.success('Cartão arquivado.'); } catch (error) { this.notifications.error(error instanceof Error ? error.message : 'Não foi possível arquivar o cartão.'); }
  }

  async reactivate(card: CreditCard): Promise<void> {
    try { await this.cardService.reactivate(card.id); this.notifications.success('Cartão reativado.'); } catch (error) { this.notifications.error(error instanceof Error ? error.message : 'Não foi possível reativar o cartão.'); }
  }

  private centsInput(cents: number): string { return (cents / 100).toFixed(2).replace('.', ','); }
}
