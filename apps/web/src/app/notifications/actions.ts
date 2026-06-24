'use server';

import { connectDB } from '@/lib/db';
import { getAppSettings } from '@/lib/appSettings';
import { cur } from '@/lib/money';
import { Item } from '@/models/Item';
import { Statement } from '@/models/Statement';
import { Notification } from '@/models/Notification';
import { computeInstallmentPlans } from '@/lib/installments';
import type { SerializedStatement } from '@/types';

export type NotifKind = 'deal' | 'installment' | 'warranty' | 'system';

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
const AUTO_KINDS = ['deal', 'installment', 'warranty'] as const;

/** Recompute the live alerts (deals / warranties / installments-due) — the same
 *  three the ntfy check uses, but as structured payloads the bell can localize. */
async function computeAlerts(): Promise<Alert[]> {
  const s = await getAppSettings(); // also sets the currency symbol for cur()
  const now = Date.now();
  const alerts: Alert[] = [];

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

  return alerts;
}

/** Reconcile the Notification collection with the live alerts: insert new ones
 *  (unread), refresh still-active ones, soft-delete resolved ones, and never
 *  recreate a dismissed alert. Safe to call repeatedly. */
export async function generateNotifications(): Promise<void> {
  await connectDB();
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
// each time; alerts aren't time-critical to the minute.
let lastGen = 0;
const GEN_THROTTLE_MS = 10 * 60 * 1000;

export async function getNotifications(): Promise<{ items: SerializedNotification[]; unread: number }> {
  await connectDB();
  const now = Date.now();
  if (now - lastGen > GEN_THROTTLE_MS) {
    lastGen = now;
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
}

export async function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  await connectDB();
  await Notification.updateOne({ _id: id }, { $set: { read: true } });
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  await connectDB();
  await Notification.updateMany({ read: false }, { $set: { read: true } });
  return { ok: true };
}

export async function dismissNotification(id: string): Promise<{ ok: boolean }> {
  await connectDB();
  await Notification.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
  return { ok: true };
}

export async function clearAllNotifications(): Promise<{ ok: boolean }> {
  await connectDB();
  await Notification.updateMany({}, { $set: { deletedAt: new Date() } });
  return { ok: true };
}
