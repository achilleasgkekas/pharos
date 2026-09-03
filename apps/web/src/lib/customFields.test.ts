import { describe, it, expect } from 'vitest';
import {
  normalizeCustomFields,
  parseCustomFields,
  customFieldsMatch,
  MAX_CUSTOM_FIELDS,
  MAX_KEY_LENGTH,
  MAX_VALUE_LENGTH,
} from './customFields';

// P70 — the rules that decide what a user-named attribute is allowed to be. All pure, so
// they are pinned here rather than through the form: the same normalisation has to hold
// for whoever writes the field later (an importer, the API), not only for today's editor.

describe('normalizeCustomFields', () => {
  it('keeps a well-formed pair and trims both sides', () => {
    expect(normalizeCustomFields([{ key: '  MAC  ', value: '  3c:22:fb  ' }])).toEqual([
      { key: 'MAC', value: '3c:22:fb' },
    ]);
  });

  it('drops a row with no key — a value with no name is not an attribute', () => {
    expect(normalizeCustomFields([{ key: '   ', value: 'orphan' }])).toEqual([]);
  });

  it('keeps a row whose VALUE is empty — "not known yet" is a real state', () => {
    expect(normalizeCustomFields([{ key: 'Serial', value: '' }])).toEqual([
      { key: 'Serial', value: '' },
    ]);
  });

  it('collapses duplicate keys case-insensitively, keeping the first', () => {
    expect(
      normalizeCustomFields([
        { key: 'MAC', value: 'first' },
        { key: 'mac', value: 'second' },
      ])
    ).toEqual([{ key: 'MAC', value: 'first' }]);
  });

  it('truncates instead of rejecting, so a long paste still saves what matters', () => {
    const [f] = normalizeCustomFields([{ key: 'k'.repeat(200), value: 'v'.repeat(2000) }]);
    expect(f.key).toHaveLength(MAX_KEY_LENGTH);
    expect(f.value).toHaveLength(MAX_VALUE_LENGTH);
  });

  it('caps the array, since it is embedded in every item the list page loads', () => {
    const many = Array.from({ length: MAX_CUSTOM_FIELDS + 20 }, (_, i) => ({ key: `k${i}`, value: 'v' }));
    expect(normalizeCustomFields(many)).toHaveLength(MAX_CUSTOM_FIELDS);
  });

  it('ignores junk entries and a non-array input rather than throwing', () => {
    expect(normalizeCustomFields([null, 'x', 42, { key: 'ok', value: 'y' }])).toEqual([
      { key: 'ok', value: 'y' },
    ]);
    expect(normalizeCustomFields('nope')).toEqual([]);
    expect(normalizeCustomFields(undefined)).toEqual([]);
  });

  it('coerces non-string values instead of dropping the row', () => {
    expect(normalizeCustomFields([{ key: 'Rack unit', value: 12 }])).toEqual([
      { key: 'Rack unit', value: '12' },
    ]);
  });
});

describe('parseCustomFields', () => {
  it('reads the JSON the form posts', () => {
    expect(parseCustomFields('[{"key":"Firmware","value":"1.4.2"}]')).toEqual([
      { key: 'Firmware', value: '1.4.2' },
    ]);
  });

  it('returns [] for the default empty payload and for broken JSON', () => {
    expect(parseCustomFields('[]')).toEqual([]);
    expect(parseCustomFields('{oops')).toEqual([]);
    expect(parseCustomFields('{"key":"not an array"}')).toEqual([]);
  });
});

describe('customFieldsMatch', () => {
  const fields = [
    { key: 'MAC', value: '3C:22:FB:01' },
    { key: 'Rack unit', value: 'U14' },
  ];

  it('matches on the attribute NAME', () => {
    expect(customFieldsMatch(fields, 'rack')).toBe(true);
  });

  it('matches on the attribute VALUE, case-insensitively', () => {
    expect(customFieldsMatch(fields, '3c:22')).toBe(true);
  });

  it('is false for a miss, and for an empty query or empty list', () => {
    expect(customFieldsMatch(fields, 'zzz')).toBe(false);
    expect(customFieldsMatch(fields, '   ')).toBe(false);
    expect(customFieldsMatch([], 'mac')).toBe(false);
    expect(customFieldsMatch(undefined, 'mac')).toBe(false);
  });
});
