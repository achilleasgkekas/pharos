'use client';

import { useEffect } from 'react';
import { PharosMark } from './components/PharosMark';
import { GithubLink } from './components/GithubLink';

/**
 * Branded error boundary for the landing site. Next.js App Router requires this
 * to be a client component; it receives the thrown `error` plus a `reset()` to
 * re-render the segment. Mirrors the not-found.tsx brand idiom (PharosMark +
 * gradient headline + reused .btn classes) but adds a recovery action the
 * static 404 cannot offer. No globals.css change: reuses existing classes.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error to the console so it is not swallowed silently.
    console.error('Landing page error:', error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '80px 0',
      }}
    >
      <div className="container" style={{ maxWidth: 620 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <PharosMark size={64} />
        </div>

        <p className="mono" style={{ marginBottom: 18 }}>
          Error · the beacon flickered
        </p>

        <h1 style={{ fontSize: 'clamp(2.4rem, 6vw, 4rem)', fontWeight: 800, marginBottom: 20 }}>
          Something{' '}
          <span
            style={{
              background: 'linear-gradient(90deg, var(--accent), var(--cyan), var(--purple))',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            went dark.
          </span>
        </h1>

        <p
          style={{
            fontSize: '1.15rem',
            color: 'var(--text-dim)',
            maxWidth: 520,
            margin: '0 auto 40px',
          }}
        >
          An unexpected error interrupted this page. Try again, and if the light
          stays out, head back home or grab the self-hosted build.
        </p>

        {error.digest ? (
          <p className="mono" style={{ color: 'var(--text-faint)', marginBottom: 32, fontSize: '0.8rem' }}>
            Reference: {error.digest}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={reset} className="btn btn-primary">
            Try again
          </button>
          <a href="/" className="btn btn-ghost">
            Back to home
          </a>
          <GithubLink className="btn btn-ghost">Self-host it free</GithubLink>
        </div>
      </div>
    </main>
  );
}
