import { describe, expect, it } from 'vitest';
import { FinancialGoal, GoalContribution } from './models';
import { calculateGoalProgress, canWithdrawFromGoal, estimateMonthlyContribution, monthsUntilDeadline } from './goal-rules';

const timestamp = '2026-09-20T12:00:00.000Z';

function makeGoal(overrides: Partial<FinancialGoal> = {}): FinancialGoal {
  return {
    id: 'goal-1', createdAt: timestamp, updatedAt: timestamp, archived: false,
    title: 'Reserva', description: '', targetCents: 10000, initialCents: 2000, deadline: '2026-12-31', accountId: null,
    color: '#0d6b63', icon: '◇', status: 'active', ...overrides,
  };
}

function makeEntry(overrides: Partial<GoalContribution> = {}): GoalContribution {
  return {
    id: 'entry-1', createdAt: timestamp, updatedAt: timestamp, archived: false, goalId: 'goal-1', type: 'contribution',
    amountCents: 3000, date: '2026-09-20', notes: '', accountId: null, ...overrides,
  };
}

describe('regras de metas', () => {
  it('calcula saldo, percentual, restante e separa aportes de retiradas', () => {
    const progress = calculateGoalProgress(makeGoal(), [makeEntry(), makeEntry({ id: 'entry-2', type: 'withdrawal', amountCents: 500 })], '2026-09-20');
    expect(progress.balanceCents).toBe(4500);
    expect(progress.contributedCents).toBe(3000);
    expect(progress.withdrawnCents).toBe(500);
    expect(progress.remainingCents).toBe(5500);
    expect(progress.percentage).toBe(45);
  });

  it('limita a retirada ao saldo atual da meta', () => {
    const goal = makeGoal();
    const entries = [makeEntry()];
    expect(canWithdrawFromGoal(goal, entries, 5000)).toBe(true);
    expect(canWithdrawFromGoal(goal, entries, 5001)).toBe(false);
    expect(canWithdrawFromGoal(goal, entries, 0)).toBe(false);
  });

  it('estima aporte mensal por arredondamento para cima e nunca promete o resultado', () => {
    expect(estimateMonthlyContribution(10001, 3)).toBe(3334);
    expect(estimateMonthlyContribution(1000, null)).toBeNull();
    expect(estimateMonthlyContribution(1000, 3, 'completed')).toBeNull();
    expect(calculateGoalProgress(makeGoal({ initialCents: 10000 }), [], '2026-09-20').estimatedMonthlyContributionCents).toBeNull();
  });

  it('calcula meses do prazo de forma inclusiva e ignora prazo vencido', () => {
    expect(monthsUntilDeadline('2026-09-20', '2026-09-30')).toBe(1);
    expect(monthsUntilDeadline('2026-09-20', '2026-12-01')).toBe(4);
    expect(monthsUntilDeadline('2026-09-20', '2026-08-31')).toBeNull();
  });
});
