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
