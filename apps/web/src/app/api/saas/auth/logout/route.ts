import { NextResponse } from 'next/server';
import { saasAuthGate, saasGuard } from '@/lib/tenancy/saasApi';
import { clearAccountCookie } from '@/lib/tenancy/accountSession';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/saas/auth/logout → clears the account session cookie. SaaS-mode only.
 * Idempotent: succeeds whether or not a session was present.
 *
 * Wrapped in `saasGuard` like every other SaaS route so an unexpected throw from the cookie
 * store becomes the uniform `{ error }` 500 JSON instead of Next's HTML crash page. The gate
 * still short-circuits first, so the SAAS_MODE-off 404 and the AUTH_SECRET-unset 500 are
 * unchanged.
 */
export async function POST() {
  const gate = saasAuthGate();
  if (gate) return gate;
  return saasGuard(async () => {
    await clearAccountCookie();
    return NextResponse.json({ ok: true });
  });
}
