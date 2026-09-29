import { getConversations, getAiRunsAction } from './actions';
import { HistoryClient } from './HistoryClient';
import { getAppSettings } from '@/lib/appSettings';
import { fetchFxRate } from '@/lib/fxRates';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI history · Pharos' };

export default async function HistoryPage() {
  const [conversations, initialRunsData, settings] = await Promise.all([
    getConversations(),
    getAiRunsAction({ limit: 100 }),
    getAppSettings(),
  ]);

  const currency = settings.currency || 'EUR';
  let fxRate = 1;
  if (currency !== 'USD') {
    const res = await fetchFxRate('USD', currency).catch(() => null);
    if (res && res.ok) {
      fxRate = res.hit.rate;
    } else {
      fxRate = currency === 'EUR' ? 0.92 : 1;
    }
  }

  return (
    <HistoryClient
      conversations={conversations}
      initialRunsData={initialRunsData}
      currency={currency}
      fxRate={fxRate}
    />
  );
}

