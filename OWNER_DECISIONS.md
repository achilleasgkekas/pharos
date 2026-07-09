# Owner decisions — Pharos

Αποφάσεις Achilleas (interactive session 2026-07-07). Οι autonomous routines διαβάζουν
αυτό το αρχείο + τα inline gate markers στα progress logs. Στόχος: καθαρή ουρά εκτέλεσης
από **Πέμπτη 2026-07-09** (άνοιγμα limit), χωρίς no-op runs σε αναμονή απόφασης.

## Ενεργές αποφάσεις (έτοιμες προς εκτέλεση)

1. **Annual billing discount = ~17%** (2 μήνες δώρο στο ετήσιο). Ξεκλειδώνει το annual
   billing toggle στο landing pricing. Owner: **landing routine**.

2. **saasGuard σε 5 read/cron routes = DONE** (commit `d0c9364`). Κλειστό, καμία ενέργεια.

3. **SSRF IPv4-mapped bypass fix = APPROVED** (security). Στο `apps/web/src/lib/ssrf.ts`
   `ip6IsPrivate`: αποσυμπίεσε το IPv4-mapped hex (τελευταία 32 bits) σε dotted →
   `ip4IsPrivate`, ή απόρριψε ρητά κάθε `::ffff:*`. Μετά το fix, γύρνα τα «KNOWN GAP» tests
   στο `ssrf.test.ts` από `.resolves.toBeUndefined()` σε
   `.rejects.toThrow('Private address not allowed')`. Owner: **builder** (μηχανικό).

4. **Reset-request timing side-channel = CLOSE.** Κλείσε το enumeration latency-delta μεταξύ
   registered/non-registered στο `apps/web/src/app/api/saas/account/reset/request/route.ts`.
   Προτιμώμενος μηχανισμός: fire-and-forget `void sendEmail(...)` στο registered path (αφαιρεί
   το network-time gap, όπως το members invite route) ώστε και τα δύο paths να επιστρέφουν
   άμεσα. Το serverless cut-send risk είναι αποδεκτό (self-hosted target). Owner: **builder**.

5. **Landing app screenshots = ΜΗ μπλοκάρεις σε assets.** Χρησιμοποίησε tasteful placeholder
   mockups τώρα (browser frame + skeleton/gradient UI, brand παλέτα), swap σε πραγματικά
   screenshots όταν δώσει assets ο Achilleas. Owner: **landing routine**.

6. **SaaS pricing tiers = FINAL** (γράψε τα στο plan config + landing pricing table, swap τα placeholders):
   - **Free €0/μήνα** — 1 seat, 5 GB storage, 50 AI calls/μήνα.
   - **Pro €9/μήνα** — 5 seats, 50 GB, 1000 AI calls/μήνα.
   - **Dedicated €29/μήνα** — ∞ seats, 500 GB, ∞ AI calls.
   Annual = ~17% έκπτωση (2 μήνες δώρο, βλ. #1). Ξεκλειδώνει `PLAN_PRICES`/entitlements + landing
   pricing UI. Owner: **saas-core** (plan config/entitlements) + **landing** (pricing UI). Το
   `DEFAULT_AI_RATE` (κόστος ανά AI call για metering) μένει internal tuning — βάλε συντηρητικό
   default, δεν είναι user-facing.

7. **SaaS mobile app = SUPPORTED (map token→tenant).** Το `/api/v1` (Bearer/per-user API token)
   πρέπει να δουλεύει και για SaaS tenants: resolve το tenant ΑΠΟ το API token (ο token ανήκει σε
   User→tenant) και τρέξε το request μέσα σε `withTenant(ctx)`, ώστε `currentModel` + AI metering να
   χτυπάνε το σωστό tenant DB. Self-hosted = αμετάβλητο (default tenant). Owner: **saas-core**
   (token→tenant resolver στο v1 auth path· καθρέφτης του `withRequestTenant` για cookie sessions).

8. **Pharos product features APPROVED** (προάχθηκαν στο `PRODUCT_BACKLOG.md → ## Approved`· ο
   daily-dev τραβά ΜΟΝΟ από εκεί): **P2** bank/CSV import (expenses+income), **P4** net-worth
   time-series (snapshots+trend), **P10** return-window & warranty-claim tracker. Locked defaults:
   P2 = AI auto-categorise ΜΕΤΑ το import (όχι inline, ώστε το SaaS metering να μένει opt-in)· P4 =
   επιτρέπονται manual asset accounts + forward-only μηνιαία snapshots (cron)· P10 = default
   return-window 14 μέρες (EU), per-store editable, + badge «N μέρες για επιστροφή» στην κάρτα
   απόδειξης. Owner: **pharos-daily-dev**.

## Later (χρειάζεται στοιχεία/ενέργεια Achilleas — ΟΧΙ τώρα, αλλά πριν hosted launch)

- **Terms + Privacy finalize**: επωνυμία/νομική οντότητα, governing-law jurisdiction, ονόματα
  processors (Stripe / OneDrive / email provider). Μόλις δοθούν → finalize + flip
  `robots:{index:false}` σε indexable + add στο sitemap.
- **Contact inbox** `hello@ph-aros.com` setup (τα waitlist mailto δείχνουν εκεί).
- **GitHub repo public** + `git push --force origin main` (mbox purge εκκρεμεί), μετά flip
  `REPO_PUBLIC=true` (αλλιώς CTA/self-host links → 404).
- **Binary packaging export** (GDPR Art. 20): archive dependency + per-tenant storage isolation.
  Design decision· ξεκινά από Πέμπτη. Το manifest scaffold είναι ήδη έτοιμο.
- **Mailer provider** (SMTP ή Resend/Postmark): ξεκλειδώνει reset-email + invite-by-email +
  email verification.
- **getTenantConnection readyState guard** (P3, dead-until-SaaS): ambiguous rebuild-semantic,
  0 importers — δεν επείγει.
