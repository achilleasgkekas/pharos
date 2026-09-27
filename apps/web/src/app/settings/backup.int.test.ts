import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { setupTestDatabase } from '@/test/mongo';

// Backup export → restore round trip through the real server actions and a real MongoDB (#331).
// The unit tests check the file format and the registry; only a real database shows that what
// `exportData` writes is what `importData` puts back: every collection, the ids, and a document
// that was trashed after the backup coming back visible.
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  requireAdmin: vi.fn(async () => ({ id: 'admin', role: 'admin', name: 'CI' })),
  assertCanWrite: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

setupTestDatabase();

const { exportData, importData } = await import('./actions');
const { Item } = await import('@/models/Item');
const { Expense } = await import('@/models/Expense');
const { Vehicle } = await import('@/models/Vehicle');
const { VehicleLog } = await import('@/models/VehicleLog');

describe('backup round trip', () => {
  it('restores every exported document, including one trashed after the backup', async () => {
    const item = await Item.create({ title: 'Drill', category: 'Tools', purchasedPrice: 89 });
    await Expense.create({ date: new Date('2026-09-01'), amount: 12.5, category: 'Groceries', vendor: 'Market' });
    const car = await Vehicle.create({ name: 'Golf' });
    await VehicleLog.create({ vehicleId: car._id, kind: 'fuel', date: new Date('2026-09-02'), liters: 40, cost: 70 });

    const json = await exportData();
    const backup = JSON.parse(json) as { collections: Record<string, unknown[]> };
    expect(backup.collections.items).toHaveLength(1);
    expect(backup.collections.expenses).toHaveLength(1);
    expect(backup.collections.vehicleLogs).toHaveLength(1);

    // After the backup: one item trashed, everything else wiped.
    await Item.collection.updateOne({ _id: new mongoose.Types.ObjectId(String(item._id)) }, { $set: { deletedAt: new Date() } });
    await Expense.deleteMany({});
    await VehicleLog.deleteMany({});
    await Vehicle.deleteMany({});

    const res = await importData(json);
    expect(res.error).toBeUndefined();
    expect(res.ok).toBe(true);
    expect(res.restored).toBe(4);

    const restoredItem = await Item.findById(item._id).lean();
    expect(restoredItem?.title).toBe('Drill');
    expect(await Expense.countDocuments()).toBe(1);
    const log = await VehicleLog.findOne().lean();
    expect(String(log?.vehicleId)).toBe(String(car._id));
  });

  it('restoring the same file twice does not duplicate anything', async () => {
    const json = await exportData();
    await importData(json);
    expect(await Item.countDocuments()).toBe(1);
    expect(await mongoose.connection.db!.collection('expenses').countDocuments()).toBe(1);
  });

  it('refuses a file that is not a backup', async () => {
    const res = await importData('{"hello":"world"}');
    expect(res.ok).toBe(false);
    expect(res.restored).toBe(0);
  });
});
