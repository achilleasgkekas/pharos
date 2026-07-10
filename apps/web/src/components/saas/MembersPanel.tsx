'use client';

// Client interactivity for the user-facing Members settings panel
// ((saas)/account/workspace/members). Consumes the already-built control-plane routes:
//   /api/saas/members  (GET list [SSR], POST add/invite, PATCH role, DELETE remove)
//   /api/saas/invites  (DELETE revoke a pending invite)
// The page server-renders the initial members + pending invites; every mutation here calls the
// route with the chosen workspace slug (so `?w=` stays correct) and then router.refresh() so the
// server re-reads the source of truth. Only ever mounted inside the SAAS_MODE-gated (saas)
// segment; when the viewer is a plain member (`canManage` false) it renders a read-only roster.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pill, MemberRoleBadge, MemberStatusBadge } from './StatusBadge';
import { ORG_ROLES, type OrgRole } from '@/lib/tenancy/members';

export type MemberRow = {
  accountId: string;
  email: string;
  name: string;
  role: string;
  status: string;
};

export type InviteRow = {
  id: string;
  email: string;
  role: string;
  expired: boolean;
};

type Props = {
  tenantSlug: string;
  viewerAccountId: string;
  canManage: boolean;
  isOwner: boolean;
  members: MemberRow[];
  invites: InviteRow[];
};

/** Roles this actor may assign: an admin cannot mint owners (mirrors canAssignRole). */
function assignableRoles(isOwner: boolean): OrgRole[] {
  return isOwner ? [...ORG_ROLES] : ORG_ROLES.filter((r) => r !== 'owner');
}

async function callJson(
  url: string,
  method: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON body (shouldn't happen for these routes) → keep an empty object.
  }
  return { ok: res.ok, data };
}

export function MembersPanel({
  tenantSlug,
  viewerAccountId,
  canManage,
  isOwner,
  members,
  invites,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('member');

  const roles = assignableRoles(isOwner);

  function fail(data: Record<string, unknown>, fallback: string) {
    setError(typeof data.error === 'string' ? data.error : fallback);
    setNotice(null);
  }

  async function changeRole(accountId: string, role: string) {
    if (busy) return;
    setBusy(accountId);
    setError(null);
    setNotice(null);
    const { ok, data } = await callJson('/api/saas/members', 'PATCH', {
      accountId,
      role,
      tenant: tenantSlug,
    });
    setBusy(null);
    if (!ok) return fail(data, 'Could not change role');
    router.refresh();
  }

  async function removeMember(accountId: string, email: string) {
    if (busy) return;
    if (!window.confirm(`Remove ${email || 'this member'} from the workspace?`)) return;
    setBusy(accountId);
    setError(null);
    setNotice(null);
    const { ok, data } = await callJson('/api/saas/members', 'DELETE', {
      accountId,
      tenant: tenantSlug,
    });
    setBusy(null);
    if (!ok) return fail(data, 'Could not remove member');
    router.refresh();
  }

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const email = inviteEmail.trim();
    if (!email) return;
    setBusy('invite');
    setError(null);
    setNotice(null);
    const { ok, data } = await callJson('/api/saas/members', 'POST', {
      email,
      role: inviteRole,
      tenant: tenantSlug,
    });
    setBusy(null);
    if (!ok) return fail(data, 'Could not add member');
    setInviteEmail('');
    if (data.inviteByEmail) {
      const dev = typeof data.devToken === 'string' ? ` (dev token: ${data.devToken})` : '';
      setNotice(`Invitation sent to ${email}.${dev}`);
    } else {
      setNotice(`${email} added to the workspace.`);
    }
    router.refresh();
  }

  async function revokeInvite(id: string, email: string) {
    if (busy) return;
    if (!window.confirm(`Revoke the invitation for ${email || 'this address'}?`)) return;
    setBusy(id);
    setError(null);
    setNotice(null);
    const { ok, data } = await callJson('/api/saas/invites', 'DELETE', {
      inviteId: id,
      tenant: tenantSlug,
    });
    setBusy(null);
    if (!ok) return fail(data, 'Could not revoke invitation');
    router.refresh();
  }

  const active = members.filter((m) => m.status !== 'removed');

  return (
    <div className="space-y-6">
      {(error || notice) && (
        <div
          role="status"
          className={
            error
              ? 'rounded-lg border border-[color:var(--color-red)]/45 bg-[color:var(--color-red)]/10 px-3 py-2 text-sm text-[color:var(--color-red)]'
              : 'rounded-lg border border-[color:var(--color-accent)]/45 bg-[color:var(--color-accent)]/10 px-3 py-2 text-sm text-[color:var(--color-accent)]'
          }
        >
          {error || notice}
        </div>
      )}

      {/* Roster */}
      <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
        <h2 className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
          Members · {active.length}
        </h2>
        <ul className="mt-3 divide-y divide-[color:var(--color-border)]">
          {active.map((m) => {
            const isSelf = m.accountId === viewerAccountId;
            const rowBusy = busy === m.accountId;
            return (
              <li
                key={m.accountId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-[color:var(--color-text)]">
                      {m.name || m.email || 'Unknown'}
                    </span>
                    {isSelf && <Pill tone="cyan">you</Pill>}
                  </div>
                  {m.name && m.email && (
                    <div className="truncate text-xs text-[color:var(--color-text-dim)]">
                      {m.email}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <MemberStatusBadge status={m.status} />
                  {canManage ? (
                    <select
                      aria-label={`Role for ${m.email || m.name}`}
                      value={m.role}
                      disabled={rowBusy}
                      onChange={(e) => changeRole(m.accountId, e.target.value)}
                      className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-2 py-1 text-xs text-[color:var(--color-text)] disabled:opacity-50"
                    >
                      {/* Keep the current role selectable even if this actor could not
                          otherwise assign it (e.g. an admin viewing an owner). */}
                      {(roles.includes(m.role as OrgRole)
                        ? roles
                        : [m.role as OrgRole, ...roles]
                      ).map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <MemberRoleBadge role={m.role} />
                  )}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => removeMember(m.accountId, m.email)}
                      disabled={rowBusy}
                      className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-xs text-[color:var(--color-text-dim)] hover:border-[color:var(--color-red)] hover:text-[color:var(--color-red)] disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Pending invites */}
      {invites.length > 0 && (
        <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
          <h2 className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
            Pending invites · {invites.length}
          </h2>
          <ul className="mt-3 divide-y divide-[color:var(--color-border)]">
            {invites.map((inv) => {
              const rowBusy = busy === inv.id;
              return (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <span className="truncate text-sm text-[color:var(--color-text)]">
                      {inv.email}
                    </span>
                    {inv.expired && (
                      <span className="ml-2 text-xs text-[color:var(--color-gold)]">expired</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <MemberRoleBadge role={inv.role} />
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => revokeInvite(inv.id, inv.email)}
                        disabled={rowBusy}
                        className="rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-xs text-[color:var(--color-text-dim)] hover:border-[color:var(--color-red)] hover:text-[color:var(--color-red)] disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Invite / add */}
      {canManage && (
        <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
          <h2 className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
            Invite a member
          </h2>
          <form onSubmit={submitInvite} className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="min-w-0 flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-text)] placeholder:text-[color:var(--color-text-faint)]"
            />
            <select
              aria-label="Invite role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as OrgRole)}
              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-2 py-2 text-sm text-[color:var(--color-text)]"
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy === 'invite'}
              className="rounded-lg border border-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/10 disabled:opacity-50"
            >
              {busy === 'invite' ? 'Sending…' : 'Invite'}
            </button>
          </form>
          <p className="mt-2 text-xs text-[color:var(--color-text-dim)]">
            An existing Pharos account is added immediately; a new address receives an email
            invitation with a signup link.
          </p>
        </section>
      )}
    </div>
  );
}
