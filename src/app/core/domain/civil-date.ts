const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function todayCivilDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isCivilDate(value: string): boolean {
  if (!CIVIL_DATE_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function formatCivilDate(value: string, locale = 'pt-BR'): string {
  if (!isCivilDate(value)) {
    return 'Data inválida';
  }
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

export function utcNow(): string {
  return new Date().toISOString();
}
