import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET/PUT/DELETE /api/saas/workspace/ai-key is the BYO-key settings panel (D5) — let an
// owner/admin store their own encrypted AI provider key so their AI calls run unmetered on
// the platform. Zero route-level coverage before this file. The plaintext-handling pieces
// (encodeAiKey/decodeAiKey/maskAiKey, planAiKeyUpdate/planAiKeyClear) already have full unit
// coverage elsewhere — this file mocks at the byoKeyStore module boundary and covers only what
// the route itself is responsible for:
//   - resolveWorkspaceSession's short-circuit response is passed straight through untouched,
//   - all three verbs resolve with requireManage=true (owner/admin only — a security setting),
//   - PUT/DELETE forward the trimmed ?tenant body field (empty → null),
//   - setTenantAiKey's three failure reasons map to their distinct status codes (503/404/400),
//   - a successful PUT/DELETE audits the correct action/actor/target/meta (provider only, never
//     the key),
//   - GET never leaks a plaintext key, only the masked view + cryptoReady + provider list,
//   - a mid-handler throw becomes a clean 500 JSON (saasGuard), not an HTML crash page.

const {
  resolveWorkspaceSessionMock,
  setTenantAiKeyMock,
  clearTenantAiKeyMock,
  describeTenantAiKeyMock,
  byoKeyReadyMock,
  recordAuditMock,
} = vi.hoisted(() => ({
  resolveWorkspaceSessionMock: vi.fn(),
  setTenantAiKeyMock: vi.fn(),
  clearTenantAiKeyMock: vi.fn(async () => true),
  describeTenantAiKeyMock: vi.fn(async () => null as { provider: string; masked: string } | null),
  byoKeyReadyMock: vi.fn(() => true),
  recordAuditMock: vi.fn(async () => true),
}));

vi.mock('@/lib/tenancy/workspaceSession', () => ({ resolveWorkspaceSession: resolveWorkspaceSessionMock }));
vi.mock('@/lib/billing/byoKey', () => ({
  byoKeyReady: byoKeyReadyMock,
  BYO_PROVIDERS: ['anthropic', 'openai', 'gemini', 'openrouter', 'custom'],
}));
vi.mock('@/lib/billing/byoKeyStore', () => ({
  setTenantAiKey: setTenantAiKeyMock,
  clearTenantAiKey: clearTenantAiKeyMock,
  describeTenantAiKey: describeTenantAiKeyMock,
}));
vi.mock('@/lib/tenancy/audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tenancy/audit')>('@/lib/tenancy/audit');
  return { ...actual, recordAudit: recordAuditMock }; // auditCtx/etc stay real (pure)
});

import { GET, PUT, DELETE } from './route';
import { NextResponse } from 'next/server';

function makeReq(
  body: unknown = {},
  url = 'https://app.example.com/api/saas/workspace/ai-key'
): NextRequest {
  return { json: async () => body, url } as unknown as NextRequest;
}

function makeSession(over: Record<string, unknown> = {}, role = 'owner') {
  return {
    session: {
      account: { sub: 'acc1', email: 'owner@example.com' },
      workspace: { tenantId: 'tenant1', slug: 'acme', name: 'Acme', role, plan: 'free', status: 'active' },
      ctx: { tenantId: 'tenant1', isDefault: false },
      tenant: { _id: 'tenant1', slug: 'acme', name: 'Acme', ...over },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveWorkspaceSessionMock.mockResolvedValue(makeSession());
  setTenantAiKeyMock.mockResolvedValue({
    ok: true,
    masked: { provider: 'anthropic', masked: 'sk-...abcd' },
  });
  clearTenantAiKeyMock.mockResolvedValue(true);
  describeTenantAiKeyMock.mockResolvedValue(null);
  byoKeyReadyMock.mockReturnValue(true);
  recordAuditMock.mockResolvedValue(true);
});

describe('GET — masked key status', () => {
  it('passes through resolveWorkspaceSession short-circuit untouched', async () => {
    const blocked = NextResponse.json({ error: 'not authenticated' }, { status: 401 });
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await GET(makeReq());

    expect(res).toBe(blocked);
    expect(describeTenantAiKeyMock).not.toHaveBeenCalled();
  });

  it('resolves with requireManage=true and forwards the ?tenant= slug', async () => {
    await GET(makeReq(undefined, 'https://app.example.com/api/saas/workspace/ai-key?tenant=OtherSlug'));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith('OtherSlug', true);
  });

  it('no key stored → configured:false, key:null', async () => {
    const res = await GET(makeReq());
    const json = (await res.json()) as { workspace: string; configured: boolean; key: unknown };

    expect(json.workspace).toBe('acme');
    expect(json.configured).toBe(false);
    expect(json.key).toBeNull();
  });

  it('key stored → configured:true, masked view only, never the plaintext', async () => {
    describeTenantAiKeyMock.mockResolvedValueOnce({ provider: 'openai', masked: 'sk-...9f2a' });

    const res = await GET(makeReq());
    const json = (await res.json()) as {
      configured: boolean;
      key: { provider: string; masked: string };
      cryptoReady: boolean;
      providers: string[];
    };

    expect(json.configured).toBe(true);
    expect(json.key).toEqual({ provider: 'openai', masked: 'sk-...9f2a' });
    expect(JSON.stringify(json)).not.toContain('plaintext');
    expect(json.providers).toContain('anthropic');
  });

  it('reflects cryptoReady from byoKeyReady()', async () => {
    byoKeyReadyMock.mockReturnValueOnce(false);

    const res = await GET(makeReq());
    const json = (await res.json()) as { cryptoReady: boolean };

    expect(json.cryptoReady).toBe(false);
  });

  it('mid-handler throw → clean 500 JSON (saasGuard)', async () => {
    describeTenantAiKeyMock.mockRejectedValueOnce(new Error('mongo down'));

    const res = await GET(makeReq());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toBe('mongo down');
  });
});

describe('PUT — store the tenant key', () => {
  it('passes through resolveWorkspaceSession short-circuit untouched, before any write', async () => {
    const blocked = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await PUT(makeReq({ provider: 'anthropic', key: 'sk-123' }));

    expect(res).toBe(blocked);
    expect(setTenantAiKeyMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('resolves with requireManage=true and forwards the trimmed tenant body field', async () => {
    await PUT(makeReq({ provider: 'anthropic', key: 'sk-123', tenant: '  OtherSlug  ' }));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith('OtherSlug', true);
  });

  it('empty/blank tenant field resolves as null', async () => {
    await PUT(makeReq({ provider: 'anthropic', key: 'sk-123', tenant: '   ' }));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith(null, true);
  });

  it('crypto_unavailable → 503, zero audit', async () => {
    setTenantAiKeyMock.mockResolvedValueOnce({ ok: false, reason: 'crypto_unavailable' });

    const res = await PUT(makeReq({ provider: 'anthropic', key: 'sk-123' }));
    const json = (await res.json()) as { error: string; code: string };

    expect(res.status).toBe(503);
    expect(json.code).toBe('crypto_unavailable');
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('not_found (tenant vanished mid-flight) → 404, zero audit', async () => {
    setTenantAiKeyMock.mockResolvedValueOnce({ ok: false, reason: 'not_found' });

    const res = await PUT(makeReq({ provider: 'anthropic', key: 'sk-123' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(404);
    expect(json.error).toMatch(/workspace not found/i);
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('invalid (bad provider or empty key) → 400, zero audit', async () => {
    setTenantAiKeyMock.mockResolvedValueOnce({ ok: false, reason: 'invalid' });

    const res = await PUT(makeReq({ provider: 'not-a-provider', key: '' }));
    const json = (await res.json()) as { error: string; code: string };

    expect(res.status).toBe(400);
    expect(json.code).toBe('invalid');
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('success → audits ai_key.set with provider only (never the key), returns masked view', async () => {
    const res = await PUT(makeReq({ provider: 'anthropic', key: 'sk-super-secret' }));
    const json = (await res.json()) as { configured: boolean; key: { provider: string; masked: string } };

    expect(setTenantAiKeyMock).toHaveBeenCalledWith('tenant1', 'anthropic', 'sk-super-secret');
    expect(recordAuditMock).toHaveBeenCalledWith(
      { tenantId: 'tenant1', isDefault: false },
      { action: 'ai_key.set', actor: 'acc1', target: 'acme', meta: { provider: 'anthropic' } }
    );
    const auditCall = recordAuditMock.mock.calls[0] as unknown as [unknown, { meta: Record<string, unknown> }];
    expect(JSON.stringify(auditCall[1].meta)).not.toContain('sk-super-secret');
    expect(json.configured).toBe(true);
    expect(json.key.masked).toBe('sk-...abcd');
  });

  it('non-string key body field is coerced to empty string before setTenantAiKey', async () => {
    await PUT(makeReq({ provider: 'anthropic', key: 12345 }));
    expect(setTenantAiKeyMock).toHaveBeenCalledWith('tenant1', 'anthropic', '');
  });

  it('mid-handler throw → clean 500 JSON (saasGuard)', async () => {
    setTenantAiKeyMock.mockRejectedValueOnce(new Error('mongo down'));

    const res = await PUT(makeReq({ provider: 'anthropic', key: 'sk-123' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toBe('mongo down');
  });
});

describe('DELETE — clear the tenant key', () => {
  it('passes through resolveWorkspaceSession short-circuit untouched, before any write', async () => {
    const blocked = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    resolveWorkspaceSessionMock.mockResolvedValueOnce({ response: blocked });

    const res = await DELETE(makeReq());

    expect(res).toBe(blocked);
    expect(clearTenantAiKeyMock).not.toHaveBeenCalled();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('resolves with requireManage=true and forwards the trimmed tenant body field', async () => {
    await DELETE(makeReq({ tenant: '  OtherSlug  ' }));
    expect(resolveWorkspaceSessionMock).toHaveBeenCalledWith('OtherSlug', true);
  });

  it('tenant vanished mid-flight (no match) → 404, zero audit', async () => {
    clearTenantAiKeyMock.mockResolvedValueOnce(false);

    const res = await DELETE(makeReq());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(404);
    expect(json.error).toMatch(/workspace not found/i);
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it('success → clears the key, audits ai_key.cleared, returns configured:false', async () => {
    const res = await DELETE(makeReq());
    const json = (await res.json()) as { configured: boolean };

    expect(clearTenantAiKeyMock).toHaveBeenCalledWith('tenant1');
    expect(recordAuditMock).toHaveBeenCalledWith(
      { tenantId: 'tenant1', isDefault: false },
      { action: 'ai_key.cleared', actor: 'acc1', target: 'acme' }
    );
    expect(json.configured).toBe(false);
  });

  it('mid-handler throw → clean 500 JSON (saasGuard)', async () => {
    clearTenantAiKeyMock.mockRejectedValueOnce(new Error('mongo down'));

    const res = await DELETE(makeReq());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(json.error).toBe('mongo down');
  });
});
