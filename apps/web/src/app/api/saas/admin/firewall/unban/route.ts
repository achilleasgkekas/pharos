import { NextRequest, NextResponse } from 'next/server';
import { saasGuard } from '@/lib/tenancy/saasApi';
import { requireSuperadmin } from '@/lib/tenancy/superadmin';
import { rateLimit, clientIp } from '@/lib/apiAuth';
import { readBody, strField } from '@/lib/apiBody';
import { recordAudit, auditCtx } from '@/lib/tenancy/audit';
import { requestUnban, isBanIp, isBanJail } from '@/lib/saas/f2b';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/saas/admin/firewall/unban — QUEUE an unban with the host's fail2ban bridge.
 * Body: `{ ip, jail? }` (jail defaults to sshd).
 *
 * This route writes a request FILE and nothing else. It does not talk to fail2ban, does not spawn
 * a process, and cannot ban anything — by design (ASK `pharos-cloud-guard-20260805-1525`). The
 * host script re-validates every field from scratch and is the only thing with the power to act,
 * so the worst outcome of a compromise here is that an address gets unbanned that had no way in
 * anyway (password auth is off on that box).
 *
 * Rate-limited on top of the operator gate. Not because superadmins are suspects, but because the
 * queue is a directory on the host: an accidental loop in a browser tab would otherwise fill it
 * faster than the once-a-minute drain empties it.
 *
 * Answers 202, never 200: the unban has been ASKED FOR, and will happen within a minute. Saying
 * "unbanned" here would be a claim this side is in no position to make.
 */
export async function POST(req: NextRequest) {
  return saasGuard(async () => {
    const gate = await requireSuperadmin();
    if ('response' in gate) return gate.response;
    const actor = gate.account.email;

    const limited = rateLimit(`saas-f2b-unban:${clientIp(req)}`);
    if (limited) return limited;

    const body = await readBody(req);
    const ip = strField(body, 'ip', '', true);
    const jail = strField(body, 'jail', 'sshd', true);

    // Validated here for a useful message; validated again, authoritatively, on the host.
    if (!isBanJail(jail)) {
      return NextResponse.json({ error: 'unknown jail' }, { status: 400 });
    }
    if (!isBanIp(ip)) {
      return NextResponse.json({ error: 'not a valid IP address' }, { status: 400 });
    }

    const result = await requestUnban(ip, jail);
    if (!result.ok) {
      // A missing/unwritable queue directory is a DEPLOYMENT fault (the bind-mount), not the
      // operator's input, so it must not read as "bad address" — 503, with the reason.
      const status = result.reason === 'write-failed' ? 503 : 400;
      return NextResponse.json({ error: result.detail }, { status });
    }

    // Audited AFTER the request is safely on disk, so the trail never claims an unban was
    // requested when the write failed. Carries the address and jail; there is nothing sensitive
    // in either, and an unban with no record of who asked is exactly what an audit trail is for.
    await recordAudit(auditCtx(null), {
      action: 'platform.firewall_unban_requested',
      actor,
      target: 'platform',
      meta: { ip, jail },
    });

    return NextResponse.json({ ok: true, queued: true, ip, jail }, { status: 202 });
  });
}
