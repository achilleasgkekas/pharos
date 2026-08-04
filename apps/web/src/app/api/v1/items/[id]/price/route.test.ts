import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST /api/v1/items/:id/price backs the mobile "log a price" action on the item-detail /
// price-panel screen. The route itself is a thin body-validation gate in front of the proven web
// `logItemPrice` action (which appends to priceHistory + updates currentPrice). Three route-only
// behaviours live ONLY here and feed the mobile contract, so a drift silently corrupts it:
//
//   1. the ObjectId guard (malformed :id → 400 bad id, BEFORE any body read or action call),
//   2. the price gate: `Number(b.price)` then `!(price > 0)` → 400. This means a numeric STRING
//      is accepted (Number('250') === 250), but 0, negatives, and non-numeric strings (→ NaN)
//      are all rejected with the exact message the mobile form surfaces,
//   3. the store passthrough: `typeof b.store === 'string' ? b.store : ''` — a non-string store
//      collapses to '' (the action itself trims/defaults to 'manual'); the route does NOT trim.
//
// We also pin the failure remap: a logItemPrice `{ ok:false }` becomes a 400 carrying its error
// (or 'failed'). We run the REAL apiAuth/apiBody helpers and mock only the DB + action seam.

const { connectDBMock, userFindOne, userState, logItemPriceMock, priceState } = vi.hoisted(() => {
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  // logItemPrice(id, price, store) → { ok, error? }; record the exact args the route forwards.
  const priceState: { calls: Array<{ id: string; price: number; store: string }>; result: { ok: boolean; error?: string } } = {
    calls: [],
    result: { ok: true },
  };
  const logItemPriceMock = vi.fn((id: string, price: number, store: string) => {
    priceState.calls.push({ id, price, store });
    return Promise.resolve(priceState.result);
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, logItemPriceMock, priceState };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/app/items/actions', () => ({ logItemPrice: logItemPriceMock }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { POST } from './route';

const OID = '507f1f77bcf86cd799439011'; // a well-formed 24-hex ObjectId
const BASE = `http://pharos.local/api/v1/items/${OID}/price`;

/** Minimal NextRequest stand-in — the route only reads headers.get and json(). */
function makeReq(opts: { auth?: string | null; body?: unknown } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => (opts.body === undefined ? {} : opts.body),
  } as unknown as NextRequest;
}

/** The dynamic route receives { params: Promise<{ id }> }. */
function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  priceState.calls = [];
  priceState.result = { ok: true };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  logItemPriceMock.mockImplementation((id: string, price: number, store: string) => {
    priceState.calls.push({ id, price, store });
    return Promise.resolve(priceState.result);
  });
});

describe('auth gate', () => {
  it('without a token → 401, never logs a price', async () => {
    const res = await POST(makeReq({ auth: null, body: { price: 100 } }), ctx(OID));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: expect.stringContaining('Unauthorized') });
    expect(logItemPriceMock).not.toHaveBeenCalled();
  });

  it('with an unknown token → 401, never logs a price', async () => {
    userState.doc = null;
    const res = await POST(makeReq({ auth: 'Bearer bad', body: { price: 100 } }), ctx(OID));
    expect(res.status).toBe(401);
    expect(logItemPriceMock).not.toHaveBeenCalled();
  });
});

describe('id guard', () => {
  it('a malformed id → 400 bad id, no action call', async () => {
    const res = await POST(makeReq({ body: { price: 100 } }), ctx('not-an-id'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(logItemPriceMock).not.toHaveBeenCalled();
  });
});

describe('price validation', () => {
  it('rejects a missing price with 400 and the exact message, no action call', async () => {
    const res = await POST(makeReq({ body: {} }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'price must be greater than 0' });
    expect(logItemPriceMock).not.toHaveBeenCalled();
  });

  it('rejects a zero price', async () => {
    const res = await POST(makeReq({ body: { price: 0 } }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'price must be greater than 0' });
    expect(logItemPriceMock).not.toHaveBeenCalled();
  });

  it('rejects a negative price', async () => {
    const res = await POST(makeReq({ body: { price: -5 } }), ctx(OID));
    expect(res.status).toBe(400);
    expect(logItemPriceMock).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric string (Number → NaN)', async () => {
    const res = await POST(makeReq({ body: { price: 'cheap' } }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'price must be greater than 0' });
    expect(logItemPriceMock).not.toHaveBeenCalled();
  });

  it('accepts a numeric STRING, coercing it via Number()', async () => {
    const res = await POST(makeReq({ body: { price: '250' } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(priceState.calls[0]).toEqual({ id: OID, price: 250, store: '' });
  });
});

describe('store passthrough', () => {
  it('forwards a string store verbatim (no trim in the route)', async () => {
    const res = await POST(makeReq({ body: { price: 90, store: '  skroutz.gr  ' } }), ctx(OID));
    expect(res.status).toBe(200);
    // The route passes store as-is; the action is responsible for trimming/defaulting.
    expect(priceState.calls[0]).toEqual({ id: OID, price: 90, store: '  skroutz.gr  ' });
  });

  it('collapses a non-string store to empty string', async () => {
    const res = await POST(makeReq({ body: { price: 90, store: 123 } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(priceState.calls[0].store).toBe('');
  });
});

describe('happy path + action failure remap', () => {
  it('logs the price and returns { ok: true }', async () => {
    const res = await POST(makeReq({ body: { price: 543.21, store: 'eu' } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(logItemPriceMock).toHaveBeenCalledOnce();
    expect(priceState.calls[0]).toEqual({ id: OID, price: 543.21, store: 'eu' });
  });

  it('a logItemPrice failure becomes a 400 carrying its error message', async () => {
    priceState.result = { ok: false, error: 'Item not found' };
    const res = await POST(makeReq({ body: { price: 100 } }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Item not found' });
  });

  it("an errorless failure falls back to 'failed'", async () => {
    priceState.result = { ok: false };
    const res = await POST(makeReq({ body: { price: 100 } }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'failed' });
  });
});
