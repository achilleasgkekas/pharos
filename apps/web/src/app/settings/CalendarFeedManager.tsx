'use client';
import { useEffect, useState } from 'react';
import { Copy, Check, Loader2, CalendarPlus, RefreshCw, Trash2 } from 'lucide-react';
import { getCalendarFeed, generateCalendarFeed, revokeCalendarFeed } from './calendarFeedActions';
import { useT } from '@/components/LocaleProvider';

const codeCls = 'flex-1 min-w-0 text-xs bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 truncate';
const iconBtn = 'shrink-0 p-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:border-[color:var(--color-accent)] transition-colors';
const labelCls = 'block text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)] mb-1';

/** Settings card: a per-user read-only iCal subscription URL for the money agenda. */
export function CalendarFeedManager() {
  const t = useT();
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
    getCalendarFeed().then((s) => {
      setToken(s.token);
      setLoaded(true);
    });
  }, []);

  async function gen() {
    setBusy(true);
    const r = await generateCalendarFeed();
    setBusy(false);
    if (r.ok && r.token) setToken(r.token);
  }
  async function revoke() {
    setBusy(true);
    await revokeCalendarFeed();
    setBusy(false);
    setToken(null);
  }
  function copy(text: string) {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const base = origin || '';
  const url = token ? `${base}/api/calendar.ics?token=${token}` : '';

  return (
    <div className="space-y-4" style={{ fontFamily: 'inherit' }}>
      <p className="text-sm text-[color:var(--color-text-dim)]">{t('ics.intro')}</p>

      {url && (
        <div>
          <span className={labelCls} style={{ fontFamily: 'var(--font-mono)' }}>{t('ics.feedUrl')}</span>
          <div className="flex items-center gap-2">
            <code className={`${codeCls} text-[color:var(--color-accent)]`} style={{ fontFamily: 'var(--font-mono)' }}>{url}</code>
            <button type="button" onClick={() => copy(url)} className={iconBtn} title={t('ics.copyUrl')}>
              {copied ? <Check size={14} className="text-[color:var(--color-accent)]" /> : <Copy size={14} />}
            </button>
          </div>
          <p className="text-[11px] text-[color:var(--color-text-faint)] mt-1">{t('ics.urlHint')}</p>
        </div>
      )}

      <div>
        <p className="text-xs text-[color:var(--color-text-faint)]">
          {!loaded ? t('common.loading') : token ? t('ics.active') : t('ics.none')}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={gen}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-accent)] text-[color:var(--color-accent)] hover:opacity-80 transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : token ? <RefreshCw size={13} /> : <CalendarPlus size={13} />}
            {token ? t('ics.rotate') : t('ics.generate')}
          </button>
          {token && (
            <button
              type="button"
              onClick={revoke}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-red)] hover:border-[color:var(--color-red)] transition-colors disabled:opacity-50"
            >
              <Trash2 size={13} /> {t('ics.revoke')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
