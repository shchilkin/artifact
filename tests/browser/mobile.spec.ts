import { expect, test } from '@playwright/test';
import {
  documentUrl,
  editorDocumentFixture,
  expectLayerCanvasToHavePixels,
  expectNoBrowserIssues,
  fillLayerFixture,
  setupBrowserTestPage,
} from './helpers';

const mobileFillLayers = [
  fillLayerFixture({ id: 'mobile-bottom-fill', name: 'Bottom fill', color: '#2255cc' }),
  fillLayerFixture({ id: 'mobile-top-fill', name: 'Top fill', color: '#dd3322' }),
];
const layeredFillDocument = editorDocumentFixture(mobileFillLayers);

test.beforeEach(async ({ page }) => setupBrowserTestPage(page));
test.afterEach(async ({ page }) => expectNoBrowserIssues(page));

test('mobile layers smoke keeps canvas actions and layer list usable', async ({ page }) => {
  await page.goto(documentUrl(layeredFillDocument));
  await expectLayerCanvasToHavePixels(page);

  await expect(page.getByRole('tab', { name: 'Switch to layers view' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Switch to nodes view' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'export' })).toBeVisible();

  await page.getByText('Top fill', { exact: true }).click();
  await expect(page.locator('.layer-row.bg-accent-dim').filter({ hasText: 'Top fill' })).toBeVisible();

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    sidebarHeight: document.querySelector('.sidebar')?.getBoundingClientRect().height ?? 0,
    canvasHeight: document.querySelector('.canvas-area')?.getBoundingClientRect().height ?? 0,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.sidebarHeight).toBeGreaterThan(160);
  expect(layout.canvasHeight).toBeGreaterThan(180);
});

test('mobile empty start exposes starter actions without horizontal overflow', async ({ page }) => {
  await page.goto('/app?new=blank');

  const start = page.locator('.empty-canvas-start');
  await expect(start).toBeVisible({ timeout: 15_000 });
  await expect(start.getByRole('button', { name: 'AI', exact: true })).toBeVisible();
  await expect(start.getByRole('button', { name: 'Text', exact: true })).toBeVisible();

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
});
