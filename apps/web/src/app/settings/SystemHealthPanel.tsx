'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleSlash,
  Clock,
  Cloud,
  Database,
  Globe,
  HardDrive,
  ListChecks,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { useLocale, useT } from '@/components/LocaleProvider';
import type { TKey } from '@/lib/i18n';
import type { HealthCheck, HealthCheckId, HealthLevel, SystemHealth } from '@/lib/systemHealth';
import { getSystemHealth } from './healthActions';
import { formatDate, formatTime } from '@/lib/i18n/format';

/**
 * P77 & #390 — Settings → System status. Read-only service readiness & diagnostics.
 *
 * Loads on mount with fast reachability checks. "Test connections" runs live functional
 * probes on search, browser, and remote storage backends.
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

const CHECK_META: Record<HealthCheckId, { icon: React.ReactNode; key: TKey; featureKey: TKey }> = {
  database: { icon: <Database size={15} />, key: 'sys.checkDatabase', featureKey: 'sys.featDatabase' },
  disk: { icon: <HardDrive size={15} />, key: 'sys.checkDisk', featureKey: 'sys.featDisk' },
  ai: { icon: <Sparkles size={15} />, key: 'sys.checkAi', featureKey: 'sys.featAi' },
  search: { icon: <Search size={15} />, key: 'sys.checkSearch', featureKey: 'sys.featSearch' },
  browser: { icon: <Globe size={15} />, key: 'sys.checkBrowser', featureKey: 'sys.featBrowser' },
  scraper: { icon: <Bot size={15} />, key: 'sys.checkScraper', featureKey: 'sys.featScraper' },
  jobs: { icon: <ListChecks size={15} />, key: 'sys.checkJobs', featureKey: 'sys.featJobs' },
  sync: { icon: <Cloud size={15} />, key: 'sys.checkSync', featureKey: 'sys.featSync' },
  cron: { icon: <Clock size={15} />, key: 'sys.checkCron', featureKey: 'sys.featCron' },
};

export function SystemHealthPanel() {
  const locale = useLocale();
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
    let cancelled = false;
    getSystemHealth(false)
      .then((res) => {
        if (!cancelled) setHealth(res);
      })
      .catch(() => {
        if (!cancelled) setError(t('sys.error'));
      })
      .finally(() => {
        if (!cancelled) setBusy('idle');
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

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
              {formatTime(health.checkedAt, locale)}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {(health?.checks ?? []).map((c) => (
          <CheckCard key={c.id} check={c} />
        ))}
      </div>

      <p className="text-[11px] text-[color:var(--color-text-faint)]">{t('sys.deepHint')}</p>
    </div>
  );
}

function CheckCard({ check }: { check: HealthCheck }) {
  const locale = useLocale();
  const t = useT();
  const style = LEVEL_STYLE[check.level];
  const meta = CHECK_META[check.id];
  return (
    <div className={cn('rounded-xl border bg-[color:var(--color-surface-2)] p-3 flex flex-col justify-between', style.border)}>
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold truncate">
            <span className="text-[color:var(--color-text-dim)] shrink-0">{meta.icon}</span>
            <span className="truncate">{t(meta.key)}</span>
          </div>
          <span className={cn('flex items-center gap-1 text-[11px] font-semibold uppercase shrink-0', style.text)} style={{ fontFamily: 'var(--font-mono)' }}>
            {style.icon}
            {t(style.key)}
          </span>
        </div>

        <p className="mt-1 text-[11px] text-[color:var(--color-text-faint)] leading-snug">{t(meta.featureKey)}</p>
        <p className="mt-1.5 text-xs text-[color:var(--color-text-dim)] font-medium">{t(check.noteKey as TKey, check.noteVars)}</p>
      </div>

      <dl className="mt-2.5 pt-2 border-t border-[color:var(--color-border)]/50 grid grid-cols-2 gap-x-3 gap-y-1">
        {check.metrics.map((m) => {
          let val = m.value;
          if (val.startsWith('sys.')) {
            val = t(val as TKey);
          } else if (m.key === 'sys.mLastSync' || m.key === 'sys.mLastPass') {
            val = val && val !== '—' ? formatDate(val, locale) : t('sys.never');
          }
          return (
            <div key={m.key} className="flex items-baseline justify-between gap-2 min-w-0">
              <dt className="text-[10px] uppercase tracking-wide text-[color:var(--color-text-faint)] truncate">{t(m.key as TKey)}</dt>
              <dd className="text-xs font-medium truncate" style={{ fontFamily: 'var(--font-mono)' }} title={val}>
                {val || '—'}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
