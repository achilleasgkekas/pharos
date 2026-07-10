// User-facing ACTIVITY trail (SaaS control plane). The read surface for the workspace audit
// log: who did what (members added/removed, roles changed, invites minted/revoked, plan and
// workspace changes), newest first. SSR reads the control-plane AuditEvent collection directly
// (the page is already gated) and resolves every actor's identity in ONE batched Account lookup
// — never a self-fetch of /api/saas/audit, never N+1.
//
// Gating: the (saas) layout 404s the whole segment when SAAS_MODE is off / AUTH_SECRET missing.
// A logged-out viewer is redirected to /account/login. Viewing the trail is a management action,
// so a plain member sees a read-only "not available" notice (mirrors the audit route's 403 rule)
// rather than the log. Everything here is additive + SaaS-only; the self-hosted app never mounts
// this route, so it stays byte-for-byte unchanged.
import type { ReactNode } from 'react';
import { redirect, notFound } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { getSaasViewer } from '@/lib/tenancy/saasPage';
import { accountTenants } from '@/lib/tenancy/saasApi';
import { getTenantContext } from '@/lib/tenancy/context';
import { canManageMembers } from '@/lib/tenancy/members';
import { auditView, collectActorIds } from '@/lib/tenancy/audit';
import { AuditEvent, type AuditEventDoc } from '@/models/AuditEvent';
import { Account } from '@/models/Account';
import { pickWorkspace } from '@/components/saas/chooseWorkspace';
import { workspaceTabs } from '@/components/saas/workspaceTabs';
import { WorkspaceShell, Panel } from '@/components/saas/WorkspaceShell';
import { ActivityPanel } from '@/components/saas/ActivityPanel';
import { toActivityRows, type ActivityInput } from '@/components/saas/activityView';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Activity · Pharos',
  robots: { index: false, follow: false },
};

// Show a bounded, snappy window of recent activity; the full trail paginates via the API.
const PAGE_LIMIT = 50;

export default async function WorkspaceActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const { w } = await searchParams;

  // Gate (throws notFound when SaaS off) + current viewer claims.
  const viewer = await getSaasViewer();
  if (!viewer) {
    const suffix = w ? `?w=${encodeURIComponent(w)}` : '';
    redirect(`/account/login?next=${encodeURIComponent(`/account/workspace/activity${suffix}`)}`);
  }

  await connectDB();
  const tenants = await accountTenants(viewer.sub);

  // No membership yet — bounce to the Overview which owns the canonical empty state.
  if (tenants.length === 0) redirect('/account/workspace');

  const chosen = pickWorkspace(tenants, w);
  if (!chosen) notFound(); // a ?w= slug the account is not a member of

  const ctx = await getTenantContext({ slug: chosen.slug });
  if (!ctx || !ctx.tenantId) notFound();

  const shell = (body: ReactNode) => (
    <WorkspaceShell
      workspaceName={chosen.name}
      plan={chosen.plan}
      status={chosen.status}
      role={chosen.role}
      tabs={workspaceTabs('activity', w)}
      switchTargets={tenants.map((t) => ({
        slug: t.slug,
        name: t.name,
        active: t.slug === chosen.slug,
      }))}
    >
      {body}
    </WorkspaceShell>
  );

  // Viewing the audit trail is a management action — a plain member gets a read-only notice
  // instead of the log (parity with GET /api/saas/audit's 403).
  if (!canManageMembers(chosen.role)) {
    return shell(
      <Panel title="Activity">
        <p className="py-4 text-sm text-[color:var(--color-text-dim)]">
          The activity log is available to workspace owners and admins.
        </p>
      </Panel>,
    );
  }

  const events = (await AuditEvent.find({ tenant: ctx.tenantId })
    .select('action actor target meta createdAt')
    .sort({ createdAt: -1 })
    .limit(PAGE_LIMIT)
    .lean()) as unknown as (AuditEventDoc & { createdAt?: Date })[];

  // Resolve every actor's email + display name in ONE batched lookup (never N+1). System
  // events (null actor) and deleted accounts simply have no entry.
  const actorIds = collectActorIds(events);
  const emailById = new Map<string, string>();
  const nameById = new Map<string, string>();
  if (actorIds.length) {
    const accounts = (await Account.find({ _id: { $in: actorIds } })
      .select('email name')
      .lean()) as unknown as { _id: unknown; email?: string | null; name?: string | null }[];
    for (const a of accounts) {
      const id = String(a._id);
      if (a.email) emailById.set(id, a.email);
      const name = a.name?.trim();
      if (name) nameById.set(id, name);
    }
  }

  const views: ActivityInput[] = events.map((ev) => {
    const id = ev.actor != null ? String(ev.actor) : null;
    return auditView(
      ev,
      id ? emailById.get(id) ?? null : null,
      id ? nameById.get(id) ?? null : null,
    );
  });
  const rows = toActivityRows(views);

  return shell(
    <Panel title={`Activity · latest ${rows.length}`}>
      <ActivityPanel rows={rows} />
    </Panel>,
  );
}
