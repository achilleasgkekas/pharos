import { PharosMark } from './components/PharosMark';
import { GithubLink } from './components/GithubLink';
import { GITHUB_URL, REPO_PUBLIC } from './site';

const features = [
  ['Inventory & shopping', 'Keep track of what you own, warranties, wishlists and store prices.'],
  ['Receipts & statements', 'Organize documents, card statements and installments. Add everything manually or use optional AI parsing.'],
  ['Expenses & planning', 'See bills, subscriptions, budgets, income and upcoming payments together.'],
  ['Your data, your choices', 'Use your own hardware and backups. Choose local AI or connect a provider when you need it.'],
];

export default function Home() {
  return (
    <main>
      <header className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBlock: 24, gap: 24 }}>
        <a href="/" aria-label="Pharos home" style={{ display: 'flex', alignItems: 'center', gap: 12 }}><PharosMark size={36} /> PHAROS</a>
        <nav aria-label="Main navigation" style={{ display: 'flex', gap: 20 }}><a href="#features">Features</a><a href="#self-host">Self-host</a></nav>
      </header>
      <section className="container" style={{ paddingBlock: 80, maxWidth: 900 }}>
        <p className="eyebrow">SELF-HOSTED · AGPL-3.0</p>
        <h1 style={{ fontSize: 'clamp(2.5rem, 7vw, 5rem)', lineHeight: 1.08, marginBlock: 24 }}>A private home for<br />everything you own.</h1>
        <p style={{ fontSize: '1.2rem', maxWidth: 640, lineHeight: 1.7 }}>Your inventory, receipts, expenses and plans in one dashboard. Run Pharos on your own hardware. AI is optional.</p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 32 }}>
          <a href="#self-host" className="btn btn-primary">Get started</a>
          <GithubLink kind="button" className="btn btn-ghost">View source</GithubLink>
        </div>
      </section>
      <section id="features" className="container" style={{ paddingBlock: 48 }}>
        <h2>One place for the everyday details</h2>
        <div className="feature-grid" style={{ marginTop: 32 }}>
          {features.map(([title, description]) => <article key={title} className="feature-card"><h3>{title}</h3><p>{description}</p></article>)}
        </div>
      </section>
      <section id="self-host" className="container" style={{ paddingBlock: 64, maxWidth: 900 }}>
        <h2>Self-host Pharos</h2>
        <p>Pharos is free software under AGPL-3.0. You manage the installation, user accounts, storage and backups. There is no managed service or hosted subscription.</p>
        {REPO_PUBLIC ? (
          <>
            <pre style={{ overflowX: 'auto', padding: 24, marginBlock: 24, background: 'var(--surface)' }}><code>{`git clone ${GITHUB_URL}.git\ncd pharos\ncp .env.example .env\n# Generate and set your secrets in .env before starting\ndocker compose up -d`}</code></pre>
            <GithubLink kind="inline" href={`${GITHUB_URL}/blob/main/docs/self-hosting.md`}>Read the complete installation guide</GithubLink>
          </>
        ) : <p>The public source release is being prepared. Installation links will appear here when it is available.</p>}
      </section>
      <footer className="container" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', paddingBlock: 32 }}>
        <span>PHAROS · Self-hosted personal hub</span><a href="/privacy">Privacy</a><a href="/terms">License</a><a href="/status">Project status</a>
      </footer>
    </main>
  );
}
