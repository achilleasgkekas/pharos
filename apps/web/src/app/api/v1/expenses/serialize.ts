import { iso } from '@/lib/apiList';
import { cleanSplit, type SplitEntry } from '@/lib/split';

/** Lean Expense doc shape as read from Mongo (fields the v1 surface exposes). */
export type ExpenseLean = {
  _id: unknown; kind?: string; vendor?: string; vendorKey?: string; category?: string; space?: string; amount?: number; currency?: string;
  origAmount?: number; fxRate?: number;
  date?: Date; period?: string; recurring?: boolean; recurringCycle?: string; paymentMethod?: string;
  notes?: string; filePath?: string; thumbPath?: string; verified?: boolean; updatedAt?: Date; deletedAt?: Date | null;
  split?: SplitEntry[]; taxDeductible?: boolean; taxCategory?: string;
};

/**
 * Single source of truth for the v1 Expense JSON shape.
 * Shared by GET /api/v1/expenses (list) and POST /api/v1/expenses/:id/rescan
 * so the client's detail view can re-prefill in place from either.
 * `anomaly` (optional ±%) is a cross-doc stat computed by the list route only;
 * single-doc callers (rescan) omit it and it recomputes on the next list load.
 */
export function trimExpense(e: ExpenseLean, anomaly?: number) {
  return {
    id: String(e._id),
    kind: e.kind ?? 'expense',
    vendor: e.vendor ?? '',
    category: e.category ?? 'other',
    space: e.space ?? '',
    // `amount` is always base currency (P9, lib/fx.ts); these two describe what was
    // printed on a foreign-currency document (both 0 for a normal entry).
    amount: e.amount ?? 0,
    currency: e.currency ?? 'EUR',
    origAmount: e.origAmount ?? 0,
    fxRate: e.fxRate ?? 0,
    date: iso(e.date),
    period: e.period ?? '',
    recurring: !!e.recurring,
    recurringCycle: e.recurringCycle ?? '',
    paymentMethod: e.paymentMethod ?? '',
    notes: e.notes ?? '',
    file: e.filePath || null,
    thumb: e.thumbPath || null,
    verified: !!e.verified,
    updatedAt: iso(e.updatedAt),
    deleted: !!e.deletedAt,
    split: Array.isArray(e.split) ? cleanSplit(e.split) : [],
    taxDeductible: !!e.taxDeductible,
    taxCategory: e.taxCategory ?? '',
    ...(anomaly !== undefined ? { anomaly } : {}),
  };
}

/** Coerce a raw JSON-body value (POST/PATCH `split`) into a clean SplitEntry[].
 *  Defensive against non-array input and malformed rows — mirrors the web form's
 *  `cleanSplit` sanitation so a split submitted by an API client matches. */
export function parseSplitField(v: unknown): SplitEntry[] {
  if (!Array.isArray(v)) return [];
  return cleanSplit(
    v.map((r) => {
      const row = (r ?? {}) as Record<string, unknown>;
      return { name: typeof row.name === 'string' ? row.name : '', share: Number(row.share) || 0, settled: !!row.settled };
    })
  );
}

/**
 * Anomaly flags, mirroring the web /expenses view (page.tsx). Within each vendor
 * series (≥3 priced entries) mark entries deviating >30% from the series median,
 * as ±% (rounded). Catches a double bill or a wrong AI parse at a glance. Pure
 * stats, no AI cost. Returns an array aligned to `docs` (undefined where none).
 */
export function computeAnomalies(docs: ExpenseLean[]): (number | undefined)[] {
  const byVendor = new Map<string, number[]>();
  for (const e of docs) {
    if (!e.vendorKey || !(e.amount && e.amount > 0)) continue;
    const arr = byVendor.get(e.vendorKey) ?? [];
    arr.push(e.amount);
    byVendor.set(e.vendorKey, arr);
  }
  const medians = new Map<string, number>();
  for (const [k, arr] of byVendor) {
    if (arr.length < 3) continue;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medians.set(k, sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
  }
  return docs.map((e) => {
    const med = e.vendorKey ? medians.get(e.vendorKey) : undefined;
    if (!med || !(e.amount && e.amount > 0)) return undefined;
    const dev = (e.amount - med) / med;
    return Math.abs(dev) > 0.3 ? Math.round(dev * 100) : undefined;
  });
}
