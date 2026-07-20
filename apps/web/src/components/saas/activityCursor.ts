// PURE keyset-pagination helpers for the Activity trail views ((saas)/account/workspace/activity
// and admin/tenants/[slug]). Both pages read the same append-only AuditEvent collection, newest
// first, bounded by a fixed page size — this module is the "Load more" plumbing shared by both:
// a URL-safe cursor encoding, a Mongo filter fragment for "strictly before this cursor" (correct
// under createdAt ties, unlike a naive `createdAt: { $lt }` alone), and a page-splitting helper
// that turns a `limit+1`-sized fetch into `{ items, hasMore }` without a second count query. Kept
// pure (no DB, no next/*, no React) so the cursor math is unit-testable in isolation from Mongo.
// Only meaningful in SAAS_MODE; the self-hosted app never records or shows audit events.

/** A resume point: the last row already shown, identified by its (createdAt, _id) pair. Using
 *  both (not createdAt alone) makes the cursor exact even when several events share the same
 *  millisecond — a real possibility for a burst of automated actions. */
export type ActivityCursor = { createdAt: string; id: string };

// AuditEvent._id is a standard Mongo ObjectId (24 hex chars). Validated here so a malformed or
// tampered `?before=` query param can never reach the database as part of a query filter.
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

/** Serialize a cursor into the single opaque string carried by the `before` query param. */
export function encodeActivityCursor(cursor: ActivityCursor): string {
  return `${cursor.createdAt}~${cursor.id}`;
}

/** Parse a `before` query param back into a cursor. Any malformed input (missing separator,
 *  non-ObjectId id, unparseable date) is treated as "no cursor" rather than thrown — a stray or
 *  tampered query string just shows the first page, mirroring parseAuditAction's leniency. */
export function decodeActivityCursor(raw: unknown): ActivityCursor | null {
  if (typeof raw !== 'string' || !raw) return null;
  const sep = raw.indexOf('~');
  if (sep === -1) return null;
  const createdAt = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if (!OBJECT_ID_RE.test(id)) return null;
  if (Number.isNaN(Date.parse(createdAt))) return null;
  return { createdAt, id };
}

/** The cursor for "everything strictly older than this row" — build the next "Load more" link's
 *  `before` param from the last row of the current page. Null when the row has no createdAt
 *  (never true for a real audit row; keeps this total rather than throwing on odd input). */
export function cursorAfterRow(row: { id: string; createdAt: string | null }): ActivityCursor | null {
  if (!row.createdAt) return null;
  return { createdAt: row.createdAt, id: row.id };
}

/**
 * Mongo filter fragment for "strictly before this cursor", to be spread alongside a query
 * already scoped by tenant (+ optional action). Pairs with a `{ createdAt: -1, _id: -1 }` sort:
 * the `$or` is the standard keyset-pagination shape that stays correct when several rows share
 * the same createdAt millisecond (a plain `createdAt: { $lt }` would silently skip or repeat
 * rows in that case).
 */
export function cursorFilter(cursor: ActivityCursor): Record<string, unknown> {
  const createdAt = new Date(cursor.createdAt);
  return {
    $or: [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: cursor.id } }],
  };
}

/**
 * Split a `limit + 1`-sized fetch into the page to show plus whether more rows exist beyond it
 * — avoids a separate `countDocuments` just to know whether to render "Load more". PURE, works
 * on any array (not audit-specific).
 */
export function splitPage<T>(items: readonly T[], limit: number): { items: T[]; hasMore: boolean } {
  if (items.length > limit) return { items: items.slice(0, limit), hasMore: true };
  return { items: [...items], hasMore: false };
}
