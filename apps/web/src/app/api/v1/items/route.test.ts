import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET/POST /api/v1/items is one of the ~50 REST endpoints the Expo mobile app drives.
// Its route-level logic lives NOWHERE else and would silently corrupt the mobile
// contract if it drifted:
//   - the Bearer-auth gate (withAuth → 401 without a valid token),
//   - POST validation: `title` required, status enum-defaulting to 'researching'
//     (an out-of-enum value must NOT be stored verbatim), category left a free string,
//     currentPrice defaulting to 0 via numField,
//   - GET: the status=shopping|inventory|all view → $in filter mapping, the updatedSince
//     cursor flipping withDeleted on BOTH queries (incremental sync must see soft-deleted
//     rows), the updatedAt-desc sort, and the trim() defaults + the `photo` = photos[0]
//     projection the mobile client resolves via /api/files.
// We exercise the REAL apiAuth/apiBody/apiList helpers and only mock the DB seam
// (connectDB + the User/Item models), so validation + serialization run for real.

const { connectDBMock, userFindOne, userState, itemFind, itemCount, itemCreate, findQuery, countQuery, state, settingsState, getAppSettingsMock } =
  vi.hoisted(() => {
    const state: { docs: unknown[]; total: number; lastCreate: Record<string, unknown> | null } = {
      docs: [],
      total: 0,
      lastCreate: null,
    };
    const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
    const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
    const lean = vi.fn(async () => state.docs);
    const findQuery: Record<string, unknown> = {};
    for (const m of ['sort', 'skip', 'limit', 'setOptions']) findQuery[m] = vi.fn(() => findQuery);
    findQuery.lean = lean;
    const itemFind = vi.fn(() => findQuery);
    const countQuery: Record<string, unknown> = {
      setOptions: vi.fn(() => countQuery),
      then: (resolve: (n: number) => void) => resolve(state.total),
    };
    const itemCount = vi.fn(() => countQuery);
    const itemCreate = vi.fn(async (arg: Record<string, unknown>) => {
      state.lastCreate = arg;
      return { toObject: () => ({ _id: 'newid', updatedAt: new Date('2026-07-04T00:00:00Z'), ...arg }) };
    });
    // P9: the POST route resolves the deployment's base currency before storing prices.
    const settingsState = { currency: 'EUR' } as { currency: string };
    const getAppSettingsMock = vi.fn(async () => settingsState);
    return {
      connectDBMock: vi.fn(async () => {}), userFindOne, userState, itemFind, itemCount, itemCreate,
      findQuery, countQuery, state, settingsState, getAppSettingsMock,
    };
  });

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Item', () => ({
  Item: { find: itemFind, countDocuments: itemCount, create: itemCreate },
  ITEM_STATUSES: ['researching', 'decided', 'ordered', 'received', 'installed', 'deferred'],
}));

import { GET, POST } from './route';

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

const BASE = 'http://pharos.local/api/v1/items';

function makeReq(opts: { url?: string; auth?: string | null; body?: unknown } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: opts.url ?? BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => (opts.body === undefined ? {} : opts.body),
  } as unknown as NextRequest;
}

beforeEach(() => {
  state.docs = [];
  state.total = 0;
  state.lastCreate = null;
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  settingsState.currency = 'EUR';
  vi.clearAllMocks();
  getAppSettingsMock.mockImplementation(async () => settingsState);
  for (const m of ['sort', 'skip', 'limit', 'setOptions']) (findQuery[m] as ReturnType<typeof vi.fn>).mockImplementation(() => findQuery);
  (findQuery.lean as ReturnType<typeof vi.fn>).mockImplementation(async () => state.docs);
  (countQuery.setOptions as ReturnType<typeof vi.fn>).mockImplementation(() => countQuery);
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  itemFind.mockImplementation(() => findQuery);
  itemCount.mockImplementation(() => countQuery);
});

describe('auth gate', () => {
  it('GET without a token → 401, never touches the DB', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: expect.stringContaining('Unauthorized') });
    expect(itemFind).not.toHaveBeenCalled();
  });

  it('POST with an unknown token → 401, never creates', async () => {
    userState.doc = null;
    const res = await POST(makeReq({ body: { title: 'Switch' } }));
    expect(res.status).toBe(401);
    expect(itemCreate).not.toHaveBeenCalled();
  });
});

describe('POST validation', () => {
  it('rejects a missing/blank title with 400 and no create', async () => {
    const res = await POST(makeReq({ body: { title: '   ' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'title required' });
    expect(itemCreate).not.toHaveBeenCalled();
  });

  it('creates with defaults and returns 201 + trimmed item', async () => {
    const res = await POST(makeReq({ body: { title: 'USW-Pro-XG-8-PoE' } }));
    expect(res.status).toBe(201);
    expect(state.lastCreate).toMatchObject({
      title: 'USW-Pro-XG-8-PoE',
      status: 'researching',
      category: 'other',
      currentPrice: 0,
    });
    const json = (await res.json()) as { item: { id: string; title: string; status: string } };
    expect(json.item).toMatchObject({ id: 'newid', title: 'USW-Pro-XG-8-PoE', status: 'researching' });
  });

  it('keeps a valid status and defaults an out-of-enum one to researching', async () => {
    await POST(makeReq({ body: { title: 'X', status: 'installed' } }));
    expect(state.lastCreate?.status).toBe('installed');
    await POST(makeReq({ body: { title: 'X', status: 'wishlist' } }));
    expect(state.lastCreate?.status).toBe('researching');
  });

  it('keeps a custom category verbatim (relaxed enum → free string)', async () => {
    await POST(makeReq({ body: { title: 'Drone', category: 'drone' } }));
    expect(state.lastCreate?.category).toBe('drone');
  });

  it('coerces a numeric-string currentPrice via numField', async () => {
    await POST(makeReq({ body: { title: 'X', currentPrice: '284' } }));
    expect(state.lastCreate?.currentPrice).toBe(284);
  });

  it('defaults currentPrice to 0 when unparseable', async () => {
    await POST(makeReq({ body: { title: 'X', currentPrice: 'free' } }));
    expect(state.lastCreate?.currentPrice).toBe(0);
  });
});

describe('GET listing', () => {
  it('returns the list envelope with a mapped item and trim() defaults', async () => {
    state.docs = [{ _id: 'i1', title: 'Mac mini M4', photos: ['equipment/mac.jpg'], updatedAt: new Date('2026-07-01T00:00:00Z') }];
    state.total = 5;
    const res = await GET(makeReq({ url: `${BASE}?limit=10&offset=0` }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown[]; total: number; limit: number; offset: number };
    expect(json).toMatchObject({ total: 5, limit: 10, offset: 0 });
    expect(json.data).toEqual([
      expect.objectContaining({
        id: 'i1',
        title: 'Mac mini M4',
        status: 'researching',
        category: '',
        currentPrice: 0,
        photo: 'equipment/mac.jpg', // photos[0] projection
        deleted: false,
      }),
    ]);
  });

  it('status=shopping filters on the shopping $in set', async () => {
    await GET(makeReq({ url: `${BASE}?status=shopping` }));
    expect(itemFind).toHaveBeenCalledWith({ status: { $in: ['researching', 'decided', 'ordered'] } });
  });

  it('status=inventory filters on the owned $in set', async () => {
    await GET(makeReq({ url: `${BASE}?status=inventory` }));
    expect(itemFind).toHaveBeenCalledWith({ status: { $in: ['received', 'installed'] } });
  });

  it('no status (or status=all) filters on {} (every item)', async () => {
    await GET(makeReq());
    expect(itemFind).toHaveBeenCalledWith({});
    await GET(makeReq({ url: `${BASE}?status=all` }));
    expect(itemFind).toHaveBeenCalledWith({});
  });

  it('sorts by updatedAt descending', async () => {
    await GET(makeReq());
    expect(findQuery.sort).toHaveBeenCalledWith({ updatedAt: -1 });
  });

  it('an updatedSince cursor adds the $gte filter and flips withDeleted on both queries', async () => {
    await GET(makeReq({ url: `${BASE}?updatedSince=2026-06-01T00:00:00.000Z` }));
    const filter = (itemFind.mock.calls[0] as unknown[])[0] as { updatedAt: { $gte: Date } };
    expect(filter.updatedAt.$gte).toBeInstanceOf(Date);
    expect(filter.updatedAt.$gte.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(findQuery.setOptions).toHaveBeenCalledWith({ withDeleted: true });
    expect(countQuery.setOptions).toHaveBeenCalledWith({ withDeleted: true });
  });

  it('does NOT set withDeleted without a cursor', async () => {
    await GET(makeReq());
    expect(findQuery.setOptions).not.toHaveBeenCalled();
    expect(countQuery.setOptions).not.toHaveBeenCalled();
  });

  it('maps a deletedAt into the trimmed shape as deleted:true', async () => {
    state.docs = [{ _id: 'i9', title: 'Gone', deletedAt: new Date('2026-06-30T00:00:00Z') }];
    const res = await GET(makeReq({ url: `${BASE}?updatedSince=2026-06-01T00:00:00.000Z` }));
    const json = (await res.json()) as { data: Array<{ deleted: boolean; photo: unknown }> };
    expect(json.data[0].deleted).toBe(true);
    expect(json.data[0].photo).toBe(null); // no photos → null
  });
});

// P9 multi-currency. The route reads `currentPrice` as a PRINTED figure and stores it in the
// deployment's base currency, so every roll-up downstream (net worth, insurance export,
// inventory value) can keep summing the stored number directly.
describe('POST multi-currency (P9)', () => {
  it('stores a foreign price converted, and remembers what was printed', async () => {
    const res = await POST(makeReq({ body: { title: 'Sabrent NT-P10G', currentPrice: 110, currency: 'USD', fxRate: 0.92 } }));
    expect(res.status).toBe(201);
    expect(state.lastCreate).toMatchObject({ currentPrice: 101.2, currency: 'USD', origAmount: 110, fxRate: 0.92 });
    // The mobile client needs both halves back to render the FX badge.
    expect((await res.json()).item).toMatchObject({ currentPrice: 101.2, currency: 'USD', origAmount: 110, fxRate: 0.92 });
  });

  it('never guesses a rate: a foreign price without one is stored as printed and flagged', async () => {
    const res = await POST(makeReq({ body: { title: 'Fenvi AQC113', currentPrice: 64, currency: 'USD' } }));
    expect(res.status).toBe(201);
    expect(state.lastCreate).toMatchObject({ currentPrice: 64, currency: 'USD', origAmount: 64, fxRate: 0 });
  });

  it('leaves a base-currency body byte-identical to the old single-currency behaviour', async () => {
    const res = await POST(makeReq({ body: { title: 'U7 Pro', currentPrice: 284, currency: 'EUR' } }));
    expect(res.status).toBe(201);
    expect(state.lastCreate).toMatchObject({ currentPrice: 284, currency: 'EUR', origAmount: 0, fxRate: 0 });
  });

  it('resolves against the deployment currency, not a hardcoded EUR', async () => {
    settingsState.currency = 'USD';
    await POST(makeReq({ body: { title: 'Rack shelf', currentPrice: 38, currency: 'USD', fxRate: 0.92 } }));
    // Same code as base → not foreign, so the rate is ignored and nothing is converted.
    expect(state.lastCreate).toMatchObject({ currentPrice: 38, currency: 'USD', origAmount: 0, fxRate: 0 });
  });
});
