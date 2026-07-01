# WEB_DEBT — Pharos web code-quality queue

> Παράγεται από τον web code-quality auditor (read-only). Ο builder routine καταναλώνει το «## Web Debt Queue» (μικρότερο + υψηλότερη προτεραιότητα πρώτα). Λεπτομέρειες ανά run στο `PROGRESS.md`.
> Σύμβολα status: TODO · DOING · DONE.

## Σύνοψη audit (2026-07-01 19η σάρωση· ουρά αμετάβλητη, 2 P3/S ΑΝΟΙΧΤΑ, μηδέν app-code diff)

**2026-07-01 (19η σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 route files** + `apiAuth`/`apiBody`/serialize helpers + 10 models. `git log --oneline -- apps/web/src` → τελευταίος app-code commit **`0c866eb`** (notifications+lists PATCH `readBody`), ΙΔΙΟΣ με την 18η σάρωση· clean working tree, κανένας builder δεν κατανάλωσε web item ενδιάμεσα (τα ενδιάμεσα commits = mobile Button-family `3a272c1` + docs review/parity/ui-auditor/monitor/docker-health, μηδέν `apps/web/src` diff) → η ουρά είναι by-construction σταθερή: **2 ενεργά P3/S** (readBody items/[id]+shopping-list/[id]· ObjectId-regex dedup), όλα τα άλλα DONE. Επαναεπαλήθευσα και τα 2 ανοιχτά items live από κώδικα: `items/[id]:110` + `shopping-list/[id]:15` έχουν ακόμα το raw `const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;`.
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `npm run type-check` EXIT 0· `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` = **0**.
  - **Auth: 0 unguarded** — `grep -rL withAuth|bearerUser` σε 49 routes → μόνο `auth/login` (auth boundary, σωστά). Κεντρικό bearer-check + try/catch + καθαρό 500 μέσω `withAuth`.
  - **Input validation: 0 gaps** — τα εναπομείναντα 15 raw-body routes ΟΛΑ validate τα inputs τους (push/register Expo token, items/[id]/price `price>0`, link-plan `signature required`, ai messages shape+cap)· το `readBody` adoption είναι style/consistency, ΟΧΙ validation gap. list params clamped 1..200.
  - **Error handling: 0** — ομοιόμορφο try/catch + `{ error }` shape μέσω `withAuth`· inline `NextResponse.json({ error })` μόνο στο `auth/login` (σκόπιμα).
  - **DB: 0** — 7/7 synced models `index({ updatedAt: -1 })`· τα 11 list endpoints `.lean()`+`.limit()`· τα no-limit finds (settings/calendar/plans/overview/items[id]plans/reports/cards) είναι bounded-domain aggregations ή window-filtered, όλα `.lean()`.
  - **Duplication: 2** — (1) raw-body `req.json().catch` σε **15 routes**, 14 adopters (ongoing consistency)· (2) ObjectId regex `/^[a-f0-9]{24}$/i` inline σε **19 route files / 30 occurrences** → shared `isObjectId()` guard.
- **Counts ανά dimension: P1=0, P2=0, P3=2** (τα ήδη-ανοιχτά apiBody continuation items/[id]+shopping-list/[id]· ObjectId-regex dedup). Δεν ανοίγω νέο item (no debt to invent). Δες `## Needs Achilleas` στο PROGRESS για standing product decisions (login brute-force rate-limit, error-message leak στο `withAuth` 500, tasks `steps` χωρίς cap).

---

## Σύνοψη audit (2026-07-01 18η σάρωση· builder έκλεισε notifications+lists PATCH, ουρά 0→ανοίγω 2 P3/S)

**2026-07-01 (18η σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 route files** + `apiAuth`/`apiBody`/serialize helpers + 10 models. Από την 17η σάρωση ο builder κατανάλωσε το μοναδικό ενεργό item (commit `0c866eb`, notifications+lists PATCH `readBody`) → adopters `readBody` **12 → 14**, raw `req.json().catch` routes **17 → 15**. Το top item στην ουρά ήταν stale-marked TODO ενώ ήταν ήδη DONE → το μάρκαρα DONE (επαλήθευση: αμφότερα τα files κάνουν πλέον import `readBody`).
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `npm run type-check` EXIT 0· `:any`/`as any`/`@ts-ignore` σε ΟΛΟ το `/api/v1` = 0.
  - **Auth: 0 unguarded** — `withAuth` σε 48/49 routes, μόνο `auth/login` εξαιρείται (auth boundary, σωστά). Το `withAuth` κεντρικοποιεί bearer-check + try/catch + καθαρό 500.
  - **Input validation: 0 gaps** — τα εναπομείναντα raw-body routes (push/register `isExpoPushToken`, items/[id]/price `price>0`, link-plan `signature required`, κ.λπ.) ΟΛΑ validate τα inputs τους· το `readBody` adoption είναι καθαρά style/consistency, ΟΧΙ validation gap. list params clamped, `ai` cap ενεργό.
  - **Error handling: 0** — ομοιόμορφο try/catch + `{ error }` shape μέσω `withAuth`· inline `NextResponse.json({ error })` μόνο στο `auth/login` (σκόπιμα).
  - **DB: 0** — 7/7 synced models `index({ updatedAt: -1 })`· ΟΛΑ τα read paths `.lean()` (η μόνη «find χωρίς lean» στο reports:81 = `Array.prototype.find`, false positive)· τα μεγάλα list endpoints `.limit()`· τα no-limit finds είναι bounded-domain (AppConfig singleton, cards, calendar/reports derived).
  - **Duplication: 2** — (1) raw-body `req.json().catch` σε **15 routes**, 14 adopters (ongoing consistency)· (2) **ΝΕΟ:** το ObjectId regex `/^[a-f0-9]{24}$/i` inline σε **19 route files (30 occurrences)** ενώ ένα route έχει ήδη local `ID_RE` const → shared `isObjectId()` guard.
- **Counts ανά dimension: P1=0, P2=0, P3=2** (apiBody continuation items/[id]+shopping-list/[id]· ObjectId-regex dedup). Δες `## Needs Achilleas` στο PROGRESS για standing product decisions (login brute-force rate-limit, error-message leak στο `withAuth` 500, tasks `steps` χωρίς cap).

---

## Σύνοψη audit (2026-07-01 17η σάρωση· builder κατανάλωσε 6 apiBody routes, ουρά 0→ανοίγω 1 P3/S continuation)

**2026-07-01 (17η σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 route files** + 7 synced models. Από την 16η σάρωση ο builder κατανάλωσε **6 apiBody items** (git log: expenses/[id]+subscriptions/[id] PATCH, tasks/[id]+vouchers/[id] PATCH, cards field-dedup) → adopters `readBody` **6 → 12**, raw `req.json().catch` routes **23 → 17**. Όλα τα προηγούμενα queue items DONE → η Web Debt Queue ήταν **0 ενεργά** στην αρχή.
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `npm run type-check` EXIT 0· `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` = 0.
  - **Auth: 0 unguarded** — `grep -rL withAuth|bearerUser` σε 49 routes → μόνο `auth/login` (auth boundary, σωστά).
  - **Input validation: 0 NOGUARD** — ΟΛΑ τα 18 `[id]`/`[type]` routes με 24-hex `/^[a-f0-9]{24}$/i` guard (regex-aware sweep επιβεβαίωσε ΚΑΙ τα 18)· list params clamped 1..200· `ai` cap (MAX_TURNS=20/MAX_CONTENT=8000) ενεργό.
  - **Error handling: 0** inline `NextResponse.json({ error })` εκτός `auth/login` (3 hits, σκόπιμα auth boundary).
  - **DB: 0** — 7/7 synced models `index({ updatedAt: -1 })`· ΟΛΑ τα list endpoints `.limit()`+`.lean()`· heuristic no-lean sweep = 0 hits.
  - **Duplication: 1 ongoing** — raw-body `req.json().catch` σε **17 routes** (ai, ai/subscription, items/[id]+link-plan+price+import, lists, notifications, push/register, receipts/[id]+rescan, scan/expense+voucher, settings, shopping-list+[id], stores/[id]), **12 adopters**. Νόμιμο consistency debt.
- **Counts ανά dimension: P1=0, P2=0, P3=1** (νέο apiBody continuation, S· 2 απλά PATCH routes). Άνοιξα ΜΟΝΟ 1 μη-sprawling item ώστε ο builder να έχει ουρά· δεν εφευρίσκω debt. Δες `## Needs Achilleas` στο PROGRESS για 3 standing παρατηρήσεις (login brute-force, error-message leak, tasks `steps` χωρίς cap) που είναι product decisions, ΟΧΙ queue items.

---

## Σύνοψη audit (2026-07-01 16η σάρωση· νέος tasks-steps κώδικας καθαρός, ουρά 0→1 apiBody [id]-PATCH)

**2026-07-01 (16η σάρωση, αυτόνομος γύρος):** fresh σάρωση **41 route files** + 7 synced models. `git log --oneline -- apps/web/src` → τελευταίος app-code commit **`e0f7a97`** (feat mobile+api: Tasks steps/checklist — εκθέτει `steps` στο tasks API), ΝΕΟΤΕΡΟΣ από την 15η σάρωση (baseline `83cc537`, apiBody tasks+stores POST = προηγ. item, τώρα DONE). Άρα η Web Debt Queue ήταν **0 ενεργά** στην αρχή· ο builder έκλεισε το apiBody tasks+stores.
- **Νέος κώδικας ελεγμένος (tasks steps):** `tasks/route.ts` GET/POST + `tasks/[id]` PATCH εκθέτουν πλέον `steps: [{id,text,done}]`. **Καθαρό:** POST χρησιμοποιεί ήδη apiBody helpers· PATCH κάνει full-array replacement με validation (`String(s?.text ?? '').trim()` + `.filter(s => s.text)` → drop empty). Response shapes συνεπή με το υπόλοιπο API. Μοναδική παρατήρηση (χαμηλή, single-user): το `steps` array δεν έχει άνω όριο πλήθους/μήκους — αποδεκτό για WireGuard-only self-host, δεν ανοίγω item (δες Needs Achilleas).
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `npm run type-check` EXIT 0· `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` = 0.
  - **Auth: 0 unguarded** — `grep -rL withAuth|bearerUser` → μόνο `auth/login` (auth boundary, σωστά).
  - **Input validation: 0 NOGUARD** — όλα τα `[id]` routes με 24-hex `/^[a-f0-9]{24}$/i` guard· list params clamped 1..200· `ai` cap (MAX_TURNS/MAX_CONTENT) ενεργό.
  - **Error handling: 0** inline `NextResponse.json({ error })` εκτός `auth/login` (3 hits, σκόπιμα).
  - **DB: 0** — 7/7 synced models `index({ updatedAt: -1 })`· 7/7 list endpoints `.limit()`+`.lean()`· τα find-χωρίς-lean grep hits είναι multi-line builder chains (find σε μια γραμμή, `.lean()` παρακάτω) ή Array.find (reports), false positives.
  - **Duplication: 1 ongoing** — raw-body pattern `req.json().catch` σε **23 routes** (από 25· 2 έκλεισαν με `83cc537`), 6 adopters (`readBody`). Νόμιμο consistency debt.
- **Counts ανά dimension: P1=0, P2=0, P3=1** (νέο apiBody [id]-PATCH continuation, S). Άνοιξα ΜΟΝΟ 1 item (μη-sprawling, 2 routes) ώστε ο builder να έχει ουρά· δεν εφευρίσκω debt.

---

## Σύνοψη audit (2026-07-01 15η σάρωση· ουρά ΑΔΕΙΑ→ανοίγω 1 P3/S apiBody continuation)

**2026-07-01 (15η σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 route files** + 7 synced models. `git log --oneline -- apps/web/src` → τελευταίος app-code commit **`37fca25`** (apiBody adoption vouchers+items POST) = το προηγούμενο ενεργό item, τώρα DONE → η Web Debt Queue έφτασε **0 ενεργά** στην αρχή αυτού του γύρου (όλα τα προηγούμενα items DONE). **Μηδέν P1/P2 εύρημα**, όλα επαναεπαληθεύτηκαν live από grep:
- **Type safety**: `npm run type-check` → **exit 0**. `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` → **0**.
- **Auth**: `grep -L 'withAuth\|bearerUser'` sweep 49 routes → μόνο το `auth/login` (σωστά, auth boundary). 0 unguarded route.
- **Input validation**: sweep ΟΛΩΝ των `[id]`/`[type]` routes → **0 NOGUARD** (`ID_RE`/`isValidObjectId`/24-hex guard παντού). list params clamped 1..200. `ai` cap (`MAX_TURNS=20`+`MAX_CONTENT=8000`) στον κώδικα.
- **Error handling**: inline `NextResponse.json({ error })` σε `/api/v1` εκτός `auth/login` → **0**. Ομοιόμορφο try/catch + `apiError` μέσω `withAuth`.
- **DB**: 7/7 synced models με explicit `index({ updatedAt: -1 })` (sweep OK). 7/7 list endpoints (receipts/tasks/expenses/subscriptions/statements/vouchers/items) με `.limit()` + `.lean()`.
- **Duplication**: `req.json().catch` raw-body pattern → **25 routes** (από 27· 2 έκλεισαν με το `37fca25`), **4 adopters** (`readBody`). Νόμιμο ongoing consistency debt, ΟΧΙ invented.

**Ανοίγω 1 συνέχεια (P3/S, μη-sprawling):** apiBody adoption στα **tasks POST** (5× `String(b.)`: title/status/priority/content) + **stores POST** (name/url `typeof===string` trims), ίδιο 1:1-verified refactor με vouchers/items. Τα υπόλοιπα ~23 routes τεκμηριώνονται για μελλοντικά runs. Δες `## Needs Achilleas` στο PROGRESS για τις 2 standing security παρατηρήσεις (login brute-force, error-message leak) που είναι product decisions.

---

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

### apiBody helpers — readBody adoption σε notifications + lists PATCH
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/notifications/route.ts, apps/web/src/app/api/v1/lists/route.ts
- Depends on: none
- Acceptance:
  - Συνέχεια του apiBody adoption (12 routes ήδη adopters). Το shared `readBody` ζει στο `lib/apiBody.ts` και επιστρέφει `Body` = `Record<string, unknown>` (δεν πετάει· bad/empty JSON → `{}`).
  - **notifications PATCH** (γραμμή ~19): `const b = (await req.json().catch(() => ({}))) as { id?: unknown };` → `const b = await readBody(req);` (import `{ readBody }` από `@/lib/apiBody`). Ο έλεγχος `typeof b.id === 'string' && b.id` + το 24-hex guard ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν (το `b.id` γίνεται `unknown`, τα υπάρχοντα guards το καλύπτουν).
  - **lists PATCH** (γραμμή ~19): `const b = (await req.json().catch(() => ({}))) as { key?: unknown; values?: unknown };` → `const b = await readBody(req);`. Τα `typeof b.key === 'string'` + `Array.isArray(b.values)` guards αμετάβλητα.
  - Μόνο η γραμμή body-parse αλλάζει (το inline cast αφαιρείται)· καμία αλλαγή σε validation behaviour / response shape (`{ ok:true }` και στα δύο). Το `apiError`/`markNotificationRead`/`saveList` flow αμετάβλητο.
  - Απομένουν ~15 routes με το ίδιο raw pattern για μελλοντικά runs (τεκμηρίωση στο PROGRESS).
  - npm run type-check exits 0
- Status: DONE (2026-07-01, commit `0c866eb`) — notifications PATCH + lists PATCH: η γραμμή body-parse `const b = (await req.json().catch(() => ({}))) as {...};` → `const b = await readBody(req);` (import `{ readBody }` από `@/lib/apiBody`, cast αφαιρέθηκε). Guards (notifications `typeof b.id === 'string' && b.id` + 24-hex· lists `typeof b.key === 'string'` + `Array.isArray(b.values)`) + response `{ ok:true }` αμετάβλητα. Επαληθεύτηκε στην 18η σάρωση: αμφότερα τα route files κάνουν πλέον import `readBody`. Adopters `readBody` **14**. tsc EXIT 0.

### apiBody helpers — readBody adoption σε items/[id] + shopping-list/[id] PATCH
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/items/[id]/route.ts, apps/web/src/app/api/v1/shopping-list/[id]/route.ts
- Depends on: none
- Acceptance:
  - Συνέχεια του apiBody adoption (14 routes ήδη adopters `readBody`). Το shared `readBody` ζει στο `lib/apiBody.ts`, επιστρέφει `Body` = `Record<string, unknown>` (δεν πετάει· bad/empty JSON → `{}`).
  - **items/[id] PATCH**: η μοναδική γραμμή `const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;` → `const b = await readBody(req);` (import `{ readBody }` από `@/lib/apiBody`). Το inline cast αφαιρείται (ίδιος τύπος `Body`).
  - **shopping-list/[id] PATCH**: ίδια αλλαγή στη γραμμή body-parse.
  - **PATCH σημείωση:** τα partial-update guards (`if (typeof b.x === 'string')` κ.λπ. — πρέπει να ξεχωρίζουν «πεδίο απόν» από «κενό») ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν· τα `strField`/`enumField` (με fallback) ΔΕΝ ταιριάζουν σε partial PATCH, δεν εφαρμόζονται. Το υπάρχον `ID_RE` guard στο shopping-list/[id] αμετάβλητο.
  - Καμία αλλαγή σε validation behaviour / response shape (`{item}` / `{ok:true}` αμετάβλητα) → μηδέν κίνδυνος για τον mobile consumer.
  - Απομένουν ~13 raw routes με το ίδιο pattern (ai, ai/subscription, items/[id]/link-plan, items/[id]/price, items/import, push/register, receipts/[id], receipts/[id]/rescan, scan/expense, scan/voucher, settings, stores/[id], shopping-list POST) για μελλοντικά runs (1-2/run).
  - npm run type-check exits 0
- Status: TODO

### Dedup ObjectId-validation regex σε shared guard
- Priority: P3
- Size: S
- Area: shared
- Files: apps/web/src/lib/apiBody.ts (ή apiAuth.ts) + καταναλωτές (ξεκίνα με shopping-list/[id], items/[id], items/[id]/price, items/[id]/link-plan)
- Depends on: none
- Acceptance:
  - Το literal `/^[a-f0-9]{24}$/i` επαναλαμβάνεται inline σε **19 route files (30 occurrences)**· ένα μόνο route (`shopping-list/[id]`) έχει ήδη local `ID_RE` const. Πρόσθεσε ΕΝΑ shared helper, π.χ. `export const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;` + `export function isObjectId(id: unknown): id is string { return typeof id === 'string' && OBJECT_ID_RE.test(id); }` στο `lib/apiBody.ts`.
  - Migrate **3-5 routes ανά run** (μη-sprawling): αντικατέστησε `/^[a-f0-9]{24}$/i.test(id)` → `isObjectId(id)` και σβήσε το local `ID_RE` const στο shopping-list/[id]. Το μήνυμα `apiError('bad id')` και ο status 400 ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ίδια.
  - Behavior-identical (ίδιο regex, ίδιο case-insensitive flag)· καμία αλλαγή σε response/validation. Καθαρά dedup.
  - Μην αλλάξεις το auth flow· η μετακίνηση αφορά ΜΟΝΟ το id-shape guard. Split σε πολλαπλά S runs αν χρειαστεί (μην αγγίξεις 19 files σε ένα commit).
  - npm run type-check exits 0
- Status: TODO

### apiBody helpers — readBody adoption σε expenses/[id] + subscriptions/[id] PATCH
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/expenses/[id]/route.ts, apps/web/src/app/api/v1/subscriptions/[id]/route.ts
- Depends on: none
- Acceptance:
  - Συνέχεια του apiBody adoption (6 routes ήδη adopters: expenses/subscriptions/vouchers/items/tasks/stores POST). Τα shared helpers ζουν στο `lib/apiBody.ts` (`readBody`/`strField`/`numField`/`enumField`/`boolField`).
  - **PATCH σημείωση:** τα `[id]` PATCH handlers χτίζουν partial `set` object με `if (typeof b.x === 'string')` guards (πρέπει να ξεχωρίζουν «πεδίο απόν» από «κενό») → οι `strField`/`enumField` (που έχουν fallback) ΔΕΝ ταιριάζουν στα partial guards. Το item αφορά ΜΟΝΟ την γραμμή body-parse.
  - **expenses/[id] PATCH** (γραμμή 15) + **subscriptions/[id] PATCH**: `const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;` → `const b = await readBody(req);` (import `{ readBody }` από `@/lib/apiBody`). Το `readBody` επιστρέφει ήδη `Record<string, unknown>` (τύπος `Body`) → το `as Record<string, unknown>` cast αφαιρείται, μηδέν αλλαγή σε τύπο.
  - Τα partial-update field guards (vendor/amount/category/kind/... σε expenses· name/amount/cycle/... σε subscriptions) ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν — καμία αλλαγή σε validation behaviour / response shape (ίδιο `{ ok:true, id }`).
  - Απομένουν ~21 routes με το ίδιο raw pattern για μελλοντικά runs (τεκμηρίωση στο PROGRESS).
  - npm run type-check exits 0
- Status: DONE (2026-07-01) — expenses/[id] PATCH + subscriptions/[id] PATCH: η γραμμή `const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;` → `const b = await readBody(req);` (import `{ readBody }` από `@/lib/apiBody`, ο τύπος επιστροφής `Body` = `Record<string, unknown>` → το cast αφαιρέθηκε, μηδέν αλλαγή τύπου). ΟΛΑ τα partial-update field guards (vendor/amount/category/kind/notes/date/period/recurring/recurringCycle/paymentMethod σε expenses· name/amount/billingCycle/category/active/nextRenewal σε subscriptions) αμετάβλητα· ίδιο response `{ ok:true, id }`. tsc EXIT 0· safe rebuild → /login 200, web restarts 0, PATCH expenses/subscriptions no-token → 401 (auth boundary intact). Adopters πλέον 8 (6 POST + 2 [id]-PATCH). **Ουρά Web Debt: 0 ενεργά items — όλα DONE.**

### apiBody helpers — adoption σε tasks + stores POST
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/tasks/route.ts, apps/web/src/app/api/v1/stores/route.ts
- Depends on: none
- Acceptance:
  - Συνέχεια του apiBody adoption (4 routes ήδη adopters: expenses/subscriptions/vouchers/items POST). Τα shared helpers ζουν στο `lib/apiBody.ts` (`readBody`/`strField`/`numField`/`enumField`/`boolField`).
  - **tasks POST** (`tasks/route.ts:47`): `const b = await readBody(req)`· `title` → `strField(b,'title','',true)`· `status` → `enumField(b,'status',['todo','in-progress','done','blocked'],'todo')`· `priority` → `enumField(b,'priority',['low','normal','high'],'normal')`· `content` → `strField(b,'content','')`. Τα `tags` (array/csv split) + `dueDate` (Date) ΜΕΝΟΥΝ ως έχουν (δεν υπάρχει helper για arrays/dates).
  - **stores POST** (`stores/route.ts:31`): `const b = await readBody(req)`· `name` → `strField(b,'name','',true)` (+ `if (!name) return apiError('name required')` αμετάβλητο)· `url` → `strField(b,'url','')`. Το `aliases` (custom `cleanAliases`) ΜΕΝΕΙ ως έχει.
  - Μηδέν αλλαγή σε validation behaviour / response shape (ίδια trimmed/required/fallback/enum semantics, 1:1 με τους helpers)· ίδιο 201 `{task}`/`{store}`.
  - Απομένουν ~23 routes με το ίδιο raw pattern για μελλοντικά runs (τεκμηρίωση στο PROGRESS).
  - npm run type-check exits 0
- Status: DONE (2026-07-01) — tasks POST: `readBody(req)` + `strField(b,'title','',true)` + `enumField(b,'status',TASK_STATUSES,'todo')` + `enumField(b,'priority',TASK_PRIORITIES,'normal')` + `strField(b,'content','')` (νέες const `TASK_STATUSES`/`TASK_PRIORITIES`)· tags/dueDate/completedAt αμετάβλητα. stores POST: `readBody(req)` + `strField(b,'name','',true)` + `strField(b,'url','',true)` (κράτησα `trim=true` για να διατηρηθεί ΑΚΡΙΒΩΣ το παλιό `b.url.trim()`, αντί για το χαλαρότερο `strField(b,'url','')` της περιγραφής)· aliases/`cleanAliases` αμετάβλητο. Response shapes `{task}`/`{store}` 201 αμετάβλητα. ΣΗΜ αμελητέα διαφορά semantics (ίδια με vouchers/items): name/url πλέον coerce-άρουν non-string input via `String()` (πριν: `typeof==='string'` αλλιώς ''), για κανονικό string input ταυτόσημα. tsc EXIT 0· safe rebuild → /login 200, web restarts 0, POST tasks/stores no-token → 401 (auth boundary intact). Adopters πλέον 6 (expenses/subscriptions/vouchers/items/tasks/stores). **Ουρά Web Debt: 0 ενεργά items — όλα DONE.**

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
- Status: DONE (2026-07-01) — vouchers POST: `readBody(req)` + 6× `strField(b, key, '', true)` (title/code/store/discount/url/notes· `expiresAt` αμετάβλητο). items POST: `readBody` + `strField(b,'title','',true)` + `enumField(b,'status',ITEM_STATUSES,'researching')` + `strField(b,'category','other')` + `numField(b,'currentPrice') ?? 0`. Response shapes αμετάβλητα. ΣΗΜ μία αμελητέα διαφορά semantics: το items `currentPrice` πλέον parse-άρει και numeric string (π.χ. "5"→5), ίδια συμπεριφορά με το `amount` σε subscriptions/expenses (πριν: μόνο number type, αλλιώς 0). tsc EXIT 0· safe rebuild → /login 200, web restarts 0, POST no-token → 401 (auth boundary intact). Adopters πλέον 4 (expenses/subscriptions/vouchers/items). **Ουρά Web Debt: 0 ενεργά items — όλα DONE.**

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
