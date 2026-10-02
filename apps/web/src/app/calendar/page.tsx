import { connectDB } from '@/lib/db';
import { WARRANTY_ALERT_STATUSES } from '@/lib/itemStatus';
import { addCycle, cycleRenews } from '@/lib/billingCycle';
import { renewalAnchor, renewalOnOrAfter } from '@/lib/subscriptionRenewal';
import { Subscription as SubscriptionModel } from '@/models/Subscription';
import { Statement as StatementModel } from '@/models/Statement';
import { Item as ItemModel } from '@/models/Item';
import { Voucher as VoucherModel } from '@/models/Voucher';
import { Expense as ExpenseModel } from '@/models/Expense';
import { Bill as BillModel } from '@/models/Bill';
import { Goal as GoalModel } from '@/models/Goal';
import { Receipt as ReceiptModel } from '@/models/Receipt';
import { categoryLabel } from '@/lib/categories';
import { billRemaining } from '@/lib/bill';
import { getAppSettings } from '@/lib/appSettings';
import { formatMoney } from '@/lib/fx';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { computeInstallmentPlans } from '@/lib/installments';
import type { SerializedStatement } from '@/types';
import { CalendarClient, type Entry, type MonthBlock } from './CalendarClient';
import { getServerT } from '@/lib/i18n/server';
import type { TFunc, TKey } from '@/lib/i18n';
import { intlTag } from '@/lib/i18n/format';
import { ymd } from '@/lib/calendarDay';
import {
  buildSubscriptionDetails,
  buildBillDetails,
  buildInstallmentDetails,
  buildRecurringDetails,
  buildGoalDetails,
  buildWarrantyDetails,
  buildVoucherDetails,
} from './details';

// Money calendar. Behind today: what actually happened, for the last 12 months (expenses,
// income and receipts as recorded). From today: what is coming in the next 3 months
// (subscription renewals, card installments, recurring bills/income, open bills (P28),
// goal deadlines (P12), warranty / voucher expiries). Derived live here, drawn as a month
// grid with a day panel client-side.

export const dynamic = 'force-dynamic';

/** Months shown behind the current one, and ahead of it (the current one included). */
const MONTHS_BACK = 12;
const MONTHS_AHEAD = 3;

const mk = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

async function getAgenda(t: TFunc, intlTag: string): Promise<{ months: MonthBlock[]; dueThisMonth: number }> {
  return withRequestTenant(async () => {
    await connectDB();
    const base = (await getAppSettings()).currency;
    const Subscription = await currentModel(SubscriptionModel);
    const Statement = await currentModel(StatementModel);
    const Item = await currentModel(ItemModel);
    const Voucher = await currentModel(VoucherModel);
    const Expense = await currentModel(ExpenseModel);
    const Bill = await currentModel(BillModel);
    const Goal = await currentModel(GoalModel);
    const Receipt = await currentModel(ReceiptModel);
    const now = new Date();
    const pastStart = new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK, 1);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const windowEnd = new Date(now.getFullYear(), now.getMonth() + MONTHS_AHEAD, 1);

    const [subs, statements, items, vouchers, recurring, bills, goals, spent, receipts] = await Promise.all([
      Subscription.find({ active: true, nextRenewal: { $ne: null }, deletedAt: null })
        .select('name provider amount currency billingCycle startDate nextRenewal trialEndsAt paymentMethod notes url space')
        .lean(),
      Statement.find().lean(),
      Item.find({ warrantyUntil: { $gte: windowStart, $lt: windowEnd }, status: { $in: [...WARRANTY_ALERT_STATUSES] }, deletedAt: null })
        .select('title store purchasedDate warrantyUntil')
        .lean(),
      Voucher.find({ used: false, expiresAt: { $gte: windowStart, $lt: windowEnd }, deletedAt: null })
        .select('title store code discount expiresAt')
        .lean(),
      Expense.find({ recurring: true, recurringCycle: { $nin: ['', null] }, amount: { $gt: 0 }, deletedAt: null })
        .sort({ date: -1 })
        .select('kind vendor vendorKey amount date recurringCycle')
        .lean(),
      // P67 — open payables and goal deadlines
      Bill.find({ paidAt: null, archived: { $ne: true }, dueDate: { $gte: windowStart, $lt: windowEnd }, deletedAt: null })
        .select('title vendor amount currency origAmount fxRate payments dueDate paidAt')
        .lean(),
      Goal.find({ archived: { $ne: true }, targetDate: { $gte: windowStart, $lt: windowEnd }, deletedAt: null })
        .select('title targetAmount contributions targetDate')
        .lean(),
      // What actually happened before today
      Expense.find({ amount: { $gt: 0 }, date: { $gte: pastStart, $lt: todayStart }, deletedAt: null })
        .select('kind vendor category amount date')
        .lean(),
      Receipt.find({ date: { $gte: pastStart, $lt: todayStart }, deletedAt: null })
        .select('store date total')
        .lean(),
    ]);

    const months: MonthBlock[] = Array.from({ length: MONTHS_BACK + MONTHS_AHEAD }, (_, n) => n - MONTHS_BACK).map((i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return {
        key: mk(d),
        label: d.toLocaleDateString(intlTag, { month: 'long', year: 'numeric' }),
        entries: [],
        out: 0,
        inc: 0,
        rec: 0,
        spent: 0,
      };
    });
    const byKey = new Map(months.map((m) => [m.key, m]));
    const push = (date: Date, e: Omit<Entry, 'date'>) => {
      const m = byKey.get(mk(date));
      if (!m) return;
      m.entries.push({ ...e, date: ymd(date) });
      if (e.amount != null) {
        if (e.kind === 'income' || e.kind === 'earned') m.inc += e.amount;
        else if (e.kind === 'receipt') m.rec += e.amount;
        else if (e.kind === 'spent') m.spent += e.amount;
        else m.out += e.amount;
      }
    };

    // Recorded expenses, income and receipts, behind today
    for (const x of spent) {
      const income = x.kind === 'income';
      push(new Date(x.date as unknown as string), {
        id: String(x._id),
        kind: income ? 'earned' : 'spent',
        label: x.vendor || t(income ? 'cal.lblIncome' : 'cal.lblSpent'),
        sub: x.category ? categoryLabel(t, x.category) : '',
        amount: x.amount || 0,
        details: { id: String(x._id), kind: income ? 'earned' : 'spent', title: x.vendor || '', amount: x.amount || 0, editUrl: `/${income ? 'income' : 'expenses'}?open=${x._id}` },
      });
    }
    for (const r of receipts) {
      push(new Date(r.date as unknown as string), {
        id: String(r._id),
        kind: 'receipt',
        label: r.store || t('cal.lblReceipt'),
        sub: t('cal.lblReceipt'),
        amount: r.total || 0,
        details: { id: String(r._id), kind: 'receipt', title: r.store || '', amount: r.total || 0, editUrl: `/receipts?open=${r._id}` },
      });
    }

    // Subscription renewals — step each one forward through the window (from today: what is
    // behind today is already in the recorded expenses above)
    for (const s of subs) {
      if (!cycleRenews(s.billingCycle || 'monthly')) continue;
      const anchor = renewalAnchor(s.nextRenewal, s.startDate);
      let d = renewalOnOrAfter(s.nextRenewal, s.billingCycle, windowStart, anchor);
      if (!d) continue;
      let guard = 0;
      while (d < windowEnd && guard < 16) {
        guard++;
        if (d >= todayStart) {
          const details = buildSubscriptionDetails(s, d, now, base);
          push(d, {
            id: String(s._id),
            kind: 'renewal',
            label: s.name || t('cal.lblSubscription'),
            sub: t('cal.subRenews', { cycle: t(`sub.${s.billingCycle || 'monthly'}` as TKey) }),
            amount: s.amount || 0,
            details,
          });
        }
        d = addCycle(d, s.billingCycle || 'monthly', anchor);
      }
    }

    // Card installments — one aggregated line per month
    const plans = computeInstallmentPlans(JSON.parse(JSON.stringify(statements)) as SerializedStatement[]).filter((p) => !p.done);
    for (let i = 0; i < MONTHS_AHEAD; i++) {
      const due = plans.filter((p) => p.remainingInstallments >= i + 1);
      const amount = due.reduce((total, p) => total + p.perAmount, 0);
      if (amount > 0) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const details = buildInstallmentDetails(due, i);
        push(d, {
          pinned: true,
          kind: 'installments',
          label: t('cal.lblInstallments'),
          sub: due.length === 1 ? t('cal.subPlan') : t('cal.subPlans', { n: due.length }),
          amount,
          details,
        });
      }
    }

    // Recurring bills / income
    const seen = new Set<string>();
    for (const r of recurring) {
      const key = `${r.kind}|${r.vendorKey}`;
      if (!r.vendorKey || seen.has(key)) continue;
      seen.add(key);
      const anchor = new Date(r.date as unknown as string);
      let d = addCycle(anchor, String(r.recurringCycle), anchor);
      let guard = 0;
      while (d < windowEnd && guard < 8) {
        guard++;
        if (d > now) {
          const details = buildRecurringDetails(r, d, base);
          push(d, {
            id: String(r._id),
            kind: r.kind === 'income' ? 'income' : 'bill',
            label: r.vendor || t(r.kind === 'income' ? 'cal.lblIncome' : 'cal.lblBill'),
            sub: t('cal.subExpected', { cycle: t(`sub.${r.recurringCycle}` as TKey) }),
            amount: r.amount || 0,
            details,
          });
        }
        d = addCycle(d, String(r.recurringCycle), anchor);
      }
    }

    // Open bills (P28)
    for (const b of bills) {
      const remaining = billRemaining({ ...b, paidAt: null }, base);
      const details = buildBillDetails(b, remaining, base);
      push(new Date(b.dueDate as unknown as string), {
        id: String(b._id),
        kind: 'payable',
        label: b.title || b.vendor || t('cal.lblBill'),
        sub: remaining === null ? `${t('cal.subPayable')} · ${formatMoney(Number(b.origAmount) || 0, b.currency || '', intlTag)}` : t('cal.subPayable'),
        amount: remaining,
        details,
      });
    }

    // Goal deadlines (P12)
    for (const g of goals) {
      const target = Number(g.targetAmount) || 0;
      const saved = (g.contributions || []).reduce((sum, c) => sum + (Number(c?.amount) || 0), 0);
      if (target > 0 && saved >= target) continue;
      const details = buildGoalDetails(g, target, saved);
      push(new Date(g.targetDate as unknown as string), {
        id: String(g._id),
        kind: 'goal',
        label: g.title || t('cal.lblGoal'),
        sub: t('cal.subGoal'),
        amount: null,
        details,
      });
    }

    // Expiries (warranties & vouchers)
    for (const i of items) {
      const details = buildWarrantyDetails(i);
      push(new Date(i.warrantyUntil as unknown as string), {
        id: String(i._id),
        kind: 'warranty',
        label: i.title || t('cal.lblItem'),
        sub: t('cal.subWarranty'),
        amount: null,
        details,
      });
    }
    for (const v of vouchers) {
      const details = buildVoucherDetails(v);
      push(new Date(v.expiresAt as unknown as string), {
        id: String(v._id),
        kind: 'voucher',
        label: v.title || t('cal.lblVoucher'),
        sub: t('cal.subVoucher', { store: v.store || '', discount: v.discount || '' }).trim(),
        amount: null,
        details,
      });
    }

    for (const m of months) {
      m.entries.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || new Date(a.date).getTime() - new Date(b.date).getTime());
      m.out = Math.round(m.out * 100) / 100;
      m.inc = Math.round(m.inc * 100) / 100;
      m.rec = Math.round(m.rec * 100) / 100;
      m.spent = Math.round(m.spent * 100) / 100;
    }
    // "Due this month" is what is still coming (out), not what was already spent.
    return { months, dueThisMonth: months[MONTHS_BACK].out };
  });
}

export default async function CalendarPage() {
  const { t, locale } = await getServerT();
  const { months, dueThisMonth } = await getAgenda(t, intlTag(locale));
  return <CalendarClient months={months} dueThisMonth={dueThisMonth} currentIndex={MONTHS_BACK} />;
}
