# PROGRESS — Pharos autonomous dev log

Καθημερινό unattended run (03:03). Κάθε run: διάλεξε ΕΝΑ task, validate (tsc + safe Docker rebuild), commit ΜΟΝΟ τα δικά σου αρχεία, push, κατέγραψε εδώ.
Context: δες `CLAUDE.md` (πλήρες ιστορικό), `MOBILE_PARITY.md` (roadmap), `BACKLOG.md` / `TODO.md`.

## Κανόνες (μην τους σπάσεις)
- Stage ΜΟΝΟ όσα άλλαξες, με explicit `git add <path>`. ΠΟΤΕ `git add -A` / `.` / `commit -a` (το working tree έχει συχνά parallel uncommitted αλλαγές του Αχιλλέα).
- Docker rebuild: `docker compose build web` ΠΡΩΤΑ, περίμενε mongo `healthy`, μετά `docker compose up -d web`. ΠΟΤΕ `up --build` (πνίγει τη mongo σε CPU, γίνεται unhealthy, και το web δεν σηκώνεται). **Μετά το build τρέξε `docker builder prune -f`** (ΜΟΝΟ cache, ασφαλές) — αλλιώς ο δίσκος γεμίζει.
- ⚠ **Το Docker VM είναι στενό (~1.9GB RAM, 31GB disk).** Στις 2026-06-29 ~5 διαδοχικά builds γέμισαν 21GB build cache + **OOM-σκότωσαν τη mongo** (42 restarts, app down). Κράτα το **flaresolverr ΣΒΗΣΤΟ** (είναι profile `scraper`, ~το άναψε άλλη συνεδρία) εκτός αν χρειάζεται ενεργά.
- Όχι destructive: κανένα `volume rm` / `down -v` / `system prune` / `builder prune --all`, κανένα drop collection, κανένα force-push, κανένα άγγιγμα σε secrets/`.env`. (Το `builder prune -f` χωρίς `--all` ΕΙΝΑΙ ασφαλές: σβήνει μόνο unused cache, όχι data/volumes/images.)
- Bulk AI = κόστος ανά Anthropic call, όχι unattended.

## Κατάσταση
- Mobile companion app (`apps/mobile`, Expo SDK 54) σε build-out προς parity. Web REST API v1 κάτω από `apps/web/src/app/api/v1/` (bearer auth).
- MOBILE_PARITY roadmap: #1 edit ✅, #2 task statuses ✅, #3 receipt verify/edit ✅, #4 AI fill ✅, #5 statement detail ✅.
- Ανοιχτά: #6 mobile Settings (theme/budgets/notifications), #7 Activity (Trash/Jobs/History), #8 push notifications.

## 2026-06-29 (seed)
- Τι: στήθηκε αυτό το log + το daily scheduled task `pharos-daily-dev`. Ολοκληρώθηκε το roadmap **#4 (AI fill)**: 3 νέα endpoints (`/api/v1/ai/subscription`, `/api/v1/scan/voucher`, `/api/v1/items/import`) + mobile UI (✦ buttons σε Subscriptions / Vouchers / Items add rows).
- Verify: web HTTP 200, restarts=0· tsc καθαρό (web + mobile)· curl και τα 3 endpoints (Netflix → €13.99/mo monthly streaming· "SAVE15" voucher → code/store/discount/expiry· import delegates σωστά στο pipeline, graceful error σε unreachable URL). Commits `62eae4c`, `a461156`.
- Επόμενο task: **#5 — Statement transactions/installments στο mobile.** Web πηγή: `apps/web/src/app/statements/`. Αν λείπει, πρόσθεσε `GET /api/v1/statements/[id]` (transactions + `installmentInfo` + computed installment plans), μετά mobile `StatementsScreen` → detail με λίστα transactions + installment plans (read-first· link/edit σε επόμενο run).

## 2026-06-29 (cont. — #5 + infra recovery)
- Τι: **#5 ✅** — `GET /api/v1/statements/[id]` (header + transactions + per-charge installment `{current,total}`, sorted μεγαλύτερη χρέωση πρώτη) + mobile `StatementsScreen` bottom-sheet detail (total/min/paid + transactions + cyan N/M badge στις δόσεις, credits σε accent). Commits: route.ts στο `cd3600f` (μπήκε σε commit τρίτου με `git add -A`), screen στο `48a60e5`.
- Verify: web HTTP 200· tsc καθαρό (web+mobile)· πραγματικό fetch → "Εθνική Mastercard 7791, 2026-06, 8 txns, 5 installment charges (QUEST 4/6, PLAISIO 11/12)".
- ⚠ **Infra incident (διορθώθηκε):** η mongo OOM-crash-loop-άρισε (42 restarts, `oom=true`) γιατί (α) ~5 builds μάζεψαν **21GB build cache** (δίσκος 84%) και (β) έτρεχε το flaresolverr σε στενό 1.9GB RAM VM. Fix: `docker compose stop flaresolverr` + `docker builder prune -f` (έπεσε 21.7GB→0.5GB cache) → mongo healthy, web up.
- **Needs Achilleas:** σκέψου να ανεβάσεις το Docker Desktop → Resources → **RAM** (π.χ. 4GB) ώστε το mongo+web+flaresolverr να μη χτυπάνε OOM. Το flaresolverr το άφησα ΣΒΗΣΤΟ· ξανάνοιξέ το με `docker compose --profile scraper up -d flaresolverr` αν το χρειάζεσαι.
- Επόμενο task: **#6 — mobile Settings** (theme/currency, budgets view, notification toggles). Διάβασε `apps/web/src/app/settings/` + `getAppSettings`· πιθανό νέο read endpoint `GET /api/v1/settings`. ΘΥΜΗΣΟΥ `docker builder prune -f` μετά το build.
