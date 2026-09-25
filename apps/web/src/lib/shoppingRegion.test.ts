import { describe, expect, it } from 'vitest';
import {
  countryFromLanguageTag,
  marketFor,
  marketRank,
  normalizeShopHost,
  normalizeShopList,
  normalizeShoppingCountry,
  rankByMarket,
  SHOPPING_PRESETS,
} from './shoppingRegion';

const GR = marketFor('GR', ['amazon.de'])!;

describe('normalizeShopHost', () => {
  it('reduces a pasted URL to its bare host', () => {
    expect(normalizeShopHost('https://www.Amazon.de/dp/B0X?tag=1')).toBe('amazon.de');
    expect(normalizeShopHost('amazon.de.')).toBe('amazon.de');
    expect(normalizeShopHost('shop.example.co.uk:443')).toBe('shop.example.co.uk');
  });

  it('rejects anything that is not a plausible domain', () => {
    for (const bad of ['', 'amazon', 'not a domain', 'javascript:alert(1)', '..de', '-x.de']) {
      expect(normalizeShopHost(bad)).toBe('');
    }
  });
});

describe('normalizeShopList', () => {
  it('splits on commas/whitespace, cleans, dedupes', () => {
    expect(normalizeShopList('amazon.de, https://www.amazon.de/ ; amazon.it\nbogus')).toEqual(['amazon.de', 'amazon.it']);
  });

  it('accepts an array and caps at 20', () => {
    const many = Array.from({ length: 30 }, (_, i) => `shop${i}.de`);
    expect(normalizeShopList(many)).toHaveLength(20);
    expect(normalizeShopList(undefined)).toEqual([]);
  });
});

describe('normalizeShoppingCountry / marketFor', () => {
  it('accepts a known code in any case, else off', () => {
    expect(normalizeShoppingCountry('gr')).toBe('GR');
    expect(normalizeShoppingCountry('XX')).toBe('');
    expect(normalizeShoppingCountry(undefined)).toBe('');
  });

  it('is null when no country is chosen', () => {
    expect(marketFor('', ['amazon.de'])).toBeNull();
  });

  it('takes language and domains from the preset, shops from the setting', () => {
    expect(GR).toEqual({ country: 'GR', language: 'el-GR', domains: ['gr'], extraShops: ['amazon.de'] });
  });

  it('every preset has a language and at least one domain', () => {
    for (const [code, p] of Object.entries(SHOPPING_PRESETS)) {
      expect(p.language, code).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
      expect(p.domains.length, code).toBeGreaterThan(0);
    }
  });
});

describe('marketRank', () => {
  it('ranks by host: own country 0, shipping shop 1, the rest out', () => {
    expect(marketRank('https://www.skroutz.gr/s/123', GR)).toBe(0);
    expect(marketRank('https://www.public.gr/product/x', GR)).toBe(0);
    expect(marketRank('https://www.amazon.de/dp/B0X', GR)).toBe(1);
    expect(marketRank('https://smile.amazon.de/dp/B0X', GR)).toBe(1);
    expect(marketRank('https://www.newegg.com/p/N82E', GR)).toBeNull();
    expect(marketRank('https://www.amazon.com/dp/B0X', GR)).toBeNull();
  });

  it('never matches on a substring', () => {
    expect(marketRank('https://amazon.de.evil.com/dp/B0X', GR)).toBeNull();
    expect(marketRank('https://notamazon.de/x', GR)).toBeNull();
    expect(marketRank('https://example.com/shop.gr/x', GR)).toBeNull();
    expect(marketRank('https://www.newegg.com/?ref=skroutz.gr', GR)).toBeNull();
  });

  it('rejects non-web and malformed URLs', () => {
    expect(marketRank('ftp://files.gr/x', GR)).toBeNull();
    expect(marketRank('not a url', GR)).toBeNull();
  });

  it('matches multi-label country endings (co.uk)', () => {
    const uk = marketFor('GB', [])!;
    expect(marketRank('https://www.scan.co.uk/products/x', uk)).toBe(0);
  });
});

describe('rankByMarket', () => {
  it('keeps in-market results, own country first, search order within each group, no duplicates', () => {
    const r = (url: string) => ({ url });
    const out = rankByMarket(
      [
        r('https://www.newegg.com/rtx'),
        r('https://www.amazon.de/rtx'),
        r('https://www.skroutz.gr/rtx'),
        r('https://www.amazon.com/rtx'),
        r('https://www.public.gr/rtx'),
        r('https://www.skroutz.gr/rtx'),
        r('https://amazon.de.evil.com/rtx'),
      ],
      GR
    );
    expect(out.map((x) => x.url)).toEqual(['https://www.skroutz.gr/rtx', 'https://www.public.gr/rtx', 'https://www.amazon.de/rtx']);
  });
});

describe('countryFromLanguageTag', () => {
  it('suggests the preset country for a tag with a region', () => {
    expect(countryFromLanguageTag('el-GR')).toBe('GR');
    expect(countryFromLanguageTag('de_AT')).toBe('AT');
    expect(countryFromLanguageTag('en-gb')).toBe('GB');
  });

  it('suggests nothing without a region, or for a region with no preset', () => {
    for (const tag of ['el', '', undefined, 'en-JP', 'zh-Hant-TW', 'es-419']) expect(countryFromLanguageTag(tag)).toBe('');
  });
});
