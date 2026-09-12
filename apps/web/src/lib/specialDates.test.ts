import { describe, it, expect } from 'vitest';
import { nextOccurrenceDays, yearsAtNextOccurrence, collectUpcomingDates } from './specialDates';

// A fixed "now" in LOCAL time (the module works in local time). Mid-June avoids year/DST edges.
const NOW = new Date(2026, 5, 15, 10, 0, 0).getTime(); // 2026-06-15 local

describe('nextOccurrenceDays', () => {
  it('is 0 on the day itself', () => {
    expect(nextOccurrenceDays(6, 15, NOW)).toBe(0);
  });
  it('counts forward to a date later this year', () => {
    expect(nextOccurrenceDays(6, 25, NOW)).toBe(10);
  });
  it('rolls to next year once this year has passed', () => {
    // 2026-06-10 already passed → next is 2027-06-10 (~360 days out)
    const d = nextOccurrenceDays(6, 10, NOW)!;
    expect(d).toBeGreaterThan(355);
    expect(d).toBeLessThan(366);
  });
  it('returns null for an invalid month/day', () => {
    expect(nextOccurrenceDays(0, 10, NOW)).toBeNull();
    expect(nextOccurrenceDays(13, 10, NOW)).toBeNull();
    expect(nextOccurrenceDays(6, 32, NOW)).toBeNull();
  });
  it('clamps Feb 29 into a non-leap year instead of overflowing to March', () => {
    // From 2026-06-15 the next Feb 29 occurrence: 2027 is not a leap year → clamp to Feb 28.
    const d = nextOccurrenceDays(2, 29, NOW)!;
    const feb28_2027 = new Date(2027, 1, 28); feb28_2027.setHours(0, 0, 0, 0);
    const today = new Date(NOW); today.setHours(0, 0, 0, 0);
    expect(d).toBe(Math.round((feb28_2027.getTime() - today.getTime()) / 86400000));
  });
});

describe('yearsAtNextOccurrence', () => {
  it('is the age reached at the next birthday', () => {
    // born 1990, next birthday 2026-06-25 → turns 36
    expect(yearsAtNextOccurrence(1990, 6, 25, NOW)).toBe(36);
  });
  it('rolls with the occurrence year', () => {
    // born 1990, birthday 2026-06-10 already passed → next is 2027 → 37
    expect(yearsAtNextOccurrence(1990, 6, 10, NOW)).toBe(37);
  });
  it('is null when the year is unknown', () => {
    expect(yearsAtNextOccurrence(0, 6, 25, NOW)).toBeNull();
  });
});

describe('collectUpcomingDates', () => {
  const rows = [
    { _id: 'a', name: 'Today', type: 'birthday', month: 6, day: 15, year: 2000 }, // 0d
    { _id: 'b', name: 'Soon', type: 'anniversary', month: 6, day: 20 }, // 5d
    { _id: 'c', name: 'Far', type: 'birthday', month: 8, day: 1 }, // beyond a 7d lead
  ];
  it('returns dates within the lead window, soonest first, with age when known', () => {
    const out = collectUpcomingDates(rows, 7, NOW);
    expect(out.map((d) => d._id)).toEqual(['a', 'b']);
    expect(out[0].years).toBe(26); // 2026 - 2000
    expect(out[1].years).toBeNull();
  });
  it('is empty when the reminder is off (lead <= 0)', () => {
    expect(collectUpcomingDates(rows, 0, NOW)).toEqual([]);
  });
});
