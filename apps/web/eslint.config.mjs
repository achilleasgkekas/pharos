import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

// Flat config (ESLint 10; flat since 9). There was NO config file at all until #136: `next lint` was in
// package.json but had nothing to run, so the linter had never guarded this repo.
//
// eslint-config-next 16 ships real flat configs, so they are imported directly; the FlatCompat
// bridge that v15 needed now throws ("Converting circular structure to JSON").
//
// The rule set is deliberately the one the codebase can pass TODAY. A gate that fails on 500
// pre-existing findings gets switched off within a week; one that fails only on NEW mistakes gets
// trusted. `no-explicit-any` is therefore a warning (mostly deliberate `any` in test doubles and
// Mongoose lean() shapes) — visible in the output, not a blocker — and test files keep the
// freedoms that make test doubles readable.
export default [
  { ignores: ['.next/**', 'node_modules/**', 'public/**', 'next-env.d.ts', 'coverage/**', '**/._*'] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Pinned rather than 'detect': eslint-plugin-react 7.x (bundled by eslint-config-next) detects
    // the version through context.getFilename(), which ESLint 10 removed, and crashes (#176).
    // Keep this in step with `react` in package.json.
    settings: { react: { version: '19.3' } },
    rules: {
      // Debt, not a defect: tracked as a warning so it stops growing silently without blocking CI.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Next 16 turns on the React Compiler's own lint rules. They are right — 27 of the 35 hits
      // are setState inside an effect, which really can cascade renders — but they are all
      // PRE-EXISTING, and a 35-error wall on an upgrade PR is how a gate gets switched off.
      // Warnings for now, tracked as its own piece of work (#171).
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'error',
      'react-hooks/globals': 'error',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'error',
      'react-hooks/preserve-manual-memoization': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Test doubles legitimately pass `children` as a prop and shape objects loosely.
    files: ['**/*.test.ts', '**/*.test.tsx', 'src/test/**'],
    rules: { 'react/no-children-prop': 'off', '@typescript-eslint/no-explicit-any': 'off' },
  },
];
