/** Client-safe outbound-webhook types + metadata (no DB/server imports), so the
 *  Settings UI can import them without pulling node-only code into the client
 *  bundle. The signer + dispatcher live in webhooks.ts (server-only). */

export type WebhookEvent = 'receipt.parsed' | 'budget.exceeded' | 'installment.due' | 'price.drop';

export type WebhookSubscription = {
  id: string;
  url: string;
  secret: string;
  enabled: boolean;
  label?: string;
  events: WebhookEvent[];
};

export const WEBHOOK_EVENTS: { type: WebhookEvent; label: string; hint: string }[] = [
  { type: 'receipt.parsed', label: 'Receipt parsed', hint: 'A receipt was AI-parsed or re-scanned.' },
  { type: 'budget.exceeded', label: 'Budget exceeded', hint: 'A category budget was crossed this month.' },
  { type: 'installment.due', label: 'Installment due', hint: 'A card installment plan has a payment due this month.' },
  { type: 'price.drop', label: 'Price drop / deal hit', hint: 'A tracked item hit its target price.' },
];
