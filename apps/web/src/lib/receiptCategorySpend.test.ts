import { describe, expect, it } from 'vitest';
import { lineGrossAmount, receiptCategorySpend } from './receiptCategorySpend';

describe('lineGrossAmount (P64 φάση 2)', () => {
  it('is qty × net unit price + VAT, the same number the line editor shows', () => {
    expect(lineGrossAmount({ qty: 2, price: 10, vatRate: 24 })).toBeCloseTo(24.8, 10);
  });

  it('treats a missing or non-positive qty as 1, matching the schema default', () => {
    expect(lineGrossAmount({ price: 10, vatRate: 0 })).toBe(10);
    expect(lineGrossAmount({ qty: 0, price: 10, vatRate: 0 })).toBe(10);
    expect(lineGrossAmount({ qty: -3, price: 10, vatRate: 0 })).toBe(10);
  });

  it('keeps a fractional qty (weighed goods) intact', () => {
    expect(lineGrossAmount({ qty: 0.5, price: 8, vatRate: 0 })).toBe(4);
  });

  it('is zero for a line with no usable price, and never NaN', () => {
    expect(lineGrossAmount({ qty: 3, price: 0, vatRate: 24 })).toBe(0);
    expect(lineGrossAmount({ qty: 3, price: -5, vatRate: 24 })).toBe(0);
    expect(lineGrossAmount({ qty: 3 })).toBe(0);
    expect(lineGrossAmount(null)).toBe(0);
    expect(lineGrossAmount({ qty: Number.NaN, price: 10, vatRate: Number.NaN })).toBe(10);
  });
});

describe('receiptCategorySpend (P64 φάση 2)', () => {
  it('returns empty sums when nothing is tagged — the pre-P64 behaviour', () => {
    const out = receiptCategorySpend([
      { date: '2026-08-10', lineItems: [{ qty: 1, price: 10, vatRate: 24, category: '' }] },
      { date: '2026-08-11', lineItems: [{ qty: 1, price: 10, vatRate: 24 }] },
    ]);
    expect(out.all.size).toBe(0);
    expect(out.byMonth.size).toBe(0);
    expect(out.totalByMonth.size).toBe(0);
  });

  it('splits ONE receipt across several categories and leaves untagged lines out', () => {
    const out = receiptCategorySpend([
      {
        date: '2026-08-10',
        lineItems: [
          { qty: 2, price: 5, vatRate: 0, category: 'groceries' },
          { qty: 1, price: 30, vatRate: 0, category: 'household' },
          { qty: 1, price: 99, vatRate: 0 }, // untagged → invisible
        ],
      },
    ]);
    expect(out.all.get('groceries')).toBe(10);
    expect(out.all.get('household')).toBe(30);
    expect(out.totalByMonth.get('2026-08')).toBe(40); // το untagged 99 δεν μπήκε πουθενά
    expect(out.byMonth.get('2026-08')?.get('groceries')).toBe(10);
  });

  it('adds the same category across receipts and buckets by the receipt month', () => {
    const out = receiptCategorySpend([
      { date: new Date(2026, 6, 31), lineItems: [{ qty: 1, price: 10, vatRate: 0, category: 'groceries' }] },
      { date: '2026-08-02', lineItems: [{ qty: 1, price: 25, vatRate: 0, category: 'groceries' }] },
      { date: '2026-08-20', lineItems: [{ qty: 1, price: 5, vatRate: 0, category: 'groceries' }] },
    ]);
    expect(out.all.get('groceries')).toBe(40);
    expect(out.byMonth.get('2026-08')?.get('groceries')).toBe(30);
    expect(out.totalByMonth.get('2026-08')).toBe(30);
  });

  it('trims the tag so " groceries " is not a second category', () => {
    const out = receiptCategorySpend([
      { date: '2026-08-01', lineItems: [{ qty: 1, price: 10, vatRate: 0, category: ' groceries ' }] },
      { date: '2026-08-02', lineItems: [{ qty: 1, price: 10, vatRate: 0, category: 'groceries' }] },
    ]);
    expect([...out.all.keys()]).toEqual(['groceries']);
    expect(out.all.get('groceries')).toBe(20);
  });

  it('still counts an undated receipt in the all-time chart, but in no month', () => {
    const out = receiptCategorySpend([
      { lineItems: [{ qty: 1, price: 10, vatRate: 0, category: 'groceries' }] },
      { date: 'not a date', lineItems: [{ qty: 1, price: 7, vatRate: 0, category: 'groceries' }] },
    ]);
    expect(out.all.get('groceries')).toBe(17);
    expect(out.byMonth.size).toBe(0);
    expect(out.totalByMonth.size).toBe(0);
  });

  it('survives receipts with no lineItems at all', () => {
    const out = receiptCategorySpend([{ date: '2026-08-01' }, { date: '2026-08-02', lineItems: [] }, {}]);
    expect(out.all.size).toBe(0);
  });

  it('returns empty sums for an empty or missing input', () => {
    expect(receiptCategorySpend([]).all.size).toBe(0);
    expect(receiptCategorySpend(null).all.size).toBe(0);
    expect(receiptCategorySpend(undefined).totalByMonth.size).toBe(0);
  });
});
