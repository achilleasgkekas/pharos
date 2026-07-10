import { describe, it, expect } from 'vitest';
import { matchedLineItemName } from './receiptSearch';

// Same construction as search-actions.ts rx(): escaped, case-insensitive, non-global.
function rx(q: string): RegExp {
  return new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

describe('matchedLineItemName', () => {
  it('returns null for empty / missing line items', () => {
    expect(matchedLineItemName(rx('wd'), undefined)).toBeNull();
    expect(matchedLineItemName(rx('wd'), null)).toBeNull();
    expect(matchedLineItemName(rx('wd'), [])).toBeNull();
  });

  it('matches on raw name when refinedName is blank', () => {
    const items = [{ name: 'WD BLUE SN570 250GB', refinedName: '' }];
    expect(matchedLineItemName(rx('sn570'), items)).toBe('WD BLUE SN570 250GB');
  });

  it('prefers refinedName for display when it is the field that matched', () => {
    const items = [{ name: 'WD BL SN570 250G NVME', refinedName: 'WD Blue SN570 250GB NVMe' }];
    expect(matchedLineItemName(rx('nvme'), items)).toBe('WD Blue SN570 250GB NVMe');
  });

  it('returns the first matching line item, not later ones', () => {
    const items = [
      { name: 'Cable', refinedName: 'USB-C Cable' },
      { name: 'Mouse', refinedName: 'Logitech Mouse' },
    ];
    expect(matchedLineItemName(rx('mouse'), items)).toBe('Logitech Mouse');
  });

  it('returns null when nothing matches', () => {
    const items = [{ name: 'Keyboard', refinedName: 'Mechanical Keyboard' }];
    expect(matchedLineItemName(rx('monitor'), items)).toBeNull();
  });

  it('is case-insensitive and works across repeated calls (no global-flag state)', () => {
    const items = [{ name: 'Roborock Vacuum', refinedName: '' }];
    const r = rx('roborock');
    expect(matchedLineItemName(r, items)).toBe('Roborock Vacuum');
    // second call with the same regex must still match (guards against a stray /g lastIndex)
    expect(matchedLineItemName(r, items)).toBe('Roborock Vacuum');
  });

  it('is defensive against blank / whitespace names', () => {
    const items = [{ name: '   ', refinedName: '' }, { name: 'Apple Pencil', refinedName: '  ' }];
    expect(matchedLineItemName(rx('pencil'), items)).toBe('Apple Pencil');
  });
});
