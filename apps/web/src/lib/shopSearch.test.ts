import { beforeEach, describe, expect, it, vi } from 'vitest';

const { searchWebMock } = vi.hoisted(() => ({ searchWebMock: vi.fn() }));
vi.mock('@/lib/search', () => ({ searchWeb: searchWebMock }));

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
});
