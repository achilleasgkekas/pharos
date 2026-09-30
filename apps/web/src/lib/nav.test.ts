import { describe, expect, it } from 'vitest';
import {
  HOME_ITEM,
  NAV_GROUPS,
  ACCOUNT_LINKS,
  ALL_NAV_ITEMS,
  navActive,
} from './nav';

// Extracted from apps/web/e2e/smoke.mjs
const SMOKE_PAGES = [
  '/', '/items', '/shopping', '/shopping-list', '/receipts', '/expenses', '/income', '/bills',
  '/utilities', '/vehicles', '/statements', '/subscriptions', '/vouchers', '/calendar', '/tasks',
  '/documents', '/special-dates', '/savings', '/reports', '/jobs', '/history', '/trash', '/settings',
];

describe('Navigation structure (#367)', () => {
  it('every smoke test page is reachable from the menu structure', () => {
    const reachableHrefs = new Set(ALL_NAV_ITEMS.map((item) => item.href));
    for (const page of SMOKE_PAGES) {
      expect(reachableHrefs.has(page), `Page ${page} missing from navigation`).toBe(true);
    }
  });

  it('contains no duplicate hrefs across all nav items', () => {
    const hrefs = ALL_NAV_ITEMS.map((item) => item.href);
    const uniqueHrefs = new Set(hrefs);
    expect(hrefs.length).toBe(uniqueHrefs.size);
  });

  it('correctly matches active navigation paths without prefix collisions', () => {
    expect(navActive('/', '/')).toBe(true);
    expect(navActive('/expenses', '/')).toBe(false);
    expect(navActive('/shopping', '/shopping')).toBe(true);
    expect(navActive('/shopping/123', '/shopping')).toBe(true);
    expect(navActive('/shopping-list', '/shopping')).toBe(false);
    expect(navActive('/shopping', '/shopping-list')).toBe(false);
  });

  it('groups contain items ordered logically', () => {
    expect(NAV_GROUPS.map((g) => g.key)).toEqual([
      'nav.money',
      'nav.shopping',
      'nav.homeAndCar',
      'nav.planner',
    ]);
    expect(HOME_ITEM.href).toBe('/');
    expect(ACCOUNT_LINKS.map((l) => l.href)).toEqual([
      '/settings',
      '/jobs',
      '/history',
      '/trash',
    ]);
  });
});
