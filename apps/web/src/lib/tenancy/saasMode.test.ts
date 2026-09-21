import { afterEach, expect, it, vi } from 'vitest';
import { saasMode } from './saasMode';
afterEach(() => vi.unstubAllEnvs());
it.each([undefined, '', 'off', 'on', 'true', '1', 'yes', ' ON '])(
  'does not reactivate the retired hosted product with SAAS_MODE=%s', (value) => {
    vi.stubEnv('SAAS_MODE', value);
    expect(saasMode()).toBe(false);
  },
);
