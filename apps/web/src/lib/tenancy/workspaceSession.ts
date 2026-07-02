// NODE-ONLY resolver shared by workspace-scoped SaaS route handlers (members, and later
// tenant settings). Generalises the billing resolver's flow — SaaS gate → account
// session → membership authz → tenant context + Tenant doc — with a `requireManage`
// switch so read routes accept any active member while mutating routes require owner/admin.
//
// Every workspace route MUST be inert when SAAS_MODE is off (returns the gate's 404). This
// only reads control-plane state; it never touches a feature route or the per-tenant User
// session. It deliberately mirrors (does not import) lib/billing/billingSession so the two
// concerns stay decoupled.
import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { saasAuthGate, accountTenants, type AccountTenant } from '@/lib/tenancy/saasApi';
import { getCurrentAccount, type AccountClaims } from '@/lib/tenancy/accountSession';
import { getTenantContext, type TenantContext } from '@/lib/tenancy/context';
import { Tenant, type TenantDoc } from '@/models/Tenant';
import { canManageMembers } from './members';

export type WorkspaceSession = {
  account: AccountClaims;
  workspace: AccountTenant;
  ctx: TenantContext;
  tenant: TenantDoc;
};

/**
 * Resolve + authorize a workspace request. Returns either a short-circuit `NextResponse`
 * (gate 404 / 401 / 403 / 404) or the resolved session.
 *
 * @param wantSlug        optional workspace slug (from body/query); defaults to the
 *                        account's first workspace when omitted.
 * @param requireManage   when true, the caller must be an owner/admin (else 403). When
 *                        false (default), any active membership suffices (read access).
 */
export async function resolveWorkspaceSession(
  wantSlug: string | null,
  requireManage = false
): Promise<{ response: NextResponse } | { session: WorkspaceSession }> {
  const gate = saasAuthGate();
  if (gate) return { response: gate };

  const account = await getCurrentAccount();
  if (!account) {
    return { response: NextResponse.json({ error: 'not authenticated' }, { status: 401 }) };
  }

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

  if (requireManage && !canManageMembers(workspace.role)) {
    return {
      response: NextResponse.json(
        { error: 'this action requires an owner or admin role' },
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
