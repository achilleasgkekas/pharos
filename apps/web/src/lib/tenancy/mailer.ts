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
 * Which provider the environment selects. Resend takes precedence (managed), then the generic
 * MAIL_WEBHOOK_URL (dependency-free), then SMTP. All three deliver. Pure: env is injectable.
 */
export function resolveProvider(env: Env = process.env): MailProvider {
  if (env.RESEND_API_KEY) return 'resend';
  if (env.MAIL_WEBHOOK_URL) return 'webhook';
  if (env.SMTP_HOST || env.SMTP_URL) return 'smtp';
  return 'none';
}

/** SMTP connection options assembled from the environment. PURE (env injectable), so the whole
 *  config decision is testable without a socket.
 *
 *  DISCRETE VARS ARE PREFERRED over SMTP_URL, and not by taste: the username here is an EMAIL
 *  ADDRESS, which contains an `@`. Inside a URL that produces `smtps://user@gmail.com:pass@host`
 *  with two `@` signs, and the parser splits on the wrong one — you get an authentication failure
 *  that looks like a wrong password and sends you hunting in the wrong place. Percent-encoding
 *  works but nobody remembers to do it. Separate fields cannot be encoded wrong.
 */
export function smtpOptions(env: Env = process.env): Record<string, unknown> | string | null {
  const host = (env.SMTP_HOST || '').trim();
  if (!host) {
    const url = (env.SMTP_URL || '').trim();
    return url || null;
  }
  const port = Number(env.SMTP_PORT) || 465;
  return {
    host,
    port,
    // 465 is implicit TLS; 587 starts plaintext and upgrades, so demand the upgrade rather than
    // silently continuing in the clear if the server does not offer STARTTLS.
    secure: port === 465,
    requireTLS: port !== 465,
    auth: env.SMTP_USER ? { user: (env.SMTP_USER || '').trim(), pass: env.SMTP_PASS || '' } : undefined,
    tls: {
      // Explicit, even though this is nodemailer's default. Accepting any certificate would mean
      // anyone able to sit between us and the mail server could take both the credentials and the
      // contents of every email we send, and password-reset links go through here. Stated in code
      // so a stray `?rejectUnauthorized=false` in a URL, or a future refactor, cannot quietly
      // relax it.
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    },
  };
}

/**
 * Whether a working delivery channel actually exists. All three providers are now wired, so this
 * is simply "something is configured".
 *
 * SMTP used to be excluded here, on purpose: it was recognised but unimplemented, and that
 * exclusion is what kept the reset-request route echoing its dev token instead of pretending an
 * email had gone out. Now that SMTP delivers, leaving it excluded would be the more dangerous
 * mistake — the route would keep returning a live password-reset token in its response body on a
 * deployment that can perfectly well email it. This is the single source of truth behind
 * resetDeliveryConfigured(), so it has to move in lockstep with what sendEmail can actually do.
 */
export function mailerCanDeliver(env: Env = process.env): boolean {
  return resolveProvider(env) !== 'none';
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
 * Send a message over SMTP. Network-touching; caller guarantees the URL exists.
 *
 * nodemailer is imported DYNAMICALLY so the module only loads when SMTP is actually the
 * configured provider. A self-hoster on Resend, on a webhook, or on nothing at all never pays
 * for it, and the Next standalone trace keeps it out of the runtime path it is not used on.
 *
 * GMAIL, which is what this is set up for: use an App Password (needs 2-Step Verification on
 * the account), strip the spaces Google displays it with, and note that Gmail REWRITES the From
 * header to the authenticated mailbox unless the address is a verified "send mail as" alias. So
 * MAIL_FROM must carry that same mailbox or the recipient sees a different sender than intended.
 * The free-account ceiling is around 500 messages a day, which is a beta-sized limit, not a
 * product-sized one.
 */
async function sendViaSmtp(msg: EmailMessage, config: Record<string, unknown> | string): Promise<SendResult> {
  try {
    const { createTransport } = await import('nodemailer');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transport = createTransport(config as any);
    const info = (await transport.sendMail({
      from: fromAddress(),
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text ?? htmlToText(msg.html),
    })) as { messageId?: string };
    return { delivered: true, provider: 'smtp', id: info?.messageId };
  } catch (err) {
    // Never throw: a mail failure must not take down the request that triggered it (signup,
    // invite, password reset all send fire-and-forget).
    return { delivered: false, provider: 'smtp', error: err instanceof Error ? err.message : 'send_failed' };
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
    const config = smtpOptions();
    if (!config) return { delivered: false, provider: 'smtp', error: 'smtp_not_configured' };
    return sendViaSmtp(msg, config);
  }

  // No provider configured. Log in non-production so local flows are observable, then report
  // undelivered (the reset route will fall back to its dev-token echo).
  if (process.env.NODE_ENV !== 'production') {
    console.info(`[mailer:dev] would send → to=${msg.to} subject=${JSON.stringify(msg.subject)}`);
  }
  return { delivered: false, provider: 'none' };
}
