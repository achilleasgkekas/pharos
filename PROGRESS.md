# PROGRESS — Pharos autonomous dev log

Καθημερινό unattended run (03:03). Κάθε run: διάλεξε ΕΝΑ task, validate (tsc + safe Docker rebuild), commit ΜΟΝΟ τα δικά σου αρχεία, push, κατέγραψε εδώ.
Context: δες `CLAUDE.md` (πλήρες ιστορικό), `MOBILE_PARITY.md` (roadmap), `BACKLOG.md` / `TODO.md`.

## Κανόνες (μην τους σπάσεις)
- Stage ΜΟΝΟ όσα άλλαξες, με explicit `git add <path>`. ΠΟΤΕ `git add -A` / `.` / `commit -a` (το working tree έχει συχνά parallel uncommitted αλλαγές του Αχιλλέα).
- Docker rebuild: `docker compose build web` ΠΡΩΤΑ, περίμενε mongo `healthy`, μετά `docker compose up -d web`. ΠΟΤΕ `up --build` (πνίγει τη mongo σε CPU, γίνεται unhealthy, και το web δεν σηκώνεται).
- Όχι destructive: κανένα `volume rm` / `down -v` / `system prune` / `builder prune --all`, κανένα drop collection, κανένα force-push, κανένα άγγιγμα σε secrets/`.env`.
- Bulk AI = κόστος ανά Anthropic call, όχι unattended.

## Κατάσταση
- Mobile companion app (`apps/mobile`, Expo SDK 54) σε build-out προς parity. Web REST API v1 κάτω από `apps/web/src/app/api/v1/` (bearer auth).
- MOBILE_PARITY roadmap: #1 edit ✅, #2 task statuses ✅, #3 receipt verify/edit ✅, #4 AI fill ✅.
- Ανοιχτά: #5 statement transactions/installments detail, #6 mobile Settings (theme/budgets/notifications), #7 Activity (Trash/Jobs/History), #8 push notifications.

## 2026-06-29 (seed)
- Τι: στήθηκε αυτό το log + το daily scheduled task `pharos-daily-dev`. Ολοκληρώθηκε το roadmap **#4 (AI fill)**: 3 νέα endpoints (`/api/v1/ai/subscription`, `/api/v1/scan/voucher`, `/api/v1/items/import`) + mobile UI (✦ buttons σε Subscriptions / Vouchers / Items add rows).
- Verify: web HTTP 200, restarts=0· tsc καθαρό (web + mobile)· curl και τα 3 endpoints (Netflix → €13.99/mo monthly streaming· "SAVE15" voucher → code/store/discount/expiry· import delegates σωστά στο pipeline, graceful error σε unreachable URL). Commits `62eae4c`, `a461156`.
- Επόμενο task: **#5 — Statement transactions/installments στο mobile.** Web πηγή: `apps/web/src/app/statements/`. Αν λείπει, πρόσθεσε `GET /api/v1/statements/[id]` (transactions + `installmentInfo` + computed installment plans), μετά mobile `StatementsScreen` → detail με λίστα transactions + installment plans (read-first· link/edit σε επόμενο run).
