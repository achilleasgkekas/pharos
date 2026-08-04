import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST /api/v1/receipts/:id/add-to-library backs the mobile/web "Add to library" button on a
// receipt's detail screen — it turns the receipt's line items into inventory Items (find-or-create
// by title, link the receipt back) and reports how many were created vs. matched-and-linked. Thin
// wrapper around the proven `addReceiptItemsToLibrary` action (receipts/actions.ts) — that action's
// own find-or-create/warranty/DB logic is NOT re-tested here.
//
// Route-only behaviour pinned here:
//   1. the ObjectId guard (malformed :id → 400 bad id, BEFORE the action is ever called),
//   2. **failure remap**: an action `{ ok: false }` becomes a 400 apiError with the action's error
//      message (or the 'failed' fallback when the action's error is empty/falsy) — note this is a
//      400, unlike the items/[id]/convert-to-task sibling which remaps to 404,
//   3. the happy path returns exactly `{ ok: true, created, linked }` — nothing else from the
//      action's result object leaks through.
//
// We run the REAL apiAuth/apiBody helpers and mock only the DB + action seam.

const { connectDBMock, userFindOne, userState, addToLibraryMock, addState } = vi.hoisted(() => {
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const addState: {
    calls: string[];
    result: { ok: boolean; created: number; linked: number; error?: string };
  } = {
    calls: [],
    result: { ok: true, created: 2, linked: 1 },
  };
  const addToLibraryMock = vi.fn((receiptId: string) => {
    addState.calls.push(receiptId);
    return Promise.resolve(addState.result);
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, addToLibraryMock, addState };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/app/receipts/actions', () => ({ addReceiptItemsToLibrary: addToLibraryMock }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { POST } from './route';

const OID = '507f1f77bcf86cd799439011'; // a well-formed 24-hex ObjectId
const BASE = `http://pharos.local/api/v1/receipts/${OID}/add-to-library`;

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
  addState.calls = [];
  addState.result = { ok: true, created: 2, linked: 1 };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  addToLibraryMock.mockImplementation((receiptId: string) => {
    addState.calls.push(receiptId);
    return Promise.resolve(addState.result);
  });
});

describe('auth gate', () => {
  it('without a token → 401, never adds to library', async () => {
    const res = await POST(makeReq({ auth: null }), ctx(OID));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: expect.stringContaining('Unauthorized') });
    expect(addToLibraryMock).not.toHaveBeenCalled();
  });

  it('with an unknown token → 401, never adds to library', async () => {
    userState.doc = null;
    const res = await POST(makeReq({ auth: 'Bearer bad' }), ctx(OID));
    expect(res.status).toBe(401);
    expect(addToLibraryMock).not.toHaveBeenCalled();
  });
});

describe('id guard', () => {
  it('a malformed id → 400 bad id, no action call', async () => {
    const res = await POST(makeReq(), ctx('not-an-id'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(addToLibraryMock).not.toHaveBeenCalled();
  });
});

describe('happy path', () => {
  it('adds to library and returns exactly { ok: true, created, linked }', async () => {
    addState.result = { ok: true, created: 5, linked: 3 };
    const res = await POST(makeReq(), ctx(OID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, created: 5, linked: 3 });
    expect(addState.calls).toEqual([OID]);
  });

  it('zero created/linked still returns ok:true (no items on the receipt)', async () => {
    addState.result = { ok: true, created: 0, linked: 0 };
    const res = await POST(makeReq(), ctx(OID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, created: 0, linked: 0 });
  });
});

describe('failure remap', () => {
  it('an action { ok: false, error } becomes 400 with the action error message', async () => {
    addState.result = { ok: false, created: 0, linked: 0, error: 'Receipt not found' };
    const res = await POST(makeReq(), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Receipt not found' });
  });

  it('an empty/falsy action error falls back to "failed"', async () => {
    addState.result = { ok: false, created: 0, linked: 0, error: '' };
    const res = await POST(makeReq(), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'failed' });
  });

  it('an undefined action error also falls back to "failed"', async () => {
    addState.result = { ok: false, created: 0, linked: 0 };
    const res = await POST(makeReq(), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'failed' });
  });
});
