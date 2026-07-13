'use client';

// Superadmin WRITE panel for the workspace DETAIL page (/admin/tenants/[slug]) — the one
// mutation surface on the console (increment 63, following the erasure/members panel idiom).
// Consumes the already-built PATCH /api/saas/admin/tenants/[slug] (status and/or plan override).
// Deliberately narrow: lifecycle status flips (suspend/reactivate/cancel) + a plan override,
// nothing destructive (no membership mutation, no data drop — those stay manual/gated). Every
// write is server-audited to the workspace's own Activity trail. Only ever mounted inside the
// SAAS_MODE + superadmin gated /admin segment, so it never exists in the self-hosted build.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const PLAN_OPTIONS = ['free', 'shared', 'dedicated'] as const;

type Props = {
  slug: string;
  status: string;
  plan: string;
};

async function patchTenant(
  slug: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; error: string | null }> {
  let res: Response;
  try {
    res = await fetch(`/api/saas/admin/tenants/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: 'Network error. Check your connection and try again.' };
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON body — fall through to a generic message.
  }
  if (!res.ok) {
    return { ok: false, error: typeof data.error === 'string' ? data.error : 'Request failed.' };
  }
  return { ok: true, error: null };
}

export function TenantActionsPanel({ slug, status, plan }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState(plan || 'free');

  async function setStatus(next: string, confirmMsg?: string) {
    if (busy) return;
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(next);
    setError(null);
    setNotice(null);
    const { ok, error: err } = await patchTenant(slug, { status: next });
    setBusy(null);
    if (!ok) return setError(err);
    setNotice(`Status set to "${next}".`);
    router.refresh();
  }

  async function applyPlan() {
    if (busy || selectedPlan === plan) return;
    if (!window.confirm(`Change this workspace's plan from "${plan}" to "${selectedPlan}"?`)) return;
    setBusy('plan');
    setError(null);
    setNotice(null);
    const { ok, error: err } = await patchTenant(slug, { plan: selectedPlan });
    setBusy(null);
    if (!ok) return setError(err);
    setNotice(`Plan set to "${selectedPlan}".`);
    router.refresh();
  }

  const canSuspend = status !== 'suspended';
  const canReactivate = status === 'suspended' || status === 'canceled';
  const canCancel = status !== 'canceled';

  return (
    <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
      <h2 className="mb-2 text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
        Operator actions
      </h2>
      <p className="mb-3 text-xs text-[color:var(--color-text-dim)]">
        Manual overrides. Every change here is written to this workspace&apos;s own Activity trail.
      </p>

      {error && (
        <div
          role="status"
          className="mb-3 rounded-lg border border-[color:var(--color-red)]/45 bg-[color:var(--color-red)]/10 px-3 py-2 text-sm text-[color:var(--color-red)]"
        >
          {error}
        </div>
      )}
      {notice && !error && (
        <div
          role="status"
          className="mb-3 rounded-lg border border-[color:var(--color-accent)]/45 bg-[color:var(--color-accent)]/10 px-3 py-2 text-sm text-[color:var(--color-accent)]"
        >
          {notice}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canSuspend || busy !== null}
          onClick={() =>
            setStatus(
              'suspended',
              'Suspend this workspace? Members will lose access until it is reactivated.'
            )
          }
          className="rounded-lg border border-[color:var(--color-red)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-red)] hover:bg-[color:var(--color-red)]/10 disabled:opacity-40"
        >
          {busy === 'suspended' ? 'Suspending…' : 'Suspend'}
        </button>
        <button
          type="button"
          disabled={!canReactivate || busy !== null}
          onClick={() => setStatus('active')}
          className="rounded-lg border border-[color:var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/10 disabled:opacity-40"
        >
          {busy === 'active' ? 'Reactivating…' : 'Reactivate'}
        </button>
        <button
          type="button"
          disabled={!canCancel || busy !== null}
          onClick={() =>
            setStatus('canceled', 'Cancel this workspace? This marks it canceled (not deleted).')
          }
          className="rounded-lg border border-[color:var(--color-border-light)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-text-dim)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-40"
        >
          {busy === 'canceled' ? 'Canceling…' : 'Cancel'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[color:var(--color-border)] pt-3">
        <label className="text-[10px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
          Plan
        </label>
        <select
          value={selectedPlan}
          onChange={(e) => setSelectedPlan(e.target.value)}
          disabled={busy !== null}
          className="rounded-lg border border-[color:var(--color-border-light)] bg-[color:var(--color-surface-2)] px-2 py-1.5 text-xs capitalize text-[color:var(--color-text)] disabled:opacity-40"
        >
          {PLAN_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={applyPlan}
          disabled={busy !== null || selectedPlan === plan}
          className="rounded-lg border border-[color:var(--color-cyan)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-cyan)] hover:bg-[color:var(--color-cyan)]/10 disabled:opacity-40"
        >
          {busy === 'plan' ? 'Applying…' : 'Change plan'}
        </button>
      </div>
    </section>
  );
}
