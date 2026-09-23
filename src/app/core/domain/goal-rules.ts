import { isCivilDate, todayCivilDate } from './civil-date';
import { FinancialGoal, GoalContribution, GoalStatus } from './models';

export interface GoalProgress {
  readonly goal: FinancialGoal;
  readonly balanceCents: number;
  readonly contributedCents: number;
  readonly withdrawnCents: number;
  readonly remainingCents: number;
  readonly percentage: number;
  readonly monthsRemaining: number | null;
  readonly estimatedMonthlyContributionCents: number | null;
}

export function calculateGoalProgress(
  goal: FinancialGoal,
  contributions: readonly GoalContribution[],
  today = todayCivilDate(),
): GoalProgress {
  const activeEntries = contributions.filter((entry) => entry.goalId === goal.id && !entry.archived);
  const contributedCents = activeEntries
    .filter((entry) => entry.type === 'contribution')
    .reduce((total, entry) => total + entry.amountCents, 0);
  const withdrawnCents = activeEntries
    .filter((entry) => entry.type === 'withdrawal')
    .reduce((total, entry) => total + entry.amountCents, 0);
  const balanceCents = goal.initialCents + contributedCents - withdrawnCents;
  const remainingCents = Math.max(goal.targetCents - balanceCents, 0);
  const percentage = Math.min(Math.max((balanceCents / goal.targetCents) * 100, 0), 100);
  const monthsRemaining = goal.deadline ? monthsUntilDeadline(today, goal.deadline) : null;
  const estimatedMonthlyContributionCents = estimateMonthlyContribution(
    remainingCents,
    monthsRemaining,
    goal.status,
  );
  return {
    goal,
    balanceCents,
    contributedCents,
    withdrawnCents,
    remainingCents,
    percentage,
    monthsRemaining,
    estimatedMonthlyContributionCents,
  };
}

export function estimateMonthlyContribution(
  remainingCents: number,
  monthsRemaining: number | null,
  status: GoalStatus = 'active',
): number | null {
  if (remainingCents <= 0 || monthsRemaining === null || monthsRemaining <= 0 || status === 'cancelled' || status === 'completed') {
    return null;
  }
  return Math.ceil(remainingCents / monthsRemaining);
}

export function monthsUntilDeadline(today: string, deadline: string): number | null {
  if (!isCivilDate(today) || !isCivilDate(deadline) || deadline < today) return null;
  const [todayYear, todayMonth] = today.split('-').map(Number);
  const [deadlineYear, deadlineMonth] = deadline.split('-').map(Number);
  return (deadlineYear - todayYear) * 12 + deadlineMonth - todayMonth + 1;
}

export function canWithdrawFromGoal(
  goal: FinancialGoal,
  contributions: readonly GoalContribution[],
  amountCents: number,
): boolean {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return false;
  return amountCents <= calculateGoalProgress(goal, contributions).balanceCents;
}
