import { expect, test } from '@playwright/test';
import { expectNoBrowserIssues, gotoDocument, setupBrowserTestPage } from './helpers';
import { layersTreeDocument } from './layersTreeFixture';

// v0.50 U6 on phones: nested folders start collapsed, indentation is capped, and nothing scrolls sideways.

test.beforeEach(async ({ page }) => setupBrowserTestPage(page));
test.afterEach(async ({ page }) => expectNoBrowserIssues(page));

test('mobile layers tree starts with nested folders collapsed and expands on tap', async ({ page }) => {
  await gotoDocument(page, layersTreeDocument);
  const tree = page.getByRole('tree', { name: 'Layer tree' });
  await expect(tree).toBeVisible({ timeout: 15_000 });

  const cutout = tree.getByRole('treeitem', { name: 'Cutout, mask', exact: true });
  await expect(cutout).toHaveAttribute('aria-expanded', 'false');
  await expect(tree.getByRole('treeitem', { name: 'Matte, text layer', exact: true })).toHaveCount(0);
  await expect(tree.getByRole('treeitem', { name: 'Not in output, 1 item', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );

  await cutout.locator('.layer-tree-caret').click();
  await expect(cutout).toHaveAttribute('aria-expanded', 'true');
  const mask = tree.getByRole('treeitem', { name: 'Mask, 1 item', exact: true });
  await mask.click();
  const matte = tree.getByRole('treeitem', { name: 'Matte, text layer', exact: true });
  await expect(matte).toBeVisible();
  await matte.click();
  await expect(matte).toHaveAttribute('aria-selected', 'true');

  const layout = await page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>('[role="tree"] [role="treeitem"]')];
    return {
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      maxIndent: Math.max(...rows.map((row) => Number.parseFloat(getComputedStyle(row).paddingInlineStart))),
    };
  });
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  // Level 4 rows are indented no deeper than the level-3 cap: --space-3 plus two --space-2 steps.
  expect(layout.maxIndent).toBeLessThanOrEqual(12 + 2 * 8 + 1);
});

test('mobile layers tree moves a row from its actions menu in one undo step', async ({ page }) => {
  await gotoDocument(page, layersTreeDocument);
  const tree = page.getByRole('tree', { name: 'Layer tree' });
  await expect(tree).toBeVisible({ timeout: 15_000 });
  const topLevel = () =>
    tree
      .locator('[role="treeitem"][aria-level="1"]')
      .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')));
  const initial = await topLevel();
  expect(initial.slice(0, 2)).toEqual(['Headline, text layer', 'Glow, merge group, screen · 70%']);

  await tree.getByRole('treeitem', { name: 'Headline, text layer', exact: true }).hover();
  await tree.getByRole('button', { name: 'Open actions for layer Headline' }).click();
  await page.getByRole('menuitem', { name: 'Move down' }).click();
  await expect.poll(topLevel).toEqual([initial[1], initial[0], ...initial.slice(2)]);
  await expect(page.locator('.layer-tree-edit-status')).toHaveText('Moved Headline down.');

  await page.getByRole('button', { name: 'Undo' }).first().click();
  await expect.poll(topLevel).toEqual(initial);
});

test('mobile graph-only rows open Edit in Nodes from their actions button', async ({ page }) => {
  await gotoDocument(page, layersTreeDocument);
  const tree = page.getByRole('tree', { name: 'Layer tree' });
  await expect(tree).toBeVisible({ timeout: 15_000 });

  const grade = tree.getByRole('treeitem', { name: 'Grade, grade', exact: true });
  await grade.hover();
  await grade.getByRole('button', { name: 'Open actions for Grade' }).click();
  await page.getByRole('menuitem', { name: 'Edit in Nodes' }).click();
  await expect(page.locator('.react-flow__node[data-id="tree-grade"]')).toHaveClass(/selected/, { timeout: 15_000 });
});
