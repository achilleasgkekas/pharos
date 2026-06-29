'use client';
import { useEffect, useState, useTransition } from 'react';
import { Cloud, Loader2, ExternalLink } from 'lucide-react';
import { onedriveEnabled, getOnedriveShareLink } from '@/app/storage-actions';
import { useT } from './LocaleProvider';

/**
 * "Open in OneDrive" link for a stored file. Self-gating: renders nothing unless the
 * storage backend is OneDrive, so it can be dropped into any detail modal without
 * prop-drilling a backend flag. On click it asks the server for an anonymous
 * view-only share link and opens it.
 */
export function OpenInOneDriveButton({ filePath, className }: { filePath?: string; className?: string }) {
  const t = useT();
  const [enabled, setEnabled] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  useEffect(() => {
    let on = true;
    onedriveEnabled().then((v) => on && setEnabled(v)).catch(() => {});
    return () => {
      on = false;
    };
  }, []);

  if (!enabled || !filePath) return null;

  function open() {
    setError('');
    start(async () => {
      const r = await getOnedriveShareLink(filePath!);
      if (r.url) window.open(r.url, '_blank', 'noopener,noreferrer');
      else setError(r.error || 'Failed');
    });
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={pending}
      title={error || t('common.openInOnedrive')}
      className={
        className ??
        'inline-flex items-center gap-1.5 text-xs text-[color:var(--color-cyan)] hover:underline disabled:opacity-50'
      }
    >
      {pending ? <Loader2 size={13} className="animate-spin" /> : <Cloud size={13} />}
      {t('common.openInOnedrive')}
      {!pending && <ExternalLink size={11} className="opacity-70" />}
    </button>
  );
}
