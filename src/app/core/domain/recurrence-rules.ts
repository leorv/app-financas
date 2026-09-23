import { isCivilDate } from './civil-date';
import { RecurrenceDatePolicy, RecurrenceFrequency, RecurrenceRule } from './models';

export interface RecurrenceOccurrence {
  readonly sequence: number;
  readonly date: string;
  readonly key: string;
}

const MAX_SEQUENCE_SEARCH = 10_000;

/**
 * A ocorrência usa a sequência, e não somente a data, como identificador.
 * Assim uma alteração de regra não transforma uma ocorrência existente em uma
 * duplicata acidental durante a próxima geração.
 */
export function recurrenceOccurrenceKey(ruleId: string, sequence: number): string {
  return `${ruleId}:${sequence}`;
}

export function occurrenceDateForSequence(rule: Pick<RecurrenceRule, 'frequency' | 'interval' | 'startDate' | 'datePolicy'>, sequence: number): string | null {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || !Number.isSafeInteger(rule.interval) || rule.interval < 1 || !isCivilDate(rule.startDate)) {
    return null;
  }
  const start = parseCivilDate(rule.startDate);
  switch (rule.frequency) {
    case 'weekly':
      return formatCivilDate(addDays(start, (sequence - 1) * rule.interval * 7));
    case 'custom':
      return formatCivilDate(addDays(start, (sequence - 1) * rule.interval));
    case 'monthly':
      return monthlyOccurrence(start, (sequence - 1) * rule.interval, rule.datePolicy);
    case 'yearly':
      return yearlyOccurrence(start, (sequence - 1) * rule.interval, rule.datePolicy);
    default:
      return null;
  }
}

export function generateRecurrenceOccurrences(
  rule: Pick<RecurrenceRule, 'id' | 'frequency' | 'interval' | 'startDate' | 'endDate' | 'maxOccurrences' | 'datePolicy'>,
  throughDate: string,
): readonly RecurrenceOccurrence[] {
  if (!isCivilDate(throughDate) || !isCivilDate(rule.startDate) || rule.startDate > throughDate) {
    return [];
  }
  const occurrences: RecurrenceOccurrence[] = [];
  let generatedCount = 0;
  for (let sequence = 1; sequence <= MAX_SEQUENCE_SEARCH; sequence += 1) {
    if (rule.maxOccurrences !== null && generatedCount >= rule.maxOccurrences) break;
    const date = occurrenceDateForSequence(rule, sequence);
    if (date === null) continue;
    if (rule.endDate !== null && date > rule.endDate) break;
    if (date > throughDate) break;
    const key = recurrenceOccurrenceKey(rule.id, sequence);
    occurrences.push({ sequence, date, key });
    generatedCount += 1;
  }
  return occurrences;
}

export function nextOccurrenceDate(
  rule: Pick<RecurrenceRule, 'frequency' | 'interval' | 'startDate' | 'endDate' | 'maxOccurrences' | 'datePolicy'>,
  afterSequence: number,
): string | null {
  let generatedCount = 0;
  for (let sequence = 1; sequence <= MAX_SEQUENCE_SEARCH; sequence += 1) {
    const date = occurrenceDateForSequence(rule, sequence);
    if (date === null) continue;
    if (rule.endDate !== null && date > rule.endDate) return null;
    generatedCount += 1;
    if (rule.maxOccurrences !== null && generatedCount > rule.maxOccurrences) return null;
    if (sequence > afterSequence) return date;
  }
  return null;
}

export function datePolicyLabel(policy: RecurrenceDatePolicy): string {
  return policy === 'clamp' ? 'Ajustar para o último dia do mês' : 'Pular mês sem essa data';
}

export function recurrenceFrequencyLabel(frequency: RecurrenceFrequency): string {
  return { weekly: 'Semanal', monthly: 'Mensal', yearly: 'Anual', custom: 'A cada intervalo de dias' }[frequency];
}

function monthlyOccurrence(start: Date, monthOffset: number, policy: RecurrenceDatePolicy): string | null {
  const monthIndex = start.getUTCMonth() + monthOffset;
  const year = start.getUTCFullYear() + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const lastDay = daysInMonth(year, month);
  if (start.getUTCDate() > lastDay && policy === 'skip') return null;
  return formatCivilDate(new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay))));
}

function yearlyOccurrence(start: Date, yearOffset: number, policy: RecurrenceDatePolicy): string | null {
  const year = start.getUTCFullYear() + yearOffset;
  const lastDay = daysInMonth(year, start.getUTCMonth());
  if (start.getUTCDate() > lastDay && policy === 'skip') return null;
  return formatCivilDate(new Date(Date.UTC(year, start.getUTCMonth(), Math.min(start.getUTCDate(), lastDay))));
}

function parseCivilDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatCivilDate(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}
