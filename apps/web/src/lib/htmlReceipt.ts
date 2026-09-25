/**
 * Strip an HTML email order-confirmation body down to readable plain text for the
 * TEXT model. Extracted from receipts/actions.ts (a 'use server' file, which can only
 * export async functions) so it is unit-testable — this logic is bug-prone and drives
 * store detection for email-body receipts.
 *
 * Two non-obvious quirks it deliberately preserves:
 *  - The store name is often ONLY in the logo's alt text (e.g. <img alt="Plaisio">) or
 *    the <title>, never in the visible body. Both are surfaced ([title] prefix +
 *    [logo: alt]) so the model doesn't hallucinate the store (the documented
 *    "Plaisio email parsed as Kotsovolos" fix).
 *  - Output is capped at 16000 chars to stay within the text model's context window.
 */
export function htmlReceiptToText(html: string): string {
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  return (title ? `[${title}]\n` : '')
    .concat(html)
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1\b[^>]*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|td|table)>/gi, '\n')
    .replace(/<img\b[^>]*\balt=["']([^"']+)["'][^>]*>/gi, ' [logo: $1] ')
    .replace(/<[^>]+>/g, ' ')
    // Decode entities in ONE pass: sequential replaces would turn `&amp;lt;` into `<`.
    .replace(/&(nbsp|amp|lt|gt|euro|#\d+|#x[0-9a-f]+);/gi, (_, e: string) => decodeEntity(e))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]*\n+/g, '\n')
    .trim()
    .slice(0, 16000); // keep within the text model's context
}

const NAMED: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', euro: '€' };

function decodeEntity(e: string): string {
  const lower = e.toLowerCase();
  if (lower in NAMED) return NAMED[lower];
  const code = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : Number(lower.slice(1));
  // An out-of-range code point would make fromCodePoint throw and lose the whole body.
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}
