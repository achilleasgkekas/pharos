# PHAROS — Product Backlog (προτάσεις προϊόντος)

> Ρόλος: ο **product-planner** ΠΡΟΤΕΙΝΕΙ candidate features, ο Αχιλλέας ΑΠΟΦΑΣΙΖΕΙ.
> Αυτό συμπληρώνει (δεν αντικαθιστά) το `TODO.md` (distribution/SaaS roadmap) και τις
> ουρές τεχνικού χρέους (`WEB_DEBT.md`, `MOBILE_PARITY.md`), που καλύπτουν code debt, όχι νέα features.
> **Τίποτα στο «Proposed» δεν χτίζεται μέχρι ο Αχιλλέας να το μετακινήσει στο «Approved».**
> Οι builder routines τραβάνε ΜΟΝΟ από το «Approved». Το split OSS vs paid είναι δική του απόφαση.
> Σύμβολα μεγέθους: S (μικρό) · M (μεσαίο) · L (μεγάλο). Track: OSS / SaaS / both.
> Τελευταία ενημέρωση: 2026-07-09 (6η σάρωση planner).
> **⚑ ΜΑΖΙΚΗ ΕΓΚΡΙΣΗ 2026-07-09 (Αχιλλέας, interactive):** «τα εγκρίνω όλα» → **ΟΛΑ** τα Proposed
> (P1, P3, P5-P26) μετακινήθηκαν στο «Approved», μαζί με τα ήδη-εγκεκριμένα PA1/PA2/PA3. Το «Proposed»
> είναι πλέον κενό· ο planner θα προσθέτει νέους candidates σε επόμενα runs.

---

## Proposed (awaiting Αχιλλέας)

_(κενό — όλα εγκρίθηκαν 2026-07-09· ο planner προσθέτει νέους candidates σε επόμενες σαρώσεις)_

---

## Approved

> Οι builder/daily-dev routines χτίζουν ΜΟΝΟ από εδώ — **ένα item ανά run**, verify-pre-build πρώτα,
> με τη σειρά value/effort (τα «πολύ ψηλό value/effort» πρώτα). **Κανόνας ανοιχτών αποφάσεων:** όπου
> ένα item έχει «Απόφαση που χρειάζεται» και ο Αχιλλέας ΔΕΝ την έλυσε ρητά (μόνο τα PA1/PA2/PA3 έχουν
> locked defaults), ο builder παίρνει **sensible default**: (α) free-tier behaviour **non-metered**,
> heavy/AI/SaaS-touching κομμάτια **opt-in**· (β) reuse υπάρχοντος pipeline/pattern· (γ) ξεκίνα από το
> πιο απλό MVP (heuristic/deterministic πριν AI, single πριν multi). Κατέγραψε την επιλογή στο progress log.
> Εξαρτήσεις: P5/P17/P23 δένουν με `/api/v1` (§5) + mobile MVP (§6)· P6 feed βοηθά το PA3/P20.

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

### P22. Full-text search πάνω σε receipt line-items & parsed text — S/M — both (πολύ ψηλό value/effort)
- **Αξία:** το global search (`searchAll`) ψάχνει σήμερα δομημένα πεδία (store/vendor/notes/τίτλους),
  αλλά ΟΧΙ το περιεχόμενο των αποδείξεων — τα ονόματα των line items ή το raw parsed κείμενο. Επέκταση
  του search index ώστε να καλύπτει line-item names (+ optionally raw AI text) κλείνει το πιο συχνό
  «πού το αγόρασα αυτό;». Reuse σχεδόν όλο το υπάρχον search machinery· μόνο επέκταση projection + matcher.
- **Module:** Search (+ Receipts data shape).
- **Ανοιχτή απόφαση (builder default):** ξεκίνα με substring match (δωρεάν, μηδέν migration)· Mongo `$text`
  index μόνο αν χρειαστεί performance· default = line-item names, όχι raw AI text (λιγότερο noise/privacy).

### P24. Outbound event webhooks / automation hooks (Home Assistant / n8n) — M — both (OSS self-host lever)
- **Αξία:** το §3 notifier framework στέλνει *alert μηνύματα*. Λείπει το generic **event webhook**:
  «όταν συμβεί X (νέα απόδειξη parsed, budget ξεπεράστηκε, δόση λήγει, τιμή έπεσε) → POST structured JSON».
  Ξεκλειδώνει automation για το self-host/homelab κοινό (Home Assistant, n8n, Node-RED). Reuse των event
  trigger points που ήδη υπάρχουν (`runAlertChecks`/verify/import hooks).
- **Module:** Settings → Integrations (νέο «Webhooks») + event dispatch points.
- **Ανοιχτή απόφαση (builder default):** πρώτα events = receipt.parsed, budget.exceeded, installment.due,
  price.drop· HMAC signature ON· free & rate-limited στο SaaS.

### P23. Mobile share-sheet quick capture (share-to-Pharos) — M — both (mobile-native, ψηλό value/effort)
- **Αξία:** από ΟΠΟΙΑΔΗΠΟΤΕ app (Photos, Files, browser, email PDF) → «Share → Pharos» → η φωτο/PDF μπαίνει
  κατευθείαν στο υπάρχον receipt/expense AI pipeline. Μηδενίζει την τριβή του capture. **Διακριτό** από
  P5 (desktop browser ext) και P17 (barcode). OS-level share target (iOS Share Extension / Android intent).
- **Module:** Mobile (share extension/intent) + Receipts/Expenses (reuse upload+parse μέσω `/api/v1`).
- **Εξάρτηση:** mobile MVP (§6) + `/api/v1` upload endpoint. **Builder default:** shared αρχείο → receipts,
  με optional picker αργότερα.

### P14. Subscription / bill price-hike watch (ανατιμήσεις επαναλαμβανόμενων) — S — both (πολύ ψηλό value/effort)
- **Αξία:** όταν μια συνδρομή/λογαριασμός **ανεβαίνει** vs το ιστορικό του (Netflix €13→€15, ΔΕΗ +18%),
  alert «η X ανέβηκε €Y (+Z%) από τον προηγούμενο κύκλο». Reuse σχεδόν όλο: vendorKey-series + anomaly +
  `runAlertChecks`/`dispatchAlert`. **Διακριτό:** P7 = *untracked* σειρές, P3 = πλήρες digest· εδώ ένα event.
- **Module:** Subscriptions + Expenses/Statements (+ Notifications).
- **Ανοιχτή απόφαση (builder default):** κατώφλι ≥5% ή ≥€1· να πιάνει και μειώσεις («ίσως λάθος χρέωση»).

### P15. Vendor→category auto-rules (ντετερμινιστικοί κανόνες κατηγοριοποίησης) — S/M — both (πολύ ψηλό value/effort)
- **Αξία:** rules engine «αν vendor/description περιέχει X → category Y (+ optional tax flag / recurring)»
  αυτόματα σε κάθε νέο έξοδο/απόδειξη/transaction. **Ντετερμινιστικό, μηδέν AI κόστος** (offline, δωρεάν παντού).
  «Learn from this» όταν ο χρήστης αλλάζει κατηγορία → προτείνει κανόνα. Reuse vendorKey normalization.
- **Module:** Expenses/Receipts/Statements (+ Settings για τη διαχείριση κανόνων).
- **Ανοιχτή απόφαση (builder default):** match σε vendorKey (κανονικοποιημένο) πρώτα, raw/regex advanced·
  κανόνες forward + optional «apply to existing uncategorised».

### P18. Receipt ↔ statement transaction reconciliation (auto-match) — S/M — both (πολύ ψηλό value/effort)
- **Αξία:** auto-match (κατάστημα/ποσό/ημερομηνία ±μέρες) απόδειξης ↔ statement transaction: «αυτή η €287
  χρέωση = αυτή η απόδειξη» + flag «χρεώσεις χωρίς απόδειξη» / «αποδείξεις χωρίς statement». Πιάνει
  διπλοχρεώσεις. Reuse signature/description-normalization + link machinery· εδώ link-to-receipt.
- **Module:** Statements + Receipts (νέο `matchedReceiptId` + reconciliation view).
- **Ανοιχτή απόφαση (builder default):** auto-suggest **με confirm** (όχι silent auto-link)· ανοχή ±3 μέρες.

### P19. «Safe-to-spend» forward cashflow (τι μένει, όχι τι ξόδεψες) — S/M — both (ψηλό value/effort)
- **Αξία:** «αυτόν τον μήνα έχεις €X income − €Y γνωστές μελλοντικές χρεώσεις = €Z διαθέσιμα» + mini προβολή
  30/60/90 ημερών. Ο υπολογισμός μελλοντικών events **υπάρχει ήδη** στο `/calendar` — εδώ αθροίζεται σε ένα
  actionable αριθμό. **Διακριτό** από PA2 (net-worth = στοκ) και P12 (goals = αποταμίευση).
- **Module:** Reports + Homepage card (reuse calendar projection).
- **Ανοιχτή απόφαση (builder default):** income = tracked recurring + optional manual «expected income»·
  ξεκίνα αφαιρώντας μόνο σταθερές γνωστές χρεώσεις (variable median = phase 2).

### P6. iCal (.ics) subscription feed για Calendar — S — both (πολύ ψηλό value/effort)
- **Αξία:** read-only `.ics` feed URL (token-scoped) → subscribe από Google/Apple/Outlook Calendar· όλα τα
  οικονομικά deadlines δίπλα στο κανονικό ημερολόγιο. Ο υπολογισμός events υπάρχει· μένει VCALENDAR + route.
- **Module:** Calendar (+ auth token, reuse `User.apiToken` scope).
- **Ανοιχτή απόφαση (builder default):** ένα ενιαίο feed (με category prefix ανά event)· expiries = all-day.

### P7. Auto-discovery επαναλαμβανόμενων χρεώσεων (untracked subscriptions/bills) — S/M — both
- **Αξία:** σαρώνει expenses + statement transactions ανά `vendorKey` και εντοπίζει σειρές που «μοιάζουν»
  με συνδρομή αλλά δεν είναι tracked → «Βρήκα 3 πιθανές συνδρομές: Netflix €15/μήνα…» με one-click «track».
- **Module:** Subscriptions + Expenses/Statements.
- **Ανοιχτή απόφαση (builder default):** **heuristic-only** (μηδέν AI, δωρεάν)· κατώφλι ≥3 εμφανίσεις, ±5 μέρες.

### P12. Savings / financial goals (στόχοι, όχι όρια) — S/M — both
- **Αξία:** πέρα από τα budgets (όρια), **στόχοι** («μάζεψε €2.000 μέχρι Σεπ»). `Goal` model (target + προθεσμία
  + optional linked category/manual contributions) + progress ring + «χρειάζεσαι €X/μήνα». Reuse reports + calendar.
- **Module:** Reports (νέα «Goals» ενότητα) + Homepage card.
- **Ανοιχτή απόφαση (builder default):** πολλά ταυτόχρονα goals· manual contributions πρώτα, auto-feed από κατηγορία phase 2.

### P25. Budget rollover / envelope mode (μεταφορά αδιάθετου υπολοίπου) — S/M — both
- **Αξία:** optional **rollover** (envelope method): το αδιάθετο υπόλοιπο του μήνα προστίθεται στο επόμενο.
  Πιο ρεαλιστικό για ανομοιόμορφα έξοδα (δίμηνοι ΟΤΕ/ΔΕΗ). Reuse budgets + reports aggregation.
- **Module:** Budgets (Settings) + Reports «Budget · this month».
- **Ανοιχτή απόφαση (builder default):** rollover **per-category opt-in**· μεταφορά θετικών υπολοίπων (negative rollover = opt-in).

### P13. Home-inventory insurance export bundle — M — both (OSS differentiator)
- **Αξία:** «Insurance / proof-of-ownership export» = PDF/ZIP με λίστα assets (κατηγορία, αξία, serial, ημ.
  αγοράς) + συνημμένες αποδείξεις/φωτο + σύνολο ασφαλιστέας αξίας. **Διακριτό από P8** (P8 = tax-deductible).
- **Module:** Items/Inventory (+ Reports/Settings για το export).
- **Ανοιχτή απόφαση (builder default):** αξία = currentPrice (fallback purchasedPrice)· PDF + optional ZIP· παντού (OSS).

### P8. Tax / deductible tagging + year-end export bundle — M — both (SaaS = premium)
- **Αξία:** flag «tax-deductible» (+ optional tax category) → year-end «Tax export» = σύνοψη ανά κατηγορία +
  ZIP με συνημμένα. Paid-tier differentiator· βασικό tagging OSS.
- **Module:** Expenses/Receipts (+ Reports/Settings για το export).
- **Ανοιχτή απόφαση (builder default):** free-form tags + optional preset (GR)· tagging παντού, ZIP-με-αρχεία = paid στο SaaS.

### P16. Migration importers από άλλα finance/self-host apps (Firefly III / YNAB / Grocy) — M — OSS (adoption lever)
- **Αξία:** δέξου export ανταγωνιστή → μειώνει switching cost. Importer για Firefly III (JSON/CSV), YNAB (CSV),
  optional Grocy. **Διακριτό από PA1** (γενικό bank CSV· εδώ app-specific με mapping presets).
- **Module:** Settings → Data (νέο «Import from another app») + Expenses/Items.
- **Ανοιχτή απόφαση (builder default):** πρώτα Firefly III + YNAB· transactions + categories (balances phase 2).

### P11. Email-in auto-import — self-hosted IMAP receipt inbox — M — both (ψηλό value/effort)
- **Αξία:** συνεχής αυτόματη σύλληψη: IMAP creds (ή forwarding address) → poller → υπάρχον pipeline
  (attachment/html→text→AI parse→dedupe→draft). «Κάθε νέα απόδειξη μπαίνει μόνη της». Συμπληρώνει το TODO §13.
- **Module:** Receipts (+ νέος `lib/imap.ts` poller / cron, reuse email-inbox import).
- **Ανοιχτή απόφαση (builder default):** IMAP polling (κρατά creds, self-host) πρώτα· poll ανά 15-30′· ingest free, parse metered στο SaaS.

### P17. Mobile barcode/QR scan → γρήγορη προσθήκη στο inventory — M — both (mobile-native)
- **Αξία:** barcode/QR scan (EAN/UPC) → lookup → prefill τίτλου/κατηγορίας/specs → one-tap add σε inventory/shopping.
- **Module:** Mobile (camera-scan) + Items/Inventory (+ `/api/v1` §5, product-lookup helper).
- **Εξάρτηση:** mobile MVP (§6). **Builder default:** lookup = δωρεάν Open Food Facts / UPC DB, AI fallback.

### P20. Loyalty / membership card wallet (barcode display στο checkout) — S/M — both (mobile-native)
- **Αξία:** αποθήκευση καρτών μέλους (super market/καύσιμα/φαρμακείο) με αριθμό + barcode/QR· mobile tap →
  fullscreen barcode (max brightness) για το ταμείο. **Διακριτό** από Vouchers (coupons) και P17 (scan-to-add).
- **Module:** νέο μικρό module «Cards/Wallet» (ή tab στα Vouchers) + Mobile barcode render.
- **Ανοιχτή απόφαση (builder default):** tab μέσα στα Vouchers πρώτα· client-side barcode render (μικρή lib, OSS-ok).

### P21. Document / manual vault στα inventory items — S/M — OSS (κυρίως) (personal-hub differentiator)
- **Αξία:** attachments slot ανά item (manuals PDF, warranty certs, serial φωτο, service τιμολόγια). Reuse
  storage/upload/thumbnail pipeline. **Διακριτό** από P13 (export bundle) — εδώ ongoing αποθετήριο ανά είδος.
- **Module:** Items/Inventory (νέο `attachments[]`, reuse storage backends + `/api/files`).
- **Ανοιχτή απόφαση (builder default):** manual upload πρώτα (AI/web-search auto-fetch phase 2)· quota per-item στο SaaS.

### P5. Browser extension / bookmarklet — quick capture — M — both
- **Αξία:** από e-shop, ένα κλικ → «add to Pharos shopping» (reuse `importItemFromUrl`). Καταναλώνει `/api/v1`.
- **Module:** Items / Shopping (+ REST API).
- **Εξάρτηση:** `/api/v1` (§5). **Builder default:** απλό bookmarklet πρώτα, MV3 extension phase 2.

### P3. AI «Month in Review» digest — M — both (SaaS = metered)
- **Αξία:** αφηγηματική σύνοψη μήνα («ξόδεψες €X, +12%, top κατηγορία, 2 ασυνήθιστες χρεώσεις, 3 εγγυήσεις
  λήγουν») μέσω notification framework (§3) + in-app card. Δομικά στοιχεία υπάρχουν (anomaly, aggregations,
  get_overview). Monetizable (ανά-digest AI metering).
- **Module:** Reports + Notifications (+ AI).
- **Ανοιχτή απόφαση (builder default):** auto-schedule 1η κάθε μήνα· on-demand button· free-tier περιορισμένο, paid = full.

### P1. Demo / sample-data mode σε fresh install — S — OSS (κυρίως), both
- **Αξία:** «Load sample data» / «Clear sample data» γεμίζει items/receipts/expenses/subscriptions με ρεαλιστικά
  demo δεδομένα → νέος self-host βλέπει αμέσως τι κάνει το app. Adoption multiplier.
- **Module:** cross-cutting (Settings → Data, ή setup wizard).
- **Ανοιχτή απόφαση (builder default):** locale-aware demo data· optional βήμα στο setup wizard.

### P26. In-app onboarding checklist / getting-started guide — S — OSS (adoption lever)
- **Αξία:** dismissable «getting started» card (connect storage, add first receipt, set budget, add card,
  enable notifications) με progress ticks → activation. **Διακριτό** από P1 (demo data) — εδώ τα *δικά του* δεδομένα.
- **Module:** Homepage / Dashboard (dismissable card) + Settings state reads.
- **Ανοιχτή απόφαση (builder default):** 5 βήματα· collapsible μετά την ολοκλήρωση· δείχνεται σε self-host + SaaS onboarding.

### P9. Multi-currency (per-transaction currency + FX conversion) — L — both
- **Αξία:** ανά-συναλλαγή currency + FX rate (snapshot τη μέρα) + reporting σε base currency. Πραγματικό κενό
  (CLAUDE.md). Μεγάλο: αγγίζει schema (amount+currency+rate), aggregations, imports, όλα τα money views.
- **Module:** cross-cutting (Expenses/Receipts/Statements/Reports + `lib/money.ts`).
- **Ανοιχτή απόφαση (builder default):** **opt-in ανά deployment** (μη βαρύνει single-currency χρήστες)· FX =
  on-import capture + manual override (δωρεάν API phase 2). ΣΗΜ: L — άφησέ το τελευταίο (μεγαλύτερο ρίσκο/κόπος).

---

## Done

_(κενό)_

---

## Rejected

_(κενό)_
