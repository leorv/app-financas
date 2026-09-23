import { describe, expect, it } from 'vitest';
import { generateRecurrenceOccurrences, occurrenceDateForSequence } from './recurrence-rules';
import { RecurrenceRule } from './models';

const rule = (overrides: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  id: 'rule-1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', archived: false,
  description: 'Aluguel', amountCents: 100000, type: 'expense', categoryId: 'category', accountId: 'account', paymentMethod: 'pix',
  startDate: '2026-01-31', endDate: null, maxOccurrences: null, datePolicy: 'clamp', creationStatus: 'planned', tags: [], notes: '',
  frequency: 'monthly', interval: 1, nextDate: '2026-01-31', status: 'active', ...overrides,
});

describe('regras de calendário das recorrências', () => {
  it('ajusta o dia 31 para o último dia de meses curtos e preserva a âncora', () => {
    const current = rule();
    expect([1, 2, 3, 4].map((sequence) => occurrenceDateForSequence(current, sequence))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('pula meses sem o dia escolhido quando essa política é configurada', () => {
    const current = rule({ datePolicy: 'skip' });
    expect(generateRecurrenceOccurrences(current, '2026-04-30').map((occurrence) => occurrence.date)).toEqual(['2026-01-31', '2026-03-31']);
    expect(generateRecurrenceOccurrences(current, '2026-04-30').map((occurrence) => occurrence.key)).toEqual(['rule-1:1', 'rule-1:3']);
  });

  it('suporta semana, ano e intervalo simples de dias', () => {
    expect(occurrenceDateForSequence(rule({ frequency: 'weekly', startDate: '2026-01-05' }), 3)).toBe('2026-01-19');
    expect(occurrenceDateForSequence(rule({ frequency: 'yearly', startDate: '2024-02-29', datePolicy: 'clamp' }), 2)).toBe('2025-02-28');
    expect(occurrenceDateForSequence(rule({ frequency: 'custom', interval: 10, startDate: '2026-01-01' }), 3)).toBe('2026-01-21');
  });

  it('respeita limite de ocorrências, data final e janela solicitada', () => {
    const current = rule({ startDate: '2026-01-01', endDate: '2026-12-31', maxOccurrences: 3 });
    const occurrences = generateRecurrenceOccurrences(current, '2027-01-01');
    expect(occurrences).toHaveLength(3);
    expect(occurrences.at(-1)?.date).toBe('2026-03-01');
  });
});
