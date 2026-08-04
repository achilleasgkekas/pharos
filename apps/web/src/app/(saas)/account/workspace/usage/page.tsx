// User-facing USAGE deep-dive (SaaS control plane). The detail view behind the Overview's
// summary Usage panel: current-period AI + storage consumption rendered as quota progress bars
// (with remaining + %) plus a token/cost breakdown. SSR consumes the already-built readers
// directly (currentUsage / aiQuotaStatus / storageQuotaStatus / buildCostSummary) — idiomatic,
// the page is already gated, no self-fetch of /api/saas/usage.
//
// Gating: the (saas) layout 404s the whole segment when SAAS_MODE is off / AUTH_SECRET missing.
// A logged-out viewer is redirected to /account/login. Everything here is additive + SaaS-only;
// the self-hosted app never mounts this route, so it stays byte-for-byte unchanged.
import { redirect, notFound } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { getSaasViewer } from '@/lib/tenancy/saasPage';
import { accountTenants } from '@/lib/tenancy/saasApi';
import { getTenantContext } from '@/lib/tenancy/context';
import { currentUsage, aiQuotaStatus, storageQuotaStatus } from '@/lib/billing/usage';
import { buildCostSummary } from '@/lib/billing/costSummary';
import { pickWorkspace } from '@/components/saas/chooseWorkspace';
import { workspaceTabs } from '@/components/saas/workspaceTabs';
import { workspaceUrl } from '@/components/saas/workspaceUrl';
import { WorkspaceShell, Panel, DefRow } from '@/components/saas/WorkspaceShell';
import { StatTile } from '@/components/saas/StatTile';
import { QuotaBar } from '@/components/saas/QuotaBar';
import { formatInt, formatBytes, formatCostMicros } from '@/components/saas/format';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Usage · Pharos',
  robots: { index: false, follow: false },
};

export default async function WorkspaceUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const { w } = await searchParams;

  // Gate (throws notFound when SaaS off) + current viewer claims.
  const viewer = await getSaasViewer();
  if (!viewer) {
    const suffix = w ? `?w=${encodeURIComponent(w)}` : '';
    redirect(`/account/login?next=${encodeURIComponent(`/account/workspace/usage${suffix}`)}`);
  }

  await connectDB();
  const tenants = await accountTenants(viewer.sub);

  // No membership yet — bounce to the Overview which owns the canonical empty state.
  if (tenants.length === 0) redirect('/account/workspace');

  const chosen = pickWorkspace(tenants, w);
  if (!chosen) notFound(); // a ?w= slug the account is not a member of

  const ctx = await getTenantContext({ slug: chosen.slug });
  if (!ctx || !ctx.tenantId) notFound();

  const usage = await currentUsage(ctx);
  const aiQuota = aiQuotaStatus(ctx.plan, usage.aiCalls);
  const storageQuota = storageQuotaStatus(ctx.plan, usage.storageBytes);
  const cost = buildCostSummary(
    {
      period: usage.period,
      aiCalls: usage.aiCalls,
      aiInputTokens: usage.aiInputTokens,
      aiOutputTokens: usage.aiOutputTokens,
      aiCostMicros: usage.aiCostMicros,
    },
    '€',
  );

  return (
    <WorkspaceShell
      workspaceName={chosen.name}
      plan={chosen.plan}
      status={chosen.status}
      role={chosen.role}
      tabs={workspaceTabs('usage', w)}
      appUrl={workspaceUrl(chosen.slug, process.env.SAAS_PUBLIC_URL)}
      switchTargets={tenants.map((t) => ({
        slug: t.slug,
        name: t.name,
        active: t.slug === chosen.slug,
      }))}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="AI calls" value={formatInt(usage.aiCalls)} accent="accent" />
          <StatTile label="Total tokens" value={formatInt(cost.totalTokens)} accent="cyan" />
          <StatTile label="Storage" value={formatBytes(usage.storageBytes)} accent="purple" />
          <StatTile
            label="AI cost · this month"
            value={formatCostMicros(usage.aiCostMicros, 'EUR')}
            accent="gold"
          />
        </div>

        <Panel title={`Quotas · ${usage.period}`}>
          <QuotaBar
            label="AI calls"
            used={aiQuota.used}
            limit={aiQuota.limit}
            ratio={aiQuota.ratio}
            format={formatInt}
          />
          <QuotaBar
            label="Storage"
            used={storageQuota.used}
            limit={storageQuota.limit}
            ratio={storageQuota.ratio}
            format={formatBytes}
          />
          {!usage.metered && (
            <p className="mt-3 text-xs text-[color:var(--color-text-faint)]">
              Metering is inactive for this workspace, so these figures stay at zero.
            </p>
          )}
        </Panel>

        <Panel title="AI token breakdown">
          <DefRow label="Input tokens" value={formatInt(cost.inputTokens)} />
          <DefRow label="Output tokens" value={formatInt(cost.outputTokens)} />
          <DefRow label="Total tokens" value={formatInt(cost.totalTokens)} />
          <DefRow label="Recorded calls" value={formatInt(cost.aiCalls)} />
          <DefRow
            label="Estimated cost"
            value={<span className="text-[color:var(--color-gold)]">{cost.costFormatted}</span>}
          />
          <p className="mt-3 text-xs text-[color:var(--color-text-dim)]">
            Cost is an estimate from metered token usage this billing period; the invoiced amount
            is settled through your subscription.
          </p>
        </Panel>
      </div>
    </WorkspaceShell>
  );
}
