/**
 * Duplicate detection for subscriptions (P85).
 *
 * Receipts, Stores, Items and Expenses already have a worked "find duplicates →
 * review → merge" flow; Subscriptions was the last recurring-cost module without one.
 * Real ways the same subscription lands twice: a cancel + re-signup entered under a
 * slightly different name, or two household members (P31 multi-user) each adding the
 * same family plan after the fact.
 *
 * Kept pure and DB-free on purpose — the grouping rule is the whole feature, so it is
 * pinned by tests rather than by whatever happens to be in a live database. Mirrors
 * lib/expenseDupes.ts field-for-field.
 */

export type DupeSubscription = {
  _id: string;
  name: string;
  /** Normalized `name` (vendorKey idiom), the actual grouping signal. */
  nameKey: string;
  amount: number;
  billingCycle: string;
  provider: string;
  category: string;
  currency: string;
  active: boolean;
  paymentMethod: string;
  notes: string;
  url: string;
  splitCount: number;
  hasFx: boolean;
};

export type SubscriptionDupeGroup = { key: string; entries: DupeSubscription[] };

/**
 * Stable signature for "the same subscription": normalized name + amount + billing
 * cycle. Returns '' for anything that must NOT be grouped:
 *
 *  - **no nameKey** — a name that normalizes to nothing has no signal to match on.
 *  - **amount <= 0** — a free/€0 entry carries no cost signal, and grouping every €0
 *    row together would be one giant false-positive cluster.
 *
 * Amount AND cycle are both in the key on purpose: two genuinely different plans of the
 * same provider (e.g. a monthly and a yearly tier, or a €5 and a €15 plan) must never be
 * offered as duplicates of each other — only a true re-entry of the same plan matches.
 */
export function subscriptionDupeKey(
  s: Pick<DupeSubscription, 'nameKey' | 'amount' | 'billingCycle'>
): string {
  const nk = (s.nameKey || '').trim();
  const amount = Number(s.amount) || 0;
  if (!nk || amount <= 0) return '';
  const cycle = (s.billingCycle || '').trim() || 'monthly';
  return `${nk}|${amount.toFixed(2)}|${cycle}`;
}

/**
 * How much a record would cost to lose. Drives which one the UI pre-selects as the
 * survivor. An ACTIVE subscription outweighs everything (the cancelled twin is the stale
 * copy left over from a re-signup), then the fields a human had to fill in.
 */
export function subDupeCompleteness(s: DupeSubscription): number {
  let n = 0;
  if (s.active) n += 8;
  if (s.url) n += 2;
  if (s.provider) n += 2;
  if (s.category && s.category !== 'other') n += 2;
  if (s.splitCount > 0) n += 2;
  if (s.paymentMethod) n += 1;
  if (s.notes) n += 1;
  if (s.hasFx) n += 1;
  return n;
}

/**
 * Cluster likely-duplicate subscriptions. Groups of one are dropped (nothing to merge),
 * the most complete candidate is first inside each group, and the groups themselves come
 * back biggest-and-most-expensive first so the review starts where the money is. Ties
 * break on `_id` so the order is deterministic across calls.
 */
export function groupSubscriptionDupes(rows: DupeSubscription[]): SubscriptionDupeGroup[] {
  const groups = new Map<string, DupeSubscription[]>();
  for (const r of rows) {
    const key = subscriptionDupeKey(r);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  const out: SubscriptionDupeGroup[] = [];
  for (const [key, entries] of groups) {
    if (entries.length < 2) continue;
    entries.sort((a, b) => subDupeCompleteness(b) - subDupeCompleteness(a) || a._id.localeCompare(b._id));
    out.push({ key, entries });
  }
  out.sort(
    (a, b) =>
      b.entries.length - a.entries.length ||
      (b.entries[0]?.amount ?? 0) - (a.entries[0]?.amount ?? 0) ||
      a.key.localeCompare(b.key)
  );
  return out;
}
