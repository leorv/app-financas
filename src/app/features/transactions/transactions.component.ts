import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CategoryService } from '../../core/services/category.service';
import { AccountService } from '../../core/services/account.service';
import { TransactionInput, TransactionService } from '../../core/services/transaction.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { NotificationService } from '../../core/services/notification.service';
import { ImportExportService } from '../../core/services/import-export.service';
import { CreditCardService } from '../../core/services/credit-card.service';
import { formatCents, parseMoneyToCents } from '../../core/domain/money';
import { formatCivilDate, todayCivilDate } from '../../core/domain/civil-date';
import { Account, Category, PAYMENT_METHOD_LABELS, PaymentMethod, Transaction, TransactionStatus, TransactionType, TRANSACTION_STATUS_LABELS } from '../../core/domain/models';
import { TransactionFilter, TransactionSortField } from '../../core/domain/transaction-rules';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

type SimpleTransactionType = Exclude<TransactionType, 'transfer'>;

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (persistence.status() === 'loading') {
      <div class="loading-state"><span class="spinner" aria-hidden="true"></span>Carregando movimentações…</div>
    } @else if (persistence.status() === 'error') {
      <section class="card card-padding error-state" role="alert"><h2>Não foi possível carregar as movimentações</h2><p>{{ persistence.errorMessage() }}</p><button type="button" class="button-secondary" (click)="reload()">Tentar novamente</button></section>
    } @else {
      <app-page-header eyebrow="Fluxo do seu dinheiro" title="Movimentações" description="Registre receitas e despesas, acompanhe o que foi pago e encontre qualquer lançamento pelos filtros.">
        <button page-actions type="button" class="button-secondary" (click)="exportCsv()">Exportar CSV</button>
        <button page-actions type="button" class="button-primary" (click)="startNew()">+ Novo lançamento</button>
      </app-page-header>

      @if (showForm()) {
        <section class="card card-padding transaction-form-card" aria-labelledby="transaction-form-title">
          <div class="section-heading" style="margin-top:0"><div><h2 id="transaction-form-title">{{ editingId() ? 'Editar lançamento' : 'Novo lançamento' }}</h2><p class="muted small">Os valores são positivos; receita ou despesa define o efeito nos totais.</p></div><button type="button" class="button-quiet" (click)="closeForm()">Fechar</button></div>
          <form [formGroup]="form" (ngSubmit)="save()" class="stack" novalidate>
            <div class="segmented transaction-type" role="radiogroup" aria-label="Tipo do lançamento"><button type="button" [class.active]="formType() === 'expense'" [attr.aria-checked]="formType() === 'expense'" role="radio" (click)="setFormType('expense')">Despesa</button><button type="button" [class.active]="formType() === 'income'" [attr.aria-checked]="formType() === 'income'" role="radio" (click)="setFormType('income')">Receita</button></div>
            <div class="form-grid">
              <div class="field full"><label for="transaction-description">Descrição <span aria-hidden="true">*</span></label><input id="transaction-description" formControlName="description" autocomplete="off" placeholder="Ex.: Supermercado"><span class="field-error" *ngIf="form.controls.description.touched && form.controls.description.hasError('required')">Informe uma descrição.</span></div>
              <div class="field"><label for="transaction-amount">Valor <span aria-hidden="true">*</span></label><input id="transaction-amount" formControlName="amount" inputmode="decimal" placeholder="0,00"><span class="help-text">Obrigatório e maior que zero.</span></div>
              <div class="field"><label for="transaction-status">Situação</label><select id="transaction-status" formControlName="status" (change)="syncPaymentDate()">@for (item of statusOptions; track item.value) { <option [value]="item.value">{{ item.label }}</option> }</select></div>
              <div class="field"><label for="transaction-movement-date">Data de competência <span aria-hidden="true">*</span></label><input id="transaction-movement-date" type="date" formControlName="movementDate"></div>
              <div class="field"><label for="transaction-due-date">Vencimento <span class="muted">(opcional)</span></label><input id="transaction-due-date" type="date" formControlName="dueDate"></div>
              @if (form.controls.status.value === 'paid') { <div class="field"><label for="transaction-payment-date">Data de pagamento</label><input id="transaction-payment-date" type="date" formControlName="paymentDate"><span class="help-text">Se não informar, usamos a competência.</span></div> }
              <div class="field"><label for="transaction-category">Categoria <span aria-hidden="true">*</span></label><select id="transaction-category" formControlName="categoryId"><option value="">Selecione uma categoria</option>@for (category of formCategories(); track category.id) { <option [value]="category.id">{{ category.parentId ? '↳ ' : '' }}{{ category.name }}{{ category.archived ? ' (arquivada)' : '' }}</option> }</select><span class="help-text" *ngIf="formCategories().length === 0">Cadastre uma categoria de {{ formType() === 'expense' ? 'despesa' : 'receita' }} antes de salvar.</span></div>
              <div class="field"><label for="transaction-account">Conta <span aria-hidden="true">*</span></label><select id="transaction-account" formControlName="accountId"><option value="">Selecione uma conta</option>@for (account of formAccounts(); track account.id) { <option [value]="account.id">{{ account.name }}{{ account.archived ? ' (arquivada)' : '' }}{{ account.id === accountService.defaultAccountId() ? ' · padrão' : '' }}</option> }</select><span class="help-text">A conta padrão é selecionada automaticamente em um novo lançamento.</span></div>
              <div class="field"><label for="transaction-payment-method">Forma de pagamento</label><select id="transaction-payment-method" formControlName="paymentMethod">@for (item of paymentMethods; track item.value) { <option [value]="item.value">{{ item.label }}</option> }</select></div>
              <div class="field"><label for="transaction-tags">Tags <span class="muted">(opcional)</span></label><input id="transaction-tags" formControlName="tags" placeholder="casa, fixa, viagem"><span class="help-text">Separe por vírgulas. Até 20 tags únicas.</span></div>
              <div class="field full"><label for="transaction-notes">Observações <span class="muted">(opcional)</span></label><textarea id="transaction-notes" formControlName="notes" maxlength="1000"></textarea></div>
            </div>
            @if (formError()) { <p class="field-error" role="alert">{{ formError() }}</p> }
            <div class="form-actions"><button type="submit" class="button-primary" [disabled]="saving()">{{ saving() ? 'Salvando…' : 'Salvar lançamento' }}</button></div>
          </form>
        </section>
      }

      <section class="grid grid-4 transaction-totals" aria-label="Totais filtrados">
        <article class="card card-padding"><span class="label">Receitas pagas</span><div class="value-xl positive">{{ money(totals().realizedIncomeCents) }}</div></article>
        <article class="card card-padding"><span class="label">Despesas pagas</span><div class="value-xl negative">{{ money(totals().realizedExpenseCents) }}</div></article>
        <article class="card card-padding"><span class="label">Resultado realizado</span><div class="value-xl" [class.positive]="totals().netRealizedCents >= 0" [class.negative]="totals().netRealizedCents < 0">{{ signedMoney(totals().netRealizedCents) }}</div></article>
        <article class="card card-padding"><span class="label">Previsto / pendente</span><div class="value-xl" [class.positive]="totals().netForecastCents >= 0" [class.negative]="totals().netForecastCents < 0">{{ signedMoney(totals().netForecastCents) }}</div></article>
      </section>

      <section class="card card-padding transaction-list-card" aria-labelledby="transaction-list-title">
        <div class="section-heading" style="margin-top:0"><div><h2 id="transaction-list-title">Lançamentos</h2><p class="muted small">{{ page().total }} resultado(s) para os filtros atuais.</p></div><button type="button" class="button-secondary" (click)="clearFilters()" [disabled]="!hasActiveFilters()">Limpar filtros</button></div>
        <div class="transaction-filters">
          <div class="toolbar-filter">
            <input class="search-input" type="search" placeholder="Buscar descrição, observação ou tag" aria-label="Buscar movimentações" [value]="filterSearch()" (input)="setSearch($event)">
            <div class="row"><select class="compact-select" aria-label="Filtrar por tipo" [value]="filterType()" (change)="setTypeFilter($event)"><option value="all">Todos os tipos</option><option value="income">Receitas</option><option value="expense">Despesas</option></select><select class="compact-select" aria-label="Filtrar por situação" [value]="filterStatus()" (change)="setStatusFilter($event)"><option value="all">Todas as situações</option>@for (item of statusOptions; track item.value) { <option [value]="item.value">{{ item.label }}</option> }</select></div>
          </div>
          <div class="form-grid filter-grid"><div class="field"><label for="filter-movement-from">Competência a partir de</label><input id="filter-movement-from" type="date" [value]="filterMovementFrom()" (change)="setDateFilter('movementFrom', $event)"></div><div class="field"><label for="filter-movement-to">Competência até</label><input id="filter-movement-to" type="date" [value]="filterMovementTo()" (change)="setDateFilter('movementTo', $event)"></div><div class="field"><label for="filter-category">Categoria</label><select id="filter-category" [value]="filterCategoryId()" (change)="setCategoryFilter($event)"><option value="">{{ filterCategoryIds().length ? 'Categorias selecionadas' : 'Todas as categorias' }}</option>@for (category of filterCategories(); track category.id) { <option [value]="category.id">{{ category.name }}{{ category.archived ? ' (arquivada)' : '' }}</option> }</select></div><div class="field"><label for="filter-account">Conta</label><select id="filter-account" [value]="filterAccountId()" (change)="setAccountFilter($event)"><option value="">Todas as contas</option>@for (account of accountService.accounts(); track account.id) { <option [value]="account.id">{{ account.name }}{{ account.archived ? ' (arquivada)' : '' }}</option> }</select></div><div class="field"><label for="filter-payment-method">Forma de pagamento</label><select id="filter-payment-method" [value]="filterPaymentMethod()" (change)="setPaymentMethodFilter($event)"><option value="all">Todas as formas</option>@for (item of paymentMethods; track item.value) { <option [value]="item.value">{{ item.label }}</option> }</select></div><div class="field"><label for="filter-tag">Tag</label><input id="filter-tag" type="search" [value]="filterTag()" (input)="setTagFilter($event)" placeholder="Ex.: casa"></div></div>
          <details class="due-filter-details"><summary>Filtros e ordenação avançados</summary><div class="form-grid filter-grid" style="margin-top:16px"><div class="field"><label for="filter-due-from">Vencimento a partir de</label><input id="filter-due-from" type="date" [value]="filterDueFrom()" (change)="setDateFilter('dueFrom', $event)"></div><div class="field"><label for="filter-due-to">Vencimento até</label><input id="filter-due-to" type="date" [value]="filterDueTo()" (change)="setDateFilter('dueTo', $event)"></div><div class="field"><label for="sort-by">Ordenar por</label><select id="sort-by" [value]="sortBy()" (change)="setSortBy($event)"><option value="movementDate">Data de competência</option><option value="dueDate">Vencimento</option><option value="amount">Valor</option><option value="description">Descrição</option></select></div><div class="field"><label for="sort-direction">Direção</label><select id="sort-direction" [value]="sortDirection()" (change)="setSortDirection($event)"><option value="desc">Decrescente</option><option value="asc">Crescente</option></select></div></div></details>
          @if (hasActiveFilters()) { <div class="active-filter-bar" aria-label="Filtros ativos"><span class="label">Filtros ativos</span>@if (filterSearch()) { <button type="button" class="filter-chip" (click)="clearOne('search')">Texto: {{ filterSearch() }} ×</button> } @if (filterType() !== 'all') { <button type="button" class="filter-chip" (click)="clearOne('type')">{{ filterType() === 'income' ? 'Receitas' : 'Despesas' }} ×</button> } @if (filterStatus() !== 'all') { <button type="button" class="filter-chip" (click)="clearOne('status')">{{ statusLabel(filterStatus()) }} ×</button> } @if (filterOpenOnly()) { <button type="button" class="filter-chip" (click)="clearOne('openOnly')">Em aberto ×</button> } @if (filterCategoryId() || filterCategoryIds().length || filterUncategorized()) { <button type="button" class="filter-chip" (click)="clearOne('category')">Categorias selecionadas ×</button> } @if (filterAccountId()) { <button type="button" class="filter-chip" (click)="clearOne('account')">Conta ×</button> } @if (filterMovementFrom() || filterMovementTo()) { <button type="button" class="filter-chip" (click)="clearOne('movement')">Competência ×</button> } @if (filterDueFrom() || filterDueTo()) { <button type="button" class="filter-chip" (click)="clearOne('due')">Vencimento ×</button> } @if (filterPaymentMethod() !== 'all') { <button type="button" class="filter-chip" (click)="clearOne('paymentMethod')">Forma de pagamento ×</button> } @if (filterTag()) { <button type="button" class="filter-chip" (click)="clearOne('tag')">Tag: {{ filterTag() }} ×</button> }</div> }
        </div>

        @if (page().total === 0) {
          <app-empty-state icon="⌕" [title]="transactionService.activeTransactions().length === 0 ? 'Ainda não há lançamentos' : 'Nenhum lançamento encontrado'" [description]="transactionService.activeTransactions().length === 0 ? 'Registre sua primeira receita ou despesa para começar a acompanhar os totais.' : 'Ajuste ou limpe os filtros para encontrar outros lançamentos.'" [actionLabel]="transactionService.activeTransactions().length === 0 ? 'Criar primeiro lançamento' : 'Limpar filtros'" (action)="transactionService.activeTransactions().length === 0 ? startNew() : clearFilters()"></app-empty-state>
        } @else {
          <div class="list transaction-list">
            @for (transaction of page().items; track transaction.id) {
              <article class="list-row transaction-row" [class.transaction-planned]="transaction.status !== 'paid' && transaction.status !== 'cancelled'" [class.transaction-cancelled]="transaction.status === 'cancelled'">
                <span class="entity-icon" [class.income-icon]="transaction.type === 'income'" [class.expense-icon]="transaction.type === 'expense'" aria-hidden="true">{{ transaction.type === 'income' ? '↗' : transaction.type === 'expense' ? '↘' : '⇄' }}</span>
                <div class="list-row-main"><div class="list-row-title"><a [routerLink]="['/transactions', transaction.id]">{{ transaction.description }}</a><span class="status-chip" [class.paid]="transaction.status === 'paid'" [class.planned]="transaction.status === 'planned'" [class.pending]="transaction.status === 'pending'" [class.cancelled]="transaction.status === 'cancelled'">{{ statusLabel(transaction.status) }}</span></div><div class="list-row-meta">{{ formatDate(transaction.movementDate) }} · {{ categoryLabel(transaction) }} · {{ accountLabel(transaction) }} @if (transaction.tags.length) { · #{{ transaction.tags.join(' #') }} }</div></div>
                <div class="transaction-amount" [class.positive]="transaction.type === 'income'" [class.negative]="transaction.type === 'expense'">{{ transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '−' : '' }}{{ money(transaction.amountCents) }}</div>
                <div class="row transaction-actions"><a class="button-icon" [routerLink]="['/transactions', transaction.id]" [attr.aria-label]="'Ver detalhes de ' + transaction.description">⌕</a>@if (!isManaged(transaction)) { <button type="button" class="button-icon" [attr.aria-label]="'Editar ' + transaction.description" (click)="edit(transaction)">✎</button><button type="button" class="button-icon" [attr.aria-label]="'Duplicar ' + transaction.description" (click)="duplicate(transaction)">⧉</button>@if (transaction.status === 'planned' || transaction.status === 'pending') { <button type="button" class="button-quiet" (click)="markPaid(transaction)">Marcar paga</button> } } @else { <span class="muted small">{{ transaction.type === 'transfer' ? 'Gerenciado por transferências' : transaction.recurrenceRuleId !== null ? 'Gerenciado por recorrência' : 'Gerenciado pelo cartão' }}</span> }<button type="button" class="button-icon" [disabled]="!transactionService.canDelete(transaction)" [title]="transactionService.canDelete(transaction) ? 'Excluir lançamento' : 'Lançamento com vínculo especial'" [attr.aria-label]="'Excluir ' + transaction.description" (click)="remove(transaction)">⌫</button></div>
              </article>
            }
          </div>
          <div class="pagination" aria-label="Paginação"><span class="muted small">Página {{ page().page }} de {{ page().totalPages }}</span><div class="row"><button type="button" class="button-secondary" [disabled]="page().page <= 1" (click)="goToPage(page().page - 1)">Anterior</button><button type="button" class="button-secondary" [disabled]="page().page >= page().totalPages" (click)="goToPage(page().page + 1)">Próxima</button></div></div>
        }
      </section>
    }
  `,
})
export class TransactionsComponent implements OnInit {
  readonly persistence = inject(PersistenceService);
  readonly transactionService = inject(TransactionService);
  readonly cardService = inject(CreditCardService);
  readonly accountService = inject(AccountService);
  readonly categoryService = inject(CategoryService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly notifications = inject(NotificationService);
  private readonly importExport = inject(ImportExportService);
  private readonly confirm = inject(ConfirmDialogService);
  readonly PAGE_SIZE = 8;
  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly formType = signal<SimpleTransactionType>('expense');
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly currentPage = signal(1);
  readonly filterSearch = signal('');
  readonly filterMovementFrom = signal('');
  readonly filterMovementTo = signal('');
  readonly filterDueFrom = signal('');
  readonly filterDueTo = signal('');
  readonly filterType = signal<'all' | SimpleTransactionType>('all');
  readonly filterStatus = signal<'all' | TransactionStatus>('all');
  readonly filterCategoryId = signal('');
  readonly filterCategoryIds = signal<readonly string[]>([]);
  readonly filterUncategorized = signal(false);
  readonly filterAccountId = signal('');
  readonly filterOpenOnly = signal(false);
  readonly filterPaymentMethod = signal<'all' | PaymentMethod>('all');
  readonly filterTag = signal('');
  readonly sortBy = signal<TransactionSortField>('movementDate');
  readonly sortDirection = signal<'asc' | 'desc'>('desc');
  readonly form = this.formBuilder.nonNullable.group({
    description: ['', [Validators.required, Validators.maxLength(140)]],
    amount: ['', Validators.required],
    type: ['expense' as SimpleTransactionType],
    movementDate: [todayCivilDate(), Validators.required],
    dueDate: [''],
    paymentDate: [''],
    paymentMethod: ['pix' as PaymentMethod],
    status: ['planned' as TransactionStatus],
    categoryId: ['', Validators.required],
    accountId: ['', Validators.required],
    tags: [''],
    notes: ['', Validators.maxLength(1000)],
  });
  readonly paymentMethods: readonly { value: PaymentMethod; label: string }[] = Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value: value as PaymentMethod, label }));
  readonly statusOptions: readonly { value: TransactionStatus; label: string }[] = Object.entries(TRANSACTION_STATUS_LABELS).map(([value, label]) => ({ value: value as TransactionStatus, label }));
  readonly filter = computed<TransactionFilter>(() => ({ movementFrom: this.filterMovementFrom() || null, movementTo: this.filterMovementTo() || null, dueFrom: this.filterDueFrom() || null, dueTo: this.filterDueTo() || null, type: this.filterType(), status: this.filterStatus(), categoryId: this.filterCategoryId() || null, categoryIds: this.filterCategoryIds(), uncategorized: this.filterUncategorized(), accountId: this.filterAccountId() || null, openOnly: this.filterOpenOnly(), paymentMethod: this.filterPaymentMethod(), search: this.filterSearch(), tag: this.filterTag(), sortBy: this.sortBy(), sortDirection: this.sortDirection() }));
  readonly page = computed(() => this.transactionService.page(this.filter(), this.currentPage(), this.PAGE_SIZE));
  readonly totals = computed(() => this.transactionService.totals(this.filter()));

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      this.filterSearch.set(params.get('search') ?? '');
      this.filterTag.set(params.get('tag') ?? '');
      this.filterMovementFrom.set(params.get('movementFrom') ?? '');
      this.filterMovementTo.set(params.get('movementTo') ?? '');
      this.filterDueFrom.set(params.get('dueFrom') ?? '');
      this.filterDueTo.set(params.get('dueTo') ?? '');
      this.filterCategoryId.set(params.get('categoryId') ?? '');
      this.filterCategoryIds.set((params.get('categoryIds') ?? '').split(',').filter(Boolean));
      this.filterUncategorized.set(params.get('uncategorized') === '1');
      this.filterAccountId.set(params.get('accountId') ?? '');
      this.filterOpenOnly.set(params.get('openOnly') === '1');
      const type = params.get('type');
      if (type === 'income' || type === 'expense') this.filterType.set(type);
      else this.filterType.set('all');
      const status = params.get('status');
      if (status === 'planned' || status === 'pending' || status === 'paid' || status === 'cancelled') this.filterStatus.set(status);
      else this.filterStatus.set('all');
      const paymentMethod = params.get('paymentMethod');
      if (paymentMethod && Object.prototype.hasOwnProperty.call(PAYMENT_METHOD_LABELS, paymentMethod)) this.filterPaymentMethod.set(paymentMethod as PaymentMethod);
      else this.filterPaymentMethod.set('all');
      if (params.get('new') === '1') this.startNew();
      const editId = params.get('edit');
      const transaction = editId ? this.transactionService.getById(editId) : undefined;
      if (transaction) this.edit(transaction);
      this.currentPage.set(1);
    });
  }

  formCategories(): Category[] {
    const currentCategoryId = this.form.controls.categoryId.value;
    return this.categoryService.categories().filter((category) => category.type === this.formType() && (!category.archived || category.id === currentCategoryId)).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR'));
  }

  formAccounts(): Account[] {
    const currentAccountId = this.form.controls.accountId.value;
    return this.accountService.accounts().filter((account) => !account.archived || account.id === currentAccountId);
  }

  filterCategories(): Category[] { return this.categoryService.categories().slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')); }
  money(cents: number): string { return formatCents(cents); }
  signedMoney(cents: number): string { return `${cents >= 0 ? '+' : '−'}${formatCents(Math.abs(cents))}`; }
  formatDate(value: string): string { return formatCivilDate(value); }
  statusLabel(value: TransactionStatus | 'all'): string { return value === 'all' ? 'Todas' : TRANSACTION_STATUS_LABELS[value]; }
  categoryLabel(transaction: Transaction): string { return this.transactionService.categoryFor(transaction)?.name ?? 'Sem categoria'; }
  accountLabel(transaction: Transaction): string { if (transaction.type === 'transfer') return `${this.accountService.accounts().find((account) => account.id === transaction.fromAccountId)?.name ?? 'Origem'} → ${this.accountService.accounts().find((account) => account.id === transaction.toAccountId)?.name ?? 'Destino'}`; return transaction.creditCardId ? `Cartão ${this.cardService.getById(transaction.creditCardId)?.name ?? 'não encontrado'}` : this.transactionService.accountFor(transaction)?.name ?? 'Sem conta'; }
  isManaged(transaction: Transaction): boolean { return transaction.type === 'transfer' || transaction.creditCardId !== null || transaction.cardInvoiceId !== null || transaction.installmentGroupId !== null || transaction.recurrenceRuleId !== null; }
  hasActiveFilters(): boolean { return Boolean(this.filterSearch() || this.filterMovementFrom() || this.filterMovementTo() || this.filterDueFrom() || this.filterDueTo() || this.filterType() !== 'all' || this.filterStatus() !== 'all' || this.filterCategoryId() || this.filterCategoryIds().length || this.filterUncategorized() || this.filterAccountId() || this.filterOpenOnly() || this.filterPaymentMethod() !== 'all' || this.filterTag()); }

  startNew(): void {
    this.editingId.set(null); this.showForm.set(true); this.formError.set(null); this.formType.set('expense');
    this.form.reset({ description: '', amount: '', type: 'expense', movementDate: todayCivilDate(), dueDate: '', paymentDate: '', paymentMethod: 'pix', status: 'planned', categoryId: '', accountId: this.accountService.defaultAccountId() ?? '', tags: '', notes: '' });
  }

  edit(transaction: Transaction): void {
    if (transaction.type === 'transfer') { this.notifications.warning('Edite transferências na tela de Transferências.'); return; }
    this.editingId.set(transaction.id); this.showForm.set(true); this.formError.set(null); this.formType.set(transaction.type);
    this.form.reset({ description: transaction.description, amount: this.amountInput(transaction.amountCents), type: transaction.type, movementDate: transaction.movementDate, dueDate: transaction.dueDate ?? '', paymentDate: transaction.paymentDate ?? '', paymentMethod: transaction.paymentMethod, status: transaction.status, categoryId: transaction.categoryId ?? '', accountId: transaction.accountId ?? '', tags: transaction.tags.join(', '), notes: transaction.notes });
  }

  closeForm(): void { this.showForm.set(false); this.editingId.set(null); this.formError.set(null); }
  setFormType(type: SimpleTransactionType): void { this.formType.set(type); this.form.controls.type.setValue(type); if (this.form.controls.categoryId.value && !this.formCategories().some((category) => category.id === this.form.controls.categoryId.value)) this.form.controls.categoryId.setValue(''); }
  syncPaymentDate(): void { if (this.form.controls.status.value === 'paid' && !this.form.controls.paymentDate.value) this.form.controls.paymentDate.setValue(this.form.controls.movementDate.value || todayCivilDate()); if (this.form.controls.status.value !== 'paid') this.form.controls.paymentDate.setValue(''); }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) { this.formError.set('Preencha os campos obrigatórios.'); return; }
    this.saving.set(true); this.formError.set(null);
    try {
      const value = this.form.getRawValue();
      const input: TransactionInput = { description: value.description, amountCents: parseMoneyToCents(value.amount), type: value.type, movementDate: value.movementDate, dueDate: value.dueDate || null, paymentDate: value.paymentDate || null, paymentMethod: value.paymentMethod, status: value.status, categoryId: value.categoryId, accountId: value.accountId, tags: value.tags, notes: value.notes };
      if (this.editingId()) await this.transactionService.update(this.editingId()!, input); else await this.transactionService.create(input);
      this.notifications.success(this.editingId() ? 'Lançamento atualizado.' : 'Lançamento salvo.');
      this.closeForm(); this.currentPage.set(1);
    } catch (error) { this.formError.set(error instanceof Error ? error.message : 'Não foi possível salvar o lançamento.'); }
    finally { this.saving.set(false); }
  }

  async duplicate(transaction: Transaction): Promise<void> { try { await this.transactionService.duplicate(transaction.id); this.notifications.success('Lançamento duplicado como previsto.'); this.currentPage.set(1); } catch (error) { this.notifications.error(error instanceof Error ? error.message : 'Não foi possível duplicar.'); } }

  async markPaid(transaction: Transaction): Promise<void> {
    const account = this.accountLabel(transaction); const date = todayCivilDate();
    const proceed = await this.confirm.ask({ title: 'Marcar como paga?', message: `A movimentação será efetivada na conta “${account}” com a data de hoje (${formatCivilDate(date)}). Isso alterará o saldo realizado.`, confirmLabel: 'Marcar como paga' });
    if (!proceed) return;
    try { await this.transactionService.markAsPaid(transaction.id, date); this.notifications.success('Movimentação marcada como paga.'); } catch (error) { this.notifications.error(error instanceof Error ? error.message : 'Não foi possível marcar como paga.'); }
  }

  async remove(transaction: Transaction): Promise<void> {
    const proceed = await this.confirm.ask({ title: 'Excluir lançamento?', message: `“${transaction.description}” será removido e o saldo/totais serão recalculados. Essa ação não pode ser desfeita.`, confirmLabel: 'Excluir lançamento', destructive: true });
    if (!proceed) return;
    try { await this.transactionService.delete(transaction.id); this.notifications.success('Lançamento excluído.'); } catch (error) { this.notifications.error(error instanceof Error ? error.message : 'Não foi possível excluir.'); }
  }

  exportCsv(): void {
    try {
      const file = this.importExport.createFilteredCsv(this.filter());
      this.importExport.download(file);
      this.notifications.success(`CSV baixado com ${file.rowCount} movimentação(ões) filtrada(s).`);
    } catch (error) {
      this.notifications.error(error instanceof Error ? error.message : 'Não foi possível exportar o CSV.');
    }
  }

  setSearch(event: Event): void { this.filterSearch.set((event.target as HTMLInputElement).value); this.currentPage.set(1); }
  setTagFilter(event: Event): void { this.filterTag.set((event.target as HTMLInputElement).value); this.currentPage.set(1); }
  setTypeFilter(event: Event): void { this.filterType.set((event.target as HTMLSelectElement).value as 'all' | SimpleTransactionType); this.currentPage.set(1); }
  setStatusFilter(event: Event): void { this.filterStatus.set((event.target as HTMLSelectElement).value as 'all' | TransactionStatus); this.currentPage.set(1); }
  setCategoryFilter(event: Event): void { this.filterCategoryId.set((event.target as HTMLSelectElement).value); this.currentPage.set(1); }
  setAccountFilter(event: Event): void { this.filterAccountId.set((event.target as HTMLSelectElement).value); this.currentPage.set(1); }
  setPaymentMethodFilter(event: Event): void { this.filterPaymentMethod.set((event.target as HTMLSelectElement).value as 'all' | PaymentMethod); this.currentPage.set(1); }
  setDateFilter(key: 'movementFrom' | 'movementTo' | 'dueFrom' | 'dueTo', event: Event): void { const value = (event.target as HTMLInputElement).value; if (key === 'movementFrom') this.filterMovementFrom.set(value); if (key === 'movementTo') this.filterMovementTo.set(value); if (key === 'dueFrom') this.filterDueFrom.set(value); if (key === 'dueTo') this.filterDueTo.set(value); this.currentPage.set(1); }
  setSortBy(event: Event): void { this.sortBy.set((event.target as HTMLSelectElement).value as TransactionSortField); this.currentPage.set(1); }
  setSortDirection(event: Event): void { this.sortDirection.set((event.target as HTMLSelectElement).value as 'asc' | 'desc'); this.currentPage.set(1); }
  goToPage(page: number): void { this.currentPage.set(page); }
  clearFilters(): void { this.filterSearch.set(''); this.filterMovementFrom.set(''); this.filterMovementTo.set(''); this.filterDueFrom.set(''); this.filterDueTo.set(''); this.filterType.set('all'); this.filterStatus.set('all'); this.filterCategoryId.set(''); this.filterCategoryIds.set([]); this.filterUncategorized.set(false); this.filterAccountId.set(''); this.filterOpenOnly.set(false); this.filterPaymentMethod.set('all'); this.filterTag.set(''); this.currentPage.set(1); }
  clearOne(key: 'search' | 'type' | 'status' | 'category' | 'account' | 'tag' | 'movement' | 'due' | 'paymentMethod' | 'openOnly'): void { if (key === 'search') this.filterSearch.set(''); if (key === 'type') this.filterType.set('all'); if (key === 'status') this.filterStatus.set('all'); if (key === 'category') { this.filterCategoryId.set(''); this.filterCategoryIds.set([]); this.filterUncategorized.set(false); } if (key === 'account') this.filterAccountId.set(''); if (key === 'tag') this.filterTag.set(''); if (key === 'movement') { this.filterMovementFrom.set(''); this.filterMovementTo.set(''); } if (key === 'due') { this.filterDueFrom.set(''); this.filterDueTo.set(''); } if (key === 'paymentMethod') this.filterPaymentMethod.set('all'); if (key === 'openOnly') this.filterOpenOnly.set(false); this.currentPage.set(1); }
  reload(): void { void this.persistence.initialize(); }

  private amountInput(cents: number): string { return (cents / 100).toFixed(2).replace('.', ','); }
}
