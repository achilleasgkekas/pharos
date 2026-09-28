import { getConversations, getAiRunsAction } from './actions';
import { HistoryClient } from './HistoryClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI history · Pharos' };

export default async function HistoryPage() {
  const [conversations, initialRunsData] = await Promise.all([
    getConversations(),
    getAiRunsAction({ limit: 100 }),
  ]);
  return <HistoryClient conversations={conversations} initialRunsData={initialRunsData} />;
}
