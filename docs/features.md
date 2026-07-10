# Features

PHAROS is a self-hosted personal hub. It keeps track of the things you own, the
money you spend and earn, the documents that prove it (receipts, statements),
and the small logistics of running a household or a home lab. Optional AI reads
your documents so you do not have to type them in by hand.

This page describes each module from a user's point of view. For how to install
it, see [Self-hosting](self-hosting.md). For how to wire up AI providers,
storage, and notifications, see the [Configuration guide](configuration.md).

Everything below is available both in the web app and, for most modules, through
the REST API (`/api/v1`) that the mobile companion app uses; see the
[API reference](api.md).

## Contents

- [Inventory & Shopping (Items)](#inventory--shopping-items)
- [Shopping list](#shopping-list)
- [Receipts](#receipts)
- [Expenses & Income](#expenses--income)
- [Statements & installments](#statements--installments)
- [Subscriptions](#subscriptions)
- [Bills & payables](#bills--payables)
- [Vouchers](#vouchers)
- [Calendar](#calendar)
- [Reports](#reports)
- [Tasks](#tasks)
- [Network (UniFi)](#network-unifi)
- [AI command bar & history](#ai-command-bar--history)
- [Search](#search)
- [Notifications](#notifications)
- [Trash (soft delete)](#trash-soft-delete)
- [Settings](#settings)

---

## Inventory & Shopping (Items)

One data model, two views. An **Item** is anything you own or plan to buy, with a
status that moves through `researching → decided → ordered → received → installed`
(or `deferred`). The **Inventory** view (`/items`) shows what you already own
(`received` / `installed`); the **Shopping** view (`/shopping`) shows what you are
still tracking to buy.

Each item can hold specs, notes, tags, a location, a category, one or more
**store links** (each with its own price), and a full **price history**. Because
the same product can be sold in several shops, an item aggregates multiple store
links and prices rather than duplicating the product.

Highlights:

- **Price tracking.** Set a **target price** and the item shows the best current
  store price, the lowest price ever seen, a price-position bar (where the current
  best sits between the cheapest and most expensive), a trend arrow, and a "good
  price / deal" verdict. You can log a price by hand, and a modernised Price panel
  answers "should I buy, and where?" at a glance.
- **Add from a URL.** Paste a product link and PHAROS fetches the page, uses AI to
  read specs / price / category / photos, and either creates a new item or, if it
  recognises the product, adds the new store link and price to the existing item.
- **AI fill.** Enrich an item's specs, tags, and photos from the web. A relevance
  guard prevents writing details from the wrong product.
- **Bulk actions.** Select multiple items and run AI fill on the selection.
- **List / grid** layouts, a left filter sidebar (search, status, store, category,
  sort, flag chips such as "has photo", "under warranty", "deals only").
- **Convert to task** for items that need follow-up work.
- **Link to installment plans** so a purchase on your credit-card statement points
  back at the product it paid for (see Statements below).

## Shopping list

A lightweight, shared "to-buy" list (`/shopping-list`), separate from the
product-tracking Items above. Entries are just a name, quantity (free text like
"2", "500g", "pack of 6"), optional category / brand / note, and a checked flag.
Meant for groceries and quick captures. You can add an entry by photographing a
product, and AI extracts the name.

## Receipts

Drag-and-drop (or camera) upload of receipts as images or PDFs (`/receipts`). The
optional AI **reads the receipt for you**: store, date, total, VAT breakdown, and
line items (each with net / VAT / gross). The pipeline is robust to real-world
scans:

- Text PDFs use the embedded text; scanned / image-only PDFs are rasterised and
  run through OCR; sideways phone photos are auto-rotated before OCR.
- Multi-language and multi-country aware (totals, VAT labels, EU day-first vs US
  month-first dates, comma vs dot decimals).
- The store name is matched against your known-stores list; unknown stores can be
  auto-added.

Each receipt carries a review status: **verified** (green), **parsed** (AI read
it, needs your check), or **needs scan / failed** (empty). A **Quick Verify** mode
lets you rush through the unverified queue one at a time, editing just store /
date / total with keyboard shortcuts. You can also:

- **Re-scan** a receipt (text or OCR) against the stored file.
- **Find duplicates** and merge them (backfilling the most complete record).
- **Add items to library** — turn receipt line items into Inventory items,
  optionally with a warranty end date.
- **Archive** documents that are not receipts (shipping notices, T&Cs, marketing).
- Import receipts in bulk from a Gmail Takeout export (see the project history).

## Expenses & Income

Two views over the same **Expense** model, split by `kind`: **Expenses**
(`/expenses`, money out) and **Income** (`/income`, money in). The UI mirrors
Receipts: dropzone scan, manual add, grid / list, and a filter sidebar.

- **AI scan** of bills, invoices, and payslips extracts vendor, amount, date,
  category, and period.
- **Recurring series.** A `vendorKey` normalises vendor names (including Greek to
  Latin) so repeat bills from the same provider group into a series. New entries
  inherit category and the recurring flag from the previous one, and missing
  periods are auto-generated up to today.
- **Anomaly detection.** For a vendor with enough history, an entry that deviates
  more than ~30% from the median is flagged with a badge (for example "-50% vs this
  vendor's usual"), computed on the fly.
- **Category auto-rules.** A deterministic (no AI) rules engine: "if the vendor or
  description matches X, set the category to Y (and optionally mark it recurring)".
  Rules run on create across all three entry paths (AI scan, manual add, CSV import) —
  a rule wins over the AI guess but a manual add only applies one when you left the
  category unset. An "Apply to existing" button retro-tags uncategorised records.
  Configure the rules in Settings → Money.

### Expense splitting ("who owes what")

A Splitwise-lite tracker built into the expense form for shared costs (a dinner,
a group order, a shared bill). The convention is simple: **you paid the total**, and
each split row is another person, a **free-form name** (not a Pharos account), who
**owes you** their share. `settled` marks that they have paid you back; your own
portion is implicit (total minus the sum of the shares).

- **Split editor.** In an expense's form, add people and set each person's share, or
  press **"Split equally"** (with an optional "count me in" so you take an equal
  slice too). The editor shows your live share and the total owed to you, and you can
  mark any row **paid back**. It stays dormant until you add someone, so nothing
  changes for expenses you did not split.
- **Split badge.** Expense cards and rows show a small badge with the amount still
  owed to you on that expense.
- **Balances.** A **"Balances — who owes you"** modal (button in the expenses header)
  aggregates every split across all your expenses into a per-person balance sheet
  (largest debtor first, names matched case-insensitively). **Settle up** with one
  person clears all their outstanding shares across every expense at once.

Everything is deterministic (no AI) and computed on read; only the `split` rows are
stored on each expense.

## Statements & installments

Upload a credit-card statement PDF (`/statements`) and PHAROS parses the
transactions, including **installment plans** encoded inline in descriptions
(for example `STORE 09/12` meaning installment 9 of 12). It reconstructs each
plan across months, so a purchase paid over 12 or
36 months is tracked as one plan with a running remaining balance and payoff
date.

- **Cards** are managed in Settings (name, last-4, bank, limit, colour).
- **Installment overview** on the statements page lists active and completed
  plans, with remaining amount and total.
- **Manual editing** of a transaction's installment info, and **merge / bind** of
  plans whose description wording differs between statements (for example
  "QUEST ONLINE" vs "QUEST ONLINE KALLITHEA").
- **Link a plan to products** (one plan can cover several items from the same
  purchase), so an installment charge points back at what it bought.
- **Re-scan** (text or OCR) preserves your manual edits and product links.

## Subscriptions

Recurring expenses (`/subscriptions`) such as streaming, cloud storage, and
software. Each has a provider / name, amount, billing cycle
(weekly / monthly / quarterly / yearly), next renewal date, and category. The view
shows monthly / yearly totals and an upcoming-renewals banner, with the same
grid / list and filter layout as the rest of the app.

## Bills & payables

A tracker (`/bills`) for the bills you pay **by hand**, such as electricity (ΔΕΗ),
telephone (ΟΤΕ), or building fees (κοινόχρηστα). This is distinct from
Subscriptions (an **automatic** recurring charge) and from the Calendar (which only
**projects** the future): a bill has a lifecycle you follow, "is it due?, did I
pay it?, was it forgotten?".

Each bill has a title, vendor / payee, amount, due date, category, optional notes,
and an optional billing cycle. Its **status is derived** from the due date and
whether it has been paid, so nothing drifts out of sync:

- **paid** — a payment has been recorded,
- **overdue** — unpaid and the due date has passed,
- **due-soon** — unpaid and due within the next 7 days,
- **upcoming** — unpaid and further out.

The list shows unpaid bills first, then the soonest due, so you triage in order.

Highlights:

- **Mark paid / unpaid.** One click records the payment (with an optional payment
  date). You can undo it, which never touches any expense that was logged.
- **Log an expense on payment (opt-in).** Marking a bill paid can create a matching,
  verified expense (vendor, amount, category, date), linked back to the bill.
- **Recurring bills.** Give a bill a cycle (weekly / monthly / quarterly / yearly)
  and paying it once spawns the **next pending instance** one cycle ahead, so the
  series keeps rolling without a background job. The spawn happens exactly once, on
  the first payment.
- **Notifications.** An unpaid bill that is overdue or due within the alert window
  triggers a notification; the alert auto-expires once the bill is paid.
- **Archive** a one-off you no longer care about, or delete it (soft delete → Trash).

Deleting a bill is a soft delete, so it lands in Trash and can be restored.

## Vouchers

Discount codes and coupons (`/vouchers`): title, code, store, discount,
expiry date, URL, and notes. **AI fill** reads a pasted message or a screenshot
and extracts the fields (for example "15% off Skroutz code SUMMER15 until
31/12/2026 min 50 euros"). Expiring vouchers surface in the Calendar and can
trigger notifications.

## Calendar

A three-month agenda (`/calendar`) that unifies everything with a date:

- subscription renewals (repeated per cycle),
- credit-card installments aggregated per month,
- projected recurring bills and income,
- warranty and voucher expiries.

Each month shows money-out / money-in totals and a "due this month" header.
Everything is derived live from your data; nothing extra is stored.

**Calendar subscription feed.** The same three-month agenda is published as a
read-only iCal (`.ics`) feed at `/api/calendar.ics?token=…`, so you can subscribe
to it from Google, Apple, or Outlook Calendar and see renewals, installments,
projected bills, and expiries alongside your other events. The feed is authed by a
dedicated low-scope calendar token (not your full API bearer, so a leaked subscribe
URL never grants API access); generate, copy, rotate, or revoke it in
Settings → AI.

## Reports

Analytics (`/reports`) over your data with a selectable window (6 / 12 / 24
months):

- **Net worth** — assets (owned-inventory value plus any manual asset accounts)
  minus liabilities (remaining installments plus outstanding card balances), with
  breakdown chips and a monthly trend chart. The owned-inventory value uses the
  depreciation estimate (see below) rather than raw purchase cost.
- monthly spend, cash flow (income vs expense), spend by store,
- inventory value by category (depreciated), subscriptions by category,
- **budgets** (per-category targets set in Settings, with progress bars that turn
  red when over),
- warranties expiring soon, biggest purchases, and installment payoff.

**Asset depreciation.** Owned gear is valued from its purchase price using a
declining-balance curve (value = price × (1 − rate)^years, floored at a salvage
fraction), with per-category annual rates. This keeps net worth and inventory
value realistic as equipment ages instead of holding cost forever. It is computed
on read (nothing stored), a genuine manual current value on an item still wins,
and the whole model (toggle, floor, default rate, per-category rates) is
configurable in Settings → Money → Depreciation (on by default).

## Tasks

A planner (`/tasks`) with a **Kanban board** (Todo / In-Progress / Blocked / Done)
plus a list view. Quick-add with `#tag` parsing, drag-and-drop or arrow-key moves
between columns, and a per-project progress bar when you filter by tag. Items from
Inventory / Shopping can be converted into tasks.

## Network (UniFi)

An optional dashboard (`/network`) that reads your local UniFi controller
(read-only) and shows: WAN status / ISP / public IP / latency, per-device health
(gateways, switches, APs) with uptime / clients / CPU / RAM / temperature, WiFi
radios per band, active PoE ports, a searchable / sortable client table with
top-talkers, VPN status, and the last speedtest (with a "run speedtest" button).
Offline devices or a WAN outage can trigger notifications. Requires UniFi host and
a local (non-SSO) user configured in Settings.

## AI command bar & history

A conversational command bar (in the navbar) lets you type natural-language
requests such as "add a YouTube subscription", "log expense OTE 84 euros", or
"show me this month's stats". It is a tool-using agent over the app's actions: it
can add expenses / income / subscriptions / tasks / items, log a price, update or
delete records, and answer overview questions. If a request is ambiguous it asks a
short follow-up before acting. Past conversations are kept under **AI history**
(`/history`).

The command bar has a **Search / AI toggle**: in Search mode it is the global
search below; in AI mode it is the assistant. The AI command bar requires an
Anthropic-capable provider (see [Configuration → AI providers](configuration.md#ai-providers)).

## Search

Global search across items, receipts, statements, tasks, subscriptions, expenses,
income, and vouchers. Results deep-link straight to the matching record (for
example `/items?open=<id>`).

## Notifications

Alert checks scan for deals (target price hit), installments due this month,
warranties expiring within your lead time, bills that are overdue or due soon,
price hikes, trials ending, expiring gift cards, and network issues, then send a
summary through your configured channel (ntfy and other providers, see
[Configuration → Notifications](configuration.md#notifications)). You can trigger
a check on demand or send a test message from
Settings. The mobile app can also register for push notifications.

## Trash (soft delete)

Most deletes are reversible. Items, receipts, expenses, subscriptions, vouchers,
bills, and tasks are **soft-deleted** (hidden, files and references kept) and land in
**Trash** (Settings → Storage) where you can restore them or delete them forever.
Trash auto-purges entries older than 30 days. (Statements are hard-deleted, to
avoid blocking a re-import of the same month.)

## Settings

Configuration is grouped into tabs:

- **General** — appearance, currency, default VAT, default item view, warranty
  defaults, budgets, about.
- **Money** — budgets (with a **Suggest from history** button that pre-fills
  per-category targets from the median of your last three complete months),
  manual asset accounts, asset depreciation, and payment cards.
- **AI** — provider (Ollama / Anthropic / OpenAI / Gemini / OpenRouter / Custom),
  a separate scraper AI, editable AI prompts, and the calendar feed token
  (generate / copy / rotate / revoke).
- **Network** — UniFi host / user / connection test.
- **Storage & backup** — file storage backend (local / SMB / FTP / OneDrive),
  folder / filename templates, mirror-on-verify, sync, backup / restore, CSV
  export, and Trash.
- **Stores & lists** — known stores (with duplicate detection / merge) and the
  editable dropdown taxonomies (item / expense / subscription categories).
- **Notifications** — ntfy and other channels, with test and check-now buttons.

See the [Configuration guide](configuration.md) for the details of AI providers,
storage backends, notifications, and internationalisation.
