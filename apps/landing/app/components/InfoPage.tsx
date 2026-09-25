import { PharosMark } from './PharosMark';
import { Icon } from './Icon';

export type InfoPoint = { icon: string; color: string; title: string; body: React.ReactNode };

/** Shared layout for the short info pages (privacy, license, status): a title, a lead line
 *  and a list of icon cards, in the same visual language as the home page. */
export function InfoPage({ eyebrow, title, lead, points, children }: { eyebrow: string; title: string; lead: string; points: InfoPoint[]; children?: React.ReactNode }) {
  return (
    <main id="main" className="container info-page">
      <a href="/" className="back"><PharosMark size={22} /> Back to PHAROS</a>
      <p className="mono" style={{ marginTop: 40 }}>{eyebrow}</p>
      <h1>{title}</h1>
      <p className="lead">{lead}</p>
      <ul className="info-list">
        {points.map((p) => (
          <li key={p.title} className="card info-item">
            <span className="trust-icon" style={{ color: p.color }}>
              <span className="trust-glow" style={{ background: p.color }} />
              <Icon name={p.icon} size={20} />
            </span>
            <div>
              <h2>{p.title}</h2>
              <p>{p.body}</p>
            </div>
          </li>
        ))}
      </ul>
      {children && <div style={{ marginTop: 32 }}>{children}</div>}
    </main>
  );
}
