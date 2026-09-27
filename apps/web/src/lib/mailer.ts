import 'server-only';
import nodemailer from 'nodemailer';

/**
 * Plain SMTP sending (P58). Used by the `email` notifier channel today; kept separate
 * from notifiers.ts so anything else that needs to send mail later (password reset,
 * email verification) reuses this instead of growing a second implementation.
 *
 * The host is admin-supplied and may be private on purpose (a LAN relay or a mailcow
 * box next to the app), so, like the IMAP importer, it is not run through the SSRF guard.
 */

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
};

export type PlainMail = { to: string; subject: string; text: string };

const TIMEOUT = 10000;

/** Send one plain-text message. Throws nodemailer's error (with `code`/`responseCode`)
 *  so the caller can tell a refused login from a server that was briefly unreachable. */
export async function sendPlainMail(smtp: SmtpConfig, mail: PlainMail): Promise<void> {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    // No auth block for an open relay: nodemailer would otherwise try to log in with blanks.
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.pass || '' } } : {}),
    connectionTimeout: TIMEOUT,
    greetingTimeout: TIMEOUT,
    socketTimeout: TIMEOUT,
  });
  try {
    await transport.sendMail({ from: smtp.from, to: mail.to, subject: mail.subject, text: mail.text });
  } finally {
    transport.close();
  }
}
