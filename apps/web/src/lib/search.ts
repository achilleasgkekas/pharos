// Thin client for the self-hosted SearXNG metasearch. Powers "AI fill without a
// link" (web search → product page → scrape) and finding product photos (image
// search). Local + private; no API key.

const SEARXNG_URL = process.env.SEARXNG_URL ?? 'http://localhost:8888';

export type WebResult = { title: string; url: string; content: string };
export type ImageResult = { title: string; imgSrc: string; source: string };

async function searxJson(params: Record<string, string>): Promise<{ results?: Record<string, unknown>[] }> {
  const u = new URL('/search', SEARXNG_URL);
  u.searchParams.set('format', 'json');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u, {
    headers: { Accept: 'application/json', 'User-Agent': 'homepage/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`SearXNG HTTP ${res.status}`);
  return res.json();
}

/** General web search → top results (title, url, snippet). `language` (e.g. 'el-GR') asks
 *  SearXNG for results in that language/region (#319); omitted = SearXNG's own default. */
export async function searchWeb(query: string, max = 6, opts: { language?: string } = {}): Promise<WebResult[]> {
  try {
    const data = await searxJson(opts.language ? { q: query, language: opts.language } : { q: query });
    return (data.results ?? [])
      .filter((r) => typeof r.url === 'string')
      .slice(0, max)
      .map((r) => ({
        title: String(r.title ?? ''),
        url: String(r.url),
        content: String(r.content ?? ''),
      }));
  } catch {
    return [];
  }
}

/** Image search → direct image URLs for a product. */
export async function searchImages(query: string, max = 8): Promise<ImageResult[]> {
  try {
    const data = await searxJson({ q: query, categories: 'images' });
    return (data.results ?? [])
      .filter((r) => typeof r.img_src === 'string' && /^https?:\/\//i.test(r.img_src as string))
      .slice(0, max)
      .map((r) => ({
        title: String(r.title ?? ''),
        imgSrc: String(r.img_src),
        source: String(r.url ?? ''),
      }));
  } catch {
    return [];
  }
}

/** Is SearXNG reachable? (for a settings/status indicator) */
export async function isSearchHealthy(): Promise<boolean> {
  try {
    const res = await fetch(new URL('/healthz', SEARXNG_URL), { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
