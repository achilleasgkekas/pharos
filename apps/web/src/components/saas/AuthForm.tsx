'use client';

// Client auth form for the SaaS (saas)/login and (saas)/signup pages. One component, two
// modes: login POSTs { email, password } to api/saas/auth/login; signup POSTs
// { email, password, name?, workspace? } to api/saas/auth/signup. On success it does a FULL
// navigation (window.location.assign) to the sanitized `next` path so the fresh server render
// picks up the just-set httpOnly account cookie.
//
// Login-only second step (increment 83): when the account has MFA enabled, the login response
// is `{ mfaRequired: true }` instead of a session — no cookie is set yet, only a short-lived
// pending-MFA cookie the server already holds. This form then swaps to a code-entry step that
// POSTs { code } to api/saas/auth/mfa; only THAT call's success sets the real session cookie.
// "Use a different account" cancels the pending state (DELETE api/saas/auth/mfa) and returns to
// the credentials step. Signup never returns mfaRequired, so this step never triggers there.
//
// Validation reuses the pure helpers in authValidation.ts (in lockstep with the server policy).
// The API re-validates authoritatively — these checks only shape the UX (disable the button,
// surface the field error) before the round-trip.
import { useState, useEffect, type FormEvent } from 'react';
import {
  isValidEmail,
  loginReady,
  signupReady,
  describeAuthError,
  safeNextPath,
  MIN_PASSWORD,
} from './authValidation';
import { mfaLoginCodeReady, describeMfaError } from './mfaSettings';

type Mode = 'login' | 'signup';
type Step = 'credentials' | 'mfa';

const INPUT_CLASS =
  'w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-text)] outline-none transition focus:border-[color:var(--color-accent)]';

const LABEL_CLASS = 'mb-1 block text-xs font-medium text-[color:var(--color-text-dim)]';

export function AuthForm({
  mode,
  next,
  /** Private beta: the server decides, the form only renders what it is told. Resolved once
   *  on the page (server side) so the field cannot be hidden by editing client state — the
   *  API re-checks the code regardless. */
  betaGated = false,
}: {
  mode: Mode;
  next?: string;
  betaGated?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [workspace, setWorkspace] = useState('');
  // Private beta: only rendered when the server says signup is gated (see signupGate).
  const [betaCode, setBetaCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>('credentials');
  const [mfaCode, setMfaCode] = useState('');
  // Live availability of the chosen workspace address (its subdomain is permanent, so we check
  // before submit). Best-effort UX — the signup POST re-checks and 409s on a race.
  const [wsCheck, setWsCheck] = useState<{ status: 'idle' | 'checking' | 'done'; host?: string; available?: boolean; reason?: string }>({ status: 'idle' });

  const isSignup = mode === 'signup';
  const target = safeNextPath(next);
  const wsBlocked = isSignup && workspace.trim().length > 0 && wsCheck.status === 'done' && !wsCheck.available;
  // Signup also requires a workspace name (its subdomain is permanent) that is not a known-taken
  // address; a still-running or failed availability check does not hard-block (the server 409s).
  const ready = isSignup
    ? signupReady(email, password) && workspace.trim().length > 0 && !wsBlocked
    : loginReady(email, password);

  // Debounced availability check against the resolved subdomain.
  useEffect(() => {
    if (!isSignup) return;
    const q = workspace.trim();
    if (!q) {
      setWsCheck({ status: 'idle' });
      return;
    }
    setWsCheck({ status: 'checking' });
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/saas/auth/workspace-available?name=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { host?: string; available?: boolean; reason?: string };
        if (!cancelled) setWsCheck({ status: 'done', host: data.host, available: !!data.available, reason: data.reason });
      } catch {
        if (!cancelled) setWsCheck({ status: 'idle' }); // best-effort; the server still enforces
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [workspace, isSignup]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');

    // Front-stop: give a precise inline reason instead of a generic 400 round-trip.
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }
    if (isSignup && password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters`);
      return;
    }
    if (isSignup && !workspace.trim()) {
      setError('Choose a workspace name — it becomes your address');
      return;
    }
    if (wsBlocked) {
      setError('That workspace address is taken — pick a different workspace name');
      return;
    }

    setBusy(true);
    try {
      const endpoint = isSignup ? '/api/saas/auth/signup' : '/api/saas/auth/login';
      const body: Record<string, string> = { email: email.trim(), password };
      if (isSignup) {
        if (name.trim()) body.name = name.trim();
        if (workspace.trim()) body.workspace = workspace.trim();
        if (betaCode.trim()) body.code = betaCode.trim();
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      let data: { error?: unknown; mfaRequired?: boolean } = {};
      try {
        data = await res.json();
      } catch {
        /* non-JSON body → fall back to status below */
      }
      if (!res.ok) {
        setError(describeAuthError(res.status, data.error));
        setBusy(false);
        return;
      }
      if (!isSignup && data.mfaRequired) {
        // Password checked out, but a second factor is required — no session yet. Swap to the
        // code-entry step; the password field is no longer needed (or shown).
        setStep('mfa');
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

  async function onSubmitMfa(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/saas/auth/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: mfaCode.trim() }),
      });
      if (!res.ok) {
        let serverError: unknown;
        try {
          serverError = (await res.json())?.error;
        } catch {
          /* non-JSON body → fall back to status */
        }
        setError(describeMfaError(res.status, serverError));
        setBusy(false);
        return;
      }
      window.location.assign(target);
    } catch {
      setError('Network error. Please try again');
      setBusy(false);
    }
  }

  async function useDifferentAccount() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/saas/auth/mfa', { method: 'DELETE' });
    } catch {
      /* best-effort — the pending cookie also just expires on its own */
    }
    setStep('credentials');
    setPassword('');
    setMfaCode('');
    setError('');
    setBusy(false);
  }

  if (step === 'mfa') {
    return (
      <form onSubmit={onSubmitMfa} className="space-y-4" noValidate>
        <div>
          <label className={LABEL_CLASS} htmlFor="auth-mfa-code">
            Two-factor code
          </label>
          <input
            id="auth-mfa-code"
            type="text"
            inputMode="text"
            autoComplete="one-time-code"
            autoFocus
            className={INPUT_CLASS}
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            disabled={busy}
            placeholder="123456 or a recovery code"
          />
          <p className="mt-1 text-xs text-[color:var(--color-text-faint)]">
            Enter the 6-digit code from your authenticator app, or one of your recovery codes.
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
          disabled={busy || !mfaLoginCodeReady(mfaCode)}
          className="w-full rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold text-[color:var(--color-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Verifying…' : 'Verify'}
        </button>

        <button
          type="button"
          onClick={useDifferentAccount}
          disabled={busy}
          className="w-full text-center text-xs text-[color:var(--color-text-dim)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          Use a different account
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {isSignup && (
        <div>
          <label className={LABEL_CLASS} htmlFor="auth-name">
            Name <span className="text-[color:var(--color-text-faint)]">(optional)</span>
          </label>
          <input
            id="auth-name"
            type="text"
            autoComplete="name"
            className={INPUT_CLASS}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </div>
      )}

      <div>
        <label className={LABEL_CLASS} htmlFor="auth-email">
          Email
        </label>
        <input
          id="auth-email"
          type="email"
          autoComplete="email"
          required
          className={INPUT_CLASS}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
      </div>

      <div>
        <label className={LABEL_CLASS} htmlFor="auth-password">
          Password
        </label>
        <input
          id="auth-password"
          type="password"
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          required
          className={INPUT_CLASS}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
        {isSignup && (
          <p className="mt-1 text-xs text-[color:var(--color-text-faint)]">
            At least {MIN_PASSWORD} characters.
          </p>
        )}
      </div>

      {isSignup && betaGated && (
        <div>
          <label className={LABEL_CLASS} htmlFor="auth-beta-code">
            Invite code
          </label>
          <input
            id="auth-beta-code"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="YOUR-CODE"
            className={`${INPUT_CLASS} font-mono uppercase tracking-wider`}
            value={betaCode}
            onChange={(e) => setBetaCode(e.target.value)}
            disabled={busy}
          />
          <p className="mt-1 text-xs text-[color:var(--color-text-faint)]">
            Pharos is in private beta. If you were invited by email, open that link instead — it
            needs no code.
          </p>
        </div>
      )}

      {isSignup && (
        <div>
          <label className={LABEL_CLASS} htmlFor="auth-workspace">
            Workspace name{' '}
            <span className="text-[color:var(--color-text-faint)]">(becomes your address)</span>
          </label>
          <input
            id="auth-workspace"
            type="text"
            autoComplete="organization"
            className={INPUT_CLASS}
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
            disabled={busy}
            placeholder="My Household"
          />
          {workspace.trim() && (
            <p className="mt-1 text-xs" role="status">
              {wsCheck.status === 'checking' && (
                <span className="text-[color:var(--color-text-faint)]">Checking availability…</span>
              )}
              {wsCheck.status === 'done' && wsCheck.reason === 'empty' && (
                <span className="text-[color:var(--color-text-faint)]">Use letters or numbers for the address.</span>
              )}
              {wsCheck.status === 'done' && wsCheck.available && (
                <span className="text-[color:var(--color-accent)]">
                  <span className="font-mono">{wsCheck.host}</span> is available ✓
                </span>
              )}
              {wsCheck.status === 'done' && !wsCheck.available && wsCheck.reason === 'taken' && (
                <span className="text-[color:var(--color-red)]">
                  <span className="font-mono">{wsCheck.host}</span> is taken — try another
                </span>
              )}
              {wsCheck.status === 'done' && !wsCheck.available && wsCheck.reason === 'reserved' && (
                <span className="text-[color:var(--color-red)]">That name is reserved — try another</span>
              )}
            </p>
          )}
          <p className="mt-1 text-[11px] text-[color:var(--color-text-faint)]">
            This becomes your permanent workspace address and can’t be changed later.
          </p>
        </div>
      )}

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
        disabled={busy || !ready}
        className="w-full rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold text-[color:var(--color-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
      </button>
    </form>
  );
}
