import { connectDB } from '@/lib/db';
import { Statement } from '@/models/Statement';
import { Card } from '@/models/Card';
import { Item } from '@/models/Item';
import { isAiReady } from '@/lib/ollama';
import { StatementsClient, type ItemOption } from './StatementsClient';
import type { SerializedStatement, SerializedCard } from '@/types';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{
  statements: SerializedStatement[];
  cards: SerializedCard[];
  items: ItemOption[];
  ollamaUp: boolean;
}> {
  await connectDB();
  const [statements, cards, items, ollamaUp] = await Promise.all([
    Statement.find().sort({ period: -1, card: 1 }).lean(),
    Card.find().sort({ name: 1 }).lean(),
    Item.find().select('title num category status currentPrice purchasedPrice').sort({ title: 1 }).lean(),
    isAiReady(),
  ]);
  return {
    statements: JSON.parse(JSON.stringify(statements)),
    cards: JSON.parse(JSON.stringify(cards)),
    items: JSON.parse(JSON.stringify(items)),
    ollamaUp,
  };
}

export default async function StatementsPage() {
  const { statements, cards, items, ollamaUp } = await getData();
  return <StatementsClient statements={statements} cards={cards} items={items} ollamaUp={ollamaUp} />;
}
