// Client-safe data: per-provider model recommendations + approximate pricing.
// Used by the Settings model picker to show cost + a "recommended" badge. Cloud
// prices change over time — treat the table as a guide. OpenRouter is the exception:
// its /models endpoint returns LIVE pricing, which we use instead of this table.

import { CLAUDE_MAIN_DEFAULT, CLAUDE_SCRAPER_DEFAULT } from './claudeModels';

export type AiProviderId = 'ollama' | 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'custom';

export type FetchedModel = {
  id: string;
  in: number | null; // input $/1M
  out: number | null; // output $/1M
  vision: boolean;
  recommended: boolean;
  /** Human-readable name when the provider gives one (Anthropic's `display_name`). */
  name?: string;
  cacheWrite5m?: number | null;
  cacheWrite1h?: number | null;
  cacheRead?: number | null;
};

/** Recommended model per provider + a one-line reason (vision-capable, sensible default). */
export const PROVIDER_RECOMMEND: Partial<Record<AiProviderId, { model: string; reason: string }>> = {
  anthropic: { model: CLAUDE_MAIN_DEFAULT, reason: 'Reads receipts and PDFs accurately at a moderate price; claude-haiku-4-5 is the low-cost option' },
  openai: { model: 'gpt-4o-mini', reason: 'Cheap, vision-capable, great default' },
  gemini: { model: 'gemini-2.0-flash', reason: 'Fast, cheap, reads images natively' },
  openrouter: { model: 'openai/gpt-4o-mini', reason: 'Cheap + vision; one key, every model' },
};

/** A lighter/cheaper pick for the price scraper (text-only task — no vision needed). */
export const SCRAPER_RECOMMEND: Partial<Record<AiProviderId, { model: string; reason: string }>> = {
  anthropic: { model: CLAUDE_SCRAPER_DEFAULT, reason: 'The low-cost Claude model, plenty for plain price extraction' },
};

import { claudePrice } from './claudePricing';

// Approx public list prices for non-Claude providers, USD per 1M tokens.
// Claude models use the single canonical pricing table in lib/claudePricing.ts (#360).
// Matched by substring; the LONGEST matching key wins (so "gpt-4o-mini" beats "gpt-4o").
const NON_CLAUDE_PRICING: { match: string; in: number; out: number }[] = [
  // OpenAI
  { match: 'gpt-4o-mini', in: 0.15, out: 0.6 },
  { match: 'gpt-4o', in: 2.5, out: 10 },
  { match: 'gpt-4.1-nano', in: 0.1, out: 0.4 },
  { match: 'gpt-4.1-mini', in: 0.4, out: 1.6 },
  { match: 'gpt-4.1', in: 2, out: 8 },
  { match: 'o4-mini', in: 1.1, out: 4.4 },
  { match: 'o3-mini', in: 1.1, out: 4.4 },
  // Gemini
  { match: 'gemini-2.5-pro', in: 1.25, out: 10 },
  { match: 'gemini-2.5-flash', in: 0.3, out: 2.5 },
  { match: 'gemini-2.0-flash', in: 0.1, out: 0.4 },
  { match: 'gemini-1.5-pro', in: 1.25, out: 5 },
  { match: 'gemini-1.5-flash', in: 0.075, out: 0.3 },
];

/** Look up approximate pricing for a model id (null if unknown). */
export function priceForModel(id: string): { in: number; out: number } | null {
  const lid = (id || '').toLowerCase().trim();
  if (lid.startsWith('claude-')) {
    const cp = claudePrice(lid);
    return cp ? { in: cp.inputPerMTok, out: cp.outputPerMTok } : null;
  }
  let best: { in: number; out: number } | null = null;
  let bestLen = 0;
  for (const p of NON_CLAUDE_PRICING) {
    if (lid.includes(p.match) && p.match.length > bestLen) {
      best = { in: p.in, out: p.out };
      bestLen = p.match.length;
    }
  }
  return best;
}

/** Loose "can this model read images?" heuristic for the model list badge. */
export function looksVisionModel(id: string): boolean {
  const l = id.toLowerCase();
  if (/gpt-3\.5|text-|embed|whisper|tts|davinci|moderation|instruct/.test(l)) return false;
  return /gpt-4o|gpt-4\.1|o4|claude-3-5|claude-3-7|claude-(sonnet|opus|haiku|fable|mythos)-\d|gemini|vl|vision|llava|minicpm-v|pixtral|llama-3\.2|qwen.*vl/.test(l);
}
