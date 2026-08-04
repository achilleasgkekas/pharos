import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST /api/v1/items/:id/ai-fill backs the mobile/web "AI fill specs" / "AI fill info" buttons
// on an item's detail screen. Thin wrapper around the proven web `aiFillSpecs` / `aiFillInfo`
// actions (items/actions.ts) — their own web-fetch/AI-parse/merge logic is NOT re-tested here.
//
// Route-only behaviour pinned here:
//   1. the ObjectId guard (malformed :id → 400 bad id, BEFORE any body read or action call),
//   2. mode resolution: `body.mode === 'info'` picks aiFillInfo; ANY other value (missing body,
//      unparsable JSON, 'specs', an unrelated string, a number, null) falls back to 'specs' and
//      calls aiFillSpecs — a thrown req.json() is swallowed by the route's own try/catch,
//   3. shape per mode: 'specs' → { ok:true, mode:'specs', specs } (no `filled`, no `item` — the
//      route comment says the client re-fetches GET /items/:id instead of trusting this payload),
//      'info' → { ok:true, mode:'info', filled } (no `specs`, no `item`),
//   4. failure remap: an action `{ ok:false, error }` becomes 400 with the action's error message,
//      or the mode-specific fallback ('AI specs failed' / 'AI fill failed') when error is falsy.
//
// We run the REAL apiAuth helpers and mock only the DB + action seam.

const {
  connectDBMock,
  userFindOne,
  userState,
  aiFillSpecsMock,
  aiFillInfoMock,
  specsState,
  infoState,
} = vi.hoisted(() => {
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const specsState: { calls: string[]; result: { ok: boolean; specs?: string; error?: string } } = {
    calls: [],
    result: { ok: true, specs: 'CPU: X, RAM: Y' },
  };
  const infoState: { calls: string[]; result: { ok: boolean; filled: string[]; error?: string } } = {
    calls: [],
    result: { ok: true, filled: ['specs', 'category'] },
  };
  const aiFillSpecsMock = vi.fn((id: string) => {
    specsState.calls.push(id);
    return Promise.resolve(specsState.result);
  });
  const aiFillInfoMock = vi.fn((id: string) => {
    infoState.calls.push(id);
    return Promise.resolve(infoState.result);
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, aiFillSpecsMock, aiFillInfoMock, specsState, infoState };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/app/items/actions', () => ({ aiFillSpecs: aiFillSpecsMock, aiFillInfo: aiFillInfoMock }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { POST } from './route';

const OID = '507f1f77bcf86cd799439011'; // a well-formed 24-hex ObjectId
const BASE = `http://pharos.local/api/v1/items/${OID}/ai-fill`;

/** Minimal NextRequest stand-in. `body: 'throw'` makes json() reject, like a truly empty body. */
function makeReq(opts: { auth?: string | null; body?: unknown | 'throw' } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => {
      if (opts.body === 'throw' || opts.body === undefined) throw new Error('Unexpected end of JSON input');
      return opts.body;
    },
  } as unknown as NextRequest;
}

/** The dynamic route receives { params: Promise<{ id }> }. */
function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  specsState.calls = [];
  specsState.result = { ok: true, specs: 'CPU: X, RAM: Y' };
  infoState.calls = [];
  infoState.result = { ok: true, filled: ['specs', 'category'] };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  aiFillSpecsMock.mockImplementation((id: string) => {
    specsState.calls.push(id);
    return Promise.resolve(specsState.result);
  });
  aiFillInfoMock.mockImplementation((id: string) => {
    infoState.calls.push(id);
    return Promise.resolve(infoState.result);
  });
});

describe('auth gate', () => {
  it('without a token → 401, neither action runs', async () => {
    const res = await POST(makeReq({ auth: null, body: {} }), ctx(OID));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: expect.stringContaining('Unauthorized') });
    expect(aiFillSpecsMock).not.toHaveBeenCalled();
    expect(aiFillInfoMock).not.toHaveBeenCalled();
  });

  it('with an unknown token → 401, neither action runs', async () => {
    userState.doc = null;
    const res = await POST(makeReq({ auth: 'Bearer bad', body: {} }), ctx(OID));
    expect(res.status).toBe(401);
    expect(aiFillSpecsMock).not.toHaveBeenCalled();
    expect(aiFillInfoMock).not.toHaveBeenCalled();
  });
});

describe('id guard', () => {
  it('a malformed id → 400 bad id, no body read, no action call', async () => {
    const res = await POST(makeReq({ body: 'throw' }), ctx('not-an-id'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(aiFillSpecsMock).not.toHaveBeenCalled();
    expect(aiFillInfoMock).not.toHaveBeenCalled();
  });
});

describe('mode resolution defaults to specs', () => {
  it('an unparsable/empty body (json() throws) → mode specs, aiFillSpecs called', async () => {
    const res = await POST(makeReq({ body: 'throw' }), ctx(OID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mode: 'specs', specs: 'CPU: X, RAM: Y' });
    expect(specsState.calls).toEqual([OID]);
    expect(aiFillInfoMock).not.toHaveBeenCalled();
  });

  it('a body with no mode field → mode specs', async () => {
    const res = await POST(makeReq({ body: {} }), ctx(OID));
    expect(res.status).toBe(200);
    expect((await res.json()).mode).toBe('specs');
    expect(specsState.calls).toEqual([OID]);
  });

  it('mode explicitly "specs" → mode specs', async () => {
    const res = await POST(makeReq({ body: { mode: 'specs' } }), ctx(OID));
    expect((await res.json()).mode).toBe('specs');
  });

  it('an unrelated string mode → falls back to specs, not treated as info', async () => {
    const res = await POST(makeReq({ body: { mode: 'photos' } }), ctx(OID));
    expect((await res.json()).mode).toBe('specs');
    expect(aiFillInfoMock).not.toHaveBeenCalled();
  });

  it('a non-string mode (number) → falls back to specs', async () => {
    const res = await POST(makeReq({ body: { mode: 1 } }), ctx(OID));
    expect((await res.json()).mode).toBe('specs');
  });

  it('a null mode → falls back to specs', async () => {
    const res = await POST(makeReq({ body: { mode: null } }), ctx(OID));
    expect((await res.json()).mode).toBe('specs');
  });
});

describe('mode info', () => {
  it('mode "info" calls aiFillInfo and returns { ok, mode, filled } only', async () => {
    infoState.result = { ok: true, filled: ['tags'] };
    const res = await POST(makeReq({ body: { mode: 'info' } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mode: 'info', filled: ['tags'] });
    expect(infoState.calls).toEqual([OID]);
    expect(aiFillSpecsMock).not.toHaveBeenCalled();
  });
});

describe('failure remap', () => {
  it('specs mode: an action { ok:false, error } becomes 400 with the action error message', async () => {
    specsState.result = { ok: false, error: 'No source to read specs from' };
    const res = await POST(makeReq({ body: {} }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'No source to read specs from' });
  });

  it('specs mode: an empty/falsy action error falls back to "AI specs failed"', async () => {
    specsState.result = { ok: false, error: '' };
    const res = await POST(makeReq({ body: {} }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'AI specs failed' });
  });

  it('info mode: an action { ok:false, error } becomes 400 with the action error message', async () => {
    infoState.result = { ok: false, filled: [], error: 'Item not found' };
    const res = await POST(makeReq({ body: { mode: 'info' } }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Item not found' });
  });

  it('info mode: an undefined action error falls back to "AI fill failed"', async () => {
    infoState.result = { ok: false, filled: [] };
    const res = await POST(makeReq({ body: { mode: 'info' } }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'AI fill failed' });
  });
});
