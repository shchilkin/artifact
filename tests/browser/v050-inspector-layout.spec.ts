import { expect, type Locator, type Page, test } from '@playwright/test';

import {
  type EffectPreset,
  makeGraphColorNode,
  makeGraphMaskNode,
  makeGraphMergeNode,
  makeGraphRepeatNode,
  makeGraphScene3DNode,
  makeGraphShaderNode,
  makeGraphTransformNode,
} from '../../apps/web/app/types/config';
import {
  editorDocumentFixture,
  expectNoBrowserIssues,
  expectStoredLayerField,
  fillLayerFixture,
  gotoDocument,
  setupBrowserTestPage,
  switchToLayerView,
  switchToNodeView,
  textLayerFixture,
} from './helpers';

// v0.50 U4: the inspector renders one layout for the same target in Layers and Nodes, every slider has numeric
// entry, and sliders, toggles, and section toggles have accessible names.

const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Effect presets that cover each control family: sliders, colors, palettes, retro steps, and fixed-default presets.
const EFFECT_PRESETS: EffectPreset[] = [
  'scanlines',
  'bloom',
  'rgbSplit',
  'pixelate',
  'halftone',
  'indexedPalette',
  'retroResolution',
  'dotGrain',
  'tint',
  'wave',
];

// Minimal layer records keep the document URL short; the editor fills the rest in when it normalizes the document.
const minimalLayer = (id: string, name: string, kind: string, patch: Record<string, unknown> = {}) => ({
  id,
  name,
  kind,
  visible: true,
  locked: false,
  opacity: 100,
  blendMode: 'normal',
  ...patch,
});

const effectLayers = EFFECT_PRESETS.map((preset) => minimalLayer(`u4-effect-${preset}`, preset, 'effect', { preset }));

const layerTargetsDocument = editorDocumentFixture([
  fillLayerFixture({ id: 'u4-fill', name: 'Backdrop', color: '#2255cc' }),
  minimalLayer('u4-image', 'Photo', 'image', {
    src: PIXEL_PNG,
    fit: 'cover',
    x: 0.5,
    y: 0.5,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  }),
  minimalLayer('u4-emoji', 'Emojis', 'emoji', { emojis: ['💀', '🔥'] }),
  minimalLayer('u4-primitive', 'Primitive', 'primitive', { primitiveShape: 'cube' }),
  textLayerFixture({ id: 'u4-title', name: 'Title', content: 'U4' }),
  ...effectLayers,
]);

const LAYER_TARGETS = [
  'u4-fill',
  'u4-image',
  'u4-emoji',
  'u4-primitive',
  'u4-title',
  ...effectLayers.map((layer) => layer.id),
];

const graphNodes = {
  scene: makeGraphScene3DNode({ id: 'u4-scene', name: 'Scene' }),
  merge: makeGraphMergeNode({ id: 'u4-merge' }),
  color: makeGraphColorNode({ id: 'u4-color' }),
  repeat: makeGraphRepeatNode({ id: 'u4-repeat' }),
  mask: makeGraphMaskNode({ id: 'u4-mask' }),
  transform: makeGraphTransformNode({ id: 'u4-transform' }),
  shader: makeGraphShaderNode({ id: 'u4-shader' }),
};
const GRAPH_ONLY_TARGETS = ['u4-merge', 'u4-color', 'u4-repeat', 'u4-mask', 'u4-transform', 'u4-shader'];

const graphDocument = {
  ...editorDocumentFixture([
    fillLayerFixture({ id: 'g-fill', name: 'Graph fill', color: '#cc6644' }),
    minimalLayer('g-primitive', 'Scene primitive', 'primitive', { primitiveShape: 'cube' }),
  ]),
  schemaVersion: 3,
  graph: {
    edges: [
      { id: 'u4-e-model', fromId: 'g-primitive', fromPort: 'out', toId: 'u4-scene', toPort: 'model' },
      { id: 'u4-e-fill-color', fromId: 'g-fill', fromPort: 'out', toId: 'u4-color', toPort: 'in' },
      { id: 'u4-e-color-transform', fromId: 'u4-color', fromPort: 'out', toId: 'u4-transform', toPort: 'in' },
      { id: 'u4-e-scene-export', fromId: 'u4-scene', fromPort: 'out', toId: '__export__', toPort: 'in' },
    ],
    // Output alone in the right column, which the open properties panel covers.
    positions: {
      'g-fill': { x: 0, y: 0 },
      'g-primitive': { x: 0, y: 700 },
      'u4-shader': { x: 0, y: 1400 },
      'u4-color': { x: 700, y: 0 },
      'u4-scene': { x: 700, y: 700 },
      'u4-repeat': { x: 700, y: 1400 },
      'u4-transform': { x: 1400, y: 0 },
      'u4-merge': { x: 1400, y: 700 },
      'u4-mask': { x: 1400, y: 1400 },
      __export__: { x: 2100, y: 700 },
    },
    mergeNodes: [graphNodes.merge],
    colorNodes: [graphNodes.color],
    repeatNodes: [graphNodes.repeat],
    maskNodes: [graphNodes.mask],
    transformNodes: [graphNodes.transform],
    scene3dNodes: [graphNodes.scene],
    shaderNodes: [graphNodes.shader],
  },
};

test.beforeEach(async ({ page }) => {
  await setupBrowserTestPage(page);
  await page.setViewportSize({ width: 1440, height: 900 });
});
test.afterEach(async ({ page }) => expectNoBrowserIssues(page));

const layerInspector = (page: Page) => page.getByRole('complementary', { name: 'Layer settings' });
const nodeInspector = (page: Page) => page.locator('.node-props-panel-open');

async function selectLayer(page: Page, id: string): Promise<Locator> {
  await page.locator(`.layer-row[data-layer-id="${id}"] .layer-row-name-button`).click();
  return readyInspector(layerInspector(page));
}

async function selectNode(page: Page, id: string): Promise<Locator> {
  const node = page.locator(`.react-flow__node[data-id="${id}"]`);
  await node.scrollIntoViewIfNeeded();
  await node.click();
  return readyInspector(nodeInspector(page));
}

async function readyInspector(inspector: Locator): Promise<Locator> {
  await expect(inspector.locator('.editor-target-overview')).toBeVisible();
  await expect(
    inspector.locator('[data-inspector-section="true"], [data-inspector-property-row="true"]').first(),
  ).toBeVisible();
  return inspector;
}

async function enterNodes(page: Page): Promise<void> {
  await switchToNodeView(page);
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
}

type InspectorLayout = {
  header: { classes: string; title: string; kind: string };
  sections: Array<{ title: string; open: boolean }>;
  rows: Array<{ label: string; control: string; row: number; input: number; entry: number | null }>;
};

/** Header, section order, and every visible control row with its size; the same target must produce the same layout. */
function readInspectorLayout(inspector: Locator): Promise<InspectorLayout> {
  return inspector.evaluate((root) => {
    const width = (element: Element | null) =>
      element ? Math.round(element.getBoundingClientRect().width * 10) / 10 : null;
    const header = root.querySelector('.editor-target-overview .editor-target-header');
    const sections = Array.from(root.querySelectorAll('[data-inspector-section="true"]')).map((section) => ({
      title: section.querySelector('.artifact-inspector-section__title')?.textContent?.trim() ?? '',
      open: section.getAttribute('data-inspector-open') === 'true',
    }));
    const rows = Array.from(
      root.querySelectorAll('[data-inspector-property-row="true"], [data-inspector-field="true"]'),
    ).map((row) => {
      const input = row.querySelector('input, select, textarea');
      return {
        label: row.querySelector('label')?.textContent?.trim() ?? '',
        control: input?.getAttribute('type') ?? input?.tagName.toLowerCase() ?? '',
        row: width(row) ?? 0,
        input: width(input) ?? 0,
        entry: width(row.querySelector('input[type="number"]')),
      };
    });
    return {
      header: {
        classes: header?.className ?? '',
        title: header?.querySelector('.editor-target-header__title')?.textContent?.trim() ?? '',
        // The kind label; the eyebrow before it names the mode (Layers / Nodes).
        kind: header?.querySelector('.editor-target-header__topline span:last-child')?.textContent?.trim() ?? '',
      },
      sections,
      rows,
    };
  });
}

test('every layer kind renders the same inspector layout in Layers and Nodes', async ({ page }) => {
  test.setTimeout(180_000);
  await gotoDocument(page, layerTargetsDocument);

  const layersLayouts = new Map<string, InspectorLayout>();
  for (const id of LAYER_TARGETS) layersLayouts.set(id, await readInspectorLayout(await selectLayer(page, id)));

  await enterNodes(page);
  for (const id of LAYER_TARGETS) {
    expect(await readInspectorLayout(await selectNode(page, id)), `${id} in Nodes`).toEqual(layersLayouts.get(id));
  }

  await switchToLayerView(page);
  for (const id of LAYER_TARGETS) {
    expect(await readInspectorLayout(await selectLayer(page, id)), `${id} in Layers after Nodes`).toEqual(
      layersLayouts.get(id),
    );
  }

  // One header configuration; the layer's own sections come first and the shared Layer section last.
  for (const [id, layout] of layersLayouts) {
    expect(layout.header.classes, id).toBe('editor-target-header editor-target-header--compact');
    expect(layout.sections.at(-1)?.title, id).toBe('Layer');
  }
  expect(
    layersLayouts
      .get('u4-image')
      ?.sections.slice(0, 2)
      .map((section) => section.title),
  ).toEqual(['Image Source', 'Generate']);
  expect(layersLayouts.get('u4-emoji')?.sections[0]?.title).toBe('Emoji Set');
  expect(layersLayouts.get('u4-effect-scanlines')?.sections.map((section) => section.title)).toEqual([
    'Texture',
    'Node',
    'Layer',
  ]);

  // Label, slider, and numeric entry share one row.
  const inspector = await selectLayer(page, 'u4-effect-scanlines');
  const slider = await inspector.getByRole('slider', { name: 'Scanlines', exact: true }).boundingBox();
  const label = await inspector.locator('label', { hasText: /^Scanlines$/ }).boundingBox();
  const entry = await inspector.getByRole('spinbutton', { name: 'Scanlines value', exact: true }).boundingBox();
  if (!slider || !label || !entry) throw new Error('Scanlines row is not rendered');
  for (const box of [label, entry]) {
    expect(Math.abs(box.y + box.height / 2 - (slider.y + slider.height / 2))).toBeLessThan(4);
  }
  expect(label.x + label.width).toBeLessThanOrEqual(slider.x);
  expect(slider.x + slider.width).toBeLessThanOrEqual(entry.x);
});

test('a 3D Scene renders the same inspector layout in Layers and Nodes', async ({ page }) => {
  await gotoDocument(page, graphDocument);
  await page.locator('.sidebar .layer-row').filter({ hasText: 'Scene' }).first().click();
  const layers = await readInspectorLayout(await readyInspector(layerInspector(page)));
  expect(layers.sections[0]?.title).toBe('Scene Inputs');

  await enterNodes(page);
  expect(await readInspectorLayout(await selectNode(page, 'u4-scene'))).toEqual(layers);
});

test('every slider, toggle, and section toggle is named in Layers and Nodes', async ({ page }) => {
  test.setTimeout(180_000);
  await gotoDocument(page, layerTargetsDocument);
  for (const id of LAYER_TARGETS) await expectNamedInspectorControls(page, await selectLayer(page, id));

  await enterNodes(page);
  for (const id of LAYER_TARGETS) await expectNamedInspectorControls(page, await selectNode(page, id));
});

test('graph-only node sliders are named and have numeric entry', async ({ page }) => {
  await gotoDocument(page, graphDocument);
  await enterNodes(page);
  for (const id of GRAPH_ONLY_TARGETS) {
    const inspector = await selectNode(page, id);
    const sliders = await expectNamedInspectorControls(page, inspector);
    expect(sliders, `${id} sliders`).toBeGreaterThan(0);
  }
});

/**
 * Opens every section by its accessible name, then checks each slider and its numeric entry by name and that every
 * checkbox has a name. Returns the number of sliders checked.
 */
async function expectNamedInspectorControls(page: Page, inspector: Locator): Promise<number> {
  // Controls outside any section (some graph utilities render their fields directly).
  let sliders = await expectNamedSliders(
    inspector,
    inspector.locator('.artifact-inspector-slider:not([data-inspector-section] *)'),
  );
  const titles = (await inspector.locator('.artifact-inspector-section__title').allTextContents()).map((title) =>
    title.trim(),
  );
  for (const title of titles) {
    const toggle = inspector.getByRole('button', { name: title, exact: true });
    await expect(toggle).toHaveCount(1);
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const section = inspector
      .locator('[data-inspector-section="true"]')
      .filter({ has: page.getByRole('button', { name: title, exact: true }) });
    await expect(section.getByRole('slider')).toHaveCount(await section.locator('.artifact-inspector-slider').count());
    sliders += await expectNamedSliders(section, section.locator('.artifact-inspector-slider'));
  }
  for (const checkbox of await inspector.getByRole('checkbox').all()) {
    await expect(checkbox).toHaveAccessibleName(/[A-Za-z]/);
  }
  return sliders;
}

/** Each slider row is named by its label and has a numeric entry named after it. */
async function expectNamedSliders(scope: Locator, rows: Locator): Promise<number> {
  const labels = (await rows.locator('label').allTextContents()).map((label) => label.trim());
  for (const label of labels) {
    expect(label).toMatch(/[A-Za-z]/);
    await expect(scope.getByRole('slider', { name: label, exact: true }).first()).toBeVisible();
    await expect(scope.getByRole('spinbutton', { name: `${label} value`, exact: true }).first()).toBeVisible();
  }
  await expect(rows.getByRole('spinbutton')).toHaveCount(labels.length);
  return labels.length;
}

test('numeric entry commits once on Enter or blur, snapped to the step, and Escape restores it', async ({ page }) => {
  await gotoDocument(page, layerTargetsDocument);
  const inspector = await selectLayer(page, 'u4-effect-scanlines');
  const slider = inspector.getByRole('slider', { name: 'Scanlines', exact: true });
  const entry = inspector.getByRole('spinbutton', { name: 'Scanlines value', exact: true });
  const selector = { key: 'id', value: 'u4-effect-scanlines' };
  const initial = Number(await entry.inputValue());

  await expect(entry).toHaveValue(String(initial));
  await expect(slider).toHaveAttribute('aria-valuetext', `${initial}%`);

  // Typing does not commit; Escape puts the committed value back.
  await entry.fill('41');
  await expect(slider).toHaveValue(String(initial));
  await entry.press('Escape');
  await expect(entry).toHaveValue(String(initial));
  await expectStoredLayerField(page, selector, 'scanlines', initial);

  // Enter commits once, snapped to the integer step.
  await entry.fill('40.6');
  await entry.press('Enter');
  await expectStoredLayerField(page, selector, 'scanlines', 41);
  await expect(entry).toHaveValue('41');
  await expect(slider).toHaveValue('41');

  // One edit is one undo step.
  await entry.blur();
  await page.getByRole('button', { name: 'Undo', exact: true }).locator('visible=true').click();
  await expectStoredLayerField(page, selector, 'scanlines', initial);
  await page.getByRole('button', { name: 'Redo', exact: true }).locator('visible=true').click();
  await expectStoredLayerField(page, selector, 'scanlines', 41);

  // Out-of-range input clamps on blur; text that is not a number is discarded.
  const max = Number(await entry.getAttribute('max'));
  await entry.fill(String(max + 50));
  await entry.blur();
  await expectStoredLayerField(page, selector, 'scanlines', max);
  await entry.fill('');
  await entry.blur();
  await expect(entry).toHaveValue(String(max));
  await expectStoredLayerField(page, selector, 'scanlines', max);

  // The slider still commits as before.
  await slider.focus();
  await page.keyboard.press('ArrowLeft');
  await expectStoredLayerField(page, selector, 'scanlines', max - 1);
});
