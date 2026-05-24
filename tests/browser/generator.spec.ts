import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page, test } from '@playwright/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

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
const aiRunningLayerDocument = {
  schemaVersion: 1,
  global: { bg: 'transparent', seed: 1, aspect: '1:1' },
  layers: [
    {
      id: 'ai-running-layer',
      name: 'AI Image',
      visible: true,
      locked: false,
      kind: 'image',
      src: '',
      fit: 'cover',
      opacity: 100,
      blendMode: 'normal',
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      aiGeneration: {
        prompt: 'loading cover',
        provider: 'openai',
        quality: 'standard',
        status: 'running',
        jobId: 'browser-ai-running-layer-job',
      },
    },
  ],
  export: { format: 'png', scale: 1, target: 'cover' },
};
const graphPreviewDocument = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 9, aspect: '1:1' },
  layers: [
    {
      id: 'graph-connected-fill',
      name: 'Connected fill',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#2e6bd9',
      opacity: 100,
      blendMode: 'normal',
    },
    {
      id: 'graph-unconnected-fill',
      name: 'Unconnected top fill',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#250033',
      opacity: 100,
      blendMode: 'normal',
    },
  ],
  graph: {
    edges: [
      {
        id: 'e-connected-export',
        fromId: 'graph-connected-fill',
        fromPort: 'out',
        toId: '__export__',
        toPort: 'in',
      },
    ],
    positions: {
      'graph-connected-fill': { x: 0, y: 80 },
      'graph-unconnected-fill': { x: 0, y: 420 },
      __export__: { x: 520, y: 80 },
    },
    mergeNodes: [],
    colorNodes: [],
  },
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
const areaSeparationDocument = {
  ...areaExtendDocument,
  layers: [
    ...areaExtendDocument.layers,
    {
      id: 'outside-fill',
      name: 'Outside fill',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#101018',
      opacity: 100,
      blendMode: 'normal',
    },
  ],
  graph: {
    ...areaExtendDocument.graph,
    positions: { ...areaExtendDocument.graph.positions, 'outside-fill': { x: 0, y: 440 } },
    areas: [{ id: 'area-1', name: 'Area 1', color: '#ff705f', nodeIds: ['area-fill', 'area-noise'] }],
  },
};
const layerAreaCreationDocument = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 8, aspect: '1:1' },
  layers: [
    {
      id: 'layer-area-backdrop',
      name: 'Backdrop',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#220033',
      opacity: 100,
      blendMode: 'normal',
    },
    {
      id: 'layer-area-type',
      name: 'Type wash',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#ff705f',
      opacity: 70,
      blendMode: 'normal',
    },
  ],
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
const layerTextEffectDragDocument = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 4, aspect: '1:1' },
  layers: [
    {
      id: 'layer-text-effect-fill',
      name: 'Blue fill',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#2255cc',
      opacity: 100,
      blendMode: 'normal',
    },
    {
      id: 'layer-text-effect-text',
      name: 'Drag text',
      visible: true,
      locked: false,
      kind: 'text',
      content: 'MOVE',
      font: 'DISPLAY',
      size: 92,
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
    {
      id: 'layer-text-effect-tint',
      name: 'Tint',
      visible: true,
      locked: false,
      kind: 'effect',
      preset: 'tint',
      maskAlpha: false,
      tint: '#ff3300',
      tintOp: 80,
    },
  ],
  export: { format: 'png', scale: 1, target: 'cover' },
};
const testImageSrc =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iMzYwIiB2aWV3Qm94PSIwIDAgNjQwIDM2MCI+PHJlY3Qgd2lkdGg9IjY0MCIgaGVpZ2h0PSIzNjAiIGZpbGw9IiMxMjAwMjAiLz48Y2lyY2xlIGN4PSIzMjAiIGN5PSIxODAiIHI9IjEyMCIgZmlsbD0iI2ZmNzA1ZiIvPjxwYXRoIGQ9Ik04MCAyODAgTDMwMCA2MCBMNTYwIDI4MFoiIGZpbGw9IiM5ZDVjZmYiIG9wYWNpdHk9Ii43NSIvPjwvc3ZnPg==';
const generatedImageDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const aiFailedImageDocument = {
  schemaVersion: 1,
  global: { bg: 'transparent', seed: 1, aspect: '1:1' },
  layers: [
    {
      id: 'ai-failed-layer',
      name: 'AI Image',
      visible: true,
      locked: false,
      kind: 'image',
      src: generatedImageDataUrl,
      fit: 'cover',
      opacity: 100,
      blendMode: 'normal',
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      aiGeneration: {
        prompt: 'failed export cover',
        provider: 'openai',
        quality: 'standard',
        status: 'failed',
        jobId: 'browser-ai-failed-export-job',
        errorCode: 'provider_unavailable',
        errorMessage: 'Provider timed out.',
      },
    },
  ],
  export: { format: 'png', scale: 1, target: 'cover' },
};
const aiReplacingLayerDocument = {
  schemaVersion: 1,
  global: { bg: 'transparent', seed: 1, aspect: '1:1' },
  layers: [
    {
      id: 'ai-replacing-layer',
      name: 'AI Image',
      visible: true,
      locked: false,
      kind: 'image',
      src: generatedImageDataUrl,
      fit: 'cover',
      opacity: 100,
      blendMode: 'normal',
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      aiGeneration: {
        prompt: 'replacement loading cover',
        provider: 'openai',
        quality: 'standard',
        status: 'running',
        jobId: 'browser-ai-replacing-layer-job',
      },
    },
  ],
  export: { format: 'png', scale: 1, target: 'cover' },
};
const aiExistingImageDocument = {
  schemaVersion: 1,
  global: { bg: 'transparent', seed: 2, aspect: '1:1' },
  layers: [
    {
      id: 'ai-existing-layer',
      name: 'AI Image',
      visible: true,
      locked: false,
      kind: 'image',
      src: generatedImageDataUrl,
      fit: 'cover',
      opacity: 100,
      blendMode: 'normal',
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      aiGeneration: {
        prompt: 'first generated cover',
        provider: 'openai',
        quality: 'standard',
        status: 'succeeded',
        jobId: 'browser-ai-existing-job-1',
        assetId: 'browser-ai-existing-asset-1',
      },
    },
  ],
  export: { format: 'png', scale: 1, target: 'cover' },
};
const aiImageHistoryDocument = {
  schemaVersion: 1,
  global: { bg: 'transparent', seed: 2, aspect: '1:1' },
  layers: [
    {
      id: 'ai-history-layer',
      name: 'AI Image',
      visible: true,
      locked: false,
      kind: 'image',
      src: generatedImageDataUrl,
      fit: 'cover',
      opacity: 100,
      blendMode: 'normal',
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      aiGeneration: {
        prompt: 'first generated cover',
        provider: 'openai',
        quality: 'standard',
        status: 'succeeded',
        jobId: 'browser-ai-history-job-1',
        assetId: 'browser-ai-history-asset-1',
      },
      aiGenerationHistory: [
        {
          src: generatedImageDataUrl,
          aiGeneration: {
            prompt: 'first generated cover',
            provider: 'openai',
            quality: 'standard',
            status: 'succeeded',
            jobId: 'browser-ai-history-job-1',
            assetId: 'browser-ai-history-asset-1',
          },
        },
        {
          src: testImageSrc,
          aiGeneration: {
            prompt: 'second generated cover',
            provider: 'openai',
            quality: 'standard',
            status: 'succeeded',
            jobId: 'browser-ai-history-job-2',
            assetId: 'browser-ai-history-asset-2',
          },
        },
      ],
      aiGenerationHistoryIndex: 0,
    },
  ],
  export: { format: 'png', scale: 1, target: 'cover' },
};
const uploadImagePngBase64 = readFileSync(resolve(repoRoot, 'apps/web/public/og.png')).toString('base64');
const imageDragDocument = {
  schemaVersion: 1,
  global: { bg: 'transparent', seed: 8, aspect: '16:9' },
  layers: [
    {
      id: 'image-drag-fill',
      name: 'Backdrop',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#08060c',
      opacity: 100,
      blendMode: 'normal',
    },
    {
      id: 'image-drag-image',
      name: 'Image',
      visible: true,
      locked: false,
      kind: 'image',
      src: testImageSrc,
      fit: 'free',
      opacity: 100,
      blendMode: 'normal',
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
  ],
  graph: {
    edges: [
      { id: 'e-fill-image', fromId: 'image-drag-fill', fromPort: 'out', toId: 'image-drag-image', toPort: 'bg' },
      { id: 'e-image-export', fromId: 'image-drag-image', fromPort: 'out', toId: '__export__', toPort: 'in' },
    ],
    positions: {
      'image-drag-fill': { x: 0, y: 80 },
      'image-drag-image': { x: 500, y: 80 },
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
  await page.route('**/api/ai/access', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: false,
        enabled: false,
        disabledReason: 'anonymous',
      }),
    });
  });
  page.on('console', (message) => {
    const text = message.text();
    if (isBenignBrowserTestIssue(text)) return;
    if (message.type() === 'error' && /clerk\.accounts\.dev/.test(text) && /Failed to fetch/.test(text)) {
      return;
    }
    if (message.type() === 'error') issues.push(`${message.type()}: ${text}`);
    if (message.type() === 'warning' && text.includes('trying to drag a node that is not initialized')) {
      issues.push(`${message.type()}: ${text}`);
    }
  });
  page.on('pageerror', (error) => {
    if (isBenignBrowserTestIssue(error.message)) return;
    issues.push(`pageerror: ${error.message}`);
  });
});

test.afterEach(async ({ page }) => {
  expect(consoleIssues.get(page) ?? []).toEqual([]);
});

function isBenignBrowserTestIssue(text: string) {
  return (
    text.includes('downloadable font: download failed') ||
    text.includes('Error loading route module `/app/routes/generator.tsx`, reloading page') ||
    text.includes('Importing a module script failed') ||
    text.includes('error loading dynamically imported module: http://127.0.0.1:4173/') ||
    text.includes('due to access control checks') ||
    text.includes('NS_BINDING_ABORTED') ||
    text.includes('Cannot update a component (`NodeThumbnail`) while rendering a different component (`PerfMetric`)') ||
    text === 'JSHandle@object'
  );
}

test('layer canvas survives switching to nodes and back', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(lightDocument))}`);
  await expectLayerCanvasToHavePixels(page);

  await switchToNodeView(page);
  await expect.poll(async () => page.locator('.react-flow__node').count(), { timeout: 15_000 }).toBeGreaterThan(0);

  await switchToLayerView(page);
  await expect(page.locator('.sidebar')).toBeVisible();
  await expectLayerCanvasToHavePixels(page);
});

test('editor visual hierarchy separates panels canvas and selected rows', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(layeredFillDocument))}`);
  await expectLayerCanvasToHavePixels(page);

  await page.getByText('Top fill', { exact: true }).click();
  await page
    .locator('.layer-row')
    .filter({ hasText: 'Top fill' })
    .getByRole('button', { name: 'Hide layer Top fill' })
    .click();

  await expect
    .poll(() => page.locator('.layer-row-hidden').evaluate((row) => Number(getComputedStyle(row).opacity)))
    .toBeLessThan(0.9);

  const hierarchy = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    const token = (name: string) => styles.getPropertyValue(name).trim();
    const sidebar = document.querySelector('.sidebar');
    const main = document.querySelector('.main');
    const row = document.querySelector('.layer-row.bg-accent-dim');
    const hiddenRow = document.querySelector('.layer-row-hidden');
    const hiddenName = hiddenRow?.querySelector('span:nth-child(3)');
    const canvas = document.querySelector('.pixi-container canvas');
    return {
      tokens: [
        token('--app-bg'),
        token('--workspace-bg'),
        token('--panel-bg'),
        token('--surface-bg'),
        token('--surface-selected'),
      ],
      sidebarBg: sidebar ? getComputedStyle(sidebar).backgroundColor : '',
      mainBg: main ? getComputedStyle(main).backgroundColor : '',
      selectedRowBg: row ? getComputedStyle(row).backgroundColor : '',
      selectedRowShadow: row ? getComputedStyle(row).boxShadow : '',
      selectedRowClasses: row ? Array.from(row.classList) : [],
      hiddenRowOpacity: hiddenRow ? getComputedStyle(hiddenRow).opacity : '',
      hiddenRowDecoration: hiddenName ? getComputedStyle(hiddenName).textDecorationLine : '',
      canvasShadow: canvas ? getComputedStyle(canvas).boxShadow : '',
    };
  });

  expect(new Set(hierarchy.tokens).size).toBe(hierarchy.tokens.length);
  expect(hierarchy.sidebarBg).not.toBe(hierarchy.mainBg);
  expect(hierarchy.selectedRowBg).not.toBe(hierarchy.sidebarBg);
  expect(hierarchy.selectedRowShadow).not.toBe('none');
  expect(hierarchy.selectedRowClasses).toEqual(expect.arrayContaining(['layer-row-selected', 'layer-row-hidden']));
  expect(Number(hierarchy.hiddenRowOpacity)).toBeLessThan(0.9);
  expect(hierarchy.hiddenRowDecoration).toContain('line-through');
  expect(hierarchy.canvasShadow).not.toBe('none');
});

test('node visual hierarchy marks selected nodes toolbar actions and graph areas', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(areaMergeDocument))}`);
  await switchToNodeView(page);
  await expect(page.locator('.node-shell-kind-fill')).toBeVisible({ timeout: 15_000 });

  await page.locator('.node-shell-kind-fill').first().click();
  await expect(page.locator('.node-shell-kind-fill').first()).toHaveClass(/node-shell-selected/);

  await page
    .locator('.node-area-select')
    .first()
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.locator('.node-area').first()).toHaveClass(/node-area-selected/);

  await page.getByRole('button', { name: 'Show performance debug overlay' }).click();
  const stateStyles = await page.evaluate(() => {
    const node = document.querySelector('.node-shell-selected');
    const nodeHeader = node?.querySelector('.node-shell-header');
    const area = document.querySelector('.node-area-selected');
    const areaLabel = area?.querySelector('.node-area-label');
    const perf = document.querySelector('.node-canvas-toolbar button[aria-pressed="true"]');
    const root = document.querySelector('.node-canvas-root');
    const rootStyles = root ? getComputedStyle(root) : null;
    const readLightness = (name: string) => {
      const value = rootStyles?.getPropertyValue(name).trim() ?? '';
      const match = value.match(/oklch\(([\d.]+)%/);
      return match ? Number(match[1]) : Number.NaN;
    };
    const readAlpha = (name: string) => {
      const value = rootStyles?.getPropertyValue(name).trim() ?? '';
      const match = value.match(/\/\s*([\d.]+)\)/);
      return match ? Number(match[1]) : 1;
    };
    return {
      canvasBg: root ? getComputedStyle(root).backgroundColor : '',
      nodeBg: node ? getComputedStyle(node).backgroundColor : '',
      nodeBorder: node ? getComputedStyle(node).borderColor : '',
      canvasLightness: readLightness('--editor-canvas-bg'),
      nodeCardLightness: readLightness('--node-card-bg'),
      nodeBorderLightness: readLightness('--node-card-border'),
      gridLightness: readLightness('--editor-grid-dot'),
      gridAlpha: readAlpha('--editor-grid-dot'),
      selectedNodeShadow: node ? getComputedStyle(node).boxShadow : '',
      selectedNodeHeaderBg: nodeHeader ? getComputedStyle(nodeHeader).backgroundColor : '',
      selectedAreaShadow: area ? getComputedStyle(area).boxShadow : '',
      selectedAreaLabelBg: areaLabel ? getComputedStyle(areaLabel).backgroundColor : '',
      perfActiveShadow: perf ? getComputedStyle(perf).boxShadow : '',
    };
  });

  expect(stateStyles.nodeBg).not.toBe(stateStyles.canvasBg);
  expect(stateStyles.nodeBorder).not.toBe(stateStyles.canvasBg);
  expect(stateStyles.nodeCardLightness - stateStyles.canvasLightness).toBeGreaterThanOrEqual(4);
  expect(stateStyles.nodeBorderLightness).toBeGreaterThan(stateStyles.gridLightness);
  expect(stateStyles.gridAlpha).toBeLessThan(0.6);
  expect(stateStyles.selectedNodeShadow).not.toBe('none');
  expect(stateStyles.selectedNodeHeaderBg).not.toBe('');
  expect(stateStyles.selectedAreaShadow).not.toBe('none');
  expect(stateStyles.selectedAreaLabelBg).not.toBe('');
  expect(stateStyles.perfActiveShadow).not.toBe('none');
});

test('layer visibility updates the rendered canvas', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(layeredFillDocument))}`);

  await expect.poll(async () => getCanvasCenterRgb(page), { timeout: 15_000 }).toMatchObject({ r: 221, g: 51, b: 34 });

  await page.locator('.sidebar').getByRole('button', { name: 'Hide layer' }).first().click();

  await expect.poll(async () => getCanvasCenterRgb(page), { timeout: 15_000 }).toMatchObject({ r: 34, g: 85, b: 204 });
});

test('layer rows expose rename duplicate visibility and delete actions', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(layeredFillDocument))}`);

  const topFillRow = page.locator('.layer-row').filter({ hasText: 'Top fill' }).first();
  await expect(topFillRow).toBeVisible({ timeout: 15_000 });

  await topFillRow.getByRole('button', { name: /Rename layer Top fill/ }).click();
  const renameInput = page.getByRole('textbox', { name: /Rename layer Top fill/ });
  await renameInput.fill('Cover Type');
  await renameInput.press('Enter');
  await expect(page.locator('.layer-row').filter({ hasText: 'Cover Type' })).toHaveCount(1);

  const renamedRow = page.locator('.layer-row').filter({ hasText: 'Cover Type' }).first();
  await renamedRow.getByRole('button', { name: /Duplicate layer Cover Type/ }).click();

  const duplicateRow = page.locator('.layer-row').filter({ hasText: 'Cover Type copy' }).first();
  await expect(duplicateRow).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.layer-row')).toHaveCount(3);

  await duplicateRow.getByRole('button', { name: /Hide layer Cover Type copy/ }).click();
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          return doc.layers?.find((layer: { name: string }) => layer.name === 'Cover Type copy')?.visible;
        }),
      { timeout: 15_000 },
    )
    .toBe(false);

  await duplicateRow.getByRole('button', { name: /Delete layer Cover Type copy/ }).click();
  await expect(page.locator('.layer-row').filter({ hasText: 'Cover Type copy' })).toHaveCount(0);
  await expect(page.locator('.layer-row')).toHaveCount(2);
});

test('layer rows can quick-add a layer above the current row', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(layeredFillDocument))}`);

  const topFillRow = page.locator('.layer-row').filter({ hasText: 'Top fill' }).first();
  await expect(topFillRow).toBeVisible({ timeout: 15_000 });
  await topFillRow.getByRole('button', { name: /Insert layer above Top fill/ }).click();
  await page.getByRole('button', { name: /Grain/i }).click();

  await expect(page.locator('.layer-row').filter({ hasText: 'Grain' })).toHaveCount(1, { timeout: 15_000 });
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          return doc.layers?.map((layer: { name: string; kind: string }) => ({ name: layer.name, kind: layer.kind }));
        }),
      { timeout: 15_000 },
    )
    .toEqual([
      { name: 'Bottom fill', kind: 'fill' },
      { name: 'Top fill', kind: 'fill' },
      { name: 'Grain', kind: 'effect' },
    ]);
});

test('layer add library supports search keyboard add and recent items', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(layeredFillDocument))}`);

  const header = page.locator('.layer-panel-header');
  await header.getByRole('button', { name: 'Add layer' }).click();
  const search = page.getByLabel('Search layers and effects');
  await expect(search).toBeVisible({ timeout: 15_000 });
  await search.fill('pixelate');
  await search.press('Enter');

  await expect(page.locator('.layer-row').filter({ hasText: 'Pixelate' })).toHaveCount(1, { timeout: 15_000 });

  await header.getByRole('button', { name: 'Add layer' }).click();
  const menu = page.locator('.add-library-layer-menu');
  await expect(menu).toContainText('Recent');
  await expect(menu.locator('.add-library-section').filter({ hasText: 'Recent' })).toContainText('Pixelate');
  await expect(menu.locator('.add-library-detail')).toBeVisible();
  await expect(menu.locator('img[alt="Pixelate preview"]')).toBeVisible({ timeout: 15_000 });
});

test('layers can quick-add Pixelate with formatted creative controls', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(layeredFillDocument))}`);

  const topFillRow = page.locator('.layer-row').filter({ hasText: 'Top fill' }).first();
  await expect(topFillRow).toBeVisible({ timeout: 15_000 });
  await topFillRow.getByRole('button', { name: /Insert layer above Top fill/ }).click();
  await page.getByRole('button', { name: /Pixelate/i }).click();

  const pixelateRow = page.locator('.layer-row').filter({ hasText: 'Pixelate' }).first();
  await expect(pixelateRow).toBeVisible({ timeout: 15_000 });
  await pixelateRow.click();
  await expect(page.locator('.sidebar')).toContainText('Block Size');
  await expect(page.locator('.sidebar .node-inspector-value')).toContainText('6px');
  await expectLayerCanvasToHavePixels(page);
});

test('layer text drag keeps effect stack active during movement', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(layerTextEffectDragDocument))}`);
  await page.getByText('Drag text', { exact: true }).click();
  await expectLayerCanvasToHavePixels(page);

  const before = await getCanvasRgbAt(page, 0.18, 0.18);
  const areaBox = await page.locator('.canvas-area').boundingBox();
  expect(areaBox).toBeTruthy();
  if (!areaBox) return;

  await page.mouse.move(areaBox.x + areaBox.width / 2, areaBox.y + areaBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(areaBox.x + areaBox.width / 2 + 72, areaBox.y + areaBox.height / 2 + 28, { steps: 8 });
  await page.waitForTimeout(300);

  const during = await getCanvasRgbAt(page, 0.18, 0.18);
  await page.mouse.up();

  expect(colorDistance(before, during)).toBeLessThan(8);
});

test('layer preview follows graph output when unconnected layers exist', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(graphPreviewDocument))}`);

  await expect.poll(async () => getCanvasCenterRgb(page), { timeout: 15_000 }).toMatchObject({ r: 46, g: 107, b: 217 });
  await switchToNodeView(page);
  await expect(page.locator('.node-shell-kind-export')).toBeVisible({ timeout: 15_000 });
  await switchToLayerView(page);
  await expect.poll(async () => getCanvasCenterRgb(page), { timeout: 15_000 }).toMatchObject({ r: 46, g: 107, b: 217 });
});

test('layers added after graph bootstrap connect into the export path', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(wideNodeDocument))}`);
  await switchToNodeView(page);
  await switchToLayerView(page);

  const header = page.locator('.layer-panel-header');
  await header.getByRole('button', { name: 'Add layer' }).click();
  await page
    .locator('.add-library-row')
    .filter({ has: page.locator('.add-library-row-label', { hasText: /^Fill$/ }) })
    .first()
    .click();

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          return doc.layers?.length ?? 0;
        }),
      { timeout: 15_000 },
    )
    .toBe(2);

  const graphState = await page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
    const newLayer = doc.layers?.find((layer: { id: string }) => layer.id !== 'wide-fill');
    return {
      newLayerId: newLayer?.id,
      edges: doc.graph?.edges ?? [],
    };
  });

  expect(graphState.newLayerId).toBeTruthy();
  expect(graphState.edges).toContainEqual(
    expect.objectContaining({
      fromId: 'wide-fill',
      toId: graphState.newLayerId,
      toPort: 'bg',
    }),
  );
  expect(graphState.edges).toContainEqual(
    expect.objectContaining({
      fromId: graphState.newLayerId,
      toId: '__export__',
      toPort: 'in',
    }),
  );
  expect(graphState.edges).not.toContainEqual(expect.objectContaining({ fromId: 'wide-fill', toId: '__export__' }));
});

test('primitive node exposes interactive camera controls', async ({ page }) => {
  await page.goto('/app?new=blank');
  await page.getByRole('button', { name: 'Add layer' }).click();
  await page.getByRole('button', { name: /primitive/i }).click();
  await expect(page.getByText('Camera framing is node-owned')).toBeVisible({ timeout: 15_000 });

  await switchToNodeView(page);
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

  const flowViewport = page.locator('.react-flow__viewport').first();
  const beforeWheelTransform = await flowViewport.evaluate((element) => getComputedStyle(element).transform);
  const viewportBox = await viewport.boundingBox();
  expect(viewportBox).not.toBeNull();
  if (!viewportBox) return;

  await page.mouse.move(viewportBox.x + viewportBox.width / 2, viewportBox.y + viewportBox.height / 2);
  await viewport.dispatchEvent('wheel', { deltaY: -240, bubbles: true, cancelable: true });
  await expect(page.locator('.primitive-node-camera-hint')).toContainText('camera 138%');
  const afterWheelTransform = await flowViewport.evaluate((element) => getComputedStyle(element).transform);
  expect(afterWheelTransform).toBe(beforeWheelTransform);
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = localStorage.getItem('doc');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const firstState = Object.values(parsed.graph?.primitiveViewStates ?? {})[0] as { zoom?: number } | undefined;
        return firstState?.zoom ?? null;
      }),
    )
    .toBeGreaterThan(1);

  await page.reload();
  await page.locator('.view-mode-toggle-sidebar').getByRole('button', { name: 'nodes' }).click();
  await page.locator('.node-shell-kind-primitive').first().click();
  await expect(page.locator('.primitive-node-camera-hint')).toContainText('camera 138%');
  await expect(page.getByText('Oops!')).toHaveCount(0);
});

test('node performance debug toggle persists', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(wideNodeDocument))}`);
  await switchToNodeView(page);

  await page.getByRole('button', { name: 'Show performance debug overlay' }).click();
  await expect(page.locator('.node-perf-grid')).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('artifact-debug-perf')), { timeout: 15_000 })
    .toBe('1');

  await page.reload();
  await switchToNodeView(page);
  await expect(page.getByRole('button', { name: 'Hide performance debug overlay' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.node-perf-grid')).toBeVisible();
});

test('default document can export from the browser', async ({ page, browserName }) => {
  test.skip(
    browserName === 'firefox',
    'Firefox download events are unreliable in GitHub Actions; export download smoke runs in Chromium/WebKit.',
  );

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

test('uploaded images are stored as asset references and survive reload', async ({ page }) => {
  await page.goto('/app?new=blank');
  await expect(page.locator('.empty-canvas-start')).toBeVisible({ timeout: 15_000 });

  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const file = new File([bytes], 'upload-smoke.png', { type: 'image/png' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    const target = document.querySelector('main');
    target?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  }, uploadImagePngBase64);

  await expect(page.locator('.sidebar [draggable="true"]')).toHaveCount(1, { timeout: 15_000 });
  await expectLayerCanvasToHavePixels(page);
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          return doc.layers?.find((layer: { kind: string }) => layer.kind === 'image')?.src ?? '';
        }),
      { timeout: 15_000 },
    )
    .toMatch(/^artifact-asset:\/\//);

  await page.reload();
  await expectLayerCanvasToHavePixels(page);
});

test('new blank canvas ignores stored work and shows the empty start panel', async ({ page }) => {
  await page.goto('/app');
  await page.evaluate((storedDoc) => localStorage.setItem('doc', JSON.stringify(storedDoc)), lightDocument);

  await page.goto('/app?new=blank');

  await expect(page.locator('.empty-canvas-start')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.sidebar [draggable="true"]')).toHaveCount(0);
  await expectCanvasCenterAlpha(page, 0);

  await page.getByRole('button', { name: 'PROJECTS' }).click();
  await expect(page.getByText('RECOVERABLE DRAFT')).toBeVisible();
  await page.getByRole('button', { name: 'Load Previous draft' }).click();
  await expectLayerCanvasToHavePixels(page);
});

test('empty layer panel offers direct layer quick starts', async ({ page }) => {
  await page.goto('/app?new=blank');

  const emptyPanel = page.locator('.layer-empty-state');
  await expect(emptyPanel).toBeVisible({ timeout: 15_000 });
  await expect(emptyPanel).toContainText('Start with one layer');
  await expect(emptyPanel.getByRole('link', { name: 'Examples' })).toHaveAttribute('href', '/examples');
  await expect(page.locator('.empty-canvas-start').getByRole('link', { name: 'Open guide' })).toHaveAttribute(
    'href',
    '/docs/nodes#docs-first-cover',
  );

  await emptyPanel.getByRole('button', { name: 'Text' }).click();
  await expect(page.locator('.layer-empty-state')).toHaveCount(0);
  await expect(page.locator('.layer-row').filter({ hasText: /Text/i })).toHaveCount(1, { timeout: 15_000 });
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          return doc.layers?.[0]?.kind;
        }),
      { timeout: 15_000 },
    )
    .toBe('text');
});

test('new blank canvas action confirms before replacing current work', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(lightDocument))}`);
  await expectLayerCanvasToHavePixels(page);

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('recoverable draft');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'New blank canvas' }).click();

  await expect(page.locator('.empty-canvas-start')).toBeVisible({ timeout: 15_000 });
  await expectCanvasCenterAlpha(page, 0);
});

test('empty canvas can start from the layer-first texture recipe', async ({ page }) => {
  await page.goto('/app?new=blank');
  await expect(page.locator('.empty-canvas-start')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.empty-canvas-start').getByRole('button', { name: 'Photo Stack' })).toBeVisible();
  await expect(page.locator('.empty-canvas-start').getByRole('button', { name: 'Noise Poster' })).toBeVisible();

  await page
    .locator('.empty-canvas-start')
    .getByRole('button', { name: /Texture Type/i })
    .click();

  await expect(page.locator('.empty-canvas-start')).toHaveCount(0);
  await expectLayerCanvasToHavePixels(page);
  await expect(page.locator('.sidebar [draggable="true"]')).toHaveCount(6, { timeout: 15_000 });
  await expect(page.getByText('paper clouds')).toBeVisible();
  await expect(page.getByText('paper tooth')).toBeVisible();
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          return {
            aspect: doc.global?.aspect,
            hasGraph: Boolean(doc.graph),
            layerIds: doc.layers?.map((layer: { id: string }) => layer.id) ?? [],
          };
        }),
      { timeout: 15_000 },
    )
    .toEqual({
      aspect: '1:1',
      hasGraph: false,
      layerIds: [
        'starter-plate',
        'starter-clouds',
        'starter-title',
        'starter-registration',
        'starter-scanlines',
        'starter-grain',
      ],
    });
});

test('empty canvas can start from the layer-first photo stack recipe', async ({ page }) => {
  await page.goto('/app?new=blank');
  await expect(page.locator('.empty-canvas-start')).toBeVisible({ timeout: 15_000 });

  await page.locator('.empty-canvas-start').getByRole('button', { name: 'Photo Stack' }).click();

  await expect(page.locator('.empty-canvas-start')).toHaveCount(0);
  await expectLayerCanvasToHavePixels(page);
  await expect(page.locator('.sidebar [draggable="true"]')).toHaveCount(6, { timeout: 15_000 });
  await expect(page.getByText('cover photo')).toBeVisible();
  await expect(page.getByText('headline type')).toBeVisible();
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          return {
            aspect: doc.global?.aspect,
            hasGraph: Boolean(doc.graph),
            layerIds: doc.layers?.map((layer: { id: string }) => layer.id) ?? [],
          };
        }),
      { timeout: 15_000 },
    )
    .toEqual({
      aspect: '4:5',
      hasGraph: false,
      layerIds: [
        'photo-stack-plate',
        'photo-stack-image',
        'photo-stack-duotone',
        'photo-stack-title',
        'photo-stack-registration',
        'photo-stack-grain',
      ],
    });
});

test('docs recipe try-this link opens an editable starter document', async ({ page }) => {
  await page.goto('/docs/nodes');
  await expect(page.getByRole('heading', { name: 'Make A Cover' })).toBeVisible();

  const recipe = page.locator('.docs-recipe').filter({ hasText: 'Photo Plus Type Recipe' });
  await expect(recipe).toBeVisible();
  await recipe.getByRole('link', { name: 'Try this' }).click();

  await expect(page).toHaveURL(/\/app\?doc=/);
  await expectLayerCanvasToHavePixels(page);
  await expect(page.getByText('cover photo')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('headline type')).toBeVisible();
});

test('add-node menu exposes recipe groups and workflow search', async ({ page }) => {
  await page.goto('/app?new=blank');
  await switchToNodeView(page);
  await page.getByRole('button', { name: 'Add node' }).click();

  await expect(page.getByRole('button', { name: 'Photo + Type' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Texture Type' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print Damage' })).toBeVisible();

  await page.getByRole('button', { name: 'Print Damage' }).click();
  await expect(page.locator('.nadd-row').filter({ hasText: 'Halftone' })).toBeVisible();
  await expect(page.locator('.nadd-row').filter({ hasText: 'Tear' })).toBeVisible();
  await expect(page.locator('.nadd-row').filter({ hasText: 'Paper' })).toBeVisible();

  await page.getByLabel('Search nodes and effects').fill('photo type');
  await expect(page.getByRole('button', { name: /^◧ Image/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^T Text/ })).toBeVisible();

  await page.getByLabel('Search nodes and effects').fill('ai image');
  await expect(page.getByRole('button', { name: /^◧ AI Image/ })).toBeVisible();

  await page.getByLabel('Search nodes and effects').fill('split tone');
  await expect(page.getByAltText('Split Tone preview')).toBeVisible({ timeout: 15_000 });
});

test('node add menu can add Pixelate with the shared formatted controls', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(wideNodeDocument))}`);
  await switchToNodeView(page);
  await expect(page.locator('.node-shell-kind-export')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Add node' }).click();
  await page.getByLabel('Search nodes and effects').fill('pixelate');
  await expect(page.locator('.add-library-node-menu img[alt="Pixelate preview"]')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /^▦ Pixelate/ }).click();

  const pixelateNode = page.locator('.node-shell-kind-effect').filter({ hasText: 'Pixelate' }).first();
  await expect(pixelateNode).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.node-props-panel')).toContainText('Block Size');
  await expect(page.locator('.node-props-panel .node-inspector-value')).toContainText('6px');
  await switchToLayerView(page);
  await expectLayerCanvasToHavePixels(page);
});

test('node add menu can drag an effect onto the canvas', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(wideNodeDocument))}`);
  await switchToNodeView(page);
  await expect(page.locator('.node-shell-kind-export')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Add node' }).click();
  await page.getByLabel('Search nodes and effects').fill('pixelate');

  await page.getByRole('button', { name: /^▦ Pixelate/ }).dragTo(page.locator('.react-flow__pane'), {
    targetPosition: { x: 520, y: 320 },
  });

  const pixelateNode = page.locator('.node-shell-kind-effect').filter({ hasText: 'Pixelate' }).first();
  await expect(pixelateNode).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.add-library-node-menu')).toHaveCount(0);
});

test('AI image node can be added and explains account-gated access', async ({ page }) => {
  await page.goto('/app?new=blank');
  await switchToNodeView(page);
  await page.getByRole('button', { name: 'Add node' }).click();
  await page.getByLabel('Search nodes and effects').fill('ai image');
  await page.getByRole('button', { name: /^◧ AI Image/ }).click();

  const aiNode = page.locator('.node-shell-kind-image').filter({ hasText: 'AI Image' }).first();
  await expect(aiNode).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.node-props-panel')).toContainText('AI Image');
  await expect(page.locator('.node-props-panel')).toContainText('Account required for AI');
  await expect(page.locator('.node-props-panel')).toContainText(
    'This feature uses AI. To use AI features, create an account.',
  );
  await expect(page.locator('.ai-generation-panel')).toBeVisible();
  await expect(page.locator('.ai-generation-access-banner')).toBeVisible();
  await expect(page.locator('.ai-generation-dev-diagnostics')).toHaveCount(0);
  await expect(page.locator('[data-ai-generation-prompt]')).toHaveCount(0);
});

test('AI developer diagnostics are opt-in and safe', async ({ page }) => {
  await mockAiAccess(page, {
    authenticated: false,
    enabled: false,
    disabledReason: 'anonymous',
    providers: ['openai'],
  });

  await page.goto('/app?new=blank&debug=ai');
  await switchToNodeView(page);
  await page.getByRole('button', { name: 'Add node' }).click();
  await page.getByLabel('Search nodes and effects').fill('ai image');
  await page.getByRole('button', { name: /^◧ AI Image/ }).click();

  const panel = page.locator('.node-props-panel');
  const diagnostics = panel.locator('.ai-generation-dev-diagnostics');
  await expect(diagnostics).toBeVisible({ timeout: 15_000 });
  await expect(diagnostics).toContainText('AI diagnostics');
  await expect(diagnostics).toContainText(/v[0-9].*sha:/);
  await expect(diagnostics).toContainText('api');
  await expect(diagnostics).toContainText('auth');
  await expect(diagnostics).toContainText('configured=no');
  await expect(diagnostics).toContainText('token');
  await expect(diagnostics).toContainText('dev=no');
  await expect(diagnostics).toContainText('access');
  await expect(diagnostics).toContainText('reason=anonymous');

  await diagnostics.getByRole('button', { name: 'Retry' }).click();
  await expect(diagnostics).toContainText('reason=anonymous');
});

test('AI image node shows generation progress on the node surface', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(aiRunningLayerDocument))}`);
  await switchToNodeView(page);

  const aiNode = page.locator('.node-shell-kind-image').filter({ hasText: 'AI Image' }).first();
  await expect(aiNode.locator('.node-ai-status-overlay')).toContainText('Generating', { timeout: 15_000 });
});

test('AI image node keeps generation progress visible while selected', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(aiReplacingLayerDocument))}`);
  await switchToNodeView(page);

  const aiNode = page.locator('.node-shell-kind-image').filter({ hasText: 'AI Image' }).first();
  await aiNode.locator('.node-preview-surface').click();
  await aiNode.locator('.node-preview-surface').click();
  await expect(aiNode.locator('.node-ai-status-overlay')).toContainText('Generating', { timeout: 15_000 });
  await expect(aiNode.locator('.node-live-media-overlay')).toBeVisible({ timeout: 15_000 });
  const layers = await aiNode.evaluate((node) => {
    const status = node.querySelector('.node-ai-status-overlay');
    const live = node.querySelector('.node-live-media-overlay');
    return {
      statusZ: status ? Number.parseInt(window.getComputedStyle(status).zIndex, 10) : 0,
      liveZ: live ? Number.parseInt(window.getComputedStyle(live).zIndex, 10) : 0,
    };
  });
  expect(layers.statusZ).toBeGreaterThan(layers.liveZ);
});

test('AI generation state is visible in the layer list', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(aiRunningLayerDocument))}`);

  const row = page.locator('.layer-row').filter({ hasText: 'AI Image' }).first();
  await expect(row.locator('.layer-ai-status')).toContainText('Generating', { timeout: 15_000 });
});

test('AI image node keeps generated image history and can switch variants', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(aiImageHistoryDocument))}`);

  const row = page.locator('.layer-row').filter({ hasText: 'AI Image' }).first();
  await expect(row.locator('.layer-ai-history-count')).toHaveText('1/2', { timeout: 15_000 });

  await switchToNodeView(page);
  const aiNode = page.locator('.node-shell-kind-image').filter({ hasText: 'AI Image' }).first();
  await expect(aiNode.locator('.node-ai-history-badge')).toHaveText('1/2', { timeout: 15_000 });
  await aiNode.click();

  const panel = page.locator('.node-props-panel');
  await expect(panel.locator('.ai-generation-history-count')).toHaveText('1/2', { timeout: 15_000 });
  await panel.getByRole('button', { name: 'Next generated image' }).click();
  await expect(panel.locator('.ai-generation-history-count')).toHaveText('2/2');
  await expect(aiNode.locator('.node-ai-history-badge')).toHaveText('2/2');
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          const image = doc.layers?.find((layer: { id: string }) => layer.id === 'ai-history-layer');
          const selectedVariant = image?.aiGenerationHistory?.[image?.aiGenerationHistoryIndex ?? -1];
          return {
            historyCount: image?.aiGenerationHistory?.length,
            index: image?.aiGenerationHistoryIndex,
            prompt: image?.aiGeneration?.prompt,
            generationMatchesSelectedVariant: Boolean(
              selectedVariant?.aiGeneration?.jobId && image?.aiGeneration?.jobId === selectedVariant.aiGeneration.jobId,
            ),
          };
        }),
      { timeout: 15_000 },
    )
    .toEqual({
      historyCount: 2,
      index: 1,
      prompt: 'second generated cover',
      generationMatchesSelectedVariant: true,
    });

  await panel.getByRole('button', { name: 'Previous generated image' }).click();
  await expect(panel.locator('.ai-generation-history-count')).toHaveText('1/2');
  await expect(aiNode.locator('.node-ai-history-badge')).toHaveText('1/2');
});

test('AI image node appends history when replacing an existing generated image', async ({ page }) => {
  const prompt = 'replacement generated cover';
  await mockAiAccess(page, {
    authenticated: true,
    enabled: true,
    providers: ['openai'],
    quota: { period: '2026-05', limit: 10, used: 3, remaining: 7 },
    user: { id: 'dev-user', role: 'admin' },
  });
  await mockSuccessfulAiGeneration(page, prompt);
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(aiExistingImageDocument))}`);
  await switchToNodeView(page);

  const aiNode = page.locator('.node-shell-kind-image').filter({ hasText: 'AI Image' }).first();
  await aiNode.click();
  const panel = page.locator('.node-props-panel');
  await expect(panel.locator('[data-ai-generation-prompt]')).toBeVisible({ timeout: 15_000 });
  await panel.locator('[data-ai-generation-prompt]').fill(prompt);
  await panel.getByRole('button', { name: 'Replace Image' }).click();

  await expect(panel.locator('.ai-generation-history-count')).toHaveText('2/2', { timeout: 15_000 });
  await panel.getByRole('button', { name: 'Previous generated image' }).click();
  await expect(panel.locator('.ai-generation-history-count')).toHaveText('1/2');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
        const image = doc.layers?.find((layer: { id: string }) => layer.id === 'ai-existing-layer');
        return {
          index: image?.aiGenerationHistoryIndex,
          prompt: image?.aiGeneration?.prompt,
          historyPrompts: image?.aiGenerationHistory?.map(
            (variant: { aiGeneration?: { prompt?: string } }) => variant.aiGeneration?.prompt,
          ),
        };
      }),
    )
    .toEqual({
      index: 0,
      prompt: 'first generated cover',
      historyPrompts: ['first generated cover', prompt],
    });
});

test('AI image node supports multiple generations in the same node across reload', async ({ page }) => {
  const prompts = ['second generated cover', 'third generated cover'];
  await mockAiAccess(page, {
    authenticated: true,
    enabled: true,
    providers: ['openai'],
    quota: { period: '2026-05', limit: 10, used: 3, remaining: 7 },
    user: { id: 'dev-user', role: 'admin' },
  });
  await mockSequentialSuccessfulAiGenerations(page, prompts);
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(aiExistingImageDocument))}`);
  await switchToNodeView(page);

  const aiNode = page.locator('.node-shell-kind-image').filter({ hasText: 'AI Image' }).first();
  await aiNode.click();
  const panel = page.locator('.node-props-panel');
  await expect(panel.locator('[data-ai-generation-prompt]')).toBeVisible({ timeout: 15_000 });

  for (let index = 0; index < prompts.length; index += 1) {
    await panel.locator('[data-ai-generation-prompt]').fill(prompts[index]);
    await panel.getByRole('button', { name: 'Replace Image' }).click();
    await expect(panel.locator('.ai-generation-history-count')).toHaveText(`${index + 2}/${index + 2}`, {
      timeout: 15_000,
    });
    await expect(aiNode.locator('.node-ai-history-badge')).toHaveText(`${index + 2}/${index + 2}`);
    await expect(aiNode.locator('.node-ai-status-overlay')).toHaveCount(0);
  }

  await expect
    .poll(() =>
      page.evaluate(() => {
        const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
        const image = doc.layers?.find((layer: { id: string }) => layer.id === 'ai-existing-layer');
        return {
          historyCount: image?.aiGenerationHistory?.length,
          index: image?.aiGenerationHistoryIndex,
          prompt: image?.aiGeneration?.prompt,
          historyPrompts: image?.aiGenerationHistory?.map(
            (variant: { aiGeneration?: { prompt?: string } }) => variant.aiGeneration?.prompt,
          ),
        };
      }),
    )
    .toEqual({
      historyCount: 3,
      index: 2,
      prompt: 'third generated cover',
      historyPrompts: ['first generated cover', 'second generated cover', 'third generated cover'],
    });

  await page.reload();
  await switchToNodeView(page);
  const reloadedNode = page.locator('.node-shell-kind-image').filter({ hasText: 'AI Image' }).first();
  await reloadedNode.click();
  const reloadedPanel = page.locator('.node-props-panel');
  await expect(reloadedPanel.locator('.ai-generation-history-count')).toHaveText('3/3', { timeout: 15_000 });
  await reloadedPanel.getByRole('button', { name: 'Previous generated image' }).click();
  await expect(reloadedPanel.locator('.ai-generation-history-count')).toHaveText('2/3');
  await reloadedPanel.getByRole('button', { name: 'Previous generated image' }).click();
  await expect(reloadedPanel.locator('.ai-generation-history-count')).toHaveText('1/3');
  await reloadedPanel.getByRole('button', { name: 'Next generated image' }).click();
  await expect(reloadedPanel.locator('.ai-generation-history-count')).toHaveText('2/3');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
        const image = doc.layers?.find((layer: { id: string }) => layer.id === 'ai-existing-layer');
        const selectedVariant = image?.aiGenerationHistory?.[image?.aiGenerationHistoryIndex ?? -1];
        return {
          index: image?.aiGenerationHistoryIndex,
          prompt: image?.aiGeneration?.prompt,
          srcMatchesSelectedVariant: Boolean(selectedVariant?.src && image?.src === selectedVariant.src),
        };
      }),
    )
    .toEqual({
      index: 1,
      prompt: 'second generated cover',
      srcMatchesSelectedVariant: true,
    });
});

test('AI image node leaves loading state when completed asset import fails', async ({ page }) => {
  const prompt = 'replacement missing asset cover';
  await mockAiAccess(page, {
    authenticated: true,
    enabled: true,
    providers: ['openai'],
    quota: { period: '2026-05', limit: 10, used: 3, remaining: 7 },
    user: { id: 'dev-user', role: 'admin' },
  });
  await page.route('**/api/ai/generations', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fallback();
    const body = request.postDataJSON() as { prompt?: string; provider?: string; settings?: { quality?: string } };
    expect(body.prompt).toBe(prompt);
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'browser-ai-import-failed-job',
        status: 'succeeded',
        provider: body.provider ?? 'openai',
        model: 'mock-image-model',
        prompt: body.prompt,
        settings: { aspect: '1:1', quality: body.settings?.quality ?? 'standard' },
        asset: {
          id: 'browser-ai-import-failed-asset',
          uri: '/api/generated/missing.png',
          mimeType: 'image/png',
          width: 1,
          height: 1,
          sizeBytes: 70,
          createdAt: '2026-05-21T00:00:00.000Z',
          metadata: {
            provider: body.provider ?? 'openai',
            model: 'mock-image-model',
            prompt: body.prompt,
            settings: { aspect: '1:1', quality: body.settings?.quality ?? 'standard' },
            createdAt: '2026-05-21T00:00:00.000Z',
          },
        },
        quota: { period: '2026-05', limit: 10, used: 4, remaining: 6 },
        createdAt: '2026-05-21T00:00:00.000Z',
        completedAt: '2026-05-21T00:00:01.000Z',
      }),
    });
  });
  await page.route('**/api/generated/missing.png', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'invalid_asset', message: 'Generated asset was not an image.' }),
    });
  });
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(aiExistingImageDocument))}`);
  await switchToNodeView(page);

  const aiNode = page.locator('.node-shell-kind-image').filter({ hasText: 'AI Image' }).first();
  await aiNode.click();
  const panel = page.locator('.node-props-panel');
  await panel.locator('[data-ai-generation-prompt]').fill(prompt);
  await panel.getByRole('button', { name: 'Replace Image' }).click();

  await expect(aiNode.locator('.node-ai-status-overlay')).toContainText('Failed', { timeout: 15_000 });
  await expect(panel).toContainText('Only image blobs can be stored as image assets');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
        return doc.layers?.find((layer: { id: string }) => layer.id === 'ai-existing-layer')?.aiGeneration?.status;
      }),
    )
    .toBe('failed');
});

test('AI-enabled user can generate an image and keep prompt provenance after reload', async ({ page }) => {
  const prompt = 'red square cassette cover';
  await mockAiAccess(page, {
    authenticated: true,
    enabled: true,
    providers: ['openai'],
    quota: { period: '2026-05', limit: 10, used: 3, remaining: 7 },
    user: { id: 'dev-user', role: 'admin' },
  });
  await mockSuccessfulAiGeneration(page, prompt);

  await page.goto('/app?new=blank');
  const panel = page.locator('.sidebar .ai-generation-panel').first();
  await expect(panel.locator('[data-ai-generation-prompt]')).toBeVisible({ timeout: 15_000 });
  await panel.locator('[data-ai-generation-prompt]').fill(prompt);
  await panel.getByRole('button', { name: 'Generate' }).click();

  await expect(page.getByText('Added image layer.')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.sidebar [draggable="true"]')).toHaveCount(1, { timeout: 15_000 });
  await expectLayerCanvasToHavePixels(page);
  await expect(page.getByText('Current image prompt')).toBeVisible();
  await expect(page.locator('.ai-generation-provenance p').filter({ hasText: prompt })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'EXPORT' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.(png|jpe?g)$/i);
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          const image = doc.layers?.find((layer: { kind: string }) => layer.kind === 'image');
          return {
            prompt: image?.aiGeneration?.prompt,
            provider: image?.aiGeneration?.provider,
            src: image?.src,
          };
        }),
      { timeout: 15_000 },
    )
    .toMatchObject({ prompt, provider: 'openai', src: expect.stringMatching(/^artifact-asset:\/\//) });

  await page.reload();
  await expectLayerCanvasToHavePixels(page);
  await page.locator('.sidebar [draggable="true"]').first().click();
  await expect(page.locator('.ai-generation-provenance p').filter({ hasText: prompt })).toBeVisible({
    timeout: 15_000,
  });
});

test('AI generation keeps polling until a queued job succeeds', async ({ page }) => {
  const prompt = 'late arriving neon portrait';
  await mockAiAccess(page, {
    authenticated: true,
    enabled: true,
    providers: ['openai'],
    quota: { period: '2026-05', limit: 10, used: 4, remaining: 6 },
    user: { id: 'dev-user', role: 'admin' },
  });
  await mockPolledAiGeneration(page, prompt);

  await page.goto('/app?new=blank');
  const panel = page.locator('.sidebar .ai-generation-panel').first();
  await expect(panel.locator('[data-ai-generation-prompt]')).toBeVisible({ timeout: 15_000 });
  await panel.locator('[data-ai-generation-prompt]').fill(prompt);
  await panel.getByRole('button', { name: 'Generate' }).click();

  await expect(page.getByText('Added image layer.')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.sidebar [draggable="true"]')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('.ai-generation-provenance p').filter({ hasText: prompt })).toBeVisible();
});

test('AI quota exhaustion shows a banner instead of inactive generation controls', async ({ page }) => {
  await mockAiAccess(page, {
    authenticated: true,
    enabled: false,
    disabledReason: 'quota_exhausted',
    providers: ['openai'],
    quota: { period: '2026-05', limit: 10, used: 10, remaining: 0 },
    user: { id: 'dev-user', role: 'admin' },
  });

  await page.goto('/app?new=blank');

  await expect(page.locator('.ai-generation-access-banner')).toContainText('Monthly AI quota used');
  await expect(page.locator('.ai-generation-access-banner')).toContainText(
    'Your monthly generation limit is used for this account.',
  );
  await expect(page.locator('[data-ai-generation-prompt]')).toHaveCount(0);
});

test('AI provider failure leaves the editor usable and shows the API error', async ({ page }) => {
  await mockAiAccess(page, {
    authenticated: true,
    enabled: true,
    providers: ['openai'],
    quota: { period: '2026-05', limit: 10, used: 1, remaining: 9 },
    user: { id: 'dev-user', role: 'admin' },
  });
  await page.route('**/api/ai/generations', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'browser-ai-failed-job',
        status: 'failed',
        provider: 'openai',
        model: 'mock-image-model',
        prompt: 'failed noisy cover',
        settings: { aspect: '1:1', quality: 'standard' },
        error: { code: 'provider_unavailable', message: 'Provider timed out.', retryable: true },
        quota: { period: '2026-05', limit: 10, used: 2, remaining: 8 },
        createdAt: '2026-05-21T00:00:00.000Z',
      }),
    });
  });

  await page.goto('/app?new=blank');
  const panel = page.locator('.sidebar .ai-generation-panel').first();
  await expect(panel.locator('[data-ai-generation-prompt]')).toBeVisible({ timeout: 15_000 });
  await panel.locator('[data-ai-generation-prompt]').fill('failed noisy cover');
  await panel.getByRole('button', { name: 'Generate' }).click();

  await expect(panel).toContainText('Provider timed out.', { timeout: 15_000 });
  await expect(panel.locator('.ai-generation-diagnostics')).toContainText('browser-...-job');
  await expect(panel.locator('.ai-generation-diagnostics')).toContainText('provider_unavailable');
  await expect(panel.getByRole('button', { name: 'Retry Prompt' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Recover Asset' })).toHaveCount(0);
  await expect(page.locator('.empty-canvas-start')).toBeVisible();
});

test('export does not destabilize React Flow when an AI image node is failed', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(aiFailedImageDocument))}`);
  await switchToNodeView(page);

  const aiNode = page.locator('.node-shell-kind-image').filter({ hasText: 'AI Image' }).first();
  await aiNode.click();
  await expect(aiNode.locator('.node-ai-status-overlay')).toContainText('Failed');
  await expect(page.locator('.node-props-panel .ai-generation-provenance')).toHaveCount(1);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'EXPORT' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.(png|jpe?g)$/i);
  await expect(page.getByText('Oops!')).toHaveCount(0);
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

test('selected layer nodes can be muted with keyboard shortcut', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(wideNodeDocument))}`);
  await switchToNodeView(page);

  const fillNode = page.locator('.node-shell-kind-fill').first();
  await expect(fillNode).toBeVisible({ timeout: 15_000 });
  await fillNode.click();
  await page.keyboard.press('m');

  await expect(fillNode).toHaveClass(/node-shell-muted/);
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          return doc.layers?.find((layer: { id: string }) => layer.id === 'wide-fill')?.visible;
        }),
      { timeout: 15_000 },
    )
    .toBe(false);

  await page.keyboard.press('m');
  await expect(fillNode).not.toHaveClass(/node-shell-muted/);

  await fillNode.click({ button: 'right' });
  await page.locator('.node-menu').getByRole('button', { name: /Mute/ }).click();
  await expect(fillNode).toHaveClass(/node-shell-muted/);

  await fillNode.click({ button: 'right' });
  await page
    .locator('.node-menu')
    .getByRole('button', { name: /Unmute/ })
    .click();
  await expect(fillNode).not.toHaveClass(/node-shell-muted/);
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
  await expect(page.locator('.layer-area-folder')).toContainText('Area 1');
});

test('layer area folders collapse and summarize graph-only nodes', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(areaMergeDocument))}`);

  const folder = page.locator('.layer-area-folder').first();
  await expect(folder).toContainText('Area 1');
  await expect(folder).toContainText('Organizes nodes only');
  await expect(folder.locator('.layer-area-count')).toHaveText('1 layer');
  await expect(folder.locator('.layer-area-graph-count')).toHaveText('+1 node');
  await expect(folder.locator('.layer-row-nested')).toHaveCount(1);
  await expect(folder.locator('.layer-graph-helper-row')).toContainText('Merge');

  await folder.getByRole('button', { name: /Collapse Area 1/ }).click();
  await expect(folder).toHaveClass(/layer-area-folder-collapsed/);
  await expect(folder.locator('.layer-area-folder-note')).toBeHidden();
  await expect(folder.locator('.layer-row-nested')).toHaveCount(0);
  await expect(folder.locator('.layer-graph-helper-row')).toHaveCount(0);

  await folder.getByRole('button', { name: /Expand Area 1/ }).click();
  await expect(folder).not.toHaveClass(/layer-area-folder-collapsed/);
  await expect(folder.locator('.layer-row-nested')).toHaveCount(1);
  await expect(folder.locator('.layer-graph-helper-row')).toHaveCount(1);
});

test('noise layer explains unavailable placement controls in layers', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(areaExtendDocument))}`);

  await page.locator('.layer-row').filter({ hasText: 'Area noise' }).click();
  await expect(page.getByText('Noise fills the canvas')).toBeVisible({ timeout: 15_000 });
});

test('layers can create areas from multi-selected rows', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(layerAreaCreationDocument))}`);

  await page.locator('.layer-row').filter({ hasText: 'Backdrop' }).click();
  await page
    .locator('.layer-row')
    .filter({ hasText: 'Type wash' })
    .click({ modifiers: ['Shift'] });

  await expect(page.locator('.layer-selection-actions')).toContainText('2 selected');
  await page.locator('.layer-selection-actions').getByRole('button', { name: 'Area' }).click();

  await expect(page.locator('.layer-area-folder')).toContainText('Area 1');
  await expect(page.locator('.layer-area-folder')).toContainText('2');
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
        const area = doc.graph?.areas?.[0];
        return area?.nodeIds ?? [];
      }),
    )
    .toEqual(expect.arrayContaining(['layer-area-backdrop', 'layer-area-type']));
});

test('layer area folders can be renamed', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(areaMergeDocument))}`);

  const folder = page.locator('.layer-area-folder').first();
  await folder.getByRole('button', { name: /Rename Area 1/ }).click();
  const input = folder.getByRole('textbox', { name: /Rename Area 1/ });
  await input.fill('Print Stack');
  await input.press('Enter');

  await expect(folder).toContainText('Print Stack');
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
        return doc.graph?.areas?.[0]?.name;
      }),
    )
    .toBe('Print Stack');
});

test('layers can add rows to an existing area from the context menu', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(areaExtendDocument))}`);

  await page.locator('.layer-row').filter({ hasText: 'Area noise' }).click({ button: 'right' });
  await expect(page.locator('.layer-context-menu')).toBeVisible();
  await page
    .locator('.layer-context-menu')
    .getByRole('button', { name: /Add to Area 1/ })
    .click();

  await expect(page.locator('.layer-area-folder')).toHaveCount(1);
  await expect(page.locator('.layer-area-folder')).toContainText('2');
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
        return doc.graph?.areas?.[0]?.nodeIds ?? [];
      }),
    )
    .toEqual(expect.arrayContaining(['area-fill', 'area-noise']));
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
  await expect(page.locator('.layer-area-folder')).toHaveCount(1);
  await expect(page.locator('.layer-area-folder')).toContainText('2');
  await expect(page.locator('.layer-area-more')).toHaveCount(0);

  await page.getByRole('button', { name: /Hide Area 1/ }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
        return doc.layers
          ?.filter((layer: { id: string }) => ['area-fill', 'area-noise'].includes(layer.id))
          .every((layer: { visible: boolean }) => layer.visible === false);
      }),
    )
    .toBe(true);

  await page.getByRole('button', { name: /Show Area 1/ }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
        return doc.layers
          ?.filter((layer: { id: string }) => ['area-fill', 'area-noise'].includes(layer.id))
          .every((layer: { visible: boolean }) => layer.visible === true);
      }),
    )
    .toBe(true);
});

test('dragging a node away from its area separates the node', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(areaSeparationDocument))}`);
  await switchToNodeView(page);

  const noiseNode = page
    .locator('.react-flow__node')
    .filter({ has: page.locator('.node-shell-kind-noise') })
    .first();
  await expect(noiseNode).toBeVisible({ timeout: 15_000 });
  const nodeBox = await noiseNode.boundingBox();
  expect(nodeBox).not.toBeNull();
  if (!nodeBox) return;

  await page.mouse.move(nodeBox.x + 48, nodeBox.y + 22);
  await page.mouse.down();
  await page.mouse.move(nodeBox.x + 48, nodeBox.y + 520, { steps: 10 });
  await page.mouse.up();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
        return doc.graph?.areas?.[0]?.nodeIds ?? [];
      }),
    )
    .toEqual(['area-fill']);
});

test('dragging a layer row out of an area separates the layer', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(areaSeparationDocument))}`);

  const source = page.locator('.layer-area-folder .layer-row-nested').filter({ hasText: 'Area noise' }).first();
  const target = page.locator('.layer-row').filter({ hasText: 'Outside fill' }).first();
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();

  await source.dragTo(target);

  await expect(page.locator('.layer-area-folder').first().locator('.layer-area-count')).toHaveText('1 layer');
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
        return doc.graph?.areas?.[0]?.nodeIds ?? [];
      }),
    )
    .toEqual(['area-fill']);
});

test('nodes stay visible while dragging inside an area', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(areaExtendDocument))}`);
  await switchToNodeView(page);

  const noiseNode = page
    .locator('.react-flow__node')
    .filter({ has: page.locator('.node-shell-kind-noise') })
    .first();
  await expect(noiseNode).toBeVisible({ timeout: 15_000 });
  const nodeBox = await noiseNode.boundingBox();
  expect(nodeBox).not.toBeNull();
  if (!nodeBox) return;

  await page.mouse.move(nodeBox.x + 48, nodeBox.y + 22);
  await page.mouse.down();
  await page.mouse.move(nodeBox.x + 180, nodeBox.y + 70, { steps: 8 });

  await expect(noiseNode).toBeVisible();
  await expect
    .poll(async () =>
      noiseNode.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 40 && rect.height > 40 && getComputedStyle(element).visibility === 'visible';
      }),
    )
    .toBe(true);
  await expect(page.locator('.node-area-label')).toHaveCSS('opacity', '0');

  await page.mouse.up();
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

test('image transform gestures stay local to the selected node', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(imageDragDocument))}`);
  await switchToNodeView(page);

  const imageNode = page.locator('.node-shell-kind-image').first();
  await expect(imageNode).toBeVisible({ timeout: 15_000 });
  await imageNode.click();

  await expect(imageNode.locator('.node-live-media-overlay')).toHaveCount(0);
  await expect(imageNode.locator('.node-thumbnail-canvas')).toBeVisible({ timeout: 15_000 });

  const overlay = imageNode.locator('.node-drag-overlay');
  await expect(overlay).toBeVisible({ timeout: 15_000 });
  const box = await overlay.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const viewport = page.locator('.react-flow__viewport').first();
  const beforeWheelTransform = await viewport.evaluate((element) => getComputedStyle(element).transform);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 8; i += 1) {
    await page.mouse.wheel(0, -240);
  }
  await page.waitForTimeout(120);
  await expect(imageNode.locator('.node-live-media-overlay')).toBeVisible();
  await expect(imageNode.locator('.node-thumbnail-skeleton')).toHaveCount(0);
  const afterWheelTransform = await viewport.evaluate((element) => getComputedStyle(element).transform);

  expect(afterWheelTransform).toBe(beforeWheelTransform);
  await expect(page.getByText('Oops!')).toHaveCount(0);
  await page.waitForTimeout(250);
  await expect(imageNode.locator('.node-live-media-overlay')).toBeVisible();
  await expect(imageNode.locator('.node-thumbnail-skeleton')).toHaveCount(0);

  const scaleAfterPreviewWheel = await page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
    return doc.layers?.find((layer: { id: string }) => layer.id === 'image-drag-image')?.scaleX;
  });
  await imageNode.locator('.node-shell-header').hover();
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(250);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
        return doc.layers?.find((layer: { id: string }) => layer.id === 'image-drag-image')?.scaleX;
      }),
    )
    .toBe(scaleAfterPreviewWheel);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 0; i < 10; i += 1) {
    await page.mouse.move(box.x + box.width / 2 + i * 22, box.y + box.height / 2 + (i % 2 === 0 ? 48 : -48));
  }
  await page.mouse.up();

  await expect(page.getByText('Oops!')).toHaveCount(0);
  await expect(imageNode.locator('.node-live-preview-frame')).toHaveCSS('overflow', 'hidden');
});

test('inline image payloads migrate to browser asset storage', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(imageDragDocument))}`);
  await expectLayerCanvasToHavePixels(page);

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          return doc.layers?.find((layer: { kind: string }) => layer.kind === 'image')?.src ?? '';
        }),
      { timeout: 15_000 },
    )
    .toMatch(/^artifact-asset:\/\//);

  const storedDoc = await page.evaluate(() => localStorage.getItem('doc') ?? '');
  expect(storedDoc).not.toContain('data:image/');

  await page.reload();
  await expectLayerCanvasToHavePixels(page);
});

test('empty transparent documents render transparent pixels over checkerboard chrome', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(emptyTransparentDocument))}`);

  const canvas = page.locator('.pixi-container canvas').first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expectCanvasCenterAlpha(page, 0);

  await expect
    .poll(async () => page.locator('.pixi-container').evaluate((element) => getComputedStyle(element).backgroundImage))
    .toContain('linear-gradient');
});

async function expectCanvasCenterAlpha(page: Page, alpha: number) {
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
    .toBe(alpha);
}

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
    if (await page.locator('.node-canvas-root').isVisible()) return;
    const nodesButton = page.getByRole('button', { name: 'nodes' });
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

async function mockAiAccess(page: Page, access: Record<string, unknown>) {
  await page.unroute('**/api/ai/access');
  await page.route('**/api/ai/access', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(access),
    });
  });
}

async function mockSuccessfulAiGeneration(page: Page, expectedPrompt: string) {
  await page.route('**/api/ai/generations', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fallback();
    const body = request.postDataJSON() as { prompt?: string; provider?: string; settings?: { quality?: string } };
    expect(body.prompt).toBe(expectedPrompt);
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'browser-ai-job-1',
        status: 'succeeded',
        provider: body.provider ?? 'openai',
        model: 'mock-image-model',
        prompt: body.prompt,
        settings: { aspect: '1:1', quality: body.settings?.quality ?? 'standard' },
        asset: {
          id: 'browser-ai-asset-1',
          uri: generatedImageDataUrl,
          mimeType: 'image/png',
          width: 1,
          height: 1,
          sizeBytes: 70,
          createdAt: '2026-05-21T00:00:00.000Z',
          metadata: {
            provider: body.provider ?? 'openai',
            model: 'mock-image-model',
            prompt: body.prompt,
            settings: { aspect: '1:1', quality: body.settings?.quality ?? 'standard' },
            createdAt: '2026-05-21T00:00:00.000Z',
          },
        },
        quota: { period: '2026-05', limit: 10, used: 4, remaining: 6 },
        createdAt: '2026-05-21T00:00:00.000Z',
        completedAt: '2026-05-21T00:00:01.000Z',
      }),
    });
  });
}

async function mockSequentialSuccessfulAiGenerations(page: Page, expectedPrompts: string[]) {
  let requestIndex = 0;
  await page.route('**/api/ai/generations', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fallback();
    const body = request.postDataJSON() as { prompt?: string; provider?: string; settings?: { quality?: string } };
    const expectedPrompt = expectedPrompts[requestIndex];
    expect(body.prompt).toBe(expectedPrompt);
    requestIndex += 1;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: `browser-ai-sequence-job-${requestIndex}`,
        status: 'succeeded',
        provider: body.provider ?? 'openai',
        model: 'mock-image-model',
        prompt: body.prompt,
        settings: { aspect: '1:1', quality: body.settings?.quality ?? 'standard' },
        asset: {
          id: `browser-ai-sequence-asset-${requestIndex}`,
          uri: requestIndex % 2 === 0 ? testImageSrc : generatedImageDataUrl,
          mimeType: requestIndex % 2 === 0 ? 'image/svg+xml' : 'image/png',
          width: 1,
          height: 1,
          sizeBytes: 70,
          createdAt: `2026-05-21T00:00:0${requestIndex}.000Z`,
          metadata: {
            provider: body.provider ?? 'openai',
            model: 'mock-image-model',
            prompt: body.prompt,
            settings: { aspect: '1:1', quality: body.settings?.quality ?? 'standard' },
            createdAt: `2026-05-21T00:00:0${requestIndex}.000Z`,
          },
        },
        quota: { period: '2026-05', limit: 10, used: 4 + requestIndex, remaining: 6 - requestIndex },
        createdAt: `2026-05-21T00:00:0${requestIndex}.000Z`,
        completedAt: `2026-05-21T00:00:0${requestIndex}.500Z`,
      }),
    });
  });
}

async function mockPolledAiGeneration(page: Page, expectedPrompt: string) {
  let pollCount = 0;
  await page.route('**/api/ai/generations**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as { prompt?: string; provider?: string; settings?: { quality?: string } };
      expect(body.prompt).toBe(expectedPrompt);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'browser-ai-polled-job',
          status: 'queued',
          provider: body.provider ?? 'openai',
          model: 'mock-image-model',
          prompt: body.prompt,
          settings: { aspect: '1:1', quality: body.settings?.quality ?? 'standard' },
          quota: { period: '2026-05', limit: 10, used: 5, remaining: 5 },
          createdAt: '2026-05-21T00:00:00.000Z',
        }),
      });
      return;
    }

    if (request.method() === 'GET' && request.url().includes('/api/ai/generations/browser-ai-polled-job')) {
      pollCount += 1;
      const succeeded = pollCount >= 2;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'browser-ai-polled-job',
          status: succeeded ? 'succeeded' : 'running',
          provider: 'openai',
          model: 'mock-image-model',
          prompt: expectedPrompt,
          settings: { aspect: '1:1', quality: 'standard' },
          ...(succeeded
            ? {
                asset: {
                  id: 'browser-ai-polled-asset',
                  uri: generatedImageDataUrl,
                  mimeType: 'image/png',
                  width: 1,
                  height: 1,
                  sizeBytes: 70,
                  createdAt: '2026-05-21T00:00:02.000Z',
                  metadata: {
                    provider: 'openai',
                    model: 'mock-image-model',
                    prompt: expectedPrompt,
                    settings: { aspect: '1:1', quality: 'standard' },
                    createdAt: '2026-05-21T00:00:02.000Z',
                  },
                },
                completedAt: '2026-05-21T00:00:02.000Z',
              }
            : {}),
          createdAt: '2026-05-21T00:00:00.000Z',
          startedAt: '2026-05-21T00:00:01.000Z',
        }),
      });
      return;
    }

    await route.fallback();
  });
}

async function getCanvasCenterRgb(page: Page) {
  return getCanvasRgbAt(page, 0.5, 0.5);
}

async function getCanvasRgbAt(page: Page, xRatio: number, yRatio: number) {
  const canvas = page.locator('.pixi-container canvas').first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  return canvas.evaluate(
    (element, point) => {
      const canvas = element as HTMLCanvasElement;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx || canvas.width <= 0 || canvas.height <= 0) return { r: 0, g: 0, b: 0 };
      const [r = 0, g = 0, b = 0] = ctx.getImageData(
        Math.floor(canvas.width * point.xRatio),
        Math.floor(canvas.height * point.yRatio),
        1,
        1,
      ).data;
      return { r, g, b };
    },
    { xRatio, yRatio },
  );
}

function colorDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

async function frameRatio(locator: Locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width / Math.max(1, rect.height);
  });
}
