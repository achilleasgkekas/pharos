// Per-model Anthropic pricing, for the self-hosted AI spend cap (lib/aiBudget.ts).
//
// Rates are in currency MICROS per 1M tokens (1 unit = 1_000_000 micros), the same integer
// convention as billing/aiCost.ts, so a running monthly total never drifts the way summed
// floats do. Prices are Anthropic first-party USD list rates from lib/claudePricing.ts.
//
// Unknown models fall back to a Sonnet-class estimate rather than 0, marked as approximate,
// so an untabled model is never treated as free.

import { claudeRateMicros } from './claudePricing';

/**
 * Per-million-token rate, in currency micros: `inputPerMTok` is the price of one MILLION input
 * tokens expressed in micros (e.g. $3 per 1M tokens → 3_000_000). Micros are integers, so a
 * running total never drifts the way summed floats do.
 */
export type AiRate = {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheWrite5mPerMTok?: number;
  cacheWrite1hPerMTok?: number;
  cacheReadPerMTok?: number;
  isApproximate?: boolean;
};

/** Coerce one field to a non-negative integer; non-finite/negative/non-number → `fallback`. */
function nonNegInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/**
 * Estimate the cost of a call in currency micros from its token counts and a rate. Returns an
 * integer (floored); garbage or negative token counts are clamped to 0 rather than producing a
 * negative charge.
 */
export function estimateCostMicros(
  inputTokens: number,
  outputTokens: number,
  rate: AiRate,
  cacheWriteTokens?: number,
  cacheReadTokens?: number
): number {
  const inTok = nonNegInt(inputTokens, 0);
  const outTok = nonNegInt(outputTokens, 0);
  const cwTok = nonNegInt(cacheWriteTokens, 0);
  const crTok = nonNegInt(cacheReadTokens, 0);
  const micros =
    (inTok * nonNegInt(rate?.inputPerMTok, 0)) / 1_000_000 +
    (outTok * nonNegInt(rate?.outputPerMTok, 0)) / 1_000_000 +
    (cwTok * nonNegInt(rate?.cacheWrite5mPerMTok, 0)) / 1_000_000 +
    (crTok * nonNegInt(rate?.cacheReadPerMTok, 0)) / 1_000_000;
  return Math.max(0, Math.floor(micros));
}

/** The per-1M-token rate (in micros) for a model id. Exact match with alias/dated fallback. */
export function rateForModel(model: string): AiRate {
  const r = claudeRateMicros(model);
  return {
    inputPerMTok: r.inputPerMTok,
    outputPerMTok: r.outputPerMTok,
  };
}

/** Full rate including cache rates and approximation flag. */
export function fullRateForModel(model: string): AiRate {
  return claudeRateMicros(model);
}

/** Estimated cost of one call in currency micros, from the model id + token counts (including cache). */
export function callCostMicros(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheWriteTokens: number = 0,
  cacheReadTokens: number = 0
): number {
  const fullRate = claudeRateMicros(model);
  return estimateCostMicros(inputTokens, outputTokens, fullRate, cacheWriteTokens, cacheReadTokens);
}
