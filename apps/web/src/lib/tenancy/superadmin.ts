// SaaS SUPERADMIN gate (TODO §8 "Superadmin console"). Cross-tenant, platform-operator
// authorization — deliberately SEPARATE from the per-workspace owner/admin authz
// (lib/tenancy/workspaceSession + members). A superadmin is a Pharos operator who may view
// the control plane across ALL tenants; it is NOT a role stored per workspace.
//
// Membership in the superadmin set is decided by an ENV allowlist, `SAAS_SUPERADMIN_EMAILS`
// (comma / whitespace / semicolon separated), matched against the signed account session's
// email. Keeping it in env (not the DB) means only the operator running the deployment can
// grant it — there is no in-app path to escalate into a superadmin, so a compromised account
// row can't mint one. Empty/unset allowlist ⇒ the console is simply not enabled (404).
//
// The pure helpers (parse/normalize/match/configured) have zero DB or next/* imports so they
// are unit-testable and client-safe; `requireSuperadmin()` is the NODE-only gate used by the
// admin route handlers. Only meaningful when SAAS_MODE is on.
import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { saasAuthGate } from '@/lib/tenancy/saasApi';
import { getCurrentAccount, type AccountClaims } from '@/lib/tenancy/accountSession';
import { Account } from '@/models/Account';

/** Trim + lowercase an email for stable comparison. Non-strings → ''. */
export function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/**
 * Parse the raw `SAAS_SUPERADMIN_EMAILS` value into a normalized, de-duplicated set of
 * emails. Accepts comma, semicolon, or whitespace as separators so any reasonable env format
 * works. Entries without an `@` are dropped (defensive: a stray token can't accidentally
 * whitelist everyone). Returns an empty array for null/blank/garbage input.
 */
export function parseSuperadminEmails(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,;]+/)) {
    const e = normalizeEmail(part);
    if (e && e.includes('@')) seen.add(e);
  }
  return [...seen];
}

/** The configured superadmin allowlist (read from env each call — env is the source of truth). */
export function superadminAllowlist(): string[] {
  return parseSuperadminEmails(process.env.SAAS_SUPERADMIN_EMAILS);
}

/** True when at least one superadmin email is configured (i.e. the console is enabled). */
export function superadminConfigured(): boolean {
  return superadminAllowlist().length > 0;
}

/** True when `email` is in the allowlist (both sides normalized). Blank email → false. */
export function isSuperadminEmail(email: unknown, allowlist: string[]): boolean {
  const e = normalizeEmail(email);
  if (!e) return false;
  return allowlist.includes(e);
}

/**
 * NODE-only gate for the /api/saas/admin/* routes. Returns either a short-circuit
 * `NextResponse` or the resolved superadmin account. Ordering hides the console from
 * non-operators as much as possible:
 *   - SAAS_MODE off / AUTH_SECRET unset → the saasAuthGate response (404 / 500)
 *   - allowlist empty                   → 404 (console not enabled — don't reveal it exists)
 *   - not signed in                     → 401
 *   - signed in but not in allowlist    → 403
 *   - account row gone (deleted)        → 401 (stale cookie)
 */
export async function requireSuperadmin(): Promise<
  { response: NextResponse } | { account: AccountClaims }
> {
  const gate = saasAuthGate();
  if (gate) return { response: gate };

  const allowlist = superadminAllowlist();
  if (allowlist.length === 0) {
    return { response: NextResponse.json({ error: 'not found' }, { status: 404 }) };
  }

  const account = await getCurrentAccount();
  if (!account) {
    return { response: NextResponse.json({ error: 'not authenticated' }, { status: 401 }) };
  }

  if (!isSuperadminEmail(account.email, allowlist)) {
    return { response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }

  // Defence in depth: a signed cookie can outlive the account row. Confirm it still exists.
  await connectDB();
  const exists = await Account.findById(account.sub).select('_id').lean();
  if (!exists) {
    return { response: NextResponse.json({ error: 'not authenticated' }, { status: 401 }) };
  }

  return { account };
}
