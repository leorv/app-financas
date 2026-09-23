import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { CategoryService } from './category.service';
import { AccountService } from './account.service';
import { TransactionService } from './transaction.service';
import { DatabaseSnapshot, EMPTY_SNAPSHOT } from '../domain/models';
import { PersistenceService } from '../persistence/persistence.service';

class MemoryPersistence {
  readonly snapshot = signal<DatabaseSnapshot>({ ...EMPTY_SNAPSHOT });
  readonly errorMessage = signal<string | null>(null);
  async save(value: DatabaseSnapshot): Promise<boolean> { this.snapshot.set(value); return true; }
  async update(mutator: (current: DatabaseSnapshot) => DatabaseSnapshot): Promise<boolean> { this.snapshot.set(mutator(this.snapshot())); return true; }
}

describe('casos de uso de categorias e contas', () => {
  it('cria categoria, impede duplicata, herda tipo e arquiva histórico', async () => {
    const persistence = new MemoryPersistence();
    const service = new CategoryService(persistence as unknown as PersistenceService);
    const expense = await service.create({ name: 'Casa', type: 'expense', color: '#000', icon: '⌂', parentId: null });
    await expect(service.create({ name: ' casa ', type: 'expense', color: '#000', icon: '⌂', parentId: null })).rejects.toThrow('Já existe');
    const child = await service.create({ name: 'Aluguel', type: 'income', color: '#000', icon: '⌂', parentId: expense.id });
    expect(child.type).toBe('expense');
    await service.archive(expense.id);
    expect(service.categories().every((category) => category.archived)).toBe(true);
    await expect(service.reactivate(child.id)).rejects.toThrow('principal');
  });

  it('mantém ordem das categorias entre irmãs', async () => {
    const persistence = new MemoryPersistence();
    const service = new CategoryService(persistence as unknown as PersistenceService);
    const first = await service.create({ name: 'A', type: 'expense', color: '#000', icon: 'A', parentId: null });
    const second = await service.create({ name: 'B', type: 'expense', color: '#000', icon: 'B', parentId: null });
    await service.reorder(second.id, 'up');
    expect([...service.categories()].sort((a, b) => a.sortOrder - b.sortOrder).map((item) => item.id)).toEqual([second.id, first.id]);
  });

  it('define conta padrão, aceita saldo inicial negativo e preserva uma única padrão', async () => {
    const persistence = new MemoryPersistence();
    const service = new AccountService(persistence as unknown as PersistenceService);
    const first = await service.create({ name: 'Principal', type: 'checking', institution: '', color: '#000', icon: '◉', initialBalanceCents: -500, isDefault: false });
    expect(first.isDefault).toBe(true);
    const second = await service.create({ name: 'Reserva', type: 'savings', institution: '', color: '#000', icon: '◌', initialBalanceCents: 1000, isDefault: true });
    expect(service.defaultAccountId()).toBe(second.id);
    expect(service.accounts().filter((account) => account.isDefault && !account.archived)).toHaveLength(1);
    await service.archive(second.id);
    expect(service.defaultAccountId()).toBe(first.id);
  });

  it('impede contas ativas duplicadas, mas permite reutilizar nome arquivado', async () => {
    const persistence = new MemoryPersistence();
    const service = new AccountService(persistence as unknown as PersistenceService);
    const account = await service.create({ name: 'Carteira', type: 'cash', institution: '', color: '#000', icon: '◉', initialBalanceCents: 0, isDefault: false });
    await expect(service.create({ name: ' carteira ', type: 'cash', institution: '', color: '#000', icon: '◉', initialBalanceCents: 0, isDefault: false })).rejects.toThrow('Já existe');
    await service.archive(account.id);
    await expect(service.create({ name: 'Carteira', type: 'cash', institution: '', color: '#000', icon: '◉', initialBalanceCents: 0, isDefault: false })).resolves.toBeDefined();
  });

  it('valida tipo e valor, recalcula saldo e trata os estados do lançamento', async () => {
    const persistence = new MemoryPersistence();
    const categoryService = new CategoryService(persistence as unknown as PersistenceService);
    const accountService = new AccountService(persistence as unknown as PersistenceService);
    const transactionService = new TransactionService(persistence as unknown as PersistenceService, accountService, categoryService);
    const expenseCategory = await categoryService.create({ name: 'Casa', type: 'expense', color: '#000', icon: '⌂', parentId: null });
    const incomeCategory = await categoryService.create({ name: 'Salário', type: 'income', color: '#000', icon: '↗', parentId: null });
    const account = await accountService.create({ name: 'Conta', type: 'checking', institution: '', color: '#000', icon: '◉', initialBalanceCents: 10000, isDefault: true });
    const input = { description: 'Aluguel', amountCents: 2500, type: 'expense' as const, movementDate: '2026-09-20', dueDate: null, paymentDate: '2026-09-20', paymentMethod: 'pix' as const, status: 'paid' as const, categoryId: expenseCategory.id, accountId: account.id, tags: 'casa, casa, fixa', notes: '' };
    const paid = await transactionService.create(input);
    expect(paid.amountCents).toBe(2500);
    expect(paid.tags).toEqual(['casa', 'fixa']);
    expect(accountService.balance(account)).toBe(7500);
    await transactionService.update(paid.id, { ...input, amountCents: 3000 });
    expect(accountService.balance(account)).toBe(7000);
    await expect(transactionService.create({ ...input, amountCents: 0 })).rejects.toThrow('maior que zero');
    await expect(transactionService.create({ ...input, categoryId: incomeCategory.id })).rejects.toThrow('compatível');
    const pending = await transactionService.create({ ...input, description: 'Bônus', type: 'income', categoryId: incomeCategory.id, amountCents: 3000, status: 'pending', paymentDate: null });
    expect(accountService.balance(account)).toBe(7000);
    await transactionService.markAsPaid(pending.id, '2026-09-21');
    expect(accountService.balance(account)).toBe(10000);
    await transactionService.setStatus(paid.id, 'cancelled');
    expect(accountService.balance(account)).toBe(13000);
    const duplicate = await transactionService.duplicate(paid.id);
    expect(duplicate.status).toBe('planned');
    expect(duplicate.description).toContain('cópia');
  });

  it('edita e só exclui lançamento simples', async () => {
    const persistence = new MemoryPersistence();
    const categoryService = new CategoryService(persistence as unknown as PersistenceService);
    const accountService = new AccountService(persistence as unknown as PersistenceService);
    const transactionService = new TransactionService(persistence as unknown as PersistenceService, accountService, categoryService);
    const category = await categoryService.create({ name: 'Lazer', type: 'expense', color: '#000', icon: '✦', parentId: null });
    const account = await accountService.create({ name: 'Carteira', type: 'cash', institution: '', color: '#000', icon: '◉', initialBalanceCents: 0, isDefault: true });
    const created = await transactionService.create({ description: 'Cinema', amountCents: 1500, type: 'expense', movementDate: '2026-09-20', dueDate: null, paymentDate: null, paymentMethod: 'cash', status: 'planned', categoryId: category.id, accountId: account.id, tags: [], notes: '' });
    const edited = await transactionService.update(created.id, { description: 'Cinema e pipoca', amountCents: 2000, type: 'expense', movementDate: '2026-09-20', dueDate: null, paymentDate: null, paymentMethod: 'cash', status: 'planned', categoryId: category.id, accountId: account.id, tags: [], notes: 'sexta' });
    expect(edited.amountCents).toBe(2000);
    expect(edited.notes).toBe('sexta');
    await transactionService.delete(created.id);
    expect(transactionService.transactions()).toHaveLength(0);
    const linked = await transactionService.create({ description: 'Mensalidade', amountCents: 1000, type: 'expense', movementDate: '2026-09-20', dueDate: null, paymentDate: null, paymentMethod: 'pix', status: 'planned', categoryId: category.id, accountId: account.id, tags: [], notes: '' });
    persistence.snapshot.set({ ...persistence.snapshot(), transactions: [{ ...linked, recurrenceRuleId: 'rec-1' }] });
    await expect(transactionService.delete(linked.id)).rejects.toThrow('vínculo especial');
  });
});
