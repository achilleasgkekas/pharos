// Credit card utilization (P84). Deterministic, DB-free, unit-testable.
//
// `Card.creditLimit` was stored and printed next to the card name, and the statements
// screen already computed the outstanding balance per card, but the two numbers never
// met: "how close am I to the limit on this card?" was left as mental arithmetic over
// two figures sitting in different places. This module joins them.
//
// The outstanding figure follows exactly the same rule the Statements header already
// uses for the headline debt, so the badge can never disagree with the number printed
// a few pixels above it: the LATEST statement per card carries the running balance, so
// it is that statement's `totalAmount - paidAmount`, never a sum across periods (that
// would count the same debt once per month).
//
// Honesty rules enforced here rather than in the UI:
//   1. No limit (0 or missing) → no entry at all. A utilization against an unknown
//      limit is not a smaller truth, it is a made-up one.
//   2. A credit balance (overpaid card, negative outstanding) clamps to 0%, it never
//      renders as a negative utilization.
//   3. An ambiguous display label (two cards that render the same string) is dropped
//      from the label index instead of being attributed to whichever card came first.

import { buildCardLabel, normalizeLast4 } from './cards';

/** Utilization at or above this is worth noticing. */
export const UTILIZATION_WARN = 80;
/** Utilization at or above this is effectively "the card is full". */
export const UTILIZATION_HIGH = 95;

export type UtilizationLevel = 'ok' | 'warn' | 'high';

export type CardUtilization = {
  cardId: string;
  /** Display label of the card, as the statements list groups them. */
  label: string;
  /** Current debt on the card (clamped at 0, so a credit balance reads as 0). */
  outstanding: number;
  creditLimit: number;
  /** Rounded percent of the limit in use. Can exceed 100 when over the limit. */
  pct: number;
  level: UtilizationLevel;
};

export type CardUtilizationIndex = {
  /** Keyed by `Card._id`, for UI that already holds the card document. */
  byCardId: Map<string, CardUtilization>;
  /** Keyed by every unambiguous display label, for UI that only has the label
   *  string a statement was filed under. */
  byLabel: Map<string, CardUtilization>;
};

type CardLike = {
  _id: string;
  name?: string | null;
  last4?: string | null;
  creditLimit?: number | null;
};

type StatementLike = {
  card: string;
  cardId?: string | null;
  period: string;
  totalAmount: number;
  paidAmount: number;
};

export function utilizationLevel(pct: number): UtilizationLevel {
  if (pct >= UTILIZATION_HIGH) return 'high';
  if (pct >= UTILIZATION_WARN) return 'warn';
  return 'ok';
}

/** Every string a card may realistically be filed under. `buildCardLabel` is what the
 *  importer writes today; the other two cover cards created before it existed and
 *  hand-typed statements. */
function labelsFor(card: CardLike): string[] {
  const name = (card.name || '').trim();
  const last4 = normalizeLast4(card.last4);
  const out = new Set<string>([buildCardLabel(name, last4)]);
  if (name) {
    out.add(name);
    if (last4) out.add(`${name} ${last4}`);
  }
  return [...out].filter(Boolean);
}

/**
 * Join cards with their current outstanding balance.
 *
 * @param cards       the managed cards; only those with a positive `creditLimit` produce
 *                    an entry, since utilization needs a denominator.
 * @param statements  every statement in scope. Matched to a card by `cardId` when the
 *                    import recorded one, else by display label.
 */
export function buildCardUtilization(
  cards: readonly CardLike[],
  statements: readonly StatementLike[],
): CardUtilizationIndex {
  // Which labels are unambiguous across the whole card set.
  const labelOwners = new Map<string, Set<string>>();
  for (const c of cards) {
    for (const label of labelsFor(c)) {
      const owners = labelOwners.get(label) ?? new Set<string>();
      owners.add(c._id);
      labelOwners.set(label, owners);
    }
  }

  // Latest statement per card id and per label (both indexes, because a statement
  // carries a cardId only when the importer resolved one).
  const latestById = new Map<string, StatementLike>();
  const latestByLabel = new Map<string, StatementLike>();
  const keep = (map: Map<string, StatementLike>, key: string, s: StatementLike) => {
    const cur = map.get(key);
    if (!cur || s.period > cur.period) map.set(key, s);
  };
  for (const s of statements) {
    if (s.cardId) keep(latestById, s.cardId, s);
    if (s.card) keep(latestByLabel, s.card, s);
  }

  const byCardId = new Map<string, CardUtilization>();
  const byLabel = new Map<string, CardUtilization>();

  for (const c of cards) {
    const creditLimit = Number(c.creditLimit) || 0;
    if (creditLimit <= 0) continue;

    const labels = labelsFor(c);
    let latest = latestById.get(c._id) ?? null;
    if (!latest) {
      for (const label of labels) {
        // Only trust a label the card owns on its own.
        if ((labelOwners.get(label)?.size ?? 0) !== 1) continue;
        const s = latestByLabel.get(label);
        if (s && (!latest || s.period > latest.period)) latest = s;
      }
    }

    if (!latest) continue; // No statement means unknown usage, not zero usage.
    const outstanding = Math.max(0, latest.totalAmount - latest.paidAmount);
    const pct = Math.round((outstanding / creditLimit) * 100);
    const entry: CardUtilization = {
      cardId: c._id,
      label: buildCardLabel(c.name, c.last4),
      outstanding,
      creditLimit,
      pct,
      level: utilizationLevel(pct),
    };
    byCardId.set(c._id, entry);
    for (const label of labels) {
      if ((labelOwners.get(label)?.size ?? 0) === 1) byLabel.set(label, entry);
    }
  }

  return { byCardId, byLabel };
}
