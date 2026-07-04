# PHAROS — Εκκρεμότητες (technical TODO)

> Ενιαία λίστα όλων των ανοιχτών τεχνικών εργασιών. Στρατηγική/σκεπτικό: `ROADMAP.md`.
> Ιστορικό παλιών sessions: `BACKLOG.md` (αρχείο, μη ενεργό).
> Σύμβολα: ⬜ todo · 🔄 σε εξέλιξη · ✅ done. Τελευταία ενημέρωση: 2026-06-23.

---

## NOW — τελείωμα προϊόντος (πριν οτιδήποτε product/SaaS)

### 1. i18n — ολοκλήρωση μετάφρασης (8 γλώσσες) ✅ (Session 2026-06-29)
Όλα τα user-facing strings wired σε `t()`. Keys σε **en + el** (τα άλλα 6 locales πέφτουν αυτόματα σε English μέσω του layered `resolveDict`). `tsc` καθαρό, sweep μηδέν εναπομείναντα hardcoded attributes.
Έγιναν αυτό το session:
- **Items** (`ItemsClient.tsx`): no-results, URL-import hints, «matches existing», price-trend tooltip, «now», «Purchase & payment». + **PricePanel** target tooltip (verdict labels ήταν ήδη μέσω `VERDICT_KEY`). + **ItemPhotoGallery** (πρόσθεσε `useT`: search-photos / set-cover / delete-photo titles).
- **Receipts** (`ReceiptsClient.tsx`): upload/import status, empty states, receipt/receipts, confirm dialog, line-item editor (Items(n)/add/no-line-items), 4 status tooltips (`rc.tip*`).
- **Settings** (`SettingsClient.tsx`): Notifications section + channels (`ChannelCard` πήρε `useT`), aria-labels, buttons, «Saved ✓», status words (Preparing…/Checking…/Nothing to sync.).
- **Statements** (`StatementsClient.tsx`): modal titles + product fallback.
- **Tasks** (`TasksClient.tsx`): TaskCard/TaskRow πήραν `useT` — Delete title/aria, add-step + notes placeholders.
- **Subscriptions** (`SubscriptionsClient.tsx`): Edit/Open/Delete aria-labels.
- **Reports** (`ReportsClient.tsx`): «Installment payoff» card title. **AiCommandBar**: Send aria-label.
- **Calendar** (`calendar/page.tsx`): server-side `getServerT()` → renewals/installments/recurring/warranty/voucher sub+label strings + **localized month names**. (CalendarClient αμετάβλητο — η μετάφραση γίνεται server-side.)
- Login/Setup wizard: επιβεβαιώθηκε ότι ήταν ήδη μεταφρασμένα.
**Σκόπιμα deferred (English-fallback, χαμηλή αξία):** σύνθετα OneDrive sync-progress diagnostic toasts, weekday abbrevs (Mon/Tue) + short-date formatting στο calendar grid, brand labels (Mastercard/Visa) + config-example placeholders (Bot token/Chat id/Webhook URL), enum labels (`CATEGORY_LABELS`/`PRIORITIES`).

### 2. AI-search-open redesign ✅ (Session 2026-06-29 — 🗼 Beacon Sweep)
- Concept: **🗼 Beacon Sweep** (on-brand με το lighthouse mark· ο χρήστης το διάλεξε).
- Υλοποίηση στο `components/AiCommandBar.tsx`: όταν ανοίγει το AI mode (`spotlight = isAi && open`) → backdrop dim (χωρίς blur, η σελίδα μένει ζωντανή) + **rotating lighthouse beam** (conic-gradient στην παλέτα accent→cyan→purple, masked σε soft halo, `pharos-beam-spin` 7s) πίσω από το floating bar + **beacon-pulse ring** στο AI (Sparkles) toggle (`pharos-beacon-pulse`). Keyframes στο `globals.css`. tsc καθαρό.

### 3. In-app notification center + pluggable outbound notifier ✅ (Session 2026-06-29)
- ✅ `models/Notification.ts` + bell στο navbar (`NotificationBell`) + unread count/dropdown + `notifications/actions.ts` (generate/get/mark-read/dismiss/clear).
- ✅ **Pluggable outbound framework** (ROADMAP §G): `lib/notifiers.ts` (server senders) + `lib/notifiers.shared.ts` (client-safe types/metadata). Channels: **ntfy / Discord / Slack / Telegram / webhook** (όλα plain HTTP POST· email μέσω generic webhook → Zapier/n8n). Array σε `AppConfig.notifiers`· legacy `ntfyUrl`/`ntfyEnabled` migrate-άρονται on-read + κρατιούνται in-sync με το πρώτο ntfy channel.
- ✅ `runAlertChecks` → `dispatchAlert()` (fan-out σε όλα τα enabled channels, never-throws, Promise.allSettled). Settings → Notifications: `NotificationsManager`/`ChannelCard` (add/remove/per-channel test/enable + «Check & notify now»). i18n-wired. tsc καθαρό.

---

## NEXT — distribution & API (χρήσιμα ό,τι κι αν γίνει με το SaaS)

### 4. Publish Docker image (no git pull) ✅ (Session 2026-06-29 — GHCR)
- ✅ Registry: **GHCR** (`ghcr.io/achilleasgkekas/pharos`) — auth μέσω built-in `GITHUB_TOKEN`, μηδέν extra secrets.
- ✅ `.github/workflows/release.yml`: push semver tag `v*.*.*` → publish `:X.Y.Z` `:X.Y` `:X` `:latest`· `workflow_dispatch` → `:edge`. Multi-arch **linux/amd64 + linux/arm64** (prod Proxmox/x86 + Mac arm64), GHA build cache.
- ✅ `docker-compose.prod.yml` (self-contained, `image:` αντί `build:`, `PHAROS_IMAGE` override για version pin)· README quick-start «Run from the prebuilt image».
- ΣΗΜ: ο `scraper` μένει build-from-source (opt-in)· δεν δημοσιεύεται image ακόμα. Image visibility (public/private) = ρύθμιση στο GitHub Packages μετά το πρώτο push· license decision δεν μπλοκάρει.

### 5. `/api/v1` REST API ⬜
- Resources: `receipts`, `items`, `expenses`, `statements`, `subscriptions`, `vouchers`, `tasks` (CRUD + list/pagination).
- Auth: reuse `User.apiToken` (Bearer), επέκταση με scopes.
- Errors, pagination, rate-limit, **OpenAPI spec** — ✅ `docs/openapi.yaml` (OpenAPI 3.1, 50 paths / 74 ops, 1:1 με τα route files, validated· 2026-07-04). Rate-limit ακόμα ⬜.
- Reuse server actions / `aiTools.ts` `execute()` όπου ταιριάζει.
- Middleware exception (όπως το `/api/mcp`).

### 6. Mobile app MVP ⬜ (καταναλώνει το /api/v1)
- Receipt photo capture → upload → AI parse (το pipeline υπάρχει server-side).
- List/detail views (receipts, expenses, items), quick-add.
- Token-based login.

### 7. Storage extensions 🔄
- ✅ `downloadFromOnedrive` (GET `/content`) + `createShareLink` (`lib/onedrive.ts`). `lib/mirror.ts`: `recacheFromRemote`/`shareLinkFor` (templated-path aware) + `recacheByPath` (reverse-lookup owner doc). **On-demand cache wired** στο `/api/files/[...path]`: local miss + OneDrive backend → pull-back + write local + serve (Session 2026-06-29).
- ✅ «Open in OneDrive» UI button (Session 2026-06-29): `lib/mirror.ts` `shareLinkByPath` (reverse-lookup owner) + `app/storage-actions.ts` (`onedriveEnabled`/`getOnedriveShareLink`) + **self-gating** `components/OpenInOneDriveButton.tsx` (renders μόνο όταν backend=onedrive — χωρίς prop-drilling) wired στα detail modals Receipts/Statements/Expenses. i18n key `common.openInOnedrive` (en+el).
- ⬜ Νέοι backends στο storage abstraction: **Amazon S3, Azure Blob, Cloudflare R2** (tenant-selectable drivers).

---

## LATER — SaaS foundation (μόνο μετά από validation ζήτησης)

### 8. Multi-tenancy — database-per-tenant ⬜ (το μεγάλο άλμα)
- `lib/db.ts` → per-tenant connection layer: μία cluster σύνδεση + `conn.useDb('tenant_<id>')` ανά request, models registered per-connection.
- **Tenant resolver:** host/subdomain/custom-domain/session → tenant → DB.
- Per-tenant config (storage backend, AI keys, plan, limits) σε central registry DB.
- `dbStats()` size metering + enforcement (quota → upgrade).
- Per-tenant backup/restore/export/delete.
- Migrations που τρέχουν σε ΟΛΕΣ τις tenant βάσεις.
- Superadmin console.
- Tiers: **shared** (own DB, shared cluster, size-limited) vs **dedicated** (own instance + custom domain).

### 9. Accounts & auth (web-grade) ⬜
- `User`: + `email`, email verification, password reset.
- **MFA (TOTP + recovery codes)**, session management.
- Org/team + invites + roles· optional OAuth (Google/Microsoft).

### 10. Storage (SaaS) ⬜
- Managed bucket (S3/R2/Azure) ως default.
- Signed/expiring URLs· `/api/files` backend-aware per tenant· per-tenant quota accounting.

### 11. AI metering & billing-readiness ⬜
- Usage ledger per tenant (calls/tokens/cost), limits + cutoffs, «X of Y used».
- **BYO-key** option (tenant βάζει δικό του Anthropic key = μηδέν AI κόστος για μας).

---

## SaaS LAUNCH — (μετά τη foundation)

### 12. Billing & plans ⬜
- Stripe ή **Paddle** (Paddle = merchant-of-record, χειρίζεται EU VAT).
- Plan ladder: free 5 GB shared → paid shared (bigger DB) → dedicated + custom domain.
- Quotas (storage + AI), trials, proration, dunning, invoices.

### 13. Integrations ⬜
- **Inbound bots** (Telegram πρώτα, μετά Discord, email-in): account linking → λήψη μηνύματος → `aiTools.execute()` (reuse) → per-message AI metering. «add expense …», «show stats».
- **Outbound notifier** (§3 γενικευμένο): ntfy/Discord/Telegram/Slack/email/webhook, per-user channel config + event types.

### 14. Security ⬜
- Encryption at rest (DB + file storage· σκέψου per-tenant document keys).
- Audit log, rate-limiting/abuse protection, CVE/dependency scanning, secrets management, **pen-test πριν το launch**, encrypted backups.

### 15. Legal & compliance ⬜ (blocking για SaaS)
- ToS, Privacy Policy, **GDPR** (lawful basis, data export + delete, DPA, sub-processor list, breach process), data residency (EU), cookie/consent. (Δικηγόρος για templates.)

### 16. Ops ⬜
- Per-tenant backup + DR, observability (logs/metrics/traces + error tracking), status/uptime page, staging env, blue-green deploys.

### 17. Custom domain (dedicated/top tier) ⬜
- Domain → tenant mapping· TLS: wildcard `*.pharos.app` + **on-demand certs** για customer domains (Caddy on-demand TLS ή Cloudflare Custom Hostnames).

### 18. Docs / Knowledge base / manuals ⬜
- Help center (getting started, self-host guide, API docs/OpenAPI, integrations, billing FAQ), in-app contextual help/tooltips, changelog. (Docusaurus/Mintlify/Nextra.)

### 19. Marketing site ⬜
- Landing, pricing, features, signup flow, trust/security page.

---

## Μικρά / γνωστά εκκρεμή (από ιστορικό)

- ⬜ **Scraper re-enable** όταν χρειαστεί: `docker compose --profile scraper up -d flaresolverr` για Skroutz URL-import + 6h price scraper (τώρα stopped).
- ⬜ **Auto-mirror-on-verify**: wired, αλλά το `createShareLink`/on-demand download δεν υπάρχει (βλ. #7).
- ⬜ **Receipts data**: ~8 image-only / no-file receipts (Corsair×3, Microsoft, Playmobil) μη ανακτήσιμα από text· πιθανά διπλότυπα RTX 5080 €1443.72.
- ⬜ **Decisions που μπλοκάρουν** (βλ. ROADMAP §4): business model (self-hosted/managed-first vs SaaS-first), AI billing (BYO-key vs included), license.

---

## Πρόταση σειράς εκτέλεσης
1. **NOW** (1→2→3): τελείωσε i18n, AI-search, notification framework. = πουλήσιμο, γυαλισμένο προϊόν.
2. **NEXT** (4→5→6→7): image publish + REST API + mobile MVP + storage drivers. = distribution + leverage, χρήσιμα παντού.
3. **Validate** με self-hosted/managed πελάτες.
4. **LATER/LAUNCH** (8→19): μόνο αν τραβήξει η αγορά.
