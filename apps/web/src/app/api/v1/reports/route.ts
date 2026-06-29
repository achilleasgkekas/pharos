import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { connectDB } from '@/lib/db';
import { Expense } from '@/models/Expense';
import { getAppSettings } from '@/lib/appSettings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Lean = { kind?: string; amount?: number; category?: string; date?: Date; period?: string };
const ymOf = (d: Lean): string => {
  if (d.period && /^\d{4}-\d{2}/.test(d.period)) return d.period.slice(0, 7);
  const dt = d.date ? new Date(d.date) : null;
  return dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}` : '';
};

/** GET /api/v1/reports → money summary (this month / year, by-category, last-6-months). */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const [docs, settings] = await Promise.all([
      Expense.find({}).select('kind amount category date period').lean() as Promise<Lean[]>,
      getAppSettings(),
    ]);
    const now = new Date();
    const thisYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisYear = String(now.getFullYear());

    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const monthly = months.map((m) => ({ period: m, expense: 0, income: 0 }));
    const byCat: Record<string, number> = {};
    const sum = { mExp: 0, mInc: 0, yExp: 0, yInc: 0 };

    for (const d of docs) {
      const ym = ymOf(d);
      const amt = d.amount || 0;
      const inc = d.kind === 'income';
      const bucket = monthly.find((b) => b.period === ym);
      if (bucket) { if (inc) bucket.income += amt; else bucket.expense += amt; }
      if (ym === thisYM) { if (inc) sum.mInc += amt; else sum.mExp += amt; }
      if (ym.startsWith(thisYear)) {
        if (inc) sum.yInc += amt;
        else { sum.yExp += amt; byCat[d.category || 'other'] = (byCat[d.category || 'other'] || 0) + amt; }
      }
    }
    const byCategory = Object.entries(byCat).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total).slice(0, 8);

    return NextResponse.json({
      currency: settings.currency || 'EUR',
      thisMonth: { income: sum.mInc, expense: sum.mExp, net: sum.mInc - sum.mExp },
      thisYear: { income: sum.yInc, expense: sum.yExp, net: sum.yInc - sum.yExp },
      byCategory,
      monthly,
    });
  });
}
