// The period a Reports page shows, and the one it is compared with.
//
// A period is a run of whole months, [start, end] as 'YYYY-MM' keys, because every report bucket
// is a month (receipts and expenses are summed per month already, see reportWindow.ts). The
// comparison period is the run of the same length just before it: "this month" against last
// month, "this year" against the same months last year, "Mar–May" against "Dec–Feb".

export const PERIOD_PRESETS = ['this-month', 'last-month', '3m', '6m', '12m', 'this-year', 'last-year', 'custom'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export interface ReportPeriod {
  preset: PeriodPreset;
  /** First month inside the period, 'YYYY-MM'. */
  start: string;
  /** Last month inside the period, 'YYYY-MM' (inclusive). */
  end: string;
  /** Number of months, at least 1. */
  months: number;
  /** The comparison period: as long as this one, ending the month before `start`. */
  prevStart: string;
  prevEnd: string;
}

/** The longest custom period, so a typo like 1900-01 does not build a 1500-month axis. */
export const MAX_PERIOD_MONTHS = 60;

const KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 'YYYY-MM' moved by n months. */
export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + n, 1));
}

/** Months from a to b inclusive (1 when equal); negative when b is before a. */
export function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am) + 1;
}

/** Whether a 'YYYY-MM' key is inside [start, end]. An empty or malformed key is outside. */
export function inPeriod(key: string, start: string, end: string): boolean {
  return KEY.test(key) && key >= start && key <= end;
}

/** Every month key of [start, end], oldest first. */
export function periodMonths(start: string, end: string): string[] {
  const n = Math.max(1, monthsBetween(start, end));
  return Array.from({ length: n }, (_, i) => addMonths(start, i));
}

function build(preset: PeriodPreset, start: string, end: string): ReportPeriod {
  const months = Math.max(1, monthsBetween(start, end));
  const prevEnd = addMonths(start, -1);
  return { preset, start, end, months, prevStart: addMonths(prevEnd, -(months - 1)), prevEnd };
}

/**
 * The period asked for in the URL: `?period=this-year`, `?period=custom&from=2026-01&to=2026-03`,
 * or the older `?months=6|12|24` links. Anything unknown falls back to the last 12 months.
 */
export function resolveReportPeriod(
  q: { period?: string | null; from?: string | null; to?: string | null; months?: string | null },
  now: Date
): ReportPeriod {
  const cur = monthKey(now);
  const year = now.getFullYear();
  const legacy = { '6': '6m', '12': '12m', '24': '24m' } as Record<string, string>;
  const preset = (q.period || (q.months && legacy[q.months]) || '12m') as string;
  switch (preset) {
    case 'this-month':
      return build('this-month', cur, cur);
    case 'last-month': {
      const last = addMonths(cur, -1);
      return build('last-month', last, last);
    }
    case '3m':
      return build('3m', addMonths(cur, -2), cur);
    case '6m':
      return build('6m', addMonths(cur, -5), cur);
    case '24m':
      // Not offered as a button any more, but old links keep working.
      return build('custom', addMonths(cur, -23), cur);
    case 'this-year':
      return build('this-year', `${year}-01`, cur);
    case 'last-year':
      return build('last-year', `${year - 1}-01`, `${year - 1}-12`);
    case 'custom': {
      let from = q.from && KEY.test(q.from) ? q.from : '';
      let to = q.to && KEY.test(q.to) ? q.to : '';
      if (!from && !to) break;
      if (!from) from = to;
      if (!to) to = from;
      if (from > to) [from, to] = [to, from];
      if (to > cur) to = cur;
      if (from > to) from = to;
      if (monthsBetween(from, to) > MAX_PERIOD_MONTHS) from = addMonths(to, -(MAX_PERIOD_MONTHS - 1));
      return build('custom', from, to);
    }
  }
  return build('12m', addMonths(cur, -11), cur);
}

/** The query string that reopens a period (for links between tabs and to list pages). */
export function periodQuery(p: Pick<ReportPeriod, 'preset' | 'start' | 'end'>): string {
  return p.preset === 'custom' ? `period=custom&from=${p.start}&to=${p.end}` : `period=${p.preset}`;
}

/** Percentage change from `prev` to `cur`, rounded; null when there is nothing to compare with. */
export function pctChange(cur: number, prev: number): number | null {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

/** "Mar 2026" or "Jan – Mar 2026", for a filter chip on a list page. */
export function monthRangeLabel(r: { from: string; to: string }, locale: string): string {
  const fmt = (key: string, withYear: boolean) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(locale, withYear ? { month: 'short', year: 'numeric' } : { month: 'short' });
  };
  if (r.from === r.to) return fmt(r.from, true);
  const sameYear = r.from.slice(0, 4) === r.to.slice(0, 4);
  return `${fmt(r.from, !sameYear)} – ${fmt(r.to, true)}`;
}

/** The first and last day of a month range, 'YYYY-MM-DD', for a list filtered by day. */
export function monthRangeDays(r: { from: string; to: string }): { dateFrom: string; dateTo: string } {
  const [y, m] = r.to.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { dateFrom: `${r.from}-01`, dateTo: `${r.to}-${String(last).padStart(2, '0')}` };
}
