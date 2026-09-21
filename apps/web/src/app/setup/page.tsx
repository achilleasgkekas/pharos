import { redirect } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { getCurrentUser } from '@/lib/auth';
import { SetupWizard } from './SetupWizard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Set up Pharos' };

export default async function SetupPage() {
  await connectDB();
  // First run = zero accounts. Once accounts exist, only the freshly-created admin
  // (now signed in) may stay — they're mid-wizard on steps 2–4. Anyone NOT signed in
  // is bounced to /login. NOTE: step 1 sets the session cookie, and the server action
  // that runs it auto-revalidates this route; the `!user` check keeps that re-render
  // from kicking the admin out of their own wizard.
  if ((await User.countDocuments()) > 0 && !(await getCurrentUser())) {
    redirect('/login');
  }
  return <SetupWizard />;
}
