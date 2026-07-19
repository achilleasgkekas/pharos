'use client';

// "Leave workspace" control on each card of the /account chooser (multi-workspace state).
// Self-service — the caller removes their OWN membership, no owner/admin approval needed
// (unlike the members-tab remove action, which is an owner/admin acting on someone else).
// A native `confirm()` guards the irreversible click (no custom modal — same lightweight
// idiom the rest of the SaaS UI uses for destructive one-offs).
//
// DELETEs /api/saas/account/workspaces, then a FULL navigation back to /account (same idiom
// as CreateWorkspaceForm/SignOutButton) so the fresh server render reflects the now-smaller
// membership list — the just-left workspace no longer appears, or the empty state shows if
// it was the last one.
import { useState } from 'react';
import { describeLeaveWorkspaceError } from './leaveWorkspace';

export function LeaveWorkspaceButton({ slug, name }: { slug: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onLeave(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    if (!window.confirm(`Leave "${name || slug}"? You will need a new invite to rejoin.`)) return;

    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/saas/account/workspaces', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant: slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(describeLeaveWorkspaceError(res.status, data?.error));
        setBusy(false);
        return;
      }
      window.location.assign('/account');
    } catch {
      setError('Network error. Please try again');
      setBusy(false);
    }
  }

  return (
    <div className="mt-1 flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onLeave}
        disabled={busy}
        className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--color-text-faint)] transition-colors hover:text-[color:var(--color-red)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Leaving…' : 'Leave'}
      </button>
      {error && (
        <p role="alert" className="max-w-[12rem] text-right text-[11px] text-[color:var(--color-red)]">
          {error}
        </p>
      )}
    </div>
  );
}
