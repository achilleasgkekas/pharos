# WEB_DEBT — Pharos web code-quality queue

> Παράγεται από τον web code-quality auditor (read-only). Ο builder routine καταναλώνει το «## Web Debt Queue» (μικρότερο + υψηλότερη προτεραιότητα πρώτα). Λεπτομέρειες ανά run στο `PROGRESS.md`.
> Σύμβολα status: TODO · DOING · DONE.

## Σύνοψη audit (2026-07-04 46η σάρωση· type-check EXIT 0· builder έκλεισε 2 items → ουρά 4→2· ΚΑΙ ΤΑ 2 εναπομείναντα είναι decision-flag [Achilleas], ΜΗΔΕΝ auto-buildable αριστερά)

- **type-check:** `npm run type-check` → **EXIT 0** (μηδέν P1 από type errors).
- **Builder έκλεισε 2 items** από τον προηγ. marker: (α) **saasGuard invites GET+DELETE** (commit `388246d` — live-verified: import γρ.13, GET(45)+DELETE(106) wrapped· κάθε write saas route πλέον `saasGuard`)· (β) **Account sparse index** verify/reset token-hash (commit `ac35ca3` — live-verified: `AccountSchema.index(...sparse)` γρ.37/38). Και τα δύο → **DONE**.
- **Ουρά τώρα:** 2 TODO, **και τα δύο decision-flag** (θέλουν σκόπιμη απόφαση Achilleas, ΟΧΙ μηχανικό unattended fix): (1) reset/request timing side-channel [P3/S — delivery-semantics tradeoff: `void sendEmail` vs `await`]· (2) getTenantConnection readyState guard [P3/S — ambiguous rebuild-semantic, 0 importers]. **Και τα δύο code-verified ανοιχτά** (`reset/request/route.ts:43` fast-path return· `connection.ts:54` `readyState !== 99`).
- **Νέα surface audited → exemplary, μηδέν νέο debt:** `lib/billing/costSummary.ts` (pure micros→currency roll-up, defensive `nonNegInt` coercion, tested) + `saas/usage/route.ts` cost block (`buildCostSummary` imported+used, καθαρό `{ error }` shapes, saasGuard-gate). v1 API sweep: κάθε route εκτός `auth/login` περνά από `withAuth` (try/catch + consistent `apiError`)· login έχει own try/catch + validation· μηδέν `any`/`@ts-ignore` σε v1· `readBody`/`apiBody` validators υιοθετημένα καθολικά.
- **ΣΗΜ builder-feed:** η ουρά έμεινε ΧΩΡΙΣ auto-buildable item. Δες `## Needs Achilleas` στο PROGRESS.md — τα 2 εναπομείναντα θέλουν έγκριση κατεύθυνσης πριν καταναλωθούν.

## Σύνοψη audit (2026-07-03 40η σάρωση· CONFIRMATION· type-check EXIT 0· μηδέν νέο P1/P2/P3· ουρά 3 ενεργά TODO αμετάβλητη — και τα 3 code-verified ανοιχτά· νέα surface [`lib/billing/aiKeyPolicy.ts` BYO-key policy + `Tenant.aiByoKey` flag + billing-audit helpers] audited → exemplary, μηδέν νέο debt)

**2026-07-03 (40η σάρωση, αυτόνομος γύρος):** fresh live σάρωση (grep, όχι docs) σε **50 v1 route files** + **23 saas route files** + `apiAuth`/`apiBody`/`apiList` + `lib/tenancy/*` + `lib/billing/*` + `models/*`. Νέα surface από την 39η: `7a533b4` (BYO-key AI policy), billing-audit helpers (`2bdf29d`/`a4c1fd3` checkout/portal audit recording), test-only files. `cd apps/web && npm run type-check` **EXIT 0** (0 TS errors).
- **Ευρήματα ανά διάσταση (live grep):**
  - **Type safety: 0** — `grep -rnE ': any|as any|@ts-ignore|@ts-nocheck'` (εκτός `.test.ts`, εκτός σχολίων) = **1 hit** = `softDelete.ts:25` `schema.pre(hook as any, …)`, canonical Mongoose pre-hook union-overload workaround (eslint-disabled, pre-existing infra· `this: Query<unknown,unknown>` σωστά τυπωμένο). ΟΧΙ νέο debt.
  - **Input validation: 0 gaps** — `grep -rn 'req.json()' src/app/api` = **3 σκόπιμα** (auth/login boundary try/catch, items/[id]/ai-fill safe-cast `as {mode?:unknown}`, mcp protocol). Μηδέν `req.json().catch` (readBody adoption 100%). BYO-key path καθαρός.
  - **Auth: 0 unguarded** — v1 routes ΧΩΡΙΣ `withAuth`/`bearerUser` = **1** = `auth/login` (σωστά exempt). saas routes ΧΩΡΙΣ `saasGuard` = 9, όλα documented deliberate exemptions (read-only usage/audit/billing-GET/session/logout, own-handling webhook/invites-accept) ΕΚΤΟΣ του `invites/route.ts` = active P3/S item #1.
  - **Error handling: 0 νέα** — billing-audit code = pure helpers καλούμενα ΜΕΣΑ σε ήδη-`saasGuard`-wrapped checkout/portal routes. Το invites GET/DELETE gap αμετάβλητο (existing P3/S item).
  - **Mongoose: 0 νέα** — N+1 (`.map(async`/`.forEach(async`) σε api = **0**. Ολα τα v1 list routes `.limit(p.limit)` + `.lean()`. Το `calendar/route.ts:48` `Statement.find().lean()` είναι unbounded ΑΛΛΑ **ΟΧΙ debt**: το calendar χρειάζεται ΟΛΑ τα statements για installment-plan aggregation (limit θα έσπαγε τα projected δόσεις), low-cardinality (≈1/κάρτα/μήνα), `.lean()`. BYO-key wiring = flag-read μόνο (μηδέν extra query).
  - **Duplication/dead code: 0 νέα.**
- **Νέος κώδικας = exemplary.** `aiKeyPolicy.ts` = pure module (type-only import, μηδέν DB/Stripe/secret), `isByoKey`/`aiKeyMode`/`meterAiUsage`/`unmeteredAiQuota` fail-closed (μη-true → metered), OSS-parity-aware, unit-tested (928/928 green). `Tenant.aiByoKey` default false (additive, flag-guarded — SAAS-off/default tenant ποτέ δεν χτυπά το BYO branch). Μηδέν νέο debt.
- **Ουρά αμετάβλητη (3 ενεργά TODO, όλα code-verified ανοιχτά):** (1) **P3/S** `invites/route.ts` GET(43)+DELETE(102) χωρίς `saasGuard` — top auto-buildable. (2) **P3/S** sparse index `Account.verifyTokenHash/resetTokenHash` (`Account.ts:24,26` χωρίς `.index()`). (3) **P3/S** `reset/request/route.ts` timing side-channel (no-account fast-path `return {ok:true}` πριν mint+store+mail) — decision. + Needs Achilleas: v1 data-path tenant-status enforcement (P2/M, decision), connection cache-reuse guard (P3, decision). **40η συνεχόμενη σάρωση χωρίς P1· μηδέν νέο item.** Top-2 για builder: (α) **invites saasGuard** [P3/S]· (β) **Account token-hash sparse index** [P3/S].

## Reviewer note (2026-07-03· range 53b861a..2f31c5d· P2/M tenant-status ΜΕΡΙΚΩΣ έκλεισε)
- **Item #1 (P2/M tenant `status:'canceled'/'suspended'` δεν επιβάλλεται) → DOING, μερική κάλυψη.** Το `b911882` πρόσθεσε fail-closed `workspaceStatusError` guard στο `resolveWorkspaceSession` (`lib/tenancy/workspace.ts` + `workspaceSession.ts`), tested (15 refs στο `workspace.test.ts`, 19/19 green). **Καλύπτει ΜΟΝΟ τα workspace-management routes** (members/audit/invites/rename → 403 σε suspended/canceled/pending· GET+DELETE opt-out με `allowInactive` για view + idempotent cancel). Το commit msg είναι ειλικρινές για το scope.
- **Παραμένει ανοιχτό:** το v1 app-data path (`getTenantContext`, `lib/tenancy/context.ts:63` διαβάζει `status` αλλά ΔΕΝ κάνει gate) → ένα canceled/suspended workspace κρατά πλήρη πρόσβαση στα δικά του δεδομένα (receipts/items/expenses/…). **Design decision (block read+write στο v1 path ή μόνο write)** → μένει P2/M, ΟΧΙ small-safe. Ο builder ας ΜΗΝ ξανα-υλοποιήσει το management-route κομμάτι (έγινε).
- **UPDATE 2026-07-03 (38η σάρωση):** το reactivate UX ΕΚΛΕΙΣΕ — νέο `POST /api/saas/workspace/reactivate` (`bbb09d1`, owner-only `canReactivateWorkspace`, `allowInactive` resolve ώστε ο canceled tenant να φτάνεται, `reactivateStatusError` 409 guard [μόνο `canceled`→`active`, ΟΧΙ `suspended`], `saasGuard` wrap, audit `workspace.reactivated`). Το lifecycle soft-cancel↔reactivate είναι πλέον πλήρες στο control plane. Άρα ένας owner που κατά λάθος cancel-άρει έχει δρόμο επιστροφής → το να μπλοκάρει το v1 data path είναι τώρα **ασφαλές να υλοποιηθεί**, αλλά το read-vs-write scope παραμένει product decision. **Το P2/M item δεν άλλαξε priority, μόνο ο reactivate-blocker λύθηκε.**

## Σύνοψη audit (2026-07-03 38η σάρωση· CONFIRMATION· type-check EXIT 0· μηδέν νέο P1/P2/P3· ουρά 5 TODO αμετάβλητη — και τα 5 code-verified ανοιχτά· νέα surface [`saas/workspace/reactivate` route + `workspace.ts` reactivate helpers + `audit.ts` batched actor lookup] audited → exemplary, μηδέν νέο debt)

**2026-07-03 (38η σάρωση, αυτόνομος γύρος):** fresh live σάρωση (grep, όχι docs) σε **50 v1 route files** + **23 saas route files** (+1: `workspace/reactivate`) + `apiAuth`/`apiBody`/`apiList` + `lib/tenancy/*` + `lib/billing/*` + `models/*`. `git diff --name-only 2f31c5d..HEAD` (από την 37η) = **1 νέο route** (`saas/workspace/reactivate/route.ts`) + `lib/tenancy/{workspace,audit}.ts` (additive helpers) + test files. `npm run type-check` **EXIT 0** (0 TS errors).
- **Ευρήματα ανά διάσταση (live grep):**
  - **Type safety: 0** — `grep -rnE ': any|as any|@ts-ignore|@ts-expect-error' src/app/api src/lib/tenancy src/lib/billing` (εκτός `.test.ts`) = **4 hits, ΟΛΑ false positives** (η λέξη «any»/«active member» σε σχόλια: `workspace/route.ts:108`, `workspace/reactivate/route.ts:38`, `workspace.ts:41,86`· μηδέν type). Το reactivate route πλήρως τυπωμένο (`workspaceView` whitelisted projection, μηδέν billing-id leak).
  - **Input validation: 0 gaps** — `grep -rln 'req.json().catch' src/app/api` = **μηδέν** (readBody adoption 100%). reactivate: `readBody`+`strField(body,'tenant').trim()||null`, canonical gate ladder.
  - **Auth: 0 unguarded** — κάθε v1 route matches `withAuth`/`apiAuth` (μόνο `auth/login` exempt). reactivate gated: `resolveWorkspaceSession(tenant, false, allowInactive=true)` (SAAS-off 404 / unauth 401) → owner-only `canReactivateWorkspace` (403) → `reactivateStatusError` 409 (μόνο canceled reactivatable). ΠΟΤΕ δεν αγγίζει feature route / per-tenant data DB / self-hosted User session.
  - **Error handling: 0 νέα** — reactivate wrapped σε `saasGuard` (καθαρό `{ error }` 500). Το invites GET/DELETE gap παραμένει (existing P3/S item #2, αμετάβλητο).
  - **Mongoose: 0 νέα** — `audit.ts collectActorIds` = distinct `Set<string>` → ΕΝΑ `_id:{$in}` batched lookup (ρητό «instead of N+1 lookups», γρ.101)· reactivate = single `Tenant.updateOne` point-write στο `_id` + 1 `Membership.countDocuments` για το view. Μηδέν `.map(async`/N+1. Τα prior-accepted no-limit single-tenant aggregations αμετάβλητα.
- **Ουρά αμετάβλητη (5 TODO, όλα code-verified ανοιχτά):** (1) **P2/M** tenant `status:'canceled'/'suspended'` δεν επιβάλλεται στο v1 data path (`context.ts:63` reads, `apiAuth.ts` no gate)· reactivate-blocker λύθηκε (βλ. UPDATE πάνω), μένει read-vs-write product decision. (2) **P3/S** `invites/route.ts` GET(43)+DELETE(102) χωρίς `saasGuard` (direct `Invite.find`/`findOneAndUpdate` → uncaught throw = ασυνεπές 500) — top auto-buildable. (3) **P3/S** sparse index `Account.verifyTokenHash/resetTokenHash` (`Account.ts:24,26` χωρίς `.index()`). (4) **P3/S** `reset/request/route.ts:43` timing side-channel (no-account fast-path `return {ok:true}` πριν mint+store+mail). (5) **P3/S** `connection.ts:54` cache guard `readyState !== 99` (readyState 0=disconnected/3=disconnecting περνούν ως live). **Μηδέν auto-buildable P1/P2· 4 P3/S auto-buildable + 1 P2/M decision.** Top-2 για builder: (α) **invites saasGuard** [P3/S, ολοκληρώνει το try/catch effort]· (β) **Account token-hash sparse index** [P3/S].

## Σύνοψη audit (2026-07-03 37η σάρωση· type-check EXIT 0· μηδέν νέο P1/P2· ουρά 5 TODO αμετάβλητη — και τα 5 επιβεβαιωμένα ανοιχτά στον κώδικα· νέα surface [`saas/workspace` DELETE soft-cancel + `lib/tenancy/workspace.ts` + `audit.ts`] audited → exemplary)

**2026-07-03 (37η σάρωση, αυτόνομος γύρος):** fresh live σάρωση (grep, όχι docs) σε **50 v1 route files** + **22 saas route files** + `apiAuth`/`apiBody`/`apiList` + `lib/tenancy/*` + `lib/billing/*` + `models/*`. `git diff --name-only 4a240aa..HEAD` = νέα SaaS surface (`workspace` route soft-cancel DELETE + rename PATCH + read GET, `lib/tenancy/workspace.ts` pure helpers, `audit.ts` batched-lookup). `npm run type-check` **EXIT 0** (0 TS errors).
- **Ευρήματα ανά διάσταση (live grep):**
  - **Type safety: 0** — `grep -rnE ': any|as any|@ts-ignore|@ts-expect-error' src/app/api src/lib/tenancy src/lib/billing` (εκτός `.test.ts`) = **1 hit, false positive** (σχόλιο «any active member» στο `workspace/route.ts:106`, όχι τύπος). `workspace.ts`/`workspaceView` πλήρως τυπωμένα (whitelisted projection, μηδέν leak billing ids).
  - **Input validation: 0 gaps** — `grep -rln 'req.json().catch' src/app/api` = **μηδέν** (readBody adoption 100%). `workspace` PATCH/DELETE: `readBody`+`strField` body, `sanitizeWorkspaceName`+`workspaceNameError` (empty→400), idempotent no-op guards (rename ίδιο όνομα / ήδη canceled → view χωρίς audit row).
  - **Auth: 0 unguarded** — κάθε v1 route matches `withAuth`/`apiAuth`/`requireAuth` (μόνο `auth/login` exempt)· κάθε saas route gated (`resolveWorkspaceSession`/`resolveBillingSession`/`saasAuthGate`/CRON/webhook). `workspace` DELETE: owner-only (`canCancelWorkspace`) πάνω από το session gate.
  - **Error handling: 0 νέα** — `workspace` GET/PATCH/DELETE όλα wrapped σε `saasGuard` (καθαρό `{ error }` 500)· `audit.ts recordAudit` = μοναδικό DB touch, batched actor lookup (μηδέν N+1).
  - **Mongoose: 0 νέα** — τα `no-limit .find()` (settings/calendar/cards/reports/overview/plans) είναι single-tenant/single-user bounded aggregations (prior-accepted, όχι list-pagination surface)· list routes (receipts/items/…) μέσω `apiList`. Μηδέν `.map(async`/N+1.
- **Ουρά αμετάβλητη (5 TODO, όλα code-verified ανοιχτά):** (1) P2/M tenant `status:'canceled'/'suspended'` δεν επιβάλλεται — ο νέος soft-cancel DELETE ΤΟ ΕΝΙΣΧΥΕΙ (θέτει flag που κανείς δεν διαβάζει· `grep tenant.status src/lib/tenancy src/lib/apiAuth.ts` = μόνο 2 projection hits, μηδέν gate). (2) P3/S `invites/route.ts` GET+DELETE χωρίς `saasGuard` (throw→ασυνεπές 500). (3) P3/S sparse index `Account.verifyTokenHash/resetTokenHash` (fields χωρίς index). (4) P3/S `reset/request` timing side-channel (no-account fast-path `return {ok:true}` vs mint+store+mail → enumeration). (5) P3/S `getTenantConnection` cache guard δέχεται readyState 0 (disconnected, όχι μόνο 99). **Μηδέν auto-buildable P1/P2· 4 P3/S auto-buildable + 1 P2/M decision (SaaS access-control).**



**2026-07-02 (35η σάρωση, αυτόνομος γύρος):** fresh live σάρωση (grep, όχι docs) σε **49 v1 route files** + **21 saas route files** + `apiAuth`/`apiBody`/`apiList` + `lib/tenancy/*` + `lib/billing/*` + `models/*`. `git diff --name-only 9d7bbab..HEAD` = νέα SaaS surface (audit-event recording + read API, saasGuard slices, expenses rescan v1). `npm run type-check` **EXIT 0** (0 TS errors).
- **Ευρήματα ανά διάσταση (live grep):**
  - **Type safety: 0** — `grep -rnE ': any|as any|@ts-ignore|@ts-expect-error' src/app/api` (εκτός `.test.ts`) = **0**. Ο νέος audit route (`saas/audit/route.ts`) πλήρως τυπωμένος (μόνο νόμιμοι `.lean() as ...` projection casts).
  - **Input validation: 0 gaps** — `grep -rln 'req.json().catch' src/app/api` = **μηδέν** (readBody adoption 100%, v1 + saas). audit route: `parseLimit` (1..200 clamp), `parseAuditAction` allowlist, `before` bad-cursor → ignore (δεν 400άρει read).
  - **Auth: 0 unguarded** — κάθε v1 route matches `withAuth`/`apiAuth` (μόνο `auth/login` exempt). audit route gated μέσω `resolveWorkspaceSession(slug, true)` (SAAS-off 404 / unauth 401 / non-owner-admin 403) ΠΡΙΝ αγγίξει το AuditEvent collection.
  - **Error handling / try-catch: P2/M ΕΚΛΕΙΣΕ.** live loop σε 21 saas routes → **12** wrapped σε `saasGuard` (όλα τα write: members×4, account×5, billing checkout/portal, invites/resend, auth login/signup). Εναπομείναντα 7 χωρίς wrap = 6 σκόπιμα read-only (usage/audit/billing GET, session, logout, usage/sample cron) **+ 1 gap: `invites/route.ts` DELETE** (write revoke, missed από το slice 2/2) → νέο P3/S item.
  - **DB/consistency: 0 νέο** — inline ObjectId regex σε api+tenancy+billing (εκτός test/comment) = **μηδέν** (1 hit = σχόλιο στο `invites/route.ts:81`). audit read: bounded limit (MAX 200), keyset `?before` pagination, batched actor lookup (`$in`, ΟΧΙ N+1), whitelisted projection. Καμία νέα unbounded query.
- **Ουρά (live re-verify):**
  - **SaaS try/catch (P2/M):** ~~16/16 write routes χωρίς try/catch~~ → **DONE 2026-07-02** (slices `6f5199c`+`a2e1811`, `saasGuard` helper στο `saasApi.ts`, 12 routes wrapped). Confirmed live.
  - **invites/route.ts saasGuard gap (P3/S):** ΝΕΟ — DELETE (write) + GET δεν τυλίχθηκαν, thrown DB error → framework 500 αντί `{ error }` → **TODO** (top auto-buildable, ολοκληρώνει το try/catch item).
  - **Sparse index Account token-hash (P3/S):** live `models/Account.ts:24,26` `verifyTokenHash`/`resetTokenHash` = `{ type:String, default:null }`, μηδέν `.index()` → collection-scan σε verify/reset confirm → **TODO** (low-urgency).
  - **reset-request timing (P3/S, decision-flag):** ακόμα `await sendEmail(...)` → registered/non-registered response-time delta → **Needs Achilleas** (delivery-semantics tradeoff).
  - **invites DELETE id-guard (P3/S):** ~~stale TODO~~ → επιβεβαιώθηκε **DONE** (isObjectId `invites/route.ts:82`), status διορθώθηκε.
- **Counts ανά dimension: P1=0, P2=0, P3=1 νέο (invites saasGuard).** Δεν εφευρίσκω debt· 35 σαρώσεις χωρίς P1, ο κώδικας ώριμος. Ο builder ΕΚΛΕΙΣΕ το μεγαλύτερο εκκρεμές (P2/M try/catch). Ο νέος audit read-surface είναι **exemplary** (gate ladder, bounded page, keyset pagination, batched no-N+1 actor resolve, whitelisted projection). Top-2 για builder: (1) **invites saasGuard** [P3/S, ολοκληρώνει το try/catch]· (2) **Account token-hash sparse index** [P3/S].

## Σύνοψη audit (2026-07-02 34η σάρωση· CONFIRMATION· builder έκλεισε το seat-cap [DONE], ουρά 3→2 ενεργά auto-buildable [1 P2/M + 1 P3/S] + 1 P3/S decision-flag· νέος invites/resend surface audited → exemplary, μηδέν νέο debt· SaaS try/catch count 15→16)

**2026-07-02 (34η σάρωση, αυτόνομος γύρος):** fresh live σάρωση (grep, όχι docs) σε **49 v1 route files** + **20 saas route files** + `apiAuth`/`apiBody`/`apiList` helpers + `lib/billing/*` + `lib/tenancy/*` + `models/*`. `git diff --name-only 9d7bbab..HEAD -- apps/web/src/app/api apps/web/src/lib apps/web/src/models` = **6 αρχεία** — `saas/invites/resend/route.ts` (ΝΕΟ), `saas/invites/route.ts` (+`invitedBy` στο GET projection, additive), `saas/members/route.ts` (seat-cap fix, ήδη audited+DONE), `lib/tenancy/invites.ts` (+`invitedBy` στο `InviteView`, additive), + 2 test files (`serialize.test.ts`, `invites.test.ts`). Από τον τελευταίο marker καμία αλλαγή σε type/validation/auth/DB surface. `npm run type-check` **EXIT 0**.
- **Ευρήματα ανά διάσταση (live grep):**
  - **Type safety: 0** — `grep -rnE ': any|as any|@ts-ignore|@ts-expect-error' src/app/api` (εκτός `.test.ts`) = **0**. type-check EXIT 0. Το νέο `resend/route.ts` πλήρως τυπωμένο (μόνο ο νόμιμος `.lean() as Pick<InviteDoc,...> | null` projection cast).
  - **Input validation: 0 gaps** — `grep -rln 'req.json().catch' src/app/api` = **μηδέν** (readBody adoption 100%). Το `resend/route.ts` adopter του `readBody` + `isObjectId` guard (malformed inviteId → 400 πριν το Mongoose, όχι CastError 500) από την πρώτη μέρα.
  - **Auth: 0 unguarded** — κάθε v1 route matches `withAuth`/`apiAuth` (μόνο `auth/login` σκόπιμα exempt)· το `resend` route gated μέσω `resolveWorkspaceSession(slug, true)` = SAAS-off→404 / unauth→401 / non-owner-admin→403 (owner/admin only), ΠΡΙΝ αγγίξει το Invite collection· scoped `{_id, tenant, status:'pending'}` → cross-tenant/accepted/revoked → 404· token hash ΠΟΤΕ επιστρέφεται.
  - **DB/consistency: 0 νέο** — inline ObjectId regex `[a-f0-9]{24}` σε api+tenancy+billing (εκτός test) = **μηδέν**. Το `resend` κάνει single `findOneAndUpdate` στο unique `_id` (point-write, no scan). Καμία νέα unbounded query.
- **Ουρά (live re-verify):**
  - **Seat-cap ασυμμετρία (P3/S):** ~~existing-account seat check μετράει μόνο `activeCount`~~ → **DONE 2026-07-02** (commit `699c36e`): το POST branch μετράει `activeCount + pendingCount`, symmetric με το invite path (2 `pendingCount` hits, γρ.108-109 + 225-226 verified).
  - **SaaS try/catch (P2/M):** live loop → **16/16** saas routes χωρίς `try {` (was 15· +1 το νέο `invites/resend/route.ts`). Thrown DB error βγαίνει ως framework-default 500 αντί `{ error }` → **TODO** (top auto-buildable, split S+S).
  - **Sparse index Account token-hash (P3/S):** live `models/Account.ts:24,26` `verifyTokenHash`/`resetTokenHash` = `{ type:String, default:null }`, μηδέν `.index()` → collection-scan σε verify/reset confirm → **TODO** (low-urgency).
  - **reset-request timing (P3/S, decision-flag):** ακόμα `await sendEmail(...)` (`reset/request/route.ts:52`) → registered/non-registered response-time delta → **Needs Achilleas** (delivery-semantics tradeoff).
- **Counts ανά dimension: P1=0, P2=0, P3=0 νέο.** Δεν εφευρίσκω debt· 34 σαρώσεις χωρίς P1, ο κώδικας ώριμος. Ο builder κατανάλωσε το **seat-cap** [P3/S] αυτόν τον κύκλο (ουρά 3→2). Το νέο invites/resend surface είναι **exemplary** (κεντρικό gate ladder, isObjectId guard, re-mint αντί replay, no token-hash leak, fire-and-forget mail). Top-2 για builder: (1) **SaaS try/catch helper** [P2/M, split S+S — mirror του `withAuth` catch για τα 16 saas routes· ξεκίνα με helper + account/* 5 routes]· (2) **Account token-hash sparse index** [P3/S].
  - **Παρατήρηση (χαμηλής αξίας, ΔΕΝ queue item):** το `invites/resend/route.ts` δεν έχει dedicated route test (σε αντίθεση με το sibling mint path)· η λογική είναι mirror του well-tested mint + το suite μένει green. Αν ο builder θέλει, ένα pure gating/shape test (SAAS-off 404, non-owner 403, malformed id 400, pending-only 404) είναι μικρό+safe (attended-preferred, όχι queue).

## Σύνοψη audit (2026-07-02 33η σάρωση· CONFIRMATION· ΜΗΔΕΝ API αλλαγή από τον προηγ. marker `9d7bbab`· ουρά αμετάβλητη — 3 ενεργά auto-buildable [1 P2/M + 2 P3/S] + 1 P3/S decision-flag)

**2026-07-02 (33η σάρωση, αυτόνομος γύρος):** fresh live σάρωση (grep, όχι docs) σε **49 v1 route files** + **19 saas route files** + `apiAuth`/`apiBody`/`apiList` helpers + `lib/billing/*` + `lib/tenancy/*` + `models/*`. `git diff --name-only 9d7bbab..HEAD -- apps/web/src` = **μόνο `api/v1/receipts/serialize.test.ts`** (test-only, commit `777304f`). Από τον τελευταίο code marker ΚΑΜΙΑ αλλαγή σε runtime API/model/billing/tenancy. Το invites surface (accept/route.ts, invites/route.ts, invites.ts, Invite.ts) που άλλαξε από `bba44ff` ήταν ήδη audited+DONE (invites DELETE id-guard). `npm run type-check` **EXIT 0**.
- **Ευρήματα ανά διάσταση (live grep):**
  - **Type safety: 0** — `grep -rnE ': any|as any|@ts-ignore|@ts-expect-error' app/api` (εκτός `.test.ts`) = **0**. type-check EXIT 0.
  - **Input validation: 0 gaps** — `grep -rln 'req.json().catch' app/api` = **μηδέν** (readBody adoption 100%, v1 + saas).
  - **Auth: 0 unguarded** — κάθε v1 route matches `withAuth`/`apiAuth` (μόνο `auth/login` σκόπιμα exempt = auth boundary)· saas routes gated (`saasAuthGate`/`resolveBillingSession`/`CRON_SECRET`/webhook-sig).
  - **DB/consistency: 0 νέο** — `grep -rn '\[a-f0-9\]{24}' app/api lib/tenancy lib/billing` (εκτός test) = **μηδέν** (inline ObjectId regex πλήρως εξαλειμμένο). Καμία νέα unbounded query (μηδέν νέο route).
- **Ουρά (live re-verify, ΟΛΑ ακόμα ανοιχτά):**
  - **Seat-cap ασυμμετρία (P3/S):** ~~existing-account seat check μετράει μόνο `activeCount`~~ → **DONE 2026-07-02** (pharos-daily-dev): το POST branch μετράει πλέον `activeCount + pendingCount`, symmetric με το invite path (2 `pendingCount` hits στο route).
  - **SaaS try/catch (P2/M):** live loop σε `find app/api/saas -name route.ts` → **15** routes χωρίς `try {` (usage, members, invites, billing×3, auth×3, account×5, usage/sample) → thrown DB/Stripe error βγαίνει ως framework-default 500 αντί `{ error }` → **TODO**.
  - **Sparse index Account token-hash (P3/S):** live `models/Account.ts:24,26` `verifyTokenHash`/`resetTokenHash` = `{ type:String, default:null }`, μηδέν `.index()` → collection-scan σε verify/reset confirm → **TODO** (low-urgency, μικρό collection).
  - **reset-request timing (P3/S, decision-flag):** ακόμα `await sendEmail(...)` στο happy-path → registered/non-registered response-time delta → **Needs Achilleas** (delivery-semantics tradeoff, όχι unattended fix).
- **Counts ανά dimension: P1=0, P2=0, P3=0 νέο.** Δεν εφευρίσκω debt· 33 σαρώσεις χωρίς P1, ο κώδικας ώριμος. Ο builder ΔΕΝ κατανάλωσε κανένα από τα 3 auto-buildable items αυτόν τον κύκλο (όλα live-verified TODO). Top-3 για builder: (1) seat-cap asymmetry [P3/S, single seat-check add — μικρότερο]· (2) SaaS try/catch helper [P2/M, split S+S]· (3) Account token-hash sparse index [P3/S].

## Σύνοψη audit (2026-07-02 32η σάρωση· CONFIRMATION· ΜΗΔΕΝ API αλλαγή από τον προηγ. marker `bba44ff`· ουρά αμετάβλητη — 4 ενεργά auto-buildable [1 P2/M + 3 P3/S] + 1 P3/S decision-flag)

**2026-07-02 (32η σάρωση, αυτόνομος γύρος):** fresh live σάρωση (grep, όχι docs) σε **49 v1 route files** + **21 saas route files** + `apiAuth`/`apiBody`/`apiList` helpers + `lib/billing/*` + `lib/tenancy/*` + `models/*`. `git diff --name-only bba44ff..HEAD -- src/app/api src/lib/billing src/lib/tenancy src/models` = **μηδέν αρχεία** → από τον τελευταίο audited marker ΚΑΜΙΑ αλλαγή στο API/model/billing/tenancy surface (οι μόνες αλλαγές: `apps/landing/*` marketing site + `apps/web/src/lib/aiConfig.test.ts` test-only). Το API είναι byte-identical με ό,τι κάλυψαν οι 31 προηγ. σαρώσεις. `npm run type-check` **EXIT 0**.
- **Ευρήματα ανά διάσταση (live grep):**
  - **Type safety: 0** — `grep -rnE ': any|as any|@ts-ignore|@ts-expect-error' src/app/api` = **0**. type-check EXIT 0.
  - **Input validation: 0 gaps** — `grep -rln 'req.json().catch' src/app/api` = **μηδέν** (readBody adoption 100%, v1 + saas). Κανένα raw-body route.
  - **Auth: 0 unguarded** — loop σε ΟΛΑ τα `src/app/api/v1/*/route.ts`: κάθε file matches `withAuth`/`apiAuth` (μόνο το `auth/login` είναι σκόπιμα exempt = auth boundary). Μηδέν `NO-AUTH` hit.
  - **DB/consistency: 0 νέο** — `grep -rn '\[a-f0-9\]{24}' src/app/api src/lib/tenancy src/lib/billing` = **μηδέν** (inline ObjectId regex πλήρως εξαλειμμένο). Καμία νέα unbounded query (μηδέν νέο route).
- **Ουρά (live re-verify, ΟΛΑ ακόμα ανοιχτά):**
  - **invites DELETE id-guard (P3/S):** ~~`invites/route.ts` περνά `_id: inviteId` στο `Invite.updateOne` χωρίς `^[a-f0-9]{24}$` guard~~ → **DONE 2026-07-02** (reuse `isObjectId` από apiBody· malformed id → 400 αντί 500).
  - **Seat-cap ασυμμετρία (P3/S):** `members/route.ts:220-221` existing-account seat check = `withinSeatLimit(plan, activeCount)` **μόνο** (χωρίς `pendingCount`), ενώ το invite path γρ.107-109 = `activeCount + pendingCount` → **TODO** (η ασυμμετρία παραμένει).
  - **SaaS try/catch (P2/M):** `for f in saas/**/route.ts; do grep -q 'try {' || echo` = **15** saas routes χωρίς try/catch → thrown DB/Stripe error βγαίνει ως framework-default 500 αντί `{ error }` → **TODO**.
  - **Sparse index Account token-hash (P3/S):** `models/Account.ts:24,26` `verifyTokenHash`/`resetTokenHash` = απλά `{ type:String, default:null }`, μηδέν `index()` → collection-scan σε verify/reset confirm → **TODO** (low-urgency, μικρό collection).
  - **reset-request timing (P3/S, decision-flag):** `reset/request/route.ts:52` ακόμα `await sendEmail(...)` → registered/non-registered response-time delta → **Needs Achilleas** (delivery-semantics tradeoff, όχι unattended fix).
- **Counts ανά dimension: P1=0, P2=0, P3=0 νέο.** Δεν εφευρίσκω debt· 32 σαρώσεις χωρίς P1, ο κώδικας ώριμος. Ο builder κατανάλωσε το **invites DELETE id-guard** [P3/S] στις 2026-07-02 (DONE). Εναπομείναντα 3 auto-buildable items. Top-3 για builder: (1) seat-cap asymmetry [P3/S, single seat-check add]· (2) SaaS try/catch helper [P2/M, split S+S]· (3) Account token-hash sparse index [P3/S].

## Σύνοψη audit (2026-07-02 31η σάρωση· CONFIRMATION· ουρά αμετάβλητη 5 ενεργά P3/S· ελέγχθηκε ΝΕΟΣ SaaS account self-service surface [commit `a082819`: profile GET/PATCH + password POST] → exemplary, μηδέν νέο debt)

**2026-07-02 (31η σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 v1 route files** + **13 saas route files** (auth×4, billing×4, usage, usage/sample, members, account, account/password) + `apiAuth`/`apiBody`/`apiList` helpers + `lib/billing/*` + `lib/tenancy/*`. Από την 30ή σάρωση ο builder **ΔΕΝ** κατανάλωσε κανένα από τα 5 ενεργά P3/S items (live-verified όλα ακόμα ανοιχτά) → μένουν TODO. Νέο code από τότε = ο SaaS account self-service surface (`saas/account/route.ts` GET+PATCH, `saas/account/password/route.ts` POST, commit `a082819`). `npm run type-check` **EXIT 0**.
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api` (v1 + saas) + `lib/billing` + `lib/tenancy` = **0** (fresh grep). Ο νέος account surface πλήρως τυπωμένος· μόνο ο νόμιμος `as { _id; email?; ... }` lean-shape cast στο GET (documented projection), ΟΧΙ `any`.
  - **Auth: 0 unguarded** — v1: μόνο `auth/login` exempt. Ο νέος account surface: κάθε method `saasAuthGate()` (404 SAAS off / 500 AUTH_SECRET unset) **ΠΡΩΤΑ**, μετά `getCurrentAccount()` → 401 χωρίς session, μετά `Account.findById(claims.sub)` (μόνο ο ίδιος ο caller· κανένα cross-account access). Fail-closed, σωστή σειρά.
  - **Input validation: 0 gaps** — PATCH profile: `hasOwnProperty` guards (name/email absent → 400 «Nothing to update»), email `normalizeEmail`+`looksLikeEmail` → 400, uniqueness pre-check (`Account.exists({email, _id:{$ne}})` → 409) **ΚΑΙ** race-safe 11000 fallback στο save. password POST: `readBody`+`strField` coercion, `passwordChangeError` policy gate (400), same-401 «Invalid credentials» για missing-account ΚΑΙ wrong-current-password (μηδέν info leak). Exemplary.
  - **Error handling: 0 P-level** — ομοιόμορφο `{ error }` shape σε όλα τα account errors (400/401/404/409). Παρατήρηση (ΟΧΙ queue, ίδια με checkout/portal): οι account routes δεν έχουν εξωτερικό try/catch (μόνο το PATCH τυλίγει το `account.save()` για το 11000)· ένα DB throw στο `findById`/`exists` θα γύριζε default 500 αντί `{ error }`. Χαμηλού ρίσκου, saas-consistent convention (οι saas routes ΔΕΝ χρησιμοποιούν το v1 `withAuth` wrapper)· δεν το ανεβάζω σε item.
  - **DB: 0** — GET `Account.findById(...).select(...).lean()` (single-doc point-read στο unique `_id`)· PATCH `findById().select()` **μη-lean** (σκόπιμο, κάνει `.save()`) + `Account.exists()` (bounded existence check στο unique `email` index)· password `findById().select('_id passwordHash').save()`. Μηδέν scan, μηδέν N+1, μηδέν unbounded find. `Account.email` unique-indexed (`models/Account.ts:18`).
  - **Consistency: 0 νέο** — ο account surface adopter του `readBody`+`strField` από την πρώτη μέρα (κανένα raw `req.json().catch`)· reuse των `normalizeEmail`/`looksLikeEmail`/`sanitizeName`/`passwordChangeError` pure helpers (`lib/tenancy/*`). Δεν εισάγει νέο readBody/isObjectId debt.
- **Counts ανά dimension: P1=0, P2=0, P3=0 νέο** (η ουρά μένει 5 ενεργά P3/S: CRON_SECRET timing, isObjectId webhook, readBody checkout+portal, readBody members, getTenantConnection guard). Ο νέος account self-service κώδικας είναι **exemplary** (fail-closed gate ladder, no-leak 401, race-safe uniqueness, no-force-logout password change με σωστό σχόλιο). Δεν εφευρίσκω debt· 31 σαρώσεις χωρίς P1/P2, ο κώδικας ώριμος.

## Σύνοψη audit (2026-07-02 30ή σάρωση· ουρά 3→4 P3/S· ελέγχθηκε ΝΕΟΣ SaaS billing checkout+portal read surface [commits `4819f97`/`9ecb86c`]· +1 νέο P3/S [readBody adoption στα 2 billing routes που κρατούν raw `req.json().catch` + lying cast])

**2026-07-02 (30ή σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 v1 route files** + **10 saas route files** (auth×4, billing/{checkout,portal,webhook,route}, usage, usage/sample) + `apiAuth`/`apiBody`/`apiList` helpers + `lib/billing/*` + `lib/tenancy/*`. Από την 29η σάρωση ο builder **ΔΕΝ** κατανάλωσε κανένα από τα 3 top TODO items (live-verified όλα ακόμα ανοιχτά, βλ. παρακάτω) → μένουν TODO. `npm run type-check` **EXIT 0**.
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api` (v1 + saas) + `lib/billing` + `lib/tenancy` = **0**. Ο νέος billing read surface (`billingSession.ts`, `billingSummary.ts`, route handlers) πλήρως τυπωμένος (`StripeResult<T>`, `PlanKey`, `BillingSession`)· μόνο ο νόμιμος `as TenantDoc | null` lean-cast, ΟΧΙ `any`.
  - **Auth: 0 unguarded** — v1: μόνο `auth/login` exempt (auth boundary). saas: όλα τα billing routes (`checkout`/`portal`/`route`) περνούν από `resolveBillingSession()` (SaaS-gate 404 → 401 no-session → 403 not-owner/admin → 404 no-workspace) πριν αγγίξουν Stripe· `usage`/`usage/sample`/`webhook` gated σωστά (`saasAuthGate`/`CRON_SECRET`/`timingSafeEqual` sig-verify).
  - **Input validation: 0 gaps** — τα billing routes διαβάζουν μόνο `body.plan`/`body.tenant`· το `plan` περνά από `checkoutablePlan()` (whitelist PlanKey ή null), το `tenant` validate-άρεται κατά της λίστας memberships (μη-μέλος → 403). Καμία un-validated χρήση. (Το raw-body cast είναι consistency debt, ΟΧΙ validation gap — δες παρακάτω.)
  - **Error handling: 0 P-level** — ομοιόμορφο `{ error }` shape σε ΟΛΑ τα saas routes· graceful degradation (Stripe not-configured → 503, upstream → 502) μέσω `StripeResult`. Παρατήρηση (ΟΧΙ queue): `checkout`/`portal` δεν έχουν εξωτερικό try/catch (0 try-blocks)· ο κύριος throw-path (`resolveBillingSession` → `Tenant.findById` DB error) θα γύριζε default 500 αντί `{ error }`. Χαμηλού ρίσκου (τα Stripe calls είναι ήδη `StripeResult`-wrapped, όχι throw)· δεν το ανεβάζω σε item — δες `## Needs Achilleas`/observations στο PROGRESS.
  - **DB: 0** — v1 reads `.lean()`+limits· billing: `accountTenants` = bounded `Membership.find().lean()` + `Tenant.find({_id:{$in}}).lean()`· `resolveBillingSession` κάνει `Tenant.findById(ctx.tenantId)` **μη-lean** (read-only path· μικρό single-doc point-read, marginal .lean() nit, ΟΧΙ queue — ίδιο pattern με τα ήδη-«δεν είναι debt» webhook mutation reads). `dbStats.sampleAllTenants` = intentional full-scan των live tenants.
  - **Consistency debt (νέο): 1 P3/S** — τα `saas/billing/checkout/route.ts:26` + `saas/billing/portal/route.ts:27` κρατούν raw `(await req.json().catch(() => ({}))) as { plan?; tenant? }` — το ΙΔΙΟ debt που έκλεισε πλήρως για το v1 (readBody adoption) **και** για τα saas auth routes (`signup`/`login` ήδη adopters). Ο `as {...}` cast «λέει ψέματα» (runtime τα values μπορεί να μην είναι string). Byte-behavior swap με `readBody` + `strField` coercion → queue item.
- **Counts ανά dimension: P1=0, P2=0, P3=1 νέο** (η ουρά πάει 3→4 P3/S: CRON_SECRET timing [προϋπάρχον] + isObjectId webhook [προϋπάρχον] + getTenantConnection guard [προϋπάρχον] + billing readBody [νέο]). Ο νέος billing read surface είναι **exemplary** (κεντρικό authz, pure helpers `billingSummary`/`checkoutablePlan`, graceful degradation, ΠΟΤΕ charge)· η μόνη νέα παρατήρηση είναι το raw-body cast σε 2 routes. Δεν εφευρίσκω debt· 30 σαρώσεις χωρίς P1/P2.

## Σύνοψη audit (2026-07-02 29η σάρωση· ουρά 1→2 P3/S· ελέγχθηκε ΝΕΟΣ SaaS file-byte storage κώδικας [commit `f8aaea4`]· +1 νέο P3/S [non-constant-time CRON_SECRET compare στο usage/sample route])

**2026-07-02 (29η σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 v1 route files** + **7 saas route files** (auth×4, billing/webhook, usage, usage/sample) + `apiAuth`/`apiBody`/`apiList` helpers + **ΝΕΟΣ SaaS file-byte storage-accounting κώδικας** (`lib/billing/fileStorage.ts` + integration στο `lib/billing/dbStats.ts`, commit `f8aaea4`). Από την 28η σάρωση ο builder **ΔΕΝ** κατανάλωσε το top item (`grep '\[a-f0-9\]{24}' src/app/api` = ακόμα 1 hit στο `saas/billing/webhook/route.ts:81`) → μένει TODO. `npm run type-check` **EXIT 0**.
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api` (v1 + saas) + `lib/billing` + `lib/tenancy` = **0**. Ο νέος `fileStorage.ts` πλήρως τυπωμένος (`import('node:fs').Dirent[]`, `TenantContext`)· ο `dbStats.ts` `StorageSample` επεκτάθηκε καθαρά με `dbBytes`/`fileBytes` (μόνο ο νόμιμος `as unknown as TenantDoc[]` lean-cast, ΟΧΙ `any`).
  - **Auth: 0 unguarded** — v1: μόνο `auth/login` exempt (auth boundary). saas: `usage` + `auth/session` κάνουν `saasAuthGate()` + `getCurrentAccount()` (fail-closed)· `billing/webhook` σωστά signature-gated (`timingSafeEqual` + replay window)· **ΝΕΟ** `usage/sample` (cron endpoint) gated με `saasMode()` 404 + `CRON_SECRET` bearer (500 αν unset, 401 σε bad token) — σωστό pattern για scheduler.
  - **Input validation: 0 gaps** — ο `fileStorage.ts` δεν διαβάζει request (server-side sampling)· ο `tenantStorageRoot` έχει **path-escape guard** (`path.relative` + `..`/absolute check → null) ώστε DNS-safe dbName/slug να μη μπορεί να ξεφύγει από το STORAGE_ROOT· symlinks ΔΕΝ ακολουθούνται (`Dirent.isFile` false) → no traversal amplification.
  - **Error handling: 0** — `measureDir` κάνει per-entry try/catch (ένα unreadable file δεν σπάει το walk)· missing dir → 0· `sampleAllTenants` isolate-άρει per-tenant failures (counted, όχι fatal). Ομοιόμορφο `{ error }` shape σε όλα τα saas routes.
  - **DB: 0** — `Tenant.find({status:{$in}}).select().lean()` (fleet-sample, bounded-by-design· MUST iterate all live tenants — intentional full scan, όχι N+1)· `readDbStats` κάνει native `db.stats()` (read-only)· `setStorageBytes` upsert στο unique `{tenant,period}` index. `accountTenants` = `Membership.find().lean()` + `Tenant.find({_id:{$in}}).lean()` (bounded ανά account).
  - **OSS parity: exemplary** — `tenantFileBytes`/`sampleTenantStorage` no-op returning 0 με **μηδέν fs/db access** όταν `!saasMode()` ή `ctx.isDefault` ή `!tenantId`· self-hosted app ποτέ file-metered. Pure helpers (`sumBytes`, `tenantStorageRoot`, `billedBytes`) unit-tested (`fileStorage.test.ts` 79 γρ.).
  - **Consistency debt (νέο): 1 P3/S** — το ΝΕΟ cron `usage/sample/route.ts:31` συγκρίνει `token !== secret` με **plain string equality** (non-constant-time), ενώ το **ίδιο billing subsystem** (`lib/billing/stripe.ts:142`) ΚΑΙ το `lib/auth.ts:43` έχουν ήδη καθιερώσει `timingSafeEqual` για secret compare. Timing side-channel στο CRON_SECRET (μικρού ρίσκου, αλλά υπάρχει καθιερωμένο shared pattern να επαναχρησιμοποιηθεί). → queue item.
- **Counts ανά dimension: P1=0, P2=0, P3=1 νέο** (η ουρά πάει 1→2 P3/S: isObjectId webhook [προϋπάρχον TODO] + timing-safe CRON compare [νέο]). Ο νέος storage-accounting κώδικας είναι **exemplary** (OSS-parity, path-guard, symlink-safe walk, per-entry error isolation, unit-tested pure helpers)· η μόνη παρατήρηση είναι το non-constant-time secret compare σε ένα ΝΕΟ route. Δεν εφευρίσκω debt· 29 σαρώσεις χωρίς P1/P2.

## Σύνοψη audit (2026-07-02 28η σάρωση· ουρά αμετάβλητη 1 P3/S [isObjectId billing webhook, ΑΚΟΜΑ TODO — ο builder δεν το κατανάλωσε]· ελέγχθηκε ΝΕΟ SaaS quota-enforce gate + usage read endpoint [commit `918f49c`])

**2026-07-02 (28η σάρωση, αυτόνομος γύρος):** fresh σάρωση **57 API route files** (49 v1 + 6 saas [auth×4, billing/webhook, usage] + λοιπά) + `apiAuth`/`apiBody`/`apiList` helpers + **ΝΕΟΣ SaaS metering-enforcement κώδικας** (`lib/billing/enforce.ts` + `GET /api/saas/usage`, commit `918f49c`). Από την 27η σάρωση ο builder **ΔΕΝ** κατανάλωσε το top item (`grep '\[a-f0-9\]{24}' src/app/api/saas` = ακόμα 1 hit στο `webhook/route.ts:81`) → μένει TODO στην κορυφή της ουράς. `npm run type-check` **EXIT 0**.
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε saas+billing+tenancy = **0**. Το `enforce.ts` δουλεύει πλήρως τυπωμένο (`EnforceResult`/`QuotaKind`/`QuotaStatus`, `Record<QuotaKind,string>` label map), το `usage/route.ts` χωρίς κανένα cast.
  - **Auth: 0 unguarded** — το `usage/route.ts` κάνει `saasAuthGate()` (404 όταν SAAS off / 500 όταν AUTH_SECRET unset) **ΠΡΩΤΑ**, μετά `getCurrentAccount()` → 401 χωρίς session, μετά membership-check (`accountTenants(claims.sub)` → 404 αν καμία, 403 αν το `?tenant=slug` δεν ανήκει στον account). Fail-closed, σωστή σειρά.
  - **Input validation: 0 gaps** — το μόνο input είναι το `?tenant=` query param· γίνεται `.trim().toLowerCase()` + validate κατά της λίστας memberships (`tenants.find(t => t.slug === want)`) → μη-μέλος = 403. Το `enforce.ts` δεν διαβάζει request (pure gate primitive).
  - **Error handling: 0** — ομοιόμορφο `{ error }` shape σε ΟΛΑ τα σφάλματα του usage route (401/403/404). Το `quotaExceededBody` = σταθερό machine-readable `{ error, code:'quota_exceeded', kind, plan, used, limit, remaining, upgrade }` (402).
  - **DB: 0** — `Usage.findOne({ tenant, period }).lean()` πάνω σε **unique compound index** `{tenant:1, period:1}` (`models/Usage.ts:35`) → single-doc point-read, μηδέν scan. `accountTenants` κάνει `Membership.find(...).lean()` + `Tenant.find({_id:{$in}}).lean()` (bounded ανά account). Οι upserts (`findOneAndUpdate`) keyάρουν στο ίδιο unique pair. Μηδέν N+1, μηδέν unbounded find.
  - **Consistency: 0 νέο** — ο saas surface επιστρέφει ομοιόμορφα bare domain objects (session `{account}`, login/signup domain obj, usage `{tenant,period,usage,quotas}`)· το `{ data }` wrapper είναι v1-mobile convention, ΟΧΙ saas → το usage route ΔΕΝ αποκλίνει εντός του surface του.
- **Counts ανά dimension: P1=0, P2=0, P3=0 νέο** (η ουρά μένει στο 1 προϋπάρχον P3/S). Ο νέος metering-enforcement κώδικας είναι **exemplary**: OSS-parity σχολιασμένο (default tenant / SAAS off → pure pass-through, μηδέν DB, ποτέ blocked), pure body-builder unit-tested, gate primitive dependency-free, wiring-ready αλλά όχι ακόμα καλωδιωμένο σε feature route (σκόπιμο forward-work, ΟΧΙ dead code). Δεν εφευρίσκω debt· 28 σαρώσεις, ο κώδικας ώριμος.

## Σύνοψη audit (2026-07-02 27η σάρωση· builder έκλεισε shopping-list POST [readBody adoption 100%], ουρά 1→0 → ανοίγω 1 P3/S [isObjectId στο νέο SaaS billing webhook]· ελέγχθηκε ΝΕΟΣ SaaS billing scaffold + Stripe webhook)

**2026-07-02 (27η σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 v1 route files** + `apiAuth`/`apiBody`/`apiList` helpers + **ΝΕΟΣ SaaS billing surface** (`api/saas/billing/webhook` + `lib/billing/{stripe,plans}`, commit `3c6bcc4`). Από την 26η σάρωση ο builder κατανάλωσε το top item (readBody σε shopping-list POST, commit `6fd1075`) → η v1 raw-body ουρά έφτασε **0** και το apiBody/readBody adoption **ΕΚΛΕΙΣΕ πλήρως** (`grep -rn 'req.json().catch' src/app/api` = μηδέν σε ΟΛΟ το api).
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `npm run type-check` **EXIT 0**· `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api` (v1 + saas) = **0**. Ο billing webhook + `stripe.ts` δουλεύουν πλήρως τυπωμένα με `Record<string, unknown>` + guards, μηδέν `any`.
  - **Auth: 0 unguarded** στο v1 (μόνο `auth/login` exempt). Ο SaaS billing webhook είναι σωστά gated: `saasMode()` off → 404, webhook secret unset → 503, bad/missing signature → 400 (fail-closed). Signature-verify με constant-time `timingSafeEqual` + replay window (±300s) + σωστό HMAC-SHA256 scheme, dependency-free — **exemplary**.
  - **Input validation: 0 gaps** — τα 2 εναπομείναντα raw `req.json()` (auth/login boundary, items/[id]/ai-fill) είναι σωστά try/catch-wrapped + safe-cast σε `unknown`/typed guard· webhook διαβάζει raw body ΠΡΙΝ verify (σωστό) + `JSON.parse` σε try/catch.
  - **Error handling: 0** — ομοιόμορφο try/catch + `{ error }` shape· webhook επιστρέφει 500 σε DB failure (Stripe retry) αντί να καταπίνει.
  - **DB: 0** — ΟΛΑ τα v1 reads `.lean()` (live-verified: receipts/items/expenses/subscriptions/statements/vouchers/tasks list builders + settings/calendar chains· reports:81 = JS `Array.find`, false positive)· list endpoints `.limit()`+`.skip()`. `auth/login` findOne σκόπιμα ΟΧΙ lean (κάνει `user.save()` για apiToken). Webhook: `Tenant.findById`/`findOne` μη-lean γιατί κάνει mutation (`.save()`), σωστό.
  - **Consistency debt (νέο): 1 P3/S** — ο νέος SaaS billing webhook (`resolveTenant`, γρ.81) ξανα-εισήγαγε inline `/^[a-f0-9]{24}$/i.test(...)` αντί για το shared `isObjectId` — το ίδιο debt που είχε κλείσει για όλο το v1. Byte-identical swap → queue item.
- **Counts ανά dimension: P1=0, P2=0, P3=1** (isObjectId στο billing webhook, S). Δεν εφευρίσκω debt· 27 σαρώσεις χωρίς P1/P2 στο v1, ο κώδικας ώριμος. Ο νέος billing scaffold είναι υψηλής ποιότητας (constant-time sig, fail-closed gating, dependency-free)· η μόνη παρατήρηση είναι η inline-regex consistency.

---

## Σύνοψη audit (2026-07-01 26η σάρωση· builder έκλεισε scan/expense+voucher, ουρά 1→0 → ανοίγω το ΤΕΛΕΥΤΑΙΟ raw route [shopping-list POST]· ελέγχθηκε ΝΕΟΣ SaaS auth κώδικας)

**2026-07-01 (26η σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 v1 route files** + `apiAuth`/`apiBody`/`apiList` helpers + **ΝΕΟ SaaS auth surface** (`api/saas/auth/{signup,login,session,logout}` + `lib/tenancy/{saasApi,accountSession,provision}` — uncommitted WIP του Αχιλλέα στο working tree). Από την 25η σάρωση ο builder κατανάλωσε το top item (readBody σε scan/expense + scan/voucher, commits `4503640`+`875264b`) → η v1 ουρά έφτασε **0 ενεργά** στην αρχή.
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `npm run type-check` **EXIT 0**· `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` **και** στον νέο SaaS κώδικα = **0**.
  - **Auth: 0 unguarded** στο v1 (μόνο `auth/login` exempt). Ο νέος SaaS surface έχει σωστό gate pattern: κάθε route `const gate = saasAuthGate(); if (gate) return gate;` → 404 όταν `SAAS_MODE` off + 500 όταν `AUTH_SECRET` unset (fail-closed). Session cookie httpOnly + jose HS256 + `verifyAccountSession` never-throws.
  - **Input validation: 0 gaps στο v1.** Ο SaaS signup validate email regex + MIN_PASSWORD 8· login same-401 (χωρίς enumeration μήνυμα). **ΟΜΩΣ 3 παρατηρήσεις στον SaaS WIP → Needs Achilleas** (ΟΧΙ queue items, γιατί είναι uncommitted WIP + product/security decisions· δες PROGRESS).
  - **Error handling: 0** — ομοιόμορφο try/catch + `{ error }` shape.
  - **DB: 0** — v1 reads `.lean()`+limits· SaaS `accountTenants` κάνει `Membership.find(...).lean()` + `Tenant.find({_id:{$in}}).lean()` (bounded ανά account, ΟΚ)· control-plane models έχουν σωστά unique indexes (Account.email, Tenant.slug/dbName, Membership {account,tenant}).
  - **Consistency debt (ανοιχτό): 1 P3/S** — readBody adoption σε **shopping-list POST** (το ΤΕΛΕΥΤΑΙΟ v1 route με raw `req.json().catch`· ΟΧΙ byte-identical — χρειάζεται `strField` coercion, κλείνει και latent non-string crash).
- **Counts ανά dimension: P1=0, P2=0, P3=1** (shopping-list readBody, S). Δεν εφευρίσκω debt· 26 σαρώσεις χωρίς P1/P2 στο v1, ο κώδικας ώριμος. Ο νέος SaaS κώδικας είναι καθαρός type/auth/DB-wise· οι 3 παρατηρήσεις είναι security/robustness σε WIP → Needs Achilleas.

---

## Σύνοψη audit (2026-07-01 25η σάρωση· builder κατανάλωσε ΚΑΙ τα 2 ανοιχτά items + επιπλέον, ουρά 2→0 → ανοίγω 1 P3/S readBody twins)

**2026-07-01 (25η σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 route files** + `apiAuth`/`apiBody`/`apiList` helpers + νέος SaaS tenancy κώδικας (`lib/tenancy/*`), όλα από live grep. Από την 24η σάρωση ο builder προχώρησε πολύ: κατανάλωσε **και τα 2 ανοιχτά P3/S** (readBody σε settings + stores/[id], και σε receipts/[id] + receipts/[id]/rescan) **και επιπλέον** raw-body routes → `req.json().catch` απομένει πλέον **μόνο σε 3 routes** (scan/expense, scan/voucher, shopping-list POST), `readBody` adopters **26**. Τα 2 stale-marked TODO ήταν ήδη DONE → τα μάρκαρα DONE (live-verified). Η ουρά έφτασε **0 ενεργά** στην αρχή.
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `npm run type-check` **EXIT 0**· `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` = **0**. Ο νέος SaaS κώδικας (`lib/tenancy/context.ts`, `saasMode.ts`) καθαρός: μηδέν `any`.
  - **Auth: 0 unguarded** — μοναδικό v1 route χωρίς `withAuth`/`bearerUser` = `auth/login` (auth boundary, σωστά). 48/49 routes μέσω `withAuth`.
  - **Input validation: 0 gaps** — τα 3 εναπομείναντα raw-body routes validate τα inputs τους· `readBody` adoption = style/consistency, ΟΧΙ validation gap.
  - **Error handling: 0** — ομοιόμορφο try/catch + `{ error }` shape μέσω `withAuth`.
  - **DB: 0** — ΟΛΑ τα read paths `.lean()` (settings:16 + calendar:48 = multi-line builder chains με `.lean()` παρακάτω, false positives)· list endpoints `.limit()`+`.skip()`. Νέο `getTenantContext` κάνει `Tenant.findOne(...).lean()` × 2, gated πίσω από `SAAS_MODE` (μηδέν DB access όταν off) → καθαρό.
  - **SaaS tenancy (νέο, ceb65c6/1e5dc4c): 0 debt** — server-only, gated behind `SAAS_MODE`, `.lean()`, pure host-parser έχει tests (`host.test.ts`). Δεν εισάγει route/parity/type debt.
  - **Consistency debt (ανοιχτό): ανοίγω 1 P3/S** (readBody scan/expense + scan/voucher — twin one-liner swap, byte-behavior-identical). shopping-list POST μένει «needs care» (cast `Record<string,string>` → coercion, βλ. item σημείωση).
- **Counts ανά dimension: P1=0, P2=0, P3=1** (νέο, S). Δεν εφευρίσκω debt· 25 σαρώσεις χωρίς P1/P2, ο κώδικας παραμένει ώριμος.

---

## Σύνοψη audit (2026-07-01 24η σάρωση· builder έκλεισε isObjectId 4η/τελική παρτίδα, ουρά 2→1 ενεργό + ανοίγω 1 P3/S readBody continuation)

**2026-07-01 (24η σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 route files** + `apiAuth`/`apiBody`/`apiList` helpers, όλα από live grep. Από την 22η/23η σάρωση ο builder κατανάλωσε το commit **`f17f279`** (isObjectId 4η/τελική παρτίδα — 7 deep sub-routes) → το `isObjectId()` dedup effort **ΕΚΛΕΙΣΕ πλήρως**: `grep -rln '\[a-f0-9\]{24}' src/app/api/v1` = **NONE**, `isObjectId` adopters = **19**. Το πρώτο queue item ήταν stale-marked TODO ενώ ήταν ήδη DONE → το μάρκαρα DONE. Το δεύτερο (readBody settings + stores/[id]) παραμένει **ΑΝΟΙΧΤΟ** (live: settings/route.ts:72 + stores/[id]/route.ts:25 ακόμα με raw `req.json().catch`).
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `npm run type-check` **EXIT 0**· `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` = **0**.
  - **Auth: 0 unguarded** — μοναδικό v1 route χωρίς `withAuth`/`bearerUser` = `auth/login` (auth boundary, σωστά). 48/49 routes μέσω `withAuth` (bearer + try/catch + clean 500).
  - **Input validation: 0 gaps** — τα 13 raw-body routes ΟΛΑ validate τα inputs τους· `readBody` adoption = style/consistency, ΟΧΙ validation gap.
  - **Error handling: 0** — ομοιόμορφο try/catch + `{ error }` shape μέσω `withAuth`.
  - **DB: 0** — ΟΛΑ τα read paths `.lean()` (επαληθεύτηκαν live: receipts/items/expenses/subscriptions/statements/vouchers/tasks list builders + settings/calendar find-chains· reports:81 = JS `Array.find`, false positive)· list endpoints `.limit()`+`.skip()` via `listParams`.
  - **Consistency debt (ανοιχτό): 1 P3/S** ενεργό (readBody settings+stores/[id]) + **ανοίγω 1 νέο P3/S** (readBody receipts/[id]+rescan) για runway. Raw `req.json().catch` απομένει σε **13 routes**, `readBody` adopters **16**.
- **Counts ανά dimension: P1=0, P2=0, P3=2** (1 προϋπάρχον + 1 νέο, αμφότερα readBody continuation, S). Δεν εφευρίσκω debt· ο κώδικας παραμένει ώριμος (24 σαρώσεις χωρίς P1/P2).

---

## Σύνοψη audit (2026-07-01 22η σάρωση· builder έκλεισε isObjectId 3η παρτίδα, ουρά 0→ανοίγω 2 P3/S: isObjectId 4η [τελ.] παρτίδα + readBody settings/stores)

**2026-07-01 (22η σάρωση, αυτόνομος γύρος):** fresh σάρωση **52 route files** + `apiAuth`/`apiBody`/`apiList` helpers, όλα από live grep. Από την 21η σάρωση ο builder κατανάλωσε το commit **`c5cec57`** (isObjectId 3η παρτίδα — cards/[id]+stores/[id]+statements/[id]+notifications+trash/[type]/[id]) → επαλήθευση live: `isObjectId` adopters **12**· inline `[a-f0-9]{24}` regex απομένει μόνο σε **7 deep sub-routes**. Η ουρά έφτασε **0 ενεργά** στην αρχή αυτού του γύρου.
- **Ευρήματα ανά διάσταση (live grep):**
  - **Type safety: 0** — `npm run type-check` **EXIT 0**· `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` = **0** (μόνο 1 legit `hook as any` σε `lib/softDelete.ts` pre-hook cast, όχι v1).
  - **Auth: 0 unguarded** — μοναδικό v1 route χωρίς `withAuth` = `auth/login` (auth boundary, σωστά). Τα 51 v1 CRUD routes ΟΛΑ μέσω `withAuth` (bearer + try/catch + clean 500).
  - **Input validation: 0 gaps** — τα 13 raw-body routes validate τα inputs τους· `readBody`/`isObjectId` adoption = style/consistency, ΟΧΙ validation gap.
  - **Error handling: 0** — ομοιόμορφο try/catch + `{ error }` shape μέσω `withAuth`.
  - **DB: 0** — ΟΛΑ τα read routes `.lean()` (reports γρ.81 `.find()` = JS `Array.find`, όχι Mongoose)· list endpoints `.limit()` via `listParams`· no-limit finds (cards/statements/plans/calendar/overview/items/[id]/plans) = bounded aggregations, `.lean()`.
  - **Consistency debt (ανοιχτό): 2 P3/S** — isObjectId 4η (τελ.) παρτίδα (7 files, 8 occ.· κλείνει το effort) + readBody adoption (settings+stores/[id]).

## Σύνοψη audit (2026-07-01 21η σάρωση· builder έκλεισε isObjectId 2η παρτίδα, ουρά 0→ανοίγω 1 P3/S 3η παρτίδα)

**2026-07-01 (21η σάρωση, αυτόνομος γύρος):** fresh σάρωση **52 route files** (`find api/v1 -name route.ts`) + `apiAuth`/`apiBody`/`apiList` helpers + synced models, όλα από live grep (όχι docs). Από την 20ή σάρωση ο builder κατανάλωσε το commit **`f1413c3`** (isObjectId 2η παρτίδα — receipts/expenses/subscriptions/tasks/vouchers [id]) → το μοναδικό ενεργό P3/S της 20ής είναι πλέον **DONE** (επαλήθευση live: `isObjectId` adopters **7** = items, shopping-list + τα 5 της 2ης παρτίδας). Άρα η Web Debt Queue έφτασε **0 ενεργά** στην αρχή αυτού του γύρου.
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `npm run type-check` **EXIT 0**· `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` = **0** (και σε όλο το `src`).
  - **Auth: 0 unguarded** — `grep -rL 'withAuth|bearerUser'` → 3 hits εκτός v1-CRUD: `auth/login` (auth boundary, σωστά), `api/mcp` (κάνει δικό του bearer-check `authed()` μέσω `User.findOne({apiToken})`, σκόπιμα exempt από cookie middleware), `api/files/[...path]` (file-server, εκτός v1). Μηδέν v1 CRUD route χωρίς bearer.
  - **Input validation: 0 gaps** — τα 13 raw-body routes ΟΛΑ validate τα inputs τους· `readBody`/`isObjectId` adoption = style/consistency, ΟΧΙ validation gap. list params clamped 1..200· `ai` cap ενεργό.
  - **Error handling: 0** — ομοιόμορφο try/catch + `{ error }` shape μέσω `withAuth`· inline `NextResponse.json({ error })` μόνο σε auth boundaries (`auth/login`, `api/mcp` JSON-RPC).
  - **DB: 0** — synced models `index({ updatedAt: -1 })`· list endpoints `.lean()`+`.limit()`· no-limit finds = bounded-domain aggregations, `.lean()`.
  - **Duplication: 2 ongoing** — (1) raw-body `req.json().catch` σε **13 routes** (ai, ai/subscription, items/[id]/link-plan+price, items/import, push/register, receipts/[id]+rescan, scan/expense+voucher, settings, shopping-list, stores/[id]), **16 adopters** `readBody`· (2) ObjectId regex `/^[a-f0-9]{24}$/i` inline σε **12 route files** ακόμα (cards/[id], stores/[id], statements/[id], notifications, trash/[type]/[id], items/[id]/ai-fill+convert-to-task+link-plan+plans+price, receipts/[id]/add-to-library+rescan), `isObjectId` adopters **7**.
- **Counts ανά dimension: P1=0, P2=0, P3=1** (νέο: isObjectId dedup 3η παρτίδα, 5 route files cards/[id]+stores/[id]+statements/[id]+notifications+trash/[type]/[id], S). Άνοιξα ΜΟΝΟ 1 μη-sprawling item ώστε ο builder να έχει ουρά· δεν εφευρίσκω debt. Δες `## Needs Achilleas` στο PROGRESS για standing product decisions (login brute-force rate-limit, error-message leak στο `withAuth` 500, tasks `steps` χωρίς cap).

---

## Σύνοψη audit (2026-07-01 20ή σάρωση· builder έκλεισε items/[id]+shopping-list/[id] apiBody + 1η isObjectId παρτίδα, ουρά 0→ανοίγω 1 P3/S)

**2026-07-01 (20ή σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 route files** + `apiAuth`/`apiBody`/`apiList` helpers + 7 synced models. Από την 19η σάρωση ο builder κατανάλωσε το commit **`d259a55`** (shared `isObjectId()` guard στο `lib/apiBody.ts` + `readBody` σε items/[id] & shopping-list/[id] PATCH) → τα 2 ενεργά P3/S items της 19ης είναι πλέον **DONE** (επαλήθευση live: αμφότερα κάνουν πλέον `import { isObjectId, readBody } from '@/lib/apiBody'`, μηδέν raw `req.json().catch`). Άρα η Web Debt Queue έφτασε **0 ενεργά** στην αρχή αυτού του γύρου.
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `npm run type-check` EXIT 0· `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` = **0**.
  - **Auth: 0 unguarded** — `grep -rL withAuth|bearerUser` σε 49 routes → μόνο `auth/login` (auth boundary, σωστά). Κεντρικό bearer-check + try/catch + καθαρό 500 μέσω `withAuth`.
  - **Input validation: 0 gaps** — τα εναπομείναντα raw-body routes ΟΛΑ validate τα inputs τους· το `readBody`/`isObjectId` adoption είναι style/consistency, ΟΧΙ validation gap. list params clamped 1..200· `ai` cap (MAX_TURNS=20/MAX_CONTENT=8000) ενεργό.
  - **Error handling: 0** — ομοιόμορφο try/catch + `{ error }` shape μέσω `withAuth`· inline `NextResponse.json({ error })` μόνο στο `auth/login` (σκόπιμα).
  - **DB: 0** — 7/7 synced models `index({ updatedAt: -1 })`· heuristic sweep «limit χωρίς lean» = **0 hits**· τα list endpoints `.lean()`+`.limit()`· τα no-limit finds είναι bounded-domain aggregations, όλα `.lean()`.
  - **Duplication: 2 ongoing** — (1) raw-body `req.json().catch` σε **13 routes** (από 15· ο builder έκλεισε 2), **16 adopters**· (2) ObjectId regex `/^[a-f0-9]{24}$/i` inline σε **17 route files** ακόμα (από 19· 2 migrated στο `d259a55`), `isObjectId` adopters **2**.
- **Counts ανά dimension: P1=0, P2=0, P3=1** (νέο: isObjectId dedup 2η παρτίδα, 5 route files, S). Άνοιξα ΜΟΝΟ 1 μη-sprawling item ώστε ο builder να έχει ουρά· δεν εφευρίσκω debt. Δες `## Needs Achilleas` στο PROGRESS για standing product decisions (login brute-force rate-limit, error-message leak στο `withAuth` 500, tasks `steps` χωρίς cap).

---

## Σύνοψη audit (2026-07-01 19η σάρωση· ουρά αμετάβλητη, 2 P3/S ΑΝΟΙΧΤΑ, μηδέν app-code diff)

**2026-07-01 (19η σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 route files** + `apiAuth`/`apiBody`/serialize helpers + 10 models. `git log --oneline -- apps/web/src` → τελευταίος app-code commit **`0c866eb`** (notifications+lists PATCH `readBody`), ΙΔΙΟΣ με την 18η σάρωση· clean working tree, κανένας builder δεν κατανάλωσε web item ενδιάμεσα (τα ενδιάμεσα commits = mobile Button-family `3a272c1` + docs review/parity/ui-auditor/monitor/docker-health, μηδέν `apps/web/src` diff) → η ουρά είναι by-construction σταθερή: **2 ενεργά P3/S** (readBody items/[id]+shopping-list/[id]· ObjectId-regex dedup), όλα τα άλλα DONE. Επαναεπαλήθευσα και τα 2 ανοιχτά items live από κώδικα: `items/[id]:110` + `shopping-list/[id]:15` έχουν ακόμα το raw `const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;`.
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `npm run type-check` EXIT 0· `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` = **0**.
  - **Auth: 0 unguarded** — `grep -rL withAuth|bearerUser` σε 49 routes → μόνο `auth/login` (auth boundary, σωστά). Κεντρικό bearer-check + try/catch + καθαρό 500 μέσω `withAuth`.
  - **Input validation: 0 gaps** — τα εναπομείναντα 15 raw-body routes ΟΛΑ validate τα inputs τους (push/register Expo token, items/[id]/price `price>0`, link-plan `signature required`, ai messages shape+cap)· το `readBody` adoption είναι style/consistency, ΟΧΙ validation gap. list params clamped 1..200.
  - **Error handling: 0** — ομοιόμορφο try/catch + `{ error }` shape μέσω `withAuth`· inline `NextResponse.json({ error })` μόνο στο `auth/login` (σκόπιμα).
  - **DB: 0** — 7/7 synced models `index({ updatedAt: -1 })`· τα 11 list endpoints `.lean()`+`.limit()`· τα no-limit finds (settings/calendar/plans/overview/items[id]plans/reports/cards) είναι bounded-domain aggregations ή window-filtered, όλα `.lean()`.
  - **Duplication: 2** — (1) raw-body `req.json().catch` σε **15 routes**, 14 adopters (ongoing consistency)· (2) ObjectId regex `/^[a-f0-9]{24}$/i` inline σε **19 route files / 30 occurrences** → shared `isObjectId()` guard.
- **Counts ανά dimension: P1=0, P2=0, P3=2** (τα ήδη-ανοιχτά apiBody continuation items/[id]+shopping-list/[id]· ObjectId-regex dedup). Δεν ανοίγω νέο item (no debt to invent). Δες `## Needs Achilleas` στο PROGRESS για standing product decisions (login brute-force rate-limit, error-message leak στο `withAuth` 500, tasks `steps` χωρίς cap).

---

## Σύνοψη audit (2026-07-01 18η σάρωση· builder έκλεισε notifications+lists PATCH, ουρά 0→ανοίγω 2 P3/S)

**2026-07-01 (18η σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 route files** + `apiAuth`/`apiBody`/serialize helpers + 10 models. Από την 17η σάρωση ο builder κατανάλωσε το μοναδικό ενεργό item (commit `0c866eb`, notifications+lists PATCH `readBody`) → adopters `readBody` **12 → 14**, raw `req.json().catch` routes **17 → 15**. Το top item στην ουρά ήταν stale-marked TODO ενώ ήταν ήδη DONE → το μάρκαρα DONE (επαλήθευση: αμφότερα τα files κάνουν πλέον import `readBody`).
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `npm run type-check` EXIT 0· `:any`/`as any`/`@ts-ignore` σε ΟΛΟ το `/api/v1` = 0.
  - **Auth: 0 unguarded** — `withAuth` σε 48/49 routes, μόνο `auth/login` εξαιρείται (auth boundary, σωστά). Το `withAuth` κεντρικοποιεί bearer-check + try/catch + καθαρό 500.
  - **Input validation: 0 gaps** — τα εναπομείναντα raw-body routes (push/register `isExpoPushToken`, items/[id]/price `price>0`, link-plan `signature required`, κ.λπ.) ΟΛΑ validate τα inputs τους· το `readBody` adoption είναι καθαρά style/consistency, ΟΧΙ validation gap. list params clamped, `ai` cap ενεργό.
  - **Error handling: 0** — ομοιόμορφο try/catch + `{ error }` shape μέσω `withAuth`· inline `NextResponse.json({ error })` μόνο στο `auth/login` (σκόπιμα).
  - **DB: 0** — 7/7 synced models `index({ updatedAt: -1 })`· ΟΛΑ τα read paths `.lean()` (η μόνη «find χωρίς lean» στο reports:81 = `Array.prototype.find`, false positive)· τα μεγάλα list endpoints `.limit()`· τα no-limit finds είναι bounded-domain (AppConfig singleton, cards, calendar/reports derived).
  - **Duplication: 2** — (1) raw-body `req.json().catch` σε **15 routes**, 14 adopters (ongoing consistency)· (2) **ΝΕΟ:** το ObjectId regex `/^[a-f0-9]{24}$/i` inline σε **19 route files (30 occurrences)** ενώ ένα route έχει ήδη local `ID_RE` const → shared `isObjectId()` guard.
- **Counts ανά dimension: P1=0, P2=0, P3=2** (apiBody continuation items/[id]+shopping-list/[id]· ObjectId-regex dedup). Δες `## Needs Achilleas` στο PROGRESS για standing product decisions (login brute-force rate-limit, error-message leak στο `withAuth` 500, tasks `steps` χωρίς cap).

---

## Σύνοψη audit (2026-07-01 17η σάρωση· builder κατανάλωσε 6 apiBody routes, ουρά 0→ανοίγω 1 P3/S continuation)

**2026-07-01 (17η σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 route files** + 7 synced models. Από την 16η σάρωση ο builder κατανάλωσε **6 apiBody items** (git log: expenses/[id]+subscriptions/[id] PATCH, tasks/[id]+vouchers/[id] PATCH, cards field-dedup) → adopters `readBody` **6 → 12**, raw `req.json().catch` routes **23 → 17**. Όλα τα προηγούμενα queue items DONE → η Web Debt Queue ήταν **0 ενεργά** στην αρχή.
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `npm run type-check` EXIT 0· `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` = 0.
  - **Auth: 0 unguarded** — `grep -rL withAuth|bearerUser` σε 49 routes → μόνο `auth/login` (auth boundary, σωστά).
  - **Input validation: 0 NOGUARD** — ΟΛΑ τα 18 `[id]`/`[type]` routes με 24-hex `/^[a-f0-9]{24}$/i` guard (regex-aware sweep επιβεβαίωσε ΚΑΙ τα 18)· list params clamped 1..200· `ai` cap (MAX_TURNS=20/MAX_CONTENT=8000) ενεργό.
  - **Error handling: 0** inline `NextResponse.json({ error })` εκτός `auth/login` (3 hits, σκόπιμα auth boundary).
  - **DB: 0** — 7/7 synced models `index({ updatedAt: -1 })`· ΟΛΑ τα list endpoints `.limit()`+`.lean()`· heuristic no-lean sweep = 0 hits.
  - **Duplication: 1 ongoing** — raw-body `req.json().catch` σε **17 routes** (ai, ai/subscription, items/[id]+link-plan+price+import, lists, notifications, push/register, receipts/[id]+rescan, scan/expense+voucher, settings, shopping-list+[id], stores/[id]), **12 adopters**. Νόμιμο consistency debt.
- **Counts ανά dimension: P1=0, P2=0, P3=1** (νέο apiBody continuation, S· 2 απλά PATCH routes). Άνοιξα ΜΟΝΟ 1 μη-sprawling item ώστε ο builder να έχει ουρά· δεν εφευρίσκω debt. Δες `## Needs Achilleas` στο PROGRESS για 3 standing παρατηρήσεις (login brute-force, error-message leak, tasks `steps` χωρίς cap) που είναι product decisions, ΟΧΙ queue items.

---

## Σύνοψη audit (2026-07-01 16η σάρωση· νέος tasks-steps κώδικας καθαρός, ουρά 0→1 apiBody [id]-PATCH)

**2026-07-01 (16η σάρωση, αυτόνομος γύρος):** fresh σάρωση **41 route files** + 7 synced models. `git log --oneline -- apps/web/src` → τελευταίος app-code commit **`e0f7a97`** (feat mobile+api: Tasks steps/checklist — εκθέτει `steps` στο tasks API), ΝΕΟΤΕΡΟΣ από την 15η σάρωση (baseline `83cc537`, apiBody tasks+stores POST = προηγ. item, τώρα DONE). Άρα η Web Debt Queue ήταν **0 ενεργά** στην αρχή· ο builder έκλεισε το apiBody tasks+stores.
- **Νέος κώδικας ελεγμένος (tasks steps):** `tasks/route.ts` GET/POST + `tasks/[id]` PATCH εκθέτουν πλέον `steps: [{id,text,done}]`. **Καθαρό:** POST χρησιμοποιεί ήδη apiBody helpers· PATCH κάνει full-array replacement με validation (`String(s?.text ?? '').trim()` + `.filter(s => s.text)` → drop empty). Response shapes συνεπή με το υπόλοιπο API. Μοναδική παρατήρηση (χαμηλή, single-user): το `steps` array δεν έχει άνω όριο πλήθους/μήκους — αποδεκτό για WireGuard-only self-host, δεν ανοίγω item (δες Needs Achilleas).
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `npm run type-check` EXIT 0· `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` = 0.
  - **Auth: 0 unguarded** — `grep -rL withAuth|bearerUser` → μόνο `auth/login` (auth boundary, σωστά).
  - **Input validation: 0 NOGUARD** — όλα τα `[id]` routes με 24-hex `/^[a-f0-9]{24}$/i` guard· list params clamped 1..200· `ai` cap (MAX_TURNS/MAX_CONTENT) ενεργό.
  - **Error handling: 0** inline `NextResponse.json({ error })` εκτός `auth/login` (3 hits, σκόπιμα).
  - **DB: 0** — 7/7 synced models `index({ updatedAt: -1 })`· 7/7 list endpoints `.limit()`+`.lean()`· τα find-χωρίς-lean grep hits είναι multi-line builder chains (find σε μια γραμμή, `.lean()` παρακάτω) ή Array.find (reports), false positives.
  - **Duplication: 1 ongoing** — raw-body pattern `req.json().catch` σε **23 routes** (από 25· 2 έκλεισαν με `83cc537`), 6 adopters (`readBody`). Νόμιμο consistency debt.
- **Counts ανά dimension: P1=0, P2=0, P3=1** (νέο apiBody [id]-PATCH continuation, S). Άνοιξα ΜΟΝΟ 1 item (μη-sprawling, 2 routes) ώστε ο builder να έχει ουρά· δεν εφευρίσκω debt.

---

## Σύνοψη audit (2026-07-01 15η σάρωση· ουρά ΑΔΕΙΑ→ανοίγω 1 P3/S apiBody continuation)

**2026-07-01 (15η σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 route files** + 7 synced models. `git log --oneline -- apps/web/src` → τελευταίος app-code commit **`37fca25`** (apiBody adoption vouchers+items POST) = το προηγούμενο ενεργό item, τώρα DONE → η Web Debt Queue έφτασε **0 ενεργά** στην αρχή αυτού του γύρου (όλα τα προηγούμενα items DONE). **Μηδέν P1/P2 εύρημα**, όλα επαναεπαληθεύτηκαν live από grep:
- **Type safety**: `npm run type-check` → **exit 0**. `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` → **0**.
- **Auth**: `grep -L 'withAuth\|bearerUser'` sweep 49 routes → μόνο το `auth/login` (σωστά, auth boundary). 0 unguarded route.
- **Input validation**: sweep ΟΛΩΝ των `[id]`/`[type]` routes → **0 NOGUARD** (`ID_RE`/`isValidObjectId`/24-hex guard παντού). list params clamped 1..200. `ai` cap (`MAX_TURNS=20`+`MAX_CONTENT=8000`) στον κώδικα.
- **Error handling**: inline `NextResponse.json({ error })` σε `/api/v1` εκτός `auth/login` → **0**. Ομοιόμορφο try/catch + `apiError` μέσω `withAuth`.
- **DB**: 7/7 synced models με explicit `index({ updatedAt: -1 })` (sweep OK). 7/7 list endpoints (receipts/tasks/expenses/subscriptions/statements/vouchers/items) με `.limit()` + `.lean()`.
- **Duplication**: `req.json().catch` raw-body pattern → **25 routes** (από 27· 2 έκλεισαν με το `37fca25`), **4 adopters** (`readBody`). Νόμιμο ongoing consistency debt, ΟΧΙ invented.

**Ανοίγω 1 συνέχεια (P3/S, μη-sprawling):** apiBody adoption στα **tasks POST** (5× `String(b.)`: title/status/priority/content) + **stores POST** (name/url `typeof===string` trims), ίδιο 1:1-verified refactor με vouchers/items. Τα υπόλοιπα ~23 routes τεκμηριώνονται για μελλοντικά runs. Δες `## Needs Achilleas` στο PROGRESS για τις 2 standing security παρατηρήσεις (login brute-force, error-message leak) που είναι product decisions.

---

## Σύνοψη audit (2026-07-01 νυχτερινό re-audit· ουρά αμετάβλητη, μένει 1 P3/S ΑΝΟΙΧΤΟ)

**2026-07-01 (νυχτερινό, αυτόνομος γύρος):** fresh σάρωση **49 route files** + 7 synced models. `git log --oneline -- apps/web/src` → τελευταίος app-code commit **`a582ac5`** (ai chat-history cap), ΙΔΙΟΣ με τον προηγούμενο γύρο· clean working tree, κανένας builder δεν κατανάλωσε item ενδιάμεσα (τα ενδιάμεσα commits = docs review/monitor/docker-health/parity/ui-audit + `effd90d` mobile Button primitive, μηδέν `apps/web/src` diff) → η ουρά είναι by-construction σταθερή: **1 ενεργό P3/S** (apiBody adoption σε vouchers + items POST), όλα τα άλλα DONE. **Μηδέν νέο εύρημα σε καμία διάσταση**, όλα επαναεπαληθεύτηκαν live από grep:
- **Type safety**: `npm run type-check` → **exit 0**. `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` → **0**.
- **Auth**: `grep -L` sweep 49 routes → μόνο το `auth/login` χωρίς `withAuth`/`bearerUser` (σωστά, auth boundary). 0 unguarded route.
- **Input validation**: sweep ΟΛΩΝ των `[id]`/`[type]` routes → **0 NOGUARD** (24-hex/`ID_RE`/`isValidObjectId` guard παντού). list params clamped 1..200. `ai` cap επιβεβαιώθηκε στον κώδικα (`MAX_TURNS=20` slice + `MAX_CONTENT=8000` slice).
- **Error handling**: inline `NextResponse.json({ error })` σε `/api/v1` εκτός `auth/login` → **0**. Ομοιόμορφο try/catch + `apiError` μέσω `withAuth`.
- **DB**: 7/7 synced models με explicit `index({ updatedAt: -1 })` (sweep OK). **Και τα 8 list endpoints** (receipts/tasks/expenses/subscriptions/statements/vouchers/items + cards είναι non-list) έχουν `.limit()` + `.lean()`. Τα 6 no-limit `.find()` (settings/calendar/plans/overview/items[id]plans/reports) είναι non-list aggregations ή window-filtered, όλα `.lean()` (false positives επαληθευμένα).

Επαληθεύτηκε ξανά το 1 ενεργό item: `req.json().catch` grep → **27** mutation routes ακόμα με raw pattern (= apiBody adoption target), **2** adopters. `vouchers/route.ts` έχει 7× `String(b.)` (target του item). Δεν ανοίγω νέο item (no debt to invent).

---

## Σύνοψη audit (2026-07-01 βραδινό re-audit· ai-cap ΕΚΛΕΙΣΕ, μένει 1 P3/S ΑΝΟΙΧΤΟ)

**2026-07-01 (βραδινό, αυτόνομος γύρος):** fresh σάρωση **49 route files** + 7 synced models. `git log --oneline -- apps/web/src` → τελευταίος app-code commit **`a582ac5`** (ai chat-history cap) → ο builder έκλεισε ενδιάμεσα το item **«POST /api/v1/ai — cap μήκους ιστορικού messages»** (MAX_TURNS=20 + MAX_CONTENT=8000, ήδη marked DONE στην ουρά). Απομένει **1 ενεργό P3/S** (apiBody adoption σε vouchers + items POST), όλα τα άλλα DONE. **Μηδέν νέο εύρημα σε καμία διάσταση**, όλα επαναεπαληθεύτηκαν live από grep:
- **Type safety**: `npm run type-check` → **exit 0**. `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` → **0**.
- **Auth**: sweep 49 routes (σωστό `grep -L`, όχι buggy `-Lq`) → μόνο το `auth/login` χωρίς `withAuth`/`bearerUser` (σωστά, auth boundary). 0 unguarded route.
- **Input validation**: sweep ΟΛΩΝ των `[id]`/`[type]` routes → **0 NOGUARD** (`ID_RE = /^[a-f0-9]{24}$/i` guard παντού, π.χ. `shopping-list/[id]:14`). list params clamped 1..200.
- **Error handling**: inline `NextResponse.json({ error })` σε `/api/v1` εκτός `auth/login` → **0**. Ομοιόμορφο try/catch + `apiError` μέσω `withAuth`.
- **DB**: 7/7 synced models με explicit `index({ updatedAt: -1 })` (sweep OK). Οι 2 «no-lean» grep hits (settings:15, calendar:48) είναι multi-line builder chains με `.lean()` στην επόμενη γραμμή (επαληθευμένα false positives). list reads `.lean()` + `.limit()`.

Επαληθεύτηκε ξανά το 1 ενεργό item: `req.json().catch` grep → **27** mutation routes ακόμα με raw pattern (= apiBody adoption target), **2** adopters (`readBody`). `vouchers/route.ts` έχει 7× `String(b.)` (target του item). Δεν ανοίγω νέο item (no debt to invent).

---

## Σύνοψη audit (2026-07-01 όψιμο re-audit· ουρά αμετάβλητη, 2 P3/S ΑΝΟΙΧΤΑ)

**2026-07-01 (όψιμο, αυτόνομος γύρος):** fresh σάρωση **49 route files** + 7 synced models. `git log --oneline -- apps/web/src` → τελευταίος app-code commit **`c540322`** (apiError refactor), ΙΔΙΟΣ με τους 2 προηγούμενους γύρους· clean working tree, κανένας builder δεν κατανάλωσε item ενδιάμεσα (τα μετέπειτα commits = docs + mobile scrim/Input primitive, μηδέν `apps/web/src` diff) → η ουρά είναι by-construction σταθερή: **2 ενεργά P3/S** (apiBody adoption, ai messages cap), όλα τα άλλα DONE. **Μηδέν νέο εύρημα σε καμία διάσταση**, όλα επαναεπαληθεύτηκαν live από grep:
- **Type safety**: `npm run type-check` → **exit 0**. `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` → **0**.
- **Auth**: sweep 49 route.ts → μόνο το `auth/login` χωρίς `withAuth`/`bearerUser` (σωστά, auth boundary). 0 unguarded route.
- **Input validation**: sweep ΟΛΩΝ των `[id]`/`[type]` routes → **0 NOGUARD** (24-hex `a-f0-9` guard παντού, π.χ. `items/[id]:67`). list params clamped 1..200.
- **Error handling**: inline `NextResponse.json({ error })` σε `/api/v1` εκτός `auth/login` → **0**. Ομοιόμορφο try/catch + `apiError` μέσω `withAuth`.
- **DB**: 7/7 synced models με explicit `index({ updatedAt: -1 })` (sweep OK). list reads `.lean()` + `.limit()`.

Επαληθεύτηκε ξανά ότι τα 2 ενεργά items ισχύουν: `readBody` grep → **2** routes το χρησιμοποιούν, **27** ακόμα με raw `await req.json().catch` pattern (= apiBody adoption)· `ai/route.ts` χτίζει `messages` (γραμμή 15-23) χωρίς `slice`/cap πριν το `runAiCommand` (= ai messages cap)· `vouchers/route.ts` έχει 7× `String(b.)` (target του item). Δεν ανοίγω νέο item (no debt to invent).

---

## Σύνοψη audit (2026-07-01 αργά βραδινό re-audit· ουρά αμετάβλητη, 2 P3/S ΑΝΟΙΧΤΑ)

**2026-07-01 (αργά βραδινό, αυτόνομος γύρος):** fresh σάρωση **49 route files** + 7 synced models. `git log --oneline -- apps/web/src` → τελευταίος app-code commit **`c540322`** (apiError refactor), ΙΔΙΟΣ με τον προηγούμενο γύρο· clean working tree, κανένας builder δεν κατανάλωσε item ενδιάμεσα (τα μετέπειτα commits = docs + mobile Input primitive, μηδέν `apps/web/src` diff) → η ουρά είναι by-construction σταθερή: **2 ενεργά P3/S** (apiBody adoption, ai messages cap), όλα τα άλλα DONE. **Μηδέν νέο εύρημα σε καμία διάσταση**, όλα επαναεπαληθεύτηκαν live από grep:
- **Type safety**: `npm run type-check` → **exit 0**. `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` → **0** (ο μόνος `as any` παραμένει το Mongoose hook-name cast στο `lib/softDelete.ts:25`, αναγκαίο).
- **Auth**: sweep 49 routes → μόνο το `auth/login` MISSING `withAuth` (σωστά, auth boundary). 0 unguarded route.
- **Input validation**: ΟΛΑ τα `[id]`/`[type]` routes με 24-hex/`ID_RE` guard. list params clamped 1..200.
- **Error handling**: inline `NextResponse.json({ error })` σε `/api/v1` → **3 hits, ΟΛΑ στο `auth/login`** (400/400/401, σκόπιμα εξαιρείται). 0 αλλού.
- **DB**: 7/7 synced models με explicit `index({ updatedAt: -1 })` (sweep OK). Οι 9 «no-lean» grep hits είναι non-list endpoints (ai/search/jobs/notifications/history/lists/trash/stores/shopping-list — δικά τους read patterns ή aggregations, false positives επαληθευμένα).

Το `raw body pattern` grep επιβεβαίωσε **27 mutation routes** ακόμα χωρίς τα `apiBody` helpers (ακριβώς το item «apiBody adoption») και το `ai/route.ts` χτίζει `messages` χωρίς cap πριν το `runAiCommand` (ακριβώς το item «ai messages cap»). Και τα 2 items παραμένουν έγκυρα. Δεν ανοίγω νέο item (no debt to invent).

---

## Σύνοψη audit (2026-07-01 βραδινό re-audit· 2 νέα P3/S items, ουρά καθαρή αλλιώς)

**2026-07-01 (βραδινό, αυτόνομος γύρος):** fresh σάρωση **50 route files** + 7 synced models + `apiAuth`/`apiList`/`apiBody`/`serialize`. Τελευταίος `apps/web/src` app-code commit παραμένει `c540322` (apiError refactor)· clean tree, κανένας builder δεν κατανάλωσε item ενδιάμεσα. Η `/api/v1` επιφάνεια είναι ώριμη — **μηδέν P1/P2 εύρημα** σε καμία διάσταση:
- **Type safety**: `npm run type-check` → **exit 0**. `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` → **0** (ο μόνος `as any` είναι στο `lib/softDelete.ts:25`, Mongoose hook-name cast, αναγκαίο).
- **Auth**: sweep 50 routes → μόνο το `auth/login` MISSING `withAuth` (σωστά, auth boundary). 0 unguarded route. `push/register` + `items/import` + `scan/*` + `ai` όλα μέσα σε `withAuth`.
- **Input validation**: ΟΛΑ τα `[id]`/`[type]` routes έχουν 24-hex/`ID_RE` guard (sweep → 0 NOGUARD). `push/register` validate Expo token, `items/import` validate http(s) url, `ai` validate messages shape. list params clamped 1..200.
- **Error handling**: ομοιόμορφο try/catch + `apiError` μέσω `withAuth`· `auth/login` έχει δικό του (JSON-parse guard + 400/401). Καμία inline `NextResponse.json({ error })` εκτός `auth/login`. Κανένα route δεν χάνει `connectDB()` (sweep 0).
- **DB**: 7/7 synced models με explicit `index({ updatedAt: -1 })`. ΟΛΑ τα list reads `.lean()` + `.limit()`. Τα non-list reads (settings/calendar/reports/overview/plans) είναι window-filtered + `.lean()` ή σκόπιμα full-dataset aggregations (reports/overview)· `Statement.find()` χωρίς limit = επιβεβαιωμένο low-risk (λίγα docs/κάρτα-μήνα).

**Νέα ευρήματα (2, και τα δύο P3/S consistency-hardening, όχι correctness):** (1) **apiBody adoption** — 27/29 mutation routes δεν χρησιμοποιούν ακόμα τα shared body-helpers· ανοίγω continuation για 2 routes (vouchers + items POST). (2) **ai messages cap** — το `POST /api/v1/ai` είναι το μόνο array-input χωρίς άνω όριο μήκους (cost exposure στην Anthropic κλήση)· cap στα τελευταία N turns. Δες `## Needs Achilleas` στο PROGRESS για 2 security παρατηρήσεις (login brute-force, error-message leak) που είναι product decisions, όχι queue items.

---

## Σύνοψη audit (2026-07-01 απόγευμα re-audit· ΟΥΡΑ ΑΔΕΙΑ, 0 ενεργά items)

**2026-07-01 (απόγευμα, αυτόνομος γύρος):** fresh σάρωση **49 route files** + 7 synced models + `apiAuth`/`apiList`/`apiBody`/`serialize`. **Καθοριστικό:** ο builder έκλεισε ενδιάμεσα το τελευταίο ανοιχτό P3 (inline error → `apiError` στα 4 routes, commit `c540322`, ο πλέον τελευταίος app-code commit στο `apps/web/src`) → η Web Debt Queue είναι πλέον **0 ενεργά items** (και τα 8 DONE). **Μηδέν νέο εύρημα σε καμία διάσταση**, όλα επαναεπαληθεύτηκαν live από grep:
- **Type safety**: `npm run type-check` → **exit 0**. Grep `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` → **0**.
- **Auth**: sweep 49 routes → μόνο το `auth/login` βγαίνει MISSING `withAuth` (σωστά, auth boundary)· 0 unguarded route.
- **Input validation**: sweep όλων των `[id]`/`[type]` routes για 24-hex/`ID_RE`/`isValidObjectId` guard → **0 NOGUARD**. list params clamped.
- **Error handling**: sweep inline `NextResponse.json({ error })` σε `/api/v1` εκτός `auth/login` → **0** (το P3 έκλεισε στο `c540322`). Ομοιόμορφο try/catch + `apiError` μέσω `withAuth`.
- **DB**: 7/7 synced models με explicit `index({ updatedAt: -1 })`. Οι 2 grep hits χωρίς `.lean()` (settings:15, calendar:48) είναι multi-line builder chains με `.lean()` στην επόμενη γραμμή (επαληθευμένα false positives). Pagination 1..200 παντού.

Η `/api/v1` επιφάνεια είναι ώριμη και η ουρά καθαρή. Δεν ανοίγω νέο item (no debt to invent). Ο builder δεν έχει ενεργό web item → πέφτει στο mobile UI Debt Queue (Input primitive migration, top-3 στο PROGRESS).

---

## Σύνοψη audit (2026-07-01 μεσημέρι re-audit· queue σταθερή, μένει 1 P3 ΑΝΟΙΧΤΟ)

**2026-07-01 (μεσημέρι, αυτόνομος γύρος):** fresh σάρωση **49 route files**. `git log --oneline -- apps/web/src` → τελευταίος app-code commit **`86c6ada`** (Items ai-fill), ίδιος με τους 3 προηγούμενους γύρους· clean working tree, κανένας builder δεν κατανάλωσε item ενδιάμεσα (τα ενδιάμεσα commits `ad1e32c`/`866d6e9`/`32c2501`/κλπ = docs + mobile Input primitive, μηδέν `apps/web/src` diff) → η ουρά by-construction σταθερή (**1 ενεργό P3**, όλα τα άλλα 7 DONE). **Μηδέν νέο εύρημα σε καμία διάσταση**, όλα επαναεπαληθεύτηκαν live από grep:
- **Type safety**: `npm run type-check` → **exit 0**. Grep `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` → **0**.
- **Auth**: 48/49 route files περνούν `withAuth`/`bearerUser`· ΜΟΝΟ το `auth/login` βγαίνει MISSING στο sweep (σωστά — auth boundary). 0 unguarded route.
- **Input validation**: sweep όλων των `[id]`/`[type]` routes για 24-hex guard → **0 NOGUARD**. list params clamped.
- **Error handling**: ομοιόμορφο try/catch μέσω `withAuth`. Μένουν **4 routes** με inline `NextResponse.json({ error }, { status })` (scan/receipt:20, scan/product:14, shopping-list:18, items:61) = ΑΚΡΙΒΩΣ το 1 ανοιχτό P3· το `auth/login` (3 inline: 400/400/401) εξαιρείται σκόπιμα.
- **DB**: sweep και των 7 synced models (Item/Task/Receipt/Expense/Subscription/Statement/Voucher) για `index({ updatedAt` → **7 OK**. `.lean()` παντού στα reads, pagination 1..200.

Η `/api/v1` επιφάνεια παραμένει ώριμη. Δεν ανοίγω νέο item (no debt to invent).

---

## Σύνοψη audit (2026-07-01 πρωί re-audit· queue σταθερή, μένει 1 P3 ΑΝΟΙΧΤΟ)

**2026-07-01 (πρωί, αυτόνομος γύρος):** fresh σάρωση **49 route files** + 7 synced models + `apiAuth`/`apiList`/`apiBody`/`serialize`. `git log --oneline -- apps/web/src/app|lib|models` → τελευταίος app-code commit **`86c6ada`** (Items ai-fill), ίδιος με τους προηγούμενους 2 γύρους· clean tree, κανένας builder δεν κατανάλωσε item ενδιάμεσα → η ουρά είναι by-construction σταθερή (**1 ενεργό P3**, όλα τα άλλα DONE) + κάθε ανοιχτό item επαναεπαληθεύτηκε από grep. **Μηδέν νέο εύρημα σε καμία διάσταση:**
- **Type safety**: `npm run type-check` → **exit 0**. Grep `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` → **0**.
- **Auth**: 48/49 route files περνούν `withAuth`/`bearerUser`· μόνο το `auth/login` εξαιρείται (σωστά). 0 unguarded route.
- **Input validation**: ΟΛΑ τα `[id]`/`[type]` routes έχουν 24-hex id guard (sweep → 0 MISSING). list params clamped.
- **Error handling**: ομοιόμορφο try/catch μέσω `withAuth` (clean 500). Μένουν **4 routes** με inline `NextResponse.json({ error }, { status: 400 })` (scan/product:14, scan/receipt:20, shopping-list:18, items:61) — ΑΚΡΙΒΩΣ το 1 ανοιχτό P3· το `auth/login` (3 inline errors) εξαιρείται σκόπιμα.
- **DB**: και τα 7 synced models έχουν explicit `index({ updatedAt: -1 })` (Item..Voucher, sweep OK). ΟΛΕΣ οι `.find()` reads κάνουν `.lean()` (οι 9 grep hits ήταν `const find=…` builder chains + settings/calendar aggregations, όλα με `.lean()` στην επόμενη γραμμή· false positives επαληθευμένα). Pagination 1..200 παντού. `User.apiToken` indexed.

Η `/api/v1` επιφάνεια παραμένει ώριμη. Δεν ανοίγω νέο item (no debt to invent).

---

## Σύνοψη audit (2026-07-01 αργά νύχτα re-audit· queue σταθερή, μένει 1 P3 ΑΝΟΙΧΤΟ)

**2026-07-01 (αργά νύχτα, αυτόνομος γύρος):** fresh σάρωση **49 route files** (νέο `items/[id]/ai-fill/route.ts` από commit `86c6ada`). Ο κώδικας στο `apps/web/src` αμετάβλητος από τον προηγούμενο γύρο (μόνο docs commits μετά το `6a5809a`). **Μηδέν νέο εύρημα.** Το νέο `ai-fill` route ελέγχθηκε καθαρό: `withAuth` + 24-hex id guard + `apiError`, mode-validation (`'specs'|'info'`), wrap των proven web actions `aiFillSpecs`/`aiFillInfo` (AI-feature gated). Ουρά: **1 ενεργό P3** (inline error → `apiError`, 4 routes: scan/product:14, scan/receipt:20, shopping-list:18, items:61· επαναεπαληθεύτηκε από grep), όλα τα άλλα 6 items DONE. `npm run type-check` → **exit 0**.

**2026-07-01 (νυχτερινός γύρος):** πλήρης fresh σάρωση όλων των **48 route files** (+ `serialize.ts`) σε ΟΛΕΣ τις διαστάσεις. Ο builder έκλεισε ενδιάμεσα το P3 «Receipt lineItems serializer» (commit `6a5809a`, last app-code commit στο `apps/web/src`) → η ουρά έχει πλέον **1 ενεργό P3** (inline error → `apiError`, 4 routes: scan/product:14, scan/receipt:20, shopping-list:18, items:61 — επαναεπαληθεύτηκε από grep). **Μηδέν νέο εύρημα** σε καμία διάσταση:
- **Type safety**: `npm run type-check` → **exit 0**. Μηδέν `: any` / `as any` / `@ts-ignore` σε ΟΛΟ το `/api/v1`. Το μόνο `any` στο `lib/` είναι ένα Mongoose-hook cast (`softDelete.ts:25`, γνωστός τύπος-περιορισμός του Mongoose) — αποδεκτό, narrow.
- **Auth**: ΟΛΑ τα 48 route handlers περνούν `withAuth`/`bearerUser` εκτός του `auth/login` (σωστά). Sweep επιβεβαίωσε 0 unguarded route.
- **Input validation**: ΟΛΑ τα `[id]`/`[type]` routes έχουν 24-hex id guard (0 χωρίς). list params clamped (limit 1..200, offset ≥0). body reads μέσω `readBody`/`apiBody` helpers.
- **Error handling**: ομοιόμορφο try/catch μέσω `withAuth` (clean 500), `req.json().catch(()=>({}))` παντού, 0 swallowed catch.
- **DB**: ΟΛΑ τα sort keys των list endpoints είναι indexed (date/nextRenewal/period/expiresAt/updatedAt). ΟΛΕΣ οι reads `.lean()` (οι «no-lean» grep hits ήταν chained `const find=…` ή array `.find` — false positives). Pagination παντού.

Η `/api/v1` επιφάνεια παραμένει σε εξαιρετική κατάσταση. Δεν ανοίγω νέο item (no debt to invent).

---

## Σύνοψη audit (2026-07-01 re-audit — ουρά αμετάβλητη: 2 P3 items ΑΝΟΙΧΤΑ· μηδέν app-code commit ενδιάμεσα)

**2026-07-01:** re-audit ολόκληρης της `/api/v1` (πλέον **48 route files**, +2 από προηγούμενα: `items/[id]/convert-to-task` + `receipts/[id]/rescan`). `git log --oneline -- apps/web/src` → ο τελευταίος app-code commit είναι `9b34b44` (body-coercion), ίδιος με το προηγούμενο audit· **κανένας builder δεν κατανάλωσε item ενδιάμεσα** → τα 2 P3 items παραμένουν TODO + επαναεπαληθεύτηκαν από τον κώδικα (lineItems copy-paste σε receipts/[id]:28, receipts/[id]/rescan:44, scan/receipt:30· inline error σε scan/product:14, scan/receipt:20, shopping-list:18, items:61). Οι 2 νέες routes είναι καθαρές (withAuth + 24-hex guard + apiError + 404 handling). Μηδέν νέο P1/P2/P3 εύρημα. `npm run type-check` → exit 0.

---

## Σύνοψη audit (2026-06-30 βραδινό re-audit — ΟΛΑ τα 5 αρχικά items DONE· 2 νέα P3 items προστέθηκαν)

**Καθοριστικό εύρημα αυτού του run: η αρχική ουρά (5 items) είναι πλέον ΟΛΗ DONE.** Ο builder υλοποίησε τα 4 ανοιχτά (commits `5457339` index-updatedAt, `4ead61b` whitelist-status, `261a4fb` shopping-list id-guard, `9b34b44` body-coercion helpers) ΚΑΙ το P2#3 (GET /items listEnvelope, commit `c3c9fae`) — το οποίο ήταν ακόμα stale-marked TODO. Το επαλήθευσα από τον κώδικα: `GET /items` γυρνά τώρα `listEnvelope({data})` (route.ts:53) + ο mobile consumer διαβάζει `.data` (`apps/mobile/src/api.ts:205`), άρα συμβατό end-to-end → το μάρκαρα DONE.

**Νέο fresh scan (46 route files + 10 models + apiList/apiAuth/serialize):** βρέθηκαν **2 μικρά P3 (polish) items** — και τα δύο dedup/consistency, μηδέν correctness ρίσκο:
1. 4 routes (scan/product, scan/receipt, shopping-list, items POST) επιστρέφουν inline `NextResponse.json({ error }, { status: 400 })` αντί για το shared `apiError()` helper (πανομοιότυπο shape· καθαρό consistency).
2. Η normalization των receipt lineItems (`{ name: refinedName||name, qty, price, vatRate }` + `LineLean` type) είναι copy-paste σε **3** routes (scan/receipt, receipts/[id] GET, receipts/[id]/rescan) → shared serializer στο `receipts/serialize.ts`.

Η `/api/v1` επιφάνεια παραμένει σε πολύ καλή κατάσταση. Μηδέν P1/P2 εύρημα αυτόν τον γύρο:

- **Type safety**: `npm run type-check` → **exit 0**. Μηδέν `any` / `@ts-ignore` στα routes· χρήση `unknown` + στοχευμένα casts. Καθαρό.
- **Auth**: ΟΛΑ τα `/api/v1` routes περνούν από `withAuth` (`lib/apiAuth.ts`) εκτός του `auth/login` (σωστά). Το `User.apiToken` (hot lookup σε κάθε request) είναι indexed. Καθαρό.
- **Error handling**: ομοιόμορφο try/catch μέσω `withAuth` → καθαρό 500· κάθε body read κάνει `req.json().catch(() => ({}))` (δεν σκάει σε κακό JSON)· μηδέν swallowed catches. Καθαρό.
- **Reads**: όλα τα list endpoints κάνουν `.lean()` + `skip/limit` pagination (1..200). Καλό.

Ενεργά items (επιβεβαιωμένα live στην 36η σάρωση, 2026-07-03): **2 auto-buildable P3/S** (invites `saasGuard` + Account token-hash sparse index) + **2 decision-flavored P3** (connection cache-reuse `readyState` guard, reset-request timing). Ολα P3· μηδέν P1/P2 ανοιχτό, type-check EXIT 0. Η ευρεία standardization του response envelope σε ΟΛΑ τα endpoints (breaking change που συντονίζεται με το mobile) παραμένει στο `## Needs Achilleas` του PROGRESS, ΟΧΙ εδώ.

---

## Web Debt Queue

### Tenant `status:'canceled'`/`'suspended'` δεν επιβάλλεται πουθενά → soft-cancel/dunning ΔΕΝ μπλοκάρει πρόσβαση
- Priority: P2
- Size: M
- Area: shared
- Files: apps/web/src/lib/tenancy/workspaceSession.ts (ή νέος shared status gate), apps/web/src/lib/tenancy/saasApi.ts, apps/web/src/app/api/saas/workspace/route.ts, apps/web/src/app/api/saas/billing/webhook/route.ts, apps/web/src/models/Tenant.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα (επιφανειοποιήθηκε από το commit `681a647` workspace soft-cancel + προϋπάρχει από το billing webhook):** δύο flows θέτουν `Tenant.status = 'canceled'` — το νέο owner-only DELETE `/api/saas/workspace` (soft-cancel) και το `billing/webhook/route.ts:138` (dunning/subscription cancel). Το `Tenant.ts:27` σχόλιο + το commit message («blocks access, reversible») δηλώνουν ρητά ότι `suspended`/`canceled` **μπλοκάρουν πρόσβαση**. Ομως live grep σε ΟΛΟ το `src/` (`grep -rn "canceled\|suspended" src --include=*.ts`) δείχνει **μηδέν enforcement point**: ούτε το `resolveWorkspaceSession`, ούτε το `accountTenants`/`saasApi`, ούτε κανένα v1 feature-route auth path ελέγχει `tenant.status`. Το `accountTenants` φιλτράρει ΜΟΝΟ `Membership.status:'active'`, ΠΟΤΕ `Tenant.status`. Αποτέλεσμα: ένα canceled/suspended workspace παραμένει **πλήρως προσβάσιμο** — ο soft-cancel και το dunning είναι κοσμητικά (θέτουν flag + audit row που κανείς δεν διαβάζει). Η acceptance του `681a647` («blocks access») ΔΕΝ ικανοποιείται.
  - **ΣΗΜ επίπτωσης:** `SAAS_MODE`-only (dead-until-SaaS· μηδέν επίδραση self-hosted ή v1 mobile). Ομως όταν ανοίξει το SaaS, είναι billing/access-control correctness: ένας μη-πληρώνων (past_due→canceled) tenant συνεχίζει να χρησιμοποιεί την app. P2 γιατί είναι το enforcement που κάνει cancel/suspend/dunning να έχουν νόημα.
  - **Fix (μία απόφαση: πού μπαίνει το gate):** πρόσθεσε έναν κεντρικό έλεγχο `if (tenant.status === 'canceled' || tenant.status === 'suspended') → 403 { error, code:'workspace_inactive' }` στο **σημείο όπου resolve-άρεται το tenant context για write feature-routes + control-plane** (πιθανότερα στο `resolveWorkspaceSession` και/ή στο tenant-context resolution του v1 auth path). Απόφαση scope: (α) μπλοκάρεις read+write ή μόνο write (ώστε ο owner να μπορεί να δει/reactivate); (β) εξαιρείς το reactivate flow + το ίδιο το GET `/api/saas/workspace` ώστε ο owner να ξαναανοίξει. Πρότεινε: block feature-routes (v1) πλήρως, άφησε control-plane read (workspace GET, billing) ώστε reactivate/upgrade να δουλεύει.
  - **ΣΗΜ:** μην dropάρεις data· ΜΟΝΟ gate. Το drop της isolated data-db μένει manual (per το route docstring). Αν το scope είναι ασαφές (ποια ακριβώς routes gate + reactivate UX) → κόψε ένα «Needs Achilleas» sub-decision αντί να μαντέψεις.
  - Επαλήθευση: canceled tenant → v1 feature call → 403 (όχι 200)· reactivate path παραμένει προσβάσιμος· `grep -rn "status === 'canceled'\|status === 'suspended'" src/lib/tenancy` δείχνει ≥1 enforcement hit (όχι μόνο comment/audit/set).
  - npm run type-check exits 0
- Status: **CONTROL-PLANE HALF DONE 2026-07-03 (commit `b911882`)** — ο `resolveWorkspaceSession` (`workspaceSession.ts:84`) καλεί πλέον νέο pure guard `workspaceStatusError(tenant.status)` (`workspace.ts:52`) → 403 για `suspended`/`canceled`/`pending` σε ΟΛΑ τα workspace-scoped control-plane routes (members/audit/invites/rename)· το GET (view) + DELETE (idempotent soft-cancel) opt-out με `allowInactive` ώστε ο owner να βλέπει + reactivate. Η acceptance «`grep -rn "status === 'canceled'..." src/lib/tenancy` ≥1 enforcement hit» ΙΚΑΝΟΠΟΙΕΙΤΑΙ (workspaceSession.ts:84 + workspace.ts:52). **RESIDUAL → μεταφέρθηκε σε Needs Achilleas (PROGRESS 2026-07-03, 39η σάρωση):** το v1 feature data path (receipts/items/expenses…) ΔΕΝ είναι ακόμα tenant-scoped — ο `withAuth`→`bearerUser` (`apiAuth.ts:9`) resolve-άρει User by `apiToken`, μηδέν `getTenantContext`/tenant, άρα δεν υπάρχει σημείο να μπει `tenant.status` gate στο v1 σήμερα. Η v1-data-path enforcement εξαρτάται από (α) το v1 να γίνει tenant-scoped (μεγαλύτερο SaaS-data-isolation κομμάτι που δεν υπάρχει) + (β) read-vs-write product decision → όχι actionable ως standalone S/M builder item. Το control-plane μισό (το ενεργό enforcement που κάνει soft-cancel/dunning να έχουν νόημα) έκλεισε· βγαίνει από την ενεργή ουρά.

### saasGuard adoption σε invites/route.ts (DELETE write-route + GET) — missed από το try/catch slice 2/2
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/saas/invites/route.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα (κενό μετά το κλείσιμο του P2/M try/catch item):** το slice 2/2 (commit `a2e1811`) τύλιξε σε `saasGuard` ΟΛΑ τα write saas routes (members×4, invites/resend, billing checkout/portal, auth login/signup), και η DONE-note (row 459) απαρίθμησε ρητά τα read-only routes που αφέθηκαν σκόπιμα (`usage`/`session`/`logout`/`audit`/`billing GET`/`invites GET`/`invites/accept`/`webhook`). Ομως το **`invites/route.ts` DELETE** (revoke invite: `Invite.findOneAndUpdate({ _id, tenant, status:'pending' }, { status:'revoked' })`, γρ.89) είναι **write route** που ΔΕΝ μπήκε ΟΥΤΕ στη wrapped λίστα ΟΥΤΕ στη deliberately-left read-only λίστα → live: `grep -q 'saasGuard\|try {' invites/route.ts` = **μηδέν**. Ενα thrown `findOneAndUpdate()` / `connectDB()` βγαίνει ως framework-default 500 (HTML/κενό), ΟΧΙ `{ error }` — ασύμμετρο με το sibling `members` DELETE (wrapped). Το GET (`Invite.find(...)`, γρ.~46) έχει το ίδιο κενό (read, χαμηλότερη πιθανότητα throw).
  - **ΣΗΜ χαμηλής επίπτωσης:** owner/admin-gated + `SAAS_MODE`-only (dead-until-SaaS)· καθαρά error-shape consistency, ΟΧΙ security/data-integrity (τα `resolveWorkspaceSession` gate, `isObjectId` guard, `{_id,tenant,status:'pending'}` scope μένουν σωστά). Ολοκληρώνει το try/catch item — μετά από αυτό ΚΑΘΕ write saas route περνά από `saasGuard`.
  - **Fix:** `import { saasGuard } from '@/lib/tenancy/saasApi';` + τύλιξε τα σώματα GET και DELETE σε `return saasGuard(async () => { ...υπάρχον σώμα... });` (ίδιο pattern με members/route.ts). Το `resolveWorkspaceSession` gate (επιστρέφει early χωρίς throw), το `isObjectId` guard, τα response shapes (400/404/200 `{ revoked }`, GET `{ workspace, invites }`), το `recordAudit` — ΟΛΑ αμετάβλητα· αλλάζει ΜΟΝΟ ο unexpected throw → καθαρό `{ error }` 500.
  - Επαλήθευση: `grep -c 'saasGuard' src/app/api/saas/invites/route.ts` ≥ 2 (import + ≥1 wrap)· κανένα write saas route δεν μένει χωρίς `saasGuard`.
  - npm run type-check exits 0
- Status: DONE (2026-07-04 46η σάρωση επιβεβαίωσε κλείσιμο· builder commit `388246d` «fix(saas): wrap invites route GET+DELETE in saasGuard»· live: `saasGuard` import γρ.13 + GET(45) + DELETE(106) και τα δύο `return saasGuard(async () => {...})`· κάθε write saas route περνά πλέον από `saasGuard`)

### DELETE /api/saas/invites — λείπει id-format guard στο inviteId (CastError → 500) — DONE 2026-07-02
- Status: DONE (commit αυτού του run). Fix = `import { isObjectId }` από `apiBody` + `if (!isObjectId(inviteId)) return 400 'invalid inviteId'` μετά το `!inviteId` check, πριν το `Invite.updateOne`. Reuse του υπάρχοντος shared helper (όχι νέο inline regex). type-check EXIT 0, apiBody+invites suites 52/52 pass, web serve /login 200.
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/saas/invites/route.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα (εισήχθη με το commit `f4bdd8e` invites list/revoke):** το DELETE διαβάζει `body.inviteId` (trimmed string) και το περνά κατευθείαν στο `Invite.updateOne({ _id: inviteId, tenant, status:'pending' }, ...)` χωρίς έλεγχο μορφής. Ενα malformed inviteId (π.χ. `"abc"`) προκαλεί Mongoose CastError στο `_id` cast → uncaught (η route δεν έχει try/catch) → framework-default 500 αντί για καθαρό 400. Ο codebase έχει τεκμηριωμένη σύμβαση (βλ. `shopping-list/[id]` DONE 2026-06-30) ότι ΟΛΑ τα id-taking routes κάνουν validate `^[a-f0-9]{24}$` πριν φτάσει το id στη query. Αυτό είναι το ΜΟΝΟ id-taking route (μαζί με τα ήδη flagged saas billing) χωρίς guard.
  - **ΣΗΜ χαμηλής επίπτωσης:** owner/admin-gated + SAAS_MODE-only (dead-until-SaaS)· ένα malformed id απλώς δίνει 500 αντί 400/404 σε authed manager. Καθαρά consistency/robustness, όχι security ούτε data-integrity (το `status:'pending'` + `tenant` scope μένουν σωστά).
  - **Fix:** πρόσθεσε `const ID_RE = /^[a-f0-9]{24}$/i;` (ή reuse τυχόν shared guard) και μετά το `inviteId` trim: `if (!ID_RE.test(inviteId)) return NextResponse.json({ error: 'bad id' }, { status: 400 });` — πριν το `Invite.updateOne`. Καμία αλλαγή στα υπόλοιπα response shapes (400 `inviteId is required`, 404 `no pending invite`, 200 `{ revoked }`) ούτε στη σειρά των guards (το resolveWorkspaceSession μένει πρώτο).
  - Επαλήθευση: malformed inviteId → 400 αντί 500· `grep -n 'test(inviteId)' src/app/api/saas/invites/route.ts` δείχνει 1 hit.
  - npm run type-check exits 0
- Status: DONE 2026-07-02 (verified 35η σάρωση). Live: `invites/route.ts:4` κάνει `import { readBody, isObjectId } from '@/lib/apiBody';` + γρ.82 `if (!isObjectId(inviteId)) return 400 'invalid inviteId'` πριν το `findOneAndUpdate`. Το malformed id → 400 αντί CastError-500. (Το προηγ. trailing «TODO» ήταν stale· ο header ήδη έγραφε DONE.)

### Seat-cap ασυμμετρία — το existing-account add path ΔΕΝ μετράει τα pending invites
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/saas/members/route.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα (εισήχθη με το commit `c4a64c3` invite-by-email):** το ΝΕΟ invite path (`inviteUnregistered`, `members/route.ts`) μετράει σωστά το seat cap ως `activeCount + pendingCount` (active memberships ΣΥΝ outstanding pending invites) — ένα pending invite δεσμεύει μελλοντικό seat. Ομως το προϋπάρχον existing-account add path (POST, ίδιο αρχείο, ~γρ.219) μετράει ΜΟΝΟ `activeCount` (`Membership.countDocuments({ tenant, status:'active' })`) — αγνοεί τελείως τα pending invites. Ασυμμετρία: με cap=2, 1 active member + 1 pending invite, το να προσθέσεις έναν ΥΠΑΡΧΟΝΤΑ account περνάει (`withinSeatLimit(plan, 1)` → true) → κατάληξη 2 active + 1 pending = 3 δεσμευμένα seats, πάνω από το cap. Ενας owner μπορεί να ξεπεράσει το plan allowance συνδυάζοντας invites + existing-account adds.
  - **ΣΗΜ χαμηλής επίπτωσης:** ο owner πληρώνει, το accept-time ΔΕΝ ξανα-ελέγχει cap (ο invite μετρήθηκε στο mint), και το overshoot είναι bounded από το πλήθος outstanding invites. Καθαρά billing-correctness inconsistency, όχι security. Flag για συνέπεια — μόλις υπάρχει η έννοια «pending invite δεσμεύει seat», ΚΑΘΕ seat-check πρέπει να την τιμά.
  - **Fix:** στο existing-account branch, πρόσθεσε το pending-invite count στο seat check ώστε να ταιριάζει με το invite path: `const pendingCount = await Invite.countDocuments({ tenant: tenantId, status: 'pending' }); if (!withinSeatLimit(plan, activeCount + pendingCount)) { ... }`. (Το `Invite` model είναι ήδη imported στο route.) Reactivation ενός removed member μετράει επίσης seat, οπότε το ίδιο branch τα καλύπτει και τα δύο.
  - Response shapes (409 `{ error, code:'seat_limit', maxMembers }`, 201 `{ member }`) + η σειρά των guards + το `withinSeatLimit`/`entitlementsFor` API ΜΕΝΟΥΝ ως έχουν· αλλάζει ΜΟΝΟ το count που περνά στο `withinSeatLimit`. SaaS-only, μηδέν επίδραση στον self-hosted ή v1 mobile surface (`SAAS_MODE` off → κανένα invite ποτέ).
  - Επαλήθευση: το existing-account seat check διαβάζει `activeCount + pendingCount` (ίδιο με το `inviteUnregistered`)· `grep -n 'pendingCount' src/app/api/saas/members/route.ts` δείχνει 2 hits (invite path + existing path).
  - npm run type-check exits 0
- Status: DONE 2026-07-02 (pharos-daily-dev). Το existing-account POST branch μετράει πλέον `activeCount + pendingCount` (`Invite.countDocuments({ tenant, status:'pending' })`) όπως το invite path· `grep -n 'pendingCount' src/app/api/saas/members/route.ts` = 2 hits. Response shapes/guards/API αμετάβλητα. type-check EXIT 0, seatLimits+members tests pass, safe Docker rebuild `/login` 200 + `POST /api/saas/members` no-auth → 401 (gated, όχι 500).

### SaaS route handlers χωρίς try/catch → ασυνεπές 500 error-shape vs v1 `withAuth`
- Priority: P2
- Size: M
- Area: shared
- Files: apps/web/src/lib/apiAuth.ts (ή νέο `lib/tenancy/saasApi.ts` helper), apps/web/src/app/api/saas/account/verify/request/route.ts, apps/web/src/app/api/saas/account/verify/confirm/route.ts, apps/web/src/app/api/saas/account/reset/request/route.ts, apps/web/src/app/api/saas/account/reset/confirm/route.ts, apps/web/src/app/api/saas/account/password/route.ts, apps/web/src/app/api/saas/members/route.ts, apps/web/src/app/api/saas/invites/resend/route.ts, apps/web/src/app/api/saas/billing/checkout/route.ts, apps/web/src/app/api/saas/billing/portal/route.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα:** κάθε v1 route περνά από `withAuth` (`lib/apiAuth.ts:27`) που τυλίγει τον handler σε `try/catch` → σε thrown error γυρίζει καθαρό `apiError(msg, 500)` = `{ error }`. Τα SaaS routes ΔΕΝ έχουν αντίστοιχο wrapper: **16/16** δεν έχουν `try {` (live 2026-07-02 34η σάρωση: `for f in $(find src/app/api/saas -name route.ts); do grep -q 'try {' "$f" || echo "$f"; done` = usage, members, invites, invites/resend, billing×3, auth/{login,logout,session}, account×5 [password + reset/{request,confirm} + verify/{request,confirm}], usage/sample). Το νέο `invites/resend/route.ts` (commit `bf503cb`) εντάχθηκε στο ίδιο pattern (write path: `findOneAndUpdate` re-mint· ένα DB throw → framework 500). Στα write paths (account/verify+reset+password, members, invites/resend, billing) ένα thrown `account.save()` / `findOneAndUpdate()` / `connectDB()` / Stripe error βγαίνει ως framework-default 500 (κενό ή HTML body), ΟΧΙ ως το `{ error }` shape που περιμένει ο SaaS client — inconsistency με ολόκληρο τον v1 surface.
  - **Fix:** πρόσθεσε shared helper (mirror του `withAuth` catch, χωρίς το auth κομμάτι), π.χ. `export async function saasRoute(fn: () => Promise<NextResponse>): Promise<NextResponse>` σε `lib/apiAuth.ts` ή `lib/tenancy/saasApi.ts`: `try { return await fn(); } catch (e) { return apiError((e as Error).message?.slice(0,200) || 'Server error', 500); }`. Adoption ΜΟΝΟ στα DB-write routes της λίστας (τα read-only `usage`/`session`/`logout` σπάνια throw → μπορούν να μείνουν)· ο κάθε handler τυλίγει το body του μετά το `saasAuthGate()`/session gate (τα οποία επιστρέφουν early χωρίς throw, μένουν έξω).
  - Response shapes (validation 400/401/403/404/409, success `{ ok }`/`{ url,id }`/`{ workspace, members }`) + η σειρά των gate-ladders ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν· αλλάζει ΜΟΝΟ η συμπεριφορά σε **unexpected throw** (τώρα → καθαρό `{ error }` 500). SaaS-only, μηδέν επίδραση στον v1 mobile surface.
  - ΣΗΜ scope: αν φανεί μεγάλο, split — S πρώτα (helper + account/* 5 routes), μετά S (members + billing 3 routes).
  - Επαλήθευση: κάθε write route της λίστας έχει το thrown-path να περνά από τον helper· `grep -rn 'saasRoute\|try {' src/app/api/saas/account` δείχνει coverage στα 5 account routes.
  - npm run type-check exits 0
- Status: DOING — **slice 1/2 DONE 2026-07-02 (pharos-daily-dev)**. Νέος helper `saasGuard(fn)` στο `lib/tenancy/saasApi.ts` (mirror του `withAuth` catch: `try { return await fn(); } catch (e) { return NextResponse.json({ error: (e as Error).message?.slice(0,200) || 'Server error' }, { status: 500 }); }`) + adopted στα **6 account/* files (7 handlers)**: `account/route.ts` (GET+PATCH), `account/password`, `account/reset/{request,confirm}`, `account/verify/{request,confirm}`. Gate ladders + validation + όλες οι deliberate short-circuits αμετάβλητες· αλλάζει ΜΟΝΟ ο unexpected throw → καθαρό `{ error }` 500. Νέο `saasGuard.test.ts` (6 tests: happy pass-through, gate-404 pass-through, throw→500{error}, 200-char slice, empty→'Server error', no-extra-keys). type-check EXIT 0, 23/23 tests green, safe Docker rebuild `/login` 200 + `GET/POST /api/saas/account*` no-auth → **401 (gated, όχι 500)**, RestartCount 0. **slice 2/2 TODO** = members + invites/resend + billing×3 + auth/{login,signup} (adopt `saasGuard` στο ίδιο pattern).
- Status: **DONE 2026-07-02 (pharos-daily-dev — slice 2/2)**. Adopted `saasGuard` στα **6 εναπομείναντα write routes (8 handlers)**: `members/route.ts` (GET+POST+PATCH+DELETE), `invites/resend/route.ts` (POST), `billing/checkout` (POST), `billing/portal` (POST), `auth/login` (POST), `auth/signup` (POST). Ίδιο `return saasGuard(async () => { ...υπάρχον σώμα... })` pattern με clean re-indent· gate ladders (`resolveWorkspaceSession`/`resolveBillingSession`/`saasAuthGate`), validation (400/403/404/409), το internal 11000 try/catch του signup, τα `StripeResult` degradation paths (503/502), fire-and-forget mail, `recordAudit` — ΟΛΑ αμετάβλητα· αλλάζει ΜΟΝΟ ο unexpected throw → καθαρό `{ error }` 500. type-check EXIT 0, 15/15 tests green (saasGuard+apiAuth), safe Docker rebuild `/login` 200 (1η) + και τα 8 wrapped endpoints no-auth → **401 (gated, όχι 500)**, RestartCount 0. **Το try/catch item κλείνει πλήρως** — κάθε write saas route (account/* + members + invites/resend + billing + auth) περνά πλέον από `saasGuard`. (Τα read-only `usage`/`session`/`logout`/`audit`/`billing GET`/`invites GET`/`invites/accept`/`webhook` αφέθηκαν σκόπιμα: είτε σπάνια throw-ουν είτε έχουν δικό τους handling — δες observation rows 60/72/84/108.)

### Sparse index στα Account token-hash fields (verifyTokenHash / resetTokenHash)
- Priority: P3
- Size: S
- Area: db
- Files: apps/web/src/models/Account.ts
- Depends on: none
- Acceptance:
  - Τα confirm routes κάνουν `Account.findOne({ verifyTokenHash: ... })` (`verify/confirm/route.ts:29`) και `Account.findOne({ resetTokenHash: ... })` (`reset/confirm/route.ts:35`) σε **unindexed** πεδία (`Account.ts:24,26` — απλά `{ type: String, default: null }`, μόνο το `email` έχει `unique` index). Collection-scan σε κάθε verify/reset confirm.
  - **ΣΗΜ low-urgency:** το Account collection είναι μία εγγραφή ανά SaaS owner (μικρό) + οι confirm ops είναι σπάνιες → ελάχιστο πρακτικό κόστος σήμερα. Το flag είναι για consistency (κάθε queried field θέλει index) + future scale.
  - **Fix:** `Schema.index({ verifyTokenHash: 1 }, { sparse: true })` + `Schema.index({ resetTokenHash: 1 }, { sparse: true })` (sparse γιατί default `null` → δεν indexάρει τα κενά, ο lookup είναι πάντα με non-null hash). Μηδέν αλλαγή runtime λογικής.
  - Επαλήθευση: `grep -n 'index(' src/models/Account.ts` δείχνει τα 2 νέα sparse indexes.
  - npm run type-check exits 0
- Status: DONE (2026-07-04 46η σάρωση επιβεβαίωσε κλείσιμο· builder commit `ac35ca3` «perf(saas): sparse index Account verify/reset token hashes»· live: `AccountSchema.index({ verifyTokenHash: 1 }, { sparse: true })` γρ.37 + `resetTokenHash` sparse index γρ.38· τα confirm lookups δεν κάνουν πια collection-scan)

### Constant-time CRON_SECRET compare — saas/usage/sample route (timing side-channel)
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/saas/usage/sample/route.ts
- Depends on: none
- Acceptance:
  - Το ΝΕΟ cron endpoint (commit `f8aaea4`) συγκρίνει το bearer token με **plain string equality**: live `src/app/api/saas/usage/sample/route.ts:31` → `if (!token || token !== secret) { return ... 401 }`. Αυτό είναι non-constant-time → timing side-channel στο `CRON_SECRET` (byte-by-byte early-exit διαρρέει μήκος/prefix).
  - Το ίδιο billing subsystem έχει ΗΔΗ καθιερωμένο το σωστό pattern: `lib/billing/stripe.ts:142` → `sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)`, και `lib/auth.ts:43` → `actual.length === expected.length && timingSafeEqual(actual, expected)`. ΔΕΝ υπάρχει exported shared helper· και τα δύο κάνουν inline το length-guard + `timingSafeEqual(Buffer, Buffer)` — ακολούθησε το ΙΔΙΟ inline pattern (μηδέν νέο helper).
  - Swap: πρόσθεσε `import { timingSafeEqual } from 'node:crypto';` (top του route)· η γραμμή 401-check γίνεται: πρώτα `if (!token) return 401`, μετά compare με buffers ίσου μήκους — π.χ. `const a = Buffer.from(token); const b = Buffer.from(secret); if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });`. Το length-guard είναι απαραίτητο (`timingSafeEqual` throws σε άνισα μήκη).
  - Η σειρά gate (`saasMode()` 404 → `CRON_SECRET` unset 500 → token 401) + το `{ ok: true, ...result }` success shape + το `sampleAllTenants()` call ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν. Είναι saas-only endpoint (δεν αγγίζει τον v1 mobile surface).
  - Επαλήθευση: `grep -n 'timingSafeEqual' src/app/api/saas/usage/sample/route.ts` επιστρέφει hit· `grep -n 'token !== secret' src/app/api/saas` επιστρέφει μηδέν.
  - npm run type-check exits 0
- Status: DONE (verified 2026-07-02 auditor) — live: `usage/sample/route.ts:2` κάνει `import { timingSafeEqual } from 'node:crypto';` + local `constEq(a,b)` (γρ.14) = `a.length === b.length && timingSafeEqual(a, b)` που χρησιμοποιείται στο bearer compare. `grep 'token !== secret' src/app/api/saas` = **μηδέν**. Ο builder το έκλεισε· stale-marked TODO.

### Reset-request route — timing side-channel αποδυναμώνει το anti-enumeration
- Priority: P3
- Size: S
- Area: shared
- Files: apps/web/src/app/api/saas/account/reset/request/route.ts
- Depends on: none
- Acceptance:
  - Το route (commit `10d9656`) γυρίζει ΠΑΝΤΑ `{ ok: true }` για να μη διαρρέει ποιο email είναι registered (anti-enumeration, σωστό). Όμως το **response-time delta** το προδίδει: registered email → `findOne` + `account.save()` (DB write) + (όταν `resetDeliveryConfigured()`) **await `sendEmail()`** (Resend network round-trip)· non-registered → `findOne` και άμεσο return. Ο attacker διακρίνει registered emails μετρώντας latency, ακυρώνοντας εν μέρει το `{ ok: true }` design. Το νέο `await sendEmail` (network) διευρύνει αισθητά το gap που πριν ήταν μόνο DB-write.
  - **ΣΗΜ (γιατί flag, όχι fix):** dead-until-SaaS (gated πίσω από `saasAuthGate()`, `SAAS_MODE` off = μηδέν επίδραση στο single-user app). Η μείωση του gap είναι tradeoff, όχι μηχανικό swap: το members route κάνει ήδη fire-and-forget `void sendEmail(...)`, οπότε το reset route θα μπορούσε να το ίδιο (αφαιρεί το network-time delta + ευθυγραμμίζεται) — ΑΛΛΑ το `await` υπάρχει σκόπιμα ώστε να εξασφαλίζεται η αποστολή πριν το response· `void` σε πιθανό serverless deploy ρισκάρει να κοπεί το send. Το DB-write delta παραμένει ούτως ή άλλως. Θέλει σκόπιμη απόφαση delivery-semantics, όχι unattended fix.
  - Πιθανή κατεύθυνση (αν εγκριθεί): fire-and-forget `void sendEmail(...)` όπως το members route (ίδιο best-effort pattern), ή/και ενοποίηση των δύο branch-times ώστε registered/non-registered να έχουν παρόμοιο κόστος.
  - npm run type-check exits 0
- Status: TODO (flagged 2026-07-02 reviewer, range 12b80a1..7a0af2b· 37η σάρωση επιβεβαίωσε ανοιχτό: `reset/request/route.ts:43` no-account fast-path `return {ok:true}` πριν το mint+store+mail → μετρήσιμη timing διαφορά που αποδυναμώνει το anti-enumeration)

### Dedup ObjectId-validation regex — SaaS billing webhook (isObjectId re-introduced inline)
- Priority: P3
- Size: S
- Area: shared
- Files: apps/web/src/app/api/saas/billing/webhook/route.ts
- Depends on: none
- Acceptance:
  - Ο νέος SaaS billing webhook (commit `3c6bcc4`) **ξανα-εισήγαγε** inline ObjectId regex — το ακριβές debt που είχε κλείσει για ολόκληρο το v1 (isObjectId dedup, 4 παρτίδες). Live: `grep -rn '\[a-f0-9\]{24}' src/app/api/saas src/lib/tenancy src/lib/billing` = **1 hit** → `webhook/route.ts:81`, μέσα στο `resolveTenant`: `if (tenantId && /^[a-f0-9]{24}$/i.test(tenantId)) {`.
  - Swap **byte-identical**: το shared `isObjectId(id)` στο `@/lib/apiBody` είναι ακριβώς `/^[a-f0-9]{24}$/i.test(id)` (pure string helper, μηδέν server-only import· ήδη importable σε route files, π.χ. `items/[id]/ai-fill/route.ts` το κάνει import). Αλλαγή: νέο `import { isObjectId } from '@/lib/apiBody';` (δίπλα στα υπάρχοντα imports) + η γραμμή γίνεται `if (tenantId && isObjectId(tenantId)) {`. Μηδέν αλλαγή συμπεριφοράς.
  - Το route μένει node runtime + SaaS-gated· `Tenant.findById` / `Tenant.findOne({ billingCustomerId })` fallback, signature-verify, event-switch, response shapes ΟΛΑ αμετάβλητα. Δεν αγγίζει τον v1 mobile surface (SaaS-only endpoint).
  - Επαλήθευση: `grep -rn '\[a-f0-9\]{24}' src/app/api src/lib/tenancy src/lib/billing` επιστρέφει **μηδέν** (πλήρης εξάλειψη inline ObjectId regex σε ΟΛΟ το api + tenancy + billing).
  - npm run type-check exits 0
- Status: DONE (verified 2026-07-02 auditor) — live: `webhook/route.ts:7` κάνει `import { isObjectId } from '@/lib/apiBody';` + γρ.82 `if (tenantId && isObjectId(tenantId)) {`. `grep -rn '\[a-f0-9\]{24}' src/app/api src/lib/tenancy src/lib/billing` = **μηδέν**. Stale-marked TODO, ο builder το έκλεισε.

### apiBody helpers — readBody adoption σε saas billing checkout + portal POST
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/saas/billing/checkout/route.ts, apps/web/src/app/api/saas/billing/portal/route.ts
- Depends on: none
- Acceptance:
  - Επεκτείνει το ήδη-κλεισμένο readBody adoption effort στον saas surface. Τα saas auth routes (`signup`/`login`) είναι ΗΔΗ adopters του `readBody`· τα 2 billing routes είναι τα ΜΟΝΑ saas routes που κρατούν raw `req.json().catch` (live-verified: `grep -rln 'req.json().catch' src/app/api` = μόνο `saas/billing/checkout` + `saas/billing/portal`).
  - **ΟΧΙ byte-identical, χρειάζεται coercion** (γι' αυτό ξεχωριστό item): σήμερα `checkout/route.ts:26` = `const body = (await req.json().catch(() => ({}))) as { plan?: string; tenant?: string };` και `portal/route.ts:27` = `const body = (await req.json().catch(() => ({}))) as { tenant?: string };`. Ο `as {...}` cast «λέει ψέματα» (runtime τα values μπορεί να είναι number/object). Downstream: `resolveBillingSession(wantSlug: string | null)` (`billingSession.ts:30`) + `checkoutablePlan(plan: string | null | undefined)` (`billingRoutes.ts:23`).
  - Swap (import `{ readBody, strField }` από `@/lib/apiBody` σε καθένα· κανένα από τα 2 files δεν έχει ήδη apiBody import):
    - **checkout:** `const b = await readBody(req);` → `const resolved = await resolveBillingSession(strField(b, 'tenant') || null);` + `const plan = checkoutablePlan(strField(b, 'plan') || null);`. Το `strField(b, k)` = `String(b[k] || '')` → για string value ίδιο αποτέλεσμα, για absent → `''` → `|| null` = `null` (ίδιο με το παλιό `body.tenant ?? null` / `body.plan` undefined). `checkoutablePlan` δέχεται `string | null` → ΟΚ.
    - **portal:** `const b = await readBody(req);` → `const resolved = await resolveBillingSession(strField(b, 'tenant') || null);`.
  - `readBody` επιστρέφει `Body = Record<string, unknown>` → τα `strField(...)` δίνουν `string` → τέλος ο ψευδής cast. Το `resolveBillingSession` gate-ladder, το `pickBaseUrl`, το `StripeResult` branch (503/502), τα success shapes (`{ url, id }`) ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν. SaaS-only routes → μηδέν επίδραση στον v1 mobile surface.
  - Επαλήθευση: `grep -rln 'req.json().catch' apps/web/src/app/api` επιστρέφει **μηδέν** αρχεία (πλήρες κλείσιμο readBody adoption σε ΟΛΟ το api, v1 + saas).
  - npm run type-check exits 0
- Status: DONE (verified 2026-07-02 auditor) — live: `checkout/route.ts:5` + `portal/route.ts:5` κάνουν `import { readBody, strField } from '@/lib/apiBody';`· checkout γρ.27-33 `const body = await readBody(req);` + `strField(body,'tenant')` + `checkoutablePlan(strField(body,'plan'))`· portal γρ.28-30 ίδιο pattern. Stale-marked TODO, ο builder το έκλεισε.

### apiBody helpers — readBody adoption σε saas/members POST + PATCH + DELETE
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/saas/members/route.ts
- Depends on: none
- Acceptance:
  - Ο ΝΕΟΣ workspace-members route (commit `090cd41`) ξανα-εισήγαγε raw `(await req.json().catch(() => ({}))) as {...}` σε **3** methods: `POST` (`{ email?; role?; tenant? }`, γρ.90), `PATCH` (`{ accountId?; role?; tenant? }`, γρ.171), `DELETE` (`{ accountId?; tenant? }`, γρ.217). Ίδιο consistency debt με το ήδη ανοιχτό checkout+portal item — ο `as {...}` cast «λέει ψέματα» (runtime τα values μπορεί να μην είναι string).
  - Swap (import `{ readBody, strField }` από `@/lib/apiBody` — το file δεν έχει ήδη apiBody import): σε καθεμία method `const b = await readBody(req);` και μετά διάβασε τα πεδία με `strField(b, 'email')` / `strField(b, 'accountId')` / `strField(b, 'tenant')` / `strField(b, 'role')`. Το `strField(b,k)` = `String(b[k] || '')` → για string ίδιο, για absent → `''`. Πρόσεξε τα downstream: `resolveWorkspaceSession(wantSlug: string | null)` θέλει `strField(b,'tenant') || null`· `parseRole(x: unknown)` δέχεται ήδη `unknown` άρα μπορείς να του δώσεις `strField(b,'role')` (ή `b.role`)· το `role == null ? 'member' : parseRole(...)` του POST πρέπει να διατηρήσει το «absent → default member» (π.χ. `const rawRole = strField(b,'role'); const role = rawRole === '' ? 'member' : parseRole(rawRole);`).
  - Τα gate-ladders (`resolveWorkspaceSession` 404/401/403), οι έλεγχοι `looksLikeEmail`/`canAssignRole`/`wouldOrphanOwners`, τα status codes (400/403/404/409/201) και τα success shapes ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν. SaaS-only route → μηδέν επίδραση στον v1 mobile surface.
  - Επαλήθευση: `grep -rln 'req.json().catch' apps/web/src/app/api/saas/members` επιστρέφει **μηδέν**.
  - npm run type-check exits 0
- Status: DONE (verified 2026-07-02 auditor) — live: `members/route.ts:14` κάνει `import { readBody, strField } from '@/lib/apiBody';`· και τα 3 methods (POST γρ.93, PATCH γρ.192, DELETE γρ.234) `const body = await readBody(req);` + `strField(body,'tenant'|'email'|'accountId'|'role')`. `grep 'req.json().catch' members` = **μηδέν**. Stale-marked TODO, ο builder το έκλεισε.

### apiBody helpers — readBody adoption σε shopping-list POST (τελευταίο raw-body route)
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/shopping-list/route.ts
- Depends on: none
- Acceptance:
  - **Κλείνει** το apiBody adoption effort: το `shopping-list/route.ts` POST είναι το **ΜΟΝΟ** εναπομείναν v1 route με raw `req.json().catch` (live-verified: `grep -rln 'req.json().catch' apps/web/src/app/api/v1` = μόνο αυτό το file). `readBody` adopters = **28**.
  - **ΟΧΙ byte-identical, χρειάζεται coercion** (γι' αυτό ξεχωριστό item): σήμερα η γραμμή είναι `const b = (await req.json().catch(() => ({}))) as Record<string, string>;` και περνά `b.name`/`b.quantity`/`b.category`/`b.brand`/`b.note` **κατευθείαν** στο `addListItem({ name: b.name, ... })`. Το `NewItem` έχει string πεδία, οπότε ο τρέχων cast «λέει ψέματα» (runtime τα values μπορεί να είναι number/object).
  - Swap: `const b = await readBody(req);` (import `{ readBody, strField }` από `@/lib/apiBody`) + πέρασε `{ name: strField(b, 'name'), quantity: strField(b, 'quantity'), category: strField(b, 'category'), brand: strField(b, 'brand'), note: strField(b, 'note') }`. Το `strField(b, k)` = `String(b[k] || '')` → downstream το `addListItem` ήδη κάνει `(data.x || '').trim()` → **ίδιο αποτέλεσμα για strings**, και ΕΠΙΠΛΕΟΝ αποτρέπει latent crash: με μη-string value (π.χ. `quantity: 5`) ο παλιός κώδικας θα έφτανε στο `(5 || '').trim()` → `TypeError: .trim is not a function`· το `strField` το κάνει `'5'` πρώτα.
  - `readBody` επιστρέφει `Body = Record<string, unknown>` → τα `strField(...)` δίνουν `string` → ταιριάζουν με `NewItem` (τέλος ο ψευδής `Record<string,string>` cast). Το `withAuth` wrapper, ο `if (!r.ok) return apiError(...)` κλάδος, το `{ ok: true, items }` + status 201 response shape ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν → μηδέν κίνδυνος για τον mobile consumer.
  - Επαλήθευση: `grep -rln 'req.json().catch' apps/web/src/app/api/v1` επιστρέφει **μηδέν** αρχεία (πλήρες κλείσιμο του readBody adoption).
  - npm run type-check exits 0
- Status: DONE (2026-07-02, commit `6fd1075`) — live-verified 27η σάρωση: `shopping-list/route.ts:17-18` κάνει πλέον `const b = await readBody(req);` + `strField(b, 'name'|'quantity'|'category'|'brand'|'note')` (import `{ readBody, strField }`). `grep -rn 'req.json().catch' src/app/api` = **μηδέν** σε ΟΛΟ το api· `readBody` adopters v1 = **29**. Το apiBody/readBody adoption effort **ΕΚΛΕΙΣΕ πλήρως**. Τα 2 εναπομείναντα raw `req.json()` (auth/login boundary, items/[id]/ai-fill) είναι σωστά try/catch-wrapped + safe-cast → όχι debt. tsc EXIT 0.

### apiBody helpers — readBody adoption σε scan/expense + scan/voucher POST
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/scan/expense/route.ts, apps/web/src/app/api/v1/scan/voucher/route.ts
- Depends on: none
- Acceptance:
  - Συνέχεια (και σχεδόν κλείσιμο) του apiBody adoption. Απομένουν μόλις **3** raw-body routes με `req.json().catch` (scan/expense, scan/voucher, shopping-list POST)· `readBody` adopters = **26**. Το shared `readBody` ζει στο `lib/apiBody.ts` (επιστρέφει `Body` = `Record<string, unknown>`, δεν πετάει· bad/empty JSON → `{}`).
  - Και τα δύο routes έχουν **πανομοιότυπο** inline pattern μέσα σε ternary (JSON branch):
    `String(((await req.json().catch(() => ({}))) as { text?: unknown }).text || '')`
    → `String((await readBody(req)).text || '')`. Το `readBody(req)` επιστρέφει ήδη `Record<string, unknown>` → `.text` είναι `unknown` → `String(unknown || '')` δουλεύει· byte-behavior-identical (το `readBody` τυλίγει το ίδιο `req.json().catch(() => ({}))`, ίδιο no-throw semantics).
  - Imports: κανένα από τα 2 files δεν έχει ήδη `@/lib/apiBody` import → σε καθένα νέο `import { readBody } from '@/lib/apiBody';` (δίπλα στο `import { withAuth, apiError } from '@/lib/apiAuth';`). Το multipart branch (`scanExpenseImage`/`scanVoucherImage(await req.formData())`) ΜΕΝΕΙ ΑΚΡΙΒΩΣ ως έχει — μόνο το JSON-text branch αλλάζει.
  - Το `apiError(r.error, 400)` + το `{ data }` response shape + η σειρά content-type ternary ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν. Καμία αλλαγή σε behaviour → μηδέν κίνδυνος για τον mobile consumer.
  - **Εκτός scope (needs care, όχι εδώ):** `shopping-list/route.ts` POST κάνει `as Record<string, string>` και περνά `b.name`/`b.quantity`/... κατευθείαν ως strings στο `addListItem` (`NewItem = { name: string; ... }`). Το `readBody` επιστρέφει `unknown` values → θα χρειαστεί coercion (`String(b.name ?? '')` κ.λπ.), ΟΧΙ byte-identical → ξεχωριστό item σε επόμενο run.
  - Επαλήθευση: `grep -rln 'req.json().catch' apps/web/src/app/api/v1` επιστρέφει πλέον μόνο `shopping-list/route.ts`· `readBody` adopters 26 → 28.
  - npm run type-check exits 0
- Status: DONE (2026-07-01, commits `4503640` + `875264b`) — live-verified 26η σάρωση: `scan/expense/route.ts:20` + `scan/voucher/route.ts:18` κάνουν πλέον `String((await readBody(req)).text || '')` (import `{ readBody }`). Απομένει **μόνο** το `shopping-list` POST με raw `req.json().catch` (νέο top item παραπάνω). tsc EXIT 0.

### Dedup ObjectId-validation regex — 4η (τελευταία) παρτίδα (7 route files)
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/receipts/[id]/rescan/route.ts, apps/web/src/app/api/v1/receipts/[id]/add-to-library/route.ts, apps/web/src/app/api/v1/items/[id]/link-plan/route.ts, apps/web/src/app/api/v1/items/[id]/plans/route.ts, apps/web/src/app/api/v1/items/[id]/convert-to-task/route.ts, apps/web/src/app/api/v1/items/[id]/ai-fill/route.ts, apps/web/src/app/api/v1/items/[id]/price/route.ts
- Depends on: none
- Acceptance:
  - **Κλείνει** το `isObjectId()` dedup effort (1η παρτίδα items/[id]+shopping-list/[id]· 2η receipts/expenses/subscriptions/tasks/vouchers [id]· 3η cards/[id]+stores/[id]+statements/[id]+notifications+trash/[type]/[id]). Το shared `export function isObjectId(id: string): boolean` ζει ΗΔΗ στο `lib/apiBody.ts` (byte-identical `/^[a-f0-9]{24}$/i.test(id)`).
  - Σε καθένα από τα 7 route files: αντικατέστησε τον inline `!/^[a-f0-9]{24}$/i.test(id)` με `!isObjectId(id)`. Occurrences (8 συνολικά, όλα `apiError('bad id')` + status 400): receipts/[id]/rescan **1** (γρ.21), receipts/[id]/add-to-library **1** (γρ.15), items/[id]/link-plan **2** (γρ.14,28), items/[id]/plans **1** (γρ.19), items/[id]/convert-to-task **1** (γρ.14), items/[id]/ai-fill **1** (γρ.18), items/[id]/price **1** (γρ.13).
  - Imports: **κανένα** από τα 7 files δεν έχει ήδη `@/lib/apiBody` import → σε καθένα νέο `import { isObjectId } from '@/lib/apiBody';` (δίπλα στα υπόλοιπα lib imports).
  - Το μήνυμα σφάλματος, ο status 400, και η σειρά auth-πριν-id ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν. Καμία αλλαγή σε behaviour / response shape → μηδέν κίνδυνος για τον mobile consumer.
  - Επαλήθευση: `grep -rl '\[a-f0-9\]{24}' apps/web/src/app/api/v1` επιστρέφει **μηδέν** αρχεία (πλήρης εξάλειψη του inline regex από όλο το v1)· `isObjectId` adopters 12 → 19.
  - npm run type-check exits 0
- Status: DONE (2026-07-01, commit `f17f279`) — και τα 7 deep sub-routes migrated· live-verified στην 24η σάρωση: `grep -rln '\[a-f0-9\]{24}' src/app/api/v1` = **NONE** (πλήρης εξάλειψη), `isObjectId` adopters = **19**. Το `isObjectId()` dedup effort **ΕΚΛΕΙΣΕ** (1η→4η παρτίδα ολοκληρωμένη). tsc EXIT 0.

### apiBody helpers — readBody adoption σε settings + stores/[id] PATCH
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/settings/route.ts, apps/web/src/app/api/v1/stores/[id]/route.ts
- Depends on: none
- Acceptance:
  - Συνέχεια του apiBody adoption (16 routes ήδη adopters `readBody`). Το shared `readBody` ζει στο `lib/apiBody.ts`, επιστρέφει `Body` = `Record<string, unknown>` (δεν πετάει· bad/empty JSON → `{}`).
  - **settings PATCH** (γρ.72): `const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;` → `const b = await readBody(req);`. Το settings δεν έχει ακόμα apiBody import → νέο `import { readBody } from '@/lib/apiBody';`. ΟΛΑ τα typeof-based guards (currency/defaultVatRate/defaultItemView/warranty/ntfy/budgets κ.λπ.) ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν.
  - **stores/[id] PATCH** (γρ.25): ίδια αλλαγή στη γραμμή body-parse. Το stores/[id] έχει ΗΔΗ `import { isObjectId } from '@/lib/apiBody'` → γίνεται `import { isObjectId, readBody } from '@/lib/apiBody'`. Τα partial-update guards (name/aliases/... ) αμετάβλητα.
  - Μόνο η γραμμή body-parse αλλάζει (το inline `as Record<string, unknown>` cast αφαιρείται, ίδιος τύπος `Body`)· καμία αλλαγή σε validation behaviour / response shape.
  - Απομένουν ~11 raw routes με το ίδιο pattern (receipts/[id], receipts/[id]/rescan, scan/expense, scan/voucher, push/register, shopping-list POST, ai, ai/subscription, items/[id]/link-plan, items/[id]/price, items/import) για μελλοντικά runs (1-2/run).
  - npm run type-check exits 0
- Status: DONE (2026-07-01, 25η σάρωση) — live-verified: `settings/route.ts:73` + `stores/[id]/route.ts:25` κάνουν πλέον `const b = await readBody(req);` (imports `{ readBody }` / `{ isObjectId, readBody }`). Ο builder το κατανάλωσε μαζί με πολλά άλλα readBody swaps· `req.json().catch` απομένει μόνο σε 3 routes.

### apiBody helpers — readBody adoption σε receipts/[id] + receipts/[id]/rescan PATCH
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/receipts/[id]/route.ts, apps/web/src/app/api/v1/receipts/[id]/rescan/route.ts
- Depends on: none
- Acceptance:
  - Συνέχεια του apiBody adoption (16 routes ήδη adopters `readBody`). Το shared `readBody` ζει στο `lib/apiBody.ts`, επιστρέφει `Body` = `Record<string, unknown>` (δεν πετάει· bad/empty JSON → `{}`).
  - **receipts/[id] PATCH** (γρ.36): `const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;` → `const b = await readBody(req);`. Το file έχει ΗΔΗ `import { isObjectId } from '@/lib/apiBody'` (γρ.3) → γίνεται `import { isObjectId, readBody } from '@/lib/apiBody'`.
  - **receipts/[id]/rescan PATCH** (γρ.23): ίδια αλλαγή στη γραμμή body-parse· έχει ΗΔΗ `import { isObjectId } from '@/lib/apiBody'` (γρ.3) → `import { isObjectId, readBody } from '@/lib/apiBody'`.
  - Μόνο η γραμμή body-parse αλλάζει (το inline `as Record<string, unknown>` cast αφαιρείται, ίδιος τύπος `Body`)· ΟΛΑ τα partial-update field guards + response shapes ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν· καμία αλλαγή σε behaviour → μηδέν κίνδυνος για τον mobile consumer.
  - Απομένουν ~9 raw routes με το ίδιο pattern (scan/expense, scan/voucher, push/register, shopping-list POST, ai, ai/subscription, items/[id]/link-plan, items/[id]/price, items/import) για μελλοντικά runs (1-2/run).
  - npm run type-check exits 0
- Status: DONE (2026-07-01, 25η σάρωση) — live-verified: `receipts/[id]/route.ts:36` + `receipts/[id]/rescan/route.ts:23` κάνουν πλέον `const b = await readBody(req);` (imports `{ isObjectId, readBody }`). Adopters `readBody` = **26**· `req.json().catch` απομένει μόνο σε 3 routes (scan/expense, scan/voucher, shopping-list POST).

### Dedup ObjectId-validation regex — 3η παρτίδα (5 route files)
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/cards/[id]/route.ts, apps/web/src/app/api/v1/stores/[id]/route.ts, apps/web/src/app/api/v1/statements/[id]/route.ts, apps/web/src/app/api/v1/notifications/route.ts, apps/web/src/app/api/v1/trash/[type]/[id]/route.ts
- Depends on: none
- Acceptance:
  - Συνέχεια του ήδη-DONE `isObjectId()` dedup (1η παρτίδα items/[id]+shopping-list/[id]· 2η παρτίδα receipts/expenses/subscriptions/tasks/vouchers [id]). Το shared `export function isObjectId(id: string): boolean` ζει ΗΔΗ στο `lib/apiBody.ts` (byte-identical `/^[a-f0-9]{24}$/i.test(id)`).
  - Σε καθένα από τα 5 route files: αντικατέστησε τον inline έλεγχο `!/^[a-f0-9]{24}$/i.test(...)` με `!isObjectId(...)`. Occurrences: cards/[id] **2** (γρ.16,31), stores/[id] **2** (γρ.23,49), statements/[id] **1** (γρ.36), trash/[type]/[id] **2** (γρ.16,28), notifications **1** (γρ.22, ελέγχει `b.id` από body).
  - Imports: `cards/[id]` + `notifications` έχουν ΗΔΗ `import { readBody } from '@/lib/apiBody'` → γίνεται `import { isObjectId, readBody } from '@/lib/apiBody'`. `stores/[id]`, `statements/[id]`, `trash/[type]/[id]` ΔΕΝ έχουν apiBody import → νέο `import { isObjectId } from '@/lib/apiBody'`.
  - Το μήνυμα σφάλματος (`apiError('bad id')`) + status 400 + η σειρά auth-πριν-id ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν. Καμία αλλαγή σε behaviour / response shape.
  - Επαλήθευση: `grep -rl '\[a-f0-9\]{24}' apps/web/src/app/api/v1` δεν περιλαμβάνει πλέον κανένα από τα 5 files· `isObjectId` adopters 7 → 12.
  - Απομένουν ~7 route files με inline regex (items/[id]/ai-fill+convert-to-task+link-plan+plans+price, receipts/[id]/add-to-library+rescan) για 4η παρτίδα σε μελλοντικά runs.
  - npm run type-check exits 0
- Status: DONE (2026-07-01, commit pending· 5 files migrated, `isObjectId` adopters 7→12· grep `\[a-f0-9\]{24}` πλέον μόνο 7 deep sub-routes· tsc EXIT 0· Docker /login 200, RestartCount 0, cards/trash no-token 401)

### Dedup ObjectId-validation regex — 2η παρτίδα (5 route files)
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/receipts/[id]/route.ts, apps/web/src/app/api/v1/expenses/[id]/route.ts, apps/web/src/app/api/v1/subscriptions/[id]/route.ts, apps/web/src/app/api/v1/tasks/[id]/route.ts, apps/web/src/app/api/v1/vouchers/[id]/route.ts
- Depends on: none
- Acceptance:
  - Συνέχεια του ήδη-DONE `isObjectId()` dedup (1η παρτίδα: items/[id] + shopping-list/[id]). Το shared `export function isObjectId(id: string): boolean` ζει ΗΔΗ στο `lib/apiBody.ts` (byte-identical `/^[a-f0-9]{24}$/i.test(id)`).
  - Σε καθένα από τα 5 route files: αντικατέστησε τον inline έλεγχο `/^[a-f0-9]{24}$/i.test(id)` (ή τυχόν local `ID_RE`/`OBJECT_ID_RE` const) με `isObjectId(id)`, προσθέτοντας το `isObjectId` στο υπάρχον import από `@/lib/apiBody` (ή νέο import αν δεν υπάρχει). Σβήσε το local regex const αν μένει αχρησιμοποίητο.
  - Το μήνυμα σφάλματος (`apiError('bad id')`) + status 400 + η σειρά auth-πριν-id ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν. Καμία αλλαγή σε behaviour / response shape.
  - Επαλήθευση: `grep -rl '/\^\[a-f0-9\]{24}\$/i' apps/web/src/app/api/v1` δεν περιλαμβάνει πλέον κανένα από τα 5 files· `isObjectId` adopters 2 → 7.
  - Απομένουν ~12 route files με inline regex (cards/[id], stores/[id], statements/[id], trash/[type]/[id], notifications, receipts/[id]/rescan+add-to-library, items/[id]/link-plan+plans+convert-to-task+ai-fill+price) για 3η-4η παρτίδα σε μελλοντικά runs.
  - npm run type-check exits 0
- Status: DONE (2026-07-01) — και τα 5 route files migrated: `!/^[a-f0-9]{24}$/i.test(id)` → `!isObjectId(id)` (10 occurrences, 2/file). expenses/subscriptions/tasks/vouchers είχαν ήδη `import { readBody }` → έγινε `import { isObjectId, readBody }`· receipts πήρε νέο `import { isObjectId } from '@/lib/apiBody'`. Μήνυμα `apiError('bad id')` + auth-πριν-id αμετάβλητα. tsc EXIT 0· safe rebuild → /login 200, web RestartCount 0, OOM false, GET receipts/[id] + PATCH vouchers/[id] no-token → 401. `isObjectId` adopters 2 → 7· απομένουν ~12 route files για 3η παρτίδα.

### apiBody helpers — readBody adoption σε notifications + lists PATCH
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/notifications/route.ts, apps/web/src/app/api/v1/lists/route.ts
- Depends on: none
- Acceptance:
  - Συνέχεια του apiBody adoption (12 routes ήδη adopters). Το shared `readBody` ζει στο `lib/apiBody.ts` και επιστρέφει `Body` = `Record<string, unknown>` (δεν πετάει· bad/empty JSON → `{}`).
  - **notifications PATCH** (γραμμή ~19): `const b = (await req.json().catch(() => ({}))) as { id?: unknown };` → `const b = await readBody(req);` (import `{ readBody }` από `@/lib/apiBody`). Ο έλεγχος `typeof b.id === 'string' && b.id` + το 24-hex guard ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν (το `b.id` γίνεται `unknown`, τα υπάρχοντα guards το καλύπτουν).
  - **lists PATCH** (γραμμή ~19): `const b = (await req.json().catch(() => ({}))) as { key?: unknown; values?: unknown };` → `const b = await readBody(req);`. Τα `typeof b.key === 'string'` + `Array.isArray(b.values)` guards αμετάβλητα.
  - Μόνο η γραμμή body-parse αλλάζει (το inline cast αφαιρείται)· καμία αλλαγή σε validation behaviour / response shape (`{ ok:true }` και στα δύο). Το `apiError`/`markNotificationRead`/`saveList` flow αμετάβλητο.
  - Απομένουν ~15 routes με το ίδιο raw pattern για μελλοντικά runs (τεκμηρίωση στο PROGRESS).
  - npm run type-check exits 0
- Status: DONE (2026-07-01, commit `0c866eb`) — notifications PATCH + lists PATCH: η γραμμή body-parse `const b = (await req.json().catch(() => ({}))) as {...};` → `const b = await readBody(req);` (import `{ readBody }` από `@/lib/apiBody`, cast αφαιρέθηκε). Guards (notifications `typeof b.id === 'string' && b.id` + 24-hex· lists `typeof b.key === 'string'` + `Array.isArray(b.values)`) + response `{ ok:true }` αμετάβλητα. Επαληθεύτηκε στην 18η σάρωση: αμφότερα τα route files κάνουν πλέον import `readBody`. Adopters `readBody` **14**. tsc EXIT 0.

### apiBody helpers — readBody adoption σε items/[id] + shopping-list/[id] PATCH
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/items/[id]/route.ts, apps/web/src/app/api/v1/shopping-list/[id]/route.ts
- Depends on: none
- Acceptance:
  - Συνέχεια του apiBody adoption (14 routes ήδη adopters `readBody`). Το shared `readBody` ζει στο `lib/apiBody.ts`, επιστρέφει `Body` = `Record<string, unknown>` (δεν πετάει· bad/empty JSON → `{}`).
  - **items/[id] PATCH**: η μοναδική γραμμή `const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;` → `const b = await readBody(req);` (import `{ readBody }` από `@/lib/apiBody`). Το inline cast αφαιρείται (ίδιος τύπος `Body`).
  - **shopping-list/[id] PATCH**: ίδια αλλαγή στη γραμμή body-parse.
  - **PATCH σημείωση:** τα partial-update guards (`if (typeof b.x === 'string')` κ.λπ. — πρέπει να ξεχωρίζουν «πεδίο απόν» από «κενό») ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν· τα `strField`/`enumField` (με fallback) ΔΕΝ ταιριάζουν σε partial PATCH, δεν εφαρμόζονται. Το υπάρχον `ID_RE` guard στο shopping-list/[id] αμετάβλητο.
  - Καμία αλλαγή σε validation behaviour / response shape (`{item}` / `{ok:true}` αμετάβλητα) → μηδέν κίνδυνος για τον mobile consumer.
  - Απομένουν ~13 raw routes με το ίδιο pattern (ai, ai/subscription, items/[id]/link-plan, items/[id]/price, items/import, push/register, receipts/[id], receipts/[id]/rescan, scan/expense, scan/voucher, settings, stores/[id], shopping-list POST) για μελλοντικά runs (1-2/run).
  - npm run type-check exits 0
- Status: DONE (2026-07-01) — items/[id] PATCH + shopping-list/[id] PATCH: η γραμμή body-parse `const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;` → `const b = await readBody(req);` (import `{ isObjectId, readBody }` από `@/lib/apiBody`, inline cast αφαιρέθηκε). Τα partial-update guards (`typeof b.x === 'string'`, `Array.isArray(b.tags)`, `'targetPrice' in b`, `typeof b.checked === 'boolean'`) αμετάβλητα· response `{item}`/`{ok:true}` ίδια. tsc EXIT 0· safe rebuild → /login 200, web restarts 0, PATCH items/[id]+shopping-list/[id] no-token → 401. Adopters `readBody` **16**.

### Dedup ObjectId-validation regex σε shared guard
- Priority: P3
- Size: S
- Area: shared
- Files: apps/web/src/lib/apiBody.ts (ή apiAuth.ts) + καταναλωτές (ξεκίνα με shopping-list/[id], items/[id], items/[id]/price, items/[id]/link-plan)
- Depends on: none
- Acceptance:
  - Το literal `/^[a-f0-9]{24}$/i` επαναλαμβάνεται inline σε **19 route files (30 occurrences)**· ένα μόνο route (`shopping-list/[id]`) έχει ήδη local `ID_RE` const. Πρόσθεσε ΕΝΑ shared helper, π.χ. `export const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;` + `export function isObjectId(id: unknown): id is string { return typeof id === 'string' && OBJECT_ID_RE.test(id); }` στο `lib/apiBody.ts`.
  - Migrate **3-5 routes ανά run** (μη-sprawling): αντικατέστησε `/^[a-f0-9]{24}$/i.test(id)` → `isObjectId(id)` και σβήσε το local `ID_RE` const στο shopping-list/[id]. Το μήνυμα `apiError('bad id')` και ο status 400 ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ίδια.
  - Behavior-identical (ίδιο regex, ίδιο case-insensitive flag)· καμία αλλαγή σε response/validation. Καθαρά dedup.
  - Μην αλλάξεις το auth flow· η μετακίνηση αφορά ΜΟΝΟ το id-shape guard. Split σε πολλαπλά S runs αν χρειαστεί (μην αγγίξεις 19 files σε ένα commit).
  - npm run type-check exits 0
- Status: DONE (2026-07-01) — πρόσθεσα `OBJECT_ID_RE` const + `export function isObjectId(id: string): boolean` στο `lib/apiBody.ts` (byte-identical `/^[a-f0-9]{24}$/i.test(id)`· param `string` αντί type-guard `id is string` αφού όλοι οι consumers περνάνε ήδη string από τα route params). 1η παρτίδα migrated: **items/[id]** (3 guards: GET/PATCH/DELETE) + **shopping-list/[id]** (2 guards + διαγράφηκε το local `ID_RE` const). Μήνυμα `apiError('bad id')` + status 400 αμετάβλητα. tsc EXIT 0· safe rebuild → /login 200, web restarts 0. Απομένουν ~17 route files με inline regex (items/[id]/price+link-plan+ai-fill+convert-to-task, receipts/[id]+rescan, expenses/[id], subscriptions/[id], tasks/[id], vouchers/[id], stores/[id], notifications, trash/[id], κ.λπ.) για 3-5/run συνέχεια.

### apiBody helpers — readBody adoption σε expenses/[id] + subscriptions/[id] PATCH
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/expenses/[id]/route.ts, apps/web/src/app/api/v1/subscriptions/[id]/route.ts
- Depends on: none
- Acceptance:
  - Συνέχεια του apiBody adoption (6 routes ήδη adopters: expenses/subscriptions/vouchers/items/tasks/stores POST). Τα shared helpers ζουν στο `lib/apiBody.ts` (`readBody`/`strField`/`numField`/`enumField`/`boolField`).
  - **PATCH σημείωση:** τα `[id]` PATCH handlers χτίζουν partial `set` object με `if (typeof b.x === 'string')` guards (πρέπει να ξεχωρίζουν «πεδίο απόν» από «κενό») → οι `strField`/`enumField` (που έχουν fallback) ΔΕΝ ταιριάζουν στα partial guards. Το item αφορά ΜΟΝΟ την γραμμή body-parse.
  - **expenses/[id] PATCH** (γραμμή 15) + **subscriptions/[id] PATCH**: `const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;` → `const b = await readBody(req);` (import `{ readBody }` από `@/lib/apiBody`). Το `readBody` επιστρέφει ήδη `Record<string, unknown>` (τύπος `Body`) → το `as Record<string, unknown>` cast αφαιρείται, μηδέν αλλαγή σε τύπο.
  - Τα partial-update field guards (vendor/amount/category/kind/... σε expenses· name/amount/cycle/... σε subscriptions) ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν — καμία αλλαγή σε validation behaviour / response shape (ίδιο `{ ok:true, id }`).
  - Απομένουν ~21 routes με το ίδιο raw pattern για μελλοντικά runs (τεκμηρίωση στο PROGRESS).
  - npm run type-check exits 0
- Status: DONE (2026-07-01) — expenses/[id] PATCH + subscriptions/[id] PATCH: η γραμμή `const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;` → `const b = await readBody(req);` (import `{ readBody }` από `@/lib/apiBody`, ο τύπος επιστροφής `Body` = `Record<string, unknown>` → το cast αφαιρέθηκε, μηδέν αλλαγή τύπου). ΟΛΑ τα partial-update field guards (vendor/amount/category/kind/notes/date/period/recurring/recurringCycle/paymentMethod σε expenses· name/amount/billingCycle/category/active/nextRenewal σε subscriptions) αμετάβλητα· ίδιο response `{ ok:true, id }`. tsc EXIT 0· safe rebuild → /login 200, web restarts 0, PATCH expenses/subscriptions no-token → 401 (auth boundary intact). Adopters πλέον 8 (6 POST + 2 [id]-PATCH). **Ουρά Web Debt: 0 ενεργά items — όλα DONE.**

### apiBody helpers — adoption σε tasks + stores POST
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/tasks/route.ts, apps/web/src/app/api/v1/stores/route.ts
- Depends on: none
- Acceptance:
  - Συνέχεια του apiBody adoption (4 routes ήδη adopters: expenses/subscriptions/vouchers/items POST). Τα shared helpers ζουν στο `lib/apiBody.ts` (`readBody`/`strField`/`numField`/`enumField`/`boolField`).
  - **tasks POST** (`tasks/route.ts:47`): `const b = await readBody(req)`· `title` → `strField(b,'title','',true)`· `status` → `enumField(b,'status',['todo','in-progress','done','blocked'],'todo')`· `priority` → `enumField(b,'priority',['low','normal','high'],'normal')`· `content` → `strField(b,'content','')`. Τα `tags` (array/csv split) + `dueDate` (Date) ΜΕΝΟΥΝ ως έχουν (δεν υπάρχει helper για arrays/dates).
  - **stores POST** (`stores/route.ts:31`): `const b = await readBody(req)`· `name` → `strField(b,'name','',true)` (+ `if (!name) return apiError('name required')` αμετάβλητο)· `url` → `strField(b,'url','')`. Το `aliases` (custom `cleanAliases`) ΜΕΝΕΙ ως έχει.
  - Μηδέν αλλαγή σε validation behaviour / response shape (ίδια trimmed/required/fallback/enum semantics, 1:1 με τους helpers)· ίδιο 201 `{task}`/`{store}`.
  - Απομένουν ~23 routes με το ίδιο raw pattern για μελλοντικά runs (τεκμηρίωση στο PROGRESS).
  - npm run type-check exits 0
- Status: DONE (2026-07-01) — tasks POST: `readBody(req)` + `strField(b,'title','',true)` + `enumField(b,'status',TASK_STATUSES,'todo')` + `enumField(b,'priority',TASK_PRIORITIES,'normal')` + `strField(b,'content','')` (νέες const `TASK_STATUSES`/`TASK_PRIORITIES`)· tags/dueDate/completedAt αμετάβλητα. stores POST: `readBody(req)` + `strField(b,'name','',true)` + `strField(b,'url','',true)` (κράτησα `trim=true` για να διατηρηθεί ΑΚΡΙΒΩΣ το παλιό `b.url.trim()`, αντί για το χαλαρότερο `strField(b,'url','')` της περιγραφής)· aliases/`cleanAliases` αμετάβλητο. Response shapes `{task}`/`{store}` 201 αμετάβλητα. ΣΗΜ αμελητέα διαφορά semantics (ίδια με vouchers/items): name/url πλέον coerce-άρουν non-string input via `String()` (πριν: `typeof==='string'` αλλιώς ''), για κανονικό string input ταυτόσημα. tsc EXIT 0· safe rebuild → /login 200, web restarts 0, POST tasks/stores no-token → 401 (auth boundary intact). Adopters πλέον 6 (expenses/subscriptions/vouchers/items/tasks/stores). **Ουρά Web Debt: 0 ενεργά items — όλα DONE.**

### apiBody helpers — adoption σε vouchers + items POST
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/vouchers/route.ts, apps/web/src/app/api/v1/items/route.ts
- Depends on: none
- Acceptance:
  - Υπάρχει ήδη το shared `lib/apiBody.ts` (`readBody`/`strField`/`numField`/`enumField`/`boolField`) και το χρησιμοποιούν 2 routes (expenses + subscriptions POST). Άλλα ~27 handlers επαναλαμβάνουν ακόμα το raw pattern (`(await req.json().catch(() => ({}))) as Record<string, unknown>` + `String(b.x || '').trim()`).
  - Refactor 2 ΑΚΟΜΑ routes ως συνέχεια (μη-sprawling): **vouchers POST** (6× `String(b.x || '').trim()` → `readBody` + `strField(b, key, '', true)`· το `expiresAt` μένει ως έχει, δεν έχει helper για date) + **items POST** (`title` → `strField(b,'title','',true)`, `category` → `strField(b,'category','other')`, `currentPrice` → `numField(b,'currentPrice') ?? 0`· το status-whitelist μπορεί να γίνει `enumField(b,'status',ITEM_STATUSES,'researching')`).
  - Μηδέν αλλαγή σε validation behaviour / response shape (ίδια trimmed/required/fallback semantics, verified 1:1 με τους helpers).
  - Απομένουν ~25 routes με το ίδιο pattern για μελλοντικά runs (τεκμηρίωση στο PROGRESS).
  - npm run type-check exits 0
- Status: DONE (2026-07-01) — vouchers POST: `readBody(req)` + 6× `strField(b, key, '', true)` (title/code/store/discount/url/notes· `expiresAt` αμετάβλητο). items POST: `readBody` + `strField(b,'title','',true)` + `enumField(b,'status',ITEM_STATUSES,'researching')` + `strField(b,'category','other')` + `numField(b,'currentPrice') ?? 0`. Response shapes αμετάβλητα. ΣΗΜ μία αμελητέα διαφορά semantics: το items `currentPrice` πλέον parse-άρει και numeric string (π.χ. "5"→5), ίδια συμπεριφορά με το `amount` σε subscriptions/expenses (πριν: μόνο number type, αλλιώς 0). tsc EXIT 0· safe rebuild → /login 200, web restarts 0, POST no-token → 401 (auth boundary intact). Adopters πλέον 4 (expenses/subscriptions/vouchers/items). **Ουρά Web Debt: 0 ενεργά items — όλα DONE.**

### POST /api/v1/ai — cap μήκους ιστορικού messages
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/ai/route.ts
- Depends on: none
- Acceptance:
  - Το `POST /api/v1/ai` δέχεται `messages: ChatTurn[]` χωρίς άνω όριο μήκους → ο authenticated χρήστης μπορεί (κατά λάθος, π.χ. app bug που δεν trim-άρει το local chat) να στείλει τεράστιο history, που ταξιδεύει ΟΛΟΚΛΗΡΟ στην Anthropic κλήση (κόστος tokens ανά turn). Κάθε άλλο list input στο API είναι bounded (limit 1..200)· μόνο αυτό όχι.
  - Μετά το φιλτράρισμα σε valid turns, κρατιούνται ΜΟΝΟ τα τελευταία N (π.χ. `messages.slice(-20)`) πριν το `runAiCommand`. Επιλογή N τεκμηριωμένη σε σχόλιο (το conversational agent χρειάζεται πρόσφατο context, όχι όλο το ιστορικό).
  - Καμία αλλαγή στο response shape (`{ reply, actions }`)· καθαρό cost-hardening, ίδιο behaviour για κανονικά (σύντομα) conversations.
  - npm run type-check exits 0
- Status: DONE (2026-07-01) — δύο σταθερές στο `ai/route.ts`: `MAX_TURNS = 20` (`b.messages.slice(-MAX_TURNS)` πριν το φιλτράρισμα → κρατιούνται μόνο τα τελευταία 20 turns) + `MAX_CONTENT = 8000` (κάθε `content` γίνεται `.slice(0, MAX_CONTENT)` καθώς μπαίνει στο array → ένα μεμονωμένο blob δεν φουσκώνει τα tokens). Response shape (`{ reply, actions }`) αμετάβλητο· καθαρό cost/DoS-hardening, ταυτόσημη συμπεριφορά για κανονικά σύντομα conversations. tsc EXIT 0· safe rebuild → /login 200, web restarts 0, POST no-token → 401 (auth boundary intact). **Ουρά Web Debt: 1 ενεργό P3/S (apiBody adoption).**

### Receipt lineItems serializer — dedup σε 3 routes
- Priority: P3
- Size: S
- Area: shared
- Files: apps/web/src/app/api/v1/receipts/serialize.ts, apps/web/src/app/api/v1/scan/receipt/route.ts, apps/web/src/app/api/v1/receipts/[id]/route.ts, apps/web/src/app/api/v1/receipts/[id]/rescan/route.ts
- Depends on: none
- Acceptance:
  - Το ίδιο normalization `lines.map((l) => ({ name: l.refinedName || l.name || '', qty: l.qty ?? 1, price: l.price ?? 0, vatRate: l.vatRate ?? 0 }))` + ο τύπος `LineLean` (`{ name?; refinedName?; qty?; price?; vatRate? }`) είναι copy-paste σε 3 GET/POST receipt routes (scan/receipt, receipts/[id] GET, receipts/[id]/rescan). Εξάγεται ένας shared helper (π.χ. `serializeLineItems(lines)` + ο τύπος) στο `receipts/serialize.ts` (όπου ζει ήδη το `trimReceipt`/`ReceiptLean`) και τον καλούν τα 3 routes.
  - Το output shape ανά line μένει ΑΚΡΙΒΩΣ ίδιο (name/qty/price/vatRate, ίδια fallbacks)· μηδέν αλλαγή στο response. Το PATCH (receipts/[id]) έχει ΔΙΑΦΟΡΕΤΙΚΟ inbound mapping (`numOr`, `refinedName:''`) → ΔΕΝ το αγγίζεις.
  - npm run type-check exits 0
- Status: DONE (2026-07-01) — νέα `serializeLineItems(lines: unknown): ReceiptLine[]` + ο τύπος `LineLean`/`ReceiptLine` στο `receipts/serialize.ts`· τα 3 routes (receipts/[id] GET, receipts/[id]/rescan, scan/receipt) καλούν πλέον το helper, σβήστηκαν τα 3 local `type LineLean` + οι inline `.map`. Output shape ΑΚΡΙΒΩΣ ίδιο (ίδια fallbacks)· το PATCH inbound mapping (numOr/refinedName:'') ΔΕΝ αγγίχτηκε. tsc EXIT 0· safe rebuild → /login 200, web restarts 0, no-token GET receipts/[id] → 401.

### Inline error → shared apiError() helper (4 routes)
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/scan/product/route.ts, apps/web/src/app/api/v1/scan/receipt/route.ts, apps/web/src/app/api/v1/shopping-list/route.ts, apps/web/src/app/api/v1/items/route.ts
- Depends on: none
- Acceptance:
  - 4 routes επιστρέφουν inline `return NextResponse.json({ error: ... }, { status: 400 })` ενώ υπάρχει το shared `apiError(message, status=400)` (`lib/apiAuth.ts`) που παράγει ΠΑΝΟΜΟΙΟΤΥΠΟ `{ error }` shape και το χρησιμοποιούν ήδη 33 routes. Αντικαθίστανται με `return apiError(r.error)` / `apiError('title required')`.
  - Το `auth/login` ΕΞΑΙΡΕΙΤΑΙ σκόπιμα (auth boundary, δικό του error handling) — μην το αλλάξεις.
  - Μηδέν αλλαγή σε status codes ή error messages· καθαρό consistency. Αν κάποιο route μείνει χωρίς άλλη χρήση του `NextResponse`, καθάρισε το import.
  - npm run type-check exits 0
- Status: DONE (2026-07-01) — και τα 4 routes (scan/product:14, scan/receipt:20, shopping-list:18, items:61) καλούν πλέον `apiError(...)` αντί inline `NextResponse.json({ error }, { status: 400 })`· το `apiError` προστέθηκε στο import από `@/lib/apiAuth` σε καθένα. Επειδή τα actions επιστρέφουν `error?: string` (τυπικά `string | undefined`, ο TS δεν narrow-άρει μετά το `!r.ok`) χρησιμοποιήθηκε `apiError(r.error || 'Bad request')` — behaviorally identical (κάθε `!ok` path θέτει πάντα non-empty error string, επαληθευμένο· το fallback ποτέ δεν ενεργοποιείται στην πράξη). Το `NextResponse` παραμένει σε χρήση και στα 4 (άλλα json returns) → κανένα dangling import. Το `auth/login` ΔΕΝ αγγίχτηκε (auth boundary). tsc EXIT 0· safe rebuild → /login 200, web restarts 0, POST no-token → 401 και στα 4. **Ουρά Web Debt: 0 ενεργά items.**

### Index updatedAt στα synced models
- Priority: P2
- Size: S
- Area: db
- Files: apps/web/src/models/Item.ts, apps/web/src/models/Task.ts, apps/web/src/models/Receipt.ts, apps/web/src/models/Expense.ts, apps/web/src/models/Subscription.ts, apps/web/src/models/Statement.ts, apps/web/src/models/Voucher.ts
- Depends on: none
- Acceptance:
  - Το `updatedAt` (το incremental-sync cursor του `withSince` σε `lib/apiList.ts`, φιλτράρει `updatedAt: { $gte }` σε κάθε list endpoint) γίνεται indexed σε όλα τα 7 synced models. Στα Item + Task είναι ΚΑΙ το sort key (`sort({ updatedAt: -1 })`) → τώρα γίνεται unindexed range-scan + in-memory sort σε κάθε mobile sync.
  - Προτίμησε explicit `Schema.index({ updatedAt: -1 })` (τα Mongoose timestamps ΔΕΝ auto-index-άρουν το updatedAt).
  - Μηδέν αλλαγή σε route logic / response shape.
  - npm run type-check exits 0
- Status: DONE (2026-06-30) — explicit `Schema.index({ updatedAt: -1 })` σε Item/Task/Receipt/Expense/Subscription/Statement/Voucher (σχόλιο ότι στα Item/Task είναι ΚΑΙ sort key). tsc EXIT 0· safe rebuild → /login 200, mongo healthy, web up χωρίς loop.

### POST /api/v1/items — whitelist status & category
- Priority: P2
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/items/route.ts
- Depends on: none
- Acceptance:
  - Το POST κάνει validate το `status` με την ίδια whitelist που ΗΔΗ χρησιμοποιεί το PATCH (`items/[id]/route.ts` → `STATUS.includes(...)`)· invalid → fallback 'researching' (ή 400, ίδιο μοτίβο με το `tasks/route.ts` που κάνει ήδη `['todo','in-progress','done','blocked'].includes(...)`).
  - Το `category` παραμένει free string (το model έχει relaxed enum), αλλά τεκμηριώνεται ότι είναι σκόπιμο· καμία αυθαίρετη τιμή status δεν αποθηκεύεται πλέον.
  - Εξάγεται το `STATUS` array σε ένα κοινό σημείο (π.χ. shared const) ώστε POST + PATCH να μοιράζονται την ίδια λίστα, χωρίς διπλό literal.
  - npm run type-check exits 0
- Status: DONE (2026-06-30) — νέο `ITEM_STATUSES` const στο `models/Item.ts` (single source, τροφοδοτεί και το schema enum)· το POST κάνει whitelist με fallback 'researching', το PATCH αντικατέστησε το local `STATUS` literal με το import. category σκόπιμα free string. tsc EXIT 0· safe rebuild → /login 200, web restarts 0, POST/GET no-token → 401.

### GET /api/v1/items — χρήση listEnvelope (alignment)
- Priority: P2
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/items/route.ts, apps/mobile/src/api.ts
- Depends on: none
- Acceptance:
  - Υπάρχει shared `listEnvelope` (`lib/apiList.ts`) που επιστρέφει `{ data, total, limit, offset }` και το χρησιμοποιούν ΗΔΗ 6 list endpoints (receipts/tasks/expenses/subscriptions/statements/vouchers). ΜΟΝΟ το `GET /api/v1/items` αποκλίνει επιστρέφοντας `{ items, total, limit, offset }`.
  - Είτε (α) align το items σε `listEnvelope` (`{ data }`) ΚΑΙ ενημέρωση του mobile consumer (`apps/mobile/src/api.ts`, όπου διαβάζει `.items`) ώστε να μη σπάσει, είτε (β) αν το breaking δεν είναι αποδεκτό τώρα, καταγραφή της απόκλισης ως σχόλιο στο route + στο `## Needs Achilleas` και κλείσιμο του item.
  - Όποια επιλογή: το web + το mobile συμφωνούν στο key· μηδέν runtime σπάσιμο στο mobile items list.
  - npm run type-check exits 0
- Status: DONE (2026-06-30· commit `c3c9fae`) — επιλέχθηκε (α): `GET /items` γυρνά πλέον `listEnvelope({data})` (route.ts:53) ΚΑΙ ο mobile consumer ενημερώθηκε να διαβάζει `.data` (`apps/mobile/src/api.ts:205`). Επαληθεύτηκε από τον κώδικα σε αυτό το run· ήταν stale-marked TODO. Συμβατό end-to-end, μηδέν runtime break.

### shopping-list/[id] — id validation + 404
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/shopping-list/[id]/route.ts
- Depends on: none
- Acceptance:
  - Το PATCH/DELETE κάνουν validate το `id` (regex `^[a-f0-9]{24}$` όπως ΟΛΑ τα άλλα `[id]` routes, π.χ. `items/[id]`) → 400 αντί να φτάσει malformed id στη Mongoose query (CastError → 500).
  - Όταν η εγγραφή δεν βρεθεί, επιστρέφεται 404 αντί για σιωπηλό `{ ok: true }` (τα `toggleListItem`/`updateListItem`/`deleteListItem` actions να γυρίζουν found-flag, ή έλεγχος ύπαρξης πριν).
  - Είναι το ΜΟΝΟ `[id]`/`[type]` route χωρίς id-format guard (επιβεβαιωμένο με sweep).
  - npm run type-check exits 0
- Status: DONE (2026-06-30) — `ID_RE = /^[a-f0-9]{24}$/i` guard σε PATCH+DELETE (→ `apiError('bad id')` 400)· τα `toggleListItem`/`updateListItem`/`deleteListItem` actions γυρνούν πλέον `found` (από `matchedCount`, ο soft-delete pre-hook εξασφαλίζει live-only match) → route επιστρέφει 404 σε not-found αντί σιωπηλό `{ok:true}`· PATCH χωρίς έγκυρα πεδία → 400 `no valid fields` (μοτίβο items/[id]). Web UI αγνοεί το return (additive). tsc EXIT 0· safe rebuild → /login 200, web running· no-token PATCH/DELETE → 401 (auth πριν το id-check).

### Shared body-coercion helpers (str/num/enum/bool)
- Priority: P3
- Size: S
- Area: shared
- Files: apps/web/src/lib/apiList.ts (ή νέο apps/web/src/lib/apiBody.ts), apps/web/src/app/api/v1/items/route.ts, apps/web/src/app/api/v1/expenses/route.ts
- Depends on: none
- Acceptance:
  - ~25 mutation routes επαναλαμβάνουν το ίδιο pattern (`const b = (await req.json().catch(() => ({}))) as Record<string, unknown>` + `typeof b.x === 'number' ? b.x : ...`, `String(b.y || '')`, enum-`includes`). Εισάγονται μικρά typed helpers (π.χ. `strField`, `numField`, `enumField`, `boolField`) σε ένα shared module.
  - Refactor-άρονται **2 routes ως απόδειξη** (items + expenses)· τα υπόλοιπα μένουν για μελλοντικά runs (μη-sprawling).
  - Καμία αλλαγή σε response shape / validation behaviour· καθαρά dedup.
  - npm run type-check exits 0
- Status: DONE (2026-06-30) — νέο `lib/apiBody.ts` (`readBody`/`strField`/`numField`/`enumField`/`boolField`, behaviour-identical helpers). Refactor-αρίστηκαν **expenses + subscriptions** POST (αντί items: το `items/route.ts` ήταν active parallel WIP → απέφυγα conflict, ίδιο pattern). Μηδέν αλλαγή σε validation/response shape (vendor/name trimmed+required, amount→null guard, enum-guard cycle/kind/billingCycle, bool recurring). tsc EXIT 0· safe rebuild → /login 200, web running· POST/GET no-token → 401. Απομένουν ~23 routes με το ίδιο pattern για μελλοντικά runs (incl. items, όταν ελεύθερο).

### getTenantConnection cache-reuse guard δέχεται disconnected connection
- Priority: P3
- Size: S
- Area: shared
- Files: apps/web/src/lib/tenancy/connection.ts
- Depends on: none
- Acceptance:
  - Ο guard επαναχρησιμοποίησης (`connection.ts:~60`) ελέγχει `existing.readyState !== 99` (uninitialized) και επιστρέφει το cached `useDb` connection. Όμως το inline σχόλιο λέει «reuse only while the underlying connection is still open· a dropped socket would make a stale entry unusable, so fall through and rebuild it» — και το `!== 99` επιστρέφει και connections σε readyState **0 (disconnected)** / **3 (disconnecting)**, δηλαδή ΟΧΙ «open». Είτε ο κώδικας είτε το σχόλιο πρέπει να ευθυγραμμιστεί.
  - Πρόταση (αν επιβεβαιωθεί ως πρόθεση): reuse μόνο όταν `readyState === 1` (connected) ή `2` (connecting), αλλιώς rebuild· ή, αν το intent είναι «rebuild μόνο σε torn-down object», διόρθωσε το σχόλιο ώστε να μη λέει «still open».
  - **ΣΗΜ (γιατί flag, όχι fix):** dead-until-SaaS κώδικας — **0 importers**, gated πίσω από `SAAS_MODE` (off). Μηδέν επίδραση στο single-user app σήμερα· ambiguous το «σωστό» rebuild-semantic (το `defaultConn.useDb()` μοιράζεται το ίδιο base client, οπότε ένα rebuild δεν «ξαναφτιάχνει» dropped socket από μόνο του — μπορεί να μη χρειάζεται καθόλου rebuild). Θέλει σκόπιμη απόφαση, όχι μηχανικό swap.
  - npm run type-check exits 0
- Status: TODO (flagged 2026-07-01 reviewer, commit `1a7d16e`· 37η σάρωση επιβεβαίωσε ανοιχτό: `connection.ts:54` guard επιστρέφει cached conn εκτός αν `readyState === 99` (uninitialized)· readyState 0 (disconnected) περνά ακόμα)

---

## Δεν είναι debt (επιβεβαιωμένο, μην ανοίξεις item)

- **Μηδέν loading.tsx**: σκόπιμο (CLAUDE.md, Session 2026-06-08 cont.²) — η παρουσία `loading.tsx` προκαλούσε nav flash· αφαιρέθηκαν επίτηδες. Υπάρχει global `app/error.tsx` (stale-deploy auto-reload). Μην προτείνεις προσθήκη.
- **7 per-resource `trim` serializers**: διαφορετικά shapes ανά resource (όχι ίδια logic) → αποδεκτό· όχι candidate για dedup-rewrite.
- **`Statement.find().lean()` χωρίς limit** (calendar/overview/reports/plans): πλήρες scan αλλά τα statements είναι λίγα (ανά μήνα/κάρτα)· χαμηλό ρίσκο, μην το βάλεις σε queue προς το παρόν.
