'use client';
import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, CircleSlash, Database, HardDrive, Loader2, RefreshCw, Sparkles, Cloud, ListChecks, XCircle } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { useT } from '@/components/LocaleProvider';
import type { TKey } from '@/lib/i18n';
import type { HealthCheck, HealthCheckId, HealthLevel, SystemHealth } from '@/lib/systemHealth';
import { getSystemHealth } from './healthActions';

/**
 * P77 — Settings → System status. A read-only traffic-light grid over the checks the app
 * already performs, so troubleshooting starts here instead of in `docker logs`.
 *
 * Loads on mount (fast checks only, like UpdateChecker) so the tab never blocks on IO.
 * "Test connections" re-runs it with the live remote-storage probe, which is the one part
 * that can take seconds and therefore stays a deliberate press.
 */

const LEVEL_STYLE: Record<HealthLevel, { dot: string; text: string; border: string; icon: React.ReactNode; key: TKey }> = {
  ok: {
    dot: 'bg-[color:var(--color-accent)]',
    text: 'text-[color:var(--color-accent)]',
    border: 'border-[color:var(--color-border)]',
    icon: <CheckCircle2 size={14} />,
    key: 'sys.levelOk',
  },
  warn: {
    dot: 'bg-[color:var(--color-gold)]',
    text: 'text-[color:var(--color-gold)]',
    border: 'border-[color:var(--color-gold)]',
    icon: <AlertTriangle size={14} />,
    key: 'sys.levelWarn',
  },
  down: {
    dot: 'bg-[color:var(--color-red)]',
    text: 'text-[color:var(--color-red)]',
    border: 'border-[color:var(--color-red)]',
    icon: <XCircle size={14} />,
    key: 'sys.levelDown',
  },
  unknown: {
    dot: 'bg-[color:var(--color-text-faint)]',
    text: 'text-[color:var(--color-text-faint)]',
    border: 'border-[color:var(--color-border)]',
    icon: <CircleSlash size={14} />,
    key: 'sys.levelUnknown',
  },
};

const CHECK_META: Record<HealthCheckId, { icon: React.ReactNode; key: TKey }> = {
  database: { icon: <Database size={15} />, key: 'sys.checkDatabase' },
  disk: { icon: <HardDrive size={15} />, key: 'sys.checkDisk' },
  ai: { icon: <Sparkles size={15} />, key: 'sys.checkAi' },
  jobs: { icon: <ListChecks size={15} />, key: 'sys.checkJobs' },
  sync: { icon: <Cloud size={15} />, key: 'sys.checkSync' },
};

export function SystemHealthPanel() {
  const t = useT();
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [busy, setBusy] = useState<'idle' | 'quick' | 'deep'>('quick');
  const [error, setError] = useState('');

  const run = useCallback((deep: boolean) => {
    setBusy(deep ? 'deep' : 'quick');
    setError('');
    getSystemHealth(deep)
      .then(setHealth)
      .catch(() => setError(t('sys.error')))
      .finally(() => setBusy('idle'));
  }, [t]);

  useEffect(() => {
    run(false);
  }, [run]);

  const overall = health?.overall ?? 'unknown';
  const style = LEVEL_STYLE[overall];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className={cn('w-2.5 h-2.5 rounded-full', style.dot, overall === 'ok' && 'animate-pulse')} />
          <span className={cn('font-semibold', style.text)}>{t(style.key)}</span>
          {health?.checkedAt && (
            <span className="text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {new Date(health.checkedAt).toLocaleTimeString('en-GB')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => run(false)}
            disabled={busy !== 'idle'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] disabled:opacity-50"
          >
            {busy === 'quick' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {t('sys.refresh')}
          </button>
          <button
            type="button"
            onClick={() => run(true)}
            disabled={busy !== 'idle'}
            title={t('sys.deepHint')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] disabled:opacity-50"
          >
            {busy === 'deep' ? <Loader2 size={13} className="animate-spin" /> : <Activity size={13} />}
            {t('sys.testConnections')}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-[color:var(--color-red)]">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(health?.checks ?? []).map((c) => (
          <CheckCard key={c.id} check={c} />
        ))}
      </div>

      <p className="text-[11px] text-[color:var(--color-text-faint)]">{t('sys.deepHint')}</p>
    </div>
  );
}

function CheckCard({ check }: { check: HealthCheck }) {
  const t = useT();
  const style = LEVEL_STYLE[check.level];
  const meta = CHECK_META[check.id];
  // Values come from the server already formatted; only the labels are translated.
  return (
    <div className={cn('rounded-xl border bg-[color:var(--color-surface-2)] p-3', style.border)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-[color:var(--color-text-dim)]">{meta.icon}</span>
          {t(meta.key)}
        </div>
        <span className={cn('flex items-center gap-1 text-[11px] font-semibold uppercase', style.text)} style={{ fontFamily: 'var(--font-mono)' }}>
          {style.icon}
          {t(style.key)}
        </span>
      </div>

      <p className="mt-1.5 text-xs text-[color:var(--color-text-dim)]">{t(check.noteKey as TKey, check.noteVars)}</p>

      <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1">
        {check.metrics.map((m) => (
          <div key={m.key} className="flex items-baseline justify-between gap-2 min-w-0">
            <dt className="text-[10px] uppercase tracking-wide text-[color:var(--color-text-faint)] truncate">{t(m.key as TKey)}</dt>
            <dd className="text-xs font-medium truncate" style={{ fontFamily: 'var(--font-mono)' }}>
              {m.key === 'sys.mLastSync' ? (m.value ? new Date(m.value).toLocaleDateString('en-GB') : t('sys.never')) : m.value || '—'}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
