'use client';
import { CategoryIcon, useCategoryLabel } from '@/components/CategoryBadge';
import { PAGE_MAIN, PageHeader } from '@/components/ui/PageHeader';
import { useState, useTransition } from 'react';
import type { StatementPaymentReport as PaymentReport } from '@/lib/statementPayments';
import { SubscriptionsReport, type SubRow } from './SubscriptionsReport';
import { AssetsReport } from './AssetsReport';
import { useRouter } from 'next/navigation';
import { useLocale, useT, useMoney } from '@/components/LocaleProvider';
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
  Legend,
  CartesianGrid,
} from 'recharts';
import { keepSeriesOrder } from '@/lib/chartOrder';
import { Store, Wallet, Sparkles, AlertTriangle, Check, ArrowRight, Loader2 } from 'lucide-react';
import { AssetAccountsModal } from '@/components/AssetAccountsModal';
import { convertToBase } from '@/lib/fx';
import { applyFxRate, applyFxRateToCurrency } from './fxActions';
import { FxRateButton } from '@/components/FxRateButton';
import { formatDate } from '@/lib/i18n/format';
import { compactControlClass } from '@/components/ui/Input';
import { cn } from '@/components/ui/cn';
import Link from 'next/link';
import { PERIOD_PRESETS, periodQuery, pctChange, type ReportPeriod, type PeriodPreset } from '@/lib/reportPeriod';
import type { TKey } from '@/lib/i18n';
import { filterControlClass } from '@/components/ui/Input';
import { summarizeReport, type ReportDigest } from './summaryActions';

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

type Data = {
  period: ReportPeriod & { label: string; prevLabel: string };
  totals: { expense: number; income: number; receipts: number; prevExpense: number; prevIncome: number; prevReceipts: number };
  statementPayments: PaymentReport;
  netWorth: { accountsTotal: number; series: NetWorthPoint[]; accounts?: Record<string, number> };
  safeToSpend: SafeToSpend;
  monthReview: MonthReview;
  monthlySpend: { key: string; label: string; total: number; count: number }[];
  spendByStore: { name: string; total: number; count: number; prev: number }[];
  spendByCategory: { name: string; value: number }[];
  subsByCategory: { name: string; value: number }[];
  /** P68 φάση 2: μηνιαίο ισοδύναμο κόστος συνδρομών ανά χώρο· κενό όσο καμία δεν έχει tag. */
  subsBySpace: { name: string; value: number }[];
  subscriptions: SubRow[];
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
  expenseByCategory: { name: string; value: number; prev: number }[];
  expenseBySpace: { name: string; value: number }[];
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

const REPORT_TABS = ['overview', 'spending', 'subscriptions', 'assets'] as const;
type ReportTab = (typeof REPORT_TABS)[number];
const TAB_LABEL: Record<ReportTab, TKey> = {
  overview: 'reports.tabOverview',
  spending: 'reports.tabSpending',
  subscriptions: 'reports.tabSubscriptions',
  assets: 'reports.tabAssets',
};
const PRESET_LABEL: Record<PeriodPreset, TKey> = {
  'this-month': 'reports.pThisMonth',
  'last-month': 'reports.pLastMonth',
  '3m': 'reports.p3m',
  '6m': 'reports.p6m',
  '12m': 'reports.p12m',
  'this-year': 'reports.pThisYear',
  'last-year': 'reports.pLastYear',
  custom: 'reports.pCustom',
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

export function fmtDate(s: string, locale: string): string {
  return formatDate(s, locale, { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
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
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
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
            className={cn(compactControlClass, 'w-24')}
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
        <span className="block text-[11px] text-[color:var(--color-text-faint)] truncate" style={{ fontFamily: 'var(--font-mono)' }}>
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
          className={cn(compactControlClass, 'w-20')}
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

export function ReportsClient({ data, initialTab, summaryOn = false, currency = 'EUR' }: { data: Data; initialTab?: string; summaryOn?: boolean; currency?: string }) {
  const locale = useLocale();
  const t = useT();
  const catLabel = useCategoryLabel();
  const money = useMoney();
  const s = data.summary;
  const P = data.period;
  const T = data.totals;
  const spend12 = data.monthlySpend.reduce((a, m) => a + m.total, 0);
  const fxIssues = data.fxIssues ?? [];
  const fxBase = data.baseCurrency || 'EUR';
  // #122: switching period is a client navigation: the current report stays on screen, dimmed,
  // until the new period's data arrives, instead of a blank full reload.
  const router = useRouter();
  const [periodPending, startPeriod] = useTransition();
  const [showAccountsModal, setShowAccountsModal] = useState(false);
  const [tab, setTab] = useState<ReportTab>(() => (REPORT_TABS.includes(initialTab as ReportTab) ? (initialTab as ReportTab) : 'overview'));
  // Every windowed figure is captioned with the period it was built from.
  const inWindow = (title: string) => `${title} · ${P.label}`;
  const q = periodQuery(P);
  function goTab(next: ReportTab) {
    setTab(next);
    // Remember the tab in the URL without asking the server again: the data is the same.
    window.history.replaceState(null, '', `/reports?${q}&tab=${next}`);
  }
  function goPeriod(next: string) {
    startPeriod(() => router.push(`/reports?${next}&tab=${tab}`, { scroll: false }));
  }
  /** A list page filtered to this period (and to one category or store). */
  function listHref(path: string, extra: Record<string, string> = {}) {
    const p = new URLSearchParams({ from: P.start, to: P.end, ...extra });
    return `${path}?${p.toString()}`;
  }

  return (
    <main className={`${PAGE_MAIN} transition-opacity ${periodPending ? 'opacity-60' : ''}`} aria-busy={periodPending}>
      <PageHeader
        title={t('nav.reports')}
        summary={<p className="text-sm text-[color:var(--color-text-dim)]">{t('reports.periodLine', { period: P.label, prev: P.prevLabel })}</p>}
      >
        <PeriodPicker period={P} onChange={goPeriod} />
      </PageHeader>

      <div role="tablist" aria-label={t('nav.reports')} className="mb-5 flex gap-1 overflow-x-auto no-scrollbar border-b border-[color:var(--color-border)]">
        {REPORT_TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => goTab(k)}
            className={cn(
              'shrink-0 px-3 py-2 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap',
              tab === k ? 'border-[color:var(--color-accent)] text-[color:var(--color-text)] font-semibold' : 'border-transparent text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
            )}
          >
            {t(TAB_LABEL[k])}
          </button>
        ))}
      </div>

      {/* Missing exchange rates (P9 slice 7) — foreign records saved without a rate keep
          their PRINTED amount, so they are silently mixed into every figure below. Shown
          above the numbers they distort, and only when there is something to fix.
          Slice 9: the rate can be filled in HERE, per record or per currency, because the
          records are spread over six modules and chasing them one form at a time is the
          reason they stay unfixed. */}
      {fxIssues.length > 0 && (
        <div className="mb-6 rounded-2xl border border-[color:var(--color-gold)]/40 bg-[color:var(--color-gold)]/5 p-5">
          <p className="flex items-center gap-1.5 text-[11px] text-[color:var(--color-gold)] mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
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



      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label={t('reports.kSpent')} value={T.expense} prev={T.prevExpense} upIsGood={false} href={listHref('/expenses')} />
            <Kpi label={t('nav.income')} value={T.income} prev={T.prevIncome} upIsGood href={listHref('/income')} />
            <Kpi label={t('reports.kNet')} value={T.income - T.expense} prev={T.prevIncome - T.prevExpense} upIsGood />
            <Kpi label={t('reports.kReceipts')} value={T.receipts} prev={T.prevReceipts} upIsGood={false} href={listHref('/receipts')} />
          </div>
          {summaryOn && (
            <ReportSummary
              key={`${P.start}-${P.end}`}
              digest={{
                locale,
                currency,
                period: P.label,
                prevPeriod: P.prevLabel,
                spent: T.expense,
                prevSpent: T.prevExpense,
                income: T.income,
                prevIncome: T.prevIncome,
                receipts: T.receipts,
                prevReceipts: T.prevReceipts,
                categories: data.expenseByCategory.slice(0, 8).map((r) => ({ name: catLabel(r.name).slice(0, 80), value: r.value, prev: r.prev ?? 0 })),
                stores: data.spendByStore.slice(0, 8).map((r) => ({ name: r.name.slice(0, 80), value: r.total, prev: r.prev ?? 0 })),
              }}
            />
          )}
      {/* Income vs Expense (cash flow) */}
      <Card title={inWindow(t('reports.tCashFlow'))}>
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
              <BarChart
                data={data.incomeExpense}
                margin={{ left: 0, right: 10, top: 6 }}
                style={{ cursor: 'pointer' }}
                onClick={(st) => {
                  const m = data.incomeExpense[Number(st?.activeTooltipIndex ?? -1)];
                  if (m) router.push(listHref('/expenses', { from: m.key, to: m.key }));
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => money(v, undefined, { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 })} />
                <Tooltip itemSorter={keepSeriesOrder} contentStyle={tooltipStyle} formatter={(v, n) => [money(Number(v)), n]} cursor={{ fill: 'rgba(127,127,127,0.08)' }} />
                <Legend itemSorter={null} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="income" name={t('nav.income')} radius={[5, 5, 0, 0]} fill="#00ff88" />
                <Bar dataKey="expense" name={t('reports.expense')} radius={[5, 5, 0, 0]} fill="#ff4757" />
              </BarChart>
            </ResponsiveContainer>
            <p className="mt-2 text-xs text-[color:var(--color-text-faint)]">{t('reports.clickMonth')}</p>
          </>
        )}
      </Card>

      {/* Month in Review (P3) — deterministic narrative digest (budget/price-hike/
          warranty signals already computed elsewhere, zero AI, zero new queries). */}
      <div className="mb-6 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
        <p className="flex items-center gap-1.5 text-[11px] text-[color:var(--color-text-faint)] mb-2" style={{ fontFamily: 'var(--font-mono)' }}>
          <Sparkles size={12} /> {t('reports.monthReview')} · {data.monthReview.monthLabel}
        </p>
        <p className="text-sm md:text-base leading-relaxed text-[color:var(--color-text)]">{data.monthReview.narrative}</p>
        {(data.monthReview.overBudget.length > 0 || data.monthReview.priceChanges.length > 0 || data.monthReview.warrantiesExpiringSoon.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]" style={{ fontFamily: 'var(--font-mono)' }}>
            {data.monthReview.overBudget.map((b) => (
              <span key={`b-${b.category}`} className="px-2 py-1 rounded-md border border-[color:var(--color-red)]/40 text-[color:var(--color-red)]">
                {catLabel(b.category)} {money(b.actual)}/{money(b.budget)}
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

      {/* Safe-to-spend (P19) — known expected income minus fixed future charges, as a
          single available figure for the rest of this month + 30/60/90-day windows. */}
      <div className="mb-6 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] text-[color:var(--color-text-faint)] mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
              <Wallet size={12} /> {t('payments.cashflow')} · {data.safeToSpend.monthLabel}
            </p>
            <p className="max-w-xl mb-3 text-xs leading-relaxed text-[color:var(--color-text-dim)]">{t('payments.cashflowNote')}</p>
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
                <span className="block text-[11px] text-[color:var(--color-text-faint)] mb-0.5">{t('reports.stsWindow', { d: w.days })}</span>
                <span className="block text-sm font-semibold" style={{ color: w.net >= 0 ? 'var(--color-accent)' : 'var(--color-red)' }}>
                  {w.net >= 0 ? '' : '-'}{money(Math.abs(w.net))}
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{t('reports.stsNote')}</p>
      </div>

        </div>
      )}

      {tab === 'spending' && (
        <div className="space-y-4">
      {/* Monthly spend — full width hero chart */}
      <Card title={inWindow(t('reports.tMonthly'))} className="mb-4">
        {spend12 === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart
              data={data.monthlySpend}
              margin={{ left: 0, right: 10, top: 6 }}
              style={{ cursor: 'pointer' }}
              onClick={(st) => {
                const m = data.monthlySpend[Number(st?.activeTooltipIndex ?? -1)];
                if (m) router.push(listHref('/receipts', { from: m.key, to: m.key }));
              }}
            >
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
                formatter={(v, _n, p) => [`${money(Number(v))} · ${(p?.payload?.count ?? 0)} receipts`, t('reports.spent')]}
                cursor={{ stroke: 'var(--color-accent)', strokeWidth: 1, strokeOpacity: 0.3 }}
              />
              <Area type="monotone" dataKey="total" stroke="#00ff88" strokeWidth={2} fill="url(#spendGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Expenses by category: a row per category, each opening its expenses for the period */}
        <Card title={inWindow(t('reports.cExpByCat'))}>
          {data.expenseByCategory.length === 0 ? (
            <Empty text={t('reports.noExpenses')} />
          ) : (
            <RankList
              rows={data.expenseByCategory.map((r) => ({ name: catLabel(r.name), icon: <CategoryIcon category={r.name} size={14} />, value: r.value, prev: r.prev, href: listHref('/expenses', { category: r.name }) }))}
              prevLabel={P.prevLabel}
            />
          )}
        </Card>

        {/* Spending by store: a row per store, each opening its receipts for the period */}
        <Card title={inWindow(t('reports.cByStore'))}>
          {data.spendByStore.length === 0 ? (
            <Empty />
          ) : (
            <RankList
              rows={data.spendByStore.map((r) => ({ name: r.name, value: r.total, prev: r.prev, sub: t('reports.nReceipts', { n: r.count }), href: listHref('/receipts', { store: r.name }) }))}
              prevLabel={P.prevLabel}
            />
          )}
        </Card>

        {/* Expenses by space / property (P34) — only when the user has tagged spaces */}
        {data.expenseBySpace.length > 0 && (
          <Card title={inWindow(t('reports.cExpBySpace'))}>
            <ResponsiveContainer width="100%" height={Math.max(200, data.expenseBySpace.length * 34)}>
              <BarChart data={data.expenseBySpace.map((s) => ({ name: s.name || t('ex.spaceNone'), value: s.value }))} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => money(v, undefined, { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 })} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [money(Number(v)), 'total']} cursor={{ fill: 'rgba(127,127,127,0.08)' }} />
                <Bar dataKey="value" radius={[0, 5, 5, 0]}>
                  {data.expenseBySpace.map((_, i) => (
                    <Cell key={i} fill={PALETTE[(i + 1) % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Biggest purchases */}
        <Card title={inWindow(t('reports.cBiggest'))}>
          {data.biggestPurchases.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-1.5">
              {data.biggestPurchases.map((b, i) => (
                <div key={i} className="flex items-center justify-between gap-2 bg-[color:var(--color-surface-2)] rounded-lg px-3 py-2">
                  <span className="flex items-center gap-2 text-xs truncate">
                    <span className="text-[11px] text-[color:var(--color-text-faint)] tabular-nums w-4" style={{ fontFamily: 'var(--font-mono)' }}>
                      {i + 1}
                    </span>
                    <Store size={12} className="text-[color:var(--color-text-faint)] shrink-0" />
                    <span className="truncate">{b.store}</span>
                    {b.date && <span className="text-[11px] text-[color:var(--color-text-faint)] shrink-0">{fmtDate(b.date, locale)}</span>}
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
              <Tooltip itemSorter={keepSeriesOrder} contentStyle={tooltipStyle} formatter={(v, n) => [money(Number(v)), n]} cursor={{ fill: 'rgba(127,127,127,0.08)' }} />
              <Legend itemSorter={null} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="previous" name={t('reports.yoyLastYear')} radius={[5, 5, 0, 0]} fill="#4a4a4a" />
              <Bar dataKey="current" name={t('reports.yoyThisYear')} radius={[5, 5, 0, 0]} fill="#00d4ff" />
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-[11px] text-[color:var(--color-text-faint)]">{t('reports.yoyHint')}</p>
        </Card>
      )}

        </div>
      )}

      {tab === 'subscriptions' && <SubscriptionsReport subs={data.subscriptions} bySpace={data.subsBySpace} />}

      {tab === 'assets' && (
        <AssetsReport
          inventory={s.ownedValue}
          accounts={data.netWorth.accountsTotal}
          installments={s.installmentsRemaining}
          cardBalance={s.outstanding}
          plans={data.installmentPlans}
          inventoryByCategory={data.spendByCategory}
          warranties={data.warrantiesExpiring}
          series={data.netWorth.series}
          onEditAccounts={() => setShowAccountsModal(true)}
        />
      )}

      <AssetAccountsModal
        open={showAccountsModal}
        onClose={() => setShowAccountsModal(false)}
        initialAccounts={data.netWorth.accounts || {}}
        onSaved={() => router.refresh()}
      />
    </main>
  );
}

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl p-5 ${className ?? ''}`}>
      <h2 className="text-[11px] text-[color:var(--color-text-faint)] mb-4" style={{ fontFamily: 'var(--font-mono)' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Empty({ text }: { text?: string }) {
  const t = useT();
  // Short: an empty chart is a line of text, not a chart-sized hole in the page.
  return <div className="h-20 flex items-center justify-center text-center text-xs text-[color:var(--color-text-faint)]">{text ?? t('reports.noData')}</div>;
}

/** The period switch: the usual periods in one dropdown, and two month fields for any other. */
function PeriodPicker({ period, onChange }: { period: ReportPeriod; onChange: (query: string) => void }) {
  const t = useT();
  const [custom, setCustom] = useState(period.preset === 'custom');
  const [from, setFrom] = useState(period.start);
  const [to, setTo] = useState(period.end);
  const thisMonth = new Date().toISOString().slice(0, 7);
  return (
    <div className="shrink-0 flex items-center gap-2">
      <select
        aria-label={t('reports.period')}
        value={custom ? 'custom' : period.preset}
        onChange={(e) => {
          const v = e.target.value as PeriodPreset;
          if (v === 'custom') return setCustom(true);
          setCustom(false);
          onChange(`period=${v}`);
        }}
        className={cn(filterControlClass, 'w-auto')}
      >
        {PERIOD_PRESETS.map((p) => (
          <option key={p} value={p}>
            {t(PRESET_LABEL[p])}
          </option>
        ))}
      </select>
      {custom && (
        <>
          <input type="month" aria-label={t('reports.from')} value={from} max={thisMonth} onChange={(e) => setFrom(e.target.value)} className={cn(filterControlClass, 'w-[9.5rem]')} />
          <input type="month" aria-label={t('reports.to')} value={to} max={thisMonth} onChange={(e) => setTo(e.target.value)} className={cn(filterControlClass, 'w-[9.5rem]')} />
          <button
            type="button"
            disabled={!from || !to}
            onClick={() => onChange(periodQuery({ preset: 'custom', start: from, end: to }))}
            className="h-10 px-3 rounded-[10px] text-sm font-semibold bg-[color:var(--color-surface-3)] border border-[color:var(--color-border-light)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
          >
            {t('reports.apply')}
          </button>
        </>
      )}
    </div>
  );
}

/** "+12%" / "-8%" against the comparison period, green when the move is the good one. */
function Delta({ value, prev, upIsGood, label }: { value: number; prev: number; upIsGood: boolean; label?: string }) {
  const t = useT();
  const pct = pctChange(value, prev);
  if (pct === null) return <span className="text-xs text-[color:var(--color-text-faint)]">{t('reports.noCompare')}</span>;
  const good = pct === 0 ? null : (pct > 0) === upIsGood;
  return (
    <span
      className="text-xs font-semibold tabular-nums"
      style={{ color: good === null ? 'var(--color-text-dim)' : good ? 'var(--color-accent)' : 'var(--color-red)' }}
      title={label}
    >
      {pct > 0 ? '+' : ''}
      {pct}%
    </span>
  );
}

/** A total of the period, its change against the previous period, and a link to its records. */
function Kpi({ label, value, prev, upIsGood, href }: { label: string; value: number; prev: number; upIsGood: boolean; href?: string }) {
  const t = useT();
  const money = useMoney();
  const body = (
    <>
      <span className="block text-xs text-[color:var(--color-text-dim)]">{label}</span>
      <span className="block mt-1 text-xl lg:text-2xl font-bold tabular-nums" style={{ fontFamily: 'var(--font-display)', color: value < 0 ? 'var(--color-red)' : undefined }}>
        {money(value)}
      </span>
      <span className="mt-1 flex items-center gap-1.5 text-xs text-[color:var(--color-text-faint)]">
        <Delta value={value} prev={prev} upIsGood={upIsGood} />
        {prev > 0 && <span className="truncate">{t('reports.vsPrev', { x: money(prev) })}</span>}
      </span>
    </>
  );
  const cls = 'block rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 min-w-0';
  return href ? (
    <Link href={href} prefetch={false} className={cn(cls, 'hover:border-[color:var(--color-border-light)] hover:bg-[color:var(--color-surface-2)] transition-colors')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Ranked rows (category, store): a bar for the share, the total, the change, and a link to the records. */
function RankList({ rows, prevLabel }: { rows: { name: string; icon?: React.ReactNode; value: number; prev: number; sub?: string; href: string }[]; prevLabel: string }) {
  const money = useMoney();
  const t = useT();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="divide-y divide-[color:var(--color-border)] -mx-2">
      {rows.map((r) => (
        <li key={r.name}>
          <Link href={r.href} prefetch={false} className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-[color:var(--color-surface-2)] transition-colors">
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">{r.icon}<span className="truncate">{r.name}</span></span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{money(r.value)}</span>
              </span>
              <span className="mt-1.5 block h-1.5 rounded-full bg-[color:var(--color-surface-3)] overflow-hidden">
                <span className="block h-full rounded-full bg-[color:var(--color-accent)]/70" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
              </span>
              <span className="mt-1 flex items-center justify-between gap-2 text-xs text-[color:var(--color-text-faint)]">
                <span className="truncate">{r.sub ?? ''}</span>
                <Delta value={r.value} prev={r.prev} upIsGood={false} label={t('reports.vsPeriod', { period: prevLabel, x: money(r.prev) })} />
              </span>
            </span>
            <ArrowRight size={15} className="shrink-0 text-[color:var(--color-text-faint)]" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "Explain this period" (AI): asked for with a button, so it never runs (or costs) on its own.
 *  Keyed on the period by the caller, so a new period starts empty again. */
function ReportSummary({ digest }: { digest: ReportDigest }) {
  const t = useT();
  const [state, setState] = useState<{ sentences?: string[]; error?: string }>({});
  const [pending, start] = useTransition();
  const ask = () =>
    start(async () => {
      try {
        const r = await summarizeReport(digest);
        setState(r.ok ? { sentences: r.sentences } : { error: r.error });
      } catch (e) {
        setState({ error: (e as Error).message || t('common.failed') });
      }
    });
  return (
    <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles size={14} className="text-[color:var(--color-accent)]" /> {t('reports.aiTitle')}
        </p>
        <button
          type="button"
          onClick={ask}
          disabled={pending}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 text-xs text-[color:var(--color-text)] transition-colors hover:border-[color:var(--color-border-light)] disabled:opacity-50"
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {state.sentences ? t('reports.aiAgain') : t('reports.aiExplain')}
        </button>
      </div>
      {state.sentences ? (
        <div className="mt-3 space-y-1.5 text-sm leading-relaxed text-[color:var(--color-text-dim)]">
          {state.sentences.map((x, i) => (
            <p key={i}>{x}</p>
          ))}
          <p className="pt-1 text-[11px] text-[color:var(--color-text-faint)]">{t('reports.aiNote')}</p>
        </div>
      ) : state.error ? (
        <p className="mt-2 text-xs text-[color:var(--color-red)]">{state.error}</p>
      ) : (
        <p className="mt-1 text-xs text-[color:var(--color-text-faint)]">{t('reports.aiHint')}</p>
      )}
    </div>
  );
}
