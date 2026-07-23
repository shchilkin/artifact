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
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.9);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(43.9);
  }

  await layers.focus();
  await page.keyboard.press('ArrowRight');
  await expect(nodes).toBeFocused();
  await expect(nodes).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.node-canvas-root')).toBeVisible({ timeout: 15_000 });
});

test('focused layer rows support keyboard selection without changing document commands', async ({ page }) => {
  await gotoDocument(page, workflowDocument);

  const baseRow = page.locator('.layer-row[data-layer-id="v045-base"]');
  await baseRow.getByRole('checkbox', { name: 'Select Base plate layer' }).focus();
  await page.keyboard.press('Enter');
  await expect(baseRow).toHaveAttribute('data-editor-row-selected', 'true');

  const inkRow = page.locator('.layer-row[data-layer-id="v045-ink"]');
  await inkRow.getByRole('checkbox', { name: 'Select Signal ink layer' }).focus();
  await page.keyboard.press('Space');
  await expect(inkRow).toHaveAttribute('data-editor-row-selected', 'true');
  await expect(baseRow).toHaveAttribute('data-editor-row-selected', 'false');
});

test('layer context menu supports Home End Escape and returns focus to row selection', async ({ page }) => {
  await gotoDocument(page, workflowDocument);

  const row = page.locator('.layer-row[data-layer-id="v045-ink"]');
  const selection = row.getByRole('checkbox', { name: 'Select Signal ink layer' });
  await row.hover();
  await row.getByRole('button', { name: 'Open actions for layer Signal ink' }).click();

  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const rename = menu.getByRole('menuitem', { name: 'Rename' });
  await expect(rename).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: 'Create area' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(rename).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(selection).toBeFocused();
});

test('Layers Add Library announces keyboard navigation and returns focus after layered Escape', async ({ page }) => {
  await gotoDocument(page, workflowDocument);

  const trigger = page.getByRole('button', { name: 'Add layer' });
  await trigger.click();
  const search = page.getByRole('combobox', { name: 'Search layers and effects' });
  await expect(search).toBeFocused();

  await search.fill('fill');
  const firstActiveId = await search.getAttribute('aria-activedescendant');
  expect(firstActiveId).toBeTruthy();
  await expect(page.locator(`[id="${firstActiveId}"]`)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  const lastActiveId = await search.getAttribute('aria-activedescendant');
  expect(lastActiveId).toBeTruthy();
  await expect(page.locator(`[id="${lastActiveId}"]`)).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('Escape');
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(search).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('Nodes Add Library returns focus to the Add node command after dismissal', async ({ page }) => {
  await gotoDocument(page, workflowDocument);

  await page.getByRole('tab', { name: 'Switch to nodes view' }).click();
  await expect(page.locator('.node-canvas-root')).toBeVisible({ timeout: 15_000 });

  const trigger = page.getByRole('button', { name: 'Add node' });
  await trigger.click();
  const search = page.getByRole('combobox', { name: 'Search nodes and effects' });
  await expect(search).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(search).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('document import confirmation uses the editor overlay and returns focus after cancellation', async ({ page }) => {
  await gotoDocument(page, workflowDocument);

  const trigger = page.getByRole('button', { name: 'Open document file' });
  const fileChooserPromise = page.waitForEvent('filechooser');
  await trigger.click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'workflow.artifact.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(workflowDocument)),
  });

  await expect(page.getByRole('dialog', { name: 'Open artifact file' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Open artifact file' })).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('style guide renders live editor command, notice, organization, and creation patterns', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/docs/style-guide');

  await expect(page.getByRole('group', { name: 'History commands' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Output commands' })).toBeVisible();
  await expect(page.getByText('Imported source is ready to edit.')).toBeVisible();
  await expect(page.getByText('One selected layer is hidden and will not appear in export.')).toBeVisible();
  await expect(page.locator('.style-guide-layer-organization .layer-area-folder')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Collapsed organization group', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Empty organization group', exact: true })).toBeVisible();
  await expect(page.locator('.style-guide-add-library-surface .add-library-row').first()).toBeVisible();
  await expect(page.locator('.style-guide-add-library-state [data-preview-state="loading"]')).toHaveCount(1);
  await expect(page.locator('.style-guide-add-library-state [data-preview-state="ready"]')).toHaveCount(1);
  await expect(page.locator('.style-guide-add-library-state [data-preview-state="fallback"]')).toHaveCount(1);
  await expect(page.locator('.style-guide-add-library-state [data-preview-state="failed"]')).toHaveCount(1);
  await expectWorkflowSpecimenMatrix(page);

  const overlayTrigger = page.getByRole('button', { name: 'Open editor popover' });
  await overlayTrigger.click();
  const overlayContent = page.locator('.style-guide-editor-overlay-content').filter({ hasText: 'Add source' });
  await expect(overlayContent.getByText('Add source', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(overlayContent).toBeHidden();
  await expect(overlayTrigger).toBeFocused();

  await expectNoPageOverflow(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await expectWorkflowSpecimenMatrix(page);
  await expectNoPageOverflow(page);
});

async function expectWorkflowSpecimenMatrix(page: import('@playwright/test').Page) {
  const specimens = page.locator('[data-editor-specimen]');
  await expect(specimens).toHaveCount(48);
  const ids = await specimens.evaluateAll((elements) =>
    elements.map((element) => (element as HTMLElement).dataset.editorSpecimen),
  );
  expect(new Set(ids).size).toBe(48);
  expect(ids.filter((id) => id?.startsWith('command-'))).toHaveLength(8);
  expect(ids.filter((id) => id?.startsWith('row-'))).toHaveLength(13);
  expect(ids.filter((id) => id?.startsWith('organization-'))).toHaveLength(9);
  expect(ids.filter((id) => id?.startsWith('notice-'))).toHaveLength(9);
  expect(ids.filter((id) => id?.startsWith('overlay-'))).toHaveLength(9);
}

async function expectNoPageOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}
