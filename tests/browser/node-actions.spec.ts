import { expect, type Page, test } from '@playwright/test';

import { makeDocument, makeFillLayer } from '../../apps/web/app/types/config';
import { EXPORT_NODE_ID, graphNodesById } from '../../apps/web/app/utils/nodeGraph';
import {
  makeGraphColorNode,
  makeGraphMaskNode,
  makeGraphMaterialNode,
  makeGraphMergeNode,
  makeGraphRepeatNode,
  makeGraphShaderNode,
  makeGraphTransformNode,
} from '../../apps/web/app/utils/nodeKinds';
import { gotoDocument, registerBrowserTestHooks, switchToNodeView } from './helpers';

// Toolset Consolidation acceptance: Duplicate, Hide and ⌘D work on every graph node kind. A material is the one
// kind without Hide, because its consumers read its settings instead of rendering it.

const NODES = [
  { node: makeGraphMergeNode({ id: 'act-merge', name: 'Merge Act' }), hideable: true },
  { node: makeGraphColorNode({ id: 'act-color', name: 'Color Act' }), hideable: true },
  { node: makeGraphMaskNode({ id: 'act-mask', name: 'Mask Act' }), hideable: true },
  { node: makeGraphTransformNode({ id: 'act-transform', name: 'Transform Act' }), hideable: true },
  { node: makeGraphRepeatNode({ id: 'act-repeat', name: 'Repeat Act' }), hideable: true },
  { node: makeGraphShaderNode({ id: 'act-shader', name: 'Shader Act' }), hideable: true },
  { node: makeGraphMaterialNode({ id: 'act-material', name: 'Material Act' }), hideable: false },
];

const actionsDocument = makeDocument({
  global: { bg: '#101018', seed: 1, aspect: '1:1' },
  export: { format: 'png', scale: 1, target: 'cover' },
  layers: [makeFillLayer({ id: 'act-fill', name: 'Fill Act', color: '#2255cc' })],
  graph: {
    edges: [
      { id: 'e-fill-color', fromId: 'act-fill', fromPort: 'out', toId: 'act-color', toPort: 'in' },
      { id: 'e-color-export', fromId: 'act-color', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
    ],
    positions: Object.fromEntries([
      ['act-fill', { x: 0, y: 0 }],
      ...NODES.map(({ node }, index) => [node.id, { x: 420 * (index % 4), y: 520 * Math.floor(index / 4) + 520 }]),
      [EXPORT_NODE_ID, { x: 840, y: 0 }],
    ]),
    nodes: graphNodesById(...NODES.map(({ node }) => node)),
  },
});

registerBrowserTestHooks(test);

async function selectNode(page: Page, id: string) {
  await page.locator(`.react-flow__node[data-id="${id}"]`).evaluate((node) => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
}

function storedNodes(page: Page) {
  return page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
    return Object.values(doc.graph?.nodes ?? {}) as Array<{ id: string; name: string; hidden?: boolean }>;
  });
}

test('every graph node kind duplicates with ⌘D and hides with M', async ({ page }) => {
  test.setTimeout(120_000);
  await gotoDocument(page, actionsDocument);
  await switchToNodeView(page);
  await expect(page.locator('.react-flow__node[data-id="act-material"]')).toBeAttached({ timeout: 15_000 });

  for (const { node, hideable } of NODES) {
    await selectNode(page, node.id);
    await page.keyboard.press('ControlOrMeta+d');
    await expect
      .poll(async () => (await storedNodes(page)).filter((item) => item.name === `${node.name} copy`).length, {
        message: `${node.kind} duplicates`,
      })
      .toBe(1);

    await selectNode(page, node.id);
    await page.keyboard.press('m');
    await expect
      .poll(async () => Boolean((await storedNodes(page)).find((item) => item.id === node.id)?.hidden), {
        message: `${node.kind} hides`,
      })
      .toBe(hideable);
  }
});

test('every graph node kind offers Duplicate and, where it applies, Hide in its menu', async ({ page }) => {
  await gotoDocument(page, actionsDocument);
  await switchToNodeView(page);

  for (const { node, hideable } of NODES) {
    const card = page.locator(`.react-flow__node[data-id="${node.id}"]`);
    await card.scrollIntoViewIfNeeded();
    await card.locator('.node-shell-header, header').first().click({ button: 'right' });
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: /^Duplicate/ }), node.kind).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /^Mute/ }), node.kind).toHaveCount(hideable ? 1 : 0);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  }
});
