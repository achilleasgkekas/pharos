import type { Metadata } from 'next';
import { InfoPage } from '../components/InfoPage';

export const metadata: Metadata = { title: 'Privacy · PHAROS' };

export default function Privacy() {
  return (
    <InfoPage
      eyebrow="Privacy"
      title="Your installation, your data"
      lead="PHAROS is self-hosted software. Whoever runs an installation controls its database, files, accounts and backups. There is no PHAROS cloud that receives your data."
      points={[
        { icon: 'server', color: 'var(--accent)', title: 'Stored on your server', body: 'Records live in your MongoDB and files in your storage folder (or the NAS, SMB, FTP or OneDrive location you choose).' },
        { icon: 'eyeOff', color: 'var(--cyan)', title: 'No telemetry', body: 'The app does not report usage or analytics to anyone. Error reporting stays off unless you set your own Sentry DSN.' },
        { icon: 'unlock', color: 'var(--purple)', title: 'Only the services you connect', body: 'If you choose a cloud AI provider, the document being processed is sent to that provider. Notifications, web push, price searches and storage mirrors go only to the destinations you configure. Check each service’s own privacy terms.' },
        { icon: 'users', color: 'var(--gold)', title: 'Ask your operator', body: 'For access to, export of, or deletion of data in a PHAROS installation, contact the person who runs it. Admins can export everything from Settings.' },
      ]}
    />
  );
}
