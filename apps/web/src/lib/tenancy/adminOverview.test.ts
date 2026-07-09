import { describe, it, expect } from 'vitest';
import {
  tallyTenants,
  sumFleetUsage,
  buildFleetOverview,
  type TenantTally,
  type FleetUsageTotals,
} from './adminOverview';
import type { TenantSummary } from '@/lib/tenancy/adminTenants';
import type { UsageDoc } from '@/models/Usage';

// PURE helpers only. `readFleetOverviewForAdmin` is the node-only registry reader and the
// route is superadmin-gated (404 when SAAS_MODE off / console not enabled).

function tenant(over: Partial<TenantSummary>): TenantSummary {
  return {
    id: 'id',
    slug: 'acme',
    name: 'Acme',
    plan: 'free',
    status: 'active',
    tier: 'shared',
    customDomain: null,
    trialEndsAt: null,
    erasureScheduledAt: null,
    billingLinked: false,
    aiByoKey: false,
    createdAt: null,
    updatedAt: null,
    ...over,
  };
}

function usage(over: Record<string, unknown>): Partial<UsageDoc> {
  return {
    period: '2026-07',
    aiCalls: 0,
    aiInputTokens: 0,
    aiOutputTokens: 0,
    aiCostMicros: 0,
    storageBytes: 0,
    storageMeasuredAt: null,
    ...over,
  } as unknown as Partial<UsageDoc>;
}

describe('tallyTenants', () => {
  it('pre-seeds every known plan/status/tier bucket to 0', () => {
    const t = tallyTenants([]);
    expect(t.total).toBe(0);
    expect(t.byPlan).toEqual({ free: 0, shared: 0, dedicated: 0 });
    expect(t.byStatus).toEqual({
      pending: 0,
      trialing: 0,
      active: 0,
      suspended: 0,
      canceled: 0,
    });
    expect(t.byTier).toEqual({ shared: 0, dedicated: 0 });
    expect(t.billingLinked).toBe(0);
  });

  it('counts by plan/status/tier and flag fields', () => {
    const t = tallyTenants([
      tenant({ plan: 'free', status: 'trialing', tier: 'shared' }),
      tenant({ plan: 'shared', status: 'active', tier: 'shared', billingLinked: true }),
      tenant({
        plan: 'dedicated',
        status: 'active',
        tier: 'dedicated',
        billingLinked: true,
        aiByoKey: true,
        customDomain: 'acme.io',
        erasureScheduledAt: '2026-08-01T00:00:00.000Z',
      }),
    ]);
    expect(t.total).toBe(3);
    expect(t.byPlan).toEqual({ free: 1, shared: 1, dedicated: 1 });
    expect(t.byStatus.active).toBe(2);
    expect(t.byStatus.trialing).toBe(1);
    expect(t.byTier).toEqual({ shared: 2, dedicated: 1 });
    expect(t.billingLinked).toBe(2);
    expect(t.aiByoKey).toBe(1);
    expect(t.customDomain).toBe(1);
    expect(t.erasureScheduled).toBe(1);
  });

  it('counts an unexpected plan/status value under its own key without dropping it', () => {
    const t = tallyTenants([tenant({ plan: 'enterprise', status: 'archived' })]);
    expect(t.total).toBe(1);
    expect(t.byPlan.enterprise).toBe(1);
    expect(t.byPlan.free).toBe(0);
    expect(t.byStatus.archived).toBe(1);
  });
});

describe('sumFleetUsage', () => {
  it('is all-zero for an empty ledger', () => {
    const u = sumFleetUsage([]);
    expect(u).toEqual<FleetUsageTotals>({
      tenantsReporting: 0,
      aiCalls: 0,
      aiInputTokens: 0,
      aiOutputTokens: 0,
      aiCostMicros: 0,
      storageBytes: 0,
    });
  });

  it('sums AI counters AND storage across tenants (storage is per-tenant gauge)', () => {
    const u = sumFleetUsage([
      usage({ aiCalls: 10, aiInputTokens: 1000, aiOutputTokens: 300, aiCostMicros: 5000, storageBytes: 1_048_576 }),
      usage({ aiCalls: 4, aiInputTokens: 200, aiOutputTokens: 90, aiCostMicros: 1200, storageBytes: 2_097_152 }),
    ]);
    expect(u.tenantsReporting).toBe(2);
    expect(u.aiCalls).toBe(14);
    expect(u.aiInputTokens).toBe(1200);
    expect(u.aiOutputTokens).toBe(390);
    expect(u.aiCostMicros).toBe(6200);
    expect(u.storageBytes).toBe(3_145_728);
  });

  it('ignores null rows and coerces garbage/negative values to 0', () => {
    const u = sumFleetUsage([
      null,
      usage({ aiCalls: -5, aiCostMicros: Number.NaN, storageBytes: 500 }),
      undefined,
    ]);
    expect(u.tenantsReporting).toBe(1);
    expect(u.aiCalls).toBe(0);
    expect(u.aiCostMicros).toBe(0);
    expect(u.storageBytes).toBe(500);
  });
});

describe('buildFleetOverview', () => {
  const tenants: TenantTally = tallyTenants([tenant({})]);
  const usageTotals: FleetUsageTotals = sumFleetUsage([usage({ aiCalls: 3 })]);

  it('assembles the stable envelope with derived inputs passed through verbatim', () => {
    const out = buildFleetOverview({
      tenants,
      usage: usageTotals,
      accounts: 7,
      activeMembers: 9,
      period: '2026-07',
      generatedAt: new Date('2026-07-09T10:00:00.000Z'),
    });
    expect(out.format).toBe('pharos.admin-overview');
    expect(out.version).toBe(1);
    expect(out.generatedAt).toBe('2026-07-09T10:00:00.000Z');
    expect(out.period).toBe('2026-07');
    expect(out.tenants).toBe(tenants);
    expect(out.usage).toBe(usageTotals);
    expect(out.accounts).toBe(7);
    expect(out.activeMembers).toBe(9);
  });

  it('falls back to epoch on an invalid generatedAt and floors/guards counts', () => {
    const out = buildFleetOverview({
      tenants,
      usage: usageTotals,
      accounts: -3,
      activeMembers: 4.9,
      period: '2026-07',
      generatedAt: new Date('nope'),
    });
    expect(out.generatedAt).toBe(new Date(0).toISOString());
    expect(out.accounts).toBe(0);
    expect(out.activeMembers).toBe(4);
  });
});
