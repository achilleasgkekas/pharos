/**
 * Fetch a product page and reduce it to text the LLM can parse.
 * Prefers schema.org JSON-LD Product data (accurate), falls back to stripped HTML.
 */

import { assertPublicUrl } from '@/lib/ssrf';
import { safeFetch } from '@/lib/safeFetch';

export type ScrapedPage = {
  url: string;
  title: string;
  jsonLd: string; // any Product JSON-LD found, stringified
  text: string; // cleaned visible text (cropped)
  /** ISO 4217 code read from the page's own price markup; '' when it declares none (P9). */
  currency: string;
};

/** Cloudflare / DataDome / PerimeterX interstitials look nothing like a product
 *  page. Detect them so we fail with a clear message instead of handing the LLM a
 *  challenge page (which yields a garbage "product"). */
const CHALLENGE_PLATFORM = /\/cdn-cgi\/challenge-platform\//i;
export function isBotChallenge(status: number, html: string, server: string | null): boolean {
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
// docker-compose wires this to http://flaresolverr:8191; a native dev server should
// use http://localhost:8191. Unset → no solver, challenged pages fail with a note.
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

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&euro;/gi, '€')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Greek "1.234,56" / "576.10" / "625,00" → number. */
export function parsePriceNum(s: string): number {
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
export function extractPrimaryPrice(html: string): string {
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

/** The ISO 4217 code the page DECLARES its price in, read from structured markup only
 *  (schema.org priceCurrency, og:/product: price meta, itemprop). Deliberately no symbol
 *  sniffing: "$" is USD on one shop and CAD/AUD on another, and P9's rule is to never
 *  invent currency information — a page that declares nothing returns '' and is then
 *  treated as the deployment's base currency, exactly as before. */
export function extractPriceCurrency(html: string): string {
  const iso = (raw: string | undefined): string => {
    const c = (raw || '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(c) ? c : '';
  };
  // JSON-LD offers (and any other embedded schema.org JSON) — the most reliable signal.
  const ld = html.match(/"priceCurrency"\s*:\s*"([A-Za-z]{3})"/i);
  if (iso(ld?.[1])) return iso(ld?.[1]);
  const meta = html.match(
    /<meta[^>]+(?:property|name)=["'](?:og:price:currency|product:price:currency)["'][^>]*content=["']([^"']+)["']/i
  );
  if (iso(meta?.[1])) return iso(meta?.[1]);
  const ip = html.match(/itemprop=["']priceCurrency["'][^>]*content=["']([^"']+)["']/i);
  if (iso(ip?.[1])) return iso(ip?.[1]);
  const ipText = html.match(/itemprop=["']priceCurrency["'][^>]*>\s*([A-Za-z]{3})\s*</i);
  return iso(ipText?.[1]);
}

export async function fetchPageText(url: string): Promise<ScrapedPage> {
  // SSRF guard: reject non-http(s) and any private/loopback/internal target
  // (also covers the FlareSolverr retry path below, which fetches the same URL).
  await assertPublicUrl(url);

  const res = await safeFetch(url, {
    headers: {
      // Some shops block default fetch agents
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

  // <title>
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? '';

  // schema.org JSON-LD Product blocks
  const jsonLdBlocks: string[] = [];
  const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = ldRe.exec(html)) !== null) {
    const raw = m[1].trim();
    if (/"@type"\s*:\s*"?Product/i.test(raw) || /"offers"/i.test(raw)) {
      jsonLdBlocks.push(raw);
    }
  }

  // Cleaned visible text
  const cleaned = html
    .replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\b[^>]*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    // One pass, so a decoded '&' can never start a second entity (`&amp;nbsp;` stays literal).
    .replace(/&(nbsp|amp|euro);/g, (_, e: string) => (e === 'nbsp' ? ' ' : e === 'amp' ? '&' : '€'))
    .replace(/\s+/g, ' ')
    .trim();

  // For shops WITHOUT JSON-LD (xpatit, pc1.gr) the real price lives in price markup but is
  // often buried past the 6000-char crop behind a nav menu or related-product prices, so the
  // model can't pick it from text. Lead with that markup price. JSON-LD shops are left to
  // their structured data (handled by the prompt) so we never override a good offers price.
  const primaryPrice = jsonLdBlocks.length ? '' : extractPrimaryPrice(html);
  const hintLine = primaryPrice ? `PRODUCT PRICE (from the page's price markup): ${primaryPrice}\n\n` : '';

  // When the sent window holds no price at all, focus it on the real price (pc1.gr) rather
  // than shipping 6000 chars of category menu that drowns the model.
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

  return {
    url,
    title,
    jsonLd: jsonLdBlocks.join('\n').slice(0, 4000),
    text: hintLine + body,
    currency: extractPriceCurrency(html),
  };
}
