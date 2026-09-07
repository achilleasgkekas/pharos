// User-facing WORKSPACE → AI panel (SaaS control plane). One home for a workspace's AI:
//   - AiKeyPanel: the BYO provider key (control-plane Tenant doc, /api/saas/workspace/ai-key)
//   - WorkspaceAiPanel: the master switch + per-feature toggles (per-tenant AppConfig, via
//     /api/saas/workspace/ai-config — the route exists because the account host cannot resolve a
//     workspace's tenant from the request host the way the self-host server actions do).
//
// This is why the product Settings → AI tab is hidden in hosted mode: everything a tenant
// controls about AI is here. Provider/model are not exposed — in hosted mode they follow the
// platform key (or the BYO key's provider), not a per-tenant free choice.
//
// Gating mirrors the sibling workspace pages: (saas) layout 404s the segment when SAAS_MODE is
// off; a logged-out viewer is redirected to login; any active member may VIEW; only owner/admin
// may CHANGE (canManage), enforced again server-side by the two routes. Additive + SaaS-only.
import { redirect, notFound } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { getSaasViewer } from '@/lib/tenancy/saasPage';
import { accountTenants } from '@/lib/tenancy/saasApi';
import { getTenantContext } from '@/lib/tenancy/context';
import { canManageMembers } from '@/lib/tenancy/members';
import { tenantDb, tenantModel } from '@/lib/tenancy/connection';
import { AppConfig } from '@/models/AppConfig';
import { pickWorkspace } from '@/components/saas/chooseWorkspace';
import { workspaceTabs } from '@/components/saas/workspaceTabs';
import { workspaceUrl } from '@/components/saas/workspaceUrl';
import { WorkspaceShell } from '@/components/saas/WorkspaceShell';
import { AiKeyPanel } from '@/components/saas/AiKeyPanel';
import { WorkspaceAiPanel } from '@/components/saas/WorkspaceAiPanel';
import { byoKeyReady } from '@/lib/billing/byoKey';
import { describeTenantAiKey } from '@/lib/billing/byoKeyStore';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'AI · Pharos',
  robots: { index: false, follow: false },
};

export default async function WorkspaceAiPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const { w } = await searchParams;

  const viewer = await getSaasViewer();
  if (!viewer) {
    const suffix = w ? `?w=${encodeURIComponent(w)}` : '';
    redirect(`/account/login?next=${encodeURIComponent(`/account/workspace/ai${suffix}`)}`);
  }

  await connectDB();
  const tenants = await accountTenants(viewer.sub);
  if (tenants.length === 0) redirect('/account/workspace');

  const chosen = pickWorkspace(tenants, w);
  if (!chosen) notFound();

  const ctx = await getTenantContext({ slug: chosen.slug });
  if (!ctx || !ctx.tenantId) notFound();

  // Read the workspace's AI master + feature map from ITS data database (not the registry).
  const Config = tenantModel(await tenantDb(ctx), AppConfig);
  const [doc, aiKeyMask] = await Promise.all([
    Config.findOne({ key: 'singleton' }).select('aiEnabled aiFeatures').lean() as Promise<
      { aiEnabled?: boolean; aiFeatures?: Record<string, boolean> } | null
    >,
    describeTenantAiKey(ctx.tenantId),
  ]);

  const canManage = canManageMembers(chosen.role);

  return (
    <WorkspaceShell
      workspaceName={chosen.name}
      plan={chosen.plan}
      status={chosen.status}
      role={chosen.role}
      tabs={workspaceTabs('ai', w)}
      appUrl={workspaceUrl(chosen.slug, process.env.SAAS_PUBLIC_URL)}
      switchTargets={tenants.map((t) => ({ slug: t.slug, name: t.name, active: t.slug === chosen.slug }))}
    >
      <div className="space-y-6">
        <AiKeyPanel
          tenantSlug={chosen.slug}
          canManage={canManage}
          cryptoReady={byoKeyReady()}
          initialKey={aiKeyMask}
        />
        <WorkspaceAiPanel
          tenantSlug={chosen.slug}
          canManage={canManage}
          initialEnabled={doc?.aiEnabled !== false}
          initialFeatures={(doc?.aiFeatures as Record<string, boolean>) || {}}
        />
      </div>
    </WorkspaceShell>
  );
}
