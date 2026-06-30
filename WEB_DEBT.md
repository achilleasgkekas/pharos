# WEB_DEBT — Pharos web code-quality queue

> Παράγεται από τον web code-quality auditor (read-only). Ο builder routine καταναλώνει το «## Web Debt Queue» (μικρότερο + υψηλότερη προτεραιότητα πρώτα). Λεπτομέρειες ανά run στο `PROGRESS.md`.
> Σύμβολα status: TODO · DOING · DONE.

## Σύνοψη audit (2026-07-01 re-audit — ουρά αμετάβλητη: 2 P3 items ΑΝΟΙΧΤΑ· μηδέν app-code commit ενδιάμεσα)

**2026-07-01:** re-audit ολόκληρης της `/api/v1` (πλέον **48 route files**, +2 από προηγούμενα: `items/[id]/convert-to-task` + `receipts/[id]/rescan`). `git log --oneline -- apps/web/src` → ο τελευταίος app-code commit είναι `9b34b44` (body-coercion), ίδιος με το προηγούμενο audit· **κανένας builder δεν κατανάλωσε item ενδιάμεσα** → τα 2 P3 items παραμένουν TODO + επαναεπαληθεύτηκαν από τον κώδικα (lineItems copy-paste σε receipts/[id]:28, receipts/[id]/rescan:44, scan/receipt:30· inline error σε scan/product:14, scan/receipt:20, shopping-list:18, items:61). Οι 2 νέες routes είναι καθαρές (withAuth + 24-hex guard + apiError + 404 handling). Μηδέν νέο P1/P2/P3 εύρημα. `npm run type-check` → exit 0.

---

## Σύνοψη audit (2026-06-30 βραδινό re-audit — ΟΛΑ τα 5 αρχικά items DONE· 2 νέα P3 items προστέθηκαν)

**Καθοριστικό εύρημα αυτού του run: η αρχική ουρά (5 items) είναι πλέον ΟΛΗ DONE.** Ο builder υλοποίησε τα 4 ανοιχτά (commits `5457339` index-updatedAt, `4ead61b` whitelist-status, `261a4fb` shopping-list id-guard, `9b34b44` body-coercion helpers) ΚΑΙ το P2#3 (GET /items listEnvelope, commit `c3c9fae`) — το οποίο ήταν ακόμα stale-marked TODO. Το επαλήθευσα από τον κώδικα: `GET /items` γυρνά τώρα `listEnvelope({data})` (route.ts:53) + ο mobile consumer διαβάζει `.data` (`apps/mobile/src/api.ts:205`), άρα συμβατό end-to-end → το μάρκαρα DONE.

**Νέο fresh scan (46 route files + 10 models + apiList/apiAuth/serialize):** βρέθηκαν **2 μικρά P3 (polish) items** — και τα δύο dedup/consistency, μηδέν correctness ρίσκο:
1. 4 routes (scan/product, scan/receipt, shopping-list, items POST) επιστρέφουν inline `NextResponse.json({ error }, { status: 400 })` αντί για το shared `apiError()` helper (πανομοιότυπο shape· καθαρό consistency).
2. Η normalization των receipt lineItems (`{ name: refinedName||name, qty, price, vatRate }` + `LineLean` type) είναι copy-paste σε **3** routes (scan/receipt, receipts/[id] GET, receipts/[id]/rescan) → shared serializer στο `receipts/serialize.ts`.

Η `/api/v1` επιφάνεια παραμένει σε πολύ καλή κατάσταση. Μηδέν P1/P2 εύρημα αυτόν τον γύρο:

- **Type safety**: `npm run type-check` → **exit 0**. Μηδέν `any` / `@ts-ignore` στα routes· χρήση `unknown` + στοχευμένα casts. Καθαρό.
- **Auth**: ΟΛΑ τα `/api/v1` routes περνούν από `withAuth` (`lib/apiAuth.ts`) εκτός του `auth/login` (σωστά). Το `User.apiToken` (hot lookup σε κάθε request) είναι indexed. Καθαρό.
- **Error handling**: ομοιόμορφο try/catch μέσω `withAuth` → καθαρό 500· κάθε body read κάνει `req.json().catch(() => ({}))` (δεν σκάει σε κακό JSON)· μηδέν swallowed catches. Καθαρό.
- **Reads**: όλα τα list endpoints κάνουν `.lean()` + `skip/limit` pagination (1..200). Καλό.

Τα 2 νέα ενεργά items παρακάτω είναι P3 (polish, dedup). Η ευρεία standardization του response envelope σε ΟΛΑ τα endpoints (breaking change που συντονίζεται με το mobile) παραμένει στο `## Needs Achilleas` του PROGRESS, ΟΧΙ εδώ.

---

## Web Debt Queue

### Receipt lineItems serializer — dedup σε 3 routes
- Priority: P3
- Size: S
- Area: shared
- Files: apps/web/src/app/api/v1/receipts/serialize.ts, apps/web/src/app/api/v1/scan/receipt/route.ts, apps/web/src/app/api/v1/receipts/[id]/route.ts, apps/web/src/app/api/v1/receipts/[id]/rescan/route.ts
- Depends on: none
- Acceptance:
  - Το ίδιο normalization `lines.map((l) => ({ name: l.refinedName || l.name || '', qty: l.qty ?? 1, price: l.price ?? 0, vatRate: l.vatRate ?? 0 }))` + ο τύπος `LineLean` (`{ name?; refinedName?; qty?; price?; vatRate? }`) είναι copy-paste σε 3 GET/POST receipt routes (scan/receipt, receipts/[id] GET, receipts/[id]/rescan). Εξάγεται ένας shared helper (π.χ. `serializeLineItems(lines)` + ο τύπος) στο `receipts/serialize.ts` (όπου ζει ήδη το `trimReceipt`/`ReceiptLean`) και τον καλούν τα 3 routes.
  - Το output shape ανά line μένει ΑΚΡΙΒΩΣ ίδιο (name/qty/price/vatRate, ίδια fallbacks)· μηδέν αλλαγή στο response. Το PATCH (receipts/[id]) έχει ΔΙΑΦΟΡΕΤΙΚΟ inbound mapping (`numOr`, `refinedName:''`) → ΔΕΝ το αγγίζεις.
  - npm run type-check exits 0
- Status: TODO

### Inline error → shared apiError() helper (4 routes)
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/scan/product/route.ts, apps/web/src/app/api/v1/scan/receipt/route.ts, apps/web/src/app/api/v1/shopping-list/route.ts, apps/web/src/app/api/v1/items/route.ts
- Depends on: none
- Acceptance:
  - 4 routes επιστρέφουν inline `return NextResponse.json({ error: ... }, { status: 400 })` ενώ υπάρχει το shared `apiError(message, status=400)` (`lib/apiAuth.ts`) που παράγει ΠΑΝΟΜΟΙΟΤΥΠΟ `{ error }` shape και το χρησιμοποιούν ήδη 33 routes. Αντικαθίστανται με `return apiError(r.error)` / `apiError('title required')`.
  - Το `auth/login` ΕΞΑΙΡΕΙΤΑΙ σκόπιμα (auth boundary, δικό του error handling) — μην το αλλάξεις.
  - Μηδέν αλλαγή σε status codes ή error messages· καθαρό consistency. Αν κάποιο route μείνει χωρίς άλλη χρήση του `NextResponse`, καθάρισε το import.
  - npm run type-check exits 0
- Status: TODO

### Index updatedAt στα synced models
- Priority: P2
- Size: S
- Area: db
- Files: apps/web/src/models/Item.ts, apps/web/src/models/Task.ts, apps/web/src/models/Receipt.ts, apps/web/src/models/Expense.ts, apps/web/src/models/Subscription.ts, apps/web/src/models/Statement.ts, apps/web/src/models/Voucher.ts
- Depends on: none
- Acceptance:
  - Το `updatedAt` (το incremental-sync cursor του `withSince` σε `lib/apiList.ts`, φιλτράρει `updatedAt: { $gte }` σε κάθε list endpoint) γίνεται indexed σε όλα τα 7 synced models. Στα Item + Task είναι ΚΑΙ το sort key (`sort({ updatedAt: -1 })`) → τώρα γίνεται unindexed range-scan + in-memory sort σε κάθε mobile sync.
  - Προτίμησε explicit `Schema.index({ updatedAt: -1 })` (τα Mongoose timestamps ΔΕΝ auto-index-άρουν το updatedAt).
  - Μηδέν αλλαγή σε route logic / response shape.
  - npm run type-check exits 0
- Status: DONE (2026-06-30) — explicit `Schema.index({ updatedAt: -1 })` σε Item/Task/Receipt/Expense/Subscription/Statement/Voucher (σχόλιο ότι στα Item/Task είναι ΚΑΙ sort key). tsc EXIT 0· safe rebuild → /login 200, mongo healthy, web up χωρίς loop.

### POST /api/v1/items — whitelist status & category
- Priority: P2
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/items/route.ts
- Depends on: none
- Acceptance:
  - Το POST κάνει validate το `status` με την ίδια whitelist που ΗΔΗ χρησιμοποιεί το PATCH (`items/[id]/route.ts` → `STATUS.includes(...)`)· invalid → fallback 'researching' (ή 400, ίδιο μοτίβο με το `tasks/route.ts` που κάνει ήδη `['todo','in-progress','done','blocked'].includes(...)`).
  - Το `category` παραμένει free string (το model έχει relaxed enum), αλλά τεκμηριώνεται ότι είναι σκόπιμο· καμία αυθαίρετη τιμή status δεν αποθηκεύεται πλέον.
  - Εξάγεται το `STATUS` array σε ένα κοινό σημείο (π.χ. shared const) ώστε POST + PATCH να μοιράζονται την ίδια λίστα, χωρίς διπλό literal.
  - npm run type-check exits 0
- Status: DONE (2026-06-30) — νέο `ITEM_STATUSES` const στο `models/Item.ts` (single source, τροφοδοτεί και το schema enum)· το POST κάνει whitelist με fallback 'researching', το PATCH αντικατέστησε το local `STATUS` literal με το import. category σκόπιμα free string. tsc EXIT 0· safe rebuild → /login 200, web restarts 0, POST/GET no-token → 401.

### GET /api/v1/items — χρήση listEnvelope (alignment)
- Priority: P2
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/items/route.ts, apps/mobile/src/api.ts
- Depends on: none
- Acceptance:
  - Υπάρχει shared `listEnvelope` (`lib/apiList.ts`) που επιστρέφει `{ data, total, limit, offset }` και το χρησιμοποιούν ΗΔΗ 6 list endpoints (receipts/tasks/expenses/subscriptions/statements/vouchers). ΜΟΝΟ το `GET /api/v1/items` αποκλίνει επιστρέφοντας `{ items, total, limit, offset }`.
  - Είτε (α) align το items σε `listEnvelope` (`{ data }`) ΚΑΙ ενημέρωση του mobile consumer (`apps/mobile/src/api.ts`, όπου διαβάζει `.items`) ώστε να μη σπάσει, είτε (β) αν το breaking δεν είναι αποδεκτό τώρα, καταγραφή της απόκλισης ως σχόλιο στο route + στο `## Needs Achilleas` και κλείσιμο του item.
  - Όποια επιλογή: το web + το mobile συμφωνούν στο key· μηδέν runtime σπάσιμο στο mobile items list.
  - npm run type-check exits 0
- Status: DONE (2026-06-30· commit `c3c9fae`) — επιλέχθηκε (α): `GET /items` γυρνά πλέον `listEnvelope({data})` (route.ts:53) ΚΑΙ ο mobile consumer ενημερώθηκε να διαβάζει `.data` (`apps/mobile/src/api.ts:205`). Επαληθεύτηκε από τον κώδικα σε αυτό το run· ήταν stale-marked TODO. Συμβατό end-to-end, μηδέν runtime break.

### shopping-list/[id] — id validation + 404
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/shopping-list/[id]/route.ts
- Depends on: none
- Acceptance:
  - Το PATCH/DELETE κάνουν validate το `id` (regex `^[a-f0-9]{24}$` όπως ΟΛΑ τα άλλα `[id]` routes, π.χ. `items/[id]`) → 400 αντί να φτάσει malformed id στη Mongoose query (CastError → 500).
  - Όταν η εγγραφή δεν βρεθεί, επιστρέφεται 404 αντί για σιωπηλό `{ ok: true }` (τα `toggleListItem`/`updateListItem`/`deleteListItem` actions να γυρίζουν found-flag, ή έλεγχος ύπαρξης πριν).
  - Είναι το ΜΟΝΟ `[id]`/`[type]` route χωρίς id-format guard (επιβεβαιωμένο με sweep).
  - npm run type-check exits 0
- Status: DONE (2026-06-30) — `ID_RE = /^[a-f0-9]{24}$/i` guard σε PATCH+DELETE (→ `apiError('bad id')` 400)· τα `toggleListItem`/`updateListItem`/`deleteListItem` actions γυρνούν πλέον `found` (από `matchedCount`, ο soft-delete pre-hook εξασφαλίζει live-only match) → route επιστρέφει 404 σε not-found αντί σιωπηλό `{ok:true}`· PATCH χωρίς έγκυρα πεδία → 400 `no valid fields` (μοτίβο items/[id]). Web UI αγνοεί το return (additive). tsc EXIT 0· safe rebuild → /login 200, web running· no-token PATCH/DELETE → 401 (auth πριν το id-check).

### Shared body-coercion helpers (str/num/enum/bool)
- Priority: P3
- Size: S
- Area: shared
- Files: apps/web/src/lib/apiList.ts (ή νέο apps/web/src/lib/apiBody.ts), apps/web/src/app/api/v1/items/route.ts, apps/web/src/app/api/v1/expenses/route.ts
- Depends on: none
- Acceptance:
  - ~25 mutation routes επαναλαμβάνουν το ίδιο pattern (`const b = (await req.json().catch(() => ({}))) as Record<string, unknown>` + `typeof b.x === 'number' ? b.x : ...`, `String(b.y || '')`, enum-`includes`). Εισάγονται μικρά typed helpers (π.χ. `strField`, `numField`, `enumField`, `boolField`) σε ένα shared module.
  - Refactor-άρονται **2 routes ως απόδειξη** (items + expenses)· τα υπόλοιπα μένουν για μελλοντικά runs (μη-sprawling).
  - Καμία αλλαγή σε response shape / validation behaviour· καθαρά dedup.
  - npm run type-check exits 0
- Status: DONE (2026-06-30) — νέο `lib/apiBody.ts` (`readBody`/`strField`/`numField`/`enumField`/`boolField`, behaviour-identical helpers). Refactor-αρίστηκαν **expenses + subscriptions** POST (αντί items: το `items/route.ts` ήταν active parallel WIP → απέφυγα conflict, ίδιο pattern). Μηδέν αλλαγή σε validation/response shape (vendor/name trimmed+required, amount→null guard, enum-guard cycle/kind/billingCycle, bool recurring). tsc EXIT 0· safe rebuild → /login 200, web running· POST/GET no-token → 401. Απομένουν ~23 routes με το ίδιο pattern για μελλοντικά runs (incl. items, όταν ελεύθερο).

---

## Δεν είναι debt (επιβεβαιωμένο, μην ανοίξεις item)

- **Μηδέν loading.tsx**: σκόπιμο (CLAUDE.md, Session 2026-06-08 cont.²) — η παρουσία `loading.tsx` προκαλούσε nav flash· αφαιρέθηκαν επίτηδες. Υπάρχει global `app/error.tsx` (stale-deploy auto-reload). Μην προτείνεις προσθήκη.
- **7 per-resource `trim` serializers**: διαφορετικά shapes ανά resource (όχι ίδια logic) → αποδεκτό· όχι candidate για dedup-rewrite.
- **`Statement.find().lean()` χωρίς limit** (calendar/overview/reports/plans): πλήρες scan αλλά τα statements είναι λίγα (ανά μήνα/κάρτα)· χαμηλό ρίσκο, μην το βάλεις σε queue προς το παρόν.
