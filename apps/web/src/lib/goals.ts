// P12 — pure, DB-free helpers for savings / financial goals. `current` is always
// derived from contributions (never stored), so progress can never drift out of
// sync with the ledger. Mirrors the derive-on-read pattern used by lib/bill.ts.

export type GoalContribution = { amount: number };

export type GoalLike = {
  targetAmount: number;
  targetDate?: string | Date | null;
  contributions?: GoalContribution[];
};

export type GoalProgress = {
  current: number;
  target: number;
  remaining: number;
  pct: number; // 0-100, one decimal
  done: boolean;
  monthsLeft: number | null; // null when no targetDate
  perMonth: number | null; // € still needed per month to hit the deadline; null when no targetDate
};

const AVG_DAYS_PER_MONTH = 30.44;

/** Σ(contributions.amount), floored at 0 (a goal's saved amount can't go negative). */
export function goalCurrent(g: GoalLike): number {
  const sum = (g.contributions ?? []).reduce((s, c) => s + (c.amount || 0), 0);
  return Math.max(0, sum);
}

/** Derived progress toward a goal, as of `now`. */
export function goalProgress(g: GoalLike, now: number = Date.now()): GoalProgress {
  const current = goalCurrent(g);
  const target = Math.max(0, g.targetAmount || 0);
  const remaining = Math.max(0, target - current);
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 1000) / 10) : 0;
  const done = target > 0 && current >= target;

  let monthsLeft: number | null = null;
  let perMonth: number | null = null;
  if (g.targetDate) {
    const t = new Date(g.targetDate).getTime();
    if (!Number.isNaN(t)) {
      const daysLeft = (t - now) / 86400000;
      monthsLeft = Math.max(0, Math.round((daysLeft / AVG_DAYS_PER_MONTH) * 10) / 10);
      if (!done) perMonth = monthsLeft > 0 ? remaining / monthsLeft : remaining; // overdue → all of it, now
    }
  }
  return { current, target, remaining, pct, done, monthsLeft, perMonth };
}
