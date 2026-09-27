import { defineConfig } from 'vitest/config';
import base from './vitest.config';

// Integration tests (#331): the parts unit tests mock, run against a REAL MongoDB. They need
// MONGO_URI (CI uses the MongoDB service container of the build job):
//
//   MONGO_URI=mongodb://127.0.0.1:27017 npm run test:integration
//
// Each file connects to its own throwaway database (src/test/mongo.ts) and drops it after, so
// files can run in parallel and never touch real data. `*.int.test.ts` files are excluded from
// the unit run (`npm test`), which has no database.
// Spread, not mergeConfig: mergeConfig concatenates `include`, which would run the unit suite too.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['src/**/*.int.test.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
