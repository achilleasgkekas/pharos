import { describe, expect, it } from 'vitest';
import { Notification } from './Notification';
import { AUTO_NOTIF_KINDS } from '@/lib/notificationKinds';

describe('Notification schema', () => {
  it('accepts subscription review notifications', () => {
    const notification = new Notification({
      dedupeKey: 'subreview:subscription-1:2026-01-01',
      kind: 'subreview',
    });

    expect(notification.validateSync()).toBeUndefined();
  });

  // The bell's insertMany is ordered, so ONE row with a kind outside the enum fails
  // validation and inserts nothing at all: 'claim' was missing here, which meant a single
  // stale warranty claim silenced every new bell alert. The list now has one source.
  it.each(AUTO_NOTIF_KINDS)('accepts every auto-generated kind the bell writes: %s', (kind) => {
    const notification = new Notification({ dedupeKey: `${kind}:x`, kind });
    expect(notification.validateSync()).toBeUndefined();
  });
});
