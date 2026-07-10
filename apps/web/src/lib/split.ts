// P35 — pure, DB-free helpers for expense splitting ("who owes what", Splitwise-lite).
// Convention: YOU (the app owner) paid the expense total. Each SplitEntry is ANOTHER
// person (a free-form name, not an app account) who owes you their `share`. `settled`
// means they have paid you back. Your own portion is implicit (total − Σ shares).
// Kept isolated so it can be unit-tested and reused by the client form, the balances
// view, and the server actions without pulling Mongoose.

export type SplitEntry = { name: string; share: number; settled: boolean };

/** Round to cents. */
function r2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Equal split of `total` among the given other-people `names`, optionally including
 * yourself as an equal participant. Returns one SplitEntry per (trimmed, non-empty)
 * name with their share.
 *
 * - includeSelf=false: the whole total is divided among the names; any leftover cent is
 *   distributed to the first entries so the shares sum EXACTLY to `total`.
 * - includeSelf=true: each name pays total/(names+1); YOU keep the remainder implicitly
 *   (total − Σ shares), so you eat the rounding cent.
 */
export function equalSplit(total: number, names: string[], includeSelf: boolean): SplitEntry[] {
  const clean = (names || []).map((n) => (n || '').trim()).filter(Boolean);
  if (clean.length === 0) return [];
  const gross = Math.max(0, Math.round((Number(total) || 0) * 100)); // cents
  const parts = includeSelf ? clean.length + 1 : clean.length;
  const baseCents = Math.floor(gross / parts);

  if (includeSelf) {
    // Others each pay the floor share; you absorb the leftover cents.
    const share = baseCents / 100;
    return clean.map((name) => ({ name, share, settled: false }));
  }

  // No self: hand the leftover cents to the first entries so the split is exact.
  let remainder = gross - baseCents * parts;
  return clean.map((name) => {
    const cents = baseCents + (remainder-- > 0 ? 1 : 0);
    return { name, share: cents / 100, settled: false };
  });
}

/** Per-expense totals: how much is still owed to you vs already settled. */
export function splitTotals(split: SplitEntry[] = []): { owed: number; settled: number; count: number } {
  let owed = 0;
  let settled = 0;
  for (const s of split) {
    if (s?.settled) settled += Number(s.share) || 0;
    else owed += Number(s?.share) || 0;
  }
  return { owed: r2(owed), settled: r2(settled), count: split.length };
}

export type PersonBalance = { name: string; owed: number; settled: number; entries: number };

/**
 * Aggregate split entries across many expenses into a per-person balance sheet.
 * Names are matched case-insensitively (display uses the first-seen casing). Sorted
 * by outstanding `owed` (largest debtor first), then by name.
 */
export function computeBalances(expenses: Array<{ split?: SplitEntry[] | null }>): PersonBalance[] {
  const m = new Map<string, PersonBalance>();
  for (const e of expenses || []) {
    for (const s of e?.split ?? []) {
      const name = (s?.name || '').trim();
      const key = name.toLowerCase();
      if (!key) continue;
      const cur = m.get(key) ?? { name, owed: 0, settled: 0, entries: 0 };
      if (s.settled) cur.settled += Number(s.share) || 0;
      else cur.owed += Number(s.share) || 0;
      cur.entries += 1;
      m.set(key, cur);
    }
  }
  return [...m.values()]
    .map((b) => ({ ...b, owed: r2(b.owed), settled: r2(b.settled) }))
    .sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));
}

/** Total still owed to you across everyone (for a header badge). */
export function totalOwed(expenses: Array<{ split?: SplitEntry[] | null }>): number {
  return r2(computeBalances(expenses).reduce((s, b) => s + b.owed, 0));
}
