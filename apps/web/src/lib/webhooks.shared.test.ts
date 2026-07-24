import { describe, expect, it } from 'vitest';
import { WEBHOOK_EVENTS, type WebhookEvent } from './webhooks.shared';

// webhooks.shared.ts is the client-safe outbound-webhook metadata (no DB/server imports) that
// the Settings UI reads to render the per-subscription event checkboxes, and that
// coerceWebhookSubscription (webhooks.ts) uses to drop unknown event names from stored/submitted
// subscriptions. A mismatch here would silently hide an event from the UI or let it slip past the
// filter. Pure module → every invariant is checkable in isolation.

// Canonical WebhookEvent union (mirrors the source type + the actual dispatchEventWebhooks call
// sites in app/receipts/actions.ts and app/settings/actions.ts). Updating the source must update this.
const EXPECTED_EVENTS: WebhookEvent[] = ['receipt.parsed', 'budget.exceeded', 'installment.due', 'price.drop'];

describe('WEBHOOK_EVENTS', () => {
  it('is a non-empty list', () => {
    expect(Array.isArray(WEBHOOK_EVENTS)).toBe(true);
    expect(WEBHOOK_EVENTS.length).toBeGreaterThan(0);
  });

  it('covers exactly the WebhookEvent union', () => {
    const types = WEBHOOK_EVENTS.map((e) => e.type);
    expect([...types].sort()).toEqual([...EXPECTED_EVENTS].sort());
  });

  it('has unique types', () => {
    const types = WEBHOOK_EVENTS.map((e) => e.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('gives every event a non-empty label and hint', () => {
    for (const e of WEBHOOK_EVENTS) {
      expect(typeof e.label).toBe('string');
      expect(e.label.trim().length).toBeGreaterThan(0);
      expect(typeof e.hint).toBe('string');
      expect(e.hint.trim().length).toBeGreaterThan(0);
    }
  });

  it('lets every type be looked up by its type field', () => {
    for (const type of EXPECTED_EVENTS) {
      expect(WEBHOOK_EVENTS.find((e) => e.type === type)).toBeTruthy();
    }
  });
});
