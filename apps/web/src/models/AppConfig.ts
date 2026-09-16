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
    anthropicWorkspaceId: { type: String, default: '' }, // for identity-linked keys → anthropic-workspace-id header; not a secret

    // Cost guard: confirm (with a rough cost estimate) before starting a BULK AI job.
    // On by default so cloud (Anthropic) runs never start by accident.
    aiConfirmBulk: { type: Boolean, default: true },
    // ── Self-hosted AI spend cap (lib/aiBudget.ts) ──
    // A monthly ceiling, in the display `currency`, on what CLOUD AI calls may cost. When this
    // month's estimated spend reaches it, further cloud calls are blocked until the user raises
    // it or the month rolls over. 0 = no cap (default, so existing installs are unchanged). The
    // ledger below is the running estimate the cap reads; SaaS uses per-tenant quotas instead.
    aiMonthlyBudget: { type: Number, default: 0 },
    aiSpendPeriod: { type: String, default: '' }, // "YYYY-MM" of the current ledger window
    aiSpendMicros: { type: Number, default: 0 }, // this month's estimated spend, in currency micros
    // Self-host cron heartbeats: map cronName → ISO of last successful run (lib/cronHeartbeat.ts).
    // Powers the System-status "Scheduled tasks" check that flags a cron that stopped running.
    cronLastRun: { type: Schema.Types.Mixed, default: {} },
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
    documentAlertDays: { type: Number, default: 30 }, // "document expiring / expired" lead time (P42)
    specialDateAlertDays: { type: Number, default: 7 }, // "birthday / anniversary coming up" lead time (P50)
    maintenanceAlertDays: { type: Number, default: 7 }, // "maintenance due" lead time (P41)
    lendingAlertDays: { type: Number, default: 3 }, // "lent item due back" lead time (P47); tighter than maintenance on purpose
    staleClaimDays: { type: Number, default: 14 }, // silence before an open RMA counts as forgotten (P44 phase 2)
    syncStaleDays: { type: Number, default: 7 }, // "remote mirror has fallen behind" window (P48); 0 = off
    subscriptionReviewIntervalDays: { type: Number, default: 0 }, // P57 behavioural nudge; 0 = opt-out
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
    // Kill switch + per-run link cap for the 6h/daily price scraper (lib/aiBudget-gated for
    // cost; the cap also bounds IP-flagging from hitting many shops in one pass). 0 = no cap.
    scraperEnabled: { type: Boolean, default: true },
    scraperMaxLinks: { type: Number, default: 0 },

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
    // When a push to the remote last SUCCEEDED — written by every push path (Sync now,
    // the OneDrive batched path, and auto-mirror-on-verify). Powers the staleness alert
    // (P48): without it, a mirror that stopped working looks exactly like a fresh one.
    lastRemoteSyncAt: { type: Date, default: null },
    // Self-host update check (P40). `updateCheckEnabled` is the opt-out for anyone who
    // does not want the instance making ANY outbound call; the other two are the 24h
    // cache, kept here rather than in memory so a container restart does not turn into
    // another registry request. `updateCheckAt` stamps every ATTEMPT (a firewalled
    // instance must back off too), `updateCheckLatest` only ever holds a real answer.
    updateCheckEnabled: { type: Boolean, default: true },
    updateCheckAt: { type: Date, default: null },
    updateCheckLatest: { type: String, default: '' },
    // P88: cached GitHub release-notes body for `updateCheckLatest`, refreshed on the same
    // 24h cadence and capped (lib/versionCheck.RELEASE_NOTES_CAP). '' = none / not fetched.
    updateCheckNotes: { type: String, default: '' },
    // P102: Web Push VAPID keypair, generated once on first "Enable browser push" and kept
    // like the other integration secrets. `privateKey` is server-only (never sent to the
    // client); `publicKey` is handed to the browser as the applicationServerKey. Empty =
    // web push not set up yet. See lib/webPush.ts.
    webPush: {
      publicKey: { type: String, default: '' },
      privateKey: { type: String, default: '' },
      subject: { type: String, default: '' }, // VAPID contact (mailto:/URL)
    },
    // Outbound alert dedup (P82). The dedupeKeys (same scheme as the in-app bell, see
    // app/notifications/actions.ts) that were part of the last successfully-dispatched
    // ntfy/Discord/Slack/Telegram/webhook alert. Only touched by runAlertChecks' opt-in
    // `dedupe` mode (the scheduled cron path) — the manual "Check & notify now" button
    // always sends the full picture and never reads/writes this. Empty = nothing sent
    // yet, everything currently live counts as fresh.
    alertDispatchKeys: { type: [String], default: [] },
    // Per-type outbound alert toggles (P103): { deals: true, budgets: false, ... }. Only an
    // explicit `false` silences a category, so an empty/absent map means "send everything"
    // and no existing install changes behaviour. Filters the outbound summary ONLY — the
    // in-app bell keeps showing the full picture. See lib/alertTypes.ts for the key list.
    notifyTypes: { type: Schema.Types.Mixed, default: {} },
    // Quiet hours / do-not-disturb (P86): one daily window in which the alert cron holds
    // outbound delivery (push/ntfy/Discord/Telegram/webhook). "HH:MM" server-local; empty
    // start/end = off (every pre-P86 install), so no existing behaviour changes. The scan
    // still runs and the in-app bell still updates while quiet — only dispatch is deferred.
    quietHours: {
      start: { type: String, default: '' },
      end: { type: String, default: '' },
    },
    // Outbound delivery history (P80). Map `notifier:<id>` / `webhook:<id>` → the last
    // DELIVERY_LOG_CAP attempts (newest last, {at, ok, status, error, attempts}), written
    // by lib/deliveryLog.ts on every dispatch and shown per channel in Settings →
    // Notifications. Capped in both dimensions (rows per key, number of keys), so a
    // permanently-broken endpoint cannot grow this document without bound.
    deliveryLog: { type: Schema.Types.Mixed, default: {} },
    remoteHost: { type: String, default: '' },
    remotePort: { type: Number, default: 0 }, // 0 → backend default (21 ftp / 445 smb)
    remoteUser: { type: String, default: '' },
    remotePass: { type: String, default: '' }, // server-only, never sent to the client
    remoteShare: { type: String, default: '' }, // SMB share name
    remoteBasePath: { type: String, default: '' }, // prefix dir on the remote
    remoteSecure: { type: Boolean, default: false }, // FTPS (explicit TLS)
    // P99: a SECOND, simultaneous remote mirror for real 3-2-1 (local + two offsite copies).
    // Additive and independent of the primary above — the primary path is unchanged. FTP/SMB
    // only (a OneDrive secondary would need the whole OAuth flow duplicated); backend '' =
    // no second mirror, which is every pre-P99 install. Auto-mirror-on-verify and "Sync now"
    // push to both, best-effort per destination (one failing never blocks the other).
    storageMirror2: {
      backend: { type: String, enum: ['', 'ftp', 'smb'], default: '' },
      host: { type: String, default: '' },
      port: { type: Number, default: 0 },
      user: { type: String, default: '' },
      pass: { type: String, default: '' }, // server-only, never sent to the client
      share: { type: String, default: '' },
      basePath: { type: String, default: '' },
      secure: { type: Boolean, default: false },
    },
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
