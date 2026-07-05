import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET/POST /api/v1/vouchers is one of the ~50 REST endpoints the Expo mobile app drives.
// The [id] PATCH/DELETE half is already covered; this closes the pair on the collection route.
// Its route-level logic lives NOWHERE else, so a drift here silently corrupts the mobile contract:
//   - the Bearer-auth gate (withAuth → 401 without a valid token),
//   - POST: `title` required (strField trim → blank/whitespace → 400 'title required'), every
//     other string field trimmed, `expiresAt` truthiness-gated (falsy → null, else new Date),
//     and the response is the SPEC { voucher } wrapper at 201 (NOT a list envelope, NOT { ok }),
//   - GET: the `used=0` filter → { used: { $ne: true } }, the updatedSince cursor flipping on
//     withDeleted (incremental sync must see soft-deleted rows), the { expiresAt: 1 } sort, the
//     list envelope shape, and the trim() defaults (code/store/discount/url/notes '', used false).
// We exercise the REAL apiAuth/apiBody/apiList helpers and only mock the DB seam.

const { connectDBMock, userFindOne, userState, voucherFind, voucherCount, voucherCreate, findQuery, countQuery, state } =
  vi.hoisted(() => {
    const state: { docs: unknown[]; total: number; lastCreate: Record<string, unknown> | null } = {
      docs: [],
      total: 0,
      lastCreate: null,
    };
    // User model — bearerUser does User.findOne(...).select(...).lean()
    const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
    const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
    // Voucher.find(filter).sort().skip().limit()[.setOptions()].lean() — a self-returning chain.
    const lean = vi.fn(async () => state.docs);
    const findQuery: Record<string, unknown> = {};
    for (const m of ['sort', 'skip', 'limit', 'setOptions']) findQuery[m] = vi.fn(() => findQuery);
    findQuery.lean = lean;
    const voucherFind = vi.fn(() => findQuery);
    // Voucher.countDocuments(filter) — thenable resolving to the total, self-returning setOptions.
    const countQuery: Record<string, unknown> = {
      setOptions: vi.fn(() => countQuery),
      then: (resolve: (n: number) => void) => resolve(state.total),
    };
    const voucherCount = vi.fn(() => countQuery);
    // Voucher.create(arg) returns a doc exposing .toObject() (the route trims doc.toObject()).
    const voucherCreate = vi.fn(async (arg: Record<string, unknown>) => {
      state.lastCreate = arg;
      return { toObject: () => ({ _id: 'newid', updatedAt: new Date('2026-07-06T00:00:00Z'), ...arg }) };
    });
    return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, voucherFind, voucherCount, voucherCreate, findQuery, countQuery, state };
  });

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Voucher', () => ({ Voucher: { find: voucherFind, countDocuments: voucherCount, create: voucherCreate } }));

import { GET, POST } from './route';

const BASE = 'http://pharos.local/api/v1/vouchers';

/** Minimal NextRequest stand-in — the route only reads url, headers.get, and json(). */
function makeReq(opts: { url?: string; auth?: string | null; body?: unknown } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: opts.url ?? BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => (opts.body === undefined ? {} : opts.body),
  } as unknown as NextRequest;
}

function findFilter(): Record<string, unknown> {
  return (voucherFind.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
}
function countFilter(): Record<string, unknown> {
  return (voucherCount.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
}

beforeEach(() => {
  state.docs = [];
  state.total = 0;
  state.lastCreate = null;
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  // clearAllMocks resets return values on the chain stubs → re-point them.
  for (const m of ['sort', 'skip', 'limit', 'setOptions']) (findQuery[m] as ReturnType<typeof vi.fn>).mockImplementation(() => findQuery);
  (findQuery.lean as ReturnType<typeof vi.fn>).mockImplementation(async () => state.docs);
  (countQuery.setOptions as ReturnType<typeof vi.fn>).mockImplementation(() => countQuery);
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  voucherFind.mockImplementation(() => findQuery);
  voucherCount.mockImplementation(() => countQuery);
  voucherCreate.mockImplementation(async (arg: Record<string, unknown>) => {
    state.lastCreate = arg;
    return { toObject: () => ({ _id: 'newid', updatedAt: new Date('2026-07-06T00:00:00Z'), ...arg }) };
  });
});

describe('auth gate', () => {
  it('GET without a token → 401, never touches the DB', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(voucherFind).not.toHaveBeenCalled();
  });

  it('POST with an unknown token → 401, never creates', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await POST(makeReq({ body: { title: 'X' } }));
    expect(res.status).toBe(401);
    expect(voucherCreate).not.toHaveBeenCalled();
  });
});

describe('POST validation', () => {
  it('rejects a missing title with 400 and never creates', async () => {
    const res = await POST(makeReq({ body: {} }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'title required' });
    expect(voucherCreate).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only title with 400 (strField trims to empty)', async () => {
    const res = await POST(makeReq({ body: { title: '   ' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'title required' });
    expect(voucherCreate).not.toHaveBeenCalled();
  });

  it('creates a title-only voucher with all string defaults, null expiresAt, and the SPEC { voucher } at 201', async () => {
    const res = await POST(makeReq({ body: { title: '  Skroutz 15%  ' } }));
    expect(res.status).toBe(201);
    // create arg: title trimmed, every optional string '', expiresAt null.
    expect(state.lastCreate).toEqual({ title: 'Skroutz 15%', code: '', store: '', discount: '', expiresAt: null, url: '', notes: '' });
    const json = (await res.json()) as { voucher: Record<string, unknown> };
    expect(json).toHaveProperty('voucher');
    expect(json).not.toHaveProperty('ok');
    expect(json).not.toHaveProperty('data');
    expect(json.voucher).toMatchObject({ id: 'newid', title: 'Skroutz 15%', code: '', store: '', discount: '', expiresAt: null, used: false, url: '', notes: '', deleted: false });
  });

  it('trims every string field and parses a valid expiresAt into a Date', async () => {
    const res = await POST(makeReq({ body: { title: ' Public ', code: ' SUMMER15 ', store: ' Public ', discount: ' 15% ', url: ' https://x.gr ', notes: ' min 50 ', expiresAt: '2026-12-31' } }));
    expect(res.status).toBe(201);
    const c = state.lastCreate as Record<string, unknown>;
    expect(c).toMatchObject({ title: 'Public', code: 'SUMMER15', store: 'Public', discount: '15%', url: 'https://x.gr', notes: 'min 50' });
    expect(c.expiresAt).toBeInstanceOf(Date);
    expect((c.expiresAt as Date).toISOString()).toBe('2026-12-31T00:00:00.000Z');
    // serialized back with the same ISO
    const json = (await res.json()) as { voucher: { expiresAt: string } };
    expect(json.voucher.expiresAt).toBe('2026-12-31T00:00:00.000Z');
  });

  it('treats an empty-string expiresAt as null (truthiness gate, not key-presence)', async () => {
    await POST(makeReq({ body: { title: 'X', expiresAt: '' } }));
    expect((state.lastCreate as Record<string, unknown>).expiresAt).toBeNull();
  });
});

describe('GET listing', () => {
  it('returns the list envelope with each voucher trimmed to spec defaults', async () => {
    state.docs = [
      { _id: 'v1', title: 'Skroutz 15%', code: 'SUMMER15', store: 'Skroutz', discount: '15%', expiresAt: new Date('2026-12-31T00:00:00Z'), used: true, url: 'https://s.gr', notes: 'min 50', updatedAt: new Date('2026-07-01T00:00:00Z') },
      { _id: 'v2', title: 'Bare' }, // near-empty doc exercises every ?? '' / !! fallback
    ];
    state.total = 2;
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown>[]; total: number; limit: number; offset: number };
    expect(json).toMatchObject({ total: 2, limit: 50, offset: 0 });
    expect(json.data[0]).toEqual({
      id: 'v1', title: 'Skroutz 15%', code: 'SUMMER15', store: 'Skroutz', discount: '15%',
      expiresAt: '2026-12-31T00:00:00.000Z', used: true, url: 'https://s.gr', notes: 'min 50',
      updatedAt: '2026-07-01T00:00:00.000Z', deleted: false,
    });
    expect(json.data[1]).toEqual({
      id: 'v2', title: 'Bare', code: '', store: '', discount: '', expiresAt: null,
      used: false, url: '', notes: '', updatedAt: null, deleted: false,
    });
  });

  it('applies the used=0 filter as { used: { $ne: true } } on both find and count', async () => {
    await GET(makeReq({ url: `${BASE}?used=0` }));
    expect(findFilter()).toEqual({ used: { $ne: true } });
    expect(countFilter()).toEqual({ used: { $ne: true } });
  });

  it('uses an empty base filter when no used param is present', async () => {
    await GET(makeReq());
    expect(findFilter()).toEqual({});
    expect(countFilter()).toEqual({});
  });

  it('sorts by expiresAt ascending', async () => {
    await GET(makeReq());
    expect((findQuery.sort as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({ expiresAt: 1 });
  });

  it('an updatedSince cursor adds $gte and flips withDeleted on both queries', async () => {
    await GET(makeReq({ url: `${BASE}?updatedSince=2026-07-01T00:00:00.000Z` }));
    expect(findFilter()).toEqual({ updatedAt: { $gte: new Date('2026-07-01T00:00:00.000Z') } });
    expect(countFilter()).toEqual({ updatedAt: { $gte: new Date('2026-07-01T00:00:00.000Z') } });
    expect((findQuery.setOptions as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ withDeleted: true });
    expect((countQuery.setOptions as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ withDeleted: true });
  });

  it('without a cursor never calls setOptions (soft-deletes stay hidden)', async () => {
    await GET(makeReq());
    expect((findQuery.setOptions as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((countQuery.setOptions as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('flags a soft-deleted doc with deleted:true', async () => {
    state.docs = [{ _id: 'v3', title: 'Gone', deletedAt: new Date('2026-07-05T00:00:00Z') }];
    state.total = 1;
    const res = await GET(makeReq({ url: `${BASE}?updatedSince=2026-07-01T00:00:00.000Z` }));
    const json = (await res.json()) as { data: { deleted: boolean }[] };
    expect(json.data[0].deleted).toBe(true);
  });
});
