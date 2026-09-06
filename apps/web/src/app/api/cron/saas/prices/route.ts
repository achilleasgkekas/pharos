import { NextResponse } from 'next/server';
import { saasMode } from '@/lib/tenancy/saasMode';
import { saasGuard } from '@/lib/tenancy/saasApi';
import { checkCronAuth } from '@/lib/cronAuth';
import { runPriceScrapeAllTenants } from '@/app/items/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/saas/prices
 *
 * Scheduler entry point for the MULTI-TENANT price scraper — the SaaS counterpart of the
 * self-host `/api/cron/prices`. It runs `runPriceScrapeAllTenants()`: enumerate the live
 * workspaces from the registry and run the same per-item scrape inside each tenant's context,
 * so every workspace's tracked links get re-priced without a human opening the app. The
 * shared cross-tenant `ScrapedPrice` cache (24h TTL) keeps the total fetch/AI work bounded by
 * the number of DISTINCT urls across the fleet, not tenants × links.
 *
 * SaaS-mode only (404 when SAAS_MODE off — the self-hosted app uses `/api/cron/prices`, which
 * is the inverse gate). Lives under /api/cron/ because that prefix is the one excluded from
 * the session gate in `middleware.ts` (same reason as the other saas crons).
 *
 * Authenticated by the shared CRON_SECRET bearer via lib/cronAuth.ts (fail-closed 500 when
 * unset), not an account session, since a scheduler — not a user — calls it. The per-tenant
 * cron auth IS the authorisation for the withTenant fan-out (see runPriceScrapeAllTenants).
 * The response carries fleet-wide counts (tenants, tenantErrors, scanned, itemsChanged,
 * linksChecked, drops, errors) so a crontab log can tell a healthy quiet pass from a crash.
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
    const result = await runPriceScrapeAllTenants();
    return NextResponse.json(result); // { ok, tenants, tenantErrors, scanned, ... }
  });
}
