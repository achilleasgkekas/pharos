import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/items/actions.ts is a large multi-concern module (see actions.crud.test.ts's header for
// the full concern list). This file covers the URL-IMPORT concern that actions.aiFill.test.ts
// explicitly left open: importItemFromUrl / previewItemFromUrl / confirmImportItem.
//
// Behaviour pinned:
//  - all three are gated behind the 'itemsImport' AI feature; a page that fails to fetch or
//    parse reports the reason instead of saving anything.
//  - dedup: an existing item is found by matching link URL first, then by fuzzy title; a match
//    is UPDATED (link + price + history) instead of creating a duplicate, and only its EMPTY
//    fields (specs, 'other' category) are filled — never clobbered.
//  - multi-currency (P9): the currency a page quotes in comes from the page's own markup
//    (ScrapedPage.currency, deterministic) and falls back to the model's reading of it. A NEW
//    item ADOPTS that currency, so a foreign price is stored as printed with fxRate 0 and gets
//    picked up by the Reports "missing exchange rates" audit rather than counting as base
//    currency. An EXISTING item keeps its own currency: a quote in another currency is NOT
//    written onto it (one item carries one rate for all its prices) — the store link is still
//    added, the price is left out, and the result says which currency was skipped.
//  - previewItemFromUrl saves nothing and reports a FOREIGN currency code only ('' when the page
//    quotes the deployment's base currency, so a single-currency deployment sees no change).

const {
  connectDBMock,
  itemFind,
  itemCreate,
  fetchPageTextMock,
  parseProductFromPageMock,
  isFeatureEnabledMock,
  revalidatePathMock,
  getAppSettingsMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  itemFind: vi.fn(async (): Promise<any[]> => []),
  itemCreate: vi.fn(async (doc: Record<string, any>) => ({ _id: 'new1', ...doc, photos: [], save: vi.fn(async () => {}) })),
  fetchPageTextMock: vi.fn(),
  parseProductFromPageMock: vi.fn(),
  isFeatureEnabledMock: vi.fn(async () => true),
  revalidatePathMock: vi.fn(),
  getAppSettingsMock: vi.fn(async () => ({ currency: 'EUR' })),
}));

const itemModel = { find: itemFind, create: itemCreate };

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
vi.mock('@/lib/search', () => ({ searchWeb: vi.fn(async () => []), searchImages: vi.fn(async () => []) }));
vi.mock('@/lib/storage', () => ({ saveFile: vi.fn(), deleteFile: vi.fn() }));
vi.mock('@/lib/ssrf', () => ({ assertPublicUrl: vi.fn(async () => {}) }));
vi.mock('@/lib/revalidate', () => ({ safeRevalidate: vi.fn() }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: getAppSettingsMock }));
vi.mock('@/lib/money', () => ({ cur: () => '€' }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { importItemFromUrl, previewItemFromUrl, confirmImportItem } from './actions';

const URL_USD = 'https://shop.example.com/product/rtx-5080';

function page(currency = '') {
  return { url: URL_USD, title: 'RTX 5080 - Shop', jsonLd: '', text: '', currency };
}

function parsed(overrides: Record<string, any> = {}) {
  return {
    title: 'NVIDIA RTX 5080',
    price: 1299,
    currency: '',
    store: 'Example Shop',
    category: 'compute' as const,
    specs: '16GB GDDR7',
    tags: [] as string[],
    ...overrides,
  };
}

function existingItem(overrides: Record<string, any> = {}) {
  return {
    _id: 'i1',
    title: 'NVIDIA RTX 5080',
    specs: 'existing specs',
    category: 'compute',
    currency: '',
    currentPrice: 1400,
    photos: ['equipment/a.jpg'], // non-empty → no photo fetching in these tests
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
  getAppSettingsMock.mockResolvedValue({ currency: 'EUR' });
  itemFind.mockResolvedValue([]);
  // attachImagesFromUrl / fillPhotos go through global fetch — never let a test hit the network.
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('no network in tests'); }));
});

describe('importItemFromUrl — feature gate and failures', () => {
  it('refuses when product import is turned off, before fetching anything', async () => {
    isFeatureEnabledMock.mockResolvedValueOnce(false);
    const r = await importItemFromUrl(URL_USD, 'shopping');
    expect(r).toEqual({ ok: false, error: 'Product import (AI) is turned off.' });
    expect(fetchPageTextMock).not.toHaveBeenCalled();
  });

  it('reports a page that could not be loaded', async () => {
    fetchPageTextMock.mockRejectedValueOnce(new Error('HTTP 403 from shop.example.com'));
    const r = await importItemFromUrl(URL_USD, 'shopping');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain('HTTP 403');
  });
});

describe('importItemFromUrl — new item', () => {
  it('creates a base-currency item with no FX fields set when the page quotes nothing', async () => {
    fetchPageTextMock.mockResolvedValueOnce(page());
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: parsed() });
    const r = await importItemFromUrl(URL_USD, 'shopping');
    expect(r.ok).toBe(true);
    const doc = itemCreate.mock.calls[0][0];
    expect(doc.currentPrice).toBe(1299);
    expect(doc.currency).toBe('EUR'); // the base code — nothing to convert
    expect(doc.origAmount).toBe(0);
    expect(doc.fxRate).toBe(0);
    expect(doc.status).toBe('researching');
  });

  it('adopts the currency the PAGE MARKUP declares, storing the printed price with no rate', async () => {
    fetchPageTextMock.mockResolvedValueOnce(page('USD'));
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: parsed() });
    const r = await importItemFromUrl(URL_USD, 'shopping');
    expect(r.ok).toBe(true);
    const doc = itemCreate.mock.calls[0][0];
    // No rate is invented: the printed figure stays put and origAmount+fxRate=0 make the
    // Reports audit ask for a rate instead of the sum quietly mixing dollars into euros.
    expect(doc.currency).toBe('USD');
    expect(doc.currentPrice).toBe(1299);
    expect(doc.origAmount).toBe(1299);
    expect(doc.fxRate).toBe(0);
  });

  it('falls back to the model-read currency when the markup declares none', async () => {
    fetchPageTextMock.mockResolvedValueOnce(page(''));
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: parsed({ currency: 'gbp' }) });
    await importItemFromUrl(URL_USD, 'shopping');
    expect(itemCreate.mock.calls[0][0].currency).toBe('GBP');
  });

  it('prefers the deterministic markup over the model when they disagree', async () => {
    fetchPageTextMock.mockResolvedValueOnce(page('USD'));
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: parsed({ currency: 'EUR' }) });
    expect((await importItemFromUrl(URL_USD, 'shopping')).ok).toBe(true);
    expect(itemCreate.mock.calls[0][0].currency).toBe('USD');
  });

  it('treats a page quoting the deployment base as not foreign', async () => {
    getAppSettingsMock.mockResolvedValue({ currency: 'USD' });
    fetchPageTextMock.mockResolvedValueOnce(page('USD'));
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: parsed() });
    await importItemFromUrl(URL_USD, 'shopping');
    const doc = itemCreate.mock.calls[0][0];
    expect(doc.currency).toBe('USD');
    expect(doc.origAmount).toBe(0); // nothing to convert, nothing to flag
  });

  it('imports into the inventory as "received" when asked', async () => {
    fetchPageTextMock.mockResolvedValueOnce(page());
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: parsed() });
    await importItemFromUrl(URL_USD, 'inventory');
    expect(itemCreate.mock.calls[0][0].status).toBe('received');
  });
});

describe('importItemFromUrl — existing item', () => {
  it('records the price on a same-currency match instead of creating a duplicate', async () => {
    const item = existingItem();
    itemFind.mockResolvedValue([item]);
    fetchPageTextMock.mockResolvedValueOnce(page());
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: parsed() });
    const r = await importItemFromUrl(URL_USD, 'shopping');
    expect(itemCreate).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, id: 'i1', updated: true, price: 1299 });
    expect(item.links).toEqual([{ label: 'Example Shop', url: URL_USD, price: 1299 }]);
    expect(item.priceHistory).toHaveLength(1);
    expect(item.currentPrice).toBe(1299);
    expect(item.save).toHaveBeenCalled();
  });

  it('keeps the link but LEAVES OUT a price quoted in another currency than the item', async () => {
    const item = existingItem(); // '' currency = base EUR
    itemFind.mockResolvedValue([item]);
    fetchPageTextMock.mockResolvedValueOnce(page('USD'));
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: parsed() });
    const r = await importItemFromUrl(URL_USD, 'shopping');
    expect(r).toMatchObject({ ok: true, updated: true, price: 0, priceSkippedCurrency: 'USD' });
    // The link is worth keeping ("where to buy"); the dollar figure is not written anywhere,
    // because every price on an item is converted by that item's single rate.
    expect(item.links).toEqual([{ label: 'Example Shop', url: URL_USD, price: null }]);
    expect(item.priceHistory).toHaveLength(0);
    expect(item.currentPrice).toBe(1400); // untouched
  });

  it('does not overwrite the price of an existing link with a foreign quote', async () => {
    const item = existingItem({ links: [{ label: 'Example Shop', url: URL_USD, price: 1350 }] });
    itemFind.mockResolvedValue([item]);
    fetchPageTextMock.mockResolvedValueOnce(page('USD'));
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: parsed() });
    await importItemFromUrl(URL_USD, 'shopping');
    expect(item.links[0].price).toBe(1350);
  });

  it('records the price when the item itself is in that foreign currency', async () => {
    const item = existingItem({ currency: 'USD' });
    itemFind.mockResolvedValue([item]);
    fetchPageTextMock.mockResolvedValueOnce(page('USD'));
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: parsed() });
    const r = await importItemFromUrl(URL_USD, 'shopping');
    expect(r).toMatchObject({ ok: true, price: 1299 });
    expect(r.ok === true && r.priceSkippedCurrency).toBeUndefined();
    expect(item.currentPrice).toBe(1299);
  });

  it('fills only empty fields on the match', async () => {
    const item = existingItem({ specs: '', category: 'other' });
    itemFind.mockResolvedValue([item]);
    fetchPageTextMock.mockResolvedValueOnce(page());
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: parsed() });
    await importItemFromUrl(URL_USD, 'shopping');
    expect(item.specs).toBe('16GB GDDR7');
    expect(item.category).toBe('compute');
  });
});

describe('previewItemFromUrl', () => {
  it('reports a foreign currency and saves nothing', async () => {
    fetchPageTextMock.mockResolvedValueOnce(page('USD'));
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: parsed() });
    const r = await previewItemFromUrl(URL_USD);
    expect(r).toMatchObject({ ok: true, title: 'NVIDIA RTX 5080', price: 1299, currency: 'USD', existing: null });
    expect(itemCreate).not.toHaveBeenCalled();
  });

  it('reports "" for a page quoting the base currency (single-currency deployments unchanged)', async () => {
    fetchPageTextMock.mockResolvedValueOnce(page('EUR'));
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: parsed() });
    const r = await previewItemFromUrl(URL_USD);
    expect(r.ok === true && r.currency).toBe('');
  });

  it('flags an existing item it would update', async () => {
    itemFind.mockResolvedValue([existingItem()]);
    fetchPageTextMock.mockResolvedValueOnce(page());
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: parsed() });
    const r = await previewItemFromUrl(URL_USD);
    expect(r.ok === true && r.existing).toEqual({ id: 'i1', title: 'NVIDIA RTX 5080' });
  });
});

describe('confirmImportItem — the approved preview, no AI re-parse', () => {
  const approved = {
    url: URL_USD,
    title: 'NVIDIA RTX 5080',
    price: 1299,
    store: 'Example Shop',
    specs: '16GB GDDR7',
    category: 'compute',
  };

  it('saves without touching the page or the model again', async () => {
    await confirmImportItem(approved, 'shopping');
    expect(fetchPageTextMock).not.toHaveBeenCalled();
    expect(parseProductFromPageMock).not.toHaveBeenCalled();
    expect(itemCreate).toHaveBeenCalledTimes(1);
  });

  it('carries the previewed currency onto the new item', async () => {
    await confirmImportItem({ ...approved, currency: 'USD' }, 'shopping');
    const doc = itemCreate.mock.calls[0][0];
    expect(doc.currency).toBe('USD');
    expect(doc.origAmount).toBe(1299);
    expect(doc.fxRate).toBe(0);
  });

  it('applies the same skip rule to a matched item in another currency', async () => {
    const item = existingItem();
    itemFind.mockResolvedValue([item]);
    const r = await confirmImportItem({ ...approved, currency: 'USD' }, 'shopping');
    expect(r).toMatchObject({ ok: true, updated: true, price: 0, priceSkippedCurrency: 'USD' });
    expect(item.priceHistory).toHaveLength(0);
    expect(item.currentPrice).toBe(1400);
  });

  it('records the price on a matched item when no currency was previewed', async () => {
    const item = existingItem();
    itemFind.mockResolvedValue([item]);
    const r = await confirmImportItem(approved, 'shopping');
    expect(r).toMatchObject({ ok: true, updated: true, price: 1299 });
    expect(item.currentPrice).toBe(1299);
  });

  it('falls back to "other" for a category outside the known list', async () => {
    await confirmImportItem({ ...approved, category: 'nonsense' }, 'shopping');
    expect(itemCreate.mock.calls[0][0].category).toBe('other');
  });
});
