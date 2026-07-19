import 'server-only';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { ImapConfig } from './imapConfig';

export type FetchedEmailAttachment = { filename: string; contentType: string; content: Buffer };
export type FetchedEmail = {
  uid: number;
  subject: string;
  date: Date | null;
  from: string;
  html: string | null;
  attachments: FetchedEmailAttachment[];
};

// Cap per check so one run never dumps years of backlog or ties up the process —
// remaining messages are simply picked up incrementally on the next "Check inbox now".
const MAX_FETCH = 25;
// First-ever check (no stored UID yet): only look at the last week, not the whole mailbox.
const FIRST_RUN_LOOKBACK_DAYS = 7;
// Only attachments that look like receipts/invoices are worth ingesting.
const ATTACHMENT_RE = /\.(pdf|png|jpe?g)$/i;
const CONTENT_TYPE_RE = /^(application\/pdf|image\/(png|jpe?g))$/i;

function client(cfg: ImapConfig): ImapFlow {
  return new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });
}

function imapError(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err)) || 'Unknown error';
  if (/auth/i.test(msg)) return 'Authentication failed — check the username/password (some providers need an app password, not your normal one)';
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH/i.test(msg)) return 'Could not reach the mail server — check host/port';
  if (/certificate|SSL|TLS|wrong version/i.test(msg)) return 'TLS/certificate error — check the "secure" and port settings';
  if (/mailbox does not exist|NONEXISTENT/i.test(msg)) return 'That mailbox/folder does not exist';
  return msg.slice(0, 160);
}

export type TestResult = { ok: true; messageCount: number } | { ok: false; error: string };

/** Connect, open the configured folder, report how many messages are in it. Read-only. */
export async function testImapConnection(cfg: ImapConfig): Promise<TestResult> {
  if (!cfg.host || !cfg.user || !cfg.pass) return { ok: false, error: 'Missing host, username or password' };
  const c = client(cfg);
  try {
    await c.connect();
    const lock = await c.getMailboxLock(cfg.folder || 'INBOX');
    try {
      const mailbox = c.mailbox;
      return { ok: true, messageCount: mailbox ? mailbox.exists : 0 };
    } finally {
      lock.release();
    }
  } catch (err) {
    return { ok: false, error: imapError(err) };
  } finally {
    try { await c.logout(); } catch { /* best-effort */ }
  }
}

export type FetchResult =
  | { ok: true; emails: FetchedEmail[]; maxUid: number }
  | { ok: false; error: string; emails: []; maxUid: number };

/**
 * Fetch messages newer than `cfg.lastUid` (or, on the very first check, messages from
 * the last FIRST_RUN_LOOKBACK_DAYS days) — capped at MAX_FETCH per call. Returns the
 * highest UID actually processed so the caller can advance the resume point; any
 * messages beyond the cap are simply picked up on the next check.
 */
export async function fetchNewEmails(cfg: ImapConfig): Promise<FetchResult> {
  if (!cfg.host || !cfg.user || !cfg.pass) {
    return { ok: false, error: 'Missing host, username or password', emails: [], maxUid: cfg.lastUid };
  }
  const c = client(cfg);
  try {
    await c.connect();
    const lock = await c.getMailboxLock(cfg.folder || 'INBOX');
    try {
      const query = cfg.lastUid > 0
        ? { uid: `${cfg.lastUid + 1}:*` }
        : { since: new Date(Date.now() - FIRST_RUN_LOOKBACK_DAYS * 86400_000) };
      const found = await c.search(query, { uid: true });
      const uids = (found === false ? [] : found).filter((u) => u > cfg.lastUid).sort((a, b) => a - b).slice(0, MAX_FETCH);
      if (uids.length === 0) return { ok: true, emails: [], maxUid: cfg.lastUid };

      const messages = await c.fetchAll(uids, { uid: true, source: true }, { uid: true });
      const emails: FetchedEmail[] = [];
      let maxUid = cfg.lastUid;
      for (const msg of messages) {
        if (msg.uid > maxUid) maxUid = msg.uid;
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        emails.push({
          uid: msg.uid,
          subject: parsed.subject || '',
          date: parsed.date || null,
          from: parsed.from?.text || '',
          html: typeof parsed.html === 'string' ? parsed.html : (parsed.textAsHtml || null),
          attachments: (parsed.attachments || [])
            .filter((a) => CONTENT_TYPE_RE.test(a.contentType) || ATTACHMENT_RE.test(a.filename || ''))
            .map((a) => ({ filename: a.filename || 'attachment', contentType: a.contentType, content: a.content as Buffer })),
        });
      }
      return { ok: true, emails, maxUid };
    } finally {
      lock.release();
    }
  } catch (err) {
    return { ok: false, error: imapError(err), emails: [], maxUid: cfg.lastUid };
  } finally {
    try { await c.logout(); } catch { /* best-effort */ }
  }
}
