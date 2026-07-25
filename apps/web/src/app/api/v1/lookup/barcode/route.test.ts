import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET /api/v1/lookup/barcode — P17's product-lookup helper (PRODUCT_BACKLOG.md
// "Mobile barcode/QR scan → γρήγορη προσθήκη στο inventory"). The contract the
// mobile scan screen depends on, and which a drift here would silently break:
//   - Bearer-auth gate (withAuth → 401 without a valid token),
//   - a missing/blank `code` is a 400 and never reaches the lookup,
//   - a hit  → 200 { product, code },
//   - a miss → 200 { product: null } (NOT an error — "type it in by hand"),
//   - a bad GTIN → 400, but databases being down → 502 (retryable, distinct),
//   - nothing is ever written (a lookup is a read).
// The real apiAuth helper runs; only the DB seam and the network-touching
// `lookupBarcode` are mocked.

const { connectDBMock, userFindOne, userState, lookupMock } = vi.hoisted(() => {
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  return {
    connectDBMock: vi.fn(async () => {}),
    userFindOne: vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) })),
    userState,
    lookupMock: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/lib/barcodeLookup', () => ({ lookupBarcode: lookupMock }));

import { GET } from './route';

const BASE = 'http://pharos.local/api/v1/lookup/barcode';
const EAN13 = '3017620422003';

const PRODUCT = {
  name: 'Nutella',
  brand: 'Ferrero',
  category: 'Hazelnut spreads',
  quantity: '400 g',
  notes: '',
  code: EAN13,
  image: 'https://images.example/front.jpg',
  source: 'openfoodfacts',
};

function makeReq(opts: { url?: string; auth?: string | null } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: opts.url ?? `${BASE}?code=${EAN13}`,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  lookupMock.mockResolvedValue({ ok: true, product: PRODUCT, code: EAN13 });
});

describe('GET /api/v1/lookup/barcode', () => {
  it('401s without a bearer token, and never looks anything up', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('401s when the token matches no user', async () => {
    userState.doc = null;
    expect((await GET(makeReq())).status).toBe(401);
  });

  it('returns the resolved product', async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ product: PRODUCT, code: EAN13 });
    expect(lookupMock).toHaveBeenCalledWith(EAN13);
  });

  it('400s on a missing or blank code without calling the lookup', async () => {
    expect((await GET(makeReq({ url: BASE }))).status).toBe(400);
    expect((await GET(makeReq({ url: `${BASE}?code=%20%20` }))).status).toBe(400);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('reports a miss as a 200 with product:null, not an error', async () => {
    lookupMock.mockResolvedValue({ ok: true, product: null, code: EAN13 });
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ product: null, code: EAN13 });
  });

  it('400s on an invalid barcode', async () => {
    lookupMock.mockResolvedValue({ ok: false, error: 'Invalid barcode — expected a valid 8, 12, 13 or 14 digit GTIN' });
    const res = await GET(makeReq({ url: `${BASE}?code=123` }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid barcode/);
  });

  it('502s (retryable) when the product databases are unreachable', async () => {
    lookupMock.mockResolvedValue({ ok: false, error: 'Product databases unreachable (ENOTFOUND)' });
    const res = await GET(makeReq());
    expect(res.status).toBe(502);
  });

  it('500s cleanly if the lookup throws', async () => {
    lookupMock.mockRejectedValue(new Error('kaboom'));
    expect((await GET(makeReq())).status).toBe(500);
  });
});
