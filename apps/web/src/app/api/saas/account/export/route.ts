import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Account } from '@/models/Account';
import { Membership } from '@/models/Membership';
import { Tenant, type TenantDoc } from '@/models/Tenant';
import { saasAuthGate, saasGuard } from '@/lib/tenancy/saasApi';
import { getCurrentAccount } from '@/lib/tenancy/accountSession';
import {
  buildAccountExport,
  accountExportFilename,
  type ExportMembershipInput,
} from '@/lib/tenancy/accountExport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/saas/account/export → download the caller's own personal data as JSON
 * (GDPR Art. 15 access + Art. 20 portability). SaaS-mode only (404 when SAAS_MODE off);
 * operates on the caller's own Account session and reads ONLY control-plane data (the
 * account profile + its memberships), never the self-hosted User/bearer path and never a
 * tenant's data database. The response is served as an attachment so a browser saves the file.
 */
export async function GET() {
  return saasGuard(async () => {
    const gate = saasAuthGate();
    if (gate) return gate;

    const claims = await getCurrentAccount();
    if (!claims) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    await connectDB();
    const account = await Account.findById(claims.sub)
      .select('_id email name emailVerified lastLoginAt createdAt updatedAt')
      .lean();
    if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    // All memberships (any status), so the export is a complete record of what the platform
    // knows about this identity, not just active ones.
    const memberships = await Membership.find({ account: claims.sub })
      .select('tenant role status createdAt')
      .lean();

    // Join each membership to its tenant's display fields in a single batched lookup.
    const tenantIds = memberships.map((m) => m.tenant);
    const tenants = (await Tenant.find({ _id: { $in: tenantIds } })
      .select('slug name plan status')
      .lean()) as unknown as TenantDoc[];
    const byId = new Map(tenants.map((t) => [String(t._id), t]));

    const joined: ExportMembershipInput[] = memberships.map((m) => {
      const t = byId.get(String(m.tenant));
      return {
        role: m.role,
        status: m.status,
        createdAt: m.createdAt,
        tenant: t ? { slug: t.slug, name: t.name, plan: t.plan, status: t.status } : null,
      };
    });

    const payload = buildAccountExport(account as never, joined, new Date());
    const accountId = String((account as { _id: unknown })._id);

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${accountExportFilename(accountId)}"`,
        'Cache-Control': 'no-store',
      },
    });
  });
}
