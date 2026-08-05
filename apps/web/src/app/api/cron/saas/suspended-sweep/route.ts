import { NextResponse } from 'next/server';
import { saasMode } from '@/lib/tenancy/saasMode';
import { checkCronAuth } from '@/lib/cronAuth';
import { runSuspendedSweep } from '@/lib/tenancy/suspendedSweep';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/saas/suspended-sweep
 *
 * Enforces the 30-day keep-window for SUSPENDED workspaces that the public Terms §9, Privacy §5
 * and landing FAQ already promise (Achilleas, 2026-08-04). Per run it: backfills a missing
 * `suspendedAt` clock, sends the one pre-deletion warning email, and stamps expired workspaces
 * into the existing erasure lifecycle (due immediately) so the erasure-purge scan reports them.
 *
 * It never drops a database — deletion stays the single, gated path in erasurePurge.ts. See the
 * module header of lib/tenancy/suspendedSweep.ts for why a second destructive path is refused.
 *
 * DAILY is the right cadence: the window is 30 days and the warning is 7 days out, so hourly runs
 * would only add load. Lives under /api/cron/ with the other scheduler endpoints because the
 * middleware matcher exempts that prefix — an /api/saas/ path would be killed by the session gate
 * before the CRON_SECRET check ever ran (see the note on usage-sample).
 *
 * SaaS-mode only (404 when SAAS_MODE off — the self-hosted app has no tenants to expire).
 * Authenticated by the shared CRON_SECRET bearer via lib/cronAuth.ts (fail-closed 500 when unset).
 */
export async function POST(req: Request) {
  if (!saasMode()) {
    return NextResponse.json({ error: 'SaaS mode is not enabled' }, { status: 404 });
  }

  const fail = checkCronAuth(req);
  if (fail) {
    return NextResponse.json({ error: fail.error }, { status: fail.status });
  }

  try {
    const result = await runSuspendedSweep();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message?.slice(0, 200) || 'Server error' },
      { status: 500 }
    );
  }
}
