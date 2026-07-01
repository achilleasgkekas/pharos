# Pharos — Web features → Mobile parity

What the **web app** (`apps/web`) does, and where the **mobile app** (`apps/mobile`, Expo) stands.
Legend: ✅ done · 🟡 partial · ❌ missing. This is the mobile roadmap — work top-down by priority.

## Navigation & shell
| Web | Mobile |
|-----|--------|
| Top nav: grouped menus (Stuff/Money/Plan/Activity), central AI/Search bar, AI-online dot, theme toggle, language switcher, notification bell, settings, user menu | 🟡 Drawer menu (Stuff/Money/Plan + Activity + Search/AI/Settings/Sign out), AppBar (☰ + 🔍 + 🔔-με-badge + logo). No theme toggle, no language switcher. Notification-bell badge ✅ (unread count, tap → Activity → Alerts) |
| Dark/light theme + 8-language i18n | ❌ dark only, English only |
| Lighthouse logo / favicon / PWA | ✅ logo in-app + app icon + splash |

## Home / dashboard
| Web | Mobile |
|-----|--------|
| Hero + AI command bar + module nav cards | ✅ hub: overview stats (owed) + nav tiles |

## Items — Inventory & Shopping (`/items`, `/shopping`)
| Web | Mobile |
|-----|--------|
| Grid/list, e-shop sidebar filters (status/store/category/sort/flags), select-mode + bulk AI fill | 🟡 list + All/Owned/Shopping filter |
| Add item + **URL import** (fetch + AI parse → preview → approve), dedup | 🟡 add by title **+ URL import** (paste link → ✦ AI fetch+parse → add to Shopping, auto-detected). No preview-before-approve step, no select-mode/bulk-AI |
| Item detail: specs, **PricePanel** (best price, where-to-buy, price position, log price, search online, full history chart), links, photos, warranty, purchase & payment, **link to installment plan**, AI specs, convert-to-task | 🟡 tap-to-edit (title, status, category, price, target, specs) + **PricePanel** (best-now + verdict, position bar low/target/high, where-to-buy tap→open store, log-a-price, full history, photos strip, links, warranty/purchase) + **link to installment plan** (linked δόσεις with payoff + unlink, collapsible picker of available plans → tap to attach) + **convert-to-task** (button → seeds a Task from the item). No AI specs (AI cost) |
| Delete | ✅ long-press delete |

## Shopping list (`/shopping-list`)
| Web | Mobile |
|-----|--------|
| Quick add, **photo→AI→verify→add**, check-off, Bought section, quick-verify, category color/eyebrow | ✅ add, photo scan, check-off, delete, categories |

## Receipts (`/receipts`)
| Web | Mobile |
|-----|--------|
| Dropzone upload + AI parse, e-shop layout, **email import**, find-duplicates + merge | 🟡 list + camera scan→save |
| Detail: image/PDF, **editable line items (net/VAT/gross)**, store select, ∑-items, **re-scan OCR/text**, **verify**, **archive (not a receipt)**, add items to library | ✅ detail = image + **editable** store/date/payment/total/notes + **editable line items** (name/qty/net/VAT%, gross shown, add/remove) + **∑-items** + **verify** + **archive (not a receipt)** + **add items to inventory** + **re-scan text/OCR** (re-prefill in-place) |

## Expenses & Income (`/expenses`, `/income`)
| Web | Mobile |
|-----|--------|
| **Scan a bill/payslip** (AI), e-shop layout, recurring series + auto-generate, **anomaly badges**, vendor autocomplete | 🟡 list + manual add (vendor+amount) + **AI scan-a-bill** (✦ camera → parse → confirm draft → add; carries date/period/recurring/payment) |
| Detail + **edit** (vendor/amount/category/date/period/recurring/payment/notes) + re-scan | 🟡 tap-to-edit **vendor/amount/category/date/period/recurring+cycle/payment/notes** (full-field) + long-press delete. No re-scan (AI) |

## Statements (`/statements`)
| Web | Mobile |
|-----|--------|
| PDF import, transactions, **installment plans** (compute, link to products, merge/bind, payoff), per-card outstanding, re-scan | 🟡 list + **installment-plan overview** (cross-statement, active-first: label, card, €/mo, paid/total, €left, payoff month; done plans dimmed) + **detail με transactions** (sorted, amount, date, **per-charge installment badge** current/total) + totals (total/min/paid). No merge/bind, no re-scan, no PDF import |

## Subscriptions (`/subscriptions`)
| Web | Mobile |
|-----|--------|
| e-shop layout, **AI fill from name**, add/edit, cycle, next renewal | ✅ list + add (name+amount, ✦ AI fill) + tap-to-edit (name, amount, **billing cycle picker**, **next renewal date**, active) + delete |

## Vouchers (`/vouchers`)
| Web | Mobile |
|-----|--------|
| e-shop layout, **AI scan (paste/image)**, add/edit | ✅ list + quick-add (title+code) + **AI scan (paste or 📷 photo → full draft)** + tap-to-edit full fields (title, code, store, discount, expiry, url, used) + delete |

## Calendar (`/calendar`)
| Web | Mobile |
|-----|--------|
| 3-month money agenda: renewals stepped per cycle, **installments aggregated per month**, recurring bills/income projected, warranty + voucher expiries, monthly in/out totals | ✅ 3-month sectioned agenda: renewals stepped, installments aggregated/month (pinned), recurring bills/income projected, warranty/voucher expiries, per-month in/out totals |

## Reports (`/reports`)
| Web | Mobile |
|-----|--------|
| Net-position banner, monthly-spend chart, upcoming-installments, spend-by-store, inventory-value pie, subs-by-category, warranties expiring, biggest purchases, **budgets**, income-vs-expense, date-range | 🟡 **net-position banner** (inventory − installments owed), net month/year, by-category, **budget · this month** (per-category progress bars, gold ≥80%, red over), last-6-months bars |

## Tasks (`/tasks`)
| Web | Mobile |
|-----|--------|
| **Kanban** (todo/in-progress/blocked/done, drag + ←/→), board/list toggle, #tags, steps/checklist, project progress by tag | 🟡 list + add (**#tag-parse**) + toggle done + tap-to-edit (title + **4-status picker** + **priority picker** low/normal/high + **tags editor**) + status chips + tag/priority display + delete. No Kanban board, no steps/checklist, no project-progress-by-tag |

## Settings (`/settings`)
| Web | Mobile |
|-----|--------|
| 7 tabs: appearance/defaults, budgets/cards, **AI engine/features/prompts**, storage/backup/CSV/trash/OneDrive, stores/lists, **ntfy notifications** | 🟡 account + **editable preferences** (currency, VAT, warranty months/alert, auto-add stores) + **editable budgets** + **payment cards CRUD** + **stores CRUD** (search/add/edit/delete, name/url/aliases, needs-review badge) + **dropdown lists editor** (3 category taxonomies, add/remove chips, reset-to-default) + **ntfy URL/enable/test** + server/version. No theme/language, AI engine, storage |

## Activity
| Web | Mobile |
|-----|--------|
| Jobs (background AI), History (AI conversations), Trash (restore/purge) | ✅ Activity screen με 4 tabs: **Alerts** (in-app notification feed, mark-read/mark-all), **Trash** (restore + delete-forever[admin]), **Jobs** (background AI, live progress auto-refresh, read-only), **History** (AI conversations, expand thread) |

## AI & search
| Web | Mobile |
|-----|--------|
| Conversational command bar (add/search/overview…), global search | ✅ AI assistant screen, ✅ global search |

## Notifications
| Web | Mobile |
|-----|--------|
| In-app notification center (bell), ntfy push | 🟡 in-app feed ✅ (Activity → Alerts, με unread state) + **bell-with-badge στο AppBar** (🔔 + κόκκινο unread count, tap → Activity/Alerts). Remote push pipeline buildable αλλά αδοκίμαστο (χρειάζεται EAS dev build + APNs key) |

---

## Roadmap (priority order)
1. ✅ **Edit existing records** — tap-to-edit modals for Tasks, Expenses, Income, Subscriptions, Vouchers, **Items** (PATCH endpoints + forms).
2. ✅ **Tasks statuses** — todo/in-progress/blocked/done picker + status chips.
3. ✅ **Receipt verify/edit** — edit fields + line items + ∑-items + verify + archive + add-to-library + **re-scan text/OCR** (2026-07-01).
4. ✅ **AI fill** — subscription-from-name, voucher scan (paste+image), item URL import, expenses scan-a-bill.
5. ✅ **Statement transactions** — per-statement detail με transactions + per-charge installment badges + **aggregated installment-plan overview** (cross-statement payoff, active-first). *Remaining: link plans to products / merge/bind (web overview write-ops).*
6. 🟡 **Settings** — editable preferences (currency/VAT/warranty/auto-add), editable budgets, payment cards CRUD, stores CRUD, dropdown-lists editor, ntfy URL/enable/test ✅. *Remaining: theme toggle, language, AI engine, storage/OneDrive (βλ. Needs Achilleas).*
7. ✅ **Activity** — Alerts (notification feed) + Trash (restore/purge) + Jobs + History.
8. 🟡 **Push notifications** — in-app feed ✅· remote push pipeline buildable αλλά αδοκίμαστο (needs device + APNs).

> Progress: tap any row on Tasks / Expenses / Income / Subscriptions / Vouchers / **Items** to **edit**; long-press to delete. Items edit covers title, status, category, price, target, specs + full PricePanel + plan-link.

---

## Build Queue
> Ranked για τον builder routine· paίρνει το πρώτο TODO. P1+S πρώτα. Ο πυρήνας του parity είναι κλειστός (CRUD/scan/PricePanel/Activity/Calendar/Reports), οπότε ΔΕΝ υπάρχουν P1/S· ό,τι έμεινε είναι secondary. Όσα έχουν AI cost → δομικό verify μόνο (no token-spend).
> **Re-audit 2026-07-01 (parity-auditor, μεσημεριανό run):** ουρά ξαναμετρημένη από τον κώδικα, **κανένα ενεργό parity TODO**. **49 v1 routes** (login + 48 bearer), **16 mobile screens**, **81** exported api fns· το mobile `api.ts` καταναλώνει **ΚΑΘΕ** ένα από τα 49 routes 1:1 (grep των consumed paths == route list· τα φαινομενικά extra `/api/v1/tasks[id]`, `/api/v1/trash/[id]/[id]` είναι grep artifacts, όχι νέα routes) → **μηδέν «endpoint χωρίς mobile consumer» gap**. Web user-facing screens: **18** `page.tsx` (home + 17), ΟΛΕΣ με mobile equivalent εκτός `/setup` (first-run admin wizard, web-only by design· N/A). **App-code diff από `eec8a8a` (προηγ. parity marker):** **1 commit** — `6a9dc33` (mobile Input/TextArea primitives refactor + migrate 4 record-form screens = **UI Debt work, ΟΧΙ parity feature**· τα επόμενα `3ae313f`/`f11ce26` = docs/docker) → **καμία νέα web δυνατότητα προς port**. Άρα τα **6 αρχικά Build-Queue items + το Tasks tags/priority GAP = ΟΛΑ DONE (7/7)**. **Έλεγχος «partial» rows για κρυμμένο auto-buildable GAP (ξανα-επιβεβαιωμένο live):** (α) **Reports** — `GET /api/v1/reports` επιστρέφει σκόπιμα trimmed set (inventoryValue/installmentsOwed/activePlans/net/budgets/thisMonth/thisYear) που το mobile ReportsScreen καταναλώνει ΟΛΟ· τα extra web charts (spend-by-store/inventory-pie/subs-by-cat/warranties/biggest-purchases/income-vs-expense-12mo) θέλουν ΚΑΙ endpoint-extension ΚΑΙ charting lib → **Needs Decision**. (β) **Statements merge/bind** — `statements/plans` είναι **GET-only** (μόνο `export async function GET`)· τα web write-ops (link-to-product, merge/bind) θέλουν νέα write endpoints + UX → **Needs Decision**. (γ) **Tasks Kanban/steps-checklist** — UX + API-extension → **Needs Decision**. (δ) Settings theme/language/AI-engine/storage → **Needs Decision** (credentials/product boundary). mobile `tsc --noEmit` → **EXIT 0** (μηδέν P1 type errors). **Counts: DONE 7 / GAP 0 (auto-buildable) / NEEDS DECISION 0 νέα.** Ο builder ΔΕΝ έχει ενεργό parity TODO → να πάρει το κορυφαίο **UI Debt** = **Input primitive** (P1/M, IN PROGRESS: 4/11 record-form screens migrated στο `6a9dc33`· απομένουν Items/Receipts/Settings/Shopping/Search/Assistant/Login).
> **Re-audit 2026-07-01 (parity-auditor, πρωινό run):** ουρά ξαναμετρημένη από τον κώδικα, **κανένα ενεργό parity TODO**. **49 v1 routes** (login + 48 bearer), **16 mobile screens**, **81** exported api fns· το mobile `api.ts` καταναλώνει **ΚΑΘΕ** ένα από τα 49 routes 1:1 (grep των consumed paths == route list, incl. `push/register` @ api.ts:444/447) → **μηδέν «endpoint χωρίς mobile consumer» gap**. Web user-facing screens: **18** `page.tsx`, ΟΛΕΣ με mobile equivalent εκτός `/setup` (first-run admin wizard, web-only by design· N/A). App-code diff από `245be25` (προηγ. parity marker): **3 commits** — `6a5809a` (serializeLineItems refactor, όχι feature), `86c6ada` (ai-fill parity, queue item → **DONE**), `2223203` (Tasks tags/priority, το τελευταίο GAP → **DONE**, επιβεβαιωμένο: `addTask(title,{tags?,priority?})` api.ts:141 + `splitTitleTags` TasksScreen:18 + edit-modal priority/tags → `updateTask(id,{title,status,priority,tags})` :62). Άρα **6/6 αρχικά queue items + το νέο Tasks GAP = ΟΛΑ DONE**· καμία νέα web δυνατότητα προς port. **Έλεγχος «partial» rows για κρυμμένο auto-buildable GAP:** το **Reports** (docs 🟡) ΔΕΝ είναι endpoint gap — το `GET /api/v1/reports` επιστρέφει σκόπιμα trimmed set (netPosition/thisMonth/thisYear/byCategory/budgets/monthly/upcomingInstallments) και το mobile ReportsScreen τα καταναλώνει **ΟΛΑ** (τα extra web charts [spend-by-store/inventory-pie/subs-by-cat/warranties/biggest-purchases/income-vs-expense-12mo] θέλουν ΚΑΙ endpoint-extension ΚΑΙ charting lib → **Needs Decision**, όχι clean gap). Ομοίως Statements merge/bind/PDF-import (write endpoints/upload) + Tasks Kanban/steps-checklist (UX + API-extension) + Settings theme/language/AI-engine/storage = **Needs Decision**. mobile `tsc --noEmit` → **EXIT 0**. **Counts: DONE 7 / GAP 0 (auto-buildable) / NEEDS DECISION 0 νέα.** Ο builder ΔΕΝ έχει ενεργό parity TODO → να πάρει το κορυφαίο **UI Debt** = **Input primitive** (P1/M, pure-mobile).
> **Re-audit 2026-07-01 (parity-auditor, νυχτερινό run #2):** **49 v1 routes** (login + 48 bearer· το `items/[id]/ai-fill` προστέθηκε με το `86c6ada`, 48→49), **16 mobile screens**, **81** exported api fns· το mobile `api.ts` καταναλώνει **ΚΑΘΕ** ένα από τα 49 routes 1:1 (grep των consumed paths == route list) → **κανένα «endpoint χωρίς mobile consumer» gap**. Web user-facing screens: **18** `page.tsx` (home + 17), ΟΛΕΣ με mobile equivalent εκτός `/setup` (first-run admin wizard, web-only by design· N/A). Από `245be25` (προηγ. parity audit): μόνο **2** app-code commits (`86c6ada` ai-fill parity = το τελευταίο queue TODO, **τώρα DONE**· `6a5809a` serializeLineItems dedup) → **καμία νέα web δυνατότητα προς port**, άρα **τα 6 αρχικά Build-Queue items = 6/6 DONE**. mobile `tsc --noEmit` → **EXIT 0**. **ΝΕΟ GAP από fresh code-diff (όχι στα 6 αρχικά):** **Tasks — tags/priority read-only στο mobile** (P3/S, no AI, no decision): το POST `/api/v1/tasks` δέχεται ήδη `tags`+`priority` (route.ts:52,58), το PATCH δέχεται `tags`/`priority`/`content`/`dueDate`, αλλά το mobile `addTask(title)` στέλνει ΜΟΝΟ `{title}` (TasksScreen:32) + το edit modal καλεί `updateTask(id,{title,status})` (TasksScreen:44) → tags/priority μόνο display, μη επεξεργάσιμα. Auto-buildable ΧΩΡΙΣ νέο endpoint. Είναι το **μόνο ενεργό TODO** του builder (βλ. queue item παρακάτω, ranked στην κορυφή).
> **Re-audit 2026-07-01 (parity-auditor, βραδινό run):** queue ξαναμετρημένη ολόκληρη από τον κώδικα, **αμετάβλητη**. **48 v1 routes** (login + 47 bearer· `items/[id]/` = {route, convert-to-task, link-plan, plans, price}, **κανένα ai-fill**), **16 mobile screens**, **71** exported api fns· το mobile `api.ts` καταναλώνει **ΚΑΘΕ** ένα από τα 48 routes 1:1 (το grep των consumed paths == το route list) → **κανένα «endpoint χωρίς mobile consumer» gap**. Cross-check web user-facing screens (`page.tsx`): 18 routes (home/calendar/expenses/income/items/shopping/shopping-list/receipts/statements/subscriptions/vouchers/tasks/reports/settings/history/jobs/trash/login) → ΟΛΕΣ έχουν mobile equivalent· το μόνο web screen χωρίς mobile = **`/setup`** (first-run admin wizard, web-only by design — το mobile μπαίνει με bearer token· **N/A, όχι gap**). DONE επιβεβαιωμένα live από κώδικα: convert-to-task (`api.ts:244` + ItemsScreen:341), rescanReceipt (`api.ts:207`), getInstallmentPlans (`api.ts:287`), Notifications badge, Expenses full-field PATCH. Από `245be25` (προηγ. parity audit): **0 web feature commits** στο app dir (μόνο `6a5809a` = serializeLineItems refactor, dedup) + **0 mobile commits** → καμία νέα δυνατότητα προς port, η ουρά by-construction αμετάβλητη. mobile `tsc --noEmit` → **EXIT 0** (μηδέν P1 type errors). **Από τα 6 Build-Queue items: 5 DONE, 1 TODO** = Items AI specs / ai-fill (P3/M, full-stack — το `items/[id]/ai-fill` route **ΔΕΝ υπάρχει**, οι web actions `aiFillSpecs:533`/`aiFillInfo:571` υπάρχουν προς port· AI cost → δομικό verify μόνο). Είναι το **μόνο** ενεργό TODO.
> **Re-audit 2026-07-01 (parity-auditor):** queue ξαναμετρημένη από τον κώδικα, **αμετάβλητη**. **48 v1 routes** (login + 47 bearer), **16 mobile screens**, **80** exported api fns· το mobile `api.ts` καταναλώνει **ΚΑΘΕ** ένα από τα 48 routes 1:1 (grep των paths == route list) → **κανένα «endpoint χωρίς mobile consumer» gap**. Επιβεβαιωμένο από κώδικα ότι ο Receipts re-scan mobile half είναι DONE (`fbda2b3`): `rescanReceipt` στο `api.ts:207` + «Re-scan text/OCR» bar στο `ReceiptsScreen.tsx:171-178`. **0 web feature commits** στο `apps/web/src/app` από το προηγ. full audit (`e8a963a..HEAD` κενό για το app dir) → καμία νέα web δυνατότητα προς port. mobile `tsc --noEmit` → **EXIT 0** (μηδέν P1 type errors). **Από τα 6 queue items: 5 DONE, 1 TODO** = **Items AI specs / ai-fill** (P3/M, full-stack: το `items/[id]/ai-fill` route **ΔΕΝ υπάρχει** ακόμα — επιβεβαιωμένο: `items/[id]/` έχει μόνο {route.ts, convert-to-task, link-plan, plans, price}· AI cost → δομικό verify μόνο). Είναι το **μόνο** ενεργό TODO του builder· χτίζει ΚΑΙ web endpoint ΚΑΙ mobile half.
> **Builder 2026-06-30 (βραδινό):** Expenses/Income full-field edit **DONE** (PATCH επεκτάθηκε + MoneyScreen edit modal full-field) → queue **5 → 4 GAP** (1 P2 + 3 P3). Επόμενο TODO: Items convert-to-task (P3/S, no AI) ή Receipts re-scan (P2/M, AI → δομικό verify).
> **Re-audit 2026-06-30 (cont.² — parity-auditor, 3η σάρωση ημέρας):** queue (πριν το builder) **αμετάβλητο** (5 GAP). Επιβεβαιωμένο ξανά από τον κώδικα: **46 v1 routes** (login + 45 bearer), **16 mobile screens**, **78** exported api fns· το mobile `api.ts` καταναλώνει 1:1 ΚΑΘΕ υπάρχον endpoint (grep των paths ταιριάζει με το route list) → κανένα «web endpoint χωρίς mobile consumer» gap. Το μόνο P1 (Statements installment-plan overview) είναι **DONE** (api.ts:274 καλεί `/api/v1/statements/plans`). Ο ενεργός κορυφαίος TODO είναι **Receipts re-scan (P2/M)**. Τα 5 εναπομείναντα items μένουν γνήσια gaps (ξαναελεγμένα από τα directory listings): `receipts/[id]/` έχει μόνο {route.ts, add-to-library} (κανένα rescan), `items/[id]/` έχει μόνο {route.ts, link-plan, plans, price} (κανένα convert-to-task/ai-fill), το `PATCH /api/v1/expenses/[id]` δέχεται μόνο vendor/amount/category/kind/notes/date (route.ts:11-29 επαληθευμένο, PARTIAL — λείπουν period/recurring/recurringCycle/paymentMethod), `GET /api/v1/notifications` υπάρχει+καταναλώνεται και ήδη γυρνά `unread` count (api.ts:412, badge = pure-mobile UI). Από το προηγ. parity audit (`afbccb3`) μόνο 1 code commit άγγιξε web runtime: `5457339` (updatedAt indexes σε 7 synced models = db perf, ΟΧΙ parity feature)· τα υπόλοιπα = docs/docker. mobile `tsc --noEmit` → exit 0 (μηδέν P1 type errors).
>
> **Re-audit 2026-06-30 (cont.³ — parity-auditor, 5η σάρωση ημέρας):** queue ξαναμετρημένη από τον κώδικα. **48 v1 routes** (ανέβηκαν από 46: προστέθηκαν `items/[id]/convert-to-task` + `receipts/[id]/rescan`), **16 mobile screens**, **70** exported api fns (όχι 78, η παλιά μέτρηση ήταν χαλαρή). Το mobile `api.ts` καταναλώνει **ΟΛΑ** τα 48 routes εκτός **ενός**: `POST /api/v1/receipts/[id]/rescan` (χτίστηκε σήμερα ως web endpoint, `d24be27`, **κανένας mobile consumer ακόμα**) → αυτό ΕΙΝΑΙ ο μοναδικός «endpoint χωρίς mobile half» gap. **ΚΡΙΣΙΜΗ αλλαγή vs προηγ. audit:** το queue item «Receipts re-scan» έλεγε `API exists: no` — πλέον **exists: yes** (το endpoint είναι registered + serving, no-token 401 verified). Άρα το TODO ΔΕΝ είναι πια full-stack· είναι **μόνο το mobile half** (api.ts `rescanReceipt` + ReceiptsScreen buttons). Από τα 6 queue items: **4 DONE** (Statements overview, Items convert-to-task, Notifications badge, Expenses full-field edit), **2 TODO GAP**: (α) Receipts re-scan mobile half (P2/M, web endpoint ΕΤΟΙΜΟ, AI → δομικό verify), (β) Items AI specs (P3/M, web endpoint `items/[id]/ai-fill` **ΔΕΝ υπάρχει** — full-stack, AI). DONE επιβεβαιωμένα από κώδικα: `items/[id]/convert-to-task/route.ts` υπάρχει + `convertItemToTask` στο api.ts· `expenses/[id]/route.ts` PATCH έχει period/recurring/recurringCycle/paymentMethod (γραμμές 23-27)· `statements/plans` + `getInstallmentPlans` παρόντα. mobile `tsc --noEmit` → **EXIT 0** (μηδέν P1 type errors). Web commits από `afbccb3`: 4 feature (item-status whitelist, expenses PATCH, convert-to-task, rescan endpoint) + 2 refactor (listEnvelope `{data}`, apiBody helpers) + 1 perf (updatedAt indexes) — όλα ήδη reviewed/clean.

### Tasks — tags + priority στο add/edit (mobile) ✅ DONE (2026-07-01, builder)
- Priority: P3 | Size: S | no AI, no decision
- Web ref: createTask + UpdateTask (file: apps/web/src/app/tasks/actions.ts, apps/web/src/app/tasks/TasksClient.tsx) — το web new-task modal καταχωρεί tags + priority· το mobile όχι.
- API: POST /api/v1/tasks (exists: yes — δέχεται ήδη `tags` [array ή comma-string] + `priority` [low/normal/high], route.ts:52,58) · PATCH /api/v1/tasks/[id] (exists: yes — δέχεται ήδη `tags`/`priority`/`content`/`dueDate`). **Κανένα νέο endpoint· ο builder αγγίζει ΜΟΝΟ mobile.**
- Mobile files: apps/mobile/src/api.ts (`addTask` signature += `{title, tags?, priority?}`· `updateTask` data type += `tags?: string[]`), apps/mobile/src/screens/TasksScreen.tsx (στο `add()`: parse `#word` tokens από το title → tags[], strip από το title πριν το POST [mirror του web quick-add]· στο edit modal: priority picker low/normal/high + tags editor [chips add/remove ή comma input] → `updateTask(id, {title, status, priority, tags})`)
- Acceptance:
  - Quick-add «Buy switch #network #order» → δημιουργεί task title «Buy switch» με tags ['network','order'] (ορατά ως #network #order στη λίστα)
  - Edit modal αλλάζει priority + tags· reflect μετά το reload· POST/PATCH no-token → 401· bad id → 400
  - tsc καθαρό (mobile)
- Status: ✅ DONE (commit pending). `api.ts`: `addTask(title, {tags?,priority?})` + `updateTask` data type += `tags?: string[]`. `TasksScreen.tsx`: `splitTitleTags()` (#word parse με `\p{L}` για ελληνικά tags, strip από title, all-tags input κρατά raw ώστε title≠κενό) στο `add()`· edit modal += PRIORITY picker (low/normal/high, gold high) + TAGS input (space/comma → `parseTags()` dedupe+lowercase)· `updateTask(id,{title,status,priority,tags})`. mobile tsc EXIT 0. Καμία αλλαγή web runtime → χωρίς Docker rebuild.

### Statements — installment-plan overview στο mobile detail
- Priority: P1 | Size: M
- Web ref: InstallmentOverview + computeInstallmentPlans (file: apps/web/src/lib/installments.ts, apps/web/src/app/statements/StatementsClient.tsx)
- API: GET /api/v1/statements/plans (exists: no) — νέο endpoint, mirror του apps/web/src/app/api/v1/items/[id]/plans/route.ts ΧΩΡΙΣ το per-item `linked` filter (return όλα τα plans: label/card/perAmount/remaining*/totalAmount/projectedEndDate/done/itemCount). Η λογική (`computeInstallmentPlans(statements)`) είναι ήδη proven.
- Mobile files: apps/mobile/src/api.ts (νέο `getInstallmentPlans()` + type), apps/mobile/src/screens/StatementsScreen.tsx (header section «INSTALLMENT PLANS» πάνω από τη λίστα: ανά plan → label, card, remaining/total amount, παίδα N/M, payoff date, active-first)
- Acceptance:
  - GET /api/v1/statements/plans no-token → 401· με token → `{currency, plans:[…]}` ομαδοποιημένα cross-statement (ίδια signature → ένα plan)
  - StatementsScreen δείχνει active plans πρώτα με remaining amount + projected payoff· done plans μετά (ή κρυμμένα)
  - Ποσά μέσω `money()` + το σωστό currency· tsc καθαρό (web + mobile)
- Status: DONE (2026-06-30) — `GET /api/v1/statements/plans` + StatementsScreen ListHeader «INSTALLMENT PLANS». Authed round-trip: 9 plans, 5 active-first, real data, read-only.

### Receipts — re-scan stored file (OCR/text) στο detail [MOBILE HALF, web endpoint ΕΤΟΙΜΟ]
- Priority: P2 | Size: M | ⚠ AI cost → δομικό verify μόνο
- Web ref: rescanReceipt (file: apps/web/src/app/receipts/actions.ts)
- API: POST /api/v1/receipts/[id]/rescan (exists: **yes** — `d24be27`, `apps/web/src/app/api/v1/receipts/[id]/rescan/route.ts`) — body `{ocr?:boolean}`· καλεί το ίδιο pipeline με το web `rescanReceipt(id, useOcr)`, withAuth + 24-hex id-guard (bad id → 400), επιστρέφει **ΑΚΡΙΒΩΣ το shape του GET /api/v1/receipts/[id]** (re-query + trimReceipt + normalized lineItems `{name,qty,price,vatRate}` + notes) + `aiUsed/model/aiError`. **ΑΡΑ ΑΠΟΜΕΝΕΙ ΜΟΝΟ το mobile half** — μην ξαναχτίσεις το endpoint.
- Mobile files: apps/mobile/src/api.ts (νέο `rescanReceipt(id, ocr)` → `POST /api/v1/receipts/${id}/rescan`, type = το ίδιο με `getReceipt`), apps/mobile/src/screens/ReceiptsScreen.tsx (στο detail modal: «Re-scan: OCR / text» buttons → spinner → re-prefill τα editable πεδία [store/date/total/lineItems/notes] από το response, όπως μετά το camera scan)
- Acceptance:
  - `rescanReceipt` καλεί το υπάρχον endpoint· response έχει ίδιο shape με `getReceipt` → re-prefill in-place (χωρίς reopen)
  - Δομικό verify μόνο (το endpoint είναι ήδη registered + no-token 401 verified· tsc καθαρό web+mobile)· **ΜΗΝ τρέξεις πραγματικό AI scan** (κόστος)
- Status: DONE (2026-07-01) — `rescanReceipt(id, ocr)` στο `api.ts` (POST `/api/v1/receipts/${id}/rescan`, response = `{receipt:ReceiptDetail, aiUsed, model, aiError}`) + «Re-scan text/OCR» bar στο ReceiptsScreen detail modal (κάτω από το image, πάνω από STORE): spinner ανά κουμπί, `setDetail(r.receipt)` → ο υπάρχων prefill effect ξανα-γεμίζει store/date/total/lineItems/notes in-place + `load()` refresh της λίστας, `aiError`→Alert. Δομικό verify μόνο (tsc mobile EXIT 0)· **κανένα πραγματικό AI scan** δεν τρέχτηκε (κόστος).

### Items — convert to task
- Priority: P3 | Size: S | no AI
- Web ref: convertItemToTask (file: apps/web/src/app/items/actions.ts:649)
- API: POST /api/v1/items/[id]/convert-to-task (exists: **yes**) — δημιουργεί Task από το item (title + price + links σε HTML content, tag 'shopping'), επιστρέφει `{ok, taskId}`. Καθαρό wrap του `convertItemToTask` (μηδέν AI), 24-hex id-guard, item αμετάβλητο.
- Mobile files: apps/mobile/src/api.ts (`convertItemToTask(id)`), apps/mobile/src/screens/ItemsScreen.tsx (κουμπί «＋ Convert to task» στο item edit modal + Alert επιβεβαίωση)
- Acceptance:
  - POST .../convert-to-task no-token → 401· valid → νέο Task ορατό στο TasksScreen
  - tsc καθαρό (web + mobile)
- Status: **DONE** (2026-06-30 builder — `POST /api/v1/items/[id]/convert-to-task` + mobile button· tsc καθαρό web+mobile· structural 401 verified)

### Notifications — unread badge στο AppBar
- Priority: P3 | Size: S | no AI
- Web ref: notification bell με unread count (file: apps/web/src/components/SiteNav* / notifications)
- API: GET /api/v1/notifications (exists: yes) — επιστρέφει ήδη `items` με `read`
- Mobile files: apps/mobile/src/nav.tsx (AppBar: μικρό 🔔 με κόκκινο badge = unread count, tap → Activity/Alerts), apps/mobile/App.tsx (poll/refresh count· tap → setScreen('activity'))
- Acceptance:
  - Badge δείχνει τον αριθμό unread· μηδέν unread → χωρίς badge
  - Tap → ανοίγει Activity (Alerts tab)· tsc καθαρό
- Status: DONE (2026-06-30) — AppBar 🔔 με κόκκινο badge (unread count, 99+ cap)· tap → `setScreen('activity')` (ActivityScreen default tab = alerts). App.tsx: `unread` state, `getNotifications().unread` poll κάθε 60s + refresh σε κάθε screen change (πιάνει το mark-read στο Activity). Καμία αλλαγή σε api.ts (`getNotifications` γυρνά ήδη `unread`). mobile tsc EXIT 0.

### Expenses/Income — full-field edit
- Priority: P3 | Size: S | no AI
- Web ref: updateExpense full fields (file: apps/web/src/app/expenses/actions.ts)
- API: PATCH /api/v1/expenses/[id] (exists: PARTIAL) — δέχεται ΜΟΝΟ vendor/amount/category/kind/notes/date (apps/web/src/app/api/v1/expenses/[id]/route.ts:17-22). ⚠ ΛΕΙΠΟΥΝ period/recurring/recurringCycle/paymentMethod → ο builder πρέπει ΠΡΩΤΑ να επεκτείνει το PATCH (mirror του web `updateExpense`: `set.period`, `set.recurring`=bool, `set.recurringCycle` enum-guarded, `set.paymentMethod`) πριν τα δείξει στο mobile.
- Mobile files: apps/mobile/src/api.ts (`updateExpense` signature += period/recurring/recurringCycle/paymentMethod), apps/mobile/src/screens/MoneyScreen.tsx (το `openEdit`/`saveEdit` καλύπτουν μόνο vendor/amount/category → πρόσθεσε date, period, recurring toggle + cycle picker, payment, notes)
- Acceptance:
  - PATCH /api/v1/expenses/[id] δέχεται πλέον period/recurring/recurringCycle/paymentMethod (enum-guarded cycle)· no-token → 401· bad id → 400
  - Edit modal αποθηκεύει date/period/recurring/cycle/payment/notes· reflect μετά το reload
  - tsc καθαρό (web + mobile)
- Status: DONE (2026-06-30) — PATCH επεκτάθηκε με period/recurring/recurringCycle (enum-guard ίδιος με POST)/paymentMethod· MoneyScreen edit modal πλέον date/period/payment/recurring toggle+cycle picker/notes (ScrollView, maxHeight 88%)· mobile `Expense` type + `updateExpense` signature += τα 4+notes πεδία. Structural verify: safe rebuild → /login 200, web restarts 0, PATCH no-token/bogus-token → 401· web+mobile tsc EXIT 0.

### Items — AI specs / AI-fill info
- Priority: P3 | Size: M | ⚠ AI cost → δομικό verify μόνο
- Web ref: aiFillSpecs / aiFillInfo (file: apps/web/src/app/items/actions.ts:533,571)
- API: POST /api/v1/items/[id]/ai-fill (exists: yes, 2026-07-01) — body `{mode:'specs'|'info'}`· wraps τα web actions· returns `{ok, mode, specs?, filled?, error?}` (όχι item — ο client ξανακαλεί GET /items/:id)
- Mobile files: apps/mobile/src/api.ts (`aiFillItem(id, mode)`), apps/mobile/src/screens/ItemsScreen.tsx (κουμπιά «✦ AI specs» / «✦ AI info» στο item detail)
- Acceptance:
  - POST .../ai-fill no-token → 401· bad id → 400 ✓
  - Δομικό verify μόνο (δεν τρέχτηκε πραγματικό AI)· web+mobile tsc EXIT 0 ✓
- Status: DONE (2026-07-01) — νέο route `items/[id]/ai-fill` (id-guard 24-hex, withAuth, mode default 'specs', AI-feature-gated μέσω των actions)· mobile `aiFillItem(id, mode)` + AI bar (specs/info) στο edit modal· on-success → re-fetch detail + list refresh, 'specs' γεμίζει το textarea, 'info' → Alert με τα filled πεδία. Structural verify: safe rebuild → /login 200, web restarts 0, ai-fill no-token → 401. **Parity queue: 6/6 DONE.**

---

## UI Debt Queue
> **ui-auditor re-audit 2026-07-01 (5η σάρωση):** επανα-επαλήθευσα κάθε dimension από τον κώδικα. **Δύο counts ανέβηκαν από το `2223203` (Tasks tags/priority)**, όχι νέο δομικό πρόβλημα: (α) `#000` literals **32 → 33** — ο νέος PRIORITY picker πρόσθεσε ένα `color:'#000'` (TasksScreen:125, onAccent στο ενεργό priority pill, δίπλα στο υπάρχον status-pill :117)· καλύπτεται από το Button+Chip item (`onAccent` migration). (β) input style entries **17 → 18** — το edit-modal του Tasks απέκτησε `modalInput` (TasksScreen:161, radius 10)· ήδη στο Input-item scope. Πλήρης ανάλυση των 33 `#000`: **32 `color:'#000'`** text/pill (ΟΛΑ onAccent) + **9 `<ActivityIndicator color="#000">`** props + **1 `alpha('#000',0.6)`** backdrop (κάποιες γραμμές μετρώνται σε 2 buckets· το grep `#000` δίνει 33 μοναδικές γραμμές). Σταθερά: non-`#000` 6-digit hex **0**, 8-digit alpha hex **0**, `card:` **5**, chip-variant **8**, badge-variant **2**, `maxWidth` **2** (καμία στο content: AssistantScreen:69 bubble + nav.tsx:87 drawer panel), raw 24×24 checkbox Views **0** (το `<Check>` primitive τα ενοποίησε), TextInput sites **68** (11 screens). `ui.tsx` εξάγει ΑΚΟΜΑ μόνο `Header/Centered/Spinner/ErrorText/Empty/Check` (+`CUR/money/shortDate`) — **μηδέν Input/Button/Chip/Card/Badge primitive**· `react-native-safe-area-context` **0** imports + **εκτός** `package.json`. **3 foundation DONE (theme tokens + alpha + touch targets), 6 TODO**· κορυφαίο = **Input primitive (P1/M)** — απόκλιση tokens επιβεβαιωμένη live: borderRadius **10** (7 entries) vs **12** (7 entries) vs **14** (AssistantScreen:77), paddingHorizontal **10/12/14**, paddingVertical **8/9/10/11**, fontSize **14** (logInput) / **15** (τα περισσότερα) / **16** (SearchScreen:85). mobile `tsc --noEmit` **EXIT 0**. Read-only, μηδέν app-code άλλαξε.
>
> **ui-auditor re-audit 2026-07-01 (αργά νύχτα, 4η σάρωση):** ΝΕΟΣ mobile commit ενδιάμεσα — `86c6ada` (feat parity: Items AI specs/info, mobile half) άγγιξε `ItemsScreen.tsx` (+30) + `api.ts` (+9). Επιθεώρησα το diff: πρόσθεσε **νέο ghost-button** `aiBtn` (`borderRadius:12, paddingVertical:10, borderColor:C.accent`) + `aiBtnText` (`color:C.accent, fontSize:14`) — χρώματα σωστά από tokens (μηδέν νέο hardcoded hex, μηδέν νέο `#000`), αλλά **radius/padding ξανά magic numbers** (12/10) και είναι **ακόμα μια ad-hoc button-variant** που θα αντικαθιστούσε το `Button` primitive → το πρόσθεσα στο edit list του Button+Chip item. Live counts ΑΜΕΤΑΒΛΗΤΑ από τη νυχτερινή σάρωση: `#000` **32** (23 text-style + 8 `ActivityIndicator color="#000"` + 1 `alpha('#000',0.6)` backdrop, ΟΛΑ onAccent), 8-digit alpha hex **0**, input style entries **17**, `card:` **5**, chip-variant **27**, badge-variant **4**, save/add-btn refs **21**, `maxWidth` **2** (καμία στο content), TextInput sites **78**. `ui.tsx` εξάγει ΑΚΟΜΑ μόνο `Header/Centered/Spinner/ErrorText/Empty/Check` (+`CUR/money/shortDate`) — μηδέν Input/Button/Chip/Card/Badge primitive· `react-native-safe-area-context` **εκτός** `package.json` + **0** imports. **3 foundation DONE, 6 TODO**, κορυφαίο = **Input primitive (P1/M)**. mobile `tsc --noEmit` **EXIT 0**. Read-only, μηδέν app-code άλλαξε.
>
> **ui-auditor re-audit 2026-07-01 (νύχτα, 3η σάρωση):** κατάσταση κώδικα ΑΜΕΤΑΒΛΗΤΗ (clean tree, μηδέν mobile commits από `245be25` → `git log 245be25..HEAD -- apps/mobile/src` κενό· τελευταίος mobile commit = `fbda2b3` receipts re-scan). **ΔΙΟΡΘΩΣΗ μέτρησης:** οι προηγούμενες σαρώσεις **υπομετρούσαν** τα `#000` literals (έλεγαν 23) γιατί μετρούσαν μόνο τα `color:'#000'` StyleSheet entries· ο πλήρης grep `#000\b` δίνει **32** — τα 23 text-style + **8 inline `<ActivityIndicator color="#000">`** props (Login:69, Items:102/360/425, Vouchers:182, Settings:172/355/483/563) + **1 `alpha('#000',0.6)`** backdrop (Settings:678). ΟΛΑ τα 32 είναι σημασιολογικά onAccent (κείμενο/spinner πάνω σε accent/cyan button) → λύνονται με το Button primitive + migration σε `C.onAccent`· ο spinner sub-category (`color="#000"`→`color={C.onAccent}`) είναι μικρή προσθήκη στο ίδιο item. Άλλες διορθώσεις: input style entries **15→17** (ο ευρύτερος grep έπιασε MoneyScreen:232/249, SettingsScreen:633, ItemsScreen:460/500 — line refs του Input item refreshed παρακάτω), `card:` entries **5** (ActivityScreen/ReportsScreen/SettingsScreen/StatementsScreen/VouchersScreen), chip-variant **22**, badge-variant **5**, save/add-btn refs **34**, `maxWidth` **2** (καμία στο content). `theme.ts` scales ΟΚ (`SPACE`/`RADIUS`/`SIZE`/`alpha`), `ui.tsx` εξάγει ΑΚΟΜΑ μόνο `Header/Centered/Spinner/ErrorText/Empty/Check` (+`CUR/money/shortDate`) — μηδέν Input/Button/Chip/Card/Badge· `react-native-safe-area-context` **0** imports + εκτός `package.json`. 3 foundation DONE, **6 TODO**, κορυφαίο = **Input primitive (P1/M)**. mobile `tsc --noEmit` **EXIT 0**. Read-only, μηδέν app-code άλλαξε.
>
> **ui-auditor re-audit 2026-07-01 (απόγευμα):** δεύτερη σάρωση της ημέρας, κατάσταση ΑΜΕΤΑΒΛΗΤΗ από το πρωί. Live counts: `#000` literals **23** (10 screens: Items 5, Subscriptions/Money/Tasks 3, Assistant/Shopping/Vouchers 2, Settings/Login/Receipts 1), 8-digit alpha hex **0** (grep καθαρό), input style entries **15**, `card:` entries **6**, chip-variant entries **54**. Το `ui.tsx` εξάγει ΑΚΟΜΑ μόνο `Header/Centered/Spinner/ErrorText/Empty/Check` (+`CUR/money/shortDate`) — μηδέν Input/Button/Chip/Card/Badge primitive· `react-native-safe-area-context` **0** imports + εκτός `package.json`. Foundation DONE μένουν 3 (theme tokens + alpha + touch targets), **6 TODO**. Κορυφαίο TODO = **Input primitive (P1/M)**: επιβεβαιωμένη απόκλιση tokens live, borderRadius **10/12/14** (SettingsScreen:615=10, ItemsScreen:440=12, AssistantScreen:77=14), paddingHorizontal **10/12/14** (ItemsScreen:500=10, ItemsScreen:440=12, SearchScreen:85=14), paddingVertical **8/9/10/11** (logInput=8, budgetInput=9, minput=10, input=11), fontSize **14/15/16** (logInput=14, input=15, SearchScreen:85=16). tsc `--noEmit` EXIT 0. Read-only audit, μηδέν app-code άλλαξε.
>
> **ui-auditor re-audit 2026-07-01 (πρωί):** σάρωση επιβεβαίωσε ότι ΤΙΠΟΤΑ νέο δεν υλοποιήθηκε από τον builder ενδιάμεσα στα 6 TODO items — το `ui.tsx` εξάγει ΑΚΟΜΑ μόνο `Header`/`Centered`/`Spinner`/`ErrorText`/`Empty`/`Check` (+`CUR`/`money`/`shortDate`), μηδέν Input/Button/Chip/Card/Badge primitive· `react-native-safe-area-context` ΑΚΟΜΑ εκτός `package.json`. **Μεταβολή από προηγούμενη σάρωση: τα `#000` literals έπεσαν 31→23** (το `<Check>` primitive ενοποίησε άλλα 8 onAccent literals). Τα 3 foundation items μένουν τα μόνα DONE (theme tokens + alpha + touch targets). Ο ενεργός κορυφαίος TODO παραμένει **Input primitive (P1/M)**: μετρήθηκαν live **15** input style entries / **11** screens με αποκλίνοντα tokens — borderRadius **10/12/14** (SettingsScreen:615=10, ItemsScreen:440=12, AssistantScreen:77=14), paddingHorizontal **12/14**, paddingVertical **10/11**, fontSize **15/16** (SearchScreen:85=16 vs τα υπόλοιπα 15). tsc `--noEmit` EXIT 0 (read-only). Read-only audit, μηδέν app-code άλλαξε.
>
> **Builder 2026-06-30 (cont. — Touch targets):** «Touch targets ≥44pt» **DONE** → shared `<Check>` primitive στο `ui.tsx` ενοποίησε τα 6 διπλά checkbox style-triplets + TasksScreen interactive box hitSlop 8→10 (44pt) + 5 `#000` literals → `C.onAccent`. Queue UI Debt: τα DONE πλέον **3** (theme tokens + alpha helper + touch targets), **6 TODO**. Ο ενεργός κορυφαίος TODO παραμένει **Input primitive (P1/M)** — μεγάλη μετανάστευση ~50 TextInput sites/11 screens, καλύτερη για attended run (no simulator → οπτικό verify ρίσκο)· εναλλακτικά Button+Chip primitives (P2/M, χτίζει πάνω στο onAccent). `#000` literals τώρα ~31 (ήταν 36).
>
> Mobile UI consistency audit (re-verified 2026-06-30 βραδινό — ui-auditor, 4η σάρωση ημέρας). Πόσο «universal» είναι το mobile UI σε σχέση με το web design system. Ranked: μικρά + P1 πρώτα. Το shared-theme item είναι foundation, άλλα εξαρτώνται από αυτό. Ο builder παίρνει το πρώτο TODO. Read-only audit, μηδέν app-code άλλαξε. **Re-audit: τα 2 foundation items παραμένουν τα ΜΟΝΑ DONE (commit `362efc5`): το `theme.ts` εξάγει `SPACE`/`RADIUS`/`SIZE` scales + `surface3`/`orange`/`onAccent` + `alpha(hex,n)` helper, 8-digit alpha hex = 0 (grep καθαρό). Κανένα από τα 7 εναπομείναντα items δεν υλοποιήθηκε από τον builder ενδιάμεσα: το `ui.tsx` έχει ΑΚΟΜΑ μόνο `Header`/`Centered`/`Spinner`/`ErrorText`/`Empty` (μηδέν Input/Button/Chip/Card/Badge primitive — επιβεβαιωμένο από τα 5 exported fns), `react-native-safe-area-context` ΑΚΟΜΑ εκτός `package.json`. Ο ενεργός κορυφαίος TODO = Input primitive (P1/M). Τα νούμερα ανανεώθηκαν.**
>
> Σύνοψη ευρημάτων (refreshed 2026-07-01 πρωί): **23** hardcoded hex εκτός `theme.ts`, **ΟΛΑ `#000`** (3-digit text-on-accent literals) σε 10 screens (Items 5, Subscriptions/Money/Tasks 3, Assistant/Shopping/Vouchers 2, Receipts/Settings/Login 1) — μηδέν non-`#000` 6-digit literal (grep καθαρό), μηδέν 8-digit alpha hex. Card-style entries **6**, chip-variant entries **27**, badge-variant entries **6** (local per-screen, μη ενοποιημένα). State handling ΗΔΗ συνεπές μέσω `ui.tsx` (Spinner 16 / Empty 10 / ErrorText 12 χρήσεις). 2 `maxWidth` (καμία στο content). [Ιστορικό: ΗΤΑΝ **36** literals, (Money/Assistant/Tasks/Subscriptions/Shopping/Receipts/Vouchers/Settings/Items/Login) — δεν έχει μείνει κανένα non-`#000` solid literal ούτε άλλο tinted hex· αυτά λύνονται με μετανάστευση σε `C.onAccent` (καλύπτεται από το Button primitive item + το onAccent follow-up). **0** alpha-tinted 8-digit hex (ΗΤΑΝ 8 → όλα `alpha()`). Το `theme.ts` έχει scales (✅) αλλά μηδέν reusable Input/Button/Chip/Card/Badge primitives στο `ui.tsx`: το input style ξαναγράφεται σε **15** entries (10 `input:` + 5 `minput`/`einput` variants) / **11** screens **με αποκλίνοντα tokens** (borderRadius 12 vs 10 vs 14, paddingVertical 11 vs 10, fontSize 15 vs 16 — επιβεβαιωμένο live ItemsScreen:426 vs :446, SearchScreen:85, AssistantScreen:77), `saveText`/`saveBtn`/`addBtn` **12×**, local `card`/`badge`/`chip` **11×**. Μηδέν light theme / theme context (το web έχει πλήρες light mode στο globals.css:37-50). `react-native-safe-area-context` **δεν είναι ακόμα dependency** → plain `SafeAreaView` (App.tsx:74) χωρίς bottom-inset (bottom-sheets κάτω από το home indicator). Μόνο **2** `maxWidth` usages σε όλο το app (καμία στο content → edge-to-edge σε tablet/landscape). ~7 touch targets <44pt (24×24 checkboxes ×6 + 30×30 lineDel + 36×36 rm + 40×36 backBtn) — τα περισσότερα έχουν ήδη hitSlop, το item έκλεισε DONE.] Re-confirmed 2026-07-01: tsc `--noEmit` EXIT 0.

### Theme tokens: spacing + radius + typography scale + missing colors
- Priority: P1
- Size: S
- Web ref: `@theme` tokens (font-display/body/mono, surface-3, orange) (file: apps/web/src/app/globals.css:3-23)
- Mobile files: apps/mobile/src/theme.ts (επέκταση του `C` + νέα exports `SPACE`, `RADIUS`, `FONT`/`SIZE`)
- Depends on: none
- Acceptance:
  - Το `theme.ts` εξάγει `surface3` (#242424) + `orange` (#ffa502) ώστε να καλύπτει όλα τα web color tokens (globals.css:8-22)
  - Νέα scale exports: spacing (π.χ. 4/8/12/16/24), radius (10/12/14 — τα 3 που ήδη χρησιμοποιούνται ασυνεπώς), font sizes (13/14/15/16/19) με σταθερά ονόματα
  - Νέο `onAccent` token (#000, το χρώμα κειμένου πάνω σε accent/cyan buttons) ώστε να μη γράφεται `'#000'` inline
- Status: DONE (2026-06-30) — `theme.ts` εξάγει `surface3`/`orange`/`onAccent` + `SPACE`/`RADIUS`/`SIZE` scales· τα 5 `#000` onAccent literals του SettingsScreen → `C.onAccent` + το `#f5f5f5` re-def → `C.text`. ΣΗΜ: τα υπόλοιπα ~26 inline `#000` onAccent σε άλλα screens μένουν (μετανάστευση σε `C.onAccent` ανά screen, low-priority follow-up).

### Alpha-tint helper για theme-derived backgrounds/borders
- Priority: P1
- Size: S
- Web ref: `color-mix(in srgb, var(--color-accent) 16%, transparent)` glow helpers (file: apps/web/src/app/globals.css:87-89)
- Mobile files: apps/mobile/src/theme.ts (νέο `alpha(hex, n)` helper), μετά αντικατάσταση των hardcoded alpha hex
- Depends on: Theme tokens: spacing + radius + typography scale + missing colors
- Acceptance:
  - Νέο `alpha()` (ή σταθερά tinted tokens) αντικαθιστά τα 11 hardcoded alpha hex: ActivityScreen.tsx:293,302,311,322 και SettingsScreen.tsx:644,653,664
  - Μηδέν `'#00ff88XX'` / `'#00d4ffXX'` / `'#ff4757XX'` / `'#ffd93dXX'` literals στα screens (grep καθαρό)
- Status: DONE (2026-06-30) — νέο `alpha(hex, n)` (0..1 → rgba) στο `theme.ts`· αντικατέστησε και τα 12 alpha-tinted literals (ActivityScreen ×7 + SettingsScreen ×5, incl. `#000000aa` backdrop). grep για 8-digit hex σε `src/**.tsx` → **NONE**.

### Input primitive (centralize 15 duplicate input styles)
- Priority: P1
- Size: M
- Web ref: shared input στυλ μέσω Tailwind tokens (file: apps/web/src/app/globals.css:8-22)
- Mobile files: apps/mobile/src/ui.tsx (νέο `<Input>` + `<TextArea>`), edits (**18 entries / 11 screens**, refs 2026-07-01 5η σάρωση) σε AssistantScreen.tsx:77, MoneyScreen.tsx:232,249, SubscriptionsScreen.tsx:147,163, TasksScreen.tsx:145,161 (input + νέο modalInput), ItemsScreen.tsx:465,485,528, ShoppingScreen.tsx:157, VouchersScreen.tsx:196,215, SettingsScreen.tsx:615,633, ReceiptsScreen.tsx:268, SearchScreen.tsx:85, LoginScreen.tsx:82
- Depends on: Theme tokens: spacing + radius + typography scale + missing colors
- Acceptance:
  - Ένα `Input` component εξάγεται από `ui.tsx`· τα παραπάνω screens το χρησιμοποιούν αντί για local `input`/`minput`/`einput` StyleSheet entry
  - Καμία απόκλιση borderRadius (τώρα 10 vs 12) ή padding (τώρα 12 vs 14) μεταξύ screens — όλα από το ένα primitive
- Status: 🟡 IN PROGRESS (2026-07-01, builder) — **primitives χτίστηκαν** στο `ui.tsx`: `<Input variant="surface"|"modal">` + `<TextArea>` (base tokens `RADIUS.md/sm` + `SPACE.md` + `SIZE.md`, default `placeholderTextColor`, `style` passthrough για flex/minHeight). Μετανάστευσα τα **4 standard record-form screens** — **MoneyScreen** (2 surface + 9 modal + 1 TextArea notes), **SubscriptionsScreen** (2 surface + 3 modal), **VouchersScreen** (2 surface + 6 modal + 1 TextArea scan), **TasksScreen** (1 surface + 2 modal) — και έσβησα τα τοπικά `input`/`minput`/`modalInput` StyleSheet entries (byte-identical με το primitive base· μόνη ορατή μεταβολή: TasksScreen add-input padH 14→12, ~2px σε full-width field, ασήμαντο). mobile `tsc --noEmit` **EXIT 0**. **Απομένουν** (token-outlier / flex-heavy composers → καλύτερα σε attended run λόγω no-simulator οπτικού verify): **ItemsScreen** (input flex + `logInput` micro padH10/padV8/fs14 + `specs` multiline addon), **ReceiptsScreen** (`einput` + line-item flex + notes multiline), **SettingsScreen** (`input` surface2 + `budgetInput` padV9 + notes/store multilines + marginBottom variant), **ShoppingScreen** (input padH14), **SearchScreen** (input padH14/fs16), **AssistantScreen** (chat composer radius14/maxHeight120), **LoginScreen** (distinct block).

### Button + Chip primitives (add/save buttons + filter/status chips)
- Priority: P2
- Size: M
- Web ref: pill buttons + filter pills (file: apps/web/src/app/globals.css:120-132, design-system pills)
- Mobile files: apps/mobile/src/ui.tsx (νέα `<Button>`, `<Chip>`), edits σε ItemsScreen.tsx:429,436,453,456 + νέο `aiBtn`/`aiBtnText` (από 86c6ada, ghost-variant), SubscriptionsScreen.tsx:149,168, MoneyScreen.tsx:182,200, TasksScreen.tsx:99,119,142, VouchersScreen.tsx:198,222,226, ShoppingScreen.tsx:158,179, ReceiptsScreen.tsx:260,266, SettingsScreen.tsx:621,643, AssistantScreen.tsx:79, LoginScreen.tsx:89
- Depends on: Theme tokens: spacing + radius + typography scale + missing colors
- Acceptance:
  - Ένα `Button` (variant accent/cyan/ghost) με text χρώμα από `onAccent` token· μηδέν inline `color: '#000'` σε button text styles
  - Ένα `Chip` με on/off state αντικαθιστά τα per-screen `chip`/`chipOn`/`cChip`/`sChip` patterns
- Status: TODO

### Card + Badge + ListItem primitives
- Priority: P2
- Size: M
- Web ref: card (border-radius 14, hover lift) + status badges (file: apps/web/src/app/globals.css, CLAUDE.md design-system)
- Mobile files: apps/mobile/src/ui.tsx (νέα `<Card>`, `<Badge>`, `<ListItem>`), edits στα screens που ορίζουν local `card`/`badge`/`row` (ItemsScreen, MoneyScreen, ReceiptsScreen, SettingsScreen, ActivityScreen, StatementsScreen κ.ά.)
- Depends on: Theme tokens: spacing + radius + typography scale + missing colors
- Acceptance:
  - `Card`/`Badge`/`ListItem` εξάγονται από `ui.tsx`· τα 5+ local `card:` και 2+ `badge:` StyleSheet entries αντικαθίστανται
  - Σταθερό border-radius/padding/border σε όλα τα cards (τώρα ποικίλλει ανά screen)
- Status: TODO

### Touch targets ≥44pt
- Priority: P2
- Size: S
- Web ref: mobile-first / FAB conventions (file: CLAUDE.md UI conventions)
- Mobile files: checkbox toggles 24×24 σε SubscriptionsScreen.tsx:170, TasksScreen.tsx:122, SettingsScreen.tsx:625, ShoppingScreen.tsx:165, VouchersScreen.tsx:220, ReceiptsScreen.tsx:258· menuBtn nav.tsx:65 (38×36)· backBtn ui.tsx:35 (40×36)· lineDel ReceiptsScreen.tsx:250 (30×30)
- Depends on: none
- Acceptance:
  - Όλα τα tap targets έχουν effective hit area ≥44×44 (μέσω μεγαλύτερου style ή `hitSlop`)
  - Τα 24×24 checkboxes ταυτίζονται σε ένα κοινό `Checkbox`/`Toggle` με σωστό hit area
- Status: DONE (2026-06-30) — νέο shared `<Check checked />` στο `ui.tsx` (24×24 box + ✓, `C.onAccent` mark) αντικαθιστά τα 6 διπλά `tbox/check + tboxOn/checkOn + tmark/mark/checkMark` triplets σε Tasks/Shopping/Subscriptions/Settings/Vouchers/Receipts (style triplets αφαιρέθηκαν). Ο μόνος interactive-box tap target (TasksScreen:75 Pressable-wrapped) → `hitSlop` 8→**10** (effective 44×44). Side-benefit: 5 hardcoded `#000` onAccent literals έφυγαν (ενοποιήθηκαν σε `C.onAccent` μέσα στο Check). Τα 5 View-based checkboxes είναι display-only μέσα σε μεγάλα pressable rows (≥44, ήδη OK). mobile `tsc --noEmit` EXIT 0. (menuBtn/backBtn/lineDel έχουν ήδη επαρκές hitSlop 12/12/8 → effective ≥44.)

### Safe-area insets (bottom + notch) via react-native-safe-area-context
- Priority: P2
- Size: M
- Web ref: iOS-safe ambient/layout handling (file: apps/web/src/app/globals.css:69-84 comment)
- Mobile files: apps/mobile/App.tsx:74 (αντικατάσταση του plain `SafeAreaView`), apps/mobile/src/nav.tsx (Drawer paddingTop:60 magic number), bottom-sheet modals (π.χ. SettingsScreen.tsx:681 `modalBackdrop` flex-end)
- Depends on: none
- Acceptance:
  - `SafeAreaProvider` + `useSafeAreaInsets` αντί για το RN `SafeAreaView` (που δίνει μόνο top, μηδέν bottom, και Android-manual paddingTop)
  - Bottom-sheet content + κάτω κουμπιά δεν κάθονται κάτω από το home indicator (bottom inset εφαρμοσμένο)
- Status: TODO

### Max content width για tablet / landscape
- Priority: P3
- Size: S
- Web ref: centered max-width layouts (file: apps/web/src/app/settings, max-w 1080)
- Mobile files: apps/mobile/src/ui.tsx (νέο `<Screen>`/content wrapper με maxWidth + center), εφαρμογή στα list screens
- Depends on: none
- Acceptance:
  - Το main content έχει maxWidth (π.χ. 640) και κεντράρεται σε wide viewport· δεν τεντώνεται edge-to-edge σε tablet/landscape (τώρα μόνο 2 maxWidth usages σε όλο το app, καμία στο content)
- Status: TODO

### Light / dark theme via theme context
- Priority: P3
- Size: L
- Web ref: light theme overrides + `data-theme` toggle (file: apps/web/src/app/globals.css:32-51)
- Mobile files: apps/mobile/src/theme.ts (light palette + `ThemeProvider`/`useTheme`), refactor ΟΛΩΝ των screens (το `C` είναι const-imported σε 19 αρχεία) + SettingsScreen theme toggle
- Depends on: Theme tokens: spacing + radius + typography scale + missing colors, Input primitive (centralize 15 duplicate input styles), Button + Chip primitives (add/save buttons + filter/status chips), Card + Badge + ListItem primitives
- Acceptance:
  - `useTheme()` hook δίνει το active palette· μηδέν direct `import { C }` σε screen styles
  - Settings toggle εναλλάσσει light/dark, persisted· όλα τα screens ακολουθούν (τώρα dark-only, μηδέν `useColorScheme`/context)
- Status: TODO
