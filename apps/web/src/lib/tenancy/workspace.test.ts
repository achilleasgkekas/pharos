import { describe, it, expect } from 'vitest';
import {
  MAX_WORKSPACE_NAME,
  canCancelWorkspace,
  canReactivateWorkspace,
  reactivateStatusError,
  sanitizeWorkspaceName,
  workspaceNameError,
  workspaceStatusError,
  workspaceView,
} from './workspace';

// Only the PURE helpers are unit-tested. The GET/PATCH route handlers are SaaS-gated (404 when
// SAAS_MODE off) and only read/write control-plane collections; their rename policy + response
// shape are asserted here through sanitizeWorkspaceName + workspaceNameError + workspaceView.

describe('sanitizeWorkspaceName', () => {
  it('trims surrounding whitespace', () => {
    expect(sanitizeWorkspaceName('  Acme Corp  ')).toBe('Acme Corp');
  });
  it('collapses internal whitespace', () => {
    expect(sanitizeWorkspaceName('Acme   Corp\t\nLtd')).toBe('Acme Corp Ltd');
  });
  it('keeps empty as empty', () => {
    expect(sanitizeWorkspaceName('')).toBe('');
    expect(sanitizeWorkspaceName('   ')).toBe('');
  });
  it('coerces non-strings to empty', () => {
    expect(sanitizeWorkspaceName(undefined)).toBe('');
    expect(sanitizeWorkspaceName(null)).toBe('');
    expect(sanitizeWorkspaceName(42)).toBe('');
    expect(sanitizeWorkspaceName({})).toBe('');
  });
  it('caps the length at the maximum', () => {
    const long = 'a'.repeat(200);
    expect(sanitizeWorkspaceName(long)).toHaveLength(MAX_WORKSPACE_NAME);
  });
});

describe('workspaceNameError', () => {
  it('rejects an empty name', () => {
    expect(workspaceNameError('')).toBe('A workspace name is required');
  });
  it('accepts a non-empty name', () => {
    expect(workspaceNameError('Acme')).toBeNull();
  });
});

describe('canCancelWorkspace', () => {
  it('allows the owner to cancel', () => {
    expect(canCancelWorkspace('owner')).toBe(true);
  });
  it('rejects admins and members', () => {
    expect(canCancelWorkspace('admin')).toBe(false);
    expect(canCancelWorkspace('member')).toBe(false);
  });
  it('rejects unknown / empty roles', () => {
    expect(canCancelWorkspace('')).toBe(false);
    expect(canCancelWorkspace('viewer')).toBe(false);
  });
});

describe('workspaceView', () => {
  const base = {
    _id: 'abc123',
    slug: 'acme',
    name: 'Acme Corp',
    plan: 'shared',
    status: 'active',
    tier: 'shared',
    customDomain: null,
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
  };

  it('projects only whitelisted display fields', () => {
    const v = workspaceView(base, 'owner', 3);
    expect(v).toEqual({
      tenantId: 'abc123',
      slug: 'acme',
      name: 'Acme Corp',
      plan: 'shared',
      status: 'active',
      tier: 'shared',
      customDomain: null,
      role: 'owner',
      memberCount: 3,
      createdAt: '2026-01-02T03:04:05.000Z',
    });
  });

  it('never leaks billing ids even if present on the row', () => {
    const withSecrets = { ...base, billingCustomerId: 'cus_x', billingSubscriptionId: 'sub_y' };
    const v = workspaceView(withSecrets, 'admin', 1);
    expect(Object.keys(v).sort()).toEqual(
      [
        'tenantId',
        'slug',
        'name',
        'plan',
        'status',
        'tier',
        'customDomain',
        'role',
        'memberCount',
        'createdAt',
      ].sort()
    );
    expect(JSON.stringify(v)).not.toContain('cus_x');
    expect(JSON.stringify(v)).not.toContain('sub_y');
  });

  it('accepts an ISO-string createdAt', () => {
    const v = workspaceView({ ...base, createdAt: '2026-06-10T00:00:00.000Z' }, 'member', 2);
    expect(v.createdAt).toBe('2026-06-10T00:00:00.000Z');
  });

  it('null / unparseable createdAt → null', () => {
    expect(workspaceView({ ...base, createdAt: null }, 'member', 1).createdAt).toBeNull();
    expect(workspaceView({ ...base, createdAt: 'not-a-date' }, 'member', 1).createdAt).toBeNull();
  });

  it('falls back on missing optional fields', () => {
    const v = workspaceView({ _id: 'x' }, 'member', 0);
    expect(v.slug).toBe('');
    expect(v.name).toBe('');
    expect(v.plan).toBe('free');
    expect(v.status).toBe('trialing');
    expect(v.tier).toBe('shared');
    expect(v.customDomain).toBeNull();
    expect(v.createdAt).toBeNull();
  });

  it('clamps a negative / non-finite member count to 0', () => {
    expect(workspaceView(base, 'owner', -5).memberCount).toBe(0);
    expect(workspaceView(base, 'owner', NaN).memberCount).toBe(0);
  });
});

describe('workspaceStatusError', () => {
  it('allows active / trialing (any case)', () => {
    expect(workspaceStatusError('active')).toBeNull();
    expect(workspaceStatusError('trialing')).toBeNull();
    expect(workspaceStatusError('ACTIVE')).toBeNull();
    expect(workspaceStatusError('  Trialing ')).toBeNull();
  });

  it('blocks pending / suspended / canceled with a specific message', () => {
    expect(workspaceStatusError('pending')).toMatch(/being set up/);
    expect(workspaceStatusError('suspended')).toMatch(/suspended/);
    expect(workspaceStatusError('canceled')).toMatch(/canceled/);
  });

  it('fails closed on unknown / empty / non-string status', () => {
    expect(workspaceStatusError('')).toBe('workspace is not active');
    expect(workspaceStatusError('bogus')).toBe('workspace is not active');
    expect(workspaceStatusError(undefined)).toBe('workspace is not active');
    expect(workspaceStatusError(null)).toBe('workspace is not active');
    expect(workspaceStatusError(42)).toBe('workspace is not active');
  });
});

describe('canReactivateWorkspace', () => {
  it('allows only the owner', () => {
    expect(canReactivateWorkspace('owner')).toBe(true);
  });
  it('rejects admin / member', () => {
    expect(canReactivateWorkspace('admin')).toBe(false);
    expect(canReactivateWorkspace('member')).toBe(false);
  });
  it('rejects unknown / empty', () => {
    expect(canReactivateWorkspace('')).toBe(false);
    expect(canReactivateWorkspace('viewer')).toBe(false);
  });
});

describe('reactivateStatusError', () => {
  it('allows a canceled workspace (any case)', () => {
    expect(reactivateStatusError('canceled')).toBeNull();
    expect(reactivateStatusError('CANCELED')).toBeNull();
    expect(reactivateStatusError('  Canceled ')).toBeNull();
  });
  it('rejects already-active / trialing', () => {
    expect(reactivateStatusError('active')).toMatch(/already active/);
    expect(reactivateStatusError('trialing')).toMatch(/already active/);
  });
  it('rejects suspended (billing) and pending with specific messages', () => {
    expect(reactivateStatusError('suspended')).toMatch(/billing/);
    expect(reactivateStatusError('pending')).toMatch(/being set up/);
  });
  it('fails closed on unknown / empty / non-string status', () => {
    expect(reactivateStatusError('')).toBe('workspace cannot be reactivated');
    expect(reactivateStatusError('bogus')).toBe('workspace cannot be reactivated');
    expect(reactivateStatusError(undefined)).toBe('workspace cannot be reactivated');
    expect(reactivateStatusError(null)).toBe('workspace cannot be reactivated');
    expect(reactivateStatusError(42)).toBe('workspace cannot be reactivated');
  });
});
