import { describe, expect, it } from 'vitest';
import { formatCents, parseMoneyToCents } from './money';
import { formatCivilDate, isCivilDate } from './civil-date';

describe('regras monetárias e datas civis', () => {
  it('converte o formato brasileiro para centavos inteiros', () => {
    expect(parseMoneyToCents('R$ 10,10')).toBe(1010);
    expect(parseMoneyToCents('1.234,56')).toBe(123456);
    expect(parseMoneyToCents(-12.5)).toBe(-1250);
  });

  it('rejeita valores monetários inválidos', () => {
    expect(() => parseMoneyToCents('10,999')).toThrow();
    expect(() => parseMoneyToCents('dez')).toThrow();
  });

  it('formata centavos conforme pt-BR e não arredonda o domínio', () => {
    expect(formatCents(1010)).toBe('R$ 10,10');
  });

  it('valida datas civis sem depender do fuso horário', () => {
    expect(isCivilDate('2026-02-28')).toBe(true);
    expect(isCivilDate('2026-02-30')).toBe(false);
    expect(formatCivilDate('2026-09-20')).toContain('20');
  });
});
