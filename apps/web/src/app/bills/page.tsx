import { connectDB } from '@/lib/db';
import { Bill } from '@/models/Bill';
import { getAppSettings } from '@/lib/appSettings';
import { BillsClient } from './BillsClient';
import type { SerializedBill } from '@/types';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{ bills: SerializedBill[]; categories: string[]; baseCurrency: string; multiCurrency: boolean }> {
  await connectDB();
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
}

export default async function BillsPage() {
  const { bills, categories, baseCurrency, multiCurrency } = await getData();
  return <BillsClient bills={bills} categories={categories} baseCurrency={baseCurrency} multiCurrency={multiCurrency} />;
}
