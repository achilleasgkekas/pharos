'use server';
import type { Model } from 'mongoose';
import { connectDB } from '@/lib/db';
import { AppConfig } from '@/models/AppConfig';
import { withRequestTenant } from '@/lib/tenancy/request';
import { currentModel } from '@/lib/tenancy/connection';
import { saasMode } from '@/lib/tenancy/saasMode';
import { assertCanWrite } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import {
  appVersion,
  updateCheckRepo,
  releasesUrl,
  fetchLatestVersion,
  fetchReleaseNotes,
  isUpdateAvailable,
  checkIsDue,
} from '@/lib/versionCheck';

/**
 * Settings → About: "you are running X, Y is out" for self-hosters (P40).
 *
 * Kept in its own actions file rather than the 2000-line settings/actions.ts, matching
 * calendarFeedActions / mcpActions / sampleDataActions.
 */

function scoped<T>(model: Model<T>): Promise<Model<T>> {
  return withRequestTenant(() => currentModel(model));
}

export type UpdateStatus = {
  version: string; // what this build is
  latest: string; // newest published release, '' when unknown
  updateAvailable: boolean;
  enabled: boolean; // the opt-out toggle
  supported: boolean; // false on SaaS, where "update" is meaningless
  checkedAt: string; // ISO of the last attempt, '' when never
  releasesUrl: string;
  notes: string; // release-notes body for `latest` (P88), '' when none / not fetched
};

type ConfigDoc = {
  updateCheckEnabled?: boolean;
  updateCheckAt?: Date | null;
  updateCheckLatest?: string;
  updateCheckNotes?: string;
};

function idle(over: Partial<UpdateStatus> = {}): UpdateStatus {
  return {
    version: appVersion(),
    latest: '',
    updateAvailable: false,
    enabled: false,
    supported: true,
    checkedAt: '',
    releasesUrl: releasesUrl(),
    notes: '',
    ...over,
  };
}

/**
 * Current status, refreshing from the registry at most once a day.
 *
 * `force` (the "Check now" button) skips the cache — otherwise someone who has just
 * opened a firewall would wait up to 24h to find out it worked.
 */
export async function getUpdateStatus(force = false): Promise<UpdateStatus> {
  // On the managed SaaS every customer is always on the deployed build; there is no
  // image for them to pull and nothing they could do with the answer.
  if (saasMode()) return idle({ supported: false });

  try {
    await connectDB();
    const Config = await scoped(AppConfig);
    const cfg = ((await Config.findOne({ key: 'singleton' }).lean()) ?? {}) as ConfigDoc;
    const enabled = cfg.updateCheckEnabled !== false; // default on, opt-OUT
    if (!enabled) return idle({ enabled: false });

    let latest = String(cfg.updateCheckLatest ?? '');
    let checkedAt = cfg.updateCheckAt ?? null;
    let notes = String(cfg.updateCheckNotes ?? '');

    if (force || checkIsDue(checkedAt)) {
      const found = await fetchLatestVersion();
      const now = new Date();
      const set: Record<string, unknown> = { updateCheckAt: now };
      // A failed check still stamps the attempt (so a firewalled instance backs off for
      // a day instead of calling out on every settings load) but must NOT wipe the last
      // real answer it had.
      if (found) {
        set.updateCheckLatest = found;
        latest = found;
        // P88: refresh the "What's new" body for the resolved latest, on the same 24h
        // cadence. Best-effort ('' on any failure) and cached, so a rate-limited GitHub
        // API just leaves the banner's external link as the fallback.
        notes = await fetchReleaseNotes(found);
        set.updateCheckNotes = notes;
      }
      await Config.updateOne({ key: 'singleton' }, { $set: set }, { upsert: true });
      checkedAt = now;
    }

    const version = appVersion();
    return {
      version,
      latest,
      updateAvailable: isUpdateAvailable(version, latest || null),
      enabled: true,
      supported: true,
      checkedAt: checkedAt ? new Date(checkedAt).toISOString() : '',
      releasesUrl: releasesUrl(updateCheckRepo()),
      notes,
    };
  } catch {
    // Best-effort by design: a broken check shows the version and stays quiet.
    return idle({ enabled: true });
  }
}

/** The opt-out. Turning it off also drops the cached answer, so nothing lingers in the UI. */
export async function setUpdateCheckEnabled(value: boolean): Promise<{ ok: boolean }> {
  await assertCanWrite();
  try {
    await connectDB();
    const Config = await scoped(AppConfig);
    const set: Record<string, unknown> = { updateCheckEnabled: value };
    if (!value) {
      set.updateCheckLatest = '';
      set.updateCheckAt = null;
      set.updateCheckNotes = '';
    }
    await Config.updateOne({ key: 'singleton' }, { $set: set }, { upsert: true });
    revalidatePath('/settings');
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
