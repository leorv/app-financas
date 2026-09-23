import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Category, CategoryType, CATEGORY_TYPE_LABELS } from '../../core/domain/models';
import { CategoryService } from '../../core/services/category.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { NotificationService } from '../../core/services/notification.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state.component';

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (persistence.status() === 'loading') {
      <div class="loading-state"><span class="spinner" aria-hidden="true"></span>Carregando categorias…</div>
    } @else if (persistence.status() === 'error') {
      <section class="card card-padding error-state" role="alert"><h2>Não foi possível carregar as categorias</h2><p>{{ persistence.errorMessage() }}</p></section>
    } @else {
      <app-page-header eyebrow="Organização" title="Categorias" description="Dê nomes claros ao que entra e sai da sua vida financeira.">
        <button page-actions type="button" class="button-primary" (click)="startNew('expense')">+ Nova categoria</button>
      </app-page-header>
      <div class="grid" style="grid-template-columns: minmax(0, 1.35fr) minmax(320px, .8fr); align-items: start">
        <section class="card card-padding">
          <div class="toolbar-filter">
            <input class="search-input" type="search" placeholder="Buscar categoria" aria-label="Buscar categoria" [value]="search()" (input)="setSearch($event)">
            <div class="segmented" role="tablist" aria-label="Tipo de categoria">
              <button type="button" [class.active]="viewType() === 'expense'" (click)="viewType.set('expense')">Despesas</button>
              <button type="button" [class.active]="viewType() === 'income'" (click)="viewType.set('income')">Receitas</button>
            </div>
          </div>
          <div class="row" style="justify-content: space-between; margin-bottom: 12px"><span class="muted small">{{ visibleCategories().length }} categoria(s)</span><label class="checkbox-field small"><input type="checkbox" [checked]="showArchived()" (change)="toggleArchived($event)"> Mostrar arquivadas</label></div>
          @if (visibleCategories().length === 0) {
            <app-empty-state icon="✦" [title]="showArchived() ? 'Nenhuma categoria encontrada' : 'Nenhuma categoria ativa'" description="Crie uma categoria para começar a organizar seus lançamentos." actionLabel="Criar categoria" (action)="startNew(viewType())"></app-empty-state>
          } @else {
            <div class="list">
              @for (category of visibleCategories(); track category.id) {
                <div class="list-row" [class.indent]="category.parentId !== null">
                  <span class="entity-icon" [style.background]="category.color + '22'" [style.color]="category.color" aria-hidden="true">{{ category.icon }}</span>
                  <div class="list-row-main"><div class="list-row-title">{{ category.name }} @if (category.parentId) { <span class="muted small">· subcategoria</span> }</div><div class="list-row-meta"><span class="status-chip" [class.active]="!category.archived" [class.archived]="category.archived">{{ category.archived ? 'Arquivada' : 'Ativa' }}</span></div></div>
                  <button type="button" class="button-icon" [attr.aria-label]="'Mover ' + category.name + ' para cima'" [disabled]="category.archived" (click)="reorder(category, 'up')">↑</button>
                  <button type="button" class="button-icon" [attr.aria-label]="'Mover ' + category.name + ' para baixo'" [disabled]="category.archived" (click)="reorder(category, 'down')">↓</button>
                  <button type="button" class="button-icon" [attr.aria-label]="'Editar ' + category.name" (click)="edit(category)">✎</button>
                  @if (category.archived) { <button type="button" class="button-quiet" (click)="reactivate(category)">Reativar</button> } @else { <button type="button" class="button-quiet" (click)="archive(category)">Arquivar</button> }
                </div>
              }
            </div>
          }
        </section>

        <section class="card card-padding">
          <div class="section-heading" style="margin-top:0"><h2>{{ editingId() ? 'Editar categoria' : 'Nova categoria' }}</h2>@if (editingId()) { <button type="button" class="button-quiet" (click)="startNew(viewType())">Cancelar</button> }</div>
          <p class="muted small">Categorias arquivadas continuam disponíveis no histórico, mas não poderão ser usadas em novos lançamentos.</p>
          <form [formGroup]="form" (ngSubmit)="save()" class="stack" novalidate>
            <div class="field"><label for="category-name">Nome <span aria-hidden="true">*</span></label><input id="category-name" formControlName="name" autocomplete="off"><span class="field-error" *ngIf="form.controls.name.touched && form.controls.name.hasError('required')">Informe um nome.</span></div>
            <div class="field"><label for="category-type">Tipo</label><select id="category-type" formControlName="type"><option value="expense">Despesa</option><option value="income">Receita</option></select></div>
            <div class="field"><label for="category-parent">Categoria principal</label><select id="category-parent" formControlName="parentId"><option [ngValue]="null">Nenhuma (categoria principal)</option>@for (parent of availableParents(); track parent.id) { <option [ngValue]="parent.id">{{ parent.name }}</option> }</select><span class="help-text">Uma subcategoria herda o tipo da categoria principal.</span></div>
            <div class="form-grid"><div class="field"><label for="category-color">Cor</label><input id="category-color" class="color-input" type="color" formControlName="color"></div><div class="field"><label for="category-icon">Ícone</label><input id="category-icon" formControlName="icon" maxlength="3" aria-describedby="category-icon-help"><span id="category-icon-help" class="help-text">Use um emoji ou símbolo curto.</span></div></div>
            @if (formError()) { <p class="field-error" role="alert">{{ formError() }}</p> }
            <div class="form-actions"><button type="submit" class="button-primary" [disabled]="saving()">{{ saving() ? 'Salvando…' : 'Salvar categoria' }}</button></div>
          </form>
        </section>
      </div>
    }
  `,
})
export class CategoriesComponent {
  readonly categoryService = inject(CategoryService);
  readonly persistence = inject(PersistenceService);
  private readonly notifications = inject(NotificationService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly formBuilder = inject(FormBuilder);
  readonly viewType = signal<CategoryType>('expense');
  readonly search = signal('');
  readonly showArchived = signal(true);
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly form = this.formBuilder.group({
    name: this.formBuilder.nonNullable.control('', [Validators.required, Validators.maxLength(60)]),
    type: this.formBuilder.nonNullable.control<CategoryType>('expense'),
    parentId: new FormControl<string | null>(null),
    color: this.formBuilder.nonNullable.control('#0d6b63'),
    icon: this.formBuilder.nonNullable.control('✦', [Validators.required, Validators.maxLength(3)]),
  });
  availableParents(): Category[] {
    return this.categoryService.activeCategories().filter((category) => category.parentId === null && category.type === this.form.controls.type.value && category.id !== this.editingId());
  }

  visibleCategories(): Category[] {
    const term = this.search().trim().toLocaleLowerCase('pt-BR');
    return this.categoryService.categories()
      .filter((category) => category.type === this.viewType() && (this.showArchived() || !category.archived))
      .filter((category) => !term || category.name.toLocaleLowerCase('pt-BR').includes(term))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR'));
  }

  setSearch(event: Event): void { this.search.set((event.target as HTMLInputElement).value); }
  toggleArchived(event: Event): void { this.showArchived.set((event.target as HTMLInputElement).checked); }

  startNew(type: CategoryType, parentId: string | null = null): void {
    this.editingId.set(null);
    this.formError.set(null);
    this.viewType.set(type);
    this.form.reset({ name: '', type, parentId, color: '#0d6b63', icon: '✦' });
  }

  edit(category: Category): void {
    this.editingId.set(category.id);
    this.formError.set(null);
    this.viewType.set(category.type);
    this.form.reset({ name: category.name, type: category.type, parentId: category.parentId, color: category.color, icon: category.icon });
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    this.formError.set(null);
    try {
      const value = this.form.getRawValue();
      const input = { name: value.name, type: value.type, color: value.color, icon: value.icon, parentId: value.parentId };
      if (this.editingId()) await this.categoryService.update(this.editingId()!, input);
      else await this.categoryService.create(input);
      this.notifications.success(this.editingId() ? 'Categoria atualizada.' : 'Categoria criada.');
      this.startNew(this.viewType());
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'Não foi possível salvar a categoria.');
    } finally {
      this.saving.set(false);
    }
  }

  async archive(category: Category): Promise<void> {
    const proceed = await this.confirm.ask({ title: 'Arquivar categoria?', message: `“${category.name}” não poderá ser usada em novos lançamentos, mas seu histórico será preservado.`, confirmLabel: 'Arquivar', destructive: true });
    if (!proceed) return;
    try { await this.categoryService.archive(category.id); this.notifications.success('Categoria arquivada.'); } catch (error) { this.notifications.error(error instanceof Error ? error.message : 'Não foi possível arquivar.'); }
  }

  async reactivate(category: Category): Promise<void> {
    try { await this.categoryService.reactivate(category.id); this.notifications.success('Categoria reativada.'); } catch (error) { this.notifications.error(error instanceof Error ? error.message : 'Não foi possível reativar.'); }
  }

  async reorder(category: Category, direction: 'up' | 'down'): Promise<void> {
    try { await this.categoryService.reorder(category.id, direction); } catch (error) { this.notifications.error(error instanceof Error ? error.message : 'Não foi possível reordenar.'); }
  }
}
