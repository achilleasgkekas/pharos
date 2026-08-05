import { describe, it, expect } from 'vitest';
import { statusAuditAction, planStatusChange, CANCEL_ERASURE_ACTOR } from './statusAudit';

// Pure module: no DB, no env. Just the transition → audit-action mapping.

describe('statusAuditAction', () => {
  it('audits any transition into suspended as workspace.suspended', () => {
    expect(statusAuditAction('active', 'suspended')).toBe('workspace.suspended');
    expect(statusAuditAction('trialing', 'suspended')).toBe('workspace.suspended');
    expect(statusAuditAction('pending', 'suspended')).toBe('workspace.suspended');
  });

  it('audits any transition into canceled as workspace.canceled', () => {
    expect(statusAuditAction('active', 'canceled')).toBe('workspace.canceled');
    expect(statusAuditAction('suspended', 'canceled')).toBe('workspace.canceled');
  });

  it('audits recovery from a blocked state as workspace.reactivated', () => {
    expect(statusAuditAction('suspended', 'active')).toBe('workspace.reactivated');
    expect(statusAuditAction('canceled', 'active')).toBe('workspace.reactivated');
    expect(statusAuditAction('suspended', 'trialing')).toBe('workspace.reactivated');
    expect(statusAuditAction('canceled', 'trialing')).toBe('workspace.reactivated');
  });

  it('does NOT audit an initial go-live (pending/trialing → active)', () => {
    expect(statusAuditAction('pending', 'active')).toBeNull();
    expect(statusAuditAction('trialing', 'active')).toBeNull();
  });

  it('does NOT audit benign trialing↔active flips', () => {
    expect(statusAuditAction('active', 'trialing')).toBeNull();
  });

  it('returns null for a no-op change (prev === next, case/space-insensitive)', () => {
    expect(statusAuditAction('active', 'active')).toBeNull();
    expect(statusAuditAction('suspended', 'suspended')).toBeNull();
    expect(statusAuditAction(' Active ', 'active')).toBeNull();
  });

  it('is case- and whitespace-insensitive on both sides', () => {
    expect(statusAuditAction('ACTIVE', ' Suspended ')).toBe('workspace.suspended');
    expect(statusAuditAction(' Canceled ', 'ACTIVE')).toBe('workspace.reactivated');
  });

  it('fails closed on unknown/blank/non-string next status', () => {
    expect(statusAuditAction('active', '')).toBeNull();
    expect(statusAuditAction('active', 'gibberish')).toBeNull();
    expect(statusAuditAction('active', null)).toBeNull();
    expect(statusAuditAction('active', 123)).toBeNull();
    expect(statusAuditAction(null, undefined)).toBeNull();
  });
});

// planStatusChange is the seam every status writer goes through (Stripe webhook, owner
// cancel/reactivate, superadmin patch, trial sweep). These lock the side effects that used to be
// each caller's job to remember, and that two of them forgot.

const NOW = new Date('2026-08-05T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('planStatusChange — the suspension clock', () => {
  it('starts the clock on entering suspended, and clears any earlier warning stamp', () => {
    // The cleared stamp is what lets a workspace suspended a SECOND time be warned again instead
    // of inheriting the first suspension's "already warned" and being deleted in silence.
    expect(planStatusChange({ prev: 'active', next: 'suspended' }, NOW)).toEqual({
      status: 'suspended',
      suspendedAt: NOW,
      suspendWarnEmailedAt: null,
    });
  });

  it('STOPS the clock on leaving suspended — the bug that made a re-suspension due immediately', () => {
    // Before this, nothing cleared suspendedAt on reactivation: a workspace suspended in January,
    // recovered in January and suspended again in June measured its 30 days from JANUARY, so it
    // was scheduled for deletion the same day, with no warning email.
    expect(planStatusChange({ prev: 'suspended', next: 'active' }, NOW)).toEqual({
      status: 'active',
      suspendedAt: null,
      suspendWarnEmailedAt: null,
    });
  });

  it('leaves the clock alone on transitions that touch neither end of it', () => {
    expect(planStatusChange({ prev: 'trialing', next: 'active' }, NOW)).toEqual({ status: 'active' });
  });
});

describe('planStatusChange — the deletion a cancel implies', () => {
  it('schedules an erasure 30 days out, attributed to the system', () => {
    const f = planStatusChange({ prev: 'active', next: 'canceled' }, NOW);
    expect(f.status).toBe('canceled');
    expect(f.erasureRequestedAt).toEqual(NOW);
    expect((f.erasureScheduledAt as Date).getTime()).toBe(NOW.getTime() + 30 * DAY);
    expect(f.erasureRequestedBy).toBe(CANCEL_ERASURE_ACTOR);
  });

  it('never pushes back an erasure the owner already requested', () => {
    // Their request may well be sooner; overwriting it would delay a deletion someone asked for.
    const f = planStatusChange(
      {
        prev: 'active',
        next: 'canceled',
        erasureScheduledAt: new Date('2026-08-10T00:00:00.000Z'),
        erasureRequestedBy: 'acc1',
      },
      NOW
    );
    expect(f).toEqual({ status: 'canceled' });
  });

  it('calls the cancel-implied erasure off when the workspace is reactivated', () => {
    const f = planStatusChange(
      { prev: 'canceled', next: 'active', erasureScheduledAt: new Date('2026-09-04'), erasureRequestedBy: CANCEL_ERASURE_ACTOR },
      NOW
    );
    expect(f).toEqual({
      status: 'active',
      erasureRequestedAt: null,
      erasureScheduledAt: null,
      erasureRequestedBy: null,
    });
  });

  it('leaves an OWNER-requested erasure standing through a reactivation', () => {
    // Erasure is documented as orthogonal to status: reactivating is not "I changed my mind about
    // deleting my data", so only the deletion that came WITH the cancel is undone by reversing it.
    const f = planStatusChange(
      { prev: 'canceled', next: 'active', erasureScheduledAt: new Date('2026-09-04'), erasureRequestedBy: 'acc1' },
      NOW
    );
    expect(f).toEqual({ status: 'active' });
  });
});

describe('planStatusChange — no-ops', () => {
  it('returns {} for an unchanged status, so a caller can skip the write entirely', () => {
    expect(planStatusChange({ prev: 'active', next: 'active' }, NOW)).toEqual({});
    expect(planStatusChange({ prev: 'suspended', next: 'suspended' }, NOW)).toEqual({});
  });

  it('fails closed on a blank/garbage next status rather than writing one', () => {
    expect(planStatusChange({ prev: 'active', next: '' }, NOW)).toEqual({});
    expect(planStatusChange({ prev: 'active', next: null }, NOW)).toEqual({});
    expect(planStatusChange({ prev: 'active', next: 42 }, NOW)).toEqual({});
  });

  it('normalizes case/whitespace the way the Tenant enum stores it', () => {
    expect(planStatusChange({ prev: 'Active ', next: ' SUSPENDED' }, NOW).status).toBe('suspended');
    expect(planStatusChange({ prev: ' active', next: 'ACTIVE ' }, NOW)).toEqual({});
  });

  it('ignores a garbage erasure schedule instead of treating it as pending', () => {
    const f = planStatusChange({ prev: 'active', next: 'canceled', erasureScheduledAt: 'not a date' }, NOW);
    expect(f.erasureRequestedBy).toBe(CANCEL_ERASURE_ACTOR);
  });
});
