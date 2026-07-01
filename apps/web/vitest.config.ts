import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Unit-test runner for pure library code. No DOM, no jsdom, no live Mongo — these
// tests exercise deterministic helpers only, so the default node environment is fine
// and keeps CI fast (no browser, no database). Add coverage/setup files later as the
// suite grows into API-shape tests.
export default defineConfig({
  // Mirror the tsconfig `@/*` → src/* path alias so tests can import lib modules the same
  // way production code does (e.g. `@/lib/aiFeatures`), not just via relative paths.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
