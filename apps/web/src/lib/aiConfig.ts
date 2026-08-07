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

/** Stable cache key for a tenant ('' = default/self-hosted). */
function tenantKey(ctx: TenantContext): string {
  return ctx.isDefault || !ctx.tenantId ? '' : ctx.tenantId;
}

/** How long the control-plane key lookup may take before it is treated as "no key". */
const BYO_KEY_TIMEOUT_MS = 3000;

/**
 * Inject a hosted workspace's own provider key (BYO-key) into the resolved config.
 *
 * Mutates in place and never throws: a control-plane hiccup must degrade to "no key" (which
 * the caller's fallback already handles) rather than break every AI call in the app.
 *
 * The provider is only switched when the workspace has NOT already chosen a cloud provider
 * itself: the stored key names its own provider, and honouring it is what makes the panel's
 * "Anthropic key saved" mean anything. An explicit in-app choice of a DIFFERENT cloud
 * provider (with its own key in AppConfig) still wins, because that is a deliberate override.
 *
 * The import is dynamic for the same two reasons as auth.ts's: it keeps the tenancy/billing
 * graph (node:crypto, the Tenant model) out of a self-hosted build, which never needs it.
 */
async function applyTenantByoKey(v: AiConfig, ctx: TenantContext): Promise<void> {
  if (ctx.isDefault || !ctx.tenantId) return; // self-hosted / SAAS_MODE off: nothing to do
  try {
    const { resolveTenantAiKey } = await import('./billing/byoKeyStore');
    // Bounded: getAiConfig sits in front of EVERY AI call, so a control-plane query that
    // hangs (rather than fails) would stall parsing app-wide instead of degrading it.
    // Losing the key for one 5s cache window is the cheap failure; a frozen request is not.
    // PRECEDENCE, and it matters: the workspace's OWN key wins, then the operator's platform
    // key. Falling back the other way would put a customer who deliberately brought their own
    // key onto the platform key, i.e. onto the operator's bill — and it would silently make
    // their calls metered (BYO calls are not), so they would be charged for AI they had
    // already paid the provider for directly.
    const resolved = await Promise.race([
      resolveTenantAiKey(ctx.tenantId).then(async (own) => {
        if (own?.key) return own;
        const { resolvePlatformAiKey } = await import('./billing/platformKeyStore');
        return resolvePlatformAiKey();
      }),
      new Promise<null>((r) => setTimeout(() => r(null), BYO_KEY_TIMEOUT_MS)),
    ]);
    if (!resolved?.key) return;
    switch (resolved.provider) {
      case 'anthropic': v.anthropicApiKey = resolved.key; break;
      case 'openai': v.openaiApiKey = resolved.key; break;
      case 'gemini': v.geminiApiKey = resolved.key; break;
      case 'openrouter': v.openrouterApiKey = resolved.key; break;
      case 'custom': v.customApiKey = resolved.key; break;
      default: return; // unknown provider id: leave the config untouched
    }
    if (v.provider === 'ollama') v.provider = resolved.provider as AiProvider;
  } catch {
    /* control plane unreachable / key tampered / no crypto → behave as if unset */
  }
}

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
  // A hosted workspace keeps its provider key encrypted in the CONTROL plane (the BYO-key
  // panel in workspace settings), not in this tenant's AppConfig. Without this, the key was
  // write-only: it was stored, masked back to the user, exempted from metering, and then
  // never handed to a provider. The fallback below would see an empty key, quietly demote
  // the workspace to Ollama, and every AI call would go to a localhost Ollama that does not
  // exist on the hosted server — so a customer who had configured everything correctly got
  // silence from AI and a provider that would not stay on what they picked.
  await applyTenantByoKey(v, ctx);

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
 *  No arg → only the CURRENT tenant; `all` → every tenant.
 *
 *  Uses the AMBIENT tenant deliberately, unlike getAiConfig above: this only ever runs inside a
 *  save action, which is already wrapped in `withRequestTenant`, so the ambient tenant is the
 *  right one and staying synchronous keeps every existing call site unchanged. */
export function invalidateAiConfigCache(all = false): void {
  if (all) cache.clear();
  else cache.delete(tenantKey(currentTenant()));
}
