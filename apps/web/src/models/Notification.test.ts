import { describe, expect, it } from 'vitest';
import { Notification } from './Notification';

describe('Notification schema', () => {
  it('accepts subscription review notifications', () => {
    const notification = new Notification({
      dedupeKey: 'subreview:subscription-1:2026-01-01',
      kind: 'subreview',
    });

    expect(notification.validateSync()).toBeUndefined();
  });
});
