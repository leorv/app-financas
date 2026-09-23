import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { calculateInvoiceCompetence, planCardInstallments, PlannedCardInstallment } from '../../core/domain/card-rules';
import { formatCivilDate, todayCivilDate } from '../../core/domain/civil-date';
import { formatCents, parseMoneyToCents } from '../../core/domain/money';
import { CardPurchase, Category, CreditCardInvoice, CREDIT_CARD_INVOICE_STATUS_LABELS, CreditCardInvoiceStatus } from '../../core/domain/models';
import { CreditCardService, CardPurchaseInput } from '../../core/services/credit-card.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { CategoryService } from '../../core/services/category.service';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

@Component({
  selector: 'app-card-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (persistence.status() === 'loading') {
      <div class="loading-state"><span class="spinner" aria-hidden="true"></span>Carregando cartão…</div>
    } @else if (persistence.status() === 'error') {
      <section class="card card-padding error-state" role="alert"><h2>Não foi possível carregar o cartão</h2><p>{{ persistence.errorMessage() }}</p></section>
    } @else if (card(); as current) {
      <app-page-header eyebrow="Detalhe do cartão" [title]="current.name" [description]="current.brand || 'Controle de crédito e faturas'">
        <a page-actions routerLink="/cards" class="button-secondary">← Voltar para cartões</a>
      </app-page-header>
      <div class="grid grid-3">
        <article class="card card-padding"><span class="label">Limite disponível</span><div class="value-xl" [class.negative]="cardService.availableLimit(current) < 0">{{ money(cardService.availableLimit(current)) }}</div><p class="muted small">{{ money(cardService.limitUsed(current)) }} comprometido de {{ money(current.creditLimitCents) }}</p></article>
        <article class="card card-padding"><span class="label">Fechamento</span><div class="value-xl" style="font-size:24px">Dia {{ current.closingDay }}</div><p class="muted small">Vencimento no dia {{ current.dueDay }}, ajustado em meses curtos.</p></article>
        <article class="card card-padding"><span class="label">Conta de pagamento</span><div class="value-xl" style="font-size:24px">{{ paymentAccountName(current.paymentAccountId) }}</div><p class="muted small">{{ current.archived ? 'Cartão arquivado; histórico preservado.' : 'Compras novas permitidas.' }}</p></article>
      </div>

      <div class="grid card-detail-layout" style="margin-top:18px">
        <section class="card card-padding">
          <div class="section-heading" style="margin-top:0"><h2>{{ editingPurchaseId() ? 'Editar compra' : 'Nova compra' }}</h2><span class="row"><span class="muted small">O saldo da conta não muda agora</span>@if (editingPurchaseId()) { <button type="button" class="button-quiet" (click)="resetPurchase(current)">Cancelar</button> }</span></div>
          @if (current.archived) { <p class="notice warning">Este cartão está arquivado. Reative-o na lista para registrar novas compras.</p> }
          <form [formGroup]="purchaseForm" (ngSubmit)="savePurchase(current)" class="stack" novalidate>
            <div class="field"><label for="purchase-description">Descrição <span aria-hidden="true">*</span></label><input id="purchase-description" formControlName="description" autocomplete="off"></div>
            <div class="form-grid"><div class="field"><label for="purchase-amount">Valor total <span aria-hidden="true">*</span></label><input id="purchase-amount" formControlName="amount" inputmode="decimal" placeholder="0,00" (input)="refreshSimulation(current)"></div><div class="field"><label for="purchase-count">Parcelas</label><input id="purchase-count" type="number" min="1" max="48" formControlName="installmentCount" (input)="refreshSimulation(current)"></div></div>
            <div class="form-grid"><div class="field"><label for="purchase-date">Data da compra</label><input id="purchase-date" type="date" formControlName="purchaseDate" (change)="suggestCompetence(current)"></div><div class="field"><label for="purchase-competence">1ª competência</label><input id="purchase-competence" type="month" formControlName="firstCompetence" (input)="refreshSimulation(current)"><span class="help-text">A data após o fechamento sugere a fatura seguinte.</span></div></div>
            <div class="field"><label for="purchase-category">Categoria de despesa</label><select id="purchase-category" formControlName="categoryId"><option value="">Selecione uma categoria</option>@for (category of expenseCategories(); track category.id) { <option [value]="category.id">{{ category.name }}</option> }</select></div>
            @if (simulation().length) {
              <div class="card-subsection"><div class="section-heading"><h3>Simulação</h3><span class="muted small">Total: {{ money(simulationTotal()) }}</span></div><div class="installment-preview">@for (item of simulation(); track item.sequence) { <div><span>{{ item.sequence }}/{{ simulation().length }}</span><strong>{{ money(item.amountCents) }}</strong><small>{{ item.competence }}</small></div> }</div></div>
            }
            @if (purchaseError()) { <p class="field-error" role="alert">{{ purchaseError() }}</p> }
            <div class="form-actions"><button type="submit" class="button-primary" [disabled]="savingPurchase() || current.archived">{{ savingPurchase() ? 'Salvando…' : (editingPurchaseId() ? 'Salvar alterações' : 'Registrar compra') }}</button></div>
          </form>
        </section>

        <section class="card card-padding">
          <div class="section-heading" style="margin-top:0"><h2>Faturas</h2><span class="muted small">{{ invoicesFor(current.id).length }} registrada(s)</span></div>
          @if (invoicesFor(current.id).length === 0) {
            <app-empty-state icon="▤" title="Nenhuma fatura ainda" description="As faturas aparecerão quando você registrar uma compra."></app-empty-state>
          } @else {
            <div class="list compact-list">@for (invoice of invoicesFor(current.id); track invoice.id) { <article class="list-row invoice-row"><div class="list-row-main"><div class="list-row-title"><a [routerLink]="['/cards', current.id, 'invoices', invoice.id]">{{ invoice.competence }}</a><span class="status-chip" [class.active]="invoiceStatus(invoice) === 'paid'" [class.pending]="invoiceStatus(invoice) === 'open' || invoiceStatus(invoice) === 'closed'" [class.archived]="invoiceStatus(invoice) === 'cancelled'">{{ statusLabel(invoiceStatus(invoice)) }}</span></div><div class="list-row-meta">Vence {{ date(invoice.dueDate) }} · {{ cardService.invoiceTransactions(invoice).length }} parcela(s)</div></div><div class="invoice-total">{{ money(cardService.invoiceTotal(invoice)) }}</div><div class="row invoice-actions">@if (invoice.status === 'open') { <button type="button" class="button-quiet" (click)="closeInvoice(invoice)">Fechar</button> } @if (invoice.status !== 'paid' && invoice.status !== 'cancelled') { <button type="button" class="button-primary button-small" (click)="payInvoice(invoice)">Pagar</button> }</div></article> }</div>
          }
        </section>
      </div>

      <section class="card card-padding" style="margin-top:18px">
        <div class="section-heading" style="margin-top:0"><h2>Compras registradas</h2><span class="muted small">Parcelas vinculadas ao lançamento original</span></div>
        @if (purchasesFor(current.id).length === 0) { <app-empty-state icon="▱" title="Nenhuma compra registrada" description="Use o formulário acima para registrar a primeira compra deste cartão."></app-empty-state> } @else { <div class="list compact-list">@for (purchase of purchasesFor(current.id); track purchase.id) { <article class="list-row"><span class="entity-icon" aria-hidden="true">{{ purchase.status === 'active' ? '↗' : '×' }}</span><div class="list-row-main"><div class="list-row-title">{{ purchase.description }} <span class="status-chip" [class.active]="purchase.status === 'active'" [class.archived]="purchase.status === 'cancelled'">{{ purchase.status === 'active' ? 'Ativa' : 'Cancelada' }}</span></div><div class="list-row-meta">{{ date(purchase.purchaseDate) }} · {{ purchase.installmentCount }} parcela(s) · competência inicial {{ purchase.firstCompetence }}</div></div><strong>{{ money(purchase.totalAmountCents) }}</strong>@if (purchase.status === 'active') { <button type="button" class="button-quiet" (click)="editPurchase(purchase)">Editar</button><button type="button" class="button-quiet" (click)="cancelPurchase(purchase)">Cancelar</button> }</article> }</div> }
      </section>
    } @else {
      <section class="card"><app-empty-state icon="?" title="Cartão não encontrado" description="Ele pode ter sido removido ou o endereço está incorreto." actionLabel="Voltar para cartões"></app-empty-state><div style="display:flex;justify-content:center;padding:0 20px 28px"><a routerLink="/cards" class="button-primary">Voltar para cartões</a></div></section>
    }
  `,
})
export class CardDetailComponent {
  private readonly route = inject(ActivatedRoute);
  readonly cardService = inject(CreditCardService);
  readonly categoryService = inject(CategoryService);
  readonly persistence = inject(PersistenceService);
  private readonly notifications = inject(NotificationService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly formBuilder = inject(FormBuilder);
  readonly cardId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly card = computed(() => this.cardService.getById(this.cardId));
  readonly savingPurchase = signal(false);
  readonly editingPurchaseId = signal<string | null>(null);
  readonly purchaseError = signal<string | null>(null);
  readonly simulation = signal<readonly PlannedCardInstallment[]>([]);
  readonly purchaseForm = this.formBuilder.nonNullable.group({
    description: ['', [Validators.required, Validators.maxLength(140)]],
    amount: ['', Validators.required],
    purchaseDate: [todayCivilDate(), Validators.required],
    categoryId: ['', Validators.required],
    installmentCount: [1, [Validators.required, Validators.min(1), Validators.max(48)]],
    firstCompetence: [todayCivilDate().slice(0, 7), Validators.required],
  });

  expenseCategories(): Category[] { return this.categoryService.categories().filter((category) => category.type === 'expense' && !category.archived).sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'pt-BR')); }
  purchasesFor(cardId: string): readonly CardPurchase[] { return this.cardService.purchasesFor(cardId).slice().sort((left, right) => right.purchaseDate.localeCompare(left.purchaseDate)); }
  invoicesFor(cardId: string): readonly CreditCardInvoice[] { return this.cardService.invoicesFor(cardId); }
  paymentAccountName(id: string | null): string { return this.persistence.snapshot().accounts.find((account) => account.id === id)?.name ?? 'Não vinculada'; }
  money(cents: number): string { return formatCents(cents); }
  date(value: string): string { return formatCivilDate(value); }
  statusLabel(value: CreditCardInvoiceStatus): string { return CREDIT_CARD_INVOICE_STATUS_LABELS[value]; }
  invoiceStatus(invoice: CreditCardInvoice): CreditCardInvoiceStatus { return this.cardService.invoiceStatus(invoice); }
  simulationTotal(): number { return this.simulation().reduce((total, item) => total + item.amountCents, 0); }

  refreshSimulation(card: NonNullable<ReturnType<typeof this.card>>): void {
    try { this.simulation.set(planCardInstallments(parseMoneyToCents(this.purchaseForm.controls.amount.value), this.purchaseForm.controls.installmentCount.value, this.purchaseForm.controls.firstCompetence.value)); } catch { this.simulation.set([]); }
  }

  suggestCompetence(card: NonNullable<ReturnType<typeof this.card>>): void {
    try { this.purchaseForm.controls.firstCompetence.setValue(calculateInvoiceCompetence(this.purchaseForm.controls.purchaseDate.value, card.closingDay)); } catch { /* o formulário exibirá a validação de data */ }
    this.refreshSimulation(card);
  }

  async savePurchase(card: NonNullable<ReturnType<typeof this.card>>): Promise<void> {
    this.purchaseForm.markAllAsTouched();
    if (this.purchaseForm.invalid) { this.purchaseError.set('Preencha os campos obrigatórios.'); return; }
    this.savingPurchase.set(true);
    this.purchaseError.set(null);
    try {
      const value = this.purchaseForm.getRawValue();
      const input: CardPurchaseInput = { description: value.description, totalAmountCents: parseMoneyToCents(value.amount), purchaseDate: value.purchaseDate, categoryId: value.categoryId, creditCardId: card.id, installmentCount: value.installmentCount, firstCompetence: value.firstCompetence };
      if (this.editingPurchaseId()) {
        await this.cardService.updatePurchase(this.editingPurchaseId()!, input);
        this.notifications.success('Compra atualizada e parcelas recalculadas.');
      } else {
        await this.cardService.createPurchase(input);
        this.notifications.success('Compra registrada e parcelas geradas.');
      }
      this.resetPurchase(card);
    } catch (error) { this.purchaseError.set(error instanceof Error ? error.message : 'Não foi possível registrar a compra.'); }
    finally { this.savingPurchase.set(false); }
  }

  async closeInvoice(invoice: CreditCardInvoice): Promise<void> {
    try { await this.cardService.closeInvoice(invoice.id); this.notifications.success('Fatura fechada.'); } catch (error) { this.notifications.error(error instanceof Error ? error.message : 'Não foi possível fechar a fatura.'); }
  }

  async payInvoice(invoice: CreditCardInvoice): Promise<void> {
    const proceed = await this.confirm.ask({ title: 'Pagar fatura?', message: `A fatura de ${invoice.competence} será debitada uma única vez da conta vinculada.`, confirmLabel: 'Pagar fatura' });
    if (!proceed) return;
    try { await this.cardService.payInvoice(invoice.id); this.notifications.success('Fatura paga e débito lançado na conta.'); } catch (error) { this.notifications.error(error instanceof Error ? error.message : 'Não foi possível pagar a fatura.'); }
  }

  async cancelPurchase(purchase: CardPurchase): Promise<void> {
    const proceed = await this.confirm.ask({ title: 'Cancelar compra?', message: `“${purchase.description}” e suas parcelas serão canceladas; o limite será liberado.`, confirmLabel: 'Cancelar compra', destructive: true });
    if (!proceed) return;
    try { await this.cardService.cancelPurchase(purchase.id); this.notifications.success('Compra cancelada.'); } catch (error) { this.notifications.error(error instanceof Error ? error.message : 'Não foi possível cancelar a compra.'); }
  }

  editPurchase(purchase: CardPurchase): void {
    const card = this.card();
    if (!card || card.archived) return;
    this.editingPurchaseId.set(purchase.id);
    this.purchaseError.set(null);
    this.purchaseForm.reset({ description: purchase.description, amount: (purchase.totalAmountCents / 100).toFixed(2).replace('.', ','), purchaseDate: purchase.purchaseDate, categoryId: purchase.categoryId, installmentCount: purchase.installmentCount, firstCompetence: purchase.firstCompetence });
    this.refreshSimulation(card);
  }

  resetPurchase(card: NonNullable<ReturnType<typeof this.card>>): void {
    this.editingPurchaseId.set(null);
    const date = todayCivilDate();
    this.purchaseForm.reset({ description: '', amount: '', purchaseDate: date, categoryId: '', installmentCount: 1, firstCompetence: calculateInvoiceCompetence(date, card.closingDay) });
    this.simulation.set([]);
  }
}
