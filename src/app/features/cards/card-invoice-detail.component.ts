import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { calculateInvoicePeriod, InvoicePeriod } from '../../core/domain/card-rules';
import { CreditCardService } from '../../core/services/credit-card.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { CREDIT_CARD_INVOICE_STATUS_LABELS, CreditCardInvoiceStatus, Transaction } from '../../core/domain/models';
import { formatCents } from '../../core/domain/money';
import { formatCivilDate } from '../../core/domain/civil-date';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

@Component({
  selector: 'app-card-invoice-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (persistence.status() === 'loading') {
      <div class="loading-state"><span class="spinner" aria-hidden="true"></span>Carregando fatura…</div>
    } @else if (persistence.status() === 'error') {
      <section class="card card-padding error-state" role="alert"><h2>Não foi possível carregar a fatura</h2><p>{{ persistence.errorMessage() }}</p></section>
    } @else if (invoice(); as current) {
      <app-page-header eyebrow="Detalhe da fatura" [title]="current.competence" [description]="card()?.name ?? 'Cartão'">
        <a page-actions [routerLink]="['/cards', current.creditCardId]" class="button-secondary">← Voltar para o cartão</a>
        @if (current.status !== 'paid' && current.status !== 'cancelled') { <button page-actions type="button" class="button-primary" (click)="pay(current)">Pagar fatura</button> }
      </app-page-header>
      <div class="grid grid-3">
        <article class="card card-padding"><span class="label">Total</span><div class="value-xl">{{ money(cardService.invoiceTotal(current)) }}</div><p class="muted small">{{ components(current).length }} parcela(s) ativa(s)</p></article>
        <article class="card card-padding"><span class="label">Situação</span><div class="value-xl" style="font-size:24px"><span class="status-chip" [class.active]="status(current) === 'paid'" [class.pending]="status(current) === 'open' || status(current) === 'closed'" [class.archived]="status(current) === 'cancelled'">{{ statusLabel(status(current)) }}</span></div><p class="muted small">Fechamento: {{ date(current.closingDate) }}</p></article>
        <article class="card card-padding"><span class="label">Vencimento</span><div class="value-xl" style="font-size:24px">{{ date(current.dueDate) }}</div><p class="muted small">Período: {{ date(invoicePeriod(current).from) }} a {{ date(invoicePeriod(current).to) }}</p></article>
      </div>
      <section class="card card-padding" style="margin-top:18px">
        <div class="section-heading" style="margin-top:0"><h2>Lançamentos da fatura</h2><span class="muted small">A parcela mantém vínculo com a compra original</span></div>
        @if (components(current).length === 0) { <app-empty-state icon="▤" title="Nenhum lançamento ativo" description="Esta fatura não possui parcelas ativas no momento."></app-empty-state> } @else { <div class="list">@for (transaction of components(current); track transaction.id) { <article class="list-row"><span class="entity-icon expense-icon" aria-hidden="true">↘</span><div class="list-row-main"><div class="list-row-title"><a [routerLink]="['/transactions', transaction.id]">{{ transaction.description }}</a><span class="status-chip pending">Parcela</span></div><div class="list-row-meta">Compra: {{ cardService.purchaseForTransaction(transaction)?.description ?? 'histórico não identificado' }} · competência {{ date(transaction.movementDate) }} · vencimento {{ date(transaction.dueDate ?? current.dueDate) }}</div></div><strong class="transaction-amount negative">−{{ money(transaction.amountCents) }}</strong></article> }</div> }
      </section>
    } @else {
      <section class="card"><app-empty-state icon="?" title="Fatura não encontrada" description="Ela pode ter sido cancelada ou o endereço está incorreto."></app-empty-state><div style="display:flex;justify-content:center;padding:0 20px 28px"><a routerLink="/cards" class="button-primary">Voltar para cartões</a></div></section>
    }
  `,
})
export class CardInvoiceDetailComponent {
  private readonly route = inject(ActivatedRoute);
  readonly cardService = inject(CreditCardService);
  readonly persistence = inject(PersistenceService);
  private readonly notifications = inject(NotificationService);
  private readonly confirm = inject(ConfirmDialogService);
  readonly invoiceId = this.route.snapshot.paramMap.get('invoiceId') ?? '';
  readonly invoice = computed(() => this.cardService.getInvoiceById(this.invoiceId));
  readonly card = computed(() => { const invoice = this.invoice(); return invoice ? this.cardService.getById(invoice.creditCardId) : undefined; });

  components(invoice: NonNullable<ReturnType<typeof this.invoice>>): readonly Transaction[] { return this.cardService.invoiceTransactions(invoice); }
  status(invoice: NonNullable<ReturnType<typeof this.invoice>>): CreditCardInvoiceStatus { return this.cardService.invoiceStatus(invoice); }
  statusLabel(status: CreditCardInvoiceStatus): string { return CREDIT_CARD_INVOICE_STATUS_LABELS[status]; }
  money(cents: number): string { return formatCents(cents); }
  date(value: string): string { return formatCivilDate(value); }
  invoicePeriod(invoice: NonNullable<ReturnType<typeof this.invoice>>): InvoicePeriod {
    const card = this.cardService.getById(invoice.creditCardId);
    return calculateInvoicePeriod(invoice.competence, card?.closingDay ?? 1);
  }

  async pay(invoice: NonNullable<ReturnType<typeof this.invoice>>): Promise<void> {
    const proceed = await this.confirm.ask({ title: 'Pagar fatura?', message: `A fatura será debitada uma única vez da conta vinculada ao cartão.`, confirmLabel: 'Pagar fatura' });
    if (!proceed) return;
    try { await this.cardService.payInvoice(invoice.id); this.notifications.success('Fatura paga e débito lançado na conta.'); } catch (error) { this.notifications.error(error instanceof Error ? error.message : 'Não foi possível pagar a fatura.'); }
  }
}
