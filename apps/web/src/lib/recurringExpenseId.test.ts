import { describe, it, expect } from 'vitest';
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
