import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveStoresForProduct, fallbackStoresForQuery } from './storeIntelligence';

// Mock runTextJSON
const { runTextJSONMock } = vi.hoisted(() => ({
  runTextJSONMock: vi.fn(),
}));

vi.mock('@/lib/ollama', () => ({
  runTextJSON: runTextJSONMock,
}));

describe('storeIntelligence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fallbackStoresForQuery', () => {
    it('returns pharmacy/hygiene stores for toothpaste in Greece', () => {
      const rec = fallbackStoresForQuery('Sensodyne Complete Protection Toothpaste', 'GR');
      expect(rec.detectedCategory).toBe('personal_care');
      const domains = rec.stores.map((s) => s.domain);
      expect(domains).toContain('skroutz.gr');
      expect(domains).toContain('bestprice.gr');
      expect(domains.some((d) => d.includes('pharmacy') || d.includes('farmak'))).toBe(true);
      // Computer shop should NOT be present for toothpaste
      expect(domains).not.toContain('plaisio.gr');
    });

    it('returns tech/electronics stores for an SSD in Greece', () => {
      const rec = fallbackStoresForQuery('Samsung 990 PRO NVMe M.2 2TB SSD', 'GR');
      expect(rec.detectedCategory).toBe('electronics');
      const domains = rec.stores.map((s) => s.domain);
      expect(domains).toContain('skroutz.gr');
      expect(domains).toContain('plaisio.gr');
      expect(domains).toContain('e-shop.gr');
      expect(domains).toContain('amazon.de');
    });

    it('returns DIY/tool stores for a power drill in Greece', () => {
      const rec = fallbackStoresForQuery('Bosch Professional Hammer Drill', 'GR');
      expect(rec.detectedCategory).toBe('tools');
      const domains = rec.stores.map((s) => s.domain);
      expect(domains).toContain('skroutz.gr');
      expect(domains).toContain('praktiker.gr');
    });

    it('includes user custom stores if provided in extraShops', () => {
      const rec = fallbackStoresForQuery('RTX 5080', 'GR', {
        extraShops: ['you.gr', 'amazon.de'],
      });
      const domains = rec.stores.map((s) => s.domain);
      expect(domains).toContain('you.gr');
      expect(domains).toContain('amazon.de');
    });
  });

  describe('resolveStoresForProduct', () => {
    it('uses AI when AI returns valid recommendations', async () => {
      runTextJSONMock.mockResolvedValueOnce({
        json: {
          detectedCategory: 'electronics',
          stores: [
            {
              name: 'Skroutz',
              domain: 'skroutz.gr',
              searchUrl: 'https://www.skroutz.gr/search?keyphrase=Samsung+990',
            },
            {
              name: 'Plaisio',
              domain: 'plaisio.gr',
              searchUrl: 'https://www.plaisio.gr/search?q=Samsung+990',
            },
          ],
        },
        raw: '{}',
        model: 'claude-3-5-haiku',
      });

      const res = await resolveStoresForProduct({
        query: 'Samsung 990',
        country: 'GR',
      });

      expect(res.detectedCategory).toBe('electronics');
      expect(res.stores).toHaveLength(2);
      expect(res.stores[0].name).toBe('Skroutz');
      expect(res.stores[1].name).toBe('Plaisio');
    });

    it('falls back to category heuristics if AI throws an error', async () => {
      runTextJSONMock.mockRejectedValueOnce(new Error('AI provider offline'));

      const res = await resolveStoresForProduct({
        query: 'Sensodyne Toothpaste',
        country: 'GR',
      });

      expect(res.detectedCategory).toBe('personal_care');
      expect(res.stores.length).toBeGreaterThan(0);
      expect(res.stores.some((s) => s.domain === 'skroutz.gr')).toBe(true);
    });
  });
});
