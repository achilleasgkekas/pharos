import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  connectDBMock,
  userFindByIdSelect,
  userUpdateOneMock,
  requireUserMock,
  getAppSettingsMock,
  revalidatePathMock,
} = vi.hoisted(() => {
  const userFindByIdSelect = vi.fn();
  return {
    connectDBMock: vi.fn().mockResolvedValue(undefined),
    userFindByIdSelect,
    userUpdateOneMock: vi.fn().mockResolvedValue({ acknowledged: true }),
    requireUserMock: vi.fn(),
    getAppSettingsMock: vi.fn(),
    revalidatePathMock: vi.fn(),
  };
});

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock('@/lib/db', () => ({
  connectDB: connectDBMock,
}));

vi.mock('@/lib/auth', () => ({
  requireUser: requireUserMock,
}));

vi.mock('@/lib/appSettings', () => ({
  getAppSettings: getAppSettingsMock,
}));

vi.mock('@/models/User', () => ({
  User: {
    findById: vi.fn(() => ({
      select: vi.fn(() => ({
        lean: userFindByIdSelect,
      })),
    })),
    updateOne: userUpdateOneMock,
  },
}));

import { getAccountData, updateProfile, updateAlertSubscriptions } from './actions';
import { defaultNotifyTypes } from '@/lib/alertTypes';

describe('Account Server Actions (#383)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserMock.mockResolvedValue({ id: 'user-123', name: 'Achilleas', role: 'admin' });
    getAppSettingsMock.mockResolvedValue({
      notifyTypes: defaultNotifyTypes(),
    });
  });

  describe('getAccountData', () => {
    it('returns user account data and inherits workspace defaults when no custom subscriptions', async () => {
      userFindByIdSelect.mockResolvedValue({
        _id: 'user-123',
        username: 'achilleas',
        name: 'Achilleas Gkekas',
        email: 'achilleas@example.com',
        role: 'admin',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        alertSubscriptions: {},
      });

      const res = await getAccountData();
      expect(res.user.id).toBe('user-123');
      expect(res.user.username).toBe('achilleas');
      expect(res.user.email).toBe('achilleas@example.com');
      expect(res.hasCustomSubscriptions).toBe(false);
      expect(res.personalNotifyTypes.deals).toBe(true);
    });

    it('overlays personal alert subscriptions on top of workspace defaults', async () => {
      userFindByIdSelect.mockResolvedValue({
        _id: 'user-123',
        username: 'achilleas',
        name: 'Achilleas Gkekas',
        email: 'achilleas@example.com',
        role: 'admin',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        alertSubscriptions: {
          deals: false,
          bills: true,
        },
      });

      const res = await getAccountData();
      expect(res.hasCustomSubscriptions).toBe(true);
      expect(res.personalNotifyTypes.deals).toBe(false);
      expect(res.personalNotifyTypes.bills).toBe(true);
    });

    it('throws when user not found', async () => {
      userFindByIdSelect.mockResolvedValue(null);
      await expect(getAccountData()).rejects.toThrow('User not found');
    });
  });

  describe('updateProfile', () => {
    it('updates name and valid email and revalidates paths', async () => {
      const res = await updateProfile({ name: 'Achilleas G.', email: 'new@example.com' });
      expect(res.ok).toBe(true);
      expect(userUpdateOneMock).toHaveBeenCalledWith(
        { _id: 'user-123' },
        { $set: { name: 'Achilleas G.', email: 'new@example.com' } }
      );
      expect(revalidatePathMock).toHaveBeenCalledWith('/account');
      expect(revalidatePathMock).toHaveBeenCalledWith('/settings');
    });

    it('allows clearing email with empty string', async () => {
      const res = await updateProfile({ name: 'Achilleas G.', email: '' });
      expect(res.ok).toBe(true);
      expect(userUpdateOneMock).toHaveBeenCalledWith(
        { _id: 'user-123' },
        { $set: { name: 'Achilleas G.', email: '' } }
      );
    });

    it('rejects invalid email formats', async () => {
      const res = await updateProfile({ name: 'Achilleas G.', email: 'invalid-email' });
      expect(res.ok).toBe(false);
      expect(res.error).toBe('Invalid email address');
      expect(userUpdateOneMock).not.toHaveBeenCalled();
    });
  });

  describe('updateAlertSubscriptions', () => {
    it('resets alertSubscriptions to empty object when null is passed', async () => {
      const res = await updateAlertSubscriptions(null);
      expect(res.ok).toBe(true);
      expect(userUpdateOneMock).toHaveBeenCalledWith(
        { _id: 'user-123' },
        { $set: { alertSubscriptions: {} } }
      );
      expect(revalidatePathMock).toHaveBeenCalledWith('/account');
    });

    it('filters out unknown keys and saves valid alert types', async () => {
      const res = await updateAlertSubscriptions({
        deals: false,
        bills: true,
        unknownCategory: true,
      } as Record<string, boolean>);

      expect(res.ok).toBe(true);
      expect(userUpdateOneMock).toHaveBeenCalledWith(
        { _id: 'user-123' },
        {
          $set: {
            alertSubscriptions: {
              deals: false,
              bills: true,
            },
          },
        }
      );
    });
  });
});
