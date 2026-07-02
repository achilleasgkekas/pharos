import { describe, it, expect } from 'vitest';
import {
  AUDIT_ACTIONS,
  isAuditAction,
  parseAuditAction,
  redactMeta,
  auditView,
  auditCtx,
  collectActorIds,
} from './audit';

// The pure helpers (validation, redaction, serialization) are unit-tested here. The
// recorder (recordAudit) and the GET /api/saas/audit route are SaaS-gated node paths; their
// no-secret / whitelist guarantees rest on redactMeta + auditView, which are asserted below.

describe('isAuditAction / parseAuditAction', () => {
  it('accepts every declared action', () => {
    for (const a of AUDIT_ACTIONS) expect(isAuditAction(a)).toBe(true);
  });

  it('rejects unknown / non-string input', () => {
    expect(isAuditAction('member.exploded')).toBe(false);
    expect(isAuditAction('')).toBe(false);
    expect(isAuditAction(null)).toBe(false);
    expect(isAuditAction(42)).toBe(false);
  });

  it('parseAuditAction trims + lowercases, returns null on unknown', () => {
    expect(parseAuditAction('  MEMBER.REMOVED  ')).toBe('member.removed');
    expect(parseAuditAction('Invite.Sent')).toBe('invite.sent');
    expect(parseAuditAction('nope')).toBeNull();
    expect(parseAuditAction(undefined)).toBeNull();
    expect(parseAuditAction(123)).toBeNull();
  });
});

describe('redactMeta', () => {
  it('returns null for non-plain-object input', () => {
    expect(redactMeta(null)).toBeNull();
    expect(redactMeta(undefined)).toBeNull();
    expect(redactMeta('x')).toBeNull();
    expect(redactMeta(5)).toBeNull();
    expect(redactMeta([1, 2, 3])).toBeNull();
  });

  it('keeps scalar fields', () => {
    expect(redactMeta({ role: 'admin', count: 3, active: true })).toEqual({
      role: 'admin',
      count: 3,
      active: true,
    });
  });

  it('strips sensitive keys (case-insensitive, substring)', () => {
    const out = redactMeta({
      role: 'admin',
      token: 'abc',
      resetToken: 'x',
      passwordHash: 'y',
      apiKey: 'z',
      Authorization: 'Bearer q',
      cookieJar: 'c',
    });
    expect(out).toEqual({ role: 'admin' });
  });

  it('drops null/undefined and non-serializable values', () => {
    const out = redactMeta({ a: 'keep', b: null, c: undefined, d: () => 1, e: Symbol('s') });
    expect(out).toEqual({ a: 'keep' });
  });

  it('keeps scalar arrays, drops nested-structure arrays', () => {
    const out = redactMeta({ tags: ['a', 'b', 3], objs: [{ x: 1 }, { y: 2 }] });
    expect(out).toEqual({ tags: ['a', 'b', 3] });
  });

  it('recurses into nested plain objects and redacts within', () => {
    const out = redactMeta({ change: { from: 'member', to: 'admin', secret: 'nope' } });
    expect(out).toEqual({ change: { from: 'member', to: 'admin' } });
  });

  it('returns null when everything is stripped', () => {
    expect(redactMeta({ token: 'a', password: 'b' })).toBeNull();
    expect(redactMeta({})).toBeNull();
  });

  it('bounds recursion depth (deeply nested collapses to null)', () => {
    const deep = { l1: { l2: { l3: { l4: { l5: { v: 'x' } } } } } };
    // l5 is at depth 5 (> 4) so it returns null and prunes upward.
    expect(redactMeta(deep)).toBeNull();
  });
});

describe('auditView', () => {
  const iso = '2026-07-02T10:00:00.000Z';

  it('projects only whitelisted fields with stringified ids', () => {
    const view = auditView({
      _id: { toString: () => 'evt1' },
      action: 'member.removed',
      actor: { toString: () => 'acc9' },
      target: 'someone@example.com',
      meta: { role: 'member' },
      createdAt: new Date(iso),
    });
    expect(view).toEqual({
      id: 'evt1',
      action: 'member.removed',
      actor: 'acc9',
      actorEmail: null,
      actorName: null,
      target: 'someone@example.com',
      meta: { role: 'member' },
      createdAt: iso,
    });
    // Exact key set — no stray columns can pass through.
    expect(Object.keys(view).sort()).toEqual(
      ['action', 'actor', 'actorEmail', 'actorName', 'createdAt', 'id', 'meta', 'target'].sort()
    );
  });

  it('projects the resolved actorEmail when the route passes it', () => {
    const view = auditView(
      { _id: 'e1b', action: 'member.removed', actor: 'acc9' },
      'admin@example.com'
    );
    expect(view.actor).toBe('acc9');
    expect(view.actorEmail).toBe('admin@example.com');
  });

  it('projects the resolved actorName when the route passes it (3rd arg)', () => {
    const view = auditView(
      { _id: 'e1e', action: 'member.removed', actor: 'acc9' },
      'admin@example.com',
      'Achilleas'
    );
    expect(view.actorEmail).toBe('admin@example.com');
    expect(view.actorName).toBe('Achilleas');
  });

  it('actorEmail/actorName default to null (omitted, or explicit null for a system/deleted actor)', () => {
    const omitted = auditView({ _id: 'e1c', action: 'plan.changed' });
    expect(omitted.actorEmail).toBeNull();
    expect(omitted.actorName).toBeNull();
    const explicit = auditView({ _id: 'e1d', action: 'plan.changed' }, null, null);
    expect(explicit.actorEmail).toBeNull();
    expect(explicit.actorName).toBeNull();
    // Email resolved but name absent (blank display name) → email set, name null.
    expect(auditView({ _id: 'e1f', action: 'plan.changed' }, 'x@y.z').actorName).toBeNull();
  });

  it('null-safes actor/target/meta/createdAt (system event, legacy row)', () => {
    const view = auditView({ _id: 'e2', action: 'plan.changed' });
    expect(view.actor).toBeNull();
    expect(view.actorEmail).toBeNull();
    expect(view.actorName).toBeNull();
    expect(view.target).toBeNull();
    expect(view.meta).toBeNull();
    expect(view.createdAt).toBeNull();
    expect(view.action).toBe('plan.changed');
  });

  it('re-redacts meta on the way out (defence in depth)', () => {
    const view = auditView({
      _id: 'e3',
      action: 'invite.sent',
      meta: { email: 'x@y.z', token: 'leaked-hash' },
    });
    expect(view.meta).toEqual({ email: 'x@y.z' });
  });

  it('accepts an ISO string createdAt, null on garbage', () => {
    expect(auditView({ _id: 'e4', createdAt: iso }).createdAt).toBe(iso);
    expect(auditView({ _id: 'e5', createdAt: 'not-a-date' }).createdAt).toBeNull();
  });
});

describe('auditCtx', () => {
  it('builds a non-default context from a tenant id', () => {
    expect(auditCtx('507f1f77bcf86cd799439011')).toEqual({
      isDefault: false,
      tenantId: '507f1f77bcf86cd799439011',
    });
  });

  it('stringifies a non-string id', () => {
    expect(auditCtx({ toString: () => 'abc' } as unknown as string)).toEqual({
      isDefault: false,
      tenantId: 'abc',
    });
  });

  it('maps null/undefined/empty id to a no-op context (null tenantId)', () => {
    // recordAudit treats tenantId === null as a no-op, so these never write a row.
    expect(auditCtx(null).tenantId).toBeNull();
    expect(auditCtx(undefined).tenantId).toBeNull();
    expect(auditCtx('').tenantId).toBeNull();
    expect(auditCtx(null).isDefault).toBe(false);
  });
});

describe('collectActorIds', () => {
  it('returns distinct stringified non-null actor ids', () => {
    const ids = collectActorIds([
      { actor: 'a1' },
      { actor: { toString: () => 'a2' } },
      { actor: 'a1' }, // duplicate collapses
    ]);
    expect(ids.sort()).toEqual(['a1', 'a2']);
  });

  it('drops null/undefined actors (system events contribute nothing)', () => {
    expect(collectActorIds([{ actor: null }, { actor: undefined }, {}])).toEqual([]);
  });

  it('handles an empty batch', () => {
    expect(collectActorIds([])).toEqual([]);
  });
});
