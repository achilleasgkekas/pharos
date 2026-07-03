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
