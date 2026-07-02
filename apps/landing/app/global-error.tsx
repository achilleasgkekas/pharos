'use client';

import { useEffect } from 'react';
import { PharosMark } from './components/PharosMark';

const GITHUB_URL = 'https://github.com/achilleasgkekas/pharos';

/**
 * Root-level error boundary. Unlike app/error.tsx, this fires when the root
 * layout itself throws, so it REPLACES the layout entirely: globals.css is not
 * loaded and it must render its own <html>/<body>. Everything here is therefore
 * fully self-contained inline styles with hardcoded brand values (no CSS
 * variables from globals.css, no shared .btn/.mono classes). The brand palette
 * vars (--accent/--bg) are set inline on <body> only so the reused PharosMark
 * resolves them.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Landing page global error:', error);
  }, [error]);

  const font =
    "'Manrope', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const mono = "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace";

  return (
    <html lang="en">
      <body
        style={{
          // Set brand palette vars so the reused PharosMark resolves them.
          ['--accent' as string]: '#00ff88',
          ['--bg' as string]: '#0a0a0a',
          margin: 0,
          minHeight: '100vh',
          background: '#0a0a0a',
          color: '#f5f5f5',
          fontFamily: font,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '80px 20px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ maxWidth: 620, width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <PharosMark size={64} />
          </div>

          <p
            style={{
              fontFamily: mono,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              fontSize: '0.8rem',
              color: '#999999',
              marginBottom: 18,
            }}
          >
            Error · the beacon went out
          </p>

          <h1 style={{ fontSize: 'clamp(2.4rem, 6vw, 4rem)', fontWeight: 800, margin: '0 0 20px' }}>
            The light{' '}
            <span
              style={{
                background: 'linear-gradient(90deg, #00ff88, #00d4ff, #a55eea)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              failed completely.
            </span>
          </h1>

          <p
            style={{
              fontSize: '1.15rem',
              color: '#999999',
              maxWidth: 520,
              margin: '0 auto 40px',
              lineHeight: 1.5,
            }}
          >
            A critical error took down the whole page. Reload to try again, and if
            it keeps happening, head back home or grab the self-hosted build.
          </p>

          {error.digest ? (
            <p
              style={{
                fontFamily: mono,
                color: '#666666',
                marginBottom: 32,
                fontSize: '0.8rem',
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}

          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                fontFamily: font,
                fontWeight: 600,
                fontSize: '0.95rem',
                padding: '13px 26px',
                borderRadius: 12,
                border: 'none',
                cursor: 'pointer',
                background: '#00ff88',
                color: '#0a0a0a',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                fontFamily: font,
                fontWeight: 600,
                fontSize: '0.95rem',
                padding: '13px 26px',
                borderRadius: 12,
                border: '1px solid #2a2a2a',
                color: '#f5f5f5',
                textDecoration: 'none',
              }}
            >
              Back to home
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: font,
                fontWeight: 600,
                fontSize: '0.95rem',
                padding: '13px 26px',
                borderRadius: 12,
                border: '1px solid #2a2a2a',
                color: '#f5f5f5',
                textDecoration: 'none',
              }}
            >
              Self-host it free
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
