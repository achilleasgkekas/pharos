# DOCS_PROGRESS

Ημερολόγιο της DOCS routine (τρέχει ωριαία, unattended). Territory: μόνο `docs/**`
(συν μία γραμμή link στο README αν λείπει). Γλώσσα των docs: Αγγλικά (public
audience). Σημειώσεις εδώ: Ελληνικά, χωρίς παύλες.

## 2026-07-01

Πρώτο run της DOCS routine. Το `docs/` είχε μόνο banner assets (banner.png/svg),
κανένα markdown doc, κανένα progress log.

Τι έγραψα:
- `docs/self-hosting.md` — πλήρης οδηγός self-host: prerequisites, δύο τρόποι
  απόκτησης (prebuilt image `ghcr.io/achilleasgkekas/pharos:latest` vs build from
  source), configuration του `.env` με πίνακα required/optional env vars, start του
  stack (web+mongo+searxng), first-run admin wizard, optional profiles
  (scraper/tools), storage & backups (scripts/backup.sh + restore.sh, volume
  ./data/storage), updating, HTTPS/reverse-proxy, troubleshooting.
- `docs/README.md` — index/TOC. Links μόνο σε ό,τι υπάρχει (self-hosting.md +
  root reference docs). Τα planned guides (features/configuration/api/mobile) ως
  plain text, χωρίς broken links.
- `docs/DOCS_PROGRESS.md` — αυτό το log.

Πηγές που διάβασα για ακρίβεια (όχι εικασίες): `.env.example`,
`docker-compose.prod.yml`, `docker-compose.yml`, `README.md`, `scripts/backup.sh`.
Ολα τα env var names και container names (homepage-web/mongo/searxng) επαληθεύτηκαν
απο τον κώδικα.

Validation: markdown only, κανένα build/Docker/AI. Internal links resolve
(self-hosting.md υπάρχει, planned = plain text). Fenced code blocks κλειστά.
Commands ταιριάζουν με το repo (real compose files, real script names).

Προσθήκη στο README: μία γραμμή link στο `docs/` (το README ανέφερε μόνο το banner,
όχι τα guides).

Επόμενο doc: `docs/features.md` (per-module περιγραφή απο τη σκοπιά του χρήστη),
αντλώντας απο το CLAUDE.md + τα actual routes. Μετά: `docs/api.md` (REST v1 απο
τα route files υπο `apps/web/src/app/api/v1/`), `docs/configuration.md`,
`docs/mobile.md`.

## 2026-07-01 (2ο run)

Έγραψα το `docs/features.md` — per-module περιγραφή απο τη σκοπιά του χρήστη,
Αγγλικά. Καλύπτει: Inventory & Shopping (Items), Shopping list, Receipts (+AI
parse/OCR/quick-verify/dedup/add-to-library), Expenses & Income (recurring series,
anomaly detection), Statements & installments (inline NN/MM parse, plan merge,
link-to-product), Subscriptions, Vouchers (AI fill), Calendar (3μηνο agenda),
Reports (net position, budgets), Tasks (kanban), Network/UniFi, AI command bar &
history, Search, Notifications, Trash (soft delete), Settings (tabs).

Πηγές για ακρίβεια (διάβασα κώδικα, οχι εικασίες): CLAUDE.md (source of truth για
features), `find apps/web/src/app/api/v1 -name route.ts` (49 routes), `models/`
(19 models), λίστα app pages, `models/ShoppingListItem.ts` (ξεχώρισα το lightweight
shopping-list απο τα product-tracking Items), `history/page.tsx` (AI conversations).

README TOC: το «Features» μεταφέρθηκε απο Planned → live guide (link σε features.md).

Validation: markdown only, κανένα build/Docker/AI call. Ολα τα internal links
resolve (script check: features.md + README.md → 8 targets, ολα OK, 0 MISSING).
Καμία αναφορά σε ανύπαρκτο api.md (τα 2 σημεία που ηθελα link → plain text + link
στο DOCS_PROGRESS.md). features.md = 0 code fences (καθαρή πρόζα).

Collision guard: `git diff --cached --name-only` κενό πριν το commit (κανένα
concurrent routine mid-commit). Foreign unstaged (.claude/launch.json,
apps/landing/) — δεν τα αγγιξα. Stage ΜΟΝΟ docs/features.md + docs/README.md +
docs/DOCS_PROGRESS.md.

Push: DEFERRED. Το commit (`docs(features): ...`) εγινε τοπικα αλλα το `git push`
απορριφθηκε (non-fast-forward — concurrent routine εσπρωξε το `44bc648
feat(landing): scaffold ... apps/landing`). Το incoming commit αγγιζει ΜΟΝΟ
`apps/landing/**` (0 σε docs/launch.json), αρα κανενα content conflict. ΟΜΩΣ το
tree εχει foreign uncommitted files (untracked `apps/landing/` που τωρα συγκρουεται
με το committed apps/landing του remote + modified `.claude/launch.json`), οποτε
κατα τον hard rule ΔΕΝ κανω rebase (το checkout στο rebase θα clobber-αρε το
untracked apps/landing). Ιδιο pattern με το προηγουμενο run (`6f04491 docs(saas):
note deferred push`). Το commit μενει τοπικο· επομενο run με καθαρο tree θα κανει
fetch+rebase+push. Κανενα force-push.

Επόμενο doc: `docs/api.md` (REST v1 reference — auth bearer token + καθε endpoint
κατω απο api/v1, διαβάζοντας τα route files). Μετά: `docs/configuration.md`,
`docs/mobile.md`.

## 2026-07-01 (3ο run)

Έγραψα το `docs/api.md` — πλήρες REST API v1 reference, Αγγλικά, public audience.
Δομη: overview/base URL, Authentication (POST /auth/login → bearer `phk_` token,
role admin/member), Conventions (list envelope `{data,total,limit,offset}`,
pagination limit 1..200/offset, `updatedSince` incremental sync που επιστρεφει και
soft-deleted flagged `deleted:true`, soft-delete vs permanent, ObjectId 400,
`{error}` shapes, AI-gated endpoints), και ολα τα 49 endpoints ομαδοποιημενα
(Dashboard/reports, Items, Shopping list, Receipts, Scan, Expenses, Statements,
Subscriptions, Vouchers, Tasks, Cards, Stores, AI command bar, Notifications/jobs/
push, Settings/lists, Trash) + quick-start curl.

Πηγες για ακριβεια (διάβασα κώδικα, οχι εικασιες): `lib/apiAuth.ts` (bearerUser +
withAuth + apiError → το ακριβες 401 message), `lib/apiList.ts` (listParams/
withSince/listEnvelope → το envelope + updatedSince semantics + soft-deleted-on-
sync), `lib/apiBody.ts` (isObjectId 400 guard), `auth/login/route.ts` (token
shape `phk_`), + JSDoc απο ολα τα 49 route.ts (method/path/params/response). Ολα
τα endpoints/shapes απο τα actual routes, οχι μνημη.

README TOC: το «API reference» μεταφερθηκε απο Planned → live guide (link σε
api.md). Εμεινε στα Planned: Configuration, Mobile.

Validation: markdown only, κανενα build/Docker/AI call. Code fences: 12 (6 κλειστα
blocks, ζυγο). Internal links: script check README.md+api.md → 10 targets, ολα OK,
0 MISSING. Απεφυγα broken link προς ανυπαρκτο mobile.md (το ανεφερα ως plain text,
οχι link, μεχρι να γραφτει).

Collision guard: `git diff --cached --name-only` κενο πριν το stage (κανενα
concurrent routine mid-commit). Foreign unstaged (.claude/launch.json, WEB_DEBT.md)
— δεν τα αγγιξα. Stage ΜΟΝΟ docs/api.md + docs/README.md + docs/DOCS_PROGRESS.md.

Επόμενο doc: `docs/configuration.md` (AI providers, storage backends local/SMB/FTP/
OneDrive, notifications ntfy/Discord/Slack/Telegram/webhook, i18n). Μετα:
`docs/mobile.md`.

## 2026-07-01 (4ο run)

Έγραψα το `docs/configuration.md` — Αγγλικά, public audience. Καλύπτει τις 4
περιοχες που ζηταει το task file: (1) AI providers (ollama/anthropic/openai/
gemini/openrouter/custom, master switch + per-feature toggles, text vs vision
Ollama slots, cost guard aiConfirmBulk, editable prompts, ξεχωριστο scraper AI,
half-config fallback σε ollama), (2) Storage backends (local always-working-copy +
mirror· smb=smbclient CLI SMB3, ftp/ftps, onedrive zero-config device-code OAuth
→ /Apps/Pharos, consumers tenant· folder/file templates + tokens), (3)
Notifications (notifiers array: ntfy/discord/slack/telegram/webhook + fields ανα
type + legacy ntfyUrl migration + scraper NTFY_URL/TOPIC/PRICE_DROP_ALERT_PCT),
(4) Language i18n (8 locales, pharos_locale cookie, en fallback· + currency/VAT
σημειωση).

Πηγες (διαβασα κωδικα, οχι εικασιες): `models/AppConfig.ts` (ολα τα πεδια +
defaults + enums), `lib/aiConfig.ts` (AiProvider union + env fallbacks + isAiReady
half-config→ollama), `lib/notifiers.ts` (sendOne switch ανα channel type + fields),
`lib/i18n/config.ts` (LOCALES + DEFAULT_LOCALE + LOCALE_COOKIE), `lib/onedrive.ts`
(DEFAULT_CLIENT_ID zero-config, TENANT=consumers, /Apps/Pharos upload path),
`apps/web/.env.example` (OLLAMA_*/NTFY_*/PRICE_DROP env vars).

README TOC: το «Configuration» μεταφερθηκε απο Planned → live guide (link σε
configuration.md). Εμεινε στα Planned μονο: Mobile app.

Validation: markdown only, κανενα build/Docker/AI call. Code fences: 0 (καθαρη
προζα + tables). Internal links: script check README.md+configuration.md → 10
targets, ολα OK, 0 MISSING.

Collision guard: ελεγχος `git status --short` + `git diff --cached` πριν το commit·
stage ΜΟΝΟ docs/configuration.md + docs/README.md + docs/DOCS_PROGRESS.md. Foreign
unstaged (.claude/launch.json) — δεν το αγγιξα.

Επόμενο doc: `docs/mobile.md` (Expo companion app — install, point at a Pharos
server, bearer token, npx expo start). Θα διαβασω apps/mobile για ακριβεια.

## 2026-07-02

Έγραψα το `docs/mobile.md` — Expo companion app, Αγγλικά, public audience. Ο
πινακας των Planned guides στο README εκλεισε τελειως (Mobile → live guide).

Περιεχομενο: τι κανει η εφαρμογη (πινακας area→screen, ολα τα modules που
mirror-αρουν το web), requirements (reachable server + Pharos account + Node/Expo
Go, οχι localhost απο κινητο), run it (npm install + npx expo start + login server/
username/password, session persist σε SecureStore, DEFAULT_API_BASE tip), how the
token works (κανενα ξεχωριστο step — login επιστρεφει bearer `phk_` token, ιδιο με
API/MCP, regenerate απο Settings → Mobile/MCP· bearer-protected files μεσω
/api/files), camera/AI scans (product/receipt/expense/voucher, χρειαζονται AI on),
push notifications (guarded no-op σε Expo Go, EAS dev build + APNs για real, βλ.
PUSH_SETUP.md), building με EAS (development/preview/production profiles, bundle
com.achilleas.pharos), project layout, troubleshooting.

Πηγες (διαβασα κωδικα, οχι εικασιες): `apps/mobile/src/config.ts`
(DEFAULT_API_BASE + STORE_KEYS), `App.tsx` (session gate + app bar + drawer +
ScreenKey map), `src/api.ts` (ολος ο fetch client, login flow, ολα τα endpoints,
fileSource bearer header), `src/push.ts` (guarded registerForPush + expo
projectId), `PUSH_SETUP.md`, `app.json` (name/plugins/permissions/bundle id),
`eas.json` (build profiles), `package.json` (Expo SDK 54, scripts),
`apps/mobile/README.md`. Token shape επαληθευτηκε απο
`api/v1/auth/login/route.ts` (`phk_${randomBytes(24).base64url}`, created on first
login).

README TOC: το «Mobile app» μεταφερθηκε απο Planned → live guide. Το section
«Planned guides» αφαιρεθηκε (ολα τα guides ειναι πλεον live: self-hosting,
features, api, configuration, mobile).

Validation: markdown only, κανενα build/Docker/AI call. Code fences: 8 (4 κλειστα
blocks, ζυγο). Internal links: script check README.md+mobile.md → 10 targets, ολα
OK, 0 MISSING.

Collision guard: ελεγχος `git status --short` + `git diff --cached` πριν το commit·
stage ΜΟΝΟ docs/mobile.md + docs/README.md + docs/DOCS_PROGRESS.md. Foreign
unstaged (.claude/launch.json) — δεν το αγγιξα.

Επομενο doc: ολα τα core guides γραφτηκαν. Επομενο run → improvement pass: sync
`docs/api.md` με τυχον νεα endpoints (diff vs `api/v1`), εμπλουτισμος
`docs/features.md` ανα module, η ενα `docs/troubleshooting.md` που μαζευει τα
troubleshooting sections. Πρωτα finish-in-progress κανενα (ολα done).

## 2026-07-02 (cont.)

Improvement pass στο `docs/api.md` — audit + sync με τα πραγματικα routes, οχι νεο doc
(ολα τα core guides ειναι ηδη live).

Audit: εκανα enumerate ολο το δεντρο `apps/web/src/app/api/v1/**/route.ts` (24 resource
folders) και το αντιστοιχισα με τον πινακα endpoints του api.md. Ολα τα routes ειναι ηδη
documented — 0 λειπον, 0 undocumented. Επιβεβαιωθηκαν και τα nested: items/[id]/{ai-fill,
convert-to-task,link-plan,plans,price}, receipts/[id]/{rescan,add-to-library}, scan/
{receipt,product,expense,voucher}, statements/{[id],plans}, ai/subscription, push/register,
settings/test-notify, trash/[type]/[id]. Δεν προστεθηκε νεο endpoint στον κωδικα απο το
τελευταιο api.md (τα προσφατα commits ειναι SaaS usage-accounting/landing/tests, οχι νεα
v1 routes).

Accuracy spot-check (διαβασα κωδικα, οχι εικασιες): `auth/login/route.ts` → token
`phk_${randomBytes(24).base64url}`, created on first login, `{ token, user{id,name,
username,role} }` — ταιριαζει ακριβως με το doc. `items/route.ts` POST → body `{ title,
status?, category?, currentPrice? }`, 201 `{ item }`, status validated vs ITEM_STATUSES,
category free string — ταιριαζει.

Fix: αφαιρεσα το stale trailer του api.md που ελεγε οτι το `mobile.md` «is coming» — το
mobile.md γραφτηκε ηδη νωριτερα σημερα. Το αντικατεστησα με σωστο «See also» (Docs index,
Self-hosting, Features, Configuration, Mobile app) + μια προταση οτι το ιδιο `phk_` bearer
token δουλευει για mobile/MCP/scripts.

Validation: markdown only, κανενα build/Docker/AI call. Internal links του api.md → README.md,
self-hosting.md, features.md, configuration.md, mobile.md, ολα υπαρχουν στο docs/. Code
fences αθικτα (δεν αγγιξα κανενα block).

Collision guard: `git status --short` + `git diff --cached` πριν το commit· staged κενο (κανενα
concurrent routine mid-commit). Stage ΜΟΝΟ docs/api.md + docs/DOCS_PROGRESS.md. Foreign
unstaged (.claude/launch.json) — δεν το αγγιξα.

Επομενο run: ενα `docs/troubleshooting.md` που συγκεντρωνει τα διασπαρτα troubleshooting
sections (self-hosting/mobile/configuration) σε ενα σημειο· η εμπλουτισμος του features.md
ανα module με screenshots-placeholders. Πρωτα finish-in-progress κανενα (ολα done).

## 2026-07-02 (cont.²)

Νεο doc: `docs/troubleshooting.md` — συγκεντρωτικο troubleshooting σε ενα σημειο,
οπως ειχε προγραμματιστει στο προηγουμενο run. Ομαδοποιησα τα διασπαρτα sections
(self-hosting §10, mobile Troubleshooting, configuration notes) σε 9 areas: Install &
startup, Login & authentication, Database (Mongo), AI parsing & scans, Storage & backups,
Notifications, Import & price scraping, Mobile app, Performance. Καθε item linkαρει πισω
στον αναλυτικο guide (η troubleshooting.md ειναι fast index, οι guides authoritative).

Accuracy (διαβασα κωδικα/config, οχι εικασιες): επιβεβαιωσα ονοματα env vars απο
`.env.example` (AUTH_SECRET, NEXT_SERVER_ACTIONS_ENCRYPTION_KEY, AUTH_COOKIE_SECURE,
MONGO_USER/PASS, SOLVER_URL, OLLAMA_NUM_CTX) + service names απο `docker-compose.yml`
(web, mongo, mongo-express, flaresolverr, searxng, scraper· volume mongo-data) + το
host-gateway wiring (`host.docker.internal:host-gateway`, OLLAMA_HOST) + το SOLVER_URL
default (`http://flaresolverr:8191`). Ολα ταιριαζουν με τον κωδικα.

Προσθεσα link στο `docs/README.md` index (νεα εγγραφη Troubleshooting μετα το Mobile app).

Validation: markdown only, κανενα build/Docker/AI call. Internal links του troubleshooting.md
→ README.md, self-hosting.md, configuration.md, features.md, api.md, mobile.md — ολα υπαρχουν
στο docs/. Code fences (inline `code` μονο, κανενα fenced block) αθικτα.

Collision guard: `git status --short` + `git diff --cached` πριν το commit· staged κενο.
Stage ΜΟΝΟ docs/troubleshooting.md + docs/README.md + docs/DOCS_PROGRESS.md.

Επομενο run: εμπλουτισμος `docs/features.md` ανα module (screenshot placeholders), η ενα
`docs/saas.md`/`docs/faq.md` (τα προσφατα commits ειναι SaaS billing/members — μηδεν doc
ακομα για SaaS onboarding). Πρωτα finish-in-progress κανενα (ολα done).

## 2026-07-02 (cont.³)

Νεο doc: `docs/saas.md` — το πρωτο documentation για το managed SaaS layer, οπως ειχε
προγραμματιστει (τα προσφατα commits ειναι SaaS billing/members/invites/seat-limits,
μηδεν doc μεχρι τωρα). Καλυπτει: dual-shape (self-hosted AGPL vs managed SaaS),
enabling μεσω `SAAS_MODE`, tenancy model (Account/Tenant/Membership + subdomain/custom-
domain resolution), roles (owner/admin/member + last-owner guard), plan ladder
(Free/Pro/Dedicated με storage/AI/seats/custom-domain), quota enforcement, ολοκληρο το
`/api/saas/**` control-plane API (auth/account/members/invites/billing/usage) σε πινακες
method/path/body/result, και τα SaaS-only env vars.

Accuracy (διαβασα κωδικα, οχι εικασιες): `lib/tenancy/saasMode.ts` (flag values on/1/true/
yes), `context.ts` (DEFAULT_TENANT frozen, db-per-tenant, scoped()), `host.ts` (RESERVED_
SLUGS, parseTenantSlug), `billing/plans.ts` (Free 5GB/50/1 seat, Pro shared €9/50GB/1000/5,
Dedicated €29/500GB/unlimited/unlimited+custom-domain, stripePriceEnv bindings), `billing/
entitlements.ts` (OSS parity: dedicated=full, no feature locks, withinSeatLimit/withinAiQuota/
withinStorage), `tenancy/members.ts` (OrgRole, canAssignRole, wouldOrphanOwners), και τα
route.ts για signup/login/logout/session/account/members/invites-accept/billing/usage
(status codes 201/401/403/409/410/502, request/response shapes ακριβως απο τον κωδικα). Τα
env var ονοματα μαζευτηκαν με grep στο lib/tenancy + lib/billing: SAAS_MODE, SAAS_BASE_
DOMAIN, SAAS_SESSION_IDLE_HOURS, AUTH_SECRET, AUTH_COOKIE_SECURE, STRIPE_SECRET_KEY/WEBHOOK_
SECRET/PRICE_SHARED/PRICE_DEDICATED, RESEND_API_KEY, SMTP_URL, MAIL_FROM.

TODO που σημειωθηκε μεσα στο doc: τα SaaS env vars δεν ειναι ακομα στο `.env.example`
(self-hosted only) — αξιζει ενα documented SaaS block εκει (δεν το αγγιξα, εκτος territory
απο κωδικα· καθαρο docs/ scope εδω).

Προσθεσα link στο `docs/README.md` index (νεα εγγραφη «Managed SaaS mode» μετα το
Troubleshooting).

Validation: markdown only, κανενα build/Docker/AI call. Internal links του saas.md →
README.md, self-hosting.md, configuration.md, api.md — ολα υπαρχουν στο docs/. Code fences:
μονο inline `code` + πινακες, κανενα fenced block. Χρησιμοποιησα placeholders για ολα τα
secrets (καμια πραγματικη τιμη).

Collision guard: `git status --short` + `git diff --cached` πριν το commit· staged κενο.
Stage ΜΟΝΟ docs/saas.md + docs/README.md + docs/DOCS_PROGRESS.md.

Επομενο run: εμπλουτισμος `docs/features.md` ανα module (screenshot placeholders), η ενα
`docs/faq.md` για κοινες ερωτησεις (self-host vs SaaS, privacy, AI optionality). Πρωτα
finish-in-progress κανενα (ολα done).
