'use server';
import { cur } from "@/lib/money";
import { connectDB } from '@/lib/db';
import { AppConfig } from '@/models/AppConfig';
import { Store } from '@/models/Store';
import { Receipt } from '@/models/Receipt';
import { Item } from '@/models/Item';
import { Statement } from '@/models/Statement';
import { Subscription } from '@/models/Subscription';
import { Voucher } from '@/models/Voucher';
import { GiftCard } from '@/models/GiftCard';
import { LoyaltyCard } from '@/models/LoyaltyCard';
import { giftCardBalance, giftCardDaysLeft } from '@/lib/giftcard';
import { Bill } from '@/models/Bill';
import { billDaysUntilDue } from '@/lib/bill';
import { collectMaintenanceDue, MAINTENANCE_STATUSES, type MaintenanceRow } from '@/lib/maintenance';
import { collectLendingOverdue, LENDING_STATUSES, type LendingRow } from '@/lib/lending';
import { collectStaleClaims, CLAIM_STATUSES_APPLY_TO, DEFAULT_STALE_CLAIM_DAYS, type StaleClaimRow } from '@/lib/warrantyClaims';
import { Card } from '@/models/Card';
import { Task } from '@/models/Task';
import { Expense } from '@/models/Expense';
import { Goal } from '@/models/Goal';
import { invalidateAiConfigCache, getAiConfig } from '@/lib/aiConfig';
import {
  invalidateOllamaHealth,
  RECEIPT_SYSTEM_PROMPT,
  STATEMENT_SYSTEM_PROMPT,
  PRODUCT_PROMPT,
  CARD_PROMPT,
  SUBSCRIPTION_PROMPT,
  CATEGORY_PROMPT,
  EXPENSE_PROMPT,
  VOUCHER_PROMPT,
  PRODUCT_PHOTO_PROMPT,
} from '@/lib/ollama';
import {
  PROMPT_META,
  DEFAULT_SCRAPER_PRICE_PROMPT,
  getAllPromptOverrides,
  invalidatePromptsCache,
  type PromptKey,
} from '@/lib/prompts';
import { TAXONOMY_META, normalizeList, normalizeSpaces, type TaxonomyKey } from '@/lib/taxonomies';
import { getStorageConfig, invalidateStorageConfig, type StorageBackend } from '@/lib/storageConfig';
import { pushBatchToRemote, testRemote, type RemoteFile } from '@/lib/remoteStorage';
import { renderStoragePath, DEFAULT_FOLDER_TEMPLATE, DEFAULT_NAME_TEMPLATE } from '@/lib/storagePath';
import { readFile, deleteFile } from '@/lib/storage';
import { getImapConfig, invalidateImapConfig } from '@/lib/imapConfig';
import { testImapConnection, fetchNewEmails } from '@/lib/imapImport';
import { uploadReceipt } from '@/app/receipts/actions';
import { Types } from 'mongoose';
import { getStores, invalidateStoreCache, type StoreLite } from '@/lib/storeService';
import { effectiveReturnWindow, returnDaysLeft } from '@/lib/returnWindow';
import { suggestBudgetsFromExpenses, type BudgetExpenseRow } from '@/lib/budgetSuggest';
import { resolveCategoryRules } from '@/lib/categoryRules';
import { detectPriceHikes, type HikeEntry } from '@/lib/priceHike';
import { anthropicTest } from '@/lib/anthropic';
import { getAppSettings, invalidateAppSettings } from '@/lib/appSettings';
import { assertCanWrite, requireAdmin } from '@/lib/auth';
import { AI_FEATURE_KEYS, type AiFeatureKey } from '@/lib/aiFeatures';
import { PROVIDER_RECOMMEND, priceForModel, looksVisionModel, type FetchedModel, type AiProviderId } from '@/lib/aiModels';
import { startDeviceCode, pollDeviceToken, getOnedriveCreds, disconnectOnedrive, testOnedrive, uploadToOnedrive, type DeviceCode } from '@/lib/onedrive';
import { runNtfyTest } from '@/lib/notify';
import { ALERT_TYPE_KEYS, resolveNotifyTypes, type NotifyTypes } from '@/lib/alertTypes';
import { BACKUP_MODELS, BACKUP_KEYS } from '@/lib/backupModels';
import { verifyBackupJson, formatBackupCounts, type BackupVerifyResult } from '@/lib/backupVerify';
import { detectSyncStaleness, formatSyncStaleness } from '@/lib/syncStaleness';
import { markRemoteSync, getLastRemoteSync } from '@/lib/syncState';
import { splitFreshAlerts } from '@/lib/alertDedup';
import { dispatchAlert, getNotifiers, testNotifier, type NotifierConfig } from '@/lib/notifiers';
import { getDeliveryLog } from '@/lib/deliveryLog';
import type { DeliveryLogEntry } from '@/lib/deliveryLog.shared';
import { computeInstallmentPlans } from '@/lib/installments';
import { generateNotifications } from '@/app/notifications/actions';
import { detectBudgetExceeded, type BudgetAlertRow } from '@/lib/budgetAlert';
import { estimatedItemValue } from '@/lib/depreciation';
import { buildInsuranceCsv, buildInsuranceHtml, type InsuranceItem } from '@/lib/insuranceExport';
import { buildTaxCsv, buildTaxHtml, type TaxExpenseRow } from '@/lib/taxExport';
import JSZip from 'jszip';
import {
  getEventWebhooks,
  dispatchEventWebhooks,
  testEventWebhook,
  generateWebhookSecret,
  WEBHOOK_EVENTS,
  type WebhookSubscription,
} from '@/lib/webhooks';
import { assertPublicUrl } from '@/lib/ssrf';
import type { SerializedStatement } from '@/types';
import { revalidatePath } from 'next/cache';
import type { Model } from 'mongoose';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';

/**
 * Every model this file touches, routed to the CALLER'S workspace database.
 *
 * Settings used the imported models directly, so in SaaS mode a workspace's Settings page read
 * and wrote the DEFAULT database: currency, budgets, AI prompts and keys, notifiers, stores and
 * payment cards were SHARED across every customer. With one workspace that is invisible; the day
 * a second one exists their settings are each other's.
 *
 * `withRequestTenant` does double duty here and that is the point of putting it at the model
 * boundary rather than around each of the 65 exported actions: it picks the right database AND
 * enforces the membership/status check, so an account that is not a member of the workspace named
 * in the host cannot read or write its settings either. Self-hosted resolves to the default tenant
 * with zero work, so `scoped(X)` is exactly `X` there.
 *
 * Resolution is memoised per request (lib/tenancy/request), so calling this once per model inside
 * one action costs one lookup, not one each.
 */
function scoped<T>(model: Model<T>): Promise<Model<T>> {
  return withRequestTenant(() => currentModel(model));
}


const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434';

export type OllamaModel = { name: string; sizeGB: number };

/** Models currently installed in the configured Ollama (local or remote). */
export async function listOllamaModels(): Promise<OllamaModel[]> {
  try {
    const host = (await getAiConfig()).ollamaHost || OLLAMA_HOST;
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: { name?: string; model?: string; size?: number }[] };
    return (data.models ?? [])
      .map((m) => ({ name: m.name || m.model || '', sizeGB: Math.round(((m.size ?? 0) / 1e9) * 10) / 10 }))
      .filter((m) => m.name);
  } catch {
    return [];
  }
}

/** Download a model into the local Ollama (blocks until done — can take minutes). */
export async function pullOllamaModel(name: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const n = name.trim();
  if (!n) return { ok: false, error: 'No model name' };
  // Model refs look like "qwen2.5vl:7b" or "library/name:tag" — reject anything else
  // so an absurd name can't be flung at the Ollama pull endpoint.
  if (n.length > 100 || !/^[a-z0-9._/:-]+$/i.test(n)) return { ok: false, error: 'Invalid model name' };
  try {
    const host = (await getAiConfig()).ollamaHost || OLLAMA_HOST;
    const res = await fetch(`${host}/api/pull`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: n, stream: false }),
      signal: AbortSignal.timeout(600000), // 10 min — big models on a slow line
    });
    if (!res.ok) return { ok: false, error: `Ollama HTTP ${res.status}` };
    const data = (await res.json()) as { status?: string; error?: string };
    if (data.error) return { ok: false, error: data.error };
    invalidateOllamaHealth(); // newly pulled model may flip the status to online
    revalidatePath('/settings');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Persist the AI backend settings (singleton config doc). */
export async function saveAiConfig(formData: FormData): Promise<{ ok: boolean }> {
  await requireAdmin();
  const PROVIDERS = ['ollama', 'anthropic', 'openai', 'gemini', 'openrouter', 'custom'];
  const rawProvider = String(formData.get('provider') || 'ollama');
  const provider = PROVIDERS.includes(rawProvider) ? rawProvider : 'ollama';
  const ollamaHost = String(formData.get('ollamaHost') || '').trim().replace(/\/$/, '');
  const ollamaModel = String(formData.get('ollamaModel') || '').trim();
  const ollamaVisionModel = String(formData.get('ollamaVisionModel') || '').trim();

  await connectDB();
  const update: Record<string, unknown> = {
    aiProvider: provider,
    ollamaHost,
    ollamaModel,
    ollamaVisionModel,
    anthropicModel: String(formData.get('anthropicModel') || '').trim() || 'claude-sonnet-4-5-20250929',
    // Not a secret (a workspace id, not a key), so it is stored directly rather than through the
    // "only overwrite when typed" path below — writing the trimmed value every save lets the user
    // clear it by emptying the field.
    anthropicWorkspaceId: String(formData.get('anthropicWorkspaceId') || '').trim(),
    openaiModel: String(formData.get('openaiModel') || '').trim(),
    geminiModel: String(formData.get('geminiModel') || '').trim(),
    openrouterModel: String(formData.get('openrouterModel') || '').trim(),
    customBaseUrl: String(formData.get('customBaseUrl') || '').trim().replace(/\/$/, ''),
    customModel: String(formData.get('customModel') || '').trim(),
    // Self-hosted AI spend cap: monthly ceiling in the display currency; 0 = no cap. Clamped
    // to a non-negative number (a blank or garbage field reads as 0 = off). The running spend
    // ledger (aiSpendPeriod/aiSpendMicros) is written by lib/aiBudget.ts, never from the form.
    aiMonthlyBudget: Math.max(0, Number(formData.get('aiMonthlyBudget')) || 0),
  };
  // Keys: only overwrite when a new one is typed (blank = keep the existing one).
  for (const k of ['anthropicApiKey', 'openaiApiKey', 'geminiApiKey', 'openrouterApiKey', 'customApiKey'] as const) {
    const v = String(formData.get(k) || '').trim();
    if (v) update[k] = v;
  }

  await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $set: update }, { upsert: true });
  invalidateAiConfigCache();
  invalidateOllamaHealth(); // model/provider changed → re-probe on next render
  revalidatePath('/settings');
  return { ok: true };
}

/** Fetch the available models from a provider's API (using the typed or saved key),
 *  annotated with approximate cost ($/1M) + a "recommended" flag. Keys never leave
 *  the server. OpenRouter returns LIVE pricing; the rest use the static table. */
export async function fetchProviderModels(
  provider: string,
  key?: string,
  baseUrl?: string
): Promise<{ ok: boolean; models?: FetchedModel[]; error?: string }> {
  await requireAdmin();
  const cfg = await getAiConfig();
  const savedKey = (p: string): string =>
    p === 'anthropic' ? cfg.anthropicApiKey
    : p === 'openai' ? cfg.openaiApiKey
    : p === 'gemini' ? cfg.geminiApiKey
    : p === 'openrouter' ? cfg.openrouterApiKey
    : p === 'custom' ? cfg.customApiKey
    : '';
  const k = (key || '').trim() || savedKey(provider);
  const rec = PROVIDER_RECOMMEND[provider as AiProviderId]?.model;
  const sig = () => AbortSignal.timeout(15000);
  const r2 = (n: number) => Math.round(n * 100) / 100;

  try {
    let entries: { id: string; live?: { in: number; out: number } }[] = [];

    if (provider === 'anthropic') {
      if (!k) return { ok: false, error: 'Enter or save an Anthropic key first' };
      const res = await fetch('https://api.anthropic.com/v1/models?limit=200', {
        headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01' },
        signal: sig(),
      });
      if (!res.ok) return { ok: false, error: `Anthropic HTTP ${res.status}` };
      const d = (await res.json()) as { data?: { id: string }[] };
      entries = (d.data || []).map((m) => ({ id: m.id }));
    } else if (provider === 'openai') {
      if (!k) return { ok: false, error: 'Enter or save an OpenAI key first' };
      const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${k}` }, signal: sig() });
      if (!res.ok) return { ok: false, error: `OpenAI HTTP ${res.status}` };
      const d = (await res.json()) as { data?: { id: string }[] };
      entries = (d.data || [])
        .map((m) => ({ id: m.id }))
        .filter((m) => /^(gpt-4|o1|o3|o4|chatgpt)/.test(m.id) && !/audio|realtime|transcribe|tts|search|embedding|image/.test(m.id));
    } else if (provider === 'gemini') {
      if (!k) return { ok: false, error: 'Enter or save a Gemini key first' };
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(k)}&pageSize=200`, { signal: sig() });
      if (!res.ok) return { ok: false, error: `Gemini HTTP ${res.status}` };
      const d = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
      entries = (d.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m) => ({ id: m.name.replace(/^models\//, '') }))
        .filter((m) => /gemini/.test(m.id) && !/embedding|aqa/.test(m.id));
    } else if (provider === 'openrouter') {
      const res = await fetch('https://openrouter.ai/api/v1/models', { headers: k ? { Authorization: `Bearer ${k}` } : {}, signal: sig() });
      if (!res.ok) return { ok: false, error: `OpenRouter HTTP ${res.status}` };
      const d = (await res.json()) as { data?: { id: string; pricing?: { prompt?: string; completion?: string } }[] };
      entries = (d.data || []).map((m) => {
        const hasP = m.pricing && m.pricing.prompt != null;
        const live = hasP ? { in: r2(Number(m.pricing!.prompt) * 1e6 || 0), out: r2(Number(m.pricing!.completion) * 1e6 || 0) } : undefined;
        return { id: m.id, live };
      });
    } else if (provider === 'custom') {
      const base = (baseUrl || cfg.customBaseUrl || '').trim().replace(/\/$/, '');
      if (!base) return { ok: false, error: 'Enter the base URL first' };
      const res = await fetch(`${base}/models`, { headers: k ? { Authorization: `Bearer ${k}` } : {}, signal: sig() });
      if (!res.ok) return { ok: false, error: `Server HTTP ${res.status}` };
      const d = (await res.json()) as { data?: { id: string }[] };
      entries = (d.data || []).map((m) => ({ id: m.id }));
    } else {
      return { ok: false, error: 'This provider has no model list' };
    }

    const models: FetchedModel[] = entries
      .filter((e) => e.id)
      .map((e) => {
        const price = e.live || priceForModel(e.id);
        return { id: e.id, in: price?.in ?? null, out: price?.out ?? null, vision: looksVisionModel(e.id), recommended: e.id === rec };
      });
    models.sort((a, b) =>
      (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0) ||
      (b.in != null ? 1 : 0) - (a.in != null ? 1 : 0) ||
      a.id.localeCompare(b.id)
    );
    if (!models.length) return { ok: false, error: 'No models returned' };
    return { ok: true, models: models.slice(0, 120) };
  } catch (err) {
    const m = (err as Error).message || String(err);
    return { ok: false, error: /timeout|aborted/i.test(m) ? 'Request timed out' : m.slice(0, 140) };
  }
}

/** Master AI switch. When off, the whole app runs AI-free. */
export async function setAiEnabled(value: boolean): Promise<{ ok: boolean }> {
  await requireAdmin();
  await connectDB();
  await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $set: { aiEnabled: !!value } }, { upsert: true });
  invalidateAiConfigCache();
  invalidateOllamaHealth();
  revalidatePath('/', 'layout'); // navbar dot + onboarding banner update app-wide
  return { ok: true };
}

/** Toggle one AI feature on/off (absent key = on). */
export async function setAiFeature(key: string, value: boolean): Promise<{ ok: boolean }> {
  await requireAdmin();
  if (!AI_FEATURE_KEYS.includes(key as AiFeatureKey)) return { ok: false };
  await connectDB();
  await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $set: { [`aiFeatures.${key}`]: !!value } }, { upsert: true });
  invalidateAiConfigCache();
  revalidatePath('/settings');
  return { ok: true };
}

/** Permanently hide the "set up AI" onboarding banner (any signed-in user). */
export async function dismissAiOnboarding(): Promise<{ ok: boolean }> {
  await assertCanWrite();
  await connectDB();
  await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $set: { aiOnboardingDismissed: true } }, { upsert: true });
  invalidateAiConfigCache();
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Permanently hide the homepage "getting started" checklist (P26, any signed-in user). */
export async function dismissOnboarding(): Promise<{ ok: boolean }> {
  await assertCanWrite();
  await connectDB();
  await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $set: { onboardingDismissed: true } }, { upsert: true });
  invalidateAppSettings();
  revalidatePath('/', 'layout');
  return { ok: true };
}

// ─── Defaults & alerts + Notifications ───────────────────────────────────────

export async function saveDefaults(formData: FormData): Promise<{ ok: boolean }> {
  await assertCanWrite();
  await connectDB();
  const view = String(formData.get('defaultItemView') || 'grid') === 'list' ? 'list' : 'grid';
  const warrantyMonths = Math.max(0, Math.min(120, Number(formData.get('defaultWarrantyMonths')) || 24));
  const alertDays = Math.max(0, Math.min(730, Number(formData.get('warrantyAlertDays')) || 90));
  // 0 is meaningful (trial alerts off), so parse explicitly instead of `|| 2`.
  const trialRaw = Number(formData.get('trialAlertDays'));
  const trialAlertDays = Number.isFinite(trialRaw) ? Math.max(0, Math.min(60, Math.round(trialRaw))) : 2;
  // 0 is meaningful (gift-card expiry alerts off), so parse explicitly instead of `|| 30`.
  const giftRaw = Number(formData.get('giftCardAlertDays'));
  const giftCardAlertDays = Number.isFinite(giftRaw) ? Math.max(0, Math.min(365, Math.round(giftRaw))) : 30;
  // 0 is meaningful (bill due/overdue alerts off), so parse explicitly instead of `|| 5`.
  const billRaw = Number(formData.get('billAlertDays'));
  const billAlertDays = Number.isFinite(billRaw) ? Math.max(0, Math.min(90, Math.round(billRaw))) : 5;
  // Lead time for the P41 maintenance chore. 0 is meaningful ("only once it is actually
  // due"), and an overdue chore nags past it either way, so parse explicitly.
  const maintRaw = Number(formData.get('maintenanceAlertDays'));
  const maintenanceAlertDays = Number.isFinite(maintRaw) ? Math.max(0, Math.min(180, Math.round(maintRaw))) : 7;
  // Lead time for the P47 lent-item return. Default 3, tighter than maintenance: you ask
  // for a drill back a couple of days out, not a week. 0 is meaningful, so parse explicitly.
  const lendRaw = Number(formData.get('lendingAlertDays'));
  const lendingAlertDays = Number.isFinite(lendRaw) ? Math.max(0, Math.min(180, Math.round(lendRaw))) : 3;
  // Silence before an open RMA counts as forgotten (P44 phase 2). Not a lead time: there is
  // no deadline to run up to, only a claim that stopped moving. 0 = the nudge is off, which
  // is the only sane reading of "nag me after zero days of silence".
  const claimRaw = Number(formData.get('staleClaimDays'));
  const staleClaimDays = Number.isFinite(claimRaw) ? Math.max(0, Math.min(180, Math.round(claimRaw))) : DEFAULT_STALE_CLAIM_DAYS;
  // 0 is meaningful (remote-mirror staleness alerts off), so parse explicitly (P48).
  const syncRaw = Number(formData.get('syncStaleDays'));
  const syncStaleDays = Number.isFinite(syncRaw) ? Math.max(0, Math.min(365, Math.round(syncRaw))) : 7;
  const autoAdd = formData.get('autoAddStores') === 'true';
  const currency = (String(formData.get('currency') || 'EUR').trim().toUpperCase()) || 'EUR';
  const multiCurrency = formData.get('multiCurrency') === 'true'; // P9 opt-in
  const vatRate = Math.max(0, Math.min(100, Number(formData.get('defaultVatRate')) || 24));
  // 0 is meaningful here (return tracking off), so parse explicitly instead of `|| 14`.
  const returnRaw = Number(formData.get('defaultReturnWindowDays'));
  const returnDays = Number.isFinite(returnRaw) ? Math.max(0, Math.min(365, Math.round(returnRaw))) : 14;
  await (await scoped(AppConfig)).updateOne(
    { key: 'singleton' },
    {
      $set: {
        defaultItemView: view,
        defaultWarrantyMonths: warrantyMonths,
        warrantyAlertDays: alertDays,
        trialAlertDays,
        giftCardAlertDays,
        billAlertDays,
        maintenanceAlertDays,
        lendingAlertDays,
        staleClaimDays,
        syncStaleDays,
        autoAddStores: autoAdd,
        currency,
        multiCurrency,
        defaultVatRate: vatRate,
        defaultReturnWindowDays: returnDays,
      },
    },
    { upsert: true }
  );
  invalidateAppSettings();
  revalidatePath('/', 'layout'); // currency symbol shows app-wide
  return { ok: true };
}

export async function saveNtfy(formData: FormData): Promise<{ ok: boolean }> {
  await requireAdmin();
  await connectDB();
  const url = String(formData.get('ntfyUrl') || '').trim();
  const enabled = formData.get('ntfyEnabled') === 'true';
  await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $set: { ntfyUrl: url, ntfyEnabled: enabled } }, { upsert: true });
  invalidateAppSettings();
  revalidatePath('/settings');
  return { ok: true };
}

/** Send a one-off test notification to the configured ntfy topic (web, cookie session).
 *  The API route for the same button guards with the Bearer role instead and calls the
 *  shared `runNtfyTest` body directly, since it has no session to check. */
export async function sendTestNtfy(): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  return runNtfyTest();
}

// ─── Pluggable notification channels ─────────────────────────────────────────

/** Channels for the Settings editor (ntfy/Discord/Slack/Telegram/webhook). */
export async function getNotifierChannels(): Promise<NotifierConfig[]> {
  await requireAdmin();
  return getNotifiers();
}

/** Replace the whole channel list (single source of truth for outbound alerts).
 *  Keeps the legacy ntfy fields in sync with the first ntfy channel for any code
 *  still reading them. */
export async function saveNotifierChannels(channels: NotifierConfig[]): Promise<{ ok: boolean }> {
  await requireAdmin();
  await connectDB();
  const clean = (Array.isArray(channels) ? channels : []).map((c, i) => ({
    id: String(c.id || `n${i}`),
    type: c.type,
    enabled: c.enabled !== false,
    label: (c.label || '').slice(0, 60),
    url: (c.url || '').trim(),
    token: (c.token || '').trim(),
    target: (c.target || '').trim(),
  }));
  const firstNtfy = clean.find((c) => c.type === 'ntfy');
  await (await scoped(AppConfig)).updateOne(
    { key: 'singleton' },
    { $set: { notifiers: clean, ntfyUrl: firstNtfy?.url || '', ntfyEnabled: !!firstNtfy?.enabled } },
    { upsert: true }
  );
  invalidateAppSettings();
  revalidatePath('/settings');
  return { ok: true };
}

/** Which alert categories are allowed out on the notifier channels (P103). */
export async function getNotifyTypes(): Promise<NotifyTypes> {
  await requireAdmin();
  return (await getAppSettings()).notifyTypes;
}

/** Replace the per-type outbound alert toggles. Unknown keys are dropped and every known
 *  key is written explicitly, so the stored map always matches the current registry. */
export async function saveNotifyTypes(types: NotifyTypes): Promise<{ ok: boolean }> {
  await requireAdmin();
  await connectDB();
  const clean = resolveNotifyTypes(types);
  await (await scoped(AppConfig)).updateOne(
    { key: 'singleton' },
    { $set: { notifyTypes: Object.fromEntries(ALERT_TYPE_KEYS.map((k) => [k, clean[k]])) } },
    { upsert: true }
  );
  invalidateAppSettings();
  revalidatePath('/settings');
  return { ok: true };
}

/** Send a one-off test to a single (possibly unsaved) channel config. */
export async function testNotifierChannel(channel: NotifierConfig): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const ok = await testNotifier(channel);
  return ok ? { ok: true } : { ok: false, error: 'Delivery failed — check the URL/token' };
}

/** Recent outbound delivery attempts per channel (P80), keyed `notifier:<id>` /
 *  `webhook:<id>`. Read-only; feeds the per-channel history in Settings →
 *  Notifications so a silently failing endpoint is visible. */
export async function getDeliveryLogs(): Promise<Record<string, DeliveryLogEntry[]>> {
  await requireAdmin();
  return getDeliveryLog();
}

// ─── Outbound event webhooks (P24) ───────────────────────────────────────────
// Distinct from the notifier channels above: those push human-readable alert
// summaries, these fire one signed JSON POST per structured event for
// automation (Home Assistant/n8n/Node-RED). See lib/webhooks.ts. Types/metadata
// (WebhookSubscription, WEBHOOK_EVENTS) are imported by the client straight from
// the shared module, not re-exported here — a 'use server' file may only export
// async functions.

/** Subscriptions for the Settings editor. */
export async function getWebhookSubscriptions(): Promise<WebhookSubscription[]> {
  await requireAdmin();
  return getEventWebhooks();
}

/** Replace the whole subscription list. Rejects (whole save) if any URL is not a
 *  reachable public http(s) address — same SSRF guard the dispatcher itself uses,
 *  so a bad entry can't silently sit there failing every delivery. Generates a
 *  secret for any new/blank entry so HMAC signing is on by default. */
export async function saveWebhookSubscriptions(subs: WebhookSubscription[]): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  await connectDB();
  const clean: WebhookSubscription[] = [];
  for (const [i, s] of (Array.isArray(subs) ? subs : []).entries()) {
    const url = (s.url || '').trim();
    if (!url) continue;
    try {
      await assertPublicUrl(url);
    } catch (err) {
      return { ok: false, error: `${url}: ${(err as Error).message}` };
    }
    clean.push({
      id: String(s.id || `w${i}`),
      url,
      secret: (s.secret || '').trim() || generateWebhookSecret(),
      enabled: s.enabled !== false,
      label: (s.label || '').slice(0, 60),
      events: Array.isArray(s.events) ? s.events.filter((e) => WEBHOOK_EVENTS.some((w) => w.type === e)) : [],
    });
  }
  await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $set: { eventWebhooks: clean } }, { upsert: true });
  revalidatePath('/settings');
  return { ok: true };
}

/** Send a one-off test payload to a single (possibly unsaved) subscription. */
export async function testWebhookSubscription(sub: WebhookSubscription): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  try {
    await assertPublicUrl(sub.url || '');
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const ok = await testEventWebhook(sub);
  return ok ? { ok: true } : { ok: false, error: 'Delivery failed — check the URL' };
}

/** Scan for deals, δόσεις due this month, and expiring warranties; ntfy a summary. */
export async function runAlertChecks(opts: { dedupe?: boolean } = {}): Promise<{ ok: boolean; sent: boolean; summary: string }> {
  // P82 gave this action its first real Mongoose write (the dedup baseline, dedupe mode
  // only) — assertCanWrite() no-ops with no request scope (the cron path, no session to
  // check) and only throws for a logged-in viewer, so this costs the scheduler nothing
  // and closes what would otherwise be an unguarded write per the P31 coverage scan.
  await assertCanWrite();
  const s = await getAppSettings();
  await connectDB();
  const now = Date.now();

  const dealItems = (await (await scoped(Item)).find({ targetPrice: { $gt: 0 } }).select('title targetPrice currentPrice links').lean()) as Array<{
    _id: unknown;
    title: string;
    targetPrice?: number;
    currentPrice?: number;
    links?: { price?: number | null }[];
  }>;
  const deals = dealItems.filter((i) => {
    let lo = (i.currentPrice ?? 0) > 0 ? (i.currentPrice as number) : Infinity;
    for (const l of i.links ?? []) if (l.price && l.price > 0) lo = Math.min(lo, l.price);
    return lo < Infinity && lo <= (i.targetPrice ?? 0);
  });

  const warrantyItems = (await (await scoped(Item)).find({ warrantyUntil: { $ne: null } }).select('title warrantyUntil').lean()) as Array<{
    _id: unknown;
    title: string;
    warrantyUntil?: string | Date | null;
  }>;
  const expiring = warrantyItems
    .map((i) => ({ _id: i._id, title: i.title, days: Math.ceil((new Date(i.warrantyUntil as string).getTime() - now) / 86400000) }))
    .filter((w) => !isNaN(w.days) && w.days >= 0 && w.days <= s.warrantyAlertDays)
    .sort((a, b) => a.days - b.days);

  // Return windows closing within 3 days (PA3): purchase date + per-store window.
  // Only recent receipts can still be inside a window, so bound the scan.
  const stores = await getStores();
  const maxWindow = Math.max(s.defaultReturnWindowDays, ...stores.map((st) => st.returnWindowDays ?? 0));
  const returnsClosing: { _id: unknown; store: string; total: number; days: number }[] = [];
  if (maxWindow > 0) {
    const since = new Date(now - (maxWindow + 1) * 86400000);
    const recent = (await (await scoped(Receipt)).find({ archived: { $ne: true }, date: { $gte: since } })
      .select('store date total')
      .lean()) as Array<{ _id: unknown; store?: string; date?: string | Date; total?: number }>;
    for (const r of recent) {
      const win = effectiveReturnWindow(r.store ?? '', stores, s.defaultReturnWindowDays);
      const days = returnDaysLeft(r.date, win, now);
      if (days !== null && days <= 3) returnsClosing.push({ _id: r._id, store: r.store || 'Unknown', total: r.total ?? 0, days });
    }
    returnsClosing.sort((a, b) => a.days - b.days);
  }

  const statements = await (await scoped(Statement)).find().lean();
  const plans = computeInstallmentPlans(JSON.parse(JSON.stringify(statements)) as SerializedStatement[]).filter(
    (p) => !p.done && p.remainingInstallments >= 1
  );
  const dueThisMonth = plans.reduce((sum, p) => sum + p.perAmount, 0);

  // Price-hike watch (P14): a recurring bill/subscription that moved vs its previous
  // charge (Netflix €13→€15, ΔΕΗ +18%). Deterministic, no AI — same vendorKey series
  // the anomaly/recurring logic uses.
  const hikeRows = (await (await scoped(Expense)).find({ amount: { $gt: 0 } })
    .select('vendor vendorKey amount date recurring kind')
    .lean()) as HikeEntry[];
  const hikes = detectPriceHikes(hikeRows);

  // Budget-exceeded watch (P24 webhook event): this month's expense spend per
  // category vs the flat budgets configured in Settings → Money. Deterministic,
  // no AI/rollover math (see lib/budgetAlert.ts).
  const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1);
  const budgetRows = (await (await scoped(Expense)).find({ amount: { $gt: 0 }, date: { $gte: monthStart } })
    .select('category amount date kind')
    .lean()) as BudgetAlertRow[];
  const budgetMonthKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;
  const budgetsExceeded = detectBudgetExceeded(budgetRows, s.budgets, budgetMonthKey);

  // Free-trial "cancel before charge" (P33): active subs whose trial ends within
  // the lead-time window, soonest first.
  const trialSubs = (await (await scoped(Subscription)).find({ active: true, trialEndsAt: { $ne: null } })
    .select('name amount trialEndsAt firstChargeAmount')
    .lean()) as Array<{ _id: unknown; name: string; amount?: number; trialEndsAt?: string | Date | null; firstChargeAmount?: number }>;
  const trialsEnding = trialSubs
    .map((sub) => ({
      _id: sub._id,
      name: sub.name,
      days: Math.ceil((new Date(sub.trialEndsAt as string).getTime() - now) / 86400000),
      charge: (sub.firstChargeAmount ?? 0) > 0 ? (sub.firstChargeAmount as number) : sub.amount ?? 0,
      iso: new Date(sub.trialEndsAt as string).toISOString().slice(0, 10),
    }))
    .filter((tr) => !isNaN(tr.days) && tr.days >= 0 && tr.days <= s.trialAlertDays)
    .sort((a, b) => a.days - b.days);

  // Gift-card / store-credit expiring with money still on it (P32): soonest first.
  const giftRows = (await (await scoped(GiftCard)).find({ archived: { $ne: true }, expiresAt: { $ne: null } })
    .select('title initialAmount uses expiresAt')
    .lean()) as Array<{ _id: unknown; title: string; initialAmount?: number; uses?: { amount?: number }[]; expiresAt?: string | Date | null }>;
  const giftsExpiring = giftRows
    .map((g) => ({
      _id: g._id,
      title: g.title,
      balance: giftCardBalance(g.initialAmount ?? 0, g.uses ?? []),
      days: giftCardDaysLeft(g.expiresAt ?? null, now),
      iso: g.expiresAt ? new Date(g.expiresAt as string).toISOString().slice(0, 10) : '',
    }))
    .filter((g) => g.balance > 0.009 && g.days !== null && g.days >= 0 && g.days <= s.giftCardAlertDays)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));

  // Bills / payables (P28): unpaid bills that are overdue or due within the
  // lead-time window (overdue nag until paid), most-overdue first.
  const billRows = (await (await scoped(Bill)).find({ paidAt: null, archived: { $ne: true } })
    .select('title amount dueDate')
    .lean()) as Array<{ _id: unknown; title: string; amount?: number; dueDate?: string | Date | null }>;
  const billsDue = billRows
    .map((b) => ({
      _id: b._id,
      title: b.title,
      amount: b.amount ?? 0,
      days: billDaysUntilDue(b.dueDate ?? null, now),
      iso: b.dueDate ? new Date(b.dueDate as string).toISOString().slice(0, 10) : '',
    }))
    .filter((b) => b.days !== null && (b.days as number) <= s.billAlertDays)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));

  // Maintenance due (P41): the only alert here about a chore rather than about money.
  // Same helper the in-app bell uses (lib/maintenance.ts), so the phone push and the bell
  // can never disagree about which printer is overdue. Mongo filters on the stored
  // interval; the status re-check lives inside the helper.
  const maintRows = (await (await scoped(Item)).find({ maintenanceIntervalDays: { $gt: 0 }, status: { $in: MAINTENANCE_STATUSES } })
    .select('title status maintenanceIntervalDays lastMaintenanceAt purchasedAt')
    .lean()) as MaintenanceRow[];
  const maintenanceDue = collectMaintenanceDue(maintRows, s.maintenanceAlertDays, now);

  // Lent items due back (P47): about a thing that is out of the house rather than about
  // money. Same helper the in-app bell uses, so the two can never name different drills.
  // Mongo cannot express "non-empty after trimming", so isLentOut() re-checks inside.
  const lendRows = (await (await scoped(Item)).find({ lentTo: { $nin: ['', null] }, expectedReturnAt: { $ne: null }, status: { $in: LENDING_STATUSES } })
    .select('title status lentTo lentAt expectedReturnAt')
    .lean()) as LendingRow[];
  const lendingDue = collectLendingOverdue(lendRows, s.lendingAlertDays, now);

  // Forgotten warranty claims (P44 phase 2): the other half of an RMA. The expiry alert
  // warns you BEFORE the cover ends; this one speaks after the thing already broke and the
  // shop went quiet. Same collector the item panel reads, so the pill and the push agree.
  // Zero = off, and then the query is skipped entirely rather than run and thrown away.
  const claimRows =
    s.staleClaimDays > 0
      ? ((await (await scoped(Item)).find({ 'warrantyClaims.0': { $exists: true }, status: { $in: CLAIM_STATUSES_APPLY_TO } })
          .select('title status warrantyClaims')
          .lean()) as StaleClaimRow[])
      : [];
  const staleClaims = collectStaleClaims(claimRows, s.staleClaimDays, now);

  // Remote-mirror staleness (P48): the only alert here about the backup itself rather
  // than about money or things. Reads a stored timestamp, no network call — a NAS being
  // unreachable must not make the whole alert sweep slow or fail.
  const storage = await getStorageConfig();
  // Skip the timestamp read entirely for a local-only setup (the common case): there is
  // no remote that could fall behind, so the query would never change the outcome.
  const syncStale =
    storage.backend === 'local'
      ? null
      : detectSyncStaleness({ backend: storage.backend, lastSyncAt: await getLastRemoteSync(), thresholdDays: s.syncStaleDays, now });

  // Outbound dedup (P82), opt-in via opts.dedupe — used only by the scheduled cron path
  // (app/api/cron/alerts/route.ts). The in-app bell already has its own per-item memory
  // (dedupeKey, see computeAlerts() in app/notifications/actions.ts): a warranty alert
  // fires once when it enters the window and stays quiet as the day count ticks down.
  // The outbound channels (ntfy/Discord/Slack/Telegram/webhook + push) never had that
  // memory — harmless while the only trigger was a human pressing the button below, but
  // P81 wired an unattended cron to this same scan, so without this an unresolved alert
  // repeats the identical push on every tick. `previouslySent` stays empty unless dedupe
  // is requested, which makes every splitFreshAlerts() call below a no-op pass-through
  // (fresh === everything) for the manual "Check & notify now" button — same output as
  // before this change, byte for byte.
  let previouslySent = new Set<string>();
  if (opts.dedupe) {
    const cfgDoc = (await (await scoped(AppConfig)).findOne({ key: 'singleton' }).select('alertDispatchKeys').lean()) as { alertDispatchKeys?: string[] } | null;
    previouslySent = new Set(cfgDoc?.alertDispatchKeys ?? []);
  }

  // Per-type toggles (P103): a category the owner switched off in Settings → Notifications
  // is emptied HERE, at the split, and not earlier — the raw arrays above still feed the
  // in-app bell and the P24 event webhooks, which are separate audiences with their own
  // settings. Emptying at the split also keeps a silenced category out of liveDispatchKeys,
  // so nothing is recorded as "already sent" while it was muted and switching it back on
  // reports whatever is still open instead of staying quiet forever.
  // resolveNotifyTypes rather than a bare read: an unset/partial map means "send
  // everything", so a doc written before P103 keeps behaving exactly as it did.
  const nt = resolveNotifyTypes(s.notifyTypes);
  const period = new Date(now).toISOString().slice(0, 7); // YYYY-MM, same bucket the bell uses for installments
  const dealsSplit = splitFreshAlerts(nt.deals ? deals : [], (d) => `deal:${String(d._id)}`, previouslySent);
  const expiringSplit = splitFreshAlerts(nt.warranty ? expiring : [], (w) => `warranty:${String(w._id)}`, previouslySent);
  const returnsSplit = splitFreshAlerts(nt.returns ? returnsClosing : [], (r) => `return:${String(r._id)}`, previouslySent);
  const hikesSplit = splitFreshAlerts(nt.priceHikes ? hikes : [], (h) => `pricehike:${h.vendorKey}:${h.curr}`, previouslySent);
  const trialsSplit = splitFreshAlerts(nt.trials ? trialsEnding : [], (tr) => `trialend:${String(tr._id)}:${tr.iso}`, previouslySent);
  const giftsSplit = splitFreshAlerts(nt.giftCards ? giftsExpiring : [], (g) => `giftcard:${String(g._id)}:${g.iso}`, previouslySent);
  const billsSplit = splitFreshAlerts(nt.bills ? billsDue : [], (b) => `bill:${String(b._id)}:${b.iso}`, previouslySent);
  const maintenanceSplit = splitFreshAlerts(nt.maintenance ? maintenanceDue : [], (m) => `maintenance:${String(m._id)}:${m.iso}`, previouslySent);
  const lendingSplit = splitFreshAlerts(nt.lending ? lendingDue : [], (l) => `lending:${String(l._id)}:${l.iso}`, previouslySent);
  const claimsSplit = splitFreshAlerts(nt.warrantyClaims ? staleClaims : [], (c) => `claim:${String(c._id)}:${c.iso}`, previouslySent);
  const budgetsSplit = splitFreshAlerts(nt.budgets ? budgetsExceeded : [], (b) => `budget:${b.category}:${budgetMonthKey}`, previouslySent);
  const installmentItems = nt.installments && dueThisMonth > 0 ? [{ key: `installments:${period}` }] : [];
  const installmentsSplit = splitFreshAlerts(installmentItems, (i) => i.key, previouslySent);
  const syncStaleItems = nt.syncStale && syncStale ? [syncStale] : [];
  const syncStaleSplit = splitFreshAlerts(syncStaleItems, (x) => `syncstale:${x.lastSyncAt ?? 'never'}`, previouslySent);

  // The full current live key set, across every category — persisted as the next
  // baseline after a successful send, and used to tell "genuinely nothing pending"
  // apart from "something's pending but already reported" below.
  const liveDispatchKeys = [
    ...dealsSplit.keys,
    ...expiringSplit.keys,
    ...returnsSplit.keys,
    ...hikesSplit.keys,
    ...trialsSplit.keys,
    ...giftsSplit.keys,
    ...billsSplit.keys,
    ...maintenanceSplit.keys,
    ...lendingSplit.keys,
    ...claimsSplit.keys,
    ...budgetsSplit.keys,
    ...installmentsSplit.keys,
    ...syncStaleSplit.keys,
  ];
  const hadAnyLiveAlert = liveDispatchKeys.length > 0;

  const freshDeals = dealsSplit.fresh;
  const freshExpiring = expiringSplit.fresh;
  const freshReturnsClosing = returnsSplit.fresh;
  const freshHikes = hikesSplit.fresh;
  const freshTrialsEnding = trialsSplit.fresh;
  const freshGiftsExpiring = giftsSplit.fresh;
  const freshBillsDue = billsSplit.fresh;
  const freshMaintenanceDue = maintenanceSplit.fresh;
  const freshLendingDue = lendingSplit.fresh;
  const freshStaleClaims = claimsSplit.fresh;
  const freshBudgetsExceeded = budgetsSplit.fresh;
  const dueThisMonthFresh = installmentsSplit.fresh.length > 0 ? dueThisMonth : 0;
  const freshSyncStale = syncStaleSplit.fresh.length > 0 ? syncStale : null;

  const lines: string[] = [];
  if (freshDeals.length) lines.push(`🎯 ${freshDeals.length} deal(s): ${freshDeals.slice(0, 5).map((d) => d.title).join(', ')}`);
  if (dueThisMonthFresh > 0) lines.push(`💳 installments this month: ${cur()}${dueThisMonthFresh.toFixed(0)} (${plans.length} plans)`);
  if (freshExpiring.length)
    lines.push(`🛡 ${freshExpiring.length} warranty expiring ≤${s.warrantyAlertDays}d: ${freshExpiring.slice(0, 5).map((w) => `${w.title} (${w.days}d)`).join(', ')}`);
  if (freshReturnsClosing.length)
    lines.push(
      `↩ ${freshReturnsClosing.length} return window(s) closing ≤3d: ${freshReturnsClosing
        .slice(0, 5)
        .map((r) => `${r.store}${r.total > 0 ? ` ${cur()}${r.total}` : ''} (${r.days}d)`)
        .join(', ')}`
    );
  if (freshHikes.length)
    lines.push(
      `📈 ${freshHikes.length} recurring price change(s): ${freshHikes
        .slice(0, 5)
        .map((h) => `${h.vendor} ${cur()}${h.prev}→${cur()}${h.curr} (${h.deltaPct > 0 ? '+' : ''}${h.deltaPct}%)`)
        .join(', ')}`
    );
  if (freshTrialsEnding.length)
    lines.push(
      `⏳ ${freshTrialsEnding.length} free trial(s) ending ≤${s.trialAlertDays}d: ${freshTrialsEnding
        .slice(0, 5)
        .map((tr) => `${tr.name} (${tr.days}d${tr.charge > 0 ? `, ${cur()}${tr.charge}` : ''})`)
        .join(', ')}`
    );
  if (freshGiftsExpiring.length)
    lines.push(
      `💳 ${freshGiftsExpiring.length} gift card(s) expiring ≤${s.giftCardAlertDays}d: ${freshGiftsExpiring
        .slice(0, 5)
        .map((g) => `${g.title} (${cur()}${g.balance.toFixed(0)}, ${g.days}d)`)
        .join(', ')}`
    );
  if (freshBillsDue.length)
    lines.push(
      `🧾 ${freshBillsDue.length} bill(s) due/overdue: ${freshBillsDue
        .slice(0, 5)
        .map((b) => `${b.title}${b.amount > 0 ? ` ${cur()}${b.amount.toFixed(0)}` : ''} (${(b.days ?? 0) < 0 ? `${-(b.days ?? 0)}d overdue` : `${b.days}d`})`)
        .join(', ')}`
    );
  if (freshMaintenanceDue.length)
    lines.push(
      `🔧 ${freshMaintenanceDue.length} item(s) needing service: ${freshMaintenanceDue
        .slice(0, 5)
        .map((m) => `${m.title} (${m.days < 0 ? `${-m.days}d overdue` : `${m.days}d`})`)
        .join(', ')}`
    );
  if (freshLendingDue.length)
    lines.push(
      `🤝 ${freshLendingDue.length} lent item(s) due back: ${freshLendingDue
        .slice(0, 5)
        .map((l) => `${l.title} @ ${l.borrower} (${l.days < 0 ? `${-l.days}d overdue` : `${l.days}d`})`)
        .join(', ')}`
    );
  if (freshStaleClaims.length)
    lines.push(
      `📮 ${freshStaleClaims.length} warranty claim(s) with no movement: ${freshStaleClaims
        .slice(0, 5)
        .map((c) => `${c.title}${c.ref ? ` #${c.ref}` : ''} (${c.days}d silent)`)
        .join(', ')}`
    );
  if (freshBudgetsExceeded.length)
    lines.push(
      `💰 ${freshBudgetsExceeded.length} budget(s) exceeded: ${freshBudgetsExceeded
        .slice(0, 5)
        .map((b) => `${b.category} ${cur()}${b.actual}/${cur()}${b.budget} (${b.pct}%)`)
        .join(', ')}`
    );
  if (freshSyncStale) lines.push(`🗄 ${formatSyncStaleness(freshSyncStale)} — run "Sync now" in Settings → File storage`);

  // Also surface these alerts in the in-app notification bell. Always the FULL live
  // picture (never filtered) — the bell has its own separate dedupeKey memory already,
  // unaffected by opts.dedupe above.
  try {
    await generateNotifications();
  } catch {
    /* the bell is best-effort — never fail the ntfy check over it */
  }

  // Outbound event webhooks (P24) — independent of the notifier channels above; a
  // Home Assistant/n8n listener wants raw structured events, not the human summary, and
  // is a different audience than P82 (deliberately NOT deduped here — see lib/webhooks.ts
  // / P80 for that channel's own reliability story). Fire-and-forget: dispatchEventWebhooks
  // never throws and no-ops with zero configured/matching subscriptions.
  if (dueThisMonth > 0) void dispatchEventWebhooks('installment.due', { amount: Math.round(dueThisMonth), plans: plans.length });
  if (deals.length) void dispatchEventWebhooks('price.drop', { items: deals.map((d) => ({ title: d.title, target: d.targetPrice ?? 0 })) });
  if (budgetsExceeded.length) void dispatchEventWebhooks('budget.exceeded', { categories: budgetsExceeded });

  const summary = lines.length
    ? lines.join('\n')
    : opts.dedupe && hadAnyLiveAlert
      ? 'No new alerts (already reported).'
      : 'All clear — nothing to report.';
  let sent = false;
  if (lines.length) {
    const r = await dispatchAlert('Pharos alerts', summary);
    sent = r.sent > 0;
    // Persist the new baseline ONLY once a channel actually accepted the message — a
    // misconfigured/disabled notifier must never mark live alerts as "already sent" when
    // nothing was ever delivered (they'd silently vanish from every future run).
    if (opts.dedupe && sent) {
      await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $set: { alertDispatchKeys: liveDispatchKeys } }, { upsert: true });
    }
  }
  return { ok: true, sent, summary };
}

/** Toggle the bulk-AI cost guard (confirm before a paid bulk job). */
export async function setAiConfirmBulk(value: boolean): Promise<{ ok: boolean }> {
  await assertCanWrite();
  await connectDB();
  await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $set: { aiConfirmBulk: value } }, { upsert: true });
  revalidatePath('/settings');
  return { ok: true };
}

/** Verify the saved Anthropic key + model with a tiny ping. */
export async function testAnthropic(): Promise<{ ok: boolean; error?: string }> {
  await connectDB();
  const doc = await (await scoped(AppConfig)).findOne({ key: 'singleton' }).lean();
  const key = doc?.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '';
  const model = doc?.anthropicModel || 'claude-sonnet-4-5-20250929';
  const workspaceId = doc?.anthropicWorkspaceId || process.env.ANTHROPIC_WORKSPACE_ID || '';
  if (!key) return { ok: false, error: 'No API key saved yet' };
  return anthropicTest(key, model, workspaceId);
}

// ─── Editable AI prompts ─────────────────────────────────────────────────────

/** Built-in default text for every editable prompt (the canonical copy lives at the
 *  call site in lib/ollama.ts, plus the scraper default mirrored in lib/prompts.ts). */
const PROMPT_DEFAULTS: Record<PromptKey, string> = {
  receipt: RECEIPT_SYSTEM_PROMPT,
  statement: STATEMENT_SYSTEM_PROMPT,
  product: PRODUCT_PROMPT,
  card: CARD_PROMPT,
  subscription: SUBSCRIPTION_PROMPT,
  category: CATEGORY_PROMPT,
  expense: EXPENSE_PROMPT,
  voucher: VOUCHER_PROMPT,
  productPhoto: PRODUCT_PHOTO_PROMPT,
  scraperPrice: DEFAULT_SCRAPER_PRICE_PROMPT,
};

export type PromptEditorEntry = {
  key: PromptKey;
  label: string;
  where: string;
  defaultText: string;
  override: string; // '' = none (using default)
};

/** Everything the Settings → AI Prompts editor needs: defaults + current overrides. */
export async function getPromptsForEditor(): Promise<PromptEditorEntry[]> {
  const overrides = await getAllPromptOverrides();
  return PROMPT_META.map((m) => ({
    key: m.key,
    label: m.label,
    where: m.where,
    defaultText: PROMPT_DEFAULTS[m.key],
    override: overrides[m.key] ?? '',
  }));
}

/** Save an override for one prompt. Empty / identical-to-default → clears the override. */
export async function savePrompt(key: string, text: string): Promise<{ ok: boolean }> {
  await requireAdmin();
  const k = key as PromptKey;
  if (!PROMPT_META.some((m) => m.key === k)) return { ok: false };
  await connectDB();
  const trimmed = (text ?? '').trim();
  const path = `prompts.${k}`;
  if (!trimmed || trimmed === PROMPT_DEFAULTS[k].trim()) {
    // Store nothing → future improvements to the default keep flowing through.
    await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $unset: { [path]: '' } }, { upsert: true });
  } else {
    await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $set: { [path]: trimmed } }, { upsert: true });
  }
  invalidatePromptsCache();
  revalidatePath('/settings');
  return { ok: true };
}

/** Drop a prompt's override → back to the built-in default. */
export async function resetPrompt(key: string): Promise<{ ok: boolean }> {
  await requireAdmin();
  const k = key as PromptKey;
  if (!PROMPT_META.some((m) => m.key === k)) return { ok: false };
  await connectDB();
  await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $unset: { [`prompts.${k}`]: '' } }, { upsert: true });
  invalidatePromptsCache();
  revalidatePath('/settings');
  return { ok: true };
}

// ─── Scraper AI (separate provider/model from the main app) ───────────────────

export type ScraperAiConfig = { provider: 'ollama' | 'anthropic'; model: string; enabled: boolean; maxLinks: number };

export async function getScraperAi(): Promise<ScraperAiConfig> {
  await connectDB();
  const doc = await (await scoped(AppConfig)).findOne({ key: 'singleton' }).select('scraperProvider scraperModel scraperEnabled scraperMaxLinks').lean();
  return {
    provider: doc?.scraperProvider === 'anthropic' ? 'anthropic' : 'ollama',
    model: doc?.scraperModel || '',
    enabled: doc?.scraperEnabled !== false, // default ON for existing installs
    maxLinks: Math.max(0, Number(doc?.scraperMaxLinks) || 0),
  };
}

export async function saveScraperAi(formData: FormData): Promise<{ ok: boolean }> {
  await requireAdmin();
  await connectDB();
  const provider = String(formData.get('scraperProvider') || 'ollama') === 'anthropic' ? 'anthropic' : 'ollama';
  const model = String(formData.get('scraperModel') || '').trim();
  const enabled = String(formData.get('scraperEnabled') || 'true') !== 'false';
  const maxLinks = Math.max(0, Number(formData.get('scraperMaxLinks')) || 0);
  await (await scoped(AppConfig)).updateOne(
    { key: 'singleton' },
    { $set: { scraperProvider: provider, scraperModel: model, scraperEnabled: enabled, scraperMaxLinks: maxLinks } },
    { upsert: true }
  );
  revalidatePath('/settings');
  return { ok: true };
}

// ─── File storage (PDFs) — local working copy + optional remote mirror ─────────

export type StorageInfo = {
  backend: StorageBackend;
  mirror: boolean;
  folderTemplate: string;
  fileNameTemplate: string;
  hasPass: boolean;
  remoteHost: string;
  remotePort: number;
  remoteUser: string;
  remoteShare: string;
  remoteBasePath: string;
  remoteSecure: boolean;
  onedriveConnected: boolean; // a refresh token is stored (status, independent of name)
  onedriveAccount: string; // display name/email, '' if we couldn't capture it
  lastSyncAt: string; // ISO of the last successful remote push; '' = never (P48)
  syncStaleDays: number; // alert threshold in days; 0 = the staleness check is off
  syncIsStale: boolean; // true when the alert sweep would warn about this right now
};

/** Storage config for the Settings editor — never includes the password. */
export async function getStorageInfo(): Promise<StorageInfo> {
  const s = await getStorageConfig();
  const creds = await getOnedriveCreds();
  // Same verdict the alert sweep computes, so the panel and the notification can never
  // disagree about whether the mirror has fallen behind.
  const settings = await getAppSettings();
  const lastSync = await getLastRemoteSync();
  const stale = detectSyncStaleness({ backend: s.backend, lastSyncAt: lastSync, thresholdDays: settings.syncStaleDays, now: Date.now() });
  return {
    backend: s.backend,
    mirror: s.mirror,
    folderTemplate: s.folderTemplate,
    fileNameTemplate: s.fileNameTemplate,
    hasPass: s.hasPass,
    remoteHost: s.remote.host,
    remotePort: s.remote.port ?? 0,
    remoteUser: s.remote.user,
    remoteShare: s.remote.share ?? '',
    remoteBasePath: s.remote.basePath ?? '',
    remoteSecure: !!s.remote.secure,
    onedriveConnected: !!creds,
    onedriveAccount: creds?.account || '',
    lastSyncAt: lastSync ? lastSync.toISOString() : '',
    syncStaleDays: settings.syncStaleDays,
    syncIsStale: !!stale,
  };
}

export async function saveStorageConfig(formData: FormData): Promise<{ ok: boolean }> {
  await requireAdmin();
  await connectDB();
  const backend = String(formData.get('storageBackend') || 'local');
  const update: Record<string, unknown> = {
    storageBackend: ['ftp', 'smb', 'onedrive'].includes(backend) ? backend : 'local',
    storageMirror: formData.get('storageMirror') === 'true',
    folderTemplate: String(formData.get('folderTemplate') || '').trim() || DEFAULT_FOLDER_TEMPLATE,
    fileNameTemplate: String(formData.get('fileNameTemplate') || '').trim() || DEFAULT_NAME_TEMPLATE,
    remoteHost: String(formData.get('remoteHost') || '').trim(),
    remotePort: Math.max(0, Math.min(65535, Number(formData.get('remotePort')) || 0)),
    remoteUser: String(formData.get('remoteUser') || '').trim(),
    remoteShare: String(formData.get('remoteShare') || '').trim(),
    remoteBasePath: String(formData.get('remoteBasePath') || '').trim(),
    remoteSecure: formData.get('remoteSecure') === 'true',
  };
  const pass = String(formData.get('remotePass') || '');
  if (pass) update.remotePass = pass; // blank → keep the existing one
  await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $set: update }, { upsert: true });
  invalidateStorageConfig();
  revalidatePath('/settings');
  return { ok: true };
}

/** Verify the SAVED remote config (Save first, then Test). */
export async function testRemoteConnection(): Promise<{ ok: boolean; error?: string }> {
  const s = await getStorageConfig();
  if (s.backend === 'local') return { ok: false, error: 'Backend is Local — nothing to test' };
  return testRemote(s.remote);
}

function shortId(id: unknown): string {
  return String(id).slice(-6);
}
function extOf(p: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(p);
  return m ? m[1] : 'bin';
}
function baseNoExt(p: string): string {
  return (p.split('/').pop() || p).replace(/\.[^.]+$/, '');
}

export type SyncResult = { ok: boolean; pushed: number; failed: number; skipped: number; error?: string; errors: string[] };

/** Every local file that should be mirrored, with its rendered remote path. Cheap
 *  (no file reads) so the client can show a real "X / total" progress bar. */
async function buildSyncManifest(s: Awaited<ReturnType<typeof getStorageConfig>>): Promise<{ filePath: string; rel: string }[]> {
  await connectDB();
  const out: { filePath: string; rel: string }[] = [];
  const rel = (kind: 'receipts' | 'statements' | 'expenses', store: string, date: string | Date | undefined, total: number, id: unknown, fp: string) =>
    renderStoragePath(s.folderTemplate, s.fileNameTemplate, {
      kind,
      store,
      date: date ? new Date(date).toISOString().slice(0, 10) : '',
      total,
      id: shortId(id),
      original: baseNoExt(fp),
      ext: extOf(fp),
    });

  const receipts = (await (await scoped(Receipt)).find({ archived: { $ne: true }, filePath: { $nin: ['', null] } }).select('store date total filePath').lean()) as Array<Record<string, unknown>>;
  for (const r of receipts) out.push({ filePath: String(r.filePath), rel: rel('receipts', String(r.store || ''), r.date as string, Number(r.total || 0), r._id, String(r.filePath)) });

  const statements = (await (await scoped(Statement)).find({ filePath: { $nin: ['', null] } }).select('card period totalAmount statementDate filePath').lean()) as Array<Record<string, unknown>>;
  for (const st of statements) out.push({ filePath: String(st.filePath), rel: rel('statements', String(st.card || ''), (st.statementDate as string) || `${st.period || ''}-01`, Number(st.totalAmount || 0), st._id, String(st.filePath)) });

  const exps = (await (await scoped(Expense)).find({ filePath: { $nin: ['', null] } }).select('kind vendor amount date filePath').lean()) as Array<Record<string, unknown>>;
  for (const e of exps) out.push({ filePath: String(e.filePath), rel: rel('expenses', String(e.vendor || e.kind || ''), e.date as string, Number(e.amount || 0), e._id, String(e.filePath)) });

  return out;
}

/** The list of files to sync (for the progress bar). Backend-agnostic. */
export async function getSyncManifest(): Promise<{ ok: boolean; error?: string; items: { filePath: string; rel: string }[] }> {
  const s = await getStorageConfig();
  if (s.backend === 'local') return { ok: false, error: 'Set a remote backend first', items: [] };
  if (s.backend === 'onedrive' && !(await getOnedriveCreds())) return { ok: false, error: 'Connect OneDrive first', items: [] };
  if (s.backend !== 'onedrive' && !s.remote.host) return { ok: false, error: 'No remote host configured', items: [] };
  return { ok: true, items: await buildSyncManifest(s) };
}

/** Upload one chunk (the client loops over chunks to show progress). A file whose
 *  local copy is gone (ENOENT) is SKIPPED, not failed — there's nothing to upload. */
export async function syncOnedriveBatch(items: { filePath: string; rel: string }[]): Promise<{ pushed: number; failed: number; skipped: number; errors: string[] }> {
  let pushed = 0, failed = 0, skipped = 0;
  const errors: string[] = [];
  for (const it of items) {
    try {
      const data = await readFile(it.filePath);
      const r = await uploadToOnedrive(it.rel, data);
      if (r.ok) pushed++;
      else { failed++; if (errors.length < 5) errors.push(`${it.rel}: ${r.error}`); }
    } catch (err) {
      const msg = (err as Error).message;
      if (/ENOENT|no such file/i.test(msg)) skipped++; // local file missing — not a sync failure
      else { failed++; if (errors.length < 5) errors.push(`${it.rel}: ${msg}`); }
    }
  }
  // Any file that actually landed counts as a successful sync for the staleness alert
  // (P48). A batch that pushed nothing does NOT refresh the clock — otherwise clicking
  // "Sync now" against a dead NAS would keep resetting the very warning it should raise.
  if (pushed > 0) await markRemoteSync();
  return { pushed, failed, skipped, errors };
}

/** One-shot sync (used for SMB/FTP — single connection. OneDrive uses the batched
 *  path above so the UI can show progress and survive throttling). */
export async function syncToRemote(): Promise<SyncResult> {
  await requireAdmin();
  const s = await getStorageConfig();
  if (s.backend === 'local') return { ok: false, pushed: 0, failed: 0, skipped: 0, error: 'Set a remote backend first', errors: [] };
  if (!s.remote.host) return { ok: false, pushed: 0, failed: 0, skipped: 0, error: 'No remote host configured', errors: [] };
  const manifest = await buildSyncManifest(s);
  const files: RemoteFile[] = [];
  let skipped = 0;
  for (const it of manifest) {
    try {
      files.push({ data: await readFile(it.filePath), remoteRelPath: it.rel });
    } catch {
      skipped++;
    }
  }
  const res = await pushBatchToRemote(s.remote, files);
  if (res.pushed > 0) await markRemoteSync(); // see syncOnedriveBatch for why pushed > 0
  return { ok: res.failed === 0, pushed: res.pushed, failed: res.failed, skipped, errors: res.errors };
}

// ─── Email-in (IMAP) auto-import (P11) ─────────────────────────────────────────
// Self-hosted only: poll an existing mailbox for receipt emails (attachments or
// HTML body) and feed each one through the same upload+parse pipeline as a manual
// drop. No background cron — a manual "Check inbox now" button, mirroring the
// OneDrive "Test connection" / storage "Sync now" UX.

export type ImapInfo = {
  enabled: boolean; host: string; port: number; user: string; secure: boolean; folder: string;
  hasPass: boolean; lastCheckedAt: string; lastImportedAt: string;
};

export async function getImapInfo(): Promise<ImapInfo> {
  const c = await getImapConfig();
  return {
    enabled: c.enabled, host: c.host, port: c.port, user: c.user, secure: c.secure, folder: c.folder,
    hasPass: c.hasPass, lastCheckedAt: c.lastCheckedAt, lastImportedAt: c.lastImportedAt,
  };
}

export async function saveImapConfigAction(formData: FormData): Promise<{ ok: boolean }> {
  await requireAdmin();
  await connectDB();
  const update: Record<string, unknown> = {
    imapEnabled: formData.get('imapEnabled') === 'true',
    imapHost: String(formData.get('imapHost') || '').trim(),
    imapPort: Math.max(1, Math.min(65535, Number(formData.get('imapPort')) || 993)),
    imapUser: String(formData.get('imapUser') || '').trim(),
    imapSecure: formData.get('imapSecure') !== 'false',
    imapFolder: String(formData.get('imapFolder') || '').trim() || 'INBOX',
  };
  const pass = String(formData.get('imapPass') || '');
  if (pass) update.imapPass = pass; // blank → keep the existing one
  await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $set: update }, { upsert: true });
  invalidateImapConfig();
  revalidatePath('/settings');
  return { ok: true };
}

/** Verify the SAVED imap config (Save first, then Test) — read-only, no message fetch. */
export async function testImapConnectionAction(): Promise<{ ok: boolean; error?: string; messageCount?: number }> {
  const cfg = await getImapConfig();
  const r = await testImapConnection(cfg);
  return r.ok ? { ok: true, messageCount: r.messageCount } : { ok: false, error: r.error };
}

/** Fetch new messages since the last check and import each as a draft receipt
 *  (attachments and/or the HTML body), same pipeline as a manual drag-drop upload —
 *  one AI parse call per message, gated by the receipts AI-feature toggle like any
 *  other upload. Advances the resume point (imapLastUid) even on partial failures. */
export async function checkImapInboxNow(): Promise<{ ok: boolean; imported: number; skipped: number; error?: string }> {
  await requireAdmin();
  const cfg = await getImapConfig();
  if (!cfg.enabled) return { ok: false, imported: 0, skipped: 0, error: 'Email-in is not enabled' };
  const r = await fetchNewEmails(cfg);
  if (!r.ok) return { ok: false, imported: 0, skipped: 0, error: r.error };

  let imported = 0;
  let skipped = 0;
  for (const email of r.emails) {
    const items: { filename: string; contentType: string; bytes: Buffer }[] = email.attachments.length > 0
      ? email.attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, bytes: a.content }))
      : email.html
        ? [{ filename: `${email.subject || 'email'}.html`.replace(/[\\/:*?"<>|]/g, '_'), contentType: 'text/html', bytes: Buffer.from(email.html, 'utf8') }]
        : [];
    for (const it of items) {
      try {
        const fd = new FormData();
        fd.set('file', new File([new Uint8Array(it.bytes)], it.filename, { type: it.contentType }));
        const res = await uploadReceipt(fd);
        if (res.ok) imported++; else skipped++;
      } catch {
        skipped++;
      }
    }
  }

  await connectDB();
  await (await scoped(AppConfig)).updateOne(
    { key: 'singleton' },
    { $set: { imapLastUid: r.maxUid, imapLastCheckedAt: new Date(), ...(imported > 0 ? { imapLastImportedAt: new Date() } : {}) } },
    { upsert: true }
  );
  invalidateImapConfig();
  revalidatePath('/settings');
  revalidatePath('/receipts');
  return { ok: true, imported, skipped };
}

// ─── Editable dropdown lists (category taxonomies) ────────────────────────────

export type ListEditorEntry = { key: TaxonomyKey; label: string; where: string; values: string[]; default: string[] };

export async function getListsForEditor(): Promise<ListEditorEntry[]> {
  const s = await getAppSettings();
  const current: Record<TaxonomyKey, string[]> = {
    expenseCategories: s.expenseCategories,
    itemCategories: s.itemCategories,
    subscriptionCategories: s.subscriptionCategories,
  };
  return TAXONOMY_META.map((m) => ({ key: m.key, label: m.label, where: m.where, values: current[m.key], default: m.default }));
}

/** Save one taxonomy list. Empty / identical-to-default → clears the override. */
export async function saveList(key: string, values: string[]): Promise<{ ok: boolean }> {
  await assertCanWrite();
  const meta = TAXONOMY_META.find((m) => m.key === key);
  if (!meta) return { ok: false };
  await connectDB();
  const cleaned = normalizeList(Array.isArray(values) ? values : []);
  const path = `lists.${key}`;
  const isDefault = cleaned.length === meta.default.length && cleaned.every((v, i) => v === meta.default[i]);
  if (cleaned.length <= 1 || isDefault) {
    await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $unset: { [path]: '' } }, { upsert: true });
  } else {
    await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $set: { [path]: cleaned } }, { upsert: true });
  }
  invalidateAppSettings();
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Save the per-property / per-context ledger tags (P34). Empty list clears them
 *  (the feature goes dormant). Deterministic, no AI. */
export async function saveSpaces(values: string[]): Promise<{ ok: boolean }> {
  await assertCanWrite();
  await connectDB();
  const cleaned = normalizeSpaces(Array.isArray(values) ? values : []);
  if (cleaned.length === 0) {
    await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $unset: { spaces: '' } }, { upsert: true });
  } else {
    await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $set: { spaces: cleaned } }, { upsert: true });
  }
  invalidateAppSettings();
  revalidatePath('/', 'layout');
  return { ok: true };
}

// ─── Store list management (D3) ─────────────────────────────────────────────

export async function listStores(): Promise<StoreLite[]> {
  return getStores();
}

/** Create or update a store. id empty = create. */
export async function saveStore(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await assertCanWrite();
  const id = String(formData.get('id') || '');
  const name = String(formData.get('name') || '').trim();
  const url = String(formData.get('url') || '').trim();
  const aliases = String(formData.get('aliases') || '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  if (!name) return { ok: false, error: 'Name is required' };
  // Per-store return-window override: blank = inherit the global default (null),
  // 0 = no returns at this store.
  const rwRaw = String(formData.get('returnWindowDays') ?? '').trim();
  const rwNum = Number(rwRaw);
  const returnWindowDays = rwRaw === '' || !Number.isFinite(rwNum) ? null : Math.max(0, Math.min(365, Math.round(rwNum)));

  await connectDB();
  try {
    if (id) {
      await (await scoped(Store)).findByIdAndUpdate(id, { $set: { name, url, aliases, auto: false, returnWindowDays } });
    } else {
      await (await scoped(Store)).create({ name, url, aliases: aliases.length ? aliases : [name.toLowerCase()], auto: false, returnWindowDays });
    }
  } catch {
    return { ok: false, error: 'A store with that name already exists' };
  }
  invalidateStoreCache();
  revalidatePath('/settings');
  revalidatePath('/receipts');
  return { ok: true };
}

export async function deleteStore(id: string): Promise<{ ok: boolean }> {
  await assertCanWrite();
  await connectDB();
  await (await scoped(Store)).findByIdAndDelete(id);
  invalidateStoreCache();
  revalidatePath('/settings');
  revalidatePath('/receipts');
  return { ok: true };
}

// ─── Duplicate store detection + merge ───────────────────────────────────────
// Email imports + AI guesses create variants of the same shop ("Viva"/"Vivawallet",
// "Steam"/"Steampowered", "Κωτσόβολος"/"kotsovolos.gr"). Group them and let the user
// merge each cluster into one canonical name — rewriting every receipt + item.

export type StoreVariant = { name: string; receiptCount: number; itemCount: number; inList: boolean };
export type StoreDupGroup = { key: string; variants: StoreVariant[] };

const GREEK_MAP: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm',
  ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
};
const STORE_STOPWORDS = /\b(ae|sa|ltd|epe|ee|ike|mike|anonymi|anonymos|etaireia|company|co|inc|gmbh|store|shop|online|gr|com|net|eu|www|http|https)\b/g;

/** Normalize a store name for grouping (accent / case / domain / legal-suffix / greek↔latin agnostic). */
function storeKey(raw: string): string {
  let s = (raw || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); // strip accents
  s = s.replace(/https?:\/\//g, '').replace(/www\./g, '');
  s = s.replace(/\.(gr|com|net|eu|org|de|co\.uk)\b/g, ' ');
  s = s
    .split('')
    .map((c) => GREEK_MAP[c] ?? c)
    .join(''); // greek → latin
  s = s.replace(/[^a-z0-9]+/g, ' ').trim();
  s = s.replace(STORE_STOPWORDS, ' ').replace(/\s+/g, '');
  return s;
}

export async function findDuplicateStores(): Promise<StoreDupGroup[]> {
  await connectDB();
  const [rAgg, iAgg, storeDocs] = await Promise.all([
    (await scoped(Receipt)).aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$store', n: { $sum: 1 } } }]),
    (await scoped(Item)).aggregate([{ $match: { purchasedFrom: { $nin: ['', null] }, deletedAt: null } }, { $group: { _id: '$purchasedFrom', n: { $sum: 1 } } }]),
    (await scoped(Store)).find().select('name').lean(),
  ]);

  const usage = new Map<string, StoreVariant>();
  const ensure = (name: string): StoreVariant => {
    let v = usage.get(name);
    if (!v) {
      v = { name, receiptCount: 0, itemCount: 0, inList: false };
      usage.set(name, v);
    }
    return v;
  };
  for (const r of rAgg as { _id: string; n: number }[]) if (r._id) ensure(r._id).receiptCount = r.n;
  for (const i of iAgg as { _id: string; n: number }[]) if (i._id) ensure(i._id).itemCount = i.n;
  for (const d of storeDocs as { name: string }[]) if (d.name) ensure(d.name).inList = true;

  // Group by normalized key
  const byKey = new Map<string, StoreVariant[]>();
  for (const v of usage.values()) {
    const k = storeKey(v.name);
    if (!k) continue;
    const list = byKey.get(k);
    if (list) list.push(v);
    else byKey.set(k, [v]);
  }

  // Prefix-merge clusters: fold a longer key into a shorter one it begins with
  // (catches viva/vivawallet, steam/steampowered). Union-find over the keys.
  const keys = [...byKey.keys()].sort((a, b) => a.length - b.length);
  const parent = new Map<string, string>();
  const root = (k: string): string => {
    let r = k;
    while (parent.has(r)) r = parent.get(r)!;
    return r;
  };
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const short = keys[i];
      const long = keys[j];
      if (short.length >= 4 && long.startsWith(short) && root(long) !== root(short)) {
        parent.set(root(long), root(short));
      }
    }
  }
  const clusters = new Map<string, StoreVariant[]>();
  for (const [k, arr] of byKey) {
    const r = root(k);
    const list = clusters.get(r);
    if (list) list.push(...arr);
    else clusters.set(r, [...arr]);
  }

  const out: StoreDupGroup[] = [];
  for (const [key, variants] of clusters) {
    if (variants.length < 2) continue;
    variants.sort(
      (a, b) => b.receiptCount + b.itemCount - (a.receiptCount + a.itemCount) || a.name.localeCompare(b.name)
    );
    out.push({ key, variants });
  }
  out.sort((a, b) => b.variants.length - a.variants.length);
  return out;
}

/** Merge store-name variants into one canonical name across receipts, items and the store list. */
export async function mergeStores(
  canonical: string,
  variants: string[]
): Promise<{ ok: boolean; updated: number; error?: string }> {
  await assertCanWrite();
  const canon = (canonical || '').trim();
  if (!canon) return { ok: false, updated: 0, error: 'No canonical name' };
  const drops = variants.filter((v) => v && v !== canon);
  if (drops.length === 0) return { ok: false, updated: 0, error: 'Nothing to merge' };
  await connectDB();

  let updated = 0;
  for (const v of drops) {
    const r = await (await scoped(Receipt)).updateMany({ store: v }, { $set: { store: canon } });
    const it = await (await scoped(Item)).updateMany({ purchasedFrom: v }, { $set: { purchasedFrom: canon } });
    updated += (r.modifiedCount ?? 0) + (it.modifiedCount ?? 0);
  }

  // Consolidate the store list: fold variant names into the canonical doc as aliases,
  // delete the variant docs.
  const aliasSet = new Set(drops.map((d) => d.toLowerCase()).filter(Boolean));
  const canonDoc = await (await scoped(Store)).findOne({ name: canon });
  if (canonDoc) {
    const merged = new Set([...(canonDoc.aliases ?? []), ...aliasSet, canon.toLowerCase()]);
    canonDoc.aliases = [...merged];
    canonDoc.auto = false;
    await canonDoc.save();
  } else {
    await (await scoped(Store)).create({ name: canon, aliases: [...aliasSet, canon.toLowerCase()], auto: false });
  }
  await (await scoped(Store)).deleteMany({ name: { $in: drops } });

  invalidateStoreCache();
  revalidatePath('/settings');
  revalidatePath('/receipts');
  revalidatePath('/items');
  return { ok: true, updated };
}

// ─── Backup / restore (JSON of all metadata; binary files live on disk) ───────

// The registry itself lives in lib/backupModels.ts so a guard test can check it against
// src/models — it had already drifted seven models behind (the whole Expense/Income
// module included), which silently dropped them from every backup taken.

/** Export every collection's documents as a single JSON string (for download). */
export async function exportData(): Promise<string> {
  await requireAdmin();
  await connectDB();
  const entries = await Promise.all(
    Object.entries(BACKUP_MODELS).map(async ([key, Model]) => [key, await (Model as typeof Item).find().lean()] as const)
  );
  const collections: Record<string, unknown[]> = {};
  for (const [key, docs] of entries) collections[key] = docs as unknown[];
  return JSON.stringify({ app: 'homepage', version: 1, exportedAt: new Date().toISOString(), collections });
}

/**
 * Check a backup file without restoring it (Settings → Storage & backup → Verify).
 *
 * Read-only: it never touches the database, so it is safe to run on any file at any
 * time. This is the answer to "is the backup I have been taking for months actually
 * restorable?", a question that otherwise only gets asked at the worst possible moment.
 */
export async function verifyBackup(json: string): Promise<BackupVerifyResult & { summary: string }> {
  await requireAdmin();
  const result = verifyBackupJson(json, BACKUP_KEYS);
  return { ...result, summary: formatBackupCounts(result) };
}

/** Build a CSV string (quote fields containing commas/quotes/newlines). */
function toCSV(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    let s = String(v ?? '');
    // CSV-injection guard: a leading =,+,-,@,tab,CR makes Excel/Sheets evaluate the
    // cell as a formula. Prefix with ' so a malicious vendor/note stays plain text.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');
}
const isoDay = (d: unknown) => (d ? new Date(d as string).toISOString().slice(0, 10) : '');

/** Export a collection as CSV (for a spreadsheet / accountant / tax). */
export async function exportCSV(kind: 'receipts' | 'expenses' | 'items'): Promise<string> {
  await connectDB();
  if (kind === 'receipts') {
    const rows = (await (await scoped(Receipt)).find().select('store date total netAmount vatAmount paymentMethod verified').sort({ date: -1 }).lean()) as Record<string, unknown>[];
    return toCSV(
      ['Store', 'Date', 'Total', 'Net', 'VAT', 'Payment', 'Verified'],
      rows.map((r) => [String(r.store ?? ''), isoDay(r.date), Number(r.total ?? 0), Number(r.netAmount ?? 0), Number(r.vatAmount ?? 0), String(r.paymentMethod ?? ''), r.verified ? 'yes' : 'no'])
    );
  }
  if (kind === 'expenses') {
    const rows = (await (await scoped(Expense)).find().select('kind vendor category amount date period recurring verified').sort({ date: -1 }).lean()) as Record<string, unknown>[];
    return toCSV(
      ['Kind', 'Vendor', 'Category', 'Amount', 'Date', 'Period', 'Recurring', 'Verified'],
      rows.map((r) => [String(r.kind ?? ''), String(r.vendor ?? ''), String(r.category ?? ''), Number(r.amount ?? 0), isoDay(r.date), String(r.period ?? ''), r.recurring ? 'yes' : 'no', r.verified ? 'yes' : 'no'])
    );
  }
  const rows = (await (await scoped(Item)).find().select('title category status currentPrice purchasedPrice purchasedFrom serialNumber location warrantyUntil').sort({ title: 1 }).lean()) as Record<string, unknown>[];
  return toCSV(
    ['Title', 'Category', 'Status', 'Current price', 'Paid', 'Bought from', 'Serial', 'Location', 'Warranty until'],
    rows.map((r) => [String(r.title ?? ''), String(r.category ?? ''), String(r.status ?? ''), Number(r.currentPrice ?? 0), r.purchasedPrice == null ? '' : Number(r.purchasedPrice), String(r.purchasedFrom ?? ''), String(r.serialNumber ?? ''), String(r.location ?? ''), isoDay(r.warrantyUntil)])
  );
}

type InsuranceItemDoc = {
  _id: Types.ObjectId;
  title: string;
  category: string;
  serialNumber: string;
  location: string;
  purchasedAt: Date | null;
  purchasedFrom: string;
  warrantyUntil: Date | null;
  currentPrice: number | null;
  purchasedPrice: number | null;
  photos: string[];
  attachments: { path: string; name: string }[];
  receiptIds: Types.ObjectId[];
};

/** Sanitize a filename fragment for a ZIP entry (no path separators / traversal). */
function safeZipName(name: string, fallback: string): string {
  const base = (name || '').split(/[\\/]/).pop() || '';
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return clean || fallback;
}

/**
 * Insurance / proof-of-ownership export (P13). ZIP containing a CSV manifest, a
 * standalone HTML report (opens straight out of the ZIP, prints to PDF), and the
 * photos/manuals/receipts for every currently-owned item — everything an insurer
 * would ask for after a claim. v1 builder default: no PDF-writing dependency —
 * the HTML report covers the same need (viewable + printable) without one; value
 * = the depreciation-adjusted estimate (P29) so it doesn't overstate aging gear,
 * falling back to purchase price when depreciation is off (same formula as
 * Reports/net-worth). Only 'received'/'installed' items count as currently owned
 * (excludes 'sold' — no longer yours — and shopping-list statuses).
 */
export async function exportInsuranceBundle(): Promise<{ base64: string; itemCount: number; totalValue: number }> {
  await requireAdmin();
  await connectDB();
  const [settings, items] = await Promise.all([
    getAppSettings(),
    (await scoped(Item)).find({ status: { $in: ['received', 'installed'] } })
      .select('title category serialNumber location purchasedAt purchasedFrom warrantyUntil currentPrice purchasedPrice photos attachments receiptIds')
      .sort({ title: 1 })
      .lean<InsuranceItemDoc[]>(),
  ]);

  const receiptIds = [...new Set(items.flatMap((i) => (i.receiptIds || []).map((id) => String(id))))];
  const receipts = receiptIds.length
    ? await (await scoped(Receipt)).find({ _id: { $in: receiptIds } }).select('store date filePath').lean<{ _id: Types.ObjectId; store: string; date: Date; filePath: string }[]>()
    : [];
  const receiptById = new Map(receipts.map((r) => [String(r._id), r]));

  const zip = new JSZip();
  const insuranceItems: InsuranceItem[] = [];
  let totalValue = 0;

  for (const it of items) {
    const id = String(it._id);
    const value = estimatedItemValue(
      { category: it.category, purchasedPrice: it.purchasedPrice, purchasedAt: it.purchasedAt, currentPrice: it.currentPrice },
      settings.depreciation
    );
    if (value > 0) totalValue += value;

    const folder = zip.folder(`files/${id}`)!;
    const photoFiles: string[] = [];
    for (const [idx, relPath] of (it.photos || []).entries()) {
      try {
        const buf = await readFile(relPath);
        const ext = relPath.split('.').pop() || 'jpg';
        const name = `photo_${idx}.${ext}`;
        folder.file(name, buf);
        photoFiles.push(name);
      } catch {
        // Missing file on disk (orphaned reference) — skip, don't fail the whole export.
      }
    }
    const attachmentFiles: { file: string; name: string }[] = [];
    for (const [idx, att] of (it.attachments || []).entries()) {
      try {
        const buf = await readFile(att.path);
        const name = safeZipName(att.name || att.path, `document_${idx}`);
        folder.file(name, buf);
        attachmentFiles.push({ file: name, name: att.name || name });
      } catch {
        // same as above
      }
    }
    const receiptFiles: { file: string; store: string; date: string | null }[] = [];
    for (const [idx, rid] of (it.receiptIds || []).entries()) {
      const r = receiptById.get(String(rid));
      if (!r) continue;
      try {
        const buf = await readFile(r.filePath);
        const ext = r.filePath.split('.').pop() || 'pdf';
        const name = `receipt_${idx}.${ext}`;
        folder.file(name, buf);
        receiptFiles.push({ file: name, store: r.store || '', date: r.date ? new Date(r.date).toISOString() : null });
      } catch {
        // same as above
      }
    }

    insuranceItems.push({
      id,
      title: it.title || 'Untitled',
      category: it.category || 'other',
      serialNumber: it.serialNumber || '',
      location: it.location || '',
      purchasedAt: it.purchasedAt ? new Date(it.purchasedAt).toISOString() : null,
      purchasedFrom: it.purchasedFrom || '',
      warrantyUntil: it.warrantyUntil ? new Date(it.warrantyUntil).toISOString() : null,
      value,
      photoFiles,
      attachmentFiles,
      receiptFiles,
    });
  }

  zip.file('insurance-manifest.csv', '﻿' + buildInsuranceCsv(insuranceItems));
  zip.file('insurance-manifest.html', buildInsuranceHtml(insuranceItems, { generatedAt: new Date().toISOString().slice(0, 10), currencySymbol: cur() }));

  const base64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
  return { base64, itemCount: insuranceItems.length, totalValue: Math.round(totalValue * 100) / 100 };
}

type TaxExpenseDoc = {
  _id: Types.ObjectId;
  vendor: string;
  category: string;
  taxCategory: string;
  amount: number;
  date: Date;
  notes: string;
  filePath: string;
};

/**
 * Year-end tax export bundle (P8). ZIP containing a CSV manifest, a standalone
 * HTML report grouped by tax category (opens straight out of the ZIP, prints
 * to PDF), and the original bill/receipt file for every tax-deductible expense
 * dated within the given year — the paper trail an accountant asks for. Same
 * v1 trade-off as exportInsuranceBundle: no PDF-writing dependency, the HTML
 * report covers viewing + printing. Only 'expense' kind counts (income is
 * never "deductible"); `taxDeductible` gates inclusion, `taxCategory` groups.
 */
export async function exportTaxBundle(year: number): Promise<{ base64: string; itemCount: number; totalValue: number }> {
  await requireAdmin();
  await connectDB();
  const y = Number.isFinite(year) ? Math.trunc(year) : new Date().getFullYear();
  const from = new Date(Date.UTC(y, 0, 1));
  const to = new Date(Date.UTC(y + 1, 0, 1));
  const [settings, rows] = await Promise.all([
    getAppSettings(),
    (await scoped(Expense)).find({ kind: 'expense', taxDeductible: true, date: { $gte: from, $lt: to } })
      .select('vendor category taxCategory amount date notes filePath')
      .sort({ date: 1 })
      .lean<TaxExpenseDoc[]>(),
  ]);

  const zip = new JSZip();
  const taxRows: TaxExpenseRow[] = [];
  let totalValue = 0;

  for (const [idx, r] of rows.entries()) {
    const id = String(r._id);
    totalValue += r.amount || 0;

    let fileName = '';
    if (r.filePath) {
      try {
        const buf = await readFile(r.filePath);
        const ext = r.filePath.split('.').pop() || 'pdf';
        fileName = `bill_${idx}.${ext}`;
        zip.folder(`files/${id}`)!.file(fileName, buf);
      } catch {
        // Missing file on disk (orphaned reference) — skip, don't fail the whole export.
      }
    }

    taxRows.push({
      id,
      date: r.date ? new Date(r.date).toISOString() : '',
      vendor: r.vendor || '',
      category: r.category || 'other',
      taxCategory: r.taxCategory || '',
      amount: r.amount || 0,
      notes: r.notes || '',
      fileName,
    });
  }

  zip.file('tax-manifest.csv', '﻿' + buildTaxCsv(taxRows));
  zip.file('tax-manifest.html', buildTaxHtml(taxRows, { year: y, generatedAt: new Date().toISOString().slice(0, 10), currencySymbol: cur() }));

  const base64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
  return { base64, itemCount: taxRows.length, totalValue: Math.round(totalValue * 100) / 100 };
}

/** Save monthly budgets (expense category → € amount). Empty/0 values are dropped. */
export async function saveBudgets(budgets: Record<string, number>): Promise<{ ok: boolean }> {
  await assertCanWrite();
  await connectDB();
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(budgets || {})) {
    const n = Number(v);
    if (k && Number.isFinite(n) && n > 0) clean[k.trim()] = Math.round(n * 100) / 100;
  }
  await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $set: { budgets: clean } }, { upsert: true });
  invalidateAppSettings();
  revalidatePath('/reports');
  revalidatePath('/settings');
  return { ok: true };
}

/** Toggle envelope / rollover budgeting (P25). When on, Reports carries the net
 *  unspent balance from recent complete months into this month's budget. */
export async function saveBudgetRollover(enabled: boolean): Promise<{ ok: boolean }> {
  await assertCanWrite();
  await connectDB();
  await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $set: { budgetRollover: !!enabled } }, { upsert: true });
  invalidateAppSettings();
  revalidatePath('/reports');
  revalidatePath('/settings');
  return { ok: true };
}

/** Save the vendor→category auto-rules (P15). Cleaned/validated via resolveCategoryRules
 *  (drops entries missing a match or category). Applied on create by the expense actions. */
export async function saveCategoryRules(rules: unknown): Promise<{ ok: boolean }> {
  await assertCanWrite();
  await connectDB();
  const clean = resolveCategoryRules(rules);
  await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $set: { categoryRules: clean } }, { upsert: true });
  invalidateAppSettings();
  revalidatePath('/settings');
  return { ok: true };
}

/** Suggest a monthly budget per expense category from spending history (P27).
 *  Deterministic, no AI: median of the last few complete months per category,
 *  rounded to the nearest €5. The UI pre-fills these into the budget inputs so
 *  the user can edit before saving (suggest ≠ auto-apply). */
export async function suggestBudgets(): Promise<{ suggestions: Record<string, number>; months: number }> {
  await connectDB();
  const months = 3;
  const rows = (await (await scoped(Expense)).find({ kind: { $ne: 'income' } })
    .select('kind amount category period date')
    .lean()) as BudgetExpenseRow[];
  const suggestions = suggestBudgetsFromExpenses(rows, { windowMonths: months });
  return { suggestions, months };
}

/** Save manual asset accounts for net worth (account name → balance). Zero/empty
 *  balances are dropped — an account with no balance contributes nothing (PA2). */
export async function saveAssetAccounts(accounts: Record<string, number>): Promise<{ ok: boolean }> {
  await assertCanWrite();
  await connectDB();
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(accounts || {})) {
    const n = Number(v);
    if (k.trim() && Number.isFinite(n) && n > 0) clean[k.trim().slice(0, 60)] = Math.round(n * 100) / 100;
  }
  await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $set: { assetAccounts: clean } }, { upsert: true });
  invalidateAppSettings();
  revalidatePath('/reports');
  revalidatePath('/settings');
  return { ok: true };
}

/** Save the asset depreciation model (P29): master toggle, salvage floor %, a
 *  default annual rate, and per item-category annual rates. Percent values are
 *  clamped to 0..100. Categories the user left empty are simply not sent (the
 *  built-in per-category default applies at read time). Affects the depreciated
 *  owned-inventory value on Reports. */
export async function saveDepreciation(cfg: {
  enabled: boolean;
  floorPct: number;
  defaultRate: number;
  rates: Record<string, number>;
}): Promise<{ ok: boolean }> {
  await assertCanWrite();
  await connectDB();
  const clampPct = (n: unknown) => Math.min(100, Math.max(0, Number(n) || 0));
  const rates: Record<string, number> = {};
  for (const [k, v] of Object.entries(cfg?.rates || {})) {
    const key = k.trim();
    const n = Number(v);
    if (key && Number.isFinite(n) && n >= 0) rates[key.slice(0, 60)] = Math.min(100, n);
  }
  const clean = {
    enabled: cfg?.enabled !== false,
    floorPct: clampPct(cfg?.floorPct),
    defaultRate: clampPct(cfg?.defaultRate),
    rates,
  };
  await (await scoped(AppConfig)).updateOne({ key: 'singleton' }, { $set: { depreciation: clean } }, { upsert: true });
  invalidateAppSettings();
  revalidatePath('/reports');
  revalidatePath('/settings');
  return { ok: true };
}

/** A stored file reference is safe only if it's a contained relative path. A
 *  tampered backup must not be able to point filePath/thumbPath/photos at e.g.
 *  ../../etc/passwd, which would then be served or unlinked by purge. */
function isSafeStoredPath(p: unknown): boolean {
  if (typeof p !== 'string' || !p || p.includes('\0')) return false;
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return false; // absolute
  return !p.split(/[/\\]/).some((seg) => seg === '..'); // no traversal
}

/** Restore from a backup JSON — upserts each document by _id (merges, never duplicates). */
export async function importData(json: string): Promise<{ ok: boolean; restored: number; error?: string; warnings?: string[] }> {
  await requireAdmin();
  // Pre-flight the same check the Verify button runs. Errors mean the file is not a
  // usable backup at all (empty, truncated, no envelope, zero documents) — cases that
  // used to either throw a vague message or, worse, report a successful restore of
  // nothing. Warnings do NOT block: a backup missing one collection is still worth
  // restoring, but the user is told what got skipped instead of it happening silently.
  const check = verifyBackupJson(json, BACKUP_KEYS);
  if (!check.ok) {
    return { ok: false, restored: 0, error: check.issues.filter((i) => i.level === 'error').map((i) => i.message).join(' ') };
  }
  const warnings = check.issues.filter((i) => i.level === 'warning').map((i) => i.message);
  const data = JSON.parse(json) as { collections?: Record<string, unknown[]> };
  const cols = data.collections as Record<string, unknown[]>;

  await connectDB();
  let restored = 0;
  for (const [key, Model] of Object.entries(BACKUP_MODELS)) {
    const docs = cols[key];
    if (!Array.isArray(docs)) continue;
    for (const raw of docs) {
      if (!raw || typeof raw !== 'object') continue;
      const { _id, __v, createdAt, updatedAt, ...rest } = raw as Record<string, unknown>;
      void __v;
      void createdAt;
      void updatedAt;
      // Drop tampered file references so a malicious backup can't aim purge/serve
      // at arbitrary files (defense in depth on top of storage.ts containment).
      for (const k of ['filePath', 'thumbPath'] as const) {
        if (k in rest && !isSafeStoredPath(rest[k])) delete rest[k];
      }
      if (Array.isArray(rest.photos)) rest.photos = rest.photos.filter(isSafeStoredPath);
      if (Array.isArray(rest.attachments)) {
        rest.attachments = (rest.attachments as unknown[]).filter(
          (a) => a && typeof a === 'object' && isSafeStoredPath((a as Record<string, unknown>).path)
        );
      }
      try {
        if (_id) await (Model as typeof Item).updateOne({ _id }, { $set: rest }, { upsert: true }).setOptions({ withDeleted: true });
        else await (Model as typeof Item).create(rest);
        restored++;
      } catch {
        /* skip a doc that won't validate */
      }
    }
  }
  invalidateStoreCache();
  revalidatePath('/settings');
  revalidatePath('/');
  return { ok: true, restored, ...(warnings.length > 0 ? { warnings } : {}) };
}

// ─── Trash (soft-deleted records) ────────────────────────────────────────────
// Deletes everywhere in the app are now SOFT (deletedAt set); this is the one
// place that restores or permanently purges them. Auto-purge after 30 days.
//
// TENANCY: these five kept reading `TRASH_MODELS[type]` directly while the other 65 actions in
// this file had already moved to `scoped()`, so in SaaS mode they listed, restored and
// PERMANENTLY DELETED out of the shared default database. `emptyTrash` is the sharp end: one
// workspace's "empty the trash" would sweep every workspace's trashed records, and unlike the
// settings-sharing bug that one is not reversible. They are gated first for that reason.
// `purgeTrashEntry` already routed its cross-reference cleanup through `scoped()` — the
// PRIMARY delete was the one going to the wrong database.

export type TrashRow = { type: TrashType; id: string; title: string; subtitle: string; deletedAt: string };
export type TrashType = 'item' | 'receipt' | 'expense' | 'subscription' | 'voucher' | 'giftcard' | 'loyaltycard' | 'bill' | 'goal' | 'task';

const TRASH_MODELS: Record<TrashType, typeof Item> = {
  item: Item,
  receipt: Receipt as unknown as typeof Item,
  expense: Expense as unknown as typeof Item,
  subscription: Subscription as unknown as typeof Item,
  voucher: Voucher as unknown as typeof Item,
  giftcard: GiftCard as unknown as typeof Item,
  loyaltycard: LoyaltyCard as unknown as typeof Item,
  bill: Bill as unknown as typeof Item,
  goal: Goal as unknown as typeof Item,
  task: Task as unknown as typeof Item,
};
const TRASH_RETENTION_DAYS = 30;

function trashLabel(type: TrashType, d: Record<string, unknown>): { title: string; subtitle: string } {
  switch (type) {
    case 'item': return { title: String(d.title || '—'), subtitle: String(d.category || '') };
    case 'receipt': return { title: String(d.store || '—'), subtitle: `€${d.total ?? 0} · ${d.date ? new Date(d.date as string).toLocaleDateString('en-GB') : ''}` };
    case 'expense': return { title: String(d.vendor || d.category || '—'), subtitle: `${d.kind} · €${d.amount ?? 0}` };
    case 'subscription': return { title: String(d.name || '—'), subtitle: `€${d.amount ?? 0}/${d.billingCycle || ''}` };
    case 'voucher': return { title: String(d.title || '—'), subtitle: String(d.store || '') };
    case 'giftcard': return { title: String(d.title || '—'), subtitle: `${d.store || ''} · €${d.initialAmount ?? 0}`.trim() };
    case 'loyaltycard': return { title: String(d.title || '—'), subtitle: String(d.store || '') };
    case 'bill': return { title: String(d.title || '—'), subtitle: `${d.vendor || ''} · €${d.amount ?? 0}`.trim() };
    case 'goal': return { title: String(d.title || '—'), subtitle: `€${d.targetAmount ?? 0}${d.targetDate ? ` · ${new Date(d.targetDate as string).toLocaleDateString('en-GB')}` : ''}` };
    case 'task': return { title: String(d.title || '—'), subtitle: String(d.status || '') };
  }
}

/** List everything in the Trash (and silently purge entries older than 30 days). */
export async function getTrash(): Promise<TrashRow[]> {
  await connectDB();
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86400000);
  const rows: TrashRow[] = [];
  for (const [type, RawModel] of Object.entries(TRASH_MODELS) as [TrashType, typeof Item][]) {
    const Model = await scoped(RawModel);
    const docs = await Model.find({ deletedAt: { $ne: null } }).setOptions({ withDeleted: true }).lean();
    for (const d of docs as unknown as Record<string, unknown>[]) {
      const deletedAt = new Date(d.deletedAt as string);
      if (deletedAt < cutoff) {
        await purgeTrashEntry(type, String(d._id));
        continue;
      }
      const { title, subtitle } = trashLabel(type, d);
      rows.push({ type, id: String(d._id), title, subtitle, deletedAt: deletedAt.toISOString() });
    }
  }
  return rows.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
}

/** Bring a trashed record back exactly as it was (files + links were never touched). */
export async function restoreFromTrash(type: TrashType, id: string): Promise<{ ok: boolean }> {
  await assertCanWrite();
  const RawModel = TRASH_MODELS[type];
  if (!RawModel) return { ok: false };
  await connectDB();
  const Model = await scoped(RawModel);
  await Model.updateOne({ _id: id }, { $set: { deletedAt: null } }).setOptions({ withDeleted: true });
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Permanently delete: doc + its binary files + dangling cross-references.
 *  Admin-guarded entry point for server actions. */
export async function purgeFromTrash(type: TrashType, id: string): Promise<{ ok: boolean }> {
  await requireAdmin();
  return purgeTrashEntry(type, id);
}

/** Core purge logic WITHOUT an auth guard. Callers (server action or bearer API
 *  route) must authorize first; the API route enforces admin via the bearer user. */
export async function purgeTrashEntry(type: TrashType, id: string): Promise<{ ok: boolean }> {
  await assertCanWrite();
  const RawModel = TRASH_MODELS[type];
  if (!RawModel) return { ok: false };
  await connectDB();
  const Model = await scoped(RawModel);
  const doc = (await Model.findById(id).setOptions({ withDeleted: true }).lean()) as Record<string, unknown> | null;
  if (!doc) return { ok: true };
  const oid = new Types.ObjectId(id);

  if (type === 'receipt' || type === 'expense') {
    for (const fp of [doc.filePath, doc.thumbPath]) if (fp) await deleteFile(String(fp)).catch(() => {});
  }
  if (type === 'receipt') {
    await (await scoped(Item)).updateMany({ receiptIds: oid }, { $pull: { receiptIds: oid } });
  }
  if (type === 'item') {
    for (const p of (doc.photos as string[] | undefined) ?? []) await deleteFile(p).catch(() => {});
    for (const a of (doc.attachments as { path?: string }[] | undefined) ?? []) if (a.path) await deleteFile(a.path).catch(() => {});
    await (await scoped(Receipt)).updateMany({ itemIds: oid }, { $pull: { itemIds: oid } });
    await (await scoped(Receipt)).updateMany(
      { 'lineItems.matchedItemId': oid },
      { $set: { 'lineItems.$[el].matchedItemId': null } },
      { arrayFilters: [{ 'el.matchedItemId': oid }] }
    );
    await (await scoped(Statement)).updateMany(
      { 'transactions.matchedItemIds': oid },
      { $pull: { 'transactions.$[].matchedItemIds': oid } }
    );
  }
  await Model.deleteOne({ _id: id }).setOptions({ withDeleted: true });
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Empty the whole Trash (permanent). */
export async function emptyTrash(): Promise<{ ok: boolean; purged: number }> {
  await requireAdmin();
  await connectDB();
  let purged = 0;
  for (const [type, RawModel] of Object.entries(TRASH_MODELS) as [TrashType, typeof Item][]) {
    const Model = await scoped(RawModel);
    const docs = await Model.find({ deletedAt: { $ne: null } }).setOptions({ withDeleted: true }).select('_id').lean();
    for (const d of docs as unknown as { _id: unknown }[]) {
      await purgeTrashEntry(type, String(d._id));
      purged++;
    }
  }
  return { ok: true, purged };
}

// ─── OneDrive wizard (Microsoft Graph device-code auth) ──────────────────────

/** Step 1 of the wizard: get a device code for the user to enter at microsoft.com/devicelogin. */
export async function startOnedriveAuth(clientId: string): Promise<DeviceCode> {
  await requireAdmin();
  return startDeviceCode(clientId.trim());
}

/** Step 2: poll until the user finishes signing in (returns 'pending' meanwhile). */
export async function pollOnedriveAuth(clientId: string, deviceCode: string): Promise<{ status: 'ok' | 'pending' | 'error'; error?: string; account?: string }> {
  await assertCanWrite();
  const r = await pollDeviceToken(clientId.trim(), deviceCode);
  if (r.status === 'ok') {
    invalidateStorageConfig();
    revalidatePath('/settings');
  }
  return r;
}

export async function getOnedriveStatus(): Promise<{ connected: boolean; account: string }> {
  const c = await getOnedriveCreds();
  return { connected: !!c, account: c?.account || '' };
}

export async function disconnectOnedriveAccount(): Promise<{ ok: boolean }> {
  await requireAdmin();
  await disconnectOnedrive();
  invalidateStorageConfig();
  revalidatePath('/settings');
  return { ok: true };
}

export async function testOnedriveConnection(): Promise<{ ok: boolean; error?: string; drive?: string }> {
  return testOnedrive();
}
