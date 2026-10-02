'use client';
import { cn } from './cn';
import { useT } from '@/components/LocaleProvider';
import type { TKey } from '@/lib/i18n';

/**
 * The one status palette (#351). Every status chip in the app maps to one of these tones, and
 * each tone is a theme token, so a chip reads the same on every page and in both themes.
 */
export type BadgeTone = 'neutral' | 'muted' | 'accent' | 'cyan' | 'gold' | 'purple' | 'red';

const TONE_VAR: Record<BadgeTone, string> = {
  neutral: 'var(--color-text-dim)',
  muted: 'var(--color-text-faint)',
  accent: 'var(--color-accent)',
  cyan: 'var(--color-cyan)',
  gold: 'var(--color-gold)',
  purple: 'var(--color-purple)',
  red: 'var(--color-red)',
};

// status value → tone and i18n key (item and task statuses, task priorities, bill urgency)
const STATUS: Record<string, { tone: BadgeTone; key?: TKey; label: string }> = {
  researching: { tone: 'muted', key: 'it.stResearching', label: 'Researching' },
  decided: { tone: 'cyan', key: 'it.stDecided', label: 'Decided' },
  ordered: { tone: 'gold', key: 'it.stOrdered', label: 'Ordered' },
  received: { tone: 'purple', key: 'it.stReceived', label: 'Received' },
  installed: { tone: 'accent', key: 'it.stInstalled', label: 'Installed' },
  deferred: { tone: 'red', key: 'it.stDeferred', label: 'Deferred' },
  sold: { tone: 'muted', key: 'it.stSold', label: 'Sold' },
  broken: { tone: 'red', key: 'it.stBroken', label: 'Broken' },
  todo: { tone: 'muted', key: 'tk.todo', label: 'Todo' },
  'in-progress': { tone: 'cyan', key: 'tk.inProgress', label: 'In Progress' },
  done: { tone: 'accent', key: 'tk.done', label: 'Done' },
  blocked: { tone: 'red', key: 'tk.blocked', label: 'Blocked' },
  high: { tone: 'red', key: 'tk.prHigh', label: 'High' },
  normal: { tone: 'neutral', key: 'tk.prNormal', label: 'Normal' },
  low: { tone: 'muted', key: 'tk.prLow', label: 'Low' },
  overdue: { tone: 'red', key: 'bill.stOverdue', label: 'overdue' },
  'due-soon': { tone: 'gold', key: 'bill.stDueSoon', label: 'due soon' },
  upcoming: { tone: 'neutral', key: 'bill.stUpcoming', label: 'upcoming' },
  paid: { tone: 'accent', key: 'bill.stPaid', label: 'paid' },
};

interface BadgeProps {
  status: string;
  /** Overrides the status's own tone. */
  tone?: BadgeTone;
  /** Overrides the status's own label, for a chip that is not one of the statuses above. */
  label?: React.ReactNode;
  className?: string;
}

export function Badge({ status, tone, label: labelOverride, className }: BadgeProps) {
  const t = useT();
  const cfg = STATUS[status];
  const color = TONE_VAR[tone ?? cfg?.tone ?? 'muted'];
  const label = labelOverride ?? (cfg?.key ? t(cfg.key) : cfg?.label ?? status);
  return (
    <span
      className={cn(
        'inline-block text-[11px] font-semibold leading-4 px-2 py-0.5 rounded-md whitespace-nowrap',
        className
      )}
      style={{
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}
