import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoBrowserIssues, gotoDocument, setupBrowserTestPage } from './helpers';
import { layersTreeDocument } from './layersTreeFixture';

// v0.50 U7: edit runs in the Layers tree. Every edit is one undo step.

test.beforeEach(async ({ page }) => setupBrowserTestPage(page));
test.afterEach(async ({ page }) => expectNoBrowserIssues(page));

const INITIAL_OUTLINE = [
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
];

function layerTree(page: Page) {
  return page.getByRole('tree', { name: 'Layer tree' });
}

function treeItem(page: Page, name: string) {
  return layerTree(page).getByRole('treeitem', { name, exact: true });
}

function treeStatus(page: Page) {
  return page.locator('.layer-tree-edit-status');
}

async function treeOutline(page: Page) {
  return layerTree(page)
    .getByRole('treeitem')
    .evaluateAll((items) =>
      items.map((item) => `${item.getAttribute('aria-level')} ${item.getAttribute('aria-label')}`),
    );
}

async function expectOutline(page: Page, expected: string[]) {
  await expect.poll(() => treeOutline(page), { timeout: 15_000 }).toEqual(expected);
}

async function openTree(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoDocument(page, layersTreeDocument);
  await expect(layerTree(page)).toBeVisible({ timeout: 15_000 });
  await expectOutline(page, INITIAL_OUTLINE);
}

async function undoOnceAndRedo(page: Page, edited: string[]) {
  await page.getByRole('button', { name: 'Undo' }).first().click();
  await expectOutline(page, INITIAL_OUTLINE);
  await page.getByRole('button', { name: 'Redo' }).first().click();
  await expectOutline(page, edited);
}

async function rowRects(page: Page) {
  return layerTree(page)
    .getByRole('treeitem')
    .evaluateAll((items) =>
      items.map((item) => {
        const rect = item.getBoundingClientRect();
        return [rect.top, rect.left, rect.width, rect.height].map((value) => Math.round(value * 10) / 10);
      }),
    );
}

type DragStep = 'dragstart' | 'dragover' | 'drop' | 'dragend';

/** Dispatches one drag event on `element`, at the upper or lower edge of `target`, sharing one DataTransfer. */
async function dispatchDrag(page: Page, step: DragStep, element: Locator, target: Locator, lower: boolean) {
  const handle = await element.elementHandle();
  const targetHandle = await target.elementHandle();
  await page.evaluate(
    ([node, over, type, atLower]) => {
      const store = window as unknown as { __treeDrag?: DataTransfer };
      if (type === 'dragstart') store.__treeDrag = new DataTransfer();
      const rect = over!.getBoundingClientRect();
      const init = {
        bubbles: true,
        cancelable: true,
        dataTransfer: store.__treeDrag,
        clientX: rect.left + rect.width / 2,
        clientY: atLower ? rect.bottom - 3 : rect.top + 3,
      };
      if (type === 'dragover') node!.dispatchEvent(new DragEvent('dragenter', init));
      node!.dispatchEvent(new DragEvent(type, init));
    },
    [handle, targetHandle, step, lower] as const,
  );
}

/**
 * Drags `source` onto the upper or lower half of `target` with real DragEvents. Each step is its own
 * task so React renders the drag state in between, like a pointer drag. Returns the row geometry
 * measured while the pointer is over the target, before the drop.
 */
async function dragRow(page: Page, source: Locator, target: Locator, half: 'upper' | 'lower') {
  const lower = half === 'lower';
  await dispatchDrag(page, 'dragstart', source, source, lower);
  await dispatchDrag(page, 'dragover', target, target, lower);
  await dispatchDrag(page, 'dragover', target, target, lower);
  const during = await rowRects(page);
  await dispatchDrag(page, 'drop', target, target, lower);
  await dispatchDrag(page, 'dragend', source, source, lower);
  return during;
}

test('dragging a row within its run reorders it in one undo step without shifting rows', async ({ page }) => {
  await openTree(page);
  const before = await rowRects(page);

  const during = await dragRow(page, treeItem(page, 'Grade, grade'), treeItem(page, 'Headline, text layer'), 'upper');
  // The drop line is drawn on the row itself; no row moves while dragging.
  expect(during).toEqual(before);

  const edited = [
    '1 Grade, grade',
    '1 Headline, text layer',
    ...INITIAL_OUTLINE.slice(1, 10),
    ...INITIAL_OUTLINE.slice(11),
  ];
  await expectOutline(page, edited);
  await expect(treeStatus(page)).toHaveText('Moved Grade above Headline.');
  await undoOnceAndRedo(page, edited);
});

test('dragging a row into a merge group and out of Not in output splices it between runs', async ({ page }) => {
  await openTree(page);

  await dragRow(page, treeItem(page, 'Unused fill, fill layer'), treeItem(page, 'Badge, fill layer'), 'upper');
  const edited = [...INITIAL_OUTLINE.slice(0, 5), '2 Unused fill, fill layer', ...INITIAL_OUTLINE.slice(5, 12)];
  await expectOutline(page, edited);
  await undoOnceAndRedo(page, edited);
});

test('Alt+Arrow keys move a row within its stack and announce it', async ({ page }) => {
  await openTree(page);
  const grade = treeItem(page, 'Grade, grade');
  await grade.focus();
  await page.keyboard.press('Alt+ArrowUp');

  const edited = [
    '1 Headline, text layer',
    '1 Grade, grade',
    '1 Glow, merge group, screen · 70%',
    ...INITIAL_OUTLINE.slice(2, 10),
    ...INITIAL_OUTLINE.slice(11),
  ];
  await expectOutline(page, edited);
  await expect(treeStatus(page)).toHaveText('Moved Grade up.');
  await expect(treeStatus(page)).toHaveAttribute('role', 'status');
  await expect(grade).toBeFocused();
  await undoOnceAndRedo(page, edited);
});

test('Move to places a row from the keyboard, including into another stack', async ({ page }) => {
  await openTree(page);
  const headline = treeItem(page, 'Headline, text layer');
  await headline.focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Move to…' }).click();
  await expect(treeStatus(page)).toContainText('Moving Headline.');
  await expect(treeItem(page, 'Headline, text layer, moving')).toBeFocused();

  await treeItem(page, 'Badge, fill layer').focus();
  await page.keyboard.press('Enter');
  const edited = [...INITIAL_OUTLINE.slice(1, 5), '2 Headline, text layer', ...INITIAL_OUTLINE.slice(5)];
  await expectOutline(page, edited);
  await expect(treeItem(page, 'Headline, text layer')).toBeFocused();
  await undoOnceAndRedo(page, edited);
});

test('blocked moves keep the document and say why', async ({ page }) => {
  await openTree(page);

  const backdrop = treeItem(page, 'Backdrop, fill layer');
  await expect(backdrop).toHaveAttribute('draggable', 'false');
  await backdrop.focus();
  await page.keyboard.press('Shift+F10');
  const moveUp = page.getByRole('menuitem', { name: 'Move up' });
  await expect(moveUp).toHaveAttribute('aria-disabled', 'true');
  // A blocked action stays focusable so it can say why.
  await expect(moveUp).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(treeStatus(page)).toHaveText('Backdrop feeds more than one input. Rewire it in Nodes.');

  await dragRow(
    page,
    treeItem(page, 'Dot, text layer'),
    treeItem(page, 'Backdrop, shared fill layer, go to its full entry'),
    'upper',
  );
  await expect(treeStatus(page)).toHaveText(
    'Rows can’t be dropped onto a shared use. Drop next to the full entry instead.',
  );

  await dragRow(page, treeItem(page, 'Glow, merge group, screen · 70%'), treeItem(page, 'Badge, fill layer'), 'upper');
  await expect(treeStatus(page)).toHaveText(
    'Glow has its own inputs, so it only moves within its stack. Move it in Nodes.',
  );
  await expectOutline(page, INITIAL_OUTLINE);
  await expect(page.getByRole('button', { name: 'Undo' }).first()).toBeDisabled();
});

test('deleting a row reconnects its stack in one undo step', async ({ page }) => {
  await openTree(page);
  await treeItem(page, 'Grade, grade').focus();
  await page.keyboard.press('Delete');

  const edited = [
    '1 Headline, text layer',
    '1 Glow, merge group, screen · 70%',
    ...INITIAL_OUTLINE.slice(2, 9),
    '2 Backdrop, shared fill layer, go to its full entry',
    '1 Backdrop, fill layer',
    ...INITIAL_OUTLINE.slice(12),
  ];
  await expectOutline(page, edited);
  await expect(treeStatus(page)).toHaveText('Deleted Grade.');
  await undoOnceAndRedo(page, edited);
});

test('deleting a shared node asks first in the editor dialog', async ({ page }) => {
  await openTree(page);
  const backdrop = treeItem(page, 'Backdrop, fill layer');
  await backdrop.focus();
  await page.keyboard.press('Delete');

  const dialog = page.getByRole('alertdialog', { name: 'Delete shared Backdrop?' });
  await expect(dialog).toContainText('used in more than one place');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expectOutline(page, INITIAL_OUTLINE);

  await backdrop.focus();
  await page.keyboard.press('Delete');
  await dialog.getByRole('button', { name: 'Delete' }).click();
  const edited = INITIAL_OUTLINE.filter((line) => !line.includes('Backdrop'));
  await expectOutline(page, edited);
  await undoOnceAndRedo(page, edited);
});

test('Edit in Nodes opens Nodes with the node selected', async ({ page }) => {
  await openTree(page);
  await treeItem(page, 'Cutout, mask').click();
  await treeItem(page, 'Cutout, mask').focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Edit in Nodes' }).click();

  await expect(page.locator('.react-flow__node[data-id="tree-cutout"]')).toHaveClass(/selected/, {
    timeout: 15_000,
  });
});

test('Add inserts above the selected tree row in one undo step', async ({ page }) => {
  await openTree(page);
  await treeItem(page, 'Badge, fill layer').click();

  await page.locator('.layer-panel-header').getByRole('button', { name: 'Add layer' }).click();
  const search = page.getByLabel('Search layers and effects');
  await expect(search).toBeVisible({ timeout: 15_000 });
  await search.fill('pixelate');
  await search.press('Enter');

  const edited = [...INITIAL_OUTLINE.slice(0, 5), '2 Pixelate, effect layer', ...INITIAL_OUTLINE.slice(5)];
  await expectOutline(page, edited);
  await undoOnceAndRedo(page, edited);
});
