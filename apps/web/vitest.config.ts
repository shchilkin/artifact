import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'tests/browser/**'],
    setupFiles: ['./app/test-fixtures/render/canvasPolyfill.ts'],
  },
});
