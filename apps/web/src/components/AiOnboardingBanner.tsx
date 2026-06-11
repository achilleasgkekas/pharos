'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import { dismissAiOnboarding } from '@/app/settings/actions';

/** Dismissible nudge shown app-wide when AI isn't set up. The app works fully
 *  without AI; this just points users to the optional features. */
export function AiOnboardingBanner({ reason }: { reason: 'off' | 'no-provider' }) {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const [, start] = useTransition();
  // Don't nag on the settings page (you're already there to fix it).
  if (hidden || pathname.startsWith('/settings')) return null;

  const text =
    reason === 'off'
      ? 'AI features are turned off. Turn them on to auto-scan receipts, bills, statements and more.'
      : 'Add an AI provider to auto-scan receipts, bills and statements, import products and use the assistant. The app works fully without it.';

  function dismiss() {
    setHidden(true);
    start(() => {
      void dismissAiOnboarding();
    });
  }

  return (
    <div className="max-w-[1500px] mx-auto px-4 pt-3">
      <div className="flex items-center gap-3 rounded-xl border border-[color:var(--color-accent)]/40 bg-[color:var(--color-surface)] px-4 py-2.5">
        <Sparkles size={16} className="text-[color:var(--color-accent)] shrink-0" />
        <p className="text-sm text-[color:var(--color-text-dim)] flex-1 min-w-0">{text}</p>
        <Link
          href="/settings?tab=ai"
          className="flex items-center gap-1 text-sm font-semibold text-[color:var(--color-accent)] hover:underline shrink-0 whitespace-nowrap"
        >
          Set up AI <ArrowRight size={14} />
        </Link>
        <button onClick={dismiss} className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] shrink-0" aria-label="Dismiss">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
