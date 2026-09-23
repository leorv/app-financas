export function parseMoneyToCents(value: string | number): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('O valor informado não é válido.');
    }
    return Math.round(value * 100);
  }

  const normalized = value
    .trim()
    .replace(/R\$\s?/gi, '')
    .replace(/\./g, '')
    .replace(',', '.');
  if (!normalized || !/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error('Informe um valor monetário válido.');
  }
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new Error('O valor informado é grande demais.');
  }
  return cents;
}

export function formatCents(cents: number, locale = 'pt-BR', currency = 'BRL'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
  }).format(cents / 100);
}

export function formatSignedCents(cents: number, locale = 'pt-BR', currency = 'BRL'): string {
  const sign = cents > 0 ? '+' : '';
  return `${sign}${formatCents(cents, locale, currency)}`;
}

export function assertNonNegativeCents(cents: number, label = 'O valor'): void {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error(`${label} deve ser um número inteiro de centavos não negativo.`);
  }
}
