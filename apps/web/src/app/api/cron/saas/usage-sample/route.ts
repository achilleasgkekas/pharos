import { NextResponse } from 'next/server';
import { saasMode } from '@/lib/tenancy/saasMode';
import { saasGuard } from '@/lib/tenancy/saasApi';
import { checkCronAuth } from '@/lib/cronAuth';
import { sampleAllTenants } from '@/lib/billing/dbStats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/saas/usage-sample   (moved from /api/saas/usage/sample)
 *
 * Scheduler-driven storage sampling: measures every live tenant's Mongo footprint and
 * writes the billed bytes into the Usage ledger for the current period, so the storage
 * quota has fresh figures to check against.
 *
 * WHY IT LIVES UNDER /api/cron/ AND NOT /api/saas/: every scheduler endpoint authenticates
 * with CRON_SECRET rather than a session, and `middleware.ts` excludes `api/cron` from the
 * session gate for exactly that reason. Under /api/saas/ this route's reachability rode on
 * the middleware's `saasMode() → pass()` short-circuit — a branch written for a different
 * purpose (letting an anonymous customer reach /account/signup). The day that gate is
 * tightened, as it should be, an unrelated change would answer a correctly-signed cron
 * request with a bare 401 before this handler ever ran, which in a crontab log is
 * indistinguishable from a wrong token. One home for scheduler endpoints, one exclusion, one
 * auth helper (lib/cronAuth.ts, fail-closed when CRON_SECRET is unset).
 *
 * SaaS-mode only (404 when SAAS_MODE off — the endpoint doesn't exist for the self-hosted
 * app). Read-only on the data plane; the only writes are to the control-plane Usage
 * collection.
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
    const result = await sampleAllTenants();
    return NextResponse.json({ ok: true, ...result });
  });
}
