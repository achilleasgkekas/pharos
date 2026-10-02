'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import { dismissAiOnboarding } from '@/app/settings/actions';
import { useT } from '@/components/LocaleProvider';

/** Dismissible one-line nudge on Home when AI isn't set up (the redesign moved it off every
 *  other page). The app works fully without AI; this just points to the optional features.
 */
export function AiOnboardingBanner({ reason }: { reason: 'off' | 'no-provider' }) {
  const t = useT();
  const [hidden, setHidden] = useState(false);
  const [, start] = useTransition();
  if (hidden) return null;

  const text = reason === 'off' ? t('aiBanner.off') : t('aiBanner.noProvider');
  const short = reason === 'off' ? t('aiBanner.offShort') : t('aiBanner.noProviderShort');

  function dismiss() {
    setHidden(true);
    start(() => {
      void dismissAiOnboarding();
    });
  }

  return (
    <div className="flex items-center gap-3 mb-4 min-h-11 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] pl-3.5 pr-1.5 py-1.5">
      <Sparkles size={16} className="text-[color:var(--color-accent)] shrink-0" />
      <p className="text-sm text-[color:var(--color-text-dim)] flex-1 min-w-0">
        <span className="sm:hidden">{short}</span>
        <span className="hidden sm:inline">{text}</span>
      </p>
      <Link
        href="/settings?tab=ai"
        className="flex items-center gap-1 h-9 px-2 text-sm font-semibold text-[color:var(--color-accent)] hover:underline shrink-0 whitespace-nowrap"
      >
        {t('aiBanner.setUp')} <ArrowRight size={14} />
      </Link>
      <button onClick={dismiss} className="grid place-items-center w-9 h-9 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] shrink-0" aria-label={t('common.dismiss')}>
        <X size={15} />
      </button>
    </div>
  );
}
