import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  documentUrl,
  editorDocumentFixture,
  expectLayerCanvasToHavePixels,
  expectNoBrowserIssues,
  fillLayerFixture,
  setupBrowserTestPage,
  switchToNodeView,
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
  await expect(start.getByRole('button', { name: 'AI image' })).toBeVisible();
  await expect(start.getByRole('button', { name: 'Add text' })).toBeVisible();

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
});

test('mobile nodes chrome keeps toolbar and bottom actions separated', async ({ page }) => {
  await page.goto(documentUrl(layeredFillDocument));
  await switchToNodeView(page);

  const layout = await page.evaluate(() => {
    const toolbar = document.querySelector('.node-canvas-toolbar')?.getBoundingClientRect();
    const bottom = document.querySelector('.main-nodes > .bottom-bar')?.getBoundingClientRect();
    const actionBoxes = Array.from(document.querySelectorAll('.main-nodes > .bottom-bar button')).map((button) => {
      const box = button.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    });
    return {
      toolbar: toolbar ? { top: toolbar.top, bottom: toolbar.bottom } : null,
      bottom: bottom ? { top: bottom.top, bottom: bottom.bottom, scrollWidth: bottom.width } : null,
      actionBoxes,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  expect(layout.toolbar).not.toBeNull();
  expect(layout.bottom).not.toBeNull();
  expect(layout.toolbar?.bottom ?? 0).toBeLessThan(layout.bottom?.top ?? 0);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);

  const visibleActions = layout.actionBoxes.filter((box) => box.right > 0 && box.left < layout.viewportWidth);
  for (let index = 1; index < visibleActions.length; index += 1) {
    const previous = visibleActions[index - 1];
    const current = visibleActions[index];
    const sameRow = current.top < previous.bottom && current.bottom > previous.top;
    if (sameRow) expect(current.left).toBeGreaterThanOrEqual(previous.right - 1);
  }
});

test('mobile layer row context menu stays inside the viewport', async ({ page }) => {
  await openLayeredFillDocument(page);
  await hoverFirstLayerRow(page);
  await page
    .getByLabel(/Open actions for layer/)
    .first()
    .click();

  const menuBox = await page.locator('.layer-context-menu').evaluate((menu) => {
    const box = menu.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, viewportWidth: window.innerWidth };
  });

  expect(menuBox.left).toBeGreaterThanOrEqual(8);
  expect(menuBox.right).toBeLessThanOrEqual(menuBox.viewportWidth - 7);
  expect(menuBox.bottom).toBeGreaterThan(menuBox.top);
});

test('mobile layer add menu stays inside the viewport', async ({ page }) => {
  await openLayeredFillDocument(page);

  await page.locator('.layer-panel-header').getByRole('button', { name: 'Add layer' }).click();
  const menu = page.locator('.add-library-layer-menu');
  await expect(menu).toBeVisible({ timeout: 15_000 });

  await expectFloatingMenuInsideViewport(menu);
});

test('mobile layer rows keep insert controls out of row actions', async ({ page }) => {
  await openLayeredFillDocument(page);
  const firstRow = await hoverFirstLayerRow(page);
  await expect(firstRow.getByRole('button', { name: /Insert layer above/ })).toHaveCount(0);
});

async function openLayeredFillDocument(page: Page) {
  await page.goto(documentUrl(layeredFillDocument));
  await expectLayerCanvasToHavePixels(page);
}

async function hoverFirstLayerRow(page: Page) {
  const firstRow = page.locator('.layer-row').first();
  await firstRow.hover();
  return firstRow;
}

async function expectFloatingMenuInsideViewport(menu: Locator) {
  const menuBox = await menu.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });

  expect(menuBox.left).toBeGreaterThanOrEqual(7);
  expect(menuBox.right).toBeLessThanOrEqual(menuBox.viewportWidth - 7);
  expect(menuBox.top).toBeGreaterThanOrEqual(7);
  expect(menuBox.bottom).toBeLessThanOrEqual(menuBox.viewportHeight - 7);
  expect(menuBox.bottom).toBeGreaterThan(menuBox.top);
}
