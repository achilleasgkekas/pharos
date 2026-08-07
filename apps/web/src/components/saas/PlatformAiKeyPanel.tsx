'use client';
import { useEffect, useState } from 'react';

/**
 * Operator console: the PLATFORM AI key.
 *
 * One provider key every workspace without its own runs on, and the one their AI charges are
 * computed against. Stored encrypted (same path as the per-tenant BYO keys) and there is NO
 * read-back — once saved, only AI dispatch can produce the plaintext, so this panel shows a
 * mask and never the key.
 */
const PROVIDERS = ['anthropic', 'openai', 'gemini', 'openrouter', 'custom'] as const;

type Info = { masked: { provider: string; masked: string } | null; updatedAt: string; updatedBy: string };

export function PlatformAiKeyPanel() {
  const [info, setInfo] = useState<Info | null>(null);
  const [provider, setProvider] = useState<string>('anthropic');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = () =>
    fetch('/api/saas/admin/ai-key')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setInfo(d))
      .catch(() => {});

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (busy || !key.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/saas/admin/ai-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key: key.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ kind: 'err', text: data.error || 'Could not save the key.' });
        return;
      }
      setKey('');
      setMsg({ kind: 'ok', text: 'Platform key saved.' });
      await load();
    } catch {
      setMsg({ kind: 'err', text: 'Network error. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await fetch('/api/saas/admin/ai-key', { method: 'DELETE' });
      setMsg({ kind: 'ok', text: 'Platform key removed.' });
      await load();
    } catch {
      setMsg({ kind: 'err', text: 'Network error. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  const input =
    'rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-text)] outline-none focus:border-[color:var(--color-accent)]';

  return (
    <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
      <h2 className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
        Platform AI key
      </h2>
      <p className="mt-2 text-sm text-[color:var(--color-text-dim)]">
        Every workspace without its own key runs on this one, and is billed for what it uses. A
        workspace that brought its own key keeps using that and is never charged.
      </p>

      <div className="mt-3 text-sm">
        {info?.masked ? (
          <p className="text-[color:var(--color-text)]">
            <span className="font-mono">{info.masked.provider}</span>{' '}
            <span className="font-mono text-[color:var(--color-text-dim)]">{info.masked.masked}</span>
            {info.updatedBy && (
              <span className="ml-2 text-xs text-[color:var(--color-text-faint)]">
                set by {info.updatedBy}
              </span>
            )}
          </p>
        ) : (
          <p className="text-[color:var(--color-gold)]">
            No platform key stored — the fleet falls back to ANTHROPIC_API_KEY, or to no AI.
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <select value={provider} onChange={(e) => setProvider(e.target.value)} className={input}>
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={info?.masked ? 'Replace the key…' : 'Paste the provider key…'}
          autoComplete="new-password" data-1p-ignore data-lpignore="true"
          spellCheck={false}
          className={`min-w-0 flex-1 font-mono ${input}`}
        />
        <button
          type="button"
          onClick={save}
          disabled={busy || !key.trim()}
          className="rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {info?.masked && (
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm text-[color:var(--color-text-dim)] hover:border-[color:var(--color-red)] hover:text-[color:var(--color-red)] disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>

      {msg && (
        <p
          className={`mt-2 text-xs ${msg.kind === 'ok' ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]'}`}
        >
          {msg.text}
        </p>
      )}
    </section>
  );
}
