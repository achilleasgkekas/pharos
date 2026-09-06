// Per-model Anthropic pricing, for the self-hosted AI spend cap (lib/aiBudget.ts).
//
// Rates are in currency MICROS per 1M tokens (1 unit = 1_000_000 micros), the same integer
// convention as billing/aiCost.ts, so a running monthly total never drifts the way summed
// floats do. Prices below are Anthropic first-party USD list rates ($/1M in · $/1M out); the
// cap treats them as the user's display currency (a EUR user's cap is approximate, which is
// fine for a spend guard — the source of truth for real billing is the Anthropic console).
//
// Matched by SUBSTRING on the model id, most-specific first, so a dated id like
// `claude-sonnet-4-5-20250929` still resolves. Unknown models fall back to a Sonnet-class
// estimate rather than 0, so an untabled model is never treated as free.
import { estimateCostMicros, type AiRate } from './billing/aiCost';

const M = 1_000_000;

/** [substring, rate] pairs, checked in order — put more specific ids before shorter ones. */
const RATES: Array<[RegExp, AiRate]> = [
  [/fable-5|mythos-5/, { inputPerMTok: 10 * M, outputPerMTok: 50 * M }],
  [/opus-5|opus-4-[678]/, { inputPerMTok: 5 * M, outputPerMTok: 25 * M }],
  [/sonnet-5/, { inputPerMTok: 2 * M, outputPerMTok: 10 * M }],
  [/sonnet-4-6/, { inputPerMTok: 3 * M, outputPerMTok: 15 * M }],
  [/sonnet-4-5/, { inputPerMTok: 3 * M, outputPerMTok: 15 * M }],
  [/haiku-4-5/, { inputPerMTok: 1 * M, outputPerMTok: 5 * M }],
  [/3-5-haiku|haiku-3-5/, { inputPerMTok: 0.8 * M, outputPerMTok: 4 * M }],
  [/opus-4-5|opus-3/, { inputPerMTok: 5 * M, outputPerMTok: 25 * M }],
  [/sonnet-4|sonnet-3/, { inputPerMTok: 3 * M, outputPerMTok: 15 * M }],
];

/** Sonnet-class fallback for an untabled model — never treat an unknown model as free. */
const FALLBACK_RATE: AiRate = { inputPerMTok: 3 * M, outputPerMTok: 15 * M };

/** The per-1M-token rate (in micros) for a model id. Substring match, Sonnet-class fallback. */
export function rateForModel(model: string): AiRate {
  const m = (model || '').toLowerCase();
  for (const [re, rate] of RATES) if (re.test(m)) return rate;
  return FALLBACK_RATE;
}

/** Estimated cost of one call in currency micros, from the model id + token counts. */
export function callCostMicros(model: string, inputTokens: number, outputTokens: number): number {
  return estimateCostMicros(inputTokens, outputTokens, rateForModel(model));
}
