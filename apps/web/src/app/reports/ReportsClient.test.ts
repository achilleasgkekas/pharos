import { describe, it, expect } from 'vitest';
import { fmtDate } from './ReportsClient';

describe('ReportsClient fmtDate timezone behavior', () => {
  it('formats calendar date string without shifting in non-UTC timezone', () => {
    // When running in a timezone behind UTC (e.g. UTC-4), "2026-07-01" parsed as UTC midnight
    // would format as "30/06/26" without timeZone: 'UTC'.
    // With timeZone: 'UTC', it should format as "01/07/26".
    const res = fmtDate('2026-07-01', 'en');
    expect(res).toBe('01/07/26');
  });
});
