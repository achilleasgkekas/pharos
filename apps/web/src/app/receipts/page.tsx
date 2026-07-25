import { connectDB } from '@/lib/db';
import { Receipt as ReceiptModel } from '@/models/Receipt';
import { Card as CardModel } from '@/models/Card';
import { isAiReady } from '@/lib/ollama';
import { getStores } from '@/lib/storeService';
import { getAppSettings } from '@/lib/appSettings';
import { effectiveReturnWindow, returnDaysLeft } from '@/lib/returnWindow';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { ReceiptsClient } from './ReceiptsClient';
import { backfillReceiptThumbs, getEmailInboxCount } from './actions';
import type { SerializedReceipt, SerializedCard } from '@/types';

export const dynamic = 'force-dynamic';

async function getData(): Promise<{ receipts: SerializedReceipt[]; cards: SerializedCard[]; ollamaUp: boolean; storeNames: string[]; emailInboxCount: number; baseCurrency: string; multiCurrency: boolean }> {
  return withRequestTenant(async () => {
  await connectDB();
  const Receipt = await currentModel(ReceiptModel);
  const Card = await currentModel(CardModel);
  // Self-heal thumbnails in the background — never block the page render on it.
  // New uploads generate their thumb at upload time, so this only matters for
  // old/failed ones and can safely catch up on a later load.
  void backfillReceiptThumbs().catch(() => {});
  const [receipts, cards, ollamaUp, stores, emailInboxCount, settings] = await Promise.all([
    // -rawAiResponse: debug-only blob (full AI JSON per receipt) — never rendered,
    // and with ~270 receipts it bloats the RSC payload by hundreds of KB.
    Receipt.find().select('-rawAiResponse').sort({ date: -1, createdAt: -1 }).lean(),
    Card.find({ active: true }).sort({ name: 1 }).lean(),
    isAiReady(),
    getStores(),
    getEmailInboxCount(),
    getAppSettings(),
  ]);
  // Annotate each non-archived receipt still inside its store's return window with
  // the computed days left (PA3) — powers the "N days to return" badge client-side.
  const now = Date.now();
  const serialized: SerializedReceipt[] = JSON.parse(JSON.stringify(receipts));
  for (const r of serialized) {
    if (r.archived) continue;
    const win = effectiveReturnWindow(r.store, stores, settings.defaultReturnWindowDays);
    const days = returnDaysLeft(r.date, win, now);
    if (days !== null) r.returnDaysLeft = days;
  }
  return {
    receipts: serialized,
    cards: JSON.parse(JSON.stringify(cards)),
    ollamaUp,
    storeNames: stores.map((s) => s.name),
    emailInboxCount,
    baseCurrency: settings.currency,
    multiCurrency: settings.multiCurrency, // P9: off = no per-receipt currency controls at all
  };
  });
}

export default async function ReceiptsPage() {
  const { receipts, cards, ollamaUp, storeNames, emailInboxCount, baseCurrency, multiCurrency } = await getData();
  return (
    <ReceiptsClient
      receipts={receipts}
      cards={cards}
      ollamaUp={ollamaUp}
      storeNames={storeNames}
      emailInboxCount={emailInboxCount}
      baseCurrency={baseCurrency}
      multiCurrency={multiCurrency}
    />
  );
}
