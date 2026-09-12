import { describe, it, expect } from 'vitest';
import { documentDaysUntilExpiry, documentStatus, collectExpiringDocuments } from './documentExpiry';

const NOW = new Date('2026-09-12T09:00:00Z').getTime();
const inDays = (n: number) => new Date(NOW + n * 86400000).toISOString();

describe('documentDaysUntilExpiry', () => {
  it('counts whole days, 0 = today, negative = expired', () => {
    expect(documentDaysUntilExpiry(inDays(0), NOW)).toBe(0);
    expect(documentDaysUntilExpiry(inDays(10), NOW)).toBe(10);
    expect(documentDaysUntilExpiry(inDays(-3), NOW)).toBe(-3);
  });
  it('is null for missing / unparseable dates', () => {
    expect(documentDaysUntilExpiry(null, NOW)).toBeNull();
    expect(documentDaysUntilExpiry('', NOW)).toBeNull();
    expect(documentDaysUntilExpiry('not-a-date', NOW)).toBeNull();
  });
  it('ignores time-of-day (day granularity)', () => {
    const lateToday = new Date('2026-09-12T23:30:00Z').toISOString();
    expect(documentDaysUntilExpiry(lateToday, NOW)).toBe(0);
  });
});

describe('documentStatus', () => {
  it('expired when past, soon within lead, ok beyond', () => {
    expect(documentStatus(-1, 30)).toBe('expired');
    expect(documentStatus(0, 30)).toBe('soon');
    expect(documentStatus(30, 30)).toBe('soon');
    expect(documentStatus(31, 30)).toBe('ok');
    expect(documentStatus(null, 30)).toBe('ok');
  });
});

describe('collectExpiringDocuments', () => {
  const rows = [
    { _id: 'a', title: 'Passport', type: 'passport', holder: 'Achilleas', expiryDate: inDays(45) }, // beyond lead
    { _id: 'b', title: 'Licence', type: 'licence', holder: 'Achilleas', expiryDate: inDays(10) }, // soon
    { _id: 'c', title: 'MOT', type: 'vehicle', holder: '', expiryDate: inDays(-5) }, // expired
    { _id: 'd', title: 'No date', type: '', holder: '', expiryDate: null }, // skip
  ];

  it('returns expiring-within-lead plus overdue, soonest/most-overdue first', () => {
    const out = collectExpiringDocuments(rows, 30, NOW);
    expect(out.map((d) => d._id)).toEqual(['c', 'b']); // -5 then 10; passport (45) and null excluded
  });

  it('is empty when the lead window is off (<= 0)', () => {
    expect(collectExpiringDocuments(rows, 0, NOW)).toEqual([]);
    expect(collectExpiringDocuments(rows, -1, NOW)).toEqual([]);
  });

  it('carries the fields the alert line needs', () => {
    const [first] = collectExpiringDocuments([rows[1]], 30, NOW);
    expect(first).toMatchObject({ title: 'Licence', type: 'licence', holder: 'Achilleas', days: 10 });
    expect(first.iso).toBe(inDays(10).slice(0, 10));
  });
});
