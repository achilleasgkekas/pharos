import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { addCycle, addCycleUTC } from './billingCycle';

// #103: date-only values are stored at UTC midnight. On a host west of UTC the local setters
// move them; the UTC variant must keep the calendar day on any TZ. Node honours a runtime TZ change.
describe('addCycleUTC keeps the calendar day west of UTC (#103)', () => {
  const prev = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'America/New_York'; });
  afterAll(() => { process.env.TZ = prev; });

  it('monthly: 1 May stays on the 1st for a year of steps', () => {
    let d = new Date('2026-05-01T00:00:00Z');
    for (let i = 0; i < 12; i++) d = addCycleUTC(d, 'monthly');
    expect(d.toISOString()).toBe('2027-05-01T00:00:00.000Z');
  });

  it('the local-time version really does drift here (why the UTC one exists)', () => {
    expect(addCycle(new Date('2026-05-01T00:00:00Z'), 'monthly').toISOString()).not.toBe('2026-06-01T00:00:00.000Z');
  });

  it('weekly and yearly step exactly', () => {
    expect(addCycleUTC(new Date('2026-12-29T00:00:00Z'), 'weekly').toISOString()).toBe('2027-01-05T00:00:00.000Z');
    expect(addCycleUTC(new Date('2026-03-01T00:00:00Z'), 'yearly').toISOString()).toBe('2027-03-01T00:00:00.000Z');
  });
});
