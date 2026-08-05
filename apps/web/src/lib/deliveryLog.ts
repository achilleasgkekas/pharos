import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';
import { currentModel } from './tenancy/connection';
import type { DeliveryLogEntry } from './deliveryLog.shared';
import { DELIVERY_LOG_CAP, appendCapped, normalizeDeliveryLog, pruneLogKeys } from './deliveryLog.shared';

/**
 * Persisted per-channel delivery history (P80). Until now a failed outbound
 * delivery left no trace anywhere, so a user only discovered a missed alert by
 * accident. Every dispatch appends one capped row per channel to
 * AppConfig.deliveryLog (a map `notifier:<id>` / `webhook:<id>` → newest-last
 * rows), rendered under each channel in Settings → Notifications.
 *
 * Deliberately small and bounded: DELIVERY_LOG_CAP rows per channel, a hard cap
 * on the number of keys, and one read + one write per dispatch (not per channel).
 * Pure helpers live in deliveryLog.shared.ts so the client bundle can render the
 * rows without pulling Mongoose in.
 */

export type { DeliveryLogEntry };
export { DELIVERY_LOG_CAP };

/** Read the whole log map (tenant-scoped, like every other AppConfig read here). */
export async function getDeliveryLog(): Promise<Record<string, DeliveryLogEntry[]>> {
  await connectDB();
  const Config = await currentModel(AppConfig);
  const doc = await Config.findOne({ key: 'singleton' }).select('deliveryLog').lean();
  return normalizeDeliveryLog(doc?.deliveryLog);
}

/**
 * Append one row per delivered channel in a SINGLE read+write, then re-cap.
 * Never throws and never rejects: bookkeeping must not be able to break (or even
 * slow down the failure path of) an actual delivery.
 */
export async function recordDeliveries(entries: [string, DeliveryLogEntry][]): Promise<void> {
  if (entries.length === 0) return;
  try {
    await connectDB();
    const Config = await currentModel(AppConfig);
    const doc = await Config.findOne({ key: 'singleton' }).select('deliveryLog').lean();
    const next = normalizeDeliveryLog(doc?.deliveryLog);
    for (const [key, entry] of entries) next[key] = appendCapped(next[key] ?? [], entry);
    await Config.updateOne({ key: 'singleton' }, { $set: { deliveryLog: pruneLogKeys(next) } }, { upsert: true });
  } catch {
    // Logging is best-effort; a delivery that worked must not report failure because
    // the audit write did not.
  }
}
