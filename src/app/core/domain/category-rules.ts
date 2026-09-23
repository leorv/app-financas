import { Category, CategoryType } from './models';
import { normalizeName } from './ids';

export function validateCategoryName(
  categories: readonly Category[],
  name: string,
  type: CategoryType,
  parentId: string | null,
  ignoredId?: string,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Informe o nome da categoria.';
  }
  const normalizedName = normalizeName(trimmed);
  const duplicated = categories.some(
    (category) =>
      category.id !== ignoredId &&
      category.type === type &&
      category.parentId === parentId &&
      category.normalizedName === normalizedName,
  );
  return duplicated ? 'Já existe uma categoria com esse nome neste nível.' : null;
}

export function canDeleteCategory(categoryId: string, transactions: readonly { categoryId: string | null }[]): boolean {
  return !transactions.some((transaction) => transaction.categoryId === categoryId);
}

export function canCreateSubcategory(parent: Category | undefined): string | null {
  if (!parent) {
    return 'Selecione uma categoria principal válida.';
  }
  if (parent.parentId !== null) {
    return 'Subcategorias não podem ter novas subcategorias.';
  }
  if (parent.archived) {
    return 'Uma categoria arquivada não pode receber subcategorias.';
  }
  return null;
}
