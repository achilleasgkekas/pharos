/**
 * P44 — warranty claim / RMA records on an Item.
 *
 * Why this exists: warranty tracking stops at `warrantyUntil`, which answers exactly one
 * question ("how long do I still have cover?") and goes quiet the moment the thing
 * actually breaks. What follows is a PROCESS that runs for weeks — you report the fault,
 * the shop gives you a ticket number, the box travels, and one day it comes back repaired,
 * replaced, refunded or refused. Today that lives in an inbox, not in the app.
 *
 * Distinct from the warranty-expiry alert (a warning BEFORE the cover ends), from P38
 * (insurance premiums you pay, not claims on a product) and from P47 (a thing lent to a
 * person, which is still yours and still on your shelf in every sense that counts).
 *
 * Shape: an embedded array on the item, the builder default in the backlog, and the same
 * pattern as `customFields` (P70) and `attachments` (P21). A claim is meaningless without
 * the thing it is about, it is read exactly when the item is read, and it dies with it —
 * which is what an embedded subdoc is for. Several claims per item on purpose: an
 * expensive machine can go back twice, and the first RMA is part of its history.
 *
 * Everything here is pure and DB-free, so the card pill, the detail panel and the stale
 * nudge that comes next all derive from the stored fields and cannot drift apart.
 */

/** The five outcomes an RMA can be in, the enum from the backlog's builder default. */
export const CLAIM_STATUSES = ['submitted', 'in-repair', 'replaced', 'refunded', 'rejected'] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/** Statuses where a claim is still RUNNING — something is owed to you and nothing has
 *  arrived yet. The other three are endings: the thing came back, the money came back, or
 *  you were told no. Only the running ones are worth a pill, a colour or a nudge. */
export const OPEN_CLAIM_STATUSES: readonly ClaimStatus[] = ['submitted', 'in-repair'];

/** Item statuses where an RMA is meaningful: things you own and can still send back.
 *  `broken` is deliberately IN (it is the usual reason a claim exists at all) and `sold`
 *  is deliberately OUT — once it is somebody else's machine, the claim is theirs too. */
export const CLAIM_STATUSES_APPLY_TO = ['received', 'installed', 'broken'] as const;

export function warrantyClaimsApply(status: string | null | undefined): boolean {
  return (CLAIM_STATUSES_APPLY_TO as readonly string[]).includes(String(status ?? ''));
}

export type WarrantyClaim = {
  /** RMA / ticket number from the shop or the manufacturer. Free string, often EMPTY at
   *  the start: you report a fault first and the number is emailed to you afterwards. */
  ref: string;
  status: ClaimStatus;
  /** The day the fault was reported. The anchor of the whole record — see below. */
  reportedAt: string | null;
  /** Last time anything actually happened on the claim. Null = nothing since it opened,
   *  so the age of the claim counts from `reportedAt` instead. */
  lastUpdateAt: string | null;
  /** Courier tracking for the leg where the thing is in transit. Plain string, same as
   *  the P72 parcel field: no carrier API, no polling. */
  trackingNumber: string;
  notes: string;
};

export const MAX_WARRANTY_CLAIMS = 20;
export const MAX_CLAIM_REF_LENGTH = 60;
export const MAX_CLAIM_TRACKING_LENGTH = 60;
export const MAX_CLAIM_NOTES_LENGTH = 1000;

/** Days without any movement before an open claim counts as forgotten. Two weeks: long
 *  enough that a normal repair is not nagged about, short enough that a claim nobody ever
 *  answered surfaces while the warranty is still alive. */
export const DEFAULT_STALE_CLAIM_DAYS = 14;

function toIsoDay(raw: unknown): string | null {
  if (!raw) return null;
  const d = new Date(raw as string | Date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Anything unrecognised becomes `submitted`, the state every claim starts in. A row is
 *  never dropped over a bad status: the claim is real, only the label was garbled. */
export function normalizeClaimStatus(raw: unknown): ClaimStatus {
  const s = String(raw ?? '').trim().toLowerCase();
  return (CLAIM_STATUSES as readonly string[]).includes(s) ? (s as ClaimStatus) : 'submitted';
}

/**
 * Clean a raw list into what is safe to store.
 *
 *  - `reportedAt` is REQUIRED and an entry without a usable one is dropped. A claim is a
 *    process that starts on a day; with no start date there is no age, no staleness and
 *    nothing to show, so such a row is an empty form line, not a record. The editor
 *    pre-fills today, so this never costs the user a keystroke.
 *  - `ref` stays optional. Requiring it would drop precisely the claim you have just
 *    opened, which is the one worth tracking.
 *  - Duplicate non-empty refs collapse to the FIRST (case-insensitively): the same ticket
 *    twice is a double-typed row, not two returns. Blank refs never collide, because
 *    several not-yet-numbered claims are a real state.
 *  - `lastUpdateAt` EARLIER than `reportedAt` is discarded rather than kept: a claim
 *    cannot have moved before it existed, and keeping it would make the thing look stale
 *    the day it opened.
 *  - Strings are trimmed and truncated rather than rejected, so a pasted email still saves
 *    the part that matters instead of failing the whole form.
 */
export function normalizeWarrantyClaims(raw: unknown): WarrantyClaim[] {
  if (!Array.isArray(raw)) return [];
  const out: WarrantyClaim[] = [];
  const seenRefs = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const reportedAt = toIsoDay(e.reportedAt);
    if (!reportedAt) continue;
    const ref = String(e.ref ?? '').trim().slice(0, MAX_CLAIM_REF_LENGTH);
    if (ref) {
      const dedupe = ref.toLowerCase();
      if (seenRefs.has(dedupe)) continue;
      seenRefs.add(dedupe);
    }
    const lastUpdateAt = toIsoDay(e.lastUpdateAt);
    out.push({
      ref,
      status: normalizeClaimStatus(e.status),
      reportedAt,
      lastUpdateAt: lastUpdateAt && lastUpdateAt >= reportedAt ? lastUpdateAt : null,
      trackingNumber: String(e.trackingNumber ?? '').trim().slice(0, MAX_CLAIM_TRACKING_LENGTH),
      notes: String(e.notes ?? '').trim().slice(0, MAX_CLAIM_NOTES_LENGTH),
    });
    if (out.length >= MAX_WARRANTY_CLAIMS) break;
  }
  return out;
}

/** Form transport: the editor posts a JSON array, same as the links and custom-field
 *  editors. Unparseable input is an empty list, never a thrown form submission. */
export function parseWarrantyClaims(json: string): WarrantyClaim[] {
  try {
    return normalizeWarrantyClaims(JSON.parse(json));
  } catch {
    return [];
  }
}

export function claimIsOpen(status: string | null | undefined): boolean {
  return OPEN_CLAIM_STATUSES.includes(normalizeClaimStatus(status));
}

/** Claims still running, newest report first. The order matters: the panel shows the
 *  freshest one at the top, which is the one you are actually waiting on. */
export function openClaims(claims: WarrantyClaim[] | null | undefined): WarrantyClaim[] {
  if (!claims?.length) return [];
  return claims
    .filter((c) => claimIsOpen(c.status))
    .sort((a, b) => String(b.reportedAt ?? '').localeCompare(String(a.reportedAt ?? '')));
}

/** The one claim a card pill can name. Null for every item that has never been sent back,
 *  which is every pre-P44 record. The item status is re-checked here so a claim left on a
 *  thing you have since sold stops shouting from the list. */
export function activeClaim(
  status: string | null | undefined,
  claims: WarrantyClaim[] | null | undefined
): WarrantyClaim | null {
  if (!warrantyClaimsApply(status)) return null;
  return openClaims(claims)[0] ?? null;
}

/**
 * How many whole days the claim has sat without movement, counting from the last update
 * or, when there has never been one, from the day it was reported. Null once the claim is
 * closed: a finished RMA cannot go stale, and its age is history, not a problem.
 */
export function claimDaysSinceUpdate(
  claim: WarrantyClaim | null | undefined,
  now: number = Date.now()
): number | null {
  if (!claim || !claimIsOpen(claim.status)) return null;
  const since = claim.lastUpdateAt ?? claim.reportedAt;
  if (!since) return null;
  const from = new Date(since);
  if (Number.isNaN(from.getTime())) return null;
  return Math.max(0, Math.floor((now - from.getTime()) / 86400000));
}

/** An open claim nobody has touched for `staleDays`. The rule the nudge will read, kept
 *  here so the panel warns about exactly what the alert will later warn about. */
export function claimIsStale(
  claim: WarrantyClaim | null | undefined,
  staleDays: number = DEFAULT_STALE_CLAIM_DAYS,
  now: number = Date.now()
): boolean {
  const days = claimDaysSinceUpdate(claim, now);
  return days !== null && days >= staleDays;
}
