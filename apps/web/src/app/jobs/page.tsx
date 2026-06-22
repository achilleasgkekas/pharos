import { getJobs } from '@/app/jobActions';
import { getSyncManifest } from '@/app/settings/actions';
import { JobsPageClient } from './JobsPageClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Jobs · Pharos' };

export default async function JobsPage() {
  const [jobs, manifest] = await Promise.all([getJobs(), getSyncManifest()]);
  const sync = { ok: manifest.ok, error: manifest.error, count: manifest.items.length };
  return <JobsPageClient initialJobs={jobs} sync={sync} />;
}
