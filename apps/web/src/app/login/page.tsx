import { redirect } from 'next/navigation';
import { saasMode } from '@/lib/tenancy/saasMode';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { getCurrentUser } from '@/lib/auth';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sign in · Pharos' };

export default async function LoginPage() {
  // SAAS_MODE: this is the SELF-HOSTED login, and it must not appear for a hosted customer.
  // A tenant database legitimately contains zero `User` documents, so the first-run branch below
  // would fire on every workspace and hand a paying customer the "create your admin account"
  // wizard. Send them to the account login instead — that is the only sign-in that exists here.
  if (saasMode()) redirect('/account/login');
  // Already signed in → home.
  if (await getCurrentUser()) redirect('/');
  // First run (no accounts) → setup wizard.
  await connectDB();
  if ((await User.countDocuments()) === 0) redirect('/setup');
  return <LoginForm />;
}
