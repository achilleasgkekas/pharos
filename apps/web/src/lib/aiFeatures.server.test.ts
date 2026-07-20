import { describe, it, expect, vi, beforeEach } from 'vitest';

// aiFeatures.server.ts is the central AI feature-gating seam — ~20 call sites across
// items/receipts/expenses/statements/subscriptions/vouchers/cards/shopping-list/
// jobActions/aiCommandActions call isFeatureEnabled() before running any AI, and the
// Settings → AI page's per-feature status pill reads aiFeatureStatus(). Both combine
// TWO independent sources (getAiConfig's master switch + per-feature override map,
// and isAiReady's provider check) — a regression here either silently disables every
// AI feature at once or lets a user-disabled feature run. Pin the exact 3-state
// combination logic with both seams mocked (getAiConfig, isAiReady), no DB.

const { getAiConfigMock, isAiReadyMock } = vi.hoisted(() => ({
  getAiConfigMock: vi.fn(),
  isAiReadyMock: vi.fn(),
}));

vi.mock('./aiConfig', () => ({ getAiConfig: getAiConfigMock }));
vi.mock('./ollama', () => ({ isAiReady: isAiReadyMock }));

import { isFeatureEnabled, aiFeatureStatus } from './aiFeatures.server';

/** aiEnabled defaults true, aiFeatures defaults to {} (absent key = enabled), matching
 *  the real getAiConfig's "default ON for existing installs" resolution. */
const cfg = (over: { aiEnabled?: boolean; aiFeatures?: Record<string, boolean> } = {}) => ({
  aiEnabled: true,
  aiFeatures: {},
  ...over,
});

beforeEach(() => {
  getAiConfigMock.mockReset();
  isAiReadyMock.mockReset();
  getAiConfigMock.mockResolvedValue(cfg());
  isAiReadyMock.mockResolvedValue(true);
});

describe('isFeatureEnabled', () => {
  it('is true when the master switch is on and the feature has no override', async () => {
    expect(await isFeatureEnabled('receipts')).toBe(true);
  });

  it('is false when the master switch is off, regardless of any per-feature override', async () => {
    getAiConfigMock.mockResolvedValue(cfg({ aiEnabled: false, aiFeatures: { receipts: true } }));
    expect(await isFeatureEnabled('receipts')).toBe(false);
  });

  it('is false when the master switch is on but this feature is explicitly disabled', async () => {
    getAiConfigMock.mockResolvedValue(cfg({ aiFeatures: { receipts: false } }));
    expect(await isFeatureEnabled('receipts')).toBe(false);
  });

  it('is true when the master switch is on and this feature is explicitly enabled', async () => {
    getAiConfigMock.mockResolvedValue(cfg({ aiFeatures: { receipts: true } }));
    expect(await isFeatureEnabled('receipts')).toBe(true);
  });

  it('only reads the override for the requested key — a sibling override does not leak across', async () => {
    getAiConfigMock.mockResolvedValue(cfg({ aiFeatures: { expenses: false } }));
    expect(await isFeatureEnabled('receipts')).toBe(true);
    expect(await isFeatureEnabled('expenses')).toBe(false);
  });

  it('never calls isAiReady — provider readiness is a separate concern', async () => {
    await isFeatureEnabled('receipts');
    expect(isAiReadyMock).not.toHaveBeenCalled();
  });
});

describe('aiFeatureStatus', () => {
  it("returns 'disabled' when the master switch is off, without checking provider readiness", async () => {
    getAiConfigMock.mockResolvedValue(cfg({ aiEnabled: false }));
    expect(await aiFeatureStatus('receipts')).toBe('disabled');
    expect(isAiReadyMock).not.toHaveBeenCalled();
  });

  it("returns 'disabled' when this specific feature is turned off, without checking provider readiness", async () => {
    getAiConfigMock.mockResolvedValue(cfg({ aiFeatures: { receipts: false } }));
    expect(await aiFeatureStatus('receipts')).toBe('disabled');
    expect(isAiReadyMock).not.toHaveBeenCalled();
  });

  it("returns 'no-provider' when the feature is enabled but no AI provider is ready", async () => {
    isAiReadyMock.mockResolvedValue(false);
    expect(await aiFeatureStatus('receipts')).toBe('no-provider');
  });

  it("returns 'ready' when the feature is enabled and a provider is ready", async () => {
    isAiReadyMock.mockResolvedValue(true);
    expect(await aiFeatureStatus('receipts')).toBe('ready');
  });

  it('checks isAiReady exactly once per call, after the enabled check passes', async () => {
    await aiFeatureStatus('cards');
    expect(isAiReadyMock).toHaveBeenCalledTimes(1);
  });
});
