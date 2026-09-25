import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/bills/actions.ts (P28) is the CRUD + pay/unpay lifecycle for bills / payables —
// never directly unit-tested before. Mirrors the DB-mock pattern from
// vouchers/giftcardActions.test.ts: mock only the DB seam (connectDB/Bill), next/cache's
// revalidatePath, and the cross-module `addExpense` (its own real logic already belongs to
// expenses/actions.ts, tested independently). `safeDateOrNull` (lib/dates.ts) and
// `nextBillDue` (lib/bill.ts) run un-mocked — both are pure, deterministic, and already have
// their own dedicated test files, so exercising the real implementations here pins the actual
// end-to-end wiring instead of a hand-rolled stand-in.
//
// Behaviour pinned:
//  - createBill/updateBill: Zod `BillFormSchema` applies its defaults (vendor/category/
//    cycle/notes), coerces amount to a number, rejects a missing title or dueDate, and runs
//    dueDate through safeDateOrNull — an unparseable string yields `{ok:false, error:'Invalid
//    due date'}` rather than throwing or saving a bad date.
//  - deleteBill: SOFT delete ($set deletedAt via updateOne), not an actual removal.
//  - markBillPaid: not-found short-circuits before any write; opt-in expense logging only
//    fires the FIRST time a bill is paid (guarded by wasPaid), only when no expense is already
//    linked, and only when amount > 0; a recurring bill (cycle set) spawns exactly one NEXT
//    pending instance on first payment (never on a re-mark), due one cycle ahead via the real
//    `nextBillDue`.
//  - markBillUnpaid: clears paidAt only, never touches a linked expense.

//  - P9 multi-currency: the form hands over the PRINTED amount, so `amount` is stored in base
//    currency (origAmount/fxRate remember the paper); an unknown rate is never guessed as 1:1;
//    a logged expense receives the PRINTED figure plus currency + rate (addExpense runs its own
//    resolveFx, so handing it the converted amount would convert twice); and a recurring spawn
//    inherits the whole fx triple.
const {
  connectDBMock,
  billCreate,
  billFindById,
  billFindOne,
  billReplaceOne,
  billFindByIdAndUpdate,
  billUpdateOne,
  addExpenseMock,
  revalidatePathMock,
  getAppSettingsMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  billCreate: vi.fn(async (_doc: Record<string, unknown>) => ({})),
  billFindById: vi.fn(async (_id: string) => null as Record<string, any> | null),
  billFindOne: vi.fn(async (_filter: Record<string, any>) => null as Record<string, any> | null),
  // #33 respawn over a trashed successor (chained .setOptions({ withDeleted: true })).
  billReplaceOne: vi.fn(async (_filter: Record<string, any>, _doc: Record<string, any>) => ({ modifiedCount: 0 })),
  billFindByIdAndUpdate: vi.fn(async (_id: string, _update: Record<string, any>) => ({})),
  billUpdateOne: vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, any>) => ({})),
  addExpenseMock: vi.fn(async (_data: Record<string, unknown>) => ({ ok: true, id: 'exp1' } as { ok: boolean; id?: string; error?: string })),
  revalidatePathMock: vi.fn(),
  // P9: only the base currency matters here; lib/fx.ts itself runs un-mocked (it is pure).
  getAppSettingsMock: vi.fn(async () => ({ currency: 'EUR' }) as { currency: string }),
}));

// Tenancy seam mocked the same way as the sibling tenancy-wrapped action modules
// (vouchers/actions.test.ts, expenses/actions.crud.test.ts): withRequestTenant runs the body
// inline and currentModel hands back the mocked model, so these tests pin the CRUD/lifecycle
// behaviour, not tenant isolation (already covered by lib/tenancy/*.tenant.test.ts).
const billModel = {
  create: billCreate,
  findById: (id: string) => ({ lean: () => billFindById(id) }),
  findOne: (filter: Record<string, any>) => ({ lean: () => billFindOne(filter) }),
  replaceOne: (filter: Record<string, any>, doc: Record<string, any>) => ({ setOptions: () => billReplaceOne(filter, doc) }),
  findByIdAndUpdate: billFindByIdAndUpdate,
  updateOne: billUpdateOne,
};

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async () => billModel }));
vi.mock('@/models/Bill', () => ({ Bill: {} }));
vi.mock('@/app/expenses/actions', () => ({ addExpense: addExpenseMock }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import {
  createBill, updateBill, setBillArchived, deleteBill, markBillPaid, markBillUnpaid,
  logBillPayment, removeBillPayment,
} from './actions';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

// safeDateOrNull builds EU-style dates at LOCAL midnight (no trailing "Z"); comparing via
// toISOString() would shift by a day whenever the runner's TZ offset isn't UTC+0. Compare
// local Y/M/D components instead, which is what the app actually cares about.
function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  billCreate.mockImplementation(async () => ({}));
  billFindById.mockImplementation(async () => null);
  billFindOne.mockImplementation(async () => null);
  billReplaceOne.mockImplementation(async () => ({ modifiedCount: 0 }));
  billFindByIdAndUpdate.mockImplementation(async () => ({}));
  billUpdateOne.mockImplementation(async () => ({}));
  addExpenseMock.mockImplementation(async () => ({ ok: true, id: 'exp1' }));
  revalidatePathMock.mockImplementation(() => undefined);
  getAppSettingsMock.mockImplementation(async () => ({ currency: 'EUR' }));
});

describe('createBill', () => {
  it('a minimal form (title + dueDate) applies every schema default, paidAt:null, archived:false', async () => {
    const res = await createBill(formData({ title: 'ΔΕΗ ρεύμα', dueDate: '15/07/2026' }));
    expect(res).toEqual({ ok: true });
    expect(billCreate).toHaveBeenCalledTimes(1);
    const doc = billCreate.mock.calls[0][0];
    expect(doc.title).toBe('ΔΕΗ ρεύμα');
    expect(doc.vendor).toBe('');
    expect(doc.amount).toBe(0);
    expect(doc.category).toBe('other');
    expect(doc.cycle).toBe('');
    expect(doc.notes).toBe('');
    expect(doc.paidAt).toBeNull();
    expect(doc.archived).toBe(false);
    expect(localYmd(doc.dueDate as Date)).toBe('2026-07-15');
  });

  it('amount is coerced from a form string to a number', async () => {
    await createBill(formData({ title: 'X', dueDate: '01/01/2027', amount: '84.50' }));
    expect(billCreate.mock.calls[0][0].amount).toBe(84.5);
  });

  it('a missing title key is rejected before touching the DB (zod "Required", the key is absent)', async () => {
    const res = await createBill(formData({ dueDate: '01/01/2027' }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Required|Invalid input/);
    expect(billCreate).not.toHaveBeenCalled();
  });

  it('an empty-string title is rejected with the custom min-length message', async () => {
    const res = await createBill(formData({ title: '', dueDate: '01/01/2027' }));
    expect(res).toEqual({ ok: false, error: 'Title required' });
    expect(billCreate).not.toHaveBeenCalled();
  });

  it('a missing dueDate key is rejected before touching the DB (zod "Required", the key is absent)', async () => {
    const res = await createBill(formData({ title: 'X' }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Required|Invalid input/);
    expect(billCreate).not.toHaveBeenCalled();
  });

  it('an empty-string dueDate is rejected with the custom min-length message', async () => {
    const res = await createBill(formData({ title: 'X', dueDate: '' }));
    expect(res).toEqual({ ok: false, error: 'Due date required' });
    expect(billCreate).not.toHaveBeenCalled();
  });

  it('an unparseable dueDate string is rejected AFTER schema passes, before create()', async () => {
    const res = await createBill(formData({ title: 'X', dueDate: 'not-a-date' }));
    expect(res).toEqual({ ok: false, error: 'Invalid due date' });
    expect(billCreate).not.toHaveBeenCalled();
  });

  it('an invalid cycle value fails schema validation', async () => {
    const res = await createBill(formData({ title: 'X', dueDate: '01/01/2027', cycle: 'daily' }));
    expect(res.ok).toBe(false);
    expect(billCreate).not.toHaveBeenCalled();
  });

  it('revalidates /bills after a successful create, not on a validation failure', async () => {
    await createBill(formData({ title: 'X', dueDate: '01/01/2027' }));
    expect(revalidatePathMock).toHaveBeenCalledWith('/bills');
    revalidatePathMock.mockClear();
    await createBill(formData({}));
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe('updateBill', () => {
  it('parses the form and forwards it (with resolved dueDate) to findByIdAndUpdate', async () => {
    const res = await updateBill('bill1', formData({ title: 'ΔΕΗ ρεύμα', dueDate: '20/08/2026', amount: '60' }));
    expect(res).toEqual({ ok: true });
    expect(billFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [id, update] = billFindByIdAndUpdate.mock.calls[0];
    expect(id).toBe('bill1');
    expect(update.title).toBe('ΔΕΗ ρεύμα');
    expect(update.amount).toBe(60);
    expect(localYmd(update.dueDate)).toBe('2026-08-20');
  });

  it('an invalid form throws-free error return, findByIdAndUpdate never runs', async () => {
    const res = await updateBill('bill1', formData({ title: '' }));
    expect(res.ok).toBe(false);
    expect(billFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('an unparseable dueDate is rejected before the update call', async () => {
    const res = await updateBill('bill1', formData({ title: 'X', dueDate: 'garbage' }));
    expect(res).toEqual({ ok: false, error: 'Invalid due date' });
    expect(billFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('revalidates /bills after a successful update', async () => {
    await updateBill('bill1', formData({ title: 'X', dueDate: '01/01/2027' }));
    expect(revalidatePathMock).toHaveBeenCalledWith('/bills');
  });

  // #34: lowering the total below what the instalments already cover used to leave paidAt
  // null, so the bill showed remaining €0 yet stayed Open/Overdue with "Pay the rest (€0.00)".
  it('settles a part-paid bill when the edited amount is now covered by its instalments', async () => {
    const payments = [{ amount: 50, date: new Date(2026, 6, 1) }, { amount: 30, date: new Date(2026, 6, 5) }];
    billFindById
      // updateBill's re-read after saving the new amount
      .mockResolvedValueOnce({ _id: 'b1', title: 'ΔΕΗ', amount: 70, paidAt: null, payments })
      // markBillPaid's own lookup
      .mockResolvedValueOnce({ _id: 'b1', title: 'ΔΕΗ', amount: 70, paidAt: null, cycle: '', linkedExpenseId: '', payments });
    const res = await updateBill('b1', formData({ title: 'ΔΕΗ', dueDate: '01/07/2026', amount: '70' }));
    expect(res).toEqual({ ok: true });
    const stamp = billFindByIdAndUpdate.mock.calls.find(([, u]) => 'paidAt' in u);
    expect(stamp).toBeDefined();
    // Settled on the day the last instalment was handed over, not on the day of the edit.
    expect(localYmd(stamp![1].paidAt)).toBe('2026-07-05');
    // Each instalment already logged its own expense (if asked), so settling books nothing.
    expect(addExpenseMock).not.toHaveBeenCalled();
  });

  it('leaves a bill that still owes money unpaid after an amount edit', async () => {
    billFindById.mockResolvedValueOnce({ _id: 'b1', title: 'ΔΕΗ', amount: 90, paidAt: null, payments: [{ amount: 80, date: new Date() }] });
    await updateBill('b1', formData({ title: 'ΔΕΗ', dueDate: '01/07/2026', amount: '90' }));
    expect(billFindByIdAndUpdate.mock.calls.some(([, u]) => 'paidAt' in u)).toBe(false);
  });

  it('does not re-settle an already paid bill (no second recurring spawn)', async () => {
    billFindById.mockResolvedValueOnce({ _id: 'b1', title: 'ΔΕΗ', amount: 70, paidAt: new Date(), cycle: 'monthly', payments: [{ amount: 80, date: new Date() }] });
    await updateBill('b1', formData({ title: 'ΔΕΗ', dueDate: '01/07/2026', amount: '70' }));
    expect(billCreate).not.toHaveBeenCalled();
    expect(billFindByIdAndUpdate.mock.calls.some(([, u]) => 'paidAt' in u)).toBe(false);
  });
});

describe('setBillArchived', () => {
  it('sets archived:true and revalidates', async () => {
    const res = await setBillArchived('bill1', true);
    expect(res).toEqual({ ok: true });
    expect(billFindByIdAndUpdate).toHaveBeenCalledWith('bill1', { archived: true });
    expect(revalidatePathMock).toHaveBeenCalledWith('/bills');
  });

  it('sets archived:false', async () => {
    await setBillArchived('bill1', false);
    expect(billFindByIdAndUpdate).toHaveBeenCalledWith('bill1', { archived: false });
  });
});

describe('deleteBill', () => {
  it('is a soft delete: $set deletedAt via updateOne, not an actual removal', async () => {
    const res = await deleteBill('bill1');
    expect(res).toEqual({ ok: true });
    expect(billUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = billUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'bill1' });
    expect(update.$set.deletedAt).toBeInstanceOf(Date);
    expect(revalidatePathMock).toHaveBeenCalledWith('/bills');
  });
});

describe('markBillPaid', () => {
  it('a missing bill short-circuits: no update, no expense, no revalidate', async () => {
    billFindById.mockResolvedValueOnce(null);
    const res = await markBillPaid('ghost');
    expect(res).toEqual({ ok: false, error: 'Bill not found' });
    expect(billFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(addExpenseMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('marks paidAt to "now" by default and keeps the existing linkedExpenseId untouched', async () => {
    billFindById.mockResolvedValueOnce({ _id: 'b1', title: 'X', paidAt: null, cycle: '', linkedExpenseId: 'exp-old' });
    const before = Date.now();
    const res = await markBillPaid('b1');
    expect(res).toEqual({ ok: true });
    const [id, update] = billFindByIdAndUpdate.mock.calls[0];
    expect(id).toBe('b1');
    expect(update.paidAt).toBeInstanceOf(Date);
    expect((update.paidAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect(update.linkedExpenseId).toBe('exp-old');
    expect(addExpenseMock).not.toHaveBeenCalled(); // no logExpense opt-in
    expect(revalidatePathMock).toHaveBeenCalledWith('/bills');
  });

  it('an explicit opts.paidDate is parsed via safeDateOrNull', async () => {
    billFindById.mockResolvedValueOnce({ _id: 'b1', title: 'X', paidAt: null, cycle: '', linkedExpenseId: '' });
    await markBillPaid('b1', { paidDate: '05/06/2026' });
    const update = billFindByIdAndUpdate.mock.calls[0][1];
    expect(localYmd(update.paidAt)).toBe('2026-06-05');
  });

  it('a blank/unparseable opts.paidDate falls back to "now" instead of throwing', async () => {
    billFindById.mockResolvedValueOnce({ _id: 'b1', title: 'X', paidAt: null, cycle: '', linkedExpenseId: '' });
    const before = Date.now();
    await markBillPaid('b1', { paidDate: 'not-a-date' });
    const update = billFindByIdAndUpdate.mock.calls[0][1];
    expect((update.paidAt as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('logExpense:true on a fresh (unpaid, unlinked, amount>0) bill logs a matching expense and links it', async () => {
    billFindById.mockResolvedValueOnce({
      _id: 'b1', title: 'ΔΕΗ ρεύμα', vendor: 'ΔΕΗ', category: 'utilities', amount: 84.5,
      paidAt: null, cycle: '', linkedExpenseId: '',
    });
    addExpenseMock.mockResolvedValueOnce({ ok: true, id: 'exp-new' });
    await markBillPaid('b1', { logExpense: true });
    expect(addExpenseMock).toHaveBeenCalledTimes(1);
    const call = addExpenseMock.mock.calls[0][0];
    expect(call.kind).toBe('expense');
    expect(call.vendor).toBe('ΔΕΗ');
    expect(call.category).toBe('utilities');
    expect(call.amount).toBe(84.5);
    expect(call.notes).toBe('Bill: ΔΕΗ ρεύμα');
    expect(call.verified).toBe(true);
    const update = billFindByIdAndUpdate.mock.calls[0][1];
    expect(update.linkedExpenseId).toBe('exp-new');
  });

  it('logExpense:true falls back to the bill title as vendor when vendor is blank', async () => {
    billFindById.mockResolvedValueOnce({ _id: 'b1', title: 'Κοινόχρηστα', vendor: '', amount: 40, paidAt: null, cycle: '', linkedExpenseId: '' });
    await markBillPaid('b1', { logExpense: true });
    expect(addExpenseMock.mock.calls[0][0].vendor).toBe('Κοινόχρηστα');
  });

  it('logExpense:true is skipped when the bill was already paid (re-mark), even with no linked expense', async () => {
    billFindById.mockResolvedValueOnce({ _id: 'b1', title: 'X', amount: 40, paidAt: new Date('2026-01-01'), cycle: '', linkedExpenseId: '' });
    await markBillPaid('b1', { logExpense: true });
    expect(addExpenseMock).not.toHaveBeenCalled();
  });

  it('logExpense:true is skipped when an expense is already linked', async () => {
    billFindById.mockResolvedValueOnce({ _id: 'b1', title: 'X', amount: 40, paidAt: null, cycle: '', linkedExpenseId: 'exp-old' });
    await markBillPaid('b1', { logExpense: true });
    expect(addExpenseMock).not.toHaveBeenCalled();
    expect(billFindByIdAndUpdate.mock.calls[0][1].linkedExpenseId).toBe('exp-old');
  });

  it('logExpense:true is skipped when amount is 0 (nothing meaningful to log)', async () => {
    billFindById.mockResolvedValueOnce({ _id: 'b1', title: 'X', amount: 0, paidAt: null, cycle: '', linkedExpenseId: '' });
    await markBillPaid('b1', { logExpense: true });
    expect(addExpenseMock).not.toHaveBeenCalled();
  });

  it('when addExpense fails, linkedExpenseId stays empty (no crash, no partial link)', async () => {
    billFindById.mockResolvedValueOnce({ _id: 'b1', title: 'X', amount: 40, paidAt: null, cycle: '', linkedExpenseId: '' });
    addExpenseMock.mockResolvedValueOnce({ ok: false, error: 'boom' });
    const res = await markBillPaid('b1', { logExpense: true });
    expect(res).toEqual({ ok: true });
    expect(billFindByIdAndUpdate.mock.calls[0][1].linkedExpenseId).toBe('');
  });

  it('a recurring bill (cycle set) spawns exactly one next pending instance, due one cycle ahead', async () => {
    billFindById.mockResolvedValueOnce({
      _id: 'b1', title: 'ΔΕΗ ρεύμα', vendor: 'ΔΕΗ', amount: 84.5, category: 'utilities',
      cycle: 'monthly', notes: 'bimonthly', paidAt: null, linkedExpenseId: '',
      dueDate: new Date('2026-06-15'),
    });
    await markBillPaid('b1');
    expect(billCreate).toHaveBeenCalledTimes(1);
    const spawned = billCreate.mock.calls[0][0];
    expect(spawned.title).toBe('ΔΕΗ ρεύμα');
    expect(spawned.paidAt).toBeNull();
    expect(spawned.archived).toBe(false);
    expect(spawned.cycle).toBe('monthly');
    expect(localYmd(spawned.dueDate as Date)).toBe('2026-07-15');
  });

  it('a recurring bill does NOT spawn a next instance on a re-mark (already paid)', async () => {
    billFindById.mockResolvedValueOnce({
      _id: 'b1', title: 'X', amount: 40, cycle: 'monthly', paidAt: new Date('2026-01-01'),
      linkedExpenseId: '', dueDate: new Date('2026-06-15'),
    });
    await markBillPaid('b1');
    expect(billCreate).not.toHaveBeenCalled();
  });

  it('a one-off bill (no cycle) never spawns a next instance', async () => {
    billFindById.mockResolvedValueOnce({ _id: 'b1', title: 'X', amount: 40, cycle: '', paidAt: null, linkedExpenseId: '', dueDate: new Date('2026-06-15') });
    await markBillPaid('b1');
    expect(billCreate).not.toHaveBeenCalled();
  });
});

// #33 — "mark paid → Undo → mark paid" on a recurring bill used to spawn a SECOND copy of
// the next instance: Undo only clears paidAt, so the re-payment looked like a first payment.
// Driven against a tiny in-memory store (not per-call stubs) so the test follows the real
// sequence of reads and writes instead of pinning one query shape.
describe('recurring spawn survives Undo (#33)', () => {
  type Doc = Record<string, any>;
  let store: Map<string, Doc>;
  // Just enough of Mongo's matcher for the lookups the action makes: equality (Dates by
  // value), null, $ne, $in, $gt/$lt on Dates, and a top-level $or.
  const matches = (doc: Doc, filter: Doc): boolean =>
    Object.entries(filter).every(([k, v]) => {
      if (k === '$or') return (v as Doc[]).some((f) => matches(doc, f));
      const actual = doc[k];
      if (v === null) return actual == null;
      if (v && typeof v === 'object' && ('$gt' in v || '$lt' in v)) {
        const t = actual instanceof Date ? actual.getTime() : NaN;
        const { $gt, $lt } = v as { $gt?: Date; $lt?: Date };
        return (!$gt || t > $gt.getTime()) && (!$lt || t < $lt.getTime());
      }
      if (v && typeof v === 'object' && '$ne' in v) return v.$ne === null ? actual != null : actual !== v.$ne;
      if (v && typeof v === 'object' && '$in' in v) return (v.$in as unknown[]).some((x) => (x == null ? actual == null : actual === x));
      if (v instanceof Date) return actual instanceof Date && actual.getTime() === v.getTime();
      return actual === v;
    });
  const successors = () => [...store.values()].filter((d) => d._id !== 'b1');

  beforeEach(() => {
    store = new Map([['b1', {
      _id: 'b1', title: 'Ενοίκιο', vendor: '', amount: 100, category: 'housing', cycle: 'monthly',
      notes: '', paidAt: null, linkedExpenseId: '', dueDate: new Date(2026, 5, 15),
    }]]);
    billFindById.mockImplementation(async (id) => (store.has(id) ? { ...store.get(id)! } : null));
    // Yield before answering, like a real round trip, so concurrent callers can interleave.
    // Trashed rows are hidden, as the soft-delete plugin does.
    billFindOne.mockImplementation(async (filter) => {
      await new Promise((r) => setTimeout(r, 0));
      return [...store.values()].find((d) => d.deletedAt == null && matches(d, filter)) ?? null;
    });
    billFindByIdAndUpdate.mockImplementation(async (id, update) => { Object.assign(store.get(id)!, update); return {}; });
    // The unique _id index: a second insert with the same id fails whether or not the holder is trashed.
    billCreate.mockImplementation(async (doc) => {
      await new Promise((r) => setTimeout(r, 0));
      if (store.has(doc._id as string)) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      store.set(doc._id as string, { ...doc });
      return { _id: doc._id };
    });
    billReplaceOne.mockImplementation(async (filter, doc) => {
      const hit = [...store.values()].find((d) => matches(d, filter));
      if (!hit) return { modifiedCount: 0 };
      store.set(hit._id, { ...doc });
      return { modifiedCount: 1 };
    });
  });

  it('paying again after Undo does not create a second next instance', async () => {
    await markBillPaid('b1');
    await markBillUnpaid('b1');
    await markBillPaid('b1');
    expect(successors()).toHaveLength(1);
    expect(localYmd(successors()[0].dueDate)).toBe('2026-07-15');
    expect(successors()[0].recurrenceParentId).toBe('b1');
  });

  it('recognises a successor spawned before the parent link existed (legacy row)', async () => {
    // Paid before this fix shipped: the July row exists but carries no recurrenceParentId.
    store.set('legacy', {
      ...store.get('b1'), _id: 'legacy', title: 'Ενοίκιο', cycle: 'monthly', paidAt: null, dueDate: new Date(2026, 6, 15),
    });
    await markBillPaid('b1');
    expect(billCreate).not.toHaveBeenCalled();
  });

  // Codex review of ddca036: users correct the projected row when the real bill arrives, so a
  // legacy successor must still be recognised after its due date or its title was edited.
  it('recognises a legacy successor whose due date was moved within the next cycle', async () => {
    store.set('legacy', {
      ...store.get('b1'), _id: 'legacy', title: 'Ενοίκιο', cycle: 'monthly', paidAt: null, dueDate: new Date(2026, 6, 20),
    });
    await markBillPaid('b1');
    expect(billCreate).not.toHaveBeenCalled();
  });

  it('recognises a legacy successor whose title was corrected but every copied field kept', async () => {
    store.set('legacy', {
      _id: 'legacy', title: 'Ενοίκιο Ιουλίου', vendor: '', amount: 100, category: 'housing', cycle: 'monthly',
      notes: '', paidAt: null, dueDate: new Date(2026, 6, 15),
    });
    await markBillPaid('b1');
    expect(billCreate).not.toHaveBeenCalled();
  });

  it('an unrelated manually entered bill on the same next due date does not suppress the successor', async () => {
    store.set('internet', {
      _id: 'internet', title: 'Internet', vendor: 'Cosmote', amount: 30, category: 'utilities', cycle: 'monthly',
      notes: '', paidAt: null, dueDate: new Date(2026, 6, 15),
    });
    await markBillPaid('b1');
    expect(successors().filter((d) => d.recurrenceParentId === 'b1')).toHaveLength(1);
  });

  it.each(['vendor', 'amount', 'category', 'notes', 'currency'])('a same-title bill with different %s does not suppress the next occurrence', async (field) => {
    const parent = store.get('b1')!;
    const other: Doc = { ...parent, _id: 'other', dueDate: new Date(2026, 5, 20) };
    other[field] = field === 'amount' ? 250 : 'different';
    store.set('other', other);
    await markBillPaid('b1');
    expect(successors().filter((d) => d.recurrenceParentId === 'b1')).toHaveLength(1);
  });

  it('a same-title bill two cycles ahead does not count as the next instance', async () => {
    store.set('august', {
      ...store.get('b1'), _id: 'august', title: 'Ενοίκιο', cycle: 'monthly', paidAt: null, dueDate: new Date(2026, 7, 15),
    });
    await markBillPaid('b1');
    expect(successors().filter((d) => d.recurrenceParentId === 'b1')).toHaveLength(1);
  });

  it('two payments landing at the same moment create only one next instance', async () => {
    await Promise.all([markBillPaid('b1'), markBillPaid('b1')]);
    expect(successors()).toHaveLength(1);
  });

  it('a payment whose paidAt write fails can be retried without losing or duplicating the successor', async () => {
    // The spawn runs first, so the failed attempt leaves the bill UNPAID (retryable) rather than
    // paid with no successor and a wasPaid guard that would never let it spawn again.
    billFindByIdAndUpdate.mockRejectedValueOnce(new Error('connection reset'));
    await expect(markBillPaid('b1')).rejects.toThrow('connection reset');
    expect(store.get('b1')!.paidAt).toBeNull();
    await markBillPaid('b1');
    expect(store.get('b1')!.paidAt).toBeInstanceOf(Date);
    expect(successors()).toHaveLength(1);
  });

  it('a failed spawn does not mark the bill paid', async () => {
    billCreate.mockRejectedValueOnce(new Error('write concern timeout'));
    await expect(markBillPaid('b1')).rejects.toThrow('write concern timeout');
    expect(store.get('b1')!.paidAt).toBeNull();
  });

  it('still spawns when the earlier successor was trashed, replacing it rather than adding a second row', async () => {
    await markBillPaid('b1');
    const [july] = successors();
    july.deletedAt = new Date();
    july.amount = 999; // edited before trashing: the respawn is a fresh projection, not a restore
    await markBillUnpaid('b1');
    await markBillPaid('b1');
    expect(successors()).toHaveLength(1);
    expect(successors()[0].deletedAt).toBeNull();
    expect(successors()[0].amount).toBe(100);
  });
});

describe('markBillUnpaid', () => {
  it('clears paidAt only and revalidates, without touching any linked expense', async () => {
    const res = await markBillUnpaid('b1');
    expect(res).toEqual({ ok: true });
    expect(billFindByIdAndUpdate).toHaveBeenCalledWith('b1', { paidAt: null });
    expect(revalidatePathMock).toHaveBeenCalledWith('/bills');
  });
});

describe('P9 multi-currency', () => {
  it('a base-currency bill stores the amount untouched, with origAmount/fxRate at 0', async () => {
    await createBill(formData({ title: 'ΔΕΗ', dueDate: '15/07/2026', amount: '84.50', currency: 'EUR' }));
    const doc = billCreate.mock.calls[0][0];
    expect(doc.amount).toBe(84.5);
    expect(doc.currency).toBe('EUR');
    expect(doc.origAmount).toBe(0);
    expect(doc.fxRate).toBe(0);
  });

  it('a form with no currency field at all behaves exactly like a single-currency deployment', async () => {
    await createBill(formData({ title: 'X', dueDate: '15/07/2026', amount: '20' }));
    const doc = billCreate.mock.calls[0][0];
    expect(doc.amount).toBe(20);
    expect(doc.origAmount).toBe(0);
    expect(doc.fxRate).toBe(0);
  });

  // #230 — the test above passed for the wrong reason: the schema defaulted the missing field to
  // 'EUR', which happens to equal the base currency used here. With any other base, that default
  // declared the bill FOREIGN with no rate, so the printed amount was stored untouched and
  // flagged `needsRate` — a bill that quietly stopped being comparable with the rest of the
  // ledger. The picker is only rendered when multi-currency is ON, so "no currency field" is the
  // NORMAL case for a single-currency deployment, not an edge one.
  it('a missing currency is the BASE currency, whatever the base happens to be', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ currency: 'GBP' }));
    await createBill(formData({ title: 'Council tax', dueDate: '15/07/2026', amount: '120' }));
    const doc = billCreate.mock.calls[0][0];
    expect(doc.amount).toBe(120);      // stored as base, not held back as un-converted foreign
    expect(doc.currency).toBe('GBP');
    expect(doc.origAmount).toBe(0);    // nothing "printed in another currency" to remember
    expect(doc.fxRate).toBe(0);
  });

  it('still treats an explicitly foreign currency as foreign under a non-euro base', async () => {
    getAppSettingsMock.mockImplementation(async () => ({ currency: 'GBP' }));
    await createBill(formData({ title: 'AWS', dueDate: '15/07/2026', amount: '50', currency: 'EUR', fxRate: '0.85' }));
    const doc = billCreate.mock.calls[0][0];
    expect(doc.currency).toBe('EUR');
    expect(doc.origAmount).toBe(50);
    expect(doc.fxRate).toBe(0.85);
  });

  it('a foreign bill with a rate stores base currency in amount and the printed figure in origAmount', async () => {
    await createBill(formData({ title: 'AWS', dueDate: '15/07/2026', amount: '88', currency: 'USD', fxRate: '0.92' }));
    const doc = billCreate.mock.calls[0][0];
    expect(doc.amount).toBe(80.96); // 88 * 0.92
    expect(doc.currency).toBe('USD');
    expect(doc.origAmount).toBe(88);
    expect(doc.fxRate).toBe(0.92);
  });

  it('a foreign bill with NO rate keeps the printed number (never guesses 1:1) and flags itself via fxRate 0', async () => {
    await createBill(formData({ title: 'AWS', dueDate: '15/07/2026', amount: '88', currency: 'USD' }));
    const doc = billCreate.mock.calls[0][0];
    expect(doc.amount).toBe(88);
    expect(doc.origAmount).toBe(88);
    expect(doc.fxRate).toBe(0);
  });

  it('the base currency comes from settings, so a USD deployment treats USD as ordinary and EUR as foreign', async () => {
    getAppSettingsMock.mockResolvedValueOnce({ currency: 'USD' });
    await createBill(formData({ title: 'X', dueDate: '15/07/2026', amount: '88', currency: 'USD', fxRate: '0.92' }));
    const doc = billCreate.mock.calls[0][0];
    expect(doc.amount).toBe(88); // same currency: the rate is irrelevant, nothing is converted
    expect(doc.origAmount).toBe(0);
    expect(doc.fxRate).toBe(0);
  });

  it('updateBill re-resolves: the form always sends the PRINTED amount, so an unchanged re-save is idempotent', async () => {
    await updateBill('b1', formData({ title: 'AWS', dueDate: '15/07/2026', amount: '88', currency: 'USD', fxRate: '0.92' }));
    const first = billFindByIdAndUpdate.mock.calls[0][1];
    expect(first.amount).toBe(80.96);
    expect(first.origAmount).toBe(88);
    // Re-saving the same form (printed 88 again) must land on the same stored figure, not 74.48.
    await updateBill('b1', formData({ title: 'AWS', dueDate: '15/07/2026', amount: '88', currency: 'USD', fxRate: '0.92' }));
    expect(billFindByIdAndUpdate.mock.calls[1][1].amount).toBe(80.96);
  });

  it('clearing the currency back to base wipes origAmount/fxRate instead of leaving stale fx fields', async () => {
    await updateBill('b1', formData({ title: 'AWS', dueDate: '15/07/2026', amount: '80.96', currency: 'EUR', fxRate: '' }));
    const update = billFindByIdAndUpdate.mock.calls[0][1];
    expect(update.amount).toBe(80.96);
    expect(update.currency).toBe('EUR');
    expect(update.origAmount).toBe(0);
    expect(update.fxRate).toBe(0);
  });

  it('logExpense hands addExpense the PRINTED amount + currency + rate, so it is not converted twice', async () => {
    billFindById.mockResolvedValueOnce({
      _id: 'b1', title: 'AWS', vendor: 'AWS', category: 'other', amount: 80.96,
      currency: 'USD', origAmount: 88, fxRate: 0.92, paidAt: null, cycle: '', linkedExpenseId: '',
    });
    await markBillPaid('b1', { logExpense: true });
    const call = addExpenseMock.mock.calls[0][0];
    expect(call.amount).toBe(88); // NOT 80.96 — addExpense runs its own resolveFx
    expect(call.currency).toBe('USD');
    expect(call.fxRate).toBe(0.92);
  });

  it('logExpense on an ordinary bill still passes its plain amount, with no currency override', async () => {
    billFindById.mockResolvedValueOnce({
      _id: 'b1', title: 'ΔΕΗ', vendor: 'ΔΕΗ', amount: 84.5, currency: 'EUR', origAmount: 0, fxRate: 0,
      paidAt: null, cycle: '', linkedExpenseId: '',
    });
    await markBillPaid('b1', { logExpense: true });
    const call = addExpenseMock.mock.calls[0][0];
    expect(call.amount).toBe(84.5);
    expect(call.fxRate).toBe(0);
  });

  it('a foreign bill with no rate yet logs its printed amount and passes the missing rate straight through', async () => {
    billFindById.mockResolvedValueOnce({
      _id: 'b1', title: 'AWS', vendor: 'AWS', amount: 88, currency: 'USD', origAmount: 88, fxRate: 0,
      paidAt: null, cycle: '', linkedExpenseId: '',
    });
    await markBillPaid('b1', { logExpense: true });
    const call = addExpenseMock.mock.calls[0][0];
    expect(call.amount).toBe(88);
    expect(call.currency).toBe('USD');
    expect(call.fxRate).toBe(0); // stays flagged as "needs a rate" downstream too
  });

  it('a recurring spawn inherits the whole fx triple, so the projection stays base-denominated', async () => {
    billFindById.mockResolvedValueOnce({
      _id: 'b1', title: 'AWS', vendor: 'AWS', amount: 80.96, currency: 'USD', origAmount: 88, fxRate: 0.92,
      category: 'other', cycle: 'monthly', notes: '', paidAt: null, linkedExpenseId: '',
      dueDate: new Date('2026-06-15'),
    });
    await markBillPaid('b1');
    const spawned = billCreate.mock.calls[0][0];
    expect(spawned.amount).toBe(80.96);
    expect(spawned.currency).toBe('USD');
    expect(spawned.origAmount).toBe(88);
    expect(spawned.fxRate).toBe(0.92);
  });
});

// ---------------------------------------------------------------------------
// P61 — partial payments. What matters here is that the two paths stay separate:
// an ordinary bill keeps behaving exactly as it did before instalments existed,
// and an instalment bill settles ITSELF (paidAt + recurring spawn) the moment the
// payments cover the amount, without a second manual action and without booking
// the same money twice as an expense.
// ---------------------------------------------------------------------------
describe('logBillPayment', () => {
  it('rejects a zero or negative amount before touching the DB', async () => {
    const res = await logBillPayment('b1', { amount: 0 });
    expect(res.ok).toBe(false);
    expect(billUpdateOne).not.toHaveBeenCalled();
  });

  it('not-found short-circuits before any write', async () => {
    billFindById.mockResolvedValueOnce(null);
    const res = await logBillPayment('nope', { amount: 10 });
    expect(res).toEqual({ ok: false, error: 'Bill not found' });
    expect(billUpdateOne).not.toHaveBeenCalled();
  });

  it('refuses to log against an already-paid bill', async () => {
    billFindById.mockResolvedValueOnce({ _id: 'b1', title: 'X', amount: 100, paidAt: new Date(), payments: [] });
    const res = await logBillPayment('b1', { amount: 10 });
    expect(res).toEqual({ ok: false, error: 'Bill is already paid' });
    expect(billUpdateOne).not.toHaveBeenCalled();
  });

  it('pushes the instalment and leaves a still-owing bill unpaid', async () => {
    billFindById
      .mockResolvedValueOnce({ _id: 'b1', title: 'Κοινόχρηστα', vendor: '', amount: 300, paidAt: null, payments: [] })
      .mockResolvedValueOnce({ _id: 'b1', amount: 300, paidAt: null, payments: [{ amount: 100 }] });
    const res = await logBillPayment('b1', { amount: 100, date: '05/07/2026', note: '1st' });
    expect(res).toEqual({ ok: true, settled: false });
    const [, update] = billUpdateOne.mock.calls[0];
    expect(update.$push.payments.amount).toBe(100);
    expect(update.$push.payments.note).toBe('1st');
    expect(localYmd(update.$push.payments.date)).toBe('2026-07-05');
    // Not settled → no paidAt stamp, no recurring spawn.
    expect(billFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(billCreate).not.toHaveBeenCalled();
  });

  it('settles the bill by itself once the instalments cover the amount', async () => {
    billFindById
      .mockResolvedValueOnce({ _id: 'b1', title: 'Κοινόχρηστα', amount: 300, paidAt: null, payments: [{ amount: 200 }] })
      .mockResolvedValueOnce({ _id: 'b1', amount: 300, paidAt: null, payments: [{ amount: 200 }, { amount: 100 }] })
      // third read = markBillPaid's own lookup
      .mockResolvedValueOnce({ _id: 'b1', title: 'Κοινόχρηστα', amount: 300, paidAt: null, cycle: '', linkedExpenseId: '', payments: [{ amount: 200 }, { amount: 100 }] });
    const res = await logBillPayment('b1', { amount: 100, date: '20/07/2026' });
    expect(res).toEqual({ ok: true, settled: true });
    const [, update] = billFindByIdAndUpdate.mock.calls[0];
    // paidAt is stamped with THIS payment's date, not "now".
    expect(localYmd(update.paidAt)).toBe('2026-07-20');
  });

  it('a foreign bill without an exchange rate is not auto-settled by payments', async () => {
    billFindById
      .mockResolvedValueOnce({ _id: 'b1', title: 'AWS', amount: 100, currency: 'USD', origAmount: 100, fxRate: 0, paidAt: null, payments: [] })
      .mockResolvedValueOnce({ _id: 'b1', amount: 100, currency: 'USD', origAmount: 100, fxRate: 0, paidAt: null, payments: [{ amount: 100 }] });
    const res = await logBillPayment('b1', { amount: 100, date: '05/07/2026' });
    expect(res).toEqual({ ok: true, settled: false });
    expect(billFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('the settling call never double-books an expense for the final instalment', async () => {
    billFindById
      .mockResolvedValueOnce({ _id: 'b1', title: 'Κοινόχρηστα', vendor: 'ΔΕΗ', amount: 100, category: 'utilities', paidAt: null, payments: [] })
      .mockResolvedValueOnce({ _id: 'b1', amount: 100, paidAt: null, payments: [{ amount: 100 }] })
      .mockResolvedValueOnce({ _id: 'b1', title: 'Κοινόχρηστα', vendor: 'ΔΕΗ', amount: 100, paidAt: null, cycle: '', linkedExpenseId: '', payments: [{ amount: 100 }] });
    await logBillPayment('b1', { amount: 100, logExpense: true });
    // Exactly ONE expense: the payment's own, not a second one from the settling path.
    expect(addExpenseMock).toHaveBeenCalledTimes(1);
    expect(addExpenseMock.mock.calls[0][0].amount).toBe(100);
  });

  it('an opt-in expense books the instalment, base-denominated, with no fx re-conversion', async () => {
    billFindById
      .mockResolvedValueOnce({ _id: 'b1', title: 'AWS', vendor: 'AWS', amount: 80.96, currency: 'USD', origAmount: 88, fxRate: 0.92, category: 'other', paidAt: null, payments: [] })
      .mockResolvedValueOnce({ _id: 'b1', amount: 80.96, paidAt: null, payments: [{ amount: 40 }] });
    await logBillPayment('b1', { amount: 40, logExpense: true });
    const call = addExpenseMock.mock.calls[0][0];
    expect(call.amount).toBe(40);
    // Instalments are already base currency, so no currency/rate is handed over at all.
    expect(call.currency).toBeUndefined();
    expect(call.fxRate).toBeUndefined();
  });

  it('logs nothing as an expense when the opt-in is off', async () => {
    billFindById
      .mockResolvedValueOnce({ _id: 'b1', title: 'X', amount: 300, paidAt: null, payments: [] })
      .mockResolvedValueOnce({ _id: 'b1', amount: 300, paidAt: null, payments: [{ amount: 50 }] });
    await logBillPayment('b1', { amount: 50 });
    expect(addExpenseMock).not.toHaveBeenCalled();
  });

  it('a recurring bill spawns its next instance through the settling path, exactly once', async () => {
    billFindById
      .mockResolvedValueOnce({ _id: 'b1', title: 'ΔΕΗ', amount: 100, paidAt: null, payments: [{ amount: 60 }] })
      .mockResolvedValueOnce({ _id: 'b1', amount: 100, paidAt: null, payments: [{ amount: 60 }, { amount: 40 }] })
      .mockResolvedValueOnce({
        _id: 'b1', title: 'ΔΕΗ', vendor: 'ΔΕΗ', amount: 100, category: 'utilities', cycle: 'monthly',
        notes: '', paidAt: null, linkedExpenseId: '', dueDate: new Date('2026-06-15'),
        payments: [{ amount: 60 }, { amount: 40 }],
      });
    await logBillPayment('b1', { amount: 40 });
    expect(billCreate).toHaveBeenCalledTimes(1);
    const spawned = billCreate.mock.calls[0][0];
    expect(spawned.paidAt).toBeNull();
    expect(localYmd(spawned.dueDate as Date)).toBe('2026-07-15');
  });
});

describe('markBillPaid on a part-paid bill', () => {
  it('an opt-in expense books only what is LEFT, not the full amount again', async () => {
    billFindById.mockResolvedValueOnce({
      _id: 'b1', title: 'Κοινόχρηστα', vendor: 'ΔΕΗ', amount: 300, category: 'utilities',
      paidAt: null, cycle: '', linkedExpenseId: '', payments: [{ amount: 200 }],
    });
    await markBillPaid('b1', { logExpense: true });
    const call = addExpenseMock.mock.calls[0][0];
    expect(call.amount).toBe(100);
    expect(call.currency).toBeUndefined(); // remaining is base-denominated by construction
  });

  it('a bill with no instalments keeps its original full-amount behaviour', async () => {
    billFindById.mockResolvedValueOnce({
      _id: 'b1', title: 'ΔΕΗ', vendor: 'ΔΕΗ', amount: 62, category: 'utilities',
      paidAt: null, cycle: '', linkedExpenseId: '', payments: [],
    });
    await markBillPaid('b1', { logExpense: true });
    expect(addExpenseMock.mock.calls[0][0].amount).toBe(62);
  });

  it('skips logging a final-payment expense for a part-paid foreign bill with no rate, avoiding double booking or invalid amounts', async () => {
    billFindById.mockResolvedValueOnce({
      _id: 'b1', title: 'Import Tax', amount: 100, origAmount: 100, currency: 'USD', fxRate: 0,
      paidAt: null, linkedExpenseId: '', payments: [{ amount: 50 }],
    });
    const res = await markBillPaid('b1', { logExpense: true });
    expect(res.ok).toBe(true);
    expect(addExpenseMock).not.toHaveBeenCalled(); // No safe way to know the remaining base-currency amount
  });
});

describe('removeBillPayment', () => {
  it('not-found short-circuits before any write', async () => {
    billFindById.mockResolvedValueOnce(null);
    const res = await removeBillPayment('nope', 'p1');
    expect(res).toEqual({ ok: false, error: 'Bill not found' });
    expect(billUpdateOne).not.toHaveBeenCalled();
  });

  it('pulls the instalment by id', async () => {
    billFindById
      .mockResolvedValueOnce({ _id: 'b1', amount: 300, paidAt: null, payments: [{ amount: 100 }] })
      .mockResolvedValueOnce({ _id: 'b1', amount: 300, paidAt: null, payments: [] });
    const res = await removeBillPayment('b1', 'p1');
    expect(res).toEqual({ ok: true });
    expect(billUpdateOne.mock.calls[0][1]).toEqual({ $pull: { payments: { _id: 'p1' } } });
  });

  it('never rolls back a settlement for a foreign bill without a rate, because it could never auto-settle', async () => {
    billFindById
      .mockResolvedValueOnce({ _id: 'b1', amount: 300, currency: 'USD', origAmount: 300, fxRate: 0, paidAt: new Date(), payments: [{ amount: 300 }] })
      .mockResolvedValueOnce({ _id: 'b1', amount: 300, currency: 'USD', origAmount: 300, fxRate: 0, paidAt: new Date(), payments: [] });
    await removeBillPayment('b1', 'p1');
    expect(billUpdateOne).toHaveBeenCalledTimes(1); // pull only
  });

  it('rolls back an automatic settlement when the remaining instalments no longer cover the bill', async () => {
    billFindById
      .mockResolvedValueOnce({ _id: 'b1', amount: 300, paidAt: new Date(), payments: [{ amount: 200 }, { amount: 100 }] })
      .mockResolvedValueOnce({ _id: 'b1', amount: 300, paidAt: new Date(), payments: [{ amount: 200 }] });
    await removeBillPayment('b1', 'p2');
    expect(billUpdateOne).toHaveBeenCalledTimes(2);
    expect(billUpdateOne.mock.calls[1][1]).toEqual({ $set: { paidAt: null } });
  });

  // #203 — the case the old `payments.length > 0` guard could not express: ONE instalment that
  // covered the whole bill, then removed. The count drops to 0, so the guard failed and the bill
  // stayed marked paid with nothing paid against it. What separates this from the test below is
  // not the number of payments left but whether the payments THEMSELVES settled the bill.
  it('rolls back a settlement made by a single instalment when that instalment is removed', async () => {
    billFindById
      .mockResolvedValueOnce({ _id: 'b1', amount: 300, paidAt: new Date(), payments: [{ amount: 300 }] })
      .mockResolvedValueOnce({ _id: 'b1', amount: 300, paidAt: new Date(), payments: [] });
    await removeBillPayment('b1', 'p1');
    expect(billUpdateOne).toHaveBeenCalledTimes(2);
    expect(billUpdateOne.mock.calls[1][1]).toEqual({ $set: { paidAt: null } });
  });

  it('an overpaying single instalment is treated the same way', async () => {
    billFindById
      .mockResolvedValueOnce({ _id: 'b1', amount: 300, paidAt: new Date(), payments: [{ amount: 320 }] })
      .mockResolvedValueOnce({ _id: 'b1', amount: 300, paidAt: new Date(), payments: [] });
    await removeBillPayment('b1', 'p1');
    expect(billUpdateOne.mock.calls[1][1]).toEqual({ $set: { paidAt: null } });
  });

  it('leaves a hand-marked paid bill (no instalments left) alone', async () => {
    billFindById
      .mockResolvedValueOnce({ _id: 'b1', amount: 300, paidAt: new Date(), payments: [{ amount: 50 }] })
      .mockResolvedValueOnce({ _id: 'b1', amount: 300, paidAt: new Date(), payments: [] });
    await removeBillPayment('b1', 'p1');
    // Only the $pull — an explicit "mark paid" is never undone as a side effect.
    expect(billUpdateOne).toHaveBeenCalledTimes(1);
  });
});

describe('per-space tag on bills (#14, P68 phase 3)', () => {
  it('create stores a trimmed space, and "" when the picker was hidden', async () => {
    await createBill(formData({ title: 'ΔΕΗ Καλάμου', dueDate: '15/07/2026', space: '  Kalamos ' }));
    expect(billCreate.mock.calls[0][0].space).toBe('Kalamos');
    await createBill(formData({ title: 'ΔΕΗ', dueDate: '15/07/2026' }));
    expect(billCreate.mock.calls[1][0].space).toBe('');
  });

  it('update without the field keeps the existing tag (hidden picker never wipes it)', async () => {
    await updateBill('bill1', formData({ title: 'ΔΕΗ', dueDate: '20/08/2026' }));
    expect(billFindByIdAndUpdate.mock.calls[0][1]).not.toHaveProperty('space');
    await updateBill('bill1', formData({ title: 'ΔΕΗ', dueDate: '20/08/2026', space: 'Kalamos' }));
    expect(billFindByIdAndUpdate.mock.calls[1][1].space).toBe('Kalamos');
  });

  it('the expense logged by "mark paid" carries the bill’s space, so it reaches the per-space card once', async () => {
    billFindById.mockResolvedValueOnce({ _id: 'b1', title: 'ΔΕΗ', vendor: 'ΔΕΗ', amount: 40, paidAt: null, cycle: '', linkedExpenseId: '', space: 'Kalamos' });
    await markBillPaid('b1', { logExpense: true });
    expect(addExpenseMock.mock.calls[0][0].space).toBe('Kalamos');
  });

  it('the next instance of a recurring bill keeps the space', async () => {
    billFindById.mockResolvedValueOnce({
      _id: 'b1', title: 'ΔΕΗ', vendor: 'ΔΕΗ', amount: 40, category: 'utilities', cycle: 'monthly', notes: '',
      paidAt: null, linkedExpenseId: '', dueDate: new Date('2026-06-15'), space: 'Kalamos',
    });
    await markBillPaid('b1');
    expect(billCreate.mock.calls[0][0].space).toBe('Kalamos');
  });
});
