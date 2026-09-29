import { describe, it, expect } from 'vitest';
import {
  databaseLevel,
  diskLevel,
  aiLevel,
  searchLevel,
  browserLevel,
  scraperLevel,
  jobsLevel,
  syncLevel,
  cronLevel,
  stuckMinutes,
  isStuck,
  overallLevel,
  formatMs,
  redactEndpoint,
  DB_PING_WARN_MS,
  DISK_FREE_WARN_BYTES,
  JOB_STUCK_MINUTES,
  CRON_STALE_HOURS,
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

describe('searchLevel', () => {
  it('is unknown when not configured', () => {
    expect(searchLevel({ configured: false, reachable: false })).toBe('unknown');
  });
  it('is down when unreachable or on connection error', () => {
    expect(searchLevel({ configured: true, reachable: false })).toBe('down');
    expect(searchLevel({ configured: true, reachable: false, error: 'ECONNREFUSED' })).toBe('down');
  });
  it('warns when reachable but functional query fails', () => {
    expect(searchLevel({ configured: true, reachable: true, functional: false })).toBe('warn');
  });
  it('warns on excessive latency', () => {
    expect(searchLevel({ configured: true, reachable: true, functional: true, latencyMs: 3000 })).toBe('warn');
  });
  it('is ok when reachable and working', () => {
    expect(searchLevel({ configured: true, reachable: true, functional: true, latencyMs: 150 })).toBe('ok');
    expect(searchLevel({ configured: true, reachable: true, latencyMs: 200 })).toBe('ok');
  });
});

describe('browserLevel', () => {
  it('is unknown when not configured', () => {
    expect(browserLevel({ configured: false, reachable: false })).toBe('unknown');
  });
  it('is down when unreachable or error', () => {
    expect(browserLevel({ configured: true, reachable: false })).toBe('down');
    expect(browserLevel({ configured: true, reachable: false, error: 'ECONNREFUSED' })).toBe('down');
  });
  it('warns when reachable but session functional check fails', () => {
    expect(browserLevel({ configured: true, reachable: true, functional: false })).toBe('warn');
  });
  it('is ok when reachable and working', () => {
    expect(browserLevel({ configured: true, reachable: true, functional: true, latencyMs: 80 })).toBe('ok');
  });
});

describe('scraperLevel', () => {
  const now = Date.now();
  it('is unknown when scraper is disabled in Settings', () => {
    expect(scraperLevel({ enabled: false, now })).toBe('unknown');
  });
  it('is unknown when no activity was ever recorded', () => {
    expect(scraperLevel({ enabled: true, lastRunAt: null, heartbeatAt: null, now })).toBe('unknown');
  });
  it('warns when last pass failed with an error', () => {
    expect(scraperLevel({ enabled: true, lastRunAt: new Date(now - 1000).toISOString(), lastError: 'API timeout', now })).toBe('warn');
  });
  it('warns when last activity is stale past CRON_STALE_HOURS', () => {
    const staleDate = new Date(now - (CRON_STALE_HOURS + 1) * 3600 * 1000).toISOString();
    expect(scraperLevel({ enabled: true, lastRunAt: staleDate, now })).toBe('warn');
  });
  it('is ok when recent pass completed without errors', () => {
    const freshDate = new Date(now - 3600 * 1000).toISOString();
    expect(scraperLevel({ enabled: true, lastRunAt: freshDate, now })).toBe('ok');
  });
});

describe('jobsLevel', () => {
  it('is ok with a clean queue', () => {
    expect(jobsLevel({ stuck: 0, failed: 0 })).toBe('ok');
  });
  it('is unknown when unmeasured (e.g. database down)', () => {
    expect(jobsLevel({ stuck: 0, failed: 0, unmeasured: true })).toBe('unknown');
  });
  it('is down when query failed with an error', () => {
    expect(jobsLevel({ stuck: 0, failed: 0, error: 'Query timeout' })).toBe('down');
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
  it('is down when probe throws an error', () => {
    expect(syncLevel({ backend: 's3', stale: false, error: 'Connection refused' })).toBe('down');
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

describe('cronLevel', () => {
  const now = Date.UTC(2026, 8, 6, 12, 0, 0); // fixed "now"
  const hoursAgo = (h: number) => new Date(now - h * 3600 * 1000).toISOString();

  it('is unknown when NO cron has ever reported (likely not scheduled — do not alarm)', () => {
    expect(cronLevel([{ name: 'alerts', lastRunAt: null }, { name: 'prices', lastRunAt: null }], now)).toBe('unknown');
    expect(cronLevel([], now)).toBe('unknown');
  });

  it('is ok when every reported cron ran within the window', () => {
    expect(cronLevel([{ name: 'alerts', lastRunAt: hoursAgo(2) }, { name: 'prices', lastRunAt: hoursAgo(6) }], now)).toBe('ok');
  });

  it('warns when a cron that WAS running went quiet past the threshold (silent crontab death)', () => {
    expect(cronLevel([{ name: 'alerts', lastRunAt: hoursAgo(2) }, { name: 'prices', lastRunAt: hoursAgo(CRON_STALE_HOURS + 1) }], now)).toBe('warn');
  });

  it('a never-run cron alongside a fresh one does not warn (only stale reporters do)', () => {
    expect(cronLevel([{ name: 'alerts', lastRunAt: hoursAgo(1) }, { name: 'prices', lastRunAt: null }], now)).toBe('ok');
  });

  it('treats an unparseable timestamp as stale (warn), never as fresh', () => {
    expect(cronLevel([{ name: 'alerts', lastRunAt: 'not-a-date' }], now)).toBe('warn');
  });
  it('is down when error is present', () => {
    expect(cronLevel([], now, 'Database connection rejected')).toBe('down');
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

describe('redactEndpoint', () => {
  it('strips credentials and query parameters from endpoint URLs', () => {
    expect(redactEndpoint('http://admin:secret123@my-searxng.internal:8080/search?q=foo#hash')).toBe('http://my-searxng.internal:8080/search');
    expect(redactEndpoint('http://flaresolverr:8191/')).toBe('http://flaresolverr:8191');
    expect(redactEndpoint('')).toBe('');
  });
});

