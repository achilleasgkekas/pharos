import { describe, it, expect, vi, beforeEach } from 'vitest';

// Read-through shared price cache. Mocks the DB (ScrapedPrice), the fetch and the AI parse so
// we pin the behaviour that matters: a fresh entry serves from cache WITHOUT scraping; a miss
// or a stale entry scrapes and writes back; a cache read/write hiccup degrades to scraping;
// and a live fetch error still throws out to the caller (never cached).

const { findLean, updateOne, fetchPageTextMock, parseMock } = vi.hoisted(() => ({
  findLean: vi.fn(async () => null as Record<string, any> | null),
  updateOne: vi.fn(async (_f: Record<string, any>, _u: Record<string, any>, _o?: Record<string, any>) => ({})),
  fetchPageTextMock: vi.fn(async (_url: string) => ({ url: 'u', title: 't', jsonLd: '', text: 'x' })),
  parseMock: vi.fn(async () => ({ parsed: { title: 'RTX 5080', store: 'Shop', price: 850, currency: 'EUR' }, raw: '', model: 'm' })),
}));

vi.mock('./db', () => ({ connectDB: async () => {} }));
vi.mock('@/models/ScrapedPrice', () => ({ ScrapedPrice: { findOne: () => ({ lean: findLean }), updateOne } }));
vi.mock('./scrape', () => ({ fetchPageText: fetchPageTextMock }));
vi.mock('./ollama', () => ({ parseProductFromPage: parseMock }));

import { normalizeScrapeUrl, getParsedProductForUrl, SCRAPE_CACHE_TTL_MS } from './scrapedPriceCache';

beforeEach(() => {
  vi.clearAllMocks();
  findLean.mockResolvedValue(null);
});

describe('normalizeScrapeUrl', () => {
  it('drops www + protocol + trailing slash and lowercases', () => {
    expect(normalizeScrapeUrl('https://WWW.Shop.com/Product/1/')).toBe('shop.com/product/1');
    expect(normalizeScrapeUrl('http://shop.com/p')).toBe('shop.com/p');
  });
  it('collapses two URLs that differ only by www / trailing slash to one key', () => {
    expect(normalizeScrapeUrl('https://www.shop.com/p/')).toBe(normalizeScrapeUrl('https://shop.com/p'));
  });
});

describe('getParsedProductForUrl', () => {
  it('serves a fresh cache entry WITHOUT scraping', async () => {
    findLean.mockResolvedValue({ parsed: { title: 'Cached', store: 'S', price: 700, currency: 'EUR' }, scrapedAt: new Date() });
    const r = await getParsedProductForUrl('https://shop.com/p');
    expect(r.cached).toBe(true);
    expect(r.parsed.price).toBe(700);
    expect(fetchPageTextMock).not.toHaveBeenCalled();
    expect(parseMock).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('scrapes + writes back on a miss (no cache entry)', async () => {
    findLean.mockResolvedValue(null);
    const r = await getParsedProductForUrl('https://shop.com/p');
    expect(r.cached).toBe(false);
    expect(r.parsed.price).toBe(850);
    expect(fetchPageTextMock).toHaveBeenCalledTimes(1);
    const [filter, update, opts] = updateOne.mock.calls[0];
    expect(filter).toEqual({ urlNorm: 'shop.com/p' });
    expect(update.$set).toMatchObject({ urlNorm: 'shop.com/p' });
    expect(opts).toEqual({ upsert: true });
  });

  it('treats an entry older than the TTL as a miss and re-scrapes', async () => {
    findLean.mockResolvedValue({ parsed: { title: 'Old', store: 'S', price: 1, currency: 'EUR' }, scrapedAt: new Date(Date.now() - SCRAPE_CACHE_TTL_MS - 1000) });
    const r = await getParsedProductForUrl('https://shop.com/p');
    expect(r.cached).toBe(false);
    expect(fetchPageTextMock).toHaveBeenCalledTimes(1);
  });

  it('degrades to scraping when the cache read throws', async () => {
    findLean.mockRejectedValue(new Error('cache down'));
    const r = await getParsedProductForUrl('https://shop.com/p');
    expect(r.cached).toBe(false);
    expect(r.parsed.price).toBe(850);
  });

  it('propagates a live fetch error and never caches it', async () => {
    findLean.mockResolvedValue(null);
    fetchPageTextMock.mockRejectedValueOnce(new Error('just a moment (cloudflare)'));
    await expect(getParsedProductForUrl('https://shop.com/p')).rejects.toThrow(/cloudflare/);
    expect(updateOne).not.toHaveBeenCalled();
  });
});
