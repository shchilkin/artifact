import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['list']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4031',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 960 },
      },
    },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run build && PORT=4031 npm run preview',
    cwd: '.',
    url: 'http://127.0.0.1:4031',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
