import { describe, expect, it } from 'vitest';
import { serializeLineItems, trimReceipt, type ReceiptLean } from './serialize';

// Pure API-shape contract for the receipts endpoints (detail GET, rescan POST,
// scan POST all share these). No DB/fs/network/clock — `iso` is a pure Date→ISO wrapper
// and apiList only imports a type, so importing serialize.ts has zero side effects.

describe('serializeLineItems', () => {
  it('treats null / undefined as an empty list', () => {
    expect(serializeLineItems(null)).toEqual([]);
    expect(serializeLineItems(undefined)).toEqual([]);
  });

  it('maps an empty array to an empty array', () => {
    expect(serializeLineItems([])).toEqual([]);
  });

  it('prefers refinedName (AI-cleaned) over the raw name', () => {
    expect(serializeLineItems([{ name: 'RTX5080 GPU', refinedName: 'NVIDIA RTX 5080' }])).toEqual([
      { name: 'NVIDIA RTX 5080', qty: 1, price: 0, vatRate: 0 },
    ]);
  });

  it('falls back to raw name when refinedName is missing', () => {
    expect(serializeLineItems([{ name: 'Apple Pencil' }])[0].name).toBe('Apple Pencil');
  });

  it('falls back to raw name when refinedName is an empty string (falsy)', () => {
    expect(serializeLineItems([{ name: 'Roborock', refinedName: '' }])[0].name).toBe('Roborock');
  });

  it('yields an empty-string name when neither name is present', () => {
    expect(serializeLineItems([{ qty: 2 }])[0].name).toBe('');
  });

  it('applies defaults qty=1, price=0, vatRate=0 for missing numerics', () => {
    expect(serializeLineItems([{ name: 'x' }])[0]).toEqual({ name: 'x', qty: 1, price: 0, vatRate: 0 });
  });

  it('preserves provided qty / price (unit NET) / vatRate, including zeros', () => {
    expect(serializeLineItems([{ name: 'Cable', qty: 3, price: 9.9, vatRate: 24 }])).toEqual([
      { name: 'Cable', qty: 3, price: 9.9, vatRate: 24 },
    ]);
    // explicit zeros must survive the ?? defaulting (not be replaced by 1 / 0 accidentally)
    expect(serializeLineItems([{ name: 'Free sample', qty: 0, price: 0, vatRate: 0 }])[0]).toEqual({
      name: 'Free sample',
      qty: 0,
      price: 0,
      vatRate: 0,
    });
  });

  it('normalizes multiple line items in order', () => {
    const out = serializeLineItems([
      { name: 'A', qty: 1 },
      { refinedName: 'B', price: 5 },
    ]);
    expect(out).toEqual([
      { name: 'A', qty: 1, price: 0, vatRate: 0 },
      { name: 'B', qty: 1, price: 5, vatRate: 0 },
    ]);
  });
});

describe('trimReceipt', () => {
  const base: ReceiptLean = { _id: 'abc123', store: 'Skroutz' };

  it('stringifies _id and echoes the store', () => {
    const out = trimReceipt(base);
    expect(out.id).toBe('abc123');
    expect(out.store).toBe('Skroutz');
    // non-string ids (ObjectId-like) go through String()
    expect(trimReceipt({ ...base, _id: { toString: () => 'oid42' } }).id).toBe('oid42');
  });

  it('converts date / updatedAt via iso, and null-fills when absent', () => {
    const d = new Date('2026-07-02T10:00:00.000Z');
    const out = trimReceipt({ ...base, date: d, updatedAt: d });
    expect(out.date).toBe('2026-07-02T10:00:00.000Z');
    expect(out.updatedAt).toBe('2026-07-02T10:00:00.000Z');
    const missing = trimReceipt(base);
    expect(missing.date).toBeNull();
    expect(missing.updatedAt).toBeNull();
  });

  it('defaults the money fields to 0', () => {
    const out = trimReceipt(base);
    expect(out.total).toBe(0);
    expect(out.subtotal).toBe(0);
    expect(out.vatAmount).toBe(0);
    expect(out.warrantyMonths).toBe(0);
  });

  it('preserves provided money fields', () => {
    const out = trimReceipt({ ...base, total: 1443.72, subtotal: 1164.29, vatAmount: 279.43, warrantyMonths: 24 });
    expect(out.total).toBe(1443.72);
    expect(out.subtotal).toBe(1164.29);
    expect(out.vatAmount).toBe(279.43);
    expect(out.warrantyMonths).toBe(24);
  });

  it('defaults currency to EUR and paymentMethod to empty string', () => {
    expect(trimReceipt(base).currency).toBe('EUR');
    expect(trimReceipt(base).paymentMethod).toBe('');
    expect(trimReceipt({ ...base, currency: 'USD', paymentMethod: 'Mastercard 7791' })).toMatchObject({
      currency: 'USD',
      paymentMethod: 'Mastercard 7791',
    });
  });

  it('derives itemCount from lineItems length (0 when absent)', () => {
    expect(trimReceipt(base).itemCount).toBe(0);
    expect(trimReceipt({ ...base, lineItems: [{}, {}, {}] }).itemCount).toBe(3);
    expect(trimReceipt({ ...base, lineItems: [] }).itemCount).toBe(0);
  });

  it('booleanizes verified / archived and deleted (from deletedAt)', () => {
    expect(trimReceipt(base)).toMatchObject({ verified: false, archived: false, deleted: false });
    const flagged = trimReceipt({ ...base, verified: true, archived: true, deletedAt: new Date() });
    expect(flagged).toMatchObject({ verified: true, archived: true, deleted: true });
    // deletedAt: null stays not-deleted
    expect(trimReceipt({ ...base, deletedAt: null }).deleted).toBe(false);
  });

  it('maps file / thumb from paths, null when empty', () => {
    expect(trimReceipt(base)).toMatchObject({ file: null, thumb: null });
    const withFiles = trimReceipt({ ...base, filePath: 'receipts/2026/07/x.pdf', thumbPath: 'receipts/2026/07/x.jpg' });
    expect(withFiles.file).toBe('receipts/2026/07/x.pdf');
    expect(withFiles.thumb).toBe('receipts/2026/07/x.jpg');
    // empty string path collapses to null (|| null)
    expect(trimReceipt({ ...base, filePath: '', thumbPath: '' })).toMatchObject({ file: null, thumb: null });
  });

  it('omits returnDaysLeft entirely when not passed (not present, not null)', () => {
    expect(trimReceipt(base)).not.toHaveProperty('returnDaysLeft');
  });

  it('includes returnDaysLeft (even 0) when the caller passes it', () => {
    expect(trimReceipt(base, 9).returnDaysLeft).toBe(9);
    expect(trimReceipt(base, 0).returnDaysLeft).toBe(0);
  });
});
