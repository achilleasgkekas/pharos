import type { Baseline, Lever, MonthTotals, Obligation, ProjectedMonth } from '@/lib/savingsPlan';

// Shared shape between the Save page (which measures it) and its client (which asks
// questions of it). In its own module rather than exported from page.tsx: a route file
// is checked against the set of exports Next expects a page to have.

export type SavingsGoal = {
  _id: string;
  title: string;
  target: number;
  saved: number;
  targetDate: string | null;
};

export type SavingsData = {
  /** What a normal month looks like, measured from the ledger. */
  baseline: Baseline;
  /** Month-by-month balance from today to the horizon. */
  projection: ProjectedMonth[];
  startBalance: number;
  /** Whether any account balance is on file at all — a forecast from 0 needs saying so. */
  hasAccounts: boolean;
  /** Commitments inside the baseline that run out, with when. */
  obligations: Obligation[];
  /** What could be cut to close a gap, dearest first. */
  levers: Lever[];
  goals: SavingsGoal[];
  /** The months the baseline was measured from, for the "what you actually do" chart. */
  history: MonthTotals[];
};
