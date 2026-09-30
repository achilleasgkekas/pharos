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

describe('addCycle and short-month / leap-year policy', () => {
  const jan1 = () => new Date('2026-01-01T00:00:00Z');

  it('steps by the right amount per cycle', () => {
    expect(addCycle(jan1(), 'weekly').getUTCDate()).toBe(8);
    expect(addCycle(jan1(), 'monthly').getUTCMonth()).toBe(1);
    expect(addCycle(jan1(), 'quarterly').getUTCMonth()).toBe(3);
    expect(addCycle(jan1(), 'yearly').getUTCFullYear()).toBe(2027);
    expect(addCycle(jan1(), 'biennial').getUTCFullYear()).toBe(2028);
  });

  it('does not mutate the date it was given', () => {
    const d = jan1();
    addCycle(d, 'yearly');
    expect(d.getUTCFullYear()).toBe(2026);
  });

  it('returns the SAME date for a lifetime cycle — callers must check cycleRenews', () => {
    expect(addCycle(jan1(), 'lifetime').getTime()).toBe(jan1().getTime());
    expect(cycleRenews('lifetime')).toBe(false);
    expect(cycleRenews('biennial')).toBe(true);
  });

  it('clamps to short month last day and recovers 31st anchor on 31 January', () => {
    const anchor = new Date('2026-01-31T00:00:00Z');
    let d = anchor;

    // Feb 2026 -> 28th
    d = addCycle(d, 'monthly', anchor);
    expect(d.toISOString()).toBe('2026-02-28T00:00:00.000Z');

    // Mar 2026 -> 31st (recovered)
    d = addCycle(d, 'monthly', anchor);
    expect(d.toISOString()).toBe('2026-03-31T00:00:00.000Z');

    // Apr 2026 -> 30th
    d = addCycle(d, 'monthly', anchor);
    expect(d.toISOString()).toBe('2026-04-30T00:00:00.000Z');

    // May 2026 -> 31st
    d = addCycle(d, 'monthly', anchor);
    expect(d.toISOString()).toBe('2026-05-31T00:00:00.000Z');
  });

  it('handles monthly anchor day 30 and day 29', () => {
    const anchor30 = new Date('2026-01-30T00:00:00Z');
    const feb28_30 = addCycle(anchor30, 'monthly', anchor30);
    expect(feb28_30.toISOString()).toBe('2026-02-28T00:00:00.000Z');
    const mar30 = addCycle(feb28_30, 'monthly', anchor30);
    expect(mar30.toISOString()).toBe('2026-03-30T00:00:00.000Z');

    const anchor29 = new Date('2028-01-29T00:00:00Z'); // 2028 is a leap year
    const feb29 = addCycle(anchor29, 'monthly', anchor29);
    expect(feb29.toISOString()).toBe('2028-02-29T00:00:00.000Z');
    const mar29 = addCycle(feb29, 'monthly', anchor29);
    expect(mar29.toISOString()).toBe('2028-03-29T00:00:00.000Z');
  });

  it('handles quarterly transitions with short months', () => {
    const anchor = new Date('2026-01-31T00:00:00Z');
    const q1 = addCycle(anchor, 'quarterly', anchor); // Apr 30
    expect(q1.toISOString()).toBe('2026-04-30T00:00:00.000Z');
    const q2 = addCycle(q1, 'quarterly', anchor); // Jul 31
    expect(q2.toISOString()).toBe('2026-07-31T00:00:00.000Z');
    const q3 = addCycle(q2, 'quarterly', anchor); // Oct 31
    expect(q3.toISOString()).toBe('2026-10-31T00:00:00.000Z');
    const q4 = addCycle(q3, 'quarterly', anchor); // Jan 31 2027
    expect(q4.toISOString()).toBe('2027-01-31T00:00:00.000Z');
  });

  it('handles leap-day yearly and biennial cycles', () => {
    const leapAnchor = new Date('2024-02-29T00:00:00Z');

    // Yearly: 2025 (28th) -> 2026 (28th) -> 2027 (28th) -> 2028 (29th)
    const y2025 = addCycle(leapAnchor, 'yearly', leapAnchor);
    expect(y2025.toISOString()).toBe('2025-02-28T00:00:00.000Z');
    const y2026 = addCycle(y2025, 'yearly', leapAnchor);
    expect(y2026.toISOString()).toBe('2026-02-28T00:00:00.000Z');
    const y2027 = addCycle(y2026, 'yearly', leapAnchor);
    expect(y2027.toISOString()).toBe('2027-02-28T00:00:00.000Z');
    const y2028 = addCycle(y2027, 'yearly', leapAnchor);
    expect(y2028.toISOString()).toBe('2028-02-29T00:00:00.000Z');

    // Biennial: 2026 (28th) -> 2028 (29th)
    const b2026 = addCycle(leapAnchor, 'biennial', leapAnchor);
    expect(b2026.toISOString()).toBe('2026-02-28T00:00:00.000Z');
    const b2028 = addCycle(b2026, 'biennial', leapAnchor);
    expect(b2028.toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });
});

describe('nextOccurrence', () => {
  const now = new Date('2026-08-28T00:00:00Z');

  it('rolls a past start forward until it is in the future', () => {
    const next = nextOccurrence(new Date('2024-01-15T00:00:00Z'), 'yearly', now)!;
    expect(next.toISOString()).toBe('2027-01-15T00:00:00.000Z');
  });

  it('lands on the right year for a biennial subscription', () => {
    // Started Jan 2020, charged every 2 years → 2020, 2022, 2024, 2026(past), 2028.
    const next = nextOccurrence(new Date('2020-01-10T00:00:00Z'), 'biennial', now)!;
    expect(next.toISOString()).toBe('2028-01-10T00:00:00.000Z');
  });

  it('leaves an already-future start date alone', () => {
    const start = new Date('2027-03-01T00:00:00Z');
    expect(nextOccurrence(start, 'monthly', now)!.getTime()).toBe(start.getTime());
  });

  it('returns null for lifetime instead of looping forever', () => {
    expect(nextOccurrence(new Date('2020-01-01T00:00:00Z'), 'lifetime', now)).toBeNull();
  });

  it('preserves 31st January anchor across short months through September (reproduction test)', () => {
    const start = new Date('2026-01-31T00:00:00Z');
    const simulatedNow = new Date('2026-09-30T12:00:00Z');
    const next = nextOccurrence(start, 'monthly', simulatedNow)!;
    expect(next.toISOString()).toBe('2026-10-31T00:00:00.000Z');
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
