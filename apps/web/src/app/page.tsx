import Link from 'next/link';
import { connectDB } from '@/lib/db';
import { sumBase } from '@/lib/fx';
import { Receipt as ReceiptModel } from '@/models/Receipt';
import { Subscription as SubscriptionModel } from '@/models/Subscription';
import { Expense as ExpenseModel } from '@/models/Expense';
import { Card as PaymentCardModel } from '@/models/Card';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { getAppSettings } from '@/lib/appSettings';
import { getStorageConfig } from '@/lib/storageConfig';
import { getNotifiers } from '@/lib/notifiers';
import { getAiConfig } from '@/lib/aiConfig';
import { isAiReady } from '@/lib/ollama';
import { computeMoneyAgenda, type AgendaKind } from '@/lib/moneyAgenda';
import { monthlyEquivalent } from '@/lib/billingCycle';
import { formatMoney } from '@/lib/fx';
import { formatDate } from '@/lib/i18n/format';
import { ArrowRight, Plus, Receipt as ReceiptIcon, ShoppingBasket, Wallet, Banknote } from 'lucide-react';
import { OnboardingChecklist, type OnboardingStep } from '@/components/OnboardingChecklist';
import { AiOnboardingBanner } from '@/components/AiOnboardingBanner';
import { cookies } from 'next/headers';
import { PAGE_MAIN } from '@/components/ui/PageHeader';
import { getServerT } from '@/lib/i18n/server';
import { categoryLabel } from '@/lib/categories';
import { InboxDrop } from '@/components/InboxDrop';
import { aiFeatureStatus } from '@/lib/aiFeatures.server';
import type { TFunc, TKey } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

// Home is a daily overview (the redesign): this month's money, what is coming up in the next
// 30 days and the latest records, in one screen. The module grid and the hero are gone: the
// sidebar (computer) and the section bar (phone) already lead to every page.

const SOON_DAYS = 30;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

async function getDashboard(locale: string) {
  return withRequestTenant(async () => {
    await connectDB();
    const Receipt = await currentModel(ReceiptModel);
    const Subscription = await currentModel(SubscriptionModel);
    const Expense = await currentModel(ExpenseModel);
    const PaymentCard = await currentModel(PaymentCardModel);
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [monthRows, recent, subs, receiptCount, cardCount, appSettings, storageConfig, notifiers, agenda, aiCfg, aiUp] = await Promise.all([
      // "This month" the way the Expenses page counts it: the record's period, or its date.
      Expense.find({
        $or: [{ period: monthKey }, { period: { $in: ['', null] }, date: { $gte: monthStart, $lt: nextMonth } }],
      })
        .select('kind amount currency origAmount fxRate')
        .lean(),
      Expense.find().sort({ date: -1, createdAt: -1 }).limit(6).select('kind vendor category amount date').lean(),
      Subscription.find({ active: true }).select('amount billingCycle').lean(),
      Receipt.countDocuments(),
      PaymentCard.countDocuments(),
      getAppSettings(),
      getStorageConfig(),
      getNotifiers(),
      computeMoneyAgenda(now, locale),
      getAiConfig(),
      isAiReady(),
    ]);

    const spent = monthRows.filter((r) => r.kind !== 'income');
    const earned = monthRows.filter((r) => r.kind === 'income');
    // Base currency only, as on the Expenses page: a foreign record still waiting for its
    // exchange rate holds the printed figure, which must not join the total.
    const sum = (rows: Parameters<typeof sumBase>[0]) => sumBase(rows, appSettings.currency).total;

    // Agenda dates are local days stored as ISO instants: compare them as dates, never as text.
    const today = startOfDay(now);
    const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + SOON_DAYS + 1);
    const soon = agenda.months
      .flatMap((m) => m.entries)
      .filter((e) => {
        const at = new Date(e.date);
        return at >= today && at < horizon;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let aiBanner: 'off' | 'no-provider' | null = null;
    if (!aiCfg.aiOnboardingDismissed) {
      if (!aiCfg.aiEnabled) aiBanner = 'off';
      else if (!aiUp) aiBanner = 'no-provider';
    }

    return {
      currency: appSettings.currency,
      monthLabel: formatDate(now, locale, { month: 'long' }),
      spentMonth: sum(spent),
      spentCount: spent.length,
      incomeMonth: sum(earned),
      incomeCount: earned.length,
      subsMonthly: subs.reduce((s, x) => s + monthlyEquivalent(Number(x.amount) || 0, String(x.billingCycle || 'monthly')), 0),
      subsCount: subs.length,
      soon,
      recent: recent.map((r) => ({
        id: String(r._id),
        kind: r.kind === 'income' ? ('income' as const) : ('expense' as const),
        vendor: String(r.vendor || ''),
        category: String(r.category || ''),
        amount: Number(r.amount) || 0,
        date: r.date ? new Date(r.date as unknown as string).toISOString() : '',
      })),
      aiBanner,
      onboarding: {
        dismissed: appSettings.onboardingDismissed,
        storageConnected: storageConfig.backend !== 'local',
        hasReceipt: receiptCount > 0,
        hasCard: cardCount > 0,
        notifyEnabled: notifiers.some((n) => n.enabled),
      },
    };
  });
}

type OnboardingSignals = {
  dismissed: boolean;
  storageConnected: boolean;
  hasReceipt: boolean;
  hasCard: boolean;
  notifyEnabled: boolean;
};

function onboardingSteps(o: OnboardingSignals, t: TFunc): OnboardingStep[] {
  return [
    { key: 'storage', label: t('home.onbStorage'), done: o.storageConnected, href: '/settings?tab=storage' },
    { key: 'receipt', label: t('home.onbReceipt'), done: o.hasReceipt, href: '/receipts' },
    { key: 'card', label: t('home.onbCard'), done: o.hasCard, href: '/settings?tab=cards' },
    { key: 'notify', label: t('home.onbNotify'), done: o.notifyEnabled, href: '/settings?tab=notifications' },
  ];
}

const KIND: Record<AgendaKind, { label: TKey; href: string }> = {
  renewal: { label: 'cal.lblSubscription', href: '/subscriptions' },
  installments: { label: 'cal.lblInstallments', href: '/statements' },
  bill: { label: 'cal.lblBill', href: '/expenses' },
  payable: { label: 'cal.lblBill', href: '/expenses/to-pay' },
  income: { label: 'cal.lblIncome', href: '/income' },
  goal: { label: 'cal.lblGoal', href: '/savings' },
  warranty: { label: 'cal.subWarranty', href: '/items' },
  voucher: { label: 'cal.lblVoucher', href: '/vouchers' },
};

function daysFromToday(date: string): number {
  return Math.round((startOfDay(new Date(date)).getTime() - startOfDay(new Date()).getTime()) / 86_400_000);
}

const display = { fontFamily: 'var(--font-display)' } as const;
const card = 'rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]';

/** The viewer's own time zone (the layout's head script stores it), so "Good morning" and
 *  today's date follow the clock of the person reading, not of the server. */
async function viewerTimeZone(): Promise<string | undefined> {
  const tz = (await cookies()).get('pharos_tz')?.value;
  if (!tz) return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

function greetingKey(now: Date, timeZone?: string): TKey {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now));
  if (hour >= 5 && hour < 12) return 'home.greetMorning';
  if (hour >= 12 && hour < 18) return 'home.greetAfternoon';
  return 'home.greetEvening';
}

export default async function HomePage() {
  const [{ t, locale }, timeZone] = await Promise.all([getServerT(), viewerTimeZone()]);
  const [d, inbox] = await Promise.all([getDashboard(locale), withRequestTenant(() => aiFeatureStatus('inbox'))]);
  const now = new Date();
  const money = (n: number) => formatMoney(n, d.currency, locale);
  const when = (date: string) => {
    const n = daysFromToday(date);
    return n <= 0 ? t('sub.today') : n === 1 ? t('home.tomorrow') : t('home.inDays', { n });
  };

  const kpis = [
    { label: t('home.kpiSpent', { month: d.monthLabel }), value: money(d.spentMonth), sub: `${d.spentCount} ${d.spentCount === 1 ? t('ex.recordOne') : t('ex.recordMany')}`, href: '/expenses' },
    { label: t('home.kpiIncome', { month: d.monthLabel }), value: money(d.incomeMonth), sub: `${d.incomeCount} ${d.incomeCount === 1 ? t('ex.recordOne') : t('ex.recordMany')}`, href: '/income' },
    { label: t('nav.subscriptions'), value: `${money(d.subsMonthly)}${t('cal.perMo')}`, sub: t('v.activeCount', { n: d.subsCount }), href: '/subscriptions' },
    { label: t('home.comingUp'), value: String(d.soon.length), sub: t('home.next30'), href: '/calendar' },
  ];

  return (
    <main className={PAGE_MAIN}>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-[26px] lg:text-3xl leading-tight font-semibold" style={display}>
            {t(greetingKey(now, timeZone))}
          </h1>
          <p className="text-sm text-[color:var(--color-text-dim)] mt-0.5">
            {formatDate(now, locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone })}
          </p>
        </div>
        <div className="hidden lg:flex items-center gap-2">
          <Link href="/expenses?open=new" prefetch={false} className="inline-flex items-center gap-2 h-10 px-4 rounded-[10px] text-sm font-semibold bg-[color:var(--color-accent)] text-[color:var(--color-on-accent)] hover:brightness-110">
            <Plus size={16} strokeWidth={2.5} /> {t('nav.addExpense')}
          </Link>
          <Link href="/receipts?open=new" prefetch={false} className="inline-flex items-center gap-2 h-10 px-3.5 rounded-[10px] text-sm font-semibold bg-[color:var(--color-surface-2)] border border-[color:var(--color-border-light)] hover:bg-[color:var(--color-surface-3)]">
            <ReceiptIcon size={16} /> {t('nav.scanReceipt')}
          </Link>
          <Link href="/shopping-list?open=new" prefetch={false} className="inline-flex items-center gap-2 h-10 px-3.5 rounded-[10px] text-sm font-semibold bg-[color:var(--color-surface-2)] border border-[color:var(--color-border-light)] hover:bg-[color:var(--color-surface-3)]">
            <ShoppingBasket size={16} /> {t('nav.addShoppingItem')}
          </Link>
        </div>
      </div>

      {d.aiBanner && <AiOnboardingBanner reason={d.aiBanner} />}

      <OnboardingChecklist
        dismissed={d.onboarding.dismissed}
        title={t('home.onbTitle')}
        subtitle={t('home.onbSubtitle')}
        doneLabel={t('home.onbDone')}
        steps={onboardingSteps(d.onboarding, t)}
      />

      {inbox !== 'disabled' && <InboxDrop />}

      <div className={`${card} grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden bg-[color:var(--color-border)] mb-4`}>
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} prefetch={false} className="bg-[color:var(--color-surface)] px-4 py-3.5 lg:px-5 lg:py-4 hover:bg-[color:var(--color-surface-2)] transition-colors min-w-0">
            <span className="block text-xs text-[color:var(--color-text-dim)] truncate">{k.label}</span>
            <span className="block mt-1 text-xl lg:text-2xl font-semibold tabular-nums truncate" style={display}>{k.value}</span>
            <span className="block mt-0.5 text-xs text-[color:var(--color-text-faint)] truncate">{k.sub}</span>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className={card} aria-labelledby="home-soon">
          <div className="flex items-center justify-between px-4 lg:px-5 pt-3.5 pb-2">
            <h2 id="home-soon" className="text-[15px] font-semibold">{t('home.comingUp')}</h2>
            <Link href="/calendar" prefetch={false} className="inline-flex items-center gap-1 text-sm text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] h-9">
              {t('nav.calendar')} <ArrowRight size={14} />
            </Link>
          </div>
          {d.soon.length === 0 ? (
            <p className="px-5 pb-5 pt-1 text-sm text-[color:var(--color-text-dim)]">{t('home.nothingSoon')}</p>
          ) : (
            <ul>
              {d.soon.slice(0, 6).map((e, i) => {
                const at = new Date(e.date);
                const kind = KIND[e.kind];
                return (
                  <li key={`${e.date}-${e.kind}-${i}`} className="border-t border-[color:var(--color-border)]">
                    <Link href={kind.href} prefetch={false} className="flex items-center gap-3.5 px-4 lg:px-5 py-2.5 hover:bg-[color:var(--color-surface-2)] transition-colors">
                      <span className="w-11 h-11 shrink-0 rounded-[10px] bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] flex flex-col items-center justify-center leading-none">
                        <span className="text-[15px] font-bold tabular-nums">{at.getDate()}</span>
                        <span className="text-[11px] text-[color:var(--color-text-dim)] mt-0.5">{formatDate(at, locale, { month: 'short' })}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold truncate">{e.label}</span>
                        <span className="block text-xs text-[color:var(--color-text-dim)] truncate">
                          {t(kind.label)} · {when(e.date)}
                        </span>
                      </span>
                      {e.amount != null && e.amount > 0 && (
                        <span className={`shrink-0 text-sm font-semibold tabular-nums ${e.kind === 'income' ? 'text-[color:var(--color-accent)]' : ''}`}>
                          {e.kind === 'income' ? '+' : ''}{money(e.amount)}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={card} aria-labelledby="home-recent">
          <div className="flex items-center justify-between px-4 lg:px-5 pt-3.5 pb-2">
            <h2 id="home-recent" className="text-[15px] font-semibold">{t('home.recent')}</h2>
            <Link href="/expenses" prefetch={false} className="inline-flex items-center gap-1 text-sm text-[color:var(--color-text-dim)] hover:text-[color:var(--color-text)] h-9">
              {t('nav.expenses')} <ArrowRight size={14} />
            </Link>
          </div>
          {d.recent.length === 0 ? (
            <p className="px-5 pb-5 pt-1 text-sm text-[color:var(--color-text-dim)]">{t('home.noRecent')}</p>
          ) : (
            <ul>
              {d.recent.map((r) => {
                const income = r.kind === 'income';
                const Icon = income ? Banknote : Wallet;
                return (
                  <li key={r.id} className="border-t border-[color:var(--color-border)]">
                    <Link href={`/${income ? 'income' : 'expenses'}?open=${r.id}`} prefetch={false} className="flex items-center gap-3.5 px-4 lg:px-5 py-2.5 hover:bg-[color:var(--color-surface-2)] transition-colors">
                      <span className="w-9 h-9 shrink-0 rounded-full grid place-items-center bg-[color:var(--color-surface-2)] border border-[color:var(--color-border)] text-[color:var(--color-text-dim)]">
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold truncate">{r.vendor || t(income ? 'nav.income' : 'nav.expenses')}</span>
                        <span className="block text-xs text-[color:var(--color-text-dim)] truncate">
                          {[r.category ? categoryLabel(t, r.category) : '', r.date ? formatDate(r.date, locale, { day: 'numeric', month: 'short' }) : ''].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className={`shrink-0 text-sm font-semibold tabular-nums ${income ? 'text-[color:var(--color-accent)]' : ''}`}>
                        {income ? '+' : ''}{money(r.amount)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
