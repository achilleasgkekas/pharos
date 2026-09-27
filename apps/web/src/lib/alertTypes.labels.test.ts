import { describe, expect, it } from 'vitest';
import { ALERT_TYPES } from './alertTypes';
import { WEBHOOK_EVENTS } from './webhooks.shared';
import { NOTIFIER_TYPES } from './notifiers.shared';
import { en } from './i18n/locales/en';

// Settings builds these i18n keys from the type names (#351), which the type checker cannot
// follow. A new alert type, webhook event or channel type must bring its label with it.
describe('Settings labels for notification types', () => {
  it('every alert type has a label', () => {
    for (const at of ALERT_TYPES) expect(`alert.${at.key}` in en, `alert.${at.key} missing from en.ts`).toBe(true);
  });

  it('every webhook event and channel type is covered', () => {
    expect(WEBHOOK_EVENTS.map((e) => e.type).sort()).toEqual(['budget.exceeded', 'installment.due', 'price.drop', 'receipt.parsed']);
    expect(NOTIFIER_TYPES.map((n) => n.type).sort()).toEqual(['discord', 'email', 'ntfy', 'slack', 'telegram', 'webhook']);
  });
});
