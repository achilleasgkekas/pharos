'use client';

// Workspace → AI: the per-tenant AI master switch + per-feature toggles, driven by the
// control-plane route /api/saas/workspace/ai-config (which resolves the workspace by slug and
// writes its data-DB AppConfig — see that route for why the account area cannot use the
// self-host server actions). Sibling of AiKeyPanel on the same page: AiKeyPanel owns the BYO
// key, this owns what AI is allowed to do. Same idiom — initial state is server-rendered, this
// only performs the PATCH and refreshes so the server stays the source of truth.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AI_FEATURES } from '@/lib/aiFeatures';

type Props = {
  tenantSlug: string;
  /** Owner/admin — mirrors the route's PATCH requireManage gate. Read-only view otherwise. */
  canManage: boolean;
  initialEnabled: boolean;
  initialFeatures: Record<string, boolean>;
};

async function patchConfig(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/saas/workspace/ai-config', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error || `Request failed (${res.status})` };
  } catch {
    return { ok: false, error: 'Network error. Check your connection and try again.' };
  }
}

/** A small pill toggle, styled to match the account area (no dependency on the product UI). */
function Toggle({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
        on ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)]'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-1'}`}
      />
    </button>
  );
}

export function WorkspaceAiPanel({ tenantSlug, canManage, initialEnabled, initialFeatures }: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [features, setFeatures] = useState<Record<string, boolean>>(initialFeatures);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const areas = [...new Set(AI_FEATURES.map((f) => f.area))];
  const isOn = (key: string) => features[key] !== false; // default ON, matches getAiConfig

  async function toggleMaster(v: boolean) {
    if (!canManage) return;
    setEnabled(v); // optimistic
    setBusy(true);
    setError(null);
    const r = await patchConfig({ tenant: tenantSlug, aiEnabled: v });
    setBusy(false);
    if (!r.ok) {
      setEnabled(!v); // revert
      setError(r.error ?? 'Could not save');
      return;
    }
    router.refresh();
  }

  async function toggleFeature(key: string, v: boolean) {
    if (!canManage) return;
    setFeatures((f) => ({ ...f, [key]: v })); // optimistic
    setBusy(true);
    setError(null);
    const r = await patchConfig({ tenant: tenantSlug, aiFeatures: { [key]: v } });
    setBusy(false);
    if (!r.ok) {
      setFeatures((f) => ({ ...f, [key]: !v })); // revert
      setError(r.error ?? 'Could not save');
      return;
    }
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
      <h2 className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
        AI features
      </h2>
      <p className="mt-1 text-sm text-[color:var(--color-text-dim)]">
        Turn AI on for this workspace and choose which features may use it. Your provider key is set above; the model is managed by the platform.
      </p>

      {error && (
        <div role="status" className="mt-3 rounded-lg border border-[color:var(--color-red)]/45 bg-[color:var(--color-red)]/10 px-3 py-2 text-sm text-[color:var(--color-red)]">
          {error}
        </div>
      )}

      {/* Master switch */}
      <div className="mt-4 flex items-center justify-between rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2.5">
        <div>
          <div className="text-sm font-medium text-[color:var(--color-text)]">Enable AI</div>
          <div className="text-xs text-[color:var(--color-text-faint)]">Master switch for every AI feature in this workspace.</div>
        </div>
        {canManage ? (
          <Toggle on={enabled} disabled={busy} onChange={toggleMaster} />
        ) : (
          <span className="text-xs text-[color:var(--color-text-faint)]">{enabled ? 'On' : 'Off'}</span>
        )}
      </div>

      {/* Per-feature toggles, grouped by area */}
      <div className={`mt-3 space-y-3 ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        {areas.map((area) => (
          <div key={area}>
            <div className="mb-1.5 text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">{area}</div>
            <div className="space-y-1.5">
              {AI_FEATURES.filter((f) => f.area === area).map((f) => (
                <div key={f.key} className="flex items-center gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[color:var(--color-text)]">{f.label}</div>
                    <div className="text-xs text-[color:var(--color-text-faint)]">{f.description}</div>
                  </div>
                  {canManage ? (
                    <Toggle on={isOn(f.key)} disabled={busy} onChange={(v) => toggleFeature(f.key, v)} />
                  ) : (
                    <span className="text-xs text-[color:var(--color-text-faint)]">{isOn(f.key) ? 'On' : 'Off'}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
