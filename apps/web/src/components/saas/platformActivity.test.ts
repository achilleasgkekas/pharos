// Unit tests for the platform activity display mapping (components/saas/platformActivity) — the
// cross-tenant Activity feed's view layer. The workspace-scoped mapping it builds on is covered by
// activityView.test.ts, so these focus on the one thing this module adds: workspace attribution,
// and specifically that the Workspace column can NEVER render blank (a blank cell in an operator
// console reads as a rendering fault, which sends someone debugging the wrong thing).
import { describe, it, expect } from 'vitest';
import {
  workspaceLabel,
  toPlatformActivityRow,
  toPlatformActivityRows,
  actorEmailSuggestions,
  workspaceSuggestions,
  DELETED_WORKSPACE_LABEL,
  type PlatformActivityInput,
} from './platformActivity';

const row = (over: Partial<PlatformActivityInput> = {}): PlatformActivityInput => ({
  id: 'e1',
  action: 'member.removed',
  actor: 'a1',
  actorEmail: 'op@pharos.dev',
  actorName: 'Op',
  target: 'someone@example.com',
  meta: { role: 'admin' },
  createdAt: '2026-07-28T10:00:00.000Z',
  workspaceSlug: 'acme',
  workspaceName: 'Acme Co',
  ...over,
});

describe('workspaceLabel', () => {
  it('prefers the display name', () => {
    expect(workspaceLabel({ workspaceName: 'Acme Co', workspaceSlug: 'acme' })).toBe('Acme Co');
  });

  it('falls back to the slug when the name is missing or blank', () => {
    expect(workspaceLabel({ workspaceName: null, workspaceSlug: 'acme' })).toBe('acme');
    expect(workspaceLabel({ workspaceName: '   ', workspaceSlug: 'acme' })).toBe('acme');
  });

  it('falls back to the deleted-workspace placeholder when both are missing', () => {
    expect(workspaceLabel({ workspaceName: null, workspaceSlug: null })).toBe(
      DELETED_WORKSPACE_LABEL
    );
  });

  it('never returns an empty string for any combination of blanks', () => {
    // The column always renders something; a blank cell would read as a broken page.
    for (const name of [null, '', '   ']) {
      for (const slug of [null, '', '   ']) {
        expect(workspaceLabel({ workspaceName: name, workspaceSlug: slug }).length).toBeGreaterThan(0);
      }
    }
  });

  it('trims surrounding whitespace off the label', () => {
    expect(workspaceLabel({ workspaceName: '  Acme Co  ', workspaceSlug: 'acme' })).toBe('Acme Co');
    expect(workspaceLabel({ workspaceName: null, workspaceSlug: '  acme  ' })).toBe('acme');
  });
});

describe('toPlatformActivityRow', () => {
  it('carries through the workspace-scoped display mapping', () => {
    const r = toPlatformActivityRow(row());
    expect(r.id).toBe('e1');
    expect(r.label).toBe('Member removed');
    // Destructive verbs read red regardless of noun — inherited from activityView.actionTone.
    expect(r.tone).toBe('red');
    expect(r.actor).toBe('Op');
    expect(r.target).toBe('someone@example.com');
    expect(r.meta).toBe('role: admin');
    expect(r.createdAt).toBe('2026-07-28T10:00:00.000Z');
  });

  it('adds the workspace slug and label', () => {
    const r = toPlatformActivityRow(row());
    expect(r.workspaceSlug).toBe('acme');
    expect(r.workspaceLabel).toBe('Acme Co');
  });

  it('nulls the slug for a deleted workspace so the panel renders no dead link', () => {
    // The panel keys its <Link> off workspaceSlug; a null here is what makes it fall back to
    // plain text instead of linking to a /admin/tenants page that 404s.
    const r = toPlatformActivityRow(row({ workspaceSlug: null, workspaceName: null }));
    expect(r.workspaceSlug).toBeNull();
    expect(r.workspaceLabel).toBe(DELETED_WORKSPACE_LABEL);
  });

  it('treats a whitespace-only slug as absent', () => {
    const r = toPlatformActivityRow(row({ workspaceSlug: '   ', workspaceName: 'Acme Co' }));
    expect(r.workspaceSlug).toBeNull();
    // The name still labels the row even though there is nothing to link to.
    expect(r.workspaceLabel).toBe('Acme Co');
  });

  it('trims a padded slug so the generated link is well-formed', () => {
    expect(toPlatformActivityRow(row({ workspaceSlug: ' acme ' })).workspaceSlug).toBe('acme');
  });

  it('labels an actor-less system event as System', () => {
    const r = toPlatformActivityRow(row({ actor: null, actorEmail: null, actorName: null }));
    expect(r.actor).toBe('System');
  });

  it('does not mutate its input', () => {
    const input = row();
    const snapshot = JSON.parse(JSON.stringify(input));
    toPlatformActivityRow(input);
    expect(input).toEqual(snapshot);
  });
});

describe('toPlatformActivityRows', () => {
  it('preserves order — the reader already sorted newest-first', () => {
    const rows = toPlatformActivityRows([
      row({ id: 'a', workspaceSlug: 'one' }),
      row({ id: 'b', workspaceSlug: 'two' }),
      row({ id: 'c', workspaceSlug: 'three' }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(rows.map((r) => r.workspaceSlug)).toEqual(['one', 'two', 'three']);
  });

  it('handles an empty batch', () => {
    expect(toPlatformActivityRows([])).toEqual([]);
  });

  it('maps rows from different workspaces independently', () => {
    // The whole point of the cross-tenant feed: adjacent rows belong to different tenants.
    const rows = toPlatformActivityRows([
      row({ id: 'a', workspaceSlug: 'acme', workspaceName: 'Acme Co' }),
      row({ id: 'b', workspaceSlug: null, workspaceName: null }),
      row({ id: 'c', workspaceSlug: 'beta', workspaceName: null }),
    ]);
    expect(rows.map((r) => r.workspaceLabel)).toEqual(['Acme Co', DELETED_WORKSPACE_LABEL, 'beta']);
  });
});

describe('actorEmailSuggestions', () => {
  it('collects the distinct actor emails of a page', () => {
    expect(
      actorEmailSuggestions([
        row({ actorEmail: 'ana@example.com' }),
        row({ actorEmail: 'bo@example.com' }),
        row({ actorEmail: 'ana@example.com' }),
      ])
    ).toEqual(['ana@example.com', 'bo@example.com']);
  });

  it('sorts alphabetically rather than by feed order', () => {
    // Newest-first order would otherwise reshuffle the dropdown on every request.
    expect(
      actorEmailSuggestions([
        row({ actorEmail: 'zoe@example.com' }),
        row({ actorEmail: 'ana@example.com' }),
        row({ actorEmail: 'mia@example.com' }),
      ])
    ).toEqual(['ana@example.com', 'mia@example.com', 'zoe@example.com']);
  });

  it('lowercases and trims, so a suggestion matches the way the server resolves it', () => {
    // Account.email is declared `lowercase: true`; a suggestion that differs in case would look
    // right and still be resolved through the same normalisation, so normalise here too.
    expect(actorEmailSuggestions([row({ actorEmail: '  Ana@Example.COM ' })])).toEqual([
      'ana@example.com',
    ]);
  });

  it('deduplicates across case and whitespace variants', () => {
    expect(
      actorEmailSuggestions([
        row({ actorEmail: 'ana@example.com' }),
        row({ actorEmail: 'ANA@example.com' }),
        row({ actorEmail: ' ana@example.com ' }),
      ])
    ).toEqual(['ana@example.com']);
  });

  it('skips actor-less (system) events', () => {
    expect(
      actorEmailSuggestions([
        row({ actorEmail: null }),
        row({ actorEmail: '   ' }),
        row({ actorEmail: 'ana@example.com' }),
      ])
    ).toEqual(['ana@example.com']);
  });

  it('drops values that are not addresses — they could never resolve to an account', () => {
    // A suggestion that guarantees "No account with email ..." is worse than no suggestion.
    expect(
      actorEmailSuggestions([row({ actorEmail: 'system' }), row({ actorEmail: 'ana@example.com' })])
    ).toEqual(['ana@example.com']);
  });

  it('returns an empty list for an empty page', () => {
    expect(actorEmailSuggestions([])).toEqual([]);
  });

  it('does not cap the list — every address on screen stays suggestable', () => {
    // The page is already bounded by MAX_PLATFORM_AUDIT_PAGE; truncating here would hide an
    // address the operator can literally see in the Actor column.
    const many = Array.from({ length: 200 }, (_, i) =>
      row({ actorEmail: `user${String(i).padStart(3, '0')}@example.com` })
    );
    expect(actorEmailSuggestions(many)).toHaveLength(200);
  });

  it('does not mutate its input', () => {
    const input = [row({ actorEmail: '  Ana@Example.com ' })];
    const snapshot = structuredClone(input);
    actorEmailSuggestions(input);
    expect(input).toEqual(snapshot);
  });
});

describe('workspaceSuggestions', () => {
  const row = (slug: string | null, name: string | null) =>
    ({ workspaceSlug: slug, workspaceName: name }) as PlatformActivityInput;

  it('pairs the slug the filter matches with the name the column shows', () => {
    // The whole point: the operator reads "Acme Corp" and has to type "acme".
    expect(workspaceSuggestions([row('acme', 'Acme Corp')])).toEqual([
      { slug: 'acme', label: 'Acme Corp' },
    ]);
  });

  it('deduplicates a workspace that appears on many rows', () => {
    const out = workspaceSuggestions([
      row('acme', 'Acme Corp'),
      row('acme', 'Acme Corp'),
      row('beta', 'Beta'),
    ]);
    expect(out.map((w) => w.slug)).toEqual(['acme', 'beta']);
  });

  it('keeps the FIRST label seen, which is the most recent one (the feed is newest-first)', () => {
    // A renamed workspace would otherwise be offered under a name nobody recognises any more.
    const out = workspaceSuggestions([row('acme', 'Acme Renamed'), row('acme', 'Acme Old')]);
    expect(out).toEqual([{ slug: 'acme', label: 'Acme Renamed' }]);
  });

  it('drops purged workspaces — filtering by them is guaranteed to return nothing', () => {
    // The audit trail outlives its workspaces; a null slug has no value to put in the box.
    expect(workspaceSuggestions([row(null, null), row(null, 'Gone')])).toEqual([]);
  });

  it('falls back to the slug when the workspace has no display name', () => {
    expect(workspaceSuggestions([row('acme', null)])).toEqual([{ slug: 'acme', label: 'acme' }]);
  });

  it('normalises case and whitespace the way the server will match it', () => {
    expect(workspaceSuggestions([row('  ACME  ', 'Acme')])).toEqual([
      { slug: 'acme', label: 'Acme' },
    ]);
  });

  it('sorts by slug, so the dropdown does not reshuffle with the feed order', () => {
    const out = workspaceSuggestions([row('zulu', 'Z'), row('alpha', 'A'), row('mike', 'M')]);
    expect(out.map((w) => w.slug)).toEqual(['alpha', 'mike', 'zulu']);
  });

  it('is not capped: a full page offers every workspace visible on it', () => {
    // Truncating would hide a workspace that is literally on screen — the failure this fixes.
    const rows = Array.from({ length: 200 }, (_, i) =>
      row(`ws-${String(i).padStart(3, '0')}`, `WS ${i}`),
    );
    expect(workspaceSuggestions(rows)).toHaveLength(200);
  });

  it('returns nothing for an empty feed, so the page can skip the datalist entirely', () => {
    expect(workspaceSuggestions([])).toEqual([]);
  });
});
