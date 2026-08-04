import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET/PATCH/DELETE /api/v1/items/:id backs the mobile item-detail screen (the richest single
// record in the Expo app). Two pieces of logic live ONLY in this route, so a drift here silently
// corrupts the mobile contract with no other test to catch it:
//
//   1. GET's priceStatus() — a server-side mirror of components/PricePanel.tsx that turns links +
//      priceHistory + targetPrice into one price picture: best-now (cheapest priced link, else
//      currentPrice), lowest/highest seen, trend (last vs previous history point), a where-to-buy
//      list sorted cheapest-first, and a single verdict (deal / dropping / rising / good / high /
//      none). The verdict thresholds (target hit → deal; pos<=0.15 → good; pos>=0.7 → high) are
//      the exact values the mobile badge reads, so we pin each branch.
//
//   2. PATCH's partial coercion, where two fields diverge deliberately:
//        - currentPrice is only written when it is a real `number` (a numeric STRING is ignored),
//        - targetPrice is key-presence driven (`'targetPrice' in b`): sending it null CLEARS it,
//          sending 0 keeps 0 (falsy-but-not-null), sending a numeric string coerces via Number().
//      A regression that aligned the two (e.g. `if (b.targetPrice)`) would silently drop a target
//      clear or a target of 0. DELETE is a SOFT delete ($set deletedAt), unlike cards' hard delete.
//
// We run the REAL apiAuth/apiBody/apiList helpers and mock only the DB seam.

const { connectDBMock, userFindOne, userState, itemFindById, findByIdState, itemUpdate, updateState, settingsState, getAppSettingsMock } = vi.hoisted(() => {
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  // Item.findById(id).lean() → GET detail doc
  const findByIdState: { calls: string[]; doc: unknown } = { calls: [], doc: null };
  const itemFindById = vi.fn((id: string) => {
    findByIdState.calls.push(id);
    return { lean: async () => findByIdState.doc };
  });
  // Item.findByIdAndUpdate(id, update, opts).lean() → PATCH + DELETE (soft) both use this
  const updateState: { calls: Array<{ id: string; update: unknown; opts: unknown }>; doc: unknown } = { calls: [], doc: { _id: 'i1', title: 'X' } };
  const itemUpdate = vi.fn((id: string, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { lean: async () => updateState.doc };
  });
  // P9: a PATCH that touches a money field re-reads the doc and resolves against this.
  const settingsState = { currency: 'EUR' } as { currency: string };
  const getAppSettingsMock = vi.fn(async () => settingsState);
  return {
    connectDBMock: vi.fn(async () => {}), userFindOne, userState, itemFindById, findByIdState,
    itemUpdate, updateState, settingsState, getAppSettingsMock,
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Item', () => ({
  Item: { findById: itemFindById, findByIdAndUpdate: itemUpdate },
  ITEM_STATUSES: ['researching', 'decided', 'ordered', 'received', 'installed', 'deferred'],
}));

import { GET, PATCH, DELETE } from './route';

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

const OID = '507f1f77bcf86cd799439011'; // a well-formed 24-hex ObjectId
const BASE = `http://pharos.local/api/v1/items/${OID}`;

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

/** A minimal well-formed item detail doc; override per-test. */
function itemDoc(over: Record<string, unknown> = {}) {
  return { _id: 'i1', title: 'Test Item', ...over };
}

beforeEach(() => {
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  findByIdState.calls = [];
  findByIdState.doc = null;
  updateState.calls = [];
  updateState.doc = { _id: 'i1', title: 'X' };
  settingsState.currency = 'EUR';
  vi.clearAllMocks();
  getAppSettingsMock.mockImplementation(async () => settingsState);
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  itemFindById.mockImplementation((id: string) => {
    findByIdState.calls.push(id);
    return { lean: async () => findByIdState.doc };
  });
  itemUpdate.mockImplementation((id: string, update: unknown, opts: unknown) => {
    updateState.calls.push({ id, update, opts });
    return { lean: async () => updateState.doc };
  });
});

describe('auth gate', () => {
  it('GET without a token → 401, never queries', async () => {
    const res = await GET(makeReq({ auth: null }), ctx(OID));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: expect.stringContaining('Unauthorized') });
    expect(itemFindById).not.toHaveBeenCalled();
  });

  it('PATCH with an unknown token → 401, never writes', async () => {
    userState.doc = null;
    const res = await PATCH(makeReq({ auth: 'Bearer bad', body: { title: 'X' } }), ctx(OID));
    expect(res.status).toBe(401);
    expect(itemUpdate).not.toHaveBeenCalled();
  });
});

describe('id guard', () => {
  it('GET with a malformed id → 400 bad id, no query', async () => {
    const res = await GET(makeReq(), ctx('not-an-id'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(itemFindById).not.toHaveBeenCalled();
  });

  it('PATCH with a malformed id → 400 bad id, no write', async () => {
    const res = await PATCH(makeReq({ body: { title: 'X' } }), ctx('123'));
    expect(res.status).toBe(400);
    expect(itemUpdate).not.toHaveBeenCalled();
  });

  it('DELETE with a malformed id → 400 bad id, no write', async () => {
    const res = await DELETE(makeReq(), ctx('bad'));
    expect(res.status).toBe(400);
    expect(itemUpdate).not.toHaveBeenCalled();
  });
});

describe('GET serialization', () => {
  it('returns 404 when the item is missing', async () => {
    findByIdState.doc = null;
    const res = await GET(makeReq(), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('fills defaults, maps links (label ""/price null), and exposes photo = photos[0]', async () => {
    findByIdState.doc = itemDoc({
      photos: ['/a.jpg', '/b.jpg'],
      links: [{ url: 'https://skroutz.gr/x' }], // no label, no price
    });
    const res = await GET(makeReq(), ctx(OID));
    const { item } = await res.json();
    expect(item.id).toBe('i1');
    expect(item.status).toBe('researching');
    expect(item.category).toBe('');
    expect(item.currentPrice).toBe(0);
    expect(item.targetPrice).toBeNull();
    expect(item.photo).toBe('/a.jpg');
    expect(item.links).toEqual([{ label: '', url: 'https://skroutz.gr/x', price: null }]);
  });

  it('maps attachments (path/name/mimeType/size/uploadedAt) and defaults to [] when absent', async () => {
    findByIdState.doc = itemDoc({
      attachments: [
        { path: 'equipment/manual.pdf', name: 'Manual.pdf', mimeType: 'application/pdf', size: 12345, uploadedAt: '2026-05-01T00:00:00.000Z' },
      ],
    });
    const res = await GET(makeReq(), ctx(OID));
    const { item } = await res.json();
    expect(item.attachments).toEqual([
      { path: 'equipment/manual.pdf', name: 'Manual.pdf', mimeType: 'application/pdf', size: 12345, uploadedAt: '2026-05-01T00:00:00.000Z' },
    ]);
  });

  it('attachments default to [] when the doc has none', async () => {
    findByIdState.doc = itemDoc();
    const res = await GET(makeReq(), ctx(OID));
    const { item } = await res.json();
    expect(item.attachments).toEqual([]);
  });

  it('sorts priceHistory newest-first and emits ISO dates', async () => {
    findByIdState.doc = itemDoc({
      priceHistory: [
        { price: 100, store: 'a', date: '2026-01-01T00:00:00.000Z' },
        { price: 80, store: 'b', date: '2026-03-01T00:00:00.000Z' },
        { price: 90, store: 'c', date: '2026-02-01T00:00:00.000Z' },
      ],
    });
    const res = await GET(makeReq(), ctx(OID));
    const { item } = await res.json();
    expect(item.priceHistory.map((h: { store: string }) => h.store)).toEqual(['b', 'c', 'a']);
    expect(item.priceHistory[0].date).toBe('2026-03-01T00:00:00.000Z');
  });
});

describe('GET priceStatus (the mobile PricePanel picture)', () => {
  it('where-to-buy lists only priced links, cheapest first; best-now = cheapest link', async () => {
    findByIdState.doc = itemDoc({
      currentPrice: 500,
      links: [
        { label: 'gr', url: 'https://kotsovolos.gr/x', price: 120 },
        { label: 'eu', url: 'https://eu.store.ui.com/x', price: 90 },
        { url: 'https://noprice.gr/x' }, // no price → excluded from stores
      ],
    });
    const res = await GET(makeReq(), ctx(OID));
    const { price } = (await res.json()).item;
    expect(price.stores.map((s: { store: string }) => s.store)).toEqual(['eu', 'gr']);
    expect(price.bestNow).toEqual({ price: 90, store: 'eu', url: 'https://eu.store.ui.com/x' });
  });

  it('falls back to currentPrice for best-now when no link carries a price', async () => {
    findByIdState.doc = itemDoc({ currentPrice: 250, links: [{ url: 'https://x.gr/y' }] });
    const res = await GET(makeReq(), ctx(OID));
    const { price } = (await res.json()).item;
    expect(price.stores).toEqual([]);
    expect(price.bestNow).toEqual({ price: 250, store: '', url: null });
  });

  it('verdict = deal when best-now is at or below target', async () => {
    findByIdState.doc = itemDoc({ currentPrice: 130, targetPrice: 120, links: [{ label: 's', url: 'https://s.gr/x', price: 100 }] });
    const { item } = await (await GET(makeReq(), ctx(OID))).json();
    expect(item.price.verdict).toBe('deal');
    expect(item.price.target).toBe(120);
  });

  it('verdict = dropping when the last history point is below the previous (no target)', async () => {
    findByIdState.doc = itemDoc({
      currentPrice: 80,
      priceHistory: [
        { price: 100, store: 'a', date: '2026-01-01' },
        { price: 80, store: 'a', date: '2026-02-01' },
      ],
    });
    const { item } = await (await GET(makeReq(), ctx(OID))).json();
    expect(item.price.trend).toBe(-20);
    expect(item.price.verdict).toBe('dropping');
  });

  it('verdict = rising when the last history point is above the previous', async () => {
    findByIdState.doc = itemDoc({
      currentPrice: 120,
      priceHistory: [
        { price: 100, store: 'a', date: '2026-01-01' },
        { price: 120, store: 'a', date: '2026-02-01' },
      ],
    });
    const { item } = await (await GET(makeReq(), ctx(OID))).json();
    expect(item.price.trend).toBe(20);
    expect(item.price.verdict).toBe('rising');
  });

  it('verdict = good when flat and best-now sits at the low end (pos ≤ 0.15)', async () => {
    findByIdState.doc = itemDoc({
      links: [{ label: 's', url: 'https://s.gr/x', price: 100 }],
      priceHistory: [
        { price: 200, store: 'a', date: '2026-01-01' },
        { price: 100, store: 'a', date: '2026-02-01' },
        { price: 100, store: 'a', date: '2026-03-01' }, // last two equal → trend 0
      ],
    });
    const { item } = await (await GET(makeReq(), ctx(OID))).json();
    expect(item.price.trend).toBe(0);
    expect(item.price.verdict).toBe('good');
  });

  it('verdict = high when flat and best-now sits at the top end (pos ≥ 0.7)', async () => {
    findByIdState.doc = itemDoc({
      links: [{ label: 's', url: 'https://s.gr/x', price: 190 }],
      priceHistory: [
        { price: 100, store: 'a', date: '2026-01-01' },
        { price: 100, store: 'a', date: '2026-02-01' }, // trend 0
      ],
    });
    const { item } = await (await GET(makeReq(), ctx(OID))).json();
    expect(item.price.verdict).toBe('high');
  });

  it('verdict = none when there is no price signal at all', async () => {
    findByIdState.doc = itemDoc({ currentPrice: 0, links: [], priceHistory: [] });
    const { item } = await (await GET(makeReq(), ctx(OID))).json();
    expect(item.price.bestNow).toBeNull();
    expect(item.price.verdict).toBe('none');
  });
});

describe('PATCH', () => {
  it('rejects an empty changeset with 400 no valid fields and no write', async () => {
    const res = await PATCH(makeReq({ body: {} }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no valid fields' });
    expect(itemUpdate).not.toHaveBeenCalled();
  });

  it('an all-invalid body (blank title, bad status, string price, non-array tags) → empty set → 400', async () => {
    const res = await PATCH(makeReq({ body: { title: '   ', status: 'bogus', currentPrice: '50', tags: 'a,b' } }), ctx(OID));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no valid fields' });
    expect(itemUpdate).not.toHaveBeenCalled();
  });

  // NOTE (P9): a body touching ANY money field re-reads the doc so the whole price set can be
  // re-resolved together, and the $set therefore also carries the resolved currency/origAmount/
  // fxRate. On a base-currency deployment those are the inert values (base code, 0, 0) and the
  // prices themselves are written unchanged, so the pre-P9 contract still holds.
  it('builds a whitelisted $set: title trim, status enum, category/specs, numeric price, tags stringified', async () => {
    findByIdState.doc = itemDoc({ currentPrice: 200, purchasedPrice: null, targetPrice: 250 });
    updateState.doc = { _id: 'i1', title: 'Ubiquiti U7 Pro', status: 'ordered', category: 'network', currentPrice: 284, targetPrice: 250 };
    const res = await PATCH(makeReq({ body: { title: '  Ubiquiti U7 Pro  ', status: 'ordered', category: 'network', specs: 'WiFi 7', currentPrice: 284, tags: [1, 'wifi', true] } }), ctx(OID));
    expect(res.status).toBe(200);
    const { id, update, opts } = updateState.calls[0];
    expect(id).toBe(OID);
    expect(update).toEqual({
      $set: {
        title: 'Ubiquiti U7 Pro', status: 'ordered', category: 'network', specs: 'WiFi 7',
        tags: ['1', 'wifi', 'true'],
        currentPrice: 284, purchasedPrice: null, targetPrice: 250,
        currency: 'EUR', origAmount: 0, fxRate: 0,
      },
    });
    expect(opts).toEqual({ new: true });
    const { item } = await res.json();
    expect(item).toEqual({ id: 'i1', title: 'Ubiquiti U7 Pro', status: 'ordered', category: 'network', currentPrice: 284, targetPrice: 250, currency: '', origAmount: 0, fxRate: 0, updatedAt: null });
  });

  it('ignores currentPrice when it is a numeric STRING (only real numbers are written)', async () => {
    findByIdState.doc = itemDoc({ currentPrice: 111, targetPrice: null });
    const res = await PATCH(makeReq({ body: { title: 'Keep', currentPrice: '999' } }), ctx(OID));
    expect(res.status).toBe(200);
    // A non-number currentPrice is not a money touch at all, so no re-read and no FX fields.
    expect(updateState.calls[0].update).toEqual({ $set: { title: 'Keep' } });
    expect(findByIdState.calls).toEqual([]);
  });

  it('clears the target: { targetPrice: null } is a legitimate lone write (key-presence, not truthiness)', async () => {
    findByIdState.doc = itemDoc({ currentPrice: 100, purchasedPrice: null, targetPrice: 80 });
    const res = await PATCH(makeReq({ body: { targetPrice: null } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(updateState.calls[0].update).toMatchObject({ $set: { targetPrice: null } });
  });

  it('keeps a target of 0 (falsy but not null) rather than dropping it', async () => {
    findByIdState.doc = itemDoc({ currentPrice: 100, purchasedPrice: null, targetPrice: null });
    const res = await PATCH(makeReq({ body: { targetPrice: 0 } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(updateState.calls[0].update).toMatchObject({ $set: { targetPrice: 0 } });
  });

  it('coerces a numeric-string target via Number()', async () => {
    findByIdState.doc = itemDoc({ currentPrice: 100, purchasedPrice: null, targetPrice: null });
    const res = await PATCH(makeReq({ body: { targetPrice: '199.5' } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(updateState.calls[0].update).toMatchObject({ $set: { targetPrice: 199.5 } });
  });

  it('returns 404 when the item does not exist (write still attempted)', async () => {
    updateState.doc = null;
    const res = await PATCH(makeReq({ body: { title: 'Ghost' } }), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
    expect(itemUpdate).toHaveBeenCalledOnce();
  });
});

describe('DELETE', () => {
  it('soft-deletes via $set deletedAt (recoverable), returns { ok, id }', async () => {
    const res = await DELETE(makeReq(), ctx(OID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: OID });
    const { id, update, opts } = updateState.calls[0];
    expect(id).toBe(OID);
    // SOFT delete (regression guard: a hard findByIdAndDelete would lose Trash recovery).
    expect((update as { $set: { deletedAt: unknown } }).$set.deletedAt).toBeInstanceOf(Date);
    expect(opts).toEqual({ new: true });
  });

  it('returns 404 when the item does not exist', async () => {
    updateState.doc = null;
    const res = await DELETE(makeReq(), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });
});

// P9 multi-currency. The stored prices are ALWAYS base currency, so a PATCH that touches any
// money field must re-resolve the WHOLE set from the current doc — otherwise a partial update
// (rate-only, currency-only, price-only) leaves the record half-converted, which is exactly the
// silent-corruption class this feature exists to prevent.
describe('PATCH multi-currency (P9)', () => {
  it('converts a printed price with the supplied rate and records both halves', async () => {
    findByIdState.doc = itemDoc({ currentPrice: 110, purchasedPrice: null, targetPrice: null });
    const res = await PATCH(makeReq({ body: { currentPrice: 110, currency: 'USD', fxRate: 0.92 } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(updateState.calls[0].update).toMatchObject({
      $set: { currentPrice: 101.2, currency: 'USD', origAmount: 110, fxRate: 0.92 },
    });
  });

  it('re-converts the OTHER price fields too, so a record never mixes two currencies', async () => {
    // Item already stored at 0.9: printed 100/88/80 → stored 90/79.2/72.
    findByIdState.doc = itemDoc({ currentPrice: 90, purchasedPrice: 79.2, targetPrice: 72, currency: 'USD', fxRate: 0.9 });
    const res = await PATCH(makeReq({ body: { fxRate: 0.5 } }), ctx(OID));
    expect(res.status).toBe(200);
    // The new rate applies to the PRINTED figures, not on top of the old conversion.
    expect(updateState.calls[0].update).toMatchObject({
      $set: { currentPrice: 50, purchasedPrice: 44, targetPrice: 40, currency: 'USD', origAmount: 88, fxRate: 0.5 },
    });
  });

  it('a rate-only PATCH does not compound onto an already-converted amount', async () => {
    findByIdState.doc = itemDoc({ currentPrice: 92, purchasedPrice: null, targetPrice: null, currency: 'USD', fxRate: 0.92 });
    await PATCH(makeReq({ body: { fxRate: 0.92 } }), ctx(OID));
    // Re-sending the SAME rate must be a no-op, not 92 * 0.92.
    expect(updateState.calls[0].update).toMatchObject({ $set: { currentPrice: 92, origAmount: 100, fxRate: 0.92 } });
  });

  it('switching a foreign item back to base currency restores the printed figures', async () => {
    findByIdState.doc = itemDoc({ currentPrice: 92, purchasedPrice: null, targetPrice: null, currency: 'USD', fxRate: 0.92 });
    await PATCH(makeReq({ body: { currency: 'EUR' } }), ctx(OID));
    expect(updateState.calls[0].update).toMatchObject({
      $set: { currentPrice: 100, currency: 'EUR', origAmount: 0, fxRate: 0 },
    });
  });

  it('never guesses a rate: currency without one keeps the printed price and flags it', async () => {
    findByIdState.doc = itemDoc({ currentPrice: 64, purchasedPrice: null, targetPrice: null });
    await PATCH(makeReq({ body: { currency: 'USD' } }), ctx(OID));
    expect(updateState.calls[0].update).toMatchObject({
      $set: { currentPrice: 64, currency: 'USD', origAmount: 64, fxRate: 0 },
    });
  });

  it('404s when a money PATCH targets a missing item, without writing', async () => {
    findByIdState.doc = null;
    const res = await PATCH(makeReq({ body: { currentPrice: 10 } }), ctx(OID));
    expect(res.status).toBe(404);
    expect(itemUpdate).not.toHaveBeenCalled();
  });

  it('accepts currency/fxRate as the ONLY fields (they alone are a valid PATCH)', async () => {
    findByIdState.doc = itemDoc({ currentPrice: 100, purchasedPrice: null, targetPrice: null });
    const res = await PATCH(makeReq({ body: { currency: 'USD', fxRate: 0.92 } }), ctx(OID));
    expect(res.status).toBe(200);
  });

  it('skips the extra read entirely for a body with no money fields', async () => {
    const res = await PATCH(makeReq({ body: { title: 'Renamed' } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(findByIdState.calls).toEqual([]);
    expect(updateState.calls[0].update).toEqual({ $set: { title: 'Renamed' } });
  });
});
