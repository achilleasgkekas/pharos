// SaaS superadmin WORKSPACES listing page (/admin/tenants). Consumes the already-built
// read-only registry listing (`listTenantsForAdmin` + `parseAdminTenantQuery`, #48) directly
// server-side — the same reader the api/saas/admin/tenants route wraps — because this page is
// already gated (segment layout + the defence-in-depth call below). Filter (status + search)
// via a plain GET form (URL is the source of truth, so pages are shareable/bookmarkable and
// need no client state). Paginated with prev/next links.
//
// READ-ONLY: touches only the central registry Tenant collection; never a per-tenant data db,
// never a write. Self-gates to notFound() for the self-hosted app (SAAS_MODE off / not an
// operator) so the OSS build is byte-for-byte unchanged.
import Link from 'next/link';
import { requireSuperadminPage } from '@/lib/tenancy/superadminPage';
import {
  parseAdminTenantQuery,
  listTenantsForAdmin,
  TENANT_STATUSES,
} from '@/lib/tenancy/adminTenants';
import { formatWhen } from '@/components/saas/format';
import { TenantStatusBadge, Pill } from '@/components/saas/StatusBadge';

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

/** Build a querystring for a page at a given offset, preserving the active status/search. */
function pageHref(status: string | null, q: string | null, limit: number, offset: number): string {
  const sp = new URLSearchParams();
  if (status) sp.set('status', status);
  if (q) sp.set('q', q);
  sp.set('limit', String(limit));
  if (offset > 0) sp.set('offset', String(offset));
  const s = sp.toString();
  return s ? `/admin/tenants?${s}` : '/admin/tenants';
}

export default async function AdminTenantsPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  await requireSuperadminPage();
  const raw = await searchParams;
  const query = parseAdminTenantQuery(toSearchParams(raw));
  const { summaries, total } = await listTenantsForAdmin(query);

  const from = total === 0 ? 0 : query.offset + 1;
  const to = query.offset + summaries.length;
  const hasPrev = query.offset > 0;
  const hasNext = to < total;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-xl font-bold">Workspaces</h1>
        <span className="text-xs text-[color:var(--color-text-faint)]">
          {total === 0 ? 'no matches' : `${from}–${to} of ${total.toLocaleString('en-US')}`}
        </span>
      </div>

      {/* Filter form — GET so state lives in the URL, no client JS needed. */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
            Search
          </span>
          <input
            type="text"
            name="q"
            defaultValue={query.q ?? ''}
            placeholder="slug, name or domain"
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-1.5 text-sm text-[color:var(--color-text)] outline-none focus:border-[color:var(--color-accent)]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
            Status
          </span>
          <select
            name="status"
            defaultValue={query.status ?? ''}
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-1.5 text-sm text-[color:var(--color-text)] outline-none focus:border-[color:var(--color-accent)]"
          >
            <option value="">all</option>
            {TENANT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="limit" value={String(query.limit)} />
        <button
          type="submit"
          className="rounded-lg border border-[color:var(--color-accent)]/50 bg-[color:var(--color-accent)]/10 px-4 py-1.5 text-sm font-medium text-[color:var(--color-accent)] transition-colors hover:bg-[color:var(--color-accent)]/20"
        >
          Apply
        </button>
        {(query.status || query.q) && (
          <Link
            href="/admin/tenants"
            className="px-2 py-1.5 text-sm text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]"
          >
            Reset
          </Link>
        )}
      </form>

      {summaries.length === 0 ? (
        <p className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 text-sm text-[color:var(--color-text-dim)]">
          {query.status || query.q
            ? 'No workspaces match this filter.'
            : 'No workspaces yet. This list populates as tenants sign up.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[color:var(--color-border)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
                <th className="px-4 py-2 font-normal">Workspace</th>
                <th className="px-4 py-2 font-normal">Plan</th>
                <th className="px-4 py-2 font-normal">Status</th>
                <th className="px-4 py-2 font-normal">Tier</th>
                <th className="px-4 py-2 font-normal">Billing</th>
                <th className="px-4 py-2 font-normal">Created</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-[color:var(--color-border)] last:border-0 hover:bg-[color:var(--color-surface)]/60"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/tenants/${encodeURIComponent(t.slug)}`}
                      className="font-medium text-[color:var(--color-text)] hover:text-[color:var(--color-accent)]"
                    >
                      {t.name || t.slug || '—'}
                    </Link>
                    <div className="text-xs text-[color:var(--color-text-faint)]">
                      {t.slug}
                      {t.customDomain ? ` · ${t.customDomain}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 capitalize text-[color:var(--color-text-dim)]">
                    {t.plan || '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <TenantStatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-2.5 capitalize text-[color:var(--color-text-dim)]">
                    {t.tier || '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {t.billingLinked && <Pill tone="gold">billing</Pill>}
                      {t.aiByoKey && <Pill tone="cyan">byo-key</Pill>}
                      {!t.billingLinked && !t.aiByoKey && (
                        <span className="text-[color:var(--color-text-faint)]">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[color:var(--color-text-dim)]">
                    {formatWhen(t.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(hasPrev || hasNext) && (
        <div className="flex items-center justify-between">
          {hasPrev ? (
            <Link
              href={pageHref(query.status, query.q, query.limit, Math.max(0, query.offset - query.limit))}
              className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-sm text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          {hasNext ? (
            <Link
              href={pageHref(query.status, query.q, query.limit, query.offset + query.limit)}
              className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-sm text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
