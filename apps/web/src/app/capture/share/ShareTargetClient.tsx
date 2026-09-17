'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Receipt, Loader2, AlertTriangle } from 'lucide-react';
import { useT } from '@/components/LocaleProvider';
import { routeSharedFile, type ShareTarget } from './actions';

const LAST_CHOICE_KEY = 'pharos_share_last_target';

/** Big, thumb-sized destination buttons: this screen is only ever reached from a phone's share
 *  sheet, usually one-handed, and the whole point is to be faster than opening the app. */
export function ShareTargetClient({
  ticket,
  kind,
  filename,
  error: initialError,
}: {
  ticket: string;
  kind: 'pdf' | 'image';
  filename: string;
  error: string;
}) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<ShareTarget | null>(null);
  const [error, setError] = useState(
    initialError === 'unsupported' ? t('share.unsupported')
      : initialError ? t('share.failed') : '',
  );
  // Per-viewer convenience only; a wrong value can never send a file somewhere by itself.
  const last = typeof window !== 'undefined' ? window.localStorage.getItem(LAST_CHOICE_KEY) : null;

  async function send(target: ShareTarget) {
    setBusy(target);
    setError('');
    const res = await routeSharedFile(ticket, target);
    if (!res.ok) {
      setError(res.error);
      setBusy(null);
      return;
    }
    try { window.localStorage.setItem(LAST_CHOICE_KEY, target); } catch { /* private mode */ }
    router.replace(res.redirectTo);
  }

  const targets: { key: ShareTarget; icon: typeof Receipt; label: string; hint: string; disabled?: boolean }[] = [
    { key: 'receipt', icon: Receipt, label: t('share.asReceipt'), hint: t('share.asReceiptHint') },
    { key: 'statement', icon: FileText, label: t('share.asStatement'), hint: t('share.asStatementHint'), disabled: kind !== 'pdf' },
  ];

  return (
    <main className="max-w-md mx-auto px-4 py-10">
      <h1 className="text-xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)' }}>{t('share.title')}</h1>
      <p className="text-sm text-[color:var(--color-text-dim)] mb-6 break-all">{filename || t('share.noName')}</p>

      {error && (
        <p className="flex items-start gap-2 text-sm text-[color:var(--color-danger)] mb-5">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {!ticket && !error && <p className="text-sm text-[color:var(--color-text-dim)]">{t('share.nothingShared')}</p>}

      {ticket && (
        <div className="grid gap-3">
          {targets.map(({ key, icon: Icon, label, hint, disabled }) => (
            <button
              key={key}
              onClick={() => send(key)}
              disabled={!!busy || disabled}
              className="flex items-center gap-3 w-full text-left px-4 py-4 rounded-xl border border-[color:var(--color-border)] hover:border-[color:var(--color-accent)] disabled:opacity-40 transition-colors"
            >
              {busy === key ? <Loader2 size={22} className="animate-spin shrink-0" /> : <Icon size={22} className="shrink-0" />}
              <span>
                <span className="block font-semibold text-sm">
                  {label}{last === key && !busy ? ` · ${t('share.lastUsed')}` : ''}
                </span>
                <span className="block text-xs text-[color:var(--color-text-dim)]">
                  {disabled ? t('share.pdfOnly') : hint}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
