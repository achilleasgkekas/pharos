import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

// Flat config for ESLint 9. There was NO config file at all until #136: `next lint` was in
// package.json but had nothing to run, so the linter has never actually guarded this repo.
//
// The rule set is deliberately the one the codebase can pass TODAY. A gate that fails on 514
// pre-existing findings gets switched off within a week; one that fails only on NEW mistakes gets
// trusted. `no-explicit-any` is therefore a warning (514 hits, mostly deliberate `any` in test
// doubles and Mongoose lean() shapes) — visible in the output, not a blocker — and the test files
// keep the freedoms that make test doubles readable.
export default [
  { ignores: ['.next/**', 'node_modules/**', 'public/**', 'next-env.d.ts', 'coverage/**', '**/._*'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Debt, not a defect: tracked as a warning so it stops growing silently without blocking CI.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Test doubles legitimately pass `children` as a prop and shape objects loosely.
    files: ['**/*.test.ts', '**/*.test.tsx', 'src/test/**'],
    rules: { 'react/no-children-prop': 'off', '@typescript-eslint/no-explicit-any': 'off' },
  },
];
