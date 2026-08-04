import type { Metadata } from 'next';
import { PharosMark } from '../components/PharosMark';
import { SHIPPED, PLANNED, LIMITATIONS, type Entry } from './entries';

const SITE_URL = 'https://ph-aros.com';

// Under Home in a crawler's model of the site, same as /privacy and /terms.
const BREADCRUMB_LD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'Status', item: `${SITE_URL}/status` },
  ],
};

export const metadata: Metadata = {
  title: 'Status & changelog · PHAROS',
  description:
    'What has shipped to the hosted PHAROS service, what is being built next, and what does not work yet.',
  alternates: { canonical: `${SITE_URL}/status` },
};

const KIND_LABEL: Record<Entry['kind'], string> = {
  feature: 'New',
  fix: 'Fix',
  security: 'Safety',
};

const KIND_COLOUR: Record<Entry['kind'], string> = {
  feature: 'var(--accent)',
  fix: 'var(--cyan)',
  security: 'var(--purple)',
};

/** Human date, fixed locale so the server and the browser cannot disagree and hydrate-mismatch. */
function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default function StatusPage() {
  // Grouped by date so a busy day reads as one heading instead of five repeats of the same date.
  const byDate = SHIPPED.reduce<Record<string, Entry[]>>((acc, e) => {
    (acc[e.date] ??= []).push(e);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort().reverse();

  return (
    <main style={{ padding: '48px 0 96px' }}>
      <a href="#top" className="skip-link">Skip to content</a>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_LD) }}
      />

      <div className="container" id="top" style={{ maxWidth: 820 }}>
        <a
          href="/"
          className="navlink"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 40 }}
          aria-label="Back to the PHAROS homepage"
        >
          <PharosMark size={28} />
          <span className="mono" style={{ fontWeight: 700, letterSpacing: '0.08em' }}>PHAROS</span>
        </a>

        <p className="mono" style={{ color: 'var(--accent)', marginBottom: 12 }}>
          Status · updated {formatDate(dates[0] ?? '2026-08-04')}
        </p>

        <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.2rem)', fontWeight: 800, marginBottom: 20 }}>
          What&apos;s{' '}
          <span
            style={{
              background: 'linear-gradient(90deg, var(--accent), var(--cyan), var(--purple))',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            changed
          </span>
        </h1>

        <p style={{ color: 'var(--text-dim)', fontSize: '1.15rem', lineHeight: 1.7, marginBottom: 40 }}>
          Everything below is live on the hosted service, not merely merged. What is being built
          next, and what does not work yet, is further down. The rough parts are named rather than
          left for you to find.
        </p>

        {/* ── not working yet ──────────────────────────────────
            FIRST, above the good news, on purpose. Someone deciding whether to trust this with
            their receipts needs the caveats before the feature list, not after it. */}
        <section
          aria-labelledby="limitations"
          style={{
            border: '1px solid color-mix(in srgb, var(--gold) 40%, transparent)',
            background: 'color-mix(in srgb, var(--gold) 8%, transparent)',
            borderRadius: 14,
            padding: '20px 22px',
            marginBottom: 48,
          }}
        >
          <h2 id="limitations" className="mono" style={{ color: 'var(--gold)', fontSize: '0.95rem', marginBottom: 12 }}>
            Known limitations
          </h2>
          <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-dim)', lineHeight: 1.7 }}>
            {LIMITATIONS.map((l) => (
              <li key={l} style={{ marginBottom: 6 }}>{l}</li>
            ))}
          </ul>
        </section>

        {/* ── shipped ────────────────────────────────────────── */}
        <section aria-labelledby="shipped" style={{ marginBottom: 56 }}>
          <h2 id="shipped" style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 24 }}>
            Shipped
          </h2>

          {dates.map((date) => (
            <div key={date} style={{ marginBottom: 32 }}>
              <p className="mono" style={{ color: 'var(--text-faint)', fontSize: '0.85rem', marginBottom: 12 }}>
                {formatDate(date)}
              </p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {byDate[date].map((e) => (
                  <li
                    key={e.title}
                    style={{
                      borderLeft: `2px solid ${KIND_COLOUR[e.kind]}`,
                      paddingLeft: 16,
                      marginBottom: 18,
                    }}
                  >
                    <span
                      className="mono"
                      style={{ color: KIND_COLOUR[e.kind], fontSize: '0.75rem', letterSpacing: '0.06em' }}
                    >
                      {KIND_LABEL[e.kind]}
                    </span>
                    <p style={{ fontWeight: 600, margin: '4px 0 4px' }}>{e.title}</p>
                    <p style={{ color: 'var(--text-dim)', lineHeight: 1.6, margin: 0 }}>{e.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        {/* ── coming ─────────────────────────────────────────── */}
        <section aria-labelledby="coming" style={{ marginBottom: 48 }}>
          <h2 id="coming" style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 8 }}>
            Coming next
          </h2>
          <p style={{ color: 'var(--text-faint)', marginBottom: 24, fontSize: '0.95rem' }}>
            Intentions, not commitments. No dates, because a date here would be a guess dressed up
            as a promise.
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {PLANNED.map((p) => (
              <li
                key={p.title}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '16px 18px',
                  marginBottom: 12,
                }}
              >
                <span
                  className="mono"
                  style={{
                    color: p.when === 'next' ? 'var(--cyan)' : 'var(--text-faint)',
                    fontSize: '0.75rem',
                    letterSpacing: '0.06em',
                  }}
                >
                  {p.when === 'next' ? 'In progress' : 'Later'}
                </span>
                <p style={{ fontWeight: 600, margin: '4px 0 4px' }}>{p.title}</p>
                <p style={{ color: 'var(--text-dim)', lineHeight: 1.6, margin: 0 }}>{p.detail}</p>
              </li>
            ))}
          </ul>
        </section>

        <p style={{ color: 'var(--text-faint)', fontSize: '0.9rem', lineHeight: 1.7 }}>
          Self-hosting instead? Everything here is the same codebase, so the fixes land there too.
          The difference is that you deploy them when you choose to.
        </p>
      </div>
    </main>
  );
}
