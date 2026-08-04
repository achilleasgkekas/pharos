import { NextResponse } from 'next/server';
import { saasMode } from '@/lib/tenancy/saasMode';
import { saasGuard } from '@/lib/tenancy/saasApi';
import { checkCronAuth } from '@/lib/cronAuth';
import { runTrialLapseSweep } from '@/lib/billing/trialSweep';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/saas/trials-sweep   (moved from /api/saas/trials/sweep)
 *
 * Scheduler-driven trial-lapse sweep (D4): warns tenants whose trial ends within 3 days
 * (one idempotent dunning email) and suspends tenants whose trial has already lapsed. The
 * in-process 6-hourly cron calls this same runner; this route is the on-demand / external
 * trigger so the sweep is reachable without waiting for the timer.
 *
 * Lives under /api/cron/ because that prefix is the one excluded from the session gate in
 * `middleware.ts`; see the note on usage-sample for why depending on any other branch of
 * that middleware to stay reachable is a trap.
 *
 * SaaS-mode only (404 when SAAS_MODE off — it doesn't exist for the self-hosted app).
 * Authenticated by the shared CRON_SECRET bearer via lib/cronAuth.ts (fail-closed 500 when
 * unset), not an account session, since a scheduler — not a user — calls it. Writes only to
 * the control-plane Tenant/AuditEvent collections; the data plane is never touched.
 */
export async function POST(req: Request) {
  if (!saasMode()) {
    return NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
  }

  const fail = checkCronAuth(req);
  if (fail) {
    return NextResponse.json({ error: fail.error }, { status: fail.status });
  }

  return saasGuard(async () => {
    const result = await runTrialLapseSweep();
    return NextResponse.json({ ok: true, ...result });
  });
}
