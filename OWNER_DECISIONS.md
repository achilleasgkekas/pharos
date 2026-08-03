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
   > **⚠ SUPERSEDED εν μέρει από #11**: το «Free €0/μήνα» tier εδώ αφορούσε μόνιμο hosted δωρεάν
   > επίπεδο· η #11 (2026-08-03) το ακύρωσε ρητά («ΔΕΝ υπάρχει μόνιμο hosted δωρεάν επίπεδο»). Τα
   > €9/€29 tiers + entitlements μένουν όπως εδώ, ΑΠΛΑ χωρίς μόνιμο free hosted plan — μόνο 14ήμερο
   > trial πριν το €9/€29. Achilleas το επιβεβαίωσε ξανά interactive session 2026-08-03: «14 μέρες
   > trial. 9 και μετά 29 τα πακέτα ανά μήνα».

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

9. **`expo-camera` = ΕΓΚΕΚΡΙΜΕΝΟ** (interactive session 2026-07-27, «προχώρα όλα για το Pharos»). Ξεκλείδωσε το
   **P17** camera UI, που **shipped την ίδια μέρα** (commit `6b52023`, `apps/mobile/src/BarcodeScanner.tsx` +
   shopping-list wiring). Το ίδιο dep καλύπτει και ό,τι μελλοντικό χρειαστεί κάμερα (inventory scan, price logging).
   ΣΗΜ: το **P23** (share-sheet capture) παραμένει ξεχωριστό, γιατί δεν το μπλόκαρε η κάμερα αλλά το iOS Share
   Extension / Android intent filter, δηλαδή native config plugin + EAS dev build. **Εκκρεμεί ένα supervised πέρασμα
   σε φυσική συσκευή** για το P17: ο simulator δεν έχει κάμερα, το σκανάρισμα δεν επαληθεύεται unattended.

10. **Git: PATHSPEC COMMIT, όχι index** (interactive session 2026-07-27). Το `git add` **δεν είναι atomic** με το
   `git commit`, και ~11 routines μοιράζονται το index αυτού του repo, οπότε στο παράθυρο ανάμεσά τους το commit
   άλλης routine καταπίνει τα αρχεία σου. Συνέβη **δύο φορές την ίδια μέρα** (`0d5890c` πήρε ολόκληρο feature,
   `a6e39b8` πήρε το log entry άλλης routine). Ο documented collision guard ΔΕΝ το πιάνει αυτό, γιατί ελέγχει πριν
   ξεκινήσει η κούρσα. Λύση, εφαρμοσμένη ήδη και στα 12 Pharos task files: **`git commit -- <paths>`**, που παίρνει
   ΜΟΝΟ τα paths που ονομάζεις και αφήνει ό,τι άλλο είναι staged άθικτο, χωρίς lock και χωρίς αναμονή. Το `git add`
   επιτρέπεται ΜΟΝΟ για να εισαχθεί νέο (untracked) αρχείο, και μετά ξανά commit με τη μορφή `-- <paths>`.
   Επαληθεύτηκε εμπειρικά πριν γραφτεί. Owner: όλες οι routines.

11. **Pricing: ΔΕΝ υπάρχει μόνιμο hosted δωρεάν επίπεδο** (interactive session 2026-08-03). «Αν επιλέξει
   self-host είναι free, αλλιώς free trial 14 μέρες». Δηλαδή το «δωρεάν για πάντα» ΕΙΝΑΙ το **self-host**
   (AGPL, δικό του hardware, μηδέν όριο από εμάς)· το **hosted** ξεκινά με 14ήμερο trial και μετά είναι
   πληρωμένο (€9 ή €29). Κλείνει την `pharos-landing-20260729-1000` ως **(β)**: η landing σταματά να δείχνει
   κάρτα «Free» ως hosted tier και γίνεται δίπολο «Self-hosted €0 για πάντα» vs «Hosted: 14 μέρες δοκιμή,
   μετά €9/€29»· το FAQ που ήδη περιγράφει το suspend ήταν εξαρχής σωστό. **Το backend μένει ΑΜΕΤΑΒΛΗΤΟ**:
   το σημερινό `provision.ts` (plan:free + status:trialing 14d → suspended χωρίς κάρτα) είναι το επιθυμητό
   lifecycle, ΔΕΝ χρειάζεται downgrade path «trial → μόνιμο free» (ήταν η επιλογή (α), απορρίφθηκε). Το
   `plan:'free'` του `plans.ts` σημαίνει «το πλάνο κατά τη διάρκεια του trial». Owner: **pharos-landing**
   (copy), **pharos-saas-core** (μόνο αν κάπου το UI λέει «free forever» για hosted).

12. **Έξι product features APPROVED** (interactive session 2026-08-03, «approve all όπως είναι, τα προχωράς»):
   **P81** auto-trigger του alert engine (`CRON_SECRET` route· το ήδη-shipped notification framework με 8 alert
   kinds δεν τρέχει ΠΟΤΕ μόνο του σήμερα, μόνο από το χειροκίνητο κουμπί), **P66** AI assistant coverage gap
   (searchAll 7 μοντέλα, `modelFor` μόλις 3 — Bills/Goals/GiftCards/LoyaltyCards/ShoppingList αόρατα),
   **P74** backup restore verification, **P48** storage mirror sync-staleness alert, **P46** expense duplicate
   detection & merge, **P40** self-host update-available banner. Όλα S, με αυτή τη σειρά, προάχθηκαν στο
   `PRODUCT_BACKLOG.md → ## Approved`. **Τα builder defaults του κάθε item εγκρίθηκαν ως έχουν** («όπως είναι»),
   άρα καμία ανοιχτή απόφαση δεν μένει σε αυτά τα έξι: ο builder υλοποιεί το «Ανοιχτή απόφαση (builder default)»
   πεδίο τους αυτούσιο χωρίς να ξαναρωτήσει. Owner: **pharos-daily-dev**.

13. **P36 / P16 = παγωμένα· P23 = ενεργό** (interactive session 2026-08-03, μετά από εξήγηση του τι είναι το
   καθένα — ο Αχιλλέας είχε πει ρητά ότι δεν τα ήξερε, άρα η αρχική έγκριση της 2026-07-10 δεν ήταν informed).
   - **P36** (Open Banking auto-sync μέσω GoCardless): «**θα γίνει πολύ αργότερα**». Παγωμένο. Κανένα routine
     δεν το ξεκινά, **και κανένα δεν το ξαναφέρνει ως «blocked σε εσένα» σε κάθε run** (ήταν μόνιμος θόρυβος
     στα Needs-Achilleas headings). Θα ξαναμπεί σε συζήτηση μόνο με δική του πρωτοβουλία.
   - **P16 remainder** (Firefly III / Grocy importers): «**αργότερα**». Ίδιο πάγωμα, ίδιος κανόνας σιωπής.
     ΣΗΜ: το YNAB κομμάτι είναι ήδη SHIPPED (2026-07-19), δεν το αγγίζει αυτό.
   - **P23** (mobile share-sheet quick capture): **ΕΝΕΡΓΟ, μένει στο Approved μαζί με τα έξι νέα.** Ο builder
     **προχωρά όσο πάει χωρίς τον Αχιλλέα**: config plugin (iOS Share Extension / Android intent filter), το
     receiving screen, και το wiring στο ήδη-υπάρχον `/api/v1` upload path. Το όριο είναι το **EAS dev build +
     δοκιμή σε φυσική συσκευή** (το Expo Go δεν φορτώνει share extensions, ο simulator δεν δέχεται share intents),
     που τα κάνει ο Αχιλλέας. Άρα το item τερματίζει ως «code complete, awaiting EAS build», ΟΧΙ ως «δεν ξεκίνησε».
     Builder default (ήδη στο item): shared αρχείο → Receipts, χωρίς picker στην πρώτη έκδοση. **Ανοιχτό**: το iOS
     μισό θέλει Apple Developer account (€99/χρόνο) για build σε συσκευή· το Android μισό όχι. Αν δεν υπάρχει
     account, χτίζεται πρώτα το Android intent filter και το iOS μένει στο ράφι.
   Owner: **pharos-daily-dev**.

14. **Suspended-workspace retention window = 30 μέρες** (interactive session 2026-08-03, digest
   follow-up). Ερώτημα ήταν στο `LANDING_PROGRESS.md`/`OWNER_DECISIONS.md → Later` ως «Needs
   Achilleas» χωρίς αριθμό. Ο Αχιλλέας απάντησε «30». Σημασία: μια `suspended` (dunning hold,
   `trialSweep.ts`/`trialLapse.ts`) tenant μένει σήμερα suspended **επ' αόριστον** χωρίς κανένα
   auto-purge — καμία sweep δεν διαγράφει ποτέ tenant data. Η απόφαση εδώ: **30 μέρες μετά το
   `workspace.suspended` audit event, αν η tenant ΔΕΝ έχει επανέλθει σε active/trialing, σβήσε
   (ή τουλάχιστον flag για hard-delete) το tenant data.** Δεν υλοποιώ εγώ το ίδιο το sweep σε αυτό
   το session (destructive cascade πάνω σε tenant DBs, θέλει το κανονικό test/verify discipline
   μιας routine, όχι ad-hoc edit)· καταγράφω μόνο την απόφαση ώστε η **saas-core** routine να την
   πάρει ως δεδομένη στο επόμενο σχετικό run: νέο scheduled sweep (μαζί με το ήδη-shipped
   `trials/sweep`) που μετράει μέρες από `workspace.suspended` audit row, με **audit trail πριν
   κάθε delete** και προτιμότερο soft-delete/archive πρώτα (matching το ήδη-υπάρχον `TRASH_RETENTION_DAYS`
   pattern στο `settings/actions.ts`, ΑΝ εφαρμόζεται σε tenant-level granularity) αντί για hard
   DB drop χωρίς recovery window. Owner: **saas-core**.

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
