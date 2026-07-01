# WEB_DEBT — Pharos web code-quality queue

> Παράγεται από τον web code-quality auditor (read-only). Ο builder routine καταναλώνει το «## Web Debt Queue» (μικρότερο + υψηλότερη προτεραιότητα πρώτα). Λεπτομέρειες ανά run στο `PROGRESS.md`.
> Σύμβολα status: TODO · DOING · DONE.

## Σύνοψη audit (2026-07-01 νυχτερινό re-audit· ουρά αμετάβλητη, μένει 1 P3/S ΑΝΟΙΧΤΟ)

**2026-07-01 (νυχτερινό, αυτόνομος γύρος):** fresh σάρωση **49 route files** + 7 synced models. `git log --oneline -- apps/web/src` → τελευταίος app-code commit **`a582ac5`** (ai chat-history cap), ΙΔΙΟΣ με τον προηγούμενο γύρο· clean working tree, κανένας builder δεν κατανάλωσε item ενδιάμεσα (τα ενδιάμεσα commits = docs review/monitor/docker-health/parity/ui-audit + `effd90d` mobile Button primitive, μηδέν `apps/web/src` diff) → η ουρά είναι by-construction σταθερή: **1 ενεργό P3/S** (apiBody adoption σε vouchers + items POST), όλα τα άλλα DONE. **Μηδέν νέο εύρημα σε καμία διάσταση**, όλα επαναεπαληθεύτηκαν live από grep:
- **Type safety**: `npm run type-check` → **exit 0**. `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` → **0**.
- **Auth**: `grep -L` sweep 49 routes → μόνο το `auth/login` χωρίς `withAuth`/`bearerUser` (σωστά, auth boundary). 0 unguarded route.
- **Input validation**: sweep ΟΛΩΝ των `[id]`/`[type]` routes → **0 NOGUARD** (24-hex/`ID_RE`/`isValidObjectId` guard παντού). list params clamped 1..200. `ai` cap επιβεβαιώθηκε στον κώδικα (`MAX_TURNS=20` slice + `MAX_CONTENT=8000` slice).
- **Error handling**: inline `NextResponse.json({ error })` σε `/api/v1` εκτός `auth/login` → **0**. Ομοιόμορφο try/catch + `apiError` μέσω `withAuth`.
- **DB**: 7/7 synced models με explicit `index({ updatedAt: -1 })` (sweep OK). **Και τα 8 list endpoints** (receipts/tasks/expenses/subscriptions/statements/vouchers/items + cards είναι non-list) έχουν `.limit()` + `.lean()`. Τα 6 no-limit `.find()` (settings/calendar/plans/overview/items[id]plans/reports) είναι non-list aggregations ή window-filtered, όλα `.lean()` (false positives επαληθευμένα).

Επαληθεύτηκε ξανά το 1 ενεργό item: `req.json().catch` grep → **27** mutation routes ακόμα με raw pattern (= apiBody adoption target), **2** adopters. `vouchers/route.ts` έχει 7× `String(b.)` (target του item). Δεν ανοίγω νέο item (no debt to invent).

---

## Σύνοψη audit (2026-07-01 βραδινό re-audit· ai-cap ΕΚΛΕΙΣΕ, μένει 1 P3/S ΑΝΟΙΧΤΟ)

**2026-07-01 (βραδινό, αυτόνομος γύρος):** fresh σάρωση **49 route files** + 7 synced models. `git log --oneline -- apps/web/src` → τελευταίος app-code commit **`a582ac5`** (ai chat-history cap) → ο builder έκλεισε ενδιάμεσα το item **«POST /api/v1/ai — cap μήκους ιστορικού messages»** (MAX_TURNS=20 + MAX_CONTENT=8000, ήδη marked DONE στην ουρά). Απομένει **1 ενεργό P3/S** (apiBody adoption σε vouchers + items POST), όλα τα άλλα DONE. **Μηδέν νέο εύρημα σε καμία διάσταση**, όλα επαναεπαληθεύτηκαν live από grep:
- **Type safety**: `npm run type-check` → **exit 0**. `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` → **0**.
- **Auth**: sweep 49 routes (σωστό `grep -L`, όχι buggy `-Lq`) → μόνο το `auth/login` χωρίς `withAuth`/`bearerUser` (σωστά, auth boundary). 0 unguarded route.
- **Input validation**: sweep ΟΛΩΝ των `[id]`/`[type]` routes → **0 NOGUARD** (`ID_RE = /^[a-f0-9]{24}$/i` guard παντού, π.χ. `shopping-list/[id]:14`). list params clamped 1..200.
- **Error handling**: inline `NextResponse.json({ error })` σε `/api/v1` εκτός `auth/login` → **0**. Ομοιόμορφο try/catch + `apiError` μέσω `withAuth`.
- **DB**: 7/7 synced models με explicit `index({ updatedAt: -1 })` (sweep OK). Οι 2 «no-lean» grep hits (settings:15, calendar:48) είναι multi-line builder chains με `.lean()` στην επόμενη γραμμή (επαληθευμένα false positives). list reads `.lean()` + `.limit()`.

Επαληθεύτηκε ξανά το 1 ενεργό item: `req.json().catch` grep → **27** mutation routes ακόμα με raw pattern (= apiBody adoption target), **2** adopters (`readBody`). `vouchers/route.ts` έχει 7× `String(b.)` (target του item). Δεν ανοίγω νέο item (no debt to invent).

---

## Σύνοψη audit (2026-07-01 όψιμο re-audit· ουρά αμετάβλητη, 2 P3/S ΑΝΟΙΧΤΑ)

**2026-07-01 (όψιμο, αυτόνομος γύρος):** fresh σάρωση **49 route files** + 7 synced models. `git log --oneline -- apps/web/src` → τελευταίος app-code commit **`c540322`** (apiError refactor), ΙΔΙΟΣ με τους 2 προηγούμενους γύρους· clean working tree, κανένας builder δεν κατανάλωσε item ενδιάμεσα (τα μετέπειτα commits = docs + mobile scrim/Input primitive, μηδέν `apps/web/src` diff) → η ουρά είναι by-construction σταθερή: **2 ενεργά P3/S** (apiBody adoption, ai messages cap), όλα τα άλλα DONE. **Μηδέν νέο εύρημα σε καμία διάσταση**, όλα επαναεπαληθεύτηκαν live από grep:
- **Type safety**: `npm run type-check` → **exit 0**. `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` → **0**.
- **Auth**: sweep 49 route.ts → μόνο το `auth/login` χωρίς `withAuth`/`bearerUser` (σωστά, auth boundary). 0 unguarded route.
- **Input validation**: sweep ΟΛΩΝ των `[id]`/`[type]` routes → **0 NOGUARD** (24-hex `a-f0-9` guard παντού, π.χ. `items/[id]:67`). list params clamped 1..200.
- **Error handling**: inline `NextResponse.json({ error })` σε `/api/v1` εκτός `auth/login` → **0**. Ομοιόμορφο try/catch + `apiError` μέσω `withAuth`.
- **DB**: 7/7 synced models με explicit `index({ updatedAt: -1 })` (sweep OK). list reads `.lean()` + `.limit()`.

Επαληθεύτηκε ξανά ότι τα 2 ενεργά items ισχύουν: `readBody` grep → **2** routes το χρησιμοποιούν, **27** ακόμα με raw `await req.json().catch` pattern (= apiBody adoption)· `ai/route.ts` χτίζει `messages` (γραμμή 15-23) χωρίς `slice`/cap πριν το `runAiCommand` (= ai messages cap)· `vouchers/route.ts` έχει 7× `String(b.)` (target του item). Δεν ανοίγω νέο item (no debt to invent).

---

## Σύνοψη audit (2026-07-01 αργά βραδινό re-audit· ουρά αμετάβλητη, 2 P3/S ΑΝΟΙΧΤΑ)

**2026-07-01 (αργά βραδινό, αυτόνομος γύρος):** fresh σάρωση **49 route files** + 7 synced models. `git log --oneline -- apps/web/src` → τελευταίος app-code commit **`c540322`** (apiError refactor), ΙΔΙΟΣ με τον προηγούμενο γύρο· clean working tree, κανένας builder δεν κατανάλωσε item ενδιάμεσα (τα μετέπειτα commits = docs + mobile Input primitive, μηδέν `apps/web/src` diff) → η ουρά είναι by-construction σταθερή: **2 ενεργά P3/S** (apiBody adoption, ai messages cap), όλα τα άλλα DONE. **Μηδέν νέο εύρημα σε καμία διάσταση**, όλα επαναεπαληθεύτηκαν live από grep:
- **Type safety**: `npm run type-check` → **exit 0**. `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` → **0** (ο μόνος `as any` παραμένει το Mongoose hook-name cast στο `lib/softDelete.ts:25`, αναγκαίο).
- **Auth**: sweep 49 routes → μόνο το `auth/login` MISSING `withAuth` (σωστά, auth boundary). 0 unguarded route.
- **Input validation**: ΟΛΑ τα `[id]`/`[type]` routes με 24-hex/`ID_RE` guard. list params clamped 1..200.
- **Error handling**: inline `NextResponse.json({ error })` σε `/api/v1` → **3 hits, ΟΛΑ στο `auth/login`** (400/400/401, σκόπιμα εξαιρείται). 0 αλλού.
- **DB**: 7/7 synced models με explicit `index({ updatedAt: -1 })` (sweep OK). Οι 9 «no-lean» grep hits είναι non-list endpoints (ai/search/jobs/notifications/history/lists/trash/stores/shopping-list — δικά τους read patterns ή aggregations, false positives επαληθευμένα).

Το `raw body pattern` grep επιβεβαίωσε **27 mutation routes** ακόμα χωρίς τα `apiBody` helpers (ακριβώς το item «apiBody adoption») και το `ai/route.ts` χτίζει `messages` χωρίς cap πριν το `runAiCommand` (ακριβώς το item «ai messages cap»). Και τα 2 items παραμένουν έγκυρα. Δεν ανοίγω νέο item (no debt to invent).

---

## Σύνοψη audit (2026-07-01 βραδινό re-audit· 2 νέα P3/S items, ουρά καθαρή αλλιώς)

**2026-07-01 (βραδινό, αυτόνομος γύρος):** fresh σάρωση **50 route files** + 7 synced models + `apiAuth`/`apiList`/`apiBody`/`serialize`. Τελευταίος `apps/web/src` app-code commit παραμένει `c540322` (apiError refactor)· clean tree, κανένας builder δεν κατανάλωσε item ενδιάμεσα. Η `/api/v1` επιφάνεια είναι ώριμη — **μηδέν P1/P2 εύρημα** σε καμία διάσταση:
- **Type safety**: `npm run type-check` → **exit 0**. `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` → **0** (ο μόνος `as any` είναι στο `lib/softDelete.ts:25`, Mongoose hook-name cast, αναγκαίο).
- **Auth**: sweep 50 routes → μόνο το `auth/login` MISSING `withAuth` (σωστά, auth boundary). 0 unguarded route. `push/register` + `items/import` + `scan/*` + `ai` όλα μέσα σε `withAuth`.
- **Input validation**: ΟΛΑ τα `[id]`/`[type]` routes έχουν 24-hex/`ID_RE` guard (sweep → 0 NOGUARD). `push/register` validate Expo token, `items/import` validate http(s) url, `ai` validate messages shape. list params clamped 1..200.
- **Error handling**: ομοιόμορφο try/catch + `apiError` μέσω `withAuth`· `auth/login` έχει δικό του (JSON-parse guard + 400/401). Καμία inline `NextResponse.json({ error })` εκτός `auth/login`. Κανένα route δεν χάνει `connectDB()` (sweep 0).
- **DB**: 7/7 synced models με explicit `index({ updatedAt: -1 })`. ΟΛΑ τα list reads `.lean()` + `.limit()`. Τα non-list reads (settings/calendar/reports/overview/plans) είναι window-filtered + `.lean()` ή σκόπιμα full-dataset aggregations (reports/overview)· `Statement.find()` χωρίς limit = επιβεβαιωμένο low-risk (λίγα docs/κάρτα-μήνα).

**Νέα ευρήματα (2, και τα δύο P3/S consistency-hardening, όχι correctness):** (1) **apiBody adoption** — 27/29 mutation routes δεν χρησιμοποιούν ακόμα τα shared body-helpers· ανοίγω continuation για 2 routes (vouchers + items POST). (2) **ai messages cap** — το `POST /api/v1/ai` είναι το μόνο array-input χωρίς άνω όριο μήκους (cost exposure στην Anthropic κλήση)· cap στα τελευταία N turns. Δες `## Needs Achilleas` στο PROGRESS για 2 security παρατηρήσεις (login brute-force, error-message leak) που είναι product decisions, όχι queue items.

---

## Σύνοψη audit (2026-07-01 απόγευμα re-audit· ΟΥΡΑ ΑΔΕΙΑ, 0 ενεργά items)

**2026-07-01 (απόγευμα, αυτόνομος γύρος):** fresh σάρωση **49 route files** + 7 synced models + `apiAuth`/`apiList`/`apiBody`/`serialize`. **Καθοριστικό:** ο builder έκλεισε ενδιάμεσα το τελευταίο ανοιχτό P3 (inline error → `apiError` στα 4 routes, commit `c540322`, ο πλέον τελευταίος app-code commit στο `apps/web/src`) → η Web Debt Queue είναι πλέον **0 ενεργά items** (και τα 8 DONE). **Μηδέν νέο εύρημα σε καμία διάσταση**, όλα επαναεπαληθεύτηκαν live από grep:
- **Type safety**: `npm run type-check` → **exit 0**. Grep `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` → **0**.
- **Auth**: sweep 49 routes → μόνο το `auth/login` βγαίνει MISSING `withAuth` (σωστά, auth boundary)· 0 unguarded route.
- **Input validation**: sweep όλων των `[id]`/`[type]` routes για 24-hex/`ID_RE`/`isValidObjectId` guard → **0 NOGUARD**. list params clamped.
- **Error handling**: sweep inline `NextResponse.json({ error })` σε `/api/v1` εκτός `auth/login` → **0** (το P3 έκλεισε στο `c540322`). Ομοιόμορφο try/catch + `apiError` μέσω `withAuth`.
- **DB**: 7/7 synced models με explicit `index({ updatedAt: -1 })`. Οι 2 grep hits χωρίς `.lean()` (settings:15, calendar:48) είναι multi-line builder chains με `.lean()` στην επόμενη γραμμή (επαληθευμένα false positives). Pagination 1..200 παντού.

Η `/api/v1` επιφάνεια είναι ώριμη και η ουρά καθαρή. Δεν ανοίγω νέο item (no debt to invent). Ο builder δεν έχει ενεργό web item → πέφτει στο mobile UI Debt Queue (Input primitive migration, top-3 στο PROGRESS).

---

## Σύνοψη audit (2026-07-01 μεσημέρι re-audit· queue σταθερή, μένει 1 P3 ΑΝΟΙΧΤΟ)

**2026-07-01 (μεσημέρι, αυτόνομος γύρος):** fresh σάρωση **49 route files**. `git log --oneline -- apps/web/src` → τελευταίος app-code commit **`86c6ada`** (Items ai-fill), ίδιος με τους 3 προηγούμενους γύρους· clean working tree, κανένας builder δεν κατανάλωσε item ενδιάμεσα (τα ενδιάμεσα commits `ad1e32c`/`866d6e9`/`32c2501`/κλπ = docs + mobile Input primitive, μηδέν `apps/web/src` diff) → η ουρά by-construction σταθερή (**1 ενεργό P3**, όλα τα άλλα 7 DONE). **Μηδέν νέο εύρημα σε καμία διάσταση**, όλα επαναεπαληθεύτηκαν live από grep:
- **Type safety**: `npm run type-check` → **exit 0**. Grep `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` → **0**.
- **Auth**: 48/49 route files περνούν `withAuth`/`bearerUser`· ΜΟΝΟ το `auth/login` βγαίνει MISSING στο sweep (σωστά — auth boundary). 0 unguarded route.
- **Input validation**: sweep όλων των `[id]`/`[type]` routes για 24-hex guard → **0 NOGUARD**. list params clamped.
- **Error handling**: ομοιόμορφο try/catch μέσω `withAuth`. Μένουν **4 routes** με inline `NextResponse.json({ error }, { status })` (scan/receipt:20, scan/product:14, shopping-list:18, items:61) = ΑΚΡΙΒΩΣ το 1 ανοιχτό P3· το `auth/login` (3 inline: 400/400/401) εξαιρείται σκόπιμα.
- **DB**: sweep και των 7 synced models (Item/Task/Receipt/Expense/Subscription/Statement/Voucher) για `index({ updatedAt` → **7 OK**. `.lean()` παντού στα reads, pagination 1..200.

Η `/api/v1` επιφάνεια παραμένει ώριμη. Δεν ανοίγω νέο item (no debt to invent).

---

## Σύνοψη audit (2026-07-01 πρωί re-audit· queue σταθερή, μένει 1 P3 ΑΝΟΙΧΤΟ)

**2026-07-01 (πρωί, αυτόνομος γύρος):** fresh σάρωση **49 route files** + 7 synced models + `apiAuth`/`apiList`/`apiBody`/`serialize`. `git log --oneline -- apps/web/src/app|lib|models` → τελευταίος app-code commit **`86c6ada`** (Items ai-fill), ίδιος με τους προηγούμενους 2 γύρους· clean tree, κανένας builder δεν κατανάλωσε item ενδιάμεσα → η ουρά είναι by-construction σταθερή (**1 ενεργό P3**, όλα τα άλλα DONE) + κάθε ανοιχτό item επαναεπαληθεύτηκε από grep. **Μηδέν νέο εύρημα σε καμία διάσταση:**
- **Type safety**: `npm run type-check` → **exit 0**. Grep `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` → **0**.
- **Auth**: 48/49 route files περνούν `withAuth`/`bearerUser`· μόνο το `auth/login` εξαιρείται (σωστά). 0 unguarded route.
- **Input validation**: ΟΛΑ τα `[id]`/`[type]` routes έχουν 24-hex id guard (sweep → 0 MISSING). list params clamped.
- **Error handling**: ομοιόμορφο try/catch μέσω `withAuth` (clean 500). Μένουν **4 routes** με inline `NextResponse.json({ error }, { status: 400 })` (scan/product:14, scan/receipt:20, shopping-list:18, items:61) — ΑΚΡΙΒΩΣ το 1 ανοιχτό P3· το `auth/login` (3 inline errors) εξαιρείται σκόπιμα.
- **DB**: και τα 7 synced models έχουν explicit `index({ updatedAt: -1 })` (Item..Voucher, sweep OK). ΟΛΕΣ οι `.find()` reads κάνουν `.lean()` (οι 9 grep hits ήταν `const find=…` builder chains + settings/calendar aggregations, όλα με `.lean()` στην επόμενη γραμμή· false positives επαληθευμένα). Pagination 1..200 παντού. `User.apiToken` indexed.

Η `/api/v1` επιφάνεια παραμένει ώριμη. Δεν ανοίγω νέο item (no debt to invent).

---

## Σύνοψη audit (2026-07-01 αργά νύχτα re-audit· queue σταθερή, μένει 1 P3 ΑΝΟΙΧΤΟ)

**2026-07-01 (αργά νύχτα, αυτόνομος γύρος):** fresh σάρωση **49 route files** (νέο `items/[id]/ai-fill/route.ts` από commit `86c6ada`). Ο κώδικας στο `apps/web/src` αμετάβλητος από τον προηγούμενο γύρο (μόνο docs commits μετά το `6a5809a`). **Μηδέν νέο εύρημα.** Το νέο `ai-fill` route ελέγχθηκε καθαρό: `withAuth` + 24-hex id guard + `apiError`, mode-validation (`'specs'|'info'`), wrap των proven web actions `aiFillSpecs`/`aiFillInfo` (AI-feature gated). Ουρά: **1 ενεργό P3** (inline error → `apiError`, 4 routes: scan/product:14, scan/receipt:20, shopping-list:18, items:61· επαναεπαληθεύτηκε από grep), όλα τα άλλα 6 items DONE. `npm run type-check` → **exit 0**.

**2026-07-01 (νυχτερινός γύρος):** πλήρης fresh σάρωση όλων των **48 route files** (+ `serialize.ts`) σε ΟΛΕΣ τις διαστάσεις. Ο builder έκλεισε ενδιάμεσα το P3 «Receipt lineItems serializer» (commit `6a5809a`, last app-code commit στο `apps/web/src`) → η ουρά έχει πλέον **1 ενεργό P3** (inline error → `apiError`, 4 routes: scan/product:14, scan/receipt:20, shopping-list:18, items:61 — επαναεπαληθεύτηκε από grep). **Μηδέν νέο εύρημα** σε καμία διάσταση:
- **Type safety**: `npm run type-check` → **exit 0**. Μηδέν `: any` / `as any` / `@ts-ignore` σε ΟΛΟ το `/api/v1`. Το μόνο `any` στο `lib/` είναι ένα Mongoose-hook cast (`softDelete.ts:25`, γνωστός τύπος-περιορισμός του Mongoose) — αποδεκτό, narrow.
- **Auth**: ΟΛΑ τα 48 route handlers περνούν `withAuth`/`bearerUser` εκτός του `auth/login` (σωστά). Sweep επιβεβαίωσε 0 unguarded route.
- **Input validation**: ΟΛΑ τα `[id]`/`[type]` routes έχουν 24-hex id guard (0 χωρίς). list params clamped (limit 1..200, offset ≥0). body reads μέσω `readBody`/`apiBody` helpers.
- **Error handling**: ομοιόμορφο try/catch μέσω `withAuth` (clean 500), `req.json().catch(()=>({}))` παντού, 0 swallowed catch.
- **DB**: ΟΛΑ τα sort keys των list endpoints είναι indexed (date/nextRenewal/period/expiresAt/updatedAt). ΟΛΕΣ οι reads `.lean()` (οι «no-lean» grep hits ήταν chained `const find=…` ή array `.find` — false positives). Pagination παντού.

Η `/api/v1` επιφάνεια παραμένει σε εξαιρετική κατάσταση. Δεν ανοίγω νέο item (no debt to invent).

---

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

### apiBody helpers — adoption σε vouchers + items POST
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/vouchers/route.ts, apps/web/src/app/api/v1/items/route.ts
- Depends on: none
- Acceptance:
  - Υπάρχει ήδη το shared `lib/apiBody.ts` (`readBody`/`strField`/`numField`/`enumField`/`boolField`) και το χρησιμοποιούν 2 routes (expenses + subscriptions POST). Άλλα ~27 handlers επαναλαμβάνουν ακόμα το raw pattern (`(await req.json().catch(() => ({}))) as Record<string, unknown>` + `String(b.x || '').trim()`).
  - Refactor 2 ΑΚΟΜΑ routes ως συνέχεια (μη-sprawling): **vouchers POST** (6× `String(b.x || '').trim()` → `readBody` + `strField(b, key, '', true)`· το `expiresAt` μένει ως έχει, δεν έχει helper για date) + **items POST** (`title` → `strField(b,'title','',true)`, `category` → `strField(b,'category','other')`, `currentPrice` → `numField(b,'currentPrice') ?? 0`· το status-whitelist μπορεί να γίνει `enumField(b,'status',ITEM_STATUSES,'researching')`).
  - Μηδέν αλλαγή σε validation behaviour / response shape (ίδια trimmed/required/fallback semantics, verified 1:1 με τους helpers).
  - Απομένουν ~25 routes με το ίδιο pattern για μελλοντικά runs (τεκμηρίωση στο PROGRESS).
  - npm run type-check exits 0
- Status: TODO

### POST /api/v1/ai — cap μήκους ιστορικού messages
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/ai/route.ts
- Depends on: none
- Acceptance:
  - Το `POST /api/v1/ai` δέχεται `messages: ChatTurn[]` χωρίς άνω όριο μήκους → ο authenticated χρήστης μπορεί (κατά λάθος, π.χ. app bug που δεν trim-άρει το local chat) να στείλει τεράστιο history, που ταξιδεύει ΟΛΟΚΛΗΡΟ στην Anthropic κλήση (κόστος tokens ανά turn). Κάθε άλλο list input στο API είναι bounded (limit 1..200)· μόνο αυτό όχι.
  - Μετά το φιλτράρισμα σε valid turns, κρατιούνται ΜΟΝΟ τα τελευταία N (π.χ. `messages.slice(-20)`) πριν το `runAiCommand`. Επιλογή N τεκμηριωμένη σε σχόλιο (το conversational agent χρειάζεται πρόσφατο context, όχι όλο το ιστορικό).
  - Καμία αλλαγή στο response shape (`{ reply, actions }`)· καθαρό cost-hardening, ίδιο behaviour για κανονικά (σύντομα) conversations.
  - npm run type-check exits 0
- Status: DONE (2026-07-01) — δύο σταθερές στο `ai/route.ts`: `MAX_TURNS = 20` (`b.messages.slice(-MAX_TURNS)` πριν το φιλτράρισμα → κρατιούνται μόνο τα τελευταία 20 turns) + `MAX_CONTENT = 8000` (κάθε `content` γίνεται `.slice(0, MAX_CONTENT)` καθώς μπαίνει στο array → ένα μεμονωμένο blob δεν φουσκώνει τα tokens). Response shape (`{ reply, actions }`) αμετάβλητο· καθαρό cost/DoS-hardening, ταυτόσημη συμπεριφορά για κανονικά σύντομα conversations. tsc EXIT 0· safe rebuild → /login 200, web restarts 0, POST no-token → 401 (auth boundary intact). **Ουρά Web Debt: 1 ενεργό P3/S (apiBody adoption).**

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
- Status: DONE (2026-07-01) — νέα `serializeLineItems(lines: unknown): ReceiptLine[]` + ο τύπος `LineLean`/`ReceiptLine` στο `receipts/serialize.ts`· τα 3 routes (receipts/[id] GET, receipts/[id]/rescan, scan/receipt) καλούν πλέον το helper, σβήστηκαν τα 3 local `type LineLean` + οι inline `.map`. Output shape ΑΚΡΙΒΩΣ ίδιο (ίδια fallbacks)· το PATCH inbound mapping (numOr/refinedName:'') ΔΕΝ αγγίχτηκε. tsc EXIT 0· safe rebuild → /login 200, web restarts 0, no-token GET receipts/[id] → 401.

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
- Status: DONE (2026-07-01) — και τα 4 routes (scan/product:14, scan/receipt:20, shopping-list:18, items:61) καλούν πλέον `apiError(...)` αντί inline `NextResponse.json({ error }, { status: 400 })`· το `apiError` προστέθηκε στο import από `@/lib/apiAuth` σε καθένα. Επειδή τα actions επιστρέφουν `error?: string` (τυπικά `string | undefined`, ο TS δεν narrow-άρει μετά το `!r.ok`) χρησιμοποιήθηκε `apiError(r.error || 'Bad request')` — behaviorally identical (κάθε `!ok` path θέτει πάντα non-empty error string, επαληθευμένο· το fallback ποτέ δεν ενεργοποιείται στην πράξη). Το `NextResponse` παραμένει σε χρήση και στα 4 (άλλα json returns) → κανένα dangling import. Το `auth/login` ΔΕΝ αγγίχτηκε (auth boundary). tsc EXIT 0· safe rebuild → /login 200, web restarts 0, POST no-token → 401 και στα 4. **Ουρά Web Debt: 0 ενεργά items.**

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
