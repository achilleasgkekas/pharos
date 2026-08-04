import { describe, it, expect } from 'vitest';
import { detectSyncStaleness, formatSyncStaleness } from './syncStaleness';

// The "has the off-site copy fallen behind?" check (P48). It is the only alert in the
// sweep about the BACKUP rather than about money, and it fires on an absence of events,
// which makes both directions dangerous: too eager and the user learns to ignore it,
// too quiet and the mirror rots invisibly. Every case below pins one of those edges.

const DAY = 86400000;
const NOW = Date.UTC(2026, 7, 4, 12, 0, 0); // 2026-08-04T12:00:00Z
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();

const base = { backend: 'onedrive', thresholdDays: 7, now: NOW };

describe('detectSyncStaleness — when it stays silent', () => {
  it('never fires for the local backend, however long ago that timestamp is', () => {
    // Nothing is meant to be mirrored anywhere, so there is nothing to be behind.
    expect(detectSyncStaleness({ ...base, backend: 'local', lastSyncAt: daysAgo(900) })).toBeNull();
    expect(detectSyncStaleness({ ...base, backend: 'local', lastSyncAt: null })).toBeNull();
  });

  it('never fires with an empty backend string (unconfigured)', () => {
    expect(detectSyncStaleness({ ...base, backend: '', lastSyncAt: null })).toBeNull();
  });

  it('is switched off by a threshold of 0 or less', () => {
    for (const thresholdDays of [0, -1]) {
      expect(detectSyncStaleness({ ...base, thresholdDays, lastSyncAt: daysAgo(400) })).toBeNull();
      expect(detectSyncStaleness({ ...base, thresholdDays, lastSyncAt: null })).toBeNull();
    }
  });

  it('stays quiet right up to the threshold, and fires exactly on it', () => {
    expect(detectSyncStaleness({ ...base, lastSyncAt: daysAgo(6) })).toBeNull();
    // 6 days and 23 hours is still day 6 — a partial day must not round up into an alert.
    expect(detectSyncStaleness({ ...base, lastSyncAt: new Date(NOW - 7 * DAY + 3600000).toISOString() })).toBeNull();
    expect(detectSyncStaleness({ ...base, lastSyncAt: daysAgo(7) })?.days).toBe(7);
  });

  it('treats a future timestamp as freshly synced rather than as negative age', () => {
    // Clock skew, or a database restored from a machine whose clock ran ahead. Reporting
    // "-3 days" or firing an alert there would be noise about nothing.
    expect(detectSyncStaleness({ ...base, lastSyncAt: new Date(NOW + 3 * DAY).toISOString() })).toBeNull();
  });

  it('ignores an unparseable timestamp by treating it as "never synced", not as fresh', () => {
    // Failing open here would hide a broken mirror behind a corrupt field.
    const r = detectSyncStaleness({ ...base, lastSyncAt: 'not-a-date' });
    expect(r).not.toBeNull();
    expect(r?.days).toBeNull();
  });
});

describe('detectSyncStaleness — when it fires', () => {
  it('fires for a remote backend that has NEVER synced, with days = null', () => {
    // The most valuable case: a mirror configured once, tested, never actually used
    // looks identical to a working one everywhere else in the UI.
    for (const lastSyncAt of [null, undefined, '']) {
      const r = detectSyncStaleness({ ...base, lastSyncAt });
      expect(r).toEqual({ days: null, backend: 'onedrive', lastSyncAt: null, thresholdDays: 7 });
    }
  });

  it('reports whole days elapsed and echoes the backend and threshold', () => {
    expect(detectSyncStaleness({ ...base, backend: 'smb', lastSyncAt: daysAgo(31) })).toEqual({
      days: 31,
      backend: 'smb',
      lastSyncAt: daysAgo(31),
      thresholdDays: 7,
    });
  });

  it('accepts a Date as well as an ISO string', () => {
    expect(detectSyncStaleness({ ...base, lastSyncAt: new Date(NOW - 10 * DAY) })?.days).toBe(10);
  });

  it('fires regardless of the auto-mirror toggle, by design', () => {
    // Deliberate deviation from the original spec, which proposed gating on the toggle.
    // Auto-mirror OFF means every push is a manual click, which is exactly the user who
    // can forget — gating would switch the warning off for the only people who need it.
    // The helper does not even accept the flag; this test exists to pin that choice so a
    // future "fix" to match the spec has to argue with it first.
    expect(detectSyncStaleness({ ...base, lastSyncAt: daysAgo(20) })?.days).toBe(20);
    expect('mirror' in base).toBe(false);
  });

  it('honours a threshold the user widened or narrowed', () => {
    expect(detectSyncStaleness({ ...base, thresholdDays: 30, lastSyncAt: daysAgo(20) })).toBeNull();
    expect(detectSyncStaleness({ ...base, thresholdDays: 1, lastSyncAt: daysAgo(2) })?.days).toBe(2);
  });
});

describe('formatSyncStaleness', () => {
  it('names the backend and says plainly when a sync never happened', () => {
    expect(formatSyncStaleness({ days: null, backend: 'onedrive', lastSyncAt: null, thresholdDays: 7 })).toBe(
      'Remote backup (onedrive) has never completed a sync'
    );
  });

  it('pluralises days correctly', () => {
    expect(formatSyncStaleness({ days: 1, backend: 'smb', lastSyncAt: daysAgo(1), thresholdDays: 1 })).toBe(
      'Remote backup (smb) last synced 1 day ago'
    );
    expect(formatSyncStaleness({ days: 14, backend: 'ftp', lastSyncAt: daysAgo(14), thresholdDays: 7 })).toBe(
      'Remote backup (ftp) last synced 14 days ago'
    );
  });
});
