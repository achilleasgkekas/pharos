import { redirect } from 'next/navigation';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { getCurrentUser } from '@/lib/auth';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sign in · Pharos' };

export default async function LoginPage() {
  // Already signed in → home.
  if (await getCurrentUser()) redirect('/');
  // First run (no accounts) → setup wizard.
  await connectDB();
  if ((await User.countDocuments()) === 0) redirect('/setup');
  return <LoginForm />;
}
