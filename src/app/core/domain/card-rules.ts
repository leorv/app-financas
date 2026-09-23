import { CardPurchase, CreditCard, CreditCardInvoice, Transaction } from './models';
import { isCivilDate } from './civil-date';

export interface PlannedCardInstallment {
  readonly sequence: number;
  readonly amountCents: number;
  readonly competence: string;
}

export interface InvoicePeriod {
  readonly from: string;
  readonly to: string;
}

export function calculateInstallmentAmounts(totalAmountCents: number, installmentCount: number): readonly number[] {
  if (!Number.isSafeInteger(totalAmountCents) || totalAmountCents <= 0) {
    throw new Error('O valor total da compra deve ser maior que zero.');
  }
  if (!Number.isSafeInteger(installmentCount) || installmentCount < 1 || installmentCount > 48) {
    throw new Error('A compra deve ter entre 1 e 48 parcelas.');
  }
  const base = Math.floor(totalAmountCents / installmentCount);
  const remainder = totalAmountCents % installmentCount;
  return Array.from({ length: installmentCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function calculateInvoiceCompetence(purchaseDate: string, closingDay: number): string {
  assertCardDay(closingDay, 'fechamento');
  if (!isCivilDate(purchaseDate)) {
    throw new Error('Informe uma data de compra válida.');
  }
  const [year, month, day] = purchaseDate.split('-').map(Number);
  const monthValue = day > closingDay ? shiftMonths(`${year}-${pad(month)}`, 1) : `${year}-${pad(month)}`;
  return monthValue;
}

export function calculateInvoiceClosingDate(competence: string, closingDay: number): string {
  assertMonth(competence);
  assertCardDay(closingDay, 'fechamento');
  return dateWithClampedDay(competence, closingDay);
}

export function calculateInvoiceDueDate(competence: string, closingDay: number, dueDay: number): string {
  assertMonth(competence);
  assertCardDay(closingDay, 'fechamento');
  assertCardDay(dueDay, 'vencimento');
  const dueMonth = dueDay <= closingDay ? shiftMonths(competence, 1) : competence;
  return dateWithClampedDay(dueMonth, dueDay);
}

export function calculateInvoicePeriod(competence: string, closingDay: number): InvoicePeriod {
  const to = calculateInvoiceClosingDate(competence, closingDay);
  const previousCompetence = shiftMonths(competence, -1);
  const previousClosing = calculateInvoiceClosingDate(previousCompetence, closingDay);
  return { from: shiftDays(previousClosing, 1), to };
}

export function planCardInstallments(
  totalAmountCents: number,
  installmentCount: number,
  firstCompetence: string,
): readonly PlannedCardInstallment[] {
  assertMonth(firstCompetence);
  return calculateInstallmentAmounts(totalAmountCents, installmentCount).map((amountCents, index) => ({
    sequence: index + 1,
    amountCents,
    competence: shiftMonths(firstCompetence, index),
  }));
}

export function calculateCreditLimitUsed(transactions: readonly Transaction[], creditCardId: string): number {
  return transactions.reduce((total, transaction) => {
    if (transaction.archived || transaction.status === 'cancelled' || transaction.creditCardId !== creditCardId) return total;
    return total + transaction.amountCents;
  }, 0);
}

export function calculateAvailableCreditLimit(card: Pick<CreditCard, 'creditLimitCents'>, transactions: readonly Transaction[], creditCardId: string): number {
  return card.creditLimitCents - calculateCreditLimitUsed(transactions, creditCardId);
}

export function calculateInvoiceTotal(invoice: Pick<CreditCardInvoice, 'id' | 'creditCardId'>, transactions: readonly Transaction[]): number {
  return transactions.reduce((total, transaction) => {
    if (transaction.archived || transaction.status === 'cancelled') return total;
    if (transaction.creditCardId !== invoice.creditCardId || transaction.cardInvoiceId !== invoice.id) return total;
    return total + transaction.amountCents;
  }, 0);
}

export function purchaseInstallments(
  purchase: Pick<CardPurchase, 'totalAmountCents' | 'installmentCount' | 'firstCompetence'>,
): readonly PlannedCardInstallment[] {
  return planCardInstallments(purchase.totalAmountCents, purchase.installmentCount, purchase.firstCompetence);
}

function dateWithClampedDay(competence: string, day: number): string {
  return `${competence}-${pad(Math.min(day, daysInMonth(competence)))}`;
}

function daysInMonth(competence: string): number {
  const [year, month] = competence.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function shiftMonths(competence: string, amount: number): string {
  const [year, month] = competence.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

function shiftDays(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function assertMonth(value: string): void {
  if (!/^\d{4}-\d{2}$/.test(value) || !isCivilDate(`${value}-01`)) {
    throw new Error('Informe uma competência mensal válida.');
  }
}

function assertCardDay(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 31) {
    throw new Error(`Informe um dia de ${label} entre 1 e 31.`);
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
