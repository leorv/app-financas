import { describe, expect, it } from 'vitest';
import { transferAccountDelta, transferPreservesConsolidatedTotal, validateTransferDraft } from './transfer-rules';

const draft = (overrides: Partial<Parameters<typeof validateTransferDraft>[0]> = {}) => ({
  fromAccountId: 'from', toAccountId: 'to', amountCents: 1000, movementDate: '2026-09-20', paymentDate: '2026-09-20', status: 'paid' as const, description: 'Reserva', notes: '', ...overrides,
});

describe('regras de transferências', () => {
  it('exige contas diferentes, valor positivo e data civil', () => {
    expect(() => validateTransferDraft(draft({ fromAccountId: 'to' }))).toThrow('diferentes');
    expect(() => validateTransferDraft(draft({ amountCents: 0 }))).toThrow('maior que zero');
    expect(() => validateTransferDraft(draft({ movementDate: '31/09/2026' }))).toThrow('data');
  });

  it('produz efeitos opostos nas contas e soma consolidada zero', () => {
    const transfer = { type: 'transfer' as const, status: 'paid' as const, amountCents: 2500, fromAccountId: 'from', toAccountId: 'to' };
    expect(transferAccountDelta(transfer, 'from')).toBe(-2500);
    expect(transferAccountDelta(transfer, 'to')).toBe(2500);
    expect(transferAccountDelta(transfer, 'other')).toBe(0);
    expect(transferPreservesConsolidatedTotal(transfer)).toBe(true);
  });

  it('não aplica efeito enquanto prevista, pendente ou cancelada', () => {
    const transfer = { type: 'transfer' as const, status: 'pending' as const, amountCents: 2500, fromAccountId: 'from', toAccountId: 'to' };
    expect(transferAccountDelta(transfer, 'from')).toBe(0);
    expect(transferAccountDelta({ ...transfer, status: 'cancelled' }, 'to')).toBe(0);
  });
});
