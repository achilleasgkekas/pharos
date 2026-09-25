import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The price scraper (services/scraper) is its own package and cannot import from the web app,
// so it carries a copy of lib/shoppingRegion.ts (#319). If the copies drift, the scraper's deal
// alerts and the web app's deal badge start disagreeing about which shops count. Edit the web
// copy, then copy the file across verbatim.
describe('shoppingRegion scraper copy', () => {
  it('is byte-for-byte the same as the web app file', () => {
    const web = readFileSync(resolve(__dirname, 'shoppingRegion.ts'), 'utf8');
    const scraper = readFileSync(resolve(__dirname, '../../../../services/scraper/src/shoppingRegion.ts'), 'utf8');
    expect(scraper).toBe(web);
  });
});
