import { getTrash } from '@/app/settings/actions';
import { TrashClient } from './TrashClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Trash · Pharos' };

export default async function TrashPage() {
  const rows = await getTrash();
  return <TrashClient rows={rows} />;
}
