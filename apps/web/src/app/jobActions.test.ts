import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// app/jobActions.ts (211 lines) is the server-side background job control surface: the
// three "enqueue" actions that create a Job document and kick the in-process worker
// (lib/jobRunner, mocked entirely here — its actual loop has no test coverage in this
// file), the read actions that power the /jobs page and the cross-device polling widget,
// and dismissJob/isJobRunning. Never directly unit-tested before. jobActions.ts still
// talks to the Job model directly (the queue has no tenancy yet — that is the open
// architectural question in ASK_ACHILLEAS.md), so the mock shape mirrors the simpler
// vouchers/loyaltyActions.test.ts pattern. The one exception is getBulkAiGuard, which
// now goes through withRequestTenant/currentModel; both seams are mocked flat below,
// and jobActions.tenant.test.ts is what actually pins the per-workspace behaviour.
//
// Behaviour pinned:
//  - getBulkAiGuard: no write-gate (read-only); confirm defaults ON (true) unless the
//    stored aiConfirmBulk is EXACTLY false; model is anthropicModel when the active
//    provider is 'anthropic', otherwise ollamaModel (covers 'ollama' and every other
//    provider id the same way).
//  - enqueueRescanReceipts / enqueueAiFillItems: assertCanWrite() first; an empty
//    itemIds array short-circuits BEFORE the feature-flag check even runs; the
//    'receipts' / 'itemsImport' feature flag is checked next and connectDB/Job.create
//    only happen once both gates pass; useOcr defaults to true when the 3rd arg is
//    omitted and is passed through untouched otherwise; ensureProcessor is kicked
//    (fire-and-forget) only after a successful Job.create.
//  - enqueueOnedriveSync: assertCanWrite() first; a sync already 'running' short-circuits
//    BEFORE getSyncManifest is ever called; a manifest failure surfaces its own error or
//    falls back to a fixed message; an empty (but ok) manifest returns 'Nothing to
//    sync.'; success maps manifest items to itemIds (filePath) / labels (rel) and
//    returns {ok:true, count}.
//  - getJobs / getJobDetail / getActiveJobs: all call ensureProcessor as a self-heal
//    (never awaited) before reading; every optional Job field is coalesced to a safe
//    default (numbers -> 0, strings -> '', lastOk -> true); getJobs ranks 'running' jobs
//    before everything else, then newest-first by createdAt within the same rank;
//    getJobDetail returns null outright for a missing id, otherwise adds
//    labels/itemCount/useOcr/results (each result field individually coerced via
//    String()/!!()); getActiveJobs queries a fixed 10-minute trailing window
//    ($or: running OR finishedAt >= now-10min) and its SerializedJob rows carry no
//    createdAt/finishedAt at all.
//  - dismissJob: assertCanWrite() first, then an actual Job.deleteOne (works for both a
//    running job — the worker loop re-checks status per item, so this halts it within
//    one item — and a finished one, where it's just a dismiss).
//  - isJobRunning: plain count>0 boolean, no write-gate.

const {
  connectDBMock,
  jobCreate,
  jobFindLean,
  jobFindByIdLean,
  jobDeleteOne,
  jobCountDocuments,
  ensureProcessorMock,
  getAiConfigMock,
  isFeatureEnabledMock,
  appConfigFindOneLean,
  getSyncManifestMock,
  assertCanWriteMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  jobCreate: vi.fn(async (_doc: Record<string, unknown>) => ({})),
  jobFindLean: vi.fn(async (_filter: Record<string, unknown>): Promise<Record<string, unknown>[]> => []),
  jobFindByIdLean: vi.fn(async (_id: string): Promise<Record<string, unknown> | null> => null),
  jobDeleteOne: vi.fn(async (_filter: Record<string, unknown>) => ({})),
  jobCountDocuments: vi.fn(async (_filter: Record<string, unknown>) => 0),
  ensureProcessorMock: vi.fn(async () => {}),
  getAiConfigMock: vi.fn(async () => ({ provider: 'ollama', anthropicModel: 'claude-sonnet-test', ollamaModel: 'qwen2.5:14b' })),
  isFeatureEnabledMock: vi.fn(async (_key: string) => true),
  appConfigFindOneLean: vi.fn(async (_filter?: Record<string, unknown>): Promise<Record<string, unknown> | null> => null),
  getSyncManifestMock: vi.fn(async () => ({ ok: true as boolean, error: undefined as string | undefined, items: [] as { filePath: string; rel: string }[] })),
  assertCanWriteMock: vi.fn(async () => {}),
}));

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/Job', () => ({
  Job: {
    create: jobCreate,
    find: (filter: Record<string, unknown>) => ({
      sort: (_s: Record<string, unknown>) => ({
        limit: (_n: number) => ({
          lean: () => jobFindLean(filter),
        }),
      }),
    }),
    findById: (id: string) => ({ lean: () => jobFindByIdLean(id) }),
    deleteOne: jobDeleteOne,
    countDocuments: jobCountDocuments,
  },
}));
vi.mock('@/lib/jobRunner', () => ({ ensureProcessor: ensureProcessorMock }));
vi.mock('@/lib/aiConfig', () => ({ getAiConfig: getAiConfigMock }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: isFeatureEnabledMock }));
vi.mock('@/models/AppConfig', () => ({
  AppConfig: {
    findOne: (filter: Record<string, unknown>) => ({
      select: () => ({ lean: () => appConfigFindOneLean(filter) }),
    }),
  },
}));
// getBulkAiGuard is the only tenancy-wrapped action in this file. Flat seams here (the
// real wrapper reads request headers, which a unit test has none of); the per-workspace
// property lives in jobActions.tenant.test.ts.
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<unknown>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));
vi.mock('./settings/actions', () => ({ getSyncManifest: getSyncManifestMock }));
vi.mock('@/lib/auth', () => ({ assertCanWrite: assertCanWriteMock }));

import {
  getBulkAiGuard,
  enqueueRescanReceipts,
  enqueueAiFillItems,
  enqueueOnedriveSync,
  getJobs,
  getJobDetail,
  getActiveJobs,
  dismissJob,
  isJobRunning,
} from './jobActions';

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  jobCreate.mockImplementation(async () => ({}));
  jobFindLean.mockImplementation(async () => []);
  jobFindByIdLean.mockImplementation(async () => null);
  jobDeleteOne.mockImplementation(async () => ({}));
  jobCountDocuments.mockImplementation(async () => 0);
  ensureProcessorMock.mockImplementation(async () => {});
  getAiConfigMock.mockImplementation(async () => ({ provider: 'ollama', anthropicModel: 'claude-sonnet-test', ollamaModel: 'qwen2.5:14b' }));
  isFeatureEnabledMock.mockImplementation(async () => true);
  appConfigFindOneLean.mockImplementation(async () => null);
  getSyncManifestMock.mockImplementation(async () => ({ ok: true, error: undefined, items: [] }));
  assertCanWriteMock.mockImplementation(async () => {});
});

describe('getBulkAiGuard', () => {
  it('defaults confirm to true when no config document exists', async () => {
    appConfigFindOneLean.mockResolvedValue(null);
    const r = await getBulkAiGuard();
    expect(r.confirm).toBe(true);
  });

  it('defaults confirm to true when aiConfirmBulk is anything other than exactly false', async () => {
    appConfigFindOneLean.mockResolvedValue({ aiConfirmBulk: undefined });
    expect((await getBulkAiGuard()).confirm).toBe(true);
  });

  it('turns confirm off only when aiConfirmBulk is stored as exactly false', async () => {
    appConfigFindOneLean.mockResolvedValue({ aiConfirmBulk: false });
    expect((await getBulkAiGuard()).confirm).toBe(false);
  });

  it('keeps confirm on when aiConfirmBulk is stored as true', async () => {
    appConfigFindOneLean.mockResolvedValue({ aiConfirmBulk: true });
    expect((await getBulkAiGuard()).confirm).toBe(true);
  });

  it('reports the anthropic model when that is the active provider', async () => {
    getAiConfigMock.mockResolvedValue({ provider: 'anthropic', anthropicModel: 'claude-x', ollamaModel: 'qwen-x' });
    const r = await getBulkAiGuard();
    expect(r.provider).toBe('anthropic');
    expect(r.model).toBe('claude-x');
  });

  it('reports the ollama model for the ollama provider (and any other non-anthropic provider)', async () => {
    getAiConfigMock.mockResolvedValue({ provider: 'ollama', anthropicModel: 'claude-x', ollamaModel: 'qwen-x' });
    expect((await getBulkAiGuard()).model).toBe('qwen-x');
  });
});

describe('enqueueRescanReceipts', () => {
  it('checks the gate before anything else', async () => {
    await enqueueRescanReceipts(['r1'], ['Store A']);
    expect(assertCanWriteMock).toHaveBeenCalledTimes(1);
  });

  it('short-circuits on an empty itemIds list before even checking the feature flag', async () => {
    const r = await enqueueRescanReceipts([], []);
    expect(r).toEqual({ ok: false });
    expect(isFeatureEnabledMock).not.toHaveBeenCalled();
    expect(jobCreate).not.toHaveBeenCalled();
  });

  it('refuses when the receipts feature is off, without touching the DB', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);
    const r = await enqueueRescanReceipts(['r1'], ['Store A']);
    expect(r).toEqual({ ok: false });
    expect(isFeatureEnabledMock).toHaveBeenCalledWith('receipts');
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(jobCreate).not.toHaveBeenCalled();
  });

  it('creates a running rescan-receipts job with useOcr defaulted to true, and kicks the processor', async () => {
    const r = await enqueueRescanReceipts(['r1', 'r2'], ['Store A', 'Store B']);
    expect(jobCreate).toHaveBeenCalledWith({
      kind: 'rescan-receipts',
      title: 'Re-scan receipts',
      href: '/receipts',
      itemIds: ['r1', 'r2'],
      labels: ['Store A', 'Store B'],
      useOcr: true,
      total: 2,
      status: 'running',
    });
    expect(ensureProcessorMock).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ ok: true });
  });

  it('passes an explicit useOcr:false straight through', async () => {
    await enqueueRescanReceipts(['r1'], ['Store A'], false);
    expect(jobCreate).toHaveBeenCalledWith(expect.objectContaining({ useOcr: false }));
  });
});

describe('enqueueAiFillItems', () => {
  it('short-circuits on an empty itemIds list before checking the feature flag', async () => {
    const r = await enqueueAiFillItems([], [], '/items', 'AI fill');
    expect(r).toEqual({ ok: false });
    expect(isFeatureEnabledMock).not.toHaveBeenCalled();
    expect(jobCreate).not.toHaveBeenCalled();
  });

  it('refuses when the itemsImport feature is off', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);
    const r = await enqueueAiFillItems(['i1'], ['Widget'], '/items', 'AI fill');
    expect(r).toEqual({ ok: false });
    expect(isFeatureEnabledMock).toHaveBeenCalledWith('itemsImport');
    expect(jobCreate).not.toHaveBeenCalled();
  });

  it('creates a running ai-fill-items job carrying the caller-supplied href/title, and kicks the processor', async () => {
    const r = await enqueueAiFillItems(['i1', 'i2'], ['Widget', 'Gadget'], '/shopping', 'AI fill 2');
    expect(jobCreate).toHaveBeenCalledWith({
      kind: 'ai-fill-items',
      title: 'AI fill 2',
      href: '/shopping',
      itemIds: ['i1', 'i2'],
      labels: ['Widget', 'Gadget'],
      total: 2,
      status: 'running',
    });
    expect(ensureProcessorMock).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ ok: true });
  });
});

describe('enqueueOnedriveSync', () => {
  it('refuses a second sync while one is already running, without ever calling getSyncManifest', async () => {
    jobCountDocuments.mockResolvedValue(1);
    const r = await enqueueOnedriveSync();
    expect(r).toEqual({ ok: false, error: 'A sync is already running.' });
    expect(getSyncManifestMock).not.toHaveBeenCalled();
    expect(jobCreate).not.toHaveBeenCalled();
  });

  it('surfaces the manifest error verbatim when the manifest is not ok', async () => {
    getSyncManifestMock.mockResolvedValue({ ok: false, error: 'Connect OneDrive first', items: [] });
    const r = await enqueueOnedriveSync();
    expect(r).toEqual({ ok: false, error: 'Connect OneDrive first' });
  });

  it('falls back to a fixed message when the manifest fails without its own error', async () => {
    getSyncManifestMock.mockResolvedValue({ ok: false, error: undefined, items: [] });
    const r = await enqueueOnedriveSync();
    expect(r).toEqual({ ok: false, error: 'Sync is not available.' });
  });

  it('reports "Nothing to sync." when the manifest is ok but empty', async () => {
    getSyncManifestMock.mockResolvedValue({ ok: true, error: undefined, items: [] });
    const r = await enqueueOnedriveSync();
    expect(r).toEqual({ ok: false, error: 'Nothing to sync.' });
    expect(jobCreate).not.toHaveBeenCalled();
  });

  it('maps manifest items (filePath -> itemIds, rel -> labels) into a running sync-onedrive job', async () => {
    getSyncManifestMock.mockResolvedValue({
      ok: true,
      error: undefined,
      items: [
        { filePath: '/data/storage/receipts/a.jpg', rel: 'receipts/a.jpg' },
        { filePath: '/data/storage/receipts/b.jpg', rel: 'receipts/b.jpg' },
      ],
    });
    const r = await enqueueOnedriveSync();
    expect(jobCreate).toHaveBeenCalledWith({
      kind: 'sync-onedrive',
      title: 'Sync to OneDrive',
      href: '/jobs',
      itemIds: ['/data/storage/receipts/a.jpg', '/data/storage/receipts/b.jpg'],
      labels: ['receipts/a.jpg', 'receipts/b.jpg'],
      total: 2,
      status: 'running',
    });
    expect(ensureProcessorMock).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ ok: true, count: 2 });
  });
});

const rawJob = (overrides: Record<string, unknown> = {}) => ({
  _id: 'j1',
  kind: 'rescan-receipts',
  title: 'Re-scan receipts',
  status: 'running',
  createdAt: new Date('2026-08-01T10:00:00.000Z'),
  finishedAt: null,
  ...overrides,
});

describe('getJobs', () => {
  it('self-heals via ensureProcessor before reading', async () => {
    await getJobs();
    expect(ensureProcessorMock).toHaveBeenCalledTimes(1);
  });

  it('coalesces every optional field to its safe default', async () => {
    jobFindLean.mockResolvedValue([rawJob({ href: undefined, total: undefined, done: undefined, ok: undefined, current: undefined, lastLabel: undefined, lastOk: undefined, lastDetail: undefined, error: undefined })]);
    const [row] = await getJobs();
    expect(row).toMatchObject({ href: '', total: 0, done: 0, ok: 0, current: '', lastLabel: '', lastOk: true, lastDetail: '', error: '' });
  });

  it('turns a null finishedAt into null, and a set one into an ISO string', async () => {
    jobFindLean.mockResolvedValue([
      rawJob({ _id: 'a', finishedAt: null }),
      rawJob({ _id: 'b', finishedAt: new Date('2026-08-01T11:00:00.000Z') }),
    ]);
    const rows = await getJobs();
    expect(rows.find((r) => r._id === 'a')!.finishedAt).toBeNull();
    expect(rows.find((r) => r._id === 'b')!.finishedAt).toBe('2026-08-01T11:00:00.000Z');
  });

  it('ranks every running job ahead of done/error jobs, regardless of age', async () => {
    jobFindLean.mockResolvedValue([
      rawJob({ _id: 'old-done', status: 'done', createdAt: new Date('2026-08-01T09:00:00.000Z') }),
      rawJob({ _id: 'new-running', status: 'running', createdAt: new Date('2026-08-01T08:00:00.000Z') }),
    ]);
    const rows = await getJobs();
    expect(rows.map((r) => r._id)).toEqual(['new-running', 'old-done']);
  });

  it('orders same-rank jobs newest-first', async () => {
    jobFindLean.mockResolvedValue([
      rawJob({ _id: 'older', status: 'done', createdAt: new Date('2026-08-01T09:00:00.000Z') }),
      rawJob({ _id: 'newer', status: 'done', createdAt: new Date('2026-08-01T10:00:00.000Z') }),
    ]);
    const rows = await getJobs();
    expect(rows.map((r) => r._id)).toEqual(['newer', 'older']);
  });
});

describe('getJobDetail', () => {
  it('returns null outright for a missing job', async () => {
    jobFindByIdLean.mockResolvedValue(null);
    expect(await getJobDetail('missing')).toBeNull();
  });

  it('adds labels/itemCount/useOcr/results on top of the row fields, each result field individually coerced', async () => {
    jobFindByIdLean.mockResolvedValue(
      rawJob({
        labels: ['a', 'b'],
        itemIds: ['x', 'y', 'z'],
        useOcr: true,
        results: [{ label: 1, ok: 'yes', detail: null }],
      })
    );
    const d = await getJobDetail('j1');
    expect(d!.labels).toEqual(['a', 'b']);
    expect(d!.itemCount).toBe(3);
    expect(d!.useOcr).toBe(true);
    expect(d!.results).toEqual([{ label: '1', ok: true, detail: '' }]);
  });

  it('defaults labels/itemIds/results to empty and useOcr to false when absent', async () => {
    jobFindByIdLean.mockResolvedValue(rawJob());
    const d = await getJobDetail('j1');
    expect(d!.labels).toEqual([]);
    expect(d!.itemCount).toBe(0);
    expect(d!.useOcr).toBe(false);
    expect(d!.results).toEqual([]);
  });
});

describe('getActiveJobs', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('self-heals via ensureProcessor before reading', async () => {
    await getActiveJobs();
    expect(ensureProcessorMock).toHaveBeenCalledTimes(1);
  });

  it('queries a fixed 10-minute trailing window for running-or-recently-finished jobs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
    await getActiveJobs();
    const filter = jobFindLean.mock.calls[0][0] as { $or: [{ status: string }, { finishedAt: { $gte: Date } }] };
    expect(filter.$or[0]).toEqual({ status: 'running' });
    expect(filter.$or[1].finishedAt.$gte.toISOString()).toBe('2026-08-05T11:50:00.000Z');
  });

  it('rows carry no createdAt/finishedAt at all (unlike getJobs/getJobDetail)', async () => {
    jobFindLean.mockResolvedValue([rawJob()]);
    const [row] = await getActiveJobs();
    expect(row).not.toHaveProperty('createdAt');
    expect(row).not.toHaveProperty('finishedAt');
    expect(row).toMatchObject({ _id: 'j1', kind: 'rescan-receipts', status: 'running' });
  });
});

describe('dismissJob', () => {
  it('checks the gate before deleting', async () => {
    await dismissJob('j1');
    expect(assertCanWriteMock).toHaveBeenCalledTimes(1);
  });

  it('deletes the job by id and reports ok', async () => {
    const r = await dismissJob('j1');
    expect(jobDeleteOne).toHaveBeenCalledWith({ _id: 'j1' });
    expect(r).toEqual({ ok: true });
  });
});

describe('isJobRunning', () => {
  it('is true when at least one job of that kind is running', async () => {
    jobCountDocuments.mockResolvedValue(2);
    expect(await isJobRunning('rescan-receipts')).toBe(true);
    expect(jobCountDocuments).toHaveBeenCalledWith({ kind: 'rescan-receipts', status: 'running' });
  });

  it('is false when none are running', async () => {
    jobCountDocuments.mockResolvedValue(0);
    expect(await isJobRunning('ai-fill-items')).toBe(false);
  });
});
