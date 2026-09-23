import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { EMPTY_SNAPSHOT, DatabaseSnapshot } from '../domain/models';
import { validateSnapshot } from '../domain/snapshot-validator';
import { AccountService } from './account.service';
import { CategoryService } from './category.service';
import { CreditCardService } from './credit-card.service';
import { PersistenceService } from '../persistence/persistence.service';

class MemoryPersistence {
  readonly snapshot = signal<DatabaseSnapshot>({ ...EMPTY_SNAPSHOT });
  readonly errorMessage = signal<string | null>(null);
  async update(mutator: (current: DatabaseSnapshot) => DatabaseSnapshot): Promise<boolean> { this.snapshot.set(mutator(this.snapshot())); return true; }
}

async function setup(): Promise<{ persistence: MemoryPersistence; accountService: AccountService; categoryService: CategoryService; cardService: CreditCardService; accountId: string; categoryId: string }> {
  const persistence = new MemoryPersistence();
  const accountService = new AccountService(persistence as unknown as PersistenceService);
  const categoryService = new CategoryService(persistence as unknown as PersistenceService);
  const account = await accountService.create({ name: 'Conta principal', type: 'checking', institution: '', color: '#000', icon: '◉', initialBalanceCents: 10000, isDefault: true });
  const category = await categoryService.create({ name: 'Casa', type: 'expense', color: '#000', icon: '⌂', parentId: null });
  const cardService = new CreditCardService(persistence as unknown as PersistenceService, accountService, categoryService);
  return { persistence, accountService, categoryService, cardService, accountId: account.id, categoryId: category.id };
}

describe('casos de uso de cartões e faturas', () => {
  it('gera parcelas exatas, faturas rastreáveis e não reduz a conta na compra', async () => {
    const { persistence, accountService, cardService, accountId, categoryId } = await setup();
    const card = await cardService.createCard({ name: 'Platinum', brand: 'Visa', paymentAccountId: accountId, creditLimitCents: 10000, closingDay: 20, dueDay: 5, color: '#3155a6', icon: '▣' });
    const purchase = await cardService.createPurchase({ description: 'Notebook', totalAmountCents: 1000, purchaseDate: '2026-09-21', categoryId, creditCardId: card.id, installmentCount: 3, firstCompetence: '2026-10' });
    const installments = persistence.snapshot().transactions.filter((transaction) => transaction.installmentGroupId === purchase.installmentGroupId);
    expect(installments.map((transaction) => transaction.amountCents)).toEqual([334, 333, 333]);
    expect(installments.reduce((sum, transaction) => sum + transaction.amountCents, 0)).toBe(1000);
    expect(new Set(installments.map((transaction) => transaction.cardInvoiceId)).size).toBe(3);
    expect(cardService.limitUsed(card)).toBe(1000);
    expect(accountService.balance(accountService.accounts().find((account) => account.id === accountId)!)).toBe(10000);
    const firstInvoice = cardService.invoicesFor(card.id)[0];
    await cardService.closeInvoice(firstInvoice.id);
    expect(cardService.getInvoiceById(firstInvoice.id)?.status).toBe('closed');
    await cardService.refreshInvoiceStatuses('2026-11-06');
    expect(cardService.invoiceStatus(cardService.getInvoiceById(firstInvoice.id)!,'2026-11-06')).toBe('overdue');
    await cardService.payInvoice(firstInvoice.id, '2026-11-06');
    expect(cardService.getInvoiceById(firstInvoice.id)?.status).toBe('paid');
    expect(validateSnapshot({ ...persistence.snapshot(), exportedAt: '2026-09-30T12:00:00.000Z' }).valid).toBe(true);
  });

  it('atualiza parcelas e limite, paga uma única vez e bloqueia edição retroativa paga', async () => {
    const { persistence, accountService, cardService, accountId, categoryId } = await setup();
    const card = await cardService.createCard({ name: 'Platinum', brand: '', paymentAccountId: accountId, creditLimitCents: 20000, closingDay: 20, dueDay: 5, color: '#3155a6', icon: '▣' });
    const purchase = await cardService.createPurchase({ description: 'Curso', totalAmountCents: 1000, purchaseDate: '2026-09-19', categoryId, creditCardId: card.id, installmentCount: 3, firstCompetence: '2026-09' });
    await cardService.updatePurchase(purchase.id, { description: 'Curso atualizado', totalAmountCents: 1300, purchaseDate: '2026-09-19', categoryId, creditCardId: card.id, installmentCount: 2, firstCompetence: '2026-09' });
    const active = persistence.snapshot().transactions.filter((transaction) => !transaction.archived && transaction.creditCardId === card.id);
    expect(active.map((transaction) => transaction.amountCents)).toEqual([650, 650]);
    expect(cardService.limitUsed(card)).toBe(1300);
    const invoice = cardService.invoicesFor(card.id).find((item) => item.competence === '2026-09')!;
    expect(cardService.invoiceTotal(invoice)).toBe(650);
    await cardService.payInvoice(invoice.id, '2026-09-30');
    expect(accountService.balance(accountService.accounts().find((account) => account.id === accountId)!)).toBe(9350);
    expect(persistence.snapshot().transactions.filter((transaction) => transaction.cardInvoiceId === invoice.id && transaction.creditCardId === null)).toHaveLength(1);
    await expect(cardService.payInvoice(invoice.id, '2026-10-01')).rejects.toThrow('já foi paga');
    await expect(cardService.updatePurchase(purchase.id, { description: 'Tentativa', totalAmountCents: 900, purchaseDate: '2026-09-19', categoryId, creditCardId: card.id, installmentCount: 1, firstCompetence: '2026-09' })).rejects.toThrow('fatura paga');
  });

  it('arquiva o cartão sem remover compras e rejeita compra em cartão arquivado', async () => {
    const { cardService, accountId, categoryId } = await setup();
    const card = await cardService.createCard({ name: 'Gold', brand: '', paymentAccountId: accountId, creditLimitCents: 10000, closingDay: 10, dueDay: 17, color: '#3155a6', icon: '▣' });
    const purchase = await cardService.createPurchase({ description: 'Passagem', totalAmountCents: 5000, purchaseDate: '2026-09-09', categoryId, creditCardId: card.id, installmentCount: 1, firstCompetence: '2026-09' });
    await cardService.archive(card.id);
    expect(cardService.getPurchaseById(purchase.id)?.archived).toBe(false);
    await expect(cardService.createPurchase({ description: 'Nova', totalAmountCents: 100, purchaseDate: '2026-09-09', categoryId, creditCardId: card.id, installmentCount: 1, firstCompetence: '2026-09' })).rejects.toThrow('cartão ativo');
  });
});
