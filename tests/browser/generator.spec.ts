import { expect, type Locator, type Page, test } from '@playwright/test';

const consoleIssues = new WeakMap<Page, string[]>();
const lightDocument = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 1, aspect: '1:1' },
  layers: [
    {
      id: 'fill-browser-smoke',
      name: 'Browser smoke fill',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#4466aa',
      opacity: 100,
      blendMode: 'normal',
    },
  ],
  export: { format: 'png', scale: 1, target: 'cover' },
};
const layeredFillDocument = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 1, aspect: '1:1' },
  layers: [
    {
      id: 'bottom-fill',
      name: 'Bottom fill',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#2255cc',
      opacity: 100,
      blendMode: 'normal',
    },
    {
      id: 'top-fill',
      name: 'Top fill',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#dd3322',
      opacity: 100,
      blendMode: 'normal',
    },
  ],
  export: { format: 'png', scale: 1, target: 'cover' },
};
const wideFillLayer = {
  id: 'wide-fill',
  name: 'Wide fill',
  visible: true,
  locked: false,
  kind: 'fill',
  color: '#aa5533',
  opacity: 100,
  blendMode: 'normal',
};
const wideNodeDocument = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 2, aspect: '16:9' },
  layers: [wideFillLayer],
  graph: {
    edges: [{ id: 'e-wide-fill-export', fromId: 'wide-fill', fromPort: 'out', toId: '__export__', toPort: 'in' }],
    positions: { 'wide-fill': { x: 0, y: 80 }, __export__: { x: 420, y: 80 } },
    mergeNodes: [],
    colorNodes: [],
  },
  export: { format: 'png', scale: 1, target: 'cover' },
};
const areaMergeDocument = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 6, aspect: '1:1' },
  layers: [
    {
      id: 'area-fill',
      name: 'Area fill',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#7842d9',
      opacity: 100,
      blendMode: 'normal',
    },
  ],
  graph: {
    edges: [{ id: 'e-merge-export', fromId: 'merge-area', fromPort: 'out', toId: '__export__', toPort: 'in' }],
    positions: { 'area-fill': { x: 0, y: 80 }, 'merge-area': { x: 460, y: 80 }, __export__: { x: 900, y: 80 } },
    mergeNodes: [{ id: 'merge-area', name: 'Merge', blendMode: 'source-over', opacity: 100 }],
    colorNodes: [],
    areas: [{ id: 'area-1', name: 'Area 1', color: '#ff705f', nodeIds: ['area-fill', 'merge-area'] }],
  },
  export: { format: 'png', scale: 1, target: 'cover' },
};
const areaExtendDocument = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 7, aspect: '16:9' },
  layers: [
    {
      id: 'area-fill',
      name: 'Area fill',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#7842d9',
      opacity: 100,
      blendMode: 'normal',
    },
    {
      id: 'area-noise',
      name: 'Area noise',
      visible: true,
      locked: false,
      kind: 'noise',
      opacity: 100,
      blendMode: 'normal',
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      color: '#ff5a36',
      accentColor: '#9d5cff',
      primitiveShape: 'sphere',
      primitiveShading: 'smooth',
      tiltX: -18,
      tiltY: 28,
      tiltZ: 0,
      primitiveDepth: 48,
      noiseType: 'clouds',
      noiseScale: 28,
      noiseDetail: 4,
      noiseContrast: 52,
      noiseBalance: 50,
      arrayPattern: 'grid',
      arrayShape: 'disc',
      arrayCount: 6,
      arrayRows: 4,
      arrayGap: 30,
      arrayRadius: 120,
      arraySize: 36,
      arrayJitter: 0,
    },
  ],
  graph: {
    edges: [
      { id: 'e-fill-noise', fromId: 'area-fill', fromPort: 'out', toId: 'area-noise', toPort: 'bg' },
      { id: 'e-noise-export', fromId: 'area-noise', fromPort: 'out', toId: '__export__', toPort: 'in' },
    ],
    positions: { 'area-fill': { x: 0, y: 80 }, 'area-noise': { x: 520, y: 80 }, __export__: { x: 980, y: 80 } },
    mergeNodes: [],
    colorNodes: [],
    areas: [{ id: 'area-1', name: 'Area 1', color: '#ff705f', nodeIds: ['area-fill'] }],
  },
  export: { format: 'png', scale: 1, target: 'cover' },
};
const tallNodeDocument = {
  ...wideNodeDocument,
  global: { bg: '#101018', seed: 3, aspect: '9:16' },
  layers: [{ ...wideFillLayer, id: 'tall-fill', name: 'Tall fill' }],
  graph: {
    edges: [{ id: 'e-tall-fill-export', fromId: 'tall-fill', fromPort: 'out', toId: '__export__', toPort: 'in' }],
    positions: { 'tall-fill': { x: 0, y: 80 }, __export__: { x: 420, y: 80 } },
    mergeNodes: [],
    colorNodes: [],
  },
};
const textDragDocument = {
  schemaVersion: 1,
  global: { bg: 'transparent', seed: 4, aspect: '16:9' },
  layers: [
    {
      id: 'text-drag-fill',
      name: 'Backdrop',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#120020',
      opacity: 100,
      blendMode: 'normal',
    },
    {
      id: 'text-drag-title',
      name: 'Title',
      visible: true,
      locked: false,
      kind: 'text',
      content: 'DRAG ME',
      font: 'DISPLAY',
      size: 120,
      color: '#ffffff',
      opacity: 100,
      blendMode: 'normal',
      x: 0.5,
      y: 0.5,
      rotation: 0,
      align: 'center',
      scaleX: 1,
      scaleY: 1,
    },
  ],
  graph: {
    edges: [
      { id: 'e-fill-text', fromId: 'text-drag-fill', fromPort: 'out', toId: 'text-drag-title', toPort: 'bg' },
      { id: 'e-text-export', fromId: 'text-drag-title', fromPort: 'out', toId: '__export__', toPort: 'in' },
    ],
    positions: {
      'text-drag-fill': { x: 0, y: 80 },
      'text-drag-title': { x: 500, y: 80 },
      __export__: { x: 1000, y: 80 },
    },
    mergeNodes: [],
    colorNodes: [],
  },
  export: { format: 'png', scale: 1, target: 'cover' },
};
const emptyTransparentDocument = {
  schemaVersion: 1,
  global: { bg: 'transparent', seed: 5, aspect: '1:1' },
  layers: [],
  export: { format: 'png', scale: 1, target: 'cover' },
};

test.beforeEach(async ({ page }) => {
  const issues: string[] = [];
  consoleIssues.set(page, issues);
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    issues.push(`pageerror: ${error.message}`);
  });
});

test.afterEach(async ({ page }) => {
  expect(consoleIssues.get(page) ?? []).toEqual([]);
});

test('layer canvas survives switching to nodes and back', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(lightDocument))}`);
  await expectLayerCanvasToHavePixels(page);

  await switchToNodeView(page);
  await expect.poll(async () => page.locator('.react-flow__node').count(), { timeout: 15_000 }).toBeGreaterThan(0);

  await switchToLayerView(page);
  await expect(page.locator('.sidebar')).toBeVisible();
  await expectLayerCanvasToHavePixels(page);
});

test('layer visibility updates the rendered canvas', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(layeredFillDocument))}`);

  await expect.poll(async () => getCanvasCenterRgb(page), { timeout: 15_000 }).toMatchObject({ r: 221, g: 51, b: 34 });

  await page.locator('.sidebar').getByRole('button', { name: 'Hide layer' }).first().click();

  await expect.poll(async () => getCanvasCenterRgb(page), { timeout: 15_000 }).toMatchObject({ r: 34, g: 85, b: 204 });
});

test('primitive node exposes interactive camera controls', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('button', { name: 'Add layer' }).click();
  await page.getByRole('button', { name: /primitive/i }).click();

  await page.locator('.view-mode-toggle-sidebar').getByRole('button', { name: 'nodes' }).click();
  const primitiveNode = page.locator('.node-shell-kind-primitive').first();
  await expect(primitiveNode).toBeVisible();
  await primitiveNode.click();

  const viewport = page.getByRole('group', { name: /3D preview/i });
  await expect(viewport).toBeVisible();
  await expect(page.locator('.primitive-node-camera-hint')).toContainText('camera 100%');

  await viewport.focus();
  await page.keyboard.press('=');
  await expect(page.locator('.primitive-node-camera-hint')).toContainText('camera 114%');

  await page.getByRole('button', { name: 'Reset camera' }).click();
  await expect(page.locator('.primitive-node-camera-hint')).toContainText('camera 100%');
});

test('default document can export from the browser', async ({ page }) => {
  await page.goto('/app');
  await expectLayerCanvasToHavePixels(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'EXPORT' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.(png|jpe?g)$/i);
});

test('current document can be saved into local projects', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(lightDocument))}`);
  await page.getByRole('button', { name: 'PROJECTS' }).click();
  await page.getByLabel('Project name').fill('Browser Project');
  await page.getByRole('button', { name: 'SAVE', exact: true }).click();

  await expect(page.getByText('Browser Project')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Load Browser Project' })).toBeVisible();
});

test('node previews respect document aspect ratio', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(wideNodeDocument))}`);
  await switchToNodeView(page);

  const wideFrame = page.locator('.node-shell-kind-fill .node-thumbnail-frame').first();
  await expect(wideFrame).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => frameRatio(wideFrame), { timeout: 15_000 }).toBeGreaterThan(1.5);

  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(tallNodeDocument))}`);
  await switchToNodeView(page);

  const tallFrame = page.locator('.node-shell-kind-fill .node-thumbnail-frame').first();
  await expect(tallFrame).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => frameRatio(tallFrame), { timeout: 15_000 }).toBeLessThan(0.75);
});

test('selected nodes can be marked as graph areas and reflected in layers', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(wideNodeDocument))}`);
  await switchToNodeView(page);

  const fillNode = page.locator('.node-shell-kind-fill').first();
  await expect(fillNode).toBeVisible({ timeout: 15_000 });
  await fillNode.click();

  await page.getByRole('button', { name: 'Create area from selected nodes' }).click();
  await expect(page.locator('.node-area')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.node-area-label')).toContainText('Area 1');

  await switchToLayerView(page);
  await expect(page.locator('.layer-area-chip')).toContainText('Area 1');
});

test('selected area can be extended without stacking memberships', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(areaExtendDocument))}`);
  await switchToNodeView(page);

  await page.getByRole('button', { name: 'Select Area 1' }).click();
  const noiseNode = page.locator('.node-shell-kind-noise').first();
  await expect(noiseNode).toBeVisible({ timeout: 15_000 });
  await noiseNode.click();
  await page.getByRole('button', { name: 'Add selected nodes to area' }).click();

  await expect(page.locator('.node-area')).toHaveCount(1);
  await expect(page.locator('.node-area-label')).toContainText('2');

  await switchToLayerView(page);
  await expect(page.locator('.layer-area-chip')).toHaveCount(2);
  await expect(page.locator('.layer-area-more')).toHaveCount(0);
});

test('dropping a connection on empty canvas can add and connect a node', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(wideNodeDocument))}`);
  await switchToNodeView(page);

  const fillNode = page.locator('.react-flow__node').filter({ has: page.locator('.node-shell-kind-fill') });
  await expect(fillNode).toHaveCount(1);
  const sourceHandle = fillNode.locator('.react-flow__handle-right');
  await expect(sourceHandle).toHaveCount(1);
  const box = await sourceHandle.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 280, startY - 120, { steps: 8 });
  await page.mouse.up();

  const menu = page.locator('.nadd-surface');
  await expect(menu).toBeVisible({ timeout: 15_000 });
  await menu.getByRole('button', { name: /Fill/i }).click();

  await expect.poll(async () => page.locator('.react-flow__node').count(), { timeout: 15_000 }).toBeGreaterThan(2);
  await expect.poll(async () => page.locator('.react-flow__edge').count(), { timeout: 15_000 }).toBeGreaterThan(1);
});

test('connecting to a merge node inside an area does not recurse node updates', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(areaMergeDocument))}`);
  await switchToNodeView(page);

  await expect(page.locator('.node-area')).toBeVisible({ timeout: 15_000 });
  const fillNode = page.locator('.react-flow__node').filter({ has: page.locator('.node-shell-kind-fill') });
  const mergeNode = page.locator('.react-flow__node').filter({ has: page.locator('.node-shell-kind-merge') });
  await expect(fillNode).toHaveCount(1);
  await expect(mergeNode).toHaveCount(1);

  const sourceHandle = fillNode.locator('.react-flow__handle-right[data-handleid="out"]');
  const targetHandle = mergeNode.locator('.react-flow__handle-left[data-handleid="b"]');
  await expect(sourceHandle).toHaveCount(1);
  await expect(targetHandle).toHaveCount(1);
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetHandle.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  if (!sourceBox || !targetBox) return;

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByText('Oops!')).toHaveCount(0);
  await expect.poll(async () => page.locator('.react-flow__edge').count(), { timeout: 15_000 }).toBeGreaterThan(1);
});

test('text node can be dragged repeatedly without crashing', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(textDragDocument))}`);
  await switchToNodeView(page);

  const textNode = page.locator('.node-shell-kind-text').first();
  await expect(textNode).toBeVisible({ timeout: 15_000 });
  await textNode.click();

  const overlay = textNode.locator('.node-drag-overlay');
  await expect(overlay).toBeVisible({ timeout: 15_000 });
  const box = await overlay.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 0; i < 12; i += 1) {
    await page.mouse.move(startX + 18 * i, startY + (i % 2 === 0 ? 64 : -64));
  }
  await page.mouse.up();

  await expect(page.getByText('Oops!')).toHaveCount(0);
  await expect(page.locator('.node-canvas-root')).toBeVisible();
});

test('empty transparent documents render transparent pixels over checkerboard chrome', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(emptyTransparentDocument))}`);

  const canvas = page.locator('.pixi-container canvas').first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(
      async () =>
        canvas.evaluate((element) => {
          const canvas = element as HTMLCanvasElement;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx || canvas.width <= 0 || canvas.height <= 0) return 255;
          return ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data[3] ?? 255;
        }),
      { timeout: 15_000 },
    )
    .toBe(0);

  await expect
    .poll(async () => page.locator('.pixi-container').evaluate((element) => getComputedStyle(element).backgroundImage))
    .toContain('linear-gradient');
});

async function expectLayerCanvasToHavePixels(page: Page) {
  const canvas = page.locator('.pixi-container canvas').first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(
      async () =>
        canvas.evaluate((element) => {
          const canvas = element as HTMLCanvasElement;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx || canvas.width <= 0 || canvas.height <= 0) return false;
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let maxChannel = 0;
          let alphaTotal = 0;
          let samples = 0;
          for (let y = 0; y < canvas.height; y += Math.max(1, Math.floor(canvas.height / 12))) {
            for (let x = 0; x < canvas.width; x += Math.max(1, Math.floor(canvas.width / 12))) {
              const index = (y * canvas.width + x) * 4;
              maxChannel = Math.max(maxChannel, pixels[index] ?? 0, pixels[index + 1] ?? 0, pixels[index + 2] ?? 0);
              alphaTotal += pixels[index + 3] ?? 0;
              samples += 1;
            }
          }
          return alphaTotal / samples > 4 && maxChannel > 24;
        }),
      { timeout: 15_000 },
    )
    .toBe(true);
}

async function switchToNodeView(page: Page) {
  await expect(async () => {
    const nodesButton = page.locator('.view-mode-toggle-sidebar').getByRole('button', { name: 'nodes' });
    await expect(nodesButton).toBeVisible({ timeout: 2_000 });
    await nodesButton.click();
    await expect(page.locator('.node-canvas-root')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 10_000 });
}

async function switchToLayerView(page: Page) {
  await expect(async () => {
    const layersButton = page.locator('.floating-view-toggle').getByRole('button', { name: 'layers' });
    await expect(layersButton).toBeVisible({ timeout: 2_000 });
    await layersButton.click();
    await expect(page.locator('.sidebar')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 10_000 });
}

async function getCanvasCenterRgb(page: Page) {
  const canvas = page.locator('.pixi-container canvas').first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  return canvas.evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || canvas.width <= 0 || canvas.height <= 0) return { r: 0, g: 0, b: 0 };
    const [r = 0, g = 0, b = 0] = ctx.getImageData(
      Math.floor(canvas.width / 2),
      Math.floor(canvas.height / 2),
      1,
      1,
    ).data;
    return { r, g, b };
  });
}

async function frameRatio(locator: Locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width / Math.max(1, rect.height);
  });
}
