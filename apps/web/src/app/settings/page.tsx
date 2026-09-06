import { connectDB } from '@/lib/db';
import { Item as ItemModel } from '@/models/Item';
import { Receipt as ReceiptModel } from '@/models/Receipt';
import { Statement as StatementModel } from '@/models/Statement';
import { Subscription as SubscriptionModel } from '@/models/Subscription';
import { Card as CardModel } from '@/models/Card';
import { AppConfig as AppConfigModel } from '@/models/AppConfig';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { isOllamaHealthy, isAiReady } from '@/lib/ollama';
import { getAiConfig } from '@/lib/aiConfig';
import { getAiBudgetStatus } from '@/lib/aiBudget';
import { getAppSettings } from '@/lib/appSettings';
import { saasUiEnabled } from '@/lib/tenancy/saasPage';
import { getStores } from '@/lib/storeService';
import { SettingsClient } from './SettingsClient';
import { listOllamaModels, getPromptsForEditor, getScraperAi, getStorageInfo, getListsForEditor, getImapInfo } from './actions';
import { requireUser } from '@/lib/auth';
import type { SerializedCard } from '@/types';

export const dynamic = 'force-dynamic';

async function getInfo() {
  return withRequestTenant(async () => {
  await connectDB();
  const Item = await currentModel(ItemModel);
  const Receipt = await currentModel(ReceiptModel);
  const Statement = await currentModel(StatementModel);
  const Subscription = await currentModel(SubscriptionModel);
  const Card = await currentModel(CardModel);
  const AppConfig = await currentModel(AppConfigModel);
  const [items, receipts, statements, subscriptions, cards, cardList, ollamaUp, aiReady, cfg, installed, doc, stores, settings, prompts, scraperAi, storage, imap] =
    await Promise.all([
      Item.countDocuments(),
      Receipt.countDocuments(),
      Statement.countDocuments(),
      Subscription.countDocuments(),
      Card.countDocuments(),
      Card.find().sort({ name: 1 }).lean(),
      isOllamaHealthy(),
      isAiReady(),
      getAiConfig(),
      listOllamaModels(),
      AppConfig.findOne({ key: 'singleton' }).lean(),
      getStores(),
      getAppSettings(),
      getPromptsForEditor(),
      getScraperAi(),
      getStorageInfo(),
      getImapInfo(),
    ]);
  const lists = await getListsForEditor();
  const aiBudget = await getAiBudgetStatus();
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
    imap,
    // Hosted vs self-hosted: the settings UI hides what the account area already owns.
    saas: saasUiEnabled(),
    ai: {
      // What the user picked (may differ from effective if no key yet)
      selectedProvider: ((doc?.aiProvider as string) || 'ollama') as 'ollama' | 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'custom',
      effectiveProvider: cfg.provider,
      ollamaHost: cfg.ollamaHost,
      ollamaModel: cfg.ollamaModel,
      ollamaVisionModel: cfg.ollamaVisionModel,
      anthropicModel: cfg.anthropicModel,
      anthropicWorkspaceId: cfg.anthropicWorkspaceId,
      hasKey: !!(doc?.anthropicApiKey || process.env.ANTHROPIC_API_KEY),
      openaiModel: cfg.openaiModel,
      hasOpenaiKey: !!cfg.openaiApiKey,
      geminiModel: cfg.geminiModel,
      hasGeminiKey: !!cfg.geminiApiKey,
      openrouterModel: cfg.openrouterModel,
      hasOpenrouterKey: !!cfg.openrouterApiKey,
      customBaseUrl: cfg.customBaseUrl,
      customModel: cfg.customModel,
      hasCustomKey: !!cfg.customApiKey,
      confirmBulk: doc?.aiConfirmBulk !== false, // cost guard, default ON
      // Self-hosted AI spend cap + this month's running spend (both in `currency`); 0 = no cap.
      monthlyBudget: aiBudget.budget,
      spentThisMonth: aiBudget.spent,
      currency: settings.currency,
      installed, // [{ name, sizeGB }]
      // Optional-AI controls
      enabled: doc?.aiEnabled !== false, // master switch, default ON
      features: (doc?.aiFeatures as Record<string, boolean>) || {},
      ready: aiReady, // provider-aware readiness (drives per-feature status chips)
    },
  };
  });
}

export default async function SettingsPage() {
  const me = await requireUser();
  const info = await getInfo();
  return <SettingsClient info={info} currentUser={{ id: me.id, name: me.name, role: me.role }} />;
}
