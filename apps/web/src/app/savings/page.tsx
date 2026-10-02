import { SavingsClient } from './SavingsClient';
import { loadSavingsData } from './data';
import { aiFeatureStatus } from '@/lib/aiFeatures.server';
import { withRequestTenant } from '@/lib/tenancy/request';

export const dynamic = 'force-dynamic';

export default async function SavingsPage() {
  const [data, ai] = await Promise.all([loadSavingsData(), withRequestTenant(() => aiFeatureStatus('savingsPlan'))]);
  return <SavingsClient data={data} aiOn={ai !== 'disabled'} />;
}
