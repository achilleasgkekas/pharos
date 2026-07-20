'use client';

// Client interactivity for the owner-only "Delete workspace" (GDPR Art. 17 right-to-erasure)
// danger-zone section (workspace settings page). Consumes:
//   POST   /api/saas/workspace/erasure — schedule permanent deletion after the grace window
//   DELETE /api/saas/workspace/erasure — cancel a pending erasure within the grace window
// (GET is not called from here — the page server-reads the initial state via `erasureView`,
// same idiom as AiKeyPanel's `initialKey`, so the first paint needs no client fetch.)
//
// This only ever stamps/clears a REVERSIBLE marker on the Tenant doc — the actual destructive
// drop of the tenant's data happens later via a separate, gated purge job, never from this panel
// (see lib/tenancy/erasure.ts's module docstring). Owner-only (mirrors `canEraseWorkspace`); a
// sibling to WorkspaceSettingsPanel's cancel/reactivate danger zone but a distinct, more severe
// action, so it gets its own bordered section rather than being folded into that one. Same
// fetch/refresh idiom as WorkspaceSettingsPanel/AiKeyPanel. Only ever mounted inside the
// SAAS_MODE-gated (saas) segment.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ErasureView } from '@/lib/tenancy/erasure';
import { describeErasureError, describeErasureCountdown } from './erasureSettings';

type Props = {
  tenantSlug: string;
  /** Owner only — mirrors `canEraseWorkspace`. Renders nothing for admin/member viewers. */
  isOwner: boolean;
  graceDays: number;
  initial: ErasureView;
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

export function ErasurePanel({ tenantSlug, isOwner, graceDays, initial }: Props) {
  const router = useRouter();
  const [erasure, setErasure] = useState<ErasureView>(initial);
  const [busy, setBusy] = useState<'request' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOwner) return null;

  async function requestErasure() {
    if (busy) return;
    if (
      !window.confirm(
        `Schedule this workspace for permanent deletion in ${graceDays} days? Every member will lose access and all data will be erased. You can cancel any time before then.`
      )
    ) {
      return;
    }
    setBusy('request');
    setError(null);
    const { ok, status, data } = await callJson('/api/saas/workspace/erasure', 'POST', {
      tenant: tenantSlug,
    });
    setBusy(null);
    if (!ok) {
      setError(describeErasureError(status, data.error));
      return;
    }
    setErasure(data.erasure as ErasureView);
    router.refresh();
  }

  async function cancelErasure() {
    if (busy) return;
    setBusy('cancel');
    setError(null);
    const { ok, status, data } = await callJson(
      `/api/saas/workspace/erasure?tenant=${encodeURIComponent(tenantSlug)}`,
      'DELETE'
    );
    setBusy(null);
    if (!ok) {
      setError(describeErasureError(status, data.error));
      return;
    }
    setErasure(data.erasure as ErasureView);
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-[color:var(--color-red)]/30 bg-[color:var(--color-surface)] p-5">
      <h2 className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-red)]">
        Delete workspace
      </h2>
      <div className="mt-3 space-y-3">
        {error && (
          <div
            role="status"
            className="rounded-lg border border-[color:var(--color-red)]/45 bg-[color:var(--color-red)]/10 px-3 py-2 text-sm text-[color:var(--color-red)]"
          >
            {error}
          </div>
        )}
        {erasure.requested ? (
          <>
            <p className="text-sm text-[color:var(--color-text-dim)]">
              Permanent deletion is scheduled ({describeErasureCountdown(erasure.graceDaysLeft)}).
              Every member will permanently lose access and all data will be erased once the
              window closes.
            </p>
            <button
              type="button"
              onClick={cancelErasure}
              disabled={busy !== null}
              className="rounded-lg border border-[color:var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/10 disabled:opacity-40"
            >
              {busy === 'cancel' ? 'Canceling…' : 'Cancel deletion'}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-[color:var(--color-text-dim)]">
              Permanently delete this workspace and every member&apos;s data. There is a{' '}
              {graceDays}-day grace window to change your mind before anything is erased.
            </p>
            <button
              type="button"
              onClick={requestErasure}
              disabled={busy !== null}
              className="rounded-lg border border-[color:var(--color-red)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-red)] hover:bg-[color:var(--color-red)]/10 disabled:opacity-40"
            >
              {busy === 'request' ? 'Scheduling…' : 'Delete workspace'}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
