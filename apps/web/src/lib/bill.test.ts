import { describe, it, expect } from 'vitest';
import { billDaysUntilDue, billStatus, billIsOpen, nextBillDue } from './bill';

const DAY = 86400000;
const NOW = Date.parse('2026-07-10T12:00:00Z');
const iso = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString();

describe('billDaysUntilDue', () => {
  it('returns null for missing/invalid dates', () => {
    expect(billDaysUntilDue(null, NOW)).toBeNull();
    expect(billDaysUntilDue('', NOW)).toBeNull();
    expect(billDaysUntilDue('not-a-date', NOW)).toBeNull();
  });
  it('is positive for future, negative for past', () => {
    expect(billDaysUntilDue(iso(5), NOW)).toBe(5);
    expect(billDaysUntilDue(iso(-3), NOW)).toBe(-3);
  });
  it('ceils partial days', () => {
    expect(billDaysUntilDue(new Date(NOW + 0.5 * DAY).toISOString(), NOW)).toBe(1);
  });
});

describe('billStatus', () => {
  it('paid wins regardless of due date', () => {
    expect(billStatus(iso(-30), iso(-1), NOW)).toBe('paid');
    expect(billStatus(iso(10), iso(0), NOW)).toBe('paid');
  });
  it('overdue when unpaid and past due', () => {
    expect(billStatus(iso(-1), null, NOW)).toBe('overdue');
  });
  it('due-soon within the window', () => {
    expect(billStatus(iso(0), null, NOW)).toBe('due-soon');
    expect(billStatus(iso(7), null, NOW)).toBe('due-soon');
  });
  it('upcoming beyond the window', () => {
    expect(billStatus(iso(8), null, NOW)).toBe('upcoming');
    expect(billStatus(iso(60), null, NOW)).toBe('upcoming');
  });
  it('respects a custom soonDays', () => {
    expect(billStatus(iso(10), null, NOW, 14)).toBe('due-soon');
    expect(billStatus(iso(10), null, NOW, 3)).toBe('upcoming');
  });
  it('unpaid with no due date is upcoming, not overdue', () => {
    expect(billStatus(null, null, NOW)).toBe('upcoming');
  });
});

describe('billIsOpen', () => {
  it('open only when unpaid and not archived', () => {
    expect(billIsOpen(null, false)).toBe(true);
    expect(billIsOpen(iso(-1), false)).toBe(false);
    expect(billIsOpen(null, true)).toBe(false);
  });
});

describe('nextBillDue', () => {
  const base = '2026-07-10T00:00:00Z';
  it('advances by cycle', () => {
    expect(nextBillDue(base, 'weekly').toISOString().slice(0, 10)).toBe('2026-07-17');
    expect(nextBillDue(base, 'monthly').toISOString().slice(0, 10)).toBe('2026-08-10');
    expect(nextBillDue(base, 'quarterly').toISOString().slice(0, 10)).toBe('2026-10-10');
    expect(nextBillDue(base, 'yearly').toISOString().slice(0, 10)).toBe('2027-07-10');
  });
  it('defaults unknown cycle to monthly', () => {
    expect(nextBillDue(base, '').toISOString().slice(0, 10)).toBe('2026-08-10');
  });
});
