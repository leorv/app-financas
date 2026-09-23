export type Id = string;

export type ThemePreference = 'light' | 'dark' | 'system';
export type CategoryType = 'income' | 'expense';
export type AccountType = 'checking' | 'savings' | 'cash' | 'digital-wallet' | 'investment';
export type TransactionType = 'income' | 'expense' | 'transfer';
export type TransactionStatus = 'planned' | 'pending' | 'paid' | 'cancelled';
export type PaymentMethod = 'cash' | 'debit-card' | 'credit-card' | 'pix' | 'bank-transfer' | 'other';
export type CardPurchaseStatus = 'active' | 'cancelled';
export type CreditCardInvoiceStatus = 'open' | 'closed' | 'paid' | 'overdue' | 'cancelled';
export type RecurrenceFrequency = 'weekly' | 'monthly' | 'yearly' | 'custom';
export type RecurrenceDatePolicy = 'clamp' | 'skip';
export type RecurrenceStatus = 'active' | 'ended';
export type BudgetCommitmentPolicy = 'realized-only' | 'pending' | 'planned-and-pending';
export type BudgetAlertBand = 'none' | 'attention' | 'warning' | 'exceeded';
export type GoalStatus = 'active' | 'completed' | 'paused' | 'cancelled';
export type GoalContributionType = 'contribution' | 'withdrawal';

export const CURRENT_SCHEMA_VERSION = 4;

export interface AuditFields {
  readonly id: Id;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archived: boolean;
}

export interface Settings {
  readonly id: 'settings';
  readonly schemaVersion: number;
  readonly appVersion: string;
  readonly currency: 'BRL';
  readonly locale: 'pt-BR';
  readonly theme: ThemePreference;
  readonly firstAccessCompleted: boolean;
  readonly updatedAt: string;
}

export interface Category extends AuditFields {
  readonly type: CategoryType;
  readonly name: string;
  readonly normalizedName: string;
  readonly color: string;
  readonly icon: string;
  readonly parentId: Id | null;
  readonly sortOrder: number;
}

export interface Account extends AuditFields {
  readonly name: string;
  readonly normalizedName: string;
  readonly type: AccountType;
  readonly institution: string | null;
  readonly color: string;
  readonly icon: string;
  readonly initialBalanceCents: number;
  readonly isDefault: boolean;
}

export interface CreditCard extends AuditFields {
  readonly name: string;
  readonly brand: string | null;
  readonly institution: string | null;
  readonly paymentAccountId: Id | null;
  readonly color: string;
  readonly icon: string;
  readonly creditLimitCents: number;
  readonly closingDay: number;
  readonly dueDay: number;
}

export interface Transaction extends AuditFields {
  readonly description: string;
  readonly amountCents: number;
  readonly type: TransactionType;
  readonly movementDate: string;
  readonly dueDate: string | null;
  readonly paymentDate: string | null;
  readonly paymentMethod: PaymentMethod;
  readonly status: TransactionStatus;
  readonly categoryId: Id | null;
  readonly accountId: Id | null;
  readonly fromAccountId: Id | null;
  readonly toAccountId: Id | null;
  readonly creditCardId: Id | null;
  readonly tags: readonly string[];
  readonly notes: string;
  readonly recurrenceRuleId: Id | null;
  readonly recurrenceOccurrenceKey: Id | null;
  readonly transferId: Id | null;
  readonly installmentGroupId: Id | null;
  readonly cardInvoiceId: Id | null;
}

export interface CardPurchase extends AuditFields {
  readonly description: string;
  readonly totalAmountCents: number;
  readonly purchaseDate: string;
  readonly firstCompetence: string;
  readonly categoryId: Id;
  readonly creditCardId: Id;
  readonly installmentCount: number;
  readonly installmentGroupId: Id;
  readonly status: CardPurchaseStatus;
}

export interface CreditCardInvoice extends AuditFields {
  readonly creditCardId: Id;
  readonly competence: string;
  readonly closingDate: string;
  readonly dueDate: string;
  readonly status: CreditCardInvoiceStatus;
  readonly paidAt: string | null;
  readonly paymentTransactionId: Id | null;
}

export interface RecurrenceRule extends AuditFields {
  readonly description: string;
  readonly amountCents: number;
  readonly type: Exclude<TransactionType, 'transfer'>;
  readonly categoryId: Id | null;
  readonly accountId: Id | null;
  readonly paymentMethod: PaymentMethod;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly maxOccurrences: number | null;
  readonly datePolicy: RecurrenceDatePolicy;
  readonly creationStatus: Extract<TransactionStatus, 'planned' | 'pending'>;
  readonly tags: readonly string[];
  readonly notes: string;
  readonly frequency: RecurrenceFrequency;
  readonly interval: number;
  readonly nextDate: string;
  readonly status: RecurrenceStatus;
}

export interface Budget extends AuditFields {
  readonly month: string;
  readonly categoryId: Id | null;
  readonly amountCents: number;
  readonly commitmentPolicy: BudgetCommitmentPolicy;
  readonly alertThresholds: {
    readonly attentionPercent: number;
    readonly warningPercent: number;
  };
}

export interface FinancialGoal extends AuditFields {
  readonly title: string;
  readonly description: string;
  readonly targetCents: number;
  readonly initialCents: number;
  readonly deadline: string | null;
  readonly accountId: Id | null;
  readonly color: string;
  readonly icon: string;
  readonly status: GoalStatus;
}

export interface GoalContribution extends AuditFields {
  readonly goalId: Id;
  readonly type: GoalContributionType;
  readonly amountCents: number;
  readonly date: string;
  readonly notes: string;
  readonly accountId: Id | null;
}

export interface DatabaseSnapshot {
  readonly schemaVersion: number;
  readonly appVersion: string;
  readonly exportedAt: string;
  readonly settings: Settings;
  readonly accounts: readonly Account[];
  readonly creditCards: readonly CreditCard[];
  readonly cardPurchases: readonly CardPurchase[];
  readonly cardInvoices: readonly CreditCardInvoice[];
  readonly categories: readonly Category[];
  readonly transactions: readonly Transaction[];
  readonly budgets: readonly Budget[];
  readonly goals: readonly FinancialGoal[];
  readonly goalContributions: readonly GoalContribution[];
  readonly recurrenceRules: readonly RecurrenceRule[];
}

export const EMPTY_SNAPSHOT: DatabaseSnapshot = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  appVersion: '0.1.0',
  exportedAt: '',
  settings: {
    id: 'settings',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: '0.1.0',
    currency: 'BRL',
    locale: 'pt-BR',
    theme: 'system',
    firstAccessCompleted: false,
    updatedAt: '',
  },
  accounts: [],
  creditCards: [],
  cardPurchases: [],
  cardInvoices: [],
  categories: [],
  transactions: [],
  budgets: [],
  goals: [],
  goalContributions: [],
  recurrenceRules: [],
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  cash: 'Dinheiro',
  'digital-wallet': 'Carteira digital',
  investment: 'Investimento',
};

export const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = {
  income: 'Receitas',
  expense: 'Despesas',
};

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  planned: 'Prevista',
  pending: 'Pendente',
  paid: 'Paga',
  cancelled: 'Cancelada',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Dinheiro',
  'debit-card': 'Cartão de débito',
  'credit-card': 'Cartão de crédito',
  pix: 'Pix',
  'bank-transfer': 'Transferência bancária',
  other: 'Outra',
};

export const CREDIT_CARD_INVOICE_STATUS_LABELS: Record<CreditCardInvoiceStatus, string> = {
  open: 'Aberta',
  closed: 'Fechada',
  paid: 'Paga',
  overdue: 'Vencida',
  cancelled: 'Cancelada',
};

export const BUDGET_COMMITMENT_POLICY_LABELS: Record<BudgetCommitmentPolicy, string> = {
  'realized-only': 'Somente realizado',
  pending: 'Realizado + pendente',
  'planned-and-pending': 'Realizado + pendente + previsto',
};

export const BUDGET_ALERT_BAND_LABELS: Record<BudgetAlertBand, string> = {
  none: 'Dentro do limite',
  attention: 'Atenção',
  warning: 'Alerta',
  exceeded: 'Excedido',
};

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: 'Ativa',
  completed: 'Concluída',
  paused: 'Pausada',
  cancelled: 'Cancelada',
};

export const GOAL_CONTRIBUTION_TYPE_LABELS: Record<GoalContributionType, string> = {
  contribution: 'Aporte',
  withdrawal: 'Retirada',
};
