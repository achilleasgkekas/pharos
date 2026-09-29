import { describe, it, expect, vi, beforeEach } from 'vitest';

// P77, #390, #392 Item 5 — Service readiness and diagnostics for Settings → System status.
// Policy, access control, probe isolation and failure states.

const h = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => ({ id: 'u1', role: 'admin' })),
  saasMode: vi.fn(() => false),
  ping: vi.fn(async () => ({ ok: 1 })),
  dbStats: vi.fn(async () => ({ storageSize: 1024, indexSize: 1024, objects: 42, collections: 7 })),
  measureDir: vi.fn(async () => 5000),
  aiConfig: vi.fn(async () => ({ aiEnabled: true, provider: 'anthropic', ollamaModel: 'qwen2.5:14b', anthropicModel: 'claude-sonnet-4-5' })),
  isAiReady: vi.fn(async () => true),
  jobFind: vi.fn(async () => [] as { updatedAt: Date }[]),
  jobCount: vi.fn(async () => 0),
  storageConfig: vi.fn(async () => ({ backend: 'local', mirror: false, remote: {} })),
  lastSync: vi.fn(async () => null as Date | null),
  testRemote: vi.fn(async () => ({ ok: true }) as { ok: boolean; error?: string }),
  testOnedrive: vi.fn(async () => ({ ok: true }) as { ok: boolean; error?: string }),
  cronBeats: vi.fn(async () => [
    { name: 'alerts', lastRunAt: new Date().toISOString() },
    { name: 'prices', lastRunAt: new Date().toISOString() },
  ] as { name: string; lastRunAt: string | null }[]),
  appConfigFind: vi.fn(async () => ({ scraperEnabled: true })),
  scraperStatus: vi.fn(async () => ({
    key: 'singleton',
    schedule: '0 */6 * * *',
    lastRunAt: new Date().toISOString(),
    lastCompleteAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
    lastError: null,
    lastStats: { items: 5, checks: 12, updates: 2, alerts: 1 },
  }) as unknown as {
    key: string;
    schedule?: string;
    lastRunAt?: string | null;
    lastCompleteAt?: string | null;
    heartbeatAt?: string | null;
    lastError?: string | null;
    lastStats?: { items?: number; checks?: number; updates?: number; alerts?: number } | null;
  } | null),
  fetch: vi.fn(async (url: string | URL) => {
    const s = String(url);
    if (s.includes('healthz')) {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (s.includes('/search')) {
      return { ok: true, status: 200, json: async () => ({ results: [{ title: 'Item 1' }] }) };
    }
    if (s.includes('/v1')) {
      return { ok: true, status: 200, json: async () => ({ status: 'ok', sessions: [] }) };
    }
    return { ok: true, status: 200, json: async () => ({ version: '3.4.0' }), text: async () => 'ok' };
  }),
}));

vi.mock('@/lib/auth', () => ({ requireAdmin: h.requireAdmin }));
vi.mock('@/lib/tenancy/saasMode', () => ({ saasMode: () => h.saasMode() }));
vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
vi.mock('mongoose', () => ({
  default: {
    connection: { db: { admin: () => ({ command: h.ping }), stats: h.dbStats } },
    models: {},
    model: vi.fn(),
  },
  Schema: class MockSchema {},
}));
vi.mock('@/models/Job', () => ({
  Job: {
    find: () => ({ select: () => ({ lean: h.jobFind }) }),
    countDocuments: h.jobCount,
  },
}));
vi.mock('@/models/AppConfig', () => ({
  AppConfig: {
    findOne: () => ({ select: () => ({ lean: h.appConfigFind }) }),
  },
}));
vi.mock('@/lib/aiConfig', () => ({ getAiConfig: h.aiConfig }));
vi.mock('@/lib/ollama', () => ({ isAiReady: h.isAiReady }));
vi.mock('@/lib/storageConfig', () => ({ getStorageConfig: h.storageConfig }));
vi.mock('@/lib/syncState', () => ({ getLastRemoteSync: h.lastSync }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: async () => ({ syncStaleDays: 7 }) }));
vi.mock('@/lib/storage', () => ({ measureDir: h.measureDir }));
vi.mock('@/lib/remoteStorage', () => ({ testRemote: h.testRemote }));
vi.mock('@/lib/onedrive', () => ({ testOnedrive: h.testOnedrive }));
vi.mock('@/lib/cronHeartbeat', () => ({ getCronHeartbeats: h.cronBeats }));
vi.mock('@/lib/scraperStatus', () => ({
  getScraperStatus: h.scraperStatus,
  recordScraperPass: vi.fn(),
}));

import { getSystemHealth } from './healthActions';

const byId = (health: Awaited<ReturnType<typeof getSystemHealth>>, id: string) => health.checks.find((c) => c.id === id)!;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SOLVER_URL = 'http://localhost:8191';
  process.env.SEARXNG_URL = 'http://localhost:8888';
  h.saasMode.mockReturnValue(false);
  h.ping.mockResolvedValue({ ok: 1 });
  h.dbStats.mockResolvedValue({ storageSize: 1024, indexSize: 1024, objects: 42, collections: 7 });
  h.aiConfig.mockResolvedValue({ aiEnabled: true, provider: 'anthropic', ollamaModel: 'qwen2.5:14b', anthropicModel: 'claude-sonnet-4-5' });
  h.isAiReady.mockResolvedValue(true);
  h.jobFind.mockResolvedValue([]);
  h.jobCount.mockResolvedValue(0);
  h.storageConfig.mockResolvedValue({ backend: 'local', mirror: false, remote: {} });
  h.lastSync.mockResolvedValue(null);
  h.appConfigFind.mockResolvedValue({ scraperEnabled: true });
  h.scraperStatus.mockResolvedValue({
    key: 'singleton',
    schedule: '0 */6 * * *',
    lastRunAt: new Date().toISOString(),
    lastCompleteAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
    lastError: null,
    lastStats: { items: 5, checks: 12, updates: 2, alerts: 1 },
  });
  h.cronBeats.mockResolvedValue([
    { name: 'alerts', lastRunAt: new Date().toISOString() },
    { name: 'prices', lastRunAt: new Date().toISOString() },
  ]);
  global.fetch = h.fetch as unknown as typeof fetch;
});

describe('access control', () => {
  it('requires an admin before measuring anything', async () => {
    h.requireAdmin.mockRejectedValueOnce(new Error('Forbidden: admin access required'));
    await expect(getSystemHealth()).rejects.toThrow(/admin/i);
    expect(h.ping).not.toHaveBeenCalled();
    expect(h.measureDir).not.toHaveBeenCalled();
  });

  it('reports unsupported on the managed SaaS and measures nothing', async () => {
    h.saasMode.mockReturnValue(true);
    const health = await getSystemHealth();
    expect(health.supported).toBe(false);
    expect(health.checks).toEqual([]);
    expect(h.ping).not.toHaveBeenCalled();
    expect(h.dbStats).not.toHaveBeenCalled();
  });
});

describe('a healthy self-hosted instance', () => {
  it('reports all 9 subsystems, and stays green with healthy companions', async () => {
    const health = await getSystemHealth();
    expect(health.supported).toBe(true);
    expect(health.checks.map((c) => c.id)).toEqual([
      'database',
      'disk',
      'ai',
      'search',
      'browser',
      'scraper',
      'jobs',
      'sync',
      'cron',
    ]);
    expect(byId(health, 'database').level).toBe('ok');
    expect(byId(health, 'ai').level).toBe('ok');
    expect(byId(health, 'search').level).toBe('ok');
    expect(byId(health, 'browser').level).toBe('ok');
    expect(byId(health, 'scraper').level).toBe('ok');
    expect(byId(health, 'jobs').level).toBe('ok');
    expect(byId(health, 'cron').level).toBe('ok');
    // Local-only storage is a choice, not a fault
    expect(byId(health, 'sync').level).toBe('unknown');
    expect(byId(health, 'sync').noteKey).toBe('sys.syncOff');
    expect(health.overall).toBe('ok');
  });

  it('never probes deep endpoints unless deep is asked for', async () => {
    h.storageConfig.mockResolvedValue({ backend: 'smb', mirror: true, remote: { host: 'nas' } });
    h.lastSync.mockResolvedValue(new Date());
    await getSystemHealth();
    expect(h.testRemote).not.toHaveBeenCalled();

    await getSystemHealth(true);
    expect(h.testRemote).toHaveBeenCalledTimes(1);
  });

  it('routes the deep probe to OneDrive when that is the backend', async () => {
    h.storageConfig.mockResolvedValue({ backend: 'onedrive', mirror: true, remote: {} });
    h.lastSync.mockResolvedValue(new Date());
    await getSystemHealth(true);
    expect(h.testOnedrive).toHaveBeenCalledTimes(1);
    expect(h.testRemote).not.toHaveBeenCalled();
  });
});

describe('failure isolation (#392 Item 5 and #390)', () => {
  it('turns an unreachable database into one red tile and keeps unmeasured jobs as unknown', async () => {
    h.ping.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:27017'));
    const health = await getSystemHealth();
    const db = byId(health, 'database');
    expect(db.level).toBe('down');
    expect(db.noteKey).toBe('sys.dbDown');
    expect(db.noteVars?.error).toMatch(/ECONNREFUSED/);
    expect(health.overall).toBe('down');

    // Jobs is unmeasured rather than falsely claiming 0 running / 0 failed ok (#392 Item 5)
    const jobs = byId(health, 'jobs');
    expect(jobs.level).toBe('unknown');
    expect(jobs.noteKey).toBe('sys.jobsUnmeasured');

    // Grid still renders completely
    expect(health.checks).toHaveLength(9);
  });

  it('represents a failed jobs query as down rather than a false healthy zero count', async () => {
    h.jobFind.mockRejectedValue(new Error('Query timeout'));
    const health = await getSystemHealth();
    const jobs = byId(health, 'jobs');
    expect(jobs.level).toBe('down');
    expect(jobs.noteKey).toBe('sys.jobsError');
    expect(jobs.noteVars?.error).toMatch(/Query timeout/);
  });

  it('flags a wedged background job', async () => {
    h.jobFind.mockResolvedValue([{ updatedAt: new Date(Date.now() - 3 * 3600 * 1000) }]);
    const health = await getSystemHealth();
    expect(byId(health, 'jobs').level).toBe('warn');
    expect(byId(health, 'jobs').noteKey).toBe('sys.jobsStuck');
    expect(health.overall).toBe('warn');
  });

  it('reports an exception in remote storage probe as down instead of falsely claiming ok', async () => {
    h.storageConfig.mockResolvedValue({ backend: 'ftp', mirror: true, remote: { host: 'nas' } });
    h.lastSync.mockResolvedValue(new Date());
    h.testRemote.mockRejectedValue(new Error('Network unreachable'));
    const health = await getSystemHealth(true);
    const sync = byId(health, 'sync');
    expect(sync.level).toBe('down');
    expect(sync.noteKey).toBe('sys.syncDown');
    expect(sync.noteVars?.error).toMatch(/Network unreachable/);
  });

  it('survives a rejected cron heartbeat query without failing the entire health action', async () => {
    h.cronBeats.mockRejectedValue(new Error('AppConfig read failure'));
    const health = await getSystemHealth();
    const cron = byId(health, 'cron');
    expect(cron.level).toBe('down');
    expect(cron.noteKey).toBe('sys.cronError');
    expect(cron.noteVars?.error).toMatch(/AppConfig read failure/);
    // Other checks remain visible and healthy
    expect(byId(health, 'database').level).toBe('ok');
    expect(byId(health, 'search').level).toBe('ok');
  });

  it('reports SearXNG connection failure without crashing Settings', async () => {
    h.fetch.mockImplementation(async (url: string | URL) => {
      if (String(url).includes('healthz')) throw new Error('ECONNREFUSED 127.0.0.1:8888');
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const health = await getSystemHealth();
    const search = byId(health, 'search');
    expect(search.level).toBe('down');
    expect(search.noteKey).toBe('sys.searchDown');
    expect(search.noteVars?.error).toMatch(/ECONNREFUSED/);
    expect(health.overall).toBe('down');
  });

  it('reports SearXNG degraded when healthz passes but search functional test fails in deep mode', async () => {
    h.fetch.mockImplementation(async (url: string | URL) => {
      const s = String(url);
      if (s.includes('healthz')) return { ok: true, status: 200, json: async () => ({}) };
      if (s.includes('/search')) return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const health = await getSystemHealth(true);
    const search = byId(health, 'search');
    expect(search.level).toBe('warn');
    expect(search.noteKey).toBe('sys.searchDegraded');
    expect(search.noteVars?.error).toMatch(/503/);
  });

  it('reports FlareSolverr connection failure without crashing Settings', async () => {
    h.fetch.mockImplementation(async (url: string | URL) => {
      if (String(url).includes('8191')) throw new Error('ECONNREFUSED 127.0.0.1:8191');
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const health = await getSystemHealth();
    const browser = byId(health, 'browser');
    expect(browser.level).toBe('down');
    expect(browser.noteKey).toBe('sys.flareDown');
    expect(browser.noteVars?.error).toMatch(/ECONNREFUSED/);
  });

  it('reports FlareSolverr degraded when root passes but functional session probe fails in deep mode', async () => {
    h.fetch.mockImplementation(async (url: string | URL) => {
      const s = String(url);
      if (s.includes('/v1')) {
        return { ok: true, status: 200, json: async () => ({ status: 'error', message: 'Browser crashed' }) };
      }
      return { ok: true, status: 200, json: async () => ({ version: '3.4.0' }) };
    });
    const health = await getSystemHealth(true);
    const browser = byId(health, 'browser');
    expect(browser.level).toBe('warn');
    expect(browser.noteKey).toBe('sys.flareDegraded');
    expect(browser.noteVars?.error).toMatch(/Browser crashed/);
  });

  it('reports scraper as disabled when disabled in Settings', async () => {
    h.appConfigFind.mockResolvedValue({ scraperEnabled: false });
    const health = await getSystemHealth();
    const scraper = byId(health, 'scraper');
    expect(scraper.level).toBe('unknown');
    expect(scraper.noteKey).toBe('sys.scraperDisabled');
  });

  it('reports scraper as not running when no runs or heartbeats were ever recorded', async () => {
    h.scraperStatus.mockResolvedValue(null);
    h.cronBeats.mockResolvedValue([
      { name: 'alerts', lastRunAt: new Date().toISOString() },
      { name: 'prices', lastRunAt: null },
    ]);
    const health = await getSystemHealth();
    const scraper = byId(health, 'scraper');
    expect(scraper.level).toBe('unknown');
    expect(scraper.noteKey).toBe('sys.scraperNotConfigured');
  });

  it('reports scraper as warn when the last pass threw an error', async () => {
    h.scraperStatus.mockResolvedValue({
      key: 'singleton',
      schedule: '0 */6 * * *',
      lastRunAt: new Date().toISOString(),
      lastError: 'Anthropic rate limit exceeded',
    });
    const health = await getSystemHealth();
    const scraper = byId(health, 'scraper');
    expect(scraper.level).toBe('warn');
    expect(scraper.noteKey).toBe('sys.scraperError');
    expect(scraper.noteVars?.error).toMatch(/rate limit/);
  });

  it('reports scraper as warn when activity is stale (> 48h)', async () => {
    const staleDate = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
    h.scraperStatus.mockResolvedValue({
      key: 'singleton',
      schedule: '0 */6 * * *',
      lastRunAt: staleDate,
      heartbeatAt: staleDate,
      lastError: null,
    });
    h.cronBeats.mockResolvedValue([
      { name: 'alerts', lastRunAt: new Date().toISOString() },
      { name: 'prices', lastRunAt: staleDate },
    ]);
    const health = await getSystemHealth();
    const scraper = byId(health, 'scraper');
    expect(scraper.level).toBe('warn');
    expect(scraper.noteKey).toBe('sys.scraperStale');
  });

  it('keeps AI grey (not red) when the master switch is off, and skips the readiness probe', async () => {
    h.aiConfig.mockResolvedValue({ aiEnabled: false, provider: 'ollama', ollamaModel: 'qwen2.5:14b', anthropicModel: '' });
    const health = await getSystemHealth();
    expect(byId(health, 'ai').level).toBe('unknown');
    expect(h.isAiReady).not.toHaveBeenCalled();
    expect(health.overall).toBe('ok');
  });
});
