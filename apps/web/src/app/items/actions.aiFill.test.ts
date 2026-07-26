import { describe, it, expect, vi, beforeEach } from 'vitest';

// app/items/actions.ts is a large multi-concern module (see actions.crud.test.ts's header
// for the full concern list). This file covers the AI-FILL concern: fetchItemPhotos /
// aiFillItem / aiFillItemsBulk / aiFillSpecs / aiFillInfo, plus the unrelated-but-small
// convertItemToTask. The remaining URL-import concern (importItemFromUrl/previewItemFromUrl/
// confirmImportItem) is left for a follow-up file — it shares the same fetch+AI-parse+
// relevance-guard path exercised here and in actions.priceTracking.test.ts.
//
// Behaviour pinned:
//  - fetchItemPhotos: image-search by title first (via searchImages), only falling back to
//    scraping images off the item's http(s) product-page links (non-http links excluded)
//    when the image search comes up empty. Saves only when at least one photo was attached;
//    reports 'Could not find/download images' otherwise.
//  - aiFillItem is gated behind 'itemsImport' (checked before connectDB). With no links it
//    web-searches the title, filters out social/video hosts, and caps at 3 targets;
//    with links, it reads every one of them (no cap). Each target's parsed page must pass
//    the internal productMatchesItem relevance guard or it's skipped entirely (no fields
//    touched) — a bad match on an existing link still counts as "checked" but not "filled".
//    A priced existing link gets its price updated in place (no duplicate push); a priced
//    NEW target (or a price-less web-discovered one) gets pushed as a new link. Item-level
//    fields (specs/category/tags) are filled ONLY from the first target that both matches
//    and parses — never overwritten by a later page. Tags merge case-insensitively deduped,
//    capped at 8 total. Photos are fetched only when the item currently has zero photos AND
//    at least one page matched (okCount>0). currentPrice is set to the lowest price seen
//    across all targets. item.save() + markModified('links') always run once at the end,
//    even when nothing matched. aiFilledAt is stamped only when something was actually filled.
//  - aiFillItemsBulk caps to the first 5 ids and wraps each aiFillItem call in try/catch so
//    one bad id doesn't abort the batch.
//  - aiFillSpecs/aiFillInfo: same feature gate + not-found guard, same link-or-web-search
//    target resolution, same relevance guard. aiFillSpecs overwrites specs unconditionally
//    from the first usable page; aiFillInfo is additive (empty specs/'other' category/merged
//    tags only) and stops at the FIRST matching page (break, not "fill once but keep
//    scanning" like aiFillItem) — it never touches links/prices/photos.
//  - convertItemToTask copies title/price/links into an HTML task body (title/label/url are
//    HTML-escaped) without mutating or linking back to the item; '(no links)' when there are
//    none, no price line when currentPrice is 0.

const {
  connectDBMock,
  itemFindById,
  taskCreate,
  fetchPageTextMock,
  parseProductFromPageMock,
  searchWebMock,
  searchImagesMock,
  saveFileMock,
  fetchMock,
  isFeatureEnabledMock,
  revalidatePathMock,
  safeRevalidateMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  itemFindById: vi.fn((_id: string): any => null),
  taskCreate: vi.fn(async (doc: Record<string, any>) => ({ _id: 'task1', ...doc })),
  fetchPageTextMock: vi.fn(),
  parseProductFromPageMock: vi.fn(),
  searchWebMock: vi.fn(async () => [] as { title: string; url: string; content: string }[]),
  searchImagesMock: vi.fn(async () => [] as { title: string; imgSrc: string; source: string }[]),
  saveFileMock: vi.fn(async (_bucket: string, _buf: Buffer, ext: string) => ({ relativePath: `equipment/x.${ext}` })),
  fetchMock: vi.fn(),
  isFeatureEnabledMock: vi.fn(async () => true),
  revalidatePathMock: vi.fn(),
  safeRevalidateMock: vi.fn(),
}));

const itemModel = { findById: itemFindById };
const taskModel = { create: taskCreate };

vi.mock('@/models/Item', () => ({ Item: 'ITEM_MODEL_TOKEN' }));
vi.mock('@/models/Receipt', () => ({ Receipt: 'RECEIPT_MODEL_TOKEN' }));
vi.mock('@/models/Statement', () => ({ Statement: 'STATEMENT_MODEL_TOKEN' }));
vi.mock('@/models/Task', () => ({ Task: 'TASK_MODEL_TOKEN' }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({
  currentModel: async (token: unknown) => (token === 'TASK_MODEL_TOKEN' ? taskModel : itemModel),
}));
vi.mock('@/lib/scrape', () => ({ fetchPageText: fetchPageTextMock }));
vi.mock('@/lib/ollama', () => ({ parseProductFromPage: parseProductFromPageMock }));
vi.mock('@/lib/aiFeatures.server', () => ({ isFeatureEnabled: isFeatureEnabledMock }));
vi.mock('@/lib/search', () => ({ searchWeb: searchWebMock, searchImages: searchImagesMock }));
vi.mock('@/lib/storage', () => ({ saveFile: saveFileMock, deleteFile: vi.fn() }));
vi.mock('@/lib/ssrf', () => ({ assertPublicUrl: vi.fn(async () => {}) }));
vi.mock('@/lib/revalidate', () => ({ safeRevalidate: safeRevalidateMock }));
vi.mock('@/lib/appSettings', () => ({ getAppSettings: vi.fn(async () => ({ currency: 'EUR' })) }));
vi.mock('@/lib/money', () => ({ cur: () => '€' }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePathMock(p) }));

import { fetchItemPhotos, aiFillItem, aiFillItemsBulk, aiFillSpecs, aiFillInfo, convertItemToTask } from './actions';

function makeItem(overrides: Record<string, any> = {}) {
  return {
    title: 'Ubiquiti U7 Pro',
    category: 'other',
    specs: '',
    tags: [] as string[],
    photos: [] as string[],
    links: [] as { label: string; url: string; price: number | null }[],
    priceHistory: [] as { price: number; store: string; url?: string; date: Date }[],
    currentPrice: 0,
    aiFilledAt: undefined as Date | undefined,
    save: vi.fn(async () => {}),
    markModified: vi.fn(),
    ...overrides,
  };
}

/** Queue the two Item.findById calls aiFillItem/aiFillSpecs/aiFillInfo make: a plain
 *  document first (direct await), then a `.lean()`-chained "fresh" read at the end. */
function queueItemFind(item: any, fresh: any = item) {
  itemFindById.mockReturnValueOnce(item).mockReturnValueOnce({ lean: async () => fresh });
}

function imageResponse(len = 5000, contentType = 'image/jpeg') {
  return {
    ok: true,
    headers: { get: (k: string) => (k === 'content-type' ? contentType : k === 'content-length' ? String(len) : null) },
    arrayBuffer: async () => new ArrayBuffer(len),
  };
}

const DEFAULT_PARSED = { title: '', price: 0, currency: 'EUR', store: '', category: 'other' as const, specs: '', tags: [] as string[] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  isFeatureEnabledMock.mockResolvedValue(true);
});

describe('fetchItemPhotos', () => {
  it('reports item-not-found', async () => {
    const r = await fetchItemPhotos('i1');
    expect(r).toEqual({ ok: false, added: 0, photos: [], error: 'Item not found' });
  });

  it('attaches a photo found via image-search and saves', async () => {
    const item = makeItem();
    itemFindById.mockResolvedValueOnce(item);
    searchImagesMock.mockResolvedValueOnce([{ title: 't', imgSrc: 'https://img.example.com/a.jpg', source: 's' }]);
    fetchMock.mockResolvedValueOnce(imageResponse());
    const r = await fetchItemPhotos('i1');
    expect(r.ok).toBe(true);
    expect(r.added).toBe(1);
    expect(item.photos).toEqual(['equipment/x.jpg']);
    expect(item.save).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
    expect(revalidatePathMock).toHaveBeenCalledWith('/shopping');
  });

  it('reports failure and does not save when nothing could be found or downloaded', async () => {
    const item = makeItem({ links: [] });
    itemFindById.mockResolvedValueOnce(item);
    searchImagesMock.mockResolvedValueOnce([]);
    const r = await fetchItemPhotos('i1');
    expect(r).toEqual({ ok: false, added: 0, photos: [], error: 'Could not find/download images' });
    expect(item.save).not.toHaveBeenCalled();
  });

  it('falls back to scraping images off http(s) product-page links, excluding non-http links', async () => {
    const item = makeItem({
      links: [
        { label: 'x', url: 'https://shop.example.com/product', price: 100 },
        { label: 'bad', url: 'ftp://nope', price: null },
      ],
    });
    itemFindById.mockResolvedValueOnce(item);
    searchImagesMock.mockResolvedValueOnce([]);
    fetchMock
      .mockResolvedValueOnce({ ok: true, text: async () => '<meta property="og:image" content="https://shop.example.com/img.jpg">' })
      .mockResolvedValueOnce(imageResponse());
    const r = await fetchItemPhotos('i1');
    expect(r.ok).toBe(true);
    expect(r.added).toBe(1);
    const pageFetchCalls = fetchMock.mock.calls.filter(([u]) => u === 'https://shop.example.com/product');
    expect(pageFetchCalls).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([u]) => u === 'ftp://nope')).toBe(false);
  });
});

describe('aiFillItem', () => {
  it('is gated behind the itemsImport feature flag, before connectDB', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);
    const r = await aiFillItem('i1');
    expect(r).toEqual({ ok: false, checked: 0, filled: [], lowest: null, error: 'Product AI-fill is turned off.' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('reports item-not-found', async () => {
    const r = await aiFillItem('i1');
    expect(r).toEqual({ ok: false, checked: 0, filled: [], lowest: null, error: 'Item not found' });
  });

  it('skips a target whose page does not match the item (relevance guard), still saving unconditionally', async () => {
    const item = makeItem({ links: [{ label: 'x', url: 'https://shop.example.com/product', price: null }] });
    queueItemFind(item);
    fetchPageTextMock.mockResolvedValueOnce({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: { ...DEFAULT_PARSED, title: 'Unrelated Toaster', price: 20 } });
    const r = await aiFillItem('i1');
    expect(r.ok).toBe(false);
    expect(r.filled).toEqual([]);
    expect(r.error).toBe('Could not read any of the links (bot-protection or offline).');
    expect(item.save).toHaveBeenCalledTimes(1);
    expect(item.markModified).toHaveBeenCalledWith('links');
  });

  it('updates an existing link price in place (no duplicate push) and logs price history', async () => {
    const item = makeItem({ links: [{ label: 'Skroutz', url: 'https://skroutz.gr/x', price: null }] });
    queueItemFind(item);
    fetchPageTextMock.mockResolvedValueOnce({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: { ...DEFAULT_PARSED, title: 'Ubiquiti U7 Pro', price: 250, store: 'Skroutz' } });
    const r = await aiFillItem('i1');
    expect(item.links).toHaveLength(1);
    expect(item.links[0].price).toBe(250);
    expect(item.priceHistory).toHaveLength(1);
    expect(r.filled).toContain('prices');
    expect(r.filled).not.toContain('links');
    expect(r.lowest).toBe(250);
    expect(item.currentPrice).toBe(250);
    expect(r.filled).toContain('currentPrice');
    expect(item.aiFilledAt).toBeInstanceOf(Date);
  });

  it('pushes a new priced link for a web-discovered target not already linked, falling store back to the host', async () => {
    const item = makeItem({ links: [] });
    queueItemFind(item);
    searchWebMock.mockResolvedValueOnce([{ title: '', url: 'https://shop.example.com/a', content: '' }]);
    fetchPageTextMock.mockResolvedValueOnce({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: { ...DEFAULT_PARSED, title: 'Ubiquiti U7 Pro', price: 250 } });
    const r = await aiFillItem('i1');
    expect(item.links).toEqual([{ label: 'shop.example.com', url: 'https://shop.example.com/a', price: 250 }]);
    expect(r.filled).toContain('links');
    expect(r.filled).toContain('prices');
  });

  it('pushes a price-less link when web-discovered and the page had no price', async () => {
    const item = makeItem({ links: [] });
    queueItemFind(item);
    searchWebMock.mockResolvedValueOnce([{ title: '', url: 'https://shop.example.com/a', content: '' }]);
    fetchPageTextMock.mockResolvedValueOnce({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: { ...DEFAULT_PARSED, title: 'Ubiquiti U7 Pro', store: 'ShopX' } });
    const r = await aiFillItem('i1');
    expect(item.links).toEqual([{ label: 'ShopX', url: 'https://shop.example.com/a', price: null }]);
    expect(r.filled).toContain('links');
    expect(r.filled).not.toContain('prices');
    expect(r.lowest).toBeNull();
  });

  it('excludes social/video hosts and caps web-discovered targets at 3', async () => {
    const item = makeItem({ links: [] });
    queueItemFind(item);
    searchWebMock.mockResolvedValueOnce([
      { title: '', url: 'https://youtube.com/x', content: '' },
      { title: '', url: 'https://shop1.example.com/a', content: '' },
      { title: '', url: 'https://shop2.example.com/a', content: '' },
      { title: '', url: 'https://shop3.example.com/a', content: '' },
      { title: '', url: 'https://shop4.example.com/a', content: '' },
    ]);
    fetchPageTextMock.mockResolvedValue({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock.mockResolvedValue({ parsed: { ...DEFAULT_PARSED, title: 'Ubiquiti U7 Pro' } });
    const r = await aiFillItem('i1');
    expect(r.checked).toBe(3);
    const fetchedUrls = fetchPageTextMock.mock.calls.map((c) => c[0]);
    expect(fetchedUrls).not.toContain('https://youtube.com/x');
    expect(fetchedUrls).not.toContain('https://shop4.example.com/a');
  });

  it('fills item-level fields only from the first matching page, never overwriting from a later one', async () => {
    const item = makeItem({
      links: [
        { label: 'A', url: 'https://a.example.com/x', price: null },
        { label: 'B', url: 'https://b.example.com/x', price: null },
      ],
    });
    queueItemFind(item);
    fetchPageTextMock.mockResolvedValue({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock
      .mockResolvedValueOnce({ parsed: { ...DEFAULT_PARSED, title: 'Ubiquiti U7 Pro', category: 'network', specs: 'Spec A', tags: ['wifi7'] } })
      .mockResolvedValueOnce({ parsed: { ...DEFAULT_PARSED, title: 'Ubiquiti U7 Pro', category: 'compute', specs: 'Spec B', tags: ['wifi6'] } });
    await aiFillItem('i1');
    expect(item.specs).toBe('Spec A');
    expect(item.category).toBe('network');
    expect(item.tags).toEqual(['wifi7']);
  });

  it('merges tags case-insensitively deduped, capped at 8 total', async () => {
    const item = makeItem({
      links: [{ label: 'A', url: 'https://a.example.com/x', price: null }],
      tags: ['existing', 't1', 't2', 't3', 't4', 't5', 't6'],
    });
    queueItemFind(item);
    fetchPageTextMock.mockResolvedValueOnce({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock.mockResolvedValueOnce({
      parsed: { ...DEFAULT_PARSED, title: 'Ubiquiti U7 Pro', tags: ['Existing', 'NewTag', 'AnotherTag'] },
    });
    await aiFillItem('i1');
    expect(item.tags).toHaveLength(8);
    expect(item.tags).toContain('newtag');
    expect(item.tags).not.toContain('anothertag');
    expect(item.markModified).toHaveBeenCalledWith('tags');
  });

  it('attaches photos only when the item has none yet and at least one page matched', async () => {
    const item = makeItem({ links: [{ label: 'A', url: 'https://a.example.com/x', price: null }], photos: [] });
    queueItemFind(item);
    fetchPageTextMock.mockResolvedValueOnce({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: { ...DEFAULT_PARSED, title: 'Ubiquiti U7 Pro' } });
    searchImagesMock.mockResolvedValueOnce([{ title: 't', imgSrc: 'https://img.example.com/a.jpg', source: 's' }]);
    fetchMock.mockResolvedValueOnce(imageResponse());
    const r = await aiFillItem('i1');
    expect(item.photos).toHaveLength(1);
    expect(r.filled).toContain('photos');
  });

  it('does not touch photos when the item already has one', async () => {
    const item = makeItem({ links: [{ label: 'A', url: 'https://a.example.com/x', price: null }], photos: ['equipment/existing.jpg'] });
    queueItemFind(item);
    fetchPageTextMock.mockResolvedValueOnce({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: { ...DEFAULT_PARSED, title: 'Ubiquiti U7 Pro' } });
    const r = await aiFillItem('i1');
    expect(searchImagesMock).not.toHaveBeenCalled();
    expect(item.photos).toHaveLength(1);
    expect(r.filled).not.toContain('photos');
  });

  it('skips a target whose page fetch/parse throws and keeps going', async () => {
    const item = makeItem({
      links: [
        { label: 'A', url: 'https://a.example.com/x', price: null },
        { label: 'B', url: 'https://b.example.com/x', price: null },
      ],
    });
    queueItemFind(item);
    fetchPageTextMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: { ...DEFAULT_PARSED, title: 'Ubiquiti U7 Pro', price: 99 } });
    const r = await aiFillItem('i1');
    expect(r.checked).toBe(2);
    expect(r.lowest).toBe(99);
  });
});

describe('aiFillItemsBulk', () => {
  it('is gated behind the itemsImport feature flag', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);
    const r = await aiFillItemsBulk(['a']);
    expect(r).toEqual({ ok: false, results: [] });
  });

  it('caps the batch to the first 5 ids', async () => {
    const r = await aiFillItemsBulk(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(r.ok).toBe(true);
    expect(r.results).toHaveLength(5);
    expect(r.results.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(r.results.every((x) => x.ok === false && x.error === 'Item not found')).toBe(true);
  });

  it('catches a per-item exception without aborting the batch', async () => {
    connectDBMock.mockRejectedValueOnce(new Error('DB error '.repeat(20)));
    const r = await aiFillItemsBulk(['a']);
    expect(r.ok).toBe(true);
    expect(r.results[0].id).toBe('a');
    expect(r.results[0].ok).toBe(false);
    expect(r.results[0].error!.length).toBeLessThanOrEqual(120);
  });
});

describe('aiFillSpecs', () => {
  it('is gated behind the itemsImport feature flag, before connectDB', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);
    const r = await aiFillSpecs('i1');
    expect(r).toEqual({ ok: false, error: 'AI specs is turned off.' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('reports item-not-found', async () => {
    const r = await aiFillSpecs('i1');
    expect(r).toEqual({ ok: false, error: 'Item not found' });
  });

  it('reports "No source to read specs from" with no links and no web results', async () => {
    const item = makeItem({ links: [] });
    itemFindById.mockReturnValueOnce(item);
    searchWebMock.mockResolvedValueOnce([]);
    const r = await aiFillSpecs('i1');
    expect(r).toEqual({ ok: false, error: 'No source to read specs from' });
  });

  it('reports a truncated error message when the page fetch/parse throws', async () => {
    const item = makeItem({ links: [{ label: 'x', url: 'https://a.example.com', price: null }] });
    itemFindById.mockReturnValueOnce(item);
    fetchPageTextMock.mockRejectedValueOnce(new Error('boom'.repeat(40)));
    const r = await aiFillSpecs('i1');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Failed to read the page:');
  });

  it('reports "No specs found on the page" when the parse comes back empty', async () => {
    const item = makeItem({ links: [{ label: 'x', url: 'https://a.example.com', price: null }] });
    itemFindById.mockReturnValueOnce(item);
    fetchPageTextMock.mockResolvedValueOnce({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: { ...DEFAULT_PARSED } });
    const r = await aiFillSpecs('i1');
    expect(r).toEqual({ ok: false, error: 'No specs found on the page' });
  });

  it('overwrites specs from the first http(s) link, ignoring a non-http one', async () => {
    const item = makeItem({
      links: [
        { label: 'bad', url: 'ftp://nope', price: null },
        { label: 'x', url: 'https://a.example.com', price: null },
      ],
    });
    itemFindById.mockReturnValueOnce(item).mockReturnValueOnce({ lean: async () => ({ specs: 'Full specs here' }) });
    fetchPageTextMock.mockResolvedValueOnce({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: { ...DEFAULT_PARSED, specs: 'Full specs here' } });
    const r = await aiFillSpecs('i1');
    expect(r.ok).toBe(true);
    expect(r.specs).toBe('Full specs here');
    expect(item.specs).toBe('Full specs here');
    expect(item.save).toHaveBeenCalledTimes(1);
    expect(fetchPageTextMock).toHaveBeenCalledWith('https://a.example.com');
    expect(revalidatePathMock).toHaveBeenCalledWith('/items');
    expect(revalidatePathMock).toHaveBeenCalledWith('/shopping');
  });
});

describe('aiFillInfo', () => {
  it('is gated behind the itemsImport feature flag, before connectDB', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);
    const r = await aiFillInfo('i1');
    expect(r).toEqual({ ok: false, filled: [], error: 'Product AI is turned off.' });
    expect(connectDBMock).not.toHaveBeenCalled();
  });

  it('reports item-not-found', async () => {
    const r = await aiFillInfo('i1');
    expect(r).toEqual({ ok: false, filled: [], error: 'Item not found' });
  });

  it('excludes social hosts from a web-discovered search and reports failure when nothing matches', async () => {
    const item = makeItem({ links: [] });
    queueItemFind(item);
    searchWebMock.mockResolvedValueOnce([
      { title: '', url: 'https://youtube.com/x', content: '' },
      { title: '', url: 'https://shop.example.com/a', content: '' },
    ]);
    fetchPageTextMock.mockResolvedValueOnce({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock.mockResolvedValueOnce({ parsed: { ...DEFAULT_PARSED, title: 'Unrelated' } });
    const r = await aiFillInfo('i1');
    expect(r).toMatchObject({ ok: false, filled: [], error: 'Web search found nothing usable for this title.' });
    const fetchedUrls = fetchPageTextMock.mock.calls.map((c) => c[0]);
    expect(fetchedUrls).not.toContain('https://youtube.com/x');
  });

  it('fills empty specs/category/tags additively, stops at the first matching page, and never touches links/price/photos', async () => {
    const item = makeItem({
      links: [
        { label: 'A', url: 'https://a.example.com/x', price: null },
        { label: 'B', url: 'https://b.example.com/x', price: null },
      ],
    });
    queueItemFind(item);
    fetchPageTextMock.mockResolvedValueOnce({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock.mockResolvedValueOnce({
      parsed: { ...DEFAULT_PARSED, title: 'Ubiquiti U7 Pro', category: 'network', specs: 'Spec A', tags: ['wifi7'] },
    });
    const r = await aiFillInfo('i1');
    expect(fetchPageTextMock).toHaveBeenCalledTimes(1);
    expect(item.specs).toBe('Spec A');
    expect(item.category).toBe('network');
    expect(r.filled).toEqual(['specs', 'category', 'tags']);
    expect(r.ok).toBe(true);
    expect(item.links).toHaveLength(2);
    expect(item.currentPrice).toBe(0);
    expect(item.photos).toEqual([]);
    expect(item.aiFilledAt).toBeInstanceOf(Date);
  });

  it('never clobbers already-set specs or an already-specific category', async () => {
    const item = makeItem({
      specs: 'Existing specs',
      category: 'network',
      links: [{ label: 'A', url: 'https://a.example.com/x', price: null }],
    });
    queueItemFind(item);
    fetchPageTextMock.mockResolvedValueOnce({ url: '', title: '', jsonLd: '', text: '' });
    parseProductFromPageMock.mockResolvedValueOnce({
      parsed: { ...DEFAULT_PARSED, title: 'Ubiquiti U7 Pro', category: 'compute', specs: 'New specs' },
    });
    const r = await aiFillInfo('i1');
    expect(item.specs).toBe('Existing specs');
    expect(item.category).toBe('network');
    expect(r.filled).toEqual([]);
    expect(r.ok).toBe(true);
    expect(item.aiFilledAt).toBeUndefined();
  });
});

describe('convertItemToTask', () => {
  function queueItemLean(value: any) {
    itemFindById.mockReturnValueOnce({ lean: async () => value });
  }

  it('reports item-not-found and never creates a task', async () => {
    queueItemLean(null);
    const r = await convertItemToTask('i1');
    expect(r).toEqual({ ok: false, error: 'Item not found' });
    expect(taskCreate).not.toHaveBeenCalled();
  });

  it('builds an HTML task body with price line + linked-list of store links', async () => {
    queueItemLean({ title: 'RTX 5080', currentPrice: 999, links: [{ label: 'Skroutz', url: 'https://skroutz.gr/x', price: 999 }] });
    const r = await convertItemToTask('i1');
    expect(r).toEqual({ ok: true, taskId: 'task1' });
    const doc = taskCreate.mock.calls[0][0];
    expect(doc.title).toBe('RTX 5080');
    expect(doc.tags).toEqual(['shopping']);
    expect(doc.status).toBe('todo');
    expect(doc.content).toBe(
      '<p>From product: <strong>RTX 5080</strong></p><p>Price: <strong>€999</strong></p><ul><li><a href="https://skroutz.gr/x" target="_blank" rel="noopener noreferrer">Skroutz</a> — €999</li></ul>'
    );
    expect(revalidatePathMock).toHaveBeenCalledWith('/tasks');
  });

  it('shows "(no links)" and skips the price line when there are none / price is 0', async () => {
    queueItemLean({ title: 'Widget', currentPrice: 0, links: [] });
    await convertItemToTask('i1');
    const doc = taskCreate.mock.calls[0][0];
    expect(doc.content).toBe('<p>From product: <strong>Widget</strong></p><p>(no links)</p>');
  });

  it('HTML-escapes the title', async () => {
    queueItemLean({ title: 'A & B <script> "x"', currentPrice: 0, links: [] });
    await convertItemToTask('i1');
    const doc = taskCreate.mock.calls[0][0];
    expect(doc.content).toContain('A &amp; B &lt;script&gt; &quot;x&quot;');
  });
});
