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
