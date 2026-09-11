import { describe, it, expect } from 'vitest';
import {
  parseHHMM,
  normalizeQuietHours,
  quietHoursEnabled,
  isWithinQuietHours,
  type QuietHours,
} from './quietHours';

// A Date at a given server-local hour:minute (calendar day is irrelevant to the window).
function at(h: number, m = 0): Date {
  return new Date(2026, 8, 11, h, m, 0);
}

describe('parseHHMM', () => {
  it('parses valid times to minutes since midnight', () => {
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('07:30')).toBe(450);
    expect(parseHHMM('23:59')).toBe(1439);
  });
  it('rejects malformed / out-of-range input', () => {
    for (const bad of ['', '  ', '7:5', '24:00', '10:60', 'ab:cd', '10', '10:00:00']) {
      expect(parseHHMM(bad)).toBeNull();
    }
  });
});

describe('normalizeQuietHours', () => {
  it('keeps valid times, trims, drops junk', () => {
    expect(normalizeQuietHours({ start: ' 22:00 ', end: '07:00' })).toEqual({ start: '22:00', end: '07:00' });
    expect(normalizeQuietHours({ start: 'nope', end: '07:00' })).toEqual({ start: '', end: '07:00' });
    expect(normalizeQuietHours(null)).toEqual({ start: '', end: '' });
    expect(normalizeQuietHours({})).toEqual({ start: '', end: '' });
  });
});

describe('quietHoursEnabled', () => {
  it('is off when unset, malformed, or equal', () => {
    expect(quietHoursEnabled({ start: '', end: '' })).toBe(false);
    expect(quietHoursEnabled({ start: '22:00', end: '' })).toBe(false);
    expect(quietHoursEnabled({ start: '08:00', end: '08:00' })).toBe(false);
  });
  it('is on for a real window', () => {
    expect(quietHoursEnabled({ start: '22:00', end: '07:00' })).toBe(true);
  });
});

describe('isWithinQuietHours', () => {
  const overnight: QuietHours = { start: '22:00', end: '07:00' };
  const daytime: QuietHours = { start: '09:00', end: '17:00' };

  it('never quiet when the window is disabled', () => {
    expect(isWithinQuietHours(at(3), { start: '', end: '' })).toBe(false);
  });

  it('overnight window wraps past midnight', () => {
    expect(isWithinQuietHours(at(23), overnight)).toBe(true);
    expect(isWithinQuietHours(at(3), overnight)).toBe(true);
    expect(isWithinQuietHours(at(6, 59), overnight)).toBe(true);
    expect(isWithinQuietHours(at(7, 0), overnight)).toBe(false); // half-open at end
    expect(isWithinQuietHours(at(12), overnight)).toBe(false);
    expect(isWithinQuietHours(at(22, 0), overnight)).toBe(true); // inclusive at start
    expect(isWithinQuietHours(at(21, 59), overnight)).toBe(false);
  });

  it('same-day window does not wrap', () => {
    expect(isWithinQuietHours(at(10), daytime)).toBe(true);
    expect(isWithinQuietHours(at(9, 0), daytime)).toBe(true);
    expect(isWithinQuietHours(at(17, 0), daytime)).toBe(false);
    expect(isWithinQuietHours(at(3), daytime)).toBe(false);
    expect(isWithinQuietHours(at(20), daytime)).toBe(false);
  });
});
