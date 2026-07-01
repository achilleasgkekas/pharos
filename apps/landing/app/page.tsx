import { PharosMark } from './components/PharosMark';

const GITHUB_URL = 'https://github.com/AchilleasGekas/pharos';

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
      <section
        id="top"
        style={{
          textAlign: 'center',
          padding: '112px 0 96px',
        }}
      >
        <div className="container" style={{ maxWidth: 820 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
            <PharosMark size={72} />
          </div>

          <p className="mono" style={{ marginBottom: 20 }}>
            Personal Hub · Asset &amp; Resource Oversight System
          </p>

          <h1
            style={{
              fontSize: 'clamp(2.4rem, 6vw, 4.2rem)',
              fontWeight: 800,
              marginBottom: 22,
            }}
          >
            One light over{' '}
            <span
              style={{
                background:
                  'linear-gradient(90deg, var(--accent), var(--cyan), var(--purple))',
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

          <div
            style={{
              display: 'flex',
              gap: 14,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <a href="#pricing" className="btn btn-primary">Get started</a>
            <a href="#pricing" className="btn btn-ghost">Self-host it free</a>
          </div>
        </div>
      </section>

      {/* ── Placeholder anchors for upcoming sections ─────── */}
      <section id="features" style={{ padding: '48px 0' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <p className="mono">Features · coming next</p>
        </div>
      </section>

      <section id="pricing" style={{ padding: '48px 0 96px' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <p className="mono">Pricing · coming next</p>
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
            <span className="mono" style={{ color: 'var(--text-dim)' }}>
              PHAROS · AGPL-3.0
            </span>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            <a href={GITHUB_URL} className="navlink" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a href={`${GITHUB_URL}/blob/main/LICENSE`} className="navlink" target="_blank" rel="noopener noreferrer">
              License
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
