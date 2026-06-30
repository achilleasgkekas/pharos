# Pharos — Web features → Mobile parity

What the **web app** (`apps/web`) does, and where the **mobile app** (`apps/mobile`, Expo) stands.
Legend: ✅ done · 🟡 partial · ❌ missing. This is the mobile roadmap — work top-down by priority.

## Navigation & shell
| Web | Mobile |
|-----|--------|
| Top nav: grouped menus (Stuff/Money/Plan/Activity), central AI/Search bar, AI-online dot, theme toggle, language switcher, notification bell, settings, user menu | 🟡 Drawer menu (Stuff/Money/Plan + Activity + Search/AI/Settings/Sign out), AppBar (☰ + 🔍 + logo). No theme toggle, no language switcher, no notification-bell badge στο AppBar (το feed ζει στο Activity → Alerts) |
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
| Item detail: specs, **PricePanel** (best price, where-to-buy, price position, log price, search online, full history chart), links, photos, warranty, purchase & payment, **link to installment plan**, AI specs, convert-to-task | 🟡 tap-to-edit (title, status, category, price, target, specs) + **PricePanel** (best-now + verdict, position bar low/target/high, where-to-buy tap→open store, log-a-price, full history, photos strip, links, warranty/purchase) + **link to installment plan** (linked δόσεις with payoff + unlink, collapsible picker of available plans → tap to attach). No AI specs (AI cost) / no convert-to-task |
| Delete | ✅ long-press delete |

## Shopping list (`/shopping-list`)
| Web | Mobile |
|-----|--------|
| Quick add, **photo→AI→verify→add**, check-off, Bought section, quick-verify, category color/eyebrow | ✅ add, photo scan, check-off, delete, categories |

## Receipts (`/receipts`)
| Web | Mobile |
|-----|--------|
| Dropzone upload + AI parse, e-shop layout, **email import**, find-duplicates + merge | 🟡 list + camera scan→save |
| Detail: image/PDF, **editable line items (net/VAT/gross)**, store select, ∑-items, **re-scan OCR/text**, **verify**, **archive (not a receipt)**, add items to library | ✅ detail = image + **editable** store/date/payment/total/notes + **editable line items** (name/qty/net/VAT%, gross shown, add/remove) + **∑-items** + **verify** + **archive (not a receipt)** + **add items to inventory**. No re-scan (AI) |

## Expenses & Income (`/expenses`, `/income`)
| Web | Mobile |
|-----|--------|
| **Scan a bill/payslip** (AI), e-shop layout, recurring series + auto-generate, **anomaly badges**, vendor autocomplete | 🟡 list + manual add (vendor+amount) + **AI scan-a-bill** (✦ camera → parse → confirm draft → add; carries date/period/recurring/payment) |
| Detail + **edit** (vendor/amount/category/date/period/recurring/payment/notes) + re-scan | 🟡 tap-to-edit **vendor/amount/category** + long-press delete. No edit of date/period/recurring/payment/notes· no re-scan |

## Statements (`/statements`)
| Web | Mobile |
|-----|--------|
| PDF import, transactions, **installment plans** (compute, link to products, merge/bind, payoff), per-card outstanding, re-scan | 🟡 list + **detail με transactions** (sorted, amount, date, **per-charge installment badge** current/total) + totals (total/min/paid). No aggregated **installment-plan overview** (payoff/remaining/linked products), no merge/bind, no re-scan, no PDF import |

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
| **Kanban** (todo/in-progress/blocked/done, drag + ←/→), board/list toggle, #tags, steps/checklist, project progress by tag | 🟡 list + add + toggle done + tap-to-edit (title + **4-status picker** todo/in-progress/blocked/done) + status chips + tag/priority display + delete. No Kanban board, no #tag-parse on add, no steps/checklist, no project-progress-by-tag |

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
| In-app notification center (bell), ntfy push | 🟡 in-app feed ✅ (Activity → Alerts, με unread state). No bell-with-badge στο AppBar· remote push pipeline buildable αλλά αδοκίμαστο (χρειάζεται EAS dev build + APNs key) |

---

## Roadmap (priority order)
1. ✅ **Edit existing records** — tap-to-edit modals for Tasks, Expenses, Income, Subscriptions, Vouchers, **Items** (PATCH endpoints + forms).
2. ✅ **Tasks statuses** — todo/in-progress/blocked/done picker + status chips.
3. ✅ **Receipt verify/edit** — edit fields + line items + ∑-items + verify + archive + add-to-library. *Remaining: re-scan (AI).*
4. ✅ **AI fill** — subscription-from-name, voucher scan (paste+image), item URL import, expenses scan-a-bill.
5. 🟡 **Statement transactions** — per-statement detail με transactions + per-charge installment badges ✅. *Remaining: aggregated installment-plan overview (payoff/linked products).*
6. 🟡 **Settings** — editable preferences (currency/VAT/warranty/auto-add), editable budgets, payment cards CRUD, stores CRUD, dropdown-lists editor, ntfy URL/enable/test ✅. *Remaining: theme toggle, language, AI engine, storage/OneDrive (βλ. Needs Achilleas).*
7. ✅ **Activity** — Alerts (notification feed) + Trash (restore/purge) + Jobs + History.
8. 🟡 **Push notifications** — in-app feed ✅· remote push pipeline buildable αλλά αδοκίμαστο (needs device + APNs).

> Progress: tap any row on Tasks / Expenses / Income / Subscriptions / Vouchers / **Items** to **edit**; long-press to delete. Items edit covers title, status, category, price, target, specs + full PricePanel + plan-link.

---

## Build Queue
> Ranked για τον builder routine· paίρνει το πρώτο TODO. P1+S πρώτα. Ο πυρήνας του parity είναι κλειστός (CRUD/scan/PricePanel/Activity/Calendar/Reports), οπότε ΔΕΝ υπάρχουν P1/S· ό,τι έμεινε είναι secondary. Όσα έχουν AI cost → δομικό verify μόνο (no token-spend).

### Statements — installment-plan overview στο mobile detail
- Priority: P1 | Size: M
- Web ref: InstallmentOverview + computeInstallmentPlans (file: apps/web/src/lib/installments.ts, apps/web/src/app/statements/StatementsClient.tsx)
- API: GET /api/v1/statements/plans (exists: no) — νέο endpoint, mirror του apps/web/src/app/api/v1/items/[id]/plans/route.ts ΧΩΡΙΣ το per-item `linked` filter (return όλα τα plans: label/card/perAmount/remaining*/totalAmount/projectedEndDate/done/itemCount). Η λογική (`computeInstallmentPlans(statements)`) είναι ήδη proven.
- Mobile files: apps/mobile/src/api.ts (νέο `getInstallmentPlans()` + type), apps/mobile/src/screens/StatementsScreen.tsx (header section «INSTALLMENT PLANS» πάνω από τη λίστα: ανά plan → label, card, remaining/total amount, παίδα N/M, payoff date, active-first)
- Acceptance:
  - GET /api/v1/statements/plans no-token → 401· με token → `{currency, plans:[…]}` ομαδοποιημένα cross-statement (ίδια signature → ένα plan)
  - StatementsScreen δείχνει active plans πρώτα με remaining amount + projected payoff· done plans μετά (ή κρυμμένα)
  - Ποσά μέσω `money()` + το σωστό currency· tsc καθαρό (web + mobile)
- Status: TODO

### Receipts — re-scan stored file (OCR/text) στο detail
- Priority: P2 | Size: M | ⚠ AI cost → δομικό verify μόνο
- Web ref: rescanReceipt (file: apps/web/src/app/receipts/actions.ts)
- API: POST /api/v1/receipts/[id]/rescan (exists: no) — body `{ocr?:boolean}`· καλεί το ίδιο pipeline με το web `rescanReceipt(id, useOcr)`, επιστρέφει το updated receipt detail (ίδιο shape με GET /api/v1/receipts/[id])
- Mobile files: apps/mobile/src/api.ts (`rescanReceipt(id, ocr)`), apps/mobile/src/screens/ReceiptsScreen.tsx (στο detail modal: «Re-scan: OCR / text» buttons → spinner → re-prefill τα editable πεδία από το αποτέλεσμα, όπως μετά το camera scan)
- Acceptance:
  - POST .../rescan no-token → 401· bad id → 400
  - Μετά το re-scan, τα store/date/total/lineItems re-prefill-άρονται in-place (χωρίς reopen)
  - Δομικό verify μόνο (endpoint registered, IMG build, no-token 401)· ΜΗΝ τρέξεις πραγματικό AI scan (κόστος)· tsc καθαρό
- Status: TODO

### Items — convert to task
- Priority: P3 | Size: S | no AI
- Web ref: convertItemToTask (file: apps/web/src/app/items/actions.ts:649)
- API: POST /api/v1/items/[id]/convert-to-task (exists: no) — δημιουργεί Task από το item (title + links στα notes), επιστρέφει `{ok, taskId}`. Καθαρό port του `convertItemToTask` (μηδέν AI).
- Mobile files: apps/mobile/src/api.ts (`convertItemToTask(id)`), apps/mobile/src/screens/ItemsScreen.tsx (κουμπί «→ Convert to task» στο item detail· επιβεβαίωση + toast)
- Acceptance:
  - POST .../convert-to-task no-token → 401· valid → νέο Task ορατό στο TasksScreen
  - tsc καθαρό (web + mobile)
- Status: TODO

### Notifications — unread badge στο AppBar
- Priority: P3 | Size: S | no AI
- Web ref: notification bell με unread count (file: apps/web/src/components/SiteNav* / notifications)
- API: GET /api/v1/notifications (exists: yes) — επιστρέφει ήδη `items` με `read`
- Mobile files: apps/mobile/src/nav.tsx (AppBar: μικρό 🔔 με κόκκινο badge = unread count, tap → Activity/Alerts), apps/mobile/App.tsx (poll/refresh count· tap → setScreen('activity'))
- Acceptance:
  - Badge δείχνει τον αριθμό unread· μηδέν unread → χωρίς badge
  - Tap → ανοίγει Activity (Alerts tab)· tsc καθαρό
- Status: TODO

### Expenses/Income — full-field edit
- Priority: P3 | Size: S | no AI
- Web ref: updateExpense full fields (file: apps/web/src/app/expenses/actions.ts)
- API: PATCH /api/v1/expenses/[id] (exists: yes) — δέχεται ήδη date/period/recurring/recurringCycle/paymentMethod/notes
- Mobile files: apps/mobile/src/screens/MoneyScreen.tsx (το edit modal να καλύπτει date, period, recurring toggle + cycle, payment, notes — όχι μόνο vendor/amount/category)
- Acceptance:
  - Edit modal αποθηκεύει date/period/recurring/cycle/payment/notes· reflect μετά το reload
  - tsc καθαρό (mobile)
- Status: TODO

### Items — AI specs / AI-fill info
- Priority: P3 | Size: M | ⚠ AI cost → δομικό verify μόνο
- Web ref: aiFillSpecs / aiFillInfo (file: apps/web/src/app/items/actions.ts:533,571)
- API: POST /api/v1/items/[id]/ai-fill (exists: no) — body `{mode:'specs'|'info'}`· port των web actions, επιστρέφει updated item
- Mobile files: apps/mobile/src/api.ts (`aiFillItem(id, mode)`), apps/mobile/src/screens/ItemsScreen.tsx (κουμπί «✦ AI specs» στο item detail)
- Acceptance:
  - POST .../ai-fill no-token → 401· bad id → 400
  - Δομικό verify μόνο (μην τρέξεις πραγματικό AI)· tsc καθαρό
- Status: TODO
