import { describe, expect, it } from 'vitest';
import { addMonths, inPeriod, monthsBetween, pctChange, periodMonths, periodQuery, resolveReportPeriod } from './reportPeriod';

const NOW = new Date(2026, 9, 15); // 15 Oct 2026

describe('resolveReportPeriod', () => {
  it('defaults to the last 12 months, compared with the 12 before', () => {
    const p = resolveReportPeriod({}, NOW);
    expect(p).toMatchObject({ preset: '12m', start: '2025-11', end: '2026-10', months: 12, prevStart: '2024-11', prevEnd: '2025-10' });
  });

  it('compares this month with last month, and last month with the one before', () => {
    expect(resolveReportPeriod({ period: 'this-month' }, NOW)).toMatchObject({ start: '2026-10', end: '2026-10', prevStart: '2026-09', prevEnd: '2026-09' });
    expect(resolveReportPeriod({ period: 'last-month' }, NOW)).toMatchObject({ start: '2026-09', end: '2026-09', prevStart: '2026-08', prevEnd: '2026-08' });
  });

  it('runs this year from January to now, against as many months before', () => {
    expect(resolveReportPeriod({ period: 'this-year' }, NOW)).toMatchObject({ start: '2026-01', end: '2026-10', months: 10, prevStart: '2025-03', prevEnd: '2025-12' });
    expect(resolveReportPeriod({ period: 'last-year' }, NOW)).toMatchObject({ start: '2025-01', end: '2025-12', prevStart: '2024-01', prevEnd: '2024-12' });
  });

  it('keeps the old ?months= links working', () => {
    expect(resolveReportPeriod({ months: '6' }, NOW)).toMatchObject({ preset: '6m', start: '2026-05', end: '2026-10' });
    expect(resolveReportPeriod({ months: '24' }, NOW)).toMatchObject({ start: '2024-11', end: '2026-10', months: 24 });
  });

  it('reads a custom range, swapping it when reversed and clamping it to today', () => {
    expect(resolveReportPeriod({ period: 'custom', from: '2026-03', to: '2026-01' }, NOW)).toMatchObject({ preset: 'custom', start: '2026-01', end: '2026-03', months: 3, prevStart: '2025-10', prevEnd: '2025-12' });
    expect(resolveReportPeriod({ period: 'custom', from: '2026-09', to: '2027-04' }, NOW)).toMatchObject({ start: '2026-09', end: '2026-10' });
    expect(resolveReportPeriod({ period: 'custom', from: '2026-02' }, NOW)).toMatchObject({ start: '2026-02', end: '2026-02' });
  });

  it('caps a custom range at 60 months and ignores a malformed one', () => {
    expect(resolveReportPeriod({ period: 'custom', from: '1990-01', to: '2026-10' }, NOW).months).toBe(60);
    expect(resolveReportPeriod({ period: 'custom', from: '2026-13', to: 'x' }, NOW).preset).toBe('12m');
    expect(resolveReportPeriod({ period: 'nonsense' }, NOW).preset).toBe('12m');
  });
});

describe('month helpers', () => {
  it('moves and counts months across years', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2025-12', 2)).toBe('2026-02');
    expect(monthsBetween('2025-11', '2026-02')).toBe(4);
    expect(periodMonths('2025-11', '2026-01')).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('places keys inside or outside a period', () => {
    expect(inPeriod('2026-03', '2026-01', '2026-03')).toBe(true);
    expect(inPeriod('2026-04', '2026-01', '2026-03')).toBe(false);
    expect(inPeriod('', '2026-01', '2026-03')).toBe(false);
  });

  it('builds the query and the change', () => {
    expect(periodQuery({ preset: 'custom', start: '2026-01', end: '2026-03' })).toBe('period=custom&from=2026-01&to=2026-03');
    expect(periodQuery({ preset: 'this-year', start: '2026-01', end: '2026-10' })).toBe('period=this-year');
    expect(pctChange(120, 100)).toBe(20);
    expect(pctChange(50, 0)).toBeNull();
  });
});
