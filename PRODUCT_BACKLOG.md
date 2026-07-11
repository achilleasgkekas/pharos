# PHAROS — Product Backlog (προτάσεις προϊόντος)

> Ρόλος: ο **product-planner** ΠΡΟΤΕΙΝΕΙ candidate features, ο Αχιλλέας ΑΠΟΦΑΣΙΖΕΙ.
> Αυτό συμπληρώνει (δεν αντικαθιστά) το `TODO.md` (distribution/SaaS roadmap) και τις
> ουρές τεχνικού χρέους (`WEB_DEBT.md`, `MOBILE_PARITY.md`), που καλύπτουν code debt, όχι νέα features.
> **Τίποτα στο «Proposed» δεν χτίζεται μέχρι ο Αχιλλέας να το μετακινήσει στο «Approved».**
> Οι builder routines τραβάνε ΜΟΝΟ από το «Approved». Το split OSS vs paid είναι δική του απόφαση.
> Σύμβολα μεγέθους: S (μικρό) · M (μεσαίο) · L (μεγάλο). Track: OSS / SaaS / both.
> Τελευταία ενημέρωση: 2026-07-10 (8η σάρωση planner).
> **⚑ ΜΑΖΙΚΗ ΕΓΚΡΙΣΗ 2026-07-09 (Αχιλλέας, interactive):** «τα εγκρίνω όλα» → **ΟΛΑ** τα προηγούμενα Proposed
> (P1, P3, P5-P26) μετακινήθηκαν στο «Approved», μαζί με τα ήδη-εγκεκριμένα PA1/PA2/PA3.
> **7η σάρωση (2026-07-09):** PA1 (bank/CSV import) shipped → «Done»· προστέθηκαν 5 νέοι candidates P27-P31.
> **⚑ ΕΓΚΡΙΣΗ 2026-07-09 (Αχιλλέας, interactive):** «μετακίνησέ τα εσύ» → **P27-P31 μετακινήθηκαν στο «Approved»**.
> **8η σάρωση (2026-07-10):** ο builder έστειλε P6 (iCal), P14 (price-hike), P15 (category rules), P27 (suggested
> budgets), P29 (depreciation) → σημειώθηκαν SHIPPED μέσα στο «Approved» (αναμονή τελικού Done από τον Αχιλλέα).
> Προστέθηκαν **5 νέοι candidates P32-P36** — όλοι distinct από τα ήδη-tracked (verified με grep).
> **⚑ ΕΓΚΡΙΣΗ 2026-07-10 (Αχιλλέας, interactive):** «i approve» → **P32-P36 μετακινήθηκαν στο «Approved»**.
> Το «Proposed» είναι πάλι κενό· ο planner θα προσθέτει νέους candidates σε επόμενα runs.

---

## Proposed (awaiting Αχιλλέας)

_(κενό — P32-P36 εγκρίθηκαν 2026-07-10· ο planner προσθέτει νέους candidates σε επόμενες σαρώσεις)_

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

### P30. Mobile push notifications (Expo) για alerts & reminders — M — both (mobile-native engagement)
- **Αξία:** το §3 notifier framework στέλνει σε ntfy/Discord/Slack/webhook (HTTP), αλλά **όχι native push** στο κινητό.
  Expo push tokens + device registration → οι ίδιες ειδοποιήσεις (δόση λήγει, return window κλείνει, budget ξεπεράστηκε,
  bill overdue) φτάνουν ως native push. Μεγαλώνει το retention του mobile app. **Διακριτό** από §3 (HTTP) & §13 (inbound bots).
- **Module:** Mobile (Expo Notifications + token registration) + `/api/v1` (register device) + `dispatchAlert` (νέο push channel).
- **Εξάρτηση:** mobile MVP (§6) + `/api/v1` (§5). **Builder default:** ένα «push» notifier channel που reuse-άρει το event fan-out.

### P31. Household / shared access — multi-user σε ένα self-host instance — M — OSS (adoption) / SaaS seed
- **Αξία:** σήμερα single-user per deployment· μια οικογένεια/νοικοκυριό θέλει **πολλαπλά logins πάνω στα ίδια δεδομένα**
  (κοινό inventory/έξοδα) με ρόλους (admin/member/viewer) + «ποιος καταχώρησε τι» attribution. Ισχυρό OSS self-host lever
  και σπόρος για το SaaS team-plan. **Διακριτό από §8** (multi-tenancy = ξεχωριστές βάσεις) και **§9** (SaaS-grade email verify/MFA/OAuth).
- **Module:** Auth/Users (ρόλοι + invite εντός instance) + cross-cutting attribution (createdBy).
- **Απόφαση που χρειάζεται (Αχιλλέας):** in-instance multi-user για το OSS, ή single-user OSS + βασίσου αποκλειστικά στο §8
  multi-tenancy; **δεν λύθηκε ρητά στην έγκριση** → builder default = shared-data + 3 ρόλοι (admin/member/viewer), χωρίς email/MFA στο OSS tier.

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

### P12. Savings / financial goals (στόχοι, όχι όρια) — S/M — both
- **Αξία:** πέρα από τα budgets (όρια), **στόχοι** («μάζεψε €2.000 μέχρι Σεπ»). `Goal` model (target + προθεσμία
  + optional linked category/manual contributions) + progress ring + «χρειάζεσαι €X/μήνα». Reuse reports + calendar.
- **Module:** Reports (νέα «Goals» ενότητα) + Homepage card.
- **Ανοιχτή απόφαση (builder default):** πολλά ταυτόχρονα goals· manual contributions πρώτα, auto-feed από κατηγορία phase 2.

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
