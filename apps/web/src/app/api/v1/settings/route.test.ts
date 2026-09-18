import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET+PATCH /api/v1/settings is one of the ~50 REST endpoints under /api/v1. It backs
// the Settings screen (preferences + this-month budget usage). Two blocks of route-only
// behaviour live NOWHERE else, so a drift here silently corrupts the Settings tab:
//   GET  - the Bearer-auth gate (withAuth → 401 without a valid token, BEFORE any DB read),
//        - the budget-usage rows: one row per category that has a limit>0, each carrying this
//          month's spent (rounded to cents), ordered most-over-budget first (spent/limit desc),
//        - spent is summed from this-month expenses (by `period` when set, else by date window),
//        - the flat preferences envelope (currency / VAT / views / ntfy / expenseCategories / period).
//   PATCH- the whitelist + coercion of every writable field: currency (trim→upper→≤4 chars),
//          defaultVatRate (clamp 0–100), defaultItemView ('list' else 'grid'), defaultWarrantyMonths
//          (clamp 0–120), warrantyAlertDays (clamp 0–730), autoAddStores/ntfyEnabled (bool-only),
//          ntfyUrl (trim), budgets (drop non-positive / non-finite, trim keys, round to cents),
//        - the "no valid fields → 400" guard (nothing written, no updateOne),
//        - only the coerced whitelist reaches AppConfig.updateOne($set) — never raw body keys.
// The GET reads the real clock (new Date()), so we pin system time with fake timers for
// determinism. We exercise the REAL apiAuth helper (withAuth) and mock the DB (auth chain +
// Expense/AppConfig) and getAppSettings/invalidateAppSettings.

const {
  connectDBMock,
  userFindOne,
  userState,
  expenseFind,
  expenseState,
  appConfigUpdateOne,
  getAppSettingsMock,
  settingsState,
  invalidateMock,
} = vi.hoisted(() => {
  const expenseState: { rows: unknown[] } = { rows: [] };
  const expenseFind = vi.fn((_q?: unknown) => ({ select: () => ({ lean: async () => expenseState.rows }) }));
  const appConfigUpdateOne = vi.fn(async (_filter?: unknown, _update?: unknown, _opts?: unknown) => ({
    acknowledged: true,
  }));
  const settingsState: { doc: Record<string, unknown> } = {
    doc: {
      currency: 'EUR',
      multiCurrency: false,
      defaultVatRate: 24,
      defaultItemView: 'grid',
      defaultWarrantyMonths: 24,
      warrantyAlertDays: 90,
      trialAlertDays: 2,
      autoAddStores: true,
      ntfyUrl: '',
      ntfyEnabled: false,
      budgetRollover: false,
      expenseCategories: ['utilities', 'groceries'],
      budgets: {} as Record<string, number>,
    },
  };
  const getAppSettingsMock = vi.fn(async () => settingsState.doc);
  const invalidateMock = vi.fn();
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  return {
    connectDBMock: vi.fn(async () => {}),
    userFindOne,
    userState,
    expenseFind,
    expenseState,
    appConfigUpdateOne,
    getAppSettingsMock,
    settingsState,
    invalidateMock,
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Expense', () => ({ Expense: { find: expenseFind } }));
vi.mock('@/models/AppConfig', () => ({ AppConfig: { updateOne: appConfigUpdateOne } }));
vi.mock('@/lib/appSettings', () => ({
  getAppSettings: getAppSettingsMock,
  invalidateAppSettings: invalidateMock, invalidateAppSettingsForRequest: vi.fn(async () => {}),
}));

import { GET, PATCH } from './route';

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

const BASE = 'http://pharos.local/api/v1/settings';

/** Minimal NextRequest stand-in — GET reads headers.get (auth); PATCH also reads json() (body). */
function makeReq(opts: { auth?: string | null; body?: unknown; badJson?: boolean } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => {
      if (opts.badJson) throw new Error('bad json');
      return opts.body ?? {};
    },
  } as unknown as NextRequest;
}

/** Extract the $set object handed to AppConfig.updateOne on the last call. */
function lastSet(): Record<string, unknown> {
  const call = appConfigUpdateOne.mock.calls.at(-1);
  return (call?.[1] as { $set: Record<string, unknown> }).$set;
}

// Pin the clock at 15 July 2026 → period '2026-07', monthStart Date(2026,6,1), monthEnd Date(2026,7,1).
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 15, 12, 0, 0));
  expenseState.rows = [];
  settingsState.doc = {
    currency: 'EUR',
    multiCurrency: false,
    defaultVatRate: 24,
    defaultItemView: 'grid',
    defaultWarrantyMonths: 24,
    warrantyAlertDays: 90,
    trialAlertDays: 2,
    autoAddStores: true,
    ntfyUrl: '',
    ntfyEnabled: false,
    budgetRollover: false,
    expenseCategories: ['utilities', 'groceries'],
    budgets: {},
  };
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  expenseFind.mockImplementation(() => ({ select: () => ({ lean: async () => expenseState.rows }) }));
  getAppSettingsMock.mockImplementation(async () => settingsState.doc);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('auth gate', () => {
  it('GET without a token → 401, never reads settings', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(getAppSettingsMock).not.toHaveBeenCalled();
  });

  it('GET with an unknown token → 401', async () => {
    userState.doc = null;
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(getAppSettingsMock).not.toHaveBeenCalled();
  });

  it('PATCH without a token → 401, never writes', async () => {
    const res = await PATCH(makeReq({ auth: null, body: { currency: 'usd' } }));
    expect(res.status).toBe(401);
    expect(appConfigUpdateOne).not.toHaveBeenCalled();
  });
});

describe('GET — preferences envelope', () => {
  it('returns the flat preferences + current period', async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      currency: 'EUR',
      multiCurrency: false,
      defaultVatRate: 24,
      defaultItemView: 'grid',
      defaultWarrantyMonths: 24,
      warrantyAlertDays: 90,
      trialAlertDays: 2,
      autoAddStores: true,
      ntfyUrl: '',
      ntfyEnabled: false,
      budgetRollover: false,
      expenseCategories: ['utilities', 'groceries'],
      period: '2026-07',
      budgets: [],
    });
  });

  // P9: read-only here on purpose (it is an install-wide Money decision), but an API client
  // needs it to decide whether to offer per-entry currency controls at all.
  it('carries multiCurrency through so a client knows whether to offer FX controls', async () => {
    settingsState.doc.multiCurrency = true;
    const json = await (await GET(makeReq())).json();
    expect(json.multiCurrency).toBe(true);
  });
});

describe('GET — budget usage rows', () => {
  it('emits one row per budgeted category with this-month spent, most-over-budget first', async () => {
    settingsState.doc.budgets = { utilities: 100, groceries: 400, travel: 200 };
    // spent: utilities 150 (ratio 1.5), groceries 200 (0.5), travel 50 (0.25)
    expenseState.rows = [
      { category: 'utilities', amount: 150 },
      { category: 'groceries', amount: 200 },
      { category: 'travel', amount: 50 },
    ];
    const res = await GET(makeReq());
    const json = (await res.json()) as { budgets: Array<{ category: string; limit: number; spent: number }> };
    expect(json.budgets).toEqual([
      { category: 'utilities', limit: 100, spent: 150 },
      { category: 'groceries', limit: 400, spent: 200 },
      { category: 'travel', limit: 200, spent: 50 },
    ]);
  });

  it('drops categories with a non-positive limit and rounds spent to cents', async () => {
    settingsState.doc.budgets = { utilities: 100, ignored: 0, negative: -5 };
    expenseState.rows = [{ category: 'utilities', amount: 12.345 }];
    const res = await GET(makeReq());
    const json = (await res.json()) as { budgets: Array<{ category: string; spent: number }> };
    expect(json.budgets).toHaveLength(1);
    expect(json.budgets[0]).toEqual({ category: 'utilities', limit: 100, spent: 12.35 });
  });

  it('categories with a budget but no spending report spent 0', async () => {
    settingsState.doc.budgets = { travel: 300 };
    expenseState.rows = [];
    const res = await GET(makeReq());
    const json = (await res.json()) as { budgets: Array<{ category: string; spent: number }> };
    expect(json.budgets).toEqual([{ category: 'travel', limit: 300, spent: 0 }]);
  });

  it('queries this month by period-or-date window', async () => {
    settingsState.doc.budgets = { utilities: 100 };
    await GET(makeReq());
    const q = expenseFind.mock.calls[0][0] as { kind: string; $or: Array<Record<string, unknown>> };
    expect(q.kind).toBe('expense');
    expect(q.$or[0]).toEqual({ period: '2026-07' });
    expect(q.$or[1]).toMatchObject({ period: '' });
    const dateClause = (q.$or[1] as { date: { $gte: Date; $lt: Date } }).date;
    expect(dateClause.$gte).toEqual(new Date(2026, 6, 1));
    expect(dateClause.$lt).toEqual(new Date(2026, 7, 1));
  });
});

describe('PATCH — field whitelist + coercion', () => {
  it('coerces currency: trim, uppercase, cap at 4 chars', async () => {
    const res = await PATCH(makeReq({ body: { currency: '  usdollar ' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(lastSet()).toEqual({ currency: 'USDO' });
    expect(invalidateMock).toHaveBeenCalledOnce();
  });

  it('clamps numeric fields into their ranges', async () => {
    await PATCH(
      makeReq({ body: { defaultVatRate: 250, defaultWarrantyMonths: -3, warrantyAlertDays: 9999, trialAlertDays: 999 } })
    );
    expect(lastSet()).toEqual({ defaultVatRate: 100, defaultWarrantyMonths: 0, warrantyAlertDays: 730, trialAlertDays: 60 });
  });

  it('clamps trialAlertDays into 0–60 and allows 0 (off)', async () => {
    await PATCH(makeReq({ body: { trialAlertDays: -5 } }));
    expect(lastSet()).toEqual({ trialAlertDays: 0 });
  });

  it('normalizes defaultItemView to list|grid', async () => {
    await PATCH(makeReq({ body: { defaultItemView: 'list' } }));
    expect(lastSet()).toEqual({ defaultItemView: 'list' });
    await PATCH(makeReq({ body: { defaultItemView: 'anything-else' } }));
    expect(lastSet()).toEqual({ defaultItemView: 'grid' });
  });

  it('accepts booleans only for autoAddStores / ntfyEnabled and trims ntfyUrl', async () => {
    await PATCH(
      makeReq({ body: { autoAddStores: false, ntfyEnabled: true, ntfyUrl: '  https://ntfy.sh/x  ' } })
    );
    expect(lastSet()).toEqual({ autoAddStores: false, ntfyEnabled: true, ntfyUrl: 'https://ntfy.sh/x' });
  });

  it('ignores non-boolean autoAddStores (truthy string is not a boolean)', async () => {
    const res = await PATCH(makeReq({ body: { autoAddStores: 'yes' } }));
    expect(res.status).toBe(400);
    expect(appConfigUpdateOne).not.toHaveBeenCalled();
  });

  it('accepts a boolean budgetRollover (P25 envelope-mode toggle) and ignores non-boolean values', async () => {
    await PATCH(makeReq({ body: { budgetRollover: true } }));
    expect(lastSet()).toEqual({ budgetRollover: true });
    await PATCH(makeReq({ body: { budgetRollover: false } }));
    expect(lastSet()).toEqual({ budgetRollover: false });
    const res = await PATCH(makeReq({ body: { budgetRollover: 'yes' } }));
    expect(res.status).toBe(400);
  });

  it('cleans the budgets map: drop non-positive/non-finite, trim keys, round to cents', async () => {
    await PATCH(
      makeReq({
        body: {
          budgets: { ' utilities ': '99.999', groceries: 0, travel: -10, junk: 'x', valid: 50 },
        },
      })
    );
    expect(lastSet()).toEqual({ budgets: { utilities: 100, valid: 50 } });
  });

  it('drops unknown / non-whitelisted body keys entirely', async () => {
    await PATCH(makeReq({ body: { currency: 'gbp', role: 'admin', __proto__: {}, hacked: true } }));
    expect(lastSet()).toEqual({ currency: 'GBP' });
  });
});

describe('PATCH — no-op guard', () => {
  it('empty body → 400 and never writes', async () => {
    const res = await PATCH(makeReq({ body: {} }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no valid fields' });
    expect(appConfigUpdateOne).not.toHaveBeenCalled();
    expect(invalidateMock).not.toHaveBeenCalled();
  });

  it('malformed JSON body → 400 (readBody swallows the parse error)', async () => {
    const res = await PATCH(makeReq({ badJson: true }));
    expect(res.status).toBe(400);
    expect(appConfigUpdateOne).not.toHaveBeenCalled();
  });

  it('body with only invalid values → 400', async () => {
    const res = await PATCH(makeReq({ body: { defaultVatRate: 'NaN', currency: '   ' } }));
    expect(res.status).toBe(400);
    expect(appConfigUpdateOne).not.toHaveBeenCalled();
  });
});

// The ntfy topic is an OUTPUT channel: whoever sets it re-routes every alert of the whole
// instance. The web actions have been admin-gated since 0bc5e14, so the API must agree or the
// web guard is decorative (a member just uses the API instead). The shape of the denial
// matters as much as the denial: an API client's Settings screen saves currency/VAT/budgets/ntfy in
// ONE PATCH, so a 403 for the whole request would read as "nothing saved" while the allowed
// fields were perfectly writable. Hence: silently drop the two fields, keep the rest — except
// when they are ALL the request carried, where 200 { ok: true } would be a lie.
describe('PATCH — ntfy is admin-only', () => {
  it('an admin writes both ntfy fields (unchanged behaviour)', async () => {
    await PATCH(makeReq({ body: { ntfyEnabled: true, ntfyUrl: 'https://ntfy.sh/x' } }));
    expect(lastSet()).toEqual({ ntfyEnabled: true, ntfyUrl: 'https://ntfy.sh/x' });
  });

  it('a member keeps the rest of a mixed save; only the ntfy fields are dropped', async () => {
    userState.doc = { _id: 'u2', name: 'Member', username: 'mem', role: 'member' };
    const res = await PATCH(
      makeReq({ body: { currency: 'usd', defaultVatRate: 19, ntfyUrl: 'https://evil.example/t', ntfyEnabled: true } })
    );
    expect(res.status).toBe(200);
    expect(lastSet()).toEqual({ currency: 'USD', defaultVatRate: 19 });
  });

  it('a member sending ONLY ntfy fields gets 403 and nothing is written', async () => {
    userState.doc = { _id: 'u2', name: 'Member', username: 'mem', role: 'member' };
    const res = await PATCH(makeReq({ body: { ntfyUrl: 'https://evil.example/t', ntfyEnabled: true } }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/admin only/i);
    expect(appConfigUpdateOne).not.toHaveBeenCalled();
  });

  // Distinguishing the two 400/403 paths: a junk-only body is still "no valid fields", not a
  // permission problem, so the member does not get told to go find an admin for a typo.
  it('a member sending only junk still gets the plain 400, not the admin message', async () => {
    userState.doc = { _id: 'u2', name: 'Member', username: 'mem', role: 'member' };
    const res = await PATCH(makeReq({ body: { currency: '   ' } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no valid fields' });
  });

  it('GET tells the client whether it may edit, so it can render read-only', async () => {
    expect((await (await GET(makeReq())).json()).canEditNtfy).toBe(true);
    userState.doc = { _id: 'u2', name: 'Member', username: 'mem', role: 'member' };
    const json = await (await GET(makeReq())).json();
    expect(json.canEditNtfy).toBe(false);
    // Still readable: a member should be able to see WHERE alerts go, just not change it.
    expect(json).toHaveProperty('ntfyUrl');
  });
});

describe('PATCH — persistence shape', () => {
  it('upserts the singleton AppConfig with $set', async () => {
    await PATCH(makeReq({ body: { currency: 'eur' } }));
    expect(appConfigUpdateOne).toHaveBeenCalledOnce();
    const [filter, update, opts] = appConfigUpdateOne.mock.calls[0];
    expect(filter).toEqual({ key: 'singleton' });
    expect(update).toEqual({ $set: { currency: 'EUR' } });
    expect(opts).toEqual({ upsert: true });
  });
});
