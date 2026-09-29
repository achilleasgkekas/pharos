import { beforeEach, describe, expect, it, vi } from 'vitest';

const { searchWebMock, searchStoreCandidatesMock, resolveStoresForProductMock } = vi.hoisted(() => ({
  searchWebMock: vi.fn(),
  searchStoreCandidatesMock: vi.fn().mockResolvedValue([]),
  resolveStoresForProductMock: vi.fn().mockResolvedValue({ detectedCategory: 'electronics', stores: [] }),
}));
vi.mock('@/lib/search', () => ({ searchWeb: searchWebMock }));
vi.mock('@/lib/storeSearch', () => ({ searchStoreCandidates: searchStoreCandidatesMock }));
vi.mock('@/lib/storeIntelligence', () => ({ resolveStoresForProduct: resolveStoresForProductMock }));

import { searchShops } from './shopSearch';
import { marketFor } from './shoppingRegion';

const hit = (url: string) => ({ title: url, url, content: '' });

beforeEach(() => {
  searchWebMock.mockReset();
});

describe('searchShops', () => {
  it('with no market it is a plain searchWeb call, unchanged', async () => {
    searchWebMock.mockResolvedValue([hit('https://www.newegg.com/rtx')]);
    const out = await searchShops('RTX 5080', null, 8);
    expect(searchWebMock).toHaveBeenCalledTimes(1);
    expect(searchWebMock).toHaveBeenCalledWith('RTX 5080', 8);
    expect(out.map((r) => r.url)).toEqual(['https://www.newegg.com/rtx']);
  });

  it('searches in the market language, adds a site: query per shipping shop, and keeps only in-market hits', async () => {
    searchWebMock.mockImplementation(async (q: string) =>
      q.includes('site:amazon.de')
        ? [hit('https://www.amazon.de/rtx')]
        : [hit('https://www.newegg.com/rtx'), hit('https://www.skroutz.gr/rtx'), hit('https://www.amazon.com/rtx')]
    );
    const out = await searchShops('RTX 5080', marketFor('GR', ['amazon.de']), 8);
    expect(searchWebMock).toHaveBeenCalledWith('RTX 5080', 8, { language: 'el-GR' });
    expect(searchWebMock).toHaveBeenCalledWith('RTX 5080 site:amazon.de', 3, { language: 'el-GR' });
    expect(out.map((r) => r.url)).toEqual(['https://www.skroutz.gr/rtx', 'https://www.amazon.de/rtx']);
  });

  it('prioritizes direct candidate links found from targeted stores', async () => {
    resolveStoresForProductMock.mockResolvedValueOnce({
      detectedCategory: 'electronics',
      stores: [{ name: 'Skroutz', domain: 'skroutz.gr', searchUrl: 'https://www.skroutz.gr/search?keyphrase=RTX+5080' }],
    });
    searchStoreCandidatesMock.mockResolvedValueOnce([
      { title: 'Skroutz RTX 5080', url: 'https://www.skroutz.gr/s/123/rtx.html', store: 'Skroutz', domain: 'skroutz.gr' },
      { title: 'Plaisio RTX 5080', url: 'https://www.plaisio.gr/product/123', store: 'Plaisio', domain: 'plaisio.gr' },
    ]);
    const out = await searchShops('RTX 5080', marketFor('GR', ['amazon.de']), 8);
    expect(out.map((r) => r.url)).toContain('https://www.skroutz.gr/s/123/rtx.html');
    expect(out.map((r) => r.url)).toContain('https://www.plaisio.gr/product/123');
  });
});
