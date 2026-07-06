import { describe, it, expect } from 'vitest';
import {
  ERASURE_GRACE_DAYS,
  canEraseWorkspace,
  erasureScheduledFor,
  isErasureRequested,
  graceDaysLeft,
  isErasureDue,
  planErasureRequest,
  planErasureCancel,
  erasureDueFilter,
  erasureView,
} from './erasure';

// Only the PURE lifecycle helpers are unit-tested. The route is SaaS-gated (404 when SAAS_MODE
// off) and does node-only DB writes; its owner-only gating + idempotency reuse these helpers.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-06T12:00:00.000Z');

describe('canEraseWorkspace', () => {
  it('is owner-only', () => {
    expect(canEraseWorkspace('owner')).toBe(true);
    expect(canEraseWorkspace('admin')).toBe(false);
    expect(canEraseWorkspace('member')).toBe(false);
    expect(canEraseWorkspace('')).toBe(false);
    expect(canEraseWorkspace(undefined)).toBe(false);
  });
});

describe('erasureScheduledFor', () => {
  it('adds the default grace window', () => {
    const due = erasureScheduledFor(NOW);
    expect(due.getTime()).toBe(NOW.getTime() + ERASURE_GRACE_DAYS * MS_PER_DAY);
  });
  it('honors a custom grace and rejects garbage/negative (falls back to default)', () => {
    expect(erasureScheduledFor(NOW, 7).getTime()).toBe(NOW.getTime() + 7 * MS_PER_DAY);
    expect(erasureScheduledFor(NOW, -5).getTime()).toBe(NOW.getTime() + ERASURE_GRACE_DAYS * MS_PER_DAY);
    expect(erasureScheduledFor(NOW, NaN).getTime()).toBe(NOW.getTime() + ERASURE_GRACE_DAYS * MS_PER_DAY);
    expect(erasureScheduledFor(NOW, 0).getTime()).toBe(NOW.getTime()); // 0 is valid (immediate)
  });
});

describe('isErasureRequested', () => {
  it('true only for a present valid date', () => {
    expect(isErasureRequested(NOW)).toBe(true);
    expect(isErasureRequested('2026-07-06T12:00:00.000Z')).toBe(true);
    expect(isErasureRequested(null)).toBe(false);
    expect(isErasureRequested(undefined)).toBe(false);
    expect(isErasureRequested('not-a-date')).toBe(false);
  });
});

describe('graceDaysLeft', () => {
  it('rounds up and clamps at 0; null when no schedule', () => {
    const in10 = new Date(NOW.getTime() + 10 * MS_PER_DAY);
    expect(graceDaysLeft(in10, NOW)).toBe(10);
    // partial day still counts as a whole day left (ceil)
    const in10AndHalf = new Date(NOW.getTime() + 10 * MS_PER_DAY + MS_PER_DAY / 2);
    expect(graceDaysLeft(in10AndHalf, NOW)).toBe(11);
    // due now / past → 0, never negative
    expect(graceDaysLeft(NOW, NOW)).toBe(0);
    expect(graceDaysLeft(new Date(NOW.getTime() - 5 * MS_PER_DAY), NOW)).toBe(0);
    // no schedule / invalid → null
    expect(graceDaysLeft(null, NOW)).toBeNull();
    expect(graceDaysLeft('garbage', NOW)).toBeNull();
  });
});

describe('isErasureDue', () => {
  it('true only once the schedule is at/before now', () => {
    expect(isErasureDue(new Date(NOW.getTime() - 1), NOW)).toBe(true);
    expect(isErasureDue(NOW, NOW)).toBe(true); // boundary = due
    expect(isErasureDue(new Date(NOW.getTime() + 1), NOW)).toBe(false);
    expect(isErasureDue(null, NOW)).toBe(false);
    expect(isErasureDue('garbage', NOW)).toBe(false);
  });
});

describe('planErasureRequest', () => {
  it('stamps the three markers, does NOT touch status', () => {
    const upd = planErasureRequest('acc123', NOW, 30);
    expect(upd).not.toBeNull();
    expect(upd!.$set.erasureRequestedAt).toBe(NOW);
    expect(upd!.$set.erasureScheduledAt.getTime()).toBe(NOW.getTime() + 30 * MS_PER_DAY);
    expect(upd!.$set.erasureRequestedBy).toBe('acc123');
    expect('status' in upd!.$set).toBe(false); // orthogonal to access lifecycle
  });
  it('trims the account id', () => {
    expect(planErasureRequest('  acc9  ', NOW)!.$set.erasureRequestedBy).toBe('acc9');
  });
  it('returns null for a blank/non-string account id (must be attributable)', () => {
    expect(planErasureRequest('', NOW)).toBeNull();
    expect(planErasureRequest('   ', NOW)).toBeNull();
    // @ts-expect-error defensive: non-string
    expect(planErasureRequest(null, NOW)).toBeNull();
  });
});

describe('planErasureCancel', () => {
  it('nulls all three markers, leaves status untouched', () => {
    const upd = planErasureCancel();
    expect(upd.$set).toEqual({
      erasureRequestedAt: null,
      erasureScheduledAt: null,
      erasureRequestedBy: null,
    });
    expect('status' in upd.$set).toBe(false);
  });
});

describe('erasureDueFilter', () => {
  it('matches only set schedules at/before now', () => {
    expect(erasureDueFilter(NOW)).toEqual({ erasureScheduledAt: { $ne: null, $lte: NOW } });
  });
});

describe('erasureView', () => {
  it('projects the whitelisted markers with computed grace/due', () => {
    const scheduled = new Date(NOW.getTime() + 12 * MS_PER_DAY);
    const view = erasureView(
      { erasureRequestedAt: NOW, erasureScheduledAt: scheduled, erasureRequestedBy: 'acc123' },
      NOW
    );
    expect(view).toEqual({
      requested: true,
      requestedAt: NOW.toISOString(),
      scheduledAt: scheduled.toISOString(),
      requestedBy: 'acc123',
      graceDaysLeft: 12,
      due: false,
    });
  });
  it('empty (no pending erasure) view', () => {
    const view = erasureView({}, NOW);
    expect(view).toEqual({
      requested: false,
      requestedAt: null,
      scheduledAt: null,
      requestedBy: null,
      graceDaysLeft: null,
      due: false,
    });
  });
  it('flags due once the schedule has passed', () => {
    const past = new Date(NOW.getTime() - MS_PER_DAY);
    const view = erasureView({ erasureRequestedAt: past, erasureScheduledAt: past }, NOW);
    expect(view.due).toBe(true);
    expect(view.graceDaysLeft).toBe(0);
  });
});
