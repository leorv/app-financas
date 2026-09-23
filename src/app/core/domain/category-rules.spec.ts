import { describe, expect, it } from 'vitest';
import { canCreateSubcategory, canDeleteCategory, validateCategoryName } from './category-rules';
import { Category } from './models';

const category = (overrides: Partial<Category> = {}): Category => ({
  id: 'cat-1', createdAt: '', updatedAt: '', archived: false, type: 'expense', name: 'Mercado', normalizedName: 'mercado', color: '#000', icon: '✦', parentId: null, sortOrder: 0, ...overrides,
});

describe('regras de categorias', () => {
  it('exige nome e impede duplicidade no mesmo tipo e nível', () => {
    const categories = [category()];
    expect(validateCategoryName(categories, '   ', 'expense', null)).toContain('Informe');
    expect(validateCategoryName(categories, ' mercado ', 'expense', null)).toContain('Já existe');
    expect(validateCategoryName(categories, 'Mercado', 'income', null)).toBeNull();
  });

  it('permite o mesmo nome em níveis diferentes e preserva a unicidade por pai', () => {
    const categories = [category(), category({ id: 'cat-2', name: 'Casa', normalizedName: 'casa' })];
    expect(validateCategoryName(categories, 'Mercado', 'expense', 'cat-2')).toBeNull();
    expect(validateCategoryName(categories, 'Mercado', 'expense', null, 'cat-1')).toBeNull();
  });

  it('faz subcategoria herdar a regra da categoria principal', () => {
    expect(canCreateSubcategory(category())).toBeNull();
    expect(canCreateSubcategory(category({ parentId: 'root' }))).toContain('não podem');
    expect(canCreateSubcategory(category({ archived: true }))).toContain('arquivada');
    expect(canCreateSubcategory(undefined)).toContain('válida');
  });

  it('só permite excluir conceitualmente uma categoria sem histórico', () => {
    expect(canDeleteCategory('cat-1', [])).toBe(true);
    expect(canDeleteCategory('cat-1', [{ categoryId: 'cat-1' }])).toBe(false);
  });
});
