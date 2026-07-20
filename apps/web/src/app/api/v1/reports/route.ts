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
import { categoryRollover, ROLLOVER_WINDOW } from '@/lib/budgetRollover';
import { buildMonthReview } from '@/lib/monthReview';
import { netWorthOf } from '@/lib/netWorth';
import { computeMoneyAgenda } from '@/lib/moneyAgenda';
import { computeSafeToSpend } from '@/lib/safeToSpend';
import type { SerializedStatement } from '@/types';
import { OWNED_STATUSES } from '@/lib/itemStatus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Lean = { kind?: string; amount?: number; category?: string; date?: Date; period?: string; vendor?: string; vendorKey?: string; recurring?: boolean };
type ItemLean = { _id?: unknown; status?: string; purchasedPrice?: number; currentPrice?: number; warrantyUntil?: string | Date; title?: string; category?: string };
type ReceiptLean = { store?: string; date?: Date; total?: number };
type SubLean = { amount?: number; billingCycle?: string; category?: string };
// Monthly-equivalent multiplier per billing cycle. Mirrors web /reports CYCLE_PER_MONTH.
const CYCLE_PER_MONTH: Record<string, number> = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12, lifetime: 0 };
const ymOf = (d: Lean): string => {
  if (d.period && /^\d{4}-\d{2}/.test(d.period)) return d.period.slice(0, 7);
  const dt = d.date ? new Date(d.date) : null;
  return dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}` : '';
};
// Mirrors web /reports page.tsx MN + monthLabel().
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (d: Date): string => `${MN[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;

/** GET /api/v1/reports → money summary (net position, this month / year, by-category, last-6-months). */
export async function GET(req: NextRequest) {
  return withAuth(req, async () => {
    // Date-range selector (mirrors web /reports ?months=). When a valid value is
    // given, BOTH windowed series (monthly spend + 12-month cash-flow) use it.
    // No/invalid param keeps the legacy defaults (spend=6, flow=12) so an
    // un-updated mobile client sees exactly the same windows as before.
    const rawMonths = Number(req.nextUrl.searchParams.get('months'));
    const selMonths = [6, 12, 24].includes(rawMonths) ? rawMonths : null;
    const spendWindow = selMonths ?? 6;
    const flowWindow = selMonths ?? 12;
    await connectDB();
    const [docs, items, statementsRaw, receipts, subs, settings] = await Promise.all([
      Expense.find({}).select('kind amount category date period vendor vendorKey recurring').lean() as Promise<Lean[]>,
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
    const serializedStatements = JSON.parse(JSON.stringify(statementsRaw)) as SerializedStatement[];
    const plans = computeInstallmentPlans(serializedStatements);
    const active = plans.filter((p) => !p.done);
    const installmentsOwed = active.reduce((s, p) => s + p.remainingAmount, 0);
    const netPosition = {
      inventoryValue: Math.round(inventoryValue),
      installmentsOwed: Math.round(installmentsOwed),
      activePlans: active.length,
      net: Math.round(inventoryValue - installmentsOwed),
    };

    // ── Net worth (PA2 gap): assets (inventory + manual accounts) minus
    //    liabilities (remaining installments + last-statement-per-card balance).
    //    Mirrors web /reports page.tsx netWorthNow. Chart/snapshot series is
    //    deliberately NOT captured here (would spam NetWorthSnapshot on every
    //    mobile poll) — headline + breakdown only, chart deferred. ──
    const byCard = new Map<string, SerializedStatement>();
    for (const st of serializedStatements) {
      const k = st.last4 || st.card || st._id;
      const cur = byCard.get(k);
      if (!cur || new Date(st.period || st.statementDate) > new Date(cur.period || cur.statementDate)) byCard.set(k, st);
    }
    const liabCards = [...byCard.values()].reduce((s, st) => s + Math.max(0, (st.totalAmount || 0) - (st.paidAmount || 0)), 0);
    const assetsAccountsMap = (settings.assetAccounts || {}) as Record<string, number>;
    const assetsAccounts = Object.values(assetsAccountsMap).reduce((s, v) => s + (v || 0), 0);
    const netWorth = {
      assetsInventory: Math.round(inventoryValue),
      assetsAccounts: Math.round(assetsAccounts),
      liabInstallments: Math.round(installmentsOwed),
      liabCards: Math.round(liabCards),
      net: netWorthOf({ assetsInventory: inventoryValue, assetsAccounts, accounts: assetsAccountsMap, liabInstallments: installmentsOwed, liabCards }),
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
    for (let i = spendWindow - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const monthly = months.map((m) => ({ period: m, expense: 0, income: 0 }));

    // ── Income vs expense (windowed months). Mirrors web /reports "Cash flow". ──
    const ie: Array<{ period: string; income: number; expense: number }> = [];
    for (let i = flowWindow - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      ie.push({ period: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, income: 0, expense: 0 });
    }
    const byCat: Record<string, number> = {};
    const thisMonthCat: Record<string, number> = {}; // expense per category, THIS month (for budgets)
    const sum = { mExp: 0, mInc: 0, yExp: 0, yInc: 0 };
    // Per (month → category) expense totals + per-month expense total, used by the
    // envelope/rollover budget carry (P25). Only expense (non-income) rows count.
    // Mirrors web /reports page.tsx catByMonth/totalByMonth.
    const catByMonth = new Map<string, Map<string, number>>();
    const totalByMonth = new Map<string, number>();

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
      if (!inc && ym) {
        totalByMonth.set(ym, (totalByMonth.get(ym) ?? 0) + amt);
        let byCatMonth = catByMonth.get(ym);
        if (!byCatMonth) catByMonth.set(ym, (byCatMonth = new Map<string, number>()));
        byCatMonth.set(cat, (byCatMonth.get(cat) ?? 0) + amt);
      }
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
    // In envelope mode (P25) each row also gets `carried` (net unspent from recent
    // complete months) and `effective` (base + carried, floored at 0) — additive,
    // present only when settings.budgetRollover is on so an un-updated client sees
    // the same shape as before.
    const budgetMap = (settings.budgets || {}) as Record<string, number>;
    const rolloverOn = !!settings.budgetRollover;
    const rolloverMonthKeys: string[] = [];
    if (rolloverOn) {
      for (let n = 1; n <= ROLLOVER_WINDOW; n++) {
        const d = new Date(now.getFullYear(), now.getMonth() - n, 1);
        const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if ((totalByMonth.get(mk) ?? 0) > 0) rolloverMonthKeys.push(mk);
      }
    }
    const budgets = Object.entries(budgetMap)
      .filter(([, limit]) => Number(limit) > 0)
      .map(([category, limit]) => {
        const base = Number(limit);
        const spent = Math.round((thisMonthCat[category] || 0) * 100) / 100;
        if (!rolloverOn) return { category, limit: base, spent };
        const priorSpends = rolloverMonthKeys.map((mk) => catByMonth.get(mk)?.get(category) ?? 0);
        const { carried, effective } = categoryRollover(Math.round(base), priorSpends);
        return { category, limit: base, spent, carried, effective };
      })
      .sort((a, b) => b.limit - a.limit);

    // ── Safe-to-spend (P19) — known expected income minus fixed future charges,
    //    as a single available figure + 30/60/90-day windows. Mirrors web
    //    /reports page.tsx (its own DB round-trip via computeMoneyAgenda, same
    //    as the web server component does — the agenda spans subs/statements/
    //    items/vouchers/recurring-expenses, none of which the fields above
    //    already fetch in the right shape). ──
    const { months: agendaMonths } = await computeMoneyAgenda();
    const safeToSpend = computeSafeToSpend(agendaMonths);

    // ── Month in Review (P3) — deterministic narrative digest, reuses the
    //    already-fetched expense rows + item warranties + budgets. Mirrors web
    //    /reports page.tsx monthReview (zero new DB round-trips). ──
    const monthReview = {
      ...buildMonthReview(docs, { monthKey: thisYM, budgets: budgetMap, warranties: items, now }),
      monthLabel: monthLabel(now),
    };

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

    // ── Installment payoff (all plans, active + done). Mirrors web /reports
    //    "Installment payoff" card. Linked plans resolve item titles as label. ──
    const titleById = new Map(items.map((i) => [String(i._id), i.title || '']));
    const installmentPayoff = plans.map((p) => ({
      key: p.key,
      label: p.itemIds.length
        ? p.itemIds.map((id) => titleById.get(id)).filter(Boolean).join(' + ') || p.label
        : p.label,
      linked: p.itemIds.length > 0,
      paidInstallments: p.paidInstallments,
      totalInstallments: p.totalInstallments,
      perAmount: Math.round(p.perAmount * 100) / 100,
      remainingAmount: Math.round(p.remainingAmount * 100) / 100,
      done: p.done,
    }));

    return NextResponse.json({
      currency: settings.currency || 'EUR',
      // Effective trend window the client should highlight (6/12/24). Legacy
      // (no param) reports 12 but keeps the asymmetric 6/12 arrays for old clients.
      months: selMonths ?? 12,
      netPosition,
      netWorth,
      safeToSpend,
      monthReview,
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
      installmentPayoff,
    });
  });
}
