import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Privacy · PHAROS' };
export default function Privacy() {
  return <main className="container" style={{ maxWidth: 800, paddingBlock: 64 }}>
    <a href="/">← PHAROS</a><h1>Privacy in your installation</h1>
    <p>Pharos is self-hosted software. Your instance operator controls its database, files, accounts and backups.</p>
    <p>Optional integrations can send data to services you configure. For example, selecting a cloud AI provider sends the content being processed to that provider; notifications and remote storage use their configured destinations. Review your settings and each service’s privacy terms.</p>
    <p>Contact your instance operator about access to, export of, or deletion of data stored in that installation.</p>
  </main>;
}
