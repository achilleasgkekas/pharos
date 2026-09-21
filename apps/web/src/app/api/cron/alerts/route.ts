import { NextResponse } from 'next/server';
import { checkCronAuth } from '@/lib/cronAuth';
import { runAlertChecks } from '@/app/settings/actions';
import { recordCronRun } from '@/lib/cronHeartbeat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/alerts
 *
 * Scheduler entry point for the self-hosted alert engine (P81).
 *
 * The alert scan itself has been shipped for a long time: `runAlertChecks()` covers deals,
 * installments due, warranties, return windows, price hikes, trials, gift cards, bills and
 * exceeded budgets, and fans the summary out to every configured notifier (ntfy / Discord /
 * Slack / Telegram / webhooks) and the in-app bell. What was
 * missing is a way to RUN it without a human: the only call site was the "Check & notify now"
 * button in Settings, so an instance nobody opens for months never sent a single alert, no
 * matter how it was configured. This route closes that gap; the button stays exactly as it is
 * and simply stops being the only trigger.
 *
 * Protected by the shared CRON_SECRET bearer (fail-closed 500 when unset), not a session,
 * since a scheduler calls it. Cadence is the operator's, not ours: point any cron at it.
 *
 * Calls `runAlertChecks({ dedupe: true })` (P82): "point any cron at it" means an unresolved
 * warranty/bill/deal would otherwise repeat the identical outbound push on every tick — dedupe
 * filters the outbound message down to what's new/changed since the last successful send. The
 * in-app bell and the "Check & notify now" button are unaffected (the bell has its own separate
 * per-item memory; the button always calls runAlertChecks() with no args, i.e. dedupe off).
 */
export async function POST(req: Request) {
  const fail = checkCronAuth(req);
  if (fail) {
    return NextResponse.json({ error: fail.error }, { status: fail.status });
  }

  try {
    const { sent, summary } = await runAlertChecks({ dedupe: true });
    await recordCronRun('alerts'); // heartbeat for the System-status "Scheduled tasks" check
    // `sent: false` with an "All clear" summary is a healthy run, not a failure — the cron
    // log should be able to tell "nothing to report" apart from "the scan blew up".
    return NextResponse.json({ ok: true, sent, summary });
  } catch (err) {
    // Surface the reason: the only caller holds CRON_SECRET, and a cron that can only ever
    // print "500" is undebuggable from the crontab log.
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message.slice(0, 300) }, { status: 500 });
  }
}
