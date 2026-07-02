# OSS_PROGRESS

Ημερολόγιο της OSS-release + test routine (τρέχει ωριαία, unattended). Κάθε εγγραφή:
τι έγινε, τι επαληθεύτηκε, και το επόμενο προτεινόμενο βήμα.

Κατάσταση baseline (πρώτη εγγραφή, 2026-07-01):
- (a) LICENSE — DONE, πλήρες κείμενο AGPL-3.0 (34KB).
- (b) Secrets scan — εκκρεμεί ρητός έλεγχος (`.env*` σωστά gitignored).
- (c) .env.example — υπάρχει (2.9KB), χρειάζεται πλήρης διασταύρωση με τα process.env.
- (d) README — DONE, public-facing με badges/banner/quick-start.
- (e) .github hygiene — DONE (ISSUE_TEMPLATE bug+feature, PULL_REQUEST_TEMPLATE, ci.yml, release.yml).
- (f) Test runner — ήταν το μοναδικό εκκρεμές· ξεκίνησε σε αυτό το run.

---

## 2026-07-01

**Task: (f) Στήσιμο του test runner (Vitest) + πρώτο test module.**

Τι έγινε:
- Πρόσθεσα `vitest@^2.1.9` στα devDependencies του `apps/web` (additive, μόνο devDep)
  και script `"test": "vitest run"`.
- Νέο `apps/web/vitest.config.ts`: node environment, include `src/**/*.test.ts`,
  χωρίς jsdom/DB (μόνο pure-lib tests προς το παρόν).
- Πρώτο test file `apps/web/src/lib/money.test.ts` (10 tests) για το `lib/money.ts`:
  `currencySymbol` (known codes, case-insensitivity, null/empty default σε €, unknown-code
  fallback, κάθε καταχωρημένο currency), `cur`/`setCurrencySymbol` (default, active symbol,
  empty→reset), και το catalogue (μηδέν διπλά ISO codes, ύπαρξη EUR). Reset του module var
  μετά από κάθε case.
- Πρόσθεσα `npm test` step στο `.github/workflows/ci.yml` (ανάμεσα σε type-check και build)
  ώστε τα tests να τρέχουν στο CI σε κάθε push/PR (δεν χρειάζεται Docker/Mongo).

Τι επαληθεύτηκε:
- `npx vitest run` → 1 file, 10 tests passed.
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: κανένα foreign αρχείο staged· στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (f συνέχεια) Γράψε το επόμενο pure-lib test file —
`apps/web/src/lib/storagePath.test.ts` για το `renderStoragePath` / sanitizeSegment:
default templates, path-injection prevention (store `a/b:c*?` → single segment),
empty-token collapse, extension handling. Ένα module ανά run.

---

## 2026-07-01 (cont.)

**Task: (f συνέχεια) Pure-lib test file `apps/web/src/lib/storagePath.test.ts` για το `renderStoragePath`.**

Τι έγινε:
- Νέο `apps/web/src/lib/storagePath.test.ts` (15 tests) που καλύπτει:
  default templates + empty-string fallback, **path-injection prevention** (store
  `a/b:c*?` → ένα segment `a_b_c`, traversal `../../etc` → flat `_.._etc` χωρίς `/../`,
  slash-in-name → single segment), empty-token collapse (empty `{total}` → collapse των
  διπλών separators + filter κενών folder segments + name fallback στο id), date handling
  (YYYY-MM-DD → year/month/day, non-ISO → κενά parts), extension (leading-dot strip +
  lowercase, empty ext → χωρίς κατάληξη), token defaults (files/unknown, total 5.00), και
  TEMPLATE_TOKENS metadata (μηδέν διπλά, κάλυψη όλων).
- **Εύρημα που διορθώθηκε στα expectations**: το `sanitizeSegment` regex είναι
  `[\\/:*?"<>|\x00-\x1F]` (illegal path chars + control-char range 0x00–0x1F), ΟΧΙ
  space/hyphen όπως φαινόταν στο Read (τα control bytes render-άρονταν ως κενά). Άρα
  διατηρεί τα hyphens: το `{date}` βγάζει `2026-06-04` (όχι `2026_06_04`). Τα tests
  pin-άρουν την πραγματική συμπεριφορά.

Τι επαληθεύτηκε:
- `npx vitest run src/lib/storagePath.test.ts` → 15/15 passed.
- `npx vitest run` (όλο το suite) → 2 files, 25/25 passed (money 10 + storagePath 15).
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git status --short` = μόνο `.claude/launch.json`
  (foreign, ΔΕΝ το άγγιξα, ΔΕΝ staged)· κανένα foreign αρχείο staged.

Suggested next task: (f συνέχεια) Επόμενο pure-lib test file —
`apps/web/src/lib/dates.test.ts` για το `safeDate` (ISO, European DD/MM/YYYY,
DD-MM-YYYY, DD.MM.YYYY, day-first >12 disambiguation, invalid → null/fallback).
Ένα module ανά run.

---

## 2026-07-01 (cont.²)

**Task: (f συνέχεια) Pure-lib test file `apps/web/src/lib/dates.test.ts` για τα `safeDate` / `safeDateOrNull`.**

Τι έγινε:
- Νέο `apps/web/src/lib/dates.test.ts` (16 tests) που καλύπτει:
  **European day-first parsing** (DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY → σωστό
  reorder σε ISO· single-digit day/month· `13/04/2025` → 13 April αποδεικνύει
  day-first, όχι month-first· whitespace trim), **ISO + native fall-through**
  (year-first `2025-09-23` μέσω native, ISO date-time, και το edge `04/13/2025`
  όπου month 13 κόβεται από το EU validation → V8 US M/D/Y fall-through), **invalid
  input → fallback** (μη-date string, empty/whitespace, null/undefined/number/object,
  day out-of-range `32/01/2025` + `13/13/2025`, default fallback ≈ now), και
  **`safeDateOrNull`** (Date για valid, null για invalid/empty/null/non-string).
- **Σημείωση συμπεριφοράς που pin-αρίστηκε**: το dates.ts ΔΕΝ κάνει "day-first >12
  disambiguation" (αυτό ζει στα AI prompts). Το EU regex διαβάζει ΠΑΝΤΑ την 1η ομάδα
  ως ημέρα· όταν το month>12 (US format) πέφτει στο native `new Date()`. Τα tests
  κλειδώνουν την πραγματική συμπεριφορά. TZ-stable assertions: EU branch = local
  midnight (getFullYear/getMonth/getDate), ISO = σύγκριση getTime() με reference.

Τι επαληθεύτηκε:
- `npx vitest run src/lib/dates.test.ts` → 16/16 passed.
- `npx vitest run` (όλο το suite) → 4 files, 49/49 passed (money 10 + storagePath 15
  + host 8 + dates 16).
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git status --short` = μόνο `.claude/launch.json`
  (foreign, ΔΕΝ το άγγιξα/staged) + το νέο dates.test.ts· κανένα foreign staged.

Suggested next task: (f συνέχεια) Επόμενο pure-lib test file —
`apps/web/src/lib/apiBody.test.ts` για το `lib/apiBody.ts` (2.5KB, helper που
διαβάζει/parse-άρει το body των REST v1 routes — deterministic, χωρίς DB/Mongo:
JSON parse, missing/empty body, invalid content, όποιο validation επιστρέφει).
Ένα module ανά run.

---

## 2026-07-01 (cont.³)

**Task: (f συνέχεια) Pure-lib test file `apps/web/src/lib/apiBody.test.ts` για το `lib/apiBody.ts`.**

Τι έγινε:
- Νέο `apps/web/src/lib/apiBody.test.ts` (26 tests) που καλύπτει και τα 6 exports:
  `isObjectId` (24-hex accept, case-insensitivity, wrong length 23/25, non-hex,
  empty/whitespace reject), `readBody` (valid JSON, async body, **reject → {}**),
  `strField` (present value, non-string coercion, falsy→fallback incl. 0/empty,
  default empty fallback, trim toggle + trimmed fallback), `numField` (numeric as-is,
  parse string, non-numeric→null, missing→null, **NaN/Infinity→null**, empty→null,
  zero accepted), `enumField` (allowed value, disallowed→fallback, missing→fallback),
  `boolField` (truthy/falsy/missing). `readBody` mocked με minimal NextRequest fake
  (μόνο `.json()`), χωρίς Next runtime.
- **Εύρημα που pin-αρίστηκε στα expectations**: το `readBody` κάνει `req.json().catch(...)`,
  άρα πιάνει ΜΟΝΟ async rejections — αν το `json()` πετάξει synchronously ή γυρίσει
  non-Promise, ΔΕΝ το πιάνει. Ο πραγματικός `NextRequest.json()` γυρίζει ΠΑΝΤΑ Promise,
  οπότε το fake γυρίζει Promise· αφαίρεσα το μη-ρεαλιστικό synchronous-throw case (2
  αρχικά failures που αποκάλυψαν αυτή τη συμπεριφορά → διορθώθηκαν στα tests, όχι στον κώδικα).

Τι επαληθεύτηκε:
- `npx vitest run src/lib/apiBody.test.ts` → 26/26 passed.
- `npx vitest run` (όλο το suite) → 5 files, 75/75 passed (money 10 + storagePath 15
  + host 8 + dates 16 + apiBody 26).
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git status --short` = μόνο `.claude/launch.json`
  (foreign, ΔΕΝ το άγγιξα/staged) + το νέο apiBody.test.ts· `git diff --cached` κενό·
  στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (f συνέχεια) Επόμενο pure-lib test file — serialize helpers.
Δες `apps/web/src/**/lib.ts` (π.χ. `expenses/lib.ts` `vendorKey`/`serializeExpense`,
ή `receipts` serialize) — pure, χωρίς DB, καλά για deterministic tests. Ένα module ανά run.

---

## 2026-07-02

**Task: (f συνέχεια) Pure-lib test file `apps/web/src/app/expenses/lib.test.ts` για τα serialize helpers του `expenses/lib.ts`.**

Τι έγινε:
- Νέο `apps/web/src/app/expenses/lib.test.ts` (14 tests) που καλύπτει και τα δύο
  pure exports: `vendorKey` (Greek→latin transliteration «ΔΕΗ/δεη/ΔεΗ → dei»,
  combining-diacritic strip «Café == Cafe», legal-suffix strip whole-word
  «Foo AE/A.E./Ltd/GmbH/Inc → foo», **embedded-suffix guard «Visa» ΔΕΝ χάνει το
  «sa»**, non-alnum/separator strip «PPC / ΔΕΗ → ppcdei», «Store 24 → store24»,
  whitespace trim, lowercase, 40-char cap, empty/whitespace/stopword «the»→''
  + nullish guard undefined/null→'') και `serializeExpense` (full field-for-field
  mapping, safe fallbacks σε near-empty doc, kind default = expense εκτός exactly
  'income', boolean coercion recurring/verified, _id stringify μέσω JSON round-trip).
- **Εύρημα που pin-αρίστηκε στα expectations (δεν άλλαξα κώδικα)**: το σχόλιο στο
  lib.ts ισχυρίζεται «PPC / ΔΕΗ → dei», αλλά η ΠΡΑΓΜΑΤΙΚΗ έξοδος είναι «ppcdei»
  (το «ppc» δεν είναι legal-suffix, μένει). Επιβεβαιώθηκε live με tsx πριν το test·
  το test κλειδώνει την πραγματική συμπεριφορά. Το σχόλιο είναι aspirational, όχι bug.

Τι επαληθεύτηκε:
- `npx vitest run src/app/expenses/lib.test.ts` → 14/14 passed.
- `npx vitest run` (όλο το suite) → 10 files, 165/165 passed.
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git status --short` = μόνο `.claude/launch.json`
  (foreign, ΔΕΝ το άγγιξα/staged) + το νέο lib.test.ts· `git diff --cached` κενό·
  στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (f συνέχεια) Επόμενο pure-lib test file — δες άλλα deterministic
serialize/normalize helpers χωρίς DB, π.χ. `lib/taxonomies.ts` (`normalizeList`/
`resolveTaxonomy`) ή `lib/prompts.ts` (`getPromptOverride` fallback logic, αν καθαρό
από I/O). Ένα module ανά run.

---

## 2026-07-02 (cont. — ssrf.test.ts)

**Task: (f συνέχεια) Pure-lib test file `apps/web/src/lib/ssrf.test.ts` για τον SSRF guard `assertPublicUrl` του `lib/ssrf.ts`.**

Τι έγινε:
- Νέο `apps/web/src/lib/ssrf.test.ts` (36 tests). Καλύπτει ντετερμινιστικά όλα τα
  no-DNS μονοπάτια: malformed URL → 'Invalid URL', non-http(s) schemes (ftp/file/gopher/
  javascript) → 'Only http(s)', bare internal names (localhost, *.localhost, *.local,
  host.docker.internal) → 'Internal host', literal IPv4 private/reserved (loopback,
  10/8, 192.168, 172.16-31, 169.254 metadata, 100.64 CGNAT, 198.18 benchmark, multicast,
  0.0.0.0) → reject + public literals (8.8.8.8, 1.1.1.1, 172.15/172.32 όρια) → pass,
  literal IPv6 private (::1, ::, fe80, fc00, fd00) → reject + public (2606:/2001:) → pass.
  Το hostname branch (DNS) μοκάρεται μέσω `vi.mock('node:dns/promises')`: public-resolve
  pass, **DNS-rebinding** (public name → 127.0.0.1) reject, mixed answers reject, empty/
  ENOTFOUND reject. Assert-άρω επίσης ότι τα no-DNS cases ΔΕΝ καλούν `lookup`.

- **ΕΥΡΗΜΑ ΑΣΦΑΛΕΙΑΣ (SSRF bypass, δες "## Needs Achilleas" πιο κάτω)**: τα IPv4-mapped
  IPv6 (`[::ffff:127.0.0.1]`, `[::ffff:10.0.0.1]`) **ΠΕΡΝΑΝΕ ως public** αντί να
  απορρίπτονται. Root cause: το WHATWG `URL` κανονικοποιεί το `::ffff:127.0.0.1` σε
  `::ffff:7f00:1` (hex compression) πριν φτάσει στον guard, αλλά το `ip6IsPrivate`
  ανιχνεύει mapped addresses ΜΟΝΟ με dotted-decimal regex (`/^::ffff:(\d+\.\d+\.\d+\.\d+)$/`)
  → δεν ματσάρει → επιστρέφει false → «public». Επιβεβαιώθηκε live με node. ΔΕΝ πείραξα
  τον `ssrf.ts` (εκτός territory — μόνο tests). Τα 2 σχετικά tests **κλειδώνουν την
  τρέχουσα (μη-ασφαλή) συμπεριφορά** με ρητό `KNOWN GAP` σχόλιο + comment στο test, ώστε
  μια μελλοντική διόρθωση στο ssrf.ts να τα γυρίσει ορατά από resolve→reject.

Τι επαληθεύτηκε:
- `npx vitest run src/lib/ssrf.test.ts` → 36/36 passed.
- `npx vitest run` (όλο το suite) → 14 files, 237/237 passed (ήταν 201).
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git status --short` = μόνο `.claude/launch.json`
  (foreign, ΔΕΝ το άγγιξα/staged) + το νέο ssrf.test.ts· `git diff --cached` κενό·
  στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (f συνέχεια) Επόμενο pure-lib test file — δες `lib/cardFields.ts`
(pure field-derivation helpers) ή `lib/aiModels.ts` (model metadata/list logic, αν
καθαρό από I/O). Ένα module ανά run. Και δες το "## Needs Achilleas" — το SSRF IPv4-mapped
gap θέλει one-liner fix στο `ip6IsPrivate` (normalize το ::ffff:HEX:HEX σε dotted πριν
τον έλεγχο) από τον Αχιλλέα, εκτός test territory.

## Needs Achilleas

- **[SSRF, 2026-07-02] IPv4-mapped IPv6 bypass στο `apps/web/src/lib/ssrf.ts`
  (`ip6IsPrivate`)**: `assertPublicUrl('http://[::ffff:127.0.0.1]/')` ΔΕΝ απορρίπτεται
  (περνά ως public), γιατί το WHATWG `URL` κάνει `::ffff:127.0.0.1` → `::ffff:7f00:1`
  (hex), και ο έλεγχος mapped βασίζεται σε dotted-decimal regex. Ένας επιτιθέμενος μπορεί
  να φτάσει loopback/private μέσω `http://[::ffff:7f00:1]/`. Fix (εκτός test territory):
  στο `ip6IsPrivate`, αποσυμπίεσε το IPv4-mapped hex (τα τελευταία 32 bits) σε dotted και
  τρέξε `ip4IsPrivate`, ή απόρριψε ρητά κάθε `::ffff:*`. Τα tests στο `ssrf.test.ts`
  (block "KNOWN GAP") κλειδώνουν την τωρινή συμπεριφορά· μόλις διορθωθεί, γύρνα τα από
  `.resolves.toBeUndefined()` σε `.rejects.toThrow('Private address not allowed')`.

---

## 2026-07-02 (cont. — cardFields.test.ts)

**Task: (f συνέχεια) Pure-lib test file `apps/web/src/lib/cardFields.test.ts` για τον API card-validator `cardFieldsFromBody` του `lib/cardFields.ts`.**

Τι έγινε:
- Νέο `apps/web/src/lib/cardFields.test.ts` (25 tests). Καλύπτει ντετερμινιστικά όλο
  τον validator (μηδέν DB/clock/fs): name required-on-create vs optional-on-update
  (blank/whitespace/non-string → null στο create, `{}` στο update), last4 strip-non-
  digits + cap 4 (empty-string όταν no digits), enums kind/type (accept valid, drop
  unknown), bank/color/notes trim (color θέλει non-empty guard, bank/notes γράφουν
  και κενό string), creditLimit numeric-string coerce + clamp>=0 + accept 0 + drop
  NaN/null/undefined, active boolean-only, + 2 integration cases (πλήρες valid body,
  και «drop invalid keep valid»). Κλειδώνει τη byte-identical συμπεριφορά που μοιράζονται
  POST + PATCH /api/v1/cards.

Τι επαληθεύτηκε:
- `npx vitest run src/lib/cardFields.test.ts` → 25/25 passed.
- `npx vitest run` (όλο το suite) → 17 files, 288/288 passed (ήταν 263).
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git status --short` = μόνο `.claude/launch.json`
  (foreign, ΔΕΝ το άγγιξα/staged) + το νέο cardFields.test.ts· `git diff --cached` κενό·
  στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (f συνέχεια) Επόμενο pure-lib test file — `lib/aiModels.ts`
(`priceForModel` longest-substring-match + `looksVisionModel` heuristic, τελείως καθαρό
από I/O) ή `lib/apiList.ts` (αν pure query/sort helpers). Ένα module ανά run. Εκκρεμεί
ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-02 (cont. — aiModels.test.ts)

**Task: (f συνέχεια) Pure-lib test file `apps/web/src/lib/aiModels.test.ts` για τα δύο καθαρά helpers του `lib/aiModels.ts` (`priceForModel`, `looksVisionModel`) + τα recommendation tables.**

Τι έγινε:
- Νέο `apps/web/src/lib/aiModels.test.ts` (15 tests, μηδέν DB/clock/fs). Καλύπτει:
  `priceForModel` longest-substring-match tie-break (gpt-4o-mini > gpt-4o,
  claude-3-5-haiku > claude-3-haiku, gpt-4.1-mini/nano > gpt-4.1), case-insensitivity,
  και τις 3 provider families (Anthropic/OpenAI-reasoning/Gemini) με τα ακριβή in/out
  ποσά του πίνακα, + null για unknown ids (llama/qwen/mistral/κενό). `looksVisionModel`
  negative-first guard (text-/embed/whisper/tts/davinci/moderation/instruct → false ακόμα
  κι όταν περιέχουν gpt-4o), positive cloud + local vision markers (vl/llava/minicpm-v/
  pixtral/llama-3.2/gemini), text-only local → false. Table invariants: κάθε
  PROVIDER_RECOMMEND έχει model+reason + περνά looksVisionModel· SCRAPER_RECOMMEND.anthropic
  είναι haiku + priced ({in:0.8,out:4}).

Τι επαληθεύτηκε:
- `npx vitest run src/lib/aiModels.test.ts` → 15/15 passed.
- `npx vitest run` (όλο το suite) → 19 files, 311/311 passed (ήταν 288).
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git status --short` = μόνο `.claude/launch.json`
  (foreign, ΔΕΝ το άγγιξα/staged) + το νέο aiModels.test.ts· `git diff --cached` κενό·
  στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (f συνέχεια) Επόμενο pure-lib test file — δες `lib/apiList.ts`
(query/sort/pagination helpers, αν καθαρό από I/O) ή `lib/dates.ts` `safeDate`
(European DD/MM parsing, deterministic). Ένα module ανά run. Εκκρεμεί ακόμα το SSRF
IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-02 (cont. — billing/plans.test.ts)

**Task: (f συνέχεια) Pure-lib test file `apps/web/src/lib/billing/plans.test.ts` για τον SaaS plan-ladder module `lib/billing/plans.ts` (`planDef`, `stripePriceId`, `planForPriceId` + το PLANS/PLAN_KEYS table).**

Τι έγινε:
- Νέο `apps/web/src/lib/billing/plans.test.ts` (16 tests, μηδέν DB/Stripe SDK). Καλύπτει:
  table invariants (τα 3 keys σε ladder order, κάθε def self-consistent `def.key===mapKey`,
  free = μόνο zero-price + no Stripe binding + AI 50, paid tiers με σωστό `stripePriceEnv`,
  μόνο dedicated = dedicated-isolation + customDomain + unlimited AI [null], storage
  monotonic free<shared<dedicated). `planDef` exact-match + fallback σε free για
  unknown/legacy/empty/null/undefined + case-sensitive ('FREE'→free). `stripePriceId`
  free→πάντα null, reads plan-bound env var, unset→null, trim + blank-only→null (τα δύο
  Stripe Price-ID env vars save/restore μέσω afterEach ώστε ντετερμινιστικό). `planForPriceId`
  reverse-map configured id→key, empty-id→null, unknown→null, no-config→null (guard κατά
  spurious unset==unset match).

Τι επαληθεύτηκε:
- `npx vitest run src/lib/billing/plans.test.ts` → 16/16 passed.
- `npx vitest run` (όλο το suite) → 25 files, 398/398 passed (ήταν 382).
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git status --short` = μόνο `.claude/launch.json`
  (foreign, ΔΕΝ το άγγιξα/staged) + το νέο plans.test.ts· `git diff --cached` κενό·
  στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (f συνέχεια) Επόμενο pure-lib test file — δες `lib/billing/entitlements.ts`
(pure plan→entitlement mapping, OSS parity note) ή `lib/i18n/format.ts` `relTime` (deterministic
με fake timers/fixed `Date.now`). Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix
στο "## Needs Achilleas".

---

## 2026-07-02 (cont. — billing/entitlements.test.ts)

**Task: (f συνέχεια) Pure-lib test file `apps/web/src/lib/billing/entitlements.test.ts` για τον plan→entitlement resolver `lib/billing/entitlements.ts` (`entitlementsFor`, `canUseAiFeature`, `withinStorage`, `withinAiQuota`).**

Τι έγινε:
- Νέο `apps/web/src/lib/billing/entitlements.test.ts` (17 tests, μηδέν DB/Stripe/clock/fs).
  Καλύπτει: `entitlementsFor` και για τα 3 plans (free 5GB/50, shared 50GB/1000,
  dedicated 500GB/null-unlimited/customDomain/dedicated-tier) + fallback σε free για
  unknown/legacy/empty/'FREE'/null/undefined, το **OSS-parity invariant** (κάθε plan παίρνει
  ΟΛΟ το AI_FEATURE_KEYS set — μηδέν per-feature lock), fresh-array guard (η aiFeatures ΔΕΝ
  είναι shared reference στο registry), `storageBytes === storageGB*GB` invariant.
  `canUseAiFeature` = true για κάθε feature σε κάθε plan (+ unknown→free→true).
  `withinStorage` = **boundary inclusive** (usedBytes <= cap → allowed, cap+1 → false,
  scales με plan, unknown→free cap). `withinAiQuota` = **exclusive upper bound**
  (usedCalls < cap → allowed, == cap → blocked, unlimited/null → πάντα true, unknown→free cap).
- **Σημείο που pin-αρίστηκε**: storage είναι `<=` (at-cap allowed) ενώ AI quota είναι
  `<` (at-cap blocked) — δύο διαφορετικά boundary semantics στο ίδιο module· τα tests τα
  κλειδώνουν ρητά ώστε ένα ακούσιο flip σε off-by-one να πέσει.

Τι επαληθεύτηκε:
- `npx vitest run src/lib/billing/entitlements.test.ts` → 17/17 passed.
- `npx vitest run` (όλο το suite) → 27 files, 429/429 passed (είχαν προστεθεί εν τω μεταξύ
  fileStorage+dbStats από άλλα routines· 412→429 με τα δικά μου 17).
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git status --short` = μόνο `.claude/launch.json`
  (foreign, ΔΕΝ το άγγιξα/staged) + το νέο entitlements.test.ts· `git diff --cached` κενό·
  στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (f συνέχεια) Επόμενο pure-lib test file — `lib/i18n/format.ts` `relTime`
(deterministic με fake timers / fixed `Date.now`: justNow/minutes/hours/yesterday/days
buckets + clamp αρνητικού διαστήματος στο 0) ή `lib/billing/usage.ts` αν pure. Ένα module ανά
run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-02 (cont. — i18n/format.test.ts)

**Task: (f συνέχεια) Pure-lib test file `apps/web/src/lib/i18n/format.test.ts` για το `relTime`
του `lib/i18n/format.ts` (localized "x ago" relative-time bucketing).**

Τι έγινε:
- Νέο `apps/web/src/lib/i18n/format.test.ts` (10 tests, μηδέν DB/fs/δίκτυο). Deterministic
  μέσω `vi.useFakeTimers()` + `vi.setSystemTime(NOW)` (NOW pin-αρισμένο στο
  2026-07-02T12:00:00Z), οπότε το `Date.now()` μέσα στο relTime είναι σταθερό· κάθε iso
  παράγεται με helper `ago(secondsAgo)`. Δύο μέτωπα ελέγχου:
  (α) **spy `t`** που καταγράφει το ΑΚΡΙΒΕΣ key + vars που διάλεξε το relTime, ανεξάρτητα
  από dictionary wording, ώστε να κλειδώσουν τα boundaries: justNow < 60s, minutes στα
  ακριβώς 60s (floor: 119s→1m, 3599s→59m), hours στα ακριβώς 3600s (floor: 7199s→1h,
  86399s→23h), **yesterday** (no vars) στο ακριβώς 1 ημέρα (και 2*86400-1 ακόμα day-1),
  days με floored count από 2 ημέρες κι επάνω· επίσης **future/edge clamp** — μελλοντικό iso
  (ago(-120)) και το ακριβές NOW → `Math.max(0,…)` → justNow.
  (β) **real English dict** (`makeT(resolveDict('en'))`) end-to-end: '1m ago'/'45m ago'/
  '1h ago'/'5h ago'/'yesterday'/'3d ago' — επιβεβαιώνει το {n} interpolation.
- **Σημείο που pin-αρίστηκε**: το yesterday branch ΔΕΝ περνά vars (`t('time.yesterday')`),
  σε αντίθεση με minutes/hours/days· το test το κλειδώνει ρητά (`vars: undefined`) ώστε
  ακούσια προσθήκη `{n}` να πέσει. Επίσης τα boundaries είναι `<` (exclusive upper) σε κάθε
  bucket — ελέγχονται και οι δύο πλευρές (59/60, 3599/3600, 86399/86400).

Τι επαληθεύτηκε:
- `npx vitest run src/lib/i18n/format.test.ts` → 10/10 passed.
- `npx vitest run` (όλο το suite) → 29 files, 447/447 passed (ήταν 437).
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git status --short` = μόνο `.claude/launch.json`
  (foreign, ΔΕΝ το άγγιξα/staged) + το νέο format.test.ts· `git diff --cached` κενό·
  στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (f συνέχεια) Επόμενο pure-lib test file — δες `lib/apiList.ts`
(query/sort/pagination helpers, αν καθαρό από I/O) ή `lib/dates.ts` `safeDate` (European
DD/MM/YYYY, DD.MM, ISO parsing — deterministic). Ένα module ανά run. Εκκρεμεί ακόμα το SSRF
IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-02 (cont. — i18n/index.test.ts)

**Task: (f συνέχεια) Pure-lib test file `apps/web/src/lib/i18n/index.test.ts` για τα `resolveDict` / `makeT` του `lib/i18n/index.ts`.**

ΣΗΜ: το `lib/apiList.ts` (προηγ. suggested task) είχε ΗΔΗ test file (`src/lib/apiList.test.ts`,
γραμμένο 04:35 από παράλληλο routine, εκτός δικού μου log) → το προσπέρασα για να μη γίνει overwrite,
και διάλεξα το επόμενο καθαρό module.

Τι έγινε:
- Νέο `apps/web/src/lib/i18n/index.test.ts` (15 tests, μηδέν DB/DOM/fs/δίκτυο). Καλύπτει:
  `resolveDict` — English base intact για 'en', el-overlay πάνω από en (nav.inventory
  'Inventory'→'Αποθήκη', time.minutes '{n}m ago'→'πριν {n}λ'), **fallback completeness**
  (κάθε locale από LOCALE_CODES εκθέτει ΟΛΑ τα en keys → καμία lookup undefined), κάθε
  locale resolve-άρει χωρίς throw + key count >= en, και **fresh-object guard** (mutation του
  resolved dict ΔΕΝ μολύνει το en base). `makeT` — known-key lookup, translated value μέσω
  resolved el, **δι-επίπεδο fallback** (partial dict → en[key], μετά → String(key) για entirely
  unknown), και {var} interpolation: no-vars passthrough, single/multi substitution, numeric
  coercion (0 και 42), **repeated placeholder** («{x}-{x}-{x}» → «a-a-a» μέσω split/join),
  unknown placeholder μένει άθικτο, extra vars αγνοούνται.
- **Robustness επιλογή**: interpolation/fallback edge cases σε μικρά synthetic dicts (casts),
  ώστε translation-wording edits να μη σπάνε τα tests· μόνο λίγες real-value assertions
  (nav.inventory/time.minutes σε en+el) κλειδώνουν το layering σε σταθερά keys.

Τι επαληθεύτηκε:
- `npx vitest run src/lib/i18n/index.test.ts` → 15/15 passed.
- `npx vitest run` (όλο το suite) → 31 files, 477/477 passed (ήταν 462, +15 δικά μου·
  παράλληλα routines είχαν φτάσει το baseline στα 462).
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git status --short` = μόνο `.claude/launch.json`
  (foreign, ΔΕΝ το άγγιξα/staged)· `git diff --cached` κενό· στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (f συνέχεια) Επόμενο pure-lib test file — `lib/tenancy/saasMode.ts`
(`saasMode` env-flag reader: on/1/true/yes → true, off/unset/άλλο → false, case/whitespace
insensitive· env save/restore μέσω afterEach) ή `lib/i18n/config.ts` (`isLocale` guard +
LOCALES table invariants). Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο
"## Needs Achilleas".

---

## 2026-07-02 (cont. — tenancy/saasMode.test.ts)

**Task: (f συνέχεια) Pure-lib test file `apps/web/src/lib/tenancy/saasMode.test.ts` για τον SaaS feature-flag reader `saasMode()` του `lib/tenancy/saasMode.ts`.**

ΣΗΜ: το `lib/i18n/config.ts` (η άλλη προτεινόμενη επιλογή) είχε ΗΔΗ test file
(`config.test.ts`, commit 7a0af2b από παράλληλο routine) → το προσπέρασα, διάλεξα το
`saasMode.ts` που δεν είχε κάλυψη.

Τι έγινε:
- Νέο `apps/web/src/lib/tenancy/saasMode.test.ts` (7 tests, μηδέν DB/δίκτυο/clock). Το
  `SAAS_MODE` είναι process-global env var → save/restore μέσω `afterEach` ώστε ντετερμινιστικό
  και χωρίς cross-test leakage. Καλύπτει: **default OFF** όταν unset (self-hosted single-user
  shape), empty/whitespace-only → OFF, τα 4 accepted truthy tokens (on/1/true/yes) → ON,
  case-insensitivity (ON/True/YES), whitespace trim πριν το match («  on  », «\ttrue\n»),
  explicit falsy/non-matching (off/0/false/no/enabled/2/onn) → OFF, και **partial-match guard**
  (whole-token μόνο: «on off», «turn on», «is-true», «10» → OFF).
- **Σημείο που κλειδώθηκε**: το gate είναι exact-token-after-trim-and-lowercase, ΟΧΙ substring
  match· το test το πιν-άρει ρητά ώστε μια ακούσια χαλάρωση σε `includes` να πέσει. Το default
  (undefined) === off είναι το invariant που κρατά το OSS self-hosted app να δουλεύει χωρίς config.

Τι επαληθεύτηκε:
- `npx vitest run src/lib/tenancy/saasMode.test.ts` → 7/7 passed.
- `npx vitest run` (όλο το suite) → 36 files, 538/538 passed (ήταν 531).
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git status --short` = μόνο `.claude/launch.json`
  (foreign, ΔΕΝ το άγγιξα/staged) + το νέο saasMode.test.ts· `git diff --cached` κενό·
  στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (f συνέχεια) Επόμενο pure-lib test file — δες `lib/tenancy/saasApi.ts`
(αν pure request/response helpers χωρίς DB) ή edge cases σε ακάλυπτα modules. Έλεγξε πρώτα με
`find src -name '*.test.ts'` ποια έμειναν χωρίς κάλυψη (πολλά routines γράφουν παράλληλα).
Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".
