import { CURRENT_SCHEMA_VERSION, DatabaseSnapshot } from './models';
import { isCivilDate } from './civil-date';

type RecordValue = Record<string, unknown>;

const ACCOUNT_TYPES = ['checking', 'savings', 'cash', 'digital-wallet', 'investment'] as const;
const CATEGORY_TYPES = ['income', 'expense'] as const;
const TRANSACTION_TYPES = ['income', 'expense', 'transfer'] as const;
const TRANSACTION_STATUSES = ['planned', 'pending', 'paid', 'cancelled'] as const;
const PAYMENT_METHODS = ['cash', 'debit-card', 'credit-card', 'pix', 'bank-transfer', 'other'] as const;
const RECURRENCE_FREQUENCIES = ['weekly', 'monthly', 'yearly', 'custom'] as const;
const RECURRENCE_DATE_POLICIES = ['clamp', 'skip'] as const;
const RECURRENCE_STATUSES = ['active', 'ended'] as const;
const CARD_PURCHASE_STATUSES = ['active', 'cancelled'] as const;
const INVOICE_STATUSES = ['open', 'closed', 'paid', 'overdue', 'cancelled'] as const;
const BUDGET_COMMITMENT_POLICIES = ['realized-only', 'pending', 'planned-and-pending'] as const;
const GOAL_STATUSES = ['active', 'completed', 'paused', 'cancelled'] as const;
const GOAL_CONTRIBUTION_TYPES = ['contribution', 'withdrawal'] as const;
const STORES = ['accounts', 'creditCards', 'cardPurchases', 'cardInvoices', 'categories', 'transactions', 'budgets', 'goals', 'goalContributions', 'recurrenceRules'] as const;

export function validateSnapshot(value: unknown): { valid: true; snapshot: DatabaseSnapshot } | { valid: false; error: string } {
  if (!isRecord(value)) return invalid('O backup precisa ser um objeto JSON.');
  if (value['schemaVersion'] !== CURRENT_SCHEMA_VERSION) return invalid('A versão deste backup não é compatível.');
  if (!isNonEmptyString(value['appVersion'])) return invalid('A versão do aplicativo no backup está inválida.');
  if (!isRecord(value['settings']) || !validateSettings(value['settings'])) return invalid('As configurações do backup estão inválidas.');
  if (typeof value['exportedAt'] !== 'string' || !isTimestamp(value['exportedAt'])) return invalid('A data do backup está inválida.');

  const collections = new Map<string, RecordValue[]>();
  for (const store of STORES) {
    const collection = value[store];
    if (!Array.isArray(collection) || !collection.every(isRecord)) return invalid(`A coleção ${store} está inválida.`);
    const records = collection as RecordValue[];
    if (new Set(records.map((item) => item['id'])).size !== records.length || records.some((item) => !isNonEmptyString(item['id']))) {
      return invalid(`A coleção ${store} possui identificadores inválidos ou duplicados.`);
    }
    if (records.some((item) => !validateAuditFields(item))) return invalid(`A coleção ${store} possui campos de auditoria inválidos.`);
    collections.set(store, records);
  }

  if (collections.get('accounts')?.some((item) => !validateAccount(item))) return invalid('Há contas inválidas no backup.');
  if (collections.get('creditCards')?.some((item) => !validateCreditCard(item))) return invalid('Há cartões inválidos no backup.');
  if (collections.get('cardPurchases')?.some((item) => !validateCardPurchase(item))) return invalid('Há compras de cartão inválidas no backup.');
  if (collections.get('cardInvoices')?.some((item) => !validateCardInvoice(item))) return invalid('Há faturas inválidas no backup.');
  if (collections.get('categories')?.some((item) => !validateCategory(item))) return invalid('Há categorias inválidas no backup.');
  if (collections.get('transactions')?.some((item) => !validateTransaction(item))) return invalid('Há movimentações inválidas no backup.');
  if (collections.get('budgets')?.some((item) => !validateBudget(item))) return invalid('Há orçamentos inválidos no backup.');
  if (collections.get('goals')?.some((item) => !validateGoal(item))) return invalid('Há metas inválidas no backup.');
  if (collections.get('goalContributions')?.some((item) => !validateGoalContribution(item))) return invalid('Há movimentações de metas inválidas no backup.');
  if (collections.get('recurrenceRules')?.some((item) => !validateRecurrenceRule(item))) return invalid('Há recorrências inválidas no backup.');

  const accounts = new Set(collections.get('accounts')?.map((item) => item['id']) ?? []);
  const categories = new Map(collections.get('categories')?.map((item) => [item['id'], item['type']]) ?? []);
  const creditCards = new Set(collections.get('creditCards')?.map((item) => item['id']) ?? []);
  const cardInvoices = collections.get('cardInvoices') ?? [];
  const cardInvoiceIds = new Set(cardInvoices.map((item) => item['id']));
  const recurrenceRules = new Set(collections.get('recurrenceRules')?.map((item) => item['id']) ?? []);
  const goals = new Set(collections.get('goals')?.map((item) => item['id']) ?? []);
  const transactions = collections.get('transactions') ?? [];

  if (collections.get('creditCards')?.some((item) => !validateCreditCardReferences(item, accounts))) return invalid('Há cartões com conta de pagamento inexistente.');
  if (transactions.some((item) => !validateReferences(item, accounts, categories, creditCards, cardInvoiceIds, recurrenceRules))) return invalid('Há movimentações com referências inexistentes ou incompatíveis.');
  const recurrenceOccurrenceKeys = transactions.map((item) => item['recurrenceOccurrenceKey']).filter((key): key is string => typeof key === 'string');
  if (new Set(recurrenceOccurrenceKeys).size !== recurrenceOccurrenceKeys.length) return invalid('Há ocorrências de recorrência duplicadas.');
  if ((collections.get('recurrenceRules') ?? []).some((item) => !validateRecurrenceReferences(item, accounts, categories))) return invalid('Há recorrências com conta ou categoria inexistente ou incompatível.');
  if ((collections.get('cardPurchases') ?? []).some((item) => !validateCardPurchaseReferences(item, creditCards, categories))) return invalid('Há compras de cartão com referências inexistentes ou incompatíveis.');
  if (cardInvoices.some((item) => !validateCardInvoiceReferences(item, creditCards))) return invalid('Há faturas com cartão inexistente.');
  if (hasDuplicateCardInvoices(cardInvoices)) return invalid('Há mais de uma fatura para o mesmo cartão e competência.');
  if (cardInvoices.some((item) => !validateInvoicePayment(item, transactions))) return invalid('Há faturas com pagamento inexistente ou incompatível.');
  if ((collections.get('categories') ?? []).some((item) => !validateCategoryParent(item, categories))) return invalid('Há categorias com categoria principal inválida.');
  if ((collections.get('budgets') ?? []).some((item) => item['categoryId'] !== null && ( !categories.has(item['categoryId']) || categories.get(item['categoryId']) !== 'expense'))) return invalid('Há orçamentos com categoria inexistente ou incompatível.');
  if (hasDuplicateActiveBudgets(collections.get('budgets') ?? [])) return invalid('Há mais de um orçamento ativo para o mesmo mês e categoria.');
  if ((collections.get('goals') ?? []).some((item) => item['accountId'] !== null && !accounts.has(item['accountId']))) return invalid('Há metas com conta inexistente.');
  if ((collections.get('goalContributions') ?? []).some((item) => !validateGoalContributionReferences(item, goals, accounts))) return invalid('Há movimentações de metas com referências inexistentes.');

  return { valid: true, snapshot: value as unknown as DatabaseSnapshot };
}

function invalid(error: string): { valid: false; error: string } { return { valid: false, error }; }

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function isNullableString(value: unknown): boolean { return value === null || typeof value === 'string'; }
function isInteger(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value); }
function isNonNegativeInteger(value: unknown): value is number { return isInteger(value) && value >= 0; }
function isPositiveInteger(value: unknown): value is number { return isInteger(value) && value > 0; }

function isOneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}

function isTimestamp(value: unknown, allowEmpty = true): value is string {
  return typeof value === 'string' && ((allowEmpty && value === '') || (!Number.isNaN(Date.parse(value)) && value.length > 0));
}

function validateAuditFields(value: RecordValue): boolean {
  return isNonEmptyString(value['id']) && isTimestamp(value['createdAt'], false) && isTimestamp(value['updatedAt'], false);
}

function validateSettings(value: RecordValue): boolean {
  return value['id'] === 'settings' && value['schemaVersion'] === CURRENT_SCHEMA_VERSION && isNonEmptyString(value['appVersion']) &&
    value['currency'] === 'BRL' && value['locale'] === 'pt-BR' && isOneOf(value['theme'], ['light', 'dark', 'system']) &&
    typeof value['firstAccessCompleted'] === 'boolean' && isTimestamp(value['updatedAt']);
}

function validateAccount(value: RecordValue): boolean {
  return isNonEmptyString(value['name']) && isNonEmptyString(value['normalizedName']) && isOneOf(value['type'], ACCOUNT_TYPES) &&
    isNullableString(value['institution']) && isNonEmptyString(value['color']) && isNonEmptyString(value['icon']) &&
    isInteger(value['initialBalanceCents']) && typeof value['isDefault'] === 'boolean' && typeof value['archived'] === 'boolean';
}

function validateCreditCard(value: RecordValue): boolean {
  return isNonEmptyString(value['name']) && isNullableString(value['brand']) && isNullableString(value['institution']) &&
    isNullableString(value['paymentAccountId']) && isNonEmptyString(value['color']) && isNonEmptyString(value['icon']) &&
    isNonNegativeInteger(value['creditLimitCents']) && isInteger(value['closingDay']) && value['closingDay'] >= 1 && value['closingDay'] <= 31 &&
    isInteger(value['dueDay']) && value['dueDay'] >= 1 && value['dueDay'] <= 31 && typeof value['archived'] === 'boolean';
}

function validateCreditCardReferences(value: RecordValue, accounts: ReadonlySet<unknown>): boolean {
  return value['paymentAccountId'] === null || accounts.has(value['paymentAccountId']);
}

function validateCardPurchase(value: RecordValue): boolean {
  return isNonEmptyString(value['description']) && isPositiveInteger(value['totalAmountCents']) && isCivilDateString(value['purchaseDate']) &&
    isMonthValue(value['firstCompetence']) && isNonEmptyString(value['categoryId']) && isNonEmptyString(value['creditCardId']) &&
    isPositiveInteger(value['installmentCount']) && value['installmentCount'] <= 48 && isNonEmptyString(value['installmentGroupId']) &&
    isOneOf(value['status'], CARD_PURCHASE_STATUSES) && typeof value['archived'] === 'boolean';
}

function validateCardInvoice(value: RecordValue): boolean {
  return isNonEmptyString(value['creditCardId']) && isMonthValue(value['competence']) && isCivilDateString(value['closingDate']) &&
    isCivilDateString(value['dueDate']) && isOneOf(value['status'], INVOICE_STATUSES) && isNullableCivilDate(value['paidAt']) &&
    isNullableString(value['paymentTransactionId']) && typeof value['archived'] === 'boolean';
}

function validateCategory(value: RecordValue): boolean {
  return isOneOf(value['type'], CATEGORY_TYPES) && isNonEmptyString(value['name']) && isNonEmptyString(value['normalizedName']) &&
    isNonEmptyString(value['color']) && isNonEmptyString(value['icon']) && isNullableString(value['parentId']) &&
    isNonNegativeInteger(value['sortOrder']) && typeof value['archived'] === 'boolean';
}

function validateTransaction(value: RecordValue): boolean {
  const tags = value['tags'];
  return isNonEmptyString(value['description']) && isPositiveInteger(value['amountCents']) && isOneOf(value['type'], TRANSACTION_TYPES) &&
    isCivilDateString(value['movementDate']) && isNullableCivilDate(value['dueDate']) && isNullableCivilDate(value['paymentDate']) &&
    isOneOf(value['paymentMethod'], PAYMENT_METHODS) && isOneOf(value['status'], TRANSACTION_STATUSES) &&
    (value['status'] === 'paid' ? value['paymentDate'] !== null : value['paymentDate'] === null) &&
    isNullableString(value['categoryId']) && isNullableString(value['accountId']) && isNullableString(value['fromAccountId']) &&
    isNullableString(value['toAccountId']) && isNullableString(value['creditCardId']) && isNullableString(value['cardInvoiceId']) &&
    Array.isArray(tags) && tags.every(isNonEmptyString) && typeof value['notes'] === 'string' &&
    isNullableString(value['recurrenceRuleId']) && isNullableString(value['recurrenceOccurrenceKey']) && isNullableString(value['transferId']) && isNullableString(value['installmentGroupId']) &&
    typeof value['archived'] === 'boolean';
}

function validateBudget(value: RecordValue): boolean {
  return typeof value['month'] === 'string' && isMonth(value['month']) &&
    (value['categoryId'] === null || typeof value['categoryId'] === 'string') && isNonNegativeInteger(value['amountCents']) &&
    isOneOf(value['commitmentPolicy'], BUDGET_COMMITMENT_POLICIES) && validateAlertThresholds(value['alertThresholds']) &&
    typeof value['archived'] === 'boolean';
}

function validateGoal(value: RecordValue): boolean {
  return isNonEmptyString(value['title']) && typeof value['description'] === 'string' && isPositiveInteger(value['targetCents']) &&
    isNonNegativeInteger(value['initialCents']) && isNullableCivilDate(value['deadline']) && isNullableString(value['accountId']) &&
    isNonEmptyString(value['color']) && isNonEmptyString(value['icon']) && isOneOf(value['status'], GOAL_STATUSES) &&
    typeof value['archived'] === 'boolean';
}

function validateGoalContribution(value: RecordValue): boolean {
  return isNonEmptyString(value['goalId']) && isOneOf(value['type'], GOAL_CONTRIBUTION_TYPES) && isPositiveInteger(value['amountCents']) &&
    isCivilDateString(value['date']) && typeof value['notes'] === 'string' && isNullableString(value['accountId']) &&
    typeof value['archived'] === 'boolean';
}

function validateAlertThresholds(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isInteger(value['attentionPercent']) && value['attentionPercent'] >= 0 && value['attentionPercent'] < 100 &&
    isInteger(value['warningPercent']) && value['warningPercent'] > value['attentionPercent'] && value['warningPercent'] <= 100;
}

function validateRecurrenceRule(value: RecordValue): boolean {
  const status = value['status'];
  return isNonEmptyString(value['description']) && isNonNegativeInteger(value['amountCents']) &&
    isOneOf(value['type'], ['income', 'expense']) && isNullableString(value['categoryId']) && isNullableString(value['accountId']) &&
    isOneOf(value['paymentMethod'], PAYMENT_METHODS) && isCivilDateString(value['startDate']) && isNullableCivilDate(value['endDate']) &&
    (value['maxOccurrences'] === null || isPositiveInteger(value['maxOccurrences'])) && isOneOf(value['datePolicy'], RECURRENCE_DATE_POLICIES) &&
    isOneOf(value['creationStatus'], ['planned', 'pending']) && Array.isArray(value['tags']) && value['tags'].every(isNonEmptyString) &&
    typeof value['notes'] === 'string' && isOneOf(value['frequency'], RECURRENCE_FREQUENCIES) && isPositiveInteger(value['interval']) &&
    isCivilDateString(value['nextDate']) && isOneOf(status, RECURRENCE_STATUSES) &&
    (status === 'ended' || value['amountCents'] > 0) && typeof value['archived'] === 'boolean';
}

function isNullableCivilDate(value: unknown): boolean {
  return value === null || isCivilDateString(value);
}

function isCivilDateString(value: unknown): value is string {
  return typeof value === 'string' && isCivilDate(value);
}

function isMonthValue(value: unknown): value is string {
  return typeof value === 'string' && isMonth(value);
}

function isMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value) && isCivilDate(`${value}-01`);
}

function validateReferences(
  value: RecordValue,
  accounts: ReadonlySet<unknown>,
  categories: ReadonlyMap<unknown, unknown>,
  creditCards: ReadonlySet<unknown>,
  cardInvoices: ReadonlySet<unknown>,
  recurrenceRules: ReadonlySet<unknown>,
): boolean {
  const type = value['type'];
  const categoryId = value['categoryId'];
  const fromAccountId = value['fromAccountId'];
  const toAccountId = value['toAccountId'];
  const accountId = value['accountId'];
  const creditCardId = value['creditCardId'];
  const cardInvoiceId = value['cardInvoiceId'];
  const recurrenceRuleId = value['recurrenceRuleId'];
  const recurrenceOccurrenceKey = value['recurrenceOccurrenceKey'];
  const isTransfer = type === 'transfer';
  const isInvoicePayment = type === 'expense' && cardInvoiceId !== null && creditCardId === null;
  const isCardPurchase = type === 'expense' && creditCardId !== null;
  const shapeIsValid = isTransfer
      ? categoryId === null && accountId === null && fromAccountId !== null && toAccountId !== null && fromAccountId !== toAccountId && cardInvoiceId === null && creditCardId === null
      : isInvoicePayment
        ? categoryId === null && accountId !== null && fromAccountId === null && toAccountId === null
      : isCardPurchase
        ? categoryId !== null && (cardInvoiceId === null || accountId === null) && fromAccountId === null && toAccountId === null
        : categoryId !== null && accountId !== null && fromAccountId === null && toAccountId === null && cardInvoiceId === null && creditCardId === null;
  return shapeIsValid && (categoryId === null || (categories.has(categoryId) && categories.get(categoryId) === type)) &&
    (accountId === null || accounts.has(accountId)) && (fromAccountId === null || accounts.has(fromAccountId)) &&
    (toAccountId === null || accounts.has(toAccountId)) && (creditCardId === null || creditCards.has(creditCardId)) &&
    (cardInvoiceId === null || cardInvoices.has(cardInvoiceId)) && (recurrenceRuleId === null || recurrenceRules.has(recurrenceRuleId)) &&
    (recurrenceOccurrenceKey === null || (typeof recurrenceOccurrenceKey === 'string' && recurrenceRuleId !== null));
}

function validateRecurrenceReferences(value: RecordValue, accounts: ReadonlySet<unknown>, categories: ReadonlyMap<unknown, unknown>): boolean {
  if (value['status'] === 'ended' && value['amountCents'] === 0 && value['accountId'] === null && value['categoryId'] === null) return true;
  return isPositiveInteger(value['amountCents']) && typeof value['accountId'] === 'string' && accounts.has(value['accountId']) &&
    typeof value['categoryId'] === 'string' && categories.get(value['categoryId']) === value['type'];
}

function validateCardPurchaseReferences(value: RecordValue, creditCards: ReadonlySet<unknown>, categories: ReadonlyMap<unknown, unknown>): boolean {
  return creditCards.has(value['creditCardId']) && categories.get(value['categoryId']) === 'expense';
}

function validateCardInvoiceReferences(value: RecordValue, creditCards: ReadonlySet<unknown>): boolean {
  return creditCards.has(value['creditCardId']);
}

function hasDuplicateCardInvoices(values: readonly RecordValue[]): boolean {
  const keys = values.map((value) => `${String(value['creditCardId'])}|${String(value['competence'])}`);
  return new Set(keys).size !== keys.length;
}

function validateInvoicePayment(invoice: RecordValue, transactions: readonly RecordValue[]): boolean {
  const paymentTransactionId = invoice['paymentTransactionId'];
  if (paymentTransactionId === null) return invoice['status'] !== 'paid';
  if (invoice['status'] !== 'paid') return false;
  return typeof paymentTransactionId === 'string' && transactions.some((transaction) =>
    transaction['id'] === paymentTransactionId && transaction['cardInvoiceId'] === invoice['id'] && transaction['creditCardId'] === null &&
    transaction['accountId'] !== null && transaction['type'] === 'expense' && transaction['status'] === 'paid',
  );
}

function validateCategoryParent(value: RecordValue, categories: ReadonlyMap<unknown, unknown>): boolean {
  const parentId = value['parentId'];
  return parentId === null || (parentId !== value['id'] && categories.has(parentId) && categories.get(parentId) === value['type']);
}

function hasDuplicateActiveBudgets(values: readonly RecordValue[]): boolean {
  const keys = values
    .filter((value) => value['archived'] === false)
    .map((value) => `${String(value['month'])}|${String(value['categoryId'])}`);
  return new Set(keys).size !== keys.length;
}

function validateGoalContributionReferences(value: RecordValue, goals: ReadonlySet<unknown>, accounts: ReadonlySet<unknown>): boolean {
  return goals.has(value['goalId']) && (value['accountId'] === null || accounts.has(value['accountId']));
}
