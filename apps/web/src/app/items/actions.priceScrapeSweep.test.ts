import { describe, it, expect, vi, beforeEach } from 'vitest';

// Covers runPriceScrapeAllTenants(): the SaaS fan-out that runs runPriceScrape() once per
// live workspace and aggregates the counts. The per-item scrape logic is pinned in
// actions.priceScrape.test.ts; here we pin the FAN-OUT:
//   - no live tenants (SAAS off / empty registry) → zeroed result, scrape never touched;
//   - N tenants → runPriceScrape runs once inside each tenant's context and the counters sum;
//   - a whole-tenant failure is counted in tenantErrors and NEVER aborts the pass — a later
//     tenant still runs.
//
// listActiveTenantContexts (registry enumeration) and withTenant (AsyncLocalStorage) are
// mocked: withTenant just invokes fn() so the REAL runPriceScrape runs against the same fake
// Item/AppConfig models the other price test uses; the fake context objects only need to be
// distinct and countable.

const {
  connectDBMock,
  itemFind,
  configFindLean,
  fetchPageTextMock,
  parseProductFromPageMock,
  isFeatureEnabledMock,
  safeRevalidateMock,
  withTenantMock,
  listActiveTenantContextsMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(async () => {}),
  itemFind: vi.fn(async (_q: Record<string, any>) => [] as Array<Record<string, any>>),
  configFindLean: vi.fn(async () => ({ scraperEnabled: true, scraperMaxLinks: 0 }) as Record<string, any> | null),
  fetchPageTextMock: vi.fn(async (_url: string) => ({ url: '', title: '', jsonLd: '', text: '' })),
  parseProductFromPageMock: vi.fn(async () => ({ parsed: { title: '', store: '', price: 0, currency: 'EUR' }, raw: '', model: 'm' })),
  isFeatureEnabledMock: vi.fn(async () => true),
  safeRevalidateMock: vi.fn(),
  withTenantMock: vi.fn(<T,>(_ctx: unknown, fn: () => T): T => fn()),
  listActiveTenantContextsMock: vi.fn(async () => [] as Array<{ slug: string }>),
}));

const itemModel = { find: itemFind };
const configModel = { findOne: () => ({ select: () => ({ lean: configFindLean }) }) };

vi.mock('@/models/Item', () => ({ Item: 'ITEM_MODEL_TOKEN' }));
vi.mock('@/models/AppConfig', () => ({ AppConfig: 'APPCONFIG_TOKEN' }));
vi.mock('@/models/Receipt', () => ({ Receipt: 'RECEIPT_MODEL_TOKEN' }));
vi.mock('@/models/Statement', () => ({ Statement: 'STATEMENT_MODEL_TOKEN' }));
vi.mock('@/models/Task', () => ({ Task: 'TASK_MODEL_TOKEN' }));
vi.mock('@/lib/db', () => ({ connectDB: connectDBMock }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (token: unknown) => (token === 'APPCONFIG_TOKEN' ? configModel : itemModel) }));
vi.mock('@/lib/tenancy/current', () => ({ withTenant: withTenantMock }));
vi.mock('@/lib/tenancy/context', () => ({ listActiveTenantContexts: listActiveTenantContextsMock }));
vi.mock('@/lib/scrape', () => ({ fetchPageText: fetchPageTextMock }));
vi.mock('@/lib/ollama', () => ({ parseProductFromPage: parseProductFromPageMock }));
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

import { runPriceScrapeAllTenants } from './actions';

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
const parsedAt = (price: number) => ({ parsed: { title: 'RTX 5080 GPU', store: 'Shop', price, currency: 'EUR' }, raw: '', model: 'm' });

beforeEach(() => {
  vi.clearAllMocks();
  isFeatureEnabledMock.mockResolvedValue(true);
  itemFind.mockResolvedValue([]);
  configFindLean.mockResolvedValue({ scraperEnabled: true, scraperMaxLinks: 0 });
  withTenantMock.mockImplementation(<T,>(_ctx: unknown, fn: () => T): T => fn());
  fetchPageTextMock.mockResolvedValue({ url: 'https://shop.example/p', title: 'RTX 5080', jsonLd: '', text: 'RTX 5080 €900' });
});

describe('runPriceScrapeAllTenants', () => {
  it('does nothing when there are no live tenants (SAAS off / empty registry)', async () => {
    listActiveTenantContextsMock.mockResolvedValue([]);
    const r = await runPriceScrapeAllTenants();
    expect(r).toEqual({ ok: true, tenants: 0, tenantErrors: 0, scanned: 0, itemsChanged: 0, linksChecked: 0, drops: 0, errors: 0 });
    expect(withTenantMock).not.toHaveBeenCalled();
    expect(itemFind).not.toHaveBeenCalled();
  });

  it('runs the scrape once per tenant and sums the counters', async () => {
    listActiveTenantContextsMock.mockResolvedValue([{ slug: 'acme' }, { slug: 'globex' }]);
    // Tenant A: one item that dropped 900 → 850 (1 change, 1 drop). Tenant B: one unchanged item.
    itemFind
      .mockResolvedValueOnce([makeItemDoc({ currentPrice: 900, links: [{ label: 'Shop', url: 'https://shop.example/a', price: 900 }] })])
      .mockResolvedValueOnce([makeItemDoc({ currentPrice: 900, links: [{ label: 'Shop', url: 'https://shop.example/b', price: 900 }] })]);
    parseProductFromPageMock.mockResolvedValueOnce(parsedAt(850)).mockResolvedValueOnce(parsedAt(900));

    const r = await runPriceScrapeAllTenants();

    expect(withTenantMock).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ ok: true, tenants: 2, tenantErrors: 0, scanned: 2, itemsChanged: 1, linksChecked: 2, drops: 1, errors: 0 });
  });

  it('passes each tenant context to withTenant', async () => {
    const ctxA = { slug: 'acme' };
    const ctxB = { slug: 'globex' };
    listActiveTenantContextsMock.mockResolvedValue([ctxA, ctxB]);
    await runPriceScrapeAllTenants();
    expect(withTenantMock.mock.calls[0][0]).toBe(ctxA);
    expect(withTenantMock.mock.calls[1][0]).toBe(ctxB);
  });

  it('counts a whole-tenant failure in tenantErrors and keeps going', async () => {
    listActiveTenantContextsMock.mockResolvedValue([{ slug: 'broken' }, { slug: 'ok' }]);
    // First tenant blows up entering its context; the second still scrapes normally.
    withTenantMock
      .mockImplementationOnce(() => { throw new Error('tenant db unreachable'); })
      .mockImplementationOnce(<T,>(_ctx: unknown, fn: () => T): T => fn());
    itemFind.mockResolvedValue([makeItemDoc({ currentPrice: 900, links: [{ label: 'Shop', url: 'https://shop.example/ok', price: 900 }] })]);
    parseProductFromPageMock.mockResolvedValue(parsedAt(880));

    const r = await runPriceScrapeAllTenants();

    expect(r).toMatchObject({ ok: true, tenants: 1, tenantErrors: 1, scanned: 1, itemsChanged: 1, linksChecked: 1, drops: 1 });
  });
});
