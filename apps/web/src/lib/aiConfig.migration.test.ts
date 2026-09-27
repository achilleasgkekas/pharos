import { beforeEach, describe, expect, it, vi } from 'vitest';

// #359: a saved Claude model that Anthropic has retired fails on every call. getAiConfig swaps it
// for the replacement once, writes the swap back with a notice for Settings, and never lets a
// failed write break the read.

const { findOneLean, updateOne } = vi.hoisted(() => ({
  findOneLean: vi.fn(async () => null as Record<string, unknown> | null),
  updateOne: vi.fn(async (_filter: unknown, _update: unknown) => ({})),
}));

vi.mock('./db', () => ({ connectDB: vi.fn(async () => {}) }));
vi.mock('@/models/AppConfig', () => ({ AppConfig: {} }));
vi.mock('./tenancy/connection', () => ({
  tenantDb: vi.fn(async () => ({})),
  tenantModel: vi.fn(() => ({ findOne: () => ({ lean: findOneLean }), updateOne })),
}));
vi.mock('./tenancy/request', () => ({ softRequestTenant: vi.fn(async () => ({ isDefault: true, tenantId: '' })) }));
vi.mock('./tenancy/current', () => ({
  hasTenantContext: () => false,
  currentTenant: () => ({ isDefault: true, tenantId: '' }),
}));

import { getAiConfig, invalidateAiConfigCache, retiredModelSwaps } from './aiConfig';

beforeEach(() => {
  findOneLean.mockReset();
  updateOne.mockReset();
  updateOne.mockResolvedValue({});
  invalidateAiConfigCache(true);
});

describe('retiredModelSwaps', () => {
  it('lists each retired saved model with its replacement and retirement date', () => {
    const now = new Date('2026-09-27T10:00:00Z');
    expect(retiredModelSwaps({ anthropicModel: 'claude-sonnet-5', scraperModel: 'claude-3-5-haiku-latest' }, now)).toEqual([
      { field: 'scraperModel', from: 'claude-3-5-haiku-latest', to: 'claude-haiku-4-5', retiredOn: '2026-02-19', at: '2026-09-27T10:00:00.000Z' },
    ]);
  });

  it('ignores active Claude models, local model names and blanks', () => {
    expect(retiredModelSwaps({ anthropicModel: 'claude-sonnet-4-5-20250929', scraperModel: 'qwen2.5:14b' })).toEqual([]);
    expect(retiredModelSwaps({})).toEqual([]);
  });
});

describe('getAiConfig: retired saved models', () => {
  it('uses the replacement and writes the swap plus a notice back once', async () => {
    findOneLean.mockResolvedValueOnce({ aiProvider: 'anthropic', anthropicApiKey: 'k', anthropicModel: 'claude-3-7-sonnet-latest', scraperModel: 'claude-3-5-haiku-latest' });
    const cfg = await getAiConfig();
    expect(cfg.anthropicModel).toBe('claude-sonnet-5');
    expect(cfg.scraperModel).toBe('claude-haiku-4-5');
    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = updateOne.mock.calls[0] as [unknown, { $set: unknown; $push: { aiModelNotices: { $each: { from: string }[] } } }];
    expect(filter).toEqual({ key: 'singleton' });
    expect(update.$set).toEqual({ anthropicModel: 'claude-sonnet-5', scraperModel: 'claude-haiku-4-5' });
    expect(update.$push.aiModelNotices.$each.map((n) => n.from)).toEqual(['claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest']);
  });

  it('writes nothing when every saved model is still available', async () => {
    findOneLean.mockResolvedValueOnce({ aiProvider: 'anthropic', anthropicApiKey: 'k', anthropicModel: 'claude-haiku-4-5' });
    const cfg = await getAiConfig();
    expect(cfg.anthropicModel).toBe('claude-haiku-4-5');
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('still returns the replacement when the write fails', async () => {
    findOneLean.mockResolvedValueOnce({ aiProvider: 'anthropic', anthropicApiKey: 'k', anthropicModel: 'claude-3-opus-20240229' });
    updateOne.mockRejectedValueOnce(new Error('db down'));
    const cfg = await getAiConfig();
    expect(cfg.anthropicModel).toBe('claude-opus-5');
  });

  it('defaults a new install to the recommended model', async () => {
    findOneLean.mockResolvedValueOnce(null);
    expect((await getAiConfig()).anthropicModel).toBe('claude-sonnet-5');
  });
});
