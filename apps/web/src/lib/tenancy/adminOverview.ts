// Superadmin FLEET OVERVIEW aggregate (TODO §8 "Superadmin console", increment 51). The
// operator already has the cross-tenant LISTING (#48) and a per-tenant DETAIL with usage
// rollup (#49/#50), but no single fleet-wide summary — "how is the whole SaaS doing right
// now". This closes that gap with a READ-ONLY aggregate over the CENTRAL REGISTRY only:
// tenant counts by plan/status/tier (+ billing/BYO-key/custom-domain/erasure flags), account
// + active-member totals, and this-month usage totals (AI consumption + storage footprint)
// summed from the control-plane Usage ledger.
//
// It reads ONLY the registry (Tenant / Account / Membership / Usage); it NEVER opens a
// per-tenant data database, never runs db.stats(), and never writes. Only meaningful when
// SAAS_MODE is on — the self-hosted DEFAULT_TENANT has no Tenant/Usage rows, so this returns
// an empty overview for the OSS app (zero effect).
//
// Split as elsewhere in tenancy/: everything except `readFleetOverviewForAdmin` is a pure
// function (no DB, no next/*) so the tallying/rollup logic is fully unit-testable. Reuses the
// display-safe shapers from adminTenants (TenantSummary) and adminTenantUsage (AdminUsagePeriod).
import { connectDB } from '@/lib/db';
import { Tenant, type TenantDoc } from '@/models/Tenant';
import { Account } from '@/models/Account';
import { Membership } from '@/models/Membership';
import { Usage, type UsageDoc } from '@/models/Usage';
import { periodOf } from '@/lib/billing/usage';
import { PLAN_KEYS } from '@/lib/billing/plans';
import { sampleAllTenants } from '@/lib/billing/dbStats';
import { superadminAllowlist } from '@/lib/tenancy/superadmin';
import {
  summarizeTenant,
  TENANT_STATUSES,
  type TenantSummary,
} from '@/lib/tenancy/adminTenants';
import { summarizeUsagePeriod, type AdminUsagePeriod } from '@/lib/tenancy/adminTenantUsage';

/** The two Tenant isolation tiers, mirrored so the tally can pre-seed both buckets at 0. */
const TENANT_TIERS = ['shared', 'dedicated'] as const;

export type TenantTally = {
  /** Every Tenant row, canceled included — the raw registry count. */
  total: number;
  /** `total` minus canceled — "how many workspaces actually exist right now" for the headline
   *  stat. A canceled tenant is already broken out correctly in `byStatus`; without this, a
   *  leftover canceled test workspace silently inflates the number a viewer reads as "how many
   *  customers do I have". */
  activeTotal: number;
  /** Count per plan key. Known plan keys are pre-seeded to 0; unknown values still counted. */
  byPlan: Record<string, number>;
  /** Count per status. Known statuses pre-seeded to 0; unknown values still counted. */
  byStatus: Record<string, number>;
  /** Count per isolation tier. */
  byTier: Record<string, number>;
  /** How many workspaces have a Stripe customer/subscription linked. */
  billingLinked: number;
  /** How many workspaces use a bring-your-own AI key. */
  aiByoKey: number;
  /** How many workspaces have a custom domain configured. */
  customDomain: number;
  /** How many workspaces have a GDPR erasure scheduled. */
  erasureScheduled: number;
};

/**
 * Tally a set of display-safe tenant summaries into fleet counts. Pre-seeds every known plan
 * key / status / tier to 0 so the shape is stable (a plan with no tenants still appears), yet
 * an unexpected stored value is still counted under its own key (never silently dropped).
 * PURE — no DB.
 */
export function tallyTenants(summaries: readonly TenantSummary[]): TenantTally {
  const byPlan: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byTier: Record<string, number> = {};
  for (const k of PLAN_KEYS) byPlan[k] = 0;
  for (const s of TENANT_STATUSES) byStatus[s] = 0;
  for (const t of TENANT_TIERS) byTier[t] = 0;

  let billingLinked = 0;
  let aiByoKey = 0;
  let customDomain = 0;
  let erasureScheduled = 0;

  for (const t of summaries ?? []) {
    if (t.plan) byPlan[t.plan] = (byPlan[t.plan] ?? 0) + 1;
    if (t.status) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    if (t.tier) byTier[t.tier] = (byTier[t.tier] ?? 0) + 1;
    if (t.billingLinked) billingLinked += 1;
    if (t.aiByoKey) aiByoKey += 1;
    if (t.customDomain) customDomain += 1;
    if (t.erasureScheduledAt) erasureScheduled += 1;
  }

  const total = (summaries ?? []).length;
  return {
    total,
    activeTotal: total - (byStatus.canceled ?? 0),
    byPlan,
    byStatus,
    byTier,
    billingLinked,
    aiByoKey,
    customDomain,
    erasureScheduled,
  };
}

export type FleetUsageTotals = {
  /** How many workspaces have a Usage row for this period (i.e. metered activity this month). */
  tenantsReporting: number;
  aiCalls: number;
  aiInputTokens: number;
  aiOutputTokens: number;
  aiCostMicros: number;
  /**
   * Fleet storage footprint (bytes). Storage is a per-tenant GAUGE; each Usage row already
   * holds one tenant's latest snapshot for the period, so summing across tenants is correct
   * (it is NOT summing a running counter). Rows never sampled contribute 0.
   */
  storageBytes: number;
};

/**
 * Sum a set of this-period Usage rows (one per reporting tenant) into fleet totals. The AI
 * counters are monotonic per-month, so summing across tenants gives the month's fleet volume;
 * storageBytes is a gauge, so summing across tenants gives the total footprint. Each row is
 * defensively coerced via `summarizeUsagePeriod` (negatives/NaN → 0). PURE — no DB.
 */
export function sumFleetUsage(
  docs: readonly (Partial<UsageDoc> | null | undefined)[]
): FleetUsageTotals {
  const rows = (docs ?? [])
    .filter((d): d is Partial<UsageDoc> => d != null)
    .map((d) => summarizeUsagePeriod(d as Partial<UsageDoc>));

  const totals: FleetUsageTotals = {
    tenantsReporting: rows.length,
    aiCalls: 0,
    aiInputTokens: 0,
    aiOutputTokens: 0,
    aiCostMicros: 0,
    storageBytes: 0,
  };
  for (const r of rows) {
    totals.aiCalls += r.aiCalls;
    totals.aiInputTokens += r.aiInputTokens;
    totals.aiOutputTokens += r.aiOutputTokens;
    totals.aiCostMicros += r.aiCostMicros;
    totals.storageBytes += r.storageBytes;
  }
  return totals;
}

export type AdminFleetOverview = {
  format: 'pharos.admin-overview';
  version: 1;
  generatedAt: string;
  /** The billing month "YYYY-MM" the usage totals cover. */
  period: string;
  tenants: TenantTally;
  /** Total registered login accounts (global identities). */
  accounts: number;
  /** Active memberships across all workspaces (invited/removed excluded). */
  activeMembers: number;
  usage: FleetUsageTotals;
};

/**
 * Assemble the stable overview envelope. PURE: counts are passed in already-derived. Coerces
 * `generatedAt` to epoch on an invalid Date and `accounts`/`activeMembers` to non-negative
 * integers so a bad input can never surface a garbage total.
 */
export function buildFleetOverview(input: {
  tenants: TenantTally;
  usage: FleetUsageTotals;
  accounts: number;
  activeMembers: number;
  period: string;
  generatedAt: Date;
}): AdminFleetOverview {
  const gen =
    input.generatedAt instanceof Date && !Number.isNaN(input.generatedAt.getTime())
      ? input.generatedAt
      : new Date(0);
  const nonNeg = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  };
  return {
    format: 'pharos.admin-overview',
    version: 1,
    generatedAt: gen.toISOString(),
    period: typeof input.period === 'string' ? input.period : '',
    tenants: input.tenants,
    accounts: nonNeg(input.accounts),
    activeMembers: nonNeg(input.activeMembers),
    usage: input.usage,
  };
}

/**
 * READ-ONLY fleet overview (mostly). Four cheap registry reads — all Tenant docs (tallied in
 * memory; the control-plane registry is small), the account count, the active-membership
 * count, and this month's Usage rows — then pure rollup. Touches ONLY the central registry;
 * never a per-tenant data database... except storage, which now samples live first (below) so
 * the fleet-wide storage figure isn't stale between daily cron runs. The operator console is
 * loaded occasionally, not a hot path, and the fleet is small, so a live `db.stats()` per
 * tenant here is cheap. The daily cron (`api/cron/saas/usage-sample`) stays in place as the
 * backstop for customer-facing usage pages, which don't need quite this freshness.
 */
export async function readFleetOverviewForAdmin(now: Date = new Date()): Promise<AdminFleetOverview> {
  await connectDB();
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const period = periodOf(at);

  // Must happen BEFORE the Usage read below (it writes the same Usage rows that read then
  // fetches) — sequential, not part of the Promise.all. A per-tenant sampling failure is
  // already isolated inside sampleAllTenants (counted, not thrown), so a bad database doesn't
  // take the whole overview down; it just leaves that tenant's storage figure at its last
  // sampled value for this call.
  await sampleAllTenants(at);

  const [tenantDocs, accounts, activeMembers, usageDocs] = await Promise.all([
    Tenant.find({})
      .select('slug name plan status tier customDomain trialEndsAt erasureScheduledAt billingCustomerId billingSubscriptionId aiByoKey createdAt updatedAt')
      .lean() as unknown as Promise<TenantDoc[]>,
    // The superadmin operator's own login is real but isn't a customer — excluding it from
    // the headline "Accounts" count is the same call as excluding canceled tenants from
    // "Workspaces" above: don't let the one operator inflate a number meant to read as
    // "how many people signed up".
    Account.countDocuments({ email: { $nin: superadminAllowlist() } }),
    Membership.countDocuments({ status: 'active' }),
    Usage.find({ period })
      .select('period aiCalls aiInputTokens aiOutputTokens aiCostMicros storageBytes storageMeasuredAt')
      .lean() as unknown as Promise<Partial<UsageDoc>[]>,
  ]);

  const tenants = tallyTenants(tenantDocs.map(summarizeTenant));
  const usage = sumFleetUsage(usageDocs);
  return buildFleetOverview({ tenants, usage, accounts, activeMembers, period, generatedAt: new Date() });
}

// Re-export the period-shape type so consumers/tests that only need the pure surface don't
// have to reach into adminTenantUsage for it.
export type { AdminUsagePeriod };
