// SaaS CONTROL-PLANE — thin transactional-email abstraction. Only meaningful when
// SAAS_MODE is on; the self-hosted single-user app never sends account/workspace email.
//
// One entry point, `sendEmail({ to, subject, html })`, dispatches to whichever provider is
// configured via env:
//   RESEND_API_KEY → Resend HTTP API (dependency-free, uses fetch)  [WIRED]
//   SMTP_URL       → SMTP via nodemailer                            [NOT wired yet — needs
//                    the nodemailer dependency + a provider decision; see Needs-Achilleas]
//   neither        → no-op that logs to the console in non-production so local flows are
//                    still observable, and reports delivered:false.
//
// The pure helpers (provider resolution, from-address, html→text, message builders) carry
// no imports and are unit-tested. Only `sendEmail` reaches the network. Nothing here is
// imported by feature code — the reset + members SaaS routes are the only callers.

export type EmailMessage = { to: string; subject: string; html: string; text?: string };
export type SendResult = { delivered: boolean; provider: MailProvider; id?: string; error?: string };
export type MailProvider = 'resend' | 'smtp' | 'none';

type Env = Record<string, string | undefined>;

/**
 * Which provider the environment selects. Resend takes precedence (it is the wired one);
 * SMTP is recognised as intent but not yet deliverable (see mailerCanDeliver). Pure: env
 * is injectable for tests.
 */
export function resolveProvider(env: Env = process.env): MailProvider {
  if (env.RESEND_API_KEY) return 'resend';
  if (env.SMTP_URL) return 'smtp';
  return 'none';
}

/**
 * Whether a working delivery channel actually exists. Only Resend is wired today, so an
 * SMTP_URL alone counts as "configured intent" but NOT deliverable — which is exactly what
 * lets the reset-request route keep echoing the dev token until SMTP is wired. This is the
 * single source of truth behind resetDeliveryConfigured().
 */
export function mailerCanDeliver(env: Env = process.env): boolean {
  return resolveProvider(env) === 'resend';
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
