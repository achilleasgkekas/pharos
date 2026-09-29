import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchAnthropicCostReport,
  estimateCreditBalance,
} from './anthropicAdmin';

describe('anthropicAdmin', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('fetchAnthropicCostReport', () => {
    it('returns error when adminKey is missing', async () => {
      const res = await fetchAnthropicCostReport({ adminKey: '', startingAt: '2026-09-01T00:00:00Z' });
      expect(res.ok).toBe(false);
      expect(res.error).toContain('Admin API key is required');
    });

    it('correctly converts cents to dollars from Anthropic API response', async () => {
      const mockResponse = {
        data: [
          {
            starting_at: '2026-09-01T00:00:00Z',
            ending_at: '2026-09-02T00:00:00Z',
            amount: '125.5', // 125.5 cents = $1.255
          },
          {
            starting_at: '2026-09-02T00:00:00Z',
            ending_at: '2026-09-03T00:00:00Z',
            amount: 74.5, // 74.5 cents = $0.745
          },
        ],
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => mockResponse,
        })
      );

      const res = await fetchAnthropicCostReport({
        adminKey: 'sk-ant-admin-test',
        startingAt: '2026-09-01T00:00:00Z',
      });

      expect(res.ok).toBe(true);
      expect(res.buckets).toHaveLength(2);
      expect(res.buckets[0].amountDollars).toBe(1.26); // rounded cents/100
      expect(res.buckets[1].amountDollars).toBe(0.75);
      expect(res.totalCostDollars).toBe(2.01);
    });

    it('handles HTTP error gracefully', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          text: async () => 'Invalid admin key',
        })
      );

      const res = await fetchAnthropicCostReport({
        adminKey: 'invalid-key',
        startingAt: '2026-09-01T00:00:00Z',
      });

      expect(res.ok).toBe(false);
      expect(res.error).toContain('HTTP 401');
    });
  });

  describe('estimateCreditBalance', () => {
    it('calculates remaining balance and detects low balance threshold', () => {
      // $50 prepaid, $46 spent -> $4 remaining (<= $5 threshold -> low balance)
      const res1 = estimateCreditBalance({
        prepaidCredits: 50,
        totalSpent: 46,
        lowBalanceThreshold: 5,
      });
      expect(res1.remainingBalance).toBe(4);
      expect(res1.lowBalance).toBe(true);
      expect(res1.pctRemaining).toBe(8);

      // $100 prepaid, $20 spent -> $80 remaining -> not low
      const res2 = estimateCreditBalance({
        prepaidCredits: 100,
        totalSpent: 20,
      });
      expect(res2.remainingBalance).toBe(80);
      expect(res2.lowBalance).toBe(false);
      expect(res2.pctRemaining).toBe(80);
    });

    it('returns zero and not low when no prepaid credits configured', () => {
      const res = estimateCreditBalance({ prepaidCredits: 0, totalSpent: 10 });
      expect(res.remainingBalance).toBe(0);
      expect(res.lowBalance).toBe(false);
    });
  });
});
