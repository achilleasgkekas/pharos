import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET /api/v1/receipts is one of the ~50 REST endpoints the Expo mobile app drives.
// The [id] half (and serialize's line-item normalizer) is already covered; this closes the
// collection route. It is GET-only (receipts are never created via this route — they arrive
// through upload/scan flows), so there is no POST. Its route-level logic lives NOWHERE else,
// so a drift here silently corrupts the mobile receipts list:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, before any DB touch),
//   - the store filter ({ store } only when the param is present),
//   - the archived filter: by DEFAULT hides archived ({ archived: { $ne: true } }); only
//     archived=1 drops that clause and returns everything,
//   - the projection dropping the heavy `-rawAiResponse` blob off the wire,
//   - the { date: -1 } sort + skip/limit paging,
//   - the updatedSince cursor merging $gte AND flipping withDeleted on both find and count,
//   - the trimReceipt mapping (itemCount from lineItems.length, file/thumb ?? null, deleted flag).
// We exercise the REAL apiAuth/apiList helpers and the REAL trimReceipt; only the DB seam is mocked.

// getStores/getAppSettings back the PA3 return-window badge (mirrors the web
// receipts page.tsx). settingsState.defaultReturnWindowDays defaults to 0 (off)
// so the existing exact-shape assertions below are unaffected unless a test
// opts in.
const { connectDBMock, userFindOne, userState, receiptFind, receiptCount, findQuery, countQuery, state, getStoresMock, storesState, getAppSettingsMock, settingsState } =
  vi.hoisted(() => {
    const state: { docs: unknown[]; total: number } = { docs: [], total: 0 };
    // User model — bearerUser does User.findOne(...).select(...).lean()
    const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
    const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
    // Receipt.find(filter).select('-rawAiResponse').sort().skip().limit()[.setOptions()].lean() — self-returning chain.
    const lean = vi.fn(async () => state.docs);
    const findQuery: Record<string, unknown> = {};
    for (const m of ['select', 'sort', 'skip', 'limit', 'setOptions']) findQuery[m] = vi.fn(() => findQuery);
    findQuery.lean = lean;
    const receiptFind = vi.fn(() => findQuery);
    // Receipt.countDocuments(filter) — thenable resolving to the total, self-returning setOptions.
    const countQuery: Record<string, unknown> = {
      setOptions: vi.fn(() => countQuery),
      then: (resolve: (n: number) => void) => resolve(state.total),
    };
    const receiptCount = vi.fn(() => countQuery);
    const storesState: { rows: { name: string; returnWindowDays?: number | null }[] } = { rows: [] };
    const getStoresMock = vi.fn(async () => storesState.rows);
    const settingsState: { defaultReturnWindowDays: number } = { defaultReturnWindowDays: 0 };
    const getAppSettingsMock = vi.fn(async () => ({ defaultReturnWindowDays: settingsState.defaultReturnWindowDays }));
    return {
      connectDBMock: vi.fn(async () => {}), userFindOne, userState, receiptFind, receiptCount, findQuery, countQuery, state,
      getStoresMock, storesState, getAppSettingsMock, settingsState,
    };
  });

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Receipt', () => ({ Receipt: { find: receiptFind, countDocuments: receiptCount } }));
vi.mock('@/lib/storeService', () => ({ getStores: getStoresMock }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));

import { GET } from './route';

const BASE = 'http://pharos.local/api/v1/receipts';

/** Minimal NextRequest stand-in — the route only reads url and headers.get. */
function makeReq(opts: { url?: string; auth?: string | null } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: opts.url ?? BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
  } as unknown as NextRequest;
}

function findFilter(): Record<string, unknown> {
  return (receiptFind.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
}
function countFilter(): Record<string, unknown> {
  return (receiptCount.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
}

beforeEach(() => {
  state.docs = [];
  state.total = 0;
  storesState.rows = [];
  settingsState.defaultReturnWindowDays = 0;
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  // clearAllMocks resets return values on the chain stubs → re-point them.
  for (const m of ['select', 'sort', 'skip', 'limit', 'setOptions']) (findQuery[m] as ReturnType<typeof vi.fn>).mockImplementation(() => findQuery);
  (findQuery.lean as ReturnType<typeof vi.fn>).mockImplementation(async () => state.docs);
  (countQuery.setOptions as ReturnType<typeof vi.fn>).mockImplementation(() => countQuery);
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  receiptFind.mockImplementation(() => findQuery);
  receiptCount.mockImplementation(() => countQuery);
  getStoresMock.mockImplementation(async () => storesState.rows);
  getAppSettingsMock.mockImplementation(async () => ({ defaultReturnWindowDays: settingsState.defaultReturnWindowDays }));
});

describe('auth gate', () => {
  it('GET without a token → 401, never touches the DB', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(receiptFind).not.toHaveBeenCalled();
    expect(receiptCount).not.toHaveBeenCalled();
  });

  it('GET with an unknown token → 401 (bearerUser resolves to no user)', async () => {
    userState.doc = null;
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(receiptFind).not.toHaveBeenCalled();
  });
});

describe('GET listing', () => {
  it('returns the list envelope with each receipt trimmed to spec defaults', async () => {
    state.docs = [
      {
        _id: 'r1', store: 'Plaisio', date: new Date('2026-06-01T00:00:00Z'), total: 287.25, subtotal: 231.65,
        vatAmount: 55.6, currency: 'USD', paymentMethod: 'card', warrantyMonths: 24, verified: true, archived: false,
        lineItems: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], filePath: '/r.pdf', thumbPath: '/t.jpg',
        updatedAt: new Date('2026-07-01T00:00:00Z'),
      },
      { _id: 'r2', store: 'Bare' }, // near-empty doc exercises every ?? default / !! fallback
    ];
    state.total = 2;
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown>[]; total: number; limit: number; offset: number };
    expect(json).toMatchObject({ total: 2, limit: 50, offset: 0 });
    expect(json.data[0]).toEqual({
      id: 'r1', store: 'Plaisio', date: '2026-06-01T00:00:00.000Z', total: 287.25, subtotal: 231.65,
      vatAmount: 55.6, currency: 'USD', origAmount: 0, fxRate: 0, paymentMethod: 'card', warrantyMonths: 24, itemCount: 3,
      verified: true, archived: false, file: '/r.pdf', thumb: '/t.jpg',
      updatedAt: '2026-07-01T00:00:00.000Z', deleted: false,
    });
    expect(json.data[1]).toEqual({
      id: 'r2', store: 'Bare', date: null, total: 0, subtotal: 0, vatAmount: 0, currency: 'EUR',
      origAmount: 0, fxRate: 0, paymentMethod: '', warrantyMonths: 0, itemCount: 0, verified: false, archived: false,
      file: null, thumb: null, updatedAt: null, deleted: false,
    });
  });

  it('drops the rawAiResponse blob off the wire', async () => {
    await GET(makeReq());
    expect((findQuery.select as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('-rawAiResponse');
  });

  it('by default hides archived receipts (archived: { $ne: true }) on both queries', async () => {
    await GET(makeReq());
    expect(findFilter()).toEqual({ archived: { $ne: true } });
    expect(countFilter()).toEqual({ archived: { $ne: true } });
  });

  it('archived=1 drops the archived clause and returns everything', async () => {
    await GET(makeReq({ url: `${BASE}?archived=1` }));
    expect(findFilter()).toEqual({});
    expect(countFilter()).toEqual({});
  });

  it('applies the store filter alongside the archived default', async () => {
    await GET(makeReq({ url: `${BASE}?store=Plaisio` }));
    expect(findFilter()).toEqual({ store: 'Plaisio', archived: { $ne: true } });
    expect(countFilter()).toEqual({ store: 'Plaisio', archived: { $ne: true } });
  });

  it('sorts by date descending and pages with skip/limit', async () => {
    await GET(makeReq({ url: `${BASE}?limit=10&offset=20` }));
    expect((findQuery.sort as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({ date: -1 });
    expect((findQuery.skip as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(20);
    expect((findQuery.limit as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(10);
  });

  it('an updatedSince cursor adds $gte and flips withDeleted on both queries', async () => {
    await GET(makeReq({ url: `${BASE}?updatedSince=2026-07-01T00:00:00.000Z` }));
    expect(findFilter()).toEqual({ archived: { $ne: true }, updatedAt: { $gte: new Date('2026-07-01T00:00:00.000Z') } });
    expect(countFilter()).toEqual({ archived: { $ne: true }, updatedAt: { $gte: new Date('2026-07-01T00:00:00.000Z') } });
    expect(findQuery.setOptions as ReturnType<typeof vi.fn>).toHaveBeenCalledWith({ withDeleted: true });
    expect(countQuery.setOptions as ReturnType<typeof vi.fn>).toHaveBeenCalledWith({ withDeleted: true });
  });

  it('without a cursor never calls setOptions (soft-deletes stay hidden)', async () => {
    await GET(makeReq());
    expect(findQuery.setOptions as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    expect(countQuery.setOptions as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('flags a soft-deleted receipt with deleted:true on an incremental read', async () => {
    state.docs = [{ _id: 'r3', store: 'Gone', deletedAt: new Date('2026-07-05T00:00:00Z') }];
    state.total = 1;
    const res = await GET(makeReq({ url: `${BASE}?updatedSince=2026-07-01T00:00:00.000Z` }));
    const json = (await res.json()) as { data: { deleted: boolean }[] };
    expect(json.data[0].deleted).toBe(true);
  });
});

// PA3 return-window badge (mirrors apps/web/src/app/receipts/page.tsx): the field
// is entirely additive — omitted (not present, not null) whenever it doesn't apply.
describe('PA3 return-window badge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('adds returnDaysLeft when a global default window applies', async () => {
    settingsState.defaultReturnWindowDays = 14;
    state.docs = [{ _id: 'r1', store: 'Plaisio', date: new Date('2026-07-05T00:00:00Z') }];
    state.total = 1;
    const res = await GET(makeReq());
    const json = (await res.json()) as { data: { returnDaysLeft?: number }[] };
    expect(json.data[0].returnDaysLeft).toBe(9);
  });

  it('a per-store override wins over the global default', async () => {
    settingsState.defaultReturnWindowDays = 14;
    storesState.rows = [{ name: 'Plaisio', returnWindowDays: 30 }];
    state.docs = [{ _id: 'r1', store: 'Plaisio', date: new Date('2026-07-05T00:00:00Z') }];
    state.total = 1;
    const res = await GET(makeReq());
    const json = (await res.json()) as { data: { returnDaysLeft?: number }[] };
    expect(json.data[0].returnDaysLeft).toBe(25);
  });

  it('omits the field once the window has closed', async () => {
    settingsState.defaultReturnWindowDays = 14;
    state.docs = [{ _id: 'r1', store: 'Plaisio', date: new Date('2026-06-01T00:00:00Z') }];
    state.total = 1;
    const res = await GET(makeReq());
    const json = (await res.json()) as { data: Record<string, unknown>[] };
    expect(json.data[0]).not.toHaveProperty('returnDaysLeft');
  });

  it('omits the field for archived receipts even inside the window', async () => {
    settingsState.defaultReturnWindowDays = 14;
    state.docs = [{ _id: 'r1', store: 'Plaisio', date: new Date('2026-07-05T00:00:00Z'), archived: true }];
    state.total = 1;
    const res = await GET(makeReq({ url: `${BASE}?archived=1` }));
    const json = (await res.json()) as { data: Record<string, unknown>[] };
    expect(json.data[0]).not.toHaveProperty('returnDaysLeft');
  });

  it('skips the cross-doc lookups entirely on an incremental (updatedSince) sync', async () => {
    settingsState.defaultReturnWindowDays = 14;
    state.docs = [{ _id: 'r1', store: 'Plaisio', date: new Date('2026-07-05T00:00:00Z') }];
    state.total = 1;
    await GET(makeReq({ url: `${BASE}?updatedSince=2026-07-01T00:00:00.000Z` }));
    expect(getStoresMock).not.toHaveBeenCalled();
    expect(getAppSettingsMock).not.toHaveBeenCalled();
  });
});
