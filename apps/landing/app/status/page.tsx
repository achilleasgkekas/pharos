import type { Metadata } from 'next';
import { GithubLink } from '../components/GithubLink';
import { InfoPage } from '../components/InfoPage';
import { GITHUB_URL, REPO_PUBLIC } from '../site';

export const metadata: Metadata = { title: 'Project status · PHAROS' };

export default function Status() {
  return (
    <InfoPage
      eyebrow="Project status"
      title="Actively developed, self-hosted"
      lead="PHAROS is developed as a self-hosted personal hub for households. The former managed hosted product has been retired, and existing self-hosted installations keep working as before."
      points={[
        { icon: 'package', color: 'var(--accent)', title: 'What it covers today', body: 'Inventory and shopping, receipts, expenses and income, card statements, subscriptions, bills, utilities, vehicles, vouchers, documents, special dates, calendar, savings, reports and tasks.' },
        { icon: 'bell', color: 'var(--cyan)', title: 'Where work happens', body: REPO_PUBLIC ? 'Issues, pull requests and releases are public in the repository.' : 'The public source release is being prepared. Development activity will be visible in the repository once it opens.' },
        { icon: 'database', color: 'var(--purple)', title: 'Updating safely', body: 'Keep your database, storage folder and secrets when you update. Updates never require deleting volumes.' },
      ]}
    >
      <GithubLink kind="button" className="btn btn-ghost" href={`${GITHUB_URL}/releases`}>Releases</GithubLink>
    </InfoPage>
  );
}
