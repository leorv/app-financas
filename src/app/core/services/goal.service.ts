import { Injectable, computed } from '@angular/core';
import { createId } from '../domain/ids';
import { isCivilDate, todayCivilDate, utcNow } from '../domain/civil-date';
import { calculateGoalProgress, canWithdrawFromGoal } from '../domain/goal-rules';
import { FinancialGoal, GoalContribution, GoalContributionType, GoalStatus } from '../domain/models';
import { PersistenceService } from '../persistence/persistence.service';

export interface GoalInput {
  readonly title: string;
  readonly description: string;
  readonly targetCents: number;
  readonly initialCents: number;
  readonly deadline: string | null;
  readonly accountId: string | null;
  readonly color: string;
  readonly icon: string;
}

export interface GoalContributionInput {
  readonly type: GoalContributionType;
  readonly amountCents: number;
  readonly date: string;
  readonly notes: string;
  readonly accountId?: string | null;
}

@Injectable({ providedIn: 'root' })
export class GoalService {
  readonly goals = computed(() => this.persistence.snapshot().goals);
  readonly activeGoals = computed(() => this.goals().filter((goal) => !goal.archived));
  readonly contributions = computed(() => this.persistence.snapshot().goalContributions);

  constructor(private readonly persistence: PersistenceService) {}

  getById(id: string): FinancialGoal | undefined {
    return this.goals().find((goal) => goal.id === id);
  }

  contributionsFor(goalId: string): readonly GoalContribution[] {
    return this.contributions()
      .filter((entry) => entry.goalId === goalId && !entry.archived)
      .sort((left, right) => right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt));
  }

  progress(goalId: string) {
    const goal = this.getById(goalId);
    if (!goal) throw new Error('Meta não encontrada.');
    return calculateGoalProgress(goal, this.contributions(), todayCivilDate());
  }

  async create(input: GoalInput): Promise<FinancialGoal> {
    this.validateInput(input);
    const now = utcNow();
    const goal: FinancialGoal = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      archived: false,
      title: input.title.trim(),
      description: input.description.trim(),
      targetCents: input.targetCents,
      initialCents: input.initialCents,
      deadline: input.deadline,
      accountId: input.accountId,
      color: input.color,
      icon: input.icon,
      status: 'active',
    };
    await this.persist((current) => ({ ...current, goals: [...current.goals, goal] }));
    return this.getById(goal.id) ?? goal;
  }

  async update(id: string, input: GoalInput): Promise<FinancialGoal> {
    const current = this.getById(id);
    if (!current) throw new Error('Meta não encontrada.');
    this.validateInput(input, current);
    const currentProgress = calculateGoalProgress(current, this.contributions(), todayCivilDate());
    const balanceWithoutInitial = currentProgress.balanceCents - current.initialCents;
    if (input.initialCents + balanceWithoutInitial < 0) throw new Error('O valor inicial não pode deixar o saldo da meta negativo.');
    const updated: FinancialGoal = { ...current, ...input, title: input.title.trim(), description: input.description.trim(), updatedAt: utcNow() };
    await this.persist((snapshot) => ({ ...snapshot, goals: snapshot.goals.map((goal) => goal.id === id ? updated : goal) }));
    return this.getById(id) ?? updated;
  }

  async contribute(goalId: string, input: GoalContributionInput): Promise<GoalContribution> {
    const goal = this.getById(goalId);
    if (!goal) throw new Error('Meta não encontrada.');
    if (goal.status === 'completed' || goal.status === 'cancelled') throw new Error('Reabra a meta antes de registrar uma movimentação.');
    this.validateContributionInput(input);
    const currentContributions = this.contributions();
    if (input.type === 'withdrawal' && !canWithdrawFromGoal(goal, currentContributions, input.amountCents)) {
      throw new Error('A retirada não pode superar o saldo acumulado da meta.');
    }
    const now = utcNow();
    const contribution: GoalContribution = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      archived: false,
      goalId,
      type: input.type,
      amountCents: input.amountCents,
      date: input.date,
      notes: input.notes.trim(),
      accountId: input.accountId === undefined ? goal.accountId : input.accountId,
    };
    await this.persist((snapshot) => ({
      ...snapshot,
      goalContributions: [...snapshot.goalContributions, contribution],
      goals: snapshot.goals.map((item) => item.id === goalId ? { ...item, updatedAt: now } : item),
    }));
    return this.contributions().find((entry) => entry.id === contribution.id) ?? contribution;
  }

  async setStatus(id: string, status: GoalStatus): Promise<FinancialGoal> {
    const current = this.getById(id);
    if (!current) throw new Error('Meta não encontrada.');
    if (!['active', 'completed', 'paused', 'cancelled'].includes(status)) throw new Error('O status da meta é inválido.');
    const updated = { ...current, status, updatedAt: utcNow() };
    await this.persist((snapshot) => ({ ...snapshot, goals: snapshot.goals.map((goal) => goal.id === id ? updated : goal) }));
    return this.getById(id) ?? updated;
  }

  async archiveContribution(id: string): Promise<void> {
    const current = this.contributions().find((entry) => entry.id === id);
    if (!current) throw new Error('Movimentação da meta não encontrada.');
    await this.persist((snapshot) => ({
      ...snapshot,
      goalContributions: snapshot.goalContributions.map((entry) => entry.id === id ? { ...entry, archived: true, updatedAt: utcNow() } : entry),
    }));
  }

  private validateInput(input: GoalInput, current?: FinancialGoal): void {
    if (!input.title.trim()) throw new Error('Informe o título da meta.');
    if (input.title.trim().length > 100) throw new Error('O título da meta deve ter no máximo 100 caracteres.');
    if (input.description.trim().length > 400) throw new Error('A descrição deve ter no máximo 400 caracteres.');
    if (!Number.isSafeInteger(input.targetCents) || input.targetCents <= 0) throw new Error('O objetivo deve ser maior que zero.');
    if (!Number.isSafeInteger(input.initialCents) || input.initialCents < 0) throw new Error('O valor inicial não pode ser negativo.');
    if (input.deadline !== null && !isCivilDate(input.deadline)) throw new Error('Informe uma data-alvo válida.');
    if (!input.color.trim() || !input.icon.trim()) throw new Error('Informe cor e ícone para a meta.');
    if (input.accountId !== null) {
      const account = this.persistence.snapshot().accounts.find((item) => item.id === input.accountId);
      if (!account || (account.archived && account.id !== current?.accountId)) throw new Error('Selecione uma conta relacionada válida.');
    }
  }

  private validateContributionInput(input: GoalContributionInput): void {
    if (!['contribution', 'withdrawal'].includes(input.type)) throw new Error('O tipo da movimentação da meta é inválido.');
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error('O valor deve ser maior que zero.');
    if (!isCivilDate(input.date)) throw new Error('Informe uma data válida para a movimentação.');
    if (input.notes.trim().length > 300) throw new Error('As observações devem ter no máximo 300 caracteres.');
    if (input.accountId !== undefined && input.accountId !== null) {
      const account = this.persistence.snapshot().accounts.find((item) => item.id === input.accountId);
      if (!account) throw new Error('A conta relacionada à movimentação não existe.');
    }
  }

  private async persist(mutator: (snapshot: ReturnType<PersistenceService['snapshot']>) => ReturnType<PersistenceService['snapshot']>): Promise<void> {
    const saved = await this.persistence.update((current) => mutator(current));
    if (!saved) throw new Error(this.persistence.errorMessage() ?? 'Não foi possível salvar a meta.');
  }
}
