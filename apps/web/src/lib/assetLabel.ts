// P56 — printable QR asset tags for physical inventory items.
//
// The tag bridges the physical object and its record: stick it on the box / rack unit,
// scan it with a phone, land straight on that item's detail. Pure string builders only —
// the QR image itself is rendered client-side by `qrcode` (same lazy import as the MFA
// QrCode component) and handed in here as a data URL, so this module stays DB-free,
// browser-free and testable, exactly like the insurance/tax export builders.

export type AssetLabel = {
  title: string;
  /** Second line: serial / location / category. May be empty. */
  subtitle: string;
  /** Already-rendered QR bitmap (`data:image/png;base64,...`). */
  qrDataUrl: string;
};

/** Longest strings a 45mm tag can still print legibly. Overflow is trimmed, not rejected:
 *  a tag with a shortened title is useful, a missing tag is not. */
const MAX_TITLE = 44;
const MAX_SUBTITLE = 54;

function clip(s: string, max: number): string {
  const v = s.trim().replace(/\s+/g, ' ');
  return v.length <= max ? v : `${v.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The URL the QR encodes. Built from the origin the app is actually being served from
 * rather than a configured host, so a self-hosted deployment on `http://192.168.1.10:3000`
 * prints tags that work on that LAN and nothing has to be set up first.
 *
 * The target is the ordinary `?open=` deep link every module already honours, so a scan by
 * someone without a session lands on the normal login redirect — the tag exposes nothing.
 */
export function assetLabelUrl(origin: string, itemId: string): string {
  const id = itemId.trim();
  if (!id) return '';
  return `${origin.trim().replace(/\/+$/, '')}/items?open=${encodeURIComponent(id)}`;
}

/** The one identifying line under the title. Serial first: on a shelf of identical boxes
 *  that is the field that actually tells two units apart. */
export function assetLabelSubtitle(item: { serialNumber?: string; location?: string; category?: string }): string {
  const parts = [
    item.serialNumber?.trim() ? `S/N ${item.serialNumber.trim()}` : '',
    item.location?.trim() ?? '',
    item.category?.trim() ?? '',
  ].filter(Boolean);
  return clip(parts.join(' · '), MAX_SUBTITLE);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Self-contained printable sheet — inline styles, no external assets, so it prints the same
 * from an iframe, a saved file or a phone. Sized in mm because the output is a physical
 * sticker: 45mm tags tile across A4 with ordinary printer margins.
 */
export function buildAssetLabelSheet(labels: AssetLabel[]): string {
  const cards = labels
    .map(
      (l) => `
    <div class="tag">
      <img src="${esc(l.qrDataUrl)}" alt="">
      <div class="meta">
        <div class="title">${esc(clip(l.title, MAX_TITLE)) || '&nbsp;'}</div>
        ${l.subtitle.trim() ? `<div class="sub">${esc(clip(l.subtitle, MAX_SUBTITLE))}</div>` : ''}
      </div>
    </div>`,
    )
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Asset tags</title>
<style>
  @page { margin: 10mm; }
  body { margin: 0; font-family: -apple-system, Helvetica, Arial, sans-serif; color: #000; background: #fff; }
  .sheet { display: flex; flex-wrap: wrap; gap: 4mm; }
  /* Never split a tag across a page break — half a QR code scans as nothing. */
  .tag { width: 45mm; border: 0.3mm dashed #999; border-radius: 2mm; padding: 3mm; box-sizing: border-box;
         display: flex; flex-direction: column; align-items: center; gap: 1.5mm; break-inside: avoid; page-break-inside: avoid; }
  .tag img { width: 30mm; height: 30mm; display: block; }
  .meta { width: 100%; text-align: center; overflow: hidden; }
  .title { font-size: 8pt; font-weight: 700; line-height: 1.2; word-break: break-word; }
  .sub { font-size: 6.5pt; color: #444; margin-top: 0.7mm; word-break: break-word; }
</style></head>
<body><div class="sheet">${cards}
</div></body></html>`;
}
