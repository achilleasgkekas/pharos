// User-facing WORKSPACE OVERVIEW (SaaS control plane). The signed-in account's landing for
// workspace settings: it consolidates the already-built read surfaces — workspace details,
// current-period usage + quotas, and the billing summary — into one server-rendered page.
// SSR consumes the readers directly (idiomatic; the page is already gated) instead of self-
// fetching /api/saas/*. Future increments add Members / Billing / Usage sub-tabs that reuse
// the same WorkspaceShell.
//
// Gating: the (saas) layout 404s the whole segment when SAAS_MODE is off / AUTH_SECRET missing.
// A logged-out viewer is redirected to /account/login. Everything here is additive + SaaS-only;
// the self-hosted app never mounts this route, so it stays byte-for-byte unchanged.
import { redirect, notFound } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { getSaasViewer } from '@/lib/tenancy/saasPage';
import { accountTenants } from '@/lib/tenancy/saasApi';
import { getTenantContext } from '@/lib/tenancy/context';
import { Tenant, type TenantDoc } from '@/models/Tenant';
import { Membership } from '@/models/Membership';
import { currentUsage, aiQuotaStatus, storageQuotaStatus } from '@/lib/billing/usage';
import { buildBillingSummary } from '@/lib/billing/billingSummary';
import { stripeConfigured } from '@/lib/billing/stripe';
import { pickWorkspace } from '@/components/saas/chooseWorkspace';
import { workspaceTabs } from '@/components/saas/workspaceTabs';
import { WorkspaceShell, Panel, DefRow } from '@/components/saas/WorkspaceShell';
import { StatTile } from '@/components/saas/StatTile';
import { formatInt, formatBytes, formatCostMicros, formatWhen } from '@/components/saas/format';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Workspace · Pharos',
  robots: { index: false, follow: false },
};

/** Render a quota as "used / limit" (or "used / ∞" when unlimited). */
function quotaLabel(used: string, limit: number | null, fmt: (n: number) => string): string {
  return limit === null ? `${used} / ∞` : `${used} / ${fmt(limit)}`;
}

export default async function WorkspaceOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const { w } = await searchParams;

  // Gate (throws notFound when SaaS off) + current viewer claims.
  const viewer = await getSaasViewer();
  if (!viewer) {
    const suffix = w ? `?w=${encodeURIComponent(w)}` : '';
    redirect(`/account/login?next=${encodeURIComponent(`/account/workspace${suffix}`)}`);
  }

  await connectDB();
  const tenants = await accountTenants(viewer.sub);

  // The account has no workspace yet — show a minimal empty state (no shell chrome needs a
  // workspace to render its badges). A signed-in account with zero memberships is a real state
  // (e.g. removed from its last workspace) so we never crash here.
  if (tenants.length === 0) {
    return (
      <div className="min-h-screen bg-[color:var(--color-bg)] px-4 py-16 text-[color:var(--color-text)]">
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-xl font-semibold">No workspace yet</h1>
          <p className="mt-2 text-sm text-[color:var(--color-text-dim)]">
            Your account is not a member of any workspace. Ask an owner to invite you, or create
            a new workspace to get started.
          </p>
        </div>
      </div>
    );
  }

  const chosen = pickWorkspace(tenants, w);
  if (!chosen) notFound(); // a ?w= slug the account is not a member of

  const ctx = await getTenantContext({ slug: chosen.slug });
  if (!ctx || !ctx.tenantId) notFound();

  const [tenant, memberCount, usage] = await Promise.all([
    Tenant.findById(ctx.tenantId).lean() as Promise<TenantDoc | null>,
    Membership.countDocuments({ tenant: ctx.tenantId, status: 'active' }),
    currentUsage(ctx),
  ]);
  if (!tenant) notFound();

  const billing = buildBillingSummary({
    plan: tenant.plan,
    status: tenant.status,
    role: chosen.role,
    billingCustomerId: tenant.billingCustomerId,
    billingSubscriptionId: tenant.billingSubscriptionId,
    trialEndsAt: tenant.trialEndsAt,
    billingConfigured: stripeConfigured(),
  });

  const aiQuota = aiQuotaStatus(ctx.plan, usage.aiCalls);
  const storageQuota = storageQuotaStatus(ctx.plan, usage.storageBytes);

  const trialNote =
    billing.trial.onTrial && billing.trial.daysLeft != null
      ? `Trial · ${billing.trial.daysLeft} day${billing.trial.daysLeft === 1 ? '' : 's'} left`
      : billing.trial.expired
        ? 'Trial ended'
        : null;

  const billingCta =
    billing.action === 'subscribe'
      ? billing.billingConfigured
        ? 'Subscribe from the Billing settings (coming soon).'
        : 'Billing is not configured on this deployment yet.'
      : billing.action === 'manage'
        ? 'Manage your subscription from the Billing settings (coming soon).'
        : 'Only owners and admins can change billing.';

  return (
    <WorkspaceShell
      workspaceName={chosen.name}
      plan={chosen.plan}
      status={chosen.status}
      role={chosen.role}
      tabs={workspaceTabs('overview', w)}
      switchTargets={tenants.map((t) => ({
        slug: t.slug,
        name: t.name,
        active: t.slug === chosen.slug,
      }))}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Members" value={formatInt(memberCount)} accent="cyan" />
          <StatTile
            label="AI calls"
            value={formatInt(usage.aiCalls)}
            sub={quotaLabel(formatInt(usage.aiCalls), aiQuota.limit, formatInt)}
            accent="accent"
          />
          <StatTile
            label="Storage"
            value={formatBytes(usage.storageBytes)}
            sub={quotaLabel(formatBytes(usage.storageBytes), storageQuota.limit, formatBytes)}
            accent="purple"
          />
          <StatTile
            label="AI cost · this month"
            value={formatCostMicros(usage.aiCostMicros, 'EUR')}
            accent="gold"
          />
        </div>

        <Panel title="Workspace">
          <DefRow label="Slug" value={<span className="font-mono">{chosen.slug}</span>} />
          <DefRow
            label="Custom domain"
            value={
              tenant.customDomain ? (
                <span className="font-mono">{tenant.customDomain}</span>
              ) : (
                <span className="text-[color:var(--color-text-faint)]">—</span>
              )
            }
          />
          <DefRow label="Isolation tier" value={<span className="capitalize">{ctx.plan === 'dedicated' ? 'dedicated' : String(tenant.tier ?? 'shared')}</span>} />
          <DefRow label="Created" value={formatWhen(tenant.createdAt as unknown as string)} />
        </Panel>

        <Panel title="Plan & billing">
          <DefRow label="Plan" value={billing.plan.name} />
          <DefRow
            label="Price"
            value={
              billing.plan.priceMonthlyEUR > 0
                ? `€${billing.plan.priceMonthlyEUR} / mo`
                : 'Free'
            }
          />
          <DefRow
            label="Subscription"
            value={
              billing.subscription.active ? (
                <span className="text-[color:var(--color-accent)]">Active</span>
              ) : (
                <span className="text-[color:var(--color-text-faint)]">None</span>
              )
            }
          />
          {trialNote && <DefRow label="Trial" value={trialNote} />}
          <DefRow label="AI included" value={billing.plan.aiCallsPerMonth == null ? 'Unlimited' : `${formatInt(billing.plan.aiCallsPerMonth)} / mo`} />
          <DefRow label="Storage included" value={`${billing.plan.storageGB} GB`} />
          <p className="mt-3 text-xs text-[color:var(--color-text-dim)]">{billingCta}</p>
        </Panel>

        <Panel title={`Usage · ${usage.period}`}>
          <DefRow
            label="AI calls"
            value={quotaLabel(formatInt(usage.aiCalls), aiQuota.limit, formatInt)}
          />
          <DefRow label="Input tokens" value={formatInt(usage.aiInputTokens)} />
          <DefRow label="Output tokens" value={formatInt(usage.aiOutputTokens)} />
          <DefRow
            label="Storage"
            value={quotaLabel(formatBytes(usage.storageBytes), storageQuota.limit, formatBytes)}
          />
          <DefRow label="Estimated AI cost" value={formatCostMicros(usage.aiCostMicros, 'EUR')} />
          {!usage.metered && (
            <p className="mt-3 text-xs text-[color:var(--color-text-faint)]">
              Metering is inactive for this workspace.
            </p>
          )}
        </Panel>
      </div>
    </WorkspaceShell>
  );
}
