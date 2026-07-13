import { describe, it, expect } from 'vitest';
import { isValidTenantStatus, isValidPlanKey, planAdminTenantPatch } from './adminTenantActions';

describe('isValidTenantStatus', () => {
  it('accepts the known Tenant.status enum, rejects everything else', () => {
    expect(isValidTenantStatus('active')).toBe(true);
    expect(isValidTenantStatus('suspended')).toBe(true);
    expect(isValidTenantStatus('pending')).toBe(true);
    expect(isValidTenantStatus('trialing')).toBe(true);
    expect(isValidTenantStatus('canceled')).toBe(true);
    expect(isValidTenantStatus('archived')).toBe(false);
    expect(isValidTenantStatus('')).toBe(false);
    expect(isValidTenantStatus(undefined)).toBe(false);
    expect(isValidTenantStatus(42)).toBe(false);
  });
});

describe('isValidPlanKey', () => {
  it('accepts the known plan ladder, rejects everything else', () => {
    expect(isValidPlanKey('free')).toBe(true);
    expect(isValidPlanKey('shared')).toBe(true);
    expect(isValidPlanKey('dedicated')).toBe(true);
    expect(isValidPlanKey('enterprise')).toBe(false);
    expect(isValidPlanKey(null)).toBe(false);
  });
});

describe('planAdminTenantPatch', () => {
  const current = { status: 'active', plan: 'shared' };

  it('rejects a request with neither field', () => {
    const plan = planAdminTenantPatch({}, current);
    expect(plan.ok).toBe(false);
    expect(plan.error).toMatch(/nothing to update/);
    expect(plan.set).toEqual({});
  });

  it('rejects an unknown status value, touches nothing', () => {
    const plan = planAdminTenantPatch({ status: 'archived' }, current);
    expect(plan.ok).toBe(false);
    expect(plan.error).toMatch(/invalid status/);
    expect(plan.set).toEqual({});
  });

  it('rejects an unknown plan value, touches nothing', () => {
    const plan = planAdminTenantPatch({ plan: 'enterprise' }, current);
    expect(plan.ok).toBe(false);
    expect(plan.error).toMatch(/invalid plan/);
    expect(plan.set).toEqual({});
  });

  it('a status-only request that matches current is a no-op (ok, empty set, no audit)', () => {
    const plan = planAdminTenantPatch({ status: 'active' }, current);
    expect(plan.ok).toBe(true);
    expect(plan.set).toEqual({});
    expect(plan.statusAudit).toBeNull();
    expect(plan.planAudit).toBe(false);
  });

  it('a plan-only request that matches current is a no-op', () => {
    const plan = planAdminTenantPatch({ plan: 'shared' }, current);
    expect(plan.ok).toBe(true);
    expect(plan.set).toEqual({});
    expect(plan.planAudit).toBe(false);
  });

  it('suspend: sets status + maps to workspace.suspended', () => {
    const plan = planAdminTenantPatch({ status: 'suspended' }, current);
    expect(plan.ok).toBe(true);
    expect(plan.set).toEqual({ status: 'suspended' });
    expect(plan.statusAudit).toBe('workspace.suspended');
    expect(plan.planAudit).toBe(false);
  });

  it('reactivate: suspended → active maps to workspace.reactivated', () => {
    const plan = planAdminTenantPatch({ status: 'active' }, { status: 'suspended', plan: 'free' });
    expect(plan.set).toEqual({ status: 'active' });
    expect(plan.statusAudit).toBe('workspace.reactivated');
  });

  it('cancel: sets status + maps to workspace.canceled', () => {
    const plan = planAdminTenantPatch({ status: 'canceled' }, current);
    expect(plan.set).toEqual({ status: 'canceled' });
    expect(plan.statusAudit).toBe('workspace.canceled');
  });

  it('a fresh pending→active activation is NOT a reactivation (statusAudit null, still written)', () => {
    const plan = planAdminTenantPatch({ status: 'active' }, { status: 'pending', plan: 'free' });
    expect(plan.set).toEqual({ status: 'active' });
    expect(plan.statusAudit).toBeNull();
  });

  it('plan change: sets plan + planAudit true, independent of status', () => {
    const plan = planAdminTenantPatch({ plan: 'dedicated' }, current);
    expect(plan.set).toEqual({ plan: 'dedicated' });
    expect(plan.statusAudit).toBeNull();
    expect(plan.planAudit).toBe(true);
  });

  it('both fields changed together: both land in `set`, both audits fire independently', () => {
    const plan = planAdminTenantPatch({ status: 'suspended', plan: 'free' }, current);
    expect(plan.set).toEqual({ status: 'suspended', plan: 'free' });
    expect(plan.statusAudit).toBe('workspace.suspended');
    expect(plan.planAudit).toBe(true);
  });

  it('an invalid plan short-circuits even when status would have been valid — no partial set', () => {
    const plan = planAdminTenantPatch({ status: 'suspended', plan: 'bogus' }, current);
    expect(plan.ok).toBe(false);
    expect(plan.set).toEqual({});
  });
});
