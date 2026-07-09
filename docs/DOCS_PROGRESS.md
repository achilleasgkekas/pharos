# DOCS_PROGRESS

Ημερολόγιο της DOCS routine (τρέχει ωριαία, unattended). Territory: μόνο `docs/**`
(συν μία γραμμή link στο README αν λείπει). Γλώσσα των docs: Αγγλικά (public
audience). Σημειώσεις εδώ: Ελληνικά, χωρίς παύλες.

## 2026-07-06 (saas.md: πληρες account/verify/reset/password reference + D6 constant-time)

Το git log εδειξε δυο SaaS commits που δεν καλυπτονταν στα docs: `e75cd74` (D6, constant-time
reset-request response) και το ευρυτερο account/verify/reset/password set, που στο `docs/saas.md`
υπηρχε μονο ως μια αοριστη προταση («Additional account routes exist for...»), χωρις method/path/
body/response. Το αντικατεστησα με πληρη τεκμηριωση, διαβαζοντας ολα τα route files (οχι εικασιες).

Τι εγραψα στο saas.md, νεα «### Email verification & password»:
1. Πινακας 5 endpoints με ακριβη gating/body/response:
   - `POST /account/verify/request` (AUTH, 24h token, alreadyVerified short-circuit)
   - `POST /account/verify/confirm` (unauth, single-use, generic 400)
   - `POST /account/reset/request` (unauth, ALWAYS {ok:true}, **constant-time** D6:
     RESET_MIN_RESPONSE_MS=500 floor + fire-and-forget email, fast 400 σε malformed)
   - `POST /account/reset/confirm` (unauth, newPassword ≥ 8, single-use)
   - `POST /account/password` (AUTH, re-verify current, ιδιο 401 για missing/wrong)
2. Intro παραγραφος: token = SHA-256 hash only, single-use, invalid/expired → ιδιο generic 400.
3. Σημειωση οτι reset-confirm + password-change ΔΕΝ force-expire-αρουν sessions (νεο hash ισχυει
   στο επομενο login) — απο τα route comments.
4. Dev-scaffold blockquote (devToken μονο εκτος production, fail-closed σε production) + link στο
   in-doc «SaaS environment variables» section για RESEND_API_KEY/SMTP_URL.

Accuracy: ολες οι τιμες cross-checked με source — MIN_PASSWORD=8 (accountProfile.ts), RESET_TTL_MS=1h
+ VERIFY_TTL_MS=24h (passwordReset.ts/emailVerify.ts), RESET_MIN_RESPONSE_MS=500 (resetTiming.ts,
hard constant ΟΧΙ env var → καμια αλλαγη στον env πινακα). Καμια εφευρεμενη τιμη.

Validation: markdown only, κανενα build/Docker/AI call. Fence parity saas.md = 0 (balanced, tables-
only). Internal links (README.md/api.md/configuration.md/self-hosting.md) → 4/4 OK. Διορθωσα ενα
forward-ref: αρχικα εδειξα configuration.md για RESEND_API_KEY, αλλα το configuration.md ΔΕΝ το
καλυπτει (grep=0)· το αλλαξα σε in-doc anchor #saas-environment-variables (οπου οντως ζει, γρ.244+262).
Secret scan (sk_live/sk_test/AUTH_SECRET=/re_) → κανενα literal secret.

Collision guard: `git status --short` πριν το add → μονο `M docs/saas.md` (δικο μου)· staged κενο.
Stage ΜΟΝΟ docs/saas.md + docs/DOCS_PROGRESS.md.

Επομενο run: sync check αν το mobile.md/api.md χρειαζονται mention των reset/verify (μαλλον οχι, ειναι
SaaS control-plane οχι bearer-API), η stale-forward-ref sweep. Content set παραμενει accurate.

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

## 2026-07-02 (cont.⁴)

Νεο doc: `docs/faq.md` — το πρωτο FAQ, οπως ειχε σημειωθει ως επομενο (features.md
ηδη πληρες, saas.md γραφτηκε στο προηγουμενο run). Ομαδοποιημενο σε 8 θεματα: General,
Self-hosting vs managed SaaS, Privacy & data ownership, AI, Storage & backups, Mobile
app, Cost & licensing, Troubleshooting. Καθε απαντηση συντομη, με link στο αναλυτικο doc
(features/self-hosting/saas/configuration/mobile/troubleshooting) αντι να επαναλαμβανει.

Accuracy (απο υπαρχοντα docs + CLAUDE.md, οχι εικασιες): dual shape AGPL vs SAAS_MODE,
AI optional/per-feature + οι 6 providers (Ollama/Anthropic/OpenAI/Gemini/OpenRouter/
custom), local-first storage με SMB/FTP/OneDrive push-only mirror, soft-delete/Trash
αναστρεψιμα, JSON+CSV export, bulk-AI cost guard, stale-bundle hard-refresh, provider-
aware AI status fallback σε Ollama. Καμια νεα τιμη/limit εφευρεθηκε — τα SaaS plan limits
παραπεμπουν στο saas.md.

Προσθεσα link στο `docs/README.md` index (νεα εγγραφη «FAQ» μετα το Managed SaaS mode).

Validation: markdown only, κανενα build/Docker/AI call. Internal links του faq.md →
README.md, features.md, self-hosting.md, saas.md, configuration.md, mobile.md,
troubleshooting.md, ../LICENSE — ολα υπαρχουν. Code fences: μονο inline `code`, κανενα
fenced block. Καμια secret τιμη.

Collision guard: `git status --short` δειχνει προϋπαρχοντα .claude/launch.json +
apps/web/SAAS_PROGRESS.md (αλλης ρουτινας, ΔΕΝ τα αγγιξα)· staged κενο. Stage ΜΟΝΟ
docs/faq.md + docs/README.md + docs/DOCS_PROGRESS.md.

Επομενο run: εμπλουτισμος `docs/features.md` με screenshot placeholders ανα module, η
ενα `docs/glossary.md` (ορολογια: installment plan/signature, vendorKey series, mirror,
tenant/membership). Πρωτα finish-in-progress κανενα (ολα done).

## 2026-07-02 (cont.⁵)

Νεο doc: `docs/glossary.md` — το πρωτο glossary, οπως ειχε σημειωθει ως επομενο (features.md
+ saas.md + faq.md ηδη πληρη). Αλφαβητικο, με ορισμους σε απλη γλωσσα + link στο αναλυτικο doc
αντι επαναληψης. Καλυπτει τους Pharos-specific ορους: AI command bar, anomaly badge, receipt
status (verified/parsed/failed/archived), installment signature/origin/merge-bind/
installmentGroupKey, vendorKey series, mirror, local-first, price panel/verdict/target,
quick verify, bill image, budget, bulk-AI cost guard, period, store resolution, soft-delete/
Trash, SaaS tenant/membership/role, currency-symbol single-currency.

Accuracy (διαβασα κωδικα, οχι εικασιες): `lib/installments.ts` (signature = merchant|total|
origin, origin = period − currentInstallment [installmentOrigin], installmentGroupKey =
planKey override || signature, merged flag οταν bound), `app/expenses/lib.ts` (vendorKey
normalise). Οι υπολοιποι οροι απο CLAUDE.md (source of truth) + τα υπαρχοντα docs. Καμια νεα
τιμη/limit εφευρεθηκε.

Bonus accuracy check: επιβεβαιωσα οτι το `docs/api.md` ειναι in-sync — 47 route.ts κατω απο
`app/api/v1/` vs api.md, ολα τα 26 distinct paths τεκμηριωμενα (find + grep). Δεν χρειαστηκε
edit στο api.md.

Προσθεσα link στο `docs/README.md` index (νεα εγγραφη «Glossary» μετα το FAQ).

Validation: markdown only, κανενα build/Docker/AI call. Internal links του glossary.md →
features.md (+ anchors ai-command-bar--history, expenses--income, receipts, calendar,
inventory--shopping-items, statements--installments, trash-soft-delete), api.md, saas.md,
configuration.md — ολα υπαρχουν. Code fences: 0 (μονο inline `code`). Καμια secret τιμη.

Collision guard: `git status --short` δειχνει προϋπαρχον .claude/launch.json (αλλης ρουτινας,
ΔΕΝ το αγγιξα)· staged κενο. Stage ΜΟΝΟ docs/glossary.md + docs/README.md + docs/DOCS_PROGRESS.md.

Επομενο run: εμπλουτισμος `docs/features.md` με screenshot placeholders ανα module, η ενα
`docs/contributing-docs.md` (πως να προσθεσεις/διορθωσεις doc). Πρωτα finish-in-progress κανενα
(ολα done).

## 2026-07-02 (cont.⁶)

Νεο doc: `docs/architecture.md` — το πρωτο architecture overview (πραγματικο κενο· ολα τα
guides a-f της SKILL ηδη υπηρχαν, αλλα κανενα δεν εξηγουσε πως ταιριαζουν τα κομματια). Κοινο
για ΚΑΙ self-hosters (τι τρεχει στο κουτι τους) ΚΑΙ contributors (χαρτης codebase). Περιεχει:
short version, deployment topology (ascii diagram host→web/mongo + companions + host Ollama),
services & profiles table (web/mongo/searxng default· scraper/flaresolverr profile scraper·
mongo-express profile tools), two auth surfaces (session cookie UI vs bearer token API, split
στο middleware.ts edge), request flows (RSC+Server Actions UI, /api/v1 REST mobile, /api/files,
/api/mcp, /api/saas), data layer (Mongoose models list, files-on-disk local-first, soft-delete),
storage backends+mirror push-only, AI on-the-side (6 providers, host Ollama via host.docker.
internal, aiFeatures client/server split, Job queue), optional companions, SaaS overlay (tenancy/
billing SAAS_MODE), mobile client, «where things live» quick map.

Accuracy (διαβασα κωδικα, οχι εικασιες): `docker-compose.yml` (services/profiles/ports/env/
loopback bindings ολα verbatim), `middleware.ts` (session verify edge + /api bearer 401 + first-
run /setup redirect + sliding idle SESSION_IDLE_HOURS), `lib/apiAuth.ts` (Bearer <token> →
User.apiToken lookup, withAuth 401), `ls models/` (23 models, ολα ονομαστικα), `ls app/api/`
(v1/files/mcp/saas), `grep SAAS_MODE` → lib/tenancy + lib/billing. Container names kept-as-is
σημειωμενο (predate rename). Καμια νεα τιμη/env εφευρεθηκε.

Προσθεσα link στο `docs/README.md` index (νεα εγγραφη «Architecture» στην ΚΟΡΥΦΗ των Guides,
πριν το Self-hosting — λογικη σειρα: καταλαβε το συστημα → μετα τρεξε το).

Validation: markdown only, κανενα build/Docker/AI call. Internal links του architecture.md →
api/configuration/glossary/mobile/saas/self-hosting/troubleshooting.md ολα OK· 12 relative repo
paths (../apps/web/**, ../apps/mobile, ../services δεν χρησιμοποιηθηκε ως link — μονο στον πινακα
ως plaintext) ολα υπαρχουν (verified με test -e). Code fences: 4 fence-lines = 2 balanced blocks
(topology diagram + start commands). Καμια secret τιμη — τα env αναφερονται μονο ονομαστικα.

Collision guard: `git status --short` δειχνει προϋπαρχον .claude/launch.json (αλλης ρουτινας,
ΔΕΝ το αγγιξα)· staged κενο πριν το add. Stage ΜΟΝΟ docs/architecture.md + docs/README.md +
docs/DOCS_PROGRESS.md.

Επομενο run: `docs/contributing-docs.md` (πως να προσθεσεις/διορθωσεις doc — style, link-check,
markdown-first) η enrich `docs/features.md` με screenshot placeholders ανα module. Πρωτα finish-
in-progress κανενα (ολα done).

## 2026-07-03

Νεο doc: `docs/backup-and-restore.md` — πραγματικο κενο (backups ηταν διασκορπισμενα: μια
συντομη ενοτητα στο self-hosting.md §7 + JSON export/import + storage mirror + Trash, το καθενα
αλλου). Ενοποιημενος operational οδηγος, το #1 μελημα καθε self-hoster. Περιεχει: (1) πληρες
offline backup = ΚΑΙ database ΚΑΙ files (γιατι το DB κραταει μονο paths), (2) automation nightly
dump (cron Linux + macOS/launchd TCC caveat για ~/Desktop), (3) restore με scripts/restore.sh
(destructive --drop, typed yes), (4) in-app JSON export/import (portable subset), (5) CSV export
(3 kinds), (6) remote storage mirror (push-only), (7) Trash / soft-delete (30d auto-purge), (8)
«what to keep and where» 3-2-1 routine.

Accuracy (διαβασα κωδικα, οχι εικασιες): `scripts/backup.sh` (env defaults MONGO_USER/PASS/DB/
CONTAINER=homepage-mongo, BACKUP_DIR, RETENTION_DAYS=14, archive homepage-<ts>.archive.gz, fail-
loud σε empty/no-container), `scripts/restore.sh` (mongorestore --drop --nsInclude, prompt yes),
`docker-compose.yml` (STORAGE_ROOT=/storage bind απο ./data/storage, mongo-data named volume /data/db,
container_name homepage-mongo), `app/settings/actions.ts` (exportData → {app:'homepage',version:1,
collections} με BACKUP_MODELS = items/receipts/statements/subscriptions/vouchers/cards/tasks/stores
— ΣΗΜΑΝΤΙΚΟ: expenses ΔΕΝ ειναι μεσα, ουτε settings/files· importData upsert by _id, isSafeStoredPath
guard· exportCSV kinds receipts/expenses/items + toCSV injection-guard + BOM), `SettingsClient.tsx`
(download filenames pharos-backup-YYYY-MM-DD.json, pharos-<kind>-YYYY-MM-DD.csv). Trash/30d απο
CLAUDE.md (source of truth) + softDelete plugin· statements hard-delete caveat απο CLAUDE.md.
Καμια νεα τιμη/env εφευρεθηκε· τα secrets μονο ως placeholder (changeme = το υπαρχον default του
script, οχι πραγματικο).

Προσθεσα link στο `docs/README.md` index (νεα εγγραφη «Backup & restore» μετα το Configuration) +
ενα pointer-line στο self-hosting.md §7 (μεσα στο docs/ territory) προς τον νεο οδηγο.

Validation: markdown only, κανενα build/Docker/AI call. Fence-lines = 8 (4 balanced blocks). Internal
links → self-hosting/configuration/features/troubleshooting.md ολα υπαρχουν (test -e). Καμια secret.

Collision guard: `git status --short` δειχνει προϋπαρχοντα .claude/launch.json + apps/mobile/src/screens
edits (αλλων ρουτινων, ΔΕΝ τα αγγιξα)· staged κενο πριν το add. Stage ΜΟΝΟ docs/backup-and-restore.md +
docs/README.md + docs/self-hosting.md + docs/DOCS_PROGRESS.md.

Επομενο run: η enrich `docs/features.md` με screenshot placeholders ανα module, η `docs/updating.md`
(dedicated upgrade/migration guide — τωρα ειναι μονο μεσα στο self-hosting.md). Πρωτα finish-in-progress
κανενα (ολα done).

## 2026-07-03 (updating guide)

Νεο doc: `docs/updating.md` — dedicated upgrade/migration/rollback οδηγος. Ηταν το προτεινομενο
επομενο βημα του προηγ. run· η αναβαθμιση ζουσε μονο ως συντομη §8 στο self-hosting.md (pull/up +
hard-refresh note), χωρις version pinning, migrations, rollback, MongoDB upgrade. Περιεχει: (1)
τι επιβιωνει σε upgrade (πινακας: mongo-data volume, ./data/storage bind, .env — μονο το web image
αλλαζει), (2) before-you-upgrade (full backup DB+files, note current image, skim ROADMAP), (3)
prebuilt image pull/up + verify, (4) from-source git pull + build, (5) image tags & PHAROS_IMAGE
pinning, (6) database migrations = ΚΑΝΕΝΑ separate step (Mongoose backward-compat· το migrate.ts
ειναι μονο το legacy-tracker import, οχι upgrade migration· TODO για CHANGELOG), (7) after-upgrade
(hard refresh, logs, sanity check), (8) rollback = pin previous tag + pull/up, (9) MongoDB pinned
mongo:7 δεν αλλαζει σε app upgrade.

Accuracy (διαβασα κωδικα/config, οχι εικασιες): `docker-compose.prod.yml` (image
${PHAROS_IMAGE:-ghcr.io/achilleasgkekas/pharos:latest}, header comments με τα ακριβη pull/up
commands + pin example 1.2.3, required .env AUTH_SECRET/NEXT_SERVER_ACTIONS_ENCRYPTION_KEY/MONGO_*,
volumes ./data/storage:/storage + mongo-data:/data/db, container_name homepage-web/homepage-mongo),
`.github/workflows/release.yml` (v*.*.* tag → :X.Y.Z/:X.Y/:X/:latest· workflow_dispatch → :edge·
multi-arch amd64+arm64· GHCR GITHUB_TOKEN), `ls scripts/` (migrate.ts = tracker→Mongo one-off,
ΟΧΙ upgrade migration· επιβεβαιωσα zero startup-migration hook σε compose/Dockerfile + zero
runMigration/schemaVersion στο src), `apps/web/package.json` version 0.1.0. Καμια νεα τιμη/env/tag
εφευρεθηκε· secrets μονο ως placeholder (PHAROS_IMAGE tag = παραδειγμα).

Προσθεσα link στο `docs/README.md` index (νεα «Updating» μετα το Backup & restore) + pointer-line
στο self-hosting.md §8 προς τον νεο οδηγο.

Validation: markdown only, κανενα build/Docker/AI call. Fence-lines = 14 (7 balanced blocks). Internal
links → self-hosting/backup-and-restore/configuration/troubleshooting.md + ../ROADMAP.md ολα υπαρχουν
(test -e). Καμια secret.

Collision guard: `git status --short` δειχνει προϋπαρχοντα .claude/launch.json + apps/mobile/src/screens
edits (αλλων ρουτινων, ΔΕΝ τα αγγιξα)· staged κενο πριν το add. Stage ΜΟΝΟ docs/updating.md +
docs/README.md + docs/self-hosting.md + docs/DOCS_PROGRESS.md.

Επομενο run: enrich `docs/features.md` με screenshot placeholders ανα module, η `docs/contributing-docs.md`
(docs style + link-check + markdown-first convention). Πρωτα finish-in-progress κανενα (ολα done).

## 2026-07-04 (api.md sync — expenses rescan)

Sync-check του `docs/api.md` (source of truth για το mobile) εναντια στα ΠΡΑΓΜΑΤΙΚΑ route files.
`find apps/web/src/app/api/v1 -name route.ts` → 50 routes· εξαγωγη ολων + diff με το api.md.
Ενα GAP: **`POST /api/v1/expenses/:id/rescan`** υπηρχε στον κωδικα (`expenses/[id]/rescan/route.ts`)
αλλα ΕΛΕΙΠΕ απο τον πινακα «Expenses & income». Διαβασα το route (mirror του receipts rescan:
body `{ ocr?: boolean }`, καλει `rescanExpense(id, useOcr)`, γυρναει `{ expense }` με τον GET
serializer, αφηνει το record unverified) και προσθεσα τη σειρα με το σωστο **(AI: expenses)** flag.

Επιβεβαιωσα οτι τα statements ειναι σωστα GET-only στο doc (grep: μονο GET σε statements/route.ts
+ statements/[id]/route.ts· το PDF import ειναι web-action, οχι api/v1) οποτε δεν χρειαστηκε αλλαγη.
Ολα τα υπολοιπα 49 routes ηδη documented (1-προς-1 match). Καμια νεα τιμη/shape εφευρεθηκε — μονο
οτι λεει ο κωδικας.

Validation: markdown only, κανενα build/Docker/AI call. Fence-lines api.md = 12 (6 balanced blocks).
Internal links (README/self-hosting/features/configuration/mobile.md) ολα υπαρχουν (test -e). Καμια secret.

Collision guard: `git status --short` δειχνει προϋπαρχοντα .claude/launch.json + apps/mobile/src/screens
edits (αλλων ρουτινων, ΔΕΝ τα αγγιξα)· staged κενο πριν το add. Stage ΜΟΝΟ docs/api.md +
docs/DOCS_PROGRESS.md.

Επομενο run: enrich `docs/features.md` με screenshot placeholders ανα module, η `docs/contributing-docs.md`
(docs style + markdown-first convention + link-check). Πρωτα finish-in-progress κανενα (ολα done).

## 2026-07-05 (νεο doc: security.md)

Νεο public-facing `docs/security.md` — security *οδηγος* για operators. Ηταν το κενο του set:
υπηρχε root `SECURITY.md` (hardening changelog + reporting) + μια συντομη §HTTPS στο self-hosting.md,
αλλα ΚΑΝΕΝΑ security guide στα docs. Το νεο doc πλαισιωνεται διαφορετικα (δεν διπλωνει το root):
default threat model, τα δυο auth surfaces, rate limiting, built-in hardening, secrets, network
exposure, + checklist «πριν το βγαλεις στο internet». Cross-link στο root SECURITY.md για reporting.

Accuracy (διαβασα κωδικα, οχι εικασιες): `lib/apiAuth.ts` (bearerUser → `Authorization: Bearer`,
`User.findOne({apiToken})`, withAuth 401/500 wrap + rateLimit `u:<id>`), `api/v1/auth/login/route.ts`
(POST {username,password} → {token,user}, apiToken format `phk_<base64url>` randomBytes(24) on first
login, login rate-key `login:<ip>`), `lib/apiRateLimit.ts` (config-gated OFF by default, env
API_RATE_LIMIT + API_RATE_WINDOW_MS default 60000, fixed-window per-process Map, 429 + Retry-After +
X-RateLimit-*), `.env.example` (AUTH_SECRET/AUTH_COOKIE_SECURE/NEXT_SERVER_ACTIONS_ENCRYPTION_KEY/
MONGO_PASS/API_RATE_LIMIT). Session layer (middleware JWT/scrypt/jose/AUTH_SECRET) + path-traversal/
SSRF/upload-cap/CSP/CSV-injection/secret-redaction αντληθηκαν απο το root SECURITY.md (verified against
its text). Καμια νεα τιμη/env/token εφευρεθηκε· secrets μονο ως placeholder (openssl rand παραδειγμα).

Προσθεσα link στο `docs/README.md` index (νεα «Security» μετα το Configuration).

Validation: markdown only, κανενα build/Docker/AI call. Fence-blocks = 0 (πινακες + inline code μονο,
balanced). Ολα τα internal .md links resolve (test -e: api/architecture/backup-and-restore/configuration/
glossary/mobile/self-hosting/updating.md). Anchor-check: διορθωσα `self-hosting.md#environment` →
`#3-configure-env` (πραγματικο heading «3. Configure .env») + `../SECURITY.md#manual-apply` → drop
fragment (το πραγματικο slug εχει trailing clause, fragile). `configuration.md#ai-providers` σωστο.

Collision guard: `git status --short` δειχνει προϋπαρχοντα .claude/launch.json + .github/workflows
(deleted) + apps/mobile/src/screens edits (αλλων ρουτινων, ΔΕΝ τα αγγιξα)· staged κενο πριν το add.
Stage ΜΟΝΟ docs/security.md + docs/README.md + docs/DOCS_PROGRESS.md.

Επομενο run: enrich `docs/features.md` με screenshot placeholders ανα module, η `docs/contributing-docs.md`
(docs style + markdown-first convention + link-check). Πρωτα finish-in-progress κανενα (ολα done).

## 2026-07-05 (accuracy fix: features.md stale cross-refs)

Ολο το set ειναι πλεον writ-ten (README, api, architecture, backup-and-restore, configuration,
faq, features, glossary, mobile, saas, security, self-hosting, troubleshooting, updating +
openapi.yaml). Αντι για screenshot placeholders (χαμηλη αξια χωρις πραγματικες εικονες) διαλεξα
accuracy pass στο `docs/features.md`, που ειχε STALE forward-refs: 3× «configuration guide (planned)»
και «an API reference is being written (see DOCS_PROGRESS.md)» — αλλα και τα δυο docs υπαρχουν πλεον.

Fixes (4 σημεια): (1) intro «configuration guide (planned)» → [Configuration guide](configuration.md)·
(2) intro «API reference is being written (DOCS_PROGRESS.md)» → [API reference](api.md)· (3) AI command
bar «(see configuration)» → [Configuration → AI providers](configuration.md#ai-providers)· (4)
Notifications «(see configuration)» → [Configuration → Notifications](configuration.md#notifications)·
(5) Settings footer «configuration guide (planned)» → [Configuration guide](configuration.md).
Anchors verified: configuration.md εχει «## AI providers» (#ai-providers) + «## Notifications»
(#notifications). Καμια αλλαγη περιεχομενου, μονο τα links· καμια νεα τιμη εφευρεθηκε.

Validation: markdown only, κανενα build/Docker/AI call. grep → 0 εναπομειναντα «(planned)»/«being
written»/«DOCS_PROGRESS» στο features.md. test -e → self-hosting/configuration/api.md resolve. Fence
count features.md = 0 (prose, balanced). Καμια secret.

Collision guard: `git status --short` πριν το add δειχνει μονο `?? apps/web/src/lib/tenancy/current.ts`
(untracked, αλλης ρουτινας, ΔΕΝ το αγγιξα)· staged κενο. Stage ΜΟΝΟ docs/features.md + docs/DOCS_PROGRESS.md.

Επομενο run: `docs/contributing-docs.md` (docs style + markdown-first convention + link-check helper),
η pass για stale forward-refs στα υπολοιπα docs (grep «(planned)»/«coming soon» σε ολο το set). Πρωτα
finish-in-progress κανενα (ολα done).

## 2026-07-05 (accuracy: api.md write-response convention)

Ολο το doc-set ειναι writ-ten. Αντι για screenshot placeholders (χαμηλη αξια χωρις πραγματικες
εικονες) εκανα accuracy pass στο `docs/api.md` (source of truth). Κενο: το doc τεκμηριωνε το
list envelope (`{ data, total, limit, offset }`) αλλα ΟΧΙ τα write-response shapes· τα PATCH/POST
rows ηταν ασυνεπη (καποια «→ { item }», αλλα ΤΙΠΟΤΑ). Το προσφατο commit «fix(api/v1): PATCH
expenses/subscriptions/vouchers return { <resource> }» ευθυγραμμισε τον κωδικα σε ενα consistent
pattern που δεν φαινοταν στα docs.

Προσθεσα νεο `### Write responses` subsection (μετα το List envelope, πριν το Incremental sync)
με πινακα: POST create → `201 { <resource> }` (singular key)· PATCH update → `200 { <resource> }`
(ιδια trimmed fields με τη λιστα)· DELETE → `200 { ok, id }`· + exceptions (shopping-list =
`{ items }`/`{ ok }`, AI/scan = `{ data }`).

Accuracy (διαβασα κωδικα, οχι εικασιες): επιβεβαιωσα return shapes σε κωδικα —
`items/[id]`, `expenses/[id]`, `subscriptions/[id]`, `vouchers/[id]`, `tasks/[id]` route.ts
(PATCH → `{ <resource> }`, DELETE → `{ ok, id }`) + POST create σε items/tasks/expenses/
subscriptions/vouchers/cards/stores route.ts (ολα `NextResponse.json({ <resource> }, {status:201})`).
Επιβεβαιωσα shopping-list = `{ items }` + `{ ok:true }`. Καμια νεα τιμη/endpoint εφευρεθηκε.

Route-coverage check (παραπλευρα): σαρωσα ολα τα 50 route.ts κατω απο api/v1 και τα paths του
api.md — 100% coverage, κανενα undocumented endpoint (συμπ. `/auth/login`).

Validation: markdown only, κανενα build/Docker/AI call. Fence balance api.md = 16 (even, balanced).
Καμια νεα .md link (μονο inline code + πινακας). Καμια secret.

Collision guard: `git status --short` πριν το add δειχνει `M apps/landing/app/page.tsx` (foreign,
αλλης ρουτινας, ΔΕΝ το αγγιξα, unstaged)· staged κενο. Stage ΜΟΝΟ docs/api.md + docs/DOCS_PROGRESS.md.

Επομενο run: `docs/contributing-docs.md` (docs style + markdown-first convention + link-check helper),
η pass για write-response shapes ανα-row (προαιρετικο· η convention τα καλυπτει ηδη ενιαια). Ολα done.

## 2026-07-05 (νεο doc: contributing-docs.md)

Ολο το content set ηταν ηδη writ-ten + accurate (link-check clean, 0 broken .md links, καμια
stale forward-ref στα content docs — τα 2 grep hits ηταν false positives: Kanban column name
«In-Progress» στο features.md + query-param `?status=in-progress` στο api.md). Εγραψα λοιπον το
εναπομειναν suggested doc: **`docs/contributing-docs.md`** — οδηγος συγγραφης της τεκμηριωσης
(οχι του κωδικα· το root CONTRIBUTING.md καλυπτει code, μολις 2 αναφορες σε docs, μηδεν overlap).

Περιεχομενο: (1) markdown-first / no-build convention (γιατι plain GFM, relative `.md` links,
anchors)· (2) file-layout table + καν το README index εντρυ οταν προσθετεις guide· (3) style rules
(English, no em-dashes, accuracy-over-completeness, placeholders-only για secrets, balanced fences)·
(4) **api.md ↔ routes sync rule** (route files = source of truth· 4-step process + `find` drift-check
one-liner)· (5) validation helpers copy-paste (link-check loop, fence-parity loop, staged-secret grep)·
(6) commit discipline (stage-only-own-files, collision guard, no force-push). + README.md index εντρυ.

Accuracy: επιβεβαιωσα (α) root CONTRIBUTING.md δεν καλυπτει docs (grep → μονο 2 casual αναφορες)·
(β) api.md λεει ηδη «source of truth = route files» (lines 15-22) → το sync-rule ευθυγραμμιζεται·
(γ) write-response convention (201 `{ <resource> }` / 200 `{ <resource> }` / `{ ok, id }`) ταιριαζει
με το προηγουμενο api.md accuracy pass. Καμια νεα τιμη/env/endpoint εφευρεθηκε.

Validation: markdown only, κανενα build/Docker/AI call. Link-check ολου του set → 0 BROKEN (νεα
contributing-docs.md links [configuration#ai-providers, api.md, ../CONTRIBUTING.md] resolve· README
νεο link → contributing-docs.md resolve). Fence parity contributing-docs.md = 8 (even). Καμια secret
(τα secret-παραδειγματα ειναι placeholders `<your-secret>`).

Collision guard: `git status --short` πριν το add → μονο `M docs/README.md` + `?? docs/contributing-docs.md`
(τα δικα μου)· staged κενο, κανενα foreign αρχειο. Stage ΜΟΝΟ docs/contributing-docs.md + docs/README.md
+ docs/DOCS_PROGRESS.md.

Επομενο run: stale-forward-ref sweep ολου του set με grep «(planned)»/«coming soon» (τωρα clean, να
μεινει clean καθως το app εξελισσεται), η screenshot placeholders οταν υπαρξουν πραγματικες εικονες.
Ολα τα content docs done + accurate.

## 2026-07-05 (saas.md: lifecycle + trial dunning + BYO-key crypto)

Το content set ηταν ολο accurate, αλλα το `docs/saas.md` δεν κατεγραφε δυο προσφατα SaaS
increments που ειδα στο git log: D4 (trial-lapse sweep / dunning, `8155ba4`) και D5 (BYO-key
secret-at-rest crypto, `2612b5a`). Τα προσθεσα, διαβαζοντας τον πραγματικο κωδικα (οχι εικασιες).

Τι εγραψα στο saas.md:
1. **Νεα «## Workspace lifecycle»** section — πινακας των 5 status (pending/trialing/active/
   suspended/canceled) + access ανα state. Επιβεβαιωσα το enum απο `models/Tenant.ts:31`
   (`['pending','trialing','active','suspended','canceled']`, default `trialing`). Trial length
   placeholder = 14 μερες (`lib/billing/trial.ts` DEFAULT_TRIAL_DAYS).
2. **«### Trial dunning and lapse sweep»** — 2-pass sweep (WARN εντος 3 ημερων = WARN_BEFORE_DAYS,
   ενα idempotent email με trialWarnEmailedAt stamp· SUSPEND οταν trialEndsAt περασε → `suspended`
   οχι `canceled`). Open-ended trials δεν lapse-αρουν. Πηγη: `lib/billing/trialLapse.ts` +
   `trialSweep.ts`. + νεο endpoint row **`POST /api/saas/trials/sweep`** (Bearer CRON_SECRET,
   404 SaaS-off / 500 no-secret / 401 bad-token) απο το `app/api/saas/trials/sweep/route.ts`.
3. **Νεα «## Bring-your-own-key AI (secret-at-rest)»** section — AES-256-GCM, `gcm1$iv$tag$ct`
   envelope, key derived απο AUTH_SECRET via scrypt (zero new dep), fail-closed, providers
   (anthropic/openai/gemini/openrouter/custom), masked preview. Πηγη: `lib/tenancy/secretCrypto.ts`
   + `lib/billing/byoKey.ts`. + OSS-parity blockquote (self-hosted κραταει unencrypted AppConfig key).
4. Env vars table: προσθεσα **`CRON_SECRET`** row + ενημερωσα το `AUTH_SECRET` row (τωρα και για
   το BYO-key KDF· rotation invalidates ciphertexts).

Accuracy: καμια τιμη/env/endpoint εφευρεθηκε — ολα cross-checked με τα source files. Status enum,
WARN_BEFORE_DAYS=3, DEFAULT_TRIAL_DAYS=14, cipher format, provider set, sweep response keys
(warned/warnFailed), auth guards ολα διαβασμενα απο κωδικα.

Validation: markdown only, κανενα build/Docker/AI call. Fence parity saas.md = 0 (balanced, ο tables-
only doc δεν εχει fenced blocks). Internal links → OK README.md/api.md/configuration.md/self-hosting.md.
Secret scan (sk_live/sk_test/AUTH_SECRET=/CRON_SECRET=) → κανενα literal secret (μονο placeholders).

Collision guard: πριν το add ελεγχος `git status --short` + `git diff --cached` (βλ. commit βημα).
Stage ΜΟΝΟ docs/saas.md + docs/DOCS_PROGRESS.md.

Επομενο run: sync check του features.md/configuration.md με τα ιδια D4/D5 (αν χρειαζεται mention),
η stale-forward-ref sweep. Content set παραμενει accurate.

## 2026-07-06 (saas.md: workspace + BYO-key management + audit endpoints)

Το προηγουμενο run κατεγραψε το D5 BYO-key **crypto** (secret-at-rest) αλλα οχι το
**management endpoint** που προστεθηκε στο πιο προσφατο commit `97ca9e7` (BYO-key storage +
management route). Ελεγξα το control-plane API section: τα workspace routes (`/api/saas/workspace`,
`.../reactivate`, `.../ai-key`) και το `/api/saas/audit` **δεν** ηταν τεκμηριωμενα σε πινακες.
Τα προσθεσα, διαβαζοντας τα πραγματικα route files (οχι εικασιες).

Τι εγραψα στο saas.md (3 νεες subsections πριν το env-vars section):
1. **### Workspace settings** — GET (any member) / PATCH rename (owner-admin) / DELETE soft-cancel
   `status:'canceled'` (owner only, data-DB drop = ξεχωριστο manual flow) / POST reactivate
   (owner only, `409` αν οχι σε `canceled`). Πηγη: `app/api/saas/workspace/route.ts` +
   `workspace/reactivate/route.ts` (slug/dbName immutable, gating απο resolveWorkspaceSession).
2. **### Bring-your-own-key management** — GET masked status (`configured`/`key`/`cryptoReady`/
   `providers`), PUT store/overwrite (`400` invalid provider ή empty key, `503 crypto_unavailable`
   οταν AUTH_SECRET unset), DELETE revert-to-platform-key. Ολα owner/admin, masked-only response,
   audited (`ai_key.set`/`ai_key.cleared`, provider-only). Link στο υπαρχον BYO-key crypto section.
   Πηγη: `app/api/saas/workspace/ai-key/route.ts`.
3. **### Activity (audit)** — GET activity trail, newest-first, owner/admin, `limit` 1..200 def 50,
   `before` ISO cursor pagination, unknown `action` = no filter, whitelisted serializer. Πηγη:
   `app/api/saas/audit/route.ts`.

Accuracy: καμια τιμη/env/endpoint εφευρεθηκε. Status codes (400/404/409/503), provider set
(anthropic/openai/gemini/openrouter/custom), response keys, gating roles, limit bounds ολα
cross-checked με τον κωδικα. Το BYO-key anchor `#bring-your-own-key-ai-secret-at-rest` ταιριαζει
με το υπαρχον heading.

Validation: markdown only, κανενα build/Docker/AI call. Fence parity saas.md = 0 (balanced).
Anchor target present (1). Secret scan (sk_live/sk_test/sk-ant-/AUTH_SECRET=/STRIPE_SECRET_KEY=)
→ clean, μονο placeholders. Pipe-escaped `\|` στο union-type cell.

Collision guard: `git status --short` πριν το add· stage ΜΟΝΟ docs/saas.md + docs/DOCS_PROGRESS.md.

Επομενο run: το control-plane API section ειναι πλεον πληρες (ολα τα 24 saas routes καλυμμενα).
Επομενο = sync check features.md/configuration.md με το BYO-key settings UI (αν εκτεθει στον χρηστη),
η stale-forward-ref sweep ολου του set.

## 2026-07-06 (saas.md: GDPR account data-export endpoint)

Το πιο προσφατο commit `401b2fc` (feat(saas): GDPR account data-export endpoint,
Art. 15/20) προσθεσε νεο SaaS-gated route που **δεν** ηταν τεκμηριωμενο πουθενα
(grep "export" σε saas.md + api.md = 0 hits). Διαβασα τα πραγματικα αρχεια
(`app/api/saas/account/export/route.ts` + ο pure assembler `lib/tenancy/accountExport.ts`)
και προσθεσα νεα subsection **### Data export (GDPR)** στο saas.md, τοποθετημενη μετα
το "Email verification & password" και πριν το "Members and invitations".

Τι εγραψα:
- Πινακας μιας γραμμης: `GET /api/saas/account/export`, authenticated, streams JSON
  attachment (`Content-Disposition: attachment; filename="pharos-account-<id>.json"`,
  `Cache-Control: no-store`). Status codes: 401 signed-out, 404 account-gone / SaaS-off.
- Επεξηγηση: **control-plane data only** (account profile + memberships), οχι tenant
  data-DB, οχι self-hosted User/bearer path. Workspace content εξαιρειται (ανα-workspace
  export ξεχωριστα). Secrets (passwordHash, verify/reset tokens) ποτε δεν διαβαζονται,
  ο assembler κανει project μονο whitelisted πεδια.
- Πληρες JSON payload sample (format/version/generatedAt/notice/account/memberships)
  αντιγραμμενο απο το `AccountExport` type. Ολα τα memberships regardless of status,
  unresolvable tenant → skipped (οχι blank rows).

Accuracy: καμια τιμη/header/endpoint εφευρεθηκε, ολα cross-checked με τον κωδικα
(response headers, status codes, payload keys, gating). Placeholders μονο στο sample.

Validation: markdown only, κανενα build/Docker/AI call. Fence parity saas.md = 2 markers
(1 balanced block). Secret scan (sk_live/sk_test/sk-ant-/AUTH_SECRET=/STRIPE_SECRET_KEY=)
→ clean. Κανενα route-count claim στο published doc προς διορθωση (το "24 routes" ζουσε
μονο στο DOCS_PROGRESS). Πραγματικος saas route count = 26.

Collision guard: `git status --short` πριν το add· stage ΜΟΝΟ docs/saas.md + docs/DOCS_PROGRESS.md.

Επομενο run: sync check αν το data-export εκτιθεται στο account-settings UI (features.md
mention) οταν χτιστει· αλλιως stale-forward-ref sweep ολου του set. Τα 26 saas routes
πλεον ολα τεκμηριωμενα.

## 2026-07-06 (saas.md: workspace erasure-request lifecycle, GDPR Art. 17)

Το πιο προσφατο commit `a6d0746` (feat(saas): workspace erasure-request lifecycle,
Art. 17) προσθεσε νεο SaaS-gated route `/api/saas/workspace/erasure` που **δεν** ηταν
τεκμηριωμενο (grep "erasure" σε saas.md = 0 hits). Διαβασα τα πραγματικα αρχεια
(`app/api/saas/workspace/erasure/route.ts` + ο pure helper `lib/tenancy/erasure.ts`)
και προσθεσα νεα subsection **### Workspace erasure (GDPR)** στο saas.md, τοποθετημενη
μετα το "Data export (GDPR)" και πριν το "Members and invitations".

Τι εγραψα:
- Πινακας 3 γραμμων: `GET` (any active member, current state), `POST` (owner only,
  schedule, idempotent, `403`/`400`), `DELETE` (owner only, cancel, idempotent, `403`).
- Gating: `404` SaaS off, `401` signed out, `403` not member (GET) / not owner (POST/DELETE).
  Session resolves ακομα για inactive workspace (allowInactive=true) → owner mid-erasure
  μπορει read/cancel. Ολα διαβαζουν/γραφουν ΜΟΝΟ το control-plane Tenant doc.
- Reversible marker· destructive drop = ξεχωριστο manual/gated flow, ΠΟΤΕ automated routine.
- Orthogonal to `status` (δεν suspend-αρει, owner κραταει access στο grace window).
- Audit actions: `workspace.erasure_requested` / `workspace.erasure_canceled`.
- Response shape sample (`workspace`/`graceDays`/`erasure` ErasureView: requested/requestedAt/
  scheduledAt/requestedBy/graceDaysLeft/due). graceDaysLeft = whole days up-rounded clamp 0,
  due flips οταν scheduledAt περασει.
- Callout: το graceDays=30 ειναι **placeholder** (GitHub/Google-style), final = needs decision.

Accuracy: καμια τιμη/action/status-code εφευρεθηκε — ολα cross-checked με τον κωδικα
(ERASURE_GRACE_DAYS=30, ErasureView keys, audit action strings, gating roles, 400/403/404/401).
Placeholders μονο στο JSON sample (`<account-id>`, `acme`).

Validation: markdown only, κανενα build/Docker/AI call. Fence parity saas.md = 4 markers
(2 balanced blocks). Secret scan (sk_live/sk_test/sk-ant-/AUTH_SECRET=/STRIPE_SECRET_KEY=)
→ clean. Πραγματικος saas route count = 27 (ηταν 26).

Collision guard: `git status --short` πριν το add· stage ΜΟΝΟ docs/saas.md + docs/DOCS_PROGRESS.md.

Επομενο run: sync check αν το erasure/data-export εκτιθεται στο account/workspace-settings UI
(features.md mention) οταν χτιστει· αλλιως stale-forward-ref sweep ολου του set. Τα 27 saas
routes πλεον ολα τεκμηριωμενα.

## 2026-07-06 (saas.md: erasure purge SCAN, report-only, GDPR Art. 17)

Το πιο προσφατο commit `4a7c975` (feat(saas): erasure purge scaffold, report-only
due-workspace scan) προσθεσε νεο SaaS-gated + CRON_SECRET route
`POST /api/saas/workspace/erasure/purge` που **δεν** ηταν τεκμηριωμενο (grep "purge"
σε saas.md = 0 hits στο published doc). Διαβασα τα πραγματικα αρχεια
(`app/api/saas/workspace/erasure/purge/route.ts` + ο planner `lib/tenancy/erasurePurge.ts`)
και προσθεσα νεα subsection **#### Erasure purge scan (report-only)** μεσα στο
"Workspace erasure (GDPR)", μετα το graceDays placeholder callout και πριν το
"Members and invitations".

Τι εγραψα:
- Πινακας 1 γραμμης: `POST` με `Bearer <CRON_SECRET>`. Result shape
  `{ ok, scanned, dryRun, due, targets }`. Status codes: `404` SaaS off, `500`
  CRON_SECRET unset (fail-closed), `401` bad token.
- Εξηγηση οτι ειναι scheduler-driven (οπως το trials/sweep), constant-time bearer
  compare, ΟΧΙ account session. Reads ΜΟΝΟ control-plane Tenant collection (ιδιο
  erasureDueFilter), zero writes, data plane ποτε δεν αγγιζεται.
- **REPORT-ONLY**: `dryRun` παντα true, ΚΑΝΕΝΑ dropDatabase. Ο πραγματικος drop =
  ξεχωριστο manual/gated flow που το εγκρινει ανθρωπος, ΠΟΤΕ automated routine.
- JSON sample (targets[]: id/slug/dbName/requestedAt/scheduledAt/requestedBy/daysOverdue).
  daysOverdue = whole days past scheduled instant (floored, ≥0), mirror του graceDaysLeft.
- Defensive skip candidates με blank id/dbName (report ποτε δεν ονομαζει un-purgeable
  ή unsafe-to-name workspace). SaaS off → scanned:false + empty targets.

Accuracy: καμια τιμη/header/status-code εφευρεθηκε — ολα cross-checked με τον κωδικα
(dryRun always true, scanned false gate, 404/500/401, ErasurePurgeScanResult keys,
PurgeTarget keys, tokenMatches constant-time compare). **Διορθωση**: αρχικα εγραψα
dbName sample `pharos_tenant_acme`· grep-αρα τα tenancy tests → πραγματικη συμβαση
`tenant_<slug>` → το αλλαξα σε `tenant_acme`. Placeholders μονο `<tenant-id>`/`<account-id>`.

Validation: markdown only, κανενα build/Docker/AI call. Fence parity saas.md = 6 markers
(3 balanced blocks). Secret scan (sk_live/sk_test/sk-ant-/AUTH_SECRET=/STRIPE_SECRET_KEY=/
CRON_SECRET=<value>) → clean. Πραγματικος saas route count = 28 (ηταν 27).

Collision guard: `git status --short` πριν το add· stage ΜΟΝΟ docs/saas.md + docs/DOCS_PROGRESS.md.

Επομενο run: sync check αν erasure/purge/data-export εκτιθενται στο workspace-settings UI
(features.md mention) οταν χτιστει· αλλιως stale-forward-ref sweep ολου του set. Τα 28 saas
routes πλεον ολα τεκμηριωμενα.

## 2026-07-06 (saas.md: per-tenant WORKSPACE CONTENT export, GDPR Art. 20)

Το πιο προσφατο commit `ee9d705` (feat(saas): per-tenant content export scaffold) προσθεσε
νεο SaaS-gated route `GET /api/saas/workspace/export[?tenant=<slug>]` που **δεν** ηταν
τεκμηριωμενο (grep "workspace/export" σε saas.md = 0 hits· μονο το account/export υπηρχε).
Διαβασα τα πραγματικα αρχεια (`app/api/saas/workspace/export/route.ts` +
`lib/tenancy/workspaceExport.ts`) και προσθεσα νεα subsection **#### Workspace content export
(GDPR portability)** μεσα στο "Data export (GDPR)", μετα το account-export payload και πριν το
"Workspace erasure (GDPR)".

Τι εγραψα:
- Πινακας 1 γραμμης: `GET` owner/admin-only (requireManage), attachment JSON
  `pharos-workspace-<slug>.json`, `Cache-Control: no-store`. Status: `404` SaaS off, `401`
  signed out, `403` non-owner/admin. Δουλευει και σε suspended/canceled workspace
  (allowInactive) — portability δεν gate-αρεται σε billing.
- Read-only + model-agnostic reader (raw Mongo driver collection dumps, κανενα feature model
  import). Zero writes στο data plane· μονο control-plane `workspace.data_exported` audit row.
  Per-collection cap `WORKSPACE_EXPORT_MAX_DOCS` (default 10000), truncated flag, skip `system.*`.
- OSS parity callout: SaaS-only, reader refuses default tenant, 404 οταν SAAS_MODE off·
  self-hosted εχει το δικο του JSON backup/restore (Settings → Storage & data).
- JSON sample (format `pharos.workspace-export` v1, workspace slug/name/plan/status whitelist,
  collections[] name/count/truncated/docs). Collections sorted by name (clean diffs), docs
  verbatim, μονο whitelisted workspace fields στο envelope (ποτε secrets).
- Προσθεσα `WORKSPACE_EXPORT_MAX_DOCS` στον SaaS env-vars πινακα (με anchor link στη subsection).

Accuracy: καμια τιμη/header/status-code εφευρεθηκε — cross-checked με τον κωδικα (requireManage
+ allowInactive args στο resolveWorkspaceSession, maxDocs+1 truncation trick, isDefault guard →
[], format/version/notice/keys, audit action string `workspace.data_exported`, filename
sanitize). Placeholders μονο `<slug>`/`<account-id>`/`acme`.

Validation: markdown only, κανενα build/Docker/AI call. Fence parity saas.md = 8 markers
(4 balanced blocks). Secret scan (sk_live/sk_test/sk-ant-/AUTH_SECRET=/STRIPE_SECRET_KEY=/
CRON_SECRET=<value>) → clean. Anchor `#workspace-content-export-gdpr-portability` ταιριαζει
το heading. Πραγματικος saas route count = 29 (ηταν 28).

Collision guard: `git status --short` πριν το add· stage ΜΟΝΟ docs/saas.md + docs/DOCS_PROGRESS.md.

Επομενο run: ERASURE_GRACE_DAYS λειπει απο τον env-vars πινακα (gap εντοπισμενο)· η stale-forward-ref
sweep αν εκτεθουν τα export/erasure στο workspace-settings UI (features.md). Τα 29 saas routes
πλεον ολα τεκμηριωμενα.

## 2026-07-06 (saas.md: workspace FILE-BINARY export manifest, GDPR Art. 20 §8)

Το πιο προσφατο commit `20c12bd` (feat(saas): workspace file-binary export manifest —
report-only) προσθεσε νεο SaaS route `GET /api/saas/workspace/export/files[?tenant=<slug>]`
που **δεν** ηταν τεκμηριωμενο (grep "export/files" σε saas.md = 0 hits). Ειναι το binary-file
συμπληρωμα του content export (#46): τα receipt/statement PDFs + item photos ζουν στον δισκο
(STORAGE_ROOT), οχι στη Mongo, οποτε το collection dump μονο του ηταν incomplete.

Διαβασα τα πραγματικα αρχεια (`app/api/saas/workspace/export/files/route.ts` +
`lib/tenancy/workspaceFiles.ts`) και προσθεσα νεα subsection **#### Workspace file-binary
manifest (GDPR portability)** μεσα στο "Data export (GDPR)", αμεσως μετα το content-export
payload και πριν το "Workspace erasure (GDPR)".

Τι εγραψα:
- Πινακας 1 γραμμης: `GET` owner/admin-only (requireManage), attachment JSON
  `pharos-workspace-<slug>-files.json`, `Cache-Control: no-store`. Status: `404` SaaS off,
  `401` signed out, `403` non-owner/admin. Δουλευει σε suspended/canceled (allowInactive).
- Report-only by design (mirror του erasure purge scan, με anchor link): ΠΟΤΕ δεν διαβαζει
  file content, ΚΑΝΕΝΑ archive — packaging deferred ("Needs Achilleas"). Μονο control-plane
  audit row `workspace.files_manifested` (files/present/missing/bytes στο meta).
- Δυο read-only passes: (α) DB pass model-agnostic, projection ΜΟΝΟ file-ref fields
  (filePath/thumbPath/photos), path validation storage-relative (reject absolute + `..`
  traversal), dedupe+sort· (β) filesystem pass = stat μονο (size, οχι content), bad ref →
  exists:false bytes:0 χωρις throw.
- OSS parity callout: SaaS-only, reader refuses default tenant, 404 οταν SAAS_MODE off·
  self-hosted εχει file-preserving JSON backup/restore.
- JSON sample (format `pharos.workspace-files-manifest` v1, workspace slug/name/plan/status
  whitelist, totals files/present/missing/bytes, files[] path/bucket/exists/bytes). Files
  sorted by path (clean diffs), totals derived απο τη λιστα (header δεν αποκλινει), bucket =
  top-level storage bucket.

Accuracy: καμια τιμη/header/status/format εφευρεθηκε — cross-checked με τον κωδικα (saasGuard
+ resolveWorkspaceSession(slug,true,true) = requireManage+allowInactive, audit action string
`workspace.files_manifested`, filename `pharos-workspace-<safe>-files.json`, format/version/
notice/totals keys, isStorageRelative reject rules, SINGLE_FILE_FIELDS/ARRAY_FILE_FIELDS).
Placeholders μονο `<slug>`/`acme`.

Validation: markdown only, κανενα build/Docker/AI call. Fence parity saas.md = 10 markers
(5 balanced blocks, +1 νεο). Anchor `#erasure-purge-scan-report-only` ταιριαζει το heading
(γραμμη 422). Secret scan (sk_live/sk_test/sk-ant-/AUTH_SECRET=/STRIPE_SECRET_KEY=/
CRON_SECRET=<value>) → clean. Κανενα "N routes" count text στο saas.md για update.

Collision guard: `git status --short` πριν το add· stage ΜΟΝΟ docs/saas.md +
docs/DOCS_PROGRESS.md.

Επομενο run: ERASURE_GRACE_DAYS λειπει ακομα απο τον env-vars πινακα (gap εντοπισμενο δυο runs
πριν, δεν υπαρχει στο saas.md)· η stale-forward-ref sweep αν εκτεθουν export/erasure/files στο
workspace-settings UI (features.md).

## 2026-07-09 (saas.md: Superadmin console §8 + SAAS_SUPERADMIN_EMAILS)

Το commit `c282c68` (feat(saas): superadmin console scaffold, read-only cross-tenant listing)
προσθεσε νεο control-plane route `GET /api/saas/admin/tenants` που ηταν εντελως ατεκμηριωτο
(grep "admin/tenants" σε saas.md = 0 hits). Ειναι το πρωτο platform-operator surface, ξεχωριστο
απο το per-workspace owner/admin authz.

Διαβασα τα πραγματικα αρχεια (`app/api/saas/admin/tenants/route.ts`, `lib/tenancy/superadmin.ts`,
`lib/tenancy/adminTenants.ts`) και προσθεσα νεα ενοτητα **### Superadmin console (§8)** αμεσως
μετα το "Activity (audit)" και πριν το "SaaS environment variables". Επισης νεα γραμμη στον
env-vars πινακα: **SAAS_SUPERADMIN_EMAILS**.

Τι εγραψα:
- Env allowlist gate (comma/semicolon/whitespace separated, entries χωρις @ dropped, empty/unset
  → console disabled 404). Τονισα οτι η ιδιοτητα ζει στο env οχι στη DB, οποτε compromised account
  row δεν μπορει να mint superadmin· κανενα in-app escalation path.
- Πινακας route: `GET /api/saas/admin/tenants` με query `status/q/limit/offset`, read-only registry
  listing newest-first, display-safe summary fields (slug/name/plan/status/tier/customDomain/
  trialEndsAt/erasureScheduledAt/billingLinked/aiByoKey/createdAt/updatedAt), `no-store`.
- Query rules: limit clamp 1..100 default 50, offset floor ≥0, status exact-match στο Tenant enum
  (pending/trialing/active/suspended/canceled) αλλιως αγνοειται, q case-insensitive substring
  regex-escaped across slug/name/customDomain.
- Authorization-order πινακας (5 states): SAAS_MODE off/AUTH_SECRET unset→404/500, allowlist empty
  →404, not signed in→401, not in allowlist→403, account row deleted→401.
- JSON sample (format `pharos.admin-tenant-listing` v1: generatedAt/total/count/limit/offset/filter/
  tenants[]). total=full match count για paging, count=rows στη σελιδα. Τονισα observability-only
  (μονο central Tenant registry, ποτε per-tenant data-db, ποτε write, destructive ops out of scope).
- OSS parity callout: SaaS-only, 404 οταν SAAS_MODE off, κανενα equivalent στο self-hosted single-tenant.

Accuracy: καμια τιμη/status/field/format εφευρεθηκε, cross-checked με τον κωδικα (requireSuperadmin
gate ordering, parseSuperadminEmails separators + @-filter, parseAdminTenantQuery clamps,
TENANT_STATUSES, buildTenantQueryFilter regex-escape, summarizeTenant fields + billingLinked =
billingCustomerId||billingSubscriptionId, AdminTenantListing envelope keys). Placeholders μονο
`<slug>`/`acme`.

ΔΙΟΡΘΩΣΗ προηγουμενης σημειωσης: το ERASURE_GRACE_DAYS ΔΕΝ ειναι env var, ειναι hardcoded
compile-time constant (30) στο `lib/tenancy/erasure.ts` (δεν διαβαζεται απο process.env). Το
προηγουμενο "gap" ηταν λαθος υποθεση· διαβαζοντας τον κωδικα αποφευχθηκε λαθος καταχωρηση στον
env-vars πινακα. ΔΕΝ προστεθηκε.

Validation: markdown only, κανενα build/Docker/AI call. Fence parity saas.md = 12 markers
(6 balanced blocks, +1 νεο). Anchor `#superadmin-console-8` ταιριαζει το heading "### Superadmin
console (§8)" (parens + § stripped απο GitHub slug). Secret scan (sk_live/sk_test/sk-ant-/
AUTH_SECRET=/STRIPE_SECRET_KEY=/CRON_SECRET=<value>) → clean.

Collision guard: `git status --short` πριν το add· stage ΜΟΝΟ docs/saas.md + docs/DOCS_PROGRESS.md.

Επομενο run: superadmin console = πιθανον να αποκτησει κι αλλα routes (per-tenant detail, actions)
καθως το §8 scaffold μεγαλωνει, watch τα νεα admin/* commits· η stale-forward-ref sweep αν εκτεθουν
export/erasure/files/superadmin στο workspace-settings UI (features.md).

## 2026-07-09 (saas.md: Superadmin tenant DETAIL endpoint §8)

Το commit `6fd3613` (feat(saas): superadmin tenant DETAIL read endpoint, increment 49) προσθεσε
νεο control-plane route `GET /api/saas/admin/tenants/[slug]` που ηταν ατεκμηριωτο (grep
"tenants/<slug>" / "admin-tenant-detail" σε saas.md = 0 hits). Ειναι το δευτερο superadmin surface,
drill-in σε ΕΝΑ workspace απο το listing (#48).

Διαβασα τα πραγματικα αρχεια (`app/api/saas/admin/tenants/[slug]/route.ts`,
`lib/tenancy/adminTenantDetail.ts`) και προσθεσα νεα υποενοτητα **#### Single-tenant detail** μεσα
στο §8, αμεσως μετα το OSS-parity note του listing και πριν το "SaaS environment variables".

Τι εγραψα:
- Route πινακας: `GET /api/saas/admin/tenants/<slug>` → registry summary (ιδια fields με listing row)
  + full member roster + role/status tally, `no-store`. Ιδιο requireSuperadmin gate + ιδια
  authorization order με το listing· unknown slug → 404.
- Slug trim + lowercase πριν το lookup (`/Acme` == `acme`). Reads ΜΟΝΟ central registry
  (Tenant/Membership/Account), ποτε per-tenant data db, ποτε write· per-tenant usage/stats = separate
  later increment (data plane).
- Display-safety: μονο email/name απο το account (ποτε password hash/token)· dangling membership
  (deleted account row) → empty email/name, οχι throw.
- Tally rules: status counts (active/invited/removed) ολα τα members· role counts
  (owners/admins/members) ΜΟΝΟ active → ownerless workspace ευκολα ορατο.
- JSON sample (format `pharos.admin-tenant-detail` v1: generatedAt/tenant/memberCounts/members[]).
  Members oldest-first (createdAt, μετα _id).

Accuracy: cross-checked με τον κωδικα (saasGuard+requireSuperadmin ordering, getTenantDetailForAdmin
slug trim/lower + null→404, summarizeMember email/name-only + dangling handling, tallyMembers
active-only role counting, buildTenantDetail envelope keys, memberships sort createdAt:1/_id:1).
Καμια τιμη/field εφευρεθηκε. Placeholders μονο `<slug>`/`acme`/`.example`.

Validation: markdown only, κανενα build/Docker/AI call. Fence parity saas.md = 14 markers (7
balanced blocks, +1 νεο). Secret scan (sk_live/sk_test/sk-ant-/AUTH_SECRET=/STRIPE_SECRET_KEY=/
CRON_SECRET=<value>) → clean.

Collision guard: `git status --short` δειχνει foreign unstaged `apps/mobile/.../ReceiptsScreen.tsx`
(αλλη ρουτινα WIP, ΟΧΙ staged). Stage ΜΟΝΟ docs/saas.md + docs/DOCS_PROGRESS.md.

Επομενο run: το superadmin console §8 μεγαλωνει ανα increment (listing #48, detail #49)· watch νεα
admin/* commits για per-tenant detail actions ή usage/stats view. Η stale-forward-ref sweep αν
εκτεθουν export/erasure/files/superadmin στο workspace-settings UI (features.md).

## 2026-07-09 (saas.md: Superadmin tenant DETAIL usage rollup, envelope v1 -> v2 §8)

Το commit `b4374d8` (feat(saas): superadmin tenant detail usage rollup, increment 50) προσθεσε
νεο πεδιο `usage` στο single-tenant DETAIL endpoint (`GET /api/saas/admin/tenants/[slug]`) και
bumped το envelope απο version 1 σε 2. Ηταν ατεκμηριωτο: το saas.md #### Single-tenant detail
ελεγε ακομα "A per-tenant usage/stats view WOULD touch the data plane and is a deliberately
separate, later increment" (forward-looking, τωρα χτισμενο), envelope JSON = version 1, χωρις
`usage` field.

Διαβασα τα πραγματικα αρχεια (`lib/tenancy/adminTenantUsage.ts` [νεο module: summarizeUsagePeriod/
buildUsageSummary/readTenantUsageForAdmin], `lib/tenancy/adminTenantDetail.ts` [version 2 +
usage field wiring], `app/api/saas/admin/tenants/[slug]/route.ts` [updated docblock]) και ενημερωσα
το #### Single-tenant detail:
- Table row: προσθηκη "και usage rollup (AI consumption + storage footprint)".
- Διορθωση της stale forward-ref παραγραφου: το usage δεν "would touch the data plane" — διαβαζει
  ΜΟΝΟ το control-plane `Usage` ledger (central registry), ποτε per-tenant data db, ποτε write.
- Νεα παραγραφος usage rollup: `totals` = monotonic AI counters (aiCalls/aiInputTokens/
  aiOutputTokens/aiCostMicros) summed· storage = GAUGE (latestStorageBytes/latestStorageMeasuredAt
  απο το newest-measured period, ΟΧΙ summed)· `periods[]` most-recent first· defensive non-negative
  int coercion· DEFAULT_TENANT/SAAS off → empty summary (periodCount 0).
- Envelope version 1 → 2 (heading + JSON sample) + προσθηκη `usage` block στο JSON sample.

Accuracy: cross-checked κατα του κωδικα (readTenantUsageForAdmin limit clamp [1,60] default 12,
period sort desc, aiCostMicros = currency micros, gauge picks newest storageMeasuredAt, count()
NaN/neg→0 floor, buildTenantDetail version:2 + usage default buildUsageSummary([])). Καμια τιμη
εφευρεθηκε πλην illustrative sample numbers. Placeholders μονο `<slug>`/`acme`/`.example`.

Validation: markdown only, κανενα build/Docker/AI call. Fence parity saas.md = 14 markers (7
balanced blocks, ιδιο — μονο edits σε υπαρχον block, μηδεν νεο fence). Listing envelope μενει
version 1 (σωστα, ξεχωριστο), μονο το detail εγινε 2. Secret scan (sk_live/sk_test/sk-ant-/
AUTH_SECRET=/STRIPE_SECRET_KEY=/CRON_SECRET=<value>) → clean. Μονο το saas.md αναφερει το
admin-tenant-detail endpoint (grep) → καμια αλλη σελιδα out-of-sync.

Collision guard: `git status --short` = μονο `M docs/saas.md` (κανενα foreign staged). Stage
ΜΟΝΟ docs/saas.md + docs/DOCS_PROGRESS.md.

Επομενο run: το superadmin console §8 μεγαλωνει ανα increment (listing #48, detail #49, usage
rollup #50)· watch νεα admin/* commits για superadmin ACTIONS (write surfaces: suspend/reactivate/
impersonate) ή UI console page. Η stale-forward-ref sweep αν εκτεθουν export/erasure/files/
superadmin στο workspace-settings UI (features.md).

## 2026-07-09 (api.md: statements/plans/merge POST+DELETE + plan envelope σχημα)

Gap-scan στο api.md εναντι ολων των routes στο apps/web/src/app/api/v1/ (find route.ts, 52 αρχεια).
Βρεθηκε ενα undocumented endpoint: `/api/v1/statements/plans/merge` (POST + DELETE), το mobile
surface για merge/unmerge δοσεων με διαφορετικο λεκτικο (QUEST ONLINE vs QUEST ONLINE KALLITHEA).
Ολα τα αλλα item/receipt/expense sub-routes ηταν ηδη τεκμηριωμενα.

Διαβασα τα πραγματικα αρχεια (statements/plans/merge/route.ts [POST bindInstallmentGroup →
{ok,moved}· DELETE unbindInstallmentGroup → {ok,moved}], statements/plans/route.ts [envelope
{currency, plans[]} με key/signature/merged κ.λπ.]) και ενημερωσα το ### Statements & installment
plans:
- Δυο νεες σειρες: POST `/statements/plans/merge` {sourceKey,targetKey}→{ok,moved}, DELETE
  `/statements/plans/merge` {key}→{ok,moved}.
- Νεο JSON sample του GET /statements/plans plan object (key/signature/label/card/perAmount/
  totalInstallments/paidInstallments/remainingInstallments/remainingAmount/totalAmount/
  projectedEndDate/done/itemCount/merged).
- Επεξηγηση: `key` = planKey||signature (το keys-on για merge/unmerge· περναει ως targetKey/key),
  `signature` = back-compat, `merged`=true οταν manual bind → mobile "unmerge".

Accuracy: cross-checked κατα του κωδικα (readBody+strField required sourceKey/targetKey/key,
apiError οταν λειπουν, r.moved ?? 0, computeInstallmentPlans map keys, sort active-before-done).
Illustrative sample numbers μονο, καμια εφευρεση field. Placeholders μονο store names.

Validation: markdown only, κανενα build/Docker/AI call. Fence parity api.md = 18 markers (9
balanced blocks, +1 νεο JSON block). Secret scan (sk_live/sk_test/sk-ant-/AUTH_SECRET=/
STRIPE_SECRET_KEY=/CRON_SECRET=<value>) → clean.

Collision guard (ΕΝΕΡΓΟΠΟΙΗΘΗΚΕ): mid-run το git diff --cached εδειξε foreign STAGED files
(apps/web/src/app/api/saas/admin/overview/* + adminOverview.ts/test + SAAS_PROGRESS.md) — η
saas-core ρουτινα ηταν mid-commit. ΔΕΝ commit-αρα· poll καθε 20s μεχρι index clear· η saas-core
εκανε land το `189282e feat(saas): superadmin fleet overview (increment 51)`. Μετα εμεινε ΜΟΝΟ
`M docs/api.md`. Stage ΜΟΝΟ docs/api.md + docs/DOCS_PROGRESS.md.

Επομενο run: το νεο `GET /api/saas/admin/overview` (superadmin fleet aggregate, increment 51,
τωρα committed) θελει τεκμηριωση στο saas.md §8 (listing #48, detail #49, usage #50, fleet
overview #51). Watch νεα admin/* commits για superadmin write actions (suspend/reactivate/
impersonate) ή UI console page.
