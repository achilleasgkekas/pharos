'use client';
import { assetLabelUrl, buildAssetLabelSheet, type AssetLabel } from '@/lib/assetLabel';

/** Print resolution for a tag: a 30mm QR at ~300dpi. The on-screen preview is a separate,
 *  much smaller render — a screen-sized bitmap stretched onto paper scans badly. */
const PRINT_QR_PX = 600;

export type AssetTagInput = { id: string; title: string; subtitle: string };

/**
 * P56 — renders the QR bitmaps and sends one sheet to the printer. Shared by the single tag
 * on an item's detail and the bulk sheet over a selection, so both print the exact same
 * label and the origin rule (read from the browser, never from config) lives in one place.
 *
 * The order handed in is the order printed: the sheet has to match what the user was looking
 * at on screen, otherwise stickers and boxes get paired up wrong.
 */
export async function printAssetTags(entries: AssetTagInput[]): Promise<void> {
  const { default: QRCode } = await import('qrcode');
  const labels: AssetLabel[] = [];
  for (const e of entries) {
    const url = assetLabelUrl(window.location.origin, e.id);
    if (!url) continue; // an item without an id has nothing to scan to
    labels.push({
      title: e.title,
      subtitle: e.subtitle,
      qrDataUrl: await QRCode.toDataURL(url, {
        width: PRINT_QR_PX,
        margin: 2,
        errorCorrectionLevel: 'M', // a sticker gets scuffed; M recovers ~15% of the code
        color: { dark: '#000000', light: '#ffffff' },
      }),
    });
  }
  if (labels.length === 0) return; // never open a print dialog on an empty page
  printSheet(buildAssetLabelSheet(labels));
}

/** Prints a standalone HTML document without leaving the app. An off-screen iframe rather
 *  than `window.open` on purpose: a popup blocker silently swallows the new window, and the
 *  user is left clicking a button that appears to do nothing. */
function printSheet(html: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  frame.srcdoc = html;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    // The print dialog is modal but not awaitable; tearing the iframe down immediately
    // cancels the job in some browsers, so it outlives the call by a beat.
    setTimeout(() => frame.remove(), 1000);
  };
  document.body.appendChild(frame);
}
