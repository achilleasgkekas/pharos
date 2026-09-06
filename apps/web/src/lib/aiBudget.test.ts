import { describe, it, expect, vi, beforeEach } from 'vitest';

// Self-hosted AI spend cap. Mocks the DB (AppConfig singleton) and saasMode so we pin the
// pure logic: monthly rollover, the capped decision, the gate throwing, and the
// increment-vs-seed write path — without a real Mongo.

const { findOneLean, updateOne, saasModeMock } = vi.hoisted(() => ({
  findOneLean: vi.fn(async () => null as Record<string, unknown> | null),
  updateOne: vi.fn(async (_filter: Record<string, unknown>, _update: Record<string, unknown>, _opts?: Record<string, unknown>) => ({ matchedCount: 1 })),
  saasModeMock: vi.fn(() => false),
}));

vi.mock('./db', () => ({ connectDB: async () => {} }));
vi.mock('@/models/AppConfig', () => ({
  AppConfig: {
    findOne: () => ({ select: () => ({ lean: findOneLean }) }),
    updateOne,
  },
}));
vi.mock('./tenancy/saasMode', () => ({ saasMode: saasModeMock }));

import { budgetPeriod, getAiBudgetStatus, assertAiBudget, recordAiSpend, AiBudgetExceededError } from './aiBudget';

const THIS_MONTH = budgetPeriod();

beforeEach(() => {
  vi.clearAllMocks();
  saasModeMock.mockReturnValue(false);
  findOneLean.mockResolvedValue(null);
  updateOne.mockResolvedValue({ matchedCount: 1 });
});

describe('budgetPeriod', () => {
  it('is a UTC YYYY-MM key', () => {
    expect(budgetPeriod(new Date('2026-09-06T23:30:00Z'))).toBe('2026-09');
    expect(budgetPeriod(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
  });
});

describe('getAiBudgetStatus', () => {
  it('reports this month spend + capped when at/over budget', async () => {
    findOneLean.mockResolvedValue({ aiMonthlyBudget: 10, aiSpendPeriod: THIS_MONTH, aiSpendMicros: 12_000_000 }); // $12
    const s = await getAiBudgetStatus();
    expect(s).toMatchObject({ budget: 10, spent: 12, period: THIS_MONTH, capped: true });
  });

  it('treats a stale stored period as spent: 0 (implicit monthly rollover)', async () => {
    findOneLean.mockResolvedValue({ aiMonthlyBudget: 10, aiSpendPeriod: '2000-01', aiSpendMicros: 99_000_000 });
    const s = await getAiBudgetStatus();
    expect(s.spent).toBe(0);
    expect(s.capped).toBe(false);
  });

  it('budget 0 (no cap) is never capped even with spend', async () => {
    findOneLean.mockResolvedValue({ aiMonthlyBudget: 0, aiSpendPeriod: THIS_MONTH, aiSpendMicros: 5_000_000 });
    const s = await getAiBudgetStatus();
    expect(s).toMatchObject({ budget: 0, capped: false });
  });
});

describe('assertAiBudget', () => {
  it('throws AiBudgetExceededError when capped', async () => {
    findOneLean.mockResolvedValue({ aiMonthlyBudget: 5, aiSpendPeriod: THIS_MONTH, aiSpendMicros: 6_000_000 });
    await expect(assertAiBudget()).rejects.toBeInstanceOf(AiBudgetExceededError);
  });

  it('passes when under budget', async () => {
    findOneLean.mockResolvedValue({ aiMonthlyBudget: 5, aiSpendPeriod: THIS_MONTH, aiSpendMicros: 1_000_000 });
    await expect(assertAiBudget()).resolves.toBeUndefined();
  });

  it('is a no-op in SaaS mode (never reads or throws)', async () => {
    saasModeMock.mockReturnValue(true);
    findOneLean.mockResolvedValue({ aiMonthlyBudget: 1, aiSpendPeriod: THIS_MONTH, aiSpendMicros: 9_000_000 });
    await expect(assertAiBudget()).resolves.toBeUndefined();
    expect(findOneLean).not.toHaveBeenCalled();
  });
});

describe('recordAiSpend', () => {
  it('increments the ledger when the stored period matches', async () => {
    updateOne.mockResolvedValue({ matchedCount: 1 });
    await recordAiSpend('claude-sonnet-5', 10_000, 2_000); // 40_000 micros
    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = updateOne.mock.calls[0];
    expect(filter).toMatchObject({ key: 'singleton', aiSpendPeriod: THIS_MONTH });
    expect(update).toEqual({ $inc: { aiSpendMicros: 40_000 } });
  });

  it('seeds a fresh month when the period does not match (matchedCount 0)', async () => {
    updateOne.mockResolvedValueOnce({ matchedCount: 0 }).mockResolvedValueOnce({ matchedCount: 1 });
    await recordAiSpend('claude-haiku-4-5', 1_000_000, 1_000_000); // 6_000_000 micros
    expect(updateOne).toHaveBeenCalledTimes(2);
    const [, seed] = updateOne.mock.calls[1];
    expect(seed).toEqual({ $set: { aiSpendPeriod: THIS_MONTH, aiSpendMicros: 6_000_000 } });
  });

  it('is a no-op in SaaS mode and for zero-cost calls', async () => {
    saasModeMock.mockReturnValue(true);
    await recordAiSpend('claude-sonnet-5', 999, 999);
    expect(updateOne).not.toHaveBeenCalled();
    saasModeMock.mockReturnValue(false);
    await recordAiSpend('claude-sonnet-5', 0, 0);
    expect(updateOne).not.toHaveBeenCalled();
  });
});
