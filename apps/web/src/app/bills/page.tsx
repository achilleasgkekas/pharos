import { connectDB } from '@/lib/db';
import { Bill as BillModel } from '@/models/Bill';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { getAppSettings } from '@/lib/appSettings';
import { BillsClient } from './BillsClient';
import type { SerializedBill } from '@/types';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{ bills: SerializedBill[]; categories: string[]; baseCurrency: string; multiCurrency: boolean }> {
  // Read through the same tenant seam the bill actions write through, so SaaS mode never
  // shows the default tenant's bills next to another tenant's writes. Self-hosted: no-op.
  return withRequestTenant(async () => {
    await connectDB();
    const Bill = await currentModel(BillModel);
    const [bills, settings] = await Promise.all([
      // Unpaid first, then soonest due — the order you triage bills in.
      Bill.find().sort({ paidAt: 1, dueDate: 1 }).lean(),
      getAppSettings(),
    ]);
    return {
      bills: JSON.parse(JSON.stringify(bills)),
      categories: settings.expenseCategories,
      baseCurrency: settings.currency,
      multiCurrency: settings.multiCurrency, // P9: off = no per-bill currency controls at all
    };
  });
}

export default async function BillsPage() {
  const { bills, categories, baseCurrency, multiCurrency } = await getData();
  return <BillsClient bills={bills} categories={categories} baseCurrency={baseCurrency} multiCurrency={multiCurrency} />;
}
