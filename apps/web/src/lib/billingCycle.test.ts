import { describe, it, expect } from 'vitest';
import {
  BILLING_CYCLES,
  isBillingCycle,
  monthlyFactor,
  monthlyEquivalent,
  cycleRenews,
  addCycle,
  nextOccurrence,
  cycleKey,
  RECURRING_CYCLES,
  isRecurringCycle,
} from './billingCycle';

// This module exists because the cycle table used to be copy-pasted in seven places,
// each of which silently treated an unknown cycle as monthly. These tests pin the two
// things that made that dangerous: the money multiplier and the date stepping.

describe('the cycle list', () => {
  it('includes every-2-years, which subscriptions genuinely use', () => {
    expect(BILLING_CYCLES).toContain('biennial');
  });

  it('recognises its own values and rejects anything else', () => {
    for (const c of BILLING_CYCLES) expect(isBillingCycle(c)).toBe(true);
    expect(isBillingCycle('fortnightly')).toBe(false);
    expect(isBillingCycle(undefined)).toBe(false);
    expect(isBillingCycle(2)).toBe(false);
  });
});

describe('monthlyFactor / monthlyEquivalent', () => {
  it('spreads each cycle over a month', () => {
    expect(monthlyFactor('monthly')).toBe(1);
    expect(monthlyFactor('quarterly')).toBeCloseTo(1 / 3);
    expect(monthlyFactor('yearly')).toBeCloseTo(1 / 12);
    expect(monthlyFactor('weekly')).toBeCloseTo(52 / 12);
  });

  it('bills a biennial subscription at half a yearly one', () => {
    expect(monthlyFactor('biennial')).toBeCloseTo(1 / 24);
    expect(monthlyEquivalent(240, 'biennial')).toBeCloseTo(10);
    expect(monthlyEquivalent(240, 'biennial')).toBeCloseTo(monthlyEquivalent(240, 'yearly') / 2);
  });

  it('counts a lifetime purchase as zero recurring cost', () => {
    expect(monthlyEquivalent(500, 'lifetime')).toBe(0);
  });

  it('treats an unknown cycle as monthly, as every old copy did', () => {
    expect(monthlyFactor('nonsense')).toBe(1);
    expect(monthlyFactor('')).toBe(1);
  });
});

describe('addCycle', () => {
  const jan1 = () => new Date(2026, 0, 1);

  it('steps by the right amount per cycle', () => {
    expect(addCycle(jan1(), 'weekly').getDate()).toBe(8);
    expect(addCycle(jan1(), 'monthly').getMonth()).toBe(1);
    expect(addCycle(jan1(), 'quarterly').getMonth()).toBe(3);
    expect(addCycle(jan1(), 'yearly').getFullYear()).toBe(2027);
    expect(addCycle(jan1(), 'biennial').getFullYear()).toBe(2028);
  });

  it('does not mutate the date it was given', () => {
    const d = jan1();
    addCycle(d, 'yearly');
    expect(d.getFullYear()).toBe(2026);
  });

  it('returns the SAME date for a lifetime cycle — callers must check cycleRenews', () => {
    expect(addCycle(jan1(), 'lifetime').getTime()).toBe(jan1().getTime());
    expect(cycleRenews('lifetime')).toBe(false);
    expect(cycleRenews('biennial')).toBe(true);
  });
});

describe('nextOccurrence', () => {
  const now = new Date(2026, 7, 28); // 2026-08-28

  it('rolls a past start forward until it is in the future', () => {
    const next = nextOccurrence(new Date(2024, 0, 15), 'yearly', now)!;
    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(0);
    expect(next.getDate()).toBe(15);
  });

  it('lands on the right year for a biennial subscription', () => {
    // Started Jan 2020, charged every 2 years → 2020, 2022, 2024, 2026(past), 2028.
    const next = nextOccurrence(new Date(2020, 0, 10), 'biennial', now)!;
    expect(next.getFullYear()).toBe(2028);
  });

  it('leaves an already-future start date alone', () => {
    const start = new Date(2027, 2, 1);
    expect(nextOccurrence(start, 'monthly', now)!.getTime()).toBe(start.getTime());
  });

  it('returns null for lifetime instead of looping forever', () => {
    expect(nextOccurrence(new Date(2020, 0, 1), 'lifetime', now)).toBeNull();
  });
});

describe('cycleKey', () => {
  it('maps to the i18n key, falling back to monthly for junk', () => {
    expect(cycleKey('biennial')).toBe('cyc.biennial');
    expect(cycleKey('nope')).toBe('cyc.monthly');
  });
});

describe('recurring bill / expense cycles', () => {
  it('offers "not recurring" plus every renewing cycle, and no lifetime', () => {
    expect(RECURRING_CYCLES).toContain('');
    expect(RECURRING_CYCLES).toContain('biennial');
    expect(RECURRING_CYCLES).not.toContain('lifetime');
  });

  it('lists the empty option first, then shortest to longest', () => {
    expect(RECURRING_CYCLES).toEqual(['', 'weekly', 'monthly', 'quarterly', 'yearly', 'biennial']);
  });

  it('validates membership', () => {
    expect(isRecurringCycle('')).toBe(true);
    expect(isRecurringCycle('biennial')).toBe(true);
    expect(isRecurringCycle('lifetime')).toBe(false);
    expect(isRecurringCycle(null)).toBe(false);
  });
});
