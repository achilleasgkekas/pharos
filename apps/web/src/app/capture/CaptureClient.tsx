'use client';
import { useEffect, useState, useTransition } from 'react';
import { Sparkles, Link2, Loader2, ShoppingCart, Package, X } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { PharosMark } from '@/components/PharosMark';
import { previewItemFromUrl, confirmImportItem } from '@/app/items/actions';
import { useT } from '@/components/LocaleProvider';
import type { ItemView } from '@/lib/itemStatus';

type PreviewData = { title: string; price: number; store: string; specs: string; category: string; existing: { id: string; title: string } | null };

/** Compact "Add to Pharos" popup — the bookmarklet's landing page. Reuses the exact
 *  same preview→approve pipeline as the Items page URL import (previewItemFromUrl /
 *  confirmImportItem), just in a single-purpose layout sized for a small popup window. */
export function CaptureClient({ initialUrl }: { initialUrl: string }) {
  const t = useT();
  const [url, setUrl] = useState(initialUrl);
  const [pending, startTransition] = useTransition();
  const [saving, startSave] = useTransition();
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ title: string; updated: boolean } | null>(null);

  function runPreview(u: string) {
    if (!u.trim()) return;
    setError(null);
    setPreview(null);
    setSaved(null);
    startTransition(async () => {
      const r = await previewItemFromUrl(u.trim());
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPreview({ title: r.title, price: r.price, store: r.store, specs: r.specs, category: r.category, existing: r.existing });
    });
  }

  // Auto-preview once when the bookmarklet handed us a URL.
  useEffect(() => {
    if (initialUrl) runPreview(initialUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]);

  function save(view: ItemView) {
    if (!preview) return;
    setError(null);
    startSave(async () => {
      const r = await confirmImportItem(
        { url: url.trim(), title: preview.title, price: preview.price, store: preview.store, specs: preview.specs, category: preview.category },
        view
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved({ title: r.title, updated: r.updated });
      setPreview(null);
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <PharosMark size={22} pulse={false} className="text-[color:var(--color-accent)]" />
          <span className="font-semibold text-sm" style={{ fontFamily: 'var(--font-display)' }}>{t('cap.title')}</span>
        </div>

        {saved ? (
          <div className="text-center py-4">
            <p className="text-sm text-[color:var(--color-accent)] mb-1">{saved.updated ? t('cap.updatedExisting', { title: saved.title }) : t('cap.added', { title: saved.title })}</p>
            <p className="text-xs text-[color:var(--color-text-faint)] mb-4">{t('cap.closeHint')}</p>
            <Button variant="ghost" onClick={() => window.close()} className="mx-auto">
              <X size={14} /> {t('cap.close')}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <Input
                icon={<Link2 size={14} />}
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setPreview(null);
                  setError(null);
                }}
                placeholder={t('cap.urlPlaceholder')}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), runPreview(url))}
                disabled={pending || saving}
              />
              <Button variant="primary" onClick={() => runPreview(url)} disabled={pending || saving || !url.trim()} className="shrink-0">
                {pending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              </Button>
            </div>

            {pending && <p className="text-[11px] text-[color:var(--color-cyan)] mt-2">{t('cap.fetching')}</p>}
            {error && <p className="text-[11px] text-[color:var(--color-red)] mt-2">{error}</p>}

            {preview && (
              <div className="mt-3 rounded-xl border border-[color:var(--color-accent)] bg-[color:var(--color-surface-2)] p-3">
                {preview.existing && (
                  <p className="text-[10px] text-[color:var(--color-gold)] mb-2">{t('cap.matchesExisting', { title: preview.existing.title })}</p>
                )}
                <p className="font-semibold text-sm leading-snug" style={{ fontFamily: 'var(--font-display)' }}>{preview.title}</p>
                <p className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider mt-0.5">
                  {preview.category} · {preview.store}
                </p>
                {preview.price > 0 && (
                  <p className="text-sm font-semibold text-[color:var(--color-accent)] mt-1.5">{preview.price.toFixed(2)}</p>
                )}
                <div className="flex gap-2 mt-3">
                  <Button variant="primary" onClick={() => save('shopping')} disabled={saving} className="flex-1 justify-center">
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <ShoppingCart size={13} />} {t('cap.addShopping')}
                  </Button>
                  <Button variant="ghost" onClick={() => save('inventory')} disabled={saving} className="flex-1 justify-center">
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Package size={13} />} {t('cap.addInventory')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
