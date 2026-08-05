// Trial-lapse SWEEP — the impure runner that closes the loop opened by increments 38/39.
// Increment 39 gave the PURE decision core (`evaluateTrialLapse`, `planTrialLapses`,
// `lapsedTrialFilter`); this module is the actual 6-hourly job Achilleas signed off in D4:
//
//   1. WARN — trialing tenants whose bounded trial ends within WARN_BEFORE_DAYS get exactly
//      ONE dunning email ("your trial ends in N days"). Idempotent via `Tenant.trialWarnEmailedAt`:
//      once delivered we stamp it, so the tenant is never warned twice. Skipped wholesale when no
//      mail provider can deliver (self-hoster without mail → nothing to send, no wasted work).
//   2. LAPSE — trialing tenants whose trial has PASSED its end get `status:'suspended'`
//      (a recoverable dunning hold) + a `workspace.suspended` audit row. The rest of the stack
//      already understands `suspended` (workspaceStatusError blocks it; the owner reactivates
//      by resolving billing).
//
// Split into PURE helpers (warn-window math + email body + query filters — unit-tested) and one
// impure `runTrialLapseSweep` (loads candidates, mails, mutates — per-tenant try/catch isolation,
// mirrors the untested-but-typed shape of dbStats.sampleAllTenants). A fixed `now` is injectable
// everywhere for deterministic tests.
//
// SaaS-only: `runTrialLapseSweep` is a no-op when SAAS_MODE is off — the self-hosted (AGPL) app
// never creates Tenant docs, never trials, never suspends. Zero effect on the single-user path.
import { evaluateTrial, type TrialInput } from './trial';
import { evaluateTrialLapse, lapsedTrialFilter } from './trialLapse';
import { planStatusChange } from './statusAudit';
import { htmlToText } from '@/lib/tenancy/mailer';

/**
 * How many days before a trial's end the single dunning warning goes out. PLACEHOLDER-ish:
 * Achilleas fixed "3 days before" in D4; kept as a named constant so a later product tweak is
 * one edit. The warn window and the lapse instant are mutually exclusive (warn: end still in the
 * future; lapse: end at/before now), so a tenant is never warned and suspended in the same run.
 */
export const WARN_BEFORE_DAYS = 3;

/**
 * Is this tenant inside the pre-suspend warning window? True only for a trialing tenant with a
 * BOUNDED end that is still in the future (not yet expired) and `daysLeft <= WARN_BEFORE_DAYS`.
 *
 * - non-trialing            → false (nothing to warn about).
 * - open-ended trial        → false (no `daysLeft`; matches "open-ended never lapses").
 * - expired trial           → false (that path SUSPENDS, it doesn't warn).
 * - ends within the window  → true.
 *
 * Idempotency (already-warned) is deliberately NOT handled here — this is pure time-window math.
 * The `trialWarnEmailedAt: null` guard lives in `trialWarningFilter`/the runner.
 */
export function shouldWarnTrial(input: TrialInput, now: Date = new Date()): boolean {
  if (input.status !== 'trialing') return false;
  const { onTrial, expired, daysLeft } = evaluateTrial(input, now);
  if (!onTrial || expired || daysLeft == null) return false;
  return daysLeft <= WARN_BEFORE_DAYS;
}

export type WarnCandidate = TrialInput & { id: string };

/**
 * Batch planner mirroring `planTrialLapses`: given tenant-like rows, return the ids that should
 * receive the dunning warning now. PURE — the caller does the DB read + the mail send. Rows with
 * a missing/blank id are skipped defensively.
 */
export function planTrialWarnings(candidates: WarnCandidate[], now: Date = new Date()): string[] {
  if (!Array.isArray(candidates)) return [];
  const ids: string[] = [];
  for (const c of candidates) {
    if (c && typeof c.id === 'string' && c.id && shouldWarnTrial(c, now)) ids.push(c.id);
  }
  return ids;
}

/**
 * MongoDB filter narrowing a Tenant scan to un-warned tenants inside the warning window:
 * trialing, not yet warned (`trialWarnEmailedAt: null`), with `trialEndsAt` strictly after `now`
 * (not yet expired → the lapse filter, which is `$lte now`, owns those) and at/before `now +
 * WARN_BEFORE_DAYS`. Open-ended trials (null `trialEndsAt`) do NOT match a `$gt`/`$lte`-a-Date
 * range, matching `shouldWarnTrial`'s "open-ended → no warning".
 */
export function trialWarningFilter(now: Date = new Date()): Record<string, unknown> {
  const horizon = new Date(now.getTime() + WARN_BEFORE_DAYS * 24 * 60 * 60 * 1000);
  return {
    status: 'trialing',
    trialWarnEmailedAt: null,
    trialEndsAt: { $gt: now, $lte: horizon },
  };
}

/**
 * Build the dunning warning email body. PURE — no send. `daysLeft` is clamped to a sensible
 * range for the copy so a garbage value never produces "-2 days" or "in 999 days".
 */
export function dunningEmail(workspaceName: string, daysLeft: number): { subject: string; html: string } {
  const name = (workspaceName || 'your Pharos workspace').trim() || 'your Pharos workspace';
  const d = Number.isFinite(daysLeft) ? Math.min(WARN_BEFORE_DAYS, Math.max(1, Math.round(daysLeft))) : WARN_BEFORE_DAYS;
  const when = d === 1 ? 'tomorrow' : `in ${d} days`;
  return {
    subject: `Your ${name} trial ends ${when}`,
    html:
      `<p>Your free trial of <strong>${name}</strong> on Pharos ends ${when}.</p>` +
      `<p>To keep your workspace active, add a billing method before then. ` +
      `If the trial lapses, the workspace is paused (your data is kept) until you subscribe.</p>` +
      `<p>Sign in to your workspace settings to add billing.</p>`,
  };
}

export type TrialSweepResult = {
  /** False when SAAS_MODE is off (the sweep didn't run at all). */
  swept: boolean;
  /** Tenants warned this run (email delivered + stamp written). */
  warned: number;
  /** Tenants in the warn window whose email failed to deliver (not stamped, retried next run). */
  warnFailed: number;
  /** Tenants moved to `suspended` this run. */
  suspended: number;
  /** Lapse candidates whose suspend threw (isolated, retried next run). */
  suspendFailed: number;
};

const ZERO_RESULT: TrialSweepResult = {
  swept: false,
  warned: 0,
  warnFailed: 0,
  suspended: 0,
  suspendFailed: 0,
};

/** Active-owner email addresses for a tenant, resolved via Membership → Account. Best-effort.
 * Exported because the suspended-expiry sweep (lib/tenancy/suspendedSweep.ts) needs exactly the
 * same "who do we warn" answer; two copies of this would drift the day roles change. */
export async function ownerEmails(tenantId: string): Promise<string[]> {
  const { Membership } = await import('@/models/Membership');
  const { Account } = await import('@/models/Account');
  const memberships = await Membership.find({ tenant: tenantId, role: 'owner', status: 'active' })
    .select('account')
    .lean();
  const accountIds = memberships.map((m) => m.account).filter(Boolean);
  if (!accountIds.length) return [];
  const accounts = await Account.find({ _id: { $in: accountIds } })
    .select('email')
    .lean();
  return accounts.map((a) => a.email).filter((e): e is string => typeof e === 'string' && !!e);
}

/**
 * Run the trial-lapse sweep once. SaaS-only (no-op + `swept:false` when SAAS_MODE off). Intended
 * to be called by the in-process 6-hourly scheduler (D4) AND on-demand by the CRON route. Each
 * tenant is isolated in try/catch so one bad row never aborts the batch. Warnings are skipped
 * entirely when no mail provider can deliver. `now` is injectable for tests.
 */
export async function runTrialLapseSweep(now: Date = new Date()): Promise<TrialSweepResult> {
  const { saasMode } = await import('@/lib/tenancy/saasMode');
  if (!saasMode()) return { ...ZERO_RESULT };

  const { connectDB } = await import('@/lib/db');
  const { Tenant } = await import('@/models/Tenant');
  const { recordAudit, auditCtx } = await import('@/lib/tenancy/audit');
  const { sendEmail, mailerCanDeliver } = await import('@/lib/tenancy/mailer');
  await connectDB();

  const result: TrialSweepResult = { ...ZERO_RESULT, swept: true };

  // 1. WARN — only if a delivery channel exists; otherwise there is nothing to send.
  if (mailerCanDeliver()) {
    const warnCandidates = await Tenant.find(trialWarningFilter(now))
      .select('slug name trialEndsAt status')
      .lean();
    for (const t of warnCandidates) {
      try {
        const id = String(t._id);
        const emails = await ownerEmails(id);
        if (!emails.length) continue; // nobody to warn; leave un-stamped (owner may be added later)
        const daysLeft = evaluateTrial({ status: t.status, trialEndsAt: t.trialEndsAt }, now).daysLeft;
        const body = dunningEmail(t.name, daysLeft ?? WARN_BEFORE_DAYS);
        let delivered = false;
        for (const email of emails) {
          const r = await sendEmail({ to: email, subject: body.subject, html: body.html, text: htmlToText(body.html) });
          delivered = delivered || r.delivered;
        }
        if (delivered) {
          // Idempotent stamp: guard on status:'trialing' so a concurrent status change wins.
          await Tenant.updateOne({ _id: id, status: 'trialing' }, { $set: { trialWarnEmailedAt: now } });
          result.warned += 1;
        } else {
          result.warnFailed += 1; // transient provider failure → retry next run (not stamped)
        }
      } catch (err) {
        result.warnFailed += 1;
        console.error('[trialSweep] warn failed', t?._id, err);
      }
    }
  }

  // 2. LAPSE — trialing tenants past their end → suspended + audit.
  const lapseCandidates = await Tenant.find(lapsedTrialFilter(now))
    .select('slug status trialEndsAt')
    .lean();
  for (const t of lapseCandidates) {
    try {
      const decision = evaluateTrialLapse({ status: t.status, trialEndsAt: t.trialEndsAt }, now);
      if (!decision.shouldLapse || !decision.nextStatus) continue; // belt+braces vs the filter
      const id = String(t._id);
      // status:'trialing' guard makes the transition race-safe (skip if already changed).
      // planStatusChange owns what a suspension implies (start the 30-day keep-window at the
      // instant of the suspension, clear any stale "already warned" stamp), so this path cannot
      // drift from the webhook's and the admin console's.
      const res = await Tenant.updateOne(
        { _id: id, status: 'trialing' },
        { $set: planStatusChange({ prev: 'trialing', next: decision.nextStatus }, now) }
      );
      if (res.modifiedCount > 0) {
        await recordAudit(auditCtx(id), {
          action: 'workspace.suspended',
          target: t.slug ?? null,
          meta: { reason: decision.reason },
        });
        result.suspended += 1;
      }
    } catch (err) {
      result.suspendFailed += 1;
      console.error('[trialSweep] suspend failed', t?._id, err);
    }
  }

  return result;
}
