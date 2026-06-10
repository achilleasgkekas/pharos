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
import { Card } from '@/models/Card';
import { Task } from '@/models/Task';
import { Expense } from '@/models/Expense';
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
} from '@/lib/ollama';
import {
  PROMPT_META,
  DEFAULT_SCRAPER_PRICE_PROMPT,
  getAllPromptOverrides,
  invalidatePromptsCache,
  type PromptKey,
} from '@/lib/prompts';
import { TAXONOMY_META, normalizeList, type TaxonomyKey } from '@/lib/taxonomies';
import { getStorageConfig, invalidateStorageConfig, type StorageBackend } from '@/lib/storageConfig';
import { pushBatchToRemote, testRemote, type RemoteFile } from '@/lib/remoteStorage';
import { renderStoragePath, DEFAULT_FOLDER_TEMPLATE, DEFAULT_NAME_TEMPLATE } from '@/lib/storagePath';
import { readFile, deleteFile } from '@/lib/storage';
import { Types } from 'mongoose';
import { getStores, invalidateStoreCache, type StoreLite } from '@/lib/storeService';
import { anthropicTest } from '@/lib/anthropic';
import { getAppSettings, invalidateAppSettings } from '@/lib/appSettings';
import { getUnifiSnapshot, invalidateUnifiConfig, runUnifiSpeedtest } from '@/lib/unifi';
import { startDeviceCode, pollDeviceToken, getOnedriveCreds, disconnectOnedrive, testOnedrive, uploadToOnedrive, type DeviceCode } from '@/lib/onedrive';
import { sendNtfyTo } from '@/lib/notify';
import { computeInstallmentPlans } from '@/lib/installments';
import type { SerializedStatement } from '@/types';
import { revalidatePath } from 'next/cache';

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
  const n = name.trim();
  if (!n) return { ok: false, error: 'No model name' };
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
    openaiModel: String(formData.get('openaiModel') || '').trim(),
    geminiModel: String(formData.get('geminiModel') || '').trim(),
    openrouterModel: String(formData.get('openrouterModel') || '').trim(),
    customBaseUrl: String(formData.get('customBaseUrl') || '').trim().replace(/\/$/, ''),
    customModel: String(formData.get('customModel') || '').trim(),
  };
  // Keys: only overwrite when a new one is typed (blank = keep the existing one).
  for (const k of ['anthropicApiKey', 'openaiApiKey', 'geminiApiKey', 'openrouterApiKey', 'customApiKey'] as const) {
    const v = String(formData.get(k) || '').trim();
    if (v) update[k] = v;
  }

  await AppConfig.updateOne({ key: 'singleton' }, { $set: update }, { upsert: true });
  invalidateAiConfigCache();
  invalidateOllamaHealth(); // model/provider changed → re-probe on next render
  revalidatePath('/settings');
  return { ok: true };
}

// ─── Defaults & alerts + Notifications ───────────────────────────────────────

export async function saveDefaults(formData: FormData): Promise<{ ok: boolean }> {
  await connectDB();
  const view = String(formData.get('defaultItemView') || 'grid') === 'list' ? 'list' : 'grid';
  const warrantyMonths = Math.max(0, Math.min(120, Number(formData.get('defaultWarrantyMonths')) || 24));
  const alertDays = Math.max(0, Math.min(730, Number(formData.get('warrantyAlertDays')) || 90));
  const autoAdd = formData.get('autoAddStores') === 'true';
  const currency = (String(formData.get('currency') || 'EUR').trim().toUpperCase()) || 'EUR';
  const vatRate = Math.max(0, Math.min(100, Number(formData.get('defaultVatRate')) || 24));
  await AppConfig.updateOne(
    { key: 'singleton' },
    {
      $set: {
        defaultItemView: view,
        defaultWarrantyMonths: warrantyMonths,
        warrantyAlertDays: alertDays,
        autoAddStores: autoAdd,
        currency,
        defaultVatRate: vatRate,
      },
    },
    { upsert: true }
  );
  invalidateAppSettings();
  revalidatePath('/', 'layout'); // currency symbol shows app-wide
  return { ok: true };
}

export async function saveNtfy(formData: FormData): Promise<{ ok: boolean }> {
  await connectDB();
  const url = String(formData.get('ntfyUrl') || '').trim();
  const enabled = formData.get('ntfyEnabled') === 'true';
  await AppConfig.updateOne({ key: 'singleton' }, { $set: { ntfyUrl: url, ntfyEnabled: enabled } }, { upsert: true });
  invalidateAppSettings();
  revalidatePath('/settings');
  return { ok: true };
}

/** Send a one-off test notification to the configured ntfy topic. */
export async function sendTestNtfy(): Promise<{ ok: boolean; error?: string }> {
  const s = await getAppSettings();
  if (!s.ntfyUrl) return { ok: false, error: 'Set an ntfy URL first' };
  const ok = await sendNtfyTo(s.ntfyUrl, 'Pharos test', 'Notifications are working — alerts will arrive here.', { tags: ['white_check_mark'] });
  return ok ? { ok: true } : { ok: false, error: 'ntfy POST failed — check the URL' };
}

/** Scan for deals, δόσεις due this month, and expiring warranties; ntfy a summary. */
export async function runAlertChecks(): Promise<{ ok: boolean; sent: boolean; summary: string }> {
  const s = await getAppSettings();
  await connectDB();
  const now = Date.now();

  const dealItems = (await Item.find({ targetPrice: { $gt: 0 } }).select('title targetPrice currentPrice links').lean()) as Array<{
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

  const warrantyItems = (await Item.find({ warrantyUntil: { $ne: null } }).select('title warrantyUntil').lean()) as Array<{
    title: string;
    warrantyUntil?: string | Date | null;
  }>;
  const expiring = warrantyItems
    .map((i) => ({ title: i.title, days: Math.ceil((new Date(i.warrantyUntil as string).getTime() - now) / 86400000) }))
    .filter((w) => !isNaN(w.days) && w.days >= 0 && w.days <= s.warrantyAlertDays)
    .sort((a, b) => a.days - b.days);

  const statements = await Statement.find().lean();
  const plans = computeInstallmentPlans(JSON.parse(JSON.stringify(statements)) as SerializedStatement[]).filter(
    (p) => !p.done && p.remainingInstallments >= 1
  );
  const dueThisMonth = plans.reduce((sum, p) => sum + p.perAmount, 0);

  const lines: string[] = [];
  if (deals.length) lines.push(`🎯 ${deals.length} deal(s): ${deals.slice(0, 5).map((d) => d.title).join(', ')}`);
  if (dueThisMonth > 0) lines.push(`💳 installments this month: ${cur()}${dueThisMonth.toFixed(0)} (${plans.length} plans)`);
  if (expiring.length)
    lines.push(`🛡 ${expiring.length} warranty expiring ≤${s.warrantyAlertDays}d: ${expiring.slice(0, 5).map((w) => `${w.title} (${w.days}d)`).join(', ')}`);

  // Network: offline UniFi devices / WAN trouble (only when the integration is on).
  const net = await getUnifiSnapshot();
  if (net.ok) {
    const offline = net.devices.filter((d) => !d.online);
    if (offline.length) lines.push(`📡 ${offline.length} network device(s) OFFLINE: ${offline.map((d) => d.name).join(', ')}`);
    if (net.wan.status !== 'ok') lines.push(`🌐 WAN status: ${net.wan.status}`);
  } else if (net.error && net.error !== 'not-configured') {
    lines.push(`📡 UniFi unreachable: ${net.error.slice(0, 80)}`);
  }

  const summary = lines.length ? lines.join('\n') : 'All clear — nothing to report.';
  let sent = false;
  if (lines.length && s.ntfyEnabled && s.ntfyUrl) {
    sent = await sendNtfyTo(s.ntfyUrl, 'Pharos alerts', summary, { tags: ['bell'] });
  }
  return { ok: true, sent, summary };
}

/** Toggle the bulk-AI cost guard (confirm before a paid bulk job). */
export async function setAiConfirmBulk(value: boolean): Promise<{ ok: boolean }> {
  await connectDB();
  await AppConfig.updateOne({ key: 'singleton' }, { $set: { aiConfirmBulk: value } }, { upsert: true });
  revalidatePath('/settings');
  return { ok: true };
}

/** Verify the saved Anthropic key + model with a tiny ping. */
export async function testAnthropic(): Promise<{ ok: boolean; error?: string }> {
  await connectDB();
  const doc = await AppConfig.findOne({ key: 'singleton' }).lean();
  const key = doc?.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '';
  const model = doc?.anthropicModel || 'claude-sonnet-4-5-20250929';
  if (!key) return { ok: false, error: 'No API key saved yet' };
  return anthropicTest(key, model);
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
  const k = key as PromptKey;
  if (!PROMPT_META.some((m) => m.key === k)) return { ok: false };
  await connectDB();
  const trimmed = (text ?? '').trim();
  const path = `prompts.${k}`;
  if (!trimmed || trimmed === PROMPT_DEFAULTS[k].trim()) {
    // Store nothing → future improvements to the default keep flowing through.
    await AppConfig.updateOne({ key: 'singleton' }, { $unset: { [path]: '' } }, { upsert: true });
  } else {
    await AppConfig.updateOne({ key: 'singleton' }, { $set: { [path]: trimmed } }, { upsert: true });
  }
  invalidatePromptsCache();
  revalidatePath('/settings');
  return { ok: true };
}

/** Drop a prompt's override → back to the built-in default. */
export async function resetPrompt(key: string): Promise<{ ok: boolean }> {
  const k = key as PromptKey;
  if (!PROMPT_META.some((m) => m.key === k)) return { ok: false };
  await connectDB();
  await AppConfig.updateOne({ key: 'singleton' }, { $unset: { [`prompts.${k}`]: '' } }, { upsert: true });
  invalidatePromptsCache();
  revalidatePath('/settings');
  return { ok: true };
}

// ─── Scraper AI (separate provider/model from the main app) ───────────────────

export type ScraperAiConfig = { provider: 'ollama' | 'anthropic'; model: string };

export async function getScraperAi(): Promise<ScraperAiConfig> {
  await connectDB();
  const doc = await AppConfig.findOne({ key: 'singleton' }).select('scraperProvider scraperModel').lean();
  return {
    provider: doc?.scraperProvider === 'anthropic' ? 'anthropic' : 'ollama',
    model: doc?.scraperModel || '',
  };
}

export async function saveScraperAi(formData: FormData): Promise<{ ok: boolean }> {
  await connectDB();
  const provider = String(formData.get('scraperProvider') || 'ollama') === 'anthropic' ? 'anthropic' : 'ollama';
  const model = String(formData.get('scraperModel') || '').trim();
  await AppConfig.updateOne(
    { key: 'singleton' },
    { $set: { scraperProvider: provider, scraperModel: model } },
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
};

/** Storage config for the Settings editor — never includes the password. */
export async function getStorageInfo(): Promise<StorageInfo> {
  const s = await getStorageConfig();
  const creds = await getOnedriveCreds();
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
  };
}

export async function saveStorageConfig(formData: FormData): Promise<{ ok: boolean }> {
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
  await AppConfig.updateOne({ key: 'singleton' }, { $set: update }, { upsert: true });
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

  const receipts = (await Receipt.find({ archived: { $ne: true }, filePath: { $nin: ['', null] } }).select('store date total filePath').lean()) as Array<Record<string, unknown>>;
  for (const r of receipts) out.push({ filePath: String(r.filePath), rel: rel('receipts', String(r.store || ''), r.date as string, Number(r.total || 0), r._id, String(r.filePath)) });

  const statements = (await Statement.find({ filePath: { $nin: ['', null] } }).select('card period totalAmount statementDate filePath').lean()) as Array<Record<string, unknown>>;
  for (const st of statements) out.push({ filePath: String(st.filePath), rel: rel('statements', String(st.card || ''), (st.statementDate as string) || `${st.period || ''}-01`, Number(st.totalAmount || 0), st._id, String(st.filePath)) });

  const exps = (await Expense.find({ filePath: { $nin: ['', null] } }).select('kind vendor amount date filePath').lean()) as Array<Record<string, unknown>>;
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

/** Upload one chunk (the client loops over chunks to show progress). */
export async function syncOnedriveBatch(items: { filePath: string; rel: string }[]): Promise<{ pushed: number; failed: number; errors: string[] }> {
  let pushed = 0;
  const errors: string[] = [];
  for (const it of items) {
    try {
      const data = await readFile(it.filePath);
      const r = await uploadToOnedrive(it.rel, data);
      if (r.ok) pushed++;
      else if (errors.length < 5) errors.push(`${it.rel}: ${r.error}`);
    } catch (err) {
      if (errors.length < 5) errors.push(`${it.rel}: ${(err as Error).message}`);
    }
  }
  return { pushed, failed: items.length - pushed, errors };
}

/** One-shot sync (used for SMB/FTP — single connection. OneDrive uses the batched
 *  path above so the UI can show progress and survive throttling). */
export async function syncToRemote(): Promise<SyncResult> {
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
  return { ok: res.failed === 0, pushed: res.pushed, failed: res.failed, skipped, errors: res.errors };
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
  const meta = TAXONOMY_META.find((m) => m.key === key);
  if (!meta) return { ok: false };
  await connectDB();
  const cleaned = normalizeList(Array.isArray(values) ? values : []);
  const path = `lists.${key}`;
  const isDefault = cleaned.length === meta.default.length && cleaned.every((v, i) => v === meta.default[i]);
  if (cleaned.length <= 1 || isDefault) {
    await AppConfig.updateOne({ key: 'singleton' }, { $unset: { [path]: '' } }, { upsert: true });
  } else {
    await AppConfig.updateOne({ key: 'singleton' }, { $set: { [path]: cleaned } }, { upsert: true });
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
  const id = String(formData.get('id') || '');
  const name = String(formData.get('name') || '').trim();
  const url = String(formData.get('url') || '').trim();
  const aliases = String(formData.get('aliases') || '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  if (!name) return { ok: false, error: 'Name is required' };

  await connectDB();
  try {
    if (id) {
      await Store.findByIdAndUpdate(id, { $set: { name, url, aliases, auto: false } });
    } else {
      await Store.create({ name, url, aliases: aliases.length ? aliases : [name.toLowerCase()], auto: false });
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
  await connectDB();
  await Store.findByIdAndDelete(id);
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
    Receipt.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$store', n: { $sum: 1 } } }]),
    Item.aggregate([{ $match: { purchasedFrom: { $nin: ['', null] }, deletedAt: null } }, { $group: { _id: '$purchasedFrom', n: { $sum: 1 } } }]),
    Store.find().select('name').lean(),
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
  const canon = (canonical || '').trim();
  if (!canon) return { ok: false, updated: 0, error: 'No canonical name' };
  const drops = variants.filter((v) => v && v !== canon);
  if (drops.length === 0) return { ok: false, updated: 0, error: 'Nothing to merge' };
  await connectDB();

  let updated = 0;
  for (const v of drops) {
    const r = await Receipt.updateMany({ store: v }, { $set: { store: canon } });
    const it = await Item.updateMany({ purchasedFrom: v }, { $set: { purchasedFrom: canon } });
    updated += (r.modifiedCount ?? 0) + (it.modifiedCount ?? 0);
  }

  // Consolidate the store list: fold variant names into the canonical doc as aliases,
  // delete the variant docs.
  const aliasSet = new Set(drops.map((d) => d.toLowerCase()).filter(Boolean));
  const canonDoc = await Store.findOne({ name: canon });
  if (canonDoc) {
    const merged = new Set([...(canonDoc.aliases ?? []), ...aliasSet, canon.toLowerCase()]);
    canonDoc.aliases = [...merged];
    canonDoc.auto = false;
    await canonDoc.save();
  } else {
    await Store.create({ name: canon, aliases: [...aliasSet, canon.toLowerCase()], auto: false });
  }
  await Store.deleteMany({ name: { $in: drops } });

  invalidateStoreCache();
  revalidatePath('/settings');
  revalidatePath('/receipts');
  revalidatePath('/items');
  return { ok: true, updated };
}

// ─── Backup / restore (JSON of all metadata; binary files live on disk) ───────

const BACKUP_MODELS = {
  items: Item,
  receipts: Receipt,
  statements: Statement,
  subscriptions: Subscription,
  vouchers: Voucher,
  cards: Card,
  tasks: Task,
  stores: Store,
} as const;

/** Export every collection's documents as a single JSON string (for download). */
export async function exportData(): Promise<string> {
  await connectDB();
  const entries = await Promise.all(
    Object.entries(BACKUP_MODELS).map(async ([key, Model]) => [key, await (Model as typeof Item).find().lean()] as const)
  );
  const collections: Record<string, unknown[]> = {};
  for (const [key, docs] of entries) collections[key] = docs as unknown[];
  return JSON.stringify({ app: 'homepage', version: 1, exportedAt: new Date().toISOString(), collections });
}

/** Build a CSV string (quote fields containing commas/quotes/newlines). */
function toCSV(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');
}
const isoDay = (d: unknown) => (d ? new Date(d as string).toISOString().slice(0, 10) : '');

/** Export a collection as CSV (for a spreadsheet / accountant / tax). */
export async function exportCSV(kind: 'receipts' | 'expenses' | 'items'): Promise<string> {
  await connectDB();
  if (kind === 'receipts') {
    const rows = (await Receipt.find().select('store date total netAmount vatAmount paymentMethod verified').sort({ date: -1 }).lean()) as Record<string, unknown>[];
    return toCSV(
      ['Store', 'Date', 'Total', 'Net', 'VAT', 'Payment', 'Verified'],
      rows.map((r) => [String(r.store ?? ''), isoDay(r.date), Number(r.total ?? 0), Number(r.netAmount ?? 0), Number(r.vatAmount ?? 0), String(r.paymentMethod ?? ''), r.verified ? 'yes' : 'no'])
    );
  }
  if (kind === 'expenses') {
    const rows = (await Expense.find().select('kind vendor category amount date period recurring verified').sort({ date: -1 }).lean()) as Record<string, unknown>[];
    return toCSV(
      ['Kind', 'Vendor', 'Category', 'Amount', 'Date', 'Period', 'Recurring', 'Verified'],
      rows.map((r) => [String(r.kind ?? ''), String(r.vendor ?? ''), String(r.category ?? ''), Number(r.amount ?? 0), isoDay(r.date), String(r.period ?? ''), r.recurring ? 'yes' : 'no', r.verified ? 'yes' : 'no'])
    );
  }
  const rows = (await Item.find().select('title category status currentPrice purchasedPrice purchasedFrom serialNumber location warrantyUntil').sort({ title: 1 }).lean()) as Record<string, unknown>[];
  return toCSV(
    ['Title', 'Category', 'Status', 'Current price', 'Paid', 'Bought from', 'Serial', 'Location', 'Warranty until'],
    rows.map((r) => [String(r.title ?? ''), String(r.category ?? ''), String(r.status ?? ''), Number(r.currentPrice ?? 0), r.purchasedPrice == null ? '' : Number(r.purchasedPrice), String(r.purchasedFrom ?? ''), String(r.serialNumber ?? ''), String(r.location ?? ''), isoDay(r.warrantyUntil)])
  );
}

/** Save monthly budgets (expense category → € amount). Empty/0 values are dropped. */
export async function saveBudgets(budgets: Record<string, number>): Promise<{ ok: boolean }> {
  await connectDB();
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(budgets || {})) {
    const n = Number(v);
    if (k && Number.isFinite(n) && n > 0) clean[k.trim()] = Math.round(n * 100) / 100;
  }
  await AppConfig.updateOne({ key: 'singleton' }, { $set: { budgets: clean } }, { upsert: true });
  invalidateAppSettings();
  revalidatePath('/reports');
  revalidatePath('/settings');
  return { ok: true };
}

/** Restore from a backup JSON — upserts each document by _id (merges, never duplicates). */
export async function importData(json: string): Promise<{ ok: boolean; restored: number; error?: string }> {
  let data: { collections?: Record<string, unknown[]> };
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, restored: 0, error: 'File is not valid JSON' };
  }
  const cols = data?.collections;
  if (!cols || typeof cols !== 'object') return { ok: false, restored: 0, error: 'Not a homepage backup file' };

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
      try {
        if (_id) await (Model as typeof Item).updateOne({ _id }, { $set: rest }, { upsert: true });
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
  return { ok: true, restored };
}

// ─── Trash (soft-deleted records) ────────────────────────────────────────────
// Deletes everywhere in the app are now SOFT (deletedAt set); this is the one
// place that restores or permanently purges them. Auto-purge after 30 days.

export type TrashRow = { type: TrashType; id: string; title: string; subtitle: string; deletedAt: string };
export type TrashType = 'item' | 'receipt' | 'expense' | 'subscription' | 'voucher' | 'task';

const TRASH_MODELS: Record<TrashType, typeof Item> = {
  item: Item,
  receipt: Receipt as unknown as typeof Item,
  expense: Expense as unknown as typeof Item,
  subscription: Subscription as unknown as typeof Item,
  voucher: Voucher as unknown as typeof Item,
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
    case 'task': return { title: String(d.title || '—'), subtitle: String(d.status || '') };
  }
}

/** List everything in the Trash (and silently purge entries older than 30 days). */
export async function getTrash(): Promise<TrashRow[]> {
  await connectDB();
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86400000);
  const rows: TrashRow[] = [];
  for (const [type, Model] of Object.entries(TRASH_MODELS) as [TrashType, typeof Item][]) {
    const docs = await Model.find({ deletedAt: { $ne: null } }).setOptions({ withDeleted: true }).lean();
    for (const d of docs as unknown as Record<string, unknown>[]) {
      const deletedAt = new Date(d.deletedAt as string);
      if (deletedAt < cutoff) {
        await purgeFromTrash(type, String(d._id));
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
  const Model = TRASH_MODELS[type];
  if (!Model) return { ok: false };
  await connectDB();
  await Model.updateOne({ _id: id }, { $set: { deletedAt: null } });
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Permanently delete: doc + its binary files + dangling cross-references. */
export async function purgeFromTrash(type: TrashType, id: string): Promise<{ ok: boolean }> {
  const Model = TRASH_MODELS[type];
  if (!Model) return { ok: false };
  await connectDB();
  const doc = (await Model.findById(id).setOptions({ withDeleted: true }).lean()) as Record<string, unknown> | null;
  if (!doc) return { ok: true };
  const oid = new Types.ObjectId(id);

  if (type === 'receipt' || type === 'expense') {
    for (const fp of [doc.filePath, doc.thumbPath]) if (fp) await deleteFile(String(fp)).catch(() => {});
  }
  if (type === 'receipt') {
    await Item.updateMany({ receiptIds: oid }, { $pull: { receiptIds: oid } });
  }
  if (type === 'item') {
    for (const p of (doc.photos as string[] | undefined) ?? []) await deleteFile(p).catch(() => {});
    await Receipt.updateMany({ itemIds: oid }, { $pull: { itemIds: oid } });
    await Receipt.updateMany(
      { 'lineItems.matchedItemId': oid },
      { $set: { 'lineItems.$[el].matchedItemId': null } },
      { arrayFilters: [{ 'el.matchedItemId': oid }] }
    );
    await Statement.updateMany(
      { 'transactions.matchedItemIds': oid },
      { $pull: { 'transactions.$[].matchedItemIds': oid } }
    );
  }
  await Model.deleteOne({ _id: id });
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Empty the whole Trash (permanent). */
export async function emptyTrash(): Promise<{ ok: boolean; purged: number }> {
  await connectDB();
  let purged = 0;
  for (const [type, Model] of Object.entries(TRASH_MODELS) as [TrashType, typeof Item][]) {
    const docs = await Model.find({ deletedAt: { $ne: null } }).setOptions({ withDeleted: true }).select('_id').lean();
    for (const d of docs as unknown as { _id: unknown }[]) {
      await purgeFromTrash(type, String(d._id));
      purged++;
    }
  }
  return { ok: true, purged };
}

// ─── Network (UniFi Controller) ──────────────────────────────────────────────

export type UnifiInfo = { host: string; user: string; hasPass: boolean; enabled: boolean };

export async function getUnifiInfo(): Promise<UnifiInfo> {
  await connectDB();
  const doc = await AppConfig.findOne({ key: 'singleton' }).select('unifiHost unifiUser unifiPass unifiEnabled').lean();
  return {
    host: doc?.unifiHost || '',
    user: doc?.unifiUser || '',
    hasPass: !!doc?.unifiPass,
    enabled: !!doc?.unifiEnabled,
  };
}

export async function saveUnifiConfig(formData: FormData): Promise<{ ok: boolean }> {
  await connectDB();
  const host = String(formData.get('host') || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const user = String(formData.get('user') || '').trim();
  const pass = String(formData.get('pass') || ''); // blank = keep the stored one
  const enabled = formData.get('enabled') === 'true';
  const update: Record<string, unknown> = { unifiHost: host, unifiUser: user, unifiEnabled: enabled };
  if (pass) update.unifiPass = pass;
  await AppConfig.updateOne({ key: 'singleton' }, { $set: update }, { upsert: true });
  invalidateUnifiConfig();
  revalidatePath('/settings');
  revalidatePath('/network');
  return { ok: true };
}

/** Login + read the controller once — proves host/user/pass work. */
export async function testUnifiConnection(): Promise<{ ok: boolean; error?: string; devices?: number; wan?: string }> {
  const snap = await getUnifiSnapshot();
  if (!snap.ok) return { ok: false, error: snap.error === 'not-configured' ? 'Fill in host/user/pass, enable, and Save first' : snap.error };
  return { ok: true, devices: snap.devices.length, wan: snap.wan.status };
}

/** Kick off a WAN speedtest on the gateway (result shows on the next /network load). */
export async function triggerSpeedtest(): Promise<{ ok: boolean; error?: string }> {
  const r = await runUnifiSpeedtest();
  if (r.ok) revalidatePath('/network');
  return r;
}

// ─── OneDrive wizard (Microsoft Graph device-code auth) ──────────────────────

/** Step 1 of the wizard: get a device code for the user to enter at microsoft.com/devicelogin. */
export async function startOnedriveAuth(clientId: string): Promise<DeviceCode> {
  return startDeviceCode(clientId.trim());
}

/** Step 2: poll until the user finishes signing in (returns 'pending' meanwhile). */
export async function pollOnedriveAuth(clientId: string, deviceCode: string): Promise<{ status: 'ok' | 'pending' | 'error'; error?: string; account?: string }> {
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
  await disconnectOnedrive();
  invalidateStorageConfig();
  revalidatePath('/settings');
  return { ok: true };
}

export async function testOnedriveConnection(): Promise<{ ok: boolean; error?: string; drive?: string }> {
  return testOnedrive();
}
