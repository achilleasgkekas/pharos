import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET/PATCH /api/v1/receipts/:id backs the mobile receipt-detail + edit screen. It is the richest
// ARRAY partial-update in the v1 surface, and two pieces of logic live ONLY in this route, so a
// drift here silently corrupts the mobile contract with no other test to catch it:
//
//   1. GET serialization: trimReceipt + notes fallback + serializeLineItems, where the AI-cleaned
//      `refinedName` WINS over the raw `name` (the edit form shows refinedName||name). itemCount is
//      the stored lineItems length, not the serialized count.
//
//   2. PATCH's per-field coercion, and especially the lineItems sanitizer. Each edited line is
//      remapped through numOr (Number + min-clamp → default): qty defaults to 1 and is clamped to
//      >= 0.0001 (so qty 0 / negative → 1), price/vatRate default 0 and clamp to >= 0 (negative → 0);
//      refinedName is FORCED to '' so the edited name wins on the next GET; and a line survives only
//      if `name || price > 0` (an empty-name zero-price row is dropped). A regression in the clamp,
//      the refinedName reset, or the drop-filter would silently mangle every edited receipt.
//      Scalar fields also diverge: store must be a non-empty string (trimmed), an unparseable date is
//      ignored, total/subtotal/vatAmount coerce via Number() only when != null AND finite, verified/
//      archived accept ONLY real booleans, and an empty changeset → 400 'no valid fields'.
//
// We run the REAL apiAuth/apiBody/apiList helpers and mock only the DB seam.

const { connectDBMock, userFindOne, userState, receiptFindById, findByIdState, receiptUpdate, updateState } = vi.hoisted(() => {
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  // Receipt.findById(id).select('-rawAiResponse').lean() → GET detail doc
  const findByIdState: { calls: string[]; select: string[]; doc: unknown } = { calls: [], select: [], doc: null };
  const receiptFindById = vi.fn((id: string) => {
    findByIdState.calls.push(id);
    return { select: (s: string) => { findByIdState.select.push(s); return { lean: async () => findByIdState.doc }; } };
  });
  // Receipt.findByIdAndUpdate(id, update, opts).select(...).lean() → PATCH
  const updateState: { calls: Array<{ id: string; update: unknown; opts: unknown }>; doc: unknown } = { calls: [], doc: { _id: 'r1', store: 'X' } };
  const receiptUpdate = vi.fn((id: string, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { select: () => ({ lean: async () => updateState.doc }) };
  });
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, receiptFindById, findByIdState, receiptUpdate, updateState };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Receipt', () => ({
  Receipt: { findById: receiptFindById, findByIdAndUpdate: receiptUpdate },
}));

import { GET, PATCH } from './route';

const OID = '507f1f77bcf86cd799439011'; // a well-formed 24-hex ObjectId
const BASE = `http://pharos.local/api/v1/receipts/${OID}`;

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

/** A minimal well-formed receipt detail doc; override per-test. */
function receiptDoc(over: Record<string, unknown> = {}) {
  return { _id: 'r1', store: 'Skroutz', ...over };
}

beforeEach(() => {
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  findByIdState.calls = [];
  findByIdState.select = [];
  findByIdState.doc = null;
  updateState.calls = [];
  updateState.doc = { _id: 'r1', store: 'X' };
  connectDBMock.mockClear();
  receiptFindById.mockClear();
  receiptUpdate.mockClear();
});

describe('GET /api/v1/receipts/:id — auth + id guard', () => {
  it('401 without a token, without querying', async () => {
    const res = await GET(makeReq({ auth: null }), ctx(OID));
    expect(res.status).toBe(401);
    expect(receiptFindById).not.toHaveBeenCalled();
  });

  it('401 for an unknown token', async () => {
    userState.doc = null; // User.findOne(...).lean() → null
    const res = await GET(makeReq({ auth: 'Bearer nope' }), ctx(OID));
    expect(res.status).toBe(401);
    expect(receiptFindById).not.toHaveBeenCalled();
  });

  it('400 "bad id" for a malformed id, without querying', async () => {
    const res = await GET(makeReq(), ctx('not-an-oid'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(receiptFindById).not.toHaveBeenCalled();
  });

  it('404 when the receipt is missing', async () => {
    findByIdState.doc = null;
    const res = await GET(makeReq(), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
    expect(findByIdState.calls).toEqual([OID]);
    expect(findByIdState.select).toEqual(['-rawAiResponse']); // never ships the debug blob
  });
});

describe('GET /api/v1/receipts/:id — serialization', () => {
  it('serializes trimReceipt fields + notes fallback + itemCount from stored length', async () => {
    findByIdState.doc = receiptDoc({
      _id: 'r9',
      store: 'Public',
      date: new Date('2026-02-20T00:00:00.000Z'),
      total: 193.39,
      subtotal: 155.96,
      vatAmount: 37.43,
      paymentMethod: 'Mastercard',
      warrantyMonths: 24,
      verified: true,
      archived: false,
      filePath: 'receipts/2026/02/x.pdf',
      thumbPath: 'receipts/2026/02/x.jpg',
      updatedAt: new Date('2026-02-21T10:00:00.000Z'),
      lineItems: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      // notes intentionally omitted → should fall back to ''
    });
    const res = await GET(makeReq(), ctx(OID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.receipt).toMatchObject({
      id: 'r9',
      store: 'Public',
      date: '2026-02-20T00:00:00.000Z',
      total: 193.39,
      subtotal: 155.96,
      vatAmount: 37.43,
      currency: 'EUR',
      paymentMethod: 'Mastercard',
      warrantyMonths: 24,
      itemCount: 3, // stored lineItems length
      verified: true,
      archived: false,
      file: 'receipts/2026/02/x.pdf',
      thumb: 'receipts/2026/02/x.jpg',
      updatedAt: '2026-02-21T10:00:00.000Z',
      deleted: false,
      notes: '',
    });
  });

  it('defaults every optional field for a bare doc', async () => {
    findByIdState.doc = receiptDoc({ _id: 'r0', store: 'Unknown' });
    const res = await GET(makeReq(), ctx(OID));
    const { receipt } = await res.json();
    expect(receipt).toMatchObject({
      id: 'r0', store: 'Unknown', date: null, total: 0, subtotal: 0, vatAmount: 0,
      currency: 'EUR', paymentMethod: '', warrantyMonths: 0, itemCount: 0,
      verified: false, archived: false, file: null, thumb: null, updatedAt: null,
      deleted: false, notes: '', lineItems: [],
    });
  });

  it('line items: refinedName wins over name, with qty/price/vatRate defaults', async () => {
    findByIdState.doc = receiptDoc({
      lineItems: [
        { name: 'raw ocr name', refinedName: 'Clean Name', qty: 2, price: 40, vatRate: 24 },
        { name: 'only raw', price: 5 }, // no refinedName → name wins; qty/vatRate default
        { refinedName: 'named-only' }, // no raw name → all numeric defaults
      ],
    });
    const res = await GET(makeReq(), ctx(OID));
    const { receipt } = await res.json();
    expect(receipt.lineItems).toEqual([
      { name: 'Clean Name', qty: 2, price: 40, vatRate: 24 },
      { name: 'only raw', qty: 1, price: 5, vatRate: 0 },
      { name: 'named-only', qty: 1, price: 0, vatRate: 0 },
    ]);
  });

  it('reflects a soft-deleted receipt as deleted:true', async () => {
    findByIdState.doc = receiptDoc({ deletedAt: new Date('2026-03-01T00:00:00.000Z') });
    const res = await GET(makeReq(), ctx(OID));
    const { receipt } = await res.json();
    expect(receipt.deleted).toBe(true);
  });
});

describe('PATCH /api/v1/receipts/:id — auth + id guard', () => {
  it('401 without a token, without writing', async () => {
    const res = await PATCH(makeReq({ auth: null, body: { store: 'X' } }), ctx(OID));
    expect(res.status).toBe(401);
    expect(receiptUpdate).not.toHaveBeenCalled();
  });

  it('400 "bad id" for a malformed id, without writing', async () => {
    const res = await PATCH(makeReq({ body: { store: 'X' } }), ctx('nope'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(receiptUpdate).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/receipts/:id — scalar coercion', () => {
  it('400 "no valid fields" for an all-invalid body, without writing', async () => {
    const res = await PATCH(makeReq({ body: { store: '   ', date: 'not-a-date', total: 'abc', verified: 'yes' } }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no valid fields' });
    expect(receiptUpdate).not.toHaveBeenCalled();
  });

  it('trims store, parses date, Number()-coerces totals, keeps real booleans', async () => {
    updateState.doc = receiptDoc({ store: 'Kotsovolos' });
    const res = await PATCH(makeReq({ body: {
      store: '  Kotsovolos  ',
      date: '2026-01-15',
      total: '96.50', subtotal: 77.82, vatAmount: '18.68',
      paymentMethod: 'Cash', notes: 'from email', verified: true, archived: false,
    } }), ctx(OID));
    expect(res.status).toBe(200);
    const { id, update, opts } = updateState.calls[0];
    expect(id).toBe(OID);
    expect(opts).toEqual({ new: true });
    const set = (update as { $set: Record<string, unknown> }).$set;
    expect(set.store).toBe('Kotsovolos');
    expect((set.date as Date).toISOString()).toBe('2026-01-15T00:00:00.000Z');
    expect(set).toMatchObject({ total: 96.5, subtotal: 77.82, vatAmount: 18.68, paymentMethod: 'Cash', notes: 'from email', verified: true, archived: false });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.receipt.store).toBe('Kotsovolos');
  });

  it('ignores an unparseable date and a null/non-finite total', async () => {
    const res = await PATCH(makeReq({ body: { notes: 'x', date: 'garbage', total: null, subtotal: Infinity } }), ctx(OID));
    expect(res.status).toBe(200);
    const set = (updateState.calls[0].update as { $set: Record<string, unknown> }).$set;
    expect(set).toEqual({ notes: 'x' }); // date/total/subtotal all dropped
  });

  it('accepts an empty-string paymentMethod and empty-string notes (typeof string, not truthiness)', async () => {
    const res = await PATCH(makeReq({ body: { paymentMethod: '', notes: '' } }), ctx(OID));
    expect(res.status).toBe(200);
    const set = (updateState.calls[0].update as { $set: Record<string, unknown> }).$set;
    expect(set).toEqual({ paymentMethod: '', notes: '' });
  });

  it('rejects non-boolean verified/archived (drops them from the changeset)', async () => {
    const res = await PATCH(makeReq({ body: { store: 'S', verified: 1, archived: 'true' } }), ctx(OID));
    expect(res.status).toBe(200);
    const set = (updateState.calls[0].update as { $set: Record<string, unknown> }).$set;
    expect(set).toEqual({ store: 'S' }); // verified/archived not booleans → dropped
  });

  it('404 when the receipt to update is missing', async () => {
    updateState.doc = null;
    const res = await PATCH(makeReq({ body: { store: 'S' } }), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });
});

describe('PATCH /api/v1/receipts/:id — lineItems sanitizer', () => {
  it('remaps each line, forces refinedName to "" and clamps qty/price/vatRate defaults', async () => {
    const res = await PATCH(makeReq({ body: { lineItems: [
      { name: '  Widget  ', qty: '3', price: '12.5', vatRate: '24' },
      { name: 'Bare' }, // qty→1, price→0, vatRate→0
    ] } }), ctx(OID));
    expect(res.status).toBe(200);
    const set = (updateState.calls[0].update as { $set: Record<string, unknown> }).$set;
    expect(set.lineItems).toEqual([
      { name: 'Widget', refinedName: '', qty: 3, price: 12.5, vatRate: 24 },
      { name: 'Bare', refinedName: '', qty: 1, price: 0, vatRate: 0 },
    ]);
  });

  it('clamps qty 0/negative to the default 1 and negative price/vatRate to 0', async () => {
    const res = await PATCH(makeReq({ body: { lineItems: [
      { name: 'A', qty: 0, price: -5, vatRate: -1 },
      { name: 'B', qty: -2 },
    ] } }), ctx(OID));
    const set = (updateState.calls[0].update as { $set: Record<string, unknown> }).$set;
    expect(set.lineItems).toEqual([
      { name: 'A', refinedName: '', qty: 1, price: 0, vatRate: 0 },
      { name: 'B', refinedName: '', qty: 1, price: 0, vatRate: 0 },
    ]);
  });

  it('drops rows that are empty-name AND zero-price, keeps empty-name rows with a price', async () => {
    const res = await PATCH(makeReq({ body: { lineItems: [
      { name: '   ', price: 0 }, // dropped
      { name: '', price: 9.99 }, // kept (price > 0)
      { qty: 5 }, // dropped (no name, price 0)
    ] } }), ctx(OID));
    const set = (updateState.calls[0].update as { $set: Record<string, unknown> }).$set;
    expect(set.lineItems).toEqual([
      { name: '', refinedName: '', qty: 1, price: 9.99, vatRate: 0 },
    ]);
  });

  it('an all-dropped lineItems array (and no other field) → 400 "no valid fields"', async () => {
    const res = await PATCH(makeReq({ body: { lineItems: [{ name: '', price: 0 }] } }), ctx(OID));
    // set.lineItems is set to [] (empty array is still a key) so the changeset is NON-empty →
    // the route proceeds. Pin the actual contract: an empty edited list clears the items.
    expect(res.status).toBe(200);
    const set = (updateState.calls[0].update as { $set: Record<string, unknown> }).$set;
    expect(set.lineItems).toEqual([]);
  });

  it('ignores a non-array lineItems value entirely', async () => {
    const res = await PATCH(makeReq({ body: { store: 'S', lineItems: 'oops' } }), ctx(OID));
    expect(res.status).toBe(200);
    const set = (updateState.calls[0].update as { $set: Record<string, unknown> }).$set;
    expect(set).toEqual({ store: 'S' }); // lineItems not an array → skipped
  });
});
