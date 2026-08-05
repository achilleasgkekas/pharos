import { describe, it, expect } from 'vitest';
import {
  SUSPENDED_GRACE_DAYS,
  SUSPEND_WARN_BEFORE_DAYS,
  SUSPENSION_ERASURE_ACTOR,
  suspendedDeadline,
  daysUntilSuspendedPurge,
  isSuspendedPurgeDue,
  shouldWarnSuspended,
  planSuspendedWarnings,
  planSuspendedPurges,
  unstampedSuspendedFilter,
  suspendedWarningFilter,
  suspendedPurgeFilter,
  suspendedWarningEmail,
  isStaleSuspension,
  planSuspendedErasure,
} from './suspendedSweep';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-05T00:00:00.000Z');
/** A suspension that started `n` days BEFORE now. */
const suspendedDaysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

describe('the promised window', () => {
  it('is 30 days — the number the public Terms, Privacy and FAQ all state', () => {
    // Not a tautology: this constant is a promise to users, so a silent edit must fail a test.
    expect(SUSPENDED_GRACE_DAYS).toBe(30);
  });

  it('warns before the deadline, not after it', () => {
    expect(SUSPEND_WARN_BEFORE_DAYS).toBeGreaterThan(0);
    expect(SUSPEND_WARN_BEFORE_DAYS).toBeLessThan(SUSPENDED_GRACE_DAYS);
  });
});

describe('suspendedDeadline', () => {
  it('is the suspension instant plus the grace window', () => {
    expect(suspendedDeadline(new Date('2026-07-01T00:00:00.000Z'))?.toISOString()).toBe(
      '2026-07-31T00:00:00.000Z'
    );
  });

  it('accepts an ISO string as well as a Date', () => {
    expect(suspendedDeadline('2026-07-01T00:00:00.000Z')?.toISOString()).toBe(
      '2026-07-31T00:00:00.000Z'
    );
  });

  it('is null without a stamp, and null for garbage (never "now")', () => {
    expect(suspendedDeadline(null)).toBeNull();
    expect(suspendedDeadline(undefined)).toBeNull();
    expect(suspendedDeadline('not a date')).toBeNull();
  });

  it('refuses a negative/garbage grace, falling back to the default instead of pulling a deletion forward', () => {
    const at = new Date('2026-07-01T00:00:00.000Z');
    expect(suspendedDeadline(at, -5)?.toISOString()).toBe('2026-07-31T00:00:00.000Z');
    expect(suspendedDeadline(at, Number.NaN)?.toISOString()).toBe('2026-07-31T00:00:00.000Z');
  });
});

describe('daysUntilSuspendedPurge', () => {
  it('counts down whole days, rounding UP so a partial day is never reported as 0', () => {
    expect(daysUntilSuspendedPurge(suspendedDaysAgo(0), NOW)).toBe(30);
    expect(daysUntilSuspendedPurge(suspendedDaysAgo(23), NOW)).toBe(7);
    expect(daysUntilSuspendedPurge(suspendedDaysAgo(29.5), NOW)).toBe(1);
  });

  it('clamps at 0 once the deadline has passed', () => {
    expect(daysUntilSuspendedPurge(suspendedDaysAgo(30), NOW)).toBe(0);
    expect(daysUntilSuspendedPurge(suspendedDaysAgo(90), NOW)).toBe(0);
  });

  it('is null without a stamp', () => {
    expect(daysUntilSuspendedPurge(null, NOW)).toBeNull();
  });
});

describe('isSuspendedPurgeDue', () => {
  it('is due exactly at the deadline and after it', () => {
    expect(isSuspendedPurgeDue({ status: 'suspended', suspendedAt: suspendedDaysAgo(30) }, NOW)).toBe(true);
    expect(isSuspendedPurgeDue({ status: 'suspended', suspendedAt: suspendedDaysAgo(45) }, NOW)).toBe(true);
  });

  it('is not due one day early', () => {
    expect(isSuspendedPurgeDue({ status: 'suspended', suspendedAt: suspendedDaysAgo(29) }, NOW)).toBe(false);
  });

  it('is never due for a workspace that is not suspended, however old the stamp', () => {
    for (const status of ['active', 'trialing', 'pending', 'canceled']) {
      expect(isSuspendedPurgeDue({ status, suspendedAt: suspendedDaysAgo(400) }, NOW)).toBe(false);
    }
  });

  it('is never due without a clock — an un-stamped workspace gets backfilled, not deleted', () => {
    expect(isSuspendedPurgeDue({ status: 'suspended', suspendedAt: null }, NOW)).toBe(false);
    expect(isSuspendedPurgeDue({ status: 'suspended', suspendedAt: 'garbage' }, NOW)).toBe(false);
  });

  it('keeps its hands off a workspace that already has an erasure scheduled', () => {
    // An owner-requested erasure owns its own schedule; overwriting it could move a deletion.
    expect(
      isSuspendedPurgeDue(
        { status: 'suspended', suspendedAt: suspendedDaysAgo(60), erasureScheduledAt: new Date('2026-09-01') },
        NOW
      )
    ).toBe(false);
  });

  it('tolerates a status stored with stray case/whitespace', () => {
    expect(isSuspendedPurgeDue({ status: ' Suspended ', suspendedAt: suspendedDaysAgo(31) }, NOW)).toBe(true);
  });
});

describe('shouldWarnSuspended', () => {
  it('warns inside the window', () => {
    expect(shouldWarnSuspended({ status: 'suspended', suspendedAt: suspendedDaysAgo(25) }, NOW)).toBe(true);
  });

  it('warns at the exact edge of the window (7 days out)', () => {
    const at = suspendedDaysAgo(SUSPENDED_GRACE_DAYS - SUSPEND_WARN_BEFORE_DAYS);
    expect(shouldWarnSuspended({ status: 'suspended', suspendedAt: at }, NOW)).toBe(true);
  });

  it('does not warn while the deadline is still further out', () => {
    expect(shouldWarnSuspended({ status: 'suspended', suspendedAt: suspendedDaysAgo(22) }, NOW)).toBe(false);
    expect(shouldWarnSuspended({ status: 'suspended', suspendedAt: suspendedDaysAgo(1) }, NOW)).toBe(false);
  });

  it('does not warn once the deadline has passed — that path schedules instead', () => {
    expect(shouldWarnSuspended({ status: 'suspended', suspendedAt: suspendedDaysAgo(30) }, NOW)).toBe(false);
    expect(shouldWarnSuspended({ status: 'suspended', suspendedAt: suspendedDaysAgo(31) }, NOW)).toBe(false);
  });

  it('never warns and schedules the same workspace in one run', () => {
    for (let d = 0; d <= 60; d += 1) {
      const input = { status: 'suspended', suspendedAt: suspendedDaysAgo(d) };
      expect(shouldWarnSuspended(input, NOW) && isSuspendedPurgeDue(input, NOW)).toBe(false);
    }
  });

  it('does not warn a non-suspended workspace, an un-stamped one, or one already erasing', () => {
    expect(shouldWarnSuspended({ status: 'active', suspendedAt: suspendedDaysAgo(25) }, NOW)).toBe(false);
    expect(shouldWarnSuspended({ status: 'suspended', suspendedAt: null }, NOW)).toBe(false);
    expect(
      shouldWarnSuspended(
        { status: 'suspended', suspendedAt: suspendedDaysAgo(25), erasureScheduledAt: new Date('2026-09-01') },
        NOW
      )
    ).toBe(false);
  });
});

describe('batch planners', () => {
  it('return only the qualifying ids and skip rows with a blank id', () => {
    const rows = [
      { id: 'warn-me', status: 'suspended', suspendedAt: suspendedDaysAgo(26) },
      { id: 'delete-me', status: 'suspended', suspendedAt: suspendedDaysAgo(31) },
      { id: 'too-early', status: 'suspended', suspendedAt: suspendedDaysAgo(3) },
      { id: '', status: 'suspended', suspendedAt: suspendedDaysAgo(31) },
    ];
    expect(planSuspendedWarnings(rows, NOW)).toEqual(['warn-me']);
    expect(planSuspendedPurges(rows, NOW)).toEqual(['delete-me']);
  });

  it('tolerate a non-array without throwing', () => {
    expect(planSuspendedWarnings(undefined as never, NOW)).toEqual([]);
    expect(planSuspendedPurges(null as never, NOW)).toEqual([]);
  });
});

describe('the Mongo filters agree with the pure predicates', () => {
  // The filters are what actually selects rows in production, so drift between them and the
  // predicates would mean warning/deleting the wrong workspaces. These lock the boundaries.
  const warn = suspendedWarningFilter(NOW) as {
    status: string;
    suspendWarnEmailedAt: null;
    erasureScheduledAt: null;
    suspendedAt: { $ne: null; $gt: Date; $lte: Date };
  };
  const due = suspendedPurgeFilter(NOW) as {
    status: string;
    erasureScheduledAt: null;
    suspendedAt: { $ne: null; $lte: Date };
  };

  it('the warn filter demands suspended + un-warned + no pending erasure', () => {
    expect(warn.status).toBe('suspended');
    expect(warn.suspendWarnEmailedAt).toBeNull();
    expect(warn.erasureScheduledAt).toBeNull();
  });

  it('the warn window spans exactly the warn days, ending where the deadline begins', () => {
    expect(warn.suspendedAt.$gt.toISOString()).toBe(suspendedDaysAgo(SUSPENDED_GRACE_DAYS).toISOString());
    expect(warn.suspendedAt.$lte.toISOString()).toBe(
      suspendedDaysAgo(SUSPENDED_GRACE_DAYS - SUSPEND_WARN_BEFORE_DAYS).toISOString()
    );
  });

  it('the due filter starts exactly where the warn window ends — no gap, no overlap', () => {
    expect(due.status).toBe('suspended');
    expect(due.erasureScheduledAt).toBeNull();
    expect(due.suspendedAt.$lte.toISOString()).toBe(warn.suspendedAt.$gt.toISOString());
  });

  it('both filters exclude a null stamp, so the backfill always runs first', () => {
    expect(warn.suspendedAt.$ne).toBeNull();
    expect(due.suspendedAt.$ne).toBeNull();
  });

  it('the backfill filter selects exactly the suspended rows with no clock', () => {
    expect(unstampedSuspendedFilter()).toEqual({ status: 'suspended', suspendedAt: null });
  });
});

describe('suspendedWarningEmail', () => {
  it('names the workspace and the deadline, and offers both exits', () => {
    const { subject, html } = suspendedWarningEmail('Acme', 5);
    expect(subject).toBe('Acme will be deleted in 5 days');
    expect(html).toContain('Acme');
    expect(html).toContain('Reactivate');
    expect(html).toContain('export');
  });

  it('says "tomorrow" rather than "in 1 days"', () => {
    expect(suspendedWarningEmail('Acme', 1).subject).toBe('Acme will be deleted tomorrow');
  });

  it('clamps a garbage day count instead of printing "-3 days"', () => {
    expect(suspendedWarningEmail('Acme', -3).subject).toBe('Acme will be deleted tomorrow');
    expect(suspendedWarningEmail('Acme', 900).subject).toBe(
      `Acme will be deleted in ${SUSPEND_WARN_BEFORE_DAYS} days`
    );
    expect(suspendedWarningEmail('Acme', Number.NaN).subject).toContain('will be deleted');
  });

  it('falls back to a generic name rather than emailing "  will be deleted"', () => {
    expect(suspendedWarningEmail('   ', 3).subject).toBe('your Pharos workspace will be deleted in 3 days');
  });

  it('states the same window the site promises', () => {
    expect(suspendedWarningEmail('Acme', 3).html).toContain(String(SUSPENDED_GRACE_DAYS));
  });
});

describe('planSuspendedErasure', () => {
  const plan = planSuspendedErasure(NOW);

  it('schedules the erasure for NOW — the 30 days WERE the grace, not a prelude to another 30', () => {
    expect(plan.$set.erasureRequestedAt.toISOString()).toBe(NOW.toISOString());
    expect(plan.$set.erasureScheduledAt.toISOString()).toBe(NOW.toISOString());
  });

  it('attributes the request to the system, never to the owner who did not ask for it', () => {
    expect(plan.$set.erasureRequestedBy).toBe(SUSPENSION_ERASURE_ACTOR);
    expect(SUSPENSION_ERASURE_ACTOR.startsWith('system:')).toBe(true);
  });

  it('touches only the three erasure markers — never `status`, never anything else', () => {
    expect(Object.keys(plan)).toEqual(['$set']);
    expect(Object.keys(plan.$set).sort()).toEqual([
      'erasureRequestedAt',
      'erasureRequestedBy',
      'erasureScheduledAt',
    ]);
  });
});

describe('isStaleSuspension — the second line of defence', () => {
  // planStatusChange now clears the stamp on every exit from `suspended`, so this should never
  // fire. It exists because the write path can be bypassed by the next status writer someone adds,
  // whereas the audit trail records what actually happened, and the failure mode here is deleting
  // a live workspace.
  it('flags a stamp that predates a reactivation', () => {
    expect(isStaleSuspension(suspendedDaysAgo(200), suspendedDaysAgo(150))).toBe(true);
  });

  it('accepts a stamp made after the last reactivation', () => {
    expect(isStaleSuspension(suspendedDaysAgo(5), suspendedDaysAgo(150))).toBe(false);
  });

  it('is not fooled by a missing side, or by garbage', () => {
    expect(isStaleSuspension(suspendedDaysAgo(200), null)).toBe(false);
    expect(isStaleSuspension(null, suspendedDaysAgo(1))).toBe(false);
    expect(isStaleSuspension('nonsense', suspendedDaysAgo(1))).toBe(false);
  });

  it('treats an exactly-simultaneous pair as not stale (strictly after, not at)', () => {
    const t = suspendedDaysAgo(10);
    expect(isStaleSuspension(t, t)).toBe(false);
  });
});
