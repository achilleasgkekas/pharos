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
3. ⬜ Per-tenant connection layer (`useDb`) πάνω στο `lib/db.ts`, flag-guarded.
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
