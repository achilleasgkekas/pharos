import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET /api/v1/overview is one of the ~50 REST endpoints the Expo mobile app drives.
// It backs the mobile dashboard: headline counts across every collection plus the money owed
// on open installment plans. Unlike the thin { rows } wrappers (trash/jobs), this route owns
// real shaping logic that lives NOWHERE else, so a drift here silently breaks the mobile home:
//   - the Bearer-auth gate (withAuth → 401 without a valid token, BEFORE any DB read),
//   - the per-collection countDocuments FILTERS: shoppingList counts only { checked:false },
//     subscriptions only { active:true }, openTasks only { status:{$ne:'done'} }, the rest raw,
//   - the installments roll-up: it runs computeInstallmentPlans over the statements, keeps only
//     the NOT-done plans, sums their remainingAmount → Math.round → installmentsOwed, and counts
//     them → activeInstallmentPlans,
//   - the response envelope shape: { counts:{...}, installmentsOwed, activeInstallmentPlans, currency }.
// We exercise the REAL apiAuth helper (withAuth) and mock the DB (auth chain + models),
// computeInstallmentPlans (seam — the pure lib is tested on its own), and getAppSettings.

const {
  connectDBMock,
  userFindOne,
  userState,
  counts,
  countMocks,
  statementFind,
  statementState,
  computePlansMock,
  plansState,
  getAppSettingsMock,
  settingsState,
} = vi.hoisted(() => {
  const counts = { items: 0, shoppingList: 0, receipts: 0, expenses: 0, subscriptions: 0, openTasks: 0 };
  const countMocks = {
    Item: vi.fn(async () => counts.items),
    ShoppingListItem: vi.fn(async (_q?: unknown) => counts.shoppingList),
    Receipt: vi.fn(async () => counts.receipts),
    Expense: vi.fn(async () => counts.expenses),
    Subscription: vi.fn(async (_q?: unknown) => counts.subscriptions),
    Task: vi.fn(async (_q?: unknown) => counts.openTasks),
  };
  const statementState: { rows: unknown[] } = { rows: [] };
  const statementFind = vi.fn(() => ({ lean: async () => statementState.rows }));
  const plansState: { plans: Array<{ done: boolean; remainingAmount: number }> } = { plans: [] };
  const computePlansMock = vi.fn(() => plansState.plans);
  const settingsState: { currency: string } = { currency: 'EUR' };
  const getAppSettingsMock = vi.fn(async () => ({ currency: settingsState.currency }));
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  return {
    connectDBMock: vi.fn(async () => {}),
    userFindOne,
    userState,
    counts,
    countMocks,
    statementFind,
    statementState,
    computePlansMock,
    plansState,
    getAppSettingsMock,
    settingsState,
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Item', () => ({ Item: { countDocuments: countMocks.Item } }));
vi.mock('@/models/ShoppingListItem', () => ({ ShoppingListItem: { countDocuments: countMocks.ShoppingListItem } }));
vi.mock('@/models/Receipt', () => ({ Receipt: { countDocuments: countMocks.Receipt } }));
vi.mock('@/models/Expense', () => ({ Expense: { countDocuments: countMocks.Expense } }));
vi.mock('@/models/Subscription', () => ({ Subscription: { countDocuments: countMocks.Subscription } }));
vi.mock('@/models/Task', () => ({ Task: { countDocuments: countMocks.Task } }));
vi.mock('@/models/Statement', () => ({ Statement: { find: statementFind } }));
vi.mock('@/lib/installments', () => ({ computeInstallmentPlans: computePlansMock }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

import { GET } from './route';

const BASE = 'http://pharos.local/api/v1/overview';

/** Minimal NextRequest stand-in — the route only reads headers.get and url. */
function makeReq(opts: { auth?: string | null } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
  } as unknown as NextRequest;
}

beforeEach(() => {
  counts.items = 0;
  counts.shoppingList = 0;
  counts.receipts = 0;
  counts.expenses = 0;
  counts.subscriptions = 0;
  counts.openTasks = 0;
  statementState.rows = [];
  plansState.plans = [];
  settingsState.currency = 'EUR';
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  countMocks.Item.mockImplementation(async () => counts.items);
  countMocks.ShoppingListItem.mockImplementation(async () => counts.shoppingList);
  countMocks.Receipt.mockImplementation(async () => counts.receipts);
  countMocks.Expense.mockImplementation(async () => counts.expenses);
  countMocks.Subscription.mockImplementation(async () => counts.subscriptions);
  countMocks.Task.mockImplementation(async () => counts.openTasks);
  statementFind.mockImplementation(() => ({ lean: async () => statementState.rows }));
  computePlansMock.mockImplementation(() => plansState.plans);
  getAppSettingsMock.mockImplementation(async () => ({ currency: settingsState.currency }));
});

describe('auth gate', () => {
  it('without a token → 401, never reads the DB', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(countMocks.Item).not.toHaveBeenCalled();
    expect(statementFind).not.toHaveBeenCalled();
    expect(computePlansMock).not.toHaveBeenCalled();
  });

  it('with an unknown token → 401, never reads the DB', async () => {
    userState.doc = null; // bearerUser lookup resolves to no user
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(countMocks.Item).not.toHaveBeenCalled();
    expect(statementFind).not.toHaveBeenCalled();
  });
});

describe('counts envelope', () => {
  it('maps each collection countDocuments to the matching counts key', async () => {
    counts.items = 66;
    counts.shoppingList = 13;
    counts.receipts = 240;
    counts.expenses = 18;
    counts.subscriptions = 5;
    counts.openTasks = 9;
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { counts: Record<string, number> };
    expect(json.counts).toEqual({
      items: 66,
      shoppingList: 13,
      receipts: 240,
      expenses: 18,
      subscriptions: 5,
      openTasks: 9,
    });
  });

  it('applies the intended filters — shoppingList unchecked, subs active, tasks not-done', async () => {
    await GET(makeReq());
    expect(countMocks.ShoppingListItem).toHaveBeenCalledWith({ checked: false });
    expect(countMocks.Subscription).toHaveBeenCalledWith({ active: true });
    expect(countMocks.Task).toHaveBeenCalledWith({ status: { $ne: 'done' } });
    // The raw counts take no filter argument.
    expect(countMocks.Item).toHaveBeenCalledWith();
    expect(countMocks.Receipt).toHaveBeenCalledWith();
    expect(countMocks.Expense).toHaveBeenCalledWith();
  });

  it('reports zeros for a fresh/empty install', async () => {
    const res = await GET(makeReq());
    const json = (await res.json()) as { counts: Record<string, number> };
    expect(json.counts).toEqual({ items: 0, shoppingList: 0, receipts: 0, expenses: 0, subscriptions: 0, openTasks: 0 });
  });
});

describe('installments roll-up', () => {
  it('sums remainingAmount of NOT-done plans and rounds → installmentsOwed', async () => {
    plansState.plans = [
      { done: false, remainingAmount: 100.4 },
      { done: false, remainingAmount: 50.3 },
      { done: true, remainingAmount: 999 }, // completed plan is excluded
    ];
    const res = await GET(makeReq());
    const json = (await res.json()) as { installmentsOwed: number; activeInstallmentPlans: number };
    expect(json.installmentsOwed).toBe(151); // round(150.7)
    expect(json.activeInstallmentPlans).toBe(2);
    expect(computePlansMock).toHaveBeenCalledOnce();
  });

  it('reports 0 owed / 0 active when there are no plans', async () => {
    plansState.plans = [];
    const res = await GET(makeReq());
    const json = (await res.json()) as { installmentsOwed: number; activeInstallmentPlans: number };
    expect(json.installmentsOwed).toBe(0);
    expect(json.activeInstallmentPlans).toBe(0);
  });

  it('reports 0 active when every plan is done, even if remainingAmount lingers', async () => {
    plansState.plans = [
      { done: true, remainingAmount: 0 },
      { done: true, remainingAmount: 12 },
    ];
    const res = await GET(makeReq());
    const json = (await res.json()) as { installmentsOwed: number; activeInstallmentPlans: number };
    expect(json.installmentsOwed).toBe(0);
    expect(json.activeInstallmentPlans).toBe(0);
  });
});

describe('currency', () => {
  it('passes through the configured currency from getAppSettings', async () => {
    settingsState.currency = 'USD';
    const res = await GET(makeReq());
    const json = (await res.json()) as { currency: string };
    expect(json.currency).toBe('USD');
  });

  it('returns the full envelope shape with the expected top-level keys', async () => {
    const res = await GET(makeReq());
    const json = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(json).sort()).toEqual(
      ['activeInstallmentPlans', 'counts', 'currency', 'installmentsOwed'].sort(),
    );
  });
});
