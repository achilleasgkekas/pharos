'use client';

// Superadmin LIVE storage-footprint panel for the workspace DETAIL page
// (/admin/tenants/[slug]). The tenant detail page renders the LAST SAMPLED storage figure from
// the control-plane Usage ledger; this panel lets the operator pull a FRESH, on-demand
// footprint by hitting the already-built read-only endpoint:
//   GET /api/saas/admin/tenants/[slug]/dbstats  → { measured, dbName, live: {...bytes} }
// which runs a live db.stats() against that tenant's own data database RIGHT NOW with zero
// side effects (no Usage sample recorded). Only ever mounted inside the SAAS_MODE + superadmin
// gated /admin segment, so it never exists in the self-hosted (OSS) build.
import { useState } from 'react';
import { StatTile } from './StatTile';
import { dbStatsView, type DbStatsView } from './dbStatsView';
import { formatBytes, formatInt, formatWhen } from './format';

/** Friendlier text for the `{ error }` bodies / statuses the dbstats route can return. */
function friendlyError(status: number, apiError: string | undefined): string {
  if (status === 401) return 'Your session expired. Sign in again.';
  if (status === 403) return 'You are not a platform superadmin.';
  if (status === 404) return 'This workspace no longer exists.';
  if (status === 503) return 'The data plane is temporarily unavailable. Try again shortly.';
  return apiError || 'Could not read the live footprint. Please try again.';
}

export function LiveDbStatsPanel({ slug }: { slug: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<DbStatsView | null>(null);

  async function measure() {
    if (busy) return;
    setBusy(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch(`/api/saas/admin/tenants/${encodeURIComponent(slug)}/dbstats`, {
        method: 'GET',
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
    } catch {
      setBusy(false);
      setError('Network error. Check your connection and try again.');
      return;
    }
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      // Non-JSON body — fall through to the status-based message.
    }
    if (!res.ok) {
      setBusy(false);
      setError(friendlyError(res.status, typeof data.error === 'string' ? data.error : undefined));
      return;
    }
    setView(dbStatsView(data));
    setBusy(false);
  }

  return (
    <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
          Live storage footprint
        </h2>
        <button
          type="button"
          onClick={measure}
          disabled={busy}
          className="rounded-lg border border-[color:var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/10 disabled:opacity-50"
        >
          {busy ? 'Measuring…' : view ? 'Re-measure' : 'Measure now'}
        </button>
      </div>

      <p className="mt-1 text-xs text-[color:var(--color-text-dim)]">
        Runs a fresh, read-only <code>db.stats()</code> against this workspace&apos;s data
        database. Diagnostic only — no usage sample is recorded, so measuring has zero side
        effects.
      </p>

      {error && (
        <div
          role="status"
          className="mt-3 rounded-lg border border-[color:var(--color-red)]/45 bg-[color:var(--color-red)]/10 px-3 py-2 text-sm text-[color:var(--color-red)]"
        >
          {error}
        </div>
      )}

      {view && !error && (
        <div className="mt-3 space-y-3">
          {!view.measured && (
            <div
              role="status"
              className="rounded-lg border border-[color:var(--color-gold)]/45 bg-[color:var(--color-gold)]/10 px-3 py-2 text-xs text-[color:var(--color-gold)]"
            >
              The live read could not run against this workspace (no database handle). Showing a
              zero footprint.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Total billed" value={formatBytes(view.total)} accent="accent" />
            <StatTile label="Database" value={formatBytes(view.db)} accent="cyan" />
            <StatTile label="Files" value={formatBytes(view.files)} accent="purple" />
            <StatTile label="Documents" value={formatInt(view.objects)} accent="gold" />
          </div>
          <dl className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-4 py-2 text-sm">
            <Row label="Data (logical)" value={formatBytes(view.data)} />
            <Row label="Collections (on disk)" value={formatBytes(view.storage)} />
            <Row label="Indexes (on disk)" value={formatBytes(view.index)} />
            <Row label="Database name" value={view.dbName || '—'} mono />
            <Row label="Measured at" value={formatWhen(view.generatedAt)} />
          </dl>
        </div>
      )}
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[color:var(--color-border)] py-1.5 last:border-0">
      <span className="text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
        {label}
      </span>
      <span
        className={
          mono
            ? 'font-mono text-xs text-[color:var(--color-text)]'
            : 'tabular-nums text-[color:var(--color-text)]'
        }
      >
        {value}
      </span>
    </div>
  );
}
