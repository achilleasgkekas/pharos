import { describe, it, expect, vi, afterEach } from 'vitest';
import { planValueEur, fleetAiMoney, healthyShare } from './fleetStats';

// The operator-facing money numbers. What is pinned is mostly restraint: these must not read
// higher than the truth, and must not turn an empty fleet into NaN.

afterEach(() => vi.unstubAllEnvs());

describe('planValueEur', () => {
  it('sums list price across the paid plans', () => {
    // Pro €9 ×2 + Dedicated €29 ×1
    expect(planValueEur({ free: 5, shared: 2, dedicated: 1 })).toBe(47);
  });

  it('counts the free plan as nothing, however many there are', () => {
    expect(planValueEur({ free: 100 })).toBe(0);
  });

  it('ignores unknown plan keys instead of guessing a price', () => {
    expect(planValueEur({ enterprise: 10, shared: 1 })).toBe(9);
  });

  it('is 0 for an empty or malformed tally', () => {
    expect(planValueEur({})).toBe(0);
    expect(planValueEur(null)).toBe(0);
    expect(planValueEur(undefined)).toBe(0);
    expect(planValueEur({ shared: -3 })).toBe(0);
    expect(planValueEur({ shared: NaN })).toBe(0);
  });
});

describe('fleetAiMoney', () => {
  it('reports cost, what it is billable at, and the margin between them', () => {
    vi.stubEnv('SAAS_AI_MARKUP', '2');
    const m = fleetAiMoney(1_000_000);
    expect(m.costMicros).toBe(1_000_000);
    expect(m.owedMicros).toBe(2_000_000);
    expect(m.margin).toBe(1_000_000);
  });

  it('shows cost with nothing owed when no markup is configured', () => {
    vi.stubEnv('SAAS_AI_MARKUP', '');
    const m = fleetAiMoney(1_000_000);
    expect(m.owedMicros).toBe(0);
    expect(m.margin).toBe(-1_000_000); // honest: unbilled AI is money out
  });

  it('is all zeroes when the fleet has used nothing', () => {
    vi.stubEnv('SAAS_AI_MARKUP', '2');
    expect(fleetAiMoney(0)).toEqual({ costMicros: 0, owedMicros: 0, margin: 0 });
  });
});

describe('healthyShare', () => {
  it('counts active and trialing as healthy', () => {
    expect(healthyShare({ active: 3, trialing: 1, canceled: 1 })).toEqual({ healthy: 4, total: 5, pct: 80 });
  });

  it('reads 0% on a brand-new deployment rather than NaN', () => {
    expect(healthyShare({})).toEqual({ healthy: 0, total: 0, pct: 0 });
    expect(healthyShare(null)).toEqual({ healthy: 0, total: 0, pct: 0 });
  });

  it('ignores negative or non-numeric counts', () => {
    expect(healthyShare({ active: 2, canceled: -5, suspended: 'x' as unknown as number })).toMatchObject({
      healthy: 2,
      total: 2,
    });
  });
});
