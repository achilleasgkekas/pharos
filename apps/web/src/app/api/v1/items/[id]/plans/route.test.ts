import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET /api/v1/items/:id/plans backs the mobile item-detail "link a δόσεις plan" picker — it lists
// every installment plan across all statements (from the same `computeInstallmentPlans` pure lib
// the web overview and link-plan route use, already covered by installments.test.ts) and flags
// which ones already carry this item. Route-only logic that lives ONLY here:
//
//   1. the ObjectId guard (malformed :id → 400 bad id, BEFORE any DB read),
//   2. `linked = p.itemIds.includes(id)` per plan, computed fresh from the raw lib output,
//   3. the response RESHAPES each lib plan into a narrower wire shape: only a subset of
//      InstallmentPlan fields survive (no `key`/`itemIds`/`paidAmount`/`firstDate`/`lastDate`/
//      `occurrences`/`merged`), plus a derived `itemCount = itemIds.length` and the added
//      `linked` boolean,
//   4. a SECOND sort pass on top of whatever order computeInstallmentPlans returned: linked
//      plans are stable-sorted to the front (`a.linked === b.linked ? 0 : a.linked ? -1 : 1`),
//      preserving the lib's original active-before-done ordering within each linked/unlinked
//      group,
//   5. `currency` in the envelope comes from `getAppSettings()`, defaulting to 'EUR' when unset.
//
// We run the REAL apiAuth/apiBody helpers and mock the DB seam + computeInstallmentPlans (so this
// test pins the route's reshaping/sorting, not the lib's own installment math).

const {
  connectDBMock,
  userFindOne,
  userState,
  statementFind,
  findState,
  getAppSettingsMock,
  settingsState,
  computeInstallmentPlansMock,
  plansState,
} = vi.hoisted(() => {
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  // Statement.find().sort(...).lean() → raw statements handed to computeInstallmentPlans
  const findState: { calls: Array<unknown>; docs: unknown[] } = { calls: [], docs: [] };
  const statementFind = vi.fn((...args: unknown[]) => {
    findState.calls.push(args);
    return { sort: () => ({ lean: async () => findState.docs }) };
  });
  const settingsState: { value: { currency?: string } } = { value: {} };
  const getAppSettingsMock = vi.fn(async () => settingsState.value);
  const plansState: { calls: unknown[]; result: Array<Record<string, unknown>> } = { calls: [], result: [] };
  const computeInstallmentPlansMock = vi.fn((statements: unknown) => {
    plansState.calls.push(statements);
    return plansState.result;
  });
  return {
    connectDBMock: vi.fn(async () => {}),
    userFindOne,
    userState,
    statementFind,
    findState,
    getAppSettingsMock,
    settingsState,
    computeInstallmentPlansMock,
    plansState,
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Statement', () => ({ Statement: { find: statementFind } }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));
vi.mock('@/lib/installments', () => ({ computeInstallmentPlans: computeInstallmentPlansMock }));

import { GET } from './route';

const OID = '507f1f77bcf86cd799439011'; // a well-formed 24-hex ObjectId
const OTHER_OID = '507f1f77bcf86cd799439099';
const BASE = `http://pharos.local/api/v1/items/${OID}/plans`;

/** Minimal NextRequest stand-in — the route only reads headers.get. */
function makeReq(opts: { auth?: string | null } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
  } as unknown as NextRequest;
}

function rawPlan(over: Partial<Record<string, unknown>> = {}) {
  return {
    key: 'desc:sig1',
    signature: 'sig1',
    itemIds: [] as string[],
    label: 'PLAISIO 3/12',
    card: 'Mastercard 7791',
    perAmount: 39.47,
    totalInstallments: 12,
    paidInstallments: 3,
    remainingInstallments: 9,
    paidAmount: 118.41,
    totalAmount: 473.64,
    remainingAmount: 355.23,
    firstDate: '2026-04-01',
    lastDate: '2026-06-01',
    projectedEndDate: '2027-03-01',
    done: false,
    occurrences: 3,
    merged: false,
    ...over,
  };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  findState.docs = [{ _id: 's1' }];
  settingsState.value = {};
  plansState.result = [];
});

describe('GET /api/v1/items/:id/plans', () => {
  it('401s with no Authorization header, never touching the DB', async () => {
    const res = await GET(makeReq({ auth: null }), params(OID));
    expect(res.status).toBe(401);
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(statementFind).not.toHaveBeenCalled();
  });

  it('401s on an unknown bearer token', async () => {
    userState.doc = null;
    const res = await GET(makeReq(), params(OID));
    expect(res.status).toBe(401);
    expect(statementFind).not.toHaveBeenCalled();
  });

  it('400s on a malformed :id, before any Statement query', async () => {
    const res = await GET(makeReq(), params('not-an-object-id'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('bad id');
    expect(statementFind).not.toHaveBeenCalled();
  });

  it('feeds the raw statements straight into computeInstallmentPlans', async () => {
    findState.docs = [{ _id: 's1' }, { _id: 's2' }];
    await GET(makeReq(), params(OID));
    expect(plansState.calls).toEqual([[{ _id: 's1' }, { _id: 's2' }]]);
  });

  it('reshapes each lib plan, dropping key/itemIds/paidAmount/firstDate/lastDate/occurrences/merged and adding itemCount+linked', async () => {
    plansState.result = [rawPlan({ itemIds: [OID] })];
    const res = await GET(makeReq(), params(OID));
    const body = await res.json();
    expect(body.plans).toEqual([
      {
        signature: 'sig1',
        label: 'PLAISIO 3/12',
        card: 'Mastercard 7791',
        perAmount: 39.47,
        totalInstallments: 12,
        paidInstallments: 3,
        remainingInstallments: 9,
        remainingAmount: 355.23,
        totalAmount: 473.64,
        projectedEndDate: '2027-03-01',
        done: false,
        itemCount: 1,
        linked: true,
      },
    ]);
  });

  it('flags linked=false when this item id is absent from itemIds, true when present', async () => {
    plansState.result = [
      rawPlan({ signature: 'unlinked', itemIds: [OTHER_OID] }),
      rawPlan({ signature: 'linked', itemIds: [OID, OTHER_OID] }),
    ];
    const res = await GET(makeReq(), params(OID));
    const body = await res.json();
    const bySig = Object.fromEntries(body.plans.map((p: { signature: string; linked: boolean }) => [p.signature, p.linked]));
    expect(bySig).toEqual({ unlinked: false, linked: true });
  });

  it('sorts linked plans first, preserving relative order within each group', async () => {
    plansState.result = [
      rawPlan({ signature: 'a-unlinked', itemIds: [] }),
      rawPlan({ signature: 'b-linked', itemIds: [OID] }),
      rawPlan({ signature: 'c-unlinked', itemIds: [] }),
      rawPlan({ signature: 'd-linked', itemIds: [OID] }),
    ];
    const res = await GET(makeReq(), params(OID));
    const body = await res.json();
    expect(body.plans.map((p: { signature: string }) => p.signature)).toEqual([
      'b-linked',
      'd-linked',
      'a-unlinked',
      'c-unlinked',
    ]);
  });

  it('defaults currency to EUR when settings has none set', async () => {
    settingsState.value = {};
    const res = await GET(makeReq(), params(OID));
    const body = await res.json();
    expect(body.currency).toBe('EUR');
  });

  it('uses the configured currency from getAppSettings when set', async () => {
    settingsState.value = { currency: 'USD' };
    const res = await GET(makeReq(), params(OID));
    const body = await res.json();
    expect(body.currency).toBe('USD');
  });

  it('returns an empty plans array with a 200 when there are no statements at all', async () => {
    findState.docs = [];
    plansState.result = [];
    const res = await GET(makeReq(), params(OID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plans).toEqual([]);
  });
});
