import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';
import { tenantDb, tenantModel } from './tenancy/connection';
import { softRequestTenant } from './tenancy/request';
import { currentTenant, hasTenantContext } from './tenancy/current';
import type { TenantContext } from './tenancy/context';

export type AiProvider = 'ollama' | 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'custom';

export type AiConfig = {
  provider: AiProvider;
  ollamaHost: string; // base URL of the Ollama server (same machine or anywhere on the network)
  ollamaModel: string;
  ollamaVisionModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
  // Optional. Required only for identity-linked API keys (org/programmatic keys not scoped to
  // a single workspace): the Anthropic API then rejects the call with HTTP 400 unless the
  // request names the workspace via the `anthropic-workspace-id` header. Blank for the common
  // case of a plain workspace key. Format: `wrkspc_…`.
  anthropicWorkspaceId: string;
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
  // ── Separate 'scraper' model (Settings → Scraper AI) ──
  // Product/price extraction is a simple text task, so it can run on a lighter/cheaper model
  // (Haiku) or a local Ollama, independent of the main provider that does the heavy
  // receipt/statement parses. Consumed via `scraperConfig()` below.
  scraperProvider: 'ollama' | 'anthropic';
  scraperModel: string;
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

/** Stable cache key for a tenant ('' = default/self-hosted). */
function tenantKey(ctx: TenantContext): string {
  return ctx.isDefault || !ctx.tenantId ? '' : ctx.tenantId;
}

/** How long the control-plane key lookup may take before it is treated as "no key". */


/** Effective AI config, merging the DB singleton over env defaults. If the chosen
 *  cloud provider has no key (or custom has no URL/model), it transparently falls
 *  back to Ollama so parsing never hard-fails on a half-configured setup. */
export async function getAiConfig(): Promise<AiConfig> {
  // A gate wins when one is open; otherwise resolve from the HOST rather than silently
  // accepting the default tenant.
  //
  // getAiConfig is called from the ROOT LAYOUT (the navbar's "AI online" dot) and from other
  // paths that never opened a `withRequestTenant` gate. Reading only the ambient tenant there
  // yields DEFAULT, so the lookup lands in the registry database instead of the workspace's.
  // Live symptom 2026-08-07: a saved Anthropic key sat correctly in `tenant_home.appconfigs`
  // while the navbar read `pharos_registry.appconfigs` (provider ollama, no key) and reported
  // "AI offline". The key WAS saved; the app was reading the wrong database.
  //
  // `hasTenantContext()` first, not `softRequestTenant()` alone: that helper short-circuits to
  // DEFAULT whenever SAAS_MODE is off, which would ignore an explicitly established context
  // (self-hosted, and every unit test that wraps a call in `withTenant`). Honouring an open
  // gate is also cheaper — no header read — and can never disagree with the gate that ran.
  const ctx = hasTenantContext() ? currentTenant() : await softRequestTenant();
  const key = tenantKey(ctx);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  let doc: {
    aiProvider?: string;
    ollamaHost?: string;
    ollamaModel?: string;
    ollamaVisionModel?: string;
    anthropicApiKey?: string;
    anthropicModel?: string;
    anthropicWorkspaceId?: string;
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
    scraperProvider?: string;
    scraperModel?: string;
  } | null = null;
  try {
    await connectDB();
    // Route to the current tenant's database (default tenant → the AppConfig model
    // untouched, same query as before).
    const Config = tenantModel(await tenantDb(ctx), AppConfig);
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
    anthropicWorkspaceId: doc?.anthropicWorkspaceId || process.env.ANTHROPIC_WORKSPACE_ID || '',
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
    scraperProvider: doc?.scraperProvider === 'anthropic' ? 'anthropic' : 'ollama',
    scraperModel: doc?.scraperModel || '',
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

/**
 * Derive the config the PRICE/PRODUCT scraper should use from a resolved AiConfig.
 *
 * Product/price extraction is a simple text task, so Settings → Scraper AI lets it run on a
 * lighter/cheaper model (e.g. Haiku) or a local Ollama, separate from the main provider that
 * does the heavy receipt/statement parses. Until this was wired, `parseProductFromPage` ran on
 * the MAIN model, so an operator who picked "Haiku" for the scraper was silently billed at the
 * main model's rate on every product page — including the unattended 6h price cron, one call
 * per tracked link. Pure transform: swaps provider + model, keeps the same credentials/hosts,
 * and falls back to Ollama when the scraper is set to Anthropic but no key is configured
 * (mirrors getAiConfig's half-configured guard).
 */
export function scraperConfig(cfg: AiConfig): AiConfig {
  if (cfg.scraperProvider === 'anthropic' && cfg.anthropicApiKey) {
    return { ...cfg, provider: 'anthropic', anthropicModel: cfg.scraperModel || cfg.anthropicModel };
  }
  return { ...cfg, provider: 'ollama', ollamaModel: cfg.scraperModel || cfg.ollamaModel };
}

/** Call after saving settings so the next parse picks up the change immediately.
 *  No arg → only the CURRENT tenant; `all` → every tenant.
 *
 *  Uses the AMBIENT tenant deliberately, unlike getAiConfig above: this only ever runs inside a
 *  save action, which is already wrapped in `withRequestTenant`, so the ambient tenant is the
 *  right one and staying synchronous keeps every existing call site unchanged. */
export function invalidateAiConfigCache(all = false): void {
  if (all) cache.clear();
  else cache.delete(tenantKey(currentTenant()));
}
