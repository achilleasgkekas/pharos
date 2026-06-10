'use server';
import { cur } from "@/lib/money";
import { connectDB } from '@/lib/db';
import { Item } from '@/models/Item';
import { Receipt } from '@/models/Receipt';
import { Statement } from '@/models/Statement';
import { Task } from '@/models/Task';
import { Subscription } from '@/models/Subscription';
import { Expense } from '@/models/Expense';
import { Voucher } from '@/models/Voucher';
import { OWNED_STATUSES } from '@/lib/itemStatus';

export type SearchHit = {
  type: 'item' | 'receipt' | 'statement' | 'task' | 'subscription' | 'expense' | 'voucher';
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

function rx(query: string): RegExp {
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

/** Search across every collection and return a flat, ranked-ish list of hits. */
export async function searchAll(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const r = rx(q);
  await connectDB();

  const [items, receipts, statements, tasks, subs, expenses, vouchers] = await Promise.all([
    Item.find({ $or: [{ title: r }, { specs: r }, { notes: r }, { tags: r }, { serialNumber: r }] })
      .limit(8)
      .select('title status currentPrice purchasedPrice')
      .lean(),
    Receipt.find({
      $or: [{ store: r }, { 'lineItems.name': r }, { 'lineItems.refinedName': r }, { paymentMethod: r }],
    })
      .limit(8)
      .select('store date total')
      .lean(),
    Statement.find({ $or: [{ card: r }, { period: r }, { 'transactions.description': r }] })
      .limit(6)
      .select('card period totalAmount')
      .lean(),
    Task.find({ $or: [{ title: r }, { tags: r }, { description: r }] })
      .limit(6)
      .select('title status')
      .lean(),
    Subscription.find({ $or: [{ name: r }, { provider: r }] })
      .limit(6)
      .select('name amount billingCycle')
      .lean(),
    Expense.find({ $or: [{ vendor: r }, { notes: r }, { category: r }] })
      .limit(6)
      .select('vendor kind amount date category')
      .lean(),
    Voucher.find({ $or: [{ title: r }, { code: r }, { store: r }] })
      .limit(6)
      .select('title store discount used')
      .lean(),
  ]);

  const hits: SearchHit[] = [];

  for (const it of items as any[]) {
    const owned = OWNED_STATUSES.includes(it.status);
    const id = String(it._id);
    hits.push({
      type: 'item',
      id,
      title: it.title,
      subtitle: `${owned ? 'Inventory' : 'Shopping'} · ${it.status} · ${cur()}${it.purchasedPrice ?? it.currentPrice ?? 0}`,
      href: `${owned ? '/items' : '/shopping'}?open=${id}`,
    });
  }
  for (const rc of receipts as any[]) {
    const id = String(rc._id);
    hits.push({
      type: 'receipt',
      id,
      title: rc.store,
      subtitle: `Receipt · ${new Date(rc.date).toLocaleDateString('en-GB')} · ${cur()}${rc.total}`,
      href: `/receipts?open=${id}`,
    });
  }
  for (const st of statements as any[]) {
    const id = String(st._id);
    hits.push({
      type: 'statement',
      id,
      title: `${st.card} · ${st.period}`,
      subtitle: `Statement · ${cur()}${st.totalAmount}`,
      href: `/statements?open=${id}`,
    });
  }
  for (const tk of tasks as any[]) {
    const id = String(tk._id);
    hits.push({
      type: 'task',
      id,
      title: tk.title,
      subtitle: `Task · ${tk.status}`,
      href: `/tasks?open=${id}`,
    });
  }
  for (const sb of subs as any[]) {
    const id = String(sb._id);
    hits.push({
      type: 'subscription',
      id,
      title: sb.name,
      subtitle: `Subscription · ${cur()}${sb.amount}/${sb.billingCycle}`,
      href: `/subscriptions?open=${id}`,
    });
  }
  for (const ex of expenses as any[]) {
    const id = String(ex._id);
    const income = ex.kind === 'income';
    hits.push({
      type: 'expense',
      id,
      title: ex.vendor || ex.category || (income ? 'Income' : 'Expense'),
      subtitle: `${income ? 'Income' : 'Expense'} · ${ex.date ? new Date(ex.date).toLocaleDateString('en-GB') : ''} · ${cur()}${ex.amount ?? 0}`,
      href: `${income ? '/income' : '/expenses'}?open=${id}`,
    });
  }
  for (const v of vouchers as any[]) {
    const id = String(v._id);
    hits.push({
      type: 'voucher',
      id,
      title: v.title,
      subtitle: `Voucher · ${v.store || '—'} · ${v.discount || ''}${v.used ? ' · used' : ''}`,
      href: `/vouchers?open=${id}`,
    });
  }

  return hits;
}
