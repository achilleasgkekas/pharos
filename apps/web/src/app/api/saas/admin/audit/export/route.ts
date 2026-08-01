import { NextRequest, NextResponse } from 'next/server';
import { saasGuard } from '@/lib/tenancy/saasApi';
import { requireSuperadmin } from '@/lib/tenancy/superadmin';
import { listPlatformAudit } from '@/lib/tenancy/adminAudit';
import {
  parseAuditExportQuery,
  buildPlatformAuditCsv,
  platformAuditCsvFilename,
} from '@/lib/tenancy/adminAuditCsv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/saas/admin/audit/export[?tenant=&actor=&action=&from=&to=&limit=&before=] → the audit trail as
 * a CSV download (TODO §8 "Superadmin console"). Same query semantics as the /admin/audit page, so
 * the page's "Download CSV" link just carries the active filters over; `limit` is re-clamped
 * against the much larger export ceiling (see adminAuditCsv).
 *
 * Authorization is the platform-operator gate (requireSuperadmin), NOT per-workspace authz:
 *   - SAAS_MODE off / AUTH_SECRET unset      → 404 / 500 (endpoint absent for self-hosted)
 *   - SAAS_SUPERADMIN_EMAILS unset/empty     → 404 (console not enabled)
 *   - not signed in                          → 401
 *   - signed-in account not in the allowlist → 403
 *
 * An unknown `tenant` slug or `actor` email is reported as 404 JSON rather than served as a
 * header-only CSV: a typo'd slug or address must not look like "this workspace/person did
 * nothing", which is exactly the wrong conclusion to attach to a ticket.
 *
 * READ-ONLY: only the registry AuditEvent collection plus batched Account/Tenant identity lookups
 * (via listPlatformAudit); never a per-tenant data database, never a write. `no-store`.
 */
export async function GET(req: NextRequest) {
  return saasGuard(async () => {
    const gate = await requireSuperadmin();
    if ('response' in gate) return gate.response;

    const query = parseAuditExportQuery(new URL(req.url).searchParams);
    const { events, unknownTenant, unknownActor } = await listPlatformAudit(query);

    if (unknownTenant) {
      return NextResponse.json(
        { error: 'unknown workspace', tenant: query.tenant },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    if (unknownActor) {
      return NextResponse.json(
        { error: 'unknown actor', actor: query.actor },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const csv = buildPlatformAuditCsv(events);
    const filename = platformAuditCsvFilename(query);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  });
}
