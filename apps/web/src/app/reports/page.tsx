import { connectDB } from '@/lib/db';
import { Item } from '@/models/Item';
import { Receipt } from '@/models/Receipt';
import { Statement } from '@/models/Statement';
import { Subscription } from '@/models/Subscription';
import { Expense } from '@/models/Expense';
import { Goal } from '@/models/Goal';
import { OWNED_STATUSES, SHOPPING_STATUSES } from '@/lib/itemStatus';
import { computeInstallmentPlans } from '@/lib/installments';
import { getAppSettings } from '@/lib/appSettings';
import { estimatedItemValue } from '@/lib/depreciation';
import { categoryRollover, ROLLOVER_WINDOW } from '@/lib/budgetRollover';
import { captureAndListSnapshots } from '@/lib/netWorth';
import { computeMoneyAgenda } from '@/lib/moneyAgenda';
import { computeSafeToSpend } from '@/lib/safeToSpend';
import { goalProgress } from '@/lib/goals';
import type { SerializedStatement } from '@/types';
import { ReportsClient } from './ReportsClient';

export const dynamic = 'force-dynamic';

const CYCLE_PER_MONTH: Record<string, number> = {
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
  lifetime: 0,
};

const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type LeanReceipt = { store?: string; date?: string | Date | null; total?: number; vatAmount?: number };
type LeanItem = {
  title?: string;
  category?: string;
  status?: string;
  purchasedPrice?: number | null;
  currentPrice?: number;
  purchasedAt?: string | Date | null;
  warrantyUntil?: string | Date | null;
};
type LeanSub = { amount?: number; billingCycle?: string; category?: string };

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(d: Date): string {
  return `${MN[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

async function getReports(monthsBack = 12) {
  await connectDB();

  const [receiptsRaw, itemsRaw, subsRaw, statementsRaw, expensesRaw, goalsRaw] = await Promise.all([
    Receipt.find().select('store date total vatAmount').lean(),
    Item.find().select('title category status purchasedPrice currentPrice purchasedAt warrantyUntil').lean(),
    Subscription.find({ active: true }).select('amount billingCycle category').lean(),
    Statement.find().lean(),
    Expense.find().select('kind amount date period category space').lean(),
    Goal.find({ archived: { $ne: true } }).sort({ createdAt: -1 }).lean(),
  ]);

  const receipts = JSON.parse(JSON.stringify(receiptsRaw)) as LeanReceipt[];
  const items = JSON.parse(JSON.stringify(itemsRaw)) as LeanItem[];
  const subs = JSON.parse(JSON.stringify(subsRaw)) as LeanSub[];

  const now = new Date();

  // ── Monthly spend (last 12 months, from receipts) ────────────────────────
  const months: { key: string; label: string; total: number; count: number }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: monthKey(d), label: monthLabel(d), total: 0, count: 0 });
  }
  const mIdx = new Map(months.map((m, i) => [m.key, i]));
  let receiptsTotal = 0;
  let receiptsVat = 0;
  for (const r of receipts) {
    receiptsTotal += r.total || 0;
    receiptsVat += r.vatAmount || 0;
    if (!r.date) continue;
    const d = new Date(r.date);
    if (isNaN(d.getTime())) continue;
    const idx = mIdx.get(monthKey(d));
    if (idx != null) {
      months[idx].total += r.total || 0;
      months[idx].count += 1;
    }
  }
  const monthlySpend = months.map((m) => ({ ...m, total: Math.round(m.total) }));

  // ── Income vs Expense (last 12 months, from the Expense collection) ──────
  const expensesData = JSON.parse(JSON.stringify(expensesRaw)) as {
    kind?: string;
    amount?: number;
    date?: string | Date | null;
    period?: string;
    category?: string;
    space?: string;
  }[];
  const ie = months.map((m) => ({ key: m.key, label: m.label, income: 0, expense: 0 }));
  const ieIdx = new Map(ie.map((m, i) => [m.key, i]));
  const thisMonthKey = monthKey(now);
  const thisYear = now.getFullYear();
  let incomeYear = 0;
  let expenseYear = 0;
  let incomeMonth = 0;
  let expenseMonth = 0;
  const expCatMap = new Map<string, number>();
  const expSpaceMap = new Map<string, number>(); // expense per space/ledger tag (P34); '' = unassigned
  const thisMonthCat = new Map<string, number>(); // expense per category, THIS month (for budgets)
  // Per (month → category) expense totals + per-month expense total, used by the
  // envelope/rollover budget carry (P25). Only expense (non-income) rows count.
  const catByMonth = new Map<string, Map<string, number>>();
  const totalByMonth = new Map<string, number>();
  for (const e of expensesData) {
    const amt = e.amount || 0;
    if (amt <= 0) continue;
    const isIncome = e.kind === 'income';
    const cat = e.category || 'other';
    if (!isIncome) {
      expCatMap.set(cat, (expCatMap.get(cat) ?? 0) + amt);
      const sp = (e.space || '').trim();
      expSpaceMap.set(sp, (expSpaceMap.get(sp) ?? 0) + amt);
    }
    // Bucket by period (YYYY-MM) if present, else by date.
    let mk = e.period && /^\d{4}-\d{2}$/.test(e.period) ? e.period : '';
    if (!mk && e.date) {
      const d = new Date(e.date);
      if (!isNaN(d.getTime())) mk = monthKey(d);
    }
    if (!mk) continue;
    if (!isIncome) {
      totalByMonth.set(mk, (totalByMonth.get(mk) ?? 0) + amt);
      let byCat = catByMonth.get(mk);
      if (!byCat) catByMonth.set(mk, (byCat = new Map<string, number>()));
      byCat.set(cat, (byCat.get(cat) ?? 0) + amt);
    }
    const idx = ieIdx.get(mk);
    if (idx != null) {
      if (isIncome) ie[idx].income += amt;
      else ie[idx].expense += amt;
    }
    if (Number(mk.slice(0, 4)) === thisYear) {
      if (isIncome) incomeYear += amt;
      else expenseYear += amt;
    }
    if (mk === thisMonthKey) {
      if (isIncome) incomeMonth += amt;
      else {
        expenseMonth += amt;
        thisMonthCat.set(cat, (thisMonthCat.get(cat) ?? 0) + amt);
      }
    }
  }
  const incomeExpense = ie.map((m) => ({ ...m, income: Math.round(m.income), expense: Math.round(m.expense) }));
  // Budget vs actual (this month), per budgeted category. In envelope mode (P25)
  // each category also gets a `carried` (net unspent from recent complete months)
  // and an `effective` budget = base + carried, so the bar tracks the rolling
  // envelope instead of the flat monthly cap.
  const appSettings = await getAppSettings();
  // The last ROLLOVER_WINDOW complete months (excluding the current partial month),
  // restricted to months that actually had tracked expense — an untracked/empty
  // month must not manufacture a phantom surplus.
  const rolloverMonthKeys: string[] = [];
  if (appSettings.budgetRollover) {
    for (let n = 1; n <= ROLLOVER_WINDOW; n++) {
      const d = new Date(now.getFullYear(), now.getMonth() - n, 1);
      const mk = monthKey(d);
      if ((totalByMonth.get(mk) ?? 0) > 0) rolloverMonthKeys.push(mk);
    }
  }
  const budgetVsActual = Object.entries(appSettings.budgets)
    .map(([name, budget]) => {
      const base = Math.round(budget);
      const actual = Math.round(thisMonthCat.get(name) ?? 0);
      if (!appSettings.budgetRollover) return { name, budget: base, actual };
      const priorSpends = rolloverMonthKeys.map((mk) => catByMonth.get(mk)?.get(name) ?? 0);
      const { carried, effective } = categoryRollover(base, priorSpends);
      return { name, budget: base, actual, carried, effective };
    })
    .sort((a, b) => b.budget - a.budget);
  const expenseByCategory = [...expCatMap.entries()]
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  // Per-space / per-property breakdown (P34). Only surfaced once the user has actually
  // tagged some expense with a named space — otherwise it's a single "unassigned" bar
  // that adds no signal, so we return [] and the card stays hidden.
  const hasNamedSpace = [...expSpaceMap.keys()].some((k) => k !== '');
  const expenseBySpace = hasNamedSpace
    ? [...expSpaceMap.entries()]
        .map(([name, value]) => ({ name, value: Math.round(value) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10)
    : [];

  // ── Spend by store (top 8) ───────────────────────────────────────────────
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

  // ── Biggest single purchases (top receipts) ──────────────────────────────
  const biggestPurchases = receipts
    .filter((r) => (r.total || 0) > 0)
    .sort((a, b) => (b.total || 0) - (a.total || 0))
    .slice(0, 8)
    .map((r) => ({ store: r.store || '—', total: Math.round(r.total || 0), date: r.date ? String(r.date) : '' }));

  // ── Inventory value by category (owned items) ────────────────────────────
  // Owned value is the depreciation-adjusted estimate (P29): assets are valued at
  // an estimated current worth from purchase price + date, not stuck at cost.
  // When depreciation is disabled the estimate collapses to the old formula.
  const catSpend = new Map<string, number>();
  let ownedValue = 0;
  let shoppingValue = 0;
  const ownedSet = new Set<string>(OWNED_STATUSES as readonly string[]);
  const shoppingSet = new Set<string>(SHOPPING_STATUSES as readonly string[]);
  for (const i of items) {
    const owned = ownedSet.has(i.status || '');
    const shopping = shoppingSet.has(i.status || '') && i.status !== 'deferred';
    if (owned) {
      const v = estimatedItemValue(i, appSettings.depreciation, now);
      ownedValue += v;
      if (v > 0) {
        const c = i.category || 'other';
        catSpend.set(c, (catSpend.get(c) ?? 0) + v);
      }
    }
    if (shopping) shoppingValue += i.currentPrice ?? 0;
  }
  const spendByCategory = [...catSpend.entries()]
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);

  // ── Warranties expiring (next 150 days) ──────────────────────────────────
  const warrantiesExpiring = items
    .filter((i) => i.warrantyUntil)
    .map((i) => {
      const t = new Date(i.warrantyUntil as string).getTime();
      return { title: i.title || '—', until: String(i.warrantyUntil), days: Math.ceil((t - now.getTime()) / 86400000) };
    })
    .filter((w) => !isNaN(w.days) && w.days >= 0 && w.days <= 150)
    .sort((a, b) => a.days - b.days)
    .slice(0, 10);

  // ── Installment plans (δόσεις) ───────────────────────────────────────────
  const serializedStatements: SerializedStatement[] = JSON.parse(JSON.stringify(statementsRaw));
  const allPlans = computeInstallmentPlans(serializedStatements);
  const titleById = new Map((itemsRaw as { _id: unknown; title?: string }[]).map((i) => [String(i._id), i.title || '']));
  const installmentPlans = allPlans.map((p) => ({
    key: p.key,
    label: p.itemIds.length
      ? p.itemIds.map((id) => titleById.get(id)).filter(Boolean).join(' + ') || p.label
      : p.label,
    linked: p.itemIds.length > 0,
    paidInstallments: p.paidInstallments,
    totalInstallments: p.totalInstallments,
    perAmount: p.perAmount,
    remainingAmount: p.remainingAmount,
    totalAmount: p.totalAmount,
    done: p.done,
  }));
  const installmentsActive = allPlans.filter((p) => !p.done);
  const installmentsRemaining = installmentsActive.reduce((s, p) => s + p.remainingAmount, 0);

  // ── Upcoming installment obligations (next 6 months) ─────────────────────
  const upcomingInstallments = [1, 2, 3, 4, 5, 6].map((n) => {
    const d = new Date(now.getFullYear(), now.getMonth() + n, 1);
    const amount = installmentsActive
      .filter((p) => p.remainingInstallments >= n)
      .reduce((s, p) => s + p.perAmount, 0);
    return { label: monthLabel(d), amount: Math.round(amount) };
  });

  // ── Outstanding (last statement per card) + subscriptions ────────────────
  const byCard = new Map<string, SerializedStatement>();
  for (const st of serializedStatements) {
    const k = st.last4 || st.card || st._id;
    const cur = byCard.get(k);
    if (!cur || new Date(st.period || st.statementDate) > new Date(cur.period || cur.statementDate)) byCard.set(k, st);
  }
  const outstanding = [...byCard.values()].reduce((s, st) => s + Math.max(0, (st.totalAmount || 0) - (st.paidAmount || 0)), 0);

  const subsByCat = new Map<string, number>();
  let monthlySubs = 0;
  for (const s of subs) {
    const m = (s.amount || 0) * (CYCLE_PER_MONTH[s.billingCycle || 'monthly'] ?? 1);
    monthlySubs += m;
    subsByCat.set(s.category || 'other', (subsByCat.get(s.category || 'other') ?? 0) + m);
  }
  const subsByCategory = [...subsByCat.entries()].map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));

  // ── Net worth (PA2): assets (inventory + manual accounts) − liabilities ──
  // Refreshes this month's snapshot on every load (idempotent, forward-only —
  // past months freeze as they roll over) and returns the series for the trend.
  const accountsTotal = Object.values(appSettings.assetAccounts).reduce((s, v) => s + v, 0);
  const netWorthSeries = await captureAndListSnapshots({
    assetsInventory: ownedValue,
    assetsAccounts: accountsTotal,
    accounts: appSettings.assetAccounts,
    liabInstallments: installmentsRemaining,
    liabCards: outstanding,
  });

  // Safe-to-spend forward cashflow (P19) — reuse the /calendar money agenda and
  // distil it into a single available figure + 30/60/90-day windows.
  const { months: agendaMonths } = await computeMoneyAgenda();
  const safeToSpend = computeSafeToSpend(agendaMonths);

  // ── Savings / financial goals (P12) — progress is derived, never stored ──
  const goals = (goalsRaw as unknown as { _id: unknown; title?: string; targetAmount?: number; targetDate?: string | Date | null; category?: string; contributions?: { amount?: number; date?: string | Date; note?: string; _id?: unknown }[] }[]).map((g) => {
    const progress = goalProgress({ targetAmount: g.targetAmount || 0, targetDate: g.targetDate, contributions: (g.contributions ?? []).map((c) => ({ amount: c.amount || 0 })) });
    return {
      _id: String(g._id),
      title: g.title || '—',
      targetAmount: g.targetAmount || 0,
      targetDate: g.targetDate ? String(g.targetDate) : null,
      category: g.category || '',
      contributions: (g.contributions ?? []).map((c) => ({ _id: String(c._id), amount: c.amount || 0, date: String(c.date), note: c.note || '' })),
      ...progress,
    };
  });

  return {
    netWorth: { accountsTotal: Math.round(accountsTotal), series: netWorthSeries },
    safeToSpend,
    monthlySpend,
    upcomingInstallments,
    spendByStore,
    spendByCategory,
    subsByCategory,
    warrantiesExpiring,
    biggestPurchases,
    installmentPlans,
    incomeExpense,
    expenseByCategory,
    expenseBySpace,
    budgetVsActual,
    budgetRollover: appSettings.budgetRollover,
    goals,
    summary: {
      receiptsTotal: Math.round(receiptsTotal),
      receiptsVat: Math.round(receiptsVat),
      receiptsCount: receipts.length,
      outstanding: Math.round(outstanding),
      ownedValue: Math.round(ownedValue),
      shoppingValue: Math.round(shoppingValue),
      monthlySubs: Math.round(monthlySubs),
      installmentsCount: installmentsActive.length,
      installmentsRemaining: Math.round(installmentsRemaining),
      incomeYear: Math.round(incomeYear),
      expenseYear: Math.round(expenseYear),
      incomeMonth: Math.round(incomeMonth),
      expenseMonth: Math.round(expenseMonth),
    },
  };
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ months?: string }> }) {
  const sp = await searchParams;
  const months = [6, 12, 24].includes(Number(sp.months)) ? Number(sp.months) : 12;
  const data = await getReports(months);
  return <ReportsClient data={data} months={months} />;
}
