import type { Metadata } from 'next';
import { GithubLink } from '../components/GithubLink';
import { InfoPage } from '../components/InfoPage';
import { GITHUB_URL } from '../site';

export const metadata: Metadata = { title: 'Project status · PHAROS' };

export default function Status() {
  return (
    <InfoPage
      eyebrow="Project status"
      title="Actively developed, self-hosted"
      lead="PHAROS is developed as a self-hosted personal hub for households. The former managed hosted product has been retired, and existing self-hosted installations keep working as before."
      points={[
        { icon: 'package', color: 'var(--accent)', title: 'What it covers today', body: 'Inventory and shopping, receipts, expenses and income, card statements, subscriptions, bills, utilities, vehicles, vouchers, documents, special dates, calendar, savings, reports and tasks.' },
        { icon: 'bell', color: 'var(--cyan)', title: 'Where work happens', body: 'Issues, pull requests and releases are public in the GitHub repository.' },
        { icon: 'database', color: 'var(--purple)', title: 'Updating safely', body: 'Keep your database, storage folder and secrets when you update. Updates never require deleting volumes.' },
      ]}
    >
      <GithubLink className="btn btn-ghost" href={`${GITHUB_URL}/releases`}>Releases</GithubLink>
    </InfoPage>
  );
}
