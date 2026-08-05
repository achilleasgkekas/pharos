import { NextRequest, NextResponse } from 'next/server';
import { saasGuard } from '@/lib/tenancy/saasApi';
import { requireSuperadmin } from '@/lib/tenancy/superadmin';
import { readBody, strField } from '@/lib/apiBody';
import { recordAudit, auditCtx } from '@/lib/tenancy/audit';
import { setPlatformAiKey, clearPlatformAiKey, describePlatformAiKey } from '@/lib/billing/platformKeyStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The PLATFORM AI key — one provider key every workspace without its own runs on, and the one
 * their AI charges are computed against (lib/billing/aiBilling).
 *
 * GET    → masked description (provider + tail, when it was set, by whom). NEVER plaintext.
 * PUT    → set/replace it. Body: `{ provider, key }`.
 * DELETE → remove it. The fleet then falls back to ANTHROPIC_API_KEY, or to no AI at all.
 *
 * Operator gate (requireSuperadmin), not per-workspace authz: SAAS_MODE off or an empty
 * allowlist is a 404, not signed in 401, signed in but not an operator 403.
 *
 * The key is encrypted at rest with the same path as the per-tenant BYO keys, and there is no
 * read-back: once stored, the only thing that can produce the plaintext is AI dispatch.
 */
export async function GET() {
  return saasGuard(async () => {
    const gate = await requireSuperadmin();
    if ('response' in gate) return gate.response;
    return NextResponse.json(await describePlatformAiKey());
  });
}

export async function PUT(req: NextRequest) {
  return saasGuard(async () => {
    const gate = await requireSuperadmin();
    if ('response' in gate) return gate.response;
    const account = gate.account.email;

    const body = await readBody(req);
    const result = await setPlatformAiKey(strField(body, 'provider'), strField(body, 'key'), account);
    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            result.reason === 'crypto-unavailable'
              ? 'this server is not configured to store secrets (AUTH_SECRET)'
              : 'provider must be one of anthropic, openai, gemini, openrouter, custom, and the key must not be blank',
        },
        { status: result.reason === 'crypto-unavailable' ? 503 : 400 }
      );
    }

    // Audited with the provider and WHO changed it, never the key or any part of it.
    await recordAudit(auditCtx(null), {
      action: 'platform.ai_key_set',
      actor: account,
      target: 'platform',
      meta: { provider: result.masked.provider },
    });
    return NextResponse.json({ ok: true, masked: result.masked });
  });
}

export async function DELETE() {
  return saasGuard(async () => {
    const gate = await requireSuperadmin();
    if ('response' in gate) return gate.response;
    const account = gate.account.email;
    await clearPlatformAiKey(account);
    await recordAudit(auditCtx(null), {
      action: 'platform.ai_key_cleared',
      actor: account,
      target: 'platform',
      meta: {},
    });
    return NextResponse.json({ ok: true });
  });
}
