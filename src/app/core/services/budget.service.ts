import { Injectable, computed } from '@angular/core';
import {
  Budget,
  BudgetCommitmentPolicy,
  Category,
} from '../domain/models';
import {
  BudgetSummary,
  DEFAULT_BUDGET_ALERT_THRESHOLDS,
  DEFAULT_BUDGET_COMMITMENT_POLICY,
  copyBudgetMonth,
  isBudgetMonth,
  summarizeBudgets,
} from '../domain/budget-rules';
import { createId } from '../domain/ids';
import { utcNow } from '../domain/civil-date';
import { PersistenceService } from '../persistence/persistence.service';

export interface BudgetInput {
  readonly month: string;
  readonly categoryId: string | null;
  readonly amountCents: number;
  readonly commitmentPolicy?: BudgetCommitmentPolicy;
  readonly attentionPercent?: number;
  readonly warningPercent?: number;
}

@Injectable({ providedIn: 'root' })
export class BudgetService {
  readonly budgets = computed(() => this.persistence.snapshot().budgets);
  readonly activeBudgets = computed(() => this.budgets().filter((budget) => !budget.archived));

  constructor(private readonly persistence: PersistenceService) {}

  forMonth(month: string): readonly Budget[] {
    return this.activeBudgets().filter((budget) => budget.month === month);
  }

  summary(month: string): BudgetSummary {
    return summarizeBudgets(this.persistence.snapshot().transactions, this.budgets(), month);
  }

  availableMonths(): readonly string[] {
    const months = new Set<string>();
    for (const budget of this.budgets()) months.add(budget.month);
    for (const transaction of this.persistence.snapshot().transactions) months.add(transaction.movementDate.slice(0, 7));
    return [...months].filter(isBudgetMonth).sort().reverse();
  }

  async create(input: BudgetInput): Promise<Budget> {
    this.validateInput(input);
    this.assertNoDuplicate(input.month, input.categoryId, null);
    const now = utcNow();
    const budget = this.toBudget(createId(), now, now, input);
    await this.persist((current) => [...current, budget]);
    return this.budgets().find((item) => item.id === budget.id) ?? budget;
  }

  async update(id: string, input: BudgetInput): Promise<Budget> {
    const current = this.budgets().find((budget) => budget.id === id);
    if (!current) throw new Error('Orçamento não encontrado.');
    this.validateInput(input, current);
    this.assertNoDuplicate(input.month, input.categoryId, id);
    const updated = this.toBudget(id, current.createdAt, utcNow(), input, current);
    await this.persist((budgets) => budgets.map((budget) => budget.id === id ? updated : budget));
    return this.budgets().find((item) => item.id === id) ?? updated;
  }

  async archive(id: string): Promise<void> {
    const current = this.budgets().find((budget) => budget.id === id);
    if (!current) throw new Error('Orçamento não encontrado.');
    await this.persist((budgets) => budgets.map((budget) => budget.id === id ? { ...budget, archived: true, updatedAt: utcNow() } : budget));
  }

  async reactivate(id: string): Promise<void> {
    const current = this.budgets().find((budget) => budget.id === id);
    if (!current) throw new Error('Orçamento não encontrado.');
    this.assertNoDuplicate(current.month, current.categoryId, id);
    await this.persist((budgets) => budgets.map((budget) => budget.id === id ? { ...budget, archived: false, updatedAt: utcNow() } : budget));
  }

  async copyMonth(sourceMonth: string, targetMonth: string): Promise<readonly Budget[]> {
    const current = this.budgets();
    const drafts = copyBudgetMonth(current, sourceMonth, targetMonth);
    if (drafts.length === 0) throw new Error('Não há limites ativos no mês de origem para copiar.');
    for (const draft of drafts) this.assertNoDuplicate(draft.month, draft.categoryId, null);
    const now = utcNow();
    const created = drafts.map((draft) => ({
      id: createId(),
      createdAt: now,
      updatedAt: now,
      archived: false,
      ...draft,
    } satisfies Budget));
    await this.persist((budgets) => [...budgets, ...created]);
    return created;
  }

  private toBudget(id: string, createdAt: string, updatedAt: string, input: BudgetInput, current?: Budget): Budget {
    return {
      id,
      createdAt,
      updatedAt,
      archived: current?.archived ?? false,
      month: input.month,
      categoryId: input.categoryId,
      amountCents: input.amountCents,
      commitmentPolicy: input.commitmentPolicy ?? current?.commitmentPolicy ?? DEFAULT_BUDGET_COMMITMENT_POLICY,
      alertThresholds: {
        attentionPercent: input.attentionPercent ?? current?.alertThresholds.attentionPercent ?? DEFAULT_BUDGET_ALERT_THRESHOLDS.attentionPercent,
        warningPercent: input.warningPercent ?? current?.alertThresholds.warningPercent ?? DEFAULT_BUDGET_ALERT_THRESHOLDS.warningPercent,
      },
    };
  }

  private validateInput(input: BudgetInput, current?: Budget): void {
    if (!isBudgetMonth(input.month)) throw new Error('Informe um mês de orçamento válido.');
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0) throw new Error('O limite deve ser um valor em centavos não negativo.');
    const policy = input.commitmentPolicy ?? current?.commitmentPolicy ?? DEFAULT_BUDGET_COMMITMENT_POLICY;
    if (!['realized-only', 'pending', 'planned-and-pending'].includes(policy)) throw new Error('A política de comprometimento é inválida.');
    const attention = input.attentionPercent ?? current?.alertThresholds.attentionPercent ?? DEFAULT_BUDGET_ALERT_THRESHOLDS.attentionPercent;
    const warning = input.warningPercent ?? current?.alertThresholds.warningPercent ?? DEFAULT_BUDGET_ALERT_THRESHOLDS.warningPercent;
    if (!Number.isSafeInteger(attention) || attention < 0 || attention >= 100 || !Number.isSafeInteger(warning) || warning <= attention || warning > 100) {
      throw new Error('Informe faixas de alerta crescentes entre 0% e 100%.');
    }
    if (input.categoryId !== null) {
      const category = this.persistence.snapshot().categories.find((item) => item.id === input.categoryId);
      if (!category || category.type !== 'expense') throw new Error('Selecione uma categoria de despesa válida.');
      if (category.archived && category.id !== current?.categoryId) throw new Error('Categorias arquivadas não podem receber novos orçamentos.');
    }
  }

  private assertNoDuplicate(month: string, categoryId: string | null, ignoredId: string | null, includeArchived = false): void {
    const duplicated = this.budgets().some((budget) => budget.id !== ignoredId &&
      (includeArchived || !budget.archived) && budget.month === month && budget.categoryId === categoryId);
    if (duplicated) throw new Error('Já existe um orçamento para este mês e categoria.');
  }

  private async persist(mutator: (budgets: readonly Budget[]) => readonly Budget[]): Promise<void> {
    const saved = await this.persistence.update((current) => ({ ...current, budgets: mutator(current.budgets) }));
    if (!saved) throw new Error(this.persistence.errorMessage() ?? 'Não foi possível salvar o orçamento.');
  }
}

export function categoryForBudget(categories: readonly Category[], categoryId: string | null): Category | undefined {
  return categoryId === null ? undefined : categories.find((category) => category.id === categoryId);
}
