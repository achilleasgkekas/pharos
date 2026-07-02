import { describe, expect, it } from 'vitest';
import {
  AI_DISABLED_MESSAGE,
  AI_FEATURES,
  AI_FEATURE_KEYS,
  type AiFeatureKey,
} from './aiFeatures';

// aiFeatures.ts is the client-safe AI feature registry (types + constants only, no server
// imports). It drives the Settings → AI toggles and, through ./aiFeatures.server, the
// per-feature gating. These tests lock the registry shape so a stray typo/removal can't
// silently drop a toggle or break the client bundle contract. Pure module → no DB/fs/clock.

// The canonical set of keys the app knows about (mirrors the AiFeatureKey union). If a key is
// added/removed in the source, this list must be updated deliberately — that is the point.
const EXPECTED_KEYS: AiFeatureKey[] = [
  'receipts',
  'expenses',
  'statements',
  'statementCategorize',
  'vouchers',
  'cards',
  'subscriptions',
  'itemsImport',
  'productPhoto',
  'commandBar',
];

describe('AI_FEATURES', () => {
  it('is a non-empty list', () => {
    expect(Array.isArray(AI_FEATURES)).toBe(true);
    expect(AI_FEATURES.length).toBeGreaterThan(0);
  });

  it('covers exactly the expected feature keys', () => {
    const keys = AI_FEATURES.map((f) => f.key);
    expect([...keys].sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it('has unique keys', () => {
    const keys = AI_FEATURES.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every feature a non-empty label, description and area', () => {
    for (const f of AI_FEATURES) {
      expect(typeof f.label).toBe('string');
      expect(f.label.trim().length).toBeGreaterThan(0);
      expect(typeof f.description).toBe('string');
      expect(f.description.trim().length).toBeGreaterThan(0);
      expect(typeof f.area).toBe('string');
      expect(f.area.trim().length).toBeGreaterThan(0);
    }
  });

  it('has unique, human-readable labels', () => {
    const labels = AI_FEATURES.map((f) => f.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('groups features under the known Settings areas', () => {
    const areas = new Set(AI_FEATURES.map((f) => f.area));
    expect(areas).toEqual(new Set(['Documents', 'Shopping & items', 'Assistant']));
  });

  it('keeps same-area features contiguous (so the Settings UI can group by first-seen order)', () => {
    // Once an area is left, it must not reappear later in the list.
    const seen = new Set<string>();
    let prev = '';
    for (const f of AI_FEATURES) {
      if (f.area !== prev) {
        expect(seen.has(f.area)).toBe(false);
        seen.add(f.area);
        prev = f.area;
      }
    }
  });
});

describe('AI_FEATURE_KEYS', () => {
  it('mirrors AI_FEATURES keys, in order', () => {
    expect(AI_FEATURE_KEYS).toEqual(AI_FEATURES.map((f) => f.key));
  });

  it('has an entry per feature and no duplicates', () => {
    expect(AI_FEATURE_KEYS.length).toBe(AI_FEATURES.length);
    expect(new Set(AI_FEATURE_KEYS).size).toBe(AI_FEATURE_KEYS.length);
  });
});

describe('AI_DISABLED_MESSAGE', () => {
  it('is a non-empty string pointing users to Settings', () => {
    expect(typeof AI_DISABLED_MESSAGE).toBe('string');
    expect(AI_DISABLED_MESSAGE.trim().length).toBeGreaterThan(0);
    expect(AI_DISABLED_MESSAGE).toMatch(/settings/i);
  });
});
