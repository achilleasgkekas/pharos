import type { Metadata } from 'next';
import { PharosMark } from './components/PharosMark';
import { GithubLink } from './components/GithubLink';

export const metadata: Metadata = {
  title: 'Page not found · PHAROS',
  description: 'This beacon points nowhere. Head back to the PHAROS homepage.',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
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
          Error 404 · off the map
        </p>

        <h1 style={{ fontSize: 'clamp(2.4rem, 6vw, 4rem)', fontWeight: 800, marginBottom: 20 }}>
          No light{' '}
          <span
            style={{
              background: 'linear-gradient(90deg, var(--accent), var(--cyan), var(--purple))',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            this way.
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
          The page you were looking for does not exist or has moved. Let the
          beacon guide you back to solid ground.
        </p>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/" className="btn btn-primary">Back to home</a>
          <GithubLink className="btn btn-ghost">Self-host it free</GithubLink>
        </div>
      </div>
    </main>
  );
}
