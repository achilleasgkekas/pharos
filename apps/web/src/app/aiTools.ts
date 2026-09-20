// Shared AI tool registry + executor. NOT a 'use server' module on purpose: a
// 'use server' file may only export async functions, but the MCP route + the chat
// command bar both need the `TOOLS` array and the `execute()` dispatcher. This is a
// server-only module (it pulls in Mongoose models) — never import it from a client
// component. Behavior is identical to what `runAiCommand` used inline before.
//
// TENANCY: every model here is resolved per call through `currentModel()`, so the tools act on
// the CALLER'S workspace database. `execute()` deliberately does NOT open the gate itself — it
// runs inside the tenant its ENTRY POINT established, because the two entry points authenticate
// with different credentials: `runAiCommand` (session cookie, via `withRequestTenant`) and
// `/api/mcp` (bearer token, resolved from the host like `/api/v1`). Both are gated as of this
// pass; a third caller that forgets would silently read the default database, so it must not be
// added without a gate. Self-hosted has no ambient tenant and `currentModel` returns the
// default-connection model, i.e. exactly the imported model — unchanged behaviour.
import { connectDB } from '@/lib/db';
import { BILLING_CYCLES, isBillingCycle, monthlyEquivalent } from '@/lib/billingCycle';
import { effectiveNextRenewal } from '@/lib/subscriptionRenewal';
import { currentModel } from '@/lib/tenancy/connection';
import { suggestSubscription } from '@/lib/ollama';
import { computeInstallmentPlans } from '@/lib/installments';
import { Subscription } from '@/models/Subscription';
import { Task } from '@/models/Task';
import { Item } from '@/models/Item';
import { Expense } from '@/models/Expense';
import { Receipt } from '@/models/Receipt';
import { Statement } from '@/models/Statement';
import { ShoppingListItem } from '@/models/ShoppingListItem';
import { Voucher } from '@/models/Voucher';
import { Bill } from '@/models/Bill';
import { Goal } from '@/models/Goal';
import { GiftCard } from '@/models/GiftCard';
import { LoyaltyCard } from '@/models/LoyaltyCard';
import { addExpense } from './expenses/actions';
import { importItemFromUrl, logItemPrice } from './items/actions';
import { getAppSettings } from '@/lib/appSettings';
import { cur, currencySymbol } from '@/lib/money';
import { searchAll } from './search-actions';
import { safeDate } from '@/lib/dates';
import { revalidatePath } from 'next/cache';
import type { AnthropicTool } from '@/lib/anthropic';
import type { SerializedStatement } from '@/types';

// P66 — what the assistant may edit or delete. This used to be three types while search_data
// could FIND twelve, so "mark the ΔΕΗ bill as paid" or "add milk to the shopping list" found the
// record and then failed, while the identical sentence about a task worked.
//
// Two deliberate exclusions from the otherwise symmetric "findable ⇒ actionable" rule:
//   - `statement`: the ONLY searchable model without the soft-delete plugin (its unique
//     {card, period} index would block re-importing a month while a trashed copy held the slot).
//     A delete here could not be undone, so delete_record's own promise — "recoverable from
//     Trash for 30 days" — would be a lie. Statements are parsed documents anyway: they are
//     re-imported from the PDF, not hand-edited.
//   - `receipt`: same reasoning about being a scanned document with a file, line items and
//     installment links behind it. Findable (that is the point of P22), but not AI-editable.
const EDITABLE_MODELS = {
  item: Item,
  task: Task,
  subscription: Subscription,
  expense: Expense,
  voucher: Voucher,
  bill: Bill,
  goal: Goal,
  giftcard: GiftCard,
  loyaltycard: LoyaltyCard,
  shoppinglist: ShoppingListItem,
} as const;

export type EditableType = keyof typeof EDITABLE_MODELS;
export const EDITABLE_TYPES = Object.keys(EDITABLE_MODELS) as EditableType[];

// Pages to refresh after a write, per type — beats revalidating every route on every edit.
const REVALIDATE: Record<EditableType, string[]> = {
  item: ['/items', '/shopping'],
  task: ['/tasks'],
  subscription: ['/subscriptions'],
  expense: ['/expenses', '/income'],
  voucher: ['/vouchers'],
  bill: ['/bills'],
  goal: ['/reports'],
  giftcard: ['/vouchers'],
  loyaltycard: ['/vouchers'],
  shoppinglist: ['/shopping-list'],
};

// Fields the assistant must never $set. `_id`/`deletedAt`/`__v` are structural; the two arrays
// are money ledgers (a gift card's spend log, a goal's contributions) whose running balance is
// derived from them — a language model rewriting one wholesale would silently restate a balance.
// Those stay UI-only, exactly as the approved spec asked.
const ALWAYS_BLOCKED = ['_id', '__v', 'deletedAt'];
const BLOCKED_FIELDS: Partial<Record<EditableType, string[]>> = {
  giftcard: ['uses'],
  goal: ['contributions'],
};

function modelFor(type: string): (typeof EDITABLE_MODELS)[EditableType] | null {
  return Object.prototype.hasOwnProperty.call(EDITABLE_MODELS, type) ? EDITABLE_MODELS[type as EditableType] : null;
}

/** Split an update into what may be written and what must be refused (never silently dropped). */
function screenFields(type: EditableType, fields: Record<string, unknown>): { allowed: Record<string, unknown>; blocked: string[] } {
  const deny = [...ALWAYS_BLOCKED, ...(BLOCKED_FIELDS[type] ?? [])];
  const allowed: Record<string, unknown> = {};
  const blocked: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    // Compare on the root key so a dotted path (`uses.0.amount`) cannot smuggle a blocked field.
    if (deny.includes(k.split('.')[0])) blocked.push(k);
    else allowed[k] = v;
  }
  return { allowed, blocked };
}

export const TOOLS: AnthropicTool[] = [
  {
    name: 'add_expense',
    description: 'Record an expense (a bill you paid: rent, electricity, fuel, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        vendor: { type: 'string', description: 'who you paid (e.g. "ΔΕΗ", landlord, fuel station)' },
        amount: { type: 'number' },
        category: { type: 'string', enum: ['rent', 'utilities', 'fuel', 'salary', 'insurance', 'telecom', 'groceries', 'transport', 'health', 'tax', 'subscription', 'other'] },
        date: { type: 'string', description: 'YYYY-MM-DD, default today' },
        recurring: { type: 'boolean' },
      },
      required: ['vendor', 'amount'],
    },
  },
  {
    name: 'add_income',
    description: 'Record income (salary, wages, a payment received).',
    input_schema: {
      type: 'object',
      properties: { source: { type: 'string', description: 'employer / payer' }, amount: { type: 'number' }, date: { type: 'string', description: 'YYYY-MM-DD, default today' } },
      required: ['source', 'amount'],
    },
  },
  {
    name: 'add_subscription',
    description: 'Add a recurring subscription (Netflix, YouTube Premium, Spotify, iCloud, ChatGPT, etc.). If amount/cycle are unknown, infer the typical personal-plan price.',
    input_schema: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'service name, e.g. "Microsoft 365 Family"' },
        amount: { type: 'number' },
        billingCycle: { type: 'string', enum: [...BILLING_CYCLES] },
        category: { type: 'string', description: 'e.g. streaming, cloud, software, gaming' },
        nextRenewal: { type: 'string', description: 'next renewal date as YYYY-MM-DD, if the user gives one (e.g. "every Feb 7" → 2026-02-07)' },
        notes: { type: 'string' },
      },
      required: ['provider'],
    },
  },
  {
    name: 'add_task',
    description: 'Add a to-do task.',
    input_schema: { type: 'object', properties: { title: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['title'] },
  },
  {
    name: 'add_to_list',
    description: 'Add an item to the standalone shopping list (things to buy, e.g. groceries). Use this for "add X to my list / shopping list".',
    input_schema: { type: 'object', properties: { name: { type: 'string' }, quantity: { type: 'string', description: 'optional, e.g. "2" or "500g"' } }, required: ['name'] },
  },
  {
    name: 'add_item',
    description: 'Add an item to the shopping wishlist or inventory.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        status: { type: 'string', enum: ['researching', 'decided', 'ordered', 'received', 'installed', 'deferred'], description: 'received/installed = owned; researching/decided = wishlist' },
        category: { type: 'string', enum: ['network', 'storage', 'compute', 'audio', 'video', 'mobile', 'peripheral', 'consumable', 'other'] },
        price: { type: 'number' },
        url: { type: 'string', description: 'Product page URL. If the user pastes a link, ALWAYS pass it here: the item is then auto-filled from the page (title, specs, price, photos) and, if it matches an item the user already has, the link + price are added to that existing item (multi-store price tracking) instead of creating a duplicate.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'log_price',
    description: "Record a price you spotted for a shopping item (e.g. 'the headphones dropped to 199 at the shop'). Appends to the item's price history so the trend, lowest-ever and deal status update.",
    input_schema: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'Name of the item to log a price for (fuzzy-matched against the wishlist).' },
        price: { type: 'number' },
        store: { type: 'string', description: 'Where the price was seen (optional).' },
      },
      required: ['item', 'price'],
    },
  },
  {
    name: 'get_overview',
    description: 'Get a snapshot of the user\'s finances & data: counts, this-month expenses/income, subscriptions, installments owed. Use this for "show me stats / report / how much did I spend".',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'search_data',
    description:
      'Search everything (items, receipts, statements, subscriptions, tasks, expenses, vouchers, bills, goals, gift cards, loyalty cards, the shopping list) for a keyword. Returns each result with its [type id] so you can edit/delete it.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'update_record',
    description:
      'Edit an existing record. First search_data to find its type + id, confirm the change with the user, THEN call this. fields = the properties to set. Receipts and statements are searchable but NOT editable here (they are parsed from a scanned document — re-import instead).',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: [...EDITABLE_TYPES] },
        id: { type: 'string', description: 'the 24-char id from search_data' },
        fields: {
          type: 'object',
          description:
            'properties to set, e.g. {"status":"done"}, {"amount":12.99,"category":"streaming"}, {"paidAt":"2026-08-03"} to mark a bill paid, or {"checked":true} for a shopping-list line. A gift card\'s spend log and a goal\'s contributions cannot be set here.',
        },
      },
      required: ['type', 'id', 'fields'],
    },
  },
  {
    name: 'delete_record',
    description:
      'Delete a record. First search_data to find its type + id, then CONFIRM with the user before calling. The record goes to the Trash and is recoverable for 30 days. Receipts and statements cannot be deleted here.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: [...EDITABLE_TYPES] },
        id: { type: 'string', description: 'the 24-char id from search_data' },
      },
      required: ['type', 'id'],
    },
  },
];

/**
 * Which tools CHANGE something. The read-only role (P31) is decided by the caller's identity,
 * which only the entry point knows — `execute()` itself runs with whatever credential got it
 * there — so each door consults this set before dispatching.
 *
 * It is a deny-list of names rather than a flag on the tool objects because `AnthropicTool` is
 * the SDK's type and carries no room for one. `everyToolIsClassified` in the test file pins the
 * gap that would otherwise open: a new tool added to `TOOLS` and forgotten here would read as a
 * harmless query and be handed to viewers.
 *
 * `assertCanWrite()` cannot cover this on its own. It resolves the session from cookies and
 * passes silently when there is none — deliberately, so background jobs and cron keep working —
 * and an MCP call carries a bearer token and no cookie, so every write guard downstream saw
 * "no session" and waved it through.
 */
export const WRITE_TOOLS: ReadonlySet<string> = new Set([
  'add_expense',
  'add_income',
  'add_subscription',
  'add_task',
  'add_to_list',
  'add_item',
  'log_price',
  'update_record',
  'delete_record',
]);

/** Read-only tools: everything the registry offers that is not in `WRITE_TOOLS`. */
export function toolWrites(name: string): boolean {
  return WRITE_TOOLS.has(name);
}

function s(input: Record<string, unknown>, key: string): string {
  const v = input[key];
  return typeof v === 'string' ? v : '';
}
function n(input: Record<string, unknown>, key: string): number {
  const v = input[key];
  return typeof v === 'number' ? v : Number(v) || 0;
}
export const today = () => new Date().toISOString().slice(0, 10);

export async function execute(name: string, input: Record<string, unknown>): Promise<{ summary: string; content: string }> {
  try {
    await connectDB();
    switch (name) {
    case 'add_expense': {
      const r = await addExpense({
        kind: 'expense', vendor: s(input, 'vendor'), amount: n(input, 'amount'),
        category: s(input, 'category') || 'other', date: s(input, 'date') || today(),
        currency: 'EUR', period: '', recurring: !!input.recurring, recurringCycle: input.recurring ? 'monthly' : '', paymentMethod: '', notes: '', verified: true,
      });
      const sum = `expense ${s(input, 'vendor')} €${n(input, 'amount')}`;
      return { summary: sum, content: r.ok ? `Saved ${sum}` : `Failed: ${r.error}` };
    }
    case 'add_income': {
      const r = await addExpense({
        kind: 'income', vendor: s(input, 'source'), amount: n(input, 'amount'),
        category: 'salary', date: s(input, 'date') || today(), currency: 'EUR', period: '', recurring: false, recurringCycle: '', paymentMethod: '', notes: '', verified: true,
      });
      const sum = `income ${s(input, 'source')} €${n(input, 'amount')}`;
      return { summary: sum, content: r.ok ? `Saved ${sum}` : `Failed: ${r.error}` };
    }
    case 'add_subscription': {
      let amount = n(input, 'amount');
      let cycle = (s(input, 'billingCycle') || 'monthly').toLowerCase();
      if (/^annual/.test(cycle) || cycle === 'year') cycle = 'yearly';
      if (!isBillingCycle(cycle)) cycle = 'monthly';
      let category = s(input, 'category') || 'other';
      let url = '';
      let notes = s(input, 'notes');
      const provider = s(input, 'provider');
      if (!amount) {
        try {
          const sug = await suggestSubscription(provider);
          amount = sug.parsed.amount || 0;
          if (sug.parsed.billingCycle) cycle = sug.parsed.billingCycle;
          category = sug.parsed.category || category;
          url = sug.parsed.url || '';
          notes = notes || sug.parsed.notes || '';
        } catch {
          /* keep defaults */
        }
      }
      const renewalStr = s(input, 'nextRenewal');
      const nextRenewal = renewalStr ? safeDate(renewalStr) : new Date();
      // `name` is the required display field on the Subscription model — set it!
      // Currency is the deployment's base one (P9): the amount the assistant captured is spoken
      // in the user's own currency, so a hardcoded 'EUR' would mislabel it on a non-EUR install.
      const baseCurrency = (await getAppSettings()).currency || 'EUR';
      await (await currentModel(Subscription)).create({ name: provider, provider, category, amount, currency: baseCurrency, billingCycle: cycle, startDate: new Date(), nextRenewal, active: true, notes, url });
      const sum = `subscription ${provider} ${currencySymbol(baseCurrency)}${amount}/${cycle}`;
      return { summary: sum, content: `Added ${sum}${renewalStr ? `, renews ${renewalStr}` : ''}` };
    }
    case 'add_task': {
      const tags = Array.isArray(input.tags) ? (input.tags as unknown[]).map(String) : [];
      await (await currentModel(Task)).create({ title: s(input, 'title'), tags, status: 'todo' });
      return { summary: `task "${s(input, 'title')}"`, content: `Added task "${s(input, 'title')}"` };
    }
    case 'add_to_list': {
      const name = s(input, 'name').trim();
      const quantity = s(input, 'quantity').trim();
      await (await currentModel(ShoppingListItem)).create({ name, quantity, checked: false });
      return { summary: `${name}${quantity ? ` (${quantity})` : ''} → list`, content: `Added "${name}"${quantity ? ` ×${quantity}` : ''} to your shopping list` };
    }
    case 'add_item': {
      const url = s(input, 'url').trim();
      const status = s(input, 'status') || 'researching';
      // A pasted link → run the full URL-import pipeline: fetch + AI-fill (specs,
      // price, photos), save the link, and DEDUP — a matching item gets this store's
      // link + price added (price tracking) instead of spawning a duplicate.
      if (url) {
        const view = (status === 'received' || status === 'installed' ? 'inventory' : 'shopping') as 'inventory' | 'shopping';
        const r = await importItemFromUrl(url, view);
        if (!r.ok) return { summary: 'import failed', content: `I couldn't import from that link: ${r.error}` };
        const price = r.price > 0 ? `${cur()}${r.price}` : 'no price found';
        return r.updated
          ? { summary: `link → ${r.title}`, content: `That link matched your existing "${r.title}" — I added ${r.store}'s link and price (${price}) to it for comparison instead of creating a duplicate.` }
          : { summary: `item ${r.title}`, content: `Imported "${r.title}" from ${r.store} (${price}) with specs, photos and the link.` };
      }
      await (await currentModel(Item)).create({ title: s(input, 'title'), status, category: s(input, 'category') || 'other', currentPrice: n(input, 'price') });
      return { summary: `item "${s(input, 'title')}"`, content: `Added item "${s(input, 'title')}"` };
    }
    case 'log_price': {
      const name = s(input, 'query') || s(input, 'item');
      const price = n(input, 'price');
      if (!name || !(price > 0)) return { summary: 'price', content: 'Need an item name and a price greater than 0.' };
      const rx = new RegExp(name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const it = await (await currentModel(Item)).findOne({ title: rx }).select('_id title').lean();
      if (!it) return { summary: 'price', content: `No item matching "${name}".` };
      const r = await logItemPrice(String(it._id), price, s(input, 'store'));
      return r.ok
        ? { summary: `price ${it.title}`, content: `Logged ${cur()}${price}${s(input, 'store') ? ` at ${s(input, 'store')}` : ''} for "${it.title}".` }
        : { summary: 'price failed', content: r.error || 'Could not log the price.' };
    }
    case 'get_overview': {
      const mk = today().slice(0, 7);
      // Resolve the five models on the CURRENT tenant's connection before querying: the whole
      // overview is one workspace's money, and a single unscoped model here would quietly mix
      // another database's numbers into the total.
      const [ItemM, ReceiptM, SubM, StatementM, ExpenseM] = await Promise.all([
        currentModel(Item),
        currentModel(Receipt),
        currentModel(Subscription),
        currentModel(Statement),
        currentModel(Expense),
      ]);
      const [itemCount, receiptCount, subs, statements, expenses, ownedItems, settings] = await Promise.all([
        ItemM.countDocuments(),
        ReceiptM.countDocuments(),
        SubM.find({ active: true }).select('name amount billingCycle nextRenewal').lean(),
        StatementM.find().lean(),
        ExpenseM.find().select('kind amount period date category').lean(),
        ItemM.find({ status: { $in: ['received', 'installed'] } }).select('purchasedPrice currentPrice warrantyUntil').lean(),
        getAppSettings(),
      ]);
      // Every cycle, not just yearly: a weekly sub used to be counted at its weekly
      // price as if that were the monthly cost, and quarterly/biennial the same way.
      const monthlySubs = subs.reduce((t, x) => t + monthlyEquivalent(x.amount || 0, x.billingCycle || 'monthly'), 0);
      const plans = computeInstallmentPlans(JSON.parse(JSON.stringify(statements)) as SerializedStatement[]).filter((p) => !p.done);
      const owed = plans.reduce((t, p) => t + p.remainingAmount, 0);
      const inMonth = (e: { period?: string; date?: unknown }) => (e.period || String(e.date).slice(0, 7)) === mk;
      const monthExp = expenses.filter((e) => e.kind === 'expense' && inMonth(e)).reduce((t, e) => t + (e.amount || 0), 0);
      const monthInc = expenses.filter((e) => e.kind === 'income' && inMonth(e)).reduce((t, e) => t + (e.amount || 0), 0);
      // Net position + warranties expiring soon
      const ownedValue = ownedItems.reduce((t, i) => t + (i.purchasedPrice ?? i.currentPrice ?? 0), 0);
      const in90d = Date.now() + 90 * 86400000;
      const expiring = ownedItems.filter((i) => i.warrantyUntil && new Date(i.warrantyUntil).getTime() > Date.now() && new Date(i.warrantyUntil).getTime() < in90d).length;
      // Budgets: over-budget categories this month
      const catSpent = new Map<string, number>();
      for (const e of expenses) if (e.kind === 'expense' && inMonth(e)) catSpent.set(e.category || 'other', (catSpent.get(e.category || 'other') ?? 0) + (e.amount || 0));
      const overBudget = Object.entries(settings.budgets)
        .filter(([cat, b]) => (catSpent.get(cat) ?? 0) > b)
        .map(([cat, b]) => `${cat} €${(catSpent.get(cat) ?? 0).toFixed(0)}/€${b}`);
      // Next renewal. Sorted on the DERIVED date, not the stored one: `nextRenewal` is a
      // snapshot nothing advances, so the subscription with the oldest stale date used to
      // win this race and get announced as "next" with a renewal date in the past.
      const upcoming = subs
        .map((x) => ({ name: x.name, at: effectiveNextRenewal(x.nextRenewal, x.billingCycle) }))
        .filter((x): x is { name: string; at: Date } => x.at !== null)
        .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
      const content =
        `Overview (this month ${mk}): expenses €${monthExp.toFixed(0)}, income €${monthInc.toFixed(0)}, net €${(monthInc - monthExp).toFixed(0)}.` +
        ` Net position: €${(ownedValue - owed).toFixed(0)} (inventory €${ownedValue.toFixed(0)} − installments owed €${owed.toFixed(0)}, ${plans.length} active plans).` +
        ` Subscriptions: ${subs.length} active (~€${monthlySubs.toFixed(0)}/mo)${upcoming ? `, next renewal ${upcoming.name} on ${upcoming.at.toISOString().slice(0, 10)}` : ''}.` +
        (overBudget.length ? ` OVER BUDGET: ${overBudget.join(', ')}.` : Object.keys(settings.budgets).length ? ' All budgets on track.' : '') +
        (expiring ? ` ${expiring} warranties expire within 90 days.` : '') +
        ` Items: ${itemCount}, receipts: ${receiptCount}.`;
      return { summary: 'overview', content };
    }
    case 'search_data': {
      const hits = await searchAll(s(input, 'query'));
      if (!hits.length) return { summary: 'search', content: `No results for "${s(input, 'query')}".` };
      const lines = hits.slice(0, 8).map((h) => `- [${h.type} ${h.id}] ${h.title}${h.subtitle ? ` (${h.subtitle})` : ''}`).join('\n');
      return { summary: 'search', content: `Top results for "${s(input, 'query')}" (type id shown, for edit/delete):\n${lines}` };
    }
    case 'update_record': {
      const type = s(input, 'type');
      const id = s(input, 'id');
      const fields = input.fields && typeof input.fields === 'object' && !Array.isArray(input.fields) ? (input.fields as Record<string, unknown>) : {};
      const Base = modelFor(type);
      if (!Base || !/^[a-f\d]{24}$/i.test(id)) return { summary: 'update failed', content: `Need a valid type + id (use search_data first). Editable types: ${EDITABLE_TYPES.join(', ')}.` };
      if (!Object.keys(fields).length) return { summary: 'update failed', content: 'No fields given to change.' };
      const { allowed, blocked } = screenFields(type as EditableType, fields);
      // Refuse rather than quietly drop: an assistant told "done" would report a balance
      // change to the user that never happened.
      if (!Object.keys(allowed).length) {
        return { summary: 'update failed', content: `Cannot change ${blocked.join(', ')} on a ${type} — edit that in the app.` };
      }
      const Model = await currentModel(Base as typeof Item);
      const r = await Model.updateOne({ _id: id }, { $set: allowed });
      if (!(r.matchedCount ?? 0)) return { summary: 'update failed', content: `No ${type} with that id (search_data again — it may have been deleted).` };
      for (const p of REVALIDATE[type as EditableType]) revalidatePath(p);
      const note = blocked.length ? ` (ignored ${blocked.join(', ')} — not editable here)` : '';
      return { summary: `updated ${type}`, content: `Updated the ${type}.${note}` };
    }
    case 'delete_record': {
      const type = s(input, 'type');
      const id = s(input, 'id');
      const Base = modelFor(type);
      if (!Base || !/^[a-f\d]{24}$/i.test(id)) return { summary: 'delete failed', content: `Need a valid type + id (use search_data first). Deletable types: ${EDITABLE_TYPES.join(', ')}.` };
      // Soft delete → recoverable from the Trash (Settings → Storage & data). Every model
      // reachable here carries the soft-delete plugin; that is exactly why `statement` is not
      // reachable here (see EDITABLE_MODELS).
      const Model = await currentModel(Base as typeof Item);
      const r = await Model.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
      if (!(r.matchedCount ?? 0)) return { summary: 'delete failed', content: `No ${type} with that id (search_data again — it may already be gone).` };
      for (const p of REVALIDATE[type as EditableType]) revalidatePath(p);
      return { summary: `deleted ${type}`, content: `Deleted the ${type} (recoverable from Settings → Trash for 30 days).` };
    }
    default:
      return { summary: name, content: `Unknown tool ${name}` };
    }
  } catch (err) {
    return { summary: `${name} (failed)`, content: `Tool "${name}" failed: ${(err as Error).message.slice(0, 150)}` };
  }
}

export const SYSTEM = `You are the command assistant for "Pharos", the user's personal finance & inventory hub.
This is a CONVERSATION (in Greek or English). Reply in the SAME language the user uses.
- If a command is clear, use the tools to do it, then confirm in ONE short sentence.
- If it is AMBIGUOUS or a KEY detail is missing (amount, which card, which item, store, date), or the action is significant, ASK ONE short clarifying question or confirm ("Να καταχωρήσω X;") BEFORE acting — do NOT guess. Wait for the user's reply, then act.
- Once you have what you need, perform the action and confirm. Keep every reply concise (max ~2 sentences).
- If the user just chats or asks what you can do, answer briefly (you can add/query expenses, income, subscriptions, tasks, items, and show an overview/search).
- Subscriptions: if it renews on a date (e.g. "every Feb 7" / "κάθε χρόνο 7 Φεβρουαρίου"), set billingCycle (yearly) and pass nextRenewal as YYYY-MM-DD for the NEXT occurrence relative to today.
- Items from a link: if the user pastes a product URL, call add_item with the url field set (plus a best-guess title). It auto-fills specs/price/photos, saves the link, and if it matches an item the user already has it adds this store's link + price to that item instead of duplicating. No need to ask first — just do it, then report whether it created a new item or added the link to an existing one.
- To EDIT or DELETE something (item/task/subscription): first search_data to find its [type id], tell the user exactly what you'll change or delete and get a clear yes, THEN call update_record / delete_record. Deletion is permanent — always confirm first.
- For "show stats / report / πόσα ξόδεψα", call get_overview and summarize it.
- vendorKey is handled server-side; just give the vendor name as the user said it.`;
