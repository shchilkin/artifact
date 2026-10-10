import { expect, type Page, test } from '@playwright/test';
import type { CanvasDocument } from '../../apps/web/app/types/config';
import { expectNoBrowserIssues, gotoDocument, setupBrowserTestPage, switchToNodeView } from './helpers';
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

test('entering Nodes relays out stored positions whose cards intersect', async ({ page }) => {
  await gotoDocument(page, withPositions(Object.fromEntries(NODE_IDS.map((id) => [id, { x: 0, y: 0 }]))));
  await switchToNodeView(page);

  await expectReadableGraph(page);
  await expect(page.getByRole('button', { name: 'Undo' }).first()).toBeDisabled();
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

  const node = flowNode(page, 'tree-glow');
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
  await expectNodeUncovered(page, 'tree-glow');
});

test('the Nodes toolbar has no debug controls without ?debug and keeps the account action apart', async ({ page }) => {
  await gotoDocument(page, layersTreeDocument);
  await switchToNodeView(page);

  const toolbar = page.getByRole('toolbar', { name: 'Node editor actions' });
  await expect(toolbar.getByRole('button', { name: 'Add node' })).toBeVisible();
  await expect(toolbar.getByText(/Metrics|Debug/)).toHaveCount(0);
  await expect(toolbar.locator('[aria-label*="debug" i], [aria-label*="metrics" i]')).toHaveCount(0);
  await expect(toolbar.locator('.node-toolbar-group-debug')).toHaveCount(0);
  await expect(page.locator('.node-perf-grid')).toHaveCount(0);
  const account = toolbar.locator('.node-toolbar-account');
  if ((await account.count()) > 0) {
    await expect(account.locator('xpath=ancestor::div[contains(@class, "node-toolbar-group")][1]')).toHaveAttribute(
      'aria-label',
      'Account',
    );
  }
});

test('?debug keeps the performance overlay toggle', async ({ page }) => {
  await gotoDocument(page, layersTreeDocument, 'debug=perf');
  await switchToNodeView(page);

  const debugGroup = page.getByRole('toolbar', { name: 'Node editor actions' }).locator('[aria-label="Debug actions"]');
  await expect(debugGroup.getByRole('button', { name: /performance debug overlay/ })).toBeVisible();
  await expect(debugGroup.locator('.node-toolbar-account')).toHaveCount(0);
});
