import type { Metadata } from 'next';
import { PharosMark } from '../components/PharosMark';
import { GithubLink } from '../components/GithubLink';
import { GITHUB_URL } from '../site';

const SITE_URL = 'https://ph-aros.com';
const CONTACT = 'hello@ph-aros.com';

// BreadcrumbList so crawlers and AI answer engines place this page under the
// site root (Home > Terms). Harmless while noindex; useful once flipped.
const BREADCRUMB_LD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'Terms of Service', item: `${SITE_URL}/terms` },
  ],
};

// Placeholders to confirm before the hosted service launches. The operating
// entity is the party to these terms; the processor handles card payments.
const ENTITY = '[Operating entity, to confirm]';
const PROCESSOR = 'Stripe';

// Plain-language draft, not final legal counsel output. Kept out of search
// indexes until Achilleas has it reviewed (same pattern as /privacy).
export const metadata: Metadata = {
  title: 'Terms of Service · PHAROS',
  description:
    'The terms for using PHAROS across the self-hosted (AGPL-3.0) and hosted (SaaS) paths. Self-host is governed by the open-source licence; the hosted service adds these service terms.',
  robots: { index: false, follow: true },
  alternates: { canonical: '/terms' },
};

const LAST_UPDATED = 'August 2026';

// Small presentational helper so the document reads consistently with /privacy.
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

export default function TermsOfService() {
  return (
    <main style={{ padding: '48px 0 96px' }}>
      <a href="#top" className="skip-link">Skip to content</a>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_LD) }}
      />

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
          Terms of{' '}
          <span
            style={{
              background: 'linear-gradient(90deg, var(--accent), var(--cyan), var(--purple))',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Service
          </span>
        </h1>

        <p style={{ color: 'var(--text-dim)', fontSize: '1.15rem', lineHeight: 1.7, marginBottom: 24 }}>
          PHAROS ships in two forms. If you run it yourself, the open-source licence
          governs your use. If you use the optional hosted service, these terms apply
          on top. This page explains both.
        </p>

        {/* Draft banner: keeps the review status honest and visible. */}
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
          This is a plain-language draft for transparency. The final terms will be
          reviewed before the hosted service launches. It is not yet legal advice.
          The operating entity and payment processor named below are placeholders
          pending confirmation.
        </div>

        {/* ── Sections ─────────────────────────────────────── */}
        <Section id="self-host" title="1. Self-hosted PHAROS (open source)">
          <p>
            When you download and run PHAROS yourself from the{' '}
            <GithubLink className="inline-link">open-source project</GithubLink>, your use is
            governed by the{' '}
            <GithubLink href={`${GITHUB_URL}/blob/main/LICENSE`} className="inline-link">
              GNU AGPL-3.0 licence
            </GithubLink>, not by these service terms. You are free to run, study, modify, and
            share the software under that licence, including its network-use and
            source-availability obligations. The software is provided as is, without
            warranty, to the extent the licence allows.
          </p>
        </Section>

        <Section id="hosted" title="2. Hosted PHAROS (the SaaS)">
          <p>
            The hosted service is the optional managed version operated by {ENTITY}. By
            creating an account you agree to these terms. You
            must be able to form a binding contract and use the service in line with
            applicable law.
          </p>
        </Section>

        <Section id="account" title="3. Your account">
          <p>
            You are responsible for keeping your credentials secure and for activity
            under your account. Tell us promptly at{' '}
            <a href={`mailto:${CONTACT}`} className="inline-link">{CONTACT}</a> if you
            suspect unauthorised access. On team plans, the workspace owner is
            responsible for the members they invite.
          </p>
        </Section>

        <Section id="acceptable" title="4. Acceptable use">
          <p>You agree not to use the hosted service to:</p>
          <ul style={{ margin: '14px 0 0', paddingLeft: 20 }}>
            <li style={{ marginBottom: 8 }}>break the law or infringe others&rsquo; rights;</li>
            <li style={{ marginBottom: 8 }}>
              disrupt, overload, or probe the service or its infrastructure without
              permission;
            </li>
            <li style={{ marginBottom: 8 }}>
              upload malware, or attempt to gain access to accounts or data that are not
              yours.
            </li>
          </ul>
          <p style={{ marginTop: 14 }}>
            We may suspend accounts that put the service or other users at risk.
          </p>
        </Section>

        <Section id="content" title="5. Your content">
          <p>
            You keep ownership of the receipts, expenses, statements, and files you add.
            You grant us only the limited permission needed to store and process that
            content so the service can work for you, as described in the{' '}
            <a href="/privacy" className="inline-link">Privacy Policy</a>. You can export
            your data to JSON at any time and delete it from your workspace.
          </p>
        </Section>

        <Section id="billing" title="6. Plans and billing">
          <p>
            Paid hosted plans are billed in advance through {PROCESSOR}, our third-party
            payment processor. Plans are the free self-hosted edition and the Pro and
            Dedicated hosted tiers. Each hosted workspace starts with a 14-day free trial
            and is paid after it; there is no permanent free hosted plan. The exact fees,
            billing cycle, and trial terms are shown at checkout before you are charged. Annual billing is offered
            at a discount to paying monthly (two months free). You can cancel to stop
            future renewals; unless stated otherwise, cancellation takes effect at the
            end of the current billing period and is not prorated.
          </p>
        </Section>

        <Section id="availability" title="7. Availability and changes">
          <p>
            We work to keep the hosted service reliable but do not guarantee
            uninterrupted availability, and we may perform maintenance. We may add,
            change, or remove features over time. If we make a material change to these
            terms, we will update the &ldquo;last updated&rdquo; date and, for account
            holders, give reasonable notice.
          </p>
        </Section>

        <Section id="warranty" title="8. Disclaimer and liability">
          <p>
            The hosted service is provided on an as-is and as-available basis. To the
            extent permitted by law, we disclaim implied warranties and are not liable
            for indirect or consequential loss. Nothing in these terms limits rights you
            have under mandatory consumer or data-protection law, including the GDPR.
          </p>
        </Section>

        <Section id="termination" title="9. Termination">
          <p>
            You can close your hosted account at any time. We may suspend or end access
            if you materially breach these terms. On termination we delete your
            workspace data within a reasonable window, except limited records we must
            keep for legal or billing reasons, as set out in the{' '}
            <a href="/privacy" className="inline-link">Privacy Policy</a>.
          </p>
          <p style={{ marginTop: 14 }}>
            Suspension is not termination. If your trial ends, or a payment fails,
            without billing in place, the workspace is suspended rather than deleted:
            access pauses, your content is kept, and adding a payment method reactivates
            it. A suspended workspace is kept for 30 days, the same window as Trash and
            as an account-deletion request, so there is one number to remember.
            Reactivate within those 30 days and everything is exactly as you left it;
            after that the workspace and its files are deleted. Access is paused while a
            workspace is suspended, so export your data before the trial ends, or
            reactivate first and export then.
          </p>
        </Section>

        <Section id="law" title="10. Governing law">
          <p>
            These terms are governed by the laws of Greece, where {ENTITY} operates the
            service, without prejudice to mandatory protections in your country of
            residence.
          </p>
        </Section>

        <Section id="contact" title="11. Contact">
          <p>
            Questions about these terms? Email{' '}
            <a href={`mailto:${CONTACT}`} className="inline-link">{CONTACT}</a>. For the
            open-source project, open an issue on{' '}
            <GithubLink href={`${GITHUB_URL}/issues`} className="inline-link">
              GitHub
            </GithubLink>.
          </p>
        </Section>

        <div style={{ marginTop: 56, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <a href="/" className="btn btn-primary">Back to home</a>
          <a href="/privacy" className="btn btn-ghost">Privacy Policy</a>
          <GithubLink className="btn btn-ghost">Self-host it free</GithubLink>
        </div>
      </div>
    </main>
  );
}
