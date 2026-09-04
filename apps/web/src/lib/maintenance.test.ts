import { describe, it, expect } from 'vitest';
import {
  maintenanceApplies,
  maintenanceAnchor,
  maintenanceNextDue,
  maintenanceDaysUntilDue,
  maintenanceState,
  normalizeMaintenanceInterval,
} from './maintenance';

const DAY = 86400000;
const NOW = Date.parse('2026-09-04T12:00:00Z');
const iso = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString();

describe('maintenanceApplies', () => {
  it('covers only the two owned-and-in-the-house statuses', () => {
    expect(maintenanceApplies('received')).toBe(true);
    expect(maintenanceApplies('installed')).toBe(true);
    for (const s of ['researching', 'decided', 'ordered', 'deferred', 'sold', 'broken']) {
      expect(maintenanceApplies(s)).toBe(false);
    }
  });
  it('is false for a missing status rather than throwing', () => {
    expect(maintenanceApplies(null)).toBe(false);
    expect(maintenanceApplies(undefined)).toBe(false);
  });
});

describe('maintenanceAnchor', () => {
  it('prefers the last service over the purchase date', () => {
    expect(maintenanceAnchor(iso(-10), iso(-400))?.toISOString()).toBe(iso(-10));
  });
  it('falls back to the purchase date when never serviced', () => {
    expect(maintenanceAnchor(null, iso(-400))?.toISOString()).toBe(iso(-400));
  });
  it('skips an unparseable date instead of returning Invalid Date', () => {
    expect(maintenanceAnchor('not-a-date', iso(-5))?.toISOString()).toBe(iso(-5));
    expect(maintenanceAnchor('not-a-date', null)).toBeNull();
  });
  it('is null with nothing to count from', () => {
    expect(maintenanceAnchor(null, null)).toBeNull();
  });
});

describe('maintenanceNextDue', () => {
  it('adds the interval to the anchor', () => {
    expect(maintenanceNextDue(30, iso(-10))?.toISOString()).toBe(iso(20));
  });
  it('is null without an interval — every pre-P41 item', () => {
    expect(maintenanceNextDue(null, iso(-10))).toBeNull();
    expect(maintenanceNextDue(0, iso(-10))).toBeNull();
    expect(maintenanceNextDue(-5, iso(-10))).toBeNull();
  });
  it('is null when there is an interval but nothing to count from', () => {
    expect(maintenanceNextDue(30, null, null)).toBeNull();
  });
});

describe('maintenanceDaysUntilDue', () => {
  it('is positive ahead of the date and negative once it has passed', () => {
    expect(maintenanceDaysUntilDue(30, iso(-10), null, NOW)).toBe(20);
    expect(maintenanceDaysUntilDue(30, iso(-45), null, NOW)).toBe(-15);
  });
  it('counts from the purchase date for an item never serviced', () => {
    // Bought a year ago, serviced every 90 days, never done → deeply overdue.
    expect(maintenanceDaysUntilDue(90, null, iso(-365), NOW)).toBe(-275);
  });
});

describe('maintenanceState', () => {
  it('is null when unscheduled, so nothing changes for an existing item', () => {
    expect(maintenanceState(null, iso(-10), null, NOW)).toBeNull();
    expect(maintenanceState(30, null, null, NOW)).toBeNull();
  });
  it('separates overdue, due-soon and ok', () => {
    expect(maintenanceState(30, iso(-45), null, NOW)).toBe('overdue');
    expect(maintenanceState(30, iso(-25), null, NOW)).toBe('due-soon');
    expect(maintenanceState(30, iso(-1), null, NOW)).toBe('ok');
  });
  it('treats the due day itself as due-soon, not overdue', () => {
    expect(maintenanceState(30, iso(-30), null, NOW)).toBe('due-soon');
  });
  it('honours a custom soon window', () => {
    expect(maintenanceState(30, iso(-15), null, NOW, 30)).toBe('due-soon');
  });
});

describe('normalizeMaintenanceInterval', () => {
  it('maps every flavour of "no schedule" to null, never to 0', () => {
    for (const v of ['', null, undefined, 0, -3, 'abc', NaN]) {
      expect(normalizeMaintenanceInterval(v)).toBeNull();
    }
  });
  it('rounds a typed number and accepts a numeric string from the form', () => {
    expect(normalizeMaintenanceInterval('90')).toBe(90);
    expect(normalizeMaintenanceInterval(90.4)).toBe(90);
  });
  it('caps a fat-fingered interval at ten years', () => {
    expect(normalizeMaintenanceInterval(99999)).toBe(3650);
  });
});
