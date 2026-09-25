import { connectDB } from '@/lib/db';
import { monthlyFactor } from '@/lib/billingCycle';
import { Item as ItemModel } from '@/models/Item';
import { Receipt as ReceiptModel } from '@/models/Receipt';
import { Statement as StatementModel } from '@/models/Statement';
import { Subscription as SubscriptionModel } from '@/models/Subscription';
import { Expense as ExpenseModel } from '@/models/Expense';
import { Goal as GoalModel } from '@/models/Goal';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { OWNED_STATUSES, SHOPPING_STATUSES } from '@/lib/itemStatus';
import { buildStatementPaymentReport, cardBalanceSummary } from '@/lib/statementPayments';
import { computeInstallmentPlans } from '@/lib/installments';
import { getAppSettings } from '@/lib/appSettings';
import { estimatedItemValue } from '@/lib/depreciation';
import { categoryRollover, ROLLOVER_WINDOW } from '@/lib/budgetRollover';
import { projectMonthEnd, paceMeaningful } from '@/lib/budgetPace';
import { sweepableLeftover, sweptForMonth } from '@/lib/budgetSweep';
import { receiptCategorySpend } from '@/lib/receiptCategorySpend';
import { receiptSpaceSpend } from '@/lib/receiptSpaceSpend';
import { subscriptionSpaceCost } from '@/lib/subscriptionSpaceCost';
import { captureAndListSnapshots } from '@/lib/netWorth';
import { computeMoneyAgenda } from '@/lib/moneyAgenda';
import { computeSafeToSpend } from '@/lib/safeToSpend';
import { goalProgress } from '@/lib/goals';
import { buildMonthReview } from '@/lib/monthReview';
import { buildYearOverYear } from '@/lib/yearOverYear';
import { listEntriesNeedingRate } from '@/lib/fxAudit';
import { reportWindowStart, inReportWindow, monthKeyOfDate } from '@/lib/reportWindow';
import type { SerializedStatement } from '@/types';
import { ReportsClient } from './ReportsClient';
import { formatDate } from '@/lib/i18n/format';
import { getLocaleSafe } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';



type LeanReceipt = {
  store?: string;
  date?: string | Date | null;
  total?: number;
  vatAmount?: number;
  // P68: per-property ledger tag for the whole receipt, fed into the same
  // per-space breakdown as Expense.space.
  space?: string;
  // P64: per-line spend category, fed into the same breakdown as Expense.category.
  lineItems?: { qty?: number; price?: number; vatRate?: number; category?: string }[];
};
type LeanItem = {
  title?: string;
  category?: string;
  status?: string;
  purchasedPrice?: number | null;
  currentPrice?: number;
  purchasedAt?: string | Date | null;
  warrantyUntil?: string | Date | null;
};
type LeanSub = { amount?: number; billingCycle?: string; category?: string; space?: string };

// The month AXIS: the run of months the page draws, built from the server's own clock and so
// read in local time. Deliberately NOT the frame a stored date is keyed in — that one is
// `monthKeyOfDate`, which reads UTC because that is how the dates were written (#242). Keeping
// the two under one name is what let a record drift out of its own month on servers west of
// UTC, so they are named apart on purpose.
function axisMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(d: Date, locale = 'en'): string {
  return formatDate(d, locale, { month: 'short', year: '2-digit' });
}
/** 'YYYY-MM' → 'Jul 26' (in the active language, #5). An unparseable key is shown as-is. */
function labelFromKey(key: string, locale = 'en'): string {
  const [y, m] = key.split('-').map(Number);
  return y && m ? monthLabel(new Date(y, m - 1, 1), locale) : key;
}

async function getReports(monthsBack = 12, locale = 'en') {
  return withRequestTenant(async () => {
  await connectDB();
  const Receipt = await currentModel(ReceiptModel);
  const Item = await currentModel(ItemModel);
  const Subscription = await currentModel(SubscriptionModel);
  const Statement = await currentModel(StatementModel);
  const Expense = await currentModel(ExpenseModel);
  const Goal = await currentModel(GoalModel);

  const [receiptsRaw, itemsRaw, subsRaw, statementsRaw, expensesRaw, goalsRaw] = await Promise.all([
    Receipt.find().select('store date total vatAmount space lineItems.qty lineItems.price lineItems.vatRate lineItems.category').lean(),
    Item.find().select('title category status purchasedPrice currentPrice purchasedAt warrantyUntil').lean(),
    Subscription.find({ active: true }).select('amount billingCycle category space').lean(),
    Statement.find().lean(),
    Expense.find().select('kind amount date period category space vendor vendorKey series seriesKey recurring').lean(),
    Goal.find({ archived: { $ne: true } }).sort({ createdAt: -1 }).lean(),
  ]);

  const receipts = JSON.parse(JSON.stringify(receiptsRaw)) as LeanReceipt[];
  const items = JSON.parse(JSON.stringify(itemsRaw)) as LeanItem[];
  const subs = JSON.parse(JSON.stringify(subsRaw)) as LeanSub[];

  const now = new Date();
  // Everything labelled with the selected period is computed from these (#122). Month-by-month
  // history (year-over-year, rollover, calendar-year totals) still reads the full record set.
  const windowStart = reportWindowStart(now, monthsBack);
  const windowReceipts = receipts.filter((r) => inReportWindow(monthKeyOfDate(r.date), windowStart));

  // ── Monthly spend (last 12 months, from receipts) ────────────────────────
  const months: { key: string; label: string; total: number; count: number }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: axisMonthKey(d), label: monthLabel(d, locale), total: 0, count: 0 });
  }
  const mIdx = new Map(months.map((m, i) => [m.key, i]));
  let receiptsTotal = 0;
  let receiptsVat = 0;
  for (const r of windowReceipts) {
    receiptsTotal += r.total || 0;
    receiptsVat += r.vatAmount || 0;
    if (!r.date) continue;
    const idx = mIdx.get(monthKeyOfDate(r.date));
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
    vendor?: string;
    vendorKey?: string;
    series?: string;
    seriesKey?: string;
    recurring?: boolean;
  }[];
  const ie = months.map((m) => ({ key: m.key, label: m.label, income: 0, expense: 0 }));
  const ieIdx = new Map(ie.map((m, i) => [m.key, i]));
  const thisMonthKey = axisMonthKey(now);
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
    // Bucket by period (YYYY-MM) if present, else by date.
    let mk = e.period && /^\d{4}-\d{2}$/.test(e.period) ? e.period : '';
    if (!mk && e.date) mk = monthKeyOfDate(e.date);
    if (!mk) continue;
    if (!isIncome && inReportWindow(mk, windowStart)) {
      expCatMap.set(cat, (expCatMap.get(cat) ?? 0) + amt);
      const sp = (e.space || '').trim();
      expSpaceMap.set(sp, (expSpaceMap.get(sp) ?? 0) + amt);
    }
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
  // ── P64 φάση 2: οι categorized γραμμές αποδείξεων στο ΙΔΙΟ breakdown ─────
  // Μόνο γραμμές με tag μετράνε — κάθε γραμμή προ-P64 έχει `category: ''`, άρα όσο
  // κανείς δεν έχει βάλει tag τα νούμερα εδώ μένουν ακριβώς όπως ήταν. Μπαίνουν ΜΟΝΟ
  // στα category-scoped αθροίσματα (chart ανά κατηγορία, budget actuals, rollover
  // παράθυρο) και ΟΧΙ στο cash-flow / στα μηνιαία-ετήσια σύνολα: οι αποδείξεις έχουν
  // ήδη το δικό τους "Monthly spend" chart παραπάνω και θα μετριόντουσαν δύο φορές.
  const rcSpend = receiptCategorySpend(receipts);
  for (const [mk, byCat] of rcSpend.byMonth) {
    if (!inReportWindow(mk, windowStart)) continue;
    for (const [cat, amt] of byCat) expCatMap.set(cat, (expCatMap.get(cat) ?? 0) + amt);
  }
  for (const [mk, byCat] of rcSpend.byMonth) {
    let target = catByMonth.get(mk);
    if (!target) catByMonth.set(mk, (target = new Map<string, number>()));
    for (const [cat, amt] of byCat) {
      target.set(cat, (target.get(cat) ?? 0) + amt);
      if (mk === thisMonthKey) thisMonthCat.set(cat, (thisMonthCat.get(cat) ?? 0) + amt);
    }
  }
  for (const [mk, amt] of rcSpend.totalByMonth) totalByMonth.set(mk, (totalByMonth.get(mk) ?? 0) + amt);
  // ── P68 φάση 1: οι tagged αποδείξεις στο ΙΔΙΟ per-space breakdown ────────
  // Ίδιος κανόνας με το P64 ακριβώς από πάνω: μόνο ό,τι έχει tag μετράει (μια απόδειξη
  // χωρίς `space` δεν αλλάζει τίποτα), και μπαίνει ΜΟΝΟ στο space-scoped άθροισμα, όχι
  // στο cash flow ή στα μηνιαία σύνολα, γιατί εκεί οι αποδείξεις μετριούνται ήδη.
  for (const [sp, amt] of receiptSpaceSpend(windowReceipts)) expSpaceMap.set(sp, (expSpaceMap.get(sp) ?? 0) + amt);
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
      const mk = axisMonthKey(d);
      if ((totalByMonth.get(mk) ?? 0) > 0) rolloverMonthKeys.push(mk);
    }
  }
  // P83 — every contribution already logged against an open goal, so the sweep button
  // below can tell which categories of THIS month have already been moved to a goal.
  // Flattened once here rather than per category (the list is tiny either way).
  const allContributions = (goalsRaw as unknown as { contributions?: { amount?: number; note?: string }[] }[])
    .flatMap((g) => g.contributions ?? []);
  // P100 — month-end pace projection per category (linear from spend-so-far). Meaningful only
  // mid-month once something is spent; undefined otherwise so the client hides the line.
  const paceNow = new Date();
  const paceDay = paceNow.getDate();
  const paceDaysInMonth = new Date(paceNow.getFullYear(), paceNow.getMonth() + 1, 0).getDate();
  const projectedFor = (actual: number): number | undefined =>
    paceMeaningful(actual, paceDay, paceDaysInMonth) ? projectMonthEnd(actual, paceDay, paceDaysInMonth) : undefined;

  const budgetVsActual = Object.entries(appSettings.budgets)
    .map(([name, budget]) => {
      const base = Math.round(budget);
      const actual = Math.round(thisMonthCat.get(name) ?? 0);
      const projected = projectedFor(actual);
      if (!appSettings.budgetRollover) return { name, budget: base, actual, projected };
      const priorSpends = rolloverMonthKeys.map((mk) => catByMonth.get(mk)?.get(name) ?? 0);
      const { carried, effective } = categoryRollover(base, priorSpends);
      // Whole euro still unspent in the envelope, offered to a savings goal. Zero once
      // the category is on/over its limit, or once this month was already swept.
      const leftover = sweepableLeftover(effective, actual, sweptForMonth(allContributions, name, thisMonthKey));
      return { name, budget: base, actual, projected, carried, effective, leftover };
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

  // ── Year over year, same month (P69) ─────────────────────────────────────
  // `totalByMonth` above is built from EVERY expense row, not just the rolling
  // window, so the same month one year back is already in hand — no extra query.
  // The current month is excluded inside the helper (it is partial), and the card
  // is dropped entirely unless at least one month has a prior-year figure, so a
  // fresh install never sees a chart drawn against zeros.
  const yoyRaw = buildYearOverYear(totalByMonth, { now, months: monthsBack });
  const yearOverYear =
    yoyRaw.comparable > 0
      ? {
          comparable: yoyRaw.comparable,
          rows: yoyRaw.rows.map((r) => ({ ...r, label: labelFromKey(r.key, locale), prevLabel: labelFromKey(r.prevKey, locale) })),
          headline: yoyRaw.headline
            ? {
                ...yoyRaw.headline,
                label: labelFromKey(yoyRaw.headline.key, locale),
                prevLabel: labelFromKey(yoyRaw.headline.prevKey, locale),
              }
            : null,
        }
      : null;

  // ── Spend by store (top 8) ───────────────────────────────────────────────
  const storeMap = new Map<string, { total: number; count: number }>();
  for (const r of windowReceipts) {
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
  const biggestPurchases = windowReceipts
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

  const statementPayments = buildStatementPaymentReport(serializedStatements, titleById, now, monthsBack);
  const outstanding = cardBalanceSummary(serializedStatements).due;

  const subsByCat = new Map<string, number>();
  let monthlySubs = 0;
  for (const s of subs) {
    const m = (s.amount || 0) * monthlyFactor(s.billingCycle || 'monthly');
    monthlySubs += m;
    subsByCat.set(s.category || 'other', (subsByCat.get(s.category || 'other') ?? 0) + m);
  }
  const subsByCategory = [...subsByCat.entries()].map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));

  // ── P68 φάση 2: μηνιαίο κόστος συνδρομών ανά χώρο ────────────────────────
  // ΞΕΧΩΡΙΣΤΟ card, όχι μέσα στο «δαπάνες ανά χώρο» από πάνω: εκεί αθροίζονται
  // πραγματικές δαπάνες (Expense.amount, Receipt.total), ενώ η συνδρομή δίνει ρυθμό.
  // Ένα μηνιαίο ισοδύναμο ριγμένο σε ένα all-time σύνολο δεν θα ήταν ημιτελές νούμερο,
  // θα ήταν λάθος. Άδειο όσο καμία συνδρομή δεν έχει tag → το card δεν εμφανίζεται.
  const subsBySpace = [...subscriptionSpaceCost(subs).entries()]
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);

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
  const { months: agendaMonths } = await computeMoneyAgenda(now, locale);
  const safeToSpend = computeSafeToSpend(agendaMonths, now, locale);

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

  // ── Month in Review (P3) — deterministic narrative digest, reuses the already-
  // fetched expense rows + item warranties + budgets (zero new DB round-trips).
  const monthReview = {
    ...buildMonthReview(expensesData, { monthKey: thisMonthKey, budgets: appSettings.budgets, warranties: items, now }),
    monthLabel: monthLabel(now, locale),
  };

  // ── Missing exchange rates (P9 slice 7) — records whose stored amount is still a
  // foreign number, so they are quietly distorting every total on this page. Only
  // queried when the deployment actually allows foreign entries; a single-currency
  // install skips five queries and never sees the card.
  const fxIssues = appSettings.multiCurrency ? await listEntriesNeedingRate(appSettings.currency) : [];

  return {
    fxIssues,
    baseCurrency: appSettings.currency,
    netWorth: { accountsTotal: Math.round(accountsTotal), series: netWorthSeries },
    safeToSpend,
    monthReview,
    monthlySpend,
    statementPayments,
    spendByStore,
    spendByCategory,
    subsByCategory,
    subsBySpace,
    warrantiesExpiring,
    biggestPurchases,
    installmentPlans,
    incomeExpense,
    yearOverYear,
    expenseByCategory,
    expenseBySpace,
    budgetVsActual,
    budgetRollover: appSettings.budgetRollover,
    budgetMonthKey: thisMonthKey, // P83 — the month a sweep is booked against
    goals,
    summary: {
      receiptsTotal: Math.round(receiptsTotal),
      receiptsVat: Math.round(receiptsVat),
      receiptsCount: windowReceipts.length,
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
  });
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ months?: string }> }) {
  const sp = await searchParams;
  const months = [6, 12, 24].includes(Number(sp.months)) ? Number(sp.months) : 12;
  const data = await getReports(months, await getLocaleSafe());
  return <ReportsClient data={data} months={months} />;
}
