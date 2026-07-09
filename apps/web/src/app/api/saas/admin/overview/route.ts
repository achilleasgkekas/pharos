import { NextResponse } from 'next/server';
import { saasGuard } from '@/lib/tenancy/saasApi';
import { requireSuperadmin } from '@/lib/tenancy/superadmin';
import { readFleetOverviewForAdmin } from '@/lib/tenancy/adminOverview';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/saas/admin/overview → superadmin FLEET OVERVIEW (TODO §8 "Superadmin console").
 * READ-ONLY control-plane aggregate across the whole SaaS: tenant counts by plan/status/tier
 * (+ billing-linked / BYO-key / custom-domain / erasure-scheduled flags), total accounts,
 * active-member count, and this month's usage totals (AI calls/tokens/cost + storage footprint)
 * summed from the central Usage ledger. Complements the listing (#48) and per-tenant detail
 * (#49/#50) with a single fleet-wide summary.
 *
 * Authorization is the platform-operator gate (requireSuperadmin), NOT per-workspace authz:
 *   - SAAS_MODE off / AUTH_SECRET unset      → 404 / 500 (endpoint absent for self-hosted)
 *   - SAAS_SUPERADMIN_EMAILS unset/empty     → 404 (console not enabled)
 *   - not signed in                          → 401
 *   - signed-in account not in the allowlist → 403
 *
 * Reads only the registry (Tenant/Account/Membership/Usage); never opens a per-tenant data
 * database, never runs db.stats(), never writes, never touches a feature route or the
 * self-hosted User/bearer path. `no-store`.
 */
export async function GET() {
  return saasGuard(async () => {
    const gate = await requireSuperadmin();
    if ('response' in gate) return gate.response;

    const overview = await readFleetOverviewForAdmin();
    return NextResponse.json(overview, { headers: { 'Cache-Control': 'no-store' } });
  });
}
