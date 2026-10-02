import { redirect } from 'next/navigation';

// Your account lives in Settings › You now (one place for settings).
export default function AccountPage() {
  redirect('/settings?tab=account');
}
