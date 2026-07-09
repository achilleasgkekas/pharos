import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

/**
 * SSRF guard for server-side fetches of user/AI/scraped-supplied URLs.
 *
 * The app pulls in arbitrary URLs (URL-import, product photos, the 6-hourly
 * price scraper). Without a guard, those server-side requests can reach the
 * Docker-internal services (mongo, searxng, flaresolverr), the host's Ollama,
 * cloud metadata endpoints, or anything else on the LAN. assertPublicUrl()
 * resolves the host and rejects any private / loopback / link-local target,
 * which also defeats DNS-rebinding (we check the resolved IPs, not the name).
 */

function ip4IsPrivate(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true; // this-net, private, loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
  if (a >= 224) return true; // multicast + reserved
  return false;
}

/** Expand an IPv6 literal into its 8 16-bit groups (handles `::` and a trailing dotted IPv4). */
function expandIp6(v: string): number[] | null {
  let s = v;
  const dotted = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const p = dotted[2].split('.').map(Number);
    if (p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    s = dotted[1] + (((p[0] << 8) | p[1]).toString(16) + ':' + (((p[2] << 8) | p[3]).toString(16)));
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (halves.length === 2 ? fill < 1 : head.length !== 8) return null;
  const groups = [...head, ...Array(fill).fill('0'), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

function ip6IsPrivate(ip: string): boolean {
  const v = ip.toLowerCase().split('%')[0]; // strip zone id
  const g = expandIp6(v);
  if (!g) return true; // unparseable → reject
  if (g.every((n) => n === 0)) return true; // :: unspecified
  if (g.slice(0, 7).every((n) => n === 0) && g[7] === 1) return true; // ::1 loopback
  if ((g[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if (g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff) {
    // IPv4-mapped ::ffff:0:0/96 — WHATWG URL compresses the dotted form to hex
    // (::ffff:127.0.0.1 → ::ffff:7f00:1), so decode the low 32 bits and reuse ip4IsPrivate.
    return ip4IsPrivate(`${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`);
  }
  return false;
}

function addrIsPrivate(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return ip4IsPrivate(ip);
  if (fam === 6) return ip6IsPrivate(ip);
  return true; // not an IP we can reason about → reject
}

/**
 * Throw if `url` is not a public http(s) URL. Resolves the hostname and checks
 * every returned address, so `attacker.com` pointing at 127.0.0.1 is rejected.
 */
export async function assertPublicUrl(url: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed');
  }
  const host = u.hostname.replace(/^\[|\]$/g, ''); // unwrap [ipv6]
  // Reject bare internal names (docker service names, localhost) outright.
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
