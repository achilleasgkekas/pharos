// User-facing WORKSPACE SETTINGS panel (SaaS control plane) — the "General" tab flagged as a
// gap by the /api/saas/workspace route's own docstring: rename (PATCH), cancel (DELETE) and
// reactivate (POST .../reactivate) were all fully built with zero UI to drive them. This page
// is the client. SSR loads the workspace view directly from the control-plane collections
// (idiomatic; the page is already gated); the client WorkspaceSettingsPanel performs mutations
// against those three routes and refreshes. AiKeyPanel is the sibling for the BYO-key route
// (GET/PUT/DELETE /api/saas/workspace/ai-key, TODO §11/§14) — same idiom, initial masked status
// server-read here via describeTenantAiKey/byoKeyReady so the first paint needs no client fetch.
//
// Gating: the (saas) layout 404s the whole segment when SAAS_MODE is off / AUTH_SECRET missing.
// A logged-out viewer is redirected to /account/login. Any active member may VIEW this page;
// only owner/admin get the rename control and only the owner gets cancel/reactivate/AI-key —
// mirrored client-side from canManage/isOwner so the panel never offers an action the API would
// reject. Additive + SaaS-only — the self-hosted app never mounts this route, so it stays
// byte-for-byte unchanged.
import { redirect, notFound } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { getSaasViewer } from '@/lib/tenancy/saasPage';
import { accountTenants } from '@/lib/tenancy/saasApi';
import { getTenantContext } from '@/lib/tenancy/context';
import { Tenant, type TenantDoc } from '@/models/Tenant';
import { Membership } from '@/models/Membership';
import { canManageMembers } from '@/lib/tenancy/members';
import { workspaceView } from '@/lib/tenancy/workspace';
import { pickWorkspace } from '@/components/saas/chooseWorkspace';
import { workspaceTabs } from '@/components/saas/workspaceTabs';
import { WorkspaceShell } from '@/components/saas/WorkspaceShell';
import { WorkspaceSettingsPanel } from '@/components/saas/WorkspaceSettingsPanel';
import { AiKeyPanel } from '@/components/saas/AiKeyPanel';
import { byoKeyReady } from '@/lib/billing/byoKey';
import { describeTenantAiKey } from '@/lib/billing/byoKeyStore';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Settings · Pharos',
  robots: { index: false, follow: false },
};

export default async function WorkspaceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const { w } = await searchParams;

  const viewer = await getSaasViewer();
  if (!viewer) {
    const suffix = w ? `?w=${encodeURIComponent(w)}` : '';
    redirect(`/account/login?next=${encodeURIComponent(`/account/workspace/settings${suffix}`)}`);
  }

  await connectDB();
  const tenants = await accountTenants(viewer.sub);
  if (tenants.length === 0) {
    // Signed-in account with no workspace — send it to the overview which renders the empty state.
    redirect('/account/workspace');
  }

  const chosen = pickWorkspace(tenants, w);
  if (!chosen) notFound(); // a ?w= slug the account is not a member of

  // allowInactive: an owner must still reach this page on a canceled workspace to reactivate it
  // (mirrors GET /api/saas/workspace, which reads with allowInactive:true for the same reason).
  const ctx = await getTenantContext({ slug: chosen.slug });
  if (!ctx || !ctx.tenantId) notFound();

  const [tenant, memberCount, aiKeyMask] = await Promise.all([
    Tenant.findById(ctx.tenantId).lean() as Promise<TenantDoc | null>,
    Membership.countDocuments({ tenant: ctx.tenantId, status: 'active' }),
    describeTenantAiKey(ctx.tenantId),
  ]);
  if (!tenant) notFound();

  const view = workspaceView(tenant, chosen.role, memberCount);

  return (
    <WorkspaceShell
      workspaceName={chosen.name}
      plan={chosen.plan}
      status={chosen.status}
      role={chosen.role}
      tabs={workspaceTabs('settings', w)}
      switchTargets={tenants.map((t) => ({
        slug: t.slug,
        name: t.name,
        active: t.slug === chosen.slug,
      }))}
    >
      <div className="space-y-6">
        <WorkspaceSettingsPanel
          tenantSlug={chosen.slug}
          slug={view.slug}
          name={view.name}
          status={view.status}
          canManage={canManageMembers(chosen.role)}
          isOwner={chosen.role === 'owner'}
        />
        <AiKeyPanel
          tenantSlug={chosen.slug}
          canManage={canManageMembers(chosen.role)}
          cryptoReady={byoKeyReady()}
          initialKey={aiKeyMask}
        />
      </div>
    </WorkspaceShell>
  );
}
