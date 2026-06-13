import { Buffer } from 'node:buffer';
import { statSync } from 'node:fs';
import { expect, test } from '@playwright/test';

import { expectNoBrowserIssues, gotoDocument, setupBrowserTestPage, switchToNodeView } from './helpers';

const tinyModelDataUrl = makeTinyGltfModelDataUrl();

const v036Retro3DDocument = {
  schemaVersion: 1,
  global: { bg: 'transparent', seed: 36, aspect: '1:1' },
  layers: [
    {
      id: 'v036-model',
      name: 'Tiny GLB',
      visible: true,
      locked: false,
      kind: 'model',
      modelSrc: tinyModelDataUrl,
      modelName: 'tiny.glb',
      modelMime: 'model/gltf-binary',
      modelBytes: tinyModelDataUrl.length,
      color: '#ff5a36',
      accentColor: '#f4d35e',
      opacity: 100,
      blendMode: 'normal',
      seedOffset: 0,
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      primitiveShape: 'sphere',
      primitiveShading: 'smooth',
      tiltX: -14,
      tiltY: 31,
      tiltZ: 0,
      primitiveDepth: 48,
      noiseType: 'clouds',
      noiseScale: 28,
      noiseDetail: 4,
      noiseContrast: 52,
      noiseBalance: 50,
      noiseWarp: 0,
      noiseTurbulence: 0,
      noiseThreshold: 0,
      arrayPattern: 'grid',
      arrayShape: 'disc',
      arrayCount: 6,
      arrayRows: 4,
      arrayGap: 30,
      arrayRadius: 120,
      arraySize: 36,
      arrayJitter: 0,
      lineFieldOrientation: 'horizontal',
      lineFieldDistortion: 'none',
      lineFieldCount: 28,
      lineFieldSpacing: 18,
      lineFieldStroke: 3,
      lineFieldStrength: 0,
      lineFieldFrequency: 3,
      lineFieldBackground: '#000000',
      lineFieldTransparent: true,
    },
    {
      id: 'v036-retro-resolution',
      name: 'Retro Resolution',
      visible: true,
      locked: false,
      kind: 'effect',
      preset: 'retroResolution',
      retroResolution: 256,
    },
    {
      id: 'v036-indexed-palette',
      name: 'Indexed Palette',
      visible: true,
      locked: false,
      kind: 'effect',
      preset: 'indexedPalette',
      indexedPalette: 100,
      indexedPaletteCount: 4,
      indexedColorA: '#120020',
      indexedColorB: '#ff1744',
      indexedColorC: '#f4d35e',
      indexedColorD: '#f8e9ff',
    },
    {
      id: 'v036-dot-grain',
      name: 'Dot Grain',
      visible: true,
      locked: false,
      kind: 'effect',
      preset: 'dotGrain',
      dotGrain: 72,
      dotGrainSize: 4,
      dotGrainDensity: 66,
      dotGrainJitter: 38,
    },
    {
      id: 'v036-edge-crush',
      name: 'Edge Crush',
      visible: true,
      locked: false,
      kind: 'effect',
      preset: 'edgeCrush',
      edgeCrush: 70,
    },
  ],
  graph: {
    edges: [
      { id: 'e-v036-env-scene', fromId: 'v036-env', fromPort: 'out', toId: 'v036-scene', toPort: 'env' },
      { id: 'e-v036-model-scene', fromId: 'v036-model', fromPort: 'out', toId: 'v036-scene', toPort: 'model' },
      { id: 'e-v036-scene-retro', fromId: 'v036-scene', fromPort: 'out', toId: 'v036-retro-resolution', toPort: 'in' },
      {
        id: 'e-v036-retro-palette',
        fromId: 'v036-retro-resolution',
        fromPort: 'out',
        toId: 'v036-indexed-palette',
        toPort: 'in',
      },
      {
        id: 'e-v036-palette-dots',
        fromId: 'v036-indexed-palette',
        fromPort: 'out',
        toId: 'v036-dot-grain',
        toPort: 'in',
      },
      { id: 'e-v036-dots-edge', fromId: 'v036-dot-grain', fromPort: 'out', toId: 'v036-edge-crush', toPort: 'in' },
      { id: 'e-v036-edge-export', fromId: 'v036-edge-crush', fromPort: 'out', toId: '__export__', toPort: 'in' },
    ],
    positions: {
      'v036-model': { x: 0, y: 80 },
      'v036-env': { x: 0, y: 470 },
      'v036-scene': { x: 360, y: 80 },
      'v036-retro-resolution': { x: 720, y: 80 },
      'v036-indexed-palette': { x: 1080, y: 80 },
      'v036-dot-grain': { x: 720, y: 470 },
      'v036-edge-crush': { x: 1080, y: 470 },
      __export__: { x: 360, y: 470 },
    },
    mergeNodes: [],
    colorNodes: [],
    scene3dNodes: [
      {
        id: 'v036-scene',
        name: '3D Scene',
        environmentSrc: '',
        environmentName: '',
        environmentMime: '',
        environmentBytes: 0,
        materialMode: 'clay',
        transparent: true,
        exposure: 118,
        environmentStrength: 0,
        ambientIntensity: 120,
        keyAzimuth: 42,
        keyElevation: 36,
        keyIntensity: 155,
        fillIntensity: 70,
        rimIntensity: 64,
      },
    ],
    environmentNodes: [
      {
        id: 'v036-env',
        name: 'Environment Map',
        environmentSrc: '',
        environmentName: '',
        environmentMime: '',
        environmentBytes: 0,
      },
    ],
    primitiveViewStates: {
      'v036-model': { rotationX: -8, rotationY: 32, zoom: 1.08, panX: 0, panY: 0, locked: false },
      'v036-scene': { rotationX: -6, rotationY: 24, zoom: 1.12, panX: 0, panY: 0, locked: false },
    },
  },
  export: { format: 'png', scale: 1, target: 'cover' },
};

test.beforeEach(async ({ page }) => {
  await setupBrowserTestPage(page);
});

test.afterEach(async ({ page }) => {
  expectNoBrowserIssues(page);
});

test('v0.36 3D model scene and retro effect graph renders and exports', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '3D model export smoke runs once in Chromium.');

  await gotoDocument(page, v036Retro3DDocument);
  await switchToNodeView(page);

  await expect(page.locator('.react-flow__node[data-id="v036-model"]')).toBeAttached({ timeout: 15_000 });
  await expect(page.locator('.react-flow__node[data-id="v036-scene"]')).toBeAttached({ timeout: 15_000 });
  await expect(page.locator('.react-flow__node[data-id="v036-env"]')).toBeAttached({ timeout: 15_000 });
  await expect(page.locator('.react-flow__node[data-id="v036-dot-grain"]')).toBeAttached({ timeout: 15_000 });
  await expect(page.locator('.react-flow__node[data-id="__export__"]')).toBeAttached({ timeout: 15_000 });
  await expect(page.locator('.node-shell-kind-scene3d')).toContainText(/3d scene/i);
  await expect(page.locator('.node-shell-kind-environment')).toContainText(/environment/i);

  const outputCanvas = page.locator('.react-flow__node[data-id="__export__"] canvas.node-thumbnail-canvas');
  await expect(outputCanvas).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => outputCanvas.evaluate(canvasHasVisiblePixels), { timeout: 20_000 }).toBe(true);

  const exportButton = page.getByRole('button', { name: 'EXPORT' });
  await expect(exportButton).toBeEnabled({ timeout: 15_000 });
  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/i);
  const artifactPath = await download.path();
  expect(artifactPath).toBeTruthy();
  if (!artifactPath) throw new Error('Downloaded export path is unavailable');
  expect(statSync(artifactPath).size).toBeGreaterThan(1024);
});

test('v0.36 unsupported model drops explain the accepted formats', async ({ page }) => {
  await page.goto('/app?new=blank');
  await expect(page.getByRole('heading', { name: 'Artifact Cover Editor' })).toBeAttached({ timeout: 20_000 });

  const dataTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['not a browser model'], 'skull.obj', { type: 'text/plain' }));
    return transfer;
  });

  await page.locator('main.main-layers').dispatchEvent('drop', { dataTransfer });
  await expect(page.getByText('Unsupported file: skull.obj.')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('GLB models')).toBeVisible();
  await expect(page.getByText('EXR/HDR environments')).toBeVisible();
});

function makeTinyGltfModelDataUrl() {
  const binary = Buffer.alloc(44);
  const vertices = [-0.8, -0.5, 0, 0.8, -0.5, 0, 0, 0.7, 0];
  vertices.forEach((value, index) => binary.writeFloatLE(value, index * 4));
  [0, 1, 2].forEach((value, index) => binary.writeUInt16LE(value, 36 + index * 2));
  const gltf = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }],
      },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [1, 0.35, 0.18, 1],
          metallicFactor: 0,
          roughnessFactor: 0.65,
        },
      },
    ],
    buffers: [{ uri: `data:application/octet-stream;base64,${binary.toString('base64')}`, byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [-0.8, -0.5, 0],
        max: [0.8, 0.7, 0],
      },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
  };
  return `data:application/octet-stream;base64,${Buffer.from(JSON.stringify(gltf)).toString('base64')}`;
}

function canvasHasVisiblePixels(element: Element): boolean {
  const canvas = element as HTMLCanvasElement;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width <= 0 || canvas.height <= 0) return false;
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const stride = Math.max(4, Math.floor(pixels.length / (4 * 4096)) * 4);
  for (let index = 0; index < pixels.length; index += stride) {
    const alpha = pixels[index + 3] ?? 0;
    const channel = Math.max(pixels[index] ?? 0, pixels[index + 1] ?? 0, pixels[index + 2] ?? 0);
    if (alpha > 8 && channel > 24) return true;
  }
  return false;
}
