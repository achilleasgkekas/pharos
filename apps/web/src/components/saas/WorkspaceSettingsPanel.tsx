'use client';

// Client interactivity for the user-facing workspace "Settings" panel
// ((saas)/account/workspace/settings). Consumes three already-built control-plane routes that
// had zero UI until now:
//   PATCH  /api/saas/workspace             — rename the display name (owner/admin)
//   DELETE /api/saas/workspace             — soft-cancel the workspace (owner only)
//   POST   /api/saas/workspace/reactivate  — reverse a soft-cancel (owner only)
// The page server-renders the initial name/status; every mutation here calls the route with
// the chosen workspace slug (so `?w=` stays correct) and then router.refresh() so the server
// re-reads the source of truth, same idiom as MembersPanel/TenantActionsPanel. Only ever
// mounted inside the SAAS_MODE-gated (saas) segment.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MAX_WORKSPACE_NAME } from '@/lib/tenancy/workspace';
import { workspaceRenameReady, describeWorkspaceSettingsError } from './workspaceSettings';

type Props = {
  tenantSlug: string;
  slug: string;
  name: string;
  status: string;
  /** Owner or admin — may rename. Mirrors the PATCH route's requireManage gate. */
  canManage: boolean;
  /** Owner only — may cancel/reactivate. Mirrors canCancelWorkspace/canReactivateWorkspace. */
  isOwner: boolean;
};

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

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
    // Non-JSON body (shouldn't happen for these routes) — keep an empty object.
  }
  return { ok: res.ok, status: res.status, data };
}

export function WorkspaceSettingsPanel({ tenantSlug, slug, name, status, canManage, isOwner }: Props) {
  const router = useRouter();
  const [nameInput, setNameInput] = useState(name);
  const [currentName, setCurrentName] = useState(name);
  const [currentStatus, setCurrentStatus] = useState(status);
  const [busy, setBusy] = useState<'save' | 'cancel' | 'reactivate' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canSave = canManage && workspaceRenameReady(nameInput, currentName) && busy === null;

  async function saveName() {
    if (!canSave) return;
    setBusy('save');
    setError(null);
    setNotice(null);
    const { ok, status: httpStatus, data } = await callJson('/api/saas/workspace', 'PATCH', {
      name: nameInput,
      tenant: tenantSlug,
    });
    setBusy(null);
    if (!ok) {
      setError(describeWorkspaceSettingsError(httpStatus, data.error));
      return;
    }
    const updated =
      (data.workspace as { name?: string } | undefined)?.name?.trim() || nameInput.trim();
    setCurrentName(updated);
    setNameInput(updated);
    setNotice('Workspace renamed.');
    router.refresh();
  }

  async function cancelWorkspace() {
    if (busy) return;
    if (
      !window.confirm(
        'Cancel this workspace? Every member will lose access until it is reactivated.'
      )
    ) {
      return;
    }
    setBusy('cancel');
    setError(null);
    setNotice(null);
    const { ok, status: httpStatus, data } = await callJson(
      `/api/saas/workspace?tenant=${encodeURIComponent(tenantSlug)}`,
      'DELETE'
    );
    setBusy(null);
    if (!ok) {
      setError(describeWorkspaceSettingsError(httpStatus, data.error));
      return;
    }
    setCurrentStatus('canceled');
    setNotice('Workspace canceled.');
    router.refresh();
  }

  async function reactivateWorkspace() {
    if (busy) return;
    setBusy('reactivate');
    setError(null);
    setNotice(null);
    const { ok, status: httpStatus, data } = await callJson(
      '/api/saas/workspace/reactivate',
      'POST',
      { tenant: tenantSlug }
    );
    setBusy(null);
    if (!ok) {
      setError(describeWorkspaceSettingsError(httpStatus, data.error));
      return;
    }
    setCurrentStatus('active');
    setNotice('Workspace reactivated.');
    router.refresh();
  }

  const isActive = ACTIVE_STATUSES.has(currentStatus);
  const isCanceled = currentStatus === 'canceled';

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="status"
          className="rounded-lg border border-[color:var(--color-red)]/45 bg-[color:var(--color-red)]/10 px-3 py-2 text-sm text-[color:var(--color-red)]"
        >
          {error}
        </div>
      )}
      {notice && !error && (
        <div
          role="status"
          className="rounded-lg border border-[color:var(--color-accent)]/45 bg-[color:var(--color-accent)]/10 px-3 py-2 text-sm text-[color:var(--color-accent)]"
        >
          {notice}
        </div>
      )}

      <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
        <h2 className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)]">
          General
        </h2>
        <div className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="text-[color:var(--color-text-dim)]">Workspace name</span>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={MAX_WORKSPACE_NAME}
              disabled={!canManage || busy !== null}
              className="mt-1 w-full max-w-sm rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-text)] disabled:opacity-60"
            />
          </label>
          {canManage ? (
            <button
              type="button"
              onClick={saveName}
              disabled={!canSave}
              className="rounded-lg border border-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/10 disabled:opacity-40"
            >
              {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
          ) : (
            <p className="text-xs text-[color:var(--color-text-faint)]">
              Only an owner or admin can rename this workspace.
            </p>
          )}
          <p className="text-xs text-[color:var(--color-text-faint)]">
            Slug <span className="font-mono">{slug}</span> is permanent and cannot be changed.
          </p>
        </div>
      </section>

      {isOwner && (
        <section className="rounded-2xl border border-[color:var(--color-red)]/30 bg-[color:var(--color-surface)] p-5">
          <h2 className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-red)]">
            Danger zone
          </h2>
          <div className="mt-3">
            {isActive && (
              <>
                <p className="text-sm text-[color:var(--color-text-dim)]">
                  Cancelling blocks access for every member. You can reactivate it later.
                </p>
                <button
                  type="button"
                  onClick={cancelWorkspace}
                  disabled={busy !== null}
                  className="mt-3 rounded-lg border border-[color:var(--color-red)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-red)] hover:bg-[color:var(--color-red)]/10 disabled:opacity-40"
                >
                  {busy === 'cancel' ? 'Canceling…' : 'Cancel workspace'}
                </button>
              </>
            )}
            {isCanceled && (
              <>
                <p className="text-sm text-[color:var(--color-text-dim)]">
                  This workspace is canceled. Reactivate it to restore access for every member.
                </p>
                <button
                  type="button"
                  onClick={reactivateWorkspace}
                  disabled={busy !== null}
                  className="mt-3 rounded-lg border border-[color:var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-accent)] hover:bg-[color:var(--color-accent)]/10 disabled:opacity-40"
                >
                  {busy === 'reactivate' ? 'Reactivating…' : 'Reactivate workspace'}
                </button>
              </>
            )}
            {!isActive && !isCanceled && (
              <p className="text-sm text-[color:var(--color-text-dim)]">
                Status is <span className="font-mono">{currentStatus}</span>. This is a billing
                hold managed from the Billing tab, not a manual flip.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
