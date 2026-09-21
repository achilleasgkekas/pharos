import { NextResponse } from 'next/server';
import { checkCronAuth } from '@/lib/cronAuth';
import { runPriceScrape } from '@/app/items/actions';
import { recordCronRun } from '@/lib/cronHeartbeat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/prices
 *
 * Scheduler entry point for the 6-hourly price scraper.
 *
 * The scrape itself is `runPriceScrape()`: it re-checks every tracked item's store links,
 * updates each link's price + a price-history point, and recomputes the headline price —
 * the same fetch+parse as the per-item "refresh prices" button, fanned out over the whole
 * inventory. What was missing was a way to RUN it without a human: the Settings copy and the
 * "Search prices" modal both promise the picks are "re-checked every 6 hours", but the only
 * trigger was the manual button, so an instance nobody opens re-priced nothing. This route
 * closes that gap; point a cron at it (see deploy/README.md — 0-star-slash-6 is the intended
 * cadence). Run it a little before the alert cron so deal/price-hike alerts read fresh prices.
 *
 * Protected by the shared CRON_SECRET bearer (fail-closed 500 when unset), not a session,
 * since a scheduler calls it. The response carries the per-run counts (scanned, itemsChanged,
 * linksChecked, drops, errors) so a crontab log can tell a healthy quiet pass from a crash.
 */
export async function POST(req: Request) {
  const fail = checkCronAuth(req);
  if (fail) {
    return NextResponse.json({ error: fail.error }, { status: fail.status });
  }

  try {
    const result = await runPriceScrape();
    await recordCronRun('prices'); // heartbeat for the System-status "Scheduled tasks" check
    return NextResponse.json(result); // already { ok: true, scanned, itemsChanged, ... }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message.slice(0, 300) }, { status: 500 });
  }
}
