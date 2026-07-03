import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { saasAuthGate, accountTenants } from '@/lib/tenancy/saasApi';
import { getCurrentAccount } from '@/lib/tenancy/accountSession';
import { getTenantContext } from '@/lib/tenancy/context';
import { currentUsage, aiQuotaStatus, storageQuotaStatus } from '@/lib/billing/usage';
import { buildCostSummary } from '@/lib/billing/costSummary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/saas/usage[?tenant=<slug>]
 *
 * Current-period usage + quota status for one of the signed-in account's workspaces. This
 * is the read surface a billing/usage dashboard consumes (it exercises the whole metering
 * stack: session → membership → tenant context → ledger → quota math).
 *
 * SaaS-mode only (404 when SAAS_MODE off). Requires an account session. `?tenant=` picks a
 * workspace by slug (default: the first membership); the account must belong to it. Note
 * the default/self-hosted tenant reports `metered:false` with unlimited quotas — but this
 * endpoint only exists in SaaS mode, so callers here are always real tenants.
 */
export async function GET(req: Request) {
  const gate = saasAuthGate();
  if (gate) return gate;

  const claims = await getCurrentAccount();
  if (!claims) return NextResponse.json({ error: 'not authenticated' }, { status: 401 });

  await connectDB();
  const tenants = await accountTenants(claims.sub);
  if (tenants.length === 0) {
    return NextResponse.json({ error: 'no workspace for this account' }, { status: 404 });
  }

  const want = new URL(req.url).searchParams.get('tenant')?.trim().toLowerCase() || null;
  const chosen = want ? tenants.find((t) => t.slug === want) : tenants[0];
  if (!chosen) {
    return NextResponse.json({ error: 'not a member of that workspace' }, { status: 403 });
  }

  const ctx = await getTenantContext({ slug: chosen.slug });
  if (!ctx) return NextResponse.json({ error: 'workspace not found' }, { status: 404 });

  const usage = await currentUsage(ctx);
  return NextResponse.json({
    tenant: { slug: chosen.slug, name: chosen.name, plan: ctx.plan, status: ctx.status, role: chosen.role },
    period: usage.period,
    usage: {
      aiCalls: usage.aiCalls,
      aiInputTokens: usage.aiInputTokens,
      aiOutputTokens: usage.aiOutputTokens,
      aiCostMicros: usage.aiCostMicros,
      storageBytes: usage.storageBytes,
      metered: usage.metered,
    },
    quotas: {
      ai: aiQuotaStatus(ctx.plan, usage.aiCalls),
      storage: storageQuotaStatus(ctx.plan, usage.storageBytes),
    },
    cost: buildCostSummary({
      period: usage.period,
      aiCalls: usage.aiCalls,
      aiInputTokens: usage.aiInputTokens,
      aiOutputTokens: usage.aiOutputTokens,
      aiCostMicros: usage.aiCostMicros,
    }),
  });
}
