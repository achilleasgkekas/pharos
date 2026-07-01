# DOCS_PROGRESS

Ημερολόγιο της DOCS routine (τρέχει ωριαία, unattended). Territory: μόνο `docs/**`
(συν μία γραμμή link στο README αν λείπει). Γλώσσα των docs: Αγγλικά (public
audience). Σημειώσεις εδώ: Ελληνικά, χωρίς παύλες.

## 2026-07-01

Πρώτο run της DOCS routine. Το `docs/` είχε μόνο banner assets (banner.png/svg),
κανένα markdown doc, κανένα progress log.

Τι έγραψα:
- `docs/self-hosting.md` — πλήρης οδηγός self-host: prerequisites, δύο τρόποι
  απόκτησης (prebuilt image `ghcr.io/achilleasgkekas/pharos:latest` vs build from
  source), configuration του `.env` με πίνακα required/optional env vars, start του
  stack (web+mongo+searxng), first-run admin wizard, optional profiles
  (scraper/tools), storage & backups (scripts/backup.sh + restore.sh, volume
  ./data/storage), updating, HTTPS/reverse-proxy, troubleshooting.
- `docs/README.md` — index/TOC. Links μόνο σε ό,τι υπάρχει (self-hosting.md +
  root reference docs). Τα planned guides (features/configuration/api/mobile) ως
  plain text, χωρίς broken links.
- `docs/DOCS_PROGRESS.md` — αυτό το log.

Πηγές που διάβασα για ακρίβεια (όχι εικασίες): `.env.example`,
`docker-compose.prod.yml`, `docker-compose.yml`, `README.md`, `scripts/backup.sh`.
Ολα τα env var names και container names (homepage-web/mongo/searxng) επαληθεύτηκαν
απο τον κώδικα.

Validation: markdown only, κανένα build/Docker/AI. Internal links resolve
(self-hosting.md υπάρχει, planned = plain text). Fenced code blocks κλειστά.
Commands ταιριάζουν με το repo (real compose files, real script names).

Προσθήκη στο README: μία γραμμή link στο `docs/` (το README ανέφερε μόνο το banner,
όχι τα guides).

Επόμενο doc: `docs/features.md` (per-module περιγραφή απο τη σκοπιά του χρήστη),
αντλώντας απο το CLAUDE.md + τα actual routes. Μετά: `docs/api.md` (REST v1 απο
τα route files υπο `apps/web/src/app/api/v1/`), `docs/configuration.md`,
`docs/mobile.md`.

## 2026-07-01 (2ο run)

Έγραψα το `docs/features.md` — per-module περιγραφή απο τη σκοπιά του χρήστη,
Αγγλικά. Καλύπτει: Inventory & Shopping (Items), Shopping list, Receipts (+AI
parse/OCR/quick-verify/dedup/add-to-library), Expenses & Income (recurring series,
anomaly detection), Statements & installments (inline NN/MM parse, plan merge,
link-to-product), Subscriptions, Vouchers (AI fill), Calendar (3μηνο agenda),
Reports (net position, budgets), Tasks (kanban), Network/UniFi, AI command bar &
history, Search, Notifications, Trash (soft delete), Settings (tabs).

Πηγές για ακρίβεια (διάβασα κώδικα, οχι εικασίες): CLAUDE.md (source of truth για
features), `find apps/web/src/app/api/v1 -name route.ts` (49 routes), `models/`
(19 models), λίστα app pages, `models/ShoppingListItem.ts` (ξεχώρισα το lightweight
shopping-list απο τα product-tracking Items), `history/page.tsx` (AI conversations).

README TOC: το «Features» μεταφέρθηκε απο Planned → live guide (link σε features.md).

Validation: markdown only, κανένα build/Docker/AI call. Ολα τα internal links
resolve (script check: features.md + README.md → 8 targets, ολα OK, 0 MISSING).
Καμία αναφορά σε ανύπαρκτο api.md (τα 2 σημεία που ηθελα link → plain text + link
στο DOCS_PROGRESS.md). features.md = 0 code fences (καθαρή πρόζα).

Collision guard: `git diff --cached --name-only` κενό πριν το commit (κανένα
concurrent routine mid-commit). Foreign unstaged (.claude/launch.json,
apps/landing/) — δεν τα αγγιξα. Stage ΜΟΝΟ docs/features.md + docs/README.md +
docs/DOCS_PROGRESS.md.

Push: DEFERRED. Το commit (`docs(features): ...`) εγινε τοπικα αλλα το `git push`
απορριφθηκε (non-fast-forward — concurrent routine εσπρωξε το `44bc648
feat(landing): scaffold ... apps/landing`). Το incoming commit αγγιζει ΜΟΝΟ
`apps/landing/**` (0 σε docs/launch.json), αρα κανενα content conflict. ΟΜΩΣ το
tree εχει foreign uncommitted files (untracked `apps/landing/` που τωρα συγκρουεται
με το committed apps/landing του remote + modified `.claude/launch.json`), οποτε
κατα τον hard rule ΔΕΝ κανω rebase (το checkout στο rebase θα clobber-αρε το
untracked apps/landing). Ιδιο pattern με το προηγουμενο run (`6f04491 docs(saas):
note deferred push`). Το commit μενει τοπικο· επομενο run με καθαρο tree θα κανει
fetch+rebase+push. Κανενα force-push.

Επόμενο doc: `docs/api.md` (REST v1 reference — auth bearer token + καθε endpoint
κατω απο api/v1, διαβάζοντας τα route files). Μετά: `docs/configuration.md`,
`docs/mobile.md`.
