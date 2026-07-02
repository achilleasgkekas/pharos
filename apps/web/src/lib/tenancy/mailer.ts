// SaaS CONTROL-PLANE — thin transactional-email abstraction. Only meaningful when
// SAAS_MODE is on; the self-hosted single-user app never sends account/workspace email.
//
// One entry point, `sendEmail({ to, subject, html })`, dispatches to whichever provider is
// configured via env:
//   RESEND_API_KEY   → Resend HTTP API (dependency-free, uses fetch)      [WIRED]
//   MAIL_WEBHOOK_URL → generic email webhook (Zapier / n8n / self-hosted  [WIRED]
//                      relay): POST the message as JSON and let the endpoint
//                      relay it. Dependency-free, no managed-provider lock-in,
//                      the self-hoster's escape hatch. Optional bearer via
//                      MAIL_WEBHOOK_TOKEN.
//   SMTP_URL         → SMTP via nodemailer  [NOT wired yet: needs the nodemailer
//                      dependency + a provider decision (see Needs-Achilleas).
//                      Prefer MAIL_WEBHOOK_URL until then, it needs no new dependency.]
//   none             → no-op that logs to the console in non-production so local flows are
//                      still observable, and reports delivered:false.
//
// The pure helpers (provider resolution, from-address, html→text, message builders) carry
// no imports and are unit-tested. Only `sendEmail` reaches the network. Nothing here is
// imported by feature code — the reset + members SaaS routes are the only callers.

export type EmailMessage = { to: string; subject: string; html: string; text?: string };
export type SendResult = { delivered: boolean; provider: MailProvider; id?: string; error?: string };
export type MailProvider = 'resend' | 'webhook' | 'smtp' | 'none';

type Env = Record<string, string | undefined>;

/**
 * Which provider the environment selects. Resend takes precedence (managed, wired), then the
 * generic MAIL_WEBHOOK_URL (also wired, dependency-free), then SMTP (recognised as intent but
 * not yet deliverable, see mailerCanDeliver). Pure: env is injectable for tests.
 */
export function resolveProvider(env: Env = process.env): MailProvider {
  if (env.RESEND_API_KEY) return 'resend';
  if (env.MAIL_WEBHOOK_URL) return 'webhook';
  if (env.SMTP_URL) return 'smtp';
  return 'none';
}

/**
 * Whether a working delivery channel actually exists. Resend and the generic webhook are
 * both wired; an SMTP_URL alone counts as "configured intent" but NOT deliverable, which is
 * exactly what lets the reset-request route keep echoing the dev token until SMTP is wired.
 * This is the single source of truth behind resetDeliveryConfigured().
 */
export function mailerCanDeliver(env: Env = process.env): boolean {
  const p = resolveProvider(env);
  return p === 'resend' || p === 'webhook';
}

/** The generic outbound-email webhook endpoint (Zapier / n8n / self-hosted relay). Empty
 *  when unset. Dependency-free delivery for self-hosters who don't want a managed provider:
 *  we POST the message as JSON and the endpoint relays it wherever it likes. */
export function mailWebhookUrl(env: Env = process.env): string {
  return (env.MAIL_WEBHOOK_URL || '').trim();
}

/** Optional bearer token sent as `Authorization: Bearer …` on the webhook POST so the relay
 *  can authenticate the caller. Empty when unset (no auth header is added). */
export function mailWebhookToken(env: Env = process.env): string {
  return (env.MAIL_WEBHOOK_TOKEN || '').trim();
}

/** The From address for outbound mail. Configurable; sensible branded default. */
export function fromAddress(env: Env = process.env): string {
  return (env.MAIL_FROM || '').trim() || 'Pharos <no-reply@ph-aros.com>';
}

/** Crude HTML→plaintext for the text/* alternative: drop tags, decode a few entities,
 *  collapse whitespace. Good enough for the short transactional bodies we send. */
export function htmlToText(html: string): string {
  return (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>(?=)/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The user-facing reset link a request email points at (a future /reset page reads the
 *  token and posts it to /api/saas/account/reset/confirm). `base` should be normalized. */
export function resetLinkUrl(base: string, token: string): string {
  const b = (base || '').replace(/\/+$/, '');
  return `${b}/reset?token=${encodeURIComponent(token)}`;
}

/** Build the password-reset email body. Pure — no send. */
export function resetEmail(link: string): { subject: string; html: string } {
  return {
    subject: 'Reset your Pharos password',
    html:
      `<p>Someone requested a password reset for your Pharos account.</p>` +
      `<p><a href="${link}">Reset your password</a></p>` +
      `<p>This link expires in one hour. If you did not request this, you can ignore this email.</p>`,
  };
}

/** The user-facing verification link a request email points at (a future /verify page reads
 *  the token and posts it to /api/saas/account/verify/confirm). `base` should be normalized. */
export function verifyLinkUrl(base: string, token: string): string {
  const b = (base || '').replace(/\/+$/, '');
  return `${b}/verify?token=${encodeURIComponent(token)}`;
}

/** Build the email-verification email body. Pure — no send. */
export function verifyEmail(link: string): { subject: string; html: string } {
  return {
    subject: 'Verify your Pharos email',
    html:
      `<p>Confirm this email address for your Pharos account.</p>` +
      `<p><a href="${link}">Verify your email</a></p>` +
      `<p>This link expires in 24 hours. If you did not create this account, you can ignore this email.</p>`,
  };
}

/** Build the "you were added to a workspace" notification body. Pure — no send. */
export function invitedEmail(workspaceName: string): { subject: string; html: string } {
  const name = (workspaceName || 'a Pharos workspace').trim() || 'a Pharos workspace';
  return {
    subject: `You've been added to ${name} on Pharos`,
    html:
      `<p>You now have access to the <strong>${name}</strong> workspace on Pharos.</p>` +
      `<p>Sign in with your account to get started.</p>`,
  };
}

/** The user-facing invite link a new-user invitation points at (a /signup page reads the
 *  token and posts it to /api/saas/invites/accept). `base` should be normalized. */
export function inviteLinkUrl(base: string, token: string): string {
  const b = (base || '').replace(/\/+$/, '');
  return `${b}/signup?invite=${encodeURIComponent(token)}`;
}

/** Build the "you're invited to a workspace" email body for a NOT-yet-registered address.
 *  Unlike invitedEmail (existing account added), this carries a signup link. Pure — no send. */
export function inviteEmail(link: string, workspaceName: string): { subject: string; html: string } {
  const name = (workspaceName || 'a Pharos workspace').trim() || 'a Pharos workspace';
  return {
    subject: `You're invited to ${name} on Pharos`,
    html:
      `<p>You've been invited to join the <strong>${name}</strong> workspace on Pharos.</p>` +
      `<p><a href="${link}">Accept the invitation</a> and create your account.</p>` +
      `<p>This link expires in 7 days. If you weren't expecting this, you can ignore this email.</p>`,
  };
}

/** POST a message to the Resend API. Network-touching; caller guarantees the key exists. */
async function sendViaResend(msg: EmailMessage, apiKey: string): Promise<SendResult> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromAddress(),
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text ?? htmlToText(msg.html),
      }),
    });
    if (!res.ok) {
      return { delivered: false, provider: 'resend', error: `resend_${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { delivered: true, provider: 'resend', id: data.id };
  } catch (err) {
    return { delivered: false, provider: 'resend', error: err instanceof Error ? err.message : 'send_failed' };
  }
}

/** POST a message as JSON to the generic email webhook. Network-touching; caller guarantees
 *  the url exists. Any 2xx response counts as delivered; the relay owns actual delivery. */
async function sendViaWebhook(msg: EmailMessage, url: string, token: string): Promise<SendResult> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: fromAddress(),
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text ?? htmlToText(msg.html),
      }),
    });
    if (!res.ok) {
      return { delivered: false, provider: 'webhook', error: `webhook_${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    const id = typeof data?.id === 'string' ? data.id : undefined;
    return { delivered: true, provider: 'webhook', id };
  } catch (err) {
    return { delivered: false, provider: 'webhook', error: err instanceof Error ? err.message : 'send_failed' };
  }
}

/**
 * Send a transactional email through the configured provider. Never throws — returns a
 * SendResult so callers can decide (e.g. the reset route echoes a dev token when nothing
 * was delivered). Best-effort by design.
 */
export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const provider = resolveProvider();

  if (provider === 'resend') {
    return sendViaResend(msg, process.env.RESEND_API_KEY as string);
  }

  if (provider === 'webhook') {
    return sendViaWebhook(msg, mailWebhookUrl(), mailWebhookToken());
  }

  if (provider === 'smtp') {
    // TODO(Needs-Achilleas): wire nodemailer once a provider is chosen. Until then SMTP_URL
    // is recognised but cannot deliver (mailerCanDeliver stays false), so no silent drop in
    // dev — the reset route still echoes the token.
    console.warn('[mailer] SMTP_URL is set but SMTP delivery is not wired yet; email not sent');
    return { delivered: false, provider: 'smtp', error: 'smtp_not_wired' };
  }

  // No provider configured. Log in non-production so local flows are observable, then report
  // undelivered (the reset route will fall back to its dev-token echo).
  if (process.env.NODE_ENV !== 'production') {
    console.info(`[mailer:dev] would send → to=${msg.to} subject=${JSON.stringify(msg.subject)}`);
  }
  return { delivered: false, provider: 'none' };
}
