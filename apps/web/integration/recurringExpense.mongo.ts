/** Real MongoDB regression test, deliberately separate from the no-database unit suite.
 * Run against a disposable local mongod: MONGO_TEST_URI=mongodb://127.0.0.1:27029 \
 *   npx tsx integration/recurringExpense.mongo.ts
 * Creates/drops only its own randomly named databases. Never use a production URI. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { Expense } from '../src/models/Expense';
import { insertRecurringExpense } from '../src/lib/recurringExpense';

const uri = process.env.MONGO_TEST_URI;
if (!uri || !/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(uri)) {
  throw new Error('MONGO_TEST_URI must point to a disposable local mongod, with no database or credentials');
}
const doc = { kind: 'expense' as const, vendor: 'Rent', vendorKey: 'rent',
  date: new Date('2026-03-01T00:00:00Z'), amount: 100, recurring: true,
  recurringCycle: 'monthly' as const, aiModel: 'recurring-auto' };

async function main() {
  const connection = await mongoose.createConnection(uri!, { autoIndex: false }).asPromise();
  const prefix = `pharos_recurring_test_${randomUUID().replaceAll('-', '')}`;
  const databases = [connection.useDb(`${prefix}_self`), connection.useDb(`${prefix}_tenant_a`),
    connection.useDb(`${prefix}_tenant_b`)];
  try {
    for (const db of databases) {
      const Model = db.model(Expense.modelName, Expense.schema);
      // Simulate real pre-upgrade data: legitimate duplicates and legacy generated
      // rows must not prevent creation of the new index.
      await Model.createCollection();
      await Model.collection.insertMany([{ ...doc }, { ...doc }, { ...doc, aiModel: 'manual' },
        { ...doc, recurring: false, aiModel: 'manual' }]);
      await Model.createIndexes();
      const results = await Promise.all(Array.from({ length: 24 }, () => insertRecurringExpense(Model, doc)));
      assert.equal(results.filter(Boolean).length, 1, 'one winner across simultaneous upserts');
      assert.equal(await Model.countDocuments({ recurringGenerated: { $exists: true } }), 1);
      assert.equal(await Model.countDocuments({ recurringGenerated: { $exists: false } }), 4,
        'manual and legacy rows are untouched');

      const original = await Model.findOne({ recurringGenerated: { $exists: true } });
      assert.ok(original);
      await Model.updateOne({ _id: original._id }, { $set: { deletedAt: new Date() } });
      const replacements = await Promise.all(Array.from({ length: 24 }, () => insertRecurringExpense(Model, doc)));
      assert.equal(replacements.filter(Boolean).length, 1, 'Trash permits exactly one active replacement');
      assert.equal(await Model.countDocuments({ recurringGenerated: { $exists: true } }), 1);
      assert.equal(await Model.countDocuments({ recurringGenerated: { $exists: true } })
        .setOptions({ withDeleted: true }), 2, 'trashed original is preserved');
      await assert.rejects(Model.updateOne({ _id: original._id }, { $set: { deletedAt: null } })
        .setOptions({ withDeleted: true }), (error: unknown) => (error as { code?: number }).code === 11000);
      assert.equal(await insertRecurringExpense(Model, { ...doc, kind: 'income' }), true,
        'income and expense are distinct series');
      assert.equal(await insertRecurringExpense(Model, { ...doc, vendorKey: 'other' }), true);
      assert.equal(await insertRecurringExpense(Model, { ...doc, date: new Date('2026-04-01Z') }), true);
      // Editing a generated row must release its previous identity, not leave a stale key.
      const april = await Model.findOne({ recurringGenerated: true, date: new Date('2026-04-01Z') });
      assert.ok(april);
      await Model.updateOne({ _id: april._id }, { $set: { vendorKey: 'edited' } });
      assert.equal(await insertRecurringExpense(Model, { ...doc, date: new Date('2026-04-01Z') }), true);
      assert.equal(await Model.countDocuments({ recurringGenerated: true, date: new Date('2026-04-01Z') }), 2);
      console.log(`${db.name}: concurrency, legacy duplicates, Trash and series isolation passed`);
    }
  } finally {
    for (const db of databases) await db.dropDatabase();
    await connection.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
