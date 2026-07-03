import { describe, it, expect } from 'vitest';
import { statusAuditAction } from './statusAudit';

// Pure module: no DB, no env. Just the transition → audit-action mapping.

describe('statusAuditAction', () => {
  it('audits any transition into suspended as workspace.suspended', () => {
    expect(statusAuditAction('active', 'suspended')).toBe('workspace.suspended');
    expect(statusAuditAction('trialing', 'suspended')).toBe('workspace.suspended');
    expect(statusAuditAction('pending', 'suspended')).toBe('workspace.suspended');
  });

  it('audits any transition into canceled as workspace.canceled', () => {
    expect(statusAuditAction('active', 'canceled')).toBe('workspace.canceled');
    expect(statusAuditAction('suspended', 'canceled')).toBe('workspace.canceled');
  });

  it('audits recovery from a blocked state as workspace.reactivated', () => {
    expect(statusAuditAction('suspended', 'active')).toBe('workspace.reactivated');
    expect(statusAuditAction('canceled', 'active')).toBe('workspace.reactivated');
    expect(statusAuditAction('suspended', 'trialing')).toBe('workspace.reactivated');
    expect(statusAuditAction('canceled', 'trialing')).toBe('workspace.reactivated');
  });

  it('does NOT audit an initial go-live (pending/trialing → active)', () => {
    expect(statusAuditAction('pending', 'active')).toBeNull();
    expect(statusAuditAction('trialing', 'active')).toBeNull();
  });

  it('does NOT audit benign trialing↔active flips', () => {
    expect(statusAuditAction('active', 'trialing')).toBeNull();
  });

  it('returns null for a no-op change (prev === next, case/space-insensitive)', () => {
    expect(statusAuditAction('active', 'active')).toBeNull();
    expect(statusAuditAction('suspended', 'suspended')).toBeNull();
    expect(statusAuditAction(' Active ', 'active')).toBeNull();
  });

  it('is case- and whitespace-insensitive on both sides', () => {
    expect(statusAuditAction('ACTIVE', ' Suspended ')).toBe('workspace.suspended');
    expect(statusAuditAction(' Canceled ', 'ACTIVE')).toBe('workspace.reactivated');
  });

  it('fails closed on unknown/blank/non-string next status', () => {
    expect(statusAuditAction('active', '')).toBeNull();
    expect(statusAuditAction('active', 'gibberish')).toBeNull();
    expect(statusAuditAction('active', null)).toBeNull();
    expect(statusAuditAction('active', 123)).toBeNull();
    expect(statusAuditAction(null, undefined)).toBeNull();
  });
});
