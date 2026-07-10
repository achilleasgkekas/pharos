// Presentational quota progress bar for the SaaS usage deep-dive. Server-safe (no client hooks).
// Renders a labelled track filled to `quotaBarView(...)`'s percent, tinted by tone (ok/warn/full),
// with a "used / limit" caption and remaining figure. Styled ONLY with the existing Pharos design
// tokens — never touches shared chrome. Only rendered in SAAS_MODE (the whole segment 404s otherwise).
import { quotaBarView, type QuotaBarInput } from './quota';

const TONE_COLOR = {
  ok: 'var(--color-accent)',
  warn: 'var(--color-gold)',
  full: 'var(--color-red)',
} as const;

export function QuotaBar({
  label,
  used,
  limit,
  ratio,
  /** Formats the used/limit/remaining numbers (e.g. formatInt or formatBytes). */
  format,
}: {
  label: string;
  format: (n: number) => string;
} & QuotaBarInput) {
  const view = quotaBarView({ used, limit, ratio });
  const usedLabel = format(typeof used === 'number' && Number.isFinite(used) && used > 0 ? used : 0);
  const caption = view.unlimited ? `${usedLabel} / ∞` : `${usedLabel} / ${format(limit as number)}`;
  const color = TONE_COLOR[view.tone];

  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="text-[color:var(--color-text-dim)]">{label}</span>
        <span className="tabular-nums text-[color:var(--color-text)]">{caption}</span>
      </div>
      <div
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[color:var(--color-surface-3)]"
        role="progressbar"
        aria-valuenow={view.unlimited ? undefined : view.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        {view.unlimited ? (
          // Unlimited: a faint full track, no fill (nothing to measure against).
          <div className="h-full w-full opacity-20" style={{ backgroundColor: color }} />
        ) : (
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${view.percent}%`, backgroundColor: color }}
          />
        )}
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-[color:var(--color-text-faint)]">
        <span>{view.unlimited ? 'Unlimited' : `${view.percent}% used`}</span>
        {!view.unlimited && view.remaining != null && (
          <span className="tabular-nums">{format(view.remaining)} left</span>
        )}
      </div>
    </div>
  );
}
