import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { saasMode } from '@/lib/tenancy/saasMode';
import { runTrialLapseSweep } from '@/lib/billing/trialSweep';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Constant-time bearer-token compare. Length-guarded because timingSafeEqual throws on
 *  differing buffer lengths (same shape as stripe.ts / usage/sample). */
function tokenMatches(token: string, secret: string): boolean {
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /api/saas/trials/sweep
 *
 * Scheduler-driven trial-lapse sweep (D4): warns tenants whose trial ends within 3 days
 * (one idempotent dunning email) and suspends tenants whose trial has already lapsed. The
 * in-process 6-hourly cron calls this same runner; this route is the on-demand / external
 * trigger so the sweep is reachable without waiting for the timer.
 *
 * SaaS-mode only (404 when SAAS_MODE off — it doesn't exist for the self-hosted app).
 * Protected by the shared CRON_SECRET bearer (fail-closed 500 if unset), not an account
 * session, since a scheduler — not a user — calls it. Writes only to the control-plane
 * Tenant/AuditEvent collections; the data plane is never touched.
 */
export async function POST(req: Request) {
  if (!saasMode()) {
    return NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !tokenMatches(token, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const result = await runTrialLapseSweep();
  return NextResponse.json({ ok: true, ...result });
}
