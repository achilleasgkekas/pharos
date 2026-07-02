import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/apiAuth';
import { connectDB } from '@/lib/db';
import { Expense } from '@/models/Expense';
import { Item } from '@/models/Item';
import { Receipt } from '@/models/Receipt';
import { Statement } from '@/models/Statement';
import { Subscription } from '@/models/Subscription';
import { getAppSettings } from '@/lib/appSettings';
import { computeInstallmentPlans } from '@/lib/installments';
import type { SerializedStatement } from '@/types';
import { OWNED_STATUSES } from '@/lib/itemStatus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Lean = { kind?: string; amount?: number; category?: string; date?: Date; period?: string };
type ItemLean = { status?: string; purchasedPrice?: number; currentPrice?: number; warrantyUntil?: string | Date; title?: string; category?: string };
type ReceiptLean = { store?: string; date?: Date; total?: number };
type SubLean = { amount?: number; billingCycle?: string; category?: string };
// Monthly-equivalent multiplier per billing cycle. Mirrors web /reports CYCLE_PER_MONTH.
const CYCLE_PER_MONTH: Record<string, number> = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12, lifetime: 0 };
const ymOf = (d: Lean): string => {
  if (d.period && /^\d{4}-\d{2}/.test(d.period)) return d.period.slice(0, 7);
  const dt = d.date ? new Date(d.date) : null;
  return dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}` : '';
};

/** GET /api/v1/reports → money summary (net position, this month / year, by-category, last-6-months). */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    await connectDB();
    const [docs, items, statementsRaw, receipts, subs, settings] = await Promise.all([
      Expense.find({}).select('kind amount category date period').lean() as Promise<Lean[]>,
      Item.find().select('status purchasedPrice currentPrice warrantyUntil title category').lean() as Promise<ItemLean[]>,
      Statement.find().lean(),
      Receipt.find().select('store date total').lean() as Promise<ReceiptLean[]>,
      Subscription.find({ active: true }).select('amount billingCycle category').lean() as Promise<SubLean[]>,
      getAppSettings(),
    ]);

    // ── Net position: owned inventory value − installments still owed ──
    const ownedSet = new Set<string>(OWNED_STATUSES as readonly string[]);
    let inventoryValue = 0;
    // Inventory value by category (owned items, value>0). Mirrors web /reports catSpend.
    const invByCat = new Map<string, number>();
    for (const i of items) {
      if (ownedSet.has(i.status || '')) {
        const v = i.purchasedPrice ?? i.currentPrice ?? 0;
        inventoryValue += v;
        if (v > 0) {
          const c = i.category || 'other';
          invByCat.set(c, (invByCat.get(c) ?? 0) + v);
        }
      }
    }
    const inventoryByCategory = [...invByCat.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
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

    // ── Upcoming installment obligations (next 6 months). Mirrors web /reports. ──
    const upcomingInstallments = [1, 2, 3, 4, 5, 6].map((n) => {
      const d = new Date(now.getFullYear(), now.getMonth() + n, 1);
      const amount = active
        .filter((p) => p.remainingInstallments >= n)
        .reduce((s, p) => s + p.perAmount, 0);
      return {
        period: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        amount: Math.round(amount),
      };
    });
    const thisYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisYear = String(now.getFullYear());

    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const monthly = months.map((m) => ({ period: m, expense: 0, income: 0 }));

    // ── Income vs expense (last 12 months). Mirrors web /reports "Cash flow". ──
    const ie: Array<{ period: string; income: number; expense: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      ie.push({ period: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, income: 0, expense: 0 });
    }
    const byCat: Record<string, number> = {};
    const thisMonthCat: Record<string, number> = {}; // expense per category, THIS month (for budgets)
    const sum = { mExp: 0, mInc: 0, yExp: 0, yInc: 0 };

    for (const d of docs) {
      const ym = ymOf(d);
      const amt = d.amount || 0;
      if (amt <= 0) continue;
      const inc = d.kind === 'income';
      const cat = d.category || 'other';
      const bucket = monthly.find((b) => b.period === ym);
      if (bucket) { if (inc) bucket.income += amt; else bucket.expense += amt; }
      const ieBucket = ie.find((b) => b.period === ym);
      if (ieBucket) { if (inc) ieBucket.income += amt; else ieBucket.expense += amt; }
      if (ym === thisYM) {
        if (inc) sum.mInc += amt;
        else { sum.mExp += amt; thisMonthCat[cat] = (thisMonthCat[cat] || 0) + amt; }
      }
      if (ym.startsWith(thisYear)) {
        if (inc) sum.yInc += amt;
        else { sum.yExp += amt; byCat[cat] = (byCat[cat] || 0) + amt; }
      }
    }
    const byCategory = Object.entries(byCat).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total).slice(0, 8);

    // Budget vs actual (this month), per budgeted category. Mirrors web /reports "Budget · this month".
    const budgetMap = (settings.budgets || {}) as Record<string, number>;
    const budgets = Object.entries(budgetMap)
      .filter(([, limit]) => Number(limit) > 0)
      .map(([category, limit]) => ({
        category,
        limit: Number(limit),
        spent: Math.round((thisMonthCat[category] || 0) * 100) / 100,
      }))
      .sort((a, b) => b.limit - a.limit);

    // ── Spend by store (top 8). Mirrors web /reports. ──
    const storeMap = new Map<string, { total: number; count: number }>();
    for (const r of receipts) {
      const k = r.store || '—';
      const e = storeMap.get(k) ?? { total: 0, count: 0 };
      e.total += r.total || 0;
      e.count += 1;
      storeMap.set(k, e);
    }
    const spendByStore = [...storeMap.entries()]
      .map(([name, v]) => ({ name, total: Math.round(v.total), count: v.count }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    // ── Biggest single purchases (top receipts). Mirrors web /reports. ──
    const biggestPurchases = receipts
      .filter((r) => (r.total || 0) > 0)
      .sort((a, b) => (b.total || 0) - (a.total || 0))
      .slice(0, 8)
      .map((r) => ({ store: r.store || '—', total: Math.round(r.total || 0), date: r.date ? String(r.date) : '' }));

    // ── Warranties expiring (next 150 days). Mirrors web /reports. ──
    const warrantiesExpiring = items
      .filter((i) => i.warrantyUntil)
      .map((i) => {
        const t = new Date(i.warrantyUntil as string).getTime();
        return { title: i.title || '—', until: String(i.warrantyUntil), days: Math.ceil((t - now.getTime()) / 86400000) };
      })
      .filter((w) => !isNaN(w.days) && w.days >= 0 && w.days <= 150)
      .sort((a, b) => a.days - b.days)
      .slice(0, 10);

    // ── Active subscriptions by category (monthly-equivalent). Mirrors web /reports. ──
    const subsByCat = new Map<string, number>();
    for (const sub of subs) {
      const m = (sub.amount || 0) * (CYCLE_PER_MONTH[sub.billingCycle || 'monthly'] ?? 1);
      const k = sub.category || 'other';
      subsByCat.set(k, (subsByCat.get(k) ?? 0) + m);
    }
    const subsByCategory = [...subsByCat.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);

    return NextResponse.json({
      currency: settings.currency || 'EUR',
      netPosition,
      thisMonth: { income: sum.mInc, expense: sum.mExp, net: sum.mInc - sum.mExp },
      thisYear: { income: sum.yInc, expense: sum.yExp, net: sum.yInc - sum.yExp },
      byCategory,
      budgets,
      monthly,
      incomeExpense: ie.map((m) => ({ period: m.period, income: Math.round(m.income), expense: Math.round(m.expense) })),
      upcomingInstallments,
      spendByStore,
      subsByCategory,
      inventoryByCategory,
      biggestPurchases,
      warrantiesExpiring,
    });
  });
}
