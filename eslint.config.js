import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    'dist',
    'build',
    '.react-router',
    'apps/web/build',
    'apps/web/.react-router',
    'apps/backoffice/.react-router',
    'api',
    '.claude',
    'test-results',
    'playwright-report',
  ]),
  {
    files: ['apps/api/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['apps/api/**'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    rules: {
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          allowExportNames: [
            'meta',
            'links',
            'headers',
            'loader',
            'action',
            'clientLoader',
            'clientAction',
            'HydrateFallback',
            'ErrorBoundary',
          ],
        },
      ],
    },
    languageOptions: {
      globals: globals.browser,
    },
  },
]);
