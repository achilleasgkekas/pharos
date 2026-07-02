// PURE unit tests for per-plan seat limits (increment 17): the `maxMembers` plan field
// and the `withinSeatLimit` entitlement guard. No DB, no env — the route wiring is proven
// separately; here we pin the math so a pricing tweak can't silently break enforcement.
import { describe, it, expect } from 'vitest';
import { PLANS, PLAN_KEYS, planDef } from './plans';
import { entitlementsFor, withinSeatLimit } from './entitlements';

describe('plan maxMembers table', () => {
  it('every plan declares a maxMembers value (number > 0 or null for unlimited)', () => {
    for (const key of PLAN_KEYS) {
      const m = PLANS[key].maxMembers;
      expect(m === null || (typeof m === 'number' && m > 0)).toBe(true);
    }
  });

  it('free is single-seat, shared is multi-seat, dedicated is unlimited', () => {
    expect(PLANS.free.maxMembers).toBe(1);
    expect(PLANS.shared.maxMembers).toBe(5);
    expect(PLANS.dedicated.maxMembers).toBeNull();
  });

  it('seat allowance is non-decreasing up the ladder (null = unlimited on top)', () => {
    // free(1) <= shared(5); dedicated is unlimited (null) so it dominates both.
    expect(PLANS.free.maxMembers!).toBeLessThanOrEqual(PLANS.shared.maxMembers!);
    expect(PLANS.dedicated.maxMembers).toBeNull();
  });

  it('entitlementsFor surfaces the plan maxMembers', () => {
    expect(entitlementsFor('free').maxMembers).toBe(1);
    expect(entitlementsFor('shared').maxMembers).toBe(5);
    expect(entitlementsFor('dedicated').maxMembers).toBeNull();
  });

  it('unknown/legacy plan resolves to free seat allowance', () => {
    expect(entitlementsFor('enterprise-2019').maxMembers).toBe(planDef(null).maxMembers);
    expect(entitlementsFor(null).maxMembers).toBe(1);
    expect(entitlementsFor(undefined).maxMembers).toBe(1);
  });
});

describe('withinSeatLimit', () => {
  it('free (cap 1): admits the first seat, rejects a second', () => {
    expect(withinSeatLimit('free', 0)).toBe(true); // empty workspace can add the owner
    expect(withinSeatLimit('free', 1)).toBe(false); // already at cap
    expect(withinSeatLimit('free', 2)).toBe(false); // over cap (shouldn't happen, still false)
  });

  it('shared (cap 5): allows up to the 5th active seat, blocks the 6th', () => {
    expect(withinSeatLimit('shared', 4)).toBe(true); // 4 active → 5th allowed
    expect(withinSeatLimit('shared', 5)).toBe(false); // full
    expect(withinSeatLimit('shared', 6)).toBe(false);
  });

  it('dedicated (unlimited): always true regardless of count', () => {
    expect(withinSeatLimit('dedicated', 0)).toBe(true);
    expect(withinSeatLimit('dedicated', 1000)).toBe(true);
  });

  it('unknown plan falls back to free semantics', () => {
    expect(withinSeatLimit('mystery', 0)).toBe(true);
    expect(withinSeatLimit('mystery', 1)).toBe(false);
  });

  it('negative activeCount is clamped to 0 (cannot fabricate headroom past the cap)', () => {
    expect(withinSeatLimit('free', -5)).toBe(true); // clamps to 0 → below cap 1
    // shared cap 5: -1 clamps to 0, still below cap → true
    expect(withinSeatLimit('shared', -1)).toBe(true);
  });
});
