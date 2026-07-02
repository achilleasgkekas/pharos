// SaaS CONTROL-PLANE — workspace-invite token helpers. Only meaningful when SAAS_MODE is
// on; the self-hosted single-user app never mints invites.
//
// The flow mirrors password-reset / email-verify (passwordReset.ts, emailVerify.ts): a
// high-entropy random token is handed to the invitee over email; the Invite row stores
// ONLY its SHA-256 hash + an expiry, so a leaked row cannot be replayed as a live invite.
// Accepting re-hashes the presented token and looks it up by hash ("store the hash, never
// the secret").
//
// Unlike a reset link (1h) or verification (24h), an invite is long-lived — people forward
// them, sit on them, accept days later — so the default TTL is 7 days. The pure helpers
// carry no imports beyond node:crypto and are unit-tested; the crypto helpers are only
// reachable from the (node-runtime) invite routes.
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

/** Invite lifecycle status stored on the Invite row. */
export type InviteStatus = 'pending' | 'accepted' | 'revoked';

/** Query filter for listing invites: a concrete status, or 'all' (no status constraint). */
export type InviteStatusFilter = InviteStatus | 'all';

/**
 * Parse the `?status=` list-filter param. Unknown/missing → 'pending' so the default listing
 * (and every existing caller that omits the param) keeps returning only outstanding invites —
 * the filter is purely additive. Accepts the three concrete statuses plus 'all' for an audit
 * view spanning accepted + revoked history.
 */
export function parseInviteStatusFilter(raw: string | null | undefined): InviteStatusFilter {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'all' || v === 'accepted' || v === 'revoked' || v === 'pending') return v;
  return 'pending';
}

/**
 * Mongo `status` query fragment for a filter. 'all' → `{}` (no constraint, every lifecycle
 * row); a concrete status → `{ status }`. Kept pure so the route needn't branch inline.
 */
export function inviteStatusQuery(filter: InviteStatusFilter): { status?: InviteStatus } {
  return filter === 'all' ? {} : { status: filter };
}

/** How long a freshly minted invite token stays valid (7 days). Longer than reset/verify:
 *  invites get forwarded and sat on. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Expiry Date for an invite minted at `nowMs` (defaults to now). */
export function inviteTokenExpiry(nowMs: number = Date.now()): Date {
  return new Date(nowMs + INVITE_TTL_MS);
}

/**
 * True when an invite is still redeemable: status is exactly 'pending' AND its expiry is
 * present and in the future. An accepted/revoked invite, or a past/missing expiry, is not.
 * `nowMs` is injectable for tests.
 */
export function isInviteValid(
  status: string | null | undefined,
  expires: Date | string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (status !== 'pending') return false;
  if (!expires) return false;
  const t = expires instanceof Date ? expires.getTime() : new Date(expires).getTime();
  if (Number.isNaN(t)) return false;
  return t > nowMs;
}

/** SHA-256 hex of an invite token — what gets stored / looked up. */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Mint a fresh invite token: the plaintext `token` goes to the invitee (in the link), the
 * `tokenHash` + `expires` go to the Invite row. 32 random bytes → base64url (URL-safe, no
 * padding).
 */
export function mintInviteToken(nowMs: number = Date.now()): {
  token: string;
  tokenHash: string;
  expires: Date;
} {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInviteToken(token), expires: inviteTokenExpiry(nowMs) };
}

/** Constant-time compare of two stored hashes (hex strings of equal length). */
export function inviteHashMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Client-safe projection of an invite row for list responses. By construction it never
 * carries the token hash (or any secret) — only the fields a workspace manager needs to
 * see (who was invited, as what, and whether the link is still redeemable). `expired` is
 * derived so the caller doesn't re-implement the TTL check.
 */
export type InviteView = {
  id: string;
  email: string;
  role: string;
  status: string;
  expires: string | null;
  expired: boolean;
  createdAt: string | null;
  // Acceptance audit trail — populated only once an invite is redeemed, null otherwise. Lets
  // the audit list (?status=accepted|all) show who joined via which invite, and when. Still
  // never carries the token hash or any secret.
  acceptedBy: string | null;
  acceptedAt: string | null;
};

function toIso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const t = d instanceof Date ? d : new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

export function inviteView(
  inv: {
    _id: unknown;
    email?: string | null;
    role?: string | null;
    status?: string | null;
    expires?: Date | string | null;
    createdAt?: Date | string | null;
    acceptedBy?: unknown;
    acceptedAt?: Date | string | null;
  },
  nowMs: number = Date.now()
): InviteView {
  const status = inv.status ?? 'pending';
  return {
    id: String(inv._id),
    email: inv.email ?? '',
    role: inv.role ?? 'member',
    status,
    expires: toIso(inv.expires),
    // A pending invite past its TTL is effectively dead even though the row still says
    // "pending"; surface that so the UI can distinguish live links from stale ones.
    expired: status === 'pending' && !isInviteValid(status, inv.expires, nowMs),
    createdAt: toIso(inv.createdAt),
    // null on pending/revoked rows; set only when an invite was actually accepted.
    acceptedBy: inv.acceptedBy != null ? String(inv.acceptedBy) : null,
    acceptedAt: toIso(inv.acceptedAt),
  };
}
