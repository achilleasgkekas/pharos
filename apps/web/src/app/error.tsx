'use client';
import { useEffect } from 'react';
import { RotateCw, RefreshCw } from 'lucide-react';
import { reportClientError } from '@/lib/clientErrorReporting';

// Root error boundary — catches render/data errors AND uncaught Server Action
// failures in any route segment.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // A redeploy (or a Docker rebuild while a tab stayed open) leaves the browser with
  // a stale JS bundle whose Server Action IDs no longer exist on the server. The only
  // real recovery is a FULL reload to fetch the new bundle — `reset()` re-renders the
  // same stale code and won't help. Detect that class of error and lead with Reload.
  const msg = error?.message || '';
  const isStaleDeploy =
    /server action|failed to find|connection closed|loading chunk|chunkloaderror|fetch failed|failed to fetch|unexpected response|deployment/i.test(
      msg
    );

  useEffect(() => {
    console.error('[route error]', error);
    // Stale-deploy errors are expected after every release and self-heal by reloading: not a bug.
    if (!isStaleDeploy) reportClientError(error);
    // Auto-recover stale-deploy errors: silently reload to fetch the new bundle so the
    // user never sees an "application error". Guard against a reload loop with a
    // short-lived flag (if the error recurs within 15s we stop and show the button).
    if (isStaleDeploy && typeof window !== 'undefined') {
      try {
        const last = Number(sessionStorage.getItem('stale-reload-at') || 0);
        if (Date.now() - last > 15000) {
          sessionStorage.setItem('stale-reload-at', String(Date.now()));
          window.location.reload();
        }
      } catch {
        /* sessionStorage blocked — fall through to the manual button */
      }
    }
  }, [error, isStaleDeploy]);

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-24 text-center">
      <p className="text-5xl mb-4">{isStaleDeploy ? '🔄' : '⚠️'}</p>
      <h1 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
        {isStaleDeploy ? 'The app was updated' : 'Something went wrong'}
      </h1>
      <p className="text-sm text-[color:var(--color-text-dim)] max-w-md mx-auto mb-6 break-words">
        {isStaleDeploy
          ? 'This tab was loaded before the latest update. Reload to get the new version and continue.'
          : msg || 'Unexpected error while loading this page.'}
        {!isStaleDeploy && error.digest && (
          <span className="block mt-1 text-[10px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
            ref: {error.digest}
          </span>
        )}
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[color:var(--color-accent)] text-black text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <RefreshCw size={15} /> Reload page
        </button>
        {!isStaleDeploy && (
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] text-sm font-semibold hover:text-[color:var(--color-text)] transition-colors"
          >
            <RotateCw size={15} /> Try again
          </button>
        )}
      </div>
    </main>
  );
}
