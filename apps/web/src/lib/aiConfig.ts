import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';
import { currentModel } from './tenancy/connection';
import { currentTenant } from './tenancy/current';

export type AiProvider = 'ollama' | 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'custom';

export type AiConfig = {
  provider: AiProvider;
  ollamaHost: string; // base URL of the Ollama server (same machine or anywhere on the network)
  ollamaModel: string;
  ollamaVisionModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
  openaiApiKey: string;
  openaiModel: string;
  geminiApiKey: string;
  geminiModel: string;
  openrouterApiKey: string;
  openrouterModel: string;
  // Any OpenAI-compatible server (LM Studio, Groq, Mistral, DeepSeek, vLLM…)
  customBaseUrl: string;
  customApiKey: string; // optional — local servers often need none
  customModel: string;
  // ── Optional-AI controls (the app works fully without AI) ──
  aiEnabled: boolean; // master switch
  aiFeatures: Record<string, boolean>; // per-feature overrides; ABSENT key = enabled
  aiOnboardingDismissed: boolean; // hide the "set up AI" banner
};

// Model-name hints for "this can see images". Used to let an explicitly-chosen
// vision active model double as the vision model, and to pick a safe fallback.
const VISION_HINTS = /vl|vision|llava|minicpm-v|moondream|bakllava|llama3\.2-vision/i;
export function isVisionModel(name: string): boolean {
  return VISION_HINTS.test(name);
}

// Short cache so a burst of parses in one request doesn't hit Mongo each time.
// Keyed by tenant. Default/self-hosted tenant uses the '' key → identical behaviour and
// TTL to the old single-slot cache; SaaS tenants each get their own slot so one tenant's
// AI provider/keys never leak into another's.
const cache = new Map<string, { v: AiConfig; t: number }>();
const TTL = 5000;

/** Stable cache key for the current tenant ('' = default/self-hosted). */
function tenantKey(): string {
  const ctx = currentTenant();
  return ctx.isDefault || !ctx.tenantId ? '' : ctx.tenantId;
}

/** Effective AI config, merging the DB singleton over env defaults. If the chosen
 *  cloud provider has no key (or custom has no URL/model), it transparently falls
 *  back to Ollama so parsing never hard-fails on a half-configured setup. */
export async function getAiConfig(): Promise<AiConfig> {
  const key = tenantKey();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  let doc: {
    aiProvider?: string;
    ollamaHost?: string;
    ollamaModel?: string;
    ollamaVisionModel?: string;
    anthropicApiKey?: string;
    anthropicModel?: string;
    openaiApiKey?: string;
    openaiModel?: string;
    geminiApiKey?: string;
    geminiModel?: string;
    openrouterApiKey?: string;
    openrouterModel?: string;
    customBaseUrl?: string;
    customApiKey?: string;
    customModel?: string;
    aiEnabled?: boolean;
    aiFeatures?: Record<string, boolean>;
    aiOnboardingDismissed?: boolean;
  } | null = null;
  try {
    await connectDB();
    // Route to the current tenant's database (default tenant → the AppConfig model
    // untouched, same query as before).
    const Config = await currentModel(AppConfig);
    doc = await Config.findOne({ key: 'singleton' }).lean();
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
    openaiApiKey: doc?.openaiApiKey || process.env.OPENAI_API_KEY || '',
    openaiModel: doc?.openaiModel || 'gpt-4o-mini',
    geminiApiKey: doc?.geminiApiKey || process.env.GEMINI_API_KEY || '',
    geminiModel: doc?.geminiModel || 'gemini-2.0-flash',
    openrouterApiKey: doc?.openrouterApiKey || '',
    openrouterModel: doc?.openrouterModel || 'openai/gpt-4o-mini',
    customBaseUrl: (doc?.customBaseUrl || '').trim().replace(/\/$/, ''),
    customApiKey: doc?.customApiKey || '',
    customModel: doc?.customModel || '',
    aiEnabled: doc?.aiEnabled !== false, // default ON for existing installs
    aiFeatures: (doc?.aiFeatures as Record<string, boolean>) || {},
    aiOnboardingDismissed: !!doc?.aiOnboardingDismissed,
  };
  // Half-configured cloud provider → quiet fallback to Ollama.
  if (
    (v.provider === 'anthropic' && !v.anthropicApiKey) ||
    (v.provider === 'openai' && !v.openaiApiKey) ||
    (v.provider === 'gemini' && !v.geminiApiKey) ||
    (v.provider === 'openrouter' && !v.openrouterApiKey) ||
    (v.provider === 'custom' && (!v.customBaseUrl || !v.customModel))
  ) {
    v.provider = 'ollama';
  }
  cache.set(key, { v, t: Date.now() });
  return v;
}

/** Call after saving settings so the next parse picks up the change immediately.
 *  No arg → only the CURRENT tenant; `all` → every tenant. */
export function invalidateAiConfigCache(all = false): void {
  if (all) cache.clear();
  else cache.delete(tenantKey());
}
