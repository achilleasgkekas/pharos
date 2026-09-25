'use client';
import { useState, useEffect, useMemo, useTransition, useCallback } from 'react';
import { Modal } from '@/components/ui/Modal';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { DateInput } from '@/components/ui/DateInput';
import { cur, currencySymbol } from '@/lib/money';
import { isForeignCurrency, normalizeCurrency } from '@/lib/fx';
import { FxBadge } from '@/components/FxBadge';
import { Check, ArrowRight, Pencil, Archive, FileText, Loader2, Zap } from 'lucide-react';
import type { SerializedReceipt } from '@/types';
import { quickVerifyReceipt, archiveReceipt } from './actions';
import { useT } from '@/components/LocaleProvider';

function fileUrl(filePath: string) {
  const u = `/api/files/${filePath.split('/').map(encodeURIComponent).join('/')}`;
  return /\.html?$/i.test(filePath) ? `${u}?v=2` : u;
}

/** Rapid review queue: one unverified receipt at a time, fix the 3 headline
 *  fields if needed, then Verify (Enter) / Skip (→) / Edit / Archive (A). */
export function QuickVerify({
  receipts,
  stores,
  base,
  onClose,
  onOpenFull,
  onChanged,
}: {
  receipts: SerializedReceipt[];
  stores: string[];
  /** Deployment base currency (P9) — a foreign receipt is reviewed in its printed one. */
  base: string;
  onClose: () => void;
  onOpenFull: (r: SerializedReceipt) => void;
  onChanged: () => void;
}) {
  // Snapshot the queue once so it doesn't reshuffle as we verify items out of it.
  const queue = useMemo(() => receipts, []); // eslint-disable-line react-hooks/exhaustive-deps
  const t = useT();
  const [i, setI] = useState(0);
  const [pending, startTransition] = useTransition();
  const [store, setStore] = useState('');
  const [date, setDate] = useState('');
  const [total, setTotal] = useState('');
  const [done, setDone] = useState(0);

  const r = queue[i];

  // Load the current receipt's fields into the editable inputs.
  useEffect(() => {
    if (!r) return;
    setStore(r.store || '');
    setDate(r.date ? new Date(r.date).toISOString().slice(0, 10) : '');
    // A foreign receipt is reviewed (and submitted) in the currency it is printed in;
    // quickVerifyReceipt converts it back with the receipt's stored rate.
    const printed = isForeignCurrency(r.currency, base) ? r.origAmount || r.total : r.total;
    setTotal(printed ? String(printed) : '');
  }, [r, base]);

  const next = useCallback(() => setI((n) => n + 1), []);

  const verify = useCallback(() => {
    if (!r || pending) return;
    startTransition(async () => {
      await quickVerifyReceipt(r._id, { store, date, total: Number(total) || 0 });
      setDone((d) => d + 1);
      onChanged();
      next();
    });
  }, [r, pending, store, date, total, onChanged, next]);

  const archive = useCallback(() => {
    if (!r || pending) return;
    startTransition(async () => {
      await archiveReceipt(r._id, true);
      onChanged();
      next();
    });
  }, [r, pending, onChanged, next]);

  // Keyboard: Enter = verify, → / s = skip, e = edit, a = archive.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!r) return;
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if (e.key === 'Enter') { e.preventDefault(); verify(); }
      else if (!typing && (e.key === 'ArrowRight' || e.key.toLowerCase() === 's')) { e.preventDefault(); next(); }
      else if (!typing && e.key.toLowerCase() === 'a') { e.preventDefault(); archive(); }
      else if (!typing && e.key.toLowerCase() === 'e') { e.preventDefault(); onOpenFull(r); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [r, verify, archive, next, onOpenFull]);

  const total0 = queue.length;
  const allDone = i >= total0;

  return (
    <Modal open onClose={onClose} title="" size="lg">
      <div className="-mt-2">
        <div className="flex items-center justify-between mb-4">
          <span className="flex items-center gap-2 text-sm font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
            <Zap size={16} className="text-[color:var(--color-accent)]" /> {t('qv.title')}
          </span>
          <span className="text-xs text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {allDone ? t('qv.verifiedCount', { n: done }) : t('qv.progress', { i: i + 1, total: total0, done })}
          </span>
        </div>

        {/* progress bar */}
        <div className="h-1 rounded-full bg-[color:var(--color-surface-2)] mb-5 overflow-hidden">
          <div className="h-full bg-[color:var(--color-accent)] transition-all" style={{ width: `${(Math.min(i, total0) / Math.max(1, total0)) * 100}%` }} />
        </div>

        {allDone ? (
          <div className="text-center py-12">
            <Check size={40} className="mx-auto mb-3 text-[color:var(--color-accent)]" />
            <p className="font-semibold text-lg" style={{ fontFamily: 'var(--font-display)' }}>{t('qv.allCaught')}</p>
            <p className="text-sm text-[color:var(--color-text-dim)] mt-1">{t('qv.verifiedRound', { done, total: total0 })}</p>
            <button onClick={onClose} className="mt-5 text-xs px-4 py-2 rounded-lg bg-[color:var(--color-accent)] text-black font-semibold hover:opacity-90">{t('qv.done')}</button>
          </div>
        ) : r ? (
          <>
            <div className="grid md:grid-cols-[180px_1fr] gap-4">
              {/* preview */}
              <a href={r.filePath ? fileUrl(r.filePath) : undefined} target="_blank" rel="noopener noreferrer" className="block">
                {r.thumbPath || r.fileType?.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(r.thumbPath || r.filePath)} alt={r.store} className="w-full h-44 md:h-56 object-contain rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]" />
                ) : (
                  <div className="w-full h-44 md:h-56 grid place-items-center rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-[color:var(--color-text-faint)]">
                    <FileText size={32} />
                  </div>
                )}
              </a>

              {/* the 3 headline fields, editable */}
              <div className="space-y-3">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{t('rc.fStore')}</span>
                  <SearchableSelect value={store} onChange={setStore} options={stores} allowCustom placeholder={t('rc.fStorePlaceholder')} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{t('ex.fDate')}</span>
                    <DateInput value={date} onValueChange={setDate} />
                  </label>
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)] flex items-center gap-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
                      {t('qv.total', { cur: isForeignCurrency(r.currency, base) ? currencySymbol(normalizeCurrency(r.currency)).trim() : cur() })}
                      <FxBadge doc={r} base={base} />
                    </span>
                    <input type="number" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} className="w-full text-base font-semibold px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] focus:border-[color:var(--color-accent)] outline-none" style={{ fontFamily: 'var(--font-mono)' }} />
                  </label>
                </div>
                <p className="text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
                  {t('qv.lineItems', { n: r.lineItems?.length ?? 0 })}
                  {r.lineItems?.length ? ` · ${r.lineItems.slice(0, 2).map((l) => l.refinedName || l.name).filter(Boolean).join(', ')}${r.lineItems.length > 2 ? '…' : ''}` : ''}
                  {' · '}<button onClick={() => onOpenFull(r)} className="text-[color:var(--color-cyan)] hover:underline">{t('qv.editItems')}</button>
                </p>
              </div>
            </div>

            {/* actions */}
            <div className="flex items-center gap-2 mt-5 pt-4 border-t border-[color:var(--color-border)] flex-wrap">
              <button onClick={verify} disabled={pending} className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-[color:var(--color-accent)] text-black font-semibold hover:opacity-90 disabled:opacity-50">
                {pending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {t('qv.verifyNext')}
              </button>
              <button onClick={next} disabled={pending} className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-[color:var(--color-border)] hover:border-[color:var(--color-text-dim)] transition-colors disabled:opacity-50">
                <ArrowRight size={15} /> {t('qv.skip')}
              </button>
              <button onClick={() => onOpenFull(r)} className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-[color:var(--color-border)] hover:border-[color:var(--color-cyan)] text-[color:var(--color-cyan)] transition-colors">
                <Pencil size={14} /> {t('qv.editFully')}
              </button>
              <button onClick={archive} disabled={pending} className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-[color:var(--color-border)] hover:border-[color:var(--color-red)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-red)] transition-colors ml-auto disabled:opacity-50">
                <Archive size={14} /> {t('rc.notReceipt')}
              </button>
            </div>
            <p className="text-[10px] text-[color:var(--color-text-faint)] mt-3 text-center" style={{ fontFamily: 'var(--font-mono)' }}>
              {t('qv.keys')}
            </p>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
