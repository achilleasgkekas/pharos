import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// POST /api/v1/expenses/:id/rescan backs the mobile "re-scan" button on the expense
// detail screen. It is a thin wrapper around the shared `rescanExpense` action (its
// AI-parse/OCR logic is exercised elsewhere), but the ROUTE owns four pieces of logic
// with no other test coverage, and each one DIFFERS from the `receipts/[id]/rescan`
// sibling in a way that's easy to copy-paste wrong:
//
//   1. `useOcr = b.ocr === true` — same strict boolean equality as the receipts sibling.
//   2. Failure remap regex is WIDER here: `/no file|not found|missing/i` (receipts only
//      has `/not found|missing/i`) — it also catches the action's own "No file to scan"
//      error. Matches → 404, everything else → 500. A falsy error falls back to
//      'rescan failed' (also 500, since that string matches none of the three).
//   3. On success, the route does a SECOND, independent read
//      (`Expense.findById(id).select('-rawAiResponse').lean()`) and re-serializes with
//      `trimExpense` — the exact same shape as GET /api/v1/expenses.
//   4. Unlike the receipts sibling, the response body is EXACTLY `{ expense }` — no
//      aiUsed/model/aiError fields leak, even though `rescanExpense` itself returns an
//      `{ ok, expense, error }` shape (the route discards result.expense too, in favour
//      of the fresh select('-rawAiResponse') read). A missing doc on this second read is
//      ITS OWN 404 'not found', independent of the rescan-level failure remap.
//
// We run the REAL apiAuth/apiBody helpers and the REAL (pure) serialize.ts, mocking only
// the DB seam + the rescanExpense action.

const { connectDBMock, userFindOne, userState, expenseFindById, findByIdState, rescanExpenseMock } = vi.hoisted(() => {
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  const userFindOne = vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  const findByIdState: { calls: string[]; select: string[]; doc: unknown } = { calls: [], select: [], doc: null };
  const expenseFindById = vi.fn((id: string) => {
    findByIdState.calls.push(id);
    return { select: (s: string) => { findByIdState.select.push(s); return { lean: async () => findByIdState.doc }; } };
  });
  const rescanExpenseMock = vi.fn();
  return { connectDBMock: vi.fn(async () => {}), userFindOne, userState, expenseFindById, findByIdState, rescanExpenseMock };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/Expense', () => ({ Expense: { findById: expenseFindById } }));
vi.mock('@/app/expenses/actions', () => ({ rescanExpense: rescanExpenseMock }));

import { POST } from './route';

const OID = '507f1f77bcf86cd799439011'; // a well-formed 24-hex ObjectId
const BASE = `http://pharos.local/api/v1/expenses/${OID}/rescan`;

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
  expenseFindById.mockClear();
  rescanExpenseMock.mockReset();
  rescanExpenseMock.mockResolvedValue({ ok: true });
});

describe('POST /api/v1/expenses/:id/rescan — auth + id guard', () => {
  it('401 without a token, without calling rescanExpense', async () => {
    const res = await POST(makeReq({ auth: null }), ctx(OID));
    expect(res.status).toBe(401);
    expect(rescanExpenseMock).not.toHaveBeenCalled();
  });

  it('401 for an unknown token', async () => {
    userState.doc = null;
    const res = await POST(makeReq({ auth: 'Bearer nope' }), ctx(OID));
    expect(res.status).toBe(401);
    expect(rescanExpenseMock).not.toHaveBeenCalled();
  });

  it('400 "bad id" for a malformed id, without calling rescanExpense', async () => {
    const res = await POST(makeReq(), ctx('not-an-oid'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad id' });
    expect(rescanExpenseMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/expenses/:id/rescan — ocr flag (strict boolean)', () => {
  it('ocr:true forces useOcr=true', async () => {
    findByIdState.doc = { _id: 'e1', vendor: 'X' };
    await POST(makeReq({ body: { ocr: true } }), ctx(OID));
    expect(rescanExpenseMock).toHaveBeenCalledWith(OID, true);
  });

  it.each([
    ['missing body', undefined],
    ["truthy non-boolean string 'true'", 'true'],
    ['truthy non-boolean number 1', 1],
    ['explicit false', false],
  ])('%s → useOcr=false', async (_label, ocrVal) => {
    findByIdState.doc = { _id: 'e1', vendor: 'X' };
    const body = ocrVal === undefined ? undefined : { ocr: ocrVal };
    await POST(makeReq({ body }), ctx(OID));
    expect(rescanExpenseMock).toHaveBeenCalledWith(OID, false);
  });
});

describe('POST /api/v1/expenses/:id/rescan — failure remap', () => {
  it('"no file" error → 404 (expense-specific case not present on the receipts sibling)', async () => {
    rescanExpenseMock.mockResolvedValue({ ok: false, error: 'No file to scan' });
    const res = await POST(makeReq(), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'No file to scan' });
    expect(expenseFindById).not.toHaveBeenCalled(); // no second read on failure
  });

  it('"not found" error → 404', async () => {
    rescanExpenseMock.mockResolvedValue({ ok: false, error: 'Expense not found' });
    const res = await POST(makeReq(), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Expense not found' });
  });

  it('"missing" error → 404', async () => {
    rescanExpenseMock.mockResolvedValue({ ok: false, error: 'File missing from storage' });
    const res = await POST(makeReq(), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'File missing from storage' });
  });

  it('an unrelated error → 500', async () => {
    rescanExpenseMock.mockResolvedValue({ ok: false, error: 'AI returned nothing' });
    const res = await POST(makeReq(), ctx(OID));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'AI returned nothing' });
  });

  it('a falsy error falls back to "rescan failed" (also 500, matches none of the three keywords)', async () => {
    rescanExpenseMock.mockResolvedValue({ ok: false, error: undefined });
    const res = await POST(makeReq(), ctx(OID));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'rescan failed' });
  });
});

describe('POST /api/v1/expenses/:id/rescan — success re-read + serialization', () => {
  it('re-reads with -rawAiResponse and returns EXACTLY { expense } via trimExpense (no aiUsed/model/aiError leak)', async () => {
    rescanExpenseMock.mockResolvedValue({ ok: true, expense: { id: 'should-be-ignored' } });
    findByIdState.doc = {
      _id: 'e7',
      kind: 'expense',
      vendor: 'ΔΕΗ',
      category: 'utilities',
      amount: 84,
      currency: 'EUR',
      date: new Date('2026-02-20T00:00:00.000Z'),
      period: '2026-02',
      verified: false,
      // notes/space/paymentMethod intentionally omitted → should fall back per trimExpense defaults
    };
    const res = await POST(makeReq({ body: { ocr: true } }), ctx(OID));
    expect(res.status).toBe(200);
    expect(findByIdState.calls).toEqual([OID]);
    expect(findByIdState.select).toEqual(['-rawAiResponse']); // never ships the debug blob
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['expense']); // nothing else on the envelope
    expect(body.expense).toEqual({
      id: 'e7',
      kind: 'expense',
      vendor: 'ΔΕΗ',
      category: 'utilities',
      space: '',
      amount: 84,
      currency: 'EUR',
      origAmount: 0,
      fxRate: 0,
      date: '2026-02-20T00:00:00.000Z',
      period: '2026-02',
      recurring: false,
      recurringCycle: '',
      paymentMethod: '',
      notes: '',
      file: null,
      thumb: null,
      verified: false,
      updatedAt: null,
      deleted: false,
      split: [],
      taxDeductible: false,
      taxCategory: '',
    });
  });

  it('404 "not found" on the second read, independent of the rescan-level failure remap', async () => {
    rescanExpenseMock.mockResolvedValue({ ok: true });
    findByIdState.doc = null; // deleted between the rescan write and the re-read
    const res = await POST(makeReq(), ctx(OID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });
});
