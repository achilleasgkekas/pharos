'use client';
import { useEffect, useState, useTransition } from 'react';
import { Loader2, ArrowUpCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { useT } from '@/components/LocaleProvider';
import { getUpdateStatus, setUpdateCheckEnabled, type UpdateStatus } from './updateCheckActions';

/**
 * Settings → About: the version row, plus "a newer release exists" when there is one (P40).
 *
 * Loads on mount rather than server-side with the rest of the settings payload, so a slow
 * or blocked registry can never delay the page: the version shows immediately and the
 * check fills in behind it (at most once a day, see updateCheckActions).
 */
export function UpdateChecker({ canEdit }: { canEdit: boolean }) {
  const t = useT();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    getUpdateStatus()
      .then(setStatus)
      .catch(() => {});
  }, []);

  function recheck() {
    setChecking(true);
    getUpdateStatus(true)
      .then(setStatus)
      .catch(() => {})
      .finally(() => setChecking(false));
  }

  function toggle(value: boolean) {
    setStatus((s) => (s ? { ...s, enabled: value, latest: value ? s.latest : '', updateAvailable: false } : s));
    startTransition(async () => {
      await setUpdateCheckEnabled(value);
      if (value) getUpdateStatus(true).then(setStatus).catch(() => {});
    });
  }

  // `v` belongs in front of a release number, not in front of `dev` or `edge`.
  const version = status?.version ?? '';
  const versionLabel = !version ? '…' : /^\d+\.\d+\.\d+$/.test(version) ? `v${version}` : version;

  return (
    <>
      <div className="flex items-center justify-between text-sm">
        <span className="text-[color:var(--color-text-faint)]">{t('set.version')}</span>
        <span className="font-medium flex items-center gap-2">
          <span style={{ fontFamily: 'var(--font-mono)' }}>{versionLabel}</span>
          {status?.supported && status.enabled && (
            <button
              type="button"
              onClick={recheck}
              disabled={checking}
              title={t('upd.checkNow')}
              className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)] disabled:opacity-50"
            >
              {checking ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            </button>
          )}
        </span>
      </div>

      {status?.updateAvailable && (
        <a
          href={status.releasesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors',
            'border-[color:var(--color-gold)] bg-[#ffd93d10] text-[color:var(--color-gold)] hover:bg-[#ffd93d1a]'
          )}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <ArrowUpCircle size={14} className="shrink-0" />
          {t('upd.available', { version: status.latest })}
        </a>
      )}

      {status?.supported && !status.updateAvailable && status.enabled && status.latest && (
        <p className="text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {t('upd.upToDate')}
        </p>
      )}

      {status?.supported && canEdit && (
        <div className="flex items-center justify-between text-sm pt-1">
          <span className="text-[color:var(--color-text-faint)]">
            {t('upd.toggle')}
            <span className="block text-[10px] text-[color:var(--color-text-faint)] opacity-70">{t('upd.toggleHint')}</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={!!status.enabled}
            onClick={() => toggle(!status.enabled)}
            className={cn(
              'relative w-10 h-6 rounded-full transition-colors shrink-0',
              status.enabled
                ? 'bg-[color:var(--color-accent)]'
                : 'bg-[color:var(--color-surface-3)] border border-[color:var(--color-border)]'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                status.enabled && 'translate-x-4'
              )}
            />
          </button>
        </div>
      )}
    </>
  );
}
