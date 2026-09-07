import { NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceSession } from '@/lib/tenancy/workspaceSession';
import { readBody } from '@/lib/apiBody';
import { saasGuard } from '@/lib/tenancy/saasApi';
import { recordAudit } from '@/lib/tenancy/audit';
import { tenantDb, tenantModel } from '@/lib/tenancy/connection';
import { AppConfig } from '@/models/AppConfig';
import { AI_FEATURES } from '@/lib/aiFeatures';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Per-tenant AI CONFIG for the account-area Workspace → AI panel (SaaS control plane).
 *
 * WHY THIS EXISTS. The AI master switch and per-feature toggles are per-workspace DATA — they
 * live in the tenant's own `appconfigs` singleton, the same fields the self-hosted Settings → AI
 * tab writes through server actions. But those server actions resolve the tenant from the
 * REQUEST HOST, and the account area runs on the apex/app host (app.<domain>), which is not a
 * workspace subdomain — so from there the ambient tenant is not the workspace being edited. This
 * route closes that gap: it takes the workspace slug (like every other /api/saas/workspace/*),
 * resolves the tenant explicitly, and reads/writes that tenant's data-DB AppConfig. It is the
 * companion to /api/saas/workspace/ai-key (which owns the control-plane BYO key) so that ALL of
 * a workspace's AI settings can be managed from one Workspace → AI page in hosted mode.
 *
 * Gating via resolveWorkspaceSession: SAAS_MODE off → 404; not signed in → 401; PATCH requires
 * owner/admin (requireManage) → 403 otherwise; suspended/canceled → 403.
 *
 * NOTE: provider/model are deliberately NOT editable here. In hosted mode the provider is decided
 * by the platform key (or the tenant's BYO key's provider), not a per-tenant free choice — so the
 * tenant-facing surface is the on/off master and which features may use AI.
 */

const VALID_FEATURE_KEYS = new Set(AI_FEATURES.map((f) => f.key as string));

async function readAiConfig(ctx: Parameters<typeof tenantDb>[0]) {
  const Config = tenantModel(await tenantDb(ctx), AppConfig);
  const doc = (await Config.findOne({ key: 'singleton' }).select('aiEnabled aiFeatures').lean()) as
    | { aiEnabled?: boolean; aiFeatures?: Record<string, boolean> }
    | null;
  return {
    aiEnabled: doc?.aiEnabled !== false, // master switch, default ON (matches getAiConfig)
    aiFeatures: (doc?.aiFeatures as Record<string, boolean>) || {},
  };
}

/** GET /api/saas/workspace/ai-config[?tenant=<slug>] — the workspace's AI master + feature map. */
export async function GET(req: NextRequest) {
  return saasGuard(async () => {
    const slug = new URL(req.url).searchParams.get('tenant');
    const resolved = await resolveWorkspaceSession(slug, false);
    if ('response' in resolved) return resolved.response;
    const { session } = resolved;

    const cfg = await readAiConfig(session.ctx);
    return NextResponse.json({
      workspace: session.workspace.slug,
      ...cfg,
      features: AI_FEATURES, // the catalogue (key/label/description/area) so the panel needs no second source
    });
  });
}

/**
 * PATCH /api/saas/workspace/ai-config — update the master switch and/or feature toggles.
 * Body: `{ tenant?, aiEnabled?: boolean, aiFeatures?: Record<string, boolean> }`. Owner/admin only.
 * `aiFeatures` is MERGED into the stored map (not replaced), so a single toggle can be sent alone.
 */
export async function PATCH(req: NextRequest) {
  return saasGuard(async () => {
    const body = await readBody(req);
    const resolved = await resolveWorkspaceSession(typeof body.tenant === 'string' ? body.tenant.trim() || null : null, true);
    if ('response' in resolved) return resolved.response;
    const { session } = resolved;

    const set: Record<string, unknown> = {};
    if (typeof body.aiEnabled === 'boolean') set.aiEnabled = body.aiEnabled;

    if (body.aiFeatures && typeof body.aiFeatures === 'object') {
      // Merge onto the current map, and reject unknown keys so a typo cannot poison the doc.
      const incoming = body.aiFeatures as Record<string, unknown>;
      const bad = Object.keys(incoming).filter((k) => !VALID_FEATURE_KEYS.has(k));
      if (bad.length > 0) {
        return NextResponse.json({ error: `unknown feature key(s): ${bad.join(', ')}` }, { status: 400 });
      }
      const current = (await readAiConfig(session.ctx)).aiFeatures;
      const merged = { ...current };
      for (const [k, v] of Object.entries(incoming)) merged[k] = v !== false; // coerce to boolean
      set.aiFeatures = merged;
    }

    if (Object.keys(set).length === 0) {
      return NextResponse.json({ error: 'nothing to update (send aiEnabled and/or aiFeatures)' }, { status: 400 });
    }

    const Config = tenantModel(await tenantDb(session.ctx), AppConfig);
    await Config.updateOne({ key: 'singleton' }, { $set: set }, { upsert: true });

    await recordAudit(session.ctx, {
      action: 'ai_config.set',
      actor: session.account.sub,
      target: session.workspace.slug,
      meta: { fields: Object.keys(set) }, // which fields changed, not the values
    });

    return NextResponse.json({ ok: true, ...(await readAiConfig(session.ctx)) });
  });
}
