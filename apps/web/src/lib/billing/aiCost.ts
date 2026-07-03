// PURE AI token + cost accounting helpers (TODO §11) — no DB, no env, no imports.
//
// The Usage ledger caps plan quotas by AI-call VOLUME (aiCalls), but the real platform
// spend is driven by TOKENS. These helpers normalize a per-call usage detail and estimate
// its cost in currency MICROS (millionths of one currency unit — an integer, so running
// totals never drift the way summed floats do).
//
// Everything here is best-effort ESTIMATION for internal metering/dashboards; the source of
// truth for what a tenant is actually billed remains Stripe. Rates are placeholders until
// Achilleas fixes real pricing (see SAAS_PROGRESS "Needs Achilleas").

/**
 * Per-call AI usage detail, as reported by an AI call site. All fields optional so the
 * simplest caller can pass `{}` (one call, no token data) and older `recordAiCall(ctx, n)`
 * callers keep working unchanged.
 */
export type AiUsageDetail = {
  /** How many AI operations this represents (default 1). */
  calls?: number;
  /** Prompt/input tokens consumed. */
  inputTokens?: number;
  /** Completion/output tokens produced. */
  outputTokens?: number;
  /**
   * Pre-computed cost in currency micros. When omitted, callers can derive it from tokens
   * via `estimateCostMicros`. When present it wins (e.g. a provider-reported exact cost).
   */
  costMicros?: number;
};

/** The normalized detail: every field a non-negative integer, `calls` defaulting to 1. */
export type NormalizedAiUsage = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
};

/** Coerce one field to a non-negative integer; non-finite/negative/non-number → `fallback`. */
function nonNegInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

/**
 * Normalize a (possibly partial/garbage) usage detail into safe integers for atomic `$inc`.
 * `calls` defaults to 1 (a record with no explicit count still means "one AI call"); tokens
 * and cost default to 0. Guarantees no NaN/negative/float reaches the ledger.
 */
export function normalizeAiUsage(detail: AiUsageDetail = {}): NormalizedAiUsage {
  return {
    calls: nonNegInt(detail.calls, 1),
    inputTokens: nonNegInt(detail.inputTokens, 0),
    outputTokens: nonNegInt(detail.outputTokens, 0),
    costMicros: nonNegInt(detail.costMicros, 0),
  };
}

/**
 * Per-million-token rate, in currency micros. `inputPerMTok` / `outputPerMTok` are the price
 * of one MILLION input / output tokens expressed in micros (e.g. $3 / 1M input tokens ≈
 * 3_000_000 micros). Kept as data so the caller owns pricing; DEFAULT_AI_RATE is a stand-in.
 */
export type AiRate = { inputPerMTok: number; outputPerMTok: number };

/**
 * PLACEHOLDER rate until real pricing is set (Needs Achilleas). Rough Claude Sonnet-class
 * order of magnitude: ~€3 / 1M input, ~€15 / 1M output → in micros of one currency unit.
 * Do NOT treat as authoritative billing input; it exists so estimates aren't zero.
 */
export const DEFAULT_AI_RATE: AiRate = {
  inputPerMTok: 3_000_000,
  outputPerMTok: 15_000_000,
};

/**
 * Estimate the cost of a call in currency micros from its token counts and a rate. Returns
 * an integer (floored). Negative/garbage inputs are clamped to 0 via `normalizeAiUsage`.
 */
export function estimateCostMicros(
  inputTokens: number,
  outputTokens: number,
  rate: AiRate = DEFAULT_AI_RATE
): number {
  const { inputTokens: inTok, outputTokens: outTok } = normalizeAiUsage({ inputTokens, outputTokens });
  const inRate = nonNegInt(rate?.inputPerMTok, 0);
  const outRate = nonNegInt(rate?.outputPerMTok, 0);
  const micros = (inTok * inRate) / 1_000_000 + (outTok * outRate) / 1_000_000;
  return Math.max(0, Math.floor(micros));
}
