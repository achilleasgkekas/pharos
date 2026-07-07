import { NextRequest, NextResponse } from 'next/server';
import { saasGuard } from '@/lib/tenancy/saasApi';
import { requireSuperadmin } from '@/lib/tenancy/superadmin';
import {
  parseAdminTenantQuery,
  listTenantsForAdmin,
  buildTenantListing,
} from '@/lib/tenancy/adminTenants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/saas/admin/tenants[?status=&q=&limit=&offset=] → superadmin cross-tenant listing
 * (TODO §8 "Superadmin console"). READ-ONLY control-plane view of every workspace: slug, plan,
 * status, tier, billing-linked flag, BYO-key flag, trial/erasure timestamps. Paginated
 * (limit 1..100, default 50) with optional exact `status` filter and case-insensitive
 * slug/name/domain `q` search.
 *
 * Authorization is the platform-operator gate (requireSuperadmin), NOT per-workspace authz:
 *   - SAAS_MODE off / AUTH_SECRET unset      → 404 / 500 (endpoint absent for self-hosted)
 *   - SAAS_SUPERADMIN_EMAILS unset/empty     → 404 (console not enabled)
 *   - not signed in                          → 401
 *   - signed-in account not in the allowlist → 403
 *
 * Reads only the registry `Tenant` collection; never opens a per-tenant data database, never
 * writes, never touches a feature route or the self-hosted User/bearer path. `no-store`.
 */
export async function GET(req: NextRequest) {
  return saasGuard(async () => {
    const gate = await requireSuperadmin();
    if ('response' in gate) return gate.response;

    const query = parseAdminTenantQuery(new URL(req.url).searchParams);
    const { summaries, total } = await listTenantsForAdmin(query);
    const payload = buildTenantListing(summaries, { total, query, generatedAt: new Date() });

    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  });
}
