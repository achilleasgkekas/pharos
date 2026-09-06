import { describe, it, expect, vi, beforeEach } from 'vitest';

// Covers the 6-hourly price scraper batch: runPriceScrape() in app/items/actions.ts.
// It is the unattended fan-out of the per-item refreshItemPrices() over the whole
// inventory, driven by /api/cron/prices. No real mongo: currentModel returns a fake
// Item model whose find() resolves to an array of mutable "docs" (save/markModified are
// spies), and the scrape (fetchPageText) + parse (parseProductFromPage) are mocked so we
// pin the price/history logic, not the network.
//
// Behaviour pinned:
//  - Feature off (isFeatureEnabled false) -> no DB touch, {skipped:'product AI is off'}.
//  - A moved price updates the link, pushes ONE price-history point, recomputes
//    currentPrice to the lowest, saves once, and counts drops on a decrease.
//  - An unchanged price writes nothing (no save, no history) but still counts the link.
//  - One item that throws mid-scrape is counted in `errors` and NEVER aborts the pass —
//    a later item still gets scraped and saved.
//  - productMatchesItem is REAL: a parsed product that does not mention the item's
//    distinctive token is treated as an error (stale page), old price kept.

const {
  connectDBMock,
  itemFind,
  fetchPageTextMock,
  parseProductFromPageMock,
  isFeatureEnabledMock,
  safeRevalidateMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  itemFind: vi.fn(async (_q: Record<string, any>) => [] as Array<Record<string, any>>),
  fetchPageTextMock: vi.fn(async (_url: string) => ({ url: '', title: '', jsonLd: '', text: '' })),
  parseProductFromPageMock: vi.fn(async () => ({ parsed: { title: '', store: '', price: 0, currency: 'EUR' }, raw: '', model: 'm' })),
  isFeatureEnabledMock: vi.fn(async () => true),
  safeRevalidateMock: vi.fn(),
}));

const itemModel = { find: itemFind };

vi.mock('@/models/Item', () => ({ Item: 'ITEM_MODEL_TOKEN' }));
vi.mock('@/models/Receipt', () => ({ Receipt: 'RECEIPT_MODEL_TOKEN' }));
vi.mock('@/models/Statement', () => ({ Statement: 'STATEMENT_MODEL_TOKEN' }));
vi.mock('@/models/Task', () => ({ Task: 'TASK_MODEL_TOKEN' }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async () => itemModel }));
vi.mock('@/lib/scrape', () => ({ fetchPageText: fetchPageTextMock }));
vi.mock('@/lib/ollama', () => ({ parseProductFromPage: parseProductFromPageMock }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: isFeatureEnabledMock }));
vi.mock('@/lib/search', () => ({ searchWeb: vi.fn(), searchImages: vi.fn() }));
vi.mock('@/lib/storage', () => ({ saveFile: vi.fn(), deleteFile: vi.fn() }));
vi.mock('@/lib/ssrf', () => ({ assertPublicUrl: vi.fn(async () => {}) }));
vi.mock('@/lib/revalidate', () => ({ safeRevalidate: safeRevalidateMock }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: vi.fn(async () => ({ currency: 'EUR' })) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { runPriceScrape } from './actions';

type Link = { label?: string; url: string; price: number | null };
function makeItemDoc(overrides: Partial<Record<string, any>> = {}) {
  return {
    _id: '507f1f77bcf86cd799439001',
    title: 'RTX 5080',
    currentPrice: 999,
    links: [] as Link[],
    priceHistory: [] as any[],
    save: vi.fn(async () => {}),
    markModified: vi.fn(),
    ...overrides,
  };
}

// A parsed product that satisfies the REAL productMatchesItem for title "RTX 5080"
// (its distinctive token is "5080") at the given price.
const parsedAt = (price: number) => ({ parsed: { title: 'RTX 5080 GPU', store: 'Shop', price, currency: 'EUR' }, raw: '', model: 'm' });

beforeEach(() => {
  vi.clearAllMocks();
  isFeatureEnabledMock.mockResolvedValue(true);
  itemFind.mockResolvedValue([]);
  fetchPageTextMock.mockResolvedValue({ url: 'https://shop.example/p', title: 'RTX 5080', jsonLd: '', text: 'RTX 5080 €900' });
});

describe('runPriceScrape', () => {
  it('skips entirely when the product AI feature is off', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);
    const r = await runPriceScrape();
    expect(r).toMatchObject({ ok: true, scanned: 0, skipped: 'product AI is off' });
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(itemFind).not.toHaveBeenCalled();
  });

  it('only queries non-deleted items that have at least one link', async () => {
    await runPriceScrape();
    expect(itemFind).toHaveBeenCalledWith({ deletedAt: null, 'links.0': { $exists: true } });
  });

  it('updates a moved price: writes the link, one history point, recomputes currentPrice, counts a drop', async () => {
    const item = makeItemDoc({ currentPrice: 900, links: [{ label: 'Shop', url: 'https://shop.example/p', price: 900 }] });
    itemFind.mockResolvedValue([item]);
    parseProductFromPageMock.mockResolvedValue(parsedAt(850)); // dropped 900 -> 850

    const r = await runPriceScrape();

    expect(item.links[0].price).toBe(850);
    expect(item.priceHistory).toHaveLength(1);
    expect(item.priceHistory[0]).toMatchObject({ price: 850, store: 'Shop', url: 'https://shop.example/p' });
    expect(item.currentPrice).toBe(850);
    expect(item.save).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: true, scanned: 1, itemsChanged: 1, linksChecked: 1, drops: 1, errors: 0 });
  });

  it('writes nothing when the price is unchanged, but still counts the link checked', async () => {
    const item = makeItemDoc({ currentPrice: 900, links: [{ label: 'Shop', url: 'https://shop.example/p', price: 900 }] });
    itemFind.mockResolvedValue([item]);
    parseProductFromPageMock.mockResolvedValue(parsedAt(900)); // same

    const r = await runPriceScrape();

    expect(item.priceHistory).toHaveLength(0);
    expect(item.save).not.toHaveBeenCalled();
    expect(r).toMatchObject({ scanned: 1, itemsChanged: 0, linksChecked: 1, drops: 0, errors: 0 });
  });

  it('counts a fetch error and keeps going — a later item is still scraped and saved', async () => {
    const bad = makeItemDoc({ _id: '507f1f77bcf86cd799439002', currentPrice: 500, links: [{ label: 'Bad', url: 'https://bad.example/p', price: 500 }] });
    const good = makeItemDoc({ _id: '507f1f77bcf86cd799439003', currentPrice: 700, links: [{ label: 'Good', url: 'https://good.example/p', price: 700 }] });
    itemFind.mockResolvedValue([bad, good]);
    fetchPageTextMock
      .mockRejectedValueOnce(new Error('just a moment (cloudflare)'))
      .mockResolvedValueOnce({ url: 'https://good.example/p', title: 'RTX 5080', jsonLd: '', text: 'RTX 5080' });
    parseProductFromPageMock.mockResolvedValue(parsedAt(650)); // good item moved 700 -> 650

    const r = await runPriceScrape();

    expect(bad.save).not.toHaveBeenCalled();
    expect(good.links[0].price).toBe(650);
    expect(good.save).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: true, scanned: 2, itemsChanged: 1, linksChecked: 2, drops: 1, errors: 1 });
  });

  it('treats a page that no longer matches the product as an error, keeping the old price', async () => {
    const item = makeItemDoc({ currentPrice: 900, links: [{ label: 'Shop', url: 'https://shop.example/p', price: 900 }] });
    itemFind.mockResolvedValue([item]);
    // Parsed product mentions nothing distinctive about "RTX 5080" -> productMatchesItem false.
    parseProductFromPageMock.mockResolvedValue({ parsed: { title: 'Wireless Mouse', store: 'Shop', price: 25, currency: 'EUR' }, raw: '', model: 'm' });

    const r = await runPriceScrape();

    expect(item.links[0].price).toBe(900); // unchanged
    expect(item.priceHistory).toHaveLength(0);
    expect(item.save).not.toHaveBeenCalled();
    expect(r).toMatchObject({ scanned: 1, itemsChanged: 0, linksChecked: 1, errors: 1 });
  });
});
