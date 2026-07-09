// PAGE-side superadmin gate for the /admin/* console (TODO §8, SaaS UI-first). The route
// handlers under api/saas/admin/* use `requireSuperadmin()` which returns a NextResponse to
// short-circuit with (401/403/404). Server-component PAGES can't return a response — they
// throw `notFound()` — so this is the page-shaped mirror of that gate.
//
// The ordering deliberately hides the console from anyone who is not a configured platform
// operator: self-hosted / misconfigured / console-not-enabled / not-signed-in / not-in-the-
// allowlist / stale-cookie all render the same 404 (notFound). There is no login redirect
// on purpose — revealing a login form would reveal the console exists; an operator signs in
// through the normal SaaS auth flow and only then does /admin resolve.
//
// NODE-only (imports the DB + Account model). Only meaningful when SAAS_MODE is on; for the
// self-hosted app every branch short-circuits to notFound() so /admin does not exist.
import { notFound } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { saasMode } from '@/lib/tenancy/saasMode';
import {
  accountAuthConfigured,
  getCurrentAccount,
  type AccountClaims,
} from '@/lib/tenancy/accountSession';
import { superadminAllowlist, isSuperadminEmail } from '@/lib/tenancy/superadmin';
import { Account } from '@/models/Account';

/**
 * Resolve the current viewer as a platform superadmin, or `notFound()` (throws — never
 * returns) for everyone else. Same checks and ordering as the API `requireSuperadmin()`,
 * collapsed to a single 404 outcome because a page has no way to return distinct status
 * codes. Returns the account claims (sub/email) when authorized, for the shell to display.
 */
export async function requireSuperadminPage(): Promise<AccountClaims> {
  // Self-hosted app or fail-closed misconfig → the console does not exist.
  if (!saasMode() || !accountAuthConfigured()) notFound();

  // No operator allowlist configured → console not enabled; don't reveal it.
  const allowlist = superadminAllowlist();
  if (allowlist.length === 0) notFound();

  const account = await getCurrentAccount();
  if (!account || !isSuperadminEmail(account.email, allowlist)) notFound();

  // Defence in depth: a signed cookie can outlive the account row. Confirm it still exists.
  await connectDB();
  const exists = await Account.findById(account.sub).select('_id').lean();
  if (!exists) notFound();

  return account;
}
