# PHAROS — Product Backlog (προτάσεις προϊόντος)

> Ρόλος: ο **product-planner** ΠΡΟΤΕΙΝΕΙ candidate features, ο Αχιλλέας ΑΠΟΦΑΣΙΖΕΙ.
> Αυτό συμπληρώνει (δεν αντικαθιστά) το `TODO.md` (distribution/SaaS roadmap) και τις
> ουρές τεχνικού χρέους (`WEB_DEBT.md`, `MOBILE_PARITY.md`), που καλύπτουν code debt, όχι νέα features.
> **Τίποτα στο «Proposed» δεν χτίζεται μέχρι ο Αχιλλέας να το μετακινήσει στο «Approved».**
> Οι builder routines τραβάνε ΜΟΝΟ από το «Approved». Το split OSS vs paid είναι δική του απόφαση.
> Σύμβολα μεγέθους: S (μικρό) · M (μεσαίο) · L (μεγάλο). Track: OSS / SaaS / both.
> Τελευταία ενημέρωση: 2026-07-04 (4η σάρωση planner· +4 candidates P14-P17). Κανένα από τα
> P1-P13 δεν χτίστηκε ακόμα (τα commits από 2026-07-01 ήταν αποκλειστικά SaaS/billing/landing/
> mobile-parity/docs από τις builder routines, μηδέν νέο product feature) → όλα ισχύουν.

---

## Proposed (awaiting Αχιλλέας)

Ranked by value/effort (πρώτο = καλύτερη σχέση αξίας προς κόπο). ΣΗΜ: η αρίθμηση P# είναι
απλό id (σειρά προσθήκης), όχι σειρά προτεραιότητας — το value/effort standing γράφεται σε κάθε item.
Από τα νέα, τα **P10 και P11 είναι από τα υψηλότερα value/effort όλης της λίστας**.

### P1. Demo / sample-data mode σε fresh install — S — OSS (κυρίως), both
- **Αξία:** πρώτη εντύπωση σε νέο self-host = άδειο dashboard. Ένα «Load sample data»
  (και «Clear sample data») γεμίζει items/receipts/expenses/subscriptions με ρεαλιστικά
  demo δεδομένα ώστε ο χρήστης να δει αμέσως τι κάνει το app. Μεγάλος πολλαπλασιαστής adoption για OSS.
- **Module:** cross-cutting (Settings → Data, ή στο setup wizard).
- **Απόφαση που χρειάζεται:** demo data ελληνικά ή αγγλικά (πρόταση: locale-aware)· να μπαίνει προαιρετικά στο setup wizard;

### P2. Bank / generic CSV import για expenses & income — M — both
- **Αξία:** η #1 τριβή στο expense tracking είναι το χειροκίνητο data entry. Υπάρχει ήδη
  CSV **export** + PDF **statement** parser· λείπει CSV **import** (τραπεζικά exports, Revolut/N26/
  ελληνικές τράπεζες). Column-mapping UI (date/amount/description → vendor/category) +
  dedupe κατά το import + προαιρετικό AI για auto-categorisation (reuse EXPENSE pipeline).
- **Module:** Expenses / Income.
- **Απόφαση που χρειάζεται:** AI auto-categorise μέσα στο import ή μόνο μετά; (αγγίζει AI metering στο SaaS).

### P3. AI «Month in Review» digest — M — both (SaaS = metered)
- **Αξία:** αυτόματη αφηγηματική σύνοψη μήνα («ξόδεψες €X, +12% vs τον προηγούμενο, top
  κατηγορία utilities, 2 ασυνήθιστες χρεώσεις, 3 εγγυήσεις λήγουν») παραδοτέα μέσω του
  υπάρχοντος notification framework (§3 done) + in-app card. Τα δομικά στοιχεία υπάρχουν
  (anomaly detection, reports aggregations, get_overview tool) — εδώ γίνονται ένα polished digest.
  Καθαρά monetizable για SaaS (ανά-digest AI metering).
- **Module:** Reports + Notifications (+ AI).
- **Απόφαση που χρειάζεται:** auto-schedule (1η κάθε μήνα) ή on-demand; στο free tier included ή paid-only;

### P4. Net-worth time-series (snapshots + trend) — M — both
- **Αξία:** σήμερα το «net position» (inventory − owed) είναι ένα σημείο στα Reports.
  Ένα μηνιαίο snapshot (assets: inventory value + optional manual accounts· liabilities:
  installments owed + card balances) + γράφημα εξέλιξης δίνει τη «μεγάλη εικόνα» που κάνει
  ένα personal hub sticky. Reuse του υπάρχοντος net-position υπολογισμού· νέο `Snapshot` model + cron.
- **Module:** Reports (νέα «Net worth» ενότητα).
- **Απόφαση που χρειάζεται:** να επιτρέπονται manual asset accounts (μετρητά/τραπεζικά χωρίς integration); backfill από ιστορικά δεδομένα ή forward-only;

### P5. Browser extension / bookmarklet — quick capture — M — both
- **Αξία:** από οποιοδήποτε e-shop, ένα κλικ → «add to Pharos shopping» (reuse του
  υπάρχοντος `importItemFromUrl` pipeline: URL → AI parse → dedupe/multi-store price track).
  Οδηγεί engagement του price-tracker και είναι φυσικό companion πριν το mobile MVP.
  Καταναλώνει το `/api/v1` (§5 TODO) → καλός λόγος να επισπευστεί το REST seed.
- **Module:** Items / Shopping (+ REST API).
- **Απόφαση που χρειάζεται:** εξαρτάται από το `/api/v1` (§5)· MV3 extension ή απλό bookmarklet για πρώτη έκδοση;

### P6. iCal (.ics) subscription feed για Calendar — S — both
- **Αξία:** το `/calendar` ήδη ενοποιεί renewals / installments / recurring bills / warranty
  & voucher expiries, αλλά ζει μόνο μέσα στο app. Ένα read-only `.ics` feed URL (token-scoped)
  αφήνει τον χρήστη να κάνει subscribe από Google/Apple/Outlook Calendar → όλα τα οικονομικά
  deadlines εμφανίζονται δίπλα στο κανονικό ημερολόγιό του. Πολύ ψηλή σχέση αξίας/κόπου: ο
  υπολογισμός των events υπάρχει ήδη, μένει μόνο VCALENDAR serialization + authenticated route.
- **Module:** Calendar (+ auth token, reuse `User.apiToken` scope).
- **Απόφαση που χρειάζεται:** ένα ενιαίο feed ή ξεχωριστά ανά τύπο (installments/warranties/…) ώστε ο χρήστης να διαλέγει; expiries ως all-day events;

### P7. Auto-discovery επαναλαμβανόμενων χρεώσεων (untracked subscriptions/bills) — S/M — both
- **Αξία:** σαρώνει expenses + statement transactions ανά `vendorKey` και εντοπίζει σειρές που
  «μοιάζουν» με συνδρομή/λογαριασμό (σταθερό ποσό, κανονικό διάστημα) αλλά ΔΕΝ υπάρχει ακόμα
  Subscription/recurring flag → προτείνει «Βρήκα 3 πιθανές συνδρομές που δεν παρακολουθείς:
  Netflix €15/μήνα, …» με one-click «track». Αντιμετωπίζει το subscription-creep (κλασικό
  personal-finance win) και επαναχρησιμοποιεί τη λογική vendorKey-series + anomaly detection.
- **Module:** Subscriptions + Expenses/Statements.
- **Απόφαση που χρειάζεται:** heuristic-only (μηδέν AI, δωρεάν παντού) ή AI-assisted confidence (metered στο SaaS); κατώφλι «κανονικότητας» (π.χ. ≥3 εμφανίσεις, ±5 μέρες);

### P8. Tax / deductible tagging + year-end export bundle — M — both (SaaS = premium)
- **Αξία:** flag «tax-deductible» (+ optional tax category) σε expenses/receipts → στο τέλος
  χρονιάς ένα «Tax export» παράγει σύνοψη ανά κατηγορία + ZIP με τα συνημμένα PDF/εικόνες
  αποδείξεων. Μετατρέπει το Pharos από «tracker» σε εργαλείο που γλιτώνει πραγματικό χρόνο/χρήμα
  σε ελεύθερους επαγγελματίες — δυνατό paid-tier differentiator, ενώ το βασικό tagging μένει OSS.
- **Module:** Expenses/Receipts (+ Reports/Settings για το export).
- **Απόφαση που χρειάζεται:** ελληνικές φορολογικές κατηγορίες preset ή free-form tags; το ZIP-με-αρχεία μόνο σε paid ή παντού;

### P9. Multi-currency (per-transaction currency + FX conversion) — L — both
- **Αξία:** σήμερα το deployment είναι single-currency (αλλάζει μόνο το σύμβολο, δεν converts —
  σκόπιμο για single-user). Για χρήστες που ταξιδεύουν/αγοράζουν από εξωτερικό ή για SaaS
  διεθνές κοινό, ανά-συναλλαγή currency + FX rate (snapshot τη μέρα) + reporting σε base currency
  είναι πραγματικό κενό (καταγεγραμμένο στο CLAUDE.md). Μεγάλο γιατί αγγίζει schema
  (amount+currency+rate), aggregations, imports και όλα τα money views.
- **Module:** cross-cutting (Expenses/Receipts/Statements/Reports + `lib/money.ts`).
- **Απόφαση που χρειάζεται:** πηγή FX (manual entry, δωρεάν API, ή on-import capture); να ξεκινήσει opt-in ανά deployment ώστε να μη βαρύνει τους single-currency χρήστες;

### P10. Return-window & warranty-claim tracker — S — both (πολύ ψηλό value/effort)
- **Αξία:** το app ήδη κρατά warranty expiry + notification framework, αλλά αγνοεί το **παράθυρο
  επιστροφής**. Στην ΕΕ ισχύει 14ήμερο δικαίωμα υπαναχώρησης (κι άλλα καταστήματα δίνουν 30/100
  μέρες). Ένα computed «return by» πεδίο ανά απόδειξη/είδος (default 14 μέρες από purchase date,
  override ανά κατάστημα) + alert 2-3 μέρες πριν λήξει → ο χρήστης δεν χάνει ποτέ το δικαίωμα
  επιστροφής/αλλαγής. Ελάχιστος κόπος (μια παραγόμενη ημερομηνία + reuse του υπάρχοντος
  `runAlertChecks`/notifiers), άμεσα χειροπιαστό όφελος, ταιριάζει στο ελληνικό/EU κοινό.
- **Module:** Receipts / Items (+ Notifications, Calendar feed αν γίνει το P6).
- **Απόφαση που χρειάζεται:** default return-window (14 μέρες EU) global ή per-store editable; να
  εμφανίζεται και ως badge «5 μέρες για επιστροφή» στην κάρτα απόδειξης;

### P11. Email-in auto-import — self-hosted IMAP receipt inbox — M — both (ψηλό value/effort)
- **Αξία:** το μεγαλύτερο long-term value σε ένα receipt hub είναι η **συνεχής** αυτόματη σύλληψη,
  όχι το one-off Gmail Takeout που έγινε ήδη. Ο χρήστης βάζει IMAP creds (ή ένα dedicated
  forwarding address) → background poller τραβά νέα emails με συνημμένα/receipt bodies → περνά από
  το ΥΠΑΡΧΟΝ pipeline (attachment/html→text→AI parse→dedupe→draft receipt). Μετατρέπει το Pharos
  από «μια φορά σκάναρα το αρχείο μου» σε «κάθε νέα απόδειξη μπαίνει μόνη της». Καθαρό OSS win για
  self-host· στο SaaS γίνεται managed inbox (συμπληρώνει, ΔΕΝ διπλασιάζει το TODO §13 που είναι
  chat-bot/webhook ingest με per-message metering — εδώ είναι mailbox polling).
- **Module:** Receipts (+ νέος `lib/imap.ts` poller / cron, reuse email-inbox import που υπάρχει).
- **Απόφαση που χρειάζεται:** IMAP polling (κρατά creds) ή μόνο forward-to-address (πιο ασφαλές, χωρίς
  credentials); πόσο συχνά poll; στο SaaS metered ανά AI-parse ή free ingest + metered parse;

### P12. Savings / financial goals (στόχοι, όχι όρια) — S/M — both
- **Αξία:** τα budgets είναι **όρια δαπάνης** ανά κατηγορία/μήνα· λείπει η θετική πλευρά — **στόχοι**
  («μάζεψε €2.000 για το sailing trip μέχρι Σεπ», «€500 για νέο GPU»). Ένα `Goal` model (target
  ποσό + προθεσμία + optional linked category/manual contributions) + progress ring + «είσαι στον
  ρυθμό / χρειάζεσαι €X/μήνα». Κλασικό sticky personal-finance feature που δίνει λόγο να μπαίνεις
  τακτικά. Reuse του reports aggregation + calendar deadline pattern.
- **Module:** Reports (νέα «Goals» ενότητα) + Homepage card.
- **Απόφαση που χρειάζεται:** τα goals τρέφονται αυτόματα από κατηγορία/income series ή μόνο manual
  contributions; ένα ή πολλά ταυτόχρονα goals;

### P13. Home-inventory insurance export bundle — M — both (OSS differentiator)
- **Αξία:** το inventory (τι κατέχεις) + οι αποδείξεις + οι φωτο + οι εγγυήσεις είναι ήδη εκεί.
  Ένα «Insurance / proof-of-ownership export» παράγει PDF/ZIP με λίστα assets (κατηγορία, αξία,
  serial, ημ. αγοράς) + συνημμένες αποδείξεις/φωτο + σύνολο ασφαλιστέας αξίας. Χρήσιμο για
  ασφάλιση κατοικίας ή δήλωση απώλειας/κλοπής — δίνει στο «personal hub» έναν λόγο ύπαρξης πέρα
  από finance tracking. **Διακριτό από το P8** (P8 = tax-deductible έξοδα· εδώ = τεκμηρίωση
  περιουσιακών στοιχείων). Reuse του CSV/backup export machinery + PDF gen.
- **Module:** Items/Inventory (+ Reports/Settings για το export).
- **Απόφαση που χρειάζεται:** αξία = purchasedPrice ή currentPrice (αγοραστική vs τρέχουσα); PDF, ZIP
  με αρχεία, ή και τα δύο; να μπει behind paid tier στο SaaS ή παντού;

### P14. Subscription / bill price-hike watch (ανατιμήσεις επαναλαμβανόμενων) — S — both (πολύ ψηλό value/effort)
- **Αξία:** όταν μια συνδρομή ή επαναλαμβανόμενος λογαριασμός **ανεβαίνει** σε σχέση με το δικό του
  ιστορικό (Netflix €13→€15, ΔΕΗ +18%, cloud plan +€3), ένα alert «η X ανέβηκε €Y (+Z%) από τον
  προηγούμενο κύκλο» πιάνει τις σιωπηλές ανατιμήσεις που κανείς δεν προσέχει. Reuse σχεδόν ολόκληρο:
  vendorKey-series + anomaly logic + `runAlertChecks`/`dispatchAlert` (§3 done). Μικρότερος κόπος από
  τα P3/P7, πιο στοχευμένο. **Διακριτό:** P7 βρίσκει *untracked* σειρές, P3 είναι πλήρες digest — εδώ
  είναι ένα και μόνο event («ανέβηκε») πάνω σε ήδη tracked recurring.
- **Module:** Subscriptions + Expenses/Statements (+ Notifications).
- **Απόφαση που χρειάζεται:** κατώφλι alert (π.χ. ≥5% ή ≥€1); να πιάνει και *μειώσεις* («έπεσε, ίσως λάθος χρέωση»);

### P15. Vendor→category auto-rules (ντετερμινιστικοί κανόνες κατηγοριοποίησης) — S/M — both (πολύ ψηλό value/effort)
- **Αξία:** η #1 τριβή μετά το data-entry είναι το χειροκίνητο categorisation. Ένας απλός rules engine
  «αν vendor/description περιέχει X → category Y (+ optional tax flag / recurring)» εφαρμόζεται αυτόματα
  σε κάθε νέο έξοδο/απόδειξη/transaction. **Ντετερμινιστικό, μηδέν AI κόστος** (δουλεύει και offline, και
  δωρεάν σε όλα τα SaaS tiers), σε αντίθεση με το AI auto-categorise του P2. «Learn from this» κουμπί:
  όταν ο χρήστης αλλάζει κατηγορία χειροκίνητα → προτείνει να φτιάξει κανόνα για τον vendor. Reuse
  vendorKey normalization.
- **Module:** Expenses/Receipts/Statements (+ Settings για τη διαχείριση κανόνων).
- **Απόφαση που χρειάζεται:** matching σε vendorKey (κανονικοποιημένο) ή raw text/regex; οι κανόνες να
  τρέχουν και αναδρομικά σε υπάρχοντα uncategorised ή μόνο forward;

### P16. Migration importers από άλλα finance/self-host apps (Firefly III / YNAB / Grocy) — M — OSS (adoption lever)
- **Αξία:** ο πιο άμεσος τρόπος να αποκτήσει χρήστες ένα OSS finance/inventory app είναι να **δεχτεί το
  export ενός ανταγωνιστή**. Ένας importer για Firefly III (JSON/CSV export), YNAB (CSV) και προαιρετικά
  Grocy (inventory) χαρτογραφεί accounts/transactions/categories → Pharos expenses/income + items. Μειώνει
  δραστικά το switching cost. **Διακριτό από το P2** (P2 = γενικό bank CSV· εδώ = structured app-specific
  migration με mapping presets). Reuse του CSV parse machinery + upsert-by dedupe.
- **Module:** Settings → Data (νέο «Import from another app») + Expenses/Items.
- **Απόφαση που χρειάζεται:** ποιες πηγές πρώτα (πρόταση: Firefly III + YNAB, τα πιο διαδεδομένα self-host/
  budgeting); να φέρνει και ιστορικά balances ή μόνο transactions;

### P17. Mobile barcode/QR scan → γρήγορη προσθήκη στο inventory — M — both (mobile-native)
- **Αξία:** το mobile app σκανάρει σήμερα αποδείξεις (φωτο). Ένα barcode/QR scan (EAN/UPC) της
  συσκευασίας ενός προϊόντος → lookup (open product DB ή AI) → prefill τίτλου/κατηγορίας/specs → one-tap
  add στο inventory ή στο shopping. Κάνει την καταγραφή περιουσίας/λίστας αγορών στιγμιαία σε κινητό,
  εκεί που πραγματικά χρησιμοποιείται το app (σπίτι/κατάστημα). Native mobile win, όχι απλό parity με το web.
- **Module:** Mobile (νέα camera-scan ροή) + Items/Inventory (+ REST `/api/v1` §5, product-lookup helper).
- **Απόφαση που χρειάζεται:** πηγή lookup (δωρεάν Open Food Facts / UPC DB, ή AI-only χωρίς εξωτερικό API);
  εξαρτάται από το mobile MVP (§6 TODO) — companion feature, όχι blocker;

---

## Approved

_(κενό — ο Αχιλλέας μετακινεί εδώ ό,τι εγκρίνει· οι builders τραβάνε από εδώ)_

---

## Done

_(κενό)_

---

## Rejected

_(κενό)_
