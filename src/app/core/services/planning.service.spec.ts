import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { BudgetService } from './budget.service';
import { GoalService } from './goal.service';
import { CategoryService } from './category.service';
import { DatabaseSnapshot, EMPTY_SNAPSHOT } from '../domain/models';
import { PersistenceService } from '../persistence/persistence.service';

class MemoryPersistence {
  readonly snapshot = signal<DatabaseSnapshot>({ ...EMPTY_SNAPSHOT });
  readonly errorMessage = signal<string | null>(null);
  async update(mutator: (current: DatabaseSnapshot) => DatabaseSnapshot): Promise<boolean> { this.snapshot.set(mutator(this.snapshot())); return true; }
}

describe('serviços de planejamento', () => {
  it('cria limites, rejeita duplicata ativa e preserva lançamentos ao copiar mês', async () => {
    const persistence = new MemoryPersistence();
    const categories = new CategoryService(persistence as unknown as PersistenceService);
    const category = await categories.create({ name: 'Casa', type: 'expense', color: '#000', icon: '⌂', parentId: null });
    const budgetService = new BudgetService(persistence as unknown as PersistenceService);
    const source = await budgetService.create({ month: '2026-09', categoryId: category.id, amountCents: 250000 });
    const transaction = { id: 'tx', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', archived: false, description: 'Aluguel', amountCents: 100000, type: 'expense' as const, movementDate: '2026-09-10', dueDate: null, paymentDate: '2026-09-10', paymentMethod: 'pix' as const, status: 'paid' as const, categoryId: category.id, accountId: 'account', fromAccountId: null, toAccountId: null, creditCardId: null, tags: [], notes: '', recurrenceRuleId: null, recurrenceOccurrenceKey: null, transferId: null, installmentGroupId: null, cardInvoiceId: null };
    persistence.snapshot.set({ ...persistence.snapshot(), transactions: [transaction] });

    await expect(budgetService.create({ month: '2026-09', categoryId: category.id, amountCents: 300000 })).rejects.toThrow('Já existe');
    const copied = await budgetService.copyMonth('2026-09', '2026-10');
    expect(copied).toHaveLength(1);
    expect(copied[0]).toMatchObject({ month: '2026-10', categoryId: category.id, amountCents: 250000 });
    expect(budgetService.forMonth('2026-09')).toHaveLength(1);
    expect(budgetService.forMonth('2026-10')).toHaveLength(1);
    expect(persistence.snapshot().transactions).toEqual([transaction]);
    expect(source.month).toBe('2026-09');
  });

  it('arquiva um limite sem apagar a referência histórica nem permitir categoria de receita', async () => {
    const persistence = new MemoryPersistence();
    const categories = new CategoryService(persistence as unknown as PersistenceService);
    const expense = await categories.create({ name: 'Casa', type: 'expense', color: '#000', icon: '⌂', parentId: null });
    const income = await categories.create({ name: 'Salário', type: 'income', color: '#000', icon: '↗', parentId: null });
    const service = new BudgetService(persistence as unknown as PersistenceService);
    const budget = await service.create({ month: '2026-09', categoryId: expense.id, amountCents: 1000 });
    await expect(service.create({ month: '2026-09', categoryId: income.id, amountCents: 1000 })).rejects.toThrow('despesa');
    await service.archive(budget.id);
    expect(service.activeBudgets()).toHaveLength(0);
    expect(service.budgets()).toHaveLength(1);
  });

  it('atualiza a meta imediatamente com aporte e impede retirada acima do saldo', async () => {
    const persistence = new MemoryPersistence();
    const service = new GoalService(persistence as unknown as PersistenceService);
    const goal = await service.create({ title: 'Viagem', description: 'Férias', targetCents: 10000, initialCents: 1000, deadline: '2027-01-01', accountId: null, color: '#0d6b63', icon: '✈' });
    const beforeTransactions = persistence.snapshot().transactions;
    await service.contribute(goal.id, { type: 'contribution', amountCents: 2500, date: '2026-09-21', notes: 'Primeiro aporte' });
    expect(service.progress(goal.id)).toMatchObject({ balanceCents: 3500, contributedCents: 2500, remainingCents: 6500 });
    expect(persistence.snapshot().transactions).toEqual(beforeTransactions);
    await expect(service.contribute(goal.id, { type: 'withdrawal', amountCents: 3501, date: '2026-09-22', notes: '' })).rejects.toThrow('superar');
    await service.contribute(goal.id, { type: 'withdrawal', amountCents: 500, date: '2026-09-22', notes: 'Resgate parcial' });
    expect(service.progress(goal.id).balanceCents).toBe(3000);
    expect(service.contributionsFor(goal.id)).toHaveLength(2);
  });

  it('permite status de ciclo de vida e bloqueia movimentação após conclusão ou cancelamento', async () => {
    const persistence = new MemoryPersistence();
    const service = new GoalService(persistence as unknown as PersistenceService);
    const goal = await service.create({ title: 'Fundo', description: '', targetCents: 5000, initialCents: 0, deadline: null, accountId: null, color: '#0d6b63', icon: '◇' });
    await service.setStatus(goal.id, 'paused');
    expect(service.getById(goal.id)?.status).toBe('paused');
    await service.setStatus(goal.id, 'completed');
    await expect(service.contribute(goal.id, { type: 'contribution', amountCents: 100, date: '2026-09-21', notes: '' })).rejects.toThrow('Reabra');
    await service.setStatus(goal.id, 'cancelled');
    expect(service.getById(goal.id)?.status).toBe('cancelled');
  });
});
