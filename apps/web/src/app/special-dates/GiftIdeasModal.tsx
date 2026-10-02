'use client';
import { useState, useTransition } from 'react';
import { Check, Gift, Loader2, Plus, Sparkles } from 'lucide-react';
import { useLocale, useMoney, useT } from '@/components/LocaleProvider';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import type { SerializedSpecialDate } from '@/types';
import { addGiftToWishlist, suggestGiftIdeas, type GiftIdea } from './giftActions';

/** Gift ideas (AI) for one special date, each one a click away from the wishlist. */
export function GiftIdeasModal({ date, currency, onClose }: { date: SerializedSpecialDate; currency: string; onClose: () => void }) {
  const t = useT();
  const locale = useLocale();
  const money = useMoney();
  const [budget, setBudget] = useState('');
  const [hint, setHint] = useState('');
  const [ideas, setIdeas] = useState<GiftIdea[] | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  const ask = () =>
    start(async () => {
      setError('');
      try {
        const r = await suggestGiftIdeas(date._id, { budget: Number(budget) || null, hint, locale, currency });
        if (r.ok) {
          setIdeas(r.ideas);
          setAdded(new Set());
        } else setError(r.error);
      } catch (e) {
        setError((e as Error).message || t('common.failed'));
      }
    });

  const add = (i: number, idea: GiftIdea) =>
    start(async () => {
      const r = await addGiftToWishlist({ title: idea.title, price: idea.price, forName: date.name });
      if (r.ok) setAdded((s) => new Set(s).add(i));
      else setError(r.error || t('common.failed'));
    });

  return (
    <Modal open onClose={onClose} title={t('gift.title', { name: date.name })} size="md">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <Field label={t('gift.budget')}>
            <Input type="number" min="0" step="1" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="50" />
          </Field>
          <Field label={t('gift.hint')}>
            <Input value={hint} onChange={(e) => setHint(e.target.value)} placeholder={t('gift.hintPlaceholder')} maxLength={300} />
          </Field>
        </div>
        <p className="text-[11px] text-[color:var(--color-text-faint)]">{t('gift.privacy')}</p>
        <button
          type="button"
          onClick={ask}
          disabled={pending}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[color:var(--color-accent)] px-3 text-xs font-semibold text-[color:var(--color-on-accent)] disabled:opacity-50"
        >
          {pending && !ideas ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {ideas ? t('gift.more') : t('gift.ask')}
        </button>
        {error && <p className="text-xs text-[color:var(--color-red)]">{error}</p>}
        {ideas && (
          <ul className="divide-y divide-[color:var(--color-border)] rounded-xl border border-[color:var(--color-border)]">
            {ideas.map((idea, i) => (
              <li key={`${idea.title}-${i}`} className="flex items-start gap-3 px-3 py-2.5">
                <Gift size={15} className="mt-0.5 shrink-0 text-[color:var(--color-accent)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{idea.title}</p>
                  {idea.why && <p className="text-xs text-[color:var(--color-text-faint)]">{idea.why}</p>}
                </div>
                {idea.price != null && idea.price > 0 && <span className="shrink-0 text-xs tabular-nums text-[color:var(--color-text-dim)]">~{money(idea.price, currency, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>}
                <button
                  type="button"
                  onClick={() => add(i, idea)}
                  disabled={pending || added.has(i)}
                  aria-label={t('gift.addToWishlist')}
                  title={t('gift.addToWishlist')}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-2 text-xs disabled:opacity-60"
                >
                  {added.has(i) ? <Check size={13} className="text-[color:var(--color-accent)]" /> : <Plus size={13} />}
                  <span className="hidden sm:inline">{added.has(i) ? t('gift.added') : t('gift.wishlist')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
