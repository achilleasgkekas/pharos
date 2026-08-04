// User-facing BILLING settings page (SaaS control plane) — /account/workspace/billing. The third
// workspace-settings panel: it consolidates the plan ladder + this workspace's live billing state
// and drives the Stripe checkout/portal action routes (already built) from a client panel. SSR
// reads the billing summary directly (idiomatic; the page is already gated) instead of self-
// fetching /api/saas/billing; the BillingPanel does the POST → Stripe-hosted redirect.
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
import { buildBillingSummary } from '@/lib/billing/billingSummary';
import { stripeConfigured } from '@/lib/billing/stripe';
import { pickWorkspace } from '@/components/saas/chooseWorkspace';
import { workspaceTabs } from '@/components/saas/workspaceTabs';
import { workspaceUrl } from '@/components/saas/workspaceUrl';
import { WorkspaceShell, Panel, DefRow } from '@/components/saas/WorkspaceShell';
import { BillingPanel } from '@/components/saas/BillingPanel';
import { formatInt } from '@/components/saas/format';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Billing · Pharos',
  robots: { index: false, follow: false },
};

export default async function WorkspaceBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const { w } = await searchParams;

  const viewer = await getSaasViewer();
  if (!viewer) {
    const suffix = w ? `?w=${encodeURIComponent(w)}` : '';
    redirect(`/account/login?next=${encodeURIComponent(`/account/workspace/billing${suffix}`)}`);
  }

  await connectDB();
  const tenants = await accountTenants(viewer.sub);

  // A signed-in account with zero memberships has nothing to bill — send it to the Overview
  // page, which renders the shared "no workspace yet" empty state.
  if (tenants.length === 0) redirect('/account/workspace');

  const chosen = pickWorkspace(tenants, w);
  if (!chosen) notFound(); // a ?w= slug the account is not a member of

  const ctx = await getTenantContext({ slug: chosen.slug });
  if (!ctx || !ctx.tenantId) notFound();

  const tenant = (await Tenant.findById(ctx.tenantId).lean()) as TenantDoc | null;
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

  const trialNote =
    billing.trial.onTrial && billing.trial.daysLeft != null
      ? `Trial · ${billing.trial.daysLeft} day${billing.trial.daysLeft === 1 ? '' : 's'} left`
      : billing.trial.expired
        ? 'Trial ended'
        : null;

  return (
    <WorkspaceShell
      workspaceName={chosen.name}
      plan={chosen.plan}
      status={chosen.status}
      role={chosen.role}
      tabs={workspaceTabs('billing', w)}
      appUrl={workspaceUrl(chosen.slug, process.env.SAAS_PUBLIC_URL)}
      switchTargets={tenants.map((t) => ({
        slug: t.slug,
        name: t.name,
        active: t.slug === chosen.slug,
      }))}
    >
      <div className="space-y-6">
        <Panel title="Current subscription">
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
          <DefRow
            label="AI included"
            value={
              billing.plan.aiCallsPerMonth == null
                ? 'Unlimited'
                : `${formatInt(billing.plan.aiCallsPerMonth)} / mo`
            }
          />
          <DefRow label="Storage included" value={`${billing.plan.storageGB} GB`} />
        </Panel>

        <BillingPanel
          tenantSlug={chosen.slug}
          currentPlan={billing.plan.key}
          canManage={billing.canManage}
          billingConfigured={billing.billingConfigured}
          hasSubscription={billing.subscription.active}
        />
      </div>
    </WorkspaceShell>
  );
}
