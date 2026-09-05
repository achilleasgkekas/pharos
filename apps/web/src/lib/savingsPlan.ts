// P-savings — pure, DB-free engine behind the Save tab: what a month of your money
// normally looks like, what the balance will be on a date, and whether a target is
// reachable by its deadline. Deterministic, zero AI, `now` injectable for tests.
//
// lib/safeToSpend.ts answers "what can I spend for the rest of this month?" from the
// 3-month agenda of DATED events, and explicitly parks the variable-spend side as
// phase 2. This is that phase, and it needs the opposite input: not the handful of
// charges we can name in advance, but what actually leaves the account in an average
// month — the groceries, the fuel, the small stuff nobody schedules. The only honest
// source for that is your own history, so the baseline is measured, never assumed.
//
// Three decisions worth stating, because they are what keep the forecast from lying:
//
//  1. MEDIAN, not mean. One holiday, one boiler repair or one bonus should not become
//     your new normal; the median of a handful of months absorbs the outlier that an
//     average happily projects into every month to come.
//  2. Complete months only. The current month is a fraction of itself — counting it
//     would drag every figure down by however far into the month you happen to be.
//  3. The baseline is a WHOLE picture, not a sum of parts. Historic spend already
//     contains the subscriptions, the bills and the instalments, so adding those on
//     top would charge you for them twice. The one thing history provably overstates
//     is an obligation that ENDS — a card instalment with three payments left is in
//     every month behind you and in none of the months after the third — so ending
//     obligations, and only they, bend the line as it goes forward.
//
// Everything here is an estimate and the shapes say so out loud: `basis` reports how
// much history the numbers stand on and `incomeMonths` how often income was actually
// recorded, so the UI can show a thin forecast as thin instead of as a fact.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Months of history the baseline looks at. Recent behaviour beats ancient behaviour. */
export const BASELINE_WINDOW = 6;
/** Below this many complete months a median means little; the basis drops to 'thin'. */
export const MIN_MONTHS_FOR_MEDIAN = 3;
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** 'YYYY-MM' for a date, the key every month-bucketed figure in the app is filed under. */
export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 'Mar 27' — same short form the reports charts label their axes with. */
export function monthLabelOf(d: Date): string {
  return `${MN[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

/** One complete month of the ledger. `key` is 'YYYY-MM'; both figures are positive. */
export type MonthTotals = { key: string; income: number; expense: number };

/** A ledger row as the Expense collection stores it, before it is bucketed by month. */
export type LedgerEntry = { kind?: string; amount?: number; date?: string | Date | null; period?: string };

/**
 * Bucket ledger rows into complete monthly totals.
 *
 * Filed by `period` ('YYYY-MM') when the row carries one and by its date otherwise —
 * the same rule /reports uses for its cash-flow chart, so the forecast and the chart it
 * is measured from can never disagree about which month a row belongs to. Rows with
 * neither, and rows with no positive amount, are dropped rather than guessed at.
 */
export function monthTotalsFrom(entries: LedgerEntry[]): MonthTotals[] {
  const byMonth = new Map<string, { income: number; expense: number }>();
  for (const e of entries) {
    const amount = Number(e?.amount) || 0;
    if (amount <= 0) continue;
    let key = e.period && /^\d{4}-\d{2}$/.test(e.period) ? e.period : '';
    if (!key && e.date) {
      const d = new Date(e.date);
      if (!Number.isNaN(d.getTime())) key = monthKeyOf(d);
    }
    if (!key) continue;
    let row = byMonth.get(key);
    if (!row) byMonth.set(key, (row = { income: 0, expense: 0 }));
    if (e.kind === 'income') row.income += amount;
    else row.expense += amount;
  }
  return [...byMonth.entries()]
    .map(([key, v]) => ({ key, income: round2(v.income), expense: round2(v.expense) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** How much history a baseline stands on. */
export type BaselineBasis =
  | 'none' // nothing to measure — no complete month has any money in it
  | 'thin' // 1-2 months: an average of what little there is, not yet a pattern
  | 'history'; // enough months for a median to mean something

export type Baseline = {
  basis: BaselineBasis;
  /** Complete months the figures were measured over. */
  months: number;
  /** Of those, how many actually recorded income — a forecast built on 1 of 6 is a guess. */
  incomeMonths: number;
  income: number;
  spend: number;
  /** income − spend: what a normal month leaves behind (negative = you are eating capital). */
  net: number;
};

const EMPTY_BASELINE: Baseline = { basis: 'none', months: 0, incomeMonths: 0, income: 0, spend: 0, net: 0 };

/** Middle value of a sorted-by-value copy; the mean of the two middles on an even count. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * What a normal month looks like, measured over the last complete months of the ledger.
 *
 * Income and spend are taken as separate medians rather than a median of the monthly
 * net: a month where the salary was logged late would otherwise drag both sides of the
 * picture down at once, when only one of them moved.
 */
export function monthlyBaseline(
  history: MonthTotals[],
  opts: { now?: Date; window?: number } = {}
): Baseline {
  const now = opts.now ?? new Date();
  const window = opts.window ?? BASELINE_WINDOW;
  const currentKey = monthKeyOf(now);

  const complete = history
    .filter((m) => m.key < currentKey) // string compare is chronological for 'YYYY-MM'
    .filter((m) => (m.income || 0) > 0 || (m.expense || 0) > 0)
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-window);

  if (complete.length === 0) return EMPTY_BASELINE;

  const incomes = complete.map((m) => m.income || 0);
  const spends = complete.map((m) => m.expense || 0);
  const enough = complete.length >= MIN_MONTHS_FOR_MEDIAN;
  const pick = enough ? median : mean;

  const income = round2(pick(incomes));
  const spend = round2(pick(spends));
  return {
    basis: enough ? 'history' : 'thin',
    months: complete.length,
    incomeMonths: incomes.filter((v) => v > 0).length,
    income,
    spend,
    net: round2(income - spend),
  };
}

/**
 * A commitment that is inside the historic spend but runs out — a card instalment plan,
 * a loan with a known number of payments left. `monthsRemaining` counts from the current
 * month inclusive, so 1 means "this month is the last one".
 */
export type Obligation = { label: string; perMonth: number; monthsRemaining: number };

export type ProjectedMonth = {
  key: string;
  label: string;
  /** ISO instant the month's slice of the projection opens (today, for the first one). */
  start: string;
  /** ISO instant it closes — the first moment of the following month. */
  end: string;
  income: number;
  spend: number;
  net: number;
  openBalance: number;
  balance: number;
};

/**
 * Month-by-month balance from today to the horizon.
 *
 * The current month is included but PRORATED: two thirds of the way through it, only a
 * third of a normal month's income and spend are still to come. Without that, asking for
 * "the balance on the 28th" would credit you a whole month you have already lived.
 */
export function projectBalances(opts: {
  startBalance: number;
  baseline: Baseline;
  obligations?: Obligation[];
  months: number;
  now?: Date;
}): ProjectedMonth[] {
  const now = opts.now ?? new Date();
  const obligations = opts.obligations ?? [];
  const out: ProjectedMonth[] = [];
  let balance = opts.startBalance;

  for (let i = 0; i < Math.max(0, opts.months); i++) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    // Ending obligations drop out of the spend AFTER their last payment. `monthsRemaining`
    // counts the current month as 1, so index i is still paying while i < monthsRemaining.
    const stillPaying = obligations.reduce((s, o) => s + (i < o.monthsRemaining ? 0 : o.perMonth), 0);
    const fullSpend = Math.max(0, opts.baseline.spend - stillPaying);

    const start = i === 0 && now > monthStart ? now : monthStart;
    const span = monthEnd.getTime() - monthStart.getTime();
    const left = monthEnd.getTime() - start.getTime();
    const fraction = span > 0 ? Math.max(0, Math.min(1, left / span)) : 1;

    const income = round2(opts.baseline.income * fraction);
    const spend = round2(fullSpend * fraction);
    const net = round2(income - spend);
    const openBalance = round2(balance);
    balance = round2(balance + net);

    out.push({
      key: monthKeyOf(monthStart),
      label: monthLabelOf(monthStart),
      start: start.toISOString(),
      end: monthEnd.toISOString(),
      income,
      spend,
      net,
      openBalance,
      balance,
    });
  }
  return out;
}

/**
 * The balance projected for one specific day, interpolated inside its month — the
 * question "how much will I have on the 14th of March?" deserves the 14th's answer,
 * not the whole month's. Null for a date outside the projected horizon.
 */
export function balanceOn(projection: ProjectedMonth[], date: string | Date): number | null {
  const t = new Date(date).getTime();
  if (Number.isNaN(t) || projection.length === 0) return null;
  const first = projection[0];
  if (t <= new Date(first.start).getTime()) return round2(first.openBalance);

  for (const m of projection) {
    const start = new Date(m.start).getTime();
    const end = new Date(m.end).getTime();
    if (t >= end) continue;
    const span = end - start;
    const done = span > 0 ? Math.max(0, Math.min(1, (t - start) / span)) : 1;
    return round2(m.openBalance + m.net * done);
  }
  return null; // past the horizon — the caller decides whether to project further
}

/** Where a target stands against the money the forecast says you will actually have. */
export type SavingsVerdict =
  | 'reached' // already saved
  | 'on-track' // the deadline needs comfortably less than a normal month leaves over
  | 'tight' // reachable, but it takes nearly everything you have spare
  | 'short' // not by that date at this rate — `earliest` says when instead
  | 'no-surplus' // a normal month leaves nothing (or less than nothing) to put aside
  | 'unknown'; // no deadline, or no history to answer with

/** Above this share of the spare cash a deadline is reachable but leaves no room. */
const TIGHT_RATIO = 0.8;

export type SavingsPlan = {
  target: number;
  saved: number;
  remaining: number;
  targetDate: string | null;
  /** Fractional months from now to the deadline; null without one, 0 once it has passed. */
  monthsLeft: number | null;
  /** What hitting the deadline costs per month. Null without a deadline. */
  requiredPerMonth: number | null;
  /** What a normal month actually leaves over, floored at 0. */
  affordablePerMonth: number;
  /** required − affordable, floored at 0. */
  shortfallPerMonth: number;
  verdict: SavingsVerdict;
  /** ISO date the target is reached at the projected rate; null if not within the horizon. */
  earliest: string | null;
  /** What to actually put aside each month: the deadline's price when it is reachable,
   *  otherwise everything that is spare — saving what you can beats saving nothing. */
  suggestedPerMonth: number;
};

const AVG_DAYS_PER_MONTH = 30.44;

/**
 * Walk the projection banking each month's surplus until `remaining` is covered, and
 * return the day it happens. Uses the projection rather than a flat rate on purpose:
 * the month a card instalment ends is the month saving gets easier, and a plan that
 * cannot see that will keep telling you a target is out of reach when it is not.
 */
export function earliestDate(remaining: number, projection: ProjectedMonth[]): string | null {
  if (remaining <= 0) return projection[0] ? projection[0].start : null;
  let banked = 0;
  for (const m of projection) {
    const surplus = Math.max(0, m.net);
    if (surplus <= 0) continue;
    if (banked + surplus >= remaining) {
      const start = new Date(m.start).getTime();
      const end = new Date(m.end).getTime();
      const share = (remaining - banked) / surplus;
      return new Date(start + (end - start) * share).toISOString();
    }
    banked += surplus;
  }
  return null;
}

/**
 * Can this target be met by its date, what would it take, and when else could it happen.
 *
 * `saved` is money already put aside toward it (a Goal's contributions), so the answer is
 * always about what is still missing rather than the headline figure.
 */
export function planForTarget(opts: {
  target: number;
  saved?: number;
  targetDate?: string | Date | null;
  baseline: Baseline;
  projection?: ProjectedMonth[];
  now?: Date;
}): SavingsPlan {
  const now = opts.now ?? new Date();
  const target = Math.max(0, opts.target || 0);
  const saved = Math.max(0, opts.saved || 0);
  const remaining = round2(Math.max(0, target - saved));
  const affordablePerMonth = round2(Math.max(0, opts.baseline.net));
  const projection = opts.projection ?? [];

  const t = opts.targetDate ? new Date(opts.targetDate).getTime() : NaN;
  const hasDate = !Number.isNaN(t);
  const monthsLeft = hasDate ? Math.max(0, round2((t - now.getTime()) / MS_PER_DAY / AVG_DAYS_PER_MONTH)) : null;
  const requiredPerMonth =
    monthsLeft === null ? null : monthsLeft > 0 ? round2(remaining / monthsLeft) : remaining;

  const earliest = earliestDate(remaining, projection);

  let verdict: SavingsVerdict;
  if (remaining <= 0) verdict = 'reached';
  else if (opts.baseline.basis === 'none') verdict = 'unknown';
  else if (affordablePerMonth <= 0) verdict = 'no-surplus';
  else if (requiredPerMonth === null) verdict = 'unknown';
  else if (requiredPerMonth > affordablePerMonth) verdict = 'short';
  else if (requiredPerMonth > affordablePerMonth * TIGHT_RATIO) verdict = 'tight';
  else verdict = 'on-track';

  const shortfallPerMonth =
    requiredPerMonth === null ? 0 : round2(Math.max(0, requiredPerMonth - affordablePerMonth));

  const suggestedPerMonth =
    verdict === 'reached'
      ? 0
      : verdict === 'on-track' || verdict === 'tight'
        ? (requiredPerMonth as number)
        : affordablePerMonth;

  return {
    target,
    saved: round2(saved),
    remaining,
    targetDate: hasDate ? new Date(t).toISOString() : null,
    monthsLeft,
    requiredPerMonth,
    affordablePerMonth,
    shortfallPerMonth,
    verdict,
    earliest,
    suggestedPerMonth,
  };
}

/** Something you could stop paying for, with what it costs a month. */
export type Lever = { label: string; perMonth: number };

export type ShortfallCover = {
  picks: Lever[];
  /** Monthly cost of the picks. */
  covered: number;
  /** True when the picks close the gap on their own. */
  closes: boolean;
};

/**
 * The shortest list of things that would close a monthly gap, dearest first.
 *
 * Deliberately blunt and deterministic: it names what you are paying for and what it
 * costs, and stops as soon as the arithmetic works. It never decides that a €4
 * subscription matters less than a €40 one for any reason other than the number, and
 * it proposes nothing at all when there is no gap to close.
 */
export function coverShortfall(shortfallPerMonth: number, candidates: Lever[], limit = 5): ShortfallCover {
  if (shortfallPerMonth <= 0) return { picks: [], covered: 0, closes: true };
  const sorted = [...candidates].filter((c) => c.perMonth > 0).sort((a, b) => b.perMonth - a.perMonth);
  const picks: Lever[] = [];
  let covered = 0;
  for (const c of sorted) {
    if (covered >= shortfallPerMonth || picks.length >= limit) break;
    picks.push(c);
    covered = round2(covered + c.perMonth);
  }
  return { picks, covered, closes: covered >= shortfallPerMonth };
}
