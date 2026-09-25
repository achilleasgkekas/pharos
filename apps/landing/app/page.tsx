import { PharosMark } from './components/PharosMark';
import { GithubLink } from './components/GithubLink';
import { CopyButton } from './components/CopyButton';
import { BackToTop } from './components/BackToTop';
import { ScrollProgress } from './components/ScrollProgress';
import { Icon } from './components/Icon';
import { GITHUB_URL } from './site';

const HERO_CHIPS = [
  { icon: 'server', label: 'Runs on your hardware', color: 'var(--accent)' },
  { icon: 'users', label: 'One login per person', color: 'var(--cyan)' },
  { icon: 'eyeOff', label: 'AI optional, no telemetry', color: 'var(--purple)' },
];

// The dashboard mock-up: fictional numbers, only there to show the shape of the app.
const SHOWCASE_STATS = [
  { lbl: 'Due this month', val: '€1,284', color: 'var(--gold)' },
  { lbl: 'Owned inventory', val: '€18,420', color: 'var(--accent)' },
  { lbl: 'Subscriptions / mo', val: '€96', color: 'var(--cyan)' },
];

const SHOWCASE_MODS = [
  { icon: 'package', title: 'Inventory', count: '214 items', color: 'var(--accent)' },
  { icon: 'receipt', title: 'Receipts', count: '3 to verify', color: 'var(--cyan)' },
  { icon: 'file', title: 'Bills', count: '2 due this week', color: 'var(--gold)' },
  { icon: 'car', title: 'Vehicles', count: 'ΚΤΕΟ in 12 days', color: 'var(--red)' },
  { icon: 'idcard', title: 'Documents', count: 'Passport: 5 months', color: 'var(--purple)' },
  { icon: 'calendar', title: 'Calendar', count: '9 events ahead', color: 'var(--cyan)' },
];

const FEATURES = [
  { icon: 'package', title: 'Inventory & shopping', color: 'var(--accent)', desc: 'What you own and what you want, with warranties, maintenance, loans and multi-store price tracking limited to the shops in your country.' },
  { icon: 'receipt', title: 'Receipts & statements', color: 'var(--cyan)', desc: 'Drop in a photo, a PDF or an email. Card statements rebuild every installment plan month by month.' },
  { icon: 'wallet', title: 'Expenses & income', color: 'var(--gold)', desc: 'Recurring series, unusual-amount flags, price-hike alerts, budgets, split costs and multi-currency.' },
  { icon: 'file', title: 'Bills & subscriptions', color: 'var(--purple)', desc: 'Due dates, partial payments, renewals and free trials, with a reminder before anything slips.' },
  { icon: 'gauge', title: 'Utilities', color: 'var(--cyan)', desc: 'Log meter readings and see the consumption behind every electricity, water and gas bill.' },
  { icon: 'car', title: 'Vehicles', color: 'var(--red)', desc: 'Fuel and service logs, L/100 km, cost per km, and alerts for MOT, insurance and road tax.' },
  { icon: 'idcard', title: 'Documents & dates', color: 'var(--purple)', desc: 'Passports, licences and policies that expire, plus birthdays and anniversaries, all with reminders.' },
  { icon: 'chart', title: 'Calendar & reports', color: 'var(--accent)', desc: 'One agenda of what is due, cash flow, net worth, a savings forecast and per-property breakdowns.' },
];

const AI_FIELDS = [
  { k: 'Store', v: 'Plaisio' },
  { k: 'Date', v: '14/09/2026' },
  { k: 'VAT 24%', v: '€45.63' },
  { k: 'Total', v: '€235.76', color: 'var(--accent)' },
];

const AI_LINES = [
  { name: 'USB-C dock', price: '€149.90' },
  { name: 'HDMI cable 2m', price: '€12.90' },
  { name: '3-year warranty', price: '€72.96' },
];

const AI_NOTES = [
  { icon: 'server', label: 'Local Ollama or your own key' },
  { icon: 'unlock', label: 'Switch it off per feature' },
  { icon: 'check', label: 'Every workflow works without it' },
];

const TRUST = [
  { icon: 'server', title: 'Self-hosted', color: 'var(--accent)', desc: 'Your server, your database, your files. There is no Pharos cloud.' },
  { icon: 'eyeOff', title: 'No telemetry', color: 'var(--cyan)', desc: 'Nothing phones home. Outside services are only the ones you connect.' },
  { icon: 'users', title: 'Household roles', color: 'var(--gold)', desc: 'Admins, members and read-only viewers, each with their own login and optional 2FA.' },
  { icon: 'database', title: 'Backups built in', color: 'var(--purple)', desc: 'A 30-day Trash, JSON backup and restore, and optional mirroring to your NAS.' },
  { icon: 'code', title: 'Free software', color: 'var(--red)', desc: 'AGPL-3.0. Read the code, change it, run it forever.' },
];

const STEPS = [
  { title: 'Clone and configure', desc: 'Copy the example settings and generate three secrets with openssl.' },
  { title: 'Start the stack', desc: 'One Docker Compose file brings up the app, MongoDB and SearXNG search.' },
  { title: 'Run the setup wizard', desc: 'Create the admin account, pick your language, currency and shopping country, then invite your household.' },
];

const QUICKSTART = `git clone ${GITHUB_URL}.git
cd pharos
cp .env.example .env
docker compose up -d --build`;

const DEPLOY_TARGETS = ['Linux server', 'Synology / NAS', 'Raspberry Pi 5', 'Proxmox VM', 'Any Docker host'];

const section = { fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 700 } as const;

export default function Home() {
  return (
    <main id="main">
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(10,10,10,0.8)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, gap: 16 }}>
          <a href="#top" aria-label="Pharos home" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PharosMark size={28} />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '0.14em', fontSize: '1.05rem' }}>PHAROS</span>
          </a>
          <nav className="site-nav" aria-label="Main navigation">
            <a href="#features" className="navlink">Features</a>
            <a href="#ai" className="navlink">AI</a>
            <a href="#trust" className="navlink">Privacy</a>
            <a href="#self-host" className="navlink">Self-host</a>
            <GithubLink className="navlink">GitHub</GithubLink>
          </nav>
          <a href="#self-host" className="btn btn-primary top-cta">Self-host</a>
        </div>
      </header>
      <ScrollProgress />
      <BackToTop />

      {/* Hero */}
      <section id="top" tabIndex={-1} style={{ textAlign: 'center', padding: '112px 0 88px', outline: 'none' }}>
        <div className="container" style={{ maxWidth: 820 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
            <PharosMark size={72} />
          </div>
          <p className="mono" style={{ marginBottom: 20 }}>Personal Hub · Asset &amp; Resource Oversight System</p>
          <h1 style={{ fontSize: 'clamp(2.4rem, 6vw, 4.2rem)', fontWeight: 800, marginBottom: 22 }}>
            One light over{' '}
            <span className="hero-highlight" style={{ background: 'linear-gradient(90deg, var(--accent), var(--cyan), var(--purple))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
              everything you run.
            </span>
          </h1>
          <p style={{ fontSize: '1.15rem', color: 'var(--text-dim)', maxWidth: 640, margin: '0 auto 40px' }}>
            Inventory, receipts, expenses, bills, subscriptions, utilities, vehicles and the papers that expire, in one
            private dashboard for your household. You run it on your own hardware. AI is optional.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#self-host" className="btn btn-primary">Get started</a>
            <GithubLink className="btn btn-ghost">View source</GithubLink>
          </div>
          <ul className="hero-assurance" aria-label="What you get">
            {HERO_CHIPS.map((c) => (
              <li key={c.label} className="hero-chip">
                <span className="hero-chip-ico" style={{ color: c.color }}><Icon name={c.icon} size={15} /></span>
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Dashboard preview */}
      <section id="preview" style={{ padding: '16px 0 64px' }}>
        <div className="container">
          <div className="showcase" aria-label="PHAROS dashboard preview with sample data">
            <div className="win-bar">
              <div className="win-dots"><span /><span /><span /></div>
              <div className="win-addr">pharos.local / dashboard</div>
              <span className="win-online">Self-hosted</span>
            </div>
            <div className="win-body">
              <div className="win-head">
                <h4>Good evening</h4>
                <span>Sample data</span>
              </div>
              <div className="stat-row">
                {SHOWCASE_STATS.map((s) => (
                  <div key={s.lbl} className="stat-tile">
                    <span className="lbl">{s.lbl}</span>
                    <span className="val" style={{ color: s.color }}>{s.val}</span>
                  </div>
                ))}
              </div>
              <div className="mod-grid">
                {SHOWCASE_MODS.map((m) => (
                  <div key={m.title} className="mod-tile">
                    <span className="mod-ico" style={{ color: m.color }}>
                      <span className="g" style={{ background: m.color }} />
                      <Icon name={m.icon} size={17} />
                    </span>
                    <span>
                      <span className="t" style={{ display: 'block' }}>{m.title}</span>
                      <span className="c">{m.count}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ padding: '64px 0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p className="mono" style={{ marginBottom: 12 }}>What&apos;s inside</p>
            <h2 style={section}>One hub for every part of your life admin</h2>
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
          <p style={{ textAlign: 'center', marginTop: 28 }}>
            <GithubLink className="inline-link" href={`${GITHUB_URL}/blob/main/docs/features.md`}>See every feature in the docs</GithubLink>
          </p>
        </div>
      </section>

      {/* AI */}
      <section id="ai" style={{ padding: '56px 0' }}>
        <div className="container" style={{ maxWidth: 960 }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <p className="mono" style={{ marginBottom: 12 }}>Optional AI that reads your paperwork</p>
            <h2 style={{ ...section, marginBottom: 14 }}>Drop a receipt. Get structured data.</h2>
            <p style={{ color: 'var(--text-dim)', maxWidth: 560, margin: '0 auto' }}>
              Photos, PDFs or forwarded emails go in. Store, date, totals, VAT and every line item come out, ready to
              check. Run a model locally or bring your own key, or leave AI off and type it in.
            </p>
          </div>
          <div className="ai-flow">
            <div className="ai-panel">
              <span className="ai-panel-label">Drop in</span>
              <div className="ai-receipt" aria-hidden="true">
                <span className="ai-rline w-60" />
                <span className="ai-rline w-40" />
                <span className="ai-rline w-80" />
                <span className="ai-rline w-50" />
                <span className="ai-rline w-70" />
                <span className="ai-rline w-30" />
              </div>
              <span className="ai-file"><Icon name="receipt" size={15} />receipt.pdf</span>
            </div>
            <span className="ai-arrow" aria-hidden="true"><Icon name="chevron" size={22} /></span>
            <div className="ai-panel ai-panel-out">
              <span className="ai-panel-label">Read out</span>
              <ul className="ai-fields">
                {AI_FIELDS.map((f) => (
                  <li key={f.k} className="ai-field">
                    <span className="k">{f.k}</span>
                    <span className="v" style={f.color ? { color: f.color } : undefined}>{f.v}</span>
                  </li>
                ))}
              </ul>
              <div className="ai-lines">
                {AI_LINES.map((l) => (
                  <div key={l.name} className="ai-lineitem">
                    <span className="chk"><Icon name="check" size={13} /></span>
                    <span className="nm">{l.name}</span>
                    <span className="pr">{l.price}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <ul className="ai-notes">
            {AI_NOTES.map((n) => (
              <li key={n.label} className="ai-note">
                <span className="ai-note-ico"><Icon name={n.icon} size={15} /></span>
                {n.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Principles */}
      <section id="trust" style={{ padding: '48px 0 64px' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <p className="mono" style={{ marginBottom: 12 }}>Built on principles, not promises</p>
            <h2 style={section}>Your data, your rules</h2>
          </div>
          <ul className="trust-grid">
            {TRUST.map((t) => (
              <li key={t.title} className="card trust-card">
                <span className="trust-icon" style={{ color: t.color }}>
                  <span className="trust-glow" style={{ background: t.color }} />
                  <Icon name={t.icon} size={20} />
                </span>
                <h3 style={{ fontSize: '1rem', margin: '14px 0 6px' }}>{t.title}</h3>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', lineHeight: 1.5 }}>{t.desc}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Self-host */}
      <section id="self-host" style={{ padding: '64px 0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p className="mono" style={{ marginBottom: 12 }}>Self-host</p>
            <h2 style={{ ...section, marginBottom: 14 }}>Up and running in three steps</h2>
            <p style={{ color: 'var(--text-dim)', maxWidth: 560, margin: '0 auto' }}>
              Free software under AGPL-3.0. You manage the installation, accounts, storage and backups. There is no
              hosted service and no subscription.
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
          <div className="code-wrap">
            <CopyButton text={QUICKSTART} />
            <pre className="code-block" aria-label="Docker quick start">
              <span className="tok-cmd">git clone</span> {GITHUB_URL}.git{'\n'}
              <span className="tok-cmd">cd</span> pharos{'\n'}
              <span className="tok-cmd">cp</span> .env.example .env   <span className="tok-comment"># set your secrets first</span>{'\n'}
              <span className="tok-cmd">docker compose up</span> -d --build{'\n'}
              {'\n'}
              <span className="tok-comment"># Open http://localhost:3000 and follow the setup wizard</span>
            </pre>
          </div>
          <p style={{ textAlign: 'center', marginTop: 20 }}>
            <GithubLink className="inline-link" href={`${GITHUB_URL}/blob/main/docs/self-hosting.md`}>Read the complete installation guide</GithubLink>
          </p>
          <div className="deploy-strip">
            <p className="mono deploy-label">Runs anywhere Docker does</p>
            <ul className="deploy-pills">
              {DEPLOY_TARGETS.map((target) => (
                <li key={target} className="deploy-pill">
                  <span className="deploy-dot" aria-hidden="true" />
                  {target}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid var(--border)', padding: '56px 0 32px' }}>
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <PharosMark size={24} />
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '0.14em', fontSize: '1rem' }}>PHAROS</span>
              </div>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', maxWidth: 280 }}>
                One light over everything you run. A self-hosted personal hub for your household.
              </p>
            </div>
            <div className="footer-col">
              <p className="footer-heading mono">Product</p>
              <a href="#features" className="navlink">Features</a>
              <a href="#ai" className="navlink">Optional AI</a>
              <a href="#self-host" className="navlink">Self-host</a>
              <a href="/status" className="navlink">Project status</a>
            </div>
            <div className="footer-col">
              <p className="footer-heading mono">Project</p>
              <a href="/privacy" className="navlink">Privacy</a>
              <a href="/terms" className="navlink">License</a>
              <a href={GITHUB_URL} className="navlink" target="_blank" rel="noopener noreferrer">GitHub</a>
              <a href={`${GITHUB_URL}/tree/main/docs`} className="navlink" target="_blank" rel="noopener noreferrer">Documentation</a>
            </div>
          </div>
          <div className="footer-bar">
            <span className="mono" style={{ color: 'var(--text-faint)' }}>PHAROS · AGPL-3.0</span>
            <span className="mono" style={{ color: 'var(--text-faint)' }}>Open source · self-hosted · no telemetry</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
