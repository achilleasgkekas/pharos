'use client';
import { useState, useTransition } from 'react';
import { BookOpen, Loader2, Send } from 'lucide-react';
import { useT } from '@/components/LocaleProvider';
import { Input } from '@/components/ui/Input';
import { askItemManual, type ManualAnswer } from './manualActions';

/** "Ask the manual": a question box under the item's files, answered from its manual PDFs. */
export function AskManual({ itemId }: { itemId: string }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<ManualAnswer | null>(null);
  const [pending, start] = useTransition();
  const ask = () => {
    if (!q.trim()) return;
    start(async () => {
      try {
        setRes(await askItemManual(itemId, q));
      } catch (e) {
        setRes({ ok: false, error: (e as Error).message || t('common.failed') });
      }
    });
  };
  return (
    <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
        <BookOpen size={13} className="text-[color:var(--color-accent)]" /> {t('it.askManual')}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
        className="flex gap-2"
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('it.askManualPlaceholder')} maxLength={500} aria-label={t('it.askManual')} />
        <button
          type="submit"
          disabled={pending || !q.trim()}
          aria-label={t('it.askManualSend')}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-[color:var(--color-accent)] px-3 text-[color:var(--color-on-accent)] disabled:opacity-50"
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </form>
      {res && (
        <div className="mt-3 text-sm">
          {res.ok ? (
            <>
              <p className="whitespace-pre-wrap leading-relaxed text-[color:var(--color-text-dim)]">{res.answer}</p>
              <p className="mt-1.5 text-[11px] text-[color:var(--color-text-faint)]">
                {res.pages.length ? t('it.askManualPages', { pages: res.pages.join(', ') }) : ''}
                {res.pages.length ? ' · ' : ''}
                {t('it.askManualFrom', { name: res.manuals.join(', ') })}
              </p>
            </>
          ) : (
            <p className="text-xs text-[color:var(--color-red)]">{res.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
