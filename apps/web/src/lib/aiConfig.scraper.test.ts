import { describe, it, expect, vi } from 'vitest';

// Pure transform test for scraperConfig() in aiConfig.ts — the function that routes
// product/price extraction to the SEPARATE 'scraper' model (Settings → Scraper AI) instead
// of the main provider. aiConfig.ts pulls in db/tenancy/billing at import time, so mock them
// the same way aiConfig.tenant.test.ts does; scraperConfig itself touches none of them.
vi.mock('./tenancy/connection', () => ({ tenantDb: async () => ({}), tenantModel: () => ({}) }));
vi.mock('./tenancy/request', () => ({ softRequestTenant: async () => ({ isDefault: true }) }));
vi.mock('./tenancy/current', () => ({ currentTenant: () => ({ isDefault: true }), hasTenantContext: () => false }));
vi.mock('./db', () => ({ connectDB: async () => ({ connection: {} }) }));
vi.mock('@/models/AppConfig', () => ({ AppConfig: 'APPCONFIG' }));

import { scraperConfig, type AiConfig } from './aiConfig';

function base(overrides: Partial<AiConfig> = {}): AiConfig {
  return {
    provider: 'anthropic',
    ollamaHost: 'http://localhost:11434',
    ollamaModel: 'qwen2.5vl:7b',
    ollamaVisionModel: 'qwen2.5vl:7b',
    anthropicApiKey: 'sk-ant-xxx',
    anthropicModel: 'claude-sonnet-4-5-20250929',
    anthropicWorkspaceId: '',
    openaiApiKey: '', openaiModel: '', geminiApiKey: '', geminiModel: '',
    openrouterApiKey: '', openrouterModel: '', customBaseUrl: '', customApiKey: '', customModel: '',
    aiEnabled: true, aiFeatures: {}, aiOnboardingDismissed: false,
    scraperProvider: 'ollama', scraperModel: '',
    ...overrides,
  };
}

describe('scraperConfig', () => {
  it('routes to Anthropic + the scraper model when scraperProvider=anthropic and a key exists', () => {
    const out = scraperConfig(base({ scraperProvider: 'anthropic', scraperModel: 'claude-3-5-haiku-latest' }));
    expect(out.provider).toBe('anthropic');
    expect(out.anthropicModel).toBe('claude-3-5-haiku-latest'); // NOT the main sonnet
  });

  it('falls back to the main anthropic model when scraperProvider=anthropic but scraperModel is blank', () => {
    const out = scraperConfig(base({ scraperProvider: 'anthropic', scraperModel: '', anthropicModel: 'claude-sonnet-4-5-20250929' }));
    expect(out.provider).toBe('anthropic');
    expect(out.anthropicModel).toBe('claude-sonnet-4-5-20250929');
  });

  it('falls back to Ollama when the scraper is set to Anthropic but NO key is configured', () => {
    const out = scraperConfig(base({ scraperProvider: 'anthropic', scraperModel: 'claude-3-5-haiku-latest', anthropicApiKey: '' }));
    expect(out.provider).toBe('ollama');
    expect(out.ollamaModel).toBe('claude-3-5-haiku-latest'); // scraperModel wins as the ollama model name
  });

  it('routes to Ollama + the scraper model when scraperProvider=ollama', () => {
    const out = scraperConfig(base({ scraperProvider: 'ollama', scraperModel: 'qwen2.5:7b' }));
    expect(out.provider).toBe('ollama');
    expect(out.ollamaModel).toBe('qwen2.5:7b');
  });

  it('uses the main ollama model when scraperProvider=ollama and scraperModel is blank', () => {
    const out = scraperConfig(base({ scraperProvider: 'ollama', scraperModel: '', ollamaModel: 'qwen2.5vl:7b' }));
    expect(out.ollamaModel).toBe('qwen2.5vl:7b');
  });

  it('does not mutate the input config', () => {
    const input = base({ scraperProvider: 'anthropic', scraperModel: 'claude-3-5-haiku-latest' });
    const snapshot = { ...input };
    scraperConfig(input);
    expect(input).toEqual(snapshot);
  });
});
