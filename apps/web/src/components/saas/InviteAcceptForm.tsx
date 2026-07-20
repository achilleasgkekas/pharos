'use client';

// Client form for accepting a workspace invitation, rendered by (saas)/signup?invite=… (the
// signup page already resolved + previewed the token server-side before mounting this — see
// that page for the "invalid/expired" terminal state, which never reaches here).
//
// POSTs { token, password?, name? } to api/saas/invites/accept. Password is OPTIONAL: an
// invitee who already has a Pharos account for the invited email needs none (the route only
// requires one when it has to create the account, and reports that via `password_required` if
// the client guessed wrong). UNAUTHENTICATED by design, same as the route — works whether or
// not the browser currently holds a session for a different account. On success it does a FULL
// navigation (window.location.assign) so the fresh server render picks up the new session
// cookie, mirroring AuthForm/ResetConfirmForm.
import { useState, type FormEvent } from 'react';
import { inviteAcceptReady, MIN_PASSWORD } from './inviteAccept';
import { describeRecoveryError } from './recoveryValidation';
import { safeNextPath } from './authValidation';

const INPUT_CLASS =
  'w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-text)] outline-none transition focus:border-[color:var(--color-accent)]';
const LABEL_CLASS = 'mb-1 block text-xs font-medium text-[color:var(--color-text-dim)]';

export function InviteAcceptForm({ token, next }: { token: string; next?: string }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const target = safeNextPath(next, '/account');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');

    if (!inviteAcceptReady(password)) {
      setError(`Password must be at least ${MIN_PASSWORD} characters`);
      return;
    }

    setBusy(true);
    try {
      const body: Record<string, string> = { token };
      if (password) body.password = password;
      if (name.trim()) body.name = name.trim();
      const res = await fetch('/api/saas/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let serverError: unknown;
        try {
          serverError = (await res.json())?.error;
        } catch {
          /* non-JSON body → fall back to status */
        }
        setError(describeRecoveryError(res.status, serverError));
        setBusy(false);
        return;
      }
      // Success: full navigation so the new session cookie is applied on the server render.
      window.location.assign(target);
    } catch {
      setError('Network error. Please try again');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label className={LABEL_CLASS} htmlFor="invite-name">
          Name <span className="text-[color:var(--color-text-faint)]">(optional)</span>
        </label>
        <input
          id="invite-name"
          type="text"
          autoComplete="name"
          className={INPUT_CLASS}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
      </div>

      <div>
        <label className={LABEL_CLASS} htmlFor="invite-password">
          Password{' '}
          <span className="text-[color:var(--color-text-faint)]">
            (leave blank if you already have a Pharos account)
          </span>
        </label>
        <input
          id="invite-password"
          type="password"
          autoComplete="new-password"
          className={INPUT_CLASS}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
        <p className="mt-1 text-xs text-[color:var(--color-text-faint)]">
          If you're new here, set one now (at least {MIN_PASSWORD} characters).
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-[color:var(--color-red)]/40 bg-[color:var(--color-red)]/10 px-3 py-2 text-sm text-[color:var(--color-red)]"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !inviteAcceptReady(password)}
        className="w-full rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold text-[color:var(--color-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Please wait…' : 'Join workspace'}
      </button>
    </form>
  );
}
