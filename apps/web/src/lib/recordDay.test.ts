import { describe, expect, it } from 'vitest';
import { recordDay, formatRecordDay } from './recordDay';

// #355: the Receipts list printed one day and its PERIOD filter used another. recordDay is the
// one definition both now use. Run under any TZ: the expectations below hold in every zone for
// date-only values, and the local-time cases compare against the zone's own local day.

const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('recordDay', () => {
  it('reads a UTC-midnight value (a picked, typed or AI-read date) as its UTC day, in any zone', () => {
    expect(recordDay('2026-09-01T00:00:00.000Z')).toBe('2026-09-01');
    expect(recordDay(new Date(Date.UTC(2026, 7, 31)))).toBe('2026-08-31');
  });

  it("reads a real instant (upload or email time) in the viewer's zone", () => {
    expect(recordDay('2026-08-31T22:30:00.000Z')).toBe(localDay('2026-08-31T22:30:00.000Z'));
    expect(recordDay('2026-09-15T12:00:00.000Z')).toBe(localDay('2026-09-15T12:00:00.000Z'));
  });

  it('is empty for missing or invalid values', () => {
    expect(recordDay('')).toBe('');
    expect(recordDay(null)).toBe('');
    expect(recordDay('not a date')).toBe('');
  });
});

describe('formatRecordDay', () => {
  it('prints the same day recordDay returns', () => {
    expect(formatRecordDay('2026-09-01T00:00:00.000Z', 'en')).toBe('01/09/2026');
    expect(formatRecordDay(null, 'en')).toBe('');
  });
});
