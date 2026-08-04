// User-facing MEMBERS settings panel (SaaS control plane). Lists the workspace's members and
// outstanding invitations, and — for owners/admins — lets them invite/add, change roles, and
// remove members or revoke invites. SSR loads the initial roster + pending invites directly from
// the control-plane collections (idiomatic; the page is already gated); the client MembersPanel
// performs mutations against /api/saas/members + /api/saas/invites and refreshes.
//
// Gating: the (saas) layout 404s the whole segment when SAAS_MODE is off / AUTH_SECRET missing.
// A logged-out viewer is redirected to /account/login. Any active member may VIEW the roster
// (matching the GET route); only owner/admin get the management controls (`canManage`). Additive
// + SaaS-only — the self-hosted app never mounts this route, so it stays byte-for-byte unchanged.
import { redirect, notFound } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { getSaasViewer } from '@/lib/tenancy/saasPage';
import { accountTenants } from '@/lib/tenancy/saasApi';
import { getTenantContext } from '@/lib/tenancy/context';
import { Membership, type MembershipDoc } from '@/models/Membership';
import { Account, type AccountDoc } from '@/models/Account';
import { Invite, type InviteDoc } from '@/models/Invite';
import { inviteView } from '@/lib/tenancy/invites';
import { canManageMembers } from '@/lib/tenancy/members';
import { pickWorkspace } from '@/components/saas/chooseWorkspace';
import { workspaceTabs } from '@/components/saas/workspaceTabs';
import { workspaceUrl } from '@/components/saas/workspaceUrl';
import { WorkspaceShell } from '@/components/saas/WorkspaceShell';
import { MembersPanel, type MemberRow, type InviteRow } from '@/components/saas/MembersPanel';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Members · Pharos',
  robots: { index: false, follow: false },
};

/** Load a workspace's non-removed memberships joined to account email/name (mirrors the
 *  /api/saas/members GET reader; batched account lookup, never N+1). */
async function loadMembers(tenantId: string): Promise<MemberRow[]> {
  const memberships = (await Membership.find({ tenant: tenantId, status: { $ne: 'removed' } })
    .select('account role status')
    .lean()) as unknown as MembershipDoc[];

  const accounts = (await Account.find({ _id: { $in: memberships.map((m) => m.account) } })
    .select('email name')
    .lean()) as unknown as AccountDoc[];
  const byId = new Map(accounts.map((a) => [String(a._id), a]));

  return memberships.map((m) => {
    const a = byId.get(String(m.account));
    return {
      accountId: String(m.account),
      email: a?.email ?? '',
      name: a?.name ?? '',
      role: String(m.role),
      status: String(m.status),
    };
  });
}

/** Load the workspace's still-pending invitations (email/role/expired only). */
async function loadInvites(tenantId: string): Promise<InviteRow[]> {
  const invites = (await Invite.find({ tenant: tenantId, status: 'pending' })
    .select('email role status expires createdAt')
    .sort({ createdAt: -1 })
    .lean()) as unknown as InviteDoc[];
  return invites.map((inv) => {
    const v = inviteView(inv);
    return { id: v.id, email: v.email, role: v.role, expired: v.expired };
  });
}

export default async function WorkspaceMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const { w } = await searchParams;

  const viewer = await getSaasViewer();
  if (!viewer) {
    const suffix = w ? `?w=${encodeURIComponent(w)}` : '';
    redirect(`/account/login?next=${encodeURIComponent(`/account/workspace/members${suffix}`)}`);
  }

  await connectDB();
  const tenants = await accountTenants(viewer.sub);
  if (tenants.length === 0) {
    // Signed-in account with no workspace — send it to the overview which renders the empty state.
    redirect('/account/workspace');
  }

  const chosen = pickWorkspace(tenants, w);
  if (!chosen) notFound(); // a ?w= slug the account is not a member of

  const ctx = await getTenantContext({ slug: chosen.slug });
  if (!ctx || !ctx.tenantId) notFound();

  const canManage = canManageMembers(chosen.role);
  const [members, invites] = await Promise.all([
    loadMembers(ctx.tenantId),
    // Only owners/admins can act on invites; skip the read entirely for plain members.
    canManage ? loadInvites(ctx.tenantId) : Promise.resolve<InviteRow[]>([]),
  ]);

  return (
    <WorkspaceShell
      workspaceName={chosen.name}
      plan={chosen.plan}
      status={chosen.status}
      role={chosen.role}
      tabs={workspaceTabs('members', w)}
      appUrl={workspaceUrl(chosen.slug, process.env.SAAS_PUBLIC_URL)}
      switchTargets={tenants.map((t) => ({
        slug: t.slug,
        name: t.name,
        active: t.slug === chosen.slug,
      }))}
    >
      <MembersPanel
        tenantSlug={chosen.slug}
        viewerAccountId={viewer.sub}
        canManage={canManage}
        isOwner={chosen.role === 'owner'}
        members={members}
        invites={invites}
      />
    </WorkspaceShell>
  );
}
