'use client';
import { useEffect } from 'react';
import { reportClientError } from '@/lib/clientErrorReporting';

// Last-resort boundary: an error in the ROOT layout itself, where app/error.tsx cannot render.
// Deliberately dependency-free (no providers, no i18n) because whatever broke may be one of them.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => { reportClientError(error); }, [error]);
  return (
    <html lang="en">
      <body style={{ background: '#0b0d10', color: '#e6e6e6', fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '6rem 1rem' }}>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Something went wrong</h1>
        <p style={{ opacity: 0.7, marginBottom: '1.5rem' }}>
          Please reload the page.{error.digest ? ` (ref: ${error.digest})` : ''}
        </p>
        <button onClick={() => window.location.reload()} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: 0, cursor: 'pointer' }}>
          Reload
        </button>
      </body>
    </html>
  );
}
