import { NextRequest, NextResponse } from 'next/server';
import { withAuth, apiError } from '@/lib/apiAuth';
import { readBody } from '@/lib/apiBody';
import { connectDB } from '@/lib/db';
import { AppConfig } from '@/models/AppConfig';
import { getAiConfig, invalidateAiConfigCache, type AiConfig } from '@/lib/aiConfig';
import { isAiReady, invalidateOllamaHealth } from '@/lib/ollama';
import { AI_FEATURES, AI_FEATURE_KEYS, type AiFeatureKey } from '@/lib/aiFeatures';
import { canAdmin } from '@/lib/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The model actually in play for the resolved provider. Read-only display value: the
 *  mobile client shows it so "AI is on" is not an unverifiable claim, but it never sees
 *  a key, a host or a base URL — those stay in the web Settings → AI tab, which is the
 *  one place credentials are entered. */
function activeModel(cfg: AiConfig): string {
  switch (cfg.provider) {
    case 'anthropic': return cfg.anthropicModel;
    case 'openai': return cfg.openaiModel;
    case 'gemini': return cfg.geminiModel;
    case 'openrouter': return cfg.openrouterModel;
    case 'custom': return cfg.customModel;
    default: return cfg.ollamaModel;
  }
}

/** GET /api/v1/settings/ai → master switch, resolved provider/model, readiness and the
 *  per-feature toggles. Readable by any signed-in user (a viewer should be able to see
 *  WHY a scan button did nothing); writes are admin-only, see PATCH. */
export async function GET(req: NextRequest) {
  return withAuth(req, async (user) => {
    const cfg = await getAiConfig();
    const ready = cfg.aiEnabled ? await isAiReady() : false;
    return NextResponse.json({
      aiEnabled: cfg.aiEnabled,
      provider: cfg.provider,
      model: activeModel(cfg),
      // Only meaningful on Ollama (cloud providers use one multimodal model), but sent
      // unconditionally so the client does not branch on provider names.
      visionModel: cfg.ollamaVisionModel,
      ready,
      // Lets the client render the section read-only instead of firing a doomed PATCH.
      canEdit: canAdmin(user.role),
      features: AI_FEATURES.map((f) => ({
        key: f.key,
        label: f.label,
        description: f.description,
        area: f.area,
        // ABSENT key means ON (so a feature added by a later release is not silently off).
        enabled: cfg.aiFeatures[f.key] !== false,
        status: !cfg.aiEnabled || cfg.aiFeatures[f.key] === false ? 'disabled' : ready ? 'ready' : 'no-provider',
      })),
    });
  });
}

/** PATCH /api/v1/settings/ai → flip the master switch and/or individual features.
 *  Admin-only, mirroring the web `setAiEnabled`/`setAiFeature` actions: AI configuration
 *  spends money and changes what every user of the instance gets, so a member must not be
 *  able to turn it on from a phone. Credentials are deliberately NOT writable here. */
export async function PATCH(req: NextRequest) {
  return withAuth(req, async (user) => {
    if (!canAdmin(user.role)) return apiError('Admin only', 403);
    const b = await readBody(req);
    const set: Record<string, unknown> = {};

    const togglingMaster = typeof b.aiEnabled === 'boolean';
    if (togglingMaster) set.aiEnabled = b.aiEnabled;

    if (b.features && typeof b.features === 'object') {
      for (const [k, v] of Object.entries(b.features as Record<string, unknown>)) {
        // Unknown keys are dropped rather than stored: an old client (or a typo) must not
        // be able to write junk into the feature map.
        if (typeof v === 'boolean' && AI_FEATURE_KEYS.includes(k as AiFeatureKey)) set[`aiFeatures.${k}`] = v;
      }
    }

    if (!Object.keys(set).length) return apiError('no valid fields');
    await connectDB();
    await AppConfig.updateOne({ key: 'singleton' }, { $set: set }, { upsert: true });
    invalidateAiConfigCache();
    // The health probe is cached for 20s; flipping the master switch should be felt now.
    if (togglingMaster) invalidateOllamaHealth();
    return NextResponse.json({ ok: true });
  });
}
