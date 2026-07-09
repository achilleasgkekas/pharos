import { NextResponse } from 'next/server';
import { saasGuard } from '@/lib/tenancy/saasApi';
import { requireSuperadmin } from '@/lib/tenancy/superadmin';
import { getTenantDetailForAdmin } from '@/lib/tenancy/adminTenantDetail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/saas/admin/tenants/[slug] → superadmin single-tenant DETAIL (TODO §8 "Superadmin
 * console"). READ-ONLY control-plane view of ONE workspace: the registry summary (plan/status/
 * tier/billing-linked/BYO-key/trial+erasure timestamps), its member roster (role/status joined
 * to account email/name), a role/status tally, and a usage rollup (AI consumption + storage
 * footprint gauge) read from the central Usage ledger. Builds on the listing endpoint (#48).
 *
 * Authorization is the platform-operator gate (requireSuperadmin), NOT per-workspace authz:
 *   - SAAS_MODE off / AUTH_SECRET unset      → 404 / 500 (endpoint absent for self-hosted)
 *   - SAAS_SUPERADMIN_EMAILS unset/empty     → 404 (console not enabled)
 *   - not signed in                          → 401
 *   - signed-in account not in the allowlist → 403
 *   - unknown slug                           → 404
 *
 * Reads only the registry (Tenant/Membership/Account/Usage); never opens a per-tenant data
 * database, never writes, never touches a feature route or self-hosted User/bearer path. `no-store`.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  return saasGuard(async () => {
    const gate = await requireSuperadmin();
    if ('response' in gate) return gate.response;

    const { slug } = await params;
    const detail = await getTenantDetailForAdmin(slug);
    if (!detail) {
      return NextResponse.json({ error: 'tenant not found' }, { status: 404 });
    }

    return NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } });
  });
}
