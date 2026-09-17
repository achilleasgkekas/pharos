import { describe, it, expect } from 'vitest';
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

  it('keys dates in local time and tolerates missing/invalid ones', () => {
    expect(monthKeyOfDate(new Date(2026, 3, 30, 23, 59))).toBe('2026-04');
    expect(monthKeyOfDate(null)).toBe('');
    expect(monthKeyOfDate('not a date')).toBe('');
  });
});
