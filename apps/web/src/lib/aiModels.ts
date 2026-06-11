// Client-safe data: per-provider model recommendations + approximate pricing.
// Used by the Settings model picker to show cost + a "recommended" badge. Cloud
// prices change over time — treat the table as a guide. OpenRouter is the exception:
// its /models endpoint returns LIVE pricing, which we use instead of this table.

export type AiProviderId = 'ollama' | 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'custom';

/** A fetched model with optional cost (USD per 1M tokens) + flags. */
export type FetchedModel = {
  id: string;
  in: number | null; // input $/1M
  out: number | null; // output $/1M
  vision: boolean;
  recommended: boolean;
};

/** Recommended model per provider + a one-line reason (vision-capable, sensible default). */
export const PROVIDER_RECOMMEND: Partial<Record<AiProviderId, { model: string; reason: string }>> = {
  anthropic: { model: 'claude-sonnet-4-5-20250929', reason: 'Best accuracy + vision; claude-3-5-haiku is the cheap option' },
  openai: { model: 'gpt-4o-mini', reason: 'Cheap, vision-capable, great default' },
  gemini: { model: 'gemini-2.0-flash', reason: 'Fast, cheap, reads images natively' },
  openrouter: { model: 'openai/gpt-4o-mini', reason: 'Cheap + vision; one key, every model' },
};

/** A lighter/cheaper pick for the price scraper (text-only task — no vision needed). */
export const SCRAPER_RECOMMEND: Partial<Record<AiProviderId, { model: string; reason: string }>> = {
  anthropic: { model: 'claude-3-5-haiku-latest', reason: 'Cheapest Claude — plenty for plain price extraction' },
};

// Approx public list prices, USD per 1M tokens. Matched by substring; the LONGEST
// matching key wins (so "gpt-4o-mini" beats "gpt-4o").
const PRICING: { match: string; in: number; out: number }[] = [
  // Anthropic
  { match: 'claude-opus-4', in: 15, out: 75 },
  { match: 'claude-3-opus', in: 15, out: 75 },
  { match: 'claude-sonnet-4', in: 3, out: 15 },
  { match: 'claude-3-7-sonnet', in: 3, out: 15 },
  { match: 'claude-3-5-sonnet', in: 3, out: 15 },
  { match: 'claude-haiku-4', in: 1, out: 5 },
  { match: 'claude-3-5-haiku', in: 0.8, out: 4 },
  { match: 'claude-3-haiku', in: 0.25, out: 1.25 },
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

/** Look up approximate pricing for a model id from the static table (null if unknown). */
export function priceForModel(id: string): { in: number; out: number } | null {
  const lid = id.toLowerCase();
  let best: { in: number; out: number } | null = null;
  let bestLen = 0;
  for (const p of PRICING) {
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
  return /gpt-4o|gpt-4\.1|o4|claude-3-5|claude-3-7|claude-sonnet-4|claude-opus-4|claude-haiku-4|gemini|vl|vision|llava|minicpm-v|pixtral|llama-3\.2|qwen.*vl/.test(l);
}
