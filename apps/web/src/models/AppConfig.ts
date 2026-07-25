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
    // Hides the homepage "getting started" checklist (P26) once the user closes it,
    // regardless of how many of its steps are actually complete.
    onboardingDismissed: { type: Boolean, default: false },

    // ── Defaults & alerts ──
    defaultItemView: { type: String, enum: ['grid', 'list'], default: 'grid' },
    defaultWarrantyMonths: { type: Number, default: 24 }, // receipts default this on verify
    warrantyAlertDays: { type: Number, default: 90 }, // "expiring soon" window for the badge + alerts
    trialAlertDays: { type: Number, default: 2 }, // free-trial "cancel before charge" lead time (P33)
    giftCardAlertDays: { type: Number, default: 30 }, // "gift card expiring with balance" window (P32)
    billAlertDays: { type: Number, default: 5 }, // "bill due / overdue" lead time (P28)
    autoAddStores: { type: Boolean, default: true }, // auto-add unknown receipt stores to the list
    currency: { type: String, default: 'EUR' }, // display currency symbol (ISO 4217 code)
    // Multi-currency (P9), opt-in per deployment so single-currency users see no extra
    // fields. When on, an expense/income entry may record the currency it was printed in
    // plus an FX rate; `amount` stays in the base `currency` above (see lib/fx.ts).
    multiCurrency: { type: Boolean, default: false },
    defaultVatRate: { type: Number, default: 24 }, // fallback VAT/sales-tax % when a receipt doesn't show one
    defaultReturnWindowDays: { type: Number, default: 14 }, // return window (days) unless a store overrides it; 0 = off
    // User-editable dropdown lists (category taxonomies). Map taxonomyKey → string[].
    lists: { type: Schema.Types.Mixed, default: {} },

    // Per-property / per-context ledger tags (P34). E.g. ["Σπίτι", "Εξοχικό"].
    // Empty = feature dormant. Applied to expenses/income as an optional `space`.
    spaces: { type: [String], default: [] },

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

    // Envelope / rollover budgeting (P25). When true, Reports carries the net
    // unspent balance from recent complete months into this month's budget
    // (under-spending accumulates, overspend eats into the next envelope). Off →
    // classic per-month budgets that reset in full each month. See lib/budgetRollover.ts.
    budgetRollover: { type: Boolean, default: false },

    // Vendor→category auto-rules (P15). Array of
    // { id, match, matchType:'vendor'|'text', category, recurring, recurringCycle }.
    // Applied deterministically (zero AI) to every new expense/income on create.
    // See lib/categoryRules.ts.
    categoryRules: { type: [Schema.Types.Mixed], default: [] },

    // Manual asset accounts for net worth (PA2). Map account name → balance
    // (cash, bank accounts — no integration, the user updates balances by hand).
    assetAccounts: { type: Schema.Types.Mixed, default: {} },

    // Asset depreciation model (P29). { enabled, floorPct, defaultRate, rates:{cat→%} }.
    // Estimates a current value for owned inventory from purchase price + date, so
    // net worth (PA2) does not overvalue aging gear. See lib/depreciation.ts.
    depreciation: { type: Schema.Types.Mixed, default: {} },

    // ── Notifications ──
    // Legacy single ntfy channel (migrated into `notifiers` on first save).
    ntfyUrl: { type: String, default: '' }, // e.g. https://ntfy.sh/your-topic (or self-hosted)
    ntfyEnabled: { type: Boolean, default: false },
    // Pluggable outbound channels: array of { id, type, enabled, label, url?, token?, target? }.
    // type ∈ ntfy | discord | slack | telegram | webhook. See lib/notifiers.ts.
    notifiers: { type: [Schema.Types.Mixed], default: [] },

    // Outbound event webhooks (P24) — automation hooks for Home Assistant/n8n/Node-RED.
    // Array of { id, url, secret, enabled, label, events: WebhookEvent[] }. Distinct from
    // `notifiers` above (those fan out human-readable *alert summaries*; these fire one
    // signed JSON POST per structured *event*). See lib/webhooks.ts.
    eventWebhooks: { type: [Schema.Types.Mixed], default: [] },

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

    // ── Email-in (IMAP) auto-import (P11) ── self-hosted only: poll an existing
    // mailbox for receipt emails and feed them through the SAME upload+parse pipeline
    // as a manual drop (uploadReceipt). Manual "Check inbox now" trigger for now (no
    // background cron in this app) — see lib/imapImport.ts + lib/imapConfig.ts.
    imapEnabled: { type: Boolean, default: false },
    imapHost: { type: String, default: '' },
    imapPort: { type: Number, default: 993 },
    imapUser: { type: String, default: '' },
    imapPass: { type: String, default: '' }, // server-only, never sent to the client
    imapSecure: { type: Boolean, default: true }, // TLS (IMAPS)
    imapFolder: { type: String, default: 'INBOX' },
    imapLastUid: { type: Number, default: 0 }, // resume point in imapFolder
    imapLastCheckedAt: { type: Date, default: null },
    imapLastImportedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type AppConfigDoc = InferSchemaType<typeof AppConfigSchema> & { _id: string };

export const AppConfig: Model<AppConfigDoc> =
  (models.AppConfig as Model<AppConfigDoc>) || model<AppConfigDoc>('AppConfig', AppConfigSchema);
