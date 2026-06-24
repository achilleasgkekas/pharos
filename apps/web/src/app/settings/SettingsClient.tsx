'use client';
import { useState, useTransition, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sun, Moon, Sparkles, Database, CreditCard, ExternalLink, Server, Cloud, Download, Upload, Loader2, Check, Store as StoreIcon, Pencil, Trash2, Plus, X, Copy, ShieldCheck, SlidersHorizontal, Bell, MessageSquareCode, RotateCcw, ChevronDown, Globe, HardDrive, FolderTree, RefreshCw, Plug, Users, UserPlus, KeyRound, Star } from 'lucide-react';
import { useTheme, type Theme } from '@/components/ThemeProvider';
import { cur } from '@/lib/money';
import { cn } from '@/components/ui/cn';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { saveAiConfig, pullOllamaModel, testAnthropic, saveStore, deleteStore, setAiConfirmBulk, exportData, importData, exportCSV, saveBudgets, setAiEnabled, setAiFeature, fetchProviderModels } from './actions';
import { AI_FEATURES } from '@/lib/aiFeatures';
import { PROVIDER_RECOMMEND, SCRAPER_RECOMMEND, type FetchedModel } from '@/lib/aiModels';
import { StoreDuplicatesModal } from './StoreDuplicatesModal';
import type { StoreLite } from '@/lib/storeService';
import type { AppSettings } from '@/lib/appSettings';
import { saveDefaults, saveNtfy, sendTestNtfy, runAlertChecks, savePrompt, resetPrompt, saveScraperAi, saveStorageConfig, testRemoteConnection, syncToRemote, getSyncManifest, syncOnedriveBatch, saveList, getTrash, restoreFromTrash, purgeFromTrash, emptyTrash, startOnedriveAuth, pollOnedriveAuth, disconnectOnedriveAccount, testOnedriveConnection, type PromptEditorEntry, type ScraperAiConfig, type StorageInfo, type ListEditorEntry, type TrashRow } from './actions';
import { createCard, updateCard, deleteCard, toggleCardActive } from '@/app/statements/cards';
import { listUsers, createUser, deleteUser, setUserRole, changeUserPassword, changeOwnPassword, type UserRow } from './users.actions';
import { McpManager } from './McpManager';
import { RecomputePricesButton } from './RecomputePricesButton';
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
  counts: { items: number; receipts: number; statements: number; subscriptions: number; cards: number };
  ollamaUp: boolean;
  stores: StoreLite[];
  ai: AiInfo;
  settings: AppSettings;
  prompts: PromptEditorEntry[];
  scraperAi: ScraperAiConfig;
  storage: StorageInfo;
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

type TabId = 'general' | 'money' | 'ai' | 'storage' | 'data' | 'notifications' | 'users';

type CurrentUser = { id: string; name: string; role: 'admin' | 'member' };

const TABS: { id: TabId; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
  { id: 'general', label: 'General', icon: <SlidersHorizontal size={15} /> },
  { id: 'money', label: 'Money', icon: <CreditCard size={15} /> },
  { id: 'ai', label: 'AI', icon: <Sparkles size={15} /> },
  { id: 'storage', label: 'Storage & backup', icon: <HardDrive size={15} /> },
  { id: 'data', label: 'Stores & lists', icon: <StoreIcon size={15} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={15} /> },
  { id: 'users', label: 'Users', icon: <Users size={15} />, adminOnly: true },
];

const TAB_KEY: Record<TabId, TKey> = {
  general: 'set.tabGeneral',
  money: 'set.tabMoney',
  ai: 'set.tabAi',
  storage: 'set.tabStorage',
  data: 'set.tabData',
  notifications: 'set.tabNotifications',
  users: 'set.tabUsers',
};

export function SettingsClient({ info, currentUser }: { info: Info; currentUser: CurrentUser }) {
  const { theme, setTheme } = useTheme();
  const t = useT();
  const [tab, setTab] = useState<TabId>('general');
  const isAdmin = currentUser.role === 'admin';
  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);
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

              <SelfPasswordCard />

              <Section title={t('set.about')}>
                <Row label={t('set.version')}>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>v0.1.0 dev</span>
                </Row>
                <Row label={t('set.host')}>
                  <span className="text-[color:var(--color-text-dim)]">Mac mini M4 · Docker</span>
                </Row>
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
              <CardsManager cards={info.cardList} />
            </>
          )}

          {tab === 'ai' && (
            <>
              <AiMasterAndFeatures ai={info.ai} canEdit={isAdmin} />
              <AiSettings ai={info.ai} ollamaUp={info.ollamaUp} />
              <ScraperAiSettings scraperAi={info.scraperAi} installed={info.ai.installed} hasAnthropicKey={info.ai.hasKey} />
              <AiPromptsManager prompts={info.prompts} />
              <Section title="Mobile / MCP" icon={<Plug size={15} />}>
                <McpManager />
              </Section>
            </>
          )}


          {tab === 'storage' && (
            <>
              <StorageManager storage={info.storage} counts={info.counts} />
              <Section title="Data" icon={<Database size={15} />}>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <Stat label="Items" value={info.counts.items} />
                  <Stat label="Receipts" value={info.counts.receipts} />
                  <Stat label="Statements" value={info.counts.statements} />
                  <Stat label="Subs" value={info.counts.subscriptions} />
                  <Stat label="Cards" value={info.counts.cards} />
                </div>
                <BackupRestore />
                <RecomputePricesButton />
              </Section>
              <TrashManager />
            </>
          )}

          {tab === 'data' && (
            <>
              <StoresManager stores={info.stores} />
              <ListsManager lists={info.lists} />
            </>
          )}

          {tab === 'notifications' && <NotificationsManager settings={info.settings} />}

          {tab === 'users' && isAdmin && <UsersManager currentUserId={currentUser.id} />}
        </div>
      </div>
    </main>
  );
}

// ─── AI master switch + per-feature toggles ─────────────────────────────────

function AiStatusChip({ status }: { status: 'ready' | 'no-provider' | 'disabled' }) {
  const map = {
    ready: { label: 'ready', cls: 'text-[color:var(--color-accent)] border-[color:var(--color-accent)]' },
    'no-provider': { label: 'no provider', cls: 'text-[color:var(--color-gold)] border-[color:var(--color-gold)]' },
    disabled: { label: 'off', cls: 'text-[color:var(--color-text-faint)] border-[color:var(--color-border)]' },
  }[status];
  return (
    <span className={cn('text-[9px] uppercase px-1.5 py-0.5 rounded-full border', map.cls)} style={{ fontFamily: 'var(--font-mono)' }}>
      {map.label}
    </span>
  );
}

function AiMasterAndFeatures({ ai, canEdit }: { ai: AiInfo; canEdit: boolean }) {
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
    <Section title="AI features" icon={<Sparkles size={15} />}>
      <p className="text-[11px] text-[color:var(--color-text-dim)] -mt-1 mb-1">
        The app works fully without AI. Turn the whole engine off, or pick exactly which features use it.
      </p>

      <div className="flex items-center justify-between rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2.5 mb-3">
        <div>
          <div className="text-sm font-medium">Enable AI features</div>
          <div className="text-xs text-[color:var(--color-text-faint)]">Master switch for everything below.</div>
        </div>
        {canEdit ? (
          <Switch checked={enabled} onChange={toggleMaster} />
        ) : (
          <span className="text-xs text-[color:var(--color-text-faint)]">{enabled ? 'On' : 'Off'}</span>
        )}
      </div>

      <div className={cn('space-y-3', !enabled && 'opacity-50 pointer-events-none')}>
        {areas.map((area) => (
          <div key={area}>
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)] mb-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
              {area}
            </div>
            <div className="space-y-1.5">
              {AI_FEATURES.filter((f) => f.area === area).map((f) => (
                <div key={f.key} className="flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium flex items-center gap-2">
                      {f.label}
                      <AiStatusChip status={statusOf(f.key)} />
                    </div>
                    <div className="text-xs text-[color:var(--color-text-faint)]">{f.description}</div>
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
          ⚠ No AI provider is reachable yet. Configure one below for these features to work.
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
      else setErr(r.error || 'Failed to load models');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Field label="Model">
      <input value={model} onChange={(e) => onModel(e.target.value)} className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <button
          type="button"
          onClick={load}
          disabled={loading || !canLoad}
          className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-accent)] hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Load models
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
        {!canLoad && <span className="text-[10px] text-[color:var(--color-text-faint)]">add a key to load models</span>}
      </div>
      {recommend && (
        <p className="text-[10px] text-[color:var(--color-text-faint)] mt-1.5">
          Recommended: <span className="text-[color:var(--color-text-dim)]" style={{ fontFamily: 'var(--font-mono)' }}>{recommend.model}</span> — {recommend.reason}
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
            $ = input/output per 1M tokens · approximate (OpenRouter is live)
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
  return (
    <div className="space-y-3 pt-1">
      <Field label={`API key ${hasKey ? '(saved ✓ — leave blank to keep)' : ''}`}>
        <input
          type="password"
          value={keyValue}
          onChange={(e) => onKey(e.target.value)}
          placeholder={hasKey ? '••••••••••••  (saved)' : keyPlaceholder}
          autoComplete="off"
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
      await saveAiConfig(fd);
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
    <Section title="AI engine" icon={<Sparkles size={15} />}>
      {/* Provider toggle */}
      <Row label="Provider">
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
          No API key saved yet — parsing falls back to Ollama until you add one.
        </p>
      )}
      {provider !== 'ollama' && provider !== 'anthropic' && (
        <p className="text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>
          Note: the AI command bar (navbar) still needs Anthropic — this provider runs the parsing (receipts, statements, products).
        </p>
      )}

      {/* Local (Ollama) panel */}
      {provider === 'ollama' && (
        <div className="space-y-3 pt-1">
          <Row label="Status">
            <span className={ollamaUp ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-red)]'}>
              ● {ollamaUp ? 'online' : 'offline / model not installed'}
            </span>
          </Row>

          <Field label="Server URL (same machine or anywhere on the network)">
            <input
              value={ollamaHost}
              onChange={(e) => setOllamaHost(e.target.value)}
              placeholder="http://localhost:11434"
              className={inputClass}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <p className="text-[10px] text-[color:var(--color-text-faint)] mt-1" style={{ fontFamily: 'var(--font-mono)' }}>
              e.g. http://192.168.10.5:11434 for an Ollama on another box. Blank → the OLLAMA_HOST env.
            </p>
          </Field>

          <Field label="Text model (statements, specs)">
            {installedNames.length > 0 ? (
              <select value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} className={selectClass}>
                {!installedNames.includes(ollamaModel) && <option value={ollamaModel}>{ollamaModel} (not installed)</option>}
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

          <Field label="Vision model (receipts, card scan)">
            {installedNames.length > 0 ? (
              <select value={visionModel} onChange={(e) => setVisionModel(e.target.value)} className={selectClass}>
                {!installedNames.includes(visionModel) && <option value={visionModel}>{visionModel} (not installed)</option>}
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
                ⚠ This model can&apos;t read images — pick qwen2.5vl / minicpm-v / llava.
              </p>
            )}
          </Field>

          <Field label="Download a model">
            <div className="flex gap-1.5">
              <input
                value={pullName}
                onChange={(e) => setPullName(e.target.value)}
                placeholder="e.g. qwen2.5vl:7b"
                className={inputClass}
                style={{ fontFamily: 'var(--font-mono)' }}
              />
              <button
                type="button"
                onClick={() => doPull()}
                disabled={pending || !pullName.trim()}
                className="flex items-center gap-1.5 shrink-0 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-accent)] hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50"
              >
                {pending ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Download
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
              Receipts/cards need a vision model (qwen2.5vl / minicpm-v / llava). Or run{' '}
              <code className="text-[color:var(--color-cyan)]">ollama pull &lt;name&gt;</code> in a terminal.
            </p>
          </Field>
        </div>
      )}

      {/* Anthropic panel */}
      {provider === 'anthropic' && (
        <div className="space-y-3 pt-1">
          <Field label={`API key ${ai.hasKey ? '(saved ✓ — leave blank to keep)' : ''}`}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={ai.hasKey ? '••••••••••••  (saved)' : 'sk-ant-...'}
              autoComplete="off"
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
              Test connection
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
            Used for receipts, statements & product specs. Images + text both supported by Claude.
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
          hint="Pick a vision-capable model (gpt-4o / gpt-4o-mini) so receipt images parse too."
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
          hint="Gemini Flash models read images natively — good cheap default."
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
          hint="One key, every model — use provider/model ids from openrouter.ai/models."
        />
      )}

      {/* Custom OpenAI-compatible server panel */}
      {provider === 'custom' && (
        <div className="space-y-3 pt-1">
          <Field label="Base URL (OpenAI-compatible)">
            <input
              value={customBaseUrl}
              onChange={(e) => setCustomBaseUrl(e.target.value)}
              placeholder="http://localhost:1234/v1"
              className={inputClass}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <p className="text-[10px] text-[color:var(--color-text-faint)] mt-1" style={{ fontFamily: 'var(--font-mono)' }}>
              Works with LM Studio, Groq, Mistral, DeepSeek, vLLM… anything speaking the OpenAI chat API.
            </p>
          </Field>
          <CloudKeyModel
            provider="custom"
            baseUrl={customBaseUrl}
            hasKey={ai.hasCustomKey}
            keyValue={customKey}
            onKey={setCustomKey}
            keyPlaceholder="(optional for local servers)"
            model={customModel}
            onModel={setCustomModel}
            suggestions={[]}
            hint="Model id exactly as the server expects it."
          />
        </div>
      )}

      {/* Cost guard toggle (saved instantly, independent of the form) */}
      <div className="pt-3 border-t border-[color:var(--color-border)] mt-1">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-[color:var(--color-gold)]" /> Confirm before bulk AI
            </p>
            <p className="text-[10px] text-[color:var(--color-text-faint)] mt-0.5">
              Shows a cost estimate and asks before starting a bulk job — guards against accidental cloud charges.
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
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save AI settings
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
    <Section title="Scraper AI" icon={<Globe size={15} />}>
      <p className="text-[11px] text-[color:var(--color-text-dim)] -mt-1 mb-1">
        The price scraper runs on its own schedule (every 6h). Give it a lighter/cheaper model than the rest of the app — price extraction is a simple text task.
      </p>
      <Row label="Provider">
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
        <Field label="Scraper model">
          {installedNames.length > 0 ? (
            <select value={model} onChange={(e) => setModel(e.target.value)} className={selectClass}>
              <option value="">Default (OLLAMA_MODEL env)</option>
              {!installedNames.includes(model) && model && <option value={model}>{model} (not installed)</option>}
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
            Empty → falls back to the scraper&apos;s OLLAMA_MODEL env. A small text model (e.g. qwen2.5:7b) is plenty.
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
            ⚠ Uses the Anthropic key from the AI engine above. Every 6h pass hits the API per link — prefer a cheap model (Haiku) or keep this Local.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-[color:var(--color-border)] mt-1">
        <button type="button" onClick={save} disabled={pending} className={saveBtn}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save scraper AI
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
  return (
    <Section title="AI prompts" icon={<MessageSquareCode size={15} />}>
      <p className="text-[11px] text-[color:var(--color-text-dim)] -mt-1 mb-1">
        Every AI instruction the app sends. Edit one to tune extraction; reset any to restore the built-in default.
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
      setMsg('Saved ✓');
      setTimeout(() => setMsg(null), 2000);
    });
  }

  async function reset() {
    const ok = await confirm({
      title: 'Reset to default?',
      message: `Restore the built-in "${entry.label}" prompt? Your custom version will be lost.`,
      confirmLabel: 'Reset',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      await resetPrompt(entry.key);
      setText(entry.defaultText);
      setOverridden(false);
      setMsg('Reset ✓');
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
                edited
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
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
            </button>
            <button type="button" onClick={reset} disabled={pending} className={ghostBtn}>
              <RotateCcw size={13} /> Reset to default
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
      setStatus('Waiting for you to sign in…');
      pollRef.current = setInterval(async () => {
        const p = await pollOnedriveAuth(clientId, r.deviceCode!);
        if (p.status === 'ok') {
          if (pollRef.current) clearInterval(pollRef.current);
          setConnected(true); setAcct(p.account || ''); setCode(null); setStatus('Connected ✓');
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
          Connected{acct ? ` as ${acct}` : ''} · uploads go to <code className="text-[color:var(--color-cyan)]">/Apps/Pharos</code>
        </span>
        <button onClick={disconnect} disabled={pending} className="text-[11px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] disabled:opacity-50">disconnect</button>
      </div>
    );
  }

  return (
    <div className="pt-1 space-y-3">
      {!code ? (
        <>
          <p className="text-[11px] text-[color:var(--color-text-dim)]">
            No setup needed — click below and sign in with your Microsoft account. (Consent shows as &quot;Microsoft Graph Command Line Tools&quot;.)
          </p>
          <button onClick={connect} disabled={pending} className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-[color:var(--color-accent)] text-black font-semibold hover:opacity-90 disabled:opacity-50">
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Cloud size={13} />} Connect OneDrive
          </button>

          <div>
            <button onClick={() => setAdvanced((s) => !s)} className="text-[10px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-cyan)]">
              {advanced ? '▾' : '▸'} Use your own Azure app (optional — branded consent)
            </button>
            {advanced && (
              <div className="mt-2 space-y-2">
                <ol className="text-[10px] text-[color:var(--color-text-faint)] space-y-0.5 list-decimal pl-4 leading-relaxed">
                  <li><a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noreferrer" className="text-[color:var(--color-cyan)] hover:underline">Azure → App registrations</a> → New registration → personal accounts, no redirect URI.</li>
                  <li>Authentication → Allow public client flows → Yes → Save. Copy the client id.</li>
                </ol>
                <Field label="Application (client) ID">
                  <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
                </Field>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="bg-[color:var(--color-surface-2)] border border-[color:var(--color-cyan)]/40 rounded-lg px-3 py-3 text-xs space-y-1.5">
          <p>1. Open <a href={code.url} target="_blank" rel="noreferrer" className="text-[color:var(--color-cyan)] hover:underline font-semibold">{code.url}</a></p>
          <p>2. Enter this code: <span className="text-[color:var(--color-accent)] font-bold text-base tracking-widest" style={{ fontFamily: 'var(--font-mono)' }}>{code.userCode}</span></p>
          <p className="text-[10px] text-[color:var(--color-text-faint)] flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> Waiting… this connects automatically once you finish.</p>
        </div>
      )}
      {status && <p className={cn('text-[11px]', status.startsWith('✗') ? 'text-[color:var(--color-red)]' : 'text-[color:var(--color-accent)]')} style={{ fontFamily: 'var(--font-mono)' }}>{status}</p>}
    </div>
  );
}

function StorageManager({ storage, counts }: { storage: StorageInfo; counts: Info['counts'] }) {
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
      setSyncing(false);
      return;
    }
    // SMB/FTP: single connection, one-shot.
    setMsg('Syncing… (this can take a while)');
    startTransition(async () => {
      const r = await syncToRemote();
      if (r.ok) setMsg(`Synced ${r.pushed} file(s)${r.skipped ? ` · ${r.skipped} skipped` : ''} ✓`);
      else setMsg(`Synced ${r.pushed}, ${r.failed} failed${r.error ? `: ${r.error}` : ''}${r.errors[0] ? ` — ${r.errors[0]}` : ''}`);
    });
  }

  return (
    <Section title="File storage" icon={<HardDrive size={15} />}>
      <p className="text-[11px] text-[color:var(--color-text-dim)] -mt-1 mb-1">
        Files are always kept locally (fast serving + AI). Optionally mirror an organized copy to your NAS over SMB/FTP, or to OneDrive.
      </p>

      <Row label="Backend">
        <div className="flex gap-1.5 flex-wrap">
          {([
            { v: 'local', label: 'Local only', icon: <HardDrive size={13} /> },
            { v: 'smb', label: 'SMB (NAS)', icon: <Server size={13} /> },
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
          <Field label="Host / IP">
            <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.10.20" className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
          </Field>
          <Field label={`Port (blank → ${backend === 'smb' ? '445' : '21'})`}>
            <input value={port} onChange={(e) => setPort(e.target.value)} placeholder={backend === 'smb' ? '445' : '21'} className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
          </Field>
          {backend === 'smb' && (
            <Field label="Share name">
              <input value={share} onChange={(e) => setShare(e.target.value)} placeholder="home" className={inputClass} />
            </Field>
          )}
          <Field label="Username">
            <input value={user} onChange={(e) => setUser(e.target.value)} className={inputClass} autoComplete="off" />
          </Field>
          <Field label={`Password ${storage.hasPass ? '(saved ✓ — blank keeps)' : ''}`}>
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={storage.hasPass ? '••••••••' : ''} className={inputClass} autoComplete="off" />
          </Field>
          <Field label="Base folder (optional)">
            <input value={basePath} onChange={(e) => setBasePath(e.target.value)} placeholder="Pharos" className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
          </Field>
          {backend === 'ftp' && (
            <div className="flex items-center justify-between sm:col-span-2">
              <span className="text-xs text-[color:var(--color-text-dim)]">FTPS (explicit TLS)</span>
              <Switch checked={secure} onChange={setSecure} />
            </div>
          )}
        </div>
      )}

      <div className="pt-2 border-t border-[color:var(--color-border)] mt-1 space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[color:var(--color-text-faint)] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)' }}>
          <FolderTree size={12} /> File organization
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Folder template">
            <input value={folderTpl} onChange={(e) => setFolderTpl(e.target.value)} className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
          </Field>
          <Field label="Filename template">
            <input value={nameTpl} onChange={(e) => setNameTpl(e.target.value)} className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
          </Field>
        </div>
        <div className="text-[10px] text-[color:var(--color-text-faint)] leading-relaxed" style={{ fontFamily: 'var(--font-mono)' }}>
          Tokens: {TEMPLATE_TOKENS.map((t) => t.token).join('  ')}
        </div>
        <div className="text-[11px] bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] rounded-lg px-3 py-2" style={{ fontFamily: 'var(--font-mono)' }}>
          <span className="text-[color:var(--color-text-faint)]">preview: </span>
          <span className="text-[color:var(--color-cyan)] break-all">{preview}</span>
        </div>
      </div>

      {backend !== 'local' && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="min-w-0">
            <p className="text-xs font-medium">Auto-mirror on verify</p>
            <p className="text-[10px] text-[color:var(--color-text-faint)] mt-0.5">Push each receipt/statement to the remote when you verify it.</p>
          </div>
          <Switch checked={mirror} onChange={setMirror} />
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-[color:var(--color-border)] mt-1">
        <button type="button" onClick={save} disabled={pending} className={saveBtn}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
        </button>
        {backend !== 'local' && (
          <button type="button" onClick={doTest} disabled={pending} className={ghostBtn}>
            <Plug size={13} /> Test connection
          </button>
        )}
        {backend !== 'local' && (
          <button type="button" onClick={doSync} disabled={pending || syncing} className={ghostBtn}>
            {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sync files now
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
  const total = Object.values(budgets).reduce((s, v) => s + (Number(v) || 0), 0);

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
      <div className="flex items-center gap-3 mt-3">
        <button onClick={save} disabled={pending} className="text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-accent)] text-black font-semibold hover:opacity-90 disabled:opacity-50">
          {pending ? t('common.saving') : t('set.saveBudgets')}
        </button>
        <span className="text-[11px] text-[color:var(--color-text-faint)]" style={{ fontFamily: 'var(--font-mono)' }}>{t('set.budgetTotal', { amount: `${cur()}${total.toLocaleString('en-GB')}` })}</span>
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
  const [autoAdd, setAutoAdd] = useState(settings.autoAddStores);
  const [currency, setCurrency] = useState(settings.currency);
  const [vatRate, setVatRate] = useState(String(settings.defaultVatRate));
  const [msg, setMsg] = useState<string | null>(null);

  function save() {
    const fd = new FormData();
    fd.set('defaultItemView', view);
    fd.set('defaultWarrantyMonths', warrantyMonths);
    fd.set('warrantyAlertDays', alertDays);
    fd.set('autoAddStores', String(autoAdd));
    fd.set('currency', currency);
    fd.set('defaultVatRate', vatRate);
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
        <div className="flex items-center justify-between gap-3 self-end pb-1">
          <span className="min-w-0">
            <span className="text-xs font-medium block">{t('set.autoAddStores')}</span>
            <span className="text-[10px] text-[color:var(--color-text-faint)] block">{t('set.autoAddStoresDesc')}</span>
          </span>
          <Switch checked={autoAdd} onChange={setAutoAdd} />
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

function NotificationsManager({ settings }: { settings: AppSettings }) {
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState(settings.ntfyUrl);
  const [enabled, setEnabled] = useState(settings.ntfyEnabled);
  const [msg, setMsg] = useState<string | null>(null);

  function persist() {
    const fd = new FormData();
    fd.set('ntfyUrl', url);
    fd.set('ntfyEnabled', String(enabled));
    return saveNtfy(fd);
  }
  function save() {
    setMsg(null);
    startTransition(async () => {
      await persist();
      setMsg('Saved ✓');
    });
  }
  function test() {
    setMsg('Sending…');
    startTransition(async () => {
      await persist();
      const r = await sendTestNtfy();
      setMsg(r.ok ? 'Test sent ✓' : `Failed: ${r.error}`);
    });
  }
  function check() {
    setMsg('Checking…');
    startTransition(async () => {
      await persist();
      const r = await runAlertChecks();
      setMsg((r.sent ? '✓ Sent · ' : '(enable to send) · ') + r.summary.replace(/\n/g, ' · '));
    });
  }

  return (
    <Section title="Notifications (ntfy)" icon={<Bell size={15} />}>
      <p className="text-xs text-[color:var(--color-text-dim)] -mt-1">
        Push alerts for deals, installments due this month, and warranties expiring soon. Use a free <span className="text-[color:var(--color-cyan)]">ntfy.sh/your-topic</span> or a self-hosted ntfy server (install the ntfy app and subscribe to the topic).
      </p>
      <label className="block">
        <span className={fieldLabel} style={{ fontFamily: 'var(--font-mono)' }}>ntfy topic URL</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ntfy.sh/your-topic" className={inputClass} style={{ fontFamily: 'var(--font-mono)' }} />
      </label>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium">Enable notifications</span>
        <Switch checked={enabled} onChange={setEnabled} />
      </div>
      <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-[color:var(--color-border)] mt-1">
        <button type="button" onClick={save} disabled={pending} className={saveBtn}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
        </button>
        <button type="button" onClick={test} disabled={pending || !url} className={cn(ghostBtn, 'text-[color:var(--color-cyan)]')}>
          <Bell size={13} /> Test
        </button>
        <button type="button" onClick={check} disabled={pending} className={cn(ghostBtn, 'text-[color:var(--color-gold)]')}>
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

// ─── Backup / restore ────────────────────────────────────────────────────────

// ─── Trash (soft-deleted records) ────────────────────────────────────────────

function TrashManager() {
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
      title: 'Delete forever?',
      message: `"${r.title}" will be permanently deleted (files included). This cannot be undone.`,
      confirmLabel: 'Delete forever',
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
      title: 'Empty the Trash?',
      message: `${rows?.length ?? 0} records will be permanently deleted (files included). This cannot be undone.`,
      confirmLabel: 'Empty Trash',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      await emptyTrash();
      setRows([]);
    });
  }

  return (
    <Section title={`Trash${rows?.length ? ` (${rows.length})` : ''}`} icon={<Trash2 size={15} />}>
      <p className="text-xs text-[color:var(--color-text-dim)] mb-3">
        Deleted records land here and auto-purge after 30 days. Restore brings them back exactly as they were.
      </p>
      {rows === null ? (
        <p className="text-xs text-[color:var(--color-text-faint)]"><Loader2 size={13} className="inline animate-spin" /> Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-[color:var(--color-text-faint)] italic">Trash is empty.</p>
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
                    {r.subtitle} · deleted {new Date(r.deletedAt).toLocaleDateString('en-GB')}
                  </span>
                </div>
                <button onClick={() => restore(r)} disabled={pending && busyId === r.id} className="text-[11px] text-[color:var(--color-accent)] hover:underline disabled:opacity-50 shrink-0">
                  restore
                </button>
                <button onClick={() => purge(r)} disabled={pending && busyId === r.id} className="text-[11px] text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] disabled:opacity-50 shrink-0">
                  delete forever
                </button>
              </div>
            ))}
          </div>
          <button onClick={empty} disabled={pending} className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-[color:var(--color-border)] text-[color:var(--color-red)] hover:border-[color:var(--color-red)] transition-colors disabled:opacity-50">
            Empty Trash ({rows.length})
          </button>
        </>
      )}
    </Section>
  );
}

function BackupRestore() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();

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
        setMsg('✓ Backup downloaded');
      } catch (e) {
        setMsg(`Export failed: ${(e as Error).message.slice(0, 80)}`);
      }
    });
  }

  async function handleFile(file: File) {
    const ok = await confirm({
      title: 'Restore from backup?',
      message: 'Merges the backup into your data (upsert by id). Records with the same id are overwritten. This cannot be undone.',
      confirmLabel: 'Restore',
      danger: true,
    });
    if (fileRef.current) fileRef.current.value = '';
    if (!ok) return;
    setMsg('Restoring…');
    const text = await file.text();
    startTransition(async () => {
      const r = await importData(text);
      setMsg(r.ok ? `✓ Restored ${r.restored} records` : `Failed: ${r.error}`);
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

  const btn =
    'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] hover:border-[color:var(--color-accent)] transition-colors disabled:opacity-50';

  return (
    <div className="mt-4 pt-4 border-t border-[color:var(--color-border)]">
      <p className="text-[10px] uppercase tracking-wider text-[color:var(--color-text-faint)] mb-2" style={{ fontFamily: 'var(--font-mono)' }}>
        Backup
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={handleExport} disabled={pending} className={cn(btn, 'text-[color:var(--color-accent)]')}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Export JSON
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={pending} className={cn(btn, 'text-[color:var(--color-cyan)]')}>
          <Upload size={13} /> Restore…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {msg && (
          <span className={cn('text-[11px]', msg.startsWith('Failed') || msg.includes('failed') ? 'text-[color:var(--color-red)]' : 'text-[color:var(--color-accent)]')} style={{ fontFamily: 'var(--font-mono)' }}>
            {msg}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-2">
        <span className="text-[10px] text-[color:var(--color-text-faint)] mr-1" style={{ fontFamily: 'var(--font-mono)' }}>Spreadsheet (CSV):</span>
        {(['receipts', 'expenses', 'items'] as const).map((k) => (
          <button key={k} type="button" onClick={() => handleCSV(k)} disabled={pending} className={cn(btn, 'text-[color:var(--color-text-dim)]')}>
            <Download size={12} /> {k}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-[color:var(--color-text-faint)] mt-1.5" style={{ fontFamily: 'var(--font-mono)' }}>
        JSON backup = full restore (metadata only; binary files stay on disk). CSV = open in Excel/Sheets for an accountant or tax.
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
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setErr(null);
    const fd = new FormData();
    if (store?._id) fd.set('id', store._id);
    fd.set('name', name);
    fd.set('aliases', aliases);
    fd.set('url', url);
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
      else setError(res.error || 'Failed');
    });
  }
  async function remove(u: UserRow) {
    const ok = await confirm({ title: 'Delete user', message: `Delete "${u.username}"? This cannot be undone.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    startTransition(async () => { const r = await deleteUser(u.id); if (!r.ok) setError(r.error || 'Failed'); reload(); });
  }
  function toggleRole(u: UserRow) {
    startTransition(async () => { const r = await setUserRole(u.id, u.role === 'admin' ? 'member' : 'admin'); if (!r.ok) setError(r.error || 'Failed'); reload(); });
  }
  function resetPwd(u: UserRow) {
    const pwd = window.prompt(`New password for "${u.username}" (min 8 chars):`);
    if (!pwd) return;
    startTransition(async () => { const r = await changeUserPassword(u.id, pwd); setError(r.ok ? '' : (r.error || 'Failed')); });
  }

  return (
    <Section title="Users & access" icon={<Users size={15} />}>
      <p className="text-[11px] text-[color:var(--color-text-dim)] -mt-1 mb-1">
        Everyone shares the same data. Admins manage users + system settings; members just use the app.
      </p>
      {loading ? (
        <p className="text-xs text-[color:var(--color-text-faint)]">Loading…</p>
      ) : (
        <div className="space-y-1.5">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2">
              <span className={cn('w-2 h-2 rounded-full shrink-0', u.role === 'admin' ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-text-faint)]')} />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium">{u.username}</span>
                {u.name && <span className="text-xs text-[color:var(--color-text-dim)] ml-2">{u.name}</span>}
                {u.id === currentUserId && <span className="text-[10px] text-[color:var(--color-accent)] ml-2" style={{ fontFamily: 'var(--font-mono)' }}>you</span>}
              </div>
              <button onClick={() => toggleRole(u)} title="Toggle role" style={{ fontFamily: 'var(--font-mono)' }}
                className={cn('text-[10px] px-2 py-0.5 rounded-full border uppercase', u.role === 'admin' ? 'border-[color:var(--color-accent)] text-[color:var(--color-accent)]' : 'border-[color:var(--color-border)] text-[color:var(--color-text-dim)]')}>
                {u.role}
              </button>
              <button onClick={() => resetPwd(u)} className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-accent)] p-1" title="Reset password"><KeyRound size={13} /></button>
              {u.id !== currentUserId && <button onClick={() => remove(u)} className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-red)] p-1" title="Delete"><Trash2 size={13} /></button>}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-[color:var(--color-red)] mt-2">{error}</p>}

      {adding ? (
        <div className="mt-3 p-3 rounded-xl border border-[color:var(--color-border)] space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="username *" className={inputClass} />
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="display name" className={inputClass} />
            <input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} type="password" placeholder="password (min 8) *" className={inputClass} />
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className={selectClass}>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={add} disabled={pending} className={saveBtn}>{pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Create user</button>
            <button onClick={() => { setAdding(false); setError(''); }} className={ghostBtn}><X size={13} /> Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-3 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-accent)] hover:border-[color:var(--color-accent)]">
          <UserPlus size={13} /> Add user
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
