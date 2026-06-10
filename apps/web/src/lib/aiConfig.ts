import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';

export type AiProvider = 'ollama' | 'anthropic';

export type AiConfig = {
  provider: AiProvider;
  ollamaHost: string; // base URL of the Ollama server (same machine or anywhere on the network)
  ollamaModel: string;
  ollamaVisionModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
};

// Model-name hints for "this can see images". Used to let an explicitly-chosen
// vision active model double as the vision model, and to pick a safe fallback.
const VISION_HINTS = /vl|vision|llava|minicpm-v|moondream|bakllava|llama3\.2-vision/i;
export function isVisionModel(name: string): boolean {
  return VISION_HINTS.test(name);
}

// Short cache so a burst of parses in one request doesn't hit Mongo each time.
let cache: { v: AiConfig; t: number } | null = null;
const TTL = 5000;

/** Effective AI config, merging the DB singleton over env defaults. If the
 *  provider is 'anthropic' but no key is set, it transparently falls back to
 *  Ollama so parsing never hard-fails on a half-configured setup. */
export async function getAiConfig(): Promise<AiConfig> {
  if (cache && Date.now() - cache.t < TTL) return cache.v;
  let doc: { aiProvider?: string; ollamaHost?: string; ollamaModel?: string; ollamaVisionModel?: string; anthropicApiKey?: string; anthropicModel?: string } | null = null;
  try {
    await connectDB();
    doc = await AppConfig.findOne({ key: 'singleton' }).lean();
  } catch {
    /* DB down → use env defaults */
  }
  const ollamaModel = doc?.ollamaModel || process.env.OLLAMA_MODEL || 'qwen2.5vl:7b';
  // Vision model resolution: explicit setting → else reuse the active model if it
  // can see → else the env/default vision model. Guarantees image parses never
  // run on a text-only model (e.g. when the active model is qwen2.5:14b).
  const visionDefault = process.env.OLLAMA_VISION_MODEL || 'qwen2.5vl:7b';
  const ollamaVisionModel =
    doc?.ollamaVisionModel || (isVisionModel(ollamaModel) ? ollamaModel : visionDefault);
  const v: AiConfig = {
    provider: (doc?.aiProvider as AiProvider) || 'ollama',
    ollamaHost: (doc?.ollamaHost || process.env.OLLAMA_HOST || 'http://localhost:11434').trim().replace(/\/$/, ''),
    ollamaModel,
    ollamaVisionModel,
    anthropicApiKey: doc?.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '',
    anthropicModel: doc?.anthropicModel || 'claude-sonnet-4-5-20250929',
  };
  if (v.provider === 'anthropic' && !v.anthropicApiKey) v.provider = 'ollama';
  cache = { v, t: Date.now() };
  return v;
}

/** Call after saving settings so the next parse picks up the change immediately. */
export function invalidateAiConfigCache(): void {
  cache = null;
}
