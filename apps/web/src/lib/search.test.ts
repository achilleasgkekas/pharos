import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchWeb, searchImages, isSearchHealthy } from './search';

// `search.ts` is the thin client for the self-hosted SearXNG metasearch. It powers
// "AI fill without a link" (searchWeb → product page → scrape) and finding product
// photos (searchImages). The functions have three invariants worth locking:
//  1. Mapping/coercion — SearXNG results are untyped JSON; the code coerces every
//     field with String(...) and defaults missing fields to '', so a malformed
//     result can never inject a non-string into the typed shape.
//  2. Filtering — searchWeb drops results with a non-string `url`; searchImages
//     drops anything whose `img_src` is not an http(s) string (data: URIs, relative
//     paths, non-strings all excluded), so callers never try to download a bad src.
//  3. Fail-closed — an HTTP error (non-ok → throw inside searxJson) or a rejected
//     fetch returns [] (searchWeb/searchImages) or false (isSearchHealthy), never
//     throws, so a down SearXNG degrades gracefully instead of crashing a page.
//
// The module is dependency-free (only global fetch + process.env), so we mock
// fetch and assert the mapping, the filter, the slice, and the fallbacks with no
// real I/O.

function mockFetch(impl: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(impl as unknown as typeof fetch);
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** A SearXNG JSON response with the given results array. */
function searxOk(results: Record<string, unknown>[]): Response {
  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** The URL object passed to fetch on call `i`. */
function urlOf(fn: ReturnType<typeof vi.fn>, i = 0): URL {
  return fn.mock.calls[i][0] as URL;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchWeb', () => {
  it('maps each result to {title, url, content}', async () => {
    mockFetch(() => searxOk([{ title: 'WD Blue SN570', url: 'https://skroutz.gr/x', content: '250GB NVMe' }]));
    const out = await searchWeb('wd blue');
    expect(out).toEqual([{ title: 'WD Blue SN570', url: 'https://skroutz.gr/x', content: '250GB NVMe' }]);
  });

  it('defaults a missing title/content to an empty string', async () => {
    mockFetch(() => searxOk([{ url: 'https://example.com' }]));
    expect(await searchWeb('q')).toEqual([{ title: '', url: 'https://example.com', content: '' }]);
  });

  it('coerces non-string fields with String(...)', async () => {
    mockFetch(() => searxOk([{ title: 42, url: 'https://example.com', content: true }]));
    expect(await searchWeb('q')).toEqual([{ title: '42', url: 'https://example.com', content: 'true' }]);
  });

  it('drops results whose url is not a string', async () => {
    mockFetch(() =>
      searxOk([
        { title: 'keep', url: 'https://a.com', content: '' },
        { title: 'drop-no-url', content: '' },
        { title: 'drop-number-url', url: 123, content: '' },
      ]),
    );
    const out = await searchWeb('q');
    expect(out.map((r) => r.title)).toEqual(['keep']);
  });

  it('slices to the default max of 6', async () => {
    mockFetch(() => searxOk(Array.from({ length: 10 }, (_, i) => ({ url: `https://x/${i}` }))));
    expect(await searchWeb('q')).toHaveLength(6);
  });

  it('honours a custom max', async () => {
    mockFetch(() => searxOk(Array.from({ length: 10 }, (_, i) => ({ url: `https://x/${i}` }))));
    expect(await searchWeb('q', 2)).toHaveLength(2);
  });

  it('returns [] when the response has no results array', async () => {
    mockFetch(() => new Response(JSON.stringify({}), { status: 200 }));
    expect(await searchWeb('q')).toEqual([]);
  });

  it('returns [] (never throws) on a non-ok HTTP status', async () => {
    mockFetch(() => new Response('err', { status: 502 }));
    await expect(searchWeb('q')).resolves.toEqual([]);
  });

  it('returns [] (never throws) when fetch rejects', async () => {
    mockFetch(() => {
      throw new Error('network down');
    });
    await expect(searchWeb('q')).resolves.toEqual([]);
  });

  it('requests /search with format=json and the query param', async () => {
    const fn = mockFetch(() => searxOk([]));
    await searchWeb('wd blue');
    const u = urlOf(fn);
    expect(u.pathname).toBe('/search');
    expect(u.searchParams.get('format')).toBe('json');
    expect(u.searchParams.get('q')).toBe('wd blue');
  });
});

describe('searchImages', () => {
  it('maps each result to {title, imgSrc, source}', async () => {
    mockFetch(() => searxOk([{ title: 'photo', img_src: 'https://cdn/x.jpg', url: 'https://page' }]));
    expect(await searchImages('q')).toEqual([
      { title: 'photo', imgSrc: 'https://cdn/x.jpg', source: 'https://page' },
    ]);
  });

  it('defaults a missing source (url) to an empty string', async () => {
    mockFetch(() => searxOk([{ img_src: 'https://cdn/x.jpg' }]));
    expect(await searchImages('q')).toEqual([{ title: '', imgSrc: 'https://cdn/x.jpg', source: '' }]);
  });

  it('keeps only http(s) img_src, dropping data:/relative/non-string', async () => {
    mockFetch(() =>
      searxOk([
        { title: 'https', img_src: 'https://cdn/a.jpg' },
        { title: 'http', img_src: 'http://cdn/b.jpg' },
        { title: 'data-uri', img_src: 'data:image/png;base64,AAAA' },
        { title: 'relative', img_src: '/local/c.jpg' },
        { title: 'protocol-relative', img_src: '//cdn/d.jpg' },
        { title: 'non-string', img_src: 12345 },
        { title: 'missing' },
      ]),
    );
    const out = await searchImages('q');
    expect(out.map((r) => r.title)).toEqual(['https', 'http']);
  });

  it('is case-insensitive on the http(s) scheme', async () => {
    mockFetch(() => searxOk([{ title: 'upper', img_src: 'HTTPS://cdn/x.jpg' }]));
    expect(await searchImages('q')).toHaveLength(1);
  });

  it('slices to the default max of 8', async () => {
    mockFetch(() => searxOk(Array.from({ length: 12 }, (_, i) => ({ img_src: `https://cdn/${i}.jpg` }))));
    expect(await searchImages('q')).toHaveLength(8);
  });

  it('honours a custom max', async () => {
    mockFetch(() => searxOk(Array.from({ length: 12 }, (_, i) => ({ img_src: `https://cdn/${i}.jpg` }))));
    expect(await searchImages('q', 3)).toHaveLength(3);
  });

  it('returns [] (never throws) when fetch rejects', async () => {
    mockFetch(() => {
      throw new Error('network down');
    });
    await expect(searchImages('q')).resolves.toEqual([]);
  });

  it('requests the images category with format=json', async () => {
    const fn = mockFetch(() => searxOk([]));
    await searchImages('rtx 5080');
    const u = urlOf(fn);
    expect(u.pathname).toBe('/search');
    expect(u.searchParams.get('format')).toBe('json');
    expect(u.searchParams.get('categories')).toBe('images');
    expect(u.searchParams.get('q')).toBe('rtx 5080');
  });
});

describe('isSearchHealthy', () => {
  it('returns true when /healthz responds ok', async () => {
    const fn = mockFetch(() => new Response('ok', { status: 200 }));
    expect(await isSearchHealthy()).toBe(true);
    expect(urlOf(fn).pathname).toBe('/healthz');
  });

  it('returns false when /healthz is not ok', async () => {
    mockFetch(() => new Response('down', { status: 503 }));
    expect(await isSearchHealthy()).toBe(false);
  });

  it('returns false (never throws) when fetch rejects', async () => {
    mockFetch(() => {
      throw new Error('connection refused');
    });
    await expect(isSearchHealthy()).resolves.toBe(false);
  });
});
