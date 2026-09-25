import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeScrapeScope, selectForLinkSearch, selectForScrape } from './scrapeOrder';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 25);
const link = [{ url: 'https://shop.gr/p' }];
const ago = (d: number) => new Date(NOW - d * DAY);

describe('selectForScrape (#330)', () => {
  it('puts Shopping before Inventory, and the longest-unchecked first within each', () => {
    const items = [
      { id: 'owned-old', status: 'installed', links: link, lastPriceCheckAt: ago(30) },
      { id: 'shop-recent', status: 'researching', links: link, lastPriceCheckAt: ago(1) },
      { id: 'shop-never', status: 'decided', links: link },
      { id: 'deferred', status: 'deferred', links: link },
    ];
    expect(selectForScrape(items, { now: NOW }).map((i) => i.id)).toEqual(['shop-never', 'shop-recent', 'deferred', 'owned-old']);
  });

  it('re-checks an owned item only once its interval has passed; Shopping every run', () => {
    const items = [
      { id: 'owned-fresh', status: 'received', links: link, lastPriceCheckAt: ago(2) },
      { id: 'owned-due', status: 'received', links: link, lastPriceCheckAt: ago(8) },
      { id: 'shop-fresh', status: 'ordered', links: link, lastPriceCheckAt: ago(0) },
    ];
    expect(selectForScrape(items, { now: NOW, ownedIntervalDays: 7 }).map((i) => i.id)).toEqual(['shop-fresh', 'owned-due']);
  });

  it('skips items with no http link and sold or broken items', () => {
    const items = [
      { id: 'no-link', status: 'researching', links: [] },
      { id: 'ftp', status: 'researching', links: [{ url: 'ftp://x' }] },
      { id: 'sold', status: 'sold', links: link },
      { id: 'broken', status: 'broken', links: link },
    ];
    expect(selectForScrape(items, { now: NOW })).toEqual([]);
  });

  it('honours the scope setting', () => {
    const items = [
      { id: 's', status: 'researching', links: link },
      { id: 'o', status: 'installed', links: link },
    ];
    expect(selectForScrape(items, { now: NOW, scope: 'shopping' }).map((i) => i.id)).toEqual(['s']);
    expect(selectForScrape(items, { now: NOW, scope: 'inventory' }).map((i) => i.id)).toEqual(['o']);
  });

  it('normalises an unknown stored scope to both', () => {
    expect(normalizeScrapeScope('shopping')).toBe('shopping');
    expect(normalizeScrapeScope('nonsense')).toBe('both');
    expect(normalizeScrapeScope(undefined)).toBe('both');
  });
});

describe('selectForLinkSearch (#330)', () => {
  it('picks link-less Shopping items, never-searched first, at most max, retrying weekly', () => {
    const items = [
      { id: 'has-link', status: 'researching', links: link },
      { id: 'owned', status: 'installed', links: [] },
      { id: 'deferred', status: 'deferred', links: [] },
      { id: 'searched-yesterday', status: 'researching', links: [], linkSearchAt: ago(1) },
      { id: 'searched-long-ago', status: 'decided', links: [], linkSearchAt: ago(9) },
      { id: 'never', status: 'researching', links: [] },
    ];
    expect(selectForLinkSearch(items, { now: NOW, retryDays: 7, max: 3 }).map((i) => i.id)).toEqual(['never', 'searched-long-ago']);
    expect(selectForLinkSearch(items, { now: NOW, max: 1 }).map((i) => i.id)).toEqual(['never']);
  });
});

describe('scrapeOrder parity', () => {
  it('the scraper service carries an identical copy', () => {
    const web = readFileSync(resolve(__dirname, 'scrapeOrder.ts'), 'utf8');
    const scraper = readFileSync(resolve(__dirname, '../../../../services/scraper/src/scrapeOrder.ts'), 'utf8');
    expect(scraper).toBe(web);
  });
});
