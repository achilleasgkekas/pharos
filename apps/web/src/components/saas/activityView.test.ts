import { describe, it, expect } from 'vitest';
import {
  actionLabel,
  actionTone,
  actorLabel,
  metaSummary,
  toActivityRow,
  toActivityRows,
  type ActivityInput,
} from './activityView';

const base: ActivityInput = {
  id: 'a1',
  action: 'member.added',
  actor: 'acc1',
  actorEmail: 'jo@example.com',
  actorName: 'Jo',
  target: 'sam@example.com',
  meta: { role: 'member' },
  createdAt: '2026-07-10T10:00:00.000Z',
};

describe('actionLabel', () => {
  it('uses curated copy for known verbs', () => {
    expect(actionLabel('member.added')).toBe('Member added');
    expect(actionLabel('member.role_changed')).toBe('Role changed');
    expect(actionLabel('workspace.erasure_requested')).toBe('Erasure requested');
    expect(actionLabel('ai_key.cleared')).toBe('AI key cleared');
  });

  it('title-cases an unknown noun.verb form legibly', () => {
    expect(actionLabel('foo.bar_baz')).toBe('Foo bar baz');
    expect(actionLabel('widget.frobnicated')).toBe('Widget frobnicated');
  });

  it('falls back to "Activity" on blank/non-string input', () => {
    expect(actionLabel('')).toBe('Activity');
    expect(actionLabel('   ')).toBe('Activity');
    expect(actionLabel(null)).toBe('Activity');
    expect(actionLabel(42 as unknown)).toBe('Activity');
  });
});

describe('actionTone', () => {
  it('maps noun groups to tones', () => {
    expect(actionTone('member.added')).toBe('cyan');
    expect(actionTone('invite.sent')).toBe('gold');
    expect(actionTone('plan.changed')).toBe('purple');
    expect(actionTone('billing.checkout_started')).toBe('purple');
    expect(actionTone('workspace.created')).toBe('accent');
    expect(actionTone('ai_key.set')).toBe('neutral');
  });

  it('always reads red for destructive/negative outcomes regardless of noun', () => {
    expect(actionTone('member.removed')).toBe('red');
    expect(actionTone('invite.revoked')).toBe('red');
    expect(actionTone('workspace.canceled')).toBe('red');
    expect(actionTone('workspace.suspended')).toBe('red');
    expect(actionTone('ai_key.cleared')).toBe('red');
  });

  it('is neutral for unknown/blank actions', () => {
    expect(actionTone('mystery.event')).toBe('neutral');
    expect(actionTone('')).toBe('neutral');
    expect(actionTone(undefined as unknown)).toBe('neutral');
  });
});

describe('actorLabel', () => {
  it('prefers display name', () => {
    expect(actorLabel({ actorName: 'Jo', actorEmail: 'jo@example.com' })).toBe('Jo');
  });

  it('falls back to email when name is blank', () => {
    expect(actorLabel({ actorName: '  ', actorEmail: 'jo@example.com' })).toBe('jo@example.com');
    expect(actorLabel({ actorName: null, actorEmail: 'jo@example.com' })).toBe('jo@example.com');
  });

  it('falls back to "System" when both are absent (actor-less events)', () => {
    expect(actorLabel({ actorName: null, actorEmail: null })).toBe('System');
    expect(actorLabel({ actorName: '', actorEmail: '  ' })).toBe('System');
  });
});

describe('metaSummary', () => {
  it('renders scalars as "key: value" joined by · ', () => {
    expect(metaSummary({ role: 'admin', from: 'member' })).toBe('role: admin · from: member');
  });

  it('joins array values with commas', () => {
    expect(metaSummary({ scopes: ['read', 'write'] })).toBe('scopes: read, write');
  });

  it('collapses nested objects to {…}', () => {
    expect(metaSummary({ nested: { a: 1 } })).toBe('nested: {…}');
  });

  it('skips null/empty values and truncates long ones', () => {
    expect(metaSummary({ a: null, b: 'x' })).toBe('b: x');
    const long = 'y'.repeat(100);
    const out = metaSummary({ note: long })!;
    expect(out.length).toBeLessThan(100);
    expect(out.endsWith('…')).toBe(true);
  });

  it('returns null for empty/invalid meta', () => {
    expect(metaSummary(null)).toBe(null);
    expect(metaSummary({})).toBe(null);
    expect(metaSummary([1, 2] as unknown)).toBe(null);
    expect(metaSummary('str' as unknown)).toBe(null);
  });

  it('caps the number of rendered entries', () => {
    const meta: Record<string, number> = {};
    for (let i = 0; i < 20; i++) meta[`k${i}`] = i;
    const out = metaSummary(meta)!;
    expect(out.split(' · ')).toHaveLength(6);
  });
});

describe('toActivityRow / toActivityRows', () => {
  it('assembles a display-ready row', () => {
    expect(toActivityRow(base)).toEqual({
      id: 'a1',
      label: 'Member added',
      tone: 'cyan',
      actor: 'Jo',
      target: 'sam@example.com',
      meta: 'role: member',
      createdAt: '2026-07-10T10:00:00.000Z',
    });
  });

  it('handles a system event with no actor and no meta', () => {
    const row = toActivityRow({
      ...base,
      action: 'plan.changed',
      actor: null,
      actorEmail: null,
      actorName: null,
      target: 'pro',
      meta: null,
    });
    expect(row.actor).toBe('System');
    expect(row.tone).toBe('purple');
    expect(row.meta).toBe(null);
    expect(row.label).toBe('Plan changed');
  });

  it('preserves order across a batch', () => {
    const rows = toActivityRows([base, { ...base, id: 'a2', action: 'member.removed' }]);
    expect(rows.map((r) => r.id)).toEqual(['a1', 'a2']);
    expect(rows[1].tone).toBe('red');
  });
});
