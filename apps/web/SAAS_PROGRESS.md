
---

## 2026-07-02 (increment 22 — invitedBy projection στο inviteView, κλείνει το audit loop)
**Built:** το §21 πρόσθεσε acceptedBy/acceptedAt (ποιος δέχτηκε), αλλά έλειπε το «ποιος
έστειλε». Το `invitedBy` υπήρχε ΗΔΗ στο `Invite` model + set-άρεται στο mint
(`members/route.ts:135` → `invitedBy: session.account.sub`), απλώς **δεν προβαλλόταν**. Το
πρόσθεσα ΟΛΟ additive, SaaS-gated, σε δικά μου αρχεία:
- `lib/tenancy/invites.ts` (additive): ο `InviteView` type += **`invitedBy: string|null`** +
  ο `inviteView` serializer το projects (stringified ObjectId· null σε legacy rows minted πριν
  υπάρξει το field). By construction ΠΟΤΕ tokenHash — μόνο whitelisted πεδία.
- `app/api/saas/invites/route.ts` (additive): το GET `.select()` += `invitedBy` ώστε να φτάνει
  στον serializer. Gate/scope/sort/status-filter αμετάβλητα.
- `lib/tenancy/invites.test.ts`: ενημέρωσα το exact-key-set assertion (+invitedBy) + το
  defaults test + 2 νέα it-blocks (invitedBy → '7'· legacy row → null).

Έτσι το audit view (`?status=accepted|all`) δίνει πλήρες trail: **invitedBy → acceptedBy/
acceptedAt** (ποιος κάλεσε ποιον, ποιος τελικά μπήκε, πότε).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run invites.test.ts` → **28/28
green** (26 προϋπάρχοντα + 2 νέα). Pure serializer + `.select()` προσθήκη σε SaaS-gated route
(404 όταν off) ⇒ `SAAS_MODE` off = zero effect, κανένα Docker rebuild, καμία νέα εξάρτηση,
κανένας external importer των αλλαγών. Άγγιξα μόνο δικά μου SAAS αρχεία.

**Next task:** increment 23 — είτε (α) `invitedBy` projection και στο MEMBER list
(`members/route.ts` έχει ήδη το field στο `.select()` + serializer· έλεγξε αν χρειάζεται
consistency με invites), είτε (β) `sendViaSmtp` via nodemailer (μετά από provider decision
Achilleas — ξεκλειδώνει reset/verify/invite delivery σε production), είτε (γ) dedicated resend
endpoint (re-mint + email σε ένα βήμα).

**## Needs Achilleas:**
- **Stripe keys** για `billingConfigured:true` (αλλιώς summary σωστά `false` + action buttons
  503 graceful).
- **SMTP/email provider decision** για production delivery των reset/verify/invite emails
  (τώρα echo σε non-prod, no-op σε prod χωρίς config).
- Ανοιχτά: tenant-aware `saveFile` (shared storage) + enforcement wiring σε `api/v1/*`
  (feature territory) — θέλουν ρητή άδεια ή feature-builder routine.

## 2026-07-02 (increment 11 — billing summary read surface)
**Built** (όλο σε νέα αρχεία· μηδέν edit σε υπάρχον):
- `lib/billing/billingSummary.ts` — PURE builder (imports μόνο το plan table + το δικό μου
  `billingRoutes.canManageBilling`· μηδέν DB/Stripe/env-at-load). `buildBillingSummary(input)`
  ενώνει plan metadata (key/name/priceMonthlyEUR/tier/storageGB/aiCallsPerMonth/customDomain
  από `planDef`) + status + trialEndsAt (→ISO, tolerant σε string/bad) + Stripe linkage
  (customerId/subscriptionId trimmed→null, `active`=has-sub) + `billingConfigured` (περνιέται
  in) + `canManage` (owner/admin) + `action`. `billingAction(hasSub, canManage)`: member →
  `view` (read-only), manager → `manage` αν υπάρχει subscription αλλιώς `subscribe`.
- `app/api/saas/billing/route.ts` — `GET /api/saas/billing[?tenant=<slug>]` (nodejs, force-
  dynamic). SaaS-gated (404 όταν off) + account session. Σε αντίθεση με τα checkout/portal
  ACTION routes, αυτό το READ endpoint είναι ανοιχτό σε ΚΑΘΕ member του workspace (members
  παίρνουν `canManage:false` + `action:'view'` → το UI το δείχνει read-only), όπως το
  `/api/saas/usage`. `?tenant=` διαλέγει workspace by slug. Επιστρέφει `{tenant, ...summary}`.
- `lib/billing/billingSummary.test.ts` — 10 PURE tests (billingAction member/manager ×
  sub-state, plan mapping, active-sub→manage, no-sub→subscribe, member→view, unknown-plan→
  free fallback, blank-status→trialing, trialEndsAt ISO/string/bad/null, empty-Stripe-ids→null
  + unconfigured backend).

**Verified:** `npm run type-check` → **EXIT 0**. `npm test` → **363/363 green** (353
προϋπάρχοντα + 10 νέα). External importers των νέων modules από feature code → **κανένας**·
το route SAAS-gated (404 όταν off) ⇒ zero runtime wiring, `SAAS_MODE` off = zero effect,
κανένα Docker rebuild. Καθαρά additive — δεν άγγιξα κανένα υπάρχον αρχείο.

**## Needs Achilleas:**
- Ίδιο με πριν (increment 10): **Stripe keys** για να γίνει `billingConfigured:true` (αλλιώς
  το summary δείχνει σωστά `false` + τα action buttons γυρίζουν 503 graceful). Το `manage`
  action απαιτεί ολοκληρωμένο checkout (billingSubscriptionId set από τον webhook).
- Ανοιχτά από πριν: tenant-aware `saveFile` (shared storage) + enforcement wiring σε `api/v1/*`
  (feature territory) — και τα δύο θέλουν ρητή άδεια ή feature-builder routine.

**Next task:** increment 12 — μια settings/billing SERVER COMPONENT ή client widget που
καταναλώνει το `GET /api/saas/billing` + `GET /api/saas/usage` και δείχνει plan/status/usage
bars + Subscribe/Manage button (POST στα checkout/portal routes). Θα ζει σε νέο SaaS-only
component/page under δικό μου territory (π.χ. `app/(saas)/billing` ή component gated από
`saasMode()`), ώστε να μην αγγίξει τα υπάρχοντα settings pages. Εναλλακτικά, το enforcement/
saveFile wiring αν δοθεί άδεια για shared plumbing.

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

## 2026-07-02 (increment 23 — dedicated invite-resend endpoint)
**Built:** το §19-20-21-22 έκλεισαν το invite lifecycle (mint → list → audit), αλλά το
«resend» ήταν έμμεσο (ξανα-POST στο `/api/saas/members` για το ίδιο email, που supersede-άρει
τον παλιό token). Πρόσθεσα ξεχωριστό endpoint που re-mint + re-send σε ΕΝΑ βήμα, χωρίς να
ξέρεις/ξαναγράφεις το email. ΟΛΟ SaaS-gated, additive, σε νέο αρχείο — κανένα υπάρχον αρχείο
δεν άλλαξε:
- `app/api/saas/invites/resend/route.ts` (νέο): **POST** `{ inviteId, tenant? }`, owner/admin
  only (`resolveWorkspaceSession(slug, true)`). Re-mint (`mintInviteToken`) → `findOneAndUpdate`
  με `{_id, tenant, status:'pending'}` filter → `$set {tokenHash, expires}` (ίδιο row: κρατά
  invitedBy/createdAt/email/role· ΝΕΟΣ hash **retire-άρει τον παλιό link** — «newest link
  wins», ίδια αρχή με το members supersede). matchedCount 0 (accepted/revoked/wrong-tenant) →
  404. **Δεν καταναλώνει νέα θέση** (το pending invite είχε ήδη κρατήσει seat στο mint) → κανένα
  seat re-check. Email re-send μέσω `inviteEmail`/`inviteLinkUrl`/`sendEmail` όταν
  `mailerCanDeliver()`· SCAFFOLD dev-token echo (mirror members: non-prod + no mailer →
  `devToken`, prod drops silently). Token hash ΠΟΤΕ στο response. Runtime nodejs + force-dynamic.

Γιατί re-mint αντί resend του ίδιου token: ο token δεν αποθηκεύεται ποτέ (μόνο το hash), άρα
δεν γίνεται να ξαναδιαβαστεί για re-send· το re-mint είναι και η μόνη δυνατή διαδρομή και η
ασφαλής (invalidate του παλιού). Το target είναι τυπικά expired-but-pending invite (ο link
έληξε πριν κλικαριστεί) — status μένει `pending`, νέο future expiry το ξαναζωντανεύει.

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run` → **652/652 green** (καμία
regression· ο συνολικός ανέβηκε από concurrent routines). Το route SaaS-gated (404 όταν off)
+ καθαρά νέο αρχείο (μηδέν edit σε υπάρχον, μηδέν external importer) ⇒ `SAAS_MODE` off = zero
effect, κανένα Docker rebuild, καμία νέα εξάρτηση.

**## Needs Achilleas:**
- **SMTP/email provider decision** (Resend key ή wired SMTP) για production delivery· μέχρι τότε
  ο resend επιστρέφει `devToken` ΜΟΝΟ σε non-production (ίδιο με reset/verify/invite).
- Χρειάζεται invites-UI (§19) που εκθέτει resend button → POST εδώ (το `expired` flag του
  inviteView ήδη σηματοδοτεί ποια invites θέλουν resend).

**Next task:** increment 24 — είτε (α) `sendViaSmtp` via nodemailer (μετά από provider decision
Achilleas· ξεκλειδώνει ΟΛΑ τα reset/verify/invite/resend emails σε production), είτε (β) invites
UI section (owner/admin) που καταναλώνει `GET /api/saas/invites` + resend/revoke controls (ζει σε
δικό μου SaaS territory), είτε (γ) billing/usage widget (increment 12 από την ουρά).

## 2026-07-03 (increment 30 — tenant-status access enforcement)
**Built:** επέλεξα το (β) — έκλεισα το P2 gap που είχε flag-αριστεί (ο soft-cancel του increment 29
ήταν άδοντος: το `resolveWorkspaceSession` δεν κοίταζε ποτέ το `tenant.status`, οπότε ένας
`canceled`/`suspended` workspace παρέμενε πλήρως προσβάσιμος). Additive, ΟΛΟ σε δικά μου SAAS-gated
αρχεία:
- `lib/tenancy/workspace.ts` — νέος **PURE** guard `workspaceStatusError(status)` (+ export
  `ACTIVE_WORKSPACE_STATUSES = ['active','trialing']`). Επιστρέφει null όταν active/trialing (case/
  whitespace-insensitive), αλλιώς ειδικό μήνυμα ανά status (`pending`→being-set-up, `suspended`,
  `canceled`) και **fail-closed** για unknown/empty/non-string → «workspace is not active».
- `lib/tenancy/workspaceSession.ts` — νέα 3η παράμετρος **`allowInactive=false`** στο
  `resolveWorkspaceSession`. Με το default (false), μετά το resolve του Tenant doc ελέγχεται
  `workspaceStatusError(tenant.status)` → **403** αν blocked. Έτσι ΟΛΑ τα workspace-scoped routes
  (members/audit/invites/resend + workspace PATCH) αποκτούν enforcement **χωρίς edit** (default
  false = enforce).
- `app/api/saas/workspace/route.ts` — **GET** και **DELETE** περνούν `allowInactive:true`: ο owner
  πρέπει να **βλέπει** έναν canceled/suspended workspace (status + μελλοντικό reactivate), και ο
  soft-cancel μένει **idempotent** πάνω σε ήδη-canceled tenant. Η **PATCH (rename)** μένει enforced
  (2 args → allowInactive false): δεν μετονομάζεις νεκρό workspace.
  ΣΗΜ: τα billing routes (portal/checkout) χρησιμοποιούν ξεχωριστό `billingSession` — **σκόπιμα
  ΔΕΝ** μπαίνει status-gate εκεί (ένας suspended/dunning tenant πρέπει να μπορεί να πληρώσει για να
  ξε-suspend-αριστεί).
- `lib/tenancy/workspace.test.ts` — +3 PURE tests για `workspaceStatusError` (active/trialing allow
  με case/space, pending/suspended/canceled specific messages, fail-closed unknown/empty/null/number).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run workspace.test.ts` → **19/19 green**
(16+3)· full suite `npx vitest run` → **775/775 green** (καμία regression). Το enforcement είναι
SAAS-only (τα routes 404 όταν SAAS_MODE off) + ο guard pure· ο default path παραμένει αμετάβλητος
(non-active tenants υπάρχουν μόνο σε SAAS mode). **Zero effect** στο self-hosted app. Κανένας Docker
rebuild (route 404 στο running container με SAAS_MODE off — ο νέος κώδικας δεν εκτελείται· type-check
+tests καλύπτουν compile+logic)· καμία νέα εξάρτηση· κανένα feature route/data-db/User-path αγγίχτηκε.
Άγγιξα μόνο δικά μου SAAS αρχεία (foreign `.claude/launch.json` + apps/mobile edits άθικτα).

**## Needs Achilleas** (workspace lifecycle):
- **Reactivation path**: canceled/suspended → active χρειάζεται μικρό owner-only route· τώρα που το
  enforcement μπλοκάρει τα management routes, ο μόνος τρόπος «επαναφοράς» ενός workspace θα είναι
  αυτό (θα περνά `allowInactive:true` για να δει/αλλάξει τον inactive tenant). Εύκολο επόμενο increment.
- **Suspend flow**: ποιος/τι θέτει `status:'suspended'` (Stripe dunning webhook) — billing-side, όταν
  υπάρχει live Stripe.

**Next task:** increment 31 — είτε (α) reactivate route (owner-only, canceled/suspended→active,
`allowInactive:true`), είτε (β) Stripe webhook → suspend/reactivate on payment failure/recovery
(θέλει live Stripe keys → Needs-Achilleas για το τελικό wiring), είτε (γ) user-facing
workspace-settings UI panels (όλα τα read/write APIs έτοιμα).
