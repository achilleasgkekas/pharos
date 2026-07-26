// Applying a missing exchange rate to an already-saved record (P9 slice 9).
//
// WHY THIS EXISTS: the audit of slice 7 (lib/fxAudit.ts) finds every foreign record whose
// rate is still unknown, but fixing one meant opening its module's edit form, and the six
// modules live on six different routes. This module holds the ONE rule for turning such a
// record into a converted one, so /reports can do it in place.
//
// THE SIMPLIFICATION THAT MAKES THIS SAFE: `resolveFx` refuses to invent a rate, so a
// record with `fxRate <= 0` was never converted — every money field on it is still the
// PRINTED figure (see lib/fx.ts). Applying a rate is therefore a plain multiplication, with
// no un-converting step, and `needsFxRate` is the guard that keeps it that way: a record
// that already has a rate returns null instead of being multiplied a second time.
//
// The set of fields multiplied per kind MIRRORS that module's own resolver, and the reason
// each module converts more than its headline is written next to each case below. Getting
// this list wrong is the one way this feature can corrupt data, so it is pure, DB-free and
// unit-tested.
import { convertToBase, needsFxRate } from './fx';
import type { FxIssueKind } from './fxAudit';

/** A lean money document; only the fields this module reads are relied upon. */
export type FxApplyDoc = Record<string, unknown>;

/**
 * A rate is base units per 1 foreign unit. The bounds reject typos (0, negative, absurd)
 * while still allowing real extremes: KWD->EUR is ~3, IDR->EUR is ~0.00006.
 */
export function isValidFxRate(rate: unknown): boolean {
  const r = Number(rate);
  return Number.isFinite(r) && r > 0 && r <= 1e6;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The `$set` patch that converts one record with `rate`, or null when it must not be
 * touched (invalid rate, or a record that is not actually waiting for one — including one
 * that already has a rate, which is what makes calling this twice harmless).
 *
 * Array fields are written as dotted paths (`transactions.3.amount`) rather than replaced
 * wholesale, so nothing else inside those subdocuments (installment info, product links,
 * line-item names) can be lost by this write.
 */
export function fxApplyPatch(
  kind: FxIssueKind,
  doc: FxApplyDoc,
  rate: number,
  base: string
): Record<string, unknown> | null {
  if (!isValidFxRate(rate)) return null;
  if (!needsFxRate(doc as { currency?: string; origAmount?: number; fxRate?: number }, base)) return null;

  const conv = (v: unknown): number => convertToBase(num(v), rate);
  // The headline comes from origAmount, the verbatim printed figure each module stores.
  const headline = conv(doc.origAmount);
  const patch: Record<string, unknown> = { fxRate: rate };

  switch (kind) {
    case 'expense':
    case 'income':
      // One amount. Split shares (P35) are entered in base currency and stay untouched,
      // exactly as the expense form's own resolveFx call leaves them.
      patch.amount = headline;
      break;

    case 'bill':
      patch.amount = headline;
      break;

    case 'subscription': {
      // Two figures on one invoice: the recurring amount and the post-trial first charge
      // (P33). Both are summed as base currency by the monthly totals and the calendar.
      patch.amount = headline;
      const first = num(doc.firstChargeAmount);
      if (first > 0) patch.firstChargeAmount = conv(first);
      break;
    }

    case 'receipt': {
      // A receipt has many amounts: reports sum `vatAmount`, and line prices are copied
      // into Item.purchasedPrice, so converting only the total would poison both.
      patch.total = headline;
      patch.subtotal = conv(doc.subtotal);
      patch.vatAmount = conv(doc.vatAmount);
      const lines = Array.isArray(doc.lineItems) ? (doc.lineItems as FxApplyDoc[]) : [];
      lines.forEach((li, i) => {
        patch[`lineItems.${i}.price`] = conv(li?.price);
      });
      break;
    }

    case 'item': {
      // Three prices quoted on the same paper; net worth, the insurance export and the
      // shopping budget each read a different one, so one rate converts all three.
      // `origAmount` is the ANCHOR (paid when owned, else asking price), so it is only the
      // headline for whichever field it came from; the others convert from their own value.
      patch.currentPrice = conv(doc.currentPrice);
      if (doc.purchasedPrice != null) patch.purchasedPrice = conv(doc.purchasedPrice);
      if (doc.targetPrice != null) patch.targetPrice = conv(doc.targetPrice);
      break;
    }

    case 'statement': {
      // A card issues the whole statement in one currency. The charges are not optional:
      // computeInstallmentPlans sums them into payoff figures shown on the homepage, so a
      // statement whose lines no longer add up to its own total would break those.
      patch.totalAmount = headline;
      patch.minimumPayment = conv(doc.minimumPayment);
      patch.paidAmount = conv(doc.paidAmount);
      const txs = Array.isArray(doc.transactions) ? (doc.transactions as FxApplyDoc[]) : [];
      txs.forEach((tx, i) => {
        patch[`transactions.${i}.amount`] = conv(tx?.amount);
      });
      break;
    }
  }

  return patch;
}

/** Fields each kind needs loaded for `fxApplyPatch` to compute a complete patch. */
export const FX_APPLY_SELECT: Record<FxIssueKind, string> = {
  expense: 'kind currency origAmount fxRate amount',
  income: 'kind currency origAmount fxRate amount',
  bill: 'currency origAmount fxRate amount',
  subscription: 'currency origAmount fxRate amount firstChargeAmount',
  receipt: 'currency origAmount fxRate total subtotal vatAmount lineItems',
  item: 'currency origAmount fxRate currentPrice purchasedPrice targetPrice status',
  statement: 'currency origAmount fxRate totalAmount minimumPayment paidAmount transactions',
};
