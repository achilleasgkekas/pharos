import { nextBillDue } from '@/lib/bill';

// Deliberately structural rather than `Model<BillDoc>` from '@/models/Bill': this helper never
// picks a model itself. Callers hand in the one they already scoped with currentModel(), so
// the spawn cannot land in a different tenant DB than the bill that was paid.
type BillStore = {
  findOne(filter: Record<string, unknown>): { lean(): PromiseLike<unknown> };
  create(doc: Record<string, unknown>): Promise<unknown>;
  findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>): PromiseLike<unknown>;
};

// How long a spawn claim holds before another request may take it over. A claim is released in
// `finally`, so this only matters when a process dies mid-spawn; it must comfortably outlast one
// findOne + create round trip, and be short enough that a crashed claim never blocks the user.
const SPAWN_CLAIM_MS = 60_000;

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
};

/**
 * #33 — roll a recurring bill forward to its next pending instance, at most ONCE per bill.
 *
 * Both callers (the web `markBillPaid` action and PATCH /api/v1/bills/:id) used to guard the
 * spawn with "was this bill unpaid before?" alone. Undo only clears paidAt, so "pay → Undo →
 * pay" looked like a first payment twice and left the user with two copies of next month's
 * bill to pay. The successor now records the bill that spawned it (`recurrenceParentId`),
 * and a live successor blocks another spawn.
 *
 * Why skip rather than have Undo delete the successor: the user may already have edited or
 * paid next month's row, and an Undo that silently removes it would lose that work. A skipped
 * spawn loses nothing, since the row it would have created is already there.
 *
 * Successors spawned before this link existed have no `recurrenceParentId`, so the lookup also
 * accepts an unlinked row of the same series (title + cycle) on the exact next due date. The
 * limit of that fallback: two separately entered bills with identical title, cycle and due date
 * would share one successor. That is a duplicate the user entered, not one we create.
 *
 * Trashed successors are invisible to `findOne` (softDeletePlugin), so deleting next month's
 * row and paying again spawns a fresh one, as it should.
 *
 * Concurrency: the lookup and the create are two round trips, so two payments arriving together
 * (double click, web + API) could both see "no successor". The check-then-create therefore runs
 * under a claim taken atomically on the PARENT bill (`recurrenceSpawnClaimAt`, one conditional
 * findOneAndUpdate). The loser of that race reports "not spawned", which is true: the winner is
 * creating the row. Why a claim on the parent rather than a unique index on
 * `recurrenceParentId`: the index would also have to exempt trashed successors (so a re-pay can
 * respawn) and cannot see legacy unlinked successors at all, while the claim serialises the
 * whole decision including both of those lookups.
 *
 * Returns whether a new instance was created.
 */
export async function spawnNextBillOnce(Bill: BillStore, bill: SpawnSource): Promise<boolean> {
  if (!bill.cycle || !bill.dueDate) return false;
  const parentId = String(bill._id);
  const dueDate = nextBillDue(bill.dueDate, bill.cycle);

  const claimedAt = new Date();
  const claimed = await Bill.findOneAndUpdate(
    {
      _id: bill._id,
      $or: [
        { recurrenceSpawnClaimAt: null },
        { recurrenceSpawnClaimAt: { $lt: new Date(claimedAt.getTime() - SPAWN_CLAIM_MS) } },
      ],
    },
    { $set: { recurrenceSpawnClaimAt: claimedAt } },
  );
  if (!claimed) return false;

  try {
    return await spawnUnderClaim(Bill, bill, parentId, dueDate);
  } finally {
    // Release only OUR claim: if it went stale and another request took over, leave theirs.
    await Bill.findOneAndUpdate(
      { _id: bill._id, recurrenceSpawnClaimAt: claimedAt },
      { $set: { recurrenceSpawnClaimAt: null } },
    );
  }
}

async function spawnUnderClaim(Bill: BillStore, bill: SpawnSource, parentId: string, dueDate: Date): Promise<boolean> {
  const existing = await Bill.findOne({
    $or: [
      { recurrenceParentId: parentId },
      { recurrenceParentId: { $in: ['', null] }, title: bill.title, cycle: bill.cycle, dueDate },
    ],
  }).lean();
  if (existing) return false;

  await Bill.create({
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
    archived: false,
    recurrenceParentId: parentId,
  });
  return true;
}
