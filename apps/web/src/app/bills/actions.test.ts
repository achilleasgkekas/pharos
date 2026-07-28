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
  billFindByIdAndUpdate,
  billUpdateOne,
  addExpenseMock,
  revalidatePathMock,
  getAppSettingsMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  billCreate: vi.fn(async (_doc: Record<string, unknown>) => ({})),
  billFindById: vi.fn(async (_id: string) => null as Record<string, any> | null),
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

import { createBill, updateBill, setBillArchived, deleteBill, markBillPaid, markBillUnpaid } from './actions';

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
    expect(res.error).toBe('Required');
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
    expect(res.error).toBe('Required');
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
    getAppSettingsMock.mockResolvedValue({ currency: 'USD' });
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
