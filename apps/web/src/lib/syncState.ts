import 'server-only';
import { connectDB } from './db';
import { AppConfig } from '@/models/AppConfig';
import { currentModel } from './tenancy/connection';

/**
 * Records WHEN a push to the remote backend last succeeded (P48).
 *
 * Every path that successfully puts a file on the remote calls `markRemoteSync()`:
 * the one-shot SMB/FTP "Sync now", the batched OneDrive path, and the fire-and-forget
 * auto-mirror-on-verify. All three matter — recording only the manual button would make
 * a perfectly healthy auto-mirror look abandoned and fire a false alert every week,
 * which trains the user to ignore the one warning that matters.
 *
 * Reads and writes go straight to AppConfig with no cache: the value changes on a
 * successful upload and is read at most twice per request that cares (the alert sweep
 * and the Settings panel), so a cache would only add a staleness bug to a feature whose
 * entire subject is staleness.
 */

/** Stamp "the remote mirror is up to date as of now". Never throws — a failed stamp
 *  must not break an upload that already succeeded. */
export async function markRemoteSync(at: Date = new Date()): Promise<void> {
  try {
    await connectDB();
    const Config = await currentModel(AppConfig);
    await Config.updateOne({ key: 'singleton' }, { $set: { lastRemoteSyncAt: at } }, { upsert: true });
  } catch (err) {
    console.warn(`[syncState] could not record last sync: ${(err as Error).message}`);
  }
}

/** When the remote mirror was last successfully written, or null if it never was. */
export async function getLastRemoteSync(): Promise<Date | null> {
  try {
    await connectDB();
    const Config = await currentModel(AppConfig);
    const doc = (await Config.findOne({ key: 'singleton' }).select('lastRemoteSyncAt').lean()) as { lastRemoteSyncAt?: Date | string | null } | null;
    const v = doc?.lastRemoteSyncAt;
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}
