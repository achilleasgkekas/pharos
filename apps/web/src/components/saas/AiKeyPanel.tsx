'use client';

// Client interactivity for the workspace "AI key" (BYO-key) settings section
// ((saas)/account/workspace/settings). Consumes /api/saas/workspace/ai-key, a fully-built
// GET/PUT/DELETE control-plane route (TODO §11/§14, D5) that had zero UI to drive it.
//
// Lets an owner/admin store their OWN encrypted AI provider key on the workspace so AI calls
// run on that key (unmetered, zero platform cost) instead of the platform's shared key. The
// plaintext never reaches this component after a save — the route only ever returns a masked
// `{ provider, masked }` preview, which is exactly the shape rendered here.
//
// Same idiom as WorkspaceSettingsPanel: initial status is server-rendered (page.tsx reads
// describeTenantAiKey/byoKeyReady directly), this component only performs the PUT/DELETE
// mutation and router.refresh()es so the server stays the source of truth.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AI_KEY_PROVIDERS,
  aiKeyProviderLabel,
  aiKeySaveReady,
  describeAiKeyError,
} from './aiKeySettings';

type KeyMask = { provider: string; masked: string };

type Props = {
  tenantSlug: string;
  /** Owner or admin — mirrors the route's requireManage gate for all three methods. */
  canManage: boolean;
  /** false when AUTH_SECRET is unset — the server cannot encrypt/decrypt a stored key at all. */
  cryptoReady: boolean;
  initialKey: KeyMask | null;
};

async function callJson(
  url: string,
  method: string,
  body?: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, status: 0, data: { error: 'Network error. Check your connection and try again.' } };
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON body (shouldn't happen for this route) — keep an empty object.
  }
  return { ok: res.ok, status: res.status, data };
}

export function AiKeyPanel({ tenantSlug, canManage, cryptoReady, initialKey }: Props) {
  const router = useRouter();
  const [currentKey, setCurrentKey] = useState<KeyMask | null>(initialKey);
  const [provider, setProvider] = useState<string>(initialKey?.provider || AI_KEY_PROVIDERS[0]);
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState<'save' | 'clear' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!canManage) return null;

  const canSave = aiKeySaveReady(provider, keyInput, cryptoReady) && busy === null;

  async function saveKey() {
    if (!canSave) return;
    setBusy('save');
    setError(null);
    setNotice(null);
    const { ok, status, data } = await callJson('/api/saas/workspace/ai-key', 'PUT', {
      provider,
      key: keyInput,
      tenant: tenantSlug,
    });
    setBusy(null);
    if (!ok) {
      setError(describeAiKeyError(status, data.error));
      return;
    }
    setCurrentKey((data.key as KeyMask | undefined) ?? null);
    setKeyInput('');
    setNotice('AI key saved. Future AI calls for this workspace will use it.');
    router.refresh();
  }

  async function clearKey() {
    if (busy) return;
    if (
      !window.confirm(
        "Remove this workspace's AI key? Future AI calls will use the platform's shared key again."
      )
    ) {
      return;
    }
    setBusy('clear');
    setError(null);
    setNotice(null);
    const { ok, status, data } = await callJson('/api/saas/workspace/ai-key', 'DELETE', {
      tenant: tenantSlug,
    });
    setBusy(null);
    if (!ok) {
      setError(describeAiKeyError(status, data.error));
      return;
    }
    setCurrentKey(null);
    setNotice('AI key removed. This workspace is back on the platform key.');
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
      <h2 className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
        AI key
      </h2>

      {error && (
        <div
          role="status"
          className="mt-3 rounded-lg border border-[color:var(--color-red)]/45 bg-[color:var(--color-red)]/10 px-3 py-2 text-sm text-[color:var(--color-red)]"
        >
          {error}
        </div>
      )}
      {notice && !error && (
        <div
          role="status"
          className="mt-3 rounded-lg border border-[color:var(--color-accent)]/45 bg-[color:var(--color-accent)]/10 px-3 py-2 text-sm text-[color:var(--color-accent)]"
        >
          {notice}
        </div>
      )}

      {!cryptoReady && (
        <p className="mt-3 text-sm text-[color:var(--color-text-dim)]">
          This server is not set up to store secrets yet, so a workspace AI key cannot be saved.
        </p>
      )}

      {cryptoReady && currentKey && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-[color:var(--color-text-dim)]">
            Using your own <span className="text-[color:var(--color-text)]">{aiKeyProviderLabel(currentKey.provider)}</span>{' '}
            key, ending in <span className="font-mono">{currentKey.masked}</span>.
          </p>
          <button
            type="button"
            onClick={clearKey}
            disabled={busy !== null}
            className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-text)] hover:border-[color:var(--color-border-light)] disabled:opacity-40"
          >
            {busy === 'clear' ? 'Removing…' : 'Remove key'}
          </button>
        </div>
      )}

      {cryptoReady && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-[color:var(--color-text-dim)]">
            {currentKey
              ? 'Replace it with a different provider or key:'
              : "Bring your own AI provider key so this workspace's AI calls run on it instead of the platform's shared key (unmetered)."}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="text-[color:var(--color-text-dim)]">Provider</span>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                disabled={busy !== null}
                className="mt-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-text)] disabled:opacity-60"
              >
                {AI_KEY_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {aiKeyProviderLabel(p)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block flex-1 min-w-[220px] text-sm">
              <span className="text-[color:var(--color-text-dim)]">API key</span>
              <input
                type="password"
                autoComplete="off"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                disabled={busy !== null}
                placeholder="sk-…"
                className="mt-1 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-text)] disabled:opacity-60"
              />
            </label>
            <button
              type="button"
              onClick={saveKey}
              disabled={!canSave}
              className="rounded-lg border border-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/10 disabled:opacity-40"
            >
              {busy === 'save' ? 'Saving…' : 'Save key'}
            </button>
          </div>
          <p className="text-xs text-[color:var(--color-text-faint)]">
            Stored encrypted at rest. Never shown again after saving, only a masked preview.
          </p>
        </div>
      )}
    </section>
  );
}
