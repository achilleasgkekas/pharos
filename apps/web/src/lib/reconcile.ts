/**
 * Receipt ↔ statement-transaction reconciliation (P18).
 *
 * Pure, deterministic matching: given a statement's transactions and a pool of
 * receipts, suggest which receipt each charge belongs to (store / amount / date).
 * No DB, no AI. The server action feeds it data and the UI confirms a match
 * (auto-SUGGEST, never silent auto-link).
 *
 * Match rules (all tunable via opts):
 *  - amount: |charge| must equal the receipt total within `amountTolerance` (€0.02
 *    default). Card charges post the receipt total to the cent, so this stays tight
 *    to avoid false positives; `Math.abs` on the charge covers credits/refunds.
 *  - date: the receipt date must be within `dayTolerance` days of the charge date
 *    (default ±3 — a charge often posts a day or two after the purchase).
 *  - store: shared token between receipt.store and the charge description is a
 *    tiebreaker/booster, never a hard requirement (statement descriptors are terse).
 */

export type ReconTxnInput = {
  id: string;
  date: string; // ISO
  description: string;
  amount: number;
  matchedReceiptId: string | null;
};

export type ReconReceiptInput = {
  id: string;
  store: string;
  date: string; // ISO
  total: number;
};

export type ReconCandidate = {
  receiptId: string;
  score: number; // 0..1, best first
  dayDiff: number; // whole days between charge and receipt
  amountDiff: number; // |charge| − receipt.total
  storeMatch: boolean; // shared descriptive token
};

export type ReconTxnResult = {
  txnId: string;
  matchedReceiptId: string | null; // confirmed link, if any
  candidates: ReconCandidate[]; // suggestions (best first), max `maxCandidates`
};

export type ReconResult = {
  txns: ReconTxnResult[];
  /** Receipts (from the given pool) not confirm-linked to any of the given txns. */
  unmatchedReceiptIds: string[];
};

export const DEFAULT_DAY_TOLERANCE = 3;
export const DEFAULT_AMOUNT_TOLERANCE = 0.02;
const DEFAULT_MAX_CANDIDATES = 3;

const STOP_TOKENS = new Set([
  'the',
  'and',
  'ltd',
  'inc',
  'the',
  'shop',
  'store',
  'online',
  'gmbh',
  'com',
  'www',
  'greece',
  'hellas',
]);

/** Lowercase alphanumeric tokens of length ≥ 3 (Greek + Latin), stopwords dropped. */
function tokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const raw of (s || '').toLowerCase().split(/[^a-z0-9Ͱ-Ͽἀ-῿]+/)) {
    if (raw.length >= 3 && !STOP_TOKENS.has(raw)) out.add(raw);
  }
  return out;
}

/** Whole-day gap between two ISO dates (0 = same calendar day, ignores time). */
function dayGap(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return Number.POSITIVE_INFINITY;
  const ua = Date.UTC(da.getUTCFullYear(), da.getUTCMonth(), da.getUTCDate());
  const ub = Date.UTC(db.getUTCFullYear(), db.getUTCMonth(), db.getUTCDate());
  return Math.round(Math.abs(ua - ub) / 86_400_000);
}

function hasSharedToken(a: Set<string>, b: Set<string>): boolean {
  for (const t of a) if (b.has(t)) return true;
  return false;
}

/**
 * Rank receipt candidates for each transaction. Deterministic and side-effect
 * free — callers pre-filter the receipt pool (e.g. to the statement's date window
 * and to non-archived, priced receipts).
 */
export function reconcile(
  txns: ReconTxnInput[],
  receipts: ReconReceiptInput[],
  opts?: { dayTolerance?: number; amountTolerance?: number; maxCandidates?: number }
): ReconResult {
  const dayTol = opts?.dayTolerance ?? DEFAULT_DAY_TOLERANCE;
  const amtTol = opts?.amountTolerance ?? DEFAULT_AMOUNT_TOLERANCE;
  const maxCand = opts?.maxCandidates ?? DEFAULT_MAX_CANDIDATES;

  const priced = receipts.filter((r) => r.total > 0);
  const receiptTokens = new Map<string, Set<string>>();
  for (const r of priced) receiptTokens.set(r.id, tokens(r.store));

  const txnResults: ReconTxnResult[] = txns.map((tx) => {
    const charge = Math.abs(tx.amount);
    const descTokens = tokens(tx.description);
    const candidates: ReconCandidate[] = [];

    for (const r of priced) {
      const amountDiff = Math.abs(charge - r.total);
      if (amountDiff > amtTol) continue;
      const dayDiff = dayGap(tx.date, r.date);
      if (dayDiff > dayTol) continue;
      const storeMatch = hasSharedToken(descTokens, receiptTokens.get(r.id) ?? new Set());
      // Score: same-day + a shared store token is the strongest signal. Amount is
      // already inside tolerance, so it only breaks near-ties (closer = better).
      const dateScore = 1 - dayDiff / (dayTol + 1); // 1 at 0 days → >0 at tol
      const score =
        (storeMatch ? 0.5 : 0) + dateScore * 0.45 + (1 - Math.min(amountDiff / (amtTol || 1), 1)) * 0.05;
      candidates.push({ receiptId: r.id, score, dayDiff, amountDiff, storeMatch });
    }

    candidates.sort(
      (a, b) =>
        b.score - a.score ||
        a.dayDiff - b.dayDiff ||
        a.amountDiff - b.amountDiff ||
        a.receiptId.localeCompare(b.receiptId)
    );

    return {
      txnId: tx.id,
      matchedReceiptId: tx.matchedReceiptId || null,
      candidates: candidates.slice(0, maxCand),
    };
  });

  const confirmed = new Set<string>();
  for (const tx of txns) if (tx.matchedReceiptId) confirmed.add(tx.matchedReceiptId);
  const unmatchedReceiptIds = priced.filter((r) => !confirmed.has(r.id)).map((r) => r.id);

  return { txns: txnResults, unmatchedReceiptIds };
}
