# Glossary

Pharos-specific terms, in plain language. Where a term has a precise meaning in
the code or UI, this page gives the practical definition and links to the guide
that covers it in depth. Alphabetical.

For how the modules work, see [Features](features.md); for the REST API, see the
[API reference](api.md).

---

## A

**AI command bar.** The single input at the top of the app that understands
plain language ("add a Netflix subscription 15 euro every month", "show this
month's stats"). It runs an AI agent over your data using a small set of tools
(add/update/delete records, search, overview). It can ask a follow-up question
before acting. Requires an Anthropic-capable AI provider. See
[Features → AI command bar](features.md#ai-command-bar--history).

**Anomaly badge.** A small "⚠ ±N%" chip on an expense whose amount deviates more
than 30% from that vendor's usual (median) amount. It is computed on the fly, not
stored. See [Features → Expenses & Income](features.md#expenses--income).

**Archived (receipt).** A receipt marked "not a receipt" (shipping notice, terms
& conditions, marketing email). Archived items are hidden from every view except
the dedicated **Archived** filter, and do not count toward reports. Distinct from
**Trash** (soft delete). See **Receipt status**.

**Auto-add stores.** When enabled, an unknown store name seen on a receipt is
added to your store list automatically (via store resolution). Can be turned off
in Settings so only stores you add by hand are kept.

## B

**Backronym.** PHAROS = **PH** (Personal Hub) + **AROS** (Asset & Resource
Oversight System). A branding device; not a technical term.

**Bearer token.** The API token any API client sends in the
`Authorization: Bearer <token>` header. Obtained by signing in at
`POST /api/v1/auth/login`. See [API → Authentication](api.md#authentication).

**Bill image.** The scanned source file (PDF or photo) attached to an expense or
income record, shown in its detail view so you can check the original document.

**Budget.** A per-category monthly spending target set in Settings. Reports show
actual-vs-budget with a progress bar that turns red when you are over.

**Bulk AI cost guard.** A confirmation dialog shown before running AI on many
records at once, with a rough cost estimate (cloud) or a "free but slow" note
(local Ollama). Toggle in Settings. Protects against surprise API bills.

## C

**Calendar (money agenda).** A rolling 3-month view that merges subscription
renewals, card installments per month, projected recurring bills/income, and
warranty/voucher expiries. Everything is derived live; nothing is stored. See
[Features → Calendar](features.md#calendar).

**Currency symbol.** Pharos is single-currency per deployment. Changing the
currency in Settings swaps the displayed symbol everywhere; it does **not**
convert existing amounts. See [Configuration](configuration.md).

## I

**Installment plan.** A purchase paid in monthly installments across one or more
credit-card statements, reconstructed from the statement charges. A plan carries
its remaining amount, per-month amount, payoff month, and any linked products.
See [Features → Statements & installments](features.md#statements--installments).

**installmentGroupKey.** The effective grouping key for a single charge: a manual
`planKey` override if one was set (see **Merge / bind**), otherwise the
**signature**. Empty when the charge is not a recognisable installment.

**Item.** The core "thing" record. One data model, two views: **Shopping**
(things you plan to buy: `researching → decided → ordered`) and **Inventory**
(things you own: `received → installed`). An item can have multiple store links,
a price history, a target price, warranty, and photos. See
[Features → Items](features.md#inventory--shopping-items).

## L

**Local-first.** Files are always served from the local disk
(`data/storage`, via `/api/files`); Pharos never reads them back from a remote.
Remote storage is a push-only backup/mirror, not the source of truth. See
[Configuration → Storage backends](configuration.md).

## M

**Merge / bind (installments).** When the same purchase appears with a slightly
different description across statements (e.g. "QUEST ONLINE" vs "QUEST ONLINE
KALLITHEA"), you can bind the charges into one plan. This sets a `planKey` on the
charges that overrides the automatic **signature** grouping; future statements
follow the binding. "Unmerge" clears it.

**Mirror.** A push-only copy of your files to a remote backend (SMB, FTP, or
OneDrive). Can run automatically when a receipt is verified, or on demand via
"Sync now". See [Configuration → Storage backends](configuration.md).

## O

**Origin (month).** The month a plan's installments started, computed as
`period − currentInstallment`. Used inside the **signature** so that several
plans from the same merchant with the same monthly amount but different start
dates stay distinct and merge correctly across statements.

## P

**Parsed (receipt).** A receipt the AI has read but you have not confirmed yet
(has a total or line items, but `verified` is still false). See **Receipt
status**.

**Period.** A `YYYY-MM` string used to bucket money records (expenses, incomes,
statements) into a month, independent of the exact day. Recurring auto-generation
and reports work in periods.

**Price panel.** The item view organised around "should I buy, and where?" It
shows the best price now, lowest/highest ever, a target line, a verdict badge
(deal / dropping / rising / good price), a where-to-buy list (cheapest first),
and inline price logging. See [Features → Items](features.md#inventory--shopping-items).

## Q

**Quick verify.** A focused queue that walks through parsed-but-unverified
receipts one at a time, editing only the three headline fields (store, date,
total) with keyboard shortcuts, so you can clear a backlog fast. See
[Features → Receipts](features.md#receipts).

## R

**Receipt status.** Every receipt is in one of four states, used by the status
filter:
- **verified** — you confirmed it (done).
- **parsed** — AI read it, needs review (has a total or line items).
- **failed** — genuinely empty: not verified, not archived, no total, no items.
- **archived** — marked "not a receipt" (hidden from normal views).

**Recurring cycle.** How often a subscription or recurring expense repeats:
`weekly`, `monthly`, `quarterly`, or `yearly`. Drives the calendar projection and
recurring auto-generation.

## S



**Signature (installment).** A stable identity for a plan across statements and
links: `merchant | total | origin`. Charges sharing a signature are recognised as
the same plan even when they appear in different monthly statements.

**Soft delete.** Deleting a record marks it `deletedAt` instead of removing it,
so files and references are kept for a lossless restore. See **Trash**.

**Store resolution.** Normalising a raw store name (lowercase, accents stripped,
Greek→Latin, domain/legal-suffix removed) so that variants ("iStorm",
"istorm.gr", "i-Storm") map to one store. Powers duplicate-store merging and
**auto-add stores**.

## T

**Target price.** The price you are willing to pay for a shopping item. When the
best known price reaches it, the item shows a "deal" verdict and can trigger a
notification.



**Trash.** The soft-delete bin. Deleted items (across most modules) sit here and
can be restored or purged; entries auto-purge after 30 days. Distinct from a
receipt being **archived**. See [Features → Trash](features.md#trash-soft-delete).

## V

**vendorKey.** A normalised form of a vendor name (Greek→Latin, lowercased) used
to group recurring expense/income records into a **series**, so a monthly utility
bill from the same provider is recognised as a continuation.

**Verdict (price).** The one-word judgement on an item's current best price:
`deal` (at or below target), `dropping`, `rising`, or `good price`. Shown as a
badge in the price panel.

**Verified (receipt).** A receipt you have confirmed as correct. Verifying can
mirror its file to remote storage. See **Receipt status**.

**View (item).** Which of the two item lenses you are looking through:
**shopping** (not yet owned) or **inventory** (owned). The same Item moves
between views as its status changes.
