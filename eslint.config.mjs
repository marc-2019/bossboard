// ESLint v9 flat config — monorepo baseline.
//
// Restores a *functional* lint across apps/api, apps/mobile, apps/web and
// packages/shared. The repo had no eslint config at all, so `npm run lint`
// failed everywhere (ESLint v9 requires flat config; the old `--ext` flag and
// `next lint` no longer work). Rules are intentionally warn-only so this is a
// non-blocking baseline: CI stays green while surfacing issues to triage.
// Ratchet individual rules to "error" over time.
//
// Uses only packages already hoisted at the workspace root
// (@typescript-eslint/parser, @typescript-eslint/eslint-plugin, globals) — no
// new dependencies.

import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/build/**',
      '**/.expo/**',
      '**/web-build/**',
      '**/coverage/**',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/*.config.cjs',
      '**/*.config.ts',
      '**/.maestro/**',
      'packages/shared/dist/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2021,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'prefer-const': 'warn',
      'no-var': 'warn',
      eqeqeq: ['warn', 'smart'],
      'no-console': 'off',
    },
  },
];
