import { describe, expect, it } from 'vitest';
import { decodeEntities, extractPriceCurrency, extractPrimaryPrice, isBotChallenge, parsePriceNum } from './scrape';

// scrape.ts turns a fetched shop page into text the LLM can parse. These tests exercise
// the pure parsing helpers only (no network, no FlareSolverr, no SSRF fetch): the price
// normaliser, the price-markup extractor, the HTML-entity decoder, and the bot-challenge
// heuristic. The full `fetchPageText` path needs a live fetch and is out of scope here.

describe('parsePriceNum — locale-aware price → number', () => {
  it('parses EU "1.234,56" (dot thousands, comma decimal)', () => {
    expect(parsePriceNum('1.234,56')).toBe(1234.56);
  });

  it('parses "625,00" comma-decimal as a whole number', () => {
    expect(parsePriceNum('625,00')).toBe(625);
  });

  it('keeps a plain dot-decimal "576.10" intact', () => {
    expect(parsePriceNum('576.10')).toBe(576.1);
  });

  it('strips US thousands separators "1,234.56"', () => {
    expect(parsePriceNum('1,234.56')).toBe(1234.56);
  });

  it('handles multiple EU thousands groups "1.000.000,50"', () => {
    expect(parsePriceNum('1.000.000,50')).toBe(1000000.5);
  });

  it('reads the first number run out of surrounding text', () => {
    expect(parsePriceNum('Price: 49,99 €')).toBe(49.99);
    expect(parsePriceNum('  1.234,56 € incl. VAT')).toBe(1234.56);
  });

  it('treats a single-digit comma decimal "12,5" correctly', () => {
    expect(parsePriceNum('12,5')).toBe(12.5);
  });

  it('returns 0 for strings with no digits', () => {
    expect(parsePriceNum('abc')).toBe(0);
    expect(parsePriceNum('')).toBe(0);
    expect(parsePriceNum('€')).toBe(0);
  });
});

describe('decodeEntities — minimal entity decode + whitespace collapse', () => {
  it('decodes the entities it knows (&nbsp; &euro; &amp;)', () => {
    expect(decodeEntities('10&nbsp;&euro;')).toBe('10 €');
    expect(decodeEntities('Tom&amp;Jerry')).toBe('Tom&Jerry');
  });

  it('is case-insensitive on entity names', () => {
    expect(decodeEntities('a&NBSP;b')).toBe('a b');
    expect(decodeEntities('5&EURO;')).toBe('5€');
  });

  it('collapses runs of whitespace and trims', () => {
    expect(decodeEntities('  x   y  ')).toBe('x y');
    expect(decodeEntities('\n\t price \t')).toBe('price');
  });

  it('leaves unknown entities untouched', () => {
    expect(decodeEntities('&lt;tag&gt;')).toBe('&lt;tag&gt;');
  });
});

describe('extractPrimaryPrice — pick the main product price from markup', () => {
  it('returns "" when the page has no price markup', () => {
    expect(extractPrimaryPrice('<div>just some text</div>')).toBe('');
  });

  it('reads og:price:amount meta content', () => {
    expect(extractPrimaryPrice('<meta property="og:price:amount" content="299.00">')).toBe('299.00');
  });

  it('reads product:price:amount meta content', () => {
    expect(extractPrimaryPrice('<meta property="product:price:amount" content="129.90">')).toBe('129.90');
  });

  it('reads itemprop=price from a content attribute', () => {
    expect(extractPrimaryPrice('<span itemprop="price" content="49.90">€49,90</span>')).toBe('49.90');
  });

  it('reads itemprop=price from element text', () => {
    expect(extractPrimaryPrice('<span itemprop="price">19,99</span>')).toBe('19,99');
  });

  it('reads a price-classed element', () => {
    expect(extractPrimaryPrice('<div class="product-price">576.10</div>')).toBe('576.10');
  });

  it('skips crossed-out / old / cart prices and takes the live one', () => {
    const html = '<span class="old-price">999</span><span class="price">576</span>';
    expect(extractPrimaryPrice(html)).toBe('576');
  });

  it('prefers the gross when a VAT-excluded twin follows (×1.24)', () => {
    // Two adjacent price elements: net 100 then gross 124 → keep the gross.
    const html = '<div class="price">100</div><div class="price">124</div>';
    expect(extractPrimaryPrice(html)).toBe('124');
  });

  it('keeps the gross regardless of order (gross first)', () => {
    const html = '<div class="price">124</div><div class="price">100</div>';
    expect(extractPrimaryPrice(html)).toBe('124');
  });

  it('does not swap when the two prices are unrelated (no VAT ratio)', () => {
    const html = '<div class="price">100</div><div class="price">300</div>';
    expect(extractPrimaryPrice(html)).toBe('100');
  });
});

describe('isBotChallenge — Cloudflare / DataDome interstitial detection', () => {
  it('flags a small page carrying the challenge-platform script', () => {
    expect(isBotChallenge(403, '<script src="/cdn-cgi/challenge-platform/x"></script>', null)).toBe(true);
  });

  it('does NOT flag the challenge-platform script on a full-size page', () => {
    // The script also ships on normally-served Cloudflare pages; only tiny bodies are challenges.
    const bigPage = '<script src="/cdn-cgi/challenge-platform/x"></script>' + 'a'.repeat(20001);
    expect(isBotChallenge(200, bigPage, null)).toBe(false);
  });

  it('flags the "Just a moment" interstitial title', () => {
    expect(isBotChallenge(200, '<title>Just a moment...</title>', null)).toBe(true);
  });

  it('flags the "Enable JavaScript and cookies" wording', () => {
    expect(isBotChallenge(200, 'Please Enable JavaScript and cookies to continue', null)).toBe(true);
  });

  it('flags DataDome/PerimeterX markers only on an error status', () => {
    expect(isBotChallenge(403, '<div id="datadome"></div>', null)).toBe(true);
    expect(isBotChallenge(200, '<div id="datadome"></div>', null)).toBe(false);
  });

  it('flags a 403/503 from a small Cloudflare-served body', () => {
    expect(isBotChallenge(403, 'blocked', 'cloudflare')).toBe(true);
    expect(isBotChallenge(503, 'blocked', 'cloudflare')).toBe(true);
  });

  it('does not flag a 200 from Cloudflare (status must be 403/503)', () => {
    expect(isBotChallenge(200, 'ok', 'cloudflare')).toBe(false);
  });

  it('does not flag a plain product page', () => {
    expect(isBotChallenge(200, '<html><body><h1>RTX 5080</h1><span class="price">1443</span></body></html>', 'nginx')).toBe(
      false
    );
  });
});

describe('extractPriceCurrency — the code the page itself declares (P9)', () => {
  it('reads priceCurrency out of schema.org JSON-LD offers', () => {
    const html = `<script type="application/ld+json">{"@type":"Product","offers":{"price":"1299.00","priceCurrency":"USD"}}</script>`;
    expect(extractPriceCurrency(html)).toBe('USD');
  });

  it('reads an og:price:currency meta tag', () => {
    expect(extractPriceCurrency('<meta property="og:price:currency" content="GBP">')).toBe('GBP');
  });

  it('reads a product:price:currency meta tag', () => {
    expect(extractPriceCurrency('<meta property="product:price:currency" content="chf">')).toBe('CHF');
  });

  it('reads an itemprop="priceCurrency" content attribute', () => {
    expect(extractPriceCurrency('<meta itemprop="priceCurrency" content="AUD">')).toBe('AUD');
  });

  it('reads an itemprop="priceCurrency" element body', () => {
    expect(extractPriceCurrency('<span itemprop="priceCurrency">CAD</span>')).toBe('CAD');
  });

  it('prefers JSON-LD over a meta tag when both are present', () => {
    const html =
      '<meta property="og:price:currency" content="EUR">' +
      '<script type="application/ld+json">{"offers":{"priceCurrency":"USD"}}</script>';
    expect(extractPriceCurrency(html)).toBe('USD');
  });

  it('returns "" for a page that declares no currency (read as base currency)', () => {
    expect(extractPriceCurrency('<span class="price">1.443,72 €</span>')).toBe('');
  });

  it('never guesses from a bare symbol — "$" alone stays unknown', () => {
    // "$" is USD on one shop and CAD/AUD on another; P9 does not invent currency data.
    expect(extractPriceCurrency('<span class="price">$1,299.00</span>')).toBe('');
  });

  it('ignores a junk / wrong-length code', () => {
    expect(extractPriceCurrency('<meta property="og:price:currency" content="EURO">')).toBe('');
    expect(extractPriceCurrency('<meta property="og:price:currency" content="">')).toBe('');
  });
});
