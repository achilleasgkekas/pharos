# PHAROS — Product Backlog (προτάσεις προϊόντος)

> Ρόλος: ο **product-planner** ΠΡΟΤΕΙΝΕΙ candidate features, ο Αχιλλέας ΑΠΟΦΑΣΙΖΕΙ.
> Αυτό συμπληρώνει (δεν αντικαθιστά) το `TODO.md` (distribution/SaaS roadmap) και τις
> ουρές τεχνικού χρέους (`WEB_DEBT.md`, `MOBILE_PARITY.md`), που καλύπτουν code debt, όχι νέα features.
> **Τίποτα στο «Proposed» δεν χτίζεται μέχρι ο Αχιλλέας να το μετακινήσει στο «Approved».**
> Οι builder routines τραβάνε ΜΟΝΟ από το «Approved». Το split OSS vs paid είναι δική του απόφαση.
> Σύμβολα μεγέθους: S (μικρό) · M (μεσαίο) · L (μεγάλο). Track: OSS / SaaS / both.
> Τελευταία ενημέρωση: 2026-08-04 (26η σάρωση planner).
> **⚑ ΜΑΖΙΚΗ ΕΓΚΡΙΣΗ 2026-07-09/10 (Αχιλλέας, interactive):** τα P1/P3/P5-P36 (+ PA1-PA3) εγκρίθηκαν όλα εν μαζώ
> και έχουν πλέον σχεδόν ολοκληρωτικά shippαριστεί από τον builder (βλ. `PROGRESS.md` για το πλήρες ιστορικό
> ανά σάρωση — συμπιέστηκε εδώ, git blame αυτού του αρχείου κρατά τις παλιές καταχωρήσεις).
> **Standing κατάσταση (20ή σάρωση, 2026-07-29):** το «Approved» queue παραμένει ουσιαστικά χωρίς αυτόνομα-
> buildable items — μόνο P36 (Open Banking, blocked σε provider decision), P31 (household multi-user — ήδη
> SHIPPED 2026-07-27, βλ. `## Approved`, live check με τρεις ρόλους ακόμα εκκρεμεί), P16 remainder (Firefly
> III/Grocy importers, χρειάζεται πραγματικό sample file), **P9** (multi-currency — πλέον σχεδόν πλήρες, μόνο ο
> προαιρετικός rate-feed/`resolveFx` στα imports απομένει), **P17** (camera UI ήδη SHIPPED 2026-07-27, βλ.
> `## Approved` — εκκρεμεί μόνο ένα supervised πέρασμα σε φυσική συσκευή, ο simulator δεν έχει κάμερα, βλ.
> `OWNER_DECISIONS.md` #9), P23 (share-sheet capture, χρειάζεται native config plugin + EAS dev build, ξεχωριστό
> από το P17 blocker) μένουν τεχνικά ανοιχτά αλλά κανένα δεν είναι «απλώς χτίσ' το» unattended. Σημ.: το
> `ASK_ACHILLEAS.md` που ανέφεραν προηγούμενες σαρώσεις **δεν υπάρχει πια στο repo** (verified `find` — 0 hits),
> η απάντησή του μάλλον απορροφήθηκε στο `OWNER_DECISIONS.md` (#9, interactive session 2026-07-27)· διόρθωσα το
> stale reference εδώ, καμία άλλη ενέργεια χρειάζεται.
> **Καμία ρητή έγκριση Proposed→Approved σε 15 διαδοχικές σαρώσεις** — το batch-review πρόταση της 16ης σάρωσης
> παραμένει σε ισχύ και ενισχύεται· το Proposed queue έφτασε **33 items (P37-P74, εξαιρουμένου του P63 που
> μετακινήθηκε στο `## Done` σε προηγούμενη σάρωση — ήταν ήδη SHIPPED αλλά είχε μείνει σωματικά στο Proposed section)**.
> Ζωντανό grep σε κάθε σάρωση επιβεβαιώνει ότι κανένα Proposed item δεν έχει χτιστεί εν τω μεταξύ χωρίς ρητή
> έγκριση (re-verified 20ή σάρωση: `verifyBackup`/`trackingNumber`/split σε Subscription μοντέλο = 0 hits, όλα
> ακόμα genuinely unbuilt — δες παρακάτω τα 3 νέα P72-P74). Σημ. (16η σάρωση, ισχύει ακόμα): το `/network` (UniFi)
> module αφαιρέθηκε ρητά από το codebase (commit `5eb912d`, "Strip personal info" pivot) — μην ξαναπροταθεί
> δικτυακό/hardware monitoring, `docs/features.md` έχει ακόμα stale αναφορά (docs-debt, όχι product backlog item).
> Δεδομένου του μεγέθους της ουράς (33 proposed, μηδέν έγκριση σε 15 σαρώσεις), το πιο χρήσιμο επόμενο βήμα είναι
> πλέον ένα **interactive batch-review με τον Αχιλλέα** (ίδιο idiom με το batch approval 2026-07-09/10 των P1/P3/
> P5-P36) παρά νέα προτεινόμενα items — ο planner θα συνεχίσει να προσθέτει μικρό αριθμό (≤3-5) νέων candidates
> ανά σάρωση όπως ζητά το task file, αλλά ο ρυθμός εύρεσης πλέον ξεπερνά κατά πολύ τον ρυθμό απόφασης.
> **19η σάρωση (2026-07-28) — 3 νέοι candidates P69-P71**, και οι τρεις live-verified με grep/read κώδικα:
> (1) **P71** — υπάρχει ήδη ένα έτοιμο AES-256-GCM primitive (`lib/tenancy/secretCrypto.ts`, σήμερα μόνο για το
> SaaS BYO-key) αλλά **κανένα** module για μικρά προσωπικά text-secrets (WiFi/router/NAS admin logins, license
> keys) — μόνο το P21 file-vault υπάρχει, verified `grep -rn "vault\|SecretNote" apps/web/src/models`. (2) **P70**
> — το `Item.specs` είναι ένα ενιαίο free-text blob, **μηδέν structured key-value πεδίο** (verified grep), οπότε
> ένα hardware-heavy inventory (δίκτυο/Battle Station, CLAUDE.md) δεν μπορεί να φιλτράρει by συγκεκριμένο attribute
> (MAC/serial/rack-unit). (3) **P69** — το Reports monthly-spend chart είναι μόνο rolling window (6/12/24 μήνες),
> **καμία** year-over-year σύγκριση ίδιου μήνα (verified `grep -rn "yoy\|previousYear\|lastYear"` = 0 hits) — με
> δύο σπίτια εποχιακά διαφορετικά (P34), «είναι αυτό φυσιολογικό για την εποχή;» δεν απαντιέται σήμερα.
> **20ή σάρωση (2026-07-29) — 3 νέοι candidates P72-P74**, και οι τρεις live-verified με grep (μηδέν hits πριν
> την πρόταση, όχι απλά «νομίζω ότι λείπει»): (1) **P74** — καμία μεταφορά δεν επαληθεύει ότι ένα backup αρχείο
> είναι όντως restorable (`grep -rn "verifyBackup\|backupHealth\|restoreTest\|integrityCheck"` = 0 hits)· το ήδη-
> shipped `exportData`/`backup.sh` γράφει το αρχείο αλλά ποτέ δεν το ξανα-διαβάζει για να επιβεβαιώσει ότι είναι
> έγκυρο, διακριτό από P54 (encryption-at-rest) και P48 (mirror-sync staleness — αυτό είναι για το ίδιο το
> περιεχόμενο, όχι για το αν έφτασε στο remote). (2) **P73** — το `Subscription` model έχει μηδέν split πεδίο
> (`grep -n "split\|Split" models/Subscription.ts` = 0 hits) ενώ το `lib/split.ts` (P35, ήδη-shipped, pure/DB-free)
> καλύπτει ήδη ακριβώς αυτό το σχήμα για Expenses — μια οικογενειακή συνδρομή (Netflix/Spotify family plan) που
> μοιράζεται με σπίτι/φίλους δεν έχει σήμερα κανέναν τρόπο να δείξει «ποιος χρωστάει τι ανά κύκλο» χωρίς να
> περνά χειροκίνητα από Expenses κάθε φορά. (3) **P72** — το `Item.status` έχει ήδη `'ordered'` state (verified
> `ITEM_STATUSES` στο `models/Item.ts`) αλλά **κανένα** πεδίο tracking number/carrier/delivery-status
> (`grep -rn "trackingNumber\|carrier\|shipment\|deliveryStatus"` = 0 hits, web + mobile) — ένα shopping item σε
> "ordered" είναι σήμερα ένα μαύρο κουτί μέχρι να φτάσει, καμία σύνδεση με το πραγματικό courier tracking.
> **21η σάρωση (2026-07-30) — μόνο 2 νέοι candidates αυτή τη φορά (P75-P76), σκόπιμα λιγότεροι από το συνηθισμένο
> 3-5**: η ουρά έφτασε 35 items χωρίς καμία έγκριση σε 16 σαρώσεις, οπότε προτιμήθηκαν δύο **στενά-scoped
> follow-ups πάνω σε ήδη-shipped δουλειά** (χαμηλότερο ρίσκο decision-fatigue από νέα ανεξάρτητα features).
> Και οι δύο live-verified με grep, μηδέν hits πριν την πρόταση: (1) **P75** — το P31 (household multi-user,
> shipped 2026-07-27) έγραφε ρητά στο δικό του value prop «...+ ρόλους + "ποιος καταχώρησε τι" attribution»,
> αλλά το πραγματικά-shipped slice κάλυψε μόνο τον 3ο ρόλο (`viewer`) + write-guard enforcement — το attribution
> κομμάτι έμεινε 0% (`grep -rln "createdBy" apps/web/src/models` = 0 hits, ΚΑΙ μετά το ship). Δεν είναι νέο
> feature, είναι το μισό ενός ήδη-εγκεκριμένου item που δεν έφτασε ποτέ σε νέο backlog entry. (2) **P76** —
> κανένα mechanism «δώσε πρόσβαση σε έμπιστο άτομο αν μου συμβεί κάτι» (`grep -rln "emergencyAccess\|
> legacyContact\|trustedContact\|deadManSwitch"` apps/web apps/mobile = 0 hits) — καθιερωμένο pattern σε
> password managers (1Password Emergency Kit, Bitwarden Emergency Access) που ταιριάζει φυσικά στο ήδη-
> προτεινόμενο P71 (secrets vault) + P42 (document expiry) και στο ίδιο το "Personal Hub" backronym, αλλά
> ανεξάρτητο feature ό,τι κι αν αποφασιστεί για το P71.
>
> **22η σάρωση (2026-07-31)** — έλεγξα `git log --since` από την 21η σάρωση (marker `4c8268b`): μηδέν νέο shipped
> feature να συμφιλιωθεί εδώ, η δουλειά του builder ήταν αποκλειστικά **SaaS multi-tenancy plumbing** (tenant-
> scoped connections σε notifications/statements) + test coverage, όχι backlog items — καμία μετακίνηση σε Done
> χρειάζεται. Η ουρά παραμένει στα **35 Proposed, μηδέν έγκριση σε 17 διαδοχικές σαρώσεις** — το ίδιο decision-
> fatigue σημείο που σημείωσε η 20ή/21η σάρωση παραμένει το πραγματικό bottleneck, όχι έλλειψη candidates. Αντί
> να προσθέσω ξανά 3-5 ανεξάρτητα νέα items πάνω σε μια ήδη-υπερφορτωμένη λίστα, **μόνο 1 νέο item αυτή τη φορά**
> (P77, live-verified gap) + ένα μικρό **quick-start shortlist** πιο κάτω με τα 5 χαμηλότερου-ρίσκου items της
> ουράς (καθαρά additive, καμία νέα εξάρτηση, ίδιο "άδειο = καμία αλλαγή" idiom με όλα τα ήδη-shipped batches) —
> ΟΧΙ μετακίνηση σε Approved (αυτό παραμένει αποκλειστικά δικό του call), απλά μια πρόταση σειράς αν θελήσει να
> ξανακάνει ένα batch-review σαν το 2026-07-09/10. **P77** — verified `grep -rln "healthcheck\|health-check\|
> diagnostics\|/system-health" apps/web/src` = 0 hits (το ένα false-positive hit σε `expenses/actions.ts` είναι
> άσχετο, unrelated string match): το Settings έχει ήδη ξεχωριστά «Test connection» κουμπιά ανά integration
> (UniFi ήδη αφαιρέθηκε, SMB/FTP/OneDrive/AI provider όμως ναι) αλλά **καμία ενιαία σελίδα** που να δείχνει «είναι
> το deployment μου υγιές» με μια ματιά — καθαρό self-host adoption/troubleshooting lever, διακριτό από το ήδη-
> proposed P40 (update-available banner, μόνο version check).
>
> **🗂 Quick-start shortlist (πρόταση σειράς, ΟΧΙ approval)** — αν ο Αχιλλέας θέλει να σπάσει το μπλοκάρισμα με
> ένα μικρό batch αντί να διαβάσει όλα τα 36, αυτά τα 5 είναι τα πιο «χαμηλού ρίσκου, καθαρά additive, μηδέν νέα
> απόφαση αρχιτεκτονικής» της ουράς (όλα S, όλα «κενό = καμία αλλαγή συμπεριφοράς»): **P74** (backup verify),
> **P40** (update-available banner), **P46** (expense duplicate detection, mirror ήδη-shipped receipts pattern),
> **P66** (AI assistant model-coverage gap, καθαρό consistency fix σε ήδη-δουλεμένο pipeline), **P48** (mirror
> sync-staleness alert). Δεν είναι «οι πιο value-πυκνές» υποχρεωτικά, είναι οι πιο **εύκολες να εγκριθούν χωρίς
> σκέψη** — ό,τι μπορεί να ξεμπλοκάρει τη ροή.
>
> **23η σάρωση (2026-08-01)** — `git log --since` από την 22η σάρωση (marker επιβεβαιωμένος `dc51c6f`): η δουλειά
> του builder παρέμεινε αποκλειστικά **SaaS tenant-scoping plumbing** (notifications/subscriptions actions +
> ένα write-guard gap που έκλεισε στο `2b203b7`) + test coverage — μηδέν νέο product-facing feature να
> συμφιλιωθεί σε Done. Μία διόρθωση όμως χρειαζόταν: το **P9** (multi-currency) έγραφε ακόμα «εκκρεμεί το
> προαιρετικό rate-feed» ενώ το `SAAS_PROGRESS.md` (2026-08-01 entry) σημείωνε ρητά ότι αυτός ο τίτλος είναι stale
> — live-verified εδώ (`lib/fxRates.ts`/`app/fxRateActions.ts` + `FxRateButton` wired σε **6/6** clients: bills/
> expenses/items/receipts/statements/subscriptions) → το P9 entry ενημερώθηκε σε πλήρως SHIPPED. **1 νέο
> candidate (P78)**, live-verified με grep πριν την πρόταση (bulk field-edit λείπει από Items πέρα από AI-fill/
> merge, και λείπει εντελώς από Expenses — select-mode δεν υπάρχει καν εκεί). Η ουρά παραμένει στα **36 Proposed,
> μηδέν έγκριση σε 18 διαδοχικές σαρώσεις** — το ίδιο decision-fatigue bottleneck της 20ής-22ης σάρωσης, το quick-
> start shortlist παραπάνω παραμένει η πιο πρακτική πρόταση αν θελήσει να ξεμπλοκάρει με ένα μικρό batch.
>
> **24η σάρωση (2026-08-02)** — `git log --since` από την 23η σάρωση (marker επιβεβαιωμένος `d4b98b5`): η δουλειά
> του builder παρέμεινε πάλι αποκλειστικά **SaaS tenant-scoping plumbing** (tasks actions + read path, `9513644`)
> + test coverage (i18nActions) + ένα landing docs-consistency fix (`humans.txt`) — μηδέν νέο product-facing feature
> να συμφιλιωθεί σε Done. **2 νέοι candidates (P79-P80)**, και οι δύο live-verified με grep πριν την πρόταση: (1)
> **P79** — υπάρχει ήδη ένα πλήρες TOTP/MFA primitive (`lib/tenancy/totp.ts`, `lib/tenancy/recoveryCodes.ts`,
> `lib/tenancy/mfaStore.ts`) αλλά χρησιμοποιείται **αποκλειστικά** από το SaaS `Account`/`api/saas/auth/mfa` —
> το self-host `models/User.ts` (login μέσω `/login` + `api/v1/auth/login`) έχει **μηδέν** MFA πεδίο (verified
> `grep -n "mfa|totp|MFA" apps/web/src/models/User.ts` = 0 hits). Ένα self-hosted instance εκτεθειμένο μέσω
> WireGuard/reverse-proxy σήμερα προστατεύεται μόνο από password — καθαρό trust-lever gap, ίδιο primitive ήδη
> proven στο SaaS side, καμία νέα κρυπτογραφική δουλειά. (2) **P80** — το ήδη-shipped P24 (outbound webhooks,
> `lib/webhooks.ts`) κάνει **fire-once, καμία retry λογική, κανένα delivery log** (verified `grep -n "retry|
> attempt|deliveryLog|history" lib/webhooks.ts` = μόνο 1 άσχετο hit, `results.filter(...status===fulfilled)`
> που είναι απλά το `Promise.allSettled` per-call αποτέλεσμα, όχι persisted ιστορικό) — αν ένα Home Assistant/n8n
> endpoint είναι προσωρινά down, η ειδοποίηση χάνεται σιωπηλά χωρίς κανένα ίχνος. Η ουρά έφτασε **38 Proposed,
> μηδέν έγκριση σε 19 διαδοχικές σαρώσεις** — το ίδιο decision-fatigue bottleneck παραμένει, το quick-start
> shortlist πιο πάνω (P74/P40/P46/P66/P48) συνεχίζει να είναι η πιο πρακτική πρόταση αν θελήσει ένα μικρό batch.
>
> **25η σάρωση (2026-08-03)** — `git log --since` από την 24η σάρωση (marker `a62482b`): η δουλειά του builder
> παρέμεινε πάλι αποκλειστικά **SaaS tenant-scoping plumbing** (shopping-list actions + read path, `83d0271`) +
> ένα docker-health rebuild-validation log + ένα landing dual-positioning fix + saas platform-audit UI (quick-window
> chips) + ένα storage test slice — μηδέν νέο product-facing feature να συμφιλιωθεί σε Done. **1 νέος candidate
> (P81)**, live-verified πριν την πρόταση και το πιο σημαντικό εύρημα εδώ αρκετών σαρώσεων: το πλήρες, ήδη-shipped
> notification framework (§3 στο TODO.md· 8 alert kinds: deal/installment/warranty/pricehike/trialend/giftcard/bill
> + budget, `runAlertChecks` στο `app/settings/actions.ts`) **δεν πυροδοτείται ΠΟΤΕ αυτόματα** — `grep -rn
> "runAlertChecks" apps/web/src/app/api` = 0 hits, το μόνο call-site είναι το χειροκίνητο κουμπί «Check & notify
> now» στο `SettingsClient.tsx`. Ταυτόχρονα υπάρχει ήδη ένα δουλεμένο, tested pattern για ακριβώς αυτή τη δουλειά
> στο SaaS side: `CRON_SECRET`-gated routes (`app/api/saas/usage/sample/route.ts`, `app/api/saas/trials/sweep/
> route.ts`) που περιμένουν εξωτερικό cron να τα χτυπήσει με bearer token — απλά δεν έχει επεκταθεί ποτέ στο
> self-host alert engine, παρόλο που το ίδιο το CLAUDE.md το σημείωνε ήδη ως «μελλοντικό» στο Session 2026-06-07
> («δόσεις/warranty alerts δουλεύουν manual ή με cron [μελλοντικό]») και έμεινε ανοιχτό έκτοτε χωρίς να γίνει ποτέ
> δικό του backlog item. Η ουρά έφτασε **39 Proposed, μηδέν έγκριση σε 20 διαδοχικές σαρώσεις** — το ίδιο
> decision-fatigue bottleneck παραμένει, το quick-start shortlist πιο πάνω (P74/P40/P46/P66/P48) συνεχίζει να είναι
> η πιο πρακτική πρόταση αν θελήσει ένα μικρό batch. Σημείωση: το P81 θα άξιζε να μπει ΚΑΙ στο shortlist (ίδιο
> «χαμηλού ρίσκου, καθαρά additive» προφίλ, reuse ατόφιου pattern) αλλά δεν το πρόσθεσα εκεί μόνος μου — το
> shortlist είναι ήδη μια πρόταση σειράς, η επέκτασή του μένει στον Αχιλλέα.
>
> **26η σάρωση (2026-08-04)** — `git log --since` από την 25η σάρωση (marker `a62482b`, μέχρι το σημερινό HEAD
> `750bb30`): το «approve all» της 3ης Αυγ **δούλεψε** — ο builder κατανάλωσε πλέον ενεργά την ουρά, **P81
> (αυτόματο cron trigger, `fda8c96`) και P66 (AI βλέπει όλα τα modules, `d774dd4`) και P74 (backup verify, `60d25f4`)
> shipped** και ήδη συμφιλιωμένα στο `## Approved` παρακάτω (κανένα νέο reconciliation χρειάζεται εδώ). Το
> decision-fatigue bottleneck των προηγούμενων 20 σαρώσεων έσπασε· η ουρά είναι πλέον ενεργά buildable, οπότε
> επέστρεψα στο κανονικό ρυθμό προτάσεων (**3 νέα candidates, P82-P84**) αντί του περιορισμένου 1-2 των σαρώσεων
> 22-25. Και τα τρία live-verified με grep πριν την πρόταση: (1) **P82** — το πλέον-ενεργό (μετά το P81) automatic
> cron σκανάρει και ξαναστέλνει το **ίδιο** ntfy/Discord/Slack/Telegram/push μήνυμα σε ΚΑΘΕ πυροδότηση όσο μια
> συνθήκη μένει true (`runAlertChecks` καλεί `dispatchAlert()` unconditionally όποτε `lines.length`, μηδέν
> σχέση με το ήδη-υπάρχον `dedupeKey` σύστημα του bell) — πρόβλημα που ουσιαστικά δεν υπήρχε πριν το P81 (κανείς
> δεν έτρεχε το check ξανά και ξανά αυτόματα), τώρα είναι σχεδόν βέβαιο side-effect του «point any cron at it».
> (2) **P83** — το ίδιο το P12 (savings goals, shipped) καταγράφει ρητά στο δικό του «Builder default»: «auto-feed
> από κατηγορία = phase 2, δεν χτίστηκε» (βλ. `## Approved` P12 παρακάτω) — ποτέ δεν έγινε δικό του backlog item,
> ίδιο μοτίβο με το P75 (μισό ενός shipped item που δεν προωθήθηκε). Το ήδη-shipped P25 (budget rollover) υπολογίζει
> ήδη το αδιάθετο υπόλοιπο ανά κατηγορία/μήνα — φυσικό ζευγάρωμα, καμία νέα λογική υπολογισμού. (3) **P84** —
> `Card.creditLimit` είναι ήδη πεδίο, ήδη εμφανίζεται στατικά («€3000 limit», `StatementsClient.tsx:1482`), αλλά
> `grep -n "creditLimit|outstanding|utilization" StatementsClient.tsx` δείχνει **καμία** σύγκριση με το πραγματικό
> outstanding balance (που υπολογίζεται ήδη αλλού στο ίδιο αρχείο) — μηδέν badge, μηδέν alert-engine entry, παρόλο
> που το CLAUDE.md δείχνει multi-card installment management ως ενεργό use case του χρήστη.

---

## Proposed (awaiting Αχιλλέας)

> Δεν χτίζονται μέχρι να μετακινηθούν στο «Approved» από τον Αχιλλέα.

### P84. Credit card utilization warning (creditLimit vs πραγματικό outstanding) — S — OSS (κυρίως), dogfooding-heavy
- **Αξία:** live-verified: το `Card.creditLimit` (`statements/cards.ts`) αποθηκεύεται και εμφανίζεται ήδη στατικά
  δίπλα στο όνομα της κάρτας (`StatementsClient.tsx:1482`, π.χ. «€3000 limit»), αλλά ποτέ δεν συγκρίνεται με το
  πραγματικό outstanding balance που το ίδιο αρχείο ήδη υπολογίζει ανά κάρτα (`balance`/`t('st.outstanding')`,
  γραμμή 230) — μηδέν utilization %, μηδέν χρωματικό warning, και **καμία** entry στο `runAlertChecks` (8 ήδη
  υπάρχοντα alert kinds, κανένα card-limit). Ο χρήστης διαχειρίζεται ήδη πολλαπλές κάρτες με ενεργά δωδεκάμηνα
  installment plans (CLAUDE.md, Εθνική Mastercard 7791 + άλλη) — «πόσο κοντά είμαι στο όριο μιας κάρτας» είναι
  σήμερα κάτι που πρέπει να υπολογίσει νοερά, βλέποντας δύο ξεχωριστούς αριθμούς. Νέο μικρό: υπολογισμένο
  `utilizationPct = outstanding / creditLimit` όταν `creditLimit > 0`, χρωματιστό badge (ίδιο idiom με τα ήδη-
  υπάρχοντα temp/channel-utilization χρωματικά κατώφλια αλλού στο repo) όταν ≥80%/≥95%, + προαιρετική νέα γραμμή
  στο `runAlertChecks` summary (ίδιο pattern με τα υπόλοιπα 8 alert kinds, dedupeKey-ready αν εγκριθεί μαζί με το P82).
- **Module:** `app/statements/StatementsClient.tsx` (badge στην κάρτα) + `app/settings/actions.ts` `runAlertChecks`
  (νέα προαιρετική γραμμή, reuse του ήδη-υπολογισμένου outstanding-per-card).
- **Ανοιχτή απόφαση (builder default):** MVP = μόνο UI badge (κενό `creditLimit` = καμία αλλαγή, ίδιο idiom με τα
  υπόλοιπα optional πεδία)· το alert-engine κομμάτι follow-up ώστε το πρώτο slice να μείνει S· κατώφλια 80%/95%
  σταθερά αρχικά, χωρίς νέο per-card setting (αποφυγή over-engineering ενός S item).

### P83. Goal auto-contribution από αδιάθετο υπόλοιπο budget (P25 rollover → P12 goal) — S/M — OSS, dogfooding-heavy
- **Αξία:** live-verified: το ίδιο το P12 (savings goals, ήδη shipped) καταγράφει ρητά στο δικό του «Builder
  default τηρήθηκε»: «πολλά ταυτόχρονα goals· manual contributions μόνο (**auto-feed από κατηγορία = phase 2,
  δεν χτίστηκε**)» — ποτέ δεν προωθήθηκε σε δικό του backlog item έκτοτε (`grep -n "auto-feed" PRODUCT_BACKLOG.md`
  = μόνο η ίδια η αρχική σημείωση). Το ήδη-shipped P25 (budget rollover/envelope mode) υπολογίζει ήδη το αδιάθετο
  υπόλοιπο ανά κατηγορία/μήνα — αν κάποιος έβαλε budget «groceries €400» και ξόδεψε €340, τα €60 σήμερα απλά
  κάθονται εκεί, χωρίς κανέναν τρόπο να ρέουν αυτόματα σε έναν ενεργό στόχο (π.χ. το sailing-trip fund, CLAUDE.md).
  Καθαρό ζευγάρωμα δύο ήδη-shipped μηχανισμών, μηδέν νέος υπολογισμός: μηνιαίο (ή manual «sweep now») transfer
  του leftover-rollover μιας επιλεγμένης κατηγορίας σε μια `GoalContribution` εγγραφή.
- **Module:** `models/Goal.ts` (καμία αλλαγή σχήματος, reuse `GoalContributionSchema`) + Reports/Budget rollover
  UI (νέο «sweep to goal» action) + optional monthly auto-run.
- **Ανοιχτή απόφαση (builder default):** MVP = **manual** «sweep this month's leftover to…» κουμπί (ίδιο idiom
  με το ήδη-υπάρχον 1-click «∑ items»/«Log a price» pattern) πάνω στο ήδη-υπάρχον rollover UI· πλήρως αυτόματο
  μηνιαίο sweep ως follow-up μόνο αν το manual flow αποδειχτεί χρήσιμο (αποφυγή σιωπηλής μετακίνησης χρημάτων
  μεταξύ «κουτιών» χωρίς να το δει πρώτα ο χρήστης)· κενό/άδειο leftover = καμία αλλαγή συμπεριφοράς.

### P82. Outbound alert notifications δεν έχουν per-item dedup (το bell έχει, τα ntfy/Discord/κλπ όχι) — S — OSS (κυρίως), άμεσο follow-up του P81
- **Αξία:** live-verified `app/settings/actions.ts` `runAlertChecks()`: το in-app bell περνά από `generateNotifications()`
  (`app/notifications/actions.ts`), που έχει ήδη πλήρες `dedupeKey`-based σύστημα (`deal:<id>`, `warranty:<id>`,
  `bill:<id>:<date>` κλπ — γραμμή 190-212, μόνο **νέα** ή **αλλαγμένη** κατάσταση δημιουργεί entry). Αλλά η
  **outbound** ειδοποίηση (`dispatchAlert('Pharos alerts', summary)`, γραμμή 630) είναι εντελώς ξεχωριστός κώδικας
  που φτιάχνει ένα text summary και το στέλνει σε ntfy/Discord/Slack/Telegram/webhook + push **unconditionally**
  όποτε `lines.length > 0` — **μηδέν** σχέση με το dedupeKey σύστημα του bell (verified: η κλήση `dispatchAlert`
  δεν περνά κανένα dedup state, καμία αναφορά dedupeKey σε αυτό το block). Αυτό ήταν αβλαβές όσο η μόνη πυροδότηση
  ήταν το χειροκίνητο κουμπί «Check & notify now» (ο χρήστης το πατά όποτε θέλει), αλλά **το ίδιο το P81** (shipped
  χθες, 2026-08-03) έγραψε ρητά «cadence is the operator's — point any cron at it». Αν ο Αχιλλέας βάλει ένα daily/
  hourly cron (η προφανής χρήση του P81), θα παίρνει το **ίδιο ακριβώς** «🛡 3 warranty expiring ≤90d: X (45d)»
  ntfy push σε κάθε πυροδότηση μέχρι να λήξει η εγγύηση ή να πληρωθεί το bill — notification fatigue που οδηγεί
  σε mute του καναλιού, ακυρώνοντας το ίδιο το feature που μόλις χτίστηκε. Reuse ατόφιο του ήδη-υπάρχοντος
  `dedupeKey` schema/κατώφλια logic (ήδη σχεδιασμένο ανά alert kind), απλά εφαρμοσμένο και στο outbound path.
- **Module:** `app/settings/actions.ts` (`runAlertChecks`, το `dispatchAlert` call site) + reuse
  `app/notifications/actions.ts` dedupeKey helpers/computation (ίδια alerts array, δεύτερο consumer).
- **Ανοιχτή απόφαση (builder default):** MVP = φιλτράρισμα των γραμμών του summary ώστε να στέλνονται outbound
  **μόνο** τα alert που είναι νέα ή άλλαξαν κατάσταση από την τελευταία επιτυχή αποστολή (ίδιο dedupeKey concept
  με το bell, χωρίς διπλό μηχανισμό)· «κενό» (μηδέν νέο/αλλαγμένο) = **καμία** αποστολή αντί άδειο «All clear»
  spam· υπάρχοντα κανάλια/behaviour αμετάβλητα όταν δεν υπάρχει τίποτα νέο να αναφερθεί.

---

## Approved

> Οι builder/daily-dev routines χτίζουν ΜΟΝΟ από εδώ — **ένα item ανά run**, verify-pre-build πρώτα,
> με τη σειρά value/effort (τα «πολύ ψηλό value/effort» πρώτα). **Κανόνας ανοιχτών αποφάσεων:** όπου
> ένα item έχει «Απόφαση που χρειάζεται» και ο Αχιλλέας ΔΕΝ την έλυσε ρητά (μόνο τα PA1/PA2/PA3 έχουν
> locked defaults), ο builder παίρνει **sensible default**: (α) free-tier behaviour **non-metered**,
> heavy/AI/SaaS-touching κομμάτια **opt-in**· (β) reuse υπάρχοντος pipeline/pattern· (γ) ξεκίνα από το
> πιο απλό MVP (heuristic/deterministic πριν AI, single πριν multi). Κατέγραψε την επιλογή στο progress log.
> Εξαρτήσεις: P5/P17/P23 δένουν με `/api/v1` (§5) + mobile MVP (§6)· P6 feed βοηθά το PA3/P20.
> **Νεοεγκεκριμένα 2026-07-10 (interactive):** P33, P32, P34, P35, P36 (ranked value/effort· P36 τελευταίο, L).

> **Νεοεγκεκριμένα 2026-08-03 (interactive, «approve all ως έχουν, προχώρα τα»):** P81, P66, P74, P48, P46, P40 — όλα S, με τη σειρά που παρατίθενται. Ο Αχιλλέας ενέκρινε ρητά τα builder defaults του κάθε item ως έχουν, οπότε **καμία «ανοιχτή απόφαση» δεν μένει ανοιχτή σε αυτά τα έξι**: ο builder υλοποιεί ό,τι γράφει το «Ανοιχτή απόφαση (builder default)» πεδίο τους αυτούσιο, χωρίς να ξαναρωτήσει.

> **Νεοεγκεκριμένα 2026-08-03 (interactive, «Approve all»):** P80, P79, P78, P77, P76, P75, P73, P72, P71, P70, P69, P68, P67, P65, P64, P62, P61, P60, P59, P58, P57, P56, P55, P54, P53, P52, P51, P50, P49, P47, P45, P44, P43, P42, P41, P39, P37, P38 — ολόκληρη η υπόλοιπη ουρά του Proposed section, 38 items, «approve all» χωρίς εξαίρεση. Για τα 32 από αυτά ο Αχιλλέας δεν χρειάστηκε να πει τίποτα άλλο, το builder default του κάθε item ισχύει αυτούσιο. **Έξι items είχαν ξεχωριστές ανοιχτές ερωτήσεις στη σάρωση πριν το «approve all» — απαντήθηκαν με το δικό τους δηλωμένο fallback, ΟΧΙ με ρητή απάντηση του Αχιλλέα, μπορεί να χρειαστούν διόρθωση αν ο builder φτάσει σε αυτά πρώτα:**
> - **P37** — reuse το Subscription model (όχι νέο dedicated Contract model), το ίδιο το item το δηλώνει ως fallback αν δεν λυθεί ρητά.
> - **P43** (public wishlist link) — εγκρίθηκε ως έχει (token-scoped, ίδιο μοτίβο με το ήδη-shipped calendar `.ics` feed)· ο Αχιλλέας δεν επιβεβαίωσε ρητά ότι θέλει δημόσιο route, απλά δεν το εξαίρεσε.
> - **P59** (mobile widget) — εγκρίθηκε, αλλά ο builder θα πρέπει να το σειριοποιήσει ΜΕΤΑ το P23 (share-sheet, ήδη blocked σε EAS dev build + φυσική συσκευή) ώστε να μη στοιβάζεται άλλο άτεστο mobile-native κομμάτι.
> - **P65** (voice quick-capture) — χαμηλής αξίας κατά την αξιολόγηση, εγκρίθηκε ούτως ή άλλως, χτίσου το τελευταίο στη σειρά value/effort.
> - **P73** (subscription cost-split) / **P76** (emergency access) — και τα δύο χρειάζονται ουσιαστικά δεύτερο ενεργό χρήστη (P31) για να έχουν πρακτική αξία· ο Αχιλλέας δεν επιβεβαίωσε ρητά ότι τα χρησιμοποιεί, χτίσου τα με χαμηλή προτεραιότητα.

### P80. Outbound webhook delivery reliability (retry + failure log) — S — both, foundation-lever για το ήδη-shipped P24
- **Αξία:** live-verified `lib/webhooks.ts` — το ήδη-shipped P24 (outbound event webhooks) κάνει **fire-and-forget,
  μία απόπειρα** (`Promise.allSettled` απλά μαζεύει το per-call αποτέλεσμα, `grep -n "retry|attempt|deliveryLog|
  history" lib/webhooks.ts` = 0 σχετικά hits). Πραγματικό σενάριο: ένα Home Assistant ή n8n endpoint είναι
  προσωρινά down/restarting τη στιγμή που πυροδοτείται ένα event (π.χ. «bill overdue») — το webhook αποτυγχάνει
  **σιωπηλά**, κανένα ίχνος πουθενά, ο χρήστης ανακαλύπτει το miss μόνο τυχαία. Νέο μικρό: (α) exponential-backoff
  retry (2-3 προσπάθειες, ίδιο idiom με το ήδη-shipped Graph-API throttle-retry στο OneDrive uploader, CLAUDE.md),
  (β) μικρό persisted delivery log ανά channel (τελευταίες N απόπειρες: timestamp/status/http-code) ορατό στο
  Settings → Notifications `ChannelCard` (ίδιο idiom με το ήδη-υπάρχον per-channel «Test» κουμπί).
- **Module:** `lib/webhooks.ts` (retry wrapper) + νέο μικρό log (in-memory ring-buffer ή μικρό capped Mongo
  collection) + `NotificationsManager`/`ChannelCard` UI (Settings → Notifications).
- **Ανοιχτή απόφαση (builder default):** MVP = 2 retries με backoff (π.χ. 5s/30s) πριν χαρακτηριστεί «failed»·
  delivery log capped στα τελευταία ~20 events ανά channel (όχι απεριόριστο, αποφυγή unbounded growth)· ισχύει
  για ΟΛΑ τα ήδη-shipped outbound channels (ntfy/Discord/Slack/Telegram/webhook), όχι μόνο generic webhook.

### P79. TOTP/MFA στο self-host login (reuse του ήδη-shipped SaaS primitive) — S — OSS (κυρίως), security/trust lever
- **Αξία:** live-verified `grep -n "mfa|totp|MFA" apps/web/src/models/User.ts` = 0 hits — το self-hosted login
  (`app/login/LoginForm.tsx` + `app/api/v1/auth/login`) προστατεύεται **μόνο** από password, ενώ το **ίδιο
  ακριβώς primitive υπάρχει ήδη πλήρως δουλεμένο και tested** για το SaaS side: `lib/tenancy/totp.ts` +
  `lib/tenancy/recoveryCodes.ts` + `lib/tenancy/mfaStore.ts` (secret-at-rest encryption, `api/saas/auth/mfa`,
  `api/saas/account/mfa`, με tests). Ένα self-hosted instance εκτεθειμένο μέσω reverse-proxy/WireGuard (η
  προτεινόμενη τοπολογία, CLAUDE.md) έχει σήμερα το ίδιο security posture με «μόνο password» — αν διαρρεύσει το
  password (weak/reused), μηδέν δεύτερη γραμμή άμυνας. Καθαρό reuse-not-rebuild: το ίδιο primitive που ήδη
  δούλεψε στο SaaS side μεταφέρεται στο `User` model (enroll TOTP στο profile/Settings → recovery codes →
  δεύτερο βήμα στο login form όταν ενεργό). **Διακριτό** από §9 στο TODO.md (SaaS-grade auth foundation, email
  verify/OAuth/org-invites) και από P51 (mobile app-lock = device-local, δεν αγγίζει το server login).
- **Module:** `models/User.ts` (νέα optional πεδία, reuse `mfaStore.ts` shape) + `app/login/LoginForm.tsx`
  (δεύτερο βήμα όταν ενεργό) + Settings → account section (enroll/disable + recovery codes).
- **Ανοιχτή απόφαση (builder default):** **opt-in**, όχι default-on (κενό = σημερινή password-only συμπεριφορά
  αμετάβλητη, μηδέν friction σε single-user home deployments που ήδη είναι πίσω από VPN)· reuse ατόφιο το
  crypto/secret-storage pattern του SaaS `mfaStore.ts`, μηδέν νέο dependency· recovery codes εμφανίζονται
  ΜΙΑ φορά στο enroll (ίδιο one-time-reveal idiom με το SaaS side).

### P78. Bulk field-edit για selected Items/Expenses (category/status/tag) — S — OSS (κυρίως), dogfooding-heavy
- **Αξία:** live-verified: το `ItemsClient.tsx` έχει ήδη select-mode (`selectedIds: Set<string>`) αλλά οι ΜΟΝΕΣ δύο
  bulk ενέργειες πάνω στην επιλογή είναι **AI fill** (`handleBulkAi`) και **merge** (duplicate-merge, ≥2 items) —
  **καμία** bulk απλή αλλαγή πεδίου (π.χ. «άλλαξε κατηγορία σε 12 επιλεγμένα items» ή «σημείωσε 5 ως received»)
  (verified `grep -n "handleBulk|selectedIds|bulk" app/items/ItemsClient.tsx` — μόνο τα 2 παραπάνω). Το
  `ExpensesClient.tsx` είναι ακόμα πιο πίσω: **μηδέν select-mode καν** (verified `grep -n "checkbox|Set<string>|
  selectMode"` — τα δύο μόνα checkbox hits είναι άσχετα φίλτρα, tax-only/include-me). Πρακτικό αποτέλεσμα: μια
  σειρά από 20 receipts που έγιναν expenses με λάθος κατηγορία, ή 8 items που μόλις παραδόθηκαν μαζί (μια
  παραγγελία), χρειάζονται σήμερα **N ξεχωριστά ανοίγματα** του detail modal για το ίδιο κοινό edit. Νέο μικρό
  bulk-edit bar (εμφανίζεται όταν `selectedIds.size>0`, ίδιο idiom με το ήδη-υπάρχον «AI fill N»/«merge N»):
  category dropdown + (Items) status dropdown + tag-add input → `bulkUpdateItems(ids, patch)`/
  `bulkUpdateExpenses(ids, patch)`, ένα Mongoose `updateMany`, revalidate μία φορά.
- **Module:** Items (`ItemsClient.tsx`, νέο bulk-edit bar δίπλα στο ήδη-υπάρχον AI-fill/merge bar) + Expenses
  (`ExpensesClient.tsx`, νέο select-mode from scratch, ίδιο checkbox pattern με το Items).
- **Ανοιχτή απόφαση (builder default):** MVP = category + tag-add (πιο συχνή διόρθωση μετά από import/scan)· status
  bulk-change μόνο για Items (Expenses δεν έχει status field)· **καμία** αλλαγή σε μεμονωμένα-required πεδία
  (τίτλος/ποσό) μέσω bulk — αυτά παραμένουν 1-προς-1 edit (αποφυγή κατά λάθος μαζικής αλλοίωσης).

### P77. Ενιαίο self-host system-health / diagnostics dashboard — S — OSS (adoption/troubleshooting lever)
- **Αξία:** live-verified `grep -rln "healthcheck|health-check|diagnostics|/system-health" apps/web/src` = 0 hits
  (το μόνο match, `expenses/actions.ts`, είναι άσχετο string). Το Settings έχει ήδη **σκόρπια** per-integration
  «Test connection» κουμπιά (storage backend SMB/FTP/OneDrive, AI provider) αλλά ο χρήστης πρέπει να ανοίξει κάθε
  tab ξεχωριστά για να μάθει «είναι το deployment μου υγιές;». Για ένα self-hosted project (η ίδια κατηγορία
  χρηστών με UniFi/Proxmox/NAS, βλ. CLAUDE.md background), ένα βασικό troubleshooting συνήθως ξεκινά με «τι δεν
  δουλεύει» πριν καν ανοίξει τα container logs. Νέα μικρή σελίδα/section (Settings → «System status» ή αυτόνομο
  `/system-health`): DB connection ok/latency, storage backend reachable (reuse ήδη-shipped `testRemoteConnection`),
  AI provider reachable (reuse `isAiReady`), disk/storage usage (`dbStats()` ήδη υπάρχει για tenant metering στο
  SaaS side — reuse εδώ για local), job-queue backlog (ήδη-shipped `Job` model), τελευταίο επιτυχές backup
  timestamp (συμπληρώνει το ήδη-proposed P74). **Καθαρή σύνθεση ήδη-υπαρχόντων ελέγχων σε ΜΙΑ οθόνη**, μηδέν νέος
  μηχανισμός ελέγχου εκτός του optional backup-verify (P74) αν εγκριθεί μαζί.
- **Module:** νέα Settings σελίδα/tab, καλεί ήδη-υπάρχοντα test/status actions (storage/AI/DB/jobs), read-only.
- **Ανοιχτή απόφαση (builder default):** MVP = read-only status grid (πράσινο/κόκκινο/γκρι ανά subsystem, ίδιο
  idiom με το ήδη-υπάρχον «AI online» dot στο navbar) — καμία auto-fix ενέργεια σε αυτό το slice· ζει σαν νέο
  Settings tab, όχι public/unauthenticated route (θα διέρρεε deployment topology σε multi-tenant SaaS context).

### P76. Emergency / legacy access — time-delayed data access για έμπιστο άτομο (dead-man's-switch lite) — S/M — OSS (κυρίως), «Personal Hub» fit
- **Αξία:** live-verified `grep -rln "emergencyAccess|legacyContact|trustedContact|deadManSwitch" apps/web/src
  apps/mobile/src` = 0 hits. Καθιερωμένο pattern σε password managers (1Password «Emergency Kit», Bitwarden
  «Emergency Access» — request access → owner notified → auto-grant μετά από wait period αν δεν απορριφθεί) που
  απουσιάζει εντελώς εδώ, ενώ το Pharos κρατά ήδη εξίσου ευαίσθητα δεδομένα (οικονομικά, και αν εγκριθεί το P71,
  admin logins/license keys). Σενάριο: κάτι συμβαίνει στον Αχιλλέα, ένα έμπιστο άτομο (σύζυγος/αδερφός) χρειάζεται
  πρόσβαση στα βασικά (πού είναι οι λογαριασμοί, ποιες συνδρομές τρέχουν, τι εγγυήσεις υπάρχουν) — σήμερα το μόνο
  fallback είναι μοιρασμένο admin password (no accountability, no time-delay, no revoke). Νέο μικρό μηχανισμό: ο
  admin ορίζει έναν «legacy contact» (email/username αν έχει ήδη λογαριασμό στο ίδιο instance μέσω P31) + wait-period
  (π.χ. 7 μέρες) → ο contact μπορεί να «request access» → owner ειδοποιείται (reuse `dispatchAlert`) με δυνατότητα
  **deny** μέσα στο wait window → αν δεν απαντηθεί, αυτόματο grant (νέο ρόλο ή temp viewer session). **Διακριτό**
  από P31 (κανονικό multi-user login, ενεργό ήδη σήμερα) — εδώ η πρόσβαση είναι **ανενεργή by default**, ενεργοποιείται
  μόνο μέσω του delayed-request flow.
- **Module:** νέο μικρό module πάνω στο ήδη-shipped Auth/Users (P31) — `EmergencyContact` model + request/deny/grant
  flow + notification wiring.
- **Ανοιχτή απόφαση (builder default):** requires P31 να είναι ήδη ενεργό (χρειάζεται δεύτερο λογαριασμό να υπάρχει)·
  wait-period ρυθμιζόμενο, default 7 μέρες (ίδιο lead-time idiom με τα υπόλοιπα alert-days settings)· grant = **viewer**
  ρόλο by default (ασφαλέστερο MVP), όχι admin· owner μπορεί να ανακαλέσει access ανά πάσα στιγμή, όχι one-way.

### P75. `createdBy` attribution σε shared/household instances — το μισό του P31 που δεν προωθήθηκε ποτέ σε νέο item — S — OSS (κυρίως), household follow-up
- **Αξία:** live-verified `grep -rln "createdBy" apps/web/src/models` = 0 hits, ΑΚΟΜΑ ΚΑΙ μετά το P31 ship
  (2026-07-27, commit `1346b4d`). Το ίδιο το P31 entry έγραφε στο δικό του «Αξία» section: «...ρόλους (admin/member/
  viewer) **+ "ποιος καταχώρησε τι" attribution**» — αλλά το πραγματικά-shipped slice (βλ. `## Approved` P31
  «Υλοποίηση») κάλυψε αποκλειστικά τον 3ο ρόλο + write-guard enforcement· το attribution κομμάτι έμεινε στα χαρτιά,
  και καμία σάρωση δεν το ξαναπρότεινε ως δικό του item έκτοτε — φαίνεται να χάθηκε ανάμεσα στο «ήδη εγκεκριμένο
  ως μέρος του P31» και στο «δεν χτίστηκε ποτέ». Σε ένα household instance (πολλαπλά logins πάνω στα ίδια
  δεδομένα, ήδη ενεργό μηχανισμός) το «ποιος πρόσθεσε αυτό το έξοδο/αγόρασε αυτό το item» είναι βασική διαφάνεια,
  όχι πολυτέλεια — σήμερα ΟΛΑ τα records είναι ανώνυμα ακόμα κι αν 3 άνθρωποι γράφουν στο ίδιο instance. Χαμηλού
  ρίσκου follow-up (καθαρά additive display field, **καμία** permission λογική πάνω του — σε αντίθεση με το
  role-enforcement κομμάτι του P31 που χρειάστηκε 4 deferrals ακριβώς επειδή άγγιζε write-paths).
- **Module:** cross-cutting (κάθε μοντέλο που ήδη έχει `assertCanWrite()` create-path — reuse του ήδη-χαρτογραφημένου
  write-guard inventory από το P31 `writeGuard.coverage.test.ts`) + μικρό display badge στα cards/rows.
- **Ανοιχτή απόφαση (builder default):** νέο optional `createdBy: ObjectId ref User` σε κάθε create-path (populate
  on write, backfill = `null`/«unknown» για ήδη-υπάρχοντα records, ΟΧΙ migration που μαντεύει)· εμφανίζεται μόνο
  όταν υπάρχουν ≥2 users στο instance (single-user deployments δεν βλέπουν κανένα νέο UI, μηδέν clutter)· single-user
  self-host = μηδέν αλλαγή συμπεριφοράς.

### P73. Recurring subscription cost-split among household members (family-plan «ποιος χρωστάει τι» ανά κύκλο) — S — OSS (κυρίως), βοηθά dogfooding
- **Αξία:** live-verified `grep -n "split\|Split" apps/web/src/models/Subscription.ts` = 0 hits — το ήδη-shipped
  P35 expense-splitting (`lib/split.ts`, pure/DB-free `SplitEntry`/`equalSplit`/`computeBalances`) καλύπτει μόνο
  **Expenses**, όχι **Subscriptions**. Πραγματικό σενάριο: μια οικογενειακή συνδρομή (Netflix/Spotify/iCloud
  family plan, YouTube Premium family) χρεώνεται αυτόματα κάθε μήνα στην κάρτα του Αχιλλέα αλλά μοιράζεται με
  σπίτι/φίλους — σήμερα το «ποιος μου χρωστάει πόσο αυτόν τον μήνα» χρειάζεται είτε χειροκίνητη δημιουργία ενός
  ξεχωριστού Expense κάθε κύκλο (διπλή καταχώρηση, εύκολο να ξεχαστεί), είτε καθόλου tracking. Reuse ατόφιο του
  `lib/split.ts` (μηδέν νέος υπολογισμός) πάνω σε νέο optional `Subscription.split: SplitEntry[]` → κάθε φορά που
  το `generateDueRecurring`-style μηχανισμό περνά έναν νέο κύκλο, το split εμφανίζεται στην κάρτα της συνδρομής
  (ίδιο «⇄ €X owed» badge idiom με το ήδη-shipped Expenses UI). **Διακριτό** από P62 (split ΜΕΘΟΔΩΝ πληρωμής της
  ίδιας αγοράς) — εδώ είναι split ΑΤΟΜΩΝ πάνω σε ΕΠΑΝΑΛΑΜΒΑΝΟΜΕΝΗ χρέωση, ίδιο μοτίβο με P35 αλλά σε άλλο μοντέλο.
- **Module:** Subscriptions (νέο optional πεδίο + `SplitEditor` reuse από Expenses UI, ίδιο component/pattern).
- **Ανοιχτή απόφαση (builder default):** το split ζει στο ίδιο το Subscription doc (static, ίδιο ποσό/μερίδιο κάθε
  κύκλο) — ΟΧΙ per-cycle history αρχικά (MVP απλούστερο, «ισχύει μέχρι να το αλλάξεις»)· «settle»/balances tracking
  reuse το ήδη-shipped `computeBalances` pattern των Expenses χωρίς νέο υπολογισμό· κενό `split[]` = σημερινή
  συμπεριφορά αμετάβλητη.

### P72. Shipment/delivery tracking για items σε «ordered» status (tracking number + carrier + status) — S — OSS (κυρίως), dogfooding-heavy
- **Αξία:** live-verified: το `Item.status` έχει ήδη `'ordered'` (`ITEM_STATUSES` στο `models/Item.ts`) αλλά
  `grep -rn "trackingNumber|carrier|shipment|deliveryStatus" apps/web/src apps/mobile/src` = 0 hits παντού. Ο
  Αχιλλέας παραγγέλνει τακτικά από πολλαπλά κανάλια με πολύ διαφορετικούς χρόνους παράδοσης (AliExpress 2-3
  εβδομάδες, Amazon.de 2-4 μέρες, GR same-day, βλ. CLAUDE.md shipping-notes preference) — σήμερα ένα item σε
  «ordered» δεν λέει τίποτα για το πού βρίσκεται το πακέτο, ο χρήστης πρέπει να θυμάται/ψάχνει ξεχωριστά σε κάθε
  courier site. Optional `Item.trackingNumber` + `Item.carrier` (free-string, όχι fixed carrier list — reuse του
  ήδη-υπάρχοντος relaxed-enum idiom) + `Item.trackingUrl` (auto-suggested link pattern ανά γνωστό courier, όπως
  το ήδη-υπάρχον store-alias resolution) εμφανίζεται **μόνο** όταν `status==='ordered'` στο item detail — απλό
  quick-link «Track package» ανοίγει το courier site, **όχι** live carrier API polling (out of scope, θα χρειαζόταν
  ανά-courier integration/κόστος). Optional follow-up: auto-flip σε «received» όταν ο χρήστης πατήσει «arrived»
  δίπλα στο tracking widget (μία λιγότερη χειροκίνητη ενέργεια).
- **Module:** Items/Shopping (2-3 νέα optional πεδία στη φόρμα, ορατά μόνο σε status=ordered).
- **Ανοιχτή απόφαση (builder default):** MVP = πεδία + manual «open tracking link» (κενό = σημερινή συμπεριφορά
  αμετάβλητη)· carrier ως free string με λίγα auto-suggest chips (Cosmote/ELTA/ACS/Speedex/DHL/UPS τα πιο κοινά GR)
  ώστε το tracking-URL template να δουλεύει χωρίς fixed enum· καμία live API polling σε αυτό το MVP.

### P71. Personal secrets vault (WiFi/router/NAS admin logins, license keys, recovery codes) — S/M — OSS (κυρίως), «Personal Hub» fit
- **Αξία:** live-verified `grep -rn "vault\|SecretNote" apps/web/src/models` = μόνο το P21 document/manual vault
  (`AttachmentSchema` στο `models/Item.ts`, αρχεία όπως manuals/warranty certs) — **κανένα μέρος για μικρά
  text-secrets**. Το CLAUDE.md δείχνει έναν χρήστη με σοβαρό δικτυακό/hardware setup (UniFi controller admin,
  NAS admin, router credentials, software license keys) που σήμερα ζουν έξω από το app (χαρτί/άλλο εργαλείο) ενώ
  θα ταίριαζαν φυσικά στο «Personal Hub» backronym. **Ήδη υπάρχει το κρυπτογραφικό primitive**: `lib/tenancy/
  secretCrypto.ts` (AES-256-GCM, key scrypt-derived από το ήδη-υπάρχον `AUTH_SECRET`, `node:crypto`, μηδέν νέο
  dependency), σήμερα χρησιμοποιείται **μόνο** για το SaaS BYO-key AI provider key. Reuse του ίδιου primitive
  για νέο μικρό module: τίτλος + value (πάντα encrypted-at-rest, decrypt μόνο on-demand στο detail view) +
  category (wifi/router/nas/license/other, free string) + notes. Μηδέν UX friction — καμία δεύτερη passphrase
  να θυμάται ο χρήστης (σε αντίθεση με το P54 backup-export passphrase) — το threat model είναι «διέρρευσε ένα DB
  dump/Mongo Express port χωρίς το `.env`», όχι «διέρρευσε ολόκληρο το deployment». **Διακριτό** από P21 (αρχεία,
  όχι πάντα encrypted) και P54 (one-time export passphrase, όχι ongoing module).
- **Module:** νέο μικρό model (`SecretNote`) + CRUD σελίδα, ίδιο μέγεθος με Bill/Goal/GiftCard.
- **Ανοιχτή απόφαση (builder default):** OSS/self-host πρώτα (SaaS θα χρειαζόταν per-tenant key derivation,
  follow-up)· **δεν** μπαίνει στο navbar search ούτε στο AI command bar (ευαίσθητο περιεχόμενο, ίδιο σκεπτικό
  με το γιατί το `GiftCard.uses[]` μένει εκτός AI στο P66)· τιμή ποτέ σε plaintext state πέρα από το ανοιχτό
  detail view.

### P70. Custom user-defined πεδία σε Items (structured key-value metadata) — S/M — OSS (κυρίως, dogfooding-heavy)
- **Αξία:** live-verified `models/Item.ts` έχει μόνο ένα ελεύθερο `specs` string (ενιαίο text blob) + `tags[]`,
  **κανένα structured key-value πεδίο** (`grep -n "customField" apps/web/src/models/Item.ts apps/web/src/app/items`
  = 0 hits). Για hardware-heavy inventory (Battle Station parts, δίκτυο εξοπλισμός, CLAUDE.md) ο χρήστης θα
  ήθελε να βρίσκει με **συγκεκριμένο attribute** (π.χ. «όλα τα items με MAC address X», «serial number Y»,
  «rack unit Z») — σήμερα αυτό θάβεται μέσα στο ελεύθερο `specs` text, μόνο full-text search, όχι filter by
  attribute name/value. Optional `customFields: [{key, value}]` array ανά item (κενό = καμία αλλαγή) → editable
  στη φόρμα, μικρός πίνακας στο detail, προαιρετικά filterable by key σε δεύτερο βήμα.
- **Module:** Items (`models/Item.ts` νέο optional subdoc array + `ItemsClient` form/detail + φίλτρο follow-up).
- **Ανοιχτή απόφαση (builder default):** MVP = μόνο πεδίο + εμφάνιση/edit (κενό = σημερινή συμπεριφορά αμετάβλητη)·
  filter-by-custom-field ως follow-up ώστε το πρώτο slice να μείνει S· free-form key strings, όχι fixed schema
  (ίδιο idiom με το ήδη-υπάρχον relaxed-enum category/taxonomy pattern).

### P69. Year-over-year ίδιου μήνα σύγκριση δαπανών (εποχιακό κόστος) στα Reports — S — OSS
- **Αξία:** live-verified `apps/web/src/app/reports/page.tsx` — το monthly-spend chart είναι **μόνο rolling
  window** (6/12/24 μήνες, `getReports(monthsBack)`, `sp.months` selector), **καμία** σύγκριση «αυτός ο μήνας
  vs τον ίδιο μήνα πέρσι» (`grep -rn "yoy\|year.over.year\|previousYear\|lastYear" apps/web/src/app/reports` =
  0 hits). Με δύο σπίτια διαφορετικού εποχιακού προφίλ (κεντρικό vs εξοχικό Kalamos, P34 per-space ήδη shipped)
  και λογαριασμούς (ΔΕΗ/θέρμανση) που αυξομειώνονται εποχιακά, ένα rolling 12-24μηνο δείχνει trend αλλά όχι
  «είναι αυτό φυσιολογικό για την εποχή ή πραγματική αύξηση;». Νέο μικρό card: επιλεγμένος μήνας φέτος vs ίδιος
  μήνας πέρσι (±%), reuse του ήδη-υπολογισμένου monthly aggregation, **μηδέν νέο data model**.
- **Module:** Reports (`getReports` + `ReportsClient`, νέο μικρό card).
- **Ανοιχτή απόφαση (builder default):** reuse τα ήδη-computed monthly buckets (χρειάζεται μόνο δεδομένα ≥13
  μήνες πίσω, αλλιώς κρυμμένο card — όχι misleading σύγκριση με μηδενικά)· MVP = μόνο total spend, per-category
  breakdown ως follow-up.

### P68. Επέκτασε το per-space tag (P34) σε Receipts/Subscriptions/Bills — S — OSS, dogfooding-heavy
- **Αξία:** το P34 (per-space ledger tag, shipped 2026-07-14) έμεινε ρητά **Expenses-only ως MVP**, με follow-up
  note «space σε Receipts/Subscriptions... global space-filter σε όλα τα money views (τώρα μόνο Expenses/Income)»
  που ποτέ δεν έγινε δικό του actionable item (ίδιο μοτίβο με το P63 πριν προωθηθεί). Live-verified: `grep -rn
  "space" apps/web/src/models/Receipt.ts apps/web/src/models/Subscription.ts apps/web/src/models/Bill.ts` = 0 hits.
  Πρακτικό αποτέλεσμα: ο Αχιλλέας έχει 2 σπίτια (κεντρικό + Kalamos, CLAUDE.md) και το «πόσο κοστίζει το εξοχικό»
  απαντιέται σήμερα **μόνο** για τα χειροκίνητα Expenses — μια απόδειξη σούπερ μάρκετ ή μια συνδρομή streaming
  δεμένη στο εξοχικό δεν προσμετράται στο per-space breakdown στα Reports, άρα το P&L ανά σπίτι είναι συστηματικά
  ημιτελές, όχι απλά λείπει ένα μικρό feature.
- **Module:** Receipts + Subscriptions + Bills (ίδιο optional `space` string πεδίο, ίδιο taxonomy/`AppConfig.spaces`
  reuse) + Reports (επέκταση του ήδη-υπάρχοντος «Expenses by space» card).
- **Ανοιχτή απόφαση (builder default):** ίδιο pattern με το P34 MVP (κενό = «όλα», κληρονομείται από την τελευταία
  εγγραφή ίδιου store/vendor όπου εφαρμόζεται)· ξεκίνα από Receipts (μεγαλύτερος όγκος εγγραφών, μεγαλύτερη αξία
  στο P&L) πριν Subscriptions/Bills.

### P67. Bills + Goals λείπουν από το ενιαίο money agenda (`/calendar` + `.ics` feed) — S — OSS (κυρίως)
- **Αξία:** live-verified `import`-block του `lib/moneyAgenda.ts` (shared και από `/calendar` ΚΑΙ από το
  token-scoped `.ics` feed του P6): φέρνει `Subscription`/`Voucher`/`Item`/`Statement`/`Expense` αλλά **ΟΧΙ**
  `Bill` ούτε `Goal`. Το ίδιο επιβεβαιώνεται στο `app/calendar/page.tsx` (ίδιο import-set). Πρακτικό αποτέλεσμα:
  ένα ανοιχτό `Bill` (P28, «due → paid → overdue» payable) με πλησιάζουσα προθεσμία **δεν εμφανίζεται πουθενά**
  στο 3-μηνο agenda ή στο Google/Apple Calendar feed — μόνο στο δικό του `/bills` triage list και στο notification
  bell· ένας `Goal` (P12) με target date εξίσου αόρατος εκεί. Αυτό ήταν ήδη γνωστό ως «skipped for focus» follow-up
  κάτω από το P28 shipped note («Calendar paid-vs-pending coloring [...] τα recurring bills δεν διπλο-προβάλλονται
  εκεί ακόμα») αλλά ποτέ δεν προωθήθηκε σε actionable item.
- **Module:** `lib/moneyAgenda.ts` (νέο import + entry-mapping, reused αυτόματα από `/calendar` + `.ics`).
- **Ανοιχτή απόφαση (builder default):** Bills πρώτα (μεγαλύτερη αξία, ίδιο «amount + due date» σχήμα με τα ήδη
  wired Subscriptions/Statements) — μόνο unpaid/pending bills (τα paid δεν χρειάζονται πια θέση στο forward
  agenda)· Goals ως δεύτερο βήμα (target date, όχι recurring, απλούστερο mapping)· χρωματισμός/label ίδιο idiom
  με τα υπόλοιπα entry types.

### P65. Voice quick-capture στο AI command bar (Web Speech API, μηδέν νέο backend) — S — both, quick-capture friction
- **Αξία:** το app έχει ήδη ένα ενιαίο conversational AI command bar (text-based, `runAiCommand`) που καταλαβαίνει
  φυσική γλώσσα («πρόσθεσε έξοδο ΔΕΗ 84€») και ήδη 4 quick-capture κανάλια (P5 bookmarklet, P23 mobile
  share-sheet, P11 email-in, P59 proposed widget) — αλλά **καμία φωνητική είσοδος πουθενά** (verified:
  `grep -rn "SpeechRecognition" apps/web/src apps/mobile/src` = 0 hits). Ένα μικρό 🎤 κουμπί δίπλα στο input του
  `AiCommandBar` που χρησιμοποιεί το **browser-native Web Speech API** (`webkitSpeechRecognition`, υποστηρίζεται
  ήδη σε Chrome/Edge/Safari, μηδέν νέο dependency/κόστος) → transcribe → γεμίζει το ίδιο text input → ο χρήστης
  βλέπει/διορθώνει πριν στείλει (όχι auto-submit, αποφυγή λάθος καταχωρήσεων από κακή αναγνώριση). Μηδέν αλλαγή
  στο ήδη-existing `runAiCommand` pipeline (reuse ατόφιο) — μόνο νέος τρόπος να γεμίσει το ίδιο κουτί κειμένου.
  Ιδανικό όταν έχεις τα χέρια γεμάτα (π.χ. μόλις βγήκες από κατάστημα, κρατάς σακούλες) — καθαρά διαφορετικό
  modality από το P59 (widget = surface, αυτό = input method). Στο mobile app, αντίστοιχο μέσω `expo-speech`
  ή του native platform speech-to-text ως follow-up (το Expo managed workflow το υποστηρίζει).
- **Module:** `components/AiCommandBar.tsx` (νέο mic button + state) — web πρώτα, μηδέν server αλλαγή.
- **Ανοιχτή απόφαση (builder default):** web browser-native API πρώτα (Chrome/Edge/Safari· Firefox δεν υποστηρίζει
  ακόμα → κουμπί απλά δεν εμφανίζεται όταν `!('webkitSpeechRecognition' in window)`, graceful no-op, όχι error)·
  transcribed κείμενο ΠΑΝΤΑ περνά πρώτα από review του χρήστη (γεμίζει το input, δεν κάνει auto-send)· μηδέν
  server-side speech processing (browser κάνει όλη τη δουλειά, καμία ανησυχία privacy/κόστους πέρα από το ήδη
  υπάρχον AI-command call όταν πατηθεί send).

### P64. Receipt line-item category tagging (τα Reports σήμερα «βλέπουν» μόνο Expenses, καθόλου Receipts) — S/M — OSS (κυρίως), dogfooding-heavy
- **Αξία:** live-verified διπλό κενό: (α) το `LineItemSchema` (`models/Receipt.ts`) έχει
  `name/refinedName/qty/price/vatRate/matchedItemId` — **μηδέν category πεδίο**, ούτε καν σε επίπεδο ολόκληρης
  απόδειξης· (β) το `reports/page.tsx` category breakdown (spend-by-category chart, budgets-vs-actual) διαβάζει
  **αποκλειστικά `Expense.category`** — τα Receipts δεν τροφοδοτούν καθόλου αυτά τα charts σήμερα. Πρακτικό
  αποτέλεσμα: μια απόδειξη σούπερ μάρκετ με 20 γραμμές (τρόφιμα + είδη σπιτιού + ηλεκτρονικά μπλεγμένα) είναι
  **αόρατη** στα category reports — μόνο τα χειροκίνητα καταχωρημένα Expenses (λογαριασμοί/μισθός) μετράνε.
  Optional `category` πεδίο ανά line item (AI-suggested στο parse, editable, όχι required) → φάση 2 (follow-up,
  όχι απαραίτητα σε αυτό το MVP): τα Reports προσθέτουν τα line-item categorized ποσά στο ήδη-υπάρχον breakdown
  δίπλα στα Expenses. **Διακριτό** από το `Item.category` (matched inventory items — καλύπτει μόνο τα λίγα line
  items που έγιναν tracked inventory, όχι όλη την απόδειξη) και από το Expense.category (single tag για ΟΛΟΚΛΗΡΗ
  την εγγραφή, όχι per-line).
- **Module:** Receipts (`LineItemSchema` + `ReceiptsClient` line-item editor, νέο optional πεδίο) + Reports
  (follow-up: συνυπολογισμός στο category breakdown).
- **Ανοιχτή απόφαση (builder default):** MVP = μόνο το πεδίο + manual tagging στο ήδη-υπάρχον line-item editor
  (κενό = καμία αλλαγή συμπεριφοράς)· AI auto-suggest στο parse-time ως γρήγορο follow-up (reuse το ήδη-υπάρχον
  category-normalization prompt idiom, `CATEGORY_PROMPT`)· η ενσωμάτωση στο Reports chart μπαίνει σε ξεχωριστό
  δεύτερο βήμα ώστε το πρώτο shippable slice να μείνει S.

### P62. Split a purchase across multiple payment methods (κάρτα + gift card / cash) — S/M — OSS (κυρίως), βοηθά και SaaS
- **Αξία:** το `Expense.paymentMethod` (και το αντίστοιχο πεδίο στα Receipts) είναι σήμερα **ένα** free-string —
  αλλά μια πραγματική αγορά συχνά πληρώνεται με **περισσότερες από μία μεθόδους** (π.χ. €30 από δωροκάρτα IKEA
  + €45 με κάρτα). Σήμερα αυτό είτε καταγράφεται σε ΜΙΑ μέθοδο (ανακριβές), είτε ο χρήστης πρέπει να ανοίξει
  ξεχωριστά το gift card (P32, ήδη-shipped `GiftCard.uses[]` spend-log) και να καταχωρήσει το spend εκεί
  **χειροκίνητα, δεύτερη φορά** — καμία σύνδεση σήμερα μεταξύ ενός Expense/Receipt record και ενός GiftCard use
  (verified: το `GiftCardUseSchema` δεν έχει κανένα reference field προς Expense/Receipt). Νέο optional
  `paymentSplits: [{method, amount, giftCardId?}]` πάνω στο ήδη-υπάρχον single-`paymentMethod` πεδίο (κενό array
  = σημερινή συμπεριφορά αμετάβλητη, ΟΧΙ breaking) → όταν μια γραμμή δείχνει σε ένα linked gift card, η
  αποθήκευση προσθέτει **αυτόματα** το ισόποσο use στο `GiftCard.uses[]` (reuse του ήδη-shipped balance
  mechanism, μηδέν νέος υπολογισμός). **Διακριτό** από P35 (expense splitting = μεταξύ **ΑΤΟΜΩΝ** ποιος χρωστάει
  τι· εδώ = μεταξύ **ΜΕΘΟΔΩΝ ΠΛΗΡΩΜΗΣ** της ίδιας αγοράς, ίδιου ατόμου) — τα δύο θα μπορούσαν θεωρητικά να
  συνυπάρχουν αργότερα αλλά είναι ανεξάρτητα MVPs.
- **Module:** Expenses/Receipts (νέο optional πεδίο στη φόρμα, ίδιο pattern με το SplitEditor του P35) +
  Vouchers/GiftCard tab (auto-append use, reuse).
- **Ανοιχτή απόφαση (builder default):** UI μόνο όταν ο χρήστης πατήσει ρητά «split payment» (κενό = single
  method, καμία default-on αλλαγή στη φόρμα)· το άθροισμα των splits πρέπει να ισούται με το total (validation,
  ίδιο idiom με το P35 equal-split guard)· `giftCardId` optional ανά γραμμή (μπορεί να είναι split χωρίς κανένα
  gift card, π.χ. μισό μετρητά/μισό κάρτα — απλά δύο free-string μέθοδοι χωρίς αυτόματο side-effect).

### P61. Partial payments για Bills/payables (όχι μόνο δυαδικό paid/unpaid) — S — OSS (κυρίως), βοηθά και SaaS
- **Αξία:** το `Bill` model (P28, ήδη-shipped) έχει **δυαδικό** status μόνο — `paidAt: Date|null`, καμία έννοια
  μερικής πληρωμής (verified: `models/Bill.ts` δεν έχει κανένα `paidAmount`/payments-array πεδίο, μόνο
  `amount`+`paidAt`). Πραγματικό σενάριο: ένας μεγάλος λογαριασμός (κοινόχρηστα με έκτακτη εισφορά, ΔΕΗ με
  ρύθμιση οφειλής σε δόσεις εκτός statement/κάρτας) πληρώνεται **σταδιακά** — σήμερα ο χρήστης είτε το αφήνει
  «unpaid» μέχρι να το κλείσει εντελώς (χάνει την ορατότητα του τι έχει ήδη πληρώσει), είτε το σημειώνει «paid»
  πρόωρα (ψέμα στο status, χαλάει το overdue tracking αν μείνει υπόλοιπο). Optional `Bill.payments: [{amount,
  date, note}]` (νέο subdoc array, mirror του ήδη-shipped `GiftCardUseSchema` pattern) → derived status
  επεκτείνεται σε **partially-paid** (Σpayments < amount, ΔΕΝ αλλάζει τα ήδη-υπάρχοντα paid/overdue/due-soon/
  upcoming states, απλά προσθέτει ένα ενδιάμεσο) + remaining-balance εμφανίζεται στην κάρτα. **Διακριτό** από τα
  credit-card installments (Statements module — εκείνο είναι για χρεώσεις ΠΑΝΩ σε κάρτα, εδώ = λογαριασμοί που
  πληρώνονται με το χέρι, ίδιο distinction με το ήδη-τεκμηριωμένο Bill-vs-Statement στο `docs/features.md`).
- **Module:** Bills/payables (νέο optional subdoc array + derived-status επέκταση, `lib/bill.ts`).
- **Ανοιχτή απόφαση (builder default):** «mark paid» παραμένει η γρήγορη one-click ενέργεια για απλά bills (κενό
  `payments[]` = ίδια συμπεριφορά με σήμερα, no breaking change)· «log a partial payment» = νέα δεύτερη ενέργεια
  δίπλα (όχι αντικατάσταση)· το bill γίνεται πλήρως `paid` αυτόματα μόλις Σpayments ≥ amount (καμία χειροκίνητη
  δεύτερη ενέργεια χρειάζεται)· το «log an expense on payment» opt-in (ήδη-shipped) καταγράφει ανά partial
  payment, όχι μόνο στο τελικό κλείσιμο.

### P60. Store/vendor auto-detection correction feedback loop (μάθε από τις διορθώσεις) — S — OSS (dogfooding-heavy)
- **Αξία:** το AI receipt/expense parsing μαντεύει store/vendor από ελεύθερο κείμενο, και όταν κάνει λάθος η μόνη
  διόρθωση σήμερα είναι **χειροκίνητη ανά εγγραφή** ή manual edit στο `lib/stores.ts` seed aliases (developer-only,
  όχι κάτι διαθέσιμο μέσα από το UI). Πραγματικό, ήδη-καταγεγραμμένο περιστατικό (CLAUDE.md, session 2026-06-10
  cont.¹¹): το AI έβλεπε το νομικό όνομα του TechLamb και μάντευε «Κωτσόβολος» — χρειάστηκε χειροκίνητο prompt+DB
  fix από τον ίδιο τον developer. **Καμία ανάδραση δεν «μαθαίνει»** από μια χρηστική διόρθωση — το ίδιο λάθος θα
  ξανασυμβεί στην επόμενη παρόμοια απόδειξη. Νέο: όταν ο χρήστης αλλάζει το store πεδίο σε μια ήδη-verified
  receipt/expense, αποθήκευσε αυτόματα το πρωτότυπο AI-guessed κείμενο ως νέο **alias** του διορθωμένου store
  (reuse το ήδη-υπάρχον `Store.aliases[]` + `resolveStore` matching — απλά γράφει σε αυτό αντί να το διαβάζει
  μόνο). Ντετερμινιστικό, μηδέν νέο AI call, καθαρό feedback-loop πάνω σε ήδη-υπάρχον μηχανισμό.
- **Module:** Receipts + Expenses (update-store handler) + Store model (ήδη έχει `aliases[]`, μόνο write-path λείπει).
- **Ανοιχτή απόφαση (builder default):** learn μόνο όταν `verified===true` (σήμα εμπιστοσύνης, όχι στη μεταβατική
  κατάσταση πριν το review)· dedupe case-insensitive πριν το append· ΔΕΝ πειράζει τα ήδη-υπάρχοντα seed aliases,
  μόνο προσθέτει νέα.

### P59. Mobile home-screen widget (quick-glance / quick-add) — S/M — both (mobile-native, quick-capture friction)
- **Αξία:** το app έχει ήδη 3 quick-capture κανάλια (P5 bookmarklet, P23 mobile share-sheet approved-pending,
  P11 email-in) αλλά **καμία native home-screen widget** στο κινητό — για ένα personal-finance app, ένα widget
  «safe-to-spend αυτόν τον μήνα» (reuse P19, ήδη-shipped) ή «+ Add expense» deep-link θα ήταν πιο σύντομος δρόμος
  από open-app→tap→type. Το Expo SDK managed workflow υποστηρίζει iOS/Android home-screen widgets μέσω config
  plugins (React Native community packages), χωρίς bare eject. **Χρησιμοποιεί το ήδη-υπάρχον `/api/v1` + token
  auth** — μηδέν νέα backend δουλειά. **Διακριτό** από P17/P23 (αυτά είναι in-app capture flows, το widget ζει
  εκτός app, στο home screen).
- **Module:** Mobile (`apps/mobile`) — νέο native config plugin + μικρό widget UI.
- **Ανοιχτή απόφαση (builder default):** MVP = **read-only «safe-to-spend» snapshot widget** πρώτα (απλούστερο,
  καμία write-path/auth-in-widget complexity)· quick-add-expense deep-link widget ως follow-up· iOS πρώτα
  (μεγαλύτερο platform-widget ecosystem support σε Expo σήμερα), Android follow-up.

### P58. Native SMTP email notifier channel (χωρίς Zapier/n8n μεσάζοντα) — S/M — both, foundation-lever
- **Αξία:** το ήδη-shipped notifier framework (ntfy/Discord/Slack/Telegram/webhook) καλύπτει email **μόνο έμμεσα**
  μέσω generic webhook→Zapier/n8n (βλ. `lib/notifiers.shared.ts` hint: «Routes to email via Zapier/n8n»). Αυτό
  είναι υψηλό friction για έναν τυπικό self-host χρήστη που θέλει απλά «στείλε μου email» με το δικό του Gmail
  app-password ή μικρό SMTP relay (Resend/Postmark/δικό του mailcow) — να χρειάζεται λογαριασμό σε τρίτο
  automation SaaS για κάτι τόσο βασικό είναι αντίθετο στο self-hosted/privacy-first ήθος του project (CLAUDE.md
  design principles). Μια native `email` channel type (nodemailer + SMTP host/port/user/pass/from config στο
  Settings, ίδιο pattern με τα υπόλοιπα channels) καλύπτει αυτό **ΚΑΙ** θέτει το θεμέλιο για το ήδη-tracked
  password-reset/email-verification (TODO §9, LATER SaaS) χωρίς δεύτερη υλοποίηση email-sending αργότερα —
  καθαρό reuse ενός θεμελίου που έτσι κι αλλιώς θα χρειαστεί.
- **Module:** `lib/notifiers.ts`/`notifiers.shared.ts` (νέο channel type) + Settings → Notifications (SMTP config
  fields, ίδιο `ChannelCard` pattern).
- **Ανοιχτή απόφαση (builder default):** `nodemailer` (καθιερωμένο, καμία εναλλακτική να αξιολογηθεί)· SMTP
  password αποθηκεύεται με το ίδιο επίπεδο προστασίας με τα υπόλοιπα notifier secrets· plain-text email body
  αρχικά (όχι HTML template, MVP)· opt-in ανά χρήστη ίδιο με τα υπόλοιπα κανάλια.

### P57. Subscription/asset «still using this?» periodic review nudge — S — OSS (dogfooding-heavy), behavioral (όχι οικονομικό υπολογισμό)
- **Αξία:** το P7 (auto-discovery) βρίσκει άγνωστες επαναλαμβανόμενες χρεώσεις, το P14 (price-hike) πιάνει ανατιμήσεις,
  το P45 (pause/skip) χειρίζεται προσωρινό πάγωμα — αλλά **καμία υπενθύμιση δεν ρωτάει ποτέ «τη χρησιμοποιείς ακόμα;»**
  για μια συνδρομή που εξακολουθεί να χρεώνεται κανονικά, χωρίς ανατιμήσεις, απλώς ξεχασμένη (π.χ. ένα δεύτερο
  streaming service που δεν άνοιξε 6+ μήνες). Αυτό είναι **behavioral nudge**, όχι οικονομικός υπολογισμός — καθαρά
  distinct από τα 3 παραπάνω items που όλα βασίζονται σε αριθμούς (τιμή/κύκλο), ενώ αυτό βασίζεται μόνο στον χρόνο
  από την τελευταία επιβεβαίωση του ίδιου του χρήστη. Optional `Subscription.lastReviewedAt` (+ «still using it ✓»
  one-click που το ενημερώνει σε now) → alert όταν περάσει `reviewIntervalDays` (default π.χ. 180) από την τελευταία
  επιβεβαίωση (ή από τη δημιουργία αν ποτέ δεν επιβεβαιώθηκε). Ντετερμινιστικό, μηδέν AI, reuse `dispatchAlert`.
- **Module:** Subscriptions (νέο optional πεδίο + «still using it» action) + Notifications.
- **Ανοιχτή απόφαση (builder default):** opt-in globally (ένα `AppConfig` interval, ίδιο lead-time pattern με τα
  υπόλοιπα alert-days settings, 0 = off)· «still using it» button = μόνο timestamp bump, καμία άλλη πλευρική ενέργεια
  (δεν κάνει pause/cancel μόνο του, αφήνει την απόφαση στον χρήστη)· καμία επίδραση σε subscriptions με `pausedUntil`
  ενεργό (P45) — αυτές είναι ήδη ρητά «σε παύση», δεν χρειάζονται νέο nudge.

### P56. Printable QR asset-tag labels για inventory items (scan-to-view) — S/M — OSS (dogfooding-heavy, «Personal Hub» fit)
- **Αξία:** ο Αχιλλέας έχει φυσικό εξοπλισμό σε κουτιά/rack/σπίτια (Battle Station parts, δίκτυο, 3D printer, 2 σπίτια)
  όπου το «ποιο κουτί/ράφι έχει τι» είναι καθαρά φυσικό πρόβλημα οργάνωσης — σήμερα το `Item.location` (free string,
  CLAUDE.md) λέει *πού πρέπει να είναι* αλλά τίποτα δεν γεφυρώνει το φυσικό αντικείμενο με την ψηφιακή εγγραφή του.
  Ένα μικρό **printable QR label ανά item** (κωδικοποιεί direct-link URL στη σελίδα του item, π.χ. `/items?open=<id>`)
  κολλάει πάνω στο κουτί/rack unit → σκανάρεις με το κινητό → βλέπεις specs/warranty/manual (P21 vault)/purchase
  history αμέσως, χωρίς να ψάχνεις στην εφαρμογή. **Μηδέν νέο dependency**: το `jsbarcode` υπάρχει ήδη εγκατεστημένο
  (P20 loyalty cards, client-side, dynamically imported) και υποστηρίζει ήδη format `qrcode` — καθαρό reuse, όχι νέα
  βιβλιοθήκη να επαληθευτεί. **Διακριτό** από P20 (barcode = προϋπάρχον κωδικό καταστήματος, εδώ = link προς το ίδιο
  το app) και P39 (bundles = λογική ομαδοποίηση, όχι φυσική ετικέτα).
  Session-gated: το scan θα πάει σε login αν δεν είσαι ήδη μέσα (ίδιο idiom με το `?next=` round-trip του P5 bookmarklet),
  άρα κανένα δημόσιο exposure δεν χρειάζεται.
- **Module:** Items/Inventory (νέο small component reuse jsbarcode `format:'qrcode'`) + νέα «Print labels» ενέργεια
  (select items → printable sheet, `window.print()` CSS, ίδιο zero-backend pattern με άλλα print-friendly views).
- **Ανοιχτή απόφαση (builder default):** single-item label στο detail modal πρώτα (μικρότερο MVP)· bulk «print sheet
  για N επιλεγμένα items» ως δεύτερο βήμα αν αξίζει· URL μέσα στο QR = relative-to-deployment path (self-host friendly,
  δουλεύει σε οποιοδήποτε domain/IP χωρίς hardcoded host).

### P55. Item resale / disposal proceeds tracking (το «sold» status να αποθηκεύει κάτι) — S — OSS
- **Αξία:** το `Item.status` έχει ήδη τιμές **`sold`/`broken`** (verified: `models/Item.ts` `ITEM_STATUSES`) αλλά
  **κανένα πεδίο δεν αποθηκεύει τίποτα σχετικό με την πώληση** — το να βάλεις ένα item σε `sold` σήμερα είναι απλά
  μια ετικέτα, χωρίς τιμή πώλησης/αγοραστή/ημερομηνία. Ο Αχιλλέας αναβαθμίζει τακτικά hardware (Battle Station parts,
  δίκτυο εξοπλισμός) και συχνά πουλάει το παλιό κομμάτι — σήμερα αυτό το πραγματικό χρηματικό γεγονός (π.χ. πούλησε
  την παλιά κάρτα γραφικών €200) **δεν πιάνεται πουθενά**, ενώ το net-worth (PA2) και το depreciation model (P29)
  θα έδειχναν εσφαλμένα είτε μηδενική αξία (σωστό) είτε ακόμα την παλιά τιμή αν κάποιος ξεχάσει να αλλάξει status.
  Optional `Item.soldPrice`/`soldAt`/`soldTo` (free-form όνομα/site, π.χ. «Skroutz marketplace», «φίλος») στο υπάρχον
  `sold` status flow → realized gain/loss έναντι `purchasedPrice` εμφανίζεται στο item detail + optional **«log as
  income»** one-click (δημιουργεί linked Expense kind=income, opt-in, reuse `addExpense`). **Διακριτό** από P47
  (lending = προσωρινό, το item παραμένει δικό σου) και P44 (RMA = επιστροφή/επισκευή, όχι πώληση).
- **Module:** Items/Inventory (3 νέα optional πεδία στο υπάρχον status-change flow) + optional σύνδεση με Expenses (income).
- **Ανοιχτή απόφαση (builder default):** τα πεδία εμφανίζονται μόνο όταν ο χρήστης θέτει status→`sold` (modal prompt
  ή inline στη φόρμα, κενό = παλιά συμπεριφορά αμετάβλητη)· «log as income» = προαιρετικό κουμπί, ΟΧΙ αυτόματο
  (αποφυγή διπλο-καταγραφής αν ο χρήστης το καταγράψει ήδη χειροκίνητα αλλού).

### P54. Encrypted local backup export (passphrase-protected JSON/ZIP) — S/M — OSS (self-host security lever)
- **Αξία:** το `exportData()` JSON backup + το nightly `backup.sh` (CLAUDE.md) γράφουν **plaintext** αρχεία με
  πλήρη οικονομικά δεδομένα (receipts/expenses/κάρτες/statements) — ένας self-host χρήστης που αντιγράφει αυτά
  τα backups σε λιγότερο έμπιστο μέσο (USB stick, κοινόχρηστος NAS φάκελος, cloud drive χωρίς δικιά του
  encryption) έχει μηδέν προστασία αν διαρρεύσει το αρχείο. Optional **passphrase-protected export** (AES-256-GCM
  + scrypt-derived key, ίδια primitives με το ήδη-shipped MFA secret-at-rest encryption — reuse pattern, όχι νέα
  κρυπτογραφική επιλογή να επαληθευτεί) πάνω στο ήδη-υπάρχον backup JSON· «Restore encrypted backup» path που
  ζητά την passphrase πριν το decrypt+import. **Διακριτό** από §14 (SaaS encryption-at-rest σε επίπεδο DB/storage
  backend, δεν αγγίζει το OSS backup-file flow) και από P48 (staleness alert, όχι confidentiality).
- **Module:** Settings → Storage & backup (Backup/Restore section, νέο toggle+passphrase prompt).
- **Ανοιχτή απόφαση (builder default):** opt-in (default = σημερινό plaintext behavior, μη σπάσει existing
  scripted `backup.sh` flows απροειδοποίητα)· passphrase ζητείται only-in-memory (ποτέ αποθηκευμένο)· αποτυχημένο
  decrypt (λάθος passphrase) = ξεκάθαρο error, όχι silent corruption.

### P53. Pantry / consumables restock reminder (πάνω στο ήδη-υπάρχον to-buy list) — S — OSS (dogfooding-heavy)
- **Αξία:** το `ShoppingListItem` (`/shopping-list`) είναι ήδη ένα ελαφρύ «to-buy» checklist (name/quantity/
  category, tick όταν αγοράστηκε) αλλά **δεν ξέρει να επαναλαμβάνεται** — καταναλώσιμα σπιτιού που τελειώνουν
  περιοδικά (καφές, φίλτρα νερού, χαρτί υγείας, σακούλες σκούπας) σήμερα είτε ξαναγράφονται χειροκίνητα κάθε
  φορά, είτε ξεχνιούνται. Optional `restockIntervalDays` + `lastRestockedAt` ανά named list item (μόνο σε
  entries που το θέλει ο χρήστης, όχι force σε όλα) → όταν περάσει το διάστημα από το τελευταίο «bought»,
  το item **ξαναμπαίνει αυτόματα unchecked** στη λίστα (ίδιο on-read pattern με `generateDueRecurring`).
  **Διακριτό** από P49 (utility meter = μετρήσιμη κατανάλωση kWh/m³, όχι διακριτά καταναλώσιμα) και από τα
  durable-goods Items/Inventory (τα οποία δεν «τελειώνουν» ποτέ, απλώς φθείρονται/αντικαθίστανται).
- **Module:** `/shopping-list` (2 νέα optional πεδία στο `ShoppingListItem` + on-read re-surface logic).
- **Ανοιχτή απόφαση (builder default):** πεδίο εμφανίζεται μόνο όταν ο χρήστης το θέσει ρητά (edit ανά item,
  κενό = one-off όπως σήμερα)· «bought» (check) ενημερώνει αυτόματα `lastRestockedAt = now`· μηδέν notification
  αρχικά (MVP = απλά re-surface στη λίστα, δεν χρειάζεται bell/ntfy).

### P52. Recurring household task/chore templates (Tasks module) — S/M — OSS, «Personal Hub» fit
- **Αξία:** το `Task` model έχει σήμερα **μόνο one-off `dueDate`** (κανένα recurring/repeat πεδίο, verified με
  grep) — δουλειές σπιτιού που επαναλαμβάνονται σε τακτό διάστημα (πότισμα φυτών κάθε βδομάδα, καθάρισμα
  φίλτρων UniFi rack, backup-verify κάθε μήνα, cleaning nozzle 3D printer) σήμερα είτε ζουν έξω από την
  εφαρμογή, είτε ο χρήστης πρέπει να ξαναφτιάχνει το ίδιο task χειροκίνητα κάθε φορά που το κλείνει. Optional
  `Task.repeatEveryDays` (+ αυτόματο re-spawn μιας νέας `todo` instance μία περίοδο μπροστά όταν η τρέχουσα
  γίνεται `done`, mirror του ήδη-shipped spawn-on-pay pattern του Bill/P28). **Διακριτό** από P41 (item-scoped
  maintenance, δεμένο σε συγκεκριμένο owned item) — αυτό είναι **γενικό** repeating chore, χωρίς απαραίτητο
  linked item (π.χ. «βγάλε τα σκουπίδια» δεν έχει Item).
- **Module:** Tasks (νέο optional πεδίο + spawn-on-complete logic).
- **Ανοιχτή απόφαση (builder default):** spawn-on-complete (ΟΧΙ background generator, ίδιο ντετερμινιστικό
  MVP-first pattern με P28/P45)· κενό `repeatEveryDays` = σημερινή one-off συμπεριφορά αμετάβλητη· optional
  linked item παραμένει, δεν αφαιρείται.

### P51. Mobile app-lock (Face ID / Touch ID / device PIN) — S — both (mobile-native, trust lever)
- **Αξία:** το Expo app σήμερα ανοίγει κατευθείαν στα δεδομένα μόλις είναι logged-in (token-based session,
  βλ. `MOBILE_PARITY.md`) — αν κάποιος βρει το ξεκλείδωτο κινητό, βλέπει receipts/expenses/inventory χωρίς άλλο
  εμπόδιο. Ένα **local app-lock** (biometric ή device PIN πριν εμφανιστεί οτιδήποτε μετά το cold-start/resume από
  background) είναι καθαρά mobile-native προστασία, ΔΕΝ αγγίζει το server-side auth (§9 web MFA είναι διαφορετικό
  πράγμα: λογαριασμός vs φυσική συσκευή). Μικρό effort (`expo-local-authentication`, ήδη στο Expo SDK managed
  workflow) με πραγματική αξία εμπιστοσύνης για ένα app που κρατά οικονομικά δεδομένα σπιτιού.
  **Διακριτό** από §9 (TODO, web account MFA/TOTP) και από P31 (household roles — αυτό είναι per-device, όχι
  per-user permission).
- **Module:** Mobile (`apps/mobile`) — νέο lock-screen gate στο app entry/resume + Settings toggle.
- **Ανοιχτή απόφαση (builder default):** opt-in toggle (default off, ώστε να μη σπάσει κανέναν existing χρήστη
  απροειδοποίητα)· fallback σε device passcode όταν βιομετρικά μη διαθέσιμα/αποτύχουν (όχι δικό του PIN, reuse
  του OS)· lock on background→foreground resume, όχι μόνο cold start.

### P50. Special dates & gift reminders (γενέθλια/επέτειοι) — S — OSS, «Personal Hub» fit
- **Αξία:** το PHAROS backronym (CLAUDE.md) είναι ρητά «Personal Hub», αλλά κανένα module σήμερα δεν κρατά τις πιο
  βασικές επαναλαμβανόμενες προσωπικές ημερομηνίες — γενέθλια/επέτειοι φίλων/οικογένειας. Ένα μικρό `SpecialDate`
  (όνομα, τύπος free-form, ημ/μηνία **χωρίς υποχρεωτικό έτος** — οι γιορτές επαναλαμβάνονται ετησίως, όχι one-off)
  + lead-time alert (reuse `dispatchAlert`, ίδιο pattern με τα υπόλοιπα lead-time settings) καλύπτει ένα πραγματικό
  καθημερινό need. **Bonus σύνδεση με P43** (public wishlist link): όταν προστεθεί το P43, μια ειδοποίηση «η γιορτή
  του Χ σε 5 μέρες» θα μπορούσε να δείχνει κατευθείαν το wishlist link του, αλλά αυτό το item στέκεται και μόνο του
  χωρίς εξάρτηση. **Διακριτό** από P42 (documents = στατικά έγγραφα με λήξη, όχι επαναλαμβανόμενες γιορτές) και
  P37 (commitment-end = οικονομική δέσμευση).
- **Module:** νέο μικρό «Special dates» module (list+quick-add, reuse notifier pipeline) + optional homepage widget.
- **Ανοιχτή απόφαση (builder default):** recurring-by-month-day (όχι πλήρες έτος, εκτός αν ο χρήστης θέλει να
  δείχνει ηλικία/χρόνια γάμου — προαιρετικό `yearOfBirth`/`sinceYear` field)· ένα ενιαίο lead-time setting (ίδιο
  με warranty/trial/bill patterns)· κανένα linked-item/gift-tracking αρχικά (MVP = ημερομηνία + υπενθύμιση μόνο).

### P49. Utility meter reading / consumption tracker (kWh/m³, όχι μόνο το ποσό λογαριασμού) — S/M — OSS (dogfooding-heavy)
- **Αξία:** τα Expenses παρακολουθούν ήδη το **ποσό** των λογαριασμών (ΔΕΗ/ΟΤΕ/νερό, βλ. CLAUDE.md ιστορικό expense
  recovery) αλλά όχι την **κατανάλωση** (kWh/m³) πίσω από εκείνο το ποσό — δύο σπίτια (κεντρικό + εξοχικό Kalamos,
  βλ. P34 spaces) με διαφορετικά προφίλ χρήσης θα μπορούσαν να δείξουν αν μια αύξηση οφείλεται σε τιμή/tariff ή σε
  πραγματική αυξημένη κατανάλωση (π.χ. διαρροή νερού, νέα συσκευή). Νέο μικρό `MeterReading` (utility type
  electricity/water/gas/other free-form, ημ/reading value, optional linked space από P34) → trend chart +
  computed period-consumption (delta μεταξύ διαδοχικών readings). **Διακριτό** από το ήδη-υπάρχον expense
  price-hike detector (P14, που πιάνει μόνο το **ποσό**, όχι τη φυσική κατανάλωση) και από P41 (maintenance =
  φυσική εργασία, όχι μετρήσιμη ποσότητα).
- **Module:** νέο μικρό «Utilities» module (ίδιο μέγεθος με Bill/GiftCard/LoyaltyCard — standalone list+chart) +
  optional σύνδεση με Expenses (P34 space) για side-by-side κόστος-vs-κατανάλωση.
- **Ανοιχτή απόφαση (builder default):** manual reading entry μόνο (μηδέν smart-meter integration σε αυτή τη
  φάση)· utility type free-form string (όχι hardcoded enum, ίδιο pattern με P42 document type)· καμία alert αρχικά
  εκτός αν ζητηθεί ρητά (MVP = tracking + chart, όχι notification).

### P47. Item lending tracker (δανεικά σε φίλους/οικογένεια) — S/M — OSS
- **Αξία:** πραγματικό «Personal Hub» κενό (βλ. CLAUDE.md backronym) — ο χρήστης έχει ακριβό εξοπλισμό (Battle
  Station parts, δίκτυο, εργαλεία, gadgets) που μπορεί να δανείζει σε φίλους/οικογένεια. Σήμερα κανένα module δεν
  κρατά «ποιος το έχει τώρα και πότε το περιμένεις πίσω» — το item status μένει owned (received/installed) σαν να
  είναι ακόμα στο σπίτι. Νέο optional `Item.lentTo` (free-form name) + `lentAt`/`expectedReturnAt` + «mark
  returned» action → badge στην κάρτα («→ δανεισμένο σε X») + overdue-return alert. **Διακριτό** από P44 (RMA =
  προϊόν πάει σε κατασκευαστή για επισκευή, όχι σε φίλο) και P41 (maintenance = φυσική συντήρηση, όχι δανεισμός).
- **Module:** Items/Inventory (νέα optional πεδία + «mark returned» action) + Notifications (overdue-return nudge).
- **Ανοιχτή απόφαση (builder default):** free-form όνομα δανειζόμενου (καμία σύνδεση με λογαριασμό χρήστη/P31)·
  `expectedReturnAt` optional (κενό = «out on loan» χωρίς προθεσμία, χωρίς alert)· διαθέσιμο μόνο σε
  owned items (received/installed), όχι shopping.

### P45. Subscription pause/skip χωρίς πλήρη ακύρωση — S — both
- **Αξία:** σήμερα το `Subscription.active` είναι δυαδικό on/off. Αν κάποιος παγώσει προσωρινά μια συνδρομή
  (π.χ. γυμναστήριο «freeze» 2 μήνες, ταξίδι, εποχική υπηρεσία), η μόνη επιλογή είναι είτε να τη σβήσει/κάνει
  inactive (χάνει τον υπολογισμό renewal/ιστορικό μόλις την ξανα-ενεργοποιήσει), είτε να τη μείνει active και να
  ξεχάσει ότι έπαψε πραγματικά να χρεώνεται (λάθος στα cash-flow/reports προβλέψεις). Νέο optional `pausedUntil`
  (Date|null) → renewal/alert/calendar/cash-flow υπολογισμοί την αγνοούν μέχρι εκείνη την ημερομηνία, μετά
  ξαναμετράει αυτόματα ως ενεργή χωρίς χειροκίνητο unpause. Ντετερμινιστικό, reuse `computeNextRenewal`.
- **Module:** Subscriptions (+ Calendar/Reports/safe-to-spend υπολογισμοί που ήδη διαβάζουν `active`).
- **Ανοιχτή απόφαση (builder default):** «Pause until…» date picker στη φόρμα (κενό = όχι paused)· expired pause
  ξαναμετράει αυτόματα στο επόμενο load (όχι background job, ίδιο on-read pattern με το `generateDueRecurring`).

### P44. Warranty claim / RMA tracker (κύκλος ζωής μιας πραγματικής επιστροφής) — S/M — OSS (κυρίως)
- **Αξία:** σήμερα το warranty tracking σταματά στο «λήγει σε Nd» (expiry alert). Καμία δομή δεν καλύπτει τι
  γίνεται **όταν χαλάσει κάτι και ανοίγεις πραγματικό RMA/claim**: ημ. αναφοράς βλάβης, αριθμός RMA/ticket του
  κατασκευαστή/καταστήματος, status (submitted/shipped-for-repair/replaced/refunded/rejected), tracking number,
  συνημμένα (email αλληλογραφίας, φωτο βλάβης). Ο Αχιλλέας έχει πολλά ακριβά electronics (RTX 5080, δίκτυο,
  Battle Station) όπου ένα RMA μπορεί να κρατήσει εβδομάδες — σήμερα αυτό ζει μόνο σε memory/email, όχι στο app.
  **Διακριτό** από P38 (Insurance = ασφάλιστρα που πληρώνεις, όχι claims πάνω σε προϊόντα) και το υπάρχον
  warranty-expiry alert (εδώ = ενεργή διαδικασία μετά τη βλάβη, όχι προειδοποίηση πριν τη λήξη).
- **Module:** Items/Inventory (νέο optional `Item.warrantyClaims[]` subdoc ή lightweight top-level model, reuse
  storage pattern του P21 vault για συνημμένα) + Notifications (stale-claim nudge, π.χ. «καμία ενημέρωση 14+ μέρες»).
- **Ανοιχτή απόφαση (builder default):** embedded subdoc πάνω στο Item (απλούστερο, ίδιο pattern με το `attachments[]`
  του P21) αντί νέο top-level module· status ως enum (submitted/in-repair/replaced/refunded/rejected)· manual
  entry μόνο (μηδέν AI email-parsing σε αυτή τη φάση).

### P43. Public read-only wishlist share link (χωρίς login, για δωροεπιλογή) — S/M — both (SaaS = growth lever)
- **Αξία:** τα shopping-status items είναι ήδη ένα δομημένο wishlist (τίτλος/τιμή/link/specs) αλλά ορατό μόνο στον
  ίδιο τον χρήστη. Ένα **read-only, token-scoped public URL** (π.χ. `/wishlist/<token>`) που δείχνει μόνο επιλεγμένα
  shopping items (όχι owned/inventory, όχι οικονομικά στοιχεία σπιτιού) θα επέτρεπε σε φίλους/οικογένεια να δουν τι
  θέλει κάποιος για δώρο, χωρίς λογαριασμό. Χρήσιμο ΚΑΙ ως **SaaS growth loop**: μια δημόσια branded σελίδα Pharos
  που βλέπουν μη-χρήστες = οργανικό awareness (παρόμοιο μηχανισμό με τα Calendly/Splitwise share links).
  **Διακριτό** από P5 (browser ext = εισαγωγή προς τα μέσα) και P23 (mobile share-sheet = επίσης inbound capture)·
  εδώ η ροή είναι **προς τα έξω** (μοιράζεσαι μια λίστα).
- **Module:** νέο endpoint/route `/wishlist/[token]` (public, καμία auth) + Items/Shopping (opt-in per-item ή
  per-list toggle «include in shared wishlist») + Settings (generate/rotate/revoke token, ίδιο pattern με το
  `calendarToken` του P6).
- **Ανοιχτή απόφαση (builder default):** ένα token ανά χρήστη (όχι per-list), opt-in checkbox ανά item (default
  off — ρητή επιλογή τι μοιράζεσαι)· η δημόσια σελίδα δείχνει ΜΟΝΟ τίτλο/φωτο/τιμή/store-link, ΠΟΤΕ οικονομικά
  aggregates ή owned inventory.

### P42. Personal document expiry tracker (διαβατήριο, ταυτότητα, δίπλωμα, άδεια κυκλοφορίας) — S/M — OSS (κυρίως), «Personal Hub» fit
- **Αξία:** το PHAROS backronym είναι ρητά «Personal Hub» (CLAUDE.md), αλλά κανένα module σήμερα δεν κρατά τα πιο
  βασικά **προσωπικά έγγραφα με ημερομηνία λήξης** (διαβατήριο, ταυτότητα, δίπλωμα οδήγησης, κάρτα διαμονής, άδεια
  κυκλοφορίας οχήματος/ΚΤΕΟ) — μόνο αντικείμενα (Items) και ασφαλιστικά συμβόλαια (P38) έχουν αυτή τη δομή.
  Ένα μικρό generic «Document» record (τύπος, κάτοχος, αριθμός, ημ. λήξης, συνημμένο σκαναρισμένο PDF/φωτο) +
  renewal alert (reuse `dispatchAlert`) καλύπτει ένα πραγματικό predictable ανάγκη κάθε νοικοκυριού.
  **Διακριτό** από P38 (Insurance = επαναλαμβανόμενο ασφάλιστρο, όχι στατικό έγγραφο) και P21 (item vault = per-item
  αρχεία, όχι person-level έγγραφα άσχετα με συγκεκριμένο αντικείμενο).
- **Module:** νέο μικρό «Documents» module (list+detail, reuse storage/upload pattern του P21) + Notifications (renewal).
- **Ανοιχτή απόφαση (builder default):** standalone module (όχι tab πάνω σε άλλο, το lifecycle είναι διαφορετικό)·
  free-form `type` (όχι hardcoded enum, ώστε να καλύπτει τοπικές παραλλαγές εγγράφων)· optional κάτοχος (name string,
  για νοικοκυριά με πάνω από ένα άτομο, βλ. P31)· ίδιο renewal lead-time pattern με P28/P33 (`AppConfig` alert-days).

### P41. Maintenance / service reminders για owned items (όχι εγγύηση, όχι χρέωση) — S/M — OSS (dogfooding-heavy)
- **Αξία:** η εγγύηση λήγει μια φορά· τα Bills/Subscriptions είναι οικονομικές υποχρεώσεις· αλλά πολλά owned
  αντικείμενα χρειάζονται **περιοδική φυσική συντήρηση χωρίς κόστος/λογαριασμό** — καθάρισμα φίλτρων στο UniFi
  rack, αλλαγή nozzle/καθάρισμα στο 3D printer, dust-cleaning στο Battle Station PC, rotation σε κάτι εποχικό.
  Νέο optional `Item.maintenanceIntervalDays` + `lastMaintenanceAt` (+ «mark done» button που ξαναθέτει το
  timer) → computed «next due» + alert (reuse `dispatchAlert`). Ντετερμινιστικό, μηδέν AI. **Διακριτό** από
  warranty (one-time expiry, όχι recurring) και P37 (commitment-end = οικονομική δέσμευση, όχι φυσική εργασία).
- **Module:** Items/Inventory (2 νέα optional πεδία + «mark maintenance done» action) + Notifications.
- **Ανοιχτή απόφαση (builder default):** πεδία μόνο σε items με status received/installed (owned, όχι shopping)·
  «mark done» απλά προωθεί το `lastMaintenanceAt` σε σήμερα (χωρίς ιστορικό log αρχικά, MVP)· κανένα preset
  interval ανά κατηγορία (ο χρήστης βάζει το δικό του αριθμό).

### P39. Item bundles / builds — group inventory items σε ένα named project με cost roll-up — S/M — OSS (κυρίως, dogfooding-heavy)
- **Αξία:** πραγματικό κενό που ο ίδιος ο Αχιλλέας θα χρησιμοποιούσε άμεσα (βλ. CLAUDE.md: «Battle Station» PC
  build, «10G upgrade list», rack build) — σήμερα τα items έχουν μόνο free-form tags, χωρίς δομημένο **parent
  project/build** που να αθροίζει το συνολικό κόστος. Νέο optional `Item.bundleId` (self-ref σε ένα «bundle»
  item ή lightweight `Bundle` doc με title+notes) → item detail δείχνει «part of: Battle Station (€X invested,
  N parts)»· νέα λίστα «Builds» (ή φίλτρο μέσα στο Inventory) με roll-up total (Σ purchasedPrice/currentPrice
  των members) + status (πόσα ordered/received/installed). **Διακριτό** από tags (freeform, χωρίς rollup) και
  P13 (export, όχι organizational grouping).
- **Module:** Items/Inventory (νέο πεδίο + optional μικρό Bundle model) + Reports (per-bundle cost, προαιρετικό).
- **Ανοιχτή απόφαση (builder default):** bundle = lightweight embedded/simple collection (όχι πλήρες νέο module
  με CRUD UI αρχικά)· MVP = tag-like picker στη φόρμα item + read-only roll-up view, χωρίς νέο top-level nav.

### P37. Fixed-term contract / commitment-end tracker (πότε μπορώ να ακυρώσω χωρίς ποινή) — M — both
- **Αξία:** οι Subscriptions (auto-recurring χρεώσεις) και τα Bills (P28, one-off/manual payables) δεν καλύπτουν
  μια τρίτη κατηγορία: **δεσμεύσεις με ελάχιστη διάρκεια** (γυμναστήριο 12μηνο, κινητή τηλεφωνία 24μηνο δέσμευση,
  ενοικίαση) όπου η ερώτηση δεν είναι «πότε χρεώνομαι» αλλά **«από πότε μπορώ να ακυρώσω χωρίς ποινή/χωρίς να
  χάσω κατατεθειμένη προκαταβολή»**. Νέο πεδίο `commitmentEndsAt` (+ optional `noticeDays` για προειδοποίηση
  ακύρωσης) πάνω σε Subscription (reuse, όχι νέο module) ή νέο μικρό `Contract` αν χρειάζεται distinct lifecycle
  (π.χ. ενοικιαστήρια χωρίς recurring amount). Alert «η δέσμευση για X λήγει σε Nd — μπορείς να ακυρώσεις».
  **Διακριτό** από P33 (trial-end = δωρεάν→πληρωμένη μετάβαση) και Bills/Subscriptions (recurring αλλά χωρίς
  «lock-in» έννοια).
- **Module:** Subscriptions (νέο optional πεδίο, πιθανό reuse) + Notifications.
- **Ανοιχτή απόφαση (Αχιλλέας):** reuse Subscription model (+2 optional πεδία, απλούστερο) ή νέο dedicated
  `Contract` model (καθαρότερο semantics αλλά νέο module) — builder default αν δεν λυθεί ρητά: reuse Subscription
  (μικρότερο effort, ίδιο notification pipeline με P33).

### P38. Insurance policy tracker (ασφάλειες που πληρώνεις, όχι export για αποζημίωση) — M — OSS (κυρίως), SaaS δευτερευόντως
- **Αξία:** το P13 είναι export bundle **για να κάνεις claim** μετά από ζημιά (proof-of-ownership PDF). Κανένα
  module σήμερα δεν κρατά τις ίδιες τις **ασφαλιστικές συμβάσεις** που πληρώνει κάποιος (σπίτι/αυτοκίνητο/υγεία/
  ζωή): ασφαλιστική εταιρεία, αριθμός συμβολαίου, ετήσιο/μηνιαίο ασφάλιστρο, ημ. ανανέωσης, ασφαλιζόμενα
  αντικείμενα (optional link σε Items), στοιχεία ασφαλιστικού συμβούλου, συνημμένο PDF συμβολαίου. Renewal alert
  (reuse notifier pipeline). Ταιριάζει στο «personal hub» concept (CLAUDE.md) πέρα από pure-finance.
- **Module:** νέο μικρό «Insurance» module (list+detail, reuse storage/upload pattern) + Notifications (renewal).
- **Ανοιχτή απόφαση (builder default):** simple standalone module (όχι tab σε Vouchers — διαφορετικό lifecycle,
  μεγαλύτερα ποσά/μεγαλύτερος κύκλος)· optional linked Items (π.χ. ασφάλεια σπιτιού → κανένα linked item,
  ασφάλεια gadget → linked)· renewal reminder = ίδιο pattern με P33/P28 lead-time.

### P81. Αυτόματο (scheduled) trigger του notification/alert engine — ✅ SHIPPED 2026-08-03 (pharos-daily-dev, commit `fda8c96`)
- **Υλοποίηση:** νέο **`app/api/cron/alerts/route.ts`** (POST) που καλεί το ήδη-υπάρχον `runAlertChecks()` **χωρίς
  καμία αλλαγή στο ίδιο το scanning**. Self-host only (404 όταν SAAS_MODE on, ο builder default τηρήθηκε: το
  `runAlertChecks` διαβάζει την κοινή βάση χωρίς tenant scoping, οπότε σε multi-tenant θα έστελνε τα νούμερα
  λάθος tenant σε όποιον κρατά το secret). `CRON_SECRET` bearer, fail-closed 500 όταν λείπει. Το χειροκίνητο
  κουμπί «Check & notify now» έμεινε ατόφιο, απλά έπαψε να είναι το μοναδικό trigger. Νέο **`lib/cronAuth.ts`**
  (`cronTokenMatches`/`checkCronAuth`): το constant-time compare υπήρχε ήδη σε **τρία** ιδιωτικά αντίγραφα στα
  SaaS cron routes, οπότε μπήκε σε κοινό helper αντί για τέταρτο αντίγραφο (τα υπάρχοντα ΔΕΝ αγγίχτηκαν, είναι
  territory του saas-core). `docs/self-hosting.md`: νέα ενότητα «Scheduling the alert sweep» (crontab recipe +
  τι σημαίνει κάθε status code) **+ πραγματική διόρθωση doc bug**: το `CRON_SECRET` καθόταν στον πίνακα
  «SaaS-only — self-hosted deployments should leave all of these blank», δηλαδή τα docs έλεγαν στον self-hoster
  να αφήσει κενή ακριβώς τη μεταβλητή που ανάβει τα alerts.
- **⚠ Το κρίσιμο εύρημα (middleware, όχι το route):** το `src/middleware.ts` matcher εξαιρούσε `api/auth|api/mcp|
  api/v1` αλλά **ΟΧΙ** `api/cron`, οπότε το session gate απαντούσε σε ένα σωστά υπογεγραμμένο cron request με
  σκέτο text `401 Unauthorized` **πριν τρέξει καν ο handler** — δηλαδή το feature θα ήταν διακοσμητικό. Βρέθηκε
  **μόνο με live probe**: τα route unit tests καλούν το `POST()` απευθείας και **παρακάμπτουν εντελώς το
  middleware**, άρα δομικά δεν μπορούν να το δουν. Fix: `api/cron` στο exclusion + νέο **`middleware.matcher.test.ts`**
  που κλειδώνει **και τις δύο** κατευθύνσεις (bearer endpoints εκτός gate, `/api/files` μέσα — too-loose εδώ θα
  σέρβιρε κάθε απόδειξη/PDF σε όποιον ξέρει URL).
- **Verify:** negative control ΠΡΙΝ, σε 4 gates: drop του length guard στο timingSafeEqual → 4 κόκκινα, fail-open
  στο απόν CRON_SECRET → 4 κόκκινα, drop του SAAS_MODE gate → 1 κόκκινο, drop του `api/cron` από το matcher → 1
  κόκκινο. 31 νέα tests (11 cronAuth + 10 route + 10 matcher). `npm run type-check` EXIT 0· full `npx vitest run`
  **5567 passed / 350 files**. **Live στο container**: πριν το middleware fix → plain `401 Unauthorized`· μετά →
  JSON `500 {"error":"CRON_SECRET is not configured"}` (fail-closed, ο handler τρέχει), ενώ το `/api/files`
  παραμένει σωστά `401`. Build cache pruned.
- **Εκκρεμεί (χρειάζεται τον Αχιλλέα):** (α) `CRON_SECRET` στο δικό του `.env` + restart (δεν αγγίζω `.env`)·
  (β) ένα πραγματικό happy-path run ΔΕΝ έγινε σκόπιμα, γιατί θα έστελνε **αληθινές** ειδοποιήσεις στα δικά του
  κανάλια (ntfy/Discord/push) — το ίδιο το scanning καλύπτεται ήδη από το `actions.alertChecks.test.ts` και από
  το κουμπί που χρησιμοποιεί ήδη.
- **Παράπλευρο εύρημα (flagged, ΟΧΙ διορθωμένο):** τα **δύο προϋπάρχοντα SaaS cron routes έχουν το ΙΔΙΟ bug** —
  `POST /api/saas/usage/sample` και `/api/saas/trials/sweep` live-verified να επιστρέφουν plain `401` από το
  middleware, άρα είναι απροσπέλαστα από εξωτερικό scheduler. Territory του saas-core → καταγράφηκε στο
  `~/.claude/ASK_ACHILLEAS.md` (`pharos-daily-dev-20260803-1145`) με πρόταση να μετακομίσουν κάτω από `/api/cron/`.
- **Αξία (αρχικό):** live-verified `grep -rn "runAlertChecks" apps/web/src/app/api` = 0 hits — το πλήρες, ήδη-shipped
  notification framework (§3 στο `TODO.md`, 8 alert kinds: deal/installment/warranty/pricehike/trialend/giftcard/
  bill + budget-exceeded, `runAlertChecks()` στο `app/settings/actions.ts`) έχει **μηδέν** αυτόματο μηχανισμό να
  τρέξει· το μοναδικό call-site είναι το χειροκίνητο κουμπί «Check & notify now» (`SettingsClient.tsx`). Πρακτικό
  αποτέλεσμα: ένα self-hosted instance που τρέχει μήνες χωρίς ο χρήστης να ανοίξει Settings και να πατήσει το
  κουμπί **δεν στέλνει ΠΟΤΕ** κανένα από τα 8 alerts, ό,τι κι αν έχει ρυθμιστεί (ntfy/Discord/Slack/Telegram/
  webhook, §3 ήδη-shipped). Αυτό ήταν ήδη γνωστό ως «μελλοντικό» από το πολύ παλιό CLAUDE.md session log
  (2026-06-07: «δόσεις/warranty alerts δουλεύουν manual ή με cron [μελλοντικό]») αλλά ποτέ δεν έγινε δικό του
  backlog item έκτοτε — ξεχάστηκε ανάμεσα σε άλλα shipped features. **Υπάρχει ήδη ατόφιο το pattern** που χρειάζεται:
  `CRON_SECRET`-gated bearer-token routes για ακριβώς αυτόν τον σκοπό, ήδη proven στο SaaS side
  (`app/api/saas/usage/sample/route.ts`, `app/api/saas/trials/sweep/route.ts` — `timingSafeEqual` constant-time
  compare, fail-closed 500 αν λείπει το secret) — απλά κανένα ισοδύναμο route δεν υπάρχει για το self-host
  `runAlertChecks`. `docs/self-hosting.md` ήδη τεκμηριώνει το `CRON_SECRET` env var και δείχνει το idiom
  («Point BACKUP_DIR at your NAS mount and schedule it via cron») — ένα δεύτερο cron entry για τα alerts θα
  ταίριαζε φυσικά στο ίδιο README section.
- **Module:** νέο `app/api/cron/alerts/route.ts` (ή `app/api/v1/cron/alerts`, ίδιο naming idiom με τα SaaS
  `api/saas/*/sweep|sample` routes) — POST, `CRON_SECRET` bearer guard, καλεί το ήδη-υπάρχον `runAlertChecks()`
  χωρίς καμία αλλαγή στο ίδιο το alert-scanning· `docs/self-hosting.md` νέα γραμμή στο crontab example.
- **Ανοιχτή απόφαση (builder default):** self-host-only (SaaS side έχει ήδη το δικό του ξεχωριστό
  `trials/sweep`/`usage/sample` sweep-cadence, δεν χρειάζεται migration)· route επιστρέφει 404 όταν SAAS_MODE
  ενεργό (ίδιο gating idiom με το `usage/sample`, ίδιο rationale: «δεν υπάρχει» σε multi-tenant context όπου κάθε
  tenant έχει τα δικά του notification settings)· καμία αλλαγή στο ήδη-shipped manual «Check & notify now» κουμπί
  (παραμένει, απλά παύει να είναι το ΜΟΝΟ trigger)· documentation-only default cadence πρόταση (π.χ. `0 9 * * *`,
  μία φορά το πρωί) — όχι hardcoded στο ίδιο το app, ο χρήστης ελέγχει τη συχνότητα μέσω του δικού του cron.

### P66. Ο AI assistant «βλέπει» μόνο 3-7 από τα 12+ μοντέλα — ✅ SHIPPED 2026-08-03 (pharos-daily-dev, commit `d774dd4`)
- **Υλοποίηση:** `searchAll` → **12 συλλογές** (+Bill/Goal/GiftCard/LoyaltyCard/ShoppingListItem, ίδιο
  `$or`/regex pattern· `SearchHit['type']` union +5, οπότε ο compiler ανάγκασε και το `TYPE_ICON` του
  `AiCommandBar` να συμπληρωθεί). `modelFor` → **10 τύποι** μέσω `EDITABLE_MODELS` map + `EDITABLE_TYPES`
  (τροφοδοτεί ΚΑΙ τα enum των tool schemas, ώστε registry και dispatcher να μη μπορούν να ξεσυγχρονιστούν).
- **⚠ Δύο carve-outs ασφάλειας, απόκλιση από το «ό,τι είναι searchable πρέπει να είναι editable»:**
  (α) **`statement` ΕΞΑΙΡΕΙΤΑΙ** — είναι το **μοναδικό** searchable μοντέλο **χωρίς `softDeletePlugin`** (το
  unique `{card, period}` index θα μπλόκαρε re-import μήνα όσο trashed αντίγραφο κρατά τη θέση, τεκμηριωμένο
  στο CLAUDE.md). Ένα delete δεν θα αναιρούνταν, άρα η ίδια η υπόσχεση του `delete_record` («recoverable from
  Trash for 30 days») θα ήταν **ψέμα**. Το `receipt` εξαιρείται με το ίδιο σκεπτικό (σαρωμένο έγγραφο με
  αρχείο/line items/installment links). Και τα δύο παραμένουν **searchable** (αυτό ήταν το νόημα του P22).
  (β) **`GiftCard.uses` / `Goal.contributions`** = ledgers χρημάτων από τα οποία **παράγεται** το υπόλοιπο →
  blocked, και **με ρητή άρνηση, ΟΧΙ σιωπηλό drop** (ένας assistant που ακούει «done» θα ανέφερε στον χρήστη
  αλλαγή υπολοίπου που δεν συνέβη). Dotted paths (`uses.0.amount`) ελέγχονται στο root key.
- **Correctness fix εν παρόδω:** το `update_record` επέστρεφε «Updated the item.» **ακόμα και για id που δεν
  ταίριαζε με τίποτα** → πλέον και τα δύο tools ελέγχουν `matchedCount`. Το revalidate έγινε **per-type** map
  αντί για blanket refresh 4 routes σε κάθε edit.
- **Deep links ανά σελίδα, όχι ομοιόμορφο `?open=`:** gift/loyalty cards ζουν σε **tabs** μέσα στο `/vouchers`,
  οπότε το `VouchersShell` διαβάζει `?tab=` (**μία φορά σε state** — το `useOpenParam` του παιδιού σβήνει το
  query string και θα επανέφερε το tab στα coupons αν το διάβαζα reactively) + `useOpenParam` στα δύο clients
  (archived → ανοίγει και το «show archived», αλλιώς το modal θα άνοιγε πάνω σε λίστα που δεν το περιέχει).
  Το loyalty hit ανοίγει το **barcode view**, όχι τη φόρμα (ψάχνεις κάρτα στο ταμείο). Goals → `/reports#goals`
  και shopping-list → `/shopping-list` **χωρίς** `?open=`: δεν έχουν detail modal, μια υπόσχεση ανοίγματος θα
  ήταν κενή.
- **Verify:** negative control ΠΡΙΝ — επαναφορά statement/receipt στο map → **4 κόκκινα**· σιωπηλό drop των
  blocked fields → **5 κόκκινα**. 29 νέα tests (νέο `aiTools.records.test.ts` με 15 που τρέχει τον ΠΡΑΓΜΑΤΙΚΟ
  `execute()` dispatcher με mocked boundaries — το `aiTools.test.ts` κάλυπτε σκόπιμα μόνο το pure registry, άρα
  το μοναδικό μονοπάτι όπου ένα LLM γράφει στη βάση ήταν **ακάλυπτο**· +14 στο `search-actions.test.ts`). Το
  υπάρχον contract assertion (`enum === ['item','task','subscription']`) **σωστά κοκκίνισε** και ενημερώθηκε
  ρητά. `npm run type-check` EXIT 0· full `npx vitest run` **5590 passed / 4 skipped**. Docker rebuild + serve
  check: `/login` 200, `/vouchers?tab=giftcards` & `/shopping-list` 307 (auth-gated, compiled), RestartCount 0,
  browser pane μηδέν console errors, build cache pruned.
- **ΣΗΜ (όχι δικό μας regression):** το `notifications/actions*.test.ts` κοκκίνισε 2-5 tests σε δύο full runs
  **λόγω 5s timeout υπό φόρτο** (πολλά routines + Docker builds μαζί)· με `--testTimeout=30000` περνούν και τα
  34. Μηδέν import από τα αρχεία που άγγιξα (grep-verified). Αξίζει timeout bump από όποιον έχει το territory.
- **Αξία (αρχικό):** live-verified: το `app/search-actions.ts` `searchAll()` (τροφοδοτεί ΚΑΙ το navbar global search ΚΑΙ το
  AI command-bar `search_data` tool) ψάχνει μόνο **7** μοντέλα (item/receipt/statement/task/subscription/expense/
  voucher). Χειρότερο ακόμα: το `app/aiTools.ts` `modelFor()` (πίσω από `update_record`/`delete_record`) δέχεται
  **μόνο 3** τύπους (`item`/`task`/`subscription`) — δηλαδή ο AI assistant μπορεί να **βρει** ένα expense/receipt/
  voucher αλλά όχι να το επεξεργαστεί/σβήσει μέσω φυσικής γλώσσας, και είναι εντελώς **τυφλός** σε **5 ολόκληρα
  μοντέλα** που έχουν προστεθεί έκτοτε: `Bill` (P28), `Goal` (P12), `GiftCard` (P32), `LoyaltyCard` (P20),
  `ShoppingListItem`. Ένα «πρόσθεσε στη λίστα ψώνια γάλα» ή «σημείωσε το ΔΕΗ bill ως πληρωμένο» μέσω του AI command
  bar σήμερα αποτυγχάνει σιωπηλά ή γυρνάει λάθος απάντηση, ενώ το ίδιο ερώτημα λειτουργεί άψογα για ένα task/item/
  subscription. Καθαρό consistency/completeness gap σε ένα ήδη-δουλεμένο pipeline, όχι νέα αρχιτεκτονική.
- **Module:** `app/search-actions.ts` (searchAll — προσθήκη 5 μοντέλων) + `app/aiTools.ts` (modelFor + tool
  descriptions/system prompt — επέκταση σε όλα τα searchable types).
- **Ανοιχτή απόφαση (builder default):** επέκτεινε και τα δύο σε **όλα** τα user-facing μοντέλα με ένα search
  index (ίδιο `$or`/regex pattern με τα υπάρχοντα 7)· `modelFor` επεκτείνεται συμμετρικά με searchAll (ό,τι είναι
  searchable πρέπει να είναι edit/delete-able, ίδιο soft-delete pattern με τα ήδη-υπάρχοντα)· `GiftCard.uses[]`
  spend-log μένει εκτός update/delete μέσω AI (πιο ασφαλές να μένει UI-only, αποφυγή λάθος αλλαγής υπολοίπου).

### P74. Backup restore verification (αυτόματο integrity self-test, όχι μόνο export) — ✅ SHIPPED 2026-08-04 (pharos-daily-dev)
- **Τι έγινε:** νέο pure `lib/backupVerify.ts` (`verifyBackupJson`) + action `verifyBackup` + κουμπί «Verify…»
  στο Settings → Storage & backup, ΚΑΙ pre-flight μέσα στο `importData`. Δύο επίπεδα: **error** = το αρχείο δεν
  είναι χρησιμοποιήσιμο backup (κενό, truncated, χωρίς envelope, μηδέν έγγραφα) → η επαναφορά **αρνείται**·
  **warning** = κάτι θα παραλειφθεί (λείπουσα/μη-λίστα συλλογή, entries που δεν είναι έγγραφα, έγγραφα χωρίς
  `_id`, άγνωστα keys) → η επαναφορά **προχωρά** αλλά τα αναφέρει. **Απόκλιση από το spec, σκόπιμη**: το
  «διάβασε το τελευταίο τοπικό backup αρχείο από `~/Backups/pharos/`» είναι αδύνατο, ο web container mount-άρει
  ΜΟΝΟ το `./data/storage` και δεν βλέπει τον φάκελο του host· ο χρήστης δίνει το αρχείο (file picker), που
  καλύπτει και ένα αρχείο κατεβασμένο από το remote mirror.
- **Πλευρικό κέρδος:** το `importData` παλιά έκανε σιωπηλό `continue` σε χαλασμένη συλλογή και επέστρεφε
  «restored 0» ως επιτυχία· τώρα λέει τι έπεσε έξω.

### P74 (αρχικό spec, για ιστορικό) — S — OSS (self-host trust lever)
- **Αξία:** live-verified `grep -rn "verifyBackup|backupHealth|restoreTest|integrityCheck" apps/web/src` = 0 hits.
  Το ήδη-shipped `exportData()` (Settings → Backup/Restore) + το nightly `backup.sh` (CLAUDE.md) **γράφουν** το
  backup αρχείο αλλά ποτέ δεν το ξανα-διαβάζουν για να επιβεβαιώσουν ότι είναι έγκυρο JSON με τα αναμενόμενα
  collections/counts — ένα σιωπηλά κομμένο/corrupted backup (δίσκος γέμισε στη μέση της εγγραφής, bad JSON) δεν
  γίνεται αντιληπτό μέχρι την πραγματική στιγμή ανάγκης restore, δηλαδή τη χειρότερη δυνατή στιγμή. Νέο μικρό
  **«Verify last backup»** action (Settings → Storage & backup): διαβάζει το πιο πρόσφατο export/backup αρχείο,
  ελέγχει valid JSON + αναμενόμενα top-level keys/collection counts > 0 (χωρίς πραγματικό restore/side-effect) →
  «✓ Verified 2026-07-29, 240 receipts, 66 items, ...» ή ξεκάθαρο error αν κάτι λείπει/είναι corrupted. **Διακριτό**
  από P54 (encryption-at-rest, δεν αγγίζει το plaintext backup flow) και P48 (mirror-sync staleness = έφτασε στο
  remote ή όχι, όχι αν το ίδιο το περιεχόμενο είναι έγκυρο).
- **Module:** Settings → Storage & backup (νέο read-only action πάνω στο ήδη-υπάρχον export/backup path).
- **Ανοιχτή απόφαση (builder default):** MVP = structural validation μόνο (valid JSON + non-zero collection
  counts + βασικό schema-shape check), ΟΧΙ πλήρες test-restore σε sandbox DB (πολύ πιο ακριβό/ρίσκο για S item)·
  ελέγχει το τελευταίο τοπικό backup αρχείο (`~/Backups/pharos/` ή το configured backup dir), δεν κατεβάζει από
  remote mirror (out of scope εδώ, αυτό είναι το P48).

### P48. Storage mirror sync-staleness alert (backup peace-of-mind) — S — both
- **Αξία:** ο χρήστης έχει ήδη remote mirror (OneDrive/SMB/FTP, βλ. CLAUDE.md) αλλά το sync είναι **μόνο
  χειροκίνητο** («Sync now» στο Settings → File storage) — αν ξεχαστεί για βδομάδες, το remote αντίγραφο μένει
  σιωπηλά πίσω από τα τοπικά αρχεία, ενώ ο χρήστης νομίζει ότι έχει ενεργό 3-2-1 backup. Κανένα σημείο σήμερα
  δεν κρατά «πότε ολοκληρώθηκε το τελευταίο επιτυχές sync» ούτε ειδοποιεί αν περάσει πολύς καιρός χωρίς ένα.
  Νέο: αποθήκευσε `lastSuccessfulSyncAt` (ήδη υπάρχει το ίδιο το sync action, μόνο λείπει το timestamp-write) →
  alert (reuse `dispatchAlert`) όταν περάσουν >N μέρες από το τελευταίο επιτυχές sync ΚΑΙ backend≠local ΚΑΙ
  mirror ενεργό. Ντετερμινιστικό, μηδέν AI. **Διακριτό** από P40 (update-available = νέα έκδοση app, όχι backup
  freshness) — εδώ ο κίνδυνος είναι δεδομένα, όχι λογισμικό.
- **Module:** Settings → File storage (νέο timestamp πεδίο στο AppConfig) + Notifications.
- **Ανοιχτή απόφαση (builder default):** default threshold 7 μέρες (ρυθμιζόμενο, ίδιο lead-time pattern με τα
  υπόλοιπα alert-days)· no-op όταν backend=local ή mirror off (δεν έχει νόημα το alert).

### P46. Expense duplicate detection & merge (mirror του ήδη-υπάρχοντος pattern) — S — OSS
- **Αξία:** τα Receipts, Stores, και Items έχουν ήδη ένα δουλεμένο «find duplicates» modal (group κατά κλειδί +
  review + merge, βλ. `findDuplicateReceipts`/`findDuplicateStores`/`findDuplicateItems`) — τα **Expenses δεν
  έχουν το ίδιο**, παρόλο που ο κίνδυνος υπάρχει εξίσου (διπλό import ενός λογαριασμού, ίδια recurring εγγραφή
  δύο φορές λόγω race στο auto-mirror-on-verify ή διπλό CSV/YNAB import). Ίδιο group-by (vendorKey+ημέρα+ποσό,
  ίδιο κλειδί με το recurring-detection/anomaly) + merge, ελάχιστο νέο effort αφού το UI pattern
  (`DuplicatesModal`-style) υπάρχει ήδη τρεις φορές ως πρότυπο να αντιγραφεί.
- **Module:** Expenses (+ Income, ίδιο μοντέλο/kind πεδίο).
- **Ανοιχτή απόφαση (builder default):** group by `vendorKey` (ήδη υπάρχει η normalize function) + ίδια ημέρα +
  ποσό· reuse UI pattern από το `ReceiptsClient` DuplicatesModal ατόφιο (ίδιο review-before-merge flow).

### P40. Self-host update-available banner (GHCR version check) — S — OSS (adoption/retention lever)
- **Αξία:** το TODO §4 δημοσιεύει ήδη versioned images στο GHCR (`vX.Y.Z`/`latest`), αλλά ένας self-host χρήστης
  δεν έχει **κανέναν** τρόπο μέσα στο app να μάθει ότι υπάρχει νεότερη έκδοση εκτός αν παρακολουθεί χειροκίνητα
  το repo. Ένα απλό check (τρέχον `APP_VERSION` env/build-arg vs GHCR `/latest` tag μέσω public registry API,
  cached 24ωρο) → «Update available: vX.Y.Z» banner στο Settings → About, με link στο changelog/release notes.
  Μηδέν auth χρειάζεται (public package), μηδέν telemetry προς τα έξω (μόνο GET προς GHCR). **Διακριτό** από
  §4 (publish pipeline) — εδώ το **consumption-side** signal στον χρήστη.
- **Module:** Settings → General/About (+ μικρό `lib/versionCheck.ts`).
- **Ανοιχτή απόφαση (builder default):** best-effort, no-op αν το network call αποτύχει (self-host πίσω από
  firewall)· opt-out toggle (κάποιοι δεν θέλουν το app να κάνει outbound calls)· off by default στο SaaS
  (irrelevant, always latest).

### P33. Free-trial / cancel-before-charge reminder — ✅ SHIPPED 2026-07-12 (pharos-daily-dev, commit bfd96ba)
- **Υλοποίηση:** `Subscription.trialEndsAt` (Date|null) + optional `firstChargeAmount` (auto-serialized). Νέο **`trialend`
  NotifKind** (Notification enum + NotifKind union + AUTO_KINDS): `computeAlerts` → active subs με `trialEndsAt` εντός
  lead-time window (days≥0 && ≤`trialAlertDays`)· dedupeKey `trialend:<id>:<date>` (re-alert αν μετακινηθεί η ημ.,
  auto-expire αφού περάσει). Bell = AlarmClock/purple + `notif.trialSub`/`trialTodaySub` (en+el). ntfy γραμμή στο
  `runAlertChecks` («⏳ N free trial(s) ending ≤Xd: …»). SubForm πεδία «Free trial ends» (date) + «First charge»
  (fallback στο recurring amount). **Lead-time ρυθμιζόμενο** (όπως ζητούσε το backlog): `AppConfig.trialAlertDays`
  (default 2) + appSettings (+2 test assertions) + Settings → Defaults input + `saveDefaults` (0 = off). Ντετερμινιστικό,
  μηδέν AI. Verify: type-check EXIT 0, vitest 1978 passed. **Follow-up:** τα νέα πεδία δεν εκτίθενται ακόμα στο v1
  mobile API (`trim()` shape) → mobile-parity item. Docker serve-check pending (VM contention).
- **Module:** Subscriptions (+ Notifications bell/ntfy).

### P32. Gift-card / store-credit balance tracker (υπόλοιπα που φθίνουν) — ✅ SHIPPED 2026-07-13 (pharos-daily-dev)
- **Αξία:** πραγματικό κενό — τα Vouchers είναι **coupons** (% έκπτωση/κωδικός) και το P20 είναι **loyalty barcode**· κανένα
  δεν κρατά ένα **χρηματικό υπόλοιπο** (δωροκάρτα, store credit από επιστροφή, prepaid) που **μειώνεται** καθώς το ξοδεύεις.
  Απλό: κάρτα με αρχικό ποσό + καταχωρήσεις χρήσης → τρέχον υπόλοιπο + «λήγει σε Nd» alert + «ξέχασες €X σε 3 κάρτες».
- **Module:** νέο μικρό «Gift cards / credit» (ή tab στα Vouchers) + Notifications (expiry/unused reminder).
- **Ανοιχτή απόφαση (builder default):** tab μέσα στα Vouchers πρώτα (μοιάζει με voucher lifecycle)· υπόλοιπο = αρχικό −
  Σ(χρήσεις)· optional «spend €X» button που δημιουργεί linked expense (opt-in). Ντετερμινιστικό, μηδέν AI.

### P34. Per-space / per-property ledger tag (2 σπίτια, προσωπικό vs κοινό) — ✅ SHIPPED 2026-07-14 (pharos-daily-dev, commit 6b1de5c)
- **Υλοποίηση (MVP = Expenses first):** `Expense.space` (optional string, indexed) + serialization + `SerializedExpense.space`
  + `AppConfig.spaces` (string[]) + `appSettings.spaces` (empty = feature dormant, casing preserved για ελληνικά ονόματα,
  κανένα forced «other») μέσω νέου pure `normalizeSpaces()` (dedupe case-insensitive, cap 40 chars / 24 spaces). Το space
  **κληρονομείται** από την τελευταία εγγραφή του ίδιου vendor στα scans (μια απόδειξη ΔΕΗ κρατά το space της). `ExpensesClient`:
  sidebar Space filter (+ «Unassigned» sentinel) + form field + space chip σε card/row (κρύβεται μέχρι να οριστεί space).
  Reports: κάρτα «Expenses by space» (μόνο όταν υπάρχει ≥1 named space). Settings → Stores & lists: `SpacesManager`
  (add/remove → `saveSpaces`). `SearchableSelect` απέκτησε optional `labels` map (sentinel → display label). i18n keys ΜΟΝΟ
  στο en.ts (locales fallback). Ντετερμινιστικό, μηδέν AI, μηδέν migration. **Verify:** type-check EXIT 0, full vitest 2129 passed.
  **Follow-ups:** space σε Receipts/Subscriptions, CSV-import space column, `/api/v1` expenses shape (mobile parity),
  global space-filter σε όλα τα money views (τώρα μόνο Expenses/Income). Docker serve-check skipped (VM με 2 live stacks).
- **Αξία:** ο Αχιλλέας έχει **δύο σπίτια** (κεντρικό + εξοχικό Kalamos)· σήμερα δεν μπορεί να δει «πόσο κοστίζει το εξοχικό».
  First-class **space/ledger** πεδίο (π.χ. «Σπίτι», «Εξοχικό», «Δουλειά») σε expenses/receipts/subscriptions + global
  space-filter σε όλα τα money views + per-space totals στα Reports. **Διακριτό** από §8 multi-tenancy (ξεχωριστές βάσεις)
  και P31 household (πολλαπλά logins)· εδώ = οργάνωση **των δικών σου** δεδομένων σε χώρους. Τα tags υπάρχουν αλλά είναι
  free-form χωρίς roll-up· ένα δομημένο space δίνει καθαρό per-property P&L.
- **Module:** cross-cutting (Expenses/Receipts/Subscriptions + Reports + Settings για τη λίστα spaces).
- **Ανοιχτή απόφαση (builder default):** ένα optional `space` string (editable list σαν τα categories)· κενό = «όλα»·
  reuse του taxonomy pattern· default view = all-spaces (μη βαρύνει όποιον δεν το χρησιμοποιεί).

### P35. Expense splitting / «ποιος χρωστάει τι» (Splitwise-lite) — ✅ SHIPPED 2026-07-15 (pharos-daily-dev)
- **Υλοποίηση:** Νέο pure **`lib/split.ts`** (`equalSplit`, `splitTotals`, `computeBalances`, `totalOwed` + `SplitEntry`,
  DB-free, **+11 unit tests**). `Expense.split[]` subdoc (name/share/settled, `_id:false`) + serialize + `SerializedExpense.split`.
  Convention: ΕΣΥ πλήρωσες το total· κάθε entry = άλλο άτομο (ελεύθερο όνομα, ΟΧΙ app account) που σου χρωστά `share`,
  `settled` = σε πλήρωσε πίσω· το δικό σου μερίδιο = total − Σ(shares) implicit. `actions.ts`: `split` στο UpdateSchema +
  `cleanSplit` (trim/drop nameless/round cents) wired σε add/update + νέο **`settlePerson(name)`** (bulk-mark settled ΟΛΩΝ
  των unsettled shares ενός ατόμου, case-insensitive, cross-expense). UI (`ExpensesClient`): **SplitEditor** μέσα στη φόρμα
  (expense-only· add person, per-row share + mark-paid toggle, «Split equally» με «count me in» checkbox, «your share»
  live), **SplitBadge** σε card/row (cyan owed / accent ✓ όταν settled), header **«Balances»** button (μόνο expense +
  ≥1 split· «who owes you» modal με per-person owed + settle-up confirm). Builder defaults: equal-split absorbs το rounding
  στο ΕΣΥ όταν includeSelf· settle-up = manual mark-paid· μηδέν AI, μηδέν migration (default []). i18n keys ΜΟΝΟ en.ts.
- **Verify:** `npm run type-check` EXIT 0· full `npx vitest run` **2154 passed / 168 files**. Safe Docker rebuild
  (VM 8GB, ~1GB in use → όχι contention): homepage-web clean start (0 restarts), /login 200, /expenses & /income 307
  (auth-gate compiled), Mongo healthy throughout, build cache pruned.
- **Follow-ups:** split στο `/api/v1` expenses shape (mobile parity)· optional linked-expense/settle-up ιστορικό·
  per-space × per-person cross-view (P34 συνδυασμός). Income δεν έχει split (μόνο expenses χρεώνονται).
- **Module:** Expenses (νέο `split[]` ανά έξοδο) + «Balances» modal (ποιος χρωστάει σε ποιον).

### P36. Open Banking auto-sync συναλλαγών (GoCardless/Nordigen EU free tier) — L — both (μεγάλος SaaS lever)
- **Αξία:** το επόμενο σκαλί μετά το PA1 (χειροκίνητο CSV): **αυτόματο** import συναλλαγών μέσω Open Banking (GoCardless
  Bank Account Data = δωρεάν EU tier, ελληνικές τράπεζες υποστηρίζονται) → οι χρεώσεις μπαίνουν μόνες τους, dedupe +
  category inheritance (reuse PA1 pipeline). Ισχυρότατο SaaS differentiator· OSS = BYO GoCardless secret (self-host).
  **Διακριτό** από PA1 (manual), §13 (bots), P11 (email IMAP).
- **Module:** νέος `lib/openBanking.ts` connector + Settings → Data (connect bank) + Expenses (ingest).
- **Ανοιχτή απόφαση (Αχιλλέας):** μεγάλο (OAuth-style consent flow, token refresh, ανά-τράπεζα quirks, 90d re-consent).
  Ξεκίνα με έναν provider (GoCardless) + read-only· metered/paid στο SaaS, BYO-key στο OSS. ΣΗΜ: L — τελευταίο σε σειρά.

### P27. Suggested budgets από ιστορικό δαπανών — ✅ SHIPPED 2026-07-10 (pharos-daily-dev)
- **Υλοποίηση:** «Suggest from history» button στο Settings → Budgets (`suggestBudgets()` action + pure
  `lib/budgetSuggest.ts` + 10 unit tests). Locked defaults: median των 3 τελευταίων ΠΛΗΡΩΝ μηνών ανά κατηγορία
  (ο τρέχων μερικός μήνας εξαιρείται), στρογγυλοποίηση στα €5, skip κατηγορίες με <2 μήνες. Pre-fill (suggest ≠
  auto-apply) → ο χρήστης ελέγχει πριν αποθηκεύσει. Μηδέν AI, μηδέν migration. Commit `773a0e9`.
- **Αξία:** το να στήσεις budgets είναι σήμερα χειροκίνητο (κενό input ανά κατηγορία → οι περισσότεροι δεν το κάνουν
  ποτέ). «Suggest budgets» υπολογίζει προτεινόμενο όριο ανά κατηγορία από τον μ.ο. των τελευταίων 3-6 μηνών (+ προαιρετικά
  ελαφρύ padding) → ένα κλικ γεμίζει όλα τα budgets. Μηδέν AI, ντετερμινιστικό, reuse των υπαρχόντων expense aggregations.
- **Module:** Budgets (Settings → General) + Reports «Budget · this month».
- **Ανοιχτή απόφαση (builder default):** median 3 μηνών ανά κατηγορία, στρογγυλοποίηση στα €5· ο χρήστης επεξεργάζεται
  πριν αποθηκεύσει (suggest ≠ auto-apply)· κατηγορίες με <2 μήνες δεδομένων παραλείπονται.

### P28. Bill / payable status tracker (due → paid → overdue) — ✅ SHIPPED 2026-07-13 (pharos-daily-dev, commit a737bbc)
- **Υλοποίηση:** Νέο standalone `/bills` module (builder-default «new small Bills», όχι tab). `models/Bill.ts`
  (title/vendor/amount/dueDate/paidAt/category/cycle/notes/archived/linkedExpenseId + soft-delete + updatedAt index) +
  pure `lib/bill.ts` (`billStatus` paid/overdue/due-soon/upcoming derived από dueDate+paidAt, `billDaysUntilDue`,
  `nextBillDue`, **+22 unit tests**). `bills/actions.ts`: CRUD, soft-delete→Trash, `markBillPaid`/`markBillUnpaid`.
  **markBillPaid** μπορεί opt-in να λογάρει matching expense (reuse `addExpense`) και για recurring bill (cycle set)
  **spawn-άρει την επόμενη pending instance** μία περίοδο μπροστά (builder-default: spawn-on-pay, ΟΧΙ background
  generator → ντετερμινιστικό, μηδέν idempotency churn). `BillsClient`: triage list (overdue→due-soon→upcoming→paid),
  open/overdue/paid/all filters, one-click mark-paid, per-bill modal (repeat + category datalist), total-due +
  overdue-count header. **Notifications**: νέο `bill` NotifKind (bell + ntfy `runAlertChecks`) για unpaid bills που είναι
  overdue ή due εντός `billAlertDays`· dedupeKey κρατά τη due date (re-alert στο move, auto-expire όταν paid· overdue
  nag χωρίς lower bound). `AppConfig.billAlertDays` default 5 + appSettings (+2 test assertions) + Settings → Defaults
  input (0 = off). Nav link (Money group) + homepage NavCard (open-bills count) + Trash type `bill` (+ v1 route).
  i18n keys ΜΟΝΟ στο en.ts (source of truth· locales fallback). Μηδέν migration, μηδέν AI.
- **Verify**: `npm run type-check` EXIT 0· full `npx vitest run` **2117 passed / 164 files**. Docker rebuild + serve-check:
  homepage-web clean start (0 restarts), /login 200, /bills 307 (auth-gated route compiled), Mongo healthy throughout,
  build cache pruned. **Follow-ups**: GET `/api/v1/bills` (mobile parity)· Calendar paid-vs-pending coloring (skipped
  για focus — τα recurring bills δεν διπλο-προβάλλονται εκεί ακόμα).
- **Αξία (αρχικό):** πραγματικό κενό — σήμερα οι subscriptions είναι *αυτόματες* χρεώσεις και το `/calendar` μόνο **προβάλλει**
  μελλοντικές, αλλά κανένα module δεν κρατά τον κύκλο ζωής ενός λογαριασμού που **πληρώνεις χειροκίνητα** (ΔΕΗ/ΟΤΕ/κοινόχρηστα):
  «due, το πλήρωσα;, ξεχάστηκε → overdue». Bill με status (pending/paid/overdue) + «mark paid» (προαιρετικά δημιουργεί expense)
  + overdue alert. Reuse recurring-series + `runAlertChecks`/`dispatchAlert`. **Διακριτό** από P7 (discover untracked) & P19 (cashflow αριθμός).
- **Module:** νέο μικρό «Bills» (ή tab στα Expenses) + Notifications + Calendar (paid vs pending χρωματισμός).
- **Ανοιχτή απόφαση (builder default):** recurring bill templates → auto-generate pending instances ανά κύκλο· «mark paid»
  δημιουργεί expense (opt-in link)· overdue = due date πέρασε & όχι paid.

### P29. Asset depreciation model για αξία inventory — ✅ SHIPPED 2026-07-10 (pharos-daily-dev)
- **Αξία:** η αξία των owned assets μένει «κολλημένη» στην τιμή αγοράς εκτός αν την ενημερώνεις χειροκίνητα → net-worth
  (PA2) και insurance export (P13) υπερεκτιμούν. Απλό depreciation curve ανά κατηγορία (π.χ. electronics −X%/έτος,
  straight-line ή declining) → computed «estimated current value» από ημ. αγοράς. Ντετερμινιστικό, μηδέν AI, reuse purchasedPrice/date.
- **Module:** Items/Inventory (computed πεδίο, όχι stored) + Reports/PA2 net-worth + P13 export.
- **Ανοιχτή απόφαση (builder default):** default rates ανά κατηγορία (editable Settings), floor στο ~10% salvage·
  computed on-read (όπως το expense `anomaly`)· manual override ανά item κερδίζει πάντα.

### P30. Mobile push notifications (Expo) για alerts & reminders — ✅ ΗΔΗ SHIPPED πριν την έγκριση (commit `2156a83`, 2026-06-29)
- **Εύρημα (9η σάρωση planner, 2026-07-14, verified by daily-dev πριν χτίσει κάτι νέο):** αυτό το item ήταν ΗΔΗ πλήρως
  υλοποιημένο μήνες πριν μπει στο backlog ως candidate — προφανώς μια παλιότερη σάρωση δεν το έπιασε ως done. Πλήρες
  pipeline: `User.pushTokens` (model) + `apps/web/src/lib/expoPush.ts` (`isExpoPushToken`, `sendExpoPush`, `pushAllDevices`,
  batching 100/request, best-effort/never-throws) + `POST/DELETE /api/v1/push/register` (Bearer-gated, format-validated,
  tests σε `route.test.ts`) + `apps/mobile/src/push.ts` (`registerForPush`/`unregisterForPush`, guarded no-op σε
  simulator/Expo-Go-iOS/χωρίς EAS project) + wired στο `App.tsx` (register on auth, unregister on sign-out) + `runAlertChecks`
  καλεί `pushAllDevices('Pharos alerts', summary)` fire-and-forget. **Μόνο ό,τι χρειάζεται πραγματικό EAS dev build +
  Apple APNs key/Android FCM (physical device) μένει αδοκίμαστο** — αυτό ήταν ήδη γνωστό ως «Needs Achilleas» στο
  `MOBILE_PARITY.md` roadmap #8 πριν από αυτή τη σάρωση. Καμία αλλαγή κώδικα χρειάστηκε· μόνο διόρθωση του doc (ήταν
  stale, έλεγε ακόμα ότι χρειάζεται να χτιστεί).
- **Module:** Mobile (Expo Notifications + token registration) + `/api/v1` (register device) + `runAlertChecks` (push fan-out).

### P31. Household / shared access — multi-user σε ένα self-host instance — ✅ SHIPPED 2026-07-27 (pharos-daily-dev, commit 1346b4d)
- **Υλοποίηση (βλ. PROGRESS.md 2026-07-27 cont.²)**: τρίτος ρόλος `viewer` **μαζί με πραγματικό enforcement** σε δύο
  chokepoints (το ένα `withAuth` wrapper του `/api/v1` → 403 σε κάθε μη-read method· `assertCanWrite()` στην κορυφή
  136 mutating server actions) + `writeGuard.coverage.test.ts` που ρίχνει το build αν μια νέα mutating action μείνει
  αφύλακτη. Δύο bugs διορθώθηκαν στην πορεία (ο τελευταίος admin μπορούσε να γίνει viewer και να κλειδώσει το
  instance· το `setUserRole` προήγαγε σιωπηλά viewer σε member). Verify: type-check EXIT 0, vitest 4717 passed.
  **Εκκρεμεί μόνο** live login με τους 3 ρόλους (χρειάζεται τον Αχιλλέα στο πληκτρολόγιο).
- **Αξία:** μια οικογένεια/νοικοκυριό θέλει **πολλαπλά logins πάνω στα ίδια δεδομένα** (κοινό inventory/έξοδα) με
  ρόλους (admin/member/viewer) + «ποιος καταχώρησε τι» attribution. Ισχυρό OSS self-host lever και σπόρος για το
  SaaS team-plan. **Διακριτό από §8** (multi-tenancy = ξεχωριστές βάσεις) και **§9** (SaaS-grade email verify/MFA/OAuth).
- **Module:** Auth/Users (ρόλοι + invite εντός instance) + cross-cutting attribution (createdBy).
- **Απόφαση που χρειάζεται (Αχιλλέας):** in-instance multi-user για το OSS, ή single-user OSS + βασίσου αποκλειστικά στο §8
  multi-tenancy; **δεν λύθηκε ρητά στην έγκριση** → builder default = shared-data + 3 ρόλοι (admin/member/viewer), χωρίς email/MFA στο OSS tier.
- **Scoping research 2026-07-19 (pharos-daily-dev, 4ο consecutive deferral — αλλά τώρα με ακριβή θεμελίωση, ΟΧΙ
  ξανά «άγγιξε auth, ρίσκο»)**: research agent χαρτογράφησε το ΥΠΑΡΧΟΝ auth σύστημα πριν αποφασίσω να deferάρω
  ξανά. **Σημαντική διόρθωση της αρχικής premise**: το «shared-data» μοντέλο του P31 **ήδη υπάρχει 100% σήμερα**
  — `models/User.ts` έχει ήδη `role: 'admin'|'member'` enum, JWT session (`lib/auth.ts`/`lib/session.ts`,
  `requireAdmin()`/`requireUser()` idiom), πλήρες Settings→Users CRUD (`app/settings/users.actions.ts`:
  create/delete/setRole/changePassword — άμεση δημιουργία, ΧΩΡΙΣ invite/email flow, ήδη ακριβώς όπως το «no
  email/MFA» builder default ζητούσε), first-run setup wizard. **Confirmed μηδέν per-user data filtering
  πουθενά** (`items/actions.ts`/`expenses/actions.ts` δεν κάνουν καν `requireUser()` πριν το read/write) — άρα
  ΚΑΘΕ logged-in χρήστης βλέπει ήδη ΟΛΑ τα δεδομένα, exactly the P31 shared-data model.
  **Το πραγματικό κενό (3 πράγματα)**: (1) 3ος ρόλος `viewer` λείπει (σήμερα δυαδικό admin/member μόνο,
  τύπος σε 3 σημεία: `User.ts`, `lib/session.ts` `Role` type, `users.actions.ts` `UserRow`)· (2) **μηδέν
  enforcement οπουδήποτε** — κανένα existing mutating action ελέγχει role πριν γράψει (το SaaS-side membership
  σύστημα ΕΧΕΙ ήδη ένα καθαρό 3-role ladder να μιμηθεί: `lib/tenancy/members.ts` `canManageMembers`/
  `canAssignRole`, pure+testable idiom — καλό πρότυπο, αλλά χρειάζεται wiring σε **δεκάδες** mutating actions
  cross-domain [items/expenses/receipts/statements/subscriptions/vouchers/tasks])· (3) `createdBy` attribution
  = μηδέν σήμερα, πουθενά σε κανένα μοντέλο.
  **Γιατί ΞΑΝΑ-deferred (και όχι απλά προσθήκη του enum)**: προσθέτοντας `viewer` στο UI/enum ΧΩΡΙΣ πλήρες
  enforcement θα ήταν **χειρότερο από το να μην υπάρχει καθόλου** — ψευδής αίσθηση ασφάλειας (ο χρήστης θα
  έδινε σε κάποιον «viewer» νομίζοντας ότι δεν μπορεί να γράψει, ενώ στην πραγματικότητα θα μπορούσε πλήρως,
  αφού μηδέν action θα το ήλεγχε). Το πλήρες enforcement αγγίζει live production data σε δεκάδες αρχεία, με
  **μηδέν τρόπο να το επαληθεύσω end-to-end unattended** (χρειάζεται live login ως 3 διαφορετικούς ρόλους,
  credentials που δεν έχω)· αξίζει ένα δικό του **supervised session** (ο Αχιλλέας δοκιμάζει live), όχι άλλο
  ένα best-effort autonomous run. Η ίδια απόφαση με τα 3 προηγούμενα runs, αλλά τώρα τεκμηριωμένη ακριβώς —
  το επόμενο run (ή ο Αχιλλέας) μπορεί να ξεκινήσει κατευθείαν από αυτό το scoping χωρίς re-research.

### P22. Full-text search πάνω σε receipt line-items & parsed text — ✅ SHIPPED 2026-07-10 (pharos-daily-dev, commit 68acb9a)
- **Υλοποίηση:** το `searchAll` ήδη έκανε match σε `lineItems.name`/`lineItems.refinedName` σε επίπεδο query
  (substring/regex, μηδέν migration — builder default τηρήθηκε), αλλά ένα receipt hit έδειχνε ΜΟΝΟ το store name,
  οπότε ένα query σαν «sn570» προσγειωνόταν σε απόδειξη χωρίς ορατό λόγο. Νέο pure **`lib/receiptSearch.ts`**
  `matchedLineItemName(rx, lineItems)` (κρατημένο εκτός του `'use server'` ώστε να μένει sync + unit-testable,
  **+7 tests**): επιστρέφει το πρώτο line item που ματσάρει (refinedName preferred για display), non-global regex
  required (no lastIndex state). Το `searchAll` κάνει select τα line-item πεδία και **παρακάμπτει** το lookup όταν
  το ίδιο το store name ματσάρει (το store ΕΙΝΑΙ ο λόγος) → το matched προϊόν μπαίνει στο subtitle του hit
  («where did I buy this?»). Ντετερμινιστικό, μηδέν AI, μηδέν migration. Default = line-item names (όχι raw AI text,
  λιγότερο noise/privacy) — όπως το spec.
- **Verify:** `npm run type-check` EXIT 0· full `npx vitest run` **2160 passed / 169 files**. Docker serve-check
  skipped (VM με 2 live stacks — additive server-action καλυμμένο από tests). **Follow-up:** το v1 search endpoint (αν
  υπάρξει mobile global-search) θα εκθέσει το ίδιο matched-line-item πεδίο· Mongo `$text` index μόνο αν χρειαστεί perf.
- **Module:** Search (+ Receipts data shape).
- **Σημείωση (orphaned WIP recovered):** η υλοποίηση κάθονταν uncommitted στο tree από ~2026-07-10· προηγούμενα runs
  την πέρασαν ως «ξένο WIP» και την απέφευγαν, μπλοκάροντας το #1 value/effort Approved item. Αναγνωρίστηκε ως
  routine artifact (P22 comments, pure-helper+vitest pattern), validated + committed.

### P24. Outbound event webhooks / automation hooks (Home Assistant / n8n) — ✅ SHIPPED 2026-07-19 (pharos-daily-dev)
- **Υλοποίηση:** νέο **`models/AppConfig.eventWebhooks`** (array of `{id,url,secret,enabled,label,events[]}`,
  distinct από το `notifiers` array — εκείνο στέλνει human-readable alert summaries, αυτό στέλνει ένα signed JSON
  POST ανά structured event). Client/server split σαν το `notifiers.shared.ts`/`notifiers.ts`: νέο
  **`lib/webhooks.shared.ts`** (τύποι + `WEBHOOK_EVENTS` meta, client-safe) + **`lib/webhooks.ts`** (server —
  `signWebhookPayload` Stripe-style `t=<unix>,v1=<hmac-sha256 hex>` πάνω σε `${t}.${body}`, `dispatchEventWebhooks`
  fan-out σε κάθε enabled+subscribed subscription μέσω `Promise.allSettled` [ποτέ throw], `getEventWebhooks`
  tenant-scoped read μέσω `currentModel(AppConfig)`). **SSRF guard**: κάθε outbound POST περνά από
  `assertPublicUrl()` πριν το fetch (ο ίδιος guard validate-άρει και στο save, ώστε ένα κακό URL να μην κάθεται
  σιωπηλά αποτυγχάνοντας κάθε delivery)· **rate-limit** (SaaS): νέο `WEBHOOK_RATE_LIMIT`/`WEBHOOK_RATE_WINDOW_MS`
  env, reuse του `rateHit()` pure helper (apiRateLimit.ts) πάνω σε ξεχωριστό per-subscription store, off by
  default (μηδέν επίδραση σε self-hosted).
- **4 events, κρεμασμένα στα ήδη-υπάρχοντα trigger points (καμία νέα event-bus)**: **`receipt.parsed`** →
  `receipts/actions.ts` (`uploadReceipt` + `rescanReceipt`, μόνο όταν το AI όντως parse-άρει, όχι σε draft/AI-off
  saves)· **`budget.exceeded`** → νέο pure **`lib/budgetAlert.ts`** `detectBudgetExceeded()` (+7 unit tests,
  DB-free, flat-budget only — ΧΩΡΙΣ το envelope/rollover math του Reports page, builder-simplified v1) wired στο
  `runAlertChecks` (`settings/actions.ts`)· **`installment.due`** και **`price.drop`** → reuse των ήδη
  υπολογισμένων `dueThisMonth`/`deals` μέσα στο ίδιο `runAlertChecks`. Σημείωση cadence: το `runAlertChecks`
  καλείται σήμερα ΜΟΝΟ χειροκίνητα (Settings → Notifications → «Check & notify now» — δεν υπάρχει cron στο
  codebase, ίδιο pre-existing gap με τα υπόλοιπα alert checks)· το UI copy το εξηγεί ρητά.
- **UI**: νέο **`WebhookManager`** section μέσα στο υπάρχον Settings → Notifications tab (όχι νέο top-level
  «Integrations» tab — μικρότερο diff, ίδιο section pattern με το ήδη-υπάρχον notifier-channels editor ακριβώς
  από πάνω). Κάρτα ανά subscription: label, URL, secret (server-generated στο save αν αφεθεί κενό, copy button),
  toggle chips για τα 4 events, enabled switch, per-subscription «Test» button. Actions:
  `getWebhookSubscriptions`/`saveWebhookSubscriptions`/`testWebhookSubscription` (settings/actions.ts, mirror του
  notifier-channels τριάδας).
- **Verify**: `npm run type-check` EXIT 0. Full `npx vitest run` **2311 passed / 180 files** (+13 νέα: 6
  `webhooks.test.ts` + 7 `budgetAlert.test.ts`, μηδέν regression). Safe Docker rebuild — **1 build error
  βρέθηκε+διορθώθηκε**: αρχικά είχα `export { WEBHOOK_EVENTS }`/`export type { WebhookSubscription }`
  re-exports μέσα στο `'use server'` actions.ts, που έσπασε το build («A "use server" file can only export
  async functions, found object» — Next.js περιορισμός). Fix: αφαιρέθηκαν, το client component εισάγει
  types/metadata απευθείας από το `webhooks.shared.ts` (ήδη το έκανε ούτως ή άλλως). Μετά το fix: build OK,
  `RestartCount=0`, `docker logs` καθαρό (μόνο το προϋπάρχον άσχετο `@napi-rs/canvas` warning), `/login` 200
  (browser-checked, «Sign in · Pharos», μηδέν console errors). `/settings` δεν testable UI-level χωρίς τα
  credentials του Αχιλλέα (ίδιος περιορισμός με κάθε προηγούμενο run).
- **Follow-up (out of scope εδώ)**: μηδέν v1 mobile API/UI (web-only, όπως κάθε recent Settings-only feature)·
  το `budget.exceeded` δεν λαμβάνει υπόψη envelope/rollover mode (P25) — flat budget only· κανένα cron καλεί το
  `runAlertChecks` σήμερα (pre-existing gap, ΟΧΙ κάτι που εισήγαγε το P24)· ένα webhook receiver πρέπει να
  διαβάσει το header `X-Pharos-Signature` (`t=…,v1=…`) και να επαληθεύσει HMAC-SHA256 πάνω σε `${t}.${rawBody}`
  με το secret του, ίδιο σχήμα με το Stripe.

### P23. Mobile share-sheet quick capture (share-to-Pharos) — M — both (mobile-native, ψηλό value/effort)
- **Αξία:** από ΟΠΟΙΑΔΗΠΟΤΕ app (Photos, Files, browser, email PDF) → «Share → Pharos» → η φωτο/PDF μπαίνει
  κατευθείαν στο υπάρχον receipt/expense AI pipeline. Μηδενίζει την τριβή του capture. **Διακριτό** από
  P5 (desktop browser ext) και P17 (barcode). OS-level share target (iOS Share Extension / Android intent).
- **Module:** Mobile (share extension/intent) + Receipts/Expenses (reuse upload+parse μέσω `/api/v1`).
- **Εξάρτηση:** mobile MVP (§6) + `/api/v1` upload endpoint. **Builder default:** shared αρχείο → receipts,
  με optional picker αργότερα.
- **ΕΝΕΡΓΟ ξανά 2026-08-03** (interactive, βλ. `OWNER_DECISIONS.md` #13): σταματά να μετράει ως «blocked σε
  Αχιλλέα». Ο builder **χτίζει όσο πάει unattended** — config plugin (iOS Share Extension / Android intent
  filter), receiving screen, wiring στο ήδη-υπάρχον `/api/v1` upload path — και τερματίζει το item ως «code
  complete, awaiting EAS build», ΟΧΙ «δεν ξεκίνησε». Το όριο είναι το **EAS dev build + φυσική συσκευή** (Expo
  Go δεν φορτώνει share extensions, ο simulator δεν δέχεται share intents), που το κάνει ο Αχιλλέας. Verify
  unattended = `npx tsc --noEmit` + code review, όπως κάθε mobile αλλαγή. **Σειρά:** μετά τα έξι S items της
  2026-08-03 (είναι M, τα άλλα S)· αν το Apple Developer account λείπει, **πρώτα το Android intent filter**,
  το iOS μισό μένει στο ράφι μέχρι να υπάρχει.

### P14. Subscription / bill price-hike watch (ανατιμήσεις επαναλαμβανόμενων) — ✅ SHIPPED 2026-07-11 (pharos-daily-dev)
- **Υλοποίηση:** νέο pure `lib/priceHike.ts` (`detectPriceHikes`, DB-free, 11 unit tests) ομαδοποιεί priced Expense
  rows ανά `vendorKey` (ίδιο key με recurring-series + anomaly) και συγκρίνει τις **δύο πιο πρόσφατες** χρεώσεις κάθε
  watched series. Wired και στο `runAlertChecks` (ntfy γραμμή «📈 N recurring price change(s): …») και στο
  `computeAlerts` → νέο **`pricehike`** NotifKind στο bell (κόκκινο TrendingUp) + en/el strings. Commit `74f9cd4`.
- **Locked defaults (builder):** κατώφλι **≥5% Ή ≥€1** (όπως εγκρίθηκε)· πιάνει και **μειώσεις** (direction up/down,
  «ίσως λάθος χρέωση»)· watched series = flagged `recurring` **ή** ≥3 priced entries (μπλοκάρει one-off vendors)·
  dedupeKey `pricehike:<vendorKey>:<curr>` ώστε νέα αλλαγή να ξανα-ειδοποιεί ακόμη κι αν παλιά dismiss-αρίστηκε, και να
  αυτο-λήγει όταν η νέα τιμή γίνει steady state. Ντετερμινιστικό, μηδέν AI, μηδέν migration.
- **Αξία:** όταν μια συνδρομή/λογαριασμός **ανεβαίνει** vs το ιστορικό του (Netflix €13→€15, ΔΕΗ +18%),
  alert «η X ανέβηκε €Y (+Z%) από τον προηγούμενο κύκλο». **Διακριτό:** P7 = *untracked* σειρές, P3 = πλήρες digest· εδώ ένα event.
- **Module:** Expenses (vendorKey series) + Notifications (bell + ntfy). **Σημείωση:** τα Subscriptions κρατούν
  μία τρέχουσα τιμή (χωρίς ιστορικό) → η ανίχνευση τρέχει πάνω στις Expense σειρές που έχουν τα ανά-κύκλο ποσά.

### P15. Vendor→category auto-rules (ντετερμινιστικοί κανόνες κατηγοριοποίησης) — ✅ SHIPPED 2026-07-11 (pharos-daily-dev)
- **Υλοποίηση:** pure `lib/categoryRules.ts` (resolve/match, reuse vendorKey normalization, +20 unit tests) +
  AppConfig `categoryRules[]` + appSettings resolve + wiring στο category-resolution chain των **Expenses**
  (uploadExpense scan / addExpense manual / importExpensesCsv) + Settings → Money `CategoryRulesManager`
  (match + vendor/text mode + category + recurring/cycle) + `saveCategoryRules` + `applyCategoryRulesToExisting`
  (retro-tag uncategorised) + en/el i18n. Builder defaults: rule wins πάνω από AI-guess & inherited στα scans·
  στο manual add εφαρμόζεται μόνο όταν ο χρήστης ΔΕΝ διάλεξε κατηγορία· match σε vendorKey (default) ή raw text.
  Scope MVP = Expenses (το μόνο module με πεδίο `category` + vendorKey)· Receipts/Statements categorisation =
  follow-up (δεν έχουν σήμερα έννοια category). «Learn from this» suggestion = follow-up. Commit TBD.
- **Module:** Expenses (+ Settings για τη διαχείριση κανόνων).

### P18. Receipt ↔ statement transaction reconciliation (auto-match) — ✅ SHIPPED 2026-07-12 (pharos-daily-dev, commit 07fba9f)
- **Υλοποίηση:** pure `lib/reconcile.ts` (`reconcile()`, DB-free, +17 unit tests): για κάθε χρέωση ενός
  εκκαθαριστικού, ranked candidate αποδείξεις με **auto-SUGGEST (ΟΧΙ silent-link)** — match ανά ποσό
  (`|charge| == total`, ±€0.02, abs για refunds), ημερομηνία (±3 μέρες default), store-token tiebreaker·
  deterministic stable ordering + unmatched-receipt flagging. Το πεδίο `matchedReceiptId` **προϋπήρχε** στο
  TransactionSchema (μηδέν migration). Server actions: `getReconciliation(statementId)` (date-windowed γύρω
  από statementDate −45/+5 μέρες, unmatched = αποδείξεις μη-linked σε ΚΑΜΙΑ χρέωση global) +
  `linkTransactionReceipt` / `unlinkTransactionReceipt`. UI: `ReconcilePanel.tsx` (statement picker + χρεώσεις
  με matched/suggested/no-match state + link/unlink + «αποδείξεις χωρίς χρέωση» section), wired ως «Reconcile»
  button στο header των /statements. i18n `rec.*` (en+el). Verify: type-check EXIT 0, vitest 1961 passed.
- **Locked defaults (builder):** ανοχή ημερομηνίας ±3 μέρες (tunable), ποσό ±€0.02 (τιμές card charge = total στο
  cent), auto-suggest με confirm. **Follow-up:** το «flag διπλοχρεώσεων» = derivable (πολλές χρεώσεις ίδιου
  ποσού/ημέρας)· δεν προστέθηκε ρητό view. Docker serve-check pending (VM contention).
- **Module:** Statements + Receipts (`matchedReceiptId` + reconciliation modal).

### P19. «Safe-to-spend» forward cashflow (τι μένει, όχι τι ξόδεψες) — ✅ SHIPPED 2026-07-10 (pharos-daily-dev, commit d3e191d)
- **Υλοποίηση:** νέο pure `lib/safeToSpend.ts` (`computeSafeToSpend`, DB-free, 6 unit tests) που τρέφεται από το
  υπάρχον `computeMoneyAgenda` (η ίδια 3-μηνη projection του `/calendar`) και το αθροίζει σε: (α) «διαθέσιμα για
  το υπόλοιπο του μήνα» = αναμενόμενα επαναλαμβανόμενα έσοδα − πάγιες μελλοντικές χρεώσεις (συνδρομές, δόσεις,
  recurring bills)· (β) 30/60/90-day windows. Μετράει ΜΟΝΟ entries με ημερομηνία σήμερα-ή-μετά και ρητό ποσό
  (τα warranty/voucher expiries με null amount αγνοούνται)· income προσθέτει, όλα τα άλλα αφαιρούν. Surfaced ως
  card στο `/reports` κάτω από το net-worth banner (χρωματιστός αριθμός accent/red + 3 window chips + note).
  en/el i18n· τα άλλα 6 locales fallback στα αγγλικά. Commit `d3e191d`.
- **Locked defaults (builder):** phase 1 αφαιρεί ΜΟΝΟ σταθερές γνωστές χρεώσεις (τα μεταβλητά καθημερινά έξοδα
  ΔΕΝ αφαιρούνται — variable median = phase 2)· income = tracked recurring μόνο (manual «expected income» =
  follow-up)· surfaced στο Reports (ΟΧΙ homepage — η αρχική σελίδα κρατήθηκε modules-only σκόπιμα, βλ. CLAUDE.md)·
  90-day tail μπορεί να υποεκτιμά ελαφρώς όσα events πέφτουν πέρα από το ~3-μηνο agenda window (αποδεκτό).
- **Module:** Reports (reuse calendar projection).

### P6. iCal (.ics) subscription feed για Calendar — ✅ SHIPPED 2026-07-10 (pharos-daily-dev, commit ac2e2d5)
- **Υλοποίηση:** νέο pure `lib/ics.ts` (RFC 5545 VCALENDAR builder + 18 unit tests) + shared `lib/moneyAgenda.ts` (αποσπάστηκε από το v1 calendar route, το τρέχουν και τα δύο) + route `GET /api/calendar.ics?token=…` (text/calendar, token-scoped). Auth μέσω dedicated **low-scope `User.calendarToken`** (ΟΧΙ το full API bearer — leaked subscribe URL δεν δίνει API access· απόκλιση από το reuse-apiToken default για ασφάλεια). All-day VEVENTs, [Category] prefix + ποσό, stable UIDs. Settings → `CalendarFeedManager` (generate/rotate/revoke + copy URL) + en/el i18n. Τα 13 υπάρχοντα v1 route tests πέρασαν αμετάβλητα (refactor transparent). Commit `ac2e2d5`.
- **Αξία:** read-only `.ics` feed URL (token-scoped) → subscribe από Google/Apple/Outlook Calendar· όλα τα
  οικονομικά deadlines δίπλα στο κανονικό ημερολόγιο. Ο υπολογισμός events υπάρχει· μένει VCALENDAR + route.
- **Module:** Calendar (+ auth token, reuse `User.apiToken` scope).
- **Ανοιχτή απόφαση (builder default):** ένα ενιαίο feed (με category prefix ανά event)· expiries = all-day.

### P7. Auto-discovery επαναλαμβανόμενων χρεώσεων (untracked subscriptions/bills) — ✅ SHIPPED 2026-07-11 (pharos-daily-dev, commit 97a7d66)
- **Υλοποίηση:** νέο pure `lib/recurringDiscovery.ts` (`discoverRecurringCandidates`, DB-free, +11 unit tests): ομαδοποιεί
  priced Expense rows ανά `vendorKey` (ίδιο key με priceHike/categoryRules), υπολογίζει τα gaps ημερών μεταξύ διαδοχικών
  χρεώσεων και ταιριάζει το μέσο gap σε γνωστό κύκλο (weekly/monthly/quarterly/yearly) εντός ανοχής — **ΚΑΙ** απαιτεί κάθε
  επιμέρους gap να είναι σχετικά σταθερό (όχι μόνο ο μ.ο.), ώστε τυχαίες αγορές που τυχαία μέσο-όρο-άνε σε «μηνιαίο» να ΜΗΝ
  false-positive-άρουν. Αποκλείει vendorKeys που ήδη καλύπτονται από `vendorKey(sub.name)` **ή** `vendorKey(sub.provider)`
  οποιασδήποτε υπάρχουσας Subscription. Server actions (`subscriptions/actions.ts`): `discoverUntrackedRecurring()` (φέρνει
  Expenses+Subscriptions, τρέχει το pure detector) + `trackDiscoveredSubscription(candidate)` (one-click → `Subscription.create`
  reusing το υπάρχον `computeNextRenewal`, startDate = πρώτη εμφάνιση της σειράς). UI: νέο panel «Possible untracked
  subscriptions (N)» στο `/subscriptions` (πάνω από τη λίστα, ίδιο στυλ με το «Upcoming renewals» strip) — vendor + ~avg
  amount + cycle + occurrence count ανά candidate, **Track** (δημιουργεί) + **Dismiss** (ephemeral, per-session hide).
- **Builder defaults (locked, όπως στο backlog):** heuristic-only, μηδέν AI· κατώφλι **≥3 εμφανίσεις**, ανοχή **±5 μέρες**
  (μ.ο. gap ΚΑΙ per-gap consistency ≤1.5× ανοχή). Scope MVP = Expenses μόνο (όχι statement transactions — τα expenses ήδη
  καλύπτουν τα recurring bills/subscriptions που πληρώνονται μέσω κάρτας ή μετρητά). **Απόκλιση:** το dismiss ΔΕΝ είναι
  persisted (κανένα νέο AppConfig πεδίο) — session-only hide, MVP-simple· follow-up αν χρειαστεί μόνιμο ignore-list.
- **Verify:** `npm run type-check` EXIT 0· full `npx vitest run` **2202 passed / 172 files**. Safe Docker rebuild (VM ~1GB
  σε χρήση από 10 containers, όχι contention): `homepage-web` clean start (0 restarts), `/login` 200, `/subscriptions` 307
  (auth-gated route compiled), Mongo healthy throughout, build cache pruned (2.18GB).
- **Follow-ups:** persisted dismiss/ignore-list αν ενοχλεί· statement transactions ως δεύτερη πηγή σειρών· `/api/v1`
  mobile-parity endpoint (κανένα σήμερα, on-demand server action μόνο).
- **Module:** Subscriptions + Expenses.

### P12. Savings / financial goals (στόχοι, όχι όρια) — ✅ SHIPPED 2026-07-15 (pharos-daily-dev, commit `78ebd76`)
- **Υλοποίηση:** νέο `models/Goal.ts` (`title`, `targetAmount`, optional `targetDate`, free-form `category`, `notes`,
  `archived`, embedded `contributions[]` `{amount,date,note}` — ίδιο σχήμα με το `GiftCard.uses[]`). Το `current` είναι
  **πάντα derived** (Σ contributions, ποτέ stored) μέσω νέου pure `lib/goals.ts` (`goalCurrent`/`goalProgress` — target/
  remaining/pct/done/monthsLeft/perMonth-needed-για-το-deadline, 10 unit tests). Server actions
  `app/reports/goalsActions.ts` (create/update/archive/delete + add/remove contribution) mirror το `giftcardActions.ts`
  pattern (`connectDB` απευθείας, όχι tenancy-aware `currentModel` — ίδιο με Bill/GiftCard, μικρά standalone modules).
  **UI**: νέα «Goals» κάρτα μέσα στο `/reports` (`id="goals"` anchor) — inline «+ New goal» φόρμα, progress bar ανά goal,
  «need €X/mo to hit the deadline» hint, inline add-contribution input, delete με confirm. Homepage NavCard
  (`/reports#goals`, count = active goals). **Trash wiring**: `goal` προστέθηκε στο `TrashType`/`TRASH_MODELS`/
  `trashLabel` (settings/actions.ts) + `TYPE_META` (TrashClient.tsx) — soft-delete/restore/purge δουλεύει όπως Bill/GiftCard.
- **Builder default τηρήθηκε:** πολλά ταυτόχρονα goals· manual contributions μόνο (auto-feed από κατηγορία = phase 2, δεν χτίστηκε).
- **Verify:** `npm run type-check` EXIT 0. `npx vitest run` **2251 passed / 174 files** (+10 νέα, μηδέν regression).
  Safe Docker rebuild (`docker compose build web` → mongo healthy → `up -d web`): `RestartCount=0`, `/login` 200,
  `/reports`+`/` 307 (auth-gated, compiled χωρίς server error — όχι testable UI-level χωρίς τα credentials του Αχιλλέα,
  ίδιος περιορισμός με προηγούμενα runs). `docker builder prune -f` μετά (−2.18GB, cache-only).
- **Follow-up (μηδέν v1 mobile route ακόμα):** web-only για τώρα· mobile parity θα χρειαστεί `Goal` exposure στο
  `/api/v1` (νέο endpoint, ίδιο pattern με Bill/GiftCard P28/P32 πριν πάρουν mobile) + GoalsScreen UI.
- **Module:** Reports (νέα «Goals» ενότητα) + Homepage card.

### P25. Budget rollover / envelope mode (μεταφορά αδιάθετου υπολοίπου) — ✅ SHIPPED 2026-07-10 (pharos-daily-dev, commit 9dabfe9)
- **Υλοποίηση:** opt-in envelope mode (`AppConfig.budgetRollover`, Settings → Budgets toggle). Νέο pure `lib/budgetRollover.ts`
  (+11 unit tests, DB-free): `categoryRollover(base, priorSpends)` = Σ(base − spent) πάνω σε bounded 3-μηνο παράθυρο,
  `effective = base + carried` (floor 0). Το Reports χτίζει per-(month,category) expense totals και **περιορίζει το carry
  window σε μήνες με tracked spend** (κενοί/untracked μήνες ΔΕΝ φτιάχνουν phantom surplus), εκθέτει `carried`/`effective` ανά
  budgeted κατηγορία + chip «+/−€X carried». Off → κλασικοί μηνιαίοι budgets (reset κάθε μήνα). Μηδέν AI, ντετερμινιστικό,
  μηδέν migration. **Απόκλιση από builder default (per-category opt-in)**: γίνεται **global toggle** (απλούστερο MVP· ο carry
  είναι net — θετικά ΚΑΙ αρνητικά υπόλοιπα, true envelope). Verify: type-check EXIT 0, vitest 67 passed στα affected suites.
- **Module:** Budgets (Settings) + Reports «Budget · this month».
- **Ανοιχτή απόφαση (builder default):** rollover **per-category opt-in**· μεταφορά θετικών υπολοίπων (negative rollover = opt-in).

### P13. Home-inventory insurance export bundle — ✅ SHIPPED 2026-07-20 (pharos-daily-dev, commit `7373035`)
- **Αξία:** «Insurance / proof-of-ownership export» = PDF/ZIP με λίστα assets (κατηγορία, αξία, serial, ημ.
  αγοράς) + συνημμένες αποδείξεις/φωτο + σύνολο ασφαλιστέας αξίας. **Διακριτό από P8** (P8 = tax-deductible).
- **Υλοποίηση:** νέο Settings → Storage & backup → «Insurance export (ZIP)» κουμπί. Νέο pure
  **`lib/insuranceExport.ts`** (`buildInsuranceCsv`/`buildInsuranceHtml`, DB-free, **+11 unit tests**) + νέα server
  action **`exportInsuranceBundle()`** (`settings/actions.ts`, `requireAdmin()`-gated — bundle περιέχει φωτο/receipts/
  manuals, ίδιο επίπεδο προστασίας με το `exportData` JSON backup). Query = **owned items** (`status ∈
  {received, installed}` — ρητά αποκλείει `sold`, δεν είναι πια δικό σου, και τα shopping statuses). **Value =
  reuse του ήδη-υπάρχοντος `estimatedItemValue` (P29 depreciation-adjusted estimate)**, όχι flat `currentPrice`
  (ο P29 docstring το προειδοποιούσε ρητά: «net worth και insurance export overestimate αν μείνουν στην τιμή
  αγοράς»)· fallback στο pre-P29 formula όταν το depreciation είναι off. `jszip` (νέο, **zero runtime deps δικά
  του**, Alpine-safe) χτίζει το ZIP: `insurance-manifest.csv` + `insurance-manifest.html` (αυτόνομη, inline CSS,
  ανοίγει απευθείας από το ZIP, printable→PDF) + `files/<itemId>/photo_N.*`, `attachment_N.*`, `receipt_N.*`
  (missing/orphaned file references παραλείπονται σιωπηλά ανά αρχείο, δεν ρίχνουν όλο το export). Base64-encoded
  response μέσω server action (ίδιο pattern με το JSON backup), client decode→Blob→download.
- **Ανοιχτή απόφαση (builder default, απόκλιση από το αρχικό «PDF»):** **v1 = ZIP με CSV + HTML report, ΟΧΙ PDF-
  writing dependency.** Το repo δεν είχε καμία υπάρχουσα PDF-generation υποδομή (μόνο `pdfjs-dist`, reader-only)·
  ένα αυτόνομο HTML report ανοίγει/εκτυπώνεται σε PDF από τον ίδιο τον χρήστη χωρίς νέο native dependency —
  ασφαλέστερο MVP από ένα άτεστο PDF-writer σε unattended run. Value = `estimatedItemValue` (depreciation-aware,
  καλύτερο από το αρχικό «currentPrice fallback purchasedPrice» builder-default πρόταση, reuse αντί επανάληψης).
- **Verify:** `npm run type-check` EXIT 0· full `npx vitest run` **2529 passed / 199 files** (+11 νέα, μηδέν
  regression). Safe Docker rebuild: `homepage-mongo` healthy πριν το `up -d web`, `RestartCount=0`, `/login` 200,
  Docker logs καθαρό (μόνο το προϋπάρχον άσχετο `@napi-rs/canvas` warning). Browser-checked (Claude Browser pane):
  `/login` → «Sign in · Pharos», μηδέν console errors. `docker builder prune -f` μετά, lock released. **`/settings`
  UI + το πραγματικό ZIP περιεχόμενο ΔΕΝ testable end-to-end unattended** (χρειάζεται login + πραγματικά owned
  items με φωτο/receipts) — verified πλήρως μέσω των 11 unit tests στους pure CSV/HTML builders + type-check.
- **Module:** Items/Inventory (+ Settings για το export).
- **Follow-up:** P8 (tax export) μπορεί τώρα να κάνει reuse του ίδιου jszip pipeline (νέα dependency ήδη μέσα).

### P8. Tax / deductible tagging + year-end export bundle — ✅ SHIPPED 2026-07-20 (pharos-daily-dev, commit `e0124d8`)
- **Υλοποίηση:** νέα `Expense.taxDeductible` (Boolean) + `Expense.taxCategory` (free string) — inherited από την
  τελευταία εγγραφή του ίδιου vendor (`inheritFromSeries`, ίδιο idiom με category/space/recurring), ώστε μια νέα
  απόδειξη γιατρού να κληρονομεί αυτόματα «tax-deductible». UI (`ExpensesClient.tsx`, expense-only, όχι income):
  toggle «Tax deductible» + `SearchableSelect` (allowCustom) με **GR presets** (`lib/taxonomies.ts
  TAX_CATEGORY_PRESETS`: Ιατρικά έξοδα/Δωρεές/Τόκοι στεγαστικού/…) + νέο sidebar φίλτρο «Tax deductible only» +
  gold `Landmark` badge σε card/row. Νέο **`lib/taxExport.ts`** (πλήρως pure, +11 unit tests, mirror του
  `lib/insuranceExport.ts` P13): `buildTaxCsv` (accountant-ready CSV) + `buildTaxHtml` (standalone report
  grouped ανά tax category με subtotal + grand total). Settings → Backup: νέο **«Tax export (ZIP)»** button + year
  picker (τελευταία 5 χρόνια) → `exportTaxBundle(year)` (settings/actions.ts) φέρνει τα tax-deductible expenses
  του επιλεγμένου έτους + το αρχείο κάθε λογαριασμού μέσα σε `files/<id>/` (JSZip, ίδιο pattern με το insurance
  export). **Builder default** (καμία ρητή απόφαση Αχιλλέα): free-form tag με GR presets (όχι enforced enum,
  διαφορετικά κράτη έχουν διαφορετικούς κανόνες)· η ZIP-με-αρχεία εξαγωγή χτίστηκε **ungated** (ίδιο με κάθε άλλο
  export στην εφαρμογή, π.χ. insurance/CSV/JSON backup — κανένα από αυτά δεν ελέγχει SaaS plan tier σήμερα)· το
  «SaaS = paid» differentiator από το spec μένει follow-up entitlement-gating, όχι κάτι που μαντεύτηκε εδώ.
- **Verify:** `npm run type-check` EXIT 0. Full `npx vitest run` **2614 passed / 205 files** (+11 νέα taxExport
  tests, +2 ενημερωμένα serializeExpense tests για τα νέα πεδία, μηδέν regression). Safe Docker rebuild
  (`docker compose build web` → mongo healthy → `up -d web`): `RestartCount=0`, `/login` 200. Browser-checked
  (Claude Browser pane): `/login` → «Sign in · Pharos», μηδέν console errors. `docker builder prune -f` μετά
  (6.575GB). **`/settings` UI + το πραγματικό ZIP content ΔΕΝ testable end-to-end unattended** (χρειάζεται login +
  πραγματικά tax-deductible expenses) — ίδιος περιορισμός με κάθε προηγούμενο Settings-only run, verified πλήρως
  μέσω των unit tests στους pure builders + type-check + clean serve-check.
- **Follow-ups:** `taxDeductible`/`taxCategory` δεν εκτίθενται ακόμα στο `/api/v1/expenses` shape (mobile parity,
  ίδιο gap με P34 space/P35 split)· SaaS entitlement-gating του ZIP export (αν τελικά θεωρηθεί paid-only feature)·
  Receipts δεν έχουν το ίδιο flag (το spec ανέφερε Expenses+Receipts, το v1 έμεινε στο Expenses — τα bills/λογαριασμοί
  είναι το πρωτεύον use-case, τα line-item receipts λιγότερο σχετικά με tax deductions στην πράξη).
- **Module:** Expenses (+ Settings/Backup για το export).

### P16. Migration importers από άλλα finance/self-host apps (Firefly III / YNAB / Grocy) — 🟡 YNAB SHIPPED 2026-07-19 (pharos-daily-dev), Firefly III/Grocy εκκρεμούν
- **Αξία:** δέξου export ανταγωνιστή → μειώνει switching cost. Importer για Firefly III (JSON/CSV), YNAB (CSV),
  optional Grocy. **Διακριτό από PA1** (γενικό bank CSV· εδώ app-specific με mapping presets).
- **Module:** Settings → Storage & backup → νέο «Import from another app» + Expenses.
- **YNAB v1 υλοποίηση**: νέο pure **`lib/ynabImport.ts`** (+20 unit tests) — `detectYnabColumns()` tolerant
  keyword-matching (ΟΧΙ hardcoded header order) πάνω στο ήδη-υπάρχον `parseCsv`/`parseCsvDate`/`parseCsvAmount`
  (`lib/csvImport.ts`, PA1) — καλύπτει ΚΑΙ το σύγχρονο nYNAB web export («Category Group/Category») ΚΑΙ το
  legacy YNAB4 desktop export («Master Category»/«Sub Category»). `mapYnabRows()` συνδυάζει τα ξεχωριστά
  Outflow/Inflow columns σε ένα signed amount (αρνητικό=έξοδο) και **αποκλείει ρητά** δύο κατηγορίες γραμμών
  που θα χάλαγαν πραγματικά δεδομένα αν εισάγονταν: **«Starting Balance»/«Reconciliation Balance Adjustment»**
  (YNAB bookkeeping, όχι πραγματική συναλλαγή) και **«Transfer : <account>»** (μεταφορά ανάμεσα σε δικούς του
  λογαριασμούς — θα διπλομετρούσε το spend ως income+expense). Τα mapped rows τροφοδοτούν **απευθείας το ήδη
  existing+tested `importExpensesCsv(rows, {signSplit:true})`** (PA1, `app/expenses/actions.ts`) — **μηδέν νέος
  DB-writing κώδικας**, μόνο διαφορετική «μπροστινή πόρτα» πάνω στο ίδιο proven pipeline (dedupe, category
  inheritance, tenant scoping όλα reused ατόφια). Νέο `components/settings/YnabImportModal.tsx` (auto-detected
  columns, καμία χειροκίνητη mapping-UI σε αντίθεση με το generic CSV modal — το YNAB format είναι γνωστό) +
  `MigrationImportManager` section στο Settings → Storage & backup tab.
- **Firefly III ΣΚΟΠΙΜΑ deferred** (builder decision, απόκλιση από το αρχικό «πρώτα Firefly III + YNAB»):
  research (WebSearch/WebFetch σε official docs + GitHub) έδειξε ότι το export format του Firefly III **δεν
  είναι σταθερά τεκμηριωμένο** — τα ίδια τα official docs λένε ρητά ότι τα δικά του CSV exports «δεν μπορούν να
  ξαναγίνουν import» ούτε στο ίδιο το Firefly III. Χτίζοντας έναν importer πάνω σε άγνωστο/άτεστο schema θα
  ρίσκαρε **σιωπηλά λάθος οικονομικά δεδομένα** (λάθος πρόσημο, λάθος λογαριασμός) σε ένα unattended run χωρίς
  δυνατότητα να το επαληθεύσω με πραγματικό δείγμα αρχείου — μη αποδεκτό ρίσκο. Grocy επίσης εκκρεμεί (marked
  "optional" στο αρχικό spec). **Follow-up**: Firefly III/Grocy χρειάζονται είτε πραγματικό sample export file
  από τον χρήστη είτε προσεκτικότερο manual verify session, όχι άλλο ένα best-effort unattended run.
- **Verify**: `npm run type-check` EXIT 0. Full `npx vitest run` **2337 passed / 181 files** (+20 νέα, μηδέν
  regression). Safe Docker rebuild: build OK, `RestartCount=0`, `docker logs` καθαρό (μόνο το προϋπάρχον άσχετο
  `@napi-rs/canvas` warning), browser-checked (Claude Browser pane) `/login` → «Sign in · Pharos», μηδέν
  console errors. `/settings` UI δεν testable end-to-end χωρίς πραγματικό YNAB export file + τα credentials του
  Αχιλλέα, ίδιος περιορισμός με κάθε προηγούμενο Settings-only run — η λογική επαληθεύτηκε πλήρως μέσω των 20
  unit tests (συμπεριλαμβανομένου ενός full-CSV end-to-end test με πραγματικό-shaped δεδομένα).
- **Διόρθωση (2026-07-20, P11 run):** το παρακάτω εύρημα ήταν **λάθος/stale** — το `app/expenses/CsvImportModal.tsx`
  ΕΙΝΑΙ ήδη wired στο `ExpensesClient.tsx` (state `importingCsv` + κουμπί «Import CSV» στο header + render του modal),
  από το ΙΔΙΟ commit `bed7f73` (PA1) που το δημιούργησε — μηδέν dead code, μηδέν ενέργεια χρειάζεται.
- **Εύρημα εν παρόδω (ΛΑΝΘΑΣΜΕΝΟ, βλ. διόρθωση παραπάνω)**: το ήδη-υπάρχον `app/expenses/CsvImportModal.tsx`
  (PA1, γενικό bank CSV) φαίνεται **orphaned** — μηδέν import site βρέθηκε πουθενά στο codebase (dead code,
  UI ποτέ wired σε κανένα page). Η ίδια η server action `importExpensesCsv` που χρησιμοποιεί παραμένει
  απόλυτα λειτουργική/tested και reused εδώ. Αξίζει follow-up: είτε wire το modal σε ένα «Import CSV» button
  στο /expenses (η αρχική πρόθεση του PA1 feature), είτε το σβήσε αν κρίθηκε ξεπερασμένο από το generic Backup
  JSON export/import.

### P11. Email-in auto-import — self-hosted IMAP receipt inbox — ✅ SHIPPED 2026-07-20 (pharos-daily-dev)
- **Υλοποίηση:** νέο **`lib/imapConfig.ts`** (tenant-scoped cached config getter, ατόφιο mirror του
  `lib/storageConfig.ts`, `normalizeImapConfig` pure+testable + 9 unit tests) + **`lib/imapImport.ts`**
  (`imapflow` connect/search/fetch + `mailparser` extract attachments/html, capped **25 μηνύματα/check**,
  πρώτο-ποτέ check περιορισμένο στις τελευταίες 7 μέρες ώστε να μη «χύσει» ολόκληρο ιστορικό mailbox).
  Νέα settings actions (`getImapInfo`/`saveImapConfigAction`/`testImapConnectionAction`/`checkImapInboxNow`)
  **reuse το υπάρχον `uploadReceipt`** ατόφιο (Buffer→`File`→`FormData`→ίδιο pipeline μιας χειροκίνητης
  μεταφόρτωσης: save+OCR/vision/text parse+draft, ένα AI call ανά μήνυμα, gated από το ίδιο receipts
  AI-feature toggle) — **μηδέν νέος draft-creation κώδικας**. UI: νέο section «Email-in (IMAP)» στο
  Settings → Storage & backup, δίπλα στο YNAB import manager (host/port/user/pass/folder/TLS + Save/Test/
  «Check inbox now» + last-checked/last-imported timestamps). **Builder default** (καμία ρητή απόφαση
  Αχιλλέα): IMAP polling πρώτα (self-host creds, ΟΧΙ forwarding-address εναλλακτική)· **χειροκίνητο
  «Check inbox now» κουμπί, ΟΧΙ background cron** (η εφαρμογή δεν έχει node-cron infra σήμερα — το ίδιο
  MVP pattern με το OneDrive «Test connection»/storage «Sync now», background polling = μελλοντικό follow-up
  αν χρειαστεί)· ingest free (ίδιο κόστος με κάθε χειροκίνητο upload, όχι επιπλέον bulk-job μέτρημα).
- **Verify:** `npm run type-check` EXIT 0. Full `npx vitest run` **2385 passed / 185 files** (+9 νέα, μηδέν
  regression). Docker rebuild (--no-cache, καθαρή επαλήθευση ότι το `imapflow`/`mailparser` bundle-άρονται
  σωστά στο standalone output μετά την προσθήκη 2 νέων deps — αρχικός έλεγχος σε λάθος stale local `.next`
  φάνηκε ύποπτος, διορθώθηκε ελέγχοντας το πραγματικό image μέσω `docker run`): `RestartCount=0`, `/login`
  200, `/settings` 307 (auth-gated, compiled). Browser-checked (Claude Browser pane): `/login` → «Sign in ·
  Pharos», μηδέν console errors. **ΔΕΝ testable end-to-end** (χρειάζεται πραγματικό mailbox + credentials
  του Αχιλλέα) — verified μέσω unit tests στον pure normalizer + το ίδιο-proven `uploadReceipt` pipeline.
- **Follow-up εύρημα (καταγράφηκε εν παρόδω)**: το `app/expenses/CsvImportModal.tsx` που το P16 σημείωνε ως
  «orphaned/dead code» **ήταν ήδη σωστά wired** στο `ExpensesClient.tsx` από το ίδιο commit `bed7f73` (PA1) —
  stale note, διορθώθηκε εδώ. Καμία ενέργεια χρειάστηκε.

### P17. Mobile barcode/QR scan → γρήγορη προσθήκη στο inventory — ✅ SHIPPED 2026-07-27 (camera UI, commit 6b52023)
- **Αξία:** barcode/QR scan (EAN/UPC) → lookup → prefill τίτλου/κατηγορίας/specs → one-tap add σε inventory/shopping.
- **Module:** Mobile (camera-scan) + Items/Inventory (+ `/api/v1` §5, product-lookup helper).
- **Εξάρτηση:** mobile MVP (§6). **Builder default:** lookup = δωρεάν Open Food Facts / UPC DB, AI fallback.
- **Γιατί χωρίστηκε στα δύο:** το item ήταν 4 συνεχόμενα runs μπλοκαρισμένο ως «mobile native-dep approval» (η camera
  θέλει `expo-camera`/`expo-barcode-scanner`, δηλαδή έγκριση του Αχιλλέα + EAS dev build, μη testable unattended). Αλλά
  το **server μισό δεν χρειάζεται καμία native dep** και είναι ρητά μέρος του spec («+ `/api/v1` product-lookup
  helper»), οπότε χτίστηκε τώρα ώστε το mobile κομμάτι να είναι σκέτο UI όταν έρθει η έγκριση.
- **Υλοποίηση (server):** νέο pure **`lib/barcode.ts`** (GTIN mod-10 check digit, `normalizeBarcode` που δέχεται
  EAN-8/UPC-A/EAN-13/GTIN-14 και ανέχεται κενά/παύλες, `barcodeCandidates` για τις zero-padding παραλλαγές που
  διαφορετικοί κατάλογοι αποθηκεύουν αλλιώς, `pickCategory`, `mapOpenFactsProduct`· **+21 unit tests**) +
  **`lib/barcodeLookup.ts`** (network· **+12 tests** με mocked fetch) + route **`GET /api/v1/lookup/barcode?code=`**
  (**+8 tests**). Το `product` έχει **ακριβώς το ίδιο σχήμα** με το `POST /api/v1/scan/product`
  (name/brand/category/quantity/notes) → η ίδια confirm-then-add οθόνη εξυπηρετεί και τα δύο, και πέφτει κατευθείαν
  σε `POST /api/v1/shopping-list`. Τεκμηριωμένο στο `API.md`.
- **Builder decisions:** (α) πηγές = **Open Food / Products / Beauty Facts** (δωρεάν, χωρίς key, χωρίς quota, μηδέν
  κόστος)· (β) **ΟΧΙ AI fallback στο v1** — κάθε AI κλήση είναι metered και κοστίζει, ενώ το lookup είναι ντετερμινιστικό
  και δωρεάν· ο χρήστης έχει ήδη το AI product-photo scan ως ρητή, δική του κλιμάκωση όταν το barcode αστοχήσει·
  (γ) οι 3 πηγές ρωτιούνται **παράλληλα** ανά μορφή barcode (bounded wall clock, κάποιος στέκεται σε ράφι)· (δ) το
  check digit επικυρώνεται **πριν** ξοδευτεί request· (ε) διάκριση 400 (άκυρο barcode) / `product:null` (κανείς δεν το
  ξέρει) / 502 (βάσεις άφταστες) — τρεις διαφορετικές απαντήσεις που το UI πρέπει να δείχνει αλλιώς.
- **Verify:** `npm run type-check` EXIT 0· full `npx vitest run` **3465 passed / 261 files** (+41 νέα, μηδέν regression).
  Επιπλέον **live curl** στο πραγματικό Open Food Facts API, που αποκάλυψε δύο πράγματα που τα mocks δεν θα έπιαναν:
  ένα miss γυρίζει **HTTP 200 με `status:0`** (όχι πάντα 404 — καλύπτονται και τα δύο), και τα `categories_tags`
  **αναμειγνύουν** canonical αγγλικά tags με ξενόγλωσσο κείμενο κάτω από το ίδιο `en:` prefix (το πραγματικό record
  της Nutella τελειώνει σε «en:Pâtes à tartiner») → το `pickCategory` προτιμά πλέον canonical taxonomy entries, αλλιώς
  θα έδινε γαλλική κατηγορία σε αγγλικό lookup.
- **Εκκρεμεί (χρειάζεται Αχιλλέα):** το mobile camera UI — έγκριση για `expo-camera` (native dep) + EAS dev build σε
  φυσική συσκευή. Ο server είναι έτοιμος και tested· μένει η οθόνη scan → `GET /api/v1/lookup/barcode` → confirm → add.
- **Camera UI shipped 2026-07-27** (ο Αχιλλέας ενέκρινε ρητά το `expo-camera` σε interactive session): νέο
  `apps/mobile/src/BarcodeScanner.tsx` (δικό του component, γιατί η ίδια χειρονομία θα χρειαστεί και σε inventory /
  price-logging, και γιατί τα εύκολα-να-τα-κάνεις-λάθος κομμάτια πρέπει να υπάρχουν μία φορά: τα 3 permission states,
  **ένα scan ανά άνοιγμα** (αλλιώς η κάμερα πυροδοτεί συνεχώς όσο το barcode μένει στο κάδρο και σπαμάρει το lookup),
  και η λίστα symbologies). **Retail formats μόνο** (EAN-13/8, UPC-A/E), όχι QR: ένα QR δεν είναι ποτέ προϊόν σε
  product database. Η κάμερα mountάρεται ΜΟΝΟ όσο το sheet είναι ανοιχτό. Το scanned barcode καταλήγει στο **ίδιο
  draft** που παράγει ήδη το AI photo scan, οπότε υπάρχει ένα confirm sheet και όχι δύο σχεδόν ίδια. Άγνωστο barcode
  = **απάντηση, όχι σφάλμα** (οι βάσεις είναι ελλιπείς): ο κωδικός μένει στην οθόνη και ο χρήστης ξανασκανάρει ή
  προσθέτει με το όνομα. `app.json` += `expo-camera` plugin με permission string. **Verify:** `npx tsc --noEmit`
  EXIT 0. **Μένει ένα supervised πέρασμα σε φυσική συσκευή** (EAS dev build): ο simulator δεν έχει κάμερα, άρα το
  ίδιο το σκανάρισμα δεν επαληθεύεται unattended.

### P20. Loyalty / membership card wallet (barcode display στο checkout) — ✅ SHIPPED 2026-07-18 (pharos-daily-dev, commit `536a3d8`)
- **Υλοποίηση:** νέο `models/LoyaltyCard.ts` (title/store/cardNumber/barcodeFormat/notes/archived, soft-delete, ίδιο
  σχήμα-στυλ με το `GiftCard`). Νέο pure **`lib/loyaltyCard.ts`** (`guessBarcodeFormat`/`resolveBarcodeFormat`/
  `isValidForFormat`, DB-free, **+13 unit tests**): 13-ψήφιος αριθμός → EAN13, 12-ψήφιος → UPC, αλλιώς CODE128
  (encodes οτιδήποτε) — deterministic, μηδέν χειροκίνητο picking στις περισσότερες περιπτώσεις, override διαθέσιμο.
  `app/vouchers/loyaltyActions.ts` (CRUD, mirror του `giftcardActions.ts`). Νέο **`components/BarcodeDisplay.tsx`**:
  client-side render μέσω **jsbarcode** (νέο dep, MIT, **μηδέν runtime dependencies**, dynamically imported ώστε να
  μην μπει στο shared bundle, ίδιο lazy pattern με το recharts). **Σημαντικό functional detail**: το barcode
  render-άρεται ΠΑΝΤΑ μαύρο-πάνω-σε-άσπρο ανεξαρτήτως theme (dark/light) — ένας πραγματικός scanner στο ταμείο
  χρειάζεται σκούρες γραμμές σε ανοιχτό φόντο για να διαβάσει αξιόπιστα, οπότε αυτή η μία επιφάνεια αγνοεί σκόπιμα
  τα theme tokens (θα ήταν λειτουργικό bug αν η κάρτα σε dark mode έδειχνε λευκές γραμμές σε μαύρο φόντο — άσπαστο
  barcode). **UI**: 3ο tab στο `/vouchers` (Coupons | Gift cards | **Loyalty cards**, `Barcode` icon) — tile grid,
  tap στην κάρτα → **fullscreen barcode modal** (το κύριο flow: «είμαι στο ταμείο, δείξε μου την κάρτα»), μικρό
  hover pencil icon για edit (secondary flow). Wired στο **Trash** (restore/purge + νέο `trash.tLoyaltyCard` i18n
  key) ακολουθώντας ακριβώς το precedent του GiftCard/P32 — **ΔΕΝ** μπήκε στο JSON backup/export (το GiftCard/Bill/
  Goal είναι επίσης εκτός εκείνης της λίστας, συνειδητά ίδιο gap). **Builder defaults τηρήθηκαν**: tab μέσα στα
  Vouchers ✓, client-side barcode lib ✓. Καμία i18n μετάφραση μέσα στο ίδιο tab UI (mirror του GiftCardsClient, που
  είναι επίσης English-only — πιο σχετικό precedent από τη γενική en+el σύμβαση άλλων σελίδων).
- **Verify:** `npm run type-check` EXIT 0· full `npx vitest run` **2298 passed / 178 files**. Safe Docker rebuild
  (mongo ήδη healthy → `up -d web`): `RestartCount=0`, `/login` 200 (Claude Browser pane, τίτλος «Sign in · Pharos»,
  **μηδέν console errors**), `/vouchers` 307 (auth-gated, compiled καθαρό — δεν testable UI-level το ίδιο το tab
  χωρίς τα credentials του Αχιλλέα, ίδιος περιορισμός με όλα τα προηγούμενα runs). `docker builder prune -f` μετά
  (−2.2GB, cache-only).
- **Follow-up:** μηδέν v1 mobile API ακόμα (web-only για τώρα, ίδιο notice με GiftCard/P32/P28 — mobile parity θα
  χρειαστεί `/api/v1/loyaltycards` + LoyaltyScreen όταν έρθει η σειρά του mobile roadmap)· καμία notification/alert
  γι' αυτές τις κάρτες (δεν έχει expiry/balance-at-risk σαν το GiftCard/Voucher, εκτός σκοπού)· mobile «max
  brightness» behavior (το backlog το ανέφερε) δεν είναι εφικτό από web JS (καμία τέτοια browser API) — καθαρά
  mobile-native follow-up αν/όταν χτιστεί το companion app UI για αυτό το module.
- **Module:** νέο tab «Loyalty cards» στο `/vouchers` (+ Trash).

### P21. Document / manual vault στα inventory items — ✅ SHIPPED 2026-07-14 (pharos-daily-dev)
- **Υλοποίηση:** νέο `Item.attachments[]` (`{path, name, mimeType, size, uploadedAt}`, `_id:false`) στο `models/Item.ts` —
  ξεχωριστό από το `photos[]` (product gallery). Reuse πλήρες: ίδιο `saveFile`/`deleteFile` (`lib/storage.ts`), ίδιο
  `equipment` bucket (μηδέν νέο storage backend/bucket να καλωδιωθεί στο remote sync/mirror), ίδιο `/api/files` serving
  (PDF/εικόνες render inline, `.doc/.docx/.txt` κατεβαίνουν — αποδεκτό MVP). Νέες server actions `uploadItemAttachments`
  (whitelist εξτένσεων pdf/jpg/jpeg/png/webp/heic/doc/docx/txt, cap 15MB/request από το υπάρχον `serverActions.bodySizeLimit`)
  + `deleteItemAttachment`. Νέο `components` **`ItemDocuments.tsx`** (λίστα με icon ανά mime, όνομα, μέγεθος, view/delete) —
  renders στο item detail modal, κάτω από το PricePanel. **`mergeItems`** ενημερώθηκε να κάνει union τα attachments (όπως
  τα photos) όταν merge-άρονται διπλότυπα items· **trash purge** διαγράφει τα υποκείμενα αρχεία· **backup restore**
  sanitize-άρει τα `attachments[].path` (ίδιο `isSafeStoredPath` guard με photos/filePath, defense-in-depth κατά path
  traversal από tampered backup). **Guard σημαντικό:** τα read-paths (items/shopping `page.tsx`) κάνουν `.lean()` χωρίς
  select, άρα ΔΕΝ παίρνουν schema defaults — υπάρχοντα items πριν από αυτό το commit δεν έχουν το πεδίο μέχρι να
  ξανα-γραφτούν· το `ItemsClient` περνάει `item.attachments ?? []` στο component ώστε να μην σκάσει σε legacy items.
  i18n keys (`it.documents`/`it.addDocument`/`it.noDocuments`/`it.deleteDocument`) σε en+el. **Builder default τηρήθηκε:**
  manual upload μόνο (AI/web-search auto-fetch = phase 2, δεν χτίστηκε)· quota per-item στο SaaS = δεν χτίστηκε (θα
  μπει όταν χρειαστεί metering, δεν είναι blocking για το OSS MVP).
- **Verify:** `npm run type-check` EXIT 0, `npx vitest run` **2241 passed / 173 files** (μηδέν regression). Docker safe
  rebuild (`docker compose build web` → mongo healthy → `up -d web`): `RestartCount=0`, `/login` 200, `/items` 307
  (auth-gated, compiled OK — δεν testable UI-level χωρίς τα credentials του Αχιλλέα).
- **Follow-up (μηδέν v1 mobile route ακόμα):** web-only για τώρα· mobile parity θα χρειαστεί `attachments` στο
  `/api/v1/items` serializer + ItemsScreen UI, ίδιο pattern με τα Bill/GiftCard entities (P28/P32) πριν πάρουν mobile.
- **Module:** Items/Inventory (`attachments[]`, reuse storage backends + `/api/files`).

### P5. Browser extension / bookmarklet — quick capture — ✅ SHIPPED (bookmarklet 2026-07-22, MV3 extension 2026-07-27, pharos-daily-dev)
- **Αξία:** από e-shop, ένα κλικ → «add to Pharos shopping» (reuse `importItemFromUrl`). Καταναλώνει `/api/v1`.
- **Module:** Items / Shopping (+ REST API).
- **Εξάρτηση:** `/api/v1` (§5). **Builder default:** απλό bookmarklet πρώτα, MV3 extension phase 2.
- **Υλοποίηση (bookmarklet phase — απόκλιση από τον αρχικό σχεδιασμό, ΟΧΙ `/api/v1` + embedded token)**: το
  αρχικό spec («καταναλώνει `/api/v1`») θα σήμαινε embedding το προσωπικό API token μέσα στο ίδιο το
  bookmarklet link (ορατό ως plain text σε bookmarks bar/export/sync) **ΚΑΙ** θα χρειαζόταν νέο CORS layer
  στο `/api/v1` (σήμερα μηδέν `Access-Control-*`/`OPTIONS` handling πουθενά — ένα cross-origin fetch από
  τυχαία e-shop σελίδα θα μπλοκαριζόταν στο browser preflight χωρίς αυτό). **Builder decision**: session-cookie
  popup pattern αντί για token-in-link (ίδιο idiom με Pocket/Instapaper-style «save» bookmarklets) — μηδέν
  CORS, μηδέν token exposure. Το bookmarklet (νέο pure **`lib/bookmarklet.ts`** `buildBookmarklet(origin)`,
  **+5 unit tests**) είναι ένα μικρό `javascript:` URI που ανοίγει `window.open(origin+'/capture?url='+
  encodeURIComponent(location.href), ...)` — ένα **same-origin** popup στο ίδιο Pharos domain, οπότε παίρνει
  το ήδη-υπάρχον session cookie ατόφιο (η global middleware ήδη κάνει gate + κρατά `?next=` round-trip, άρα
  login-μέσα-στο-popup-και-γύρισε-στο-capture δουλεύει ΧΩΡΙΣ καμία αλλαγή στο auth flow). Νέα σελίδα
  **`/capture`** (`app/capture/page.tsx` + `CaptureClient.tsx`, chromeless όπως `/login`/`/setup` — μικρό
  440×640 popup, νέα γραμμή στο `layout.tsx` chromeless check) reuses **ατόφιο** το ήδη-υπάρχον preview→approve
  pipeline του Items page (`previewItemFromUrl`/`confirmImportItem`, `app/items/actions.ts`) — μηδέν νέος
  DB-writing κώδικας, μηδέν νέο AI-cost path. Settings → Storage & backup, νέο **`BookmarkletManager.tsx`**
  section (drag-to-bookmarks-bar link, `href` set imperatively μέσω `useEffect`/`setAttribute` ώστε να μην
  ενεργοποιήσει το React `javascript:` href dev-warning, + «Copy code» fallback button για browsers/setups
  όπου το drag δεν είναι βολικό). i18n keys `bm.*`/`cap.*` μόνο στο en.ts (ίδιο precedent με κάθε πρόσφατο
  Settings-only feature).
- **Verify**: `npm run type-check` EXIT 0. Full `npx vitest run` **2888 passed / 222 files** (+5 νέα, μηδέν
  regression). Safe Docker rebuild (`docker compose build web` → mongo ήδη healthy → `up -d web`):
  `RestartCount=0`, `/login` 200 στην 1η προσπάθεια, `docker logs` καθαρό (μόνο το προϋπάρχον άσχετο
  `@napi-rs/canvas` warning). `curl -D- /capture?url=...` χωρίς session → **307 → `/login?next=%2Fcapture%3F
  url%3D...`** (επιβεβαιώνει ότι το login→return-to-capture round-trip θα δουλέψει)· `POST /api/v1/items/import`
  χωρίς token → 401 (αμετάβλητο, το v1 route ΔΕΝ αγγίχτηκε τελικά — η υλοποίηση προτίμησε το session-cookie
  path). Browser-checked (Claude Browser pane): `/capture?url=...` → redirect σε «Sign in · Pharos» (chromeless,
  σωστό), μηδέν console errors. `docker builder prune -f` (195.6MB freed), lock released καθαρά. **Το
  πραγματικό capture-popup UI (preview card + Add to Shopping/Inventory) ΔΕΝ testable end-to-end unattended**
  (χρειάζεται login με τα credentials του Αχιλλέα + πραγματική AI item-import call) — verified πλήρως μέσω
  unit tests στο pure `buildBookmarklet` + type-check + το ήδη-proven `previewItemFromUrl`/`confirmImportItem`
  pipeline (reused ατόφιο, καμία νέα λογική εκεί).
- **Υλοποίηση (MV3 extension phase — 2026-07-27)**: νέο **`apps/extension/`**, μηδέν dependencies και **μηδέν build
  step** (ό,τι υπάρχει στο `src/` είναι ακριβώς αυτό που τρέχει ο browser, οπότε το «ξεχωριστό packaging» που κρατούσε
  το phase 2 πίσω αποδείχθηκε ότι δεν χρειάζεται καθόλου pipeline). Το extension **δεν προσθέτει νέο μονοπάτι auth**:
  κρατά μόνο τη διεύθυνση του instance σε `chrome.storage.sync` και ανοίγει το ίδιο **same-origin** `/capture?url=…`
  που έφτιαξε το phase 1, άρα ταξιδεύει πάνω στο υπάρχον session cookie. **Μηδέν `host_permissions`, μηδέν content
  script** (δεν μπορεί να διαβάσει το περιεχόμενο καμίας σελίδας), permissions μόνο `storage` + `contextMenus` +
  `activeTab` (το URL του tab γίνεται ορατό μόνο τη στιγμή του κλικ). Τρία triggers → μία διαδρομή: toolbar button,
  δεξί κλικ σε σελίδα, δεξί κλικ σε link (το link context menu στέλνει τον προορισμό, όχι τη σελίδα). Άκυρη σελίδα
  (`chrome://`, `file:`, `about:`) απαντιέται με badge αντί για κενό preview· μη ρυθμισμένο instance ανοίγει το
  options page αντί για σιωπηλό no-op. Icons rendered από το ίδιο `app/icon.svg` (sharp, 16/32/48/128). **Verify:**
  `npm test` στο `apps/extension` = **21 tests pass** με `node --test` και **μηδέν dependency** (12 pure helpers +
  **9 wiring tests πάνω σε fake `chrome` namespace**: ποιο trigger ανοίγει τι, trailing slash, missing origin,
  chrome:// refusal, first-install vs update). Νέο **CI job «Browser extension»** τρέχει αυτά + επικυρώνει ότι το
  manifest είναι έγκυρο JSON και δείχνει σε αρχεία που υπάρχουν. Web-side: μία γραμμή `bm.extHint` (en+el) στο
  Settings → Quick capture ώστε να το ανακαλύψει ο χρήστης, `README.md` structure += `apps/extension/`.
- **Follow-up**: Firefox (φορτώνει MV3 αλλά δεν έχει δοκιμαστεί)· δημοσίευση σε Chrome Web Store (θέλει developer
  account + fee, δηλαδή απόφαση/credentials του Αχιλλέα, όχι δουλειά)· mobile share-sheet (P23) είναι το ισοδύναμο
  quick-capture flow για mobile, ξεχωριστό item.

### P3. AI «Month in Review» digest — ✅ SHIPPED 2026-07-20 (pharos-daily-dev, commit `029d7ae`) — v1 ΧΩΡΙΣ AI
- **Υλοποίηση:** νέο pure **`lib/monthReview.ts`** (`buildMonthReview()`, DB-free, **+11 unit tests**) που
  συνθέτει: σύνολο εξόδων/εσόδων/net του μήνα, **% μεταβολή vs προηγούμενο μήνα**, top κατηγορία, over-budget
  κατηγορίες (reuse του ήδη-tested `detectBudgetExceeded` από το P24), recurring χρεώσεις που άλλαξαν τιμή
  (reuse του ήδη-tested `detectPriceHikes` από το P14, φιλτραρισμένο στον στοχευμένο μήνα), εγγυήσεις που
  λήγουν εντός 90 ημερών, τα οποία συνθέτει σε **μία αφηγηματική πρόταση** («You spent €500 this month, up 12%
  vs last month. Top category: utilities (€200). …»). **Builder default (απόκλιση από το αρχικό «AI digest»
  όνομα)**: v1 = **ΧΩΡΙΣ AI**, ντετερμινιστικό template πάνω σε ήδη-υπολογισμένα σήματα — μηδέν νέο AI-cost
  metering hook χρειάστηκε, μηδέν ρίσκο σε unattended run (καμία πιθανότητα hallucinated αριθμών). Ένα
  AI-γραμμένο, πιο «φυσικό» phrasing μένει follow-up (SaaS-metered, ξεκάθαρη μελλοντική αναβάθμιση πάνω στην
  ίδια δομημένη έξοδο). **Ενσωμάτωση**: `getReports()` (`app/reports/page.tsx`) καλεί το `buildMonthReview`
  πάνω στα ΗΔΗ φερμένα Expense rows + item warranties + budgets (**μηδέν νέο DB round-trip** — απλώς
  επεκτάθηκε το `.select()` του Expense query με `vendor vendorKey recurring`, πεδία που χρειάζεται το
  price-hike detector). Νέα κάρτα «Month in review» στην κορυφή του `/reports` (πριν τα Summary stats),
  narrative + chips για over-budget/price-changes/warranties. `reports.monthReview` i18n key μόνο στο
  `en.ts` (ίδιο precedent με P7/P12/P26/P24 — ελληνικό μεταφραστικό gap ήδη καταγεγραμμένο).
  **Ανοιχτή απόφαση (builder default) τηρήθηκε ως προς το UI**: in-app card (Reports) ✓· notification-framework
  integration (bell/ntfy digest) **ΔΕΝ** χτίστηκε αυτό το run (θα χρειαζόταν νέο NotifKind + dedupeKey σχήμα +
  cron/manual-trigger, μεγαλύτερο diff) — follow-up. Auto-schedule 1η/μήνα ΔΕΝ χτίστηκε (η εφαρμογή δεν έχει
  cron infra σήμερα, ίδιο pre-existing gap με P11/P24/P28) — η κάρτα υπολογίζεται on-demand σε κάθε φόρτωση
  του `/reports` (ισοδύναμο του «on-demand button», μηδέν επιπλέον κλικ).
- **Verify:** `npm run type-check` EXIT 0. Full `npx vitest run` **2445 passed / 192 files** (+11 νέα, μηδέν
  regression). Safe Docker rebuild (`docker compose build web` → mongo ήδη healthy → `up -d web`):
  `RestartCount=0`, `/login` 200, `/reports` 307 (auth-gated, compiled καθαρό), `docker logs` καθαρό (μόνο το
  προϋπάρχον άσχετο `@napi-rs/canvas` warning). Browser-checked (Claude Browser pane): `/login` → «Sign in ·
  Pharos», μηδέν console errors. `docker builder prune -f` μετά. `/reports` UI δεν testable end-to-end χωρίς
  τα credentials του Αχιλλέα (ίδιος περιορισμός με κάθε προηγούμενο auth-gated-only run) — η λογική
  επαληθεύτηκε πλήρως μέσω των 11 unit tests πάνω στο pure `buildMonthReview`.
- **Αξία:** αφηγηματική σύνοψη μήνα («ξόδεψες €X, +12%, top κατηγορία, 2 ασυνήθιστες χρεώσεις, 3 εγγυήσεις
  λήγουν») ως in-app card. Δομικά στοιχεία υπήρχαν ήδη (budget-exceeded, price-hike, get_overview) — v1 τα
  ενοποιεί σε μία αναγνώσιμη πρόταση αντί σκόρπιων αριθμών.
- **Module:** Reports (+ Notifications follow-up).
- **Follow-up:** notification-framework digest (bell + ntfy, μηνιαίο dedupeKey)· AI-generated phrasing πάνω
  στην ήδη-δομημένη έξοδο (SaaS-metered)· `/api/v1` mobile exposure (web-only για τώρα, ίδιο notice με κάθε
  πρόσφατο Reports/Settings-only feature).

### P1. Demo / sample-data mode σε fresh install — ✅ SHIPPED 2026-07-17 (pharos-daily-dev)
- **Υλοποίηση:** νέο `isSample: Boolean` (default false, indexed) στο `Item`/`Receipt`/`Expense`/`Subscription`.
  Νέο pure **`lib/sampleData.ts`** `buildSampleData(now, locale)` (DB-free, +9 unit tests, ντετερμινιστικό): 6 items
  (mix inventory/shopping status), 4 receipts (`filePath:''` → δείχνει το ήδη-υπάρχον «No scan file» placeholder, μηδέν
  fake binary), 10 expenses (rent+utilities recurring 3 μηνών, salary recurring 2 μηνών, fuel+groceries one-off), 3
  subscriptions (Netflix/Spotify/iCloud+). Category slugs = ακριβώς τα `DEFAULT_*_CATEGORIES` (lib/taxonomies.ts) ώστε
  τα icons/χρώματα να δουλεύουν κανονικά. **Locale-aware**: `el` παίρνει ξεχωριστό ελληνικό copy (τίτλοι/vendors/stores
  μεταφρασμένα, category slugs ίδια), όλα τα άλλα locales fallback σε English (ίδιο precedent με το i18n rollout).
  Νέο **`app/settings/sampleDataActions.ts`** (`requireAdmin`-gated): `loadSampleData()` idempotent (delete existing
  `isSample:true` πρώτα, μετά insertMany φρέσκο set με σημερινές σχετικές ημερομηνίες) + `clearSampleData()` (hard
  delete μόνο `isSample:true`) + `getSampleDataStatus()` (counts, για το UI toggle). **UI**: νέο `SampleDataManager`
  Section στο Settings → Storage & backup (κάτω από Backup/Restore) — «Load sample data» / «Reload sample data» button
  (αλλάζει label όταν ήδη loaded) + confirm πριν reload + «Clear sample data» (confirm, εμφανίζεται μόνο όταν loaded) +
  live counts. i18n keys `set.sample*` μόνο στο en.ts (ίδιο precedent με P7/P12/P26 — ελληνικό gap ήδη καταγεγραμμένο).
- **Builder default τηρήθηκε:** locale-aware demo data ✓· setup-wizard integration = follow-up (out of scope, S-size),
  έμεινε στο Settings μόνο για αυτό το run.
- **Verify:** `npm run type-check` EXIT 0. Full `npx vitest run` **2274 passed / 176 files** (+9 νέα, μηδέν
  regression). Safe Docker rebuild (`docker compose build web` → mongo healthy → `up -d web`): `RestartCount=0`,
  `/login` 200 (browser-checked, μηδέν console errors), `/` + `/settings` 307 (auth-gated, compiled χωρίς server
  error). `docker builder prune -f` μετά (−2.19GB). Docker lock released.
- **Follow-up:** setup-wizard optional step (δεν χτίστηκε)· κανένα visual «DEMO» badge στα cards (out of scope,
  θα χρειαστεί serializer+type εκτεθειμένο στους 4 client components — follow-up αν ζητηθεί)· `isSample` δεν
  φιλτράρεται από Reports/budgets/net-worth aggregates (σκόπιμα — το demo πρέπει να «γεμίζει» ρεαλιστικά).
- **Module:** cross-cutting (Settings → Storage & backup) + 4 models (Item/Receipt/Expense/Subscription).

### P26. In-app onboarding checklist / getting-started guide — ✅ SHIPPED 2026-07-16 (pharos-daily-dev)
- **Υλοποίηση:** `AppConfig.onboardingDismissed` (boolean, ίδιο pattern με `aiOnboardingDismissed`) + `AppSettings.onboardingDismissed`
  (`lib/appSettings.ts`) + νέο `dismissOnboarding()` action (`settings/actions.ts`, mirror του `dismissAiOnboarding`, κανένα
  `requireAdmin` — κάθε signed-in χρήστης μπορεί να το κλείσει). Νέο client component **`components/OnboardingChecklist.tsx`**
  (dismissable card, mirror του `AiOnboardingBanner` pattern: optimistic hide + server action) με **5 βήματα** (builder default
  τηρήθηκε ακριβώς): connect storage (`getStorageConfig().backend !== 'local'`), add first receipt (`Receipt.countDocuments()>0`),
  set a budget (`Object.keys(settings.budgets).length>0`), add a payment card (`Card.countDocuments()>0`), enable notifications
  (`getNotifiers().some(n=>n.enabled)`, reuse του P32-εποχής pluggable notifier list, καλύπτει ntfy legacy + discord/slack/telegram/webhook).
  Κάθε βήμα δείχνει progress-tick (✓ πράσινο done) + deep-link (`/receipts`, `/settings?tab=storage|money|notifications`).
  **Collapsible μετά την ολοκλήρωση** (`allDone` → auto-collapsed compact bar «All set», ΟΧΙ hidden — ξεχωριστό από το ρητό
  X-dismiss που το κρύβει μόνιμα). `page.tsx getStats()` υπολόγισε τα 5 sinals μέσα στο ήδη-υπάρχον `Promise.all` (προστέθηκαν
  `Card.countDocuments()`, `getAppSettings()`, `getStorageConfig()`, `getNotifiers()`). i18n keys `home.onb*` μόνο στο en.ts
  (ίδιο precedent με P7/P12 — ελληνικό μεταφραστικό pass ξεχωριστό, καταγράφεται ήδη στο WEB_DEBT.md).
- **Builder default τηρήθηκε ρητά:** shown σε self-host + SaaS onboarding (κανένα SaaS-only gating)· ίδιο μοτίβο convention
  με το προϋπάρχον `page.tsx`/`settings/actions.ts` (direct model imports, ΟΧΙ `currentModel`/`withRequestTenant` — pre-existing
  σε ΟΛΟ το homepage + settings actions module, όχι κάτι που εισήγαγα νέο εδώ, βλ. PROGRESS.md 2026-07-16 για λεπτομέρειες).
- **Verify:** `npm run type-check` EXIT 0. Full `npx vitest run` **2265 passed / 175 files** (+1 fixture update στο
  `appSettings.test.ts` για το νέο πεδίο, μηδέν άλλο regression). Safe Docker rebuild (`docker compose build web` → mongo ήδη
  healthy → `up -d web`): clean start (0 restarts, `ExitCode:0`), `/login` 200 (browser-checked, μηδέν console errors),
  `/` + `/settings` 307 (auth-gated, compiled χωρίς server error). `docker builder prune -f` μετά (−2.18GB). Docker lock released.
- **Αξία:** dismissable «getting started» card (connect storage, add first receipt, set budget, add card,
  enable notifications) με progress ticks → activation. **Διακριτό** από P1 (demo data) — εδώ τα *δικά του* δεδομένα.
- **Module:** Homepage / Dashboard (dismissable card) + Settings state reads.

### P9. Multi-currency (per-transaction currency + FX conversion) — ✅ FOUNDATION + 7 MODULES + ΟΛΑ ΤΑ IMPORTS (CSV, email-in, URL) + AUDIT/INLINE-FIX + **ΟΛΟ ΤΟ MOBILE UI 6/6** + **rate-feed (phase 2)** — SHIPPED πλήρως (23η σάρωση: `lib/fxRates.ts`/`fxRateActions.ts` verified wired σε `FxRateButton`, 6/6 clients: bills/expenses/items/receipts/statements/subscriptions)
- **Τι χτίστηκε (slice 1 από L item):** νέο pure **`lib/fx.ts`** (+25 unit tests, client-safe, DB-free) που κρατά
  **ΤΟΝ ΕΝΑΝ κανόνα** σε ένα μέρος: `normalizeCurrency`, `isForeignCurrency`, `convertToBase`, `deriveFxRate`,
  `resolveFx`, `formatMoney`, `fxBadgeLabel`. **Κλειδωμένη αρχιτεκτονική απόφαση (builder default, μηδέν migration):
  το `amount` είναι ΠΑΝΤΑ σε base currency**, οπότε ΚΑΘΕ existing aggregation (reports, budgets, cash flow, anomaly
  medians, split shares, net worth) συνεχίζει να αθροίζει `amount` χωρίς μία γραμμή αλλαγής· ένα foreign έγγραφο
  κρατά ΕΠΙΠΛΕΟΝ το τυπωμένο σκέλος (`currency` + νέα `origAmount` + νέο `fxRate`, `amount = origAmount * fxRate`).
  Όταν το rate είναι άγνωστο **ΔΕΝ εφευρίσκεται 1:1**: το `amount` μένει ο τυπωμένος αριθμός (byte-for-byte η παλιά
  συμπεριφορά, μηδέν σιωπηλή μετακίνηση συνόλου) και σημαίνεται ώστε το UI να ζητήσει rate.
  **Πραγματικό bug που κλείνει**: το `Expense.currency` αποθηκευόταν ήδη (το AI το parse-άρει) αλλά **ΚΑΝΕΝΑ path δεν
  το τιμούσε** → μια απόδειξη $88 προσθέτονταν σιωπηλά ως €88 στα σύνολα. Τώρα φαίνεται.
  **Opt-in ανά deployment** (όπως ζητούσε το spec): `AppConfig.multiCurrency` (default **false**) + appSettings +
  Settings → Defaults switch· off = μηδέν επιπλέον πεδίο, single-currency χρήστης δεν βλέπει τίποτα.
  Wiring: `Expense.origAmount`/`fxRate` + serialize + `SerializedExpense` + **και τα 4 write paths** (uploadExpense/
  addExpense/updateExpense/rescanExpense) περνούν από `resolveFx` (+5 integration tests)· `generateDueRecurring`
  στάμπαρε base currency (projection είναι base by definition)· `/api/v1/expenses` shape += origAmount/fxRate
  (**mobile parity μαζί, όχι follow-up**) + τεκμηρίωση στο `API.md`. UI: currency select + FX row («rate» ή «or
  charged», το δεύτερο κάνει back-out του rate μέσω `deriveFxRate` για όποιον διαβάζει statement) + live preview του
  ποσού που θα αποθηκευτεί + **`FxBadge`** σε card/row (purple όταν το rate είναι γνωστό, **gold ⚠ όταν λείπει** —
  γιατί τότε το ποσό στα σύνολα είναι ακόμα ξένο νόμισμα).
- **Verify:** `npm run type-check` EXIT 0· full `npx vitest run` **3523 passed / 264 files** (+30, μηδέν regression·
  7 exact-shape assertions ενημερώθηκαν για τα 2 νέα πεδία). Docker: mutex → `build web` → mongo healthy →
  `up -d web` → `/login` **200 με την πρώτη**, **0 restarts**, `/expenses`+`/settings` 307 (auth-gated, compiled) →
  `docker builder prune -f` (197MB) → lock released. Browser: app renders, **μηδέν console errors** (το authed
  `/expenses` δεν είναι επαληθεύσιμο unattended, credentials boundary).
- **Τι χτίστηκε (slice 2 — Receipts, 2026-07-25):** ίδια 3 πεδία στο `Receipt` (`currency` υπήρχε ήδη αγνοημένο,
  + `origAmount`/`fxRate`) και **και τα 4 write paths** (uploadReceipt/updateReceipt/quickVerifyReceipt/rescanReceipt)
  περνούν από `resolveFx`. **Διαφορά από τα expenses**: μια απόδειξη έχει ΠΟΛΛΑ ποσά, όχι ένα — γι' αυτό μετατρέπεται
  **ΟΛΟ το money side με ΤΟ ΙΔΙΟ rate** (total + net + ΦΠΑ + τιμές γραμμών), αφού το `vatAmount` το αθροίζουν τα
  reports και οι τιμές γραμμών αντιγράφονται στο `Item.purchasedPrice` (μισο-μετατρεπμένη απόδειξη θα δηλητηρίαζε και
  τα δύο). Μόνο το total κρατά την τυπωμένη τιμή του verbatim (`origAmount`)· τα υπόλοιπα επιστρέφουν για edit μέσω
  νέου pure **`fx.toPrinted()`** (+4 tests), ώστε ένα re-save χωρίς αλλαγή να μην ξανα-μετατρέπει (pinned με τεστ).
  Το re-scan **κρατά** ένα rate που έβαλε ο χρήστης όταν το νέο parse δίνει ΤΟ ΙΔΙΟ νόμισμα, το πετά αλλιώς. Το
  quick-verify δείχνει/υποβάλλει τυπωμένα ποσά και μετατρέπει με το ήδη αποθηκευμένο rate. UI: currency select δίπλα
  στο total + η ίδια FX γραμμή (rate ή «or charged») + το `FxBadge` **εξήχθη σε κοινό `components/FxBadge.tsx`**
  (structural typing) και χρησιμοποιείται πλέον από expenses ΚΑΙ receipts (card/row/quick-verify).
  `/api/v1/receipts` shape += origAmount/fxRate + τεκμηρίωση στο `API.md`. **+9 tests** (3553 total).
- **Τι χτίστηκε (slice 3 — Subscriptions, 2026-07-25):** ίδια 3 πεδία στο `Subscription` + **και τα 4 write paths**
  (createSubscription/updateSubscription/`POST` v1/`PATCH` v1) περνούν από `resolveFx`. **Διαφορά από τα expenses**:
  μια συνδρομή έχει ΔΥΟ ποσά (το recurring `amount` + το post-trial `firstChargeAmount`), οπότε μετατρέπονται
  **μαζί με ΤΟ ΙΔΙΟ rate** (και τα δύο αθροίζονται/εμφανίζονται σε base currency: monthly/yearly totals, `/calendar`
  agenda, trial-charge digest του P33). Το `PATCH` **ξαναδιαβάζει το τρέχον doc** όταν το body αγγίζει money field,
  ώστε ένα partial update (μόνο rate, μόνο currency, μόνο amount) να μην αφήνει ΠΟΤΕ μισο-μετατρεπμένη εγγραφή·
  bodies χωρίς money field δεν πληρώνουν το extra read. **Δύο υπαρκτά bugs έκλεισαν στην πορεία**: το
  `trackDiscoveredSubscription` (P7 «Track this») και το AI `add_subscription` στάμπαραν **hardcoded `'EUR'`** — σε
  non-EUR deployment κάθε τέτοια εγγραφή γεννιόταν «foreign» ενώ το ποσό ήταν ήδη base· τώρα παίρνουν τη base
  currency. UI: currency select + η ίδια FX γραμμή (rate ή «or charged») + `FxBadge` στην κάρτα· το AI-suggested
  currency τιμάται **μόνο** όταν το multi-currency είναι on (αλλιώς θα μάρκαρε foreign μια single-currency εγγραφή).
  `/api/v1/subscriptions` shape += origAmount/fxRate + POST/PATCH δέχονται currency/fxRate + τεκμηρίωση στο `API.md`
  (μαζί καθαρίστηκε stale roadmap γραμμή που έλεγε ότι PATCH/DELETE εκκρεμούν ενώ ήδη υπάρχουν). **+36 tests** (3589).
- **Τι χτίστηκε (slice 4 — Items, 2026-07-25):** ίδια 3 πεδία στο `Item` (`currency`/`origAmount`/`fxRate`) και **και
  τα 4 write paths** (createItem/updateItem/`POST` v1/`PATCH` v1). **Διαφορά από τα προηγούμενα**: ένα item έχει
  **ΤΡΙΑ** ποσά (`purchasedPrice`, `currentPrice`, `targetPrice`) γραμμένα στο ΙΔΙΟ χαρτί/shop page, οπότε
  μετατρέπονται **όλα με ΤΟ ΙΔΙΟ rate** (τα αθροίζουν net worth, το insurance export του P13, το inventory value ανά
  κατηγορία και το shopping budget· μισο-μετατρεπμένο item θα δηλητηρίαζε και τα τέσσερα). Νέο pure
  **`fx.resolveItemPrices()`** (+11 unit tests) κρατά αυτόν τον κανόνα σε ΕΝΑ μέρος και το μοιράζονται action + API
  route. Το `origAmount` κρατά την τυπωμένη **ANCHOR** τιμή: ό,τι **πλήρωσες** όταν το item είναι owned, αλλιώς την
  τιμή ζήτησης (αυτό αναγνωρίζει κανείς από την απόδειξη, αυτό δείχνει το `FxBadge`). **Δεν μετατρέπονται** οι τιμές
  των store links (`links[].price`, ό,τι quote-άρει ο scraper/το shop) ούτε το παλιό `priceHistory[].currency`, οπότε
  το derived «cheapest link» currentPrice μένει ακριβώς όπως ήταν. Το `PATCH` ξαναδιαβάζει το doc σε κάθε money field
  και **ξε-μετατρέπει πρώτα** (μέσω `toPrinted`) ώστε ένα νέο rate να εφαρμόζεται στα ΤΥΠΩΜΕΝΑ νούμερα και όχι πάνω σε
  προηγούμενη μετατροπή (re-sending του ίδιου rate = no-op, pinned με τεστ). Ίδιο και στη φόρμα: ένα foreign item
  σείρνεται στο form ως printed, ώστε re-save χωρίς αλλαγή να μην ξανα-μετατρέπει. UI: currency select + η ίδια FX
  γραμμή (rate ή «or charged») + `FxBadge` σε card/row/detail. `/api/v1/items` shape += currency/origAmount/fxRate +
  POST/PATCH δέχονται currency/fxRate (**mobile parity μαζί**) + τεκμηρίωση στο `API.md`. **+23 tests** (3636).
- **Τι χτίστηκε (slice 5 — Statements, 2026-07-25):** ίδια 3 πεδία στο `Statement` (`currency` υπήρχε ήδη αγνοημένο,
  + `origAmount`/`fxRate`) και **και τα 5 write paths** (createStatement/updateStatement/addTransaction/
  importStatementPdf/rescanStatement). **Διαφορά από τα προηγούμενα**: μια κάρτα εκδίδει το statement σε **ΕΝΑ**
  νόμισμα, οπότε **ΕΝΑ per-statement rate** μετατρέπει ΟΛΟ το έγγραφο: total + minimum + paid **ΚΑΙ κάθε χρέωση**
  (`transactions[].amount`). Οι χρεώσεις μετράνε όσο και το total, γιατί το `computeInstallmentPlans` τις αθροίζει σε
  per-plan payoff που δείχνουν homepage («total owed»), `/calendar` και `/reports` σε base currency: μισο-μετατρεπμένο
  statement θα άφηνε τις ίδιες του τις γραμμές να μην βγάζουν το total του. Νέο pure **`fx.resolveStatementAmounts()`**
  (+9 unit tests). Το `origAmount` κρατά το τυπωμένο **headline total**. `updateStatement` **ξε-μετατρέπει πρώτα** τις
  αποθηκευμένες χρεώσεις (`toPrinted` με το ΠΑΛΙΟ rate) πριν εφαρμόσει το νέο, ώστε μια διόρθωση rate να πέφτει στα
  ΤΥΠΩΜΕΝΑ νούμερα και όχι πάνω σε προηγούμενη μετατροπή (ίδιο rate = no-op, pinned με τεστ)· το `addTransaction`
  μετατρέπει με το rate του ίδιου του statement. Ο parser **δεν διαβάζει νόμισμα** (το `ParsedStatementSchema` δεν έχει
  τέτοιο πεδίο, μηδέν αλλαγή prompt), οπότε το foreign το μαρκάρει ο χρήστης μία φορά στη φόρμα και το **re-import του
  ίδιου μήνα ΞΑΝΑΧΡΗΣΙΜΟΠΟΙΕΙ** αυτή την απόφαση (ίδιος κανόνας με το re-scan που κρατά το rate) αντί να γυρίσει σιωπηλά
  τον μήνα σε base. Στο re-scan διορθώθηκε και το preservation key (τα παλιά lines συγκρίνονται πλέον σε **printed**
  ποσά, αλλιώς σε foreign statement κάθε installment edit + product link θα χανόταν στο re-scan). UI: currency select
  δίπλα στο total + η ίδια FX γραμμή (rate ή «or charged») + `FxBadge` στη λίστα. `/api/v1/statements` και
  `/statements/:id` shape += origAmount/fxRate (**mobile parity μαζί**) + τεκμηρίωση στο `docs/api.md`. **+18 tests**
  (3677). **Follow-up**: `fxBadgeLabel` δεν renders σε credit balance (αρνητικό printed total, guard `orig <= 0`) —
  τα ποσά μετατρέπονται σωστά, απλά λείπει το chip.
- **Τι χτίστηκε (slice 9 — inline «set rate» μέσα στο audit panel, 2026-07-26):** το panel του slice 7 έβρισκε τις
  εγγραφές χωρίς ισοτιμία αλλά σε έστελνε σε **έξι διαφορετικές φόρμες** για να τις διορθώσεις, που είναι ακριβώς ο
  λόγος που έμεναν αδιόρθωτες. Πλέον ο ρυθμός μπαίνει **επί τόπου**: οι γραμμές ομαδοποιούνται **ανά τυπωμένο νόμισμα**
  (μεγαλύτερη έκθεση πρώτη), κάθε ομάδα έχει ένα κουτί `1 USD = ? EUR` + **«Apply to all N»** (η συνηθισμένη περίπτωση
  μετά από bank import που γέννησε δεκάδες), και κάθε γραμμή μπορεί να **παρακάμψει** την ομάδα με δικό της rate + δικό
  της Apply, με live preview `printed → stored` πριν το γράψιμο. Νέο pure **`lib/fxApply.ts`** (+23 unit tests, DB-free)
  κρατά σε ΕΝΑ μέρος **ποια πεδία μετατρέπονται ανά module** (καθρεφτίζει τον resolver του καθενός: receipt net/ΦΠΑ/κάθε
  γραμμή, item και τις 3 τιμές, statement minimum/paid/κάθε χρέωση, subscription first charge) + νέα
  `applyFxRate`/`applyFxRateToCurrency` server actions (`app/reports/fxActions.ts`).
  **Γιατί είναι ασφαλές**: το `resolveFx` δεν εφευρίσκει ποτέ rate, άρα εγγραφή με `fxRate<=0` **δεν έχει μετατραπεί
  ποτέ** — κάθε ποσό της είναι ακόμα το τυπωμένο, οπότε η εφαρμογή rate είναι σκέτος πολλαπλασιασμός χωρίς un-convert
  βήμα, και το `needsFxRate` guard γυρίζει `null` σε ό,τι έχει ήδη rate (**ποτέ δεύτερη μετατροπή**, pinned με τεστ).
  Τα arrays γράφονται με **dotted paths** (`transactions.3.amount`, `lineItems.0.price`) ώστε να μη χαθεί τίποτα άλλο
  μέσα στα subdocs (installment info, product links, ονόματα γραμμών).
- **Τι χτίστηκε (slice 10 — product URL import, 2026-07-26):** το **email-in ελέγχθηκε και ήταν ΗΔΗ καλυμμένο** (το
  `checkImapInbox` περνά κάθε συνημμένο/σώμα από το `uploadReceipt`, δηλαδή τον resolver του slice 2 — καμία
  παρακαμπτήριος create). Το πραγματικό εναπομείναν write path ήταν το **URL import προϊόντος**: το
  `ParsedProductSchema` είχε πεδίο `currency` αλλά **κανένα call site δεν το διάβαζε**, οπότε μια σελίδα σε δολάρια
  αποθηκευόταν σαν να ήταν base. Πλέον: νέο **`extractPriceCurrency`** (`lib/scrape.ts`, +9 tests) διαβάζει
  **ντετερμινιστικά** τον κωδικό από το markup της σελίδας (schema.org `priceCurrency` → `og:/product:price:currency`
  → `itemprop`), με fallback στο τι διάβασε το μοντέλο· **σκέτο σύμβολο δεν μαντεύεται ποτέ** («$» = USD αλλού, CAD/AUD
  αλλού). Το default του schema έγινε `''` αντί `'EUR'` (το `'EUR'` θα έλεγε σε dollar-based deployment ότι **κάθε**
  import είναι foreign). **Νέο item** υιοθετεί το νόμισμα μέσω `resolveItemPrices` (τυπωμένο ποσό + `fxRate 0` →
  εμφανίζεται στο audit του slice 7 → διορθώνεται inline με το slice 9). **Υπάρχον item**: το link μπαίνει αλλά η τιμή
  **ΔΕΝ** γράφεται όταν το νόμισμα διαφέρει (ένα item, ένα rate για όλες τις τιμές του) και το αποτέλεσμα λέει ποιο
  νόμισμα παραλείφθηκε — ίδιος κανόνας σε `importItemFromUrl`, `confirmImportItem` και το refresh τιμών του
  `aiFillItem`. Νέα pure `effectiveCurrency`/`sameCurrency` (`lib/fx.ts`) + νέο test file
  `items/actions.urlImport.test.ts` (21 tests, το URL-import concern που είχε μείνει ανοιχτό).
- **Τι χτίστηκε (mobile slice — Items, 2026-07-26):** το `FxControls` (badge + currency/rate/«charged» πεδία) καλωδιώθηκε
  στο `ItemsScreen`, μετά τα Expenses/Bills/Subscriptions. Μηδέν αλλαγή στο server. **Διαφορά**: ένα item έχει ΤΡΕΙΣ τιμές
  και μόνο η anchor (paid αν owned, αλλιώς asking) κρατά την τυπωμένη τιμή στο `origAmount`, οπότε η φόρμα ξε-μετατρέπει
  price/target με νέο `toPrinted()` (mobile mirror του web) πριν τα δείξει· χωρίς αυτό ένα re-save χωρίς αλλαγή θα τα
  μετέτρεπε δεύτερη φορά. Το preview/back-out δουλεύει πάνω στην anchor, ίδιος κανόνας με το `resolveItemPrices()`.
  Μαζί: κάθε ποσό της οθόνης (λίστα, PricePanel, installment plans, URL-import alert) τύπωνε το hardcoded EUR fallback
  του `money()` → τώρα περνά τη base currency.
- **Τι χτίστηκε (mobile slice — Statements, 2026-07-27):** το τελευταίο money screen. **Μηδέν δουλειά στο server**
  (τα δύο routes επέστρεφαν ήδη `origAmount`/`fxRate` από το slice 5) και **μηδέν `<FxFields>`**: η οθόνη είναι
  read-only στο κινητό (το statement γεννιέται από PDF import στο web), οπότε μπήκε `<FxBadge>` στη λίστα + **μία**
  φορά στο detail sheet — ένα rate μετατρέπει ΟΛΟ το έγγραφο, άρα το chip ανήκει στο έγγραφο και όχι σε κάθε χρέωση.
  **Bug που έκλεισε μαζί** (ίδια κλάση με Subscriptions/Bills/Items/Receipts): κάθε ποσό της οθόνης τυπωνόταν με
  `currency`, δηλαδή το σύμβολο **της τράπεζας** πάνω σε **base-currency** νούμερο. Η base currency έρχεται από το
  ήδη-ζητούμενο plans payload, οπότε μηδέν επιπλέον request. **Το mobile P9 κλείνει 6/6.**
- **Τι χτίστηκε (slice — δωρεάν rate-feed, phase 2, ήδη shipped, επιβεβαιώθηκε live 23η σάρωση):** νέο
  **`lib/fxRates.ts`** (`fetchFxRate`, Frankfurter/ECB daily reference rates — free, key-less, self-hostable via
  `FX_RATE_API_URL`) + **`app/fxRateActions.ts`** (`lookupMarketRate`, tenant-scoped, off όταν multi-currency off) +
  **`components/FxRateButton.tsx`** («fetch market rate» δίπλα στο manual rate input, ο χρήστης βλέπει/αποδέχεται/
  overwrite-άρει πριν αποθηκευτεί — ΠΟΤΕ auto-apply). Wired σε **6/6 clients**: Bills, Expenses, Items, Receipts,
  Statements, Subscriptions (verified `grep -rl FxRateButton apps/web/src/app`). Ο κανόνας «δεν εφευρίσκεται rate»
  μένει αμετάβλητος — το feed προσφέρει, δεν επιβάλλει.
- **Εκκρεμεί (μικρό, γνωστό όριο):** τα `links[].price`/`priceHistory[].price` ενός item μένουν **τυπωμένα** (δεν
  μετατρέπονται μαζί με τις 3 headline τιμές) — γνωστό όριο του μοντέλου του slice 4, όχι blocking.
- **Αξία (αρχικό):** ανά-συναλλαγή currency + FX rate (snapshot τη μέρα) + reporting σε base currency. Πραγματικό κενό
  (CLAUDE.md). Μεγάλο: αγγίζει schema (amount+currency+rate), aggregations, imports, όλα τα money views.
- **Module:** cross-cutting (Expenses/Receipts/Statements/Reports + `lib/money.ts`).
- **Ανοιχτή απόφαση (builder default):** **opt-in ανά deployment** (μη βαρύνει single-currency χρήστες)· FX =
  on-import capture + manual override (δωρεάν API phase 2). ΣΗΜ: L — άφησέ το τελευταίο (μεγαλύτερο ρίσκο/κόπος).

---

## Done

### P63. Backup/export λείπει 7 μοντέλα — data-loss ρίσκο σε restore, όχι απλά νέο feature — ✅ SHIPPED 2026-07-26 (pharos-daily-dev)
> **Χτίστηκε χωρίς να περάσει από «Approved» σκόπιμα**, γιατί δεν είναι προϊοντική απόφαση: είναι defect fix σε
> ήδη-shipped feature (το backup υποσχόταν πλήρες restore και σιωπηλά δεν το έκανε), και το ίδιο το item το
> χαρακτηρίζει «μηχανικό fix, μηδέν νέος σχεδιασμός, καμία ανοιχτή απόφαση». Τα 7 μοντέλα μπήκαν, και επιπλέον
> το map βγήκε από το `settings/actions.ts` σε **`lib/backupModels.ts`** με guard test που απαιτεί κάθε μοντέλο
> στο `src/models` να είναι είτε στο backup είτε ρητά excluded με αιτιολογία, ώστε να μην ξανα-συσσωρευτεί το ίδιο
> κενό σιωπηλά. Τα secrets (`AppConfig`/`User`/`Account`) μένουν σκόπιμα εκτός (το JSON κατεβαίνει στον δίσκο του
> χρήστη), τεκμηριωμένο σε νέα ενότητα «Backup & restore (JSON)» στο `docs/features.md`.
- **Αξία:** live-verified: `ls apps/web/src/models/*.ts` = **27 models**, αλλά το `BACKUP_MODELS` map
  (`settings/actions.ts:1228-1237`, τροφοδοτεί ΚΑΙ το `exportData()` ΚΑΙ το `importData()` — συμμετρικό, ίδιο
  key-loop και στα δύο) έχει μόνο **8 keys** (items/receipts/statements/subscriptions/vouchers/cards/tasks/stores).
  **Λείπουν εντελώς 7 μοντέλα**: **`Expense`** (ολόκληρο το Income/Expenses module — μισθός, λογαριασμοί,
  ιστορικό εξόδων, ήδη γνωστό κενό βλ. PA2 follow-up note παρακάτω), **`Bill`** (P28 payables),
  **`Goal`** (P12 savings goals + contributions), **`GiftCard`** (P32 balances + uses log), **`LoyaltyCard`**
  (P20), **`NetWorthSnapshot`** (PA2 trend history), **`ShoppingListItem`**. Ένας self-host χρήστης που κάνει
  «Export JSON» ή τρέχει το nightly `backup.sh` (CLAUDE.md) και μετά χρειάζεται πραγματικό restore (disk failure,
  κακό migration) **χάνει σιωπηλά όλα αυτά τα δεδομένα** χωρίς καμία προειδοποίηση — το backup «φαίνεται» πλήρες
  (κατεβαίνει κανονικά ένα JSON αρχείο) αλλά δεν είναι. Το ίδιο κενό είχε ήδη σημειωθεί ως follow-up-note κάτω
  από ένα `## Done` item (PA2, «τα snapshots [και τα expenses, προϋπάρχον κενό] ΔΕΝ μπαίνουν στο backup export»)
  αλλά ΠΟΤΕ δεν έγινε δικό του actionable queue item — ξεχωρίζεται εδώ ρητά ώστε να μη χαθεί ξανά σε prose.
  **Μηχανικό fix, μηδέν νέος σχεδιασμός**: το `importData()` ήδη κάνει generic loop πάνω στα `BACKUP_MODELS`
  keys (upsert by `_id`, ίδιο sanitization για `filePath`/`thumbPath`/`photos`/`attachments` ανεξαρτήτως model) —
  προσθήκη 7 γραμμών στο map αρκεί, export ΚΑΙ import και τα δύο δουλεύουν αυτόματα συμμετρικά.
- **Module:** Settings → Storage & backup (`settings/actions.ts`, `BACKUP_MODELS` map — 1 τοπική αλλαγή).
- **Ανοιχτή απόφαση (builder default):** καμία — απλή προσθήκη 7 entries στο ήδη-υπάρχον map, ίδιο pattern με
  τα υπόλοιπα 8 (`expenses: Expense, bills: Bill, goals: Goal, giftcards: GiftCard, loyaltycards: LoyaltyCard,
  netWorthSnapshots: NetWorthSnapshot, shoppingListItems: ShoppingListItem`)· verify ότι παλιά backup αρχεία
  (χωρίς αυτά τα keys) συνεχίζουν να restore-άρονται καθαρά (τα νέα keys απλά λείπουν από το παλιό JSON,
  `Array.isArray(docs)` guard ήδη το χειρίζεται ως no-op).

### PA2 ← P4. Net-worth time-series — ✅ SHIPPED 2026-07-09 (pharos-daily-dev)
- Νέο `NetWorthSnapshot` model (ένα σημείο ανά YYYY-MM, unique period)· το banner των Reports
  έγινε «Net worth»: assets (owned inventory + manual accounts) − liabilities (υπόλοιπο δόσεων +
  card balances), breakdown chips + AreaChart trend από τα snapshots (≥2 σημεία, αλλιώς note).
- **Manual asset accounts**: Settings → Money → «Asset accounts» (όνομα + υπόλοιπο, χειροκίνητη
  ενημέρωση, ίδιο Mixed-map pattern με τα budgets· `saveAssetAccounts` + `AppSettings.assetAccounts`).
- **Capture**: idempotent upsert του τρέχοντος μήνα σε κάθε /reports load (pattern
  `generateDueRecurring`), forward-only χωρίς backfill· οι περασμένοι μήνες παγώνουν στο rollover.
  Το «μηνιαίο cron» του spec υλοποιήθηκε ως on-load capture: δεν υπάρχει in-app scheduler για
  tenant data, και το on-load είναι tenant-safe· true cron = follow-up αν στηθεί scheduler.
- Follow-ups: mobile/v1 expose (όπως PA1/PA3)· τα snapshots (και τα expenses, προϋπάρχον κενό)
  ΔΕΝ μπαίνουν στο backup export (`BACKUP_MODELS`).

### PA1 ← P2. Bank / generic CSV import — ✅ SHIPPED 2026-07-09 (pharos-daily-dev)
- «Import CSV» στο header των /expenses + /income → modal: file picker, RFC-4180 parser
  (κόμμα/ερωτηματικό/tab auto-detect, quotes, BOM), auto-guess column mapping (en+el headers),
  mapping UI (date/amount/vendor/category/notes), preview με έγκυρες/άκυρες γραμμές, «split by
  sign» option (αρνητικά → έξοδα, θετικά → έσοδα) για μικτά bank exports.
- Server action `importExpensesCsv`: re-validate (zod), dedupe kind+vendorKey+ημέρα+ποσό
  (έναντι υπαρχόντων ΚΑΙ μέσα στο batch), κληρονομιά category/recurring από υπάρχουσα σειρά
  vendor (ντετερμινιστικό, μηδέν AI), chunks των 300, cap 500/κλήση, `verified:true`
  (τραπεζικά δεδομένα, όχι AI guess). Pure lib `lib/csvImport.ts` + 24 vitest tests.
- Locked default τηρήθηκε: μηδέν inline AI. Το batch AI auto-categorise (opt-in κουμπί σε
  uncategorised imports) = follow-up· το ίδιο και το mobile UI (το API action είναι κοινό).

### PA3 ← P10. Return-window tracker — ✅ SHIPPED 2026-07-09 (pharos-daily-dev)
- Computed «return by» ανά απόδειξη (default 14 μέρες EU, ρυθμιζόμενο Settings → Defaults,
  per-store override Settings → Stores, 0 = χωρίς επιστροφές) + badge «Nd return» σε κάρτα/λίστα
  αποδείξεων (gold όταν ≤3 μέρες) + γραμμή «↩ return window(s) closing ≤3d» στο `runAlertChecks`.
- Web slice. Mobile badge = follow-up (το v1 API δεν εκθέτει ακόμα το computed πεδίο).
- Warranty-claim κομμάτι: καλύπτεται ήδη από warranty tracking/alerts· δεν χρειάστηκε νέο μοντέλο.

---

## Rejected

_(κενό)_
