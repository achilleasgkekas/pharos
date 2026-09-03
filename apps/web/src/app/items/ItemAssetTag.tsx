'use client';
import { useEffect, useState } from 'react';
import { QrCode as QrCodeIcon, Printer, Loader2 } from 'lucide-react';
import { QrCode } from '@/components/QrCode';
import { useT } from '@/components/LocaleProvider';
import { assetLabelUrl, buildAssetLabelSheet } from '@/lib/assetLabel';

/** Print resolution for the tag: a 30mm QR at ~300dpi. The on-screen preview is a separate,
 *  much smaller render — a screen-sized bitmap stretched onto paper scans badly. */
const PRINT_QR_PX = 600;

/**
 * P56 — the item's own QR asset tag. The code encodes this deployment's `/items?open=<id>`
 * link, so scanning the sticker on the physical box opens that item's detail (or the login
 * screen first, if the phone has no session).
 *
 * The origin is read from the browser rather than from config: a self-hosted install on a
 * LAN IP prints tags that work on that LAN with nothing to configure. That also means the
 * URL only exists after mount, which is why it lives in state instead of being computed
 * during render.
 */
export function ItemAssetTag({ itemId, title, subtitle }: { itemId: string; title: string; subtitle: string }) {
  const t = useT();
  const [url, setUrl] = useState('');
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    setUrl(assetLabelUrl(window.location.origin, itemId));
  }, [itemId]);

  async function handlePrint() {
    if (!url || printing) return;
    setPrinting(true);
    try {
      const { default: QRCode } = await import('qrcode');
      const qrDataUrl = await QRCode.toDataURL(url, {
        width: PRINT_QR_PX,
        margin: 2,
        errorCorrectionLevel: 'M', // a sticker gets scuffed; M recovers ~15% of the code
        color: { dark: '#000000', light: '#ffffff' },
      });
      printSheet(buildAssetLabelSheet([{ title, subtitle, qrDataUrl }]));
    } finally {
      setPrinting(false);
    }
  }

  if (!itemId) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)' }}>
          {t('it.assetTag')}
        </p>
        <button
          type="button"
          onClick={handlePrint}
          disabled={!url || printing}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50"
        >
          {printing ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
          {t('it.printLabel')}
        </button>
      </div>
      <div className="flex items-center gap-4 px-3 py-3 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)]">
        {url ? (
          <QrCode value={url} size={104} label={t('it.assetTagQrAlt')} />
        ) : (
          <QrCodeIcon size={32} className="text-[color:var(--color-text-faint)]" />
        )}
        <p className="text-xs text-[color:var(--color-text-dim)] min-w-0">{t('it.assetTagHint')}</p>
      </div>
    </div>
  );
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
