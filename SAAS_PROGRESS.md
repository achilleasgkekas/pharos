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

---

## 2026-07-02 (increment 12 — workspace member management)
**Σημείωση για increment 11:** το «billing summary» read surface (`GET /api/saas/billing`)
έχει ΗΔΗ landαρίσει στο main (`9ecb86c feat(saas): billing summary read surface`) μαζί με
`lib/billing/billingSummary.ts` + tests — ένα προηγούμενο run το έχτισε/commit-άρισε αλλά το
log entry του χάθηκε (μάλλον σε collision). Καμία επανάληψη· περνάω στο επόμενο κενό.

**Το κενό:** το `Membership` model έχει ήδη `role` (owner/admin/member), `status`
(invited/active/removed) και `invitedBy` — σχεδιασμένο για team, αλλά **τίποτα δεν γράφει
memberships εκτός του signup** (ο implicit owner). Δεν υπήρχε τρόπος να δει/διαχειριστεί
κανείς την ομάδα ενός workspace, παρόλο που ο owner/admin ρόλος ήδη gate-άρει το billing.

**Built** (ΟΛΟ σε νέα αρχεία, control-plane μόνο):
- `lib/tenancy/members.ts` — **PURE** guard helpers (μηδέν imports/DB/env): `parseRole`,
  `canManageMembers` (owner/admin), `canAssignRole` (μόνο owner μπορεί να δώσει owner ρόλο —
  anti-escalation), `activeOwners`, `wouldOrphanOwners` (ένα workspace πρέπει πάντα να έχει
  ≥1 active owner), `normalizeEmail`/`looksLikeEmail`.
- `lib/tenancy/workspaceSession.ts` — NODE-only `resolveWorkspaceSession(slug, requireManage)`:
  γενικεύει το flow του billingSession (gate→account session→membership authz→ctx+Tenant doc)
  με switch `requireManage` (read=οποιοδήποτε active member· mutate=owner/admin). Καθρεφτίζει
  (δεν importάρει) το billingSession ώστε τα δύο concerns να μένουν decoupled.
- `app/api/saas/members/route.ts` (nodejs, force-dynamic) — 4 methods, όλα SaaS-gated:
  - `GET  ?tenant=<slug>` → λίστα members (email/name/role/status/invitedBy) join Account.
    Any active member (read).
  - `POST {email, role?, tenant?}` → προσθέτει ΥΠΑΡΧΟΝ account ως member (reactivate αν ήταν
    removed). Owner/admin· admin ΔΕΝ φτιάχνει owner (403). Email που δεν έχει account →
    404 `account_not_found` (invite-by-email σε νέο user θέλει email delivery — deferred).
    409 σε duplicate. 201 στην επιτυχία.
  - `PATCH {accountId, role, tenant?}` → αλλαγή ρόλου. Owner/admin· last-owner guard (409
    `last_owner` σε demote του μοναδικού owner).
  - `DELETE {accountId, tenant?}` → soft-remove (status→'removed', κρατά το unique row για
    reactivation). Owner/admin· last-owner guard.
- `lib/tenancy/members.test.ts` — 14 PURE tests (parseRole valid/invalid, canManageMembers,
  canAssignRole owner-only-owner + admin admin/member + member-none, activeOwners αγνοεί
  removed, wouldOrphanOwners sole/two/non-owner/removed-target, normalize/looks email).

**Verified:** `npm run type-check` → **EXIT 0**. `npm test` → **412/412 green** (398
προϋπάρχοντα + 14 νέα). External importers των `members`/`workspaceSession` από feature code
→ **κανένας** (μόνο το δικό μου route)· το route SAAS-gated (404 όταν off) ⇒ zero runtime
wiring, `SAAS_MODE` off = zero effect, κανένα Docker rebuild. Καθαρά additive — δεν άγγιξα
κανένα υπάρχον αρχείο.

**## Needs Achilleas** (member management go-live):
- **Invite-by-email σε νέο (μη εγγεγραμμένο) user** θέλει email delivery (transactional email
  provider + token flow). Το `Membership.status:'invited'` + `Account.verifyTokenHash` fields
  υπάρχουν ήδη· λείπει ο mailer. Μέχρι τότε: μόνο ΥΠΑΡΧΟΝΤΑ accounts προστίθενται (404 αλλιώς).
- Seat limits ανά plan (πόσα members επιτρέπει το free/shared/dedicated) — δεν επιβάλλονται
  ακόμα· θα μπουν στα entitlements όταν οριστεί το pricing.

**Next task:** increment 13 — account self-service (`api/saas/account`): change password
(reuse `verifyPassword`+`hashPassword`) + change name/email, όλα gated + πάνω στο υπάρχον
Account session. Εναλλακτικά, password-reset request/confirm scaffold (τα `resetTokenHash`/
`resetTokenExpires` fields υπάρχουν ήδη· λείπει ο mailer → scaffold με token return σε dev).

---

## 2026-07-02 (increment 13 — account self-service: profile + password change)
**Built:** το account self-service surface — ένας logged-in Account μπορεί να δει/αλλάξει το
δικό του προφίλ + password, ΟΛΟ σε νέα αρχεία, πάνω στο υπάρχον Account session, μηδέν wiring
σε feature code:
- `lib/tenancy/accountProfile.ts` — **PURE** helpers (μηδέν imports/DB/env): `MIN_PASSWORD`
  (8, mirror του signup), `sanitizeName(x)` (trim + cap 120 chars, non-string→''),
  `passwordChangeError(current, next)` → error string ή null (length rule ΠΡΩΤΑ, μετά
  must-differ-from-current· ΔΕΝ κάνει verify το current — αυτό το κάνει το route με
  `verifyPassword`).
- `app/api/saas/account/route.ts` (nodejs, force-dynamic, `saasAuthGate()` πρώτα):
  - `GET` → το προφίλ του caller (id/email/name/emailVerified/lastLoginAt/createdAt). 401 αν
    όχι authenticated, 404 αν το account διαγράφηκε με live cookie.
  - `PATCH {name?, email?}` → update name ή/και email. Email: `normalizeEmail`+`looksLikeEmail`
    (reuse από members.ts) + 409 σε duplicate (pre-check + 11000 race fallback) + `emailVerified→false`
    + **refresh του session cookie** (το `email` claim μένει accurate). «Nothing to update» → 400.
    Επιστρέφει account + tenants (ίδια shape με login/session).
- `app/api/saas/account/password/route.ts` — `POST {currentPassword, newPassword}` →
  `verifyPassword(current)` → `hashPassword(next)` save. Ίδιο 401 για missing account / wrong
  current password (no leak). Policy μέσω `passwordChangeError`. Session cookie μένει intact
  (το νέο hash verify-άρεται στο επόμενο login· δεν force-expire-άρω υπάρχοντα sessions εδώ).
- `lib/tenancy/accountProfile.test.ts` — 8 PURE tests (sanitizeName trim/empty/non-string/cap-120,
  passwordChangeError too-short/same/valid/length-before-differ).

**Verified:** `npm run type-check` → **EXIT 0**. `npm test` → **437/437 green** (429 προϋπάρχοντα
+ 8 νέα· ο συνολικός αριθμός ανέβηκε από concurrent routines). External importers των νέων
modules/routes από feature code → **κανένας**· τα routes SAAS-gated (404 όταν off) ⇒ zero
runtime wiring, `SAAS_MODE` off = zero effect, κανένα Docker rebuild. Καθαρά additive — δεν
άγγιξα κανένα υπάρχον αρχείο.

**Next task:** increment 14 — password-reset request/confirm scaffold (`api/saas/account/reset`):
τα `resetTokenHash`/`resetTokenExpires` fields υπάρχουν ήδη στο Account· χτίσε request (email →
mint token, hash+store, expiry) + confirm (token → verify → set new password). Χωρίς mailer →
scaffold που επιστρέφει το token μόνο σε dev/όταν λείπει ο mailer (documented Needs-Achilleas).
Εναλλακτικά, seat-limits ανά plan στα entitlements όταν οριστεί το pricing.

---

## 2026-07-02 (increment 14 — password-reset request/confirm scaffold)
**Built:** το forgot-password flow (unauthenticated by design — ο χρήστης ΞΕΧΑΣΕ το
password), ΟΛΟ σε νέα αρχεία, πάνω στα υπάρχοντα `resetTokenHash`/`resetTokenExpires` fields
του Account, μηδέν wiring σε feature code:
- `lib/tenancy/passwordReset.ts` — PURE helpers (`RESET_TTL_MS`=1h, `resetTokenExpiry`,
  `isResetTokenValid` με injectable now, `resetPasswordError` = length-only, αφού δεν υπάρχει
  «current» password να διαφέρει) + node:crypto helpers (`hashResetToken` = sha256 hex,
  `mintResetToken` = 32 random bytes base64url → {token, tokenHash, expires},
  `resetHashMatches` constant-time, `resetDeliveryConfigured` = ελέγχει SMTP_URL/RESEND_API_KEY).
  Pattern «store the hash, never the secret» — leaked DB row ΔΕΝ replay-άρεται ως live token.
- `app/api/saas/account/reset/request/route.ts` (nodejs, force-dynamic, saasAuthGate) —
  `POST {email}` → mint token, store hash+expiry. **Anti-enumeration:** ΠΑΝΤΑ `{ok:true}`
  ανεξαρτήτως αν υπάρχει account. **Scaffold echo:** όταν λείπει mailer ΚΑΙ NODE_ENV≠production
  → επιστρέφει `devToken` για local testing· σε production ένα unwired mailer ρίχνει το token
  σιωπηλά (fail closed, no leak).
- `app/api/saas/account/reset/confirm/route.ts` — `POST {token, newPassword}` → lookup by
  `hashResetToken(token)` → `isResetTokenValid` → set νέο `passwordHash` + clear reset fields
  (single-use). Generic 400 σε missing/invalid/expired (τίποτα να leak-άρει). Policy μέσω
  `resetPasswordError` ΠΡΙΝ το DB hit. Sessions ΔΕΝ force-expire-άρονται (consistent με το
  password-change route· το νέο hash ισχύει στο επόμενο login).
- `lib/tenancy/passwordReset.test.ts` — 15 PURE tests (expiry TTL, valid/expired/exact-instant/
  null/unparseable, password policy, sha256 determinism+length+distinctness, mint↔hash coherence
  + distinct tokens, constant-time match incl. length-mismatch no-throw).

**Verified:** `npm run type-check` → **EXIT 0**. `npm test` → **462/462 green** (447 προϋπάρχοντα
+ 15 νέα· ο συνολικός ανέβηκε από concurrent routines). External importers των νέων modules/routes
από feature code → **κανένας**· τα routes SAAS-gated (404 όταν off) ⇒ zero runtime wiring,
`SAAS_MODE` off = zero effect, κανένα Docker rebuild. Καθαρά additive — δεν άγγιξα κανένα υπάρχον
αρχείο.

**## Needs Achilleas** (reset go-live):
- **Mailer** (transactional email provider — SMTP ή Resend/Postmark): το request route έχει
  `TODO(Needs-Achilleas)` στο σημείο του send. Μέχρι να μπει, το token επιστρέφεται ως `devToken`
  ΜΟΝΟ σε non-production. Όταν οριστεί ο provider → `resetDeliveryConfigured()` γίνεται true (env
  SMTP_URL ή RESEND_API_KEY) και το echo σβήνει αυτόματα.
- Ίδιος mailer ξεκλειδώνει και το invite-by-email (increment 12) + email verification (verifyTokenHash).

**Next task:** increment 15 — mailer abstraction (`lib/tenancy/mailer.ts`): thin interface
`sendEmail({to, subject, html})` με provider dispatch (SMTP via nodemailer ή Resend HTTP) +
no-op/console fallback όταν unconfigured. Wire το reset-request + το members invite να το καλούν
(behind resetDeliveryConfigured). Χρειάζεται provider decision από Achilleas (βλ. Needs-Achilleas).
Εναλλακτικά, seat-limits ανά plan στα entitlements όταν οριστεί το pricing.

---

## 2026-07-02 (increment 15 — mailer abstraction + reset/invite wiring)
**Built:** το transactional-email layer που ξεκλειδώνει το reset go-live (increment 14) +
το members notification, με **μηδέν νέα εξάρτηση** (Resend μέσω `fetch`, όχι nodemailer):
- `lib/tenancy/mailer.ts` — ένα entry point `sendEmail({to,subject,html})` με provider
  dispatch από env. Χωρισμένο σε **PURE** (unit-tested) + network-touching:
  - PURE: `resolveProvider(env)` (RESEND_API_KEY → `resend`, αλλιώς SMTP_URL → `smtp`,
    αλλιώς `none`· resend precedence), `mailerCanDeliver(env)` (**true ΜΟΝΟ** για wired
    provider = resend· SMTP_URL = intent αλλά όχι deliverable ακόμα), `fromAddress(env)`
    (`MAIL_FROM` ή branded default), `htmlToText(html)` (tag-strip + entity-decode για το
    text/* alternative), `resetLinkUrl(base,token)` (url-encoded token → `/reset?token=`),
    `resetEmail(link)` / `invitedEmail(workspace)` (message builders).
  - NETWORK: `sendEmail(msg)` → `sendViaResend` (POST api.resend.com/emails, **never
    throws**, returns `SendResult`)· `smtp` → warn + `smtp_not_wired` (nodemailer deferred)·
    `none` → dev console log + `delivered:false`. Best-effort by design.
- `lib/tenancy/passwordReset.ts` (δικό μου, additive): το `resetDeliveryConfigured()`
  **delegate-άρει τώρα στο `mailerCanDeliver()`** — μία source of truth. Άλλαξε σημασιολογία:
  SMTP_URL μόνο ΔΕΝ θεωρείται deliverable πλέον (σωστά — δεν είναι wired), οπότε το
  dev-token echo συνεχίζει σε non-prod μέχρι να μπει Resend/SMTP.
- `app/api/saas/account/reset/request/route.ts` (δικό μου, additive): όταν
  `resetDeliveryConfigured()` → χτίζει base URL (`pickBaseUrl(SAAS_PUBLIC_URL||APP_URL,
  origin)`) + `resetLinkUrl` + `await sendEmail(resetEmail(...))`. Το anti-enumeration
  `{ok:true}` + το dev-token echo (όταν όχι deliverable) μένουν ανέπαφα.
- `app/api/saas/members/route.ts` (δικό μου, additive): μετά το add existing account →
  best-effort `void sendEmail(invitedEmail(workspace))` (fire-and-forget, δεν καθυστερεί/
  ρίχνει το 201· no-op χωρίς mailer). Full invite-by-email νέων χρηστών μένει deferred.
- `lib/tenancy/mailer.test.ts` — 13 PURE tests (resolveProvider precedence/fallback/none,
  mailerCanDeliver resend-only, fromAddress default/override, htmlToText strip+decode+empty,
  resetLinkUrl encode+trailing-slash, resetEmail link-embed, invitedEmail name+fallback).

**Verified:** `npm run type-check` → **EXIT 0**. `npm test` → **490/490 green** (477
προϋπάρχοντα + 13 νέα· ο συνολικός ανέβηκε από concurrent routines). Οι δύο edited routes
είναι SAAS-gated (404 όταν off) + οι αλλαγές additive/flag-guarded ⇒ `SAAS_MODE` off = zero
effect, κανένα Docker rebuild. Το mailer module δεν το κάνει import feature code.

**## Needs Achilleas** (mailer go-live):
- **Email provider decision + keys.** Wired σήμερα: **Resend** (`RESEND_API_KEY` + optional
  `MAIL_FROM`) — μηδέν dependency, δουλεύει μόλις μπει το key. Αν προτιμηθεί **SMTP** →
  χρειάζεται το `nodemailer` dependency (νέο `npm install`) + wiring στο `sendViaSmtp` (το
  σημείο έχει `TODO(Needs-Achilleas)`). Μόλις μπει provider → `mailerCanDeliver()` γίνεται
  true, το reset στέλνει link, το members στέλνει notification, το dev-token echo σβήνει.
- Ο ίδιος mailer ξεκλειδώνει και το invite-by-email νέων χρηστών (increment 12 μελλοντικό) +
  email verification (`verifyTokenHash` στο Account).
- Χρειάζεται μια user-facing `/reset` σελίδα (διαβάζει `?token=` → POST στο confirm route)·
  το `resetLinkUrl` δείχνει ήδη εκεί.

**Next task:** increment 16 — είτε (α) `sendViaSmtp` via nodemailer αν επιλεγεί SMTP (μετά
από provider decision), είτε (β) email verification flow (`verifyTokenHash`/`verifyTokenExpires`
υπάρχουν ήδη στο Account) request/confirm scaffold πάνω στον νέο mailer, είτε (γ) seat-limits
ανά plan στα entitlements όταν οριστεί το pricing.

---

## 2026-07-02 (increment 16 — email verification: request/confirm scaffold)
**Built:** το email-verification flow πάνω στον mailer (increment 15), καθρέφτης του
password-reset (increment 14). Ένας logged-in Account επιβεβαιώνει το email του· το confirm
γίνεται με token κλικαρισμένο από το inbox (unauthenticated). ΟΛΟ σε νέα αρχεία + additive-only
edits στα δικά μου SAAS αρχεία:
- `models/Account.ts` (δικό μου, additive): πρόσθεσα το field `verifyTokenExpires` (default
  null) δίπλα στο ήδη υπάρχον `verifyTokenHash` — το schema comment μιλούσε ήδη για «Hashed
  value + expiry», απλά έλειπε το expiry field για verification (μόνο το reset το είχε).
  Backward-compatible: default null, ο DEFAULT_TENANT / self-hosted δεν το αγγίζει ποτέ.
- `lib/tenancy/emailVerify.ts` — PURE + crypto helpers, mirror του passwordReset.ts:
  `VERIFY_TTL_MS` (24h — πιο γενναιόδωρο από το reset 1h, γιατί verification links
  κλικάρονται αργά), `verifyTokenExpiry`, `isVerifyTokenValid` (injectable now),
  `hashVerifyToken` (sha256 hex), `mintVerifyToken` (32 random bytes base64url →
  {token, tokenHash, expires}), `verifyHashMatches` (constant-time). «Store the hash, never
  the secret» — leaked DB row ΔΕΝ replay-άρεται.
- `lib/tenancy/mailer.ts` (δικό μου, additive): `verifyLinkUrl(base, token)` (→ `/verify?token=`,
  url-encoded) + `verifyEmail(link)` message builder (24h notice). Pure, μηδέν send.
- `app/api/saas/account/verify/request/route.ts` — `POST` **AUTHENTICATED** (getCurrentAccount).
  Στοχεύει το email του ΙΔΙΟΥ του caller → μηδέν enumeration surface. Already-verified →
  short-circuit `{ok:true, alreadyVerified:true}`, κανένα token. Αλλιώς mint + store hash+expiry
  + (αν `mailerCanDeliver`) `sendEmail`. Scaffold echo: `devToken` ΜΟΝΟ όταν δεν υπάρχει mailer
  ΚΑΙ NODE_ENV≠production.
- `app/api/saas/account/verify/confirm/route.ts` — `POST {token}` **UNAUTHENTICATED** (proof
  via token). Lookup by `hashVerifyToken` → `isVerifyTokenValid` → `emailVerified:true` + clear
  verify fields (single-use). Generic 400 σε missing/invalid/expired (τίποτα να leak-άρει).
- `lib/tenancy/emailVerify.test.ts` — 13 PURE tests (TTL 24h, valid/expired/exact-instant/null/
  unparseable, sha256 determinism+length+distinctness, mint↔hash coherence + distinct tokens,
  constant-time match incl. length-mismatch no-throw).

**Verified:** `npm run type-check` → **EXIT 0**. `npm test` → **531/531 green** (518 προϋπάρχοντα
+ 13 νέα). External importers των νέων modules/routes από feature code → **κανένας**· τα routes
SAAS-gated (404 όταν off) ⇒ zero runtime wiring, `SAAS_MODE` off = zero effect, κανένα Docker
rebuild. Άγγιξα μόνο δικά μου SAAS αρχεία (Account model + mailer· additive).

**## Needs Achilleas** (verification go-live):
- **Mailer** (ίδιος με reset/invite): μέχρι να μπει Resend (`RESEND_API_KEY`) ή wired SMTP, το
  verify-request επιστρέφει `devToken` ΜΟΝΟ σε non-production. Μόλις μπει provider →
  `mailerCanDeliver()` true, στέλνεται link, το echo σβήνει.
- Χρειάζεται user-facing `/verify` σελίδα (διαβάζει `?token=` → POST στο confirm route)· το
  `verifyLinkUrl` δείχνει ήδη εκεί. Ίδιο pattern με το `/reset`.

**Next task:** increment 17 — είτε (α) `sendViaSmtp` via nodemailer (μετά από provider decision
Achilleas), είτε (β) seat-limits ανά plan στα entitlements όταν οριστεί το pricing (πόσα members
επιτρέπει free/shared/dedicated· τα guards ζουν ήδη στο members.ts), είτε (γ) invite-by-email
νέων (μη εγγεγραμμένων) users — τώρα που υπάρχει mailer + token pattern, μπορεί να στείλει
signup link σε email που δεν έχει account.

---

## 2026-07-02 (increment 17 — per-plan seat limits)
**Built:** enforcement ορίου θέσεων (active members) ανά plan, additive + SAAS-gated. Ένα
workspace σε free tier δεν προσθέτει 2ο member· shared → έως 5· dedicated (και self-hosted) →
απεριόριστα. ΟΛΟ σε νέα/δικά μου SAAS-billing αρχεία:
- `lib/billing/plans.ts` (δικό μου, additive): νέο field `maxMembers: number | null` στο PlanDef
  + τιμές — free **1** (single-seat owner), shared **5** (household/team), dedicated **null**
  (unlimited). Placeholder counts μέχρι το τελικό pricing (Needs Achilleas). PURE module, μηδέν
  imports· self-hosted δεν το διαβάζει ποτέ (τρέχει ως implicit dedicated).
- `lib/billing/entitlements.ts` (δικό μου, additive): `maxMembers` στο `Entitlements` type +
  resolve στο `entitlementsFor` + νέο pure guard **`withinSeatLimit(plan, activeCount)`** →
  `cap===null ? true : max(0,activeCount) < cap`. Το clamp στο 0 εμποδίζει negative input να
  «φτιάξει» χώρο πάνω από το cap.
- `app/api/saas/members/route.ts` (δικό μου, additive): στο POST, ΜΕΤΑ το already-member 409 και
  ΠΡΙΝ το create/reactivate → `Membership.countDocuments({tenant, status:'active'})` +
  `withinSeatLimit(session.tenant.plan, activeCount)`. Full → **409 `code:'seat_limit'`** με
  `maxMembers` στο body. Πιάνει και reactivate removed member (καταναλώνει seat). Live count →
  ΟΧΙ stale snapshot· dedicated/self-hosted short-circuit (cap null).
- `lib/billing/seatLimits.test.ts` — 10 PURE tests (plan table: κάθε plan έχει έγκυρο maxMembers,
  free1/shared5/dedicated-null, non-decreasing ladder, entitlementsFor surfaces it, unknown→free·
  withinSeatLimit: free boundary 0→true/1→false, shared 4→true/5→false, dedicated always, unknown
  →free, negative clamp).

**Verified:** `npm run type-check` → **EXIT 0**. `npm test` → **548/548 green** (538 προϋπάρχοντα
+ 10 νέα· ο συνολικός ανέβηκε από concurrent routines). Το members route είναι SAAS-gated (404
όταν off) + οι αλλαγές additive/flag-guarded σε pure modules ⇒ `SAAS_MODE` off = zero effect,
κανένα Docker rebuild. External importers των billing helpers από feature code → κανένας νέος.

**## Needs Achilleas** (seat pricing):
- **Τελικά seat counts ανά plan.** Σήμερα placeholder: free 1, shared 5, dedicated ∞. Άλλαξέ τα
  σε ΕΝΑ σημείο (`PLANS[*].maxMembers` στο plans.ts)· το guard + το route ακολουθούν αυτόματα.
- Όταν οριστεί per-seat billing (αντί flat plan), θα χρειαστεί Stripe quantity-based subscription
  + sync του seat count → increment μελλοντικό (τώρα το enforcement είναι hard cap, όχι metered).

**Next task:** increment 18 — είτε (α) `sendViaSmtp` via nodemailer (μετά από provider decision
Achilleas), είτε (β) invite-by-email νέων (μη εγγεγραμμένων) users πάνω στον mailer + token
pattern (στέλνει signup link), είτε (γ) storage-quota enforcement wiring (`withinStorage` +
`dbStats`) στο upload path, SAAS-gated.

---

## 2026-07-02 (increment 18 — invite-by-email νέων/μη-εγγεγραμμένων users)
**Built:** end-to-end invite flow ώστε ένας owner/admin να προσθέτει member με email που **δεν
έχει account ακόμα** (πριν: 404 `account_not_found`). Χτισμένο πάνω στον υπάρχοντα mailer +
token pattern (reset/verify). ΟΛΟ SAAS-gated, additive, σε δικά μου αρχεία:
- `lib/tenancy/invites.ts` (νέο, καθρέφτης του emailVerify/passwordReset): `INVITE_TTL_MS`
  **7 μέρες** (τα invites προωθούνται/κάθονται — μεγαλύτερο από reset 1h/verify 24h),
  `inviteTokenExpiry`, `isInviteValid(status, expires, now)` (μόνο `pending` + future),
  `hashInviteToken` (sha256 hex), `mintInviteToken` (32 bytes base64url → token + hash +
  expires), `inviteHashMatches` (constant-time, length-safe). node:crypto + pure, μηδέν άλλα
  imports. **«store the hash, never the secret»**.
- `models/Invite.ts` (νέο control-plane model): tenant/email/role/status(pending·accepted·
  revoked)/tokenHash/expires/invitedBy/acceptedBy + timestamps. Index {tokenHash} (lookup) +
  {tenant,email,status} (non-unique — επιτρέπει re-invite μετά από revoke/expire). Distinct
  από Membership (invite = μόνο για τη not-yet-registered περίπτωση).
- `lib/tenancy/mailer.ts` (δικό μου, additive): `inviteLinkUrl(base, token)` → `/signup?
  invite=<token>` + `inviteEmail(link, workspaceName)` message builder (signup-link variant,
  ξεχωριστός από τον υπάρχοντα `invitedEmail` που ειδοποιεί existing account). Pure.
- `app/api/saas/members/route.ts` (δικό μου, additive): το POST 404-branch → νέα helper
  **`inviteUnregistered(req, session, email, role)`**: (α) **seat check counts active members
  + pending invites** (ένα pending invite δεσμεύει μελλοντική θέση → δεν invite-άρεις πάνω
  από το cap· dedicated/self-hosted null → πάντα περνά), (β) supersede (revoke) τυχόν
  προηγούμενο pending invite για το ίδιο (tenant,email) ώστε μόνο ο νεότερος token να ζει,
  (γ) mint + Invite.create, (δ) email signup-link όταν `mailerCanDeliver()`, (ε) **SCAFFOLD
  dev-token echo** (mirror reset/request: non-prod + no mailer → `devToken` στο body· prod
  drops silently). Response 201 `{ invite, inviteByEmail:true }`.
- `app/api/saas/invites/accept/route.ts` (νέο): POST `{ token, password?, name? }`,
  UNAUTHENTICATED (ο invitee δεν έχει session). Lookup by `hashInviteToken` → `isInviteValid`
  guard (αλλιώς 410). Reuse account αν υπάρχει ήδη (signed up meanwhile) αλλιώς create
  (password ≥8 required, 11000-race fallback). Create/reactivate active Membership με το
  invited role (**idempotent**). Mark invite accepted (`acceptedBy`) → token δεν replay-άρεται.
  setAccountCookie → auto-login. Return account + tenants (όπως signup). SaaS-gated (404 off).
- `lib/tenancy/invites.test.ts` — 13 PURE tests (TTL=7d, expiry math, isInviteValid: pending+
  future only / past / non-pending / null / ISO string / unparseable, hash determinism+64hex+
  distinct, mint↔hash coherence + right expiry + base64url + distinct tokens, constant-time
  match incl. length-mismatch no-throw).

**Verified:** `npm run type-check` → **EXIT 0**. `npm test` → **586/586 green** (573 προϋπάρχοντα
+ 13 νέα· ο συνολικός ανέβηκε από concurrent routines). Τα invite routes SAAS-gated (404 όταν
off)· members route additive· mailer/invites/model pure ⇒ `SAAS_MODE` off = zero effect, κανένα
Docker rebuild, κανένα runtime wiring. External importers των νέων modules από feature code →
κανένας. Άγγιξα μόνο δικά μου SAAS αρχεία.

**## Needs Achilleas** (invite go-live):
- **Mailer** (ίδιο με reset/verify): μέχρι να μπει Resend (`RESEND_API_KEY`), το invite-mint
  επιστρέφει `devToken` ΜΟΝΟ σε non-production. Μόλις μπει provider → `mailerCanDeliver()` true,
  στέλνεται το signup-link, το echo σβήνει.
- Χρειάζεται user-facing `/signup` handling του `?invite=` param → prefill email (read-only) +
  POST token+password στο `/api/saas/invites/accept`. Το `inviteLinkUrl` δείχνει ήδη εκεί.

**Next task:** increment 19 — είτε (α) **invites list/revoke route** (`GET`/`DELETE
/api/saas/invites` — owner/admin βλέπει/ακυρώνει outstanding pending invites· lifecycle mgmt),
είτε (β) `sendViaSmtp` via nodemailer (μετά από provider decision Achilleas), είτε (γ)
storage-quota enforcement wiring (`withinStorage` + `dbStats`) — αλλά αυτό αγγίζει feature
upload path (εκτός territory), οπότε θα ήθελε flag-guarded shim.

## 2026-07-02 (increment 19 — invites list/revoke route)
**Built:** lifecycle management των outstanding invites — ο owner/admin βλέπει και ακυρώνει
τα pending invitations που μίντησε το `/api/saas/members` (increment 18). Κλείνει τον κύκλο
mint → send → **list/revoke** → accept. ΟΛΟ SAAS-gated, additive, σε δικά μου αρχεία:
- `lib/tenancy/invites.ts` (additive): νέος PURE serializer **`inviteView`** + `InviteView`
  type — client-safe projection (id/email/role/status/expires/expired/createdAt). **By
  construction δεν φέρει ΠΟΤΕ το tokenHash** (μόνο whitelisted πεδία). `expired` derived μέσω
  `isInviteValid` ώστε το UI να ξεχωρίζει live links από stale pending rows past-TTL. Δέχεται
  Date ή ISO-string, null-safe. `toIso` helper (NaN-guard). Μηδέν νέα imports.
- `app/api/saas/invites/route.ts` (νέο): **GET** `[?tenant]` → pending invites, newest-first,
  owner/admin only (`resolveWorkspaceSession(slug, true)`). **DELETE** `{inviteId, tenant?}` →
  revoke (status→revoked) μόνο αν `_id + tenant + status:'pending'` ταιριάζουν
  (workspace-scoped· ένας tenant δεν αγγίζει invites άλλου· matchedCount 0 → 404). Runtime
  nodejs + force-dynamic. Μόνο control-plane Invite collection· κανένα feature route/per-tenant
  db/self-hosted session.
- `lib/tenancy/invites.test.ts` — +7 PURE tests για inviteView (field projection + id-stringify,
  **no tokenHash leak + exact key set**, expired-flag pending-past-TTL true/future false,
  non-pending never expired, ISO-string + null expiry [null→expired true], defaults για missing
  optional fields).

**Verified:** `npm run type-check` → **EXIT 0**. `npm test` → **606/606 green** (599 προϋπάρχοντα
+ 7 νέα· ο συνολικός ανέβηκε από concurrent routines). Το invites route SAAS-gated (404 όταν off)
+ ο serializer pure/additive ⇒ `SAAS_MODE` off = zero effect, κανένα Docker rebuild, κανένα
runtime wiring. External importers των νέων/edited modules από feature code → κανένας. Άγγιξα
μόνο δικά μου SAAS αρχεία.

**## Needs Achilleas** (invites UI):
- Χρειάζεται user-facing workspace-settings section (owner/admin) που καλεί `GET
  /api/saas/invites` → λίστα με resend/revoke controls· το revoke καλεί `DELETE`. Το
  `expired` flag ήδη σηματοδοτεί ποια links θέλουν re-mint (νέο POST στο members route).
- Resend = re-mint (νέος token) μέσω του υπάρχοντος members POST· δεν υπάρχει ξεχωριστό
  resend endpoint (ο παλιός token supersede-άρεται ήδη στο mint). Αν θες dedicated resend →
  increment.

**Next task:** increment 20 — είτε (α) `sendViaSmtp` via nodemailer (μετά από provider decision
Achilleas· ξεκλειδώνει reset/verify/invite delivery σε production), είτε (β) accepted/revoked
invites στη λίστα με ?status filter (audit view), είτε (γ) dedicated resend endpoint (re-mint +
email σε ένα βήμα).

## 2026-07-02 (increment 20 — invites list ?status audit filter)
**Built:** το `GET /api/saas/invites` δεχόταν μόνο τα `pending`· τώρα δέχεται optional
`?status=pending|accepted|revoked|all` ώστε ο owner/admin να βλέπει και **accepted/revoked
history** (audit view), όχι μόνο τα outstanding. ΟΛΟ SAAS-gated, additive, backward-compatible,
σε δικά μου αρχεία:
- `lib/tenancy/invites.ts` (additive): δύο PURE helpers — **`parseInviteStatusFilter(raw)`**
  (case-insensitive + trim· unknown/missing/empty → `'pending'` ώστε κάθε υπάρχων caller που
  παραλείπει το param να παίρνει ΑΚΡΙΒΩΣ το ίδιο αποτέλεσμα· δέχεται τα 3 concrete statuses +
  `'all'`) + **`inviteStatusQuery(filter)`** (`'all'` → `{}` no-constraint· concrete →
  `{ status }`). Νέος type `InviteStatusFilter = InviteStatus | 'all'`. Μηδέν νέα imports.
- `app/api/saas/invites/route.ts` (additive): το GET διαβάζει πλέον `?status`, φιλτράρει με
  `{ tenant, ...inviteStatusQuery(filter) }`, και επιστρέφει το resolved `status` στο body
  (additive πεδίο). Owner/admin gate + workspace scope αμετάβλητα.
- `lib/tenancy/invites.test.ts` — +5 PURE tests (default/empty/unknown→pending, τα 4 valid
  values, case+trim· inviteStatusQuery all→{} και concrete→{status}).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run invites.test.ts` → **24/24
green** (19 προϋπάρχοντα + 5 νέα). Το route SAAS-gated (404 όταν off) + οι helpers pure/additive
+ default = παλιά συμπεριφορά ⇒ `SAAS_MODE` off = zero effect, κανένα Docker rebuild, κανένα
runtime wiring, καμία νέα εξάρτηση. Άγγιξα μόνο δικά μου SAAS αρχεία.

**Next task:** increment 21 — είτε (α) `sendViaSmtp` via nodemailer (μετά από provider decision
Achilleas· ξεκλειδώνει reset/verify/invite delivery σε production), είτε (β) dedicated resend
endpoint (re-mint + email σε ένα βήμα, αντί POST στο members route), είτε (γ) accepted-invite
audit metadata στο inviteView (acceptedBy/acceptedAt projection για την audit λίστα του §20).

## 2026-07-02 (increment 21 — accepted-invite audit metadata στο inviteView)
**Built:** το audit view του §20 (`?status=accepted|all`) έδειχνε accepted invites αλλά **χωρίς
who/when** — ποιος τα δέχτηκε και πότε. Πρόσθεσα explicit acceptance trail. ΟΛΟ SAAS-gated,
additive, backward-compatible, σε δικά μου αρχεία:
- `models/Invite.ts` (additive): νέο πεδίο **`acceptedAt: { type: Date, default: null }`**.
  Ξεχωριστό από το `updatedAt` (που bump-άρει και στο revoke) → null μέχρι το redeem και
  αμετάβλητο μετά, οπότε το «ποιος/πότε» είναι μονοσήμαντο. Το `acceptedBy` προϋπήρχε.
- `app/api/saas/invites/accept/route.ts` (additive): το consume-step βάζει πλέον
  `acceptedAt: new Date()` μαζί με `status:'accepted', acceptedBy` στο ίδιο `$set`.
- `lib/tenancy/invites.ts` (additive): ο `InviteView` type + ο `inviteView` serializer
  προβάλλουν **`acceptedBy: string|null`** (stringified ObjectId, null σε pending/revoked) +
  **`acceptedAt: string|null`** (ISO μέσω του υπάρχοντος null-safe `toIso`). By construction
  ΠΟΤΕ tokenHash — μόνο whitelisted πεδία.
- `app/api/saas/invites/route.ts` (additive): το GET `.select()` += `acceptedBy acceptedAt`
  ώστε να φτάνουν στον serializer. Gate/scope/sort αμετάβλητα.
- `lib/tenancy/invites.test.ts` — ενημέρωσα το exact-key-set assertion (+acceptedAt/acceptedBy)
  + 2 νέα it-blocks (accepted invite → projects '99'/ISO· pending → null/null) + 2 assertions
  στο defaults test.

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run invites.test.ts` → **26/26
green** (24 προϋπάρχοντα + 2 νέα). Additive model field με default + routes SaaS-gated (404 off)
+ serializer pure ⇒ `SAAS_MODE` off = zero effect, κανένα Docker rebuild (self-hosted path δεν
mint-άρει invites, κανένας external importer των αλλαγών), καμία νέα εξάρτηση. Άγγιξα μόνο δικά
μου SAAS αρχεία.

**Next task:** increment 22 — είτε (α) `sendViaSmtp` via nodemailer (μετά από provider decision
Achilleas· ξεκλειδώνει reset/verify/invite delivery σε production), είτε (β) dedicated resend
endpoint (re-mint + email σε ένα βήμα), είτε (γ) `invitedBy` projection στο inviteView (ποιος
έστειλε το invite — συμπληρώνει το acceptedBy του §21 για πλήρες audit trail).

## 2026-07-02 (increment 22 — audit-log foundation)
**Built:** append-only per-tenant **audit trail** για security/billing events — η βάση για
ένα workspace-settings «Activity» panel (και μελλοντικό compliance export των §14/§15). Κλείνει
το «ποιος έκανε τι»: member added/removed, role changed, invite sent/resent/accepted/revoked,
plan changed. ΟΛΟ SAAS-gated, additive, νέα αρχεία μόνο (κανένα existing file δεν αγγίχτηκε):
- `models/AuditEvent.ts` (νέο): control-plane model (tenant/actor/action/target/meta,
  `createdAt`-only timestamps = immutable by convention). `action` free String (όχι enum →
  zero migration για νέο verb· validation στον recorder). Indexes `{tenant,createdAt:-1}` +
  `{tenant,action,createdAt:-1}`. **Secret-free zone** by design.
- `lib/tenancy/audit.ts` (νέο): PURE helpers + node-only recorder. `AUDIT_ACTIONS` closed
  list + `isAuditAction`/`parseAuditAction` (trim+lowercase, unknown→null). **`redactMeta`** —
  strip sensitive keys (token/password/secret/hash/cookie/authorization/apikey, case-insensitive
  substring) + drop non-scalar/non-plain values + depth-bound (≤4) + scalar-only arrays →
  display-safe copy ή null. **`auditView`** client-safe serializer (whitelist projection,
  re-redacts meta defence-in-depth, stringified ids, null-safe). **`recordAudit(ctx, input)`**
  node-only: no-op για default/self-hosted tenant + missing tenantId + unknown action· **never
  throws** (audit failure ≠ load-bearing)· lazy model import. Μηδέν side-effect imports στα pure.
- `app/api/saas/audit/route.ts` (νέο): **GET** `[?tenant][?action][?limit=1..200][?before=<iso>]`
  → workspace activity newest-first, owner/admin only (`resolveWorkspaceSession(slug, true)`).
  Keyset pagination cursor (`before`, bad cursor ignored όχι 400)· optional action filter
  (unknown→all)· serializer projection ⇒ κανένα secret leak. Runtime nodejs + force-dynamic.
- `lib/tenancy/audit.test.ts` — 15 PURE tests (action validation, redactMeta: scalars/sensitive-
  strip/null-drop/scalar-arrays/nested-recurse/all-stripped→null/depth-bound, auditView: exact
  key set + no-token-leak + null-safe + re-redact + ISO/garbage createdAt).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run audit.test.ts` → **15/15 green**.
Route SAAS-gated (404 off) + model/lib pure/additive + κανένας external importer των νέων modules
από feature code ⇒ `SAAS_MODE` off = zero effect, κανένα Docker rebuild, κανένα runtime wiring,
καμία νέα εξάρτηση. Άγγιξα μόνο δικά μου νέα SAAS αρχεία (git add explicit 4 paths· foreign
`.claude/launch.json`+`MOBILE_PARITY.md` άθικτα). Push: `e91addf`.

**## Needs Achilleas** (audit go-live):
- Χρειάζεται user-facing workspace-settings «Activity» section (owner/admin) που καλεί
  `GET /api/saas/audit` → λίστα events με action/actor/target/time + action-filter + «load more»
  (before cursor). UI-only· το read API είναι έτοιμο.

**Next task:** increment 23 — **wire `recordAudit` into the mutating SaaS routes** (τα δικά μου,
εντός territory): members POST/PATCH/DELETE (member.added/role_changed/removed), invites
POST-mint/resend/accept/revoke (invite.sent/resent/accepted/revoked), billing webhook
(plan.changed). Additive fire-and-forget calls (never-throw recorder ⇒ zero risk στο user action),
SAAS-gated routes ⇒ off = never runs. Μετά: audit `?action` filter αποκτά πραγματικά δεδομένα.

## 2026-07-02 (increment 23 — wire recordAudit into mutating SaaS routes)
**Built:** το audit-log foundation του §22 είχε recorder + read API αλλά **κανέναν writer** — η
`?action` λίστα ήταν πάντα άδεια. Τώρα τα mutating SaaS routes (εντός territory) καταγράφουν
πραγματικά events. ΟΛΟ SAAS-gated, additive, backward-compatible, σε δικά μου SAAS αρχεία:
- `lib/tenancy/audit.ts` (additive): (α) το `recordAudit` δέχεται πλέον `AuditCtx =
  Pick<TenantContext,'isDefault'|'tenantId'>` αντί για ολόκληρο `TenantContext` — **widening**
  (μόνο αυτά τα 2 πεδία διαβάζει), οπότε και το `session.ctx` ΚΑΙ ένα minimal ctx ταιριάζουν·
  (β) νέος PURE helper **`auditCtx(tenantId)`** για paths χωρίς workspace session (invite-accept
  unauthenticated + system Stripe webhook) → `{isDefault:false, tenantId}`· null/empty id →
  `tenantId:null` = no-op recorder.
- `app/api/saas/members/route.ts`: `member.added` (POST, existing account· meta reactivated
  flag), `invite.sent` (POST → inviteUnregistered mint), `member.role_changed` (PATCH· meta
  from→to), `member.removed` (DELETE). Το PATCH/DELETE destructure πλέον και `views` για
  email ως audit target (πριν μόνο `lite`).
- `app/api/saas/invites/route.ts`: `invite.revoked` (DELETE). Το revoke updateOne→
  **findOneAndUpdate** ώστε να ανακτηθεί email/role για το audit target πριν revoke-αριστεί.
- `app/api/saas/invites/resend/route.ts`: `invite.resent` (POST re-mint).
- `app/api/saas/invites/accept/route.ts`: `invite.accepted` (POST redeem· actor = ο invitee
  που δέχεται, ctx = `auditCtx(invite.tenant)` αφού δεν υπάρχει session ακόμα).
- `app/api/saas/billing/webhook/route.ts`: `plan.changed` (system actor, actor:null, target=
  tenant.slug, meta from→to) μέσω νέου `auditPlanChange(tenant, prevPlan)` — **no-op όταν το
  plan δεν άλλαξε** (subscription updated χωρίς price change ⇒ κανένα row)· καλείται σε
  onSubscriptionActive + onSubscriptionCanceled.
- `lib/tenancy/audit.test.ts` — +3 PURE tests για `auditCtx` (id→non-default ctx, non-string
  stringify, null/undefined/empty→null tenantId no-op).

Design: όλα τα recordAudit calls **awaited** (όχι fire-and-forget) — ο recorder never-throws,
οπότε το await εγγυάται durability του audit row χωρίς ρίσκο στο user action· η μία insert
είναι αμελητέα. Redaction (§22 `redactMeta`) τρέχει σε κάθε meta ⇒ κανένα secret στο trail.

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run audit.test.ts invites.test.ts`
→ **46/46 green** (43 προϋπάρχοντα + 3 νέα). ΟΛΕΣ οι edited routes είναι SAAS-gated
(`saasAuthGate`/`resolveWorkspaceSession`/`saasMode` → 404 όταν off) + `recordAudit` no-op για
default tenant ⇒ `SAAS_MODE` off = **zero effect** στο self-hosted app· κανένα feature route/
data-db/User-path αγγίχτηκε. Κανένας Docker rebuild (οι routes 404 στο running container με
SAAS_MODE off — δεν εκτελείται ο νέος κώδικας· type-check καλύπτει το compile). Καμία νέα
εξάρτηση. Άγγιξα μόνο δικά μου SAAS αρχεία (foreign `.claude/launch.json` άθικτο).

**Next task:** increment 24 — είτε (α) user-facing workspace-settings «Activity» panel που
consume-άρει το `GET /api/saas/audit` (UI-only, το read+write API είναι πλέον πλήρες), είτε (β)
`sendViaSmtp` via nodemailer (μετά provider decision Achilleas), είτε (γ) `invitedBy` projection
στο inviteView για πλήρες invite audit trail.

## 2026-07-02 (increment 24 — resolve actor emails in the audit read API)
**Built:** το `GET /api/saas/audit` του §22-23 επέστρεφε `actor` ως γυμνό Account ObjectId — ένα
μελλοντικό workspace-settings «Activity» panel δεν μπορεί να δείξει human name χωρίς N+1 lookup
που δεν έχει API. Πρόσθεσα batched actor-email resolution. ΟΛΟ SAAS-gated, additive,
backward-compatible, σε δικά μου SAAS αρχεία:
- `lib/tenancy/audit.ts` (additive): (α) ο `AuditView` απέκτησε **`actorEmail: string|null`**
  (display-only, ΠΟΤΕ secret· null σε system events/deleted accounts)· (β) ο `auditView` δέχεται
  **optional 2ο param `actorEmail = null`** (default → backward-compatible, όλοι οι υπάρχοντες
  1-arg callers αμετάβλητοι)· (γ) νέος PURE helper **`collectActorIds(events)`** → distinct,
  stringified, non-null actor ids (Set-dedup· system events με null actor δεν συνεισφέρουν) ώστε
  ο route να κάνει **ΕΝΑ** `_id:{$in}` query αντί N+1.
- `app/api/saas/audit/route.ts` (additive): μετά το fetch, `collectActorIds(events)` →
  `Account.find({_id:{$in}}).select('email').lean()` → `Map<id,email>` → `auditView(ev, email)`.
  Skip εντελώς όταν κανένας actor. System/deleted → null (το map δεν έχει entry). Gate/scope/
  cursor/action-filter αμετάβλητα.
- `lib/tenancy/audit.test.ts` — +5 PURE tests: actorEmail projection (route-passed vs default
  vs explicit-null), updated exact-key-set assertion (+actorEmail), `collectActorIds`
  (distinct+dedup / null-undefined-drop / empty batch).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run audit.test.ts` → **23/23 green**
(18 προϋπάρχοντα + 5 νέα). Route SAAS-gated (404 όταν SAAS_MODE off) + serializer pure/additive
+ κανένας external importer των αλλαγών από feature code ⇒ `SAAS_MODE` off = **zero effect** στο
self-hosted app· κανένας Docker rebuild (route 404 στο running container με SAAS_MODE off — ο νέος
κώδικας δεν εκτελείται· type-check καλύπτει το compile)· καμία νέα εξάρτηση· κανένα feature route/
data-db/User-path αγγίχτηκε. Άγγιξα μόνο δικά μου SAAS αρχεία (foreign `.claude/launch.json` άθικτο).
Push: `77836a1`.

**Next task:** increment 25 — είτε (α) user-facing workspace-settings «Activity» panel που
consume-άρει το `GET /api/saas/audit` (τώρα το read API επιστρέφει actorEmail → πλήρως render-able·
UI-only), είτε (β) `sendViaSmtp` via nodemailer (μετά provider decision Achilleas· ξεκλειδώνει
reset/verify/invite delivery), είτε (γ) `target`-email enrichment για invite/member events (το
target είναι ήδη email/slug string, οπότε ίσως δεν χρειάζεται) ή actor-name προσθήκη αν το Account
αποκτήσει displayName πεδίο.

## 2026-07-02 (increment 25 — resolve actor names in the audit read API)
**Built:** το `GET /api/saas/audit` (§24) επέστρεφε `actorEmail` αλλά όχι ανθρώπινο όνομα. Το
`Account` έχει **ήδη** πεδίο `name` (default `''`) — δεν χρειάστηκε νέο `displayName` όπως έλεγε
το §24 option (γ). Πρόσθεσα batched actor-**name** resolution δίπλα στο email, ώστε ένα «Activity»
panel να δείχνει «Achilleas» αντί για σκέτο email. ΟΛΟ SAAS-gated, additive, backward-compatible,
σε δικά μου SAAS αρχεία:
- `lib/tenancy/audit.ts` (additive): (α) ο `AuditView` απέκτησε **`actorName: string|null`**
  (display-only, ΠΟΤΕ secret· null σε system events/deleted accounts/blank name)· (β) ο
  `auditView` δέχεται **optional 3ο param `actorName = null`** (positional, μετά το `actorEmail`
  του §24 → όλοι οι υπάρχοντες 1-arg/2-arg callers αμετάβλητοι). `collectActorIds` (§24)
  ξαναχρησιμοποιείται ως έχει (ίδιο batched id set για email+name).
- `app/api/saas/audit/route.ts` (additive): το `.select('email')` → **`.select('email name')`**·
  χτίζει και `nameById` map δίπλα στο `emailById` (μία διαδρομή, ο ίδιος `_id:{$in}` lookup — ΟΧΙ
  δεύτερο query). **Blank name (Account default `''`) → trim → treated as absent** ⇒ nameById δεν
  έχει entry ⇒ `actorName:null`, το UI πέφτει πίσω στο email. System/deleted → null. Το map-build
  refactor-άρισε το event mapping σε ένα resolved `id` (μηδέν διπλό `String(ev.actor)`).
- `lib/tenancy/audit.test.ts` — updated exact-key-set assertion (+actorName) + null-safe
  assertions + 1 νέο it-block («projects actorName from 3rd arg») + επέκταση του email-default test
  (email set αλλά name null όταν blank).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run audit.test.ts` → **24/24 green**·
full suite `npx vitest run` → **703/703 green** (καμία regression). Route SAAS-gated (404 όταν
SAAS_MODE off) + serializer pure/additive + κανένας external importer των αλλαγών από feature code
⇒ `SAAS_MODE` off = **zero effect** στο self-hosted app· κανένας Docker rebuild (route 404 στο
running container με SAAS_MODE off — ο νέος κώδικας δεν εκτελείται· type-check καλύπτει το compile)·
καμία νέα εξάρτηση· κανένα feature route/data-db/User-path αγγίχτηκε. Άγγιξα μόνο δικά μου SAAS
αρχεία (foreign `.claude/launch.json` άθικτο).

**Next task:** increment 26 — είτε (α) user-facing workspace-settings «Activity» panel που
consume-άρει το `GET /api/saas/audit` (το read API επιστρέφει πλέον actorEmail+actorName → πλήρως
render-able· UI-only), είτε (β) `sendViaSmtp` via nodemailer (μετά provider decision Achilleas·
ξεκλειδώνει reset/verify/invite delivery), είτε (γ) `invitedBy` projection στο inviteView (ποιος
έστειλε το invite — συμπληρώνει το acceptedBy/acceptedAt του §21 για πλήρες invite audit trail).

## 2026-07-02 (increment 26 — resolve inviter/accepter emails+names in the invites list)
**Built:** το option (γ) του §25 (`invitedBy` projection) είχε ΗΔΗ landαρίσει (ο `inviteView`
έβγαζε ήδη `invitedBy`/`acceptedBy` ids). Το πραγματικό κενό: το `GET /api/saas/invites`
επέστρεφε **γυμνά Account ObjectIds** για inviter/accepter — ένα «Invitations» panel δεν
μπορεί να δείξει ανθρώπινο όνομα χωρίς N+1 lookup. Πρόσθεσα batched email+name resolution,
ΑΚΡΙΒΩΣ ο ίδιος μηχανισμός με το audit read API (§24-25). ΟΛΟ SAAS-gated, additive,
backward-compatible, σε δικά μου SAAS αρχεία:
- `lib/tenancy/invites.ts` (additive): (α) ο `InviteView` απέκτησε **`inviterEmail`/`inviterName`/
  `accepterEmail`/`accepterName`** (display-only, ΠΟΤΕ secret· null σε legacy rows/deleted
  accounts/blank name)· (β) νέος type `InviteIdentities` + ο `inviteView` δέχεται **optional 3ο
  param `ids: InviteIdentities = {}`** (μετά το `nowMs`· όλοι οι υπάρχοντες 1-arg/2-arg callers
  αμετάβλητοι — default null → pure serializer δουλεύει χωρίς DB)· (γ) νέος PURE helper
  **`collectInviteAccountIds(invites)`** → distinct stringified non-null ids **και** από τα δύο
  πεδία (invitedBy + acceptedBy) ώστε ο route να κάνει **ΕΝΑ** `_id:{$in}` query αντί N+1.
- `app/api/saas/invites/route.ts` (additive): μετά το fetch, `collectInviteAccountIds` →
  `Account.find({_id:{$in}}).select('email name')` → `emailById`/`nameById` maps → `inviteView(inv,
  undefined, {inviter/accepter email+name})`. Skip lookup όταν κανένα account. Blank name (Account
  default `''`) → trim → absent ⇒ null (UI falls back στο email). Gate/scope/status-filter/sort
  αμετάβλητα.
- `lib/tenancy/invites.test.ts` — updated exact-key-set assertion (+4 identity keys) + 2 νέα
  it-blocks (default-null identities· projection από 3ο arg) + νέο `collectInviteAccountIds`
  describe (distinct+dedup cross-field· null/undefined-drop + empty batch).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run invites.test.ts` → **32/32 green**
(26 προϋπάρχοντα + 6 νέα)· full suite `npx vitest run` → **718/718 green** (καμία regression). Το
route SAAS-gated (404 όταν SAAS_MODE off) + serializer/helper pure/additive + κανένας external
importer των αλλαγών από feature code ⇒ `SAAS_MODE` off = **zero effect** στο self-hosted app·
κανένας Docker rebuild (route 404 στο running container με SAAS_MODE off — ο νέος κώδικας δεν
εκτελείται· type-check καλύπτει το compile)· καμία νέα εξάρτηση· κανένα feature route/data-db/
User-path αγγίχτηκε. Άγγιξα μόνο δικά μου SAAS αρχεία (foreign `.claude/launch.json` άθικτο).

**## Needs Achilleas** (invitations UI):
- Χρειάζεται user-facing workspace-settings «Invitations» section (owner/admin) που καλεί
  `GET /api/saas/invites` → λίστα με inviter/accepter names + resend/revoke controls· το read API
  επιστρέφει πλέον inviterEmail/inviterName + accepterEmail/accepterName → πλήρως render-able.

**Next task:** increment 27 — είτε (α) user-facing workspace-settings UI panels που consume-άρουν
τα έτοιμα read APIs (`/api/saas/audit` + `/api/saas/invites` + `/api/saas/members` + `/api/saas/
usage` + `/api/saas/billing`) — Activity/Invitations/Members/Billing tabs (UI-only, όλα τα APIs
έτοιμα), είτε (β) `sendViaSmtp` via nodemailer (μετά provider decision Achilleas· ξεκλειδώνει
reset/verify/invite delivery σε production), είτε (γ) dedicated invite-resend endpoint (re-mint +
email σε ένα βήμα, αντί POST στο members route).

## 2026-07-02 (increment 27 — generic MAIL_WEBHOOK_URL email provider, dependency-free)
**Built:** ξεκλείδωσα πραγματικό email delivery χωρίς νέα εξάρτηση. Ο mailer είχε μόνο ΕΝΑ
wired channel (Resend) + έναν SMTP stub που θέλει nodemailer (Needs-Achilleas, deferred). Οι
reset/verify/invite flows επομένως δεν παρέδιδαν σε self-hosters που δεν θέλουν managed provider
— έμεναν στο dev-token echo. Πρόσθεσα generic **`MAIL_WEBHOOK_URL`** provider: POST του μηνύματος
ως JSON σε endpoint (Zapier/n8n/self-hosted relay), ακριβώς ό,τι πρότεινε το TODO §3 («email μέσω
generic webhook»). Dependency-free (fetch, σαν το Resend path), no vendor lock-in, ταιριάζει με το
self-hosted ethos. ΟΛΟ additive, σε δικό μου SAAS αρχείο (`lib/tenancy/mailer.ts`):
- `MailProvider` union += `'webhook'` (θέση: resend > webhook > smtp > none).
- `resolveProvider` += `MAIL_WEBHOOK_URL` branch (precedence: resend πρώτο, μετά webhook, μετά
  smtp-intent, μετά none). Pure, env-injectable.
- `mailerCanDeliver` → true πλέον και για webhook (όχι μόνο resend) → single source of truth: οι
  reset/verify/invite routes **σταματούν** το dev-token echo όταν υπάρχει webhook (σωστό: υπάρχει
  πραγματικό channel).
- Νέοι PURE helpers `mailWebhookUrl(env)` / `mailWebhookToken(env)` (trim, empty όταν unset).
- `sendViaWebhook(msg,url,token)` — network-touching, never-throws, 2xx = delivered, optional
  `Authorization: Bearer <MAIL_WEBHOOK_TOKEN>`· body `{from,to,subject,html,text}` (text fallback
  = htmlToText). `sendEmail` απέκτησε το webhook branch (μετά resend, πριν smtp).
- Header doc comment ενημερώθηκε (webhook = WIRED· «prefer MAIL_WEBHOOK_URL until SMTP wired»).
- `mailer.test.ts` — resolveProvider precedence (resend>webhook>smtp), mailerCanDeliver webhook=true,
  + νέο describe για mailWebhookUrl/Token (trim + empty). Δεν testάρω network (ίδιο pattern με το
  υπάρχον: sendViaResend δεν έχει network test· μόνο pure helpers).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run mailer.test.ts` → **16/16 green**
(10 προϋπάρχοντα + 6 νέα)· full suite `npx vitest run` → **738/738 green** (καμία regression).
Καμία νέα εξάρτηση (μηδέν package.json/lock αλλαγή). Ο mailer καλείται ΜΟΝΟ από SAAS routes (404
όταν SAAS_MODE off) → `SAAS_MODE` off = **zero effect** στο self-hosted app· default env (χωρίς
MAIL_WEBHOOK_URL) → `resolveProvider` επιστρέφει ό,τι και πριν → byte-for-byte ίδια συμπεριφορά.
Κανένας Docker rebuild (καμία runtime αλλαγή στο default config path· type-check καλύπτει το
compile). Άγγιξα μόνο δικά μου SAAS αρχεία (foreign `.claude/launch.json` άθικτο).

**Next task:** increment 28 — είτε (α) `sendViaSmtp` via nodemailer (τώρα λιγότερο επείγον: το
webhook καλύπτει τους self-hosters χωρίς εξάρτηση· μένει για όποιον θέλει άμεσο SMTP)· είτε (β)
user-facing workspace-settings UI panels που consume-άρουν τα έτοιμα read APIs (Activity/Invitations/
Members/Billing — UI-only)· είτε (γ) resend-webhook delivery retry/backoff στο sendEmail (best-effort
σήμερα: ένα transient 5xx = undelivered χωρίς retry).

## 2026-07-03 (increment 28 — workspace self-service: read + rename)
**Built:** το workspace-level read/rename surface — ώσπου τώρα υπήρχαν read APIs για members/
invites/billing/usage/audit αλλά **κανένα για το ίδιο το workspace** (δεν μπορούσες να δεις τα
στοιχεία του ή να το μετονομάσεις). Κλείνει το «General» tab ενός workspace-settings panel. ΟΛΟ
SAAS-gated, additive, νέα αρχεία μόνο (κανένα existing file δεν αγγίχτηκε):
- `lib/tenancy/workspace.ts` (νέο) — **PURE** helpers (μηδέν imports/DB/env): `MAX_WORKSPACE_NAME`
  (80), `sanitizeWorkspaceName` (trim + collapse internal whitespace + cap· non-string→''),
  `workspaceNameError` (empty→required, αλλιώς null), **`workspaceView(tenant, role, memberCount)`**
  client-safe projection (tenantId/slug/name/plan/status/tier/customDomain/role/memberCount/
  createdAt). **By construction ΠΟΤΕ billingCustomerId/SubscriptionId** — μόνο whitelisted πεδία·
  null-safe createdAt (Date ή ISO-string), member count clamped ≥0.
- `app/api/saas/workspace/route.ts` (νέο, nodejs + force-dynamic): **GET** `[?tenant]` → workspace
  details + active member count (any active member, `resolveWorkspaceSession(slug,false)`). **PATCH**
  `{name, tenant?}` → rename display name (owner/admin, `resolveWorkspaceSession(slug,true)`)·
  sanitize + validate· **no-op όταν name αμετάβλητο** (κανένα audit row)· αλλιώς `Tenant.updateOne`
  + `recordAudit('workspace.updated', meta {field,from,to})` (το action υπήρχε ήδη στο
  AUDIT_ACTIONS). **Slug/dbName immutable** (routing keys — rename θα έσπαγε subdomain routing +
  orphan-άριζε τη data db)· customDomain/plan/status managed από τα δικά τους flows.
- `lib/tenancy/workspace.test.ts` (νέο) — 13 PURE tests (sanitize trim/collapse/empty/non-string/
  cap-80, nameError empty-vs-nonempty, workspaceView exact-key-set + **no billing-id leak** +
  ISO-string/null/garbage createdAt + missing-field fallbacks + member-count clamp).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run workspace.test.ts` → **13/13
green**· full suite `npx vitest run` → **759/759 green** (καμία regression). Το route SAAS-gated
(404 όταν SAAS_MODE off) + οι helpers pure/additive + κανένας external importer από feature code
⇒ `SAAS_MODE` off = **zero effect** στο self-hosted app· κανένας Docker rebuild (route 404 στο
running container με SAAS_MODE off — ο νέος κώδικας δεν εκτελείται· type-check καλύπτει το compile)·
καμία νέα εξάρτηση· κανένα feature route/data-db/User-path αγγίχτηκε. Άγγιξα μόνο δικά μου νέα SAAS
αρχεία (foreign `.claude/launch.json`/`MOBILE_PARITY.md`/`PROGRESS.md` άθικτα).

**## Needs Achilleas** (workspace settings UI):
- Χρειάζεται user-facing workspace-settings «General» section που καλεί `GET /api/saas/workspace`
  → δείχνει name/plan/status/tier/member-count + rename input (PATCH). UI-only· το read+write API
  είναι έτοιμο. Slug/custom-domain αλλαγές = ξεχωριστά flows (routing/DNS), όχι εδώ.

**Next task:** increment 29 — είτε (α) user-facing workspace-settings UI panels που consume-άρουν τα
έτοιμα read APIs (General/Members/Invitations/Activity/Billing — UI-only, όλα τα APIs έτοιμα), είτε
(β) `sendViaSmtp` via nodemailer (μετά provider decision Achilleas), είτε (γ) workspace delete
scaffold (soft `status:'canceled'`· η πραγματική drop της tenant db = destructive → Needs-Achilleas,
όχι από routine).

---

## 2026-07-03 (increment 29 — workspace soft-cancel: owner-only DELETE)
**Built:** επέλεξα το (γ) — soft-cancel του workspace, το φυσικό συμπλήρωμα του read/rename του
increment 28 (κλείνει το «danger zone» ενός workspace-settings panel). Backend-only, additive, ΟΛΟ
σε δικά μου SAAS-gated αρχεία· καμία UI, καμία destructive DB πράξη:
- `lib/tenancy/audit.ts` — +1 auditable action `workspace.canceled` στο `AUDIT_ACTIONS` (μόνη
  αλλαγή· redaction/recorder αμετάβλητα).
- `lib/tenancy/workspace.ts` — νέος **PURE** guard `canCancelWorkspace(role)` = **owner-only**
  (αυστηρότερο από το owner/admin του rename: το cancel μπλοκάρει πρόσβαση για όλους + είναι
  billing-adjacent). Admin/member/unknown/empty → false.
- `app/api/saas/workspace/route.ts` — νέος **DELETE** `[?tenant=<slug>]` handler:
  `resolveWorkspaceSession(slug,false)` (any active member) → **owner-only** gate μέσω
  `canCancelWorkspace` (403 αλλιώς· ο `requireManage` flag του resolver φτάνει μόνο owner/admin,
  γι' αυτό resolve-άρω χαλαρά + gate-άρω owner εδώ). **Idempotent**: ήδη `canceled` → current view,
  κανένα audit row. Αλλιώς `Tenant.updateOne {$set:{status:'canceled'}}` +
  `recordAudit('workspace.canceled', meta {field:'status', from, to:'canceled'})`. **Slug/dbName/data-db
  ΑΘΙΚΤΑ** — το status:'canceled' μπλοκάρει πρόσβαση (per Tenant model) + είναι reversible· η
  πραγματική drop της tenant db = ξεχωριστό manual flow (Needs-Achilleas), ΠΟΤΕ από routine.
- `lib/tenancy/workspace.test.ts` — +3 PURE tests για `canCancelWorkspace` (owner-yes,
  admin/member-no, unknown/empty-no).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run workspace.test.ts` → **16/16 green**
(13 + 3 νέα)· full suite `npx vitest run` → **762/762 green** (759 + 3, καμία regression). Ο DELETE
είναι SAAS-gated (404 όταν SAAS_MODE off) + `canCancelWorkspace` pure· κανένας external importer από
feature code ⇒ `SAAS_MODE` off = **zero effect** στο self-hosted app. Κανένας Docker rebuild (route
404 στο running container με SAAS_MODE off — ο νέος κώδικας δεν εκτελείται· type-check+tests καλύπτουν
compile+logic)· καμία νέα εξάρτηση· κανένα feature route/data-db/User-path αγγίχτηκε. Άγγιξα μόνο δικά
μου SAAS αρχεία (foreign `.claude/launch.json` + apps/mobile edits άθικτα).

**## Needs Achilleas** (workspace lifecycle):
- **Hard-delete / GDPR drop**: το πραγματικό drop της tenant data db (μετά cancel) είναι destructive
  → πρέπει να το κάνει ο Achilleas χειροκίνητα ή ξεχωριστό flow με ρητό confirm, όχι routine.
- **Reactivation path**: αν ένας canceled workspace πρέπει να ξαναανοίξει (`status:'active'`) — μικρό
  owner-only PATCH/POST, εύκολο να προστεθεί όταν ζητηθεί.
- **Access enforcement**: επιβεβαίωσε ότι το `status:'canceled'`/`'suspended'` όντως μπλοκάρει τα
  workspace/feature routes (σήμερα το `resolveWorkspaceSession`/`accountTenants` δεν φιλτράρει tenant
  status — enforcement layer = επόμενο increment υποψήφιο).

**Next task:** increment 30 — είτε (α) reactivate route (owner-only, `canceled`→`active`), είτε (β)
tenant-status access enforcement (canceled/suspended → block στο `resolveWorkspaceSession`), είτε (γ)
user-facing workspace-settings UI panels (όλα τα read/write APIs έτοιμα).

## 2026-07-03 (increment 33 — record billing.checkout_started στο checkout route)
**Built:** επέλεξα το (γ) — έκλεισα το τελευταίο κενό στο billing-event audit trail. Το verb
`billing.checkout_started` υπήρχε ΗΔΗ στο `AUDIT_ACTIONS` (placeholder) αλλά **κανένα route δεν
το έγραφε**: το increment 32 κατέγραψε τις billing-driven status αλλαγές στο webhook (η «άλλη
άκρη»), όμως η **έναρξη** ενός checkout δεν αφηνόταν πουθενά. Έτσι ένα «Activity» panel δεν θα
έδειχνε ποτέ ότι ένας owner/admin ξεκίνησε αναβάθμιση, ούτε θα μπορούσε να correlate-άρει το
started-checkout με το επακόλουθο webhook event. ΟΛΟ SAAS-gated, additive, σε δικά μου SAAS αρχεία:
- `lib/billing/checkoutAudit.ts` (νέο) — **PURE** `checkoutAuditMeta(plan, checkoutId?)` (μηδέν
  imports/DB/env): whitelist ΜΟΝΟ `plan` + (optional) `checkoutId` (Stripe `cs_...` correlation
  handle, όχι credential). **ΠΟΤΕ** το hosted checkout URL / customer email / Stripe key. Trim του
  id· blank/whitespace/non-string id → dropped (κανένα `checkoutId:""`).
- `app/api/saas/billing/checkout/route.ts` (additive edit): μετά το `result.ok`, `recordAudit(
  auditCtx(session.ctx.tenantId), {action:'billing.checkout_started', actor: session.account.sub,
  target: session.tenant.slug, meta: checkoutAuditMeta(plan, result.data.id)})`. Best-effort
  (recordAudit swallows-errors + no-op για default tenant → ΠΟΤΕ δεν επηρεάζει το response).
  Καταγράφεται **ΜΕΤΑ** το success ώστε failed/unconfigured attempts (502/503) να μη γεννούν
  παραπλανητικό «checkout started» row.
- `lib/billing/checkoutAudit.test.ts` (νέο) — 6 PURE tests (plan-only χωρίς/με null/undefined id,
  real id, trim, blank/whitespace-drop, non-string fail-safe, exact-key-set = κανένα leak).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run checkoutAudit.test.ts` → **6/6
green**· full suite `npx vitest run` → **880/880 green** (καμία regression). Το checkout route
είναι SAAS-gated (404 όταν SAAS_MODE off) + ο mapper pure + κανένας external importer από feature
code ⇒ `SAAS_MODE` off = **zero effect** στο self-hosted app· κανένας Docker rebuild (ο νέος
κώδικας δεν εκτελείται στο default path — μόνο audit πάνω από το υπάρχον success path· type-check+
tests καλύπτουν compile+logic)· καμία νέα εξάρτηση· κανένα feature route/data-db/User-path
αγγίχτηκε. Άγγιξα μόνο δικά μου SAAS αρχεία (foreign `.claude/launch.json` + apps/mobile edits άθικτα).

**Next task:** increment 34 — είτε (α) user-facing workspace-settings UI panels που consume-άρουν τα
έτοιμα read/write APIs (General/Members/Invitations/Activity/Billing + cancel/reactivate — όλα
έτοιμα, UI-only), είτε (β) `sendViaSmtp` via nodemailer (μετά provider decision Achilleas· το webhook
mailer καλύπτει ήδη dependency-free delivery), είτε (γ) `billing.portal_opened` audit στο portal
route (συμπληρώνει το checkout_started για πλήρες self-service billing audit).

## 2026-07-03 (increment 34 — record billing.portal_opened στο portal route)
**Built:** επέλεξα το (γ) — έκλεισα το τελευταίο κενό στο self-service billing audit trail. Το
increment 33 κατέγραψε το `billing.checkout_started` (έναρξη αναβάθμισης)· έλειπε το άλλο
self-service billing entry point, το **billing portal** (όπου owner/admin διαχειρίζεται/ακυρώνει
συνδρομή + payment details). Χωρίς αυτό, ένα «Activity» panel δεν θα έδειχνε ποτέ ότι κάποιος
άνοιξε το portal, ούτε θα μπορούσε να correlate-άρει το portal-open με το επακόλουθο
subscription-change webhook. ΟΛΟ SAAS-gated, additive, σε δικά μου SAAS αρχεία:
- `lib/tenancy/audit.ts` — +1 auditable verb `billing.portal_opened` στο `AUDIT_ACTIONS` (μόνη
  αλλαγή· redaction/recorder αμετάβλητα), grouped δίπλα στο `billing.checkout_started`.
- `lib/billing/portalAudit.ts` (νέο) — **PURE** `portalAuditMeta(plan?, portalId?)` (μηδέν
  imports/DB/env): whitelist ΜΟΝΟ το current `plan` (context: ποιος άνοιξε το portal, σε ποιο
  plan) + (optional) `portalId` (Stripe `bps_...` correlation handle, όχι credential). **ΠΟΤΕ** το
  portal URL / Stripe customer id / key. Trim + drop blank/whitespace/non-string και στα δύο
  πεδία (κανένα `plan:""`/`portalId:""`).
- `app/api/saas/billing/portal/route.ts` (additive edit): μετά το `result.ok`, `recordAudit(
  auditCtx(session.ctx.tenantId), {action:'billing.portal_opened', actor: session.account.sub,
  target: session.tenant.slug, meta: portalAuditMeta(session.tenant.plan, result.data.id)})`.
  Best-effort (recordAudit swallows-errors + no-op για default tenant → ΠΟΤΕ επηρεάζει το
  response). Καταγράφεται **ΜΕΤΑ** το success ώστε failed/unconfigured/no-customer attempts
  (502/503/409) να μη γεννούν παραπλανητικό «portal opened» row.
- `lib/billing/portalAudit.test.ts` (νέο) — 6 PURE tests (plan-only χωρίς/με null/undefined id,
  real id, trim plan+id, blank/whitespace-drop και στα δύο, non-string fail-safe, exact-key-set =
  κανένα leak).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run portalAudit.test.ts` → **6/6
green**· full suite `npx vitest run` → **902/902 green** (καμία regression). Το portal route είναι
SAAS-gated (404 όταν SAAS_MODE off) + ο mapper pure + κανένας external importer από feature code ⇒
`SAAS_MODE` off = **zero effect** στο self-hosted app· κανένας Docker rebuild (ο νέος κώδικας δεν
εκτελείται στο default path — μόνο audit πάνω από το υπάρχον success path· type-check+tests
καλύπτουν compile+logic)· καμία νέα εξάρτηση· κανένα feature route/data-db/User-path αγγίχτηκε.
Άγγιξα μόνο δικά μου SAAS αρχεία (foreign `.claude/launch.json` + apps/mobile edits άθικτα).

**Next task:** increment 35 — είτε (α) user-facing workspace-settings UI panels που consume-άρουν τα
έτοιμα read/write APIs (General/Members/Invitations/Activity/Billing + checkout/portal/cancel/
reactivate — όλα τα APIs έτοιμα, UI-only), είτε (β) `sendViaSmtp` via nodemailer (μετά provider
decision Achilleas· το webhook mailer καλύπτει ήδη dependency-free delivery), είτε (γ) tenant-status
access enforcement (canceled/suspended → block στο `resolveWorkspaceSession`/`accountTenants`, ώστε
canceled workspaces να μη σερβίρονται).

## 2026-07-03 (increment 35 — BYO-key AI policy: unmetered own-key tenants)
**Built:** το TODO §11 «BYO-key option» (tenant βάζει δικό του Anthropic key = μηδέν AI
κόστος για μας). Ώσπου τώρα το BYO-key ήταν μόνο σχόλιο (`plans.ts`: `aiCallsPerMonth:null
// unlimited / BYO-key`) χωρίς μηχανισμό: τίποτα δεν σήμαινε «αυτός ο tenant φέρνει δικό του
key» ούτε επηρέαζε το metering. Πρόσθεσα το **policy layer** (τον flag + τον κανόνα «BYO ⇒
δεν metrούμε ⇒ unlimited AI»), ΧΩΡΙΣ αποθήκευση του ίδιου του secret (encrypted key storage
= ξεχωριστό, TODO §14 / Needs-Achilleas). ΟΛΟ additive, backward-compatible, σε δικά μου
SAAS αρχεία:
- `models/Tenant.ts` (additive field) — **`aiByoKey: Boolean, default false`** (control-plane
  FLAG, ΟΧΙ το secret). Default false → μηδέν επίδραση σε υπάρχοντες tenants· ο self-hosted
  default ΠΟΤΕ δεν φτιάχνει Tenant docs → zero effect.
- `lib/tenancy/context.ts` (additive) — `TenantContext` απέκτησε **optional `byoKey?: boolean`**
  (optional ώστε legacy/synthetic ctxs + routing-only callers + τα υπάρχοντα test literals να
  μη σπάσουν — absent ⇒ platform key + normal metering). `toContext` το σετάρει από
  `Boolean(t.aiByoKey)`· `DEFAULT_TENANT.byoKey=false` (self-hosted metering off ούτως ή άλλως).
- `lib/billing/aiKeyPolicy.ts` (νέο, **PURE** — μόνο ένα `import type QuotaStatus`, erased at
  runtime· μηδέν DB/Stripe/secret): `AiKeyMode='platform'|'byo'`, `isByoKey(flag)` (strict
  `===true`, undefined/null/truthy-non-true → false), `aiKeyMode(flag)`, **`meterAiUsage(flag)`**
  (BYO → false = δεν metrούμε· zero platform cost), `unmeteredAiQuota(used?)` (canonical
  unlimited+allowed status, ίδιο shape με τα non-metered branches του usage.ts).
- `lib/billing/usage.ts` (additive edit, δικό μου αρχείο) — το BYO gate μπήκε **ΜΟΝΟ στο AI
  path** (το storage μένει metered για BYO — φέρνουν key, όχι δίσκο): `checkAiQuota` →
  `isByoKey(ctx.byoKey)` πριν το ledger read ⇒ `unmeteredAiQuota()`· `recordAiCall` →
  `!meterAiUsage(ctx.byoKey)` ⇒ no-op return 0. Το non-metered inline literal του `checkAiQuota`
  αντικαταστάθηκε με `unmeteredAiQuota()` (DRY, byte-identical). **Backward-compatible**: για
  υπάρχοντες metered tenants `byoKey` undefined → `meterAiUsage`=true → αμετάβλητο· default
  tenant / SAAS off → `isMetered` false → αμετάβλητο.
- `lib/billing/aiKeyPolicy.test.ts` (νέο) — 10 PURE tests (isByoKey strict-true/false/null/
  undefined + truthy-non-true fail-safe· aiKeyMode· meterAiUsage BYO-vs-platform· unmeteredAiQuota
  shape + used-clamp + no-cap-regardless-of-used).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run aiKeyPolicy.test.ts
usage.test.ts` → **19/19 green**· full suite `npx vitest run` → **928/928 green** (καμία
regression). Η policy consume-άρεται μόνο από το metering path (usage.ts), που δεν είναι ακόμα
wired σε κανένα feature/AI route → **zero runtime effect**· `SAAS_MODE` off / default tenant →
το byoKey branch ΠΟΤΕ δεν τρέχει (isDefault short-circuit + default false). Κανένας Docker
rebuild (unwired scaffold· type-check+tests καλύπτουν compile+logic)· καμία νέα εξάρτηση· κανένα
feature route/data-db/User-path/bearer-path αγγίχτηκε. Άγγιξα μόνο δικά μου SAAS αρχεία (foreign
`.claude/launch.json` + apps/mobile edits άθικτα).

**## Needs Achilleas** (BYO-key):
- **Encrypted key storage + entry point**: το `aiByoKey` είναι μόνο ο flag. Χρειάζεται (α)
  encrypted-at-rest αποθήκευση του πραγματικού tenant AI key (TODO §14· per-tenant document key
  ή KMS — απόφαση Achilleas), (β) resolver «ποιο key για αυτό το AI call» (tenant key αν BYO,
  αλλιώς platform), (γ) settings UI + route για να το βάλει/rotate/clear ο owner, (δ) validation
  του key πριν set `aiByoKey:true`. Καμία από αυτές δεν χειρίζεται secret χωρίς την crypto απόφαση.

**Next task:** increment 36 — είτε (α) BYO-key resolver+storage scaffold μόλις οριστεί η crypto
προσέγγιση (Needs-Achilleas), είτε (β) usage ledger tokens+cost (TODO §11: το Usage μετρά μόνο
`aiCalls` count· λείπουν tokens/estimated-cost πεδία — additive Usage fields + record signature),
είτε (γ) user-facing workspace-settings UI panels που consume-άρουν τα έτοιμα read/write APIs
(General/Members/Invitations/Activity/Billing — όλα έτοιμα, UI-only).

## 2026-07-03 (increment 36 — usage ledger tokens + estimated cost, TODO §11)
**Built:** επέλεξα το (β) — το Usage ledger μετρούσε ΜΟΝΟ `aiCalls` count (plan quotas ανά
VOLUME), αλλά το πραγματικό platform spend το οδηγούν τα **tokens**. Πρόσθεσα token + estimated-
cost accounting στο ledger, ΟΛΟ additive + backward-compatible, σε δικά μου SAAS αρχεία:
- `models/Usage.ts` (additive fields) — **`aiInputTokens` / `aiOutputTokens`** (running token
  totals ανά μήνα, monotonic όπως το aiCalls) + **`aiCostMicros`** (running estimated AI spend
  σε currency **micros** = εκατομμυριοστά μιας νομισματικής μονάδας, integer → μηδέν float drift).
  Όλα `default 0` → υπάρχοντα Usage docs αμετάβλητα (Mongoose default fill on read/write).
- `lib/billing/aiCost.ts` (νέο, **PURE** — μηδέν imports/DB/env): `AiUsageDetail` (όλα optional
  ώστε ο απλός caller να περνά `{}` = ένα call, no token data), `normalizeAiUsage(detail)` (κάθε
  πεδίο → non-negative integer, `calls` default 1 αλλά explicit `0` μένει 0· NaN/negative/float/
  garbage → safe), `AiRate` (micros ανά 1M tokens), `DEFAULT_AI_RATE` (**PLACEHOLDER** ~€3/1M in,
  ~€15/1M out — Needs-Achilleas για πραγματικό pricing), `estimateCostMicros(in,out,rate?)`
  (floored integer, clamps garbage → 0).
- `lib/billing/usage.ts` (additive edit, δικό μου) — νέο **`recordAiUsage(ctx, detail, at)`** που
  `$inc` atomic ΚΑΙ τα τέσσερα (calls+in+out+cost) upsert· `recordAiCall(ctx, n, at)` έγινε **thin
  wrapper** πάνω του (`{calls:n}`) → ίδιο return (new aiCalls total), ίδιο gate (BYO-key / default
  tenant / SAAS off = no-op 0), ίδια «n===0 = true no-op» συμπεριφορά (empty-detail skip). Το
  `UsageSnapshot` + `currentUsage` επεκτάθηκαν με τα 3 νέα πεδία (zeroed helper για off-path).
- `app/api/saas/usage/route.ts` (additive, δικό μου SAAS route) — το read surface εκθέτει πλέον
  `aiInputTokens/aiOutputTokens/aiCostMicros` δίπλα στο `aiCalls`.
- `lib/billing/aiCost.test.ts` (νέο) — 10 PURE tests (normalize defaults/passthrough/explicit-0/
  floor+clamp/NaN-fail-safe· estimate zero/rate-math/default-rate/floor/garbage-clamp).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run aiCost.test.ts usage.test.ts` →
**19/19 green**· full suite `npx vitest run` → **983/983 green** (καμία regression, +10 νέα).
External importers των `billing/usage`/`recordAiUsage`/`billing/aiCost` από feature code →
**κανένας** (grep) — το metering path δεν είναι wired σε κανένα AI/feature route ακόμα· το usage
route SAAS-gated (404 όταν off). ⇒ `SAAS_MODE` off / default tenant = **zero effect** (isMetered
false short-circuit· τα νέα fields default 0). Κανένας Docker rebuild (unwired scaffold·
type-check+tests καλύπτουν compile+logic)· καμία νέα εξάρτηση· κανένα feature route/data-db/
User-path/bearer-path αγγίχτηκε. Άγγιξα μόνο δικά μου SAAS αρχεία (foreign `.claude/launch.json`
+ apps/mobile edits άθικτα).

**## Needs Achilleas** (token/cost metering):
- **Πραγματικό AI pricing**: το `DEFAULT_AI_RATE` (~€3/1M in, ~€15/1M out) είναι placeholder. Όταν
  κλειδώσει το provider + το model, όρισε τον σωστό `AiRate` (ιδανικά per-model, από env/config).
- **Token wiring στα AI call sites**: το `recordAiUsage(ctx, {inputTokens, outputTokens, costMicros})`
  θέλει να καλείται μετά από κάθε AI op με τα πραγματικά token counts (τα Anthropic responses έχουν
  `usage.input_tokens/output_tokens`). Αγγίζει `api/v1/*` / AI call sites (feature territory) → ρητή
  άδεια ή feature-builder routine (ίδιο ανοιχτό με το enforcement wiring).

**Next task:** increment 37 — είτε (α) surface tokens/cost στο billing summary (`billingSummary.ts`)
+ ένα «cost this month» read helper, είτε (β) BYO-key resolver+storage scaffold μόλις οριστεί crypto
(Needs-Achilleas), είτε (γ) user-facing workspace-settings UI panels (όλα τα APIs έτοιμα, UI-only).

## 2026-07-03 (increment 37 — cost-this-month read helper + usage route cost block, TODO §11)
**Built:** επέλεξα το (α) — το increment 36 πρόσθεσε token+cost accounting στο ledger (micros),
αλλά το read surface έβγαζε μόνο raw `aiCostMicros` (integer micros, ακατάλληλο για UI). Πρόσθεσα
PURE presentation layer + το wiring στο usage route, ΟΛΟ additive + backward-compatible, σε δικά
μου SAAS αρχεία:
- `lib/billing/costSummary.ts` (νέο, **PURE** — μηδέν imports/DB/env/Stripe): `microsToUnits(micros)`
  (micros → whole currency units, garbage/negative → 0), `formatMicros(micros, symbol='€')`
  (2-decimal label «€1.23»· internal dashboard label, ΟΧΙ locale-aware money· garbage → «€0.00»),
  `buildCostSummary(input, symbol?)` → **«cost this month» roll-up** (period + aiCalls +
  input/output/**totalTokens** + costMicros + **costUnits** + **costFormatted**). Κάθε numeric πεδίο
  coerced σε non-negative integer (local `nonNegInt`) → partial/garbage snapshot ΠΟΤΕ δεν παράγει
  NaN/negative στο read surface.
- `app/api/saas/usage/route.ts` (additive, δικό μου SAAS route) — το response απέκτησε **`cost`
  block** (`buildCostSummary` πάνω στο ήδη-φερμένο `currentUsage` snapshot) δίπλα στα υπάρχοντα
  `usage`/`quotas`. Το route είναι SAAS-gated (404 όταν off)· gate/session/membership/tenant-scope
  αμετάβλητα.
- `lib/billing/costSummary.test.ts` (νέο) — 8 PURE tests (microsToUnits convert/zero/garbage·
  formatMicros default-€/custom-symbol/clamp· buildCostSummary roll-up/period-passthrough+custom
  symbol/garbage-coerce).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run costSummary.test.ts` → **8/8
green**· full suite `npx vitest run` → **1022/1022 green** (καμία regression, +8 νέα). Ο cost
summary είναι PURE presentation πάνω από το ledger· καταναλώνεται μόνο από το SAAS-gated usage route
(404 όταν off)· κανένας external importer από feature code. ⇒ `SAAS_MODE` off / default tenant =
**zero effect** (το usage snapshot είναι ήδη zeroed off-path· η format math απλώς παρουσιάζει
μηδενικά). Κανένας Docker rebuild (νέο PURE module + additive JSON field σε gated route·
type-check+tests καλύπτουν compile+logic)· καμία νέα εξάρτηση· κανένα feature route/data-db/
User-path/bearer-path αγγίχτηκε. Άγγιξα μόνο δικά μου SAAS αρχεία (foreign `.claude/launch.json` +
apps/mobile edits άθικτα).

**Next task:** increment 38 — είτε (α) BYO-key resolver+storage scaffold μόλις οριστεί η crypto
προσέγγιση (Needs-Achilleas· §14), είτε (β) real AI pricing wiring στο `DEFAULT_AI_RATE`
(Needs-Achilleas· provider+model lock), είτε (γ) user-facing workspace-settings UI panels που
consume-άρουν τα έτοιμα read/write APIs (General/Members/Invitations/Activity/Billing/Usage — όλα
έτοιμα, UI-only· το usage route δίνει τώρα έτοιμο `cost` block για ένα «AI spend this month» card).

## 2026-07-04 (increment 38 — trial window: bounded end + evaluation, SaaS lifecycle)
**Built:** επέλεξα ένα καθαρό gap που δεν χρειάζεται Achilleas. Το `provision.ts` έφτιαχνε
tenants με `status:'trialing'` αλλά **ΠΟΤΕ** δεν σετάρε `trialEndsAt` → οι δοκιμές ήταν
ουσιαστικά ατέρμονες και κανένα read surface δεν μπορούσε να πει στο UI «N μέρες μένουν» ή
«η δοκιμή έληξε». Πρόσθεσα και τα δύο κομμάτια, ΟΛΟ PURE / additive / backward-compatible, σε
δικά μου SAAS αρχεία:
- `lib/billing/trial.ts` (νέο, **PURE** — μηδέν imports/DB/env/Stripe): `DEFAULT_TRIAL_DAYS=14`
  (**PLACEHOLDER** — trial length = product decision, Needs-Achilleas), `trialEndFrom(start,
  days?, now?)` → Date (compute trial end· garbage start → now, garbage/negative/NaN days →
  default, floor fractional), `evaluateTrial({status, trialEndsAt}, now?)` → **`TrialState`**
  (`onTrial` / `expired` / `daysLeft`): non-trialing → no trial· trialing χωρίς end → open-ended
  (onTrial, daysLeft null)· trialing με future end → onTrial + ceil daysLeft· trialing με
  reached/past end → expired (daysLeft 0). Tolerant σε Date/string/number/null.
- `lib/tenancy/provision.ts` (additive edit, δικό μου SAAS-only αρχείο) — το `Tenant.create`
  σετάρει πλέον **`trialEndsAt: trialEndFrom(new Date())`** ώστε η δοκιμή να λήγει όντως. Τρέχει
  ΜΟΝΟ σε SAAS provisioning (self-hosted app δεν φτιάχνει Tenant docs) → zero effect off-path.
- `lib/billing/billingSummary.ts` (additive edit, δικό μου) — το `BillingSummary` απέκτησε
  **`trial: TrialState`** (derived από status+trialEndsAt μέσω `evaluateTrial`)· `BillingSummaryInput`
  +optional `now?: Date` (default now· tests περνάνε fixed για determinism). Η υπόλοιπη λογική
  αμετάβλητη· το SAAS-gated billing route (404 όταν off) το εκθέτει αυτόματα (spread) — καμία
  αλλαγή στο route.
- `lib/billing/trial.test.ts` (νέο) — 10 PURE tests (trialEndFrom default/explicit/string+number
  start/garbage fallbacks/floor· evaluateTrial non-trialing/open-ended/future-ceil/expired-
  boundary/serialized-end).
- `lib/billing/billingSummary.test.ts` (+1 test) — trial block derivation (active→no-trial,
  future→countdown, past→expired) σε fixed `now`.

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run trial.test.ts
billingSummary.test.ts` → **21/21 green**· full suite `npx vitest run` → **1099/1099 green**
(καμία regression). Ο trial evaluator είναι PURE· καταναλώνεται μόνο από το SAAS-gated billing
summary (404 όταν off) + το SAAS-only provision path. ⇒ `SAAS_MODE` off / default tenant =
**zero effect** (κανένα Tenant doc, το billing route δεν mount-άρει). Κανένας Docker rebuild
(νέο PURE module + additive gated field + SAAS-only provision stamp· type-check+tests καλύπτουν
compile+logic)· καμία νέα εξάρτηση· κανένα feature route/data-db/User-path/bearer-path αγγίχτηκε.
Άγγιξα μόνο δικά μου SAAS αρχεία (foreign `.claude/launch.json` + apps/mobile edits άθικτα).

**## Needs Achilleas** (trial):
- **Πραγματικό trial length**: το `DEFAULT_TRIAL_DAYS=14` είναι placeholder. Όρισε το τελικό
  (π.χ. 7/14/30) — ιδανικά per-plan ή από env/config.
- **Trial-lapse enforcement**: το `evaluateTrial` λέει ΑΝ έληξε αλλά κανείς δεν το επιβάλλει
  ακόμα. Μελλοντικό increment/cron: όταν `expired` → flip status σε `suspended` (dunning) ή block
  access· ήδη υπάρχει το `workspaceStatusError` gate που θα μπλόκαρε suspended workspaces.

**Next task:** increment 39 — είτε (α) trial-lapse job/helper που flip-άρει expired trials σε
suspended (κλείνει τον βρόχο με το status enforcement), είτε (β) BYO-key resolver+storage scaffold
μόλις οριστεί crypto (Needs-Achilleas), είτε (γ) user-facing workspace-settings UI panels (όλα τα
read/write APIs έτοιμα — General/Members/Invitations/Activity/Billing[+trial]/Usage — UI-only).

## 2026-07-05 (increment 39 — trial-lapse decision layer: expired trial → suspended, SaaS lifecycle)
**Built:** επέλεξα το (α) — έκλεισα τον βρόχο του increment 38. Το `evaluateTrial` έλεγε ΑΝ έληξε
μια δοκιμή, αλλά κανείς δεν αποφάσιζε τι γίνεται: ένας trialing tenant με περασμένο `trialEndsAt`
έμενε `trialing` για πάντα με πλήρη πρόσβαση. Πρόσθεσα το **decision core** που λέει «αυτή η δοκιμή
έληξε → πήγαινε σε `suspended`», μια μετάβαση που το υπόλοιπο stack ήδη καταλαβαίνει
(`workspaceStatusError` μπλοκάρει `suspended`, `statusAuditAction` το logάρει ως
`workspace.suspended`, owner το ξεκλειδώνει με billing). ΟΛΟ PURE / additive / backward-compatible,
σε δικά μου SAAS αρχεία:
- `lib/billing/trialLapse.ts` (νέο, **PURE** — μόνο import το PURE `evaluateTrial`, μηδέν DB/env/
  Stripe): `LAPSED_TRIAL_STATUS='suspended'` (σκόπιμα `suspended` όχι `canceled` — recoverable
  dunning hold, ο owner το reactivate-άρει με billing)· `evaluateTrialLapse(input, now?)` →
  **`TrialLapseDecision`** (`shouldLapse`/`nextStatus`/`reason`): non-trialing → ποτέ (already
  converted/suspended/…)· trialing+future/open-ended → όχι (open-ended = active by `evaluateTrial`,
  δεν force-expire-άρεται)· trialing+reached/past → lapse ⇒ `suspended`· `planTrialLapses(rows, now?)`
  → PURE batch planner που επιστρέφει τα ids προς suspend (skip blank id, tolerant σε garbage input),
  για future sweep job· `lapsedTrialFilter(now?)` → Mongo filter (`{status:'trialing',
  trialEndsAt:{$lte:now}}`) ώστε το job να μη φορτώνει ΟΛΟΥΣ τους tenants (open-ended με null end δεν
  ματσάρει `$lte`-a-Date → συμφωνεί με «open-ended ποτέ δεν lapse»).
- `lib/billing/trialLapse.test.ts` (νέο) — 10 PURE tests (evaluate: past→suspend/boundary-at-now/
  future/open-ended/all-non-trialing-statuses/serialized-end· plan: ids-only-filter/skip-blank-id/
  empty+garbage-input· filter shape).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run trialLapse.test.ts` → **10/10
green**· full suite `npx vitest run` → **1172/1172 green** (καμία regression, +10 νέα). Το decision
core είναι PURE· **κανένας external importer** από feature code (η πραγματική μετάβαση = future impure
cron/job που θα φορτώνει candidates μέσω `lapsedTrialFilter` + θα κάνει `$set status` + audit· αυτό
είναι μόνο ο decision πυρήνας του). ⇒ `SAAS_MODE` off / default tenant = **zero effect** (κανένα
Tenant doc, τίποτα καλεί το module). Κανένας Docker rebuild (νέο PURE module, unwired·
type-check+tests καλύπτουν compile+logic)· καμία νέα εξάρτηση· κανένα feature route/data-db/
User-path/bearer-path αγγίχτηκε. Άγγιξα μόνο δικά μου SAAS αρχεία (foreign `.claude/launch.json` +
`.github/workflows` + apps/mobile edits άθικτα).

**## Needs Achilleas** (trial-lapse):
- **Sweep scheduling**: το decision core είναι έτοιμο αλλά κανένας δεν το τρέχει ακόμα. Μελλοντικό
  increment: cron/job που κάθε X ώρες κάνει `Tenant.find(lapsedTrialFilter())` → `evaluateTrialLapse`
  → `$set status:'suspended'` + `recordAudit('workspace.suspended')`. Χρειάζεται απόφαση για τον
  scheduler (node-cron in-process vs external) + αν θα υπάρχει grace/dunning email πριν το suspend.

**Next task:** increment 40 — είτε (α) ο πραγματικός trial-lapse sweep helper (impure: query via
`lapsedTrialFilter` + `$set` + audit, flag-guarded, με fixed-`now` injection για test), είτε (β)
BYO-key resolver+storage scaffold μόλις οριστεί crypto (Needs-Achilleas), είτε (γ) user-facing
workspace-settings UI panels (όλα τα read/write APIs έτοιμα — General/Members/Invitations/Activity/
Billing[+trial]/Usage — UI-only).

---

## 2026-07-05 — DECISIONS FROM ACHILLEAS (interactive session)

Ο Achilleas απάντησε τα ανοιχτά SaaS Needs-Achilleas. Υλοποιήστε τα ως εξής (flag-guarded,
backward-compatible, SAAS_MODE off = zero effect όπως πάντα):

**D4 — Trial-lapse scheduler (RESOLVED).** node-cron **in-process**, sweep **κάθε 6h**:
`Tenant.find(lapsedTrialFilter())` → `evaluateTrialLapse` → `$set status:'suspended'` +
`recordAudit('workspace.suspended')`. ΕΠΙΠΛΕΟΝ: **1 dunning email 3 μέρες πριν** το suspend
(warning «το trial σου λήγει σε 3 μέρες»), idempotent (μην ξαναστείλεις στο ίδιο tenant). Το
in-process επιλέχθηκε γιατί single-deployment (δεν τρέχουμε replicas)· external cron μόνο αν
αργότερα χρειαστεί HA. Χρησιμοποιήστε injected `now` για tests.

**D5 — BYO-key crypto (RESOLVED).** **AES-256-GCM**, encryption key **derived από το `AUTH_SECRET`**
μέσω **scrypt** (node `crypto`, μηδέν νέα dependency). User AI keys → encrypted-at-rest στη Mongo,
decrypt μόνο on-demand στη μνήμη στο AI call. GCM = authenticated (tamper-evident). Ξεμπλοκάρει τον
BYO-key resolver+storage scaffold. (ΣΗΜ: αν αργότερα θέλει key-rotation ανεξάρτητη του AUTH_SECRET,
μετακίνηση σε ξεχωριστό `ENCRYPTION_KEY` env — για τώρα AUTH_SECRET-derived.)

**D6 — reset-request timing side-channel (RESOLVED, spec).** Απόφαση: **constant-time απάντηση** —
το route να μη διαρρέει αν υπάρχει account μέσω timing. Ο τρέχων κώδικας (`reset/request/route.ts:43`)
κάνει early-return `{ ok:true }` ΠΡΙΝ το mint+save+email όταν δεν υπάρχει account → μετρήσιμη διαφορά.
Spec υλοποίησης (χρειάζεται δικά σας timing tests, γι' αυτό δεν το έκανα εγώ ad-hoc):
(α) πάντα `mintResetToken()` (κόστος crypto και στα δύο μονοπάτια)·
(β) όταν ΔΕΝ υπάρχει account, εκτελέστε **comparable dummy work** αντί για fast-return (π.χ. dummy
scrypt/verify comparable με το save cost) ώστε ο συνολικός χρόνος να συγκλίνει· ΜΗΝ στείλετε email σε
μη-εγγεγραμμένη διεύθυνση (self-leak/spam)·
(γ) εναλλακτικά/επιπλέον: **fixed floor delay** σε ΟΛΑ τα responses (target constant, `await sleep(target−elapsed)`)
για να καλυφθεί DB/email variance — απλούστερο, robust, με μικρό latency cost·
(δ) response shape μένει ΑΜΕΤΑΒΛΗΤΟ (πάντα `{ ok:true }`, devToken echo μόνο non-prod).
Dead-until-SaaS (SAAS_MODE off), οπότε χαμηλή προτεραιότητα αλλά κλείστε το πριν το launch.

**D7 — Tenant data-isolation (DEFERRED).** getTenantConnection cache guard (`connection.ts:54`
δέχεται disconnected connection) + v1 data-path tenant-scoping (`withAuth`→`bearerUser` δεν είναι
tenant-scoped) → **αφήνονται για ξεχωριστό design session**. Είναι ολόκληρο το multi-tenancy
data-isolation μοντέλο (per-tenant DB vs shared-DB-with-tenantId + read-vs-write product decision),
όχι mechanical. Μη τα ξεκινήσετε unattended· καταγράψτε open questions και προχωρήστε.

## 2026-07-05 (increment 40 — adopt request-scoped tenant store `current.ts` + tests)
**Το κενό:** untracked `lib/tenancy/current.ts` στο tree — WIP προηγούμενου run που έμεινε
αδέσποτο (μηδέν importers, μηδέν test, ποτέ commit). Ένα αδέσποτο untracked αρχείο στο δικό μου
territory μπερδεύει το collision guard **κάθε** επόμενου run, οπότε το προτεραιοποίησα: adopt +
τεκμηρίωση + tests αντί να κρέμεται. Είναι κι ένα genuinely χρήσιμο primitive — ο **request-scoped
current-tenant store** (AsyncLocalStorage) που λείπει για να ξέρει deeply-nested κώδικας (AI
dispatch στο `lib/ollama.ts`, storage writes) σε ποιον tenant τρέχει **χωρίς** threading
`TenantContext` σε κάθε signature — ακριβώς το prerequisite των «token wiring στα AI call sites»
Needs-Achilleas items (και το `9cb635e` metering wire μπορεί αργότερα να διαβάζει tenant από εδώ).

**Built:**
- `lib/tenancy/current.ts` (adopt, NODE-only — `node:async_hooks`): `withTenant(ctx, fn)` (ambient
  tenant για όλο το async subtree), `currentTenant()` (ambient ή **`DEFAULT_TENANT`** όταν κανείς
  δεν έκανε `withTenant` → **ΟΛΟ** το self-hosted app· never throws/undefined), `hasTenantContext()`.
  OSS parity: μόνο SaaS entrypoints καλούν `withTenant`, άρα self-hosted → πάντα `DEFAULT_TENANT`
  (unmetered/unlimited/zero-DB), byte-for-byte αμετάβλητο, ποτέ δεν αγγίζει το write path.
- `lib/tenancy/current.test.ts` (νέο) — 9 tests: default-όταν-κανένα-context (OSS path), identity
  μέσα στο `withTenant`, restore μετά, return passthrough, nesting (inner override → outer restore),
  carry across async boundaries (await/setTimeout hops), concurrent isolation (overlapping subtrees
  δεν διαρρέουν), error-unwind (throw → store restored, μηδέν leak).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run current.test.ts` → **9/9 green**·
full suite → **1237/1237 green** (86 files, καμία regression). Grep για importers του
`current`/`withTenant`/`currentTenant` από feature code → **κανένας** ⇒ zero runtime wiring,
`SAAS_MODE` off / default tenant = **zero effect**, κανένας Docker rebuild· καμία νέα εξάρτηση·
κανένα feature route/data-db/User-path/bearer-path αγγίχτηκε.

**Collision note:** στο `git add`, concurrent OSS routine έκανε ταυτόχρονο `git add`+commit — τα
`current.ts`+`current.test.ts` παρασύρθηκαν στο commit **`872dd14`** (`test(api): cover cards/[id]…`)
πριν προλάβω `restore --staged`. Το περιεχόμενο είναι σωστό + **ήδη pushed στο origin/main**· η
attribution έπεσε στο OSS commit αντί για δικό μου SAAS commit, αλλά ο κώδικας είναι ασφαλής στο
main. Αυτό το entry το τεκμηριώνει. (Παράλληλα landαρισαν `9cb635e` AI-metering wire + `550f351`
aiMeter tests + `7273bd8` decisions/login refactor — άλλων routines, δεν αγγίχτηκαν.)

**Next task:** increment 41 — είτε (α) trial-lapse sweep helper (impure: `lapsedTrialFilter` +
`$set status:'suspended'` + audit, flag-guarded, fixed-`now` injection), είτε (β) SaaS entrypoint
που κάνει `withTenant(ctx)` ώστε το `9cb635e` metering να διαβάζει τον tenant από `currentTenant()`
αντί για threading (κλείνει τον βρόχο· αγγίζει AI entrypoint = θέλει προσοχή/άδεια), είτε (γ)
user-facing workspace-settings UI panels (read/write APIs έτοιμα).

## 2026-07-05 (increment 41 — trial-lapse SWEEP: warn + suspend, closes D4)
**Built:** το increment 39/40 έδωσε τον PURE decision πυρήνα (`evaluateTrialLapse`,
`planTrialLapses`, `lapsedTrialFilter`)· κανείς όμως δεν τον έτρεχε — ένας trialing tenant με
περασμένο `trialEndsAt` έμενε trialing για πάντα. Υλοποίησα το **actual sweep** που ο Achilleas
υπέγραψε στο **D4** (node-cron in-process/6h, `$set status:'suspended'` + audit + 1 dunning email
3 μέρες πριν, idempotent, injected `now`). ΟΛΟ additive / backward-compatible, σε δικά μου SAAS
αρχεία:
- `models/Tenant.ts` (additive edit, control-plane μου) — νέο **`trialWarnEmailedAt: Date|null`**
  = idempotency stamp της dunning warning (default null). Optional + null-default ⇒ πλήρως
  backward-compatible, γράφεται ΜΟΝΟ από το sweep.
- `lib/billing/trialSweep.ts` (νέο). **PURE** (unit-tested): `WARN_BEFORE_DAYS=3`,
  `shouldWarnTrial(input, now)` (trialing + bounded end + όχι expired + `daysLeft<=3`· open-ended/
  non-trialing/expired → false, δηλ. warn-window ⊥ lapse-instant, ποτέ warn+suspend στο ίδιο run),
  `planTrialWarnings(rows, now)` (ids-only batch planner, skip blank id), `trialWarningFilter(now)`
  (Mongo: `{status:'trialing', trialWarnEmailedAt:null, trialEndsAt:{$gt:now,$lte:now+3d}}` →
  idempotent + narrows scan· open-ended null-end δεν ματσάρει το range), `dunningEmail(name,
  daysLeft)` (body builder, «tomorrow»/«in N days», clamps garbage στο [1,3]). **Impure**
  `runTrialLapseSweep(now?)`: SAAS-gated (off → `swept:false`), (1) WARN μόνο αν `mailerCanDeliver()`
  (self-hoster χωρίς mail → skip· stamp ΜΟΝΟ σε delivered → retry transient failures, ποτέ
  re-warn), owner emails μέσω Membership(owner,active)→Account· (2) LAPSE `lapsedTrialFilter` →
  `updateOne({_id,status:'trialing'},{$set status:suspended})` (race-safe guard) + `recordAudit
  ('workspace.suspended', meta.reason)`. Per-tenant try/catch isolation (μοτίβο `sampleAllTenants`).
- `app/api/saas/trials/sweep/route.ts` (νέο) — `POST` SAAS-gated (404 off) + **CRON_SECRET bearer**
  (fail-closed 500 unset, constant-time compare· ίδιο μοτίβο με `usage/sample`) → `runTrialLapseSweep`.
  On-demand/external trigger· ο in-process 6h cron καλεί τον ίδιο runner.
- `lib/billing/trialSweep.test.ts` (νέο) — 12 PURE tests (shouldWarnTrial window/edge-at-3d/
  beyond/expired/open-ended/non-trialing· planTrialWarnings ids+skip-blank+garbage· filter shape·
  dunningEmail tomorrow/in-N/clamp/blank-name).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run trialSweep.test.ts` → **12/12
green**· full suite `npx vitest run` → **1322/1322 green** (95 files, καμία regression, +12 νέα).
External importers του `runTrialLapseSweep`/`trialSweep` από feature code → **κανένας** (μόνο το
δικό μου CRON route)· το route SAAS-gated (404 off). ⇒ `SAAS_MODE` off / default tenant = **zero
effect** (κανένα Tenant doc, το route δεν mount-άρει, το `trialWarnEmailedAt` απλώς default null).
Κανένας Docker rebuild (νέο PURE module + additive gated route + optional model field·
type-check+tests καλύπτουν compile+logic)· καμία νέα εξάρτηση· κανένα feature route/data-db/
User-path/bearer-path αγγίχτηκε.

**Collision note:** στην αρχή του run το tree είχε foreign uncommitted WIP (per-tenant currency:
`lib/tenancy/currencyBinding.ts` + edits σε `money.ts`/`appSettings.ts`/`storeService.ts` — άλλη
routine). ΔΕΝ τα άγγιξα· landαρισαν καθαρά (committed από την concurrent routine) πριν το δικό μου
commit, οπότε το tree έμεινε καθαρό για staging μόνο των δικών μου αρχείων.

**## Needs Achilleas** (trial-lapse sweep go-live):
- **In-process 6h cron registration**: ο runner + το CRON route είναι έτοιμα, αλλά ο **in-process
  node-cron scheduler** (D4) δεν έχει registration ακόμα — αυτό απαιτεί ένα server bootstrap hook
  (π.χ. `instrumentation.ts`) που αγγίζει shared runtime wiring (rebuild) → χωριστό προσεκτικό
  increment/άδεια. Μέχρι τότε: το sweep τρέχει on-demand μέσω `POST /api/saas/trials/sweep` +
  `CRON_SECRET` (external scheduler).
- **Mail provider** (`RESEND_API_KEY` ή `MAIL_WEBHOOK_URL`): χωρίς αυτό η WARN φάση κάνει skip
  (mailerCanDeliver=false)· τα trials suspend-άρονται κανονικά αλλά ΧΩΡΙΣ προειδοποιητικό email.
- **Trial length** `DEFAULT_TRIAL_DAYS=14` + **WARN_BEFORE_DAYS=3** = placeholders μέχρι final
  product decision.

**Next task:** increment 42 — είτε (α) το in-process 6h cron registration (bootstrap hook, αγγίζει
shared runtime → άδεια/προσοχή), είτε (β) BYO-key AES-256-GCM resolver+storage scaffold (D5
RESOLVED: AUTH_SECRET-derived scrypt key· ξεμπλόκαρε), είτε (γ) reset-request timing side-channel
fix (D6 spec: constant-time response), είτε (δ) user-facing workspace-settings UI panels.

## 2026-07-06 (increment 42 — BYO-key STORAGE + management route, closes D5 wiring)
**Το κενό:** ο D5 codec (`lib/billing/byoKey.ts`, encode/decode/mask πάνω από AES-256-GCM
`secretCrypto`) υπήρχε αλλά είχε **μηδέν importers** — τίποτα δεν persist-άρε το encrypted
`{provider,keyEnc}` envelope, και το `Tenant.aiByoKey` (το flag που διαβάζει το `aiKeyPolicy`
για metering) γραφόταν «ξεχωριστά» (σχόλιο στο model). Ένας tenant δεν είχε τρόπο να βάλει
δικό του AI key. Έκλεισα το storage/management loop, ΟΛΟ additive + SaaS-gated:
- `models/Tenant.ts` (additive edit, control-plane μου) — νέο **`aiKey: {provider, keyEnc}`**
  subdoc (`_id:false`), default `null`. Γράφεται ΜΟΝΟ από τον store, που κρατά το `aiByoKey`
  σε lockstep (true όταν υπάρχει key, false όταν clear). Optional + null-default ⇒ πλήρως
  backward-compatible· self-hosted δεν φτιάχνει Tenant docs → zero effect.
- `lib/tenancy/audit.ts` (additive edit, δικό μου) — 2 νέες audit actions `ai_key.set` /
  `ai_key.cleared` (το audit.test «accepts every declared action» τα καλύπτει auto, καμία
  length assertion → μηδέν breakage).
- `lib/billing/byoKeyStore.ts` (νέο). **PURE** planners (unit-tested): `planAiKeyUpdate(provider,
  rawKey)` → `{$set:{aiKey, aiByoKey:true}}` ή null (bad provider/empty key/no-crypto μέσω
  `encodeAiKey`), `planAiKeyClear()` → `{$set:{aiKey:null, aiByoKey:false}}` — η flag-consistency
  ζει εδώ. **Impure** thin wrappers (SaaS-gated node paths, ο audit-recorder convention):
  `setTenantAiKey` (byoKeyReady guard → 503, `updateOne` → not_found, masked result), 
  `clearTenantAiKey`, `describeTenantAiKey` (masked last-4, ποτέ plaintext), `resolveTenantAiKey`
  (on-demand decrypt για το AI dispatch site — το επόμενο risky increment το consume-άρει).
- `app/api/saas/workspace/ai-key/route.ts` (νέο) — GET (masked status + cryptoReady + providers)
  / PUT `{provider,key}` / DELETE, ΟΛΑ `saasGuard` + `resolveWorkspaceSession(slug, requireManage=
  true)` (owner/admin only, lifecycle-gated) + audit (provider μόνο στο meta, ποτέ το key).
  503 όταν AUTH_SECRET unset, 400 invalid, 404 not-found.
- `lib/billing/byoKeyStore.test.ts` (νέο) — 7 PURE tests: lockstep flag on/off, encrypt-not-
  plaintext, round-trip decode (trim), όλοι οι 5 providers, invalid provider/empty-key/non-
  string → null, no-crypto → null.

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run` → **1464/1464 green** (105
files, +7 νέα, καμία regression). External importers του `byoKeyStore` από feature code →
**κανένας** (μόνο το δικό μου SaaS route)· το route SAAS-gated (404 off). ⇒ `SAAS_MODE` off /
default tenant = **zero effect** (κανένα Tenant doc, το route δεν mount-άρει, `aiKey` default
null). Κανένας Docker rebuild (additive gated route + optional model field + PURE module·
type-check+tests καλύπτουν)· καμία νέα εξάρτηση· κανένα feature route/data-db/User-path/
bearer-path αγγίχτηκε.

**## Needs Achilleas** (BYO-key go-live):
- **AI dispatch consumption**: ο `resolveTenantAiKey` είναι έτοιμος αλλά κανείς δεν τον καλεί
  ακόμα στο AI call site (`lib/ollama.ts` / `aiProviders.ts`). Το wiring αγγίζει shared AI
  runtime → χωριστό προσεκτικό increment/άδεια (ίδιο caveat με το metering wire `9cb635e`).
  Μπορεί να διαβάζει tenant από `currentTenant()` (increment 40) → decode → override provider key.
- **AUTH_SECRET**: χωρίς αυτό η BYO-key storage κάνει 503 (μηδέν crypto)· self-hoster χωρίς mail
  δεν επηρεάζεται (self-hosted δεν χρησιμοποιεί BYO-key path καθόλου).

**Next task:** increment 43 — είτε (α) BYO-key AI-dispatch consumption (`resolveTenantAiKey` στο
AI call site μέσω `currentTenant()`, αγγίζει shared runtime → άδεια/προσοχή), είτε (β) in-process
6h cron registration για τον trial-lapse sweep (bootstrap hook, shared runtime → άδεια), είτε (γ)
user-facing workspace-settings UI panels (όλα τα read/write APIs έτοιμα, incl. τώρα το ai-key).

## 2026-07-06 (increment 43 — GDPR account data-export, opens §15 compliance)
**Το κενό:** ο SaaS layer είχε read/write control-plane APIs (account profile, memberships,
billing, ai-key) αλλά **καμία GDPR data-access/portability έξοδο** — §15 (Legal & compliance)
είναι `blocking για SaaS`, και το §8 ζητά ρητά «Per-tenant … export». Έκλεισα το πρώτο,
ασφαλέστερο κομμάτι: το **account-level** export (Art. 15 access + Art. 20 portability), που
διαβάζει ΜΟΝΟ control-plane δεδομένα (Account profile + Memberships→Tenants), χωρίς per-tenant
DB scoping και χωρίς shared runtime. ΟΛΟ additive + SaaS-gated:
- `lib/tenancy/accountExport.ts` (νέο). **PURE** assembler `buildAccountExport(account,
  memberships, generatedAt)` → σταθερό envelope `{format:'pharos.account-export', version:1,
  generatedAt, notice(GDPR), account{id,email,name,emailVerified,lastLoginAt,createdAt,updatedAt},
  memberships[]}`. Διαβάζει ΜΟΝΟ whitelisted πεδία → **by construction κανένα secret** (password
  Hash/tokens) δεν διαρρέει έστω κι αν μπει κατά λάθος στο input. Memberships χωρίς resolvable
  tenant → skip· dates→ISO ή null· tenantName fallback σε slug. + `accountExportFilename` (safe
  charset, ποτέ κενό stem).
- `app/api/saas/account/export/route.ts` (νέο). GET only, `saasGuard` + `saasAuthGate` (404 off,
  500 χωρίς AUTH_SECRET) + `getCurrentAccount` (401 logged-out). Φορτώνει account +ΟΛΑ τα
  memberships (any status = πλήρες record) + batched Tenant lookup → `buildAccountExport` →
  `Content-Disposition: attachment` JSON, `Cache-Control: no-store`. Δεν αγγίζει τον
  self-hosted User/bearer path ούτε tenant data-db.
- `lib/tenancy/accountExport.test.ts` (νέο) — 8 PURE tests: envelope shape/ISO, no-secret-leak
  (tainted input), membership join, unresolvable-tenant skip, name→slug fallback + missing
  optionals, invalid/blank date→null, filename safety (hex + path-traversal strip).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run accountExport.test.ts` → **8/8
green**· full suite `npx vitest run` → **1503/1503 green** (108 files, +8 νέα, καμία regression).
Το route SAAS-gated (404 off)· ο assembler είναι pure + import-free ⇒ `SAAS_MODE` off / default
tenant = **zero effect**. Κανένας Docker rebuild (additive gated route + PURE module, μηδέν shared
runtime wiring — type-check+tests καλύπτουν)· καμία νέα εξάρτηση· κανένα feature route/data-db/
User-path/bearer-path αγγίχτηκε. Collision guard: staging καθαρό, μόνο τα 3 δικά μου paths.

**## Needs Achilleas** (GDPR export πληρότητα):
- **Per-tenant CONTENT export** (§8): το account export καλύπτει την login identity· το ΠΕΡΙΕΧΟΜΕΝΟ
  ενός workspace (Items/Receipts/…) ζει στην isolated tenant DB και θέλει ξεχωριστό per-workspace
  export endpoint που αγγίζει την per-tenant connection (`useDb(dbName)`) → χωριστό increment.
- **Right-to-erasure** (Art. 17): delete/offboarding lifecycle (soft-delete + grace + db-drop)
  είναι το destructive αντίστοιχο — scaffold-only όταν γίνει, το πραγματικό drop = Needs-Achilleas.

**Next task:** increment 44 — είτε (α) per-tenant content-export scaffold (αγγίζει per-tenant
connection → προσοχή), είτε (β) account/workspace erasure-request lifecycle (soft, reversible
grace· destructive purge deferred), είτε (γ) BYO-key AI-dispatch consumption / in-process 6h cron
(και τα δύο αγγίζουν shared runtime → άδεια), είτε (δ) user-facing workspace-settings UI panels.

## 2026-07-06 (increment 44 — workspace ERASURE lifecycle, opens GDPR Art. 17)
**Το κενό:** το increment 43 έδωσε GDPR **access/portability** (Art. 15/20 account export)· έλειπε
το **right-to-erasure** (Art. 17), που το §15 σημειώνει `blocking για SaaS`. Έκλεισα το πρώτο,
ασφαλέστερο κομμάτι: το **scheduled-deletion lifecycle** (request → grace window → cancel), soft +
πλήρως reversible· ο πραγματικός destructive drop της tenant db μένει **deferred** (manual/gated,
ΠΟΤΕ από routine). ΟΛΟ additive + SaaS-gated, σε δικά μου SAAS αρχεία:
- `models/Tenant.ts` (additive edit, control-plane μου) — 3 νέα markers `erasureRequestedAt`/
  `erasureScheduledAt`(indexed)/`erasureRequestedBy`, όλα default null. **Orthogonal στο `status`**:
  η erasure είναι scheduled purge, ΟΧΙ access flip → ο owner κρατά πρόσβαση στο grace window και
  μπορεί ν' αλλάξει γνώμη, χωρίς prior-status-restoration dance (και χωρίς conflict με το reactivate
  flow). Null-default ⇒ πλήρως backward-compatible· self-hosted δεν φτιάχνει Tenant docs → zero effect.
- `lib/tenancy/audit.ts` (additive edit, δικό μου) — 2 νέες actions `workspace.erasure_requested` /
  `workspace.erasure_canceled` (το audit.test «accepts every declared action» τις καλύπτει auto,
  καμία length assertion → μηδέν breakage).
- `lib/tenancy/erasure.ts` (νέο). **PURE** (unit-tested): `ERASURE_GRACE_DAYS=30` (placeholder),
  `canEraseWorkspace` (owner-only, stricter από owner/admin — mirror του cancel), `erasureScheduledFor`
  (requestedAt+grace, garbage/negative → default, ποτέ purge στο παρελθόν), `graceDaysLeft` (ceil +
  clamp≥0, null χωρίς schedule), `isErasureDue`/`isErasureRequested`, `planErasureRequest(accountId,
  now, graceDays?)` (→ `$set` των 3 markers ή null αν blank id — must be attributable· ΔΕΝ αγγίζει
  status), `planErasureCancel()` (→ null και στα 3), `erasureDueFilter(now)` (`{erasureScheduledAt:
  {$ne:null,$lte:now}}` για το deferred purge job), `erasureView` (client-safe projection + computed
  grace/due). Injected `now`/`graceDays` παντού για deterministic tests.
- `app/api/saas/workspace/erasure/route.ts` (νέο) — GET (erasure state, any active member) / POST
  (schedule, **owner-only**, idempotent) / DELETE (cancel μέσα στο grace, owner-only, idempotent),
  ΟΛΑ `saasGuard` + `resolveWorkspaceSession(slug,false,allowInactive=true)` (ο owner mid-erasure —
  που ίσως έχει και canceled workspace — διαβάζει/ακυρώνει κανονικά) + `canEraseWorkspace` gate +
  audit (scheduledAt/graceDays μόνο στο meta). 403 μη-owner, 400 μη-attributable, 404 off.
- `lib/tenancy/erasure.test.ts` (νέο) — 14 PURE tests (owner-only· scheduledFor default/custom/
  garbage/0· isErasureRequested· graceDaysLeft ceil/clamp/null· isErasureDue boundary· planRequest
  markers-not-status/trim/blank-null· planCancel· dueFilter shape· view populated/empty/due).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run erasure.test.ts audit.test.ts` →
**38/38 green**· full suite `npx vitest run` → **1531/1531 green** (111 files, +14 νέα, καμία
regression). Το route SAAS-gated (404 off)· τα helpers είναι pure + import-free ⇒ `SAAS_MODE` off /
default tenant = **zero effect** (κανένα Tenant doc, το route δεν mount-άρει, τα markers default
null). Κανένας Docker rebuild (additive gated route + PURE module + optional model fields, μηδέν
shared runtime wiring — type-check+tests καλύπτουν)· καμία νέα εξάρτηση· κανένα feature route/data-db/
User-path/bearer-path αγγίχτηκε. Collision guard: staging καθαρό, μόνο τα δικά μου paths.

**## Needs Achilleas** (erasure go-live):
- **Actual purge** (destructive): ο `erasureDueFilter` είναι έτοιμος να βρίσκει due tenants, αλλά
  το πραγματικό drop της isolated tenant db (`useDb(dbName).dropDatabase()`) + delete των Tenant/
  Membership docs είναι **destructive** → scaffold-only τώρα· ο drop = Needs-Achilleas (χειροκίνητο/
  gated, ποτέ από routine). Επόμενο increment: purge-planner (ids-only, pure) + gated CRON route που
  ΜΟΝΟ σημειώνει/reportάρει, χωρίς πραγματικό drop μέχρι explicit άδεια.
- **Access-block στο grace window (optional)**: εσκεμμένα η erasure είναι orthogonal στο status
  (scheduled-deletion μοντέλο GitHub/Google-style, ο owner κρατά πρόσβαση + μπορεί ν' ακυρώσει). Αν
  θελήσει «immediate restrict on request», θα ήθελε wiring στο `workspaceStatusError`/`resolveWorkspaceSession`
  (shared plumbing → χωριστό προσεκτικό increment).
- **Grace length** `ERASURE_GRACE_DAYS=30` = placeholder μέχρι final product decision.

**Next task:** increment 45 — είτε (α) erasure PURGE scaffold (ids-only pure planner + gated CRON
route που reportάρει due tenants ΧΩΡΙΣ drop· ο drop = Needs-Achilleas), είτε (β) per-tenant CONTENT
export scaffold (§8, αγγίζει per-tenant connection → προσοχή), είτε (γ) BYO-key AI-dispatch consumption
/ in-process 6h cron (shared runtime → άδεια), είτε (δ) user-facing workspace-settings UI panels.

## 2026-07-06 (increment 45 — erasure PURGE scaffold: report-only due-workspace scan)
**Το κενό:** το increment 44 έδωσε το erasure request/cancel lifecycle + το `erasureDueFilter` που
βρίσκει workspaces περασμένα το grace window, αλλά **τίποτα δεν consume-άρει το due-filter** — δεν
υπήρχε τρόπος να δει κανείς ποια workspaces περιμένουν permanent deletion. Έκλεισα το πρώτο,
ασφαλέστερο κομμάτι του purge: ένας **REPORT-ONLY** scanner που περιγράφει τι ΘΑ διαγραφόταν, ΧΩΡΙΣ
κανένα destructive action. Ο πραγματικός drop της isolated tenant db μένει manual/gated (Needs
Achilleas), ΠΟΤΕ από routine. ΟΛΟ σε νέα αρχεία, additive + SaaS-gated:
- `lib/tenancy/erasurePurge.ts` (νέο). **PURE** planners (unit-tested, μόνο τα pure helpers του
  `erasure.ts` ως import): `daysOverdue(scheduledAt, now)` (floor whole days PAST το scheduled purge
  instant, clamp≥0, null όταν όχι-ακόμα-due/invalid — mirror του `graceDaysLeft`), `purgeTarget`
  (project → `PurgeTarget` ή null· refuse μη-due, blank id, ή **blank dbName** — ένα purge πρέπει να
  μπορεί να ονομάσει τη db που θα dropάρει, defence-in-depth), `planErasurePurge` (batch → μόνο
  genuinely-due, safely-named). **Impure** `runErasurePurgeScan(now)`: SaaS-gated (`scanned:false`
  off), read-only `Tenant.find(erasureDueFilter(now)).select().lean()` → `planErasurePurge` → report
  με **`dryRun: true` ΠΑΝΤΑ**, μηδέν writes, μηδέν drop.
- `app/api/saas/workspace/erasure/purge/route.ts` (νέο) — `POST` SAAS-gated (404 off) + **CRON_SECRET
  bearer** (fail-closed 500 unset, 401 λάθος, constant-time compare· ίδιο μοτίβο με `trials/sweep` +
  `usage/sample`). Report-only· καλεί `runErasurePurgeScan`. Scheduler-callable για να surface-άρει
  due workspaces σε human review πριν οποιοδήποτε πραγματικό delete.
- `lib/tenancy/erasurePurge.test.ts` (νέο) — 13 PURE tests (daysOverdue floor/at-due/future-null/
  invalid-null/ISO· purgeTarget due-projection/not-due/no-schedule/blank-id/blank-dbName/trim+missing-
  optionals· planErasurePurge keep-only-due-and-named/empty-and-non-array).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run erasurePurge.test.ts` → **13/13
green**· full suite `npx vitest run` → **1555/1555 green** (113 files, +13 νέα, καμία regression).
Το route SAAS-gated (404 off)· οι planners είναι pure + import-light ⇒ `SAAS_MODE` off / default tenant
= **zero effect** (κανένα Tenant doc, το route δεν mount-άρει). Κανένας Docker rebuild (νέα PURE module
+ additive gated route, μηδέν shared runtime wiring — type-check+tests καλύπτουν)· καμία νέα εξάρτηση·
κανένα feature route/data-db/User-path/bearer-path αγγίχτηκε. Δεν άγγιξα κανένα υπάρχον αρχείο (ούτε το
`Tenant.ts` — τα erasure fields υπήρχαν ήδη από #44). Collision guard: staging καθαρό, μόνο τα 3 δικά
μου paths· push clean (`4a7c975`).

**## Needs Achilleas** (purge go-live):
- **Actual destructive drop** (deferred, ΠΟΤΕ από routine): ο scan reportάρει τα due targets (id/slug/
  dbName/daysOverdue)· το πραγματικό `useDb(dbName).dropDatabase()` + delete των Tenant/Membership docs
  παραμένει χειροκίνητο/gated. Επόμενο βήμα: ένας human-triggered admin action (ή explicit-άδεια CRON)
  που δρα πάνω στο report — όχι αυτόματο.
- **Grace length** `ERASURE_GRACE_DAYS=30` (από #44) = placeholder μέχρι final product decision.
- **CRON_SECRET** env + cron entry (ίδιο caveat με `trials/sweep`/`usage/sample`) για production trigger.

**Next task:** increment 46 — είτε (α) per-tenant CONTENT export scaffold (§8, αγγίζει per-tenant
connection → προσοχή), είτε (β) user-facing workspace-settings UI panels (όλα τα read/write control-plane
APIs έτοιμα: profile, members, billing, ai-key, erasure, τώρα και το purge report), είτε (γ) BYO-key
AI-dispatch consumption / in-process 6h cron (και τα δύο αγγίζουν shared runtime → άδεια).

## 2026-07-06 (increment 46 — per-tenant CONTENT export scaffold, closes §8 "Per-tenant export")
**Το κενό:** το increment 43 έδωσε GDPR **account** export (login identity: profile + memberships).
Το §8 ζητά ρητά «Per-tenant … export» και το §15 σημειώνει GDPR portability ως blocking — έλειπε
το **workspace CONTENT** export (Items/Receipts/… που ζουν στην isolated tenant DB). Έκλεισα το
συμπλήρωμα του account export: ένα **READ-ONLY** workspace-content export (GDPR Art. 20 σε
workspace level). ΟΛΟ additive + SaaS-gated, σε δικά μου SAAS αρχεία:
- `lib/tenancy/workspaceExport.ts` (νέο). **PURE** assembler + helpers (unit-tested): `buildWorkspaceExport(meta,collections,generatedAt,maxDocs)` → σταθερό envelope `{format:'pharos.
  workspace-export', version:1, generatedAt(ISO), notice(GDPR), workspace{slug/name/plan/status},
  maxDocsPerCollection, collections[]}` (name→slug fallback, invalid date→epoch, ποτέ blank),
  `isExportableCollection` (skip `system.*` + non-names), `resolveMaxDocs(env, fallback=10000)`
  (non-numeric/≤0→default, floored), `workspaceExportFilename(slug)` (safe charset + path-traversal
  strip + non-empty fallback). **Impure** `collectWorkspaceData(ctx, maxDocs)`: ο ΜΟΝΟΣ node reader —
  **model-agnostic raw-driver collection dump** μέσω `tenantDb(ctx)` (μηδέν feature-model import →
  πλήρως decoupled από το feature territory), reads `maxDocs+1` για truncation-flag χωρίς extra
  count, **READ-ONLY** (ποτέ write), stable sort. OSS parity: refuse του `isDefault`/no-tenantId
  (self-hosted έχει ήδη δικό του JSON backup) → `[]`, μηδέν connection.
- `app/api/saas/workspace/export/route.ts` (νέο) — `GET [?tenant=<slug>]` → attachment JSON,
  `no-store`. `saasGuard` + `resolveWorkspaceSession(slug, requireManage=true, allowInactive=true)`:
  owner/admin only (το export περιέχει ΟΛΩΝ των members τα δεδομένα → data-controller action, όχι
  self-service)· allowInactive ώστε suspended/canceled workspace να μπορεί ακόμα να πάρει τα δεδομένα
  του (portability δεν gate-άρεται σε billing status). Audit `workspace.data_exported` (μόνο
  collections/docs/truncated counts στο meta, ποτέ περιεχόμενο).
- `lib/tenancy/audit.ts` (additive edit, δικό μου) — νέα action `workspace.data_exported` (το
  audit.test «accepts every declared action» την καλύπτει auto, καμία length assertion).
- `lib/tenancy/workspaceExport.test.ts` (νέο) — 10 PURE tests (envelope shape/ISO/notice, workspace
  projection + name/slug fallback, collection pass-through + truncated, invalid-date→epoch,
  isExportableCollection system-skip, resolveMaxDocs default/floor, filename safety+traversal).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run` → **1578/1578 green** (115 files,
+10 νέα, καμία regression). External importers του `workspaceExport` από feature code → **κανένας**
(μόνο το δικό μου SaaS route)· το route SAAS-gated (404 off). ⇒ `SAAS_MODE` off / default tenant =
**zero effect** (το route δεν mount-άρει, ο reader refuse-άρει τον default tenant → μηδέν DB hit).
Κανένας Docker rebuild (νέα PURE-heavy module + additive gated route + 1 audit action, μηδέν shared
runtime wiring — type-check+tests καλύπτουν)· καμία νέα εξάρτηση· κανένα feature route/data-db/
User-path/bearer-path αγγίχτηκε. Collision guard: staging καθαρό, μόνο τα δικά μου paths.

**## Needs Achilleas** (workspace export πληρότητα):
- **Πλήρες (μη-capped) export**: ο per-collection cap `WORKSPACE_EXPORT_MAX_DOCS=10000` (env) είναι
  scaffold guard κατά OOM· collection πάνω από το cap φλαγκάρεται `truncated:true`. Πλήρες streaming
  export (NDJSON / gzip / per-collection paging) = μελλοντικό increment όταν μεγαλώσουν τα datasets.
- **File binaries ΔΕΝ περιλαμβάνονται**: το export dump-άρει ΜΟΝΟ τα Mongo collections· τα receipt
  PDFs / item photos ζουν στο STORAGE_ROOT/remote backend, ΟΧΙ στη Mongo (ίδιο caveat με το
  storage-metering #9). Χρειάζεται ξεχωριστό increment που πακετάρει τα tenant files (zip/tar) δίπλα.
- **Right-to-erasure purge** (Art. 17): ο destructive drop της tenant db (από #44/#45 scaffold)
  παραμένει manual/gated — ΠΟΤΕ από routine.

**Next task:** increment 47 — είτε (α) workspace file-binary export (πακετάρει τα tenant STORAGE_ROOT
files δίπλα στο content dump· αγγίζει storage abstraction read-only → προσοχή), είτε (β) user-facing
workspace-settings UI panels (όλα τα read/write control-plane APIs έτοιμα: profile, members, billing,
ai-key, erasure, purge report, τώρα και content-export), είτε (γ) BYO-key AI-dispatch consumption /
in-process 6h cron (και τα δύο αγγίζουν shared runtime → άδεια).

## 2026-07-06 (increment 47 — workspace FILE-BINARY manifest scaffold, closes #46 file gap)
**Το κενό:** το increment 46 έδωσε το per-tenant CONTENT export (τα Mongo collections), αλλά ρητά
σημείωσε ότι **τα binaries ΔΕΝ περιλαμβάνονται** — τα receipt/statement PDFs (`filePath`/`thumbPath`)
και τα item photos (`photos[]`) ζουν στο `STORAGE_ROOT` στον δίσκο, όχι στη Mongo. Χωρίς αυτά ένα GDPR
Art. 20 export είναι μισό. Έκλεισα το πρώτο, ασφαλέστερο κομμάτι: ένα **REPORT-ONLY manifest** που
λέει ΑΚΡΙΒΩΣ ποια αρχεία ανήκουν σε ένα workspace (derived από τα ΔΙΚΑ του doc references), αν το
καθένα υπάρχει στον δίσκο, και το συνολικό μέγεθος. Ο πραγματικός tar/zip των binaries (θέλει
streaming archive dependency) μένει deferred — μοτίβο ίδιο με το erasurePurge dry-run scaffold. ΟΛΟ
additive + SaaS-gated, σε δικά μου SAAS αρχεία:
- `lib/tenancy/workspaceFiles.ts` (νέο). **PURE** extractors + envelope (unit-tested):
  `SINGLE_FILE_FIELDS`(filePath/thumbPath) + `ARRAY_FILE_FIELDS`(photos), `extractFileRefs(doc)`
  (single+array, skip blank/absolute/traversal), `isStorageRelative` (defence-in-depth mirror του
  storage.ts resolveWithinStorage: reject blank/abs/`..`), `fileBucket` (first segment),
  `dedupeFileRefs` (dedupe+stable sort), `buildFileManifest(meta,entries,generatedAt)` → σταθερό
  envelope `{format:'pharos.workspace-files-manifest', version:1, generatedAt(ISO), notice, workspace,
  totals{files/present/missing/bytes}, files[{path,bucket,exists,bytes}]}` (totals computed → header
  ποτέ δεν διαφωνεί με τη λίστα, negative bytes clamped), `workspaceFilesManifestFilename` (safe
  charset + fallback). **Impure** (2 READ-ONLY readers): `collectWorkspaceFileRefs(ctx)` —
  model-agnostic **projected** query (μόνο τα file-ref fields, ποτέ full docs) σε κάθε exportable
  collection της tenant db μέσω `tenantDb(ctx)`· refuse default tenant → `[]`. `statWorkspaceFiles(refs)`
  — `fs.stat` only (ποτέ content, ποτέ write)· root-escaping/missing ref → `exists:false` χωρίς throw.
  Ίδια `STORAGE_ROOT` resolution με storage.ts, κρατημένη in-territory (μηδέν edit σε shared file).
- `app/api/saas/workspace/export/files/route.ts` (νέο) — `GET [?tenant=<slug>]` → attachment JSON,
  `no-store`. `saasGuard` (404 off) + `resolveWorkspaceSession(slug, requireManage=true,
  allowInactive=true)`: owner/admin only (περιγράφει ΟΛΩΝ των members τα αρχεία → data-controller
  action)· allowInactive ώστε suspended/canceled workspace να παίρνει ακόμα το manifest του. Audit
  `workspace.files_manifested` (μόνο counts/bytes, ποτέ paths-content).
- `lib/tenancy/audit.ts` (additive edit, δικό μου) — νέα action `workspace.files_manifested` (το
  audit.test «accepts every declared action» την καλύπτει auto).
- `lib/tenancy/workspaceFiles.test.ts` (νέο) — 15 tests (isStorageRelative accept/reject/trim·
  fileBucket· extractFileRefs single+array+skip/non-obj/trim· dedupe· buildFileManifest shape/
  fallback/epoch/neg-clamp· filename safety· statWorkspaceFiles present/missing/dir + escape-not-stat'd).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run` → **1607/1607 green** (117 files,
+15 νέα, καμία regression). External importers του `workspaceFiles` από feature code → **κανένας**
(μόνο το δικό μου SaaS route)· το route SAAS-gated (404 off)· ο reader refuse-άρει τον default tenant.
⇒ `SAAS_MODE` off / self-hosted = **zero effect** (route δεν mount-άρει, μηδέν DB/fs hit). Κανένας
Docker rebuild (νέα PURE-heavy module + additive gated route + 1 audit action, μηδέν shared runtime
wiring — type-check+tests καλύπτουν)· καμία νέα εξάρτηση· κανένα feature route/data-db/User-path/
bearer-path/storage-write αγγίχτηκε. Collision guard: staging καθαρό, μόνο τα δικά μου paths.

**## Needs Achilleas** (file export πληρότητα):
- **Πραγματικό binary packaging** (tar/zip/gzip streaming) δίπλα στο manifest — θέλει archive
  dependency + streaming route· deferred. Το manifest είναι το scaffold που το προηγείται.
- **Per-tenant storage isolation**: σήμερα τα αρχεία ΟΛΩΝ των tenants μοιράζονται το ένα `STORAGE_ROOT`
  (bucket/year/month, όχι per-tenant dir). Το manifest είναι σωστά scoped **από τα DB refs** του
  tenant (λίστάρει μόνο ό,τι δείχνει η δική του βάση), αλλά μια πραγματική per-tenant STORAGE_ROOT/
  prefix θα χρειαστεί όταν προστεθεί το packaging (αλλιώς δύο tenants μπορεί θεωρητικά να δείξουν το
  ίδιο shared-hash file). Design decision για τον owner.

**Next task:** increment 48 — είτε (α) actual binary packaging (tar/gzip stream του manifest· θέλει
archive dep + per-tenant storage prefix → άδεια/απόφαση), είτε (β) user-facing workspace-settings UI
panels (ΟΛΑ τα read/write control-plane APIs έτοιμα: profile, members, billing, ai-key, erasure, purge
report, content-export, files-manifest), είτε (γ) BYO-key AI-dispatch consumption / in-process 6h cron
(shared runtime → άδεια).

## 2026-07-07 (increment 48 — Superadmin console scaffold: read-only cross-tenant listing, §8)
**Το κενό:** το TODO §8 ζητά ρητά **«Superadmin console»** και μέχρι τώρα ΔΕΝ υπήρχε κανένα
cross-tenant / platform-operator surface — όλα τα υπάρχοντα SaaS routes είναι per-workspace
(owner/admin authz μέσω `resolveWorkspaceSession`). Έχτισα το πρώτο, ασφαλέστερο κομμάτι: ένα
**READ-ONLY** cross-tenant listing του control-plane `Tenant` registry, πίσω από ξεχωριστό
operator gate. Καμία destructive/write δυνατότητα (superadmin ξεκινά ως observability surface·
tenant drop/suspend μένουν manual/gated, ΠΟΤΕ από routine). ΟΛΟ additive + SaaS-gated, σε δικά
μου SAAS αρχεία:
- `lib/tenancy/superadmin.ts` (νέο) — platform-operator gate, **ξεχωριστό** από το per-workspace
  authz. Superadmin membership = **ENV allowlist** `SAAS_SUPERADMIN_EMAILS` (comma/semicolon/
  whitespace-separated), matched κατά του signed account-session email → **δεν υπάρχει in-app path
  για escalation** (μόνο ο operator του deployment το δίνει· compromised account row δεν μπορεί να
  γίνει superadmin). PURE helpers (unit-tested): `normalizeEmail`, `parseSuperadminEmails` (dedupe +
  drop tokens χωρίς `@` ώστε stray word να μη whitelist-άρει τους πάντες), `isSuperadminEmail`,
  `superadminAllowlist`/`superadminConfigured`. Impure `requireSuperadmin()` gate (mirrors
  `resolveWorkspaceSession` shape `{response}|{account}`): SAAS off/no AUTH_SECRET → saasAuthGate·
  empty allowlist → **404** (δεν αποκαλύπτει ότι υπάρχει)· not signed in → 401· not in allowlist →
  403· deleted account (stale cookie) → 401 (defence-in-depth Account existence check).
- `lib/tenancy/adminTenants.ts` (νέο) — READ-ONLY registry listing. PURE (unit-tested):
  `parseAdminTenantQuery` (limit 1..100 clamp+floor def 50, offset floor≥0, status exact-enum-only
  else null, q trim→null), `buildTenantQueryFilter` (exact status + case-insensitive **regex-escaped**
  $or slug/name/customDomain search — literal, ποτέ pattern-injection), `summarizeTenant`
  (display-safe projection: slug/plan/status/tier/customDomain/trial+erasure ISO dates/`billingLinked`
  bool/`aiByoKey` bool — **ΠΟΤΕ** aiKey ή billing ids verbatim, dates→ISO safe), `buildTenantListing`
  (σταθερό envelope `pharos.admin-tenant-listing` v1, derived count, clamped total, epoch-safe gen).
  Impure `listTenantsForAdmin` = ο ΜΟΝΟΣ reader (`Tenant.countDocuments`+`find().sort({createdAt:-1}).
  skip().limit().lean()`)· αγγίζει ΜΟΝΟ το central registry, ΠΟΤΕ per-tenant data db.
- `app/api/saas/admin/tenants/route.ts` (νέο) — `GET [?status=&q=&limit=&offset=]`, `runtime=nodejs`,
  `force-dynamic`, `saasGuard` + `requireSuperadmin` → paginated listing, `no-store`. Read-only.
- `superadmin.test.ts` (9) + `adminTenants.test.ts` (14) — PURE helper coverage (allowlist parse/
  match/config, query clamp/status/search, filter escape, summary projection + no-secret-leak +
  null-safety, envelope shape/epoch/clamp).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run` → **1641/1641 green** (120 files,
+23 νέα, καμία regression). Importers των νέων modules από feature code (εκτός του δικού μου admin
route) → **κανένας**· το route SAAS-gated (404 off) + operator-gated (404 όταν `SAAS_SUPERADMIN_EMAILS`
κενό). ⇒ `SAAS_MODE` off / self-hosted = **zero effect** (route δεν mount-άρει, gate inert, μηδέν DB
hit). Κανένας Docker rebuild (νέα PURE-heavy modules + additive gated route, μηδέν shared runtime
wiring — type-check+tests καλύπτουν)· καμία νέα εξάρτηση· κανένα feature route/data-db/User-path/
bearer-path/audit αγγίχτηκε. Collision guard: staging καθαρό (τίποτα pre-staged), μόνο τα δικά μου paths.

**## Needs Achilleas** (superadmin console):
- **`SAAS_SUPERADMIN_EMAILS` env** (comma/semicolon/whitespace-separated operator emails) όταν
  θελήσεις να ενεργοποιήσεις το console σε production. Κενό/unset = console disabled (404), zero risk.
- **Superadmin UI page** (`/admin` ή subdomain-gated) που καταναλώνει αυτό το read API — deferred (UI
  = χωριστό territory). Το API είναι το scaffold που το προηγείται.
- **Write/destructive superadmin actions** (suspend/reactivate/force-plan/drop-tenant) = **ΠΟΤΕ από
  routine**· human-triggered admin actions πάνω σε αυτό το read baseline, gated ρητά.

**Next task:** increment 49 — είτε (α) superadmin **tenant DETAIL** read endpoint (`GET admin/
tenants/[slug]` → single-tenant control-plane view + usage/dbStats summary, read-only), είτε (β)
user-facing workspace-settings UI panels (ΟΛΑ τα read/write control-plane APIs έτοιμα), είτε (γ)
actual binary packaging / BYO-key AI-dispatch (shared runtime / archive dep → άδεια).

## 2026-07-09 (increment 49 — Superadmin tenant DETAIL: read-only single-workspace view, §8)
**Το κενό:** το increment 48 έδωσε το superadmin cross-tenant LISTING (paginated registry
scan), αλλά δεν υπήρχε τρόπος να δει ο operator ΕΝΑ workspace σε βάθος — ποιοι είναι τα
μέλη του, σε ποιους ρόλους, αν έχει owner. Έκλεισα το επόμενο, ασφαλέστερο κομμάτι του
console: ένα **READ-ONLY** single-tenant detail (`GET admin/tenants/[slug]`) = registry
summary + member roster + role/status tally. Καμία write/destructive δυνατότητα· διαβάζει
ΜΟΝΟ το central registry (Tenant/Membership/Account), ΠΟΤΕ per-tenant data db. ΟΛΟ additive
+ SaaS-gated + operator-gated, σε δικά μου SAAS αρχεία:
- `lib/tenancy/adminTenantDetail.ts` (νέο). **PURE** shapers (unit-tested), reuse του
  `summarizeTenant`/`TenantSummary` από το #48: `summarizeMember(membership, account)` →
  display-safe view (accountId/email/name/role/status/invitedBy/createdAt ISO· dangling
  membership χωρίς account → κενά email/name, ποτέ throw· ΠΟΤΕ passwordHash/tokens),
  `tallyMembers` (counts by status + roles μόνο για ACTIVE members ώστε το `owners` να
  δείχνει live owners → spot ownerless workspace), `buildTenantDetail(tenant, members, gen)`
  → σταθερό envelope `{format:'pharos.admin-tenant-detail', version:1, generatedAt(ISO safe→
  epoch), tenant, memberCounts(derived), members}`. **Impure** `getTenantDetailForAdmin(slug)`
  = ο ΜΟΝΟΣ reader: `Tenant.findOne({slug})` (null → caller 404) + `Membership.find({tenant})`
  sorted + `Account.find({_id:$in})` join· αγγίζει ΜΟΝΟ registry, ΠΟΤΕ data plane.
- `app/api/saas/admin/tenants/[slug]/route.ts` (νέο) — `GET`, `runtime=nodejs`, `force-dynamic`,
  `saasGuard` (404 off) + `requireSuperadmin` (404 console-off / 401 / 403) + unknown slug →
  404· `no-store`. Read-only. Next 15 param convention (`params: Promise<{slug}>` + await).
- `lib/tenancy/adminTenantDetail.test.ts` (νέο) — 6 PURE tests (summarizeMember join+ISO+
  dangling+invalid-date-null· tallyMembers status/active-only-roles + empty· buildTenantDetail
  envelope+derived-counts + invalid-gen→epoch).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run adminTenantDetail.test.ts` →
**6/6 green**· full suite `npx vitest run` → **1677/1677 green** (125 files, καμία regression).
External importers του νέου module από feature code (εκτός του δικού μου route) → **κανένας**·
το route SAAS-gated (404 off) + operator-gated (404 όταν `SAAS_SUPERADMIN_EMAILS` κενό)· ο
reader αγγίζει μόνο registry. ⇒ `SAAS_MODE` off / self-hosted = **zero effect** (route δεν
mount-άρει, gate inert, μηδέν per-tenant DB hit). Κανένας Docker rebuild (νέα PURE-heavy module
+ additive gated route, μηδέν shared runtime wiring — type-check+tests καλύπτουν)· καμία νέα
εξάρτηση· κανένα feature route/data-db/User-path/bearer-path/audit αγγίχτηκε. Collision guard:
staging καθαρό (τίποτα pre-staged), μόνο τα δικά μου 3 paths.

**## Needs Achilleas** (superadmin console):
- **`SAAS_SUPERADMIN_EMAILS` env** (από #48) για ενεργοποίηση σε production. Κενό = disabled (404).
- **Superadmin UI page** (`/admin`) που καταναλώνει το listing (#48) + αυτό το detail — deferred (UI territory).
- **Per-tenant db/usage stats στο detail** (dbStats/AI usage): θα άγγιζε το data plane (`useDb`) →
  ξεχωριστό προσεκτικό increment, εσκεμμένα εκτός αυτού του registry-only detail.
- **Write/destructive superadmin actions** (suspend/reactivate/force-plan/drop-tenant) = **ΠΟΤΕ από routine**.

**Next task:** increment 50 — είτε (α) superadmin per-tenant db/usage-stats στο detail (αγγίζει data
plane read-only → προσοχή/άδεια), είτε (β) user-facing workspace-settings UI panels (ΟΛΑ τα read/write
control-plane APIs έτοιμα), είτε (γ) actual binary packaging / BYO-key AI-dispatch (shared runtime /
archive dep → άδεια).

## 2026-07-09 (increment 50 — Superadmin tenant DETAIL usage rollup: control-plane ledger read, §8)
**Το κενό:** το increment 49 έδωσε το superadmin single-tenant DETAIL (registry summary
+ member roster + role/status tally), αλλά ο operator δεν έβλεπε **κατανάλωση** — πόσα AI
calls/tokens/cost έχει κάψει ένα workspace, ούτε το storage footprint του. Το SAAS_PROGRESS
είχε σημειώσει «per-tenant db/usage stats στο detail» ως next-task (α) ΜΕ την προειδοποίηση
ότι θα άγγιζε το data plane (`useDb`/`db.stats()`). Το έκλεισα με τον **ασφαλέστερο** τρόπο:
διαβάζω ΜΟΝΟ το control-plane **`Usage` ledger** (κεντρική registry βάση), δηλαδή τα ΗΔΗ
δειγματοληπτημένα νούμερα που γράφουν τα dbStats/aiMeter — **καμία** per-tenant data db δεν
ανοίγει, κανένα `db.stats()` δεν τρέχει από αυτό το module, μηδέν write. ΟΛΟ additive +
SaaS-gated + operator-gated, σε δικά μου SAAS αρχεία:
- `lib/tenancy/adminTenantUsage.ts` (νέο). **PURE** shapers (unit-tested):
  `summarizeUsagePeriod(doc)` → display-safe ανά μήνα (period/aiCalls/aiInput+OutputTokens/
  aiCostMicros/storageBytes/storageMeasuredAt ISO· defensive `count()` NaN/±Inf/negative→0
  floored· invalid date→null), `buildUsageSummary(docs)` → σταθερό rollup {periodCount,
  totals(SUM των monotonic AI counters), latestPeriod, latestStorageBytes+MeasuredAt, periods
  most-recent-first}. **ΚΡΙΣΙΜΟ:** το storage είναι **GAUGE** (overwritten, όχι additive) →
  παίρνω τα bytes από το period με το **νεότερο storageMeasuredAt**, ΟΧΙ sum (αλλιώς θα
  τετραπλασίαζα το footprint)· ένα νεότερο αμέτρητο period δεν clobber-άρει το gauge. **Impure**
  `readTenantUsageForAdmin(tenantId, limit=12)` = ο ΜΟΝΟΣ reader: `Usage.find({tenant}).sort(
  {period:-1}).limit(clamp 1..60).lean()` πάνω στο **central registry** μόνο.
- `lib/tenancy/adminTenantDetail.ts` (edit, δικό μου #49) — envelope `version 1→2` + νέο top-
  level `usage: AdminUsageSummary` πεδίο· `buildTenantDetail` παίρνει optional 4ο arg (default
  = empty summary ώστε pure callers/tests να μη θρεντάρουν ledger)· `getTenantDetailForAdmin`
  καλεί `readTenantUsageForAdmin(String(tenant._id))` (registry-only).
- `app/api/saas/admin/tenants/[slug]/route.ts` (edit, δικό μου #49) — docstring: usage rollup +
  «reads only registry (Tenant/Membership/Account/Usage)». Καμία αλλαγή σε auth/gating/shape πέρα
  από το richer payload.
- `adminTenantUsage.test.ts` (νέο, 8) + `adminTenantDetail.test.ts` (+2: usage default + verbatim
  passthrough, version→2).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run` → **1696/1696 green** (127
files, +19 net, καμία regression). External importers του νέου usage module από feature code →
**κανένας** (μόνο το δικό μου detail module). Route SAAS-gated (404 off) + operator-gated (404
όταν `SAAS_SUPERADMIN_EMAILS` κενό)· ο reader αγγίζει ΜΟΝΟ το registry Usage ledger, ΠΟΤΕ per-
tenant data db. ⇒ `SAAS_MODE` off / self-hosted = **zero effect** (route δεν mount-άρει, gate
inert, default tenant δεν γράφει Usage docs → empty summary). Κανένας Docker rebuild (additive
node-only read module, μηδέν shared runtime wiring — type-check+tests καλύπτουν)· καμία νέα
εξάρτηση· κανένα feature route/data-db/User-path/bearer-path αγγίχτηκε. Collision guard: staging
καθαρό (τίποτα pre-staged), μόνο τα δικά μου 5 paths.

**## Needs Achilleas** (superadmin console):
- **`SAAS_SUPERADMIN_EMAILS` env** (από #48) για ενεργοποίηση σε production. Κενό = disabled (404).
- **Superadmin UI page** (`/admin`) που καταναλώνει listing (#48) + detail-με-usage (#49/#50) — deferred (UI territory).
- **LIVE per-tenant `db.stats()` στο detail** (πραγματικός on-demand δειγματοληπτικός reader αντί
  για το cached ledger): θα άγγιζε το data plane (`tenantDb`/`db.stats()`) → ξεχωριστό προσεκτικό
  increment με άδεια. Το τρέχον detail δείχνει το ΤΕΛΕΥΤΑΙΟ sampled snapshot (φρέσκο όσο τρέχει το
  `sampleAllTenants` cron).
- **Write/destructive superadmin actions** (suspend/reactivate/force-plan/drop-tenant) = **ΠΟΤΕ από routine**.

**Next task:** increment 51 — είτε (α) LIVE on-demand `db.stats()` reader στο superadmin detail
(data plane read-only → άδεια), είτε (β) user-facing workspace-settings UI panels (ΟΛΑ τα read/
write control-plane APIs έτοιμα), είτε (γ) actual binary packaging / BYO-key AI-dispatch (shared
runtime / archive dep → άδεια).

## 2026-07-10 (increment 53 — Superadmin console UI: PRWTH SaaS σελιδα, Fleet Overview, §8 UI-first)
**Το κενο:** μετα την αλλαγη κατευθυνσης (2026-07-09, UI-first) το backend admin API ηταν
πληρες (overview #51 / listing #48 / detail+usage #49/#50) αλλα **ΜΗΔΕΝ UI** — καμια σελιδα
δεν καταναλωνε τιποτα. Δεν υπηρχε `app/admin/**`, `app/(saas)/**`, ουτε `components/saas/**`.
Εκλεισα το πρωτο, θεμελιωδες κομματι: το **superadmin console shell + Fleet Overview σελιδα**,
που θεσπιζει το pattern (self-gating segment + own chrome + design-token styling) για ολο το
μελλοντικο SaaS UI. ΟΛΟ additive, σε νεους φακελους που κατεχω αποκλειστικα:
- `lib/tenancy/superadminPage.ts` (νεο) — **PAGE-side gate** = ο page-shaped καθρεφτης του
  `requireSuperadmin()` (API). Ιδια σειρα ελεγχων (saasMode → accountAuthConfigured →
  allowlist → getCurrentAccount → isSuperadminEmail → Account.findById defence-in-depth), αλλα
  ΟΛΑ καταληγουν σε ενα `notFound()` (η σελιδα δεν μπορει να επιστρεψει distinct status). Καμια
  login-redirect εσκεμμενα (θα ελεγε οτι το console υπαρχει). Επιστρεφει AccountClaims στο shell.
- `components/saas/format.ts` (νεο) — **PURE + client-safe** display helpers (formatInt/
  formatBytes base-1024/formatCostMicros micros→USD με sub-cent precision/formatWhen ISO→locale),
  ολα defensive (non-finite/negative → sane zero, ποτε "NaN"/"-1 B" σε operator dashboard).
- `components/saas/format.test.ts` (νεο, 12 tests) — grouping/scaling/precision/fallback/coercion.
- `components/saas/StatTile.tsx` (νεο) — presentational StatTile (label/value/sub/accent) +
  BreakdownList (key→count), styled με τα υπαρχοντα Pharos design tokens (`var(--color-*)`),
  ΧΩΡΙΣ να αγγιζω shared CSS/globals.
- `components/saas/AdminNav.tsx` (νεο, client) — active-link nav (usePathname)· σημερα μονο Overview.
- `app/admin/layout.tsx` (νεο) — **self-gating** segment shell (requireSuperadminPage → 404 για
  self-hosted/μη-operator), δικο του header/chrome (ΟΧΙ το SiteNav), `robots: noindex`,
  force-dynamic, operator email στο header.
- `app/admin/page.tsx` (νεο) — Fleet Overview: gate (defence-in-depth) + `readFleetOverviewForAdmin()`
  (read-only registry aggregate) → workspaces/accounts/members/billing tiles + this-month usage
  (AI calls/tokens/cost + storage) + plan/status/tier breakdowns + custom-domain/erasure counts +
  empty-state. Καλει το lib reader κατευθειαν server-side (idiomatic SSR, ηδη gated), οχι self-fetch.

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run format.test.ts` → **12/12
green**· full suite `npx vitest run` → **1815/1815 green** (139 files, καμια regression). ΚΑΝΕΝΑ
υπαρχον αρχειο δεν αγγιχτηκε (μονο νεοι φακελοι app/admin, components/saas + ενα νεο lib helper).
`SAAS_MODE` off / self-hosted = **zero effect** (το /admin segment self-gates σε notFound() πριν
render-αρει οτιδηποτε· ο reader επιστρεφει empty overview αφου ο DEFAULT_TENANT δεν εχει Tenant/
Usage rows). Κανενας Docker rebuild (additive gated segment, μηδεν shared runtime wiring — type-
check+tests καλυπτουν)· καμια νεα εξαρτηση. Collision guard: 3 foreign files (search-actions/
receiptSearch απο αλλη routine) ηταν pre-staged απο την αρχη του run → **δεν** τα αγγιξα· εκανα
isolated pathspec commit μονο των δικων μου 7 αρχειων ωστε να μη σαρωθουν στο commit μου.

**## Needs Achilleas** (superadmin console):
- **`SAAS_SUPERADMIN_EMAILS` env** (operator allowlist) + **`SAAS_MODE=on`** + **`AUTH_SECRET`**
  για να ενεργοποιηθει το /admin σε production. Κενο/off = console disabled (404), zero risk.
- **Superadmin sign-in:** το /admin απαιτει ενεργο Account session (`pharos_account` cookie). Η
  (saas) login σελιδα (UI) δεν εχει χτιστει ακομα → προς το παρον ο operator συνδεεται μεσω του
  υπαρχοντος `POST api/saas/auth/login`. Επομενο increment: (saas) auth UI.
- **Write/destructive superadmin actions** (suspend/reactivate/force-plan/drop-tenant) = **ΠΟΤΕ απο routine**.

**Next task:** increment 54 — είτε (α) superadmin **Workspaces** σελιδα (`/admin/tenants`) που
καταναλωνει το listing (#48) + per-tenant detail drill-down (#49/#50), είτε (β) user-facing
**(saas) auth UI** (signup/login panels που καταναλωνουν api/saas/auth/*), είτε (γ) user-facing
**workspace-settings** panels (members/billing/usage, ολα τα read/write control-plane APIs ετοιμα).

## 2026-07-10 (increment 54 — Superadmin WORKSPACES UI: /admin/tenants listing + [slug] detail, §8 UI-first)
**Το κενό:** το increment 53 έστησε το /admin shell + Fleet Overview, αλλά ο operator δεν
είχε τρόπο να **δει τη λίστα** των workspaces ούτε να κάνει **drill-down** σε ένα. Όλα τα
backend readers ήταν έτοιμα εδώ και βδομάδες (listing #48, detail+usage #49/#50) αλλά ΜΗΔΕΝ
UI τα κατανάλωνε. Έχτισα το δεύτερο console κομμάτι — **Workspaces listing + Workspace detail**
— καταναλώνοντας τους ήδη-χτισμένους read-only registry readers κατευθείαν server-side (idiomatic
SSR, η σελίδα είναι ήδη gated, όχι self-fetch). ΟΛΟ additive, σε δικούς μου φακέλους:
- `components/saas/StatusBadge.tsx` (νέο) — presentational pills + **PURE** tone mappers
  (`tenantStatusTone`/`memberStatusTone`/`memberRoleTone`, unknown→neutral) + `Pill`/
  `TenantStatusBadge`/`MemberStatusBadge`/`MemberRoleBadge`, styled ΜΟΝΟ με τα υπάρχοντα Pharos
  design tokens (`var(--color-*)` + `color-mix` tinted border), server-safe. Label = raw string
  → ένα unmapped status renders legibly, ΠΟΤΕ blank σε operator dashboard.
- `components/saas/StatusBadge.test.ts` (νέο, 4 tests) — κάθε known status/role → tone + fallback.
- `app/admin/tenants/page.tsx` (νέο) — **Workspaces listing**: gate (defence-in-depth) →
  `parseAdminTenantQuery` + `listTenantsForAdmin` (registry-only). GET filter form (search q +
  status select + reset· URL = source of truth, μηδέν client JS → shareable/bookmarkable),
  responsive table (name/slug/domain link → detail, plan, status badge, tier, billing/byo-key
  pills, created), **prev/next pagination** (offset±limit, "from–to of total"), empty-state.
- `app/admin/tenants/[slug]/page.tsx` (νέο) — **Workspace detail**: gate → `getTenantDetailForAdmin`
  (unknown slug → `notFound()`). Registry field list (slug/plan/tier/domain/billing/trial/
  erasure/created/updated), member tally tiles (**ownerless→red warn**), usage rollup tiles
  (AI calls/tokens/cost totals + storage gauge με measured-at), member roster table (email/name,
  role+status pills, joined). ΟΛΑ τα numbers μέσα από τους defensive formatters (#53).
- `components/saas/AdminNav.tsx` (edit, δικό μου #53) — προστέθηκε **Workspaces** link +
  prefix-aware active highlight (`isActive`: Overview exact, section links match sub-paths).

**Verified:** `npm run type-check` → **EXIT 0** (έπιασα 2 self-inflicted λάθη πριν το commit:
ένα garbled function-name + λάθος `latestPeriod.period` όπου το πεδίο είναι `string|null`).
`npx vitest run StatusBadge.test.ts` → **4/4**· full suite `npx vitest run` → **1845/1845 green**
(142 files, καμία regression). ΚΑΝΕΝΑ υπάρχον feature αρχείο δεν αγγίχτηκε (μόνο νέα app/admin/
tenants/** + components/saas/StatusBadge* + το δικό μου AdminNav). `SAAS_MODE` off / self-hosted
= **zero effect** (και οι δύο σελίδες self-gate σε `notFound()` μέσω `requireSuperadminPage()`
πριν render· οι readers επιστρέφουν empty αφού ο DEFAULT_TENANT δεν έχει Tenant/Usage rows).
Κανένας Docker rebuild (additive gated segment, μηδέν shared runtime wiring)· καμία νέα εξάρτηση.
Collision guard: 3 foreign files (search-actions/receiptSearch από άλλη routine) ήταν pre-staged
απ' την αρχή → **δεν** τα άγγιξα· isolated pathspec commit μόνο των δικών μου αρχείων.

**## Needs Achilleas** (superadmin console):
- **`SAAS_SUPERADMIN_EMAILS` + `SAAS_MODE=on` + `AUTH_SECRET`** για ενεργοποίηση του /admin σε
  production. Κενό/off = console disabled (404), zero risk.
- **Superadmin sign-in:** το /admin απαιτεί ενεργό Account session· η (saas) login UI δεν έχει
  χτιστεί ακόμα → ο operator συνδέεται μέσω `POST api/saas/auth/login`. Επόμενο μεγάλο UI κομμάτι.
- **LIVE per-tenant `db.stats()`** στο detail (on-demand data-plane read αντί για cached ledger) =
  ξεχωριστό increment με άδεια. Το detail σήμερα δείχνει το τελευταίο sampled Usage snapshot.
- **Write/destructive superadmin actions** (suspend/reactivate/force-plan/drop-tenant) = **ΠΟΤΕ από routine**.

**Next task:** increment 55 — είτε (α) user-facing **(saas) auth UI** (signup/login panels που
καταναλώνουν api/saas/auth/*, ξεκλειδώνει και το operator sign-in για το /admin), είτε (β)
user-facing **workspace-settings** panels (members/billing/usage — όλα τα read/write control-plane
APIs έτοιμα), είτε (γ) superadmin **live db.stats()** drill-down (data plane read-only → άδεια).

## 2026-07-10 (increment 55 — user-facing (saas) AUTH UI: /account/login + /account/signup, §8 UI-first)
**Το κενό:** τα increments 53-54 έχτισαν το superadmin console (/admin shell + Fleet Overview
+ Workspaces listing/detail), ΑΛΛΑ το /admin απαιτεί ενεργό Account session και **δεν υπήρχε
UI για να συνδεθεί κανείς** — ούτε operator ούτε απλός tenant. Τα auth API routes
(`api/saas/auth/signup|login|logout|session`) ήταν έτοιμα εδώ και βδομάδες με ΜΗΔΕΝ UI. Έχτισα
το πρώτο user-facing SaaS κομμάτι — **signup + login panels** — που ξεκλειδώνει ΚΑΙ το operator
sign-in για το /admin (increment 53 «Needs Achilleas»). ΟΛΟ additive, σε δικούς μου φακέλους:
- `components/saas/authValidation.ts` (νέο) — **PURE + client-safe** validators σε lockstep με
  την server policy (EMAIL_RE + MIN_PASSWORD=8 του `api/saas/auth/signup`): `isValidEmail`,
  `loginReady`, `signupReady`, `describeAuthError(status, serverError?)` (προτιμά το server
  `error` string, αλλιώς status-derived — ποτέ bare "undefined"), και **`safeNextPath`**
  (open-redirect guard: μόνο leading single "/", απορρίπτει `//host`, `/\host`, backslashes,
  scheme-bearing, non-string → fallback "/"). API re-validate authoritatively· αυτά μόνο UX.
- `components/saas/authValidation.test.ts` (νέο, 10 tests) — email shape, login/signup readiness,
  error mapping (server-preferred + status fallbacks + non-string ignore), safeNextPath open-
  redirect matrix + custom fallback.
- `components/saas/AuthShell.tsx` (νέο) — presentational, **server-safe** centered auth card,
  styled ΜΟΝΟ με τα υπάρχοντα Pharos design tokens (`var(--color-*)`), μηδέν shared CSS/globals.
- `components/saas/AuthForm.tsx` (νέο, client) — ΕΝΑ component, δύο modes: login POST
  `{email,password}` → `api/saas/auth/login`· signup POST `{email,password,name?,workspace?}` →
  `api/saas/auth/signup`. On success **full navigation** (`window.location.assign(safeNext)`)
  ώστε το φρέσκο server render να πιάσει το μόλις-set httpOnly account cookie. Inline field
  errors, disabled-until-ready button, `role="alert"` error box, autocomplete hints.
- `lib/tenancy/saasPage.ts` (νέο) — **PAGE-side gate** = page-shaped καθρέφτης του `saasAuthGate()`
  (API). `requireSaasUiEnabled()` → `notFound()` όταν SAAS_MODE off Ή AUTH_SECRET λείπει (fail
  closed)· `getSaasViewer()` → gate + current AccountClaims|null (token-only). Διακριτό από το
  `requireSuperadminPage()` — αυτό ΔΕΝ απαιτεί allowlist (ordinary tenant-facing).
- `app/(saas)/layout.tsx` (νέο) — **self-gating** segment shell (requireSaasUiEnabled → 404 για
  self-hosted/misconfig), `robots: noindex`, force-dynamic. Chrome-less (κάθε page μέσα σε
  AuthShell)· σε SaaS mode το root layout δεν render-άρει SiteNav (δεν υπάρχει per-tenant `User`).
- `app/(saas)/account/login/page.tsx` + `app/(saas)/account/signup/page.tsx` (νέα) — gate +
  already-signed-in → `redirect(safeNext)` + AuthShell + AuthForm + cross-link. **Mount σε
  `/account/*`** (ΟΧΙ `/login`|`/signup`) επίτηδες: το `app/login` (self-hosted User login)
  υπάρχει ήδη → route-group `(saas)/login` θα resolve-άρε στο ίδιο `/login` URL = build collision.
  Το SaaS Account auth είναι διακριτή έννοια από το per-tenant User login, άρα διακριτό path.

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run authValidation.test.ts` →
**10/10**· full suite `npx vitest run` → **1879/1879 green** (145 files, καμία regression).
ΚΑΝΕΝΑ υπάρχον feature αρχείο δεν αγγίχτηκε (μόνο νέα app/(saas)/**, components/saas/auth*, το
νέο lib/tenancy/saasPage). `SAAS_MODE` off / self-hosted = **zero effect** (το (saas) segment
self-gates σε `notFound()` μέσω `requireSaasUiEnabled()` πριν render· το self-hosted `/login`
μένει byte-for-byte αμετάβλητο). Κανένας Docker rebuild (additive gated segment + node/client
modules, μηδέν shared runtime wiring)· καμία νέα εξάρτηση. Collision guard: 3 foreign files
(search-actions/receiptSearch από άλλη routine) untracked/modified απ' την αρχή → **δεν** τα
άγγιξα· isolated pathspec commit μόνο των δικών μου αρχείων.

**## Needs Achilleas** ((saas) auth UI):
- **`SAAS_MODE=on` + `AUTH_SECRET` (≥16 chars)** για να υπάρχουν καν οι σελίδες (αλλιώς 404).
  Self-hosted = disabled, zero risk.
- **Post-auth destination:** το `next` default = `/` (app root), που σήμερα gate-άρεται από το
  per-tenant `User` session (self-hosted). Η SaaS-mode root-app rendering (πώς φαίνεται το `/`
  για signed-in Account χωρίς User session) = **ξεχωριστό increment** — η auth UI εδώ απλώς
  authenticate-άρει το Account σωστά.
- **Email verification / password reset UI:** τα APIs (`emailVerify`/`passwordReset` libs)
  υπάρχουν· τα panels δεν χτίστηκαν ακόμα. Επόμενο υποψήφιο κομμάτι.
- **Workspace switcher / multi-tenant landing:** ένα Account μπορεί να έχει πολλά tenants
  (`accountTenants`)· UI για επιλογή workspace μετά το login = μελλοντικό increment.

**Next task:** increment 56 — είτε (α) user-facing **workspace-settings** panels (members/billing/
usage — όλα τα read/write control-plane APIs έτοιμα), είτε (β) **email-verify / password-reset**
UI (APIs έτοιμα), είτε (γ) **workspace switcher** post-login landing (accountTenants έτοιμο).

## 2026-07-10 (increment 56 — user-facing WORKSPACE OVERVIEW page: /account/workspace, §8 UI-first)
**Το κενό:** το increment 55 έχτισε την (saas) auth UI (login/signup), αλλά μετά το sign-in
ΔΕΝ υπήρχε κανένα user-facing workspace-settings σημείο — ο tenant δεν είχε πού να δει το
workspace του, το plan/status, τη χρήση ή το billing. Τα read surfaces (`api/saas/workspace`,
`/members`, `/usage`, `/billing`) ήταν έτοιμα εδώ και βδομάδες με ΜΗΔΕΝ UI. Έχτισα το πρώτο
workspace-settings κομμάτι — **Workspace Overview** — καταναλώνοντας τους ήδη-χτισμένους readers
κατευθείαν server-side (idiomatic SSR, η σελίδα είναι ήδη gated, όχι self-fetch, όπως τα /admin
pages). ΟΛΟ additive, σε δικούς μου φακέλους:
- `components/saas/chooseWorkspace.ts` (νέο) — **PURE + client-safe** workspace picker:
  `normalizeSlug` (trim+lowercase, non-string→''), `pickWorkspace(tenants, want)` (empty→null·
  blank want→first membership· matching slug case-insensitive· unknown want→null όπως τα READ
  routes που κάνουν 403), `workspaceQuery(slug, isDefault)` (καθαρό URL για default, `?w=<slug>`
  αλλιώς, URL-encoded).
- `components/saas/chooseWorkspace.test.ts` (νέο, 11 tests) — normalize, pick-first-default,
  case-insensitive select, unknown-slug→null, non-string want, query builder + encoding.
- `components/saas/WorkspaceShell.tsx` (νέο, server-safe) — settings-page container: header με
  workspace name + plan/status/role badges (reuse StatusBadge Pills), **workspace switcher**
  (renders ΜΟΝΟ όταν >1 membership, `?w=` links), back-to-app + sign-out, optional tab bar.
  + `Panel`/`DefRow` helpers. Styled ΜΟΝΟ με τα υπάρχοντα Pharos design tokens, μηδέν shared CSS.
- `components/saas/SignOutButton.tsx` (νέο, client) — POST `/api/saas/auth/logout` (JSON, clears
  httpOnly cookie) → full navigation στο `/account/login` ώστε το φρέσκο render να δει το cleared
  cookie (plain form POST θα άφηνε τον χρήστη στο JSON body του route).
- `app/(saas)/account/workspace/page.tsx` (νέο) — **Workspace Overview**: gate → viewer
  (logged-out → `redirect(/account/login?next=…)`) → `accountTenants` (empty → "No workspace yet"
  empty state) → `pickWorkspace` (unknown `?w=` → `notFound()`) → `getTenantContext` → parallel
  load Tenant doc + active member count + `currentUsage`. Render: 4 StatTiles (Members / AI calls
  με quota / Storage με quota / AI cost this month), Workspace panel (slug/domain/tier/created),
  Plan & billing panel (`buildBillingSummary`: plan/price/subscription/trial/included AI+storage
  + read-only CTA note), Usage panel (`aiQuotaStatus`/`storageQuotaStatus` + tokens + cost +
  "metering inactive" note). ΟΛΑ τα numbers μέσα από τους defensive formatters (#53).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run chooseWorkspace.test.ts` →
**11/11**· full suite `npx vitest run` → **1944/1944 green** (150 files, καμία regression).
ΚΑΝΕΝΑ υπάρχον feature αρχείο δεν αγγίχτηκε (μόνο νέα app/(saas)/account/workspace/** +
components/saas/chooseWorkspace*/WorkspaceShell/SignOutButton). `SAAS_MODE` off / self-hosted =
**zero effect** (η σελίδα self-gates σε `notFound()` μέσω `getSaasViewer()`→`requireSaasUiEnabled()`
πριν render). Κανένας Docker rebuild (additive gated segment, μηδέν shared runtime wiring)· καμία
νέα εξάρτηση. Collision guard: μηδέν staged foreign files πριν το commit· foreign modified/untracked
(search-actions/receiptSearch/categoryRules κ.λπ. από άλλες routines) ΔΕΝ αγγίχτηκαν· isolated
pathspec commit μόνο των δικών μου αρχείων.

**## Needs Achilleas** (workspace overview):
- **`SAAS_MODE=on` + `AUTH_SECRET` (≥16)** για να υπάρχει καν η σελίδα (αλλιώς 404). Self-hosted
  = disabled, zero risk.
- **Billing actions (checkout/portal):** η σελίδα δείχνει το billing state read-only + CTA note·
  τα κουμπιά που καλούν `api/saas/billing/checkout|portal` (client POST) = ξεχωριστό increment.
- **Root-app landing μετά το login:** το `next` default = `/`, που gate-άρεται από per-tenant
  `User` session (self-hosted). Πώς φαίνεται το `/` για signed-in Account = ακόμα ανοιχτό· προς
  το παρόν οι tenants πάνε χειροκίνητα στο `/account/workspace`.

**Next task:** increment 57 — είτε (α) **Members** panel (list + role-change/remove/invite,
read/write control-plane έτοιμο· client interactivity), είτε (β) **Billing** panel με τα
checkout/portal action κουμπιά, είτε (γ) **email-verify / password-reset** UI (APIs έτοιμα).

## 2026-07-12 (increment 57 — user-facing MEMBERS panel: /account/workspace/members, §8 UI-first)
**Το κενό:** το increment 56 έχτισε το Workspace **Overview** page, αλλά δεν υπήρχε κανένα
user-facing σημείο για member management — ο tenant δεν μπορούσε να δει/προσκαλέσει/αλλάξει
ρόλο/αφαιρέσει μέλη ή να ανακαλέσει invites. Οι control-plane routes ήταν έτοιμες εδώ και
βδομάδες (`/api/saas/members` GET/POST/PATCH/DELETE + `/api/saas/invites` DELETE) με **ΜΗΔΕΝ UI**.
Έχτισα το δεύτερο workspace-settings κομμάτι — **Members** — SSR-loading το roster + pending
invites κατευθείαν server-side (idiomatic, η σελίδα είναι ήδη gated) + client interactivity για
τα mutations. ΟΛΟ additive, σε δικούς μου φακέλους:
- `components/saas/workspaceTabs.ts` (νέο) — **PURE + client-safe** tab builder: `workspaceTabs
  (active, wParam)` → Overview/Members links που κουβαλάνε το τρέχον `?w=<slug>` selection
  (clean URLs για default workspace, `?w=` encoded+lowercased αλλιώς — ίδιο rule με το
  pickWorkspace/τα READ routes). Ώστε το switch μεταξύ panels να μένει στο ίδιο workspace.
- `components/saas/workspaceTabs.test.ts` (νέο, 5 tests) — order, active-flagging, clean-URL για
  default, `?w=` carry-through + encoding, trim/non-string handling.
- `components/saas/MembersPanel.tsx` (νέο, client) — roster (name/email + status/role badges),
  role `<select>` + Remove ανά μέλος (owner/admin μόνο), pending-invites list + Revoke,
  invite/add form (email + role). Κάθε mutation → route call με το chosen slug (`tenant` field,
  ώστε `?w=` σωστό) → `router.refresh()`. `assignableRoles` κρύβει το owner από admins (mirror
  του `canAssignRole`)· inline error/notice banner· `devToken` echo όταν το route το επιστρέφει
  (dev, unwired mailer). Plain member → read-only roster (canManage false).
- `app/(saas)/account/workspace/members/page.tsx` (νέο) — gate→viewer (logged-out → redirect
  login)→`accountTenants` (empty → redirect /account/workspace empty-state)→`pickWorkspace`
  (unknown `?w=` → `notFound()`)→`getTenantContext`. `loadMembers` (batched Account lookup, όχι
  N+1, non-removed only) + `loadInvites` (pending, μόνο για owner/admin) parallel. Render
  WorkspaceShell με tabs + MembersPanel.
- `app/(saas)/account/workspace/page.tsx` (Overview — δικό μου) — πρόσθεσα `tabs=workspaceTabs
  ('overview', w)` ώστε τα δύο panels να συνδέονται (μόνη additive αλλαγή, ίδιο μοτίβο).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run workspaceTabs.test.ts` →
**5/5**· full suite `npx vitest run` → **1983/1983 green** (153 files, καμία regression).
ΚΑΝΕΝΑ υπάρχον feature αρχείο δεν αγγίχτηκε (μόνο νέα app/(saas)/account/workspace/members/** +
components/saas/workspaceTabs*/MembersPanel + additive tabs στο δικό μου Overview page).
`SAAS_MODE` off / self-hosted = **zero effect** (self-gates σε `notFound()` μέσω `getSaasViewer()`
→`requireSaasUiEnabled()` πριν render). Κανένας Docker rebuild (additive gated segment + client/
node modules, μηδέν shared runtime wiring)· καμία νέα εξάρτηση. Collision guard: μηδέν staged
foreign files πριν το commit· foreign modified/untracked (search-actions/receiptSearch από άλλη
routine) ΔΕΝ αγγίχτηκαν· isolated pathspec commit μόνο των δικών μου αρχείων.

**## Needs Achilleas** (members panel):
- **`SAAS_MODE=on` + `AUTH_SECRET` (≥16)** για να υπάρχει καν η σελίδα (αλλιώς 404). Self-hosted
  = disabled, zero risk.
- **Email delivery για invites:** το invite-to-unregistered path μπαίνει σε λειτουργία μόνο με
  configured mailer (SMTP)· χωρίς αυτό το route echo-άρει `devToken` σε dev (το panel το δείχνει)
  και το drop-άρει σιωπηλά σε production. SMTP creds = ανοιχτό (γενικό SaaS Needs-Achilleas).
- **Root-app landing μετά το login:** παραμένει ανοιχτό (increment 56)· οι tenants πάνε
  χειροκίνητα στο /account/workspace[/members].

**Next task:** increment 58 — είτε (α) **Billing** panel με τα checkout/portal action κουμπιά
(client POST → api/saas/billing/checkout|portal· read state ήδη στο Overview), είτε (β)
**email-verify / password-reset** UI (APIs έτοιμα), είτε (γ) **Usage** deep-dive panel/tab.

## 2026-07-10 (increment 58 — user-facing USAGE deep-dive tab: /account/workspace/usage, §8 UI-first)
**Το κενό:** τα increments 56-57 (+ οι παράλληλες runs για billing/recovery UI) έχτισαν
Overview/Members/Billing/auth-recovery panels, αλλά το Usage φαινόταν ΜΟΝΟ ως summary panel μέσα
στο Overview — καμία deep-dive. Το `api/saas/usage` (+ `currentUsage`/`aiQuotaStatus`/
`storageQuotaStatus`/`buildCostSummary`) εκθέτουν πλούσια δεδομένα (quota `ratio`/`remaining`,
token breakdown input/output, cost micros) που το Overview δεν renderάρει. Έχτισα το τέταρτο
workspace-settings κομμάτι — **Usage** — SSR-loading τους ήδη-χτισμένους readers κατευθείαν
server-side (idiomatic, η σελίδα είναι ήδη gated, όχι self-fetch). ΟΛΟ additive, σε δικούς μου
φακέλους:
- `components/saas/quota.ts` (νέο) — **PURE + client-safe** `quotaBarView(input)` → view model
  { unlimited, percent(0..100 int), tone(ok/warn/full), remaining }. Unlimited (null/≤0 limit) →
  flat "ok" track, μηδέν remaining. Fill fraction προτιμά explicit `ratio` (clamp 0..1), αλλιώς
  used/limit· percent clamp 0..100 (over-quota → full bar, όχι overflow). Tone thresholds 75%→warn,
  100%→full. Defensive: garbage/NaN/negative → 0, ποτέ NaN/negative width. (ονομάστηκε `quota.ts`
  όχι `quotaBar.ts` για αποφυγή case-only collision με το `QuotaBar.tsx` στο case-insensitive FS).
- `components/saas/quota.test.ts` (νέο, 8 tests) — unlimited/null/≤0 limit, computed percent+
  remaining, ratio-preferred-over-limit, warn@75%/full@100%, over-quota clamp, rounding,
  garbage-input defensiveness.
- `components/saas/QuotaBar.tsx` (νέο, server-safe) — labelled progress bar: caption "used / limit"
  (∞ όταν unlimited), fill χρωματισμένο κατά tone (accent/gold/red), "N% used" + "X left",
  `role="progressbar"` + aria-value*. Styled ΜΟΝΟ με υπάρχοντα Pharos tokens, μηδέν shared CSS.
- `app/(saas)/account/workspace/usage/page.tsx` (νέο) — gate→viewer (logged-out → redirect login)
  →`accountTenants` (empty → redirect /account/workspace, που owns το empty state)→`pickWorkspace`
  (unknown `?w=` → `notFound()`)→`getTenantContext`→`currentUsage` + quota status + cost summary.
  Render: 4 StatTiles (AI calls / Total tokens / Storage / AI cost), Quotas panel (2 QuotaBars με
  τα quota ratios + "metering inactive" note), AI token breakdown panel (input/output/total tokens
  + recorded calls + estimated cost). ΟΛΑ τα numbers μέσα από τους defensive formatters.
- `components/saas/workspaceTabs.ts` (+`.test.ts`) — πρόσθεσα `'usage'` στο `WorkspaceTabKey` +
  TABS (Overview→Members→**Usage**→Billing)· ο νέος tab εμφανίζεται αυτόματα σε ΟΛΑ τα panels.
  Test επεκτάθηκε (order 4 tabs, Usage active flag, `?w=` carry-through indices).

**Verified:** `npm run type-check` → **EXIT 0** (χρειάστηκε rename quotaBar→quota λόγω case-only
FS collision, διορθώθηκε). `npx vitest run quota.test.ts workspaceTabs.test.ts` → **15/15**·
full suite `npx vitest run` → **2094/2094 green** (162 files, καμία regression). ΚΑΝΕΝΑ υπάρχον
feature αρχείο δεν αγγίχτηκε (μόνο νέα usage/** + quota*/QuotaBar + additive tab στο δικό μου
workspaceTabs). `SAAS_MODE` off / self-hosted = **zero effect** (self-gates σε `notFound()` μέσω
`getSaasViewer()`→`requireSaasUiEnabled()` πριν render). Κανένας Docker rebuild (additive gated
segment, μηδέν shared runtime wiring)· καμία νέα εξάρτηση. Collision guard: μηδέν staged foreign
files πριν το commit· foreign modified/untracked (search-actions/receiptSearch από άλλες routines)
ΔΕΝ αγγίχτηκαν· isolated pathspec commit μόνο των δικών μου αρχείων.

**## Needs Achilleas** (usage tab):
- **`SAAS_MODE=on` + `AUTH_SECRET` (≥16)** για να υπάρχει καν η σελίδα (αλλιώς 404). Self-hosted
  = disabled, zero risk.
- **AI-usage wiring:** τα numbers μένουν μηδέν μέχρι το `recordAiUsage` να καλείται στα AI
  call-sites (ledger υπάρχει, wiring = ξεχωριστό backend increment)· το panel το δηλώνει με
  "metering inactive" note.
- **Storage sampling:** το storageBytes γεμίζει από το cron `POST /api/saas/usage/sample`
  (CRON_SECRET + scheduler) — δεν τρέχει αυτόματα σε αυτό το deployment ακόμα.

**Next task:** increment 59 — είτε (α) **Billing** action κουμπιά αν λείπουν (client checkout/
portal POST), είτε (β) **root-app landing** μετά το login για signed-in Account (ανοιχτό από #56),
είτε (γ) wiring του `recordAiUsage` στα AI call-sites ώστε το Usage tab να δείχνει πραγματικά νούμερα.

## 2026-07-10 (increment 59 — superadmin LIVE storage-footprint panel: /admin/tenants/[slug], §8 UI-first)
**Το κενό:** το `GET /api/saas/admin/tenants/[slug]/dbstats` (increment 52) εκθέτει μια LIVE,
on-demand, read-only `db.stats()` footprint (billed db bytes + on-disk file bytes + total,
ΧΩΡΙΣ να γράφει Usage sample → μηδέν side effects), αλλά είχε **ΜΗΔΕΝ UI**: η σελίδα
`/admin/tenants/[slug]` έδειχνε μόνο το LAST SAMPLED νούμερο από το Usage ledger. Έχτισα το
UI-first κομμάτι που καταναλώνει αυτό το endpoint — ένας operator μπορεί τώρα να τραβήξει φρέσκο
footprint ενός workspace με ένα κουμπί. ΟΛΟ additive, σε δικούς μου φακέλους:
- `components/saas/dbStatsView.ts` (νέο) — **PURE + client-safe** `dbStatsView(input)` → view
  model { measured, dbName, generatedAt, total, db, files, objects, data, storage, index }.
  Defensive: non-object/missing `live` → all-zero not-measured· κάθε numeric field floored@0
  (NaN/±Infinity/negative → 0)· `measured` true ΜΟΝΟ για πραγματικό boolean true· non-string
  dbName/generatedAt → ''. Ώστε garbage body να μη βγάζει "NaN"/"-1 B" σε operator dashboard.
- `components/saas/dbStatsView.test.ts` (νέο, 6 tests) — non-object collapse, well-formed
  projection, measured-strict-boolean, floor-garbage, missing-live-block, non-string fallbacks.
- `components/saas/LiveDbStatsPanel.tsx` (νέο, client) — «Measure now/Re-measure» button →
  `fetch GET /api/saas/admin/tenants/<slug>/dbstats` (no-store) → 4 StatTiles (Total billed /
  Database / Files / Documents) + breakdown dl (data logical / collections on disk / indexes on
  disk / db name / measured-at). `friendlyError` map ανά status (401/403/404/503)· not-measured
  → gold note· styled ΜΟΝΟ με υπάρχοντα Pharos tokens, μηδέν shared CSS. Slug encodeURIComponent.
- `app/admin/tenants/[slug]/page.tsx` (δικό μου admin page) — 2 additive γραμμές: import +
  `<LiveDbStatsPanel slug={slug} />` (URL param, όχι `t.slug`, ώστε το fetch να resolve-άρει το
  ίδιο tenant) ανάμεσα στο registry/usage grid και στο member roster.

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run dbStatsView.test.ts` → **6/6**·
full suite `npx vitest run` → **2123/2123 green** (165 files, καμία regression). ΚΑΝΕΝΑ υπάρχον
feature αρχείο δεν αγγίχτηκε (μόνο νέα dbStatsView*/LiveDbStatsPanel + additive mount στο δικό μου
admin detail page). `SAAS_MODE` off / self-hosted = **zero effect** (το /admin segment self-gates
σε 404 μέσω requireSuperadmin πριν render· το route επίσης absent). Κανένας Docker rebuild
(additive gated segment + client component, μηδέν shared runtime wiring)· καμία νέα εξάρτηση.
Collision guard: μηδέν staged foreign files πριν το commit· foreign modified/untracked
(search-actions/receiptSearch από άλλες routines) ΔΕΝ αγγίχτηκαν· isolated pathspec commit.

**## Needs Achilleas** (dbstats panel):
- **`SAAS_MODE=on` + `AUTH_SECRET` (≥16) + `SAAS_SUPERADMIN_EMAILS`** για να υπάρχει καν η
  console/σελίδα (αλλιώς 404). Self-hosted = disabled, zero risk.
- **File-byte footprint:** το `fileBytes` μένει 0 μέχρι το storage layer να γίνει tenant-aware
  (`tenantFileBytes` επιστρέφει 0 σήμερα)· το db-byte κομμάτι είναι πλήρως live.

**Next task:** increment 60 — είτε (α) **admin tenant ACTIONS** (suspend/plan-change/schedule-
erasure) — χρειάζεται πρώτα PATCH/DELETE στο `/api/saas/admin/tenants/[slug]` (backend), μετά UI·
είτε (β) **root-app landing** μετά το login για signed-in Account (ανοιχτό από #56)· είτε (γ)
wiring του `recordAiUsage` στα AI call-sites ώστε το Usage tab να δείχνει πραγματικά νούμερα.

## 2026-07-10 (increment 60 — post-login ACCOUNT HOME / workspace chooser: /account, §8 UI-first)
**Το κενό (ανοιχτό από #56):** μετά το login ο signed-in Account πήγαινε στο `/` (self-hosted
root) και έπρεπε **χειροκίνητα** να πάει στο `/account/workspace`. Δεν υπήρχε landing που να
δείχνει ΟΛΑ τα workspaces ενός account (multi-membership) ούτε post-auth προορισμός στο SaaS
segment. Έχτισα το `/account` index — το φυσικό post-login landing — που δρομολογεί ανάλογα με
το πλήθος memberships. ΟΛΟ additive, σε δικούς μου φακέλους:
- `components/saas/accountLanding.ts` (νέο) — **PURE + client-safe** `accountLanding(tenants)` →
  decision { kind: 'empty' | 'single' | 'choose' }. Rules: non-array/empty → empty· ακριβώς 1 →
  single(slug)· ≥2 → choose(workspaces copy). Defensive: bad input → empty, μηδέν throw. Επιστρέφει
  **αντίγραφο** της λίστας (όχι το ίδιο reference).
- `components/saas/accountLanding.test.ts` (νέο, 6 tests) — empty/non-array collapse, single+slug,
  single με missing slug → '', choose preserves order, choose returns a copy.
- `app/(saas)/account/page.tsx` (νέο) — gate→viewer (logged-out → redirect `/account/login?next=
  /account`)→`connectDB`+`accountTenants(viewer.sub)`→`accountLanding`. single → `redirect('/account/
  workspace')` (skip τον chooser· το workspace page resolve-άρει το first membership by default,
  clean URL). empty → informational empty state (καμία broken link). choose → grid από workspace
  cards: κάθε card = Link σε `/account/workspace${workspaceQuery(slug, i===0)}` (clean URL για το
  πρώτο, `?w=slug` για τα υπόλοιπα — ίδιο με pickWorkspace default) + name/slug/plan Pill/status
  TenantStatusBadge/role MemberRoleBadge + hover accent border. Styled ΜΟΝΟ με υπάρχοντα Pharos
  tokens, μηδέν shared CSS· reuse StatusBadge/Pill.
- `app/(saas)/account/login/page.tsx` + `signup/page.tsx` (δικά μου) — 2 additive αλλαγές το καθένα:
  default post-auth target `safeNextPath(next, '/account')` (αντί '/') ώστε το post-login/signup
  landing να είναι ο chooser· ο cross-link (signup↔login) href βασίζεται πλέον στο `explicitNext =
  target !== '/account'` (carry μόνο πραγματικό safe `next`, αλλιώς clean link). Explicit safe
  `?next=` εξακολουθεί να κερδίζει.

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run accountLanding.test.ts` → **6/6**·
full suite `npx vitest run` → **2143/2143 green** (167 files, καμία regression). ΚΑΝΕΝΑ υπάρχον
feature αρχείο δεν αγγίχτηκε (μόνο νέα account/page + accountLanding*/ + additive-only edits σε
δικά μου login/signup pages). `SAAS_MODE` off / self-hosted = **zero effect** (το (saas) segment
self-gates σε notFound() μέσω requireSaasUiEnabled πριν render· η αλλαγή default target ζει μόνο
μέσα στο gated segment). Κανένας Docker rebuild (additive gated segment + client-safe modules,
μηδέν shared runtime wiring)· καμία νέα εξάρτηση. Collision guard: μηδέν staged foreign files πριν
το commit· foreign modified/untracked (search-actions/receiptSearch από άλλες routines) ΔΕΝ
αγγίχτηκαν· isolated pathspec commit μόνο των δικών μου αρχείων.

**## Needs Achilleas** (account home):
- **`SAAS_MODE=on` + `AUTH_SECRET` (≥16)** για να υπάρχει καν η σελίδα (αλλιώς 404). Self-hosted
  = disabled, zero risk.
- **Additional-workspace creation:** ένας signed-in account με 0 workspaces (π.χ. removed από το
  τελευταίο του) βλέπει informational empty state — δεν υπάρχει ακόμα «create another workspace»
  flow για υπάρχον account (μόνο το signup προμηθεύει το πρώτο). Ανοιχτό backend increment.
- **Sign-out από το landing:** δεν προστέθηκε (logout είναι POST)· ανοιχτό μικρό UI.

**Next task:** increment 61 — είτε (α) **admin tenant ACTIONS** (suspend/plan-change/schedule-
erasure) — χρειάζεται πρώτα PATCH/DELETE στο `/api/saas/admin/tenants/[slug]` (backend), μετά UI·
είτε (β) **sign-out control** στο account landing/workspace shell (POST → api/saas/auth/logout)·
είτε (γ) wiring του `recordAiUsage` στα AI call-sites ώστε το Usage tab να δείχνει πραγματικά νούμερα.

## 2026-07-10 (increment 61 — sign-out control on account landing: /account, §8 UI-first)
**Το κενό (ανοιχτό από #60):** ο signed-in Account στο `/account` (workspace chooser ή το
empty-state των μηδέν workspaces) δεν είχε **κανένα** τρόπο να αποσυνδεθεί — μόνο το
`WorkspaceShell` (workspace-settings pages) έδειχνε το `SignOutButton`. Έτσι, ένας χρήστης που
προσγειώνεται στον chooser έμενε stranded. Το έκλεισα με το ΗΔΗ υπάρχον client `SignOutButton`
(POST → `/api/saas/auth/logout` → navigate `/account/login`), σε δικό μου gated page:
- `app/(saas)/account/page.tsx` (δικό μου) — νέο local `AccountTopBar()` (server-safe): `← Pharos`
  link (αριστερά) + `<SignOutButton />` (δεξιά), ακριβώς το idiom του WorkspaceShell header (ίδια
  tokens/placement). Mount σε **αμφότερες** τις καταστάσεις: chooser (πάνω από το header) και
  empty-state (τυλίχτηκε σε max-w-md wrapper με το top bar πάνω, κρατώντας το κείμενο center).
  Η `single` περίπτωση δεν επηρεάζεται (redirect πριν render). Μηδέν νέο component/dependency —
  reuse του committed SignOutButton.

**Verified:** `npm run type-check` → **EXIT 0**. ΚΑΝΕΝΑ υπάρχον feature αρχείο δεν αγγίχτηκε
(μόνο το δικό μου account/page). `SAAS_MODE` off / self-hosted = **zero effect** (το (saas)
segment self-gates σε notFound() μέσω getSaasViewer/requireSaasUiEnabled πριν render). Κανένας
Docker rebuild (additive gated segment + ήδη υπάρχον client component, μηδέν shared runtime
wiring)· καμία νέα εξάρτηση. Collision guard: μηδέν staged foreign files πριν το commit· foreign
modified/untracked (search-actions/docs/features/receiptSearch από άλλες routines) ΔΕΝ αγγίχτηκαν·
isolated pathspec commit μόνο του account/page.tsx.

**## Needs Achilleas** (account sign-out):
- **`SAAS_MODE=on` + `AUTH_SECRET` (≥16)** για να υπάρχει καν η σελίδα (αλλιώς 404). Self-hosted
  = disabled, zero risk.

**Next task:** increment 62 — είτε (α) **admin tenant ACTIONS** (suspend/plan-change/schedule-
erasure) — χρειάζεται πρώτα PATCH/DELETE στο `/api/saas/admin/tenants/[slug]` (backend), μετά UI·
είτε (β) **create-another-workspace** flow για signed-in account με 0/N workspaces (backend
increment: POST create workspace για υπάρχον account, μετά UI κουμπί στο empty-state/chooser)·
είτε (γ) wiring του `recordAiUsage` στα AI call-sites ώστε το Usage tab να δείχνει πραγματικά νούμερα.

## 2026-07-10 (increment 62 — Activity tab: workspace audit trail viewer, §UI-first)
**Το κενό:** το control-plane audit trail (`models/AuditEvent` + `GET /api/saas/audit`, ήδη
χτισμένα) **δεν είχε ΚΑΝΕΝΑ UI** — κανένα workspace-settings panel το κατανάλωνε. Ένας owner/
admin δεν μπορούσε να δει «ποιος έκανε τι» (members added/removed, role changes, invites,
plan/workspace changes). Το έκλεισα με νέο **Activity tab** στο workspace shell, UI-first,
καταναλώνοντας το ήδη υπάρχον trail (SSR read, μηδέν νέο backend).
- **`components/saas/activityView.ts`** (δικό μου, νέο) — PURE/client-safe mapper: `actionLabel`
  (curated copy για τα 21 AUDIT_ACTIONS + title-case fallback για unmapped verbs), `actionTone`
  (noun→PillTone· destructive suffixes removed/revoked/canceled/suspended/cleared → πάντα red),
  `actorLabel` (name → email → «System»), `metaSummary` (flat «key: value · …», capped 6 entries
  / 60 chars/value, arrays→commas, nested→{…}), `toActivityRow[s]`. **18 unit tests**.
- **`components/saas/ActivityPanel.tsx`** (νέο) — server-safe presentational λίστα (Pill + actor +
  target + meta + formatWhen timestamp), empty-state placeholder· ίδια design tokens, μηδέν shared
  CSS.
- **`app/(saas)/account/workspace/activity/page.tsx`** (νέο) — SSR gated ακριβώς όπως το usage
  page (getSaasViewer → login redirect· pickWorkspace· getTenantContext). **Owner/admin only**
  (`canManageMembers`, parity με το 403 του audit route)· plain member → read-only notice. Διαβάζει
  AuditEvent **απευθείας** (limit 50, newest-first) + batched Account lookup για actor email/name
  (μηδέν N+1, ακριβώς το idiom του route)· μηδέν self-fetch.
- **`components/saas/workspaceTabs.ts` + test** (δικά μου) — νέο tab key `activity` (μετά το Usage,
  πριν το Billing)· test updated (νέα σειρά + active-flag + ?w= carry-through index shift). **8
  tests** pass.

**Verified:** `npm run type-check` → **EXIT 0**· `vitest run activityView + workspaceTabs` →
**26/26 pass**. ΚΑΝΕΝΑ υπάρχον feature αρχείο δεν αγγίχτηκε (μόνο τα δικά μου saas paths).
`SAAS_MODE` off / self-hosted = **zero effect** (το (saas) segment self-gates σε notFound() πριν
render). Κανένας Docker rebuild (additive gated segment + presentational components, μηδέν shared
runtime wiring)· καμία νέα εξάρτηση. Collision guard: μηδέν staged foreign files πριν το commit·
foreign modified/untracked (docs/features/DOCS_PROGRESS από άλλες routines) ΔΕΝ αγγίχτηκαν·
isolated pathspec commit μόνο των saas paths + SAAS_PROGRESS.md.

**## Needs Achilleas** (activity tab):
- **`SAAS_MODE=on` + `AUTH_SECRET` (≥16)** για να υπάρχει καν η σελίδα (αλλιώς 404). Self-hosted
  = disabled, zero risk. Το trail γεμίζει από το ήδη-wired `recordAudit` στα workspace mutations.

**Next task:** increment 63 — είτε (α) **admin tenant ACTIONS** (suspend/reactivate/plan-change) —
backend PATCH στο `/api/saas/admin/tenants/[slug]` πρώτα, μετά UI κουμπιά· είτε (β) **Activity σε
admin console** (superadmin cross-tenant activity view, καταναλώνει audit με `?tenant=` filter)·
είτε (γ) **action filter** στο Activity tab (dropdown ανά AUDIT_ACTION, ήδη υποστηρίζεται από το
route `?action=`).

## 2026-07-14 (increment 63 — admin tenant ACTIONS: suspend/reactivate/cancel + plan override, §UI-first)
**Το κενό:** ο superadmin console ήταν 100% read-only (registry listing + tenant detail + live
dbstats + activity trail) — καμία write ενέργεια. Ένα tenant που κολλάει σε dunning/suspended,
ή χρειάζεται comped upgrade, δεν είχε operator path χωρίς mongosh. Έχτισα το ΕΝΑ write surface
του console (backend PATCH πρώτα, μετά UI), όπως πρότεινε το προηγούμενο log entry:
- **`lib/tenancy/adminTenantActions.ts`** (νέο, PURE) — `isValidTenantStatus`/`isValidPlanKey`
  (reuse `TENANT_STATUSES`/`PLAN_KEYS` από τα ήδη υπάρχοντα `adminTenants.ts`/`billing/plans.ts`,
  μηδέν duplicate enum) + **`planAdminTenantPatch(input, current)`** — validate/diff ενός `{status?,
  plan?}` request: unknown enum ή κενό body → `ok:false`+error· ίδια τιμή με το τρέχον → no-op
  (`ok:true`, άδειο `set`, μηδέν audit — idempotent σαν το erasure route)· status transition →
  reuse το ΗΔΗ υπάρχον `statusAuditAction` (billing/statusAudit) για το σωστό audit verb
  (`workspace.suspended`/`workspace.canceled`/`workspace.reactivated`, ή `null` για μη-mapped
  transitions όπως pending→active)· plan αλλαγή → `planAudit:true` (→ `plan.changed`, ίδιο verb
  με το billing webhook, `meta.by:'admin'` το ξεχωρίζει). **14 unit tests** (invalid enum/κενό
  body/no-op και στα δύο πεδία/3 status verbs/fresh-activation-not-reactivation/plan-only/both-
  together/invalid-plan-short-circuits-πριν-γράψει-status).
- **`app/api/saas/admin/tenants/[slug]/route.ts`** (δικό μου, additive) — νέο **`PATCH`** δίπλα στο
  ήδη υπάρχον GET: `requireSuperadmin` (ίδιο gate)→ `Tenant.findOne(slug).select('_id slug status
  plan')` → `planAdminTenantPatch` → αν `set` μη-άδειο: `Tenant.updateOne($set)` + `recordAudit`
  ανά αλλαγμένο πεδίο (status/plan ανεξάρτητα, `auditCtx(tenantId)` — καμία workspace session,
  ο superadmin ΔΕΝ είναι member) → επιστρέφει το ίδιο `getTenantDetailForAdmin` envelope (reuse,
  μηδέν διπλό shape). 400 σε invalid enum/κενό body, 404 σε άγνωστο slug, `no-store`.
- **`components/saas/TenantActionsPanel.tsx`** (νέο, client) — «Operator actions» panel: 3 status
  κουμπιά (Suspend/Reactivate/Cancel, disabled όταν ήδη σε αυτό το status, `window.confirm` στα
  destructive-ish Suspend/Cancel) + plan `<select>`+«Change plan» (confirm, disabled αν ίδιο plan)
  → `fetch PATCH` → busy/error/notice states → **`router.refresh()`** (idiom του `MembersPanel`,
  ΟΧΙ local state mirror — ξαναδιαβάζει το server component ώστε status badge/plan text στην ίδια
  σελίδα μένουν πάντα σε sync με τη DB). Styled ΜΟΝΟ με υπάρχοντα Pharos tokens, μηδέν shared CSS.
- **`app/admin/tenants/[slug]/page.tsx`** (δικό μου) — 2 additive γραμμές: import + mount
  `<TenantActionsPanel slug={slug} status={t.status} plan={t.plan} />` ανάμεσα στο registry/usage
  grid και το live-dbstats panel.

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run adminTenantActions.test.ts` →
**14/14**· full suite `npx vitest run` → **2241/2241 green** (173 files, καμία regression). ΚΑΝΕΝΑ
υπάρχον feature αρχείο δεν αγγίχτηκε (μόνο νέα adminTenantActions*/TenantActionsPanel + additive
edits στο δικό μου admin detail route/page). `SAAS_MODE` off / self-hosted = **zero effect** (το
`/admin` segment self-gates σε 404 μέσω `requireSuperadmin` πριν καν φτάσει στο PATCH branch· το
route/component είναι absent σε build που δεν τα mount-άρει ποτέ εκτός SaaS mode). Κανένας Docker
rebuild (additive gated route handler + client component, μηδέν shared runtime wiring, ίδιο
pattern με τα increments 58-62)· καμία νέα εξάρτηση. Collision guard: μηδέν staged foreign files
πριν το commit· isolated pathspec commit μόνο των δικών μου paths.

**## Needs Achilleas** (admin tenant actions):
- **`SAAS_MODE=on` + `AUTH_SECRET` (≥16) + `SAAS_SUPERADMIN_EMAILS`** για να υπάρχει καν το
  console/PATCH (αλλιώς 404). Self-hosted = disabled, zero risk.
- **Manual plan override ≠ billing sync:** αλλάζοντας plan από το console ΔΕΝ αγγίζει Stripe
  (billingCustomerId/SubscriptionId μένουν ως έχουν) — είναι επίτηδες ένα προσωρινό/comped
  override· αν το tenant έχει ενεργή Stripe subscription, ο επόμενος Stripe webhook μπορεί να
  ξαναγράψει το plan σύμφωνα με το πραγματικό subscription (αναμενόμενο, δεν είναι bug).

**Next task:** increment 64 — είτε (α) **Activity σε admin console** (superadmin cross-tenant
activity view, καταναλώνει audit με `?tenant=` filter, ήδη υποστηρίζεται από το route)· είτε (β)
**action filter** στο workspace Activity tab (dropdown ανά AUDIT_ACTION)· είτε (γ) wiring του
`recordAiUsage` στα AI call-sites ώστε το Usage tab να δείχνει πραγματικά νούμερα.

## 2026-07-18 (increment 64 — admin console: cross-tenant Activity view on tenant detail, §UI-first)
**Το κενό:** το επόμενο-task σημείωμα του #63 έλεγε "activity με `?tenant=` filter, ήδη
υποστηρίζεται από το route" — αυτό αποδείχτηκε **ανακριβές στην εξέταση**: το
`GET /api/saas/audit` περνάει από `resolveWorkspaceSession` (membership-scoped, `requireManage`)
όχι `requireSuperadmin` — ένας superadmin που δεν είναι member ενός tenant θα έπαιρνε 403/404 από
αυτό το route, όχι cross-tenant πρόσβαση. Άρα ο superadmin console ήταν ακόμα 100% χωρίς
activity view (μόνο registry/usage/members/dbstats). Το έκλεισα με τον **απλούστερο δυνατό
δρόμο**: SSR read κατευθείαν στο ήδη-ανοιχτό `app/admin/tenants/[slug]/page.tsx` (όχι νέο API
route — η σελίδα είναι ήδη πίσω από `requireSuperadminPage()`, το ίδιο idiom με το ήδη υπάρχον
`getTenantDetailForAdmin` SSR call στην ίδια σελίδα):
- **`app/admin/tenants/[slug]/page.tsx`** (δικό μου, additive): μετά το `getTenantDetailForAdmin`,
  ένα δεύτερο query `AuditEvent.find({tenant: t.id}).limit(50)` (mirror ακριβώς του
  `(saas)/account/workspace/activity/page.tsx` SSR pattern) + batched Account lookup για
  actor email/name (μηδέν N+1, reuse `collectActorIds`/`auditView` από `lib/tenancy/audit.ts`) +
  `toActivityRows` (reuse `components/saas/activityView.ts`) → νέο **Activity section** στο τέλος
  της σελίδας, καταναλώνοντας το ήδη-committed **`ActivityPanel`** component (reused ΑΥΤΟΥΣΙΟ,
  μηδέν νέο component — το generic empty-state text του ταιριάζει). Σε αντίθεση με το workspace
  Activity tab, **ΔΕΝ υπάρχει role-gate εδώ** (πάντα δείχνει το trail) — η εξουσιοδότηση είναι το
  `requireSuperadminPage()` operator gate, όχι per-workspace role· ο superadmin βλέπει ΚΑΘΕ tenant
  απλά επισκεπτόμενος `/admin/tenants/<slug>`, χωρίς να χρειάζεται membership.
- Μηδέν νέο API route, μηδέν νέο component, μηδέν νέο dependency — καθαρά επαναχρησιμοποίηση
  ήδη-committed κομματιών (audit lib + activityView + ActivityPanel) σε νέο context.

**Verified:** `npm run type-check` → **EXIT 0**. Full suite `npx vitest run` → **2285/2285 green**
(177 files, καμία regression — δεν πρόσθεσα νέο test file αφού δεν άλλαξε καμία pure function,
μόνο η SSR σελίδα κατανάλωσε ήδη-tested helpers). ΚΑΝΕΝΑ υπάρχον feature αρχείο δεν αγγίχτηκε
(μόνο το δικό μου admin detail page). `SAAS_MODE` off / self-hosted = **zero effect** (η `/admin`
σελίδα self-gates σε `notFound()` μέσω `requireSuperadminPage()` πριν φτάσει καν στο νέο query·
απών από build που δεν την mount-άρει ποτέ εκτός SaaS mode + superadmin allowlist). Κανένας Docker
rebuild (additive SSR read μέσα σε ήδη-gated page component, μηδέν shared runtime wiring, ίδιο
pattern με τα increments 58-63). Collision guard: πριν το commit `git status --short` έδειξε
**foreign staged files** (`docs/DOCS_PROGRESS.md`, `docs/self-hosting.md` — άλλη routine mid-
commit) + foreign unstaged (`apps/web/src/app/items/actions.ts` — άλλη routine, δεν το άγγιξα) →
isolated pathspec `git add "apps/web/src/app/admin/tenants/[slug]/page.tsx"` μόνο, verified
`git diff --cached --name-only` = ένα αρχείο πριν commit.

**## Needs Achilleas** (admin activity view):
- **`SAAS_MODE=on` + `AUTH_SECRET` (≥16) + `SAAS_SUPERADMIN_EMAILS`** για να υπάρχει καν το
  console (αλλιώς 404). Self-hosted = disabled, zero risk.
- Δεν έχει δικό του pagination cursor (σταθερό `limit=50`, ίδιο με το workspace tab) — αν ένα
  tenant έχει πυκνό trail, ο operator βλέπει μόνο τα 50 πιο πρόσφατα events (αποδεκτό για observability
  surface, matching το υπάρχον workspace-side όριο).

**Next task:** increment 65 — είτε (α) **action filter** στο workspace Activity tab (dropdown ανά
AUDIT_ACTION, ήδη υποστηρίζεται από το `/api/saas/audit` route `?action=`)· είτε (β) wiring του
`recordAiUsage` στα AI call-sites ώστε το Usage tab (workspace + admin) να δείχνει πραγματικά
νούμερα αντί μηδενικών· είτε (γ) **create-another-workspace** flow για signed-in account (backend
increment: POST create workspace, μετά UI κουμπί στο account chooser/empty-state, ανοιχτό από #60).

## 2026-07-19 (increment 65 — action filter on the workspace Activity tab, §UI-first)
**Το κενό:** το επόμενο-task σημείωμα του #64 πρότεινε το action filter ως το πιο απλό, καθαρά
in-territory increment — ο `/api/saas/audit` route ήδη υποστηρίζει `?action=<verb>`, αλλά η
`(saas)/account/workspace/activity` σελίδα διαβάζει το `AuditEvent` απευθείας (SSR, όχι μέσω του
route) και δεν είχε ΚΑΝΕΝΑ filter — έδειχνε πάντα τα τελευταία 50 events ανεξαρτήτως τύπου. Οι
άλλες δύο επιλογές (recordAiUsage wiring, create-another-workspace) απαιτούν edit εκτός SAAS
territory (feature AI call-sites / νέο backend increment)· αυτό δεν χρειάζεται κανένα από τα δύο.

**Built** (ΟΛΟ σε νέο αρχείο + additive edit στη δική μου σελίδα, μηδέν νέο API route):
- **`components/saas/activityFilter.ts`** (νέο, PURE) — `ACTIVITY_FILTER_OPTIONS`: «All actions»
  + ένα option ανά `AUDIT_ACTIONS` verb (ίδια σειρά, ίδιο label με το `actionLabel` που ήδη
  χρησιμοποιεί το activity list — η dropdown copy ταιριάζει ΠΑΝΤΑ με τα pills). `ALL_ACTIONS_VALUE`
  sentinel (κενό string, ίδιο με το πώς το `parseAuditAction` αντιμετωπίζει άδειο/άγνωστο ως
  «no filter»). **5 unit tests** (πρώτο option, μήκος, σειρά == AUDIT_ACTIONS, γνωστό label,
  κανένα κενό label).
- **`app/(saas)/account/workspace/activity/page.tsx`** (δικό μου, additive): `searchParams`
  δέχεται πλέον `action?: string`· `parseAuditAction(actionRaw)` (reuse, ίδιο validation με το
  API route — άγνωστο/κενό → χωρίς filter, ποτέ 400) → merge στο ήδη υπάρχον `AuditEvent.find`
  query (`{tenant, action?}`, ίδιο idiom με το route). Νέο **plain GET `<form>`** πάνω από το
  `ActivityPanel` (**μηδέν client JS/hook** — server component παραμένει server-safe): hidden
  `w` field (carry-through του τρέχοντος workspace, ίδιο idiom με τα tabs) + `<select
  name="action">` από τα `ACTIVITY_FILTER_OPTIONS` + Filter submit + «Clear» link όταν
  ενεργό filter. Panel title επεκτάθηκε: `latest N · <Action label>` όταν φιλτραρισμένο.
  Styled ΜΟΝΟ με υπάρχοντα Pharos tokens (ίδιο idiom με το plan-select του `TenantActionsPanel`).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run activityFilter.test.ts` →
**5/5**· full suite `npx vitest run` → **2360/2360 green** (183 files, καμία regression). ΚΑΝΕΝΑ
υπάρχον feature αρχείο δεν αγγίχτηκε (μόνο νέο activityFilter*/ + additive edit στη δική μου
activity/page.tsx). `SAAS_MODE` off / self-hosted = **zero effect** (η (saas) σελίδα self-gates
σε notFound() πριν φτάσει καν στο filter). Κανένας Docker rebuild (additive SSR form + pure
module μέσα σε ήδη-gated page, μηδέν shared runtime wiring, μηδέν νέο API route, μηδέν νέα
εξάρτηση). Collision guard: `git status --short` πριν το commit έδειξε μηδέν foreign staged/
modified files → isolated pathspec commit μόνο των 3 δικών μου αρχείων.

**## Needs Achilleas** (activity filter):
- **`SAAS_MODE=on` + `AUTH_SECRET` (≥16)** για να υπάρχει καν η σελίδα (αλλιώς 404). Self-hosted
  = disabled, zero risk.

**Next task:** increment 66 — είτε (α) wiring του `recordAiUsage` στα AI call-sites ώστε το
Usage tab (workspace + admin) να δείχνει πραγματικά νούμερα αντί μηδενικών (αγγίζει feature AI
routes, θέλει ρητή άδεια/feature-builder)· είτε (β) **create-another-workspace** flow για
signed-in account (backend increment: POST create workspace για υπάρχον account, μετά UI κουμπί
στο account chooser/empty-state, ανοιχτό από #60)· είτε (γ) ίδιο action-filter dropdown στο
**admin console's** cross-tenant Activity section (increment 64), reusing `ACTIVITY_FILTER_OPTIONS`.

## 2026-07-19 (increment 66 — action filter on the admin console's cross-tenant Activity section, §UI-first)
**Το κενό:** το next-task σημείωμα του #65 έδωσε τρεις επιλογές· (α) `recordAiUsage` wiring αγγίζει
feature AI call-sites εκτός territory (ρητά flagged ως "θέλει ρητή άδεια/feature-builder"), (β)
create-another-workspace = νέος backend increment, (γ) ίδιο action-filter dropdown στο admin
console's cross-tenant Activity section (increment 64) — καθαρή επανάχρηση του `activityFilter.ts`
που μόλις χτίστηκε, μηδέν νέο route/component/dependency. Διάλεξα (γ): το admin tenant-detail
page (`/admin/tenants/[slug]`) έδειχνε πάντα τα τελευταία 50 events χωρίς κανένα φίλτρο, ενώ η
αδερφή workspace-side σελίδα το είχε ήδη.

**Built** (καθαρά additive edit σε ήδη-gated σελίδα, μηδέν νέο αρχείο):
- **`app/admin/tenants/[slug]/page.tsx`** (δικό μου): η σελίδα δέχεται πλέον `searchParams:
  Promise<{ action?: string }>` → `parseAuditAction(actionRaw)` (reuse, ίδιο idiom με το
  workspace tab — άγνωστο/κενό action ποτέ 400, απλά "no filter") → merge στο `AuditEvent.find`
  query (`{tenant: t.id, action?}`). Νέο **plain GET `<form>`** πάνω από το `ActivityPanel` μέσα
  στο ήδη υπάρχον Activity section (μηδέν client JS/hook — η σελίδα μένει server component):
  `<select>` από `ACTIVITY_FILTER_OPTIONS` + Filter submit + «Clear» link όταν ενεργό filter,
  action target = `/admin/tenants/<slug>` (χωρίς `w` hidden field — το admin console δεν έχει
  workspace-switcher, άσχετο εδώ). Section heading επεκτάθηκε με το action label όταν φιλτραρισμένο
  (ίδιο idiom με τον τίτλο του workspace Panel). Import `ACTIVITY_FILTER_OPTIONS`/`ALL_ACTIONS_VALUE`
  από το ήδη-committed `components/saas/activityFilter.ts` + `parseAuditAction` από `lib/tenancy/audit`
  — καμία νέα pure function, καμία νέα εξάρτηση.

**Verified:** `npm run type-check` → **EXIT 0**. Full suite `npx vitest run` → **2376/2376 green**
(184 files, καμία regression· δεν πρόσθεσα νέο test file — καμία νέα pure function, μόνο SSR page
που καταναλώνει ήδη-tested `activityFilter.ts`/`parseAuditAction`, ίδιο σκεπτικό με το #65 log).
ΚΑΝΕΝΑ υπάρχον feature αρχείο δεν αγγίχτηκε (μόνο το δικό μου admin detail page, 1 αρχείο).
`SAAS_MODE` off / self-hosted = **zero effect** (η `/admin` σελίδα self-gates σε `notFound()` μέσω
`requireSuperadminPage()` πριν φτάσει καν στο filter query). Κανένας Docker rebuild (additive SSR
form + query filter μέσα σε ήδη-gated page component, μηδέν shared runtime wiring, μηδέν νέο API
route, μηδέν νέα εξάρτηση — ο running `homepage-web` container σερβίρει ακόμα το προηγούμενο
bundle μέχρι το επόμενο build, αναμενόμενο για μη-runtime αλλαγή). Browser-verify skipped
(θα χρειαζόταν rebuild για να φανεί στο live :3000 — απαγορεύεται μόνο-για-verify). Collision
guard: `git status --short` πριν το commit έδειξε **μηδέν foreign staged/modified files** →
isolated pathspec commit ενός αρχείου, `git diff --cached --name-only` επιβεβαίωσε.

**## Needs Achilleas** (admin activity filter):
- **`SAAS_MODE=on` + `AUTH_SECRET` (≥16) + `SAAS_SUPERADMIN_EMAILS`** για να υπάρχει καν το
  console (αλλιώς 404). Self-hosted = disabled, zero risk.

**Next task:** increment 67 — τα δύο εναπομείναντα non-AI-touching options είναι πλέον εξαντλημένα
σε αυτό το batch (activity filter × 2 σελίδες έγινε)· καλά candidates: (α) **create-another-workspace**
flow για signed-in account (backend increment: POST create workspace για υπάρχον account, μετά UI
κουμπί στο account chooser/empty-state, ανοιχτό από #60· μεγαλύτερο σε scope, καθαρά in-territory)·
(β) **admin console search/filter** στο tenant registry list (`/admin/tenants`, πιθανώς ήδη flat
list χωρίς search box — έλεγξε πρώτα)· (γ) αν κανένα άλλο UI-first item δεν βρεθεί, εξέτασε αν
υπάρχει pagination cursor gap στο activity views (και τα δύο σταθερά limit=50, καμία "load more").

## 2026-07-20 (increment 67 — create-another-workspace flow for a signed-in Account, §UI-first)
**Το κενό:** το next-task σημείωμα του #66 πρότεινε (α) create-another-workspace, (β) admin
tenant-registry search/filter, (γ) activity pagination. Έλεγξα πρώτα το (β): το
`/admin/tenants` **έχει ήδη** search (`q`) + status filter + prev/next pagination
(`listTenantsForAdmin`/`parseAdminTenantQuery`, increment 48) — μηδέν κενό εκεί. Διάλεξα (α):
το `(saas)/account/page.tsx` (chooser/empty-state) έδειχνε τα workspaces ενός account αλλά
**καμία σελίδα δεν πρόσφερε δρόμο να φτιάξει ένα ΔΕΥΤΕΡΟ** — το empty-state text έλεγε μόνο
"ζήτα να σε προσκαλέσουν". Ταυτόχρονα ανακάλυψα ότι το **`workspace.created` audit action
υπήρχε ήδη στο `AUDIT_ACTIONS` (audit.ts) από πάντα, αλλά ΔΕΝ καταγραφόταν ΠΟΥΘΕΝΑ** — ούτε
καν στο `/api/saas/auth/signup` — άρα κάθε νέο tenant μέχρι σήμερα γεννιόταν χωρίς κανένα
audit trail entry. Το έκλεισα και τα δύο μαζί.

**Built** (νέο backend route + νέο client component + additive edit στη δική μου account page):
- **`app/api/saas/account/workspaces/route.ts`** (νέο) — `POST { name }`: `saasAuthGate()` +
  `getCurrentAccount()` (401 αν logged out) → validate name (non-blank, ≤80 chars, ίδιο cap με
  το client validator) → **defensive cap `MAX_WORKSPACES_PER_ACCOUNT=20`** (`Membership.
  countDocuments({account, status:'active'})` — δεν είναι plan/pricing concept, απλά όριο
  anti-abuse ώστε ένας λογαριασμός να μη φτιάχνει άπειρα free-trialing tenants· εύκολα
  ανεβάζεται αργότερα) → **reuse `provisionTenant`** (`lib/tenancy/provision.ts`, το ΙΔΙΟ
  helper που καλεί το `/api/saas/auth/signup` — ταυτόσημη slug/trial-stamp λογική, μηδέν νέος
  κώδικας provisioning) → **`recordAudit(auditCtx(tenant.tenantId), {action:'workspace.
  created', actor: claims.sub, target: tenant.slug, meta:{name, selfServe:true}})`** — πρώτη
  φορά που αυτό το action γράφεται ποτέ (bare-tenant-id idiom, ίδιο με invites/accept + billing
  webhook, αφού δεν υπάρχει ακόμα workspace session για ένα tenant που δεν υπήρχε πριν 1ms).
  Επιστρέφει `{tenant, tenants: accountTenants(...)}` (ίδιο σχήμα με το signup response).
- **`components/saas/createWorkspace.ts`** (νέο, PURE) — `workspaceNameReady`/
  `describeCreateWorkspaceError`/`MAX_WORKSPACE_NAME=80`, mirror του `authValidation.ts`
  idiom (client-side UX shortcut, το API re-validates authoritative). **10 unit tests**
  (blank/whitespace, boundary στο cap ακριβώς/+1, server-error passthrough, status fallbacks).
- **`components/saas/CreateWorkspaceForm.tsx`** (νέο client component) — collapsed **"+ New
  workspace"** toggle button (compact — δεν πιάνει χώρο στο συνηθισμένο 0/1-workspace path) →
  expands σε inline `name` input + Create/Cancel· `autoOpen` prop για το empty-state (όπου δεν
  υπάρχει τίποτα άλλο να κάνει ο χρήστης, οπότε ανοιχτό εξ αρχής, χωρίς Cancel). POST στο νέο
  route → **full navigation** (`window.location.assign('/account/workspace?w=<slug>')`, ίδιο
  idiom με AuthForm/SignOutButton) ώστε η fresh server render να δει το μεγαλύτερο membership
  list. `?w=<slug>` δουλεύει σωστά είτε είναι το πρώτο workspace του account είτε το δέκατο
  (το `pickWorkspace` ταιριάζει by slug ανεξαρτήτως θέσης, ήδη-tested στο #chooseWorkspace).
- **`(saas)/account/page.tsx`** (δικό μου, additive): empty-state πήρε `<CreateWorkspaceForm
  autoOpen />` κάτω από το επεξηγηματικό κείμενο (ενημερωμένο copy: "...or start your own
  below")· ο πολύ-workspace chooser πήρε το compact toggle στη δεξιά πλευρά του header
  (`flex justify-between`, ίδιο idiom με τα άλλα header actions στο codebase).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run createWorkspace.test.ts` →
**6/6**· full suite `npx vitest run` → **2401/2401 green** (187 files, καμία regression).
ΚΑΝΕΝΑ υπάρχον feature αρχείο δεν αγγίχτηκε (μόνο νέα αρχεία + additive edit στη δική μου
account/page.tsx). `SAAS_MODE` off / self-hosted = **zero effect** (το `(saas)` segment
self-gates σε `notFound()` πριν φτάσει καν στη νέα σελίδα/route· ο νέος route γυρνάει 404 μέσω
`saasAuthGate()` πριν αγγίξει DB). Κανένας Docker rebuild (νέο API route + νέο client component
+ additive SSR page edit, μηδέν shared runtime wiring, μηδέν νέα εξάρτηση — ίδιο σκεπτικό με τα
increments 58-66). Browser-verify skipped (θα χρειαζόταν rebuild για να φανεί στο live :3000 —
απαγορεύεται μόνο-για-verify, ίδιο idiom με το #66). Collision guard: `git status --short` πριν
το commit έδειξε **μηδέν foreign staged/modified files** → isolated pathspec commit των 5 δικών
μου αρχείων, `git diff --cached --name-only` επιβεβαίωσε exact match. Pushed `da3c242`.

**## Needs Achilleas** (create-another-workspace):
- **`SAAS_MODE=on` + `AUTH_SECRET` (≥16)** για να υπάρχει καν η `(saas)` σελίδα/route (αλλιώς
  404). Self-hosted = disabled, zero risk.
- **`MAX_WORKSPACES_PER_ACCOUNT=20`** είναι δική μου αυθαίρετη αλλά ασφαλή προεπιλογή (anti-
  abuse, όχι plan/pricing decision) — πες αν θες διαφορετικό όριο ή αν θες να λείπει εντελώς
  σε αυτό το στάδιο (π.χ. free-trial economics θα το χρειαστούν σαν πραγματικό plan quota
  αργότερα στο `lib/billing/entitlements.ts`, όχι σαν hardcoded constant εδώ).
- Κάθε νέο self-serve workspace ξεκινά σε **plan `free` / status `trialing`** (ίδιο με το
  signup path) — δεν υπάρχει κανένα guardrail σήμερα που να αποτρέπει έναν χρήστη από το να
  φτιάχνει πολλά ξεχωριστά trials (πέρα από το παραπάνω hard cap). Αποδεκτό στο τρέχον στάδιο
  (pre-Stripe-live), σημειωμένο εδώ ώστε να μην ξεχαστεί όταν μπει πραγματικό billing enforcement.

**Next task:** increment 68 — candidates: (α) **activity pagination** (και workspace-tab και
admin-console section έχουν σταθερό `limit=50`, καμία "load more"/cursor — μικρό, καθαρά
in-territory, reuse existing SSR pattern)· (β) η αδερφή **"leave workspace"** ενέργεια (ένα
member σε >1 workspace θέλει να αφήσει ένα από αυτά χωρίς να περιμένει τον owner — backend
route + κουμπί στο account chooser, συμμετρικό με το create που μόλις χτίστηκε)· (γ) αν το
`recordAiUsage` wiring βγει ρητά in-scope κάποια στιγμή, το Usage tab δείχνει σήμερα πάντα
μηδενικά.

## 2026-07-20 (increment 68 — leave-workspace self-service flow for a signed-in Account, §UI-first)
**Το κενό:** το next-task σημείωμα του #67 έδωσε τρεις επιλογές· (α) activity pagination, (β)
leave-workspace (συμμετρικό με το create-workspace του #67), (γ) `recordAiUsage` wiring (εκτός
territory, θέλει ρητή άδεια). Διάλεξα (β): ο `/account` chooser (πολλαπλά workspaces) έδειχνε
κάθε membership σαν κάρτα-link προς το workspace, αλλά **καμία σελίδα δεν πρόσφερε δρόμο να
φύγει** ένα account από ένα workspace χωρίς να περιμένει owner/admin — το `DELETE
/api/saas/members` (member.removed) είναι ρητά owner/admin-only (`resolveWorkspaceSession(...,
true)`), δεν καλύπτει "I want out of my own membership".

**Built** (νέος DELETE handler σε ήδη-δικό μου route + νέο client component + additive edit στη
δική μου account page):
- **`app/api/saas/account/workspaces/route.ts`** (δικό μου, additive — μόνο DELETE προστέθηκε
  δίπλα στο ήδη υπάρχον POST): `DELETE { tenant: slug }` — `saasAuthGate()` + `getCurrentAccount()`
  (401 logged out) → `getTenantContext({slug})` (404 άγνωστο workspace) → φορτώνει τα active
  memberships του tenant σε `MemberLite[]` (ίδιο σχήμα με το `members/route.ts loadMembers`) →
  αν ο caller δεν είναι member → 404 → **reuse `wouldOrphanOwners`** (`lib/tenancy/members`, το
  ΙΔΙΟ guard που το `DELETE /api/saas/members` χρησιμοποιεί για owner/admin-initiated removal)
  → 409 `last_owner` αν ο caller είναι ο μοναδικός ενεργός owner (πρέπει πρώτα να προάγει άλλον)
  → αλλιώς `Membership.updateOne({status:'removed'})` (soft-remove, ίδιο idiom) + **νέο audit
  action `member.left`** (`recordAudit` με bare-tenant-id `auditCtx`, ίδιο idiom με το
  `workspace.created` του #67 — καμία workspace session, ο caller μόλις έφυγε). Επιστρέφει
  `{left: slug, tenants: accountTenants(...)}` (ίδιο σχήμα με το POST response).
- **`lib/tenancy/audit.ts`** (δικό μου, additive): `'member.left'` προστέθηκε στο `AUDIT_ACTIONS`
  (νέα γραμμή στο membership group, δίπλα στο `member.removed`) — καθαρά additive σε closed-set
  array, μηδέν migration (δεν είναι mongoose enum). Το `activityFilter.test.ts`
  (`toHaveLength(AUDIT_ACTIONS.length+1)`) περνάει ΧΩΡΙΣ αλλαγή γιατί ήδη διαβάζει το length
  δυναμικά· το `audit.test.ts` loop `for (const a of AUDIT_ACTIONS)` ίδιο.
- **`components/saas/activityView.ts`** (δικό μου, additive): `ACTION_LABELS['member.left'] =
  'Member left'` ώστε το νέο verb να έχει curated copy στο Activity feed αντί για fallback
  title-case (ίδιο idiom με τα υπόλοιπα membership actions).
- **`components/saas/leaveWorkspace.ts`** (νέο, PURE) — `describeLeaveWorkspaceError`/
  `isLastOwnerError`, mirror του `createWorkspace.ts` idiom (client-side error-shape mapper,
  server παραμένει authoritative). **4 unit tests**.
- **`components/saas/LeaveWorkspaceButton.tsx`** (νέο client component) — μικρό «Leave» link
  ανά κάρτα, `window.confirm()` guard (destructive, no custom modal — ίδιο lightweight idiom
  με τα υπόλοιπα one-off destructive actions του codebase) → DELETE → **full navigation**
  `window.location.assign('/account')` (ίδιο idiom με CreateWorkspaceForm/SignOutButton) ώστε
  η fresh server render να δείξει τη μικρότερη λίστα workspaces.
- **`(saas)/account/page.tsx`** (δικό μου, additive): ο πολύ-workspace chooser card
  αναδιαρθρώθηκε — το εξωτερικό `<Link>` (που κάλυπτε ΟΛΗ την κάρτα) έγινε `<div>` (visual card,
  border/hover) που περιέχει **εσωτερικό `<Link>`** μόνο γύρω από το navigable περιεχόμενο
  (τίτλος/badges/βέλος) + **νέα κάτω γραμμή** (`border-t`, δεξιά-στοιχισμένη) με το
  `<LeaveWorkspaceButton>`. Σκόπιμη επιλογή έναντι ενός "stretched-link" overlay pattern
  (absolute-positioned anchor + z-index button) — απλούστερο, valid HTML (όχι button-in-anchor
  nesting), και δεν χρειάζεται stacking-context reasoning για να είναι σωστό το click hit-test.

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run leaveWorkspace.test.ts
audit.test.ts activityFilter.test.ts createWorkspace.test.ts` → **59/59**· full suite `npx
vitest run` → **2412/2412 green** (189 files, +11 tests/+2 files έναντι του #67, καμία
regression). ΚΑΝΕΝΑ υπάρχον feature αρχείο δεν αγγίχτηκε (μόνο το δικό μου workspaces route +
2 δικά μου additive edits σε activityView/audit + νέα αρχεία). `SAAS_MODE` off / self-hosted =
**zero effect** (το `(saas)` segment self-gates σε `notFound()` πριν φτάσει καν στη νέα σελίδα/
route· ο DELETE handler γυρνάει το gate response πριν αγγίξει DB). Κανένας Docker rebuild (νέος
handler σε ήδη-υπάρχον API route + νέο client component + additive SSR page edit, μηδέν shared
runtime wiring, μηδέν νέα εξάρτηση — ίδιο σκεπτικό με τα increments 58-67). Browser-verify
skipped (θα χρειαζόταν rebuild για να φανεί στο live :3000 — απαγορεύεται μόνο-για-verify, ίδιο
idiom με τα #66/#67). Collision guard: `git status --short` πριν το commit έδειξε **μηδέν
foreign staged/modified files** → isolated pathspec commit των 7 δικών μου αρχείων, `git diff
--cached --name-only` επιβεβαίωσε exact match. Pushed `d736d30`.

**## Needs Achilleas** (leave-workspace):
- **`SAAS_MODE=on` + `AUTH_SECRET` (≥16)** για να υπάρχει καν η `(saas)` σελίδα/route (αλλιώς
  404). Self-hosted = disabled, zero risk.
- Ο sole-owner guard μπλοκάρει με 409 αντί να προσφέρει αυτόματο "transfer ownership + leave"
  σε ένα βήμα — ο χρήστης πρέπει πρώτα να πάει στο Members tab και να προάγει κάποιον άλλον σε
  owner. Αποδεκτό για τώρα (ίδιο μοτίβο με το DELETE /api/saas/members), αλλά αν φανεί τριβή σε
  πραγματική χρήση, ένα combined "transfer & leave" action θα ήταν το επόμενο βήμα.

**Next task:** increment 69 — candidates: (α) **activity pagination** (και τα δύο activity
views έχουν σταθερό `limit=50`, καμία "load more"/cursor)· (β) αν το `recordAiUsage` wiring
βγει ρητά in-scope κάποια στιγμή, το Usage tab δείχνει σήμερα πάντα μηδενικά· (γ) έλεγξε αν
υπάρχει ακόμα κάποιο self-service gap συμμετρικό με create/leave-workspace (π.χ. rename
workspace από τον owner, αν δεν υπάρχει ήδη στο settings tab — έλεγξε πρώτα πριν χτίσεις).

## 2026-07-20 (increment 69 — workspace Settings tab: rename + cancel/reactivate UI, §UI-first)
**Το κενό:** το next-task σημείωμα του #68 πρότεινε ρητά να ελεγχθεί αν υπάρχει ήδη rename-
workspace UI στο settings tab πριν χτιστεί κάτι νέο. Έλεγξα: **δεν υπάρχει κανένα "Settings"
tab καν** — το `workspaceTabs.ts` έχει μόνο Overview/Members/Usage/Activity/Billing. Πιο
σημαντικό εύρημα: το `app/api/saas/workspace/route.ts` (PATCH rename) έχει ήδη docstring
που λέει ρητά *"Complements the members/invites/billing/usage/audit read surfaces so a
workspace-settings page has a 'General' tab"* — δηλαδή αυτό το route **χτίστηκε εν αναμονή
ενός UI που ποτέ δεν ήρθε**. Έλεγξα και τα αδέρφια του: **DELETE** (soft-cancel,
`canCancelWorkspace`, owner-only) και **POST /api/saas/workspace/reactivate**
(`canReactivateWorkspace`, owner-only) — και τα δύο πλήρως χτισμένα, testable, gated,
audit-logged, **μηδέν σημείο του UI να τα καλεί**. Τρία ολοκληρωμένα backend routes χωρίς
κανένα client, ό,τι πιο "UI-first gap" υπάρχει αυτή τη στιγμή στο territory.

**Built** (νέο tab + νέος pure helper + νέο client component + νέα page, additive edit μόνο
στο δικό μου `workspaceTabs.ts`):
- **`components/saas/workspaceTabs.ts`** (δικό μου, additive): `WorkspaceTabKey` +=
  `'settings'`, νέα καταχώρηση `{key:'settings', label:'Settings', path:'/account/workspace/
  settings'}` **δεύτερη στη σειρά** (μετά το Overview — το πιο "γενικό" tab, πριν τα πιο
  ειδικά Members/Usage/Activity/Billing). `workspaceTabs.test.ts` ενημερώθηκε (νέα σειρά
  6 tabs + νέο test "flags the Settings tab as active").
- **`components/saas/workspaceSettings.ts`** (νέο, PURE) — `workspaceRenameReady(name,
  currentName)` (non-blank + εντός cap + **διαφορετικό από το τρέχον** — mirrors το server's
  no-op short-circuit ώστε το Save να απενεργοποιείται φυσικά όταν δεν άλλαξε τίποτα) +
  `describeWorkspaceSettingsError(status, serverError)` (mirror του `createWorkspace.ts`/
  `leaveWorkspace.ts` idiom, καλύπτει 401/403/404/409/5xx και τα τρία routes). **7 unit
  tests** (boundary στο cap, unchanged-name rejection, server-error passthrough, status
  fallbacks).
- **`components/saas/WorkspaceSettingsPanel.tsx`** (νέο client component) — δύο panels: **"
  General"** (name input + Save, owner/admin only· read-only "only an owner or admin can
  rename" note στα plain members· slug πάντα read-only με σημείωση "permanent") + **"Danger
  zone"** (owner-only, `hidden` εντελώς σε admin/member — δεν φαίνεται καν το section):
  Cancel workspace button (μόνο όταν active/trialing, `window.confirm()` guard πριν το DELETE,
  ίδιο lightweight idiom με το `LeaveWorkspaceButton`) ⇄ Reactivate workspace button (μόνο όταν
  canceled) ⇄ read-only μήνυμα για `suspended` (δεν είναι manual flip — resolved από billing,
  ίδιο σκεπτικό με το `reactivateStatusError`). Στυλ/idiom **αντιγραμμένο 1:1 από το
  `TenantActionsPanel.tsx`** (superadmin console) — `role="status"` error/notice boxes,
  `border-[color:var(--color-red/accent)]` κουμπιά με `/10` hover tint — ίδια "γλώσσα" απλά σε
  self-service context. Κάθε mutation → `fetch` + `router.refresh()` (όχι full navigation,
  ο χρήστης μένει στο ίδιο tab, ίδιο idiom με `MembersPanel`/`TenantActionsPanel`).
- **`(saas)/account/workspace/settings/page.tsx`** (νέο) — SSR mirror του `page.tsx`
  (overview)/`members/page.tsx`: gate + `pickWorkspace` + `getTenantContext` + φόρτωση
  Tenant+memberCount → `workspaceView()` (ήδη-υπάρχον pure builder από το `lib/tenancy/
  workspace.ts`, το ΙΔΙΟ που χρησιμοποιεί το PATCH route) → περνά `canManage=
  canManageMembers(role)` / `isOwner=role==='owner'` στο panel (ίδιο naming idiom με το
  `MembersPanel`'s `canManage`/`isOwner` props).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run workspaceSettings.test.ts
workspaceTabs.test.ts` → **16/16**· full suite `npx vitest run` → **2434/2434 green** (191
files — η αύξηση από το #68's 2412 περιλαμβάνει και δύο `test(api-v1)` commits άλλης routine
που προσγειώθηκαν στο main στο μεταξύ, όχι μόνο τα δικά μου 8 νέα tests). ΚΑΝΕΝΑ υπάρχον
feature αρχείο δεν αγγίχτηκε (μόνο 4 νέα αρχεία + additive edit στα δικά μου
`workspaceTabs.ts`/`.test.ts`). `SAAS_MODE` off / self-hosted = **zero effect** (το `(saas)`
segment self-gates σε `notFound()` πριν φτάσει καν στη νέα σελίδα· ο υπάρχων `/api/saas/
workspace` route ήταν ήδη gated, μηδέν αλλαγή εκεί). Κανένας Docker rebuild (2 νέα client/
server αρχεία + 1 νέα page + additive tab-list edit, μηδέν shared runtime wiring, μηδέν νέα
εξάρτηση — ίδιο σκεπτικό με τα increments 58-68). Browser-verify skipped: το live `:3000`
container τρέχει **χωρίς `SAAS_MODE` env** (`docker exec homepage-web printenv SAAS_MODE` →
κενό) οπότε το `(saas)` segment θα έδειχνε απλά 404 (σωστό self-hosted behavior, όχι κάτι νέο
να δει κανείς)· θα χρειαζόταν rebuild με το flag για ουσιαστικό verify — απαγορεύεται μόνο-
για-verify, ίδιο idiom με τα #66-68. Collision guard: `git status --short` πριν το commit
έδειξε **μηδέν foreign staged/modified files** (HEAD ίδιο `533f677` με την αρχή του run) →
isolated pathspec commit των 6 δικών μου αρχείων, `git diff --cached --name-only` επιβεβαίωσε
exact match. Pushed `1448dac`.

**## Needs Achilleas** (workspace Settings tab):
- **`SAAS_MODE=on` + `AUTH_SECRET` (≥16)** για να υπάρχει καν η `(saas)` σελίδα/route (αλλιώς
  404). Self-hosted = disabled, zero risk.
- Τίποτα νέο πέρα από τα ήδη καταγεγραμμένα στα #67/#68 (workspace limits/trial economics) —
  αυτό το increment είναι καθαρά UI πάνω σε ήδη-εγκεκριμένα backend routes, καμία νέα policy
  απόφαση.

**Next task:** increment 70 — candidates: (α) **activity pagination** (και τα δύο activity
views έχουν σταθερό `limit=50`, καμία "load more"/cursor — παραμένει ανοιχτό από το #68)·
(β) αν το `recordAiUsage` wiring βγει ρητά in-scope κάποια στιγμή, το Usage tab δείχνει
σήμερα πάντα μηδενικά· (γ) custom-domain self-service (το `Tenant.customDomain` φαίνεται
read-only στο Overview panel — αν υπάρχει ήδη κάποιο DNS/cert flow αλλού, έλεγξε πριν χτίσεις
ένα edit UI εδώ).

## 2026-07-20 (increment 70 — Activity trail pagination, workspace + admin, §UI-first)
**Το κενό:** ανοιχτό ρητά από τα #68/#69's next-task σημειώματα: και τα δύο Activity views
((saas)/account/workspace/activity + admin/tenants/[slug]) είχαν σταθερό `limit(50)` χωρίς
κανένα "load more"/cursor — ένα workspace με >50 events στο audit trail έδειχνε πάντα μόνο
τα πιο πρόσφατα 50, με ΜΗΔΕΝ δρόμο να δει κανείς παλιότερα. Το admin page είχε μάλιστα ήδη
comment που το προέβλεπε ("an operator wanting more paginates via... a future dedicated
admin audit endpoint").

**Built** (νέο PURE module + additive edits στις 2 δικές μου activity σελίδες):
- **`components/saas/activityCursor.ts`** (νέο, PURE, χωρίς DB/next/React) — τα keyset-
  pagination primitives, shared και από τις δύο σελίδες: `encodeActivityCursor`/
  `decodeActivityCursor` (opaque `${createdAt}~${id}` string στο `?before=`, malformed input
  → null αντί throw, ίδιο lenient idiom με το `parseAuditAction`) + `cursorAfterRow` (φτιάχνει
  τον επόμενο cursor από την τελευταία ActivityRow μιας σελίδας) + **`cursorFilter`** (το
  σωστό keyset `$or` shape — `createdAt < X OR (createdAt = X AND _id < Y)` — που μένει σωστό
  ακόμα κι όταν πολλά events μοιράζονται το ίδιο millisecond, σε αντίθεση με ένα απλό
  `createdAt: {$lt}` που θα παρέκαμπτε/επανέλαβε σειρές σε tie) + **`splitPage`** (generic
  helper: fetch `limit+1`, γύρνα `{items, hasMore}` χωρίς δεύτερο `countDocuments`). **15 unit
  tests** (round-trip encode/decode, κάθε malformed-input branch, cursorFilter shape, splitPage
  boundary/no-mutation/empty).
- **`(saas)/account/workspace/activity/page.tsx`** (δικό μου, additive): νέο `before`
  searchParam → `decodeActivityCursor` → αν valid, `cursorFilter(cursor)` merge στο query
  (tenant + optional action + το `$or`) · sort έγινε `{createdAt:-1, _id:-1}` (tiebreak) ·
  fetch `PAGE_LIMIT+1` → `splitPage`. Νέο `buildHref({action, before})` helper (shared από
  Clear/Back-to-latest/Load-more links, ώστε τα τρία να μη διαφωνήσουν ποτέ για ποια params
  κρατάνε). UI: **"Load more"** button (plain `<a>`, ίδιο no-client-JS idiom με το action
  filter) όταν `hasMore`, **"← Back to latest"** όταν βρίσκεσαι σε παλιότερη σελίδα (cursor
  active) · title "latest N" → "earlier N" όταν paginated · το "Clear" τώρα καθαρίζει ΚΑΙ
  action ΚΑΙ cursor (fresh page 1). Submit του filter form (δεν έχει `before` field) πάντα
  γυρνάει σε page 1 — σωστό: διαφορετικό φίλτρο σημαίνει διαφορετικό "page 2".
- **`admin/tenants/[slug]/page.tsx`** (δικό μου, additive): ΙΔΙΟ pattern 1:1 (`ACTIVITY_LIMIT`
  αντί `PAGE_LIMIT`, `buildActivityHref` αντί `buildHref`, `nextActivityCursor`) — cross-tenant
  operator view τώρα επίσης paginate-άρει. Το παλιό comment ("future dedicated admin audit
  endpoint") ενημερώθηκε — αυτό ΕΙΝΑΙ πλέον το load-more.

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run activityCursor.test.ts
activityView.test.ts activityFilter.test.ts` → **38/38**· full suite `npx vitest run` →
**2474/2474 green** (194 files, +3 files/+40 tests έναντι του #69's 2434 — 15 δικά μου νέα
tests + tests άλλων routines που προσγειώθηκαν στο main στο μεταξύ). ΚΑΝΕΝΑ υπάρχον feature
αρχείο δεν αγγίχτηκε (1 νέο module + 1 test file + additive edits στις 2 δικές μου activity
pages). `SAAS_MODE` off / self-hosted = **zero effect** (και οι δύο σελίδες ήδη self-gate σε
`notFound()`/`requireSuperadminPage` πριν φτάσουν στο νέο query code· `docker exec
homepage-web printenv SAAS_MODE` στο live container επιβεβαίωσε κενό). Κανένας Docker rebuild
(1 νέο PURE module + additive page edits, μηδέν shared runtime wiring, μηδέν νέα εξάρτηση —
ίδιο σκεπτικό με τα increments 58-69). Browser-verify skipped: το live `:3000` δεν έχει
`SAAS_MODE` set, οπότε και οι δύο routes θα έδειχναν 404 (σωστό self-hosted behavior, τίποτα
νέο να δει κανείς)· θα χρειαζόταν rebuild με το flag μόνο-για-verify — απαγορεύεται, ίδιο idiom
με τα #66-69. Collision guard: `git status --short` πριν το staging έδειξε μόνο τα 4 δικά μου
αρχεία (2 modified + 2 new), `git diff --cached --name-only` επιβεβαίωσε exact match.

**## Needs Achilleas** (activity pagination):
- Τίποτα νέο — καθαρό UI/query-shape improvement πάνω σε ήδη-εγκεκριμένο read surface, καμία
  νέα policy απόφαση.

**Next task:** increment 71 — candidates: (α) αν το `recordAiUsage` wiring βγει ρητά in-scope,
το Usage tab δείχνει σήμερα πάντα μηδενικά· (β) custom-domain self-service (το
`Tenant.customDomain` φαίνεται read-only στο Overview panel — έλεγξε αν υπάρχει ήδη κάποιο
DNS/cert flow αλλού πριν χτίσεις ένα edit UI εδώ)· (γ) έλεγξε αν η `/admin` κεντρική λίστα
tenants (admin/tenants index, όχι το detail page) έχει ήδη search/filter/pagination — αν όχι,
συμμετρικό gap με αυτό το increment.

## 2026-07-20 (increment 71 — Account Settings page: profile/password/GDPR export, §UI-first)
**Το κενό:** έλεγξα τα 3 candidates του #70. (γ) **admin/tenants index** — ΗΔΗ πλήρες (search
`q`, status filter, prev/next pagination, `parseAdminTenantQuery`/`listTenantsForAdmin`) — καμία
δουλειά εκεί. (β) **custom-domain self-service** — δεν έχει κανένα PATCH endpoint καν (το
`workspace` route docstring λέει ρητά "Slug/dbName are immutable... NOT changeable here", το
customDomain μένει read-only field στο Tenant μοντέλο) και θα χρειαζόταν πραγματικό DNS/cert
verification flow (ποιος proxy layer, TXT record ή CNAME, ποιος εκδίδει το TLS cert) — αρχιτεκ-
τονική απόφαση που χρειάζεται τον Αχιλλέα, όχι κάτι για να μαντέψω. Το παρέκαμψα (δεν το έβαλα
καν στο ask-inbox — δεν είναι blocking, απλώς low-priority χωρίς infra ακόμα). Ψάχνοντας για
ένα τρίτο καθαρό UI-first gap βρήκα κάτι μεγαλύτερο από τα 3 candidates: **`GET/PATCH
/api/saas/account`** (profile: name/email), **`POST /api/saas/account/password`** (change
password) και **`GET /api/saas/account/export`** (GDPR Art.15/20 data export) ήταν **και τα
τρία πλήρως χτισμένα, gated, tested — μηδέν UI να τα καλέσει.** Μόνο το verify-email flow
(`/account/verify` + `VerifyEmail.tsx`) είχε ήδη UI· το profile/password/export ήταν 100% dead
weight. Αντίστοιχο μοτίβο με τα #67-70 (backend routes χτισμένα εν αναμονή UI που ποτέ δεν
ήρθε).

**Built** (2 νέα PURE+tested modules, 1 νέο client component, 1 νέα page, additive links στα
δικά μου `account/page.tsx` + `WorkspaceShell.tsx`):
- **`components/saas/accountSettings.ts`** (νέο, PURE — μόνο imports από ήδη-pure modules
  `lib/tenancy/accountProfile.ts` + `lib/tenancy/members.ts`, μηδέν DB/env): `profileNameChanged`/
  `profileEmailChanged` (mirror server normalizers ώστε whitespace-only diffs να μη ενεργο-
  ποιούν sameν Save)· `profileSaveReady` (κάτι άλλαξε KAI αν άλλαξε το email είναι syntactically
  valid — mirrors το PATCH route's guard)· `passwordSaveReady` (wraps το ήδη-υπάρχον server
  `passwordChangeError` + confirm-match, ίδιο idiom με `resetConfirmReady`)· `describeAccount
  SettingsError` (mirror του `describeWorkspaceSettingsError`, στατάρει 401/404/409/5xx). **16
  unit tests.**
- **`components/saas/AccountSettingsPanel.tsx`** (νέο client component) — τρία panels: **Profile**
  (name+email inputs, Save· αν το email άλλαξε → βγάζει "needs to be verified" notice + το
  emailVerified badge γυρνάει σε unverified τοπικά χωρίς reload)· **Password** (current/new/
  confirm, ίδιο styling idiom με το `WorkspaceSettingsPanel`)· **Your data** (plain `<a href=
  "/api/saas/account/export">` — GET authenticated με cookie, μηδέν client JS χρειάζεται για
  το download, ο browser το κατεβάζει ως attachment λόγω του route's `Content-Disposition`).
  Email-verified badge δείχνει είτε πράσινο "verified" είτε gold link "unverified · verify" →
  `/account/verify` (επαναχρησιμοποιεί το ήδη-υπάρχον resend flow, καμία διπλή λογική).
- **`(saas)/account/settings/page.tsx`** (νέο) — account-level (ΟΧΙ workspace-scoped, σε αντί-
  θεση με το `/account/workspace/settings`): gate `getSaasViewer()` + redirect-to-login + direct
  `Account.findById` (idiomatic SSR read, ίδιο με τα άλλα (saas) pages) → περνά email/name/
  emailVerified στο panel. Δικό του top bar (mirror του `AccountTopBar` στο account/page.tsx),
  ΟΧΙ `WorkspaceShell` (ένας viewer μπορεί να έχει 0/1/πολλά workspaces εδώ, δεν έχει νόημα ένα
  workspace-header).
- **Discoverability**: additive edit στο δικό μου `account/page.tsx`'s `AccountTopBar` (νέο
  "Account settings" link δίπλα στο Sign out) + στο δικό μου `WorkspaceShell.tsx`'s header (ίδιο
  link, ώστε να είναι προσβάσιμο και μέσα από κάθε workspace subpage, όχι μόνο από το account
  landing).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run accountSettings.test.ts` →
**16/16**· full suite `npx vitest run` → **2498/2498 green** (196 files, +2 files/+24 tests
έναντι του #70's 2474 — 16 δικά μου νέα tests + tests άλλων routines που προσγειώθηκαν στο main
στο μεταξύ). ΚΑΝΕΝΑ υπάρχον feature αρχείο δεν αγγίχτηκε (4 νέα αρχεία + additive edits στα 2
δικά μου UI-chrome αρχεία, μηδέν shared component/layout/globals.css). `SAAS_MODE` off /
self-hosted = **zero effect** (το `(saas)` segment self-gates σε `notFound()` πριν φτάσει καν
στη νέα σελίδα· ο `WorkspaceShell`/`account/page.tsx` link προστίθενται μόνο μέσα σε ήδη-gated
δέντρο, ΔΕΝ είναι ορατά ποτέ στο self-hosted build). Κανένας Docker rebuild (2 νέα PURE/client
αρχεία + 1 νέα page + additive link edits, μηδέν shared runtime wiring, μηδέν νέα εξάρτηση —
ίδιο σκεπτικό με τα increments 58-70). Browser-verify skipped: `docker exec homepage-web
printenv SAAS_MODE` → κενό (exit 1) στο live `:3000` container, άρα το `(saas)` segment θα
έδειχνε 404 (σωστό self-hosted behavior, τίποτα νέο να δει κανείς)· θα χρειαζόταν rebuild με
το flag μόνο-για-verify — απαγορεύεται, ίδιο idiom με τα #66-70. Collision guard: `git status
--short` πριν το staging έδειξε μόνο τα 6 δικά μου αρχεία (2 modified + 4 new), `git diff
--cached --name-only` επιβεβαίωσε exact match. Pushed `97debbf`.

**## Needs Achilleas** (account settings):
- **`SAAS_MODE=on` + `AUTH_SECRET` (≥16)** για να υπάρχει καν η `(saas)` σελίδα/route (αλλιώς
  404). Self-hosted = disabled, zero risk.
- **Custom-domain self-service** (ξανά-καταγεγραμμένο, ρητά παρακαμφθέν αυτό το increment):
  χρειάζεται αρχιτεκτονική απόφαση για DNS/cert verification (proxy layer, TXT/CNAME
  verification, TLS issuance) πριν χτιστεί οποιοδήποτε self-service edit UI. Δεν μπήκε στο
  ask-inbox γιατί δεν είναι blocking κάτι — θα μπει όταν/αν γίνει ρητά in-scope.

**Next task:** increment 72 — candidates: (α) η **Usage tab δείχνει πάντα μηδενικά** (το
`recordAiUsage`/`assertAiQuota`/`meterAiResult` wiring μένει ασύνδετο από τα πραγματικά AI
dispatch call sites στο `lib/ollama.ts` — ΕΚΤΟΣ του δικού μου territory να το συνδέσω μόνος μου,
θα χρειαζόταν να αγγίξω ένα shared feature file εκτός `lib/tenancy|billing/**` — ίσως αξίζει ένα
ask-inbox entry αν παραμείνει το μοναδικό backend-wiring κενό)· (β) ξανα-σάρωσε τα `api/saas/**`
routes για τυχόν άλλο dead-UI route (το ίδιο μοτίβο απέδωσε 4 φορές σερί, #67-71 — πιθανώς
υπάρχουν κι άλλα)· (γ) invites: το admin console δείχνει tenants αλλά υπάρχει self-service
"resend invite" UI στο Members panel; έλεγξε πριν χτίσεις.

## 2026-07-20 (increment 72 — Resend button for pending invites, §UI-first)
**Το κενό:** έλεγξα το candidate (γ) του #71 πρώτο — ήταν σωστό μαντάρισμα. Το
**`POST /api/saas/invites/resend`** route ήταν ήδη πλήρως χτισμένο, gated (`saasGuard` +
`resolveWorkspaceSession`, owner/admin only), tested (re-mints token, invalidates παλιό link,
`recordAudit('invite.resent', ...)` ήδη registered στο `activityView.ts`'s action-label map)
— αλλά το **`MembersPanel.tsx`** (δικό μου) είχε μόνο **Revoke** στα pending invites, όχι
Resend. Πριν από αυτό, ένα expired-but-pending invite μπορούσε μόνο να revoke-αριστεί και να
ξαναγίνει invite από την αρχή (νέα εγγραφή) — αντί για ένα κλικ που ξαναστέλνει το ίδιο invite
με φρέσκο token. 5ο σερί dead-backend-route εύρημα (#67-71 → τώρα #72), ίδιο μοτίβο.

**Built** (1 νέο PURE+tested module, additive edit στο δικό μου `MembersPanel.tsx`):
- **`components/saas/inviteResend.ts`** (νέο, PURE) — `resendNotice(email, devToken?)`, mirror
  του ήδη-υπάρχοντος inline notice-formatting idiom του `submitInvite` (ίδιο dev-token-echo
  σκεπτικό με το route's SCAFFOLD note: όταν δεν υπάρχει mailer configured και όχι production,
  το plaintext token επιστρέφεται μία φορά ώστε το flow να μένει testable local). **5 unit
  tests** (plain resend, dev-token echo, empty-email fallback, null vs empty-string devToken —
  και τα δύο falsy, καμία διαφορά).
- **`MembersPanel.tsx`** (δικό μου, additive) — νέο `resendInvite(id, email)` handler (ίδιο
  busy/error/notice pattern με το ήδη-υπάρχον `revokeInvite`) → `POST /api/saas/invites/resend`
  → `resendNotice` για το notice text → `router.refresh()`. Νέο **"Resend"** button δίπλα στο
  "Revoke" σε κάθε pending-invite row (`canManage` only, ίδιο guard) — accent-color hover
  (πράσινο, θετική ενέργεια) σε αντίθεση με το κόκκινο hover του Revoke.

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run inviteResend.test.ts` →
**5/5**· full suite `npx vitest run` → **2518/2518 green** (198 files, +1 file/+20 tests έναντι
του #71's 2498 — 5 δικά μου νέα tests + tests άλλων routines που προσγειώθηκαν στο main στο
μεταξύ). ΚΑΝΕΝΑ υπάρχον feature αρχείο δεν αγγίχτηκε (1 νέο module + 1 test file + additive
edit σε 1 δικό μου client component, μηδέν shared component/layout/globals.css). `SAAS_MODE`
off / self-hosted = **zero effect** (`(saas)` segment self-gates πριν φτάσει καν στο
`MembersPanel`). Κανένας Docker rebuild (1 νέο PURE module + additive client-component edit,
μηδέν shared runtime wiring, μηδέν νέα εξάρτηση — ίδιο σκεπτικό με τα increments 58-71).
Browser-verify skipped: `docker exec homepage-web printenv SAAS_MODE` → κενό στο live `:3000`
container, άρα η members σελίδα θα έδειχνε 404 ήδη (σωστό self-hosted behavior)· θα χρειαζόταν
rebuild με το flag μόνο-για-verify — απαγορεύεται, ίδιο idiom με τα #66-71. Collision guard:
`git status --short` πριν το staging έδειξε μόνο τα 3 δικά μου αρχεία (1 modified + 2 new),
`git diff --cached --name-only` επιβεβαίωσε exact match. Pushed `200bc4c`.

**## Needs Achilleas** (resend invite):
- Τίποτα νέο — καθαρό UI wiring πάνω σε ήδη-εγκεκριμένο, ήδη-tested backend route, καμία νέα
  policy απόφαση.

**Next task:** increment 73 — candidates: (α) η **Usage tab μηδενικά** (#72's carried-over (α),
βλ. παραπάνω — ίσως ώρα για ask-inbox entry αν παραμείνει το μοναδικό κενό μετά την επόμενη
σάρωση)· (β) ξανα-σάρωσε τα `api/saas/**` routes για άλλο dead-UI route (απέδωσε 5 φορές σερί
#67-72, αλλά μπορεί να έχει πλέον εξαντληθεί — αν η επόμενη σάρωση βγει άδεια, γράψε το ρητά
εδώ και προχώρα σε (α))· (γ) custom-domain self-service παραμένει blocked σε αρχιτεκτονική
απόφαση (§#71, χρειάζεται DNS/cert flow decision, δεν είναι blocking — low priority).

## 2026-07-20 (increment 73 — Invite-accept UI: /signup?invite=… actually joins a workspace, §UI-first)
**Το κενό:** ξανα-σάρωσα τα `api/saas/**` routes (candidate (β) του #72) grep-άροντας κάθε route
path μέσα σε `(saas)/**` + `admin/**` + `components/saas/**` για fetch-callers. Βρήκα **6** routes
με μηδέν UI caller: `auth/session`, `invites/accept`, `workspace/ai-key`, `workspace/erasure`,
`workspace/export`, `workspace/export/files`. Τα scheduler-only (`trials/sweep`, `usage/sample`,
`workspace/erasure/purge`) εξαιρέθηκαν σωστά (bearer-token cron endpoints, δεν έχουν καν νόημα σε
UI)· το `admin/overview` εξαιρέθηκε επίσης (το `admin/page.tsx` ήδη καλεί το `readFleetOverviewFor
Admin()` απευθείας SSR, όχι μέσω fetch — όχι dead). Από τα 6, το **`invites/accept`** ξεχώρισε ως
το πιο κρίσιμο: το `lib/tenancy/mailer.ts`'s `inviteLinkUrl()` ήδη χτίζει `/signup?invite=<token>`
και το docstring του route λέει ρητά "a /signup page reads the token and posts it" — αλλά το
`(saas)/account/signup/page.tsx` δεν διάβαζε καν `?invite=` παρά μόνο `?next=`. Δηλαδή **ολόκληρο
το invite flow ήταν σπασμένο end-to-end για πραγματικούς χρήστες**: το `MembersPanel` μπορεί να
στείλει invite (ήδη built, #προηγούμενα increments), αλλά ο invited χρήστης που πατάει το link στο
inbox του δεν είχε καμία σελίδα να το ολοκληρώσει — μόνο χειροκίνητο POST θα δούλευε. Πιο σοβαρό
από τα υπόλοιπα 5 dead routes (GDPR export/erasure/BYO-key = προαιρετικά self-service settings·
αυτό = ο βασικός onboarding μηχανισμός για νέα μέλη).

**Built** (2 νέα PURE+tested modules, 1 νέο client component, additive rewrite του δικού μου
`(saas)/account/signup/page.tsx`):
- **`components/saas/inviteAccept.ts`** (νέο, PURE, mirrors το `recoveryValidation.ts` idiom) —
  `inviteAcceptReady(password)` (password **OPTIONAL** — ο invitee μπορεί να έχει ήδη account για
  το invited email, οπότε δεν χρειάζεται κωδικό· το route ζητάει password μόνο όταν πρέπει να
  δημιουργήσει νέο account, και το reportάρει μέσω `password_required` αν ο client μάντεψε λάθος)·
  `inviteAcceptHref(token)` (σχετικό `/signup?invite=…` link, mirror του server `inviteLinkUrl`
  minus origin). **8 unit tests.**
- **`components/saas/InviteAcceptForm.tsx`** (νέο client component, mirrors το `ResetConfirmForm`/
  `AuthForm` idiom) — Name (optional) + Password (optional, με helper text "leave blank if you
  already have a Pharos account") → POST `/api/saas/invites/accept` `{token, password?, name?}` →
  success = full navigation (`window.location.assign`) ώστε να πιάσει το φρέσκο session cookie.
  Reuses το ήδη-υπάρχον `describeRecoveryError` για error mapping (το route πάντα επιστρέφει ένα
  user-facing `error` string σε κάθε failure path, οπότε ο generic status-fallback σχεδόν ποτέ δεν
  ενεργοποιείται — μηδέν ανάγκη για δικό μου bespoke describe-error, λιγότερος κώδικας).
- **`(saas)/account/signup/page.tsx`** (δικό μου, rewrite) — νέο `invite` searchParam. Όταν
  παρόν: server-side **preview** (νέο local `loadInvitePreview()`, `connectDB()` + `Invite.findOne
  ({tokenHash})` + `Tenant.findById` για display name — **μόνο για εμφάνιση**, το POST re-validates
  αυθεντικά) → δείχνει "Join {workspace}" + "You've been invited as {email}" + `InviteAcceptForm`
  όταν το token είναι valid+pending, αλλιώς "Invitation not available" (invalid/expired/άγνωστο
  token, ένα ενιαίο μήνυμα ώστε να μη διαρρέει ποιο ακριβώς έφταιξε). **Σκόπιμα ΔΕΝ κάνει redirect
  έναν ήδη-signed-in viewer μακριά** όταν υπάρχει invite token (το accept route είναι unauthenticated
  by design και πάντα resolve-άρει στο email ΤΟΥ invite, όχι του caller's session — ένας logged-in
  χρήστης πρέπει να μπορεί να redeem ένα invite για άλλη διεύθυνσή του)· subtitle προειδοποιεί
  "Accepting will switch your session to this account" όταν το viewer email διαφέρει. Χωρίς invite
  param → η παλιά συμπεριφορά αμετάβλητη byte-for-byte (ίδιο early-redirect, ίδιο AuthForm).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run inviteAccept.test.ts` → **8/8**·
full suite `npx vitest run` → **2555/2555 green** (201 files, +3 files/+37 tests έναντι του #72's
2518 — 8 δικά μου νέα tests + tests άλλων routines που προσγειώθηκαν στο main στο μεταξύ). ΚΑΝΕΝΑ
υπάρχον feature αρχείο δεν αγγίχτηκε (3 νέα αρχεία + 1 rewrite σε δικό μου SaaS-only page, μηδέν
shared component/layout/globals.css). `SAAS_MODE` off / self-hosted = **zero effect** (το `(saas)`
segment self-gates σε `notFound()` πριν φτάσει καν στη νέα λογική· χωρίς `?invite=` το page render
είναι ίδιο με πριν). Κανένας Docker rebuild (2 νέα PURE/client αρχεία + 1 page rewrite, μηδέν
shared runtime wiring, μηδέν νέα εξάρτηση — ίδιο σκεπτικό με τα increments 58-72). Browser-verify
skipped: `docker exec homepage-web printenv SAAS_MODE` → κενό (exit 1) στο live `:3000` container,
άρα η `/signup` σελίδα ήδη 404άρει ανεξαρτήτως `?invite=` (σωστό self-hosted behavior, τίποτα νέο
να δει κανείς)· θα χρειαζόταν rebuild με το flag μόνο-για-verify — απαγορεύεται, ίδιο idiom με τα
#66-72. Collision guard: `git status --short` πριν το staging έδειξε μόνο τα 4 δικά μου αρχεία (1
modified + 3 new), `git diff --cached --name-only` επιβεβαίωσε exact match.

**## Needs Achilleas** (invite accept):
- **`SAAS_MODE=on` + `AUTH_SECRET` (≥16)** για να υπάρχει καν η `(saas)` σελίδα/route (αλλιώς 404).
  Self-hosted = disabled, zero risk.
- Ένα πραγματικό end-to-end test (invite → email link ή dev-token → `/signup?invite=…` → accept →
  landing στο workspace) χρειάζεται live SaaS-mode deployment· δεν είναι testable από εδώ πέρα από
  unit tests + tsc.

**Next task:** increment 74 — candidates: (α) MembersPanel's dev-token echo (όταν δεν υπάρχει
mailer configured) είναι σήμερα plain text "(dev token: xxx)" — θα μπορούσε να γίνει clickable
`inviteAcceptHref(token)` link (το helper υπάρχει ήδη από αυτό το increment) ώστε το local-testing
loop να κλείνει με ένα κλικ αντί για copy-paste· χρειάζεται να αλλάξει το `notice` state από string
σε ReactNode (μικρό αλλά όχι μηδενικό refactor, παραλείφθηκε αυτό το increment για να μείνει
scoped)· (β) τα υπόλοιπα 4 dead-UI routes από τη σημερινή σάρωση (`auth/session`, `workspace/
ai-key`, `workspace/erasure`, `workspace/export`+`workspace/export/files`) — προαιρετικά self-
service settings (BYO AI key, GDPR erasure/export), μικρότερης προτεραιότητας από το onboarding
που μόλις έκλεισε αλλά ακόμα gaps· (γ) η **Usage tab μηδενικά** παραμένει (§#72's carried-over (α),
`recordAiUsage` wiring εκτός του δικού μου territory).

## 2026-07-20 (increment 74 — Workspace data export links, §UI-first)
**Το κενό:** από τη σάρωση του #73, 4 dead-UI routes έμειναν: `auth/session`, `workspace/ai-key`,
`workspace/erasure`, `workspace/export`+`workspace/export/files`. Το `auth/session` δεν χρειάζεται
UI caller (client-side session refresh helper, το `WorkspaceShell`/κάθε σελίδα ήδη διαβάζει το
session server-side μέσω `getSaasViewer()`)· το `ai-key` (BYO AI key, χρειάζεται provider-select
form) και το `erasure` (GDPR right-to-erasure, χρειάζεται confirm+countdown UI για το grace
window) είναι μεγαλύτερα scoped increments. Διάλεξα το `workspace/export`+`workspace/export/files`
πρώτο: 2 ήδη-χτισμένα, ήδη-tested GET routes (content dump JSON + binary-file manifest JSON,
owner/admin only) χωρίς κανένα UI, ενώ το ακριβώς ίδιο μοτίβο (plain authenticated `<a>` download
link) υπάρχει ήδη στο `AccountSettingsPanel`'s "Your data" section (`/api/saas/account/export`,
increment 71) — μηδέν νέο idiom να επινοηθεί, μόνο επανάληψη του ίδιου pattern σε νέο scope.

**Built** (additive edit στο δικό μου `WorkspaceSettingsPanel.tsx`, μηδέν νέο αρχείο):
- Νέο **"Data export"** section ανάμεσα στο "General" και το "Danger zone" — gated στο ήδη-υπάρχον
  `canManage` prop (mirror του routes' `requireManage=true`, το dump περιέχει δεδομένα ΟΛΩΝ των
  μελών άρα δεν είναι self-service για απλό member). Δύο plain `<a href>` downloads (GET, καμία
  client-side mutation state χρειάζεται): "Download workspace data" →
  `/api/saas/workspace/export?tenant=<slug>` (Mongo collections dump) και "Download file manifest"
  → `/api/saas/workspace/export/files?tenant=<slug>` (ποια αρχεία στο δίσκο ανήκουν στο workspace +
  παρόντα/λείπουν + μέγεθος — report-only, δεν packάρει τα binaries, ήδη τεκμηριωμένο στο route's
  docstring). Ίδιο styling idiom με το account-export button. `tenantSlug` prop ήδη υπήρχε στο
  component (χρησιμοποιείται ήδη από τα rename/cancel/reactivate calls) — μηδέν νέο prop threading
  χρειάστηκε στη σελίδα.

**Verified:** `npm run type-check` → **EXIT 0**. Full suite `npx vitest run` → **2581/2581 green**
(202 files — ίδιος αριθμός με το #73's 2555 +23 από routines που προσγειώθηκαν στο μεταξύ, μηδέν
δικά μου νέα tests αφού δεν υπάρχει νέα pure λογική, μόνο JSX/markup). ΚΑΝΕΝΑ υπάρχον feature
αρχείο δεν αγγίχτηκε (1 additive edit σε δικό μου SaaS-only client component, μηδέν shared
component/layout/globals.css). `SAAS_MODE` off / self-hosted = **zero effect** (το section
render-άρεται μόνο μέσα στο ήδη-gated `(saas)` segment). Κανένας Docker rebuild (καθαρό
additive JSX σε ήδη-mounted component, μηδέν shared runtime wiring, μηδέν νέα εξάρτηση — ίδιο
σκεπτικό με τα increments 58-73). Browser-verify skipped: `docker exec homepage-web printenv
SAAS_MODE` → κενό (exit 1) στο live `:3000` container, άρα η settings σελίδα ήδη 404άρει
ανεξαρτήτως του νέου section (σωστό self-hosted behavior, τίποτα νέο να δει κανείς)· θα
χρειαζόταν rebuild με το flag μόνο-για-verify — απαγορεύεται, ίδιο idiom με τα #66-73. Collision
guard: `git status --short` πριν το staging έδειξε αρχικά ΚΑΙ ένα `PRODUCT_BACKLOG.md` modified
(concurrent routine mid-commit) — ΔΕΝ staged/committed τότε, ξανα-έλεγξα λίγο μετά και το αρχείο
είχε ήδη committed από την άλλη routine (`6a38327`, εκτός δικού μου territory) και εξαφανίστηκε
από το `git status`· `git diff --cached --name-only` επιβεβαίωσε exact 1-file match πριν το commit.

**## Needs Achilleas** (workspace data export):
- Τίποτα νέο — καθαρό UI wiring πάνω σε ήδη-εγκεκριμένα, ήδη-tested, read-only backend routes.
  Το ήδη-τεκμηριωμένο "packaging the binaries is a separate, deferred step" (από το `export/files`
  route's docstring) παραμένει ανοιχτό αν ο χρήστης θελήσει ποτέ πραγματικό ZIP-download των
  αρχείων αντί για manifest-only — δεν είναι blocking, χαμηλή προτεραιότητα.

**Next task:** increment 75 — candidates: (α) **BYO AI key UI** (`workspace/ai-key` GET/PUT/DELETE
— provider-select form + masked-key display + clear button, μεγαλύτερο scope από τα exports·
mirrors AccountSettingsPanel's password-change form idiom για το PUT/DELETE state)· (β) **GDPR
erasure self-service UI** (`workspace/erasure` GET/POST/DELETE — schedule/cancel deletion με
grace-days countdown, owner-only danger-zone addition· χρειάζεται προσεκτικό UX ώστε να μην είναι
προφανές/κατά-λάθος-clickable, ίδιο επίπεδο σοβαρότητας με cancel-workspace)· (γ) η **Usage tab
μηδενικά** παραμένει (§#72-74's carried-over, `recordAiUsage` wiring εκτός territory — ίσως ώρα
για ask-inbox entry αν δεν βρεθεί άλλο UI-first κενό στο επόμενο run).

## 2026-07-20 (increment 75 — BYO AI key UI for workspace settings, §UI-first)
**Context:** το work αυτού του increment είχε ήδη ξεκινήσει σε προηγούμενο (interrupted) run —
βρέθηκε uncommitted στο working tree στην αρχή αυτού του run (`page.tsx` modified + 3 νέα αρχεία).
Ήταν candidate (α) του #74's next-task λίστα: `workspace/ai-key` GET/PUT/DELETE route (ήδη
χτισμένο, TODO §11/§14/D5 — BYO AI provider key ώστε τα AI calls του workspace να τρέχουν
unmetered στο δικό του key αντί του platform shared key) χωρίς κανένα UI caller.

**Built** (βρέθηκε ήδη πλήρες, επιβεβαιώθηκε + committed):
- **`components/saas/aiKeySettings.ts`** (νέο, PURE) — `AI_KEY_PROVIDERS` (mirror χειροκίνητα του
  server's `BYO_PROVIDERS`, ΟΧΙ re-export γιατί το server module σέρνει `node:crypto` μέσω
  `lib/tenancy/secretCrypto` που δεν πρέπει να μπει σε client bundle — ίδιο trade-off με το
  `authValidation`'s EMAIL_RE/MIN_PASSWORD mirrors), `aiKeyProviderLabel`, `aiKeySaveReady`
  (mirrors το server's `encodeAiKey` guard: cryptoReady + valid provider + non-blank key),
  `describeAiKeyError` (prefers server-provided error string, fallback ανά status). 11 unit tests.
- **`components/saas/AiKeyPanel.tsx`** (νέο, client) — masked-status display ("Using your own
  {provider} key, ending in {masked}") + provider select + password-type key input + Save/Remove
  (Remove με `window.confirm`) → PUT/DELETE `/api/saas/workspace/ai-key` → `router.refresh()`.
  `canManage`-gated (owner/admin only, mirrors route's `requireManage=true`)· `cryptoReady`-gated
  μήνυμα όταν `AUTH_SECRET` λείπει (503 guard, ίδιο idiom με τα υπόλοιπα secret-dependent panels).
- **`(saas)/account/workspace/settings/page.tsx`** (δικό μου, additive edit) — server-side reads
  `describeTenantAiKey(ctx.tenantId)` + `byoKeyReady()` παράλληλα με το tenant/memberCount fetch,
  wraps το υπάρχον `WorkspaceSettingsPanel` + νέο `AiKeyPanel` σε `space-y-6` div.

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run aiKeySettings.test.ts` → **11/11**·
full suite `npx vitest run` → **2635/2635 green** (206 files). ΚΑΝΕΝΑ υπάρχον feature αρχείο δεν
αγγίχτηκε (3 νέα αρχεία + 1 additive edit σε δικό μου SaaS-only page, μηδέν shared component/
layout/globals.css). `SAAS_MODE` off / self-hosted = **zero effect** (η `(saas)` σελίδα ήδη 404
πριν φτάσει στο νέο panel). Κανένας Docker rebuild (πλήρως additive, μηδέν shared runtime wiring,
μηδέν νέα εξάρτηση). Browser-verify skipped: `docker exec homepage-web printenv SAAS_MODE` → κενό
(exit 1) στο live `:3000` container, ίδιο idiom με τα #66-74. Collision guard: `git status --short`
πριν το staging έδειξε μόνο τα 4 δικά μου αρχεία, `git diff --cached --name-only` επιβεβαίωσε exact
match. Pushed `c9c48a0`.

**## Needs Achilleas:**
- Τίποτα νέο — καθαρό UI wiring πάνω σε ήδη-εγκεκριμένο, ήδη-tested backend route.
- Πραγματικό end-to-end test (save πραγματικό provider key, δες ότι το AI call το χρησιμοποιεί)
  χρειάζεται live SaaS-mode deployment + `AUTH_SECRET` set· δεν είναι testable από εδώ πέρα από
  unit tests + tsc.

**Next task:** increment 76 — candidates: (α) **GDPR erasure self-service UI** (`workspace/
erasure` GET/POST/DELETE — schedule/cancel deletion με grace-days countdown, owner-only
danger-zone addition, ακόμα dead-UI από τη σάρωση του #73)· (β) η **Usage tab μηδενικά**
παραμένει (§#72-75's carried-over, `recordAiUsage` wiring εκτός territory — ίσως ώρα για
ask-inbox entry αν δεν βρεθεί άλλο UI-first κενό στο επόμενο run)· (γ) ξανα-σάρωσε `api/saas/**`
για νέα dead-UI routes (απέδωσε αρκετές φορές σειρά, ίσως πλέον εξαντλημένο πέρα από το erasure).

## 2026-07-20 (increment 76 — GDPR erasure self-service UI, §UI-first)
**Το κενό:** από το #75's next-task λίστα, το `workspace/erasure` (GET/POST/DELETE, GDPR Art. 17
right-to-erasure — schedule/cancel μιας reversible marker για permanent deletion μετά από ένα
30-day grace window, βλ. `lib/tenancy/erasure.ts`) ήταν ήδη πλήρες backend, tested, χωρίς UI.
Μαζί με αυτό, ξανα-σάρωσα ολόκληρο το `api/saas/**` (32 routes) για callers μέσα σε `app/(saas)`,
`app/admin`, `components/saas` — οι μόνες υπόλοιπες 0-hit διαδρομές είναι σκόπιμα χωρίς UI:
`billing/webhook` (Stripe-only), `trials/sweep`+`usage/sample` (cron/internal), `auth/session`
(client-side helper, όχι σελίδα), `workspace/erasure/purge` (η destructive drop, ρητά "manual/
gated flow, ΠΟΤΕ από UI button" στο route's docstring), `admin/overview`+`admin/tenants/[slug]`+
`.../dbstats` (αρχικό grep false-negative — δυναμικά segments, ήδη wired μέσω `TenantActionsPanel`/
`LiveDbStatsPanel`/SSR reader, verified). **Η dead-UI σάρωση θεωρείται πλέον εξαντλημένη.**

**Built:**
- **`components/saas/erasureSettings.ts`** (νέο, PURE) — `describeErasureError` (re-export του
  `describeWorkspaceSettingsError`, όχι duplicate — το erasure route επιστρέφει ίδιου σχήματος
  user-facing `error` strings σε κάθε failure path, ίδιο σκεπτικό με το #74's export links) +
  `describeErasureCountdown(daysLeft)` (μικρή pure formatting: "N days left" / "1 day left" /
  "due for deletion now" / κενό όταν δεν υπάρχει schedule — ξεχωριστά branches ώστε το panel να
  μην ισχυρίζεται λάθος pluralization ή stale "N days" μετά το elapse). 5 unit tests.
- **`components/saas/ErasurePanel.tsx`** (νέο, client) — owner-only "Delete workspace" section,
  sibling του `WorkspaceSettingsPanel`'s cancel/reactivate danger-zone (ξεχωριστό bordered section,
  διαφορετική/σοβαρότερη ενέργεια). `window.confirm(...)` πριν το POST (ίδιο idiom με το
  cancelWorkspace, ΟΧΙ typed-slug confirmation — δεν υπάρχει τέτοιο idiom πουθενά αλλού στο
  codebase, το grace window το κάνει ήδη reversible). POST/DELETE → ενημερώνει το τοπικό
  `ErasureView` state από το response's `erasure` field + `router.refresh()`.
- **`(saas)/account/workspace/settings/page.tsx`** (δικό μου, additive edit) — server-side
  `erasureView(tenant)` πάνω στο ήδη-fetched `tenant` doc (μηδέν επιπλέον query, τα
  `erasureRequestedAt`/`erasureScheduledAt`/`erasureRequestedBy` πεδία υπάρχουν ήδη στο lean doc)
  + `ERASURE_GRACE_DAYS` constant, mount μετά το `AiKeyPanel`.

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run erasureSettings.test.ts` →
**5/5**· full suite `npx vitest run` → **2667/2667 green** (208 files, +5 δικά μου tests). ΚΑΝΕΝΑ
υπάρχον feature αρχείο δεν αγγίχτηκε (3 νέα αρχεία + 1 additive edit σε δικό μου SaaS-only page,
μηδέν shared component/layout/globals.css). `SAAS_MODE` off / self-hosted = **zero effect** (το
`(saas)` segment ήδη 404άρει πριν φτάσει στο νέο panel). Κανένας Docker rebuild (πλήρως additive,
μηδέν shared runtime wiring, μηδέν νέα εξάρτηση, ίδιο σκεπτικό με τα increments 58-75).
Browser-verify skipped: `docker exec homepage-web printenv SAAS_MODE` → κενό (exit 1) στο live
`:3000` container, ίδιο idiom με τα #66-75. Collision guard: `git status --short` πριν το staging
έδειξε μόνο τα 4 δικά μου αρχεία, `git diff --cached --name-only` επιβεβαίωσε exact match. Pushed
`a2e6923`.

**## Needs Achilleas:**
- Τίποτα νέο — καθαρό UI wiring πάνω σε ήδη-εγκεκριμένο, ήδη-tested backend route. Το 30-day
  grace window (`ERASURE_GRACE_DAYS`) παραμένει το ήδη-τεκμηριωμένο placeholder value από το
  `erasure.ts` module (named constant, one-edit αν θελήσει διαφορετικό αριθμό αργότερα).
- Πραγματικό end-to-end test (request → grace countdown → cancel ή actual purge-job drop) χρειάζεται
  live SaaS-mode deployment· δεν είναι testable από εδώ πέρα από unit tests + tsc.

**Next task:** increment 77 — το UI-first backlog πάνω σε ήδη-χτισμένα `api/saas/**` routes
θεωρείται πλέον **εξαντλημένο** (βλ. σάρωση παραπάνω). Candidates: (α) **AI-metering wiring**
(`lib/billing/aiMeter.ts`'s `assertAiQuota`/`meterAiResult` είναι πλήρη, tested, no-op-by-design
για self-hosted/SAAS-off, αλλά ΠΟΤΕ δεν καλούνται από το πραγματικό AI dispatch — `runVisionJSON`/
`runTextJSON` σε `lib/ollama.ts` — άρα το Usage tab δείχνει πάντα μηδέν σε πραγματική χρήση. Αυτό
είναι shared-plumbing edit (`lib/ollama.ts`, ΟΧΙ αμιγώς δικό μου territory) αλλά ρητά additive +
flag-guarded (no-op εγγυημένο από το ίδιο το aiMeter.ts docstring) — επιτρέπεται από τον κανόνα
"additive-only edits to shared plumbing ONLY when strictly needed and flag-guarded". Scoped ως:
2 call sites (πριν/μετά από κάθε provider call) × ~2 συναρτήσεις, καμία αλλαγή στη public API
τους. Χρειάζεται προσοχή γιατί το `lib/ollama.ts` το αγγίζουν συχνά κι άλλες routines — μικρό,
surgical diff, τρέξε ολόκληρο το test suite μετά)· (β) polish pass πάνω στα ήδη-χτισμένα panels
(π.χ. το dev-token echo→clickable link candidate από το #73, ακόμα ανοιχτό, μικρό scope).

## 2026-07-20 (increment 77 — dev-token invite echo → clickable link, §polish)
**Correction πρώτα:** το candidate (α) του #76's next-task ("AI-metering wiring ΠΟΤΕ δεν
καλείται από `runVisionJSON`/`runTextJSON`") ήταν **ήδη λάθος/stale όταν γράφτηκε** — grep σε
`lib/ollama.ts` έδειξε `assertAiQuota`/`meterAiResult` ήδη wired σε 2 call sites, commit
`9cb635e feat(saas): wire AI-metering into the central AI dispatch` (μαζί με tests στο
`0770afb`). Αυτό το commit landάρισε **πολύ νωρίτερα** στο git history (πριν καν τα increments
70+) από άλλη routine/run, και ήδη τεκμηριωμένο νωρίτερα σε αυτό το ίδιο αρχείο (γραμμές ~1572-
1700) — απλά το `next task` copy-paste text στο τέλος του αρχείου δεν είχε ενημερωθεί μετά. Η
"§UI-first backlog εξαντλημένο" σάρωση του #76 παραμένει σωστή. Διάλεξα λοιπόν candidate (β).

**Το κενό:** το `MembersPanel.tsx` (invite + resend) όταν δεν υπάρχει mailer configured (dev/
local, βλ. `/api/saas/invites`+`/api/saas/invites/resend`'s SCAFFOLD notes) echo-άρει το raw
`devToken` ως **plain text** στο notice bar ("(dev token: xxx)") — ο χρήστης έπρεπε copy-paste
το token χειροκίνητα στο `/signup?invite=…` URL. Το `inviteAcceptHref(token)` helper (χτισμένο
από το #73, `components/saas/inviteAccept.ts`, ήδη tested) υπήρχε ήδη ακριβώς γι' αυτό αλλά
ποτέ δεν καλούνταν από το MembersPanel.

**Built** (2 additive/refactor edits σε δικά μου SaaS-only αρχεία, μηδέν νέο αρχείο):
- **`inviteResend.ts`**: το `resendNotice(email, devToken)` (embeds raw token ως text) →
  **`resendNoticeText(email)`** (τοκenless πρόταση μόνο — το token πλέον γίνεται ξεχωριστό link
  element, όχι κομμάτι του string). Tests ξαναγράφτηκαν αντίστοιχα (5→2, αφαιρέθηκαν τα
  token-echo cases που δεν εφαρμόζονται πια σε αυτό το επίπεδο).
- **`MembersPanel.tsx`**: `notice` state `string | null` → **`ReactNode`** (matches το `#73`'s
  προβλεπόμενο refactor). Νέο μικρό presentational helper `devTokenNotice(text, devToken)`
  (inline στο component, JSX-only — το project δεν test-άρει `.tsx`/JSX, μόνο pure `.ts`, ίδιο
  idiom με `AiKeyPanel`/`ErasurePanel`): όταν υπάρχει token, append `<a href={inviteAcceptHref
  (devToken)} target="_blank" rel="noopener noreferrer">Open invite link</a>` (νέο tab σκόπιμα —
  ένα in-place click θα πήγαινε το admin's tab μακριά από τη members σελίδα, και το `/signup`
  accept-flow μπορεί να αλλάξει session αν ο admin προχωρήσει, βλ. increment 73's note). Δύο
  call sites (submitInvite + resendInvite) το χρησιμοποιούν πλέον αντί για raw-text interpolation.

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run inviteResend.test.ts
inviteAccept.test.ts` → **10/10**· full suite `npx vitest run` → **2689/2689 green** (209 files).
ΚΑΝΕΝΑ υπάρχον feature αρχείο δεν αγγίχτηκε (2 τροποποιημένα SaaS-only αρχεία + 1 test file, μηδέν
shared component/layout/globals.css, μηδέν νέα εξάρτηση). `SAAS_MODE` off / self-hosted = **zero
effect** (η `(saas)` σελίδα ήδη 404άρει πριν φτάσει στο MembersPanel). Κανένας Docker rebuild
(καθαρό component refactor, μηδέν shared runtime wiring). Browser-verify skipped: `docker exec
homepage-web printenv SAAS_MODE` → κενό (exit 1) στο live `:3000` container, ίδιο idiom με τα
#66-76. Collision guard: `git status --short` πριν το staging έδειξε μόνο τα 3 δικά μου αρχεία,
`git diff --cached --name-only` επιβεβαίωσε exact match. Pushed `00216c7`.

**## Needs Achilleas:**
- Τίποτα νέο — καθαρό UI polish πάνω σε ήδη-tested helper (`inviteAcceptHref`). Πραγματικό
  end-to-end click-through (πραγματικό invite → dev-token link → accept) χρειάζεται live
  SaaS-mode deployment· δεν είναι testable από εδώ πέρα από unit tests + tsc.

**Next task:** increment 78 — το §UI-first backlog παραμένει εξαντλημένο (βλ. σάρωση #76) και
το AI-metering wiring ήδη γίνεται (βλ. correction παραπάνω). Candidates: (α) η **Usage tab
μηδενικά** (§#72-77's carried-over) — αφού το metering ΕΙΝΑΙ wired (`9cb635e`), ίσως τα μηδενικά
είναι απλά επειδή δεν έχει τρέξει ποτέ πραγματικό AI call σε SaaS-mode tenant (αναμενόμενο, όχι
bug) — αξίζει να επαληθευτεί διαβάζοντας το Usage tab's data-source route πριν υποθέσεις κάτι
σπασμένο· (β) νέα σάρωση για οποιοδήποτε άλλο μικρό UX gap σε ήδη-χτισμένα SaaS panels (π.χ.
error-message clarity, empty-states, loading-states) αφού το route-level backlog έχει εξαντληθεί.

## 2026-07-20 (increment 79 — TOTP + recovery-code core for MFA, §backend-scaffold)
**Correction πρώτα:** το candidate (α) του #78's next-task ("Usage tab μηδενικά") επαληθεύτηκε
οριστικά ΟΧΙ bug: `lib/billing/usage.ts`'s `currentUsage()` επιστρέφει `metered:false` +
zeroed snapshot για το default/self-hosted tenant ΚΑΙ όταν `SAAS_MODE` off (by design, μηδέν DB
access), και τα δύο σχετικά panels (`workspace/page.tsx`, `workspace/usage/page.tsx`) ήδη δείχνουν
ρητό μήνυμα «Metering is inactive for this workspace» σε αυτή την περίπτωση — καμία αλλαγή
χρειάζεται. Μετά επανέλαβα ολόκληρη τη σάρωση candidate (β) («νέο μικρό UX gap σε ήδη-χτισμένα
panels») διαβάζοντας ΟΛΑ τα `components/saas/*.tsx` (ActivityPanel/BillingPanel/MembersPanel/
WorkspaceSettingsPanel/AccountSettingsPanel/TenantActionsPanel/AuthForm/VerifyEmail/
ResetRequestForm) + `app/(saas)/**` + `app/admin/**` πλήρως: loading/busy states, error messages,
empty states, dev-token-link consistency (ήδη ομοιόμορφο παντού μέσω `tokenLink`/
`inviteAcceptHref`), tab/nav parity (`workspaceTabs`↔6 σελίδες, `AdminNav`↔2 σελίδες, όλα exact
match) — **μηδέν νέο gap βρέθηκε**. Το §UI-first backlog + το §polish backlog θεωρούνται πλέον
**και τα δύο εξαντλημένα** μετά από 3 συνεχόμενες σαρώσεις (increments 76-79).

**Το κενό (νέα κατεύθυνση):** `grep -rli "totp\|mfa\b" lib components app models` = **μηδέν hits**
σε όλο το repo. Το TODO.md §9 "Accounts & auth (web-grade)" λέει ρητά "MFA (TOTP + recovery
codes), session management" — αυτό είναι backend feature που δεν υπάρχει καθόλου ακόμα, σε
αντίθεση με τα routes-without-UI που εξαντλήθηκαν. Δεν χρειάζεται Stripe keys/SMTP/pricing
decisions (out of scope per routine's territory) — το TOTP (RFC 6238) είναι τυποποιημένο
πρωτόκολλο, υλοποιήσιμο πλήρως με `node:crypto` μόνο, μηδέν νέα εξάρτηση, μηδέν external
service, άρα ασφαλές να ξεκινήσει τώρα χωρίς ask-inbox entry.

**Scope (σκόπιμα στενό):** ΜΟΝΟ το algorithm/storage-codec core, ως 2 νέα isolated αρχεία.
**ΚΑΝΕΝΑ wiring** σε Account model/route/login flow ακόμα — αυτό αγγίζει shared, security-critical
plumbing (το login route) και είναι ξεχωριστό, πιο ρισκαρισμένο increment μόλις αυτό το core
αποδειχθεί σωστό.

**Built:**
- **`lib/tenancy/totp.ts`** (νέο, PURE, node:crypto μόνο) — `base32Encode`/`base32Decode` (RFC
  4648, unpadded — ό,τι δέχονται Google/Microsoft/Authy/1Password authenticator apps),
  `generateTotpSecret()` (20 τυχαία bytes, RFC 6238 reference length), `totpUri(secret, email,
  issuer)` (otpauth:// URI για QR code, στο label τα ':' strip-άρονται — otpauth reserved
  separator), `hotp()` (RFC 4226 primitive, internal), `generateTotpCode`/`verifyTotpCode`
  (6-digit/30s default, ±1-step clock-drift window, `timingSafeEqual` σύγκριση ανά candidate —
  ίδιο idiom με το `lib/auth.ts`'s `verifyPassword`).
- **`lib/tenancy/recoveryCodes.ts`** (νέο, PURE) — `generateRecoveryCodes(count=10)` ("XXXX-XXXX"
  format, alphabet χωρίς 0/O/1/I/L look-alikes), `hashRecoveryCodes`/`matchRecoveryCode`
  (normalize case/whitespace/dash πριν hash/lookup) — **reuse** του ήδη-υπάρχοντος `lib/auth.ts`
  `hashPassword`/`verifyPassword` (scrypt) αντί νέου KDF, μηδέν νέο crypto surface.
- **27 νέα unit tests** (`totp.test.ts` 18, `recoveryCodes.test.ts` 9) — περιλαμβάνουν τα **5
  επίσημα RFC 6238 Appendix B test vectors** (SHA1, 8-digit, γνωστό secret/time/code triples) ως
  correctness anchor πέρα από self-consistency, + RFC 4648 base32 vectors, + drift/malformed-input/
  timing edge cases. 2 test bugs βρέθηκαν+διορθώθηκαν στο πρώτο run (URL.pathname επιστρέφει
  percent-encoded — το test decode-άρει τώρα· recovery-alphabet ασυνέπεια, το 'L' ήταν ακόμα μέσα
  ενώ το comment/test το ήθελε εκτός — αφαιρέθηκε από το `CODE_ALPHABET`).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run totp.test.ts
recoveryCodes.test.ts` → **27/27**· full suite `npx vitest run` → **2726/2726 green** (212 files,
+37 από το #78's 2689). ΚΑΝΕΝΑ υπάρχον αρχείο δεν αγγίχτηκε (2 νέα lib αρχεία + 2 test αρχεία,
μηδέν model/route/component edit). `SAAS_MODE` on/off = **zero effect και στις δύο περιπτώσεις**
(τα αρχεία δεν εισάγονται από πουθενά ακόμα). Κανένας Docker rebuild (καθαρό νέο pure library
code, μηδέν runtime wiring, μηδέν νέα εξάρτηση). Browser-verify N/A (όχι UI ακόμα). Collision
guard: `git status --short` πριν το staging έδειξε μόνο τα 4 δικά μου νέα αρχεία, `git diff
--cached --name-only` επιβεβαίωσε exact match. Pushed `82cc718`.

**## Needs Achilleas:**
- Τίποτα ακόμα — αμιγώς additive core χωρίς wiring, μηδέν decision-point.

**Next task:** increment 80 — η φυσική συνέχεια είναι το **MFA wiring** σε 3 μικρά βήματα (κάθε
ένα δικό του increment, να μη γίνει ένα μεγάλο risky diff):
(α) **Account model πεδία** (additive edit σε υπάρχον `models/Account.ts`: `mfaSecret` (encrypted
via `secretCrypto.ts`, ίδιο idiom με το BYO AI key), `mfaEnabled: boolean`, `mfaRecoveryHashes:
string[]`) + **enrollment API routes** (`api/saas/account/mfa`: POST generate+preview secret/QR,
POST confirm με πρώτο κωδικό για να ενεργοποιηθεί, DELETE disable) — αμιγώς additive, μηδέν αλλαγή
στο login route ακόμα·
(β) **enrollment UI panel** στο `(saas)/account/settings` (QR code μέσω data-URI, ή απλά δείξε το
`otpauth://` URI + manual-entry secret αν δεν θέλουμε νέο QR-rendering dependency — να αποφασιστεί,
ίσως lightweight inline SVG QR χωρίς εξάρτηση)·
(γ) **login flow wiring** (το πιο ρισκαρισμένο κομμάτι — προσθήκη δεύτερου βήματος στο
`api/saas/auth/login` όταν `mfaEnabled`, session/cookie sequencing) — ΝΑ ΓΙΝΕΙ ΤΕΛΕΥΤΑΙΟ, μόνο
αφού τα (α)+(β) έχουν δοκιμαστεί, και με ιδιαίτερη προσοχή στο πλήρες test suite μετά (αγγίζει
shared auth plumbing).

## 2026-07-20 (increment 80a — MFA enrollment core: Account fields + start/confirm/disable routes)

Συνέχεια του #79's πλάνο (α)+(β)+(γ) σε 3 ξεχωριστά increments. Αυτό είναι το **(α)**: μόνο
data-model + enrollment API routes, **μηδέν wiring στο login flow ακόμα** (αυτό είναι το (γ),
σκόπιμα τελευταίο και ξεχωριστό — αγγίζει shared, security-critical plumbing).

**Σχεδιασμός (mirrors `lib/billing/byoKeyStore.ts` 1:1, ίδιο idiom)**: two-step enrollment
(`mfaPendingSecretEnc` → confirmed `mfaSecretEnc`) ώστε ένα μισοτελειωμένο setup να ΜΗΝ μπορεί
ποτέ να ενεργοποιήσει σιωπηλά MFA σε λογαριασμό — μόνο αφού ο χρήστης αποδείξει ότι το authenticator
app σκάναρε σωστά (πρώτος κωδικός verified) γίνεται `mfaEnabled:true`.

**Built:**
- **`models/Account.ts`** (additive edit): 4 νέα πεδία `mfaEnabled`/`mfaSecretEnc`/
  `mfaPendingSecretEnc`/`mfaRecoveryHashes` (default false/null/null/[]). Zero αλλαγή σε
  υπάρχον πεδίο/index/behavior.
- **`lib/tenancy/mfaStore.ts`** (νέο): 3 PURE `plan*` builders (`planMfaEnrollStart`/
  `planMfaConfirm`/`planMfaDisable`, unit-testable χωρίς DB — ίδιο σχήμα με `planAiKeyUpdate`/
  `planAiKeyClear`) + 4 thin DB wrappers: `beginMfaEnrollment` (generate secret → encrypt via
  `secretCrypto` → store pending → επιστρέφει PLAINTEXT secret+otpauth URI μία φορά),
  `confirmMfaEnrollment` (decrypt pending → `verifyTotpCode` → αν σωστό: generate+hash recovery
  codes → activate, επιστρέφει τα plaintext codes μία φορά), `disableMfa`, `describeMfaStatus`.
- **3 νέα API routes** (SaaS-mode only, `saasAuthGate`+`saasGuard`, λειτουργούν πάνω στο caller's
  own Account session, ίδιο idiom με `account/password`): **`GET/POST/DELETE
  /api/saas/account/mfa`** (status· begin/restart enrollment· disable — το DELETE re-verifies το
  **τρέχον password** πριν σβήσει, ίδιο idiom με το password-change route, ώστε ένα hijacked
  session μόνο του να ΜΗΝ μπορεί να κλείσει το 2ο factor) + **`POST
  /api/saas/account/mfa/confirm`** (πρώτος κωδικός → activate + one-time recovery-code batch).
- **4 νέα unit tests** (`mfaStore.test.ts`) πάνω στους 3 PURE planners — ίδια σύμβαση με το
  `byoKeyStore.test.ts` (μόνο οι planners tested μεμονωμένα, οι DB wrappers μέσω integration/API
  routes αργότερα).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run mfaStore.test.ts totp.test.ts
recoveryCodes.test.ts` → **31/31**· full suite `npx vitest run` → **2753/2753 green** (214
files — η αύξηση από το #79's 2726/212 οφείλεται σε άλλα routines' commits που έχουν μπει στο
μεταξύ, όχι σε regression, `git log` το επιβεβαιώνει). ΚΑΝΕΝΑ υπάρχον feature αρχείο δεν
αγγίχτηκε (1 additive model edit + 4 νέα αρχεία, μηδέν shared component/layout/globals.css,
μηδέν νέα εξάρτηση). `SAAS_MODE` off/self-hosted = **zero effect** (τα νέα routes 404άρουν πριν
φτάσουν οπουδήποτε κοντά σε DB query, `User`/bearer path αναπάφητο). Κανένας Docker rebuild
(καθαρό νέο backend code, μηδέν runtime wiring/env change, μηδέν UI ακόμα ώστε browser-verify
N/A). Collision guard: `git status --short` πριν το staging έδειξε μόνο τα 4 δικά μου αρχεία (+1
edit), `git diff --cached --name-only` επιβεβαίωσε exact match. Pushed `7c90186`.

**## Needs Achilleas:**
- Τίποτα ακόμα — αμιγώς additive core + routes, μηδέν wiring σε ό,τι επηρεάζει live login
  behavior, μηδέν decision-point.

**Next task:** increment 80b — **enrollment UI panel** στο `(saas)/account/settings`
(`AccountSettingsPanel.tsx`, δίπλα στα υπάρχοντα password/export panels): κουμπί "Enable
two-factor" → `POST /api/saas/account/mfa` → δείξε `secret`+`uri` (manual-entry text ΚΑΙ ίσως
lightweight inline SVG QR χωρίς νέα εξάρτηση — να αποφασιστεί στο 80b αν αξίζει τον κόπο ή αν
απλά το manual-entry secret αρκεί για v1) → input για τον πρώτο κωδικό → `POST
/api/saas/account/mfa/confirm` → δείξε τα recovery codes ΜΙΑ φορά (download/copy prompt, δεν θα
ξαναφανούν) → "Disable" flow (password re-entry, `DELETE .../mfa`). Μετά, ΤΕΛΕΥΤΑΙΟ: increment
80c = login-flow wiring (το πιο ρισκαρισμένο, χρειάζεται προσοχή στο session sequencing και στο
recovery-code consumption path — `matchRecoveryCode`'s index-splice contract ήδη υπάρχει, απλά
δεν καλείται ακόμα από πουθενά).

## 2026-07-20 (increment 81 — fix MFA re-enrollment re-auth gap, §security)

**Πηγή:** ο reviewer routine (commit `db4bceb`, ίδια μέρα) διάβασε τα increments 79/80a και
flagged ένα πραγματικό P2/S gap σε `WEB_DEBT.md`: το `DELETE /api/saas/account/mfa` (disable)
σωστά re-verifies το password πριν προχωρήσει, αλλά το `POST /api/saas/account/mfa` (begin/
restart enrollment) δεν απαιτούσε τίποτα πέρα από valid session, ΑΚΟΜΑ κι όταν το MFA ήταν ήδη
ενεργό — ασύμμετρο με το disable path. Failure scenario: hijacked session σε λογαριασμό με ήδη
ενεργό MFA θα μπορούσε να ξεκινήσει νέο enrollment, το επιβεβαιώσει με δικό του authenticator
app, και αντικαταστήσει σιωπηλά το factor του θύματος. Χαμηλή πρακτική έκθεση σήμερα (το MFA δεν
είναι ακόμα wired στο login, το 80c είναι μεταγενέστερο) αλλά σωστό να διορθωθεί πριν το wiring
ώστε το API contract να είναι ήδη σωστό. Αυτό είναι squarely στο δικό μου territory (αρχεία που
έχτισα στο 80a) και είναι μικρό, additive, χωρίς decision-point — προχώρησα χωρίς ask-inbox entry,
πριν το προγραμματισμένο 80b (UI panel), γιατί ένα flagged security gap στα δικά μου αρχεία
προηγείται από UI polish.

**Fix (mirrors το DELETE handler's idiom 1:1):**
- **`lib/tenancy/mfaStore.ts`**: νέα PURE `mfaEnrollRequiresReauth(mfaEnabled: boolean): boolean`
  (= `return mfaEnabled` — τετριμμένο σαν λογική, αλλά named+exported+tested ώστε το decision να
  ζει σε ένα σημείο, ίδια σύμβαση με τα υπόλοιπα `plan*` builders του ίδιου αρχείου).
- **`mfa/route.ts`'s `POST`**: πλέον κάνει `Account.findById(...).select('_id passwordHash
  mfaEnabled')` πρώτα (πριν ήταν session-only). Όταν `mfaEnrollRequiresReauth(account.mfaEnabled)`
  γυρνά `true` → απαιτεί `password` στο body + `verifyPassword` (401 αν λείπει/λάθος), ΠΡΙΝ καλέσει
  `beginMfaEnrollment`. Πρώτο enrollment (`mfaEnabled===false`) παραμένει password-less,
  αμετάβλητο — δεν υπάρχει τίποτα να προστατευτεί ακόμα σε αυτή την περίπτωση. Doc-comment στην
  κορυφή του αρχείου ενημερώθηκε να περιγράφει το νέο conditional `password?` στο POST.
- **`.../mfa/confirm/route.ts`**: **καμία αλλαγή** — επιβεβαιώθηκε ότι δεν χρειάζεται δικό του
  re-auth, όπως προέβλεπε το debt item's fix note: δεν μπορεί να ενεργοποιηθεί χωρίς προηγούμενο
  re-authed `begin` που να έχει γράψει νέο `mfaPendingSecretEnc` πρώτα (η two-step ροή είναι ήδη
  το guard).
- **`mfaStore.test.ts`**: 2 νέα tests πάνω στο pure decision function (`true`/`false` cases).
  Route-level test (`mfaEnabled:true` + POST χωρίς password → 401 κλπ, όπως πρότεινε το debt item)
  παραλήφθηκε σκόπιμα — **κανένα route κάτω από `api/saas/**` δεν έχει ακόμα DB-mocked test
  harness σε όλο το repo** (το `mfaStore.test.ts`'s ίδιο το header comment το λέει: "the DB-
  touching wrappers ... are exercised via the API routes / integration", δηλαδή manual/future,
  όχι automated ακόμα εδώ) — η pure-function-test σύμβαση είναι η established μέθοδος αυτού του
  module, δεν εφηύρα νέο pattern.

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run mfaStore.test.ts totp.test.ts
recoveryCodes.test.ts` → **33/33**· full suite `npx vitest run` → **2789/2789 green** (215
files). ΚΑΝΕΝΑ shared component/layout/globals.css/νέα εξάρτηση. `SAAS_MODE` off/self-hosted =
**zero effect** (το route ήδη 404άρει πριν φτάσει σε αυτόν τον κώδικα). Κανένας Docker rebuild
(pure backend logic, μηδέν runtime wiring/env change, μηδέν UI ακόμα ώστε browser-verify N/A,
ίδιο idiom με τα #79-80a). Collision guard: `git status --short` πριν το staging έδειξε μόνο τα
δικά μου 4 αρχεία (2 code + 1 test + `WEB_DEBT.md`), `git diff --cached --name-only` επιβεβαίωσε
exact match.

**WEB_DEBT.md**: το P2/S item flipped TODO → **DONE** με πλήρη περιγραφή του fix.

**## Needs Achilleas:**
- Τίποτα νέο.

**Next task:** increment 82 = το προγραμματισμένο **80b** (τώρα μετονομάζεται λόγω του
security-fix interrupt) — **enrollment UI panel** στο `(saas)/account/settings`
(`AccountSettingsPanel.tsx`): κουμπί "Enable two-factor" → `POST /api/saas/account/mfa` (σημείωσε
το νέο conditional `password` πεδίο όταν ήδη ενεργό — restart-enrollment UI θα χρειαστεί password
input όταν `mfaEnabled` ήδη true) → δείξε `secret`+`uri` (manual-entry text ΚΑΙ ίσως lightweight
inline SVG QR χωρίς νέα εξάρτηση) → input για πρώτο κωδικό → `POST .../mfa/confirm` → δείξε τα
recovery codes ΜΙΑ φορά → "Disable" flow (password re-entry, `DELETE .../mfa`). Μετά, ΤΕΛΕΥΤΑΙΟ:
increment 80c = login-flow wiring.

## 2026-07-20 (increment 82 — MFA enrollment UI panel: AccountSettingsPanel.tsx)

Συνέχεια του #79/80a/81 πλάνου — αυτό είναι το **(β)** (enrollment UI), το τελευταίο πριν το
πιο ρισκαρισμένο (γ) = login-flow wiring (80c). Καταναλώνει τα ήδη-χτισμένα routes (`GET/POST/
DELETE /api/saas/account/mfa` + `POST .../mfa/confirm`) που μέχρι τώρα δεν είχαν καμία UI.

**Built:**
- **`components/saas/mfaSettings.ts`** (νέο, PURE + client-safe, ίδιο idiom με
  `accountSettings.ts`): `mfaCodeReady(code)` (ακριβώς 6 ψηφία, trimmed — καθρεφτίζει το
  `totp.ts`'s digit-count check), `mfaPasswordReady(password)` (non-blank gate), `describeMfaError
  (status, serverError)` (μεταφράζει τα reason-code strings του `mfaStore.ts` σε φιλικό κείμενο:
  `invalid_code`/`no_pending`/`crypto_unavailable`/`not_found`/`Invalid credentials`/`password is
  required`).
- **`AccountSettingsPanel.tsx`** (additive edit): νέο section «**Two-factor authentication**»
  ανάμεσα σε Password και Your-data, δικό του state machine (`MfaStage`: idle → enrolling →
  recovery-codes, + need-password-to-start/need-password-to-disable). Ροές:
  - **Enable** (πρώτη φορά, `mfaEnabled=false`): κλικ → `POST /api/saas/account/mfa` χωρίς
    password (ο server δεν το απαιτεί σε πρώτη εγγραφή, βλ. increment 81's
    `mfaEnrollRequiresReauth`) → δείχνει **manual-entry secret** (select-all monospace box) + το
    πλήρες `otpauth://` URI ως κείμενο (ΧΩΡΙΣ QR-rendering — αποφασίστηκε να παραλειφθεί σε αυτό
    το increment, βλ. Needs Achilleas) → input 6-ψήφιου κωδικού → `POST .../mfa/confirm` → αν ΟΚ:
    δείχνει τα **recovery codes ΜΙΑ φορά** (gold warning box + grid μονόχωρων codes,
    `select-all`) με κουμπί «I've saved these codes» που κλείνει τη ροή.
  - **Replace authenticator app** (`mfaEnabled=true`, restart enrollment): κλικ → πρώτα ζητά
    **password** (mirrors `mfaEnrollRequiresReauth===true`) → `POST .../mfa {password}` → ίδια
    enrolling/confirm/recovery-codes ροή όπως πάνω.
  - **Disable**: κλικ → password prompt → `DELETE .../mfa {password}` → enabled=false, notice.
  - Κάθε βήμα έχει «Cancel» (επιστρέφει σε idle, καθαρίζει state — το server-side pending secret
    ΜΕΝΕΙ μέχρι νέο enrollment/confirm/disable, δεν είναι ενεργό οπότε δεν πειράζει).
- **`(saas)/account/settings/page.tsx`** (additive edit): select επεκτάθηκε με `mfaEnabled` +
  νέο prop `mfaCryptoReady={secretCryptoReady()}` (server-side, sync, από
  `lib/tenancy/secretCrypto.ts` — ήδη pure/no-DB) περνιέται στο panel. Όταν `!mfaCryptoReady`
  (λείπει `AUTH_SECRET`) το section δείχνει static μήνυμα «not available on this server yet»
  αντί για buttons που θα αποτύχουν.
- **`mfaSettings.test.ts`** (νέο, 10 tests): πάνω στους 3 pure helpers.

**Απόφαση (μη ζητήθηκε ρητά, μικρή/reversible — δεν μπήκε στο ask-inbox)**: **καμία QR-code
rendering σε αυτό το increment.** Το manual-entry secret + το πλήρες `otpauth://` URI ως
selectable κείμενο καλύπτουν λειτουργικά το v1 (πολλά authenticator apps δέχονται paste του URI
ή manual secret entry) χωρίς νέα εξάρτηση ή δικό μου QR-generation code. Αν το Achilleas το
θεωρήσει must-have, είναι μικρό follow-up increment (π.χ. lightweight inline SVG QR, καμία lib).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run mfaSettings.test.ts
accountSettings.test.ts mfaStore.test.ts` → **32/32**· full suite `npx vitest run` → **2845/2845
green** (219 files). Κανένα shared component/layout/globals.css αγγίχτηκε, μηδέν νέα εξάρτηση.
`SAAS_MODE` off/self-hosted = **zero effect** (το `(saas)` layout 404άρει όλο το segment πριν
φτάσει στο panel· επιβεβαιώθηκε ότι ο τρέχων Docker container του Achilleas ΔΕΝ έχει `SAAS_MODE`
set, άρα η σελίδα θα 404άρει ούτως ή άλλως εκεί). **Docker: ΔΕΝ έγινε rebuild** — καθαρό UI-layer
πάνω σε ήδη-existing routes, μηδέν runtime wiring/env/dependency change, οπότε εκτός σκοπής για
αυτό το run (βλ. οδηγία §3: rebuild μόνο όταν άλλαξε runtime wiring). **Browser-verify: skipped**
για τον ίδιο λόγο — ο ζωντανός container τρέχει παλιότερο bundle χωρίς αυτές τις αλλαγές
(rebuild θα ήταν εκτός σκοπής μόνο-για-verify) ΚΑΙ `SAAS_MODE` είναι off σε αυτή την
εγκατάσταση, οπότε η σελίδα θα 404άρει ακόμα κι αν γινόταν rebuild. Collision guard: `git status
--short` πριν το staging έδειξε μόνο τα 4 δικά μου αρχεία (καθαρό από τα ταυτόχρονα mobile-
routine αρχεία που ήταν στο working tree νωρίτερα στη μέρα — committed από εκείνη τη routine στο
μεταξύ), `git diff --cached --name-only` επιβεβαίωσε exact match.

**## Needs Achilleas:**
- Αξίζει ένα scannable **QR code** στο enrollment step (αντί μόνο manual-entry secret/URI); αν
  ναι, lightweight inline SVG QR generator (καμία νέα εξάρτηση) είναι μικρό follow-up.
- Timing του **increment 80c** (login-flow wiring): το πιο ρισκαρισμένο κομμάτι ακόμα — θέλει
  ιδιαίτερη προσοχή στο session sequencing (interim "MFA-pending" state πριν την πλήρη σύνδεση)
  και recovery-code consumption path. Θα προχωρήσω μόνο του σε επόμενο run, με προσοχή, εκτός αν
  προτιμάς να το κάνω πιο σταδιακά/να το ελέγξεις πρώτα.

**Next task:** increment 83 = **80c, login-flow wiring** — το `POST /api/saas/auth/login`
χρειάζεται δεύτερο βήμα όταν `Account.mfaEnabled`: αντί για άμεσο session cookie, επιστρέφει ένα
προσωρινό "MFA required" state (π.χ. short-lived signed token/cookie που ταυτοποιεί ΠΟΙΟΝ
λογαριασμό, ΧΩΡΙΣ ακόμα να δίνει πρόσβαση) → νέο route/βήμα που δέχεται TOTP code Ή recovery
code (`matchRecoveryCode`'s ήδη-έτοιμο index-splice contract, ΑΚΟΜΑ δεν καλείται από πουθενά) →
μόνο τότε εκδίδεται το πραγματικό session cookie. Login UI (`(saas)/account/login/page.tsx`)
χρειάζεται δικό του δεύτερο βήμα/state. Ιδιαίτερη προσοχή στο πλήρες test suite μετά (αγγίζει
shared, security-critical auth plumbing) + στο recovery-code consumption (πρέπει να το βγάζει
από τη λίστα ώστε να μη χρησιμοποιηθεί ξανά — `matchRecoveryCode` splice contract).

## 2026-07-21 (increment 83 — 80c, MFA login-flow wiring)

Το τελευταίο κομμάτι του πλάνου #79/80a/81/82: το `Account.mfaEnabled` επιτέλους **κάνει
κάτι** στο login — μέχρι τώρα η ενεργοποίηση MFA στο settings panel ήταν αποθηκευτικό only,
το login δούλευε ίδιο. Το πιο ρισκαρισμένο increment της σειράς (αγγίζει shared login
plumbing) — προχώρησα προσεκτικά, με πλήρες test-suite run στο τέλος όπως προειδοποίησε το
προηγούμενο log entry.

**Design (νέο pending-session state, δεν αγγίζει το υπάρχον `pharos_account` cookie)**:
- **`lib/tenancy/accountSession.ts`**: νέο `MFA_PENDING_COOKIE` (`pharos_account_mfa_pending`,
  ΞΕΧΩΡΙΣΤΟ όνομα από το real session cookie) + `signMfaPendingToken`/`verifyMfaPendingToken`
  (jose, ίδιο idiom με το υπάρχον sign/verifyAccountSession) + `set/clear/getMfaPendingAccountId`.
  Ο token κουβαλάει ΜΟΝΟ το account id (όχι email/tenant) + ένα `typ:'mfa_pending'` claim ώστε
  να είναι δομικά διακριτό από ένα πραγματικό session token ακόμα κι αν κάποιο route το
  διάβαζε λάθος — δεν είναι απλά διαφορετικό cookie name, είναι διαφορετικό-looking token.
  Δικό του knob `SAAS_MFA_PENDING_MINUTES` (default 5, clamp 1-60) — μικρό παράθυρο, μόνο όσο
  ο χρήστης πληκτρολογεί τον κωδικό.
- **`lib/tenancy/mfaStore.ts`**: νέο `verifyMfaLogin(accountId, code)` — δοκιμάζει πρώτα TOTP
  (decrypt `mfaSecretEnc` + `verifyTotpCode`), μετά recovery code (`matchRecoveryCode` πάνω στα
  `mfaRecoveryHashes` — αν matchάρει, **splice + persist immediately** ώστε να μην μπορεί να
  ξαναχρησιμοποιηθεί, ακριβώς το single-use contract που ανέφερε το προηγούμενο log entry σαν
  "ακόμα δεν καλείται από πουθενά"). Reason codes: `invalid_code`/`not_enabled`
  (edge case: MFA απενεργοποιήθηκε ανάμεσα σε login-step1 και step2)/`crypto_unavailable`/
  `not_found`.
- **`api/saas/auth/login/route.ts`**: όταν `account.mfaEnabled` → ΔΕΝ βάζει το real cookie,
  βάζει το pending cookie, γυρνά `{mfaRequired:true}` (το `lastLoginAt` stamp μετακινήθηκε να
  γίνεται ΜΟΝΟ όταν το login ολοκληρωθεί πραγματικά — είτε εδώ όταν MFA off, είτε στο νέο route
  από κάτω όταν MFA on).
- **Νέο `api/saas/auth/mfa/route.ts`** (ξεχωριστό από το ήδη υπάρχον `api/saas/account/mfa`
  route — εκείνο είναι enrollment/settings πάνω σε ενεργό session, αυτό είναι login step-2 πάνω
  σε pending cookie, καμία επικάλυψη): **POST `{code}`** → `getMfaPendingAccountId()` (401
  `no_pending_login` αν λείπει/έληξε) → `verifyMfaLogin` → επιτυχία: clear pending cookie +
  `setAccountCookie` (πραγματικό session) + stamp `lastLoginAt` + γυρνά **το ίδιο shape** με
  το no-MFA login (`{account, tenants}` + `usedRecoveryCode`) ώστε ο client να μην χρειάζεται
  τρίτο code path. **DELETE** (χωρίς body) → clear pending cookie, "use a different account".
- **UI (`components/saas/AuthForm.tsx`)**: login response `{mfaRequired:true}` → swap σε
  δεύτερο βήμα (code input, `autoComplete="one-time-code"`, δέχεται TOTP ή recovery code) →
  POST στο νέο route → success = ίδιο `window.location.assign(target)` με πριν. "Use a
  different account" link καλεί το DELETE και γυρνά στο credentials step. Signup mode
  ανεπηρέαστο (δεν επιστρέφει ποτέ `mfaRequired`).
- **`components/saas/mfaSettings.ts`**: νέο `mfaLoginCodeReady(code)` (>=6 σημαντικοί χαρακτήρες
  μετά strip whitespace/dashes — δέχεται ΚΑΙ 6-digit TOTP ΚΑΙ 8-char recovery code, σε αντίθεση
  με το υπάρχον `mfaCodeReady` που είναι στενά 6-digit-only για το enrollment flow) + 3 νέα
  reason codes στο `describeMfaError`'s known map (`no_pending_login`/`not_enabled`/
  `code is required`).

**Tests (νέα)**: **`lib/tenancy/accountSession.test.ts`** (νέο αρχείο — το accountSession.ts
δεν είχε ΚΑΝΕΝΑ test μέχρι τώρα· κάλυψα ΚΑΙ τις ήδη-υπάρχουσες sign/verifyAccountSession ΚΑΙ τις
νέες pending-token functions, ίδιο idiom με `lib/session.test.ts` — foreign-secret/expired/
no-subject/garbage-token cases, + ένα specific test ότι ένα πραγματικό account-session token
ΔΕΝ γίνεται δεκτό από τον pending-token verifier λόγω του `typ` claim mismatch). `verifyMfaLogin`
ΔΕΝ unit-testάρεται (DB-touching, ίδια σύμβαση με beginMfaEnrollment/confirmMfaEnrollment/
disableMfa — "εξετάζονται via τα routes/integration" όπως λέει το ίδιο το mfaStore.ts's header
comment). `mfaSettings.test.ts` +5 tests για το νέο helper+error codes.

**Verified**: `npm run type-check` → **EXIT 0**. `npx vitest run` (πλήρες suite) → **2883/2883
green** (221 files, ήταν 2845 πριν — +38 από τα νέα tests). Κανένα shared component/layout/
globals.css αγγίχτηκε, μηδέν νέα εξάρτηση. `SAAS_MODE` off/self-hosted = **zero effect** (το
login route ήδη ίδιο πριν, ο νέος κλάδος μόνο πυροδοτείται όταν `account.mfaEnabled` που δεν
υπάρχει καθόλου στο self-hosted `User` model). **Docker: ΔΕΝ έγινε rebuild** — καμία αλλαγή σε
runtime wiring/env/dependency, και ο live container του Achilleas τρέχει χωρίς `SAAS_MODE` set
ούτως ή άλλως (ίδιο σκεπτικό με το increment 82's log entry). **Browser-verify: skipped** για
τον ίδιο λόγο (θα 404άρει). Collision guard: `git status --short` πριν το staging έδειξε
`apps/landing/app/page.tsx` modified από άλλη ταυτόχρονη routine (landing) — ΔΕΝ το άγγιξα,
stage-άρησα ρητά μόνο τα 8 δικά μου αρχεία, `git diff --cached --name-only` επιβεβαίωσε exact
match.

**## Needs Achilleas:**
- Τίποτα νέο — το MFA feature (TODO §9's "MFA (TOTP + recovery codes)") είναι πλέον **πλήρως
  end-to-end**: enrollment (82) + login enforcement (83). Instructive follow-ups αν θέλεις:
  (α) rate-limiting στο login-step-2 (σήμερα δεν υπάρχει brute-force throttle πάνω στον
  6-digit κωδικό πέρα από το ίδιο το `verifyTotpCode`'s ±30s window — μικρό, θα ήθελε δική του
  απόφαση σχεδίασης/κόστους), (β) το QR-code follow-up που ανέφερε το 82.

**Next task:** το MFA πλάνο έκλεισε. Επόμενο increment: γύρισμα σε ένα νέο §9/§10/§11/§12 item
από το TODO.md (AI metering ή billing/plans, ανάλογα με τι λείπει ακόμα — δες TODO.md #5-#12 στο
επόμενο run) ΚΑΙ, σύμφωνα με το priority-guidance (UI πρώτα), σκέψου αν κάποιο ήδη-χτισμένο
read-only control-plane API (admin ή account) λείπει ακόμα από ένα UI panel πριν προσθέσεις νέο
backend surface.

## 2026-07-24 (increment 84 — SaaS auth/mfa rate-limit fix, P1 web-debt item)

Πριν από νέο UI increment, διάβασα το ask-inbox (τίποτα addressed σε saas-core) και το
`WEB_DEBT.md` — ο web-code-quality auditor είχε ανοίξει (57η σάρωση, `db9af7c`) ένα **P1/S**,
πλήρως-specified, auto-buildable item ακριβώς στο δικό μου territory (`api/saas/auth/*`):
το `POST /api/saas/auth/login` και το ολοκαίνουριο (increment 83) `POST /api/saas/auth/mfa`
δεν καλούσαν πουθενά το ήδη-shipped `rateLimit()` helper (`lib/apiAuth.ts`, ήδη wired στο v1
login) — η MFA-verify δεύτερη γραμμή άμυνας ήταν πρακτικά brute-forceable (6-digit TOTP ή
8-char recovery code, μόνο 5-min pending-cookie TTL ως όριο). Το priority-guidance λέει "UI
πρώτα", αλλά ένα well-specified P1 security gap στο ίδιο μου το feature (MFA, που μόλις έχτισα
στα increments 79-83) βγαίνει μπροστά.

**Fix (ακριβώς όπως speced το item):**
- **`lib/apiAuth.ts`**: νέο exported `clientIp(req)` (best-effort proxy-header IP, extracted
  από το v1 login route — dedup όπως πρότεινε το item ως optional).
- **`api/v1/auth/login/route.ts`**: εισάγει το shared `clientIp` αντί για local copy (καμία
  behavior αλλαγή).
- **`api/saas/auth/login/route.ts`**: `rateLimit(\`saas-login:${clientIp(req)}\`)` ως πρώτη
  γραμμή μέσα στο `saasGuard` closure, πριν το `saasAuthGate()`/DB.
- **`api/saas/auth/mfa/route.ts`** (POST): `rateLimit(\`saas-mfa:${accountId}\`)` αμέσως μετά
  το `getMfaPendingAccountId()` (account-id keyed, ΟΧΙ IP — ο πραγματικός σπάνιος πόρος σε
  brute force είναι το account, IP-keying θα άφηνε distributed guessing ανοιχτό), πριν το
  `connectDB()`/`verifyMfaLogin`. Over-limit → το ίδιο `NextResponse` (429 + `Retry-After`/
  `X-RateLimit-*`) που ήδη φτιάχνει το helper, μηδέν custom shape.

Config-gated off by default (`API_RATE_LIMIT` unset) — μηδέν behavior αλλαγή κάτω από το όριο,
το self-hosted single-user Pharos του Αχιλλέα ανεπηρέαστο (SAAS_MODE off ούτως ή άλλως).

**Verified:** `grep -rn "rateLimit" apps/web/src/app/api/saas/auth/` → 2 hits (login+mfa).
`npm run type-check` → **EXIT 0**. `npx vitest run` (πλήρες suite) → **2903/2903 green**
(223 files, `apiRateLimit.test.ts` αμετάβλητο 12/12). Κανένα shared component/layout/UI
αγγίχτηκε, μηδέν νέα εξάρτηση. **Docker: ΔΕΝ έγινε rebuild** (καμία αλλαγή σε runtime
wiring/env/dependency — backend logic-only edit μέσα σε ήδη-existing routes). **Browser-
verify: skipped** (backend-only, μηδέν UI, ο live container δεν έχει SAAS_MODE set ούτως ή
άλλως). Collision guard: `git status --short` πριν το staging έδειξε ΜΟΝΟ τα 4 δικά μου
αρχεία (καθαρό working tree στην αρχή του run), `git diff --cached --name-only` επιβεβαίωσε
exact match. `WEB_DEBT.md`'s item ενημερώθηκε TODO → DONE με το ίδιο verification detail.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** γύρισμα στο UI-first priority-guidance — έλεγξε ξανά αν κάποιο ήδη-χτισμένο
read-only control-plane API (admin ή account) λείπει ακόμα από ένα UI panel πριν προσθέσεις
νέο backend surface (βλ. προηγούμενο log entry's "next task" note, ίδιο ερώτημα ακόμα ανοιχτό).

## 2026-07-24 (cont. — increment 85, 3× guardless DB-touching route fix, P2 web-debt)

Πριν από νέο UI-first increment (το ερώτημα του προηγούμενου entry παρέμεινε ανοιχτό), έλεγξα
το ask-inbox (τίποτα addressed σε saas-core) και το `WEB_DEBT.md` — 3 πλήρως-specified,
auto-buildable **P2/S** items βρίσκονταν ακόμα ανοιχτά, ακριβώς στο δικό μου territory
(`api/saas/**`), confirmed αμετάβλητα σε 4-5 διαδοχικές σαρώσεις (2026-07-09 → 2026-07-20)
χωρίς κανένας builder να τα καταναλώσει. Ίδιο σκεπτικό με το increment 84: ένα well-specified
security/robustness gap στο δικό μου territory βγαίνει μπροστά από ένα νέο UI panel.

**Πρόβλημα (και στα 3):** DB-touching handlers μετά το gate ladder τους χωρίς try/catch → ένα
mid-handler throw (Mongo failover/net blip) έβγαινε ως Next default **HTML 500** αντί για το
uniform `{ error }` JSON shape που έχει κάθε άλλο SaaS route (το ίδιο pattern που το `saasGuard`
helper λύνει αλλού, αλλά αυτά τα 3 δεν μπορούν να χρησιμοποιήσουν το `saasGuard` γιατί δεν έχουν
το standard workspace-session ladder — χρειάζονταν plain try/catch).

**Fix (μηχανικό, exactly-as-speced από το WEB_DEBT.md, μηδέν αλλαγή σε συμπεριφορά/gates):**
- **`api/saas/invites/accept/route.ts`**: το σώμα μετά το `connectDB()` (invite lookup+410,
  account resolve/create [το προϋπάρχον nested create-race try/catch έμεινε ακριβώς ως έχει],
  membership upsert, invite-consume, audit, cookie, response) → top-level try/catch.
- **`api/saas/audit/route.ts`** (GET): το σώμα μετά το `resolveWorkspaceSession` gate (cursor/
  limit parsing, `AuditEvent.find`, batched actor `Account.find`, response) → try/catch.
- **`api/saas/workspace/erasure/purge/route.ts`** (POST, cron): `await runErasurePurgeScan()`
  (μετά το CRON_SECRET/token gate) → try/catch.

Και τα 3 gate ladders (404 SAAS off / 401-403 auth / 400-410 validation / 401 bad cron token)
ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν· αλλάζει ΜΟΝΟ ο unexpected throw → καθαρό `{ error }` 500.

**Verified**: `grep -c 'try {'` → invites/accept **2** (create-race + νέο top-level), audit **1**,
erasure/purge **1** (όλα matching το acceptance criterion του κάθε item). `npm run type-check`
→ **EXIT 0**. Πλήρες `npx vitest run` → **226 files / 2936 tests green** (καμία αλλαγή σε
test-count, logic-only edit). `WEB_DEBT.md`'s 3 items ενημερώθηκαν TODO → DONE με το ίδιο
verification detail. **Docker: ΔΕΝ έγινε rebuild** (logic-only edits μέσα σε ήδη-existing
routes, καμία αλλαγή σε runtime wiring/env/dependency· ο live container του Achilleas δεν έχει
`SAAS_MODE` set ούτως ή άλλως). **Browser-verify: skipped** (backend-only, μηδέν UI, ίδιο
σκεπτικό με το increment 84). Collision guard: `git status --short` πριν το staging έδειξε
ΜΟΝΟ τα 4 δικά μου αρχεία (καθαρό working tree στην αρχή του run), `git diff --cached
--name-only` επιβεβαίωσε exact match.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** το UI-first ερώτημα (γύρισε σε ένα ήδη-χτισμένο read-only control-plane API
που λείπει από UI panel) έλεγχθηκε αυτό το run — γρήγορη επισκόπηση όλων των `(saas)/**`,
`admin/**`, και `components/saas/**` δείχνει ότι **κάθε** υπάρχον `api/saas/*` route (account,
workspace, members, invites, billing, admin/tenants, admin/overview, activity/audit, ai-key,
erasure, usage, dbstats) έχει ήδη κάποιο consuming UI panel (grep `api/saas` σε κάθε
`components/saas/*.tsx` επιβεβαίωσε 1-προς-1 mapping· μόνο τα 2 cron endpoints `usage/sample`+
`trials/sweep` δεν έχουν UI, σωστά — scheduler-only, δεν χρειάζονται). Άρα το UI-first backlog
από τα ήδη-built read APIs έχει **εξαντληθεί**. Επόμενο increment: γύρισμα στο TODO.md §10-§14
(π.χ. Stripe live-wiring scaffold πέρα από checkout/portal/webhook stubs, ή audit-log
rate-limiting follow-up που ανέφερε το increment 84's Needs-Achilleas) — ή, αν προκύψει νέο
well-specified item στο `WEB_DEBT.md` μέσα στο δικό μου territory σε επόμενη σάρωση, αυτό πρώτα.

## 2026-07-24 (cont. — increment 86, getTenantConnection cache-reuse guard fix, P3 decision-flag item)

Πριν από νέο increment, διάβασα το ask-inbox (τίποτα addressed σε saas-core) και το
`WEB_DEBT.md` (57η σάρωση, 2026-07-22, ακόμα το πιο πρόσφατο) — το UI-first backlog παραμένει
εξαντλημένο (βλ. προηγούμενο log entry), και τα δύο P1/P2 items του τελευταίου scan στο δικό
μου territory ήταν ήδη DONE (increments 84-85). Το μόνο εναπομείναν item στο δικό μου
territory ήταν το standing **P3/S decision-flag `getTenantConnection cache-reuse guard`**
(`lib/tenancy/connection.ts`) — flagged από 2026-07-01, σε πολλαπλές σαρώσεις, πάντα σαν
«dead-until-SaaS, 0 importers, θέλει σκόπιμη απόφαση όχι μηχανικό swap».

**Γιατί το ανέλαβα τώρα**: επαλήθευσα ξανά με `grep` και **δεν είναι πια 0 importers** —
`tenantDb()` (που καλεί το `getTenantConnection`) έχει τώρα **3 πραγματικούς καλούντες**
(`lib/tenancy/workspaceFiles.ts`, `lib/tenancy/workspaceExport.ts`, `lib/billing/dbStats.ts`
— workspace export/erasure files + db-stats metering, όλα ήδη shipped SaaS-mode features).
Η stale WEB_DEBT.md παρατήρηση «0 importers» δεν ίσχυε πια, οπότε το bug αξίζει πλέον
πραγματικό fix (ακόμα gated πίσω από `SAAS_MODE` off = μηδέν επίδραση στο self-hosted app
σήμερα). Η ίδια η απόφαση που το item ζητούσε («reuse μόνο readyState 1 connected ή 2
connecting, αλλιώς rebuild») ήταν ήδη η προτεινόμενη λύση μέσα στο ίδιο το item — μηχανικό
fix πάνω σε ήδη-speced εναλλακτική, όχι νέα αρχιτεκτονική απόφαση, οπότε το έκανα ο ίδιος
αντί να ανοίξω νέο ask-inbox entry.

**Fix**: `connection.ts`'s `getTenantConnection` guard `existing.readyState !== 99` (δεχόταν
0=disconnected και 3=disconnecting ως «ακόμα ζωντανό») → **`existing.readyState === 1 ||
existing.readyState === 2`** (reuse ΜΟΝΟ connected ή connecting — Mongoose buffers commands
σε «connecting» οπότε είναι ακόμα usable handle· disconnected/disconnecting/uninitialized
πάντα rebuild). Σχόλιο ευθυγραμμίστηκε με το πραγματικό behavior.

**Νέα tests** (`connection.test.ts`, δεν υπήρχε καθόλου κάλυψη πάνω στο guard πριν): νέο
describe block «getTenantConnection — cache reuse guard» (8 tests) — reuse όταν readyState
1→2 χωρίς δεύτερο `useDb()` call· rebuild (νέο `useDb()` call, νέο connection object) σε
κάθε ένα από τα 3 «dead» states (0/3/99, `it.each`). Νέο local `setReadyState()` test helper
(cast-around το readonly `Connection.readyState` type — το πραγματικό mongoose Connection το
έχει read-only, οι test fakes είναι plain mutable objects).

**Verified**: `npm run type-check` → **EXIT 0**. `npx vitest run` (πλήρες suite) → **229
files / 2980 tests green** (ήταν 226/2936 στο increment 85· η διαφορά περιλαμβάνει tests από
άλλες concurrent routines + τα 8 νέα δικά μου). `WEB_DEBT.md`'s item ενημερώθηκε TODO → DONE.
**Docker: ΔΕΝ έγινε rebuild** (logic+test-only edit μέσα σε ήδη-existing, `SAAS_MODE`-gated
module· καμία αλλαγή runtime wiring/env/dependency· ο live container του Achilleas δεν έχει
`SAAS_MODE` set). **Browser-verify: skipped** (backend-only, μηδέν UI, μηδέν observable
αλλαγή στο τρέχον self-hosted deployment). Collision guard: `git status --short` πριν το
staging έδειξε ΜΟΝΟ τα 3 δικά μου αρχεία (καθαρό working tree στην αρχή του run), `git diff
--cached --name-only` επιβεβαίωσε exact match.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** το `WEB_DEBT.md` P3 decision-flag backlog στο δικό μου territory είναι πλέον
**άδειο** (μόνο το P3/M el.ts i18n gap μένει ανοιχτό γενικά στο repo, αλλά είναι εκτός
territory — `lib/i18n/*`, δεν είναι SaaS-only). Επόμενο increment: επόμενη σάρωση του
`WEB_DEBT.md` για νέο item στο territory πρώτα· αλλιώς γύρισμα στο TODO.md §12 (Stripe
live-wiring πέρα από τα ήδη-shipped checkout/portal/webhook stubs) ή §14 follow-up
(audit-log rate-limiting, αν δεν έχει ήδη καλυφθεί από το increment 84's rate-limit fix).

## 2026-07-24 (cont. — increment 87, route-level test coverage για το Stripe billing webhook)

Πριν από νέο increment: ask-inbox (τα 2 OPEN entries είναι bakecore-finance, τίποτα για
saas-core), `WEB_DEBT.md` (ακόμα η 57η σάρωση, όλα τα items στο δικό μου territory ήδη DONE),
και το UI-first backlog (confirmed εξαντλημένο στο increment 86 — κάθε read API έχει ήδη
consuming UI panel). Το «TODO.md §12 Stripe live-wiring» leftover next-task έλεγξα πρώτα:
το `lib/billing/stripe.ts` (`createCheckoutSession`/`createPortalSession`/
`verifyStripeSignature`) είναι ήδη **live** (πραγματικό fetch στο Stripe REST API, όχι
mock/stub — χρειάζεται μόνο τα πραγματικά `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/
price-id envs από τον Achilleas για end-to-end δοκιμή, βλ. ήδη-καταγεγραμμένο Needs-Achilleas
σε προηγούμενα entries) — δεν υπάρχει άλλο μηχανικό βήμα εκεί χωρίς credentials.

**Αντ' αυτού βρήκα ένα πραγματικό, μη-καταγεγραμμένο test-coverage gap**: `grep`-άροντας ΟΛΟ
το `api/saas/**` για `*.test.ts` βγήκε **μηδέν route-level tests πουθενά** στο SaaS API
surface (η λογική τεσταρίζεται μόνο έμμεσα, μέσω pure lib helpers όπως `statusAuditAction`/
`planForPriceId`). Το πιο κρίσιμο ανεξέταστο route είναι ακριβώς το **`api/saas/billing/
webhook/route.ts`** — το ΜΟΝΟ σημείο που η κατάσταση της Stripe συνδρομής (plan/status ενός
πληρωμένου tenant) γράφεται στο control plane. Βρήκα προηγούμενο precedent για route-level
testing με πλήρη module-boundary mocking (`api/v1/receipts/route.test.ts`, mocks μόνο DB/
model seams, τρέχει το πραγματικό handler) και το εφάρμοσα εδώ.

**Νέο `webhook/route.test.ts`** (18 tests, μηδέν production code αλλαγή): mocks `@/lib/db`,
`@/models/Tenant` (findById/findOne + fake tenant με spy `save()`), `@/lib/tenancy/saasMode`,
`@/lib/billing/stripe` (verifyStripeSignature/webhookSecret — πλήρης έλεγχος του gate ladder
χωρίς να χρειάζεται πραγματικό HMAC construction), `@/lib/billing/plans` (planForPriceId).
Το `@/lib/tenancy/audit`/`@/lib/billing/statusAudit` έμειναν **πραγματικά** (μέσω
`vi.importActual`, μόνο το `recordAudit` mocked ως spy) — καθαρές pure functions, θέλαμε να
τεσταριστεί η πραγματική integration μαζί τους, όχι stub. Καλύπτει: (1) gate ladder
(SAAS_MODE off→404, no secret→503, bad sig→400, malformed JSON→400, unhandled event
type→200 no-op), (2) tenant resolution (metadata.tenantId προτεραιότητα έναντι
billingCustomerId fallback, no-match no-op), (3) `checkout.session.completed`
(customer/subscription ids + status='active' + `workspace.reactivated` audit όταν το
tenant ήταν suspended, όχι audit σε φυσιολογικό pending→active onboarding), (4)
`customer.subscription.created/updated` (plan mapping από priceId, active/trialing→active,
past_due/unpaid→suspended + `workspace.suspended` audit, unmapped price ⇒ plan αμετάβλητο),
(5) `customer.subscription.deleted` (status=canceled + plan=free + **2** audit rows
[`workspace.canceled` + `plan.changed`], no-op αν ήδη canceled+free), (6) mid-handler DB
throw → 500 (ώστε το Stripe να κάνει retry, όχι silent-swallow σε 200).

**Bug στο πρώτο μου πέρασμα (καλό σημάδι ότι το test όντως εξετάζει κάτι πραγματικό)**: αρχικά
περίμενα 1 audit row στο subscription.deleted (μόνο status), αλλά ο κώδικας καλεί ΚΑΙ
`auditPlanChange` (shared→free = πραγματική αλλαγή, δικό της `'plan.changed'` verb) ΚΑΙ
`auditStatusChange` — διόρθωσα το expectation στο σωστό 2, όχι τον κώδικα (καμία αλλαγή
συμπεριφοράς, ο κώδικας ήταν ήδη σωστός — το test μου έδειξε λάθος αρχική υπόθεση).

**Verified**: νέο test file **18/18 green** μόνο του· πλήρες `npx vitest run` → **233 files
/ 3049 tests green** (ήταν 229/2980 στο increment 86 — η διαφορά +4 files/+69 tests
περιλαμβάνει τα δικά μου +1 file/+18 tests + tests από concurrent routines). `npm run
type-check` → **EXIT 0**. **Docker: ΔΕΝ έγινε rebuild** (test-only αρχείο, μηδέν production
code/runtime wiring αλλαγή). **Browser-verify: skipped** (test file, μηδέν UI/observable
behavior αλλαγή). Collision guard: `git status --short` πριν το staging έδειξε ΜΟΝΟ το 1
δικό μου νέο αρχείο (καθαρό working tree), `git diff --cached --name-only` επιβεβαίωσε exact
match. Pushed `30e4420`.

**## Needs Achilleas:** τίποτα νέο (το standing Stripe-live-keys item παραμένει όπως ήταν —
`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_SHARED`/`STRIPE_PRICE_DEDICATED`
χρειάζονται πραγματικά credentials πριν γίνει end-to-end δοκιμή του checkout flow· το
scaffold είναι πλήρες και live-ready).

**Next task:** αν καμία νέα σάρωση WEB_DEBT δεν φέρει item στο territory, το επόμενο route
χωρίς δικό του test είναι καλός υποψήφιος επόμενο increment (π.χ. `api/saas/billing/
checkout`/`portal` routes, ή `api/saas/invites/accept` — ήδη guarded με try/catch από το
increment 85 αλλά ανεξέταστο σε route-level) — ίδιο πρότυπο mocking. Εναλλακτικά: TODO.md
§14 audit-log rate-limiting follow-up (το increment 84 κάλυψε μόνο auth/mfa, όχι το
`audit/route.ts` GET read endpoint το ίδιο — ελέγξτε αν χρειάζεται, πιθανώς όχι high-value
αφού είναι session-gated read όχι brute-forceable secret).

## 2026-07-24 (cont. — increment 88, route-level test coverage για το invites/accept endpoint)

Πριν από νέο increment: ask-inbox (τα 2 OPEN entries είναι bakecore-finance, τίποτα για
saas-core), `WEB_DEBT.md` (ακόμα η 57η σάρωση, όλα τα items στο δικό μου territory ήδη DONE),
UI-first backlog (ακόμα εξαντλημένο, confirmed στο increment 86). Ακολούθησα το leftover
next-task από το increment 87: `api/saas/invites/accept/route.ts` ήταν ήδη guarded με
top-level try/catch (increment 85, WEB_DEBT P2) αλλά **ανεξέταστο σε route-level** — grep
`api/saas/**/*.test.ts` έδειχνε ΜΟΝΟ το `billing/webhook/route.test.ts` (increment 87).
Το invites/accept είναι το ΜΟΝΟ **unauthenticated** SaaS route που φτιάχνει Account+Membership
από ένα mailed token (signup/login απαιτούν ήδη κάτι, membership creation αλλού απαιτεί
session) — υψηλό-ρίσκο endpoint χωρίς κανένα route-level test.

**Νέο `invites/accept/route.test.ts`** (14 tests, μηδέν production code αλλαγή), ίδιο module-
boundary mocking precedent με το webhook test (increment 87): mocks `@/lib/db`,
`@/models/Account` (findOne chain `.select()` + create), `@/models/Membership` (findOne chain
`.select().lean()` + updateOne + create), `@/models/Invite` (findOne + updateOne),
`@/lib/auth` (hashPassword), `@/lib/tenancy/saasApi` (saasAuthGate + accountTenants),
`@/lib/tenancy/accountSession` (setAccountCookie), `@/lib/tenancy/audit` (μόνο recordAudit
mocked, auditCtx πραγματικό μέσω `vi.importActual`). Το **`@/lib/tenancy/invites` έμεινε
ΠΛΗΡΩΣ πραγματικό** (κανένα mock) — καθαρές pure functions ήδη unit-tested αλλού
(`hashInviteToken`/`isInviteValid`), χρησιμοποιήθηκαν για να χτίσουν ρεαλιστικά fake Invite
rows (`makeInvite()` helper με πραγματικό `hashInviteToken(GOOD_TOKEN)`).

Καλύπτει: (1) gate ladder (saasAuthGate response pass-through, missing token→400), (2)
invite lookup (άγνωστο token→410, expired→410, already-accepted→410 = anti-replay), (3)
**fresh invitee** (χωρίς υπάρχον Account): password<8 chars→400 `password_required`,
valid password→δημιουργεί Account+Membership+consume invite+audit `invite.accepted`+cookie+
201, **race στο Account.create (duplicate key 11000)**→fallback στο post-race findOne (2ο
mockResolvedValueOnce), account ΑΚΟΜΑ null μετά το fallback→500 «could not resolve», μη-11000
error στο create→500 clean JSON (mid-handler throw, όχι swallowed), (4) **ήδη-υπάρχον
Account** (invitee έκανε ήδη signup πριν αποδεχτεί): ΚΑΘΟΛΟΥ password requirement, reuse
account, νέο membership αν δεν υπάρχει, **updateOne (reactivate) αντί create** αν υπάρχει ήδη
membership (removed ή ήδη active — idempotent double-accept), (5) mid-handler DB throw
(connectDB rejects)→καθαρό 500 JSON.

**Verified**: νέο test file **14/14 green** μόνο του· πλήρες `npx vitest run` → **236 files /
3084 tests green** (ήταν 233/3049 στο increment 87 — η διαφορά +3 files/+35 tests
περιλαμβάνει τα δικά μου +1 file/+14 tests + tests από concurrent routines). `npm run
type-check` → αρχικά **1 error** (TS narrow-άρισε το inferred return type του
`accountCreateMock`'s αρχικό factory σε `{ _id: string }` μόνο, αγνοώντας το spread
`Record<string, unknown>` — το `mockResolvedValueOnce({ _id, email, name })` σε επόμενο test
απέτυχε type-check) → fix: explicit `Promise<Record<string, unknown>>` return-type annotation
στο hoisted factory → **EXIT 0**. **Docker: ΔΕΝ έγινε rebuild** (test-only αρχείο, μηδέν
production code/runtime wiring αλλαγή). **Browser-verify: skipped** (test file, μηδέν UI/
observable behavior αλλαγή, ο hook το επιβεβαίωσε κι αυτό). Collision guard: `git status
--short` πριν το staging έδειξε ΜΟΝΟ το 1 δικό μου νέο αρχείο (καθαρό working tree), `git
diff --cached --name-only` επιβεβαίωσε exact match. Pushed `cadb513`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** ίδιο πρότυπο σε επόμενο ανεξέταστο route — καλοί υποψήφιοι:
`api/saas/billing/checkout`/`portal` (mint Stripe sessions, session-gated), ή
`api/saas/workspace/erasure`/`erasure/purge` (ήδη guarded από increment 85, GDPR-critical
data-deletion path, ανεξέταστο). Πριν ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση
`WEB_DEBT.md` για item στο territory (αν βρεθεί, πάει πρώτο).

## 2026-07-24 (cont. — increment 89, route-level test coverage για τα billing checkout + portal endpoints)

Πριν από νέο increment: ask-inbox (τα 2 OPEN entries είναι bakecore-finance, τίποτα για
saas-core), `WEB_DEBT.md` (ακόμα η 57η σάρωση 2026-07-22, όλα τα items στο δικό μου territory
ήδη DONE), UI-first backlog (ακόμα εξαντλημένο, confirmed στο increment 86). Ακολούθησα το
leftover next-task από το increment 88: πρώτος υποψήφιος στη λίστα ήταν
`api/saas/billing/checkout`/`portal` — session-gated (owner/admin μόνο), mint πραγματικό
Stripe session, μηδέν route-level test μέχρι τώρα (grep `api/saas/**/*.test.ts` έδειχνε μόνο
billing/webhook + invites/accept).

**Νέα `checkout/route.test.ts`** (11 tests) **+ `portal/route.test.ts`** (8 tests), μηδέν
production code αλλαγή, ίδιο module-boundary precedent με τα δύο προηγούμενα route tests: σε
κάθε ένα mocked μόνο `@/lib/billing/billingSession` (`resolveBillingSession`), `@/lib/billing/
stripe` (`createCheckoutSession`/`createPortalSession`), και `@/lib/tenancy/audit` (μόνο
`recordAudit` mocked, `auditCtx` πραγματικό μέσω `vi.importActual`). Οι ήδη-unit-tested pure
helpers (`checkoutablePlan`/`pickBaseUrl`/`checkoutUrls`/`portalReturnUrl` στο
`billingRoutes.test.ts`, `checkoutAuditMeta`/`portalAuditMeta` στα δικά τους test αρχεία)
τρέχουν πραγματικά, όχι mocked — το route test εξετάζει τι κάνει το ΙΔΙΟ το route (session
resolution ordering, plan validation πριν το Stripe call, status-code mapping από
`result.reason`, ότι το audit ΔΕΝ καλείται σε κανένα failure path, env-priority
`SAAS_PUBLIC_URL` > request origin).

Καλύπτει checkout: (1) resolveBillingSession's short-circuit response περνάει αναλλοίωτο
(gate/401/403/404), μηδέν Stripe call· (2) tenant slug από το body προωθείται σωστά (ή null
όταν λείπει)· (3) missing/free/unknown plan → 400, μηδέν Stripe call· (4) Stripe
not-configured→503, οποιοδήποτε άλλο Stripe failure→502, ΚΑΝΕΝΑ από τα δύο δεν audits· (5)
success→200 `{url,id}`, σωστά πεδία στο Stripe call (plan/tenantId/customerId/customerEmail/
successUrl/cancelUrl), `SAAS_PUBLIC_URL` override· (6) audit `billing.checkout_started` με
ΜΟΝΟ το whitelisted `{plan, checkoutId}` meta, μετά το success. Portal ίδιο σχήμα plus (7) no
billing customer→409, μηδέν Stripe call/audit.

**Verified**: και τα δύο νέα test files **19/19 green** μαζί· πλήρες `npx vitest run` →
**239 files / 3115 tests green** (ήταν 236/3084 στο increment 88 — η διαφορά +3 files/+31
tests περιλαμβάνει τα δικά μου +2 files/+19 tests + tests από concurrent routines). `npm run
type-check` → **EXIT 0** καθαρά, χωρίς κανένα intermediate error αυτή τη φορά. **Docker: ΔΕΝ
έγινε rebuild** (test-only αρχεία, μηδέν production code/runtime wiring αλλαγή). **Browser-
verify: skipped** (test files, μηδέν UI/observable behavior αλλαγή). Collision guard: `git
status --short` πριν το staging έδειξε ΜΟΝΟ τα 2 δικά μου νέα αρχεία (+ `apps/landing/app/
page.tsx` modified από άλλη concurrent routine, ΔΕΝ το άγγιξα — stage-άρησα ρητά μόνο τα 2
δικά μου), `git diff --cached --name-only` επιβεβαίωσε exact match. Pushed `55c2c8b`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** ίδιο πρότυπο σε επόμενο ανεξέταστο route — καλός υποψήφιος τώρα:
`api/saas/workspace/erasure`/`erasure/purge` (ήδη guarded από increment 85, GDPR-critical
data-deletion path, ανεξέταστο ακόμα). Λοιπά ανεξέταστα surfaces (χαμηλότερης
προτεραιότητας, session-only reads χωρίς destructive side-effect): `account/*` routes
(password/mfa/reset/verify), `admin/*`, `members`, `workspace/route.ts`, `usage`. Πριν
ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση `WEB_DEBT.md` για item στο territory (αν
βρεθεί, πάει πρώτο).

## 2026-07-24 (cont. — increment 90, route-level test coverage για τα workspace/erasure + erasure/purge endpoints)

Πριν από νέο increment: ask-inbox (τα 2 OPEN entries είναι bakecore-finance, τίποτα για
saas-core), `WEB_DEBT.md` (ακόμα η 58η σάρωση 2026-07-24, τα 3 ανοιχτά items — Notifications
requireAdmin/Voucher-GiftCard-LoyaltyCard tenancy/sampleDataActions.ts tenancy — αγγίζουν
`app/settings/actions.ts` και `app/vouchers/*.ts`, ΕΚΤΟΣ του δικού μου territory [`api/saas/**`,
`lib/tenancy/**`, `lib/billing/**`], άρα δεν τα ανέλαβα), UI-first backlog (ακόμα εξαντλημένο,
confirmed στο increment 86). Ακολούθησα το leftover next-task από το increment 89: το GDPR-
critical `api/saas/workspace/erasure`/`erasure/purge` route pair (ήδη guarded με try/catch από
το increment 85, αλλά ανεξέταστο σε route-level).

**Νέα `workspace/erasure/route.test.ts`** (15 tests, GET+POST+DELETE) **+
`workspace/erasure/purge/route.test.ts`** (9 tests), μηδέν production code αλλαγή, ίδιο
module-boundary precedent με τα προηγούμενα route tests: το πρώτο mocks `@/lib/tenancy/
workspaceSession` (`resolveWorkspaceSession`), `@/models/Tenant` (`updateOne`), `@/lib/tenancy/
audit` (μόνο `recordAudit` mocked, το υπόλοιπο module πραγματικό μέσω `vi.importActual`) — οι
ήδη-unit-tested pure helpers (`erasure.ts`: `planErasureRequest`/`planErasureCancel`/
`erasureView`/`isErasureRequested`) τρέχουν πραγματικά, όχι mocked. Το δεύτερο mocks `@/lib/
tenancy/saasMode` + `@/lib/tenancy/erasurePurge` (`runErasurePurgeScan`) — το route's δικό του
constant-time bearer-compare (`tokenMatches`) τρέχει πραγματικό.

Καλύπτει erasure/route.ts: (1) και τα 3 handlers περνούν αναλλοίωτα το short-circuit response
του `resolveWorkspaceSession` (gate/401/403/404), μηδέν write/audit· (2) owner-only gate (admin/
member → 403 σε POST+DELETE, ίδιο error-message assertion)· (3) idempotency και στις δύο
κατευθύνσεις (POST σε ήδη-pending, DELETE σε τίποτα-pending → επιστρέφουν το τρέχον state,
ΜΗΔΕΝ `Tenant.updateOne`/`recordAudit`)· (4) το happy path γράφει το σωστό `$set` +audits το
σωστό action/actor/target (`workspace.erasure_requested`/`workspace.erasure_canceled`)· (5)
tenant-slug forwarding (trim, allowInactive=true ώστε ένας ήδη-suspended owner να μπορεί ακόμα
να δει/ακυρώσει)· (6) mid-handler DB throw και στα δύο mutating handlers → clean 500 JSON
(`saasGuard`), όχι HTML crash page.

Καλύπτει erasure/purge/route.ts: (1) SAAS_MODE off → 404, ΔΕΝ διαβάζει καν το CRON_SECRET· (2)
CRON_SECRET unset → 500 fail-closed· (3) bearer-gate ladder (missing header, non-Bearer scheme,
wrong-same-length token, wrong-different-length token — το τελευταίο επιβεβαιώνει ότι το
length-guard πριν το `timingSafeEqual` δεν κάνει throw σε mismatched buffer lengths, exactly το
σχόλιο του route)· (4) σωστό token → καλεί το scan, `{ ok:true, ...result }`· (5) trim στο
bearer value πριν το compare· (6) mid-handler throw από το scan → clean 500 JSON.

**Bug στο πρώτο μου πέρασμα (καλό σημάδι)**: αρχικά έφτιαξα το mock `runErasurePurgeScan`
return shape λάθος (`{dryRun, due: string[], checked}` — δικό μου μάντεμα χωρίς να διαβάσω το
πραγματικό `ErasurePurgeScanResult` type πρώτα) → tsc TS2322. Διόρθωσα διαβάζοντας το
πραγματικό type (`erasurePurge.ts:109-118`: `{scanned, dryRun:true, due:number, targets:
PurgeTarget[]}`) και ευθυγράμμισα το test fixture + assertion με το πραγματικό σχήμα (καμία
αλλαγή στον production κώδικα, μόνο στο δικό μου test file).

**Verified**: και τα δύο νέα test files **24/24 green** μαζί (15+9). `npm run type-check` →
**EXIT 0** (μετά το fix). Πλήρες `npx vitest run` → **242 files / 3161 tests green** (ήταν
239/3115 στο increment 89 — η διαφορά +3 files/+46 tests περιλαμβάνει τα δικά μου +2 files/+24
tests + tests από concurrent routines). **Docker: ΔΕΝ έγινε rebuild** (test-only αρχεία, μηδέν
production code/runtime wiring αλλαγή). **Browser-verify: skipped** (test files, μηδέν UI/
observable behavior αλλαγή). Collision guard: `git status --short` πριν το staging έδειξε ΜΟΝΟ
τα 2 δικά μου νέα αρχεία (καθαρό working tree), `git diff --cached --name-only` επιβεβαίωσε
exact match.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** ίδιο πρότυπο σε επόμενο ανεξέταστο route-cluster — καλοί υποψήφιοι τώρα:
`account/*` routes (password/mfa/reset/verify, session-gated self-service), `admin/*`
(superadmin console reads/writes), `members`, `workspace/route.ts` (GET/PATCH/DELETE), `usage`.
Πριν ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση `WEB_DEBT.md` για item στο territory (αν
βρεθεί, πάει πρώτο).

## 2026-07-24 (cont. — increment 91, route-level test coverage για το admin/tenants/[slug] endpoint)

Πριν από νέο increment: ask-inbox (τα 2 OPEN entries είναι ακόμα bakecore-finance, τίποτα για
saas-core), `WEB_DEBT.md` (ίδια 58η σάρωση 2026-07-24, τα 3 ανοιχτά items εκτός territory όπως
και στο increment 90), UI-first backlog (ακόμα εξαντλημένο). Ακολούθησα το leftover next-task
από το increment 90: από τους 4 προτεινόμενους clusters (`account/*`, `admin/*`, `members`,
`workspace/route.ts`, `usage`) διάλεξα **`admin/tenants/[slug]`** — το ΜΟΝΟ write surface της
superadmin console (`GET` detail + `PATCH` manual status/plan override), υψηλότερου ρίσκου από
τα read-only `usage`/`members GET`/`account/route.ts` reads γιατί ένας operator μπορεί να
suspend/reactivate/cancel οποιοδήποτε tenant ή να αλλάξει το plan του χωρίς Stripe.

**Νέο `admin/tenants/[slug]/route.test.ts`** (17 tests, GET+PATCH), μηδέν production code
αλλαγή, ίδιο module-boundary precedent με τα προηγούμενα route tests: mocks `@/lib/db`
(connectDB no-op), `@/lib/tenancy/superadmin` (`requireSuperadmin`), `@/lib/tenancy/
adminTenantDetail` (`getTenantDetailForAdmin`), `@/models/Tenant` (`findOne` chain
`.select().lean()` + `updateOne`), `@/lib/tenancy/audit` (μόνο `recordAudit` mocked, `auditCtx`
πραγματικό μέσω `vi.importActual`). Οι ήδη-unit-tested pure helpers (`planAdminTenantPatch` στο
`adminTenantActions.test.ts`, το allowlist-matching στο `superadmin.test.ts`, η shaping-λογική
στο `adminTenantDetail.test.ts`) τρέχουν πραγματικά αλλού, ΟΧΙ εδώ — αυτό το test εξετάζει τι
κάνει το ΙΔΙΟ το route: gate ordering, 404-πριν-το-read-του-body, idempotent no-op, ποιο audit
row γράφεται πότε.

Καλύπτει GET: (1) `requireSuperadmin` short-circuit περνάει αναλλοίωτο, μηδέν detail-read· (2)
άγνωστο slug→404· (3) γνωστό slug→το πραγματικό detail verbatim + `Cache-Control: no-store`.
Καλύπτει PATCH: (4) gate short-circuit πριν καν το `Tenant.findOne`· (5) άγνωστο slug→404
**πριν διαβαστεί το body** (η σειρά του handler: lookup πρώτα, μετά `readBody`)· (6) άκυρο
status/plan value→400, μηδέν write/audit· (7) κενό body (ούτε status ούτε plan)→400· (8)
idempotent no-op (ίδια τιμή με το τρέχον)→200, μηδέν `Tenant.updateOne`/`recordAudit`· (9)
status-only change→σωστό `$set` + audit `workspace.suspended` με actor=operator· (10) plan-only
change→audit `plan.changed`· (11) **status+plan μαζί σε ΕΝΑ request→ΕΝΑ `updateOne` με combined
`$set` + ΔΥΟ audit rows** (μία ανά field)· (12) benign transition χωρίς mapped audit action
(π.χ. active→trialing, όχι recovery από suspended/canceled)→γράφει αλλά ΔΕΝ audits (mirrors
`statusAuditAction` returning null)· (13) re-read του detail μετά το write για το response body·
(14) tenant που εξαφανίζεται ανάμεσα στο write και το re-read→404· (15) mid-handler DB
throw→καθαρό 500 JSON (saasGuard)· (16) slug trim+lowercase πριν το lookup.

**Verified**: νέο test file **17/17 green** μόνο του· πλήρες `npx vitest run` → **244 files /
3199 tests green** (ήταν 242/3161 στο increment 90 — η διαφορά +2 files/+38 tests περιλαμβάνει
τα δικά μου +1 file/+17 tests + tests από concurrent routines). `npm run type-check` →
**EXIT 0** καθαρά, χωρίς κανένα intermediate error. **Docker: ΔΕΝ έγινε rebuild** (test-only
αρχείο, μηδέν production code/runtime wiring αλλαγή). **Browser-verify: skipped** (test file,
μηδέν UI/observable behavior αλλαγή). Collision guard: `git status --short` πριν το staging
έδειξε ΜΟΝΟ το 1 δικό μου νέο αρχείο (καθαρό working tree), `git diff --cached --name-only`
επιβεβαίωσε exact match. Pushed `446714e`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** ίδιο πρότυπο σε επόμενο ανεξέταστο route-cluster — καλοί υποψήφιοι τώρα:
`account/*` routes (password/mfa/reset/verify/mfa-confirm/workspaces/export, session-gated
self-service, 8 files), `admin/overview` + `admin/tenants` list (read-only console surfaces),
`members`, `workspace/route.ts` (GET/PATCH/DELETE), `usage`, `usage/sample`,
`workspace/{ai-key,export,export/files,reactivate}`, `invites/resend`, `invites/route.ts`,
`auth/{login,logout,mfa,session,signup}`, `audit`, `trials/sweep`, `billing/route.ts`. Πριν
ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση `WEB_DEBT.md` για item στο territory (αν βρεθεί,
πάει πρώτο).

## 2026-07-24 (cont. — increment 92, route-level test coverage για το workspace general-settings endpoint)

Πριν από νέο increment: ask-inbox (τα 2 OPEN entries είναι ακόμα bakecore-finance/
bakecore-redesigner, τίποτα addressed σε saas-core), `WEB_DEBT.md` (ίδια 58η σάρωση
2026-07-24 — confirmed CONFIRMATION run, τα 3 ανοιχτά auto-buildable items αφορούν
`app/settings/actions.ts`/`app/vouchers/*.ts`, ρητά ΕΚΤΟΣ territory, δεν τα ανέλαβα).
**UI-first backlog re-verified εξαντλημένο σε αυτό το run** (όχι απλά confirmed από
προηγούμενο log): `grep`-άρισα όλα τα `api/saas/**/route.ts` (38 endpoints) έναντι όλων
των `app/admin/**` + `app/(saas)/**` + `components/saas/**` — κάθε read/write surface
έχει ήδη ένα consuming UI panel (π.χ. `account/workspaces`→`CreateWorkspaceForm`/
`LeaveWorkspaceButton`, `workspace/{ai-key,erasure,export,reactivate}`→
`AiKeyPanel`/`ErasurePanel`/`WorkspaceSettingsPanel`, `admin/tenants/[slug]/dbstats`→
`LiveDbStatsPanel`). Μηδέν ασυνόδευτο API surface βρέθηκε, άρα ακολούθησα το leftover
next-task από το increment 91: route-level test gap.

Sweep όλων των `api/saas/**/route.ts` έναντι `route.test.ts` δίπλα τους: **31 από τα 38
routes ήταν ακόμα ανεξέταστα** σε route-level (μόνο billing/{webhook,portal,checkout},
invites/accept, workspace/erasure{,/purge}, admin/tenants/[slug] είχαν κάλυψη). Διάλεξα
**`workspace/route.ts`** (GET/PATCH/DELETE, «General» tab του workspace self-service) —
υψηλότερου ρίσκου από τα καθαρά read-only clusters (`usage`, `admin/overview`, `account/
route.ts`) γιατί το DELETE είναι ο owner-only soft-cancel του ΟΛΟΚΛΗΡΟΥ workspace (`status:
'canceled'`, blocks access για όλους).

**Νέο `workspace/route.test.ts`** (17 tests, GET+PATCH+DELETE), μηδέν production code
αλλαγή, ίδιο module-boundary precedent με τα προηγούμενα route tests: mocks `@/lib/tenancy/
workspaceSession` (`resolveWorkspaceSession`), `@/models/Tenant` (`updateOne`), `@/models/
Membership` (`countDocuments`), `@/lib/tenancy/audit` (μόνο `recordAudit` mocked, το
υπόλοιπο πραγματικό μέσω `vi.importActual`). Οι ήδη-unit-tested pure helpers
(`sanitizeWorkspaceName`/`workspaceNameError`/`canCancelWorkspace`/`workspaceView` στο
`workspace.test.ts`) τρέχουν πραγματικά εδώ, όχι mocked.

Καλύπτει GET: (1) short-circuit περνάει αναλλοίωτο· (2) `?tenant=` slug forwarding με
`(slug, false, true)`· (3) `workspaceView` με το live `Membership.countDocuments({tenant,
status:'active'})`. Καλύπτει PATCH: (4) short-circuit πριν το write· (5) resolve με
`requireManage=true` (owner/admin only) + trimmed tenant field (κενό→null)· (6) blank name
(μετά sanitize)→400, μηδέν write/audit· (7) name αμετάβλητο (ίδιο με το τρέχον)→200, μηδέν
write/audit· (8) πραγματικό rename→`$set{name}` + audit `workspace.updated`
{field,from,to}· (9) mid-handler throw→καθαρό 500. Καλύπτει DELETE: (10) short-circuit
πριν το role-check· (11) resolve με `(slug, false, true)`· (12) admin→403, (13) member→403
(και τα δύο μηδέν write/audit)· (14) ήδη-canceled→idempotent 200 no-op· (15) owner σε
active workspace→`$set{status:'canceled'}` + audit `workspace.canceled`
{field:'status',from:'active',to:'canceled'}· (16) mid-handler throw→καθαρό 500.

**Verified**: νέο test file **17/17 green** μόνο του· πλήρες `npx vitest run` → **246
files / 3230 tests green** (ήταν 244/3199 στο increment 91 — η διαφορά +2 files/+31 tests
περιλαμβάνει το δικό μου +1 file/+17 tests + tests από concurrent routine). `npm run
type-check` → **EXIT 0** καθαρά. **Docker: ΔΕΝ έγινε rebuild** (test-only αρχείο, μηδέν
production code/runtime wiring αλλαγή). **Browser-verify: skipped** (test file, μηδέν UI/
observable behavior αλλαγή). Collision guard: `git status --short` πριν το staging έδειξε
ΜΟΝΟ το 1 δικό μου νέο αρχείο (καθαρό working tree), `git diff --cached --name-only`
επιβεβαίωσε exact match. Pushed `66e3372`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** ίδιο πρότυπο σε επόμενο ανεξέταστο route-cluster (30 routes ακόμα χωρίς
route-level test) — καλοί υποψήφιοι τώρα: `account/*` self-service routes (password/mfa/
mfa/confirm/reset/request/reset/confirm/verify/request/verify/confirm/workspaces/export, 9
files, session-gated), `admin/overview` + `admin/tenants` list (read-only console
surfaces), `members`, `usage` + `usage/sample`, `workspace/{ai-key,export,export/files,
reactivate}`, `invites/{resend,route}`, `auth/{login,logout,mfa,session,signup}`, `audit`,
`trials/sweep`, `billing/route.ts`. Πριν ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση
`WEB_DEBT.md` για item στο territory (αν βρεθεί, πάει πρώτο).

## 2026-07-24 (cont. — increment 93, route-level test coverage για το auth/login endpoint)

Πριν από νέο increment: ask-inbox (τα 3 OPEN entries είναι ακόμα bakecore-finance ×2/
bakecore-redesigner ×1, τίποτα addressed σε saas-core), `WEB_DEBT.md` (ίδια 58η σάρωση
2026-07-24, τα 3 ανοιχτά auto-buildable items αφορούν `app/settings/actions.ts`/
`app/vouchers/*.ts`, ρητά ΕΚΤΟΣ territory, δεν τα ανέλαβα). UI-first backlog παραμένει
εξαντλημένο (καμία νέα `api/saas/**` route χωρίς UI consumer από το increment 92). Ακολούθησα
το leftover next-task: από τη λίστα ανεξέταστων route-clusters διάλεξα **`auth/login`** — η
είσοδος ΟΛΟΥ του SaaS auth surface, υψηλότερου ρίσκου από τα υπόλοιπα ανεξέταστα (`account/*`,
`members`, `usage`) γιατί ένα bug εδώ είτε διαρρέει account-enumeration είτε μοιράζει session
χωρίς πραγματικά επαληθευμένο password.

**Νέο `auth/login/route.test.ts`** (12 tests), μηδέν production code αλλαγή. Mocks: `@/lib/
apiAuth` (`rateLimit`/`clientIp`), `@/lib/db` (connectDB no-op), `@/models/Account`
(`findOne().select()` chain επιστρέφει fake doc με spyable `.save()`), `@/lib/auth`
(`verifyPassword`), `@/lib/tenancy/accountSession` (`setAccountCookie`/`setMfaPendingCookie`).
Το `@/lib/tenancy/saasApi` mock χρησιμοποιεί `vi.importActual` για το **πραγματικό `saasGuard`**
(καθαρή try/catch λογική, μηδέν DB/env reads) ενώ mocks μόνο `saasAuthGate`/`accountTenants` —
το mid-handler-throw test εξετάζει έτσι το ΠΡΑΓΜΑΤΙΚΟ error-shaping, όχι αναπαραγωγή του.

Καλύπτει: (1) rate-limited request → 429 as-is, μηδέν saasAuthGate/DB call (τεκμηριώνει ότι το
route ελέγχει rate-limit ΠΡΙΝ το saasAuthGate — as-coded ordering, όχι σχόλιο προτίμησης)· (2)
το rate-limit key = `saas-login:<clientIp>`· (3) saasAuthGate short-circuit περνάει αναλλοίωτο,
μηδέν DB· (4)(5) missing email/password → 400, μηδέν DB· (6) email lowercased+trimmed πριν το
lookup· (7) άγνωστο account → 401 "Invalid credentials", **verifyPassword ΠΟΤΕ δεν καλείται**
(το `||` short-circuit)· (8) γνωστό account + λάθος password → η ΙΔΙΑ 401 απάντηση (no account
enumeration)· (9) σωστό password + mfaEnabled=false → lastLoginAt stamped + save() + πραγματικό
account cookie + account/tenants response, μηδέν mfa-pending cookie· (10) κενό name fallback·
(11) σωστό password + mfaEnabled=true → OYTE lastLoginAt OYTE save() OYTE account cookie, μόνο
mfa-pending cookie + `{mfaRequired:true}`, μηδέν accountTenants call· (12) mid-handler throw
(account.save() rejects) → καθαρό 500 JSON μέσω του πραγματικού saasGuard.

**Verified**: νέο test file **12/12 green** μόνο του· πλήρες `npx vitest run` → **248 files /
3268 tests green** (ήταν 246/3230 στο increment 92 — η διαφορά +2 files/+38 tests περιλαμβάνει
το δικό μου +1 file/+12 tests + tests από concurrent routine). `npm run type-check` → **EXIT 0**
καθαρά. **Docker: ΔΕΝ έγινε rebuild** (test-only αρχείο, μηδέν production code/runtime wiring
αλλαγή). **Browser-verify: skipped** (test file, μηδέν UI/observable behavior αλλαγή).
Collision guard: `git status --short` πριν το staging έδειξε ΜΟΝΟ το 1 δικό μου νέο αρχείο
(καθαρό working tree), `git diff --cached --name-only` επιβεβαίωσε exact match. Pushed `3c82137`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** ίδιο πρότυπο σε επόμενο ανεξέταστο route-cluster (29 routes ακόμα χωρίς
route-level test) — καλοί υποψήφιοι τώρα: `auth/{signup,session,logout,mfa}` (υπόλοιπο auth
surface, `mfa` ειδικά αξίζει γιατί είναι ο δεύτερος παράγοντας), `account/*` self-service routes
(password/mfa/mfa-confirm/reset-request/reset-confirm/verify-request/verify-confirm/workspaces/
export, 9 files, session-gated), `admin/overview` + `admin/tenants` list (read-only console
surfaces), `members`, `usage` + `usage/sample`, `workspace/{ai-key,export,export/files,
reactivate}`, `invites/{resend,route}`, `audit`, `trials/sweep`, `billing/route.ts`. Πριν
ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση `WEB_DEBT.md` για item στο territory (αν βρεθεί,
πάει πρώτο).

## 2026-07-24 (cont. — increment 94, route-level test coverage για το auth/mfa endpoint)

Πριν από νέο increment: ask-inbox (τα 3 OPEN entries είναι ακόμα bakecore-finance ×2/
bakecore-redesigner ×1, τίποτα addressed σε saas-core). `WEB_DEBT.md` re-checked (ίδια 58η
σάρωση, τα 3 ανοιχτά auto-buildable items αφορούν `app/settings/actions.ts`/`app/vouchers/*.ts`,
ρητά ΕΚΤΟΣ territory). UI-first backlog παραμένει εξαντλημένο. Ακολούθησα το leftover next-task
και διάλεξα **`auth/mfa`** (login step-2 / δεύτερος παράγοντας) — το ίδιο increment-93 log το
είχε ήδη σημειώσει ως τον πιο αξιόλογο επόμενο στόχο μέσα στο υπόλοιπο auth surface.

**Νέο `auth/mfa/route.test.ts`** (17 tests, POST+DELETE), μηδέν production code αλλαγή. Mocks:
`@/lib/apiAuth` (`rateLimit`), `@/lib/db` (connectDB no-op), `@/models/Account`
(`findById().select()` chain → spyable `.save()` fake doc), `@/lib/tenancy/mfaStore`
(`verifyMfaLogin`), `@/lib/tenancy/accountSession` (`getMfaPendingAccountId`/
`clearMfaPendingCookie`/`setAccountCookie`), `@/lib/tenancy/saasApi` (`vi.importActual` για το
πραγματικό `saasGuard`, mocks μόνο `saasAuthGate`/`accountTenants`) — ίδιο module-boundary
precedent με το increment-93 auth/login test.

Καλύπτει POST: (1) gate short-circuit ΠΡΙΝ το pending-cookie read· (2) καμία pending cookie →
401 "no_pending_login", μηδέν rate-limit/DB· (3) rate limit keyed **ανά account id, όχι IP**
(η pending cookie ήδη περιορίζει τον στόχο σε ένα account)· (4) rate-limited → 429 as-is, μηδέν
connectDB/verifyMfaLogin· (5)(6) κενό/blank code → 400, μηδέν DB· (7) **και τα 4 failure reasons
του `verifyMfaLogin`** (not_found/not_enabled/invalid_code/crypto_unavailable) → όλα 401 με το
reason ως error body (`it.each`, τεκμηριώνει το as-coded hardcoded-401 bug/quirk χωρίς να το
"διορθώνει")· (8) account εξαφανίζεται ανάμεσα σε verify-ok και το re-read → 401 "not_found",
ΚΑΝΕΝΑ cookie δεν αγγίζεται· (9) TOTP success → lastLoginAt stamped+save+clear-pending+real
cookie+account/tenants/usedRecoveryCode:false· (10) recovery-code success →
usedRecoveryCode:true· (11) κενό name fallback· (12) mid-handler throw (account.save rejects) →
καθαρό 500 μέσω πραγματικού saasGuard. Καλύπτει DELETE: (13) gate short-circuit πριν το cookie
clear· (14) normal path → clear+`{ok:true}`.

**Verified**: νέο test file **17/17 green** μόνο του· πλήρες `npx vitest run` → **250 files /
3308 tests green** (ήταν 248/3268 στο increment 93 — η διαφορά +2 files/+40 tests περιλαμβάνει
το δικό μου +1 file/+17 tests + tests από concurrent routine). `npm run type-check` → **EXIT 0**
καθαρά. **Docker: ΔΕΝ έγινε rebuild** (test-only αρχείο). **Browser-verify: skipped** (test file,
μηδέν UI/observable behavior αλλαγή). Collision guard: `git status --short` πριν το staging
έδειξε ΜΟΝΟ το 1 δικό μου νέο αρχείο, `git diff --cached --name-only` επιβεβαίωσε exact match.
Pushed `c8bf23f`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** ίδιο πρότυπο σε επόμενο ανεξέταστο route-cluster (28 routes ακόμα χωρίς
route-level test) — καλοί υποψήφιοι τώρα: `auth/{signup,session,logout}` (υπόλοιπο auth
surface), `account/*` self-service routes (password/mfa/mfa-confirm/reset-request/reset-confirm/
verify-request/verify-confirm/workspaces/export, 9 files, session-gated), `admin/overview` +
`admin/tenants` list (read-only console surfaces), `members`, `usage` + `usage/sample`,
`workspace/{ai-key,export,export/files,reactivate}`, `invites/{resend,route}`, `audit`,
`trials/sweep`, `billing/route.ts`. Πριν ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση
`WEB_DEBT.md` για item στο territory (αν βρεθεί, πάει πρώτο).

## 2026-07-24 (cont. — increment 95, route-level test coverage για το auth/signup endpoint)

Πριν από νέο increment: ask-inbox (τα 3 OPEN entries είναι ακόμα bakecore-finance ×2/
bakecore-redesigner ×1, τίποτα addressed σε saas-core). `WEB_DEBT.md` re-checked (58η σάρωση
παραμένει η πιο πρόσφατη· τα 3 ανοιχτά auto-buildable items αφορούν `app/settings/actions.ts`/
`app/vouchers/*.ts`, ρητά ΕΚΤΟΣ territory — δεν τα ανέλαβα). UI-first backlog παραμένει
εξαντλημένο (καμία νέα `api/saas/**` route χωρίς UI consumer). Ακολούθησα το leftover next-task:
από τα 27 ανεξέταστα route-clusters διάλεξα **`auth/signup`** — το σημείο που δημιουργεί ΝΕΟ
global Account + το πρώτο Tenant του (owner Membership), υψηλότερου ρίσκου από τα υπόλοιπα
υπόλοιπα auth routes (`session`/`logout`) γιατί λάθος εδώ σημαίνει είτε duplicate account
δημιουργείται (race στο unique index) είτε ένα provisioned Tenant μένει ορφανό από μισο-χτισμένο
Account.

**Νέο `auth/signup/route.test.ts`** (14 tests), μηδέν production code αλλαγή. Mocks: `@/lib/db`
(connectDB no-op), `@/models/Account` (`exists`/`create`), `@/lib/auth` (`hashPassword`), `@/lib/
tenancy/provision` (`provisionTenant`), `@/lib/tenancy/accountSession` (`setAccountCookie`).
`@/lib/tenancy/saasApi` mock χρησιμοποιεί `vi.importActual` για το πραγματικό `saasGuard` (ίδιο
module-boundary precedent με τα auth/login+auth/mfa tests), mocks μόνο `saasAuthGate`/
`accountTenants`.

Καλύπτει: (1) gate short-circuit περνάει αναλλοίωτο, μηδέν DB· (2)(3) missing/malformed email →
400, μηδέν DB· (4)(5) password <8 chars ή missing → 400, μηδέν DB· (6) email lowercased+trimmed
πριν το `exists()` ΚΑΙ το `create()`· (7) γνωστό email (exists()=true) → 409, `Account.create`
ΠΟΤΕ δεν καλείται· (8) **race-safety fallback**: `exists()=false` αλλά `create()` πετάει Mongo
11000 → η ΙΔΙΑ 409 απάντηση, όχι 500, μηδέν provisionTenant/cookie· (9) οποιοδήποτε ΑΛΛΟ σφάλμα
στο `create()` (όχι 11000) → περνάει καθαρό μέσα από το 500 του `saasGuard`, ΔΕΝ καταπίνεται σαν
409· (10)(11)(12) **workspace-name fallback chain**: explicit `workspace` κερδίζει το `name`,
`name` κερδίζει το email local-part, όταν και τα δύο λείπουν → `email.split('@')[0]`· (13)
success path: `hashPassword` καλείται με το raw password (ΠΟΤΕ δεν αποθηκεύεται raw),
`provisionTenant({accountId, workspaceName})`, `setAccountCookie({sub,email})`, response 201
`{account, tenants}` με `tenants` από `accountTenants(accountId)`· (14) κενό name fallback στο
response.

**Verified**: νέο test file **14/14 green** μόνο του· πλήρες `npx vitest run` → **253 files /
3339 tests green** (ήταν 250/3308 στο increment 94 — η διαφορά +3 files/+31 tests περιλαμβάνει
το δικό μου +1 file/+14 tests + tests από concurrent routine [`expenses/actions.rules.test.ts`
φάνηκε staged από άλλη routine στο πρώτο `git status --short`, collision guard καθάρισε μόνο του
15s αργότερα]). `npm run type-check` → **EXIT 0** καθαρά. **Docker: ΔΕΝ έγινε rebuild**
(test-only αρχείο, μηδέν production code/runtime wiring αλλαγή). **Browser-verify: skipped**
(test file, μηδέν UI/observable behavior αλλαγή). Collision guard: το αρχικό `git status --short`
έδειξε ένα ΞΕΝΟ staged αρχείο (concurrent routine mid-commit) → περίμενα, ξανα-έλεγξα, καθάρισε →
staged+committed ΜΟΝΟ το δικό μου 1 νέο αρχείο, `git diff --cached --name-only` επιβεβαίωσε exact
match. Pushed `e599bac`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** ίδιο πρότυπο σε επόμενο ανεξέταστο route-cluster (26 routes ακόμα χωρίς
route-level test) — καλοί υποψήφιοι τώρα: `auth/{session,logout}` (κλείνει όλο το auth surface),
`account/*` self-service routes (password/mfa/mfa-confirm/reset-request/reset-confirm/
verify-request/verify-confirm/workspaces/export, 9 files, session-gated), `admin/overview` +
`admin/tenants` list (read-only console surfaces), `members`, `usage` + `usage/sample`,
`workspace/{ai-key,export,export/files,reactivate}`, `invites/{resend,route}`, `audit`,
`trials/sweep`, `billing/route.ts`. Πριν ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση
`WEB_DEBT.md` για item στο territory (αν βρεθεί, πάει πρώτο).

## 2026-07-25 (increment 96, route-level test coverage για το auth/session endpoint)

Πριν από νέο increment: ask-inbox (τα 3 OPEN entries είναι ΟΛΑ bakecore-finance ×2/
bakecore-redesigner ×1, τίποτα addressed σε saas-core — δεν υπήρχε τίποτα να εφαρμόσω πρώτα).
`WEB_DEBT.md` re-checked (η πιο πρόσφατη σάρωση αναφέρει ρητά ότι τα μόνα ανοιχτά auto-buildable
items αφορούν `app/settings/actions.ts` [requireAdmin gap στο notifier/webhook block] και
`app/vouchers/*.ts` [currentModel tenant-scoping gap] — και τα δύο ρητά ΕΚΤΟΣ territory, δεν τα
ανέλαβα). UI-first backlog παραμένει εξαντλημένο (καμία νέα `api/saas/**` route χωρίς UI
consumer, το admin console + όλα τα account/workspace panels υπάρχουν ήδη). Ακολούθησα το
leftover next-task: από τα 23 ανεξέταστα route-clusters διάλεξα **`auth/session`** — το "am I
logged in" probe που κάθε SaaS σελίδα/panel καλεί στο load· έκλεισε το core auth-surface loop
μαζί με τα ήδη-καλυμμένα login/mfa/signup (το `auth/logout` που έμεινε είναι σκόπιμα trivial,
3 γραμμές λογικής, χαμηλής αξίας test σε σύγκριση).

**Νέο `auth/session/route.test.ts`** (10 tests), μηδέν production code αλλαγή. Mocks: `@/lib/db`
(connectDB no-op), `@/models/Account` (`findById().select().lean()` chain → spyable), `@/lib/
tenancy/accountSession` (`getCurrentAccount`), `@/lib/tenancy/saasApi` (`vi.importActual` για το
πραγματικό `saasGuard`, mocks μόνο `saasAuthGate`/`accountTenants` — ίδιο module-boundary
precedent με τα προηγούμενα 3 auth route tests).

Καλύπτει: (1) gate short-circuit περνάει αναλλοίωτο, μηδέν `getCurrentAccount`/DB call· (2) καμία
cookie (`getCurrentAccount`→null) → `{account:null}`, μηδέν DB· (3) **έγκυρη cookie αλλά ο
λογαριασμός έχει διαγραφεί** (`findById` επιστρέφει null μέσω του lean chain) → **επίσης**
`{account:null}` — μια dangling cookie ΠΟΤΕ δεν λογίζεται "logged in", `accountTenants` δεν
καλείται· (4) valid cookie + υπαρκτός λογαριασμός → `{account,tenants}` σωστά σχηματισμένα από
το DB doc· (5) **fallback chain**: email πέφτει πίσω στο cookie's email όταν το DB doc δεν έχει
(προστασία σε legacy/incomplete doc), name πέφτει σε `''` όταν κενό· (6) το response id διαβάζει
το `_id` του DB doc (όχι το cookie `sub`) — σε περίπτωση απόκλισης το DB κερδίζει, και το
`accountTenants` καλείται με το DB id· (7) mid-handler throw (`findById().select().lean()`
rejects) → καθαρό 500 JSON μέσω του πραγματικού `saasGuard`.

**Verified**: νέο test file **10/10 green** μόνο του (7 named tests, μερικά με πολλαπλά
assertions)· πλήρες `npx vitest run` → **255 files / 3364 tests green**. `npm run type-check` →
**EXIT 0** καθαρά. **Docker: ΔΕΝ έγινε rebuild** (test-only αρχείο, μηδέν production code/runtime
wiring αλλαγή). **Browser-verify: skipped** (test file, μηδέν UI/observable behavior αλλαγή).
Collision guard: `git status --short` πριν το staging έδειξε μόνο 2 ΞΕΝΑ **modified** (όχι
staged) αρχεία από το live working tree του Achilleas (`settings/SettingsClient.tsx`+
`settings/actions.ts`, ήδη εκτός territory) + το δικό μου 1 νέο αρχείο — μηδέν staged conflict,
`git add` μόνο το δικό μου path, `git diff --cached --name-only` επιβεβαίωσε exact match. Pushed
`b1ba3ae`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** ίδιο πρότυπο σε επόμενο ανεξέταστο route-cluster (22 routes ακόμα χωρίς
route-level test) — καλοί υποψήφιοι τώρα: `account/*` self-service routes (password/mfa/
mfa-confirm/reset-request/reset-confirm/verify-request/verify-confirm/workspaces/export, 9
files, session-gated — η μεγαλύτερη εναπομείνασα ομάδα), `admin/overview` + `admin/tenants` list
(read-only console surfaces), `members`, `usage` + `usage/sample`, `workspace/{ai-key,export,
export/files,reactivate}`, `invites/{resend,route}`, `audit`, `trials/sweep`, `billing/route.ts`,
και το trivial `auth/logout` (αν εξαντληθούν όλα τα υπόλοιπα πρώτα). Πριν ξεκινήσεις: ask-inbox
πρώτα, μετά νέα σάρωση `WEB_DEBT.md` για item στο territory (αν βρεθεί, πάει πρώτο).

## 2026-07-25 (cont. — increment 97, route-level test coverage για το account/password endpoint)

Πριν από νέο increment: ask-inbox (τα 3 OPEN entries είναι ΟΛΑ bakecore-finance ×2/
bakecore-redesigner ×1, τίποτα addressed σε saas-core). `WEB_DEBT.md` re-checked (η ενεργή ουρά
παραμένει μηδέν P1/P2, το summary row 823 δεν λέει νέο auto-buildable item στο territory). UI-first
backlog παραμένει εξαντλημένο. Ακολούθησα το leftover next-task: από τα 22 ανεξέταστα
route-clusters διάλεξα **`account/password`** — το self-service password-change (πρώτο από την
account/* ομάδα των 9 files που το increment-96 log σημείωσε ως η μεγαλύτερη εναπομείνασα ομάδα),
write route υψηλού ρίσκου (λάθος εδώ = είτε account lockout είτε info-leak μεταξύ "δεν υπάρχει
λογαριασμός" vs "λάθος password").

**Νέο `account/password/route.test.ts`** (9 tests), μηδέν production code αλλαγή. Mocks: `@/lib/db`
(connectDB no-op), `@/models/Account` (`findById().select()` chain → spyable), `@/lib/auth`
(`hashPassword`/`verifyPassword`), `@/lib/tenancy/accountProfile` (`passwordChangeError`), `@/lib/
tenancy/accountSession` (`getCurrentAccount`), `@/lib/tenancy/saasApi` (`vi.importActual` για το
πραγματικό `saasGuard`, mocks μόνο `saasAuthGate` — ίδιο module-boundary precedent με τα
προηγούμενα auth route tests).

Καλύπτει: (1) gate short-circuit περνάει αναλλοίωτο, μηδέν session/DB touch· (2) καμία session
cookie (`getCurrentAccount`→null) → 401 "Not authenticated", μηδέν DB touch· (3)(4) missing
currentPassword/newPassword → 400, μηδέν DB touch· (5) policy rejection (`passwordChangeError`
non-null, π.χ. πολύ κοντό ή ίδιο με το τρέχον) → 400 με το ακριβές μήνυμα, μηδέν DB touch· (6)
dangling cookie (account row λείπει) → 401 "Invalid credentials"· (7) λάθος current password
(`verifyPassword`=false) → **ΙΔΙΟ** 401 "Invalid credentials" (no information leak μεταξύ των δύο
αποτυχιών, `.save()` ποτέ δεν καλείται)· (8) success: `hashPassword` καλείται με το ΝΕΟ password
(ποτέ με το raw current), το doc's `passwordHash` overwrite-άρεται, `.save()` καλείται, response
`{ok:true}`· (9) mid-handler throw (`account.save()` rejects) → καθαρό 500 μέσω πραγματικού
`saasGuard`.

**Verified**: νέο test file **9/9 green** μόνο του· πλήρες `npx vitest run` → **256 files / 3373
tests green**. `npm run type-check` → **EXIT 0** καθαρά. **Docker: ΔΕΝ έγινε rebuild** (test-only
αρχείο, μηδέν production code/runtime wiring αλλαγή). **Browser-verify: skipped** (test file,
μηδέν UI/observable behavior αλλαγή).

**Collision-guard race που έπιασα ΠΡΙΝ το push** (νέο, αξίζει να καταγραφεί ως precedent): το
αρχικό `git status --short` πριν το staging έδειξε 1 ΞΕΝΟ **modified** (όχι staged) αρχείο
(`docs/DOCS_PROGRESS.md`, live docs-progress routine mid-write) + το δικό μου 1 νέο αρχείο. Έκανα
`git add` μόνο το δικό μου path, `git diff --cached --name-only` επιβεβαίωσε exact match — αλλά
ανάμεσα σε εκείνον τον έλεγχο και το `git commit`, η docs routine πρόλαβε να κάνει `git add` στο
δικό της αρχείο, και το επόμενο `git commit` (χωρίς `-a`, αλλά staged state είχε αλλάξει
ενδιάμεσα) το συμπεριέλαβε ΚΑΙ τα δύο αρχεία στο ίδιο commit. Το `git show --stat HEAD` το
αποκάλυψε αμέσως μετά (2 files changed αντί 1). Επειδή **δεν είχε γίνει ακόμα push**
(`git log -1 origin/main` = προηγούμενο commit), το διόρθωσα καθαρά: `git reset --soft HEAD~1` →
`git reset HEAD -- docs/DOCS_PROGRESS.md` (unstage μόνο εκείνο, μένει dirty στο working tree για
να το commit-άρει η δική του routine αργότερα) → re-commit ΜΟΝΟ το δικό μου αρχείο (`git show
--stat` επιβεβαίωσε 1 file) → μετά push. Lesson για μελλοντικά runs: το `git diff --cached
--name-only` check ΠΡΙΝ το commit δεν είναι πλήρης εγγύηση σε πολύ στενό timing window (~1s)· το
**`git show --stat HEAD` ΑΜΕΣΩΣ μετά το commit, πριν το push**, είναι το τελικό safety net — αν
δείξει ξένο αρχείο, `git reset --soft HEAD~1` + unstage-only-theirs + re-commit διορθώνει καθαρά
όσο δεν έχει γίνει ακόμα push. Pushed `10903b5` (μόνο το δικό μου αρχείο).

**## Needs Achilleas:** τίποτα νέο.

**Next task:** ίδιο πρότυπο στα υπόλοιπα 8 files της account/* ομάδας (mfa, mfa/confirm,
reset/{request,confirm}, verify/{request,confirm}, workspaces, export, route.ts GET+PATCH) —
καλός επόμενος υποψήφιος **`account/mfa`** (enable/disable TOTP, υψηλού ρίσκου self-service
security setting) ή **`account/route.ts`** (GET+PATCH profile, το πιο βασικό account CRUD ακόμα
χωρίς coverage). Μετά: `admin/overview` + `admin/tenants` list (read-only console surfaces),
`members`, `usage` + `usage/sample`, `workspace/{ai-key,export,export/files,reactivate}`,
`invites/{resend,route}`, `audit`, `trials/sweep`, `billing/route.ts`, `auth/logout`. Πριν
ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση `WEB_DEBT.md` για item στο territory (αν βρεθεί,
πάει πρώτο). **Νέο lesson να θυμάσαι:** `git show --stat HEAD` μετά από κάθε commit, πριν το
push, ως τελικό collision-guard check.

## 2026-07-25 (cont. — increment 98, route-level test coverage για το account/mfa endpoint)

Πριν από νέο increment: ask-inbox re-checked (μηδέν entries addressed σε saas-core, ίδιο κενό).
`WEB_DEBT.md` re-checked (58η σάρωση, 2026-07-24) — και τα 3 auto-buildable items (Notifications
requireAdmin P1/S, Voucher/GiftCard/LoyaltyCard tenancy P2/M, sampleDataActions.ts tenancy P2/S)
είναι πλέον **DONE** στο git log (`0bc5e14`, `315cd26`, `36430e5`)· το i18n gap P3/M επίσης DONE
(`2cd33fb`, 126→0). Η ενεργή Web Debt Queue είναι **άδεια**. UI-first backlog παραμένει
εξαντλημένο (admin console + όλα τα account/workspace/billing/MFA panels ήδη χτισμένα, βλ.
`components/saas/*` list — 50+ αρχεία). Ακολούθησα το leftover next-task από το προηγούμενο log.

**Νέο `account/mfa/route.test.ts`** (20 tests), μηδέν production code αλλαγή. Route = TOTP
enrollment self-service (GET status / POST begin-or-restart / DELETE disable) πάνω στο ήδη-tested
`mfaStore.ts`. Mocks: `@/lib/db`, `@/models/Account` (findById().select() chain), `@/lib/auth`
(verifyPassword), `@/lib/tenancy/accountSession` (getCurrentAccount), `@/lib/tenancy/
secretCrypto` (secretCryptoReady), `@/lib/tenancy/mfaStore` (beginMfaEnrollment/disableMfa/
describeMfaStatus/mfaEnrollRequiresReauth), `@/lib/tenancy/saasApi` (vi.importActual για το
πραγματικό saasGuard, mocks μόνο saasAuthGate — ίδιο precedent με τα προηγούμενα route tests).

Καλύπτει: **GET** — gate/401/describeMfaStatus→null 404/success spreads status+cryptoReady.
**POST** — gate/401/account-not-found 404 (mfaEnrollRequiresReauth ΠΟΤΕ δεν καλείται)/
**first-time enroll (mfaEnabled=false) skips το password check εντελώς** (verifyPassword ποτέ
δεν καλείται)/re-enroll (mfaEnabled=true) missing password→400 (beginMfaEnrollment ποτέ)/
re-enroll wrong password→401 "Invalid credentials" (beginMfaEnrollment ποτέ)/re-enroll σωστό
password→beginMfaEnrollment τρέχει/beginMfaEnrollment ok:false reason 'not_found'→404,
'crypto_unavailable'→503. **DELETE** — gate/401/**missing password→400 ΠΡΙΝ το connectDB**
(validated πριν το DB round-trip, exact ίδιο pattern με το password-change route)/dangling
cookie (account row λείπει) και wrong password **collapse στο ΙΔΙΟ** 401 "Invalid credentials"
(disableMfa ποτέ σε καμία από τις δύο)/success→disableMfa('acc1')+{enabled:false}/mid-handler
throw (disableMfa rejects)→καθαρό 500 μέσω πραγματικού saasGuard.

**Verified**: νέο test file **20/20 green** μόνο του· πλήρες `npx vitest run` → **258 files /
3424 tests green**. `npm run type-check` → **EXIT 0** καθαρά. **Docker: ΔΕΝ έγινε rebuild**
(test-only αρχείο, μηδέν production code/runtime wiring αλλαγή). **Browser-verify: skipped**
(test file, μηδέν UI/observable behavior αλλαγή — ο PostToolUse hook το επιβεβαίωσε επίσης).
Collision guard: `git status --short` πριν το staging έδειξε ΜΟΝΟ το δικό μου 1 νέο αρχείο
(clean tree, μηδέν ξένο WIP αυτή τη φορά)· `git diff --cached --name-only` + `git show --stat
HEAD` μετά το commit επιβεβαίωσαν exact 1-file match πριν το push. Pushed `a730436`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** ίδιο πρότυπο στα υπόλοιπα route-clusters χωρίς coverage (23 απομένουν) — καλύτεροι
επόμενοι υποψήφιοι: **`account/route.ts`** (GET+PATCH profile, το πιο βασικό account CRUD ακόμα
χωρίς test, μεγαλύτερη λίστα surface), **`account/mfa/confirm`** (φυσική συνέχεια του mfa
enrollment flow που μόλις καλύφθηκε — confirmMfaEnrollment ήδη unit-tested, το route wrapping
όχι), ή **`admin/overview`**/**`admin/tenants`** (read-only superadmin console surfaces, ακόμα
untested). Μετά: `members`, `usage`+`usage/sample`, `workspace/{ai-key,export,export/files,
reactivate}`, `invites/{resend,route}`, `audit`, `trials/sweep`, `billing/route.ts`,
`auth/logout`, `account/{workspaces,export,reset/*,verify/*}`, `admin/tenants/[slug]/dbstats`.
Πριν ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση `WEB_DEBT.md` για item στο territory (αν
βρεθεί, πάει πρώτο — η ουρά ήταν άδεια σε αυτό το run αλλά μπορεί να ανοίξει νέο item η επόμενη
σάρωση του auditor).

## 2026-07-25 (cont. — increment 99, route-level test coverage για το account profile endpoint GET+PATCH)

Πριν από νέο increment: ask-inbox re-checked (5 OPEN entries, όλα bakecore — 2× bakecore-finance,
bakecore-redesigner, bakecore-tests macOS-TCC flag, bakecore-reviewer macOS-TCC flag· τίποτα
addressed σε saas-core, ίδιο κενό όπως τα προηγούμενα runs). `WEB_DEBT.md` re-checked (58η σάρωση
παραμένει το latest· η ενεργή ουρά είναι άδεια, μηδέν νέο P1/P2/P3 item στο territory). UI-first
backlog παραμένει εξαντλημένο. Ακολούθησα το leftover next-task από το increment-98 log.

**Νέο `account/route.test.ts`** (17 tests), μηδέν production code αλλαγή. Route = self-service
profile (GET own account / PATCH name+email), το πιο βασικό account CRUD που έμενε ακόμα χωρίς
route-level coverage. Mocks: `@/lib/db` (connectDB no-op), `@/models/Account` (findById().select()
chain + `Account.exists`), `@/lib/tenancy/accountSession` (getCurrentAccount + setAccountCookie),
`@/lib/tenancy/saasApi` (vi.importActual για το πραγματικό saasGuard, mocks μόνο saasAuthGate +
accountTenants — ίδιο module-boundary precedent με τα προηγούμενα auth route tests). **Νέο
choice**: `normalizeEmail`/`looksLikeEmail` (lib/tenancy/members) και `sanitizeName` (lib/tenancy/
accountProfile) ΔΕΝ mockαρίστηκαν — τετριμμένα pure string helpers, το να τα αφήσω πραγματικά
εξετάζει το actual normalization behavior που βασίζεται η route (π.χ. το «email unchanged»
test επιβεβαιώνει ότι `' Jo@Example.com '` normalizes στο ήδη-αποθηκευμένο `jo@example.com` και
ΔΕΝ πυροδοτεί uniqueness-check/cookie-refresh — θα ήταν αδύνατο να το εξετάσω αν το normalizeEmail
ήταν mocked). Νέο `chainable()` helper λύνει το ότι το GET κάνει `.select().lean()` ενώ το PATCH
κάνει `.select()` χωρίς `.lean()` (το select() return value είναι ταυτόχρονα thenable ΚΑΙ έχει
`.lean()` method, ίδιο mock function εξυπηρετεί και τα δύο call-shapes).

Καλύπτει: **GET** — gate/401/account-gone→404/success maps πλήρη lean doc verbatim (dates→ISO)/
success defaults λείποντα optional πεδία (email/name→''· emailVerified→false· dates→null)/
mid-handler throw (connectDB rejects)→καθαρό 500 μέσω πραγματικού saasGuard. **PATCH** —
gate/401/**ούτε name ούτε email στο body→400 "Nothing to update", μηδέν DB touch**/malformed
email→400 ΠΡΙΝ οποιοδήποτε uniqueness check (Account.exists ποτέ)/account-gone→404/**email
normalizes στην ΙΔΙΑ ήδη-αποθηκευμένη τιμή**→Account.exists ΠΟΤΕ δεν καλείται, emailVerified
ΔΕΝ resets, setAccountCookie ΠΟΤΕ δεν καλείται (save καλείται ούτως ή άλλως, unconditional)/
email αλλάζει σε ήδη-χρησιμοποιούμενο (Account.exists→true)→409, save ΠΟΤΕ/email αλλάζει σε
ελεύθερο→email updated + emailVerified reset σε false + setAccountCookie καλείται με το ΝΕΟ
email + response περιλαμβάνει accountTenants(accountId)/name-only update→sanitizeName (trim)
εφαρμόζεται, save καλείται, setAccountCookie **ΔΕΝ** καλείται (email αμετάβλητο)/**save() race
(throw `{code:11000}`)→το ΙΔΙΟ 409 μήνυμα με το pre-check**/οποιοδήποτε άλλο save() throw→
καθαρό 500 μέσω πραγματικού saasGuard.

**Verified**: νέο test file **17/17 green** μόνο του· πλήρες `npx vitest run` → **263 files /
3493 tests green** (αυξήθηκε από 258/3424 του increment-98 log — άλλες παράλληλες routines
πρόσθεσαν test files ενδιάμεσα, αναμενόμενο σε shared repo). `npm run type-check` → **EXIT 0**
καθαρά. **Docker: ΔΕΝ έγινε rebuild** (test-only αρχείο, μηδέν production code/runtime wiring
αλλαγή). **Browser-verify: skipped** (test file, μηδέν UI/observable behavior αλλαγή).
Collision guard: `git status --short` πριν το staging έδειξε ΜΟΝΟ το δικό μου 1 νέο αρχείο
(clean tree)· `git diff --cached --name-only` + `git show --stat HEAD` μετά το commit
επιβεβαίωσαν exact 1-file match πριν το push. Pushed `0e5c580`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** ίδιο πρότυπο στα υπόλοιπα route-clusters χωρίς coverage — καλύτεροι επόμενοι
υποψήφιοι: **`account/mfa/confirm`** (φυσική συνέχεια του mfa enrollment flow, confirmMfaEnrollment
ήδη unit-tested αλλά το route wrapping όχι), **`admin/overview`**/**`admin/tenants`** (read-only
superadmin console surfaces, ακόμα untested), ή **`account/{workspaces,export}`**. Μετά: `members`,
`usage`+`usage/sample`, `workspace/{ai-key,export,export/files,reactivate}`, `invites/{resend,
route}`, `audit`, `trials/sweep`, `billing/route.ts`, `auth/logout`, `account/{reset/*,verify/*}`,
`admin/tenants/[slug]/dbstats`. Πριν ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση `WEB_DEBT.md`
για item στο territory (αν βρεθεί, πάει πρώτο).

## 2026-07-25 (cont. — increment 100, route-level test coverage για το account/mfa/confirm endpoint)

Πριν από νέο increment: ask-inbox re-checked (5 OPEN entries, όλα bakecore· τίποτα addressed σε
saas-core). `WEB_DEBT.md` re-checked (58η σάρωση παραμένει το latest, ενεργή ουρά άδεια). UI-first
backlog παραμένει εξαντλημένο. Ακολούθησα το leftover next-task από το increment-99 log.

**Νέο `account/mfa/confirm/route.test.ts`** (11 tests), μηδέν production code αλλαγή. Route =
step 2 του TOTP enrollment (verify code από το pending secret του POST /account/mfa → activate
MFA + επιστρέφει recovery codes ONCE). Mocks: `@/lib/db`, `@/lib/tenancy/accountSession`
(getCurrentAccount), `@/lib/tenancy/mfaStore` (confirmMfaEnrollment — ήδη unit-tested στο δικό του
αρχείο), `@/lib/tenancy/saasApi` (vi.importActual για το πραγματικό saasGuard, mock μόνο
saasAuthGate — ίδιο precedent με τα προηγούμενα route tests). Simpler route από το sibling
mfa/route.ts (μηδέν password re-auth εδώ — αυτό ζει στο parent enroll-begin route).

Καλύπτει: gate short-circuit περνάει αναλλοίωτο, μηδέν DB/confirmMfaEnrollment call· no session
→401 "Not authenticated", μηδέν DB touch· missing code→400 "code is required" ΠΡΙΝ το connectDB
(validated πριν το DB round-trip, ίδιο idiom με τα password checks του sibling route)·
whitespace-only code→το ΙΔΙΟ 400 (trim collapses σε empty)· το code περνάει trimmed στο
confirmMfaEnrollment (`'  123456  '`→`'123456'`)· confirmMfaEnrollment ok:false reasons→404
(not_found)/503 (crypto_unavailable)/400 (no_pending, invalid_code — και τα δύο μαζί καλύπτουν το
`else 400` branch)· success→200 `{enabled:true, recoveryCodes}` verbatim· mid-handler throw
(confirmMfaEnrollment rejects)→καθαρό 500 μέσω πραγματικού saasGuard.

**Verified**: νέο test file **11/11 green** μόνο του· πλήρες `npx vitest run` → **265 files /
3543 tests green**. `npm run type-check` → **EXIT 0** καθαρά. **Docker: ΔΕΝ έγινε rebuild**
(test-only αρχείο, μηδέν production code/runtime wiring αλλαγή). **Browser-verify: skipped**
(test file, μηδέν UI/observable behavior αλλαγή). Collision guard: `git status --short` πριν το
staging έδειξε ΜΟΝΟ 1 ξένο **modified** αρχείο (`docs/DOCS_PROGRESS.md`, ξένη routine's WIP, ΔΕΝ
staged) + το δικό μου 1 νέο αρχείο· staged μόνο το δικό μου· `git diff --cached --name-only` +
`git show --stat HEAD` μετά το commit επιβεβαίωσαν exact 1-file match πριν το push. Pushed
`eb29926`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** ίδιο πρότυπο στα υπόλοιπα route-clusters χωρίς coverage — καλύτεροι επόμενοι
υποψήφιοι: **`admin/overview`**/**`admin/tenants`** (read-only superadmin console surfaces, ακόμα
untested, μεγαλύτερη λίστα surface), ή **`account/{workspaces,export}`**. Μετά: `members`,
`usage`+`usage/sample`, `workspace/{ai-key,export,export/files,reactivate}`, `invites/{resend,
route}`, `audit`, `trials/sweep`, `billing/route.ts`, `auth/logout`, `account/{reset/*,verify/*}`,
`admin/tenants/[slug]/dbstats`. Πριν ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση `WEB_DEBT.md`
για item στο territory (αν βρεθεί, πάει πρώτο).

## 2026-07-25 (cont. — increment 101, route-level test coverage για το admin/overview endpoint)

Πριν από νέο increment: ask-inbox re-checked (7 OPEN entries — 4× bakecore-finance/redesigner/
reviewer×2/ui-rebuild, bakecore-tests macOS-TCC flag, pharos-daily-dev P17/P23 mobile-camera
approval· τίποτα addressed σε saas-core, ίδιο κενό). `WEB_DEBT.md` re-checked (58η σάρωση
παραμένει το latest, ενεργή ουρά ίδια 3 items — Notifications requireAdmin/Voucher-GiftCard-
LoyaltyCard tenancy/sampleDataActions.ts tenancy — κανένα εκ των τριών στο saas-core territory,
όπως και τα προηγούμενα runs). UI-first backlog παραμένει εξαντλημένο. Ακολούθησα το leftover
next-task από το increment-100 log.

**Νέο `admin/overview/route.test.ts`** (4 tests), μηδέν production code αλλαγή. Route = superadmin
fleet-overview GET (μοναδικό verb, read-only aggregate πάνω στο central registry). Mocks: `@/lib/
tenancy/superadmin` (requireSuperadmin), `@/lib/tenancy/adminOverview` (readFleetOverviewForAdmin)
— και τα δύο ήδη πλήρως unit-tested στα δικά τους αρχεία (`superadmin.test.ts`, `adminOverview.
test.ts`), άρα το route test καλύπτει αποκλειστικά το wrapper behavior. Πιο απλό route από το ήδη-
tested sibling `admin/tenants/[slug]` (ένα verb, μηδέν body/params, μηδέν write path).

Καλύπτει: requireSuperadmin 403-forbidden short-circuit περνάει αναλλοίωτο, μηδέν aggregate call·
401-not-authenticated short-circuit ίδιο· happy path → το πραγματικό `readFleetOverviewForAdmin`
αποτέλεσμα verbatim + `Cache-Control: no-store`· mid-handler throw (readFleetOverviewForAdmin
rejects) → καθαρό 500 μέσω πραγματικού saasGuard (route δεν κάνει manual try/catch, το saasGuard
wrapper το χειρίζεται).

**Verified**: νέο test file **4/4 green** μόνο του· πλήρες `npx vitest run` → **266 files / 3565
tests green**. `npm run type-check` → **EXIT 0** καθαρά. **Docker: ΔΕΝ έγινε rebuild** (test-only
αρχείο, μηδέν production code/runtime wiring αλλαγή). **Browser-verify: skipped** (test file,
μηδέν UI/observable behavior αλλαγή). Collision guard: `git status --short` πριν το staging
έδειξε ΜΟΝΟ το δικό μου 1 νέο αρχείο (clean tree)· `git diff --cached --name-only` + `git show
--stat HEAD` μετά το commit επιβεβαίωσαν exact 1-file match πριν το push. Pushed `2be1e10`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** ίδιο πρότυπο στα υπόλοιπα route-clusters χωρίς coverage — καλύτεροι επόμενοι
υποψήφιοι: **`admin/tenants`** (list route, το sibling `[slug]` detail έχει ήδη coverage, το list
ακόμα όχι), **`account/{workspaces,export}`**, ή **`admin/tenants/[slug]/dbstats`**. Μετά:
`members`, `usage`+`usage/sample`, `workspace/{ai-key,export,export/files,reactivate}`,
`invites/{resend,route}`, `audit`, `trials/sweep`, `billing/route.ts`, `auth/logout`,
`account/{reset/*,verify/*}`. Πριν ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση `WEB_DEBT.md` για
item στο territory (αν βρεθεί, πάει πρώτο).

## 2026-07-25 (cont. — increment 102, route-level test coverage για το admin/tenants list endpoint)

Πριν από νέο increment: ask-inbox re-checked (7 OPEN entries — 5× bakecore [finance ×2, redesigner,
reviewer ×2, ui-rebuild], bakecore-tests macOS-TCC flag, pharos-daily-dev P17/P23 mobile-camera
approval· τίποτα addressed σε saas-core, ίδιο κενό όπως τα προηγούμενα runs). `WEB_DEBT.md`
re-checked (58η σάρωση παραμένει το latest, ενεργή ουρά ίδια 3 items — Notifications requireAdmin/
Voucher-GiftCard-LoyaltyCard tenancy/sampleDataActions.ts tenancy — κανένα εκ των τριών στο
saas-core territory). UI-first backlog παραμένει εξαντλημένο (admin console + auth/workspace
panels όλα ήδη χτισμένα). Ακολούθησα το leftover next-task από το increment-101 log.

**Νέο `admin/tenants/route.test.ts`** (5 tests), μηδέν production code αλλαγή. Route = superadmin
cross-tenant LISTING GET (paginated, optional status/search filter) — το sibling `[slug]` detail
route είχε ήδη coverage, η list route όχι. Mocks: `@/lib/tenancy/superadmin` (requireSuperadmin),
`@/lib/tenancy/adminTenants` (parseAdminTenantQuery/listTenantsForAdmin/buildTenantListing — και
τα τρία ήδη πλήρως unit-tested στο δικό τους `adminTenants.test.ts`, άρα το route test καλύπτει
αποκλειστικά το wrapper behavior: query-string → parser → DB call → envelope threading).

Καλύπτει: requireSuperadmin 403/401 short-circuit περνάει αναλλοίωτο, μηδέν parse/query/list
call· το πραγματικό `URLSearchParams` από το request URL περνάει στο `parseAdminTenantQuery`
(status/q/limit/offset όλα σωστά διαβασμένα από ένα multi-param URL)· το parsed query object
threading στο `listTenantsForAdmin` verbatim· happy path → `buildTenantListing` καλείται με τα
summaries/total/query/generatedAt (Date) και το αποτέλεσμά του επιστρέφεται verbatim με
`Cache-Control: no-store`· mid-handler throw (listTenantsForAdmin rejects) → καθαρό 500 μέσω
πραγματικού saasGuard, `buildTenantListing` ΠΟΤΕ δεν καλείται μετά από failed read.

**Verified**: νέο test file **5/5 green** μόνο του· πλήρες `npx vitest run` → **268 files / 3613
tests green** (αυξήθηκε από 266/3565 του increment-101 log). `npm run type-check` → **EXIT 0**
καθαρά. **Docker: ΔΕΝ έγινε rebuild** (test-only αρχείο, μηδέν production code/runtime wiring
αλλαγή). **Browser-verify: skipped** (test file, μηδέν UI/observable behavior αλλαγή).
Collision guard: `git status --short` πριν το staging έδειξε ΜΟΝΟ το δικό μου 1 νέο αρχείο
(clean tree)· `git diff --cached --name-only` μετά το staging επιβεβαίωσε exact 1-file match
πριν το commit/push.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** ίδιο πρότυπο στα υπόλοιπα route-clusters χωρίς coverage — καλύτεροι επόμενοι
υποψήφιοι: **`admin/tenants/[slug]/dbstats`** (superadmin per-tenant DB-size read, ακόμα
untested), **`account/{workspaces,export}`**, ή **`members`**. Μετά: `usage`+`usage/sample`,
`workspace/{ai-key,export,export/files,reactivate}`, `invites/{resend,route}`, `audit`,
`trials/sweep`, `billing/route.ts`, `auth/logout`, `account/{reset/*,verify/*}`. Πριν ξεκινήσεις:
ask-inbox πρώτα, μετά νέα σάρωση `WEB_DEBT.md` για item στο territory (αν βρεθεί, πάει πρώτο).

## 2026-07-25 (cont. — increment 103, route-level test coverage για το admin/tenants/[slug]/dbstats endpoint)

Πριν από νέο increment: ask-inbox re-checked (7 OPEN entries — 5× bakecore [finance ×2,
redesigner, reviewer ×2, ui-rebuild], bakecore-tests macOS-TCC flag, pharos-daily-dev P17/P23
mobile-camera approval· τίποτα addressed σε saas-core, ίδιο κενό όπως τα προηγούμενα runs).
`WEB_DEBT.md` re-checked (59η σάρωση παραμένει το latest· η ΜΟΝΗ ενεργή ουρά είναι πλέον ΕΝΑ
P2/S item, `vouchers/page.tsx` tenant-scoping gap — αλλά τα files του (`app/vouchers/page.tsx`)
είναι υπάρχον feature page, ΕΚΤΟΣ του saas-core territory [lib/tenancy, lib/billing, api/saas,
admin/(saas) UI]· ανήκει στον feature-builder routine, όχι εδώ). UI-first backlog παραμένει
εξαντλημένο. Ακολούθησα το leftover next-task από το increment-102 log.

**Νέο `admin/tenants/[slug]/dbstats/route.test.ts`** (6 tests), μηδέν production code αλλαγή.
Route = superadmin LIVE on-demand `db.stats()` reader για ένα tenant (μοναδικό verb, read-only,
ΠΟΤΕ δεν γράφει καμία Usage δειγματοληψία). Mock: `@/lib/tenancy/superadmin`
(requireSuperadmin) + `@/lib/tenancy/adminTenantDbStats` (readLiveDbStatsForAdmin — ήδη πλήρως
unit-tested στο δικό του `adminTenantDbStats.test.ts`, μαζί με τα pure `summarizeLiveDbStats`/
`buildLiveDbStats`), άρα το route test καλύπτει αποκλειστικά το wrapper behavior. Αυτό ήταν το
τελευταίο route χωρίς coverage στο `admin/tenants` cluster (list + `[slug]` detail/PATCH ήδη
καλυμμένα από τα increments 101-102).

Καλύπτει: requireSuperadmin 403/401 short-circuit περνάει αναλλοίωτο, μηδέν live read· unknown
slug (`readLiveDbStatsForAdmin` → null) → 404· happy path → το πραγματικό envelope verbatim +
`Cache-Control: no-store`· το slug param περνάει verbatim στο reader (καμία trim/lowercase σε
επίπεδο route — matched το πραγματικό route code, το trim/lowercase ζει ήδη στο
`readLiveDbStatsForAdmin`'s Tenant.findOne query semantics, όχι εδώ)· mid-handler throw (live
db.stats read αποτυγχάνει) → καθαρό 500 μέσω πραγματικού saasGuard.

**Verified**: νέο test file **6/6 green** μόνο του· πλήρες `npx vitest run` → **270 files / 3659
tests green** (αυξήθηκε από 268/3613 του increment-102 log). `npm run type-check` → **EXIT 0**
καθαρά. **Docker: ΔΕΝ έγινε rebuild** (test-only αρχείο, μηδέν production code/runtime wiring
αλλαγή). **Browser-verify: skipped** (test file, μηδέν UI/observable behavior αλλαγή).
Collision guard: `git status --short` πριν το staging έδειξε ΜΟΝΟ το δικό μου 1 νέο αρχείο
(clean tree)· `git diff --cached --name-only` μετά το staging επιβεβαίωσε exact 1-file match
πριν το commit/push. Pushed `20c6edc`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** το `admin/tenants` cluster έκλεισε πλήρως (list + `[slug]` + `[slug]/dbstats`,
όλα route-tested). Επόμενοι υποψήφιοι χωρίς coverage: **`account/{workspaces,export}`**,
**`members`**, `usage`+`usage/sample`, `workspace/{ai-key,export,export/files,reactivate}`,
`invites/{resend,route}`, `audit`, `trials/sweep`, `billing/route.ts`, `auth/logout`,
`account/{reset/*,verify/*}`. Πριν ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση `WEB_DEBT.md`
για item στο territory (αν βρεθεί, πάει πρώτο).

## 2026-07-25 (cont. — increment 104, route-level test coverage για το account/workspaces endpoint)

Πριν από νέο increment: ask-inbox re-checked (7 OPEN entries — 5× bakecore [finance ×2,
redesigner, reviewer ×2, ui-rebuild], bakecore-tests macOS-TCC flag, pharos-daily-dev P17/P23
mobile-camera approval· τίποτα addressed σε saas-core, ίδιο κενό όπως τα προηγούμενα runs).
`WEB_DEBT.md` re-checked (η ενεργή ουρά είναι πλέον 0 items — το τελευταίο, i18n el.ts gap,
έκλεισε από το pharos-daily-dev στο ίδιο διάστημα). UI-first backlog παραμένει εξαντλημένο
(admin console + auth/workspace panels όλα ήδη χτισμένα). Ακολούθησα το leftover next-task από
το increment-103 log.

**Νέο `account/workspaces/route.test.ts`** (17 tests), μηδέν production code αλλαγή. Route =
POST (self-serve "create another workspace" — provisionTenant + audit) + DELETE (self-serve
"leave a workspace" — mirrors το `wouldOrphanOwners` guard του `members` route, αλλά χωρίς
owner/admin check αφού ο caller αποχωρεί από τη ΔΙΚΗ του membership). Mocks: connectDB,
`Membership` (countDocuments/find/updateOne), `saasAuthGate`+`accountTenants` (`saasGuard`
μένει real, ίδιο idiom με `account/route.test.ts`), `getCurrentAccount`, `provisionTenant`,
`getTenantContext`, `recordAudit` (`auditCtx` μένει real/pure)· `readBody`/`strField`
(lib/apiBody) και `wouldOrphanOwners` (lib/tenancy/members) τρέχουν ΠΡΑΓΜΑΤΙΚΑ (pure helpers,
ήδη unit-tested αλλού) ώστε τα tests να εξασκούν το πραγματικό validation/orphan-guard logic.

Καλύπτει: **POST** — gate/401 short-circuits· blank name/over-80-char name → 400 πριν από
οποιοδήποτε DB touch· 20-workspace cap → 400 `provisionTenant` ποτέ δεν καλείται· success →
`provisionTenant({accountId, workspaceName: trimmed})` + `recordAudit(workspace.created,
selfServe:true)` + 201 `{tenant, tenants}`· mid-handler throw → καθαρό 500 μέσω πραγματικού
saasGuard. **DELETE** — gate/401 ίδια· missing slug → 400· `getTenantContext` → null Ή
`tenantId:null` → 404 "workspace not found"· caller απών από το membership list → 404 "not a
member"· caller = μοναδικός active owner → 409 `last_owner`, `updateOne` ΠΟΤΕ δεν καλείται
(πραγματικό `wouldOrphanOwners` το αποφασίζει)· co-owner ή plain member φεύγει επιτυχώς →
`updateOne({account, tenant}, {$set:{status:'removed'}})` + `recordAudit(member.left)` + 200
`{left, tenants}`· slug lower-cased πριν περάσει στο `getTenantContext`· mid-handler throw →
καθαρό 500.

**Verified**: νέο test file **17/17 green** μόνο του· πλήρες `npx vitest run` → **272 files /
3708 tests green** (αυξήθηκε από 270/3659 του increment-103 log). `npm run type-check` → **EXIT
0** καθαρά. **Docker: ΔΕΝ έγινε rebuild** (test-only αρχείο, μηδέν production code/runtime wiring
αλλαγή). **Browser-verify: skipped** (test file, μηδέν UI/observable behavior αλλαγή).
Collision guard: `git status --short` πριν το staging έδειξε ΜΟΝΟ το δικό μου 1 νέο αρχείο
(clean tree)· `git diff --cached --name-only` μετά το staging επιβεβαίωσε exact 1-file match
πριν το commit/push. Pushed `cac8b71`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** επόμενοι υποψήφιοι χωρίς route-level coverage: **`account/export`** (data-export
trigger, mirrors το ήδη-tested `workspace/export` idiom), **`members`** (owner/admin member-
management, μεγαλύτερο surface: role assign/remove + το ίδιο `wouldOrphanOwners` guard από την
άλλη πλευρά), `usage`+`usage/sample`, `workspace/{ai-key,export/files,reactivate}`,
`invites/{resend,route}`, `audit`, `trials/sweep`, `billing/route.ts`, `auth/logout`,
`account/{reset/*,verify/*}`. Πριν ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση `WEB_DEBT.md`
για item στο territory (αν βρεθεί, πάει πρώτο).

## 2026-07-26 (cont. — increment 105, route-level test coverage για το account/export endpoint)

Πριν από νέο increment: ask-inbox re-checked (`~/.claude/ASK_ACHILLEAS.md`, 7 OPEN entries — 5×
bakecore [finance ×2, redesigner, reviewer ×2, ui-rebuild], bakecore-tests macOS-TCC flag,
pharos-daily-dev P17/P23 mobile-camera approval· τίποτα addressed σε saas-core). `WEB_DEBT.md`
re-checked (ενεργή ουρά 0 items στο territory). UI-first backlog παραμένει εξαντλημένο (admin
console + auth/workspace panels όλα ήδη χτισμένα, βλ. `find admin "(saas)"` → 16 pages). Πριν το
staging, `git status --short` έδειξε ΗΔΗ σταθμένα (staged) αρχεία άσχετα με saas-core
(`apps/web/src/app/expenses/*`, `csvImport.ts`, `ynabImport.ts`) — collision guard σεβάστηκε,
ΔΕΝ έγινε καμία git ενέργεια μέχρι να ξεκαθαρίσει (επόμενος έλεγχος έδειξε ότι είχαν ήδη
committed από άλλη routine, tree clean πλην PROGRESS.md [όχι δικό μου] + το νέο μου test file).
Ακολούθησα το leftover next-task από το increment-104 log.

**Νέο `account/export/route.test.ts`** (6 tests), μηδέν production code αλλαγή. Route = GET-only
GDPR Art.15/20 self-export (caller's Account profile + Memberships[any status] joined σε Tenant
display fields → assembled JSON attachment). `buildAccountExport`/`accountExportFilename`
(lib/tenancy/accountExport) είναι ήδη πλήρως pure+unit-tested στο δικό τους
`accountExport.test.ts` → mocked εδώ, το route test καλύπτει αποκλειστικά: gate/401
short-circuits, `Account.findById().select().lean()` → 404 όταν λείπει (μηδέν
Membership/Tenant reads μετά), `Membership.find({account})` + `Tenant.find({_id:{$in:...}})`
scoped στα σωστά ids, το membership→tenant join (tenant που δεν βρέθηκε στο Tenant result →
`tenant:null`, όχι dropped — αυτό είναι δουλειά του `buildAccountExport`, όχι του route),
`buildAccountExport` καλείται με (account, joined[], Date), κενές memberships → `$in: []` +
κενό joined array, το response = το payload του assembler verbatim + attachment
Content-Disposition/Content-Type/Cache-Control headers, mid-handler throw → καθαρό 500 μέσω
πραγματικού saasGuard.

**Verified**: νέο test file **6/6 green** μόνο του· πλήρες `npx vitest run` → **273 files / 3731
tests green** (αυξήθηκε από 272/3708 του increment-104 log, +23 tests — κάποιες προήλθαν από
άλλες ταυτόχρονες routines στο μεταξύ, όχι μόνο τα 6 δικά μου). `npm run type-check` → **EXIT 0**
καθαρά (χρειάστηκε μικρό tuple-cast fix στο mock signature του `buildAccountExportMock`, τυπικό
vitest-mock-arity θέμα, καμία production επίπτωση). **Docker: ΔΕΝ έγινε rebuild** (test-only
αρχείο, μηδέν production code/runtime wiring αλλαγή). **Browser-verify: skipped** (test file,
μηδέν UI/observable behavior αλλαγή). Collision guard: `git status --short` πριν το staging
έδειξε ΜΟΝΟ το δικό μου 1 νέο αρχείο (τα άσχετα staged files μιας άλλης routine είχαν ήδη γίνει
commit στο μεταξύ)· `git diff --cached --name-only` μετά το staging επιβεβαίωσε exact 1-file
match πριν το commit/push.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** επόμενοι υποψήφιοι χωρίς route-level coverage: **`members`** (owner/admin member-
management, μεγαλύτερο surface: role assign/remove + το ίδιο `wouldOrphanOwners` guard από την
άλλη πλευρά), `usage`+`usage/sample`, `workspace/{ai-key,export/files,reactivate}`,
`invites/{resend,route}`, `audit`, `trials/sweep`, `billing/route.ts`, `auth/logout`,
`account/{reset/*,verify/*}`. Πριν ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση `WEB_DEBT.md`
για item στο territory (αν βρεθεί, πάει πρώτο).

## 2026-07-26 (cont. — increment 106, route-level test coverage για το members endpoint)

Πριν από νέο increment: ask-inbox re-checked (`~/.claude/ASK_ACHILLEAS.md`, 8 OPEN entries —
5× bakecore [finance ×2, redesigner, reviewer ×2, ui-rebuild], bakecore-tests macOS-TCC flag,
pharos-daily-dev P17/P23 mobile-camera approval· τίποτα addressed σε saas-core). `WEB_DEBT.md`
re-checked (59η σάρωση παραμένει το latest· η μοναδική ενεργή ουρά είναι το `vouchers/page.tsx`
tenant-scoping item, ρητά feature-builder territory — `app/vouchers/page.tsx`, όχι lib/tenancy/
lib/billing/api/saas/admin-(saas)-UI — άρα εκτός saas-core, ίδιο συμπέρασμα με το increment 103
log). UI-first backlog παραμένει εξαντλημένο. Ακολούθησα το leftover next-task από το
increment-105 log: **`members`** (μεγαλύτερο surface, owner/admin management + role-assign/
remove + το ίδιο `wouldOrphanOwners` guard).

**Νέο `members/route.test.ts`** (31 tests), μηδέν production code αλλαγή. Route = 4-verb
workspace member-management (GET list, POST add-or-invite, PATCH role-change, DELETE remove).
Το auth/authz seam (`resolveWorkspaceSession`) είναι ήδη πλήρως καλυμμένο έμμεσα μέσω του
`workspace/route.test.ts` idiom — mocked εδώ απευθείας (ίδιο recipe), όχι τα βαθύτερα seams του
(saasAuthGate/getCurrentAccount/κλπ). Η pure guard-logic (`parseRole`/`canAssignRole`/
`wouldOrphanOwners`/`normalizeEmail`/`looksLikeEmail`, `lib/tenancy/members.ts`) είναι ήδη
πλήρως unit-tested στο `members.test.ts` → τρέχει ΠΡΑΓΜΑΤΙΚΑ εδώ (plain import, no mock), μαζί
με `readBody`/`strField` (lib/apiBody), `withinSeatLimit`/`entitlementsFor` (lib/billing/
entitlements), `pickBaseUrl` (lib/billing/billingRoutes) και `mintInviteToken` (lib/tenancy/
invites) — όλα pure, μηδέν λόγος να ξαναγραφτούν ως mocks. Mocked seams: `resolveWorkspaceSession`,
`Membership`/`Account`/`Invite` models, `sendEmail`+`mailerCanDeliver` (lib/tenancy/mailer —
`invitedEmail`/`inviteEmail`/`inviteLinkUrl` έμειναν real, καθαροί message builders), `recordAudit`
(auditCtx έμεινε real).

Καλύπτει: **GET** — gate/requireManage=false passthrough, `?tenant=` forward, join Membership+
Account → `{workspace, members}`, mid-throw→500. **POST** — gate/requireManage=true· invalid
email/role → 400 πριν από Account lookup· admin προσπαθεί να μαρτήσει owner → 403 πριν από
Account lookup· email ΧΩΡΙΣ account → mint Invite (seat-limit-aware στο ίδιο cap με το active-
member path, supersede prior pending, audit `invite.sent`, 201 με `devToken` αφού κανένας mailer
δεν είναι configured στα tests)· ήδη active member → 409, μηδέν write· seat limit για νέο μέλος →
409, μηδέν create· νέο μέλος → `Membership.create` + audit `member.added` + notify + 201·
removed member re-added → `updateOne` (reactivate in place, ΟΧΙ re-create) + audit
`reactivated:true`· mid-throw→500. **PATCH** — gate/requireManage=true· missing accountId/invalid
role → 400· admin→owner promotion → 403· unknown/already-removed target → 404· demote sole
owner → 409 `last_owner`, μηδέν write/audit· real role change → `updateOne` + audit
`member.role_changed` με from/to· mid-throw→500. **DELETE** — gate/requireManage=true· missing
accountId → 400· unknown target → 404· remove sole owner → 409 `last_owner`, μηδέν write/audit·
real removal → `updateOne(status:removed)` + audit `member.removed`· mid-throw→500.

**Verified**: νέο test file **31/31 green** μόνο του (ένα μικρό μη-ουσιαστικό fix στην πορεία:
το invite-response assertion χρειάστηκε `objectContaining` αφού το `invite` payload περιλαμβάνει
και `expires`, όχι μόνο email/role/status). Πλήρες `npx vitest run` → **276 files / 3803 tests
green** (αυξήθηκε από 273/3731 του increment-105 log). `npm run type-check` → **EXIT 0** καθαρά.
**Docker: ΔΕΝ έγινε rebuild** (test-only αρχείο, μηδέν production code/runtime wiring αλλαγή).
**Browser-verify: skipped** (test file, μηδέν UI/observable behavior αλλαγή). Collision guard:
`git status --short` πριν το staging έδειξε ΜΟΝΟ το δικό μου 1 νέο αρχείο (clean tree — το
προηγούμενο ξένο `items/actions.photos.test.ts` untracked αρχείο είχε ήδη committed από άλλη
routine στο μεταξύ, `0721c49`/`adfa76e`)· `git diff --cached --name-only` μετά το staging
επιβεβαίωσε exact 1-file match πριν το commit/push. Pushed `5cd863c`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** επόμενοι υποψήφιοι χωρίς route-level coverage: `usage`+`usage/sample`,
`workspace/{ai-key,export/files,reactivate}`, `invites/{resend,route}`, `audit`,
`trials/sweep`, `billing/route.ts`, `auth/logout`, `account/{reset/*,verify/*}`. Πριν
ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση `WEB_DEBT.md` για item στο territory (αν βρεθεί,
πάει πρώτο).

## 2026-07-26 (cont. — increment 107, route-level test coverage για το usage + usage/sample endpoints)

Πριν από νέο increment: ask-inbox re-checked (`~/.claude/ASK_ACHILLEAS.md`, 8 OPEN entries — 5×
bakecore [finance ×2, redesigner, reviewer ×2, ui-rebuild], bakecore-tests macOS-TCC flag,
pharos-daily-dev P17/P23 mobile-camera approval· τίποτα addressed σε saas-core). `WEB_DEBT.md`
re-checked (59η σάρωση παραμένει το latest· η μοναδική ενεργή ουρά είναι το `vouchers/page.tsx`
tenant-scoping item, ρητά feature-builder territory `app/vouchers/page.tsx` — εκτός saas-core,
ίδιο συμπέρασμα με increments 103/106). UI-first backlog παραμένει εξαντλημένο (admin console +
auth/workspace panels όλα ήδη χτισμένα). Ακολούθησα το leftover next-task από το increment-106
log: **`usage`+`usage/sample`**.

Πριν το staging, `git status --short` έδειξε **9 modified αρχεία εκτός territory** (bills/reports/
fxAudit — άλλη routine mid-work πάνω σε Bill multi-currency, `apps/web/src/app/bills/*`,
`api/v1/bills/*`, `models/Bill.ts`, `reports/ReportsClient.tsx`, `lib/fxAudit.ts`, `types.ts`) —
collision guard σεβάστηκε, ΔΕΝ αγγίχτηκαν, staged ΜΟΝΟ τα 2 δικά μου νέα αρχεία (επαληθεύτηκε με
`git diff --cached --name-only` = exact 2-file match πριν το commit). ΣΗΜ: `npm run type-check`
έδειξε 1 προϋπάρχον error στο `reports/page.tsx`/`fxAudit.ts` (FxIssueKind narrowing, νέο `'bill'`
kind δεν είναι ακόμα στο page-level union) — καθαρά συνέπεια αυτού του ξένου in-progress WIP, όχι
δικό μου· δεν το άγγιξα (εκτός territory + risk να χαλάσω δουλειά άλλης routine μέσα σε commit).

**Νέο `usage/route.test.ts`** (9 tests) + **`usage/sample/route.test.ts`** (9 tests), μηδέν
production code αλλαγή.

`usage/route.ts` (GET) = billing/usage-dashboard read surface — ολόκληρο το metering stack
session→membership→tenant-context→ledger→quota-math. Η pure quota/cost μαθηματική
(`aiQuotaStatus`/`storageQuotaStatus`/`buildCostSummary`) είναι ήδη πλήρως unit-tested αλλού →
mocked εδώ στο module boundary, το route test καλύπτει αποκλειστικά τη δική του δουλειά: `gate`
short-circuit (SAAS_MODE off) περνάει ανέγγιχτο μηδέν DB/session· χωρίς session → 401 "not
authenticated" μηδέν connectDB· authenticated αλλά μηδέν active-membership tenants → 404 "no
workspace for this account"· χωρίς `?tenant=` → επιλέγει το ΠΡΩΤΟ tenant από το `accountTenants`·
`?tenant=` επιλέγει by slug (case-insensitive + trimmed) και απορρίπτει slug που ο λογαριασμός
δεν είναι member με 403, ΠΟΤΕ δεν καλεί `getTenantContext`· `getTenantContext` → null (tenant
διαγράφηκε mid-flight) → 404 "workspace not found"· success path επαληθεύει ότι
`currentUsage`/`aiQuotaStatus`/`storageQuotaStatus`/`buildCostSummary` καλούνται με τα σωστά
arguments (plan/used/period/tokens) και το response envelope συναρμολογεί τα outputs τους
verbatim (tenant{slug,name,plan,status,role}/period/usage/quotas/cost)· mid-handler throw →
καθαρό 500 μέσω πραγματικού `saasGuard`.

`usage/sample/route.ts` (POST) = scheduler-driven storage-sampling cron — ίδιο CRON_SECRET-bearer
idiom με το ήδη-tested `workspace/erasure/purge` (saasMode gate → CRON_SECRET presence →
constant-time bearer compare → saasGuard-wrapped body), το test file κυριολεκτικά mirror του
recipe εκείνου: SAAS_MODE off → 404 μηδέν CRON_SECRET read/sampleAllTenants call· CRON_SECRET
unset → 500 fail-closed· missing/non-Bearer/wrong-same-length/wrong-different-length token → 401
(η constant-time compare δεν κάνει throw σε διαφορετικό μήκος)· σωστό token (με trim
whitespace) → καλεί `sampleAllTenants` + `{ok:true, ...result}`· mid-handler throw
(`sampleAllTenants` rejecting) → καθαρό 500 μέσω saasGuard.

**Verified**: και τα δύο νέα test files **18/18 green** μόνα τους (`npx vitest run
src/app/api/saas/usage` → 2 files, 18 tests). Χρειάστηκε 1 μικρό type-only fix στην πορεία
(`aiQuotaStatusMock`/`storageQuotaStatusMock` default return value είχε inferred `limit: null`
literal type από το `vi.hoisted` init, έσπαγε όταν το `beforeEach` έγραφε πραγματικό number →
explicit `null as number | null` cast, μηδέν runtime αλλαγή). Πλήρες `npx vitest run` → **279
files / 3849 tests green** (αυξήθηκε από 276/3803 του increment-106 log). `npm run type-check` →
**2 pre-existing errors σε `reports/page.tsx`** (βλ. παραπάνω, ξένο WIP, αμετάβλητο πριν/μετά τα
δικά μου αρχεία). **Docker: ΔΕΝ έγινε rebuild** (test-only αρχεία, μηδέν production code/runtime
wiring αλλαγή). **Browser-verify: skipped** (test files, μηδέν UI/observable behavior αλλαγή).
Collision guard: `git status --short` πριν το staging έδειξε 9 ξένα modified αρχεία (δεν
αγγίχτηκαν)· `git diff --cached --name-only` μετά το staging επιβεβαίωσε exact 2-file match πριν
το commit/push. Pushed `111036f`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** επόμενοι υποψήφιοι χωρίς route-level coverage: `workspace/{ai-key,export/files,
reactivate}`, `invites/{resend,route}`, `audit`, `trials/sweep`, `billing/route.ts`,
`auth/logout`, `account/{reset/*,verify/*}`. Πριν ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση
`WEB_DEBT.md` για item στο territory (αν βρεθεί, πάει πρώτο). Σημείωσε επίσης αν το ξένο
`reports/page.tsx` FxIssueKind type-check error (bills multi-currency WIP) έχει κλείσει από την
άλλη routine μέχρι το επόμενο run — αν παραμένει ανοιχτό πολλά runs, ίσως αξίζει flag στο
ask-inbox (όχι τώρα, πολύ πρόσφατο/πιθανώς ενεργό mid-edit).

## 2026-07-26 (cont. — increment 108, route-level test coverage για workspace/ai-key + workspace/reactivate)

Πριν από νέο increment: ask-inbox re-checked (`~/.claude/ASK_ACHILLEAS.md`, 8 OPEN entries — 5×
bakecore [finance ×2, redesigner, reviewer ×2, ui-rebuild], bakecore-tests macOS-TCC flag,
pharos-daily-dev P17/P23 mobile-camera approval· τίποτα addressed σε saas-core). `WEB_DEBT.md`
grep re-checked (μηδέν ενεργό item στο saas/tenancy/billing/admin-UI territory, ίδιο συμπέρασμα
με increments 103/106/107). UI-first backlog παραμένει εξαντλημένο. Ακολούθησα το leftover
next-task από το increment-107 log: πρώτα δύο του καταλόγου, **`workspace/ai-key`**
(BYO-key settings panel, D5, 3 verbs) + **`workspace/reactivate`** (soft-cancel complement, 1
verb) — και τα δύο πάνω στο ίδιο `resolveWorkspaceSession`-gated pattern με το ήδη-tested
`workspace/route.test.ts`, καθαρό recipe reuse.

Πριν το staging, `git status --short` ήταν **καθαρό** (το ξένο 9-file bills/reports/fxAudit WIP
από το increment-107 log είχε ήδη committed από την άλλη routine στο μεταξύ) — collision guard
δεν χρειάστηκε να παραλείψει τίποτα.

**Νέο `workspace/ai-key/route.test.ts`** (20 tests), μηδέν production code αλλαγή. GET/PUT/DELETE
= BYO-key settings panel: αποθηκεύει/διαβάζει/σβήνει το δικό-του encrypted AI provider key ενός
tenant (unmetered στο platform key). Η plaintext-handling λογική (encode/decode/maskAiKey,
planAiKeyUpdate/planAiKeyClear) είναι ήδη πλήρως unit-tested αλλού → mocked εδώ στο
`lib/billing/byoKeyStore` module boundary (`setTenantAiKey`/`clearTenantAiKey`/
`describeTenantAiKey`) + `lib/billing/byoKey` (`byoKeyReady`/`BYO_PROVIDERS`). Καλύπτει: gate
short-circuit περνάει αναλλοίωτο και στα 3 verbs (πριν από οποιοδήποτε write)· και τα 3
resolve με `requireManage=true` (owner/admin only, security setting)· PUT/DELETE forward-άρουν
το trimmed `?tenant` body field (κενό→null)· τα 3 typed failure reasons του `setTenantAiKey`
(`crypto_unavailable`/`not_found`/`invalid`) map-άρουν στα δικά τους status codes (503/404/400),
μηδέν audit σε καθένα· success PUT audits `ai_key.set` με **provider only, ΠΟΤΕ το key**
(explicit assertion ότι το plaintext δεν εμφανίζεται πουθενά στο audit meta)· non-string `key`
body field coerce σε `''` πριν το `setTenantAiKey`· success DELETE audits `ai_key.cleared`·
`clearTenantAiKey` false (tenant vanished mid-flight) → 404 πριν το audit· GET δείχνει
`configured`/masked `key`/`cryptoReady`/`providers`, ΠΟΤΕ plaintext· mid-throw→500 και στα 3.

**Νέο `workspace/reactivate/route.test.ts`** (12 tests), μηδέν production code αλλαγή. POST =
συμπλήρωμα του ήδη-tested DELETE /api/saas/workspace (soft-cancel) — owner reverses το δικό του
cancel. Οι pure guards (`canReactivateWorkspace`/`reactivateStatusError`/`workspaceView`) τρέχουν
ΠΡΑΓΜΑΤΙΚΑ εδώ (ήδη πλήρως unit-tested στο `workspace.test.ts`). Καλύπτει: gate short-circuit
πριν από τον role-check· resolve με `(slug, false, true)` — `allowInactive` ώστε ο canceled
tenant να είναι reachable, μετά η route επιβάλλει το ΔΙΚΟ της αυστηρότερο owner-only gate·
admin/member → 403 πριν από οποιονδήποτε status-check/write· `it.each` πάνω σε 5 μη-canceled
statuses (active/trialing/suspended/pending/άγνωστο) → κάθε ένα το δικό του 409 μήνυμα, μηδέν
write/audit· owner+canceled → `$set status:'active'`, audit `workspace.reactivated` με
from/to, live member count στο response· mid-throw→500.

**Verified**: και τα δύο νέα test files **32/32 green** μαζί (`npx vitest run
src/app/api/saas/workspace/ai-key src/app/api/saas/workspace/reactivate`). Ενα μικρό
type-only fix στην πορεία (`recordAuditMock.mock.calls[0][1]` — tsc δεν μπορούσε να κάνει infer
το tuple index σε plain `vi.fn()` χωρίς generic type args → explicit cast, μηδέν runtime
αλλαγή). Πλήρες `npx vitest run` → **283 files / 3938 tests green** (αυξήθηκε από 279/3849 του
increment-107 log, +4 files/+89 tests — τα 2 δικά μου + κάποια από άλλες ταυτόχρονες routines στο
μεταξύ). `npm run type-check` → **EXIT 0 καθαρό** (το ξένο `reports/page.tsx` FxIssueKind error
από το increment-107 log έχει κλείσει από την άλλη routine, επιβεβαιώνεται εδώ). **Docker: ΔΕΝ
έγινε rebuild** (test-only αρχεία, μηδέν production code/runtime wiring αλλαγή). **Browser-
verify: skipped** (test files, μηδέν UI/observable behavior αλλαγή). Collision guard: `git
status --short` πριν το staging καθαρό (μόνο τα δικά μου 2 νέα αρχεία)· `git diff --cached
--name-only` μετά το staging επιβεβαίωσε exact 2-file match πριν το commit/push. Pushed
`badd548`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** επόμενοι υποψήφιοι χωρίς route-level coverage: `workspace/export/files`,
`invites/{resend,route}`, `audit`, `trials/sweep`, `billing/route.ts`, `auth/logout`,
`account/{reset/*,verify/*}`. Πριν ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση `WEB_DEBT.md`
για item στο territory (αν βρεθεί, πάει πρώτο).

## 2026-07-26 (cont. — increment 109, route-level test coverage για invites list/revoke + invites/resend)

Πριν από νέο increment: ask-inbox re-checked (`~/.claude/ASK_ACHILLEAS.md`, 8 OPEN entries — 5×
bakecore [finance ×2, redesigner, reviewer ×2, ui-rebuild], bakecore-tests macOS-TCC flag,
pharos-daily-dev P17/P23 mobile-camera approval· **τίποτα addressed σε saas-core**, μηδέν
ANSWERED). `WEB_DEBT.md` grep re-checked: όλα τα saas/tenancy/billing items της τελευταίας
σάρωσης είναι ήδη DONE (rate-limit, 3× guardless routes, getTenantConnection readyState)· τα 3
εναπομείναντα auto-buildable (Notifications requireAdmin, Voucher/GiftCard/LoyaltyCard
`vouchers/page.tsx` tenancy-parity, sampleDataActions.ts) είναι **εκτός territory** (feature
pages/actions, όχι saas/**) → δεν τα άγγιξα. UI-first backlog παραμένει εξαντλημένο. Ακολούθησα
το leftover next-task από το increment-108 log, παίρνοντας τα δύο **invites** routes μαζί (ίδιο
lifecycle surface: list/revoke + resend, ίδιο `resolveWorkspaceSession`-gated pattern).

Πριν το staging, `git status --short` ήταν **καθαρό** πλην των δύο δικών μου νέων αρχείων —
collision guard δεν χρειάστηκε να παραλείψει τίποτα.

**Νέο `invites/route.test.ts`** (20 tests), μηδέν production code αλλαγή. GET/DELETE =
outstanding-invite lifecycle (η επιφάνεια πίσω από το Invitations panel). Τα pure κομμάτια
τρέχουν **ΠΡΑΓΜΑΤΙΚΑ** εδώ (`parseInviteStatusFilter`/`inviteStatusQuery`/`inviteView`/
`collectInviteAccountIds` + `readBody`/`isObjectId`, ήδη unit-tested αλλού)· mocked seams:
`resolveWorkspaceSession`, `Invite`/`Account` models, `recordAudit`. Καλύπτει: gate
short-circuit περνάει αναλλοίωτο **πριν από οποιοδήποτε query**· και τα δύο verbs resolve με
`requireManage=true` (και το listing είναι management action)· `?status` default pending,
fallback σε pending σε garbage (**ποτέ unfiltered listing**), `'all'` ρίχνει εντελώς το status
constraint, `'accepted'` στενεύει· κάθε query scoped στο **δικό του tenant**· sort
`{createdAt:-1}`· μηδέν invites → **παραλείπει εντελώς το Account lookup** (όχι κενό `$in`)·
inviter+accepter identities σε **ΕΝΑ batched `$in`** (assert `toHaveBeenCalledTimes(1)` +
distinct ids across invitedBy/acceptedBy — anti-N+1) με deleted account → null αντί crash· blank
Account name → null (UI πέφτει στο email)· `expired` flag σωστά για past-TTL vs fresh pending·
**ο tokenHash ούτε projected ούτε serialized** (explicit assertion και στο projection string και
στο response body)· revoke scoped σε `{_id, tenant, status:'pending'}` (ένα workspace δεν
αγγίζει τα invites άλλου, accepted/revoked row μένει ανέγγιχτο → 404 + **μηδέν audit**)· missing
inviteId → 400 και malformed inviteId → 400 **πριν το Mongoose** (CastError guard), μηδέν write
και στα δύο· success audits `invite.revoked` με email target + role meta· mid-throw → καθαρό 500.

**Νέο `invites/resend/route.test.ts`** (17 tests), μηδέν production code αλλαγή. POST =
re-mint + re-send σε ένα βήμα (το «το link μπαγιάτεψε πριν το πατήσουν» κουμπί). Εδώ το
`mintInviteToken`/`hashInviteToken` + `pickBaseUrl` + `inviteEmail`/`inviteLinkUrl` τρέχουν
**ΠΡΑΓΜΑΤΙΚΑ** (mocked μόνο τα side-effecting `sendEmail`/`mailerCanDeliver`). Πέρα από τα ίδια
gating/guards, καλύπτει τις property-ες που κάνουν το resend σωστό: re-mint scoped σε
`{_id, tenant, pending}` με `{new:true}`· **αποθηκεύεται ΜΟΝΟ το hash** και αυτό το hash
**ταιριάζει πραγματικά** με το token που παίρνει πίσω ο caller (`hashInviteToken(devToken)` ===
persisted `$set.tokenHash`, + explicit assertion ότι το plaintext δεν εμφανίζεται πουθενά στο
update payload) — αυτό είναι το ίδιο το invariant που κάνει το νέο link redeemable· expiry
σπρώχνεται στο μέλλον· **δύο resends δίνουν δύο διαφορετικά tokens/hashes** (το προηγούμενο link
αποσύρεται, «newest link wins»)· audits `invite.resent`· mailer wired → mail στον invitee με link
που φέρνει το **φρέσκο** token (extract-άρεται από το html και ξανα-hash-άρεται για επαλήθευση)
και **μηδέν devToken** στο response· unwired + non-production → devToken echoed (local-testability
scaffold)· unwired + **production → σιωπηλά dropped, μηδέν leak**, αλλά το resend παραμένει
success· `SAAS_PUBLIC_URL` νικάει το request origin (fallback στο origin όταν λείπει).

**Verified**: και τα δύο νέα files **37/37 green** μαζί, ολόκληρο το invites tree **51/51**
(μαζί με το προϋπάρχον `accept/route.test.ts`, μηδέν regression). Ένα type-only fix στην πορεία
(`sendEmailMock` χωρίς explicit param type → `mock.calls[0][0]` type-άριζε ως empty tuple, tsc
TS2493 ×3 → typed param στο `vi.hoisted`, μηδέν runtime αλλαγή). Πλήρες `npx vitest run` →
**287 files / 4032 tests green** (από 283/3938 του increment-108 log: +4 files/+94 tests — τα 2
δικά μου + κάποια από άλλες ταυτόχρονες routines στο μεταξύ). `npm run type-check` → **EXIT 0
καθαρό**. **Docker: ΔΕΝ έγινε rebuild** (test-only, μηδέν production/runtime wiring αλλαγή —
άρα ούτε ο docker mutex χρειάστηκε). **Browser-verify: skipped** (test files, μηδέν UI/
observable behavior αλλαγή). Collision guard: `git status --short` πριν το staging έδειξε μόνο
τα 2 δικά μου untracked files· `git diff --cached --name-only` μετά επιβεβαίωσε exact 2-file
match πριν το commit/push. Pushed `a5d1499`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** επόμενοι υποψήφιοι χωρίς route-level coverage: `workspace/export/files`, `audit`,
`trials/sweep`, `billing/route.ts`, `auth/logout`, `account/{reset/*,verify/*}`. Το
`trials/sweep` (49 γρ.) + `auth/logout` (17 γρ.) είναι τα μικρότερα και πάνε άνετα μαζί σε ένα
increment· το `audit/route.ts` (110 γρ., cursor pagination + batched actor resolution) αξίζει
δικό του. Πριν ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση `WEB_DEBT.md` για item **μέσα στο
territory** (η τελευταία σάρωση δεν είχε κανένα — τα 3 ανοιχτά items είναι feature-side).

## 2026-07-26 (cont. — increment 110, route-level tests για trials/sweep + auth/logout, + saasGuard wrap στο logout)

Πριν από νέο increment: ask-inbox re-checked (`~/.claude/ASK_ACHILLEAS.md`, 8 OPEN entries — 6×
bakecore [finance ×2, redesigner, reviewer ×2, ui-rebuild], bakecore-tests macOS-TCC flag,
pharos-daily-dev P17/P23 mobile-camera approval· **τίποτα addressed σε saas-core**, μηδέν
ANSWERED). `WEB_DEBT.md` grep re-checked: τα 3 εναπομείναντα auto-buildable items
(Notifications requireAdmin, Voucher/GiftCard/LoyaltyCard tenancy-parity, sampleDataActions.ts)
είναι **εκτός territory** (feature pages/actions) → δεν τα άγγιξα, αμετάβλητα. UI-first backlog
παραμένει εξαντλημένο. Ακολούθησα το leftover next-task από το increment-109 log, παίρνοντας τα
δύο μικρά routes μαζί όπως προγραμματίστηκε (`trials/sweep` 49 γρ. + `auth/logout` 17 γρ.).

Πριν το staging, `git status --short` έδειξε **μόνο τα 3 δικά μου αρχεία** (2 νέα test files +
το τροποποιημένο logout route) — collision guard δεν χρειάστηκε να παραλείψει τίποτα.

**Νέο `trials/sweep/route.test.ts`** (18 tests), μηδέν production code αλλαγή. POST = ο
on-demand/external trigger του D4 trial-lapse sweep (warn 3 μέρες πριν, suspend όσα έληξαν). Ο
decision core του sweep (`shouldWarnTrial`/`planTrialWarnings`/`trialWarningFilter`/
`dunningEmail` + οι lapse planners) είναι ήδη πλήρως unit-tested αλλού → mocked εδώ μόνο το
`runTrialLapseSweep` στο module boundary (μαζί με `saasMode`)· ο **`saasGuard` τρέχει
ΠΡΑΓΜΑΤΙΚΑ** (pure), άρα το mid-throw test χτυπάει το production error shaping. Το βάρος πέφτει
στο **CRON_SECRET bearer gate**, που είναι ολόκληρη η ασφάλεια αυτού του endpoint (καλείται από
scheduler, όχι από session): missing header / non-Bearer scheme / lowercase `bearer` (η σύγκριση
προθέματος είναι case-sensitive) / κενό token μετά το `Bearer ` / λάθος token **ίδιου** μήκους /
λάθος token **διαφορετικού** μήκους (το length-guard πρέπει να short-circuit-άρει **πριν** το
`timingSafeEqual`, αλλιώς ένα one-char probe θα γύριζε 500 αντί 401 και θα διέρρεε πληροφορία
μήκους) / σωστό prefix με extra trailing χαρακτήρες → **όλα 401 χωρίς ποτέ να τρέξει το sweep**.
Επιπλέον property-ες: **η σειρά των gates** — `SAAS_MODE` off νικάει το missing `CRON_SECRET`
(→404, ώστε ένας self-hoster να ακούει «δεν υπάρχει» και ποτέ «κακορυθμισμένο»)· κενό string
`CRON_SECRET` = unset → 500 fail-closed· whitespace trim μέσα στο header· case-insensitive
header lookup· ο runner καλείται **χωρίς explicit clock** (`toHaveBeenCalledWith()` — η route
δεν επιτρέπεται να καρφώσει `now`, κερδίζει το default του runner)· και οι 5 counters
(`swept`/`warned`/`warnFailed`/`suspended`/`suspendFailed`) περνάνε αυτούσιοι· το **δικό του
no-op του runner (`swept:false`) βγαίνει ως τίμιο 200 ok:true**, όχι σαν σφάλμα· mid-throw →
καθαρό `{error}` 500.

**Νέο `auth/logout/route.test.ts`** (7 tests) **+ μία production αλλαγή**. Το logout ήταν το ένα
SaaS route που **δεν** ήταν τυλιγμένο σε `saasGuard` — ένα throw από το cookie store θα έβγαζε
την HTML 500 σελίδα του Next στη μέση του sign-out αντί για το uniform `{error}` JSON. Το
τύλιξα, **ακριβώς το ίδιο fix που είχε ήδη γίνει δεκτό** στα `invites/accept`, `audit`,
`workspace/erasure/purge` (commit `6f3de54`, P2 εύρημα της 57ης σάρωσης) → ίδια κλάση, μηδέν
νέα απόφαση. Το gate παραμένει **πρώτο**, άρα το 404 (SAAS_MODE off) και το 500 (AUTH_SECRET
unset) είναι byte-for-byte αμετάβλητα, και στο self-hosted (SAAS_MODE off) η route δεν φτάνει
ποτέ στο σώμα της. Tests: και τα δύο gate short-circuits περνάνε **αναλλοίωτα** με το cookie να
**μην αγγίζεται καθόλου** πριν αποφασίσει το gate· gate consulted ακριβώς μία φορά· success
καθαρίζει το cookie **ακριβώς μία φορά, χωρίς ορίσματα** → `{ok:true}`· **idempotent** (δεύτερο
logout χωρίς session → πάλι 200, το UI δεν πρέπει ποτέ να δει σφάλμα για «ήδη αποσυνδεδεμένος»)·
throw από το cookie store → καθαρό 500 JSON (αυτό ακριβώς που ξεκλείδωσε το wrap).

**Verified**: τα δύο νέα files **25/25 green** μαζί. Πλήρες `npx vitest run` → **291 files /
4133 tests green** (από 287/4032 του increment-109 log: +4 files/+101 tests — τα 2 δικά μου +
κάποια από άλλες ταυτόχρονες routines στο μεταξύ). `npm run type-check` → **EXIT 0 καθαρό**
(μηδέν type fix χρειάστηκε αυτή τη φορά). **Docker: ΔΕΝ έγινε rebuild** — η μόνη production
αλλαγή είναι ένα wrapper σε SaaS route που στο τρέχον self-hosted deployment (SAAS_MODE off)
είναι ούτως ή άλλως 404, μηδέν runtime wiring/env/deps αλλαγή → ούτε ο docker mutex χρειάστηκε.
**Browser-verify: skipped** (μηδέν UI/observable αλλαγή). Collision guard: `git status --short`
πριν το staging = μόνο τα 3 δικά μου· `git diff --cached --name-only` μετά επιβεβαίωσε exact
3-file match πριν το commit/push. Pushed `05da7eb`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** επόμενοι υποψήφιοι χωρίς route-level coverage: `workspace/export/files`,
`audit/route.ts`, `billing/route.ts`, `account/{reset/*,verify/*}`. Το **`audit/route.ts`**
(110 γρ., cursor pagination + batched actor resolution) είναι το πιο ουσιαστικό που απομένει και
αξίζει δικό του increment — το cursor encoding/decoding και το anti-N+1 batching είναι ακριβώς
οι property-ες που σπάνε σιωπηλά. Τα `account/reset/*` + `account/verify/*` (token lifecycle,
ίδιο idiom με το ήδη-tested `invites/resend`) πάνε άνετα μαζί σε ένα επόμενο. Πριν ξεκινήσεις:
ask-inbox πρώτα, μετά νέα σάρωση `WEB_DEBT.md` για item **μέσα στο territory** (οι τελευταίες 2
σαρώσεις δεν είχαν κανένα — τα 3 ανοιχτά items είναι feature-side).

## 2026-07-26 (cont. — increment 111, route-level tests για audit/route.ts, το activity-trail read surface)

Πριν από νέο increment: ask-inbox re-checked (`~/.claude/ASK_ACHILLEAS.md`, 9 OPEN entries — 7×
bakecore [finance ×2, redesigner, reviewer ×2, ui-rebuild ×2], bakecore-tests macOS-TCC flag,
pharos-daily-dev P17/P23 mobile-camera approval· **τίποτα addressed σε saas-core**, μηδέν
ANSWERED). `WEB_DEBT.md` grep re-checked: τα 3 εναπομείναντα auto-buildable items (Notifications
requireAdmin, Voucher/GiftCard/LoyaltyCard `vouchers/page.tsx` tenancy-parity, sampleDataActions.ts)
είναι **εκτός territory** (feature pages/actions) → αμετάβλητα, δεν τα άγγιξα. UI-first backlog
παραμένει εξαντλημένο. Πήρα το leftover next-task του increment-110 log: το `audit/route.ts`
(110 γρ.), το πιο ουσιαστικό untested route που απομένει.

Πριν το staging, `git status --short` έδειξε **μόνο το ένα δικό μου νέο αρχείο** — collision
guard δεν χρειάστηκε να παραλείψει τίποτα.

**Νέο `audit/route.test.ts`** (37 tests), **μηδέν production code αλλαγή**. GET = το read
surface πίσω από το Activity panel, και το **μόνο SaaS route με keyset pagination**. Οι pure
helpers (`parseAuditAction`/`collectActorIds`/`auditView`/`redactMeta`) τρέχουν **ΠΡΑΓΜΑΤΙΚΑ**
εδώ, άρα τα projection/redaction assertions χτυπάνε τον production serializer, όχι stub· mocked
seams μόνο `resolveWorkspaceSession` + τα δύο models (`AuditEvent`, `Account`). ΣΗΜ: αυτό το
route δεν είναι `saasGuard`-wrapped αλλά έχει **δικό του inline try/catch** — σκόπιμο, είναι το
accepted idiom των 3 routes που έκλεισε το commit `6f3de54` (invites/accept, audit,
erasure/purge· το gate πρέπει να τρέξει πριν το try γιατί επιστρέφει responses) → μηδέν νέα
production αλλαγή χρειάστηκε, σε αντίθεση με το logout του increment-110.

Καλύπτει: **gating** — το gate short-circuit περνάει αναλλοίωτο **πριν από οποιοδήποτε query**·
`requireManage=true` (η ανάγνωση του trail είναι management action)· forward του `?tenant`, `null`
όταν λείπει. **Scoping (το isolation invariant)** — το query χρησιμοποιεί ΠΑΝΤΑ το tenantId του
**session**, ποτέ το slug που ζητήθηκε (test με `?tenant=someone-elses-workspace` → query στο
δικό του tenant). **`?action`** — γνωστό verb στενεύει· trim + lowercase (` INVITE.SENT ` →
`invite.sent`)· άγνωστο verb **ρίχνει το filter και απαντά 'all' με 200**, δεν 400άρει ένα read·
κενό = no filter. **`?limit`** — default 50· floor σε fractional (ποτέ non-integer `.limit()`)·
clamp στο 200 ceiling (ceiling δεκτό exactly)· fallback σε 50 για garbage/zero/negative/empty/
`Infinity` (parametrized ×5)· και **ο αριθμός που γυρνά στον caller είναι αυτός που πράγματι
πέρασε στο `.limit()`**. **`?before` cursor** — parseable ISO → `{ $lt: Date }` στο `createdAt`·
**unparseable → ΑΓΝΟΕΙΤΑΙ** (ένα stale/mangled cursor από παλιό client πρέπει να πέφτει σε «first
page», όχι σε σφάλμα)· κενό ignored· cursor + action + limit **σε ΕΝΑ query** (page 2 φιλτραρισμένου
trail). **Actor resolution** — μηδέν events → **παραλείπει εντελώς το Account lookup** (όχι κενό
`$in`)· όλα system-originated (null actor) → επίσης καθόλου lookup· **ΕΝΑ batched `$in`** με
distinct ids μόνο (`toHaveBeenCalledTimes(1)`, το null actor δεν συνεισφέρει — anti-N+1)·
deleted account → nulls αντί crash· blank name → null (UI πέφτει στο email)· account χωρίς email
→ null email αλλά κρατά το name· **ObjectId-like ids stringify-άρονται και στις δύο πλευρές** ώστε
να ταιριάζουν ακόμα. **Leakage** — η projection είναι **ακριβώς** `'action actor target meta
createdAt'` (assertion και στο string και στο body: `tokenHash` σε row **δεν** φτάνει στον client)·
secret-looking meta keys (`resetToken`/`passwordHash`) **re-redacted στην έξοδο** (defence in depth
για legacy rows). **Failure** — throw στο event query ΚΑΙ throw στο Account lookup → uniform
`{error}` 500· message-less throw → `'Server error'`· 5000-char message → **truncated στα 200**
(κανένα internal dump δεν φεύγει στο body).

**Verified**: το νέο file **37/37 green** (πέρασε από την πρώτη). Πλήρες `npx vitest run` →
**293 files / 4198 tests green** (από 291/4133 του increment-110 log: +2 files/+65 tests — το ένα
δικό μου + ένα από άλλη ταυτόχρονη routine). `npm run type-check` → **EXIT 0 καθαρό** μετά από
ένα type-only fix: το `eventSelect` ως zero-arg `vi.fn(() => …)` έκανε το `mock.calls[0][0]` να
type-άρει ως empty tuple (**TS2493, το ίδιο σφάλμα που είχε βγει και στο increment 109**) → typed
param `(_projection: string)` στο `vi.hoisted`, μηδέν runtime αλλαγή (και έφυγε ένα περιττό
`as unknown as string` cast). **Docker: ΔΕΝ έγινε rebuild** (test-only, μηδέν production/runtime
wiring αλλαγή → ούτε ο docker mutex χρειάστηκε). **Browser-verify: skipped** (test file, μηδέν
UI/observable behavior αλλαγή). Collision guard: `git status --short` πριν το staging = μόνο το 1
δικό μου untracked file, μηδέν staged από άλλη routine· `git diff --cached --name-only` μετά
επιβεβαίωσε exact 1-file match πριν το commit/push. Pushed `29cddf2`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** επόμενοι υποψήφιοι χωρίς route-level coverage — απομένουν **6**:
`account/reset/{request,confirm}` (80+54 γρ.) και `account/verify/{request,confirm}` (56+42 γρ.)
είναι δύο φυσικά ζευγάρια token-lifecycle (ίδιο mint/hash/consume idiom με το ήδη-tested
`invites/resend` — το reset ζευγάρι πρώτο, είναι το security-sensitive: single-use consumption,
hash-only at rest, no user-enumeration στο request path)· μετά `workspace/export/{route,files}`
(77+82 γρ., τα δύο GDPR export surfaces, πάνε μαζί)· και `billing/route.ts` (69 γρ., plan/quota
read). Πριν ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση `WEB_DEBT.md` για item **μέσα στο
territory** (οι τελευταίες 3 σαρώσεις δεν είχαν κανένα — τα 3 ανοιχτά items είναι feature-side).

## 2026-07-26 (cont. — increment 112, route-level tests για το reset ζευγάρι request+confirm)

Πριν από νέο increment: ask-inbox re-checked (`~/.claude/ASK_ACHILLEAS.md`, **τίποτα addressed σε
saas-core**, μηδέν ANSWERED — `grep saas-core` = μηδέν hits). `WEB_DEBT.md` grep re-checked: τα 3
εναπομείναντα auto-buildable items (Notifications requireAdmin, Voucher/GiftCard/LoyaltyCard
tenancy-parity, sampleDataActions.ts) είναι **εκτός territory** (feature pages/actions) → μηδέν
αλλαγή, δεν τα άγγιξα. UI-first backlog παραμένει εξαντλημένο. Πήρα το leftover next-task του
increment-111 log: το **security-sensitive** `account/reset/{request,confirm}` ζευγάρι.

Πριν το staging, `git status --short` έδειξε **μόνο τα 2 δικά μου νέα αρχεία**, μηδέν staged από
άλλη routine — collision guard δεν χρειάστηκε να παραλείψει τίποτα.

**Νέο `reset/request/route.test.ts`** (31 tests), **μηδέν production code αλλαγή**. Είναι το
UNAUTHENTICATED forgot-password entry point, και όλο του το συμβόλαιο είναι τι **δεν** πρέπει να
αποκαλύψει. Πραγματικά τρέχουν: `mintResetToken`/`hashResetToken`, `normalizeEmail`/`looksLikeEmail`,
`pickBaseUrl`, `resetEmail`/`resetLinkUrl`, `readBody`/`strField`, `saasGuard`· mocked seams:
`saasAuthGate`, `connectDB`, `Account`, `sendEmail`+`mailerCanDeliver`, και το
`settleMinResponseTime` (mocked ώστε το suite να μην κοιμάται 500ms/case — η αριθμητική του είναι
ήδη unit-tested στο `resetTiming.test.ts`).
Καλύπτει: **gating** — και τα δύο short-circuits περνάνε αναλλοίωτα **πριν καν διαβαστεί το body**
(`req.json` spy = μηδέν κλήσεις), μηδέν DB, μηδέν floor· gate consulted ακριβώς μία φορά.
**Validation** — 8 παραλλαγές κακού email (missing/blank/no-@/no-dot/spaces/numeric/object/null) →
400 χωρίς DB· και το κρίσιμο: το malformed-400 **ΔΕΝ** παίρνει floor (input-only, δεν διαρρέει
ύπαρξη — η τεκμηριωμένη εξαίρεση)· normalization (trim+lowercase) **πριν** φτάσει στη Mongo.
**Anti-enumeration (το invariant)** — registered vs unregistered με wired mailer επιστρέφουν
**byte-identical body** (σύγκριση `.text()`, όχι deep-equal) και **και τα δύο** παίρνουν το floor,
με το `startedAt` να είναι πραγματικός timestamp μέσα στο παράθυρο του handler (D6). **Minting** —
persist **μόνο hash**, και `hashResetToken(devToken)` === ό,τι γράφτηκε (η property που κάνει το
link redeemable), το plaintext ΔΕΝ μπαίνει στο row, expiry ακριβώς ένα `RESET_TTL_MS` μπροστά,
διαφορετικό token σε κάθε κλήση. **Dev-token scaffold** — unwired+non-production echo· unwired+
**production** → σιωπηλό drop **αλλά το token παραμένει persisted** (fail closed, όχι μισό flow)·
wired → email στο σωστό address με link του οποίου το token hash-άρει σε ό,τι αποθηκεύτηκε, μηδέν
devToken. **Fire-and-forget** — sendEmail που **κάνει reject** ΚΑΙ sendEmail που **δεν settle-άρει
ποτέ** αφήνουν και τα δύο το response να γυρίσει 200 (αυτό ακριβώς κρατά το mail latency έξω από το
timed path)· `SAAS_PUBLIC_URL` νικά το request origin, fallback στο origin. **Failure** — lookup
throw / save throw → uniform `{error}` 500· message-less → `'Server error'`· 5000-char → truncated
στα 200.

**Νέο `reset/confirm/route.test.ts`** (29 tests), **μηδέν production code αλλαγή**. Το redemption
half — το μόνο unauthenticated route που **γράφει password**, άρα το token είναι όλη η απόδειξη
ιδιοκτησίας. Πραγματικά τρέχουν `hashResetToken`/`isResetTokenValid`/`resetPasswordError` (η
policy ελέγχεται στην production της μορφή)· mocked μόνο gate/`connectDB`/`Account`/`hashPassword`.
Καλύπτει: **σειρά validation** — missing token νικάει την password policy όταν είναι και τα δύο
κακά, και **και τα δύο** πέφτουν πριν από οποιοδήποτε DB touch (`connectDB` μηδέν κλήσεις)·
whitespace-only token → 400· trim πριν το hashing· password ακριβώς στο minimum περνάει.
**Lookup** — filter = **ΜΟΝΟ** `{resetTokenHash: sha256}`, το plaintext token δεν φτάνει ποτέ στη
Mongo (assert και με `JSON.stringify(filter)`)· projection ακριβώς `'_id resetTokenHash
resetTokenExpires'` (μηδέν passwordHash/email). **Generic failure** — unknown token / expired πριν
μία ώρα / expired πριν 1ms / null expiry (ήδη consumed) / undefined / unparseable Date → **όλα το
ΙΔΙΟ** `'This reset link is invalid or has expired'` με μηδέν write και μηδέν `hashPassword` κλήση
(τίποτα δεν ξεχωρίζει «άγνωστο» από «ληγμένο»)· expiry αποθηκευμένο ως ISO string γίνεται δεκτό.
**Consumption** — αποθηκεύεται η έξοδος του `hashPassword`, ποτέ το plaintext· **ένα** `.set()` που
μηδενίζει **και τα δύο** reset πεδία μαζί με το νέο hash (single-use· ένα replay δεν βρίσκει τίποτα
να εξαργυρώσει)· `save` ακριβώς μία φορά· body ακριβώς `{"ok":true}`, μηδέν account info.
**Failure** — ίδιο 500 shaping quartet.

**Verified**: τα δύο νέα files **60/60 green** μαζί (πέρασαν από την πρώτη — 59 αρχικά, +1 μετά το
split ενός parametrized case). Πλήρες `npx vitest run` → **296 files / 4269 tests green** (από
293/4198 του increment-111 log: +3 files/+71 tests — τα 2 δικά μου + 1 από άλλη ταυτόχρονη routine).
`npm run type-check` → **EXIT 0** μετά από δύο test-only fixes: (α) `process.env.NODE_ENV = …` είναι
read-only στο TS (TS2540 ×3) → `vi.stubEnv` + `vi.unstubAllEnvs`, το idiom που ήδη χρησιμοποιεί το
`invites/resend` test· (β) ένα `{ toString: () => 'x' }` fixture έβγαζε TS7023 (implicit any) →
αντικαταστάθηκε με δύο πιο τίμια non-string cases (numeric + plain object). **Docker: ΔΕΝ έγινε
rebuild** (test-only, μηδέν production/runtime wiring/env/deps αλλαγή → ούτε ο docker mutex
χρειάστηκε). **Browser-verify: skipped** (test files, μηδέν UI/observable behavior αλλαγή).
Collision guard: `git status --short` πριν το staging = μόνο τα 2 δικά μου untracked, μηδέν staged
από άλλη routine· `git diff --cached --name-only` μετά επιβεβαίωσε exact 2-file match πριν το
commit/push. Pushed `b2639ec`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** απομένουν **4** routes χωρίς route-level coverage. Το ζευγάρι
`account/verify/{request,confirm}` (56+42 γρ.) είναι το φυσικό επόμενο — **ίδιο ακριβώς token
lifecycle idiom** με το reset που μόλις καλύφθηκε (mint → hash-at-rest → single-use consume), άρα
τα δύο test files γράφονται γρήγορα ως παραλλαγή αυτού του increment· προσοχή στη διαφορά: το
verify **δεν** έχει anti-enumeration floor (δεν είναι forgot-password), οπότε μην αντιγράψεις τα
timing assertions τυφλά. Μετά: `workspace/export/{route,files}` (77+82 γρ., τα δύο GDPR export
surfaces, πάνε μαζί) και `billing/route.ts` (69 γρ., plan/quota read). Πριν ξεκινήσεις: ask-inbox
πρώτα, μετά νέα σάρωση `WEB_DEBT.md` για item **μέσα στο territory** (οι τελευταίες 4 σαρώσεις δεν
είχαν κανένα — τα 3 ανοιχτά items είναι feature-side).

## 2026-07-26 (cont. — increment 114, route-level tests για το verify ζευγάρι request+confirm)

Πριν από νέο increment: ask-inbox re-checked (`~/.claude/ASK_ACHILLEAS.md`, **τίποτα addressed σε
saas-core**, μηδέν ANSWERED — `grep saas-core` = μηδέν hits). `WEB_DEBT.md` re-scanned: τα 3
εναπομείναντα auto-buildable items (Notifications requireAdmin, Voucher/GiftCard/LoyaltyCard
tenancy-parity, sampleDataActions.ts) παραμένουν **εκτός territory** (feature pages/actions) →
μηδέν αλλαγή, δεν τα άγγιξα. UI-first backlog παραμένει εξαντλημένο. Πήρα το next-task του
increment-112 log: το ζευγάρι `account/verify/{request,confirm}`.

Πριν το staging, `git status --short` έδειξε **μόνο τα 2 δικά μου νέα αρχεία**, μηδέν staged από
άλλη routine.

**Νέο `verify/request/route.test.ts`** (27 tests), **μηδέν production code αλλαγή**. Είναι ο
**AUTHENTICATED** αδερφός του reset/request, και αυτή ακριβώς η διαφορά ορίζει το συμβόλαιο: αφού
η διεύθυνση-στόχος έρχεται από το session (ποτέ από το body), δεν υπάρχει enumeration surface →
**σκόπιμα ΔΕΝ έχει timing floor** και **επιτρέπεται** να απαντά διαφορετικά για ήδη-verified
λογαριασμό. Το ίδιο το test το κατοχυρώνει (`verified !== unverified` byte-wise) ώστε να μην
αντιγραφούν τυφλά τα anti-enumeration assertions του reset. Πραγματικά τρέχουν:
`mintVerifyToken`/`hashVerifyToken`/`VERIFY_TTL_MS`, `verifyEmail`/`verifyLinkUrl`, `pickBaseUrl`,
`saasGuard`· mocked seams: `saasAuthGate`, `getCurrentAccount`, `connectDB`, `Account`,
`sendEmail`+`mailerCanDeliver`.
Καλύπτει: **gating** — και τα δύο short-circuits περνάνε **πριν καν διαβαστεί το session** (μηδέν
`getCurrentAccount`, μηδέν DB)· gate consulted ακριβώς μία φορά. **Ταυτότητα** — μηδέν session →
401 χωρίς DB· lookup **αποκλειστικά** με το `claims.sub` (τίποτα caller-supplied)· dangling cookie
(session ok, row σβησμένο) → 404 χωρίς mint· projection ακριβώς `'_id email emailVerified'`.
**Already-verified** — `{ok, alreadyVerified}` με **μηδέν** `.set()`, μηδέν `.save()`, μηδέν email,
και **μηδέν devToken leak** ακόμα και σε dev με unwired mailer. **Minting** — persist μόνο hash και
`hashVerifyToken(devToken)` === ό,τι γράφτηκε (η property που κάνει το link redeemable)· το
plaintext ΔΕΝ μπαίνει στο row (`JSON.stringify` assertion)· **ένα** `.set()` με ακριβώς τα 2 verify
πεδία· expiry ακριβώς ένα `VERIFY_TTL_MS` (**24h, τετραπλάσιο του reset TTL** — assert-άρεται και η
ίδια η σταθερά)· διαφορετικό token σε κάθε κλήση. **Dev-token scaffold** — unwired+non-production
echo· unwired+**production** → σιωπηλό drop **αλλά το token παραμένει persisted** (fail closed,
ώστε ένα μελλοντικό mailer wiring να μπορεί να ξαναστείλει)· wired → ποτέ devToken. **Email** —
πάει στο **session** account address, subject/link πραγματικά χτισμένα, το token του link
hash-άρει σε ό,τι αποθηκεύτηκε, percent-encoding του base64url ελέγχεται με round-trip decode·
`SAAS_PUBLIC_URL` > `APP_URL` > request origin (και τα 3 ξεχωριστά). **Ασυμμετρία που καρφώθηκε
ρητά**: αυτό το route κάνει **`await sendEmail(...)`** ενώ το reset/request κάνει `void
sendEmail(...).catch()` → rejecting mailer εδώ βγάζει **500** (με το token ήδη persisted). Το
τεστ το τεκμηριώνει ως συνειδητή διαφορά, ώστε μια μελλοντική αλλαγή σε οποιοδήποτε από τα δύο
routes να είναι απόφαση, όχι σιωπηλό drift. **Failure** — lookup throw / save throw → uniform
`{error}` 500· message-less → `'Server error'`· 5000-char → truncated στα 200.

**Νέο `verify/confirm/route.test.ts`** (28 tests), **μηδέν production code αλλαγή**. Το redemption
half — UNAUTHENTICATED, το token από το inbox ΕΙΝΑΙ όλη η απόδειξη ιδιοκτησίας της διεύθυνσης.
Πραγματικά τρέχουν `hashVerifyToken`/`isVerifyTokenValid`, `readBody`/`strField`, `saasGuard`·
mocked μόνο gate/`connectDB`/`Account`.
Καλύπτει: **validation** — 6 παραλλαγές κακού token (missing/empty/whitespace/null/false/
unparseable-body, το τελευταίο περνά από το `readBody` swallow) → 400 με **μηδέν** `connectDB`·
trim πριν το hashing (copy-paste με whitespace εξαργυρώνεται κανονικά). **Lookup** — filter =
**ΜΟΝΟ** `{verifyTokenHash: sha256}` (assert και σε `Object.keys` και σε `JSON.stringify` ότι το
plaintext δεν φτάνει ποτέ στη Mongo)· projection ακριβώς `'_id verifyTokenHash verifyTokenExpires
emailVerified'` (μηδέν email/passwordHash). **Generic failure** — unknown / expired πριν μία ώρα /
expired πριν 1ms / null expiry / undefined / unparseable Date → **όλα το ΙΔΙΟ**
`'This verification link is invalid or has expired'` με μηδέν write· επιπλέον byte-identical body
σύγκριση unknown vs expired (`.text()`)· expiry αποθηκευμένο ως ISO string γίνεται δεκτό.
**Consumption** — **ένα** `.set()` που θέτει `emailVerified:true` και μηδενίζει **και τα δύο**
verify πεδία μαζί (single-use)· `save` ακριβώς μία φορά· **replay test** (δεύτερο κλικ του ίδιου
link → ο καθαρισμένος hash δεν ματσάρει → generic 400)· already-verified με ζωντανό token είναι
ακίνδυνο· body ακριβώς `{"ok":true}`, μηδέν account info. **Failure** — ίδιο 500 shaping quartet.

**Verified**: τα δύο νέα files **55/55 green** (πέρασαν από την πρώτη, μηδέν fix). Πλήρες
`npx vitest run` → **299 files / 4370 tests green** (από 296/4269 του increment-112 log: +3 files/
+101 tests — τα 2 δικά μου + 1 από άλλη ταυτόχρονη routine). `npm run type-check` → **EXIT 0
καθαρό από την πρώτη** (τα δύο TS παγιδάκια των προηγούμενων increments αποφεύχθηκαν προληπτικά:
typed `_projection: string` param στα `vi.hoisted` select mocks ώστε το `mock.calls[0][0]` να μην
type-άρει ως empty tuple [TS2493], και `vi.stubEnv('NODE_ENV', …)` αντί για direct assignment
[TS2540]). **Docker: ΔΕΝ έγινε rebuild** (test-only, μηδέν production/runtime wiring/env/deps
αλλαγή → ούτε ο docker mutex χρειάστηκε). **Browser-verify: skipped** (test files, μηδέν
UI/observable behavior αλλαγή). Collision guard: `git status --short` πριν το staging = μόνο τα 2
δικά μου untracked, μηδέν staged από άλλη routine· `git diff --cached --name-only` μετά
επιβεβαίωσε exact 2-file match πριν το commit/push. Pushed `07d7ea1`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** απομένουν **2** routes χωρίς route-level coverage: `workspace/export/{route,files}`
(77+82 γρ., τα δύο GDPR export surfaces — πάνε μαζί σε ένα increment, μοιράζονται το ίδιο
serialization/scope idiom) και `billing/route.ts` (69 γρ., plan/quota read). Με το `export` ζευγάρι
το route-level coverage του SaaS surface κλείνει σχεδόν εντελώς — αξίζει μετά μια σάρωση για το τι
ΑΛΛΟ μέσα στο territory δεν έχει coverage (π.χ. `lib/tenancy/**` helpers χωρίς unit tests, ή
`components/saas/**` pure helpers) αντί να θεωρηθεί το backlog εξαντλημένο. Πριν ξεκινήσεις:
ask-inbox πρώτα, μετά νέα σάρωση `WEB_DEBT.md` για item **μέσα στο territory** (οι τελευταίες 5
σαρώσεις δεν είχαν κανένα — τα 3 ανοιχτά items είναι feature-side).

## 2026-07-26 (cont. — increment 116, route-level tests για το export ζευγάρι content+files)

Πριν από νέο increment: ask-inbox re-checked (`~/.claude/ASK_ACHILLEAS.md`, **μηδέν entry addressed
σε saas-core**, μηδέν ANSWERED — `grep saas-core` = 0 hits). `WEB_DEBT.md` re-scanned (60ή σάρωση):
τα 3 ενεργά items (`bills/actions.ts`, `statements/actions.ts`, `vouchers/page.tsx` tenancy-parity)
είναι **και τα 3 feature-side**, εκτός territory → μηδέν αλλαγή, δεν τα άγγιξα. Πήρα το next-task
του increment-114 log: το ζευγάρι `workspace/export/{route,files}`.

Πριν το staging, `git status --short` έδειξε **μόνο τα 2 δικά μου νέα αρχεία**, μηδέν staged από
άλλη routine.

**Νέο `workspace/export/route.test.ts`** (30 tests), **μηδέν production code αλλαγή**. Είναι το
workspace-level GDPR Art. 20 surface (dump ολόκληρου του tenant data db ως JSON). Mock ΜΟΝΟ στο
`collectWorkspaceData` (ο node-only tenant-db reader) + session/audit seams· **πραγματικά τρέχουν**
`buildWorkspaceExport`, `workspaceExportFilename`, `resolveMaxDocs`, `saasGuard`.
Καλύπτει: **session contract** — assert-άρεται ρητά `(slug, requireManage=true, allowInactive=true)`,
δηλαδή owner/admin ΑΛΛΑ **σκόπιμα όχι gated στο billing status** (η φορητότητα δεδομένων δεν
επιτρέπεται να κόβεται σε suspended/canceled workspace· αν κάποιος γυρίσει το `allowInactive` σε
false, το τεστ σκάει)· `?tenant=` προωθείται **verbatim** (η κανονικοποίηση είναι δουλειά του
resolver)· και τα 3 short-circuits (gate 404 / 401 / no-workspace 404) περνάνε **by identity**
(`toBe`) με **μηδέν** db read και **μηδέν** audit. **Scoping** — ο reader παίρνει το ctx object
**του session** (assert με `toBe`, όχι deep-equal: τίποτα caller-supplied). **Cap** — το
`WORKSPACE_EXPORT_MAX_DOCS` περνά από τον πραγματικό `resolveMaxDocs`: blank → default 10000,
αριθμός → εφαρμόζεται **και** echo-άρεται στο envelope, non-numeric/0/negative → default (δηλαδή
ποτέ «διάβασε τίποτα»), δεκαδικό → floor. **Envelope** — versioned format, parseable `generatedAt`,
workspace block **ακριβώς 4 whitelisted πεδία** από το **tenant doc** + ρητό assertion ότι
`stripeCustomerId`/`aiKeyCipher` **δεν εμφανίζονται στο body** (τα βάζω επίτηδες στο fixture)· τα
docs περνάνε verbatim (είναι τα δεδομένα του χρήστη)· άδειο workspace → 200 με `collections: []`·
pretty-print 2 κενών. **Audit** — action/actor σωστά και **`target` = ο slug του MEMBERSHIP**, ενώ
το payload/filename διαβάζουν τον slug του **tenant doc**: το fixture δίνει σκόπιμα διαφορετικές
τιμές στα δύο ώστε η διάκριση να είναι καρφωμένη· meta = collections/docs/truncated υπολογισμένα
από το dump (truncated true όταν **οποιαδήποτε** συλλογή κόπηκε). **Headers** — attachment +
`no-store` + filename από τον slug, και **hostile slug** (`ac me"; rm -rf /`) → το
Content-Disposition παραμένει καθαρό (regex σε όλη τη γραμμή, κανένα ξεκάρφωτο quote), slug χωρίς
safe χαρακτήρες → fallback `workspace`. **Failure** — reader throw → 500 χωρίς audit· **audit
throw → 500** (κατοχυρώνει ότι το audit row είναι awaited ΠΡΙΝ φύγει το σώμα, δηλαδή ένα
αποτυχημένο audit χάνει το export· συμπεριφορικό pin του ordering)· message-less → `'Server error'`·
5000 chars → 200.

**Νέο `workspace/export/files/route.test.ts`** (28 tests), **μηδέν production code αλλαγή**. Το
binary μισό (manifest των PDF/photos κάτω από το STORAGE_ROOT). Mock και οι **δύο** node-only
readers (`collectWorkspaceFileRefs` = tenant db, `statWorkspaceFiles` = filesystem) + session/audit·
πραγματικά τρέχουν `buildFileManifest` + `workspaceFilesManifestFilename`.
Καλύπτει: **ίδιο session contract** (assert ρητά `(slug, true, true)`) και short-circuit
pass-through **χωρίς db, χωρίς disk, χωρίς audit**. **Pipeline wiring** — refs από το ctx του
session, και το stat δέχεται **ακριβώς** το array που γύρισε ο db reader (`toBe`: τίποτα δεν
προστίθεται, τίποτα δεν χάνεται ενδιάμεσα). **Report-only συμβόλαιο** — κάθε entry έχει **ακριβώς**
`path/bucket/exists/bytes` (assert σε `Object.keys`, ώστε μια μελλοντική προσθήκη περιεχομένου
αρχείου να σπάει το τεστ) + το notice λέει ρητά «report only / no file contents». **Totals** —
υπολογίζονται από τα entries, άρα `present + missing === files` πάντα, και ένα παράλογο **αρνητικό
μέγεθος** δεν μπορεί να ρίξει το byte total κάτω από το πραγματικό άθροισμα. **Audit** — το meta
είναι **τα ίδια τα totals του manifest** (assert `toEqual(json.totals)`: header και audit δεν
μπορούν να διαφωνήσουν). **Headers** — filename `-files.json`, ρητά **διαφορετικό** από του content
export ώστε τα δύο downloads να μη συγκρούονται, ίδια hostile-slug + fallback κάλυψη. **Failure** —
db throw → 500 **χωρίς stat και χωρίς audit**, filesystem throw → 500 χωρίς audit, audit throw →
500, plus το ίδιο 500 shaping quartet.

**Verified**: τα δύο νέα files **58/58 green από την πρώτη εκτέλεση** (30+28). Πλήρες
`npx vitest run` → **302 files / 4474 tests green** (από 299/4370 του increment-114 log: +3 files/
+104 tests — τα 2 δικά μου + 1 από άλλη ταυτόχρονη routine). `npm run type-check` → **EXIT 0** μετά
από ένα test-only fix: το γνωστό **TS2493** ξαναχτύπησε από άλλη γωνία — ο `recordAuditMock` ήταν
`vi.fn(async () => true)` (argless) οπότε το `mock.calls[0]` type-άρει ως **empty tuple** και τα
`calls[0][0]`/`[1]` έσκαγαν (12 errors). Fix: typed params `(_ctx: unknown, _entry: unknown)` στο
`vi.hoisted` mock. ΣΗΜ για επόμενα increments: το idiom «typed params στα hoisted mocks» χρειάζεται
**σε κάθε mock του οποίου τα calls γίνονται index**, όχι μόνο στα select mocks. **Docker: ΔΕΝ έγινε
rebuild** (test-only, μηδέν production/runtime wiring/env/deps αλλαγή → ούτε ο docker mutex
χρειάστηκε). **Browser-verify: skipped** (test files, μηδέν UI/observable behavior αλλαγή).
Collision guard: `git status --short` πριν το staging = μόνο τα 2 δικά μου untracked, μηδέν staged
από άλλη routine· `git diff --cached --name-only` μετά επιβεβαίωσε exact 2-file match πριν το
commit/push. Pushed `8bbbd14`.

**## Needs Achilleas:** τίποτα νέο.

**Next task:** το route-level coverage του SaaS surface είναι πλέον **σχεδόν πλήρες** — απομένει
**ένα** route, το `billing/route.ts` (69 γρ., plan/quota read· μικρό, φυσικό κλείσιμο της σειράς).
Μετά ΜΗΝ θεωρήσεις το backlog εξαντλημένο: σάρωσα τι άλλο **μέσα στο territory** δεν έχει unit
tests και βρήκα **8 modules** (`lib/tenancy/`: `context.ts` 140γρ., `provision.ts` 103, `saasApi.ts`
85, `saasPage.ts` 40, `superadminPage.ts` 48, `workspaceSession.ts` 91· `lib/billing/`:
`billingSession.ts` 71, `stripe.ts` 145). Προτεραιότητα: **`workspaceSession.ts` πρώτο** — είναι ο
κοινός authz resolver που mock-άρουν ΟΛΑ τα workspace route tests (8 αρχεία), δηλαδή το μόνο
κομμάτι που κανένα route test δεν εκτελεί ποτέ πραγματικά· ένα bug εκεί (π.χ. λάθος σειρά gate →
session → membership → status) θα περνούσε σιωπηλά όλη τη σουίτα. Μετά `context.ts` (tenant
resolution, ίδια κλάση κινδύνου) και `saasApi.ts` (`saasAuthGate`/`accountTenants`). Πριν
ξεκινήσεις: ask-inbox πρώτα, μετά νέα σάρωση `WEB_DEBT.md` για item **μέσα στο territory** (οι
τελευταίες 6 σαρώσεις δεν είχαν κανένα).
