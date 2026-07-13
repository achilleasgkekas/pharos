import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { saasGuard } from '@/lib/tenancy/saasApi';
import { requireSuperadmin } from '@/lib/tenancy/superadmin';
import { getTenantDetailForAdmin } from '@/lib/tenancy/adminTenantDetail';
import { planAdminTenantPatch } from '@/lib/tenancy/adminTenantActions';
import { recordAudit, auditCtx } from '@/lib/tenancy/audit';
import { readBody } from '@/lib/apiBody';
import { Tenant } from '@/models/Tenant';

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

/**
 * PATCH /api/saas/admin/tenants/[slug] → superadmin manual OVERRIDE of a workspace's lifecycle
 * `status` and/or `plan`. Body: `{ status?, plan? }` (either/both; unknown values rejected). The
 * one WRITE surface on the console — everything else here is read-only observability. Deliberately
 * narrow: no membership mutation, no destructive drop (those stay manual/gated, never an automated
 * routine). Every write is logged to the workspace's own audit trail (recordAudit) so an owner
 * viewing their Activity tab sees the operator action, not a mystery status flip. Idempotent:
 * requesting the tenant's current value(s) is a no-op (200, no audit row).
 *
 * Authorization mirrors GET (requireSuperadmin: 404 console-disabled / 401 / 403). 400 on an
 * unknown status/plan value or an empty body. 404 on an unknown slug.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  return saasGuard(async () => {
    const gate = await requireSuperadmin();
    if ('response' in gate) return gate.response;

    const { slug } = await params;
    const s = typeof slug === 'string' ? slug.trim().toLowerCase() : '';
    if (!s) return NextResponse.json({ error: 'tenant not found' }, { status: 404 });

    await connectDB();
    const tenant = await Tenant.findOne({ slug: s }).select('_id slug status plan').lean();
    if (!tenant) {
      return NextResponse.json({ error: 'tenant not found' }, { status: 404 });
    }

    const body = await readBody(req);
    const plan = planAdminTenantPatch(
      { status: 'status' in body ? body.status : undefined, plan: 'plan' in body ? body.plan : undefined },
      { status: String(tenant.status ?? ''), plan: String(tenant.plan ?? '') }
    );
    if (!plan.ok) {
      return NextResponse.json({ error: plan.error }, { status: 400 });
    }

    if (Object.keys(plan.set).length > 0) {
      await Tenant.updateOne({ _id: tenant._id }, { $set: plan.set });

      const ctx = auditCtx(String(tenant._id));
      if (plan.statusAudit) {
        await recordAudit(ctx, {
          action: plan.statusAudit,
          actor: gate.account.sub,
          target: s,
          meta: { from: tenant.status, to: plan.set.status, by: 'admin' },
        });
      }
      if (plan.planAudit) {
        await recordAudit(ctx, {
          action: 'plan.changed',
          actor: gate.account.sub,
          target: s,
          meta: { from: tenant.plan, to: plan.set.plan, by: 'admin' },
        });
      }
    }

    const detail = await getTenantDetailForAdmin(s);
    if (!detail) {
      return NextResponse.json({ error: 'tenant not found' }, { status: 404 });
    }
    return NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } });
  });
}
