import Link from 'next/link';
import { PharosMark } from '@/components/PharosMark';

// The app had NO not-found page, so every mistyped route (and every notFound() the tenant gate
// throws) fell through to Next's default black-and-white stack-trace-ish 404. The landing site
// already had the branded one; this is its counterpart inside the product, deliberately the
// same voice ("No light this way") so the two halves of Pharos do not feel like two products.
//
// Server component, no client JS: a 404 must render even when something upstream is broken.
export const metadata = {
  title: 'Page not found · PHAROS',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-20 text-center">
      <div className="mx-auto max-w-[560px]">
        <div className="mb-6 flex justify-center text-[color:var(--color-accent)]">
          <PharosMark size={64} />
        </div>

        <p
          className="mb-4 text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-text-faint)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Error 404 · off the map
        </p>

        <h1
          className="mb-5 text-4xl font-extrabold sm:text-5xl"
          style={{ fontFamily: 'var(--font-display)', textWrap: 'balance' }}
        >
          No light{' '}
          <span
            style={{
              background:
                'linear-gradient(90deg, var(--color-accent), var(--color-cyan), var(--color-purple))',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            this way.
          </span>
        </h1>

        <p className="mx-auto mb-9 max-w-[460px] text-[color:var(--color-text-dim)]">
          This page does not exist, or the workspace in the address does not. Let the beacon
          guide you back.
        </p>

        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-[color:var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
          >
            Back to home
          </Link>
          <Link
            href="/settings"
            className="rounded-lg border border-[color:var(--color-border)] px-5 py-2.5 text-sm font-medium text-[color:var(--color-text-dim)] transition-colors hover:border-[color:var(--color-border-light)] hover:text-[color:var(--color-text)]"
          >
            Settings
          </Link>
        </div>
      </div>
    </main>
  );
}
