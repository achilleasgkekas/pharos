import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET/POST /api/v1/tasks is one of the ~50 REST endpoints the Expo mobile app drives.
// This route carries real request-shaping logic that lives NOWHERE else and would
// silently corrupt the mobile contract if it drifted:
//   - the Bearer-auth gate (withAuth → 401 without a valid token),
//   - POST validation: `title` required, tags coerced from array | comma-string,
//     status/priority enum-defaulting, and completedAt auto-set only when status==='done',
//   - GET: the optional status filter + the updatedSince cursor flipping on withDeleted
//     (incremental sync must see soft-deleted rows), and the list envelope shape.
// We exercise the REAL apiAuth/apiBody/apiList helpers and only mock the DB seam
// (connectDB + the User/Task models), so the validation + serialization run for real.

// Hoisted so the vi.mock factories (which run before imports) can reference the plumbing.
const { connectDBMock, userFindOne, userState, taskFind, taskCount, taskCreate, findQuery, countQuery, state } =
  vi.hoisted(() => {
    const state: { docs: unknown[]; total: number; lastCreate: Record<string, unknown> | null } = {
      docs: [],
      total: 0,
      lastCreate: null,
    };
    // User model — bearerUser does User.findOne(...).select(...).lean()
    const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
    const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
    // Task.find(filter).sort().skip().limit()[.setOptions()].lean() — a self-returning chain.
    const lean = vi.fn(async () => state.docs);
    const findQuery: Record<string, unknown> = {};
    for (const m of ['sort', 'skip', 'limit', 'setOptions']) findQuery[m] = vi.fn(() => findQuery);
    findQuery.lean = lean;
    const taskFind = vi.fn(() => findQuery);
    // Task.countDocuments(filter) — a thenable resolving to the total, with a self-returning setOptions.
    const countQuery: Record<string, unknown> = {
      setOptions: vi.fn(() => countQuery),
      then: (resolve: (n: number) => void) => resolve(state.total),
    };
    const taskCount = vi.fn(() => countQuery);
    const taskCreate = vi.fn(async (arg: Record<string, unknown>) => {
      state.lastCreate = arg;
      return { toObject: () => ({ _id: 'newid', updatedAt: new Date('2026-07-03T00:00:00Z'), ...arg }) };
    });
    return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, taskFind, taskCount, taskCreate, findQuery, countQuery, state };
  });

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Task', () => ({ Task: { find: taskFind, countDocuments: taskCount, create: taskCreate } }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { GET, POST } from './route';

const BASE = 'http://pharos.local/api/v1/tasks';

/** Minimal NextRequest stand-in — the route only reads url, headers.get, and json(). */
function makeReq(opts: { url?: string; auth?: string | null; body?: unknown } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: opts.url ?? BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => (opts.body === undefined ? {} : opts.body),
  } as unknown as NextRequest;
}

beforeEach(() => {
  state.docs = [];
  state.total = 0;
  state.lastCreate = null;
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  // clearAllMocks resets return values on the chain stubs → re-point them.
  for (const m of ['sort', 'skip', 'limit', 'setOptions']) (findQuery[m] as ReturnType<typeof vi.fn>).mockImplementation(() => findQuery);
  (findQuery.lean as ReturnType<typeof vi.fn>).mockImplementation(async () => state.docs);
  (countQuery.setOptions as ReturnType<typeof vi.fn>).mockImplementation(() => countQuery);
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  taskFind.mockImplementation(() => findQuery);
  taskCount.mockImplementation(() => countQuery);
});

describe('auth gate', () => {
  it('GET without a token → 401, never touches the DB', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: expect.stringContaining('Unauthorized') });
    expect(taskFind).not.toHaveBeenCalled();
  });

  it('POST with an unknown token → 401, never creates', async () => {
    userState.doc = null; // token resolves to no user
    const res = await POST(makeReq({ body: { title: 'x' } }));
    expect(res.status).toBe(401);
    expect(taskCreate).not.toHaveBeenCalled();
  });
});

describe('POST validation', () => {
  it('rejects a missing/blank title with 400 and no create', async () => {
    const res = await POST(makeReq({ body: { title: '   ' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'title required' });
    expect(taskCreate).not.toHaveBeenCalled();
  });

  it('creates a todo with defaults and returns 201 + trimmed task', async () => {
    const res = await POST(makeReq({ body: { title: 'Buy switch' } }));
    expect(res.status).toBe(201);
    expect(state.lastCreate).toMatchObject({
      title: 'Buy switch',
      status: 'todo',
      priority: 'normal',
      tags: [],
      content: '',
      dueDate: null,
      completedAt: null,
    });
    const json = (await res.json()) as { task: { id: string; title: string; status: string } };
    expect(json.task).toMatchObject({ id: 'newid', title: 'Buy switch', status: 'todo', priority: 'normal' });
  });

  it('parses a comma-string of tags into a trimmed, non-empty array', async () => {
    await POST(makeReq({ body: { title: 't', tags: 'network, 3d-print , ,order' } }));
    expect(state.lastCreate?.tags).toEqual(['network', '3d-print', 'order']);
  });

  it('keeps an array of tags (stringified)', async () => {
    await POST(makeReq({ body: { title: 't', tags: ['a', 2, 'b'] } }));
    expect(state.lastCreate?.tags).toEqual(['a', '2', 'b']);
  });

  it('falls back to defaults for out-of-enum status/priority', async () => {
    await POST(makeReq({ body: { title: 't', status: 'archived', priority: 'urgent' } }));
    expect(state.lastCreate).toMatchObject({ status: 'todo', priority: 'normal' });
  });

  it('sets completedAt when status is done, and echoes it in the response', async () => {
    const res = await POST(makeReq({ body: { title: 'done thing', status: 'done' } }));
    expect(state.lastCreate?.status).toBe('done');
    expect(state.lastCreate?.completedAt).toBeInstanceOf(Date);
    const json = (await res.json()) as { task: { completedAt: string | null } };
    expect(json.task.completedAt).not.toBeNull();
  });

  it('parses dueDate into a Date', async () => {
    await POST(makeReq({ body: { title: 't', dueDate: '2026-08-01' } }));
    expect(state.lastCreate?.dueDate).toBeInstanceOf(Date);
    expect((state.lastCreate?.dueDate as Date).toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });
});

describe('GET listing', () => {
  it('returns the list envelope with mapped tasks', async () => {
    state.docs = [
      {
        _id: 't1',
        title: 'First',
        status: 'in-progress',
        tags: ['a'],
        steps: [{ _id: 's1', text: 'step', done: true }],
        updatedAt: new Date('2026-07-01T00:00:00Z'),
      },
    ];
    state.total = 7;
    const res = await GET(makeReq({ url: `${BASE}?limit=10&offset=5` }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown[]; total: number; limit: number; offset: number };
    expect(json).toMatchObject({ total: 7, limit: 10, offset: 5 });
    expect(json.data).toEqual([
      expect.objectContaining({
        id: 't1',
        title: 'First',
        status: 'in-progress',
        priority: 'normal',
        tags: ['a'],
        steps: [{ id: 's1', text: 'step', done: true }],
        deleted: false,
      }),
    ]);
  });

  it('passes the status query straight into the Mongo filter', async () => {
    await GET(makeReq({ url: `${BASE}?status=blocked` }));
    expect(taskFind).toHaveBeenCalledWith({ status: 'blocked' });
    expect(taskCount).toHaveBeenCalledWith({ status: 'blocked' });
  });

  it('with no status filters on {} (all tasks)', async () => {
    await GET(makeReq());
    expect(taskFind).toHaveBeenCalledWith({});
  });

  it('an updatedSince cursor adds the $gte filter and flips withDeleted on both queries', async () => {
    await GET(makeReq({ url: `${BASE}?updatedSince=2026-06-01T00:00:00.000Z` }));
    const filter = (taskFind.mock.calls[0] as unknown[])[0] as { updatedAt: { $gte: Date } };
    expect(filter.updatedAt.$gte).toBeInstanceOf(Date);
    expect(filter.updatedAt.$gte.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(findQuery.setOptions).toHaveBeenCalledWith({ withDeleted: true });
    expect(countQuery.setOptions).toHaveBeenCalledWith({ withDeleted: true });
  });

  it('does NOT set withDeleted without a cursor', async () => {
    await GET(makeReq());
    expect(findQuery.setOptions).not.toHaveBeenCalled();
    expect(countQuery.setOptions).not.toHaveBeenCalled();
  });

  it('flags soft-deleted docs as deleted:true', async () => {
    state.docs = [{ _id: 't9', title: 'gone', deletedAt: new Date('2026-06-30T00:00:00Z') }];
    const res = await GET(makeReq({ url: `${BASE}?updatedSince=2026-06-01T00:00:00.000Z` }));
    const json = (await res.json()) as { data: Array<{ deleted: boolean }> };
    expect(json.data[0].deleted).toBe(true);
  });
});
