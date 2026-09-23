import { Injectable, computed } from '@angular/core';
import { Category, CategoryType } from '../domain/models';
import { createId, normalizeName } from '../domain/ids';
import { utcNow } from '../domain/civil-date';
import { canCreateSubcategory, validateCategoryName } from '../domain/category-rules';
import { PersistenceService } from '../persistence/persistence.service';

export interface CategoryInput {
  name: string;
  type: CategoryType;
  color: string;
  icon: string;
  parentId: string | null;
}

@Injectable({ providedIn: 'root' })
export class CategoryService {
  readonly categories = computed(() => this.persistence.snapshot().categories);
  readonly activeCategories = computed(() => this.categories().filter((category) => !category.archived));

  constructor(private readonly persistence: PersistenceService) {}

  async create(input: CategoryInput): Promise<Category> {
    const categories = this.categories();
    const parent = input.parentId ? categories.find((category) => category.id === input.parentId) : undefined;
    const parentError = input.parentId ? canCreateSubcategory(parent) : null;
    if (parentError) {
      throw new Error(parentError);
    }
    const type = parent?.type ?? input.type;
    const error = validateCategoryName(categories, input.name, type, input.parentId);
    if (error) {
      throw new Error(error);
    }
    const now = utcNow();
    const category: Category = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      archived: false,
      name: input.name.trim(),
      normalizedName: normalizeName(input.name),
      color: input.color,
      icon: input.icon,
      parentId: input.parentId,
      type,
      sortOrder: this.nextSortOrder(type, input.parentId),
    };
    await this.persist((current) => [...current, category]);
    return category;
  }

  async update(id: string, input: CategoryInput): Promise<Category> {
    const categories = this.categories();
    const current = categories.find((category) => category.id === id);
    if (!current) {
      throw new Error('Categoria não encontrada.');
    }
    const parent = input.parentId ? categories.find((category) => category.id === input.parentId) : undefined;
    const parentError = input.parentId ? canCreateSubcategory(parent) : null;
    if (parentError) {
      throw new Error(parentError);
    }
    const type = parent?.type ?? input.type;
    const error = validateCategoryName(categories, input.name, type, input.parentId, id);
    if (error) {
      throw new Error(error);
    }
    const updated: Category = {
      ...current,
      name: input.name.trim(),
      normalizedName: normalizeName(input.name),
      color: input.color,
      icon: input.icon,
      parentId: input.parentId,
      type,
      updatedAt: utcNow(),
    };
    await this.persist((current) => current.map((category) => category.id === id ? updated : category));
    return updated;
  }

  async archive(id: string): Promise<void> {
    await this.setArchived(id, true);
  }

  async reactivate(id: string): Promise<void> {
    const category = this.categories().find((item) => item.id === id);
    if (!category) {
      throw new Error('Categoria não encontrada.');
    }
    if (category.parentId) {
      const parent = this.categories().find((item) => item.id === category.parentId);
      if (parent?.archived) {
        throw new Error('Reative a categoria principal antes da subcategoria.');
      }
    }
    await this.setArchived(id, false);
  }

  async reorder(id: string, direction: 'up' | 'down'): Promise<void> {
    const categories = [...this.categories()];
    const current = categories.find((category) => category.id === id);
    if (!current) {
      throw new Error('Categoria não encontrada.');
    }
    const siblings = categories
      .filter((category) => category.type === current.type && category.parentId === current.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const index = siblings.findIndex((category) => category.id === id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= siblings.length) {
      return;
    }
    [siblings[index], siblings[targetIndex]] = [siblings[targetIndex], siblings[index]];
    const order = new Map(siblings.map((category, position) => [category.id, position]));
    await this.persist((current) => current.map((category) => order.has(category.id) ? { ...category, sortOrder: order.get(category.id) ?? category.sortOrder, updatedAt: utcNow() } : category));
  }

  private async setArchived(id: string, archived: boolean): Promise<void> {
    const category = this.categories().find((item) => item.id === id);
    if (!category) {
      throw new Error('Categoria não encontrada.');
    }
    await this.persist((current) => current.map((item) => item.id === id || (archived && item.parentId === id) ? { ...item, archived, updatedAt: utcNow() } : item));
  }

  private nextSortOrder(type: CategoryType, parentId: string | null): number {
    return this.categories().filter((category) => category.type === type && category.parentId === parentId).length;
  }

  private async persist(mutator: (current: readonly Category[]) => readonly Category[]): Promise<void> {
    const saved = await this.persistence.update((current) => ({ ...current, categories: mutator(current.categories) }));
    if (!saved) {
      throw new Error(this.persistence.errorMessage() ?? 'Não foi possível salvar a categoria.');
    }
  }
}
