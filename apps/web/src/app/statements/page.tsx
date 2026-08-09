import { connectDB } from '@/lib/db';
import { Statement as StatementModel } from '@/models/Statement';
import { Card as CardModel } from '@/models/Card';
import { Item as ItemModel } from '@/models/Item';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { isAiReady } from '@/lib/ollama';
import { getAppSettings } from '@/lib/appSettings';
import { StatementsClient, type ItemOption } from './StatementsClient';
import type { SerializedStatement, SerializedCard } from '@/types';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{
  statements: SerializedStatement[];
  cards: SerializedCard[];
  items: ItemOption[];
  ollamaUp: boolean;
}> {
  // The whole read runs inside the caller's workspace: statements, cards and the item options are
  // customer data, and this page read the DEFAULT database in SaaS mode while statements/actions.ts
  // already wrote the tenant's — so a workspace edited its own statement and kept seeing the shared
  // one. Self-hosted resolves to the default tenant with zero work (lib/tenancy/request).
  return withRequestTenant(async () => {
    await connectDB();
    const [Statement, Card, Item] = await Promise.all([
      currentModel(StatementModel),
      currentModel(CardModel),
      currentModel(ItemModel),
    ]);
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
  });
}

export default async function StatementsPage() {
  const [{ statements, cards, items, ollamaUp }, settings] = await Promise.all([getData(), getAppSettings()]);
  return (
    <StatementsClient
      statements={statements}
      cards={cards}
      items={items}
      ollamaUp={ollamaUp}
      baseCurrency={settings.currency}
      multiCurrency={settings.multiCurrency} // P9: off = no per-statement currency controls at all
    />
  );
}
