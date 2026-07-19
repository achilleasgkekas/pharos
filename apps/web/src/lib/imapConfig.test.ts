import { describe, it, expect } from 'vitest';
import { normalizeImapConfig } from './imapConfig';

describe('normalizeImapConfig', () => {
  it('returns disabled defaults for null/undefined/empty doc', () => {
    const expected = {
      enabled: false,
      host: '',
      port: 993,
      user: '',
      pass: '',
      secure: true,
      folder: 'INBOX',
      lastUid: 0,
      lastCheckedAt: '',
      lastImportedAt: '',
      hasPass: false,
    };
    expect(normalizeImapConfig(null)).toEqual(expected);
    expect(normalizeImapConfig(undefined)).toEqual(expected);
    expect(normalizeImapConfig({})).toEqual(expected);
  });

  it('coerces imapEnabled to a boolean', () => {
    expect(normalizeImapConfig({ imapEnabled: true }).enabled).toBe(true);
    expect(normalizeImapConfig({ imapEnabled: false }).enabled).toBe(false);
  });

  it('defaults port to 993 when absent or falsy, keeps an explicit port', () => {
    expect(normalizeImapConfig({}).port).toBe(993);
    expect(normalizeImapConfig({ imapPort: 0 }).port).toBe(993);
    expect(normalizeImapConfig({ imapPort: 143 }).port).toBe(143);
  });

  it('defaults secure to true unless explicitly false', () => {
    expect(normalizeImapConfig({}).secure).toBe(true);
    expect(normalizeImapConfig({ imapSecure: true }).secure).toBe(true);
    expect(normalizeImapConfig({ imapSecure: false }).secure).toBe(false);
  });

  it('defaults folder to INBOX, keeps a custom folder', () => {
    expect(normalizeImapConfig({}).folder).toBe('INBOX');
    expect(normalizeImapConfig({ imapFolder: '' }).folder).toBe('INBOX');
    expect(normalizeImapConfig({ imapFolder: 'Receipts' }).folder).toBe('Receipts');
  });

  it('passes host/user/pass through, defaulting blanks', () => {
    const v = normalizeImapConfig({ imapHost: 'imap.gmail.com', imapUser: 'me@gmail.com', imapPass: 'secret' });
    expect(v.host).toBe('imap.gmail.com');
    expect(v.user).toBe('me@gmail.com');
    expect(v.pass).toBe('secret');
  });

  it('derives hasPass from a non-empty imapPass without exposing it separately', () => {
    expect(normalizeImapConfig({ imapPass: 'pw' }).hasPass).toBe(true);
    expect(normalizeImapConfig({ imapPass: '' }).hasPass).toBe(false);
    expect(normalizeImapConfig({}).hasPass).toBe(false);
    expect(normalizeImapConfig({ imapPass: 'pw' }).pass).toBe('pw');
  });

  it('defaults lastUid to 0, keeps a stored resume point', () => {
    expect(normalizeImapConfig({}).lastUid).toBe(0);
    expect(normalizeImapConfig({ imapLastUid: 42 }).lastUid).toBe(42);
  });

  it('formats lastCheckedAt/lastImportedAt as ISO strings, empty when absent', () => {
    expect(normalizeImapConfig({}).lastCheckedAt).toBe('');
    expect(normalizeImapConfig({}).lastImportedAt).toBe('');
    const d = new Date('2026-07-01T12:00:00.000Z');
    expect(normalizeImapConfig({ imapLastCheckedAt: d }).lastCheckedAt).toBe(d.toISOString());
    expect(normalizeImapConfig({ imapLastImportedAt: d }).lastImportedAt).toBe(d.toISOString());
  });
});
