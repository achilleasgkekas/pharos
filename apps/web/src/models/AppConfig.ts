import { Schema, model, models, type Model, type InferSchemaType } from 'mongoose';

/**
 * Single-document app configuration (key: 'singleton'). Holds the AI backend
 * settings the user manages from /settings: which provider to use, the active
 * local Ollama model, and the Anthropic (Claude) API credentials for the heavy
 * parses (statements, specs, receipts).
 */
const AppConfigSchema = new Schema(
  {
    key: { type: String, default: 'singleton', unique: true },
    aiProvider: { type: String, enum: ['ollama', 'anthropic'], default: 'ollama' },
    ollamaHost: { type: String, default: '' }, // Ollama server URL (same machine or remote); '' → OLLAMA_HOST env
    ollamaModel: { type: String, default: '' }, // text tasks; '' → OLLAMA_MODEL env
    // Image tasks (receipts, card scan) need a vision model — kept separate so the
    // active text model can be a smarter text-only one (e.g. qwen2.5:14b).
    ollamaVisionModel: { type: String, default: '' }, // '' → OLLAMA_VISION_MODEL env
    anthropicApiKey: { type: String, default: '' }, // server-only, never sent to the client
    anthropicModel: { type: String, default: 'claude-sonnet-4-5-20250929' },
    // Cost guard: confirm (with a rough cost estimate) before starting a BULK AI job.
    // On by default so cloud (Anthropic) runs never start by accident.
    aiConfirmBulk: { type: Boolean, default: true },
    // ── AI master switch + per-feature toggles ──
    // The app is fully usable with AI off. `aiEnabled` is the master switch;
    // `aiFeatures` is a map featureKey→boolean where an ABSENT key means ON (so new
    // features default enabled without a migration). `aiOnboardingDismissed` hides
    // the "set up AI" banner once the user dismisses it.
    aiEnabled: { type: Boolean, default: true },
    aiFeatures: { type: Schema.Types.Mixed, default: {} },
    aiOnboardingDismissed: { type: Boolean, default: false },

    // ── Defaults & alerts ──
    defaultItemView: { type: String, enum: ['grid', 'list'], default: 'grid' },
    defaultWarrantyMonths: { type: Number, default: 24 }, // receipts default this on verify
    warrantyAlertDays: { type: Number, default: 90 }, // "expiring soon" window for the badge + alerts
    autoAddStores: { type: Boolean, default: true }, // auto-add unknown receipt stores to the list
    currency: { type: String, default: 'EUR' }, // display currency symbol (ISO 4217 code)
    defaultVatRate: { type: Number, default: 24 }, // fallback VAT/sales-tax % when a receipt doesn't show one
    defaultReturnWindowDays: { type: Number, default: 14 }, // return window (days) unless a store overrides it; 0 = off
    // User-editable dropdown lists (category taxonomies). Map taxonomyKey → string[].
    lists: { type: Schema.Types.Mixed, default: {} },

    // ── Extra AI providers (key + model each; provider picked via aiProvider) ──
    openaiApiKey: { type: String, default: '' },
    openaiModel: { type: String, default: '' },
    geminiApiKey: { type: String, default: '' },
    geminiModel: { type: String, default: '' },
    openrouterApiKey: { type: String, default: '' },
    openrouterModel: { type: String, default: '' },
    customBaseUrl: { type: String, default: '' }, // any OpenAI-compatible server
    customApiKey: { type: String, default: '' },
    customModel: { type: String, default: '' },

    // Monthly budget per expense category. Map category → € amount.
    budgets: { type: Schema.Types.Mixed, default: {} },

    // Manual asset accounts for net worth (PA2). Map account name → balance
    // (cash, bank accounts — no integration, the user updates balances by hand).
    assetAccounts: { type: Schema.Types.Mixed, default: {} },

    // ── Notifications ──
    // Legacy single ntfy channel (migrated into `notifiers` on first save).
    ntfyUrl: { type: String, default: '' }, // e.g. https://ntfy.sh/your-topic (or self-hosted)
    ntfyEnabled: { type: Boolean, default: false },
    // Pluggable outbound channels: array of { id, type, enabled, label, url?, token?, target? }.
    // type ∈ ntfy | discord | slack | telegram | webhook. See lib/notifiers.ts.
    notifiers: { type: [Schema.Types.Mixed], default: [] },

    // ── Editable AI prompts ── map of promptKey → override text (empty/absent = use
    // the built-in default). Lets the user tune every AI query from Settings.
    prompts: { type: Schema.Types.Mixed, default: {} },

    // ── Scraper AI (separate from the main AI) ──
    scraperProvider: { type: String, enum: ['ollama', 'anthropic'], default: 'ollama' },
    scraperModel: { type: String, default: '' }, // '' → OLLAMA_MODEL env / qwen2.5:14b

    // ── File storage (PDFs/images) ──
    // Local is ALWAYS the working copy (serving, thumbnails, AI). A remote backend is
    // an organized MIRROR/backup the user can sync to (SMB/FTP now, cloud later).
    storageBackend: { type: String, enum: ['local', 'ftp', 'smb', 'onedrive'], default: 'local' },
    // OneDrive (Microsoft Graph) — device-code OAuth. We store only the client id
    // and the rotating refresh token (server-only, never sent to the client).
    onedriveClientId: { type: String, default: '' },
    onedriveRefreshToken: { type: String, default: '' },
    onedriveAccount: { type: String, default: '' }, // display: which account is linked
    storageMirror: { type: Boolean, default: false }, // also push a copy on verify
    remoteHost: { type: String, default: '' },
    remotePort: { type: Number, default: 0 }, // 0 → backend default (21 ftp / 445 smb)
    remoteUser: { type: String, default: '' },
    remotePass: { type: String, default: '' }, // server-only, never sent to the client
    remoteShare: { type: String, default: '' }, // SMB share name
    remoteBasePath: { type: String, default: '' }, // prefix dir on the remote
    remoteSecure: { type: Boolean, default: false }, // FTPS (explicit TLS)
    // ── Naming / folder templates (tokens: {kind} {store} {year} {month} {day} {date} {total} {id} {original} {ext}) ──
    folderTemplate: { type: String, default: '{kind}/{year}/{month}' },
    fileNameTemplate: { type: String, default: '{date}_{store}_{id}' },
  },
  { timestamps: true }
);

export type AppConfigDoc = InferSchemaType<typeof AppConfigSchema> & { _id: string };

export const AppConfig: Model<AppConfigDoc> =
  (models.AppConfig as Model<AppConfigDoc>) || model<AppConfigDoc>('AppConfig', AppConfigSchema);
