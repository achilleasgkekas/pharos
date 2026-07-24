# PHAROS — Product Backlog (προτάσεις προϊόντος)

> Ρόλος: ο **product-planner** ΠΡΟΤΕΙΝΕΙ candidate features, ο Αχιλλέας ΑΠΟΦΑΣΙΖΕΙ.
> Αυτό συμπληρώνει (δεν αντικαθιστά) το `TODO.md` (distribution/SaaS roadmap) και τις
> ουρές τεχνικού χρέους (`WEB_DEBT.md`, `MOBILE_PARITY.md`), που καλύπτουν code debt, όχι νέα features.
> **Τίποτα στο «Proposed» δεν χτίζεται μέχρι ο Αχιλλέας να το μετακινήσει στο «Approved».**
> Οι builder routines τραβάνε ΜΟΝΟ από το «Approved». Το split OSS vs paid είναι δική του απόφαση.
> Σύμβολα μεγέθους: S (μικρό) · M (μεσαίο) · L (μεγάλο). Track: OSS / SaaS / both.
> Τελευταία ενημέρωση: 2026-07-24 (15η σάρωση planner).
> **⚑ ΜΑΖΙΚΗ ΕΓΚΡΙΣΗ 2026-07-09/10 (Αχιλλέας, interactive):** τα P1/P3/P5-P36 (+ PA1-PA3) εγκρίθηκαν όλα εν μαζώ
> και έχουν πλέον σχεδόν ολοκληρωτικά shippαριστεί από τον builder (βλ. `PROGRESS.md` για το πλήρες ιστορικό
> ανά σάρωση — συμπιέστηκε εδώ, git blame αυτού του αρχείου κρατά τις παλιές καταχωρήσεις).
> **Standing κατάσταση (15η σάρωση, 2026-07-24):** το «Approved» queue έχει μείνει ουσιαστικά χωρίς αυτόνομα-
> buildable items — μόνο P36 (Open Banking, blocked σε provider decision), P31 (household multi-user, χρειάζεται
> supervised session), P16 remainder (Firefly III/Grocy importers, χρειάζεται πραγματικό sample file), P9
> (multi-currency, ρητά τελευταίο, L), P17/P23 (mobile native-dep approvals) μένουν τεχνικά ανοιχτά αλλά κανένα
> δεν είναι «απλώς χτίσ' το» unattended. **Καμία ρητή έγκριση Proposed→Approved σε >10 διαδοχικές σαρώσεις** —
> ο Αχιλλέας ίσως αξίζει να ξανακοιτάξει το Proposed queue (P37-P57, 21 items) ή να ξανα-εξετάσει τα P9/P17/P23
> τώρα που mobile MVP + Expo push υπάρχουν ήδη (ίδιο re-examination που ξεμπλόκαρε το P5 phase-1/phase-2).
> Ζωντανό grep σε κάθε σάρωση επιβεβαιώνει ότι κανένα Proposed item δεν έχει χτιστεί εν τω μεταξύ χωρίς ρητή
> έγκριση. Προστέθηκαν **3 νέοι candidates P58-P60** αυτή τη σάρωση (verified distinct: μηδέν `nodemailer`/SMTP
> notifier channel type, μηδέν widget/Siri/shortcut config πουθενά στο `apps/mobile`, μηδέν alias-learning
> write-path πάνω στο ήδη-υπάρχον `Store.aliases[]` — μόνο manual seed edits σήμερα).

---

## Proposed (awaiting Αχιλλέας)

> Δεν χτίζονται μέχρι να μετακινηθούν στο «Approved» από τον Αχιλλέα.

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

### P31. Household / shared access — multi-user σε ένα self-host instance — M — OSS (adoption) / SaaS seed
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

### P17. Mobile barcode/QR scan → γρήγορη προσθήκη στο inventory — M — both (mobile-native)
- **Αξία:** barcode/QR scan (EAN/UPC) → lookup → prefill τίτλου/κατηγορίας/specs → one-tap add σε inventory/shopping.
- **Module:** Mobile (camera-scan) + Items/Inventory (+ `/api/v1` §5, product-lookup helper).
- **Εξάρτηση:** mobile MVP (§6). **Builder default:** lookup = δωρεάν Open Food Facts / UPC DB, AI fallback.

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

### P5. Browser extension / bookmarklet — quick capture — 🟡 Bookmarklet phase SHIPPED 2026-07-22 (pharos-daily-dev), MV3 extension εκκρεμεί
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
- **Follow-up**: MV3 browser extension (phase 2, ξεχωριστό packaging/deliverable εκτός monorepo build — γι' αυτό
  παραμένει phase 2, ίδιο σκεπτικό με τα προηγούμενα deferrals)· mobile share-sheet (P23) είναι το ισοδύναμο
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

### P9. Multi-currency (per-transaction currency + FX conversion) — L — both
- **Αξία:** ανά-συναλλαγή currency + FX rate (snapshot τη μέρα) + reporting σε base currency. Πραγματικό κενό
  (CLAUDE.md). Μεγάλο: αγγίζει schema (amount+currency+rate), aggregations, imports, όλα τα money views.
- **Module:** cross-cutting (Expenses/Receipts/Statements/Reports + `lib/money.ts`).
- **Ανοιχτή απόφαση (builder default):** **opt-in ανά deployment** (μη βαρύνει single-currency χρήστες)· FX =
  on-import capture + manual override (δωρεάν API phase 2). ΣΗΜ: L — άφησέ το τελευταίο (μεγαλύτερο ρίσκο/κόπος).

---

## Done

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
