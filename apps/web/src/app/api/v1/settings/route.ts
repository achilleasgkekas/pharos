import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { connectDB } from '@/lib/db';
import { Expense } from '@/models/Expense';
import { getAppSettings } from '@/lib/appSettings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/settings → app preferences + this-month budget usage (read-only, for the mobile Settings screen). */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const s = await getAppSettings();
    const budgetMap = (s.budgets || {}) as Record<string, number>;

    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // This-month expense total per category: by period when set, else by date.
    const expenses = (await Expense.find({
      kind: 'expense',
      $or: [{ period }, { period: '', date: { $gte: monthStart, $lt: monthEnd } }],
    })
      .select('category amount')
      .lean()) as { category?: string; amount?: number }[];

    const spent: Record<string, number> = {};
    for (const e of expenses) {
      const c = e.category || 'other';
      spent[c] = (spent[c] || 0) + (e.amount || 0);
    }

    // One row per category that has a budget, ordered most-over-budget first.
    const budgets = Object.entries(budgetMap)
      .filter(([, limit]) => Number(limit) > 0)
      .map(([category, limit]) => ({
        category,
        limit: Number(limit),
        spent: Math.round((spent[category] || 0) * 100) / 100,
      }))
      .sort((a, b) => b.spent / b.limit - a.spent / a.limit);

    return NextResponse.json({
      currency: s.currency,
      defaultVatRate: s.defaultVatRate,
      period,
      budgets,
    });
  });
}
