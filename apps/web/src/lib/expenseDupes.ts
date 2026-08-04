/**
 * Duplicate detection for expenses/income (P46).
 *
 * Receipts, Stores and Items already have a worked "find duplicates → review → merge"
 * flow; Expenses never got one, even though it is the module with the most import
 * paths into it. Real ways the same bill lands twice: a CSV export re-imported after
 * the mapping was fixed, the email-in inbox picking up a bill that was also scanned by
 * hand, `generateDueRecurring` seeding a period the user had already entered, or simply
 * dropping the same PDF on the page twice.
 *
 * Kept pure and DB-free on purpose: the grouping rule is the whole feature, so it is
 * pinned by tests rather than by whatever happens to be in a live database.
 */

export type DupeExpense = {
  _id: string;
  kind: 'income' | 'expense';
  vendor: string;
  vendorKey: string;
  category: string;
  amount: number;
  currency: string;
  date: string;
  verified: boolean;
  recurring: boolean;
  hasFile: boolean;
  notes: string;
  paymentMethod: string;
  space: string;
  taxCategory: string;
  splitCount: number;
  aiModel: string;
};

export type ExpenseDupeGroup = { key: string; entries: DupeExpense[] };

/**
 * Stable signature for "the same money movement": kind + normalized vendor + calendar
 * day + amount. Returns '' for anything that must NOT be grouped, and the three reasons
 * are all deliberate:
 *
 *  - **no vendorKey** — without a vendor the only signal left is "same day, same amount",
 *    which describes plenty of legitimately separate entries (two fuel stops, two coffees).
 *    Grouping those would train the user to click merge on false positives.
 *  - **amount <= 0** — empty drafts (a scan whose AI parse failed leaves amount 0) would
 *    otherwise all collapse into one giant bogus group, exactly the failure the Receipts
 *    version avoids with its `total > 0` filter.
 *  - **unparseable date** — a record with no usable date has no day to match on.
 *
 * `kind` is part of the key so an income and an expense that happen to share a vendor,
 * a day and an amount (a refund against a charge) are never offered as duplicates.
 */
export function expenseDupeKey(e: Pick<DupeExpense, 'kind' | 'vendorKey' | 'amount' | 'date'>): string {
  const vk = (e.vendorKey || '').trim();
  const amount = Number(e.amount) || 0;
  if (!vk || amount <= 0) return '';
  const d = e.date ? new Date(e.date) : null;
  if (!d || isNaN(d.getTime())) return '';
  const day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  return `${e.kind}|${vk}|${day}|${amount.toFixed(2)}`;
}

/**
 * How much a record would cost to lose. Drives which one the UI pre-selects as the
 * survivor, so the default merge keeps the richest record and the user only has to
 * intervene when they disagree. Verified beats everything (a human already confirmed
 * it), then having the source document, then the fields a human had to type.
 */
export function dupeCompleteness(e: DupeExpense): number {
  let n = 0;
  if (e.verified) n += 8;
  if (e.hasFile) n += 4;
  if (e.category && e.category !== 'other') n += 2;
  if (e.splitCount > 0) n += 2;
  if (e.recurring) n += 1;
  if (e.paymentMethod) n += 1;
  if (e.taxCategory) n += 1;
  if (e.space) n += 1;
  if (e.notes) n += 1;
  return n;
}

/**
 * Cluster likely-duplicate records. Groups of one are dropped (nothing to merge), the
 * most complete candidate is first inside each group, and the groups themselves come
 * back biggest-and-most-expensive first so the review starts where the money is.
 * Ties break on `_id` so the order is deterministic across calls.
 */
export function groupExpenseDupes(rows: DupeExpense[]): ExpenseDupeGroup[] {
  const groups = new Map<string, DupeExpense[]>();
  for (const r of rows) {
    const key = expenseDupeKey(r);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  const out: ExpenseDupeGroup[] = [];
  for (const [key, entries] of groups) {
    if (entries.length < 2) continue;
    entries.sort((a, b) => dupeCompleteness(b) - dupeCompleteness(a) || a._id.localeCompare(b._id));
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
