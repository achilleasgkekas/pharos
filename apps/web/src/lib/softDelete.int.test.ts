import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@/test/mongo';
import { Item } from '@/models/Item';

// The soft-delete plugin against a real MongoDB (#331). The unit test calls the hook by hand,
// which is exactly how the Mongoose 9 `next is not a function` break went unnoticed: only a real
// query proves the hook is registered and the filter reaches the server.
setupTestDatabase();

describe('softDeletePlugin on a real collection', () => {
  it('hides trashed documents from find, findOne, countDocuments and distinct', async () => {
    const live = await Item.create({ title: 'Kettle', category: 'Kitchen' });
    const trashed = await Item.create({ title: 'Old toaster', category: 'Kitchen' });
    // Trash it with the raw driver, so the plugin is only exercised on the reads below.
    await Item.collection.updateOne({ _id: new mongoose.Types.ObjectId(String(trashed._id)) }, { $set: { deletedAt: new Date() } });

    const found = await Item.find({ category: 'Kitchen' }).lean();
    expect(found.map((d) => String(d._id))).toEqual([String(live._id)]);
    expect(await Item.findOne({ _id: trashed._id })).toBeNull();
    expect(await Item.countDocuments({ category: 'Kitchen' })).toBe(1);
    expect(await Item.distinct('title', { category: 'Kitchen' })).toEqual(['Kettle']);
  });

  it('shows trashed documents with { withDeleted: true }', async () => {
    const all = await Item.find({ category: 'Kitchen' }).setOptions({ withDeleted: true }).lean();
    expect(all.map((d) => d.title).sort()).toEqual(['Kettle', 'Old toaster']);
  });

  it('bulk updates and deletes leave trashed documents alone', async () => {
    await Item.updateMany({ category: 'Kitchen' }, { $set: { location: 'Shelf' } });
    await Item.deleteMany({ category: 'Kitchen', location: { $exists: false } });
    const trashed = await Item.findOne({ title: 'Old toaster' }).setOptions({ withDeleted: true }).lean();
    expect(trashed).not.toBeNull();
    expect(trashed?.location).not.toBe('Shelf');
  });

  it('restoring clears deletedAt and brings the document back', async () => {
    await Item.updateOne({ title: 'Old toaster' }, { $set: { deletedAt: null } } as never).setOptions({ withDeleted: true });
    expect(await Item.countDocuments({ category: 'Kitchen' })).toBe(2);
  });
});
