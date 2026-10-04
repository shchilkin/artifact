import { expect, type Page, test } from '@playwright/test';
import {
  expectNoBrowserIssues,
  expectStoredLayerField,
  gotoDocument,
  setupBrowserTestPage,
  switchToLayerView,
  switchToNodeView,
} from './helpers';
import { layersTreeDocument } from './layersTreeFixture';

// v0.50 U6: custom graphs show a read-only, graph-derived Layers tree.

test.beforeEach(async ({ page }) => setupBrowserTestPage(page));
test.afterEach(async ({ page }) => expectNoBrowserIssues(page));

function layerTree(page: Page) {
  return page.getByRole('tree', { name: 'Layer tree' });
}

function treeItem(page: Page, name: string | RegExp) {
  return layerTree(page).getByRole('treeitem', { name, exact: typeof name === 'string' });
}

async function treeOutline(page: Page) {
  return layerTree(page)
    .getByRole('treeitem')
    .evaluateAll((items) =>
      items.map((item) => `${item.getAttribute('aria-level')} ${item.getAttribute('aria-label')}`),
    );
}

async function openTree(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoDocument(page, layersTreeDocument);
  await expect(layerTree(page)).toBeVisible({ timeout: 15_000 });
}

test('custom graphs show the graph-derived tree with merge folders, nested inputs, references, and Not in output', async ({
  page,
}) => {
  await openTree(page);

  const viewSwitch = page.getByRole('group', { name: 'Layers view' });
  await expect(viewSwitch.getByRole('button', { name: 'Structure' })).toHaveAttribute('aria-pressed', 'true');
  await expect(layerTree(page)).toHaveAttribute('aria-multiselectable', 'true');
  expect(await treeOutline(page)).toEqual([
    '1 Headline, text layer',
    '1 Glow, merge group, screen · 70%',
    '2 Cutout, mask',
    '3 Mask, 1 item',
    '4 Matte, text layer',
    '2 Badge, fill layer',
    '2 Pattern, repeat',
    '3 Pattern source, 1 item',
    '4 Dot, text layer',
    '2 Backdrop, shared fill layer, go to its full entry',
    '1 Grade, grade',
    '1 Backdrop, fill layer',
    '1 Not in output, 1 item',
    '2 Unused fill, fill layer',
  ]);
  await expect(treeItem(page, 'Headline, text layer').getByLabel('Graph area: Type')).toBeVisible();
  await expect(treeItem(page, 'Headline, text layer')).toHaveAttribute('data-area-rail', 'true');
  await expect(page.locator('.layer-row-drag-handle:visible')).toHaveCount(0);

  await viewSwitch.getByRole('button', { name: 'Areas' }).click();
  await expect(viewSwitch.getByRole('button', { name: 'Areas' })).toHaveAttribute('aria-pressed', 'true');
  await expect(layerTree(page)).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Layer stack' })).toContainText('Type');
  await viewSwitch.getByRole('button', { name: 'Structure' }).click();
  await expect(layerTree(page)).toBeVisible();
});

test('the tree supports keyboard navigation, expand and collapse, selection, and rename', async ({ page }) => {
  await openTree(page);
  const headline = treeItem(page, 'Headline, text layer');
  const glow = treeItem(page, 'Glow, merge group, screen · 70%');

  await expect(headline).toHaveAttribute('tabindex', '0');
  await headline.focus();
  await page.keyboard.press('ArrowDown');
  await expect(glow).toBeFocused();
  await expect(headline).toHaveAttribute('tabindex', '-1');

  await page.keyboard.press('ArrowLeft');
  await expect(glow).toHaveAttribute('aria-expanded', 'false');
  await expect(treeItem(page, 'Cutout, mask')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(glow).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(treeItem(page, 'Cutout, mask')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(glow).toBeFocused();

  await page.keyboard.press('End');
  const unused = treeItem(page, 'Unused fill, fill layer');
  await expect(unused).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(unused).toHaveAttribute('aria-selected', 'true');
  const inspector = page.getByRole('complementary', { name: 'Layer settings' });
  await expect(inspector.locator('.editor-target-header').first()).toContainText('Unused fill');

  await page.keyboard.press('F2');
  const rename = page.getByRole('textbox', { name: 'Rename layer Unused fill' });
  await expect(rename).toBeFocused();
  await rename.fill('Spare fill');
  await rename.press('Enter');
  await expect(treeItem(page, 'Spare fill, fill layer')).toBeVisible();
  await expectStoredLayerField(page, { key: 'id', value: 'tree-unused' }, 'name', 'Spare fill');

  await page.keyboard.press('Home');
  await expect(headline).toBeFocused();

  // Type-ahead jumps to the next visible row whose name starts with the typed character.
  await page.keyboard.press('b');
  await expect(treeItem(page, 'Badge, fill layer')).toBeFocused();
  await page.keyboard.press('b');
  await expect(treeItem(page, 'Backdrop, shared fill layer, go to its full entry')).toBeFocused();
});

test('collapsing a folder from its caret keeps focus in the tree', async ({ page }) => {
  await openTree(page);
  const matte = treeItem(page, 'Matte, text layer');
  await matte.focus();

  await treeItem(page, 'Glow, merge group, screen · 70%').locator('.layer-tree-caret').click();
  await expect(matte).toHaveCount(0);
  await expect(treeItem(page, 'Glow, merge group, screen · 70%')).toBeFocused();
});

test('tree rows keep visibility and the inspector working, and graph-only nodes point to Nodes', async ({ page }) => {
  await openTree(page);

  const badge = treeItem(page, 'Badge, fill layer');
  await badge.click();
  await badge.focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Hide' }).click();
  await expect(treeItem(page, 'Badge, fill layer, hidden')).toBeVisible();
  await expectStoredLayerField(page, { key: 'id', value: 'tree-badge' }, 'visible', false);

  await treeItem(page, 'Cutout, mask').click();
  await expect(treeItem(page, 'Cutout, mask')).toHaveAttribute('aria-selected', 'true');
  const inspector = page.getByRole('complementary', { name: 'Layer settings' });
  await expect(inspector).toContainText('Cutout');
  await expect(inspector).toContainText('edited in Nodes');
});

test('a reference row selects the full entry in Layers and Nodes', async ({ page }) => {
  await openTree(page);

  const reference = treeItem(page, 'Backdrop, shared fill layer, go to its full entry');
  await reference.click();
  const canonical = treeItem(page, 'Backdrop, fill layer');
  await expect(canonical).toHaveAttribute('aria-selected', 'true');
  await expect(canonical).toBeFocused();

  await switchToNodeView(page);
  await expect(page.locator('.react-flow__node[data-id="tree-backdrop"]')).toHaveClass(/selected/, {
    timeout: 15_000,
  });
  await switchToLayerView(page);
  await expect(treeItem(page, 'Backdrop, fill layer')).toHaveAttribute('aria-selected', 'true');
});
