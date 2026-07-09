// SaaS superadmin FLEET OVERVIEW page (/admin). Consumes the already-built read-only
// aggregate `readFleetOverviewForAdmin()` — reads ONLY the central registry (Tenant /
// Account / Membership / Usage), never a per-tenant data database. Gated by the segment
// layout AND here (defence in depth); force-dynamic so the numbers are live per request.
import { requireSuperadminPage } from '@/lib/tenancy/superadminPage';
import { readFleetOverviewForAdmin } from '@/lib/tenancy/adminOverview';
import { StatTile, BreakdownList } from '@/components/saas/StatTile';
import { formatInt, formatBytes, formatCostMicros, formatWhen } from '@/components/saas/format';

export const dynamic = 'force-dynamic';

/** Sort a tally Record into rows: non-zero first (desc), then zero buckets alphabetically. */
function toEntries(rec: Record<string, number>): Array<[string, number]> {
  return Object.entries(rec).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export default async function AdminOverviewPage() {
  await requireSuperadminPage();
  const o = await readFleetOverviewForAdmin();
  const t = o.tenants;
  const u = o.usage;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-xl font-bold">Fleet overview</h1>
        <span className="text-xs text-[color:var(--color-text-faint)]">
          {o.period} · generated {formatWhen(o.generatedAt)}
        </span>
      </div>

      <section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Workspaces" value={formatInt(t.total)} accent="accent" />
          <StatTile label="Accounts" value={formatInt(o.accounts)} accent="cyan" />
          <StatTile label="Active members" value={formatInt(o.activeMembers)} accent="purple" />
          <StatTile
            label="Billing linked"
            value={formatInt(t.billingLinked)}
            sub={`${formatInt(t.aiByoKey)} BYO-key`}
            accent="gold"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
          Usage · {o.period}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="AI calls" value={formatInt(u.aiCalls)} accent="accent" />
          <StatTile
            label="AI tokens"
            value={formatInt(u.aiInputTokens + u.aiOutputTokens)}
            sub={`${formatInt(u.aiInputTokens)} in · ${formatInt(u.aiOutputTokens)} out`}
            accent="cyan"
          />
          <StatTile label="AI cost" value={formatCostMicros(u.aiCostMicros)} accent="gold" />
          <StatTile
            label="Storage"
            value={formatBytes(u.storageBytes)}
            sub={`${formatInt(u.tenantsReporting)} reporting`}
            accent="purple"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <BreakdownList title="By plan" entries={toEntries(t.byPlan)} />
        <BreakdownList title="By status" entries={toEntries(t.byStatus)} />
        <BreakdownList title="By tier" entries={toEntries(t.byTier)} />
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Custom domain" value={formatInt(t.customDomain)} />
        <StatTile label="Erasure scheduled" value={formatInt(t.erasureScheduled)} accent="red" />
      </section>

      {t.total === 0 && (
        <p className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 text-sm text-[color:var(--color-text-dim)]">
          No workspaces yet. This overview populates as tenants sign up and metering runs.
        </p>
      )}
    </div>
  );
}
