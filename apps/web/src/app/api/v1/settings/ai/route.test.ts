import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// GET+PATCH /api/v1/settings/ai backs the Settings → AI section (master switch,
// provider/model/readiness, per-feature toggles). Three pieces of behaviour live only in this
// route, so a drift here is invisible until an API client silently turns AI on or off:
//   GET  - ABSENT feature key means ON (a feature shipped in a later release must not read as
//          off on an install whose aiFeatures map predates it),
//        - the derived per-feature status: master-off OR feature-off → 'disabled', else
//          'ready'/'no-provider' from the provider probe (which is skipped entirely when the
//          master switch is off — a disabled install must not poke a local Ollama),
//        - the response NEVER carries a credential (this is the whole reason an API client
//          may read AI settings at all).
//   PATCH- admin-only (a member may write expenses but must not turn on a metered provider),
//        - unknown feature keys are dropped, not stored,
//        - the "no valid fields → 400" guard, and invalidateOllamaHealth firing only when the
//          master switch itself moved.
// The real apiAuth wrapper runs (so the 401/403 gates are genuinely exercised); the DB, the AI
// config and the readiness probe are mocked.

const {
  connectDBMock,
  userFindOne,
  userState,
  appConfigUpdateOne,
  getAiConfigMock,
  aiState,
  invalidateAiMock,
  invalidateHealthMock,
  isAiReadyMock,
} = vi.hoisted(() => {
  const aiState = {
    cfg: {
      provider: 'anthropic',
      ollamaHost: 'http://localhost:11434',
      ollamaModel: 'qwen2.5:14b',
      ollamaVisionModel: 'qwen2.5vl:7b',
      anthropicApiKey: 'sk-ant-super-secret',
      anthropicModel: 'claude-sonnet-4-5-20250929',
      openaiApiKey: '',
      openaiModel: 'gpt-4o-mini',
      geminiApiKey: '',
      geminiModel: 'gemini-2.0-flash',
      openrouterApiKey: '',
      openrouterModel: 'openai/gpt-4o-mini',
      customBaseUrl: '',
      customApiKey: '',
      customModel: '',
      aiEnabled: true,
      aiFeatures: {} as Record<string, boolean>,
      aiOnboardingDismissed: false,
    },
    ready: true,
  };
  const userState: { doc: unknown } = { doc: { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' } };
  return {
    connectDBMock: vi.fn(async () => {}),
    userFindOne: vi.fn(() => ({ select: () => ({ lean: async () => userState.doc }) })),
    userState,
    appConfigUpdateOne: vi.fn(async () => ({ acknowledged: true })),
    getAiConfigMock: vi.fn(async () => aiState.cfg),
    aiState,
    invalidateAiMock: vi.fn(),
    invalidateHealthMock: vi.fn(),
    isAiReadyMock: vi.fn(async () => aiState.ready),
  };
});

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/User', () => ({ User: { findOne: userFindOne } }));
vi.mock('@/models/AppConfig', () => ({ AppConfig: { updateOne: appConfigUpdateOne } }));
vi.mock('@/lib/aiConfig', () => ({
  getAiConfig: getAiConfigMock,
  invalidateAiConfigCache: invalidateAiMock,
}));
vi.mock('@/lib/ollama', () => ({
  isAiReady: isAiReadyMock,
  invalidateOllamaHealth: invalidateHealthMock,
}));

import { GET, PATCH } from './route';

// withAuth now resolves models through currentModel(). SAAS_MODE is off in tests, so the real
// helper would hand back the same model anyway; this keeps the DB seam mocked without a connection.
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: unknown) => m }));

const BASE = 'http://pharos.local/api/v1/settings/ai';

function makeReq(opts: { auth?: string | null; body?: unknown } = {}): NextRequest {
  const auth = opts.auth === undefined ? 'Bearer tok' : opts.auth;
  return {
    url: BASE,
    headers: { get: (h: string) => (h.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => opts.body ?? {},
  } as unknown as NextRequest;
}

function lastSet(): Record<string, unknown> {
  const call = appConfigUpdateOne.mock.calls.at(-1) as unknown as [unknown, { $set: Record<string, unknown> }];
  return call[1].$set;
}

beforeEach(() => {
  aiState.cfg.provider = 'anthropic';
  aiState.cfg.aiEnabled = true;
  aiState.cfg.aiFeatures = {};
  aiState.ready = true;
  userState.doc = { _id: 'u1', name: 'Achilleas', username: 'ach', role: 'admin' };
  vi.clearAllMocks();
  userFindOne.mockImplementation(() => ({ select: () => ({ lean: async () => userState.doc }) }));
  getAiConfigMock.mockImplementation(async () => aiState.cfg);
  isAiReadyMock.mockImplementation(async () => aiState.ready);
});

describe('auth gate', () => {
  it('GET without a token → 401, never reads the AI config', async () => {
    const res = await GET(makeReq({ auth: null }));
    expect(res.status).toBe(401);
    expect(getAiConfigMock).not.toHaveBeenCalled();
  });

  it('PATCH as a viewer → 403 from the read-only wrapper, nothing written', async () => {
    userState.doc = { _id: 'u2', name: 'Guest', username: 'guest', role: 'viewer' };
    const res = await PATCH(makeReq({ body: { aiEnabled: false } }));
    expect(res.status).toBe(403);
    expect(appConfigUpdateOne).not.toHaveBeenCalled();
  });

  it('PATCH as a member → 403 (AI config is admin-only, mirroring the web actions)', async () => {
    userState.doc = { _id: 'u3', name: 'Flatmate', username: 'mate', role: 'member' };
    const res = await PATCH(makeReq({ body: { aiEnabled: false } }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Admin only' });
    expect(appConfigUpdateOne).not.toHaveBeenCalled();
  });

  it('GET as a member is allowed (reading why a scan button is inert is not privileged)', async () => {
    userState.doc = { _id: 'u3', name: 'Flatmate', username: 'mate', role: 'member' };
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect((await res.json()).canEdit).toBe(false);
  });
});

describe('GET shape', () => {
  it('reports the resolved provider + its model, and never a credential', async () => {
    const body = await (await GET(makeReq())).json();
    expect(body.provider).toBe('anthropic');
    expect(body.model).toBe('claude-sonnet-4-5-20250929');
    expect(body.aiEnabled).toBe(true);
    expect(body.ready).toBe(true);
    expect(body.canEdit).toBe(true);
    expect(JSON.stringify(body)).not.toContain('sk-ant');
    expect(JSON.stringify(body)).not.toMatch(/apiKey|ApiKey|baseUrl|ollamaHost/);
  });

  it('falls back to the Ollama model when that is the provider', async () => {
    aiState.cfg.provider = 'ollama';
    const body = await (await GET(makeReq())).json();
    expect(body.model).toBe('qwen2.5:14b');
    expect(body.visionModel).toBe('qwen2.5vl:7b');
  });

  it('an absent feature key reads as ENABLED', async () => {
    const body = await (await GET(makeReq())).json();
    expect(body.features.length).toBeGreaterThan(5);
    expect(body.features.every((f: { enabled: boolean }) => f.enabled)).toBe(true);
    expect(body.features.every((f: { status: string }) => f.status === 'ready')).toBe(true);
  });

  it('an explicitly false feature reads as disabled while its siblings stay ready', async () => {
    aiState.cfg.aiFeatures = { receipts: false };
    const body = await (await GET(makeReq())).json();
    const receipts = body.features.find((f: { key: string }) => f.key === 'receipts');
    const vouchers = body.features.find((f: { key: string }) => f.key === 'vouchers');
    expect(receipts).toMatchObject({ enabled: false, status: 'disabled' });
    expect(vouchers).toMatchObject({ enabled: true, status: 'ready' });
  });

  it('provider not reachable → every enabled feature is no-provider', async () => {
    aiState.ready = false;
    const body = await (await GET(makeReq())).json();
    expect(body.ready).toBe(false);
    expect(body.features.every((f: { status: string }) => f.status === 'no-provider')).toBe(true);
  });

  it('master switch off → ready false, all disabled, and the probe is never run', async () => {
    aiState.cfg.aiEnabled = false;
    const body = await (await GET(makeReq())).json();
    expect(body.aiEnabled).toBe(false);
    expect(body.ready).toBe(false);
    expect(body.features.every((f: { status: string }) => f.status === 'disabled')).toBe(true);
    expect(isAiReadyMock).not.toHaveBeenCalled();
  });
});

describe('PATCH writes', () => {
  it('flips the master switch and invalidates both caches', async () => {
    const res = await PATCH(makeReq({ body: { aiEnabled: false } }));
    expect(res.status).toBe(200);
    expect(lastSet()).toEqual({ aiEnabled: false });
    expect(invalidateAiMock).toHaveBeenCalled();
    expect(invalidateHealthMock).toHaveBeenCalled();
  });

  it('writes feature toggles as dotted paths and leaves the health cache alone', async () => {
    const res = await PATCH(makeReq({ body: { features: { receipts: false, commandBar: true } } }));
    expect(res.status).toBe(200);
    expect(lastSet()).toEqual({ 'aiFeatures.receipts': false, 'aiFeatures.commandBar': true });
    expect(invalidateAiMock).toHaveBeenCalled();
    expect(invalidateHealthMock).not.toHaveBeenCalled();
  });

  it('drops unknown feature keys and non-boolean values', async () => {
    const res = await PATCH(
      makeReq({ body: { features: { receipts: false, notAFeature: true, vouchers: 'yes' } } })
    );
    expect(res.status).toBe(200);
    expect(lastSet()).toEqual({ 'aiFeatures.receipts': false });
  });

  it('a body with nothing writable → 400, no write', async () => {
    const res = await PATCH(makeReq({ body: { aiEnabled: 'off', features: { nope: true } } }));
    expect(res.status).toBe(400);
    expect(appConfigUpdateOne).not.toHaveBeenCalled();
  });

  it('never lets a credential through, even when the body asks nicely', async () => {
    const res = await PATCH(makeReq({ body: { anthropicApiKey: 'sk-evil', aiEnabled: true } }));
    expect(res.status).toBe(200);
    expect(lastSet()).toEqual({ aiEnabled: true });
  });
});
