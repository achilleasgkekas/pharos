/**
 * Pure helpers shared by the service worker and the options page.
 *
 * Everything here is deterministic and DOM-free on purpose, so `node --test`
 * can cover it without a browser (see shared.test.js). The extension itself
 * holds no secrets and never reads page content: it only turns "the URL I am
 * looking at" into "a Pharos /capture URL on the instance I configured", and
 * lets the browser open it. Auth stays where it already was, in the session
 * cookie of that same-origin Pharos tab (same contract as the bookmarklet,
 * see apps/web/src/lib/bookmarklet.ts).
 */

/** Popup window geometry, matched to the /capture layout. */
export const POPUP_SIZE = { width: 460, height: 680 };

/**
 * Turn whatever the user typed in the options page into a usable origin, or ''
 * when it cannot be one. Accepts a bare host ("pharos.example.com", "10.0.1.5:3000")
 * and assumes https, keeps an explicit http:// for LAN/self-signed setups, and
 * drops any path/query/hash because Pharos always serves /capture from the root.
 */
export function normalizeOrigin(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  let u;
  try {
    u = new URL(withScheme);
  } catch {
    return '';
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
  if (!u.hostname) return '';
  return u.origin;
}

/** The /capture URL for a page, on an already-normalized origin. */
export function captureUrl(origin, pageUrl) {
  return `${origin}/capture?url=${encodeURIComponent(String(pageUrl ?? ''))}`;
}

/**
 * Only real web pages are worth capturing. Browser-internal pages (chrome://,
 * about:, the extension gallery, file://) have nothing for the importer to read,
 * so the click is answered with a hint instead of an empty preview.
 */
export function isCapturable(url) {
  return /^https?:\/\/\S/i.test(String(url ?? '').trim());
}
