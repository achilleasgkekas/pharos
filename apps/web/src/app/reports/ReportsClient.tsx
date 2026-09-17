'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cur } from "@/lib/money";
import { useLocale, useT, useMoney } from '@/components/LocaleProvider';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  Legend,
  CartesianGrid,
} from 'recharts';
import { Store, Package, CalendarClock, Receipt as ReceiptIcon, Layers, ShieldCheck, TrendingUp, CreditCard, Wallet, Target, Plus, Trash2, X, Sparkles, AlertTriangle, Check, ArrowRight } from 'lucide-react';
import { convertToBase } from '@/lib/fx';
import { applyFxRate, applyFxRateToCurrency } from './fxActions';
import { FxRateButton } from '@/components/FxRateButton';
import { createGoal, addGoalContribution, deleteGoal, sweepBudgetLeftoverToGoal } from './goalsActions';
import { formatDate, formatTime, formatDateTime } from '@/lib/i18n/format';

const PALETTE = ['#00ff88', '#00d4ff', '#ffd93d', '#a55eea', '#ff4757', '#00b894', '#fdcb6e', '#6c5ce7'];

type InstallmentPlanRow = {
  key: string;
  label: string;
  linked: boolean;
  paidInstallments: number;
  totalInstallments: number;
  perAmount: number;
  remainingAmount: number;
  totalAmount: number;
  done: boolean;
};

// Mirrors lib/fxAudit.ts (that module imports Mongoose models, so it cannot be imported
// from a client component). Keep the `kind` union in step with FxIssueKind there.
type FxIssueRow = {
  kind: 'expense' | 'income' | 'receipt' | 'item' | 'subscription' | 'statement' | 'bill';
  id: string;
  title: string;
  subtitle: string;
  currency: string;
  origAmount: number;
  href: string;
};

// Mirrors lib/yearOverYear.ts, plus the display labels the server attaches (that
// module is pure and label-free so it stays trivially testable).
type YoyRow = {
  key: string;
  prevKey: string;
  label: string;
  prevLabel: string;
  current: number;
  previous: number;
  delta: number;
  pct: number | null;
};

type NetWorthPoint = {
  period: string;
  assetsInventory: number;
  assetsAccounts: number;
  liabInstallments: number;
  liabCards: number;
  net: number;
};

type SafeToSpend = {
  monthLabel: string;
  thisMonth: { income: number; outflow: number; net: number };
  windows: { days: number; income: number; outflow: number; net: number }[];
};

type MonthReview = {
  monthKey: string;
  monthLabel: string;
  totalSpent: number;
  totalIncome: number;
  net: number;
  prevMonthSpent: number;
  pctChange: number | null;
  topCategory: { name: string; amount: number } | null;
  overBudget: { category: string; budget: number; actual: number; pct: number }[];
  priceChanges: { vendorKey: string; vendor: string; deltaPct: number; direction: 'up' | 'down' }[];
  warrantiesExpiringSoon: { title: string; days: number }[];
  narrative: string;
};

type GoalRow = {
  _id: string;
  title: string;
  targetAmount: number;
  targetDate: string | null;
  category: string;
  contributions: { _id: string; amount: number; date: string; note: string }[];
  current: number;
  target: number;
  remaining: number;
  pct: number;
  done: boolean;
  monthsLeft: number | null;
  perMonth: number | null;
};

type Data = {
  netWorth: { accountsTotal: number; series: NetWorthPoint[] };
  safeToSpend: SafeToSpend;
  monthReview: MonthReview;
  monthlySpend: { key: string; label: string; total: number; count: number }[];
  upcomingInstallments: { label: string; amount: number }[];
  spendByStore: { name: string; total: number; count: number }[];
  spendByCategory: { name: string; value: number }[];
  subsByCategory: { name: string; value: number }[];
  /** P68 φάση 2: μηνιαίο ισοδύναμο κόστος συνδρομών ανά χώρο· κενό όσο καμία δεν έχει tag. */
  subsBySpace: { name: string; value: number }[];
  warrantiesExpiring: { title: string; until: string; days: number }[];
  biggestPurchases: { store: string; total: number; date: string }[];
  installmentPlans: InstallmentPlanRow[];
  incomeExpense: { key: string; label: string; income: number; expense: number }[];
  /** P69 same-month year-over-year. Null when under a year of history exists,
   *  in which case the card is not rendered at all. */
  yearOverYear: {
    comparable: number;
    rows: YoyRow[];
    headline: YoyRow | null;
  } | null;
  expenseByCategory: { name: string; value: number }[];
  expenseBySpace: { name: string; value: number }[];
  budgetVsActual: { name: string; budget: number; actual: number; projected?: number; carried?: number; effective?: number; leftover?: number }[];
  budgetRollover?: boolean;
  /** P83 — "YYYY-MM" a sweep of this month's leftover is booked against. */
  budgetMonthKey?: string;
  goals: GoalRow[];
  /** P9 slice 7: records still holding a foreign amount with no rate (empty when single-currency). */
  fxIssues?: FxIssueRow[];
  baseCurrency?: string;
  summary: {
    receiptsTotal: number;
    receiptsVat: number;
    receiptsCount: number;
    outstanding: number;
    ownedValue: number;
    shoppingValue: number;
    monthlySubs: number;
    installmentsCount: number;
    installmentsRemaining: number;
    incomeYear: number;
    expenseYear: number;
    incomeMonth: number;
    expenseMonth: number;
  };
};

// Literal keys (not a template string) so the translate function stays type-checked.
const FX_KIND_KEY = {
  expense: 'reports.fxKind.expense',
  income: 'reports.fxKind.income',
  receipt: 'reports.fxKind.receipt',
  item: 'reports.fxKind.item',
  subscription: 'reports.fxKind.subscription',
  statement: 'reports.fxKind.statement',
  bill: 'reports.fxKind.bill',
} as const;

/**
 * Group the audit rows by printed currency, biggest exposure first. A rate is a property of
 * a CURRENCY, not of a record, so this is the unit the user actually fills in: one number
 * clears every USD row at once, which is the whole point when a bank import made thirty of
 * them. Rows keep the order the server sorted them in (largest amount first).
 */
function groupFxByCurrency(rows: FxIssueRow[]): Array<{ currency: string; rows: FxIssueRow[]; total: number }> {
  const by = new Map<string, FxIssueRow[]>();
  for (const r of rows) {
    const list = by.get(r.currency);
    if (list) list.push(r);
    else by.set(r.currency, [r]);
  }
  return [...by.entries()]
    .map(([currency, list]) => ({ currency, rows: list, total: list.reduce((a, r) => a + r.origAmount, 0) }))
    .sort((a, b) => b.total - a.total);
}

const tooltipStyle = {
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  fontSize: 12,
  color: 'var(--color-text)',
};

function fmtDate(s: string, locale: string): string {
  return formatDate(s, locale, { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/**
 * One printed currency's worth of rate-less records, with the rate entry that fixes them.
 * The group rate doubles as the default for every row, so the normal path is "type 0.92
 * once, press Apply to all"; a row that needs its own rate (a purchase from a different
 * month) can override it without leaving the panel.
 */
function FxCurrencyGroup({ currency, rows, base }: { currency: string; rows: FxIssueRow[]; base: string }) {
  const t = useT();
  const money = useMoney();
  const [rate, setRate] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const total = rows.reduce((a, r) => a + r.origAmount, 0);
  const groupRate = Number(rate);
  const groupRateOk = Number.isFinite(groupRate) && groupRate > 0;

  function applyAll() {
    if (!groupRateOk) return;
    setError(null);
    startTransition(async () => {
      const res = await applyFxRateToCurrency(currency, groupRate);
      if (!res.ok) setError(res.error);
      else setRate('');
    });
  }

  return (
    <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-[11px] text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>
          <span className="text-[color:var(--color-gold)] font-semibold">{currency}</span>
          {' · '}
          {rows.length}
          {' · '}
          {money(total, currency)}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('reports.fxRateHint', { code: currency, base })}
          </span>
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder={t('reports.fxRate')}
            aria-label={t('reports.fxRateHint', { code: currency, base })}
            className="w-24 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-lg px-2 py-1 text-xs text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-gold)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
          {/* P9 phase 2: fill the group's rate from the ECB feed. Latest fixing, not a
              per-record date — one rate is being applied to a whole currency here. */}
          <FxRateButton currency={currency} onRate={(r) => setRate(String(r))} compact />
          <button
            onClick={applyAll}
            disabled={pending || !groupRateOk}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-[color:var(--color-gold)] text-black font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {t('reports.fxApplyAll', { n: rows.length })}
          </button>
        </div>
      </div>
      {error && <p className="text-[11px] text-[color:var(--color-red)] mb-2">{error}</p>}
      <div className="flex flex-col gap-1.5">
        {rows.map((f) => (
          <FxIssueLine key={`${f.kind}-${f.id}`} row={f} base={base} fallbackRate={groupRateOk ? groupRate : 0} />
        ))}
      </div>
    </div>
  );
}

/** A single rate-less record: what it is, what it printed, and the rate that converts it. */
function FxIssueLine({ row, base, fallbackRate }: { row: FxIssueRow; base: string; fallbackRate: number }) {
  const t = useT();
  const money = useMoney();
  const [rate, setRate] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const typed = Number(rate);
  // An empty row input means "use the group's rate", so the common case needs one number.
  const effective = Number.isFinite(typed) && typed > 0 ? typed : fallbackRate;
  const ok = effective > 0;

  function apply() {
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const res = await applyFxRate(row.kind, row.id, effective);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2">
      <a href={row.href} title={t('reports.fxOpenRecord')} className="min-w-0 flex-1 group">
        <span className="block text-sm text-[color:var(--color-text)] truncate group-hover:text-[color:var(--color-gold)] transition-colors">{row.title}</span>
        <span className="block text-[10px] text-[color:var(--color-text-faint)] truncate" style={{ fontFamily: 'var(--font-mono)' }}>
          {t(FX_KIND_KEY[row.kind])}{row.subtitle ? ` · ${row.subtitle}` : ''}
        </span>
      </a>
      <span className="text-sm font-semibold text-[color:var(--color-gold)] whitespace-nowrap" style={{ fontFamily: 'var(--font-mono)' }}>
        {money(row.origAmount, row.currency)}
      </span>
      <div className="flex items-center gap-1.5">
        {/* Live preview of what will actually be stored, so a mistyped rate is visible
            before it is written rather than after. */}
        {ok && (
          <span className="text-[11px] text-[color:var(--color-text-dim)] whitespace-nowrap" style={{ fontFamily: 'var(--font-mono)' }}>
            → {money(convertToBase(row.origAmount, effective), base)}
          </span>
        )}
        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder={fallbackRate > 0 ? String(fallbackRate) : t('reports.fxRate')}
          aria-label={t('reports.fxRateHint', { code: row.currency, base })}
          className="w-20 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-2 py-1 text-xs text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-gold)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        />
        <button
          onClick={apply}
          disabled={pending || !ok}
          className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title={t('reports.fxApplyOne')}
          aria-label={t('reports.fxApplyOne')}
        >
          <Check size={15} />
        </button>
      </div>
      {error && <p className="w-full text-[11px] text-[color:var(--color-red)]">{error}</p>}
    </div>
  );
}

export function ReportsClient({ data, months = 12 }: { data: Data; months?: number }) {
  const locale = useLocale();
  const t = useT();
  const money = useMoney();
  const s = data.summary;
  const spend12 = data.monthlySpend.reduce((a, m) => a + m.total, 0);
  const netWorthNow = s.ownedValue + data.netWorth.accountsTotal - s.installmentsRemaining - s.outstanding;
  const avgMonth = Math.round(spend12 / Math.max(1, data.monthlySpend.filter((m) => m.total > 0).length || 1));
  // Every windowed figure below is labelled with the window it was actually built from.
  // The 6/12/24 selector has always widened the data, but the captions said "last 12
  // months" whatever you picked, so switching to 6mo or 24mo looked like it did nothing.
  const fxIssues = data.fxIssues ?? [];
  const fxBase = data.baseCurrency || 'EUR';
  // P83 — goals still open (an already-reached goal is a pointless sweep target).
  const openGoals = data.goals.filter((g) => !g.done);
  // #122: the period links used to be plain <a href>, so every switch was a full browser reload
  // (blank page, scroll back to top) that looked like the filter "just reloads". A client
  // navigation keeps the current report on screen, dimmed, until the new window's data arrives.
  const router = useRouter();
  const [periodPending, startPeriod] = useTransition();
  const [pendingMonths, setPendingMonths] = useState<number | null>(null);
  const shownMonths = periodPending && pendingMonths ? pendingMonths : months;
  const inWindow = (title: string) => `${title} · ${months}mo`;

  return (
    <main
      className={`max-w-[1400px] mx-auto px-4 py-6 pb-24 transition-opacity ${periodPending ? 'opacity-60' : ''}`}
      aria-busy={periodPending}
    >
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
          {t('nav.reports')}
        </h1>
        <div className="flex bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg p-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
          {[6, 12, 24].map((m) => (
            <a
              key={m}
              href={`/reports?months=${m}`}
              aria-current={months === m ? 'page' : undefined}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // new tab still works
                e.preventDefault();
                if (m === months) return;
                setPendingMonths(m);
                startPeriod(() => router.push(`/reports?months=${m}`, { scroll: false }));
              }}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors ${shownMonths === m ? 'bg-[color:var(--color-accent)] text-black' : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'}`}
            >
              {m}mo
            </a>
          ))}
        </div>
      </div>

      {/* Missing exchange rates (P9 slice 7) — foreign records saved without a rate keep
          their PRINTED amount, so they are silently mixed into every figure below. Shown
          above the numbers they distort, and only when there is something to fix.
          Slice 9: the rate can be filled in HERE, per record or per currency, because the
          records are spread over six modules and chasing them one form at a time is the
          reason they stay unfixed. */}
      {fxIssues.length > 0 && (
        <div className="mb-6 rounded-2xl border border-[color:var(--color-gold)]/40 bg-[color:var(--color-gold)]/5 p-5">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-gold)] mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
            <AlertTriangle size={12} /> {t('reports.fxMissing', { n: fxIssues.length })}
          </p>
          <p className="text-[11px] text-[color:var(--color-text-dim)] mb-3" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('reports.fxMissingNote', { base: fxBase })}
          </p>
          <div className="flex flex-col gap-4">
            {groupFxByCurrency(fxIssues).map((g) => (
              <FxCurrencyGroup key={g.currency} currency={g.currency} rows={g.rows} base={fxBase} />
            ))}
          </div>
        </div>
      )}


      {/* Net worth (PA2) — assets (inventory + manual accounts) minus liabilities
          (remaining installments + card balances), with the monthly snapshot trend */}
      <div className="mb-6 rounded-2xl border border-[color:var(--color-border)] bg-gradient-to-br from-[color:var(--color-surface)] to-[color:var(--color-surface-2)] p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-text-faint)] mb-1" style={{ fontFamily: 'var(--font-mono)' }}>{t('reports.netWorth')}</p>
            <p className="text-3xl md:text-4xl font-bold" style={{ fontFamily: 'var(--font-display)', color: netWorthNow >= 0 ? 'var(--color-accent)' : 'var(--color-red)' }}>
              {money(netWorthNow)}
            </p>
          </div>
          <div className="flex flex-wrap gap-5 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
            <div><span className="text-[color:var(--color-text-faint)] block mb-0.5">{t('reports.inventoryValue')}</span><span className="text-[color:var(--color-text)] text-sm">{money(s.ownedValue)}</span></div>
            <div><span className="text-[color:var(--color-text-faint)] block mb-0.5">{t('reports.accounts')}</span><span className="text-[color:var(--color-cyan)] text-sm">{money(data.netWorth.accountsTotal)}</span></div>
            <div><span className="text-[color:var(--color-text-faint)] block mb-0.5">{t('reports.owed')}</span><span className="text-[color:var(--color-red)] text-sm">-{money(s.installmentsRemaining)}</span></div>
            <div><span className="text-[color:var(--color-text-faint)] block mb-0.5">{t('reports.cardBalance')}</span><span className="text-[color:var(--color-gold)] text-sm">-{money(s.outstanding)}</span></div>
          </div>
        </div>
        {data.netWorth.series.length >= 2 ? (
          <div className="h-32 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.netWorth.series} margin={{ left: 0, right: 10, top: 6 }}>
                <defs>
                  <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00ff88" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#00ff88" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" tick={{ fill: 'var(--color-text-faint)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--color-text-faint)', fontSize: 10 }} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => money(v, undefined, { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 })} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [money(Number(v)), t('reports.netWorth')]} />
                <Area type="monotone" dataKey="net" stroke="#00ff88" strokeWidth={2} fill="url(#netWorthFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{t('reports.netWorthTrendNote')}</p>
        )}
      </div>

      {/* Safe-to-spend (P19) — known expected income minus fixed future charges, as a
          single available figure for the rest of this month + 30/60/90-day windows. */}
      <div className="mb-6 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-text-faint)] mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
              <Wallet size={12} /> {t('reports.safeToSpend')} · {data.safeToSpend.monthLabel}
            </p>
            <p className="text-3xl md:text-4xl font-bold" style={{ fontFamily: 'var(--font-display)', color: data.safeToSpend.thisMonth.net >= 0 ? 'var(--color-accent)' : 'var(--color-red)' }}>
              {data.safeToSpend.thisMonth.net >= 0 ? '' : '-'}{money(Math.abs(data.safeToSpend.thisMonth.net))}
            </p>
            <p className="text-[11px] text-[color:var(--color-text-dim)] mt-1" style={{ fontFamily: 'var(--font-mono)' }}>
              <span className="text-[color:var(--color-accent)]">+{money(data.safeToSpend.thisMonth.income)}</span> {t('reports.stsIncome')} · <span className="text-[color:var(--color-red)]">-{money(data.safeToSpend.thisMonth.outflow)}</span> {t('reports.stsFixed')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.safeToSpend.windows.map((w) => (
              <div key={w.days} className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 min-w-[92px]" style={{ fontFamily: 'var(--font-mono)' }}>
                <span className="block text-[10px] text-[color:var(--color-text-faint)] mb-0.5">{t('reports.stsWindow', { d: w.days })}</span>
                <span className="block text-sm font-semibold" style={{ color: w.net >= 0 ? 'var(--color-accent)' : 'var(--color-red)' }}>
                  {w.net >= 0 ? '' : '-'}{money(Math.abs(w.net))}
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{t('reports.stsNote')}</p>
      </div>

      {/* Month in Review (P3) — deterministic narrative digest (budget/price-hike/
          warranty signals already computed elsewhere, zero AI, zero new queries). */}
      <div className="mb-6 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-text-faint)] mb-2" style={{ fontFamily: 'var(--font-mono)' }}>
          <Sparkles size={12} /> {t('reports.monthReview')} · {data.monthReview.monthLabel}
        </p>
        <p className="text-sm md:text-base leading-relaxed text-[color:var(--color-text)]">{data.monthReview.narrative}</p>
        {(data.monthReview.overBudget.length > 0 || data.monthReview.priceChanges.length > 0 || data.monthReview.warrantiesExpiringSoon.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]" style={{ fontFamily: 'var(--font-mono)' }}>
            {data.monthReview.overBudget.map((b) => (
              <span key={`b-${b.category}`} className="px-2 py-1 rounded-md border border-[color:var(--color-red)]/40 text-[color:var(--color-red)]">
                {b.category} {money(b.actual)}/{money(b.budget)}
              </span>
            ))}
            {data.monthReview.priceChanges.slice(0, 5).map((p) => (
              <span key={`p-${p.vendorKey}`} className="px-2 py-1 rounded-md border border-[color:var(--color-gold)]/40 text-[color:var(--color-gold)]">
                {p.vendor} {p.direction === 'up' ? '+' : ''}{p.deltaPct}%
              </span>
            ))}
            {data.monthReview.warrantiesExpiringSoon.slice(0, 5).map((w) => (
              <span key={`w-${w.title}`} className="px-2 py-1 rounded-md border border-[color:var(--color-cyan)]/40 text-[color:var(--color-cyan)]">
                {w.title} · {w.days}d
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat icon={<ReceiptIcon size={14} />} label={inWindow(t('reports.receiptsTotal'))} value={money(s.receiptsTotal)} sub={t('reports.receiptsSub', { n: s.receiptsCount, vat: money(s.receiptsVat) })} />
        <Stat icon={<TrendingUp size={14} />} label={t('reports.spendAvg')} value={money(avgMonth)} sub={t('reports.spendAvgSub', { x: money(spend12), n: months })} />
        <Stat icon={<CreditCard size={14} />} label={t('reports.cardsBalance')} value={money(s.outstanding)} sub={t('reports.cardsBalanceSub', { n: s.installmentsCount, x: money(s.installmentsRemaining) })} accent="var(--color-gold)" />
        <Stat icon={<CalendarClock size={14} />} label={t('nav.subscriptions')} value={`${money(s.monthlySubs)}/mo`} sub={`${money(s.monthlySubs * 12)}/yr`} />
      </div>

      {/* Monthly spend — full width hero chart */}
      <Card title={t('reports.cMonthlySpend', { n: months })} className="mb-4">
        {spend12 === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.monthlySpend} margin={{ left: 0, right: 10, top: 6 }}>
              <defs>
                <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00ff88" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#00ff88" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => money(v, undefined, { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 })} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number, _n, p) => [`${money(v)} · ${(p?.payload?.count ?? 0)} receipts`, t('reports.spent')]}
                cursor={{ stroke: 'var(--color-accent)', strokeWidth: 1, strokeOpacity: 0.3 }}
              />
              <Area type="monotone" dataKey="total" stroke="#00ff88" strokeWidth={2} fill="url(#spendGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Income vs Expense (cash flow) */}
      <Card title={t('reports.cCashFlow', { n: months })}>
        {data.incomeExpense.every((m) => m.income === 0 && m.expense === 0) ? (
          <Empty text={t('reports.noCashFlow')} />
        ) : (
          <>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
              <span className="text-[color:var(--color-text-dim)]">
                {t('reports.thisMonth')} <span className="text-[color:var(--color-accent)]">+{money(s.incomeMonth)}</span> {t('reports.in')} · <span className="text-[color:var(--color-red)]">-{money(s.expenseMonth)}</span> {t('reports.out')} · {t('reports.net')}{' '}
                <span className={s.incomeMonth - s.expenseMonth >= 0 ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]'}>
                  {money((s.incomeMonth - s.expenseMonth))}
                </span>
              </span>
              <span className="text-[color:var(--color-text-dim)]">
                {t('reports.thisYear')} {t('reports.net')}{' '}
                <span className={s.incomeYear - s.expenseYear >= 0 ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]'}>
                  {money((s.incomeYear - s.expenseYear))}
                </span>
              </span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.incomeExpense} margin={{ left: 0, right: 10, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => money(v, undefined, { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 })} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n) => [money(v), n]} cursor={{ fill: 'rgba(127,127,127,0.08)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="income" name={t('nav.income')} radius={[5, 5, 0, 0]} fill="#00ff88" />
                <Bar dataKey="expense" name={t('reports.expense')} radius={[5, 5, 0, 0]} fill="#ff4757" />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </Card>

      {/* Year over year · same month (P69). Answers "is this normal for the season
          or a real increase?", which the rolling monthly chart above cannot. Only
          rendered once at least one month has a prior-year figure, and the current
          (partial) month is deliberately absent from the series. */}
      {data.yearOverYear && (
        <Card title={t('reports.cYoy')}>
          {data.yearOverYear.headline && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-3 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
              <span className="text-[color:var(--color-text)]">{data.yearOverYear.headline.label}</span>
              <span className="text-[color:var(--color-text-dim)]">
                {money(data.yearOverYear.headline.current)}
                {' '}{t('reports.yoyVs')}{' '}
                {money(data.yearOverYear.headline.previous)} ({data.yearOverYear.headline.prevLabel})
              </span>
              {data.yearOverYear.headline.pct != null && (
                <span
                  className={`px-1.5 py-px rounded text-[11px] ${
                    data.yearOverYear.headline.pct > 0
                      ? 'text-[color:var(--color-red)] bg-[color:var(--color-red)]/10'
                      : 'text-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10'
                  }`}
                >
                  {data.yearOverYear.headline.pct > 0 ? '+' : ''}{data.yearOverYear.headline.pct}%
                </span>
              )}
            </div>
          )}
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.yearOverYear.rows} margin={{ left: 0, right: 10, top: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => money(v, undefined, { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 })} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n) => [money(v), n]} cursor={{ fill: 'rgba(127,127,127,0.08)' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="previous" name={t('reports.yoyLastYear')} radius={[5, 5, 0, 0]} fill="#4a4a4a" />
              <Bar dataKey="current" name={t('reports.yoyThisYear')} radius={[5, 5, 0, 0]} fill="#00d4ff" />
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-[11px] text-[color:var(--color-text-faint)]">{t('reports.yoyHint')}</p>
        </Card>
      )}

      {/* Budget · this month (per category, actual vs budget). In envelope mode
          (P25) the limit is the rolling `effective` budget and a chip shows the
          net carried-in balance. */}
      {data.budgetVsActual.length > 0 && (
        <Card title={data.budgetRollover ? t('reports.cBudgetEnvelope') : t('reports.cBudget')}>
          <div className="space-y-2.5">
            {data.budgetVsActual.map((b) => {
              const rollover = data.budgetRollover && b.effective != null;
              const limit = rollover ? (b.effective as number) : b.budget;
              const carried = b.carried ?? 0;
              const pct = limit > 0 ? Math.min(100, Math.round((b.actual / limit) * 100)) : 0;
              const over = b.actual > limit;
              return (
                <div key={b.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[color:var(--color-text-dim)] flex items-center gap-1.5">
                      {b.name}
                      {rollover && carried !== 0 && (
                        <span
                          title={t('reports.budgetCarriedHint')}
                          style={{ fontFamily: 'var(--font-mono)' }}
                          className={`text-[10px] px-1.5 py-px rounded ${carried > 0 ? 'text-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10' : 'text-[color:var(--color-red)] bg-[color:var(--color-red)]/10'}`}
                        >
                          {carried > 0 ? '+' : '−'}{money(Math.abs(carried))}
                        </span>
                      )}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)' }} className={over ? 'text-[color:var(--color-red)]' : 'text-[color:var(--color-text-dim)]'}>
                      {money(b.actual)} / {money(limit)}{over ? ` · over ${money((b.actual - limit))}` : ''}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[color:var(--color-surface-2)] overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, b.actual > 0 ? 3 : 0)}%`, background: over ? 'var(--color-red)' : 'var(--color-accent)' }} />
                  </div>
                  {/* P100 — month-end pace projection. Hidden on the last day / with no spend
                      (b.projected is undefined then). "over pace" = the run rate blows the limit
                      even if the actual has not yet. */}
                  {b.projected != null && limit > 0 && (() => {
                    const overPace = b.projected > limit;
                    return (
                      <div className="mt-1 flex items-center gap-1.5 text-[10px]" style={{ fontFamily: 'var(--font-mono)' }}>
                        <span className="text-[color:var(--color-text-faint)]">
                          {t('reports.pace', { x: `~${money(b.projected)}` })}
                        </span>
                        <span className={`px-1.5 py-px rounded ${overPace ? 'text-[color:var(--color-red)] bg-[color:var(--color-red)]/10' : 'text-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10'}`}>
                          {overPace ? t('reports.overPace') : t('reports.onTrack')}
                        </span>
                      </div>
                    );
                  })()}
                  {/* P83 — the unspent part of the envelope, offered to a savings goal.
                      Hidden unless envelope mode is on, something is actually left, and
                      there is an open goal to receive it. */}
                  {rollover && (b.leftover ?? 0) > 0 && openGoals.length > 0 && data.budgetMonthKey && (
                    <SweepToGoal category={b.name} monthKey={data.budgetMonthKey} amount={b.leftover as number} goals={openGoals} />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upcoming installment obligations */}
        <Card title={t('reports.cInstallments')}>
          {data.upcomingInstallments.every((m) => m.amount === 0) ? (
            <Empty text="No active installments" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.upcomingInstallments} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => money(v, undefined, { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 })} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [money(v), 'due']} cursor={{ fill: 'rgba(127,127,127,0.08)' }} />
                <Bar dataKey="amount" radius={[5, 5, 0, 0]} fill="#a55eea" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Spending by store */}
        <Card title={inWindow(t('reports.cByStore'))}>
          {data.spendByStore.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, data.spendByStore.length * 30)}>
              <BarChart data={data.spendByStore} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => money(v, undefined, { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 })} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, _n, p) => [`${money(v)} · ${p?.payload?.count ?? 0} receipts`, 'spent']} cursor={{ fill: 'rgba(127,127,127,0.08)' }} />
                <Bar dataKey="total" radius={[0, 5, 5, 0]}>
                  {data.spendByStore.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Spend by category (owned items) */}
        <Card title={t('reports.cInvByCat')}>
          {data.spendByCategory.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={data.spendByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {data.spendByCategory.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="var(--color-bg)" />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [money(v), 'value']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Expenses by category (bills) */}
        <Card title={inWindow(t('reports.cExpByCat'))}>
          {data.expenseByCategory.length === 0 ? (
            <Empty text="No expenses logged yet" />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, data.expenseByCategory.length * 34)}>
              <BarChart data={data.expenseByCategory} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => money(v, undefined, { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 })} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [money(v), 'total']} cursor={{ fill: 'rgba(127,127,127,0.08)' }} />
                <Bar dataKey="value" radius={[0, 5, 5, 0]}>
                  {data.expenseByCategory.map((_, i) => (
                    <Cell key={i} fill={PALETTE[(i + 4) % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Expenses by space / property (P34) — only when the user has tagged spaces */}
        {data.expenseBySpace.length > 0 && (
          <Card title={inWindow(t('reports.cExpBySpace'))}>
            <ResponsiveContainer width="100%" height={Math.max(200, data.expenseBySpace.length * 34)}>
              <BarChart data={data.expenseBySpace.map((s) => ({ name: s.name || t('ex.spaceNone'), value: s.value }))} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => money(v, undefined, { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 })} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [money(v), 'total']} cursor={{ fill: 'rgba(127,127,127,0.08)' }} />
                <Bar dataKey="value" radius={[0, 5, 5, 0]}>
                  {data.expenseBySpace.map((_, i) => (
                    <Cell key={i} fill={PALETTE[(i + 1) % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Subscriptions monthly by category */}
        <Card title={t('reports.cSubsByCat', { cur: cur() })}>
          {data.subsByCategory.length === 0 ? (
            <Empty text="No active subscriptions" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.subsByCategory} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} width={36} tickFormatter={(v: number) => money(v, undefined, { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 })} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${money(v)}/mo`, 'cost']} cursor={{ fill: 'rgba(127,127,127,0.08)' }} />
                <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                  {data.subsByCategory.map((_, i) => (
                    <Cell key={i} fill={PALETTE[(i + 2) % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Subscriptions monthly by space / property (P68 phase 2) — only once tagged */}
        {data.subsBySpace.length > 0 && (
          <Card title={t('reports.cSubsBySpace', { cur: cur() })}>
            <ResponsiveContainer width="100%" height={Math.max(200, data.subsBySpace.length * 34)}>
              <BarChart data={data.subsBySpace} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => money(v, undefined, { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 })} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${money(v)}/mo`, 'cost']} cursor={{ fill: 'rgba(127,127,127,0.08)' }} />
                <Bar dataKey="value" radius={[0, 5, 5, 0]}>
                  {data.subsBySpace.map((_, i) => (
                    <Cell key={i} fill={PALETTE[(i + 3) % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Warranties expiring */}
        <Card title={t('reports.cWarranties')}>
          {data.warrantiesExpiring.length === 0 ? (
            <Empty text={t('reports.nothingExpiring')} />
          ) : (
            <div className="space-y-1.5">
              {data.warrantiesExpiring.map((w, i) => {
                const tone = w.days <= 30 ? 'var(--color-red)' : w.days <= 90 ? 'var(--color-gold)' : 'var(--color-accent)';
                return (
                  <div key={i} className="flex items-center justify-between gap-2 bg-[color:var(--color-surface-2)] rounded-lg px-3 py-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium truncate">
                      <ShieldCheck size={12} style={{ color: tone }} className="shrink-0" />
                      {w.title}
                    </span>
                    <span className="text-[10px] shrink-0 tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: tone }}>
                      {w.days}d · {fmtDate(w.until, locale)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Biggest purchases */}
        <Card title={inWindow(t('reports.cBiggest'))}>
          {data.biggestPurchases.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-1.5">
              {data.biggestPurchases.map((b, i) => (
                <div key={i} className="flex items-center justify-between gap-2 bg-[color:var(--color-surface-2)] rounded-lg px-3 py-2">
                  <span className="flex items-center gap-2 text-xs truncate">
                    <span className="text-[10px] text-[color:var(--color-text-faint)] tabular-nums w-4" style={{ fontFamily: 'var(--font-mono)' }}>
                      {i + 1}
                    </span>
                    <Store size={12} className="text-[color:var(--color-text-faint)] shrink-0" />
                    <span className="truncate">{b.store}</span>
                    {b.date && <span className="text-[10px] text-[color:var(--color-text-faint)] shrink-0">{fmtDate(b.date, locale)}</span>}
                  </span>
                  <span className="text-xs font-bold text-[color:var(--color-accent)] shrink-0 tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
                    {money(b.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Installment payoff — full width */}
      <Card title={t('reports.payoffTitle')} className="mt-4">
        {data.installmentPlans.length === 0 ? (
          <Empty />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            {data.installmentPlans.map((p) => {
              const pct = p.totalInstallments > 0 ? Math.round((p.paidInstallments / p.totalInstallments) * 100) : 0;
              return (
                <div key={p.key}>
                  <div className="flex items-center justify-between gap-2 mb-1 text-xs">
                    <span className="font-medium truncate flex items-center gap-1.5">
                      {p.linked && <Layers size={11} className="text-[color:var(--color-accent)] shrink-0" />}
                      {p.label}
                    </span>
                    <span className="text-[10px] text-[color:var(--color-text-faint)] shrink-0 tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
                      {p.paidInstallments}/{p.totalInstallments}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[color:var(--color-surface-2)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: p.done ? 'var(--color-accent)' : 'var(--color-purple)' }} />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-[color:var(--color-text-faint)] mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
                    <span>{money(p.perAmount)}/mo</span>
                    <span>{p.done ? 'paid off ✓' : `${money(p.remainingAmount)} left`}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Savings / financial goals (P12) — targets to reach, distinct from budgets
          (spending limits). Progress is derived from contributions, never stored. */}
      <div id="goals">
        <GoalsCard goals={data.goals} className="mt-4" />
      </div>
    </main>
  );
}

function GoalsCard({ goals, className }: { goals: GoalRow[]; className?: string }) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  return (
    <div className={`bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl p-5 ${className ?? ''}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-1.5 text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.15em]" style={{ fontFamily: 'var(--font-mono)' }}>
          <Target size={12} /> {t('reports.cGoals')}
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/20 transition-colors"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {adding ? <X size={12} /> : <Plus size={12} />} {t('reports.gNewGoal')}
        </button>
      </div>

      {adding && <NewGoalForm onDone={() => setAdding(false)} />}

      {goals.length === 0 && !adding ? (
        <Empty text={t('reports.gNoGoals')} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
          {goals.map((g) => (
            <GoalItem key={g._id} g={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function NewGoalForm({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createGoal(formData);
      if (res.ok) onDone();
      else setError(res.error ?? 'Failed');
    });
  }

  return (
    <form action={submit} className="mb-4 p-3 rounded-xl bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] flex flex-wrap gap-2 items-end">
      <div className="flex-1 min-w-[140px]">
        <label className="block text-[10px] text-[color:var(--color-text-faint)] mb-1">{t('reports.gTitle')}</label>
        <input name="title" required placeholder={t('reports.gTitlePlaceholder')} className="w-full bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)]" />
      </div>
      <div className="w-28">
        <label className="block text-[10px] text-[color:var(--color-text-faint)] mb-1">{t('reports.gTarget')} ({cur()})</label>
        <input name="targetAmount" type="number" min="0" step="0.01" required className="w-full bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)]" />
      </div>
      <div className="w-36">
        <label className="block text-[10px] text-[color:var(--color-text-faint)] mb-1">{t('reports.gDeadline')}</label>
        <input name="targetDate" type="date" className="w-full bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)]" />
      </div>
      <button type="submit" disabled={pending} className="text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-accent)] text-black font-semibold hover:opacity-90 disabled:opacity-50">
        {pending ? t('common.saving') : t('common.save')}
      </button>
      {error && <p className="w-full text-[11px] text-[color:var(--color-red)]">{error}</p>}
    </form>
  );
}

function GoalItem({ g }: { g: GoalRow }) {
  const t = useT();
  const money = useMoney();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState('');

  function contribute() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    startTransition(async () => {
      await addGoalContribution(g._id, n);
      setAmount('');
    });
  }

  async function remove() {
    const ok = await confirm({ title: t('reports.gDeleteTitle', { title: g.title }), message: t('reports.gDeleteBody'), danger: true });
    if (!ok) return;
    startTransition(async () => {
      await deleteGoal(g._id);
    });
  }

  return (
    <div className="rounded-xl bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] p-3">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate flex items-center gap-1.5">
            {g.title}
            {g.done && <span className="text-[10px] px-1.5 py-px rounded bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent)]">{t('reports.gReached')}</span>}
          </p>
          {g.category && <p className="text-[10px] text-[color:var(--color-text-faint)] mt-0.5">{g.category}</p>}
        </div>
        <button onClick={remove} disabled={pending} className="shrink-0 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] transition-colors">
          <Trash2 size={13} />
        </button>
      </div>

      <div className="h-2 rounded-full bg-[color:var(--color-surface-3)] overflow-hidden mb-1.5">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(g.pct, g.current > 0 ? 3 : 0)}%`, background: g.done ? 'var(--color-accent)' : 'var(--color-cyan)' }} />
      </div>

      <div className="flex items-center justify-between text-[10px] text-[color:var(--color-text-dim)] mb-2" style={{ fontFamily: 'var(--font-mono)' }}>
        <span>{money(g.current)} / {money(g.target)}</span>
        <span>{g.pct}%</span>
      </div>

      {!g.done && g.perMonth != null && (
        <p className="text-[10px] text-[color:var(--color-text-faint)] mb-2">{t('reports.gPerMonth', { x: money(g.perMonth) })}</p>
      )}

      {!g.done && (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && contribute()}
            placeholder={t('reports.gAddAmount')}
            className="flex-1 min-w-0 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-lg px-2 py-1 text-[11px] text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)]"
          />
          <button onClick={contribute} disabled={pending} className="shrink-0 text-[11px] px-2 py-1 rounded-lg bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/20 disabled:opacity-50">
            <Plus size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

/** P83 — one-click transfer of a budget category's unspent leftover into a goal.
 *  Two steps on purpose: money never moves between "boxes" without the user first
 *  seeing the amount and choosing where it lands. */
function SweepToGoal({ category, monthKey, amount, goals }: { category: string; monthKey: string; amount: number; goals: GoalRow[] }) {
  const t = useT();
  const money = useMoney();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [goalId, setGoalId] = useState(goals[0]?._id ?? '');
  const [error, setError] = useState<string | null>(null);

  function sweep() {
    const target = goalId || goals[0]?._id;
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const res = await sweepBudgetLeftoverToGoal(target, category, monthKey, amount);
      if (res.ok) setOpen(false);
      else setError(res.error ?? t('common.failed'));
    });
  }

  const label = money(amount);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title={t('reports.sweepHint')}
        className="mt-1 flex items-center gap-1 text-[10px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)] transition-colors"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <Target size={10} /> {t('reports.sweepOffer', { x: label })}
      </button>
    );
  }

  return (
    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
      <select
        value={goalId}
        onChange={(e) => setGoalId(e.target.value)}
        className="min-w-0 flex-1 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-2 py-1 text-[11px] text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)]"
      >
        {goals.map((g) => (
          <option key={g._id} value={g._id}>{g.title}</option>
        ))}
      </select>
      <button
        onClick={sweep}
        disabled={pending}
        className="shrink-0 flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/20 disabled:opacity-50"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <ArrowRight size={11} /> {label}
      </button>
      <button
        onClick={() => { setOpen(false); setError(null); }}
        className="shrink-0 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] transition-colors"
        aria-label={t('common.cancel')}
      >
        <X size={12} />
      </button>
      {error && <p className="w-full text-[10px] text-[color:var(--color-red)]">{error}</p>}
    </div>
  );
}

function Stat({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub: string; accent?: string }) {
  return (
    <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider mb-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)', color: accent }}>
        {value}
      </div>
      <div className="text-[10px] text-[color:var(--color-text-faint)] mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
        {sub}
      </div>
    </div>
  );
}

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl p-5 ${className ?? ''}`}>
      <h2 className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.15em] mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Empty({ text }: { text?: string }) {
  const t = useT();
  return <div className="h-[180px] flex items-center justify-center text-xs text-[color:var(--color-text-faint)]">{text ?? t('reports.noData')}</div>;
}
