# Pharos — Web features → Mobile parity

What the **web app** (`apps/web`) does, and where the **mobile app** (`apps/mobile`, Expo) stands.
Legend: ✅ done · 🟡 partial · ❌ missing. This is the mobile roadmap — work top-down by priority.

## Navigation & shell
| Web | Mobile |
|-----|--------|
| Top nav: grouped menus (Stuff/Money/Plan/Activity), central AI/Search bar, AI-online dot, theme toggle, language switcher, notification bell, settings, user menu | 🟡 Drawer menu (Stuff/Money/Plan + Search/AI/Settings/Sign out), AppBar (☰ + 🔍 + logo). No theme toggle, no language switcher, no notification bell |
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
| Add item + **URL import** (fetch + AI parse → preview → approve), dedup | 🟡 add by title only (no URL import / AI) |
| Item detail: specs, **PricePanel** (best price, where-to-buy, price position, log price, search online, full history chart), links, photos, warranty, purchase & payment, **link to installment plan**, AI specs, convert-to-task | 🟡 tap-to-edit (title, status, category, price, target, specs) + **PricePanel** (best-now + verdict, position bar low/target/high, where-to-buy tap→open store, log-a-price, full history, photos strip, links, warranty/purchase). No installment-plan link / AI specs / convert-to-task |
| Delete | ✅ long-press delete |

## Shopping list (`/shopping-list`)
| Web | Mobile |
|-----|--------|
| Quick add, **photo→AI→verify→add**, check-off, Bought section, quick-verify, category color/eyebrow | ✅ add, photo scan, check-off, delete, categories |

## Receipts (`/receipts`)
| Web | Mobile |
|-----|--------|
| Dropzone upload + AI parse, e-shop layout, **email import**, find-duplicates + merge | 🟡 list + camera scan→save |
| Detail: image/PDF, **editable line items (net/VAT/gross)**, store select, ∑-items, **re-scan OCR/text**, **verify**, **archive (not a receipt)**, add items to library | 🟡 detail = read-only (image + line items); no edit/verify/rescan/archive |

## Expenses & Income (`/expenses`, `/income`)
| Web | Mobile |
|-----|--------|
| **Scan a bill/payslip** (AI), e-shop layout, recurring series + auto-generate, **anomaly badges**, vendor autocomplete | 🟡 list + manual add (vendor+amount) + **AI scan-a-bill** (✦ camera → parse → confirm draft → add; carries date/period/recurring/payment) |
| Detail + **edit** + re-scan | 🟡 long-press delete; no edit, no scan |

## Statements (`/statements`)
| Web | Mobile |
|-----|--------|
| PDF import, transactions, **installment plans** (compute, link to products, merge/bind, payoff), per-card outstanding, re-scan | 🟡 list only (card/period/total/due/txn count); no transactions/installments |

## Subscriptions (`/subscriptions`)
| Web | Mobile |
|-----|--------|
| e-shop layout, **AI fill from name**, add/edit, cycle, next renewal | 🟡 list + add (name+amount, monthly) + delete; no edit, no AI fill |

## Vouchers (`/vouchers`)
| Web | Mobile |
|-----|--------|
| e-shop layout, **AI scan (paste/image)**, add/edit | 🟡 list + add (title+code) + delete; no AI scan, no edit |

## Calendar (`/calendar`)
| Web | Mobile |
|-----|--------|
| 3-month money agenda: renewals stepped per cycle, **installments aggregated per month**, recurring bills/income projected, warranty + voucher expiries, monthly in/out totals | ✅ 3-month sectioned agenda: renewals stepped, installments aggregated/month (pinned), recurring bills/income projected, warranty/voucher expiries, per-month in/out totals |

## Reports (`/reports`)
| Web | Mobile |
|-----|--------|
| Net-position banner, monthly-spend chart, upcoming-installments, spend-by-store, inventory-value pie, subs-by-category, warranties expiring, biggest purchases, **budgets**, income-vs-expense, date-range | 🟡 net month/year, by-category, last-6-months bars |

## Tasks (`/tasks`)
| Web | Mobile |
|-----|--------|
| **Kanban** (todo/in-progress/blocked/done, drag + ←/→), board/list toggle, #tags, steps/checklist, project progress by tag | 🟡 list + add + toggle done + delete (only 2 states) |

## Settings (`/settings`)
| Web | Mobile |
|-----|--------|
| 7 tabs: appearance/defaults, budgets/cards, **AI engine/features/prompts**, storage/backup/CSV/trash/OneDrive, stores/lists, **ntfy notifications** | 🟡 account + **editable preferences** (currency, VAT, warranty months/alert, auto-add stores) + **editable budgets** + **payment cards CRUD** + **stores CRUD** (search/add/edit/delete, name/url/aliases, needs-review badge) + **dropdown lists editor** (3 category taxonomies, add/remove chips, reset-to-default) + **ntfy URL/enable/test** + server/version. No theme/language, AI engine, storage |

## Activity
| Web | Mobile |
|-----|--------|
| Jobs (background AI), History (AI conversations), Trash (restore/purge) | ❌ none |

## AI & search
| Web | Mobile |
|-----|--------|
| Conversational command bar (add/search/overview…), global search | ✅ AI assistant screen, ✅ global search |

## Notifications
| Web | Mobile |
|-----|--------|
| In-app notification center (bell), ntfy push | ❌ none (push needs a device to test) |

---

## Roadmap (priority order)
1. ✅ **Edit existing records** — tap-to-edit modals for Tasks, Expenses, Income, Subscriptions, Vouchers, **Items** (PATCH endpoints + forms).
2. ✅ **Tasks statuses** — todo/in-progress/blocked/done picker + status chips.
3. **Receipt verify/edit** — edit fields + verify + re-scan. ← next
4. **AI fill** — subscription-from-name, voucher scan, item URL import.
5. **Statement transactions** — per-statement detail + installment plans.
6. 🟡 **Settings** — editable preferences (currency/VAT/warranty/auto-add), editable budgets, payment cards CRUD, ntfy URL/enable/test ✅. *Remaining: theme toggle, language, AI engine, storage, stores/lists.*
7. **Activity** — Trash (restore/purge), Jobs, History.
8. **Push notifications** (needs device).

> Progress: tap any row on Tasks / Expenses / Income / Subscriptions / Vouchers / **Items** to **edit**; long-press to delete. Items edit covers title, status, category, price, target, specs (no price-tracking / photos / links yet).
