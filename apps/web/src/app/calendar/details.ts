import type { Kind } from './CalendarClient';
import { ymd } from '@/lib/calendarDay';

export type EntryDetails = {
  id?: string;
  kind: Kind;
  title: string;
  amount?: number | null;
  currency?: string;
  provider?: string;
  billingCycle?: string;
  nextRenewal?: string;
  daysUntil?: number;
  paymentMethod?: string;
  startDate?: string;
  trialEndsAt?: string;
  notes?: string;
  url?: string;
  space?: string;
  dueDate?: string;
  paid?: boolean;
  partialPayments?: { date: string; amount: number; note?: string }[];
  plans?: { cardName?: string; merchant?: string; planIndex?: number; totalInstallments?: number; amount: number }[];
  source?: string;
  targetAmount?: number;
  savedAmount?: number;
  deadline?: string;
  purchaseDate?: string;
  store?: string;
  warrantyEnd?: string;
  code?: string;
  discount?: string;
  expiresAt?: string;
  editUrl?: string;
};

export function buildSubscriptionDetails(s: any, renewalDate: Date, now: Date, baseCurrency: string): EntryDetails {
  const diffDays = Math.ceil((renewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return {
    id: s._id ? String(s._id) : undefined,
    kind: 'renewal',
    title: s.name || '',
    provider: s.provider || '',
    amount: s.amount ?? null,
    currency: s.currency || baseCurrency,
    billingCycle: s.billingCycle || 'monthly',
    nextRenewal: ymd(renewalDate),
    daysUntil: diffDays,
    paymentMethod: s.paymentMethod || '',
    startDate: s.startDate ? ymd(new Date(s.startDate)) : undefined,
    trialEndsAt: s.trialEndsAt ? ymd(new Date(s.trialEndsAt)) : undefined,
    notes: s.notes || '',
    url: s.url || '',
    space: s.space || '',
    editUrl: s._id ? `/subscriptions?open=${s._id}` : '/subscriptions',
  };
}

export function buildBillDetails(b: any, remaining: number | null, baseCurrency: string): EntryDetails {
  const dueDateStr = b.dueDate ? ymd(new Date(b.dueDate)) : '';
  const payments = (b.payments || []).map((p: any) => ({
    date: p.date ? ymd(new Date(p.date)) : '',
    amount: Number(p.amount) || 0,
    note: p.note || '',
  }));
  return {
    id: b._id ? String(b._id) : undefined,
    kind: 'payable',
    title: b.title || b.vendor || '',
    provider: b.vendor || '',
    amount: remaining,
    currency: b.currency || baseCurrency,
    dueDate: dueDateStr,
    paid: !!b.paidAt,
    partialPayments: payments,
    editUrl: b._id ? `/expenses/to-pay?open=${b._id}` : '/expenses/to-pay',
  };
}

export function buildInstallmentDetails(plans: any[], monthIndex: number): EntryDetails {
  const plansDue = plans.map((p: any) => ({
    cardName: p.cardName || '',
    merchant: p.merchant || '',
    planIndex: (p.totalInstallments || 0) - (p.remainingInstallments || 0) + 1 + monthIndex,
    totalInstallments: p.totalInstallments || 0,
    amount: p.perAmount || 0,
  }));
  const totalAmount = plansDue.reduce((sum, p) => sum + p.amount, 0);
  return {
    kind: 'installments',
    title: 'Installments',
    amount: totalAmount,
    plans: plansDue,
    editUrl: '/statements',
  };
}

export function buildRecurringDetails(r: any, date: Date, baseCurrency: string): EntryDetails {
  const isIncome = r.kind === 'income';
  return {
    id: r._id ? String(r._id) : undefined,
    kind: isIncome ? 'income' : 'bill',
    title: r.vendor || '',
    source: r.vendor || '',
    amount: r.amount ?? null,
    currency: baseCurrency,
    billingCycle: r.recurringCycle || '',
    dueDate: ymd(date),
    editUrl: isIncome ? '/income' : '/expenses',
  };
}

export function buildGoalDetails(g: any, target: number, saved: number): EntryDetails {
  return {
    id: g._id ? String(g._id) : undefined,
    kind: 'goal',
    title: g.title || '',
    targetAmount: target,
    savedAmount: saved,
    deadline: g.targetDate ? ymd(new Date(g.targetDate)) : undefined,
    editUrl: '/reports#goals',
  };
}

export function buildWarrantyDetails(i: any): EntryDetails {
  return {
    id: i._id ? String(i._id) : undefined,
    kind: 'warranty',
    title: i.title || '',
    store: i.store || '',
    purchaseDate: i.purchasedDate ? ymd(new Date(i.purchasedDate)) : undefined,
    warrantyEnd: i.warrantyUntil ? ymd(new Date(i.warrantyUntil)) : undefined,
    editUrl: i._id ? `/items?open=${i._id}` : '/items',
  };
}

export function buildVoucherDetails(v: any): EntryDetails {
  return {
    id: v._id ? String(v._id) : undefined,
    kind: 'voucher',
    title: v.title || '',
    store: v.store || '',
    code: v.code || '',
    discount: v.discount || '',
    expiresAt: v.expiresAt ? ymd(new Date(v.expiresAt)) : undefined,
    editUrl: v._id ? `/vouchers?open=${v._id}` : '/vouchers',
  };
}
