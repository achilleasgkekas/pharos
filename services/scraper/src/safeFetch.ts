import { Agent } from 'undici';
import { assertPublicUrl, publicLookup } from './ssrf';

const dispatcher = new Agent({ connect: { lookup: publicLookup } });

/**
 * `fetch` for a URL a user, a web page or an AI handed us, with the SSRF guard applied to EVERY
 * hop. Checking only the first URL and then letting fetch follow redirects is not a guard: a
 * public page can answer `302 Location: http://169.254.169.254/` (cloud metadata) or
 * `http://mongo:27017/` and the redirect would be fetched unchecked. Here redirects are followed
 * by hand, and each target goes through `assertPublicUrl` before it is requested.
 *
 * Same redirect semantics as fetch's `follow`: 303, and 301/302 after a POST, continue as a GET
 * without a body; anything else repeats the original request.
 *
 * services/scraper/src/safeFetch.ts is a byte-for-byte copy (scraperCopies.parity.test.ts).
 */
export async function safeFetch(url: string, init: RequestInit = {}, maxRedirects = 5): Promise<Response> {
  let current = url;
  let req: RequestInit = { ...init, redirect: 'manual' };
  for (let hop = 0; ; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, { ...req, dispatcher } as RequestInit);
    const location = res.status >= 300 && res.status < 400 ? res.headers?.get?.('location') : null;
    if (!location) return res;
    await res.body?.cancel();
    if (hop >= maxRedirects) throw new Error('Too many redirects');
    const next = new URL(location, current);
    if (next.origin !== new URL(current).origin) {
      // Never forward credentials to a different origin through a redirect.
      const headers = new Headers(req.headers);
      for (const name of ['authorization', 'cookie', 'proxy-authorization']) headers.delete(name);
      req = { ...req, headers };
    }
    current = next.toString();
    const method = (req.method || 'GET').toUpperCase();
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
      req = { ...req, method: 'GET', body: undefined };
    }
  }
}
