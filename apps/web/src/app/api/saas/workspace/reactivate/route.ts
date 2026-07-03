import { NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceSession } from '@/lib/tenancy/workspaceSession';
import { Membership } from '@/models/Membership';
import { Tenant } from '@/models/Tenant';
import { readBody, strField } from '@/lib/apiBody';
import {
  canReactivateWorkspace,
  reactivateStatusError,
  workspaceView,
} from '@/lib/tenancy/workspace';
import { recordAudit } from '@/lib/tenancy/audit';
import { saasGuard } from '@/lib/tenancy/saasApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Workspace reactivation (SaaS control plane) — reverse an owner-initiated soft-cancel by
 * setting `status:'active'`. The natural complement of DELETE /api/saas/workspace (soft
 * cancel): since cancel blocks access for everyone, an owner needs a way back in.
 *
 * Owner only (mirrors the cancel gate). Resolves with allowInactive:true because the tenant
 * is canceled (the status gate would otherwise 403 it). Only a soft-`canceled` workspace can
 * be reactivated here: a `suspended` tenant is a billing hold cleared by paying, not a manual
 * flip. SAAS-gated (404 when SAAS_MODE off); never touches a feature route, the per-tenant
 * data database, or the self-hosted User session.
 */

/** Count a workspace's active members for the view. */
async function activeMemberCount(tenantId: string): Promise<number> {
  return Membership.countDocuments({ tenant: tenantId, status: 'active' });
}

/** POST /api/saas/workspace/reactivate — body `{ tenant? }`. Owner only, canceled → active. */
export async function POST(req: NextRequest) {
  return saasGuard(async () => {
    const body = await readBody(req);
    // Resolve as any active member (allowInactive so the canceled tenant is reachable), then
    // enforce the stricter owner-only gate below.
    const resolved = await resolveWorkspaceSession(strField(body, 'tenant').trim() || null, false, true);
    if ('response' in resolved) return resolved.response;
    const { session } = resolved;

    if (!canReactivateWorkspace(session.workspace.role)) {
      return NextResponse.json(
        { error: 'only the workspace owner can reactivate it' },
        { status: 403 }
      );
    }

    const previous = String(session.tenant.status ?? '');
    const statusErr = reactivateStatusError(previous);
    if (statusErr) {
      return NextResponse.json({ error: statusErr }, { status: 409 });
    }

    await Tenant.updateOne({ _id: session.ctx.tenantId }, { $set: { status: 'active' } });
    session.tenant.status = 'active';

    await recordAudit(session.ctx, {
      action: 'workspace.reactivated',
      actor: session.account.sub,
      target: session.workspace.slug,
      meta: { field: 'status', from: previous, to: 'active' },
    });

    const memberCount = await activeMemberCount(session.ctx.tenantId!);
    return NextResponse.json({
      workspace: workspaceView(session.tenant, session.workspace.role, memberCount),
    });
  });
}
