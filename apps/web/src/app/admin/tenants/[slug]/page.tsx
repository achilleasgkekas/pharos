// SaaS superadmin WORKSPACE DETAIL page (/admin/tenants/[slug]). Consumes the already-built
// read-only detail reader (`getTenantDetailForAdmin`, #49/#50) directly server-side: registry
// summary + member roster + role/status tally + control-plane usage rollup. Unknown slug →
// notFound(). READ-ONLY (registry Tenant/Membership/Account + Usage ledger only; never a
// per-tenant data db, never a write). Self-gates for the self-hosted app so the OSS build is
// byte-for-byte unchanged.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { requireSuperadminPage } from '@/lib/tenancy/superadminPage';
import { getTenantDetailForAdmin } from '@/lib/tenancy/adminTenantDetail';
import { auditView, collectActorIds, parseAuditAction } from '@/lib/tenancy/audit';
import { AuditEvent, type AuditEventDoc } from '@/models/AuditEvent';
import { Account } from '@/models/Account';
import { StatTile } from '@/components/saas/StatTile';
import { LiveDbStatsPanel } from '@/components/saas/LiveDbStatsPanel';
import { TenantActionsPanel } from '@/components/saas/TenantActionsPanel';
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
import {
  TenantStatusBadge,
  MemberStatusBadge,
  MemberRoleBadge,
  Pill,
} from '@/components/saas/StatusBadge';
import { formatInt, formatBytes, formatCostMicros, formatWhen } from '@/components/saas/format';
import { aiCharge, formatMicros } from '@/lib/billing/aiBilling';

// One page of the cross-tenant trail at a time; older rows load via the keyset "Load more" link
// (?before=), same shared cursor helpers as the workspace Activity tab.
const ACTIVITY_LIMIT = 50;

export const dynamic = 'force-dynamic';

/** Definition-list row: a mono label and its value. Value falls back to "—" when empty. */
function Field({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
        {label}
      </span>
      <span className="text-sm text-[color:var(--color-text)]">{children ?? '—'}</span>
    </div>
  );
}

export default async function AdminTenantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ action?: string; before?: string }>;
}) {
  await requireSuperadminPage();
  const { slug } = await params;
  const { action: actionRaw, before: beforeRaw } = await searchParams;
  // Same treatment as the workspace Activity tab: an unknown/stray `?action=` is "no filter",
  // never a 400 — the operator just sees the unfiltered trail. Likewise a malformed `?before=`
  // is "no cursor" — the first page.
  const action = parseAuditAction(actionRaw);
  const cursor = decodeActivityCursor(beforeRaw);
  const detail = await getTenantDetailForAdmin(slug);
  if (!detail) notFound();

  const t = detail.tenant;
  const mc = detail.memberCounts;
  const u = detail.usage;
  // What this workspace owes for AI on the platform key (see lib/billing/aiBilling).
  const charge = aiCharge(u.totals.aiCostMicros, !!t.aiByoKey);
  const latest = u.latestPeriod;

  // Cross-tenant activity view (superadmin console, TODO §8): the same append-only audit
  // trail an owner sees on their own workspace's Activity tab, read here for ANY tenant by
  // slug — the operator-facing counterpart. Reads only AuditEvent + a batched Account lookup
  // (never a per-tenant data database, never a write); authorization is requireSuperadminPage
  // above, not per-workspace membership, so this is intentionally NOT gated by role.
  await connectDB();
  const activityQuery: Record<string, unknown> = { tenant: t.id };
  if (action) activityQuery.action = action;
  if (cursor) Object.assign(activityQuery, cursorFilter(cursor));
  // Fetch one extra row so `hasMore` is known without a second countDocuments query.
  const fetchedEvents = (await AuditEvent.find(activityQuery)
    .select('action actor target meta createdAt')
    .sort({ createdAt: -1, _id: -1 })
    .limit(ACTIVITY_LIMIT + 1)
    .lean()) as unknown as (AuditEventDoc & { createdAt?: Date })[];
  const { items: events, hasMore } = splitPage(fetchedEvents, ACTIVITY_LIMIT);
  const actorIds = collectActorIds(events);
  const emailById = new Map<string, string>();
  const nameById = new Map<string, string>();
  if (actorIds.length) {
    const actors = (await Account.find({ _id: { $in: actorIds } })
      .select('email name')
      .lean()) as unknown as { _id: unknown; email?: string | null; name?: string | null }[];
    for (const a of actors) {
      const id = String(a._id);
      if (a.email) emailById.set(id, a.email);
      const name = a.name?.trim();
      if (name) nameById.set(id, name);
    }
  }
  const activityViews: ActivityInput[] = events.map((ev) => {
    const id = ev.actor != null ? String(ev.actor) : null;
    return auditView(ev, id ? emailById.get(id) ?? null : null, id ? nameById.get(id) ?? null : null);
  });
  const activityRows = toActivityRows(activityViews);

  // Builds an /admin/tenants/[slug] URL with the given action/before params (either omitted
  // entirely when null/undefined). Shared by the "Clear", "Back to latest", and "Load more"
  // links so the three stay in sync with each other.
  const buildActivityHref = (params: { action?: string | null; before?: string | null }) => {
    const sp = new URLSearchParams();
    if (params.action) sp.set('action', params.action);
    if (params.before) sp.set('before', params.before);
    const qs = sp.toString();
    const base = `/admin/tenants/${encodeURIComponent(slug)}`;
    return qs ? `${base}?${qs}` : base;
  };
  const nextActivityCursor = hasMore ? cursorAfterRow(activityRows[activityRows.length - 1]) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/tenants"
            className="text-sm text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]"
          >
            ← Workspaces
          </Link>
          <h1 className="font-display text-xl font-bold">{t.name || t.slug || '—'}</h1>
          <TenantStatusBadge status={t.status} />
        </div>
        <span className="text-xs text-[color:var(--color-text-faint)]">
          generated {formatWhen(detail.generatedAt)}
        </span>
      </div>

      {/* Registry summary + member tally */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
          <h2 className="mb-2 text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
            Registry
          </h2>
          <dl className="divide-y divide-[color:var(--color-border)]">
            <Field label="Slug">{t.slug || '—'}</Field>
            <Field label="Plan">
              <span className="capitalize">{t.plan || '—'}</span>
            </Field>
            <Field label="Tier">
              <span className="capitalize">{t.tier || '—'}</span>
            </Field>
            <Field label="Custom domain">{t.customDomain || '—'}</Field>
            <Field label="Billing">
              <div className="flex flex-wrap justify-end gap-1">
                {t.billingLinked ? <Pill tone="gold">linked</Pill> : <span>—</span>}
                {t.aiByoKey && <Pill tone="cyan">byo-key</Pill>}
              </div>
            </Field>
            <Field label="Trial ends">{formatWhen(t.trialEndsAt)}</Field>
            <Field label="Erasure scheduled">
              {t.erasureScheduledAt ? (
                <Pill tone="red">{formatWhen(t.erasureScheduledAt)}</Pill>
              ) : (
                '—'
              )}
            </Field>
            <Field label="Created">{formatWhen(t.createdAt)}</Field>
            <Field label="Updated">{formatWhen(t.updatedAt)}</Field>
          </dl>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
            <StatTile label="Members" value={formatInt(mc.total)} accent="accent" />
            <StatTile label="Active" value={formatInt(mc.active)} accent="cyan" />
            <StatTile
              label="Owners"
              value={formatInt(mc.owners)}
              sub={mc.owners === 0 ? 'ownerless!' : undefined}
              accent={mc.owners === 0 ? 'red' : 'purple'}
            />
            <StatTile
              label="Invited"
              value={formatInt(mc.invited)}
              sub={`${formatInt(mc.removed)} removed`}
              accent="gold"
            />
          </div>
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
            <h2 className="mb-2 text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
              Usage {latest ? `· latest ${latest}` : ''}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <StatTile
                label="AI calls (total)"
                value={formatInt(u.totals.aiCalls)}
                sub={`${formatInt(u.periodCount)} periods`}
                accent="accent"
              />
              <StatTile
                label="AI tokens (total)"
                value={formatInt(u.totals.aiInputTokens + u.totals.aiOutputTokens)}
                sub={`${formatInt(u.totals.aiInputTokens)} in · ${formatInt(u.totals.aiOutputTokens)} out`}
                accent="cyan"
              />
              <StatTile
                label="AI cost (total)"
                value={formatCostMicros(u.totals.aiCostMicros)}
                accent="gold"
              />
              {/* What the workspace OWES, as opposed to what it cost us. Off until
                  SAAS_AI_MARKUP is set, and never charged to a workspace on its own key —
                  that one never touched the platform key. */}
              <StatTile
                label="AI owed (total)"
                value={charge.billable ? `€${formatMicros(charge.billableMicros)}` : '—'}
                sub={
                  t.aiByoKey
                    ? 'own key · not billable'
                    : charge.markup
                      ? `${charge.markup}× cost`
                      : 'markup not configured'
                }
                accent={charge.billable ? 'accent' : undefined}
              />
              <StatTile
                label="Storage"
                value={formatBytes(u.latestStorageBytes)}
                sub={u.latestStorageMeasuredAt ? formatWhen(u.latestStorageMeasuredAt) : 'not measured'}
                accent="purple"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Operator write actions (suspend/reactivate/cancel + plan override) */}
      <TenantActionsPanel slug={slug} status={t.status} plan={t.plan} />

      {/* Live, on-demand storage footprint (fresh db.stats(), zero side effects) */}
      <LiveDbStatsPanel slug={slug} />

      {/* Member roster */}
      <section>
        <h2 className="mb-2 text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
          Members · {mc.total}
        </h2>
        {detail.members.length === 0 ? (
          <p className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 text-sm text-[color:var(--color-text-dim)]">
            No members on this workspace.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[color:var(--color-border)]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
                  <th className="px-4 py-2 font-normal">Account</th>
                  <th className="px-4 py-2 font-normal">Role</th>
                  <th className="px-4 py-2 font-normal">Status</th>
                  <th className="px-4 py-2 font-normal">Joined</th>
                </tr>
              </thead>
              <tbody>
                {detail.members.map((m) => (
                  <tr
                    key={m.accountId}
                    className="border-b border-[color:var(--color-border)] last:border-0"
                  >
                    <td className="px-4 py-2.5">
                      <div className="text-[color:var(--color-text)]">{m.email || '(no email)'}</div>
                      {m.name && (
                        <div className="text-xs text-[color:var(--color-text-faint)]">{m.name}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <MemberRoleBadge role={m.role} />
                    </td>
                    <td className="px-4 py-2.5">
                      <MemberStatusBadge status={m.status} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[color:var(--color-text-dim)]">
                      {formatWhen(m.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Activity trail (cross-tenant superadmin view — every event, no role restriction) */}
      <section>
        <h2 className="mb-2 text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
          Activity · {cursor ? 'earlier' : 'latest'} {activityRows.length}
          {action && ` · ${ACTIVITY_FILTER_OPTIONS.find((o) => o.value === action)?.label ?? action}`}
        </h2>
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4">
          {/* Plain GET form — same idiom as the workspace Activity tab's filter, no client JS.
              Submitting a new filter always starts back at page 1 (the form has no `before`
              field), same reasoning as the workspace tab. */}
          <form
            action={`/admin/tenants/${encodeURIComponent(slug)}`}
            method="get"
            className="flex flex-wrap items-center gap-2 border-b border-[color:var(--color-border)] py-4"
          >
            <label
              htmlFor="admin-activity-action-filter"
              className="text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]"
            >
              Action
            </label>
            <select
              id="admin-activity-action-filter"
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
                href={buildActivityHref({})}
                className="text-xs text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]"
              >
                Clear
              </a>
            )}
          </form>
          <ActivityPanel rows={activityRows} />
          {(cursor || nextActivityCursor) && (
            <div className="flex items-center justify-between gap-2 border-t border-[color:var(--color-border)] py-4">
              {cursor ? (
                <a
                  href={buildActivityHref({ action })}
                  className="text-xs text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]"
                >
                  ← Back to latest
                </a>
              ) : (
                <span />
              )}
              {nextActivityCursor && (
                <a
                  href={buildActivityHref({ action, before: encodeActivityCursor(nextActivityCursor) })}
                  className="rounded-lg border border-[color:var(--color-border-light)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-text)] hover:border-[color:var(--color-cyan)] hover:text-[color:var(--color-cyan)]"
                >
                  Load more
                </a>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
