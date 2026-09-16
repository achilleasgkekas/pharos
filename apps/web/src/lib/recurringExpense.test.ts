import { describe, expect, it, vi } from 'vitest';
import type { Model } from 'mongoose';
import type { ExpenseDoc } from '@/models/Expense';
import { insertRecurringExpense } from './recurringExpense';

const doc = { kind: 'expense' as const, vendorKey: 'rent', date: new Date('2026-03-01Z') };
function model(updateOne = vi.fn().mockResolvedValue({ upsertedCount: 1 }), exists = vi.fn()) {
  return { updateOne, exists };
}

describe('insertRecurringExpense error handling', () => {
  it('counts only inserted occurrences', async () => {
    const db = model(vi.fn().mockResolvedValue({ upsertedCount: 0 }));
    expect(await insertRecurringExpense(db as unknown as Model<ExpenseDoc>, doc)).toBe(false);
  });

  it('accepts a duplicate-key race only after confirming the live winner', async () => {
    const error = { code: 11000, keyPattern: { recurringGenerated: 1, deletedAt: 1 } };
    const db = model(vi.fn().mockRejectedValue(error), vi.fn().mockResolvedValue({ _id: 'winner' }));
    expect(await insertRecurringExpense(db as unknown as Model<ExpenseDoc>, doc)).toBe(false);
    expect(db.exists).toHaveBeenCalledWith({
      kind: doc.kind, vendorKey: doc.vendorKey, date: doc.date, recurringGenerated: true, deletedAt: null,
    });
  });

  it.each([
    new Error('database unavailable'),
    { code: 11000, keyPattern: { _id: 1 } },
  ])('propagates unrelated database errors', async (error) => {
    const db = model(vi.fn().mockRejectedValue(error));
    await expect(insertRecurringExpense(db as unknown as Model<ExpenseDoc>, doc)).rejects.toBe(error);
    expect(db.exists).not.toHaveBeenCalled();
  });

  it('does not hide a race when the winning row has already disappeared', async () => {
    const error = { code: 11000, keyPattern: { recurringGenerated: 1 } };
    const db = model(vi.fn().mockRejectedValue(error), vi.fn().mockResolvedValue(null));
    await expect(insertRecurringExpense(db as unknown as Model<ExpenseDoc>, doc)).rejects.toBe(error);
  });
});
