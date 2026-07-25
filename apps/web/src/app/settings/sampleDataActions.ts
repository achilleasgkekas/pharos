'use server';
// P1 — demo/sample-data mode. "Load sample data" fills Items/Receipts/Expenses/
// Subscriptions with a small realistic set (lib/sampleData.ts) so a fresh self-host
// install immediately shows what Pharos looks like in use. Every record is tagged
// `isSample: true`, so "Clear sample data" can wipe exactly (and only) those records.
// Tenant-scoped via withRequestTenant/currentModel, same as items/actions.ts +
// receipts/actions.ts + expenses/actions.ts — no-op on self-hosted (SAAS_MODE off,
// single DEFAULT connection), but correct per-tenant in SaaS mode.
import { revalidatePath } from 'next/cache';
import { connectDB } from '@/lib/db';
import { Item as ItemModel } from '@/models/Item';
import { Receipt as ReceiptModel } from '@/models/Receipt';
import { Expense as ExpenseModel } from '@/models/Expense';
import { Subscription as SubscriptionModel } from '@/models/Subscription';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { requireAdmin } from '@/lib/auth';
import { getLocale } from '@/lib/i18n/server';
import { buildSampleData } from '@/lib/sampleData';

export type SampleDataCounts = { items: number; receipts: number; expenses: number; subscriptions: number };

async function sampleCounts(): Promise<SampleDataCounts> {
  await connectDB();
  const Item = await currentModel(ItemModel);
  const Receipt = await currentModel(ReceiptModel);
  const Expense = await currentModel(ExpenseModel);
  const Subscription = await currentModel(SubscriptionModel);
  const [items, receipts, expenses, subscriptions] = await Promise.all([
    Item.countDocuments({ isSample: true }),
    Receipt.countDocuments({ isSample: true }),
    Expense.countDocuments({ isSample: true }),
    Subscription.countDocuments({ isSample: true }),
  ]);
  return { items, receipts, expenses, subscriptions };
}

function revalidateAffected() {
  for (const p of ['/', '/items', '/shopping', '/receipts', '/expenses', '/income', '/subscriptions', '/reports', '/settings']) {
    revalidatePath(p);
  }
}

/** Current sample-data footprint, for the Settings toggle UI. */
export async function getSampleDataStatus(): Promise<{ loaded: boolean; counts: SampleDataCounts }> {
  return withRequestTenant(async () => {
    const counts = await sampleCounts();
    const loaded = counts.items + counts.receipts + counts.expenses + counts.subscriptions > 0;
    return { loaded, counts };
  });
}

/** Fill the app with a demo dataset (idempotent: replaces any previous sample set
 *  with a fresh one, dated relative to today). Never touches non-sample records. */
export async function loadSampleData(): Promise<{ ok: boolean; counts: SampleDataCounts }> {
  await requireAdmin();
  return withRequestTenant(async () => {
    await connectDB();
    const Item = await currentModel(ItemModel);
    const Receipt = await currentModel(ReceiptModel);
    const Expense = await currentModel(ExpenseModel);
    const Subscription = await currentModel(SubscriptionModel);
    const locale = await getLocale();
    const data = buildSampleData(new Date(), locale);

    await Promise.all([
      Item.deleteMany({ isSample: true }),
      Receipt.deleteMany({ isSample: true }),
      Expense.deleteMany({ isSample: true }),
      Subscription.deleteMany({ isSample: true }),
    ]);
    await Promise.all([
      Item.insertMany(data.items),
      Receipt.insertMany(data.receipts),
      Expense.insertMany(data.expenses),
      Subscription.insertMany(data.subscriptions),
    ]);

    revalidateAffected();
    return { ok: true, counts: await sampleCounts() };
  });
}

/** Remove every sample-tagged record. Real data is never touched (matched strictly
 *  by isSample:true). */
export async function clearSampleData(): Promise<{ ok: boolean }> {
  await requireAdmin();
  return withRequestTenant(async () => {
    await connectDB();
    const Item = await currentModel(ItemModel);
    const Receipt = await currentModel(ReceiptModel);
    const Expense = await currentModel(ExpenseModel);
    const Subscription = await currentModel(SubscriptionModel);
    await Promise.all([
      Item.deleteMany({ isSample: true }),
      Receipt.deleteMany({ isSample: true }),
      Expense.deleteMany({ isSample: true }),
      Subscription.deleteMany({ isSample: true }),
    ]);
    revalidateAffected();
    return { ok: true };
  });
}
