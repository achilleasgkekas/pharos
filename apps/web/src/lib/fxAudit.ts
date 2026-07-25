// Missing-exchange-rate audit (P9 slice 7).
//
// WHY THIS EXISTS: `resolveFx` deliberately refuses to invent a 1:1 rate, so a foreign
// entry saved without one keeps its PRINTED number in `amount` (see lib/fx.ts). That is
// the honest choice per record, but it means a `$88.00` charge is sitting inside every
// euro total in the app until somebody fills the rate in. Until now the only trace was a
// gold FxBadge on the record itself, so you had to already know which record to open.
// A bank CSV can create dozens of these in one import (`needsRate` in the import result
// counts them, then the number is gone), which is exactly when they are hardest to find.
//
// This module answers "which records still need a rate?" across every money model that
// carries the P9 triple (currency / origAmount / fxRate), so /reports can show the list
// with a deep link straight into each record's edit form.
//
// The query shape and the routing are pure and unit-tested; only `listEntriesNeedingRate`
// touches the database.
import { Expense } from '@/models/Expense';
import { Receipt } from '@/models/Receipt';
import { Item } from '@/models/Item';
import { Subscription } from '@/models/Subscription';
import { Statement } from '@/models/Statement';
import { currentModel } from '@/lib/tenancy/connection';
import { normalizeCurrency } from '@/lib/fx';
import { OWNED_STATUSES } from '@/lib/itemStatus';

export type FxIssueKind = 'expense' | 'income' | 'receipt' | 'item' | 'subscription' | 'statement';

export type FxIssueRow = {
  kind: FxIssueKind;
  id: string;
  /** Human label for the record (vendor / store / item title / card + period). */
  title: string;
  /** Secondary line: the date or period the record belongs to; '' when it has none. */
  subtitle: string;
  /** Printed ISO code, e.g. 'USD'. */
  currency: string;
  /** The printed figure that is currently masquerading as base currency. */
  origAmount: number;
  /** Deep link that opens the record's edit modal (`?open=<id>` convention). */
  href: string;
};

/**
 * Mongo filter for "foreign, has a printed amount, still has no rate".
 *
 * `origAmount > 0` is what keeps ordinary records out: every model defaults `currency` to
 * 'EUR', so a base-currency document written before P9 existed still carries a code, but
 * never a printed amount. `fxRate: null` also matches documents where the field is absent
 * (pre-P9 rows), which `$lte: 0` alone would miss.
 */
export function fxNeedsRateFilter(base: string): Record<string, unknown> {
  const b = normalizeCurrency(base) || 'EUR';
  return {
    currency: { $nin: ['', b] },
    origAmount: { $gt: 0 },
    $or: [{ fxRate: { $lte: 0 } }, { fxRate: null }],
  };
}

/**
 * Where a record's edit modal lives. Not cosmetic: expenses and income are the same model
 * split across two routes by `kind`, and an item opens on /items or /shopping depending on
 * whether it is owned, so a naive single-route link would land on a page that filters the
 * record out and silently open nothing.
 */
export function fxIssueHref(kind: FxIssueKind, id: string): string {
  const route: Record<FxIssueKind, string> = {
    expense: '/expenses',
    income: '/income',
    receipt: '/receipts',
    item: '/items',
    subscription: '/subscriptions',
    statement: '/statements',
  };
  return `${route[kind]}?open=${id}`;
}

/** Owned items live on /items, everything else on /shopping. */
export function itemFxKindRoute(status?: string | null): string {
  return (OWNED_STATUSES as readonly string[]).includes(status || '') ? '/items' : '/shopping';
}

function isoDay(d: unknown): string {
  if (!d) return '';
  const date = new Date(d as string);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

/** Biggest distortion first — a $900 statement matters more than a $4 coffee. */
export function sortFxIssues(rows: FxIssueRow[]): FxIssueRow[] {
  return [...rows].sort((a, b) => b.origAmount - a.origAmount);
}

type Lean = Record<string, unknown>;

/**
 * Every record whose stored amount is still a foreign number. Never throws: a failure here
 * must not take down /reports, so it degrades to an empty list.
 */
export async function listEntriesNeedingRate(base: string, limit = 40): Promise<FxIssueRow[]> {
  try {
    const filter = fxNeedsRateFilter(base);
    const [E, R, I, S, St] = await Promise.all([
      currentModel(Expense),
      currentModel(Receipt),
      currentModel(Item),
      currentModel(Subscription),
      currentModel(Statement),
    ]);

    const [expenses, receipts, items, subs, statements] = await Promise.all([
      E.find(filter).select('kind vendor date period currency origAmount').limit(limit).lean(),
      R.find({ ...filter, archived: { $ne: true } }).select('store date currency origAmount').limit(limit).lean(),
      I.find(filter).select('title status currency origAmount').limit(limit).lean(),
      S.find(filter).select('name provider currency origAmount').limit(limit).lean(),
      St.find(filter).select('card period currency origAmount').limit(limit).lean(),
    ]);

    const rows: FxIssueRow[] = [];

    for (const e of expenses as Lean[]) {
      const kind: FxIssueKind = e.kind === 'income' ? 'income' : 'expense';
      rows.push({
        kind,
        id: String(e._id),
        title: String(e.vendor || '—'),
        subtitle: isoDay(e.date) || String(e.period || ''),
        currency: normalizeCurrency(e.currency as string),
        origAmount: Number(e.origAmount) || 0,
        href: fxIssueHref(kind, String(e._id)),
      });
    }

    for (const r of receipts as Lean[]) {
      rows.push({
        kind: 'receipt',
        id: String(r._id),
        title: String(r.store || '—'),
        subtitle: isoDay(r.date),
        currency: normalizeCurrency(r.currency as string),
        origAmount: Number(r.origAmount) || 0,
        href: fxIssueHref('receipt', String(r._id)),
      });
    }

    for (const i of items as Lean[]) {
      rows.push({
        kind: 'item',
        id: String(i._id),
        title: String(i.title || '—'),
        subtitle: String(i.status || ''),
        currency: normalizeCurrency(i.currency as string),
        origAmount: Number(i.origAmount) || 0,
        // Owned vs shopping live on different routes (see itemFxKindRoute).
        href: `${itemFxKindRoute(i.status as string)}?open=${String(i._id)}`,
      });
    }

    for (const s of subs as Lean[]) {
      rows.push({
        kind: 'subscription',
        id: String(s._id),
        title: String(s.name || s.provider || '—'),
        subtitle: String(s.provider || ''),
        currency: normalizeCurrency(s.currency as string),
        origAmount: Number(s.origAmount) || 0,
        href: fxIssueHref('subscription', String(s._id)),
      });
    }

    for (const st of statements as Lean[]) {
      rows.push({
        kind: 'statement',
        id: String(st._id),
        title: String(st.card || '—'),
        subtitle: String(st.period || ''),
        currency: normalizeCurrency(st.currency as string),
        origAmount: Number(st.origAmount) || 0,
        href: fxIssueHref('statement', String(st._id)),
      });
    }

    return sortFxIssues(rows).slice(0, limit);
  } catch {
    return [];
  }
}
