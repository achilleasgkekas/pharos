'use client';
import { PAGE_MAIN, PageHeader } from '@/components/ui/PageHeader';
import { useMemo, useState, useTransition } from 'react';
import { useLocale, useT, useMoney } from '@/components/LocaleProvider';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend } from 'recharts';
import { keepSeriesOrder } from '@/lib/chartOrder';
import { Target, TrendingUp, Wallet, Plus, Trash2, Scissors, Check, AlertTriangle } from 'lucide-react';
import {
  balanceOn,
  planForTarget,
  coverShortfall,
  type SavingsPlan,
  type SavingsVerdict,
} from '@/lib/savingsPlan';
import { createGoal, addGoalContribution, deleteGoal } from '@/app/reports/goalsActions';
import type { SavingsData, SavingsGoal } from './types';
import { formatDate } from '@/lib/i18n/format';

// The Save tab. Everything shown here is derived by lib/savingsPlan.ts from the ledger
// the rest of the app already keeps — no new bookkeeping, and no number on this page is
// stored anywhere. The planner recomputes in the browser as you type, which is why the
// page is handed a baseline and a projection rather than a set of finished answers: the
// engine is pure, so "what if I moved the date?" costs nothing and needs no round trip.


const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' in the reader's own timezone — toISOString would hand a date input
 *  yesterday's date for anyone east of Greenwich late in the evening. */
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** A date input's value is a plain day with no timezone; read it as a LOCAL day so the
 *  date shown back to the reader is the one they picked. */
function parseDay(value: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + n);
  return out;
}

function fmtDay(value: string | null, locale: string): string {
  return formatDate(parseDay(value), locale, { day: '2-digit', month: 'short', year: 'numeric' }, '—');
}

/** Calendar months from one date to another — used to size the chart to the question. */
function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

const tooltipStyle = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  fontSize: 12,
} as const;

const VERDICT_COLOR: Record<SavingsVerdict, string> = {
  reached: 'var(--color-accent)',
  'on-track': 'var(--color-accent)',
  tight: 'var(--color-gold)',
  short: 'var(--color-red)',
  'no-surplus': 'var(--color-red)',
  unknown: 'var(--color-text-dim)',
};

export function SavingsClient({ data }: { data: SavingsData }) {
  const locale = useLocale();
  const t = useT();
  const money = useMoney();
  const moneyExact = useMoney({ minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const { baseline, projection, goals, levers, obligations } = data;

  // Default six months out: far enough to be a forecast, near enough to still be about
  // the decision in front of you.
  const [dateStr, setDateStr] = useState(() => isoDay(addMonths(new Date(), 6)));
  const [planAmount, setPlanAmount] = useState('');
  const [planDate, setPlanDate] = useState(() => isoDay(addMonths(new Date(), 12)));

  const forecastDate = useMemo(() => parseDay(dateStr), [dateStr]);
  const forecast = useMemo(() => (forecastDate ? balanceOn(projection, forecastDate) : null), [projection, forecastDate]);
  const startBalance = projection[0]?.openBalance ?? data.startBalance;

  // Draw as far as the question reaches, with a floor so a near date still shows a trend.
  const chartData = useMemo(() => {
    const want = forecastDate ? monthsBetween(new Date(), forecastDate) + 1 : 6;
    return projection.slice(0, Math.max(6, Math.min(projection.length, want)));
  }, [projection, forecastDate]);

  const adHoc: SavingsPlan | null = useMemo(() => {
    const amount = Number(planAmount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return planForTarget({ target: amount, targetDate: parseDay(planDate), baseline, projection });
  }, [planAmount, planDate, baseline, projection]);

  const basisNote =
    baseline.basis === 'none'
      ? t('sav.basisNone')
      : baseline.basis === 'thin'
        ? t('sav.basisThin', { n: baseline.months })
        : t('sav.basisHistory', { n: baseline.months });

  return (
    <main className={PAGE_MAIN}>
      <PageHeader title={t('sav.title')} subtitle={t('sav.subtitle')} />

      {/* Honesty first: a forecast built on nothing, or on a balance the app does not
          know, is worth saying out loud ABOVE the number it would otherwise flatter. */}
      {baseline.basis === 'none' && <Notice tone="warn" text={t('sav.basisNone')} />}
      {!data.hasAccounts && <Notice tone="info" text={t('sav.noAccounts')} />}
      {baseline.basis !== 'none' && baseline.incomeMonths < baseline.months / 2 && (
        <Notice tone="info" text={t('sav.incomeSparse', { n: baseline.incomeMonths, m: baseline.months })} />
      )}

      {/* ── Forecast hero ───────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-3 gap-3 mb-4">
        <div className="md:col-span-2 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <span className="flex items-center gap-1.5 text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.15em]" style={{ fontFamily: 'var(--font-mono)' }}>
              <Wallet size={12} /> {t('sav.forecastTitle')}
            </span>
            <label className="flex items-center gap-2 text-[11px] text-[color:var(--color-text-dim)]">
              {t('sav.pickDate')}
              <input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-2 py-1 text-[11px] text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)]"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            </label>
          </div>
          {forecast === null ? (
            <p className="text-sm text-[color:var(--color-text-dim)]">{t('sav.beyondHorizon')}</p>
          ) : (
            <>
              <p
                className="text-3xl md:text-4xl font-bold"
                style={{ fontFamily: 'var(--font-display)', color: forecast >= 0 ? 'var(--color-accent)' : 'var(--color-red)' }}
              >
                {money(forecast)}
              </p>
              <p className="text-[11px] text-[color:var(--color-text-dim)] mt-1" style={{ fontFamily: 'var(--font-mono)' }}>
                {t('sav.onDate', { d: fmtDay(dateStr, locale) })} ·{' '}
                <span className={forecast - startBalance >= 0 ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]'}>
                  {forecast - startBalance >= 0 ? '+' : '−'}{money(Math.abs(forecast - startBalance))}
                </span>{' '}
                {t('sav.fromToday', { x: money(startBalance) })}
              </p>
            </>
          )}
          <p className="text-[10px] text-[color:var(--color-text-faint)] mt-2">{basisNote}</p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <Stat icon={<TrendingUp size={13} />} label={t('sav.bNet')} value={moneyExact(baseline.net)} sub={t('sav.perMonth')} accent={baseline.net >= 0 ? 'var(--color-accent)' : 'var(--color-red)'} />
          <div className="grid grid-cols-2 gap-3">
            <Stat icon={<Plus size={13} />} label={t('sav.bIncome')} value={money(baseline.income)} sub={t('sav.perMonth')} />
            <Stat icon={<Scissors size={13} />} label={t('sav.bSpend')} value={money(baseline.spend)} sub={t('sav.perMonth')} />
          </div>
        </div>
      </div>

      {/* ── Projection chart ────────────────────────────────────────────── */}
      <Card title={t('sav.chartTitle')} className="mb-4">
        {chartData.length === 0 ? (
          <Empty text={t('sav.basisNone')} />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ left: 0, right: 10, top: 6 }}>
              <defs>
                <linearGradient id="savGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00d4ff" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#00d4ff" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => money(v, undefined, { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 })} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v) => [money(Number(v)), t('sav.chartBalance')]}
                cursor={{ stroke: 'var(--color-accent)', strokeWidth: 1, strokeOpacity: 0.3 }}
              />
              <ReferenceLine y={0} stroke="var(--color-red)" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="balance" stroke="#00d4ff" strokeWidth={2} fill="url(#savGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
        {obligations.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[color:var(--color-border)]">
            <p className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.12em] mb-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
              {t('sav.endingTitle')}
            </p>
            <ul className="space-y-1">
              {obligations.slice(0, 4).map((o, i) => (
                <li key={`${o.label}-${i}`} className="text-[11px] text-[color:var(--color-text-dim)]">
                  {t('sav.endingRow', { label: o.label, x: money(o.perMonth), n: o.monthsRemaining })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* ── The planner: "can I make it?" ───────────────────────────────── */}
      <Card title={t('sav.planTitle')} className="mb-4">
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <label className="flex flex-col gap-1 text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.12em]" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('sav.planAmount')}
            <input
              type="number"
              min="0"
              step="1"
              value={planAmount}
              onChange={(e) => setPlanAmount(e.target.value)}
              placeholder="5000"
              className="w-32 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-2 py-1.5 text-sm text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.12em]" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('sav.planDate')}
            <input
              type="date"
              value={planDate}
              onChange={(e) => setPlanDate(e.target.value)}
              className="bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-2 py-1.5 text-sm text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)]"
            />
          </label>
          {adHoc && <SaveAsGoal amount={Number(planAmount)} date={planDate} />}
        </div>
        {adHoc ? <PlanReadout plan={adHoc} levers={levers} /> : <p className="text-xs text-[color:var(--color-text-faint)]">{t('sav.planHint')}</p>}
      </Card>

      {/* ── Goals, each answered by the same engine ─────────────────────── */}
      <Card title={t('sav.goals')}>
        {goals.length === 0 ? (
          <p className="text-xs text-[color:var(--color-text-faint)]">{t('sav.noGoals')}</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {goals.map((g) => (
              <GoalPlanCard key={g._id} goal={g} data={data} />
            ))}
          </div>
        )}
      </Card>

      {/* ── What the forecast was measured from ─────────────────────────── */}
      {data.history.length > 0 && (
        <Card title={t('sav.historyTitle')} className="mt-4">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.history.map((m) => ({ ...m, label: m.key.slice(2) }))} margin={{ left: 0, right: 10, top: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => money(v, undefined, { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 })} />
              <Tooltip itemSorter={keepSeriesOrder} contentStyle={tooltipStyle} formatter={(v, n) => [money(Number(v)), n]} cursor={{ fill: 'rgba(127,127,127,0.08)' }} />
              <Legend itemSorter={null} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="income" name={t('sav.bIncome')} radius={[5, 5, 0, 0]} fill="#00ff88" />
              <Bar dataKey="expense" name={t('sav.bSpend')} radius={[5, 5, 0, 0]} fill="#ff4757" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </main>
  );
}

/** The verdict, the arithmetic behind it, and what to do about a gap. */
function PlanReadout({ plan, levers }: { plan: SavingsPlan; levers: SavingsData['levers'] }) {
  const locale = useLocale();
  const t = useT();
  const money = useMoney();
  const moneyExact = useMoney({ minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const cover = useMemo(() => coverShortfall(plan.shortfallPerMonth, levers), [plan.shortfallPerMonth, levers]);
  const color = VERDICT_COLOR[plan.verdict];

  const sentence = (() => {
    switch (plan.verdict) {
      case 'reached':
        return t('sav.vReached');
      case 'on-track':
        return t('sav.vOnTrack', { x: moneyExact(plan.suggestedPerMonth) });
      case 'tight':
        return t('sav.vTight', { x: moneyExact(plan.requiredPerMonth ?? 0), y: moneyExact(plan.affordablePerMonth) });
      case 'short':
        return t('sav.vShort', { x: moneyExact(plan.requiredPerMonth ?? 0), y: moneyExact(plan.shortfallPerMonth) });
      case 'no-surplus':
        return t('sav.vNoSurplus');
      default:
        return t('sav.vUnknown');
    }
  })();

  return (
    <div>
      <p className="text-sm font-semibold mb-1" style={{ color }}>
        {sentence}
      </p>
      <p className="text-[11px] text-[color:var(--color-text-dim)] mb-2" style={{ fontFamily: 'var(--font-mono)' }}>
        {plan.remaining > 0 && <>{t('sav.stillNeeded', { x: money(plan.remaining) })} · </>}
        {plan.requiredPerMonth != null && <>{t('sav.needPerMonth', { x: moneyExact(plan.requiredPerMonth) })} · </>}
        {t('sav.sparePerMonth', { x: moneyExact(plan.affordablePerMonth) })}
      </p>
      {plan.verdict !== 'reached' && (
        <p className="text-[11px] text-[color:var(--color-text-dim)] mb-2">
          {plan.earliest ? t('sav.earliest', { d: fmtDay(plan.earliest, locale) }) : t('sav.earliestNone')}
        </p>
      )}
      {cover.picks.length > 0 && (
        <div className="rounded-xl bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] p-3">
          <p className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.12em] mb-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('sav.coverTitle', { x: moneyExact(plan.shortfallPerMonth) })}
          </p>
          <ul className="space-y-0.5 mb-1.5">
            {cover.picks.map((p, i) => (
              <li key={`${p.label}-${i}`} className="text-[11px] text-[color:var(--color-text-dim)] flex items-center gap-1.5">
                <Scissors size={11} className="shrink-0 text-[color:var(--color-text-faint)]" />
                {t('sav.coverRow', { label: p.label, x: moneyExact(p.perMonth) })}
              </li>
            ))}
          </ul>
          <p className="text-[10px]" style={{ color: cover.closes ? 'var(--color-accent)' : 'var(--color-text-faint)' }}>
            {cover.closes
              ? t('sav.coverCloses')
              : t('sav.coverShort', { x: moneyExact(cover.covered), y: moneyExact(plan.shortfallPerMonth) })}
          </p>
        </div>
      )}
    </div>
  );
}

/** A goal, run through the same planner, with the progress + contribute controls. */
function GoalPlanCard({ goal, data }: { goal: SavingsGoal; data: SavingsData }) {
  const locale = useLocale();
  const t = useT();
  const money = useMoney();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState('');

  const plan = useMemo(
    () => planForTarget({ target: goal.target, saved: goal.saved, targetDate: goal.targetDate, baseline: data.baseline, projection: data.projection }),
    [goal, data.baseline, data.projection]
  );
  const pct = goal.target > 0 ? Math.min(100, Math.round((goal.saved / goal.target) * 1000) / 10) : 0;

  function contribute() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    startTransition(async () => {
      await addGoalContribution(goal._id, amt);
      setAmount('');
    });
  }

  async function remove() {
    const ok = await confirm({ title: t('sav.gDeleteTitle', { title: goal.title }), message: t('sav.gDeleteBody'), danger: true });
    if (ok) startTransition(() => void deleteGoal(goal._id));
  }

  return (
    <div className="rounded-xl bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] p-3">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate flex items-center gap-1.5">
            <Target size={12} className="shrink-0 text-[color:var(--color-text-faint)]" />
            {goal.title}
          </p>
          <p className="text-[10px] text-[color:var(--color-text-faint)] mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('sav.gOf', { a: money(goal.saved), b: money(goal.target) })}
            {goal.targetDate ? ` · ${fmtDay(goal.targetDate, locale)}` : ''}
          </p>
        </div>
        <button onClick={remove} disabled={pending} className="shrink-0 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] transition-colors" aria-label={t('common.delete')}>
          <Trash2 size={13} />
        </button>
      </div>

      <div className="h-2 rounded-full bg-[color:var(--color-surface-3)] overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(pct, goal.saved > 0 ? 3 : 0)}%`, background: plan.verdict === 'reached' ? 'var(--color-accent)' : 'var(--color-cyan)' }}
        />
      </div>

      <PlanReadout plan={plan} levers={data.levers} />

      {plan.verdict !== 'reached' && (
        <div className="flex items-center gap-1.5 mt-2">
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && contribute()}
            placeholder={t('sav.gAddAmount')}
            className="flex-1 min-w-0 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-lg px-2 py-1 text-[11px] text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)]"
          />
          <button
            onClick={contribute}
            disabled={pending}
            className="shrink-0 text-[11px] px-2 py-1 rounded-lg bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/20 disabled:opacity-50"
            aria-label={t('sav.gAdd')}
          >
            <Plus size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

/** Turn the answer on screen into something the app will keep tracking. */
function SaveAsGoal({ amount, date }: { amount: number; date: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  function save() {
    const name = title.trim();
    if (!name) {
      setError(t('sav.needTitle'));
      return;
    }
    setError('');
    const fd = new FormData();
    fd.set('title', name);
    fd.set('targetAmount', String(amount));
    fd.set('targetDate', date || '');
    startTransition(async () => {
      const res = await createGoal(fd);
      if (res.ok) setTitle('');
      else setError(res.error || 'Failed');
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.12em]" style={{ fontFamily: 'var(--font-mono)' }}>
          {t('sav.newGoalTitle')}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder={t('sav.newGoalPlaceholder')}
            className="w-44 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-2 py-1.5 text-sm text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)]"
          />
        </label>
        <button
          onClick={save}
          disabled={pending}
          className="px-3 py-1.5 rounded-lg text-xs bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/20 disabled:opacity-50 flex items-center gap-1.5"
        >
          <Check size={13} /> {t('sav.saveAsGoal')}
        </button>
      </div>
      {error && <p className="text-[10px] text-[color:var(--color-red)]">{error}</p>}
    </div>
  );
}

function Notice({ tone, text }: { tone: 'info' | 'warn'; text: string }) {
  const color = tone === 'warn' ? 'var(--color-gold)' : 'var(--color-cyan)';
  return (
    <div className="mb-3 rounded-xl border p-3 flex items-start gap-2" style={{ borderColor: `${color}40`, background: `${color}12` }}>
      <AlertTriangle size={13} className="shrink-0 mt-0.5" style={{ color }} />
      <p className="text-[11px] text-[color:var(--color-text-dim)]">{text}</p>
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

function Empty({ text }: { text: string }) {
  return <div className="h-[180px] flex items-center justify-center text-xs text-[color:var(--color-text-faint)]">{text}</div>;
}
