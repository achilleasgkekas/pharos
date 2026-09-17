// Installment (δόσεις) tracking — derived on the fly from statement transactions.
// One physical purchase paid in N monthly installments shows up as one line per
// statement ("ΔΟΣΗ 3/12"). We group those lines back into a single plan so we can
// show payoff progress on the dashboard, reports, the statement, and the product.

import type { SerializedStatement, SerializedTransaction } from '@/types';
import { formatDate } from '@/lib/i18n/format';

export type InstallmentPlan = {
  key: string; // item:<id> when linked, else desc:<signature>
  signature: string; // merchant|total|origin — stable across statements & links
  itemIds: string[]; // linked products (one charge can cover several items from one receipt)
  label: string; // human label (original purchase description)
  card: string; // card label of the most recent charge
  perAmount: number; // typical monthly amount (positive)
  totalInstallments: number;
  paidInstallments: number; // highest installment number seen
  remainingInstallments: number;
  paidAmount: number; // sum of installment charges seen so far (positive)
  totalAmount: number; // perAmount * totalInstallments (estimate)
  remainingAmount: number;
  firstDate: string; // ISO
  lastDate: string; // ISO of the most recent charge
  projectedEndDate: string; // ISO — lastDate + remaining months
  done: boolean;
  occurrences: number; // number of statement lines found
  merged: boolean; // true if any charge was manually bound into this plan (planKey)
};

/** Strip the "X/Y" installment counter + punctuation so the same purchase across
 *  months collapses to one key. "ΔΟΣΗ APPLE WATCH 3/12" ≈ "ΔΟΣΗ APPLE WATCH 4/12". */
export function normalizeInstallmentDesc(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/δοση\s*\d+\s*\/\s*\d+/gi, '')
    .replace(/installment\s*\d+\s*\/\s*\d+/gi, '')
    .replace(/\d+\s*\/\s*\d+/g, '')
    .replace(/[^a-zα-ωά-ώ0-9 ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The month the purchase was made (installment #1), derived from the statement
 *  period and the current installment number. Stays constant across statements,
 *  so two same-merchant plans that started in different months stay separate.
 *  "PLAISIO 8/12" on 2026-04 and "PLAISIO 9/12" on 2026-05 → both origin 2025-09. */
export function installmentOrigin(period: string, currentInstallment?: number): string {
  const m = (period || '').match(/^(\d{4})-(\d{2})$/);
  if (!m || !currentInstallment) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1 - (currentInstallment - 1), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** A stable signature (merchant + total + origin month) used to recognise the
 *  same installment plan across statements, independent of any product link. */
export function installmentSignature(tx: SerializedTransaction, period: string): string {
  const base = normalizeInstallmentDesc(tx.installmentInfo?.originalPurchase || tx.description);
  const total = tx.installmentInfo?.totalInstallments || 0;
  const origin = installmentOrigin(period, tx.installmentInfo?.currentInstallment);
  return `${base}|${total}|${origin}`;
}

/** The grouping key for a transaction's installment plan. Linked charges group by
 *  product; unlinked ones group by signature. */
export function installmentKey(tx: SerializedTransaction, period: string): string | null {
  if (!tx.installmentInfo) return null;
  const sig = installmentSignature(tx, period);
  return sig.startsWith('|') ? null : `desc:${sig}`;
}

/** The effective grouping key for a charge: a manual planKey override (set when the
 *  user "merges" a differently-worded charge into a plan) wins; else the auto
 *  signature. Empty string when the charge isn't a recognisable installment. */
export function installmentGroupKey(tx: SerializedTransaction, period: string): string {
  if (!tx.installmentInfo) return '';
  if (tx.installmentInfo.planKey) return tx.installmentInfo.planKey;
  const sig = installmentSignature(tx, period);
  return sig.startsWith('|') ? '' : sig;
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

/** First day of a "YYYY-MM" period as ISO (UTC, so month math is timezone-safe). */
function periodStartISO(period: string): string {
  const m = (period || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return new Date().toISOString();
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toISOString();
}

type Acc = {
  key: string;
  signature: string;
  itemIds: Set<string>;
  label: string;
  card: string;
  totalInstallments: number;
  paidInstallments: number;
  paidAmount: number;
  perAmountAtMax: number; // amount at the highest installment number (most representative)
  lastPeriod: string; // statement period of the most recent installment charge
  firstDate: string;
  lastDate: string;
  occurrences: number;
  merged: boolean;
};

/** Build installment plans across all statements. */
export function computeInstallmentPlans(statements: SerializedStatement[]): InstallmentPlan[] {
  const map = new Map<string, Acc>();

  for (const s of statements) {
    for (const tx of s.transactions) {
      if (!tx.installmentInfo) continue;
      // Group by the stable signature ONLY (merchant|total|origin), so the same
      // purchase keeps merging across statements even after one of its lines is
      // linked to a product. A new statement's next installment (unlinked) then
      // joins the existing plan automatically and the product status advances.
      const sig = installmentSignature(tx, s.period);
      // A manual planKey override (set via "merge into another plan") wins, so a
      // differently-worded charge joins an existing plan. Else group by signature.
      const key = tx.installmentInfo.planKey || (sig.startsWith('|') ? '' : sig);
      if (!key) continue;
      const { currentInstallment, totalInstallments, originalPurchase } = tx.installmentInfo;
      const amount = Math.abs(tx.amount);

      const acc = map.get(key) ?? {
        key,
        signature: sig,
        itemIds: new Set<string>(),
        label: originalPurchase || tx.description,
        card: s.card,
        totalInstallments: 0,
        paidInstallments: 0,
        paidAmount: 0,
        perAmountAtMax: 0,
        lastPeriod: s.period,
        firstDate: tx.date,
        lastDate: tx.date,
        occurrences: 0,
        merged: false,
      };

      if (tx.installmentInfo.planKey) acc.merged = true;
      for (const id of tx.matchedItemIds ?? []) acc.itemIds.add(String(id));
      acc.totalInstallments = Math.max(acc.totalInstallments, totalInstallments || 0);
      acc.paidAmount += amount;
      acc.occurrences += 1;
      if ((currentInstallment || 0) >= acc.paidInstallments) {
        acc.paidInstallments = currentInstallment || acc.paidInstallments;
        acc.perAmountAtMax = amount || acc.perAmountAtMax;
        acc.lastPeriod = s.period; // payoff is projected from the latest charge's month
        acc.card = s.card;
      }
      if (new Date(tx.date) > new Date(acc.lastDate)) acc.lastDate = tx.date;
      if (new Date(tx.date) < new Date(acc.firstDate)) acc.firstDate = tx.date;

      map.set(key, acc);
    }
  }

  return [...map.values()]
    .map((a): InstallmentPlan => {
      const perAmount = a.perAmountAtMax || (a.occurrences ? a.paidAmount / a.occurrences : 0);
      const remainingInstallments = Math.max(0, a.totalInstallments - a.paidInstallments);
      const totalAmount = perAmount * a.totalInstallments;
      return {
        key: a.key,
        signature: a.signature,
        itemIds: [...a.itemIds],
        label: a.label,
        card: a.card,
        perAmount,
        totalInstallments: a.totalInstallments,
        paidInstallments: a.paidInstallments,
        remainingInstallments,
        paidAmount: a.paidAmount,
        totalAmount,
        remainingAmount: perAmount * remainingInstallments,
        firstDate: a.firstDate,
        lastDate: a.lastDate,
        // Payoff = month of the latest charge + the installments still to go
        projectedEndDate: addMonths(periodStartISO(a.lastPeriod), remainingInstallments),
        done: a.paidInstallments >= a.totalInstallments && a.totalInstallments > 0,
        occurrences: a.occurrences,
        merged: a.merged,
      };
    })
    .sort((x, y) => {
      // Active plans first, then by soonest payoff
      if (x.done !== y.done) return x.done ? 1 : -1;
      return new Date(x.projectedEndDate).getTime() - new Date(y.projectedEndDate).getTime();
    });
}

/** Plans linked to a specific product. */
export function plansForItem(plans: InstallmentPlan[], itemId: string): InstallmentPlan[] {
  return plans.filter((p) => p.itemIds.includes(itemId));
}

/** Month label like "Jun 2026" for compact UI. */
export function shortMonth(iso: string, locale = 'en'): string {
  return formatDate(iso, locale, { month: 'short', year: 'numeric' });
}
