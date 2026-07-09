// Presentational stat tile for the SaaS superadmin console. Server-safe (no client hooks).
// A labelled figure with an optional sub-line and accent, styled with the existing Pharos
// design tokens so the console matches the rest of the app without touching shared CSS.
import type { ReactNode } from 'react';

const ACCENTS = {
  accent: 'var(--color-accent)',
  cyan: 'var(--color-cyan)',
  purple: 'var(--color-purple)',
  gold: 'var(--color-gold)',
  red: 'var(--color-red)',
  neutral: 'var(--color-text-dim)',
} as const;

export type StatAccent = keyof typeof ACCENTS;

export function StatTile({
  label,
  value,
  sub,
  accent = 'neutral',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: StatAccent;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
      <div className="text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-semibold tabular-nums"
        style={{ color: ACCENTS[accent] }}
      >
        {value}
      </div>
      {sub != null && (
        <div className="mt-0.5 text-xs text-[color:var(--color-text-dim)]">{sub}</div>
      )}
    </div>
  );
}

/** A compact key→count breakdown row list (plan/status/tier tallies). */
export function BreakdownList({
  title,
  entries,
}: {
  title: string;
  entries: Array<[label: string, count: number]>;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
      <div className="text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
        {title}
      </div>
      <ul className="mt-2 space-y-1">
        {entries.map(([label, count]) => (
          <li
            key={label}
            className="flex items-center justify-between text-sm text-[color:var(--color-text-dim)]"
          >
            <span className="capitalize">{label}</span>
            <span className="tabular-nums text-[color:var(--color-text)]">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
