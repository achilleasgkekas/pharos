import { describe, it, expect } from 'vitest';
import {
  renewalDaysUntil,
  renewalHasPassed,
  effectiveNextRenewal,
  effectiveNextRenewalISO,
  renewalOnOrAfter,
} from './subscriptionRenewal';

// The bug these pin: `nextRenewal` is written once and never advanced, so a subscription
// whose renewal date has gone by reads "Renews overdue" until a human opens it and re-saves.
const NOW = new Date(2026, 8, 5, 12, 0, 0).getTime(); // Sat 5 Sep 2026, midday

describe('renewalDaysUntil', () => {
  it('counts whole days ahead', () => {
    expect(renewalDaysUntil(new Date(2026, 8, 8, 12, 0, 0), NOW)).toBe(3);
  });

  it('is null without a date', () => {
    expect(renewalDaysUntil(null, NOW)).toBeNull();
    expect(renewalDaysUntil(undefined, NOW)).toBeNull();
    expect(renewalDaysUntil('', NOW)).toBeNull();
  });

  it('is null for an unparseable date rather than NaN', () => {
    expect(renewalDaysUntil('not a date', NOW)).toBeNull();
  });

  it('still reads as today for a date stamped at midnight earlier today', () => {
    // Dates entered as YYYY-MM-DD land on UTC midnight, which is already behind a
    // midday `now`. Rounding up keeps that "renews today", not "overdue".
    expect(renewalDaysUntil(new Date(2026, 8, 5, 0, 0, 0), NOW)).toBe(-0);
    expect(renewalHasPassed(new Date(2026, 8, 5, 0, 0, 0), NOW)).toBe(false);
  });

  it('reads as passed once a full day has gone by', () => {
    expect(renewalHasPassed(new Date(2026, 8, 4, 0, 0, 0), NOW)).toBe(true);
  });

  it('nothing has passed when there is no date at all', () => {
    expect(renewalHasPassed(null, NOW)).toBe(false);
  });
});

describe('effectiveNextRenewal', () => {
  it('leaves a date that is still ahead exactly as stored', () => {
    const stored = new Date(2026, 8, 20);
    expect(effectiveNextRenewal(stored, 'monthly', NOW)).toEqual(stored);
  });

  it('rolls a renewal that has gone by to the next one still ahead — no re-save needed', () => {
    // 3 Aug is two cycles behind: 3 Sep has been and gone as well, so the answer is 3 Oct.
    expect(effectiveNextRenewal(new Date(2026, 7, 3), 'monthly', NOW)).toEqual(new Date(2026, 9, 3));
  });

  it('rolls a badly stale date forward by however many cycles it takes', () => {
    // Two and a half years of unopened Netflix: keep stepping, never park on "overdue".
    expect(effectiveNextRenewal(new Date(2024, 2, 3), 'monthly', NOW)).toEqual(new Date(2026, 9, 3));
  });

  it('rolls a stale weekly cycle by weeks, stopping on the first one not yet behind', () => {
    // 1 Aug + 5 weeks = 5 Sep, which is today — today is not "passed", so it stops there.
    expect(effectiveNextRenewal(new Date(2026, 7, 1), 'weekly', NOW)).toEqual(new Date(2026, 8, 5));
  });

  it('rolls a stale yearly cycle by years, landing on the same day of the year', () => {
    expect(effectiveNextRenewal(new Date(2023, 1, 7), 'yearly', NOW)).toEqual(new Date(2027, 1, 7));
  });

  it('keeps a renewal dated today as today', () => {
    const today = new Date(2026, 8, 5, 0, 0, 0);
    expect(effectiveNextRenewal(today, 'monthly', NOW)).toEqual(today);
  });

  it('treats an unknown cycle as monthly, exactly as addCycle does', () => {
    expect(effectiveNextRenewal(new Date(2026, 7, 3), 'biweekly', NOW)).toEqual(new Date(2026, 9, 3));
  });

  it('defaults a missing cycle to monthly', () => {
    expect(effectiveNextRenewal(new Date(2026, 7, 3), null, NOW)).toEqual(new Date(2026, 9, 3));
  });

  it('never rolls a lifetime purchase — it has no next charge', () => {
    const stored = new Date(2024, 0, 1);
    expect(effectiveNextRenewal(stored, 'lifetime', NOW)).toEqual(stored);
  });

  it('is null when there is no renewal date', () => {
    expect(effectiveNextRenewal(null, 'monthly', NOW)).toBeNull();
  });

  it('accepts the ISO strings the serialized shapes carry', () => {
    // Both sides built from LOCAL dates on purpose. The roll steps whole months with
    // setMonth, which keeps the wall-clock time, so a hardcoded UTC input against a
    // local-midnight expectation only lined up on a machine running in UTC — in Athens
    // the right-hand side is 2026-10-02T21:00Z and the test failed everywhere else.
    expect(effectiveNextRenewalISO(new Date(2026, 7, 3).toISOString(), 'monthly', NOW)).toBe(
      new Date(2026, 9, 3).toISOString()
    );
  });

  it('serializes an absent date as null rather than inventing one', () => {
    expect(effectiveNextRenewalISO(null, 'monthly', NOW)).toBeNull();
  });
});

describe('renewalOnOrAfter', () => {
  const windowStart = new Date(2026, 8, 1);

  it('rolls a long-stale renewal all the way into the window', () => {
    // The case the agenda's bounded step loop used to give up on: 2 years of weekly steps.
    const seeded = renewalOnOrAfter(new Date(2024, 2, 1), 'weekly', windowStart);
    expect(seeded!.getTime()).toBeGreaterThanOrEqual(windowStart.getTime());
    expect(seeded!.getTime()).toBeLessThan(new Date(2026, 8, 8).getTime());
  });

  it('keeps a date that already sits inside the window, past days included', () => {
    // The 3rd is behind `now` but still this month: the calendar must keep drawing it.
    const stored = new Date(2026, 8, 3);
    expect(renewalOnOrAfter(stored, 'monthly', windowStart)).toEqual(stored);
  });

  it('leaves a future date alone', () => {
    const stored = new Date(2026, 10, 3);
    expect(renewalOnOrAfter(stored, 'monthly', windowStart)).toEqual(stored);
  });

  it('never steps a lifetime purchase into the window', () => {
    const stored = new Date(2024, 0, 1);
    expect(renewalOnOrAfter(stored, 'lifetime', windowStart)).toEqual(stored);
  });

  it('is null without a stored date', () => {
    expect(renewalOnOrAfter(null, 'monthly', windowStart)).toBeNull();
  });
});
