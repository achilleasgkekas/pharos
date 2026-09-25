import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/items/actions.ts is a large multi-concern module (see actions.crud.test.ts's header
// for the full concern list). This file covers the PRICE-TRACKING slice: addPriceEntry /
// setItemTarget / logItemPrice / searchItemPriceCandidates / addPriceLinks /
// refreshItemPrices / recomputeAllItemPrices. searchItemPriceCandidates and
// refreshItemPrices both go through the same web-fetch + AI-parse + relevance-guard path
// as importItemFromUrl (fetchPageText -> parseProductFromPage -> productMatchesItem, the
// internal, NOT mocked, real function) so a couple of tests here double as coverage for
// that guard on the "already have this item, is this candidate page still it" path.
//
// Behaviour pinned:
//  - addPriceEntry has no feature gate and no not-found guard — it's a bare
//    findByIdAndUpdate, only revalidates /items (not /shopping).
//  - setItemTarget clears the target (writes null) for any target <= 0, not just exactly 0
//    or null.
//  - logItemPrice validates price > 0 BEFORE connectDB, and falls a blank/whitespace store
//    back to 'manual'.
//  - searchItemPriceCandidates and refreshItemPrices are both gated behind the
//    'itemsImport' AI feature flag, checked BEFORE connectDB.
//  - searchItemPriceCandidates: excludes social/video/wiki hosts, dedups by normalized URL,
//    caps at 5 URLs (AI-cost cap) even if more survive filtering, and skips (does not push
//    a candidate for) any page that fails `productMatchesItem`. A per-URL fetch/parse
//    failure still produces a candidate entry (price 0, inStock false) rather than
//    aborting the whole search, with a friendlier message for Cloudflare-blocked pages.
//  - addPriceLinks: skips picks with a missing/non-http(s) URL, updates an existing link's
//    price in place (matched by normalized URL) instead of duplicating it, and reports
//    'Nothing to add' (no save at all) when every pick was skipped.
//  - refreshItemPrices: 'No tracked store links to refresh.' when the item has zero
//    http(s) links; a page that no longer matches the item, or has no price, is recorded as
//    changed:'error' WITHOUT touching price history; a same-price re-check does not push a
//    new price-history point (only a genuine change, or the very first reading, does).
//  - Both addPriceLinks and refreshItemPrices recompute currentPrice via the internal
//    lowestKnownPrice() (cheapest priced link) after their loop, mirroring create/updateItem.
//  - recomputeAllItemPrices only saves items whose lowestKnownPrice actually differs from
//    the stored currentPrice — untouched items are left alone (no wasted writes).

const {
  connectDBMock,
  itemFindByIdAndUpdate,
  itemFindById,
  itemFind,
  fetchPageTextMock,
  parseProductFromPageMock,
  searchWebMock,
  isFeatureEnabledMock,
  revalidatePathMock,
} = vi.hoisted(() => {
  function queryResult(value: any) {
    return {
      lean: async () => value,
      then: (onFulfilled: any, onRejected: any) => Promise.resolve(value).then(onFulfilled, onRejected),
    };
  }
  return {
    connectDBMock: vi.fn(async () => {}),
    itemFindByIdAndUpdate: vi.fn(async (_id: string, _update: Record<string, any>) => ({})),
    itemFindById: vi.fn((_id: string) => queryResult(null)),
    itemFind: vi.fn(async () => [] as any[]),
    fetchPageTextMock: vi.fn(),
    parseProductFromPageMock: vi.fn(),
    searchWebMock: vi.fn(async (_q?: string, _max?: number, _opts?: { language?: string }) => [] as { title: string; url: string; content: string }[]),
    isFeatureEnabledMock: vi.fn(async () => true),
    revalidatePathMock: vi.fn(),
  };
});

const itemModel = {
  findByIdAndUpdate: itemFindByIdAndUpdate,
  findById: itemFindById,
  find: itemFind,
};

vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async () => itemModel }));
vi.mock('@/models/Item', () => ({ Item: {} }));
vi.mock('@/models/Receipt', () => ({ Receipt: {} }));
vi.mock('@/models/Statement', () => ({ Statement: {} }));
vi.mock('@/models/Task', () => ({ Task: {} }));
vi.mock('@/lib/scrape', () => ({ fetchPageText: fetchPageTextMock }));
vi.mock('@/lib/ollama', () => ({ parseProductFromPage: parseProductFromPageMock }));
// The price paths now go through the shared cache; delegate it to the same fetch/parse mocks so
// these tests keep exercising the item logic (call counts, error handling) without a real DB.
vi.mock('@/lib/scrapedPriceCache', () => ({
  getParsedProductForUrl: async (url: string) => {
    const page = await fetchPageTextMock(url);
    const { parsed } = await parseProductFromPageMock(page);
    return { parsed, pageTitle: (page as { title?: string })?.title ?? '', cached: false };
  },
}));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: isFeatureEnabledMock }));
vi.mock('@/lib/search', () => ({ searchWeb: searchWebMock, searchImages: vi.fn() }));
vi.mock('@/lib/storage', () => ({ saveFile: vi.fn(), deleteFile: vi.fn() }));
vi.mock('@/lib/ssrf', () => ({ assertPublicUrl: vi.fn(async () => {}) }));
vi.mock('@/lib/revalidate', () => ({ safeRevalidate: vi.fn() }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: vi.fn(async () => ({ currency: 'EUR' })) }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));
import { getAppSettings } from '@/lib/appSettings';

import {
  addPriceEntry,
  setItemTarget,
  logItemPrice,
  searchItemPriceCandidates,
  addPriceLinks,
  refreshItemPrices,
  recomputeAllItemPrices,
} from './actions';

function makeItem(overrides: Record<string, any> = {}) {
  return {
    title: 'Ubiquiti U7 Pro',
    currentPrice: 300,
    links: [] as { label: string; url: string; price: number | null }[],
    priceHistory: [] as { price: number; store: string; url?: string; date: Date }[],
    save: vi.fn(async () => {}),
    markModified: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  isFeatureEnabledMock.mockResolvedValue(true);
  itemFindById.mockImplementation((_id: string) => ({
    lean: async () => null,
    then: (onFulfilled: any, onRejected: any) => Promise.resolve(null).then(onFulfilled, onRejected),
  }));
  itemFind.mockResolvedValue([]);
});

describe('addPriceEntry', () => {
  it('pushes a price-history point, sets currentPrice, and revalidates only /items', async () => {
    await addPriceEntry('i1', { price: 42, store: 'Skroutz', url: 'https://skroutz.gr/x' });
    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(itemFindByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [id, update] = itemFindByIdAndUpdate.mock.calls[0];
    expect(id).toBe('i1');
    expect(update.$push.priceHistory.price).toBe(42);
    expect(update.$push.priceHistory.store).toBe('Skroutz');
    expect(update.$push.priceHistory.date).toBeInstanceOf(Date);
    expect(update.$set.currentPrice).toBe(42);
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
    expect(revalidatePathMock).not.toHaveBeenCalledWith('/shopping');
  });
});

describe('setItemTarget', () => {
  it('sets a positive target', async () => {
    const r = await setItemTarget('i1', 150);
    expect(r).toEqual({ ok: true });
    const [id, update] = itemFindByIdAndUpdate.mock.calls[0];
    expect(id).toBe('i1');
    expect(update.$set.targetPrice).toBe(150);
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
    expect(revalidatePathMock).toHaveBeenCalledWith('/shopping');
  });

  it('clears the target (writes null) for null, zero, or a negative value', async () => {
    await setItemTarget('i1', null);
    expect(itemFindByIdAndUpdate.mock.calls[0][1].$set.targetPrice).toBeNull();

    await setItemTarget('i1', 0);
    expect(itemFindByIdAndUpdate.mock.calls[1][1].$set.targetPrice).toBeNull();

    await setItemTarget('i1', -10);
    expect(itemFindByIdAndUpdate.mock.calls[2][1].$set.targetPrice).toBeNull();
  });
});

describe('logItemPrice', () => {
  it('rejects a non-positive price before touching the DB', async () => {
    const r = await logItemPrice('i1', 0, 'Skroutz');
    expect(r).toEqual({ ok: false, error: 'Price must be greater than 0' });
    expect(connectDBMock).not.toHaveBeenCalled();

    const r2 = await logItemPrice('i1', -5, 'Skroutz');
    expect(r2.ok).toBe(false);
  });

  it('reports item-not-found when the update matches nothing', async () => {
    itemFindByIdAndUpdate.mockResolvedValueOnce(null as any);
    const r = await logItemPrice('i1', 10, 'Skroutz');
    expect(r).toEqual({ ok: false, error: 'Item not found' });
  });

  it('falls a blank/whitespace store back to "manual"', async () => {
    await logItemPrice('i1', 10, '   ');
    const [, update] = itemFindByIdAndUpdate.mock.calls[0];
    expect(update.$push.priceHistory.store).toBe('manual');
  });

  it('logs price + store, updates currentPrice, and revalidates both surfaces', async () => {
    const r = await logItemPrice('i1', 25.5, ' Public ');
    expect(r).toEqual({ ok: true });
    const [id, update] = itemFindByIdAndUpdate.mock.calls[0];
    expect(id).toBe('i1');
    expect(update.$push.priceHistory.price).toBe(25.5);
    expect(update.$push.priceHistory.store).toBe('Public');
    expect(update.$push.priceHistory.date).toBeInstanceOf(Date);
    expect(update.$set.currentPrice).toBe(25.5);
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
    expect(revalidatePathMock).toHaveBeenCalledWith('/shopping');
  });
});

describe('searchItemPriceCandidates', () => {
  it('is gated behind the itemsImport feature flag, before connectDB', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);
    const r = await searchItemPriceCandidates('i1');
    expect(r).toEqual({ ok: false, candidates: [], error: 'Product AI is turned off.' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('reports item-not-found', async () => {
    const r = await searchItemPriceCandidates('i1');
    expect(r).toEqual({ ok: false, candidates: [], error: 'Item not found' });
  });

  it('reports "Nothing to search for" when both the override and the item title are blank', async () => {
    itemFindById.mockReturnValueOnce({ lean: async () => ({ title: '  ', links: [] }) } as any);
    const r = await searchItemPriceCandidates('i1', '   ');
    expect(r).toEqual({ ok: false, candidates: [], error: 'Nothing to search for' });
    expect(searchWebMock).not.toHaveBeenCalled();
  });

  it('searches using the override (trimmed) instead of the item title when given', async () => {
    itemFindById.mockReturnValue({ lean: async () => ({ title: 'Original title', links: [] }) } as any);
    searchWebMock.mockResolvedValue([]);
    await searchItemPriceCandidates('i1', '  custom query  ');
    expect(searchWebMock).toHaveBeenCalledWith('custom query', 8);
  });

  it('excludes social/video/wiki hosts and non-http(s) urls, dedups by normalized url, and caps at 5', async () => {
    itemFindById.mockReturnValue({ lean: async () => ({ title: 'Widget', links: [] }) } as any);
    searchWebMock.mockResolvedValue([
      { title: '', url: 'https://youtube.com/watch?v=1', content: '' },
      { title: '', url: 'ftp://shop1.example.com/x', content: '' },
      { title: '', url: 'https://shop2.example.com/a', content: '' },
      { title: '', url: 'https://shop2.example.com/a/', content: '' }, // dup of the one above
      { title: '', url: 'https://shop3.example.com/a', content: '' },
      { title: '', url: 'https://shop4.example.com/a', content: '' },
      { title: '', url: 'https://shop5.example.com/a', content: '' },
      { title: '', url: 'https://shop6.example.com/a', content: '' }, // beyond the cap of 5
    ]);
    fetchPageTextMock.mockResolvedValue({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock.mockResolvedValue({ parsed: { title: 'Widget X', price: 10, currency: 'EUR', store: '' } });
    await searchItemPriceCandidates('i1');
    // shop2 deduped to one, shop6 dropped by the cap -> exactly 5 fetches (shop2, 3, 4, 5, and one more would be 6th but cap stops at 5 survivors)
    expect(fetchPageTextMock).toHaveBeenCalledTimes(5);
    const fetchedUrls = fetchPageTextMock.mock.calls.map((c) => c[0]);
    expect(fetchedUrls).not.toContain('https://youtube.com/watch?v=1');
    expect(fetchedUrls).not.toContain('ftp://shop1.example.com/x');
    expect(fetchedUrls.filter((u) => new URL(u).hostname === 'shop2.example.com').length).toBe(1);
  });

  it('skips a candidate whose page does not match the item (relevance guard)', async () => {
    itemFindById.mockReturnValue({ lean: async () => ({ title: 'Ubiquiti U7 Pro Access Point', links: [] }) } as any);
    searchWebMock.mockResolvedValue([{ title: '', url: 'https://shop.example.com/a', content: '' }]);
    fetchPageTextMock.mockResolvedValue({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock.mockResolvedValue({ parsed: { title: 'Completely Unrelated Toaster', price: 20, currency: 'EUR', store: '' } });
    const r = await searchItemPriceCandidates('i1');
    expect(r.candidates).toEqual([]);
  });

  it('builds a candidate from a matching page, falling back store to the host and marking alreadyLinked', async () => {
    itemFindById.mockReturnValue({
      lean: async () => ({
        title: 'Ubiquiti U7 Pro',
        links: [{ label: 'x', url: 'https://shop.example.com/a', price: 100 }],
      }),
    } as any);
    searchWebMock.mockResolvedValue([{ title: 'page title', url: 'https://shop.example.com/a', content: '' }]);
    fetchPageTextMock.mockResolvedValue({ url: '', title: 'Fallback page title', jsonLd: '', text: '' });
    parseProductFromPageMock.mockResolvedValue({
      parsed: { title: '', price: 0, currency: '', store: '', specs: 'Ubiquiti U7 Pro model' },
    });
    const r = await searchItemPriceCandidates('i1');
    expect(r.ok).toBe(true);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]).toMatchObject({
      url: 'https://shop.example.com/a',
      price: 0, // parsed.price was 0 (not > 0)
      currency: 'EUR', // defaulted since parsed.currency was blank
      inStock: true,
      title: 'Fallback page title', // falls back to page.title since parsed.title was blank
      alreadyLinked: true, // matches the existing link's normalized url
      store: 'shop.example.com', // falls back to storeFromUrl since parsed.store was blank
    });
  });

  it('produces an error candidate (not a thrown exception) when fetch/parse fails, with a friendlier Cloudflare message', async () => {
    itemFindById.mockReturnValue({ lean: async () => ({ title: 'Widget', links: [] }) } as any);
    searchWebMock.mockResolvedValue([
      { title: '', url: 'https://shopA.example.com/a', content: '' },
      { title: '', url: 'https://shopB.example.com/b', content: '' },
    ]);
    fetchPageTextMock
      .mockRejectedValueOnce(new Error('Just a moment... Cloudflare challenge'))
      .mockRejectedValueOnce(new Error('boom'.repeat(40)));
    const r = await searchItemPriceCandidates('i1');
    expect(r.ok).toBe(true);
    expect(r.candidates).toHaveLength(2);
    expect(r.candidates[0]).toMatchObject({ price: 0, inStock: false, error: 'Behind Cloudflare — start the price-scraper profile' });
    expect(r.candidates[1].error!.length).toBe(80); // sliced to 80 chars
  });
});

describe('addPriceLinks', () => {
  it('reports item-not-found', async () => {
    const r = await addPriceLinks('i1', [{ store: 'Skroutz', url: 'https://skroutz.gr/x', price: 10 }]);
    expect(r).toEqual({ ok: false, added: 0, error: 'Item not found' });
  });

  it('skips picks with a missing or non-http(s) url and reports "Nothing to add" without saving', async () => {
    const item = makeItem();
    itemFindById.mockReturnValueOnce(item as any);
    const r = await addPriceLinks('i1', [
      { store: 'Skroutz', url: '', price: 10 },
      { store: 'Bad', url: 'ftp://x.com/a', price: 10 },
    ]);
    expect(r).toEqual({ ok: false, added: 0, error: 'Nothing to add' });
    expect(item.save).not.toHaveBeenCalled();
  });

  it('adds a new link + price-history point, falling store back to the host when blank', async () => {
    const item = makeItem();
    itemFindById.mockReturnValueOnce(item as any).mockReturnValueOnce({ lean: async () => ({ _id: 'i1' }) } as any);
    const r = await addPriceLinks('i1', [{ store: '', url: 'https://skroutz.gr/x', price: 99.5 }]);
    expect(r.ok).toBe(true);
    expect(r.added).toBe(1);
    expect(item.links).toEqual([{ label: 'Skroutz', url: 'https://skroutz.gr/x', price: 99.5 }]);
    expect(item.priceHistory).toHaveLength(1);
    expect(item.priceHistory[0]).toMatchObject({ price: 99.5, store: 'Skroutz', url: 'https://skroutz.gr/x' });
    expect(item.currentPrice).toBe(99.5); // lowestKnownPrice recomputed
    expect(item.markModified).toHaveBeenCalledWith('links');
    expect(item.markModified).toHaveBeenCalledWith('priceHistory');
    expect(item.save).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
    expect(revalidatePathMock).toHaveBeenCalledWith('/shopping');
  });

  it('updates an existing link in place (matched by normalized url) instead of duplicating it', async () => {
    const item = makeItem({ links: [{ label: 'Skroutz', url: 'https://skroutz.gr/x', price: 120 }] });
    itemFindById.mockReturnValueOnce(item as any).mockReturnValueOnce({ lean: async () => ({}) } as any);
    const r = await addPriceLinks('i1', [{ store: 'Skroutz', url: 'https://skroutz.gr/x/', price: 90 }]);
    expect(r.added).toBe(1);
    expect(item.links).toHaveLength(1);
    expect(item.links[0].price).toBe(90);
  });

  it('leaves the existing link price unchanged when the pick has no positive price, but still counts as added', async () => {
    const item = makeItem({ links: [{ label: 'Skroutz', url: 'https://skroutz.gr/x', price: 120 }] });
    itemFindById.mockReturnValueOnce(item as any).mockReturnValueOnce({ lean: async () => ({}) } as any);
    const r = await addPriceLinks('i1', [{ store: 'Skroutz', url: 'https://skroutz.gr/x', price: 0 }]);
    expect(r.added).toBe(1);
    expect(item.links[0].price).toBe(120);
    expect(item.priceHistory).toHaveLength(0); // no price -> no history point
  });
});

describe('refreshItemPrices', () => {
  it('is gated behind the itemsImport feature flag, before connectDB', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);
    const r = await refreshItemPrices('i1');
    expect(r).toEqual({ ok: false, results: [], error: 'Product AI is turned off.' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('reports item-not-found', async () => {
    const r = await refreshItemPrices('i1');
    expect(r).toEqual({ ok: false, results: [], error: 'Item not found' });
  });

  it('reports "No tracked store links to refresh." when there are no http(s) links', async () => {
    const item = makeItem({ links: [{ label: 'x', url: '', price: null }] });
    itemFindById.mockReturnValueOnce(item as any);
    const r = await refreshItemPrices('i1');
    expect(r).toEqual({ ok: false, results: [], error: 'No tracked store links to refresh.' });
  });

  it('records a mismatched page as changed:"error" without touching price history', async () => {
    const item = makeItem({ links: [{ label: 'Skroutz', url: 'https://skroutz.gr/x', price: 100 }] });
    itemFindById.mockReturnValueOnce(item as any);
    fetchPageTextMock.mockResolvedValue({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock.mockResolvedValue({ parsed: { title: 'Unrelated Toaster', price: 50, currency: 'EUR', store: '' } });
    const r = await refreshItemPrices('i1');
    expect(r.results[0]).toMatchObject({ changed: 'error', error: 'Page no longer matches this product', oldPrice: 100, newPrice: 100 });
    expect(item.priceHistory).toHaveLength(0);
  });

  it('records changed:"error" when the page has no price', async () => {
    const item = makeItem({ title: 'Widget', links: [{ label: 'Skroutz', url: 'https://skroutz.gr/x', price: 100 }] });
    itemFindById.mockReturnValueOnce(item as any);
    fetchPageTextMock.mockResolvedValue({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock.mockResolvedValue({ parsed: { title: 'Widget', price: 0, currency: 'EUR', store: '' } });
    const r = await refreshItemPrices('i1');
    expect(r.results[0]).toMatchObject({ changed: 'error', error: 'No price found on the page' });
  });

  it('classifies down/up/same and only pushes a price-history point on a genuine change or first reading', async () => {
    const item = makeItem({
      title: 'Widget',
      links: [
        { label: 'A', url: 'https://a.example.com/x', price: 100 },
        { label: 'B', url: 'https://b.example.com/x', price: 50 },
        { label: 'C', url: 'https://c.example.com/x', price: null }, // first reading
      ],
    });
    itemFindById.mockReturnValueOnce(item as any);
    fetchPageTextMock.mockResolvedValue({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock
      .mockResolvedValueOnce({ parsed: { title: 'Widget', price: 80, currency: 'EUR', store: '' } }) // A: down
      .mockResolvedValueOnce({ parsed: { title: 'Widget', price: 50, currency: 'EUR', store: '' } }) // B: same
      .mockResolvedValueOnce({ parsed: { title: 'Widget', price: 30, currency: 'EUR', store: '' } }); // C: first reading -> 'same', but IS logged
    const r = await refreshItemPrices('i1');
    expect(r.results.map((x) => x.changed)).toEqual(['down', 'same', 'same']);
    expect(item.links[0].price).toBe(80);
    expect(item.links[1].price).toBe(50);
    expect(item.links[2].price).toBe(30);
    // A changed (100->80) and C had no prior price -> both logged; B stayed at 50 -> not logged
    expect(item.priceHistory).toHaveLength(2);
    expect(item.currentPrice).toBe(30); // lowestKnownPrice recomputed after the loop
    expect(item.markModified).toHaveBeenCalledWith('links');
    expect(item.markModified).toHaveBeenCalledWith('priceHistory');
    expect(item.save).toHaveBeenCalledTimes(1);
  });

  it('records a fetch failure as changed:"error" with a friendlier Cloudflare message, and keeps going', async () => {
    const item = makeItem({
      title: 'Widget',
      links: [
        { label: 'A', url: 'https://a.example.com/x', price: 100 },
        { label: 'B', url: 'https://b.example.com/x', price: 50 },
      ],
    });
    itemFindById.mockReturnValueOnce(item as any);
    fetchPageTextMock
      .mockRejectedValueOnce(new Error('challenge: just a moment'))
      .mockResolvedValueOnce({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: { title: 'Widget', price: 40, currency: 'EUR', store: '' } });
    const r = await refreshItemPrices('i1');
    expect(r.results[0]).toMatchObject({ changed: 'error', error: 'Behind Cloudflare — start the price-scraper profile' });
    expect(r.results[1]).toMatchObject({ changed: 'down', newPrice: 40 });
  });
});

describe('recomputeAllItemPrices', () => {
  it('only saves items whose lowestKnownPrice differs from the stored currentPrice', async () => {
    const stale = makeItem({ currentPrice: 475, links: [{ label: 'x', url: 'https://a.example.com', price: 300 }] });
    const upToDate = makeItem({ currentPrice: 50, links: [{ label: 'x', url: 'https://b.example.com', price: 50 }] });
    const noLinks = makeItem({ currentPrice: 20, links: [] });
    itemFind.mockResolvedValue([stale, upToDate, noLinks]);

    const r = await recomputeAllItemPrices();

    expect(stale.currentPrice).toBe(300);
    expect(stale.save).toHaveBeenCalledTimes(1);
    expect(upToDate.save).not.toHaveBeenCalled();
    expect(noLinks.save).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: true, updated: 1 });
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
    expect(revalidatePathMock).toHaveBeenCalledWith('/shopping');
  });
});

describe('searchItemPriceCandidates: shopping country (#319)', () => {
  const greece = () =>
    vi.mocked(getAppSettings).mockResolvedValueOnce({ currency: 'EUR', shoppingCountry: 'GR', shoppingExtraShops: ['amazon.de'] } as any);
  const hit = (url: string) => ({ title: '', url, content: '' });

  it('reads only in-market shops (Greek first, then Amazon.de) and never spends a fetch or AI call on the rest', async () => {
    greece();
    itemFindById.mockReturnValue({ lean: async () => ({ title: 'RTX 5080', links: [] }) } as any);
    searchWebMock.mockImplementation(async (q = '') =>
      q.includes('site:amazon.de')
        ? [hit('https://www.amazon.de/rtx')]
        : [hit('https://www.newegg.com/rtx'), hit('https://www.skroutz.gr/rtx'), hit('https://www.amazon.com/rtx')]
    );
    fetchPageTextMock.mockResolvedValue({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock.mockResolvedValue({ parsed: { title: 'RTX 5080', price: 999, currency: 'EUR', store: '' } });
    await searchItemPriceCandidates('i1');
    expect(fetchPageTextMock.mock.calls.map((c) => c[0])).toEqual(['https://www.skroutz.gr/rtx', 'https://www.amazon.de/rtx']);
    expect(parseProductFromPageMock).toHaveBeenCalledTimes(2);
    expect(searchWebMock).toHaveBeenCalledWith('RTX 5080', 8, { language: 'el-GR' });
  });

  it('says so when nothing is in the market, instead of falling back to foreign shops', async () => {
    greece();
    itemFindById.mockReturnValue({ lean: async () => ({ title: 'RTX 5080', links: [] }) } as any);
    searchWebMock.mockImplementation(async () => [hit('https://www.newegg.com/rtx')]);
    const r = await searchItemPriceCandidates('i1');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/No shop found in GR/);
    expect(fetchPageTextMock).not.toHaveBeenCalled();
  });
});
