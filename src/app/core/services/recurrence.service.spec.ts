import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { AccountService } from './account.service';
import { CategoryService } from './category.service';
import { RecurrenceInput, RecurrenceService } from './recurrence.service';
import { TransactionService } from './transaction.service';
import { DatabaseSnapshot, EMPTY_SNAPSHOT } from '../domain/models';
import { PersistenceService } from '../persistence/persistence.service';

class MemoryPersistence {
  readonly snapshot = signal<DatabaseSnapshot>({ ...EMPTY_SNAPSHOT });
  readonly errorMessage = signal<string | null>(null);
  async update(mutator: (current: DatabaseSnapshot) => DatabaseSnapshot): Promise<boolean> { this.snapshot.set(mutator(this.snapshot())); return true; }
}

const input = (accountId: string, categoryId: string, overrides: Partial<RecurrenceInput> = {}): RecurrenceInput => ({
  description: 'Aluguel', amountCents: 100000, type: 'expense', categoryId, accountId, paymentMethod: 'pix', creationStatus: 'planned', tags: ['fixa'], notes: '', frequency: 'monthly', interval: 1, startDate: '2026-01-31', endDate: null, maxOccurrences: null, datePolicy: 'clamp', ...overrides,
});

async function setup() {
  const persistence = new MemoryPersistence();
  const accounts = new AccountService(persistence as unknown as PersistenceService);
  const categories = new CategoryService(persistence as unknown as PersistenceService);
  const account = await accounts.create({ name: 'Conta', type: 'checking', institution: '', color: '#000', icon: '◉', initialBalanceCents: 0, isDefault: true });
  const category = await categories.create({ name: 'Casa', type: 'expense', color: '#000', icon: '⌂', parentId: null });
  const recurrence = new RecurrenceService(persistence as unknown as PersistenceService, accounts, categories);
  return { persistence, accounts, categories, account, category, recurrence };
}

describe('RecurrenceService', () => {
  it('materializa uma janela de forma idempotente', async () => {
    const { recurrence, account, category, persistence } = await setup();
    const rule = await recurrence.create(input(account.id, category.id));
    const first = await recurrence.generate(rule.id, '2026-04-30');
    const second = await recurrence.generate(rule.id, '2026-04-30');
    expect(first.map((item) => item.movementDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(second).toHaveLength(0);
    expect(persistence.snapshot().transactions).toHaveLength(4);
    expect(new Set(persistence.snapshot().transactions.map((item) => item.recurrenceOccurrenceKey)).size).toBe(4);
  });

  it('pula meses curtos conforme a política e encerra ao atingir o limite', async () => {
    const { recurrence, account, category } = await setup();
    const rule = await recurrence.create(input(account.id, category.id, { datePolicy: 'skip', maxOccurrences: 2 }));
    const created = await recurrence.generate(rule.id, '2026-12-31');
    expect(created.map((item) => item.movementDate)).toEqual(['2026-01-31', '2026-03-31']);
    expect(recurrence.getById(rule.id)?.status).toBe('ended');
    expect(await recurrence.generate(rule.id, '2027-12-31')).toHaveLength(0);
  });

  it('altera esta e as futuras sem modificar ocorrência paga anterior', async () => {
    const { recurrence, account, category, persistence, accounts, categories } = await setup();
    const transactionService = new TransactionService(persistence as unknown as PersistenceService, accounts, categories);
    const rule = await recurrence.create(input(account.id, category.id, { startDate: '2026-01-01' }));
    const occurrences = await recurrence.generate(rule.id, '2026-03-01');
    await transactionService.markAsPaid(occurrences[0].id, '2026-01-01');
    const changed = input(account.id, category.id, { startDate: '2026-01-01', description: 'Aluguel reajustado', amountCents: 110000 });
    await recurrence.updateFromOccurrence(rule.id, occurrences[1].id, changed, 'future');
    expect(persistence.snapshot().transactions.find((item) => item.id === occurrences[0].id)).toMatchObject({ description: 'Aluguel', amountCents: 100000, status: 'paid' });
    expect(persistence.snapshot().transactions.find((item) => item.id === occurrences[1].id)).toMatchObject({ description: 'Aluguel reajustado', amountCents: 110000 });
    const next = await recurrence.generate(rule.id, '2026-04-01');
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ description: 'Aluguel reajustado', amountCents: 110000, movementDate: '2026-04-01' });
  });

  it('encerra a regra sem remover ocorrências já materializadas', async () => {
    const { recurrence, account, category, persistence } = await setup();
    const rule = await recurrence.create(input(account.id, category.id, { startDate: '2026-01-01' }));
    await recurrence.generate(rule.id, '2026-02-01');
    await recurrence.end(rule.id);
    expect(persistence.snapshot().transactions).toHaveLength(2);
    expect(await recurrence.generate(rule.id, '2027-01-01')).toHaveLength(0);
    expect(persistence.snapshot().transactions).toHaveLength(2);
  });

  it('não transforma recorrência de cartão em despesa direta na conta', async () => {
    const { recurrence, account, category } = await setup();
    await expect(recurrence.create(input(account.id, category.id, { paymentMethod: 'credit-card' }))).rejects.toThrow('fluxo de cartões');
  });
});
