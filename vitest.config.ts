import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./app/test-fixtures/render/canvasPolyfill.ts'],
  },
});
