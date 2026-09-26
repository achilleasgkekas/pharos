import { describe, expect, it } from 'vitest';
import { DEFAULT_SMTP_PORT, NOTIFIER_TYPES, smtpFields, type NotifierType } from './notifiers.shared';

// notifiers.shared.ts is the client-safe notifier metadata (no DB/server imports) that the
// Settings UI reads to render the per-channel config forms. NOTIFIER_TYPES.needs drives which
// fields (url/token/target/smtp) a channel shows and validates, so a mismatch here silently breaks
// notifier setup. Pure module → every invariant is checkable in isolation.

// Canonical NotifierType union (mirrors the source type). Updating the source must update this.
const EXPECTED_TYPES: NotifierType[] = ['ntfy', 'discord', 'slack', 'telegram', 'webhook', 'email'];
const VALID_NEEDS = new Set(['url', 'token', 'target', 'smtp']);

describe('NOTIFIER_TYPES', () => {
  it('is a non-empty list', () => {
    expect(Array.isArray(NOTIFIER_TYPES)).toBe(true);
    expect(NOTIFIER_TYPES.length).toBeGreaterThan(0);
  });

  it('covers exactly the NotifierType union', () => {
    const types = NOTIFIER_TYPES.map((n) => n.type);
    expect([...types].sort()).toEqual([...EXPECTED_TYPES].sort());
  });

  it('has unique types', () => {
    const types = NOTIFIER_TYPES.map((n) => n.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('gives every notifier a non-empty label and hint', () => {
    for (const n of NOTIFIER_TYPES) {
      expect(typeof n.label).toBe('string');
      expect(n.label.trim().length).toBeGreaterThan(0);
      expect(typeof n.hint).toBe('string');
      expect(n.hint.trim().length).toBeGreaterThan(0);
    }
  });

  it('declares at least one required field per notifier, all from the known set', () => {
    for (const n of NOTIFIER_TYPES) {
      expect(Array.isArray(n.needs)).toBe(true);
      expect(n.needs.length).toBeGreaterThan(0);
      for (const need of n.needs) expect(VALID_NEEDS.has(need)).toBe(true);
    }
  });

  it('has no duplicate needs within a single notifier', () => {
    for (const n of NOTIFIER_TYPES) {
      expect(new Set(n.needs).size).toBe(n.needs.length);
    }
  });

  it('requires a url for the webhook-style channels', () => {
    for (const type of ['ntfy', 'discord', 'slack', 'webhook'] as NotifierType[]) {
      const entry = NOTIFIER_TYPES.find((n) => n.type === type);
      expect(entry?.needs).toEqual(['url']);
    }
  });

  it('requires a bot token and chat target for telegram (and no url)', () => {
    const tg = NOTIFIER_TYPES.find((n) => n.type === 'telegram');
    expect(tg).toBeDefined();
    expect(new Set(tg!.needs)).toEqual(new Set(['token', 'target']));
    expect(tg!.needs).not.toContain('url');
  });

  it('requires the SMTP block and a recipient target for email (and no url)', () => {
    const email = NOTIFIER_TYPES.find((n) => n.type === 'email');
    expect(email).toBeDefined();
    expect(new Set(email!.needs)).toEqual(new Set(['smtp', 'target']));
    expect(email!.needs).not.toContain('url');
  });

  it('lets every type be looked up by its type field', () => {
    for (const type of EXPECTED_TYPES) {
      expect(NOTIFIER_TYPES.find((n) => n.type === type)).toBeTruthy();
    }
  });
});

describe('smtpFields', () => {
  it('trims the text fields and keeps the password verbatim', () => {
    expect(
      smtpFields({ host: ' smtp.example.com ', port: '465', secure: true, user: ' me ', pass: ' p w ', from: ' a@b.c ' })
    ).toEqual({ host: 'smtp.example.com', port: 465, secure: true, user: 'me', pass: ' p w ', from: 'a@b.c' });
  });

  it('falls back to the default port for a blank, zero or out-of-range port', () => {
    for (const port of [undefined, '', 0, -1, 70000, 'abc']) {
      expect(smtpFields({ port }).port).toBe(DEFAULT_SMTP_PORT);
    }
  });

  it('turns secure on only for an explicit true', () => {
    expect(smtpFields({ secure: 'true' }).secure).toBe(false);
    expect(smtpFields({}).secure).toBe(false);
    expect(smtpFields({ secure: true }).secure).toBe(true);
  });

  it('defaults every missing field to an empty string', () => {
    expect(smtpFields({})).toEqual({ host: '', port: DEFAULT_SMTP_PORT, secure: false, user: '', pass: '', from: '' });
  });
});
