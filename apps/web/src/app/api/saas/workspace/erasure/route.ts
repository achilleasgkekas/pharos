import { NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceSession } from '@/lib/tenancy/workspaceSession';
import { readBody, strField } from '@/lib/apiBody';
import { saasGuard } from '@/lib/tenancy/saasApi';
import { recordAudit } from '@/lib/tenancy/audit';
import { Tenant } from '@/models/Tenant';
import {
  canEraseWorkspace,
  planErasureRequest,
  planErasureCancel,
  erasureView,
  isErasureRequested,
  ERASURE_GRACE_DAYS,
} from '@/lib/tenancy/erasure';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Workspace erasure lifecycle (SaaS control plane, GDPR Art. 17 right-to-erasure).
 *
 * An owner can SCHEDULE the permanent deletion of their workspace (POST) or CANCEL it while the
 * grace window is still open (DELETE). Any active member can READ the current erasure state (GET).
 * The request is a REVERSIBLE marker — the actual destructive drop of the tenant's isolated data
 * database happens only after the grace window elapses and is a separate, manual/gated flow, NEVER
 * performed by this route or an automated routine.
 *
 * Gating (via resolveWorkspaceSession, allowInactive=true so an owner mid-erasure — who may have
 * also canceled the workspace — can still read/cancel it):
 *   - SAAS_MODE off        → 404 (endpoint doesn't exist for the self-hosted app)
 *   - not signed in        → 401
 *   - not a member          → 403 (GET) / not the owner → 403 (POST/DELETE)
 *
 * Only reads/writes the control-plane Tenant doc; never touches a feature route, the per-tenant
 * data database, or the self-hosted User/bearer path.
 */

/** GET /api/saas/workspace/erasure[?tenant=<slug>] — current erasure state. Any active member. */
export async function GET(req: NextRequest) {
  return saasGuard(async () => {
    const slug = new URL(req.url).searchParams.get('tenant');
    const resolved = await resolveWorkspaceSession(slug, false, true);
    if ('response' in resolved) return resolved.response;
    const { session } = resolved;

    return NextResponse.json({
      workspace: session.workspace.slug,
      graceDays: ERASURE_GRACE_DAYS,
      erasure: erasureView(session.tenant),
    });
  });
}

/**
 * POST /api/saas/workspace/erasure — schedule permanent deletion after the grace window.
 * Owner only. Idempotent: an already-pending erasure returns its current state with no new audit.
 * Body: `{ tenant? }`.
 */
export async function POST(req: NextRequest) {
  return saasGuard(async () => {
    const body = await readBody(req);
    const resolved = await resolveWorkspaceSession(strField(body, 'tenant').trim() || null, false, true);
    if ('response' in resolved) return resolved.response;
    const { session } = resolved;

    if (!canEraseWorkspace(session.workspace.role)) {
      return NextResponse.json(
        { error: 'only the workspace owner can request erasure' },
        { status: 403 }
      );
    }

    // Idempotent: already scheduled → return current state, no new audit row.
    if (isErasureRequested(session.tenant.erasureRequestedAt)) {
      return NextResponse.json({
        workspace: session.workspace.slug,
        graceDays: ERASURE_GRACE_DAYS,
        erasure: erasureView(session.tenant),
      });
    }

    const update = planErasureRequest(session.account.sub);
    if (!update) {
      // account.sub blank — should never happen behind auth, but fail closed.
      return NextResponse.json({ error: 'could not attribute the erasure request' }, { status: 400 });
    }

    await Tenant.updateOne({ _id: session.ctx.tenantId }, update);
    session.tenant.erasureRequestedAt = update.$set.erasureRequestedAt;
    session.tenant.erasureScheduledAt = update.$set.erasureScheduledAt;
    session.tenant.erasureRequestedBy = update.$set.erasureRequestedBy;

    await recordAudit(session.ctx, {
      action: 'workspace.erasure_requested',
      actor: session.account.sub,
      target: session.workspace.slug,
      meta: { scheduledAt: update.$set.erasureScheduledAt.toISOString(), graceDays: ERASURE_GRACE_DAYS },
    });

    return NextResponse.json({
      workspace: session.workspace.slug,
      graceDays: ERASURE_GRACE_DAYS,
      erasure: erasureView(session.tenant),
    });
  });
}

/**
 * DELETE /api/saas/workspace/erasure[?tenant=<slug>] — cancel a pending erasure (owner changed
 * their mind within the grace window). Owner only. Idempotent: no pending erasure → no-op, no audit.
 */
export async function DELETE(req: NextRequest) {
  return saasGuard(async () => {
    const slug = new URL(req.url).searchParams.get('tenant');
    const resolved = await resolveWorkspaceSession(slug, false, true);
    if ('response' in resolved) return resolved.response;
    const { session } = resolved;

    if (!canEraseWorkspace(session.workspace.role)) {
      return NextResponse.json(
        { error: 'only the workspace owner can cancel erasure' },
        { status: 403 }
      );
    }

    // Idempotent: nothing pending → no-op, no audit row.
    if (!isErasureRequested(session.tenant.erasureRequestedAt)) {
      return NextResponse.json({
        workspace: session.workspace.slug,
        graceDays: ERASURE_GRACE_DAYS,
        erasure: erasureView(session.tenant),
      });
    }

    await Tenant.updateOne({ _id: session.ctx.tenantId }, planErasureCancel());
    session.tenant.erasureRequestedAt = null;
    session.tenant.erasureScheduledAt = null;
    session.tenant.erasureRequestedBy = null;

    await recordAudit(session.ctx, {
      action: 'workspace.erasure_canceled',
      actor: session.account.sub,
      target: session.workspace.slug,
    });

    return NextResponse.json({
      workspace: session.workspace.slug,
      graceDays: ERASURE_GRACE_DAYS,
      erasure: erasureView(session.tenant),
    });
  });
}
