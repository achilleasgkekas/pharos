'use client';

// "Create another workspace" control for the /account landing page. An already-signed-in
// Account can own more than one Tenant (household + a side project, say); this lets it
// provision a new one without signing out and re-running the signup form. Collapsed by
// default behind a toggle button so it doesn't crowd the (usual) single-or-zero-workspace
// case; the toggle starts open when `autoOpen` is set (the empty state, where there is
// nothing else to do on this page).
//
// POSTs to /api/saas/account/workspaces, then a FULL navigation into the new workspace (same
// idiom as AuthForm/SignOutButton) so the fresh server render picks up the account's now-
// larger membership list.
import { useState, type FormEvent } from 'react';
import { workspaceNameReady, describeCreateWorkspaceError, MAX_WORKSPACE_NAME } from './createWorkspace';

export function CreateWorkspaceForm({ autoOpen = false }: { autoOpen?: boolean }) {
  const [open, setOpen] = useState(autoOpen);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');

    if (!workspaceNameReady(name)) {
      setError(
        name.trim().length > MAX_WORKSPACE_NAME
          ? `Keep the name under ${MAX_WORKSPACE_NAME} characters`
          : 'A workspace name is required'
      );
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/saas/account/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(describeCreateWorkspaceError(res.status, data?.error));
        setBusy(false);
        return;
      }
      const slug = data?.tenant?.slug;
      window.location.assign(slug ? `/account/workspace?w=${encodeURIComponent(slug)}` : '/account/workspace');
    } catch {
      setError('Network error. Please try again');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-[color:var(--color-text-dim)] transition-colors hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-accent)]"
      >
        + New workspace
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-2">
      <div className="min-w-0 flex-1">
        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Workspace name, e.g. My Household"
          maxLength={MAX_WORKSPACE_NAME}
          disabled={busy}
          className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-text)] placeholder:text-[color:var(--color-text-faint)] outline-none focus:border-[color:var(--color-accent)]"
        />
        {error && (
          <p role="alert" className="mt-1.5 text-xs text-[color:var(--color-red)]">
            {error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold text-[color:var(--color-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Creating…' : 'Create'}
      </button>
      {!autoOpen && (
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError('');
            setName('');
          }}
          disabled={busy}
          className="px-2 py-2 text-sm text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] disabled:opacity-50"
        >
          Cancel
        </button>
      )}
    </form>
  );
}
