import { createHash } from 'node:crypto';
import { nextBillDue } from '@/lib/bill';

// Deliberately structural rather than `Model<BillDoc>` from '@/models/Bill': this helper never
// picks a model itself. Callers hand in the one they already scoped with currentModel(), so
// the spawn cannot land in a different tenant DB than the bill that was paid.
type BillStore = {
  findOne(filter: Record<string, unknown>): { lean(): PromiseLike<unknown> };
  create(doc: Record<string, unknown>): Promise<unknown>;
  replaceOne(
    filter: Record<string, unknown>,
    doc: Record<string, unknown>,
  ): { setOptions(opts: Record<string, unknown>): PromiseLike<{ modifiedCount?: number }> };
};

type SpawnSource = {
  _id: unknown;
  title: string;
  vendor?: string | null;
  amount: number;
  currency?: string | null;
  origAmount?: number | null;
  fxRate?: number | null;
  dueDate: Date | string | null;
  category?: string | null;
  cycle?: string | null;
  notes?: string | null;
  space?: string | null;
};

/**
 * The one _id a bill's successor may ever have: 24 hex chars derived from the parent's _id.
 * Two ids per bill are impossible by construction, so Mongo's always-present unique `_id`
 * index is what enforces "at most one successor", not a lookup we could race past.
 */
export function successorBillId(parentId: unknown): string {
  return createHash('sha256').update(`bill-successor:${String(parentId)}`).digest('hex').slice(0, 24);
}

const isDuplicateKey = (err: unknown): boolean => (err as { code?: number } | null)?.code === 11000;

/**
 * #33 — roll a recurring bill forward to its next pending instance, at most ONCE per bill.
 *
 * Both callers (the web `markBillPaid` action and PATCH /api/v1/bills/:id) used to guard the
 * spawn with "was this bill unpaid before?" alone. Undo only clears paidAt, so "pay → Undo →
 * pay" looked like a first payment twice and left the user with two copies of next month's
 * bill to pay.
 *
 * Why a deterministic _id rather than a lookup, a claim or a unique index on a link field: a
 * lookup then create races (double click, web + API); a claim on the parent needs a lease, and
 * an orphaned or overrun lease either skips the spawn for good or lets two through (both were
 * found in review of the claim version). The `_id` index needs no lease, covers every process
 * and survives crashes: a second create simply fails with a duplicate key.
 *
 * Callers must spawn BEFORE persisting paidAt. The spawn is idempotent, so if the payment write
 * then fails the retry finds the successor already there; the reverse order could leave a paid
 * bill whose "wasPaid" guard blocks the spawn forever.
 *
 * Why skip rather than have Undo delete the successor: the user may already have edited or
 * paid next month's row, and an Undo that silently removes it would lose that work.
 *
 * A trashed successor still owns its _id, so re-paying after trashing next month's row
 * replaces the trashed document with a fresh pending one (atomically, only while it is still
 * trashed). That keeps the pre-#33 behaviour of "delete next month, pay again, get it back".
 *
 * Successors spawned before #33 have random ids and no link, and no migration can recover a
 * link that was never written, so they are recognised heuristically (legacySuccessorFilter).
 * The remaining limit is a legacy successor whose copied identity fields changed, or whose title
 * AND due date were both edited: re-paying
 * its pre-#33 parent after an Undo still adds one visible extra row. That window only closes
 * for series paid before this shipped; every successor spawned since is linked by its _id.
 *
 * Returns whether a new instance was created.
 */
export async function spawnNextBillOnce(Bill: BillStore, bill: SpawnSource): Promise<boolean> {
  if (!bill.cycle || !bill.dueDate) return false;
  const parentId = String(bill._id);
  const dueDate = nextBillDue(bill.dueDate, bill.cycle);

  const legacy = await Bill.findOne(legacySuccessorFilter(bill, dueDate)).lean();
  if (legacy) return false;

  const _id = successorBillId(parentId);
  const doc = {
    _id,
    title: bill.title,
    vendor: bill.vendor,
    amount: bill.amount,
    // P9: the next instance inherits the currency AND the last known rate, deliberately.
    // The spawned bill is a projection of a charge that has not arrived yet, so carrying
    // the rate keeps `amount` base-denominated (an estimate the totals can sum) instead of
    // dropping a rate-less foreign row into every "needs an exchange rate" audit each cycle.
    // The user corrects both figures when the real bill lands.
    currency: bill.currency,
    origAmount: bill.origAmount,
    fxRate: bill.fxRate,
    dueDate,
    paidAt: null,
    category: bill.category,
    cycle: bill.cycle,
    notes: bill.notes,
    space: bill.space || '', // #14: next month's ΔΕΗ bill is still the summer house's
    archived: false,
    recurrenceParentId: parentId,
    deletedAt: null,
  };

  try {
    await Bill.create(doc);
    return true;
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
  }
  // The id is taken: either a live successor (done, nothing to create) or a trashed one.
  const res = await Bill.replaceOne({ _id, deletedAt: { $ne: null } }, doc).setOptions({ withDeleted: true });
  return (res.modifiedCount ?? 0) > 0;
}

/**
 * Matches a pre-#33 (unlinked) successor of `bill` even after the user edited it, by what they
 * are unlikely to change all at once. Both branches require the copied identity fields to match;
 * a shared title alone must never suppress another vendor or household's recurrence. Either the
 * title survived and the due date moved anywhere
 * inside the next cycle, or the exact next due date survived along with every other field the
 * spawn copied, so only the title was corrected.
 *
 * Both branches stay inside one cycle on purpose. A manually entered bill is also unlinked, so a
 * wider net (say "same vendor, any date") would let an unrelated bill silently suppress a real
 * successor on every ordinary payment, and a missing bill is worse than a visible duplicate.
 */
export function legacySuccessorFilter(bill: SpawnSource, nextDue: Date): Record<string, unknown> {
  const copied: Record<string, unknown> = { amount: bill.amount };
  // Match absent values explicitly: undefined filters are dropped by Mongoose and would
  // turn an absent vendor/currency on the parent into a wildcard for unrelated bills.
  for (const k of ['vendor', 'currency', 'category', 'notes'] as const) {
    copied[k] = bill[k] ?? null;
  }
  return {
    recurrenceParentId: { $in: ['', null] },
    cycle: bill.cycle,
    ...copied,
    $or: [
      { title: bill.title, dueDate: { $gt: new Date(bill.dueDate as Date | string), $lt: nextBillDue(nextDue, bill.cycle as string) } },
      { dueDate: nextDue },
    ],
  };
}
