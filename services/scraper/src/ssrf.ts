import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

// SSRF guard — standalone copy of the web app's lib/ssrf.ts (kept in sync).
// Rejects fetches of stored item URLs that resolve to private/internal targets.

function ip4IsPrivate(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function ip6IsPrivate(ip: string): boolean {
  const v = ip.toLowerCase().split('%')[0];
  if (v === '::1' || v === '::') return true;
  if (v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true;
  if (v.startsWith('fc') || v.startsWith('fd')) return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ip4IsPrivate(mapped[1]);
  return false;
}

function addrIsPrivate(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return ip4IsPrivate(ip);
  if (fam === 6) return ip6IsPrivate(ip);
  return true;
}

export async function assertPublicUrl(url: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http(s) URLs are allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === 'host.docker.internal') {
    throw new Error('Internal host not allowed');
  }
  if (isIP(host)) {
    if (addrIsPrivate(host)) throw new Error('Private address not allowed');
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error('Host did not resolve');
  }
  if (!addrs.length || addrs.some((a) => addrIsPrivate(a.address))) {
    throw new Error('Host resolves to a private address');
  }
}

/**
 * `fetch` with the guard applied to every redirect hop (same as the web app's lib/safeFetch.ts).
 * Letting fetch follow redirects after checking only the first URL would let a public page
 * bounce the scraper to an internal address.
 */
export async function safeFetch(url: string, init: RequestInit = {}, maxRedirects = 5): Promise<Response> {
  let current = url;
  let req: RequestInit = { ...init, redirect: 'manual' };
  for (let hop = 0; ; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, req);
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) return res;
    if (hop >= maxRedirects) throw new Error('Too many redirects');
    current = new URL(location, current).toString();
    const method = (req.method || 'GET').toUpperCase();
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
      req = { ...req, method: 'GET', body: undefined };
    }
  }
}
