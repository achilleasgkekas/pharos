import { PharosMark } from './components/PharosMark';
import { Icon } from './components/Icon';
import { Waitlist } from './components/Waitlist';

const GITHUB_URL = 'https://github.com/achilleasgkekas/pharos';

const FEATURES: {
  icon: string;
  color: string;
  title: string;
  desc: string;
}[] = [
  {
    icon: 'package',
    color: 'var(--accent)',
    title: 'Inventory & shopping',
    desc: 'Track everything you own and everything you want. Multi-store price tracking, deal alerts, warranties, and a wishlist that watches for drops.',
  },
  {
    icon: 'receipt',
    color: 'var(--cyan)',
    title: 'Receipts, read by AI',
    desc: 'Drop a photo or PDF and AI pulls out the store, date, totals, and line items in any language. Quick-verify queue to clear the backlog fast.',
  },
  {
    icon: 'wallet',
    color: 'var(--gold)',
    title: 'Expenses & income',
    desc: 'Bills and payslips scanned, recurring series auto-detected, anomaly flags when a vendor charges more than usual. Budgets per category.',
  },
  {
    icon: 'card',
    color: 'var(--purple)',
    title: 'Statements & installments',
    desc: 'Import credit-card PDFs, parse installment plans, and merge the same purchase across months. Always know what you still owe.',
  },
  {
    icon: 'calendar',
    color: 'var(--accent)',
    title: 'Subscriptions',
    desc: 'Every recurring charge in one place with a renewal calendar, so nothing bills you by surprise.',
  },
  {
    icon: 'ticket',
    color: 'var(--red)',
    title: 'Vouchers & coupons',
    desc: 'Store gift cards and discount codes with expiry reminders. Add them by hand or let AI read them from a screenshot.',
  },
  {
    icon: 'chart',
    color: 'var(--cyan)',
    title: 'Reports',
    desc: 'Cash flow, spend by store and category, net position, and price history charts. See where the money actually goes.',
  },
  {
    icon: 'wifi',
    color: 'var(--gold)',
    title: 'Network',
    desc: 'Live UniFi dashboard: WAN status, devices, clients, speedtests, and alerts when something goes offline.',
  },
];

const STEPS: { title: string; desc: string }[] = [
  {
    title: 'Clone & configure',
    desc: 'Grab the repo, copy the env template, and set your secrets. Bring your own AI key or point it at a local Ollama.',
  },
  {
    title: 'docker compose up',
    desc: 'One command starts the web app, MongoDB, and SearXNG. No external services, no telemetry, nothing phones home.',
  },
  {
    title: 'Open the dashboard',
    desc: 'Reach it on your LAN or over your own VPN. Add receipts, items, and statements, and let the AI do the parsing.',
  },
];

type Tier = {
  name: string;
  price: string;
  cadence?: string;
  tagline: string;
  cta: string;
  ctaHref: string;
  highlight?: boolean;
  badge?: string;
  features: string[];
};

const TIERS: Tier[] = [
  {
    name: 'Self-hosted',
    price: 'Free',
    tagline: 'Run it on your own hardware, forever. Open source, AGPL-3.0.',
    cta: 'Get the Docker image',
    ctaHref: GITHUB_URL,
    badge: 'AGPL-3.0',
    features: [
      'Every module, no limits',
      'Your data stays on your machine',
      'Bring your own AI (Ollama, Anthropic, OpenAI, Gemini…)',
      'SMB / FTP / OneDrive backups',
      'Community support',
    ],
  },
  {
    name: 'Hosted · Free',
    price: 'TBD',
    cadence: 'free tier',
    tagline: 'Managed for you. Kick the tyres with the essentials.',
    cta: 'Join the waitlist',
    ctaHref: '#waitlist',
    features: [
      '1 user',
      'Inventory, shopping & receipts',
      'Limited AI receipt scans / month',
      'Automatic nightly backups',
      'We handle updates & hosting',
    ],
  },
  {
    name: 'Hosted · Pro',
    price: 'TBD',
    cadence: 'per month',
    tagline: 'The full hub, managed, with AI included.',
    cta: 'Join the waitlist',
    ctaHref: '#waitlist',
    highlight: true,
    badge: 'Most popular',
    features: [
      'All modules (expenses, statements, subscriptions, vouchers, reports)',
      'AI receipt & document parsing included',
      'Network monitoring & alerts (ntfy)',
      'Price tracking & deal notifications',
      'Priority email support',
    ],
  },
  {
    name: 'Hosted · Team',
    price: 'TBD',
    cadence: 'per seat',
    tagline: 'Share a hub across a household or small team.',
    cta: 'Talk to us',
    ctaHref: '#waitlist',
    features: [
      'Everything in Pro',
      'Multiple users & shared workspace',
      'Roles & permissions',
      'Higher AI limits',
      'Audit trail',
    ],
  },
];

export default function Home() {
  return (
    <main>
      {/* ── Nav ───────────────────────────────────────────── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          borderBottom: '1px solid var(--border)',
          background: 'rgba(10,10,10,0.7)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div
          className="container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 64,
          }}
        >
          <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PharosMark size={28} />
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                letterSpacing: '0.14em',
                fontSize: '1.05rem',
              }}
            >
              PHAROS
            </span>
          </a>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            <a href="#features" className="navlink">Features</a>
            <a href="#self-host" className="navlink">Self-host</a>
            <a href="#pricing" className="navlink">Pricing</a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="navlink"
            >
              GitHub
            </a>
          </nav>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────── */}
      <section id="top" style={{ textAlign: 'center', padding: '112px 0 96px' }}>
        <div className="container" style={{ maxWidth: 820 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
            <PharosMark size={72} />
          </div>

          <p className="mono" style={{ marginBottom: 20 }}>
            Personal Hub · Asset &amp; Resource Oversight System
          </p>

          <h1 style={{ fontSize: 'clamp(2.4rem, 6vw, 4.2rem)', fontWeight: 800, marginBottom: 22 }}>
            One light over{' '}
            <span
              style={{
                background: 'linear-gradient(90deg, var(--accent), var(--cyan), var(--purple))',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              everything you run.
            </span>
          </h1>

          <p
            style={{
              fontSize: '1.15rem',
              color: 'var(--text-dim)',
              maxWidth: 620,
              margin: '0 auto 40px',
            }}
          >
            A self-hosted personal hub for oversight on everything you own.
            Inventory, receipts read by AI, expenses, credit-card installments,
            subscriptions, and your network, in one private dashboard you control.
          </p>

          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#pricing" className="btn btn-primary">Get started</a>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              Self-host it free
            </a>
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────── */}
      <section id="features" style={{ padding: '64px 0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p className="mono" style={{ marginBottom: 12 }}>What&apos;s inside</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 700 }}>
              One hub for every part of your life admin
            </h2>
          </div>

          <div className="feature-grid">
            {FEATURES.map((f) => (
              <article key={f.title} className="card feature-card">
                <span className="feature-icon" style={{ color: f.color }}>
                  <span className="feature-glow" style={{ background: f.color }} />
                  <Icon name={f.icon} size={22} />
                </span>
                <h3 style={{ fontSize: '1.12rem', margin: '16px 0 8px' }}>{f.title}</h3>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.95rem' }}>{f.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works (self-host) ──────────────────────── */}
      <section id="self-host" style={{ padding: '64px 0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p className="mono" style={{ marginBottom: 12 }}>Self-host</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 700, marginBottom: 14 }}>
              Up and running in three steps
            </h2>
            <p style={{ color: 'var(--text-dim)', maxWidth: 560, margin: '0 auto' }}>
              One Docker Compose file brings up the app, MongoDB, and search.
              Your data never leaves your machine.
            </p>
          </div>

          <div className="steps-grid">
            {STEPS.map((s, i) => (
              <article key={s.title} className="card step-card">
                <span className="step-num">{i + 1}</span>
                <h3 style={{ fontSize: '1.08rem', marginBottom: 8 }}>{s.title}</h3>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.92rem' }}>{s.desc}</p>
              </article>
            ))}
          </div>

          <pre className="code-block" aria-label="Docker quick start">
            <span className="tok-comment"># Pull and start the stack</span>{'\n'}
            <span className="tok-cmd">git clone</span> {GITHUB_URL}.git{'\n'}
            <span className="tok-cmd">cd</span> pharos{'\n'}
            <span className="tok-cmd">cp</span> .env.example .env   <span className="tok-comment"># set your secrets</span>{'\n'}
            <span className="tok-cmd">docker compose up</span> -d{'\n'}
            {'\n'}
            <span className="tok-comment"># Open http://localhost:3000</span>
          </pre>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────── */}
      <section id="pricing" style={{ padding: '64px 0 96px' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p className="mono" style={{ marginBottom: 12 }}>Pricing</p>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 700, marginBottom: 14 }}>
              Own it, or let us host it
            </h2>
            <p style={{ color: 'var(--text-dim)', maxWidth: 560, margin: '0 auto' }}>
              Self-host the whole thing for free under AGPL-3.0, or pick a managed
              plan and skip the setup. Hosted prices are indicative while we finalise them.
            </p>
          </div>

          <div className="pricing-grid">
            {TIERS.map((t) => (
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
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800 }}>
                    {t.price}
                  </span>
                  {t.cadence && (
                    <span style={{ color: 'var(--text-faint)', fontSize: '0.85rem' }}>{t.cadence}</span>
                  )}
                </div>
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
            ))}
          </div>

          <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: '0.85rem', marginTop: 36 }}>
            Final hosted pricing is being worked out. Self-hosting stays free under AGPL-3.0.
          </p>
        </div>
      </section>

      {/* ── Waitlist ──────────────────────────────────────── */}
      <section id="waitlist" style={{ padding: '48px 0 96px' }}>
        <div className="container" style={{ maxWidth: 640 }}>
          <div className="card" style={{ textAlign: 'center', padding: '40px 28px', overflow: 'hidden' }}>
            <p className="mono" style={{ marginBottom: 12 }}>Hosted beta</p>
            <h2 style={{ fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', fontWeight: 700, marginBottom: 12 }}>
              Be first on the managed version
            </h2>
            <p style={{ color: 'var(--text-dim)', maxWidth: 460, margin: '0 auto 28px' }}>
              Prefer not to run your own server? Leave your email and we&apos;ll
              tell you when hosted PHAROS opens up. No spam, just the launch.
            </p>
            <Waitlist />
            <p style={{ color: 'var(--text-faint)', fontSize: '0.82rem', marginTop: 20 }}>
              Rather self-host?{' '}
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                It stays free under AGPL-3.0
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '32px 0' }}>
        <div
          className="container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PharosMark size={22} />
            <span className="mono" style={{ color: 'var(--text-dim)' }}>PHAROS · AGPL-3.0</span>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            <a href={GITHUB_URL} className="navlink" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href={`${GITHUB_URL}/blob/main/LICENSE`} className="navlink" target="_blank" rel="noopener noreferrer">License</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
