'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, ChevronUp, X, ArrowRight } from 'lucide-react';
import { dismissOnboarding } from '@/app/settings/actions';

export type OnboardingStep = {
  key: string;
  label: string;
  done: boolean;
  href: string;
};

const mono = { fontFamily: 'var(--font-mono)' } as const;

/**
 * Dismissable "getting started" checklist (P26). Distinct from a demo-data mode —
 * these ticks track the user's OWN data (first receipt, a card, a budget, ...).
 * Auto-collapses (not hides) once every step is done; a real dismiss (X) hides it
 * for good via `onboardingDismissed` on the AppConfig singleton.
 */
export function OnboardingChecklist({
  dismissed,
  title,
  subtitle,
  doneLabel,
  steps,
}: {
  dismissed: boolean;
  title: string;
  subtitle: string;
  doneLabel: string;
  steps: OnboardingStep[];
}) {
  const allDone = steps.every((s) => s.done);
  const [hidden, setHidden] = useState(false);
  const [collapsed, setCollapsed] = useState(allDone);
  const [, start] = useTransition();

  if (dismissed || hidden) return null;

  const doneCount = steps.filter((s) => s.done).length;

  function dismiss() {
    setHidden(true);
    start(() => {
      void dismissOnboarding();
    });
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 mb-6">
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] overflow-hidden">
        {/* Dismiss sits BESIDE the collapse toggle, not inside it: a control nested in a button
            is unreachable for keyboard and screen-reader users (axe nested-interactive). */}
        <div className="flex items-center gap-3 pr-5 hover:bg-[color:var(--color-surface-2)]/50 transition-colors">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            className="flex-1 min-w-0 flex items-center gap-3 pl-5 py-3.5 text-left"
          >
            <span
              className="shrink-0 grid place-items-center w-7 h-7 rounded-full text-xs font-bold"
              style={{
                ...mono,
                color: allDone ? 'var(--color-accent)' : 'var(--color-cyan)',
                background: allDone ? 'var(--color-accent)1a' : 'var(--color-cyan)1a',
                border: `1px solid ${allDone ? 'var(--color-accent)' : 'var(--color-cyan)'}33`,
              }}
            >
              {allDone ? <Check size={14} /> : `${doneCount}/${steps.length}`}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold">{allDone ? doneLabel : title}</span>
              {!collapsed && !allDone && <span className="block text-xs text-[color:var(--color-text-dim)] mt-0.5">{subtitle}</span>}
            </span>
            {collapsed ? <ChevronDown size={16} className="text-[color:var(--color-text-faint)] shrink-0" /> : <ChevronUp size={16} className="text-[color:var(--color-text-faint)] shrink-0" />}
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="shrink-0 text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] p-1 -m-1"
          >
            <X size={15} />
          </button>
        </div>

        {!collapsed && (
          <div className="px-5 pb-4 pt-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {steps.map((s) => (
              <Link
                key={s.key}
                href={s.href}
                prefetch={false}
                className={`group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
                  s.done
                    ? 'border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/40'
                    : 'border-[color:var(--color-border)] hover:border-[color:var(--color-border-light)] hover:bg-[color:var(--color-surface-2)]/50'
                }`}
              >
                <span
                  className="shrink-0 grid place-items-center w-5 h-5 rounded-full"
                  style={{
                    color: s.done ? 'var(--color-accent)' : 'var(--color-text-faint)',
                    background: s.done ? 'var(--color-accent)1a' : 'transparent',
                    border: `1px solid ${s.done ? 'var(--color-accent)' : 'var(--color-border-light)'}`,
                  }}
                >
                  {s.done && <Check size={12} />}
                </span>
                <span className={`flex-1 min-w-0 text-sm ${s.done ? 'text-[color:var(--color-text-dim)] line-through decoration-[color:var(--color-text-faint)]' : ''}`}>{s.label}</span>
                {!s.done && <ArrowRight size={13} className="shrink-0 text-[color:var(--color-text-faint)] group-hover:text-[color:var(--color-accent)] group-hover:translate-x-0.5 transition-all" />}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
