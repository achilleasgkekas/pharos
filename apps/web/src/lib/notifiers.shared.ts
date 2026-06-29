/** Client-safe notifier types + metadata (no DB/server imports), so the Settings
 *  UI can import them without pulling node-only code into the client bundle.
 *  The runtime senders live in notifiers.ts (server-only). */

export type NotifierType = 'ntfy' | 'discord' | 'slack' | 'telegram' | 'webhook';

export type NotifierConfig = {
  id: string;
  type: NotifierType;
  enabled: boolean;
  label?: string;
  url?: string; // ntfy topic / Discord webhook / Slack webhook / generic webhook
  token?: string; // Telegram bot token
  target?: string; // Telegram chat id
};

export const NOTIFIER_TYPES: { type: NotifierType; label: string; needs: ('url' | 'token' | 'target')[]; hint: string }[] = [
  { type: 'ntfy', label: 'ntfy', needs: ['url'], hint: 'https://ntfy.sh/your-topic (or self-hosted)' },
  { type: 'discord', label: 'Discord', needs: ['url'], hint: 'Channel → Integrations → Webhooks → New Webhook → Copy URL' },
  { type: 'slack', label: 'Slack', needs: ['url'], hint: 'Incoming Webhook URL (https://hooks.slack.com/services/…)' },
  { type: 'telegram', label: 'Telegram', needs: ['token', 'target'], hint: 'Bot token from @BotFather + your chat id' },
  { type: 'webhook', label: 'Webhook', needs: ['url'], hint: 'Any URL — receives JSON {title, message, ts}. Routes to email via Zapier/n8n.' },
];
