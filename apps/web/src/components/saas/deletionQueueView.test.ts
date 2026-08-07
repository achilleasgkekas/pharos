import { describe, it, expect } from 'vitest';
import {
  classifyDeletion,
  classifySuspension,
  deletionQueueView,
  refusalReason,
  type DeletionCandidate,
  type SuspensionCandidate,
} from './deletionQueueView';
import { SUSPENSION_ERASURE_ACTOR } from '@/lib/tenancy/suspendedSweep';

const NOW = new Date('2026-08-07T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function at(offsetDays: number): string {
  return new Date(NOW.getTime() + offsetDays * DAY).toISOString();
}

function candidate(over: Partial<DeletionCandidate> = {}): DeletionCandidate {
  return {
    id: 'a1',
    slug: 'acme',
    name: 'Acme',
    plan: 'shared',
    status: 'active',
    dbName: 'tenant_acme',
    erasureRequestedAt: at(-5),
    erasureScheduledAt: at(25),
    erasureRequestedBy: 'acct1',
    ...over,
  };
}

function suspension(over: Partial<SuspensionCandidate> = {}): SuspensionCandidate {
  return {
    id: 's1',
    slug: 'beta',
    name: 'Beta',
    plan: 'free',
    suspendedAt: at(-10),
    suspendWarnEmailedAt: null,
    ...over,
  };
}

describe('classifyDeletion', () => {
  it('stages a future deadline as scheduled, with days left', () => {
    const e = classifyDeletion(candidate({ erasureScheduledAt: at(3) }), NOW)!;
    expect(e.stage).toBe('scheduled');
    expect(e.daysLeft).toBe(3);
    expect(e.daysOverdue).toBeNull();
  });

  it('stages a passed deadline as due, with whole days overdue', () => {
    const e = classifyDeletion(candidate({ erasureScheduledAt: at(-2.5) }), NOW)!;
    expect(e.stage).toBe('due');
    expect(e.daysOverdue).toBe(2);
    expect(e.daysLeft).toBeNull();
  });

  it('a deadline that just passed reads as 0 days overdue, not as scheduled', () => {
    const e = classifyDeletion(candidate({ erasureScheduledAt: at(-0.001) }), NOW)!;
    expect(e.stage).toBe('due');
    expect(e.daysOverdue).toBe(0);
  });

  // The whole point of the 'refused' bucket: the executor's own safety check would reject these,
  // so listing them as ordinary "due" rows would promise a deletion that never happens.
  it('stages a due row the purge would refuse as refused, never as due', () => {
    const e = classifyDeletion(
      candidate({ erasureScheduledAt: at(-1), dbName: 'tenant_other', slug: 'acme' }),
      NOW
    )!;
    expect(e.stage).toBe('refused');
    expect(e.refusedReason).toContain('expected tenant_acme');
    expect(e.refusedReason).toContain('found tenant_other');
  });

  it('refuses a due row with no database name at all', () => {
    const e = classifyDeletion(candidate({ erasureScheduledAt: at(-1), dbName: null }), NOW)!;
    expect(e.stage).toBe('refused');
    expect(e.refusedReason).toContain('no database name');
  });

  it('does not pre-emptively refuse a row whose deadline has not arrived', () => {
    // A bad dbName on a future-dated row is still a problem, but it is not blocking anything yet
    // and the owner may cancel. Only the due bucket makes the safety claim.
    const e = classifyDeletion(candidate({ erasureScheduledAt: at(5), dbName: 'wrong' }), NOW)!;
    expect(e.stage).toBe('scheduled');
    expect(e.refusedReason).toBeNull();
  });

  it('names the reason for a system-initiated erasure instead of attributing it to a person', () => {
    const e = classifyDeletion(
      candidate({ erasureRequestedBy: SUSPENSION_ERASURE_ACTOR }),
      NOW
    )!;
    expect(e.systemInitiated).toBe(true);
    expect(e.requestedBy).toBeNull();
  });

  it('keeps a human requester visible', () => {
    const e = classifyDeletion(candidate({ erasureRequestedBy: 'acct9' }), NOW)!;
    expect(e.systemInitiated).toBe(false);
    expect(e.requestedBy).toBe('acct9');
  });

  it('returns null for rows with no valid schedule — they are not in the pipeline', () => {
    expect(classifyDeletion(candidate({ erasureScheduledAt: null }), NOW)).toBeNull();
    expect(classifyDeletion(candidate({ erasureScheduledAt: 'not-a-date' }), NOW)).toBeNull();
    expect(classifyDeletion(candidate({ id: '  ' }), NOW)).toBeNull();
  });

  it('never renders a nameless row: falls back to slug, then id', () => {
    expect(classifyDeletion(candidate({ name: '   ' }), NOW)!.name).toBe('acme');
    expect(classifyDeletion(candidate({ name: null, slug: null, dbName: null }), NOW)!.name).toBe('a1');
  });
});

describe('classifySuspension', () => {
  it('counts the days left before enrolment', () => {
    const e = classifySuspension(suspension({ suspendedAt: at(-10) }), NOW)!;
    expect(e.daysLeft).toBe(20);
    expect(e.clockUnknown).toBe(false);
  });

  it('marks a missing suspension stamp as clock-not-started, not as due', () => {
    const e = classifySuspension(suspension({ suspendedAt: null }), NOW)!;
    expect(e.clockUnknown).toBe(true);
    expect(e.daysLeft).toBeNull();
  });

  it('reports 0 days left once the keep-window has elapsed', () => {
    expect(classifySuspension(suspension({ suspendedAt: at(-40) }), NOW)!.daysLeft).toBe(0);
  });

  it('reflects whether the warning email has gone out', () => {
    expect(classifySuspension(suspension(), NOW)!.warned).toBe(false);
    expect(classifySuspension(suspension({ suspendWarnEmailedAt: at(-1) }), NOW)!.warned).toBe(true);
  });
});

describe('refusalReason', () => {
  it('says what was expected and what was found', () => {
    expect(refusalReason('tenant_x', 'y')).toBe(
      'the database name does not match this workspace: expected tenant_y, found tenant_x'
    );
  });
  it('handles the missing halves separately', () => {
    expect(refusalReason(null, 'y')).toContain('no database name');
    expect(refusalReason('tenant_y', null)).toContain('no slug');
  });
});

describe('deletionQueueView', () => {
  const opts = { armed: false, maxPerRun: 5, now: NOW };

  it('says "off" and "nothing due" as two separate facts', () => {
    const v = deletionQueueView([], [], opts);
    expect(v.tone).toBe('idle');
    expect(v.headline).toContain('Automatic deletion is off');
    expect(v.headline).toContain('Nothing is past its deadline');
  });

  // The gap this screen was built for: a workspace past its deadline that nothing is deleting.
  it('flags due workspaces that nothing is armed to delete', () => {
    const v = deletionQueueView([candidate({ erasureScheduledAt: at(-3) })], [], opts);
    expect(v.tone).toBe('waiting');
    expect(v.headline).toContain('nothing is deleting them');
    expect(v.nextRunCount).toBe(0);
    expect(v.detail).toContain('SAAS_PURGE_EXECUTE');
  });

  it('when armed, reports how many the next run attempts and how many wait for the cap', () => {
    const due = Array.from({ length: 7 }, (_, i) =>
      candidate({ id: `d${i}`, slug: `w${i}`, dbName: `tenant_w${i}`, erasureScheduledAt: at(-1 - i) })
    );
    const v = deletionQueueView(due, [], { armed: true, maxPerRun: 3, now: NOW });
    expect(v.tone).toBe('armed');
    expect(v.nextRunCount).toBe(3);
    expect(v.deferredCount).toBe(4);
    expect(v.headline).toContain('attempts 3 workspaces');
    expect(v.headline).toContain('4 wait for a later run');
  });

  it('treats a 0 cap as the kill switch it is, even while armed', () => {
    const v = deletionQueueView([candidate({ erasureScheduledAt: at(-1) })], [], {
      armed: true,
      maxPerRun: 0,
      now: NOW,
    });
    expect(v.nextRunCount).toBe(0);
    expect(v.headline).toContain('per-run cap is 0');
    expect(v.detail).toContain('kill switch');
  });

  it('a garbage cap is treated as 0 rather than as unlimited', () => {
    const v = deletionQueueView([candidate({ erasureScheduledAt: at(-1) })], [], {
      armed: true,
      maxPerRun: Number.NaN,
      now: NOW,
    });
    expect(v.maxPerRun).toBe(0);
    expect(v.nextRunCount).toBe(0);
  });

  it('raises the alarm tone whenever a workspace is stuck, armed or not', () => {
    const stuck = [candidate({ erasureScheduledAt: at(-1), dbName: 'mismatch' })];
    expect(deletionQueueView(stuck, [], opts).tone).toBe('alarm');
    expect(deletionQueueView(stuck, [], { ...opts, armed: true }).tone).toBe('alarm');
  });

  it('warns that stuck rows spend a slot in every run', () => {
    const v = deletionQueueView([candidate({ erasureScheduledAt: at(-1), dbName: 'mismatch' })], [], {
      armed: true,
      maxPerRun: 5,
      now: NOW,
    });
    expect(v.starvationWarning).toContain('spends a slot');
  });

  // The executor slices the scan's targets and a refused row IS a target: it is attempted, it
  // fails, and its slot is gone. Enough of them and the queue never drains while looking busy.
  it('warns explicitly when stuck rows can starve the real deletions', () => {
    const rows = [
      candidate({ id: 'r1', slug: 'r1', dbName: 'mismatch1', erasureScheduledAt: at(-9) }),
      candidate({ id: 'r2', slug: 'r2', dbName: 'mismatch2', erasureScheduledAt: at(-8) }),
      candidate({ id: 'd1', slug: 'd1', dbName: 'tenant_d1', erasureScheduledAt: at(-1) }),
    ];
    const v = deletionQueueView(rows, [], { armed: true, maxPerRun: 2, now: NOW });
    expect(v.refused).toHaveLength(2);
    expect(v.due).toHaveLength(1);
    expect(v.starvationWarning).toContain('may never be reached');
    // Both stuck rows are attempted, so the genuine deletion is deferred behind them.
    expect(v.nextRunCount).toBe(2);
    expect(v.deferredCount).toBe(1);
  });

  it('there is no starvation warning when nothing is stuck', () => {
    const v = deletionQueueView([candidate({ erasureScheduledAt: at(-1) })], [], {
      armed: true,
      maxPerRun: 5,
      now: NOW,
    });
    expect(v.starvationWarning).toBeNull();
  });

  it('sorts each bucket worst-first', () => {
    const rows = [
      candidate({ id: 'a', slug: 'a', dbName: 'tenant_a', erasureScheduledAt: at(-1) }),
      candidate({ id: 'b', slug: 'b', dbName: 'tenant_b', erasureScheduledAt: at(-9) }),
      candidate({ id: 'c', slug: 'c', dbName: 'tenant_c', erasureScheduledAt: at(10) }),
      candidate({ id: 'd', slug: 'd', dbName: 'tenant_d', erasureScheduledAt: at(2) }),
    ];
    const v = deletionQueueView(rows, [], opts);
    expect(v.due.map((e) => e.id)).toEqual(['b', 'a']);
    expect(v.scheduled.map((e) => e.id)).toEqual(['d', 'c']);
  });

  it('sorts suspensions by how soon they are enrolled, unstamped ones last', () => {
    const v = deletionQueueView(
      [],
      [
        suspension({ id: 'x', suspendedAt: null }),
        suspension({ id: 'y', suspendedAt: at(-25) }),
        suspension({ id: 'z', suspendedAt: at(-2) }),
      ],
      opts
    );
    expect(v.suspensions.map((e) => e.id)).toEqual(['y', 'z', 'x']);
  });

  it('survives non-array input rather than throwing in a render', () => {
    const v = deletionQueueView(null as never, undefined as never, opts);
    expect(v.due).toEqual([]);
    expect(v.suspensions).toEqual([]);
  });

  it('counts one workspace with singular wording', () => {
    const v = deletionQueueView([candidate({ erasureScheduledAt: at(-1) })], [], opts);
    expect(v.headline).toContain('1 workspace is past the deadline');
  });
});
