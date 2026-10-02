'use client';
import { useEffect, useRef, useState } from 'react';
import { Loader2, MoreHorizontal, RefreshCw, ScanLine } from 'lucide-react';
import { useT } from './LocaleProvider';

/**
 * One "Re-scan" for a stored document. The plain button re-reads the file the same way an
 * upload does (embedded PDF text when there is some, OCR or the vision model otherwise), so
 * there is nothing to choose. Forcing OCR on every page stays available behind the "⋯" menu
 * for the odd scanned page the normal path misreads.
 */
export function RescanControl({
  onRescan,
  pending = false,
}: {
  onRescan: (forceOcr: boolean) => void;
  pending?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const btn =
    'inline-flex h-8 items-center gap-1.5 border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-xs text-[color:var(--color-text)] hover:border-[color:var(--color-border-light)] disabled:opacity-50 transition-colors';

  return (
    <div ref={ref} className="relative inline-flex">
      <button type="button" onClick={() => onRescan(false)} disabled={pending} className={`${btn} rounded-l-lg px-3`}>
        {pending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        {t('common.rescan')}
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        aria-label={t('common.moreOptions')}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`${btn} -ml-px rounded-r-lg px-2`}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 w-64 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onRescan(true);
            }}
            className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-[color:var(--color-surface-2)]"
          >
            <ScanLine size={14} className="mt-0.5 shrink-0 text-[color:var(--color-text-dim)]" />
            <span>
              <span className="block text-xs font-medium text-[color:var(--color-text)]">{t('common.rescanForceOcr')}</span>
              <span className="block text-[11px] text-[color:var(--color-text-faint)]">{t('common.rescanForceOcrHint')}</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
