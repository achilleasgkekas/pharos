'use client';

// Client "choose a new password" form for (saas)/account/reset/confirm. The token comes from
// the emailed link (?token=…, passed in from the server page). POSTs { token, newPassword } to
// api/saas/account/reset/confirm; on success it does a FULL navigation to the login page so the
// user signs in fresh with the new password (existing sessions are intentionally not
// force-expired server-side — the new hash takes effect on next login).
import { useState, type FormEvent } from 'react';
import {
  newPasswordError,
  resetConfirmReady,
  describeRecoveryError,
  MIN_PASSWORD,
} from './recoveryValidation';

const INPUT_CLASS =
  'w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-text)] outline-none transition focus:border-[color:var(--color-accent)]';
const LABEL_CLASS = 'mb-1 block text-xs font-medium text-[color:var(--color-text-dim)]';

export function ResetConfirmForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // The link itself is malformed — nothing to submit. Show a terminal message with a way back.
  if (!token.trim()) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-[color:var(--color-red)]/40 bg-[color:var(--color-red)]/10 px-3 py-2 text-sm text-[color:var(--color-red)]">
          This reset link is missing its token. Please request a new one.
        </p>
        <a
          href="/account/reset"
          className="block text-center text-sm font-medium text-[color:var(--color-accent)] hover:underline"
        >
          Request a new reset link
        </a>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    const pairError = newPasswordError(password, confirm);
    if (pairError) {
      setError(pairError);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/saas/account/reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (!res.ok) {
        let serverError: unknown;
        try {
          serverError = (await res.json())?.error;
        } catch {
          /* non-JSON → status fallback */
        }
        setError(describeRecoveryError(res.status, serverError));
        setBusy(false);
        return;
      }
      // Success: full navigation so the login page renders freshly with a signed-out session.
      window.location.assign('/account/login');
    } catch {
      setError('Network error. Please try again');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label className={LABEL_CLASS} htmlFor="reset-new-password">
          New password
        </label>
        <input
          id="reset-new-password"
          type="password"
          autoComplete="new-password"
          required
          className={INPUT_CLASS}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
        <p className="mt-1 text-xs text-[color:var(--color-text-faint)]">
          At least {MIN_PASSWORD} characters.
        </p>
      </div>

      <div>
        <label className={LABEL_CLASS} htmlFor="reset-confirm-password">
          Confirm new password
        </label>
        <input
          id="reset-confirm-password"
          type="password"
          autoComplete="new-password"
          required
          className={INPUT_CLASS}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={busy}
        />
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
        disabled={busy || !resetConfirmReady(token, password, confirm)}
        className="w-full rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold text-[color:var(--color-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Please wait…' : 'Set new password'}
      </button>
    </form>
  );
}
