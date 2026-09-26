import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '@/test/mongo';
import { runAsActor } from '@/lib/actor';
import { Item } from '@/models/Item';
import { Expense } from '@/models/Expense';

// P75 (#20): the createdBy plugin against a real MongoDB, so the hooks are proven to be
// registered and to reach the stored document, not only to exist.
setupTestDatabase();

// The plugin adds the field at runtime, so the inferred schema types do not list it.
const by = (doc: unknown): string | null => {
  const v = (doc as { createdBy?: unknown } | null)?.createdBy;
  return v == null ? null : String(v);
};

const ALICE = new mongoose.Types.ObjectId().toString();
const BOB = new mongoose.Types.ObjectId().toString();

describe('createdByPlugin', () => {
  it('stamps the actor on Model.create', async () => {
    const doc = await runAsActor(ALICE, () => Item.create({ title: 'Router' }));
    const stored = await Item.findById(doc._id).lean();
    expect(by(stored)).toBe(ALICE);
  });

  it('stamps every document of an insertMany', async () => {
    await runAsActor(BOB, () =>
      Expense.insertMany([
        { vendor: 'Bakery', amount: 3, date: new Date() },
        { vendor: 'Kiosk', amount: 2, date: new Date() },
      ])
    );
    const stored = await Expense.find({ vendor: { $in: ['Bakery', 'Kiosk'] } }).lean();
    expect(stored.map(by)).toEqual([BOB, BOB]);
  });

  it('leaves createdBy null when nobody is acting (jobs, cron)', async () => {
    const doc = await Item.create({ title: 'Scraped thing' });
    expect(by(await Item.findById(doc._id).lean())).toBeNull();
  });

  it('never rewrites the author on a later save by someone else', async () => {
    const doc = await runAsActor(ALICE, () => Item.create({ title: 'Switch' }));
    await runAsActor(BOB, async () => {
      const again = await Item.findById(doc._id);
      again!.set('notes', 'edited by Bob');
      await again!.save();
    });
    expect(by(await Item.findById(doc._id).lean())).toBe(ALICE);
  });

  it('keeps an author the caller already set', async () => {
    const doc = new Item({ title: 'Restored' });
    doc.set('createdBy', ALICE);
    await runAsActor(BOB, () => doc.save());
    expect(by(await Item.findById(doc._id).lean())).toBe(ALICE);
  });
});
