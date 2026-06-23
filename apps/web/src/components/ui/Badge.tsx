'use client';
import { cn } from './cn';
import { useT } from '@/components/LocaleProvider';
import type { TKey } from '@/lib/i18n';

// status value → i18n key (item + task statuses; priorities fall back to English)
const BADGE_KEY: Record<string, TKey> = {
  researching: 'it.stResearching', decided: 'it.stDecided', ordered: 'it.stOrdered', received: 'it.stReceived', installed: 'it.stInstalled', deferred: 'it.stDeferred', sold: 'it.stSold', broken: 'it.stBroken',
  todo: 'tk.todo', 'in-progress': 'tk.inProgress', done: 'tk.done', blocked: 'tk.blocked',
};

const STATUS_CONFIG: Record<string, { label: string; hex: string }> = {
  researching:   { label: 'Researching',  hex: '#666666' },
  decided:       { label: 'Decided',      hex: '#00d4ff' },
  ordered:       { label: 'Ordered',      hex: '#ffd93d' },
  received:      { label: 'Received',     hex: '#a55eea' },
  installed:     { label: 'Installed',    hex: '#00ff88' },
  deferred:      { label: 'Deferred',     hex: '#ff4757' },
  sold:          { label: 'Sold',         hex: '#666666' },
  broken:        { label: 'Broken',       hex: '#ff4757' },
  todo:          { label: 'Todo',         hex: '#666666' },
  'in-progress': { label: 'In Progress',  hex: '#00d4ff' },
  done:          { label: 'Done',         hex: '#00ff88' },
  blocked:       { label: 'Blocked',      hex: '#ff4757' },
  high:          { label: 'High',         hex: '#ff4757' },
  normal:        { label: 'Normal',       hex: '#999999' },
  low:           { label: 'Low',          hex: '#666666' },
};

interface BadgeProps {
  status: string;
  className?: string;
}

export function Badge({ status, className }: BadgeProps) {
  const t = useT();
  const cfg = STATUS_CONFIG[status] ?? { label: status, hex: '#666666' };
  const label = BADGE_KEY[status] ? t(BADGE_KEY[status]) : cfg.label;
  return (
    <span
      className={cn(
        'inline-block text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider whitespace-nowrap',
        className
      )}
      style={{
        fontFamily: 'var(--font-mono)',
        background: `${cfg.hex}20`,
        color: cfg.hex,
        border: `1px solid ${cfg.hex}40`,
      }}
    >
      {label}
    </span>
  );
}
