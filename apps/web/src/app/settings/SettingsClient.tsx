'use client';
import { useState, useTransition, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Activity, Sun, Moon, Sparkles, Database, CreditCard, ExternalLink, Server, Cloud, Download, Upload, Loader2, Check, Store as StoreIcon, Pencil, Trash2, Plus, X, Copy, ShieldCheck, SlidersHorizontal, Bell, MessageSquareCode, RotateCcw, ChevronDown, Globe, HardDrive, FolderTree, RefreshCw, Plug, Users, UserPlus, KeyRound, Star, Landmark, TrendingUp, TrendingDown, CalendarPlus, Tags, MapPin, FlaskConical, Webhook, Mail, Bookmark } from 'lucide-react';
import { useTheme, type Theme } from '@/components/ThemeProvider';
import { cur } from '@/lib/money';
import { cn } from '@/components/ui/cn';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { saveAiConfig, pullOllamaModel, testAnthropic, saveStore, deleteStore, setAiConfirmBulk, exportData, importData, verifyBackup, exportCSV, exportInsuranceBundle, exportTaxBundle, saveBudgets, saveBudgetRollover, suggestBudgets, saveAssetAccounts, saveDepreciation, saveCategoryRules, setAiEnabled, setAiFeature, fetchProviderModels } from './actions';
import { applyCategoryRulesToExisting } from '@/app/expenses/actions';
import type { CategoryRule } from '@/lib/categoryRules';
import { AI_FEATURES } from '@/lib/aiFeatures';
import { PROVIDER_RECOMMEND, SCRAPER_RECOMMEND, type FetchedModel } from '@/lib/aiModels';
import { StoreDuplicatesModal } from './StoreDuplicatesModal';
import { YnabImportModal } from './YnabImportModal';
import type { StoreLite } from '@/lib/storeService';
import type { AppSettings } from '@/lib/appSettings';
import { rateForCategory } from '@/lib/depreciation';
import { saveDefaults, runAlertChecks, getNotifierChannels, saveNotifierChannels, testNotifierChannel, getDeliveryLogs, getWebhookSubscriptions, saveWebhookSubscriptions, testWebhookSubscription, savePrompt, resetPrompt, saveScraperAi, saveStorageConfig, testRemoteConnection, syncToRemote, getSyncManifest, syncOnedriveBatch, saveList, saveSpaces, getTrash, restoreFromTrash, purgeFromTrash, emptyTrash, startOnedriveAuth, pollOnedriveAuth, disconnectOnedriveAccount, testOnedriveConnection, saveImapConfigAction, testImapConnectionAction, checkImapInboxNow, type PromptEditorEntry, type ScraperAiConfig, type StorageInfo, type ListEditorEntry, type TrashRow, type ImapInfo } from './actions';
import { NOTIFIER_TYPES, type NotifierConfig, type NotifierType } from '@/lib/notifiers.shared';
import { notifierLogKey, webhookLogKey, type DeliveryLogEntry } from '@/lib/deliveryLog.shared';
import { WEBHOOK_EVENTS, type WebhookSubscription, type WebhookEvent } from '@/lib/webhooks.shared';
import { createCard, updateCard, deleteCard, toggleCardActive } from '@/app/statements/cards';
import {
  listUsers,
  createUser,
  deleteUser,
  setUserRole,
  changeUserPassword,
  changeOwnPassword,
  getSelfMfaStatus,
  beginSelfMfaEnrollment,
  confirmSelfMfaEnrollment,
  disableSelfMfa,
  type UserRow,
} from './users.actions';
import type { MfaStatus } from '@/lib/userMfaStore';
import { mfaCodeReady, mfaPasswordReady, describeMfaError } from '@/components/saas/mfaSettings';
import { QrCode } from '@/components/QrCode';
import { McpManager } from './McpManager';
import { CalendarFeedManager } from './CalendarFeedManager';
import { UpdateChecker } from './UpdateChecker';
import { BookmarkletManager } from './BookmarkletManager';
import { SystemHealthPanel } from './SystemHealthPanel';
import { RecomputePricesButton } from './RecomputePricesButton';
import { getSampleDataStatus, loadSampleData, clearSampleData } from './sampleDataActions';
import { renderStoragePath, TEMPLATE_TOKENS } from '@/lib/storagePath';
import { CURRENCIES } from '@/lib/money';
import type { SerializedCard } from '@/types';
import { useT } from '@/components/LocaleProvider';
import type { TKey } from '@/lib/i18n';

type ProviderId = 'ollama' | 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'custom';

type AiInfo = {
  selectedProvider: ProviderId;
  effectiveProvider: ProviderId;
  ollamaHost: string;
  ollamaModel: string;
  ollamaVisionModel: string;
  anthropicModel: string;
  hasKey: boolean;
  openaiModel: string;
  hasOpenaiKey: boolean;
  geminiModel: string;
  hasGeminiKey: boolean;
  openrouterModel: string;
  hasOpenrouterKey: boolean;
  customBaseUrl: string;
  customModel: string;
  hasCustomKey: boolean;
  confirmBulk: boolean;
  installed: { name: string; sizeGB: number }[];
  enabled: boolean; // AI master switch
  features: Record<string, boolean>; // per-feature overrides (absent = on)
  ready: boolean; // provider-aware readiness
};

type Info = {
  /** Hosted (SAAS_MODE) — hides the surfaces the account area already owns. */
  saas?: boolean;
  counts: { items: number; receipts: number; statements: number; subscriptions: number; cards: number };
  ollamaUp: boolean;
  stores: StoreLite[];
  ai: AiInfo;
  settings: AppSettings;
  prompts: PromptEditorEntry[];
  scraperAi: ScraperAiConfig;
  storage: StorageInfo;
  imap: ImapInfo;
  cardList: SerializedCard[];
  lists: ListEditorEntry[];
};

// Vision-capable local models that fit a Mac mini M4 16GB (receipts/cards need vision).
const MODEL_SUGGESTIONS: { name: string; note: string; vision: boolean }[] = [
  { name: 'qwen2.5vl:7b', note: 'Vision+text · ~6GB · balanced default', vision: true },
  { name: 'qwen2.5vl:3b', note: 'Vision+text · ~3GB · faster/lighter', vision: true },
  { name: 'minicpm-v:8b', note: 'Vision · ~6GB · strong receipt OCR', vision: true },
  { name: 'llava:13b', note: 'Vision · ~8GB · heavier, more accurate', vision: true },
  { name: 'qwen2.5:14b', note: 'Text-only · ~9GB · best local text', vision: false },
];

const CLAUDE_SUGGESTIONS = ['claude-sonnet-4-5-20250929', 'claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'];
const OPENAI_SUGGESTIONS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'];
const GEMINI_SUGGESTIONS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
const OPENROUTER_SUGGESTIONS = ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash-001'];

// Mirror of the server-side vision detection (lib/aiConfig.ts) for inline warnings.
const isVisionName = (name: string) => /vl|vision|llava|minicpm-v|moondream|bakllava|llama3\.2-vision/i.test(name);

type TabId = 'general' | 'money' | 'ai' | 'storage' | 'data' | 'notifications' | 'users' | 'system';

import type { Role } from '@/lib/roles';

type CurrentUser = { id: string; name: string; role: Role };

const TABS: { id: TabId; label: string; icon: React.ReactNode; adminOnly?: boolean; selfHostOnly?: boolean }[] = [
  { id: 'general', label: 'General', icon: <SlidersHorizontal size={15} /> },
  { id: 'money', label: 'Money', icon: <CreditCard size={15} /> },
  { id: 'ai', label: 'AI', icon: <Sparkles size={15} /> },
  { id: 'storage', label: 'Storage & backup', icon: <HardDrive size={15} /> },
  { id: 'data', label: 'Stores & lists', icon: <StoreIcon size={15} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={15} />, adminOnly: true },
  { id: 'users', label: 'Users', icon: <Users size={15} />, adminOnly: true, selfHostOnly: true },
  // P77 — host-level numbers (Mongo latency, volume free space, job queue). Shared
  // infrastructure on the managed SaaS, so self-host + admin only.
  { id: 'system', label: 'System status', icon: <Activity size={15} />, adminOnly: true, selfHostOnly: true },
];

const TAB_KEY: Record<TabId, TKey> = {
  general: 'set.tabGeneral',
  money: 'set.tabMoney',
  ai: 'set.tabAi',
  storage: 'set.tabStorage',
  data: 'set.tabData',
  notifications: 'set.tabNotifications',
  users: 'set.tabUsers',
  system: 'set.tabSystem',
};

export function SettingsClient({ info, currentUser }: { info: Info; currentUser: CurrentUser }) {
  const { theme, setTheme } = useTheme();
  const t = useT();
  const [tab, setTab] = useState<TabId>('general');
  const isAdmin = currentUser.role === 'admin';
  const saas = !!info.saas;
  const visibleTabs = TABS.filter((t) => (!t.adminOnly || isAdmin) && (!t.selfHostOnly || !saas));
  const searchParams = useSearchParams();

  // A ?tab= deep-link (e.g. from the "Set up AI" banner) wins; otherwise restore the
  // last-open tab from localStorage. Read on mount to avoid an SSR mismatch.
  useEffect(() => {
    const fromUrl = searchParams.get('tab');
    if (fromUrl && visibleTabs.some((t) => t.id === fromUrl)) {
      setTab(fromUrl as TabId);
      return;
    }
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('settingsTab') : null;
    if (saved && visibleTabs.some((t) => t.id === saved)) setTab(saved as TabId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function go(id: TabId) {
    setTab(id);
    try {
      window.localStorage.setItem('settingsTab', id);
    } catch {
      /* private mode → ignore */
    }
  }

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 pb-24">
      <div className="mb-5">
        <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
          {t('nav.settings')}
        </h1>
      </div>

      <div className="flex flex-col md:flex-row gap-5">
        {/* Tab navigation — sidebar on desktop, scrollable pills on mobile */}
        <nav className="md:w-52 md:shrink-0">
          <div className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible md:sticky md:top-20 pb-1 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0">
            {visibleTabs.map((tb) => (
              <button
                key={tb.id}
                onClick={() => go(tb.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all shrink-0 md:w-full',
                  tab === tb.id
                    ? 'bg-[color:var(--color-accent)] text-black'
                    : 'bg-[color:var(--color-surface-2)] md:bg-transparent border border-[color:var(--color-border)] md:border-transparent text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:bg-[color:var(--color-surface-2)]'
                )}
              >
                {tb.icon}
                {t(TAB_KEY[tb.id])}
              </button>
            ))}
          </div>
        </nav>

        {/* Active panel */}
        <div className="flex-1 min-w-0 space-y-4">
          {tab === 'general' && (
            <>
              <Section title={t('set.appearance')} icon={<Sun size={15} />}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{t('set.theme')}</div>
                    <div className="text-xs text-[color:var(--color-text-faint)]">{t('set.themeDesc')}</div>
                  </div>
                  <div className="flex gap-1.5">
                    {(['dark', 'light'] as Theme[]).map((th) => (
                      <button
                        key={th}
                        onClick={() => setTheme(th)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                          theme === th
                            ? 'bg-[color:var(--color-accent)] text-black'
                            : 'bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
                        )}
                      >
                        {th === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
                        {th === 'dark' ? t('set.dark') : t('set.light')}
                      </button>
                    ))}
                  </div>
                </div>
              </Section>

              <DefaultsManager settings={info.settings} />

              {/* Password and two-factor belong to the ACCOUNT, not to a workspace. On a hosted
                  deployment /account/settings already owns both, and rendering them here too
                  produced two live copies of the same control on the same screen — with the
                  self-host copy sitting inert next to a working one. Self-hosted (no /account
                  segment at all) keeps them: it is the only place they exist. */}
              {!saas && <SelfPasswordCard />}

              {!saas && <SelfMfaCard />}

              {saas && (
                <Section title={t('set.security')}>
                  <p className="text-xs text-[color:var(--color-text-dim)]">
                    {t('set.securityLivesInAccount')}{' '}
                    <a href="/account/settings" className="text-[color:var(--color-accent)] hover:underline">
                      {t('set.accountSettings')}
                    </a>
                  </p>
                </Section>
              )}

              <Section title={t('set.about')}>
                <UpdateChecker canEdit={isAdmin} />
                {/* The "Host" row used to read "Mac mini M4 · Docker", hardcoded. True on
                    Achilleas's own machine and a lie on every other install, hosted customers
                    included, so it said nothing and said it wrongly. The version above it is
                    real (stamped at build time); this row had no source of truth at all. */}
                <Row label={t('set.privacy')}>
                  <span className="text-[color:var(--color-text-dim)]">
                    {info.ai.effectiveProvider === 'anthropic' ? t('set.privacyHybrid') : t('set.privacyLocal')}
                  </span>
                </Row>
              </Section>
            </>
          )}

          {tab === 'money' && (
            <>
              <BudgetsManager settings={info.settings} />
              <CategoryRulesManager settings={info.settings} />
              <AssetAccountsManager settings={info.settings} />
              <DepreciationManager settings={info.settings} />
              <CardsManager cards={info.cardList} />
            </>
          )}

          {tab === 'ai' && (
            <>
              <AiMasterAndFeatures ai={info.ai} canEdit={isAdmin} />
              <AiSettings ai={info.ai} ollamaUp={info.ollamaUp} />
              <ScraperAiSettings scraperAi={info.scraperAi} installed={info.ai.installed} hasAnthropicKey={info.ai.hasKey} />
              <AiPromptsManager prompts={info.prompts} />
              <Section title={t('set.mobileMcpTitle')} icon={<Plug size={15} />}>
                <McpManager />
              </Section>
              <Section title={t('ics.title')} icon={<CalendarPlus size={15} />}>
                <CalendarFeedManager />
              </Section>
            </>
          )}


          {tab === 'storage' && (
            <>
              <StorageManager storage={info.storage} counts={info.counts} />
              <Section title={t('set.dataSection')} icon={<Database size={15} />}>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <Stat label={t('set.statItems')} value={info.counts.items} />
                  <Stat label={t('set.statReceipts')} value={info.counts.receipts} />
                  <Stat label={t('set.statStatements')} value={info.counts.statements} />
                  <Stat label={t('set.statSubs')} value={info.counts.subscriptions} />
                  <Stat label={t('set.statCards')} value={info.counts.cards} />
                </div>
                <BackupRestore />
                <RecomputePricesButton />
              </Section>
              <MigrationImportManager />
              <ImapImportManager imap={info.imap} />
              <Section title={t('bm.title')} icon={<Bookmark size={15} />}>
                <BookmarkletManager />
              </Section>
              <SampleDataManager />
              <TrashManager />
            </>
          )}

          {tab === 'data' && (
            <>
              <StoresManager stores={info.stores} />
              <ListsManager lists={info.lists} />
              <SpacesManager spaces={info.settings.spaces} />
            </>
          )}

          {tab === 'notifications' && (
            <>
              <NotificationsManager />
              <WebhookManager />
            </>
          )}

          {/* Hosted: workspace membership lives in the account area (Members + invites), so a
              SECOND, unrelated user list inside the product is just a way to get the two out
              of sync. Self-hosted keeps it — it is the only user management there is. */}
          {tab === 'users' && isAdmin && !saas && <UsersManager currentUserId={currentUser.id} />}

          {tab === 'system' && isAdmin && !saas && (
            <Section title={t('sys.title')} icon={<Activity size={15} />}>
              <p className="text-xs text-[color:var(--color-text-faint)] -mt-1 mb-1">{t('sys.desc')}</p>
              <SystemHealthPanel />
            </Section>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── AI master switch + per-feature toggles ─────────────────────────────────

function AiStatusChip({ status }: { status: 'ready' | 'no-provider' | 'disabled' }) {
  const t = useT();
  const map = {
    ready: { label: t('af.ready'), cls: 'text-[color:var(--color-accent)] border-[color:var(--color-accent)]' },
    'no-provider': { label: t('af.noProvider'), cls: 'text-[color:var(--color-gold)] border-[color:var(--color-gold)]' },
    disabled: { label: t('af.statusOff'), cls: 'text-[color:var(--color-text-faint)] border-[color:var(--color-border)]' },
  }[status];
  return (
    <span className={cn('text-[9px] uppercase px-1.5 py-0.5 rounded-full border', map.cls)} style={{ fontFamily: 'var(--font-mono)' }}>
      {map.label}
    </span>
  );
}

const AREA_KEY: Record<string, TKey> = {
  Documents: 'af.areaDocuments',
  'Shopping & items': 'af.areaShopping',
  Assistant: 'af.areaAssistant',
};

function AiMasterAndFeatures({ ai, canEdit }: { ai: AiInfo; canEdit: boolean }) {
  const t = useT();
  const [enabled, setEnabled] = useState(ai.enabled);
  const [features, setFeatures] = useState<Record<string, boolean>>(ai.features);
  const [, startTransition] = useTransition();

  function toggleMaster(v: boolean) {
    setEnabled(v);
    startTransition(() => void setAiEnabled(v));
  }
  function toggleFeature(key: string, v: boolean) {
    setFeatures((f) => ({ ...f, [key]: v }));
    startTransition(() => void setAiFeature(key, v));
  }
  function statusOf(key: string): 'ready' | 'no-provider' | 'disabled' {
    if (!enabled || features[key] === false) return 'disabled';
    return ai.ready ? 'ready' : 'no-provider';
  }

  const areas = [...new Set(AI_FEATURES.map((f) => f.area))];

  return (
    <Section title={t('set.aiFeaturesTitle')} icon={<Sparkles size={15} />}>
      <p className="text-[11px] text-[color:var(--color-text-dim)] -mt-1 mb-1">
        {t('set.aiFeaturesDesc')}
      </p>

      <div className="flex items-center justify-between rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2.5 mb-3">
        <div>
          <div className="text-sm font-medium">{t('set.enableAi')}</div>
          <div className="text-xs text-[color:var(--color-text-faint)]">{t('set.enableAiDesc')}</div>
        </div>
        {canEdit ? (
          <Switch checked={enabled} onChange={toggleMaster} />
        ) : (
          <span className="text-xs text-[color:var(--color-text-faint)]">{enabled ? t('set.on') : t('set.off')}</span>
        )}
      </div>

      <div className={cn('space-y-3', !enabled && 'opacity-50 pointer-events-none')}>
        {areas.map((area) => (
          <div key={area}>
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)] mb-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
              {AREA_KEY[area] ? t(AREA_KEY[area]) : area}
            </div>
            <div className="space-y-1.5">
              {AI_FEATURES.filter((f) => f.area === area).map((f) => (
                <div key={f.key} className="flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium flex items-center gap-2">
                      {t(('af.' + f.key) as TKey)}
                      <AiStatusChip status={statusOf(f.key)} />
                    </div>
                    <div className="text-xs text-[color:var(--color-text-faint)]">{t(('af.' + f.key + 'Desc') as TKey)}</div>
                  </div>
                  {canEdit && <Switch checked={features[f.key] !== false} onChange={(v) => toggleFeature(f.key, v)} />}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {enabled && !ai.ready && (
        <p className="text-[11px] text-[color:var(--color-gold)] mt-3">
          {t('set.noProviderWarn')}
        </p>
      )}
    </Section>
  );
}

// ─── AI engine settings ─────────────────────────────────────────────────────

/** Key + model inputs shared by every cloud provider panel. */
/** Model field with a "Load models" button that pulls the provider's live list
 *  (cost per 1M tokens + a ★ recommended pick). Falls back to suggestion chips. */
function ModelPicker({
  provider, model, onModel, typedKey, hasKey, baseUrl, suggestions, recommend, hint,
}: {
  provider: ProviderId;
  model: string;
  onModel: (v: string) => void;
  typedKey: string;
  hasKey: boolean;
  baseUrl?: string;
  suggestions: string[];
  recommend?: { model: string; reason: string };
  hint?: string;
}) {
  const t = useT();
  const [models, setModels] = useState<FetchedModel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  // OpenRouter lists models without a key; custom needs only a base URL; the rest need a key.
  const canLoad = provider === 'openrouter' || provider === 'custom' || hasKey || !!typedKey.trim();

  async function load() {
    setErr('');
    setLoading(true);
    try {
      const r = await fetchProviderModels(provider, typedKey.trim() || undefined, baseUrl?.trim() || undefined);
      if (r.ok && r.models) setModels(r.models);
      else setErr(r.error || t('set.failedLoadModels'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Field label={t('set.modelField')}>
      <input value={model} onChange={(e) => onModel(e.target.value)} className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <button
          type="button"
          onClick={load}
          disabled={loading || !canLoad}
          className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-accent)] hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} {t('set.loadModels')}
        </button>
        {recommend && (
          <button
            type="button"
            onClick={() => onModel(recommend.model)}
            title={recommend.reason}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-[color:var(--color-surface-2)] border border-[color:var(--color-accent)]/50 text-[color:var(--color-accent)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <Star size={10} /> {recommend.model}
          </button>
        )}
        {!canLoad && <span className="text-[10px] text-[color:var(--color-text-faint)]">{t('set.addKeyToLoad')}</span>}
      </div>
      {recommend && (
        <p className="text-[10px] text-[color:var(--color-text-faint)] mt-1.5">
          {t('set.recommendedLabel')} <span className="text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>{recommend.model}</span> — {recommend.reason}
        </p>
      )}
      {err && <p className="text-[10px] text-[color:var(--color-red)] mt-1.5" style={{ fontFamily: 'var(--font-mono)' }}>{err}</p>}

      {models ? (
        <>
          <div className="mt-2 max-h-60 overflow-auto rounded-lg border border-[color:var(--color-border)] divide-y divide-[color:var(--color-border)]">
            {models.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onModel(m.id)}
                className={cn('w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-[color:var(--color-surface-2)]', model === m.id && 'bg-[color:var(--color-surface-2)]')}
              >
                {m.recommended && <Star size={11} className="text-[color:var(--color-accent)] shrink-0" />}
                <span className="text-[11px] min-w-0 flex-1 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{m.id}</span>
                {m.vision && <span className="text-[9px] px-1 py-0.5 rounded bg-[color:var(--color-surface-3)] text-[color:var(--color-text-faint)] shrink-0">vision</span>}
                <span className="text-[10px] text-[color:var(--color-text-dim)] shrink-0 tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>
                  {m.in == null ? '—' : m.in === 0 && m.out === 0 ? 'free' : `$${m.in}/$${m.out}`}
                </span>
              </button>
            ))}
          </div>
          <p className="text-[9px] text-[color:var(--color-text-faint)] mt-1" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('set.tokenPricing')}
          </p>
        </>
      ) : (
        suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {suggestions.map((m) => (
              <button key={m} type="button" onClick={() => onModel(m)} className="text-[10px] px-2 py-1 rounded-md bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] hover:border-[color:var(--color-accent)] transition-colors" style={{ fontFamily: 'var(--font-mono)' }}>
                {m}
              </button>
            ))}
          </div>
        )
      )}
      {hint && <p className="text-[10px] text-[color:var(--color-text-faint)] mt-1.5" style={{ fontFamily: 'var(--font-mono)' }}>{hint}</p>}
    </Field>
  );
}

function CloudKeyModel({
  provider, hasKey, keyValue, onKey, keyPlaceholder, model, onModel, suggestions, hint, baseUrl,
}: {
  provider: ProviderId;
  hasKey: boolean;
  keyValue: string;
  onKey: (v: string) => void;
  keyPlaceholder: string;
  model: string;
  onModel: (v: string) => void;
  suggestions: string[];
  hint?: string;
  baseUrl?: string;
}) {
  const t = useT();
  return (
    <div className="space-y-3 pt-1">
      <Field label={`${t('set.apiKey')} ${hasKey ? t('set.apiKeySavedSuffix') : ''}`}>
        <input
          type="password"
          value={keyValue}
          onChange={(e) => onKey(e.target.value)}
          placeholder={hasKey ? '••••••••••••  (saved)' : keyPlaceholder}
          autoComplete="new-password" data-1p-ignore data-lpignore="true"
          className={inputClass}
          style={{ fontFamily: 'var(--font-mono)' }}
        />
      </Field>
      <ModelPicker
        provider={provider}
        model={model}
        onModel={onModel}
        typedKey={keyValue}
        hasKey={hasKey}
        baseUrl={baseUrl}
        suggestions={suggestions}
        recommend={PROVIDER_RECOMMEND[provider]}
        hint={hint}
      />
    </div>
  );
}

function AiSettings({ ai, ollamaUp }: { ai: AiInfo; ollamaUp: boolean }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [provider, setProvider] = useState<ProviderId>(ai.selectedProvider);
  const [ollamaHost, setOllamaHost] = useState(ai.ollamaHost);
  const [ollamaModel, setOllamaModel] = useState(ai.ollamaModel);
  const [visionModel, setVisionModel] = useState(ai.ollamaVisionModel);
  const [anthropicModel, setAnthropicModel] = useState(ai.anthropicModel);
  const [apiKey, setApiKey] = useState('');
  const [openaiModel, setOpenaiModel] = useState(ai.openaiModel);
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState(ai.geminiModel);
  const [geminiKey, setGeminiKey] = useState('');
  const [openrouterModel, setOpenrouterModel] = useState(ai.openrouterModel);
  const [openrouterKey, setOpenrouterKey] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState(ai.customBaseUrl);
  const [customModel, setCustomModel] = useState(ai.customModel);
  const [customKey, setCustomKey] = useState('');
  const [pullName, setPullName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [test, setTest] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(ai.confirmBulk);

  function save() {
    const fd = new FormData();
    fd.set('provider', provider);
    fd.set('ollamaHost', ollamaHost.trim());
    fd.set('ollamaModel', ollamaModel.trim());
    fd.set('ollamaVisionModel', visionModel.trim());
    fd.set('anthropicModel', anthropicModel.trim());
    fd.set('openaiModel', openaiModel.trim());
    fd.set('geminiModel', geminiModel.trim());
    fd.set('openrouterModel', openrouterModel.trim());
    fd.set('customBaseUrl', customBaseUrl.trim());
    fd.set('customModel', customModel.trim());
    if (apiKey.trim()) fd.set('anthropicApiKey', apiKey.trim());
    if (openaiKey.trim()) fd.set('openaiApiKey', openaiKey.trim());
    if (geminiKey.trim()) fd.set('geminiApiKey', geminiKey.trim());
    if (openrouterKey.trim()) fd.set('openrouterApiKey', openrouterKey.trim());
    if (customKey.trim()) fd.set('customApiKey', customKey.trim());
    setMsg(null);
    startTransition(async () => {
      // A rejected save used to leave this handler on the floor: no "Saved ✓", no error,
      // nothing at all on screen, which reads as "the button does not work". The most
      // likely rejection is the admin guard (a member-role session in a shared or hosted
      // workspace), and that is worth saying out loud.
      try {
        await saveAiConfig(fd);
      } catch (err) {
        setMsg(`Could not save: ${(err as Error).message || 'unknown error'}`);
        return;
      }
      setApiKey('');
      setOpenaiKey('');
      setGeminiKey('');
      setOpenrouterKey('');
      setCustomKey('');
      setMsg('Saved ✓');
      setTimeout(() => setMsg(null), 2500);
    });
  }

  function doPull(name?: string) {
    const n = (name ?? pullName).trim();
    if (!n) return;
    setMsg(`Downloading ${n}… (this can take a few minutes)`);
    startTransition(async () => {
      const r = await pullOllamaModel(n);
      setMsg(r.ok ? `Downloaded ${n} ✓ — select it as active and Save` : `Download failed: ${r.error}`);
      if (r.ok && !name) setPullName('');
    });
  }

  function doTest() {
    setTest('testing…');
    startTransition(async () => {
      const r = await testAnthropic();
      setTest(r.ok ? 'Connection OK ✓' : `Failed: ${r.error}`);
    });
  }

  const installedNames = ai.installed.map((m) => m.name);

  return (
    <Section title={t('set.aiEngineTitle')} icon={<Sparkles size={15} />}>
      {/* Provider toggle */}
      <Row label={t('set.provider')}>
        <div className="flex gap-1.5 flex-wrap">
          {([
            { v: 'ollama', label: 'Ollama', icon: <Server size={13} /> },
            { v: 'anthropic', label: 'Anthropic', icon: <Cloud size={13} /> },
            { v: 'openai', label: 'OpenAI', icon: <Cloud size={13} /> },
            { v: 'gemini', label: 'Gemini', icon: <Cloud size={13} /> },
            { v: 'openrouter', label: 'OpenRouter', icon: <Cloud size={13} /> },
            { v: 'custom', label: 'Custom', icon: <Plug size={13} /> },
          ] as const).map((p) => (
            <button
              key={p.v}
              onClick={() => setProvider(p.v)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                provider === p.v
                  ? 'bg-[color:var(--color-accent)] text-black'
                  : 'bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
              )}
            >
              {p.icon}
              {p.label}
            </button>
          ))}
        </div>
      </Row>

      {((provider === 'anthropic' && !ai.hasKey) ||
        (provider === 'openai' && !ai.hasOpenaiKey) ||
        (provider === 'gemini' && !ai.hasGeminiKey) ||
        (provider === 'openrouter' && !ai.hasOpenrouterKey)) && (
        <p className="text-[11px] text-[color:var(--color-gold)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {t('set.noKeyFallback')}
        </p>
      )}
      {provider !== 'ollama' && provider !== 'anthropic' && (
        <p className="text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
          {t('set.cmdBarNote')}
        </p>
      )}

      {/* Local (Ollama) panel */}
      {provider === 'ollama' && (
        <div className="space-y-3 pt-1">
          <Row label={t('set.aiStatus')}>
            <span className={ollamaUp ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]'}>
              ● {ollamaUp ? t('set.online') : t('set.offlineModel')}
            </span>
          </Row>

          <Field label={t('set.serverUrl')}>
            <input
              value={ollamaHost}
              onChange={(e) => setOllamaHost(e.target.value)}
              placeholder="http://localhost:11434"
              className={inputClass}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <p className="text-[10px] text-[color:var(--color-text-faint)] mt-1" style={{ fontFamily: 'var(--font-mono)' }}>
              {t('set.serverUrlHint')}
            </p>
          </Field>

          <Field label={t('set.textModel')}>
            {installedNames.length > 0 ? (
              <select value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} className={selectClass}>
                {!installedNames.includes(ollamaModel) && <option value={ollamaModel}>{ollamaModel} {t('set.notInstalled')}</option>}
                {ai.installed.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} · {m.sizeGB}GB
                  </option>
                ))}
              </select>
            ) : (
              <input value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} className={inputClass} />
            )}
          </Field>

          <Field label={t('set.visionModel')}>
            {installedNames.length > 0 ? (
              <select value={visionModel} onChange={(e) => setVisionModel(e.target.value)} className={selectClass}>
                {!installedNames.includes(visionModel) && <option value={visionModel}>{visionModel} {t('set.notInstalled')}</option>}
                {ai.installed.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} · {m.sizeGB}GB{isVisionName(m.name) ? '' : ' · text-only ⚠'}
                  </option>
                ))}
              </select>
            ) : (
              <input value={visionModel} onChange={(e) => setVisionModel(e.target.value)} className={inputClass} />
            )}
            {visionModel && !isVisionName(visionModel) && (
              <p className="text-[10px] text-[color:var(--color-red)] mt-1" style={{ fontFamily: 'var(--font-mono)' }}>
                {t('set.visionWarn')}
              </p>
            )}
          </Field>

          <Field label={t('set.downloadModel')}>
            <div className="flex gap-1.5">
              <input
                value={pullName}
                onChange={(e) => setPullName(e.target.value)}
                placeholder={t('set.modelPlaceholder')}
                className={inputClass}
                style={{ fontFamily: 'var(--font-mono)' }}
              />
              <button
                type="button"
                onClick={() => doPull()}
                disabled={pending || !pullName.trim()}
                className="flex items-center gap-1.5 shrink-0 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-accent)] hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50"
              >
                {pending ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} {t('set.download')}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {MODEL_SUGGESTIONS.map((s) => {
                const have = installedNames.includes(s.name);
                return (
                  <button
                    key={s.name}
                    type="button"
                    title={s.note}
                    onClick={() => (have ? setOllamaModel(s.name) : doPull(s.name))}
                    disabled={pending}
                    className="text-[10px] px-2 py-1 rounded-md bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {have ? '✓ ' : '↓ '}
                    {s.name}
                    {!s.vision && <span className="text-[color:var(--color-text-faint)]"> ·txt</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-[color:var(--color-text-faint)] mt-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
              {t('set.visionModelHint')}
            </p>
          </Field>
        </div>
      )}

      {/* Anthropic panel */}
      {provider === 'anthropic' && (
        <div className="space-y-3 pt-1">
          <Field label={`${t('set.apiKey')} ${ai.hasKey ? t('set.apiKeySavedSuffix') : ''}`}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={ai.hasKey ? '••••••••••••  (saved)' : 'sk-ant-...'}
              autoComplete="new-password" data-1p-ignore data-lpignore="true"
              className={inputClass}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </Field>
          <ModelPicker
            provider="anthropic"
            model={anthropicModel}
            onModel={setAnthropicModel}
            typedKey={apiKey}
            hasKey={ai.hasKey}
            suggestions={CLAUDE_SUGGESTIONS}
            recommend={PROVIDER_RECOMMEND.anthropic}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={doTest}
              disabled={pending}
              className="text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] hover:border-[color:var(--color-cyan)] text-[color:var(--color-cyan)] transition-colors disabled:opacity-50"
            >
              {t('set.testConnection')}
            </button>
            {test && (
              <span
                className={cn('text-[11px]', test.startsWith('Connection OK') ? 'text-[color:var(--color-accent)]' : test === 'testing…' ? 'text-[color:var(--color-text-dim)]' : 'text-[color:var(--color-red)]')}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {test}
              </span>
            )}
          </div>
          <p className="text-[10px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('set.anthropicNote')}
          </p>
        </div>
      )}

      {/* OpenAI panel */}
      {provider === 'openai' && (
        <CloudKeyModel
          provider="openai"
          hasKey={ai.hasOpenaiKey}
          keyValue={openaiKey}
          onKey={setOpenaiKey}
          keyPlaceholder="sk-..."
          model={openaiModel}
          onModel={setOpenaiModel}
          suggestions={OPENAI_SUGGESTIONS}
          hint={t('set.openaiHint')}
        />
      )}

      {/* Gemini panel */}
      {provider === 'gemini' && (
        <CloudKeyModel
          provider="gemini"
          hasKey={ai.hasGeminiKey}
          keyValue={geminiKey}
          onKey={setGeminiKey}
          keyPlaceholder="AIza..."
          model={geminiModel}
          onModel={setGeminiModel}
          suggestions={GEMINI_SUGGESTIONS}
          hint={t('set.geminiHint')}
        />
      )}

      {/* OpenRouter panel */}
      {provider === 'openrouter' && (
        <CloudKeyModel
          provider="openrouter"
          hasKey={ai.hasOpenrouterKey}
          keyValue={openrouterKey}
          onKey={setOpenrouterKey}
          keyPlaceholder="sk-or-..."
          model={openrouterModel}
          onModel={setOpenrouterModel}
          suggestions={OPENROUTER_SUGGESTIONS}
          hint={t('set.openrouterHint')}
        />
      )}

      {/* Custom OpenAI-compatible server panel */}
      {provider === 'custom' && (
        <div className="space-y-3 pt-1">
          <Field label={t('set.baseUrlOpenai')}>
            <input
              value={customBaseUrl}
              onChange={(e) => setCustomBaseUrl(e.target.value)}
              placeholder="http://localhost:1234/v1"
              className={inputClass}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <p className="text-[10px] text-[color:var(--color-text-faint)] mt-1" style={{ fontFamily: 'var(--font-mono)' }}>
              {t('set.baseUrlHint')}
            </p>
          </Field>
          <CloudKeyModel
            provider="custom"
            baseUrl={customBaseUrl}
            hasKey={ai.hasCustomKey}
            keyValue={customKey}
            onKey={setCustomKey}
            keyPlaceholder={t('set.customKeyPlaceholder')}
            model={customModel}
            onModel={setCustomModel}
            suggestions={[]}
            hint={t('set.customHint')}
          />
        </div>
      )}

      {/* Cost guard toggle (saved instantly, independent of the form) */}
      <div className="pt-3 border-t border-[color:var(--color-border)] mt-1">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-[color:var(--color-gold)]" /> {t('set.confirmBulk')}
            </p>
            <p className="text-[10px] text-[color:var(--color-text-faint)] mt-0.5">
              {t('set.confirmBulkDesc')}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={confirmBulk}
            onClick={() => {
              const v = !confirmBulk;
              setConfirmBulk(v);
              startTransition(() => {
                void setAiConfirmBulk(v);
              });
            }}
            className={cn(
              'relative w-10 h-6 rounded-full transition-colors shrink-0',
              confirmBulk ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-surface-3)] border border-[color:var(--color-border)]'
            )}
          >
            <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform', confirmBulk && 'translate-x-4')} />
          </button>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2 border-t border-[color:var(--color-border)] mt-1">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-[color:var(--color-accent)] text-black font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {t('set.saveAi')}
        </button>
        {msg && (
          <span
            className={cn('text-[11px]', msg.includes('failed') || msg.includes('Failed') ? 'text-[color:var(--color-red)]' : 'text-[color:var(--color-accent)]')}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {msg}
          </span>
        )}
      </div>
    </Section>
  );
}

// ─── Scraper AI (separate provider/model) ────────────────────────────────────

function ScraperAiSettings({ scraperAi, installed, hasAnthropicKey }: { scraperAi: ScraperAiConfig; installed: { name: string; sizeGB: number }[]; hasAnthropicKey: boolean }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [provider, setProvider] = useState<'ollama' | 'anthropic'>(scraperAi.provider);
  const [model, setModel] = useState(scraperAi.model);
  const [msg, setMsg] = useState<string | null>(null);
  const installedNames = installed.map((m) => m.name);

  function save() {
    const fd = new FormData();
    fd.set('scraperProvider', provider);
    fd.set('scraperModel', model.trim());
    setMsg(null);
    startTransition(async () => {
      await saveScraperAi(fd);
      setMsg('Saved ✓');
      setTimeout(() => setMsg(null), 2500);
    });
  }

  return (
    <Section title={t('set.scraperAiTitle')} icon={<Globe size={15} />}>
      <p className="text-[11px] text-[color:var(--color-text-dim)] -mt-1 mb-1">
        {t('set.scraperIntro')}
      </p>
      <Row label={t('set.provider')}>
        <div className="flex gap-1.5">
          {([
            { v: 'ollama', label: 'Ollama', icon: <Server size={13} /> },
            { v: 'anthropic', label: 'Anthropic', icon: <Cloud size={13} /> },
          ] as const).map((p) => (
            <button
              key={p.v}
              onClick={() => setProvider(p.v)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                provider === p.v
                  ? 'bg-[color:var(--color-accent)] text-black'
                  : 'bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
              )}
            >
              {p.icon}
              {p.label}
            </button>
          ))}
        </div>
      </Row>

      {provider === 'ollama' ? (
        <Field label={t('set.scraperModel')}>
          {installedNames.length > 0 ? (
            <select value={model} onChange={(e) => setModel(e.target.value)} className={selectClass}>
              <option value="">{t('set.defaultOllamaEnv')}</option>
              {!installedNames.includes(model) && model && <option value={model}>{model} {t('set.notInstalled')}</option>}
              {installed.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name} · {m.sizeGB}GB{isVisionName(m.name) ? '' : ' · text'}
                </option>
              ))}
            </select>
          ) : (
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="qwen2.5:14b" className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
          )}
          <p className="text-[10px] text-[color:var(--color-text-faint)] mt-1" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('set.scraperModelHint')}
          </p>
        </Field>
      ) : (
        <div className="space-y-2">
          <ModelPicker
            provider="anthropic"
            model={model}
            onModel={setModel}
            typedKey=""
            hasKey={hasAnthropicKey}
            suggestions={['claude-3-5-haiku-latest', 'claude-3-haiku-20240307']}
            recommend={SCRAPER_RECOMMEND.anthropic}
          />
          <p className="text-[10px] text-[color:var(--color-gold)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {t('set.scraperAnthropicWarn')}
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-[color:var(--color-border)] mt-1">
        <button type="button" onClick={save} disabled={pending} className={saveBtn}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {t('set.saveScraperAi')}
        </button>
        {msg && (
          <span className="text-[11px] text-[color:var(--color-accent)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {msg}
          </span>
        )}
      </div>
    </Section>
  );
}

// ─── Editable AI prompts ─────────────────────────────────────────────────────

function AiPromptsManager({ prompts }: { prompts: PromptEditorEntry[] }) {
  const t = useT();
  return (
    <Section title={t('set.aiPromptsTitle')} icon={<MessageSquareCode size={15} />}>
      <p className="text-[11px] text-[color:var(--color-text-dim)] -mt-1 mb-1">
        {t('set.promptsDesc')}
      </p>
      <div className="space-y-2">
        {prompts.map((p) => (
          <PromptEditor key={p.key} entry={p} />
        ))}
      </div>
    </Section>
  );
}

function PromptEditor({ entry }: { entry: PromptEditorEntry }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(entry.override || entry.defaultText);
  const [overridden, setOverridden] = useState(!!entry.override);
  const [msg, setMsg] = useState<string | null>(null);
  const confirm = useConfirm();

  function save() {
    setMsg(null);
    startTransition(async () => {
      await savePrompt(entry.key, text);
      setOverridden(!!(text.trim() && text.trim() !== entry.defaultText.trim()));
      setMsg(t('common.savedOk'));
      setTimeout(() => setMsg(null), 2000);
    });
  }

  async function reset() {
    const ok = await confirm({
      title: t('set.resetToDefaultQ'),
      message: t('set.resetPromptConfirm', { label: entry.label }),
      confirmLabel: t('set.resetBtn'),
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      await resetPrompt(entry.key);
      setText(entry.defaultText);
      setOverridden(false);
      setMsg(t('set.resetOk'));
      setTimeout(() => setMsg(null), 2000);
    });
  }

  return (
    <div className="border border-[color:var(--color-border)] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-[color:var(--color-surface-2)] transition-colors text-left"
      >
        <div className="min-w-0">
          <div className="text-sm font-medium flex items-center gap-2">
            {entry.label}
            {overridden && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded bg-[color:var(--color-gold)]/15 text-[color:var(--color-gold)] uppercase tracking-wider"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {t('set.edited')}
              </span>
            )}
          </div>
          <div className="text-[11px] text-[color:var(--color-text-faint)] truncate">{entry.where}</div>
        </div>
        <ChevronDown size={15} className={cn('shrink-0 text-[color:var(--color-text-faint)] transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-2 border-t border-[color:var(--color-border)] space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            spellCheck={false}
            className="w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 text-xs leading-relaxed focus:outline-none focus:border-[color:var(--color-accent)] resize-y"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={save} disabled={pending} className={saveBtn}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {t('common.save')}
            </button>
            <button type="button" onClick={reset} disabled={pending} className={ghostBtn}>
              <RotateCcw size={13} /> {t('set.resetDefault')}
            </button>
            {msg && (
              <span className="text-[11px] text-[color:var(--color-accent)]" style={{ fontFamily: 'var(--font-mono)' }}>
                {msg}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── File storage (PDFs) — local + remote mirror + naming templates ───────────

// OneDrive setup: zero-config by default (built-in public client → just sign in).
// "Use your own Azure app" is an optional advanced path for a branded consent.
function OnedriveWizard({ connected: initialConnected, account }: { connected: boolean; account: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [connected, setConnected] = useState(initialConnected);
  const [acct, setAcct] = useState(account);
  const [advanced, setAdvanced] = useState(false);
  const [clientId, setClientId] = useState('');
  const [code, setCode] = useState<{ userCode: string; url: string; device: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  function connect() {
    setStatus(null);
    startTransition(async () => {
      const r = await startOnedriveAuth(clientId); // empty → built-in client
      if (!r.ok || !r.deviceCode) { setStatus(`✗ ${r.error}`); return; }
      setCode({ userCode: r.userCode!, url: r.verificationUri!, device: r.deviceCode });
      setStatus(t('set.odSignIn'));
      pollRef.current = setInterval(async () => {
        const p = await pollOnedriveAuth(clientId, r.deviceCode!);
        if (p.status === 'ok') {
          if (pollRef.current) clearInterval(pollRef.current);
          setConnected(true); setAcct(p.account || ''); setCode(null); setStatus(t('set.odConnectedOk'));
        } else if (p.status === 'error') {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus(`✗ ${p.error}`); setCode(null);
        }
      }, (r.interval || 5) * 1000);
    });
  }
  function disconnect() {
    startTransition(async () => {
      await disconnectOnedriveAccount();
      setConnected(false); setAcct('');
    });
  }

  if (connected) {
    return (
      <div className="pt-1 flex items-center justify-between gap-3 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2.5">
        <span className="text-xs flex items-center gap-2">
          <Cloud size={14} className="text-[color:var(--color-accent)]" />
          {acct ? t('set.odConnectedAs', { acct }) : t('set.odConnected')} <code className="text-[color:var(--color-cyan)]">/Apps/Pharos</code>
        </span>
        <button onClick={disconnect} disabled={pending} className="text-[11px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] disabled:opacity-50">{t('set.disconnect')}</button>
      </div>
    );
  }

  return (
    <div className="pt-1 space-y-3">
      {!code ? (
        <>
          <p className="text-[11px] text-[color:var(--color-text-dim)]">
            {t('set.odNoSetup')}
          </p>
          <button onClick={connect} disabled={pending} className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-[color:var(--color-accent)] text-black font-semibold hover:opacity-90 disabled:opacity-50">
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Cloud size={13} />} {t('set.connectOnedrive')}
          </button>

          <div>
            <button onClick={() => setAdvanced((s) => !s)} className="text-[10px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-cyan)]">
              {advanced ? '▾' : '▸'} {t('set.useOwnAzure')}
            </button>
            {advanced && (
              <div className="mt-2 space-y-2">
                <ol className="text-[10px] text-[color:var(--color-text-faint)] space-y-0.5 list-decimal pl-4 leading-relaxed">
                  <li><a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noreferrer" className="text-[color:var(--color-cyan)] hover:underline">Azure → App registrations</a> → New registration → personal accounts, no redirect URI.</li>
                  <li>Authentication → Allow public client flows → Yes → Save. Copy the client id.</li>
                </ol>
                <Field label={t('set.appClientId')}>
                  <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
                </Field>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="bg-[color:var(--color-surface-2)] border border-[color:var(--color-cyan)]/40 rounded-lg px-3 py-3 text-xs space-y-1.5">
          <p>1. {t('set.odStep1')} <a href={code.url} target="_blank" rel="noreferrer" className="text-[color:var(--color-cyan)] hover:underline font-semibold">{code.url}</a></p>
          <p>2. {t('set.odStep2')} <span className="text-[color:var(--color-accent)] font-bold text-base tracking-widest" style={{ fontFamily: 'var(--font-mono)' }}>{code.userCode}</span></p>
          <p className="text-[10px] text-[color:var(--color-text-faint)] flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> {t('set.odWaiting')}</p>
        </div>
      )}
      {status && <p className={cn('text-[11px]', status.startsWith('✗') ? 'text-[color:var(--color-red)]' : 'text-[color:var(--color-accent)]')} style={{ fontFamily: 'var(--font-mono)' }}>{status}</p>}
    </div>
  );
}

function StorageManager({ storage, counts }: { storage: StorageInfo; counts: Info['counts'] }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [backend, setBackend] = useState<StorageInfo['backend']>(storage.backend);
  const [mirror, setMirror] = useState(storage.mirror);
  const [folderTpl, setFolderTpl] = useState(storage.folderTemplate);
  const [nameTpl, setNameTpl] = useState(storage.fileNameTemplate);
  const [host, setHost] = useState(storage.remoteHost);
  const [port, setPort] = useState(storage.remotePort ? String(storage.remotePort) : '');
  const [user, setUser] = useState(storage.remoteUser);
  const [pass, setPass] = useState('');
  const [share, setShare] = useState(storage.remoteShare);
  const [basePath, setBasePath] = useState(storage.remoteBasePath);
  const [secure, setSecure] = useState(storage.remoteSecure);
  const [msg, setMsg] = useState<string | null>(null);
  const [test, setTest] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  // The panel is server-rendered, so a sync that just succeeded would still show the
  // OLD "last synced" date until a reload. Flip it locally instead of forcing a refetch.
  const [syncedNow, setSyncedNow] = useState(false);

  const preview = (() => {
    try {
      return renderStoragePath(folderTpl, nameTpl, {
        kind: 'receipts',
        store: 'Amazon',
        date: '2026-06-04',
        total: 129.98,
        id: 'a1b2c3',
        original: 'receipt',
        ext: 'pdf',
      });
    } catch {
      return '—';
    }
  })();

  function save() {
    const fd = new FormData();
    fd.set('storageBackend', backend);
    fd.set('storageMirror', String(mirror));
    fd.set('folderTemplate', folderTpl);
    fd.set('fileNameTemplate', nameTpl);
    fd.set('remoteHost', host.trim());
    fd.set('remotePort', port.trim());
    fd.set('remoteUser', user.trim());
    if (pass) fd.set('remotePass', pass);
    fd.set('remoteShare', share.trim());
    fd.set('remoteBasePath', basePath.trim());
    fd.set('remoteSecure', String(secure));
    setMsg(null);
    setTest(null);
    startTransition(async () => {
      await saveStorageConfig(fd);
      setPass('');
      setMsg('Saved ✓');
      setTimeout(() => setMsg(null), 2500);
    });
  }

  function doTest() {
    setTest('testing…');
    startTransition(async () => {
      const r = backend === 'onedrive' ? await testOnedriveConnection() : await testRemoteConnection();
      setTest(r.ok ? 'Connection OK ✓' : `Failed: ${r.error}`);
    });
  }

  async function doSync() {
    setTest(null);
    // OneDrive: upload in chunks so the UI shows live progress and survives Graph
    // throttling (a one-shot upload of hundreds of files silently dropped some).
    if (backend === 'onedrive') {
      setSyncing(true);
      setMsg('Preparing…');
      const man = await getSyncManifest();
      if (!man.ok) { setMsg(`✗ ${man.error}`); setSyncing(false); return; }
      const items = man.items;
      const total = items.length;
      if (!total) { setMsg('Nothing to sync.'); setSyncing(false); return; }
      let pushed = 0, failed = 0, skipped = 0;
      const errs: string[] = [];
      const CHUNK = 8;
      for (let i = 0; i < total; i += CHUNK) {
        const r = await syncOnedriveBatch(items.slice(i, i + CHUNK));
        pushed += r.pushed;
        failed += r.failed;
        skipped += r.skipped;
        if (errs.length < 3) errs.push(...r.errors.slice(0, 3 - errs.length));
        setMsg(`Syncing ${Math.min(i + CHUNK, total)}/${total}… (${pushed} ok${failed ? `, ${failed} failed` : ''})`);
      }
      setMsg(`Synced ${pushed}/${total} ✓${skipped ? ` · ${skipped} skipped (missing locally)` : ''}${failed ? ` · ${failed} failed${errs[0] ? ` — ${errs[0]}` : ''}` : ''}`);
      if (pushed > 0) setSyncedNow(true); // matches the server rule: only a real push counts
      setSyncing(false);
      return;
    }
    // SMB/FTP: single connection, one-shot.
    setMsg('Syncing… (this can take a while)');
    startTransition(async () => {
      const r = await syncToRemote();
      if (r.pushed > 0) setSyncedNow(true);
      if (r.ok) setMsg(`Synced ${r.pushed} file(s)${r.skipped ? ` · ${r.skipped} skipped` : ''} ✓`);
      else setMsg(`Synced ${r.pushed}, ${r.failed} failed${r.error ? `: ${r.error}` : ''}${r.errors[0] ? ` — ${r.errors[0]}` : ''}`);
    });
  }

  return (
    <Section title={t('set.fileStorageTitle')} icon={<HardDrive size={15} />}>
      <p className="text-[11px] text-[color:var(--color-text-dim)] -mt-1 mb-1">
        {t('set.fileStorageDesc')}
      </p>

      <Row label={t('set.backend')}>
        <div className="flex gap-1.5 flex-wrap">
          {([
            { v: 'local', label: t('set.localOnly'), icon: <HardDrive size={13} /> },
            { v: 'smb', label: t('set.smbNas'), icon: <Server size={13} /> },
            { v: 'ftp', label: 'FTP', icon: <Globe size={13} /> },
            { v: 'onedrive', label: 'OneDrive', icon: <Cloud size={13} /> },
          ] as const).map((b) => (
            <button
              key={b.v}
              onClick={() => setBackend(b.v)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                backend === b.v
                  ? 'bg-[color:var(--color-accent)] text-black'
                  : 'bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]'
              )}
            >
              {b.icon}
              {b.label}
            </button>
          ))}
        </div>
      </Row>

      {backend === 'onedrive' && <OnedriveWizard connected={storage.onedriveConnected} account={storage.onedriveAccount} />}

      {(backend === 'smb' || backend === 'ftp') && (
        <div className="grid sm:grid-cols-2 gap-3 pt-1">
          <Field label={t('set.hostIp')}>
            <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.10.20" className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
          </Field>
          <Field label={t('set.portBlank', { default: backend === 'smb' ? '445' : '21' })}>
            <input value={port} onChange={(e) => setPort(e.target.value)} placeholder={backend === 'smb' ? '445' : '21'} className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
          </Field>
          {backend === 'smb' && (
            <Field label={t('set.shareName')}>
              <input value={share} onChange={(e) => setShare(e.target.value)} placeholder="home" className={inputClass} />
            </Field>
          )}
          <Field label={t('set.username')}>
            <input value={user} onChange={(e) => setUser(e.target.value)} className={inputClass} autoComplete="new-password" data-1p-ignore data-lpignore="true" />
          </Field>
          <Field label={storage.hasPass ? t('set.passwordSaved') : t('set.password')}>
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={storage.hasPass ? '••••••••' : ''} className={inputClass} autoComplete="new-password" data-1p-ignore data-lpignore="true" />
          </Field>
          <Field label={t('set.baseFolder')}>
            <input value={basePath} onChange={(e) => setBasePath(e.target.value)} placeholder="Pharos" className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
          </Field>
          {backend === 'ftp' && (
            <div className="flex items-center justify-between sm:col-span-2">
              <span className="text-xs text-[color:var(--color-text-dim)]">{t('set.ftpsTls')}</span>
              <Switch checked={secure} onChange={setSecure} />
            </div>
          )}
        </div>
      )}

      <div className="pt-2 border-t border-[color:var(--color-border)] mt-1 space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)' }}>
          <FolderTree size={12} /> {t('set.fileOrganization')}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={t('set.folderTemplate')}>
            <input value={folderTpl} onChange={(e) => setFolderTpl(e.target.value)} className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
          </Field>
          <Field label={t('set.filenameTemplate')}>
            <input value={nameTpl} onChange={(e) => setNameTpl(e.target.value)} className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
          </Field>
        </div>
        <div className="text-[10px] text-[color:var(--color-text-faint)] leading-relaxed" style={{ fontFamily: 'var(--font-mono)' }}>
          {t('set.tokens')} {TEMPLATE_TOKENS.map((tok) => tok.token).join('  ')}
        </div>
        <div className="text-[11px] bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2" style={{ fontFamily: 'var(--font-mono)' }}>
          <span className="text-[color:var(--color-text-faint)]">{t('set.preview')} </span>
          <span className="text-[color:var(--color-cyan)] break-all">{preview}</span>
        </div>
      </div>

      {backend !== 'local' && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="min-w-0">
            <p className="text-xs font-medium">{t('set.autoMirror')}</p>
            <p className="text-[10px] text-[color:var(--color-text-faint)] mt-0.5">{t('set.autoMirrorDesc')}</p>
          </div>
          <Switch checked={mirror} onChange={setMirror} />
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-[color:var(--color-border)] mt-1">
        <button type="button" onClick={save} disabled={pending} className={saveBtn}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {t('common.save')}
        </button>
        {backend !== 'local' && (
          <button type="button" onClick={doTest} disabled={pending} className={ghostBtn}>
            <Plug size={13} /> {t('set.testConnection')}
          </button>
        )}
        {backend !== 'local' && (
          <button type="button" onClick={doSync} disabled={pending || syncing} className={ghostBtn}>
            {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} {t('set.syncNow')}
          </button>
        )}
        {test && (
          <span
            className={cn('text-[11px]', test.startsWith('Connection OK') ? 'text-[color:var(--color-accent)]' : test === 'testing…' ? 'text-[color:var(--color-text-dim)]' : 'text-[color:var(--color-red)]')}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {test}
          </span>
        )}
        {msg && (
          <span
            className={cn('text-[11px]', msg.includes('fail') || msg.includes('Failed') ? 'text-[color:var(--color-red)]' : 'text-[color:var(--color-accent)]')}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {msg}
          </span>
        )}
      </div>

      {/* When the remote copy was last actually written (P48). Without this the panel
          shows a configured mirror that may not have run in months as if it were fine. */}
      {backend !== 'local' && (
        <p
          className={cn(
            'text-[10px] mt-1.5',
            syncedNow ? 'text-[color:var(--color-accent)]' : storage.syncIsStale ? 'text-[color:var(--color-gold)]' : 'text-[color:var(--color-text-faint)]'
          )}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {syncedNow
            ? t('set.lastSyncJustNow')
            : storage.lastSyncAt
              ? t('set.lastSync', { date: new Date(storage.lastSyncAt).toLocaleString('en-GB') })
              : t('set.lastSyncNever')}
          {!syncedNow && storage.syncIsStale && ` · ${t('set.lastSyncStale', { n: storage.syncStaleDays })}`}
        </p>
      )}
    </Section>
  );
}

// ─── Defaults & alerts + Notifications ───────────────────────────────────────

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative w-10 h-6 rounded-full transition-colors shrink-0',
        checked ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-surface-3)] border border-[color:var(--color-border)]'
      )}
    >
      <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
    </button>
  );
}

const fieldLabel = 'text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider mb-1.5 block';
const saveBtn =
  'flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-[color:var(--color-accent)] text-black font-semibold hover:opacity-90 transition-opacity disabled:opacity-50';
const ghostBtn =
  'flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50';

function BudgetsManager({ settings }: { settings: AppSettings }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [budgets, setBudgets] = useState<Record<string, string>>(() =>
    Object.fromEntries(settings.expenseCategories.map((c) => [c, settings.budgets[c] != null ? String(settings.budgets[c]) : '']))
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [rollover, setRollover] = useState(settings.budgetRollover);
  const total = Object.values(budgets).reduce((s, v) => s + (Number(v) || 0), 0);

  function toggleRollover(v: boolean) {
    setRollover(v);
    startTransition(async () => {
      await saveBudgetRollover(v);
    });
  }

  function save() {
    setMsg(null);
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(budgets)) {
      const n = Number(v);
      if (n > 0) out[k] = n;
    }
    startTransition(async () => {
      await saveBudgets(out);
      setMsg(t('common.savedOk'));
    });
  }

  function suggest() {
    setMsg(null);
    setSuggesting(true);
    (async () => {
      try {
        const { suggestions, months } = await suggestBudgets();
        const n = Object.keys(suggestions).length;
        if (n === 0) {
          setMsg(t('set.budgetsNoHistory'));
          return;
        }
        // Pre-fill only categories the history covers; leave the rest untouched
        // so the user reviews before saving (suggest ≠ auto-apply).
        setBudgets((p) => {
          const next = { ...p };
          for (const [cat, amount] of Object.entries(suggestions)) next[cat] = String(amount);
          return next;
        });
        setMsg(t('set.budgetsSuggested', { n, months }));
      } finally {
        setSuggesting(false);
      }
    })();
  }

  return (
    <Section title={t('set.budgetsTitle')} icon={<SlidersHorizontal size={15} />}>
      <p className="text-xs text-[color:var(--color-text-dim)] mb-3">{t('set.budgetsDesc')}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {settings.expenseCategories.map((c) => (
          <label key={c} className="flex items-center gap-1.5 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-2.5 py-1.5">
            <span className="text-[11px] text-[color:var(--color-text-dim)] flex-1 truncate" title={c}>{c}</span>
            <span className="text-[10px] text-[color:var(--color-text-faint)]">{cur()}</span>
            <input
              type="number"
              min="0"
              inputMode="decimal"
              value={budgets[c] ?? ''}
              onChange={(e) => setBudgets((p) => ({ ...p, [c]: e.target.value }))}
              placeholder="0"
              className="w-14 bg-transparent text-right text-xs text-[color:var(--color-text)] focus:outline-none"
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <button onClick={save} disabled={pending} className="text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-accent)] text-black font-semibold hover:opacity-90 disabled:opacity-50">
          {pending ? t('common.saving') : t('set.saveBudgets')}
        </button>
        <button onClick={suggest} disabled={suggesting} title={t('set.suggestBudgetsHint')} className="text-xs px-3 py-1.5 rounded-lg border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:border-[color:var(--color-border-light)] disabled:opacity-50 inline-flex items-center gap-1.5">
          {suggesting ? <Loader2 size={13} className="animate-spin" /> : <TrendingUp size={13} />}
          {t('set.suggestBudgets')}
        </button>
        <span className="text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{t('set.budgetTotal', { amount: `${cur()}${total.toLocaleString('en-GB')}` })}</span>
        {msg && <span className="text-[11px] text-[color:var(--color-accent)]">{msg}</span>}
      </div>
      <label className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-[color:var(--color-border)] cursor-pointer">
        <span className="min-w-0">
          <span className="text-xs font-medium block">{t('set.budgetRollover')}</span>
          <span className="text-[10px] text-[color:var(--color-text-faint)] block">{t('set.budgetRolloverDesc')}</span>
        </span>
        <Switch checked={rollover} onChange={toggleRollover} />
      </label>
    </Section>
  );
}

/** Manual asset accounts (cash, bank balances) counted into net worth (PA2).
 *  Free-form name + balance rows — no bank integration, the user updates by hand. */
/** Vendor→category auto-rules (P15). Deterministic (zero AI): "if the vendor/description
 *  matches X → category Y (+ optional recurring)". Applied to every new expense/income on
 *  create; "Apply to existing" retro-tags uncategorised records. */
type RuleRow = {
  match: string;
  matchType: 'vendor' | 'text';
  category: string;
  recurring: boolean;
  recurringCycle: import('@/lib/billingCycle').RecurringCycle;
};

function CategoryRulesManager({ settings }: { settings: AppSettings }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [applying, setApplying] = useState(false);
  const [rows, setRows] = useState<RuleRow[]>(() =>
    (settings.categoryRules as CategoryRule[]).map((r) => ({
      match: r.match,
      matchType: r.matchType,
      category: r.category,
      recurring: r.recurring,
      recurringCycle: r.recurringCycle,
    }))
  );
  const [msg, setMsg] = useState<string | null>(null);
  const cats = settings.expenseCategories;
  const cellCls =
    'bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)]';

  function set(i: number, patch: Partial<RuleRow>) {
    setRows((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  function save() {
    setMsg(null);
    const clean = rows.filter((r) => r.match.trim() && r.category.trim());
    startTransition(async () => {
      await saveCategoryRules(clean);
      setRows(clean);
      setMsg(t('common.savedOk'));
    });
  }

  function applyExisting() {
    setMsg(null);
    setApplying(true);
    (async () => {
      try {
        // Persist first so the server applies exactly what's on screen.
        await saveCategoryRules(rows.filter((r) => r.match.trim() && r.category.trim()));
        const res = await applyCategoryRulesToExisting();
        setMsg(res.ok ? t('set.rulesApplied', { n: res.updated }) : res.error || 'Error');
      } finally {
        setApplying(false);
      }
    })();
  }

  return (
    <Section title={t('set.rulesTitle')} icon={<Tags size={15} />}>
      <p className="text-xs text-[color:var(--color-text-dim)] mb-3">{t('set.rulesDesc')}</p>
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-[11px] text-[color:var(--color-text-faint)]">{t('set.rulesEmpty')}</p>}
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              value={r.match}
              onChange={(e) => set(i, { match: e.target.value })}
              placeholder={t('set.rulesMatchPlaceholder')}
              className={`${cellCls} flex-1 min-w-[120px]`}
            />
            <select value={r.matchType} onChange={(e) => set(i, { matchType: e.target.value as RuleRow['matchType'] })} className={cellCls} title={t('set.rulesMatchType')}>
              <option value="vendor">{t('set.rulesMatchVendor')}</option>
              <option value="text">{t('set.rulesMatchText')}</option>
            </select>
            <span className="text-[color:var(--color-text-faint)] text-xs">→</span>
            <select value={r.category} onChange={(e) => set(i, { category: e.target.value })} className={cellCls}>
              <option value="">{t('set.rulesPickCategory')}</option>
              {cats.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              {r.category && !cats.includes(r.category) && <option value={r.category}>{r.category}</option>}
            </select>
            <label className="flex items-center gap-1 text-[11px] text-[color:var(--color-text-dim)]" title={t('set.rulesRecurringHint')}>
              <input type="checkbox" checked={r.recurring} onChange={(e) => set(i, { recurring: e.target.checked })} />
              {t('set.rulesRecurring')}
            </label>
            {r.recurring && (
              <select value={r.recurringCycle} onChange={(e) => set(i, { recurringCycle: e.target.value as RuleRow['recurringCycle'] })} className={cellCls}>
                <option value="">{t('set.rulesCycleAny')}</option>
                <option value="weekly">{t('sub.weekly')}</option>
                <option value="monthly">{t('sub.monthly')}</option>
                <option value="quarterly">{t('sub.quarterly')}</option>
                <option value="yearly">{t('sub.yearly')}</option>
              </select>
            )}
            <button onClick={() => setRows((p) => p.filter((_, j) => j !== i))} className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]" title={t('common.delete')}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <button onClick={() => setRows((p) => [...p, { match: '', matchType: 'vendor', category: '', recurring: false, recurringCycle: '' }])} className="flex items-center gap-1 text-xs text-[color:var(--color-cyan)] hover:text-[color:var(--color-accent)]">
          <Plus size={13} /> {t('set.rulesAdd')}
        </button>
        <button onClick={save} disabled={pending} className="text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-accent)] text-black font-semibold hover:opacity-90 disabled:opacity-50">
          {pending ? t('common.saving') : t('set.rulesSave')}
        </button>
        <button onClick={applyExisting} disabled={applying || rows.length === 0} title={t('set.rulesApplyHint')} className="text-xs px-3 py-1.5 rounded-lg border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] hover:border-[color:var(--color-border-light)] disabled:opacity-50 inline-flex items-center gap-1.5">
          {applying ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {t('set.rulesApply')}
        </button>
        {msg && <span className="text-[11px] text-[color:var(--color-accent)]">{msg}</span>}
      </div>
    </Section>
  );
}

function AssetAccountsManager({ settings }: { settings: AppSettings }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<Array<{ name: string; balance: string }>>(() => {
    const existing = Object.entries(settings.assetAccounts).map(([name, balance]) => ({ name, balance: String(balance) }));
    return existing.length ? existing : [{ name: '', balance: '' }];
  });
  const [msg, setMsg] = useState<string | null>(null);
  const total = rows.reduce((s, r) => s + (Number(r.balance) || 0), 0);

  function save() {
    setMsg(null);
    const out: Record<string, number> = {};
    for (const r of rows) {
      const n = Number(r.balance);
      if (r.name.trim() && n > 0) out[r.name.trim()] = n;
    }
    startTransition(async () => {
      await saveAssetAccounts(out);
      setMsg(t('common.savedOk'));
    });
  }

  return (
    <Section title={t('set.accountsTitle')} icon={<Landmark size={15} />}>
      <p className="text-xs text-[color:var(--color-text-dim)] mb-3">{t('set.accountsDesc')}</p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={r.name}
              onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              placeholder={t('set.accountNamePlaceholder')}
              className="flex-1 min-w-0 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-1.5 text-xs text-[color:var(--color-text)] focus:outline-none focus:border-[color:var(--color-accent)]"
            />
            <label className="flex items-center gap-1.5 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-2.5 py-1.5">
              <span className="text-[10px] text-[color:var(--color-text-faint)]">{cur()}</span>
              <input
                type="number"
                min="0"
                inputMode="decimal"
                value={r.balance}
                onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, balance: e.target.value } : x)))}
                placeholder="0"
                className="w-24 bg-transparent text-right text-xs text-[color:var(--color-text)] focus:outline-none"
              />
            </label>
            <button onClick={() => setRows((p) => p.filter((_, j) => j !== i))} className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]" title={t('common.delete')}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button onClick={() => setRows((p) => [...p, { name: '', balance: '' }])} className="flex items-center gap-1 text-xs text-[color:var(--color-cyan)] hover:text-[color:var(--color-accent)]">
          <Plus size={13} /> {t('set.addAccount')}
        </button>
        <button onClick={save} disabled={pending} className="text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-accent)] text-black font-semibold hover:opacity-90 disabled:opacity-50">
          {pending ? t('common.saving') : t('set.saveAccounts')}
        </button>
        <span className="text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{t('set.accountsTotal', { amount: `${cur()}${total.toLocaleString('en-GB')}` })}</span>
        {msg && <span className="text-[11px] text-[color:var(--color-accent)]">{msg}</span>}
      </div>
    </Section>
  );
}

/** Asset depreciation model (P29). Owned-inventory value on Reports is estimated
 *  from purchase price + date via a per-category declining-balance curve instead of
 *  staying frozen at cost. Toggle, salvage floor, default rate, and per-category rates. */
function DepreciationManager({ settings }: { settings: AppSettings }) {
  const t = useT();
  const dep = settings.depreciation;
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(dep.enabled);
  const [floorPct, setFloorPct] = useState(String(dep.floorPct));
  const [defaultRate, setDefaultRate] = useState(String(dep.defaultRate));
  const [rates, setRates] = useState<Record<string, string>>(() =>
    Object.fromEntries(settings.itemCategories.map((c) => [c, dep.rates[c] != null ? String(dep.rates[c]) : '']))
  );
  const [msg, setMsg] = useState<string | null>(null);

  function save() {
    setMsg(null);
    // Only non-empty inputs become explicit overrides; empty → the default rate
    // applies at read time (so "empty" ≠ "0% / never depreciates").
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(rates)) {
      if (v.trim() === '') continue;
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) out[k] = n;
    }
    startTransition(async () => {
      await saveDepreciation({ enabled, floorPct: Number(floorPct) || 0, defaultRate: Number(defaultRate) || 0, rates: out });
      setMsg(t('common.savedOk'));
    });
  }

  return (
    <Section title={t('set.depreciationTitle')} icon={<TrendingDown size={15} />}>
      <p className="text-xs text-[color:var(--color-text-dim)] mb-3">{t('set.depreciationDesc')}</p>
      <label className="flex items-center justify-between gap-3 mb-3">
        <span className="text-xs text-[color:var(--color-text-dim)]">{t('set.depreciationEnabled')}</span>
        <Switch checked={enabled} onChange={setEnabled} />
      </label>
      {enabled && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="flex items-center gap-1.5 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-2.5 py-1.5">
              <span className="text-[11px] text-[color:var(--color-text-dim)] flex-1">{t('set.depreciationDefaultRate')}</span>
              <input type="number" min="0" max="100" inputMode="decimal" value={defaultRate} onChange={(e) => setDefaultRate(e.target.value)} className="w-14 bg-transparent text-right text-xs text-[color:var(--color-text)] focus:outline-none" />
              <span className="text-[10px] text-[color:var(--color-text-faint)]">%/yr</span>
            </label>
            <label className="flex items-center gap-1.5 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-2.5 py-1.5">
              <span className="text-[11px] text-[color:var(--color-text-dim)] flex-1">{t('set.depreciationFloor')}</span>
              <input type="number" min="0" max="100" inputMode="decimal" value={floorPct} onChange={(e) => setFloorPct(e.target.value)} className="w-14 bg-transparent text-right text-xs text-[color:var(--color-text)] focus:outline-none" />
              <span className="text-[10px] text-[color:var(--color-text-faint)]">%</span>
            </label>
          </div>
          <p className="text-[11px] text-[color:var(--color-text-faint)] mb-2">{t('set.depreciationRatesLabel')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {settings.itemCategories.map((c) => (
              <label key={c} className="flex items-center gap-1.5 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-2.5 py-1.5">
                <span className="text-[11px] text-[color:var(--color-text-dim)] flex-1 truncate" title={c}>{c}</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  inputMode="decimal"
                  value={rates[c] ?? ''}
                  onChange={(e) => setRates((p) => ({ ...p, [c]: e.target.value }))}
                  placeholder={String(rateForCategory({ ...dep, rates: {} }, c))}
                  className="w-12 bg-transparent text-right text-xs text-[color:var(--color-text)] focus:outline-none"
                />
                <span className="text-[10px] text-[color:var(--color-text-faint)]">%</span>
              </label>
            ))}
          </div>
        </>
      )}
      <div className="flex items-center gap-3 mt-3">
        <button onClick={save} disabled={pending} className="text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-accent)] text-black font-semibold hover:opacity-90 disabled:opacity-50">
          {pending ? t('common.saving') : t('set.depreciationSave')}
        </button>
        {msg && <span className="text-[11px] text-[color:var(--color-accent)]">{msg}</span>}
      </div>
    </Section>
  );
}

function DefaultsManager({ settings }: { settings: AppSettings }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<'grid' | 'list'>(settings.defaultItemView);
  const [warrantyMonths, setWarrantyMonths] = useState(String(settings.defaultWarrantyMonths));
  const [alertDays, setAlertDays] = useState(String(settings.warrantyAlertDays));
  const [trialDays, setTrialDays] = useState(String(settings.trialAlertDays));
  const [giftDays, setGiftDays] = useState(String(settings.giftCardAlertDays));
  const [billDays, setBillDays] = useState(String(settings.billAlertDays));
  const [syncStaleDays, setSyncStaleDays] = useState(String(settings.syncStaleDays));
  const [autoAdd, setAutoAdd] = useState(settings.autoAddStores);
  const [currency, setCurrency] = useState(settings.currency);
  const [multiCurrency, setMultiCurrency] = useState(settings.multiCurrency);
  const [vatRate, setVatRate] = useState(String(settings.defaultVatRate));
  const [returnDays, setReturnDays] = useState(String(settings.defaultReturnWindowDays));
  const [msg, setMsg] = useState<string | null>(null);

  function save() {
    const fd = new FormData();
    fd.set('defaultItemView', view);
    fd.set('defaultWarrantyMonths', warrantyMonths);
    fd.set('warrantyAlertDays', alertDays);
    fd.set('trialAlertDays', trialDays);
    fd.set('giftCardAlertDays', giftDays);
    fd.set('billAlertDays', billDays);
    fd.set('syncStaleDays', syncStaleDays);
    fd.set('autoAddStores', String(autoAdd));
    fd.set('currency', currency);
    fd.set('multiCurrency', String(multiCurrency));
    fd.set('defaultVatRate', vatRate);
    fd.set('defaultReturnWindowDays', returnDays);
    setMsg(null);
    startTransition(async () => {
      await saveDefaults(fd);
      setMsg(t('set.savedReloading'));
      // Currency symbol is baked into the rendered tree → refresh so it applies everywhere.
      setTimeout(() => window.location.reload(), 600);
    });
  }

  return (
    <Section title={t('set.defaultsTitle')} icon={<SlidersHorizontal size={15} />}>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className={fieldLabel} style={{ fontFamily: 'var(--font-mono)' }}>{t('set.currency')}</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={fieldLabel} style={{ fontFamily: 'var(--font-mono)' }}>{t('set.defaultVat')}</span>
          <input type="number" min="0" max="100" step="0.5" value={vatRate} onChange={(e) => setVatRate(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className={fieldLabel} style={{ fontFamily: 'var(--font-mono)' }}>{t('set.defaultView')}</span>
          <select value={view} onChange={(e) => setView(e.target.value as 'grid' | 'list')} className={inputClass}>
            <option value="grid">{t('v.grid')}</option>
            <option value="list">{t('v.list')}</option>
          </select>
        </label>
        <label className="block">
          <span className={fieldLabel} style={{ fontFamily: 'var(--font-mono)' }}>{t('set.defaultWarranty')}</span>
          <input type="number" min="0" max="120" value={warrantyMonths} onChange={(e) => setWarrantyMonths(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className={fieldLabel} style={{ fontFamily: 'var(--font-mono)' }}>{t('set.warrantyAlert')}</span>
          <input type="number" min="0" max="730" value={alertDays} onChange={(e) => setAlertDays(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className={fieldLabel} style={{ fontFamily: 'var(--font-mono)' }}>{t('set.returnWindow')}</span>
          <input type="number" min="0" max="365" value={returnDays} onChange={(e) => setReturnDays(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className={fieldLabel} style={{ fontFamily: 'var(--font-mono)' }}>{t('set.trialAlert')}</span>
          <input type="number" min="0" max="60" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className={fieldLabel} style={{ fontFamily: 'var(--font-mono)' }}>{t('set.giftCardAlert')}</span>
          <input type="number" min="0" max="365" value={giftDays} onChange={(e) => setGiftDays(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className={fieldLabel} style={{ fontFamily: 'var(--font-mono)' }}>{t('set.billAlert')}</span>
          <input type="number" min="0" max="90" value={billDays} onChange={(e) => setBillDays(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className={fieldLabel} style={{ fontFamily: 'var(--font-mono)' }}>{t('set.syncStaleAlert')}</span>
          <input type="number" min="0" max="365" value={syncStaleDays} onChange={(e) => setSyncStaleDays(e.target.value)} className={inputClass} />
        </label>
        <div className="flex items-center justify-between gap-3 self-end pb-1">
          <span className="min-w-0">
            <span className="text-xs font-medium block">{t('set.autoAddStores')}</span>
            <span className="text-[10px] text-[color:var(--color-text-faint)] block">{t('set.autoAddStoresDesc')}</span>
          </span>
          <Switch checked={autoAdd} onChange={setAutoAdd} />
        </div>
        {/* P9 opt-in: keeps the currency + FX-rate fields out of the way for the
            single-currency majority. Totals always stay in the base currency above. */}
        <div className="flex items-center justify-between gap-3 self-end pb-1">
          <span className="min-w-0">
            <span className="text-xs font-medium block">{t('set.multiCurrency')}</span>
            <span className="text-[10px] text-[color:var(--color-text-faint)] block">{t('set.multiCurrencyDesc', { code: currency })}</span>
          </span>
          <Switch checked={multiCurrency} onChange={setMultiCurrency} />
        </div>
      </div>
      <div className="flex items-center gap-3 pt-3 border-t border-[color:var(--color-border)] mt-1">
        <button type="button" onClick={save} disabled={pending} className={saveBtn}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {t('set.saveDefaults')}
        </button>
        {msg && <span className="text-[11px] text-[color:var(--color-accent)]" style={{ fontFamily: 'var(--font-mono)' }}>{msg}</span>}
      </div>
    </Section>
  );
}

/** Recent outbound delivery attempts for one channel (P80). Until this existed a failed
 *  delivery left no trace at all, so a broken endpoint looked identical to a quiet week. */
function DeliveryHistory({ log }: { log?: DeliveryLogEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!log || log.length === 0) return null;
  const rows = [...log].reverse(); // newest first
  const shown = expanded ? rows : rows.slice(0, 3);
  const failing = rows[0] && !rows[0].ok;
  return (
    <div className="pt-2 border-t border-[color:var(--color-border)] space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
        Recent deliveries {failing && <span className="text-[color:var(--color-red)]">· last one failed</span>}
      </p>
      {shown.map((r, i) => (
        <div key={`${r.at}-${i}`} className="flex items-center gap-2 text-[11px]" style={{ fontFamily: 'var(--font-mono)' }}>
          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', r.ok ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-red)]')} />
          <span className="text-[color:var(--color-text-faint)]">{new Date(r.at).toLocaleString('en-GB')}</span>
          <span className={cn('truncate', r.ok ? 'text-[color:var(--color-text-dim)]' : 'text-[color:var(--color-red)]')}>
            {r.ok ? `delivered${r.status ? ` · ${r.status}` : ''}` : r.error || 'failed'}
          </span>
          {r.attempts > 1 && <span className="text-[color:var(--color-gold)] shrink-0">×{r.attempts}</span>}
        </div>
      ))}
      {rows.length > 3 && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="text-[10px] text-[color:var(--color-cyan)]">
          {expanded ? 'show less' : `show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}

function newChannel(type: NotifierType): NotifierConfig {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `n${Date.now()}`;
  return { id, type, enabled: true, label: '', url: '', token: '', target: '' };
}

function ChannelCard({
  ch,
  onChange,
  onRemove,
  onTest,
  testing,
  testMsg,
  log,
}: {
  ch: NotifierConfig;
  onChange: (c: NotifierConfig) => void;
  onRemove: () => void;
  onTest: () => void;
  testing: boolean;
  testMsg?: string;
  log?: DeliveryLogEntry[];
}) {
  const t = useT();
  const meta = NOTIFIER_TYPES.find((nt) => nt.type === ch.type)!;
  const set = (patch: Partial<NotifierConfig>) => onChange({ ...ch, ...patch });
  return (
    <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <select
          value={ch.type}
          onChange={(e) => set({ type: e.target.value as NotifierType })}
          className={cn(inputClass, 'w-auto')}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {NOTIFIER_TYPES.map((nt) => (
            <option key={nt.type} value={nt.type}>{nt.label}</option>
          ))}
        </select>
        <input
          value={ch.label || ''}
          onChange={(e) => set({ label: e.target.value })}
          placeholder={t('set.chLabelOptional')}
          className={cn(inputClass, 'flex-1')}
        />
        <Switch checked={ch.enabled} onChange={(v) => set({ enabled: v })} />
        <button type="button" onClick={onRemove} className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]" aria-label="Remove channel">
          <Trash2 size={14} />
        </button>
      </div>

      {meta.needs.includes('url') && (
        <input
          value={ch.url || ''}
          onChange={(e) => set({ url: e.target.value })}
          placeholder={ch.type === 'ntfy' ? 'https://ntfy.sh/your-topic' : 'Webhook URL'}
          className={inputClass}
          style={{ fontFamily: 'var(--font-mono)' }}
        />
      )}
      {meta.needs.includes('token') && (
        <input
          value={ch.token || ''}
          onChange={(e) => set({ token: e.target.value })}
          placeholder="Bot token (123456:ABC-…)"
          className={inputClass}
          style={{ fontFamily: 'var(--font-mono)' }}
        />
      )}
      {meta.needs.includes('target') && (
        <input
          value={ch.target || ''}
          onChange={(e) => set({ target: e.target.value })}
          placeholder="Chat id (e.g. 123456789)"
          className={inputClass}
          style={{ fontFamily: 'var(--font-mono)' }}
        />
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-[color:var(--color-text-faint)]">{meta.hint}</span>
        <button type="button" onClick={onTest} disabled={testing} className={cn(ghostBtn, 'text-[color:var(--color-cyan)] py-1.5')}>
          {testing ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />} Test
        </button>
      </div>
      {testMsg && (
        <p className={cn('text-[11px]', testMsg.startsWith('Failed') ? 'text-[color:var(--color-red)]' : 'text-[color:var(--color-accent)]')} style={{ fontFamily: 'var(--font-mono)' }}>
          {testMsg}
        </p>
      )}
      <DeliveryHistory log={log} />
    </div>
  );
}

function NotificationsManager() {
  const [pending, startTransition] = useTransition();
  const [channels, setChannels] = useState<NotifierConfig[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState<string>('');
  const [testMsgs, setTestMsgs] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<Record<string, DeliveryLogEntry[]>>({});

  useEffect(() => {
    startTransition(async () => {
      setChannels(await getNotifierChannels());
      setLogs(await getDeliveryLogs());
    });
  }, []);

  function update(id: string, c: NotifierConfig) {
    setChannels((p) => (p ?? []).map((x) => (x.id === id ? c : x)));
  }
  function add() {
    setChannels((p) => [...(p ?? []), newChannel('ntfy')]);
  }
  function remove(id: string) {
    setChannels((p) => (p ?? []).filter((x) => x.id !== id));
  }
  function save() {
    setMsg('Saving…');
    startTransition(async () => {
      await saveNotifierChannels(channels ?? []);
      setMsg('Saved ✓');
    });
  }
  function testOne(c: NotifierConfig) {
    setTesting(c.id);
    setTestMsgs((p) => ({ ...p, [c.id]: '' }));
    startTransition(async () => {
      const r = await testNotifierChannel(c);
      setTestMsgs((p) => ({ ...p, [c.id]: r.ok ? 'Test sent ✓' : `Failed: ${r.error}` }));
      setTesting('');
    });
  }
  function check() {
    setMsg('Checking…');
    startTransition(async () => {
      await saveNotifierChannels(channels ?? []);
      const r = await runAlertChecks();
      setMsg((r.sent ? '✓ Sent · ' : '(no enabled channels) · ') + r.summary.replace(/\n/g, ' · '));
      setLogs(await getDeliveryLogs()); // the dispatch just wrote new rows
    });
  }

  return (
    <Section title="Notifications" icon={<Bell size={15} />}>
      <p className="text-xs text-[color:var(--color-text-dim)] -mt-1">
        Alerts for deals, installments due this month, and warranties expiring soon always show in the in-app{' '}
        <span className="text-[color:var(--color-accent)]">bell</span>. Add channels below to also push them out — ntfy, Discord, Slack,
        Telegram, or any webhook (route to email via Zapier/n8n).
      </p>

      <div className="space-y-2.5">
        {channels === null ? (
          <p className="text-xs text-[color:var(--color-text-faint)] py-4 flex items-center gap-2">
            <Loader2 size={13} className="animate-spin" /> Loading channels…
          </p>
        ) : channels.length === 0 ? (
          <p className="text-xs text-[color:var(--color-text-faint)] py-3">No outbound channels yet — alerts only show in the bell.</p>
        ) : (
          channels.map((c) => (
            <ChannelCard
              key={c.id}
              ch={c}
              onChange={(nc) => update(c.id, nc)}
              onRemove={() => remove(c.id)}
              onTest={() => testOne(c)}
              testing={testing === c.id}
              testMsg={testMsgs[c.id]}
              log={logs[notifierLogKey(c.id)]}
            />
          ))
        )}
      </div>

      <button type="button" onClick={add} className={cn(ghostBtn, 'w-full justify-center')}>
        <Plus size={13} /> Add channel
      </button>

      <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-[color:var(--color-border)] mt-1">
        <button type="button" onClick={save} disabled={pending || channels === null} className={saveBtn}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
        </button>
        <button type="button" onClick={check} disabled={pending || channels === null} className={cn(ghostBtn, 'text-[color:var(--color-gold)]')}>
          <Sparkles size={13} /> Check & notify now
        </button>
      </div>
      {msg && (
        <p className={cn('text-[11px]', msg.startsWith('Failed') ? 'text-[color:var(--color-red)]' : 'text-[color:var(--color-accent)]')} style={{ fontFamily: 'var(--font-mono)' }}>
          {msg}
        </p>
      )}
    </Section>
  );
}

function newWebhook(): WebhookSubscription {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `w${Date.now()}`;
  return { id, url: '', secret: '', enabled: true, label: '', events: [] };
}

function WebhookCard({
  sub,
  onChange,
  onRemove,
  onTest,
  testing,
  testMsg,
  onCopySecret,
  copied,
  log,
}: {
  sub: WebhookSubscription;
  onChange: (s: WebhookSubscription) => void;
  onRemove: () => void;
  onTest: () => void;
  testing: boolean;
  testMsg?: string;
  onCopySecret: () => void;
  copied: boolean;
  log?: DeliveryLogEntry[];
}) {
  const set = (patch: Partial<WebhookSubscription>) => onChange({ ...sub, ...patch });
  function toggleEvent(ev: WebhookEvent) {
    const has = sub.events.includes(ev);
    set({ events: has ? sub.events.filter((e) => e !== ev) : [...sub.events, ev] });
  }
  return (
    <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <input
          value={sub.label || ''}
          onChange={(e) => set({ label: e.target.value })}
          placeholder="Label (optional)"
          className={cn(inputClass, 'flex-1')}
        />
        <Switch checked={sub.enabled} onChange={(v) => set({ enabled: v })} />
        <button type="button" onClick={onRemove} className="p-1.5 rounded-lg text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]" aria-label="Remove webhook">
          <Trash2 size={14} />
        </button>
      </div>

      <input
        value={sub.url}
        onChange={(e) => set({ url: e.target.value })}
        placeholder="https://your-automation.example/hook"
        className={inputClass}
        style={{ fontFamily: 'var(--font-mono)' }}
      />

      <div className="flex items-center gap-2">
        <code
          className="flex-1 min-w-0 text-xs bg-[color:var(--color-surface-3)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 truncate"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {sub.secret || '(generated on save)'}
        </code>
        {sub.secret && (
          <button
            type="button"
            onClick={onCopySecret}
            className="shrink-0 p-2 rounded-lg bg-[color:var(--color-surface-3)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]"
            title="Copy signing secret"
          >
            {copied ? <Check size={14} className="text-[color:var(--color-accent)]" /> : <Copy size={14} />}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {WEBHOOK_EVENTS.map((ev) => (
          <button
            key={ev.type}
            type="button"
            onClick={() => toggleEvent(ev.type)}
            title={ev.hint}
            className={cn(
              'text-[11px] px-2.5 py-1 rounded-full border transition-colors',
              sub.events.includes(ev.type)
                ? 'bg-[color:var(--color-accent)] text-black border-[color:var(--color-accent)]'
                : 'border-[color:var(--color-border)] text-[color:var(--color-text-faint)] hover:border-[color:var(--color-accent)]'
            )}
          >
            {ev.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-[color:var(--color-text-faint)]">Signed via X-Pharos-Signature (HMAC-SHA256).</span>
        <button type="button" onClick={onTest} disabled={testing || !sub.url} className={cn(ghostBtn, 'text-[color:var(--color-cyan)] py-1.5')}>
          {testing ? <Loader2 size={12} className="animate-spin" /> : <Webhook size={12} />} Test
        </button>
      </div>
      {testMsg && (
        <p className={cn('text-[11px]', testMsg.startsWith('Failed') ? 'text-[color:var(--color-red)]' : 'text-[color:var(--color-accent)]')} style={{ fontFamily: 'var(--font-mono)' }}>
          {testMsg}
        </p>
      )}
      <DeliveryHistory log={log} />
    </div>
  );
}

function WebhookManager() {
  const [pending, startTransition] = useTransition();
  const [subs, setSubs] = useState<WebhookSubscription[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState<string>('');
  const [testMsgs, setTestMsgs] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState('');
  const [logs, setLogs] = useState<Record<string, DeliveryLogEntry[]>>({});

  useEffect(() => {
    startTransition(async () => {
      setSubs(await getWebhookSubscriptions());
      setLogs(await getDeliveryLogs());
    });
  }, []);

  function update(id: string, s: WebhookSubscription) {
    setSubs((p) => (p ?? []).map((x) => (x.id === id ? s : x)));
  }
  function add() {
    setSubs((p) => [...(p ?? []), newWebhook()]);
  }
  function remove(id: string) {
    setSubs((p) => (p ?? []).filter((x) => x.id !== id));
  }
  function save() {
    setMsg('Saving…');
    startTransition(async () => {
      const r = await saveWebhookSubscriptions(subs ?? []);
      if (!r.ok) {
        setMsg(`Failed: ${r.error}`);
        return;
      }
      setSubs(await getWebhookSubscriptions()); // pick up server-generated secrets
      setMsg('Saved ✓');
    });
  }
  function testOne(s: WebhookSubscription) {
    setTesting(s.id);
    setTestMsgs((p) => ({ ...p, [s.id]: '' }));
    startTransition(async () => {
      const r = await testWebhookSubscription(s);
      setTestMsgs((p) => ({ ...p, [s.id]: r.ok ? 'Test sent ✓' : `Failed: ${r.error}` }));
      setTesting('');
    });
  }
  function copySecret(secret: string, id: string) {
    navigator.clipboard?.writeText(secret);
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 1500);
  }

  return (
    <Section title="Webhooks" icon={<Webhook size={15} />}>
      <p className="text-xs text-[color:var(--color-text-dim)] -mt-1">
        Automation hooks for Home Assistant, n8n, or Node-RED — each subscription fires a signed JSON POST when
        one of its selected events happens. <span className="text-[color:var(--color-accent)]">Receipt parsed</span> fires
        immediately on every scan; <span className="text-[color:var(--color-accent)]">budget exceeded</span>,{' '}
        <span className="text-[color:var(--color-accent)]">installment due</span>, and{' '}
        <span className="text-[color:var(--color-accent)]">price drop</span> fire when the alert scan above runs
        (&quot;Check &amp; notify now&quot;, or your own cron hitting the same check).
      </p>

      <div className="space-y-2.5">
        {subs === null ? (
          <p className="text-xs text-[color:var(--color-text-faint)] py-4 flex items-center gap-2">
            <Loader2 size={13} className="animate-spin" /> Loading webhooks…
          </p>
        ) : subs.length === 0 ? (
          <p className="text-xs text-[color:var(--color-text-faint)] py-3">No webhooks yet.</p>
        ) : (
          subs.map((s) => (
            <WebhookCard
              key={s.id}
              sub={s}
              onChange={(ns) => update(s.id, ns)}
              onRemove={() => remove(s.id)}
              onTest={() => testOne(s)}
              testing={testing === s.id}
              testMsg={testMsgs[s.id]}
              onCopySecret={() => copySecret(s.secret, s.id)}
              copied={copiedId === s.id}
              log={logs[webhookLogKey(s.id)]}
            />
          ))
        )}
      </div>

      <button type="button" onClick={add} className={cn(ghostBtn, 'w-full justify-center')}>
        <Plus size={13} /> Add webhook
      </button>

      <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-[color:var(--color-border)] mt-1">
        <button type="button" onClick={save} disabled={pending || subs === null} className={saveBtn}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
        </button>
      </div>
      {msg && (
        <p className={cn('text-[11px]', msg.startsWith('Failed') ? 'text-[color:var(--color-red)]' : 'text-[color:var(--color-accent)]')} style={{ fontFamily: 'var(--font-mono)' }}>
          {msg}
        </p>
      )}
    </Section>
  );
}

// ─── Backup / restore ────────────────────────────────────────────────────────

// ─── Trash (soft-deleted records) ────────────────────────────────────────────

function TrashManager() {
  const t = useT();
  const [rows, setRows] = useState<TrashRow[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState('');
  const confirm = useConfirm();

  function load() {
    startTransition(async () => setRows(await getTrash()));
  }
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  function restore(r: TrashRow) {
    setBusyId(r.id);
    startTransition(async () => {
      await restoreFromTrash(r.type, r.id);
      setRows((p) => (p ?? []).filter((x) => x.id !== r.id));
      setBusyId('');
    });
  }
  async function purge(r: TrashRow) {
    const ok = await confirm({
      title: t('set.deleteForeverTitle'),
      message: t('set.confirmPurge', { title: r.title }),
      confirmLabel: t('common.deleteForever'),
      danger: true,
    });
    if (!ok) return;
    setBusyId(r.id);
    startTransition(async () => {
      await purgeFromTrash(r.type, r.id);
      setRows((p) => (p ?? []).filter((x) => x.id !== r.id));
      setBusyId('');
    });
  }
  async function empty() {
    const ok = await confirm({
      title: t('set.emptyTrashTitle'),
      message: t('set.confirmEmpty', { n: rows?.length ?? 0 }),
      confirmLabel: t('set.emptyTrashBtn'),
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      await emptyTrash();
      setRows([]);
    });
  }

  return (
    <Section title={`${t('set.trashTitle')}${rows?.length ? ` (${rows.length})` : ''}`} icon={<Trash2 size={15} />}>
      <p className="text-xs text-[color:var(--color-text-dim)] mb-3">
        {t('set.trashDesc')}
      </p>
      {rows === null ? (
        <p className="text-xs text-[color:var(--color-text-faint)]"><Loader2 size={13} className="inline animate-spin" /> {t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-[color:var(--color-text-faint)] italic">{t('set.trashEmpty')}</p>

      ) : (
        <>
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {rows.map((r) => (
              <div key={`${r.type}-${r.id}`} className="flex items-center gap-2.5 bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2">
                <span className="text-[9px] uppercase tracking-wider text-[color:var(--color-text-faint)] bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded px-1.5 py-0.5 shrink-0" style={{ fontFamily: 'var(--font-mono)' }}>
                  {r.type}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium truncate block">{r.title}</span>
                  <span className="text-[10px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
                    {r.subtitle} · {t('set.deletedOn', { date: new Date(r.deletedAt).toLocaleDateString('en-GB') })}
                  </span>
                </div>
                <button onClick={() => restore(r)} disabled={pending && busyId === r.id} className="text-[11px] text-[color:var(--color-accent)] hover:underline disabled:opacity-50 shrink-0">
                  {t('set.restore')}
                </button>
                <button onClick={() => purge(r)} disabled={pending && busyId === r.id} className="text-[11px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] disabled:opacity-50 shrink-0">
                  {t('set.deleteForeverLower')}
                </button>
              </div>
            ))}
          </div>
          <button onClick={empty} disabled={pending} className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-[color:var(--color-border)] text-[color:var(--color-red)] hover:border-[color:var(--color-red)] transition-colors disabled:opacity-50">
            {t('set.emptyTrash', { n: rows.length })}
          </button>
        </>
      )}
    </Section>
  );
}

function MigrationImportManager() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <Section title={t('migrate.sectionTitle')} icon={<Upload size={15} />}>
      <p className="text-xs text-[color:var(--color-text-dim)] -mt-1">{t('migrate.sectionHint')}</p>
      <button type="button" onClick={() => setOpen(true)} className={cn(ghostBtn)}>
        <Upload size={13} /> {t('migrate.ynabButton')}
      </button>
      {open && <YnabImportModal onClose={() => setOpen(false)} onImported={() => {}} />}
    </Section>
  );
}

function ImapImportManager({ imap }: { imap: ImapInfo }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(imap.enabled);
  const [host, setHost] = useState(imap.host);
  const [port, setPort] = useState(String(imap.port || 993));
  const [user, setUser] = useState(imap.user);
  const [pass, setPass] = useState('');
  const [secure, setSecure] = useState(imap.secure);
  const [folder, setFolder] = useState(imap.folder);
  const [msg, setMsg] = useState<string | null>(null);
  const [test, setTest] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState(imap.lastCheckedAt);
  const [lastImported, setLastImported] = useState(imap.lastImportedAt);

  function fmt(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function save() {
    const fd = new FormData();
    fd.set('imapEnabled', String(enabled));
    fd.set('imapHost', host.trim());
    fd.set('imapPort', port.trim());
    fd.set('imapUser', user.trim());
    if (pass) fd.set('imapPass', pass);
    fd.set('imapSecure', String(secure));
    fd.set('imapFolder', folder.trim());
    setMsg(null);
    setTest(null);
    startTransition(async () => {
      await saveImapConfigAction(fd);
      setPass('');
      setMsg('Saved ✓');
      setTimeout(() => setMsg(null), 2500);
    });
  }

  function doTest() {
    setTest('testing…');
    startTransition(async () => {
      const r = await testImapConnectionAction();
      setTest(r.ok ? `Connection OK ✓ (${r.messageCount} message${r.messageCount === 1 ? '' : 's'})` : `Failed: ${r.error}`);
    });
  }

  function doCheck() {
    setChecking(true);
    setMsg(null);
    startTransition(async () => {
      const r = await checkImapInboxNow();
      if (r.ok) {
        setMsg(`Imported ${r.imported}${r.skipped ? ` · ${r.skipped} skipped` : ''}`);
        const now = new Date().toISOString();
        setLastChecked(now);
        if (r.imported > 0) setLastImported(now);
      } else {
        setMsg(`Failed: ${r.error}`);
      }
      setChecking(false);
    });
  }

  return (
    <Section title={t('set.imapTitle')} icon={<Mail size={15} />}>
      <p className="text-[11px] text-[color:var(--color-text-dim)] -mt-1 mb-1">{t('set.imapDesc')}</p>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium">{t('set.imapEnabled')}</span>
        <Switch checked={enabled} onChange={setEnabled} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3 pt-1">
        <Field label={t('set.imapHost')}>
          <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="imap.gmail.com" className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} autoComplete="new-password" data-1p-ignore data-lpignore="true" />
        </Field>
        <Field label={t('set.imapPort')}>
          <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="993" className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
        </Field>
        <Field label={t('set.imapUsername')}>
          <input value={user} onChange={(e) => setUser(e.target.value)} className={inputClass} autoComplete="new-password" data-1p-ignore data-lpignore="true" />
        </Field>
        <Field label={imap.hasPass ? t('set.imapPasswordSaved') : t('set.imapPassword')}>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={imap.hasPass ? '••••••••' : ''} className={inputClass} autoComplete="new-password" data-1p-ignore data-lpignore="true" />
        </Field>
        <Field label={t('set.imapFolder')}>
          <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="INBOX" className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
        </Field>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[color:var(--color-text-dim)]">{t('set.imapSecure')}</span>
          <Switch checked={secure} onChange={setSecure} />
        </div>
      </div>
      <p className="text-[10px] text-[color:var(--color-text-faint)]">{t('set.imapAppPasswordHint')}</p>

      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-[color:var(--color-border)] mt-1">
        <button type="button" onClick={save} disabled={pending} className={saveBtn}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {t('common.save')}
        </button>
        <button type="button" onClick={doTest} disabled={pending} className={ghostBtn}>
          <Plug size={13} /> {t('set.testConnection')}
        </button>
        {enabled && (
          <button type="button" onClick={doCheck} disabled={pending || checking} className={ghostBtn}>
            {checking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} {t('set.imapCheckNow')}
          </button>
        )}
        {test && (
          <span className={cn('text-[11px]', test.startsWith('Connection OK') ? 'text-[color:var(--color-accent)]' : test === 'testing…' ? 'text-[color:var(--color-text-dim)]' : 'text-[color:var(--color-red)]')} style={{ fontFamily: 'var(--font-mono)' }}>
            {test}
          </span>
        )}
        {msg && (
          <span className="text-[11px] text-[color:var(--color-accent)]" style={{ fontFamily: 'var(--font-mono)' }}>{msg}</span>
        )}
      </div>
      <p className="text-[10px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
        {lastChecked ? t('set.imapLastChecked', { when: fmt(lastChecked) }) : t('set.imapNeverChecked')}
        {lastImported ? ` · ${t('set.imapLastImported', { when: fmt(lastImported) })}` : ''}
      </p>
    </Section>
  );
}

function SampleDataManager() {
  const t = useT();
  const [status, setStatus] = useState<{ loaded: boolean; counts: Record<string, number> } | null>(null);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const confirm = useConfirm();

  function load() {
    startTransition(async () => setStatus(await getSampleDataStatus()));
  }
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLoad() {
    if (status?.loaded) {
      const ok = await confirm({
        title: t('set.sampleReloadTitle'),
        message: t('set.sampleReloadConfirm'),
        confirmLabel: t('common.confirm'),
      });
      if (!ok) return;
    }
    setMsg(null);
    startTransition(async () => {
      const r = await loadSampleData();
      const n = r.counts.items + r.counts.receipts + r.counts.expenses + r.counts.subscriptions;
      setMsg(t('set.sampleLoaded', { n }));
      load();
    });
  }

  async function handleClear() {
    const ok = await confirm({
      title: t('set.sampleClearTitle'),
      message: t('set.sampleClearConfirm'),
      confirmLabel: t('common.deleteForever'),
      danger: true,
    });
    if (!ok) return;
    setMsg(null);
    startTransition(async () => {
      await clearSampleData();
      setMsg(t('set.sampleCleared'));
      load();
    });
  }

  const btn =
    'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50';

  return (
    <Section title={t('set.sampleData')} icon={<FlaskConical size={15} />}>
      <p className="text-xs text-[color:var(--color-text-faint)]">{t('set.sampleDataDesc')}</p>
      <div className="flex items-center gap-2 flex-wrap mt-2">
        <button type="button" onClick={handleLoad} disabled={pending} className={cn(btn, 'text-[color:var(--color-accent)]')}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />}
          {status?.loaded ? t('set.sampleReload') : t('set.sampleLoad')}
        </button>
        {status?.loaded && (
          <button type="button" onClick={handleClear} disabled={pending} className={cn(btn, 'text-[color:var(--color-red)]')}>
            <Trash2 size={13} /> {t('set.sampleClear')}
          </button>
        )}
        {msg && (
          <span className="text-[11px] text-[color:var(--color-accent)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {msg}
          </span>
        )}
      </div>
      {status?.loaded && (
        <p className="text-[10px] text-[color:var(--color-text-faint)] mt-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
          {status.counts.items} items · {status.counts.receipts} receipts · {status.counts.expenses} expenses · {status.counts.subscriptions} subscriptions
        </p>
      )}
    </Section>
  );
}

function BackupRestore() {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const verifyRef = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<{ ok: boolean; headline: string; issues: { level: string; message: string }[] } | null>(null);
  const confirm = useConfirm();
  const nowYear = new Date().getFullYear();
  const [taxYear, setTaxYear] = useState(nowYear);

  function handleExport() {
    setMsg(null);
    startTransition(async () => {
      try {
        const json = await exportData();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `pharos-backup-${stamp}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setMsg(t('set.backupDownloaded'));
      } catch (e) {
        setMsg(`Export failed: ${(e as Error).message.slice(0, 80)}`);
      }
    });
  }

  async function handleFile(file: File) {
    const ok = await confirm({
      title: t('set.restoreTitle'),
      message: t('set.restoreConfirm'),
      confirmLabel: t('common.confirm'),
      danger: true,
    });
    if (fileRef.current) fileRef.current.value = '';
    if (!ok) return;
    setMsg(t('set.restoring'));
    setReport(null);
    const text = await file.text();
    startTransition(async () => {
      const r = await importData(text);
      setMsg(r.ok ? t('set.restored', { n: r.restored }) : `${t('common.failed')}: ${r.error}`);
      // A restore that skipped collections or documents used to look identical to a
      // clean one; surface what was dropped instead of leaving it silent.
      if (r.warnings?.length) {
        setReport({ ok: true, headline: t('set.restoreSkipped'), issues: r.warnings.map((message) => ({ level: 'warning', message })) });
      }
    });
  }

  /** Read-only integrity check — never writes, so no confirmation is needed. */
  async function handleVerify(file: File) {
    if (verifyRef.current) verifyRef.current.value = '';
    setMsg(null);
    setReport(null);
    const text = await file.text();
    startTransition(async () => {
      try {
        const r = await verifyBackup(text);
        const stamp = r.exportedAt ? new Date(r.exportedAt).toLocaleDateString('en-GB') : '—';
        setReport({
          ok: r.ok,
          headline: r.ok
            ? t('set.verifyOk', { date: stamp, summary: r.summary })
            : t('set.verifyBad', { name: file.name }),
          issues: r.issues,
        });
      } catch (e) {
        setReport({ ok: false, headline: `${t('common.failed')}: ${(e as Error).message.slice(0, 120)}`, issues: [] });
      }
    });
  }

  function handleCSV(kind: 'receipts' | 'expenses' | 'items') {
    setMsg(null);
    startTransition(async () => {
      try {
        const csv = await exportCSV(kind);
        // BOM so Excel reads UTF-8 (Greek vendor names) correctly.
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pharos-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setMsg(`✓ ${kind} CSV downloaded`);
      } catch (e) {
        setMsg(`CSV failed: ${(e as Error).message.slice(0, 80)}`);
      }
    });
  }

  function handleInsuranceExport() {
    setMsg(null);
    startTransition(async () => {
      try {
        const { base64, itemCount, totalValue } = await exportInsuranceBundle();
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pharos-insurance-export-${new Date().toISOString().slice(0, 10)}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        setMsg(t('set.insuranceExportDone', { n: itemCount, total: `${cur()}${totalValue.toFixed(2)}` }));
      } catch (e) {
        setMsg(`Insurance export failed: ${(e as Error).message.slice(0, 80)}`);
      }
    });
  }

  function handleTaxExport() {
    setMsg(null);
    startTransition(async () => {
      try {
        const { base64, itemCount, totalValue } = await exportTaxBundle(taxYear);
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pharos-tax-export-${taxYear}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        setMsg(t('set.taxExportDone', { n: itemCount, total: `${cur()}${totalValue.toFixed(2)}` }));
      } catch (e) {
        setMsg(`Tax export failed: ${(e as Error).message.slice(0, 80)}`);
      }
    });
  }

  const btn =
    'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50';

  return (
    <div className="mt-4 pt-4 border-t border-[color:var(--color-border)]">
      <p className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)] mb-2" style={{ fontFamily: 'var(--font-mono)' }}>
        {t('set.backup')}
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={handleExport} disabled={pending} className={cn(btn, 'text-[color:var(--color-accent)]')}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} {t('set.exportJson')}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={pending} className={cn(btn, 'text-[color:var(--color-cyan)]')}>
          <Upload size={13} /> {t('set.restoreDots')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <button type="button" onClick={() => verifyRef.current?.click()} disabled={pending} className={cn(btn, 'text-[color:var(--color-text-dim)]')} title={t('set.verifyBackupDesc')}>
          <ShieldCheck size={13} /> {t('set.verifyBackup')}
        </button>
        <input
          ref={verifyRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleVerify(e.target.files[0])}
        />
        {msg && (
          <span className={cn('text-[11px]', msg.startsWith('Failed') || msg.includes('failed') ? 'text-[color:var(--color-red)]' : 'text-[color:var(--color-accent)]')} style={{ fontFamily: 'var(--font-mono)' }}>
            {msg}
          </span>
        )}
      </div>
      {report && (
        <div
          className={cn(
            'mt-2 rounded-lg border px-3 py-2 text-[11px]',
            report.ok
              ? 'border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]'
              : 'border-[color:var(--color-red)] bg-[color:var(--color-surface-2)]'
          )}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <p className={report.ok ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]'}>{report.headline}</p>
          {report.issues.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {report.issues.map((issue, i) => (
                <li key={i} className={issue.level === 'error' ? 'text-[color:var(--color-red)]' : 'text-[color:var(--color-gold)]'}>
                  {issue.level === 'error' ? '✕' : '⚠'} {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap mt-2">
        <span className="text-[10px] text-[color:var(--color-text-faint)] mr-1" style={{ fontFamily: 'var(--font-mono)' }}>{t('set.spreadsheetCsv')}</span>
        {(['receipts', 'expenses', 'items'] as const).map((k) => (
          <button key={k} type="button" onClick={() => handleCSV(k)} disabled={pending} className={cn(btn, 'text-[color:var(--color-text-dim)]')}>
            <Download size={12} /> {k}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-[color:var(--color-text-faint)] mt-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
        {t('set.backupNote')}
      </p>
      <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-[color:var(--color-border)]">
        <button type="button" onClick={handleInsuranceExport} disabled={pending} className={cn(btn, 'text-[color:var(--color-purple)]')}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} {t('set.insuranceExport')}
        </button>
      </div>
      <p className="text-[10px] text-[color:var(--color-text-faint)] mt-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
        {t('set.insuranceExportDesc')}
      </p>
      <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-[color:var(--color-border)]">
        <select
          value={taxYear}
          onChange={(e) => setTaxYear(Number(e.target.value))}
          className="text-xs px-2 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {Array.from({ length: 5 }, (_, i) => nowYear - i).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <button type="button" onClick={handleTaxExport} disabled={pending} className={cn(btn, 'text-[color:var(--color-gold)]')}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Landmark size={13} />} {t('set.taxExport')}
        </button>
      </div>
      <p className="text-[10px] text-[color:var(--color-text-faint)] mt-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
        {t('set.taxExportDesc')}
      </p>
    </div>
  );
}

// ─── Store list management (D3) ─────────────────────────────────────────────

function StoresManager({ stores }: { stores: StoreLite[] }) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [showDupes, setShowDupes] = useState(false);
  return (
    <Section title={t('set.storesTitle')} icon={<StoreIcon size={15} />}>
      <p className="text-xs text-[color:var(--color-text-dim)] -mt-1">
        {t('set.storesDesc')}
      </p>
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setShowDupes(true)}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-cyan)] hover:border-[color:var(--color-cyan)] transition-colors"
          title={t('set.findDupStoresTitle')}
        >
          <Copy size={12} /> {t('set.findDuplicates')}
        </button>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-accent)] hover:border-[color:var(--color-accent)] transition-colors"
        >
          <Plus size={12} /> {t('set.addStore')}
        </button>
      </div>
      {adding && <StoreForm onDone={() => setAdding(false)} />}
      <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
        {stores.map((s) => (
          <StoreRow key={s._id} store={s} />
        ))}
        {stores.length === 0 && <p className="text-xs text-[color:var(--color-text-faint)] italic">{t('set.noStores')}</p>}
      </div>
      <StoreDuplicatesModal open={showDupes} onClose={() => setShowDupes(false)} />
    </Section>
  );
}

function StoreRow({ store }: { store: StoreLite }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  if (editing) return <StoreForm store={store} onDone={() => setEditing(false)} />;

  async function del() {
    const ok = await confirm({ title: t('set.deleteStore'), message: t('set.confirmDeleteName', { name: store.name }), confirmLabel: t('common.delete'), danger: true });
    if (ok) startTransition(() => { void deleteStore(store._id!); });
  }

  return (
    <div className="group flex items-center gap-2 bg-[color:var(--color-surface-2)] rounded-lg px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium flex items-center gap-1.5">
          {store.name}
          {store.auto && (
            <span title={t('set.autoReview')} className="text-[9px] text-[color:var(--color-gold)]" style={{ fontFamily: 'var(--font-mono)' }}>
              ⚡ auto
            </span>
          )}
        </div>
        {store.aliases.length > 0 && (
          <div className="text-[10px] text-[color:var(--color-text-faint)] truncate" style={{ fontFamily: 'var(--font-mono)' }}>
            {store.aliases.join(', ')}
          </div>
        )}
      </div>
      {store.url && (
        <a href={store.url} target="_blank" rel="noopener noreferrer" className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-cyan)] shrink-0">
          <ExternalLink size={12} />
        </a>
      )}
      <button onClick={() => setEditing(true)} className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)] shrink-0" aria-label="Edit">
        <Pencil size={12} />
      </button>
      <button onClick={del} disabled={pending} className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] opacity-0 group-hover:opacity-100 transition-all shrink-0" aria-label="Delete">
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function StoreForm({ store, onDone }: { store?: StoreLite; onDone: () => void }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(store?.name ?? '');
  const [aliases, setAliases] = useState((store?.aliases ?? []).join(', '));
  const [url, setUrl] = useState(store?.url ?? '');
  const [returnDays, setReturnDays] = useState(store?.returnWindowDays == null ? '' : String(store.returnWindowDays));
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setErr(null);
    const fd = new FormData();
    if (store?._id) fd.set('id', store._id);
    fd.set('name', name);
    fd.set('aliases', aliases);
    fd.set('url', url);
    fd.set('returnWindowDays', returnDays);
    startTransition(async () => {
      const r = await saveStore(fd);
      if (r.ok) onDone();
      else setErr(r.error ?? t('common.failed'));
    });
  }

  return (
    <div className="bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg p-2.5 space-y-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('set.storeNamePlaceholder')} className={inputClass} />
      <input
        value={aliases}
        onChange={(e) => setAliases(e.target.value)}
        placeholder={t('set.aliasesPlaceholder')}
        className={inputClass}
        style={{ fontFamily: 'var(--font-mono)' }}
      />
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t('set.urlPlaceholder')} className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
      <input
        type="number"
        min="0"
        max="365"
        value={returnDays}
        onChange={(e) => setReturnDays(e.target.value)}
        placeholder={t('set.storeReturnWindowPlaceholder')}
        className={inputClass}
        style={{ fontFamily: 'var(--font-mono)' }}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={pending || !name.trim()}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-accent)] text-black font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} {t('common.save')}
        </button>
        <button onClick={onDone} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)]">
          <X size={12} /> {t('common.cancel')}
        </button>
        {err && (
          <span className="text-[10px] text-[color:var(--color-red)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {err}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Payment cards management ─────────────────────────────────────────────────

const CARD_TYPES = ['mastercard', 'visa', 'amex', 'maestro', 'other'];
const CARD_COLORS = ['#00d4ff', '#00ff88', '#ffd93d', '#a55eea', '#ff4757', '#ff9f43', '#54a0ff'];

function CardsManager({ cards }: { cards: SerializedCard[] }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const confirm = useConfirm();
  const blank = { name: '', last4: '', bank: '', kind: 'credit', type: 'other', color: CARD_COLORS[0], creditLimit: '' };
  const [form, setForm] = useState(blank);
  const set = (p: Partial<typeof blank>) => setForm((f) => ({ ...f, ...p }));

  function openEdit(c?: SerializedCard) {
    if (c) {
      setEditing(c._id);
      setForm({ name: c.name, last4: c.last4 || '', bank: c.bank || '', kind: c.kind || 'credit', type: c.type || 'other', color: c.color || CARD_COLORS[0], creditLimit: String(c.creditLimit || '') });
    } else {
      setEditing('new');
      setForm(blank);
    }
  }
  function save() {
    if (!form.name.trim()) return;
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.set(k, String(v)));
    startTransition(async () => {
      if (editing === 'new') await createCard(fd);
      else if (editing) await updateCard(editing, fd);
      setEditing(null);
    });
  }
  async function remove(c: SerializedCard) {
    const ok = await confirm({ title: t('set.deleteCard'), message: t('set.confirmDeleteName', { name: c.name }), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    startTransition(() => void deleteCard(c._id));
  }

  return (
    <Section title={t('set.cardsTitle')} icon={<CreditCard size={15} />}>
      <div className="space-y-1.5">
        {cards.map((c) => (
          <div key={c._id} className="flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color || '#888' }} />
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium">{c.name}</span>
              <span className="text-[10px] text-[color:var(--color-text-faint)] ml-2" style={{ fontFamily: 'var(--font-mono)' }}>
                {c.type} · {c.kind}{c.last4 ? ` · ••${c.last4}` : ''}
              </span>
            </div>
            <Switch checked={c.active} onChange={(v) => startTransition(() => void toggleCardActive(c._id, v))} />
            <button onClick={() => openEdit(c)} className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)] p-1"><Pencil size={13} /></button>
            <button onClick={() => remove(c)} className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] p-1"><Trash2 size={13} /></button>
          </div>
        ))}
        {cards.length === 0 && <p className="text-xs text-[color:var(--color-text-faint)]">{t('set.noCards')}</p>}
      </div>

      {editing ? (
        <div className="mt-3 p-3 rounded-xl border border-[color:var(--color-border)] space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={t('set.cardNamePlaceholder')} className={inputClass} />
            <input value={form.last4} onChange={(e) => set({ last4: e.target.value.slice(0, 4) })} placeholder={t('set.last4Placeholder')} className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
            <input value={form.bank} onChange={(e) => set({ bank: e.target.value })} placeholder={t('set.bankPlaceholder')} className={inputClass} />
            <input type="number" value={form.creditLimit} onChange={(e) => set({ creditLimit: e.target.value })} placeholder={t('set.creditLimitPlaceholder')} className={inputClass} />
            <select value={form.kind} onChange={(e) => set({ kind: e.target.value })} className={selectClass}>
              <option value="credit">{t('set.credit')}</option>
              <option value="debit">{t('set.debit')}</option>
            </select>
            <select value={form.type} onChange={(e) => set({ type: e.target.value })} className={selectClass}>
              {CARD_TYPES.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[color:var(--color-text-faint)] uppercase mr-1" style={{ fontFamily: 'var(--font-mono)' }}>{t('set.color')}</span>
            {CARD_COLORS.map((col) => (
              <button key={col} onClick={() => set({ color: col })} className={cn('w-5 h-5 rounded-full transition-transform', form.color === col && 'ring-2 ring-white scale-110')} style={{ background: col }} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={pending || !form.name.trim()} className={saveBtn}>{pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {t('set.saveCard')}</button>
            <button onClick={() => setEditing(null)} className={ghostBtn}><X size={13} /> {t('common.cancel')}</button>
          </div>
        </div>
      ) : (
        <button onClick={() => openEdit()} className="mt-3 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-accent)] hover:border-[color:var(--color-accent)]">
          <Plus size={13} /> {t('set.addCard')}
        </button>
      )}
    </Section>
  );
}

// ─── Users & access ───────────────────────────────────────────────────────

function UsersManager({ currentUserId }: { currentUserId: string }) {
  const t = useT();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ username: '', name: '', password: '', role: 'member' });
  const [error, setError] = useState('');
  const confirm = useConfirm();

  const reload = () => startTransition(async () => { setUsers(await listUsers()); setLoading(false); });
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function add() {
    setError('');
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.set(k, v));
    startTransition(async () => {
      const res = await createUser(fd);
      if (res.ok) { setAdding(false); setForm({ username: '', name: '', password: '', role: 'member' }); reload(); }
      else setError(res.error || t('common.failed'));
    });
  }
  async function remove(u: UserRow) {
    const ok = await confirm({ title: t('set.deleteUser'), message: t('set.confirmDeleteUser', { name: u.username }), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    startTransition(async () => { const r = await deleteUser(u.id); if (!r.ok) setError(r.error || t('common.failed')); reload(); });
  }
  function changeRole(u: UserRow, role: Role) {
    if (role === u.role) return;
    startTransition(async () => { const r = await setUserRole(u.id, role); if (!r.ok) setError(r.error || t('common.failed')); reload(); });
  }
  function resetPwd(u: UserRow) {
    const pwd = window.prompt(t('set.resetPwdPrompt', { name: u.username }));
    if (!pwd) return;
    startTransition(async () => { const r = await changeUserPassword(u.id, pwd); setError(r.ok ? '' : (r.error || t('common.failed'))); });
  }

  return (
    <Section title={t('set.usersTitle')} icon={<Users size={15} />}>
      <p className="text-[11px] text-[color:var(--color-text-dim)] -mt-1 mb-1">
        {t('set.usersDesc')}
      </p>
      {loading ? (
        <p className="text-xs text-[color:var(--color-text-faint)]">{t('common.loading')}</p>
      ) : (
        <div className="space-y-1.5">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2">
              <span className={cn('w-2 h-2 rounded-full shrink-0', u.role === 'admin' ? 'bg-[color:var(--color-accent)]' : u.role === 'viewer' ? 'bg-[color:var(--color-cyan)]' : 'bg-[color:var(--color-text-faint)]')} />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium">{u.username}</span>
                {u.name && <span className="text-xs text-[color:var(--color-text-dim)] ml-2">{u.name}</span>}
                {u.id === currentUserId && <span className="text-[10px] text-[color:var(--color-accent)] ml-2" style={{ fontFamily: 'var(--font-mono)' }}>{t('set.you')}</span>}
              </div>
              {/* P31: three roles do not fit a two-way toggle, so the chip became a select. */}
              <select value={u.role} onChange={(e) => changeRole(u, e.target.value as Role)} title={t('set.toggleRole')}
                style={{ fontFamily: 'var(--font-mono)' }}
                className={cn('text-[10px] px-2 py-0.5 rounded-full border uppercase bg-transparent cursor-pointer',
                  u.role === 'admin' ? 'border-[color:var(--color-accent)] text-[color:var(--color-accent)]'
                    : u.role === 'viewer' ? 'border-[color:var(--color-cyan)] text-[color:var(--color-cyan)]'
                    : 'border-[color:var(--color-border)] text-[color:var(--color-text-dim)]')}>
                <option value="viewer">{t('set.viewer')}</option>
                <option value="member">{t('set.member')}</option>
                <option value="admin">{t('set.admin')}</option>
              </select>
              <button onClick={() => resetPwd(u)} className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)] p-1" title={t('set.resetPassword')}><KeyRound size={13} /></button>
              {u.id !== currentUserId && <button onClick={() => remove(u)} className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] p-1" title={t('common.delete')}><Trash2 size={13} /></button>}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-[color:var(--color-red)] mt-2">{error}</p>}

      {adding ? (
        <div className="mt-3 p-3 rounded-xl border border-[color:var(--color-border)] space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder={t('set.usernamePlaceholder')} className={inputClass} />
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('set.displayNamePlaceholder')} className={inputClass} />
            <input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} type="password" placeholder={t('set.passwordPlaceholder')} className={inputClass} />
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className={selectClass}>
              <option value="viewer">{t('set.viewer')}</option>
              <option value="member">{t('set.member')}</option>
              <option value="admin">{t('set.admin')}</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={add} disabled={pending} className={saveBtn}>{pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {t('set.createUser')}</button>
            <button onClick={() => { setAdding(false); setError(''); }} className={ghostBtn}><X size={13} /> {t('common.cancel')}</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-3 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-accent)] hover:border-[color:var(--color-accent)]">
          <UserPlus size={13} /> {t('set.addUser')}
        </button>
      )}
    </Section>
  );
}

/** "Change my own password" — available to every signed-in user (incl. members). */
function SelfPasswordCard() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setMsg(null);
    startTransition(async () => {
      const r = await changeOwnPassword(oldPwd, newPwd);
      if (r.ok) { setMsg({ ok: true, text: t('set.passwordChanged') }); setOldPwd(''); setNewPwd(''); setOpen(false); }
      else setMsg({ ok: false, text: r.error || t('common.failed') });
    });
  }

  return (
    <Section title={t('set.yourPassword')} icon={<KeyRound size={15} />}>
      {open ? (
        <div className="space-y-2.5">
          <input value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} type="password" placeholder={t('set.currentPwdPlaceholder')} className={inputClass} />
          <input value={newPwd} onChange={(e) => setNewPwd(e.target.value)} type="password" placeholder={t('set.newPwdPlaceholder')} className={inputClass} />
          <div className="flex items-center gap-2">
            <button onClick={submit} disabled={pending} className={saveBtn}>{pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {t('set.update')}</button>
            <button onClick={() => { setOpen(false); setMsg(null); }} className={ghostBtn}><X size={13} /> {t('common.cancel')}</button>
            {msg && <span className={cn('text-[11px]', msg.ok ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]')}>{msg.text}</span>}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <span className="text-xs text-[color:var(--color-text-dim)]">{t('set.changePasswordDesc')}</span>
          <div className="flex items-center gap-2">
            {msg && <span className={cn('text-[11px]', msg.ok ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]')}>{msg.text}</span>}
            <button onClick={() => setOpen(true)} className={ghostBtn}><KeyRound size={13} /> {t('set.changePassword')}</button>
          </div>
        </div>
      )}
    </Section>
  );
}

/** Which sub-form the "Two-factor authentication" card is currently showing. Mirrors
 *  components/saas/AccountSettingsPanel.tsx's MfaStage exactly (same flow, same rules) — the
 *  self-hosted account settings and the SaaS account settings are now the same feature over two
 *  different models. */
type MfaStage = 'idle' | 'need-password-to-start' | 'enrolling' | 'need-password-to-disable' | 'recovery-codes';

/** "Set up / manage two-factor authentication for my own account" (P79) — the self-hosted
 *  counterpart of AccountSettingsPanel.tsx's MFA section, wired to server actions instead of
 *  fetch()+routes (same idiom as SelfPasswordCard above). Loads its own status on mount, same
 *  pattern as UpdateChecker, so a slow read never blocks the rest of Settings. */
function SelfMfaCard() {
  const t = useT();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [stage, setStage] = useState<MfaStage>('idle');
  const [reauthPassword, setReauthPassword] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [uri, setUri] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getSelfMfaStatus().then(setStatus).catch(() => {});
  }, []);

  function resetFlow() {
    setStage('idle');
    setReauthPassword('');
    setDisablePassword('');
    setCode('');
    setSecret('');
    setUri('');
    setError('');
  }

  function clickStart() {
    setError('');
    setNotice('');
    if (status?.enabled) {
      setStage('need-password-to-start');
    } else {
      beginEnrollment('');
    }
  }

  function beginEnrollment(password: string) {
    setError('');
    startTransition(async () => {
      const res = await beginSelfMfaEnrollment(password);
      if (res.ok && res.secret && res.uri) {
        setSecret(res.secret);
        setUri(res.uri);
        setStage('enrolling');
      } else {
        setError(describeMfaError(400, res.error));
      }
    });
  }

  function confirmEnrollment() {
    setError('');
    startTransition(async () => {
      const res = await confirmSelfMfaEnrollment(code);
      if (res.ok && res.recoveryCodes) {
        setRecoveryCodes(res.recoveryCodes);
        setStage('recovery-codes');
        setStatus((s) => (s ? { ...s, enabled: true, pending: false } : s));
      } else {
        setError(describeMfaError(400, res.error));
      }
    });
  }

  function finishRecoveryCodes() {
    setRecoveryCodes(null);
    resetFlow();
    setNotice(t('set.twoFactorEnabledNotice'));
  }

  function confirmDisable() {
    setError('');
    startTransition(async () => {
      const res = await disableSelfMfa(disablePassword);
      if (res.ok) {
        resetFlow();
        setStatus((s) => (s ? { ...s, enabled: false, pending: false } : s));
        setNotice(t('set.twoFactorDisabledNotice'));
      } else {
        setError(res.error || t('common.failed'));
      }
    });
  }

  return (
    <Section title={t('set.twoFactor')} icon={<ShieldCheck size={15} />}>
      {status?.enabled && stage === 'idle' && (
        <span className="inline-block mb-1 text-[10px] uppercase tracking-wider text-[color:var(--color-accent)] border border-[color:var(--color-accent)]/40 rounded-full px-1.5 py-0.5">
          {t('set.twoFactorEnabled')}
        </span>
      )}

      {error && <p className="text-xs text-[color:var(--color-red)]">{error}</p>}
      {notice && !error && stage === 'idle' && <p className="text-xs text-[color:var(--color-accent)]">{notice}</p>}

      {status && !status.cryptoReady && <p className="text-xs text-[color:var(--color-text-dim)]">{t('set.twoFactorUnavailable')}</p>}

      {status?.cryptoReady && stage === 'idle' && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-[color:var(--color-text-dim)]">{status.enabled ? t('set.twoFactorDescOn') : t('set.twoFactorDescOff')}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={clickStart} disabled={pending} className={ghostBtn}>
              <ShieldCheck size={13} /> {status.enabled ? t('set.twoFactorReplace') : t('set.twoFactorEnable')}
            </button>
            {status.enabled && (
              <button
                onClick={() => {
                  setError('');
                  setStage('need-password-to-disable');
                }}
                disabled={pending}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-red)]/50 text-[color:var(--color-red)] hover:bg-[color:var(--color-red)]/10 transition-colors disabled:opacity-50"
              >
                {t('set.twoFactorDisable')}
              </button>
            )}
          </div>
        </div>
      )}

      {stage === 'need-password-to-start' && (
        <div className="space-y-2.5">
          <p className="text-xs text-[color:var(--color-text-dim)]">{t('set.twoFactorPasswordToStart')}</p>
          <input value={reauthPassword} onChange={(e) => setReauthPassword(e.target.value)} type="password" autoComplete="current-password" placeholder={t('set.currentPwdPlaceholder')} className={inputClass} />
          <div className="flex items-center gap-2">
            <button onClick={() => beginEnrollment(reauthPassword)} disabled={pending || !mfaPasswordReady(reauthPassword)} className={saveBtn}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {pending ? t('set.twoFactorContinuing') : t('set.twoFactorContinue')}
            </button>
            <button onClick={resetFlow} disabled={pending} className={ghostBtn}><X size={13} /> {t('common.cancel')}</button>
          </div>
        </div>
      )}

      {stage === 'enrolling' && (
        <div className="space-y-2.5">
          <p className="text-xs text-[color:var(--color-text-dim)]">{t('set.twoFactorEnrollHint')}</p>
          {uri && <QrCode value={uri} label={t('set.twoFactorQrAlt')} />}
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3">
            <p className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{t('set.twoFactorManualKey')}</p>
            <p className="mt-1 select-all break-all text-sm" style={{ fontFamily: 'var(--font-mono)' }}>{secret}</p>
          </div>
          <label className="block text-xs">
            <span className="text-[color:var(--color-text-dim)]">{t('set.twoFactorCode')}</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className={cn(inputClass, 'mt-1 max-w-[10rem] text-center tracking-[0.3em]')}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </label>
          <div className="flex items-center gap-2">
            <button onClick={confirmEnrollment} disabled={pending || !mfaCodeReady(code)} className={saveBtn}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {pending ? t('set.twoFactorVerifying') : t('set.twoFactorConfirm')}
            </button>
            <button onClick={resetFlow} disabled={pending} className={ghostBtn}><X size={13} /> {t('common.cancel')}</button>
          </div>
        </div>
      )}

      {stage === 'need-password-to-disable' && (
        <div className="space-y-2.5">
          <p className="text-xs text-[color:var(--color-text-dim)]">{t('set.twoFactorPasswordToDisable')}</p>
          <input value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} type="password" autoComplete="current-password" placeholder={t('set.currentPwdPlaceholder')} className={inputClass} />
          <div className="flex items-center gap-2">
            <button
              onClick={confirmDisable}
              disabled={pending || !mfaPasswordReady(disablePassword)}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-[color:var(--color-red)]/15 border border-[color:var(--color-red)]/50 text-[color:var(--color-red)] font-semibold hover:bg-[color:var(--color-red)]/25 transition-colors disabled:opacity-50"
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} {pending ? t('set.twoFactorDisabling') : t('set.twoFactorDisable')}
            </button>
            <button onClick={resetFlow} disabled={pending} className={ghostBtn}><X size={13} /> {t('common.cancel')}</button>
          </div>
        </div>
      )}

      {stage === 'recovery-codes' && recoveryCodes && (
        <div className="space-y-2.5">
          <div className="rounded-lg border border-[color:var(--color-gold)]/45 bg-[color:var(--color-gold)]/10 px-3 py-2 text-xs text-[color:var(--color-gold)]">
            {t('set.twoFactorRecoveryWarning')}
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-sm" style={{ fontFamily: 'var(--font-mono)' }}>
            {recoveryCodes.map((c) => (
              <span key={c} className="select-all">{c}</span>
            ))}
          </div>
          <button onClick={finishRecoveryCodes} className={saveBtn}><Check size={13} /> {t('set.twoFactorRecoverySaved')}</button>
        </div>
      )}
    </Section>
  );
}

// ─── Editable dropdown lists (taxonomies) ─────────────────────────────────────

function ListsManager({ lists }: { lists: ListEditorEntry[] }) {
  const t = useT();
  return (
    <Section title={t('set.dropdownLists')} icon={<SlidersHorizontal size={15} />}>
      <p className="text-[11px] text-[color:var(--color-text-dim)] -mt-1 mb-1">{t('set.dropdownListsDesc')}</p>
      <div className="space-y-3">
        {lists.map((l) => <ListEditor key={l.key} entry={l} />)}
      </div>
    </Section>
  );
}

function ListEditor({ entry }: { entry: ListEditorEntry }) {
  const t = useT();
  const [values, setValues] = useState<string[]>(entry.values);
  const [input, setInput] = useState('');
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function add() {
    const v = input.trim().toLowerCase().replace(/\s+/g, '-');
    if (v && !values.includes(v)) setValues((s) => [...s, v]);
    setInput('');
  }
  function save(next: string[]) {
    startTransition(async () => {
      await saveList(entry.key, next);
      setMsg(t('common.savedOk'));
      setTimeout(() => setMsg(null), 1800);
    });
  }
  return (
    <div className="rounded-xl border border-[color:var(--color-border)] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{entry.label}</span>
        <span className="text-[10px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{entry.where}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map((v) => (
          <span key={v} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {v}
            {v !== 'other' && <button onClick={() => setValues((s) => s.filter((x) => x !== v))} className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]"><X size={11} /></button>}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder={t('set.addCategoryPlaceholder')} className={cn(inputClass, 'text-xs py-1.5')} />
        <button onClick={add} className={ghostBtn}><Plus size={13} /></button>
        <button onClick={() => save(values)} disabled={pending} className={saveBtn}>{pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {t('common.save')}</button>
        <button onClick={() => { setValues(entry.default); save(entry.default); }} disabled={pending} title={t('set.resetDefault')} className={ghostBtn}><RotateCcw size={13} /></button>
        {msg && <span className="text-[11px] text-[color:var(--color-accent)]" style={{ fontFamily: 'var(--font-mono)' }}>{msg}</span>}
      </div>
    </div>
  );
}

/** Per-property / per-context ledger tags (P34). Unlike category lists, spaces
 *  default to empty (feature dormant), keep their casing, and have no forced entry. */
function SpacesManager({ spaces }: { spaces: string[] }) {
  const t = useT();
  const [values, setValues] = useState<string[]>(spaces);
  const [input, setInput] = useState('');
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function add() {
    const v = input.trim().replace(/\s+/g, ' ');
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) setValues((s) => [...s, v]);
    setInput('');
  }
  function save(next: string[]) {
    startTransition(async () => {
      await saveSpaces(next);
      setMsg(t('common.savedOk'));
      setTimeout(() => setMsg(null), 1800);
    });
  }
  return (
    <Section title={t('set.spaces')} icon={<MapPin size={15} />}>
      <p className="text-[11px] text-[color:var(--color-text-dim)] -mt-1 mb-2">{t('set.spacesDesc')}</p>
      <div className="rounded-xl border border-[color:var(--color-border)] p-3">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {values.length === 0 && <span className="text-[11px] text-[color:var(--color-text-faint)] italic">{t('set.spacesEmpty')}</span>}
          {values.map((v) => (
            <span key={v} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)]" style={{ fontFamily: 'var(--font-mono)' }}>
              {v}
              <button onClick={() => setValues((s) => s.filter((x) => x !== v))} className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)]"><X size={11} /></button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder={t('set.spacesPlaceholder')} className={cn(inputClass, 'text-xs py-1.5')} />
          <button onClick={add} className={ghostBtn}><Plus size={13} /></button>
          <button onClick={() => save(values)} disabled={pending} className={saveBtn}>{pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {t('common.save')}</button>
          {msg && <span className="text-[11px] text-[color:var(--color-accent)]" style={{ fontFamily: 'var(--font-mono)' }}>{msg}</span>}
        </div>
      </div>
    </Section>
  );
}

const selectClass =
  'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)]';
const inputClass =
  'w-full bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--color-accent)]';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="block text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider mb-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl p-5">
      <h2
        className="flex items-center gap-2 text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-[0.15em] mb-4"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {icon}
        {title}
      </h2>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[color:var(--color-text-faint)]">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[color:var(--color-surface-2)] rounded-lg px-3 py-2 text-center">
      <div className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
        {value}
      </div>
      <div className="text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)' }}>
        {label}
      </div>
    </div>
  );
}
