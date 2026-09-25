import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The price scraper (services/scraper) is its own package and cannot import from the web app,
// so it carries copies of a few lib files. If the copies drift, the scraper silently runs older
// logic: shoppingRegion (#319) made its deal alerts disagree with the web app's deal badge, and
// ssrf.ts had fallen behind the IPv4-mapped IPv6 fix (#331), so a stored item URL pointing at
// `[::ffff:7f00:1]` passed the scraper's guard. Edit the web copy, then copy the file across
// verbatim.
const SHARED = ['shoppingRegion.ts', 'ssrf.ts', 'safeFetch.ts'];

describe('scraper copies of web lib files', () => {
  for (const file of SHARED) {
    it(`${file} is byte-for-byte the same as the web app file`, () => {
      const web = readFileSync(resolve(__dirname, file), 'utf8');
      const scraper = readFileSync(resolve(__dirname, '../../../../services/scraper/src', file), 'utf8');
      expect(scraper).toBe(web);
    });
  }
});
