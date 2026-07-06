import { NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceSession } from '@/lib/tenancy/workspaceSession';
import { saasGuard } from '@/lib/tenancy/saasApi';
import { recordAudit } from '@/lib/tenancy/audit';
import {
  collectWorkspaceData,
  buildWorkspaceExport,
  workspaceExportFilename,
  resolveMaxDocs,
} from '@/lib/tenancy/workspaceExport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/saas/workspace/export[?tenant=<slug>] → download this workspace's CONTENT as JSON
 * (TODO §8 "Per-tenant … export", GDPR Art. 20 portability at the workspace level).
 *
 * This is the complement to /api/saas/account/export (which exports the login identity). It
 * dumps the workspace's isolated data database (Items, Receipts, …) as it is stored. Because
 * the export contains every member's data in the workspace, it is an owner/admin action
 * (data-controller responsibility), not self-service — `requireManage=true`. `allowInactive=
 * true` so a suspended/canceled workspace can still get its data out (portability must not be
 * gated on billing status).
 *
 * Gating (via resolveWorkspaceSession):
 *   - SAAS_MODE off       → 404 (endpoint doesn't exist for the self-hosted app)
 *   - not signed in       → 401
 *   - not owner/admin     → 403
 *
 * READ-ONLY on the per-tenant data database (raw collection dumps via `collectWorkspaceData`);
 * writes only the control-plane audit row. Never touches a feature route, the self-hosted
 * User/bearer path, or the default tenant's database. Served as an attachment, `no-store`.
 */
export async function GET(req: NextRequest) {
  return saasGuard(async () => {
    const slug = new URL(req.url).searchParams.get('tenant');
    const resolved = await resolveWorkspaceSession(slug, true, true);
    if ('response' in resolved) return resolved.response;
    const { session } = resolved;

    const maxDocs = resolveMaxDocs(process.env.WORKSPACE_EXPORT_MAX_DOCS);
    const collections = await collectWorkspaceData(session.ctx, maxDocs);

    const payload = buildWorkspaceExport(
      {
        slug: session.tenant.slug,
        name: session.tenant.name,
        plan: session.tenant.plan,
        status: session.tenant.status,
      },
      collections,
      new Date(),
      maxDocs
    );

    await recordAudit(session.ctx, {
      action: 'workspace.data_exported',
      actor: session.account.sub,
      target: session.workspace.slug,
      meta: {
        collections: collections.length,
        docs: collections.reduce((n, c) => n + c.count, 0),
        truncated: collections.some((c) => c.truncated),
      },
    });

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${workspaceExportFilename(session.tenant.slug)}"`,
        'Cache-Control': 'no-store',
      },
    });
  });
}
