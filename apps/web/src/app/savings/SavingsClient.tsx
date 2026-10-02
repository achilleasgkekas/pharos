'use client';
import { PAGE_MAIN, PageHeader } from '@/components/ui/PageHeader';
import { DateInput } from '@/components/ui/DateInput';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useT, useMoney } from '@/components/LocaleProvider';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend } from 'recharts';
import { keepSeriesOrder } from '@/lib/chartOrder';
import { Target, TrendingUp, Wallet, Plus, Trash2, Scissors, Check, AlertTriangle, Pencil, Sparkles, Loader2, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { aiSavingsPlan, addPlanStepsAsTasks, type AiPlan, type AiPlanInput } from './aiPlanActions';
import { AssetAccountsModal } from '@/components/AssetAccountsModal';
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
import { compactControlClass } from '@/components/ui/Input';
import { cn } from '@/components/ui/cn';

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

export function SavingsClient({ data, aiOn = false }: { data: SavingsData; aiOn?: boolean }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useT();
  const money = useMoney();
  const moneyExact = useMoney({ minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const { baseline, projection, goals, levers, obligations } = data;
  const [showAccountsModal, setShowAccountsModal] = useState(false);

  // Default six months out: far enough to be a forecast, near enough to still be about
  // the decision in front of you.
  const [dateStr, setDateStr] = useState(() => isoDay(addMonths(new Date(), 6)));
  const [planAmount, setPlanAmount] = useState('');
  const [planDate, setPlanDate] = useState(() => isoDay(addMonths(new Date(), 12)));
  // #415: text in the date field that is not a date reaches here as '', which would save the
  // goal with no target date; the field says so, and Save as goal waits for a real day.
  const [planDateProblem, setPlanDateProblem] = useState('');

  const forecastDate = useMemo(() => parseDay(dateStr), [dateStr]);
  // #355: a forecast is about the future and only as far as the projection reaches. A past date
  // used to return today's opening balance as its "forecast".
  const today = isoDay(new Date());
  const horizon = projection.length ? isoDay(new Date(new Date(projection[projection.length - 1].end).getTime() - 1)) : undefined;
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
      {!data.hasAccounts && (
        <Notice
          tone="info"
          text={t('sav.noAccounts')}
          action={
            <button
              type="button"
              onClick={() => setShowAccountsModal(true)}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--color-cyan)] hover:underline"
            >
              <Pencil size={11} /> {t('common.edit')} {t('reports.accounts')}
            </button>
          }
        />
      )}
      {baseline.basis !== 'none' && baseline.incomeMonths < baseline.months / 2 && (
        <Notice tone="info" text={t('sav.incomeSparse', { n: baseline.incomeMonths, m: baseline.months })} />
      )}

      {/* ── Forecast hero ───────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-3 gap-3 mb-4">
        <div className="md:col-span-2 bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <span className="flex items-center gap-1.5 text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
              <Wallet size={12} /> {t('sav.forecastTitle')}
              <button
                type="button"
                onClick={() => setShowAccountsModal(true)}
                className="ml-2 text-[11px] normal-case text-[color:var(--color-accent)] hover:underline flex items-center gap-1"
                title={t('reports.accounts')}
              >
                <Pencil size={10} /> {t('reports.accounts')}
              </button>
            </span>
            <label className="flex items-center gap-2 text-[11px] text-[color:var(--color-text-dim)]">
              {t('sav.pickDate')}
              <span className="w-36">
                <DateInput value={dateStr} onValueChange={setDateStr} min={today} max={horizon} className="py-1 text-[11px]" />
              </span>
            </label>
          </div>
          {dateStr && dateStr < today ? (
            <p className="text-sm text-[color:var(--color-text-dim)]">{t('sav.pastDate')}</p>
          ) : forecast === null ? (
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
          <p className="text-[11px] text-[color:var(--color-text-faint)] mt-2">{basisNote}</p>
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
            <p className="text-[11px] text-[color:var(--color-text-faint)] mb-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
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
          <label className="flex flex-col gap-1 text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('sav.planAmount')}
            <input
              type="number"
              min="0"
              step="1"
              value={planAmount}
              onChange={(e) => setPlanAmount(e.target.value)}
              placeholder="5000"
              className={cn(compactControlClass, 'w-32')}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('sav.planDate')}
            <DateInput value={planDate} onValueChange={setPlanDate} onProblemChange={setPlanDateProblem} min={today} className="py-1.5 normal-case tracking-normal" />
          </label>
          {adHoc && <SaveAsGoal amount={Number(planAmount)} date={planDate} dateProblem={planDateProblem} />}
        </div>
        {adHoc ? <PlanReadout plan={adHoc} levers={levers} /> : <p className="text-xs text-[color:var(--color-text-faint)]">{t('sav.planHint')}</p>}
        {adHoc && aiOn && <AiPlanPanel key={`${planAmount}|${planDate}`} request={{ target: Number(planAmount), targetDate: planDate || null }} goalTitle="" />}
      </Card>

      {/* ── Goals, each answered by the same engine ─────────────────────── */}
      <Card title={t('sav.goals')}>
        {goals.length === 0 ? (
          <p className="text-xs text-[color:var(--color-text-faint)]">{t('sav.noGoals')}</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {goals.map((g) => (
              <GoalPlanCard key={g._id} goal={g} data={data} aiOn={aiOn} />
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

      <AssetAccountsModal
        open={showAccountsModal}
        onClose={() => setShowAccountsModal(false)}
        initialAccounts={data.accounts || {}}
        onSaved={() => router.refresh()}
      />
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
          <p className="text-[11px] text-[color:var(--color-text-faint)] mb-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
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
          <p className="text-[11px]" style={{ color: cover.closes ? 'var(--color-accent)' : 'var(--color-text-faint)' }}>
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
function GoalPlanCard({ goal, data, aiOn }: { goal: SavingsGoal; data: SavingsData; aiOn: boolean }) {
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
          <p className="text-[11px] text-[color:var(--color-text-faint)] mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
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
      {aiOn && plan.verdict !== 'reached' && <AiPlanPanel request={{ goalId: goal._id }} goalTitle={goal.title} />}

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
            className={cn(compactControlClass, 'flex-1 min-w-0')}
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

/** "Plan it with AI": a few steps with amounts and the month the goal is reached, a box to
 *  ask more (the plan comes back adjusted), and one click to put the steps on Tasks. */
function AiPlanPanel({ request, goalTitle }: { request: Pick<AiPlanInput, 'goalId' | 'target' | 'targetDate'>; goalTitle: string }) {
  const t = useT();
  const locale = useLocale();
  const money = useMoney();
  // 200 stays "200", 53.4 reads "53.40".
  const amount = (n: number) => money(n, undefined, Number.isInteger(n) ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [pending, startTransition] = useTransition();
  const [plan, setPlan] = useState<AiPlan | null>(null);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [added, setAdded] = useState(0);

  function run(q?: string) {
    setError('');
    startTransition(async () => {
      const r = await aiSavingsPlan({ ...request, locale, question: q, previous: q ? plan : null });
      if (r.ok) {
        setPlan(r.plan);
        setAdded(0);
        setQuestion('');
      } else setError(r.error);
    });
  }
  function toTasks() {
    if (!plan) return;
    startTransition(async () => {
      const r = await addPlanStepsAsTasks({ goalTitle, steps: plan.steps });
      setAdded(r.created);
    });
  }

  if (!plan) {
    return (
      <div className="mt-2.5">
        <Button size="sm" onClick={() => run()} disabled={pending}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} className="text-[color:var(--color-purple)]" />}
          {pending ? t('sav.aiThinking') : t('sav.aiPlan')}
        </Button>
        {error && <p role="alert" className="mt-1.5 text-[11px] text-[color:var(--color-red)]">{error}</p>}
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-xl border border-[color:var(--color-purple)]/30 bg-[color:var(--color-surface)] p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[color:var(--color-purple)]">
        <Sparkles size={12} /> {t('sav.aiPlanTitle')}
        {plan.reachBy && (
          <span className="ml-auto font-normal text-[color:var(--color-text-dim)]">
            {t('sav.aiReachBy', { d: formatDate(`${plan.reachBy}-01T12:00:00Z`, locale, { month: 'long', year: 'numeric' }) })}
          </span>
        )}
      </p>
      {plan.summary && <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--color-text)]">{plan.summary}</p>}
      <ol className="mt-2.5 space-y-2">
        {plan.steps.map((s, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-purple)]/15 text-[10px] font-bold text-[color:var(--color-purple)]">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold">{s.title}</span>
                {s.perMonth != null && s.perMonth > 0 && (
                  <span className="shrink-0 text-[11px] tabular-nums text-[color:var(--color-accent)]" style={{ fontFamily: 'var(--font-mono)' }}>
                    {t('sav.aiPerMonth', { x: amount(s.perMonth) })}
                  </span>
                )}
              </div>
              {s.detail && <p className="text-[11px] leading-relaxed text-[color:var(--color-text-dim)]">{s.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" onClick={toTasks} disabled={pending || added > 0}>
          {added > 0 ? <Check size={13} /> : <ListChecks size={13} />}
          {added > 0 ? t('sav.aiAdded', { n: added }) : t('sav.aiToTasks')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => run()} disabled={pending}>
          {t('sav.aiAgain')}
        </Button>
      </div>
      <form
        className="mt-2.5 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim()) run(question.trim());
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t('sav.aiAskPh')}
          aria-label={t('sav.aiAsk')}
          maxLength={500}
          className={cn(compactControlClass, 'min-w-0 flex-1')}
        />
        <Button size="sm" type="submit" disabled={pending || !question.trim()}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : t('sav.aiAsk')}
        </Button>
      </form>
      {error && <p role="alert" className="mt-1.5 text-[11px] text-[color:var(--color-red)]">{error}</p>}
      <p className="mt-2 text-[10px] text-[color:var(--color-text-faint)]">{t('sav.aiNote')}</p>
    </div>
  );
}

/** Turn the answer on screen into something the app will keep tracking. */
function SaveAsGoal({ amount, date, dateProblem }: { amount: number; date: string; dateProblem: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  function save() {
    if (dateProblem) {
      setError(dateProblem);
      return;
    }
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
        <label className="flex flex-col gap-1 text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {t('sav.newGoalTitle')}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder={t('sav.newGoalPlaceholder')}
            className={cn(compactControlClass, 'w-44')}
          />
        </label>
        <button
          onClick={save}
          disabled={pending || !!dateProblem}
          className="px-3 py-1.5 rounded-lg text-xs bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/20 disabled:opacity-50 flex items-center gap-1.5"
        >
          <Check size={13} /> {t('sav.saveAsGoal')}
        </button>
      </div>
      {(error || dateProblem) && <p role="alert" className="text-[11px] text-[color:var(--color-red)]">{error || dateProblem}</p>}
    </div>
  );
}

function Notice({ tone, text, action }: { tone: 'info' | 'warn'; text: string; action?: React.ReactNode }) {
  const color = tone === 'warn' ? 'var(--color-gold)' : 'var(--color-cyan)';
  return (
    <div className="mb-3 rounded-xl border p-3 flex items-start gap-2" style={{ borderColor: `color-mix(in srgb, ${color} 25%, transparent)`, background: `color-mix(in srgb, ${color} 7%, transparent)` }}>
      <AlertTriangle size={13} className="shrink-0 mt-0.5" style={{ color }} />
      <div className="text-[11px] text-[color:var(--color-text-dim)]">
        <p>{text}</p>
        {action}
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub: string; accent?: string }) {
  return (
    <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-[11px] text-[color:var(--color-text-faint)] mb-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)', color: accent }}>
        {value}
      </div>
      <div className="text-[11px] text-[color:var(--color-text-faint)] mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
        {sub}
      </div>
    </div>
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

function Empty({ text }: { text: string }) {
  return <div className="h-[180px] flex items-center justify-center text-xs text-[color:var(--color-text-faint)]">{text}</div>;
}
