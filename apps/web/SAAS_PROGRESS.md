
---

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
