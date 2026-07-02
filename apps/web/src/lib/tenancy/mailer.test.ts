import { describe, it, expect } from 'vitest';
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
  it('is true for the wired providers (resend and webhook)', () => {
    expect(mailerCanDeliver({ RESEND_API_KEY: 'x' })).toBe(true);
    expect(mailerCanDeliver({ MAIL_WEBHOOK_URL: 'https://h/e' })).toBe(true);
  });
  it('is false for smtp-only (recognised but not wired) and for none', () => {
    expect(mailerCanDeliver({ SMTP_URL: 'smtp://h' })).toBe(false);
    expect(mailerCanDeliver({})).toBe(false);
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
  it('joins base + token and url-encodes the token', () => {
    expect(resetLinkUrl('https://app.ph-aros.com', 'a b/c')).toBe(
      'https://app.ph-aros.com/reset?token=a%20b%2Fc'
    );
  });
  it('strips a trailing slash from the base', () => {
    expect(resetLinkUrl('https://x.com/', 'tok')).toBe('https://x.com/reset?token=tok');
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
