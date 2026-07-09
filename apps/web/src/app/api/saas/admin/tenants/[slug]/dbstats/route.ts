import { NextResponse } from 'next/server';
import { saasGuard } from '@/lib/tenancy/saasApi';
import { requireSuperadmin } from '@/lib/tenancy/superadmin';
import { readLiveDbStatsForAdmin } from '@/lib/tenancy/adminTenantDbStats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/saas/admin/tenants/[slug]/dbstats → superadmin LIVE on-demand storage footprint
 * (TODO §8 "dbStats() size metering"). Unlike the tenant DETAIL endpoint (#50), which reports
 * the LAST SAMPLED figure from the control-plane Usage ledger, this runs a fresh, read-only
 * `db.stats()` against the tenant's own data database RIGHT NOW and returns the billed db bytes
 * + on-disk file bytes + total. It NEVER writes (no Usage sample is recorded), so viewing a
 * footprint has zero side effects.
 *
 * Authorization is the platform-operator gate (requireSuperadmin), NOT per-workspace authz:
 *   - SAAS_MODE off / AUTH_SECRET unset      → 404 / 500 (endpoint absent for self-hosted)
 *   - SAAS_SUPERADMIN_EMAILS unset/empty     → 404 (console not enabled)
 *   - not signed in                          → 401
 *   - signed-in account not in the allowlist → 403
 *   - unknown slug                           → 404
 *
 * Resolves the tenant from the registry (Tenant), then reads only that tenant's data-plane
 * db.stats() + file subtree — read-only, no writes, no feature route / self-hosted path touched.
 * `no-store`.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  return saasGuard(async () => {
    const gate = await requireSuperadmin();
    if ('response' in gate) return gate.response;

    const { slug } = await params;
    const stats = await readLiveDbStatsForAdmin(slug);
    if (!stats) {
      return NextResponse.json({ error: 'tenant not found' }, { status: 404 });
    }

    return NextResponse.json(stats, { headers: { 'Cache-Control': 'no-store' } });
  });
}
