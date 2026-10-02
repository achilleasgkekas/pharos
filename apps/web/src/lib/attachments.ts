// Files and links on a record: the client-safe half (kinds and link validation).

export const ATTACHMENT_KINDS = ['item', 'document', 'bill', 'subscription', 'task'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/** An http(s) URL, trimmed, or '' for anything else (javascript:, data:, a bare word). */
export function cleanAttachmentUrl(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s || s.length > 2000) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    if (!u.hostname.includes('.')) return '';
    return u.toString();
  } catch {
    return '';
  }
}
