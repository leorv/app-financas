import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TransactionService } from '../../core/services/transaction.service';
import { AccountService } from '../../core/services/account.service';
import { CategoryService } from '../../core/services/category.service';
import { CreditCardService } from '../../core/services/credit-card.service';
import { formatCents } from '../../core/domain/money';
import { formatCivilDate } from '../../core/domain/civil-date';
import { PAYMENT_METHOD_LABELS, TRANSACTION_STATUS_LABELS } from '../../core/domain/models';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

@Component({
  selector: 'app-transaction-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (transaction; as current) {
      <app-page-header eyebrow="Detalhe do lançamento" [title]="current.description" [description]="current.type === 'income' ? 'Receita' : current.type === 'transfer' ? 'Transferência' : 'Despesa'">
        <a page-actions routerLink="/transactions" class="button-secondary">← Voltar para movimentações</a>
        @if (current.type !== 'transfer' && current.creditCardId === null && current.cardInvoiceId === null && current.installmentGroupId === null && current.recurrenceRuleId === null) { <a page-actions [routerLink]="['/transactions']" [queryParams]="{ edit: current.id }" class="button-primary">Editar lançamento</a> }
      </app-page-header>
      <div class="grid grid-3">
        <article class="card card-padding"><span class="label">Valor</span><div class="value-xl" [class.positive]="current.type === 'income'" [class.negative]="current.type === 'expense'">{{ current.type === 'income' ? '+' : current.type === 'expense' ? '−' : '' }}{{ money(current.amountCents) }}</div><p class="muted small">{{ statusLabel(current.status) }}</p></article>
        <article class="card card-padding"><span class="label">Competência</span><div class="value-xl" style="font-size:24px">{{ date(current.movementDate) }}</div><p class="muted small">{{ current.dueDate ? 'Vencimento: ' + date(current.dueDate) : 'Sem vencimento informado' }}</p></article>
        <article class="card card-padding"><span class="label">Pagamento</span><div class="value-xl" style="font-size:24px">{{ current.paymentDate ? date(current.paymentDate) : 'Ainda não pago' }}</div><p class="muted small">{{ paymentMethod(current.paymentMethod) }}</p></article>
      </div>
      <section class="card card-padding detail-card" style="margin-top:18px"><div class="detail-grid"><div><span class="label">Categoria</span><strong>{{ categoryLabel(current) }}</strong></div><div><span class="label">Conta</span><strong>{{ accountLabel(current) }}</strong></div><div><span class="label">Tags</span><span>{{ current.tags.length ? '#' + current.tags.join(' #') : 'Nenhuma' }}</span></div><div><span class="label">Criado em</span><span>{{ dateTime(current.createdAt) }}</span></div></div>@if (current.type === 'transfer') { <p class="notice">Os efeitos de origem e destino pertencem à mesma transferência e são alterados atomicamente.</p> } @if (current.recurrenceRuleId !== null) { <p class="notice">Esta ocorrência é gerenciada por uma regra de recorrência. Ocorrências pagas anteriores permanecem imutáveis.</p> } @if (current.creditCardId !== null || current.cardInvoiceId !== null) { <p class="notice">Esta parcela é gerenciada pelo cartão. O total da fatura é debitado da conta apenas no pagamento da fatura.</p> } @if (current.notes) { <div class="notes-block"><span class="label">Observações</span><p>{{ current.notes }}</p></div> }</section>
    } @else {
      <section class="card"><app-empty-state icon="?" title="Lançamento não encontrado" description="Ele pode ter sido excluído ou o endereço está incorreto."></app-empty-state><div style="display:flex;justify-content:center;padding:0 20px 28px"><a routerLink="/transactions" class="button-primary">Voltar para movimentações</a></div></section>
    }
  `,
})
export class TransactionDetailComponent {
  private readonly route = inject(ActivatedRoute);
  readonly transactionService = inject(TransactionService);
  readonly accountService = inject(AccountService);
  readonly categoryService = inject(CategoryService);
  readonly cardService = inject(CreditCardService);
  readonly transaction = this.transactionService.getById(this.route.snapshot.paramMap.get('id') ?? '');

  money(cents: number): string { return formatCents(cents); }
  date(value: string): string { return formatCivilDate(value); }
  dateTime(value: string): string { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  statusLabel(value: keyof typeof TRANSACTION_STATUS_LABELS): string { return TRANSACTION_STATUS_LABELS[value]; }
  paymentMethod(value: keyof typeof PAYMENT_METHOD_LABELS): string { return PAYMENT_METHOD_LABELS[value]; }
  categoryLabel(transaction: NonNullable<typeof this.transaction>): string { return transaction.type === 'transfer' ? 'Transferência entre contas' : this.categoryService.categories().find((category) => category.id === transaction.categoryId)?.name ?? 'Sem categoria'; }
  accountLabel(transaction: NonNullable<typeof this.transaction>): string { if (transaction.type === 'transfer') return `${this.accountService.accounts().find((account) => account.id === transaction.fromAccountId)?.name ?? 'Origem'} → ${this.accountService.accounts().find((account) => account.id === transaction.toAccountId)?.name ?? 'Destino'}`; return transaction.creditCardId ? `Cartão ${this.cardService.getById(transaction.creditCardId)?.name ?? 'não encontrado'}` : this.accountService.accounts().find((account) => account.id === transaction.accountId)?.name ?? 'Sem conta'; }
}
