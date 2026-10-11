import { expect, type Page, test } from '@playwright/test';
import type { CanvasDocument } from '../../apps/web/app/types/config';
import {
  clickEditorControl,
  editorDocumentFixture,
  expectNoBrowserIssues,
  fillLayerFixture,
  gotoDocument,
  setupBrowserTestPage,
  switchToNodeView,
} from './helpers';
import { layersTreeDocument } from './layersTreeFixture';

// v0.50.1 #442 (EP-01, EP-03): Nodes opens as a readable, clickable graph and ships no debug chrome.

test.beforeEach(async ({ page }) => {
  await setupBrowserTestPage(page);
  await page.setViewportSize({ width: 1440, height: 900 });
});
test.afterEach(async ({ page }) => expectNoBrowserIssues(page));

const NODE_IDS = [
  ...layersTreeDocument.layers.map((layer) => layer.id),
  'tree-glow',
  'tree-grade',
  'tree-cutout',
  'tree-pattern',
  '__export__',
];

function withPositions(positions: Record<string, { x: number; y: number }>): CanvasDocument {
  return { ...layersTreeDocument, graph: { ...layersTreeDocument.graph!, positions } };
}

function flowNode(page: Page, id: string) {
  return page.locator(`.react-flow__node[data-id="${id}"]`);
}

async function nodeSizes(page: Page) {
  return page
    .locator('.react-flow__node')
    .evaluateAll((nodes) =>
      nodes.map((node) => `${node.getAttribute('data-id')} ${node.getBoundingClientRect().height}`),
    );
}

function storedPositionsOf(page: Page, ids: string[]) {
  return storedPositions(page).then((positions) => Object.fromEntries(ids.map((id) => [id, positions[id]])));
}

/** Every node card lies inside the visible graph pane. */
async function expectGraphFitted(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const pane = document.querySelector('.react-flow')?.getBoundingClientRect();
          if (!pane) return -1;
          return [...document.querySelectorAll('.react-flow__node')].filter((node) => {
            const rect = node.getBoundingClientRect();
            return rect.left < pane.left || rect.right > pane.right || rect.top < pane.top || rect.bottom > pane.bottom;
          }).length;
        }),
      { timeout: 15_000 },
    )
    .toBe(0);
}

async function intersectingNodePairs(page: Page) {
  const rects = await page.locator('.react-flow__node').evaluateAll((nodes) =>
    nodes.map((node) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { id: node.getAttribute('data-id'), x, y, width, height };
    }),
  );
  return rects.flatMap((a, index) =>
    rects
      .slice(index + 1)
      .filter((b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height)
      .map((b) => `${a.id} × ${b.id}`),
  );
}

function storedPositions(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('doc') ?? '{}').graph?.positions ?? {});
}

async function expectReadableGraph(page: Page) {
  await expect(page.locator('.react-flow__node')).toHaveCount(NODE_IDS.length, { timeout: 15_000 });
  await expect.poll(() => intersectingNodePairs(page), { timeout: 15_000 }).toEqual([]);
  for (const id of NODE_IDS) await flowNode(page, id).click({ trial: true, timeout: 5_000 });
}

async function expectNodeSelectedAndCentered(page: Page, id: string) {
  const node = flowNode(page, id);
  await expect(node).toHaveClass(/selected/, { timeout: 15_000 });
  await expect
    .poll(
      async () => {
        const pane = await page.locator('.react-flow').boundingBox();
        const box = await node.boundingBox();
        if (!pane || !box) return Number.POSITIVE_INFINITY;
        return Math.max(
          Math.abs(box.x + box.width / 2 - (pane.x + pane.width / 2)),
          Math.abs(box.y + box.height / 2 - (pane.y + pane.height / 2)),
        );
      },
      { timeout: 15_000 },
    )
    .toBeLessThan(24);
  expect(await intersectingNodePairs(page)).toEqual([]);
  await expectNodeUncovered(page, id);
}

/** The node's center is on screen and hits the node itself, not a node drawn over it. */
async function expectNodeUncovered(page: Page, id: string) {
  const hitsNode = await flowNode(page, id).evaluate((node) => {
    const { x, y, width, height } = node.getBoundingClientRect();
    const hit = document.elementFromPoint(x + width / 2, y + height / 2);
    return Boolean(hit && node.contains(hit));
  });
  expect(hitsNode).toBe(true);
}

test('entering Nodes lays out a graph without stored positions, with no overlap and no undo entry', async ({
  page,
}) => {
  await gotoDocument(page, layersTreeDocument);
  await switchToNodeView(page);

  await expectReadableGraph(page);
  await flowNode(page, 'tree-glow').click();
  await expect(flowNode(page, 'tree-glow')).toHaveClass(/selected/);
  await expect.poll(async () => Object.keys(await storedPositions(page)).sort()).toEqual([...NODE_IDS].sort());
  await expect(page.getByRole('button', { name: 'Undo' }).first()).toBeDisabled();
});

/** Records each graph viewport transform that is shown while the viewport is visible. */
function recordVisibleViewportTransforms(page: Page) {
  return page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __visibleViewportTransforms: string[] }).__visibleViewportTransforms = seen;
    const record = () => {
      const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
      if (!viewport || getComputedStyle(viewport).visibility === 'hidden') return;
      if (seen.at(-1) !== viewport.style.transform) seen.push(viewport.style.transform);
    };
    new MutationObserver(record).observe(document.body, { attributes: true, childList: true, subtree: true });
  });
}

test('entering Nodes relays out stored positions whose cards intersect, with one visible fit', async ({ page }) => {
  await gotoDocument(page, withPositions(Object.fromEntries(NODE_IDS.map((id) => [id, { x: 0, y: 0 }]))));
  await recordVisibleViewportTransforms(page);
  await switchToNodeView(page);

  await expectReadableGraph(page);
  expect(
    await page.evaluate(
      () => (window as unknown as { __visibleViewportTransforms: string[] }).__visibleViewportTransforms,
    ),
  ).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Undo' }).first()).toBeDisabled();
});

test('entering Nodes moves only overlapping cards and keeps the rest of a mixed graph in place', async ({ page }) => {
  const fine = NODE_IDS.slice(0, 7);
  const stacked = NODE_IDS.slice(7);
  const positions = Object.fromEntries([
    ...fine.map((id, index) => [id, { x: (index % 4) * 520, y: Math.floor(index / 4) * 620 }] as const),
    ...stacked.map((id) => [id, { x: 2600, y: 0 }] as const),
  ]);
  await gotoDocument(page, withPositions(positions));
  await switchToNodeView(page);

  await expectReadableGraph(page);
  await expectGraphFitted(page);
  expect(await storedPositionsOf(page, fine)).toEqual(Object.fromEntries(fine.map((id) => [id, positions[id]])));
  await expect(page.getByRole('button', { name: 'Undo' }).first()).toBeDisabled();
});

test('node cards keep their measured size after previews settle, so the entry check holds', async ({ page }) => {
  await gotoDocument(page, layersTreeDocument);
  await switchToNodeView(page);
  await expectReadableGraph(page);

  const sizes = await nodeSizes(page);
  await expect(page.locator('.node-thumbnail-canvas').first()).toBeAttached({ timeout: 15_000 });
  await page.waitForTimeout(1_500);
  expect(await nodeSizes(page)).toEqual(sizes);
  expect(await intersectingNodePairs(page)).toEqual([]);
});

test('entering Nodes never moves stored positions that do not overlap', async ({ page }) => {
  const positions = Object.fromEntries(
    NODE_IDS.map((id, index) => [id, { x: (index % 4) * 520, y: Math.floor(index / 4) * 620 }]),
  );
  await gotoDocument(page, withPositions(positions));
  await switchToNodeView(page);

  await expectReadableGraph(page);
  expect(await storedPositions(page)).toEqual(positions);
  const rendered = await Promise.all(
    NODE_IDS.map((id) =>
      flowNode(page, id).evaluate((node) => {
        const matrix = new DOMMatrix((node as HTMLElement).style.transform);
        return { x: matrix.e, y: matrix.f };
      }),
    ),
  );
  expect(rendered).toEqual(NODE_IDS.map((id) => positions[id]));
});

test('Edit in Nodes selects and centers the target node, uncovered', async ({ page }) => {
  await gotoDocument(page, layersTreeDocument);
  const tree = page.getByRole('tree', { name: 'Layer tree' });
  const glow = tree.getByRole('treeitem', { name: /^Glow, merge group/ });
  await expect(glow).toBeVisible({ timeout: 15_000 });
  await glow.click();
  await glow.focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Edit in Nodes' }).click();

  await expectNodeSelectedAndCentered(page, 'tree-glow');
});

test('Edit in Nodes from the Layers inspector selects and centers the node', async ({ page }) => {
  await gotoDocument(page, layersTreeDocument);
  const pattern = page.getByRole('tree', { name: 'Layer tree' }).getByRole('treeitem', { name: 'Pattern, repeat' });
  await expect(pattern).toBeVisible({ timeout: 15_000 });
  await pattern.click();
  await page
    .getByRole('complementary', { name: 'Layer settings' })
    .getByRole('button', { name: 'Edit in Nodes' })
    .click();

  await expectNodeSelectedAndCentered(page, 'tree-pattern');
});

test('loading another document in Nodes after Edit in Nodes fits the new graph', async ({ page }) => {
  // Wider than the pane at 100%, so only a fit shows every node.
  const other = editorDocumentFixture(
    Array.from({ length: 6 }, (_, index) =>
      fillLayerFixture({ id: `other-${index}`, name: `Other ${index}`, color: '#224466' }),
    ),
  );
  await gotoDocument(page, other);
  await clickEditorControl(page.locator('.project-workspace-button').first());
  const projects = page.getByRole('dialog', { name: 'PROJECTS' });
  await projects.getByLabel('Project name').fill('Entry Other');
  await projects.getByRole('button', { name: 'SAVE CURRENT CANVAS' }).click();
  await expect(projects.getByRole('button', { name: 'Load Entry Other' })).toHaveCount(1);
  await projects.getByRole('button', { name: 'Close projects' }).click();

  await gotoDocument(page, layersTreeDocument);
  const glow = page.getByRole('tree', { name: 'Layer tree' }).getByRole('treeitem', { name: /^Glow, merge group/ });
  await expect(glow).toBeVisible({ timeout: 15_000 });
  await glow.click();
  await glow.focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Edit in Nodes' }).click();
  await expect(flowNode(page, 'tree-glow')).toHaveClass(/selected/, { timeout: 15_000 });

  await clickEditorControl(page.locator('.project-workspace-button').first());
  await page.getByRole('dialog', { name: 'PROJECTS' }).getByRole('button', { name: 'Load Entry Other' }).click();
  await page
    .getByRole('alertdialog', { name: 'Open Entry Other?' })
    .getByRole('button', { name: 'Open project' })
    .click();

  await expect(flowNode(page, 'other-5')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.react-flow__node')).toHaveCount(7);
  await expectGraphFitted(page);
});

test('the Nodes toolbar has no debug controls without ?debug and keeps the account action apart', async ({ page }) => {
  await gotoDocument(page, layersTreeDocument);
  await switchToNodeView(page);

  const toolbar = page.getByRole('toolbar', { name: 'Node editor actions' });
  await expect(
    toolbar.getByRole('group', { name: 'Build actions' }).getByRole('button', { name: 'Add node' }),
  ).toBeVisible();
  await expect(toolbar.getByRole('group', { name: 'Debug actions' })).toHaveCount(0);
  await expect(toolbar.getByText(/Metrics|Debug/)).toHaveCount(0);
  await expect(toolbar.locator('[aria-label*="debug" i], [aria-label*="metrics" i]')).toHaveCount(0);
  await expect(toolbar.locator('.node-toolbar-group-debug')).toHaveCount(0);
  await expect(page.locator('.node-perf-grid')).toHaveCount(0);
  const account = toolbar.locator('.node-toolbar-account');
  if ((await account.count()) > 0) {
    await expect(toolbar.getByRole('group', { name: 'Account' }).locator('.node-toolbar-account')).toHaveCount(1);
  }
});

test('?debug keeps the performance overlay toggle', async ({ page }) => {
  await gotoDocument(page, layersTreeDocument, 'debug=perf');
  await switchToNodeView(page);

  const debugGroup = page
    .getByRole('toolbar', { name: 'Node editor actions' })
    .getByRole('group', { name: 'Debug actions' });
  await expect(debugGroup.getByRole('button', { name: /performance debug overlay/ })).toBeVisible();
  await expect(debugGroup.locator('.node-toolbar-account')).toHaveCount(0);
});
