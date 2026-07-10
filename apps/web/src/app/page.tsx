import Link from 'next/link';
import { connectDB } from '@/lib/db';
import { Item } from '@/models/Item';
import { Task } from '@/models/Task';
import { Receipt } from '@/models/Receipt';
import { Subscription } from '@/models/Subscription';
import { Statement } from '@/models/Statement';
import { ShoppingListItem } from '@/models/ShoppingListItem';
import { Bill } from '@/models/Bill';
import { isAiReady } from '@/lib/ollama';
import { OWNED_STATUSES, SHOPPING_STATUSES } from '@/lib/itemStatus';
import { computeInstallmentPlans } from '@/lib/installments';
import type { SerializedStatement } from '@/types';
import { Package, ShoppingCart, ShoppingBasket, ListChecks, BarChart3, Receipt as ReceiptIcon, CalendarClock, CreditCard, ArrowRight, Wallet, Banknote, CalendarDays, FileText } from 'lucide-react';
import { PharosMark } from '@/components/PharosMark';
import { getServerT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

async function getStats() {
  await connectDB();

  const [
    itemCount,
    ownedCount,
    shoppingCount,
    installedItems,
    taskCount,
    openTasks,
    receiptCount,
    subscriptionCount,
    shoppingListCount,
    openBillsCount,
    statements,
    itemTitles,
    ollamaUp,
    budgetAgg,
    spentAgg,
  ] = await Promise.all([
    Item.countDocuments(),
    Item.countDocuments({ status: { $in: OWNED_STATUSES } }),
    Item.countDocuments({ status: { $in: SHOPPING_STATUSES } }),
    Item.countDocuments({ status: 'installed' }),
    Task.countDocuments(),
    Task.countDocuments({ status: { $ne: 'done' } }),
    Receipt.countDocuments(),
    Subscription.countDocuments({ active: true }),
    ShoppingListItem.countDocuments({ checked: false }),
    Bill.countDocuments({ paidAt: null, archived: { $ne: true } }),
    Statement.find().lean(),
    Item.find().select('title').lean(),
    isAiReady(),
    // aggregate() bypasses the soft-delete query middleware → filter trashed docs here
    Item.aggregate([
      { $match: { status: { $in: SHOPPING_STATUSES, $ne: 'deferred' }, deletedAt: null } },
      { $group: { _id: null, total: { $sum: '$currentPrice' } } },
    ]),
    Item.aggregate([
      { $match: { purchasedPrice: { $ne: null }, deletedAt: null } },
      { $group: { _id: null, total: { $sum: '$purchasedPrice' } } },
    ]),
  ]);

  // Installment plans (δόσεις) — active ones + total still owed
  const serializedStatements: SerializedStatement[] = JSON.parse(JSON.stringify(statements));
  const allPlans = computeInstallmentPlans(serializedStatements);
  const activePlans = allPlans.filter((p) => !p.done);
  const installmentsRemaining = activePlans.reduce((s, p) => s + p.remainingAmount, 0);

  // What you'll actually PAY in each of the next 3 months: a plan still charges its
  // monthly amount for `remainingInstallments` more months, so month n (1..3) sums
  // the per-month amount of every plan with at least n payments left.
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const nowM = new Date();
  const monthlySchedule = [1, 2, 3].map((n) => {
    const d = new Date(nowM.getFullYear(), nowM.getMonth() + n, 1);
    const amount = activePlans
      .filter((p) => p.remainingInstallments >= n)
      .reduce((s, p) => s + p.perAmount, 0);
    return { label: `${MN[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, amount };
  });

  const itemTitleMap: Record<string, string> = {};
  for (const it of itemTitles as { _id: unknown; title: string }[]) {
    itemTitleMap[String(it._id)] = it.title;
  }

  return {
    itemCount,
    ownedCount,
    shoppingCount,
    installedItems,
    taskCount,
    openTasks,
    receiptCount,
    subscriptionCount,
    shoppingListCount,
    openBillsCount,
    budget: budgetAgg[0]?.total ?? 0,
    spent: spentAgg[0]?.total ?? 0,
    statementCount: statements.length,
    activePlans,
    installmentsRemaining,
    monthlySchedule,
    itemTitleMap,
    ollamaUp,
  };
}

const mono = { fontFamily: 'var(--font-mono)' } as const;
const display = { fontFamily: 'var(--font-display)' } as const;

export default async function HomePage() {
  const stats = await getStats();
  const { t } = await getServerT();

  return (
    <main className="min-h-screen">
      {/* Hero — the wordmark + tagline (the AI command bar lives in the top bar) */}
      <section className="max-w-[1400px] mx-auto px-4 pt-12 pb-12 md:pt-20 text-center">
        <PharosMark size={40} className="text-[color:var(--color-accent)] mx-auto mb-5" />
        <h1 className="font-extrabold leading-[0.92] tracking-[-0.03em] text-[clamp(2.5rem,7vw,4.5rem)]" style={display}>
          {t('home.heroA')}
          <br />
          <span className="bg-gradient-to-r from-[color:var(--color-accent)] via-[color:var(--color-cyan)] to-[color:var(--color-purple)] bg-clip-text text-transparent">
            {t('home.heroB')}
          </span>
        </h1>
        <p className="mt-4 text-[11px] tracking-[0.22em] uppercase text-[color:var(--color-text-faint)]" style={mono}>
          {t('home.taglineA')} <span className="text-[color:var(--color-accent)]">·</span> {t('home.taglineB')}
        </p>
        <p className="text-[color:var(--color-text-dim)] mt-3 max-w-2xl mx-auto text-base md:text-lg leading-relaxed">
          {t('home.subtitle')}
        </p>
      </section>

      {/* Modules */}
      <section className="max-w-[1400px] mx-auto px-4 pb-16">
        <p className="text-[10px] uppercase tracking-[0.15em] text-[color:var(--color-text-faint)] mb-3" style={mono}>
          {t('home.modules')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <NavCard href="/items" title={t('nav.inventory')} count={stats.ownedCount} description={t('home.dInventory')} open={t('home.open')} color="cyan" icon={<Package size={20} />} />
          <NavCard href="/shopping" title={t('nav.shopping')} count={stats.shoppingCount} description={t('home.dShopping')} open={t('home.open')} color="gold" icon={<ShoppingCart size={20} />} />
          <NavCard href="/shopping-list" title={t('nav.shoppingList')} count={stats.shoppingListCount} description={t('home.dShoppingList')} open={t('home.open')} color="accent" icon={<ShoppingBasket size={20} />} />
          <NavCard href="/receipts" title={t('nav.receipts')} count={stats.receiptCount} description={t('home.dReceipts')} open={t('home.open')} color="purple" icon={<ReceiptIcon size={20} />} />
          <NavCard href="/expenses" title={t('nav.expenses')} count={null} description={t('home.dExpenses')} open={t('home.open')} color="gold" icon={<Wallet size={20} />} />
          <NavCard href="/bills" title={t('nav.bills')} count={stats.openBillsCount} description={t('home.dBills')} open={t('home.open')} color="red" icon={<FileText size={20} />} />
          <NavCard href="/income" title={t('nav.income')} count={null} description={t('home.dIncome')} open={t('home.open')} color="accent" icon={<Banknote size={20} />} />
          <NavCard href="/statements" title={t('nav.statements')} count={stats.statementCount} description={t('home.dStatements')} open={t('home.open')} color="accent" icon={<CreditCard size={20} />} />
          <NavCard href="/subscriptions" title={t('nav.subscriptions')} count={stats.subscriptionCount} description={t('home.dSubscriptions')} open={t('home.open')} color="red" icon={<CalendarClock size={20} />} />
          <NavCard href="/tasks" title={t('nav.tasks')} count={stats.openTasks} description={t('home.dTasks')} open={t('home.open')} color="cyan" icon={<ListChecks size={20} />} />
          <NavCard href="/reports" title={t('nav.reports')} count={null} description={t('home.dReports')} open={t('home.open')} color="gold" icon={<BarChart3 size={20} />} />
          <NavCard href="/calendar" title={t('nav.calendar')} count={null} description={t('home.dCalendar')} open={t('home.open')} color="purple" icon={<CalendarDays size={20} />} />
        </div>
      </section>

      <footer className="max-w-[1400px] mx-auto px-4 py-8 border-t border-[color:var(--color-border)] flex items-center justify-center gap-2 text-xs text-[color:var(--color-text-faint)]" style={mono}>
        <PharosMark size={14} className="text-[color:var(--color-text-faint)]" pulse={false} />
        Pharos <span className="text-[color:var(--color-accent)]">·</span> v0.1.0 <span className="text-[color:var(--color-accent)]">·</span> Mac mini M4
      </footer>
    </main>
  );
}

const NAV_COLORS = {
  accent: 'var(--color-accent)',
  cyan: 'var(--color-cyan)',
  gold: 'var(--color-gold)',
  purple: 'var(--color-purple)',
  red: 'var(--color-red)',
} as const;

function NavCard({
  href,
  title,
  count,
  description,
  open,
  color,
  icon,
}: {
  href: string;
  title: string;
  count: number | null;
  description: string;
  open: string;
  color: keyof typeof NAV_COLORS;
  icon: React.ReactNode;
}) {
  const c = NAV_COLORS[color];
  return (
    <Link
      href={href}
      prefetch={false}
      className="group relative overflow-hidden bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-2xl p-5 transition-all duration-200 hover:-translate-y-1 hover:border-[color:var(--color-border-light)] block"
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: `radial-gradient(130% 110% at 0% 0%, ${c}14, transparent 55%)` }}
      />
      <div className="relative flex items-start justify-between mb-4">
        <div
          className="w-11 h-11 rounded-xl grid place-items-center transition-transform group-hover:scale-105"
          style={{ background: `${c}1a`, color: c, border: `1px solid ${c}33` }}
        >
          {icon}
        </div>
        {count !== null && (
          <span
            className="text-sm font-bold tabular-nums px-2.5 py-1 rounded-lg"
            style={{ fontFamily: 'var(--font-mono)', background: `${c}14`, color: c, border: `1px solid ${c}2e` }}
          >
            {count}
          </span>
        )}
      </div>
      <h3 className="relative text-lg font-semibold tracking-tight" style={display}>
        {title}
      </h3>
      <p className="relative text-sm text-[color:var(--color-text-dim)] mt-1 leading-relaxed">{description}</p>
      <div className="relative mt-4 flex items-center gap-1 text-xs text-[color:var(--color-text-faint)] group-hover:text-[color:var(--color-accent)] transition-colors" style={mono}>
        {open} <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
      </div>
    </Link>
  );
}
