import { describe, it, expect } from 'vitest';
import { effectiveReturnWindow, returnDaysLeft, DEFAULT_RETURN_WINDOW_DAYS } from './returnWindow';

const STORES = [
  { name: 'Plaisio', returnWindowDays: 30 },
  { name: 'TechLamb', returnWindowDays: 0 }, // no returns
  { name: 'Skroutz', returnWindowDays: null }, // inherit default
  { name: 'Amazon.de' }, // inherit default
];

describe('effectiveReturnWindow', () => {
  it('uses the store override when set', () => {
    expect(effectiveReturnWindow('Plaisio', STORES, 14)).toBe(30);
  });

  it('honours an explicit 0 (no returns) override', () => {
    expect(effectiveReturnWindow('TechLamb', STORES, 14)).toBe(0);
  });

  it('falls back to the default when the store has no override', () => {
    expect(effectiveReturnWindow('Skroutz', STORES, 14)).toBe(14);
    expect(effectiveReturnWindow('Amazon.de', STORES, 21)).toBe(21);
  });

  it('matches store names case-insensitively with surrounding whitespace', () => {
    expect(effectiveReturnWindow('  PLAISIO ', STORES, 14)).toBe(30);
  });

  it('falls back to the default for unknown or empty stores', () => {
    expect(effectiveReturnWindow('Unknown store', STORES, 14)).toBe(14);
    expect(effectiveReturnWindow('', STORES, 14)).toBe(14);
  });

  it('never returns a negative default', () => {
    expect(effectiveReturnWindow('Unknown', STORES, -5)).toBe(0);
  });
});

describe('returnDaysLeft', () => {
  const now = new Date('2026-07-09T12:00:00Z').getTime();

  it('counts days remaining inside the window', () => {
    // Bought 10 days ago with a 14-day window → 4 days left (deadline midnight-based).
    expect(returnDaysLeft('2026-06-29T00:00:00Z', 14, now)).toBe(4);
  });

  it('returns the full window for a same-day purchase', () => {
    expect(returnDaysLeft('2026-07-09T00:00:00Z', 14, now)).toBe(14);
  });

  it('returns 0 on the deadline day', () => {
    // Deadline lands later today (12:00 now, deadline at 24:00-equivalent boundary).
    expect(returnDaysLeft('2026-06-25T13:00:00Z', 14, now)).toBe(1);
    expect(returnDaysLeft('2026-06-25T06:00:00Z', 14, now)).toBe(0);
  });

  it('returns null once the window has closed', () => {
    expect(returnDaysLeft('2026-06-01T00:00:00Z', 14, now)).toBeNull();
  });

  it('returns null for a disabled window or invalid date', () => {
    expect(returnDaysLeft('2026-07-09', 0, now)).toBeNull();
    expect(returnDaysLeft('2026-07-09', -3, now)).toBeNull();
    expect(returnDaysLeft('not-a-date', 14, now)).toBeNull();
    expect(returnDaysLeft(null, 14, now)).toBeNull();
    expect(returnDaysLeft(undefined, 14, now)).toBeNull();
  });

  it('clamps bogus future-dated purchases to the window length', () => {
    expect(returnDaysLeft('2026-08-01T00:00:00Z', 14, now)).toBe(14);
  });

  it('accepts Date objects', () => {
    expect(returnDaysLeft(new Date('2026-06-29T00:00:00Z'), 14, now)).toBe(4);
  });

  it('exports the EU default of 14 days', () => {
    expect(DEFAULT_RETURN_WINDOW_DAYS).toBe(14);
  });
});
