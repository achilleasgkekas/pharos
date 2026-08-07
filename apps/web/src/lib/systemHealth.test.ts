import { describe, it, expect } from 'vitest';
import {
  databaseLevel,
  diskLevel,
  aiLevel,
  jobsLevel,
  syncLevel,
  stuckMinutes,
  isStuck,
  overallLevel,
  formatMs,
  DB_PING_WARN_MS,
  DISK_FREE_WARN_BYTES,
  JOB_STUCK_MINUTES,
} from './systemHealth';

// P77 — Settings → System status. What is pinned here is the judgement, not the plumbing:
// which measurement turns a light red, which one is merely amber, and (most importantly)
// which absences stay GREY. A self-hoster who deliberately runs without AI and without a
// remote mirror must still see a clean dashboard; the day "I turned that off" reads as
// "something is broken" is the day the whole page stops being trusted.

describe('databaseLevel', () => {
  it('is down when the connection errored, whatever the timing says', () => {
    expect(databaseLevel({ error: 'ECONNREFUSED', pingMs: 3 })).toBe('down');
  });
  it('is ok for a fast ping and warns past the threshold', () => {
    expect(databaseLevel({ pingMs: 4 })).toBe('ok');
    expect(databaseLevel({ pingMs: DB_PING_WARN_MS })).toBe('ok'); // boundary is inclusive-ok
    expect(databaseLevel({ pingMs: DB_PING_WARN_MS + 1 })).toBe('warn');
  });
  it('is unknown when nothing was measured', () => {
    expect(databaseLevel({})).toBe('unknown');
  });
});

describe('diskLevel', () => {
  const GB = 1024 * 1024 * 1024;
  it('is ok with room to spare', () => {
    expect(diskLevel({ freeBytes: 20 * GB, totalBytes: 100 * GB })).toBe('ok');
  });
  it('warns below the absolute floor even on a huge volume', () => {
    expect(diskLevel({ freeBytes: DISK_FREE_WARN_BYTES - 1, totalBytes: 4000 * GB })).toBe('warn');
  });
  it('warns below the relative floor even with many gigabytes left', () => {
    expect(diskLevel({ freeBytes: 40 * GB, totalBytes: 1000 * GB })).toBe('warn'); // 4%
  });
  it('is unknown when statfs is unavailable, not a failure', () => {
    expect(diskLevel({ freeBytes: null, totalBytes: null })).toBe('unknown');
    expect(diskLevel({})).toBe('unknown');
  });
  it('warns (does not go down) when the volume answered badly — the app still serves', () => {
    expect(diskLevel({ error: 'EACCES' })).toBe('warn');
  });
});

describe('aiLevel', () => {
  it('stays grey when AI is switched off — an intentional state, not a fault', () => {
    expect(aiLevel({ enabled: false, ready: false })).toBe('unknown');
    expect(aiLevel({ enabled: false, ready: true })).toBe('unknown');
  });
  it('warns when AI is on but no provider is reachable/configured', () => {
    expect(aiLevel({ enabled: true, ready: false })).toBe('warn');
  });
  it('is ok when on and ready', () => {
    expect(aiLevel({ enabled: true, ready: true })).toBe('ok');
  });
});

describe('jobsLevel', () => {
  it('is ok with a clean queue', () => {
    expect(jobsLevel({ stuck: 0, failed: 0 })).toBe('ok');
  });
  it('warns on a wedged job and on recent failures', () => {
    expect(jobsLevel({ stuck: 1, failed: 0 })).toBe('warn');
    expect(jobsLevel({ stuck: 0, failed: 2 })).toBe('warn');
  });
});

describe('syncLevel', () => {
  it('stays grey on a local-only deployment', () => {
    expect(syncLevel({ backend: 'local', stale: false })).toBe('unknown');
    expect(syncLevel({ backend: '', stale: false })).toBe('unknown');
  });
  it('is down when the live probe failed', () => {
    expect(syncLevel({ backend: 'smb', reachable: false, stale: false })).toBe('down');
  });
  it('warns when the mirror has fallen behind', () => {
    expect(syncLevel({ backend: 'onedrive', reachable: true, stale: true })).toBe('warn');
  });
  it('is ok when configured and fresh, including when no probe ran', () => {
    expect(syncLevel({ backend: 'ftp', reachable: null, stale: false })).toBe('ok');
  });
});

describe('stuckMinutes / isStuck', () => {
  const now = Date.parse('2026-08-06T12:00:00Z');
  it('measures silence in whole minutes', () => {
    expect(stuckMinutes('2026-08-06T11:30:00Z', now)).toBe(30);
    expect(stuckMinutes(new Date('2026-08-06T11:59:30Z'), now)).toBe(0);
  });
  it('treats a future timestamp (clock skew) as zero, not as negative age', () => {
    expect(stuckMinutes('2026-08-06T13:00:00Z', now)).toBe(0);
  });
  it('treats a missing/garbage timestamp as not stuck', () => {
    expect(stuckMinutes(null, now)).toBe(0);
    expect(stuckMinutes('not a date', now)).toBe(0);
    expect(isStuck(undefined, now)).toBe(false);
  });
  it('flags at the threshold, not before', () => {
    expect(isStuck(now - (JOB_STUCK_MINUTES - 1) * 60000, now)).toBe(false);
    expect(isStuck(now - JOB_STUCK_MINUTES * 60000, now)).toBe(true);
  });
});

describe('overallLevel', () => {
  it('lets the worst light win', () => {
    expect(overallLevel([{ level: 'ok' }, { level: 'warn' }, { level: 'down' }])).toBe('down');
    expect(overallLevel([{ level: 'ok' }, { level: 'warn' }])).toBe('warn');
  });
  it('ignores grey checks — AI off + no mirror still reads as healthy', () => {
    expect(overallLevel([{ level: 'ok' }, { level: 'unknown' }, { level: 'unknown' }])).toBe('ok');
  });
  it('stays grey when nothing at all could be measured', () => {
    expect(overallLevel([{ level: 'unknown' }])).toBe('unknown');
    expect(overallLevel([])).toBe('unknown');
  });
});

describe('formatMs', () => {
  it('renders milliseconds, and seconds once it gets slow', () => {
    expect(formatMs(4)).toBe('4 ms');
    expect(formatMs(999)).toBe('999 ms');
    expect(formatMs(1400)).toBe('1.4 s');
  });
  it('renders an em-dash-free placeholder for a missing measurement', () => {
    expect(formatMs(null)).toBe('—');
    expect(formatMs(-1)).toBe('—');
  });
});
