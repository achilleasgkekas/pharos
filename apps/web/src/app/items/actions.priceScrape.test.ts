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
  itemUpdateOne,
  configFindLean,
  fetchPageTextMock,
  parseProductFromPageMock,
  isFeatureEnabledMock,
  safeRevalidateMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  itemFind: vi.fn(async (_q: Record<string, any>) => [] as Array<Record<string, any>>),
  itemUpdateOne: vi.fn(async (..._a: any[]) => ({})),
  configFindLean: vi.fn(async () => ({ scraperEnabled: true, scraperMaxLinks: 0 }) as Record<string, any> | null),
  fetchPageTextMock: vi.fn(async (_url: string) => ({ url: '', title: '', jsonLd: '', text: '' })),
  parseProductFromPageMock: vi.fn(async () => ({ parsed: { title: '', store: '', price: 0, currency: 'EUR' }, raw: '', model: 'm' })),
  isFeatureEnabledMock: vi.fn(async () => true),
  safeRevalidateMock: vi.fn(),
}));

const itemModel = { find: itemFind, updateOne: itemUpdateOne };
const configModel = { findOne: () => ({ select: () => ({ lean: configFindLean }) }) };

vi.mock('@/models/Item', () => ({ Item: 'ITEM_MODEL_TOKEN' }));
vi.mock('@/models/AppConfig', () => ({ AppConfig: 'APPCONFIG_TOKEN' }));
vi.mock('@/models/Receipt', () => ({ Receipt: 'RECEIPT_MODEL_TOKEN' }));
vi.mock('@/models/Statement', () => ({ Statement: 'STATEMENT_MODEL_TOKEN' }));
vi.mock('@/models/Task', () => ({ Task: 'TASK_MODEL_TOKEN' }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (token: unknown) => (token === 'APPCONFIG_TOKEN' ? configModel : itemModel) }));
vi.mock('@/lib/scrape', () => ({ fetchPageText: fetchPageTextMock }));
vi.mock('@/lib/ollama', () => ({ parseProductFromPage: parseProductFromPageMock }));
// runPriceScrape now scrapes via the shared cache; delegate it to the same fetch/parse mocks
// so these tests still drive fetch behaviour (error isolation, cap) without a real DB.
vi.mock('@/lib/scrapedPriceCache', () => ({
  getParsedProductForUrl: async (url: string) => {
    const page = await fetchPageTextMock(url);
    const { parsed } = await parseProductFromPageMock();
    return { parsed, pageTitle: (page as { title?: string })?.title ?? '', cached: false };
  },
}));
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
    status: 'researching', // a Shopping item unless a test says otherwise (#330)
    currentPrice: 999,
    links: [] as Link[],
    priceHistory: [] as any[],
    save: vi.fn(async () => {}),
    markModified: vi.fn(),
    set(this: Record<string, any>, v: Record<string, any>) {
      Object.assign(this, v);
    },
    ...overrides,
  };
}

/** The `$set` the scrape recorded for an item that had no price change. */
const recordedCheck = (id: string) => {
  const call = itemUpdateOne.mock.calls.find((c) => c[0]?._id === id && c[1]?.$set?.lastPriceCheckAt);
  return call ? { set: call[1].$set, opts: call[2] } : null;
};

// A parsed product that satisfies the REAL productMatchesItem for title "RTX 5080"
// (its distinctive token is "5080") at the given price.
const parsedAt = (price: number) => ({ parsed: { title: 'RTX 5080 GPU', store: 'Shop', price, currency: 'EUR' }, raw: '', model: 'm' });

beforeEach(() => {
  vi.clearAllMocks();
  isFeatureEnabledMock.mockResolvedValue(true);
  itemFind.mockResolvedValue([]);
  configFindLean.mockResolvedValue({ scraperEnabled: true, scraperMaxLinks: 0, scraperFindLinks: false }); // enabled, no cap
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

  it('skips when the scraper is disabled in settings (scraperEnabled=false)', async () => {
    configFindLean.mockResolvedValue({ scraperEnabled: false, scraperMaxLinks: 0 });
    itemFind.mockResolvedValue([makeItemDoc({ links: [{ label: 'Shop', url: 'https://shop.example/p', price: 900 }] })]);
    const r = await runPriceScrape();
    expect(r).toMatchObject({ ok: true, scanned: 0, skipped: 'scraper disabled' });
    expect(itemFind).not.toHaveBeenCalled(); // bailed before querying items
  });

  it('stops at the per-run link cap (scraperMaxLinks)', async () => {
    configFindLean.mockResolvedValue({ scraperEnabled: true, scraperMaxLinks: 2, scraperFindLinks: false });
    const mk = (id: string) => makeItemDoc({ _id: id, links: [{ label: 'S', url: `https://shop.example/${id}`, price: 100 }] });
    itemFind.mockResolvedValue([mk('a'), mk('b'), mk('c'), mk('d')]); // 4 items, 1 link each
    parseProductFromPageMock.mockResolvedValue(parsedAt(90));
    const r = await runPriceScrape();
    expect(r.linksChecked).toBe(2); // stopped after 2, not 4
    expect(r.scanned).toBeLessThanOrEqual(2);
  });

  it('queries non-deleted items that are not sold or broken (the link check is in selectForScrape)', async () => {
    await runPriceScrape();
    expect(itemFind).toHaveBeenCalledWith({ deletedAt: null, status: { $nin: ['sold', 'broken'] } });
  });

  it('checks Shopping items before owned ones, so a link cap never starves Shopping (#330)', async () => {
    configFindLean.mockResolvedValue({ scraperEnabled: true, scraperMaxLinks: 1, scraperFindLinks: false });
    const owned = makeItemDoc({ _id: 'owned', status: 'installed', links: [{ label: 'S', url: 'https://shop.example/o', price: 900 }] });
    const wanted = makeItemDoc({ _id: 'wanted', status: 'researching', links: [{ label: 'S', url: 'https://shop.example/w', price: 900 }] });
    itemFind.mockResolvedValue([owned, wanted]); // owned listed first, as the old query returned them
    parseProductFromPageMock.mockResolvedValue(parsedAt(850));

    const r = await runPriceScrape();

    expect(r.linksChecked).toBe(1);
    expect(wanted.links[0].price).toBe(850);
    expect(owned.links[0].price).toBe(900); // not reached this run
  });

  it('skips an owned item that was price-checked within the last week', async () => {
    const owned = makeItemDoc({ _id: 'owned', status: 'received', lastPriceCheckAt: new Date(Date.now() - 86_400_000), links: [{ label: 'S', url: 'https://shop.example/o', price: 900 }] });
    itemFind.mockResolvedValue([owned]);
    const r = await runPriceScrape();
    expect(r.scanned).toBe(0);
    expect(fetchPageTextMock).not.toHaveBeenCalled();
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
    // The check itself is still recorded, without bumping updatedAt.
    expect(recordedCheck(item._id)).toMatchObject({ set: { lastPriceCheckNote: '' }, opts: { timestamps: false } });
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
    expect(recordedCheck(bad._id)?.set.lastPriceCheckNote).toBe('error');
    expect(good.links[0].price).toBe(650);
    expect((good as Record<string, unknown>).lastPriceCheckNote).toBe('');
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
    expect(recordedCheck(item._id)?.set.lastPriceCheckNote).toBe('no-match');
    expect(r).toMatchObject({ scanned: 1, itemsChanged: 0, linksChecked: 1, errors: 1 });
  });
});
