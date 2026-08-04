import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveProvider,
  mailerCanDeliver,
  mailWebhookUrl,
  mailWebhookToken,
  fromAddress,
  htmlToText,
  resetLinkUrl,
  resetEmail,
  invitedEmail,
  smtpOptions,
} from './mailer';

describe('resolveProvider', () => {
  it('picks resend when the key is present (precedence over webhook and smtp)', () => {
    expect(
      resolveProvider({ RESEND_API_KEY: 'x', MAIL_WEBHOOK_URL: 'https://h/e', SMTP_URL: 'smtp://h' })
    ).toBe('resend');
  });
  it('picks webhook over smtp when no resend key is set', () => {
    expect(resolveProvider({ MAIL_WEBHOOK_URL: 'https://h/e', SMTP_URL: 'smtp://h' })).toBe('webhook');
  });
  it('falls back to smtp when only SMTP_URL is set', () => {
    expect(resolveProvider({ SMTP_URL: 'smtp://h' })).toBe('smtp');
  });
  it('is none when nothing is configured', () => {
    expect(resolveProvider({})).toBe('none');
  });
});

describe('mailerCanDeliver', () => {
  it('is true for every wired provider', () => {
    expect(mailerCanDeliver({ RESEND_API_KEY: 'x' })).toBe(true);
    expect(mailerCanDeliver({ MAIL_WEBHOOK_URL: 'https://h/e' })).toBe(true);
    // SMTP counted as NOT deliverable while it was unimplemented. Now that it sends, leaving it
    // out would be the dangerous direction: reset/request would keep returning a live
    // password-reset token in its response body on a deployment that can actually email it.
    expect(mailerCanDeliver({ SMTP_URL: 'smtps://u:p@smtp.gmail.com:465' })).toBe(true);
  });
  it('is false only when nothing at all is configured', () => {
    expect(mailerCanDeliver({})).toBe(false);
  });

  it('agrees with resolveProvider, so the two cannot drift apart', () => {
    // This pair is the actual invariant: "a provider was selected" and "we can deliver" must mean
    // the same thing, or a route will make the wrong call about echoing secrets.
    for (const env of [
      { RESEND_API_KEY: 'x' },
      { MAIL_WEBHOOK_URL: 'https://h/e' },
      { SMTP_URL: 'smtps://u:p@h:465' },
      {},
    ]) {
      expect(mailerCanDeliver(env)).toBe(resolveProvider(env) !== 'none');
    }
  });
});

describe('mailWebhookUrl / mailWebhookToken', () => {
  it('reads and trims the webhook url; empty when unset', () => {
    expect(mailWebhookUrl({ MAIL_WEBHOOK_URL: '  https://h/e  ' })).toBe('https://h/e');
    expect(mailWebhookUrl({})).toBe('');
  });
  it('reads and trims the optional bearer token; empty when unset', () => {
    expect(mailWebhookToken({ MAIL_WEBHOOK_TOKEN: '  tok  ' })).toBe('tok');
    expect(mailWebhookToken({})).toBe('');
  });
});

describe('fromAddress', () => {
  it('uses MAIL_FROM when set', () => {
    expect(fromAddress({ MAIL_FROM: 'A <a@b.com>' })).toBe('A <a@b.com>');
  });
  it('falls back to a branded default when blank/absent', () => {
    expect(fromAddress({ MAIL_FROM: '   ' })).toBe('Pharos <no-reply@ph-aros.com>');
    expect(fromAddress({})).toBe('Pharos <no-reply@ph-aros.com>');
  });
});

describe('htmlToText', () => {
  it('strips tags, decodes basic entities, and collapses whitespace', () => {
    const out = htmlToText('<p>Hello &amp; <strong>world</strong></p><p>Bye</p>');
    expect(out).toBe('Hello & world\nBye');
  });
  it('handles empty input', () => {
    expect(htmlToText('')).toBe('');
  });
});

describe('resetLinkUrl', () => {
  it('points at the route that actually exists', () => {
    // It pointed at /reset until 2026-08-04, which is a 404: the page is at
    // /account/reset/confirm. Undetected for as long as no reset email could be delivered, then
    // the very first real one led straight to "This page could not be found".
    expect(resetLinkUrl('https://app.ph-aros.com', 'a b/c')).toBe(
      'https://app.ph-aros.com/account/reset/confirm?token=a%20b%2Fc'
    );
  });
  it('strips a trailing slash from the base', () => {
    expect(resetLinkUrl('https://x.com/', 'tok')).toBe('https://x.com/account/reset/confirm?token=tok');
  });
});

describe('message builders', () => {
  it('resetEmail embeds the link and has a subject', () => {
    const m = resetEmail('https://x.com/reset?token=tok');
    expect(m.subject).toMatch(/reset/i);
    expect(m.html).toContain('https://x.com/reset?token=tok');
  });
  it('invitedEmail names the workspace and falls back when blank', () => {
    expect(invitedEmail('acme').subject).toContain('acme');
    expect(invitedEmail('acme').html).toContain('acme');
    expect(invitedEmail('   ').subject).toContain('a Pharos workspace');
  });
});

// ── SMTP delivery ───────────────────────────────────────────────────────────────────────────
//
// SMTP is what this deployment actually uses (Gmail + an App Password), so the branch that was a
// `console.warn` stub until 2026-08-04 needs real coverage. nodemailer is mocked at the module
// boundary: these tests are about what the mailer hands it and what it does with the outcome,
// not about SMTP itself.
describe('sendEmail over SMTP', () => {
  const sendMail = vi.fn(async (_m: Record<string, unknown>) => ({ messageId: '<abc@gmail.com>' }));
  const createTransport = vi.fn(() => ({ sendMail }));

  beforeEach(() => {
    vi.resetModules();
    sendMail.mockClear();
    createTransport.mockClear();
    vi.doMock('nodemailer', () => ({ createTransport, default: { createTransport } }));
  });

  afterEach(() => {
    vi.doUnmock('nodemailer');
    vi.unstubAllEnvs();
  });

  async function send(msg = { to: 'a@b.com', subject: 'Hi', html: '<p>Body</p>' }) {
    const mod = await import('./mailer');
    return mod.sendEmail(msg);
  }

  it('builds the transport from SMTP_URL and reports the message id', async () => {
    vi.stubEnv('SMTP_URL', 'smtps://user:pass@smtp.gmail.com:465');

    const res = await send();

    expect(createTransport).toHaveBeenCalledWith('smtps://user:pass@smtp.gmail.com:465');
    expect(res).toMatchObject({ delivered: true, provider: 'smtp', id: '<abc@gmail.com>' });
  });

  it('always sends a plain-text alternative, derived from the html when none is given', async () => {
    // A transactional email with no text part lands in spam far more often, and the html→text
    // fallback already exists — this pins that SMTP uses it like the other providers do.
    vi.stubEnv('SMTP_URL', 'smtps://u:p@h:465');

    await send();

    const msg = sendMail.mock.calls[0][0] as { text?: string; html?: string };
    expect(msg.text).toBeTruthy();
    expect(msg.text).toContain('Body');
  });

  it('a failing transport is reported, never thrown', async () => {
    // Signup, invites and password resets all send fire-and-forget: a mail outage must not take
    // down the request that triggered it.
    vi.stubEnv('SMTP_URL', 'smtps://u:p@h:465');
    sendMail.mockRejectedValueOnce(new Error('535 auth failed'));

    const res = await send();

    expect(res.delivered).toBe(false);
    expect(res.provider).toBe('smtp');
    expect(res.error).toContain('535');
  });

  it('is not reached when a higher-precedence provider is configured', async () => {
    // Order matters: someone who sets both must get the managed provider, not a surprise SMTP send.
    vi.stubEnv('SMTP_URL', 'smtps://u:p@h:465');
    vi.stubEnv('MAIL_WEBHOOK_URL', 'https://relay.example/e');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'w1' }), { status: 200 }),
    );

    const res = await send();

    expect(res.provider).toBe('webhook');
    expect(createTransport).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ── SMTP configuration ──────────────────────────────────────────────────────────────────────
describe('smtpOptions', () => {
  it('prefers discrete vars over SMTP_URL, because an email username breaks a URL', () => {
    // `achilleas@gmail.com:pass@smtp.gmail.com` has TWO '@' and parsers split on the wrong one.
    // The failure surfaces as an auth error, which sends you hunting for a wrong password.
    const opts = smtpOptions({
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_USER: 'someone@gmail.com',
      SMTP_PASS: 'app-password',
      SMTP_URL: 'smtps://ignored@example.com:x@other:465',
    }) as Record<string, unknown>;

    expect(opts.host).toBe('smtp.gmail.com');
    expect(opts.auth).toEqual({ user: 'someone@gmail.com', pass: 'app-password' });
  });

  it('VERIFIES the server certificate and floors TLS at 1.2', () => {
    // Accepting any certificate would hand both the credentials and the contents of every email
    // to anyone sitting in the middle, and password-reset links travel this path.
    const opts = smtpOptions({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'u', SMTP_PASS: 'p' }) as {
      tls: { rejectUnauthorized: boolean; minVersion: string };
    };

    expect(opts.tls.rejectUnauthorized).toBe(true);
    expect(opts.tls.minVersion).toBe('TLSv1.2');
  });

  it('465 is implicit TLS; 587 must still REQUIRE the upgrade rather than fall back to plaintext', () => {
    const implicit = smtpOptions({ SMTP_HOST: 'h', SMTP_PORT: '465' }) as Record<string, unknown>;
    const starttls = smtpOptions({ SMTP_HOST: 'h', SMTP_PORT: '587' }) as Record<string, unknown>;

    expect(implicit.secure).toBe(true);
    expect(starttls.secure).toBe(false);
    // Without requireTLS, a server that simply does not offer STARTTLS gets the password in clear.
    expect(starttls.requireTLS).toBe(true);
  });

  it('defaults to port 465 and drops auth entirely when no user is set', () => {
    const opts = smtpOptions({ SMTP_HOST: 'relay.internal' }) as Record<string, unknown>;
    expect(opts.port).toBe(465);
    expect(opts.auth).toBeUndefined();
  });

  it('falls back to the URL form when only SMTP_URL is given, and to null when nothing is', () => {
    expect(smtpOptions({ SMTP_URL: '  smtps://u:p@h:465  ' })).toBe('smtps://u:p@h:465');
    expect(smtpOptions({})).toBeNull();
  });
});
