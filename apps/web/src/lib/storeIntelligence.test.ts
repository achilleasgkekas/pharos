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

    it('deterministically merges user extraShops and userStores even when AI omits them (#391, #392)', async () => {
      runTextJSONMock.mockResolvedValueOnce({
        json: {
          detectedCategory: 'electronics',
          stores: [
            {
              name: 'Plaisio',
              domain: 'plaisio.gr',
              searchUrl: 'https://www.plaisio.gr/search?q=RTX+5080',
            },
          ],
        },
        raw: '{}',
        model: 'claude-3-5-haiku',
      });

      const res = await resolveStoresForProduct({
        query: 'RTX 5080',
        country: 'GR',
        extraShops: ['amazon.de', 'computeruniverse.net'],
        userStores: [{ name: 'Custom Greek Tech', url: 'https://greektech.gr/catalog' }],
      });

      const domains = res.stores.map((s) => s.domain);
      // Configured extra shops MUST be present
      expect(domains).toContain('amazon.de');
      expect(domains).toContain('computeruniverse.net');
      // Registered user store MUST be present
      expect(domains).toContain('greektech.gr');
      // AI suggestion is present
      expect(domains).toContain('plaisio.gr');
    });

    it('classifies Greek unicode queries correctly into categories', () => {
      const toothpaste = fallbackStoresForQuery('Οδοντόκρεμα Frezyderm', 'GR');
      expect(toothpaste.detectedCategory).toBe('personal_care');
      expect(toothpaste.stores.some((s) => s.domain.includes('pharmacy') || s.domain.includes('farmak'))).toBe(true);

      const drill = fallbackStoresForQuery('Κρουστικό δράπανο Bosch', 'GR');
      expect(drill.detectedCategory).toBe('tools');
      expect(drill.stores.map((s) => s.domain)).toContain('praktiker.gr');

      const ssd = fallbackStoresForQuery('Δίσκος NVMe 2TB', 'GR');
      expect(ssd.detectedCategory).toBe('electronics');
      expect(ssd.stores.map((s) => s.domain)).toContain('plaisio.gr');
    });

    it('handles non-Greek country configurations (e.g. DE, CY)', () => {
      const de = fallbackStoresForQuery('SSD 1TB', 'DE', { extraShops: ['alternate.de'] });
      expect(de.stores.map((s) => s.domain)).toContain('alternate.de');

      const cy = fallbackStoresForQuery('Laptop', 'CY');
      expect(cy.stores.map((s) => s.domain)).toContain('amazon.de');
    });
  });
});

