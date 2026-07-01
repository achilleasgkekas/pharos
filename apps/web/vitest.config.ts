import { defineConfig } from 'vitest/config';

// Unit-test runner for pure library code. No DOM, no jsdom, no live Mongo — these
// tests exercise deterministic helpers only, so the default node environment is fine
// and keeps CI fast (no browser, no database). Add coverage/setup files later as the
// suite grows into API-shape tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
