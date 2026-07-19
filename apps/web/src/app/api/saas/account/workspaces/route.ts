import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Membership } from '@/models/Membership';
import { readBody, strField } from '@/lib/apiBody';
import { saasAuthGate, saasGuard, accountTenants } from '@/lib/tenancy/saasApi';
import { getCurrentAccount } from '@/lib/tenancy/accountSession';
import { provisionTenant } from '@/lib/tenancy/provision';
import { recordAudit, auditCtx } from '@/lib/tenancy/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Mirrors components/saas/createWorkspace.ts MAX_WORKSPACE_NAME (server is authoritative).
const MAX_WORKSPACE_NAME = 80;

// Defensive cap on self-serve workspace creation per account. Not a pricing/plan concept
// (those live in lib/billing/entitlements) — just a sane ceiling so one account can't spin
// up an unbounded number of free-trialing tenants. Trivially raised later if a real user
// needs more; flagged in SAAS_PROGRESS.md as adjustable.
const MAX_WORKSPACES_PER_ACCOUNT = 20;

/**
 * POST /api/saas/account/workspaces { name }
 *   → provisions a brand-new Tenant + owner Membership for the CALLER's already-signed-in
 *     Account (the "create another workspace" flow from /account). Mirrors exactly what
 *     /api/saas/auth/signup does for a fresh signup, minus the Account creation — same
 *     `provisionTenant` helper, so slugging/trial-stamping/dedup behave identically.
 * SaaS-mode only (404 when SAAS_MODE off); requires an authenticated account session (401).
 */
export async function POST(req: NextRequest) {
  return saasGuard(async () => {
    const gate = saasAuthGate();
    if (gate) return gate;

    const claims = await getCurrentAccount();
    if (!claims) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const b = await readBody(req);
    const name = strField(b, 'name', '', true);
    if (!name) return NextResponse.json({ error: 'A workspace name is required' }, { status: 400 });
    if (name.length > MAX_WORKSPACE_NAME) {
      return NextResponse.json({ error: 'Workspace name is too long' }, { status: 400 });
    }

    await connectDB();

    const existing = await Membership.countDocuments({ account: claims.sub, status: 'active' });
    if (existing >= MAX_WORKSPACES_PER_ACCOUNT) {
      return NextResponse.json({ error: 'Workspace limit reached for this account' }, { status: 400 });
    }

    const tenant = await provisionTenant({ accountId: claims.sub, workspaceName: name });

    // The creator is the actor of their own new workspace. Uses the bare-tenant-id form of
    // auditCtx (same idiom as invites/accept and the billing webhook) since there is no
    // resolved workspace session yet for a tenant that didn't exist a moment ago.
    await recordAudit(auditCtx(tenant.tenantId), {
      action: 'workspace.created',
      actor: claims.sub,
      target: tenant.slug,
      meta: { name: tenant.name, selfServe: true },
    });

    return NextResponse.json(
      { tenant, tenants: await accountTenants(claims.sub) },
      { status: 201 }
    );
  });
}
