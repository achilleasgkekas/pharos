import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/vouchers/loyaltyActions.ts holds the CRUD actions for the loyalty/membership card
// wallet (P20) — never directly unit-tested before. Mirrors the DB-mock pattern from the
// sibling giftcardActions.test.ts (same file, same tenancy seam, same soft-delete shape),
// mocking only the DB seam (connectDB/LoyaltyCard) plus next/cache's revalidatePath.
// `resolveBarcodeFormat` (lib/loyaltyCard.ts) is used un-mocked: it already has its own
// dedicated test file and is pure/deterministic, so exercising the real implementation here
// pins the actual end-to-end format-resolution behaviour instead of a stand-in.
//
// Behaviour pinned:
//  - createLoyaltyCard/updateLoyaltyCard: Zod `LoyaltyCardFormSchema` parses FormData-shaped
//    input with its defaults (store/barcodeFormat/notes), requires both title and cardNumber
//    (unlike GiftCard's optional `code`), and runs barcodeFormat through resolveBarcodeFormat
//    — an explicit valid format string wins outright, anything else (missing/blank/unknown)
//    falls back to a shape-based guess off the card number (13 digits → EAN13, 12 digits →
//    UPC, otherwise CODE128).
//  - setLoyaltyCardArchived/deleteLoyaltyCard: deleteLoyaltyCard is a SOFT delete ($set
//    deletedAt), not an actual document removal — same shape as GiftCard/other soft-deleted
//    models.

const { connectDBMock, loyaltyCardCreate, loyaltyCardFindByIdAndUpdate, loyaltyCardUpdateOne, revalidatePathMock } = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  loyaltyCardCreate: vi.fn(async (_doc: Record<string, unknown>) => ({})),
  loyaltyCardFindByIdAndUpdate: vi.fn(async (_id: string, _update: Record<string, any>) => ({})),
  loyaltyCardUpdateOne: vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, any>) => ({})),
  revalidatePathMock: vi.fn(),
}));

// Tenancy seam mocked the same way as the sibling tenancy-wrapped action modules
// (giftcardActions.test.ts, receipts/actions.crud.test.ts): withRequestTenant runs the body
// inline and currentModel hands back the mocked model, so these tests pin the CRUD behaviour,
// not tenant isolation (already covered by lib/tenancy/*.tenant.test.ts).
const loyaltyCardModel = {
  create: loyaltyCardCreate,
  findByIdAndUpdate: loyaltyCardFindByIdAndUpdate,
  updateOne: loyaltyCardUpdateOne,
};

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async () => loyaltyCardModel }));
vi.mock('@/models/LoyaltyCard', () => ({ LoyaltyCard: {} }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { createLoyaltyCard, updateLoyaltyCard, setLoyaltyCardArchived, deleteLoyaltyCard } from './loyaltyActions';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  connectDBMock.mockImplementation(async () => {});
  loyaltyCardCreate.mockImplementation(async () => ({}));
  loyaltyCardFindByIdAndUpdate.mockImplementation(async () => ({}));
  loyaltyCardUpdateOne.mockImplementation(async () => ({}));
  revalidatePathMock.mockImplementation(() => undefined);
});

describe('createLoyaltyCard', () => {
  it('a minimal form (title + cardNumber) applies every schema default and archived:false', async () => {
    await createLoyaltyCard(formData({ title: 'AB Card', cardNumber: '12345' }));
    expect(loyaltyCardCreate).toHaveBeenCalledWith({
      title: 'AB Card',
      store: '',
      cardNumber: '12345',
      barcodeFormat: 'CODE128', // 5 digits matches neither EAN13 (13) nor UPC (12)
      notes: '',
      archived: false,
    });
  });

  it('a 13-digit card number with no explicit format guesses EAN13', async () => {
    await createLoyaltyCard(formData({ title: 'X', cardNumber: '1234567890123' }));
    expect(loyaltyCardCreate).toHaveBeenCalledWith(expect.objectContaining({ barcodeFormat: 'EAN13' }));
  });

  it('a 12-digit card number with no explicit format guesses UPC', async () => {
    await createLoyaltyCard(formData({ title: 'X', cardNumber: '123456789012' }));
    expect(loyaltyCardCreate).toHaveBeenCalledWith(expect.objectContaining({ barcodeFormat: 'UPC' }));
  });

  it('an explicit valid barcodeFormat wins over the shape-based guess', async () => {
    await createLoyaltyCard(formData({ title: 'X', cardNumber: '1234567890123', barcodeFormat: 'CODE39' }));
    expect(loyaltyCardCreate).toHaveBeenCalledWith(expect.objectContaining({ barcodeFormat: 'CODE39' }));
  });

  it('an explicit but unrecognized barcodeFormat falls back to the shape-based guess', async () => {
    await createLoyaltyCard(formData({ title: 'X', cardNumber: '123456789012', barcodeFormat: 'not-a-format' }));
    expect(loyaltyCardCreate).toHaveBeenCalledWith(expect.objectContaining({ barcodeFormat: 'UPC' }));
  });

  it('a missing title throws a validation error, create() never runs', async () => {
    await expect(createLoyaltyCard(formData({ cardNumber: '12345' }))).rejects.toThrow();
    expect(loyaltyCardCreate).not.toHaveBeenCalled();
  });

  it('an empty-string title throws a validation error (min length), create() never runs', async () => {
    await expect(createLoyaltyCard(formData({ title: '', cardNumber: '12345' }))).rejects.toThrow();
    expect(loyaltyCardCreate).not.toHaveBeenCalled();
  });

  it('a missing cardNumber throws a validation error, create() never runs', async () => {
    await expect(createLoyaltyCard(formData({ title: 'X' }))).rejects.toThrow();
    expect(loyaltyCardCreate).not.toHaveBeenCalled();
  });

  it('an empty-string cardNumber throws a validation error (min length), create() never runs', async () => {
    await expect(createLoyaltyCard(formData({ title: 'X', cardNumber: '' }))).rejects.toThrow();
    expect(loyaltyCardCreate).not.toHaveBeenCalled();
  });

  it('revalidates /vouchers after a successful create', async () => {
    await createLoyaltyCard(formData({ title: 'X', cardNumber: '12345' }));
    expect(revalidatePathMock).toHaveBeenCalledWith('/vouchers');
  });
});

describe('updateLoyaltyCard', () => {
  it('parses the form and forwards it (with resolved barcodeFormat) to findByIdAndUpdate', async () => {
    await updateLoyaltyCard('lc1', formData({ title: 'AB Card', store: 'AB', cardNumber: '1234567890123' }));
    expect(loyaltyCardFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [id, update] = loyaltyCardFindByIdAndUpdate.mock.calls[0];
    expect(id).toBe('lc1');
    expect(update.title).toBe('AB Card');
    expect(update.store).toBe('AB');
    expect(update.barcodeFormat).toBe('EAN13');
  });

  it('an invalid form throws before touching the DB', async () => {
    await expect(updateLoyaltyCard('lc1', formData({ title: '' }))).rejects.toThrow();
    expect(loyaltyCardFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('revalidates /vouchers after a successful update', async () => {
    await updateLoyaltyCard('lc1', formData({ title: 'X', cardNumber: '12345' }));
    expect(revalidatePathMock).toHaveBeenCalledWith('/vouchers');
  });
});

describe('setLoyaltyCardArchived', () => {
  it('sets archived:true', async () => {
    await setLoyaltyCardArchived('lc1', true);
    expect(loyaltyCardFindByIdAndUpdate).toHaveBeenCalledWith('lc1', { archived: true });
    expect(revalidatePathMock).toHaveBeenCalledWith('/vouchers');
  });

  it('sets archived:false', async () => {
    await setLoyaltyCardArchived('lc1', false);
    expect(loyaltyCardFindByIdAndUpdate).toHaveBeenCalledWith('lc1', { archived: false });
  });
});

describe('deleteLoyaltyCard', () => {
  it('is a soft delete: $set deletedAt via updateOne, not an actual removal', async () => {
    await deleteLoyaltyCard('lc1');
    expect(loyaltyCardUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = loyaltyCardUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'lc1' });
    expect(update.$set.deletedAt).toBeInstanceOf(Date);
    expect(revalidatePathMock).toHaveBeenCalledWith('/vouchers');
  });
});
