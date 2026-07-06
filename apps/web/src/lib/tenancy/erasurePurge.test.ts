import { describe, it, expect } from 'vitest';
import { daysOverdue, purgeTarget, planErasurePurge } from './erasurePurge';

// Only the PURE planners are unit-tested. The CRON route is SaaS-gated (404 when SAAS_MODE off),
// CRON_SECRET-protected, and read-only; `runErasurePurgeScan` just loads due Tenant rows and hands
// them to `planErasurePurge`. This scaffold is REPORT-ONLY — it never drops a database.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-06T12:00:00.000Z');

describe('daysOverdue', () => {
  it('floors whole days past the scheduled purge instant', () => {
    expect(daysOverdue(new Date(NOW.getTime() - 3 * MS_PER_DAY), NOW)).toBe(3);
    // 2.9 days past → floored to 2 (not yet a full 3rd day overdue).
    expect(daysOverdue(new Date(NOW.getTime() - 2.9 * MS_PER_DAY), NOW)).toBe(2);
  });
  it('is 0 exactly at the due instant', () => {
    expect(daysOverdue(NOW, NOW)).toBe(0);
  });
  it('is null when not yet due (schedule in the future)', () => {
    expect(daysOverdue(new Date(NOW.getTime() + MS_PER_DAY), NOW)).toBeNull();
  });
  it('is null for a missing or invalid schedule', () => {
    expect(daysOverdue(null, NOW)).toBeNull();
    expect(daysOverdue(undefined, NOW)).toBeNull();
    expect(daysOverdue('not-a-date', NOW)).toBeNull();
  });
  it('accepts ISO string schedules', () => {
    expect(daysOverdue(new Date(NOW.getTime() - MS_PER_DAY).toISOString(), NOW)).toBe(1);
  });
});

describe('purgeTarget', () => {
  const due = {
    id: 't1',
    slug: 'acme',
    dbName: 'tenant_acme',
    erasureRequestedAt: new Date(NOW.getTime() - 31 * MS_PER_DAY),
    erasureScheduledAt: new Date(NOW.getTime() - MS_PER_DAY),
    erasureRequestedBy: 'acc-1',
  };

  it('projects a genuinely-due candidate', () => {
    const t = purgeTarget(due, NOW);
    expect(t).not.toBeNull();
    expect(t).toMatchObject({
      id: 't1',
      slug: 'acme',
      dbName: 'tenant_acme',
      requestedBy: 'acc-1',
      daysOverdue: 1,
    });
    expect(t!.scheduledAt).toBe(due.erasureScheduledAt.toISOString());
    expect(t!.requestedAt).toBe(due.erasureRequestedAt.toISOString());
  });

  it('refuses a candidate that is not yet due', () => {
    expect(purgeTarget({ ...due, erasureScheduledAt: new Date(NOW.getTime() + MS_PER_DAY) }, NOW)).toBeNull();
  });

  it('refuses a candidate with no schedule', () => {
    expect(purgeTarget({ ...due, erasureScheduledAt: null }, NOW)).toBeNull();
  });

  it('refuses a blank id (defence-in-depth)', () => {
    expect(purgeTarget({ ...due, id: '  ' }, NOW)).toBeNull();
  });

  it('refuses a blank dbName — a purge must be able to name the database to drop', () => {
    expect(purgeTarget({ ...due, dbName: '' }, NOW)).toBeNull();
    expect(purgeTarget({ ...due, dbName: null }, NOW)).toBeNull();
  });

  it('trims the id and tolerates missing optional fields', () => {
    const t = purgeTarget({ id: ' t2 ', dbName: 'tenant_x', erasureScheduledAt: NOW }, NOW);
    expect(t).toMatchObject({ id: 't2', slug: null, requestedBy: null, requestedAt: null, daysOverdue: 0 });
  });
});

describe('planErasurePurge', () => {
  it('keeps only the genuinely-due, safely-named workspaces', () => {
    const past = new Date(NOW.getTime() - 2 * MS_PER_DAY);
    const future = new Date(NOW.getTime() + 2 * MS_PER_DAY);
    const rows = [
      { id: 'due-1', dbName: 'tenant_a', slug: 'a', erasureScheduledAt: past },
      { id: 'not-due', dbName: 'tenant_b', slug: 'b', erasureScheduledAt: future },
      { id: 'no-db', dbName: '', slug: 'c', erasureScheduledAt: past },
      { id: '', dbName: 'tenant_d', slug: 'd', erasureScheduledAt: past },
      { id: 'due-2', dbName: 'tenant_e', slug: 'e', erasureScheduledAt: NOW },
    ];
    const targets = planErasurePurge(rows, NOW);
    expect(targets.map((t) => t.id)).toEqual(['due-1', 'due-2']);
  });

  it('returns [] for a non-array or empty input', () => {
    expect(planErasurePurge([], NOW)).toEqual([]);
    // @ts-expect-error deliberately bad input
    expect(planErasurePurge(null, NOW)).toEqual([]);
  });
});
