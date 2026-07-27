'use client';
import { useEffect, useRef, useState } from 'react';
import { Copy, Check, Bookmark } from 'lucide-react';
import { buildBookmarklet } from '@/lib/bookmarklet';
import { useT } from '@/components/LocaleProvider';

/** Settings card: drag-to-bookmarks-bar "Add to Pharos" quick-capture link (P5 phase 1).
 *  No new dependency, no CORS, no API token embedded in the link — it just opens a
 *  same-origin popup on /capture that rides the browser's existing session cookie. */
export function BookmarkletManager() {
  const t = useT();
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => setOrigin(window.location.origin), []);

  const bookmarklet = origin ? buildBookmarklet(origin) : '';

  // React 19 warns on (and may eventually strip) javascript: hrefs set via JSX, so
  // the real drag target is assigned imperatively to the anchor's DOM attribute.
  useEffect(() => {
    if (linkRef.current && bookmarklet) linkRef.current.setAttribute('href', bookmarklet);
  }, [bookmarklet]);

  function copy() {
    if (!bookmarklet) return;
    navigator.clipboard?.writeText(bookmarklet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-3" style={{ fontFamily: 'inherit' }}>
      <p className="text-sm text-[color:var(--color-text-dim)]">{t('bm.intro')}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <a
          ref={linkRef}
          href="#"
          onClick={(e) => e.preventDefault()}
          draggable
          className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-accent)] text-[color:var(--color-accent)] cursor-grab select-none"
          title={t('bm.dragHint')}
        >
          <Bookmark size={13} /> {t('bm.buttonLabel')}
        </a>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:border-[color:var(--color-accent)] transition-colors"
        >
          {copied ? <Check size={13} className="text-[color:var(--color-accent)]" /> : <Copy size={13} />} {t('bm.copyCode')}
        </button>
      </div>
      <p className="text-[11px] text-[color:var(--color-text-faint)]">{t('bm.hint')}</p>
      <p className="text-[11px] text-[color:var(--color-text-faint)] border-t border-[color:var(--color-border)] pt-3">
        {t('bm.extHint')}
      </p>
    </div>
  );
}
