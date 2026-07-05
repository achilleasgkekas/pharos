import { NextRequest, NextResponse } from 'next/server';
import { resolveWorkspaceSession } from '@/lib/tenancy/workspaceSession';
import { readBody, strField } from '@/lib/apiBody';
import { saasGuard } from '@/lib/tenancy/saasApi';
import { recordAudit } from '@/lib/tenancy/audit';
import { byoKeyReady, BYO_PROVIDERS } from '@/lib/billing/byoKey';
import {
  setTenantAiKey,
  clearTenantAiKey,
  describeTenantAiKey,
} from '@/lib/billing/byoKeyStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Workspace BYO-key management (SaaS control plane, TODO §11 / §14, D5).
 *
 * Lets an owner/admin store their OWN encrypted AI provider key on the tenant so their AI
 * calls run on that key (unmetered, zero platform cost — see lib/billing/aiKeyPolicy) instead
 * of the platform's shared key. The plaintext is encrypted at rest by lib/tenancy/secretCrypto
 * (AES-256-GCM) and never returned; responses only ever carry a masked last-4 preview.
 *
 * Gating (via resolveWorkspaceSession, requireManage=true for all methods — this is a
 * workspace security setting):
 *   - SAAS_MODE off        → 404 (endpoint doesn't exist for the self-hosted app)
 *   - not signed in        → 401
 *   - not owner/admin       → 403
 *   - suspended/canceled    → 403 (lifecycle gate)
 *
 * Only reads/writes the control-plane Tenant doc; never touches a feature route, the per-tenant
 * data database, or the self-hosted User/bearer path.
 */

/** GET /api/saas/workspace/ai-key[?tenant=<slug>] — masked status of the stored key, if any. */
export async function GET(req: NextRequest) {
  return saasGuard(async () => {
    const slug = new URL(req.url).searchParams.get('tenant');
    const resolved = await resolveWorkspaceSession(slug, true);
    if ('response' in resolved) return resolved.response;
    const { session } = resolved;

    const masked = await describeTenantAiKey(session.ctx.tenantId!);
    return NextResponse.json({
      workspace: session.workspace.slug,
      configured: masked !== null,
      key: masked, // { provider, masked } or null — never plaintext
      cryptoReady: byoKeyReady(),
      providers: BYO_PROVIDERS,
    });
  });
}

/**
 * PUT /api/saas/workspace/ai-key — store (or overwrite) the tenant's own AI key.
 * Body: `{ provider, key, tenant? }`. Owner/admin only.
 */
export async function PUT(req: NextRequest) {
  return saasGuard(async () => {
    const body = await readBody(req);

    const resolved = await resolveWorkspaceSession(strField(body, 'tenant').trim() || null, true);
    if ('response' in resolved) return resolved.response;
    const { session } = resolved;

    const provider = strField(body, 'provider').trim();
    const key = typeof body.key === 'string' ? body.key : '';

    const result = await setTenantAiKey(session.ctx.tenantId!, provider, key);
    if (!result.ok) {
      if (result.reason === 'crypto_unavailable') {
        return NextResponse.json(
          { error: 'server is not configured to store secrets (AUTH_SECRET unset)', code: 'crypto_unavailable' },
          { status: 503 }
        );
      }
      if (result.reason === 'not_found') {
        return NextResponse.json({ error: 'workspace not found' }, { status: 404 });
      }
      return NextResponse.json(
        { error: `provider must be one of ${BYO_PROVIDERS.join(', ')} and key must be non-empty`, code: 'invalid' },
        { status: 400 }
      );
    }

    await recordAudit(session.ctx, {
      action: 'ai_key.set',
      actor: session.account.sub,
      target: session.workspace.slug,
      meta: { provider: result.masked.provider }, // provider only, never the key
    });

    return NextResponse.json({ configured: true, key: result.masked });
  });
}

/** DELETE /api/saas/workspace/ai-key — remove the tenant's key (revert to the platform key). */
export async function DELETE(req: NextRequest) {
  return saasGuard(async () => {
    const body = await readBody(req);

    const resolved = await resolveWorkspaceSession(strField(body, 'tenant').trim() || null, true);
    if ('response' in resolved) return resolved.response;
    const { session } = resolved;

    const removed = await clearTenantAiKey(session.ctx.tenantId!);
    if (!removed) {
      return NextResponse.json({ error: 'workspace not found' }, { status: 404 });
    }

    await recordAudit(session.ctx, {
      action: 'ai_key.cleared',
      actor: session.account.sub,
      target: session.workspace.slug,
    });

    return NextResponse.json({ configured: false });
  });
}
