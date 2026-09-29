import { describe, expect, it } from 'vitest';
import { buildRunQuery, serializeAiRun } from './aiRun';

describe('aiRun', () => {
  describe('buildRunQuery', () => {
    it('constructs empty query when no filters provided', () => {
      const q = buildRunQuery({});
      expect(q).toEqual({});
    });

    it('filters out "all" sentinels', () => {
      const q = buildRunQuery({ feature: 'all', model: 'all', status: 'all' });
      expect(q).toEqual({});
    });

    it('builds query with specific feature, model, and status', () => {
      const q = buildRunQuery({ feature: 'receiptScan', model: 'claude-3-5-haiku-20241022', status: 'ok' });
      expect(q.feature).toBe('receiptScan');
      expect(q.model).toBe('claude-3-5-haiku-20241022');
      expect(q.status).toBe('ok');
    });

    it('constructs date range query boundaries in UTC', () => {
      const q = buildRunQuery({ dateFrom: '2026-09-01', dateTo: '2026-09-30' });
      const at = q.at as { $gte: Date; $lte: Date };
      expect(at).toBeDefined();
      expect(at.$gte.toISOString()).toBe('2026-09-01T00:00:00.000Z');
      expect(at.$lte.toISOString()).toBe('2026-09-30T23:59:59.999Z');
    });
  });

  describe('serializeAiRun', () => {
    it('serializes raw mongo document including prompt and output', () => {
      const raw = {
        _id: '67489abf1234567890abcdef',
        at: new Date('2026-09-29T10:00:00Z'),
        durationMs: 450,
        feature: 'commandBar',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        status: 'ok',
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheWriteTokens: 10,
          cacheReadTokens: 5,
        },
        costMicros: 3500,
        prompt: 'User: Add €15 Spotify subscription',
        output: '{"name":"Spotify","amount":15}',
        trigger: 'user',
        conversationId: 'conv-123',
        turn: 1,
      };

      const res = serializeAiRun(raw);
      expect(res._id).toBe('67489abf1234567890abcdef');
      expect(res.feature).toBe('commandBar');
      expect(res.prompt).toBe('User: Add €15 Spotify subscription');
      expect(res.output).toBe('{"name":"Spotify","amount":15}');
      expect(res.costMicros).toBe(3500);
      expect(res.usage.inputTokens).toBe(100);
      expect(res.conversationId).toBe('conv-123');
    });

    it('handles missing prompt and output gracefully', () => {
      const raw = {
        _id: '67489abf1234567890abcdef',
        at: '2026-09-29T10:00:00Z',
        feature: 'scraperPrice',
        provider: 'anthropic',
        model: 'claude-3-5-haiku-20241022',
        status: 'ok',
      };

      const res = serializeAiRun(raw);
      expect(res.prompt).toBeNull();
      expect(res.output).toBeNull();
      expect(res.error).toBeNull();
    });
  });
});
