'use server';
import { connectDB } from '@/lib/db';
import { getAiConfig } from '@/lib/aiConfig';
import { anthropicRaw, type AnthropicMessage, type AnthropicTool, type AnthropicBlock } from '@/lib/anthropic';
import { suggestSubscription } from '@/lib/ollama';
import { computeInstallmentPlans } from '@/lib/installments';
import { Subscription } from '@/models/Subscription';
import { Task } from '@/models/Task';
import { Item } from '@/models/Item';
import { Expense } from '@/models/Expense';
import { Receipt } from '@/models/Receipt';
import { Statement } from '@/models/Statement';
import { addExpense } from './expenses/actions';
import { importItemFromUrl, logItemPrice } from './items/actions';
import { getAppSettings } from '@/lib/appSettings';
import { cur } from '@/lib/money';
import { searchAll } from './search-actions';
import { vendorKey } from './expenses/lib';
import { safeDate } from '@/lib/dates';
import { revalidatePath } from 'next/cache';
import type { SerializedStatement } from '@/types';

export type AiCommandResult = {
  ok: boolean;
  reply: string;
  actions: { name: string; summary: string }[];
  error?: string;
};

const TOOLS: AnthropicTool[] = [
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
        billingCycle: { type: 'string', enum: ['monthly', 'yearly', 'quarterly', 'weekly', 'lifetime'] },
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
    description: "Record a price you spotted for a shopping item (e.g. 'the U7 Pro dropped to 270 at xpatit'). Appends to the item's price history so the trend, lowest-ever and deal status update.",
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
    description: 'Search everything (items, receipts, statements, subscriptions, tasks) for a keyword. Returns each result with its [type id] so you can edit/delete it.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'update_record',
    description: 'Edit an existing item/task/subscription. First search_data to find its type + id, confirm the change with the user, THEN call this. fields = the properties to set.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['item', 'task', 'subscription'] },
        id: { type: 'string', description: 'the 24-char id from search_data' },
        fields: { type: 'object', description: 'properties to set, e.g. {"status":"done"} or {"amount":12.99,"category":"streaming"}' },
      },
      required: ['type', 'id', 'fields'],
    },
  },
  {
    name: 'delete_record',
    description: 'Delete an item/task/subscription. First search_data to find its type + id, then CONFIRM with the user before calling — deletion is permanent.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['item', 'task', 'subscription'] },
        id: { type: 'string', description: 'the 24-char id from search_data' },
      },
      required: ['type', 'id'],
    },
  },
];

function s(input: Record<string, unknown>, key: string): string {
  const v = input[key];
  return typeof v === 'string' ? v : '';
}
function n(input: Record<string, unknown>, key: string): number {
  const v = input[key];
  return typeof v === 'number' ? v : Number(v) || 0;
}
const today = () => new Date().toISOString().slice(0, 10);
function modelFor(type: string): typeof Item | typeof Task | typeof Subscription | null {
  return type === 'item' ? Item : type === 'task' ? Task : type === 'subscription' ? Subscription : null;
}

async function execute(name: string, input: Record<string, unknown>): Promise<{ summary: string; content: string }> {
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
      if (!['monthly', 'yearly', 'quarterly', 'weekly', 'lifetime'].includes(cycle)) cycle = 'monthly';
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
      await Subscription.create({ name: provider, provider, category, amount, currency: 'EUR', billingCycle: cycle, startDate: new Date(), nextRenewal, active: true, notes, url });
      const sum = `subscription ${provider} €${amount}/${cycle}`;
      return { summary: sum, content: `Added ${sum}${renewalStr ? `, renews ${renewalStr}` : ''}` };
    }
    case 'add_task': {
      const tags = Array.isArray(input.tags) ? (input.tags as unknown[]).map(String) : [];
      await Task.create({ title: s(input, 'title'), tags, status: 'todo' });
      return { summary: `task "${s(input, 'title')}"`, content: `Added task "${s(input, 'title')}"` };
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
      await Item.create({ title: s(input, 'title'), status, category: s(input, 'category') || 'other', currentPrice: n(input, 'price') });
      return { summary: `item "${s(input, 'title')}"`, content: `Added item "${s(input, 'title')}"` };
    }
    case 'log_price': {
      const name = s(input, 'query') || s(input, 'item');
      const price = n(input, 'price');
      if (!name || !(price > 0)) return { summary: 'price', content: 'Need an item name and a price greater than 0.' };
      const rx = new RegExp(name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const it = await Item.findOne({ title: rx }).select('_id title').lean();
      if (!it) return { summary: 'price', content: `No item matching "${name}".` };
      const r = await logItemPrice(String(it._id), price, s(input, 'store'));
      return r.ok
        ? { summary: `price ${it.title}`, content: `Logged ${cur()}${price}${s(input, 'store') ? ` at ${s(input, 'store')}` : ''} for "${it.title}".` }
        : { summary: 'price failed', content: r.error || 'Could not log the price.' };
    }
    case 'get_overview': {
      const mk = today().slice(0, 7);
      const [itemCount, receiptCount, subs, statements, expenses, ownedItems, settings] = await Promise.all([
        Item.countDocuments(),
        Receipt.countDocuments(),
        Subscription.find({ active: true }).select('name amount billingCycle nextRenewal').lean(),
        Statement.find().lean(),
        Expense.find().select('kind amount period date category').lean(),
        Item.find({ status: { $in: ['received', 'installed'] } }).select('purchasedPrice currentPrice warrantyUntil').lean(),
        getAppSettings(),
      ]);
      const monthlySubs = subs.reduce((t, x) => t + (x.billingCycle === 'yearly' ? (x.amount || 0) / 12 : x.amount || 0), 0);
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
      // Next renewal
      const upcoming = subs
        .filter((x) => x.nextRenewal)
        .sort((a, b) => new Date(a.nextRenewal as unknown as string).getTime() - new Date(b.nextRenewal as unknown as string).getTime())[0];
      const content =
        `Overview (this month ${mk}): expenses €${monthExp.toFixed(0)}, income €${monthInc.toFixed(0)}, net €${(monthInc - monthExp).toFixed(0)}.` +
        ` Net position: €${(ownedValue - owed).toFixed(0)} (inventory €${ownedValue.toFixed(0)} − installments owed €${owed.toFixed(0)}, ${plans.length} active plans).` +
        ` Subscriptions: ${subs.length} active (~€${monthlySubs.toFixed(0)}/mo)${upcoming ? `, next renewal ${upcoming.name} on ${String(upcoming.nextRenewal).slice(0, 10)}` : ''}.` +
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
      const Model = modelFor(type);
      if (!Model || !/^[a-f\d]{24}$/i.test(id)) return { summary: 'update failed', content: 'Need a valid type + id (use search_data first).' };
      if (!Object.keys(fields).length) return { summary: 'update failed', content: 'No fields given to change.' };
      await (Model as typeof Item).updateOne({ _id: id }, { $set: fields });
      revalidatePath('/items'); revalidatePath('/shopping'); revalidatePath('/tasks'); revalidatePath('/subscriptions');
      return { summary: `updated ${type}`, content: `Updated the ${type}.` };
    }
    case 'delete_record': {
      const type = s(input, 'type');
      const id = s(input, 'id');
      const Model = modelFor(type);
      if (!Model || !/^[a-f\d]{24}$/i.test(id)) return { summary: 'delete failed', content: 'Need a valid type + id (use search_data first).' };
      // Soft delete → recoverable from the Trash (Settings → Storage & data).
      await (Model as typeof Item).updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
      revalidatePath('/items'); revalidatePath('/shopping'); revalidatePath('/tasks'); revalidatePath('/subscriptions');
      return { summary: `deleted ${type}`, content: `Deleted the ${type} (recoverable from Settings → Trash for 30 days).` };
    }
    default:
      return { summary: name, content: `Unknown tool ${name}` };
    }
  } catch (err) {
    return { summary: `${name} (failed)`, content: `Tool "${name}" failed: ${(err as Error).message.slice(0, 150)}` };
  }
}

const SYSTEM = `You are the command assistant for "Pharos", the user's personal finance & inventory hub.
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

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

/** Run a multi-turn conversation through Claude + tools. The client keeps the
 *  history (text turns) and sends it whole each call. Needs the Anthropic provider. */
export async function runAiCommand(history: ChatTurn[]): Promise<AiCommandResult> {
  const turns = (history || []).filter((t) => t && typeof t.content === 'string' && t.content.trim());
  if (!turns.length) return { ok: false, reply: '', actions: [], error: 'Empty command' };

  const cfg = await getAiConfig();
  if (!cfg.anthropicApiKey) {
    return { ok: false, reply: '', actions: [], error: 'The command bar needs the Anthropic provider. Add an API key in Settings → AI.' };
  }

  const messages: AnthropicMessage[] = turns.map((t) => ({ role: t.role, content: t.content }));
  const actions: { name: string; summary: string }[] = [];
  let reply = '';

  try {
    for (let i = 0; i < 6; i++) {
      const { content } = await anthropicRaw({ apiKey: cfg.anthropicApiKey, model: cfg.anthropicModel, system: `${SYSTEM}\nToday is ${today()}.`, tools: TOOLS, messages, maxTokens: 1024 });
      const toolUses = content.filter((b): b is Extract<AnthropicBlock, { type: 'tool_use' }> => b.type === 'tool_use');
      const textOut = content
        .filter((b): b is Extract<AnthropicBlock, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();

      if (toolUses.length === 0) {
        reply = textOut;
        break;
      }
      messages.push({ role: 'assistant', content });
      const results: unknown[] = [];
      for (const tu of toolUses) {
        const r = await execute(tu.name, tu.input || {});
        actions.push({ name: tu.name, summary: r.summary });
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: r.content });
      }
      messages.push({ role: 'user', content: results });
    }
  } catch (err) {
    return { ok: false, reply: '', actions, error: (err as Error).message };
  }

  // Anything that created data → refresh the affected pages.
  if (actions.length) {
    for (const p of ['/', '/expenses', '/income', '/subscriptions', '/tasks', '/items', '/shopping']) revalidatePath(p);
  }
  return { ok: true, reply: reply || 'Done.', actions };
}
