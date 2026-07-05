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
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|td|table)>/gi, '\n')
    .replace(/<img\b[^>]*\balt=["']([^"']+)["'][^>]*>/gi, ' [logo: $1] ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&euro;/gi, '€')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]*\n+/g, '\n')
    .trim()
    .slice(0, 16000); // keep within the text model's context
}
