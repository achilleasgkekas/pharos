// NODE-ONLY resolver shared by the SaaS billing route handlers. Centralises the common
// flow: SaaS gate → account session → membership authz → tenant context + Tenant doc, so
// each route stays tiny and the authorization rule lives in one place.
//
// Every billing route MUST be inert when SAAS_MODE is off (returns the gate's 404) and
// requires an owner/admin membership on the chosen workspace. This does NOT touch any
// feature route or the per-tenant User session — it only reads control-plane state.
import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { saasAuthGate, accountTenants, type AccountTenant } from '@/lib/tenancy/saasApi';
import { getCurrentAccount, type AccountClaims } from '@/lib/tenancy/accountSession';
import { getTenantContext, type TenantContext } from '@/lib/tenancy/context';
import { Tenant, type TenantDoc } from '@/models/Tenant';
import { canManageBilling } from './billingRoutes';

export type BillingSession = {
  account: AccountClaims;
  workspace: AccountTenant;
  ctx: TenantContext;
  tenant: TenantDoc;
};

/**
 * Resolve + authorize a billing request. Returns either a short-circuit `NextResponse`
 * (gate 404 / 401 / 403 / 404) or the resolved billing session.
 *
 * @param wantSlug  optional workspace slug picked from the request body; defaults to the
 *                  account's first workspace when omitted.
 */
export async function resolveBillingSession(
  wantSlug: string | null
): Promise<{ response: NextResponse } | { session: BillingSession }> {
  const gate = saasAuthGate();
  if (gate) return { response: gate };

  const account = await getCurrentAccount();
  if (!account) return { response: NextResponse.json({ error: 'not authenticated' }, { status: 401 }) };

  await connectDB();
  const tenants = await accountTenants(account.sub);
  if (tenants.length === 0) {
    return { response: NextResponse.json({ error: 'no workspace for this account' }, { status: 404 }) };
  }

  const want = wantSlug?.trim().toLowerCase() || null;
  const workspace = want ? tenants.find((t) => t.slug === want) : tenants[0];
  if (!workspace) {
    return { response: NextResponse.json({ error: 'not a member of that workspace' }, { status: 403 }) };
  }

  if (!canManageBilling(workspace.role)) {
    return {
      response: NextResponse.json(
        { error: 'billing requires an owner or admin role' },
        { status: 403 }
      ),
    };
  }

  const ctx = await getTenantContext({ slug: workspace.slug });
  if (!ctx || !ctx.tenantId) {
    return { response: NextResponse.json({ error: 'workspace not found' }, { status: 404 }) };
  }

  const tenant = (await Tenant.findById(ctx.tenantId)) as TenantDoc | null;
  if (!tenant) {
    return { response: NextResponse.json({ error: 'workspace not found' }, { status: 404 }) };
  }

  return { session: { account, workspace, ctx, tenant } };
}
