import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST /api/v1/scan/product is the endpoint API clients (and the web shopping-list
// "snap a product" form) hit to turn an uploaded product photo into a structured, NOT-yet-saved
// item draft (name/brand/category/quantity/notes). The route is thin — the AI work lives in
// scanProductPhoto — but three route-only behaviours live NOWHERE else and a drift silently
// breaks product capture:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, BEFORE any scan call),
//   - multipart-ONLY intake: unlike scan/expense|voucher there is NO content-type dispatch —
//     the route always calls scanProductPhoto(await req.formData()), so it never touches readBody,
//   - the envelope: ok → 200 { data }; not-ok → apiError(r.error || 'Bad request') i.e. 400
//     { error } with a 'Bad request' fallback when the action returns an empty error string.
// We exercise the REAL apiAuth helpers (withAuth + apiError) and only mock the DB seam
// (@/lib/db + @/models/User for the auth lookup) and the scanProductPhoto AI action.

type ScanResult = { ok: true; data: unknown } | { ok: false; error: string };

const { connectDBMock, userFindOne, userState, scanProduct } = vi.hoisted(() => {
  const userState: { doc: unknown } = {
    doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' },
  };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const scanProduct = vi.fn<(form: FormData) => Promise<ScanResult>>(async () => ({
    ok: true,
    data: { name: 'from-photo' },
  }));
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, scanProduct };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/app/shopping-list/actions', () => ({ scanProductPhoto: scanProduct }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { POST } from './route';

const BASE = 'http://pharos.local/api/v1/scan/product';

/** Minimal NextRequest stand-in — the route reads headers.get (authorization only) and formData(). */
function makeReq(opts: { auth?: string | null; form?: FormData } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: {
      get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null),
    },
    formData: async () => opts.form ?? new FormData(),
  } as unknown as NextRequest;
}

beforeEach(() => {
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  scanProduct.mockImplementation(async (_form: FormData) => ({ ok: true as const, data: { name: 'from-photo' } }));
});

describe('auth gate', () => {
  it('no token → 401, never scans', async () => {
    const res = await POST(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(scanProduct).not.toHaveBeenCalled();
  });

  it('unknown token → 401, never scans', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
    expect(scanProduct).not.toHaveBeenCalled();
  });
});

describe('multipart intake', () => {
  it('passes the parsed form straight to scanProductPhoto', async () => {
    const form = new FormData();
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'product.jpg', { type: 'image/jpeg' }));
    const res = await POST(makeReq({ form }));
    expect(res.status).toBe(200);
    expect(scanProduct).toHaveBeenCalledOnce();
    expect(scanProduct.mock.calls[0][0]).toBe(form);
  });
});

describe('envelope', () => {
  it('ok result → 200 { data } verbatim', async () => {
    scanProduct.mockResolvedValueOnce({
      ok: true as const,
      data: { name: 'Anker 737 Power Bank', brand: 'Anker', category: 'electronics', quantity: 1, notes: '' },
    });
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { name: 'Anker 737 Power Bank', brand: 'Anker', category: 'electronics', quantity: 1, notes: '' },
    });
  });

  it('not-ok result → 400 { error } with the action message', async () => {
    scanProduct.mockResolvedValueOnce({ ok: false as const, error: 'Product photo scanning (AI) is turned off.' });
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Product photo scanning (AI) is turned off.' });
  });

  it('empty error string falls back to 400 { error: "Bad request" }', async () => {
    scanProduct.mockResolvedValueOnce({ ok: false as const, error: '' });
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Bad request' });
  });
});
