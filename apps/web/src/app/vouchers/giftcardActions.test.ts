import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/vouchers/giftcardActions.ts holds the CRUD + per-use spend/reload actions for gift
// cards / store credit (P32). Never directly unit-tested before — mirrors the DB-mock pattern
// from statements/cards.test.ts, mocking only the DB seam (connectDB/GiftCard) plus
// next/cache's revalidatePath. `safeDateOrNull` (lib/dates.ts) is used un-mocked: it already
// has its own dedicated test file and is pure/deterministic, so exercising the real
// implementation here pins the actual end-to-end date handling instead of a stand-in.
//
// Behaviour pinned:
//  - createGiftCard/updateGiftCard: Zod `GiftCardFormSchema` parses FormData-shaped input with
//    its defaults (store/code/initialAmount/notes), coerces initialAmount to a number, rejects
//    a missing/empty title, and runs `expiresAt` through safeDateOrNull (invalid/blank string →
//    null, not thrown).
//  - setGiftCardArchived/deleteGiftCard: deleteGiftCard is a SOFT delete ($set deletedAt), not
//    an actual document removal.
//  - addGiftCardUse: rejects non-finite or exactly-zero amounts before ever touching the DB;
//    on success it rounds the amount to 2 decimals, truncates the note to 200 chars, and falls
//    back to `new Date()` when the given date string doesn't parse.
//  - removeGiftCardUse: pulls a single use by its subdocument id.

const { connectDBMock, giftCardCreate, giftCardFindByIdAndUpdate, giftCardUpdateOne, revalidatePathMock } = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  // Typed args (not just `async () => ({})`) so `.mock.calls[0][n]` indexes cleanly under
  // `tsc --noEmit` below — an untyped vi.fn() infers a zero-arg tuple and indexing into it
  // is a type error even though it works fine at runtime.
  giftCardCreate: vi.fn(async (_doc: Record<string, unknown>) => ({})),
  giftCardFindByIdAndUpdate: vi.fn(async (_id: string, _update: Record<string, any>) => ({})),
  giftCardUpdateOne: vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, any>) => ({})),
  revalidatePathMock: vi.fn(),
}));

// Tenancy seam mocked the same way as the sibling tenancy-wrapped action modules
// (receipts/actions.crud.test.ts, expenses/actions.crud.test.ts): withRequestTenant runs the
// body inline and currentModel hands back the mocked model, so these tests pin the CRUD
// behaviour, not tenant isolation (already covered by lib/tenancy/*.tenant.test.ts).
const giftCardModel = {
  create: giftCardCreate,
  findByIdAndUpdate: giftCardFindByIdAndUpdate,
  updateOne: giftCardUpdateOne,
};

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async () => giftCardModel }));
vi.mock('@/models/GiftCard', () => ({ GiftCard: {} }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import {
  createGiftCard,
  updateGiftCard,
  setGiftCardArchived,
  deleteGiftCard,
  addGiftCardUse,
  removeGiftCardUse,
} from './giftcardActions';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

// safeDateOrNull builds EU-style dates at LOCAL midnight (no trailing "Z"), so comparing via
// toISOString() would shift by a day whenever the runner's TZ offset isn't UTC+0. Compare
// local Y/M/D components instead, which is what the app actually cares about.
function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  giftCardCreate.mockImplementation(async () => ({}));
  giftCardFindByIdAndUpdate.mockImplementation(async () => ({}));
  giftCardUpdateOne.mockImplementation(async () => ({}));
  revalidatePathMock.mockImplementation(() => undefined);
});

describe('createGiftCard', () => {
  it('a minimal form (title only) applies every schema default, uses:[] and archived:false', async () => {
    await createGiftCard(formData({ title: 'IKEA gift card' }));
    expect(giftCardCreate).toHaveBeenCalledWith({
      title: 'IKEA gift card',
      store: '',
      code: '',
      initialAmount: 0,
      expiresAt: null,
      notes: '',
      uses: [],
      archived: false,
    });
  });

  it('initialAmount is coerced from a form string to a number', async () => {
    await createGiftCard(formData({ title: 'Public credit', initialAmount: '50' }));
    expect(giftCardCreate).toHaveBeenCalledWith(expect.objectContaining({ initialAmount: 50 }));
  });

  it('a valid EU-style expiresAt string is parsed to a real Date', async () => {
    await createGiftCard(formData({ title: 'X', expiresAt: '25/12/2026' }));
    const call = giftCardCreate.mock.calls[0][0];
    expect(call.expiresAt).toBeInstanceOf(Date);
    expect(localYmd(call.expiresAt as Date)).toBe('2026-12-25');
  });

  it('a blank expiresAt string becomes null, not thrown', async () => {
    await createGiftCard(formData({ title: 'X', expiresAt: '' }));
    expect(giftCardCreate).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: null }));
  });

  it('an unparseable expiresAt string becomes null, not thrown', async () => {
    await createGiftCard(formData({ title: 'X', expiresAt: 'not-a-date' }));
    expect(giftCardCreate).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: null }));
  });

  it('a missing title throws a validation error, create() never runs', async () => {
    await expect(createGiftCard(formData({}))).rejects.toThrow();
    expect(giftCardCreate).not.toHaveBeenCalled();
  });

  it('an empty-string title throws a validation error (min length), create() never runs', async () => {
    await expect(createGiftCard(formData({ title: '' }))).rejects.toThrow();
    expect(giftCardCreate).not.toHaveBeenCalled();
  });

  it('revalidates /vouchers after a successful create', async () => {
    await createGiftCard(formData({ title: 'X' }));
    expect(revalidatePathMock).toHaveBeenCalledWith('/vouchers');
  });
});

describe('updateGiftCard', () => {
  it('parses the form and forwards it (with resolved expiresAt) to findByIdAndUpdate', async () => {
    await updateGiftCard('gc1', formData({ title: 'IKEA gift card', store: 'IKEA', expiresAt: '01/01/2027' }));
    expect(giftCardFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [id, update] = giftCardFindByIdAndUpdate.mock.calls[0];
    expect(id).toBe('gc1');
    expect(update.title).toBe('IKEA gift card');
    expect(update.store).toBe('IKEA');
    expect(localYmd(update.expiresAt)).toBe('2027-01-01');
  });

  it('an invalid form throws before touching the DB', async () => {
    await expect(updateGiftCard('gc1', formData({ title: '' }))).rejects.toThrow();
    expect(giftCardFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('revalidates /vouchers after a successful update', async () => {
    await updateGiftCard('gc1', formData({ title: 'X' }));
    expect(revalidatePathMock).toHaveBeenCalledWith('/vouchers');
  });
});

describe('setGiftCardArchived', () => {
  it('sets archived:true', async () => {
    await setGiftCardArchived('gc1', true);
    expect(giftCardFindByIdAndUpdate).toHaveBeenCalledWith('gc1', { archived: true });
    expect(revalidatePathMock).toHaveBeenCalledWith('/vouchers');
  });

  it('sets archived:false', async () => {
    await setGiftCardArchived('gc1', false);
    expect(giftCardFindByIdAndUpdate).toHaveBeenCalledWith('gc1', { archived: false });
  });
});

describe('deleteGiftCard', () => {
  it('is a soft delete: $set deletedAt via updateOne, not an actual removal', async () => {
    await deleteGiftCard('gc1');
    expect(giftCardUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = giftCardUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'gc1' });
    expect(update.$set.deletedAt).toBeInstanceOf(Date);
    expect(revalidatePathMock).toHaveBeenCalledWith('/vouchers');
  });
});

describe('addGiftCardUse', () => {
  it('a non-numeric amount is rejected before touching the DB', async () => {
    const res = await addGiftCardUse('gc1', Number('not-a-number'));
    expect(res).toEqual({ ok: false, error: 'Enter a non-zero amount' });
    expect(giftCardFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('an exactly-zero amount is rejected before touching the DB', async () => {
    const res = await addGiftCardUse('gc1', 0);
    expect(res).toEqual({ ok: false, error: 'Enter a non-zero amount' });
    expect(giftCardFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('an Infinity amount is rejected before touching the DB', async () => {
    const res = await addGiftCardUse('gc1', Infinity);
    expect(res).toEqual({ ok: false, error: 'Enter a non-zero amount' });
    expect(giftCardFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('a positive spend is rounded to 2 decimals and pushed to uses', async () => {
    const res = await addGiftCardUse('gc1', 12.3456, 'coffee', '10/06/2026');
    expect(res).toEqual({ ok: true });
    expect(giftCardFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [id, update] = giftCardFindByIdAndUpdate.mock.calls[0];
    expect(id).toBe('gc1');
    const use = update.$push.uses;
    expect(use.amount).toBe(12.35);
    expect(use.note).toBe('coffee');
    expect(localYmd(use.date)).toBe('2026-06-10');
  });

  it('a negative amount (reload/top-up) is accepted as-is', async () => {
    const res = await addGiftCardUse('gc1', -20);
    expect(res).toEqual({ ok: true });
    expect(giftCardFindByIdAndUpdate.mock.calls[0][1].$push.uses.amount).toBe(-20);
  });

  it('a note longer than 200 chars is truncated', async () => {
    const longNote = 'x'.repeat(250);
    await addGiftCardUse('gc1', 5, longNote);
    const use = giftCardFindByIdAndUpdate.mock.calls[0][1].$push.uses;
    expect(use.note).toBe('x'.repeat(200));
    expect(use.note.length).toBe(200);
  });

  it('a missing/unparseable date string falls back to "now"', async () => {
    const before = Date.now();
    await addGiftCardUse('gc1', 5);
    const use = giftCardFindByIdAndUpdate.mock.calls[0][1].$push.uses;
    expect(use.date).toBeInstanceOf(Date);
    expect(use.date.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('a non-string note is coerced via String() and does not throw', async () => {
    // @ts-expect-error deliberately passing a non-string to mirror a loose runtime caller
    const res = await addGiftCardUse('gc1', 5, 42);
    expect(res).toEqual({ ok: true });
    expect(giftCardFindByIdAndUpdate.mock.calls[0][1].$push.uses.note).toBe('42');
  });

  it('revalidates /vouchers after a successful use', async () => {
    await addGiftCardUse('gc1', 5);
    expect(revalidatePathMock).toHaveBeenCalledWith('/vouchers');
  });
});

describe('removeGiftCardUse', () => {
  it('pulls a single use by its subdocument id', async () => {
    await removeGiftCardUse('gc1', 'use1');
    expect(giftCardFindByIdAndUpdate).toHaveBeenCalledWith('gc1', { $pull: { uses: { _id: 'use1' } } });
    expect(revalidatePathMock).toHaveBeenCalledWith('/vouchers');
  });
});
