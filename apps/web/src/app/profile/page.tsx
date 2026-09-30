import { requireUser } from '@/lib/auth';
import { getProfile } from './actions';
import { ProfileClient } from './ProfileClient';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  await requireUser();
  const profile = await getProfile();
  return <ProfileClient profile={profile} />;
}
