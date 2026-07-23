import { expect, test } from '@playwright/test';
import {
  editorDocumentFixture,
  expectNoBrowserIssues,
  fillLayerFixture,
  gotoDocument,
  setupBrowserTestPage,
} from './helpers';

const workflowDocument = editorDocumentFixture([
  fillLayerFixture({ id: 'v045-base', name: 'Base plate', color: '#243b66' }),
  fillLayerFixture({ id: 'v045-ink', name: 'Signal ink', color: '#dc604f' }),
]);

test.beforeEach(async ({ page }) => {
  await setupBrowserTestPage(page);
});

test.afterEach(async ({ page }) => {
  expectNoBrowserIssues(page);
});

test('editor mode navigation keeps its existing Layers and Nodes contract accessible', async ({ page }) => {
  await gotoDocument(page, workflowDocument);

  const navigation = page.getByRole('navigation', { name: 'Editor navigation' });
  await expect(navigation).toBeVisible();

  const layers = page.getByRole('tab', { name: 'Switch to layers view' });
  const nodes = page.getByRole('tab', { name: 'Switch to nodes view' });
  await expect(layers).toHaveAttribute('aria-selected', 'true');
  await expect(nodes).toHaveAttribute('aria-selected', 'false');

  for (const tab of [layers, nodes]) {
    const box = await tab.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  }

  await layers.focus();
  await page.keyboard.press('ArrowRight');
  await expect(nodes).toBeFocused();
  await expect(nodes).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.node-canvas-root')).toBeVisible();
});

test('focused layer rows support keyboard selection without changing document commands', async ({ page }) => {
  await gotoDocument(page, workflowDocument);

  const baseRow = page.locator('.layer-row[data-layer-id="v045-base"]');
  await baseRow.focus();
  await page.keyboard.press('Enter');
  await expect(baseRow).toHaveAttribute('aria-selected', 'true');

  const inkRow = page.locator('.layer-row[data-layer-id="v045-ink"]');
  await inkRow.focus();
  await page.keyboard.press('Space');
  await expect(inkRow).toHaveAttribute('aria-selected', 'true');
  await expect(baseRow).toHaveAttribute('aria-selected', 'false');
});

test('Layers Add Library dismisses with Escape and returns focus to its trigger', async ({ page }) => {
  await gotoDocument(page, workflowDocument);

  const trigger = page.getByRole('button', { name: 'Add layer' });
  await trigger.click();
  await expect(page.getByLabel('Search layers and effects')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Search layers and effects')).toBeHidden();
  await expect(trigger).toBeFocused();
});
