import { connectDB } from '@/lib/db';
import { Expense as ExpenseModel } from '@/models/Expense';
import { Card as CardModel } from '@/models/Card';
import { isAiReady } from '@/lib/ollama';
import { getAppSettings } from '@/lib/appSettings';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { serializeExpense } from './lib';
import { generateDueRecurring } from './actions';
import { ExpensesClient } from './ExpensesClient';
import type { SerializedCard } from '@/types';

export const dynamic = 'force-dynamic';

export async function getExpenseData(kind: 'income' | 'expense') {
  return withRequestTenant(async () => {
  await connectDB();
  const Expense = await currentModel(ExpenseModel);
  const Card = await currentModel(CardModel);
  // Auto-post any due recurring bills/income before reading (idempotent).
  await generateDueRecurring().catch(() => {});
  const [docs, cards, ollamaUp, settings] = await Promise.all([
    Expense.find({ kind }).select('-rawAiResponse').sort({ date: -1 }).lean(),
    Card.find().sort({ name: 1 }).lean(),
    isAiReady(),
    getAppSettings(),
  ]);
  const expenses = docs.map((d) => serializeExpense(d as Record<string, unknown>));

  // Anomaly flags: within each vendor series (≥3 priced entries), mark entries that
  // deviate >30% from the series median — catches a double bill or a wrong AI parse
  // at a glance. Pure stats, no AI cost; computed fresh on every load.
  const byVendor = new Map<string, number[]>();
  for (const e of expenses) {
    if (!e.vendorKey || !(e.amount > 0)) continue;
    const arr = byVendor.get(e.vendorKey) ?? [];
    arr.push(e.amount);
    byVendor.set(e.vendorKey, arr);
  }
  const medians = new Map<string, number>();
  for (const [k, arr] of byVendor) {
    if (arr.length < 3) continue;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medians.set(k, sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
  }
  for (const e of expenses) {
    const med = e.vendorKey ? medians.get(e.vendorKey) : undefined;
    if (!med || !(e.amount > 0)) continue;
    const dev = (e.amount - med) / med;
    if (Math.abs(dev) > 0.3) e.anomaly = Math.round(dev * 100);
  }

  const vendors = [...new Set(expenses.map((e) => e.vendor).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return {
    expenses,
    cards: JSON.parse(JSON.stringify(cards)) as SerializedCard[],
    vendors,
    ollamaUp,
    categories: settings.expenseCategories,
    spaces: settings.spaces,
  };
  });
}

export default async function ExpensesPage() {
  const data = await getExpenseData('expense');
  return <ExpensesClient kind="expense" {...data} />;
}
