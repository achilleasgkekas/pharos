import { describe, it, expect } from 'vitest';
import { billedBytes } from './dbStats';

// Only the PURE helper is unit-tested here (no DB). The DB-touching functions (readDbStats /
// sampleTenantStorage / sampleAllTenants) are SaaS-only and no-op for the default tenant via
// the isSampleable()/saasMode() gating, exercised by integration once sampling is scheduled.

const MB = 1024 * 1024;

describe('billedBytes', () => {
  it('bills physical on-disk footprint = storageSize + indexSize', () => {
    expect(billedBytes({ storageSize: 4 * MB, indexSize: MB })).toBe(5 * MB);
  });

  it('ignores dataSize (uncompressed logical size), which is not what is billed', () => {
    // dataSize is typically larger than the compressed storageSize; it must not leak in.
    expect(billedBytes({ dataSize: 100 * MB, storageSize: 4 * MB, indexSize: MB })).toBe(5 * MB);
  });

  it('treats missing fields as 0', () => {
    expect(billedBytes({})).toBe(0);
    expect(billedBytes({ storageSize: 3 * MB })).toBe(3 * MB);
    expect(billedBytes({ indexSize: 2 * MB })).toBe(2 * MB);
  });

  it('floors at 0 for defensive/garbage negative inputs', () => {
    expect(billedBytes({ storageSize: -100, indexSize: -50 })).toBe(0);
  });
});
