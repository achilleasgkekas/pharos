// Deterministic "Month in Review" digest (P3 MVP). No AI: composes the already-
// tested budget-exceeded (P24) and price-hike (P14) detectors plus a plain
// spend/income roll-up into one narrative + structured summary for a given month.
// Pure + framework-free so it unit-tests without a DB — the caller (Reports page)
// feeds it the Expense rows and Item warranty rows it already fetched, so this
// adds zero new DB round-trips. AI-generated prose is a possible later upgrade
// (SaaS-metered); this v1 is template text, free on every tier.

import { detectBudgetExceeded, type BudgetAlertRow, type BudgetExceeded } from './budgetAlert';
import { detectPriceHikes, type HikeEntry, type PriceHike, type DetectHikesOptions } from './priceHike';
import { monthKeyOfDate } from './reportWindow';

export type MonthReviewRow = BudgetAlertRow & HikeEntry & { period?: string | null };

export type MonthReviewWarrantyRow = { title?: string | null; warrantyUntil?: string | Date | null };

export type ExpiringWarranty = { title: string; days: number };

export type MonthReview = {
  monthKey: string;
  totalSpent: number;
  totalIncome: number;
  net: number;
  prevMonthSpent: number;
  /** Integer percent change in spend vs the prior month, or null with no prior data. */
  pctChange: number | null;
  topCategory: { name: string; amount: number } | null;
  overBudget: BudgetExceeded[];
  priceChanges: PriceHike[];
  warrantiesExpiringSoon: ExpiringWarranty[];
  narrative: string;
};

export type BuildMonthReviewOptions = {
  monthKey: string;
  budgets?: Record<string, number> | null;
  warranties?: MonthReviewWarrantyRow[] | null;
  /** Warranty look-ahead window in days. Default 90 (same window as get_overview/Reports). */
  warrantyWindowDays?: number;
  /** Reference "now" for the warranty countdown. Default `new Date()`. */
  now?: Date;
  hikeOpts?: DetectHikesOptions;
};

/** The stored date's own month, in the frame it was written in (#242). `null` rather than ''
 *  because the callers below branch on "no month at all". */
function monthKeyOf(d: string | Date | null | undefined): string | null {
  return monthKeyOfDate(d) || null;
}

function prevMonthKeyOf(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, (m || 1) - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function buildMonthReview(rows: MonthReviewRow[] | null | undefined, opts: BuildMonthReviewOptions): MonthReview {
  const monthKey = opts.monthKey;
  const prevMonthKey = prevMonthKeyOf(monthKey);

  let totalSpent = 0;
  let totalIncome = 0;
  let prevMonthSpent = 0;
  const catMap = new Map<string, number>();

  for (const r of rows ?? []) {
    const amount = Number(r.amount ?? 0);
    if (!(amount > 0)) continue;
    const mk = r.period && /^\d{4}-\d{2}$/.test(r.period) ? r.period : monthKeyOf(r.date);
    if (mk === monthKey) {
      if (r.kind === 'income') {
        totalIncome += amount;
      } else {
        totalSpent += amount;
        const cat = (r.category || 'other').trim() || 'other';
        catMap.set(cat, (catMap.get(cat) ?? 0) + amount);
      }
    } else if (mk === prevMonthKey && r.kind !== 'income') {
      prevMonthSpent += amount;
    }
  }

  const topEntry = [...catMap.entries()].sort((a, b) => b[1] - a[1])[0];
  const topCategory = topEntry ? { name: topEntry[0], amount: Math.round(topEntry[1]) } : null;
  const pctChange = prevMonthSpent > 0 ? Math.round(((totalSpent - prevMonthSpent) / prevMonthSpent) * 100) : null;

  const overBudget = detectBudgetExceeded(rows, opts.budgets, monthKey);

  const priceChanges = detectPriceHikes(rows, opts.hikeOpts).filter((h) => monthKeyOf(h.date) === monthKey);

  const now = opts.now ?? new Date();
  const windowDays = opts.warrantyWindowDays ?? 90;
  const warrantiesExpiringSoon: ExpiringWarranty[] = (opts.warranties ?? [])
    .filter((w) => w.warrantyUntil)
    .map((w) => {
      const t = new Date(w.warrantyUntil as string).getTime();
      return { title: (w.title || '—').trim() || '—', days: Math.ceil((t - now.getTime()) / 86400000) };
    })
    .filter((w) => !isNaN(w.days) && w.days >= 0 && w.days <= windowDays)
    .sort((a, b) => a.days - b.days);

  const net = totalIncome - totalSpent;

  const parts: string[] = [];
  parts.push(
    `You spent €${Math.round(totalSpent)} this month` +
      (totalIncome > 0 ? `, with €${Math.round(totalIncome)} income (net €${Math.round(net)}).` : '.'),
  );
  if (pctChange != null) parts.push(`That's ${pctChange >= 0 ? 'up' : 'down'} ${Math.abs(pctChange)}% vs last month.`);
  if (topCategory) parts.push(`Top category: ${topCategory.name} (€${topCategory.amount}).`);
  if (overBudget.length) {
    parts.push(`Over budget: ${overBudget.map((b) => `${b.category} (€${b.actual}/€${b.budget})`).join(', ')}.`);
  }
  if (priceChanges.length) {
    const label = priceChanges.length > 1 ? 'charges' : 'charge';
    parts.push(
      `${priceChanges.length} recurring ${label} changed: ${priceChanges
        .slice(0, 3)
        .map((p) => `${p.vendor} ${p.direction === 'up' ? '+' : ''}${p.deltaPct}%`)
        .join(', ')}.`,
    );
  }
  if (warrantiesExpiringSoon.length) {
    const label = warrantiesExpiringSoon.length > 1 ? 'warranties' : 'warranty';
    parts.push(`${warrantiesExpiringSoon.length} ${label} expiring within ${windowDays} days.`);
  }
  if (!overBudget.length && !priceChanges.length && !warrantiesExpiringSoon.length) parts.push('Nothing unusual to flag.');

  return {
    monthKey,
    totalSpent: Math.round(totalSpent),
    totalIncome: Math.round(totalIncome),
    net: Math.round(net),
    prevMonthSpent: Math.round(prevMonthSpent),
    pctChange,
    topCategory,
    overBudget,
    priceChanges,
    warrantiesExpiringSoon,
    narrative: parts.join(' '),
  };
}
