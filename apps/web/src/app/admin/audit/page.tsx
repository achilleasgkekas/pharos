// SaaS superadmin PLATFORM ACTIVITY page (/admin/audit) — the cross-tenant audit feed. Consumes
// `listPlatformAudit` (lib/tenancy/adminAudit) directly server-side, the same way /admin/tenants
// consumes its registry reader, because this page is already gated (segment layout + the
// defence-in-depth call below).
//
// Why this exists alongside the two per-workspace Activity views: those answer "what happened in
// THIS workspace", which requires already knowing where to look. This one answers "what happened
// on the platform", the question an operator actually starts an incident with. Filter by action
// and/or workspace slug via a plain GET form (the URL is the source of truth, so a view is
// shareable/bookmarkable and needs no client state); paginate with the shared keyset cursor.
//
// READ-ONLY: only the central registry AuditEvent collection plus batched Account/Tenant identity
// lookups; never a per-tenant data database, never a write. Self-gates to notFound() for the
// self-hosted app (SAAS_MODE off / not an operator) so the OSS build is byte-for-byte unchanged.
import Link from 'next/link';
import { requireSuperadminPage } from '@/lib/tenancy/superadminPage';
import { parseAdminAuditQuery, listPlatformAudit } from '@/lib/tenancy/adminAudit';
import { toPlatformActivityRows } from '@/components/saas/platformActivity';
import { PlatformActivityPanel } from '@/components/saas/PlatformActivityPanel';
import { ACTIVITY_FILTER_OPTIONS } from '@/components/saas/activityFilter';
import { cursorAfterRow, encodeActivityCursor } from '@/components/saas/activityCursor';

export const dynamic = 'force-dynamic';

type RawParams = Record<string, string | string[] | undefined>;

/** Collapse a Next searchParams object into URLSearchParams (first value of any array). */
function toSearchParams(raw: RawParams): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    if (v == null) continue;
    sp.set(k, Array.isArray(v) ? (v[0] ?? '') : v);
  }
  return sp;
}

/** Query string for the active filters. Empty params are dropped so the "no filter, newest page"
 *  URL stays clean. */
function auditParams(params: {
  action?: string | null;
  tenant?: string | null;
  before?: string | null;
}): string {
  const sp = new URLSearchParams();
  if (params.action) sp.set('action', params.action);
  if (params.tenant) sp.set('tenant', params.tenant);
  if (params.before) sp.set('before', params.before);
  return sp.toString();
}

/** Build a /admin/audit href preserving the active filters. */
function auditHref(params: Parameters<typeof auditParams>[0]): string {
  const s = auditParams(params);
  return s ? `/admin/audit?${s}` : '/admin/audit';
}

/** CSV download href for the SAME slice currently on screen (filters + resume point), so what an
 *  operator attaches to a ticket is what they were just looking at, not the unfiltered firehose. */
function auditExportHref(params: Parameters<typeof auditParams>[0]): string {
  const s = auditParams(params);
  return s ? `/api/saas/admin/audit/export?${s}` : '/api/saas/admin/audit/export';
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  await requireSuperadminPage();
  const raw = await searchParams;
  const sp = toSearchParams(raw);
  const query = parseAdminAuditQuery(sp);
  const { events, hasMore, unknownTenant } = await listPlatformAudit(query);

  const rows = toPlatformActivityRows(events);
  const filtered = Boolean(query.action || query.tenant);
  const nextCursor = hasMore && rows.length ? cursorAfterRow(rows[rows.length - 1]) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-xl font-bold">Platform activity</h1>
        <span className="text-xs text-[color:var(--color-text-faint)]">
          {query.cursor ? 'earlier' : 'latest'} {rows.length}
          {hasMore ? '+' : ''} {rows.length === 1 ? 'event' : 'events'}
        </span>
      </div>

      {/* Filter form — GET so state lives in the URL, no client JS needed. */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
            Workspace
          </span>
          <input
            type="text"
            name="tenant"
            defaultValue={query.tenant ?? ''}
            placeholder="slug (exact)"
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-1.5 text-sm text-[color:var(--color-text)] outline-none focus:border-[color:var(--color-accent)]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
            Action
          </span>
          <select
            name="action"
            defaultValue={query.action ?? ''}
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-1.5 text-sm text-[color:var(--color-text)] outline-none focus:border-[color:var(--color-accent)]"
          >
            {ACTIVITY_FILTER_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg border border-[color:var(--color-accent)]/50 bg-[color:var(--color-accent)]/10 px-4 py-1.5 text-sm font-medium text-[color:var(--color-accent)] transition-colors hover:bg-[color:var(--color-accent)]/20"
        >
          Apply
        </button>
        {filtered && (
          <Link
            href="/admin/audit"
            className="px-2 py-1.5 text-sm text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]"
          >
            Reset
          </Link>
        )}
        {!unknownTenant && (
          // Plain <a>, not <Link>: this is a file download, not a client-side navigation, and the
          // router would otherwise try to treat the CSV response as a page.
          <a
            href={auditExportHref({
              action: query.action,
              tenant: query.tenant,
              before: sp.get('before'),
            })}
            className="ml-auto rounded-lg border border-[color:var(--color-border-light)] px-3 py-1.5 text-sm text-[color:var(--color-text-dim)] transition-colors hover:border-[color:var(--color-cyan)] hover:text-[color:var(--color-cyan)]"
          >
            ↓ Download CSV
          </a>
        )}
      </form>

      {unknownTenant ? (
        // Distinct from an empty feed on purpose: a typo'd slug and a quiet workspace are
        // different answers when you are chasing an incident.
        <p className="rounded-2xl border border-[color:var(--color-gold)]/40 bg-[color:var(--color-surface)] p-4 text-sm text-[color:var(--color-text-dim)]">
          No workspace with slug{' '}
          <span className="font-mono text-[color:var(--color-text)]">{query.tenant}</span>. Check
          the slug on the{' '}
          <Link href="/admin/tenants" className="text-[color:var(--color-accent)] hover:underline">
            Workspaces
          </Link>{' '}
          list.
        </p>
      ) : (
        <PlatformActivityPanel rows={rows} filtered={filtered} />
      )}

      {(query.cursor || nextCursor) && (
        <div className="flex items-center justify-between gap-2">
          {query.cursor ? (
            <Link
              href={auditHref({ action: query.action, tenant: query.tenant })}
              className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-sm text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]"
            >
              ← Back to latest
            </Link>
          ) : (
            <span />
          )}
          {nextCursor && (
            <Link
              href={auditHref({
                action: query.action,
                tenant: query.tenant,
                before: encodeActivityCursor(nextCursor),
              })}
              className="rounded-lg border border-[color:var(--color-border-light)] px-3 py-1.5 text-sm font-medium text-[color:var(--color-text)] hover:border-[color:var(--color-cyan)] hover:text-[color:var(--color-cyan)]"
            >
              Load more →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
