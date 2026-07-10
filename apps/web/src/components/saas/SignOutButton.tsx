'use client';

// Small client sign-out control for the SaaS workspace-settings header. POSTs to
// `/api/saas/auth/logout` (which clears the httpOnly account cookie and returns JSON), then
// does a full navigation to the login page so the fresh server render sees the cleared cookie.
// A plain <form> POST would strand the user on the route's JSON body, so this is a client
// component. Only ever mounted inside the SAAS_MODE-gated (saas) segment.
import { useState } from 'react';

export function SignOutButton() {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/saas/auth/logout', { method: 'POST' });
    } catch {
      // Ignore — navigate to login regardless; the middleware/page gate will re-check auth.
    }
    window.location.assign('/account/login');
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="text-xs font-mono uppercase tracking-wider text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] disabled:opacity-50"
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
