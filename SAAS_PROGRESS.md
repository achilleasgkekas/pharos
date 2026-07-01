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
