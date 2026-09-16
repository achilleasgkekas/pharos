import type { Model } from 'mongoose';
import type { ExpenseDoc } from '@/models/Expense';

type Occurrence = Pick<ExpenseDoc, 'kind' | 'vendorKey' | 'date'> & Partial<ExpenseDoc>;

/** Caller awaits the tenant-bound model's init() before writing so the unique index
 * is ready even on the first request to a freshly created tenant database. */
export async function insertRecurringExpense(Expense: Model<ExpenseDoc>, doc: Occurrence): Promise<boolean> {
  // Index the actual editable identity fields, not a derived key that becomes stale
  // when the user changes an occurrence's vendor/date/kind.
  const filter = { kind: doc.kind, vendorKey: doc.vendorKey, date: doc.date,
    recurringGenerated: true, deletedAt: null };
  try {
    const result = await Expense.updateOne(filter, {
      $setOnInsert: { ...doc, recurringGenerated: true },
    }, { upsert: true });
    return result.upsertedCount === 1;
  } catch (error) {
    // Mongo may report the losing concurrent upsert as E11000. Only accept it when
    // our occurrence index lost the race AND its winning live row still exists.
    // Other database errors (or a concurrently trashed winner) must remain visible.
    const duplicate = error as { code?: number; keyPattern?: Record<string, number> };
    if (duplicate?.code === 11000 && duplicate.keyPattern?.recurringGenerated === 1 &&
        await Expense.exists(filter)) return false;
    throw error;
  }
}
