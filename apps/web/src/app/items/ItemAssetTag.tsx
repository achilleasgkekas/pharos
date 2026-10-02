'use client';
import { useEffect, useState } from 'react';
import { QrCode as QrCodeIcon, Printer, Loader2 } from 'lucide-react';
import { QrCode } from '@/components/QrCode';
import { useT } from '@/components/LocaleProvider';
import { assetLabelUrl } from '@/lib/assetLabel';
import { printAssetTags } from './printAssetTags';

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
  const [big, setBig] = useState(false);

  useEffect(() => {
    setUrl(assetLabelUrl(window.location.origin, itemId));
  }, [itemId]);

  async function handlePrint() {
    if (!url || printing) return;
    setPrinting(true);
    try {
      await printAssetTags([{ id: itemId, title, subtitle }]);
    } finally {
      setPrinting(false);
    }
  }

  if (!itemId) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2">
      {/* Small by default: the sticker is what gets scanned, not the screen. A click shows it
          large for the odd time the phone is right here. */}
      <button
        type="button"
        onClick={() => setBig((b) => !b)}
        disabled={!url}
        title={t('it.assetTagQrAlt')}
        className="shrink-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-accent)]"
      >
        {url ? (
          <QrCode value={url} size={big ? 176 : 40} label={t('it.assetTagQrAlt')} />
        ) : (
          <QrCodeIcon size={28} className="text-[color:var(--color-text-faint)]" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-[color:var(--color-text)]">{t('it.assetTag')}</p>
        <p className="text-[11px] leading-snug text-[color:var(--color-text-faint)] line-clamp-2">{t('it.assetTagHint')}</p>
      </div>
      <button
        type="button"
        onClick={handlePrint}
        disabled={!url || printing}
        className="shrink-0 inline-flex h-8 items-center gap-1.5 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 text-xs text-[color:var(--color-text-dim)] transition-colors hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-text)] disabled:opacity-50"
      >
        {printing ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
        {t('it.printLabel')}
      </button>
    </div>
  );
}
