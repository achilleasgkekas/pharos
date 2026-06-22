'use client';
import { useState, useRef, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Languages, Check, Loader2 } from 'lucide-react';
import { LOCALES } from '@/lib/i18n/config';
import { setLocale } from '@/app/i18nActions';
import { useLocale, useT } from './LocaleProvider';
import { cn } from './ui/cn';

export function LanguageSwitcher() {
  const router = useRouter();
  const locale = useLocale();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function pick(code: string) {
    setOpen(false);
    if (code === locale) return;
    start(async () => {
      await setLocale(code);
      router.refresh();
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={t('lang.language')}
        className="flex items-center p-2 rounded-lg text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface)] transition-colors"
        aria-label={t('lang.language')}
      >
        {pending ? <Loader2 size={17} className="animate-spin" /> : <Languages size={17} />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-40 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-2xl shadow-black/40 p-1">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              onClick={() => pick(l.code)}
              className={cn(
                'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors',
                l.code === locale
                  ? 'text-[color:var(--color-accent)] bg-[color:var(--color-surface-2)]'
                  : 'text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)]'
              )}
            >
              <span>{l.name}</span>
              {l.code === locale && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
