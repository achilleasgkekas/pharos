import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { saasAuthGate, saasGuard, accountTenants } from '@/lib/tenancy/saasApi';
import { getCurrentAccount } from '@/lib/tenancy/accountSession';
import { getTenantContext } from '@/lib/tenancy/context';
import { Tenant, type TenantDoc } from '@/models/Tenant';
import { stripeConfigured } from '@/lib/billing/stripe';
import { buildBillingSummary } from '@/lib/billing/billingSummary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/saas/billing[?tenant=<slug>]
 *
 * Read-only billing summary for one of the signed-in account's workspaces: plan
 * metadata, lifecycle status, Stripe subscription linkage, whether billing is configured,
 * and the single call-to-action the UI should render (subscribe / manage / view). A
 * settings/billing page consumes this to decide between "Subscribe" and "Manage".
 *
 * SaaS-mode only (404 when SAAS_MODE off). Requires an account session. Unlike the
 * checkout/portal ACTION routes, this READ endpoint is open to ANY member of the
 * workspace — members get `canManage:false` + `action:'view'` so the UI renders it
 * read-only. `?tenant=` picks a workspace by slug (default: the first membership).
 */
export async function GET(req: Request) {
  const gate = saasAuthGate();
  if (gate) return gate;

  return saasGuard(async () => {
    const claims = await getCurrentAccount();
    if (!claims) return NextResponse.json({ error: 'not authenticated' }, { status: 401 });

    await connectDB();
    const tenants = await accountTenants(claims.sub);
    if (tenants.length === 0) {
      return NextResponse.json({ error: 'no workspace for this account' }, { status: 404 });
    }

    const want = new URL(req.url).searchParams.get('tenant')?.trim().toLowerCase() || null;
    const chosen = want ? tenants.find((t) => t.slug === want) : tenants[0];
    if (!chosen) {
      return NextResponse.json({ error: 'not a member of that workspace' }, { status: 403 });
    }

    const ctx = await getTenantContext({ slug: chosen.slug });
    if (!ctx || !ctx.tenantId) {
      return NextResponse.json({ error: 'workspace not found' }, { status: 404 });
    }

    const tenant = (await Tenant.findById(ctx.tenantId).lean()) as TenantDoc | null;
    if (!tenant) return NextResponse.json({ error: 'workspace not found' }, { status: 404 });

    const summary = buildBillingSummary({
      plan: tenant.plan,
      status: tenant.status,
      role: chosen.role,
      billingCustomerId: tenant.billingCustomerId,
      billingSubscriptionId: tenant.billingSubscriptionId,
      trialEndsAt: tenant.trialEndsAt,
      billingConfigured: stripeConfigured(),
    });

    return NextResponse.json({
      tenant: { slug: chosen.slug, name: chosen.name, role: chosen.role },
      ...summary,
    });
  });
}
