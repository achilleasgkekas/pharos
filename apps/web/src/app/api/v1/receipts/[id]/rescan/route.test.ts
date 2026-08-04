import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST /api/v1/receipts/:id/rescan backs the "re-scan" button on the receipt
// detail screen. It is a thin wrapper around the shared `rescanReceipt` action (its
// AI-parse/OCR logic is exercised elsewhere), but the ROUTE owns three pieces of logic
// with no other test coverage:
//
//   1. `useOcr = b.ocr === true` — STRICT boolean equality. Only the literal boolean
//      `true` forces OCR; a truthy-but-non-boolean ('true', 1) or missing body → false.
//   2. Failure remap: `rescanReceipt` returning `{ ok:false, error }` becomes 404 when
//      the error matches /not found|missing/i (receipt/file not found), else 500. A
//      falsy/empty error falls back to 'rescan failed' (also 500, since it doesn't match).
//   3. On success, the route does a SECOND read (`Receipt.findById(id).select('-rawAiResponse').lean()`)
//      and re-serializes with the exact same trimReceipt + notes-fallback + serializeLineItems
//      shape as GET /api/v1/receipts/:id, plus aiUsed/model/aiError from the rescan result.
//      A missing doc on this second read is ITS OWN 404 'not found', independent of the
//      rescan-level failure remap.
//
// We run the REAL apiAuth/apiBody helpers and mock only the DB seam + the rescanReceipt action.

const { connectDBMock, userFindOne, userState, receiptFindById, findByIdState, rescanReceiptMock } = vi.hoisted(() => {
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const findByIdState: { calls: string[]; select: string[]; doc: unknown } = { calls: [], select: [], doc: null };
  const receiptFindById = vi.fn((id: string) => {
    findByIdState.calls.push(id);
    return { select: (s: string) => { findByIdState.select.push(s); return { lean: async () => findByIdState.doc }; } };
  });
  const rescanReceiptMock = vi.fn();
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, receiptFindById, findByIdState, rescanReceiptMock };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Receipt', () => ({ Receipt: { findById: receiptFindById } }));
vi.mock('@/app/receipts/actions', () => ({ rescanReceipt: rescanReceiptMock }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { POST } from './route';

const OID = '507f1f77bcf86cd799439011'; // a well-formed 24-hex ObjectId
const BASE = `http://pharos.local/api/v1/receipts/${OID}/rescan`;

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
  findByIdState.calls = [];
  findByIdState.select = [];
  findByIdState.doc = null;
  connectDBMock.mockClear();
  receiptFindById.mockClear();
  rescanReceiptMock.mockReset();
  rescanReceiptMock.mockResolvedValue({ ok: true, aiUsed: true, model: 'ocr+' });
});

describe('POST /api/v1/receipts/:id/rescan — auth + id guard', () => {
  it('401 without a token, without calling rescanReceipt', async () => {
    const res = await POST(makeReq({ auth: null }), ctx(OID));
    expect(res.status).toBe(401);
    expect(rescanReceiptMock).not.toHaveBeenCalled();
  });

  it('401 for an unknown token', async () => {
    userState.doc = null;
    const res = await POST(makeReq({ auth: 'Bearer nope' }), ctx(OID));
    expect(res.status).toBe(401);
    expect(rescanReceiptMock).not.toHaveBeenCalled();
  });

  it('400 "bad id" for a malformed id, without calling rescanReceipt', async () => {
    const res = await POST(makeReq(), ctx('not-an-oid'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(rescanReceiptMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/receipts/:id/rescan — ocr flag (strict boolean)', () => {
  it('ocr:true forces useOcr=true', async () => {
    findByIdState.doc = { _id: 'r1', store: 'X', lineItems: [] };
    await POST(makeReq({ body: { ocr: true } }), ctx(OID));
    expect(rescanReceiptMock).toHaveBeenCalledWith(OID, true);
  });

  it.each([
    ['missing body', undefined],
    ["truthy non-boolean string 'true'", 'true'],
    ['truthy non-boolean number 1', 1],
    ['explicit false', false],
  ])('%s → useOcr=false', async (_label, ocrVal) => {
    findByIdState.doc = { _id: 'r1', store: 'X', lineItems: [] };
    const body = ocrVal === undefined ? undefined : { ocr: ocrVal };
    await POST(makeReq({ body }), ctx(OID));
    expect(rescanReceiptMock).toHaveBeenCalledWith(OID, false);
  });
});

describe('POST /api/v1/receipts/:id/rescan — failure remap', () => {
  it('"not found" error → 404', async () => {
    rescanReceiptMock.mockResolvedValue({ ok: false, aiUsed: false, error: 'Receipt or file not found' });
    const res = await POST(makeReq(), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Receipt or file not found' });
    expect(receiptFindById).not.toHaveBeenCalled(); // no second read on failure
  });

  it('"missing" error → 404', async () => {
    rescanReceiptMock.mockResolvedValue({ ok: false, aiUsed: false, error: 'File missing from storage' });
    const res = await POST(makeReq(), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'File missing from storage' });
  });

  it('an unrelated error → 500', async () => {
    rescanReceiptMock.mockResolvedValue({ ok: false, aiUsed: false, error: 'AI parse failed' });
    const res = await POST(makeReq(), ctx(OID));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'AI parse failed' });
  });

  it('a falsy error falls back to "rescan failed" (also 500)', async () => {
    rescanReceiptMock.mockResolvedValue({ ok: false, aiUsed: false, error: undefined });
    const res = await POST(makeReq(), ctx(OID));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'rescan failed' });
  });
});

describe('POST /api/v1/receipts/:id/rescan — success re-read + serialization', () => {
  it('re-reads with -rawAiResponse and serializes trimReceipt + notes fallback + lineItems, plus aiUsed/model/aiError', async () => {
    rescanReceiptMock.mockResolvedValue({ ok: true, aiUsed: true, model: 'ocr-pdf+qwen2.5:14b', aiError: undefined });
    findByIdState.doc = {
      _id: 'r7',
      store: 'Πλαίσιο',
      date: new Date('2026-02-20T00:00:00.000Z'),
      total: 193.39,
      verified: false,
      archived: false,
      lineItems: [{ name: 'raw', refinedName: 'Clean Name', qty: 1, price: 155.96, vatRate: 24 }],
      // notes intentionally omitted → should fall back to ''
    };
    const res = await POST(makeReq({ body: { ocr: true } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(findByIdState.calls).toEqual([OID]);
    expect(findByIdState.select).toEqual(['-rawAiResponse']); // never ships the debug blob
    const body = await res.json();
    expect(body.receipt).toMatchObject({
      id: 'r7',
      store: 'Πλαίσιο',
      total: 193.39,
      notes: '',
    });
    expect(body.receipt.lineItems).toEqual([{ name: 'Clean Name', qty: 1, price: 155.96, vatRate: 24 }]);
    expect(body.aiUsed).toBe(true);
    expect(body.model).toBe('ocr-pdf+qwen2.5:14b');
    expect(body.aiError).toBeUndefined();
  });

  it('404 "not found" on the second read, independent of the rescan-level failure remap', async () => {
    rescanReceiptMock.mockResolvedValue({ ok: true, aiUsed: true, model: 'ocr+' });
    findByIdState.doc = null; // deleted between the rescan write and the re-read
    const res = await POST(makeReq(), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });
});
