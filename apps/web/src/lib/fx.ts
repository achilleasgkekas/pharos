// Multi-currency (P9) — the base-currency rule lives here, in ONE pure place.
//
// INVARIANT: `amount` on a money document is ALWAYS denominated in the deployment's
// base currency (Settings -> Currency). Every aggregation in the app (reports, budgets,
// cash flow, anomaly medians, split shares, net worth) sums `amount` directly, so keeping
// it base-denominated means multi-currency costs single-currency users exactly nothing
// and needs no migration. A foreign-currency document additionally remembers what was
// PRINTED on it:
//   currency    ISO code as printed (e.g. 'USD'); equals the base code when not foreign
//   origAmount  the printed number (88); 0 when not foreign
//   fxRate      base units per 1 unit of `currency` (0.92) -> amount = origAmount * fxRate
//
// When the rate is unknown (fxRate 0) we do NOT invent one: `amount` stays equal to the
// printed number, which is byte-for-byte today's behaviour, so no stored total silently
// shifts. `needsRate` then tells the UI to ask for a rate instead of quietly mixing
// currencies in a sum (the bug this module exists to make visible).
//
// Pure and client-safe (imported by the Expenses form for the live preview): no node
// imports, no DB, no fetch. FX rates are entered by the user; an automatic rate feed is
// a later phase.
import { currencySymbol } from './money';

export type FxInput = {
  /** The number the user typed / the AI parsed. Printed-currency amount when foreign. */
  amount: number;
  /** ISO 4217 code as printed on the document. Blank / base code = not foreign. */
  currency?: string | null;
  /** Base units per 1 unit of `currency`. 0 / missing = unknown. */
  fxRate?: number | null;
};

export type FxResolved = {
  /** ALWAYS base currency — this is what gets stored in `amount` and summed everywhere. */
  amount: number;
  /** Normalized code; the base code when the entry is not foreign. */
  currency: string;
  /** Printed amount; 0 when not foreign. */
  origAmount: number;
  /** Rate used; 0 when not foreign or still unknown. */
  fxRate: number;
  /** Foreign entry with no rate yet -> `amount` is NOT really base currency. */
  needsRate: boolean;
};

/** Uppercase a 3-letter ISO 4217 code; '' for anything else (blank, junk, wrong length). */
export function normalizeCurrency(code?: string | null): string {
  const c = (code ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : '';
}

/** Is this document in a currency other than the deployment's base one? */
export function isForeignCurrency(code: string | null | undefined, base: string): boolean {
  const c = normalizeCurrency(code);
  const b = normalizeCurrency(base) || 'EUR';
  return c !== '' && c !== b;
}

/** Printed amount x rate, rounded to cents (money is stored to 2dp everywhere). */
export function convertToBase(origAmount: number, fxRate: number): number {
  const a = Number(origAmount);
  const r = Number(fxRate);
  if (!Number.isFinite(a) || !Number.isFinite(r) || r <= 0) return 0;
  return Math.round(a * r * 100) / 100;
}

/**
 * Back out the rate from a pair of amounts, for the (common) case where the user knows
 * what the bank actually charged them: "$88 hit my card as EUR 81.20" -> 0.922727.
 * 6dp keeps cent-accuracy on amounts up to ~10k without storing float noise.
 */
export function deriveFxRate(origAmount: number, baseAmount: number): number {
  const a = Number(origAmount);
  const b = Number(baseAmount);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return 0;
  return Math.round((b / a) * 1e6) / 1e6;
}

/**
 * The one conversion decision. Given what the user entered plus the deployment's base
 * currency, return the fields to store. Same-currency input passes straight through
 * (origAmount/fxRate stay 0), so a single-currency deployment is untouched.
 */
export function resolveFx(input: FxInput, base: string): FxResolved {
  const b = normalizeCurrency(base) || 'EUR';
  const amount = Number(input.amount) || 0;
  if (!isForeignCurrency(input.currency, b)) {
    return { amount, currency: b, origAmount: 0, fxRate: 0, needsRate: false };
  }
  const currency = normalizeCurrency(input.currency);
  const rate = Number(input.fxRate) || 0;
  if (rate <= 0) {
    // Unknown rate: keep the printed number as-is and flag it, rather than guessing 1:1.
    return { amount, currency, origAmount: amount, fxRate: 0, needsRate: true };
  }
  return { amount: convertToBase(amount, rate), currency, origAmount: amount, fxRate: rate, needsRate: false };
}

/** `$88.00` — symbol + 2dp, for showing the printed amount next to the base one. */
export function formatMoney(amount: number, code: string): string {
  const n = Number(amount);
  return `${currencySymbol(code)}${(Number.isFinite(n) ? n : 0).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Compact chip text for a foreign entry: `$88.00 @ 0.92` (or `$88.00 · rate?` when the
 * rate is still missing). Returns '' when there is nothing foreign to show, so callers
 * can render it unconditionally.
 */
export function fxBadgeLabel(
  e: { currency?: string | null; origAmount?: number | null; fxRate?: number | null },
  base: string
): string {
  if (!isForeignCurrency(e.currency, base)) return '';
  const orig = Number(e.origAmount) || 0;
  if (orig <= 0) return '';
  const printed = formatMoney(orig, normalizeCurrency(e.currency));
  const rate = Number(e.fxRate) || 0;
  // Trim trailing zeros so 0.920000 reads as 0.92 but 0.008512 keeps its precision.
  return rate > 0 ? `${printed} @ ${String(Number(rate.toFixed(6)))}` : printed;
}
