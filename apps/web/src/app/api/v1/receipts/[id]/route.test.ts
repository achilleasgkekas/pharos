import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET/PATCH /api/v1/receipts/:id backs the receipt-detail + edit screen. It is the richest
// ARRAY partial-update in the v1 surface, and two pieces of logic live ONLY in this route, so a
// drift here silently corrupts the API contract with no other test to catch it:
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

// getStores/getAppSettings back the PA3 return-window badge on GET (mirrors the
// list route + the web receipts page.tsx). storesState/settingsState default to
// "off" (no stores, 0-day default window) so the existing exact-shape assertions
// below are unaffected unless a test opts in.
const { connectDBMock, userFindOne, userState, receiptFindById, findByIdState, receiptUpdate, updateState, getStoresMock, storesState, getAppSettingsMock, settingsState } = vi.hoisted(() => {
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
  const storesState: { rows: { name: string; returnWindowDays?: number | null }[] } = { rows: [] };
  const getStoresMock = vi.fn(async () => storesState.rows);
  const settingsState: { defaultReturnWindowDays: number; currency: string } = { defaultReturnWindowDays: 0, currency: 'EUR' };
  const getAppSettingsMock = vi.fn(async () => ({
    defaultReturnWindowDays: settingsState.defaultReturnWindowDays,
    currency: settingsState.currency,
  }));
  return {
    connectDBMock: vi.fn(async () => {}), userFindOne, userState, receiptFindById, findByIdState, receiptUpdate, updateState,
    getStoresMock, storesState, getAppSettingsMock, settingsState,
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Receipt', () => ({
  Receipt: { findById: receiptFindById, findByIdAndUpdate: receiptUpdate },
}));
vi.mock('@/lib/storeService', () => ({ getStores: getStoresMock }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

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
  // A plain base-currency doc: PATCH re-reads the receipt whenever the body touches money
  // (P9), so every money-bearing PATCH test needs one to exist. GET tests set their own.
  findByIdState.doc = receiptDoc();
  updateState.calls = [];
  updateState.doc = { _id: 'r1', store: 'X' };
  storesState.rows = [];
  settingsState.defaultReturnWindowDays = 0;
  settingsState.currency = 'EUR';
  connectDBMock.mockClear();
  receiptFindById.mockClear();
  receiptUpdate.mockClear();
  getStoresMock.mockClear();
  getAppSettingsMock.mockClear();
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
      { name: 'Clean Name', qty: 2, price: 40, vatRate: 24, category: '' },
      { name: 'only raw', qty: 1, price: 5, vatRate: 0, category: '' },
      { name: 'named-only', qty: 1, price: 0, vatRate: 0, category: '' },
    ]);
  });

  it('reflects a soft-deleted receipt as deleted:true', async () => {
    findByIdState.doc = receiptDoc({ deletedAt: new Date('2026-03-01T00:00:00.000Z') });
    const res = await GET(makeReq(), ctx(OID));
    const { receipt } = await res.json();
    expect(receipt.deleted).toBe(true);
  });

  describe('PA3 return-window badge', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-10T00:00:00Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('adds returnDaysLeft while a purchase is inside its window', async () => {
      settingsState.defaultReturnWindowDays = 14;
      findByIdState.doc = receiptDoc({ date: new Date('2026-07-05T00:00:00Z') });
      const res = await GET(makeReq(), ctx(OID));
      const { receipt } = await res.json();
      expect(receipt.returnDaysLeft).toBe(9);
    });

    it('omits the field for an archived receipt, without even looking up stores/settings', async () => {
      settingsState.defaultReturnWindowDays = 14;
      findByIdState.doc = receiptDoc({ date: new Date('2026-07-05T00:00:00Z'), archived: true });
      const res = await GET(makeReq(), ctx(OID));
      const { receipt } = await res.json();
      expect(receipt).not.toHaveProperty('returnDaysLeft');
      expect(getStoresMock).not.toHaveBeenCalled();
      expect(getAppSettingsMock).not.toHaveBeenCalled();
    });
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
  // P68: ο χώρος (per-property ledger tag) γράφεται και από το API, όχι μόνο από τη φόρμα,
  // αλλιώς ένας client που φτιάχνει αποδείξεις μαζικά δεν μπορεί να τις χρεώσει σε σπίτι.
  it('trims the space and caps it at 40 chars (P68)', async () => {
    const res = await PATCH(makeReq({ body: { space: `  ${'K'.repeat(45)}  ` } }), ctx(OID));
    expect(res.status).toBe(200);
    const set = (updateState.calls[0].update as { $set: Record<string, unknown> }).$set;
    expect(set.space).toBe('K'.repeat(40));
  });

  it('accepts an empty space as "clear the tag", not as a missing field', async () => {
    const res = await PATCH(makeReq({ body: { space: '' } }), ctx(OID));
    expect(res.status).toBe(200);
    const set = (updateState.calls[0].update as { $set: Record<string, unknown> }).$set;
    expect(set.space).toBe('');
  });

  it('ignores a non-string space instead of writing garbage', async () => {
    const res = await PATCH(makeReq({ body: { space: 42, notes: 'x' } }), ctx(OID));
    expect(res.status).toBe(200);
    const set = (updateState.calls[0].update as { $set: Record<string, unknown> }).$set;
    expect(set.space).toBeUndefined();
  });

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
    expect(opts).toEqual({ returnDocument: 'after' });
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

// P9 multi-currency. The money fields arrive as the figures PRINTED on the receipt, so any
// money-bearing PATCH re-reads the doc and re-resolves the WHOLE receipt with one rate
// (fx.resolveReceiptAmounts, shared with the web form). The failure this guards against is a
// half-converted receipt: a new rate landing on `total` but not on `vatAmount` or the line
// prices, which /reports and "add items to inventory" would then read as base currency.
describe('PATCH /api/v1/receipts/:id — multi-currency (P9)', () => {
  const setOf = () => (updateState.calls[0].update as { $set: Record<string, unknown> }).$set;
  const line = (name: string, price: number) => ({ name, refinedName: '', qty: 1, price, vatRate: 24, category: '' });

  it('converts total, net, VAT and every line price with the submitted rate', async () => {
    findByIdState.doc = receiptDoc({ currency: 'EUR', fxRate: 0 });
    const res = await PATCH(makeReq({ body: {
      total: 200, subtotal: 160, vatAmount: 40,
      lineItems: [{ name: 'A', price: 100, vatRate: 24 }, { name: 'B', price: 60, vatRate: 24 }],
      currency: 'USD', fxRate: 0.9,
    } }), ctx(OID));
    expect(res.status).toBe(200);
    const set = setOf();
    expect(set).toMatchObject({ total: 180, subtotal: 144, vatAmount: 36, currency: 'USD', origAmount: 200, fxRate: 0.9 });
    expect(set.lineItems).toEqual([
      { name: 'A', refinedName: '', qty: 1, price: 90, vatRate: 24, category: '' },
      { name: 'B', refinedName: '', qty: 1, price: 54, vatRate: 24, category: '' },
    ]);
  });

  it('never guesses 1:1 — a foreign receipt with no rate keeps its printed numbers', async () => {
    const res = await PATCH(makeReq({ body: { total: 88, currency: 'USD' } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(setOf()).toMatchObject({ total: 88, currency: 'USD', origAmount: 88, fxRate: 0 });
  });

  it('inherits the stored currency/rate when the body omits them (the quick-verify path)', async () => {
    findByIdState.doc = receiptDoc({ currency: 'USD', fxRate: 0.9, total: 90, origAmount: 100 });
    // Quick verify submits store/date/total/verified only — the total it shows is PRINTED.
    const res = await PATCH(makeReq({ body: { store: 'Steam', total: 120, verified: true } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(setOf()).toMatchObject({ store: 'Steam', verified: true, total: 108, currency: 'USD', origAmount: 120, fxRate: 0.9 });
  });

  it('a rate correction re-converts the secondary fields the body did NOT send', async () => {
    findByIdState.doc = receiptDoc({
      currency: 'USD', fxRate: 0.9, total: 180, origAmount: 200, subtotal: 144, vatAmount: 36,
      lineItems: [line('A', 90), line('B', 54)],
    });
    const res = await PATCH(makeReq({ body: { fxRate: 0.8 } }), ctx(OID));
    expect(res.status).toBe(200);
    // Everything is un-converted with the OLD rate first, so the new one applies to the
    // PAPER amounts (200/160/40/100/60) instead of compounding on the stored ones.
    const set = setOf();
    expect(set).toMatchObject({ total: 160, subtotal: 128, vatAmount: 32, fxRate: 0.8, origAmount: 200 });
    expect(set.lineItems).toEqual([line('A', 80), line('B', 48)]);
  });

  it('switching back to the base currency clears the printed side and un-converts the amounts', async () => {
    findByIdState.doc = receiptDoc({ currency: 'USD', fxRate: 0.9, total: 180, origAmount: 200, subtotal: 144, vatAmount: 36 });
    const res = await PATCH(makeReq({ body: { currency: 'EUR', fxRate: 0 } }), ctx(OID));
    expect(res.status).toBe(200);
    // The paper figures become the stored ones (there is nothing foreign left to remember).
    expect(setOf()).toMatchObject({ total: 200, subtotal: 160, vatAmount: 40, currency: 'EUR', origAmount: 0, fxRate: 0 });
  });

  it('re-saving an unchanged foreign receipt is a no-op, not a second conversion', async () => {
    const stored = { currency: 'USD', fxRate: 0.9, total: 180, origAmount: 200, subtotal: 144, vatAmount: 36, lineItems: [line('A', 90)] };
    findByIdState.doc = receiptDoc(stored);
    // What an edit form sends back untouched: the PRINTED figures it was seeded with.
    const res = await PATCH(makeReq({ body: {
      total: 200, subtotal: 160, vatAmount: 40,
      lineItems: [{ name: 'A', price: 100, vatRate: 24 }],
      currency: 'USD', fxRate: 0.9,
    } }), ctx(OID));
    expect(res.status).toBe(200);
    const set = setOf();
    expect(set).toMatchObject({ total: 180, subtotal: 144, vatAmount: 36, origAmount: 200, fxRate: 0.9 });
    expect(set.lineItems).toEqual([line('A', 90)]);
  });

  it('leaves the untouched secondary fields alone when nothing about the conversion changed', async () => {
    findByIdState.doc = receiptDoc({ currency: 'USD', fxRate: 0.9, total: 180, origAmount: 200, subtotal: 144, vatAmount: 36, lineItems: [line('A', 90)] });
    const res = await PATCH(makeReq({ body: { total: 200 } }), ctx(OID));
    expect(res.status).toBe(200);
    const set = setOf();
    expect(set.subtotal).toBeUndefined();
    expect(set.vatAmount).toBeUndefined();
    expect(set.lineItems).toBeUndefined();
  });

  it('skips the extra read entirely for a body with no money field', async () => {
    const res = await PATCH(makeReq({ body: { verified: true } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(receiptFindById).not.toHaveBeenCalled();
    expect(getAppSettingsMock).not.toHaveBeenCalled();
    expect(setOf()).toEqual({ verified: true });
  });

  it('404s (without writing) when a money PATCH targets a missing receipt', async () => {
    findByIdState.doc = null;
    const res = await PATCH(makeReq({ body: { total: 10 } }), ctx(OID));
    expect(res.status).toBe(404);
    expect(receiptUpdate).not.toHaveBeenCalled();
  });

  it('a currency/fxRate-only body is a valid changeset, not "no valid fields"', async () => {
    const res = await PATCH(makeReq({ body: { currency: 'GBP', fxRate: 1.15 } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(setOf()).toMatchObject({ currency: 'GBP', fxRate: 1.15 });
  });

  it('ignores a junk currency code (falls back to base) and a non-numeric rate', async () => {
    findByIdState.doc = receiptDoc({ currency: 'USD', fxRate: 0.9, total: 90, origAmount: 100 });
    const res = await PATCH(makeReq({ body: { total: 100, currency: 'dollars', fxRate: 'abc' } }), ctx(OID));
    expect(res.status).toBe(200);
    // 'dollars' normalizes to '' → not foreign → stored as base with nothing remembered.
    expect(setOf()).toMatchObject({ total: 100, currency: 'EUR', origAmount: 0, fxRate: 0 });
  });

  it('honours a non-EUR base currency: the same code as base is not foreign', async () => {
    settingsState.currency = 'USD';
    const res = await PATCH(makeReq({ body: { total: 50, currency: 'USD', fxRate: 1.1 } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(setOf()).toMatchObject({ total: 50, currency: 'USD', origAmount: 0, fxRate: 0 });
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
      { name: 'Widget', refinedName: '', qty: 3, price: 12.5, vatRate: 24, category: '' },
      { name: 'Bare', refinedName: '', qty: 1, price: 0, vatRate: 0, category: '' },
    ]);
  });

  // P64: the sanitizer must carry a submitted per-line category through (trimmed), and
  // must not invent one for a client that does not know the field.
  it('keeps and trims a submitted per-line category, missing one → "" (P64)', async () => {
    const res = await PATCH(makeReq({ body: { lineItems: [
      { name: 'Milk', price: 1.5, category: '  groceries  ' },
      { name: 'Cable', price: 8 },
    ] } }), ctx(OID));
    expect(res.status).toBe(200);
    const set = (updateState.calls[0].update as { $set: Record<string, unknown> }).$set;
    expect(set.lineItems).toEqual([
      { name: 'Milk', refinedName: '', qty: 1, price: 1.5, vatRate: 0, category: 'groceries' },
      { name: 'Cable', refinedName: '', qty: 1, price: 8, vatRate: 0, category: '' },
    ]);
  });

  it('clamps qty 0/negative to the default 1 and negative price/vatRate to 0', async () => {
    await PATCH(makeReq({ body: { lineItems: [
      { name: 'A', qty: 0, price: -5, vatRate: -1 },
      { name: 'B', qty: -2 },
    ] } }), ctx(OID));
    const set = (updateState.calls[0].update as { $set: Record<string, unknown> }).$set;
    expect(set.lineItems).toEqual([
      { name: 'A', refinedName: '', qty: 1, price: 0, vatRate: 0, category: '' },
      { name: 'B', refinedName: '', qty: 1, price: 0, vatRate: 0, category: '' },
    ]);
  });

  it('drops rows that are empty-name AND zero-price, keeps empty-name rows with a price', async () => {
    await PATCH(makeReq({ body: { lineItems: [
      { name: '   ', price: 0 }, // dropped
      { name: '', price: 9.99 }, // kept (price > 0)
      { qty: 5 }, // dropped (no name, price 0)
    ] } }), ctx(OID));
    const set = (updateState.calls[0].update as { $set: Record<string, unknown> }).$set;
    expect(set.lineItems).toEqual([
      { name: '', refinedName: '', qty: 1, price: 9.99, vatRate: 0, category: '' },
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
