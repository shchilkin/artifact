import { defineConfig, devices } from '@playwright/test';

const useProductionPreview = process.env.PLAYWRIGHT_WEB_SERVER_MODE === 'preview';
const webServerPort = process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? '4173';
const webServerBaseUrl = `http://127.0.0.1:${webServerPort}`;

export default defineConfig({
  testDir: './tests/browser',
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: webServerBaseUrl,
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 960 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chromium',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-webkit',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: useProductionPreview
      ? `../../node_modules/.bin/vite preview --outDir build/client --host 127.0.0.1 --port ${webServerPort} --strictPort`
      : `../../node_modules/.bin/react-router dev --host 127.0.0.1 --port ${webServerPort} --strictPort`,
    cwd: './apps/web',
    env: {
      ...process.env,
      VITE_AI_API_BASE_URL: webServerBaseUrl,
      VITE_AUTH_API_BASE_URL: '',
    },
    url: webServerBaseUrl,
    reuseExistingServer: !process.env.CI && process.env.PLAYWRIGHT_REUSE_SERVER !== '0',
    timeout: 120_000,
  },
});
