import { NextResponse } from 'next/server';
import { saasAuthGate } from '@/lib/tenancy/saasApi';
import { clearAccountCookie } from '@/lib/tenancy/accountSession';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/saas/auth/logout → clears the account session cookie. SaaS-mode only.
 * Idempotent: succeeds whether or not a session was present.
 */
export async function POST() {
  const gate = saasAuthGate();
  if (gate) return gate;
  await clearAccountCookie();
  return NextResponse.json({ ok: true });
}
