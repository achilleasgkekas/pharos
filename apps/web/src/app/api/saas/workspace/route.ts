import { NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceSession } from '@/lib/tenancy/workspaceSession';
import { Membership } from '@/models/Membership';
import { Tenant } from '@/models/Tenant';
import { readBody, strField } from '@/lib/apiBody';
import {
  canCancelWorkspace,
  sanitizeWorkspaceName,
  workspaceNameError,
  workspaceView,
} from '@/lib/tenancy/workspace';
import { recordAudit } from '@/lib/tenancy/audit';
import { planStatusChange } from '@/lib/billing/statusAudit';
import { saasGuard } from '@/lib/tenancy/saasApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Workspace self-service (SaaS control plane) — read a workspace's details and rename its
 * display name. Complements the members/invites/billing/usage/audit read surfaces so a
 * workspace-settings page has a "General" tab.
 *
 * Gating (via resolveWorkspaceSession): SAAS_MODE off → 404, not signed in → 401,
 * not a member → 403 (GET) / not owner-admin → 403 (PATCH) / not owner → 403 (DELETE).
 * Only reads/writes control-plane collections (Tenant/Membership); never touches a feature
 * route, the per-tenant data database, or the self-hosted User session. Slug/dbName are
 * immutable routing keys and are NOT changeable here.
 *
 * DELETE is a SOFT cancel (`status:'canceled'`) only — the destructive drop of the tenant's
 * isolated data database is a separate manual flow, never performed by an automated routine.
 */

/** Count a workspace's active members for the view. */
async function activeMemberCount(tenantId: string): Promise<number> {
  return Membership.countDocuments({ tenant: tenantId, status: 'active' });
}

/** GET /api/saas/workspace[?tenant=<slug>] — workspace details. Any active member may read. */
export async function GET(req: NextRequest) {
  return saasGuard(async () => {
    const slug = new URL(req.url).searchParams.get('tenant');
    // allowInactive: an owner must still be able to view a suspended/canceled workspace (to
    // see its status and, later, reactivate it). Management routes stay status-enforced.
    const resolved = await resolveWorkspaceSession(slug, false, true);
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

/**
 * DELETE /api/saas/workspace[?tenant=<slug>] — soft-cancel the workspace.
 * Owner only. Sets `status:'canceled'` (blocks access; reversible via a separate reactivate
 * flow). Does NOT drop the tenant's data database — that destructive step is a manual op.
 * Idempotent: an already-canceled workspace returns its current view with no new audit row.
 */
export async function DELETE(req: NextRequest) {
  return saasGuard(async () => {
    const slug = new URL(req.url).searchParams.get('tenant');
    // Resolve as any active member first, then enforce the stricter owner-only gate below
    // (resolveWorkspaceSession's requireManage flag only reaches owner/admin). allowInactive
    // so cancel stays idempotent on an already-canceled workspace (returns current view).
    const resolved = await resolveWorkspaceSession(slug, false, true);
    if ('response' in resolved) return resolved.response;
    const { session } = resolved;

    if (!canCancelWorkspace(session.workspace.role)) {
      return NextResponse.json(
        { error: 'only the workspace owner can cancel it' },
        { status: 403 }
      );
    }

    const previous = String(session.tenant.status ?? '');
    if (previous === 'canceled') {
      // Already canceled — no-op, no audit row.
      const memberCount = await activeMemberCount(session.ctx.tenantId!);
      return NextResponse.json({
        workspace: workspaceView(session.tenant, session.workspace.role, memberCount),
      });
    }

    // The cancel now carries its own deletion date (30 days, the window the Terms promise) instead
    // of leaving the workspace in a status with no exit: before this, a canceled workspace was
    // stamped with nothing and lived forever. An erasure the owner already requested separately is
    // left untouched — planStatusChange refuses to push a pending schedule later.
    const fields = planStatusChange({
      prev: previous,
      next: 'canceled',
      erasureScheduledAt: session.tenant.erasureScheduledAt ?? null,
      erasureRequestedBy: session.tenant.erasureRequestedBy ?? null,
    });
    await Tenant.updateOne({ _id: session.ctx.tenantId }, { $set: fields });
    Object.assign(session.tenant, fields);

    await recordAudit(session.ctx, {
      action: 'workspace.canceled',
      actor: session.account.sub,
      target: session.workspace.slug,
      meta: {
        field: 'status',
        from: previous,
        to: 'canceled',
        // The date the owner is owed, on the row that records the cancel.
        erasureScheduledAt: (fields.erasureScheduledAt as Date | undefined)?.toISOString() ?? null,
      },
    });

    const memberCount = await activeMemberCount(session.ctx.tenantId!);
    return NextResponse.json({
      workspace: workspaceView(session.tenant, session.workspace.role, memberCount),
    });
  });
}
