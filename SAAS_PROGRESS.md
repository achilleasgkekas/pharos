# SAAS_PROGRESS — Pharos multi-tenant SaaS layer

Log της SAAS-CORE routine. Χτίζει το SaaS layer **incrementally + backward-compatible**:
το υπάρχον single-user self-hosted app πρέπει να δουλεύει **αμετάβλητο** όταν `SAAS_MODE`
είναι off. Νέος κώδικας ζει σε **νέα αρχεία**· στα υπάρχοντα κάνουμε μόνο additive,
flag-guarded αλλαγές.

---

## Architecture

**Feature flag.** Όλα πίσω από `SAAS_MODE` (env). Undefined/off = σημερινή single-user
συμπεριφορά (ένας implicit owner, bearer-token, η κοινή `MONGO_URI` βάση). Canonical
reader: `lib/tenancy/saasMode.ts` — **κάθε** SaaS κομμάτι γκειτάρει σε αυτό.

**Tenancy model — database-per-tenant (data plane) + shared registry (control plane).**
Το TODO §8 ζητά ρητά database-per-tenant. Η γενική σύσταση «shared-DB-με-tenantId πρώτα»
ΔΕΝ ταιριάζει εδώ, και ο λόγος είναι πρακτικός: το app έχει ήδη **16 feature models +
εκατοντάδες queries** χωρίς κανένα `tenantId`. Το shared-DB θα απαιτούσε retrofit `tenantId`
σε ΚΑΘΕ model + ΚΑΘΕ query (ένα ξεχασμένο φίλτρο = διαρροή δεδομένων μεταξύ tenants).
Αντίθετα, database-per-tenant αφήνει **όλο** το υπάρχον feature code ΑΓΓΙΧΤΟ: μια
per-request σύνδεση scoped σε `conn.useDb('tenant_<slug>')` κάνει τη δουλειά. Άρα εδώ το
database-per-tenant είναι ΚΑΙ ό,τι θέλει ο owner ΚΑΙ λιγότερο invasive. Bonus: καθαρό
GDPR export/delete (drop της tenant db) + per-tenant backup, που το TODO απαιτεί.

- **Control plane** (νέο): ζει στην κεντρική registry βάση (η default `MONGO_URI`
  σύνδεση). Models: `Tenant`, `Account`, `Membership` (+ αργότερα Plan/Usage ledger).
  Route: subdomain/custom-domain/session → `Tenant` → `dbName`.
- **Data plane** (υπάρχον): κάθε tenant έχει δική του βάση `tenant_<slug>`. Τα υπάρχοντα
  models (`Item`, `Receipt`, `User`, …) τρέχουν εκεί, χωρίς αλλαγή, μέσω του tenant-scoped
  connection. Η self-hosted λειτουργία = «ένας implicit default tenant» = η σημερινή βάση.

**Auth.** Email + password sessions, **επαναχρησιμοποιώντας το υπάρχον stack**:
scrypt hashing (`lib/auth.ts`, node:crypto, no native dep) + `jose` JWT httpOnly cookie
(`lib/session.ts`, edge-safe). ΔΕΝ προσθέτουμε bcrypt/argon2/next-auth — μηδέν νέα
εξάρτηση, ένα hashing implementation. Το `Account` (global login) είναι **ξεχωριστό** από
το per-tenant `User` (shared-hub login), ώστε τα δύο auth paths να μην μπλέκουν. Το
υπάρχον bearer-token path (`lib/apiAuth.ts`) μένει ανέπαφο.

**Billing.** Stripe (keys από env, ποτέ hardcoded). Plan ladder: `free` (5 GB shared) →
`shared` (μεγαλύτερη db) → `dedicated` (+ custom domain). Webhook signature-verified.
Entitlements map plan → allowed features (mirror του OSS-vs-paid split). Καμία πραγματική
χρέωση από τη routine — μόνο scaffold.

**Roles.** SaaS org role (`Membership.role`: owner/admin/member) ≠ per-tenant
`User.role` (admin/member που gate-άρει system settings ΜΕΣΑ στη βάση του tenant).

### Build order (increments)
1. ✅ Architecture note + control-plane models (Tenant/Account/Membership). — *αυτό το run*
2. ✅ `lib/tenancy/context.ts` — tenant resolver (session/subdomain/host → Tenant) +
   `scoped()`/`dbNameFor()` helpers· off = `DEFAULT_TENANT`. Pure host parser σε `host.ts`.
3. ✅ Per-tenant connection layer — `lib/tenancy/connection.ts` (`useDb` + per-db cache),
   flag-guarded. Δεν αγγίζει το `connectDB()`.
4. ⬜ `api/saas/auth` signup/login/logout/session (scrypt + jose, httpOnly cookie).
5. ⬜ Billing scaffold: `lib/billing/stripe.ts` + `api/saas/billing/webhook` +
   `lib/billing/entitlements.ts`.

---

## Decisions (Achilleas, 2026-07-01)
- **SaaS domain = `ph-aros.com`** → tenant subdomains `<slug>.ph-aros.com`, wildcard
  `*.ph-aros.com` + on-demand certs για custom domains (dedicated tier).
- **Stripe = αργότερα** (scaffold με env placeholders μέχρι τότε, καμία πραγματική χρέωση).
- **Plan pricing = αργότερα** (free/shared/dedicated τιμές + quotas θα οριστούν αργότερα·
  τα plan keys υπάρχουν ήδη στο `Tenant.plan`).

## Needs Achilleas (ανοιχτά)
- **Stripe account + keys** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price ids) όταν
  φτάσουμε στο billing scaffold (deferred κατ' απόφαση).
- **Ακριβές plan pricing** (free/shared/dedicated τιμές + quotas GB/AI) — deferred.

---

## 2026-07-01
**Built (increment 1):** Πρώτο run. Έγραψα το Architecture note (πάνω) — αποφασισμένο
tenancy model (database-per-tenant για data plane + shared registry για control plane, με
τεκμηρίωση γιατί αντί για shared-DB-tenantId), auth (reuse scrypt + jose), billing (Stripe,
env keys). Νέα αρχεία, τίποτα wired:
- `apps/web/src/lib/tenancy/saasMode.ts` — canonical `SAAS_MODE` flag reader (no imports,
  runtime-agnostic). Default off = σημερινή συμπεριφορά.
- `apps/web/src/models/Tenant.ts` — control-plane workspace: slug, dbName, customDomain,
  plan, status, tier, billing ids. Unique indexes σε slug/dbName/customDomain(sparse).
- `apps/web/src/models/Account.ts` — global login identity (email unique + scrypt
  passwordHash format ίδιο με lib/auth.ts) + verify/reset token fields.
- `apps/web/src/models/Membership.ts` — Account↔Tenant + role (owner/admin/member),
  compound unique index {account, tenant}.

**Verified:** `npm run type-check` → EXIT 0. Δεν άλλαξε runtime wiring (τα models δεν
γίνονται import από πουθενά ακόμα) → κανένα Docker rebuild. `SAAS_MODE` off = zero effect.

**Push:** committed locally (`564f26e`) αλλά **ΔΕΝ pushed** — collision guard: την ώρα
του push, concurrent routine έγραψε untracked `apps/landing/**` (το incoming
`44bc648 feat(landing)` προσθέτει ακριβώς αυτά τα αρχεία). Hard rule: rebase μόνο όταν το
tree δεν έχει foreign uncommitted files· εδώ υπάρχουν → **stopped**, δεν διέγραψα ξένα
αρχεία, δεν force-push. Το commit είναι ασφαλές local (1 ahead / 1 behind). Το επόμενο run
θα κάνει καθαρό `fetch` + `rebase origin/main` + push μόλις το tree είναι clean.

**Next task:** (α) push το εκκρεμές `564f26e` μόλις το tree καθαρίσει· (β) increment 2 —
`lib/tenancy/context.ts`: tenant resolver (session/subdomain/header → Tenant, off → fixed
default tenant) + `scoped(model, tenantId)` query helper. Δεν wire-άρεται σε feature routes
ακόμα.

---

## 2026-07-01 (increment 2 — tenant resolver)
Το εκκρεμές increment 1 (`564f26e`) έχει ΗΔΗ landαρίσει στο main ως `ceb65c6`
(control-plane models + `SAAS_MODE` flag) — ο collision guard του προηγ. run έκανε τη
δουλειά του, ένα επόμενο run merge-άρισε καθαρά. Δεν έμεινε τίποτα να push-άρω από εκεί.

**Built (increment 2):** ο tenant resolver, ΟΛΑ σε νέα αρχεία, τίποτα wired (0 importers):
- `apps/web/src/lib/tenancy/host.ts` — **PURE** host→slug parsing, **μηδέν imports**
  (ούτε saasMode) → edge/middleware-safe + unit-testable χωρίς path alias/DB.
  `parseTenantSlug(host, base?)` (apex/reserved/nested/custom-domain → null),
  `baseDomain()` (`SAAS_BASE_DOMAIN` env, default `ph-aros.com`), `normalizeHost()`.
- `apps/web/src/lib/tenancy/context.ts` — **NODE-only** resolver (αγγίζει Mongoose):
  - `TenantContext` type + `DEFAULT_TENANT` (frozen· ο implicit self-hosted tenant:
    `dbName:''` = default connection, `plan:'dedicated'`, always active).
  - `getTenantContext({host, slug})` → **off ⇒ `DEFAULT_TENANT` χωρίς DB hit**· on ⇒
    lookup Tenant by explicit slug → subdomain slug → full host ως customDomain·
    unknown ⇒ `null` (ο caller αποφασίζει 404/marketing/signup). Throws μόνο σε
    πραγματικό DB error, όχι σε not-found.
  - `dbNameFor(ctx)` → data-db name (`''` για default ⇒ «default connection as-is»)· το
    consume-άρει το increment 3 (`useDb`). Η routing rule ζει δίπλα στον resolver.
  - `scoped(filter, ctx)` → **control-plane** query scope helper. ΣΗΜ: το data plane
    είναι database-per-tenant, άρα τα feature queries ΔΕΝ φιλτράρονται με tenantId
    (isolation στο connection level)· το `scoped` merge-άρει `{tenant: id}` μόνο για τις
    shared control-plane collections (Membership/Usage). Default tenant → filter as-is.
- `apps/web/src/lib/tenancy/host.test.ts` — 8 pure tests για `parseTenantSlug`
  (flat slug, case/port/dot norm, apex, reserved, nested, custom domain, empty, custom base).

Απόκλιση από το task brief: το generic `scoped(model, tenantId)` δεν ταιριάζει στο
DB-per-tenant μοντέλο (εκεί το «scope» = επιλογή db μέσω `useDb`, όχι per-query φίλτρο) →
το υλοποίησα ως (α) `dbNameFor(ctx)` για το data plane + (β) `scoped(filter, ctx)` για το
control plane, που είναι το honest ισοδύναμο.

**Verified:** `npm run type-check` → EXIT 0. `npm test` → **33/33 green** (8 νέα + 25
προϋπάρχοντα). `grep` για importers των νέων αρχείων → **κανένας** ⇒ zero runtime wiring,
κανένα Docker rebuild, `SAAS_MODE` off = zero effect (αμετάβλητο single-user app).

**Next task:** increment 3 — per-tenant connection layer πάνω στο `lib/db.ts`:
flag-guarded `getTenantConnection(dbName)` / `tenantDb(ctx)` με `conn.useDb(dbName)` +
per-db cache· off (ή `dbName:''`) ⇒ η σημερινή default σύνδεση αυτούσια. Additive-only,
δεν αλλάζει το υπάρχον `connectDB()`.

---

## 2026-07-01 (increment 3 — per-tenant connection layer)
**Built:** `apps/web/src/lib/tenancy/connection.ts` — database-per-tenant data plane πάνω
από ΕΝΑ MongoDB client/pool, ΟΛΟ σε νέο αρχείο, μηδέν importers:
- `getTenantConnection(dbName)` → κενό `dbName` (default tenant / SAAS_MODE off) επιστρέφει
  τη **default σύνδεση αυτούσια** (κανένα `useDb`, κανένα extra pool = byte-for-byte το
  σημερινό self-hosted behaviour)· non-empty → cached `defaultConn.useDb(dbName, {useCache})`
  που μοιράζεται το socket pool. Καλεί `connectDB()` πρώτα, οπότε ο caller δεν sequence-άρει.
- `tenantDb(ctx)` → resolve μέσω `dbNameFor(ctx)` (default tenant → κενό → default conn).
- `tenantModel(conn, model)` → bind υπάρχοντος model στο tenant connection
  (`conn.model(name, schema)`, per-connection cached), ώστε το ΙΔΙΟ feature schema να τρέχει
  στη βάση του tenant χωρίς να αλλάξει κανένα model. Default conn → επιστρέφει το ίδιο model.
- HMR-safe per-db cache (`global.__pharosTenantConns`, ίδιο pattern με `lib/db.ts`),
  stale-guard σε readystate.

**Verified:** `npm run type-check` → EXIT 0. `npm test` → **33/33 green** (καμία regression).
`grep` για importers (`getTenantConnection`/`tenantDb`/`tenantModel`/`tenancy/connection`)
→ **κανένας** ⇒ zero runtime wiring, κανένα Docker rebuild, `SAAS_MODE` off = zero effect.
Δεν άγγιξα το `connectDB()` — καθαρά additive.

**Next task:** increment 4 — `api/saas/auth` (signup/login/logout/session): scrypt hashing
(reuse `lib/auth.ts` format) + `jose` httpOnly cookie session (reuse `lib/session.ts`),
flag-guarded, ξεχωριστό `Account` login από το per-tenant `User` path. Το bearer-token path
(`lib/apiAuth.ts`) μένει ανέπαφο.

---

## 2026-07-01 (increment 4 — SaaS account auth: signup/login/logout/session)
**Built:** το πλήρες `api/saas/auth` για το **global Account login** (SaaS mode), ΟΛΟ σε
νέα αρχεία, με ρητό split από το self-hosted `User`/bearer path:
- `apps/web/src/lib/tenancy/accountSession.ts` — Account session cookie **`pharos_account`**
  (ΞΕΧΩΡΙΣΤΟ από το `pharos_session` του per-tenant User → τα δύο auth paths συνυπάρχουν στον
  ίδιο browser χωρίς clobber). `jose` HS256 (edge-safe sign/verify) + node cookie helpers
  (`next/headers`). Reuse του υπάρχοντος `AUTH_SECRET` (μηδέν νέο config)· fail-closed χωρίς
  secret. Δικό του idle knob `SAAS_SESSION_IDLE_HOURS` (default 12h).
- `apps/web/src/lib/tenancy/provision.ts` — `slugify` (DNS-safe label) + `uniqueTenantSlug`
  (reserved-check via `RESERVED_SLUGS` + collision `-2/-3…`, bounded retry) + `dbNameForSlug`
  (`tenant_<slug>`) + `provisionTenant({accountId, workspaceName})` → δημιουργεί Tenant
  (plan=free, status=trialing) + owner Membership. Η data db φτιάχνεται lazily από τη Mongo.
- `apps/web/src/lib/tenancy/saasApi.ts` — `saasAuthGate()` (SAAS_MODE off → 404· AUTH_SECRET
  unset → 500) + `accountTenants(accountId)` (active memberships → tenant slug/plan/status +
  role) για τα login/session responses.
- Routes (`runtime=nodejs`, `dynamic=force-dynamic`, όλα `saasAuthGate()` πρώτα):
  - `POST api/saas/auth/signup` `{email,password,name?,workspace?}` → Account (scrypt hash,
    reuse `hashPassword`) + `provisionTenant` + set cookie → 201 `{account, tenants}`. Email
    regex + min-8 password + 409 σε duplicate (pre-check + 11000 race fallback).
  - `POST api/saas/auth/login` `{email,password}` → `verifyPassword` → set cookie → `{account,
    tenants}`. Ίδιο 401 για wrong email/password (no enumeration)· `lastLoginAt` update.
  - `POST api/saas/auth/logout` → clear cookie (idempotent).
  - `GET  api/saas/auth/session` → `{account, tenants}` ή `{account:null}` (deleted account με
    live cookie → logged-out).

**Verified:** `npm run type-check` → **EXIT 0**. `npm test` → **49/49 green** (καμία
regression). Οι routes είναι νέες + gated: `SAAS_MODE` off ⇒ 404 σε όλες ⇒ **zero effect**
στο self-hosted app· κανένα υπάρχον αρχείο δεν άλλαξε (καθαρά additive) ⇒ κανένα Docker
rebuild (δεν άλλαξε runtime wiring υπαρχόντων routes). Bearer-token path αμετάβλητο.

**Next task:** increment 5 — billing scaffold: `lib/billing/stripe.ts` (plans/prices config,
checkout-session + customer-portal stubs, env keys) + `api/saas/billing/webhook`
(signature-verified skeleton) + `lib/billing/entitlements.ts` (plan → allowed features,
mirror OSS-vs-paid split). Καμία πραγματική χρέωση· Stripe keys μέσω env (deferred κατ'
απόφαση Achilleas).

---

## 2026-07-01 (increment 5 — billing scaffold: plans + entitlements + Stripe + webhook)
**Built:** το billing layer, ΟΛΟ σε νέα αρχεία, μηδέν wiring στο υπάρχον app:
- `lib/billing/plans.ts` — **PURE** plan ladder (μηδέν imports): `PlanKey` free/shared/
  dedicated, `PLANS` table (name/tier/priceMonthlyEUR/storageGB/aiCallsPerMonth/customDomain/
  stripePriceEnv), `planDef(key)` (unknown→free), `stripePriceId(key)` (διαβάζει το Stripe
  Price ID από env **at call time**, ποτέ hardcoded), `planForPriceId(id)` (reverse για το
  webhook). Free 5GB/50 AI · Pro €9 50GB/1000 AI · Dedicated €29 500GB/unlimited+custom domain.
- `lib/billing/entitlements.ts` — plan → entitlements. **OSS parity** ρητά τεκμηριωμένο: το
  self-hosted τρέχει ως implicit `dedicated` (DEFAULT_TENANT) → πλήρες set· ΟΛΑ τα core +
  AI features σε ΚΑΘΕ plan, differentiation ΜΟΝΟ σε quotas (storage+AI volume)+custom domain+
  tier (όχι feature paywalls). `entitlementsFor`/`canUseAiFeature`/`withinStorage`/
  `withinAiQuota` (unlimited plan → πάντα true). Consume-άρεται από #10 dbStats + #11 metering.
- `lib/billing/stripe.ts` — **NODE-only, DEPENDENCY-FREE** (κανένα `stripe` npm): REST μέσω
  `fetch` + webhook signature μέσω `node:crypto`. `stripeConfigured()` (gate σε ΚΑΘΕ outbound
  call), `createCheckoutSession`/`createPortalSession` (stub-safe: `{ok:false,reason:'not-
  configured'}` όταν λείπουν keys → **καμία χρέωση δυνατή**), `verifyStripeSignature(raw,header,
  secret,tolerance)` (documented `t=…,v1=…` scheme, HMAC-SHA256, constant-time compare,
  5min replay window).
- `api/saas/billing/webhook/route.ts` — skeleton receiver (nodejs, force-dynamic). Gates:
  SAAS_MODE off→404, webhook secret unset→503, bad sig→400. Raw body via `req.text()` (πριν
  το parse), verify, dispatch: checkout.session.completed / customer.subscription.created+
  updated / deleted → reflect σε `Tenant.status/plan/billingCustomerId/billingSubscriptionId`
  (resolve tenant via metadata.tenantId → billingCustomerId). Ποτέ δεν χρεώνει· μόνο
  καθρεφτίζει το Stripe state στο control plane. 200 ack σε unhandled events.
- `lib/billing/billing.test.ts` — 9 pure tests (plan fallback, env price id, OSS-parity
  entitlements, storage/AI quota edges, signature accept/tamper/wrong-secret/stale/no-secret).
- `vitest.config.ts` — additive `resolve.alias` `@`→`./src` (mirror του tsconfig path) ώστε
  τα tests να importάρουν `@/lib/…` όπως το production code. Test-only infra, zero runtime effect.

**Απόφαση (billing provider):** το task λέει Stripe· κράτησα Stripe αλλά **dependency-free**
(fetch+crypto) → μηδέν npm dep, type-checks/builds με ή χωρίς keys. Το TODO #12 αναφέρει και
Paddle (merchant-of-record για EU VAT) ως εναλλακτική — καταγράφεται στο Needs-Achilleas.

**Verified:** `npm run type-check` → **EXIT 0**. `npm test` → **84/84 green** (75 προϋπάρχοντα
+ 9 νέα). Importers των billing modules από υπάρχον feature code → **κανένας** (μόνο το δικό
μου webhook route + ένα comment στο Tenant.ts) ⇒ zero runtime wiring, `SAAS_MODE` off = zero
effect. Δεν άλλαξα υπάρχον runtime wiring routes ⇒ κανένα Docker rebuild (το webhook είναι νέο
+ SAAS-gated· 404 στο self-hosted).

**## Needs Achilleas** (billing go-live):
- Stripe (ή Paddle) account + keys: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRICE_SHARED`, `STRIPE_PRICE_DEDICATED` (μέσω env, ποτέ commit).
- Οριστικό pricing (τα €9/€29 + quotas είναι placeholders).
- Paddle-vs-Stripe απόφαση (EU VAT / MoR). Αν Paddle → ο stripe.ts client αντικαθίσταται,
  τα plans/entitlements μένουν ίδια.

**Next task:** increment 6 — wire το metering: `models/Usage.ts` (per-tenant ledger:
period/aiCalls/storageBytes) + `lib/billing/usage.ts` (`recordAiCall`/`currentUsage`/enforce
μέσω `withinAiQuota`+`withinStorage`), όλα flag-guarded, χωρίς να αγγίξω τα AI call sites ακόμα
(μόνο το ledger + helpers· το wiring στα υπάρχοντα routes = μετέπειτα, προσεκτικό increment).

---

## 2026-07-02 (increment 6 — usage metering ledger + quota helpers)
**Built:** το per-tenant usage metering layer, ΟΛΟ σε νέα αρχεία, μηδέν wiring στα AI call
sites (μόνο ledger + helpers — το enforcement wiring μένει για προσεκτικό increment):
- `models/Usage.ts` — **control-plane** ledger (registry db). Ένα doc ανά `(tenant, period)`
  όπου `period="YYYY-MM"`: `aiCalls` (monotonic volume ανά μήνα), `storageBytes` (gauge
  snapshot, όχι sum), `storageMeasuredAt`. Compound unique index `{tenant, period}` (upsert
  key). Deliberately μικρό (ledger, όχι event log)· per-call token/cost lines σε ξεχωριστό
  append-only collection αργότερα (TODO §11) χωρίς αλλαγή εδώ.
- `lib/billing/usage.ts` — metering helpers, χωρισμένα σε **PURE** (unit-tested, no DB) +
  DB-touching:
  - PURE: `periodOf(date)` (UTC "YYYY-MM"), `aiQuotaStatus(plan, used)` /
    `storageQuotaStatus(plan, usedBytes)` → `QuotaStatus {used, limit, remaining, allowed,
    ratio}` (ratio για «X of Y used» UIs· unlimited plan → limit null/ratio 0/allowed true).
    Χτισμένα πάνω στα υπάρχοντα `entitlementsFor`/`withinAiQuota`/`withinStorage`.
  - DB: `isMetered(ctx)` gate = `saasMode() && !ctx.isDefault && !!ctx.tenantId` → **ΟΛΑ**
    τα DB functions είναι NO-OP + unlimited για τον DEFAULT_TENANT / SAAS_MODE off (OSS
    parity: το self-hosted app ΠΟΤΕ δεν γράφει Usage doc, ΠΟΤΕ δεν μπλοκάρεται, μηδέν DB hit).
    `currentUsage` (zeroed `metered:false` snapshot όταν off), `recordAiCall(ctx,n=1)` (atomic
    `$inc` upsert → running total), `setStorageBytes` (gauge overwrite, για #10 dbStats),
    `checkAiQuota`/`checkStorageQuota(+additionalBytes)` (gates «μία ακόμα;» πριν AI/upload op).
- `lib/billing/usage.test.ts` — 9 PURE tests (periodOf UTC/boundaries, free 50/shared 1000/
  dedicated unlimited AI caps + block-at-cap, unknown→free fallback, negative floor, storage
  5GB/500GB edges με `<=` at-cap).

**Verified:** `npm run type-check` → **EXIT 0**. `npm test` → **128/128 green** (119
προϋπάρχοντα + 9 νέα). Importers των `billing/usage`/`models/Usage`/metering helpers από
υπάρχον feature code → **κανένας** ⇒ zero runtime wiring, `SAAS_MODE` off = zero effect,
κανένα Docker rebuild (δεν άλλαξα runtime wiring υπαρχόντων routes). Δεν άγγιξα κανένα υπάρχον
αρχείο — καθαρά additive.

**Next task:** increment 7 — enforcement wiring (προσεκτικό): ένας thin gate helper
(`enforceAiQuota(ctx)` → 402/«upgrade» όταν `!allowed`) που θα μπει σε ΕΝΑ AI route ως pilot,
flag-guarded (off ⇒ pass-through), + `recordAiCall` μετά το επιτυχές AI op. Πρώτα σε ένα
route μόνο, με tests, πριν rollout. Εναλλακτικά #10 dbStats sampling (`setStorageBytes` feed)
αν προτιμηθεί το storage metering πρώτο.

---

## 2026-07-02 (increment 7 — AI/storage quota enforcement primitive + usage read surface)
**Built:** το enforcement gate + το πρώτο SaaS read surface που κλείνει το metering loop
(ledger → quota math → HTTP απόφαση), ΟΛΟ σε νέα αρχεία, μηδέν wiring σε feature routes:
- `lib/billing/enforce.ts` — η **thin drop-in gate** που ένα AI route θα βάλει σε δύο
  γραμμές: `enforceAiQuota(ctx)` / `enforceStorageQuota(ctx, +bytes)` → `{allowed, status}`
  (wrappάρουν τα `checkAiQuota`/`checkStorageQuota`) + **PURE** `quotaExceededBody(kind,
  status, plan)` (stable machine-readable `{error, code:'quota_exceeded', kind, plan, used,
  limit, remaining, upgrade:true}`) + `quotaExceededResponse(...)` → **402** Payment Required.
  OSS parity: για DEFAULT_TENANT / SAAS_MODE off τα gates είναι pure pass-through (unlimited,
  allowed, μηδέν DB) → self-hosted ΠΟΤΕ δεν μπλοκάρεται.
- `app/api/saas/usage/route.ts` — `GET /api/saas/usage[?tenant=<slug>]` (nodejs, force-
  dynamic, `saasAuthGate()` πρώτα). Account session → `accountTenants` (membership authz,
  διαλέγει workspace by slug ή το πρώτο· 403 αν όχι μέλος) → `getTenantContext({slug})` →
  `currentUsage` + `aiQuotaStatus`/`storageQuotaStatus`. Επιστρέφει period + used/limit/
  remaining/ratio ανά AI+storage → το read surface που τρέφει ένα usage/billing dashboard.
  Πρώτο endpoint που ασκεί end-to-end όλο το metering stack.
- `lib/billing/enforce.test.ts` — 4 DB-free tests (default-tenant AI+storage pass-through =
  unlimited/allowed· PURE body builder AI over-quota shape + storage over-quota + missing
  plan → null).

**Απόκλιση από το «Next task» (wiring σε ΕΝΑ AI route ως pilot):** το territory του routine
απαγορεύει ρητά edits σε `api/v1/*` feature routes. Άρα έχτισα το enforcement PRIMITIVE
(έτοιμο για drop-in σε δύο γραμμές) + ένα in-territory SaaS read surface που το ασκεί, αντί
να αγγίξω feature route. Το πραγματικό wiring στα AI call sites (enforce πριν + recordAiCall
μετά) μένει για increment που έχει άδεια να πειράξει `api/v1/*` (ή για το feature-builder
routine που το owns) — δες Needs-Achilleas.

**Verified:** `npm run type-check` → **EXIT 0**. `npm test` → **169/169 green** (165
προϋπάρχοντα + 4 νέα). Importers των `billing/enforce`/`enforceAiQuota`/`quotaExceeded*` από
υπάρχον feature code → **κανένας**· το νέο route είναι SAAS-gated (404 όταν off) ⇒ zero
runtime wiring, `SAAS_MODE` off = zero effect, κανένα Docker rebuild. Καθαρά additive.

**## Needs Achilleas** (enforcement go-live):
- Έγκριση για wiring του `enforceAiQuota`/`recordAiCall` σε ΕΝΑ AI route (`api/v1/*`) ως
  pilot — απαιτεί edit εκτός SAAS territory. Flag-guarded (off ⇒ pass-through), αλλά αγγίζει
  feature route → θέλει ρητή άδεια ή ανάθεση στο feature-builder routine.

**Next task:** increment 8 — #10 dbStats storage sampling: ένα in-territory helper
(`lib/billing/dbStats.ts` ή `api/saas` cron route) που τρέχει `db.stats()` στη data db κάθε
tenant (μέσω `tenantDb(ctx)`) → `setStorageBytes(ctx, bytes)`, ώστε το storage quota να έχει
πραγματικά νούμερα να ελέγξει. Read-only στο data plane, γράφει μόνο στο control-plane Usage.

---

## 2026-07-02 (increment 8 — storage sampling: db.stats() → Usage ledger)
**Built:** το storage-metering feed που δίνει στο storage quota πραγματικά νούμερα, ΟΛΟ σε
νέα αρχεία, μηδέν wiring σε feature routes:
- `lib/billing/dbStats.ts` — μετράει το Mongo footprint κάθε tenant μέσω native
  `db.stats()` και το γράφει στο control-plane Usage ledger (`setStorageBytes`). Χωρισμένο σε
  **PURE** + DB-touching:
  - PURE: `billedBytes(stats)` → **physical on-disk** footprint = `storageSize + indexSize`
    (compressed, ό,τι πραγματικά καταναλώνει το storage allowance· ΟΧΙ το uncompressed
    `dataSize`). Missing→0, floored at 0.
  - DB: `readDbStats(ctx)` (read-only `conn.db.stats()` πάνω στο `tenantDb(ctx)`),
    `sampleTenantStorage(ctx)` (measure → `setStorageBytes`), `sampleAllTenants()` (iterate
    trialing/active tenants από το registry, per-tenant try/catch isolation → ένα κακό db δεν
    ρίχνει όλο το run). OSS parity: `isSampleable` gate = `saasMode() && !isDefault &&
    tenantId` → DEFAULT_TENANT / SAAS_MODE off = NO-OP, ΠΟΤΕ db.stats(), ΠΟΤΕ Usage write.
    Read-only στο data plane· η ΜΟΝΗ write είναι στο control-plane Usage.
- `app/api/saas/usage/sample/route.ts` — `POST /api/saas/usage/sample` (nodejs, force-
  dynamic). SaaS-gated (404 όταν off) + **CRON_SECRET bearer** (fail-closed 500 αν unset,
  401 σε λάθος token) — scheduler-callable, όχι account session. Τρέχει `sampleAllTenants`.
- `lib/billing/dbStats.test.ts` — 4 PURE tests (billedBytes: storageSize+indexSize, αγνοεί
  dataSize, missing→0, negative→floor 0).

**Verified:** `npm run type-check` → **EXIT 0**. `npm test` → **241/241 green** (237
προϋπάρχοντα + 4 νέα). Importers των `billing/dbStats` από υπάρχον feature code → **κανένας**·
το νέο route SAAS-gated (404 όταν off) ⇒ zero runtime wiring, `SAAS_MODE` off = zero effect,
κανένα Docker rebuild. Καθαρά additive — δεν άγγιξα κανένα υπάρχον αρχείο.

**## Needs Achilleas:**
- **CRON_SECRET** env για το sample route (production scheduler auth) + ένα cron entry που το
  χτυπάει (π.χ. ωριαία/ημερήσια) όταν ανοίξει το SaaS.
- **File bytes ΔΕΝ μετρώνται ακόμα**: το `db.stats()` πιάνει ΜΟΝΟ το Mongo metadata footprint.
  Τα binary αρχεία (receipt PDFs, item photos) ζουν σε disk/remote backend, ΟΧΙ στη Mongo, άρα
  το storage quota υπολογίζει προς το παρόν μόνο το db footprint. Χρειάζεται μελλοντικό
  increment που αθροίζει on-disk/remote file bytes ανά tenant στο `setStorageBytes`.
- Enforcement go-live (από increment 7): wiring του `enforceAiQuota`/`recordAiCall` σε ΕΝΑ AI
  route (`api/v1/*`) ως pilot — απαιτεί edit εκτός SAAS territory (ρητή άδεια ή feature-builder).

**Next task:** increment 9 — file-byte storage accounting: ένα in-territory helper που
αθροίζει τα on-disk/remote bytes των tenant αρχείων (μέσω του storage abstraction) → προστίθεται
στο `setStorageBytes` δίπλα στο db footprint, ώστε το storage quota να αντικατοπτρίζει το
πραγματικό footprint. Εναλλακτικά, το enforcement wiring αν δοθεί άδεια για `api/v1/*`.

---

## 2026-07-02 (increment 9 — file-byte storage accounting)
**Built:** το file-byte skέλος του storage footprint (db + files), ΟΛΟ σε νέο αρχείο +
additive-only edit στο δικό μου `dbStats.ts`:
- `lib/billing/fileStorage.ts` — αθροίζει τα on-disk bytes ενός tenant. Χωρισμένο σε **PURE**
  (unit-tested) + FS-touching:
  - PURE: `sumBytes(sizes[])` (floor-each-at-0 sum), `tenantStorageRoot(ctx)` → η per-tenant
    υποδιαδρομή `STORAGE_ROOT/<dbName>` (fallback `tenant_<slug>`)· **null** για τον default
    tenant + traversal-guard (crafted `../../etc` dbName → null, μένει μέσα στο STORAGE_ROOT).
  - FS: `measureDir(dir)` (recursive file-size sum· missing dir → 0· symlinks όχι followed·
    per-entry try/catch ώστε ένα unreadable file να μη ρίχνει το walk), `tenantFileBytes(ctx)`
    (**NO-OP → 0** για default tenant / SAAS_MODE off, μηδέν fs access· αλλιώς `measureDir`
    στο tenant root).
- `lib/billing/dbStats.ts` (δικό μου, additive): το `sampleTenantStorage` γράφει πλέον
  **`dbBytes + fileBytes`** στο Usage ledger (πριν μόνο dbBytes). `StorageSample` += `dbBytes`/
  `fileBytes` breakdown (κανένας external consumer της shape — μόνο το SAAS route spread-άρει
  το `SampleAllResult`).
- `lib/billing/fileStorage.test.ts` — 8 tests (sumBytes floor/NaN, tenantStorageRoot
  default→null / dbName / slug-fallback / traversal-guard, measureDir recursive-sum +
  missing-dir→0 σε πραγματικό temp dir).

**Verified:** `npm run type-check` → **EXIT 0**. `npm test` → **296/296 green** (288
προϋπάρχοντα + 8 νέα). Importers του `fileStorage` από feature code → **κανένας** (μόνο το
δικό μου `dbStats.ts`)· το `dbStats` το χρησιμοποιεί ΜΟΝΟ το SAAS-gated sample route (404 όταν
off) ⇒ zero runtime wiring, `SAAS_MODE` off = zero effect, κανένα Docker rebuild. Άγγιξα μόνο
δικά μου SAAS αρχεία.

**## Needs Achilleas** (file metering go-live):
- **Το `saveFile` (lib/storage.ts) ΔΕΝ είναι tenant-aware ακόμα**: γράφει σε
  `STORAGE_ROOT/<bucket>` όχι σε `STORAGE_ROOT/<dbName>/<bucket>`. Άρα ένας live tenant's
  subtree είναι κενός → `tenantFileBytes` μετράει 0 μέχρι να γίνει το saveFile per-tenant.
  Αυτό αγγίζει shared storage plumbing (feature territory) → θέλει ρητή άδεια ή feature-builder.
  Backward-compatible design: ο default tenant / self-hosted δεν κουνάει κανένα αρχείο.
- Remote backends (SMB/FTP/OneDrive mirror) μετρώνται ξεχωριστά αργότερα — το increment αυτό
  καλύπτει το local STORAGE_ROOT volume.

**Next task:** increment 10 — tenant-aware `saveFile` (αν δοθεί άδεια για shared storage
plumbing): namespace τα SaaS uploads σε `STORAGE_ROOT/<dbName>/<bucket>` (flag-guarded, default
tenant αμετάβλητος) ώστε το `tenantFileBytes` να μετράει πραγματικά νούμερα. Εναλλακτικά, το
enforcement wiring σε ΕΝΑ AI route αν δοθεί άδεια για `api/v1/*`.

---

## 2026-07-02 (increment 10 — billing checkout + portal routes)
**Απόκλιση από το «Next task»:** και οι δύο προτεινόμενες επιλογές (tenant-aware `saveFile` /
enforcement wiring σε `api/v1/*`) απαιτούν edit ΕΚΤΟΣ SAAS territory (shared storage plumbing /
feature routes) → θέλουν ρητή άδεια. Γύρισα σε καθαρά in-territory increment: εξέθεσα τα ήδη
χτισμένα stripe stubs (`createCheckoutSession`/`createPortalSession`) που μέχρι τώρα ΔΕΝ είχαν
route (μόνο ο webhook υπήρχε).

**Built** (όλο σε νέα αρχεία κάτω από `lib/billing/**` + `api/saas/billing/**`):
- `lib/billing/billingRoutes.ts` — PURE helpers (μηδέν imports πλην PlanKey, μηδέν DB/env-at-load):
  `canManageBilling(role)` (owner/admin only), `checkoutablePlan(plan)` (μόνο paid shared/
  dedicated· free/unknown→null), `normalizeBase`, `pickBaseUrl(envBase, reqOrigin)` (προτιμά
  configured public URL, αλλιώς request origin), `checkoutUrls(base)` (success/cancel, κρατά το
  Stripe `{CHECKOUT_SESSION_ID}` template token literal), `portalReturnUrl(base)`.
- `lib/billing/billingSession.ts` — NODE-ONLY `resolveBillingSession(wantSlug)`: centralises
  gate→account session→membership authz→tenant ctx+Tenant doc. Tagged result (short-circuit
  NextResponse ή {session}). Owner/admin required (403 αλλιώς). Δεν αγγίζει feature route ούτε
  το per-tenant User session — μόνο control-plane.
- `app/api/saas/billing/checkout/route.ts` — `POST` `{plan, tenant?}` → Checkout Session.
  Gating: SAAS off 404 / not-auth 401 / not owner-admin 403 / bad-free plan 400 / Stripe
  unconfigured 503 / upstream 502. Επιστρέφει `{url, id}`. ΠΟΤΕ δεν χρεώνει — ο webhook
  αντικατοπτρίζει το αποτέλεσμα.
- `app/api/saas/billing/portal/route.ts` — `POST` `{tenant?}` → Billing Portal Session
  (manage/cancel). Απαιτεί υπάρχον `billingCustomerId` (409 αλλιώς, «checkout first»). Ίδιο
  gating ladder. Επιστρέφει `{url, id}`.
- `lib/billing/billingRoutes.test.ts` — 9 PURE tests (canManageBilling owner/admin vs member/
  unknown, checkoutablePlan paid vs free/unknown, normalizeBase trailing-slash, pickBaseUrl
  env-vs-origin fallback, checkoutUrls template-token literal, portalReturnUrl).

**Verified:** `npm run type-check` → **EXIT 0**. `npm test` → **320/320 green** (9 νέα).
External importers των νέων modules από feature code → **κανένας**· τα routes SAAS-gated (404
όταν off) ⇒ zero runtime wiring, `SAAS_MODE` off = zero effect, κανένα Docker rebuild. Καθαρά
additive — δεν άγγιξα κανένα υπάρχον αρχείο.

**## Needs Achilleas** (billing go-live):
- **Stripe keys** (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_SHARED`, `STRIPE_PRICE_DEDICATED`,
  `STRIPE_WEBHOOK_SECRET`) + optional `SAAS_PUBLIC_URL`/`APP_URL` για τα redirect URLs.
  Χωρίς αυτά τα routes γυρίζουν 503 (graceful).
- Ο webhook σετάρει το `billingCustomerId` στο checkout.completed → το portal route δουλεύει
  μόνο ΜΕΤΑ από ένα ολοκληρωμένο checkout (409 πριν).
- Ανοιχτά από πριν: tenant-aware `saveFile` (shared storage) + enforcement wiring σε `api/v1/*`
  (feature territory) — και τα δύο θέλουν ρητή άδεια ή feature-builder routine.

**Next task:** increment 11 — ένα «billing summary» read surface (`GET /api/saas/billing` ή
επέκταση του `/api/saas/usage`) που ενώνει plan/status/priceMonthlyEUR/subscription-id +
`billingConfigured` flag, ώστε ένα settings/billing UI να ξέρει τι να δείξει (Subscribe vs
Manage). Εναλλακτικά, το enforcement/saveFile wiring αν δοθεί άδεια.
