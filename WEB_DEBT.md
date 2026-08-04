# WEB_DEBT — Pharos web code-quality queue

> Παράγεται από τον web code-quality auditor (read-only). Ο builder routine καταναλώνει το «## Web Debt Queue» (μικρότερο + υψηλότερη προτεραιότητα πρώτα). Λεπτομέρειες ανά run στο `PROGRESS.md`.
> Σύμβολα status: TODO · DOING · DONE.

## Σύνοψη audit (2026-08-04 66η σάρωση [reviewer routine]· type-check web+mobile EXIT 0· full vitest 5943/5947 (371 files, 4 skipped)· 11 commits ελέγχθηκαν [`75ee08d..c568a3b`]· κύριο commit `2f10b8f` [api/v1 tenant-scoping, 103 αρχεία] διαβασμένο γραμμή-γραμμή, exemplary· μηδέν νέο P1/P2 εύρημα· standing P1 [settings Trash tenancy gap] ΑΚΟΜΑ TODO αμετάβλητο· el.ts i18n gap σταθερό (30, en=1331/el=1301)· μηδέν committed secret)

> **Έλεγχος διαφοράς**: `git log 75ee08d..HEAD` = 11 commits. Κύριο κώδικας: **`2f10b8f`** (fix(api): scope every `/api/v1` route to the caller's workspace) — ξεχωριστό gap από το ήδη-ανοιχτό `settings/actions.ts` Trash P1 (αυτό είναι το mobile-facing REST surface, εκείνο είναι το browser Settings UI). Νέο `apiTenant()` λύνει tenant από HOST header πριν το bearer-token lookup (η σειρά είναι το κρίσιμο σημείο, τεκμηριωμένο in-line στο commit message και στο ίδιο το `apiAuth.ts`). Μηχανική επαλήθευση: κάθε `X as XModel` import κάτω από `api/v1/**/route.ts` έχει αντίστοιχο `currentModel(XModel)` call (grep script, 0 misses) — οι δύο module-scope helpers που ο codemod ομολογεί ότι δεν έφτασε (`settings/route.ts:spentThisMonth`, `subscriptions/route.ts:discoverSuggestions`) διορθώθηκαν σωστά χειροκίνητα. Νέο `apiAuth.tenancy.test.ts` καλύπτει την ιδιότητα που μετράει (workspace-A token → 401 σε workspace-B host, handler ΔΕΝ καλείται) + 404 άγνωστο workspace + 403 suspended + SAAS_MODE off αμετάβλητο. Route response shapes αμετάβλητα (μόνο internal model-resolution άλλαξε) → μηδέν mobile-parity break. **`2dbab73`** (next 15.5.19→15.5.22 + forced postcss/sharp overrides) κλείνει 8 direct Next CVE + 2 residual transitive, verified σε isolated worktree (τεκμηριωμένο στο commit message, δεν επαναλήφθηκε εδώ). **`93a4046`** (flock lock στο `deploy-update.sh`, exit 4, mirrors BakeCore) μικρό/καθαρό. `dc292d1`/`ef10669`/`c568a3b` docs-only (deploy log) — cross-checked συνεπή: το `dc292d1` λέει «δεν έγινε deploy», το μεταγενέστερο `c568a3b` καταγράφει το χειροκίνητο deploy που ΤΕΛΙΚΑ έγινε (`89d49c8→dc292d17`, exit 0, independent 200/401 verification σε production) — σωστή σειρά, όχι αντίφαση. `npm run type-check` (web) EXIT 0· `npx tsc --noEmit` (mobile) EXIT 0· `npx vitest run` (web, πλήρης) → **5943/5947 passed, 4 skipped, 371 files** (ίδιο count με τον ισχυρισμό του commit message, independently verified). Secrets sweep (grep key/token/password/PEM/BEGIN στο πλήρες diff) → μηδέν committed secret.
> **Standing queue re-verified live**: το P1 `settings/actions.ts` Trash gap (`getTrash`/`restoreFromTrash`/`purgeTrashEntry`/`emptyTrash`) ΑΚΟΜΑ TODO — `grep` confirmed 0 `scoped()`/`currentModel` στις 4 συναρτήσεις, αμετάβλητο (κανένα commit σε αυτό το range το αγγίζει). Δεν το άγγιξα (irreversible-delete paths, εκτός «μικρό & ασφαλές» ορίου).
> **Routine health**: PROGRESS/SAAS_PROGRESS/OSS_PROGRESS/CLOUD_GUARD όλα με φρέσκια 2026-08-04 activity, κανένα routine φαίνεται stuck. LANDING_PROGRESS/DOCS_PROGRESS δεν υπάρχουν πια (συνεπές με fleet reorg 25→15). Ένα ανοιχτό `ASK_ACHILLEAS.md` item (`bakecore-finance-20260728-1030`, ~1 εβδομάδα OPEN μέρος του) είναι BakeCore, εκτός scope.

## Σύνοψη audit (2026-08-04 65η σάρωση [reviewer routine]· type-check web+mobile EXIT 0· full vitest 5937/5941 (370 files, 4 skipped)· 74 commits ελέγχθηκαν [`f44e227..8232337`]· settings/actions.ts κύριο σώμα (64 call sites) ΕΚΛΕΙΣΕ, shopping-list ήδη είχε κλείσει από τον ίδιο τον builder· 1 νέο P1 εύρημα [settings Trash tenancy gap, narrowed υπόλοιπο του ίδιου item]· el.ts i18n gap σταθερό (30, en=1331/el=1301)· μηδέν committed secret)

> **Πρώτη ενέργεια, εκτός κανονικού diff review**: βρέθηκαν 4 ασύνδετες, ήδη-verified, uncommitted αλλαγές στο working tree στην αρχή του run (πιθανώς routines που έτρεξαν χωρίς να προλάβουν να κάνουν commit): 30-day retention copy σε 3 landing pages (`page.tsx`/`privacy`/`terms`, matches το ήδη-εγκεκριμένο backlog decision #14), P82 cron-alerts dedupe wiring (route.ts+test, βρέθηκε ΗΔΗ committed από άλλο routine ανάμεσα στο `git add` και το `git commit` μου — pathspec commit το προστάτεψε, μηδέν no-op collision), ένα ορφανό staged-for-deletion `deploy/Caddyfile` (superseded από `deploy/caddy/Caddyfile` στο `6f53fb4`, μηδέν live reference), και ένα trivial `.claude/launch.json` dev-tooling προσθήκη. Committed ξεχωριστά (4 pathspec commits, μηδέν foreign file swallowed): `0430b29`/`13583d7`/`f975897` (το 4ο, alerts dedupe, no-op λόγω race). Λεπτομέρειες στο PROGRESS.md.
> **Έλεγχος διαφοράς**: `git log f44e227..HEAD` = 74 commits (μεγάλο batch, ~2 μέρες φλέβα SaaS/backup/tenancy δουλειάς). Μη-test/docs surface (~65 αρχεία): κύριο **`b800fc3`** (settings tenant-scoping, βλ. queue update παρακάτω), **`f1e1ccb`**+**`dd7fdeb`** (ζευγάρι: το πρώτο σταματά `resolveRequestTenant` να ρίχνει 500 σε logged-out/mistyped-slug/suspended-customer, μετατρέποντάς τα σε 307/404· το δεύτερο μετακίνησε τα 3 CRON_SECRET-routes από `/api/saas/*` σε `/api/cron/saas/*` ΠΡΙΝ προλάβει να σπάσει η ίδια η ασφάλεια που έφτιαξε το πρώτο commit — καλή προνοητικότητα, διαβάστηκε το reasoning στο commit message και επιβεβαιώθηκε ότι κάθε cron route όντως καλεί `checkCronAuth`), **`f1f1cde`** (P46 expense duplicate find+merge, νέο `lib/expenseDupes.ts` pure+tested, `expenses/actions.ts` additions σωστά μέσα σε `withRequestTenant`/`currentModel`, soft-delete-aware merge με σωστό file-reference clearing πριν trash), **`middleware.ts`** αλλαγή (νέο `if (saasMode()) return pass()` bypass του self-hosted session gate + `/api/cron` matcher exclusion — και τα δύο διαβασμένα γραμμή-γραμμή, reasoning συνεπές με το `f1e1ccb`/`dd7fdeb` ζευγάρι, self-hosted mode byte-for-byte αμετάβλητο [`saasMode()` false → η υπόλοιπη λογική τρέχει ΑΚΡΙΒΩΣ όπως πριν]). Τα υπόλοιπα ~55 αρχεία είναι test-only/docs/i18n/landing-copy, spot-checked καθαρά. `npm run type-check` (web) EXIT 0· `npx tsc --noEmit` (mobile) EXIT 0· `npx vitest run` (web, πλήρης) → **5937/5941 passed, 4 skipped, 370 files**. Secrets sweep (grep key/token/password/PEM/BEGIN στο πλήρες diff) → μηδέν committed secret.
> **Νέο εύρημα (P1, βλ. πλήρες write-up στο queue παρακάτω)**: το `settings/actions.ts` Trash section (`getTrash`/`restoreFromTrash`/`purgeTrashEntry`/`emptyTrash`, τροφοδοτούμενα από `TRASH_MODELS` raw model map, 10 τύποι εγγραφών) ΔΕΝ καλύφθηκε από το `b800fc3` tenancy sweep του ίδιου αρχείου — live-verified, `grep`-confirmed. Σε SaaS mode: cross-tenant read leak στο Trash tab + destructive delete (restore/purge/empty) που ενεργεί στο DEFAULT tenant's DB αντί στου καλούντος. Μηχανικό fix, ίδιο `scoped()` helper ήδη υπάρχει στο ίδιο αρχείο· ΔΕΝ έγινε από τον reviewer (αγγίζει irreversible-delete paths, εκτός «μικρό & ασφαλές» ορίου αυτού του routine).
> **Standing queue re-verified live**: `tasks/actions.ts`/`shopping-list/actions.ts`/`subscriptions/actions.ts`/`notifications/actions.ts`/`bills/actions.ts`/`statements/actions.ts`/`vouchers/page.tsx` confirmed DONE στον κώδικα (grep θετικό σε όλα)· `history/actions.ts` confirmed ΑΚΟΜΑ ανοιχτό, αμετάβλητο (`grep -c "withRequestTenant\|currentModel"` = 0).
> **Routine health**: PROGRESS/SAAS_PROGRESS/OSS_PROGRESS/LANDING_PROGRESS όλα με φρέσκια 2026-08-04 activity, κανένα routine φαίνεται stuck. Docker rebuild verification για το σημερινό batch (b800fc3/f1e1ccb/dd7fdeb/f1f1cde/middleware saasMode bypass) ήδη τεκμηριωμένο μέσα στα ίδια τα commits (mongo healthy→build→up -d web→/login 200 pattern)· reviewer δεν κάνει δικό του rebuild (forbidden action).

## Σύνοψη audit (2026-08-02 64η σάρωση [reviewer routine]· type-check web+mobile EXIT 0· full vitest 5499/5503 (345 files, 4 skipped)· 14 commits ελέγχθηκαν [`eadb959..f44e227`]· 1 από τα 4 standing P2 items (tasks) πλέον DONE, 3 παραμένουν ανοιχτά αμετάβλητα· μηδέν νέο P1/P2 εύρημα)

> **Έλεγχος διαφοράς**: `git log eadb959..HEAD` = 14 commits. Κύριο κώδικας: **`9513644`** (tasks tenant-scoping) έκλεισε το standing `tasks/actions.ts` P2 item παρακάτω — και τα 7 exports τυλίχτηκαν σε `withRequestTenant`+`currentModel(TaskModel)` (grep count 16), μαζί με το read path (`tasks/page.tsx getTasks()`, εκτός αρχικού `Files:` αλλά σκόπιμα, ίδια λογική με το vouchers read-path follow-up). Διαβάστηκε γραμμή-γραμμή: το `assertCanWrite()` έμεινε πριν το wrap (writeGuard scanner το βλέπει), το blank-step short-circuit του `addStep` έμεινε πριν το wrap επίσης (μηδέν κόστος tenant resolution σε no-op) — καθαρό. Νέο `actions.tenant.test.ts` (7 tests, δύο tenants + self-hosted no-tenant path) verified. **`cec63e9`** (quick-window chips στο platform audit feed) — οι δύο νέες pure helpers (`auditQuickRanges`/`matchQuickRange`, `adminAudit.ts`) διαβάστηκαν: UTC day-granularity σκόπιμη (όχι "last 24h", ώστε το preset να είναι σταθερό σε όλη τη μέρα, verified με το tests `early===late` για 00:05Z/23:55Z), inclusive-count off-by-one tests σωστά (last7 = today-6), το `matchQuickRange` compare day-strings όχι Dates (σωστό, ο `to` bound γίνεται 23:59:59.999Z edge) — 8 νέα tests, όλα περνάνε. Threading στο `page.tsx` (chip href δροπάρει το `before` cursor σκόπιμα, "All time" clear μόνο το window όχι όλα τα φίλτρα) διαβασμένο, καθαρό. **`864effe`** (landing dual-positioning copy) — καθαρά textual (layout/manifest/opengraph/page.tsx/security.txt/llms.txt), κανένα behavioral risk, συνεπές με το ήδη-τεκμηριωμένο "self-host free ή managed" μήνυμα. **`299fb07`** (storage-actions.test.ts, 7 tests) test-only, coverage για ήδη-υπάρχοντα `onedriveEnabled`/`getOnedriveShareLink` (καμία αλλαγή συμπεριφοράς). Τα υπόλοιπα 8 commits docs/progress-log μόνο. `npm run type-check` (web) EXIT 0· `npx tsc --noEmit` (mobile) EXIT 0· `npx vitest run` (web, πλήρης) → **5499/5503 passed, 4 skipped, 345 files**. Μηδέν committed secret (grep key/token/password/PEM/BEGIN στο πλήρες diff → μόνο prose/progress-log references).
> **Standing queue re-verified live**: τα 3 εναπομείναντα P2 items (`shopping-list/actions.ts`, `history/actions.ts`, `settings/actions.ts`) confirmed ΑΚΟΜΑ ανοιχτά — `grep -c "withRequestTenant\|currentModel"` = 0 και στα 3 αρχεία, αμετάβλητο.
> **Monitor note**: το `docker-health guard` (commit `8a3ca51`) validated rebuild μόνο μέχρι το `752ce37` — δύο μεταγενέστερα runtime commits σε αυτό το range (`9513644` tasks tenant-scoping, `cec63e9` quick-window chips) δεν έχουν ακόμα δικό τους Docker rebuild/verify. Μηδέν επείγον: SAAS_MODE είναι off στο live container του Achilleas, άρα και τα δύο αλλάζουν συμπεριφορά μόνο σε SaaS mode (tasks tenant-scoping is a no-op wrapper όταν DEFAULT_TENANT, το quick-window chips ζει πίσω από `requireSuperadminPage()`). Reviewer δεν κάνει rebuild (forbidden action για αυτό το routine) — αφήνεται στο επόμενο docker-health-guard/daily-dev run.
> Όλα τα routine progress logs (PROGRESS/OSS_PROGRESS/SAAS_PROGRESS/LANDING_PROGRESS/DOCS_PROGRESS) έχουν φρέσκια 2026-08-02 entry· κανένα routine φαίνεται stuck.

## Σύνοψη audit (2026-08-01 63η σάρωση [reviewer routine]· type-check web+mobile EXIT 0· full vitest 5478/5482 (343 files, 4 skipped)· 12 commits ελέγχθηκαν [`997837f..eadb959`]· 1 από τα 5 standing P2 items (subscriptions) πλέον DONE, 4 παραμένουν ανοιχτά αμετάβλητα· μηδέν νέο P1/P2 εύρημα· el.ts i18n gap σταθερό (30 missing keys, en=1307/el=1277))

> **Έλεγχος διαφοράς**: `git log 997837f..HEAD` = 12 commits, κανένα mobile-touching. Κύριο κώδικας: **`2b203b7`** (subscriptions tenant-scoping) έκλεισε το standing `subscriptions/actions.ts` P2 item παρακάτω — και τα 6 exports τυλίχτηκαν σε `withRequestTenant`+`currentModel`, `discoverUntrackedRecurring` resolve-άρει Expense+Subscription μέσα στο ίδιο wrap (αλλιώς cross-tenant leak στο exclude set). Side-finding διαβασμένο γραμμή-γραμμή: `trackDiscoveredSubscription` δεν είχε write guard καθόλου — το `assertCanWrite()` του P31 (`1346b4d`) είχε καταλήξει ΜΕΤΑ το closing brace της συνάρτησης ως top-level statement (έτρεχε μία φορά στο import, «Track this» ανοιχτό σε viewer role από τις 27 Ιουλίου) — τώρα σωστά μέσα στη συνάρτηση, ΚΑΙ ο `writeGuard.coverage.test.ts` scanner σκληρύνθηκε να κόβει το body σε brace matching αντί σε τέλος-αρχείου, με negative-control (re-introduce το bug → scan πέφτει by name). **`81b150e`** (platform audit actor-email filter + CSV export) — email→account-id resolve πριν το query filter (filter by email string θα έδειχνε ψευδώς "μηδέν activity"), `unknownActor` state mirroring `unknownTenant`, filename `by-<email>` segment, 13 νέα tests· threading στο `page.tsx` (filterLinkParams/CSV link/Reset) και export route (404 πριν header-only CSV) διαβασμένο, καθαρό. **`2f6cff0`** (humans.txt fix) — 4 stale claims (self-hosted-only positioning, "static export", unscoped privacy claim, ημερομηνία) διορθώθηκαν, cross-checked έναντι live landing DOM + `next.config.ts` (`output:'standalone'` επιβεβαιωμένο). **`62ed9eb`** (i18nActions.test.ts, 5 νέα tests) test-only. Τα υπόλοιπα 6 commits docs/progress-log μόνο. `npm run type-check` (web) EXIT 0· `npx tsc --noEmit` (mobile) EXIT 0· `npx vitest run` (web, πλήρης) → **5478/5482 passed, 4 skipped, 343 files**. Μηδέν committed secret (grep key/token/password/PEM στο πλήρες diff → μόνο prose env-var references).
> **Standing queue re-verified live**: τα 4 εναπομείναντα P2 items (`tasks/actions.ts`, `shopping-list/actions.ts`, `history/actions.ts`, `settings/actions.ts`) confirmed ΑΚΟΜΑ ανοιχτά — `grep -c "withRequestTenant\|currentModel"` = 0 και στα 4 αρχεία, αμετάβλητο.

## Σύνοψη audit (2026-07-31 62η σάρωση [reviewer routine]· type-check web+mobile EXIT 0· full vitest 5454/5454 (341 files, 4 skipped)· 11 commits ελέγχθηκαν [`74a0f12..997837f`]· CONFIRMATION run, μηδέν νέο P1/P2 εύρημα· 1 από τα 6 standing P2 items (notifications) πλέον DONE, 5 παραμένουν ανοιχτά αμετάβλητα· el.ts i18n gap σταθερό (30 missing keys, en=1307/el=1277))

> **Έλεγχος διαφοράς**: `git log 74a0f12..HEAD` = 11 commits. Κύριο κώδικας: **`daeea7e`** έκλεισε το ήδη-ανοιχτό `notifications/actions.ts` P2 item (βλ. queue παρακάτω, ήδη marked DONE από τον ίδιο τον builder με πλήρες verify) — διαβάστηκε το πλήρες diff γραμμή-γραμμή: και τα 6 exported actions τυλίγονται σε `withRequestTenant`, `computeAlerts()` σωστά resolve-άρει τα 6 μοντέλα από ambient tenant (μόνο caller του είναι ήδη-wrapped bodies), το per-tenant throttle `Map` (αντί για module-scalar) σωστά αποτρέπει cross-tenant silencing, το `generateNotifications` κρατά τα writes inline επίτηδες ώστε το `writeGuard.coverage.test.ts` να μη χάσει το action — τεκμηριωμένη σχεδιαστική απόφαση, επιβεβαιώθηκε ότι το guard όντως θα το έχανε αν γινόταν helper. **`a7bb89c`** πρόσθεσε UTC date-range filter στο platform audit feed + CSV export: το `parseAuditDate`/`parseAuditRange` διαβάστηκε προσεκτικά για το day-boundary-expansion + inverted-range correction (re-parse raw inputs, όχι swap Dates — σωστό, γιατί swap θα ζόγκαρε το window κατά μία μέρα) + το round-trip check για overflow ημερομηνίες (`2026-02-30`→Μάρτιος) — όλα ορθά, `buildPlatformAuditFilter` σωστά κρατά το `createdAt` range top-level ξεχωριστό από το keyset `$or` (pagination δεν διαρρέει έξω από το window). Ελέγχθηκε ΚΑΙ το threading στο `page.tsx` (filterLinkParams σε CSV link + Back-to-latest + Load-more, echo το ΔΙΟΡΘΩΜΕΝΟ window όχι το raw query) — καθαρό, καμία σιωπηλή απώλεια φίλτρου στη σελιδοποίηση. **`997837f`** (llms.txt pricing fix) — cross-checked τους 4 αριθμούς (Free €0/5GB/50, Pro €9/50GB/1000/5-members, Dedicated €29/500GB/unlimited-members) έναντι `lib/billing/plans.ts` PLANS object· ταιριάζουν byte-for-byte, annual math (€90/€290 = ×10) σωστό. Τα υπόλοιπα 8 commits είναι test-only/docs (`b31c625` loyaltyActions.test.ts 16 tests, `a98f2b2`-class calendar feed tests ήδη σε προηγούμενο range). `npm run type-check` (web) EXIT 0· `npx tsc --noEmit` (mobile) EXIT 0· `npx vitest run` (web, πλήρης) → **5454/5454 passed, 4 skipped, 341 files**.
> **OSS routine's flagged regression, ελέγχθηκε, ΔΕΝ αναπαράγεται**: το `OSS_PROGRESS.md` (2026-07-31 cont.⁸) ανέφερε 2 deterministic failures στο `notifications/actions.tenant.test.ts` μετά το `daeea7e`, reproduced ξεχωριστά από τον ίδιο routine. Ξανα-έτρεξα το ίδιο αρχείο μεμονωμένα (7/7 pass), μαζί με τα sibling notification test files (34/34 pass), και ολόκληρη τη σουίτα (5454/5454 pass, 0 failed) — ΚΑΜΙΑ αποτυχία σε κανένα από τα τρία περάσματα, το αρχείο δεν άλλαξε από τότε (`git log` = μόνο `daeea7e`). Πιθανό transient/parallelization flake στο δικό τους run (πολύ πιο αργό wall-clock ~280s vs ~11s εδώ, ίσως worker-pool contention), όχι πραγματικό regression στο σημερινό HEAD. Καταγράφεται εδώ ώστε το επόμενο run να μην ξαναχάσει χρόνο κυνηγώντας το ίδιο φάντασμα.
> **Standing queue re-verified live**: τα 5 εναπομείναντα P2 items (`subscriptions/actions.ts`, `tasks/actions.ts`, `shopping-list/actions.ts`, `history/actions.ts`, `settings/actions.ts`) confirmed ΑΚΟΜΑ ανοιχτά — `grep -c "withRequestTenant\|currentModel"` = 0 και στα 5 αρχεία, αμετάβλητο.

## Σύνοψη audit (2026-07-30 61η σάρωση [reviewer routine]· type-check web+mobile EXIT 0· 11 commits ελέγχθηκαν [`9ae1b1b..74a0f12`]· και τα 3 προηγούμενα P2 items (bills/statements/vouchers) confirmed DONE στον κώδικα → ουρά άδειασε· 6 νέα P2 queue items από standing scan [ίδια κλάση tenancy-parity gap, επόμενο batch αφού άδειασε η ουρά]· μηδέν P1· el.ts i18n gap σταθερό ~30)

> **Έλεγχος διαφοράς**: `git log 9ae1b1b..HEAD` = 11 commits. Κύριο: **`a33fd34`** ολοκλήρωσε το `statements/actions.ts` tenant-scoping (14 exported functions + Card + Receipt, νέο `actions.tenant.test.ts` 8 tests με negative control) — διαβάστηκε το πλήρες diff γραμμή-γραμμή, mechanical wrap ίδιο recipe με τα ήδη-κλεισμένα siblings, `assertCanWrite()`/Zod parse σωστά μένουν έξω από το `withRequestTenant` wrap (ίδιο με bills/vouchers), οι 3 internal signature-mutators + `findOrCreateCard` σωστά resolve-άρουν από ambient tenant (μόνο callers τους είναι ήδη-wrapped exports). **`a17243a`** πρόσθεσε `/api/saas/admin/audit/export` (CSV του platform audit feed): read-only, πίσω από `requireSuperadmin`, RFC 4180 quoting + CSV-injection guard (`=+-@\t\r` prefix escape) + UTF-8 BOM για ελληνικά ονόματα, ξεχωριστό 5000-row ceiling από το 200-row page cap, άγνωστο tenant slug → 404 (όχι header-only CSV που δείχνει "τίποτα δεν έγινε") — καθαρό. **`a98f2b2`** test-only (12 tests, calendar feed CRUD). Τα υπόλοιπα 6 commits είναι docs/progress-log (μηδέν κώδικας). `npm run type-check` (web) EXIT 0· `npx tsc --noEmit` (mobile) EXIT 0.
> **Ουρά άδειασε**: και οι 3 προηγούμενες P2 εγγραφές (`bills/actions.ts`, `statements/actions.ts`, `vouchers/page.tsx`) είναι πλέον `Status: DONE` με βάση επιβεβαιωμένο κώδικα (`grep -c "withRequestTenant\|currentModel"` θετικό και στα 3 αρχεία). Καμία ενεργή queue εγγραφή δεν έμεινε πριν από αυτό το scan.
> **Νέο standing-scan εύρημα (ίδιας κλάσης με τα μόλις-κλεισμένα bills/statements/vouchers)**: grep για action-αρχεία που κάνουν `import { X } from '@/models/...'` αλλά ΠΟΤΕ δεν αναφέρουν `currentModel`/`withRequestTenant` εντόπισε **6 ακόμα** αρχεία εκτός του ήδη-γνωστού κύκλου (items/receipts/expenses/vouchers/giftcards/loyaltycards/bills/statements, όλα ήδη DONE). Επιβεβαιώθηκε ότι **δεν** είναι false positive: το `Task` model καλείται ήδη μέσω `currentModel(TaskModel)` από το `items/actions.ts:835`, και το `Subscription` model ήδη μέσω `currentModel(Subscription)` από το `lib/fxAudit.ts:109` και `settings/sampleDataActions.ts` (×3) — δηλαδή άλλα σημεία του κώδικα ήδη αντιμετωπίζουν αυτά τα δύο models ως tenant-scoped, αλλά τα ΚΥΡΙΑ CRUD action-αρχεία τους όχι. `login/actions.ts` και `setup/actions.ts` εξαιρέθηκαν σκόπιμα (νόμιμα pre-tenant/global: auth identifies the tenant, initial setup wizard προηγείται οποιουδήποτε tenant). Προστέθηκαν 6 νέα P2 items παρακάτω (ίδιο recipe, wrap κάθε exported DB-touching function σε `withRequestTenant(async () => { const X = await currentModel(XModel); ... })`).

> **Έλεγχος διαφοράς**: `git log 64a6ead..HEAD` = 81 commits, κυρίως το **P9 multi-currency rollout** (Bills/Subscriptions/Items/Statements/Expenses/Receipts, web+mobile, ολοκληρώθηκε σε αυτό το διάστημα) + SaaS route-test coverage (password-reset, audit trail, invites, members, usage, account/export/reset/workspaces) + P63 backup-model completeness fix (`lib/backupModels.ts`, 7 models που το JSON backup σιωπηλά έριχνε). Production-code diff (χωρίς tests/docs) ελέγχθηκε γραμμή-γραμμή από sub-agent review: **FX conversion math** (`lib/fx.ts`, `lib/fxApply.ts`, `lib/fxAudit.ts`, mobile `fx.ts`) traced σε κάθε write path (Bills/Items/Statements/Expenses/Subscriptions, mobile+web, CSV import rate-map, reports FX-audit apply-in-place) → σωστή κατεύθυνση παντού (`amount = origAmount * fxRate`, `toPrinted` σωστά inverts, χωρίς sign/base-vs-printed confusion). **v1 API↔mobile shape parity** ελέγχθηκε σε κάθε touched route (bills/expenses/items/statements) έναντι `apps/mobile/src/api.ts` → όλα τα νέα πεδία (`currency`/`origAmount`/`fxRate`) additive και mirrored σωστά και στις δύο πλευρές· το προϋπάρχον "λάθος symbol πάνω σε σωστό ποσό" bug pattern (list badge δείχνει `item.currency` αντί για `base`) διορθώθηκε σωστά παντού σε αυτό το batch. **Mobile hardcoded-token sweep** (μετά το πρόσφατο borderRadius→RADIUS refactor): `FxControls.tsx`/`BillsScreen.tsx`/`MoneyScreen.tsx`/`SubscriptionsScreen.tsx` χρησιμοποιούν αποκλειστικά `C`/`RADIUS`/`SPACE`/`SIZE` tokens, μηδέν νέο magic hex/radius. **Secrets sweep** (grep για key/token/password/PEM patterns στο πλήρες diff) → μηδέν committed secret (μόνο prose στα PROGRESS.md entries που περιγράφουν token-lifecycle testing). `npm run type-check` (web) EXIT 0· `npx tsc --noEmit` (mobile) EXIT 0.
> **Νέο εύρημα (και τα δύο ίδιας κλάσης με το ήδη-ανοιχτό `vouchers/page.tsx` item παρακάτω, δεν είναι single-edit auto-fixable — πολυ-function αρχεία, θέλουν το ίδιο recipe με το ήδη-κλεισμένο vouchers/giftcards/loyaltycards fix)**:
>   - `apps/web/src/app/bills/actions.ts` — ολόκληρο το αρχείο (incl. `createBill`/`updateBill`/`markBillPaid`, όλα touched σε αυτό το diff για τα νέα currency πεδία) κάνει ακόμα direct `Bill.create`/`Bill.findByIdAndUpdate`/`Bill.findById`, χωρίς `withRequestTenant`/`currentModel` — σε αντίθεση με τα ήδη-διορθωμένα sibling money modules (items/receipts/expenses/vouchers/giftcards/loyaltycards). Μηδέν επίδραση self-hosted· σε SaaS mode θα διάβαζε/έγραφε πάντα στο DEFAULT tenant DB.
>   - `apps/web/src/app/statements/actions.ts` — ίδιο gap (`Statement.create`/`findById`/`find`/`findByIdAndUpdate`/`findByIdAndDelete` direct, μηδέν tenancy wrap σε ολόκληρο το αρχείο). Αξιοσημείωτο: το νέο `lib/fxAudit.ts`/`reports/fxActions.ts` (μέσα σε αυτό το ίδιο diff) **ήδη** διαβάζει/γράφει Statements μέσω `currentModel(Statement)`/`withRequestTenant` → εσωτερική read/write ασυμμετρία μόλις ενεργοποιηθεί SaaS mode.
>   - Και τα δύο μπήκαν ως νέα items στο queue παρακάτω (P2/M, ίδιο recipe με το ήδη-κλεισμένο `vouchers`/`giftcards`/`loyaltycards` fix: wrap κάθε DB-touching export σε `withRequestTenant(async () => { const X = await currentModel(XModel); ... })`).

> **Έλεγχος διαφοράς**: `git log cdc6a03..HEAD` = 71 commits (κυρίως docs/tests από pharos-daily-dev + saas-core). Οι ουσιαστικοί code-touching: security fix (Settings→Notifications requireAdmin, ήδη DONE στο queue), 2× tenancy-parity fixes (sampleDataActions.ts, Voucher/GiftCard/LoyaltyCard — και τα δύο ήδη DONE), P9 multi-currency (Expenses/Receipts/Subscriptions, 3 slices), P17 barcode-lookup endpoint (server half), i18n el.ts +126 keys, mobile borderRadius→RADIUS token refactor (54 sites). `npm run type-check` (web) EXIT 0· `npx tsc --noEmit` (mobile) EXIT 0· `npx vitest run` (web) → **3613/3613 green (268 files)** πριν τα δύο fixes παρακάτω, ξανα-verified **3613 green** μετά. Ο P17 barcode endpoint ελέγχθηκε explicit για SSRF (host hardcoded στα 3 Open*Facts domains, `code` validated ως GTIN-digits-only πριν μπει σε URL, `encodeURIComponent` επιπλέον) → καθαρό.
> **Νέο εύρημα + fix (live, εκτός του normal diff-review — light standing scan σε binary/encoding ανωμαλίες)**: δύο web αρχεία περιείχαν **raw NUL/control bytes literal μέσα στο source** αντί για escaped `\x00`/`\x1f` sequences → `file` τα ταξινομούσε ως `data` (όχι text), `git diff`/`git show`/GitHub PR view τα δείχνουν σαν **binary diff** (μηδέν ορατότητα σε μελλοντικές αλλαγές, code review τυφλό σε αυτά τα αρχεία), και `grep` (χωρίς `-a`) τα προσπερνάει σιωπηλά (confirmed live: `grep -n "sanitizeSegment" apps/web/src/lib/storagePath.ts` επέστρεφε 0 αποτελέσματα ενώ το symbol υπάρχει). Functionally μηδέν runtime διαφορά (JS χειρίζεται σωστά literal control chars σε regex character classes/string literals), αλλά είναι μόνιμος κίνδυνος για μελλοντικά reviews (ανθρώπινα ή AI) να χάσουν αλλαγές σε αυτά τα αρχεία, και για routines που κάνουν `grep -r` να καταλήξουν σε λάθος "δεν υπάρχει" συμπέρασμα.
>   - `apps/web/src/lib/storagePath.ts:32` — `sanitizeSegment()` regex `[\\/:*?"<>|<NUL>-<0x1F>]` είχε literal NUL+0x1F bytes αντί `\x00`/`\x1f` escapes (προϋπήρχε από το initial commit `fc806db`, εκτός του τρέχοντος review range). **Fixed**: bytes → `\x00`/`\x1f` escape sequences, byte-identical regex semantics. `file` πλέον «Unicode text, UTF-8 text»· `npx vitest run src/lib/storagePath.test.ts` → 15/15 green.
>   - `apps/web/src/app/expenses/ExpensesClient.tsx:31` — `const NO_SPACE = '<NUL>none'` (sentinel value για "χωρίς space filter") είχε raw NUL byte αντί `'\x00none'` escape (εισήχθη 2026-07-10, `6b1de5c4`, επίσης εκτός του τρέχοντος review range — απλά ανακαλύφθηκε τώρα κατά το review του P9 multi-currency commit που άγγιξε το ίδιο αρχείο). **Fixed**: byte-identical runtime string value, τώρα εκφρασμένο ως escape. `npx vitest run src/app/expenses/` → 130/130 green (7 test files, incl. `lib.test.ts`/`actions.crud.test.ts`).
>   - Repo-wide sweep (`apps/**/*.{ts,tsx,js,jsx}`, byte-level NUL scan) μετά το fix → **0 remaining αρχεία** με embedded NUL.
>   - `npm run type-check` EXIT 0 μετά τα δύο fixes· full `npx vitest run` **3613/3613 green** (ίδιο count με πριν, μηδέν regression).
> **el.ts i18n gap**: **6** (όχι πια 126 — ο builder το έκλεισε ήδη στο `2cd33fb`, `en=1277, el=1271`). Πολύ μικρό υπόλοιπο πλέον, δεν αξίζει ξεχωριστό P3 item· θα μαζευτεί στο επόμενο batch αν μεγαλώσει.

## Web Debt Queue — ενεργά items (61η σάρωση 2026-07-30)

### `subscriptions/actions.ts` παρακάμπτει το tenant-scoping (Subscription ήδη αντιμετωπίζεται ως tenant-scoped αλλού)
- Priority: P2
- Size: M
- Area: db
- Files: apps/web/src/app/subscriptions/actions.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα**: `createSubscription`/`updateSubscription`/`toggleSubscriptionActive`/`deleteSubscription`/`discoverUntrackedRecurring`/`trackDiscoveredSubscription` κάνουν direct `Subscription.create`/`findByIdAndUpdate`/`find` (+ `Expense.find` στο discovery), χωρίς `withRequestTenant`/`currentModel`. Ασυμμετρία: το `lib/fxAudit.ts` και το `settings/sampleDataActions.ts` ΗΔΗ διαβάζουν/γράφουν το ίδιο `Subscription` model μέσω `currentModel(Subscription)`.
  - **Γιατί έχει σημασία**: σε SaaS mode το FX-audit panel θα δούλευε per-tenant σωστά, αλλά η κανονική `/subscriptions` σελίδα θα διάβαζε/έγραφε πάντα στο DEFAULT tenant DB — ίδιο internal-asymmetry risk με το statements/fxAudit gap που μόλις έκλεισε. Μηδέν επίδραση self-hosted.
  - **Fix**: ίδιο recipe: `import { Subscription as SubscriptionModel }` + `currentModel`/`withRequestTenant`, wrap κάθε exported function. Το `discoverUntrackedRecurring` διαβάζει ΚΑΙ `Expense` — scope και τα δύο models μέσα στο ίδιο wrap.
  - Επαλήθευση: `grep -c "withRequestTenant\|currentModel" apps/web/src/app/subscriptions/actions.ts` ≥ όσα exported functions κάνουν DB access· npm run type-check exits 0· υπάρχον subscriptions test file παραμένει green.
  - npm run type-check exits 0
- Status: **DONE 2026-08-01** (pharos-daily-dev). Και τα 6 exported actions τυλίχτηκαν σε `withRequestTenant` + `currentModel`· το `discoverUntrackedRecurring` resolve-άρει **και** τα δύο models (Expense + Subscription) μέσα στο ΙΔΙΟ wrap, αλλιώς το exclude set ενός tenant θα φίλτραρε τα expenses άλλου. Νέο `actions.tenant.test.ts` (6 tests, per-tenant fake models tagged ανά tenant ΚΑΙ ανά model, negative control έριξε 3/6). Ο flat `actions.test.ts` πήρε το γνωστό flat tenancy mock (ίδιο με bills/statements). **Παράπλευρο εύρημα, διορθώθηκε μαζί**: το `trackDiscoveredSubscription` δεν είχε καθόλου write guard — το `await assertCanWrite()` του commit `1346b4d` (P31) είχε προσγειωθεί **μετά** το κλείσιμο της συνάρτησης, ως top-level statement (δηλ. έτρεχε μία φορά στο import, και το «Track this» ήταν γραπτό μονοπάτι ανοιχτό σε viewer). Ο `writeGuard.coverage.test.ts` scanner το έχανε γιατί το body της ΤΕΛΕΥΤΑΙΑΣ exported συνάρτησης το έκοβε στο τέλος του αρχείου· τώρα κόβει στο δικό της κλείσιμο (brace matching, με clamp στο επόμενο export) και το negative control επιβεβαίωσε ότι πιάνει ακριβώς αυτό το bug.

### `tasks/actions.ts` παρακάμπτει το tenant-scoping (Task ήδη αντιμετωπίζεται ως tenant-scoped αλλού)
- Priority: P2
- Size: S
- Area: db
- Files: apps/web/src/app/tasks/actions.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα**: `createTask`/`updateTaskStatus`/`deleteTask`/`updateTaskDetails`/`addStep`/`toggleStep`/`deleteStep` κάνουν direct `Task.create`/`findByIdAndUpdate`, χωρίς wrap. Το `items/actions.ts:835` ΗΔΗ καλεί `currentModel(TaskModel)` για το ίδιο model (cross-module «convert to task» flow) — ίδια ασυμμετρία κλάση.
  - **Γιατί έχει σημασία**: σε SaaS mode το task που δημιουργείται από ένα item θα πήγαινε στο σωστό tenant DB, αλλά όλα τα tasks που δημιουργούνται/επεξεργάζονται απευθείας από `/tasks` θα πήγαιναν πάντα στο DEFAULT. Μηδέν επίδραση self-hosted.
  - **Fix**: ίδιο recipe, μικρό αρχείο (7 exports).
  - Επαλήθευση: `grep -c "withRequestTenant\|currentModel" apps/web/src/app/tasks/actions.ts` ≥ 7· npm run type-check exits 0.
  - npm run type-check exits 0
- Status: ✅ DONE 2026-08-02 (pharos-daily-dev) — και τα 7 exports τυλίχτηκαν σε `withRequestTenant` +
  `currentModel(TaskModel)` (grep count **16**, ≥7 όπως ζητούσε το acceptance). Το `assertCanWrite()` έμεινε ΠΡΙΝ
  το wrap (ο `writeGuard.coverage.test.ts` scanner το βλέπει κανονικά), όπως και το blank-step short-circuit του
  `addStep` (μηδέν κόστος tenant resolution σε no-op). **Μαζί κλείστηκε και το read path** (`tasks/page.tsx
  getTasks()`), σκόπιμα εκτός του αρχικού `Files:` — το να μείνει έξω είναι ακριβώς ό,τι γέννησε το ξεχωριστό
  `vouchers/page.tsx` item, οπότε προτιμήθηκε να μη δημιουργηθεί ξανά η ίδια ασυμμετρία. Νέο
  `actions.tenant.test.ts` (7 tests, δύο tenants ταυτόχρονα, tagged create id ώστε λάθος-db read να φαίνεται,
  self-hosted no-tenant path)· ο flat `actions.test.ts` πήρε το γνωστό flat tenancy mock. Verify:
  **negative control** (ένα `currentModel` πίσω σε direct model → 3 από τα 7 νέα tests πέφτουν, μετά restore),
  type-check EXIT 0, full vitest **5485 passed / 344 files** (+7, μηδέν regression), safe Docker rebuild
  (mongo healthy πριν → `build web` → `up -d web`): `/login` 200 με την πρώτη, `/tasks` 307 (auth-gated route
  compiled), container running/not-restarting, build cache pruned. Browser pane `/tasks` → redirect σε
  «Sign in · Pharos», μηδέν console errors.

### `shopping-list/actions.ts` παρακάμπτει το tenant-scoping
- Priority: P2
- Size: S
- Area: db
- Files: apps/web/src/app/shopping-list/actions.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα**: `getListItems`/`addListItem`/`updateListItem`/`toggleListItem`/`deleteListItem`/`clearChecked` κάνουν direct `ShoppingListItem.find`/`create`/κλπ, χωρίς wrap.
  - **Γιατί έχει σημασία**: ίδια κλάση με τα ήδη-κλεισμένα money modules — σε SaaS mode η λίστα ψωνιών ενός tenant θα πήγαινε στο DEFAULT DB αντί στο δικό του. Μηδέν επίδραση self-hosted.
  - **Fix**: ίδιο recipe.
  - Επαλήθευση: `grep -c "withRequestTenant\|currentModel" apps/web/src/app/shopping-list/actions.ts` ≥ 6· npm run type-check exits 0.
  - npm run type-check exits 0
- Status: DONE (fixed 2026-08-03, pharos-daily-dev) — και τα 6 exports (`getListItems`/`addListItem`/`updateListItem`/`toggleListItem`/`deleteListItem`/`clearChecked`) τρέχουν πλέον μέσα σε `withRequestTenant` με `currentModel(ShoppingListItemModel)`. Το `assertCanWrite()` και το blank-name short-circuit του `addListItem` έμειναν ΠΡΙΝ το wrap (ο writeGuard scanner τα βλέπει, και ένα no-op δεν κοστίζει tenant resolution). Το read path καλύπτεται από το ίδιο το `getListItems` (το `page.tsx` απλά το καλεί), όπως και το `/api/v1/shopping-list` (GET/POST καλούν τις ίδιες actions). Επαλήθευση: `grep -c "withRequestTenant\|currentModel"` → **14** (≥6)· **negative control** πρώτα, όχι ισχυρισμός — ένα `currentModel` πίσω σε direct model έριξε **3/7** νέα tests στο create path και **1/7** στο read path, μετά restore. Νέο `actions.tenant.test.ts` (7 tests, tagged seam ανά tenant + tagged rows στο read). `npm run type-check` EXIT 0· full `npx vitest run` **5506 passed / 346 files** (+7 tests, +1 file, μηδέν regression). Safe Docker rebuild: mongo healthy πριν, `/login` 200 με την πρώτη, `/shopping-list` 307 (auth-gated route compiled), RestartCount 0, browser pane → «Sign in · Pharos» χωρίς console errors, build cache pruned.

### `history/actions.ts` παρακάμπτει το tenant-scoping (AI conversation history)
- Priority: P2
- Size: S
- Area: db
- Files: apps/web/src/app/history/actions.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα**: `getConversations`/`deleteConversation`/`clearConversations` κάνουν direct `Conversation.find`/κλπ, χωρίς wrap.
  - **Γιατί έχει σημασία**: το AI command-bar chat history ενός tenant θα ήταν ορατό/διαγράψιμο μόνο μέσω του DEFAULT DB σε SaaS mode (πιθανώς μπερδεύοντας tenants μεταξύ τους ή δείχνοντας άδειο ιστορικό). Μηδέν επίδραση self-hosted.
  - **Fix**: ίδιο recipe, μικρό αρχείο (3 exports).
  - Επαλήθευση: `grep -c "withRequestTenant\|currentModel" apps/web/src/app/history/actions.ts` ≥ 3· npm run type-check exits 0.
  - npm run type-check exits 0
- Status: TODO (flagged 2026-07-30, 61η σάρωση reviewer routine)

### `notifications/actions.ts` παρακάμπτει το tenant-scoping (διαβάζει 6 models, γράφει Notification)
- Priority: P2
- Size: M
- Area: db
- Files: apps/web/src/app/notifications/actions.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα**: `generateNotifications`/`getNotifications`/`markNotificationRead`/`markAllNotificationsRead`/`dismissNotification`/`clearAllNotifications` + ο εσωτερικός scan διαβάζουν `Item`/`Statement`/`Expense`/`Subscription`/`GiftCard`/`Bill` και γράφουν `Notification`, όλα direct import χωρίς wrap.
  - **Γιατί έχει σημασία**: μεγαλύτερο blast radius από τα προηγούμενα (6 models σε ένα function) — σε SaaS mode τα deal/warranty/trial/price-hike alerts ενός tenant θα σαρωνόντουσαν πάντα το DEFAULT tenant's δεδομένα. Μηδέν επίδραση self-hosted.
  - **Fix**: ίδιο recipe· scope και τα 7 models (6 read + Notification write) μέσα στο ίδιο `withRequestTenant` block ανά exported function.
  - Επαλήθευση: `grep -c "withRequestTenant\|currentModel" apps/web/src/app/notifications/actions.ts` ≥ 6· npm run type-check exits 0.
  - npm run type-check exits 0
- Status: **DONE 2026-07-31** (pharos-daily-dev, commit `daeea7e`). Και τα 6 exported actions τυλίχτηκαν σε
  `withRequestTenant` με `currentModel()` μέσα (grep count 16)· το `computeAlerts()` resolve-άρει και τα 6 source
  models από το ambient tenant (μόνος του caller = wrapped body). **Επιπλέον εύρημα εκτός του item**: ο generation
  throttle ήταν module-level scalar (`let lastGen`), δηλαδή ένα bell poll ενός workspace σώπαινε το reconcile ΚΑΘΕ
  άλλου workspace για 10 λεπτά → έγινε per-tenant `Map` (capped στα 500 keys). Το `generateNotifications` κρατά τα
  writes **inline** επίτηδες (ΟΧΙ σε private helper): το `lib/writeGuard.coverage.test.ts` σκανάρει exported action
  bodies για Mongoose writes, οπότε ένας helper θα το έκρυβε από το guard (πιάστηκε από το ίδιο το test, όχι με το μάτι).
  Νέο `actions.tenant.test.ts` (7 tests, per-tenant fake models tagged ανά tenant ΚΑΙ ανά model)· negative control:
  ένα `currentModel` πίσω σε direct model έριξε 4 tests, μετά επαναφορά. Verify: type-check EXIT 0, full vitest
  **5408 passed / 340 files**, Docker rebuild clean (0 restarts, /login 200, /notifications 307), browser χωρίς console errors.

### `settings/actions.ts` — Trash (getTrash/restoreFromTrash/purgeTrashEntry/emptyTrash) παρακάμπτει το tenant-scoping (το κύριο σώμα έκλεισε στο b800fc3, αυτό ξέμεινε)
- Priority: P1
- Size: S
- Area: db
- Files: apps/web/src/app/settings/actions.ts (μόνο TRASH_MODELS + οι 4 Trash exports, γρ. ~1815-1945)
- Depends on: none
- Acceptance:
  - **Το πρόβλημα**: μεγάλο, πολυδιάστατο αρχείο (30+ exports: AI config, ntfy, webhooks, prompts, storage/OneDrive, IMAP, lists, stores, backup/export, budgets). Τα καθαρά `AppConfig`-only exports (AI toggles, defaults, ntfy config) είναι νόμιμα instance-level και ΔΕΝ χρειάζονται tenant-scoping. Αλλά αρκετά exports διαβάζουν/γράφουν per-tenant collections direct: `runAlertChecks` (Item/Receipt/Statement/Expense/Subscription/GiftCard/Bill), `syncToRemote`/backup helpers (Receipt/Statement/Expense), `listStores`/`saveStore`/`deleteStore`/`findDuplicateStores`/`mergeStores` (Store/Receipt/Item), `exportData`/`exportCSV`/`exportInsuranceBundle`/`exportTaxBundle` (Receipt/Item/Statement/Expense).
  - **Γιατί έχει σημασία**: ίδια κλάση — σε SaaS mode ένα tenant's "Export CSV"/"Backup"/"Alerts" θα διάβαζε πάντα το DEFAULT tenant's δεδομένα αντί για τα δικά του. Μηδέν επίδραση self-hosted.
  - **Fix**: ΔΙΑΦΟΡΕΤΙΚΟ από τα προηγούμενα — αυτό το αρχείο χρειάζεται επιλεκτικό wrap (μόνο τα exports που αγγίζουν per-tenant models, ΟΧΙ τα AppConfig-only), οπότε είναι μεγαλύτερο (L) και θέλει προσεκτικό διάβασμα πριν το edit. Καλή αρχή: μια πρώτη περνιά μόνο στα 4 export/backup functions (μικρότερο blast radius, ξεκάθαρα per-tenant data), μετά ξεχωριστό follow-up για `runAlertChecks`/stores.
  - Επαλήθευση: npm run type-check exits 0· υπάρχον settings test files παραμένουν green· κάθε αλλαγμένο export να έχει αντίστοιχο `currentModel` call.
  - npm run type-check exits 0
- Status: **TODO** (narrowed 2026-08-04, 65η σάρωση reviewer routine — το αρχικό ευρύτερο item έκλεισε κατά το μεγαλύτερο μέρος του, βλ. ιστορικό παρακάτω, αλλά η Trash ενότητα ξέμεινε ανοιχτή και σηκώνει Priority σε P1). Ο builder τύλιξε **ΟΛΟΚΛΗΡΟ** το κύριο σώμα στο model boundary αντί ανά export: νέο ιδιωματικό `scoped(Model) = withRequestTenant(() => currentModel(Model))`, 64 call sites σε 9 models (AppConfig/Item/Receipt/Statement/Expense/Store κ.λπ.) — `grep -nE '\b(AppConfig|Item|Receipt|Statement|Expense|Store|GiftCard|Bill|Subscription)\.(find|findOne|findById|findByIdAndUpdate|findByIdAndDelete|create|updateOne|updateMany|deleteOne|deleteMany|aggregate|countDocuments|insertMany)\(' actions.ts` → **0 αποτελέσματα** σε ολόκληρο το κύριο σώμα. Το `lib/appSettings.ts`/`lib/tenancy/request.ts` πήραν μαζί νέο `softRequestTenant()` (never-throws read-only resolver, χρειάστηκε γιατί το `getAppSettings()` cache-άριζε με το AMBIENT tenant, αλλά το `scoped()` ανοίγει/κλείνει context ανά κλήση) + `resolveRequestTenant` έγινε `React.cache()`-memoised per-request. 14 νέα per-concern test files (`actions.<x>.test.ts`) + `actions.tenant.test.ts` (108 γραμμές, negative control). **ΝΕΟ ΕΥΡΗΜΑ — η Trash ενότητα ΔΕΝ καλύφθηκε** (reviewer routine, 65η σάρωση, live στο τρέχον `actions.ts`): `TRASH_MODELS` (γρ.1828, `Record<TrashType, typeof Item>`, 10 raw model imports Item/Receipt/Expense/Subscription/Voucher/GiftCard/LoyaltyCard/Bill/Goal/Task) τροφοδοτεί `getTrash()` (γρ.1858, `Model.find(...)` direct), `restoreFromTrash()` (γρ.1878, `Model.updateOne(...)` direct), `purgeTrashEntry()` (γρ.1897, `Model.findById`/`Model.deleteOne` direct — οι cross-reference cleanup κλήσεις ΜΕΣΑ στην ίδια συνάρτηση ΕΙΝΑΙ ήδη `scoped()`, μόνο η ίδια η trashed-εγγραφή γλιτώνει), `emptyTrash()` (γρ.1932, ίδιο `Model.find` loop). Σε SaaS mode: (α) ένα workspace's Trash tab θα έδειχνε πάντα τα DEFAULT tenant's soft-deleted εγγραφές (cross-tenant read leak, 10 record types), (β) Restore/Permanent-delete/Empty-Trash θα ενεργούσαν στο DEFAULT tenant's DB, όχι στου καλούντος — δηλαδή ένα «Empty Trash» click θα διέγραφε **μόνιμα ξένα δεδομένα** ενώ ο ίδιος ο tenant θα έβλεπε την τρέχουσα λίστα του αμετάβλητη (φαινομενικά no-op για αυτόν). Το ήδη-υπάρχον `actions.trash.test.ts` (νέο +12 γραμμές σε αυτό το ίδιο commit) δοκιμάζει auth-gating/edge-cases αλλά **καμία tenant-isolation assertion** — δεν θα το είχε πιάσει. Ίδιο recipe, μηχανικό fix (το `scoped()` helper υπάρχει ήδη στο αρχείο): `TRASH_MODELS` type → `Record<TrashType, Model<unknown>>` με raw imports, μετά σε κάθε από τις 4 συναρτήσεις `const Model = await scoped(TRASH_MODELS[type])` αντί direct assignment (`getTrash`/`emptyTrash` χρειάζονται resolve ΜΕΣΑ στο loop, ανά type, όχι ένα static map). Ελαφρώς πιο ευαίσθητο από τα προηγούμενα items γιατί αγγίζει **irreversible delete** paths (empty/purge) — προτείνεται builder να διαβάσει τις 4 συναρτήσεις πλήρως πριν το edit, όχι mechanical sed. Priority ανέβηκε σε **P1** λόγω του destructive-delete σκέλους (τα υπόλοιπα standing items είναι όλα read/write leak, όχι μόνιμη διαγραφή ξένων δεδομένων). Files αυτού του υπολειπόμενου scope: μόνο οι 4 Trash-related exports + `TRASH_MODELS` (γρ.1815-1945 περίπου)· το υπόλοιπο αρχείο θεωρείται DONE.

### `bills/actions.ts` παρακάμπτει το tenant-scoping (ίδια κλάση με τα ήδη-κλεισμένα vouchers/giftcards/loyaltycards)
- Priority: P2
- Size: M
- Area: db
- Files: apps/web/src/app/bills/actions.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα**: το P9 multi-currency commit (`1ce991f`, αυτό το review range) πρόσθεσε νέα currency πεδία σε `createBill`/`updateBill`/`markBillPaid` κλπ, αλλά ολόκληρο το αρχείο κάνει ακόμα direct `Bill.create(...)`/`Bill.findByIdAndUpdate(...)`/`Bill.findById(...)` — δεν υπάρχει κανένα `withRequestTenant`/`currentModel` import ή χρήση σε αυτό το αρχείο.
  - **Γιατί έχει σημασία**: σε SaaS mode (`SAAS_MODE=on`) όλα τα Bills reads/writes θα πήγαιναν πάντα στο DEFAULT tenant DB, ανεξάρτητα από το ποιος tenant είναι logged in — ίδιο risk class με τα ήδη-διορθωμένα `items/actions.ts`/`receipts/actions.ts`/`expenses/actions.ts`/`vouchers`/`giftcardActions.ts`/`loyaltyActions.ts`. Μηδέν επίδραση σε self-hosted mode (σημερινό mode του Αχιλλέα) — `currentModel()`/`withRequestTenant()` no-op στο ίδιο DEFAULT connection.
  - **Fix**: mirror το recipe των ήδη-κλεισμένων siblings: import `withRequestTenant` (`@/lib/tenancy/request`) + `currentModel` (`@/lib/tenancy/connection`)· rename το `Bill` import σε `BillModel`· τύλιξε κάθε exported action function σε `return withRequestTenant(async () => { const Bill = await currentModel(BillModel); ... });`. Πρόσεξε το `markBillPaid` που καλεί `addExpense` (cross-module) — έλεγξε αν χρειάζεται να περάσει tenant context ή αν το `addExpense` ήδη κάνει το δικό του wrap.
  - Επαλήθευση: `grep -c "withRequestTenant\|currentModel" apps/web/src/app/bills/actions.ts` ≥ όσα exported functions κάνουν DB access· npm run type-check exits 0· `apps/web/src/app/bills/actions.test.ts` παραμένει green.
  - npm run type-check exits 0
- Status: ✅ DONE 2026-07-28 (pharos-daily-dev) — και τα 6 exported actions (createBill/updateBill/setBillArchived/
  deleteBill/markBillPaid/markBillUnpaid) τυλίχτηκαν σε `withRequestTenant` με `const Bill = await currentModel(BillModel)`
  μέσα (grep count **15**). Το `assertCanWrite()` + το Zod parse μένουν ΕΞΩ από το wrap (ίδιο με τα sibling vouchers/
  expenses actions: authz + validation δεν χρειάζονται tenant context, και ένα invalid form δεν πρέπει να πληρώνει
  tenant resolution). Το `markBillPaid` → `addExpense` **δεν** χρειάστηκε threading: το `addExpense` ανοίγει το δικό του
  `withRequestTenant`, που re-resolve-άρει στο ΙΔΙΟ host-derived context (re-entrant), οπότε το logged expense πέφτει
  στο ίδιο tenant DB· τεκμηριώθηκε inline ώστε να μην ξαναελεγχθεί. **Επιπλέον, εκτός του αρχικού `Files:`** (αλλιώς
  θα αναπαραγόταν ακριβώς η read/write ασυμμετρία του vouchers item παρακάτω): το `bills/page.tsx` `getData()` τυλίχτηκε
  κι αυτό (grep 4). **Νέο `bills/actions.tenant.test.ts` (+5 tests, πρώτο tenant-routing test σε επίπεδο action)**:
  per-tenant fake model που καταγράφει σε ποιο DB πήγε κάθε write → πιάνει regression αν κάποιος ξαναβάλει direct
  `Bill.create` (με το `@/models/Bill` mocked ως `{}`, ο παλιός κώδικας σκάει). Verify: type-check EXIT 0, full vitest
  **5216 passed / 329 files** (μηδέν regression), Docker rebuild clean (0 restarts, /login 200, /bills 307), browser
  `/login` renders χωρίς console errors.

### `statements/actions.ts` παρακάμπτει το tenant-scoping — και δημιουργεί read/write ασυμμετρία με το νέο fxAudit
- Priority: P2
- Size: M
- Area: db
- Files: apps/web/src/app/statements/actions.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα**: ολόκληρο το αρχείο (import, upload, rescan, installment-linking, transaction editing — δεκάδες exported functions) κάνει direct `Statement.find()`/`findById()`/`create()`/`findByIdAndUpdate()`/`findByIdAndDelete()`, χωρίς κανένα `withRequestTenant`/`currentModel`.
  - **Γιατί έχει σημασία**: το ίδιο διάστημα προστέθηκε `lib/fxAudit.ts`/`reports/fxActions.ts` (P9 FX-audit feature) που **ήδη** διαβάζει/γράφει Statements μέσω `currentModel(Statement)` σωστά. Σε SaaS mode: το FX-audit panel θα έβλεπε/διόρθωνε το σωστό tenant's statements, αλλά το ίδιο statement ανοιγμένο από το κανονικό `/statements` UI θα διάβαζε/έγραφε στο DEFAULT tenant DB — εσωτερική ασυμμετρία μέσα στο ίδιο feature set. Μηδέν επίδραση self-hosted.
  - **Fix**: ίδιο recipe, μεγαλύτερο αρχείο (πολλαπλές exported functions: import/upload/rescan/link/unlink/delete/setTransactionInstallment κλπ) — wrap το καθένα ξεχωριστά σε `withRequestTenant(async () => { const Statement = await currentModel(StatementModel); ... })`. Δες `lib/fxAudit.ts`/`reports/fxActions.ts` (ίδιο review range) ή `items/actions.ts` σαν ήδη-σωστό reference pattern για αρχείο με πολλά exports.
  - Επαλήθευση: `grep -c "withRequestTenant\|currentModel" apps/web/src/app/statements/actions.ts` ≥ όσα exported functions κάνουν DB access· npm run type-check exits 0· `apps/web/src/app/statements/actions.crud.test.ts` (και τα υπόλοιπα statements test files) παραμένουν green.
  - npm run type-check exits 0
- Status: **DONE 2026-07-30** (pharos-daily-dev). Και τα **14 exported** DB-touching functions τυλίχτηκαν
  ξεχωριστά σε `withRequestTenant` με `currentModel()` μέσα (Statement + **Card** + **Receipt**, γιατί το
  `findOrCreateCard` έγραφε κάρτες και το `getReconciliation` διάβαζε αποδείξεις από το default db)· οι 3 internal
  signature mutators (`addItemBySignature`/`removeItemBySignature`/`clearLinkBySignature`) + το `findOrCreateCard`
  resolve-άρουν μόνα τους από το ambient tenant (καλούνται πάντα μέσα από wrapped body). Οι δύο no-AI draft paths του
  `importStatementPdf` ενοποιήθηκαν σε ένα `saveDraft()` helper. Νέο `actions.tenant.test.ts` (8 tests, per-tenant fake
  model set με tagged op-log ανά μοντέλο) + tenancy seam mocks στα 3 υπάρχοντα statements test files. **Negative
  control**: ένα `currentModel` πίσω σε direct `StatementModel` έριξε 3 tests (τα models mocked ως `{modelName}`),
  μετά επαναφορά. Verify: type-check EXIT 0, full vitest **5352 passed / 336 files**, Docker rebuild clean
  (0 restarts, /login 200, /statements 307), browser `/login` renders χωρίς console errors.

### `vouchers/page.tsx` read path παρακάμπτει το tenant-scoping που μόλις μπήκε στα sibling actions (ίδιας κλάσης gap, ήδη προαναγγελθέν follow-up)
- Priority: P2
- Size: S
- Area: db
- Files: apps/web/src/app/vouchers/page.tsx
- Depends on: none
- Acceptance:
  - **Το πρόβλημα**: το commit `315cd26` (58η→59η διάστημα) τύλιξε τα 3 sibling action αρχεία (`vouchers/actions.ts`, `giftcardActions.ts`, `loyaltyActions.ts`) σε `withRequestTenant`/`currentModel`, αλλά **σκόπιμα άφησε έξω** το `vouchers/page.tsx` (το item όριζε `Files:` = μόνο τα 3 action αρχεία). Το `page.tsx` κάνει ΑΚΟΜΑ direct import (`import { Voucher } from '@/models/Voucher'`, ίδιο για `GiftCard`/`LoyaltyCard`) και `Voucher.find()`/`GiftCard.find()`/`LoyaltyCard.find()` απευθείας στη `getData()`, χωρίς `withRequestTenant`/`currentModel` — σε αντίθεση με τα sibling `receipts/page.tsx`/`expenses/page.tsx` που ήδη κάνουν `return withRequestTenant(async () => { const X = await currentModel(XModel); ... })` στο δικό τους `getData()`.
  - **Γιατί έχει σημασία**: σε SaaS multi-tenant mode (`SAAS_MODE=on`) το `/vouchers` θα **έγραφε** σωστά per-tenant (μετά το `315cd26`) αλλά θα **διάβαζε πάντα από το DEFAULT tenant DB** — ασύμμετρο read/write, η σελίδα δεν θα έδειχνε ποτέ τα δεδομένα που μόλις δημιουργήθηκαν σε άλλο tenant. Σε self-hosted (SAAS_MODE off, το mode του Αχιλλέα σήμερα) **μηδέν συμπεριφορική αλλαγή** — `currentModel()`/`withRequestTenant()` no-op στο ίδιο DEFAULT connection, άρα dead-until-SaaS ίδια κλάση με τα ήδη-κλεισμένα siblings.
  - **Fix**: mirror το ίδιο recipe με `receipts/page.tsx`/`expenses/page.tsx`: import `withRequestTenant` (`@/lib/tenancy/request`) + `currentModel` (`@/lib/tenancy/connection`)· rename τα 3 model imports σε `VoucherModel`/`GiftCardModel`/`LoyaltyCardModel`· τύλιξε το σώμα του `getData()` σε `return withRequestTenant(async () => { await connectDB(); const Voucher = await currentModel(VoucherModel); ... });`.
  - Επαλήθευση: `grep -c "withRequestTenant\|currentModel" apps/web/src/app/vouchers/page.tsx` ≥ 4 (1 wrap + 3 currentModel calls)· npm run type-check exits 0· υπάρχον vouchers/giftcards/loyalty tests παραμένουν green.
  - npm run type-check exits 0
- Status: ✅ DONE 2026-07-28 (pharos-daily-dev) — `getData()` τυλίχτηκε σε `withRequestTenant`, τα 3 model imports έγιναν
  `VoucherModel`/`GiftCardModel`/`LoyaltyCardModel` και τα 3 `currentModel()` calls τρέχουν σε ένα `Promise.all`
  (grep count **6**, ≥4 όπως ζητούσε το acceptance). Verify: type-check EXIT 0, vouchers/giftcards tests green
  (42 tests), full vitest 5216 passed, `/vouchers` 307 μετά από clean Docker rebuild.

## Σύνοψη audit (2026-07-24 58η σάρωση· type-check EXIT 0· CONFIRMATION run, μηδέν νέο P1/P2 εύρημα· 4 items ΕΚΛΕΙΣΑΝ από την 57η [rate-limit + 3× guardless SaaS routes + getTenantConnection decision-flag, όλα ήδη marked DONE στη θέση τους]· 3 auto-buildable items παραμένουν ανοιχτά αμετάβλητα· el.ts gap 126 σταθερό· ~65 commits ελέγχθηκαν, νέος P12/P32/P20 mobile-parity v1 κώδικας exemplary)

> **~65 commits από τον προηγ. marker `db9af7c`** (`db9af7c..HEAD`, εκτός test/docs/content-only): η κύρια νέα επιφάνεια είναι **3 νέα v1 mobile-parity resources** — `api/v1/goals`+`goals/[id]` (P12 savings/financial goals), `api/v1/giftcards`+`giftcards/[id]` (P32 store-credit tracker), `api/v1/loyaltycards`+`loyaltycards/[id]` (P20 loyalty-card wallet) — + `api/v1/expenses` += `taxDeductible`/`taxCategory` (P8) + `api/v1/notifications` GET += `currency` (mobile body-humanization prep). Παράλληλα ο ίδιος ο builder (saas-core routine, increment 84-85) κατανάλωσε **όλα τα 4 items** που άνοιξε η 57η σάρωση: SaaS auth/mfa rate-limit (P1), τα 3 guardless SaaS routes (P2/S ×3), και το standing `getTenantConnection` readyState decision-flag (P3, βγήκε από το `## Needs Achilleas` — ο builder αποφάσισε μόνος του reuse-μόνο-σε-connected/connecting, σωστή+συντηρητική επιλογή, δες verify παρακάτω).
> **type-check:** `cd apps/web && npm run type-check` → **EXIT 0**.
> **Νέος κώδικας audited, exemplary, μηδέν νέο debt:**
> - **`api/v1/goals`+`goals/[id]`, `api/v1/giftcards`+`giftcards/[id]`, `api/v1/loyaltycards`+`loyaltycards/[id]`** → **exemplary, ίδιο mold με τα ήδη-established Bills(P28)/Expenses resources**: `withAuth` wrapping, `readBody`/`strField`/`numField`/`isObjectId` shared helpers (μηδέν raw `req.json()`), `trim()` single-source-of-truth ανά resource (server-computed derived values `current`/`remaining`/`pct`/`balance`/`spentPct`/`daysLeft` — ο mobile client δεν ξαναϋπολογίζει τίποτα), soft-delete + `updatedAt` index στο μοντέλο, `addContribution`/`addUse` + `remove*Id` mutually-exclusive combined-PATCH pattern (mirror του ήδη-shipped GiftCard recipe). Μηδέν `: any`/`as any`/`@ts-ignore`. Models (`Goal`/`GiftCard`/`LoyaltyCard`) index-consistent (`archived`, relevant date field, `updatedAt`).
> - **`getTenantConnection` fix (commit `318a1ef`) → verified correct.** `existing.readyState !== 99` (δεχόταν disconnected(0)/disconnecting(3) ως «ok reuse») → `existing.readyState === 1 || existing.readyState === 2` (μόνο connected/connecting). Ταιριάζει πλέον με το ίδιο το σχόλιο του κώδικα, +test coverage προστέθηκε. Αυτό ήταν standing `## Needs Achilleas` decision-flag για 10+ σαρώσεις (37η→57η) — ο builder δεν χρειάστηκε τελικά ρητή απόφαση του Αχιλλέα, το tightening ήταν το προφανώς-σωστό fix μόλις το `tenantDb()` απέκτησε πραγματικούς callers.
> - **3× guardless SaaS routes (commit `6f3de54`) → verified.** `invites/accept`, `audit`, `workspace/erasure/purge` τυλίχτηκαν σε top-level try/catch (`grep -c 'try {'` = 2/1/1 αντίστοιχα, το invites/accept κράτησε το προϋπάρχον nested create-race try/catch + το νέο top-level). Gate ladders/projections/cursors αμετάβλητα.
> - **SaaS rate-limit (commit `3206fa3`) → verified.** `clientIp()` extracted σε shared `lib/apiAuth.ts` (dedup, το v1 login route το εισάγει πλέον αντί local copy)· `saas/auth/login` = `rateLimit(saas-login:<ip>)`· `saas/auth/mfa` = `rateLimit(saas-mfa:<accountId>)` (account-keyed, όχι IP, όπως ζητήθηκε — σωστό ενάντια σε distributed guessing). Config-gated off by default, μηδέν impact στο self-hosted single-user mode.
> **Confirmed ΑΚΟΜΑ ανοιχτά, live-verified, μηδέν αλλαγή:** Settings→Notifications requireAdmin gap (P1/S, live: ίδια 8 exports χωρίς `requireAdmin`, `SettingsClient.tsx:102` `notifications` tab ΑΚΟΜΑ χωρίς `adminOnly` ενώ το `users` tab στη γρ.103 το έχει)· Voucher/GiftCard/LoyaltyCard tenancy-parity (P2/M, `grep -c "withRequestTenant\|currentModel"` = 0/0/0 και στα τρία — σημείωση: το νέο LoyaltyCard/GiftCard **v1 API** code έχει το ίδιο μηδέν-tenancy pattern, αλλά αυτό είναι συνεπές με ΟΛΟΚΛΗΡΟ το v1 surface [59 routes, μηδέν tenancy πουθενά — v1 = single-user self-hosted mobile API, όχι SaaS data path], άρα ΔΕΝ είναι νέο εύρημα, το ανοιχτό item αφορά αποκλειστικά τα 3 web server-action αρχεία)· sampleDataActions.ts tenancy-parity (P2/S, ίδιο = 0).
> **el.ts i18n gap:** **126** (σταθερό, node-verified `en=1271, el=1145`) — μηδέν αλλαγή σε `en.ts`/`el.ts` σε αυτό το διάστημα (τα νέα goals/giftcards/loyaltycards items είναι mobile-only, μηδέν νέα web UI string). Παραμένει P3/M.
> **Ουρά μετά το run:** **3 auto-buildable items** — **P1/S** (Notifications requireAdmin, στην κορυφή) + **P2/M** (Voucher/GiftCard/LoyaltyCard tenancy) + **P2/S** (sampleDataActions.ts tenancy) + 1 **P3/M** i18n gap (αμετάβλητο, 126). **`## Needs Achilleas` άδειο** από decision-flags (το getTenantConnection ήταν το τελευταίο standing item εκεί, τώρα DONE).

## Σύνοψη audit (2026-07-22 57η σάρωση· type-check EXIT 0· 1 νέο P1 εύρημα [SaaS login + MFA-verify χωρίς rate-limit — brute-force στο δεύτερο παράγοντα]· και τα 2 ενεργά auto-buildable items της 55ης confirmed ΑΚΟΜΑ ανοιχτά, αμετάβλητα· el.ts i18n gap 110→126· 61 commits ελέγχθηκαν, νέος MFA+Bills κώδικας exemplary πλην του rate-limit gap)

> **61 commits από τον προηγ. marker `88e5d58`** (`88e5d58..HEAD`, εκτός test/docs-only): η κύρια νέα επιφάνεια είναι το **login-flow wiring του MFA** (increment 82-83 — `feat(saas): MFA login-flow wiring`, `feat(saas): MFA enrollment UI panel`, `fix(saas): require password re-auth on MFA re-enrollment when already active`) πάνω στο TOTP+recovery-code scaffold της 56ης, + **P28 Bills v1 API** (`api/v1/bills` + `api/v1/bills/[id]`, νέα mobile parity) + **P7 subscriptions auto-discover v1** (`api/v1/subscriptions` GET += `suggestions[]`) + **P21 mobile document vault** (v1 items attachments) + ένα σωρός δοκιμών (`*.actions.test.ts` για bills/notifications/setup/shopping-list/tasks/giftcard — 8 νέα test αρχεία, μηδέν production-code αλλαγή).
> **type-check:** `cd apps/web && npm run type-check` → **EXIT 0**.
> **Νέος κώδικας audited:**
> - **`lib/tenancy/totp.ts`/`recoveryCodes.ts`/`mfaStore.ts`** (RFC 6238 core + storage layer, ήδη υπήρχαν από την 56η, re-reviewed γιατί τώρα ενεργά wired) → **exemplary**. `verifyTotpCode` χρησιμοποιεί `timingSafeEqual` ανά candidate offset (σωστό, timing-safe)· RFC 6238 Appendix B test vectors, όχι μόνο self-consistency· recovery codes scrypt-hashed (ίδιο KDF με passwords)· secret at-rest AES-256-GCM (`secretCrypto`, ίδιο idiom με το BYO AI key)· two-step enroll (pending→confirmed) ώστε μισοτελειωμένο setup να μην ενεργοποιεί ποτέ σιωπηλά MFA· ο re-auth gap που η ίδια η 55η/56η reviewer είχε flag-άρει (`mfaEnrollRequiresReauth`) **ΕΚΛΕΙΣΕ** (commit `df676f8`, επιβεβαιώθηκε live στο `account/mfa/route.ts:63-70`).
> - **`lib/tenancy/accountSession.ts`** (νέο pending-MFA cookie, `MFA_PENDING_COOKIE`) → **exemplary**. Ξεχωριστό cookie από το πραγματικό session (`pharos_account`), signed JWT με distinct `typ:'mfa_pending'` claim (ώστε να ΜΗΝ γίνεται δεκτό ποτέ από `verifyAccountSession` ακόμα κι αν κάποιο route προσπαθήσει να το διαβάσει λάθος), 5-min TTL (env-configurable, clamped 1-60min), `httpOnly`+`sameSite:lax`.
> - **`api/v1/bills`+`bills/[id]`** → **exemplary**. `withAuth` wrapping (κεντρικό try/catch+shape), `readBody`/`strField`/`numField`/`enumField` (πλήρης adoption των shared helpers, όχι raw `req.json()`), `isObjectId` guard, soft-delete + `updatedAt` index-consistent με τα υπόλοιπα 7 synced resources, `trim()` single-source-of-truth pattern ίδιο με τα άλλα list endpoints.
> - **`api/v1/subscriptions` GET += `suggestions[]`** → καθαρό, skip στα incremental (`updatedSince`) polls· το υποκείμενο `Expense.find()` χωρίς limit είναι **ίδιο pattern με το ήδη-υπάρχον web `discoverUntrackedRecurring()`** (`subscriptions/actions.ts:133`, προϋπήρχε) — όχι νέο ρίσκο, ίδιας κλάσης με το ήδη-accepted «Δεν είναι debt» `Statement.find()` item παρακάτω· δεν ανοίγω ξεχωριστό item.
> - **`api/v1/items/[id]`** (attachments στο detail shape, P21) → καθαρό, mirrors το ήδη-tenant-safe items pattern.
> **1 νέο P1 εύρημα (η μόνη ουσιαστική έλλειψη σε αυτό το ολόκληρο MFA rollout):** το **`lib/apiRateLimit.ts`/`rateLimit()`** μηχανισμό — ήδη implemented, config-gated (off by default), ήδη wired στο `POST /api/v1/auth/login` (48η σάρωση, per-IP key) — **ΔΕΝ** καλείται πουθενά στα `/api/saas/auth/*` routes. Αυτό ήταν ήδη ένα standing «Needs Achilleas» observational note για πολλές σαρώσεις (login brute-force, framed ως πιθανό reverse-proxy/Cloudflare product decision), αλλά το **νέο `POST /api/saas/auth/mfa`** (δεύτερος παράγοντας) αλλάζει τα δεδομένα: brute-forcing ένα 6-ψήφιο TOTP code (ή ένα από τα 10 recovery codes) ΕΙΝΑΙ πρακτικά εφικτό χωρίς throttling, και αφού ένας attacker που ήδη ξέρει/έμαθε το password μπορεί μόνος του να φτάσει στο βήμα 2 (η pending-MFA cookie είναι απλά το αποτέλεσμα ενός σωστού password), η απουσία rate-limit εδώ **ακυρώνει ολόκληρη την αξία του δεύτερου παράγοντα**, όχι απλά επιβραδύνει ένα password guess. Άνοιξα νέο item παρακάτω (P1/S, μηχανικό mirror του ήδη-shipped+ήδη-accepted pattern, config-gated/μηδέν ρίσκο για το σημερινό self-hosted single-user mode) αντί να το αφήσω σαν ασαφές standing note.
> **Confirmed ΑΚΟΜΑ ανοιχτά, live-verified, μηδέν αλλαγή στο ίδιο το gap:** Settings→Notifications requireAdmin gap (P1/S, live: ίδια 8 exports, γρ.339-446)· Voucher/GiftCard/LoyaltyCard tenancy-parity (P2/M, `grep -c "withRequestTenant\|currentModel"` = 0/0/0 και στα τρία)· sampleDataActions.ts tenancy-parity (P2/S, ίδιο = 0)· `invites/accept` guardless write (P2/S, 126 γραμμές, αμετάβλητο)· `audit/route.ts` guardless read (P2/S, 103 γραμμές, αμετάβλητο)· `workspace/erasure/purge` guardless cron (P2/S, 47 γραμμές, αμετάβλητο)· `getTenantConnection` readyState guard decision-flag (P3/S, `## Needs Achilleas`, αμετάβλητο).
> **el.ts i18n gap:** 110→**126** (+16, node-verified: `en=1271, el=1145`). Το χάσμα συνεχίζει να μεγαλώνει σταθερά (P28 Bills + P7 discover-suggestions + νέα SaaS MFA UI strings). Παραμένει P3/M, δεν ξαναγράφω την πλήρη λίστα κλειδιών εδώ (θα φούσκωνε το αρχείο άσκοπα)· το επόμενο dedicated μεταφραστικό pass πρέπει να ξανατρέξει το ίδιο node one-liner για τη φρέσκια λίστα.
> **Ουρά μετά το run:** 1 νέο auto-buildable **P1/S** (SaaS auth + MFA-verify rate-limit, στην κορυφή) + το ήδη-ανοιχτό **P1/S** (Notifications requireAdmin) + **P2/M** (Voucher/GiftCard/LoyaltyCard tenancy) + **P2/S** sampleDataActions.ts + 3× **P2/S** SaaS error-handling holdouts + 1 **P3/M** i18n gap (μεγαλύτερο πλέον, 126) + 1 **P3/S** decision-flag στο `## Needs Achilleas`.

---

## Web Debt Queue — ενεργά items (57η σάρωση 2026-07-22)

> Σύνοψη: 1 νέο **P1** εύρημα — το ήδη-shipped, config-gated `rateLimit()` helper (`lib/apiAuth.ts`, ήδη wired στο `POST /api/v1/auth/login`) δεν καλείται πουθενά στα δύο SaaS account-auth routes, και το ένα από τα δύο είναι το ολοκαίνουριο MFA-verify βήμα — η απουσία throttling εκεί συγκεκριμένα ακυρώνει το ίδιο το νόημα του δεύτερου παράγοντα. Μηχανικό fix, mirror του ήδη-established+ήδη-accepted pattern, μηδέν συμπεριφορική αλλαγή για το σημερινό self-hosted single-user mode (config-gated off by default).

### SaaS `auth/login` + `auth/mfa` (verify) — δεν χρησιμοποιούν το ήδη-υπάρχον `rateLimit()` helper, MFA δεύτερος παράγοντας brute-forceable χωρίς throttling
- Priority: P1
- Size: S
- Area: api
- Files: apps/web/src/app/api/saas/auth/login/route.ts, apps/web/src/app/api/saas/auth/mfa/route.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα:** `lib/apiAuth.ts` εξάγει ήδη ένα δοκιμασμένο, config-gated (`API_RATE_LIMIT`/`API_RATE_WINDOW_MS`, off by default) `rateLimit(key): NextResponse|null` helper, wired από το `POST /api/v1/auth/login` (`login:<clientIp>` key, 48η σάρωση/2026-07-05). Τα δύο SaaS account-auth routes — `POST /api/saas/auth/login` (password check) και το ολοκαίνουριο **`POST /api/saas/auth/mfa`** (TOTP/recovery-code verify, increment 83) — δεν καλούν το helper πουθενά (`grep -rn "rateLimit" apps/web/src/app/api/saas/` = 0 hits).
  - **Γιατί έχει ιδιαίτερη σημασία ΤΩΡΑ (πέρα από το γνωστό standing login-brute-force note):** το `POST /api/saas/auth/mfa` είναι το δεύτερο βήμα ενός login flow — φτάνει κανείς εκεί με μια `pharos_account_mfa_pending` cookie που η `POST /api/saas/auth/login` εκδίδει μόλις το password είναι σωστό (`accountSession.ts:144-148`, `login/route.ts:41-44`). Δηλαδή ένας επιτιθέμενος που ήδη ξέρει/έμαθε (leaked/reused) το password ενός λογαριασμού μπορεί ο ίδιος να παράξει την pending cookie και μετά να δοκιμάσει **απεριόριστα 6-ψήφια TOTP codes** (1 στα ~1,000,000 ανά προσπάθεια, ±1 step window = 3 έγκυρα ταυτόχρονα) ή ένα από τα **10 recovery codes** (8 χαρακτήρες, look-alike-free alphabet, αλλά και πάλι πεπερασμένο keyspace) χωρίς κανένα throttle — μόνο ο 5-λεπτος TTL του pending cookie (`MFA_PENDING_MINUTES`) το περιορίζει, και μπορεί να ξαναρχίσει το login για νέο cookie απεριόριστες φορές. Χωρίς rate-limit, η ύπαρξη MFA δεν προσθέτει ουσιαστική ασφάλεια πάνω από ένα leaked password.
  - **Fix:** import `rateLimit` από `@/lib/apiAuth` και σε κάθε route, πριν από οποιαδήποτε DB δουλειά:
    - `auth/login/route.ts`: `rateLimit(\`saas-login:${clientIp(req)}\`)` (χρειάζεται ένα μικρό local `clientIp()` helper, ίδιο 5-γραμμο implementation με το `api/v1/auth/login/route.ts:clientIp`, ή extract-άρισέ το σε shared spot αν προτιμάς — προαιρετικό dedup, όχι blocking).
    - `auth/mfa/route.ts` (POST): key **ανά account id, όχι ανά IP** (`\`saas-mfa:${accountId}\``, από το ήδη-verified `getMfaPendingAccountId()`) — το account id είναι ο πραγματικός σπάνιος πόρος που μπαίνει σε brute force, IP-keying θα άφηνε ανοιχτό distributed guessing από πολλές IPs στον ίδιο λογαριασμό.
    - Over-limit → επέστρεψε το `NextResponse` που ήδη γυρνά το `rateLimit()` (429 + `Retry-After`/`X-RateLimit-*` headers, ίδιο shape με το v1 route) πριν από `saasGuard`/`saasAuthGate`/DB.
  - Μηδέν αλλαγή σε behavior/response shape κάτω από το limit (config-gated off by default, ίδιο με το v1 route) — το self-hosted single-user Pharos του Αχιλλέα δεν αγγίζεται καθόλου (SAAS_MODE off). Μόνο σε SaaS deployment με `API_RATE_LIMIT` set αλλάζει κάτι.
  - Επαλήθευση: `grep -rn "rateLimit" apps/web/src/app/api/saas/auth/` → ≥2 hits (login + mfa)· υπάρχον `apiRateLimit.test.ts` παραμένει green (μηδέν αλλαγή στο pure helper)· npm run type-check exits 0.
  - npm run type-check exits 0
- Status: DONE (fixed 2026-07-24, saas-core routine, increment 84) — `lib/apiAuth.ts` απέκτησε exported `clientIp()` (extracted από το v1 login route, dedup όπως πρότεινε το item, το v1 route τώρα το εισάγει αντί local copy). `saas/auth/login/route.ts`: `rateLimit(\`saas-login:${clientIp(req)}\`)` ως πρώτη γραμμή μέσα στο `saasGuard` closure, πριν το `saasAuthGate()`/DB. `saas/auth/mfa/route.ts`: `rateLimit(\`saas-mfa:${accountId}\`)` αμέσως μετά το `getMfaPendingAccountId()` (account-id keyed όπως ζητήθηκε, όχι IP), πριν το `connectDB()`/`verifyMfaLogin`. Over-limit path επιστρέφει ακριβώς το `NextResponse` που ήδη φτιάχνει το `rateLimit()` helper (429 + `Retry-After`/`X-RateLimit-*`), μηδέν custom shape. Verified: `grep -rn "rateLimit" apps/web/src/app/api/saas/auth/` → 2 hits (login+mfa)· `npm run type-check` EXIT 0· full `npx vitest run` → **2903/2903 green** (223 files, incl. `apiRateLimit.test.ts` αμετάβλητο). Config-gated off by default (`API_RATE_LIMIT` unset) — self-hosted single-user Pharos ανεπηρέαστο, `SAAS_MODE` off ούτως ή άλλως. Docker: δεν έγινε rebuild (καμία αλλαγή σε runtime wiring/env/dependency, ο live container του Achilleas δεν έχει SAAS_MODE set). Browser-verify: skipped (backend-only route change, μηδέν UI, live container 404άρει το SaaS segment ούτως ή άλλως).

---

## Σύνοψη audit (2026-07-20 56η σάρωση· type-check EXIT 0· CONFIRMATION run — μηδέν νέο P1/P2 εύρημα· και τα 6 ενεργά auto-buildable items confirmed ΑΚΟΜΑ ανοιχτά, αμετάβλητα· el.ts i18n gap 84→110 [+26, από 4 νέα self-hosted features]· 26 commits/71 αρχεία ελέγχθηκαν, φρέσκος κώδικας exemplary)

> **26 commits από τον προηγ. marker `83f392f`** (`83f392f..HEAD`, εκτός test-only): 4 νέα self-hosted features — P3 Month-in-Review narrative digest (`lib/monthReview.ts`), P11 IMAP email-in auto-import (`lib/imapConfig.ts`+`lib/imapImport.ts`, `imapflow`/`mailparser`), P13 home-inventory insurance export bundle (`lib/insuranceExport.ts`), P8 tax-deductible tagging + year-end export (`lib/taxExport.ts`) — και ένα σωρός SaaS control-plane UI (account settings page, workspace settings tab, BYO AI key panel, invite-accept UI, resend-invite, leave-workspace, create-another-workspace, keyset-pagination activity trail, admin tenant activity filter).
> **type-check:** `cd apps/web && npm run type-check` → **EXIT 0**.
> **Νέος κώδικας audited, exemplary, μηδέν νέο debt:**
> - **`api/saas/account/workspaces/route.ts`** (νέο write route, POST create-workspace + DELETE leave-workspace) — ολόκληρο το σώμα κάθε handler μέσα σε `saasGuard(...)` (try/catch built-in, ίδιο idiom με τα routes που ΗΔΗ ακολουθούν το convention)· seat-cap (`MAX_WORKSPACES_PER_ACCOUNT=20`), `wouldOrphanOwners` guard στο leave-path (ίδιο με members.route), audit-logged. **Καλό reference pattern** για το fix του ήδη-ανοιχτού `invites/accept` holdout item (δες παρακάτω).
> - **`api/saas/workspace/ai-key/route.ts`** (νέο, BYO AI key/increment 75) — `requireManage=true` (owner/admin only) σε GET/PUT/DELETE, AES-256-GCM at-rest encryption (`lib/tenancy/secretCrypto`), **ποτέ δεν επιστρέφει το plaintext key** (μόνο masked last-4 preview), audit-logged με `meta: { provider }` (ποτέ το key), `saasGuard`-wrapped. Exemplary secret-handling.
> - **`lib/imapConfig.ts`** (νέο, email-in credentials) — σωστά tenant-scoped (`currentModel(AppConfig)`, ΟΧΙ direct import όπως το ήδη-flagged Voucher/GiftCard/LoyaltyCard gap)· `getImapInfo()` (settings/actions.ts:909) επιστρέφει `hasPass: boolean`, **ποτέ το plaintext password**, σε κανέναν caller.
> - **`lib/imapImport.ts`** (νέο, IMAP fetch+parse) — bounded (`MAX_FETCH=25`/check, `FIRST_RUN_LOOKBACK_DAYS=7` στο πρώτο run), friendly error mapping χωρίς να διαρρέει internals, always `logout()` σε finally.
> - **`exportInsuranceBundle`/`exportTaxBundle`** (settings/actions.ts, P13/P8) — και τα δύο `requireAdmin()`-gated, bounded queries (`.select()`+`.lean()`), defensive per-file try/catch (ένα missing/orphaned storage αρχείο δεν ρίχνει όλο το export), `safeZipName` reused.
> **1 μικρό observational σχόλιο (ΟΧΙ νέο queue item, ίδιας κλάσης precedent ήδη αποδεκτό στο «Δεν είναι debt»):** `testAnthropic`/`testRemoteConnection`/`testOnedriveConnection`/`testImapConnectionAction` (settings/actions.ts) επίσης δεν καλούν `requireAdmin()` — ίδιο σχήμα με το ήδη-ανοιχτό P1 notifications item, αλλά χαμηλότερης σοβαρότητας: καμία από τις 4 επιστρέφει secret/plaintext στον caller (μόνο `ok`/`error`/`messageCount`/`drive` — side-effect-only connectivity test, όχι info-disclosure). Δεν ανοίγω ξεχωριστό item· αν ο builder διορθώσει το P1 item, αξίζει να ρίξει ματιά και σε αυτά τα 4 test-actions για συνέπεια (ίδιο 1-liner fix).
> **Confirmed ΑΚΟΜΑ ανοιχτά, live-verified, μηδέν αλλαγή στο ίδιο το gap (μόνο line-number/count drift από άσχετο νέο κώδικα):** Settings→Notifications requireAdmin gap (P1/S, live: ίδια 8 exports, μετατοπίστηκαν σε γρ.339-446)· Voucher/GiftCard/LoyaltyCard tenancy-parity (P2/M)· sampleDataActions.ts tenancy-parity (P2/S)· `invites/accept` guardless write (P2/S)· `audit/route.ts` guardless read (P2/S)· `workspace/erasure/purge` guardless cron (P2/S)· `getTenantConnection` readyState guard decision-flag (P3/S, `## Needs Achilleas`, αμετάβλητο).
> **Ουρά μετά το run:** αμετάβλητη — 1 P1/S + 1 P2/M + 4 P2/S (όλα ήδη ανοιχτά, builder δεν κατανάλωσε κανένα αυτό το διάστημα) + 1 P3/M i18n gap (μεγαλύτερο, 84→110) + 1 P3/S decision-flag στο `## Needs Achilleas`.

> **ΣΗΜ concurrent activity**: αυτό το run έτρεξε παράλληλα με άλλα automated routines στο ίδιο working tree (το working tree προχώρησε `da036c9`→`83f392f`, +14 commits, ΚΑΤΑ τη διάρκεια του audit, μεταξύ αυτών ένα «reviewer» run που ήδη ενημέρωσε το el.ts i18n item [count 75→84] και έκλεισε ένα YNAB-importer bug). Κάθε εύρημα παρακάτω επαληθεύτηκε live στο ΤΡΕΧΟΝ working tree (όχι από cached docs) αμέσως πριν το commit.

- **type-check:** `cd apps/web && npm run type-check` → **EXIT 0** (μηδέν P1 από type errors).
- **Νέος κώδικας από την 54η ελέγχθηκε (commits `536a3d8`..`83f392f`):** `536a3d8` (P20 loyalty-card wallet), `ded86eb` (P24 outbound event webhooks), `32ca74c` (SSRF fix στους notifiers — ήδη σωστό, δες παρακάτω), `6ed76b6` (P16 YNAB CSV migration importer), `d5a9684`+`8c3ccda` (mobile-parity fixes, ήδη reviewed από pharos-daily-dev το ίδιο session), + docs/test-only commits.
  - **P24 event webhooks (`lib/webhooks.ts`) → exemplary, μηδέν νέο debt.** `dispatchEventWebhooks`/`postOne` περνούν από `assertPublicUrl` (SSRF guard) πριν από κάθε POST, tenant-scoped read μέσω `currentModel(AppConfig)`, per-subscription rate-limit, HMAC signing pure+unit-tested, never-throws fire-and-forget contract σεβαστό στα call sites.
  - **SSRF fix στους notifiers (`32ca74c`) → επιβεβαιώθηκε σωστό.** `sendOne()`/`sendNtfyTo()` καλούν πλέον `assertPublicUrl` πριν το POST σε ntfy/Discord/Slack/generic-webhook (Telegram σκόπιμα εξαιρείται, hardcoded host). Μηδέν νέο debt.
  - **Auth gap ΝΕΟ εύρημα (`settings/actions.ts:332-439`) → δες item #1 παρακάτω.** Το write path του P24 (`saveWebhookSubscriptions`/`testWebhookSubscription`) και το ήδη-προϋπάρχον notifier-channels block (`saveNtfy`/`sendTestNtfy`/`getNotifierChannels`/`saveNotifierChannels`/`testNotifierChannel`) είναι το ΜΟΝΟ σημείο σε ολόκληρο το `settings/actions.ts` (17 άλλα exports καλούν `requireAdmin()`) που λείπει το admin-gate, ενώ χειρίζεται literal secrets (Telegram bot token, webhook HMAC secret) και το αντίστοιχο Settings tab δεν είναι `adminOnly`.
  - **P20 loyalty-card wallet (`vouchers/loyaltyActions.ts`, νέο αρχείο) → 1 νέο P2 εύρημα, δες item #2 παρακάτω.** Model/lib/tests καθαρά (soft-delete, indexed, pure barcode-format helper με 13 tests), αλλά οι 5 server actions κάνουν direct `LoyaltyCard` import αντί tenant-scoped `currentModel` — mirror του ήδη-γνωστού sibling gap στο `vouchers/actions.ts` (Voucher) + `vouchers/giftcardActions.ts` (GiftCard), κανένα από τα τρία ποτέ flagged πριν.
  - **P16 YNAB importer (`lib/ynabImport.ts`, `YnabImportModal.tsx`) → καθαρό, μηδέν νέο debt.** Pure+tested column-detection, μηδέν νέο DB-write κώδικα (front-door πάνω στο ήδη-tenant-scoped+validated `importExpensesCsv`). Ένα μικρό bug (summary count) βρέθηκε ΚΑΙ διορθώθηκε ήδη από concurrent commit (`83f392f`) πριν προλάβω να το φλάγκάρω — confirmed live καθαρό.
- **v1 API surface:** μηδέν commit άγγιξε `src/app/api/v1` πέρα από τα ήδη-reviewed mobile-parity fixes (`d5a9684`/`8c3ccda`) + το νέο test-only `settings/test-notify/route.test.ts` (`adfe2c9`). Fresh grep: μηδέν `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` (εκτός test), κάθε read route `.lean()`-backed, κάθε route εκτός `auth/login` περνά από `withAuth`.
- **sampleDataActions.ts (54η item) confirmed ΑΚΟΜΑ ανοιχτό, live-verified, μηδέν αλλαγή:** `grep -c "withRequestTenant\|currentModel" apps/web/src/app/settings/sampleDataActions.ts` = 0.
- **3 προϋπάρχοντα SaaS holdouts confirmed ΑΚΟΜΑ ανοιχτά, live-verified, μηδέν αλλαγή:** `invites/accept` guardless write (P2/S, 50η)· `audit`/`workspace/erasure/purge` guardless read/cron (P2/S ×2, 49η).
- **el.ts i18n gap:** ήδη ενημερωμένο από concurrent «reviewer» run σε 84 missing κλειδιά (δες item κάτω στο αρχείο) — καλύπτει και τα P20/P16/P24 features αυτού του range. Δεν το ξαναγράφω, απλά confirmed accurate.
- **Ουρά μετά το run:** 1 νέο auto-buildable **P1/S** (Notifications requireAdmin gap, στην κορυφή — αγγίζει real single-user+multi-user auth σήμερα, ΟΧΙ dead-until-SaaS) + 1 νέο auto-buildable **P2/M** (Voucher/GiftCard/LoyaltyCard tenancy-parity, ίδιας κλάσης με το ήδη-ανοιχτό sampleDataActions.ts item) + το ήδη-ανοιχτό sampleDataActions.ts P2/S + 3 προϋπάρχοντα P2/S SaaS error-handling holdouts + 1 P3/M i18n gap + 1 P3/S decision-flag (`getTenantConnection` readyState guard) στο `## Needs Achilleas`.

---

## Web Debt Queue — ενεργά items (55η σάρωση 2026-07-19)

> Σύνοψη 55ής: νέο **P1** εύρημα (το μοναδικό αυτού του run) — 8 Settings server actions που διαχειρίζονται integration secrets (ntfy URL, Telegram bot token, webhook HMAC secrets) λείπουν το `requireAdmin()` gate που έχει ΚΑΘΕ άλλο mutating export στο ίδιο αρχείο, και το αντίστοιχο UI tab δεν είναι `adminOnly` — ένας non-admin household member μπορεί σήμερα να διαβάσει/αλλάξει αυτά τα secrets μέσω της κανονικής Settings σελίδας. Δεύτερο νέο εύρημα (P2/M) — το μόλις-shipped P20 loyalty-card wallet επαναλαμβάνει το ίδιο tenancy-parity gap που το sampleDataActions.ts item ήδη έχει ανοιχτό, αλλά σε 3 sibling αρχεία (Voucher/GiftCard/LoyaltyCard). Το sampleDataActions.ts item + οι 3 SaaS holdouts παραμένουν από κάτω στις αρχικές τους θέσεις, confirmed ανοιχτά.

### Settings → Notifications (ntfy / notifier channels / event webhooks) — 8 server actions λείπουν `requireAdmin()`, εκθέτουν secrets σε non-admin members
- Priority: P1
- Size: S
- Area: api
- Files: apps/web/src/app/settings/actions.ts, apps/web/src/app/settings/SettingsClient.tsx
- Depends on: none
- Acceptance:
  - **Το πρόβλημα:** `settings/actions.ts` έχει 17 mutating exports που καλούν `await requireAdmin();` ως πρώτη γραμμή (π.χ. `saveAiConfig:123`, `saveStorageConfig:770`, `saveScraperAi:717`, `exportData:1136`, ακόμα και το νέο `sampleDataActions.ts` P1-feature). Όμως το block **`saveNtfy` (γρ.332), `sendTestNtfy` (343), `getNotifierChannels` (353), `saveNotifierChannels` (360), `testNotifierChannel` (383), `getWebhookSubscriptions` (397), `saveWebhookSubscriptions` (405), `testWebhookSubscription` (431)** — 8 συνεχόμενα exports, ΟΛΑ σχετικά με outbound integrations — δεν καλούν `requireAdmin()` ΠΟΥΘΕΝΑ. Το middleware (`src/middleware.ts`) gate-άρει μόνο «έχει valid session» (οποιοσδήποτε ρόλος), όχι admin ειδικά· το admin-vs-member διαχωρισμό τον κάνει αποκλειστικά η ίδια η action function.
  - **Γιατί έχει σημασία τώρα (όχι dead-until-SaaS, real gap σήμερα):** η εφαρμογή έχει ήδη πλήρες multi-user households σήμερα (`models/User.ts` role admin|member, Settings→Users CRUD, self-hosted όχι SaaS-only). Το «Notifications» tab (`SettingsClient.tsx:100`) **δεν είναι `adminOnly`** (σε αντίθεση με το «Users» tab, `SettingsClient.tsx:101`) → ένας logged-in member βλέπει κανονικά το tab στο UI. `getNotifierChannels()`/`getWebhookSubscriptions()` επιστρέφουν `NotifierConfig.token` (Telegram bot token, `notifiers.shared.ts:12`) και `WebhookSubscription.secret` (HMAC signing secret, `webhooks.shared.ts`) **σε plaintext** σε ΚΑΘΕ caller χωρίς κανένα role-check. `saveNotifierChannels`/`saveWebhookSubscriptions`/`testNotifierChannel`(`testNotifier` πραγματικό POST)/`testWebhookSubscription` επιτρέπουν σε ΚΑΘΕ member να αλλάξει πού πηγαίνουν τα alerts (redirect σε δικό του endpoint) ή να διαβάσει/exfiltrate-άρει τα ήδη-αποθηκευμένα secrets ενός admin.
  - **Fix:** πρόσθεσε `await requireAdmin();` ως πρώτη γραμμή στα 8 exports (ίδιο 1-liner idiom με τα υπόλοιπα 17 στο ίδιο αρχείο, ήδη imported `requireAdmin` στη γρ.53). Προαιρετικό αλλά συνιστώμενο για UX-consistency (ΟΧΙ το security boundary — αυτό είναι το server-side gate): πρόσθεσε `adminOnly: true` στο `{ id: 'notifications', ... }` entry του `TABS` array (`SettingsClient.tsx:100`), ίδιο pattern με το `users` tab (`:101`), ώστε ένα member να μη βλέπει καν το tab.
  - Μηδέν αλλαγή σε response shape/behavior για admin χρήστες (το μόνο happy-path σήμερα, single-admin self-hosted). Redirect-to-login για logged-out (ήδη γίνεται από το middleware πριν φτάσει καν εδώ)· `Forbidden: admin access required` throw για non-admin members (ίδιο error message idiom με τα υπόλοιπα 17 requireAdmin call sites — τα caller components ήδη χειρίζονται thrown server-action errors generically).
  - Επαλήθευση: `grep -n "requireAdmin" apps/web/src/app/settings/actions.ts | wc -l` πάει 17→25· `sed -n '332,439p' apps/web/src/app/settings/actions.ts | grep -c requireAdmin` ≥ 8· npm run type-check exits 0.
  - npm run type-check exits 0
- Status: DONE (fixed 2026-07-25, pharos-daily-dev) — `await requireAdmin();` προστέθηκε ως πρώτη γραμμή στα 8 exports (`saveNtfy:339`, `sendTestNtfy:350`, `getNotifierChannels:360`, `saveNotifierChannels:367`, `testNotifierChannel:390`, `getWebhookSubscriptions:404`, `saveWebhookSubscriptions:412`, `testWebhookSubscription:438`), ίδιο 1-liner idiom με τα υπόλοιπα 21 στο ίδιο αρχείο. `SettingsClient.tsx`: το `notifications` tab entry πήρε `adminOnly: true` (ίδιο pattern με το `users` tab). Verified: `grep -n "requireAdmin" apps/web/src/app/settings/actions.ts | wc -l` → **29** (21→29, +8 ακριβώς)· `sed -n '339,446p' apps/web/src/app/settings/actions.ts | grep -c requireAdmin` → **8**. `npm run type-check` EXIT 0· full `npx vitest run` → **3364/3364 green (255 files)**. Safe Docker rebuild (mongo healthy πριν, `docker compose build web` → `up -d web`): `/login` 200, `/settings` 307 (auth-gated, compiled OK), RestartCount 0, build cache pruned μετά. Μηδέν αλλαγή σε συμπεριφορά για τον σημερινό single-admin self-hosted χρήστη (μόνο happy path)· η αλλαγή αφορά multi-user households με non-admin member λογαριασμό.

### Voucher / GiftCard / LoyaltyCard server actions bypass tenant-scoping (ίδιο gap με sampleDataActions.ts, 3 sibling αρχεία)
- Priority: P2
- Size: M
- Area: db
- Files: apps/web/src/app/vouchers/actions.ts, apps/web/src/app/vouchers/giftcardActions.ts, apps/web/src/app/vouchers/loyaltyActions.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα:** και τα τρία αρχεία που τροφοδοτούν το `/vouchers` (3-tab: Coupons | Gift cards | Loyalty cards) κάνουν direct model import (`import { Voucher } from '@/models/Voucher'`, `import { GiftCard } from '@/models/GiftCard'`, `import { LoyaltyCard } from '@/models/LoyaltyCard'`) και τα χρησιμοποιούν απευθείας σε κάθε CRUD export (`createVoucher`/`updateVoucher`/`deleteVoucher`, `createGiftCard`/…, `createLoyaltyCard`/`updateLoyaltyCard`/`setLoyaltyCardArchived`/`deleteLoyaltyCard`) — μηδέν `currentModel()`/`withRequestTenant()` σε κανένα από τα τρία (`grep -c "withRequestTenant\|currentModel" apps/web/src/app/vouchers/{actions,giftcardActions,loyaltyActions}.ts` = 0,0,0). Το `LoyaltyCard` (P20, `536a3d8`) είναι η ΝΕΟΤΕΡΗ instance αυτού του gap· το `Voucher`/`GiftCard` προϋπήρχαν χωρίς να έχουν flagged ποτέ πριν.
  - **Γιατί έχει σημασία:** ίδιο σχήμα με το ήδη-ανοιχτό `sampleDataActions.ts` item (54η σάρωση) — σε SaaS multi-tenant mode (`SAAS_MODE=on`) αυτά τα CRUD θα διάβαζαν/έγραφαν πάντα στο **DEFAULT** tenant DB αντί του τρέχοντος, ενώ το sibling `items/actions.ts`+`receipts/actions.ts`+`expenses/actions.ts` ΗΔΗ χρησιμοποιούν σωστά `withRequestTenant(async () => { const X = await currentModel(XModel); ... })`. Σε self-hosted (SAAS_MODE off, ο τρόπος του Αχιλλέα σήμερα) **μηδέν συμπεριφορική αλλαγή** — `currentModel()`/`withRequestTenant()` no-op στο ίδιο DEFAULT connection.
  - **Fix:** mirror το ίδιο pattern και στα τρία αρχεία (ίδιο recipe με το sampleDataActions.ts item): import `withRequestTenant` από `@/lib/tenancy/request` + `currentModel` από `@/lib/tenancy/connection`· rename το model import σε `Voucher as VoucherModel` (κ.ο.κ.)· τύλιξε το σώμα κάθε exported function σε `return withRequestTenant(async () => { const Voucher = await currentModel(VoucherModel); ... });`. Μπορεί να γίνει ένα-ένα αρχείο (ανεξάρτητα, ίδιο recipe) ή και τα τρία μαζί σε ένα PR αφού τροφοδοτούν την ίδια σελίδα.
  - Επαλήθευση ανά αρχείο: `grep -c "withRequestTenant\|currentModel" apps/web/src/app/vouchers/<file>.ts` ≥ (αριθμός exported functions)· npm run type-check exits 0· υπάρχοντα tests (`loyaltyCard.test.ts`, όσα υπάρχουν για vouchers/giftcards) παραμένουν green.
  - npm run type-check exits 0
- Status: DONE (fixed 2026-07-25) — και τα τρία αρχεία mirror-άρουν πλέον 1:1 το `items/actions.ts`/`sampleDataActions.ts` recipe: import `withRequestTenant` (`@/lib/tenancy/request`) + `currentModel` (`@/lib/tenancy/connection`), model imports renamed σε `VoucherModel`/`GiftCardModel`/`LoyaltyCardModel`, και κάθε **DB-touching** export τυλίχτηκε σε `return withRequestTenant(async () => { await connectDB(); const X = await currentModel(XModel); ... });`. Wrapped: `createVoucher`/`updateVoucher`/`toggleVoucherUsed`/`deleteVoucher`· `createGiftCard`/`updateGiftCard`/`setGiftCardArchived`/`deleteGiftCard`/`addGiftCardUse`/`removeGiftCardUse`· `createLoyaltyCard`/`updateLoyaltyCard`/`setLoyaltyCardArchived`/`deleteLoyaltyCard`. Τα δύο AI-only exports `scanVoucherText`/`scanVoucherImage` (μηδέν DB access) έμειναν **σκόπιμα unwrapped** — ίδιο precedent με τα `scanExpenseText`/`scanExpenseImage` (`expenses/actions.ts:73,86`, επίσης unwrapped στο ήδη tenant-scoped αρχείο). Cheap validation guards μένουν ΠΡΙΝ το wrap (Zod `.parse()` στα create/update, το non-zero-amount guard του `addGiftCardUse`), ίδιο idiom με το `requireAdmin()`-πριν-το-wrap του sampleDataActions.ts. Verified: `grep -c "withRequestTenant\|currentModel"` → **10 / 15 / 11** (≥ #exports σε κάθε αρχείο)· `npm run type-check` EXIT 0· `npx vitest run` (από `apps/web`) → **256 files / 3373 tests green, μηδέν regression**. Τα δύο υπάρχοντα test αρχεία (`actions.test.ts` 18 tests, `giftcardActions.test.ts` 24 tests) απέκτησαν το καθιερωμένο tenancy-seam mock (`vi.mock('@/lib/tenancy/request')` inline-runner + `vi.mock('@/lib/tenancy/connection')` → mocked model, ακριβώς όπως `receipts/actions.crud.test.ts:61-62` και `expenses/actions.crud.test.ts:60-61`) — υποχρεωτικό, γιατί το πραγματικό `getTenantConnection` κάνει `(await connectDB()).connection` και το `connectDB` είναι mocked σε `async () => {}` σε αυτά τα specs. Μηδέν συμπεριφορική αλλαγή για self-hosted (SAAS_MODE off → `currentModel()` επιστρέφει το ίδιο DEFAULT-connection model)· καθαρά SaaS-mode correctness prep. Docker: ΔΕΝ έγινε rebuild (out of scope για αυτό το run)· browser-verify: skipped — backend-only server-action wiring, μηδέν UI αλλαγή. **ΣΗΜ / εναπομείναν gap ίδιας κλάσης**: το **read** path `vouchers/page.tsx:2-4` κάνει ΑΚΟΜΑ direct `import { Voucher } from '@/models/Voucher'` + `GiftCard` + `LoyaltyCard` με μηδέν `withRequestTenant`/`currentModel` (verified live μετά το fix). ΔΕΝ αγγίχτηκε γιατί το item ορίζει ρητά `Files:` = τα 3 action αρχεία μόνο· άρα σε SaaS mode το `/vouchers` θα **έγραφε** σωστά per-tenant αλλά θα **διάβαζε** από το DEFAULT DB. Αξίζει ξεχωριστό follow-up item (ίδιο recipe, 1 αρχείο, S) — ο auditor να το ανοίξει στην επόμενη σάρωση.

---

## Σύνοψη audit (2026-07-18 54η σάρωση· type-check EXIT 0· v1 surface αμετάβλητος και καθαρός· 1 νέο P2 tenancy-parity εύρημα στο μόλις-shipped P1 sample-data mode· deleteItemPhoto/Attachment IDOR ΕΚΛΕΙΣΕ live κατά τη διάρκεια του run (commit `82e008c`)· 3 SaaS holdouts παραμένουν ανοιχτοί αμετάβλητοι· el.ts gap πήδηξε 42→75)

> **ΣΗΜ concurrent activity**: αυτό το run έτρεξε παράλληλα με άλλα automated routines (reviewer/mobile-parity-auditor/pharos-daily-dev) στο ίδιο working tree — το working tree προχώρησε αρκετά commits (`d0a592a`→`f647f43`, +7) ΚΑΤΑ τη διάρκεια του audit. Ένα από αυτά τα commits (`82e008c`) έκλεισε ΤΟ TOP item της αρχικής μου ουράς (deleteItemPhoto/Attachment IDOR) πριν προλάβω να κάνω commit το δικό μου WEB_DEBT.md update — το item ενημερώθηκε σε DONE στη θέση του αντί να μείνει λανθασμένα TODO. Confirmed live: `items/actions.ts:167-168` + `:270-271`.

- **type-check:** `cd apps/web && npm run type-check` → **EXIT 0** (μηδέν P1 από type errors).
- **Νέος κώδικας από την 53η ελέγχθηκε (3 commits, `git log --since=2026-07-15 -- apps/web/src/app/api apps/web/src/app/items apps/web/src/app/expenses apps/web/src/app/reports apps/web/src/app/settings`):** `7b53bd2` (test-only, v1 `ai/route.test.ts` — μηδέν shape change), `223c2cf` (P26 in-app onboarding checklist), `61e2524` (P1 demo/sample-data mode).
  - **P26 onboarding checklist (`app/page.tsx`, `components/OnboardingChecklist.tsx`) → καθαρό, μηδέν νέο debt.** Reuse existing `getAppSettings`/`getStorageConfig`/`getNotifiers` helpers μέσα στο ήδη-υπάρχον `Promise.all`, μηδέν νέο query pattern. Ο ίδιος ο commit-author σημείωσε ήδη ρητά (PROGRESS.md 2026-07-16) ότι το `page.tsx` διαβάζει πάντα το DEFAULT tenant (pre-existing gap, ακολούθησε το τοπικό convention σκόπιμα) — δεν το ξαναγράφω εδώ, ήδη καταγεγραμμένο ως follow-up.
  - **P1 sample-data mode (`app/settings/sampleDataActions.ts`, νέο αρχείο) → 1 νέο P2 εύρημα, δες item παρακάτω.** Writes (`loadSampleData`/`clearSampleData`) είναι σωστά `requireAdmin()`-gated και strictly scoped (`{isSample:true}` filter σε delete/count, ποτέ αγγίζει πραγματικά records) — αλλά χρησιμοποιούν direct model imports (`Item`, `Receipt`, `Expense`, `Subscription`) αντί το `currentModel()`/`withRequestTenant()` pattern που **ήδη υπάρχει και χρησιμοποιείται ενεργά** για 3 από τα 4 ίδια models σε sibling κώδικα (`items/actions.ts`+`page.tsx`, `receipts/actions.ts`+`page.tsx`, `expenses/actions.ts`+`page.tsx`).
- **v1 API surface αμετάβλητος:** μηδέν commit άγγιξε `src/app/api/v1` από την 53η. Fresh grep: μηδέν `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` (εκτός test), κάθε read route με `.find()` παραμένει `.lean()`-backed, κάθε route εκτός `auth/login` περνά από `withAuth`.
- **el.ts i18n gap πήδηξε σημαντικά:** 42→**75** missing κλειδιά (+33, από P12 savings/goals [12 κλειδιά] + P26 onboarding [8] + P1 sample-data [11] + `nav.bills` παλαιότερο miss [1] — τρία διαδοχικά features σε 3 μέρες, κανένα δεν πρόσθεσε ελληνική μετάφραση, ίδιο σκόπιμο precedent με πριν). Το χάσμα μεγαλώνει με σταθερό ρυθμό (38→42→75σε ~1 εβδομάδα) — αξίζει προτεραιοποίηση ενός αφιερωμένου μεταφραστικού pass πριν γίνει δυσδιαχείριστο. Παραμένει P3/M, ενημερώθηκε η πλήρης λίστα κλειδιών.
- **1 item ΕΚΛΕΙΣΕ live κατά τη διάρκεια του run:** `deleteItemPhoto`/`deleteItemAttachment` ownership-check (P2/S, 53η) → **DONE**, commit `82e008c` (concurrent fix commit, δες σημείωση πάνω). Μαρκαρίστηκε DONE στη θέση του.
- **3 προϋπάρχοντα SaaS holdouts confirmed ΑΚΟΜΑ ανοιχτά, live-verified, μηδέν αλλαγή:** `invites/accept` guardless write (P2/S, 50η)· `audit`/`workspace/erasure/purge` guardless read/cron (P2/S ×2, 49η). Κανένας builder run δεν τα κατανάλωσε ακόμα.
- **Ουρά μετά το run:** 1 νέο auto-buildable P2/S (sample-data tenancy-parity gap, στην κορυφή — μηχανικό fix, dead-until-SaaS σήμερα αλλά ίδιας κλάσης με sibling κώδικα που ΗΔΗ το κάνει σωστά) + 3 προϋπάρχοντα P2/S SaaS error-handling holdouts + 1 P3/M i18n gap (μεγαλύτερο πλέον) + 1 P3/S decision-flag (`getTenantConnection` readyState guard) στο `## Needs Achilleas`.

---

## Web Debt Queue — ενεργά items (54η σάρωση 2026-07-18)

> Σύνοψη 54ης: νέο tenancy-parity εύρημα στο μόλις-shipped P1 sample-data mode — writes σε 4 models μέσω direct import αντί του `currentModel`/`withRequestTenant` pattern που sibling κώδικας (items/receipts/expenses) ήδη χρησιμοποιεί ενεργά για 3 από τα 4 ίδια models. Dead-until-SaaS σήμερα (SAAS_MODE off self-hosted), αλλά εύκολο μηχανικό fix τώρα που είναι μικρό (3 functions, 1 αρχείο) πριν μεγαλώσει η επιφάνεια. Το deleteItemPhoto/Attachment IDOR item ΕΚΛΕΙΣΕ live κατά τη διάρκεια αυτού του run (concurrent commit `82e008c`) — marked DONE στη θέση του. Οι 3 SaaS holdouts + το el.ts gap παραμένουν από κάτω (στις αρχικές τους θέσεις, αμετάβλητα εκτός από τα Status-line confirmations).

### `sampleDataActions.ts` — «Load/Clear sample data» γράφει πάντα στο DEFAULT tenant, όχι στον τρέχοντα (bypass του υπάρχοντος tenancy pattern)
- Priority: P2
- Size: S
- Area: db
- Files: apps/web/src/app/settings/sampleDataActions.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα:** το νέο `sampleDataActions.ts` (commit `61e2524`, P1 demo/sample-data mode) κάνει `import { Item } from '@/models/Item'` κ.λπ. (γρ.11-14) και τα χρησιμοποιεί απευθείας στα `sampleCounts()`/`getSampleDataStatus()`/`loadSampleData()`/`clearSampleData()` — `Item.countDocuments(...)`, `Item.deleteMany({isSample:true})`, `Item.insertMany(data.items)` κ.ο.κ. για **Item, Receipt, Expense, Subscription**. Αυτά τα models είναι πάντα bound στο **DEFAULT Mongoose connection** (`connectDB()`, μηδέν tenant resolution). Όμως 3 από τα 4 (Item, Receipt, Expense) έχουν ΗΔΗ ένα καθιερωμένο, ενεργά-χρησιμοποιούμενο tenant-scoped equivalent: `items/actions.ts`+`items/page.tsx`, `receipts/actions.ts`+`receipts/page.tsx`, `expenses/actions.ts`+`expenses/page.tsx` κάνουν όλα `return withRequestTenant(async () => { const Item = await currentModel(ItemModel); ... })` ώστε οι queries να χτυπάνε τη σωστή tenant database (`lib/tenancy/connection.ts` `currentModel`, `lib/tenancy/request.ts` `withRequestTenant`).
  - **Γιατί έχει σημασία:** σε SaaS multi-tenant mode (`SAAS_MODE=on`), ένας tenant που πατά «Load sample data» στο Settings θα κάνει `deleteMany`/`insertMany` στο **DEFAULT** tenant DB, ΟΧΙ στη δική του — τα δείγματα δεν θα εμφανιστούν καν στο δικό του `/items`/`/receipts`/`/expenses` (που ΣΩΣΤΑ διαβάζουν από το tenant DB τους μέσω `currentModel`), ενώ «Clear sample data» θα διαγράψει sample-tagged records από το DEFAULT DB ανεξάρτητα από ποιος το πάτησε — silent cross-tenant confusion/data-mixing σε ένα write path που κάνει `deleteMany`+`insertMany`, όχι απλό read.
  - **Fix:** mirror το ήδη-υπάρχον pattern 1:1. Import `withRequestTenant` από `@/lib/tenancy/request` + `currentModel` από `@/lib/tenancy/connection`· μετονόμασε τα imports σε `Item as ItemModel`/`Receipt as ReceiptModel`/`Expense as ExpenseModel`/`Subscription as SubscriptionModel`· τύλιξε το σώμα κάθε exported function (`sampleCounts` helper, `getSampleDataStatus`, `loadSampleData`, `clearSampleData`) σε `return withRequestTenant(async () => { ... })`· μέσα, `const Item = await currentModel(ItemModel);` (ίδιο για τα άλλα 3) πριν τα `.countDocuments`/`.deleteMany`/`.insertMany` calls. Το `Subscription` model δεν έχει ακόμα δικό του tenant-scoped call site αλλού στο app, αλλά το `currentModel()` helper είναι γενικό (δουλεύει για οποιοδήποτε Mongoose model) — ίδιο wiring, καμία εξάρτηση.
  - Σε self-hosted (SAAS_MODE off, ο τρόπος που τρέχει σήμερα ο Αχιλλέας) το `currentModel()`/`withRequestTenant()` no-op στο ίδιο DEFAULT connection (δες `connection.ts:100-104` OSS-parity σχόλιο) — άρα **μηδέν συμπεριφορική αλλαγή σήμερα**, καθαρά προετοιμασία/συνέπεια για όταν ενεργοποιηθεί το SaaS mode.
  - Επαλήθευση: `grep -c "withRequestTenant\|currentModel" apps/web/src/app/settings/sampleDataActions.ts` ≥ 8 (4 functions × wrap + per-model resolve)· npm run type-check exits 0· existing `sampleData.test.ts` (pure, DB-free) παραμένει green αμετάβλητο.
  - npm run type-check exits 0
- Status: DONE (fixed 2026-07-25, pharos-daily-dev) — `sampleDataActions.ts` imports `withRequestTenant` (`@/lib/tenancy/request`) + `currentModel` (`@/lib/tenancy/connection`), model imports renamed to `ItemModel`/`ReceiptModel`/`ExpenseModel`/`SubscriptionModel`. `sampleCounts()` helper resolves all 4 tenant-scoped models via `currentModel()` (relies on the ambient tenant context set by the caller's `withRequestTenant`, same as sibling helper functions elsewhere). All 3 exported functions (`getSampleDataStatus`/`loadSampleData`/`clearSampleData`) wrap their body in `return withRequestTenant(async () => { ... })`, exactly mirroring `items/actions.ts`. Verified: `grep -c "withRequestTenant|currentModel" sampleDataActions.ts` → 18 (≥8 acceptance threshold)· `npm run type-check` EXIT 0· full `npx vitest run` → 3364/3364 passed (255 files, incl. unchanged `sampleData.test.ts`)· safe Docker rebuild (`docker compose build web` → mongo already healthy → `up -d web`) → `/login` 200, `/settings` 307, container `Status:"running"`/`ExitCode:0` (no restarts)· `docker builder prune -f` after. Zero behavioral change for self-hosted (SAAS_MODE off, single DEFAULT connection) — purely SaaS-mode correctness prep, same as the sibling pattern it mirrors.

---

## Σύνοψη audit (2026-07-15 53η σάρωση· type-check EXIT 0· expenses space/split parity ΕΚΛΕΙΣΕ (DONE, commit `b4f32af`)· 1 νέο P2 file-delete IDOR εύρημα στο P21 document vault· reset-request timing item ΕΚΛΕΙΣΕ (stale-marked TODO)· 3 SaaS error-handling holdouts παραμένουν ανοιχτά)

- **type-check:** `cd apps/web && npm run type-check` → **EXIT 0** (μηδέν P1 από type errors).
- **Νέος κώδικας από την 52η ελέγχθηκε (2 commits):** `9fee9b0` (admin tenant ACTIONS: suspend/reactivate/cancel + plan override) και `29685cf` (P21 document/manual vault στα items).
  - **`admin/tenants/[slug]/route.ts` PATCH (νέο write surface, superadmin-only) → exemplary.** Το μοναδικό write του superadmin console: `saasGuard`-wrapped (try/catch έτοιμο), `requireSuperadmin()` gate, pure planning helper `planAdminTenantPatch()` (`lib/tenancy/adminTenantActions.ts`, πλήρως unit-tested — δες `adminTenantActions.test.ts`) που κάνει validate+diff+idempotent no-op πριν το `$set`, κάθε write logged μέσω `recordAudit`. Μηδέν `any`, μηδέν N+1 (`getTenantDetailForAdmin` κάνει batched `Account.find({_id:{$in:accountIds}})` αντί per-member query). **Μηδέν νέο debt.**
  - **P21 document vault (`items/actions.ts` `uploadItemAttachments`/`deleteItemAttachment`) → 1 νέο P2 εύρημα, δες item παρακάτω.** Καλά scoped (whitelist εξτένσεων, reuse storage pipeline, `mergeItems` κάνει σωστά dedup-by-path union), αλλά το delete path λείπει ownership-check πριν σβήσει το υποκείμενο αρχείο — ίδιο pattern προϋπάρχει ΚΑΙ στο `deleteItemPhoto` (φωτογραφίες, όχι νέο σε αυτό το session, αλλά ποτέ δεν είχε flagged).
- **Ένα TODO ΕΚΛΕΙΣΕ χωρίς να ενημερωθεί (stale):** το «Reset-request route — timing side-channel» (flagged 2026-07-02, 37η σάρωση) βρέθηκε ήδη διορθωμένο live από το commit `e75cd74` («feat(saas): constant-time reset-request response (D6)») — fire-and-forget email + σταθερός response floor (`settleMinResponseTime`). Μαρκαρίστηκε DONE στη θέση του (δες γραμμή στο item).
- **el.ts i18n gap μεγάλωσε:** 38→**42** missing κλειδιά (+4 από το P7 auto-discovery panel, commit `97a7d66`, `sub.discovered*`). Παραμένει TODO, ίδιο P3/M item, ενημερώθηκε η λίστα κλειδιών.
- **Οι 3 SaaS error-handling holdouts (`invites/accept`, `audit`, `workspace/erasure/purge`) παραμένουν ανοιχτοί** (`grep -c 'try {'` = 1/0/0 αντίστοιχα, αμετάβλητο από την 50η/49η) — ο builder δεν τους κατανάλωσε ακόμα.
- **v1 surface τυπολογικά καθαρός:** fresh grep σε ολο το `src/app/api/v1` (εκτός test) → μηδέν `: any`/`as any`/`@ts-ignore`/`@ts-expect-error`. Κάθε read route `.lean()`-backed· κάθε route εκτός `auth/login` περνά από `withAuth`.
- **Ουρά μετά το run:** 1 νέο auto-buildable P2/S (item photo/attachment delete IDOR, στην κορυφή — αγγίζει live single-user data safety, ΟΧΙ dead-until-SaaS) + 3 SaaS error-handling P2/S της 49ης/50ής (dead-until-SaaS) + 1 P3/M i18n gap + 1 P3/S decision-flag (`getTenantConnection` readyState guard) στο `## Needs Achilleas`.

---

## Web Debt Queue — ενεργά items (53η σάρωση 2026-07-15)

> Σύνοψη 53ης: νέο εύρημα στο μόλις-shipped P21 document vault (item attachments) — το ίδιο ακριβώς gap προϋπήρχε ήδη στο item-photo delete, ποτέ flagged πριν. Οι 3 SaaS holdouts + το el.ts gap παραμένουν από κάτω αμετάβλητα.

### `deleteItemPhoto`/`deleteItemAttachment` — διαγράφουν οποιοδήποτε storage αρχείο δίνει ο client, χωρίς να επιβεβαιώνουν ότι ανήκει στο item
- Priority: P2
- Size: S
- Area: api
- Files: apps/web/src/app/items/actions.ts, apps/web/src/app/items/ItemDocuments.tsx
- Depends on: none
- Acceptance:
  - **Το πρόβλημα:** `deleteItemPhoto(itemId, relativePath)` (`items/actions.ts:161`) και `deleteItemAttachment(itemId, path)` (`items/actions.ts:260`, νέο στο P21 vault) είναι Next.js Server Actions — καλούνται από τον client με `itemId` + ένα raw path string (`ItemDocuments.tsx:54` περνάει το `a.path` που βλέπει στο UI, αλλά ένα server action είναι καλέσιμο με ΟΠΟΙΟΔΗΠΟΤΕ όρισμα από τον browser, όχι μόνο μέσω του κανονικού UI). Και τα δύο κάνουν `item.photos/attachments = [...].filter(p => p !== path)` (silently no-op αν δεν βρεθεί match) ΚΑΙ ΜΕΤΑ, ΑΝΕΞΑΡΤΗΤΑ από το αν κάτι πράγματι αφαιρέθηκε, καλούν `deleteFile(path)` (`lib/storage.ts:53`) που σβήνει ΟΠΟΙΟΔΗΠΟΤΕ αρχείο κάτω από `STORAGE_ROOT` όσο το path δεν κάνει `..` traversal (`resolveWithinStorage` block μόνο escape-from-root, ΟΧΙ ownership). Άρα ένα request με ένα valid-αλλά-ξένο relative path (π.χ. path άλλου item's photo, ή ενός receipt/statement/expense αρχείου — το storage tree είναι ΚΟΙΝΟ, δεν είναι tenant/item-partitioned) σβήνει το πραγματικό αρχείο στο δίσκο ΑΚΟΜΑ ΚΙ ΑΝ ποτέ δεν ανήκε στο `itemId` που δόθηκε.
  - **Γιατί έχει σημασία τώρα:** το P21 vault μόλις πρόσθεσε 2ο call site με το ΙΔΙΟ σχήμα (το photo-delete το είχε ήδη, αλλά ποτέ δεν είχε flagged σε 52 προηγούμενες σαρώσεις)· δύο ανεξάρτητα σημεία με το ίδιο gap αξίζει shared fix. Δεν είναι μόνο θεωρητικό: ένα λάθος στο client state (stale `attachments` array μετά από ένα merge/undo) ή ένα future mobile/SaaS write path θα μπορούσε να στείλει λάθος path και να σβήσει δεδομένα κάποιου άλλου item/tenant αθόρυβα (η function πάντα επιστρέφει `ok:true`).
  - **Fix:** σε ΚΑΙ ΤΑ ΔΥΟ, υπολόγισε το `found` ΠΡΙΝ το filter (`const found = item.photos.includes(relativePath)` / `item.attachments.some(a => a.path === path)`)· κάλεσε `deleteFile(...)` **μόνο όταν** `found` ήταν true· επίστρεψε `{ ok: found, photos/attachments: [...] }` (found=false → δεν αγγίζεις ΤΙΠΟΤΑ, ούτε save ούτε deleteFile). Ίδιο μικρό pattern και στα δύο, καμία αλλαγή σε response shape πέρα από το `ok` να αντανακλά πλέον σωστά αν κάτι όντως αφαιρέθηκε.
  - Μηδέν αλλαγή στο happy-path UI (το `ItemDocuments.tsx`/όποιο component καλεί το photo-delete πάντα στέλνει ένα path που ΟΝΤΩΣ υπάρχει στο item, άρα `found` είναι πάντα true στην κανονική χρήση).
  - npm run type-check exits 0
- Status: **DONE (2026-07-18, commit `82e008c` "fix(items,saas): close item photo/attachment delete IDOR; dedupe plan-key list")** — και τα δύο actions υπολογίζουν πλέον `found` (`item.photos.includes(relativePath)` / `item.attachments.some(a => a.path === path)`) πριν το filter· `return {ok:false, photos/attachments:[...]}` όταν `found` είναι false, χωρίς filter/save/deleteFile. Ακριβώς όπως speced. Confirmed live κατά τη 54η σάρωση (concurrent commit landed ενώ έτρεχε αυτό το run). (flagged αρχικά 2026-07-15, 53η σάρωση web-code-quality auditor)

---

## Σύνοψη audit (2026-07-15 52η σάρωση· type-check EXIT 0· v1 surface τυπολογικά καθαρός· 1 νέο P2 mobile-parity εύρημα [expenses v1 shape λείπει space/split] + 3 SaaS error-handling holdouts της 51ης παραμένουν ανοιχτά)

- **type-check:** `cd apps/web && npm run type-check` → **EXIT 0** (μηδέν P1 από type errors).
- **Μηδέν API commit από την 51η:** `git log --since=2026-07-10 -- apps/web/src/app/api/v1 apps/web/src/app/api/saas` = **μηδέν commit**. Οι 3 SaaS holdouts (`invites/accept` try=1 [create-race μόνο], `audit` try=0, `workspace/erasure/purge` try=0) **παραμένουν ανοιχτοί** — ο builder δεν τους κατανάλωσε. Δεν ξαναγράφονται (ήδη στην ουρά, 49η/50η σάρωση).
- **v1 surface τυπολογικά καθαρός:** fresh grep σε ολο το `src/app/api/v1` (εκτός test) → μηδέν `: any`/`as any`/`@ts-ignore`/`@ts-expect-error`. Κάθε read route `.lean()`-backed· κάθε route εκτός `auth/login` περνά από `withAuth`.
- **1 νέο εύρημα (mobile-parity/consistency, P2):** το app προσθέτει **`space` (P34, commit `6b1de5c`)** και **`split[]` (P35, commit `26eed90`)** στο `Expense` model + web `ExpensesClient`, αλλά ο **v1 mobile surface δεν τα εκθέτει ούτε τα δέχεται**. Ρίζα: (α) `expenses/serialize.ts` — ο `ExpenseLean` type + ο `trimExpense()` (μοναδική JSON shape, χρησιμοποιείται από GET list, GET [id], POST [id]/rescan, PATCH [id]) **δεν έχουν** `space`/`split` πεδία· (β) `POST /api/v1/expenses` **δεν διαβάζει** `space`/`split` από το body· (γ) `PATCH /api/v1/expenses/:id` επίσης όχι. Αποτέλεσμα: mobile client **δεν βλέπει** ποιος χρωστάει τι / σε ποιο space, **ούτε μπορεί να δημιουργήσει/επεξεργαστεί** έξοδο με split ή space tag → data drift web-vs-mobile. Flagged και στο PROGRESS.md (07-15, «suggested next: split στο v1 expenses GET shape»). Splitαρισμένο σε 2 P2/S items (read parity → write parity depends-on).
- **Ουρά μετά το run:** 2 νέα auto-buildable P2/S (expenses v1 read parity· write parity) στην κορυφή [πάνω από τους 3 dead-until-SaaS holdouts, γιατι mobile-facing = υψηλότερη αξία] + 3 SaaS error-handling P2/S της 49ης/50ής + 2 decision-flag [Achilleas] στο `## Needs Achilleas`.

---

## Web Debt Queue — ενεργά items (52η σάρωση 2026-07-15)

> Σύνοψη 52ής: v1 τυπολογικά καθαρός, type-check EXIT 0. Νέο P2 mobile-parity gap — τα P34 `space` + P35 `split` δεν περνούν στον v1 expenses surface (ούτε read ούτε write). Splitαρισμένο σε read-parity (top) + write-parity (depends-on). Οι 3 SaaS holdouts παραμένουν από κάτω (unattended-safe, dead-until-SaaS).

### v1 expenses GET/detail shape — λείπουν `space` (P34) + `split[]` (P35) → mobile δεν τα βλέπει
- Priority: P2
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/expenses/serialize.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα:** ο `trimExpense()` (γρ.17-38, μοναδική JSON shape για GET list + GET/PATCH [id] + POST [id]/rescan) δεν εκθέτει τα δύο νεότερα `Expense` πεδία: `space` (string, `models/Expense.ts:16`) και `split[]` (subdoc `{name, share, settled}`, `models/Expense.ts:37-49`). Ο `ExpenseLean` type (γρ.4-8) επίσης δεν τα δηλώνει → ένα lean read τα σβήνει σιωπηλά. Το mobile detail/list δεν μπορεί να δείξει ποιος χρωστάει τι ή σε ποιο space.
  - **Fix:** στο `ExpenseLean` πρόσθεσε `space?: string;` και `split?: { name?: string; share?: number; settled?: boolean }[];`. Στο επιστρεφόμενο object του `trimExpense` πρόσθεσε `space: e.space ?? ''` και `split: (e.split ?? []).map(s => ({ name: s.name ?? '', share: s.share ?? 0, settled: !!s.settled }))`. Ευθυγράμμισε με το web serialize (`app/expenses/lib.ts` — defensive coercion, ίδιο shape).
  - Το GET list (`route.ts`), GET/PATCH `[id]/route.ts`, POST `[id]/rescan/route.ts` παίρνουν αυτόματα τα νέα πεδία (όλα καλούν `trimExpense`). Μηδέν αλλαγή στα call sites.
  - Επαλήθευση: `grep -c "space\|split" apps/web/src/app/api/v1/expenses/serialize.ts` → ≥2· ένα GET /api/v1/expenses επιστρέφει `space` + `split[]` σε κάθε expense object.
  - npm run type-check exits 0
- Status: DONE (2026-07-12, pharos-daily-dev, commit `b4f32af`) — `ExpenseLean`/`trimExpense()` πλέον εκθέτουν `space`/`split[]` (μέσω νέου exported `cleanSplit` στο `lib/split.ts`, reused από web+v1). +9 νέα tests στο `serialize.test.ts`.

### v1 expenses POST + PATCH — δέχονται `space` + `split[]` (write parity)
- Priority: P2
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/expenses/route.ts, apps/web/src/app/api/v1/expenses/[id]/route.ts
- Depends on: v1 expenses GET/detail shape — λείπουν `space` (P34) + `split[]` (P35)
- Acceptance:
  - **Το πρόβλημα:** `POST /api/v1/expenses` (`route.ts:43-56`) και `PATCH /api/v1/expenses/:id` (`[id]/route.ts:18-30`) δεν διαβάζουν `space`/`split` από το body → το mobile δεν μπορεί να δημιουργήσει ή να επεξεργαστεί έξοδο με space tag ή split. Το web `app/expenses/actions.ts` τα χειρίζεται ήδη (μέσω `cleanSplit` + UpdateSchema).
  - **Fix (POST):** στο `Expense.create({...})` πρόσθεσε `space: strField(b, 'space', '')` και `split: cleanSplit(b.split)`. Επαναχρησιμοποίησε τη λογική καθαρισμού από `app/expenses/actions.ts` (`cleanSplit`: trim name, drop nameless, round cents στο share, coerce settled) — export-άρισέ την αν δεν είναι ήδη exported ώστε να μην διπλασιαστεί (μην αντιγράψεις inline).
  - **Fix (PATCH):** στο `set` object πρόσθεσε guarded `if (typeof b.space === 'string') set.space = b.space;` και `if (Array.isArray(b.split)) set.split = cleanSplit(b.split);` (ίδιο pattern με τα υπόλοιπα optional set fields).
  - Οι responses παραμένουν `trimExpense` (γεμίζουν από το read-parity item) → round-trip create/patch → read δείχνει space/split.
  - Επαλήθευση: POST με `{vendor, amount, space:"Εξοχικό", split:[{name:"Νίκος", share:20}]}` → 201 + read-back δείχνει space + split· `grep -c "cleanSplit\|space" apps/web/src/app/api/v1/expenses/route.ts` ≥2.
  - npm run type-check exits 0
- Status: DONE (2026-07-12, pharos-daily-dev, commit `b4f32af`) — POST δέχεται `space` (trim+cap 40) + `split` (νέο `parseSplitField()` στο serialize.ts)· PATCH ίδιο guarded pattern με τα υπόλοιπα optional πεδία. +16 νέα tests στα route.test.ts/[id]/route.test.ts. Mobile `api.ts` Expense type + addExpense/updateExpense params ενημερώθηκαν παράλληλα (type parity).

---

## Σύνοψη audit (2026-07-10 51η σάρωση· type-check EXIT 0· v1 surface 100% καθαρός· μηδέν νέο εύρημα· μηδέν API commit από την 50η — 3 SaaS error-handling holdouts παραμένουν ανοιχτά)

- **type-check:** `cd apps/web && npm run type-check` → **EXIT 0** (μηδέν P1 από type errors).
- **Μηδέν αλλαγή στο API surface από την 50η σάρωση:** `git log --since=2026-07-08 -- apps/web/src/app/api/v1 apps/web/src/app/api/saas` = **μηδέν commit**. Ο builder δεν κατανάλωσε κανένα από τα 3 ανοιχτά items αυτό το διάστημα.
- **v1 API 100% καθαρός** (51 route files, fresh grep): μηδέν `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ολο το `src/app/api/v1` (εκτός test)· κάθε read route `.lean()`-backed· κάθε route εκτός `auth/login` περνά από `withAuth` (σωστά — το login είναι public). Τα δύο μοναδικά body-reading routes (`auth/login`, `items/[id]/ai-fill`) κάνουν και τα δύο **guarded** JSON parse (try/catch → `apiError`/default) + manual field validation· δεν είναι validation gap. Το `items/[id]/ai-fill` έχει και `isObjectId` gate + `withAuth` → καθαρό.
- **Επιβεβαίωση προηγούμενων κλεισιμάτων (still-closed, live-verified):**
  - **[48η σάρωση] Guardless DB-touching SaaS reads+cron** (`usage`, `billing`, `auth/session`, `usage/sample`, `trials/sweep`): `grep -c saasGuard` = 2 σε καθένα (wrapped) → uniform `{ error }` JSON σε mid-handler throw. Παραμένει DONE.
  - **[canonical queue, P2/M] Tenant `status:'canceled'`/`'suspended'` enforcement**: `workspaceSession.ts:84` καλεί `workspaceStatusError(tenant.status)` → 403 για canceled/suspended (ρητό opt-out στα cancel/reactivate paths). Το control-plane μισό μπλοκάρει πρόσβαση· παραμένει DONE (το v1-data-path σκέλος ζει στο `## Needs Achilleas`, εξαρτάται από tenant-scoped v1).
  - **search-actions.ts typing** (P3/S): `grep -c 'as any'` = 1 και είναι **σχόλιο** (γρ.23), μηδέν runtime cast. Παραμένει DONE.
- **Μηδέν νέο εύρημα.** Fresh full-scan σε ΟΛΑ τα SaaS routes (`saasGuard`==0 ΚΑΙ `try`==0 ΚΑΙ DB-touching) βγάζει **1 μόνο** genuinely-unguarded με inline DB ops: `audit/route.ts` (db:6) — ήδη flagged (49η). Τα `erasure/purge` (καλεί `runErasurePurgeScan()` unguarded, δεν πιάνεται από inline-DB grep αλλά throw-άρει στον scheduler) + `invites/accept` (try=1 μόνο create-race· top-level body unguarded) επιβεβαιωμένα ανοιχτά.
- **Νέο P22 helper `lib/receiptSearch.ts` (untracked WIP του Αχιλλέα) audit read-only:** pure, fully-typed (`LineItemLike`, non-global RegExp contract documented), μηδέν `any`, μηδέν DB. Καθαρό — δεν μπαίνει στην ουρά.
- **Ουρά μετά το run:** 3 auto-buildable TODO, ολα P2/S ίδιας κλάσης (SaaS control-plane error-handling: `audit`, `workspace/erasure/purge`, `invites/accept`) — μηχανικά try/catch wraps, unattended-safe, dead-until-SaaS. Μηδέν P1/P2-blocking στον v1 mobile surface. 2 decision-flagged P3 στο `## Needs Achilleas` (reset-request timing side-channel· getTenantConnection readyState guard) παραμένουν.

## Σύνοψη audit (2026-07-09 50η σάρωση· type-check EXIT 0· v1 surface 100% καθαρός· 2 items της 49ης ακόμα ανοιχτά + 1 νέο SaaS error-handling εύρημα [invites/accept])

- **50η σάρωση (2026-07-09):** `cd apps/web && npm run type-check` → **EXIT 0**. v1 API **αμετάβλητος + καθαρός**: μηδέν `any`/`as any`/`@ts-ignore` στο `src/app/api/v1` (εκτός test), κάθε read route `.lean()`-backed (find=lean σε receipts/settings/tasks/calendar/expenses/cards/subscriptions/statements/vouchers), κάθε v1 route εκτός `auth/login` περνά από `withAuth`. Τα 2 items της 49ης (`audit/route.ts`, `workspace/erasure/purge`) **παραμένουν ανοιχτά** (`grep -c 'try {'` = 0 και στα δύο). **1 νέο εύρημα:** `invites/accept` (SaaS write route, 8 DB touches) — το μοναδικό του `try` (γρ.65) καλύπτει ΜΟΝΟ τη create-dup race, ΟΧΙ τα υπόλοιπα ~7 DB ops → guardless (διορθώνει την ανακριβή σημείωση της 45ης γραμμής «invites/accept έχει ήδη δικό του try/catch»). Νέο item κάτω.
- **type-check:** `cd apps/web && npm run type-check` → **EXIT 0** (μηδέν P1 από type errors).
- **Builder έκλεισε 2 items** από τον προηγ. marker (live-verified): (α) **v1 `auth/login` apiError swap** (γρ.6 import + γρ.29/33/38 `apiError(...)`· το μοναδικό inline-error v1 route ενοποιήθηκε) → **DONE**· (β) **SaaS try/catch slice 2/2** (members + invites/resend + billing/checkout + billing/portal + auth/login + auth/signup όλα `saasGuard`-wrapped τώρα· `grep -c saasGuard` = 2-5 ανά route, `try {` = 0) → το item 565 κλείνει **DONE πλήρως** (κάθε SaaS **write** route περνά από `saasGuard`).
- **2 νέα auto-buildable ευρήματα (fresh grep, όχι docs):**
  - **[P2/S] Guardless DB-touching SaaS read+cron routes** — `usage` (dbTouch 9), `billing` (dbTouch 8), `auth/session` (dbTouch 5), `usage/sample` (cron, dbTouch 2), `trials/sweep` (cron, dbTouch 2) κάνουν `connectDB()`+Mongoose queries (accountTenants/getTenantContext/currentUsage/Tenant.findById/Account.findById/sampleAllTenants/runTrialLapseSweep) **χωρίς `saasGuard` ΚΑΙ χωρίς `try/catch`** → ένα mid-handler DB throw (Mongo failover / net blip) γυρίζει Next HTML 500 αντί για το uniform `{ error }` JSON. Οι προηγ. σαρώσεις (item 565) τα εξαίρεσαν σκόπιμα ως «rarely throw» — αλλά και τα 5 κάνουν non-trivial DB work, οπότε αξίζει η ενοποίηση για πλήρη shape-consistency. Νέο item παρακάτω.
  - **[P3/S] `search-actions.ts` 7× `as any[]`** — τα 7 `.lean()` results (items/receipts/statements/tasks/subs/expenses/vouchers) γίνονται iterate ως `as any[]` (γρ.67/78/88/98/108/118/129), παρακάμπτοντας το type-checking στα πεδία που διαβάζονται (`_id`, `status`, `store`, `total`, κ.λπ.). Είναι το μοναδικό μη-infra `as any` σε όλο το `src` (τα `softDelete.ts:38` Mongoose pre-hook override + τα tenancy σχόλια είναι false positives). Νέο item παρακάτω.
- **Ουρά μετά το run:** 2 auto-buildable TODO (P2/S saasGuard reads/cron, P3/S search-actions typing) + 2 decision-flag [Achilleas] (reset-request timing side-channel· getTenantConnection readyState guard· αμφότερα code-verified ανοιχτά).
- **Καθαρό αλλού (fresh grep):** κάθε v1 read route `.limit(p.limit)`+`.lean()` (τα no-limit calendar/settings/cards/reports/overview είναι single-tenant bounded aggregations, prior-accepted)· hot-path indexes καλυμμένα (`User.apiToken index:true`, `Notification` field-indexes, `Tenant`/`Account` sparse indexes)· mcp + files routes gated (bearer / session-ή-bearer)· κάθε v1 route εκτός `auth/login` περνά από `withAuth`. Card/Store `findOne({name/last4})` χωρίς index = tiny single-user collections, ΟΧΙ debt.

---

## Web Debt Queue — ενεργά items (50η σάρωση 2026-07-09)

> Σύνοψη 50ής: v1 surface **100% καθαρός** (type/validation/auth/mongoose/dup = 0· type-check EXIT 0). Τα 2 SaaS error-handling items της 49ης (`audit`, `erasure/purge`) **ακόμα ανοιχτά** (builder δεν τα κατανάλωσε — παραμένουν top). 1 νέο εύρημα ίδιας κλάσης (`invites/accept` guardless write route) — μηχανικό, unattended-safe wrap.

### `invites/accept/route.ts` — write route με 8 DB touches guardless (μόνο η create-race έχει try/catch)
- Priority: P2
- Size: S
- Area: api
- Files: apps/web/src/app/api/saas/invites/accept/route.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα:** το POST (`invites/accept/route.ts:34`) κάνει ~8 DB ops μετά το token gate: `Invite.findOne` (γρ.44), `Account.findOne` (γρ.55), `Membership.findOne` (γρ.84), `Membership.updateOne`/`create` (γρ.88/93), `Invite.updateOne` (γρ.103), `recordAudit` (γρ.110), `setAccountCookie` (γρ.117), `accountTenants` (γρ.122). Το ΜΟΝΟ `try` (γρ.65-71) τυλίγει αποκλειστικά τη `Account.create` dup-race (11000 → re-fetch)· ΟΛΑ τα υπόλοιπα DB ops είναι **αγύριστα**. Ένα mid-handler throw (Mongo failover / net blip) βγαίνει ως Next default HTML 500 αντί για το `{ error }` JSON shape που παίρνει κάθε άλλο SaaS route. Δεν χρησιμοποιεί `saasGuard` (public token-driven path, όχι session ladder), άρα χρειάζεται plain try/catch wrap του σώματος — όχι `saasGuard`.
  - **Fix:** τύλιξε το σώμα μετά το token/invite validation gate σε `try { ... } catch (e) { return NextResponse.json({ error: (e as Error).message?.slice(0,200) || 'Server error' }, { status: 500 }); }`. Κράτα το υπάρχον inner `try/catch` της create-race ως έχει (nested)· τα early-return validation gates (invalid token 400/401, expired invite, seat-cap 409) ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν. Αλλάζει ΜΟΝΟ ο unexpected throw → καθαρό `{ error }` 500.
  - SaaS-only (SAAS_MODE off = 404 upstream), μηδέν επίδραση στον v1 mobile surface. Διορθώνει και την ανακριβή σημείωση στη γρ.45 του `erasure/purge` item («invites/accept έχει ήδη δικό του try/catch» — ισχύει μόνο για την create-race).
  - Επαλήθευση: `grep -c 'try {' apps/web/src/app/api/saas/invites/accept/route.ts` → ≥2 (create-race + νέο top-level).
  - npm run type-check exits 0
- Status: DONE (fixed 2026-07-24, saas-core routine, increment 85) — το σώμα μετά το `token`/`connectDB()` gate (Invite lookup + validity 410, account resolve/create [με το προϋπάρχον nested create-race try/catch αμετάβλητο], membership upsert, invite-consume, audit, cookie, response) τυλίχτηκε σε top-level `try { ... } catch (e) { return NextResponse.json({ error: (e as Error).message?.slice(0,200) || 'Server error' }, { status: 500 }); }`, ίδιο shape με τα `saasGuard`-wrapped routes. Τα early-return validation gates (missing-token 400, invalid/expired-invite 410, weak-password 400) ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν (μέσα στο try, όπως speced — και το `Invite.findOne`/`connectDB()` μπορούν να throw). Verified: `grep -c 'try {' apps/web/src/app/api/saas/invites/accept/route.ts` → **2** (create-race + νέο top-level). `npm run type-check` EXIT 0, full `npx vitest run` → **226 files / 2936 tests green**. Docker: δεν έγινε rebuild (logic-only edit μέσα σε ήδη-existing route, καμία αλλαγή σε runtime wiring/env/dependency· ο live container του Achilleas δεν έχει SAAS_MODE set). Browser-verify: skipped (backend-only, μηδέν UI).

---

## Web Debt Queue — ενεργά items (49η σάρωση 2026-07-09)

> Σύνοψη 49ης: v1 surface **αμετάβλητος** από την 48η (`git log --since=2026-07-06 -- apps/web/src/app/api/v1` = μηδέν commit) και **100% καθαρός** (type/validation/auth/mongoose/dup = 0). Οι 2 recommendations της 48ης έκλεισαν: SaaS guardless reads/cron → **DONE** (`d0c9364`), search-actions typing → **DONE** (`d9af6d0`). type-check → **EXIT 0**. 2 νέα ευρήματα, αμφότερα SaaS control-plane error-handling holdouts (dead-until-SaaS, unattended-safe μηχανικά wraps).

### `audit/route.ts` — DB-touching session-gated read χωρίς try/catch → HTML 500 αντί `{ error }`
- Priority: P2
- Size: S
- Area: api
- Files: apps/web/src/app/api/saas/audit/route.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα:** το GET (`audit/route.ts:41`) κάνει δύο `await` DB reads (`AuditEvent.find(...).lean()` γρ.64 + `Account.find({ _id: { $in: actorIds } }).lean()` γρ.79) **μετά** το `resolveWorkspaceSession` gate, αλλά **χωρίς try/catch**. Ο κώδικας είναι καλογραμμένος (batched actor lookup = μηδέν N+1, `.select()`+`.limit()`+`.lean()`), όμως ένα thrown DB error (Mongo failover / connection drop) βγαίνει ως Next default HTML 500, ΟΧΙ ως το `{ error }` JSON shape. Δεν χρησιμοποιεί `saasGuard` γιατί το gating είναι session-based (`resolveWorkspaceSession`, 404/401/403), όχι το standard workspace-session ladder των write routes — άρα χρειάζεται plain try/catch, όχι `saasGuard` wrap.
  - **Fix:** τύλιξε το σώμα μετά το gate (`if ('response' in resolved) return resolved.response;`) σε `try { ... } catch (e) { return NextResponse.json({ error: (e as Error).message?.slice(0,200) || 'Server error' }, { status: 500 }); }`. Ίδιο shape με το `withAuth`/`saasGuard` catch.
  - Το gate ladder (404 SAAS off / 401 no-session / 403 non-admin), το serializer whitelist projection, το keyset-pagination cursor + η batched actor resolution ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν· αλλάζει ΜΟΝΟ ο unexpected throw → καθαρό `{ error }` 500. SaaS-only (SAAS_MODE off = 404), μηδέν επίδραση στον v1 mobile surface.
  - Επαλήθευση: `grep -c 'try {' apps/web/src/app/api/saas/audit/route.ts` → ≥1.
  - npm run type-check exits 0
- Status: DONE (fixed 2026-07-24, saas-core routine, increment 85) — το σώμα μετά το `resolveWorkspaceSession` gate (limit/cursor parsing, `AuditEvent.find`, batched actor `Account.find`, response) τυλίχτηκε σε `try { ... } catch (e) { return NextResponse.json({ error: (e as Error).message?.slice(0,200) || 'Server error' }, { status: 500 }); }`, ίδιο shape με `withAuth`/`saasGuard`. Το gate ladder (404/401/403), το projection whitelist, το keyset cursor και η batched actor-lookup ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν. Verified: `grep -c 'try {' apps/web/src/app/api/saas/audit/route.ts` → **1**. `npm run type-check` EXIT 0, full `npx vitest run` → **226 files / 2936 tests green**. Docker: δεν έγινε rebuild. Browser-verify: skipped (backend-only, μηδέν UI).

### `workspace/erasure/purge/route.ts` — cron scan χωρίς try/catch → HTML 500 στον scheduler
- Priority: P2
- Size: S
- Area: api
- Files: apps/web/src/app/api/saas/workspace/erasure/purge/route.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα:** το POST (γρ. μετά το CRON_SECRET token gate) κάνει `const result = await runErasurePurgeScan();` (report-only GDPR Art. 17 scan) **χωρίς try/catch**. Αν το scan throw-άρει (DB access σε control-plane Tenant collection), ο scheduler λαμβάνει Next HTML 500 αντί για το `{ error }` JSON που παίρνει κάθε άλλο cron route. Είναι holdout της ίδιας κλάσης με τα cron routes που τυλίχτηκαν στο `d0c9364` (`usage/sample`, `trials/sweep`) — απλώς δεν ήταν στο σετ εκείνης της σάρωσης.
  - **Fix:** τύλιξε το `await runErasurePurgeScan()` (μετά το `saasMode()`/`CRON_SECRET`/token gate που επιστρέφουν early χωρίς throw) σε `try { const result = await runErasurePurgeScan(); return NextResponse.json({ ok: true, ...result }); } catch (e) { return NextResponse.json({ error: (e as Error).message?.slice(0,200) || 'Server error' }, { status: 500 }); }`.
  - Τα gates (404 SAAS off / 500 no CRON_SECRET / 401 bad token) + το report-only `dryRun:true` contract ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν· αλλάζει ΜΟΝΟ ο unexpected throw → καθαρό `{ error }` 500. SaaS-only, μηδέν επίδραση στον v1 mobile surface. (`auth/logout` = μηδέν DB read [μόνο `clearAccountCookie`] → σκόπιμα εκτός· `billing/webhook`+`invites/accept` έχουν ήδη δικό τους try/catch.)
  - Επαλήθευση: `grep -c 'try {' apps/web/src/app/api/saas/workspace/erasure/purge/route.ts` → ≥1.
  - npm run type-check exits 0
- Status: DONE (fixed 2026-07-24, saas-core routine, increment 85) — `await runErasurePurgeScan()` (μετά το `saasMode()`/`CRON_SECRET`/token gate που ήδη επιστρέφουν early χωρίς throw) τυλίχτηκε σε `try { const result = await runErasurePurgeScan(); return NextResponse.json({ ok: true, ...result }); } catch (e) { return NextResponse.json({ error: (e as Error).message?.slice(0,200) || 'Server error' }, { status: 500 }); }`. Τα gates + το report-only `dryRun:true` contract ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν. Verified: `grep -c 'try {' apps/web/src/app/api/saas/workspace/erasure/purge/route.ts` → **1**. `npm run type-check` EXIT 0, full `npx vitest run` → **226 files / 2936 tests green**. Docker: δεν έγινε rebuild. Browser-verify: skipped (backend-only cron route, μηδέν UI).

---

## Web Debt Queue — ενεργά items (48η σάρωση 2026-07-06)

### Guardless DB-touching SaaS read + cron routes → ασυνεπές HTML 500 αντί `{ error }`
- Priority: P2
- Size: S
- Area: api
- Files: apps/web/src/app/api/saas/usage/route.ts, apps/web/src/app/api/saas/billing/route.ts, apps/web/src/app/api/saas/auth/session/route.ts, apps/web/src/app/api/saas/usage/sample/route.ts, apps/web/src/app/api/saas/trials/sweep/route.ts
- Depends on: none (ο helper `saasGuard` υπάρχει ήδη στο `lib/tenancy/saasApi.ts`, χρησιμοποιείται σε ΟΛΑ τα write SaaS routes)
- Acceptance:
  - **Το πρόβλημα:** το item 565 έκλεισε το try/catch effort για τα SaaS **write** routes, αλλά τα εναπομείναντα DB-touching routes μένουν χωρίς `saasGuard` ΚΑΙ χωρίς `try/catch`: `usage/route.ts` (accountTenants+getTenantContext+currentUsage), `billing/route.ts` (accountTenants+getTenantContext+Tenant.findById), `auth/session/route.ts` (Account.findById+accountTenants), `usage/sample/route.ts` (sampleAllTenants), `trials/sweep/route.ts` (runTrialLapseSweep). Ένα thrown DB error (Mongo failover, connection drop) βγαίνει ως Next default HTML 500, ΟΧΙ ως το `{ error }` JSON shape που περιμένει κάθε άλλος client-consumer.
  - **Fix:** τύλιξε το σώμα κάθε handler (μετά το `saasAuthGate()`/token-gate, που επιστρέφουν early χωρίς throw) σε `return saasGuard(async () => { ...υπάρχον σώμα... })`. Ίδιο pattern με τα write routes (`saasGuard` mirror του `withAuth` catch). Import `{ saasGuard }` από `@/lib/tenancy/saasApi` όπου λείπει.
  - Response shapes (200 payloads, gate 401/404/403 short-circuits, cron `{ ok, ...result }`) + η σειρά των gate ladders ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν· αλλάζει ΜΟΝΟ η συμπεριφορά σε **unexpected throw** → καθαρό `{ error }` 500. SaaS-only, μηδέν επίδραση στον v1 mobile surface.
  - ΣΗΜ: αυτό ξαναεξετάζει τη σκόπιμη «read-only exemption» του item 565 (row DONE slice 2/2). Δικαιολογία revisit: και τα 5 κάνουν non-trivial DB work → «rarely throw» δεν σημαίνει «ποτέ». `auth/logout` (μηδέν DB) + `audit`/`invites` GET (ήδη έχουν gate που δεν throw-άρει σε happy path) ΜΠΟΡΟΥΝ να μείνουν εκτός· focus στα 5 DB-touching.
  - Επαλήθευση: `for f in usage billing auth/session usage/sample trials/sweep; do grep -c saasGuard "apps/web/src/app/api/saas/$f/route.ts"; done` → όλα ≥1.
  - npm run type-check exits 0
- Status: DONE (2026-07-06 builder — και τα 5 routes τυλιγμένα σε `saasGuard` μετά το gate/token ladder· `grep -c saasGuard` = 2 σε καθένα· type-check EXIT 0· 1555 tests green· safe Docker rebuild `/login` 200 + κάθε route JSON 401 [ΟΧΙ HTML]· builder cache −2.12GB)

### `search-actions.ts` — 7× `as any[]` παρακάμπτουν το type-checking στα lean results
- Priority: P3
- Size: S
- Area: shared
- Files: apps/web/src/app/search-actions.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα:** το `searchAll` κάνει 7 `.lean().select(...)` queries και μετά iterate κάθε result ως `for (const it of items as any[])` (γρ.67/78/88/98/108/118/129). Το `as any[]` σβήνει το type-checking στα πεδία που διαβάζονται (`it._id`, `it.status`, `it.currentPrice`, `rc.store`, `rc.total`, `st.card`, `st.period`, κ.λπ.) → ένα typo ή schema drift δεν πιάνεται από τον compiler. Είναι το μοναδικό μη-infra `as any` σε όλο το `src`.
  - **Fix:** δήλωσε ανά query ένα narrow lean type (π.χ. `type ItemHit = { _id: unknown; title?: string; status?: string; currentPrice?: number; purchasedPrice?: number }`) που ταιριάζει με το `.select(...)` projection, και κάνε cast το result του `.lean()` σε `ItemHit[]` (ή annotate το `Promise.all` destructuring). Αντικατέστησε τα 7 `as any[]` με τα typed arrays. Το ίδιο pattern χρησιμοποιείται ήδη στα v1 routes (`.lean() as ItemLean[]`).
  - Το output (`SearchHit[]` shape: type/id/title/subtitle/href) + η ranking σειρά + τα `cur()`/`OWNED_STATUSES` reads ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν· καθαρά type-safety, μηδέν αλλαγή συμπεριφοράς.
  - Μηδέν `as any` απομένει στο `search-actions.ts` (`grep -c 'as any' apps/web/src/app/search-actions.ts` = 0).
  - npm run type-check exits 0
- Status: DONE (verified 2026-07-09, 49η σάρωση) — ο builder το κατανάλωσε στο commit `d9af6d0` («refactor(search): type search-actions lean projections, drop 7× as any[]»)· live: `grep -c 'as any\[\]' src/app/search-actions.ts` = **0** (το εναπομείναν match στη γρ.22 είναι σχόλιο που περιγράφει το παλιό cast). Τα 7 lean results φέρουν πλέον narrow projection types· output shape/ranking αμετάβλητα.

---

## Σύνοψη audit (2026-07-04 46η σάρωση· type-check EXIT 0· builder έκλεισε 2 items → ουρά 4→2· ΚΑΙ ΤΑ 2 εναπομείναντα είναι decision-flag [Achilleas], ΜΗΔΕΝ auto-buildable αριστερά)

- **type-check:** `npm run type-check` → **EXIT 0** (μηδέν P1 από type errors).
- **Builder έκλεισε 2 items** από τον προηγ. marker: (α) **saasGuard invites GET+DELETE** (commit `388246d` — live-verified: import γρ.13, GET(45)+DELETE(106) wrapped· κάθε write saas route πλέον `saasGuard`)· (β) **Account sparse index** verify/reset token-hash (commit `ac35ca3` — live-verified: `AccountSchema.index(...sparse)` γρ.37/38). Και τα δύο → **DONE**.
- **Ουρά τώρα:** 2 TODO, **και τα δύο decision-flag** (θέλουν σκόπιμη απόφαση Achilleas, ΟΧΙ μηχανικό unattended fix): (1) reset/request timing side-channel [P3/S — delivery-semantics tradeoff: `void sendEmail` vs `await`]· (2) getTenantConnection readyState guard [P3/S — ambiguous rebuild-semantic, 0 importers]. **Και τα δύο code-verified ανοιχτά** (`reset/request/route.ts:43` fast-path return· `connection.ts:54` `readyState !== 99`).
- **Νέα surface audited → exemplary, μηδέν νέο debt:** `lib/billing/costSummary.ts` (pure micros→currency roll-up, defensive `nonNegInt` coercion, tested) + `saas/usage/route.ts` cost block (`buildCostSummary` imported+used, καθαρό `{ error }` shapes, saasGuard-gate). v1 API sweep: κάθε route εκτός `auth/login` περνά από `withAuth` (try/catch + consistent `apiError`)· login έχει own try/catch + validation· μηδέν `any`/`@ts-ignore` σε v1· `readBody`/`apiBody` validators υιοθετημένα καθολικά.
- **ΣΗΜ builder-feed:** η ουρά έμεινε ΧΩΡΙΣ auto-buildable item. Δες `## Needs Achilleas` στο PROGRESS.md — τα 2 εναπομείναντα θέλουν έγκριση κατεύθυνσης πριν καταναλωθούν.

## Σύνοψη audit (2026-07-03 40η σάρωση· CONFIRMATION· type-check EXIT 0· μηδέν νέο P1/P2/P3· ουρά 3 ενεργά TODO αμετάβλητη — και τα 3 code-verified ανοιχτά· νέα surface [`lib/billing/aiKeyPolicy.ts` BYO-key policy + `Tenant.aiByoKey` flag + billing-audit helpers] audited → exemplary, μηδέν νέο debt)

**2026-07-03 (40η σάρωση, αυτόνομος γύρος):** fresh live σάρωση (grep, όχι docs) σε **50 v1 route files** + **23 saas route files** + `apiAuth`/`apiBody`/`apiList` + `lib/tenancy/*` + `lib/billing/*` + `models/*`. Νέα surface από την 39η: `7a533b4` (BYO-key AI policy), billing-audit helpers (`2bdf29d`/`a4c1fd3` checkout/portal audit recording), test-only files. `cd apps/web && npm run type-check` **EXIT 0** (0 TS errors).
- **Ευρήματα ανά διάσταση (live grep):**
  - **Type safety: 0** — `grep -rnE ': any|as any|@ts-ignore|@ts-nocheck'` (εκτός `.test.ts`, εκτός σχολίων) = **1 hit** = `softDelete.ts:25` `schema.pre(hook as any, …)`, canonical Mongoose pre-hook union-overload workaround (eslint-disabled, pre-existing infra· `this: Query<unknown,unknown>` σωστά τυπωμένο). ΟΧΙ νέο debt.
  - **Input validation: 0 gaps** — `grep -rn 'req.json()' src/app/api` = **3 σκόπιμα** (auth/login boundary try/catch, items/[id]/ai-fill safe-cast `as {mode?:unknown}`, mcp protocol). Μηδέν `req.json().catch` (readBody adoption 100%). BYO-key path καθαρός.
  - **Auth: 0 unguarded** — v1 routes ΧΩΡΙΣ `withAuth`/`bearerUser` = **1** = `auth/login` (σωστά exempt). saas routes ΧΩΡΙΣ `saasGuard` = 9, όλα documented deliberate exemptions (read-only usage/audit/billing-GET/session/logout, own-handling webhook/invites-accept) ΕΚΤΟΣ του `invites/route.ts` = active P3/S item #1.
  - **Error handling: 0 νέα** — billing-audit code = pure helpers καλούμενα ΜΕΣΑ σε ήδη-`saasGuard`-wrapped checkout/portal routes. Το invites GET/DELETE gap αμετάβλητο (existing P3/S item).
  - **Mongoose: 0 νέα** — N+1 (`.map(async`/`.forEach(async`) σε api = **0**. Ολα τα v1 list routes `.limit(p.limit)` + `.lean()`. Το `calendar/route.ts:48` `Statement.find().lean()` είναι unbounded ΑΛΛΑ **ΟΧΙ debt**: το calendar χρειάζεται ΟΛΑ τα statements για installment-plan aggregation (limit θα έσπαγε τα projected δόσεις), low-cardinality (≈1/κάρτα/μήνα), `.lean()`. BYO-key wiring = flag-read μόνο (μηδέν extra query).
  - **Duplication/dead code: 0 νέα.**
- **Νέος κώδικας = exemplary.** `aiKeyPolicy.ts` = pure module (type-only import, μηδέν DB/Stripe/secret), `isByoKey`/`aiKeyMode`/`meterAiUsage`/`unmeteredAiQuota` fail-closed (μη-true → metered), OSS-parity-aware, unit-tested (928/928 green). `Tenant.aiByoKey` default false (additive, flag-guarded — SAAS-off/default tenant ποτέ δεν χτυπά το BYO branch). Μηδέν νέο debt.
- **Ουρά αμετάβλητη (3 ενεργά TODO, όλα code-verified ανοιχτά):** (1) **P3/S** `invites/route.ts` GET(43)+DELETE(102) χωρίς `saasGuard` — top auto-buildable. (2) **P3/S** sparse index `Account.verifyTokenHash/resetTokenHash` (`Account.ts:24,26` χωρίς `.index()`). (3) **P3/S** `reset/request/route.ts` timing side-channel (no-account fast-path `return {ok:true}` πριν mint+store+mail) — decision. + Needs Achilleas: v1 data-path tenant-status enforcement (P2/M, decision), connection cache-reuse guard (P3, decision). **40η συνεχόμενη σάρωση χωρίς P1· μηδέν νέο item.** Top-2 για builder: (α) **invites saasGuard** [P3/S]· (β) **Account token-hash sparse index** [P3/S].

## Reviewer note (2026-07-03· range 53b861a..2f31c5d· P2/M tenant-status ΜΕΡΙΚΩΣ έκλεισε)
- **Item #1 (P2/M tenant `status:'canceled'/'suspended'` δεν επιβάλλεται) → DOING, μερική κάλυψη.** Το `b911882` πρόσθεσε fail-closed `workspaceStatusError` guard στο `resolveWorkspaceSession` (`lib/tenancy/workspace.ts` + `workspaceSession.ts`), tested (15 refs στο `workspace.test.ts`, 19/19 green). **Καλύπτει ΜΟΝΟ τα workspace-management routes** (members/audit/invites/rename → 403 σε suspended/canceled/pending· GET+DELETE opt-out με `allowInactive` για view + idempotent cancel). Το commit msg είναι ειλικρινές για το scope.
- **Παραμένει ανοιχτό:** το v1 app-data path (`getTenantContext`, `lib/tenancy/context.ts:63` διαβάζει `status` αλλά ΔΕΝ κάνει gate) → ένα canceled/suspended workspace κρατά πλήρη πρόσβαση στα δικά του δεδομένα (receipts/items/expenses/…). **Design decision (block read+write στο v1 path ή μόνο write)** → μένει P2/M, ΟΧΙ small-safe. Ο builder ας ΜΗΝ ξανα-υλοποιήσει το management-route κομμάτι (έγινε).
- **UPDATE 2026-07-03 (38η σάρωση):** το reactivate UX ΕΚΛΕΙΣΕ — νέο `POST /api/saas/workspace/reactivate` (`bbb09d1`, owner-only `canReactivateWorkspace`, `allowInactive` resolve ώστε ο canceled tenant να φτάνεται, `reactivateStatusError` 409 guard [μόνο `canceled`→`active`, ΟΧΙ `suspended`], `saasGuard` wrap, audit `workspace.reactivated`). Το lifecycle soft-cancel↔reactivate είναι πλέον πλήρες στο control plane. Άρα ένας owner που κατά λάθος cancel-άρει έχει δρόμο επιστροφής → το να μπλοκάρει το v1 data path είναι τώρα **ασφαλές να υλοποιηθεί**, αλλά το read-vs-write scope παραμένει product decision. **Το P2/M item δεν άλλαξε priority, μόνο ο reactivate-blocker λύθηκε.**

## Σύνοψη audit (2026-07-03 38η σάρωση· CONFIRMATION· type-check EXIT 0· μηδέν νέο P1/P2/P3· ουρά 5 TODO αμετάβλητη — και τα 5 code-verified ανοιχτά· νέα surface [`saas/workspace/reactivate` route + `workspace.ts` reactivate helpers + `audit.ts` batched actor lookup] audited → exemplary, μηδέν νέο debt)

**2026-07-03 (38η σάρωση, αυτόνομος γύρος):** fresh live σάρωση (grep, όχι docs) σε **50 v1 route files** + **23 saas route files** (+1: `workspace/reactivate`) + `apiAuth`/`apiBody`/`apiList` + `lib/tenancy/*` + `lib/billing/*` + `models/*`. `git diff --name-only 2f31c5d..HEAD` (από την 37η) = **1 νέο route** (`saas/workspace/reactivate/route.ts`) + `lib/tenancy/{workspace,audit}.ts` (additive helpers) + test files. `npm run type-check` **EXIT 0** (0 TS errors).
- **Ευρήματα ανά διάσταση (live grep):**
  - **Type safety: 0** — `grep -rnE ': any|as any|@ts-ignore|@ts-expect-error' src/app/api src/lib/tenancy src/lib/billing` (εκτός `.test.ts`) = **4 hits, ΟΛΑ false positives** (η λέξη «any»/«active member» σε σχόλια: `workspace/route.ts:108`, `workspace/reactivate/route.ts:38`, `workspace.ts:41,86`· μηδέν type). Το reactivate route πλήρως τυπωμένο (`workspaceView` whitelisted projection, μηδέν billing-id leak).
  - **Input validation: 0 gaps** — `grep -rln 'req.json().catch' src/app/api` = **μηδέν** (readBody adoption 100%). reactivate: `readBody`+`strField(body,'tenant').trim()||null`, canonical gate ladder.
  - **Auth: 0 unguarded** — κάθε v1 route matches `withAuth`/`apiAuth` (μόνο `auth/login` exempt). reactivate gated: `resolveWorkspaceSession(tenant, false, allowInactive=true)` (SAAS-off 404 / unauth 401) → owner-only `canReactivateWorkspace` (403) → `reactivateStatusError` 409 (μόνο canceled reactivatable). ΠΟΤΕ δεν αγγίζει feature route / per-tenant data DB / self-hosted User session.
  - **Error handling: 0 νέα** — reactivate wrapped σε `saasGuard` (καθαρό `{ error }` 500). Το invites GET/DELETE gap παραμένει (existing P3/S item #2, αμετάβλητο).
  - **Mongoose: 0 νέα** — `audit.ts collectActorIds` = distinct `Set<string>` → ΕΝΑ `_id:{$in}` batched lookup (ρητό «instead of N+1 lookups», γρ.101)· reactivate = single `Tenant.updateOne` point-write στο `_id` + 1 `Membership.countDocuments` για το view. Μηδέν `.map(async`/N+1. Τα prior-accepted no-limit single-tenant aggregations αμετάβλητα.
- **Ουρά αμετάβλητη (5 TODO, όλα code-verified ανοιχτά):** (1) **P2/M** tenant `status:'canceled'/'suspended'` δεν επιβάλλεται στο v1 data path (`context.ts:63` reads, `apiAuth.ts` no gate)· reactivate-blocker λύθηκε (βλ. UPDATE πάνω), μένει read-vs-write product decision. (2) **P3/S** `invites/route.ts` GET(43)+DELETE(102) χωρίς `saasGuard` (direct `Invite.find`/`findOneAndUpdate` → uncaught throw = ασυνεπές 500) — top auto-buildable. (3) **P3/S** sparse index `Account.verifyTokenHash/resetTokenHash` (`Account.ts:24,26` χωρίς `.index()`). (4) **P3/S** `reset/request/route.ts:43` timing side-channel (no-account fast-path `return {ok:true}` πριν mint+store+mail). (5) **P3/S** `connection.ts:54` cache guard `readyState !== 99` (readyState 0=disconnected/3=disconnecting περνούν ως live). **Μηδέν auto-buildable P1/P2· 4 P3/S auto-buildable + 1 P2/M decision.** Top-2 για builder: (α) **invites saasGuard** [P3/S, ολοκληρώνει το try/catch effort]· (β) **Account token-hash sparse index** [P3/S].

## Σύνοψη audit (2026-07-03 37η σάρωση· type-check EXIT 0· μηδέν νέο P1/P2· ουρά 5 TODO αμετάβλητη — και τα 5 επιβεβαιωμένα ανοιχτά στον κώδικα· νέα surface [`saas/workspace` DELETE soft-cancel + `lib/tenancy/workspace.ts` + `audit.ts`] audited → exemplary)

**2026-07-03 (37η σάρωση, αυτόνομος γύρος):** fresh live σάρωση (grep, όχι docs) σε **50 v1 route files** + **22 saas route files** + `apiAuth`/`apiBody`/`apiList` + `lib/tenancy/*` + `lib/billing/*` + `models/*`. `git diff --name-only 4a240aa..HEAD` = νέα SaaS surface (`workspace` route soft-cancel DELETE + rename PATCH + read GET, `lib/tenancy/workspace.ts` pure helpers, `audit.ts` batched-lookup). `npm run type-check` **EXIT 0** (0 TS errors).
- **Ευρήματα ανά διάσταση (live grep):**
  - **Type safety: 0** — `grep -rnE ': any|as any|@ts-ignore|@ts-expect-error' src/app/api src/lib/tenancy src/lib/billing` (εκτός `.test.ts`) = **1 hit, false positive** (σχόλιο «any active member» στο `workspace/route.ts:106`, όχι τύπος). `workspace.ts`/`workspaceView` πλήρως τυπωμένα (whitelisted projection, μηδέν leak billing ids).
  - **Input validation: 0 gaps** — `grep -rln 'req.json().catch' src/app/api` = **μηδέν** (readBody adoption 100%). `workspace` PATCH/DELETE: `readBody`+`strField` body, `sanitizeWorkspaceName`+`workspaceNameError` (empty→400), idempotent no-op guards (rename ίδιο όνομα / ήδη canceled → view χωρίς audit row).
  - **Auth: 0 unguarded** — κάθε v1 route matches `withAuth`/`apiAuth`/`requireAuth` (μόνο `auth/login` exempt)· κάθε saas route gated (`resolveWorkspaceSession`/`resolveBillingSession`/`saasAuthGate`/CRON/webhook). `workspace` DELETE: owner-only (`canCancelWorkspace`) πάνω από το session gate.
  - **Error handling: 0 νέα** — `workspace` GET/PATCH/DELETE όλα wrapped σε `saasGuard` (καθαρό `{ error }` 500)· `audit.ts recordAudit` = μοναδικό DB touch, batched actor lookup (μηδέν N+1).
  - **Mongoose: 0 νέα** — τα `no-limit .find()` (settings/calendar/cards/reports/overview/plans) είναι single-tenant/single-user bounded aggregations (prior-accepted, όχι list-pagination surface)· list routes (receipts/items/…) μέσω `apiList`. Μηδέν `.map(async`/N+1.
- **Ουρά αμετάβλητη (5 TODO, όλα code-verified ανοιχτά):** (1) P2/M tenant `status:'canceled'/'suspended'` δεν επιβάλλεται — ο νέος soft-cancel DELETE ΤΟ ΕΝΙΣΧΥΕΙ (θέτει flag που κανείς δεν διαβάζει· `grep tenant.status src/lib/tenancy src/lib/apiAuth.ts` = μόνο 2 projection hits, μηδέν gate). (2) P3/S `invites/route.ts` GET+DELETE χωρίς `saasGuard` (throw→ασυνεπές 500). (3) P3/S sparse index `Account.verifyTokenHash/resetTokenHash` (fields χωρίς index). (4) P3/S `reset/request` timing side-channel (no-account fast-path `return {ok:true}` vs mint+store+mail → enumeration). (5) P3/S `getTenantConnection` cache guard δέχεται readyState 0 (disconnected, όχι μόνο 99). **Μηδέν auto-buildable P1/P2· 4 P3/S auto-buildable + 1 P2/M decision (SaaS access-control).**



**2026-07-02 (35η σάρωση, αυτόνομος γύρος):** fresh live σάρωση (grep, όχι docs) σε **49 v1 route files** + **21 saas route files** + `apiAuth`/`apiBody`/`apiList` + `lib/tenancy/*` + `lib/billing/*` + `models/*`. `git diff --name-only 9d7bbab..HEAD` = νέα SaaS surface (audit-event recording + read API, saasGuard slices, expenses rescan v1). `npm run type-check` **EXIT 0** (0 TS errors).
- **Ευρήματα ανά διάσταση (live grep):**
  - **Type safety: 0** — `grep -rnE ': any|as any|@ts-ignore|@ts-expect-error' src/app/api` (εκτός `.test.ts`) = **0**. Ο νέος audit route (`saas/audit/route.ts`) πλήρως τυπωμένος (μόνο νόμιμοι `.lean() as ...` projection casts).
  - **Input validation: 0 gaps** — `grep -rln 'req.json().catch' src/app/api` = **μηδέν** (readBody adoption 100%, v1 + saas). audit route: `parseLimit` (1..200 clamp), `parseAuditAction` allowlist, `before` bad-cursor → ignore (δεν 400άρει read).
  - **Auth: 0 unguarded** — κάθε v1 route matches `withAuth`/`apiAuth` (μόνο `auth/login` exempt). audit route gated μέσω `resolveWorkspaceSession(slug, true)` (SAAS-off 404 / unauth 401 / non-owner-admin 403) ΠΡΙΝ αγγίξει το AuditEvent collection.
  - **Error handling / try-catch: P2/M ΕΚΛΕΙΣΕ.** live loop σε 21 saas routes → **12** wrapped σε `saasGuard` (όλα τα write: members×4, account×5, billing checkout/portal, invites/resend, auth login/signup). Εναπομείναντα 7 χωρίς wrap = 6 σκόπιμα read-only (usage/audit/billing GET, session, logout, usage/sample cron) **+ 1 gap: `invites/route.ts` DELETE** (write revoke, missed από το slice 2/2) → νέο P3/S item.
  - **DB/consistency: 0 νέο** — inline ObjectId regex σε api+tenancy+billing (εκτός test/comment) = **μηδέν** (1 hit = σχόλιο στο `invites/route.ts:81`). audit read: bounded limit (MAX 200), keyset `?before` pagination, batched actor lookup (`$in`, ΟΧΙ N+1), whitelisted projection. Καμία νέα unbounded query.
- **Ουρά (live re-verify):**
  - **SaaS try/catch (P2/M):** ~~16/16 write routes χωρίς try/catch~~ → **DONE 2026-07-02** (slices `6f5199c`+`a2e1811`, `saasGuard` helper στο `saasApi.ts`, 12 routes wrapped). Confirmed live.
  - **invites/route.ts saasGuard gap (P3/S):** ΝΕΟ — DELETE (write) + GET δεν τυλίχθηκαν, thrown DB error → framework 500 αντί `{ error }` → **TODO** (top auto-buildable, ολοκληρώνει το try/catch item).
  - **Sparse index Account token-hash (P3/S):** live `models/Account.ts:24,26` `verifyTokenHash`/`resetTokenHash` = `{ type:String, default:null }`, μηδέν `.index()` → collection-scan σε verify/reset confirm → **TODO** (low-urgency).
  - **reset-request timing (P3/S, decision-flag):** ακόμα `await sendEmail(...)` → registered/non-registered response-time delta → **Needs Achilleas** (delivery-semantics tradeoff).
  - **invites DELETE id-guard (P3/S):** ~~stale TODO~~ → επιβεβαιώθηκε **DONE** (isObjectId `invites/route.ts:82`), status διορθώθηκε.
- **Counts ανά dimension: P1=0, P2=0, P3=1 νέο (invites saasGuard).** Δεν εφευρίσκω debt· 35 σαρώσεις χωρίς P1, ο κώδικας ώριμος. Ο builder ΕΚΛΕΙΣΕ το μεγαλύτερο εκκρεμές (P2/M try/catch). Ο νέος audit read-surface είναι **exemplary** (gate ladder, bounded page, keyset pagination, batched no-N+1 actor resolve, whitelisted projection). Top-2 για builder: (1) **invites saasGuard** [P3/S, ολοκληρώνει το try/catch]· (2) **Account token-hash sparse index** [P3/S].

## Σύνοψη audit (2026-07-02 34η σάρωση· CONFIRMATION· builder έκλεισε το seat-cap [DONE], ουρά 3→2 ενεργά auto-buildable [1 P2/M + 1 P3/S] + 1 P3/S decision-flag· νέος invites/resend surface audited → exemplary, μηδέν νέο debt· SaaS try/catch count 15→16)

**2026-07-02 (34η σάρωση, αυτόνομος γύρος):** fresh live σάρωση (grep, όχι docs) σε **49 v1 route files** + **20 saas route files** + `apiAuth`/`apiBody`/`apiList` helpers + `lib/billing/*` + `lib/tenancy/*` + `models/*`. `git diff --name-only 9d7bbab..HEAD -- apps/web/src/app/api apps/web/src/lib apps/web/src/models` = **6 αρχεία** — `saas/invites/resend/route.ts` (ΝΕΟ), `saas/invites/route.ts` (+`invitedBy` στο GET projection, additive), `saas/members/route.ts` (seat-cap fix, ήδη audited+DONE), `lib/tenancy/invites.ts` (+`invitedBy` στο `InviteView`, additive), + 2 test files (`serialize.test.ts`, `invites.test.ts`). Από τον τελευταίο marker καμία αλλαγή σε type/validation/auth/DB surface. `npm run type-check` **EXIT 0**.
- **Ευρήματα ανά διάσταση (live grep):**
  - **Type safety: 0** — `grep -rnE ': any|as any|@ts-ignore|@ts-expect-error' src/app/api` (εκτός `.test.ts`) = **0**. type-check EXIT 0. Το νέο `resend/route.ts` πλήρως τυπωμένο (μόνο ο νόμιμος `.lean() as Pick<InviteDoc,...> | null` projection cast).
  - **Input validation: 0 gaps** — `grep -rln 'req.json().catch' src/app/api` = **μηδέν** (readBody adoption 100%). Το `resend/route.ts` adopter του `readBody` + `isObjectId` guard (malformed inviteId → 400 πριν το Mongoose, όχι CastError 500) από την πρώτη μέρα.
  - **Auth: 0 unguarded** — κάθε v1 route matches `withAuth`/`apiAuth` (μόνο `auth/login` σκόπιμα exempt)· το `resend` route gated μέσω `resolveWorkspaceSession(slug, true)` = SAAS-off→404 / unauth→401 / non-owner-admin→403 (owner/admin only), ΠΡΙΝ αγγίξει το Invite collection· scoped `{_id, tenant, status:'pending'}` → cross-tenant/accepted/revoked → 404· token hash ΠΟΤΕ επιστρέφεται.
  - **DB/consistency: 0 νέο** — inline ObjectId regex `[a-f0-9]{24}` σε api+tenancy+billing (εκτός test) = **μηδέν**. Το `resend` κάνει single `findOneAndUpdate` στο unique `_id` (point-write, no scan). Καμία νέα unbounded query.
- **Ουρά (live re-verify):**
  - **Seat-cap ασυμμετρία (P3/S):** ~~existing-account seat check μετράει μόνο `activeCount`~~ → **DONE 2026-07-02** (commit `699c36e`): το POST branch μετράει `activeCount + pendingCount`, symmetric με το invite path (2 `pendingCount` hits, γρ.108-109 + 225-226 verified).
  - **SaaS try/catch (P2/M):** live loop → **16/16** saas routes χωρίς `try {` (was 15· +1 το νέο `invites/resend/route.ts`). Thrown DB error βγαίνει ως framework-default 500 αντί `{ error }` → **TODO** (top auto-buildable, split S+S).
  - **Sparse index Account token-hash (P3/S):** live `models/Account.ts:24,26` `verifyTokenHash`/`resetTokenHash` = `{ type:String, default:null }`, μηδέν `.index()` → collection-scan σε verify/reset confirm → **TODO** (low-urgency).
  - **reset-request timing (P3/S, decision-flag):** ακόμα `await sendEmail(...)` (`reset/request/route.ts:52`) → registered/non-registered response-time delta → **Needs Achilleas** (delivery-semantics tradeoff).
- **Counts ανά dimension: P1=0, P2=0, P3=0 νέο.** Δεν εφευρίσκω debt· 34 σαρώσεις χωρίς P1, ο κώδικας ώριμος. Ο builder κατανάλωσε το **seat-cap** [P3/S] αυτόν τον κύκλο (ουρά 3→2). Το νέο invites/resend surface είναι **exemplary** (κεντρικό gate ladder, isObjectId guard, re-mint αντί replay, no token-hash leak, fire-and-forget mail). Top-2 για builder: (1) **SaaS try/catch helper** [P2/M, split S+S — mirror του `withAuth` catch για τα 16 saas routes· ξεκίνα με helper + account/* 5 routes]· (2) **Account token-hash sparse index** [P3/S].
  - **Παρατήρηση (χαμηλής αξίας, ΔΕΝ queue item):** το `invites/resend/route.ts` δεν έχει dedicated route test (σε αντίθεση με το sibling mint path)· η λογική είναι mirror του well-tested mint + το suite μένει green. Αν ο builder θέλει, ένα pure gating/shape test (SAAS-off 404, non-owner 403, malformed id 400, pending-only 404) είναι μικρό+safe (attended-preferred, όχι queue).

## Σύνοψη audit (2026-07-02 33η σάρωση· CONFIRMATION· ΜΗΔΕΝ API αλλαγή από τον προηγ. marker `9d7bbab`· ουρά αμετάβλητη — 3 ενεργά auto-buildable [1 P2/M + 2 P3/S] + 1 P3/S decision-flag)

**2026-07-02 (33η σάρωση, αυτόνομος γύρος):** fresh live σάρωση (grep, όχι docs) σε **49 v1 route files** + **19 saas route files** + `apiAuth`/`apiBody`/`apiList` helpers + `lib/billing/*` + `lib/tenancy/*` + `models/*`. `git diff --name-only 9d7bbab..HEAD -- apps/web/src` = **μόνο `api/v1/receipts/serialize.test.ts`** (test-only, commit `777304f`). Από τον τελευταίο code marker ΚΑΜΙΑ αλλαγή σε runtime API/model/billing/tenancy. Το invites surface (accept/route.ts, invites/route.ts, invites.ts, Invite.ts) που άλλαξε από `bba44ff` ήταν ήδη audited+DONE (invites DELETE id-guard). `npm run type-check` **EXIT 0**.
- **Ευρήματα ανά διάσταση (live grep):**
  - **Type safety: 0** — `grep -rnE ': any|as any|@ts-ignore|@ts-expect-error' app/api` (εκτός `.test.ts`) = **0**. type-check EXIT 0.
  - **Input validation: 0 gaps** — `grep -rln 'req.json().catch' app/api` = **μηδέν** (readBody adoption 100%, v1 + saas).
  - **Auth: 0 unguarded** — κάθε v1 route matches `withAuth`/`apiAuth` (μόνο `auth/login` σκόπιμα exempt = auth boundary)· saas routes gated (`saasAuthGate`/`resolveBillingSession`/`CRON_SECRET`/webhook-sig).
  - **DB/consistency: 0 νέο** — `grep -rn '\[a-f0-9\]{24}' app/api lib/tenancy lib/billing` (εκτός test) = **μηδέν** (inline ObjectId regex πλήρως εξαλειμμένο). Καμία νέα unbounded query (μηδέν νέο route).
- **Ουρά (live re-verify, ΟΛΑ ακόμα ανοιχτά):**
  - **Seat-cap ασυμμετρία (P3/S):** ~~existing-account seat check μετράει μόνο `activeCount`~~ → **DONE 2026-07-02** (pharos-daily-dev): το POST branch μετράει πλέον `activeCount + pendingCount`, symmetric με το invite path (2 `pendingCount` hits στο route).
  - **SaaS try/catch (P2/M):** live loop σε `find app/api/saas -name route.ts` → **15** routes χωρίς `try {` (usage, members, invites, billing×3, auth×3, account×5, usage/sample) → thrown DB/Stripe error βγαίνει ως framework-default 500 αντί `{ error }` → **TODO**.
  - **Sparse index Account token-hash (P3/S):** live `models/Account.ts:24,26` `verifyTokenHash`/`resetTokenHash` = `{ type:String, default:null }`, μηδέν `.index()` → collection-scan σε verify/reset confirm → **TODO** (low-urgency, μικρό collection).
  - **reset-request timing (P3/S, decision-flag):** ακόμα `await sendEmail(...)` στο happy-path → registered/non-registered response-time delta → **Needs Achilleas** (delivery-semantics tradeoff, όχι unattended fix).
- **Counts ανά dimension: P1=0, P2=0, P3=0 νέο.** Δεν εφευρίσκω debt· 33 σαρώσεις χωρίς P1, ο κώδικας ώριμος. Ο builder ΔΕΝ κατανάλωσε κανένα από τα 3 auto-buildable items αυτόν τον κύκλο (όλα live-verified TODO). Top-3 για builder: (1) seat-cap asymmetry [P3/S, single seat-check add — μικρότερο]· (2) SaaS try/catch helper [P2/M, split S+S]· (3) Account token-hash sparse index [P3/S].

## Σύνοψη audit (2026-07-02 32η σάρωση· CONFIRMATION· ΜΗΔΕΝ API αλλαγή από τον προηγ. marker `bba44ff`· ουρά αμετάβλητη — 4 ενεργά auto-buildable [1 P2/M + 3 P3/S] + 1 P3/S decision-flag)

**2026-07-02 (32η σάρωση, αυτόνομος γύρος):** fresh live σάρωση (grep, όχι docs) σε **49 v1 route files** + **21 saas route files** + `apiAuth`/`apiBody`/`apiList` helpers + `lib/billing/*` + `lib/tenancy/*` + `models/*`. `git diff --name-only bba44ff..HEAD -- src/app/api src/lib/billing src/lib/tenancy src/models` = **μηδέν αρχεία** → από τον τελευταίο audited marker ΚΑΜΙΑ αλλαγή στο API/model/billing/tenancy surface (οι μόνες αλλαγές: `apps/landing/*` marketing site + `apps/web/src/lib/aiConfig.test.ts` test-only). Το API είναι byte-identical με ό,τι κάλυψαν οι 31 προηγ. σαρώσεις. `npm run type-check` **EXIT 0**.
- **Ευρήματα ανά διάσταση (live grep):**
  - **Type safety: 0** — `grep -rnE ': any|as any|@ts-ignore|@ts-expect-error' src/app/api` = **0**. type-check EXIT 0.
  - **Input validation: 0 gaps** — `grep -rln 'req.json().catch' src/app/api` = **μηδέν** (readBody adoption 100%, v1 + saas). Κανένα raw-body route.
  - **Auth: 0 unguarded** — loop σε ΟΛΑ τα `src/app/api/v1/*/route.ts`: κάθε file matches `withAuth`/`apiAuth` (μόνο το `auth/login` είναι σκόπιμα exempt = auth boundary). Μηδέν `NO-AUTH` hit.
  - **DB/consistency: 0 νέο** — `grep -rn '\[a-f0-9\]{24}' src/app/api src/lib/tenancy src/lib/billing` = **μηδέν** (inline ObjectId regex πλήρως εξαλειμμένο). Καμία νέα unbounded query (μηδέν νέο route).
- **Ουρά (live re-verify, ΟΛΑ ακόμα ανοιχτά):**
  - **invites DELETE id-guard (P3/S):** ~~`invites/route.ts` περνά `_id: inviteId` στο `Invite.updateOne` χωρίς `^[a-f0-9]{24}$` guard~~ → **DONE 2026-07-02** (reuse `isObjectId` από apiBody· malformed id → 400 αντί 500).
  - **Seat-cap ασυμμετρία (P3/S):** `members/route.ts:220-221` existing-account seat check = `withinSeatLimit(plan, activeCount)` **μόνο** (χωρίς `pendingCount`), ενώ το invite path γρ.107-109 = `activeCount + pendingCount` → **TODO** (η ασυμμετρία παραμένει).
  - **SaaS try/catch (P2/M):** `for f in saas/**/route.ts; do grep -q 'try {' || echo` = **15** saas routes χωρίς try/catch → thrown DB/Stripe error βγαίνει ως framework-default 500 αντί `{ error }` → **TODO**.
  - **Sparse index Account token-hash (P3/S):** `models/Account.ts:24,26` `verifyTokenHash`/`resetTokenHash` = απλά `{ type:String, default:null }`, μηδέν `index()` → collection-scan σε verify/reset confirm → **TODO** (low-urgency, μικρό collection).
  - **reset-request timing (P3/S, decision-flag):** `reset/request/route.ts:52` ακόμα `await sendEmail(...)` → registered/non-registered response-time delta → **Needs Achilleas** (delivery-semantics tradeoff, όχι unattended fix).
- **Counts ανά dimension: P1=0, P2=0, P3=0 νέο.** Δεν εφευρίσκω debt· 32 σαρώσεις χωρίς P1, ο κώδικας ώριμος. Ο builder κατανάλωσε το **invites DELETE id-guard** [P3/S] στις 2026-07-02 (DONE). Εναπομείναντα 3 auto-buildable items. Top-3 για builder: (1) seat-cap asymmetry [P3/S, single seat-check add]· (2) SaaS try/catch helper [P2/M, split S+S]· (3) Account token-hash sparse index [P3/S].

## Σύνοψη audit (2026-07-02 31η σάρωση· CONFIRMATION· ουρά αμετάβλητη 5 ενεργά P3/S· ελέγχθηκε ΝΕΟΣ SaaS account self-service surface [commit `a082819`: profile GET/PATCH + password POST] → exemplary, μηδέν νέο debt)

**2026-07-02 (31η σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 v1 route files** + **13 saas route files** (auth×4, billing×4, usage, usage/sample, members, account, account/password) + `apiAuth`/`apiBody`/`apiList` helpers + `lib/billing/*` + `lib/tenancy/*`. Από την 30ή σάρωση ο builder **ΔΕΝ** κατανάλωσε κανένα από τα 5 ενεργά P3/S items (live-verified όλα ακόμα ανοιχτά) → μένουν TODO. Νέο code από τότε = ο SaaS account self-service surface (`saas/account/route.ts` GET+PATCH, `saas/account/password/route.ts` POST, commit `a082819`). `npm run type-check` **EXIT 0**.
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api` (v1 + saas) + `lib/billing` + `lib/tenancy` = **0** (fresh grep). Ο νέος account surface πλήρως τυπωμένος· μόνο ο νόμιμος `as { _id; email?; ... }` lean-shape cast στο GET (documented projection), ΟΧΙ `any`.
  - **Auth: 0 unguarded** — v1: μόνο `auth/login` exempt. Ο νέος account surface: κάθε method `saasAuthGate()` (404 SAAS off / 500 AUTH_SECRET unset) **ΠΡΩΤΑ**, μετά `getCurrentAccount()` → 401 χωρίς session, μετά `Account.findById(claims.sub)` (μόνο ο ίδιος ο caller· κανένα cross-account access). Fail-closed, σωστή σειρά.
  - **Input validation: 0 gaps** — PATCH profile: `hasOwnProperty` guards (name/email absent → 400 «Nothing to update»), email `normalizeEmail`+`looksLikeEmail` → 400, uniqueness pre-check (`Account.exists({email, _id:{$ne}})` → 409) **ΚΑΙ** race-safe 11000 fallback στο save. password POST: `readBody`+`strField` coercion, `passwordChangeError` policy gate (400), same-401 «Invalid credentials» για missing-account ΚΑΙ wrong-current-password (μηδέν info leak). Exemplary.
  - **Error handling: 0 P-level** — ομοιόμορφο `{ error }` shape σε όλα τα account errors (400/401/404/409). Παρατήρηση (ΟΧΙ queue, ίδια με checkout/portal): οι account routes δεν έχουν εξωτερικό try/catch (μόνο το PATCH τυλίγει το `account.save()` για το 11000)· ένα DB throw στο `findById`/`exists` θα γύριζε default 500 αντί `{ error }`. Χαμηλού ρίσκου, saas-consistent convention (οι saas routes ΔΕΝ χρησιμοποιούν το v1 `withAuth` wrapper)· δεν το ανεβάζω σε item.
  - **DB: 0** — GET `Account.findById(...).select(...).lean()` (single-doc point-read στο unique `_id`)· PATCH `findById().select()` **μη-lean** (σκόπιμο, κάνει `.save()`) + `Account.exists()` (bounded existence check στο unique `email` index)· password `findById().select('_id passwordHash').save()`. Μηδέν scan, μηδέν N+1, μηδέν unbounded find. `Account.email` unique-indexed (`models/Account.ts:18`).
  - **Consistency: 0 νέο** — ο account surface adopter του `readBody`+`strField` από την πρώτη μέρα (κανένα raw `req.json().catch`)· reuse των `normalizeEmail`/`looksLikeEmail`/`sanitizeName`/`passwordChangeError` pure helpers (`lib/tenancy/*`). Δεν εισάγει νέο readBody/isObjectId debt.
- **Counts ανά dimension: P1=0, P2=0, P3=0 νέο** (η ουρά μένει 5 ενεργά P3/S: CRON_SECRET timing, isObjectId webhook, readBody checkout+portal, readBody members, getTenantConnection guard). Ο νέος account self-service κώδικας είναι **exemplary** (fail-closed gate ladder, no-leak 401, race-safe uniqueness, no-force-logout password change με σωστό σχόλιο). Δεν εφευρίσκω debt· 31 σαρώσεις χωρίς P1/P2, ο κώδικας ώριμος.

## Σύνοψη audit (2026-07-02 30ή σάρωση· ουρά 3→4 P3/S· ελέγχθηκε ΝΕΟΣ SaaS billing checkout+portal read surface [commits `4819f97`/`9ecb86c`]· +1 νέο P3/S [readBody adoption στα 2 billing routes που κρατούν raw `req.json().catch` + lying cast])

**2026-07-02 (30ή σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 v1 route files** + **10 saas route files** (auth×4, billing/{checkout,portal,webhook,route}, usage, usage/sample) + `apiAuth`/`apiBody`/`apiList` helpers + `lib/billing/*` + `lib/tenancy/*`. Από την 29η σάρωση ο builder **ΔΕΝ** κατανάλωσε κανένα από τα 3 top TODO items (live-verified όλα ακόμα ανοιχτά, βλ. παρακάτω) → μένουν TODO. `npm run type-check` **EXIT 0**.
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `: any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api` (v1 + saas) + `lib/billing` + `lib/tenancy` = **0**. Ο νέος billing read surface (`billingSession.ts`, `billingSummary.ts`, route handlers) πλήρως τυπωμένος (`StripeResult<T>`, `PlanKey`, `BillingSession`)· μόνο ο νόμιμος `as TenantDoc | null` lean-cast, ΟΧΙ `any`.
  - **Auth: 0 unguarded** — v1: μόνο `auth/login` exempt (auth boundary). saas: όλα τα billing routes (`checkout`/`portal`/`route`) περνούν από `resolveBillingSession()` (SaaS-gate 404 → 401 no-session → 403 not-owner/admin → 404 no-workspace) πριν αγγίξουν Stripe· `usage`/`usage/sample`/`webhook` gated σωστά (`saasAuthGate`/`CRON_SECRET`/`timingSafeEqual` sig-verify).
  - **Input validation: 0 gaps** — τα billing routes διαβάζουν μόνο `body.plan`/`body.tenant`· το `plan` περνά από `checkoutablePlan()` (whitelist PlanKey ή null), το `tenant` validate-άρεται κατά της λίστας memberships (μη-μέλος → 403). Καμία un-validated χρήση. (Το raw-body cast είναι consistency debt, ΟΧΙ validation gap — δες παρακάτω.)
  - **Error handling: 0 P-level** — ομοιόμορφο `{ error }` shape σε ΟΛΑ τα saas routes· graceful degradation (Stripe not-configured → 503, upstream → 502) μέσω `StripeResult`. Παρατήρηση (ΟΧΙ queue): `checkout`/`portal` δεν έχουν εξωτερικό try/catch (0 try-blocks)· ο κύριος throw-path (`resolveBillingSession` → `Tenant.findById` DB error) θα γύριζε default 500 αντί `{ error }`. Χαμηλού ρίσκου (τα Stripe calls είναι ήδη `StripeResult`-wrapped, όχι throw)· δεν το ανεβάζω σε item — δες `## Needs Achilleas`/observations στο PROGRESS.
  - **DB: 0** — v1 reads `.lean()`+limits· billing: `accountTenants` = bounded `Membership.find().lean()` + `Tenant.find({_id:{$in}}).lean()`· `resolveBillingSession` κάνει `Tenant.findById(ctx.tenantId)` **μη-lean** (read-only path· μικρό single-doc point-read, marginal .lean() nit, ΟΧΙ queue — ίδιο pattern με τα ήδη-«δεν είναι debt» webhook mutation reads). `dbStats.sampleAllTenants` = intentional full-scan των live tenants.
  - **Consistency debt (νέο): 1 P3/S** — τα `saas/billing/checkout/route.ts:26` + `saas/billing/portal/route.ts:27` κρατούν raw `(await req.json().catch(() => ({}))) as { plan?; tenant? }` — το ΙΔΙΟ debt που έκλεισε πλήρως για το v1 (readBody adoption) **και** για τα saas auth routes (`signup`/`login` ήδη adopters). Ο `as {...}` cast «λέει ψέματα» (runtime τα values μπορεί να μην είναι string). Byte-behavior swap με `readBody` + `strField` coercion → queue item.
- **Counts ανά dimension: P1=0, P2=0, P3=1 νέο** (η ουρά πάει 3→4 P3/S: CRON_SECRET timing [προϋπάρχον] + isObjectId webhook [προϋπάρχον] + getTenantConnection guard [προϋπάρχον] + billing readBody [νέο]). Ο νέος billing read surface είναι **exemplary** (κεντρικό authz, pure helpers `billingSummary`/`checkoutablePlan`, graceful degradation, ΠΟΤΕ charge)· η μόνη νέα παρατήρηση είναι το raw-body cast σε 2 routes. Δεν εφευρίσκω debt· 30 σαρώσεις χωρίς P1/P2.

## Σύνοψη audit (2026-07-02 29η σάρωση· ουρά 1→2 P3/S· ελέγχθηκε ΝΕΟΣ SaaS file-byte storage κώδικας [commit `f8aaea4`]· +1 νέο P3/S [non-constant-time CRON_SECRET compare στο usage/sample route])

**2026-07-02 (29η σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 v1 route files** + **7 saas route files** (auth×4, billing/webhook, usage, usage/sample) + `apiAuth`/`apiBody`/`apiList` helpers + **ΝΕΟΣ SaaS file-byte storage-accounting κώδικας** (`lib/billing/fileStorage.ts` + integration στο `lib/billing/dbStats.ts`, commit `f8aaea4`). Από την 28η σάρωση ο builder **ΔΕΝ** κατανάλωσε το top item (`grep '\[a-f0-9\]{24}' src/app/api` = ακόμα 1 hit στο `saas/billing/webhook/route.ts:81`) → μένει TODO. `npm run type-check` **EXIT 0**.
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api` (v1 + saas) + `lib/billing` + `lib/tenancy` = **0**. Ο νέος `fileStorage.ts` πλήρως τυπωμένος (`import('node:fs').Dirent[]`, `TenantContext`)· ο `dbStats.ts` `StorageSample` επεκτάθηκε καθαρά με `dbBytes`/`fileBytes` (μόνο ο νόμιμος `as unknown as TenantDoc[]` lean-cast, ΟΧΙ `any`).
  - **Auth: 0 unguarded** — v1: μόνο `auth/login` exempt (auth boundary). saas: `usage` + `auth/session` κάνουν `saasAuthGate()` + `getCurrentAccount()` (fail-closed)· `billing/webhook` σωστά signature-gated (`timingSafeEqual` + replay window)· **ΝΕΟ** `usage/sample` (cron endpoint) gated με `saasMode()` 404 + `CRON_SECRET` bearer (500 αν unset, 401 σε bad token) — σωστό pattern για scheduler.
  - **Input validation: 0 gaps** — ο `fileStorage.ts` δεν διαβάζει request (server-side sampling)· ο `tenantStorageRoot` έχει **path-escape guard** (`path.relative` + `..`/absolute check → null) ώστε DNS-safe dbName/slug να μη μπορεί να ξεφύγει από το STORAGE_ROOT· symlinks ΔΕΝ ακολουθούνται (`Dirent.isFile` false) → no traversal amplification.
  - **Error handling: 0** — `measureDir` κάνει per-entry try/catch (ένα unreadable file δεν σπάει το walk)· missing dir → 0· `sampleAllTenants` isolate-άρει per-tenant failures (counted, όχι fatal). Ομοιόμορφο `{ error }` shape σε όλα τα saas routes.
  - **DB: 0** — `Tenant.find({status:{$in}}).select().lean()` (fleet-sample, bounded-by-design· MUST iterate all live tenants — intentional full scan, όχι N+1)· `readDbStats` κάνει native `db.stats()` (read-only)· `setStorageBytes` upsert στο unique `{tenant,period}` index. `accountTenants` = `Membership.find().lean()` + `Tenant.find({_id:{$in}}).lean()` (bounded ανά account).
  - **OSS parity: exemplary** — `tenantFileBytes`/`sampleTenantStorage` no-op returning 0 με **μηδέν fs/db access** όταν `!saasMode()` ή `ctx.isDefault` ή `!tenantId`· self-hosted app ποτέ file-metered. Pure helpers (`sumBytes`, `tenantStorageRoot`, `billedBytes`) unit-tested (`fileStorage.test.ts` 79 γρ.).
  - **Consistency debt (νέο): 1 P3/S** — το ΝΕΟ cron `usage/sample/route.ts:31` συγκρίνει `token !== secret` με **plain string equality** (non-constant-time), ενώ το **ίδιο billing subsystem** (`lib/billing/stripe.ts:142`) ΚΑΙ το `lib/auth.ts:43` έχουν ήδη καθιερώσει `timingSafeEqual` για secret compare. Timing side-channel στο CRON_SECRET (μικρού ρίσκου, αλλά υπάρχει καθιερωμένο shared pattern να επαναχρησιμοποιηθεί). → queue item.
- **Counts ανά dimension: P1=0, P2=0, P3=1 νέο** (η ουρά πάει 1→2 P3/S: isObjectId webhook [προϋπάρχον TODO] + timing-safe CRON compare [νέο]). Ο νέος storage-accounting κώδικας είναι **exemplary** (OSS-parity, path-guard, symlink-safe walk, per-entry error isolation, unit-tested pure helpers)· η μόνη παρατήρηση είναι το non-constant-time secret compare σε ένα ΝΕΟ route. Δεν εφευρίσκω debt· 29 σαρώσεις χωρίς P1/P2.

## Σύνοψη audit (2026-07-02 28η σάρωση· ουρά αμετάβλητη 1 P3/S [isObjectId billing webhook, ΑΚΟΜΑ TODO — ο builder δεν το κατανάλωσε]· ελέγχθηκε ΝΕΟ SaaS quota-enforce gate + usage read endpoint [commit `918f49c`])

**2026-07-02 (28η σάρωση, αυτόνομος γύρος):** fresh σάρωση **57 API route files** (49 v1 + 6 saas [auth×4, billing/webhook, usage] + λοιπά) + `apiAuth`/`apiBody`/`apiList` helpers + **ΝΕΟΣ SaaS metering-enforcement κώδικας** (`lib/billing/enforce.ts` + `GET /api/saas/usage`, commit `918f49c`). Από την 27η σάρωση ο builder **ΔΕΝ** κατανάλωσε το top item (`grep '\[a-f0-9\]{24}' src/app/api/saas` = ακόμα 1 hit στο `webhook/route.ts:81`) → μένει TODO στην κορυφή της ουράς. `npm run type-check` **EXIT 0**.
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε saas+billing+tenancy = **0**. Το `enforce.ts` δουλεύει πλήρως τυπωμένο (`EnforceResult`/`QuotaKind`/`QuotaStatus`, `Record<QuotaKind,string>` label map), το `usage/route.ts` χωρίς κανένα cast.
  - **Auth: 0 unguarded** — το `usage/route.ts` κάνει `saasAuthGate()` (404 όταν SAAS off / 500 όταν AUTH_SECRET unset) **ΠΡΩΤΑ**, μετά `getCurrentAccount()` → 401 χωρίς session, μετά membership-check (`accountTenants(claims.sub)` → 404 αν καμία, 403 αν το `?tenant=slug` δεν ανήκει στον account). Fail-closed, σωστή σειρά.
  - **Input validation: 0 gaps** — το μόνο input είναι το `?tenant=` query param· γίνεται `.trim().toLowerCase()` + validate κατά της λίστας memberships (`tenants.find(t => t.slug === want)`) → μη-μέλος = 403. Το `enforce.ts` δεν διαβάζει request (pure gate primitive).
  - **Error handling: 0** — ομοιόμορφο `{ error }` shape σε ΟΛΑ τα σφάλματα του usage route (401/403/404). Το `quotaExceededBody` = σταθερό machine-readable `{ error, code:'quota_exceeded', kind, plan, used, limit, remaining, upgrade }` (402).
  - **DB: 0** — `Usage.findOne({ tenant, period }).lean()` πάνω σε **unique compound index** `{tenant:1, period:1}` (`models/Usage.ts:35`) → single-doc point-read, μηδέν scan. `accountTenants` κάνει `Membership.find(...).lean()` + `Tenant.find({_id:{$in}}).lean()` (bounded ανά account). Οι upserts (`findOneAndUpdate`) keyάρουν στο ίδιο unique pair. Μηδέν N+1, μηδέν unbounded find.
  - **Consistency: 0 νέο** — ο saas surface επιστρέφει ομοιόμορφα bare domain objects (session `{account}`, login/signup domain obj, usage `{tenant,period,usage,quotas}`)· το `{ data }` wrapper είναι v1-mobile convention, ΟΧΙ saas → το usage route ΔΕΝ αποκλίνει εντός του surface του.
- **Counts ανά dimension: P1=0, P2=0, P3=0 νέο** (η ουρά μένει στο 1 προϋπάρχον P3/S). Ο νέος metering-enforcement κώδικας είναι **exemplary**: OSS-parity σχολιασμένο (default tenant / SAAS off → pure pass-through, μηδέν DB, ποτέ blocked), pure body-builder unit-tested, gate primitive dependency-free, wiring-ready αλλά όχι ακόμα καλωδιωμένο σε feature route (σκόπιμο forward-work, ΟΧΙ dead code). Δεν εφευρίσκω debt· 28 σαρώσεις, ο κώδικας ώριμος.

## Σύνοψη audit (2026-07-02 27η σάρωση· builder έκλεισε shopping-list POST [readBody adoption 100%], ουρά 1→0 → ανοίγω 1 P3/S [isObjectId στο νέο SaaS billing webhook]· ελέγχθηκε ΝΕΟΣ SaaS billing scaffold + Stripe webhook)

**2026-07-02 (27η σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 v1 route files** + `apiAuth`/`apiBody`/`apiList` helpers + **ΝΕΟΣ SaaS billing surface** (`api/saas/billing/webhook` + `lib/billing/{stripe,plans}`, commit `3c6bcc4`). Από την 26η σάρωση ο builder κατανάλωσε το top item (readBody σε shopping-list POST, commit `6fd1075`) → η v1 raw-body ουρά έφτασε **0** και το apiBody/readBody adoption **ΕΚΛΕΙΣΕ πλήρως** (`grep -rn 'req.json().catch' src/app/api` = μηδέν σε ΟΛΟ το api).
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `npm run type-check` **EXIT 0**· `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api` (v1 + saas) = **0**. Ο billing webhook + `stripe.ts` δουλεύουν πλήρως τυπωμένα με `Record<string, unknown>` + guards, μηδέν `any`.
  - **Auth: 0 unguarded** στο v1 (μόνο `auth/login` exempt). Ο SaaS billing webhook είναι σωστά gated: `saasMode()` off → 404, webhook secret unset → 503, bad/missing signature → 400 (fail-closed). Signature-verify με constant-time `timingSafeEqual` + replay window (±300s) + σωστό HMAC-SHA256 scheme, dependency-free — **exemplary**.
  - **Input validation: 0 gaps** — τα 2 εναπομείναντα raw `req.json()` (auth/login boundary, items/[id]/ai-fill) είναι σωστά try/catch-wrapped + safe-cast σε `unknown`/typed guard· webhook διαβάζει raw body ΠΡΙΝ verify (σωστό) + `JSON.parse` σε try/catch.
  - **Error handling: 0** — ομοιόμορφο try/catch + `{ error }` shape· webhook επιστρέφει 500 σε DB failure (Stripe retry) αντί να καταπίνει.
  - **DB: 0** — ΟΛΑ τα v1 reads `.lean()` (live-verified: receipts/items/expenses/subscriptions/statements/vouchers/tasks list builders + settings/calendar chains· reports:81 = JS `Array.find`, false positive)· list endpoints `.limit()`+`.skip()`. `auth/login` findOne σκόπιμα ΟΧΙ lean (κάνει `user.save()` για apiToken). Webhook: `Tenant.findById`/`findOne` μη-lean γιατί κάνει mutation (`.save()`), σωστό.
  - **Consistency debt (νέο): 1 P3/S** — ο νέος SaaS billing webhook (`resolveTenant`, γρ.81) ξανα-εισήγαγε inline `/^[a-f0-9]{24}$/i.test(...)` αντί για το shared `isObjectId` — το ίδιο debt που είχε κλείσει για όλο το v1. Byte-identical swap → queue item.
- **Counts ανά dimension: P1=0, P2=0, P3=1** (isObjectId στο billing webhook, S). Δεν εφευρίσκω debt· 27 σαρώσεις χωρίς P1/P2 στο v1, ο κώδικας ώριμος. Ο νέος billing scaffold είναι υψηλής ποιότητας (constant-time sig, fail-closed gating, dependency-free)· η μόνη παρατήρηση είναι η inline-regex consistency.

---

## Σύνοψη audit (2026-07-01 26η σάρωση· builder έκλεισε scan/expense+voucher, ουρά 1→0 → ανοίγω το ΤΕΛΕΥΤΑΙΟ raw route [shopping-list POST]· ελέγχθηκε ΝΕΟΣ SaaS auth κώδικας)

**2026-07-01 (26η σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 v1 route files** + `apiAuth`/`apiBody`/`apiList` helpers + **ΝΕΟ SaaS auth surface** (`api/saas/auth/{signup,login,session,logout}` + `lib/tenancy/{saasApi,accountSession,provision}` — uncommitted WIP του Αχιλλέα στο working tree). Από την 25η σάρωση ο builder κατανάλωσε το top item (readBody σε scan/expense + scan/voucher, commits `4503640`+`875264b`) → η v1 ουρά έφτασε **0 ενεργά** στην αρχή.
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `npm run type-check` **EXIT 0**· `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` **και** στον νέο SaaS κώδικα = **0**.
  - **Auth: 0 unguarded** στο v1 (μόνο `auth/login` exempt). Ο νέος SaaS surface έχει σωστό gate pattern: κάθε route `const gate = saasAuthGate(); if (gate) return gate;` → 404 όταν `SAAS_MODE` off + 500 όταν `AUTH_SECRET` unset (fail-closed). Session cookie httpOnly + jose HS256 + `verifyAccountSession` never-throws.
  - **Input validation: 0 gaps στο v1.** Ο SaaS signup validate email regex + MIN_PASSWORD 8· login same-401 (χωρίς enumeration μήνυμα). **ΟΜΩΣ 3 παρατηρήσεις στον SaaS WIP → Needs Achilleas** (ΟΧΙ queue items, γιατί είναι uncommitted WIP + product/security decisions· δες PROGRESS).
  - **Error handling: 0** — ομοιόμορφο try/catch + `{ error }` shape.
  - **DB: 0** — v1 reads `.lean()`+limits· SaaS `accountTenants` κάνει `Membership.find(...).lean()` + `Tenant.find({_id:{$in}}).lean()` (bounded ανά account, ΟΚ)· control-plane models έχουν σωστά unique indexes (Account.email, Tenant.slug/dbName, Membership {account,tenant}).
  - **Consistency debt (ανοιχτό): 1 P3/S** — readBody adoption σε **shopping-list POST** (το ΤΕΛΕΥΤΑΙΟ v1 route με raw `req.json().catch`· ΟΧΙ byte-identical — χρειάζεται `strField` coercion, κλείνει και latent non-string crash).
- **Counts ανά dimension: P1=0, P2=0, P3=1** (shopping-list readBody, S). Δεν εφευρίσκω debt· 26 σαρώσεις χωρίς P1/P2 στο v1, ο κώδικας ώριμος. Ο νέος SaaS κώδικας είναι καθαρός type/auth/DB-wise· οι 3 παρατηρήσεις είναι security/robustness σε WIP → Needs Achilleas.

---

## Σύνοψη audit (2026-07-01 25η σάρωση· builder κατανάλωσε ΚΑΙ τα 2 ανοιχτά items + επιπλέον, ουρά 2→0 → ανοίγω 1 P3/S readBody twins)

**2026-07-01 (25η σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 route files** + `apiAuth`/`apiBody`/`apiList` helpers + νέος SaaS tenancy κώδικας (`lib/tenancy/*`), όλα από live grep. Από την 24η σάρωση ο builder προχώρησε πολύ: κατανάλωσε **και τα 2 ανοιχτά P3/S** (readBody σε settings + stores/[id], και σε receipts/[id] + receipts/[id]/rescan) **και επιπλέον** raw-body routes → `req.json().catch` απομένει πλέον **μόνο σε 3 routes** (scan/expense, scan/voucher, shopping-list POST), `readBody` adopters **26**. Τα 2 stale-marked TODO ήταν ήδη DONE → τα μάρκαρα DONE (live-verified). Η ουρά έφτασε **0 ενεργά** στην αρχή.
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `npm run type-check` **EXIT 0**· `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` = **0**. Ο νέος SaaS κώδικας (`lib/tenancy/context.ts`, `saasMode.ts`) καθαρός: μηδέν `any`.
  - **Auth: 0 unguarded** — μοναδικό v1 route χωρίς `withAuth`/`bearerUser` = `auth/login` (auth boundary, σωστά). 48/49 routes μέσω `withAuth`.
  - **Input validation: 0 gaps** — τα 3 εναπομείναντα raw-body routes validate τα inputs τους· `readBody` adoption = style/consistency, ΟΧΙ validation gap.
  - **Error handling: 0** — ομοιόμορφο try/catch + `{ error }` shape μέσω `withAuth`.
  - **DB: 0** — ΟΛΑ τα read paths `.lean()` (settings:16 + calendar:48 = multi-line builder chains με `.lean()` παρακάτω, false positives)· list endpoints `.limit()`+`.skip()`. Νέο `getTenantContext` κάνει `Tenant.findOne(...).lean()` × 2, gated πίσω από `SAAS_MODE` (μηδέν DB access όταν off) → καθαρό.
  - **SaaS tenancy (νέο, ceb65c6/1e5dc4c): 0 debt** — server-only, gated behind `SAAS_MODE`, `.lean()`, pure host-parser έχει tests (`host.test.ts`). Δεν εισάγει route/parity/type debt.
  - **Consistency debt (ανοιχτό): ανοίγω 1 P3/S** (readBody scan/expense + scan/voucher — twin one-liner swap, byte-behavior-identical). shopping-list POST μένει «needs care» (cast `Record<string,string>` → coercion, βλ. item σημείωση).
- **Counts ανά dimension: P1=0, P2=0, P3=1** (νέο, S). Δεν εφευρίσκω debt· 25 σαρώσεις χωρίς P1/P2, ο κώδικας παραμένει ώριμος.

---

## Σύνοψη audit (2026-07-01 24η σάρωση· builder έκλεισε isObjectId 4η/τελική παρτίδα, ουρά 2→1 ενεργό + ανοίγω 1 P3/S readBody continuation)

**2026-07-01 (24η σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 route files** + `apiAuth`/`apiBody`/`apiList` helpers, όλα από live grep. Από την 22η/23η σάρωση ο builder κατανάλωσε το commit **`f17f279`** (isObjectId 4η/τελική παρτίδα — 7 deep sub-routes) → το `isObjectId()` dedup effort **ΕΚΛΕΙΣΕ πλήρως**: `grep -rln '\[a-f0-9\]{24}' src/app/api/v1` = **NONE**, `isObjectId` adopters = **19**. Το πρώτο queue item ήταν stale-marked TODO ενώ ήταν ήδη DONE → το μάρκαρα DONE. Το δεύτερο (readBody settings + stores/[id]) παραμένει **ΑΝΟΙΧΤΟ** (live: settings/route.ts:72 + stores/[id]/route.ts:25 ακόμα με raw `req.json().catch`).
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `npm run type-check` **EXIT 0**· `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` = **0**.
  - **Auth: 0 unguarded** — μοναδικό v1 route χωρίς `withAuth`/`bearerUser` = `auth/login` (auth boundary, σωστά). 48/49 routes μέσω `withAuth` (bearer + try/catch + clean 500).
  - **Input validation: 0 gaps** — τα 13 raw-body routes ΟΛΑ validate τα inputs τους· `readBody` adoption = style/consistency, ΟΧΙ validation gap.
  - **Error handling: 0** — ομοιόμορφο try/catch + `{ error }` shape μέσω `withAuth`.
  - **DB: 0** — ΟΛΑ τα read paths `.lean()` (επαληθεύτηκαν live: receipts/items/expenses/subscriptions/statements/vouchers/tasks list builders + settings/calendar find-chains· reports:81 = JS `Array.find`, false positive)· list endpoints `.limit()`+`.skip()` via `listParams`.
  - **Consistency debt (ανοιχτό): 1 P3/S** ενεργό (readBody settings+stores/[id]) + **ανοίγω 1 νέο P3/S** (readBody receipts/[id]+rescan) για runway. Raw `req.json().catch` απομένει σε **13 routes**, `readBody` adopters **16**.
- **Counts ανά dimension: P1=0, P2=0, P3=2** (1 προϋπάρχον + 1 νέο, αμφότερα readBody continuation, S). Δεν εφευρίσκω debt· ο κώδικας παραμένει ώριμος (24 σαρώσεις χωρίς P1/P2).

---

## Σύνοψη audit (2026-07-01 22η σάρωση· builder έκλεισε isObjectId 3η παρτίδα, ουρά 0→ανοίγω 2 P3/S: isObjectId 4η [τελ.] παρτίδα + readBody settings/stores)

**2026-07-01 (22η σάρωση, αυτόνομος γύρος):** fresh σάρωση **52 route files** + `apiAuth`/`apiBody`/`apiList` helpers, όλα από live grep. Από την 21η σάρωση ο builder κατανάλωσε το commit **`c5cec57`** (isObjectId 3η παρτίδα — cards/[id]+stores/[id]+statements/[id]+notifications+trash/[type]/[id]) → επαλήθευση live: `isObjectId` adopters **12**· inline `[a-f0-9]{24}` regex απομένει μόνο σε **7 deep sub-routes**. Η ουρά έφτασε **0 ενεργά** στην αρχή αυτού του γύρου.
- **Ευρήματα ανά διάσταση (live grep):**
  - **Type safety: 0** — `npm run type-check` **EXIT 0**· `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` = **0** (μόνο 1 legit `hook as any` σε `lib/softDelete.ts` pre-hook cast, όχι v1).
  - **Auth: 0 unguarded** — μοναδικό v1 route χωρίς `withAuth` = `auth/login` (auth boundary, σωστά). Τα 51 v1 CRUD routes ΟΛΑ μέσω `withAuth` (bearer + try/catch + clean 500).
  - **Input validation: 0 gaps** — τα 13 raw-body routes validate τα inputs τους· `readBody`/`isObjectId` adoption = style/consistency, ΟΧΙ validation gap.
  - **Error handling: 0** — ομοιόμορφο try/catch + `{ error }` shape μέσω `withAuth`.
  - **DB: 0** — ΟΛΑ τα read routes `.lean()` (reports γρ.81 `.find()` = JS `Array.find`, όχι Mongoose)· list endpoints `.limit()` via `listParams`· no-limit finds (cards/statements/plans/calendar/overview/items/[id]/plans) = bounded aggregations, `.lean()`.
  - **Consistency debt (ανοιχτό): 2 P3/S** — isObjectId 4η (τελ.) παρτίδα (7 files, 8 occ.· κλείνει το effort) + readBody adoption (settings+stores/[id]).

## Σύνοψη audit (2026-07-01 21η σάρωση· builder έκλεισε isObjectId 2η παρτίδα, ουρά 0→ανοίγω 1 P3/S 3η παρτίδα)

**2026-07-01 (21η σάρωση, αυτόνομος γύρος):** fresh σάρωση **52 route files** (`find api/v1 -name route.ts`) + `apiAuth`/`apiBody`/`apiList` helpers + synced models, όλα από live grep (όχι docs). Από την 20ή σάρωση ο builder κατανάλωσε το commit **`f1413c3`** (isObjectId 2η παρτίδα — receipts/expenses/subscriptions/tasks/vouchers [id]) → το μοναδικό ενεργό P3/S της 20ής είναι πλέον **DONE** (επαλήθευση live: `isObjectId` adopters **7** = items, shopping-list + τα 5 της 2ης παρτίδας). Άρα η Web Debt Queue έφτασε **0 ενεργά** στην αρχή αυτού του γύρου.
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `npm run type-check` **EXIT 0**· `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` = **0** (και σε όλο το `src`).
  - **Auth: 0 unguarded** — `grep -rL 'withAuth|bearerUser'` → 3 hits εκτός v1-CRUD: `auth/login` (auth boundary, σωστά), `api/mcp` (κάνει δικό του bearer-check `authed()` μέσω `User.findOne({apiToken})`, σκόπιμα exempt από cookie middleware), `api/files/[...path]` (file-server, εκτός v1). Μηδέν v1 CRUD route χωρίς bearer.
  - **Input validation: 0 gaps** — τα 13 raw-body routes ΟΛΑ validate τα inputs τους· `readBody`/`isObjectId` adoption = style/consistency, ΟΧΙ validation gap. list params clamped 1..200· `ai` cap ενεργό.
  - **Error handling: 0** — ομοιόμορφο try/catch + `{ error }` shape μέσω `withAuth`· inline `NextResponse.json({ error })` μόνο σε auth boundaries (`auth/login`, `api/mcp` JSON-RPC).
  - **DB: 0** — synced models `index({ updatedAt: -1 })`· list endpoints `.lean()`+`.limit()`· no-limit finds = bounded-domain aggregations, `.lean()`.
  - **Duplication: 2 ongoing** — (1) raw-body `req.json().catch` σε **13 routes** (ai, ai/subscription, items/[id]/link-plan+price, items/import, push/register, receipts/[id]+rescan, scan/expense+voucher, settings, shopping-list, stores/[id]), **16 adopters** `readBody`· (2) ObjectId regex `/^[a-f0-9]{24}$/i` inline σε **12 route files** ακόμα (cards/[id], stores/[id], statements/[id], notifications, trash/[type]/[id], items/[id]/ai-fill+convert-to-task+link-plan+plans+price, receipts/[id]/add-to-library+rescan), `isObjectId` adopters **7**.
- **Counts ανά dimension: P1=0, P2=0, P3=1** (νέο: isObjectId dedup 3η παρτίδα, 5 route files cards/[id]+stores/[id]+statements/[id]+notifications+trash/[type]/[id], S). Άνοιξα ΜΟΝΟ 1 μη-sprawling item ώστε ο builder να έχει ουρά· δεν εφευρίσκω debt. Δες `## Needs Achilleas` στο PROGRESS για standing product decisions (login brute-force rate-limit, error-message leak στο `withAuth` 500, tasks `steps` χωρίς cap).

---

## Σύνοψη audit (2026-07-01 20ή σάρωση· builder έκλεισε items/[id]+shopping-list/[id] apiBody + 1η isObjectId παρτίδα, ουρά 0→ανοίγω 1 P3/S)

**2026-07-01 (20ή σάρωση, αυτόνομος γύρος):** fresh σάρωση **49 route files** + `apiAuth`/`apiBody`/`apiList` helpers + 7 synced models. Από την 19η σάρωση ο builder κατανάλωσε το commit **`d259a55`** (shared `isObjectId()` guard στο `lib/apiBody.ts` + `readBody` σε items/[id] & shopping-list/[id] PATCH) → τα 2 ενεργά P3/S items της 19ης είναι πλέον **DONE** (επαλήθευση live: αμφότερα κάνουν πλέον `import { isObjectId, readBody } from '@/lib/apiBody'`, μηδέν raw `req.json().catch`). Άρα η Web Debt Queue έφτασε **0 ενεργά** στην αρχή αυτού του γύρου.
- **Ευρήματα ανά διάσταση (live grep, όχι docs):**
  - **Type safety: 0** — `npm run type-check` EXIT 0· `:any`/`as any`/`@ts-ignore`/`@ts-expect-error` σε ΟΛΟ το `/api/v1` = **0**.
  - **Auth: 0 unguarded** — `grep -rL withAuth|bearerUser` σε 49 routes → μόνο `auth/login` (auth boundary, σωστά). Κεντρικό bearer-check + try/catch + καθαρό 500 μέσω `withAuth`.
  - **Input validation: 0 gaps** — τα εναπομείναντα raw-body routes ΟΛΑ validate τα inputs τους· το `readBody`/`isObjectId` adoption είναι style/consistency, ΟΧΙ validation gap. list params clamped 1..200· `ai` cap (MAX_TURNS=20/MAX_CONTENT=8000) ενεργό.
  - **Error handling: 0** — ομοιόμορφο try/catch + `{ error }` shape μέσω `withAuth`· inline `NextResponse.json({ error })` μόνο στο `auth/login` (σκόπιμα).
  - **DB: 0** — 7/7 synced models `index({ updatedAt: -1 })`· heuristic sweep «limit χωρίς lean» = **0 hits**· τα list endpoints `.lean()`+`.limit()`· τα no-limit finds είναι bounded-domain aggregations, όλα `.lean()`.
  - **Duplication: 2 ongoing** — (1) raw-body `req.json().catch` σε **13 routes** (από 15· ο builder έκλεισε 2), **16 adopters**· (2) ObjectId regex `/^[a-f0-9]{24}$/i` inline σε **17 route files** ακόμα (από 19· 2 migrated στο `d259a55`), `isObjectId` adopters **2**.
- **Counts ανά dimension: P1=0, P2=0, P3=1** (νέο: isObjectId dedup 2η παρτίδα, 5 route files, S). Άνοιξα ΜΟΝΟ 1 μη-sprawling item ώστε ο builder να έχει ουρά· δεν εφευρίσκω debt. Δες `## Needs Achilleas` στο PROGRESS για standing product decisions (login brute-force rate-limit, error-message leak στο `withAuth` 500, tasks `steps` χωρίς cap).

---

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

Ενεργά items (επιβεβαιωμένα live στην 36η σάρωση, 2026-07-03): **2 auto-buildable P3/S** (invites `saasGuard` + Account token-hash sparse index) + **2 decision-flavored P3** (connection cache-reuse `readyState` guard, reset-request timing). Ολα P3· μηδέν P1/P2 ανοιχτό, type-check EXIT 0. Η ευρεία standardization του response envelope σε ΟΛΑ τα endpoints (breaking change που συντονίζεται με το mobile) παραμένει στο `## Needs Achilleas` του PROGRESS, ΟΧΙ εδώ.

---

## Web Debt Queue

### MFA re-enrollment (`POST /api/saas/account/mfa` + `.../mfa/confirm`) δεν απαιτεί re-auth όταν το MFA είναι ΗΔΗ ενεργό — ασύμμετρο με το disable path
- Priority: P2
- Size: S
- Area: api
- Files: apps/web/src/app/api/saas/account/mfa/route.ts, apps/web/src/app/api/saas/account/mfa/confirm/route.ts, apps/web/src/lib/tenancy/mfaStore.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα (βρέθηκε από reviewer, 2026-07-20, review εύρους `638e33a..HEAD`, increment 80a):** το `DELETE /api/saas/account/mfa` (disable) σωστά re-verifies το τρέχον password πριν καλέσει `disableMfa` (`mfa/route.ts:65-79`, ίδιο idiom με το password-change route). Όμως το **`POST /api/saas/account/mfa`** (begin/restart enrollment, `mfa/route.ts:46-63`) και το **`POST .../mfa/confirm`** (`confirm/route.ts`) απαιτούν ΜΟΝΟ valid session, καμία επιβεβαίωση password/υπάρχοντος TOTP κωδικού, πριν αντικαταστήσουν `mfaPendingSecretEnc` και (στο confirm) το ενεργό `mfaSecretEnc` + εκδώσουν νέα recovery codes.
  - **Failure scenario:** ένας attacker που κλέβει ένα ήδη-authenticated session (hijacked cookie/XSS) για λογαριασμό που ΗΔΗ έχει ενεργό MFA μπορεί να καλέσει `POST /mfa` → παίρνει νέο secret → το εγγράφει στο δικό του authenticator app → `POST /mfa/confirm` με δικό του κωδικό → αντικαθιστά σιωπηλά το MFA secret + recovery codes του θύματος, χωρίς κανένα re-auth prompt. Ασύμμετρο με το disable path που ήδη προστατεύεται σωστά.
  - **ΣΗΜ επίπτωσης σήμερα:** χαμηλή πρακτική έκθεση ΤΩΡΑ — το MFA δεν είναι ακόμα wired στο login flow (αυτό είναι το ξεχωριστό, σκόπιμα μεταγενέστερο increment 80c, per `mfaStore.ts`'s scope note + `SAAS_PROGRESS.md`), άρα ένα ενεργό session ήδη σημαίνει πλήρη πρόσβαση χωρίς MFA gate να έχει σημασία ακόμα. Αξίζει όμως να διορθωθεί ΠΡΙΝ το 80c wiring, ώστε το API contract να είναι ήδη σωστό όταν ενεργοποιηθεί η επιβολή στο login.
  - **Fix:** mirror το ίδιο pattern με το DELETE handler — απαίτησε `password` στο body του `POST /mfa` (begin/restart) όταν `mfaEnabled` είναι ήδη `true` (verify μέσω `Account.passwordHash`, ίδιο idiom με `mfa/route.ts:70-73`)· επίτρεψε begin-χωρίς-password μόνο στο πρώτο enrollment (`mfaEnabled===false`). Το `POST .../mfa/confirm` δεν χρειάζεται δικό του re-auth αν το begin ήδη το απαιτεί (η pending-secret ροή παραμένει two-step by design), αλλά επιβεβαίωσε ότι `confirmMfaEnrollment` δεν μπορεί να ενεργοποιηθεί χωρίς να έχει προηγηθεί ένα re-authed begin όταν ήδη ενεργό.
  - Επαλήθευση: unit test στο `mfa/route.ts` (ή νέο route test) — `mfaEnabled:true` + `POST /mfa` χωρίς password → 401· με σωστό password → 200 (ίδιο idiom με τα DELETE tests αν υπάρχουν)· `mfaEnabled:false` + `POST /mfa` χωρίς password → 200 (πρώτο enrollment αμετάβλητο). npm run type-check exits 0. Full `npx vitest run` παραμένει green.
  - npm run type-check exits 0
- Status: DONE (fixed 2026-07-20, saas-core routine, increment 81) — `mfa/route.ts`'s `POST` τώρα κάνει `Account.findById(...).select('_id passwordHash mfaEnabled')` πρώτα, και όταν το νέο PURE `mfaEnrollRequiresReauth(account.mfaEnabled)` (`mfaStore.ts`) γυρνά `true`, απαιτεί+verifies `password` (ίδιο idiom με το DELETE, γρ.63-70) πριν καλέσει `beginMfaEnrollment`. Πρώτο enrollment (`mfaEnabled===false`) παραμένει password-less, αμετάβλητο. `POST .../mfa/confirm` δεν άλλαξε (δεν χρειάζεται δικό του re-auth όπως προέβλεπε το fix note — δεν μπορεί να ενεργοποιηθεί χωρίς προηγούμενο re-authed begin που δημιουργεί νέο pending secret). Route-level test παραλήφθηκε (κανένα SaaS route στο repo δεν έχει ακόμα DB-mocked test harness) — αντ' αυτού 2 νέα unit tests στο `mfaStore.test.ts` πάνω στο pure decision function, ίδια σύμβαση με τα υπόλοιπα `plan*` builders του ίδιου αρχείου. `npm run type-check` EXIT 0, full `npx vitest run` 215/215 files · 2789/2789 tests green.

### auth/login — inline `NextResponse.json({ error })` αντί για τον shared `apiError()` helper (response-shape consistency)
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/auth/login/route.ts
- Depends on: none
- Acceptance:
  - Το `auth/login/route.ts` είναι το μοναδικό v1 route που χτίζει error responses inline (γρ.29 `Invalid JSON body` 400, γρ.33 `username and password required` 400, γρ.38 `Invalid credentials` 401) ενώ κάθε άλλο route χρησιμοποιεί τον shared `apiError(message, status)` (= `NextResponse.json({ error: message }, { status })`). Το shape είναι byte-identical, οπότε ο swap είναι μηχανικός + behavior-identical.
  - Πρόσθεσε `apiError` στο υπάρχον import (`import { rateLimit, apiError } from '@/lib/apiAuth';`, γρ.6) και αντικατέστησε τα 3 inline `NextResponse.json({ error }, { status })` με `apiError(msg, status)`. Το `NextResponse` παραμένει σε χρήση για το τελικό success response ({ token, user }), άρα δεν μένει dangling import.
  - Ο swap ΔΕΝ αγγίζει το auth boundary logic (το login μένει σκόπιμα εκτός `withAuth`, μόνο η error-shape ενοποιείται)· rate-limit gate, JSON-parse guard, credential check, token-mint αμετάβλητα.
  - npm run type-check exits 0
- Status: DONE (verified 2026-07-06, 48η σάρωση) — ο builder το κατανάλωσε: `v1/auth/login/route.ts` γρ.6 φέρνει πλέον `import { rateLimit, apiError } from '@/lib/apiAuth';` και τα 3 error paths είναι `apiError('Invalid JSON body')` (γρ.29), `apiError('username and password required')` (γρ.33), `apiError('Invalid credentials', 401)` (γρ.38). Μηδέν inline `NextResponse.json({ error })` απομένει· auth boundary/rate-limit/token-mint αμετάβλητα.

### Tenant `status:'canceled'`/`'suspended'` δεν επιβάλλεται πουθενά → soft-cancel/dunning ΔΕΝ μπλοκάρει πρόσβαση
- Priority: P2
- Size: M
- Area: shared
- Files: apps/web/src/lib/tenancy/workspaceSession.ts (ή νέος shared status gate), apps/web/src/lib/tenancy/saasApi.ts, apps/web/src/app/api/saas/workspace/route.ts, apps/web/src/app/api/saas/billing/webhook/route.ts, apps/web/src/models/Tenant.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα (επιφανειοποιήθηκε από το commit `681a647` workspace soft-cancel + προϋπάρχει από το billing webhook):** δύο flows θέτουν `Tenant.status = 'canceled'` — το νέο owner-only DELETE `/api/saas/workspace` (soft-cancel) και το `billing/webhook/route.ts:138` (dunning/subscription cancel). Το `Tenant.ts:27` σχόλιο + το commit message («blocks access, reversible») δηλώνουν ρητά ότι `suspended`/`canceled` **μπλοκάρουν πρόσβαση**. Ομως live grep σε ΟΛΟ το `src/` (`grep -rn "canceled\|suspended" src --include=*.ts`) δείχνει **μηδέν enforcement point**: ούτε το `resolveWorkspaceSession`, ούτε το `accountTenants`/`saasApi`, ούτε κανένα v1 feature-route auth path ελέγχει `tenant.status`. Το `accountTenants` φιλτράρει ΜΟΝΟ `Membership.status:'active'`, ΠΟΤΕ `Tenant.status`. Αποτέλεσμα: ένα canceled/suspended workspace παραμένει **πλήρως προσβάσιμο** — ο soft-cancel και το dunning είναι κοσμητικά (θέτουν flag + audit row που κανείς δεν διαβάζει). Η acceptance του `681a647` («blocks access») ΔΕΝ ικανοποιείται.
  - **ΣΗΜ επίπτωσης:** `SAAS_MODE`-only (dead-until-SaaS· μηδέν επίδραση self-hosted ή v1 mobile). Ομως όταν ανοίξει το SaaS, είναι billing/access-control correctness: ένας μη-πληρώνων (past_due→canceled) tenant συνεχίζει να χρησιμοποιεί την app. P2 γιατί είναι το enforcement που κάνει cancel/suspend/dunning να έχουν νόημα.
  - **Fix (μία απόφαση: πού μπαίνει το gate):** πρόσθεσε έναν κεντρικό έλεγχο `if (tenant.status === 'canceled' || tenant.status === 'suspended') → 403 { error, code:'workspace_inactive' }` στο **σημείο όπου resolve-άρεται το tenant context για write feature-routes + control-plane** (πιθανότερα στο `resolveWorkspaceSession` και/ή στο tenant-context resolution του v1 auth path). Απόφαση scope: (α) μπλοκάρεις read+write ή μόνο write (ώστε ο owner να μπορεί να δει/reactivate); (β) εξαιρείς το reactivate flow + το ίδιο το GET `/api/saas/workspace` ώστε ο owner να ξαναανοίξει. Πρότεινε: block feature-routes (v1) πλήρως, άφησε control-plane read (workspace GET, billing) ώστε reactivate/upgrade να δουλεύει.
  - **ΣΗΜ:** μην dropάρεις data· ΜΟΝΟ gate. Το drop της isolated data-db μένει manual (per το route docstring). Αν το scope είναι ασαφές (ποια ακριβώς routes gate + reactivate UX) → κόψε ένα «Needs Achilleas» sub-decision αντί να μαντέψεις.
  - Επαλήθευση: canceled tenant → v1 feature call → 403 (όχι 200)· reactivate path παραμένει προσβάσιμος· `grep -rn "status === 'canceled'\|status === 'suspended'" src/lib/tenancy` δείχνει ≥1 enforcement hit (όχι μόνο comment/audit/set).
  - npm run type-check exits 0
- Status: **CONTROL-PLANE HALF DONE 2026-07-03 (commit `b911882`)** — ο `resolveWorkspaceSession` (`workspaceSession.ts:84`) καλεί πλέον νέο pure guard `workspaceStatusError(tenant.status)` (`workspace.ts:52`) → 403 για `suspended`/`canceled`/`pending` σε ΟΛΑ τα workspace-scoped control-plane routes (members/audit/invites/rename)· το GET (view) + DELETE (idempotent soft-cancel) opt-out με `allowInactive` ώστε ο owner να βλέπει + reactivate. Η acceptance «`grep -rn "status === 'canceled'..." src/lib/tenancy` ≥1 enforcement hit» ΙΚΑΝΟΠΟΙΕΙΤΑΙ (workspaceSession.ts:84 + workspace.ts:52). **RESIDUAL → μεταφέρθηκε σε Needs Achilleas (PROGRESS 2026-07-03, 39η σάρωση):** το v1 feature data path (receipts/items/expenses…) ΔΕΝ είναι ακόμα tenant-scoped — ο `withAuth`→`bearerUser` (`apiAuth.ts:9`) resolve-άρει User by `apiToken`, μηδέν `getTenantContext`/tenant, άρα δεν υπάρχει σημείο να μπει `tenant.status` gate στο v1 σήμερα. Η v1-data-path enforcement εξαρτάται από (α) το v1 να γίνει tenant-scoped (μεγαλύτερο SaaS-data-isolation κομμάτι που δεν υπάρχει) + (β) read-vs-write product decision → όχι actionable ως standalone S/M builder item. Το control-plane μισό (το ενεργό enforcement που κάνει soft-cancel/dunning να έχουν νόημα) έκλεισε· βγαίνει από την ενεργή ουρά.

### saasGuard adoption σε invites/route.ts (DELETE write-route + GET) — missed από το try/catch slice 2/2
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/saas/invites/route.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα (κενό μετά το κλείσιμο του P2/M try/catch item):** το slice 2/2 (commit `a2e1811`) τύλιξε σε `saasGuard` ΟΛΑ τα write saas routes (members×4, invites/resend, billing checkout/portal, auth login/signup), και η DONE-note (row 459) απαρίθμησε ρητά τα read-only routes που αφέθηκαν σκόπιμα (`usage`/`session`/`logout`/`audit`/`billing GET`/`invites GET`/`invites/accept`/`webhook`). Ομως το **`invites/route.ts` DELETE** (revoke invite: `Invite.findOneAndUpdate({ _id, tenant, status:'pending' }, { status:'revoked' })`, γρ.89) είναι **write route** που ΔΕΝ μπήκε ΟΥΤΕ στη wrapped λίστα ΟΥΤΕ στη deliberately-left read-only λίστα → live: `grep -q 'saasGuard\|try {' invites/route.ts` = **μηδέν**. Ενα thrown `findOneAndUpdate()` / `connectDB()` βγαίνει ως framework-default 500 (HTML/κενό), ΟΧΙ `{ error }` — ασύμμετρο με το sibling `members` DELETE (wrapped). Το GET (`Invite.find(...)`, γρ.~46) έχει το ίδιο κενό (read, χαμηλότερη πιθανότητα throw).
  - **ΣΗΜ χαμηλής επίπτωσης:** owner/admin-gated + `SAAS_MODE`-only (dead-until-SaaS)· καθαρά error-shape consistency, ΟΧΙ security/data-integrity (τα `resolveWorkspaceSession` gate, `isObjectId` guard, `{_id,tenant,status:'pending'}` scope μένουν σωστά). Ολοκληρώνει το try/catch item — μετά από αυτό ΚΑΘΕ write saas route περνά από `saasGuard`.
  - **Fix:** `import { saasGuard } from '@/lib/tenancy/saasApi';` + τύλιξε τα σώματα GET και DELETE σε `return saasGuard(async () => { ...υπάρχον σώμα... });` (ίδιο pattern με members/route.ts). Το `resolveWorkspaceSession` gate (επιστρέφει early χωρίς throw), το `isObjectId` guard, τα response shapes (400/404/200 `{ revoked }`, GET `{ workspace, invites }`), το `recordAudit` — ΟΛΑ αμετάβλητα· αλλάζει ΜΟΝΟ ο unexpected throw → καθαρό `{ error }` 500.
  - Επαλήθευση: `grep -c 'saasGuard' src/app/api/saas/invites/route.ts` ≥ 2 (import + ≥1 wrap)· κανένα write saas route δεν μένει χωρίς `saasGuard`.
  - npm run type-check exits 0
- Status: DONE (2026-07-04 46η σάρωση επιβεβαίωσε κλείσιμο· builder commit `388246d` «fix(saas): wrap invites route GET+DELETE in saasGuard»· live: `saasGuard` import γρ.13 + GET(45) + DELETE(106) και τα δύο `return saasGuard(async () => {...})`· κάθε write saas route περνά πλέον από `saasGuard`)

### DELETE /api/saas/invites — λείπει id-format guard στο inviteId (CastError → 500) — DONE 2026-07-02
- Status: DONE (commit αυτού του run). Fix = `import { isObjectId }` από `apiBody` + `if (!isObjectId(inviteId)) return 400 'invalid inviteId'` μετά το `!inviteId` check, πριν το `Invite.updateOne`. Reuse του υπάρχοντος shared helper (όχι νέο inline regex). type-check EXIT 0, apiBody+invites suites 52/52 pass, web serve /login 200.
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/saas/invites/route.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα (εισήχθη με το commit `f4bdd8e` invites list/revoke):** το DELETE διαβάζει `body.inviteId` (trimmed string) και το περνά κατευθείαν στο `Invite.updateOne({ _id: inviteId, tenant, status:'pending' }, ...)` χωρίς έλεγχο μορφής. Ενα malformed inviteId (π.χ. `"abc"`) προκαλεί Mongoose CastError στο `_id` cast → uncaught (η route δεν έχει try/catch) → framework-default 500 αντί για καθαρό 400. Ο codebase έχει τεκμηριωμένη σύμβαση (βλ. `shopping-list/[id]` DONE 2026-06-30) ότι ΟΛΑ τα id-taking routes κάνουν validate `^[a-f0-9]{24}$` πριν φτάσει το id στη query. Αυτό είναι το ΜΟΝΟ id-taking route (μαζί με τα ήδη flagged saas billing) χωρίς guard.
  - **ΣΗΜ χαμηλής επίπτωσης:** owner/admin-gated + SAAS_MODE-only (dead-until-SaaS)· ένα malformed id απλώς δίνει 500 αντί 400/404 σε authed manager. Καθαρά consistency/robustness, όχι security ούτε data-integrity (το `status:'pending'` + `tenant` scope μένουν σωστά).
  - **Fix:** πρόσθεσε `const ID_RE = /^[a-f0-9]{24}$/i;` (ή reuse τυχόν shared guard) και μετά το `inviteId` trim: `if (!ID_RE.test(inviteId)) return NextResponse.json({ error: 'bad id' }, { status: 400 });` — πριν το `Invite.updateOne`. Καμία αλλαγή στα υπόλοιπα response shapes (400 `inviteId is required`, 404 `no pending invite`, 200 `{ revoked }`) ούτε στη σειρά των guards (το resolveWorkspaceSession μένει πρώτο).
  - Επαλήθευση: malformed inviteId → 400 αντί 500· `grep -n 'test(inviteId)' src/app/api/saas/invites/route.ts` δείχνει 1 hit.
  - npm run type-check exits 0
- Status: DONE 2026-07-02 (verified 35η σάρωση). Live: `invites/route.ts:4` κάνει `import { readBody, isObjectId } from '@/lib/apiBody';` + γρ.82 `if (!isObjectId(inviteId)) return 400 'invalid inviteId'` πριν το `findOneAndUpdate`. Το malformed id → 400 αντί CastError-500. (Το προηγ. trailing «TODO» ήταν stale· ο header ήδη έγραφε DONE.)

### Seat-cap ασυμμετρία — το existing-account add path ΔΕΝ μετράει τα pending invites
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/saas/members/route.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα (εισήχθη με το commit `c4a64c3` invite-by-email):** το ΝΕΟ invite path (`inviteUnregistered`, `members/route.ts`) μετράει σωστά το seat cap ως `activeCount + pendingCount` (active memberships ΣΥΝ outstanding pending invites) — ένα pending invite δεσμεύει μελλοντικό seat. Ομως το προϋπάρχον existing-account add path (POST, ίδιο αρχείο, ~γρ.219) μετράει ΜΟΝΟ `activeCount` (`Membership.countDocuments({ tenant, status:'active' })`) — αγνοεί τελείως τα pending invites. Ασυμμετρία: με cap=2, 1 active member + 1 pending invite, το να προσθέσεις έναν ΥΠΑΡΧΟΝΤΑ account περνάει (`withinSeatLimit(plan, 1)` → true) → κατάληξη 2 active + 1 pending = 3 δεσμευμένα seats, πάνω από το cap. Ενας owner μπορεί να ξεπεράσει το plan allowance συνδυάζοντας invites + existing-account adds.
  - **ΣΗΜ χαμηλής επίπτωσης:** ο owner πληρώνει, το accept-time ΔΕΝ ξανα-ελέγχει cap (ο invite μετρήθηκε στο mint), και το overshoot είναι bounded από το πλήθος outstanding invites. Καθαρά billing-correctness inconsistency, όχι security. Flag για συνέπεια — μόλις υπάρχει η έννοια «pending invite δεσμεύει seat», ΚΑΘΕ seat-check πρέπει να την τιμά.
  - **Fix:** στο existing-account branch, πρόσθεσε το pending-invite count στο seat check ώστε να ταιριάζει με το invite path: `const pendingCount = await Invite.countDocuments({ tenant: tenantId, status: 'pending' }); if (!withinSeatLimit(plan, activeCount + pendingCount)) { ... }`. (Το `Invite` model είναι ήδη imported στο route.) Reactivation ενός removed member μετράει επίσης seat, οπότε το ίδιο branch τα καλύπτει και τα δύο.
  - Response shapes (409 `{ error, code:'seat_limit', maxMembers }`, 201 `{ member }`) + η σειρά των guards + το `withinSeatLimit`/`entitlementsFor` API ΜΕΝΟΥΝ ως έχουν· αλλάζει ΜΟΝΟ το count που περνά στο `withinSeatLimit`. SaaS-only, μηδέν επίδραση στον self-hosted ή v1 mobile surface (`SAAS_MODE` off → κανένα invite ποτέ).
  - Επαλήθευση: το existing-account seat check διαβάζει `activeCount + pendingCount` (ίδιο με το `inviteUnregistered`)· `grep -n 'pendingCount' src/app/api/saas/members/route.ts` δείχνει 2 hits (invite path + existing path).
  - npm run type-check exits 0
- Status: DONE 2026-07-02 (pharos-daily-dev). Το existing-account POST branch μετράει πλέον `activeCount + pendingCount` (`Invite.countDocuments({ tenant, status:'pending' })`) όπως το invite path· `grep -n 'pendingCount' src/app/api/saas/members/route.ts` = 2 hits. Response shapes/guards/API αμετάβλητα. type-check EXIT 0, seatLimits+members tests pass, safe Docker rebuild `/login` 200 + `POST /api/saas/members` no-auth → 401 (gated, όχι 500).

### SaaS route handlers χωρίς try/catch → ασυνεπές 500 error-shape vs v1 `withAuth`
- Priority: P2
- Size: M
- Area: shared
- Files: apps/web/src/lib/apiAuth.ts (ή νέο `lib/tenancy/saasApi.ts` helper), apps/web/src/app/api/saas/account/verify/request/route.ts, apps/web/src/app/api/saas/account/verify/confirm/route.ts, apps/web/src/app/api/saas/account/reset/request/route.ts, apps/web/src/app/api/saas/account/reset/confirm/route.ts, apps/web/src/app/api/saas/account/password/route.ts, apps/web/src/app/api/saas/members/route.ts, apps/web/src/app/api/saas/invites/resend/route.ts, apps/web/src/app/api/saas/billing/checkout/route.ts, apps/web/src/app/api/saas/billing/portal/route.ts
- Depends on: none
- Acceptance:
  - **Το πρόβλημα:** κάθε v1 route περνά από `withAuth` (`lib/apiAuth.ts:27`) που τυλίγει τον handler σε `try/catch` → σε thrown error γυρίζει καθαρό `apiError(msg, 500)` = `{ error }`. Τα SaaS routes ΔΕΝ έχουν αντίστοιχο wrapper: **16/16** δεν έχουν `try {` (live 2026-07-02 34η σάρωση: `for f in $(find src/app/api/saas -name route.ts); do grep -q 'try {' "$f" || echo "$f"; done` = usage, members, invites, invites/resend, billing×3, auth/{login,logout,session}, account×5 [password + reset/{request,confirm} + verify/{request,confirm}], usage/sample). Το νέο `invites/resend/route.ts` (commit `bf503cb`) εντάχθηκε στο ίδιο pattern (write path: `findOneAndUpdate` re-mint· ένα DB throw → framework 500). Στα write paths (account/verify+reset+password, members, invites/resend, billing) ένα thrown `account.save()` / `findOneAndUpdate()` / `connectDB()` / Stripe error βγαίνει ως framework-default 500 (κενό ή HTML body), ΟΧΙ ως το `{ error }` shape που περιμένει ο SaaS client — inconsistency με ολόκληρο τον v1 surface.
  - **Fix:** πρόσθεσε shared helper (mirror του `withAuth` catch, χωρίς το auth κομμάτι), π.χ. `export async function saasRoute(fn: () => Promise<NextResponse>): Promise<NextResponse>` σε `lib/apiAuth.ts` ή `lib/tenancy/saasApi.ts`: `try { return await fn(); } catch (e) { return apiError((e as Error).message?.slice(0,200) || 'Server error', 500); }`. Adoption ΜΟΝΟ στα DB-write routes της λίστας (τα read-only `usage`/`session`/`logout` σπάνια throw → μπορούν να μείνουν)· ο κάθε handler τυλίγει το body του μετά το `saasAuthGate()`/session gate (τα οποία επιστρέφουν early χωρίς throw, μένουν έξω).
  - Response shapes (validation 400/401/403/404/409, success `{ ok }`/`{ url,id }`/`{ workspace, members }`) + η σειρά των gate-ladders ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν· αλλάζει ΜΟΝΟ η συμπεριφορά σε **unexpected throw** (τώρα → καθαρό `{ error }` 500). SaaS-only, μηδέν επίδραση στον v1 mobile surface.
  - ΣΗΜ scope: αν φανεί μεγάλο, split — S πρώτα (helper + account/* 5 routes), μετά S (members + billing 3 routes).
  - Επαλήθευση: κάθε write route της λίστας έχει το thrown-path να περνά από τον helper· `grep -rn 'saasRoute\|try {' src/app/api/saas/account` δείχνει coverage στα 5 account routes.
  - npm run type-check exits 0
- Status: DOING — **slice 1/2 DONE 2026-07-02 (pharos-daily-dev)**. Νέος helper `saasGuard(fn)` στο `lib/tenancy/saasApi.ts` (mirror του `withAuth` catch: `try { return await fn(); } catch (e) { return NextResponse.json({ error: (e as Error).message?.slice(0,200) || 'Server error' }, { status: 500 }); }`) + adopted στα **6 account/* files (7 handlers)**: `account/route.ts` (GET+PATCH), `account/password`, `account/reset/{request,confirm}`, `account/verify/{request,confirm}`. Gate ladders + validation + όλες οι deliberate short-circuits αμετάβλητες· αλλάζει ΜΟΝΟ ο unexpected throw → καθαρό `{ error }` 500. Νέο `saasGuard.test.ts` (6 tests: happy pass-through, gate-404 pass-through, throw→500{error}, 200-char slice, empty→'Server error', no-extra-keys). type-check EXIT 0, 23/23 tests green, safe Docker rebuild `/login` 200 + `GET/POST /api/saas/account*` no-auth → **401 (gated, όχι 500)**, RestartCount 0. **slice 2/2 TODO** = members + invites/resend + billing×3 + auth/{login,signup} (adopt `saasGuard` στο ίδιο pattern).
- Status: **DONE 2026-07-02 (pharos-daily-dev — slice 2/2)**. Adopted `saasGuard` στα **6 εναπομείναντα write routes (8 handlers)**: `members/route.ts` (GET+POST+PATCH+DELETE), `invites/resend/route.ts` (POST), `billing/checkout` (POST), `billing/portal` (POST), `auth/login` (POST), `auth/signup` (POST). Ίδιο `return saasGuard(async () => { ...υπάρχον σώμα... })` pattern με clean re-indent· gate ladders (`resolveWorkspaceSession`/`resolveBillingSession`/`saasAuthGate`), validation (400/403/404/409), το internal 11000 try/catch του signup, τα `StripeResult` degradation paths (503/502), fire-and-forget mail, `recordAudit` — ΟΛΑ αμετάβλητα· αλλάζει ΜΟΝΟ ο unexpected throw → καθαρό `{ error }` 500. type-check EXIT 0, 15/15 tests green (saasGuard+apiAuth), safe Docker rebuild `/login` 200 (1η) + και τα 8 wrapped endpoints no-auth → **401 (gated, όχι 500)**, RestartCount 0. **Το try/catch item κλείνει πλήρως** — κάθε write saas route (account/* + members + invites/resend + billing + auth) περνά πλέον από `saasGuard`. (Τα read-only `usage`/`session`/`logout`/`audit`/`billing GET`/`invites GET`/`invites/accept`/`webhook` αφέθηκαν σκόπιμα: είτε σπάνια throw-ουν είτε έχουν δικό τους handling — δες observation rows 60/72/84/108.)

### Sparse index στα Account token-hash fields (verifyTokenHash / resetTokenHash)
- Priority: P3
- Size: S
- Area: db
- Files: apps/web/src/models/Account.ts
- Depends on: none
- Acceptance:
  - Τα confirm routes κάνουν `Account.findOne({ verifyTokenHash: ... })` (`verify/confirm/route.ts:29`) και `Account.findOne({ resetTokenHash: ... })` (`reset/confirm/route.ts:35`) σε **unindexed** πεδία (`Account.ts:24,26` — απλά `{ type: String, default: null }`, μόνο το `email` έχει `unique` index). Collection-scan σε κάθε verify/reset confirm.
  - **ΣΗΜ low-urgency:** το Account collection είναι μία εγγραφή ανά SaaS owner (μικρό) + οι confirm ops είναι σπάνιες → ελάχιστο πρακτικό κόστος σήμερα. Το flag είναι για consistency (κάθε queried field θέλει index) + future scale.
  - **Fix:** `Schema.index({ verifyTokenHash: 1 }, { sparse: true })` + `Schema.index({ resetTokenHash: 1 }, { sparse: true })` (sparse γιατί default `null` → δεν indexάρει τα κενά, ο lookup είναι πάντα με non-null hash). Μηδέν αλλαγή runtime λογικής.
  - Επαλήθευση: `grep -n 'index(' src/models/Account.ts` δείχνει τα 2 νέα sparse indexes.
  - npm run type-check exits 0
- Status: DONE (2026-07-04 46η σάρωση επιβεβαίωσε κλείσιμο· builder commit `ac35ca3` «perf(saas): sparse index Account verify/reset token hashes»· live: `AccountSchema.index({ verifyTokenHash: 1 }, { sparse: true })` γρ.37 + `resetTokenHash` sparse index γρ.38· τα confirm lookups δεν κάνουν πια collection-scan)

### Constant-time CRON_SECRET compare — saas/usage/sample route (timing side-channel)
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/saas/usage/sample/route.ts
- Depends on: none
- Acceptance:
  - Το ΝΕΟ cron endpoint (commit `f8aaea4`) συγκρίνει το bearer token με **plain string equality**: live `src/app/api/saas/usage/sample/route.ts:31` → `if (!token || token !== secret) { return ... 401 }`. Αυτό είναι non-constant-time → timing side-channel στο `CRON_SECRET` (byte-by-byte early-exit διαρρέει μήκος/prefix).
  - Το ίδιο billing subsystem έχει ΗΔΗ καθιερωμένο το σωστό pattern: `lib/billing/stripe.ts:142` → `sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)`, και `lib/auth.ts:43` → `actual.length === expected.length && timingSafeEqual(actual, expected)`. ΔΕΝ υπάρχει exported shared helper· και τα δύο κάνουν inline το length-guard + `timingSafeEqual(Buffer, Buffer)` — ακολούθησε το ΙΔΙΟ inline pattern (μηδέν νέο helper).
  - Swap: πρόσθεσε `import { timingSafeEqual } from 'node:crypto';` (top του route)· η γραμμή 401-check γίνεται: πρώτα `if (!token) return 401`, μετά compare με buffers ίσου μήκους — π.χ. `const a = Buffer.from(token); const b = Buffer.from(secret); if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });`. Το length-guard είναι απαραίτητο (`timingSafeEqual` throws σε άνισα μήκη).
  - Η σειρά gate (`saasMode()` 404 → `CRON_SECRET` unset 500 → token 401) + το `{ ok: true, ...result }` success shape + το `sampleAllTenants()` call ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν. Είναι saas-only endpoint (δεν αγγίζει τον v1 mobile surface).
  - Επαλήθευση: `grep -n 'timingSafeEqual' src/app/api/saas/usage/sample/route.ts` επιστρέφει hit· `grep -n 'token !== secret' src/app/api/saas` επιστρέφει μηδέν.
  - npm run type-check exits 0
- Status: DONE (verified 2026-07-02 auditor) — live: `usage/sample/route.ts:2` κάνει `import { timingSafeEqual } from 'node:crypto';` + local `constEq(a,b)` (γρ.14) = `a.length === b.length && timingSafeEqual(a, b)` που χρησιμοποιείται στο bearer compare. `grep 'token !== secret' src/app/api/saas` = **μηδέν**. Ο builder το έκλεισε· stale-marked TODO.

### Reset-request route — timing side-channel αποδυναμώνει το anti-enumeration
- Priority: P3
- Size: S
- Area: shared
- Files: apps/web/src/app/api/saas/account/reset/request/route.ts
- Depends on: none
- Acceptance:
  - Το route (commit `10d9656`) γυρίζει ΠΑΝΤΑ `{ ok: true }` για να μη διαρρέει ποιο email είναι registered (anti-enumeration, σωστό). Όμως το **response-time delta** το προδίδει: registered email → `findOne` + `account.save()` (DB write) + (όταν `resetDeliveryConfigured()`) **await `sendEmail()`** (Resend network round-trip)· non-registered → `findOne` και άμεσο return. Ο attacker διακρίνει registered emails μετρώντας latency, ακυρώνοντας εν μέρει το `{ ok: true }` design. Το νέο `await sendEmail` (network) διευρύνει αισθητά το gap που πριν ήταν μόνο DB-write.
  - **ΣΗΜ (γιατί flag, όχι fix):** dead-until-SaaS (gated πίσω από `saasAuthGate()`, `SAAS_MODE` off = μηδέν επίδραση στο single-user app). Η μείωση του gap είναι tradeoff, όχι μηχανικό swap: το members route κάνει ήδη fire-and-forget `void sendEmail(...)`, οπότε το reset route θα μπορούσε να το ίδιο (αφαιρεί το network-time delta + ευθυγραμμίζεται) — ΑΛΛΑ το `await` υπάρχει σκόπιμα ώστε να εξασφαλίζεται η αποστολή πριν το response· `void` σε πιθανό serverless deploy ρισκάρει να κοπεί το send. Το DB-write delta παραμένει ούτως ή άλλως. Θέλει σκόπιμη απόφαση delivery-semantics, όχι unattended fix.
  - Πιθανή κατεύθυνση (αν εγκριθεί): fire-and-forget `void sendEmail(...)` όπως το members route (ίδιο best-effort pattern), ή/και ενοποίηση των δύο branch-times ώστε registered/non-registered να έχουν παρόμοιο κόστος.
  - npm run type-check exits 0
- Status: DONE (verified 2026-07-15, 53η σάρωση web-code-quality auditor) — live: το route έχει ξαναγραφτεί από τότε (commit `e75cd74` «feat(saas): constant-time reset-request response (D6)», μαζί με νέο `lib/tenancy/resetTiming.ts`). Ο κώδικας πλέον: (α) ξεκινά `startedAt = Date.now()` πριν από οποιαδήποτε account-dependent δουλειά, (β) το outbound email πάει μέσω fire-and-forget `void sendEmail(...).catch(() => {})` (μηδέν network latency στο timed path, ακριβώς η κατεύθυνση που πρότεινε το item), (γ) ΚΑΘΕ response (found ή not-found) περνάει από `await settleMinResponseTime(startedAt)` πριν το `return` — padding σε σταθερό floor (`RESET_MIN_RESPONSE_MS = 500`, pure+unit-tested `resetResponseDelayMs`). Το παλιό «no-account fast-path πριν το mint+store+mail» δεν υπάρχει πια· και τα δύο branches settle στον ίδιο χρόνο. Ο builder το έκλεισε χωρίς να ενημερώσει το item (stale-marked TODO).

### Dedup ObjectId-validation regex — SaaS billing webhook (isObjectId re-introduced inline)
- Priority: P3
- Size: S
- Area: shared
- Files: apps/web/src/app/api/saas/billing/webhook/route.ts
- Depends on: none
- Acceptance:
  - Ο νέος SaaS billing webhook (commit `3c6bcc4`) **ξανα-εισήγαγε** inline ObjectId regex — το ακριβές debt που είχε κλείσει για ολόκληρο το v1 (isObjectId dedup, 4 παρτίδες). Live: `grep -rn '\[a-f0-9\]{24}' src/app/api/saas src/lib/tenancy src/lib/billing` = **1 hit** → `webhook/route.ts:81`, μέσα στο `resolveTenant`: `if (tenantId && /^[a-f0-9]{24}$/i.test(tenantId)) {`.
  - Swap **byte-identical**: το shared `isObjectId(id)` στο `@/lib/apiBody` είναι ακριβώς `/^[a-f0-9]{24}$/i.test(id)` (pure string helper, μηδέν server-only import· ήδη importable σε route files, π.χ. `items/[id]/ai-fill/route.ts` το κάνει import). Αλλαγή: νέο `import { isObjectId } from '@/lib/apiBody';` (δίπλα στα υπάρχοντα imports) + η γραμμή γίνεται `if (tenantId && isObjectId(tenantId)) {`. Μηδέν αλλαγή συμπεριφοράς.
  - Το route μένει node runtime + SaaS-gated· `Tenant.findById` / `Tenant.findOne({ billingCustomerId })` fallback, signature-verify, event-switch, response shapes ΟΛΑ αμετάβλητα. Δεν αγγίζει τον v1 mobile surface (SaaS-only endpoint).
  - Επαλήθευση: `grep -rn '\[a-f0-9\]{24}' src/app/api src/lib/tenancy src/lib/billing` επιστρέφει **μηδέν** (πλήρης εξάλειψη inline ObjectId regex σε ΟΛΟ το api + tenancy + billing).
  - npm run type-check exits 0
- Status: DONE (verified 2026-07-02 auditor) — live: `webhook/route.ts:7` κάνει `import { isObjectId } from '@/lib/apiBody';` + γρ.82 `if (tenantId && isObjectId(tenantId)) {`. `grep -rn '\[a-f0-9\]{24}' src/app/api src/lib/tenancy src/lib/billing` = **μηδέν**. Stale-marked TODO, ο builder το έκλεισε.

### apiBody helpers — readBody adoption σε saas billing checkout + portal POST
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/saas/billing/checkout/route.ts, apps/web/src/app/api/saas/billing/portal/route.ts
- Depends on: none
- Acceptance:
  - Επεκτείνει το ήδη-κλεισμένο readBody adoption effort στον saas surface. Τα saas auth routes (`signup`/`login`) είναι ΗΔΗ adopters του `readBody`· τα 2 billing routes είναι τα ΜΟΝΑ saas routes που κρατούν raw `req.json().catch` (live-verified: `grep -rln 'req.json().catch' src/app/api` = μόνο `saas/billing/checkout` + `saas/billing/portal`).
  - **ΟΧΙ byte-identical, χρειάζεται coercion** (γι' αυτό ξεχωριστό item): σήμερα `checkout/route.ts:26` = `const body = (await req.json().catch(() => ({}))) as { plan?: string; tenant?: string };` και `portal/route.ts:27` = `const body = (await req.json().catch(() => ({}))) as { tenant?: string };`. Ο `as {...}` cast «λέει ψέματα» (runtime τα values μπορεί να είναι number/object). Downstream: `resolveBillingSession(wantSlug: string | null)` (`billingSession.ts:30`) + `checkoutablePlan(plan: string | null | undefined)` (`billingRoutes.ts:23`).
  - Swap (import `{ readBody, strField }` από `@/lib/apiBody` σε καθένα· κανένα από τα 2 files δεν έχει ήδη apiBody import):
    - **checkout:** `const b = await readBody(req);` → `const resolved = await resolveBillingSession(strField(b, 'tenant') || null);` + `const plan = checkoutablePlan(strField(b, 'plan') || null);`. Το `strField(b, k)` = `String(b[k] || '')` → για string value ίδιο αποτέλεσμα, για absent → `''` → `|| null` = `null` (ίδιο με το παλιό `body.tenant ?? null` / `body.plan` undefined). `checkoutablePlan` δέχεται `string | null` → ΟΚ.
    - **portal:** `const b = await readBody(req);` → `const resolved = await resolveBillingSession(strField(b, 'tenant') || null);`.
  - `readBody` επιστρέφει `Body = Record<string, unknown>` → τα `strField(...)` δίνουν `string` → τέλος ο ψευδής cast. Το `resolveBillingSession` gate-ladder, το `pickBaseUrl`, το `StripeResult` branch (503/502), τα success shapes (`{ url, id }`) ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν. SaaS-only routes → μηδέν επίδραση στον v1 mobile surface.
  - Επαλήθευση: `grep -rln 'req.json().catch' apps/web/src/app/api` επιστρέφει **μηδέν** αρχεία (πλήρες κλείσιμο readBody adoption σε ΟΛΟ το api, v1 + saas).
  - npm run type-check exits 0
- Status: DONE (verified 2026-07-02 auditor) — live: `checkout/route.ts:5` + `portal/route.ts:5` κάνουν `import { readBody, strField } from '@/lib/apiBody';`· checkout γρ.27-33 `const body = await readBody(req);` + `strField(body,'tenant')` + `checkoutablePlan(strField(body,'plan'))`· portal γρ.28-30 ίδιο pattern. Stale-marked TODO, ο builder το έκλεισε.

### apiBody helpers — readBody adoption σε saas/members POST + PATCH + DELETE
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/saas/members/route.ts
- Depends on: none
- Acceptance:
  - Ο ΝΕΟΣ workspace-members route (commit `090cd41`) ξανα-εισήγαγε raw `(await req.json().catch(() => ({}))) as {...}` σε **3** methods: `POST` (`{ email?; role?; tenant? }`, γρ.90), `PATCH` (`{ accountId?; role?; tenant? }`, γρ.171), `DELETE` (`{ accountId?; tenant? }`, γρ.217). Ίδιο consistency debt με το ήδη ανοιχτό checkout+portal item — ο `as {...}` cast «λέει ψέματα» (runtime τα values μπορεί να μην είναι string).
  - Swap (import `{ readBody, strField }` από `@/lib/apiBody` — το file δεν έχει ήδη apiBody import): σε καθεμία method `const b = await readBody(req);` και μετά διάβασε τα πεδία με `strField(b, 'email')` / `strField(b, 'accountId')` / `strField(b, 'tenant')` / `strField(b, 'role')`. Το `strField(b,k)` = `String(b[k] || '')` → για string ίδιο, για absent → `''`. Πρόσεξε τα downstream: `resolveWorkspaceSession(wantSlug: string | null)` θέλει `strField(b,'tenant') || null`· `parseRole(x: unknown)` δέχεται ήδη `unknown` άρα μπορείς να του δώσεις `strField(b,'role')` (ή `b.role`)· το `role == null ? 'member' : parseRole(...)` του POST πρέπει να διατηρήσει το «absent → default member» (π.χ. `const rawRole = strField(b,'role'); const role = rawRole === '' ? 'member' : parseRole(rawRole);`).
  - Τα gate-ladders (`resolveWorkspaceSession` 404/401/403), οι έλεγχοι `looksLikeEmail`/`canAssignRole`/`wouldOrphanOwners`, τα status codes (400/403/404/409/201) και τα success shapes ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν. SaaS-only route → μηδέν επίδραση στον v1 mobile surface.
  - Επαλήθευση: `grep -rln 'req.json().catch' apps/web/src/app/api/saas/members` επιστρέφει **μηδέν**.
  - npm run type-check exits 0
- Status: DONE (verified 2026-07-02 auditor) — live: `members/route.ts:14` κάνει `import { readBody, strField } from '@/lib/apiBody';`· και τα 3 methods (POST γρ.93, PATCH γρ.192, DELETE γρ.234) `const body = await readBody(req);` + `strField(body,'tenant'|'email'|'accountId'|'role')`. `grep 'req.json().catch' members` = **μηδέν**. Stale-marked TODO, ο builder το έκλεισε.

### apiBody helpers — readBody adoption σε shopping-list POST (τελευταίο raw-body route)
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/shopping-list/route.ts
- Depends on: none
- Acceptance:
  - **Κλείνει** το apiBody adoption effort: το `shopping-list/route.ts` POST είναι το **ΜΟΝΟ** εναπομείναν v1 route με raw `req.json().catch` (live-verified: `grep -rln 'req.json().catch' apps/web/src/app/api/v1` = μόνο αυτό το file). `readBody` adopters = **28**.
  - **ΟΧΙ byte-identical, χρειάζεται coercion** (γι' αυτό ξεχωριστό item): σήμερα η γραμμή είναι `const b = (await req.json().catch(() => ({}))) as Record<string, string>;` και περνά `b.name`/`b.quantity`/`b.category`/`b.brand`/`b.note` **κατευθείαν** στο `addListItem({ name: b.name, ... })`. Το `NewItem` έχει string πεδία, οπότε ο τρέχων cast «λέει ψέματα» (runtime τα values μπορεί να είναι number/object).
  - Swap: `const b = await readBody(req);` (import `{ readBody, strField }` από `@/lib/apiBody`) + πέρασε `{ name: strField(b, 'name'), quantity: strField(b, 'quantity'), category: strField(b, 'category'), brand: strField(b, 'brand'), note: strField(b, 'note') }`. Το `strField(b, k)` = `String(b[k] || '')` → downstream το `addListItem` ήδη κάνει `(data.x || '').trim()` → **ίδιο αποτέλεσμα για strings**, και ΕΠΙΠΛΕΟΝ αποτρέπει latent crash: με μη-string value (π.χ. `quantity: 5`) ο παλιός κώδικας θα έφτανε στο `(5 || '').trim()` → `TypeError: .trim is not a function`· το `strField` το κάνει `'5'` πρώτα.
  - `readBody` επιστρέφει `Body = Record<string, unknown>` → τα `strField(...)` δίνουν `string` → ταιριάζουν με `NewItem` (τέλος ο ψευδής `Record<string,string>` cast). Το `withAuth` wrapper, ο `if (!r.ok) return apiError(...)` κλάδος, το `{ ok: true, items }` + status 201 response shape ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν → μηδέν κίνδυνος για τον mobile consumer.
  - Επαλήθευση: `grep -rln 'req.json().catch' apps/web/src/app/api/v1` επιστρέφει **μηδέν** αρχεία (πλήρες κλείσιμο του readBody adoption).
  - npm run type-check exits 0
- Status: DONE (2026-07-02, commit `6fd1075`) — live-verified 27η σάρωση: `shopping-list/route.ts:17-18` κάνει πλέον `const b = await readBody(req);` + `strField(b, 'name'|'quantity'|'category'|'brand'|'note')` (import `{ readBody, strField }`). `grep -rn 'req.json().catch' src/app/api` = **μηδέν** σε ΟΛΟ το api· `readBody` adopters v1 = **29**. Το apiBody/readBody adoption effort **ΕΚΛΕΙΣΕ πλήρως**. Τα 2 εναπομείναντα raw `req.json()` (auth/login boundary, items/[id]/ai-fill) είναι σωστά try/catch-wrapped + safe-cast → όχι debt. tsc EXIT 0.

### apiBody helpers — readBody adoption σε scan/expense + scan/voucher POST
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/scan/expense/route.ts, apps/web/src/app/api/v1/scan/voucher/route.ts
- Depends on: none
- Acceptance:
  - Συνέχεια (και σχεδόν κλείσιμο) του apiBody adoption. Απομένουν μόλις **3** raw-body routes με `req.json().catch` (scan/expense, scan/voucher, shopping-list POST)· `readBody` adopters = **26**. Το shared `readBody` ζει στο `lib/apiBody.ts` (επιστρέφει `Body` = `Record<string, unknown>`, δεν πετάει· bad/empty JSON → `{}`).
  - Και τα δύο routes έχουν **πανομοιότυπο** inline pattern μέσα σε ternary (JSON branch):
    `String(((await req.json().catch(() => ({}))) as { text?: unknown }).text || '')`
    → `String((await readBody(req)).text || '')`. Το `readBody(req)` επιστρέφει ήδη `Record<string, unknown>` → `.text` είναι `unknown` → `String(unknown || '')` δουλεύει· byte-behavior-identical (το `readBody` τυλίγει το ίδιο `req.json().catch(() => ({}))`, ίδιο no-throw semantics).
  - Imports: κανένα από τα 2 files δεν έχει ήδη `@/lib/apiBody` import → σε καθένα νέο `import { readBody } from '@/lib/apiBody';` (δίπλα στο `import { withAuth, apiError } from '@/lib/apiAuth';`). Το multipart branch (`scanExpenseImage`/`scanVoucherImage(await req.formData())`) ΜΕΝΕΙ ΑΚΡΙΒΩΣ ως έχει — μόνο το JSON-text branch αλλάζει.
  - Το `apiError(r.error, 400)` + το `{ data }` response shape + η σειρά content-type ternary ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν. Καμία αλλαγή σε behaviour → μηδέν κίνδυνος για τον mobile consumer.
  - **Εκτός scope (needs care, όχι εδώ):** `shopping-list/route.ts` POST κάνει `as Record<string, string>` και περνά `b.name`/`b.quantity`/... κατευθείαν ως strings στο `addListItem` (`NewItem = { name: string; ... }`). Το `readBody` επιστρέφει `unknown` values → θα χρειαστεί coercion (`String(b.name ?? '')` κ.λπ.), ΟΧΙ byte-identical → ξεχωριστό item σε επόμενο run.
  - Επαλήθευση: `grep -rln 'req.json().catch' apps/web/src/app/api/v1` επιστρέφει πλέον μόνο `shopping-list/route.ts`· `readBody` adopters 26 → 28.
  - npm run type-check exits 0
- Status: DONE (2026-07-01, commits `4503640` + `875264b`) — live-verified 26η σάρωση: `scan/expense/route.ts:20` + `scan/voucher/route.ts:18` κάνουν πλέον `String((await readBody(req)).text || '')` (import `{ readBody }`). Απομένει **μόνο** το `shopping-list` POST με raw `req.json().catch` (νέο top item παραπάνω). tsc EXIT 0.

### Dedup ObjectId-validation regex — 4η (τελευταία) παρτίδα (7 route files)
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/receipts/[id]/rescan/route.ts, apps/web/src/app/api/v1/receipts/[id]/add-to-library/route.ts, apps/web/src/app/api/v1/items/[id]/link-plan/route.ts, apps/web/src/app/api/v1/items/[id]/plans/route.ts, apps/web/src/app/api/v1/items/[id]/convert-to-task/route.ts, apps/web/src/app/api/v1/items/[id]/ai-fill/route.ts, apps/web/src/app/api/v1/items/[id]/price/route.ts
- Depends on: none
- Acceptance:
  - **Κλείνει** το `isObjectId()` dedup effort (1η παρτίδα items/[id]+shopping-list/[id]· 2η receipts/expenses/subscriptions/tasks/vouchers [id]· 3η cards/[id]+stores/[id]+statements/[id]+notifications+trash/[type]/[id]). Το shared `export function isObjectId(id: string): boolean` ζει ΗΔΗ στο `lib/apiBody.ts` (byte-identical `/^[a-f0-9]{24}$/i.test(id)`).
  - Σε καθένα από τα 7 route files: αντικατέστησε τον inline `!/^[a-f0-9]{24}$/i.test(id)` με `!isObjectId(id)`. Occurrences (8 συνολικά, όλα `apiError('bad id')` + status 400): receipts/[id]/rescan **1** (γρ.21), receipts/[id]/add-to-library **1** (γρ.15), items/[id]/link-plan **2** (γρ.14,28), items/[id]/plans **1** (γρ.19), items/[id]/convert-to-task **1** (γρ.14), items/[id]/ai-fill **1** (γρ.18), items/[id]/price **1** (γρ.13).
  - Imports: **κανένα** από τα 7 files δεν έχει ήδη `@/lib/apiBody` import → σε καθένα νέο `import { isObjectId } from '@/lib/apiBody';` (δίπλα στα υπόλοιπα lib imports).
  - Το μήνυμα σφάλματος, ο status 400, και η σειρά auth-πριν-id ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν. Καμία αλλαγή σε behaviour / response shape → μηδέν κίνδυνος για τον mobile consumer.
  - Επαλήθευση: `grep -rl '\[a-f0-9\]{24}' apps/web/src/app/api/v1` επιστρέφει **μηδέν** αρχεία (πλήρης εξάλειψη του inline regex από όλο το v1)· `isObjectId` adopters 12 → 19.
  - npm run type-check exits 0
- Status: DONE (2026-07-01, commit `f17f279`) — και τα 7 deep sub-routes migrated· live-verified στην 24η σάρωση: `grep -rln '\[a-f0-9\]{24}' src/app/api/v1` = **NONE** (πλήρης εξάλειψη), `isObjectId` adopters = **19**. Το `isObjectId()` dedup effort **ΕΚΛΕΙΣΕ** (1η→4η παρτίδα ολοκληρωμένη). tsc EXIT 0.

### apiBody helpers — readBody adoption σε settings + stores/[id] PATCH
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/settings/route.ts, apps/web/src/app/api/v1/stores/[id]/route.ts
- Depends on: none
- Acceptance:
  - Συνέχεια του apiBody adoption (16 routes ήδη adopters `readBody`). Το shared `readBody` ζει στο `lib/apiBody.ts`, επιστρέφει `Body` = `Record<string, unknown>` (δεν πετάει· bad/empty JSON → `{}`).
  - **settings PATCH** (γρ.72): `const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;` → `const b = await readBody(req);`. Το settings δεν έχει ακόμα apiBody import → νέο `import { readBody } from '@/lib/apiBody';`. ΟΛΑ τα typeof-based guards (currency/defaultVatRate/defaultItemView/warranty/ntfy/budgets κ.λπ.) ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν.
  - **stores/[id] PATCH** (γρ.25): ίδια αλλαγή στη γραμμή body-parse. Το stores/[id] έχει ΗΔΗ `import { isObjectId } from '@/lib/apiBody'` → γίνεται `import { isObjectId, readBody } from '@/lib/apiBody'`. Τα partial-update guards (name/aliases/... ) αμετάβλητα.
  - Μόνο η γραμμή body-parse αλλάζει (το inline `as Record<string, unknown>` cast αφαιρείται, ίδιος τύπος `Body`)· καμία αλλαγή σε validation behaviour / response shape.
  - Απομένουν ~11 raw routes με το ίδιο pattern (receipts/[id], receipts/[id]/rescan, scan/expense, scan/voucher, push/register, shopping-list POST, ai, ai/subscription, items/[id]/link-plan, items/[id]/price, items/import) για μελλοντικά runs (1-2/run).
  - npm run type-check exits 0
- Status: DONE (2026-07-01, 25η σάρωση) — live-verified: `settings/route.ts:73` + `stores/[id]/route.ts:25` κάνουν πλέον `const b = await readBody(req);` (imports `{ readBody }` / `{ isObjectId, readBody }`). Ο builder το κατανάλωσε μαζί με πολλά άλλα readBody swaps· `req.json().catch` απομένει μόνο σε 3 routes.

### apiBody helpers — readBody adoption σε receipts/[id] + receipts/[id]/rescan PATCH
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/receipts/[id]/route.ts, apps/web/src/app/api/v1/receipts/[id]/rescan/route.ts
- Depends on: none
- Acceptance:
  - Συνέχεια του apiBody adoption (16 routes ήδη adopters `readBody`). Το shared `readBody` ζει στο `lib/apiBody.ts`, επιστρέφει `Body` = `Record<string, unknown>` (δεν πετάει· bad/empty JSON → `{}`).
  - **receipts/[id] PATCH** (γρ.36): `const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;` → `const b = await readBody(req);`. Το file έχει ΗΔΗ `import { isObjectId } from '@/lib/apiBody'` (γρ.3) → γίνεται `import { isObjectId, readBody } from '@/lib/apiBody'`.
  - **receipts/[id]/rescan PATCH** (γρ.23): ίδια αλλαγή στη γραμμή body-parse· έχει ΗΔΗ `import { isObjectId } from '@/lib/apiBody'` (γρ.3) → `import { isObjectId, readBody } from '@/lib/apiBody'`.
  - Μόνο η γραμμή body-parse αλλάζει (το inline `as Record<string, unknown>` cast αφαιρείται, ίδιος τύπος `Body`)· ΟΛΑ τα partial-update field guards + response shapes ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν· καμία αλλαγή σε behaviour → μηδέν κίνδυνος για τον mobile consumer.
  - Απομένουν ~9 raw routes με το ίδιο pattern (scan/expense, scan/voucher, push/register, shopping-list POST, ai, ai/subscription, items/[id]/link-plan, items/[id]/price, items/import) για μελλοντικά runs (1-2/run).
  - npm run type-check exits 0
- Status: DONE (2026-07-01, 25η σάρωση) — live-verified: `receipts/[id]/route.ts:36` + `receipts/[id]/rescan/route.ts:23` κάνουν πλέον `const b = await readBody(req);` (imports `{ isObjectId, readBody }`). Adopters `readBody` = **26**· `req.json().catch` απομένει μόνο σε 3 routes (scan/expense, scan/voucher, shopping-list POST).

### Dedup ObjectId-validation regex — 3η παρτίδα (5 route files)
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/cards/[id]/route.ts, apps/web/src/app/api/v1/stores/[id]/route.ts, apps/web/src/app/api/v1/statements/[id]/route.ts, apps/web/src/app/api/v1/notifications/route.ts, apps/web/src/app/api/v1/trash/[type]/[id]/route.ts
- Depends on: none
- Acceptance:
  - Συνέχεια του ήδη-DONE `isObjectId()` dedup (1η παρτίδα items/[id]+shopping-list/[id]· 2η παρτίδα receipts/expenses/subscriptions/tasks/vouchers [id]). Το shared `export function isObjectId(id: string): boolean` ζει ΗΔΗ στο `lib/apiBody.ts` (byte-identical `/^[a-f0-9]{24}$/i.test(id)`).
  - Σε καθένα από τα 5 route files: αντικατέστησε τον inline έλεγχο `!/^[a-f0-9]{24}$/i.test(...)` με `!isObjectId(...)`. Occurrences: cards/[id] **2** (γρ.16,31), stores/[id] **2** (γρ.23,49), statements/[id] **1** (γρ.36), trash/[type]/[id] **2** (γρ.16,28), notifications **1** (γρ.22, ελέγχει `b.id` από body).
  - Imports: `cards/[id]` + `notifications` έχουν ΗΔΗ `import { readBody } from '@/lib/apiBody'` → γίνεται `import { isObjectId, readBody } from '@/lib/apiBody'`. `stores/[id]`, `statements/[id]`, `trash/[type]/[id]` ΔΕΝ έχουν apiBody import → νέο `import { isObjectId } from '@/lib/apiBody'`.
  - Το μήνυμα σφάλματος (`apiError('bad id')`) + status 400 + η σειρά auth-πριν-id ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν. Καμία αλλαγή σε behaviour / response shape.
  - Επαλήθευση: `grep -rl '\[a-f0-9\]{24}' apps/web/src/app/api/v1` δεν περιλαμβάνει πλέον κανένα από τα 5 files· `isObjectId` adopters 7 → 12.
  - Απομένουν ~7 route files με inline regex (items/[id]/ai-fill+convert-to-task+link-plan+plans+price, receipts/[id]/add-to-library+rescan) για 4η παρτίδα σε μελλοντικά runs.
  - npm run type-check exits 0
- Status: DONE (2026-07-01, commit pending· 5 files migrated, `isObjectId` adopters 7→12· grep `\[a-f0-9\]{24}` πλέον μόνο 7 deep sub-routes· tsc EXIT 0· Docker /login 200, RestartCount 0, cards/trash no-token 401)

### Dedup ObjectId-validation regex — 2η παρτίδα (5 route files)
- Priority: P3
- Size: S
- Area: api
- Files: apps/web/src/app/api/v1/receipts/[id]/route.ts, apps/web/src/app/api/v1/expenses/[id]/route.ts, apps/web/src/app/api/v1/subscriptions/[id]/route.ts, apps/web/src/app/api/v1/tasks/[id]/route.ts, apps/web/src/app/api/v1/vouchers/[id]/route.ts
- Depends on: none
- Acceptance:
  - Συνέχεια του ήδη-DONE `isObjectId()` dedup (1η παρτίδα: items/[id] + shopping-list/[id]). Το shared `export function isObjectId(id: string): boolean` ζει ΗΔΗ στο `lib/apiBody.ts` (byte-identical `/^[a-f0-9]{24}$/i.test(id)`).
  - Σε καθένα από τα 5 route files: αντικατέστησε τον inline έλεγχο `/^[a-f0-9]{24}$/i.test(id)` (ή τυχόν local `ID_RE`/`OBJECT_ID_RE` const) με `isObjectId(id)`, προσθέτοντας το `isObjectId` στο υπάρχον import από `@/lib/apiBody` (ή νέο import αν δεν υπάρχει). Σβήσε το local regex const αν μένει αχρησιμοποίητο.
  - Το μήνυμα σφάλματος (`apiError('bad id')`) + status 400 + η σειρά auth-πριν-id ΜΕΝΟΥΝ ΑΚΡΙΒΩΣ ως έχουν. Καμία αλλαγή σε behaviour / response shape.
  - Επαλήθευση: `grep -rl '/\^\[a-f0-9\]{24}\$/i' apps/web/src/app/api/v1` δεν περιλαμβάνει πλέον κανένα από τα 5 files· `isObjectId` adopters 2 → 7.
  - Απομένουν ~12 route files με inline regex (cards/[id], stores/[id], statements/[id], trash/[type]/[id], notifications, receipts/[id]/rescan+add-to-library, items/[id]/link-plan+plans+convert-to-task+ai-fill+price) για 3η-4η παρτίδα σε μελλοντικά runs.
  - npm run type-check exits 0
- Status: DONE (2026-07-01) — και τα 5 route files migrated: `!/^[a-f0-9]{24}$/i.test(id)` → `!isObjectId(id)` (10 occurrences, 2/file). expenses/subscriptions/tasks/vouchers είχαν ήδη `import { readBody }` → έγινε `import { isObjectId, readBody }`· receipts πήρε νέο `import { isObjectId } from '@/lib/apiBody'`. Μήνυμα `apiError('bad id')` + auth-πριν-id αμετάβλητα. tsc EXIT 0· safe rebuild → /login 200, web RestartCount 0, OOM false, GET receipts/[id] + PATCH vouchers/[id] no-token → 401. `isObjectId` adopters 2 → 7· απομένουν ~12 route files για 3η παρτίδα.

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
- Status: DONE (2026-07-01) — items/[id] PATCH + shopping-list/[id] PATCH: η γραμμή body-parse `const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;` → `const b = await readBody(req);` (import `{ isObjectId, readBody }` από `@/lib/apiBody`, inline cast αφαιρέθηκε). Τα partial-update guards (`typeof b.x === 'string'`, `Array.isArray(b.tags)`, `'targetPrice' in b`, `typeof b.checked === 'boolean'`) αμετάβλητα· response `{item}`/`{ok:true}` ίδια. tsc EXIT 0· safe rebuild → /login 200, web restarts 0, PATCH items/[id]+shopping-list/[id] no-token → 401. Adopters `readBody` **16**.

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
- Status: DONE (2026-07-01) — πρόσθεσα `OBJECT_ID_RE` const + `export function isObjectId(id: string): boolean` στο `lib/apiBody.ts` (byte-identical `/^[a-f0-9]{24}$/i.test(id)`· param `string` αντί type-guard `id is string` αφού όλοι οι consumers περνάνε ήδη string από τα route params). 1η παρτίδα migrated: **items/[id]** (3 guards: GET/PATCH/DELETE) + **shopping-list/[id]** (2 guards + διαγράφηκε το local `ID_RE` const). Μήνυμα `apiError('bad id')` + status 400 αμετάβλητα. tsc EXIT 0· safe rebuild → /login 200, web restarts 0. Απομένουν ~17 route files με inline regex (items/[id]/price+link-plan+ai-fill+convert-to-task, receipts/[id]+rescan, expenses/[id], subscriptions/[id], tasks/[id], vouchers/[id], stores/[id], notifications, trash/[id], κ.λπ.) για 3-5/run συνέχεια.

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

### getTenantConnection cache-reuse guard δέχεται disconnected connection
- Priority: P3
- Size: S
- Area: shared
- Files: apps/web/src/lib/tenancy/connection.ts
- Depends on: none
- Acceptance:
  - Ο guard επαναχρησιμοποίησης (`connection.ts:~60`) ελέγχει `existing.readyState !== 99` (uninitialized) και επιστρέφει το cached `useDb` connection. Όμως το inline σχόλιο λέει «reuse only while the underlying connection is still open· a dropped socket would make a stale entry unusable, so fall through and rebuild it» — και το `!== 99` επιστρέφει και connections σε readyState **0 (disconnected)** / **3 (disconnecting)**, δηλαδή ΟΧΙ «open». Είτε ο κώδικας είτε το σχόλιο πρέπει να ευθυγραμμιστεί.
  - Πρόταση (αν επιβεβαιωθεί ως πρόθεση): reuse μόνο όταν `readyState === 1` (connected) ή `2` (connecting), αλλιώς rebuild· ή, αν το intent είναι «rebuild μόνο σε torn-down object», διόρθωσε το σχόλιο ώστε να μη λέει «still open».
  - **ΣΗΜ (γιατί flag, όχι fix):** dead-until-SaaS κώδικας — **0 importers**, gated πίσω από `SAAS_MODE` (off). Μηδέν επίδραση στο single-user app σήμερα· ambiguous το «σωστό» rebuild-semantic (το `defaultConn.useDb()` μοιράζεται το ίδιο base client, οπότε ένα rebuild δεν «ξαναφτιάχνει» dropped socket από μόνο του — μπορεί να μη χρειάζεται καθόλου rebuild). Θέλει σκόπιμη απόφαση, όχι μηχανικό swap.
  - npm run type-check exits 0
- Status: DONE (fixed 2026-07-24, saas-core routine, increment 86) — live: το item δεν ήταν πια «0 importers» (`tenantDb()` έχει πλέον 3 καλούντες: `lib/tenancy/workspaceFiles.ts`, `lib/tenancy/workspaceExport.ts`, `lib/billing/dbStats.ts`), οπότε η απόφαση αξίζε πλέον. Fix ακριβώς όπως speced το item: `connection.ts` guard τώρα `existing.readyState === 1 || existing.readyState === 2` (reuse ΜΟΝΟ connected/connecting· disconnected 0, disconnecting 3, uninitialized 99 → rebuild), σχόλιο ευθυγραμμίστηκε. Νέο test suite `connection.test.ts` («getTenantConnection — cache reuse guard», 8 tests: reuse σε readyState 1→2 χωρίς rebuild· rebuild σε 0/3/99 μέσω `it.each`). `npm run type-check` EXIT 0· πλήρες `npx vitest run` → **229 files / 2980 tests green**. Docker: δεν έγινε rebuild (logic+test-only edit, καμία αλλαγή runtime wiring/dependency, gated πίσω από `SAAS_MODE` off). Browser-verify: skipped (backend-only, μηδέν UI).

### el.ts i18n gap — 84 κλειδιά των νέων features μόνο στα αγγλικά (Greek-first χρήστης βλέπει English fallback)
- Priority: P3
- Size: M
- Area: web
- Files: apps/web/src/lib/i18n/locales/el.ts (source keys: apps/web/src/lib/i18n/locales/en.ts)
- Depends on: none
- Acceptance:
  - **Το πρόβλημα:** διαδοχικά features (P35 expense split, P34 per-space ledger tag, P32 gift-card, P28 bills, P7 auto-discovery, P12 savings/goals, P26 onboarding checklist, P1 sample-data mode) πρόσθεσαν νέα κλειδιά στο `en.ts` **χωρίς** αντίστοιχες ελληνικές μεταφράσεις στο `el.ts`. Ο resolver (`i18n/index.ts:22` `dict[key] ?? en[key] ?? String(key)`) κάνει graceful fallback στα αγγλικά, άρα **δεν σπάει το UI** (καμία raw-key εμφάνιση, type-check EXIT 0 γιατί `el: Partial<Dict>`). Όμως ο χρήστης είναι Greek-first (CLAUDE.md), οπότε όλα αυτά τα UI strings εμφανίζονται στα αγγλικά αντί ελληνικά.
  - **Το χάσμα μεγαλώνει σταθερά, ίδιο-scoped commits το κάνουν σκόπιμα (documented precedent, δες PROGRESS.md 2026-07-15/07-16/07-19/07-20 runs)**: 38 (2026-07-10) → 42 (53η σάρωση, 2026-07-15, +4 P7) → 75 (54η σάρωση, 2026-07-18, +33) → 84 (reviewer, 2026-07-19, +9) → **110 (56η σάρωση, 2026-07-20, +26)**. Τα +26 της τελευταίας περιόδου, από τα 4 νέα self-hosted features αυτού του διαστήματος (26 commits, `83f392f..HEAD`): P3 Month-in-Review (`reports.monthReview`, 1)· P11 IMAP email-in (`set.imap*` ×13)· P13 insurance export (`set.insuranceExport*` ×3)· P8 tax-deductible tagging + export (`ex.taxDeductible`/`ex.fTaxCategory`/`ex.fTaxCategoryPlaceholder`/`ex.taxBadgeTitle`, `set.taxExport*` ×3 = 7). Τα SaaS-only strings αυτού του range (account settings, workspace settings, BYO AI key, create/leave-workspace) φαίνεται να χρησιμοποιούν ήδη-υπάρχοντα κλειδιά ή inline strings εκτός του `t()` σύστημα — δεν προσθέτουν στο μετρήσιμο χάσμα.
  - **Πλήρης λίστα (comm en−el, 110 live 2026-07-20):** `nav.bills`, `home.dBills`, `home.dGoals`, `home.onbTitle`, `home.onbSubtitle`, `home.onbDone`, `home.onbStorage`, `home.onbReceipt`, `home.onbBudget`, `home.onbCard`, `home.onbNotify`, `trash.tGiftCard`, `trash.tLoyaltyCard`, `trash.tBill`, `trash.tGoal`, `reports.monthReview`, `reports.cExpBySpace`, `reports.cGoals`, `reports.gNewGoal`, `reports.gNoGoals`, `reports.gTitle`, `reports.gTitlePlaceholder`, `reports.gTarget`, `reports.gDeadline`, `reports.gReached`, `reports.gPerMonth`, `reports.gAddAmount`, `reports.gDeleteTitle`, `reports.gDeleteBody`, `sub.discoveredTitle`, `sub.discoveredOccurrences`, `sub.discoveredTrack`, `sub.discoveredDismiss`, `ex.space`, `ex.fSpace`, `ex.taxDeductible`, `ex.fTaxCategory`, `ex.fTaxCategoryPlaceholder`, `ex.taxBadgeTitle`, `ex.allSpaces`, `ex.spaceNone`, `ex.splitTitle`, `ex.splitEmpty`, `ex.splitName`, `ex.splitAddPerson`, `ex.splitEqually`, `ex.splitIncludeMe`, `ex.splitMarkPaid`, `ex.splitOwedYou`, `ex.splitSettled`, `ex.splitYourShare`, `ex.balancesTitle`, `ex.balancesBtn`, `ex.balancesEmpty`, `ex.balancesSettled`, `ex.balanceEntries`, `ex.settleUp`, `ex.settleTitle`, `ex.settleBody`, `migrate.sectionTitle`, `migrate.sectionHint`, `migrate.ynabButton`, `ynab.title`, `ynab.dropHint`, `ynab.formats`, `ynab.notYnab`, `ynab.summary`, `set.giftCardAlert`, `set.billAlert`, `set.spaces`, `set.spacesDesc`, `set.spacesEmpty`, `set.spacesPlaceholder`, `notif.giftcardSub`, `notif.giftcardTodaySub`, `notif.billDueSub`, `notif.billTodaySub`, `notif.billOverdueSub`, `set.imapTitle`, `set.imapDesc`, `set.imapEnabled`, `set.imapHost`, `set.imapPort`, `set.imapFolder`, `set.imapSecure`, `set.imapUsername`, `set.imapPassword`, `set.imapPasswordSaved`, `set.imapCheckNow`, `set.imapLastChecked`, `set.imapLastImported`, `set.imapNeverChecked`, `set.imapAppPasswordHint`, `set.insuranceExport`, `set.insuranceExportDesc`, `set.insuranceExportDone`, `set.taxExport`, `set.taxExportDesc`, `set.taxExportDone`, `set.sampleData`, `set.sampleDataDesc`, `set.sampleLoad`, `set.sampleReload`, `set.sampleClear`, `set.sampleReloadTitle`, `set.sampleReloadConfirm`, `set.sampleClearTitle`, `set.sampleClearConfirm`, `set.sampleLoaded`, `set.sampleCleared`.
  - **Fix:** πρόσθεσε ελληνική τιμή για κάθε ένα στο `el.ts` (χρησιμοποίησε το en string ως πηγή· κράτα το ίδιο interpolation-placeholder format π.χ. `{n}`, `{name}`). Καμία αλλαγή σε keys/en.ts.
  - **ΣΗΜ (γιατί flag, όχι fix από auditor):** 110 μεταφράσεις είναι judgment call ακριβείας (el = primary γλώσσα του χρήστη), όχι μηχανικό one-liner· ανήκει στον builder, ιδανικά σε ένα αφιερωμένο μεταφραστικό pass (το χάσμα θα συνεχίσει να μεγαλώνει ανά feature αν δεν γίνει — 4 διαδοχικά self-hosted features σε αυτό το μόνο διάστημα το μεγάλωσαν +26). Μη-blocking (English fallback ενεργό).
  - Επαλήθευση: `node -e "const fs=require('fs');const k=s=>{const re=/^\s*'([A-Za-z0-9_.]+)':/gm;const set=new Set();let m;while(m=re.exec(s))set.add(m[1]);return set};const en=k(fs.readFileSync('src/lib/i18n/locales/en.ts','utf8'));const el=k(fs.readFileSync('src/lib/i18n/locales/el.ts','utf8'));console.log([...en].filter(x=>!el.has(x)).length)"` (τρέξε μέσα στο `apps/web`) → 0· npm run type-check exits 0.
- Status: DONE (fixed 2026-07-25, pharos-daily-dev) — αφιερωμένο μεταφραστικό pass, **126 → 0**. Το χάσμα είχε φτάσει τα 126 κλειδιά (node-verified `en=1271, el=1145`), δηλαδή +16 από τα 110 της 56ης σάρωσης (P5 bookmarklet/quick-capture `bm.*`+`cap.*`, P16 YNAB import `migrate.*`+`ynab.*`). Προστέθηκαν και τα 126 στο `el.ts` με ελληνική τιμή, **στην ίδια σειρά που έχουν στο `en.ts`** (script: για κάθε missing key, εισαγωγή αμέσως μετά το πλησιέστερο προηγούμενο en-key που υπάρχει ήδη στο `el.ts` → 126 γραμμές σε 17 anchors, μηδέν αναδιάταξη υπαρχόντων κλειδιών). Τα interpolation placeholders (`{n}`, `{title}`, `{amt}`, `{days}`, `{when}`, `{x}`, `{valid}`/`{excluded}`/`{invalid}`) διατηρήθηκαν αυτούσια· ακολουθήθηκαν οι υπάρχουσες συμβάσεις του αρχείου (ελληνικά εισαγωγικά «…» στα confirm titles όπως `it.confirmDeleteItem`, «μέρες» όπως `set.warrantyAlert`, `·` separator, «Είδη»/«Αποθήκη» ορολογία). Καμία αλλαγή σε keys ή σε `en.ts`. **Verified:** το acceptance one-liner του item → **0 missing / 0 extra** (`en=1271, el=1271`)· `npm run type-check` καθαρό ως προς `el.ts`· `npx vitest run src/lib/i18n` → **53/53 green** (incl. `locales.test.ts` placeholder-parity)· full `npx vitest run` → **3401 passed / 256 από 257 files**. Docker rebuild: **skipped σκόπιμα** — την ώρα του run υπήρχε untracked WIP αρχείο άλλης διεργασίας (`receipts/actions.upload.test.ts`) με type errors, και το `tsconfig.json` κάνει include τα `**/*.ts` χωρίς `ignoreBuildErrors` → το `next build` θα έσκαγε σε ξένο κώδικα, όχι σε αυτή την αλλαγή· locale-data-only change, καλυμμένη από τα i18n tests. Οι 3 αποτυχίες του full run ανήκουν όλες σε εκείνο το ξένο untracked αρχείο (baseline-confirmed πριν αγγίξω οτιδήποτε), μηδέν σχέση με το `el.ts`.

---

## Δεν είναι debt (επιβεβαιωμένο, μην ανοίξεις item)

- **Μηδέν loading.tsx**: σκόπιμο (CLAUDE.md, Session 2026-06-08 cont.²) — η παρουσία `loading.tsx` προκαλούσε nav flash· αφαιρέθηκαν επίτηδες. Υπάρχει global `app/error.tsx` (stale-deploy auto-reload). Μην προτείνεις προσθήκη.
- **7 per-resource `trim` serializers**: διαφορετικά shapes ανά resource (όχι ίδια logic) → αποδεκτό· όχι candidate για dedup-rewrite.
- **`Statement.find().lean()` χωρίς limit** (calendar/overview/reports/plans): πλήρες scan αλλά τα statements είναι λίγα (ανά μήνα/κάρτα)· χαμηλό ρίσκο, μην το βάλεις σε queue προς το παρόν.
