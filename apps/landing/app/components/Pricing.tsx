'use client';

import { useState } from 'react';
import { Icon } from './Icon';

export type PricingTier = {
  name: string;
  price: string;
  cadence?: string;
  // Numeric EUR monthly amount ('0' = free). Omit for non-priced rows.
  amount?: string;
  tagline: string;
  cta: string;
  ctaHref: string;
  highlight?: boolean;
  badge?: string;
  features: string[];
};

// Annual billing gives 2 months free: charge 10 months instead of 12.
const ANNUAL_MONTHS_CHARGED = 10;

// A tier is a recurring hosted plan (togglable monthly/annual) when it has a
// positive monthly amount billed per month. The free self-host row is not.
const isHosted = (t: PricingTier): boolean =>
  t.amount !== undefined && t.amount !== '0' && (t.cadence ?? '').includes('month');

export function Pricing({
  tiers,
  repoPublic,
  githubUrl,
}: {
  tiers: PricingTier[];
  repoPublic: boolean;
  githubUrl: string;
}) {
  const [annual, setAnnual] = useState(false);

  return (
    <>
      <div className="billing-toggle" role="group" aria-label="Billing period">
        <button
          type="button"
          className={`billing-opt${!annual ? ' billing-opt-on' : ''}`}
          aria-pressed={!annual}
          onClick={() => setAnnual(false)}
        >
          Monthly
        </button>
        <button
          type="button"
          className={`billing-opt${annual ? ' billing-opt-on' : ''}`}
          aria-pressed={annual}
          onClick={() => setAnnual(true)}
        >
          Annual
          <span className="billing-save">2 months free</span>
        </button>
      </div>

      {/* Prices update in place when the toggle flips; announce the change so
          screen-reader users know the figures below just changed. */}
      <p className="sr-only" role="status" aria-live="polite">
        {annual
          ? 'Showing annual pricing: pay for 10 months, get 2 months free.'
          : 'Showing monthly pricing.'}
      </p>

      <div className="pricing-grid">
        {tiers.map((t) => {
          const hosted = isHosted(t);
          const monthly = Number(t.amount);
          const annualPrice = monthly * ANNUAL_MONTHS_CHARGED;
          const showAnnual = hosted && annual;

          const priceText = showAnnual ? `€${annualPrice}` : t.price;
          const cadenceText = showAnnual ? 'per year' : t.cadence;
          // Per-month equivalent shown under an annual price, or the billing
          // note under a monthly price. Kept for every card (blank on the free
          // row) so all four cards align vertically.
          const subText = !hosted
            ? ''
            : showAnnual
              ? `€${(annualPrice / 12).toFixed(2)}/mo, billed annually`
              : 'billed monthly';

          return (
            <article
              key={t.name}
              className={`card price-card${t.highlight ? ' price-card-hl' : ''}`}
            >
              {t.badge && (
                <span className={`price-badge${t.highlight ? ' price-badge-hl' : ''}`}>
                  {t.badge}
                </span>
              )}
              <h3 style={{ fontSize: '1.15rem', marginBottom: 6 }}>{t.name}</h3>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800 }}>
                  {priceText}
                </span>
                {cadenceText && (
                  <span style={{ color: 'var(--text-faint)', fontSize: '0.85rem' }}>{cadenceText}</span>
                )}
              </div>
              <p className="billing-sub">{subText || ' '}</p>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', minHeight: 44, marginBottom: 18 }}>
                {t.tagline}
              </p>

              <a
                href={t.ctaHref}
                target={t.ctaHref.startsWith('http') ? '_blank' : undefined}
                rel={t.ctaHref.startsWith('http') ? 'noopener noreferrer' : undefined}
                className={`btn ${t.highlight ? 'btn-primary' : 'btn-ghost'}`}
                style={{ width: '100%', marginBottom: 22 }}
              >
                {t.cta}
                {!repoPublic && t.ctaHref === githubUrl && (
                  <span className="soon-badge">soon</span>
                )}
              </a>

              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {t.features.map((feat) => (
                  <li key={feat} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }}>
                      <Icon name="check" size={16} />
                    </span>
                    <span style={{ color: 'var(--text-dim)' }}>{feat}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </>
  );
}
