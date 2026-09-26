/** Client-safe notifier types + metadata (no DB/server imports), so the Settings
 *  UI can import them without pulling node-only code into the client bundle.
 *  The runtime senders live in notifiers.ts (server-only). */

export type NotifierType = 'ntfy' | 'discord' | 'slack' | 'telegram' | 'webhook' | 'email';

export type NotifierConfig = {
  id: string;
  type: NotifierType;
  enabled: boolean;
  label?: string;
  url?: string; // ntfy topic / Discord webhook / Slack webhook / generic webhook
  token?: string; // Telegram bot token
  target?: string; // Telegram chat id / email recipient(s)
  // Email (SMTP) only. The password sits in the channel row like the Telegram token.
  host?: string;
  port?: number;
  secure?: boolean; // implicit TLS (port 465); off = STARTTLS when the server offers it
  user?: string;
  pass?: string;
  from?: string;
};

export type NotifierField = 'url' | 'token' | 'target' | 'smtp';

export const NOTIFIER_TYPES: { type: NotifierType; label: string; needs: NotifierField[]; hint: string }[] = [
  { type: 'ntfy', label: 'ntfy', needs: ['url'], hint: 'https://ntfy.sh/your-topic (or self-hosted)' },
  { type: 'discord', label: 'Discord', needs: ['url'], hint: 'Channel → Integrations → Webhooks → New Webhook → Copy URL' },
  { type: 'slack', label: 'Slack', needs: ['url'], hint: 'Incoming Webhook URL (https://hooks.slack.com/services/…)' },
  { type: 'telegram', label: 'Telegram', needs: ['token', 'target'], hint: 'Bot token from @BotFather + your chat id' },
  { type: 'webhook', label: 'Webhook', needs: ['url'], hint: 'Any URL — receives JSON {title, message, ts}.' },
  { type: 'email', label: 'Email', needs: ['smtp', 'target'], hint: 'Any SMTP server: Gmail app password, Resend, Postmark, your own relay.' },
];

/** Default SMTP port: 465 is implicit TLS, everything else (587, 25) starts plain. */
export const DEFAULT_SMTP_PORT = 587;

/** The SMTP settings of an email channel row, normalised. Shared by the reader (coerce)
 *  and the Settings save so both store the same shape. */
export function smtpFields(r: Record<string, unknown>): Pick<NotifierConfig, 'host' | 'port' | 'secure' | 'user' | 'pass' | 'from'> {
  const port = Math.trunc(Number(r.port));
  return {
    host: r.host ? String(r.host).trim() : '',
    port: port >= 1 && port <= 65535 ? port : DEFAULT_SMTP_PORT,
    secure: r.secure === true,
    user: r.user ? String(r.user).trim() : '',
    pass: r.pass ? String(r.pass) : '',
    from: r.from ? String(r.from).trim() : '',
  };
}
