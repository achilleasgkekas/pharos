import { NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceSession } from '@/lib/tenancy/workspaceSession';
import { saasGuard } from '@/lib/tenancy/saasApi';
import { recordAudit } from '@/lib/tenancy/audit';
import {
  collectWorkspaceFileRefs,
  statWorkspaceFiles,
  buildFileManifest,
  workspaceFilesManifestFilename,
} from '@/lib/tenancy/workspaceFiles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/saas/workspace/export/files[?tenant=<slug>] → the binary-file MANIFEST for this
 * workspace (TODO §8 "Per-tenant … export", GDPR Art. 20 portability at the file level).
 *
 * Complement to /api/saas/workspace/export (which dumps the Mongo collections): receipt/
 * statement PDFs and item photos live on disk under STORAGE_ROOT, not in Mongo. This lists
 * exactly which files belong to the workspace (derived from that workspace's own doc
 * references), whether each is present on disk, and the total byte size. It is REPORT-ONLY —
 * no file contents are read and no archive is produced; packaging the binaries is a separate,
 * deferred step (see SAAS_PROGRESS.md "Needs Achilleas").
 *
 * Same owner/admin authz as the content export (the manifest describes every member's files →
 * data-controller action, `requireManage=true`); `allowInactive=true` so a suspended/canceled
 * workspace can still audit its own files (portability must not be gated on billing status).
 *
 * Gating (via resolveWorkspaceSession):
 *   - SAAS_MODE off       → 404 (endpoint doesn't exist for the self-hosted app)
 *   - not signed in       → 401
 *   - not owner/admin     → 403
 *
 * READ-ONLY on both the per-tenant data database (projected file-ref reads) and the filesystem
 * (stat only, never content); writes only the control-plane audit row. Never touches a feature
 * route, the self-hosted User/bearer path, or the default tenant's database/storage. Served as
 * an attachment, `no-store`.
 */
export async function GET(req: NextRequest) {
  return saasGuard(async () => {
    const slug = new URL(req.url).searchParams.get('tenant');
    const resolved = await resolveWorkspaceSession(slug, true, true);
    if ('response' in resolved) return resolved.response;
    const { session } = resolved;

    const refs = await collectWorkspaceFileRefs(session.ctx);
    const entries = await statWorkspaceFiles(refs);

    const payload = buildFileManifest(
      {
        slug: session.tenant.slug,
        name: session.tenant.name,
        plan: session.tenant.plan,
        status: session.tenant.status,
      },
      entries,
      new Date()
    );

    await recordAudit(session.ctx, {
      action: 'workspace.files_manifested',
      actor: session.account.sub,
      target: session.workspace.slug,
      meta: {
        files: payload.totals.files,
        present: payload.totals.present,
        missing: payload.totals.missing,
        bytes: payload.totals.bytes,
      },
    });

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${workspaceFilesManifestFilename(session.tenant.slug)}"`,
        'Cache-Control': 'no-store',
      },
    });
  });
}
