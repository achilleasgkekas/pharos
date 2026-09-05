'use server';

import { connectDB } from '@/lib/db';
import { getAppSettings } from '@/lib/appSettings';
import { cur } from '@/lib/money';
import { Item as ItemModel } from '@/models/Item';
import { Statement as StatementModel } from '@/models/Statement';
import { Expense as ExpenseModel } from '@/models/Expense';
import { Subscription as SubscriptionModel } from '@/models/Subscription';
import { GiftCard as GiftCardModel } from '@/models/GiftCard';
import { Bill as BillModel } from '@/models/Bill';
import { Notification as NotificationModel } from '@/models/Notification';
import { withRequestTenant, resolveRequestTenantOrNull } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { currentTenant, withTenant } from '@/lib/tenancy/current';
import { giftCardBalance, giftCardDaysLeft } from '@/lib/giftcard';
import { billDaysUntilDue, billRemaining } from '@/lib/bill';
import { collectMaintenanceDue, MAINTENANCE_STATUSES, type MaintenanceRow } from '@/lib/maintenance';
import { collectLendingOverdue, LENDING_STATUSES, type LendingRow } from '@/lib/lending';
import { computeInstallmentPlans } from '@/lib/installments';
import { detectPriceHikes, type HikeEntry } from '@/lib/priceHike';
import type { SerializedStatement } from '@/types';
import { assertCanWrite } from '@/lib/auth';

export type NotifKind = 'deal' | 'installment' | 'warranty' | 'pricehike' | 'trialend' | 'giftcard' | 'bill' | 'maintenance' | 'lending' | 'system';

export type SerializedNotification = {
  _id: string;
  kind: NotifKind;
  title: string;
  body: string; // structured payload, formatted in the bell (see NotificationBell)
  href: string;
  read: boolean;
  createdAt: string;
};

type Alert = { dedupeKey: string; kind: NotifKind; title: string; body: string; href: string };
const AUTO_KINDS = ['deal', 'installment', 'warranty', 'pricehike', 'trialend', 'giftcard', 'bill', 'maintenance', 'lending'] as const;

/** Recompute the live alerts (deals / warranties / installments-due) — the same
 *  three the ntfy check uses, but as structured payloads the bell can localize.
 *
 *  Resolves its 6 source models from the AMBIENT tenant rather than taking them as
 *  arguments: the only callers are `reconcile()` bodies that already run inside
 *  `withRequestTenant`, so `currentModel` returns that tenant's models. Self-hosted
 *  (no tenant established) resolves to the default connection, unchanged. */
async function computeAlerts(): Promise<Alert[]> {
  const s = await getAppSettings(); // also sets the currency symbol for cur()
  const now = Date.now();
  const alerts: Alert[] = [];
  const [Item, Statement, Expense, Subscription, GiftCard, Bill] = await Promise.all([
    currentModel(ItemModel),
    currentModel(StatementModel),
    currentModel(ExpenseModel),
    currentModel(SubscriptionModel),
    currentModel(GiftCardModel),
    currentModel(BillModel),
  ]);

  // Deals — a tracked item whose best price reached its target.
  const dealItems = (await Item.find({ targetPrice: { $gt: 0 } }).select('title targetPrice currentPrice links').lean()) as Array<{
    _id: unknown; title: string; targetPrice?: number; currentPrice?: number; links?: { price?: number | null }[];
  }>;
  for (const i of dealItems) {
    let lo = (i.currentPrice ?? 0) > 0 ? (i.currentPrice as number) : Infinity;
    for (const l of i.links ?? []) if (l.price && l.price > 0) lo = Math.min(lo, l.price);
    if (lo < Infinity && lo <= (i.targetPrice ?? 0)) {
      const id = String(i._id);
      // body = "<bestPrice>|<target>" (raw numbers; the bell formats with the symbol)
      alerts.push({ dedupeKey: `deal:${id}`, kind: 'deal', title: i.title, body: `${lo}|${i.targetPrice ?? 0}`, href: `/shopping?open=${id}` });
    }
  }

  // Warranties expiring within the configured window.
  const warrantyItems = (await Item.find({ warrantyUntil: { $ne: null } }).select('title warrantyUntil').lean()) as Array<{
    _id: unknown; title: string; warrantyUntil?: string | Date | null;
  }>;
  for (const i of warrantyItems) {
    const days = Math.ceil((new Date(i.warrantyUntil as string).getTime() - now) / 86400000);
    if (!isNaN(days) && days >= 0 && days <= s.warrantyAlertDays) {
      const id = String(i._id);
      alerts.push({ dedupeKey: `warranty:${id}`, kind: 'warranty', title: i.title, body: `${days}`, href: `/items?open=${id}` });
    }
  }

  // Installments due this month (one aggregate notification).
  const statements = await Statement.find().lean();
  const plans = computeInstallmentPlans(JSON.parse(JSON.stringify(statements)) as SerializedStatement[]).filter(
    (p) => !p.done && p.remainingInstallments >= 1
  );
  const due = plans.reduce((sum, p) => sum + p.perAmount, 0);
  if (due > 0) {
    const period = new Date().toISOString().slice(0, 7); // YYYY-MM → one per month
    // body = "<amount>|<planCount>"
    alerts.push({ dedupeKey: `installments:${period}`, kind: 'installment', title: '', body: `${Math.round(due)}|${plans.length}`, href: '/calendar' });
  }

  // Recurring price hikes/drops (P14): a bill/subscription that changed vs its
  // previous charge. dedupeKey carries the new amount so a fresh change re-alerts
  // even if an earlier one was dismissed, and it auto-expires once that amount
  // becomes the steady state.
  const hikeRows = (await Expense.find({ amount: { $gt: 0 } })
    .select('vendor vendorKey amount date recurring kind')
    .lean()) as HikeEntry[];
  for (const h of detectPriceHikes(hikeRows)) {
    // body = "<vendor>|<prev>|<curr>|<pct>" (raw; the bell formats with the symbol)
    alerts.push({
      dedupeKey: `pricehike:${h.vendorKey}:${h.curr}`,
      kind: 'pricehike',
      title: h.vendor,
      body: `${h.prev}|${h.curr}|${h.deltaPct}`,
      href: '/expenses',
    });
  }

  // Free-trial "cancel before charge" (P33): an active subscription whose trial
  // ends within the lead-time window. dedupeKey carries the trial date so moving
  // the date re-alerts, and the alert auto-expires once the date has passed.
  const trials = (await Subscription.find({ active: true, trialEndsAt: { $ne: null } })
    .select('name amount trialEndsAt firstChargeAmount')
    .lean()) as Array<{ _id: unknown; name: string; amount?: number; trialEndsAt?: string | Date | null; firstChargeAmount?: number }>;
  for (const sub of trials) {
    const ends = new Date(sub.trialEndsAt as string).getTime();
    if (Number.isNaN(ends)) continue;
    const days = Math.ceil((ends - now) / 86400000);
    if (days < 0 || days > s.trialAlertDays) continue;
    const id = String(sub._id);
    const charge = (sub.firstChargeAmount ?? 0) > 0 ? (sub.firstChargeAmount as number) : sub.amount ?? 0;
    const iso = new Date(ends).toISOString().slice(0, 10);
    // body = "<days>|<chargeAmount>" (raw; the bell formats with the symbol)
    alerts.push({
      dedupeKey: `trialend:${id}:${iso}`,
      kind: 'trialend',
      title: sub.name,
      body: `${days}|${charge}`,
      href: `/subscriptions?open=${id}`,
    });
  }

  // Gift-card / store-credit expiring with money still on it (P32): don't let a
  // balance quietly expire. Only cards with a remaining balance and an expiry
  // within the configured window. dedupeKey carries the expiry date so it
  // auto-expires once past and re-alerts if the date is moved.
  const giftCards = (await GiftCard.find({ archived: { $ne: true }, expiresAt: { $ne: null } })
    .select('title initialAmount uses expiresAt')
    .lean()) as Array<{ _id: unknown; title: string; initialAmount?: number; uses?: { amount?: number }[]; expiresAt?: string | Date | null }>;
  for (const g of giftCards) {
    const balance = giftCardBalance(g.initialAmount ?? 0, g.uses ?? []);
    if (balance <= 0.009) continue;
    const days = giftCardDaysLeft(g.expiresAt ?? null, now);
    if (days === null || days < 0 || days > s.giftCardAlertDays) continue;
    const id = String(g._id);
    const iso = new Date(g.expiresAt as string).toISOString().slice(0, 10);
    // body = "<days>|<balance>" (raw; the bell formats with the symbol)
    alerts.push({ dedupeKey: `giftcard:${id}:${iso}`, kind: 'giftcard', title: g.title, body: `${days}|${balance}`, href: '/vouchers' });
  }

  // Bills / payables (P28): an unpaid bill that's overdue or due within the
  // configured lead-time window. dedupeKey carries the due date so moving it
  // re-alerts; it auto-expires once the bill is paid (leaves the query). Overdue
  // ones keep nagging (no lower bound) until paid.
  const openBills = (await Bill.find({ paidAt: null, archived: { $ne: true } })
    .select('title vendor amount dueDate payments')
    .lean()) as Array<{ _id: unknown; title: string; vendor?: string; amount?: number; dueDate?: string | Date | null; payments?: { amount?: number }[] }>;
  for (const b of openBills) {
    const days = billDaysUntilDue(b.dueDate ?? null, now);
    if (days === null || days > s.billAlertDays) continue;
    const id = String(b._id);
    const iso = new Date(b.dueDate as string).toISOString().slice(0, 10);
    // body = "<days>|<amount>" (raw; days<0 = overdue; the bell formats with the symbol).
    // P61: the figure is what is STILL OWED, so an alert on a part-paid bill quotes the
    // balance you actually have to hand over, not the original total.
    alerts.push({
      dedupeKey: `bill:${id}:${iso}`,
      kind: 'bill',
      title: b.title,
      body: `${days}|${billRemaining(b.amount, b.payments, null)}`,
      href: '/bills',
    });
  }

  // Maintenance due (P41): an owned item whose service interval has come round. The
  // dedupeKey carries the DUE date, so pressing "serviced today" moves the date, retires
  // this alert and arms the next cycle — no separate "acknowledged" flag to drift.
  const maintRows = (await Item.find({ maintenanceIntervalDays: { $gt: 0 }, status: { $in: MAINTENANCE_STATUSES } })
    .select('title status maintenanceIntervalDays lastMaintenanceAt purchasedAt')
    .lean()) as MaintenanceRow[];
  for (const m of collectMaintenanceDue(maintRows, s.maintenanceAlertDays, now)) {
    // body = "<days>" (raw; negative = overdue, formatted in the bell)
    alerts.push({
      dedupeKey: `maintenance:${String(m._id)}:${m.iso}`,
      kind: 'maintenance',
      title: m.title,
      body: `${m.days}`,
      href: `/items?open=${String(m._id)}`,
    });
  }

  // Lent items due back (P47): the drill at your brother's house, with a date agreed. The
  // dedupeKey carries the AGREED date (lending:<id>:<iso>), so pushing the deadline back
  // retires this alert and arms the new one, while "it came back" clears the borrower name
  // and drops the row out of the query entirely — the auto-expire sweep does the rest.
  const lendRows = (await Item.find({ lentTo: { $nin: ['', null] }, expectedReturnAt: { $ne: null }, status: { $in: LENDING_STATUSES } })
    .select('title status lentTo lentAt expectedReturnAt')
    .lean()) as LendingRow[];
  for (const l of collectLendingOverdue(lendRows, s.lendingAlertDays, now)) {
    // body = "<days>|<borrower>": the name is half the message ("ask Kostas"), and the bell
    // localizes the rest. Split on the FIRST bar only, since a name may contain one.
    alerts.push({
      dedupeKey: `lending:${String(l._id)}:${l.iso}`,
      kind: 'lending',
      title: l.title,
      body: `${l.days}|${l.borrower}`,
      href: `/items?open=${String(l._id)}`,
    });
  }

  return alerts;
}

/** Reconcile the Notification collection with the live alerts: insert new ones
 *  (unread), refresh still-active ones, soft-delete resolved ones, and never
 *  recreate a dismissed alert. Safe to call repeatedly.
 *
 *  Kept as ONE exported function with the writes inline (rather than a private
 *  helper both entry points call): `lib/writeGuard.coverage.test.ts` scans exported
 *  action bodies for Mongoose writes, so moving them into a helper would hide this
 *  action from that guard. `getNotifications` therefore re-enters `withRequestTenant`
 *  here, which re-resolves the SAME request context — cheap, and throttled to once
 *  per 10 minutes per tenant anyway. */
export async function generateNotifications(): Promise<void> {
  return withRequestTenant(async () => {
    await connectDB();
    const Notification = await currentModel(NotificationModel);
    const alerts = await computeAlerts();
    const currentKeys = alerts.map((a) => a.dedupeKey);

    // Existing auto-generated notifications, INCLUDING dismissed (soft-deleted) — so a
    // dismissed alert isn't recreated and an active one isn't duplicated.
    const existing = (await Notification.find({ kind: { $in: AUTO_KINDS } })
      .setOptions({ withDeleted: true })
      .select('dedupeKey')
      .lean()) as Array<{ dedupeKey: string }>;
    const existingKeys = new Set(existing.map((e) => e.dedupeKey));

    const fresh = alerts.filter((a) => !existingKeys.has(a.dedupeKey));
    if (fresh.length) await Notification.insertMany(fresh.map((a) => ({ ...a, read: false })));

    // Refresh title/body of still-active (non-dismissed) ones — e.g. the warranty day count.
    for (const a of alerts) {
      if (existingKeys.has(a.dedupeKey)) {
        await Notification.updateOne({ dedupeKey: a.dedupeKey }, { $set: { title: a.title, body: a.body, href: a.href } });
      }
    }

    // Auto-expire resolved alerts (price rose, warranty passed, month rolled over).
    await Notification.updateMany(
      { kind: { $in: AUTO_KINDS }, dedupeKey: { $nin: currentKeys } },
      { $set: { deletedAt: new Date() } }
    );
  });
}

function serialize(d: { _id: unknown; kind: NotifKind; title: string; body: string; href: string; read?: boolean; createdAt: Date }): SerializedNotification {
  return {
    _id: String(d._id),
    kind: d.kind,
    title: d.title,
    body: d.body,
    href: d.href,
    read: !!d.read,
    createdAt: new Date(d.createdAt).toISOString(),
  };
}

// Throttle background generation so a bell poll every 60s doesn't re-scan the DB
// each time; alerts aren't time-critical to the minute. Keyed PER TENANT: a single
// counter would let one workspace's poll silence every other workspace's reconcile
// for ten minutes. Self-hosted has exactly one key ('default'), so it behaves as
// the old scalar did.
const lastGen = new Map<string, number>();
const GEN_THROTTLE_MS = 10 * 60 * 1000;
// Bound the map so a long-lived SaaS process can't accumulate a key per tenant
// forever; dropping entries only costs one extra reconcile.
const GEN_KEYS_MAX = 500;

function genKey(): string {
  return currentTenant().tenantId ?? 'default';
}

/** Polled unconditionally by NotificationBell (60s interval, mounted on every page including
 *  hosts with no tenant at all — /admin, app.ph-aros.com/). Uses the non-denying resolver: a
 *  background poll must never redirect the visitor away from whatever they're looking at just
 *  because there's nothing to show here. See resolveRequestTenantOrNull's doc comment. */
export async function getNotifications(): Promise<{ items: SerializedNotification[]; unread: number }> {
  const ctx = await resolveRequestTenantOrNull();
  if (!ctx) return { items: [], unread: 0 };
  return withTenant(ctx, async () => {
    await connectDB();
    const Notification = await currentModel(NotificationModel);
    const now = Date.now();
    const key = genKey();
    if (now - (lastGen.get(key) ?? 0) > GEN_THROTTLE_MS) {
      if (lastGen.size >= GEN_KEYS_MAX) lastGen.clear();
      lastGen.set(key, now);
      try {
        await generateNotifications();
      } catch (e) {
        // Don't break the bell, but make failures visible (this caught a silent
        // insertMany validation error during development).
        console.error('[notifications] generation failed:', e);
      }
    }
    const docs = (await Notification.find().sort({ read: 1, createdAt: -1 }).limit(40).lean()) as Array<Parameters<typeof serialize>[0]>;
    const unread = await Notification.countDocuments({ read: false });
    return { items: docs.map(serialize), unread };
  });
}

export async function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const Notification = await currentModel(NotificationModel);
    await Notification.updateOne({ _id: id }, { $set: { read: true } });
    return { ok: true };
  });
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const Notification = await currentModel(NotificationModel);
    await Notification.updateMany({ read: false }, { $set: { read: true } });
    return { ok: true };
  });
}

export async function dismissNotification(id: string): Promise<{ ok: boolean }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const Notification = await currentModel(NotificationModel);
    await Notification.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
    return { ok: true };
  });
}

export async function clearAllNotifications(): Promise<{ ok: boolean }> {
  await assertCanWrite();
  return withRequestTenant(async () => {
    await connectDB();
    const Notification = await currentModel(NotificationModel);
    await Notification.updateMany({}, { $set: { deletedAt: new Date() } });
    return { ok: true };
  });
}
