# OSS_PROGRESS

Ημερολόγιο της OSS-release + test routine (τρέχει ωριαία, unattended). Κάθε εγγραφή:
τι έγινε, τι επαληθεύτηκε, και το επόμενο προτεινόμενο βήμα.

## 2026-07-02 (cont. — apiAuth.test.ts / apiError)

**Task: (f συνέχεια, μετάβαση σε validation-helper tests) Test file `apps/web/src/lib/apiAuth.test.ts`
για τον shared error-response builder `apiError` του `lib/apiAuth.ts`.**

Επιλογή target: το suggested step («API-shape tests που δεν θέλουν live Mongo, test the validation
helpers»). Τα καθαρά pure-lib targets έχουν εξαντληθεί (όλα τα exported pure helpers έχουν test· τα
απομένοντα untested lib files είναι network/DB/fs: `ollama`/`onedrive`/`remoteStorage`/`scrape`/
`search`/`storeService`/`appSettings`/`storage`/`notify`, ή θέλουν DOM όπως `clientImage`). Τα
inline `trim()`/`addCycle()` helpers στα `app/api/v1/*/route.ts` ΔΕΝ είναι exported → δεν testable
χωρίς source edit (εκτός territory). Το `apiError` είναι exported, pure (φτιάχνει `NextResponse.json`,
μηδέν DB call), και ουσιαστικό: είναι το error-response contract που parse-άρει το mobile app σε κάθε
αποτυχία `/api/v1`. Probe επιβεβαίωσε ότι το module import-άρεται καθαρά σε node vitest (το
`connectDB`/`User` που εισάγει είναι side-effect-free στο import· κανένα connection).

Τι έγινε:
- Νέο `apiAuth.test.ts` (9 tests). Καλύπτει: default status 400· body shape ακριβώς `{ error: msg }`·
  explicit status (401/403/404/500)· body↔status independence· `content-type: application/json`·
  empty-string message (χωρίς coercion σε default)· non-ASCII/ελληνικά verbatim· **καμία extra key**
  πέρα από `error`· fresh response object ανά call.

Τι επαληθεύτηκε:
- `npx vitest run src/lib/apiAuth.test.ts` → 9/9 passed.
- `npx vitest run` (όλο το suite) → 45 files, 676/676 passed.
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git diff --cached` κενό· `git status --short` foreign = μόνο
  `.claude/launch.json` (ΔΕΝ το άγγιξα/staged). Στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (validation-helper tests συνέχεια) Επόμενο target = ένα από τα άλλα shared
API helpers χωρίς DB. Υποψήφια: (α) `withAuth` του ίδιου `apiAuth.ts` με mocked `bearerUser`
(401-χωρίς-token / 500-on-throw paths, χρειάζεται vi.mock) — καλύπτει το auth gate κάθε route·
(β) `stores/route.ts cleanAliases` ΑΝ γίνει exported (θέλει source edit, εκτός territory τώρα).
Το `withAuth` είναι το πιο αξιόλογο. Τρέξε πρώτα `find src -name '*.test.ts'` (πολλά routines
γράφουν παράλληλα). Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-02 (cont. — .env.example completeness [task c])

**Task: (c) Ολοκλήρωση του `.env.example` — κάθε env var που διαβάζει ο web app να υπάρχει με ασφαλές placeholder + one-line σχόλιο.**

Επιλογή: παρά το ότι οι προηγούμενες εγγραφές εστίαζαν σε test files (f), έλεγξα ξανά την προτεραιότητα
a→f. Τα a/d/e είναι done (LICENSE AGPL-3.0 661 γρ., README, .github τα 5 αρχεία, CONTRIBUTING/SECURITY/
COC υπάρχουν). Αλλά το (c) ΔΕΝ ήταν done: diff `process.env.*` (apps/web/src) vs `.env.example` έδειξε
**20 undocumented vars** (Stripe ×4, SaaS ×5, cloud AI keys ×3, MONGO_URI, STORAGE_ROOT, OLLAMA_HOST/
VISION_MODEL/KEEP_ALIVE, SEARXNG_URL, CRON_SECRET, APP_URL). Το (c) είναι υψηλότερης προτεραιότητας από
άλλο test file, οπότε το διάλεξα.

Τι έγινε (`.env.example`):
- MONGO_URI (με native-dev σημείωση στο apps/web/.env.local) κάτω από το MongoDB section.
- Επέκταση του App-level section: STORAGE_ROOT, OLLAMA_HOST, OLLAMA_VISION_MODEL, OLLAMA_KEEP_ALIVE,
  SEARXNG_URL (compose vs native-dev defaults σε κάθε ένα).
- Νέο «Cloud AI providers (OPTIONAL)»: ANTHROPIC/OPENAI/GEMINI keys, κενά, με σαφήνεια ότι όλα είναι
  local by default και το key είναι μόνο fallback του DB setting.
- Νέο «SaaS / multi-tenant mode (OPTIONAL)»: SAAS_MODE, SAAS_BASE_DOMAIN, SAAS_PUBLIC_URL, APP_URL,
  SAAS_SESSION_IDLE_HOURS, CRON_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_SHARED,
  STRIPE_PRICE_DEDICATED, RESEND_API_KEY. Όλα κενά, με ρητή σημείωση «self-host αφήνει όλο το section κενό».
- Τα σχόλια βασίστηκαν σε πραγματικό grep του κάθε usage (defaults/fallbacks), όχι σε μαντεψιά.

Τι επαληθεύτηκε:
- `comm -23` (used vs documented) → απομένει ΜΟΝΟ `NODE_ENV` (framework-managed, σωστά παραλείπεται).
- Secret scan (`git grep` για sk-/sk_live_/AKIA/ghp_/private keys/creds-in-URI, εκτός .env.example+tests)
  → μόνο placeholder connection strings (`${MONGO_USER:-admin}`, `admin:changeme`) σε compose/scraper.
  ΚΑΝΕΝΑ πραγματικό secret. `.env`/`.env.local`/`apps/web/.env` επιβεβαιωμένα gitignored.
- Meta-only αλλαγή → κανένα build (σύμφωνα με τους κανόνες).
- Collision guard: `git diff --cached` κενό πριν το stage· foreign `.claude/launch.json` modified αλλά ΔΕΝ
  το άγγιξα/staged. Στάγιαρα μόνο `.env.example`. Commit `09f4e0b`, pushed καθαρά.

Suggested next task: (f συνέχεια) Επόμενο pure-lib/pure-shape test file. Τα a–e είναι πλέον όλα done. Το (b)
secret-scan έτρεξε clean αυτό το run. Οπότε μένει το (f): τρέξε πρώτα `find apps/web/src -name '*.test.ts'`
(πολλά routines γράφουν παράλληλα), βρες ένα ακάλυπτο pure target (π.χ. άλλο `app/api/v1/*/serialize.ts`
ή pure helper σε `lib/billing/plans.ts` an έχει exported pure functions). Ένα module ανά run. Εκκρεμεί ακόμα
το SSRF IPv4-mapped fix στο «## Needs Achilleas».

---

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

---

## 2026-07-02 (cont. — session.test.ts)

**Task: (f συνέχεια) Pure-lib test file `apps/web/src/lib/session.test.ts` για τους edge-safe
session helpers του `lib/session.ts` (JWT sign/verify με jose, cookie options, refresh logic).**

Επιλογή: έτρεξα `find src -name '*.test.ts'` — 37 test files υπήρχαν ήδη· το `session.ts`
(auth-critical, jose-only, μηδέν DB/network) ήταν ακάλυπτο και pure → ιδανικό. Το `apiAuth.ts`
(η άλλη σκέψη) χτυπά DB στο `bearerUser` → δεν είναι clean pure target.

Τι έγινε:
- Νέο `apps/web/src/lib/session.test.ts` (25 tests, μηδέν DB/δίκτυο). Τα AUTH_SECRET /
  AUTH_COOKIE_SECURE διαβάζονται at call-time (όχι module-load) → save/restore μέσω
  beforeEach/afterEach, ντετερμινιστικά χωρίς cross-test leakage. Το SESSION_MAX_AGE /
  IDLE_HOURS είναι frozen at module-load → κάνω assert πάνω στο **exported SESSION_MAX_AGE
  constant** (όχι hardcoded 43200) ώστε να μη σπάει αν το CI ορίσει SESSION_IDLE_HOURS.
- Κάλυψη: **constants** (SESSION_COOKIE='pharos_session', MAX_AGE positive int)·
  **sessionCookieOptions** (httpOnly/sameSite=lax/path='/'/maxAge· secure ΜΟΝΟ όταν
  AUTH_COOKIE_SECURE==='true' exact, όχι 'yes'/'1')· **authConfigured** (fail-closed: unset
  ή <16 chars → false, ≥16 → true)· **signSession** (throw χωρίς secret, compact JWT 3
  segments)· **sign→verify roundtrip** (sub/role/name/exp ανακτώνται, exp ≈ MAX_AGE ahead)·
  **verifySession** security edges: null σε empty/no-secret/garbage/**wrong-secret**/**expired**/
  **no-sub**, **role defaults σε member** (unknown 'superuser' ΔΕΝ γίνεται σιωπηλά admin),
  missing name → '' · **shouldRefresh** (undefined→false, fresh→false, past-half→true,
  expired→true, long-lived-outliving-window→true/shrink-on-sight).
- **Σημείο ασφαλείας που κλειδώθηκε**: το role-clamp (μόνο 'admin' literal → admin, αλλιώς
  member) + το fail-closed χωρίς secret· ένα ακούσιο loosening θα έπεφτε ορατό.

Τι επαληθεύτηκε:
- `npx vitest run src/lib/session.test.ts` → 25/25 passed.
- `npx vitest run` (όλο το suite) → 38 files, 573/573 passed (ήταν 538· +25 δικά μου, τα
  υπόλοιπα από παράλληλα routines).
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git status --short` = μόνο `.claude/launch.json` (foreign,
  ΔΕΝ το άγγιξα/staged) + το νέο session.test.ts· `git diff --cached` κενό· στάγιαρα μόνο τα
  δικά μου paths.

Suggested next task: (f συνέχεια) Επόμενο pure-lib test file. Ακάλυπτα καθαρά targets:
`lib/pdf.ts` → `looksLikeScannedPdf(text)` (pure heuristic, ντετερμινιστικό) και/ή
`lib/aiConfig.ts` → `isVisionModel(name)` (pure regex classifier). Τρέξε πρώτα
`find src -name '*.test.ts'` (πολλά routines γράφουν παράλληλα). Ένα module ανά run.
Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-02 (cont. — pdf.test.ts)

**Task: (f συνέχεια) Pure-lib test file `apps/web/src/lib/pdf.test.ts` για τον scanned-PDF heuristic `looksLikeScannedPdf(text)` του `lib/pdf.ts`.**

Επιλογή: από τα δύο suggested targets διάλεξα το `pdf.ts` γιατί είναι import-side-effect-free
(η μόνη εξωτερική εξάρτηση, pdfjs-dist, είναι dynamic `import()` ΜΕΣΑ στο `extractPdfText` που
τα tests δεν καλούν). Το `aiConfig.ts` (το άλλο target) φορτώνει `./db` + mongoose στο module load,
οπότε δεν είναι εξίσου καθαρό pure target· το προσπέρασα. Κανένα από τα δύο δεν είχε test file.

Τι έγινε:
- Νέο `apps/web/src/lib/pdf.test.ts` (14 tests, μηδέν DB/fs/δίκτυο/clock). Κανόνας υπό έλεγχο:
  strip ΟΛΟ το whitespace, μετά `nonWhitespaceLength < 40`. Καλύπτει: empty/whitespace-only →
  scanned (spaces, μεικτό ASCII ws tab/newline/CR/FF/VT, και Unicode ws που πιάνει το `\s` —
  NBSP/ideographic/line-sep/BOM), το **ακριβές 40-char boundary** (39 → true, ακριβώς 40 →
  false [exclusive], 41 → false), **whitespace δεν μετράει** (40 γράμματα σκορπισμένα σε βαρύ ws
  → not scanned· 39 θαμμένα σε ws → scanned· σελίδα με 500 blank lines → scanned), και
  real-world shapes (sparse OCR-failure snippet → scanned, γνήσια statement γραμμή → not scanned,
  **Greek/non-ASCII glyphs μετράνε ως extractable text**, σύντομο ελληνικό store name → scanned).
- **Σημείο parser που κλειδώθηκε στα σχόλια**: το Unicode-whitespace case γράφτηκε με `\u` escapes
  (`' 　 ﻿'`), ΟΧΙ literal invisible glyphs — το U+2028/U+2029 είναι source
  line terminator και σπάει το esbuild parse αν μπει literally (το έμαθα από 1 αρχικό transform
  failure· διορθώθηκε στο test, όχι στον κώδικα).

Τι επαληθεύτηκε:
- `npx vitest run src/lib/pdf.test.ts` → 14/14 passed.
- `npx vitest run` (όλο το suite) → 40 files, 600/600 passed.
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git status --short` = μόνο `.claude/launch.json` (foreign,
  ΔΕΝ το άγγιξα/staged) + το νέο pdf.test.ts· `git diff --cached` κενό· στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (f συνέχεια) Επόμενο pure-lib test file — δες `lib/aiConfig.ts`
→ `isVisionModel(name)` (pure regex classifier· ΣΗΜ: το module φορτώνει mongoose στο import,
οπότε ίσως χρειαστεί `vi.mock('./db')` + `vi.mock('@/models/AppConfig')` για καθαρό import),
ή άλλο ακάλυπτο pure heuristic. Τρέξε πρώτα `find src -name '*.test.ts'` (πολλά routines γράφουν
παράλληλα). Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-02 (cont. — aiConfig.test.ts)

**Task: (f συνέχεια) Pure-lib test file `apps/web/src/lib/aiConfig.test.ts` για τον vision-model classifier `isVisionModel(name)` του `lib/aiConfig.ts`.**

Επιλογή: το suggested target από το προηγούμενο entry. Η ανησυχία «το module φορτώνει mongoose
στο import» ελέγχθηκε με smoke import μέσα στο vitest → **δεν χρειάζεται mock**: το `connectDB`
καλείται lazily ΜΟΝΟ μέσα στο `getAiConfig`, ενώ το `import { isVisionModel }` απλώς ορίζει το
regex + registers το AppConfig mongoose schema (καμία σύνδεση). Οπότε καθαρό pure test, μηδέν
`vi.mock`.

Τι έγινε:
- Νέο `apps/web/src/lib/aiConfig.test.ts` (8 tests, μηδέν DB/fs/δίκτυο/clock). Κανόνας υπό έλεγχο:
  case-insensitive **SUBSTRING** regex `/vl|vision|llava|minicpm-v|moondream|bakllava|
  llama3.2-vision/i`. Καλύπτει: πραγματικά vision tags (qwen2.5vl, qwen2-vl, llava, minicpm-v,
  moondream, bakllava, llama3.2-vision), το γενικό «vision» hint ανεξαρτήτως vendor (gpt-4-vision),
  case-insensitivity (VL/LLaVA/MINICPM-V/MoonDream), text-only → false (qwen2.5:14b, llama3.1,
  mistral, gemma2, phi3, deepseek-r1), empty → false, bare «vl» → true, mid-string hint με registry
  path, και **τεκμηριωμένο το substring/no-word-boundary trade-off** (vllm/vlan → true false-positive·
  novel/swivel/gpt-4o → false γιατί δεν έχουν το token «vl»/«vision»).
- **Σημείο που κλειδώθηκε**: το over-include (false positive σε ό,τι περιέχει «vl») είναι
  σκόπιμο — ένα extra vision candidate ποτέ δεν σπάει image parse, ενώ ένα false negative θα το
  έσπαγε· αν κάποιος σφίξει το regex με word boundaries, το test θα το κάνει ορατή απόφαση.

Τι επαληθεύτηκε:
- `npx vitest run src/lib/aiConfig.test.ts` → 8/8 passed.
- `npx vitest run` (όλο το suite) → 41 files, 614/614 passed.
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git status --short` = μόνο `.claude/launch.json` (foreign,
  ΔΕΝ το άγγιξα/staged) + το νέο aiConfig.test.ts· `git diff --cached` κενό· στάγιαρα μόνο τα
  δικά μου paths.

Suggested next task: (f συνέχεια) Επόμενο pure-lib test file. Ακάλυπτα καθαρά targets:
`lib/aiProviders.ts` (τα internal helpers `mediaTypeOf`/`stripFences` ΔΕΝ είναι exported →
θα χρειαζόταν export ή testing μέσω των public JSON helpers με fetch mock· καλύτερα skip),
`lib/clientImage.ts` (δες αν έχει pure resize/format helpers χωρίς canvas/DOM), ή serialize
helpers σε app routes. Τρέξε πρώτα `find src -name '*.test.ts'` (πολλά routines γράφουν
παράλληλα). Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-02 (cont. — receipts/serialize.test.ts)

**Task: (f συνέχεια) Pure-shape test file `apps/web/src/app/api/v1/receipts/serialize.test.ts` για τους δύο serializers (`serializeLineItems`, `trimReceipt`) του mobile receipts API (`app/api/v1/receipts/serialize.ts`).**

Επιλογή: το suggested target («serialize helpers σε app routes») από το προηγούμενο entry. Απο τα δύο
untested app-route pure helpers (`expenses/lib.ts` έχει ήδη test), διάλεξα το receipts `serialize.ts`
γιατί είναι καθαρό pure target: η μόνη dependency είναι το `iso` του `lib/apiList.ts`, που είναι pure
one-liner (`d ? new Date(d).toISOString() : null`), και το `apiList.ts` κάνει μόνο `import type
{ NextRequest }` (type-only, erased at compile) → μηδέν side effect / DB / fs / δίκτυο / clock στο import.

Τι έγινε:
- Νέο `serialize.test.ts` (17 tests). Καλύπτει τη shared API-shape που επιστρέφουν και τα 3 receipt
  endpoints (detail GET, rescan POST, scan POST):
  - `serializeLineItems`: null/undefined/[] → []· **refinedName (AI-cleaned) κερδίζει το raw name**·
    fallback σε name όταν refinedName λείπει Ή είναι κενό string (falsy `||`)· κενό-string name όταν
    λείπουν και τα δύο· defaults qty=1/price=0/vatRate=0· **explicit zeros επιβιώνουν το `??`** (qty:0
    δεν γίνεται 1)· σειρά διατηρείται σε multiple items.
  - `trimReceipt`: `String(_id)` (και για ObjectId-like με toString)· date/updatedAt μέσω `iso`
    (Date→ISO, absent→null)· money defaults →0 + preserve provided· currency default EUR·
    paymentMethod default ''· itemCount = lineItems.length ?? 0· **booleanize** verified/archived/
    deleted (deleted από `!!deletedAt`, με deletedAt:null → false)· file/thumb από paths, `|| null`
    (κενό string collapses σε null).

Τι επαληθεύτηκε:
- `npx vitest run src/app/api/v1/receipts/serialize.test.ts` → 17/17 passed.
- `npx vitest run` (όλο το suite) → 42 files, 638/638 passed.
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git diff --cached` κενό (κανένα concurrent routine mid-commit)·
  `git status --short` = foreign `.claude/launch.json` + `apps/web/SAAS_PROGRESS.md` (ΔΕΝ τα άγγιξα/
  staged) + το νέο serialize.test.ts. Στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (f συνέχεια) Επόμενο pure-lib test file. Ακάλυπτα καθαρά targets που απομένουν:
`lib/notifiers.shared.ts` NOTIFIER_TYPES **έχει ήδη test** (notifiers.test.ts)· `lib/clientImage.ts`
θέλει DOM/canvas (skip σε node vitest)· `scrape.ts`/`search.ts`/`storeService.ts`/`appSettings.ts`
είναι network/DB (skip pure). Πιθανά: άλλα `app/api/v1/*/serialize.ts` (τρέξε `find src/app/api/v1
-name serialize.ts`) ή pure helpers σε `models/`. Τρέξε πρώτα `find src -name '*.test.ts'` (πολλά
routines γράφουν παράλληλα). Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο
"## Needs Achilleas".

---

## 2026-07-02 (cont. — expoPush.test.ts)

**Task: (f συνέχεια) Pure-lib test file `apps/web/src/lib/expoPush.test.ts` για το type-guard `isExpoPushToken` του `lib/expoPush.ts`.**

Επιλογή target: το suggested «επόμενο pure-lib test file». Έλεγξα τους υποψηφίους:
`aiProviders.ts` (τα pure helpers `mediaTypeOf`/`stripFences` ΔΕΝ είναι exported → skip χωρίς
source edit, εκτός territory)· `notify.ts` (ο ascii-sanitizer είναι inline, όχι exported·
network)· `prompts.ts`/`storageConfig.ts` (DB)· `revalidate.ts` (next/cache wrapper)· `models/*`
(μηδέν pure exports). Διάλεξα το `isExpoPushToken` γιατί είναι καθαρό pure guard (regex πάνω σε
string, μηδέν clock/fs/network/DB στο ίδιο το function) ΚΑΙ έχει πραγματική αξία: είναι το
validation gate που αποφασίζει ποια strings αποθηκεύονται ως push tokens σε user + fan-out στο
Expo. Το module κάνει `import` το `db`/`User`, αλλά αυτό είναι μόνο mongoose schema registration
στο import (καμία σύνδεση), οπότε το load σε node vitest είναι side-effect-free· τα tests δεν
αγγίζουν DB.

Τι έγινε:
- Νέο `expoPush.test.ts` (12 tests). Καλύπτει: αποδοχή και των δύο shapes (ExponentPushToken[…]
  / ExpoPushToken[…])· any non-`]` char μέσα στα brackets· trim leading/trailing whitespace·
  απόρριψη κενών brackets (`[^\]]+` απαιτεί ≥1 char)· missing/malformed bracket· leading/trailing
  content γύρω από το token· case-sensitivity στο prefix· nested-but-wrong prefix (ExponentToken /
  PushToken)· κενό + whitespace-only string· non-string values (null/undefined/number/bool/array/
  object)· type-narrowing στο true branch.

Τι επαληθεύτηκε:
- `npx vitest run src/lib/expoPush.test.ts` → 12/12 passed.
- `npx vitest run` (όλο το suite) → 43 files, 652/652 passed.
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git diff --cached` κενό (κανένα concurrent routine mid-commit)·
  `git status --short` = foreign `.claude/launch.json` (ΔΕΝ το άγγιξα/staged) + το νέο
  expoPush.test.ts. Στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (f συνέχεια) Επόμενο pure-lib test file. Απομένοντα καθαρά targets είναι
πλέον λίγα: τα περισσότερα exported pure helpers έχουν test. Πιθανά: (α) additive-export ενός
από τα `aiProviders.ts` internal helpers (`stripFences`/`mediaTypeOf`) ΑΝ ο χρήστης εγκρίνει
source edit (τώρα εκτός territory)· (β) API-shape tests που δεν θέλουν live Mongo (validation
helpers σε api routes, π.χ. body-parsers)· (γ) pure branches σε `models/` αν προστεθούν helpers.
Τρέξε πρώτα `find src -name '*.test.ts'` (πολλά routines γράφουν παράλληλα). Ένα module ανά run.
Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-02 (cont. — expenses/serialize.test.ts)

**Task: (f συνέχεια) Pure API-shape test file `apps/web/src/app/api/v1/expenses/serialize.test.ts` για το `trimExpense` του `app/api/v1/expenses/serialize.ts`.**

Επιλογή target: το `receipts/serialize.ts` είχε ήδη test· το αδελφό `expenses/serialize.ts` (το άλλο v1 serializer) ήταν ακάλυπτο. Καθαρός στόχος: το `trimExpense` είναι deterministic (μηδέν clock/fs/network/DB· το `iso` είναι pure Date→ISO wrapper, το apiList import μόνο type), και είναι το single source of truth για το v1 Expense JSON shape που μοιράζονται το GET /api/v1/expenses (list) + το rescan POST, οπότε το τεστ κλειδώνει το contract που καταναλώνει το mobile detail.

Τι έγινε:
- Νέο `expenses/serialize.test.ts` (12 tests). Καλύπτει: _id→String coercion (number + toString object)· όλα τα defaults από bare _id (kind='expense', category='other', amount=0, currency='EUR', date=null, period='', recurring=false, recurringCycle='', paymentMethod='', notes='', file=null, thumb=null, verified=false, updatedAt=null, deleted=false)· passthrough populated scalars (incl. ελληνικά notes)· **amount 0 / αρνητικό διατηρείται** (δεν το πατάει το default)· booleanize recurring/verified· date+updatedAt → ISO μέσω iso()· null date όταν λείπει· empty-string filePath/thumbPath → null· non-empty paths passthrough· deleted true μόνο με deletedAt set (null/absent → false)· **exact key-set guard** (extra lean fields όπως __v δεν διαρρέουν στο output).

Τι επαληθεύτηκε:
- `npx vitest run src/app/api/v1/expenses/serialize.test.ts` → 12/12 passed.
- `npx vitest run` (όλο το suite) → 47 files, 702/702 passed.
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git diff --cached` κενό (κανένα concurrent routine mid-commit)· `git status --short` = foreign `.claude/launch.json` (ΔΕΝ το άγγιξα/staged) + το νέο serialize.test.ts. Στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (f συνέχεια) Επόμενο pure test file. Με τα δύο v1 serializers καλυμμένα, απομένοντα καθαρά targets: (α) API-shape/validation helpers σε api routes που δεν θέλουν live Mongo (π.χ. body-parsers/query-parsers σε app/api/v1/*)· (β) additive-export ενός `aiProviders.ts` internal helper (`stripFences`/`mediaTypeOf`) ΑΝ εγκριθεί source edit (τώρα εκτός territory). Τρέξε πρώτα `find src -name '*.test.ts'` (πολλά routines γράφουν παράλληλα). Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-02 (cont. — aiTools.test.ts + server-only vitest shim)

**Task: (f συνέχεια) Pure test file `apps/web/src/app/aiTools.test.ts` για το `TOOLS` registry + τον `today()` helper του `app/aiTools.ts`, μαζί με μικρή test-infra προσθήκη (server-only shim).**

Επιλογή target: με τα δύο v1 serializers ήδη καλυμμένα, διάλεξα το `TOOLS` array του `aiTools.ts` — είναι το single source of truth των AI tool schemas που καταναλώνουν ΚΑΙ το chat command bar (runAiCommand) ΚΑΙ το MCP route, και πάνω σε αυτά κάνει validate το Anthropic tool-calling τα tool_use blocks. Ένα σπασμένο schema (required key χωρίς matching property, διπλό tool name, κενό enum) ΔΕΝ σκάει build· σπάει σιωπηλά το tool-calling στο runtime. Καθαρός στόχος (deterministic, μηδέν DB): το registry είναι static, ο `today()` είναι pure Date→ISO slice. Το `execute()` dispatcher θέλει live DB → εκτός scope.

Εμπόδιο + λύση (test infra): το import chain του `aiTools` (μέσω items/expenses actions → `lib/mirror.ts`) κάνει `import 'server-only'`, που το vitest (σκέτο node, χωρίς Next bundler) δεν resolve-άρει → «Failed to load url server-only». Το `server-only` στο production είναι **build-time-only empty module** (μοναδικός σκοπός: build error αν μπει σε client bundle· μηδέν runtime). Πρόσθεσα:
- `apps/web/src/test/stubs/server-only.ts` (κενό `export {}`)·
- alias `'server-only' → stub` στο `vitest.config.ts` (μέσα στο υπάρχον resolve.alias, δίπλα στο `@`).
Semantically σωστό για node test env (ταιριάζει με το no-op runtime) και ξεκλειδώνει testing των pure exports server modules γενικότερα σε μελλοντικά runs.

Τι έγινε:
- Νέο `aiTools.test.ts` (11 tests). Καλύπτει: non-empty registry· **exact canonical tool-name set** (11 tools, mirror — add/remove tool must update the test)· unique names· non-empty name+description ανά tool· κάθε `input_schema` = JSON-schema object με properties· **`required` keys υπάρχουν όλα στα `properties`** (το κύριο invariant)· κάθε enum = non-empty array of strings· mutation tools (update_record/delete_record) `type` enum == ['item','task','subscription'] + required type+id (sync με modelFor dispatcher)· add_expense required == [amount, vendor]. Plus `today()`: ISO YYYY-MM-DD shape + == `new Date().toISOString().slice(0,10)`.

Τι επαληθεύτηκε:
- `npx vitest run src/app/aiTools.test.ts` → 11/11 passed.
- `npx vitest run` (όλο το suite) → 48 files, 714/714 passed (server-only alias δεν έσπασε κανένα υπάρχον test).
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git diff --cached` κενό (κανένα concurrent routine mid-commit)· `git status --short` = foreign `.claude/launch.json` (ΔΕΝ το άγγιξα/staged) + τα δικά μου. Στάγιαρα μόνο `aiTools.test.ts`, `src/test/stubs/server-only.ts`, `vitest.config.ts`.

Suggested next task: (f συνέχεια) Με το server-only shim στη θέση του, ξεκλειδώθηκαν pure-export tests σε server modules που πριν δεν φόρτωναν. Καθαρά targets: (α) pure exports σε `lib/` modules που πριν έσκαγαν στο `server-only` (π.χ. helper functions που ζουν δίπλα σε server code)· (β) το `SYSTEM` prompt string του `aiTools.ts` (μπορεί να ελεγχθεί για invariants αν χρειαστεί, χαμηλή αξία)· (γ) άλλα `app/**/lib.ts` ή shape-helpers. Τρέξε πρώτα `find src -name '*.test.ts'` (πολλά routines γράφουν παράλληλα) + `git status` collision-guard. Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-02 (cont. — auth.test.ts, password hashing)

**Task: (f συνέχεια) Pure test file `apps/web/src/lib/auth.test.ts` για τους scrypt password helpers `hashPassword` / `verifyPassword` του `lib/auth.ts`.**

Επιλογή target: το `lib/auth.ts` ήταν ακάλυπτο και οι δύο pure exports είναι credential-critical — το `verifyPassword` είναι το gate κάθε login. Ελέγχθηκε ότι το import φορτώνει καθαρά σε node vitest (probe): παρότι το module εισάγει `next/headers`/`next/navigation` στην κορυφή, αυτά είναι μόνο function imports (καμία εκτέλεση στο import), άρα μηδέν mock χρειάστηκε. Το scrypt τρέχει μέσω `node:crypto` (διαθέσιμο στο test env), οπότε ντετερμινιστικό roundtrip χωρίς DB/cookies. Οι async accessors (`getCurrentUser`/`requireUser`/`requireAdmin`/`setSessionCookie`) αγγίζουν cookies+session → εκτός scope.

Τι έγινε:
- Νέο `auth.test.ts` (11 tests). Καλύπτει: `hashPassword` shape (`scrypt$N$r$p$salt$hash`, 6 parts, prefix, default cost N=16384/r=8/p=1, salt 16 bytes + hash 64 bytes base64), **fresh random salt ανά call** (ίδιο password → διαφορετικά strings αλλά και τα δύο verify). `verifyPassword`: roundtrip, wrong-password (case-sensitive, missing char, empty), empty+unicode password roundtrip (accent-sensitive), **reads cost params από το stored string** (χειροποίητο hash σε N=1024 verify-άρει → αποδεικνύει ότι δεν αγνοεί το stored N), never-throws σε malformed stored (empty, plaintext, too-few/too-many parts, wrong algo tag), reject σε non-numeric/zero N/r/p, empty hash segment, **tampered hash σωστού μήκους** (byte flip → false, κλειδώνει τον timingSafeEqual έλεγχο), και non-string stored input (undefined/null/number → false, όχι throw).
- **Σημείο ασφαλείας που κλειδώθηκε**: το `verifyPassword` fail-closed (κάθε malformed/tampered/wrong input → false, ποτέ throw ή σιωπηλό true) + η ανάγνωση των stored cost params· ένα ακούσιο loosening θα έπεφτε ορατό.

Τι επαληθεύτηκε:
- `npx vitest run src/lib/auth.test.ts` → 11/11 passed.
- `npx vitest run` (όλο το suite) → 49 files, 735/735 passed.
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git diff --cached` κενό (κανένα concurrent routine mid-commit)· `git status --short` = foreign `.claude/launch.json` (ΔΕΝ το άγγιξα/staged) + το νέο auth.test.ts. Στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (f συνέχεια) Επόμενο pure test file. Απομένοντα καθαρά targets λίγα — τα περισσότερα exported pure helpers έχουν test. Πιθανά: (α) `lib/session.ts` έχει ήδη test· δες αν το `auth.ts` async layer αξίζει με mocked `next/headers`+`session` (role-guard branches του `requireAdmin`)· (β) `models/` pure statics/virtuals αν υπάρχουν· (γ) additive-export ενός `aiProviders.ts` internal helper (`stripFences`/`mediaTypeOf`) ΑΝ εγκριθεί source edit (εκτός territory τώρα). Τρέξε πρώτα `find src -name '*.test.ts'` (πολλά routines γράφουν παράλληλα) + `git status` collision-guard. Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-03 (cont. — ocr.test.ts, looksLikeUsableOcr gate)

**Task: (f συνέχεια) Pure test file `apps/web/src/lib/ocr.test.ts` για το `looksLikeUsableOcr` gate του `lib/ocr.ts`.**

Επιλογή target: σάρωσα τα ακάλυπτα pure exports (`find src -name '*.test.ts'` = 49 files πριν). Τα δύο v1 serializers, `computeAnomalies` (7 refs στο expenses/serialize.test.ts), auth, aiTools, expoPush κ.λπ. είναι ήδη καλυμμένα. Απόρριψα το `components/ui/cn.ts` (thin wrapper πάνω σε clsx+tailwind-merge, τεστάρει third-party, χαμηλή αξία). Διάλεξα το `looksLikeUsableOcr` γιατί είναι δικό μας business gate: μετά το Tesseract, αποφασίζει αν το OCR text έχει αρκετούς πραγματικούς χαρακτήρες για το text model ή αν πρέπει fallback σε vision parse. Το threshold έχει σημασία (πολύ χαμηλό → garbage στο model σε άδειες/€0 αποδείξεις· πολύ ψηλό → άσκοπο vision call σε καλό text). Ντετερμινιστικό (strip whitespace, length ≥40), μηδέν clock/DB.

Sharp concern + resolution: το `ocr.ts` κάνει top-level `import sharp` (native lib). Έλεγξα ότι το CI (`.github/workflows/ci.yml`) τρέχει ήδη `npm ci` + `npm run build` σε ubuntu-latest → το sharp-linux binary εγκαθίσταται/χρησιμοποιείται ήδη· άρα import του ocr.ts σε vitest ΔΕΝ είναι νέο CI ρίσκο. Probe: `import('./src/lib/ocr.ts')` φόρτωσε καθαρά (sharp-darwin-arm64 present τοπικά), το `looksLikeUsableOcr` export ok. Το import είναι side-effect-free (καμία εικόνα δεν επεξεργάζεται στο load).

Τι έγινε:
- Νέο `ocr.test.ts` (8 tests). Καλύπτει: empty → false· whitespace-only (spaces/tabs/newlines/CR) → false· 39 non-ws chars → false (boundary)· 40 non-ws chars → true (boundary)· πολύ πάνω από threshold → true· surrounding whitespace ΔΕΝ μετράει (39 wrapped → false, 40 wrapped → true)· interspersed whitespace ΔΕΝ μετράει (`'a '.repeat(40)` → true, `.repeat(39)` → false)· Greek/non-ASCII BMP chars μετρώνται 1:1 (39 → false, 40 → true) + ρεαλιστικό κοντό ελληνικό fragment → false.

Τι επαληθεύτηκε:
- `npx vitest run src/lib/ocr.test.ts` → 8/8 passed (sharp φόρτωσε κανονικά).
- `npx vitest run` (όλο το suite) → 50 files, 746/746 passed.
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git diff --cached` κενό (κανένα concurrent routine mid-commit)· `git status --short` = foreign `.claude/launch.json` (ΔΕΝ το άγγιξα/staged) + το νέο ocr.test.ts. Στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (f συνέχεια) Επόμενο pure test file. Τα καθαρά exported helpers έχουν πλέον σχεδόν όλα test. Απομένοντα: (α) `components/ui/cn.ts` (thin, μόνο αν θέλουμε lock στο tailwind-merge conflict-resolution)· (β) API-shape/validation helpers σε app/api/v1 route.ts που δεν θέλουν live Mongo (mock ή inline parsers)· (γ) additive-export ενός `aiProviders.ts` internal helper (`stripFences`/`mediaTypeOf`) ΑΝ εγκριθεί source edit (εκτός territory τώρα). Τρέξε πρώτα `find src -name '*.test.ts'` (πολλά routines γράφουν παράλληλα) + `git status` collision-guard. Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-03 (cont. — prompts.test.ts, AI-prompts registry)

**Task: (f συνέχεια) Pure test file `apps/web/src/lib/prompts.test.ts` για το `PROMPT_META` registry + το `DEFAULT_SCRAPER_PRICE_PROMPT` του `lib/prompts.ts`.**

Επιλογή target: σάρωσα τα lib modules χωρίς test (`find src/lib -maxdepth 1`). Το `notifiers.shared` (NOTIFIER_TYPES) ήταν ήδη καλυμμένο από το notifiers.test.ts· τα περισσότερα υπόλοιπα (db/jobRunner/mirror/ollama/onedrive/remoteStorage/scrape/search/softDelete/storage) είναι side-effectful χωρίς pure exports. Διάλεξα το `prompts.ts` γιατί εκθέτει δύο καθαρά static exports: το `PROMPT_META` (single source of truth για το Settings → AI Prompts editor· κάθε row = ένας overridable prompt) και το `DEFAULT_SCRAPER_PRICE_PROMPT` (default κείμενο που το Settings δείχνει/reset-άρει, KEEP-IN-SYNC με τον scraper). Ένα key στο PromptKey union που λείπει από το PROMPT_META = σιωπηλά μη-editable prompt· διπλό/stray key = σπασμένο editor row. Οι DB helpers (getPromptOverride/getAllPromptOverrides) θέλουν live Mongo → εκτός scope.

Import concern + probe: το module κάνει top-level `import { connectDB } from './db'` + `import { AppConfig }` (mongoose). Probe (`_probe.test.ts`, δοκιμαστικό, διαγράφηκε) έδειξε ότι φορτώνει καθαρά στο vitest — το server-only alias (από προηγούμενο run) + το db import resolve-άρουν χωρίς να εκτελούν DB (μηδέν connection στο import). Καμία mock δεν χρειάστηκε.

Τι έγινε:
- Νέο `prompts.test.ts` (10 tests). PROMPT_META: non-empty array· **exact canonical PromptKey set** (10 keys, mirror — add/remove prompt must update union + list + META)· unique keys· non-empty label+where ανά prompt· distinct labels (no ambiguous rows)· κάθε canonical key βρίσκεται via find. DEFAULT_SCRAPER_PRICE_PROMPT: non-empty· περιέχει `"price"`/`"currency"`/`"inStock"` + «JSON only/Return ONLY JSON» (ο scraper κάνει JSON.parse το reply → το shape πρέπει να είναι pinned)· «dot decimal» instruction (EU comma vs US dot)· η scraperPrice row υπάρχει στο META.

Τι επαληθεύτηκε:
- `npx vitest run src/lib/prompts.test.ts` → 10/10 passed.
- `npx vitest run` (όλο το suite) → 52 files, 772/772 passed.
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git diff --cached` κενό (κανένα concurrent routine mid-commit)· `git status --short` = foreign `.claude/launch.json` + 3 mobile screens (ΔΕΝ τα άγγιξα/staged) + το νέο prompts.test.ts. Στάγιαρα μόνο το δικό μου path. Commit 320102d, pushed.

Suggested next task: (f συνέχεια) Επόμενο pure test file. Τα single-file lib pure helpers έχουν πλέον σχεδόν όλα test. Απομένοντα καθαρά targets: (α) `components/ui/cn.ts` (thin wrapper πάνω σε clsx+tailwind-merge — μόνο αν θέλουμε lock στο conflict-resolution, χαμηλή αξία)· (β) `lib/storageConfig.ts` type/registry invariants (StorageBackend union) ή `lib/i18n` υπο-modules αν μένουν ακάλυπτα· (γ) API-shape/validation helpers σε app/api/v1 route.ts που δεν θέλουν live Mongo (mock ή inline parsers). Τρέξε πρώτα `find src -name '*.test.ts'` (πολλά routines γράφουν παράλληλα) + `git status` collision-guard. Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-03 (cont. — notify.test.ts, ntfy ASCII-Title constraint)

**Task: (f συνέχεια) Test file `apps/web/src/lib/notify.test.ts` για τον low-level ntfy sender `sendNtfyTo` του `lib/notify.ts`.**

Επιλογή target: σάρωσα τα lib modules χωρίς test (`for f in src/lib/*.ts`). Τα περισσότερα εναπομείναντα είναι side-effectful χωρίς pure exports (db/jobRunner/mirror/ollama/onedrive/remoteStorage/scrape/search/softDelete/storage/appSettings/anthropic/aiProviders). Το `clientImage.shrinkImage` είναι browser-only (canvas/DOM, δεν τρέχει σε node). Διάλεξα το `sendNtfyTo` γιατί εκθέτει έναν πραγματικό business invariant: το ntfy απορρίπτει non-ASCII τιμές στο Title header, οπότε ένας ελληνικός τίτλος θα έσπαγε **σιωπηλά** το notification. Ο κώδικας κάνει strip το Title σε ASCII (κρατώντας τα ελληνικά στο body) και είναι fail-closed (empty URL ή network error → false, ποτέ throw). Ντετερμινιστικό με mocked global fetch, μηδέν DB/δίκτυο.

Import concern + probe: το module κάνει top-level `import { getAppSettings }` (→ appSettings → db). Probe (`_probe_notify.test.ts`, δοκιμαστικό, διαγράφηκε) φόρτωσε καθαρά — το import είναι side-effect-free και το `sendNtfyTo` παίρνει explicit URL, δεν αγγίζει settings. Καμία mock του getAppSettings δεν χρειάστηκε.

Τι έγινε:
- Νέο `notify.test.ts` (13 tests) με `vi.stubGlobal('fetch', ...)` + helper που διαβάζει τα headers από το `RequestInit` του fetch call. Καλύπτει: empty URL → false ΧΩΡΙΣ fetch call· επιτυχές POST (body = message, method POST, url verbatim) → true· non-ok response (500) → false· plain ASCII title verbatim στο Title header· **fully-Greek title → Title header omitted** (stripped κενό) ενώ το ελληνικό body περνά αναλλοίωτο· mixed-script title («Alert Ειδοποίηση now») → κρατά μόνο το ASCII κομμάτι· trim surrounding whitespace στο Title· empty title → no Title header· Priority header ως string όταν δοθεί· **Priority omitted όταν falsy (0)**· Tags joined με comma· Tags omitted όταν empty array· **fetch reject → false (never throws)**.
- **Σημείο που κλειδώθηκε**: η ASCII-only συμπεριφορά του Title (ένα ακούσιο loosening θα έστελνε non-ASCII header → ntfy 400 → χαμένη ειδοποίηση) + το fail-closed contract (empty URL/network error → false).

Τι επαληθεύτηκε:
- `npx vitest run src/lib/notify.test.ts` → 13/13 passed.
- `npx vitest run` (όλο το suite) → 53 files, 788/788 passed (πριν προσθέσω το notify: 787· τώρα 801 — βλ. σημ.). ΣΗΜ: το πλήρες suite μετά την προσθήκη = 53 files. Το type-check ανέδειξε `init possibly undefined` σε destructured fetch-call arg → fix με explicit `as RequestInit` cast (όχι destructuring).
- `npm run type-check` → exit 0, 0 errors (μετά το cast fix).
- Collision guard: πριν το stage, `git diff --cached` κενό (κανένα concurrent routine mid-commit)· `git status --short` = foreign `.claude/launch.json` + 3 mobile screens (ΔΕΝ τα άγγιξα/staged) + το νέο notify.test.ts. Στάγιαρα μόνο το δικό μου path.

Suggested next task: (f συνέχεια) Επόμενο test file. Τα single-file lib pure helpers έχουν πλέον σχεδόν όλα test. Απομένοντα targets: (α) `lib/storageConfig.ts` — μόνο το `invalidateStorageConfig()` + η `StorageBackend` union είναι pure (το `getStorageConfig` θέλει DB)· χαμηλή αξία μόνο του· (β) `lib/storage.ts` `StorageBucket` union / path-building αν υπάρχει pure κομμάτι· (γ) API-shape/validation helpers σε app/api/v1 route.ts με mocked req (χωρίς live Mongo) — πιο υψηλή αξία, καλύπτει το mobile-app contract· (δ) `components/ui/cn.ts` (thin, χαμηλή αξία). Τρέξε πρώτα `find src -name '*.test.ts'` + `git status` collision-guard. Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-03 (cont. — revalidate.test.ts, safeRevalidate fail-safe contract)

**Task: (f συνέχεια) Pure test file `apps/web/src/lib/revalidate.test.ts` για το `safeRevalidate` του `lib/revalidate.ts`.**

Επιβεβαίωση προτεραιοτήτων πρώτα: πριν διαλέξω ξανά (f), επαλήθευσα ότι τα a-e είναι όντως κλειστά (όχι assumption). (a) LICENSE = πλήρες AGPL-3.0 (34KB). (c) `.env.example`: grep `process.env.*` σε όλο το apps/web/src → **κάθε** var που διαβάζεται υπάρχει στο .env.example (τα extras ME_USER/NTFY_TOPIC/SCRAPER_CRON/PRICE_DROP_ALERT_PCT είναι για compose/scraper). (d) README = 190 γραμμές, public-ready. (e) `.github/` = ISSUE_TEMPLATE (bug+feature), PULL_REQUEST_TEMPLATE, ci.yml (τρέχει type-check + npm test + build σε ubuntu, με CI placeholder secrets), release.yml. Άρα η σωστή επιλογή = (f).

Επιλογή target: `find src/lib -maxdepth 1` untested → τα περισσότερα side-effectful (scrape/ollama/appSettings/search/remoteStorage/anthropic/storage/jobRunner/onedrive/softDelete/db/mirror/pdfThumb/storeService/storageConfig). Οι api/v1 routes (items/statements/history) δεν εκθέτουν pure exported helpers (grep = κενό) → extraction θα ήταν source edit εκτός territory. Διάλεξα το `safeRevalidate` γιατί κλειδώνει έναν πραγματικό fail-safe: το `revalidatePath()` του Next **πετάει** όταν καλείται εκτός request scope, και ο background job worker (`lib/jobRunner`) τρέχει detached από request. Ένα uncaught throw θα σκότωνε τον worker στη μέση ενός job. Το wrapper πρέπει να swallow-άρει την εξαίρεση (το skipped revalidate δεν είναι correctness θέμα — pages είναι force-dynamic + polling). Ντετερμινιστικό με `vi.mock('next/cache')`, μηδέν request context/DB.

Τι έγινε:
- Νέο `revalidate.test.ts` (8 tests) με hoisted `vi.mock('next/cache')` + mock ref reconfigured per test. Καλύπτει: happy path forwards path verbatim → `revalidatePath('/receipts')`· returns undefined on success· empty path pass-through (no normalization)· **δεν πετάει όταν το revalidatePath πετάει** (out-of-request scope)· returns undefined ακόμα κι όταν throws· **επιχειρεί την κλήση ΠΡΙΝ swallow-άρει** (path έφτασε στο wrapped fn)· swallow και non-Error throws (thrown string)· μία κλήση ανά invocation (no retry-on-success).
- **Σημείο που κλειδώθηκε**: το fail-safe contract (throwing revalidatePath → absorbed silently, ο worker επιβιώνει) + το «attempt-then-swallow» ordering (ένα ακούσιο reorder που swallow-άρει πριν την κλήση θα περνούσε τα άλλα tests αλλά θα έσπαγε το cache-invalidation entirely).

Τι επαληθεύτηκε:
- `npx vitest run src/lib/revalidate.test.ts` → 8/8 passed.
- `npx vitest run` (όλο το suite) → 55 files, 820/820 passed.
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git diff --cached` κενό (κανένα concurrent routine mid-commit)· `git status --short` = foreign `.claude/launch.json` + 3 mobile screens (ΔΕΝ τα άγγιξα/staged) + το νέο revalidate.test.ts. Στάγιαρα μόνο το δικό μου path.

Suggested next task: (f συνέχεια) Επόμενο pure test file, αλλά η ουρά καθαρών targets στένεψε πολύ. Απομένοντα: (α) `components/ui/cn.ts` (thin clsx+tailwind-merge wrapper — χαμηλή αξία, τεστάρει third-party conflict-resolution)· (β) API-shape/validation με mocked req σε app/api/v1 route.ts — πιο υψηλή αξία (καλύπτει το mobile contract) αλλά θέλει mock του DB layer/session, όχι πλέον pure· (γ) `lib/storageConfig.ts` `invalidateStorageConfig` + StorageBackend union invariant (thin). Εναλλακτικά, αν εξαντληθούν τα καθαρά, σκέψου μετακίνηση στην προτεραιότητα coverage των υπαρχόντων (edge cases σε ήδη-tested modules). Τρέξε πρώτα `find src -name '*.test.ts'` + `git status` collision-guard. Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-03 (cont. — storage.test.ts, path-traversal guard + saveFile shape)

**Task: (f συνέχεια) Test file `apps/web/src/lib/storage.test.ts` για τα `saveFile`/`readFile`/`deleteFile` + τον (μη-exported) traversal guard `resolveWithinStorage` του `lib/storage.ts`.**

Επιλογή target: σάρωσα ξανά τα untested lib modules (`find src/lib -maxdepth 2`). Τα περισσότερα εναπομείναντα είναι side-effectful network/DB (scrape/ollama/appSettings/search/remoteStorage/anthropic/onedrive/jobRunner/mirror/pdfThumb/storeService/db/softDelete) ή browser-only (clientImage). Επιθεώρησα τα exports: `storageConfig.getStorageConfig` θέλει DB, `onedrive.*` είναι όλα Graph HTTP calls. Το `storage.ts` ξεχώρισε γιατί (α) εκθέτει έναν πραγματικό **security contract** (`resolveWithinStorage` — path.relative-based guard κατά `..` traversal + absolute paths που φτάνουν readFile/deleteFile από route params ή tampered DB filePath), και (β) το `saveFile` παράγει το relativePath που αποθηκεύεται στη Mongo + σερβίρεται από `/api/files`. Μοναδικά deps = `node:fs`/`node:path`/`node:crypto` → πλήρως mockable, μηδέν DB, ντετερμινιστικό.

Import/env concern + resolution: το `STORAGE_ROOT` διαβάζεται μία φορά στο module-eval. Το έθεσα σε fixed `/srv/pharos-storage` **πριν** το dynamic import (μέσα σε `beforeAll`), ώστε τα path assertions να μην εξαρτώνται από cwd/δίσκο. Το `node:fs` (`{ promises as fs }`) mock-άρεται με hoisted `vi.mock` (self-contained factory, μηδέν πραγματικό I/O). Ο clock πιν-άρεται σε UTC-noon (`2026-06-04T12:00:00Z`) ώστε το year/month να είναι TZ-stable σε κάθε CI timezone (assert `receipts/2026/06/…` μόνο· η ημέρα μένει regex).

Τι έγινε:
- Νέο `storage.test.ts` (16 tests). **saveFile** (7): bucket/year/month/dated-16hex-filename shape· `filePath === path.join(ROOT, relativePath)` + μέσα στο root· extension normalization (bare `pdf` → `.pdf`, dotted `.png` δεν διπλασιάζεται σε `..png`)· bucket = πρώτο segment· `mkdir {recursive:true}` + `writeFile(buffer)` κλήσεις· **unique filename ανά call** (random hash). **readFile traversal guard** (6): legit relative → `fs.readFile(path.resolve(ROOT,rel))`· `../` που normalize-άρει ΠΙΣΩ μέσα (`receipts/../statements/x.pdf`) επιτρέπεται· `../../etc/passwd` → throw 'Path escapes storage root' χωρίς fs κλήση· absolute `/etc/passwd` → throw· empty '' (resolves στο root) → throw· nested climb-out → throw. **deleteFile guard** (3): legit unlink· traversal + absolute → throw + ποτέ unlink.

Τι επαληθεύτηκε:
- `npx vitest run src/lib/storage.test.ts` → 16/16 passed.
- `npx vitest run` (όλο το suite) → 58 files, 874/874 passed.
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git diff --cached` κενό (κανένα concurrent routine mid-commit)· `git status --short` = foreign `.claude/launch.json` + 3 mobile screens (ΔΕΝ τα άγγιξα/staged) + τα δικά μου storage.test.ts + OSS_PROGRESS.md. Στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (f συνέχεια) Η ουρά καθαρών pure-lib targets έχει σχεδόν εξαντληθεί. Πιο αξιόλογη επόμενη κίνηση = (β) API-shape/validation tests σε `app/api/v1/*/route.ts` με mocked DB layer/session (καλύπτει το mobile-app REST contract — π.χ. ένα route που κάνει validation πριν το DB write· mock `connectDB` + το model). Χαμηλότερης αξίας fallbacks: (α) `components/ui/cn.ts` (thin clsx+tailwind-merge)· (γ) edge-case coverage σε ήδη-tested modules. Τρέξε πρώτα `find src -name '*.test.ts'` + `git status` collision-guard. Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-03 (cont. — notifiers.dispatch.test.ts, per-channel wire contract + fail-closed)

**Task: (f συνέχεια) Test file `apps/web/src/lib/notifiers.dispatch.test.ts` για το `testNotifier`/`sendOne` του `lib/notifiers.ts` (pluggable outbound alert channels).**

Επιλογή target: η ουρά καθαρών pure-lib targets έχει σχεδόν εξαντληθεί (βλ. προηγ. entries). Επιθεώρησα ξανά τα untested modules· τα περισσότερα είναι network/DB side-effectful (scrape/ollama/appSettings/search/remoteStorage/anthropic/onedrive/jobRunner/mirror/storeService/db/softDelete/storageConfig) ή browser-only (clientImage). Το `notifiers.ts` ξεχώρισε: το `sendOne` (μέσω του exported `testNotifier(c)`) χτίζει **διαφορετικό payload ανά κανάλι** (Discord `{content}`, Slack `{text}`, Telegram `{chat_id,text}` στο bot-scoped URL, generic webhook `{title,message,ts}`, ntfy → `sendNtfyTo`) και είναι πλήρως ντετερμινιστικό με stubbed `fetch` + mocked `./notify`. Δεν αγγίζει DB (το `getNotifiers`/`dispatchAlert` κάνουν το `connectDB`, όχι το `testNotifier`). Το υπάρχον `notifiers.test.ts` καλύπτει ΜΟΝΟ το client-safe `NOTIFIER_TYPES` metadata — αυτό είναι το transport, συμπληρωματικό· νέο ξεχωριστό filename για να μην το πατήσω.

Import concern + probe: το `notifiers.ts` κάνει top-level `import { connectDB }` + `AppConfig`. Probe (`_probe_notifiers.test.ts`, δοκιμαστικό, διαγράφηκε) φόρτωσε καθαρά με μόνο το `./notify` mocked — τα mongoose imports είναι side-effect-free (model registration), όπως και στο notify.test.ts. Καμία mock του db δεν χρειάστηκε.

Τι έγινε:
- Νέο `notifiers.dispatch.test.ts` (16 tests) με `vi.mock('./notify')` (sendNtfyTo → deterministic) + `vi.stubGlobal('fetch', ...)` + helper που διαβάζει url/init/JSON-body από το τελευταίο fetch call. Καλύπτει ανά κανάλι: **ntfy** delegation (url + ASCII title 'Pharos test' + `tags:['bell']`, ΚΑΝΕΝΑ fetch), propagate false, no-url → false χωρίς sendNtfyTo· **discord** `{content:'**title**\nmsg'}` POST JSON, ≤1900 char cap, no-url → no fetch + false, non-ok response → false· **slack** `{text:'*title*\nmsg'}` (και όχι `content`), no-url guard· **telegram** `{chat_id,text}` στο `https://api.telegram.org/bot<token>/sendMessage`, missing token → false/no-fetch, missing target → false/no-fetch· **webhook** `{title,message,ts}` με valid ISO ts, no-url guard· **fail-closed**: fetch reject → false (never throws), unknown channel type → false χωρίς fetch.
- **Σημείο που κλειδώθηκε**: το ακριβές wire contract κάθε καναλιού (ένα field-rename Discord content→text ή Telegram chat_id→chatId θα έσπαγε σιωπηλά το notification) + τα per-channel missing-credential guards (discord/slack/webhook → url, telegram → token+target, ntfy → url) + το fail-closed (bad creds / non-ok / network error → false, ποτέ throw).

Τι επαληθεύτηκε:
- `npx vitest run src/lib/notifiers.dispatch.test.ts` → 16/16 passed.
- `npx vitest run` (όλο το suite) → 60 files, 896/896 passed.
- `npm run type-check` → exit 0 (2 αρχικά errors από untyped vi.fn spread + tuple cast → fix με `(..._args: unknown[])` rest param + `as unknown as` cast· καθαρό μετά).
- Collision guard: πριν το stage, `git diff --cached` κενό (κανένα concurrent routine mid-commit)· `git status --short` = foreign `.claude/launch.json` + 3 mobile screens (ΔΕΝ τα άγγιξα/staged) + τα δικά μου notifiers.dispatch.test.ts + OSS_PROGRESS.md. Στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (f συνέχεια) Η καθαρή pure-lib ουρά έχει σχεδόν στερέψει. Πιο αξιόλογα εναπομείναντα: (α) το `coerce`/`getNotifiers` legacy-ntfy migration στο ίδιο `notifiers.ts` (θέλει mock του AppConfig.findOne — mockable, καλύπτει το «empty notifiers[] + legacy ntfyUrl → single channel» invariant)· (β) API-shape/validation tests σε `app/api/v1/*/route.ts` με mocked withAuth+connectDB+model (καλύπτει το mobile REST contract — υψηλή αξία αλλά heavier mocking)· (γ) `components/ui/cn.ts` (thin, χαμηλή αξία). Τρέξε πρώτα `find src -name '*.test.ts'` + `git status` collision-guard. Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-03 (cont. — notifiers.migration.test.ts, legacy-ntfy migration + coerce invariants)

**Task: (f συνέχεια) Test file `apps/web/src/lib/notifiers.migration.test.ts` για το `getNotifiers`/`coerce` του `lib/notifiers.ts` (η DB-read πλευρά, συμπληρωματική στο dispatch transport).**

Επιλογή target: ακολούθησα το suggested next task του προηγ. entry (α) — το `getNotifiers`/`coerce` legacy-ntfy migration. Το `notifiers.dispatch.test.ts` κάλυψε ήδη το wire contract (private `sendOne` μέσω `testNotifier`, μηδέν DB). Το `getNotifiers` είναι η άλλη μισή, DB-side λειτουργία: διαβάζει `AppConfig.notifiers[]`, τα normalize-άρει με το (μη-exported) `coerce`, και όταν το array είναι κενό **migrate-άρει** τα legacy `ntfyUrl`/`ntfyEnabled` σε ένα single ntfy channel ώστε setups που προϋπάρχουν του pluggable-array να συνεχίζουν να ειδοποιούν μέχρι ο χρήστης να ξανα-σώσει. Regression εδώ (πτώση του legacy fallback ή coerce που μαγκώνει stored channel) θα απενεργοποιούσε **σιωπηλά** τα alerts ενός χρήστη χωρίς error.

Mocking pattern (νέο για το suite — κανένα προηγ. test δεν mock-άρει το DB layer): έστησα `vi.hoisted()` για το findOne/select/lean chain (`AppConfig.findOne({...}).select('...').lean()`) + `state.doc` που κάθε test θέτει μέσω `setDoc()`, mock του `./db` (connectDB → no-op) + `@/models/AppConfig` (findOne) + `./notify` (sendNtfyTo, module-load import που το getNotifiers δεν καλεί). Μηδέν live Mongo, ντετερμινιστικό.

Τι έγινε:
- Νέο `notifiers.migration.test.ts` (16 tests). **DB plumbing** (2): connectDB κληθέν 1×· findOne με `{key:'singleton'}`· select με τα 3 πεδία· null doc → []. **Coercion** (8): full valid channel verbatim· order-preserving map· `enabled` default true / false-only-when-exactly-false / `0 !== false → true`· missing label/url/token/target → ''· unknown type dropped· null/string/number entries dropped χωρίς throw· **id fallback = RAW array index** (junk entry advance-άρει τον counter → valid 2ο χωρίς id → `n1` όχι `n0`)· non-array notifiers → treated as empty. **Legacy migration** (6): κενό array + ntfyUrl → single `ntfy-legacy` enabled channel· ntfyEnabled falsy → disabled· missing ntfyEnabled → disabled· ΔΕΝ migrate όταν array έχει ήδη channels· ΔΕΝ migrate όταν κενό array χωρίς ntfyUrl → []· migrate όταν όλα τα stored channels coerce-άρουν σε τίποτα (junk-only array + legacy ntfyUrl → fallback ενεργοποιείται).
- **Σημείο που κλειδώθηκε**: το migration on/off contract (empty-coerced-channels ∧ legacy ntfyUrl → 1 channel· non-empty → κανένα legacy) + το coerce id-index-over-raw-array invariant (ένα reorder του filter πριν το map θα άλλαζε σιωπηλά τα auto ids).

Τι επαληθεύτηκε:
- `npx vitest run src/lib/notifiers.migration.test.ts` → 16/16 passed.
- `npx vitest run` (όλο το suite) → 62 files, 918/918 passed.
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git diff --cached` κενό (κανένα concurrent routine mid-commit)· `git status --short` = foreign `.claude/launch.json` + 3 mobile screens (ΔΕΝ τα άγγιξα/staged) + το δικό μου notifiers.migration.test.ts + OSS_PROGRESS.md. Στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (f συνέχεια) Η καθαρή pure-lib ουρά έχει πλέον ουσιαστικά στερέψει (notifiers και τα δύο μισά καλυμμένα, storage/revalidate/ssrf/money/dates/storagePath κλπ done). Πιο αξιόλογη επόμενη κίνηση = (β) **API-shape/validation tests σε `app/api/v1/*/route.ts`** με το ίδιο DB-mock pattern που μόλις έστησα (`vi.hoisted` + mock `withAuth`/`connectDB`/model) — καλύπτει το mobile REST contract (π.χ. ένα route που validate-άρει body/params πριν το DB write, ή σειριοποιεί την απάντηση). Χαμηλότερης αξίας fallback: `components/ui/cn.ts` (thin clsx+tailwind-merge). Τρέξε πρώτα `find src -name '*.test.ts'` + `git status` collision-guard. Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-03 (cont. — api/v1/tasks/route.test.ts, πρώτο REST endpoint-shape test)

**Task: (β) API-shape/validation test `apps/web/src/app/api/v1/tasks/route.test.ts` για το GET/POST του `/api/v1/tasks` (ένα από τα ~50 endpoints που καταναλώνει το Expo mobile app).**

Επιλογή target: ακολούθησα το suggested next task των τελευταίων entries — η καθαρή pure-lib ουρά έχει στερέψει, οπότε πέρασα στο (β), τα route handlers. Επιθεώρησα τα `find src/app/api/v1 -name route.ts` (50 routes) + τους shared helpers (`apiAuth`/`apiBody`/`apiList` — ήδη unit-tested μεμονωμένα). Διάλεξα το `tasks/route.ts` ως πρώτο γιατί συγκεντρώνει **route-level logic που δεν ζει πουθενά αλλού**: (α) το bearer-auth gate μέσω `withAuth`, (β) POST validation (title required, tags array|comma-string coercion, status/priority enum-defaulting, completedAt auto-set ΜΟΝΟ όταν status==='done', dueDate→Date), (γ) GET status filter + το `updatedSince` cursor που ανάβει `withDeleted` και στα δύο queries (κρίσιμο για incremental sync — αλλιώς το mobile δεν βλέπει soft-deletes) + το list envelope shape. Ένα drift εδώ σπάει σιωπηλά το mobile REST contract.

Mock pattern (επέκταση του DB-mock που στήθηκε στο notifiers.migration): mock ΜΟΝΟ το DB seam (`@/lib/db` connectDB → no-op, `@/models/User` για το bearerUser findOne→select→lean chain, `@/models/Task` find/countDocuments/create) και τρέχω τους ΠΡΑΓΜΑΤΙΚΟΥΣ apiAuth/apiBody/apiList helpers ώστε validation + serialization να εκτελεστούν αληθινά. Δύο μη-προφανή σημεία: (1) το `Task.find(...)` επιστρέφει self-returning chain (sort/skip/limit/setOptions → self, lean → docs)· (2) το `Task.countDocuments(...)` πρέπει να είναι **thenable** (resolve σε total) ΜΕ self-returning `setOptions`, γιατί ο route κάνει `count.setOptions(...)` πριν το `Promise.all([find.lean(), count])`. Το `vi.clearAllMocks()` στο beforeEach καθαρίζει τα return values των chain stubs → τα re-point-άρω ρητά (αλλιώς η 2η δοκιμή έπαιρνε undefined chain). Το NextRequest = minimal `{ url, headers.get, json }` stand-in cast `as unknown as NextRequest` (ίδιο pattern με apiList.test.ts) — μηδέν πραγματικό fetch/polyfill.

Τι έγινε:
- Νέο `route.test.ts` (15 tests). **auth gate** (2): GET χωρίς token → 401 + κανένα DB touch· POST με unknown token (findOne→null) → 401 + κανένα create. **POST validation** (7): blank title → 400 'title required' + no create· defaults (todo/normal/[]/''/null) + 201 + trimmed task· comma-string tags → trimmed non-empty array· array tags stringified· out-of-enum status/priority → defaults· status='done' → completedAt Date + echoed· dueDate parse → Date με σωστό ISO. **GET listing** (6): list envelope + mapped task (steps id-mapping, deleted:false)· status query → filter verbatim σε find+count· no status → `{}`· updatedSince → `$gte` filter + `withDeleted:true` και στα δύο queries· χωρίς cursor → κανένα setOptions· soft-deleted doc → `deleted:true`.

Τι επαληθεύτηκε:
- `npx vitest run src/app/api/v1/tasks/route.test.ts` → 15/15 passed.
- `npx vitest run` (όλο το suite) → 65 files, 973/973 passed.
- `npm run type-check` → exit 0 (1 αρχικό error: `taskFind.mock.calls[0][0]` — vi.fn χωρίς args → tuple `[]` length 0· fix με `(taskFind.mock.calls[0] as unknown[])[0]`· καθαρό μετά).
- Collision guard: πριν το stage, `git diff --cached` κενό (κανένα concurrent routine mid-commit)· `git status --short` = foreign `.claude/launch.json` + 3 mobile screens (ΔΕΝ τα άγγιξα/staged) + το δικό μου route.test.ts + OSS_PROGRESS.md. Στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (β συνέχεια) Συνέχισε το endpoint-shape coverage με το ίδιο DB-mock pattern, ένα route ανά run. Υψηλής αξίας επόμενα: ένα route με πλουσιότερη validation ή normalization — π.χ. `cards/route.ts` (POST card create) ή `shopping-list/route.ts` ή `subscriptions/route.ts` (cycle/amount coercion, next-renewal). Ιδανικά ένα `[id]` route (π.χ. `tasks/[id]/route.ts` PATCH/DELETE) για να κλειδώσει το `isObjectId` guard + partial-update + soft-delete μονοπάτι. Τρέξε πρώτα `find src/app/api/v1 -name route.ts` + `find src -name '*.test.ts'` + `git status` collision-guard. Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-03 (cont. — tasks/[id]/route.test.ts, PATCH partial-update + soft-delete DELETE)

**Task: (β συνέχεια) API-shape/validation test `apps/web/src/app/api/v1/tasks/[id]/route.test.ts` για το PATCH/DELETE του `/api/v1/tasks/:id` (δύο από τα ~50 endpoints του Expo mobile app, το πρώτο `[id]` dynamic route που καλύπτεται).**

Επιλογή target: ακολούθησα ρητά το suggested next task του προηγ. entry — μετά το collection-level `tasks/route.ts` (GET/POST), το φυσικό επόμενο ήταν ένα `[id]` route για να κλειδώσει το `isObjectId` guard + partial-update + soft-delete μονοπάτι. Διάλεξα το `tasks/[id]` (όχι cards/subscriptions) για συνέχεια με το ήδη-mocked Task model + γιατί το PATCH συγκεντρώνει route-level logic που δεν ζει πουθενά αλλού: whitelisted `$set` build (blank title / out-of-enum status/priority / non-array tags → dropped), empty-changeset → 400, `status==='done'` → completedAt Date αλλιώς null, **full-array `steps` replacement** (trim + drop empty-text), `dueDate` **key-presence** semantics (`'dueDate' in b` → explicit null clears it), + το DELETE ως **soft-delete** (`$set deletedAt`, ΟΧΙ hard remove — recoverable από Trash). Drift εδώ σπάει σιωπηλά το mobile REST contract ή, χειρότερα, μετατρέπει το delete σε μη-αναστρέψιμο.

Mock pattern (ίδιο DB-seam pattern με το tasks/route.test.ts, ελαφρύτερο): mock ΜΟΝΟ `@/lib/db` connectDB + `@/models/User` (bearerUser findOne→select→lean) + `@/models/Task` με ένα `findByIdAndUpdate(id,update,opts)` που captures τα args σε `updateState.calls` και επιστρέφει `{ lean: async () => updateState.doc }`. Τρέχω τους ΠΡΑΓΜΑΤΙΚΟΥΣ apiAuth/apiBody(isObjectId,readBody)/apiList(iso) helpers → validation + serialization αληθινά. Το dynamic route δέχεται `{ params: Promise<{id}> }` → helper `ctx(id) = { params: Promise.resolve({id}) }`. Το NextRequest = minimal `{ url, headers.get, json }` stand-in.

Μη-προφανές σημείο που διορθώθηκε: αρχική δοκιμή στο id-guard έλεγε `connectDB not called` — λάθος. Ο πραγματικός `bearerUser` κάνει `connectDB()` ΚΑΤΑ το auth lookup (πριν καν τρέξει ο handler), οπότε το connectDB κληθέν 1× είναι σωστό· το ουσιαστικό invariant είναι ότι το `Task.findByIdAndUpdate` ΔΕΝ καλείται. Το assertion αντικαταστάθηκε.

Τι έγινε:
- Νέο `[id]/route.test.ts` (16 tests). **auth gate** (2): PATCH no-token → 401 + no DB write· DELETE unknown-token → 401 + no soft-delete. **id guard** (2): PATCH/DELETE malformed id → 400 'bad id' + no Task write. **PATCH** (10): empty changeset → 400 'no valid fields' + no write· all-invalid fields (blank title/out-of-enum status·priority/string tags) → still empty → 400· whitelisted-only `$set` + title trim + `{new:true}` opts + id passthrough· status=done → completedAt Date, non-done → null· array tags stringified· steps full-array replace (trim + drop empty-text, `done` truthiness)· dueDate key-presence null-clear· dueDate string → Date με σωστό ISO· response serialization (id-mapped steps, ISO dates, priority passthrough)· 404 όταν doc null. **DELETE** (2): soft-delete via `$set deletedAt` (Date) + `{ok:true,id}` + `{new:true}` (ΠΟΤΕ hard remove)· 404 όταν doc null.
- **Σημείο που κλειδώθηκε**: το delete-is-soft invariant (regression σε hard-delete θα έκανε τα mobile deletes μη-αναστρέψιμα) + το dueDate key-presence (ένα `if (b.dueDate)` αντί `'dueDate' in b` θα αγνοούσε σιωπηλά τα clears) + το empty-changeset 400 guard.

Τι επαληθεύτηκε:
- `npx vitest run 'src/app/api/v1/tasks/[id]/route.test.ts'` → 16/16 passed.
- `npx vitest run` (όλο το suite) → 68 files, 1014/1014 passed.
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: πριν το stage, `git diff --cached` κενό (κανένα concurrent routine mid-commit)· `git status --short` = foreign `.claude/launch.json` + 3 mobile screens (ΔΕΝ τα άγγιξα/staged) + το δικό μου `[id]/route.test.ts` + OSS_PROGRESS.md. Στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (β συνέχεια) Συνέχισε endpoint-shape coverage, ένα route ανά run, με το ίδιο DB-mock pattern. Υψηλής αξίας επόμενα: ένα route με πλουσιότερη numeric/enum coercion — `subscriptions/route.ts` (amount/cycle/next-renewal) ή `cards/route.ts` (limit/last4/kind) — ή ένα ακόμα `[id]` route όπου το partial-update διαφέρει ουσιαστικά (π.χ. `items/[id]` με price/priceHistory ή `receipts/[id]` με line-items). Ιδανικά κάλυψε ένα route που χρησιμοποιεί τα apiBody `numField`/`enumField` helpers end-to-end (τα helpers είναι unit-tested μεμονωμένα αλλά όχι μέσα σε route). Τρέξε πρώτα `find src/app/api/v1 -name route.ts` + `find src -name '*.test.ts'` + `git status` collision-guard. Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-04 (cont. — subscriptions/route.test.ts, numeric/enum coercion end-to-end)

**Task: (β συνέχεια) API-shape/validation test `apps/web/src/app/api/v1/subscriptions/route.test.ts` για το GET/POST του `/api/v1/subscriptions` (ένα ακόμα από τα ~50 endpoints του Expo mobile app).**

Επιλογή target: ακολούθησα ρητά το suggested next task του προηγ. entry — «ένα route με πλουσιότερη numeric/enum coercion, ιδανικά ένα που χρησιμοποιεί τα apiBody `numField`/`enumField` helpers end-to-end». Το `subscriptions/route.ts` είναι ακριβώς αυτό: το POST περνά από `strField(name, required)` + `numField(amount)` (finite-or-null) + `enumField(billingCycle, CYCLES, 'monthly')` + startDate NaN-guard + nextRenewal→startDate default. Τα helpers είναι ήδη unit-tested μεμονωμένα, αλλά ΟΧΙ μέσα σε route — αυτό κλειδώνει τη σύνθεσή τους (validation order, error strings, defaults) που ζει μόνο εδώ. Drift → σιωπηλή διαφθορά του mobile contract.

Mock pattern: ίδιο DB-seam pattern με τα tasks/route + tasks/[id]/route tests (`vi.hoisted` + mock `@/lib/db` connectDB + `@/models/User` bearerUser chain + `@/models/Subscription` find/countDocuments/create). Τρέχω τους ΠΡΑΓΜΑΤΙΚΟΥΣ apiAuth/apiBody/apiList helpers ώστε coercion + serialization αληθινά. Το `Subscription.create` επιστρέφει doc με `.toObject()` (ο route trims `doc.toObject()`, όχι σκέτο doc όπως άλλα). find = self-returning chain (sort/skip/limit/setOptions→self, lean→docs), count = thenable με self-returning setOptions.

Τι έγινε:
- Νέο `route.test.ts` (20 tests). **auth gate** (2): GET no-token → 401 + no find· POST unknown-token → 401 + no create. **POST validation** (11): blank name → 400 'name required' + no create· missing amount (undefined→numField null) → 400 'amount must be a number'· unparseable amount string ('free') → 400· amount 0 → valid finite (201)· numeric-string amount '9.99' → parseFloat 9.99· defaults (provider ''/category 'other'/billingCycle 'monthly'/paymentMethod·url·notes '') + 201 + trimmed sub (currency 'EUR')· valid billingCycle 'yearly' kept vs out-of-enum 'biweekly' → 'monthly'· invalid startDate 'not-a-date' → 400 'invalid startDate' + no create· nextRenewal defaults to startDate όταν omitted· explicit nextRenewal distinct from startDate· startDate defaults to Date όταν omitted. **GET listing** (7): list envelope + trim() defaults (active undefined → true, category 'other', billingCycle 'monthly', currency 'EUR', deleted false)· active=1 → filter {active:true} σε find+count· no active → {}· sort {nextRenewal:1}· updatedSince → $gte + withDeleted και στα δύο queries· χωρίς cursor → κανένα setOptions· active:false + deletedAt → active false, deleted true.
- **Σημείο που κλειδώθηκε**: το amount finite-or-null gate (ένα `if (!amount)` αντί `=== null` θα απέρριπτε το έγκυρο amount 0· ένα drop του numField parseFloat θα έσπαγε τα numeric-string amounts) + το enumField billingCycle default + το nextRenewal→startDate fallback (αλλιώς renewals χάνονται στο calendar).

Τι επαληθεύτηκε:
- `npx vitest run src/app/api/v1/subscriptions/route.test.ts` → 20/20 passed.
- `npx vitest run` (όλο το suite) → 73 files, 1088/1088 passed.
- `npm run type-check` → exit 0 (καθαρό, μηδέν errors).
- Collision guard: πριν το stage, `git diff --cached` κενό (κανένα concurrent routine mid-commit)· `git status --short` = foreign `.claude/launch.json` + 3 mobile screens (ΔΕΝ τα άγγιξα/staged) + το δικό μου subscriptions/route.test.ts + OSS_PROGRESS.md. Στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (β συνέχεια) Συνέχισε endpoint-shape coverage, ένα route ανά run, ίδιο DB-mock pattern. Υψηλής αξίας επόμενα: `cards/route.ts` (POST card — limit/last4/kind coercion, ακόμα untested) ή ένα `[id]` route με ουσιαστικά διαφορετικό partial-update (π.χ. `subscriptions/[id]` PATCH, ή `items/[id]` με price/priceHistory, ή `receipts/[id]` με line-items). Ιδανικά κάλυψε ένα route με `boolField` end-to-end (π.χ. active toggle σε subscriptions/[id]). Τρέξε πρώτα `find src/app/api/v1 -name route.ts` + `find src -name '*.test.ts'` + `git status` collision-guard. Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-05 (cont. — cards/route.test.ts, POST wiring + trim() serialization defaults)

**Task: (β συνέχεια) API-shape/validation test `apps/web/src/app/api/v1/cards/route.test.ts` για το GET/POST του `/api/v1/cards` (ένα ακόμα από τα ~50 endpoints του Expo mobile app).**

Επιλογή target: ακολούθησα ρητά το suggested next task του προηγ. entry (πρώτη επιλογή = `cards/route.ts`, POST card, ακόμα untested). Η body coercion ζει στο `cardFieldsFromBody` (ήδη unit-tested μεμονωμένα στο `cardFields.test.ts`), οπότε δεν την ξανα-καλύπτω· αυτό που ζει ΜΟΝΟ στο route (και ένα drift σιωπηλά σπάει το mobile contract) = το wiring: (α) το bearer-auth gate, (β) POST: null `$set` (name missing on create) → `apiError('name required')`· valid body → `Card.create({ ...set, active: true })` + 201 + `trim(doc.toObject())`· κρίσιμο invariant = το route **spread-άρει `active: true` ΜΕΤΑ** το set, οπότε ακόμα κι όταν το body λέει `active:false` το νέο card μπαίνει ενεργό, (γ) GET: το `sort({ active: -1, name: 1 })` order + οι `trim()` serialization DEFAULTS (last4 ''/bank ''/kind 'credit'/type 'other'/color '#00d4ff'/creditLimit 0/notes ''/`active !== false`). ΣΗΜ: το route ΔΕΝ έχει pagination envelope (επιστρέφει `{ cards }`, όχι apiList), απλούστερη GET chain από subscriptions/tasks.

Mock pattern: ίδιο DB-seam pattern με τα προηγ. route tests (`vi.hoisted` + mock `@/lib/db` connectDB + `@/models/User` bearerUser chain + `@/models/Card` find/create). Τρέχω τους ΠΡΑΓΜΑΤΙΚΟΥΣ apiAuth/apiBody helpers. GET chain = self-returning `sort` + `lean` (χωρίς skip/limit/setOptions, αφού δεν paginate)· `Card.create` επιστρέφει doc με `.toObject()`.

Τι έγινε:
- Νέο `route.test.ts` (12 tests). **auth gate** (2): GET no-token → 401 + no find· POST unknown-token → 401 + no create. **POST** (6): missing name → 400 'name required' + no create· whitespace-only name → ίδιο· valid body → create με `active:true` forced + 201· body `active:false` → ακόμα `active:true` (spread-after invariant)· name-only body → trimmed card με ΟΛΑ τα defaults (exact `toEqual`)· coerced fields passthrough (last4 keeps digits capped-4 'ab12cd34ef'→'1234', creditLimit '3500'→3500). **GET** (4): `{ cards }` envelope με κάθε card trimmed (2 cards, full + defaults, exact `toEqual`)· missing active → true (`active !== false`)· sort `{ active:-1, name:1 }`· empty list → `{ cards: [] }` χωρίς error.
- **Σημείο που κλειδώθηκε**: το `active: true` force-on-create invariant (ένα reorder σε `{ active:true, ...set }` θα άφηνε το body να απενεργοποιήσει νέα κάρτα) + οι trim() defaults (ένα drift στο `#00d4ff`/`credit`/`other` fallback σπάει το mobile display).

Τι επαληθεύτηκε:
- `npx vitest run src/app/api/v1/cards/route.test.ts` → 12/12 passed.
- `npx vitest run` (όλο το suite) → 79 files, 1162/1162 passed.
- `npm run type-check` → exit 0 (καθαρό, μηδέν errors).
- Collision guard: πριν το stage, `git diff --cached` κενό (κανένα concurrent routine mid-commit)· `git status --short` = foreign `.claude/launch.json` + 2 deleted `.github/workflows/*.yml` (concurrent routine, ΔΕΝ τα άγγιξα/staged/revert) + 3 mobile screens + το δικό μου cards/route.test.ts + OSS_PROGRESS.md. Στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (β συνέχεια) Συνέχισε endpoint-shape coverage, ένα route ανά run, ίδιο DB-mock pattern. Υψηλής αξίας επόμενα: το `cards/[id]/route.ts` PATCH/DELETE (κλείνει το cards ζεύγος, `cardFieldsFromBody(_, true)` partial-mode + soft-delete DELETE) ή ένα route με `boolField` end-to-end (`subscriptions/[id]` active toggle) ή ουσιαστικά διαφορετικό partial-update (`items/[id]` με price/priceHistory, `receipts/[id]` με line-items). Τρέξε πρώτα `find src/app/api/v1 -name route.ts` + `find src -name '*.test.ts'` + `git status` collision-guard. Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-05 (cont. — cards/[id]/route.test.ts, PATCH partial-mode + hard-DELETE, κλείνει το cards ζεύγος)

**Task: (β συνέχεια) API-shape/validation test `apps/web/src/app/api/v1/cards/[id]/route.test.ts` για το PATCH/DELETE του `/api/v1/cards/:id`.**

Επιλογή target: ακολούθησα ρητά το suggested next task του προηγ. entry (πρώτη επιλογή = `cards/[id]/route.ts`, κλείνει το cards ζεύγος μετά το POST/GET του προηγ. run). Η body coercion ζει στο `cardFieldsFromBody` (ήδη unit-tested στο `cardFields.test.ts`), οπότε δεν την ξανα-καλύπτω· αυτό που ζει ΜΟΝΟ στο route = το wiring: (α) bearer-auth gate, (β) `isObjectId` id guard (malformed → 400 'bad id' χωρίς write), (γ) PATCH partial-mode (`cardFieldsFromBody(b, true)` → το name ΔΕΝ είναι required, σε αντίθεση με POST) + empty `$set` → 400 'no valid fields' + valid → `findByIdAndUpdate(id, {$set}, {new:true})` + bare `{ok:true,id}` + 404 όταν null, (δ) DELETE = **hard** removal (`findByIdAndDelete`, ΟΧΙ soft-delete, καθρεφτίζει το web `deleteCard`).

Κρίσιμα invariants που κλειδώθηκαν:
- **active toggle divergence**: στο PATCH το `{active:false}` είναι νόμιμο partial write (το partial mode το κρατά), ενώ το POST force-spread-άρει `active:true`. Ένα regression που θα το ευθυγράμμιζε με το POST θα έκανε αδύνατη την απενεργοποίηση κάρτας από το mobile.
- **hard-delete guard**: το DELETE καλεί `findByIdAndDelete` (όχι `$set deletedAt`). Ένα drift σε soft-delete (όπως στα tasks/[id]) θα άλλαζε σιωπηλά το contract· το test κλειδώνει ρητά το `cardDelete` call + ότι `cardUpdate` ΔΕΝ καλείται.
- **empty-changeset 400**: all-invalid body (out-of-enum kind, non-boolean active) → κενό set → 400 χωρίς DB touch.

Mock pattern: ίδιο DB-seam pattern με τα προηγ. route tests (`vi.hoisted` + mock `@/lib/db` connectDB + `@/models/User` bearerUser chain + `@/models/Card` findByIdAndUpdate/findByIdAndDelete). Το dynamic route δέχεται `{ params: Promise<{id}> }` → helper `ctx(id)`. findByIdAndUpdate captures (id,update,opts) → `updateState.calls`, επιστρέφει `{ lean: async () => updateState.doc }`· ίδια δομή για το delete.

Τι έγινε: Νέο `[id]/route.test.ts` (13 tests). **auth gate** (2), **id guard** (2), **PATCH** (7: empty→400, all-invalid→400, last4-only valid [name-not-required], full `$set`+trim+{new:true}+{ok,id}, active:false toggle, active:true toggle, 404), **DELETE** (2: hard-remove+{ok,id}, 404).

Τι επαληθεύτηκε:
- `npx vitest run 'src/app/api/v1/cards/[id]/route.test.ts'` → 13/13 passed.
- `npx vitest run` (όλο το suite) → 85 files, 1228/1228 passed.
- `npm run type-check` → exit 0 (καθαρό).
- Collision guard: `git diff --cached` κενό (κανένα concurrent routine mid-commit)· `git status --short` = foreign mods (auth/login/route.ts, billing/enforce.ts, ollama.ts, docs, aiMeter.ts, tenancy/current.ts+test) που ΔΕΝ άγγιξα· στάγιαρα μόνο τα δικά μου cards/[id]/route.test.ts + OSS_PROGRESS.md.

Suggested next task: (β συνέχεια) Συνέχισε endpoint-shape coverage, ένα route ανά run, ίδιο DB-mock pattern. Υψηλής αξίας επόμενα: ένα route με `boolField` end-to-end (`subscriptions/[id]` active toggle) ή ουσιαστικά διαφορετικό partial-update (`items/[id]` με price/priceHistory, `receipts/[id]` με line-items, `stores/[id]`, `shopping-list/[id]`). Ιδανικά ένα route με πλουσιότερη array/nested coercion. Τρέξε πρώτα `find src/app/api/v1 -name route.ts` + `find src -name '*.test.ts'` + `git status` collision-guard. Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-05 (cont. — items/[id]/route.test.ts, GET priceStatus verdicts + PATCH targetPrice key-presence)

**Task: (β συνέχεια) API-shape/validation test `apps/web/src/app/api/v1/items/[id]/route.test.ts` για το GET/PATCH/DELETE του `/api/v1/items/:id` (το πλουσιότερο single-record endpoint του Expo mobile app).**

Επιλογή target: ακολούθησα το suggested next task του προηγ. entry (πρώτη επιλογή στα «ουσιαστικά διαφορετικό partial-update» = `items/[id]` με price/priceHistory, ακόμα untested· `subscriptions/[id]` boolplan ήταν ήδη καλυμμένο). Δύο κομμάτια λογικής ζουν ΜΟΝΟ σε αυτό το route και ένα drift σιωπηλά διαφθείρει το mobile contract χωρίς άλλο test να το πιάσει:
- **GET `priceStatus()`** — server-side mirror του `components/PricePanel.tsx`: best-now (φθηνότερο priced link, αλλιώς currentPrice), lowest/highest seen, trend (last vs previous history point), where-to-buy sorted cheapest-first, και ένα verdict (deal/dropping/rising/good/high/none). Τα verdict thresholds (target hit → deal· pos≤0.15 → good· pos≥0.7 → high) είναι ακριβώς οι τιμές που διαβάζει το mobile badge.
- **PATCH partial coercion** με δύο σκόπιμα αποκλίνοντα πεδία: το `currentPrice` γράφεται ΜΟΝΟ όταν είναι πραγματικός `number` (numeric string αγνοείται), ενώ το `targetPrice` είναι key-presence driven (`'targetPrice' in b`) — `null` το ΚΑΘΑΡΙΖΕΙ, `0` κρατιέται (falsy-but-not-null), numeric string περνά από `Number()`. Ένα regression που θα τα ευθυγράμμιζε (π.χ. `if (b.targetPrice)`) θα έχανε σιωπηλά ένα target clear ή ένα target 0. DELETE = **soft** ($set deletedAt), σε αντίθεση με το hard-delete των cards.

Mock pattern: ίδιο DB-seam pattern με τα προηγ. route tests (`vi.hoisted` + mock `@/lib/db` connectDB + `@/models/User` bearerUser chain + `@/models/Item` findById [GET] + findByIdAndUpdate [PATCH+DELETE, και τα δύο soft-update]). Τρέχω τους ΠΡΑΓΜΑΤΙΚΟΥΣ apiAuth/apiBody/apiList helpers. Mock και το `ITEM_STATUSES` export (enum guard). `itemDoc()` helper για minimal detail docs.

Τι έγινε: Νέο `[id]/route.test.ts` (26 tests). **auth gate** (2: GET no-token→401, PATCH unknown-token→401, καμία query/write). **id guard** (3: GET/PATCH/DELETE malformed id → 400 'bad id' χωρίς DB touch). **GET serialization** (3: 404 όταν missing· defaults + link mapping [label ''/price null] + `photo`=photos[0]· priceHistory newest-first + ISO). **GET priceStatus** (8: where-to-buy priced-only cheapest-first + bestNow=cheapest link· currentPrice fallback bestNow· verdict deal [≤target]· dropping [trend<0]· rising [trend>0]· good [flat, pos≤0.15]· high [flat, pos≥0.7]· none [μηδέν price signal]). **PATCH** (8: empty→400· all-invalid→400· whitelisted $set [title trim/status enum/category/specs/numeric price/tags stringify] + {new:true} + response shape· currentPrice string αγνοείται· targetPrice null clear [lone write]· targetPrice 0 kept· targetPrice numeric-string→Number· 404). **DELETE** (2: soft-delete $set deletedAt Date + {ok,id}· 404).

Τι επαληθεύτηκε:
- `npx vitest run 'src/app/api/v1/items/[id]/route.test.ts'` → 26/26 passed.
- `npx vitest run` (όλο το suite) → 91 files, 1293/1293 passed.
- `npm run type-check` → exit 0 (καθαρό, μηδέν errors).
- Collision guard: πριν το stage, `git diff --cached` κενό (κανένα concurrent routine mid-commit)· `git status --short` = ΜΟΝΟ το δικό μου items/[id]/route.test.ts (τα προηγουμένως uncommitted ollama.ts/ollama.test.ts τα committ-άρισε concurrent routine στο μεταξύ, σωστά δεν τα άγγιξα). Στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (β συνέχεια) Συνέχισε endpoint-shape coverage, ένα route ανά run, ίδιο DB-mock pattern. Υψηλής αξίας επόμενα ακόμα untested: `receipts/[id]/route.ts` (line-items nested coercion, το πιο πλούσιο array partial-update), `stores/[id]/route.ts`, `shopping-list/[id]/route.ts`, `vouchers/route.ts` (GET/POST, μόνο το [id] καλύφθηκε), `expenses/route.ts` (GET/POST, μόνο το [id]), ή ένα `statements/[id]`. Τρέξε πρώτα `find src/app/api/v1 -name route.ts` + `find src -name '*.test.ts'` + `git status` collision-guard. Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-05 (cont. — receipts/[id]/route.test.ts, GET line-serialization + PATCH lineItems sanitizer)

**Task: (β συνέχεια) API-shape/validation test `apps/web/src/app/api/v1/receipts/[id]/route.test.ts` για το GET/PATCH του `/api/v1/receipts/:id` (το πλουσιότερο ARRAY partial-update του mobile surface).**

Επιλογή target: ακολούθησα ρητά το πρώτο suggested next task του προηγ. entry (`receipts/[id]/route.ts`, line-items nested coercion). Το route έχει ΜΟΝΟ GET + PATCH (κανένα DELETE). Δύο κομμάτια λογικής ζουν αποκλειστικά εδώ και ένα drift διαφθείρει σιωπηλά το mobile contract:
- **GET serialization**: `trimReceipt` + notes fallback ('') + `serializeLineItems`, όπου το AI-cleaned `refinedName` ΝΙΚΑΕΙ το raw `name` (η edit φόρμα δείχνει refinedName||name). Το `itemCount` = stored `lineItems.length`, όχι το serialized count. Επίσης `.select('-rawAiResponse')` (ποτέ το debug blob στον client) — pinned μέσω select-capture.
- **PATCH lineItems sanitizer** (το μοναδικό κομμάτι): κάθε edited line ξαναχτίζεται μέσω `numOr(v, default, min)` = `Number(v)` + min-clamp → default. qty default 1 clamped `>=0.0001` (qty 0/negative → 1)· price/vatRate default 0 clamped `>=0` (negative → 0)· το `refinedName` FORCE-άρεται σε '' ώστε το edited name να νικά στο επόμενο GET· και μια γραμμή επιβιώνει ΜΟΝΟ αν `name || price>0` (empty-name zero-price row → dropped). + scalar coercion: store non-empty trimmed· unparseable date αγνοείται· total/subtotal/vatAmount `Number()` μόνο όταν `!=null && finite`· verified/archived δέχονται ΜΟΝΟ πραγματικά booleans· empty changeset → 400 'no valid fields'.

Σημείο που κλειδώθηκε ρητά: το all-dropped lineItems array (π.χ. `[{name:'',price:0}]`) → `set.lineItems=[]` (empty array = non-empty key) → το route ΠΡΟΧΩΡΑ (200) και **καθαρίζει** τα items, ΔΕΝ επιστρέφει 400. Pinned ως contract ώστε ένα μελλοντικό regression που θα το γύριζε σε 400 να σκάσει.

Mock pattern: ίδιο DB-seam pattern με τα προηγ. route tests (`vi.hoisted` + mock `@/lib/db` connectDB + `@/models/User` bearerUser chain + `@/models/Receipt` findById [GET, με select-capture] + findByIdAndUpdate [PATCH]). Τρέχω τους ΠΡΑΓΜΑΤΙΚΟΥΣ apiAuth/apiBody/apiList helpers + τους ΠΡΑΓΜΑΤΙΚΟΥΣ trimReceipt/serializeLineItems από το `../serialize`.

Τι έγινε: Νέο `[id]/route.test.ts` (21 tests). **GET auth+id guard** (4: no-token→401, unknown-token→401, malformed id→400 'bad id', missing→404 + select capture). **GET serialization** (4: full trimReceipt+notes fallback+itemCount-from-stored-length· bare-doc defaults· refinedName-wins line mapping με qty/price/vatRate defaults· soft-deleted→deleted:true). **PATCH auth+id guard** (2). **PATCH scalar** (6: all-invalid→400· full trim/date/Number/bool $set+{new:true}· unparseable date + null/Infinity totals dropped· empty-string paymentMethod/notes kept [typeof-string, όχι truthiness]· non-boolean verified/archived dropped· 404). **PATCH lineItems** (5: remap+refinedName-reset+defaults· qty0/neg→1 & neg price/vat→0 clamp· drop empty-name-zero-price/keep empty-name-with-price· all-dropped→[]· non-array αγνοείται).

Τι επαληθεύτηκε:
- `npx vitest run 'src/app/api/v1/receipts/[id]/route.test.ts'` → 21/21 passed.
- `npx vitest run` (όλο το suite) → 97 files, 1364/1364 passed.
- `npm run type-check` → exit 0 (καθαρό, μηδέν errors).
- Collision guard: πριν το stage, `git diff --cached` κενό (κανένα concurrent routine mid-commit)· `git status --short` = ΜΟΝΟ το δικό μου receipts/[id]/route.test.ts. Στάγιαρα μόνο το δικό μου path· commit `2234ab1` pushed καθαρά (fast-forward, no rebase).

Suggested next task: (β συνέχεια) Συνέχισε endpoint-shape coverage, ένα route ανά run, ίδιο DB-mock pattern. Υψηλής αξίας ακόμα untested [id] routes: `stores/[id]/route.ts`, `shopping-list/[id]/route.ts`, `statements/[id]/route.ts`. Untested collection routes (GET/POST, μόνο το [id] καλύφθηκε): `vouchers/route.ts`, `expenses/route.ts`, `receipts/route.ts`, `stores/route.ts`, `shopping-list/route.ts`. Τρέξε πρώτα `find src/app/api/v1 -name route.ts` + `find src -name '*.test.ts'` + `git status` collision-guard. Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-06 (cont. — vouchers/route.test.ts, GET/POST collection route, κλείνει το vouchers ζεύγος)

**Task: (β συνέχεια) API-shape/validation test `apps/web/src/app/api/v1/vouchers/route.test.ts` για το GET/POST του `/api/v1/vouchers`.**

Επιλογή target: ακολούθησα ρητά το suggested next task του προηγ. entry (το `vouchers/route.ts` ήταν πρώτο στη λίστα «untested collection routes, μόνο το [id] καλύφθηκε»). Κλείνει το vouchers ζεύγος μετά το ήδη-καλυμμένο `vouchers/[id]`. Route-only logic που ζει αποκλειστικά εδώ και ένα drift σιωπηλά διαφθείρει το mobile contract:
- **POST**: `title` required μέσω `strField(b,'title','',true)` (blank/whitespace → trim → '' → 400 'title required' πριν από κάθε DB touch), κάθε άλλο string field trimmed, `expiresAt` **truthiness-gated** (`b.expiresAt ? new Date(...) : null` — falsy/empty/omitted → null, ΟΧΙ key-presence όπως στο PATCH), και το response είναι το SPEC `{ voucher }` wrapper στο 201 (ΟΧΙ list envelope, ΟΧΙ bare `{ok}`). Ένα regression που θα άλλαζε το wrapper ή το title-gate σπάει το mobile create+prefill.
- **GET**: `used=0` → filter `{ used: { $ne: true } }` (και στα δύο find+count), ο `updatedSince` cursor ανάβει `withDeleted` και στα δύο queries (incremental sync πρέπει να βλέπει soft-deletes), sort `{ expiresAt: 1 }`, list envelope `{ data, total, limit, offset }`, και οι trim() defaults (code/store/discount/url/notes '', used false, deleted from deletedAt).

Mock pattern: ίδιο DB-seam pattern με το subscriptions/route.test.ts (`vi.hoisted` + mock `@/lib/db` connectDB + `@/models/User` bearerUser chain + `@/models/Voucher` find/countDocuments/create). Τρέχω τους ΠΡΑΓΜΑΤΙΚΟΥΣ apiAuth/apiBody/apiList helpers ώστε coercion + serialization αληθινά. find = self-returning chain (sort/skip/limit/setOptions→self, lean→docs), count = thenable με self-returning setOptions, create = doc με `.toObject()` (ο route trims `doc.toObject()`).

Τι έγινε: Νέο `route.test.ts` (14 tests). **auth gate** (2: GET no-token→401 + no find, POST unknown-token→401 + no create). **POST** (6: missing title→400 'title required' + no create· whitespace title→ίδιο· title-only → all-'' defaults + expiresAt null + 201 `{voucher}` [exact toEqual create arg + no ok/data keys]· full body → όλα trimmed + expiresAt Date με σωστό ISO round-trip· empty-string expiresAt → null [truthiness, όχι key-presence]). **GET** (6: list envelope + trim mapping full+bare doc [exact toEqual defaults]· used=0 → `{used:{$ne:true}}` σε find+count· no used → `{}`· sort `{expiresAt:1}`· updatedSince → `$gte` + withDeleted και στα δύο queries· χωρίς cursor → κανένα setOptions· soft-deleted doc → deleted:true).

Τι επαληθεύτηκε:
- `npx vitest run src/app/api/v1/vouchers/route.test.ts` → 14/14 passed.
- `npx vitest run` (όλο το suite) → 101 files, 1415/1415 passed.
- `npm run type-check` → exit 0 (καθαρό, μηδέν errors).
- Collision guard: πριν το stage, `git diff --cached` κενό (κανένα concurrent routine mid-commit)· `git status --short` = foreign `apps/web/SAAS_PROGRESS.md` (concurrent routine, ΔΕΝ το άγγιξα/staged) + το δικό μου vouchers/route.test.ts + OSS_PROGRESS.md. Στάγιαρα μόνο τα δικά μου paths.

Suggested next task: (β συνέχεια) Συνέχισε endpoint-shape coverage, ένα route ανά run, ίδιο DB-mock pattern. Υψηλής αξίας ακόμα untested collection routes: `expenses/route.ts` (GET/POST — kind/amount/date coercion), `stores/route.ts` (alias cleaning), `shopping-list/route.ts`, `receipts/route.ts`. Untested [id] routes: `stores/[id]/route.ts`, `shopping-list/[id]/route.ts`, `statements/[id]/route.ts`. Τρέξε πρώτα `find src/app/api/v1 -name route.ts` + `find src -name '*.test.ts'` + `git status` collision-guard. Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".

---

## 2026-07-06 (cont.² — expenses/route.test.ts, GET/POST collection route, κλείνει το expenses ζεύγος)

**Task: (β συνέχεια) API-shape/validation test `apps/web/src/app/api/v1/expenses/route.test.ts` για το GET/POST του `/api/v1/expenses`.**

Επιλογή target: ακολούθησα ρητά το suggested next task του προηγ. entry (το `expenses/route.ts` ήταν πρώτο στη λίστα «untested collection routes», με σημείωση για kind/amount/date coercion). Κλείνει το expenses ζεύγος μετά τα ήδη-καλυμμένα `expenses/[id]` + `expenses/serialize`. Route-only logic που ζει αποκλειστικά εδώ και ένα drift σιωπηλά διαφθείρει το mobile contract:
- **POST validation ORDER** (τα τρία gates τρέχουν ΠΡΙΝ από κάθε DB touch): `vendor` required (`strField(b,'vendor','',true)` → blank/whitespace trim → '' → 400 'vendor required')· μετά `amount` (`numField` → null → 400 'amount must be a number', αλλά το **0 είναι VALID** αφού είναι finite)· μετά `date` (`b.date ? new Date(...) : new Date()` → NaN → 400 'invalid date'). Το create arg: kind/recurringCycle enum-gated (invalid → 'expense' / '')· category default 'other'· `vendorKey` derived από τον vendor (Greek→latin: ΔΕΗ → 'dei')· `verified` forced true (manual entry = trusted). Response = SPEC `{ expense }` wrapper στο 201 (ΟΧΙ list envelope, ΟΧΙ `{ok}`).
- **GET**: kind filter (`{ kind }` ΜΟΝΟ για income|expense, αλλιώς `{}`)· sort `{ date: -1 }`· ο `updatedSince` cursor ανάβει `withDeleted` και στα δύο queries· ΚΑΙ το **anomaly pass SKIPPED σε incremental sync** (`updatedSince ? [] : computeAnomalies(docs)` — ένα partial slice θα έβγαζε λάθος medians). Το `computeAnomalies` (≥3-doc vendor series, >30% deviation από median → ±% rounded) τρέχει ΜΟΝΟ σε full-list read.

Mock pattern: ίδιο DB-seam pattern με το vouchers/route.test.ts (`vi.hoisted` + mock `@/lib/db` connectDB + `@/models/User` bearerUser chain + `@/models/Expense` find/countDocuments/create). Τρέχω τους ΠΡΑΓΜΑΤΙΚΟΥΣ apiAuth/apiBody/apiList helpers + τον ΠΡΑΓΜΑΤΙΚΟ `vendorKey` (`@/app/expenses/lib`) + τα ΠΡΑΓΜΑΤΙΚΑ trimExpense/computeAnomalies (`./serialize`) ώστε coercion + serialization + anomaly stats να είναι αληθινά. find = self-returning chain· count = thenable με self-returning setOptions· create = doc με `.toObject()`.

Τι έγινε: Νέο `route.test.ts` (21 tests). **auth gate** (2: GET no-token→401 + no find, POST unknown-token→401 + no create). **POST validation** (9: missing vendor→400 'vendor required' + no create· whitespace vendor→ίδιο· missing amount→400 'amount must be a number'· unparseable amount→ίδιο· **amount 0 → 201** [finite, not null]· invalid date→400 'invalid date' + no create· minimal → all defaults + derived vendorKey + now-Date + `{expense}` 201 [no ok/data keys]· full body → enum kind/cycle + trimmed + parsed ISO date + ΔΕΗ→'dei' vendorKey· invalid kind→'expense' & invalid cycle→''). **GET listing** (10: list envelope + trim mapping full+bare doc [exact toEqual defaults] + no anomaly on <3 series· kind=income filter σε find+count· kind=expense· unknown kind→`{}`· sort `{date:-1}`· updatedSince → `$gte` + withDeleted και στα δύο· χωρίς cursor → κανένα setOptions· ≥3 series outlier → `anomaly:100` + in-median rows no flag· updatedSince → anomaly pass SKIPPED· soft-deleted → deleted:true).

Τι επαληθεύτηκε:
- `npx vitest run 'src/app/api/v1/expenses/route.test.ts'` → 21/21 passed.
- `npx vitest run` (όλο το suite) → 104 files, 1457/1457 passed.
- `npm run type-check` → exit 0 (καθαρό, μηδέν errors).
- Collision guard: πριν το stage, `git diff --cached` κενό (κανένα concurrent routine mid-commit)· `git status --short` = ΜΟΝΟ το δικό μου expenses/route.test.ts. Στάγιαρα μόνο τα δικά μου paths (route.test.ts + OSS_PROGRESS.md).

Suggested next task: (β συνέχεια) Συνέχισε endpoint-shape coverage, ένα route ανά run, ίδιο DB-mock pattern. Υψηλής αξίας ακόμα untested collection routes: `stores/route.ts` (alias cleaning), `shopping-list/route.ts`, `receipts/route.ts`. Untested [id] routes: `stores/[id]/route.ts`, `shopping-list/[id]/route.ts`, `statements/[id]/route.ts`, `cards` ήδη καλυμμένα. Τρέξε πρώτα `find src/app/api/v1 -name route.ts` + `find src -name '*.test.ts'` + `git status` collision-guard. Ένα module ανά run. Εκκρεμεί ακόμα το SSRF IPv4-mapped fix στο "## Needs Achilleas".
