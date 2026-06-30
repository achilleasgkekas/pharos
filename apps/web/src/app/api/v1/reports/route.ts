import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { connectDB } from '@/lib/db';
import { Expense } from '@/models/Expense';
import { Item } from '@/models/Item';
import { Statement } from '@/models/Statement';
import { getAppSettings } from '@/lib/appSettings';
import { computeInstallmentPlans } from '@/lib/installments';
import type { SerializedStatement } from '@/types';
import { OWNED_STATUSES } from '@/lib/itemStatus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Lean = { kind?: string; amount?: number; category?: string; date?: Date; period?: string };
type ItemLean = { status?: string; purchasedPrice?: number; currentPrice?: number };
const ymOf = (d: Lean): string => {
  if (d.period && /^\d{4}-\d{2}/.test(d.period)) return d.period.slice(0, 7);
  const dt = d.date ? new Date(d.date) : null;
  return dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}` : '';
};

/** GET /api/v1/reports → money summary (net position, this month / year, by-category, last-6-months). */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const [docs, items, statementsRaw, settings] = await Promise.all([
      Expense.find({}).select('kind amount category date period').lean() as Promise<Lean[]>,
      Item.find().select('status purchasedPrice currentPrice').lean() as Promise<ItemLean[]>,
      Statement.find().lean(),
      getAppSettings(),
    ]);

    // ── Net position: owned inventory value − installments still owed ──
    const ownedSet = new Set<string>(OWNED_STATUSES as readonly string[]);
    let inventoryValue = 0;
    for (const i of items) {
      if (ownedSet.has(i.status || '')) inventoryValue += i.purchasedPrice ?? i.currentPrice ?? 0;
    }
    const plans = computeInstallmentPlans(JSON.parse(JSON.stringify(statementsRaw)) as SerializedStatement[]);
    const active = plans.filter((p) => !p.done);
    const installmentsOwed = active.reduce((s, p) => s + p.remainingAmount, 0);
    const netPosition = {
      inventoryValue: Math.round(inventoryValue),
      installmentsOwed: Math.round(installmentsOwed),
      activePlans: active.length,
      net: Math.round(inventoryValue - installmentsOwed),
    };
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
      netPosition,
      thisMonth: { income: sum.mInc, expense: sum.mExp, net: sum.mInc - sum.mExp },
      thisYear: { income: sum.yInc, expense: sum.yExp, net: sum.yInc - sum.yExp },
      byCategory,
      monthly,
    });
  });
}
