import { NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceSession } from '@/lib/tenancy/workspaceSession';
import { Membership } from '@/models/Membership';
import { Tenant } from '@/models/Tenant';
import { readBody, strField } from '@/lib/apiBody';
import { sanitizeWorkspaceName, workspaceNameError, workspaceView } from '@/lib/tenancy/workspace';
import { recordAudit } from '@/lib/tenancy/audit';
import { saasGuard } from '@/lib/tenancy/saasApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Workspace self-service (SaaS control plane) — read a workspace's details and rename its
 * display name. Complements the members/invites/billing/usage/audit read surfaces so a
 * workspace-settings page has a "General" tab.
 *
 * Gating (via resolveWorkspaceSession): SAAS_MODE off → 404, not signed in → 401,
 * not a member → 403 (GET) / not owner-admin → 403 (PATCH). Only reads/writes control-plane
 * collections (Tenant/Membership); never touches a feature route, the per-tenant data
 * database, or the self-hosted User session. Slug/dbName are immutable routing keys and are
 * NOT changeable here.
 */

/** Count a workspace's active members for the view. */
async function activeMemberCount(tenantId: string): Promise<number> {
  return Membership.countDocuments({ tenant: tenantId, status: 'active' });
}

/** GET /api/saas/workspace[?tenant=<slug>] — workspace details. Any active member may read. */
export async function GET(req: NextRequest) {
  return saasGuard(async () => {
    const slug = new URL(req.url).searchParams.get('tenant');
    const resolved = await resolveWorkspaceSession(slug, false);
    if ('response' in resolved) return resolved.response;
    const { session } = resolved;

    const memberCount = await activeMemberCount(session.ctx.tenantId!);
    return NextResponse.json({
      workspace: workspaceView(session.tenant, session.workspace.role, memberCount),
    });
  });
}

/**
 * PATCH /api/saas/workspace — rename the workspace display name.
 * Body: `{ name, tenant? }`. Owner/admin only. Slug/dbName stay immutable.
 */
export async function PATCH(req: NextRequest) {
  return saasGuard(async () => {
    const body = await readBody(req);

    const resolved = await resolveWorkspaceSession(strField(body, 'tenant').trim() || null, true);
    if ('response' in resolved) return resolved.response;
    const { session } = resolved;

    const name = sanitizeWorkspaceName(body.name);
    const err = workspaceNameError(name);
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    const previous = String(session.tenant.name ?? '');
    if (name === previous) {
      // Nothing to change — return the current view without an audit row.
      const memberCount = await activeMemberCount(session.ctx.tenantId!);
      return NextResponse.json({
        workspace: workspaceView(session.tenant, session.workspace.role, memberCount),
      });
    }

    await Tenant.updateOne({ _id: session.ctx.tenantId }, { $set: { name } });
    session.tenant.name = name;

    await recordAudit(session.ctx, {
      action: 'workspace.updated',
      actor: session.account.sub,
      target: session.workspace.slug,
      meta: { field: 'name', from: previous, to: name },
    });

    const memberCount = await activeMemberCount(session.ctx.tenantId!);
    return NextResponse.json({
      workspace: workspaceView(session.tenant, session.workspace.role, memberCount),
    });
  });
}
