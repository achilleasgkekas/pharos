// Fetch a product page and reduce it to text + JSON-LD for the LLM.
// Standalone copy of the web app's lib/scrape.ts (kept in sync intentionally).

import { assertPublicUrl, safeFetch } from './ssrf';

export type ScrapedPage = {
  url: string;
  title: string;
  jsonLd: string;
  text: string;
};

/** Cloudflare / DataDome / PerimeterX interstitials look nothing like a product
 *  page. Detect them so we fail with a clear message instead of feeding the LLM a
 *  challenge page (which yields a garbage price). */
const CHALLENGE_PLATFORM = /\/cdn-cgi\/challenge-platform\//i;
function isBotChallenge(status: number, html: string, server: string | null): boolean {
  // The cdn-cgi/challenge-platform script also ships on normally-served Cloudflare pages,
  // so it only signals a challenge when the body is tiny (the interstitial is ~6KB).
  if (CHALLENGE_PLATFORM.test(html) && html.length < 20000) return true;
  if (/Enable JavaScript and cookies to continue/i.test(html)) return true;
  if (/<title[^>]*>\s*Just a moment/i.test(html)) return true;
  if (/datadome|px-captcha|perimeterx|distil_r_captcha/i.test(html) && status >= 400) return true;
  if ((status === 403 || status === 503) && /cloudflare/i.test(server || '') && html.length < 20000) return true;
  return false;
}
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Optional FlareSolverr endpoint (a headless-Chromium proxy that solves Cloudflare
// JS challenges). When set, pages that trip a bot-challenge are retried through it.
// docker-compose wires this to http://flaresolverr:8191. Unset → no solver.
const SOLVER_URL = (process.env.SOLVER_URL ?? '').replace(/\/+$/, '');

/** Fetch a URL through FlareSolverr, returning the solved HTML + final status. */
async function fetchViaSolver(url: string): Promise<{ html: string; status: number }> {
  const res = await fetch(`${SOLVER_URL}/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cmd: 'request.get', url, maxTimeout: 60000 }),
    signal: AbortSignal.timeout(75000),
  });
  if (!res.ok) throw new Error(`solver HTTP ${res.status}`);
  const data = (await res.json()) as {
    status?: string;
    message?: string;
    solution?: { response?: string; status?: number };
  };
  if (data.status !== 'ok' || !data.solution) throw new Error(data.message || 'solver could not fetch the page');
  return { html: data.solution.response ?? '', status: data.solution.status ?? 200 };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&euro;/gi, '€')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Greek "1.234,56" / "576.10" / "625,00" → number. */
function parsePriceNum(s: string): number {
  let t = (s.match(/\d[\d.,]*/) || [''])[0];
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); // EU decimal comma
  else t = t.replace(/,/g, ''); // thousands separators only
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}

/** The product's own listed price, read from price markup. Big shop pages (pc1.gr,
 *  xpatit) put the MAIN price in an itemprop/og/`*price*` element but bury it past the
 *  visible-text crop, behind related-product prices — so the LLM can't reliably pick it
 *  from text. Take the first such element (the main product); if a VAT-excluded twin
 *  follows (×1.06/1.13/1.24) keep the gross. Returns '' when there is no price markup. */
function extractPrimaryPrice(html: string): string {
  const cands: { v: number; t: string }[] = [];
  const push = (raw: string) => {
    const t = decodeEntities(raw);
    if (!t || t.length > 40 || !/\d/.test(t)) return;
    const v = parsePriceNum(t);
    if (v > 0) cands.push({ v, t });
  };
  let m: RegExpExecArray | null;
  const metaRe = /<meta[^>]+(?:property|name)=["'](?:og:price:amount|product:price:amount)["'][^>]*content=["']([^"']+)["']/gi;
  while ((m = metaRe.exec(html))) push(m[1]);
  const ipAttr = /itemprop=["']price["'][^>]*content=["']([^"']+)["']/gi;
  while ((m = ipAttr.exec(html))) push(m[1]);
  const ipText = /itemprop=["']price["'][^>]*>([^<]{1,40})</gi;
  while ((m = ipText.exec(html))) push(m[1]);
  // first element whose class/id mentions "price" (skip crossed-out / cart / totals)
  const clsRe = /(?:class|id)=["']([^"']*price[^"']*)["'][^>]*>([\s\S]{0,50}?)</gi;
  while ((m = clsRe.exec(html))) {
    if (/old|strike|was|list|regular|through|compare|cart|basket|total/i.test(m[1])) continue;
    if (/\d/.test(m[2])) push(m[2]);
  }
  if (!cands.length) return '';
  let primary = cands[0];
  if (cands[1]) {
    const a = primary.v, b = cands[1].v;
    const ratio = Math.max(a, b) / Math.min(a, b);
    if ([1.06, 1.13, 1.24].some((r) => Math.abs(ratio - r) < 0.01)) primary = a >= b ? primary : cands[1];
  }
  return primary.t;
}

export async function fetchPageText(url: string): Promise<ScrapedPage> {
  await assertPublicUrl(url); // SSRF guard (scheme + private/internal target)

  const res = await safeFetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15000),
  });
  let html = await res.text();
  let status = res.status;
  let solved = false;

  // Bot-protected shop (e.g. Skroutz behind Cloudflare). Retry through the headless
  // solver if one is configured, otherwise fail with a clear, actionable message.
  if (isBotChallenge(status, html, res.headers.get('server'))) {
    if (!SOLVER_URL) {
      throw new Error(
        `${hostOf(url)} is behind bot-protection (Cloudflare challenge) — a plain fetch can't run ` +
          `its JavaScript. Set SOLVER_URL to a FlareSolverr instance to fetch it, or add the price manually.`
      );
    }
    try {
      ({ html, status } = await fetchViaSolver(url));
      solved = true;
    } catch (e) {
      throw new Error(`${hostOf(url)} is behind a Cloudflare challenge and the solver failed: ${(e as Error).message}`);
    }
    if (isBotChallenge(status, html, null)) {
      throw new Error(`${hostOf(url)} served a challenge the solver could not pass (interactive CAPTCHA / Turnstile).`);
    }
  }
  if (status >= 400 && !solved) throw new Error(`HTTP ${status} from ${hostOf(url)}`);
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? '';

  const jsonLdBlocks: string[] = [];
  const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = ldRe.exec(html)) !== null) {
    const raw = m[1].trim();
    if (/"@type"\s*:\s*"?Product/i.test(raw) || /"offers"/i.test(raw)) jsonLdBlocks.push(raw);
  }

  const cleaned = html
    .replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\b[^>]*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    // One pass, so a decoded '&' can never start a second entity (`&amp;nbsp;` stays literal).
    .replace(/&(nbsp|amp|euro);/g, (_, e: string) => (e === 'nbsp' ? ' ' : e === 'amp' ? '&' : '€'))
    .replace(/\s+/g, ' ')
    .trim();

  // For shops WITHOUT JSON-LD (xpatit, pc1.gr) the real price is in markup but often buried
  // past the crop behind a nav menu or related-product prices — lead with that markup price.
  // JSON-LD shops keep their structured data so we never override a good offers price.
  const primaryPrice = jsonLdBlocks.length ? '' : extractPrimaryPrice(html);
  const hintLine = primaryPrice ? `PRODUCT PRICE (from the page's price markup): ${primaryPrice}\n\n` : '';

  // When the sent window holds no price, focus it on the real price (pc1.gr) not the nav menu.
  const PRICE_RE = /(?:€|EUR)\s*\d|\d[\d.,]*\s*(?:€|EUR)/;
  const sent = cleaned.slice(0, 6000);
  let body = sent;
  if (!PRICE_RE.test(sent)) {
    const m = cleaned.match(PRICE_RE);
    if (m) {
      const i = cleaned.indexOf(m[0]);
      body = cleaned.slice(Math.max(0, i - 600), i + 600);
    }
  }

  return { url, title, jsonLd: jsonLdBlocks.join('\n').slice(0, 4000), text: hintLine + body };
}

/** Map a URL host to a friendly store name for the priceHistory entry. */
export function storeFromUrl(url: string): string {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return 'unknown';
  }
  const map: Record<string, string> = {
    'skroutz.gr': 'Skroutz',
    'skroutz.eu': 'Skroutz',
    'xpatit.gr': 'xpatit.gr',
    'e-shop.gr': 'e-shop.gr',
    'i-system.gr': 'i-system.gr',
    'plaisio.gr': 'Πλαίσιο',
    'public.gr': 'Public',
    'kotsovolos.gr': 'Κωτσόβολος',
    'you.gr': 'you.gr',
    'amazon.de': 'Amazon.de',
    'amazon.com': 'Amazon',
    'aliexpress.com': 'AliExpress',
    'fs.com': 'FS.com',
    'eu.store.ui.com': 'EU Store (Ubiquiti)',
    'store.ui.com': 'Ubiquiti Store',
  };
  if (map[host]) return map[host];
  // amazon.* and other subdomains
  for (const key of Object.keys(map)) if (host.endsWith(key)) return map[key];
  return host;
}
