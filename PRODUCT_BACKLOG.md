# PHAROS — Product Backlog (προτάσεις προϊόντος)

> Ρόλος: ο **product-planner** ΠΡΟΤΕΙΝΕΙ candidate features, ο Αχιλλέας ΑΠΟΦΑΣΙΖΕΙ.
> Αυτό συμπληρώνει (δεν αντικαθιστά) το `TODO.md` (distribution/SaaS roadmap) και τις
> ουρές τεχνικού χρέους (`WEB_DEBT.md`, `MOBILE_PARITY.md`), που καλύπτουν code debt, όχι νέα features.
> **Τίποτα στο «Proposed» δεν χτίζεται μέχρι ο Αχιλλέας να το μετακινήσει στο «Approved».**
> Οι builder routines τραβάνε ΜΟΝΟ από το «Approved». Το split OSS vs paid είναι δική του απόφαση.
> Σύμβολα μεγέθους: S (μικρό) · M (μεσαίο) · L (μεγάλο). Track: OSS / SaaS / both.
> Τελευταία ενημέρωση: 2026-07-01 (1η σάρωση planner).

---

## Proposed (awaiting Αχιλλέας)

Ranked by value/effort (πρώτο = καλύτερη σχέση αξίας προς κόπο).

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

---

## Approved

_(κενό — ο Αχιλλέας μετακινεί εδώ ό,τι εγκρίνει· οι builders τραβάνε από εδώ)_

---

## Done

_(κενό)_

---

## Rejected

_(κενό)_
