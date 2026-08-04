import { describe, it, expect } from 'vitest';
import { expenseDupeKey, dupeCompleteness, groupExpenseDupes, type DupeExpense } from './expenseDupes';

// P46 — expense duplicate detection. The grouping RULE is the whole feature (a merge is
// irreversible-ish for the user's confidence even though the drops go to Trash), so what
// is pinned here is mostly what must NOT group: vendorless records, zero-amount drafts,
// an income against an expense, and a different day or a different cent.

function ex(over: Partial<DupeExpense> = {}): DupeExpense {
  return {
    _id: 'a1',
    kind: 'expense',
    vendor: 'ΔΕΗ',
    vendorKey: 'dei',
    category: 'utilities',
    amount: 62,
    currency: 'EUR',
    date: '2026-06-04T00:00:00.000Z',
    verified: false,
    recurring: false,
    hasFile: false,
    notes: '',
    paymentMethod: '',
    space: '',
    taxCategory: '',
    splitCount: 0,
    aiModel: '',
    ...over,
  };
}

describe('expenseDupeKey', () => {
  it('is identical for the same kind, vendor, day and amount', () => {
    expect(expenseDupeKey(ex())).toBe(expenseDupeKey(ex({ _id: 'b2' })));
  });

  it('ignores the time of day within the same LOCAL calendar day', () => {
    const morning = expenseDupeKey(ex({ date: new Date(2026, 5, 4, 8, 15).toISOString() }));
    const evening = expenseDupeKey(ex({ date: new Date(2026, 5, 4, 23, 45).toISOString() }));
    expect(morning).toBe(evening);
  });

  it('matches an EU-typed date against the same day stored as ISO midnight', () => {
    // The real reason the day is read in LOCAL parts, not UTC. lib/dates.ts stores a
    // day-first "04/06/2026" as LOCAL midnight but a plain ISO "2026-06-04" as UTC
    // midnight, so the same bill entered by hand and imported from CSV is two different
    // instants. Reading UTC parts would put them on different days east of Greenwich and
    // the pair would never be offered as duplicates.
    const euTyped = new Date('2026-06-04T00:00:00'); // local midnight (lib/dates.ts EU branch)
    const isoStored = new Date('2026-06-04'); // UTC midnight (native ISO parse)
    expect(expenseDupeKey(ex({ date: euTyped.toISOString() }))).toBe(
      expenseDupeKey(ex({ date: isoStored.toISOString() }))
    );
  });

  it('separates a different day, a different cent and a different vendor', () => {
    const base = expenseDupeKey(ex());
    expect(expenseDupeKey(ex({ date: '2026-06-05T00:00:00.000Z' }))).not.toBe(base);
    expect(expenseDupeKey(ex({ amount: 62.01 }))).not.toBe(base);
    expect(expenseDupeKey(ex({ vendorKey: 'ote' }))).not.toBe(base);
  });

  it('never matches an income against an expense', () => {
    expect(expenseDupeKey(ex({ kind: 'income' }))).not.toBe(expenseDupeKey(ex({ kind: 'expense' })));
  });

  it('refuses to group a record with no vendor key', () => {
    // Same day + same amount alone describes plenty of separate real entries.
    expect(expenseDupeKey(ex({ vendorKey: '' }))).toBe('');
    expect(expenseDupeKey(ex({ vendorKey: '   ' }))).toBe('');
  });

  it('refuses to group empty drafts (amount 0 or negative)', () => {
    expect(expenseDupeKey(ex({ amount: 0 }))).toBe('');
    expect(expenseDupeKey(ex({ amount: -10 }))).toBe('');
  });

  it('refuses to group a record with no usable date', () => {
    expect(expenseDupeKey(ex({ date: '' }))).toBe('');
    expect(expenseDupeKey(ex({ date: 'not a date' }))).toBe('');
  });

  it('treats 62 and 62.00 as the same amount', () => {
    expect(expenseDupeKey(ex({ amount: 62 }))).toBe(expenseDupeKey(ex({ amount: 62.0 })));
  });
});

describe('dupeCompleteness', () => {
  it('ranks verified above having the source file', () => {
    expect(dupeCompleteness(ex({ verified: true }))).toBeGreaterThan(dupeCompleteness(ex({ hasFile: true })));
  });

  it('ranks having the file above any amount of typed metadata', () => {
    const typed = ex({ category: 'utilities', paymentMethod: 'card', notes: 'n', taxCategory: 'x', space: 's' });
    expect(dupeCompleteness(ex({ hasFile: true, category: 'other' }))).toBeGreaterThan(0);
    expect(dupeCompleteness(typed)).toBeGreaterThan(dupeCompleteness(ex({ hasFile: true, category: 'other' })));
  });

  it('does not count the placeholder category as a filled field', () => {
    expect(dupeCompleteness(ex({ category: 'other' }))).toBe(dupeCompleteness(ex({ category: '' })));
  });
});

describe('groupExpenseDupes', () => {
  it('returns nothing when every record is unique', () => {
    expect(groupExpenseDupes([ex({ _id: 'a' }), ex({ _id: 'b', amount: 70 })])).toEqual([]);
  });

  it('clusters records that share the signature', () => {
    const groups = groupExpenseDupes([ex({ _id: 'a' }), ex({ _id: 'b' }), ex({ _id: 'c', vendorKey: 'ote' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries.map((e) => e._id).sort()).toEqual(['a', 'b']);
  });

  it('puts the most complete candidate first, so the default keeper is the richest record', () => {
    const groups = groupExpenseDupes([
      ex({ _id: 'plain' }),
      ex({ _id: 'scanned', hasFile: true }),
      ex({ _id: 'confirmed', verified: true }),
    ]);
    expect(groups[0].entries.map((e) => e._id)).toEqual(['confirmed', 'scanned', 'plain']);
  });

  it('breaks completeness ties deterministically by id', () => {
    const once = groupExpenseDupes([ex({ _id: 'z' }), ex({ _id: 'a' })]);
    const again = groupExpenseDupes([ex({ _id: 'a' }), ex({ _id: 'z' })]);
    expect(once[0].entries.map((e) => e._id)).toEqual(['a', 'z']);
    expect(again[0].entries.map((e) => e._id)).toEqual(['a', 'z']);
  });

  it('orders groups by cluster size, then by amount', () => {
    const groups = groupExpenseDupes([
      ex({ _id: 'p1', vendorKey: 'pair', amount: 500 }),
      ex({ _id: 'p2', vendorKey: 'pair', amount: 500 }),
      ex({ _id: 't1', vendorKey: 'trio', amount: 5 }),
      ex({ _id: 't2', vendorKey: 'trio', amount: 5 }),
      ex({ _id: 't3', vendorKey: 'trio', amount: 5 }),
      ex({ _id: 'q1', vendorKey: 'cheap', amount: 9 }),
      ex({ _id: 'q2', vendorKey: 'cheap', amount: 9 }),
    ]);
    expect(groups.map((g) => g.entries.length)).toEqual([3, 2, 2]);
    expect(groups[1].entries[0].amount).toBe(500); // bigger pair before the cheap pair
  });

  it('skips ungroupable records instead of piling them into one bogus cluster', () => {
    const groups = groupExpenseDupes([
      ex({ _id: 'draft1', amount: 0 }),
      ex({ _id: 'draft2', amount: 0 }),
      ex({ _id: 'anon1', vendorKey: '' }),
      ex({ _id: 'anon2', vendorKey: '' }),
    ]);
    expect(groups).toEqual([]);
  });
});
