# PHAROS — Εκκρεμότητες (technical TODO)

> Ενιαία λίστα όλων των ανοιχτών τεχνικών εργασιών. Στρατηγική/σκεπτικό: `ROADMAP.md`.
> Ιστορικό παλιών sessions: `BACKLOG.md` (αρχείο, μη ενεργό).
> Σύμβολα: ⬜ todo · 🔄 σε εξέλιξη · ✅ done. Τελευταία ενημέρωση: 2026-06-23.

---

## NOW — τελείωμα προϊόντος (πριν οτιδήποτε product/SaaS)

### 1. i18n — ολοκλήρωση μετάφρασης (8 γλώσσες) 🔄
Έτοιμα ✅: navbar, AI command bar, homepage, language switcher, Jobs, Trash, AI history, Reports, Calendar (shell), Vouchers, Subscriptions, Tasks, Expenses/Income (πλήρες), Statements (shell), Items (shell).
Απομένουν ⬜:
- **Items — υπόλοιπο** (`app/items/ItemsClient.tsx`): `ItemRow`, `ItemCard` (status badges μέσω `IT_STATUS_KEY`, best price / deal / warranty κείμενα), `ItemDetailModal`, `ItemForm` (πεδία/placeholders), `UrlImport` (import-from-URL UI + μηνύματα), `Field`. + `components/PricePanel.tsx` (Best now / Lowest ever / target / verdict / log-a-price / where-to-buy / full-history).
- **Receipts** (`app/receipts/ReceiptsClient.tsx`): όλο — dropzone, status filters, store filter, sort, grid/list κάρτες (`ReceiptRow`), detail modal (line-item editor net/VAT/gross, re-scan OCR/text bar, store SearchableSelect, warranty/payment, «Not a receipt»/archive), DuplicatesModal, QuickVerify (`receipts/QuickVerify.tsx`), import-email button, bulk re-scan.
- **Settings** (`app/settings/SettingsClient.tsx` + sub-components) — το μεγαλύτερο: tabs (General/Appearance/Defaults/About, Money/Budgets/Cards, AI/engine/providers/prompts/scraper, Storage&backup/Trash/CSV, Stores&lists, Notifications/ntfy, Users, MCP/token). Πολλά labels/placeholders/help-texts.
- **Statements — modals** (`app/statements/StatementsClient.tsx`): `StatementDetail`, `TransactionList`, `TransactionRow`, `InstallmentEditor`, `InstallmentLink`, `PlanCardLinkable`, `PlanMergeControl` (merge into…/unmerge), `AddTransactionForm`, `StatementForm`, `CardsManager`, `CardForm`.
- **Calendar — server subs** (`app/calendar/page.tsx`): τα `push({sub})` («renews · {cycle}», «warranty expires», «expected · {cycle}», «{n} active plan(s)», label fallbacks) — θέλει thread του `getServerT()` στο helper που χτίζει τα months.
- **Login / Setup wizard** (chrome-less σελίδες) — έλεγχος αν είναι μεταφρασμένες· μάλλον ακόμα EN.
- **Deferred σε English-fallback (revisit pass):** enum labels (item categories `CATEGORY_LABELS`, subscription categories, task priorities `PRIORITIES`), transient AI-scan toasts (Reading…/Filled ✓), ονόματα μηνών σε ημερομηνίες (`periodLabel`, date formatting), 1-2 deep-editor placeholders.
- **Έλεγχος:** μετά το τέλος, sweep για εναπομείναντα hardcoded αγγλικά (grep) + live verify Ελληνικά σε κάθε σελίδα.

### 2. AI-search-open redesign ⬜
- Επιλογή concept: 🗼 Beacon Sweep / ⌘ Glass Console / 🌌 Aurora Veil / 🚀 Warp Dock / υβρίδιο.
- Υλοποίηση στο `components/AiCommandBar.tsx` (το τωρινό spotlight δεν αρέσει).

### 3. In-app notification center ⬜ (task #17)
- `models/Notification.ts` (per-user/tenant, type, read, payload).
- Bell icon στο navbar + unread count + dropdown.
- Triggers: job completion + `runAlertChecks` (deals/installments/warranties).
- ΣΗΜ: το ROADMAP §G το γενικεύει σε pluggable notifier (ntfy/Discord/Telegram/Slack/email/webhook) — χτίσε το ως framework, όχι μόνο in-app.

---

## NEXT — distribution & API (χρήσιμα ό,τι κι αν γίνει με το SaaS)

### 4. Publish Docker image (no git pull) ⬜
- CI job στο `.github/workflows/ci.yml`: build + **push** `pharos:vX.Y.Z` + `:latest` σε Docker Hub ή GHCR (login secrets).
- Version tagging.
- `docker-compose.prod.yml` με `image:` αντί `build:` για το `web`.
- Απόφαση: registry (Docker Hub vs GHCR) + license (ορίζει public/private image).

### 5. `/api/v1` REST API ⬜
- Resources: `receipts`, `items`, `expenses`, `statements`, `subscriptions`, `vouchers`, `tasks` (CRUD + list/pagination).
- Auth: reuse `User.apiToken` (Bearer), επέκταση με scopes.
- Errors, pagination, rate-limit, **OpenAPI spec**.
- Reuse server actions / `aiTools.ts` `execute()` όπου ταιριάζει.
- Middleware exception (όπως το `/api/mcp`).

### 6. Mobile app MVP ⬜ (καταναλώνει το /api/v1)
- Receipt photo capture → upload → AI parse (το pipeline υπάρχει server-side).
- List/detail views (receipts, expenses, items), quick-add.
- Token-based login.

### 7. Storage extensions ⬜
- `downloadFromOnedrive` (GET `/content`) — λείπει· χρειάζεται για on-demand cache + προαιρετικό «Open in OneDrive» (`createShareLink`).
- Νέοι backends στο storage abstraction: **Amazon S3, Azure Blob, Cloudflare R2** (tenant-selectable drivers).

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
