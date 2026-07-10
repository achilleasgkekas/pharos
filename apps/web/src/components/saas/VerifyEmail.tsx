'use client';

// Client email-verification panel for (saas)/account/verify. Two entry points:
//   • With a token (clicked from the inbox link, ?token=… passed from the server page): it
//     auto-POSTs { token } to api/saas/account/verify/confirm on mount and reports the outcome.
//     The confirm route is UNAUTHENTICATED — the token itself proves ownership.
//   • Without a token: it prompts. If the viewer is signed in, a "Resend" button POSTs to
//     api/saas/account/verify/request (AUTHENTICATED, targets the caller's own email); in dev
//     with no mailer the route echoes `devToken`, surfaced here as a one-click link.
import { useEffect, useRef, useState } from 'react';
import { describeRecoveryError, tokenLink } from './recoveryValidation';

type Phase = 'idle' | 'confirming' | 'success' | 'error';

export function VerifyEmail({ token, loggedIn }: { token: string; loggedIn: boolean }) {
  const trimmed = token.trim();
  const [phase, setPhase] = useState<Phase>(trimmed ? 'confirming' : 'idle');
  const [error, setError] = useState('');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [devToken, setDevToken] = useState('');
  const ranRef = useRef(false);

  useEffect(() => {
    if (!trimmed || ranRef.current) return;
    ranRef.current = true; // guard React 18 double-invoke in dev/StrictMode
    (async () => {
      try {
        const res = await fetch('/api/saas/account/verify/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: trimmed }),
        });
        if (!res.ok) {
          let serverError: unknown;
          try {
            serverError = (await res.json())?.error;
          } catch {
            /* non-JSON → status fallback */
          }
          setError(describeRecoveryError(res.status, serverError));
          setPhase('error');
          return;
        }
        setPhase('success');
      } catch {
        setError('Network error. Please try again');
        setPhase('error');
      }
    })();
  }, [trimmed]);

  async function resend() {
    if (resending) return;
    setError('');
    setResending(true);
    try {
      const res = await fetch('/api/saas/account/verify/request', { method: 'POST' });
      if (!res.ok) {
        let serverError: unknown;
        try {
          serverError = (await res.json())?.error;
        } catch {
          /* non-JSON → status fallback */
        }
        setError(describeRecoveryError(res.status, serverError));
        setResending(false);
        return;
      }
      let echoed = '';
      try {
        echoed = (await res.json())?.devToken || '';
      } catch {
        /* no body → no dev token */
      }
      setDevToken(echoed);
      setResent(true);
    } catch {
      setError('Network error. Please try again');
    } finally {
      setResending(false);
    }
  }

  if (phase === 'confirming') {
    return (
      <p className="text-sm text-[color:var(--color-text-dim)]">Confirming your email…</p>
    );
  }

  if (phase === 'success') {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/10 px-3 py-2 text-sm text-[color:var(--color-text)]">
          Your email is verified. Thanks!
        </p>
        <a
          href="/account/workspace"
          className="block text-center text-sm font-medium text-[color:var(--color-accent)] hover:underline"
        >
          Go to your workspace
        </a>
      </div>
    );
  }

  // idle (no token) or error (bad/expired token) — both offer a resend when signed in.
  return (
    <div className="space-y-4">
      {phase === 'error' ? (
        <p
          role="alert"
          className="rounded-lg border border-[color:var(--color-red)]/40 bg-[color:var(--color-red)]/10 px-3 py-2 text-sm text-[color:var(--color-red)]"
        >
          {error}
        </p>
      ) : (
        <p className="text-sm text-[color:var(--color-text-dim)]">
          Verify your email to secure your account.
        </p>
      )}

      {resent ? (
        <div className="space-y-3">
          <p className="rounded-lg border border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/10 px-3 py-2 text-sm text-[color:var(--color-text)]">
            A fresh verification link is on its way. Check your inbox.
          </p>
          {devToken && (
            <p className="rounded-lg border border-[color:var(--color-gold)]/40 bg-[color:var(--color-gold)]/10 px-3 py-2 text-xs text-[color:var(--color-text-dim)]">
              Dev mode (no mailer configured): confirm with your{' '}
              <a
                href={tokenLink('/account/verify', devToken)}
                className="font-medium text-[color:var(--color-accent)] hover:underline"
              >
                verification link
              </a>
              .
            </p>
          )}
        </div>
      ) : loggedIn ? (
        <button
          type="button"
          onClick={resend}
          disabled={resending}
          className="w-full rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold text-[color:var(--color-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resending ? 'Please wait…' : 'Resend verification email'}
        </button>
      ) : (
        <a
          href="/account/login?next=/account/verify"
          className="block text-center text-sm font-medium text-[color:var(--color-accent)] hover:underline"
        >
          Sign in to resend a verification link
        </a>
      )}
    </div>
  );
}
