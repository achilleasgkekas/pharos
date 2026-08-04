import { describe, it, expect, vi, beforeEach } from 'vitest';

// The hosted (SaaS) half of getAiConfig: a workspace keeps its provider key encrypted in the
// CONTROL plane (the BYO-key panel), not in its own AppConfig.
//
// Before this, resolveTenantAiKey existed, was documented "call on-demand at dispatch", and
// had NO callers. The key was write-only: stored, masked back to the user, exempted from AI
// metering, and never handed to a provider. getAiConfig then saw an empty key, hit its
// "half-configured cloud provider" fallback, and quietly demoted the workspace to Ollama —
// which does not exist on the hosted server. A customer who had configured everything
// correctly got no AI at all, and a provider that would not stay on what they picked.
//
// Pinned here: the key is injected for the right provider, a control-plane failure degrades
// to the old behaviour instead of breaking every AI call, and the SELF-HOSTED path never
// touches the tenancy graph at all.

const { connectDBMock, findOneLean, currentTenantMock, resolveTenantAiKeyMock } = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  findOneLean: vi.fn(async () => ({}) as Record<string, any> | null),
  currentTenantMock: vi.fn(() => ({ isDefault: true, tenantId: '' }) as { isDefault: boolean; tenantId: string }),
  resolveTenantAiKeyMock: vi.fn(async (_id: string) => null as { provider: string; key: string } | null),
}));

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/models/AppConfig', () => ({ AppConfig: {} }));
vi.mock('./tenancy/connection', () => ({ currentModel: async () => ({ findOne: () => ({ lean: findOneLean }) }) }));
vi.mock('./tenancy/current', () => ({ currentTenant: () => currentTenantMock() }));
vi.mock('./billing/byoKeyStore', () => ({ resolveTenantAiKey: (id: string) => resolveTenantAiKeyMock(id) }));

import { getAiConfig, invalidateAiConfigCache } from './aiConfig';

const HOSTED = { isDefault: false, tenantId: 'tenant-1' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  // The 5s per-tenant cache would otherwise leak one test's answer into the next.
  invalidateAiConfigCache(true);
  currentTenantMock.mockReturnValue({ isDefault: true, tenantId: '' });
  findOneLean.mockResolvedValue({});
  resolveTenantAiKeyMock.mockResolvedValue(null);
});

describe('getAiConfig — hosted workspace BYO key', () => {
  it('hands the stored key to the provider it belongs to', async () => {
    currentTenantMock.mockReturnValue(HOSTED);
    resolveTenantAiKeyMock.mockResolvedValue({ provider: 'anthropic', key: 'sk-ant-real' });
    findOneLean.mockResolvedValue({ aiProvider: 'anthropic', anthropicModel: 'claude-sonnet-4-5-20250929' });

    const cfg = await getAiConfig();
    expect(resolveTenantAiKeyMock).toHaveBeenCalledWith('tenant-1');
    expect(cfg.anthropicApiKey).toBe('sk-ant-real');
    expect(cfg.provider).toBe('anthropic'); // no longer demoted to ollama
    expect(cfg.anthropicModel).toBe('claude-sonnet-4-5-20250929'); // the chosen model survives
  });

  it.each([
    ['openai', 'openaiApiKey'],
    ['gemini', 'geminiApiKey'],
    ['openrouter', 'openrouterApiKey'],
    ['custom', 'customApiKey'],
  ] as const)('routes a %s key to the right field', async (provider, field) => {
    currentTenantMock.mockReturnValue(HOSTED);
    resolveTenantAiKeyMock.mockResolvedValue({ provider, key: `key-${provider}` });
    const cfg = await getAiConfig();
    expect(cfg[field]).toBe(`key-${provider}`);
  });

  it('adopts the key\'s provider when the workspace never picked one', async () => {
    // Storing a key IS the choice; requiring the same answer twice in two panels is how the
    // BYO panel ended up meaning nothing.
    currentTenantMock.mockReturnValue(HOSTED);
    resolveTenantAiKeyMock.mockResolvedValue({ provider: 'anthropic', key: 'sk-ant' });
    findOneLean.mockResolvedValue({}); // no aiProvider saved → defaults to 'ollama'
    const cfg = await getAiConfig();
    expect(cfg.provider).toBe('anthropic');
  });

  it('does not override a cloud provider the workspace explicitly chose', async () => {
    // An in-app choice with its own key in AppConfig is a deliberate override.
    currentTenantMock.mockReturnValue(HOSTED);
    resolveTenantAiKeyMock.mockResolvedValue({ provider: 'anthropic', key: 'sk-ant' });
    findOneLean.mockResolvedValue({ aiProvider: 'openai', openaiApiKey: 'sk-openai' });
    const cfg = await getAiConfig();
    expect(cfg.provider).toBe('openai');
    expect(cfg.openaiApiKey).toBe('sk-openai');
    expect(cfg.anthropicApiKey).toBe('sk-ant'); // still injected, just not selected
  });

  it('ignores an unrecognised provider id instead of guessing', async () => {
    currentTenantMock.mockReturnValue(HOSTED);
    resolveTenantAiKeyMock.mockResolvedValue({ provider: 'not-a-provider', key: 'k' });
    const cfg = await getAiConfig();
    expect(cfg.provider).toBe('ollama');
    expect(cfg.anthropicApiKey).toBe('');
  });

  it('falls back to Ollama, not to a crash, when the control plane is unreachable', async () => {
    currentTenantMock.mockReturnValue(HOSTED);
    resolveTenantAiKeyMock.mockRejectedValue(new Error('control plane down'));
    findOneLean.mockResolvedValue({ aiProvider: 'anthropic' });
    await expect(getAiConfig()).resolves.toMatchObject({ provider: 'ollama' });
  });

  it('leaves a workspace with no stored key exactly as it was', async () => {
    currentTenantMock.mockReturnValue(HOSTED);
    resolveTenantAiKeyMock.mockResolvedValue(null);
    findOneLean.mockResolvedValue({ aiProvider: 'anthropic' });
    const cfg = await getAiConfig();
    expect(cfg.provider).toBe('ollama'); // unchanged: still a half-configured provider
  });

  it('never reaches for the control plane on a self-hosted install', async () => {
    currentTenantMock.mockReturnValue({ isDefault: true, tenantId: '' });
    findOneLean.mockResolvedValue({ aiProvider: 'anthropic', anthropicApiKey: 'sk-local' });
    const cfg = await getAiConfig();
    expect(resolveTenantAiKeyMock).not.toHaveBeenCalled();
    expect(cfg.anthropicApiKey).toBe('sk-local');
    expect(cfg.provider).toBe('anthropic');
  });
});

describe('getAiConfig — the key lookup is bounded', () => {
  it('gives up on a control-plane query that hangs instead of stalling the AI call', async () => {
    // getAiConfig runs in front of every parse. A control-plane query that never answers
    // (as opposed to failing) would freeze receipt scanning app-wide.
    vi.useFakeTimers();
    try {
      currentTenantMock.mockReturnValue(HOSTED);
      resolveTenantAiKeyMock.mockImplementation(() => new Promise(() => {})); // never settles
      findOneLean.mockResolvedValue({ aiProvider: 'anthropic' });

      const p = getAiConfig();
      await vi.advanceTimersByTimeAsync(3000);
      await expect(p).resolves.toMatchObject({ provider: 'ollama', anthropicApiKey: '' });
    } finally {
      vi.useRealTimers();
    }
  });
});
