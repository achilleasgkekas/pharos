import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractPrimaryPrice, fetchPageText, isBotChallenge, parsePriceNum, storeFromUrl } from './scrape';

// The scraper's page reader runs unattended every 6 hours, so a regression here shows up as
// wrong prices in priceHistory (or a false deal alert), not as an error anyone sees. These tests
// pin the parsing helpers and the fetch path with `fetch` stubbed: no network, no DNS (the URLs
// use a literal public IP so the SSRF guard needs no lookup).

const PUBLIC = 'http://93.184.216.34';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(...responses: Response[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('parsePriceNum', () => {
  it('reads EU and US number formats', () => {
    expect(parsePriceNum('1.234,56 €')).toBe(1234.56);
    expect(parsePriceNum('625,00')).toBe(625);
    expect(parsePriceNum('576.10')).toBe(576.1);
    expect(parsePriceNum('$1,234.56')).toBe(1234.56);
  });

  it('returns 0 when there is no number', () => {
    expect(parsePriceNum('call us')).toBe(0);
  });
});

describe('extractPrimaryPrice', () => {
  it('returns "" when the page has no price markup', () => {
    expect(extractPrimaryPrice('<p>hello</p>')).toBe('');
  });

  it('reads og:price:amount and itemprop=price', () => {
    expect(extractPrimaryPrice('<meta property="og:price:amount" content="199.90">')).toBe('199.90');
    expect(extractPrimaryPrice('<span itemprop="price">89,00 €</span>')).toBe('89,00 €');
  });

  it('skips old / cart prices', () => {
    const html = '<span class="old-price">120 €</span><span class="price">99 €</span><span class="cart-total">5 €</span>';
    expect(extractPrimaryPrice(html)).toBe('99 €');
  });

  it('keeps the VAT-included figure when an ex-VAT twin sits next to it', () => {
    expect(extractPrimaryPrice('<span class="price">100,00 €</span><span class="price">124,00 €</span>')).toBe('124,00 €');
  });
});

describe('isBotChallenge', () => {
  it('flags the Cloudflare interstitial', () => {
    expect(isBotChallenge(403, '<title>Just a moment...</title>', 'cloudflare')).toBe(true);
    expect(isBotChallenge(200, '<script src="/cdn-cgi/challenge-platform/x.js"></script>', null)).toBe(true);
  });

  it('does not flag a normal product page served by Cloudflare', () => {
    const page = '<title>RTX 5080</title>' + 'x'.repeat(30000) + '/cdn-cgi/challenge-platform/';
    expect(isBotChallenge(200, page, 'cloudflare')).toBe(false);
  });
});

describe('storeFromUrl', () => {
  it('maps known shops, including subdomains', () => {
    expect(storeFromUrl('https://www.skroutz.gr/s/123')).toBe('Skroutz');
    expect(storeFromUrl('https://smile.amazon.de/dp/X')).toBe('Amazon.de');
  });

  it('matches a known shop only on a domain boundary', () => {
    expect(storeFromUrl('https://www.example-shop.gr/p/1')).toBe('example-shop.gr');
    expect(storeFromUrl('https://notfs.com/p/1')).toBe('notfs.com');
  });

  it('falls back to the bare host, or "unknown" for a non-URL', () => {
    expect(storeFromUrl('https://www.shop.example/p/1')).toBe('shop.example');
    expect(storeFromUrl('not a url')).toBe('unknown');
  });
});

describe('fetchPageText', () => {
  it('keeps Product JSON-LD and the page title, and strips scripts from the text', async () => {
    stubFetch(
      new Response(
        '<html><title>Widget</title><script type="application/ld+json">{"@type":"Product","offers":{"price":"19.99"}}</script>' +
          '<script>var tracking = 1;</script><body>Widget 19,99 €</body></html>'
      )
    );
    const page = await fetchPageText(`${PUBLIC}/widget`);
    expect(page.title).toBe('Widget');
    expect(page.jsonLd).toContain('"price":"19.99"');
    expect(page.text).toContain('Widget 19,99 €');
    expect(page.text).not.toContain('tracking');
  });

  it('leads with the markup price when the page has no JSON-LD', async () => {
    stubFetch(new Response('<title>X</title><nav>menu</nav><span itemprop="price">42,50 €</span>'));
    const page = await fetchPageText(`${PUBLIC}/x`);
    expect(page.text.startsWith("PRODUCT PRICE (from the page's price markup): 42,50 €")).toBe(true);
  });

  it('fails with a clear message on a bot challenge when no solver is configured', async () => {
    stubFetch(new Response('<title>Just a moment...</title>', { status: 403, headers: { server: 'cloudflare' } }));
    await expect(fetchPageText(`${PUBLIC}/blocked`)).rejects.toThrow(/bot-protection/);
  });

  it('reports an HTTP error status', async () => {
    stubFetch(new Response('gone', { status: 404 }));
    await expect(fetchPageText(`${PUBLIC}/gone`)).rejects.toThrow('HTTP 404');
  });

  it('refuses a redirect to an internal address before fetching it', async () => {
    const fetchFn = stubFetch(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }));
    await expect(fetchPageText(`${PUBLIC}/r`)).rejects.toThrow();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('refuses an IPv4-mapped IPv6 loopback item URL without fetching it', async () => {
    const fetchFn = stubFetch();
    await expect(fetchPageText('http://[::ffff:127.0.0.1]/')).rejects.toThrow();
    await expect(fetchPageText('http://[::ffff:7f00:1]/')).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
