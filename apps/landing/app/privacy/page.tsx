import type { Metadata } from 'next';
import { PharosMark } from '../components/PharosMark';

const SITE_URL = 'https://ph-aros.com';
const GITHUB_URL = 'https://github.com/achilleasgkekas/pharos';
const CONTACT = 'hello@ph-aros.com';

// This is a plain-language draft, not final legal counsel output. It is kept
// out of search indexes until Achilleas has it reviewed (see PROGRESS note).
export const metadata: Metadata = {
  title: 'Privacy Policy · PHAROS',
  description:
    'How PHAROS handles your data across the self-hosted (open-source) and hosted (SaaS) paths. Self-host keeps everything on your own machine; the hosted service is privacy-first with no telemetry.',
  robots: { index: false, follow: true },
  alternates: { canonical: '/privacy' },
};

const LAST_UPDATED = 'July 2026';

// Small presentational helpers so the document reads consistently.
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginTop: 44 }}>
      <h2
        style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          marginBottom: 14,
          scrollMarginTop: 90,
        }}
      >
        {title}
      </h2>
      <div style={{ color: 'var(--text-dim)', fontSize: '1.02rem', lineHeight: 1.7 }}>{children}</div>
    </section>
  );
}

export default function PrivacyPolicy() {
  return (
    <main style={{ padding: '48px 0 96px' }}>
      <a href="#top" className="skip-link">Skip to content</a>

      {/* ── Minimal header ─────────────────────────────────── */}
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
          Legal · last updated {LAST_UPDATED}
        </p>

        <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.2rem)', fontWeight: 800, marginBottom: 20 }}>
          Privacy{' '}
          <span
            style={{
              background: 'linear-gradient(90deg, var(--accent), var(--cyan), var(--purple))',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Policy
          </span>
        </h1>

        <p style={{ color: 'var(--text-dim)', fontSize: '1.15rem', lineHeight: 1.7, marginBottom: 24 }}>
          PHAROS ships in two forms, and the privacy picture is very different for
          each. This page explains both so you know exactly where your data lives
          before you pick a path.
        </p>

        {/* Draft banner: makes the review status honest and visible. */}
        <div
          className="card"
          style={{
            borderColor: 'var(--gold)',
            background: 'rgba(255, 217, 61, 0.06)',
            padding: '16px 18px',
            fontSize: '0.95rem',
            color: 'var(--text-dim)',
          }}
          role="note"
        >
          <strong style={{ color: 'var(--gold)' }}>Draft in review.</strong>{' '}
          This is a plain-language draft for transparency. The final policy will be
          reviewed before the hosted service launches. It is not yet legal advice.
        </div>

        {/* ── Sections ─────────────────────────────────────── */}
        <Section id="self-host" title="1. Self-hosted PHAROS (open source)">
          <p>
            When you run PHAROS yourself, from the{' '}
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="inline-link">
              open-source project
            </a>{' '}
            under AGPL-3.0, we do not receive any of your data. Everything, receipts,
            expenses, statements, inventory, network state, lives on your own machine
            and in your own database.
          </p>
          <ul style={{ margin: '14px 0 0', paddingLeft: 20 }}>
            <li style={{ marginBottom: 8 }}>No telemetry, analytics, or phone-home is built into the app.</li>
            <li style={{ marginBottom: 8 }}>
              AI parsing runs against whichever provider you configure. Choose local
              Ollama and nothing leaves your network; choose a cloud provider and only
              the content you scan is sent to that provider under their terms.
            </li>
            <li style={{ marginBottom: 8 }}>
              Backups, storage backends (SMB, FTP, OneDrive), and any integrations you
              enable are yours to control and point wherever you like.
            </li>
          </ul>
          <p style={{ marginTop: 14 }}>
            In this mode you are the data controller. This policy&rsquo;s hosted-service
            sections below do not apply to you.
          </p>
        </Section>

        <Section id="hosted" title="2. Hosted PHAROS (the SaaS)">
          <p>
            If you use the optional hosted service, we operate the servers on your
            behalf and process your data to provide it. We aim to collect as little as
            possible and never sell it.
          </p>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '18px 0 8px', color: 'var(--text)' }}>
            What we collect
          </h3>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li style={{ marginBottom: 8 }}>
              <strong style={{ color: 'var(--text)' }}>Account data:</strong> your email
              address and workspace details, used to sign you in and contact you about
              the service.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong style={{ color: 'var(--text)' }}>Content you add:</strong> receipts,
              expenses, statements, items, and the files you upload, stored so the app
              can work for you.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong style={{ color: 'var(--text)' }}>Operational logs:</strong> minimal
              security and reliability logs (for example failed sign-ins), kept only as
              long as needed to keep the service safe.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong style={{ color: 'var(--text)' }}>Payment data:</strong> handled by a
              third-party payment processor. We never see or store full card numbers.
            </li>
          </ul>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '18px 0 8px', color: 'var(--text)' }}>
            How AI processing works
          </h3>
          <p>
            Hosted plans include AI receipt and document parsing. The content you scan
            is sent to the AI provider that powers your plan solely to extract the
            fields, and is not used to train third-party models where the provider
            offers that guarantee. You can bring your own AI key so processing runs
            under your own provider account instead.
          </p>
        </Section>

        <Section id="waitlist" title="3. The hosted waitlist">
          <p>
            If you join the hosted-beta waitlist, we store the email address you submit
            for the single purpose of telling you when hosted PHAROS opens. We do not
            add you to unrelated marketing, and you can ask us to delete your address at
            any time by emailing{' '}
            <a href={`mailto:${CONTACT}`} className="inline-link">{CONTACT}</a>.
          </p>
        </Section>

        <Section id="rights" title="4. Your rights">
          <p>
            PHAROS is built in the EU (Greece), and we honour the GDPR for hosted
            users. You can request access to your data, correction, export, or deletion,
            and you can object to processing or withdraw consent. To exercise any of
            these, email{' '}
            <a href={`mailto:${CONTACT}`} className="inline-link">{CONTACT}</a>. If you
            self-host, these controls are already in your hands, the data never leaves
            your systems.
          </p>
        </Section>

        <Section id="retention" title="5. Retention and deletion">
          <p>
            Hosted content is kept while your workspace is active. When you delete an
            item it goes to a recoverable trash and is purged after a grace period; when
            you close your account we delete your workspace data within a reasonable
            window, except where we must keep limited records for legal or billing
            reasons.
          </p>
        </Section>

        <Section id="security" title="6. Security">
          <p>
            We use encryption in transit, encrypt sensitive secrets at rest, and follow
            least-privilege access on the hosted service. No system is perfectly secure,
            so if you find an issue please report it responsibly, see our{' '}
            <a href="/.well-known/security.txt" target="_blank" rel="noopener noreferrer" className="inline-link">
              security.txt
            </a>.
          </p>
        </Section>

        <Section id="changes" title="7. Changes to this policy">
          <p>
            As the hosted service takes shape we will update this page and revise the
            &ldquo;last updated&rdquo; date above. Material changes to how we handle
            hosted data will be communicated to account holders.
          </p>
        </Section>

        <Section id="contact" title="8. Contact">
          <p>
            Questions about privacy? Email{' '}
            <a href={`mailto:${CONTACT}`} className="inline-link">{CONTACT}</a>. For the
            open-source project, open an issue on{' '}
            <a href={`${GITHUB_URL}/issues`} target="_blank" rel="noopener noreferrer" className="inline-link">
              GitHub
            </a>.
          </p>
        </Section>

        <div style={{ marginTop: 56, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <a href="/" className="btn btn-primary">Back to home</a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
            Self-host it free
          </a>
        </div>
      </div>
    </main>
  );
}
