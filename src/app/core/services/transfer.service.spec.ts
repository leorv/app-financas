import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { AccountService } from './account.service';
import { TransferInput, TransferService } from './transfer.service';
import { DatabaseSnapshot, EMPTY_SNAPSHOT } from '../domain/models';
import { calculateTransactionTotals } from '../domain/transaction-rules';
import { PersistenceService } from '../persistence/persistence.service';

class MemoryPersistence {
  readonly snapshot = signal<DatabaseSnapshot>({ ...EMPTY_SNAPSHOT });
  readonly errorMessage = signal<string | null>(null);
  async update(mutator: (current: DatabaseSnapshot) => DatabaseSnapshot): Promise<boolean> { this.snapshot.set(mutator(this.snapshot())); return true; }
}

class FailingPersistence extends MemoryPersistence {
  failWrites = false;
  override async update(mutator: (current: DatabaseSnapshot) => DatabaseSnapshot): Promise<boolean> { if (this.failWrites) { this.errorMessage.set('Falha atômica simulada.'); return false; } return super.update(mutator); }
}

const input = (fromAccountId: string, toAccountId: string, overrides: Partial<TransferInput> = {}): TransferInput => ({ fromAccountId, toAccountId, amountCents: 2500, movementDate: '2026-09-20', paymentDate: '2026-09-20', status: 'paid', description: 'Reserva', notes: '', ...overrides });

async function setup(persistence = new MemoryPersistence()) {
  const accounts = new AccountService(persistence as unknown as PersistenceService);
  const from = await accounts.create({ name: 'Conta origem', type: 'checking', institution: '', color: '#000', icon: '◉', initialBalanceCents: 10000, isDefault: true });
  const to = await accounts.create({ name: 'Conta destino', type: 'savings', institution: '', color: '#000', icon: '◌', initialBalanceCents: 5000, isDefault: false });
  return { persistence, accounts, from, to, service: new TransferService(persistence as unknown as PersistenceService, accounts) };
}

describe('TransferService', () => {
  it('cria uma transferência atômica, mantém o total consolidado e desfaz/reaplica os dois efeitos', async () => {
    const { service, accounts, from, to } = await setup();
    const transfer = await service.create(input(from.id, to.id));
    expect(transfer.type).toBe('transfer');
    expect(accounts.balance(from)).toBe(7500);
    expect(accounts.balance(to)).toBe(7500);
    expect(calculateTransactionTotals([transfer]).netRealizedCents).toBe(0);
    await service.cancel(transfer.id);
    expect(accounts.balance(from)).toBe(10000);
    expect(accounts.balance(to)).toBe(5000);
    await service.reopen(transfer.id, 'planned');
    expect(accounts.balance(from)).toBe(10000);
    await service.markAsPaid(transfer.id, '2026-09-21');
    expect(accounts.balance(from)).toBe(7500);
    expect(accounts.balance(to)).toBe(7500);
  });

  it('exige contas ativas e impede origem igual ao destino', async () => {
    const { service, accounts, from, to } = await setup();
    await expect(service.create(input(from.id, from.id))).rejects.toThrow('diferentes');
    await accounts.archive(to.id);
    await expect(service.create(input(from.id, to.id))).rejects.toThrow('destino');
  });

  it('não deixa uma falha de persistência gravar somente um lado', async () => {
    const persistence = new FailingPersistence();
    const { service, from, to } = await setup(persistence);
    persistence.failWrites = true;
    const before = persistence.snapshot();
    await expect(service.create(input(from.id, to.id))).rejects.toThrow('atômica');
    expect(persistence.snapshot()).toBe(before);
    expect(persistence.snapshot().transactions).toHaveLength(0);
  });
});
