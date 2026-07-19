import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST /api/v1/items/:id/convert-to-task backs the mobile/web "Convert to task" button on an
// item's detail screen — it seeds a new Task from the item (title, price, links as HTML) and
// leaves the item itself untouched. Thin wrapper around the proven `convertItemToTask` action
// (items/actions.ts) — that action's own DB/HTML-rendering logic is NOT re-tested here.
//
// Route-only behaviour pinned here:
//   1. the ObjectId guard (malformed :id → 400 bad id, BEFORE the action is ever called),
//   2. **failure remap**: unlike items/[id]/link-plan (which echoes ok:false as 200), this
//      handler DOES remap — an action `{ ok: false }` becomes a 404 apiError with the action's
//      error message (or the 'convert failed' fallback when the action's error is empty/falsy),
//   3. the happy path returns exactly `{ ok: true, taskId }` — nothing else from the action's
//      result object leaks through.
//
// We run the REAL apiAuth/apiBody helpers and mock only the DB + action seam.

const { connectDBMock, userFindOne, userState, convertItemToTaskMock, convertState } = vi.hoisted(() => {
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const convertState: { calls: string[]; result: { ok: boolean; taskId?: string; error?: string } } = {
    calls: [],
    result: { ok: true, taskId: 't1' },
  };
  const convertItemToTaskMock = vi.fn((itemId: string) => {
    convertState.calls.push(itemId);
    return Promise.resolve(convertState.result);
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, convertItemToTaskMock, convertState };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/app/items/actions', () => ({ convertItemToTask: convertItemToTaskMock }));

import { POST } from './route';

const OID = '507f1f77bcf86cd799439011'; // a well-formed 24-hex ObjectId
const BASE = `http://pharos.local/api/v1/items/${OID}/convert-to-task`;

/** Minimal NextRequest stand-in — the route never reads a body, only headers.get. */
function makeReq(opts: { auth?: string | null } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
  } as unknown as NextRequest;
}

/** The dynamic route receives { params: Promise<{ id }> }. */
function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  convertState.calls = [];
  convertState.result = { ok: true, taskId: 't1' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  convertItemToTaskMock.mockImplementation((itemId: string) => {
    convertState.calls.push(itemId);
    return Promise.resolve(convertState.result);
  });
});

describe('auth gate', () => {
  it('without a token → 401, never converts', async () => {
    const res = await POST(makeReq({ auth: null }), ctx(OID));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: expect.stringContaining('Unauthorized') });
    expect(convertItemToTaskMock).not.toHaveBeenCalled();
  });

  it('with an unknown token → 401, never converts', async () => {
    userState.doc = null;
    const res = await POST(makeReq({ auth: 'Bearer bad' }), ctx(OID));
    expect(res.status).toBe(401);
    expect(convertItemToTaskMock).not.toHaveBeenCalled();
  });
});

describe('id guard', () => {
  it('a malformed id → 400 bad id, no action call', async () => {
    const res = await POST(makeReq(), ctx('not-an-id'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(convertItemToTaskMock).not.toHaveBeenCalled();
  });
});

describe('happy path', () => {
  it('converts and returns exactly { ok: true, taskId }', async () => {
    convertState.result = { ok: true, taskId: 'task-42' };
    const res = await POST(makeReq(), ctx(OID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, taskId: 'task-42' });
    expect(convertState.calls).toEqual([OID]);
  });
});

describe('failure remap', () => {
  it('an action { ok: false, error } becomes 404 with the action error message', async () => {
    convertState.result = { ok: false, error: 'Item not found' };
    const res = await POST(makeReq(), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Item not found' });
  });

  it('an empty/falsy action error falls back to "convert failed"', async () => {
    convertState.result = { ok: false, error: '' };
    const res = await POST(makeReq(), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'convert failed' });
  });

  it('an undefined action error also falls back to "convert failed"', async () => {
    convertState.result = { ok: false };
    const res = await POST(makeReq(), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'convert failed' });
  });
});
