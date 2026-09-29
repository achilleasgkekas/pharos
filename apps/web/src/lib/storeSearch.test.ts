import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractCandidateLinksFromHtml, searchStoreCandidates } from './storeSearch';
import type { StoreTarget } from './storeIntelligence';

// Mock fetchRawHtml
const { fetchRawHtmlMock } = vi.hoisted(() => ({
  fetchRawHtmlMock: vi.fn(),
}));

vi.mock('@/lib/scrape', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/scrape')>();
  return {
    ...mod,
    fetchRawHtml: fetchRawHtmlMock,
  };
});

describe('storeSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractCandidateLinksFromHtml', () => {
    it('extracts Skroutz product links and prices from search HTML', () => {
      const html = `
        <html>
          <body>
            <div class="card">
              <a href="/s/44759080/Samsung-990-PRO-1TB.html" title="Samsung SSD 990 PRO NVMe M.2 1TB">
                Samsung SSD 990 PRO 1TB
              </a>
              <span class="price">από 209,89 €</span>
            </div>
            <a href="/c/123/ssd-diskoi.html">SSD Diskoi Category</a>
          </body>
        </html>
      `;

      const links = extractCandidateLinksFromHtml(html, 'https://www.skroutz.gr', 'Samsung 990 PRO');
      expect(links.length).toBeGreaterThan(0);
      expect(links[0].url).toBe('https://www.skroutz.gr/s/44759080/Samsung-990-PRO-1TB.html');
      expect(links[0].title).toContain('Samsung');
      // Category link should be excluded
      expect(links.some((l) => l.url.includes('/c/123/'))).toBe(false);
    });

    it('extracts Plaisio product links from search HTML', () => {
      const html = `
        <html>
          <body>
            <a href="/product/anavathmisi-diktia/storage/diskoi-ssd-hdd/samsung-ssd-990-pro-nvme-m-dot-2-1tb_4111869">
              Samsung SSD 990 PRO NVMe M.2 1TB 279,99€
            </a>
            <a href="/list/anavathmisi-diktia/storage">Category List</a>
          </body>
        </html>
      `;

      const links = extractCandidateLinksFromHtml(html, 'https://www.plaisio.gr', 'Samsung 990 PRO');
      expect(links.length).toBeGreaterThan(0);
      expect(links[0].url).toContain('/product/');
      expect(links.some((l) => l.url.includes('/list/'))).toBe(false);
    });

    it('extracts Amazon product links from search HTML', () => {
      const html = `
        <html>
          <body>
            <a href="/dp/B0B9C315N3/ref=sr_1_1?keywords=samsung+990">
              Samsung 990 PRO PCIe 4.0 NVMe M.2 SSD 1TB
            </a>
            <a href="/gp/help/customer/display.html">Help</a>
          </body>
        </html>
      `;

      const links = extractCandidateLinksFromHtml(html, 'https://www.amazon.de', 'Samsung 990');
      expect(links.length).toBeGreaterThan(0);
      expect(links[0].url).toBe('https://www.amazon.de/dp/B0B9C315N3');
      expect(links.some((l) => l.url.includes('/gp/help/'))).toBe(false);
    });
  });

  describe('searchStoreCandidates', () => {
    it('queries stores and aggregates found product links', async () => {
      fetchRawHtmlMock.mockImplementation(async (url: string) => {
        if (url.includes('skroutz.gr')) {
          return `
            <a href="/s/44759080/Samsung-990-PRO-1TB.html">Samsung 990 PRO 1TB</a>
          `;
        }
        if (url.includes('plaisio.gr')) {
          return `
            <a href="/product/storage/samsung-990_4111869">Samsung 990 Pro Plaisio</a>
          `;
        }
        return '<html></html>';
      });

      const stores: StoreTarget[] = [
        { name: 'Skroutz', domain: 'skroutz.gr', searchUrl: 'https://www.skroutz.gr/search?keyphrase=Samsung+990' },
        { name: 'Plaisio', domain: 'plaisio.gr', searchUrl: 'https://www.plaisio.gr/search?q=Samsung+990' },
      ];

      const candidates = await searchStoreCandidates(stores, 'Samsung 990');
      expect(candidates.length).toBe(2);
      expect(candidates[0].store).toBe('Skroutz');
      expect(candidates[0].url).toContain('skroutz.gr/s/');
      expect(candidates[1].store).toBe('Plaisio');
      expect(candidates[1].url).toContain('plaisio.gr/product/');
    });

    it('handles individual store fetch errors without dropping other stores', async () => {
      fetchRawHtmlMock.mockImplementation(async (url: string) => {
        if (url.includes('skroutz.gr')) {
          throw new Error('Connection timeout');
        }
        return '<a href="/product/samsung-990_123">Samsung 990 Pro</a>';
      });

      const stores: StoreTarget[] = [
        { name: 'Skroutz', domain: 'skroutz.gr', searchUrl: 'https://www.skroutz.gr/search?keyphrase=Samsung+990' },
        { name: 'Plaisio', domain: 'plaisio.gr', searchUrl: 'https://www.plaisio.gr/search?q=Samsung+990' },
      ];

      const candidates = await searchStoreCandidates(stores, 'Samsung 990');
      expect(candidates.length).toBe(1);
      expect(candidates[0].store).toBe('Plaisio');
    });

    it('records detailed outcomes and guarantees configured shops are attempted (#391)', async () => {
      fetchRawHtmlMock.mockImplementation(async (url: string) => {
        if (url.includes('skroutz.gr')) {
          return '<a href="/s/1/item.html">Item 1</a><a href="/s/2/item.html">Item 2</a>';
        }
        if (url.includes('bestprice.gr')) {
          return '<html>no links</html>';
        }
        if (url.includes('failed.gr')) {
          throw new Error('503 Service Unavailable');
        }
        if (url.includes('amazon.de')) {
          return '<a href="/dp/B0B9C315N3">Amazon Item</a>';
        }
        return '<html></html>';
      });

      const stores: StoreTarget[] = [
        { name: 'EmptyStore', domain: 'empty.gr', searchUrl: 'https://www.empty.gr/search?q=item', source: 'market_default' },
        { name: 'Skroutz', domain: 'skroutz.gr', searchUrl: 'https://www.skroutz.gr/search?keyphrase=item', source: 'market_default' },
        { name: 'BestPrice', domain: 'bestprice.gr', searchUrl: 'https://www.bestprice.gr/search?q=item', source: 'market_default' },
        { name: 'FailedStore', domain: 'failed.gr', searchUrl: 'https://www.failed.gr/search?q=item', source: 'market_default' },
        { name: 'Amazon', domain: 'amazon.de', searchUrl: 'https://www.amazon.de/s?k=item', source: 'user_configured' },
      ];

      // Set maxTotal = 2: EmptyStore is searched (0 matches), Skroutz returns 2.
      // BestPrice & FailedStore are market_default so skipped (not_attempted).
      // Amazon is user_configured, so it MUST also be queried!
      const candidates = await searchStoreCandidates(stores, 'item', { limitPerStore: 2, maxTotal: 2 });
      expect(candidates.length).toBe(3); // 2 from Skroutz + 1 from Amazon

      const outcomes = candidates.outcomes;
      expect(outcomes).toBeDefined();
      expect(outcomes?.find((o) => o.domain === 'empty.gr')?.status).toBe('no_match');
      expect(outcomes?.find((o) => o.domain === 'skroutz.gr')?.status).toBe('searched');
      expect(outcomes?.find((o) => o.domain === 'bestprice.gr')?.status).toBe('not_attempted');
      expect(outcomes?.find((o) => o.domain === 'failed.gr')?.status).toBe('not_attempted');
      expect(outcomes?.find((o) => o.domain === 'amazon.de')?.status).toBe('searched');
    });
  });
});

