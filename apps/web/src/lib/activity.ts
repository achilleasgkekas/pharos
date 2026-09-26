// P89 (#23) — the household activity feed: who added or trashed what, newest first.
//
// No new collection and no audit log: every event is read back from the records themselves,
// through the `createdBy` / `deletedBy` stamps of lib/createdBy.ts. That keeps it free (nothing
// extra is written on any request) and honest about its limits: it knows "added" and "moved to
// Trash", not edits, and only for records created after attribution existed.

export type ActivityKind = 'added' | 'deleted';

export type ActivityType =
  | 'item' | 'expense' | 'income' | 'receipt' | 'bill' | 'subscription' | 'voucher' | 'document'
  | 'task' | 'goal' | 'specialDate' | 'vehicle' | 'vehicleLog' | 'meterReading' | 'shoppingListItem';

export type ActivityEvent = {
  kind: ActivityKind;
  type: ActivityType;
  id: string;
  title: string;
  userId: string;
  at: string; // ISO
  /** Where the record lives. Null for a trashed record: the page would not show it. */
  href: string | null;
};

/** How many events the feed shows. The backlog's builder default: "the last ~100". */
export const ACTIVITY_LIMIT = 100;

/**
 * Merge the per-collection event lists into one feed: newest first, capped, and without two
 * events for the same record and kind (a record trashed and restored and trashed again is one
 * "deleted" line, at its latest time).
 */
export function mergeActivity(lists: ActivityEvent[][], limit = ACTIVITY_LIMIT): ActivityEvent[] {
  const seen = new Set<string>();
  return lists
    .flat()
    .filter((e) => e.userId && !Number.isNaN(Date.parse(e.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .filter((e) => {
      const key = `${e.kind}:${e.type}:${e.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
