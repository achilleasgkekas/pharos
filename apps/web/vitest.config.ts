import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Unit-test runner for pure library code. No DOM, no jsdom, no live Mongo — these
// tests exercise deterministic helpers only, so the default node environment is fine
// and keeps CI fast (no browser, no database). Add coverage/setup files later as the
// suite grows into API-shape tests.
export default defineConfig({
  // Next keeps JSX as-is for its own compiler (tsconfig jsx: preserve); Vite 8's oxc transform
  // must be told to compile it, or any test importing a .tsx component fails to parse.
  oxc: { jsx: { runtime: 'automatic' } },
  // Mirror the tsconfig `@/*` → src/* path alias so tests can import lib modules the same
  // way production code does (e.g. `@/lib/aiFeatures`), not just via relative paths.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` is a build-time-only empty module (it errors if bundled client-side and
      // has no runtime). Vitest can't resolve the real package, so server modules that import it
      // (e.g. lib/mirror.ts) fail to load. Point it at an empty stub to test their pure exports.
      'server-only': fileURLToPath(new URL('./src/test/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
    // Only collected with `npm run test:coverage` (CI uploads the HTML report as an artifact).
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.ts', 'src/test/**'],
      reporter: ['text-summary', 'html', 'json-summary'],
    },
  },
});
