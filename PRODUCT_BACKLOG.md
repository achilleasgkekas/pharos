# PHAROS — Product Backlog (προτάσεις προϊόντος)

> Ρόλος: ο **product-planner** ΠΡΟΤΕΙΝΕΙ candidate features, ο Αχιλλέας ΑΠΟΦΑΣΙΖΕΙ.
> Αυτό συμπληρώνει (δεν αντικαθιστά) το `TODO.md` (distribution/SaaS roadmap) και τις
> ουρά τεχνικού χρέους (`WEB_DEBT.md`), που καλύπτει code debt, όχι νέα features. (Το `MOBILE_PARITY.md`
> διαγράφηκε 2026-08-04 — το mobile app καταργήθηκε, βλ. `OWNER_DECISIONS.md` #15.)
> **Τίποτα στο «Proposed» δεν χτίζεται μέχρι ο Αχιλλέας να το μετακινήσει στο «Approved».**
> Οι builder routines τραβάνε ΜΟΝΟ από το «Approved». Το split OSS vs paid είναι δική του απόφαση.
> Σύμβολα μεγέθους: S (μικρό) · M (μεσαίο) · L (μεγάλο). Track: OSS / SaaS / both.
> Τελευταία ενημέρωση: 2026-08-13 (33η σάρωση planner).
> **Ιστορικό σαρώσεων (συμπιεσμένο στην 30ή σάρωση, ήταν ~230 γραμμές σκαναρίσματος-προς-σκανάρισμα, τώρα
> αυτό το block· τίποτα δεν χάθηκε, το αναλυτικό σκεπτικό ανά item μένει μέσα στο ίδιο item παρακάτω και στο
> `PROGRESS.md`/`git log -p -- PRODUCT_BACKLOG.md` για όποιον θέλει το πλήρες historical trace):**
> 29 σαρώσεις 2026-06-xx έως 2026-08-07. Τρεις μαζικές εγκρίσεις έσπασαν διαδοχικά decision-fatigue μπλοκαρίσματα:
> **2026-07-09/10** (P1/P3/P5-P36 + PA1-PA3), **2026-08-03** «approve all» (38 items, P37-P80), **2026-08-07**
> τρεις θεματικές ομάδες Α (χρήματα/ακρίβεια)/Β (συνδρομές)/Γ (αντικείμενα), 22 items, **με ρητή δεσμευτική
> σειρά Α→Γ→Β**, + ξεχωριστά P94 (storage add-on, blocked σε Stripe price ids από τον Αχιλλέα)/P95 (BYO-key
> add-on)/P96 (admin center, 14 items A1-E2, δεσμευτική σειρά A→B1/C1→υπόλοιπα).
>
> **Κατάσταση ουράς (33η σάρωση, 2026-08-13):** ενεργά buildable, όχι μπλοκαρισμένη. Κανένα νέο SHIPPED από την
> 32η σάρωση στο ίδιο το `PRODUCT_BACKLOG.md` (τα commits `a3398af`/`b7992c7` του git log είναι SaaS tenant-portal
> δουλειά, εκτός backlog scope). **P73 φαίνεται ακόμα το επόμενο** (το τελευταίο S της ομάδας Α· μετά μένουν τα
> S/M P62, P64, P83) — δεν βρέθηκε commit με «P73» στο git log, άρα αμετάβλητο από την προηγούμενη σάρωση. Η
> ουρά παραμένει μεγάλη (Proposed + unbuilt Approved, ~45+ items μεταξύ των δύο) οπότε ο ρυθμός νέων προτάσεων
> μένει χαμηλός (1/σάρωση) μέχρι να αδειάσει περισσότερο. Νέο αυτή τη σάρωση: **P102** (native Web Push
> notifier channel, μηδέν εξωτερικός λογαριασμός — βλ. item για το verified gap).
>
> **Dedupe προηγούμενων σαρώσεων (31η):** τρία Proposed items αφαιρέθηκαν ως redundant πριν προστεθεί οτιδήποτε
> νέο (live-verified, όχι απλή υποψία) — **P97** («Item lending tracker») ήταν λέξη-προς-λέξη το ίδιο με το ήδη-
> **Approved P47** (ίδιος τίτλος, ίδιο σχήμα `lentTo`/`expectedReturnAt`)· **P98** («Utility usage kWh/m³») ίδιο
> με το ήδη-**Approved P49** (ίδιο πεδίο consumption-vs-amount)· **P93** («Manual bank CSV/OFX import») παρέβλεψε
> ότι το **PA1** (Bank/generic CSV import) έχει ήδη SHIPPED (2026-07-09) ακριβώς αυτό — column-mapper, dedupe,
> `CsvImportModal.tsx`/`importExpensesCsv` verified στο κώδικα· το μόνο αγνό διαφορετικό (OFX format αντί CSV)
> είναι πολύ niche για ξεχωριστό item, δεν αξίζει slot στην ουρά. Η αιτία και στα τρία: παλιότερες σαρώσεις
> έψαξαν με λάθος/στενά keywords (π.χ. `bankStatement|BankAccount` αντί `csvImport|CsvImportModal`) και δεν
> βρήκαν το ήδη υπάρχον. Καμία απώλεια νοήματος· τα δύο πρώτα παραμένουν ζωντανά ως P47/P49 στο Approved.
>
> **⚠ Σημείωση εύρεσης αυτής της σάρωσης (32η):** το Network/UniFi module (`lib/unifi.ts`, `/network` σελίδα,
> Settings tab, homepage κάρτα) αφαιρέθηκε πλήρως στις 2026-06-12 (commit `5eb912d`, ρητή απόφαση Αχιλλέα, βλ.
> git log message) — το `CLAUDE.md` είναι stale σε αυτό (περιγράφει ακόμα το module ως ενεργό, το τελευταίο του
> session-log entry προηγείται της αφαίρεσης). **Καμία μελλοντική σάρωση δεν πρέπει να προτείνει Network/UniFi
> επεκτάσεις** βασιζόμενη στο `CLAUDE.md` χωρίς πρώτα να επιβεβαιώσει `find apps/web/src -iname "unifi*"` = 0.
>
> **Γνωστό ανοιχτό housekeeping (δεν είναι έγκριση, απλά σημείωση υγιεινής αρχείου):** αρκετά headers μέσα στο
> `## Approved` παρακάτω είναι ήδη «✅ SHIPPED» και θα έπρεπε τυπικά να ζουν στο `## Done`, αλλά δεν
> μετακινήθηκαν ένα-ένα (φυσική θέση δεν σημαίνει «ανοιχτό» σε αυτό το αρχείο, η αυθεντική πηγή έγκρισης είναι
> οι γραμμές «Νεοεγκεκριμένα» με τα IDs). Bulk-move παραμένει σκόπιμα εκτός scope μιας μεμονωμένης unattended
> σάρωσης (ρίσκο σύγκρουσης με ~12 routines που γράφουν στο ίδιο repo ταυτόχρονα σε ένα 2400+ γραμμών αρχείο)·
> θέλει δικό του αφιερωμένο interactive πέρασμα αν ο Αχιλλέας το θελήσει.

---

## Proposed (awaiting Αχιλλέας)

> Δεν χτίζονται μέχρι να μετακινηθούν στο «Approved» από τον Αχιλλέα.

### P102. Native Web Push notifier channel (browser push, μηδέν εξωτερικός λογαριασμός) — S/M — OSS (κυρίως), βοηθά και SaaS
- **Αξία:** live-verified `apps/web/src/lib/notifiers.shared.ts` → `NotifierType = 'ntfy' | 'discord' | 'slack' |
  'telegram' | 'webhook'` — **οι πέντε** notifier κανάλια που ήδη υπάρχουν (P3 session 2026-06-29) απαιτούν όλα
  έναν εξωτερικό λογαριασμό/service (ntfy.sh topic, Discord/Slack/Telegram bot, δικό σου webhook endpoint). Η
  εφαρμογή έχει ήδη PWA manifest (`app/manifest.ts`, «Add to Home Screen», CLAUDE.md) αλλά **κανένα service
  worker/push subscription** (`grep -rln "webpush|web-push|PushSubscription|serviceWorker" apps/web/src` = 0
  hits) — άρα ένας self-hoster που απλά θέλει «πες μου όταν πέσει η τιμή» χωρίς να ανοίξει λογαριασμό πουθενά
  σήμερα **δεν έχει καμία επιλογή** εκτός από να ανοίξει χειροκίνητα την εφαρμογή. Ταιριάζει άμεσα στο locked
  design principle του project «privacy-first, local-first, no cloud lock-in» (CLAUDE.md) — το μόνο κανάλι
  ειδοποιήσεων που δεν στέλνει τίποτα σε τρίτο server.
- **Module:** νέο `public/sw.js` (minimal service worker, μόνο `push`/`notificationclick` handlers) + registration
  hook στο ήδη-υπάρχον PWA install path· server-side `web-push` npm lib (VAPID keypair, generated once, αποθηκεύεται
  στο `AppConfig` όπως τα υπόλοιπα integration secrets) + νέο `models/PushSubscription.ts` (endpoint/keys ανά
  browser, ίδιο idiom με το διαγραμμένο mobile `pushTokens` αλλά web-native, ΟΧΙ Expo) + `lib/notifiers.ts` νέος
  `'webpush'` case στο ήδη-υπάρχον `dispatchAlert()` fan-out (μηδέν αλλαγή στο ίδιο το alert-engine, απλά ένα
  ακόμα κανάλι) + Settings → Notifications «Enable browser push» toggle (browser permission prompt, ίδιο idiom
  με τα υπόλοιπα `ChannelCard`).
- **Ανοιχτή απόφαση (builder default):** MVP = **μία active subscription ανά browser/device** (χωρίς cross-device
  fan-out logic στο πρώτο slice, ίδιο simple-first idiom με τα άλλα S notifiers)· expired/invalid subscriptions
  αφαιρούνται σιωπηλά στο επόμενο failed-send (καθαρό error-handling, όχι νέο UI για stale subscriptions)·
  household multi-user (P31) = κάθε member κάνει το δικό του opt-in ξεχωριστά, καμία κεντρική ρύθμιση.

### P101. Referral program — «κάλεσε έναν φίλο» για extra AI calls/μήνα (SaaS growth lever) — S/M — SaaS
- **Αξία:** live-verified `grep -rln "referral|inviteFriend|refCode" apps/web/src` = 0 hits, όπως και σε
  `PRODUCT_BACKLOG.md`/`ROADMAP.md`/`TODO.md` = 0 hits — δεν έχει προταθεί ξανά. Το SaaS trial/billing σκέλος
  είναι ήδη αρκετά ώριμο (`lib/billing/{plans,entitlements,usage,aiBilling}.ts`, `components/saas/QuotaBar.tsx`
  δείχνει ήδη «X of Y used»), αλλά **καμία** ενέργεια απόκτησης πελατών εκτός landing-page copy δεν υπάρχει.
  Ένα κλασικό low-CAC lever για ένα self-host-first προϊόν με ήδη υπάρχον 14ήμερο trial (`OWNER_DECISIONS.md`
  #11): υπάρχων tenant μοιράζεται κωδικό/link, νέος tenant που κάνει signup μέσω αυτού δίνει και στους δύο ένα
  προσωρινό bonus (π.χ. +X AI calls/μήνα ή +N ημέρες trial) αντί για καθαρά νομισματική έκπτωση (αποφυγή
  Stripe/Paddle coupon-code πολυπλοκότητας στο πρώτο slice).
- **Module:** `lib/tenancy/provision.ts` (νέο `referredBy` πεδίο στο tenant doc, capture στο signup flow αν
  υπάρχει `?ref=` query param) + νέο `lib/billing/referrals.ts` (generate/lookup κωδικού ανά tenant, ίδιο
  idiom με το ήδη-υπάρχον `apiToken`-style random slug) + Settings → Billing tab (δικό του link + «N successful
  referrals» μετρητής) + bonus εφαρμόζεται μέσω του ήδη-υπάρχοντος `entitlements.ts` override μηχανισμού (όχι
  νέο pricing μοντέλο).
- **Ανοιχτή απόφαση (builder default):** MVP = **bonus AI calls, όχι μήνες δωρεάν** (πιο εύκολο reversible αν
  γίνει κατάχρηση, μηδέν επίπτωση στο billing-cycle μηχανισμό)· ένα bonus **credit** ανά επιτυχημένο referral
  (πρώτη πληρωμή του νέου tenant, όχι απλό signup, αποφυγή fake-account farming), όχι unlimited stacking (cap
  π.χ. 5 ενεργά referral bonuses ταυτόχρονα)· self-host build = καμία αλλαγή/no-op (SaaS-only, ίδιο idiom με τα
  υπόλοιπα billing-only items).

### P100. Budget «pace» / προβλεπόμενο μηνιαίο σύνολο ανά κατηγορία (Reports) — S — OSS (κυρίως), dogfooding-heavy
- **Αξία:** live-verified `grep -rn "projected|pace|onTrack|daysLeft" apps/web/src/app/reports` = 0 hits. Το ήδη-
  shipped **P27** (suggest budgets) γεμίζει το όριο ανά κατηγορία και το ήδη-shipped **P25** (rollover) δείχνει το
  used/όριο ΤΩΡΑ, αλλά τίποτα δεν προβάλλει προς τα εμπρός: αν είναι 10 του μήνα και έχεις ήδη ξοδέψει το μισό
  ενός budget κατηγορίας, το σημερινό UI δείχνει απλά «50%» χωρίς να πει αν αυτό είναι φυσιολογικό pace ή ήδη
  εκτός πορείας. Απλός υπολογισμός (spend-so-far / days-elapsed × days-in-month) πάνω σε δεδομένα που το Reports
  ήδη φέρνει, μηδέν νέο μοντέλο, μηδέν AI. Ξεχωριστό από το ήδη-shipped **P19** (safe-to-spend, cashflow-wide,
  αφαιρεί μόνο γνωστές σταθερές μελλοντικές χρεώσεις) — αυτό εδώ είναι per-category budget projection, όχι
  cashflow.
- **Module:** `app/reports/page.tsx` (νέος pure υπολογισμός πάνω στο ήδη-φερμένο `thisMonthCat` per-category
  aggregation) + `ReportsClient.tsx` «Budget · this month» κάρτα (ήδη υπάρχει, P1 session 2026-06-09) — προσθήκη
  μιας γραμμής «at this pace: ~€X by month-end» + χρωματιστό chip (on-track/over-pace) ανά κατηγορία με ρυθμισμένο
  budget.
- **Ανοιχτή απόφαση (builder default):** MVP = γραμμικό pace (καμία seasonality/day-of-week weighting, ίδιο
  simple-first idiom με το P27 median)· εμφανίζεται μόνο για κατηγορίες με ρυθμισμένο budget>0 (ίδιο guard με το
  ήδη-υπάρχον card)· καμία νέα notification/alert σε αυτό το slice (μόνο in-page badge, follow-up αν ζητηθεί).

### P99. Δεύτερος (ταυτόχρονος) remote backup destination — πραγματικό 3-2-1, όχι ένα backend τη φορά — S/M — OSS (κυρίως), self-host trust lever
- **Αξία:** live-verified `models/AppConfig.ts:118` `storageBackend: enum ['local','ftp','smb','onedrive']` — **ένα
  και μόνο** backend ενεργό κάθε φορά. Το ίδιο το `CLAUDE.md` έχει ρητό locked design principle «3-2-1 backups: από
  την αρχή», αλλά η σημερινή αρχιτεκτονική δεν επιτρέπει καν 2 αντίγραφα εκτός τοπικού δίσκου ταυτόχρονα — αλλαγή
  backend σβήνει/αντικαθιστά το προηγούμενο mirror config, δεν προσθέτει δεύτερο. Ο ήδη-shipped **P48** (mirror
  sync-staleness alert) προϋποθέτει ένα mirror να υπάρχει, δεν λύνει το «μόνο ένα mirror επιτρέπεται». Πραγματικό
  3-2-1 (local + 2 διαφορετικά offsite) είναι το φυσικό follow-up.
- **Module:** `models/AppConfig.ts` (`storageBackend` string → `storageMirrors: [{backend, host, ...}]` array, ίδιο
  additive-migration idiom με τα υπόλοιπα AppConfig arrays π.χ. `notifiers`) + `lib/mirror.ts` (`mirrorFileToRemote`
  loop πάνω σε όλα τα ενεργά entries αντί για ένα) + Settings → Storage & backup UI (λίστα mirrors, add/remove,
  ίδιο idiom με το ήδη-shipped `NotificationsManager` multi-channel list).
- **Ανοιχτή απόφαση (builder default):** MVP = **cap 2 ταυτόχρονα remote mirrors** (αρκεί για 3-2-1, αποφυγή
  unbounded UI complexity)· backward-compat: το υπάρχον single `storageBackend`/creds μεταναστεύει αυτόματα σε
  πρώτο entry του array στο πρώτο read (ίδιο idiom με το ήδη-υπάρχον `notifiers` legacy-ntfy migrate-on-read)·
  sync παραμένει fire-and-forget/best-effort ανά destination (ένα αποτυχημένο δεν μπλοκάρει το άλλο).

### P92. Location-based filter/browse view για Items (dogfooding: δύο σπίτια + rack layout) — S — OSS, dogfooding-heavy
- **Αξία:** live-verified: το `Item.location` πεδίο υπάρχει ήδη (`models/Item.ts`: «where it physically lives
  (room / rack / shelf)», ήδη editable στη φόρμα, `app/items/ItemsClient.tsx`) αλλά είναι **χρήσιμο μόνο μέσα σε
  ένα item**, `grep -rln "byLocation|LocationView|groupByLocation" apps/web/src` = 0 hits, καμία σειρά φίλτρου/
  ομαδοποίησης το χρησιμοποιεί. Το `CLAUDE.md` καταγράφει ρητά δύο ενεργά σπίτια (κεντρικό + εξοχικό Kalamos)
  και ένα πλήρες 12U rack layout (U1-U12, συγκεκριμένη θέση ανά συσκευή), «τι έχω στο εξοχικό;» ή «τι είναι στο
  U9;» απαιτεί σήμερα να θυμάται κανείς νοερά ή να ανοίγει κάθε κάρτα ξεχωριστά.
- **Module:** `app/items/ItemsClient.tsx` (ίδιο `FilterGroup`/`SearchableSelect` idiom με Store/Category, νέο
  πεδίο φίλτρου πάνω σε distinct `item.location` values) + optional grouped-by-location list view (reuse του
  ήδη-shipped grid/list toggle).
- **Ανοιχτή απόφαση (builder default):** MVP = **φίλτρο μόνο** (dropdown, ίδιο idiom με τα υπόλοιπα), το
  grouped/collapsed-by-location view follow-up μόνο αν το απλό φίλτρο αποδειχτεί ανεπαρκές· κενό `location` σε
  παλιά items = εμφανίζονται πάντα (καμία κρυφή απώλεια δεδομένων).

### P91. «Αποσύνδεση παντού» / session invalidation μετά από ύποπτη πρόσβαση (follow-up στο μόλις-shipped P79) — S — OSS (κυρίως), βοηθά και SaaS self-host parity
- **Αξία:** live-verified: το self-host login (`lib/session.ts`) είναι **εντελώς stateless JWT** (jose, HS256,
  μηδέν session store) και `grep -rn "sessionEpoch|logoutEverywhere|invalidateSessions|signOutAll|
  revokeAllSessions" apps/web/src` = 0 hits. Αν διαρρεύσει ένα password, ή ένα κοινόχρηστο/οικογενειακό tablet
  μείνει συνδεδεμένο (household multi-user, P31), ο **μόνος** τρόπος να ακυρωθούν όλες οι ενεργές συνεδρίες
  σήμερα είναι να αλλάξει το `AUTH_SECRET` στο `.env` και να γίνει restart, που ρίχνει ΚΑΘΕ χρήστη ταυτόχρονα
  (global, όχι per-account). Φυσικό, χαμηλού-ρίσκου follow-up πάνω στο μόλις-shipped **P79** (TOTP/MFA): το ίδιο
  settings screen που μόλις πρόσθεσε 2FA είναι το φυσικό μέρος για ένα «sign out everywhere» κουμπί.
- **Module:** `models/User.ts` (νέο `sessionEpoch: number`, default 0) + `lib/session.ts` `signSession`/
  `verifySession` (embed + έλεγχος του epoch μέσα στο JWT payload, mismatch = invalid) + νέα action
  `logoutAllSessions(userId)` (bump epoch) + Settings → κουμπί «Sign out of all other devices» (και αυτόματο
  bump στο password-change flow αν δεν συμβαίνει ήδη).
- **Ανοιχτή απόφαση (builder default):** MVP = **παραμένει stateless** (κανένα νέο DB session-store, μόνο ένα
  integer counter στο ήδη-υπάρχον User doc, ίδιο pattern με το `apiToken`/`calendarToken` invalidation), καμία
  λίστα «ενεργών συσκευών» (θα χρειαζόταν πραγματικό session store, μεγαλύτερη αλλαγή, follow-up μόνο αν
  ζητηθεί ρητά).

### P90. Side-by-side compare view για items σε status «researching» — S — OSS, dogfooding-heavy
- **Αξία:** live-verified `grep -rln "CompareItems|compareMode|sideBySide" apps/web/src` = 0 hits. Το
  `Item.status` έχει ακόμα ενεργό το αρχικό `'researching'` state (`ITEM_STATUSES` στο `models/Item.ts`) — ο
  χρήστης βάζει εκεί υποψήφια προϊόντα πριν αποφασίσει (π.χ. δύο access points, δύο NAS options). Το ίδιο το
  `CLAUDE.md` καταγράφει ρητά το preference του: «Πάντα σύγκρινε τιμές EU Store vs ελληνικά καταστήματα... Αν
  είναι ίδιο προϊόν, δείξε και τις δύο τιμές με ξεκάθαρα trade-offs». Αυτό το item είναι το **άλλο μισό** αυτού
  του workflow: το ήδη-shipped multi-store price tracking συγκρίνει το ΙΔΙΟ προϊόν σε πολλά καταστήματα, αλλά
  καμία λειτουργία δεν συγκρίνει **δύο διαφορετικά** υποψήφια items (specs/τιμή/κατάστημα) δίπλα-δίπλα — σήμερα
  χρειάζεται να ανοίξεις κάθε detail modal ξεχωριστά και να θυμάσαι νοερά τη διαφορά.
- **Module:** `app/shopping/ShoppingClient.tsx` (ή κοινό με `ItemsClient`) — select 2-3 items σε status
  `researching`/`decided` (reuse του ήδη-shipped select-mode, CLAUDE.md) → «Compare» button → νέο read-only
  modal με στήλες ανά item (photo/title/price/specs/store/tags) side-by-side, καμία αλλαγή schema.
- **Ανοιχτή απόφαση (builder default):** MVP = καθαρά client-side (τα ήδη-φορτωμένα items στη σελίδα, μηδέν νέο
  server round-trip), cap 3 items ταυτόχρονα (αποφυγή unreadable πλατιού πίνακα)· specs diff highlighting
  (διαφορετικές γραμμές tokens) follow-up μόνο αν το plain side-by-side αποδειχτεί ανεπαρκές.

### P89. Household activity feed για self-host (OSS mirror του ήδη-shipped SaaS audit log) — S/M — OSS, εξαρτάται από P75
- **Αξία:** live-verified `grep -rln "AuditEvent" apps/web/src/app` — μόνο 4 SaaS routes το διαβάζουν
  (`(saas)/account/workspace/activity`, `admin/tenants/[slug]`, `admin/audit`, audit export API)· το self-host
  `models/AuditEvent.ts` είναι explicitly `tenant`-indexed και ποτέ δεν εμφανίζεται εκτός SaaS admin console. Το
  ήδη-shipped **P31** (household multi-user, τρεις ρόλοι: owner/editor/viewer) δεν έχει καμία ορατότητα «ποιος
  έκανε τι» στο ίδιο το self-host UI σήμερα — φυσικό follow-up πάνω στο ήδη-**Proposed P75** (`createdBy`
  attribution στα records, ακόμα unbuilt), το οποίο θα δώσει ακριβώς το δεδομένο που χρειάζεται αυτό το feed.
  **Εξάρτηση, όχι διπλότυπο**: το P75 προσθέτει το πεδίο, αυτό το item το κάνει ορατό ως μια απλή λίστα.
- **Module:** νέα read-only σελίδα/tab (π.χ. `/settings` → «Activity»). ΣΗΜ (verified): το ήδη-υπάρχον
  `app/history/` route είναι το AI command-bar conversation log (`models/Conversation.ts`) — **άσχετο, όχι
  reusable** για αυτό το item, χρειάζεται νέο route/tab. Δείχνει τις τελευταίες N ενέργειες (create/verify/
  delete) ανά household member, reuse του ίδιου server-action query idiom με τα SaaS admin routes.
- **Ανοιχτή απόφαση (builder default):** MVP = μόνο **μετά** το P75 (καμία αξία χωρίς attribution data)· scope
  = μόνο households με ≥2 ενεργά μέλη (single-user instance = καμία αλλαγή, μηδέν επιπλέον UI clutter)· capped
  στα τελευταία ~100 events, χωρίς νέο dedicated model (αν βολεύει, reuse του ήδη-υπάρχοντος Notification-style
  pattern αντί για full `AuditEvent`, ώστε να μη χρειαστεί tenant-aware SaaS infra σε OSS-only deployment).

### P88. In-app changelog / «τι άλλαξε» panel για το update-available banner — S — OSS (adoption/trust lever)
- **Αξία:** live-verified `grep -rn "changelog|CHANGELOG|whatsNew|release notes" apps/web/src` = μόνο το ίδιο το
  UI string («Update available: v{version} — see the release notes», `UpdateChecker.tsx`) που είναι ένα **έξω
  link** στα GitHub releases. Το ήδη-shipped **P40** λέει ότι υπάρχει νεότερη έκδοση αλλά ο self-hoster πρέπει
  να φύγει από την εφαρμογή για να μάθει τι άλλαξε πριν αποφασίσει να κάνει `docker pull`. Μικρό αλλά καθαρό
  trust/adoption lever, ίδιο idiom με το ήδη-δουλεμένο `UpdateChecker.tsx` component.
- **Module:** `app/settings/updateCheckActions.ts` (fetch το CHANGELOG.md ή τα GitHub release notes body μαζί
  με το `fetchLatestVersion`, cache ίδιο 24ωρο interval) + `UpdateChecker.tsx` (expandable «What's new» κάτω από
  το already-shipped banner, plain markdown/text render).
- **Ανοιχτή απόφαση (builder default):** MVP = δείξε το raw GitHub release body (ήδη public API, μηδέν νέο auth)
  σε ένα απλό collapsed/expand block· αν το repo δεν έχει δομημένα release notes, fallback στο ήδη-υπάρχον
  external link (καμία αλλαγή συμπεριφοράς, ίδιο idiom με τα υπόλοιπα best-effort optional features).

### P87. Saved filter presets / «smart views» σε modules με sidebar filtering — S/M — OSS (κυρίως), dogfooding-heavy
- **Αξία:** live-verified `grep -rln "savedFilter|SmartView|savedView" apps/web/src` = 0 hits. Το e-shop-layout
  rollout (CLAUDE.md, πολλά sessions) έδωσε ίδιο πλούσιο sidebar filter idiom (search + status + category/store +
  sort, `SearchableSelect` σε 7+ αρχεία) σε Items/Shopping/Receipts/Expenses/Subscriptions/Vouchers, αλλά καμία
  εγγραφή τα θυμάται — κάθε φορά που ανοίγεις τη σελίδα ξαναφτιάχνεις τον ίδιο συνδυασμό. Δεδομένου του μεγέθους
  της λίστας εξοπλισμού του χρήστη (CLAUDE.md: 10G upgrade list, Battle Station, δύο σπίτια), ένα named preset
  («Items: shopping + category=networking + sort=price») γλιτώνει επαναλαμβανόμενο clicking σε καθημερινή χρήση.
- **Module:** νέο localStorage-only πεδίο ανά module (π.χ. `pharosSavedViews.items`), μηδέν DB schema· μικρό dropdown
  «Views ▾» δίπλα στο reset-filters κουμπί σε κάθε client component που ήδη έχει filter sidebar.
- **Ανοιχτή απόφαση (builder default):** MVP = **local-only** (localStorage, ανά browser/device, όχι server-side
  DB record) ώστε το πρώτο slice να μείνει S χωρίς νέο model· server-side sync (πολλαπλές συσκευές/household
  members) follow-up μόνο αν αποδειχτεί χρήσιμο. Κενό = καμία αλλαγή (ίδιο idiom με τα υπόλοιπα S items).

### P86. Notification quiet hours / do-not-disturb window για το alert cron — S — OSS (κυρίως), βοηθά και SaaS
- **Αξία:** live-verified `grep -n "quietHours|doNotDisturb|silenceUntil" models/AppConfig.ts` = 0 hits. Το ήδη-
  shipped τρίπτυχο **P81** (auto cron trigger) + **P82** (dedup) + **P80** (retry + delivery log, shipped σήμερα)
  έκανε το alert engine πλήρως αυτόματο και αξιόπιστο, αλλά κανένα από τα τρία έθεσε ώρα ησυχίας — το cron μπορεί
  να πυροδοτήσει push/ntfy/Discord/Telegram/webhook σε **οποιαδήποτε** ώρα (π.χ. deal-alert στις 3π.μ., ίδια ζώνη
  με το ήδη-υπάρχον nightly backup 03:30, CLAUDE.md). Πριν το P81 αυτό δεν υπήρχε καν ως πρόβλημα (χειροκίνητο
  κουμπί μόνο, ο χρήστης το πάταγε όποτε ήθελε) — καθαρό side-effect του «αυτοματοποίησέ το», ίδιο idiom με το
  P82 (που εντόπισε ανάλογο νέο πρόβλημα από το ίδιο P81).
- **Module:** `models/AppConfig.ts` (νέο `quietHours: {start, end}` προαιρετικό πεδίο) + `app/api/cron/alerts/route.ts`
  / `runAlertChecks` (skip dispatch αν η τρέχουσα ώρα server είναι μέσα στο παράθυρο, log-only όχι πλήρες skip
  ώστε το επόμενο non-quiet run να μη χάσει τη notification λόγω dedupe) + Settings → Notifications UI (2 time
  inputs, προαιρετικά).
- **Ανοιχτή απόφαση (builder default):** MVP = **ένα** παράθυρο ησυχίας ανά ημέρα (όχι per-weekday granularity),
  server-local time (όχι per-channel timezone, self-host = ένα timezone συνήθως)· κενό/ρυθμισμένο = καμία αλλαγή
  συμπεριφοράς (ίδιο idiom με τα υπόλοιπα optional AppConfig πεδία).

### P85. Duplicate subscription detection & merge (mirror P46/P22 pattern) — S — OSS (κυρίως), dogfooding-heavy
- **Αξία:** live-verified `grep -n "export async function findDuplicate" apps/web/src` δείχνει ακριβώς 4 ήδη-
  shipped dedup μηχανισμούς (`findDuplicateReceipts`, `findDuplicateExpenses`, `findDuplicateItems`,
  `findDuplicateStores`) — **Subscriptions δεν έχει κανέναν**. Ένα κλασικό ατύχημα (ξανα-εγγραφή μετά από cancel+
  re-signup με ελαφρώς διαφορετικό όνομα, ή δύο μέλη νοικοκυριού που καταχώρησαν ξεχωριστά το ίδιο family-plan
  μετά το P31/household multi-user) μένει σήμερα αόρατο — κανένα σήμα εκτός από να το προσέξει κανείς χειροκίνητα
  στη λίστα. Καθαρό ζευγάρωμα ήδη-δουλεμένου pattern (ίδιο modal/merge idiom με το P46), μηδέν νέα αρχιτεκτονική.
- **Module:** `app/subscriptions/actions.ts` (νέο `findDuplicateSubscriptions`/`mergeSubscriptions`, ίδιο σχήμα με
  `expenses/actions.ts findDuplicateExpenses`) + νέο `SubscriptionDuplicatesModal.tsx` (mirror `ExpenseDuplicatesModal`/
  `ItemDuplicatesModal`) + «find duplicates» κουμπί στο `SubscriptionsClient.tsx` header.
- **Ανοιχτή απόφαση (builder default):** group-key = normalized name (ίδιο `vendorKey`/normalize idiom με stores/
  expenses) + amount + billingCycle (ώστε δύο πραγματικά διαφορετικά πλάνα του ίδιου provider να ΜΗΝ merge-αριστούν
  κατά λάθος)· merge = keep-most-complete + union οποιωνδήποτε linked references, ίδιο idiom με τα υπόλοιπα 4.

### P83. Goal auto-contribution από αδιάθετο υπόλοιπο budget (P25 rollover → P12 goal) — ✅ SHIPPED (MVP, manual sweep) 2026-08-29 (pharos-brain)
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

---

## Approved

> Οι builder/daily-dev routines χτίζουν ΜΟΝΟ από εδώ — **ένα item ανά run**, verify-pre-build πρώτα,
> με τη σειρά value/effort (τα «πολύ ψηλό value/effort» πρώτα). **Κανόνας ανοιχτών αποφάσεων:** όπου
> ένα item έχει «Απόφαση που χρειάζεται» και ο Αχιλλέας ΔΕΝ την έλυσε ρητά (μόνο τα PA1/PA2/PA3 έχουν
> locked defaults), ο builder παίρνει **sensible default**: (α) free-tier behaviour **non-metered**,
> heavy/AI/SaaS-touching κομμάτια **opt-in**· (β) reuse υπάρχοντος pipeline/pattern· (γ) ξεκίνα από το
> πιο απλό MVP (heuristic/deterministic πριν AI, single πριν multi). Κατέγραψε την επιλογή στο progress log.
> Εξαρτήσεις: P6 feed βοηθά το PA3/P20.
> **Νεοεγκεκριμένα 2026-07-10 (interactive):** P33, P32, P34, P35, P36 (ranked value/effort· P36 τελευταίο, L).

> **Νεοεγκεκριμένα 2026-08-03 (interactive, «approve all ως έχουν, προχώρα τα»):** P81, P66, P74, P48, P46, P40 — όλα S, με τη σειρά που παρατίθενται. Ο Αχιλλέας ενέκρινε ρητά τα builder defaults του κάθε item ως έχουν, οπότε **καμία «ανοιχτή απόφαση» δεν μένει ανοιχτή σε αυτά τα έξι**: ο builder υλοποιεί ό,τι γράφει το «Ανοιχτή απόφαση (builder default)» πεδίο τους αυτούσιο, χωρίς να ξαναρωτήσει.

> **Νεοεγκεκριμένα 2026-08-28 (interactive, ζητήθηκε ρητά από τον Αχιλλέα):**
> - **P103. Επιλογή τύπου notifications (ανά κατηγορία alert)** — ✅ SHIPPED 2026-08-30 (`d1fe7b5`, pharos-brain) — S/M — both. Σήμερα το
>   `runAlertChecks` στέλνει **ένα ενιαίο periodic summary** στο ntfy του χρήστη (`appconfigs.ntfyUrl`,
>   Settings → Notifiers) με **όλες** τις γραμμές alert μαζί (budget over, return window closing,
>   warranty expiring, low stock, recurring due κ.λπ.). Ο Αχιλλέας θέλει να **επιλέγει ΤΙ στέλνεται**:
>   στο Settings → Notifiers, per-type toggles ώστε να ενεργοποιεί/απενεργοποιεί κάθε είδος alert
>   ξεχωριστά. **Ανοιχτή απόφαση (builder default):** boolean toggle ανά τύπο alert αποθηκευμένο στο
>   `appconfigs` (π.χ. `notifyTypes: { budgetOver: true, returnWindow: true, ... }`), **default όλα ON**
>   (μη-breaking — η σημερινή συμπεριφορά μένει ίδια για υπάρχοντες χρήστες), το `runAlertChecks`
>   φιλτράρει τις γραμμές με βάση το enabled set **πριν** στείλει, και αν δεν μείνει καμία γραμμή δεν
>   στέλνει καθόλου. Μηδέν AI, reuse του υπάρχοντος notifier pipeline. Το UI = μια λίστα από checkboxes
>   στο υπάρχον Notifiers panel. (Ζητήθηκε αφότου μπερδεύτηκε «ti akrivws stelnei» το ntfy — να το
>   κάνει διαφανές και επιλέξιμο.)

> **Νεοεγκεκριμένα 2026-08-07 (interactive, «το ABC μπορεί να γίνει approve»):** ο Αχιλλέας πέρασε
> τρεις ολόκληρες θεματικές ομάδες από το review των 43 ανοιχτών items. **22 items, όλα εγκεκριμένα
> ως έχουν** (ισχύει ο ίδιος κανόνας builder-defaults με τις 2026-08-03: καμία ανοιχτή απόφαση δεν
> μένει ανοιχτή, ο builder υλοποιεί το «Ανοιχτή απόφαση (builder default)» πεδίο αυτούσιο):
>
> - **Ομάδα A, χρήματα και ακρίβεια στα νούμερα (7):** P61, P62, P64, P69, P84, P83, P73
> - **Ομάδα B, συνδρομές και δεσμεύσεις (5):** P45, P57, P85, P37, P38
> - **Ομάδα C, αντικείμενα και εξοπλισμός (10):** P39, P41, P44, P47, P55, P56, P70, P72, P90, P92
>
> Σειρά χτισίματος: **A πρώτα** (αγγίζει νούμερα που ο χρήστης ήδη διαβάζει ως αληθινά), μετά **C**
> (dogfooding, ο ίδιος τα χρησιμοποιεί καθημερινά), μετά **B**. Μέσα σε κάθε ομάδα, τα S πριν τα S/M
> πριν τα M.
>
> **ΣΗΜ, υγιεινή αυτού του αρχείου (δεν είναι μέρος της έγκρισης).** Δύο πράγματα έχουν παρασύρει:
> (α) **44 επικεφαλίδες μέσα στο «Proposed» είναι ήδη SHIPPED** και απλώς δεν μετακινήθηκαν ποτέ,
> γι' αυτό ένα αφελές `grep -c` μετράει 90 ανοιχτά ενώ τα πραγματικά είναι 43· (β) τα **περισσότερα
> ανοιχτά items κάθονται φυσικά ΜΕΣΑ στο section «Approved»** παρότι δεν ήταν εγκεκριμένα, οπότε η
> **φυσική θέση δεν σημαίνει τίποτα** σε αυτό το αρχείο. Αυθεντική πηγή είναι **αυτές οι γραμμές
> «Νεοεγκεκριμένα» με τα ID**, όπως ήταν και στις 2026-07-10 και 2026-08-03. Το ξεμπέρδεμα θέλει δικό
> του πέρασμα από τη routine που κατέχει το αρχείο, δεν το κάνω εδώ γιατί είναι 2.200 γραμμές που
> γράφει και άλλος.

> **Νεοεγκεκριμένα 2026-08-07, δεύτερη παρτίδα (interactive, ίδια συνεδρία):** τρία items που
> ΑΠΟΦΑΣΙΣΤΗΚΑΝ ρητά αλλά ΔΕΝ χτίστηκαν. Μπαίνουν εδώ ώστε να τα πιάσει routine, όχι στο Proposed,
> γιατί δεν χρειάζονται έγκριση, την έχουν ήδη.
>
> - **P94. Storage add-on** — S/M — SaaS. **ΤΙΜΟΛΟΓΗΣΗ ΚΛΕΙΔΩΜΕΝΗ** (απάντηση Αχιλλέα, 2026-08-07):
>   το add-on δίνει **+100% του storage του τρέχοντος πλάνου** και κοστίζει **70% της τιμής του
>   ΙΔΙΟΥ πλάνου**. Δηλαδή Pro €9 → +1GB για **€6,30**/μήνα (σύνολο 2GB), Dedicated €29 → +5GB για
>   **€20,30**/μήνα (σύνολο 10GB). Επιλέχθηκε αντί για «70% της διαφοράς ως το επόμενο πλάνο»
>   επειδή εκείνο έβγαζε €14 για +1GB ενώ με €20 πας ολόκληρος σε Dedicated, άρα δεν θα το
>   αγόραζε κανείς, και επειδή το Dedicated δεν έχει επόμενο πλάνο για να μετρηθεί.
>   **BLOCKED σε ενέργεια Αχιλλέα**: χρειάζονται δύο Stripe prices και τα ids τους. Ο builder ΔΕΝ
>   μπορεί να τα φτιάξει, είναι λογαριασμός πληρωμών. Μόλις υπάρχουν: νέα env `STRIPE_PRICE_*`,
>   πεδίο add-on στο Tenant, το `entitlementsFor` να προσθέτει το επιπλέον storage, και ένδειξη
>   στο billing panel.
> - **P95. Custom AI add-on (BYO key) ως αγοράσιμο** — S — SaaS. Το BYO key **υπάρχει ήδη** ως
>   λειτουργία (`AiKeyPanel` στο workspace settings, `byoKeyStore`), αλλά ΔΕΝ είναι πακεταρισμένο
>   ως add-on. Απόφαση 2026-08-07: το Dedicated έχει πλέον οροφή 1000 AI calls και **όταν την
>   εξαντλήσει τα AI features ΜΠΛΟΚΑΡΟΥΝ** μέχρι τον επόμενο κύκλο, με μήνυμα που προτρέπει σε
>   δικό του κλειδί (απορρίφθηκαν ρητά το overage-per-call και η σιωπηλή υποβάθμιση σε φθηνότερο
>   μοντέλο). Άρα χρειάζεται: το μήνυμα ορίου να δείχνει στο BYO panel, και το BYO να παρουσιάζεται
>   ως «απεριόριστο, πληρώνεις τον πάροχο απευθείας».
> - **P96. Admin center** — L συνολικά, σπασμένο σε 14 items — SaaS. **Η πρόταση έγινε και
>   ΕΓΚΡΙΘΗΚΕ ΟΛΟΚΛΗΡΗ** (Αχιλλέας, 2026-08-07, «approve all»). Αναλυτικά παρακάτω ως P96.A1
>   έως P96.E2.
>
>   **ΔΙΟΡΘΩΣΗ προηγούμενης διατύπωσης:** είχα γράψει ότι το audit «δεν καταγράφει πρόσβαση στο
>   /admin». Ανακριβές. Οι **αλλαγές** γράφονται κανονικά (ο operator PATCH αφήνει γραμμή). Αυτό
>   που λείπει είναι οι **συνδέσεις** και οι **αναγνώσεις**.
>
>   **ΣΕΙΡΑ ΧΤΙΣΙΜΑΤΟΣ, δεσμευτική.** Το «approve all» εγκρίνει το ΤΙ, όχι ελεύθερη σειρά:
>   **A1 → A2 → A3** πρώτα, μετά **B1** και **C1** (η μεγαλύτερη αξία ανά κόπο), μετά τα υπόλοιπα.
>   **Το B3 ΔΕΝ χτίζεται πριν ολοκληρωθεί η ομάδα A**, βλ. παρακάτω.
>
>   **A · Λογοδοσία (προϋπόθεση των υπολοίπων)**
>   - **A1** — S — Καταγραφή συνδέσεων, επιτυχημένων και αποτυχημένων. Σήμερα μηδέν. Απαντά το
>     «μπήκε κάποιος άλλος στον λογαριασμό μου;» και δίνει το υλικό για ειδοποίηση ύποπτης σύνδεσης.
>   - **A2** — S — Καταγραφή των ΑΝΑΓΝΩΣΕΩΝ του operator. Κάθε άνοιγμα καρτέλας workspace αφήνει
>     γραμμή. Οι αναγνώσεις είναι που αγγίζουν δεδομένα πελάτη.
>   - **A3** — S/M — Ενιαία ροή audit για όλο τον στόλο, με φίλτρα (ποιος, τι, ποιο workspace, πότε).
>
>   **B · Υποστήριξη πελάτη**
>   - **B1** — S/M — Καρτέλα κατάστασης workspace **χωρίς πρόσβαση σε περιεχόμενο**: τελευταία
>     σύνδεση, τελευταία AI κλήση, χρήση αποθήκευσης, πλήθος εγγραφών ανά τύπο, αποτυχημένα jobs.
>     Απαντά το ~80% των ερωτημάτων υποστήριξης χωρίς να δει κανείς περιεχόμενο.
>   - **B2** — S — Επαναποστολή επιβεβαίωσης email και επαναφοράς κωδικού. Το SMTP είναι ήδη
>     ρυθμισμένο στην παραγωγή (smtp.gmail.com), άρα κουμπί πάνω σε υπάρχοντα δρόμο.
>   - **B3** — M — Προσωρινή πρόσβαση υποστήριξης σε ΠΕΡΙΕΧΟΜΕΝΟ. **ΕΓΚΡΙΘΗΚΕ ΜΑΖΙ ΜΕ ΤΟΥΣ
>     ΠΕΡΙΟΡΙΣΜΟΥΣ ΤΟΥ, ΠΟΥ ΕΙΝΑΙ ΜΕΡΟΣ ΤΗΣ ΠΡΟΔΙΑΓΡΑΦΗΣ ΚΑΙ ΔΕΝ ΑΦΑΙΡΟΥΝΤΑΙ:** μόνο κατόπιν
>     αιτήματος του ιδιοκτήτη, μόνο read-only, με **αυτόματη λήξη**, με γραμμή audit στην αρχή ΚΑΙ
>     στο τέλος, και **ορατή στον ίδιο τον πελάτη** στη δική του ροή δραστηριότητας. Αν κάποιο από
>     αυτά δεν μπορεί να υλοποιηθεί, το item σταματά και ρωτάει, δεν παραδίδεται μισό.
>
>   **C · Έλεγχος ορίων**
>   - **C1** — S/M — Παράκαμψη ορίων ανά workspace (+GB, +AI calls, +seats) με ημερομηνία λήξης και
>     σημείωση αιτίας. **Είναι ο μηχανισμός που χρειάζεται το P94** (storage add-on): χτίσ' το πριν
>     ή μαζί.
>   - **C2** — S — Διακόπτες λειτουργιών ανά workspace. Το AI έχει ήδη per-feature διακόπτες μέσα
>     στο workspace, ο operator δεν τους φτάνει.
>   - **C3** — S — Παράταση δοκιμής και κερασμένος μήνας. Το status αλλάζει ήδη χειροκίνητα, οι
>     ημερομηνίες όχι.
>
>   **D · Λειτουργική ορατότητα**
>   - **D1** — S — Υγεία στόλου συγκεντρωτικά. **Μισό είναι ήδη χτισμένο**: ο έλεγχος υγείας ανά
>     εγκατάσταση μπήκε στα settings (`027416b`), λείπει η συγκέντρωση, μία γραμμή ανά workspace.
>   - **D2** — S/M — Αποτυχημένες εξερχόμενες ενέργειες (email, webhook, ειδοποίηση). Σήμερα
>     εξαφανίζονται σιωπηλά, όπως ακριβώς εξαφανιζόταν ο σύνδεσμος επιβεβαίωσης που έδειχνε σε
>     ανύπαρκτη σελίδα.
>   - **D3** — S — Κατάσταση αντιγράφων ανά workspace (τελευταίο, offsite ναι/όχι, κουμπί άμεσου).
>
>   **E · Επικοινωνία**
>   - **E1** — S — Μπάνερ ανακοίνωσης σε όλο τον στόλο, **με ημερομηνία λήξης** ώστε να μη μείνει
>     ξεχασμένο.
>   - **E2** — S — Email στον ιδιοκτήτη workspace από το admin, με πρότυπα και καταγραφή.
>     Εξαρτάται από το **A3**.

> **Νεοεγκεκριμένο 2026-08-04 (interactive, «review the approved queue and start building P82»):** P82, ίδια συνεδρία, χτίστηκε αμέσως.

> **⛔ Mobile discontinued 2026-08-04** (interactive, βλ. `OWNER_DECISIONS.md` #15): το mobile app
> καταργήθηκε πλήρως, `apps/mobile` διαγράφηκε. **P59/P51/P23 μετακινήθηκαν σε `## Rejected`**. Κάθε
> «mobile parity» follow-up σημείωση που εμφανίζεται μέσα σε ήδη-shipped ιστορικά items παρακάτω
> (π.χ. «`/api/v1` δεν εκθέτει ακόμα X for mobile parity») είναι πλέον **void/n/a** — δεν χρειάζεται
> πλέον καμία mobile-parity δουλειά, ΟΥΤΕ ξαναγράφτηκε κάθε τέτοια μεμονωμένη σημείωση (θα ήταν πάνω
> από 15 σκόρπιες αλλαγές σε ήδη-shipped ιστορικό)· αυτό το ένα σημείωμα εδώ τις καλύπτει όλες.

### P82. Outbound alert dedup — ✅ SHIPPED 2026-08-04 (interactive session, commit `2e293ca` + follow-up)
- **Τι έγινε:** νέο pure `lib/alertDedup.ts` (`splitFreshAlerts`) + `runAlertChecks(opts?: { dedupe?: boolean })`
  στο `app/settings/actions.ts`. Κάθε μία από τις 8 κατηγορίες (deals/warranty/returns/price-hikes/trials/
  gift-cards/bills/budgets) + installments + sync-staleness παίρνει ένα dedupeKey ίδιου σχήματος με το bell
  (`deal:<id>`, `warranty:<id>`, `bill:<id>:<iso>`, νέα `return:<id>`/`budget:<cat>:<month>`/`syncstale:<lastSyncAt>`)
  και φιλτράρεται έναντι του `AppConfig.alertDispatchKeys` (νέο πεδίο) πριν χτιστεί το outbound summary. Η βάση
  ενημερώνεται **μόνο** όταν το `dispatchAlert` όντως παραδώσει σε ≥1 κανάλι (`sent:true`) — ένα misconfigured
  notifier δεν «καταπίνει» ποτέ ένα alert σιωπηλά. Νέο μήνυμα «No new alerts (already reported)» ξεχωριστό από
  το γνήσιο «All clear» όταν υπάρχουν live alerts αλλά όλα ήδη αναφέρθηκαν. Το `app/api/cron/alerts/route.ts`
  καλεί πλέον `runAlertChecks({ dedupe: true })`· το χειροκίνητο «Check & notify now» μένει `dedupe: false`
  (default) — **byte-identical** συμπεριφορά, μηδέν νέο AppConfig read/write, verified έναντι του
  προϋπάρχοντος 53-test pinned suite αμετάβλητο. Το bell (`generateNotifications`) και τα P24 event webhooks
  ΔΕΝ επηρεάζονται (διαφορετικό audience, ίδια σχεδιαστική απόφαση με το item description).
- **Πλευρικό εύρημα**: η νέα `AppConfig.updateOne` έκανε το `runAlertChecks` το πρώτο πραγματικό Mongoose write
  του — το P31 write-guard coverage test το έπιασε σωστά· fix = `assertCanWrite()` στην κορυφή (no-op σε cron
  χωρίς session, μπλοκάρει μόνο logged-in viewer).
- **Collision με ταυτόχρονη δουλειά**: το P48 (sync-staleness) χτιζόταν στο **ίδιο ακριβώς** `runAlertChecks`
  παράλληλα σε άλλο routine· τα δύο diffs interleaved καθαρά (verified: type-check + πλήρες test suite green
  και μετά τα δύο commits). Η interactive session τερματίστηκε πριν προλάβει να κάνει commit το δικό της κομμάτι
  (config timeout)· ένα άλλο routine το βρήκε ορφανό στο working tree ~6 ώρες μετά και το commit-άρισε ρητά ως
  «Not my change» (`2e293ca`) αντί να το χάσει ή να το απορροφήσει σιωπηλά σε άσχετο commit — το `app/api/cron/
  alerts/route.ts`+`route.test.ts` (η κλήση `{dedupe:true}`) έμεινε πίσω σε αυτό το commit, ολοκληρώθηκε
  ξεχωριστά στο follow-up. Tests: 9 νέα σε `actions.alertChecksDedupe.test.ts` + 1 στο cron route test.

> **Νεοεγκεκριμένα 2026-08-03 (interactive, «Approve all»):** P80, P79, P78, P77, P76, P75, P73, P72, P71, P70, P69, P68, P67, P65, P64, P62, P61, P60, P59, P58, P57, P56, P55, P54, P53, P52, P51, P50, P49, P47, P45, P44, P43, P42, P41, P39, P37, P38 — ολόκληρη η υπόλοιπη ουρά του Proposed section, 38 items, «approve all» χωρίς εξαίρεση. Για τα 32 από αυτά ο Αχιλλέας δεν χρειάστηκε να πει τίποτα άλλο, το builder default του κάθε item ισχύει αυτούσιο. **Έξι items είχαν ξεχωριστές ανοιχτές ερωτήσεις στη σάρωση πριν το «approve all» — απαντήθηκαν με το δικό τους δηλωμένο fallback, ΟΧΙ με ρητή απάντηση του Αχιλλέα, μπορεί να χρειαστούν διόρθωση αν ο builder φτάσει σε αυτά πρώτα:**
> - **P37** — reuse το Subscription model (όχι νέο dedicated Contract model), το ίδιο το item το δηλώνει ως fallback αν δεν λυθεί ρητά.
> - **P43** (public wishlist link) — εγκρίθηκε ως έχει (token-scoped, ίδιο μοτίβο με το ήδη-shipped calendar `.ics` feed)· ο Αχιλλέας δεν επιβεβαίωσε ρητά ότι θέλει δημόσιο route, απλά δεν το εξαίρεσε.
> - **P59** (mobile widget) — εγκρίθηκε, αλλά ο builder θα πρέπει να το σειριοποιήσει ΜΕΤΑ το P23 (share-sheet, ήδη blocked σε EAS dev build + φυσική συσκευή) ώστε να μη στοιβάζεται άλλο άτεστο mobile-native κομμάτι.
> - **P65** (voice quick-capture) — χαμηλής αξίας κατά την αξιολόγηση, εγκρίθηκε ούτως ή άλλως, χτίσου το τελευταίο στη σειρά value/effort.
> - **P73** (subscription cost-split) / **P76** (emergency access) — και τα δύο χρειάζονται ουσιαστικά δεύτερο ενεργό χρήστη (P31) για να έχουν πρακτική αξία· ο Αχιλλέας δεν επιβεβαίωσε ρητά ότι τα χρησιμοποιεί, χτίσου τα με χαμηλή προτεραιότητα.

### P80. Outbound webhook delivery reliability (retry + failure log) — ✅ SHIPPED 2026-08-05 (pharos-daily-dev)
- **Τι έγινε:** νέο pure `lib/deliveryRetry.ts` (`DeliveryOutcome`/`isRetryable`/`deliverWithRetry` με injectable
  sleep + `parseRetryDelays`) και νέο `lib/deliveryLog.ts` (+ client-safe `deliveryLog.shared.ts`) που κρατά τις
  τελευταίες **20 απόπειρες ανά κανάλι** στο νέο `AppConfig.deliveryLog` (map `notifier:<id>`/`webhook:<id>`,
  capped και σε γραμμές και σε κλειδιά, 50 max). Και οι **δύο** outbound επιφάνειες περνούν από κει: το
  `dispatchAlert` (ntfy/Discord/Slack/Telegram/webhook) και το `dispatchEventWebhooks` (P24 signed events) —
  κάθε κανάλι με δικό του retry, όλα παράλληλα, και **ένα** read+write για ολόκληρο το fan-out.
- **Πολιτική retry:** 2 retries (3 απόπειρες) μόνο για ό,τι μπορεί να διορθωθεί — network error/timeout, 5xx,
  429, 408. Κάθε άλλο 4xx (λάθος URL, ανακληθέν webhook, λάθος token), missing config, SSRF-blocked target και
  local rate limit είναι `permanent` → μηδέν retry, μηδέν χαμένος χρόνος. Τα δύο «Test» κουμπιά μένουν
  **single-attempt** επίτηδες (interactive, θέλουν άμεση απάντηση).
- **Απόκλιση από το spec (καταγεγραμμένη):** backoff **1s/5s** αντί του παραδείγματος 5s/30s — το dispatch
  γίνεται awaited μέσα σε server action («Check & notify now») και στο `/api/cron/alerts`, οπότε 30s backoff θα
  έτρωγε το request budget αντί να βοηθήσει. Env-overridable με `NOTIFY_RETRY_DELAYS_MS` (κενό = retries off).
- **UI:** νέο `DeliveryHistory` κάτω από κάθε `ChannelCard` **και** `WebhookCard` (τελευταίες 3 + «show all N»):
  ώρα, πράσινη/κόκκινη κουκίδα, HTTP status ή λόγος αποτυχίας, `×N` όταν χρειάστηκαν retries, και «last one
  failed» warning. Νέο read-only action `getDeliveryLogs()` (requireAdmin, tenant-scoped).
- **Tests:** 51 νέα (30 `deliveryRetry.test.ts` + 11 `deliveryLog.shared.test.ts` + 10 `notifiers.retry.test.ts`
  που οδηγούν το πραγματικό `dispatchAlert` με mocked DB/fetch). Πλήρες suite **374 files / 5967 passed**.
- **Αρχικό spec (για ιστορικό):** live-verified `lib/webhooks.ts` — το ήδη-shipped P24 (outbound event webhooks) κάνει **fire-and-forget,
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

### P79. TOTP/MFA στο self-host login (reuse του ήδη-shipped SaaS primitive) — ✅ SHIPPED 2026-08-05 (interactive session, «review the approved queue and pick the next item to build»)
- **Τι έγινε:** το `User` model (`models/User.ts`) απέκτησε τα ίδια 4 πεδία με το SaaS `Account`
  (`mfaEnabled`/`mfaSecretEnc`/`mfaPendingSecretEnc`/`mfaRecoveryHashes`) + νέο **`lib/userMfaStore.ts`** — thin
  DB wrapper πάνω στο `User` που **επαναχρησιμοποιεί ατόφιες τις 4 PURE `plan*`/`mfaEnrollRequiresReauth`
  builders** του ήδη-shipped `lib/tenancy/mfaStore.ts` (μηδέν αντιγραφή λογικής, μόνο νέο μοντέλο-target) και
  τα ίδια crypto primitives (`secretCrypto`/`totp`/`recoveryCodes`) — bug-for-bug parity με το δουλεμένο SaaS
  σχήμα, σκόπιμα, ΟΧΙ ξαναχτισμένο από την αρχή.
  - **Login flow** (`app/login/actions.ts`): `loginAction` μετά από σωστό password, αν `user.mfaEnabled` → ΔΕΝ
    στήνει session, στήνει **pending-MFA cookie** (`pharos_session_mfa_pending`, νέο distinct `typ` claim +
    δικές του sign/verify functions στο edge-safe `lib/session.ts`, cookie plumbing στο node-only `lib/auth.ts`
    — ίδιος διαχωρισμός με το SaaS `accountToken.ts`/`accountSession.ts`) → `{ok:true, mfaRequired:true}`. Νέο
    `verifyMfaLoginAction(code)` (login step 2, διαβάζει το user id ΜΟΝΟ από το signed cookie, ποτέ από τον
    caller) + `cancelMfaLoginAction()` («use a different account»). `LoginForm.tsx` έγινε 2-step (`mfaStep`
    state), reusing το pure `mfaLoginCodeReady` helper του SaaS `components/saas/mfaSettings.ts`.
  - **Rate limit από την πρώτη μέρα (όχι follow-up)**: `verifyMfaLoginAction` καλεί `rateHit`/`rateLimitConfig`
    (ίδιο shared config/store `API_RATE_LIMIT` με το `/api/v1`), keyed **ανά user id** (`self-mfa:<id>`, όχι IP —
    ίδιο σκεπτικό με το SaaS route). Αυτό διορθώνει *εκ των προτέρων* ένα gap που το `WEB_DEBT.md` είχε βρει και
    διορθώσει στο SaaS `POST /api/saas/auth/mfa` (2026-07-24, «MFA δεύτερος παράγοντας brute-forceable χωρίς
    throttling») — verified πριν το build ότι το ίδιο ρίσκο θα αναπαραγόταν αν το self-host login step-2 έμενε
    unrated, οπότε χτίστηκε closed εξαρχής αντί να χρειαστεί ξεχωριστό follow-up item.
  - **Settings**: νέες server actions `getSelfMfaStatus`/`beginSelfMfaEnrollment`/`confirmSelfMfaEnrollment`/
    `disableSelfMfa` (`app/settings/users.actions.ts`, ίδιο idiom με το ήδη-υπάρχον `changeOwnPassword`) + νέο
    **`SelfMfaCard`** στο General tab, δίπλα στο `SelfPasswordCard` — ίδιο state machine (`MfaStage`
    idle/need-password-to-start/enrolling/need-password-to-disable/recovery-codes) και ίδιο one-time-reveal
    idiom για τα recovery codes με το SaaS `AccountSettingsPanel.tsx`, reusing τα pure `mfaCodeReady`/
    `mfaPasswordReady`/`describeMfaError` helpers του από εκεί αντί να ξαναγραφτούν.
  - **i18n**: νέα `set.twoFactor*` (24 κλειδιά) + `login.mfa*` (6 κλειδιά) σε en+el (`lib/i18n/locales/`).
  - **`writeGuard.coverage.test.ts`**: `confirmSelfMfaEnrollment`/`disableSelfMfa` προστέθηκαν στο ALLOWLIST με
    το ΙΔΙΟ σκεπτικό με το ήδη-υπάρχον `changeOwnPassword` («own credentials only» — ένας read-only viewer
    πρέπει να μπορεί να προστατέψει το ΔΙΚΟ του login).
- **Tests**: 87 νέα (21 `lib/userMfaStore.test.ts`, 32 νέα σε `lib/session.test.ts` για το pending-token
  sign/verify, 20 νέα σε `app/login/actions.test.ts` για το login-flow orchestration, incl. rate-limit). Πλήρες
  suite **378 files / 6076 passed**. `npm run type-check` EXIT 0.
- **Verified**: Docker rebuild (`docker compose build web` → `up -d web`), `RestartCount 0`, `/login` 200 σε
  ~180ms, `/settings` 307 (auth-gated, αμετάβλητο). Browser: `/login` renders byte-identical για μη-MFA χρήστες
  (η password-only ροή είναι default/κενή-συμπεριφορά-αμετάβλητη), wrong-password error path δουλεύει κανονικά,
  μηδέν console errors. **ΔΕΝ testable unattended**: το πλήρες enroll→confirm→login-step-2 flow χρειάζεται
  πραγματικά credentials (πίσω από login, όπως και το P80 πριν από αυτό) — χρειάζεται ένα supervised πέρασμα
  από τον Αχιλλέα (Settings → General → «Two-factor authentication» → Enable → scan/enter → confirm → log out →
  log back in με τον κωδικό).
- **Αρχικό spec (για ιστορικό):** live-verified `grep -n "mfa|totp|MFA" apps/web/src/models/User.ts` = 0 hits —
  το self-hosted login (`app/login/LoginForm.tsx` + `app/api/v1/auth/login`) προστατεύεται **μόνο** από
  password, ενώ το **ίδιο ακριβώς primitive υπάρχει ήδη πλήρως δουλεμένο και tested** για το SaaS side:
  `lib/tenancy/totp.ts` + `lib/tenancy/recoveryCodes.ts` + `lib/tenancy/mfaStore.ts` (secret-at-rest encryption,
  `api/saas/auth/mfa`, `api/saas/account/mfa`, με tests). Ένα self-hosted instance εκτεθειμένο μέσω reverse-
  proxy/WireGuard (η προτεινόμενη τοπολογία, CLAUDE.md) έχει σήμερα το ίδιο security posture με «μόνο password».
  **Ανοιχτή απόφαση (builder default) που τηρήθηκε**: **opt-in**, όχι default-on (κενό = σημερινή password-only
  συμπεριφορά αμετάβλητη)· reuse ατόφιο το crypto/secret-storage pattern του SaaS `mfaStore.ts`, μηδέν νέο
  dependency· recovery codes εμφανίζονται ΜΙΑ φορά στο enroll.

### P78. Bulk field-edit για selected Items/Expenses (category/status/tag) — ✅ SHIPPED 2026-08-05 (interactive session, «review the approved queue and pick the next item to build»)
- **Τι έγινε:** νέο `bulkUpdateItems(ids, patch)` (`app/items/actions.ts`) — ένα `Item.updateMany`, `$set`
  category/status (validated κατά του ήδη-υπάρχοντος STATUSES enum, άγνωστη τιμή απλά αγνοείται αντί να απορρίπτει
  όλο το call) + `$addToSet`/`$each` για tags, revalidate `/items`+`/shopping`. Νέο «Edit N» κουμπί στο select-mode
  bar (δίπλα στο ήδη-υπάρχον AI-fill/merge), μικρό Modal με category/status dropdowns (reusing το ήδη-υπάρχον
  `itemCategoryOptions()`/`STATUSES`) + tags input, `common.noChange` όταν δεν αλλάζεις ένα πεδίο.
  - **Expenses διαφοροποιήθηκε από το αρχικό spec**: το `bulkUpdateExpenses(ids, patch, kind)` είναι **category-
    only, ΟΧΙ category+tags** — verified `grep -n "tags" models/Expense.ts` = 0 hits, το `Expense` model δεν έχει
    ΚΑΝ πεδίο tags. Το spec υπέθετε παραλληλισμό με τα Items χωρίς να το επιβεβαιώσει· το builder default εδώ
    ήταν να χτίσει ό,τι πεδίο υπάρχει πραγματικά αντί να προσθέσει νέο schema field για ένα "S" item (θα το
    μεγάλωνε σε αρχιτεκτονική απόφαση). Νέο select-mode **from scratch** στο `ExpensesClient.tsx` (ίδιο
    checkbox/`selectMode`/`selectedIds` idiom με το Items), `kind` πάντα μέσα στο Mongo filter (ίδια άμυνα με το
    `mergeExpenses`· ένα Income-tab bulk edit δεν αγγίζει ποτέ expense rows).
  - i18n: 10 νέα κλειδιά (`it.editN`/`it.bulkEdit*`/`ex.select`/`ex.editN`/`ex.bulkEdit*`/`common.apply`/
    `common.noChange`) σε en+el.
- **⚠ Παράπλευρο εύρημα, διορθώθηκε ξεχωριστά (P0, όχι μέρος του P78 scope)**: το `docker compose build web`
  (verify-πριν-commit) απέτυχε σε ΚΑΘΑΡΟ `HEAD` — **6 από τα 14 `/api/v1` resources** (Bills/Goals/GiftCards/
  LoyaltyCards/Vouchers/Subscriptions) είχαν `export function trim(...)` μέσα σε `route.ts`, κάτι που το Next.js
  route-export validator πλέον απορρίπτει ρητά («"trim" is not a valid Route export field»)· τα υπόλοιπα 8
  resources ήδη ακολουθούσαν το σωστό pattern (`trim` σε ξεχωριστό `serialize.ts`, βλ. Receipt/Expense). Οι 6
  `[id]/route.ts` sibling routes χρειάζονταν πραγματικά αυτό το `trim` (cross-file import), οπότε το σκέτο
  «αφαίρεσε το `export`» έσπαγε αλλού· η σωστή διόρθωση ήταν να μεταφερθεί το `trim`+τα Lean types σε 6 νέα
  `app/api/v1/<resource>/serialize.ts` (ίδιο μοτίβο με το ήδη-σωστό Receipt/Expense), με τα `route.ts` + `[id]/
  route.ts` να το εισάγουν από εκεί. `openapi.schema.test.ts`'s SERIALIZERS table ενημερώθηκε (μόνο το `file`
  path, το `fn` name έμεινε `trim`). Verified: `openapi.schema.test.ts` (16/16) + όλα τα 64 `/api/v1` test files
  (983 tests) περνάνε αμετάβλητα, μηδέν αλλαγή στο actual JSON shape κάθε endpoint. Αυτό ήταν **γνήσιο production-
  build-breaking bug σε committed main**, όχι κάτι από concurrent uncommitted work — reproduced σε καθαρό checkout
  πριν διορθωθεί.
- **Tests**: 24 νέα (14 `items/actions.bulkUpdate.test.ts` + 10 `expenses/actions.bulkUpdate.test.ts`). Πλήρες
  suite **386 files / 6211 passed** (2 pre-existing άσχετα timeouts σε `aiConfig.tenant.test.ts`, αρχείο που δεν
  αγγίχτηκε — real-timer cache-TTL test ευαίσθητο σε system load από concurrent routines, όχι regression).
  `npm run type-check` EXIT 0 (πέρα από 3 pre-existing άσχετα errors σε αρχεία μιας άλλης, ταυτόχρονης, uncommitted
  SaaS routine — verified με `git status` πριν/μετά).
- **Verified**: Docker rebuild (μετά τη σωστή διόρθωση του P0 παραπάνω) → `RestartCount 0`, `/login` 200 σε
  ~180ms, `/items`+`/expenses` 307 (auth-gated, αμετάβλητο). Browser: `/login` renders καθαρά, μηδέν console
  errors. **ΔΕΝ testable unattended**: το ίδιο το bulk-edit UI είναι πίσω από login (ίδιος περιορισμός με κάθε
  Settings-gated feature πριν από αυτό).
- **Αρχικό spec (για ιστορικό):** live-verified: το `ItemsClient.tsx` έχει ήδη select-mode (`selectedIds:
  Set<string>`) αλλά οι ΜΟΝΕΣ δύο bulk ενέργειες πάνω στην επιλογή είναι **AI fill** και **merge** — καμία bulk
  απλή αλλαγή πεδίου. Το `ExpensesClient.tsx` ήταν ακόμα πιο πίσω: μηδέν select-mode καν. **Ανοιχτή απόφαση
  (builder default) που τηρήθηκε**: MVP = category + tag-add (Items)· status bulk-change μόνο για Items· καμία
  αλλαγή σε μεμονωμένα-required πεδία (τίτλος/ποσό) μέσω bulk.
- **Ανοιχτή απόφαση (builder default):** MVP = category + tag-add (πιο συχνή διόρθωση μετά από import/scan)· status
  bulk-change μόνο για Items (Expenses δεν έχει status field)· **καμία** αλλαγή σε μεμονωμένα-required πεδία
  (τίτλος/ποσό) μέσω bulk — αυτά παραμένουν 1-προς-1 edit (αποφυγή κατά λάθος μαζικής αλλοίωσης).

### P77. Ενιαίο self-host system-health / diagnostics dashboard — ✅ SHIPPED 2026-08-07 (pharos-daily-dev)
- **Τι έγινε:** νέο **Settings → «System status»** tab (admin-only, self-host-only· κρυφό στο managed SaaS και το
  ίδιο το action αρνείται εκεί, γιατί latency/ελεύθερος χώρος/ουρά job είναι νούμερα του **host**, όχι ενός tenant).
  Πέντε πλακίδια σε ένα read-only grid, με το ήδη-υπάρχον «AI online» idiom (πράσινο/κίτρινο/κόκκινο/γκρι):
  **Database** (ping + μέγεθος/έγγραφα/συλλογές), **Storage volume** (μέγεθος αρχείων + ελεύθερος χώρος μέσω
  `statfs`), **AI provider** (reuse `isAiReady`, πάροχος+μοντέλο), **Background jobs** (running / κολλημένα >30′ /
  αποτυχίες 24ώρου), **Remote mirror** (backend, auto-mirror, τελευταία επιτυχής συγχρόνιση + staleness).
- **Διαχωρισμός γρήγορου/αργού:** το άνοιγμα του tab τρέχει ΜΟΝΟ τους γρήγορους ελέγχους, ώστε ένα NAS που κοιμάται
  να μην κρεμάει τη σελίδα· το live FTP/SMB/OneDrive round trip (έως 15s hard timeout) μπαίνει πίσω από ρητό
  «Test connections». Κάθε έλεγχος έχει δικό του try/catch: ένα νεκρό subsystem βγαίνει ένα κόκκινο πλακίδιο,
  δεν ρίχνει τη σελίδα.
- **Read-only by design:** μηδέν write, μηδέν auto-fix, μηδέν restart — μια σελίδα διαγνωστικών δεν επιτρέπεται να
  είναι αυτή που θα χαλάσει το deployment. Το `unknown` (AI σβηστό, κανένα remote backend) μένει **γκρι**, δεν
  μετράει ως αποτυχία και δεν ρίχνει το συνολικό verdict.
- **Δομή:** pure/DB-free `lib/systemHealth.ts` (κατώφλια + verdicts, unit-tested αντί για θαμμένα σε server action)
  + `settings/healthActions.ts` (το IO μισό, `requireAdmin` + `saasMode` guard) + `settings/SystemHealthPanel.tsx`.
  36 νέα tests (26+10), 51 νέα i18n κλειδιά en+el.
- **Αρχικό spec (για ιστορικό):** live-verified `grep -rln "healthcheck|health-check|diagnostics|/system-health" apps/web/src` = 0 hits
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

### P72. Shipment/delivery tracking για items σε «ordered» status (tracking number + carrier + status) — ✅ SHIPPED 2026-08-30 (pharos-brain) — S — OSS (κυρίως), dogfooding-heavy
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

### P70. Custom user-defined πεδία σε Items (structured key-value metadata) — ✅ SHIPPED 2026-09-03 (`6a1cd1e`, pharos-brain) — S/M — OSS (κυρίως, dogfooding-heavy)
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
- **Τι έγινε**: νέο optional `customFields: [{key, value}]` στο `models/Item.ts` (κενό array = ακριβώς η προ-P70
  εγγραφή), editor με γραμμές στη φόρμα του item και μικρός πίνακας στο detail. Οι κανόνες ζουν στο καθαρό
  `lib/customFields.ts` ώστε να ισχύουν για οποιονδήποτε γράψει το πεδίο αργότερα (importer, API), όχι μόνο για
  τη σημερινή φόρμα: γραμμή χωρίς key πέφτει, **κενή τιμή κρατιέται** (το «δεν το ξέρω ακόμα» είναι πραγματική
  κατάσταση), διπλά keys μαζεύονται στο πρώτο case-insensitively ώστε μια κρυφή δεύτερη γραμμή να μη σκιάζει μια
  ορατή τιμή, και το πολύ μεγάλο input κόβεται αντί να απορρίπτεται.
- **Απόφαση που πάρθηκε μόνη της (καταγραφή)**: το free-text search box ψάχνει πλέον **και** στο όνομα και στην
  τιμή του attribute. Είναι το μισό value proposition με μηδενικό κόστος (μια γραμμή στο υπάρχον predicate)· το
  **structured filter-by-key** μένει follow-up όπως όριζε το builder default, δεν μπήκε.
- **Τα caps δεν είναι αυθαίρετη αυστηρότητα** (50 πεδία, 60/500 χαρακτήρες): το array είναι **embedded** στο item
  document και η σελίδα Items φορτώνει όλα τα owned items ολόκληρα, οπότε απεριόριστη λίστα θα πληρωνόταν σε κάθε
  render της λίστας, όχι μόνο στο detail.

### P69. Year-over-year ίδιου μήνα σύγκριση δαπανών (εποχιακό κόστος) στα Reports — ✅ SHIPPED 2026-08-09 (pharos-daily-dev)

- **Τι έγινε**: νέο pure module `lib/yearOverYear.ts` (`buildYearOverYear` + `shiftYear`, μηδέν DB, 15 tests)
  που τρέφεται από το `totalByMonth` map που το `getReports` ήδη χτίζει πάνω σε ΟΛΕΣ τις εγγραφές Expense
  (όχι μόνο στο rolling window), άρα ο ίδιος μήνας πέρσι είναι ήδη διαθέσιμος: **μηδέν νέο query, μηδέν νέο
  model**. Νέο card «Year over year · same month» στο `ReportsClient` (grouped bars φέτος vs έναν χρόνο πριν
  + headline γραμμή «Jul 26 · €X vs €Y (Jul 25) · ±%», κόκκινο όταν ανέβηκε, πράσινο όταν έπεσε) ακριβώς
  κάτω από το cash-flow card. Σέβεται τον ήδη υπάρχοντα 6/12/24 selector (`?months=`).
- **Δύο κανόνες ειλικρίνειας, επιβεβλημένοι στο lib και όχι αφημένοι στο UI**: (1) ο **τρέχων μήνας
  εξαιρείται πάντα** (είναι μερικός, και ένας μισός μήνας δίπλα σε ολόκληρο διαβάζεται σαν ψεύτικη βελτίωση),
  (2) μήνας χωρίς καταγραφή πέρσι δίνει `pct: null`, **ποτέ** ποσοστό (αύξηση από το μηδέν δεν έχει νόημα σε
  %, και ένα «+100%» θα κατασκεύαζε γεγονός από ελλιπή δεδομένα). Το card **δεν renderάρεται καθόλου** όταν
  κανένας μήνας δεν έχει περσινό νούμερο (`comparable === 0`), δηλαδή σε νέα εγκατάσταση με <13 μήνες
  ιστορικό, όπως όριζε το builder default.
- **Απόφαση που πάρθηκε μόνη της (καταγραφή)**: το spec έλεγε «επιλεγμένος μήνας φέτος vs ίδιος πέρσι».
  Υλοποιήθηκε ως **ολόκληρη σειρά** πάνω στο υπάρχον παράθυρο (όλοι οι πλήρεις μήνες, ζεύγος ανά μήνα) αντί
  για έναν μόνο μήνα με picker: το εποχιακό μοτίβο φαίνεται μόνο σε σειρά, το picker θα ήταν νέο state +
  νέο URL param για λιγότερη πληροφορία. Το headline δίνει ούτως ή άλλως το «ένα νούμερο» για τον πιο
  πρόσφατο συγκρίσιμο μήνα. MVP = μόνο total spend, per-category breakdown μένει follow-up όπως ορίστηκε.
- **Αρχική ανάλυση (πριν το build):** live-verified `apps/web/src/app/reports/page.tsx` — το monthly-spend chart είναι **μόνο rolling
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

### P68. Επέκτασε το per-space tag (P34) σε Receipts/Subscriptions/Bills — 🚧 ΦΑΣΗ 1 (Receipts) SHIPPED 2026-09-07 (pharos-brain) — S — OSS, dogfooding-heavy
- **Φάση 1 (Receipts), shipped:** `Receipt.space` (ίδιο taxonomy `AppConfig.spaces`, '' = χωρίς χώρο), πεδίο στη
  φόρμα της απόδειξης (κρυμμένο όσο δεν υπάρχει ονομασμένος χώρος, όπως στα Expenses), κληρονομιά από την
  τελευταία tagged απόδειξη του ΙΔΙΟΥ καταστήματος στο upload (mirror του `inheritFromSeries` του P34),
  αναζήτηση με το tag, `space` στο v1 API (GET + PATCH, openapi + API.md), και τα tagged σύνολα αποδείξεων
  μπαίνουν στο ήδη υπάρχον card «δαπάνες ανά χώρο» των Reports μέσω του `lib/receiptSpaceSpend.ts`.
  Untagged install: μηδέν αλλαγή, ακριβώς όπως το P64 φάση 2.
- **Μένει (φάση 2):** το ίδιο πεδίο σε `Subscription` + `Bill`, και ο global space-filter στα money views
  (σήμερα φίλτρο ανά χώρο έχουν μόνο τα Expenses/Income· οι αποδείξεις βρίσκονται με ελεύθερη αναζήτηση).
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

### P67. Bills + Goals λείπουν από το ενιαίο money agenda (`/calendar` + `.ics` feed) — ✅ SHIPPED 2026-09-07 (pharos-brain) — S — OSS (κυρίως)
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
- **Τι έγινε (2026-09-07):** δύο νέα entry kinds, `payable` (ανοιχτός λογαριασμός P28, εικονίδιο απόδειξης,
  πορτοκαλί) και `goal` (προθεσμία στόχου P12, εικονίδιο στόχου, μωβ), και στα δύο αντίγραφα του υπολογισμού:
  `lib/moneyAgenda.ts` (τροφοδοτεί `/api/v1/calendar`, το `.ics` feed και το safe-to-spend των Reports) και
  `app/calendar/page.tsx` (η μεταφρασμένη έκδοση της σελίδας). Τα δύο νέα models περνούν από `currentModel`,
  όπως τα άλλα πέντε, και το `moneyAgenda.tenant.test.ts` ελέγχει πλέον και τα επτά.
- **Τρεις αποφάσεις του builder:** (α) ο λογαριασμός μετράει **μόνο το υπόλοιπο** (`billRemaining`), ώστε ένας
  μισοπληρωμένος να μη διπλομετρά ό,τι ήδη έδωσες· (β) ο στόχος μπαίνει **χωρίς ποσό**, γιατί μια προθεσμία δεν
  είναι χρέωση — αλλιώς θα φούσκωνε το «due this month» και το safe-to-spend με λεφτά που δεν φεύγουν· (γ)
  στόχος ήδη καλυμμένος από τις εισφορές του **σωπαίνει**. Παρενέργεια που θεωρήθηκε σωστή: ένας απλήρωτος
  λογαριασμός τώρα **μειώνει** το safe-to-spend, όπως κάθε άλλη δεσμευμένη εκροή.

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

### P64. Receipt line-item category tagging — ✅ SHIPPED (φάσεις 1+2) 2026-08-28 (pharos-brain)

- **Τι έγινε**: νέο optional `category` στο `LineItemSchema` (`models/Receipt.ts`), κενό = ακριβώς η
  προ-P64 συμπεριφορά, μηδέν migration. Ο line-item editor των Receipts απέκτησε ανά γραμμή picker
  με το ΙΔΙΟ taxonomy που χρησιμοποιεί η φόρμα Expenses (`settings.expenseCategories`, περνά από το
  `receipts/page.tsx`), με «χωρίς κατηγορία» ως πρώτη επιλογή. Μια κατηγορία που αποθηκεύτηκε πριν
  αλλάξει το taxonomy παραμένει επιλέξιμη (μπαίνει μπροστά στη λίστα), ώστε ένα edit των ρυθμίσεων
  να μη σβήνει σιωπηλά παλιά tags. Το πεδίο ταξιδεύει και στο public API: `serializeLineItems()` το
  επιστρέφει (`''` για γραμμές προ-P64) και ο `PATCH /api/v1/receipts/:id` sanitizer το δέχεται
  trimmed, με το `docs/openapi.yaml` ενημερωμένο (ο `openapi.schema.test.ts` drift guard το απαιτεί).
- **Επιλογές του builder, καταγεγραμμένες**: (α) το MVP είναι **μόνο manual tagging** — το
  AI auto-suggest στο parse-time μένει follow-up, όπως το προέβλεπε το ίδιο το spec· (β) i18n μόνο σε
  **en + el** (οι άλλες 6 γλώσσες είναι `Partial<Dict>` και πέφτουν στα αγγλικά)· (γ) reuse του
  expense taxonomy αντί για νέα λίστα ρυθμίσεων — μια απόδειξη σούπερ μάρκετ πρέπει να αθροίζεται
  με τα Expenses στο ίδιο breakdown, άρα κοινό λεξιλόγιο από την αρχή.
- **Γνωστός περιορισμός**: ένα **re-scan ξαναγράφει τις γραμμές** και άρα χάνει τα χειροκίνητα tags
  (το ίδιο ίσχυε ήδη για `refinedName`/`matchedItemId`, δεν είναι νέα συμπεριφορά).
- **Φάση 2, ΕΓΙΝΕ 2026-08-28**: τα Reports αθροίζουν πλέον τις categorized γραμμές δίπλα στα
  `Expense.category` ποσά, οπότε η απόδειξη σούπερ μάρκετ σταματά να είναι αόρατη. Νέο pure
  `lib/receiptCategorySpend.ts` (category → ποσό, ανά μήνα και all-time) που καταναλώνουν **και οι
  δύο** call sites, το web `reports/page.tsx` και το `GET /api/v1/reports`, ώστε να μη διαφωνούν
  ποτέ τα δύο νούμερα. Επηρεάζονται: το chart ανά κατηγορία, τα budget actuals του μήνα, και το
  rollover παράθυρο του P25.
- **Επιλογές της φάσης 2, καταγεγραμμένες**: (α) **κανένα setting**, το feature είναι opt-in εκ
  κατασκευής — μετράνε μόνο γραμμές με μη κενή `category`, και κάθε γραμμή προ-P64 έχει `''`, άρα
  σε εγκατάσταση χωρίς tags δεν κουνιέται ούτε ένα νούμερο· (β) οι αποδείξεις μπαίνουν ΜΟΝΟ στα
  category-scoped αθροίσματα, **όχι** στο cash-flow ούτε στα μηνιαία/ετήσια σύνολα, γιατί έχουν ήδη
  το δικό τους «Monthly spend» chart στην ίδια σελίδα και θα μετριόντουσαν δύο φορές· (γ) το ποσό
  γραμμής υπολογίζεται **gross** (`qty × price × (1 + vatRate/100)`), στην ίδια βάση με το
  `Expense.amount` — το `price` είναι στην πράξη η ΚΑΘΑΡΗ τιμή μονάδας, όπως το δείχνει ο ίδιος ο
  line-item editor και το «∑ from products», παρά το αντίθετο σχόλιο στο `LineItemSchema`.
- **Δεν άλλαξε το σχήμα του API**: κανένα νέο πεδίο στο `GET /api/v1/reports`, μόνο τα ποσά μέσα
  στο ήδη υπάρχον `byCategory`/`budgets`, άρα μηδέν openapi drift.

### P64 (αρχικό spec, για ιστορικό) — S/M — OSS (κυρίως), dogfooding-heavy
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

### P61. Partial payments για Bills/payables (όχι μόνο δυαδικό paid/unpaid) — ✅ SHIPPED 2026-08-08 (pharos-daily-dev)

- **Τι έγινε**: νέο optional `Bill.payments[]` subdoc (amount/date/note/expenseId, mirror του `GiftCardUseSchema`).
  Κενό array = ακριβώς η προ-P61 συμπεριφορά, μηδέν breaking change. Νέες pure helpers στο `lib/bill.ts`
  (`billPaidAmount`, `billRemaining`, `billPaymentState`, `billIsSettledByPayments`) + νέα actions
  `logBillPayment` / `removeBillPayment`. Το «mark paid» έμεινε η one-click ενέργεια, το «log a partial
  payment» μπήκε **δίπλα** του, όχι στη θέση του· ο λογαριασμός κλείνει **μόνος του** μόλις Σpayments ≥ amount
  (paidAt με την ημερομηνία ΤΗΣ πληρωμής, recurring spawn μέσω του ίδιου `markBillPaid` path).
- **Απόφαση που κατέγραψα (απόκλιση από το γράμμα του spec, όχι από τον σκοπό)**: το `billStatus()` ΔΕΝ
  απέκτησε πέμπτη τιμή `partially-paid`. Η πρόοδος πληρωμής έγινε **ξεχωριστός άξονας** (`billPaymentState`),
  γιατί (α) ένας μισοπληρωμένος λογαριασμός που έχει ξεπεράσει την προθεσμία πρέπει να συνεχίσει να φωνάζει
  `overdue` αντί να το κρύβει πίσω από ένα «partially-paid» chip, και (β) το `status` του v1 API θα ήταν
  breaking change για κάθε client. Το UI δείχνει **και τα δύο**: το urgency chip όπως πάντα, συν progress bar
  + υπόλοιπο + φίλτρο «Part-paid (N)».
- **Παράπλευρες διορθώσεις ακρίβειας** (ίδιο scope, «τα νούμερα να λένε αλήθεια»): το «to pay» σύνολο της
  κεφαλίδας αθροίζει πλέον **υπόλοιπα** όχι αρχικά ποσά· το ntfy/bell alert ενός part-paid λογαριασμού
  αναφέρει το **υπόλοιπο**· και το «mark paid» με το opt-in expense καταχωρεί **μόνο ό,τι απομένει** αντί να
  ξαναγράψει ολόκληρο το ποσό. Τα instalments είναι πάντα σε **base currency** (ίδιο denomination με το
  `Bill.amount`), ώστε το «τι χρωστάω ακόμα» να είναι απλή αφαίρεση και σε ξενόνομισμα λογαριασμό.
- **Verified**: `type-check` EXIT 0· `vitest` πλήρες **6451 passed / 2 failed** (τα 2 = το γνωστό
  pre-existing `aiConfig.tenant.test.ts` timeout flake από 2026-08-05, άσχετο)· +35 νέα tests (26 στο
  `lib/bill.test.ts`, 15 στο `bills/actions.test.ts`)· ο openapi drift guard έπιασε τα νέα πεδία → το
  `docs/openapi.yaml` ενημερώθηκε (`BillPayment` schema + 4 πεδία)· `docker compose build web` πέρασε,
  `RestartCount 0`, `/login` 200, `/bills` 307 (auth redirect). Commit `058a465`.

> Αρχικό spec:
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

### P56. Printable QR asset-tag labels για inventory items (scan-to-view) — ✅ SHIPPED 2026-09-03 (`9eafef3`, pharos-brain, single-item) + 2026-09-04 (`6f06568`, bulk sheet για N επιλεγμένα — ΠΛΗΡΕΣ) — S/M — OSS (dogfooding-heavy, «Personal Hub» fit)
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

### P55. Item resale / disposal proceeds tracking (το «sold» status να αποθηκεύει κάτι) — ✅ SHIPPED 2026-08-30 (pharos-brain)
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

### P47. Item lending tracker (δανεικά σε φίλους/οικογένεια) — ✅ SHIPPED 2026-09-05 (`8ca38b9` πεδία+badge+«γύρισε πίσω» + overdue-return alert· pharos-brain) — S/M — OSS
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

### P44. Warranty claim / RMA tracker (κύκλος ζωής μιας πραγματικής επιστροφής) — ✅ SHIPPED φάση 1 2026-09-06 (πεδία + πίλλα στην κάρτα + πάνελ ιστορικού· pharos-brain) — S/M — OSS (κυρίως)
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
- **Τι βγήκε στη φάση 1:** το `Item.warrantyClaims[]` (embedded, όπως έλεγε το builder default), οι πέντε
  καταστάσεις, ο editor με τις σειρές μέσα στη φόρμα, η πίλλα «Ανοιχτό RMA» σε λίστα και πλέγμα (χρυσή όσο
  κινείται, κόκκινη όταν έχει σιωπήσει), και το πάνελ ιστορικού στο detail. Οι κανόνες είναι καθαροί στο
  `lib/warrantyClaims.ts` με 32 tests, συν 5 στο `actions.warrantyClaims.test.ts` για το wiring.
- **Τι μένει (φάση 2, ίδιο split με P41/P47):** το stale-claim nudge, δηλαδή ειδοποίηση όταν ένα ανοιχτό RMA
  δεν έχει κουνηθεί 14+ μέρες. Χρειάζεται bell dedupe key, outbound κανάλια, per-type toggle και ρύθμιση
  lead-time· ο κανόνας ο ίδιος (`claimIsStale`) είναι ήδη γραμμένος και δοκιμασμένος εδώ.
- **Συνειδητά εκτός:** συνημμένα ΑΝΑ claim. Το item έχει ήδη το vault του P21 για εγγυήσεις και αλληλογραφία,
  και ένα δεύτερο, στενότερο storage path θα ήταν διπλή υλοποίηση για την ίδια δουλειά.

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

### P41. Maintenance / service reminders για owned items (όχι εγγύηση, όχι χρέωση) — ✅ SHIPPED 2026-09-04 (`5680469` πεδία + UI, pharos-brain· alert σε δεύτερο commit — ΠΛΗΡΕΣ) — S/M — OSS (dogfooding-heavy)
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

### P48. Storage mirror sync-staleness alert (backup peace-of-mind) — ✅ SHIPPED 2026-08-04 (pharos-daily-dev)
- **Τι έγινε:** νέο `AppConfig.lastRemoteSyncAt` γραμμένο από **ΚΑΘΕ** επιτυχημένο push (`syncToRemote`,
  `syncOnedriveBatch`, ΚΑΙ το auto-mirror-on-verify), νέο pure `lib/syncStaleness.ts`, γραμμή στο
  `runAlertChecks`, ρύθμιση «Mirror stale alert (days)» (default 7, 0 = off), και γραμμή «last written …»
  στο Settings → File storage με προειδοποιητικό χρώμα όταν είναι stale.
- **Δύο σκόπιμες αποκλίσεις από το spec** (και οι δύο pinned με tests):
  1. **ΔΕΝ gate-άρει στο auto-mirror toggle.** Το spec έλεγε «AND mirror ενεργό», αλλά auto-mirror OFF
     σημαίνει ότι κάθε push είναι χειροκίνητο κλικ, δηλαδή ακριβώς ο χρήστης που μπορεί να ξεχάσει: το gate
     θα έσβηνε την ειδοποίηση για τους μόνους που τη χρειάζονται.
  2. **Ο χρόνος γράφεται ΜΟΝΟ όταν `pushed > 0`.** Αλλιώς ένα «Sync now» σε νεκρό NAS (0 αρχεία, 5 σφάλματα)
     θα μηδένιζε για πάντα το ρολόι της ίδιας προειδοποίησης που έπρεπε να σηκώσει.
- **Επίσης:** ένα remote που **ΔΕΝ συγχρονίστηκε ποτέ** χτυπάει (days: null) — mirror ρυθμισμένο μια φορά και
  ποτέ χρησιμοποιημένο είναι πανομοιότυπο με ένα υγιές παντού αλλού στο UI.

### P48 (αρχικό spec, για ιστορικό) — S — both
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

### P46. Expense duplicate detection & merge — ✅ SHIPPED 2026-08-04 (pharos-daily-dev)
- **Τι έγινε:** νέο pure `lib/expenseDupes.ts` (κλειδί `kind|vendorKey|ημέρα|ποσό`), actions
  `findDuplicateExpenses(kind)`/`mergeExpenses(keep, drops)`, νέο `ExpenseDuplicatesModal` και κουμπί
  «⧉ duplicates» στο header των Expenses/Income (ίδιο review-before-merge flow με τις αποδείξεις).
- **Τρεις σκόπιμες επιλογές** (όλες pinned με tests):
  1. **Το `kind` μπαίνει στο κλειδί** και το merge φορτώνει τα drops με `kind: keep.kind`: μια επιστροφή
     (income) και μια χρέωση (expense) με ίδιο vendor/ημέρα/ποσό δεν προσφέρονται ΠΟΤΕ ως διπλότυπα.
  2. **Χωρίς vendorKey ή με ποσό 0 δεν ομαδοποιείται τίποτα.** Χωρίς vendor το μόνο σήμα που μένει είναι
     «ίδια μέρα, ίδιο ποσό», που περιγράφει και πραγματικά ξεχωριστές εγγραφές (δύο βενζίνες)· τα κενά
     drafts (amount 0 από αποτυχημένο AI parse) θα έφτιαχναν το μεγαλύτερο ψεύτικο cluster της βιβλιοθήκης.
  3. **Τα drops πάνε στον Κάδο (soft delete), δεν σβήνονται** (σε αντίθεση με τις αποδείξεις, που δεν έχουν
     soft delete) — άρα ένα merge που μετάνιωσες γυρίζει πίσω για 30 μέρες.
- **Η παγίδα που έπιασε ο σχεδιασμός:** όταν ο επιζών υιοθετεί το ΑΡΧΕΙΟ ενός drop, καθαρίζεται πρώτα το
  `filePath`/`thumbPath` του drop. Το `purgeTrashEntry` σβήνει το αρχείο ενός expense χωρίς να ελέγξει αν
  κάποιος άλλος δείχνει σε αυτό, οπότε μια αναφορά που έμενε θα σήμαινε ότι το 30-ήμερο auto-purge σβήνει
  σιωπηλά το έγγραφο του **επιζώντος**.
- **Η ημέρα διαβάζεται σε ΤΟΠΙΚΑ parts, όχι UTC** (και ένα test το εξηγεί): το `lib/dates.ts` αποθηκεύει
  ένα day-first «04/06/2026» ως τοπικά μεσάνυχτα αλλά ένα ISO «2026-06-04» ως UTC μεσάνυχτα, άρα ο ίδιος
  λογαριασμός γραμμένος με το χέρι και εισαγμένος από CSV είναι δύο διαφορετικές στιγμές· με UTC parts το
  ζευγάρι δεν θα ταίριαζε ποτέ ανατολικά του Γκρίνουιτς.

### P46 (αρχικό spec, για ιστορικό) — S — OSS
- **Αξία:** τα Receipts, Stores, και Items έχουν ήδη ένα δουλεμένο «find duplicates» modal (group κατά κλειδί +
  review + merge, βλ. `findDuplicateReceipts`/`findDuplicateStores`/`findDuplicateItems`) — τα **Expenses δεν
  έχουν το ίδιο**, παρόλο που ο κίνδυνος υπάρχει εξίσου (διπλό import ενός λογαριασμού, ίδια recurring εγγραφή
  δύο φορές λόγω race στο auto-mirror-on-verify ή διπλό CSV/YNAB import). Ίδιο group-by (vendorKey+ημέρα+ποσό,
  ίδιο κλειδί με το recurring-detection/anomaly) + merge, ελάχιστο νέο effort αφού το UI pattern
  (`DuplicatesModal`-style) υπάρχει ήδη τρεις φορές ως πρότυπο να αντιγραφεί.
- **Module:** Expenses (+ Income, ίδιο μοντέλο/kind πεδίο).
- **Ανοιχτή απόφαση (builder default):** group by `vendorKey` (ήδη υπάρχει η normalize function) + ίδια ημέρα +
  ποσό· reuse UI pattern από το `ReceiptsClient` DuplicatesModal ατόφιο (ίδιο review-before-merge flow).

### P40. Self-host update-available banner (GHCR version check) — ✅ SHIPPED 2026-08-04 (pharos-daily-dev)
- **Τι έγινε:** νέο pure `lib/versionCheck.ts` (parse/compare/pick-latest + ο anonymous GHCR fetch), action file
  `settings/updateCheckActions.ts` (`getUpdateStatus(force?)` / `setUpdateCheckEnabled`), component
  `UpdateChecker` στο Settings → About (πραγματική έκδοση, «Update available: vX.Y.Z» με link στα releases,
  «check now», opt-out toggle), **`ARG APP_VERSION=dev`** στο `apps/web/Dockerfile` και `build-args` στο
  `release.yml` ώστε το image να ξέρει ποια έκδοση είναι.
- **Πολιτική (pinned με tests):** 1 ανώνυμο GET/24ωρο· **αποτυχημένος έλεγχος ΣΤΑΜΠΑΡΕΙ την προσπάθεια αλλά
  ΔΕΝ σβήνει την τελευταία πραγματική απάντηση** (firewalled instance κάνει back off χωρίς να χάνει ό,τι ήξερε)·
  το «check now» παρακάμπτει το cache· opt-out **πριν** από οποιοδήποτε outbound call· **μηδέν** στο SaaS.
- **Ένα build που δεν είναι release (`dev`/`edge`) ΔΕΝ ειδοποιείται ποτέ** — δεν έχει «μείνει πίσω», μπορεί
  και να είναι μπροστά· ένα banner εκεί είναι μόνο θόρυβος. Ούτε τα convenience tags (`latest`, `1`, `1.2`)
  ούτε τα pre-release (`1.5.0-rc1`) περνάνε για εκδόσεις.
- **Δεν εμπιστεύεται τη σειρά των tags** του registry (το OCI spec τα δίνει λεξικογραφικά, όπου το `1.9.0`
  βγαίνει μετά το `1.10.0`): κάνει parse και παίρνει το max, με bounded pagination (5 σελίδες) ώστε ένα project
  με 100+ releases να μην παγώνει σιωπηλά στην πρώτη σελίδα.
- **Ο repo-wide write-guard (P31) το έπιασε σωστά**: το `getUpdateStatus` γράφει cache σε page load, οπότε
  μπήκε στο allowlist του `writeGuard.coverage.test.ts` με τον λόγο (ίδιο σχήμα με τα ήδη υπάρχοντα
  `generateNotifications` / `backfillReceiptThumbs`: derived refresh, μηδέν user input). Το toggle δίπλα του
  είναι κανονικά guarded.
- **⚠ ΕΚΚΡΕΜΕΙ για να ανάψει στην πράξη:** το `ghcr.io/achilleasgkekas/pharos` **δεν είναι δημόσιο** (επαληθεύτηκε
  live: anonymous token → 403 DENIED, ενώ η ίδια ροή σε δημόσιο package δίνει 200). Μέχρι να γίνει public το
  package (ή να δημοσιευτεί το OSS repo), ο έλεγχος θα αποτυγχάνει σιωπηλά, ακριβώς όπως σχεδιάστηκε.

### P40 (αρχικό spec, για ιστορικό) — S — OSS (adoption/retention lever)
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

### P30. Mobile push notifications (Expo) για alerts & reminders — ✅ shipped 2026-06-29, ⛔ ΚΩΔΙΚΑΣ ΑΦΑΙΡΕΘΗΚΕ 2026-08-04 (mobile discontinued)
- **Ενημέρωση 2026-08-04:** το mobile app καταργήθηκε (`OWNER_DECISIONS.md` #15). Ο κώδικας που περιγράφεται
  παρακάτω **διαγράφηκε στο ίδιο commit-set**: `User.pushTokens`, `lib/expoPush.ts`, το `push/register` route,
  φυσικά και το `apps/mobile/src/push.ts`/`App.tsx` wiring (μαζί με όλο το `apps/mobile`), και το
  `pushAllDevices()` call site μέσα στο `runAlertChecks`. Ιστορική περιγραφή παρακάτω, δεν αντιστοιχεί πλέον
  σε live κώδικα.
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

### P17. Mobile barcode/QR scan → γρήγορη προσθήκη στο inventory — ✅ shipped 2026-07-27, ⛔ ΚΩΔΙΚΑΣ ΑΦΑΙΡΕΘΗΚΕ 2026-08-04 (mobile discontinued)
- **Ενημέρωση 2026-08-04:** το mobile app καταργήθηκε (`OWNER_DECISIONS.md` #15). Το server-side product-lookup
  μισό διαγράφηκε επίσης — `lib/barcode.ts`, `lib/barcodeLookup.ts`, το `GET /api/v1/lookup/barcode` route —
  γιατί verified (grep) μηδέν web caller το χρησιμοποιούσε, ήταν αποκλειστικά για το mobile camera scan.
  `apps/mobile/src/BarcodeScanner.tsx` έφυγε μαζί με ολόκληρο το `apps/mobile`. Ιστορική περιγραφή παρακάτω,
  δεν αντιστοιχεί πλέον σε live κώδικα.
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

### P62. Split a purchase across multiple payment methods (κάρτα + gift card / cash) — ✅ SHIPPED 2026-08-28 (pharos-brain)
- Νέο optional `Expense.paymentSplits: [{ method, amount, giftCardId }]` **πάνω** από το ήδη-υπάρχον single
  `paymentMethod` (κενό array = ακριβώς η προ-P62 συμπεριφορά, μηδέν breaking change, μηδέν migration). Νέο pure
  module `lib/paymentSplit.ts` (`cleanPaymentSplits`/`paymentSplitTotal`/`paymentSplitRemainder`/
  `paymentSplitsBalance`/`balancePaymentSplits`/`giftCardSpend`) — σκόπιμα ΞΕΧΩΡΙΣΤΟ από το `lib/split.ts` του P35:
  εκείνο μοιράζει ένα έξοδο μεταξύ **ΑΤΟΜΩΝ** («ποιος μου χρωστάει»), αυτό μεταξύ **ΜΕΘΟΔΩΝ** («τι πλήρωσε τι»).
  Τα δύο συνυπάρχουν στο ίδιο έξοδο χωρίς να ξέρει το ένα για το άλλο.
- **Το κλείσιμο του κύκλου με το P32**: μια γραμμή που δείχνει σε δωροκάρτα γράφει **αυτόματα** το ισόποσο use στο
  `GiftCard.uses[]`, οπότε το υπόλοιπο της κάρτας πέφτει χωρίς δεύτερη χειροκίνητη καταχώρηση — αυτό ήταν ακριβώς
  το κενό που περιέγραφε το item (κανένα reference field δεν συνέδεε Expense και GiftCard use). Νέο
  `GiftCardUseSchema.expenseId` (default `''`) κάνει το mirroring **idempotent**: το `syncGiftCardUses()` πρώτα
  κάνει `$pull` ΜΟΝΟ τις εγγραφές αυτού του expense (`{ 'uses.expenseId': id }`) και μετά γράφει τις τρέχουσες,
  άρα re-save / αλλαγή κάρτας / σβήσιμο του split συγκλίνουν αντί να στοιβάζουν διπλές χρεώσεις. Uses που ο
  χρήστης έγραψε ο ίδιος πάνω στην κάρτα έχουν `expenseId: ''` και **δεν** μπαίνουν ποτέ στο φίλτρο. Δύο γραμμές
  στην ίδια κάρτα συγχωνεύονται σε ΕΝΑ use (`giftCardSpend`).
- **Ποτέ δεν μπλοκάρει την αποθήκευση**: το Zod πεδίο έχει `.catch([])` (malformed split → κενό, όχι validation
  error), και το `syncGiftCardUses` είναι όλο σε try/catch με δεύτερο try/catch ανά κάρτα — stale/λάθος
  `giftCardId` ή εντελώς μη διαθέσιμο GiftCard collection αφήνουν το ίδιο το έξοδο σωσμένο.
- **UI** (`ExpensesClient.tsx`, `PaymentSplitEditor`, μόνο για `kind !== 'income'` όπως και ο SplitEditor του P35):
  opt-in panel — μέχρι να πατήσεις «Add method» η φόρμα είναι ό,τι ήταν. Ανά γραμμή: ελεύθερος τρόπος + dropdown
  δωροκάρτας (δείχνει το τρέχον υπόλοιπο, επιλογή κάρτας συμπληρώνει και το label) + ποσό. Νέα γραμμή προ-γεμίζει
  με ό,τι δεν έχει κατανεμηθεί. Το `/expenses` φορτώνει μόνο live κάρτες (μη αρχειοθετημένες, υπόλοιπο > 0) ως
  ελαφρύ `GiftCardOption[]` με **προϋπολογισμένο** balance, ώστε να μη στέλνονται ολόκληρα `uses[]` ιστορικά.
- **Απόφαση πάνω στο «άθροισμα = total» validation του item**: υλοποιήθηκε ως **προειδοποίηση, όχι ως απόρριψη**
  (κόκκινο «μένουν €X» / «€X πάνω από το σύνολο» + κουμπί «Συμπλήρωση στο σύνολο» που ρίχνει τη διαφορά στην
  τελευταία γραμμή, το αντίστοιχο του «split equally» του P35). Λόγος: το ποσό συχνά διορθώνεται ΜΕΤΑ τις
  γραμμές, και το να μη σώζεται ολόκληρο το έξοδο για ένα λεπτό διαφορά θα ήταν εχθρικό. Το ίδιο idiom με τον
  P35 guard, που είναι επίσης UI-side.
- **Εκκρεμεί (follow-up, όχι blocking)**: (α) τα **Receipts** δεν πήραν το πεδίο — το item τα ανέφερε, αλλά το
  σκέλος Expenses είναι το αυτοτελές MVP (ίδιο μοντέλο, το `lib/paymentSplit.ts` είναι έτοιμο για reuse ατόφιο)·
  (β) το `deleteExpense` είναι **soft** delete προς το Trash, οπότε ένα διαγραμμένο έξοδο αφήνει προς το παρόν τη
  χρέωση πάνω στη δωροκάρτα (σκόπιμο: η εγγραφή είναι ανακτήσιμη· ο καθαρισμός ανήκει στο purge path, που είναι
  irreversible-delete έδαφος και μένει εκτός «μικρό & ασφαλές»)· (γ) το `/api/v1/expenses` serializer δεν εκθέτει
  ακόμα το `paymentSplits`.
- **Verified**: `npm run type-check` EXIT 0· `npx vitest run` πλήρες → **409/409 αρχεία, 6584 passed / 4 skipped,
  μηδέν fail** (**+33 νέα tests**: 18 στο `lib/paymentSplit.test.ts`, 15 στο νέο
  `app/expenses/actions.paymentSplit.test.ts` που καρφώνει ρητά το «pull πριν το push», ότι το φίλτρο είναι
  `{ expenseId }` και όχι blanket, τη συγχώνευση δύο γραμμών ίδιας κάρτας, και τα δύο never-throw μονοπάτια).
  Τα 2 exhaustive shape assertions του `expenses/lib.test.ts` ενημερώθηκαν για το νέο πεδίο. **Καμία επαλήθευση
  σε browser**: αυτό το μηχάνημα δεν έχει πλέον Docker ούτε `node_modules` (χρειάστηκε `npm ci` για να τρέξει
  καν το type-check), οπότε δεν υπήρχε τρεχούμενη εφαρμογή να ελεγχθεί.

### P73. Recurring subscription cost-split among household members (family-plan «ποιος χρωστάει τι» ανά κύκλο) — ✅ SHIPPED 2026-08-13 (pharos-brain)
- Νέο optional `Subscription.split: SplitEntry[]` (ίδιο σχήμα με `Expense.split`) + reuse ατόφιο των
  `lib/split.ts` pure helpers (P35: `equalSplit`/`splitTotals`/`cleanSplit`, μηδέν νέος υπολογισμός). UI στο
  `SubscriptionsClient.tsx`: cyan «⇄ €X owed» badge στην κάρτα συνδρομής (ίδιο idiom με το Expenses' SplitBadge)
  + `SplitEditor` μέσα στη φόρμα (add/remove person, ποσό ανά γραμμή, «split equally» με προαιρετικό include-me,
  per-row «mark paid back»). Ο `SplitEditor` **δεν** μοιράστηκε ως component (η φόρμα των Expenses έχει άλλο
  form-state shape) — αντιγράφηκε σκόπιμα μικρός· τα ίδια i18n κλειδιά (`ex.split*`) ξαναχρησιμοποιήθηκαν αυτούσια
  αντί για νέα `sub.split*` σε 8 locale αρχεία, γιατί το λεκτικό είναι γενικό («Split with people», «Split equally»),
  όχι Expense-specific.
- **Server**: το `createSubscription`/`updateSubscription` παραμένουν FormData-based (όχι το object+safeParse
  pattern του Expenses) — το `split` περνά ως ΕΝΑ JSON-serialized πεδίο (`fd.set('split', JSON.stringify(split))`),
  το Zod schema το κάνει `.transform()` με try/catch (malformed/absent JSON → `[]` αντί για validation error που θα
  μπλόκαρε ολόκληρη την αποθήκευση), μετά `cleanSplit()` πριν το write. **+7 νέα tests** (`actions.test.ts`, 405→
  ~448 lines): default κενό split, well-formed array καθαρίζεται σωστά (trim/round/boolean), nameless rows πέφτουν,
  malformed JSON και JSON object (όχι array) και τα δύο degrade σε `[]` χωρίς exception, updateSubscription ίδιο
  cleaning. Builder default τηρήθηκε αυτούσιος: static split (ένα ποσό/μερίδιο «μέχρι να το αλλάξεις», όχι
  per-cycle history), κενό `split[]` = σημερινή συμπεριφορά αμετάβλητη.
- **Εκκρεμεί (follow-up, όχι blocking)**: καμία cross-subscription «who owes you» balances επισκόπηση (το
  Expenses' `BalancesModal`+`settlePerson` server action δεν αντιγράφηκε — το per-row settle μέσα στον editor
  καλύπτει το MVP)· το `/api/v1/subscriptions` serializer (`serialize.ts`) δεν εκθέτει ακόμα το `split` πεδίο.
- **Verified**: `npm run type-check` EXIT 0· `npx vitest run` πλήρες → **407/407 αρχεία, 6551 passed / 4 skipped**
  (58/58 στο subscriptions+split scope)· `docker compose build web` + `up -d web` → **RestartCount 0**, `/login`
  **307**, `/subscriptions` **307** (auth redirect, η διαδρομή σερβίρεται)· browser: τίτλος «Sign in · Pharos»,
  **μηδέν console errors**. Docker mutex πάρθηκε/απελευθερώθηκε γύρω από build+boot, `docker builder prune -f` →
  **2.42GB** ελευθερώθηκε.

### P84. Credit card utilization warning (creditLimit vs πραγματικό outstanding) — ✅ SHIPPED 2026-08-10 (pharos-daily-dev)
- Νέο pure `lib/cardUtilization.ts` (`buildCardUtilization`/`utilizationLevel`, 15 tests) + badge «X% of limit» στο
  group header κάθε κάρτας στο `/statements` ΚΑΙ στο Manage cards. Outstanding = τελευταίο statement ανά κάρτα
  (ίδιος κανόνας με το ήδη-υπάρχον header number, ποτέ διαφωνεί μαζί του). Κατώφλια 80% gold / 95% red, κενό
  `creditLimit` = κανένα badge. Builder default τηρήθηκε αυτούσιος (μόνο UI badge, το `runAlertChecks` follow-up
  παραμένει ανοιχτό ως δικό του μελλοντικό item αν ζητηθεί). (Σημείωση σάρωσης 32: το item χτίστηκε ενώ ζούσε ακόμα
  φυσικά στο `## Proposed` — μετακινήθηκε εδώ τώρα, καθαρά bookkeeping, καμία αλλαγή περιεχομένου.)

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

### P59, P51, P23 — όλα τα mobile-native items, ⛔ REJECTED 2026-08-04 (mobile discontinued)
Το mobile app (`apps/mobile`, Expo/React Native) καταργήθηκε πλήρως — απόφαση Αχιλλέα, βλ.
`OWNER_DECISIONS.md` #15. Τα τρία αυτά items ήταν στο `## Approved`, ενεργά/buildable, και τα τρία
mobile-native (widget/app-lock/share-sheet) — αφαιρέθηκαν εντελώς αντί να μείνουν ως «approved αλλά
ποτέ δεν χτίζεται», ώστε καμία routine να μην τα ξαναδεί ως ουρά προς εκτέλεση.
- **P59** — Mobile home-screen widget (quick-glance/quick-add).
- **P51** — Mobile app-lock (Face ID/Touch ID/device PIN).
- **P23** — Mobile share-sheet quick capture. Ήταν το πιο προχωρημένο (`OWNER_DECISIONS.md` #13 το είχε
  ξανά-ενεργό, «code complete awaiting EAS build» ήταν ο στόχος) — ό,τι κώδικας είχε γραφτεί γι' αυτό
  ζούσε μέσα στο ήδη-διαγραμμένο `apps/mobile`, άρα δεν μένει τίποτα μετέωρο.
Καμία από τις τρεις δεν προτείνεται ξανά, ούτε ξαναγράφεται ως νέο item με άλλη διατύπωση.
