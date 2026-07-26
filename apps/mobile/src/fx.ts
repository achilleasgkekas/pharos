// Multi-currency (P9), mobile mirror of apps/web/src/lib/fx.ts.
//
// Kept tiny and local on purpose (same choice as the split helpers in MoneyScreen): there is
// no shared package between web and mobile, and the app only needs the read-side rules plus
// the two conversions the form previews. The AUTHORITY stays on the server — every write
// sends the printed amount and lets the route's resolveFx() decide what gets stored.
//
// The invariant to remember while reading a screen: `amount` on any money record is already
// the deployment's base currency. `currency`/`origAmount`/`fxRate` only describe what the
// paper said, and both numbers are 0 on an ordinary entry.
import { CUR } from './ui';

type FxDoc = { currency?: string | null; origAmount?: number | null; fxRate?: number | null };

/** Uppercase a 3-letter ISO 4217 code; '' for anything else (blank, junk, wrong length). */
export function normalizeCurrency(code?: string | null): string {
  const c = (code ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : '';
}

/** Is this record in a currency other than the deployment's base one? */
export function isForeign(code: string | null | undefined, base: string): boolean {
  const c = normalizeCurrency(code);
  const b = normalizeCurrency(base) || 'EUR';
  return c !== '' && c !== b;
}

/**
 * A STORED record whose `amount` is not really base currency: foreign, printed figure known,
 * but no rate yet, so its number silently joins base-currency totals. This is what the gold
 * badge warns about (mirrors needsFxRate() on the web).
 */
export function needsRate(e: FxDoc, base: string): boolean {
  if (!isForeign(e.currency, base)) return false;
  return (Number(e.origAmount) || 0) > 0 && (Number(e.fxRate) || 0) <= 0;
}

/** Printed amount x rate, rounded to cents. Rate <= 0 (unknown) converts nothing. */
export function convertToBase(origAmount: number, fxRate: number): number {
  const a = Number(origAmount);
  const r = Number(fxRate);
  if (!Number.isFinite(a) || !Number.isFinite(r) || r <= 0) return 0;
  return Math.round(a * r * 100) / 100;
}

/**
 * Inverse of convertToBase: the printed figure behind a stored base-currency one. Needed by
 * records that carry MORE than one amount (an item's price/target/paid trio), where only the
 * anchor keeps its printed value in `origAmount` and the rest are stored converted. Rate <= 0
 * (unknown) means nothing was converted, so pass through.
 */
export function toPrinted(baseAmount: number, fxRate: number): number {
  const a = Number(baseAmount);
  const r = Number(fxRate);
  if (!Number.isFinite(a)) return 0;
  if (!Number.isFinite(r) || r <= 0) return a;
  return Math.round((a / r) * 100) / 100;
}

/** Back out the rate from "$88 hit my card as EUR 81.20" -> 0.922727. 6dp, like the web. */
export function deriveFxRate(origAmount: number, baseAmount: number): number {
  const a = Number(origAmount);
  const b = Number(baseAmount);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return 0;
  return Math.round((b / a) * 1e6) / 1e6;
}

/**
 * Chip text for a foreign record: `$88.00 @ 0.92`, or just `$88.00` while the rate is
 * missing. '' when there is nothing foreign to show, so callers render it unconditionally.
 */
export function fxBadgeLabel(e: FxDoc, base: string): string {
  if (!isForeign(e.currency, base)) return '';
  const orig = Number(e.origAmount) || 0;
  if (orig <= 0) return '';
  const code = normalizeCurrency(e.currency);
  const printed = `${CUR[code] || code + ' '}${orig.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const rate = Number(e.fxRate) || 0;
  // Trim trailing zeros so 0.920000 reads as 0.92 but 0.008512 keeps its precision.
  return rate > 0 ? `${printed} @ ${String(Number(rate.toFixed(6)))}` : printed;
}

/**
 * The figure to put in an edit form's amount field: a foreign record is edited in the
 * currency it was printed in (origAmount), an ordinary one in its stored amount. Without
 * this a re-save would send the CONVERTED number as if it were printed and convert it twice.
 */
export function printedAmount(e: { amount?: number | null } & FxDoc, base: string): number {
  if (isForeign(e.currency, base)) {
    const orig = Number(e.origAmount) || 0;
    if (orig > 0) return orig;
  }
  return Number(e.amount) || 0;
}
