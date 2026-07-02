import { describe, it, expect } from 'vitest';
import {
  MAX_WORKSPACE_NAME,
  sanitizeWorkspaceName,
  workspaceNameError,
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
