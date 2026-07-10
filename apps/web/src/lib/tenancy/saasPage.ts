// PAGE-side gate for the user-facing (saas) segment — the signup/login/workspace panels that
// consume api/saas/*. It is the page-shaped mirror of `saasAuthGate()` (lib/tenancy/saasApi),
// which returns a NextResponse (404 when SAAS_MODE off, 500 when AUTH_SECRET missing). A
// server-component page can't return a response, so this throws `notFound()` instead.
//
// Ordering hides the entire SaaS UI from the self-hosted app: SAAS_MODE off → the (saas)
// segment does not exist (404), so the OSS build is byte-for-byte unchanged. When SaaS is on
// but AUTH_SECRET is unset we ALSO 404 (fail closed) rather than render a form that can never
// sign anyone in.
//
// NODE-only-ish (reads next/headers cookies via getCurrentAccount); only meaningful when
// SAAS_MODE is on. Distinct from `requireSuperadminPage()` (operator console) — this gate
// governs the ordinary tenant-facing auth pages and does NOT require an allowlist.
import { notFound } from 'next/navigation';
import { saasMode } from '@/lib/tenancy/saasMode';
import {
  accountAuthConfigured,
  getCurrentAccount,
  type AccountClaims,
} from '@/lib/tenancy/accountSession';

/**
 * Ensure the SaaS UI is enabled for this deployment, or `notFound()` (throws — never returns).
 * Self-hosted (SAAS_MODE off) and fail-closed misconfig (no AUTH_SECRET) both collapse to a
 * single 404 so the segment simply does not exist for the OSS app.
 */
export function requireSaasUiEnabled(): void {
  if (!saasMode() || !accountAuthConfigured()) notFound();
}

/**
 * Gate + read the current viewer. Returns the account claims (sub/email) when a valid session
 * cookie is present, or null when logged out. Token-only (no DB hit) — pages that need to be
 * sure the account row still exists should confirm separately. Throws notFound() when the SaaS
 * UI is disabled, exactly like requireSaasUiEnabled().
 */
export async function getSaasViewer(): Promise<AccountClaims | null> {
  requireSaasUiEnabled();
  return getCurrentAccount();
}
