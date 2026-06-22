import { getConversations } from './actions';
import { HistoryClient } from './HistoryClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI history · Pharos' };

export default async function HistoryPage() {
  const conversations = await getConversations();
  return <HistoryClient conversations={conversations} />;
}
