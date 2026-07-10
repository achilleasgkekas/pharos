'use client';

// Client "forgot password" form for (saas)/account/reset. POSTs { email } to
// api/saas/account/reset/request, which ALWAYS answers { ok: true } whether or not the address
// is registered (anti-enumeration, constant-time D6). So on any 2xx we show the same neutral
// "if that email exists, a link is on its way" confirmation — the UI must never reveal account
// existence. In dev with no mailer wired, the route echoes `devToken`; we surface a one-click
// confirm link so the local flow is testable.
import { useState, type FormEvent } from 'react';
import { resetRequestReady, describeRecoveryError, tokenLink } from './recoveryValidation';
import { isValidEmail } from './authValidation';

const INPUT_CLASS =
  'w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-text)] outline-none transition focus:border-[color:var(--color-accent)]';
const LABEL_CLASS = 'mb-1 block text-xs font-medium text-[color:var(--color-text-dim)]';

export function ResetRequestForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/saas/account/reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
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
      let token = '';
      try {
        token = (await res.json())?.devToken || '';
      } catch {
        /* no body → no dev token */
      }
      setDevToken(token);
      setSent(true);
    } catch {
      setError('Network error. Please try again');
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/10 px-3 py-2 text-sm text-[color:var(--color-text)]">
          If an account exists for that email, a password-reset link is on its way. Check your
          inbox (and spam folder).
        </p>
        {devToken && (
          <p className="rounded-lg border border-[color:var(--color-gold)]/40 bg-[color:var(--color-gold)]/10 px-3 py-2 text-xs text-[color:var(--color-text-dim)]">
            Dev mode (no mailer configured): continue with your{' '}
            <a
              href={tokenLink('/account/reset/confirm', devToken)}
              className="font-medium text-[color:var(--color-accent)] hover:underline"
            >
              reset link
            </a>
            .
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label className={LABEL_CLASS} htmlFor="reset-email">
          Email
        </label>
        <input
          id="reset-email"
          type="email"
          autoComplete="email"
          required
          className={INPUT_CLASS}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
        disabled={busy || !resetRequestReady(email)}
        className="w-full rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold text-[color:var(--color-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Please wait…' : 'Send reset link'}
      </button>
    </form>
  );
}
