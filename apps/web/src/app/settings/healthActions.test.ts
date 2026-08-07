import { describe, it, expect, vi, beforeEach } from 'vitest';

// P77 — the IO half of Settings → System status. The thresholds themselves are pinned in
// lib/systemHealth.test.ts; what is pinned HERE is the policy around them, which is where a
// diagnostics page turns into a liability:
//  - it is admin-only, and refuses on the managed SaaS (host internals are not a tenant's);
//  - it NEVER writes (a health page that mutates state is the thing that breaks the deploy);
//  - the slow remote-storage probe only runs when explicitly asked for;
//  - one dead subsystem shows as one red tile instead of taking the whole page down.

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
}));

vi.mock('@/lib/auth', () => ({ requireAdmin: h.requireAdmin }));
vi.mock('@/lib/tenancy/saasMode', () => ({ saasMode: () => h.saasMode() }));
vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
vi.mock('mongoose', () => ({
  default: { connection: { db: { admin: () => ({ command: h.ping }), stats: h.dbStats } } },
}));
vi.mock('@/models/Job', () => ({
  Job: {
    find: () => ({ select: () => ({ lean: h.jobFind }) }),
    countDocuments: h.jobCount,
  },
}));
vi.mock('@/lib/aiConfig', () => ({ getAiConfig: h.aiConfig }));
vi.mock('@/lib/ollama', () => ({ isAiReady: h.isAiReady }));
vi.mock('@/lib/storageConfig', () => ({ getStorageConfig: h.storageConfig }));
vi.mock('@/lib/syncState', () => ({ getLastRemoteSync: h.lastSync }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: async () => ({ syncStaleDays: 7 }) }));
vi.mock('@/lib/billing/fileStorage', () => ({ measureDir: h.measureDir }));
vi.mock('@/lib/remoteStorage', () => ({ testRemote: h.testRemote }));
vi.mock('@/lib/onedrive', () => ({ testOnedrive: h.testOnedrive }));

import { getSystemHealth } from './healthActions';

const byId = (health: Awaited<ReturnType<typeof getSystemHealth>>, id: string) => health.checks.find((c) => c.id === id)!;

beforeEach(() => {
  vi.clearAllMocks();
  h.saasMode.mockReturnValue(false);
  h.ping.mockResolvedValue({ ok: 1 });
  h.dbStats.mockResolvedValue({ storageSize: 1024, indexSize: 1024, objects: 42, collections: 7 });
  h.aiConfig.mockResolvedValue({ aiEnabled: true, provider: 'anthropic', ollamaModel: 'qwen2.5:14b', anthropicModel: 'claude-sonnet-4-5' });
  h.isAiReady.mockResolvedValue(true);
  h.jobFind.mockResolvedValue([]);
  h.jobCount.mockResolvedValue(0);
  h.storageConfig.mockResolvedValue({ backend: 'local', mirror: false, remote: {} });
  h.lastSync.mockResolvedValue(null);
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
  it('reports every subsystem, and stays green with AI on and no remote mirror', async () => {
    const health = await getSystemHealth();
    expect(health.supported).toBe(true);
    expect(health.checks.map((c) => c.id)).toEqual(['database', 'disk', 'ai', 'jobs', 'sync']);
    expect(byId(health, 'database').level).toBe('ok');
    expect(byId(health, 'ai').level).toBe('ok');
    expect(byId(health, 'jobs').level).toBe('ok');
    // Local-only storage is a choice, not a fault.
    expect(byId(health, 'sync').level).toBe('unknown');
    expect(byId(health, 'sync').noteKey).toBe('sys.syncOff');
    expect(health.overall).toBe('ok');
  });

  it('never probes the remote backend unless deep is asked for', async () => {
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

describe('failure isolation', () => {
  it('turns an unreachable database into one red tile, not an exception', async () => {
    h.ping.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:27017'));
    const health = await getSystemHealth();
    const db = byId(health, 'database');
    expect(db.level).toBe('down');
    expect(db.noteKey).toBe('sys.dbDown');
    expect(db.noteVars?.error).toMatch(/ECONNREFUSED/);
    expect(health.overall).toBe('down');
    // ...and the rest of the grid still rendered.
    expect(health.checks).toHaveLength(5);
  });

  it('does not double-alarm on jobs when the database is the thing that is down', async () => {
    h.ping.mockRejectedValue(new Error('down'));
    h.jobFind.mockRejectedValue(new Error('down'));
    h.jobCount.mockRejectedValue(new Error('down'));
    const health = await getSystemHealth();
    expect(byId(health, 'jobs').level).toBe('ok');
    expect(byId(health, 'jobs').noteKey).toBe('sys.jobsIdle');
  });

  it('flags a wedged background job', async () => {
    h.jobFind.mockResolvedValue([{ updatedAt: new Date(Date.now() - 3 * 3600 * 1000) }]);
    const health = await getSystemHealth();
    expect(byId(health, 'jobs').level).toBe('warn');
    expect(byId(health, 'jobs').noteKey).toBe('sys.jobsStuck');
    expect(health.overall).toBe('warn');
  });

  it('reports a remote backend that refuses the live probe as down', async () => {
    h.storageConfig.mockResolvedValue({ backend: 'ftp', mirror: true, remote: { host: 'nas' } });
    h.lastSync.mockResolvedValue(new Date());
    h.testRemote.mockResolvedValue({ ok: false, error: 'NT_STATUS_LOGON_FAILURE' });
    const health = await getSystemHealth(true);
    const sync = byId(health, 'sync');
    expect(sync.level).toBe('down');
    expect(sync.noteVars?.error).toMatch(/LOGON_FAILURE/);
  });

  it('keeps AI grey (not red) when the master switch is off, and skips the readiness probe', async () => {
    h.aiConfig.mockResolvedValue({ aiEnabled: false, provider: 'ollama', ollamaModel: 'qwen2.5:14b', anthropicModel: '' });
    const health = await getSystemHealth();
    expect(byId(health, 'ai').level).toBe('unknown');
    expect(h.isAiReady).not.toHaveBeenCalled();
    expect(health.overall).toBe('ok');
  });
});
