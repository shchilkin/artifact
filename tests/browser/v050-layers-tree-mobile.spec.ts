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
  // Level 4 rows are indented no deeper than the level-3 cap.
  expect(layout.maxIndent).toBeLessThanOrEqual(12 + 2 * 10 + 1);
});
