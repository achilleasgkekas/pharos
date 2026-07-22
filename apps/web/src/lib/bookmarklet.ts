/**
 * "Add to Pharos" bookmarklet — a `javascript:` URI the user drags to their
 * bookmarks bar. Clicking it while browsing an e-shop opens a same-origin popup
 * on `/capture?url=<current page>`, so it rides the browser's existing Pharos
 * session cookie (no CORS, no API token embedded in the bookmarklet code).
 */
export function buildBookmarklet(origin: string): string {
  const base = origin.replace(/\/+$/, '');
  const js =
    "(function(){var u=encodeURIComponent(location.href);" +
    `window.open('${base}/capture?url='+u,'pharosCapture','width=440,height=640,noopener,noreferrer');` +
    '})();';
  return `javascript:${js}`;
}
