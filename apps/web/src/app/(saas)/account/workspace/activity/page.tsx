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
import { auditView, collectActorIds, parseAuditAction } from '@/lib/tenancy/audit';
import { AuditEvent, type AuditEventDoc } from '@/models/AuditEvent';
import { Account } from '@/models/Account';
import { pickWorkspace } from '@/components/saas/chooseWorkspace';
import { workspaceTabs } from '@/components/saas/workspaceTabs';
import { WorkspaceShell, Panel } from '@/components/saas/WorkspaceShell';
import { ActivityPanel } from '@/components/saas/ActivityPanel';
import { toActivityRows, type ActivityInput } from '@/components/saas/activityView';
import { ACTIVITY_FILTER_OPTIONS, ALL_ACTIONS_VALUE } from '@/components/saas/activityFilter';
import {
  decodeActivityCursor,
  cursorAfterRow,
  cursorFilter,
  encodeActivityCursor,
  splitPage,
} from '@/components/saas/activityCursor';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Activity · Pharos',
  robots: { index: false, follow: false },
};

// One page of the trail at a time; older rows load via the keyset "Load more" link (?before=).
const PAGE_LIMIT = 50;

export default async function WorkspaceActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; action?: string; before?: string }>;
}) {
  const { w, action: actionRaw, before: beforeRaw } = await searchParams;
  // A stray/unknown `?action=` is treated as "no filter" (parity with the API route), so a
  // bad query string never 400s the page — it just shows the unfiltered trail.
  const action = parseAuditAction(actionRaw);
  // Likewise, a malformed/tampered `?before=` is treated as "no cursor" — the first page.
  const cursor = decodeActivityCursor(beforeRaw);

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

  const query: Record<string, unknown> = { tenant: ctx.tenantId };
  if (action) query.action = action;
  if (cursor) Object.assign(query, cursorFilter(cursor));

  // Fetch one extra row so `hasMore` is known without a second countDocuments query.
  const fetched = (await AuditEvent.find(query)
    .select('action actor target meta createdAt')
    .sort({ createdAt: -1, _id: -1 })
    .limit(PAGE_LIMIT + 1)
    .lean()) as unknown as (AuditEventDoc & { createdAt?: Date })[];
  const { items: events, hasMore } = splitPage(fetched, PAGE_LIMIT);

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
  const title = action
    ? `Activity · ${cursor ? 'earlier' : 'latest'} ${rows.length} · ${ACTIVITY_FILTER_OPTIONS.find((o) => o.value === action)?.label ?? action}`
    : `Activity · ${cursor ? 'earlier' : 'latest'} ${rows.length}`;

  // Builds a /account/workspace/activity URL preserving the current workspace, with the given
  // action/before params (either omitted entirely when null/undefined). Shared by the "Clear",
  // "Back to latest", and "Load more" links so the three stay in sync with each other.
  const buildHref = (params: { action?: string | null; before?: string | null }) => {
    const sp = new URLSearchParams();
    if (w) sp.set('w', w);
    if (params.action) sp.set('action', params.action);
    if (params.before) sp.set('before', params.before);
    const qs = sp.toString();
    return qs ? `/account/workspace/activity?${qs}` : '/account/workspace/activity';
  };
  const nextCursor = hasMore ? cursorAfterRow(rows[rows.length - 1]) : null;

  return shell(
    <Panel title={title}>
      {/* Plain GET form — no client JS needed. `w` is carried as a hidden field so switching
          the action filter never drops the current workspace selection. Submitting a new filter
          always starts back at page 1 (the form has no `before` field), which is the correct
          behaviour — a narrower/wider filter changes what "page 2" even means. */}
      <form
        action="/account/workspace/activity"
        method="get"
        className="mb-4 flex flex-wrap items-center gap-2 border-b border-[color:var(--color-border)] pb-4"
      >
        {w && <input type="hidden" name="w" value={w} />}
        <label
          htmlFor="activity-action-filter"
          className="text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]"
        >
          Action
        </label>
        <select
          id="activity-action-filter"
          name="action"
          defaultValue={action ?? ALL_ACTIONS_VALUE}
          className="rounded-lg border border-[color:var(--color-border-light)] bg-[color:var(--color-surface-2)] px-2 py-1.5 text-xs text-[color:var(--color-text)]"
        >
          {ACTIVITY_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value || 'all'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg border border-[color:var(--color-cyan)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-cyan)] hover:bg-[color:var(--color-cyan)]/10"
        >
          Filter
        </button>
        {(action || cursor) && (
          <a
            href={buildHref({})}
            className="text-xs text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]"
          >
            Clear
          </a>
        )}
      </form>
      <ActivityPanel rows={rows} />
      {(cursor || nextCursor) && (
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-[color:var(--color-border)] pt-4">
          {cursor ? (
            <a
              href={buildHref({ action })}
              className="text-xs text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]"
            >
              ← Back to latest
            </a>
          ) : (
            <span />
          )}
          {nextCursor && (
            <a
              href={buildHref({ action, before: encodeActivityCursor(nextCursor) })}
              className="rounded-lg border border-[color:var(--color-border-light)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-text)] hover:border-[color:var(--color-cyan)] hover:text-[color:var(--color-cyan)]"
            >
              Load more
            </a>
          )}
        </div>
      )}
    </Panel>,
  );
}
