import { describe, it, expect, afterEach } from 'vitest';
import { reportWindowStart, inReportWindow, monthKeyOfDate } from './reportWindow';

describe('report period window (#122)', () => {
  const now = new Date(2026, 8, 17); // 17 Sep 2026, local time

  it('starts N-1 months before the current month, across a year boundary', () => {
    expect(reportWindowStart(now, 6)).toBe('2026-04');
    expect(reportWindowStart(now, 12)).toBe('2025-10');
    expect(reportWindowStart(now, 24)).toBe('2024-10');
    expect(reportWindowStart(new Date(2026, 0, 5), 6)).toBe('2025-08');
  });

  it('includes the first and current month, excludes older and undated records', () => {
    const start = reportWindowStart(now, 6);
    expect(inReportWindow('2026-04', start)).toBe(true);
    expect(inReportWindow('2026-09', start)).toBe(true);
    expect(inReportWindow('2026-03', start)).toBe(false);
    expect(inReportWindow('', start)).toBe(false);
    expect(inReportWindow('garbage', start)).toBe(false);
  });

  // This used to assert a LOCAL-time reading, via `new Date(2026, 3, 30, 23, 59)` — an instant
  // with a time of day, which no stored date ever has. It passed only because the machines that
  // ran it sat at or east of UTC, and it is what #242 was hiding behind. Stated in terms of a
  // real stored value it says the same thing without depending on where the test runs.
  it('keys a stored date by its own day and tolerates missing/invalid ones', () => {
    expect(monthKeyOfDate('2026-04-30T00:00:00.000Z')).toBe('2026-04');
    expect(monthKeyOfDate(null)).toBe('');
    expect(monthKeyOfDate('not a date')).toBe('');
  });
});

// #242 — the frame a STORED date is read in.
//
// Every date the app writes is a date-only value pinned to UTC midnight: DateInput emits
// `YYYY-MM-DD`, and the write paths cast it with an explicit `T00:00:00Z` (or let Mongoose do
// the same). Reading it back with local-time getters therefore asks a question the value never
// answered — "what o'clock was it" — and on any server west of UTC the answer moves the record
// into the previous month.
describe('stored dates are keyed in the frame they were written in (#242)', () => {
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
  });

  it('keeps a first-of-the-month date in its own month on a server behind UTC', () => {
    process.env.TZ = 'America/New_York'; // UTC-4 in July: UTC midnight is still 30 Jun locally
    expect(monthKeyOfDate('2026-07-01T00:00:00.000Z')).toBe('2026-07');
    expect(monthKeyOfDate(new Date('2026-07-01T00:00:00.000Z'))).toBe('2026-07');
    expect(monthKeyOfDate('2026-07-01')).toBe('2026-07');
  });

  it('gives the same key on a server ahead of UTC, so two deployments agree', () => {
    process.env.TZ = 'Europe/Athens';
    expect(monthKeyOfDate('2026-07-01T00:00:00.000Z')).toBe('2026-07');
    process.env.TZ = 'Pacific/Kiritimati'; // UTC+14, the far edge
    expect(monthKeyOfDate('2026-07-01T00:00:00.000Z')).toBe('2026-07');
    process.env.TZ = 'Pacific/Midway'; // UTC-11, the other one
    expect(monthKeyOfDate('2026-07-31T00:00:00.000Z')).toBe('2026-07');
  });

  it('still refuses missing and unparseable values', () => {
    expect(monthKeyOfDate(null)).toBe('');
    expect(monthKeyOfDate(undefined)).toBe('');
    expect(monthKeyOfDate('not a date')).toBe('');
    expect(monthKeyOfDate(new Date('nonsense'))).toBe('');
  });
});
