import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { recurringExpenseId, isDuplicateKey } from './recurringExpenseId';

// #69: two concurrent runs of generateDueRecurring must not both insert the same projection. The
// id is what makes that impossible, so what matters is that it is stable for the same slot and
// different for every other one.
describe('recurringExpenseId', () => {
  it('is the same for the same series and period, every time', () => {
    expect(recurringExpenseId('expense', 'dei', '2026-04')).toBe(recurringExpenseId('expense', 'dei', '2026-04'));
  });

  it('differs per period, per vendor and per kind (income vs expense from the same payer)', () => {
    const base = recurringExpenseId('expense', 'dei', '2026-04');
    expect(recurringExpenseId('expense', 'dei', '2026-05')).not.toBe(base);
    expect(recurringExpenseId('expense', 'ote', '2026-04')).not.toBe(base);
    expect(recurringExpenseId('income', 'dei', '2026-04')).not.toBe(base);
  });

  it('is a valid Mongo ObjectId string (24 hex chars)', () => {
    expect(recurringExpenseId('expense', 'dei', '2026-04')).toMatch(/^[0-9a-f]{24}$/);
  });

  it('recognises only Mongo duplicate-key errors', () => {
    expect(isDuplicateKey({ code: 11000 })).toBe(true);
    expect(isDuplicateKey({ code: 121 })).toBe(false);
    expect(isDuplicateKey(new Error('network'))).toBe(false);
    expect(isDuplicateKey(null)).toBe(false);
  });
});

describe('recurringExpenseId with a named series (#231)', () => {
  it('without a series name it is EXACTLY the pre-#231 id, so no existing projection moves', () => {
    const legacy = createHash('sha256').update('recurring-expense:expense|apple|2026-04').digest('hex').slice(0, 24);
    expect(recurringExpenseId('expense', 'apple', '2026-04')).toBe(legacy);
    expect(recurringExpenseId('expense', 'apple', '2026-04', '')).toBe(legacy);
  });

  it('two named series under one vendor get different ids for the same month', () => {
    const icloud = recurringExpenseId('expense', 'apple', '2026-04', 'icloud');
    const tv = recurringExpenseId('expense', 'apple', '2026-04', 'tv');
    expect(icloud).not.toBe(tv);
    expect(icloud).not.toBe(recurringExpenseId('expense', 'apple', '2026-04'));
    expect(icloud).toBe(recurringExpenseId('expense', 'apple', '2026-04', 'icloud'));
  });
});
