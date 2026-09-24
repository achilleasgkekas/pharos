'use server';
import { cur } from "@/lib/money";
import { accentInsensitiveSource } from '@/lib/searchText';
import { connectDB } from '@/lib/db';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { Item as ItemModel } from '@/models/Item';
import { Receipt as ReceiptModel } from '@/models/Receipt';
import { Statement as StatementModel } from '@/models/Statement';
import { Task as TaskModel } from '@/models/Task';
import { Subscription as SubscriptionModel } from '@/models/Subscription';
import { Expense as ExpenseModel } from '@/models/Expense';
import { Voucher as VoucherModel } from '@/models/Voucher';
import { Bill as BillModel } from '@/models/Bill';
import { Goal as GoalModel } from '@/models/Goal';
import { ShoppingListItem as ShoppingListItemModel } from '@/models/ShoppingListItem';
import { OWNED_STATUSES } from '@/lib/itemStatus';
import { matchedLineItemName } from '@/lib/receiptSearch';
import { formatDate } from '@/lib/i18n/format';
import { getLocaleSafe } from '@/lib/i18n/server';

// P66: five modules shipped after this file was written (Bills, Goals, Gift cards, Loyalty
// cards, Shopping list) were never added here, so both the navbar search AND the AI assistant's
// search_data tool were blind to them — "where did I put the AB card" returned nothing while the
// same question about a voucher worked.
export type SearchHit = {
  type:
    | 'item'
    | 'receipt'
    | 'statement'
    | 'task'
    | 'subscription'
    | 'expense'
    | 'voucher'
    | 'bill'
    | 'goal'
    | 'shoppinglist';
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

// Lean projection shapes — one per query below, each mirroring its `.select(...)`
// (plus the implicit `_id`). Replaces the old `as any[]` casts so the field
// access in the hit-builders is type-checked against what was actually selected.
type ItemLean = { _id: unknown; title: string; status: string; currentPrice?: number | null; purchasedPrice?: number | null };
type ReceiptLean = { _id: unknown; store: string; date: string | Date; total?: number; lineItems?: { name?: string; refinedName?: string }[] };
type StatementLean = { _id: unknown; card: string; period: string; totalAmount?: number };
type TaskLean = { _id: unknown; title: string; status: string };
type SubscriptionLean = { _id: unknown; name: string; amount?: number; billingCycle?: string };
type ExpenseLean = { _id: unknown; vendor?: string; kind?: string; amount?: number | null; date?: string | Date; category?: string };
type VoucherLean = { _id: unknown; title: string; store?: string; discount?: string; used?: boolean };
type BillLean = { _id: unknown; title: string; vendor?: string; amount?: number; dueDate?: string | Date; paidAt?: string | Date | null };
type GoalLean = { _id: unknown; title: string; targetAmount?: number; category?: string; archived?: boolean };
type ShoppingListLean = { _id: unknown; name: string; quantity?: string; category?: string; brand?: string; checked?: boolean };

function rx(query: string): RegExp {
  // Accent-tolerant: Greek data is stored exactly as it was printed/OCR'd (usually
  // unaccented CAPITALS) while people type accented lowercase, and Mongo does not
  // apply collation to $regex — so the tolerance lives in the pattern. See lib/searchText.
  return new RegExp(accentInsensitiveSource(query), 'i');
}

/**
 * Search across every collection of the CALLER'S workspace and return a flat, ranked-ish
 * list of hits.
 *
 * Ten models, one tenant context. Every `find` here used the imported model, so in SaaS
 * mode the navbar dropdown AND the assistant's `search_data` tool answered every workspace
 * out of the DEFAULT database: one customer typing two letters would see another's receipts,
 * statements and bills, with working deep links to them. Nothing looked broken
 * from the UI, because a fresh workspace simply searched an inventory that was not its own.
 *
 * The models resolve INSIDE a single `withRequestTenant` block rather than one wrap per
 * query: a partially-scoped Promise.all is the worse failure, since half the results would
 * come from the right workspace and half from the default one, and no hit says which.
 *
 * Self-hosted resolves to the default tenant, so every `currentModel(X)` is exactly `X`.
 */
export async function searchAll(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const r = rx(q);
  await connectDB();
  const locale = await getLocaleSafe();

  return withRequestTenant(async () => {
    const [Item, Receipt, Statement, Task, Subscription, Expense, Voucher, Bill, Goal, ShoppingListItem] =
      await Promise.all([
        currentModel(ItemModel),
        currentModel(ReceiptModel),
        currentModel(StatementModel),
        currentModel(TaskModel),
        currentModel(SubscriptionModel),
        currentModel(ExpenseModel),
        currentModel(VoucherModel),
        currentModel(BillModel),
        currentModel(GoalModel),
        currentModel(ShoppingListItemModel),
      ]);

    const [items, receipts, statements, tasks, subs, expenses, vouchers, bills, goals, listItems] = await Promise.all([
      Item.find({ $or: [{ title: r }, { specs: r }, { notes: r }, { tags: r }, { serialNumber: r }] })
        .limit(8)
        .select('title status currentPrice purchasedPrice')
        .lean<ItemLean[]>(),
      Receipt.find({
        $or: [{ store: r }, { 'lineItems.name': r }, { 'lineItems.refinedName': r }, { paymentMethod: r }],
      })
        .limit(8)
        .select('store date total lineItems.name lineItems.refinedName')
        .lean<ReceiptLean[]>(),
      Statement.find({ $or: [{ card: r }, { period: r }, { 'transactions.description': r }] })
        .limit(6)
        .select('card period totalAmount')
        .lean<StatementLean[]>(),
      Task.find({ $or: [{ title: r }, { tags: r }, { description: r }] })
        .limit(6)
        .select('title status')
        .lean<TaskLean[]>(),
      Subscription.find({ $or: [{ name: r }, { provider: r }] })
        .limit(6)
        .select('name amount billingCycle')
        .lean<SubscriptionLean[]>(),
      Expense.find({ $or: [{ vendor: r }, { notes: r }, { category: r }] })
        .limit(6)
        .select('vendor kind amount date category')
        .lean<ExpenseLean[]>(),
      Voucher.find({ $or: [{ title: r }, { code: r }, { store: r }] })
        .limit(6)
        .select('title store discount used')
        .lean<VoucherLean[]>(),
      Bill.find({ $or: [{ title: r }, { vendor: r }, { category: r }, { notes: r }, { space: r }] })
        .limit(6)
        .select('title vendor amount dueDate paidAt')
        .lean<BillLean[]>(),
      Goal.find({ $or: [{ title: r }, { category: r }, { notes: r }] })
        .limit(6)
        .select('title targetAmount category archived')
        .lean<GoalLean[]>(),
      ShoppingListItem.find({ $or: [{ name: r }, { category: r }, { brand: r }, { note: r }] })
        .limit(6)
        .select('name quantity category brand checked')
        .lean<ShoppingListLean[]>(),
    ]);

    const hits: SearchHit[] = [];

    for (const it of items) {
      const owned = (OWNED_STATUSES as readonly string[]).includes(it.status);
      const id = String(it._id);
      hits.push({
        type: 'item',
        id,
        title: it.title,
        subtitle: `${owned ? 'Inventory' : 'Shopping'} · ${it.status} · ${cur()}${it.purchasedPrice ?? it.currentPrice ?? 0}`,
        href: `${owned ? '/items' : '/shopping'}?open=${id}`,
      });
    }
    for (const rc of receipts) {
      const id = String(rc._id);
      // If the query matched a product inside the receipt (not the store name),
      // surface that line item so the user sees *why* this receipt appeared (P22).
      const matched = r.test(rc.store) ? null : matchedLineItemName(r, rc.lineItems);
      hits.push({
        type: 'receipt',
        id,
        title: rc.store,
        subtitle: `Receipt · ${formatDate(rc.date, locale)} · ${cur()}${rc.total}${matched ? ` · ${matched}` : ''}`,
        href: `/receipts?open=${id}`,
      });
    }
    for (const st of statements) {
      const id = String(st._id);
      hits.push({
        type: 'statement',
        id,
        title: `${st.card} · ${st.period}`,
        subtitle: `Statement · ${cur()}${st.totalAmount}`,
        href: `/statements?open=${id}`,
      });
    }
    for (const tk of tasks) {
      const id = String(tk._id);
      hits.push({
        type: 'task',
        id,
        title: tk.title,
        subtitle: `Task · ${tk.status}`,
        href: `/tasks?open=${id}`,
      });
    }
    for (const sb of subs) {
      const id = String(sb._id);
      hits.push({
        type: 'subscription',
        id,
        title: sb.name,
        subtitle: `Subscription · ${cur()}${sb.amount}/${sb.billingCycle}`,
        href: `/subscriptions?open=${id}`,
      });
    }
    for (const ex of expenses) {
      const id = String(ex._id);
      const income = ex.kind === 'income';
      hits.push({
        type: 'expense',
        id,
        title: ex.vendor || ex.category || (income ? 'Income' : 'Expense'),
        subtitle: `${income ? 'Income' : 'Expense'} · ${formatDate(ex.date, locale)} · ${cur()}${ex.amount ?? 0}`,
        href: `${income ? '/income' : '/expenses'}?open=${id}`,
      });
    }
    for (const v of vouchers) {
      const id = String(v._id);
      hits.push({
        type: 'voucher',
        id,
        title: v.title,
        subtitle: `Voucher · ${v.store || '—'} · ${v.discount || ''}${v.used ? ' · used' : ''}`,
        href: `/vouchers?open=${id}`,
      });
    }
    for (const b of bills) {
      const id = String(b._id);
      const due = formatDate(b.dueDate, locale);
      hits.push({
        type: 'bill',
        id,
        title: b.title,
        subtitle: `Bill · ${b.paidAt ? 'paid' : `due ${due}`} · ${cur()}${b.amount ?? 0}${b.vendor ? ` · ${b.vendor}` : ''}`,
        href: `/bills?open=${id}`,
      });
    }
    for (const g of goals) {
      const id = String(g._id);
      hits.push({
        type: 'goal',
        id,
        // Goals live as a section inside /reports, not a page with a detail modal, so the
        // deep link is the anchor rather than ?open= (which nothing there would consume).
        title: g.title,
        subtitle: `Goal · ${cur()}${g.targetAmount ?? 0} target${g.category ? ` · ${g.category}` : ''}${g.archived ? ' · closed' : ''}`,
        href: '/reports#goals',
      });
    }
    for (const li of listItems) {
      const id = String(li._id);
      const bits = [li.quantity, li.brand, li.category].filter(Boolean).join(' · ');
      hits.push({
        type: 'shoppinglist',
        id,
        // The shopping list is a flat checklist with no per-row detail modal, so there is
        // nothing for ?open= to open — the link just lands on the list.
        title: li.name,
        subtitle: `Shopping list${bits ? ` · ${bits}` : ''}${li.checked ? ' · bought' : ''}`,
        href: '/shopping-list',
      });
    }

    return hits;
  });
}
