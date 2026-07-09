# PHAROS — Product Backlog (προτάσεις προϊόντος)

> Ρόλος: ο **product-planner** ΠΡΟΤΕΙΝΕΙ candidate features, ο Αχιλλέας ΑΠΟΦΑΣΙΖΕΙ.
> Αυτό συμπληρώνει (δεν αντικαθιστά) το `TODO.md` (distribution/SaaS roadmap) και τις
> ουρές τεχνικού χρέους (`WEB_DEBT.md`, `MOBILE_PARITY.md`), που καλύπτουν code debt, όχι νέα features.
> **Τίποτα στο «Proposed» δεν χτίζεται μέχρι ο Αχιλλέας να το μετακινήσει στο «Approved».**
> Οι builder routines τραβάνε ΜΟΝΟ από το «Approved». Το split OSS vs paid είναι δική του απόφαση.
> Σύμβολα μεγέθους: S (μικρό) · M (μεσαίο) · L (μεγάλο). Track: OSS / SaaS / both.
> Τελευταία ενημέρωση: 2026-07-09 (6η σάρωση planner· +5 candidates P22-P26). Τα **P2/P4/P10**
> εγκρίθηκαν (2026-07-07) → μετακινήθηκαν στο «Approved» (PA1/PA2/PA3). Τα υπόλοιπα P1, P3, P5-P21
> παραμένουν Proposed· κανένα δεν χτίστηκε ακόμα (τα commits ήταν SaaS/billing/landing/mobile-parity/
> docs/API/tests, μηδέν νέο product feature από την ουρά αυτή) → όλα ισχύουν.

---

## Proposed (awaiting Αχιλλέας)

Ranked by value/effort (πρώτο = καλύτερη σχέση αξίας προς κόπο). ΣΗΜ: η αρίθμηση P# είναι
απλό id (σειρά προσθήκης), όχι σειρά προτεραιότητας — το value/effort standing γράφεται σε κάθε item.
Από τα νέα, τα **P10 και P11 είναι από τα υψηλότερα value/effort όλης της λίστας**.

> **ΜΕΤΑΚΙΝΗΘΗΚΑΝ στο `## Approved` (2026-07-07, Αχιλλέας):** **P2** (bank/CSV import), **P4**
> (net-worth time-series), **P10** (return-window/warranty tracker) → PA1/PA2/PA3. Παραμένουν
> εδώ οι περιγραφές τους ως αναφορά· ο planner ΔΕΝ τα ξαναπροτείνει, ο builder τα χτίζει από Approved.

### P22. Full-text search πάνω σε receipt line-items & parsed text — S/M — both (πολύ ψηλό value/effort)
- **Αξία:** το global search (`searchAll`) ψάχνει σήμερα δομημένα πεδία (store/vendor/notes/τίτλους),
  αλλά ΟΧΙ το περιεχόμενο των αποδείξεων — τα ονόματα των line items ή το raw parsed κείμενο. Ο χρήστης
  δεν μπορεί να βρει «ποια απόδειξη είχε το HDMI καλώδιο / το serial number X». Επέκταση του search index
  ώστε να καλύπτει line-item names (+ optionally raw AI text) κλείνει το πιο συχνό «πού το αγόρασα αυτό;».
  Reuse σχεδόν όλο το υπάρχον search machinery· μόνο επέκταση projection + matcher (+ ίσως Mongo text index
  για performance σε μεγάλα datasets).
- **Module:** Search (+ Receipts data shape).
- **Απόφαση που χρειάζεται:** substring match (απλό, δωρεάν) ή Mongo `$text` index (ταχύτερο, θέλει index
  migration); να μπει και το raw AI-parsed text ή μόνο τα καθαρά line-item names (privacy/noise trade-off);

### P23. Mobile share-sheet quick capture (share-to-Pharos) — M — both (mobile-native, ψηλό value/effort)
- **Αξία:** το πιο φυσικό mobile-native capture: από ΟΠΟΙΑΔΗΠΟΤΕ app (Photos, Files, browser, email PDF)
  → «Share → Pharos» → η φωτο/PDF μπαίνει κατευθείαν στο υπάρχον receipt/expense AI pipeline. Μηδενίζει
  την τριβή («άνοιξε app → camera → …») που είναι ο #1 λόγος εγκατάλειψης των receipt apps. **Διακριτό**
  από το P5 (browser extension, desktop) και το P17 (barcode scan) — εδώ είναι OS-level share target
  (iOS Share Extension / Android intent filter). Companion του mobile MVP (§6), όχι blocker.
- **Module:** Mobile (share extension/intent) + Receipts/Expenses (reuse upload+parse μέσω `/api/v1`).
- **Απόφαση που χρειάζεται:** το shared αρχείο πάει πάντα σε «receipts» ή picker (receipt/expense/item);
  εξαρτάται από το mobile MVP (§6) + `/api/v1` upload endpoint — companion, μετά το MVP;

### P24. Outbound event webhooks / automation hooks (Home Assistant / n8n) — M — both (OSS self-host lever)
- **Αξία:** το §3 notifier framework στέλνει *alert μηνύματα* (ntfy/Discord/…). Λείπει το generic
  **event webhook**: «όταν συμβεί X (νέα απόδειξη parsed, budget ξεπεράστηκε, δόση λήγει, τιμή έπεσε) →
  POST structured JSON σε ένα URL». Ξεκλειδώνει automation για το self-host/homelab κοινό (Home Assistant,
  n8n, Node-RED) που είναι ακριβώς το target audience του OSS track. **Διακριτό** από τους notifiers
  (= human-readable ειδοποιήσεις) — εδώ machine-readable events για integration. Reuse των event trigger
  points που ήδη υπάρχουν (`runAlertChecks`/verify/import hooks).
- **Module:** Settings → Integrations (νέο «Webhooks») + event dispatch points.
- **Απόφαση που χρειάζεται:** ποια events στην πρώτη έκδοση (πρόταση: receipt.parsed, budget.exceeded,
  installment.due, price.drop); HMAC signature για verification; στο SaaS metered/rate-limited ή free;

### P25. Budget rollover / envelope mode (μεταφορά αδιάθετου υπολοίπου) — S/M — both
- **Αξία:** τα budgets είναι σήμερα σκληρά μηνιαία όρια ανά κατηγορία — ό,τι δεν ξοδεύτηκε «χάνεται».
  Ένα optional **rollover** (envelope method, δημοφιλές από YNAB): το αδιάθετο υπόλοιπο του μήνα προστίθεται
  στο budget του επόμενου (ή το overspend μειώνει τον επόμενο). Δίνει πιο ρεαλιστική εικόνα για ανομοιόμορφα
  έξοδα (π.χ. δίμηνοι λογαριασμοί ΟΤΕ/ΔΕΗ). Reuse του υπάρχοντος budgets + reports aggregation· κυρίως
  λογική carry-forward + ένα flag ανά κατηγορία.
- **Module:** Budgets (Settings) + Reports «Budget · this month».
- **Απόφαση που χρειάζεται:** rollover per-category opt-in ή global toggle; να μεταφέρεται και το overspend
  (negative rollover) ή μόνο θετικά υπόλοιπα;

### P26. In-app onboarding checklist / getting-started guide — S — OSS (adoption lever)
- **Αξία:** μετά το πρώτο login ένας self-hoster δεν ξέρει από πού να αρχίσει. Ένα dismissable
  «getting started» card (connect storage backend, add first receipt, set a budget, add payment card,
  enable notifications) με progress ticks καθοδηγεί στο activation και δείχνει το εύρος του app. **Διακριτό**
  από το P1 (demo data = γεμίζει με δείγματα) — εδώ καθοδηγεί τον χρήστη να βάλει *τα δικά του* δεδομένα.
  Χαμηλός κόπος (static checklist + derived «done?» flags από existing state), μεγάλο activation win για OSS.
- **Module:** Homepage / Dashboard (νέο dismissable card) + Settings state reads.
- **Απόφαση που χρειάζεται:** πόσα βήματα (πρόταση: 5)· να εξαφανίζεται μόνιμα όταν ολοκληρωθούν όλα ή να
  μένει collapsible· να δείχνεται και σε SaaS onboarding ή μόνο self-host;

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

### P18. Receipt ↔ statement transaction reconciliation (auto-match) — S/M — both (πολύ ψηλό value/effort)
- **Αξία:** το app έχει ΚΑΙ τις αποδείξεις ΚΑΙ τις χρεώσεις καρτών, αλλά ζουν χωριστά. Ένα auto-match
  (κατάστημα/ποσό/ημερομηνία ±μέρες) που συνδέει μια απόδειξη με τη συναλλαγή του statement κλείνει τον
  κύκλο: «αυτή η €287 χρέωση ΚΩΤΣΟΒΟΛΟΣ = αυτή η απόδειξη» + flag «χρεώσεις χωρίς απόδειξη» και
  «αποδείξεις που δεν βρέθηκαν σε statement». Πιάνει διπλοχρεώσεις/λάθος χρεώσεις και δίνει πλήρη
  εικόνα ανά αγορά. Reuse σχεδόν όλο: το statement έχει ήδη signature/description-normalization + το
  υπάρχον link-to-item machinery· εδώ γίνεται link-to-receipt. **Διακριτό** από το installment↔item
  linking (εκεί συνδέεις προϊόν, εδώ την ίδια την απόδειξη-πηγή).
- **Module:** Statements + Receipts (νέο `matchedReceiptId` + reconciliation view).
- **Απόφαση που χρειάζεται:** auto-suggest με confirm (πρόταση) ή auto-link πάνω από confidence threshold;
  ανοχή ημερομηνίας (χρέωση συχνά 1-3 μέρες μετά την αγορά);

### P19. «Safe-to-spend» forward cashflow (τι μένει, όχι τι ξόδεψες) — S/M — both (ψηλό value/effort)
- **Αξία:** όλα τα σημερινά money views κοιτούν **πίσω** (Reports) ή λιστάρουν events (Calendar). Λείπει
  το μπροστινό: «αυτόν τον μήνα έχεις €X income − €Y γνωστές μελλοντικές χρεώσεις (δόσεις + recurring
  bills + subscriptions) = €Z διαθέσιμα». Ένα single «safe-to-spend» νούμερο + mini προβολή επόμενων
  30/60/90 ημερών. Ο υπολογισμός των μελλοντικών events **υπάρχει ήδη** στο `/calendar` (projected
  recurring + installments/renewals) — εδώ αθροίζεται σε ένα actionable αριθμό στο homepage/reports.
  Κλασικό «γιατί μπαίνω κάθε μέρα» feature. **Διακριτό** από P4 (net-worth = στοκ περιουσίας) και P12
  (goals = αποταμίευση) — εδώ είναι ρευστότητα/discretionary του τρέχοντος κύκλου.
- **Module:** Reports + Homepage card (reuse calendar projection).
- **Απόφαση που χρειάζεται:** «income» = μόνο tracked recurring income ή και manual «expected income»;
  να αφαιρεί και το μέσο μεταβλητό ξόδεμα (median κατηγοριών) ή μόνο τις σταθερές γνωστές χρεώσεις;

### P20. Loyalty / membership card wallet (barcode display στο checkout) — S/M — both (mobile-native)
- **Αξία:** φυσικό συμπλήρωμα των Vouchers: αποθήκευση καρτών μέλους/επιβράβευσης (super market, καύσιμα,
  φαρμακείο) με αριθμό + barcode/QR. Στο κινητό, ένα tap δείχνει το barcode fullscreen (max brightness)
  να το σκανάρει το ταμείο — τέλος το φυσικό πορτοφόλι γεμάτο κάρτες. **Διακριτό από τα Vouchers** (=
  εκπτωτικά coupons/codes με λήξη) και από το P17 (= scan-to-add-inventory). Καθαρά χρήσιμο, μικρό
  schema, δίνει στο «hub» έναν λόγο να το ανοίγεις έξω από το σπίτι.
- **Module:** νέο μικρό module «Cards/Wallet» (ή επέκταση Vouchers) + Mobile barcode render.
- **Απόφαση που χρειάζεται:** ξεχωριστό module ή tab μέσα στα Vouchers; client-side barcode render
  (μηδέν εξωτερικό API, μικρή lib) — αποδεκτό στο OSS bundle;

### P21. Document / manual vault στα inventory items — S/M — OSS (κυρίως) (personal-hub differentiator)
- **Αξία:** το inventory κρατά «τι κατέχω» + αποδείξεις (proof of purchase), αλλά όχι τα **έγγραφα** που
  συνοδεύουν ένα asset: εγχειρίδια χρήσης (PDF), πιστοποιητικά εγγύησης, φωτο του serial/σειριακού,
  τιμολόγια service. Ένα attachments slot ανά item (reuse του υπάρχοντος storage/upload/thumbnail
  pipeline) μετατρέπει το «personal hub» σε πραγματικό αρχείο περιουσίας — βρίσκεις το manual του
  φούρνου ή την εγγύηση του laptop σε δευτερόλεπτα. **Διακριτό** από P13 (= export bundle για ασφάλιση,
  παράγει αρχείο) — εδώ είναι το ίδιο το ongoing αποθετήριο εγγράφων ανά είδος.
- **Module:** Items/Inventory (νέο `attachments[]` στο Item, reuse storage backends + `/api/files`).
- **Απόφαση που χρειάζεται:** πόσα/τι μέγεθος ανά item (quota, ειδικά για SaaS storage metering);
  να τραβά αυτόματα το manual μέσω AI/web-search ή μόνο manual upload;

---

## Approved

> **Εγκρίθηκαν από τον Αχιλλέα 2026-07-07** (βλ. `OWNER_DECISIONS.md` #8). Οι builder/daily-dev
> routines χτίζουν ΜΟΝΟ από εδώ, ένα item ανά run, verify-pre-build πρώτα. Οι «Απόφαση που
> χρειάζεται» **λύθηκαν με locked defaults** (χτίσε το MVP)· όπου αγγίζει SaaS metering/storage,
> ο builder κρατά το free-tier behaviour non-metered.

### PA1 ← P2. Bank / generic CSV import για expenses & income — M — both
- Column-mapping UI (date/amount/description → vendor/category) + dedupe κατά το import.
- **Locked default:** AI auto-categorise **ΜΕΤΑ** το import (batch, opt-in), ΟΧΙ inline — ώστε το
  SaaS AI metering να μη σκάει σε κάθε γραμμή import. Reuse EXPENSE pipeline + upsert-by dedupe.
- Owner: **pharos-daily-dev**.

### PA2 ← P4. Net-worth time-series (snapshots + trend) — M — both
- Νέο `Snapshot` model + μηνιαίο cron· assets (inventory value + optional manual accounts) −
  liabilities (installments owed + card balances)· «Net worth» ενότητα στα Reports + γράφημα.
- **Locked defaults:** manual asset accounts **επιτρέπονται** (μετρητά/τραπεζικά χωρίς integration)·
  **forward-only** (χωρίς backfill). Reuse του υπάρχοντος net-position υπολογισμού.
- Owner: **pharos-daily-dev**.

### PA3 ← P10. Return-window & warranty-claim tracker — S — both
- Computed «return by» ανά απόδειξη/είδος (default 14 μέρες EU από purchase date, **per-store
  editable** override) + alert 2-3 μέρες πριν λήξει (reuse `runAlertChecks`/notifiers) + badge
  «N μέρες για επιστροφή» στην κάρτα απόδειξης.
- Owner: **pharos-daily-dev**. Δένει με Calendar feed αν γίνει το P6.

---

## Done

_(κενό)_

---

## Rejected

_(κενό)_
