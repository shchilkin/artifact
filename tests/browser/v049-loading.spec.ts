import { expect, test } from '@playwright/test';

import { expectCanvasHasVisiblePixels, expectNoBrowserIssues, setupBrowserTestPage } from './helpers';

test.beforeEach(async ({ page }) => setupBrowserTestPage(page));
test.afterEach(async ({ page }) => expectNoBrowserIssues(page));

test('home hero artwork renders through the lazily loaded renderer', async ({ page }) => {
  const rendererRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/app\/utils\/renderer\.ts|\/assets\/renderer-/.test(request.url())) rendererRequests.push(request.url());
  });

  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Site navigation' })).toBeVisible();

  await expectCanvasHasVisiblePixels(page.locator('.home-canvas-frame canvas.home-canvas--front').first(), 20_000);
  expect(rendererRequests.length).toBeGreaterThan(0);
});
