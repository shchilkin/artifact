import { expect, type Locator, type Page, test } from '@playwright/test';
import type { CanvasDocument, GraphEdge, Layer } from '../../apps/web/app/types/config';
import { expectNoBrowserIssues, gotoDocument, setupBrowserTestPage } from './helpers';
import { layersTreeDocument } from './layersTreeFixture';

declare global {
  interface Window {
    /** The DataTransfer shared by one synthetic drag in these tests. */
    __treeDrag?: DataTransfer;
  }
}

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
      if (type === 'dragstart') window.__treeDrag = new DataTransfer();
      const rect = over!.getBoundingClientRect();
      const init = {
        bubbles: true,
        cancelable: true,
        dataTransfer: window.__treeDrag,
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
  await expect(treeStatus(page)).toHaveText('Glow can’t move into its own inputs.');
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

test('Delete after clicking a row name removes the row in one undo step', async ({ page }) => {
  await openTree(page);
  const badge = treeItem(page, 'Badge, fill layer');
  await badge.locator('.layer-row-name-button').click();
  await expect(badge).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Delete');

  await expect.poll(() => treeOutline(page), { timeout: 15_000 }).not.toContain('2 Badge, fill layer');
  await expect(treeStatus(page)).toHaveText('Deleted Badge.');
  await page.getByRole('button', { name: 'Undo' }).first().click();
  await expectOutline(page, INITIAL_OUTLINE);
  await expect(page.getByRole('button', { name: 'Undo' }).first()).toBeDisabled();
});

test('Undo and Redo retire the tree status of the edit they step over', async ({ page }) => {
  await openTree(page);
  await treeItem(page, 'Grade, grade').focus();
  await page.keyboard.press('Delete');
  await expect(treeStatus(page)).toHaveText('Deleted Grade.');

  await page.getByRole('button', { name: 'Undo' }).first().click();
  await expectOutline(page, INITIAL_OUTLINE);
  await expect(treeStatus(page)).not.toContainText('Deleted');
  await expect(treeStatus(page)).toHaveAttribute('data-visible', 'false');

  await page.getByRole('button', { name: 'Redo' }).first().click();
  await expect.poll(() => treeOutline(page)).not.toContain('1 Grade, grade');
  await expect(treeStatus(page)).not.toContainText('Deleted');
});

test('the Layers inspector of a graph-only node opens it in Nodes', async ({ page }) => {
  await openTree(page);
  await treeItem(page, 'Pattern, repeat').click();
  const inspector = page.getByRole('complementary', { name: 'Layer settings' });
  await expect(inspector).toContainText("This node's settings are edited in Nodes.");
  await inspector.getByRole('button', { name: 'Edit in Nodes' }).click();

  await expect(page.locator('.react-flow__node[data-id="tree-pattern"]')).toHaveClass(/selected/, {
    timeout: 15_000,
  });
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

// Each kind of tree edit must give the same document, and the same preview, as wiring it by hand in Nodes.

function wire(fromId: string, toId: string, toPort: GraphEdge['toPort']): GraphEdge {
  return { id: `nodes-${fromId}-${toId}-${toPort}`, fromId, fromPort: 'out', toId, toPort };
}

const EXPORT = '__export__';
const FIXTURE_EDGES = layersTreeDocument.graph!.edges.map((item) => wire(item.fromId, item.toId, item.toPort));

function withoutEdge(edges: GraphEdge[], fromId: string, toId: string, toPort: GraphEdge['toPort']) {
  return edges.filter((item) => !(item.fromId === fromId && item.toId === toId && item.toPort === toPort));
}

const edgeKeys = (edges: GraphEdge[]) => edges.map((item) => `${item.fromId}>${item.toId}.${item.toPort}`).sort();

async function storedDocument(page: Page): Promise<CanvasDocument> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('doc') ?? '{}'));
}

/** A coarse fingerprint of the preview canvas, read once three reads in a row agree. */
async function previewFingerprint(page: Page) {
  const canvas = page.locator('.pixi-container canvas').first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  const read = () =>
    canvas.evaluate((element) => {
      const target = element as HTMLCanvasElement;
      const pixels = target
        .getContext('2d', { willReadFrequently: true })!
        .getImageData(0, 0, target.width, target.height).data;
      const stride = Math.max(4, Math.floor(pixels.length / (4 * 2048)) * 4);
      let hash = 0;
      for (let index = 0; index < pixels.length; index += stride) {
        hash =
          (hash * 31 + pixels[index] + pixels[index + 1] * 3 + pixels[index + 2] * 7 + pixels[index + 3]) % 2147483647;
      }
      return `${target.width}x${target.height}:${hash}`;
    });
  const reads: string[] = [];
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(250);
        reads.push(await read());
        const last = reads.slice(-3);
        return last.length === 3 && last.every((value) => value === last[0]);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return reads.at(-1)!;
}

/** The edited document has exactly `edges`, and previews like that wiring loaded fresh. */
async function expectSameAsWiredInNodes(
  page: Page,
  edges: GraphEdge[],
  extra: { layers?: Layer[]; withoutNodes?: string[] } = {},
) {
  const stored = await storedDocument(page);
  expect(edgeKeys(stored.graph!.edges)).toEqual(edgeKeys(edges));
  const edited = await previewFingerprint(page);

  const gone = new Set(extra.withoutNodes ?? []);
  const graph = layersTreeDocument.graph!;
  const wired: CanvasDocument = {
    ...layersTreeDocument,
    layers: [...layersTreeDocument.layers, ...(extra.layers ?? [])],
    graph: { ...graph, edges, colorNodes: graph.colorNodes.filter((node) => !gone.has(node.id)) },
  };
  await gotoDocument(page, wired);
  await expect(layerTree(page)).toBeVisible({ timeout: 15_000 });
  expect(await previewFingerprint(page)).toBe(edited);
}

test('each tree edit matches the same wiring done in Nodes, in the document and the preview', async ({ page }) => {
  // Reorder within a run.
  await openTree(page);
  await dragRow(page, treeItem(page, 'Grade, grade'), treeItem(page, 'Headline, text layer'), 'upper');
  await expect(treeStatus(page)).toHaveText('Moved Grade above Headline.');
  await expectSameAsWiredInNodes(page, [
    ...withoutEdge(
      withoutEdge(withoutEdge(FIXTURE_EDGES, 'tree-backdrop', 'tree-grade', 'in'), 'tree-grade', 'tree-glow', 'a'),
      'tree-headline',
      EXPORT,
      'in',
    ),
    wire('tree-backdrop', 'tree-glow', 'a'),
    wire('tree-headline', 'tree-grade', 'in'),
    wire('tree-grade', EXPORT, 'in'),
  ]);

  // Move between runs: Not in output into the merge group. This one changes the picture, so it also
  // proves the fingerprint sees an edit.
  await openTree(page);
  const before = await previewFingerprint(page);
  await dragRow(page, treeItem(page, 'Unused fill, fill layer'), treeItem(page, 'Badge, fill layer'), 'upper');
  await expect.poll(() => previewFingerprint(page), { timeout: 20_000 }).not.toBe(before);
  await expectOutline(page, [
    ...INITIAL_OUTLINE.slice(0, 5),
    '2 Unused fill, fill layer',
    ...INITIAL_OUTLINE.slice(5, 12),
  ]);
  await expectSameAsWiredInNodes(page, [
    ...withoutEdge(FIXTURE_EDGES, 'tree-badge', 'tree-cutout', 'in'),
    wire('tree-badge', 'tree-unused', 'bg'),
    wire('tree-unused', 'tree-cutout', 'in'),
  ]);

  // Delete with reconnection.
  await openTree(page);
  await treeItem(page, 'Grade, grade').focus();
  await page.keyboard.press('Delete');
  await expect(treeStatus(page)).toHaveText('Deleted Grade.');
  await expectSameAsWiredInNodes(
    page,
    [
      ...withoutEdge(withoutEdge(FIXTURE_EDGES, 'tree-backdrop', 'tree-grade', 'in'), 'tree-grade', 'tree-glow', 'a'),
      wire('tree-backdrop', 'tree-glow', 'a'),
    ],
    { withoutNodes: ['tree-grade'] },
  );

  // Add above the selected row.
  await openTree(page);
  await treeItem(page, 'Badge, fill layer').click();
  await page.locator('.layer-panel-header').getByRole('button', { name: 'Add layer' }).click();
  const search = page.getByLabel('Search layers and effects');
  await expect(search).toBeVisible({ timeout: 15_000 });
  await search.fill('pixelate');
  await search.press('Enter');
  await expect(treeItem(page, 'Pixelate, effect layer')).toBeVisible({ timeout: 15_000 });
  const added = (await storedDocument(page)).layers.find((layer) => layer.name === 'Pixelate')!;
  await expectSameAsWiredInNodes(
    page,
    [
      ...withoutEdge(FIXTURE_EDGES, 'tree-badge', 'tree-cutout', 'in'),
      wire('tree-badge', added.id, 'in'),
      wire(added.id, 'tree-cutout', 'in'),
    ],
    { layers: [added] },
  );
});
