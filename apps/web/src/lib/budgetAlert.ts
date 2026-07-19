// Deterministic "did this month's spend cross a category budget" check for
// runAlertChecks / the budget.exceeded webhook event (P24). No AI, no rollover/
// envelope-mode math (that lives in lib/budgetRollover.ts for the Reports page) —
// this is the simple flat-budget signal an outbound alert can act on immediately.
// Pure + framework-free so it unit-tests without a DB (the caller feeds it lean
// Expense rows already scoped to the tenant).

export type BudgetAlertRow = {
  category?: string | null;
  amount?: number | null;
  date?: string | Date | null;
  kind?: string | null; // 'income' rows are ignored
};

export type BudgetExceeded = {
  category: string;
  budget: number;
  actual: number;
  /** Integer percent of budget spent (e.g. 132 = 32% over). */
  pct: number;
};

/** Parse a row date to a `YYYY-MM` key, or null when it is not a valid date. */
function monthKeyOf(d: string | Date | null | undefined): string | null {
  if (d == null) return null;
  const t = d instanceof Date ? d : new Date(d);
  if (isNaN(t.getTime())) return null;
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Sum expense rows (excluding income) by category for `monthKey`, and return the
 * budgeted categories whose actual spend now exceeds their budget, worst-first.
 * A budget of 0 or less is treated as "no budget set" and never fires.
 */
export function detectBudgetExceeded(
  rows: BudgetAlertRow[] | null | undefined,
  budgets: Record<string, number> | null | undefined,
  monthKey: string,
): BudgetExceeded[] {
  const byCat = new Map<string, number>();
  for (const r of rows ?? []) {
    if (r.kind === 'income') continue;
    const amount = Number(r.amount ?? 0);
    if (!(amount > 0)) continue;
    if (monthKeyOf(r.date) !== monthKey) continue;
    const cat = (r.category || '').trim();
    if (!cat) continue;
    byCat.set(cat, (byCat.get(cat) ?? 0) + amount);
  }

  const out: BudgetExceeded[] = [];
  for (const [category, rawBudget] of Object.entries(budgets ?? {})) {
    const budget = Number(rawBudget ?? 0);
    if (!(budget > 0)) continue;
    const actual = byCat.get(category) ?? 0;
    if (actual > budget) {
      out.push({ category, budget: Math.round(budget), actual: Math.round(actual), pct: Math.round((actual / budget) * 100) });
    }
  }
  out.sort((a, b) => b.pct - a.pct);
  return out;
}
