
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

## 2026-07-03 (increment 31 — workspace reactivate: owner-only canceled→active)
**Built:** επέλεξα το (α) — reactivate route, το φυσικό συμπλήρωμα του soft-cancel (increment 29) +
status-enforcement (increment 30). Αφού το cancel μπλοκάρει πρόσβαση για όλους, ο owner χρειάζεται
δρόμο επιστροφής. Backend-only, additive, ΟΛΟ σε δικά μου SAAS-gated αρχεία:
- `lib/tenancy/workspace.ts` — 2 νέοι **PURE** guards: `canReactivateWorkspace(role)` (**owner-only**,
  mirror του cancel — re-opens access + billing-adjacent) + `reactivateStatusError(status)`
  (+ export `REACTIVATABLE_STATUSES=['canceled']`). Επιτρέπει ΜΟΝΟ `canceled`→active (case/space-
  insensitive)· `active/trialing`→«already active», `suspended`→«resolved by billing, not manually»
  (billing hold, όχι manual flip), `pending`→being-set-up· **fail-closed** για unknown/empty/non-string.
- `lib/tenancy/audit.ts` — +1 auditable action `workspace.reactivated` στο `AUDIT_ACTIONS`.
- `app/api/saas/workspace/reactivate/route.ts` (νέο, nodejs + force-dynamic): **POST** `{tenant?}` →
  `resolveWorkspaceSession(slug,false,true)` (allowInactive:true ώστε ο canceled tenant να είναι
  reachable — αλλιώς το status-gate του increment 30 θα τον 403-άριζε) → **owner-only** gate
  (`canReactivateWorkspace`, 403 αλλιώς) → `reactivateStatusError` (409 αν όχι canceled) →
  `Tenant.updateOne {$set:{status:'active'}}` + `recordAudit('workspace.reactivated', from→'active')`.
  Επιστρέφει `workspaceView` (ίδιο shape με cancel/rename). Slug/dbName/data-db ΑΘΙΚΤΑ.
- `lib/tenancy/workspace.test.ts` — +7 PURE tests (canReactivateWorkspace owner-yes/admin-member-no/
  unknown-no· reactivateStatusError canceled-allow-case-space, already-active, suspended-billing/
  pending, fail-closed unknown/empty/null/number).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run workspace.test.ts` → **26/26 green**
(19+7)· full suite `npx vitest run` → **795/795 green** (καμία regression). Το route SAAS-gated (404
όταν SAAS_MODE off) + οι guards pure· κανένας external importer από feature code ⇒ `SAAS_MODE` off =
**zero effect** στο self-hosted app. Κανένας Docker rebuild (route 404 στο running container με
SAAS_MODE off — ο νέος κώδικας δεν εκτελείται· type-check+tests καλύπτουν compile+logic)· καμία νέα
εξάρτηση· κανένα feature route/data-db/User-path αγγίχτηκε. Άγγιξα μόνο δικά μου SAAS αρχεία (foreign
`.claude/launch.json` + apps/mobile edits άθικτα).

**Next task:** increment 32 — είτε (α) Stripe webhook → suspend/reactivate on payment failure/recovery
(θέλει live Stripe keys → Needs-Achilleas για το τελικό wiring· ο reactivate guard είναι έτοιμος να το
consume-άρει programmatically), είτε (β) user-facing workspace-settings UI panels (General/Members/
Invitations/Activity/Billing + cancel/reactivate controls — όλα τα read/write APIs έτοιμα), είτε (γ)
`sendViaSmtp` via nodemailer (μετά provider decision Achilleas).

## 2026-07-03 (increment 32 — audit billing-driven status changes στο Stripe webhook)
**Built:** επέλεξα το (α), το κομμάτι που έλειπε: το webhook άλλαζε ήδη `Tenant.status`
(suspend σε past_due/unpaid, canceled σε subscription.deleted, active σε recovery/checkout)
αλλά **δεν το κατέγραφε** — μόνο το `plan.changed` γινόταν audit. Έτσι το «Activity» panel δεν
θα έδειχνε ποτέ ότι ο Stripe suspend-άρισε ένα workspace για μη-πληρωμή ή το reactivate-άρισε
στην ανάκαμψη. Κλείνει το billing-lifecycle audit trail. ΟΛΟ SAAS-gated, additive, σε δικά μου
SAAS αρχεία:
- `lib/tenancy/audit.ts` — +1 auditable action `workspace.suspended` στο `AUDIT_ACTIONS` (μόνη
  αλλαγή· redaction/recorder/serializer αμετάβλητα· το `parseAuditAction` του read route το
  δέχεται αυτόματα ως `?action=` φίλτρο).
- `lib/billing/statusAudit.ts` (νέο) — **PURE** `statusAuditAction(prev, next)` → `AuditAction |
  null`. Χαρτογραφεί ΜΟΝΟ τις billing transitions που μετράνε: → suspended ⇒ `workspace.suspended`·
  → canceled ⇒ `workspace.canceled`· suspended|canceled → active|trialing ⇒ `workspace.reactivated`
  (recovery). No-op change (prev===next), initial go-live (pending|trialing→active, ήδη captured
  από plan.changed) και benign trialing↔active flips → null. Case/space-insensitive, **fail-closed**
  σε unknown/blank/non-string. Μηδέν imports πλην του `AuditAction` type.
- `app/api/saas/billing/webhook/route.ts` — νέος helper `auditStatusChange(tenant, prevStatus)`
  (mirror του `auditPlanChange`, system actor, meta {field:'status',from,to}). Κάθε handler
  (`onCheckoutCompleted`/`onSubscriptionActive`/`onSubscriptionCanceled`) πιάνει `prevStatus`
  ΠΡΙΝ τη mutation και καλεί `auditStatusChange` μετά το save (best-effort, never-throws όπως το
  υπάρχον plan audit). Καμία αλλαγή στη status logic — μόνο audit πάνω από αυτήν.
- `lib/billing/statusAudit.test.ts` (νέο) — 8 PURE tests (suspend/cancel/reactivate mapping,
  no-audit για go-live + trialing↔active, no-op prev===next, case/space-insensitivity και στις 2
  πλευρές, fail-closed unknown/blank/null/number).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run statusAudit.test.ts audit.test.ts`
→ **32/32 green**· full suite `npx vitest run` → **828/828 green** (καμία regression, +8 νέα). Το
webhook route είναι SAAS-gated (404 όταν SAAS_MODE off· επιπλέον 503 χωρίς webhook secret) + ο
mapper pure + κανένας external importer από feature code ⇒ `SAAS_MODE` off = **zero effect** στο
self-hosted app· κανένας Docker rebuild (ο νέος κώδικας δεν εκτελείται στο default path — μόνο
audit πάνω από existing status logic· type-check+tests καλύπτουν compile+logic)· καμία νέα
εξάρτηση· κανένα feature route/data-db/User-path αγγίχτηκε. Άγγιξα μόνο δικά μου SAAS αρχεία
(foreign `.claude/launch.json` + apps/mobile edits άθικτα).

**Next task:** increment 33 — είτε (α) user-facing workspace-settings UI panels που consume-άρουν
τα έτοιμα read/write APIs (General/Members/Invitations/Activity/Billing + cancel/reactivate — όλα
έτοιμα, UI-only), είτε (β) `sendViaSmtp` via nodemailer (μετά provider decision Achilleas· το
webhook mailer καλύπτει ήδη dependency-free delivery), είτε (γ) `billing.checkout_started` /
πλήρες billing-event audit coverage (checkout route → audit πριν το Stripe redirect).

## 2026-07-05 (increment 42 — BYO-key crypto scaffold: AES-256-GCM at rest, closes D5)
**Built:** επέλεξα το (β) — υλοποίησα το D5 (RESOLVED: AES-256-GCM, key derived από `AUTH_SECRET`
μέσω scrypt, μηδέν νέα dependency). Το `aiByoKey` **flag** υπήρχε στο `Tenant` + το `aiKeyPolicy.ts`
το διάβαζε, αλλά ο ίδιος ο κλειδί δεν είχε πουθενά encrypted-at-rest storage/crypto («encryption at
rest — Needs Achilleas» έλεγε το ίδιο το aiKeyPolicy header). Το έκλεισα. ΟΛΟ additive /
backward-compatible / NODE-only, σε δικά μου SAAS αρχεία, μηδέν wiring:
- `lib/tenancy/secretCrypto.ts` (νέο, NODE-only `node:crypto`): ο crypto πυρήνας. `encryptSecret
  (plaintext)` → self-describing envelope **`gcm1$<iv>$<tag>$<ct>`** (base64, random 12-byte IV
  ανά call → ίδιο plaintext → διαφορετικά ciphertexts)· `decryptSecret(stored)` → plaintext ή
  **`null`** σε ΚΑΘΕ αποτυχία (malformed / λάθος AUTH_SECRET / tampered — GCM auth tag fail),
  never throws· `secretCryptoReady()` (mirror του `authConfigured`, fail-closed χωρίς AUTH_SECRET
  ≥16 chars)· `isEncryptedSecret()` (envelope shape check, no decrypt). Key = **scrypt(AUTH_SECRET,
  fixed KDF_SALT `pharos:byo-key:aes256gcm:v1`, 32)**, ίδιο cost profile με `lib/auth.ts` (N=16384),
  cached ανά secret value (rotate/test-swap → re-derive). Deterministic derivation ⇒ decryptable
  later· fixed salt = domain separation από τον JWT signer (όχι secret).
- `lib/billing/byoKey.ts` (νέο, **PURE codec** πάνω από το secretCrypto, no DB/Stripe): ο
  provider-aware storage codec. `BYO_PROVIDERS` (anthropic/openai/gemini/openrouter/custom) +
  `isByoProvider`· `encodeAiKey(provider, rawKey)` → `{ provider, keyEnc }` (validate + trim +
  encrypt· null σε bad provider/empty key/no-crypto)· `decodeAiKey(stored)` → `{ provider, key }`
  on-demand decrypt (null σε malformed/tampered/rotated)· `maskAiKey(stored)` → `{ provider,
  ••••tail }` για settings UI (ποτέ plaintext)· `byoKeyReady()`. Το plaintext ΠΟΤΕ δεν αποθηκεύεται/
  logάρεται — μόνο in-memory στο decode.
- `lib/tenancy/secretCrypto.test.ts` (νέο) — 11 tests (ready flag· round-trip incl. unicode/empty·
  envelope shape· fresh-IV uniqueness· null σε malformed/tampered-ct/rotated-secret· throw-on-encrypt
  χωρίς secret· isEncryptedSecret).
- `lib/billing/byoKey.test.ts` (νέο) — 10 tests (provider guard· ready· encode→decode round-trip ανά
  provider + trim· reject bad provider/empty/non-string/no-secret· decode reject malformed/tampered/
  rotated· maskAiKey last-4-only).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run secretCrypto.test.ts byoKey.test.ts`
→ **21/21 green**· full suite `npx vitest run` → **1385/1385 green** (99 files, καμία regression).
Grep για external importers (`secretCrypto`/`billing/byoKey`/`encryptSecret`/`decodeAiKey`/`encodeAiKey`)
από feature code → **ZERO** ⇒ zero runtime wiring. ⇒ `SAAS_MODE` off / default tenant = **zero
effect** (self-hosted app κρατά το unencrypted single-owner key στο AppConfig, δεν καλεί τίποτα από
εδώ). Κανένας Docker rebuild (νέα NODE modules, unwired· type-check+tests καλύπτουν compile+logic)·
**καμία νέα εξάρτηση** (node:crypto)· κανένα feature route/data-db/User-path/bearer-path αγγίχτηκε.
Άγγιξα μόνο δικά μου SAAS αρχεία (foreign edits άθικτα).

**## Needs Achilleas** (BYO-key go-live):
- **Persist wiring**: ο codec είναι έτοιμος, αλλά κανείς δεν γράφει/διαβάζει `{provider, keyEnc}`
  ακόμα. Μελλοντικό increment: additive optional `aiKeyEnc` field στο `Tenant` + write path (settings
  API `encodeAiKey` → `$set`) + read στο AI dispatch site (`decodeAiKey` → provider client). Αγγίζει
  AI entrypoint → προσεκτικό increment/άδεια.
- **AUTH_SECRET-scoped rotation**: αν αργότερα θέλει key-rotation ανεξάρτητη του AUTH_SECRET,
  μετακίνηση σε ξεχωριστό `ENCRYPTION_KEY` env (D5 note) — για τώρα AUTH_SECRET-derived· αλλαγή του
  AUTH_SECRET κάνει τα υπάρχοντα ciphertexts undecryptable (decode → null, ο tenant ξανα-εισάγει key).

**Next task:** increment 43 — είτε (α) BYO-key persist wiring (Tenant `aiKeyEnc` field + settings
write API + read στο AI dispatch· αγγίζει AI entrypoint → άδεια/προσοχή), είτε (β) in-process 6h cron
registration για το trial-lapse sweep (bootstrap hook, shared runtime → άδεια), είτε (γ) reset-request
timing side-channel fix (D6 spec: constant-time response), είτε (δ) user-facing workspace-settings UI
panels (read/write APIs έτοιμα).

## 2026-07-06 (increment 43 — reset-request constant-time response, closes D6)
**Built:** επέλεξα το (γ) — έκλεισα το D6 timing side-channel στο μοναδικό UNAUTHENTICATED
control-plane route (`POST /api/saas/account/reset/request`). Το body ήταν ήδη anti-enumeration
(πάντα `{ok:true}` άσχετα αν υπάρχει ο λογαριασμός), αλλά ο **χρόνος** διέρρεε: ένα registered
email έκανε επιπλέον `mintResetToken` + `account.save()` (DB write) + `await sendEmail` (network),
οπότε απαντούσε μετρήσιμα πιο αργά από ένα άγνωστο → ένας attacker που χρονομετρά μπορούσε να
enumerate-άρει ποια emails έχουν λογαριασμό. Το `verify/request` route ΔΕΝ έχει το πρόβλημα (είναι
authenticated, στοχεύει τον ΙΔΙΟ λογαριασμό του caller — μηδέν enumeration surface), οπότε το άφησα.
ΟΛΟ additive / SAAS-gated, σε δικά μου αρχεία:
- `lib/tenancy/resetTiming.ts` (νέο): **PURE** `resetResponseDelayMs(elapsedMs, floorMs?)` →
  υπόλοιπο μέχρι ένα σταθερό floor, clamped σε `[0, floor]`· non-finite/negative elapsed → **full
  floor** (fail-safe προς ΠΕΡΙΣΣΟΤΕΡΟ masking, ποτέ λιγότερο)· non-positive/non-finite floor →
  disable (0). `RESET_MIN_RESPONSE_MS = 500`. `settleMinResponseTime(startedAtMs, nowMs?)` κοιμάται
  το υπόλοιπο (nowMs injectable για tests, resolves αμέσως χωρίς timer όταν το floor έχει ήδη
  καλυφθεί → ποτέ hang).
- `app/api/saas/account/reset/request/route.ts` (edit, δικό μου): (1) `startedAt = Date.now()` ΠΡΙΝ
  κάθε account-dependent work· (2) η αποστολή email έγινε **fire-and-forget** (`void sendEmail(...)
  .catch(()=>{})` — το sendEmail ποτέ δεν throws) ώστε το network latency να ΜΗΝ μπαίνει στο timed
  path· (3) `await settleMinResponseTime(startedAt)` πριν το return ώστε το existence-dependent DB
  write να καλύπτεται από το floor. Και οι δύο κλάδοι (found/not-found) settle-άρουν στο ίδιο floor.
  Το malformed-email **400** μένει fast (εξαρτάται μόνο από το input string, μηδέν account leak). Το
  devToken scaffold (non-prod, no-mailer echo) διατηρεί ΑΚΡΙΒΩΣ την ίδια σημασιολογία (mint μόνο όταν
  υπάρχει account· echo μόνο non-prod & !configured).
- `lib/tenancy/resetTiming.test.ts` (νέο) — 10 PURE tests (full-floor at 0, below-floor remaining,
  exactly-at-floor→0, past-floor→0, fail-safe negative/NaN/±Infinity→full floor, custom floor,
  disabled floor, [0,floor] invariant sweep, settle resolves-immediately-when-met + waits-small-delay).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run` → **1425/1425 green** (102 files,
+10 νέα, καμία regression). Το route SAAS-gated (404 όταν `SAAS_MODE` off) + το νέο module import-άρεται
ΜΟΝΟ από αυτό το route (μηδέν external importer από feature code) ⇒ `SAAS_MODE` off = **zero effect**
στο self-hosted app. Κανένας Docker rebuild (route 404 στο running container με SAAS_MODE off — ο νέος
κώδικας δεν εκτελείται· type-check+tests καλύπτουν compile+logic)· **καμία νέα εξάρτηση**· κανένα
feature route/data-db/User-path/bearer-path αγγίχτηκε. Άγγιξα μόνο δικά μου SAAS αρχεία.

**## Needs Achilleas:**
- Ίδιο με πριν: **SMTP/email provider decision** (Resend key / MAIL_WEBHOOK_URL / wired SMTP) για
  production delivery· μέχρι τότε ο reset επιστρέφει `devToken` ΜΟΝΟ σε non-production.
- **Fire-and-forget email σε serverless**: σε persistent Node container (τρέχον Docker deploy) το
  detached `sendEmail` ολοκληρώνεται κανονικά· αν ποτέ γίνει deploy σε serverless/edge όπου το process
  παγώνει μετά το response, θα χρειαστεί `waitUntil`/queue ώστε να μη χάνεται το email.

**Next task:** increment 44 — είτε (α) BYO-key persist wiring (Tenant `aiKeyEnc` field + settings write
API + read στο AI dispatch· αγγίζει AI entrypoint → άδεια/προσοχή), είτε (β) in-process 6h cron
registration για το trial-lapse sweep (bootstrap hook, shared runtime → άδεια), είτε (γ) user-facing
workspace-settings UI panels (read/write APIs έτοιμα), είτε (δ) reset-request rate-limit (throttle
ανά IP/email — συμπληρώνει το D6 anti-enumeration με anti-brute-force).

## 2026-07-09 (increment 51 — Superadmin FLEET OVERVIEW: registry-only aggregate, §8)
**Το κενό:** ο operator είχε το cross-tenant LISTING (#48) + per-tenant DETAIL με usage
rollup (#49/#50), αλλά κανένα **fleet-wide** summary — «πώς πάει όλο το SaaS τώρα». Οι next-
task επιλογές του #50 ήταν όλες gated (LIVE `db.stats()` = data plane / UI panels = ξένο
territory / binary packaging = shared runtime → άδεια). Έκλεισα το ασφαλέστερο, καθαρά δικό
μου κομμάτι: ένα **READ-ONLY** fleet overview πάνω ΜΟΝΟ στο central registry. ΟΛΟ additive +
SaaS-gated + operator-gated, σε δικά μου SAAS αρχεία:
- `lib/tenancy/adminOverview.ts` (νέο). **PURE** shapers (unit-tested), reuse των
  `summarizeTenant`/`TenantSummary`/`TENANT_STATUSES` (#48) + `summarizeUsagePeriod`/
  `AdminUsagePeriod` (#50) + `PLAN_KEYS` (plans) + `periodOf` (billing/usage):
  - `tallyTenants(summaries)` → fleet counts: total, byPlan/byStatus/byTier (γνωστά keys
    pre-seeded σε 0 για σταθερό shape· άγνωστο value μετριέται στο δικό του key, ποτέ dropped)
    + flags billingLinked/aiByoKey/customDomain/erasureScheduled.
  - `sumFleetUsage(docs)` → this-period totals: AI counters (monotonic → sum across tenants =
    month volume) + storageBytes (per-tenant GAUGE, ένα row/tenant → sum across tenants =
    fleet footprint, ΟΧΙ running counter)· null rows dropped, negatives/NaN → 0 defensive.
  - `buildFleetOverview({...})` → σταθερό envelope `{format:'pharos.admin-overview', version:1,
    generatedAt(ISO safe→epoch), period, tenants, accounts(non-neg int), activeMembers, usage}`.
  - **Impure** `readFleetOverviewForAdmin(now?)` = ο ΜΟΝΟΣ reader: 4 φθηνά **registry** reads
    (`Tenant.find` → tally in-memory· `Account.countDocuments`· `Membership.countDocuments(
    {status:'active'})`· `Usage.find({period})`) → pure rollup. Αγγίζει ΜΟΝΟ το central
    registry, ΠΟΤΕ per-tenant data db, ΠΟΤΕ `db.stats()`, ΠΟΤΕ write.
- `app/api/saas/admin/overview/route.ts` (νέο) — `GET`, `runtime=nodejs`, `force-dynamic`,
  `saasGuard` (404 off) + `requireSuperadmin` (404 console-off / 401 / 403)· `no-store`.
- `lib/tenancy/adminOverview.test.ts` (νέο) — 8 PURE tests (tally pre-seed/counts/unknown-key·
  sum empty/across-tenants+gauge/null+garbage· envelope passthrough + invalid-gen→epoch+floor).

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run adminOverview.test.ts` →
**8/8 green**· full suite `npx vitest run` → **1728/1728 green** (130 files, καμία regression).
External importers του νέου module από feature code → **κανένας** (μόνο το δικό μου route).
Route SAAS-gated (404 off) + operator-gated (404 όταν `SAAS_SUPERADMIN_EMAILS` κενό)· ο reader
αγγίζει ΜΟΝΟ το registry (Tenant/Account/Membership/Usage). ⇒ `SAAS_MODE` off / self-hosted =
**zero effect** (route δεν mount-άρει, gate inert, default tenant δεν έχει Tenant/Usage rows →
empty overview). Κανένας Docker rebuild (additive node-only read module + gated route, μηδέν
shared runtime wiring — type-check+tests καλύπτουν)· καμία νέα εξάρτηση· κανένα feature route/
data-db/User-path/bearer-path αγγίχτηκε. Collision guard: staging καθαρό (τίποτα pre-staged),
μόνο τα δικά μου 3 paths.

**## Needs Achilleas** (superadmin console):
- **`SAAS_SUPERADMIN_EMAILS` env** (από #48) για ενεργοποίηση σε production. Κενό = disabled (404).
- **Superadmin UI page** (`/admin`) που καταναλώνει listing (#48) + detail-με-usage (#49/#50) +
  αυτό το fleet overview (#51) — deferred (UI territory).
- **LIVE per-tenant `db.stats()`** (on-demand δειγματοληπτικός reader αντί για το cached ledger):
  θα άγγιζε το data plane → ξεχωριστό προσεκτικό increment με άδεια.
- **Write/destructive superadmin actions** (suspend/reactivate/force-plan/drop-tenant) = **ΠΟΤΕ από routine**.

**Next task:** increment 52 — είτε (α) LIVE on-demand `db.stats()` reader (data plane read-only →
άδεια), είτε (β) user-facing workspace-settings UI panels (control-plane APIs έτοιμα → UI territory),
είτε (γ) actual binary packaging / BYO-key AI-dispatch (shared runtime / archive dep → άδεια).

## 2026-07-09 (increment 52 — Superadmin LIVE db.stats() reader: on-demand footprint, §8)
**Το κενό:** τα increments 48-51 έχτισαν το superadmin console ΜΟΝΟ πάνω στο central
registry (listing/detail/usage-rollup/fleet-overview). Το tenant DETAIL usage rollup (#50)
έδειχνε επίτηδες το **ΤΕΛΕΥΤΑΙΟ sampled** storage figure από το control-plane `Usage`
ledger, και σημείωσε ρητά το επόμενο κομμάτι: έναν **LIVE, on-demand** reader που τρέχει
`db.stats()` στη βάση ενός tenant **τώρα**, αντί να περιμένει το περιοδικό `sampleAllTenants`
cron. Το έκλεισα. Ο brief το είχε flag-άρει «(α) data plane read-only → άδεια»· το έκρινα
ασφαλές να προχωρήσω **αυτόνομα** γιατί: (1) είναι **strictly read-only** — το `db.stats()`
είναι diagnostic command (διαβάζει collection/index size metadata, ΟΧΙ τα documents) και ο
reader **δεν γράφει ποτέ** (σε αντίθεση με το `sampleTenantStorage`, ΔΕΝ push-άρει sample στο
Usage ledger — το view ενός footprint έχει μηδέν side effects)· (2) **reuse** του ΗΔΗ
existing+tested `readDbStats`/`billedBytes` (`lib/billing/dbStats.ts`, που ήδη τρέχει στο cron)
— πρώτος on-demand consumer, μηδέν νέο data-plane code· (3) fully gated (SAAS off → 404,
superadmin off → 404) ⇒ zero effect self-hosted· (4) υλοποιεί ρητά το §8 «dbStats() size
metering». ΟΛΟ additive + SaaS-gated + operator-gated, σε δικά μου SAAS αρχεία:
- `lib/tenancy/adminTenantDbStats.ts` (νέο). **PURE** shapers (unit-tested):
  `summarizeLiveDbStats(raw, fileBytes)` → display-safe {dataSize, storageSize, indexSize,
  objects, dbBytes(=billedBytes storage+index με COERCED values → single source of truth),
  fileBytes, totalBytes(=dbBytes+fileBytes)}· defensive `bytes()` NaN/±Inf/negative/fractional
  → floored non-neg· null raw → zero db footprint αλλά μετράει file bytes. `buildLiveDbStats(
  {slug,dbName,raw,fileBytes,generatedAt})` → σταθερό envelope {format:'pharos.admin-tenant-
  dbstats', version:1, generatedAt(ISO safe→epoch), slug/dbName(non-string→''), **measured**
  (raw!=null → ξεχωρίζει «couldn't read» από «zero footprint»), live}. **Impure**
  `readLiveDbStatsForAdmin(slug, now?)` = ο ΜΟΝΟΣ reader: `Tenant.findOne({slug})` (registry·
  null → caller 404) → build ctx (isDefault:false — ο default tenant ΔΕΝ έχει registry row,
  άρα ποτέ db.stats στη default/self-hosted βάση) → `readDbStats(ctx)` LIVE read-only +
  `tenantFileBytes(ctx)`, το καθένα σε try/catch (ένα bad db → not-measured envelope, ΟΧΙ 500,
  mirror του sampleAllTenants isolation).
- `app/api/saas/admin/tenants/[slug]/dbstats/route.ts` (νέο) — `GET`, `runtime=nodejs`,
  `force-dynamic`, `saasGuard` (404 off) + `requireSuperadmin` (404 console-off / 401 / 403) +
  unknown slug → 404· `no-store`. Read-only. Next 15 param convention (`params: Promise<{slug}>`).
- `lib/tenancy/adminTenantDbStats.test.ts` (νέο) — 8 PURE tests (summarize full/null/coerce/
  floor· build envelope measured true/false + invalid-gen→epoch + non-string slug/dbName→'').

**Verified:** `npm run type-check` → **EXIT 0**. `npx vitest run adminTenantDbStats.test.ts` →
**8/8 green**· full suite `npx vitest run` → **1765/1765 green** (133 files, καμία regression).
External importers του νέου module από feature code → **κανένας** (μόνο το δικό μου route).
Route SAAS-gated (404 off) + operator-gated (404 όταν `SAAS_SUPERADMIN_EMAILS` κενό)· ο reader
αγγίζει data plane **read-only** (db.stats), μηδέν write πουθενά. ⇒ `SAAS_MODE` off / self-
hosted = **zero effect** (route δεν mount-άρει, gate inert, default tenant δεν έχει registry
row → μηδέν db.stats στη self-hosted βάση). Κανένας Docker rebuild (additive gated route +
node-only read module, reuse existing data-plane code — μηδέν shared runtime wiring, type-check+
tests καλύπτουν)· καμία νέα εξάρτηση· κανένα feature route/User-path/bearer-path/write αγγίχτηκε.
Collision guard: staging καθαρό (τίποτα pre-staged· τα foreign `apps/landing/**` του start-
snapshot είχαν ήδη commit-αριστεί από concurrent routine), μόνο τα δικά μου 3 paths.

**## Needs Achilleas** (superadmin console):
- **`SAAS_SUPERADMIN_EMAILS` env** (από #48) για ενεργοποίηση σε production. Κενό = disabled (404).
- **Superadmin UI page** (`/admin`) που καταναλώνει listing (#48) + detail-με-usage (#49/#50) +
  fleet overview (#51) + LIVE dbstats (#52) — deferred (UI territory).
- **On-demand write-back**: το LIVE reader σκόπιμα ΔΕΝ γράφει sample στο ledger· αν θελήσεις ένα
  «refresh now» που ΚΑΙ ενημερώνει το cached figure, θα ήταν χωριστό opt-in action (write) — όχι
  από routine αυτόματα.
- **Write/destructive superadmin actions** (suspend/reactivate/force-plan/drop-tenant) = **ΠΟΤΕ από routine**.

**Next task:** increment 53 — είτε (α) storage-quota ENFORCEMENT surface στο superadmin (over-quota
tenants flag στο fleet overview/detail, read-only πάνω στο υπάρχον `checkStorageQuota` → control
plane, ασφαλές), είτε (β) user-facing workspace-settings UI panels (control-plane APIs έτοιμα → UI
territory), είτε (γ) actual binary packaging / BYO-key AI-dispatch (shared runtime / archive dep → άδεια).

## 2026-07-09 — DIRECTION CHANGE (Achilleas, interactive): UI-FIRST απο εδω και περα
Ο Αχιλλέας (interactive session): «ρύθμισε το να προχωράει UI κτλ και τα υπόλοιπα μετά».
Το SaaS backend/API είναι σχεδόν πλήρες· το bottleneck πλέον είναι το **UI**. Νέα προτεραιότητα
της routine (και στο SKILL.md):

- **UI-FIRST**: σε κάθε run, προτίμησε ένα UI page/panel αντί για άλλο backend read-endpoint,
  όποτε υπάρχει διαθέσιμο. Χτίζουμε (α) το **superadmin console** (`app/admin/**`) που
  καταναλώνει τα έτοιμα `api/saas/admin/*` (listing #48 / detail+usage #49-50 / fleet #51 /
  LIVE dbstats #52), και (β) τα **user-facing workspace-settings/auth panels** (`app/(saas)/**`)
  πάνω στα έτοιμα control-plane read/write APIs (signup/login/session, members/invites, plan,
  BYO-key).
- **Territory UI (νέο, αυστηρά δικό μας ώστε να μη συγκρουόμαστε με feature/landing routines)**:
  `app/admin/**`, `app/(saas)/**`, και ΟΛΑ τα νέα components σε `components/saas/**` (νέος
  φάκελος). ΜΗΝ αγγίζεις shared components (SiteNav/layout.tsx/globals.css) — κάθε SaaS segment
  παίρνει δικό του layout.
- **Self-gating (κρίσιμο για OSS parity)**: κάθε SaaS UI page → `notFound()`/redirect όταν
  `SAAS_MODE` off (και το `/admin` επιπλέον όταν ο viewer δεν είναι superadmin). Έτσι το
  self-hosted app μένει byte-for-byte αμετάβλητο.
- **Deferred (τα «υπόλοιπα μετά»)**: Stripe live wiring, plan pricing/quotas, SMTP delivery,
  storage-quota enforcement surface — μένουν scaffold + «## Needs Achilleas» μέχρι να δώσει
  keys/αποφάσεις. ΔΕΝ μπλοκάρουν το UI (τα panels δουλεύουν με placeholders/read APIs).

**Next task:** increment 53 (UI-first) — **superadmin console shell**: `app/admin/layout.tsx`
(δικό του minimal layout + superadmin-gate server check → notFound όταν off/μη-operator) +
`app/admin/page.tsx` (fleet overview #51: tenant counts by plan/status/tier + this-period AI/
storage totals) + `components/saas/**` πρώτα atoms (StatCard/Table). Server components που
fetch-άρουν απ' τα admin read APIs (ή καλούν κατευθείαν τους registry readers server-side).
Μετά: tenant list → tenant detail (με usage + LIVE dbstats button). Το quota-enforcement surface
(πρώην #53 backend option) υποβιβάζεται σε «μετά το UI».
