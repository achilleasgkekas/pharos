import { describe, expect, it } from 'vitest';
import { trimExpense, computeAnomalies, type ExpenseLean } from './serialize';

// Pure API-shape contract for the mobile expenses endpoints (list GET, rescan POST
// both share trimExpense so the detail can re-prefill in place from either). No
// DB/fs/network/clock — `iso` is a pure Date→ISO wrapper and apiList only imports a
// type, so importing serialize.ts has zero side effects.

describe('trimExpense', () => {
  it('coerces _id to a string', () => {
    expect(trimExpense({ _id: 123 }).id).toBe('123');
    expect(trimExpense({ _id: { toString: () => 'objid' } }).id).toBe('objid');
  });

  it('fills every field with a safe default from a bare _id', () => {
    expect(trimExpense({ _id: 'x' })).toEqual({
      id: 'x',
      kind: 'expense',
      vendor: '',
      category: 'other',
      amount: 0,
      currency: 'EUR',
      date: null,
      period: '',
      recurring: false,
      recurringCycle: '',
      paymentMethod: '',
      notes: '',
      file: null,
      thumb: null,
      verified: false,
      updatedAt: null,
      deleted: false,
    });
  });

  it('passes through populated scalar fields verbatim', () => {
    const out = trimExpense({
      _id: 'a',
      kind: 'income',
      vendor: 'Cosmote',
      category: 'utilities',
      amount: 29.51,
      currency: 'USD',
      period: '2026-06',
      recurringCycle: 'monthly',
      paymentMethod: 'card',
      notes: 'δίμηνος λογαριασμός',
    });
    expect(out).toMatchObject({
      kind: 'income',
      vendor: 'Cosmote',
      category: 'utilities',
      amount: 29.51,
      currency: 'USD',
      period: '2026-06',
      recurringCycle: 'monthly',
      paymentMethod: 'card',
      notes: 'δίμηνος λογαριασμός',
    });
  });

  it('keeps amount 0 rather than substituting the default (0 is a real value)', () => {
    expect(trimExpense({ _id: 'a', amount: 0 }).amount).toBe(0);
    expect(trimExpense({ _id: 'a', amount: -5 }).amount).toBe(-5);
  });

  it('defaults a missing amount to 0', () => {
    expect(trimExpense({ _id: 'a' }).amount).toBe(0);
  });

  it('booleanizes recurring / verified from any truthiness', () => {
    expect(trimExpense({ _id: 'a', recurring: true, verified: true })).toMatchObject({
      recurring: true,
      verified: true,
    });
    expect(trimExpense({ _id: 'a', recurring: false, verified: false })).toMatchObject({
      recurring: false,
      verified: false,
    });
  });

  it('renders date and updatedAt as ISO strings via iso()', () => {
    const d = new Date('2026-06-04T00:00:00.000Z');
    const out = trimExpense({ _id: 'a', date: d, updatedAt: d });
    expect(out.date).toBe('2026-06-04T00:00:00.000Z');
    expect(out.updatedAt).toBe('2026-06-04T00:00:00.000Z');
  });

  it('yields null date/updatedAt when the source date is missing', () => {
    const out = trimExpense({ _id: 'a' });
    expect(out.date).toBeNull();
    expect(out.updatedAt).toBeNull();
  });

  it('collapses an empty-string filePath / thumbPath to null', () => {
    expect(trimExpense({ _id: 'a', filePath: '', thumbPath: '' })).toMatchObject({
      file: null,
      thumb: null,
    });
  });

  it('passes through non-empty file / thumb paths', () => {
    const out = trimExpense({
      _id: 'a',
      filePath: 'expenses/2026/06/ote.pdf',
      thumbPath: 'expenses/2026/06/ote.jpg',
    });
    expect(out.file).toBe('expenses/2026/06/ote.pdf');
    expect(out.thumb).toBe('expenses/2026/06/ote.jpg');
  });

  it('marks deleted true only when deletedAt is set, false for null/absent', () => {
    expect(trimExpense({ _id: 'a', deletedAt: new Date() }).deleted).toBe(true);
    expect(trimExpense({ _id: 'a', deletedAt: null }).deleted).toBe(false);
    expect(trimExpense({ _id: 'a' }).deleted).toBe(false);
  });

  it('adds anomaly only when the ±% argument is provided', () => {
    expect(trimExpense({ _id: 'a' })).not.toHaveProperty('anomaly');
    expect(trimExpense({ _id: 'a' }, undefined)).not.toHaveProperty('anomaly');
    expect(trimExpense({ _id: 'a' }, -50).anomaly).toBe(-50);
    expect(trimExpense({ _id: 'a' }, 0).anomaly).toBe(0); // 0 is a real ±% value
  });

  it('exposes exactly the documented key set (no extra fields leak from the lean doc)', () => {
    const extra = { _id: 'a', vendor: 'X', __v: 7, secretInternal: 'nope' } as ExpenseLean & {
      __v: number;
      secretInternal: string;
    };
    expect(Object.keys(trimExpense(extra)).sort()).toEqual(
      [
        'amount',
        'category',
        'currency',
        'date',
        'deleted',
        'file',
        'kind',
        'notes',
        'paymentMethod',
        'period',
        'recurring',
        'recurringCycle',
        'thumb',
        'updatedAt',
        'vendor',
        'verified',
        'id',
      ].sort(),
    );
  });
});

describe('computeAnomalies', () => {
  const doc = (vendorKey: string, amount: number): ExpenseLean => ({ _id: vendorKey + amount, vendorKey, amount });

  it('returns an array aligned to the docs, all undefined below 3 priced entries', () => {
    const out = computeAnomalies([doc('ote', 60), doc('ote', 62)]);
    expect(out).toEqual([undefined, undefined]);
  });

  it('flags an entry deviating >30% from the vendor median as rounded ±%', () => {
    // median of [60,60,62,64,120] = 62; 120 → +94%, the rest within 30%
    const docs = [doc('ote', 60), doc('ote', 60), doc('ote', 62), doc('ote', 64), doc('ote', 120)];
    const out = computeAnomalies(docs);
    expect(out.slice(0, 4)).toEqual([undefined, undefined, undefined, undefined]);
    expect(out[4]).toBe(94);
  });

  it('flags a low outlier as a negative ±%', () => {
    // median of [100,100,100] = 100; 40 → -60%
    const out = computeAnomalies([doc('x', 100), doc('x', 100), doc('x', 100), doc('x', 40)]);
    expect(out[3]).toBe(-60);
  });

  it('ignores entries with no vendorKey or non-positive amount', () => {
    const docs: ExpenseLean[] = [
      { _id: '1', amount: 999 }, // no vendorKey
      { _id: '2', vendorKey: 'x', amount: 0 }, // not priced
      doc('x', 100), doc('x', 100), doc('x', 100),
    ];
    const out = computeAnomalies(docs);
    expect(out[0]).toBeUndefined();
    expect(out[1]).toBeUndefined();
  });

  it('keeps vendor series independent (one vendor never skews another)', () => {
    const docs = [doc('a', 10), doc('a', 10), doc('a', 10), doc('b', 1000), doc('b', 1000), doc('b', 1000)];
    expect(computeAnomalies(docs).every((v) => v === undefined)).toBe(true);
  });
});
