import { iso } from '@/lib/apiList';
import { goalProgress } from '@/lib/goals';

export type GoalContributionLean = { _id: unknown; amount: number; date?: Date | null; note?: string };
export type GoalLean = {
  _id: unknown; title: string; targetAmount: number; targetDate?: Date | null; category?: string;
  notes?: string; archived?: boolean; contributions?: GoalContributionLean[];
  updatedAt?: Date; deletedAt?: Date | null;
};

/** Single source of truth for the v1 Goal JSON shape (list, POST, PATCH). `current`/`remaining`/
 *  `pct`/`done`/`monthsLeft`/`perMonth` are the same derived values the web ReportsClient computes
 *  client-side (lib/goals.ts, never stored) — computed here so API clients never have to
 *  reimplement the progress math.
 *
 *  Lives in its own module (not route.ts) — see giftcards/serialize.ts's doc comment for why. */
export function trim(g: GoalLean): {
  id: string; title: string; targetAmount: number; targetDate: string | null; category: string;
  notes: string; archived: boolean; current: number; remaining: number; pct: number; done: boolean;
  monthsLeft: number | null; perMonth: number | null;
  contributions: Array<{ id: string; amount: number; date: string | null; note: string }>;
  updatedAt: string | null; deleted: boolean;
} {
  const contributions = g.contributions ?? [];
  const progress = goalProgress({ targetAmount: g.targetAmount ?? 0, targetDate: g.targetDate ?? null, contributions });
  return {
    id: String(g._id), title: g.title, targetAmount: g.targetAmount ?? 0, targetDate: iso(g.targetDate ?? null),
    category: g.category ?? '', notes: g.notes ?? '', archived: !!g.archived,
    current: progress.current, remaining: progress.remaining, pct: progress.pct, done: progress.done,
    monthsLeft: progress.monthsLeft, perMonth: progress.perMonth,
    contributions: contributions.map((c) => ({ id: String(c._id), amount: c.amount, date: iso(c.date ?? null), note: c.note ?? '' })),
    updatedAt: iso(g.updatedAt), deleted: !!g.deletedAt,
  };
}
