'use client';
import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Sparkles, Receipt, Package, Wallet, Bell, Command, X, ArrowRight, ArrowLeft } from 'lucide-react';
import { useT } from '@/components/LocaleProvider';

// First-run guided tour: a short, centered walkthrough shown once per browser the first time a
// signed-in user lands on a chrome'd page. It is intentionally NOT DOM-anchored (no fragile
// spotlight on moving elements) — a focused modal that introduces each pillar of the app reads
// the same on mobile and desktop and never breaks when a page's layout changes.
//
// "Seen" lives in localStorage (per-viewer): a product intro is a convenience, not shared state,
// so it needs no server round-trip and no tenant scoping. Reads/writes are wrapped in try/catch
// because private-mode browsers throw on access; if storage is unreadable we simply show it.
const SEEN_KEY = 'pharos_tour_seen_v1';

const ICONS = [Sparkles, Receipt, Package, Wallet, Bell, Command] as const;

export function FirstRunTour() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      setOpen(true); // storage blocked — better to show once than never
    }
  }, []);

  const steps = [
    { title: t('tour.s1Title'), body: t('tour.s1Body') },
    { title: t('tour.s2Title'), body: t('tour.s2Body') },
    { title: t('tour.s3Title'), body: t('tour.s3Body') },
    { title: t('tour.s4Title'), body: t('tour.s4Body') },
    { title: t('tour.s5Title'), body: t('tour.s5Body') },
    { title: t('tour.s6Title'), body: t('tour.s6Body') },
  ];

  function close() {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* private mode — it will just show again next time, which is acceptable */
    }
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, steps.length - 1));
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, steps.length]);

  if (!mounted || !open) return null;

  const Icon = ICONS[i] ?? Sparkles;
  const last = i === steps.length - 1;

  return (
    <Dialog.Root open onOpenChange={(nextOpen) => !nextOpen && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-2xl overflow-hidden outline-none">
        {/* Skip */}
        <button
          type="button"
          onClick={close}
          aria-label={t('tour.skip')}
          className="absolute top-2 right-2 w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)] transition-colors"
        >
          <X size={16} />
        </button>

        <div className="p-6 pt-8">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent)]">
            <Icon size={24} />
          </div>
          <p className="text-[10px] tracking-[0.22em] uppercase text-[color:var(--color-text-faint)] mb-2" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('tour.title')} · {i + 1}/{steps.length}
          </p>
          <Dialog.Title className="text-xl font-bold leading-tight mb-2" style={{ fontFamily: 'var(--font-display)' }}>
            {steps[i].title}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-[color:var(--color-text-dim)] leading-relaxed">{steps[i].body}</Dialog.Description>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center pb-2">
          {steps.map((_, n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n + 1}`}
              onClick={() => setI(n)}
              className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center group"
            >
              <span
                className={`h-1.5 rounded-full transition-all ${n === i ? 'w-5 bg-[color:var(--color-accent)]' : 'w-1.5 bg-[color:var(--color-border-light)] group-hover:bg-[color:var(--color-text-faint)]'}`}
              />
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40">
          <button
            type="button"
            onClick={() => (i === 0 ? close() : setI((n) => n - 1))}
            className="flex items-center gap-1.5 text-sm min-h-[44px] min-w-[44px] px-3 py-2 rounded-lg text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] transition-colors"
          >
            {i === 0 ? t('tour.skip') : (<><ArrowLeft size={15} /> {t('tour.back')}</>)}
          </button>
          <button
            type="button"
            onClick={() => (last ? close() : setI((n) => n + 1))}
            className="flex items-center gap-1.5 text-sm font-semibold min-h-[44px] min-w-[44px] px-4 py-2 rounded-lg bg-[color:var(--color-accent)] text-[color:var(--color-bg)] hover:opacity-90 transition-opacity"
          >
            {last ? t('tour.done') : (<>{t('tour.next')} <ArrowRight size={15} /></>)}
          </button>
        </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
