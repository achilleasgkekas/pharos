import { connectDB } from '@/lib/db';
import { Item } from '@/models/Item';
import { Receipt } from '@/models/Receipt';
import { Statement } from '@/models/Statement';
import { Subscription } from '@/models/Subscription';
import { Card } from '@/models/Card';
import { AppConfig } from '@/models/AppConfig';
import { isOllamaHealthy } from '@/lib/ollama';
import { getAiConfig } from '@/lib/aiConfig';
import { getAppSettings } from '@/lib/appSettings';
import { getStores } from '@/lib/storeService';
import { SettingsClient } from './SettingsClient';
import { listOllamaModels, getPromptsForEditor, getScraperAi, getStorageInfo, getListsForEditor } from './actions';
import type { SerializedCard } from '@/types';

export const dynamic = 'force-dynamic';

async function getInfo() {
  await connectDB();
  const [items, receipts, statements, subscriptions, cards, cardList, ollamaUp, cfg, installed, doc, stores, settings, prompts, scraperAi, storage] =
    await Promise.all([
      Item.countDocuments(),
      Receipt.countDocuments(),
      Statement.countDocuments(),
      Subscription.countDocuments(),
      Card.countDocuments(),
      Card.find().sort({ name: 1 }).lean(),
      isOllamaHealthy(),
      getAiConfig(),
      listOllamaModels(),
      AppConfig.findOne({ key: 'singleton' }).lean(),
      getStores(),
      getAppSettings(),
      getPromptsForEditor(),
      getScraperAi(),
      getStorageInfo(),
    ]);
  const lists = await getListsForEditor();
  return {
    counts: { items, receipts, statements, subscriptions, cards },
    cardList: JSON.parse(JSON.stringify(cardList)) as SerializedCard[],
    lists,
    ollamaUp,
    stores,
    settings,
    prompts,
    scraperAi,
    storage,
    ai: {
      // What the user picked (may differ from effective if no key yet)
      selectedProvider: (doc?.aiProvider as 'ollama' | 'anthropic') || 'ollama',
      effectiveProvider: cfg.provider,
      ollamaHost: cfg.ollamaHost,
      ollamaModel: cfg.ollamaModel,
      ollamaVisionModel: cfg.ollamaVisionModel,
      anthropicModel: cfg.anthropicModel,
      hasKey: !!(doc?.anthropicApiKey || process.env.ANTHROPIC_API_KEY),
      confirmBulk: doc?.aiConfirmBulk !== false, // cost guard, default ON
      installed, // [{ name, sizeGB }]
    },
  };
}

export default async function SettingsPage() {
  const info = await getInfo();
  return <SettingsClient info={info} />;
}
