import { Buffer } from 'node:buffer';
import { readFileSync, statSync } from 'node:fs';
import { type Browser, expect, type Locator, type Page, type TestInfo, test } from '@playwright/test';
import { DataTexture, FloatType, RGBAFormat } from 'three';
import { EXRExporter, NO_COMPRESSION } from 'three/addons/exporters/EXRExporter.js';

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
      name: 'Silhouette Crush',
      visible: true,
      locked: false,
      kind: 'effect',
      preset: 'silhouetteCrush',
      silhouetteCrush: 70,
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
        environmentRotation: 0,
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

const v036LayerSceneParityDocument = {
  ...v036Retro3DDocument,
  graph: {
    ...v036Retro3DDocument.graph,
    primitiveViewStates: {
      ...v036Retro3DDocument.graph.primitiveViewStates,
      'v036-scene': { rotationX: 28, rotationY: 146, zoom: 1.42, panX: 0.08, panY: -0.04, locked: false },
    },
  },
};

const v037SceneMaterialDocument = {
  ...v036Retro3DDocument,
  graph: {
    ...v036Retro3DDocument.graph,
    edges: [
      { id: 'e-v037-material-scene', fromId: 'v037-chrome', fromPort: 'out', toId: 'v036-scene', toPort: 'material' },
      ...v036Retro3DDocument.graph.edges,
    ],
    positions: {
      ...v036Retro3DDocument.graph.positions,
      'v037-chrome': { x: 0, y: 840 },
    },
    materialNodes: [
      {
        id: 'v037-chrome',
        name: 'Chrome',
        materialPreset: 'chrome',
        materialBaseColor: '#d6dde4',
        materialAccentColor: '#ffffff',
        materialMetalness: 1,
        materialRoughness: 0.08,
        materialClearcoat: 0.7,
        materialRelief: 0.04,
        materialGrain: 0,
        materialAnisotropy: 0,
      },
    ],
  },
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

test('project package restores embedded GLB and EXR assets in a clean browser context', async ({
  browser,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '3D project-package portability runs once in Chromium.');

  const sourceDocument = await makePortable3DSourceDocument();
  await gotoDocument(page, sourceDocument);
  const sourceRefs = await waitForStored3DRefs(page);
  await switchToNodeView(page);
  await expectSceneOutput(page);

  const { packageJson, projectPackage } = await downloadProjectPackage(page);
  expectPackaged3DAssets(projectPackage, sourceRefs);
  await expectCleanContext3DRoundTrip(browser, packageJson, sourceRefs, testInfo);
});

test('v0.37 material node feeds a 3D scene material slot', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '3D scene material smoke runs once in Chromium.');

  await gotoDocument(page, v036Retro3DDocument);
  await switchToNodeView(page);
  const baseSceneCanvas = page.locator('.react-flow__node[data-id="v036-scene"] canvas.node-thumbnail-canvas');
  await expect(baseSceneCanvas).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => baseSceneCanvas.evaluate(canvasHasVisiblePixels), { timeout: 20_000 }).toBe(true);
  const baseScenePixels = await reducedCanvasPixels(baseSceneCanvas);

  await gotoDocument(page, v037SceneMaterialDocument);
  await switchToNodeView(page);

  const sceneNode = page.locator('.react-flow__node[data-id="v036-scene"]');
  await expect(sceneNode).toBeVisible({ timeout: 15_000 });
  await expect(sceneNode).toContainText(/material/i);
  await expect(page.locator('.react-flow__node[data-id="v037-chrome"]')).toContainText(/surface/i);

  const outputCanvas = page.locator('.react-flow__node[data-id="__export__"] canvas.node-thumbnail-canvas');
  await expect(outputCanvas).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => outputCanvas.evaluate(canvasHasVisiblePixels), { timeout: 20_000 }).toBe(true);
  const materialScenePixels = await reducedCanvasPixels(sceneNode.locator('canvas.node-thumbnail-canvas'));
  expect(meanAbsoluteDiff(baseScenePixels, materialScenePixels)).toBeGreaterThan(2);
});

test('v0.36 layers preview follows graph 3D scene camera state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '3D layer/node preview parity runs once in Chromium.');

  await gotoDocument(page, v036LayerSceneParityDocument);
  const layerCanvas = page.locator('.pixi-container canvas').first();
  await expect(layerCanvas).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => layerCanvas.evaluate(canvasHasVisiblePixels), { timeout: 20_000 }).toBe(true);
  const layerPixels = await reducedCanvasPixels(layerCanvas);

  await switchToNodeView(page);
  const outputCanvas = page.locator('.react-flow__node[data-id="__export__"] canvas.node-thumbnail-canvas');
  await expect(outputCanvas).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => outputCanvas.evaluate(canvasHasVisiblePixels), { timeout: 20_000 }).toBe(true);
  const outputPixels = await reducedCanvasPixels(outputCanvas);

  expect(meanAbsoluteDiff(layerPixels, outputPixels)).toBeLessThan(24);
});

test('v0.36 layers treats 3D scene as the layer and model as a scene setting', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '3D scene layer semantics runs once in Chromium.');

  await gotoDocument(page, v036Retro3DDocument);

  const layerRows = page.locator('.sidebar .layer-row');
  await expect(layerRows.filter({ hasText: '3D Scene' })).toHaveCount(1, { timeout: 15_000 });
  await expect(layerRows.filter({ hasText: 'Tiny GLB' })).toHaveCount(0);

  await layerRows.filter({ hasText: '3D Scene' }).first().click();
  const inspector = page.locator('.layer-inspector-drawer');
  await expect(inspector.locator('.editor-target-header').first()).toContainText('3D Scene');
  await expect(inspector.locator('.editor-target-header').first()).not.toContainText('Layers / 3D Scene');
  await expect(inspector).toContainText('Scene Inputs');
  await expect(inspector).toContainText('3D Source');
  await expect(inspector).toContainText('tiny.glb');
  await expect(inspector).toContainText('Environment Map');
});

test('v0.36 3D model node always auto-spins without committing view state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '3D model preview animation runs once in Chromium.');

  await gotoDocument(page, v036Retro3DDocument);
  await switchToNodeView(page);

  const modelNode = page.locator('.react-flow__node[data-id="v036-model"]').first();
  await expect(modelNode).toBeVisible({ timeout: 15_000 });

  const modelCanvas = modelNode.locator('.node-interactive-viewport canvas').first();
  await expect(modelCanvas).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => reducedPixelsHaveVisibleColor(await reducedCanvasPixels(modelCanvas)), { timeout: 20_000 })
    .toBe(true);

  const initialRotationY = await storedModelRotationY(page);
  const initialPixels = await reducedCanvasPixels(modelCanvas);
  await expect
    .poll(async () => meanAbsoluteDiff(initialPixels, await reducedCanvasPixels(modelCanvas)), { timeout: 3_000 })
    .toBeGreaterThan(0.2);
  await expect.poll(() => storedModelRotationY(page), { timeout: 3_000 }).toBe(initialRotationY);
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

test('v0.36 3D scene viewport edits are undoable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '3D viewport gesture regression runs once in Chromium.');

  await gotoDocument(page, v036Retro3DDocument);
  await switchToNodeView(page);

  const sceneNode = page.locator('.react-flow__node[data-id="v036-scene"]').first();
  await expect(sceneNode).toBeVisible({ timeout: 15_000 });
  await sceneNode.click();
  const sceneViewport = page.locator('.react-flow__node[data-id="v036-scene"] .node-interactive-viewport').first();
  await expect(sceneViewport).toBeVisible({ timeout: 15_000 });
  const box = await sceneViewport.boundingBox();
  expect(box).toBeTruthy();
  if (!box) throw new Error('3D scene viewport bounds are unavailable');

  const initialRotationY = await storedSceneRotationY(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 12, { steps: 6 });
  await page.mouse.up();

  await expect.poll(() => storedSceneRotationY(page), { timeout: 15_000 }).not.toBe(initialRotationY);
  const undoButton = page.getByRole('button', { name: 'Undo' });
  await expect(undoButton).toBeEnabled({ timeout: 15_000 });
  await undoButton.click();
  await expect.poll(() => storedSceneRotationY(page), { timeout: 15_000 }).toBe(initialRotationY);
});

type Stored3DRefs = Awaited<ReturnType<typeof waitForStored3DRefs>>;
type Stored3DAssets = Awaited<ReturnType<typeof waitForStored3DAssets>>;

async function makePortable3DSourceDocument() {
  const sourceDocument = structuredClone(v036Retro3DDocument);
  const modelDataUrl = makeTinyGlbModelDataUrl();
  const environmentDataUrl = await makeTinyExrEnvironmentDataUrl();
  const modelLayer = sourceDocument.layers.find((layer) => layer.id === 'v036-model');
  if (!modelLayer || modelLayer.kind !== 'model') throw new Error('3D model fixture is unavailable');
  modelLayer.modelSrc = modelDataUrl;
  modelLayer.modelName = 'portable-triangle.glb';
  modelLayer.modelMime = 'model/gltf-binary';
  modelLayer.modelBytes = Buffer.byteLength(modelDataUrl);

  const environmentNode = sourceDocument.graph.environmentNodes[0];
  if (!environmentNode) throw new Error('Environment fixture is unavailable');
  environmentNode.environmentSrc = environmentDataUrl;
  environmentNode.environmentName = 'portable-studio.exr';
  environmentNode.environmentMime = 'image/x-exr';
  environmentNode.environmentBytes = Buffer.byteLength(environmentDataUrl);

  const sceneNode = sourceDocument.graph.scene3dNodes[0];
  if (!sceneNode) throw new Error('3D scene fixture is unavailable');
  sceneNode.environmentStrength = 85;
  return sourceDocument;
}

async function downloadProjectPackage(page: Page) {
  const packageDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Share link or download editable files' }).click();
  await page.getByRole('menuitem', { name: 'Download package + assets', exact: true }).click();
  const download = await packageDownload;
  const packagePath = await download.path();
  if (!packagePath) throw new Error('Downloaded project package is unavailable');
  const packageJson = readFileSync(packagePath, 'utf8');
  return { packageJson, projectPackage: JSON.parse(packageJson) };
}

function expectPackaged3DAssets(projectPackage: unknown, sourceRefs: Stored3DRefs) {
  expect(projectPackage).toMatchObject({
    document: {
      modelAssets: [
        {
          id: sourceRefs.modelRef.replace('artifact-model://', ''),
          label: 'portable-triangle.glb',
          mime: 'model/gltf-binary',
          dataUrl: expect.stringMatching(/^data:model\/gltf-binary;base64,/),
        },
      ],
      envAssets: [
        {
          id: sourceRefs.environmentRef.replace('artifact-env://', ''),
          label: 'portable-studio.exr',
          mime: 'image/x-exr',
          dataUrl: expect.stringMatching(/^data:image\/x-exr;base64,/),
        },
      ],
    },
    manifest: {
      models: {
        importedRefs: [sourceRefs.modelRef],
        embeddedPayloads: 1,
        remainingLocalRefs: [],
      },
      environments: {
        importedRefs: [sourceRefs.environmentRef],
        embeddedPayloads: 1,
        remainingLocalRefs: [],
      },
    },
  });
}

function expectRestored3DAssets(restored: Stored3DAssets, sourceRefs: Stored3DRefs) {
  expect(restored.model).toMatchObject({
    id: sourceRefs.modelRef.replace('artifact-model://', ''),
    label: 'portable-triangle.glb',
    mime: 'model/gltf-binary',
  });
  expect(restored.model?.dataUrl).toMatch(/^data:model\/gltf-binary;base64,/);
  expect(restored.environment).toMatchObject({
    id: sourceRefs.environmentRef.replace('artifact-env://', ''),
    label: 'portable-studio.exr',
    mime: 'image/x-exr',
  });
  expect(restored.environment?.dataUrl).toMatch(/^data:image\/x-exr;base64,/);
  expect(restored.document).toMatchObject({
    modelRef: sourceRefs.modelRef,
    environmentRef: sourceRefs.environmentRef,
    environmentStrength: 85,
    hasModelPayloadField: false,
    hasEnvironmentPayloadField: false,
    edgeIds: expect.arrayContaining(['e-v036-env-scene', 'e-v036-model-scene', 'e-v036-edge-export']),
  });
}

async function expectCleanContext3DRoundTrip(
  browser: Browser,
  packageJson: string,
  sourceRefs: Stored3DRefs,
  testInfo: TestInfo,
) {
  const cleanContext = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    viewport: { width: 1440, height: 960 },
  });
  const cleanPage = await cleanContext.newPage();
  await setupBrowserTestPage(cleanPage);
  try {
    await openProjectPackage(cleanPage, packageJson);
    const restored = await waitForStored3DAssets(cleanPage, sourceRefs);
    expectRestored3DAssets(restored, sourceRefs);
    await switchToNodeView(cleanPage);
    await expectSceneOutput(cleanPage);
    await expect(cleanPage.getByText('Model load failed')).toHaveCount(0);
    await expect(cleanPage.getByText('Env map unavailable')).toHaveCount(0);
    await testInfo.attach('clean-context-3d-package-roundtrip', {
      body: await cleanPage.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    expectNoBrowserIssues(cleanPage);
  } finally {
    await cleanContext.close();
  }
}

function makeTinyGltfModelDataUrl() {
  const geometry = makeTinyTriangleGeometry();
  const { binary } = geometry;
  const gltf = {
    ...makeTinyTriangleGltf(geometry),
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
  };
  return `data:application/octet-stream;base64,${Buffer.from(JSON.stringify(gltf)).toString('base64')}`;
}

function makeTinyGlbModelDataUrl() {
  const geometry = makeTinyTriangleGeometry();
  const { binary } = geometry;
  const gltf = makeTinyTriangleGltf(geometry);
  const json = Buffer.from(JSON.stringify(gltf));
  const jsonChunk = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const binaryChunk = Buffer.concat([binary, Buffer.alloc((4 - (binary.length % 4)) % 4)]);
  const glb = Buffer.alloc(12 + 8 + jsonChunk.length + 8 + binaryChunk.length);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(jsonChunk.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(glb, 20);
  const binaryHeaderOffset = 20 + jsonChunk.length;
  glb.writeUInt32LE(binaryChunk.length, binaryHeaderOffset);
  glb.writeUInt32LE(0x004e4942, binaryHeaderOffset + 4);
  binaryChunk.copy(glb, binaryHeaderOffset + 8);
  return `data:model/gltf-binary;base64,${glb.toString('base64')}`;
}

function makeTinyTriangleGeometry() {
  const binary = Buffer.alloc(44);
  const vertices = [-0.8, -0.5, 0, 0.8, -0.5, 0, 0, 0.7, 0];
  vertices.forEach((value, index) => binary.writeFloatLE(value, index * 4));
  [0, 1, 2].forEach((value, index) => binary.writeUInt16LE(value, 36 + index * 2));
  return {
    binary,
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
}

function makeTinyTriangleGltf({ binary, bufferViews, accessors }: ReturnType<typeof makeTinyTriangleGeometry>) {
  return {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: binary.length }],
    bufferViews,
    accessors,
  };
}

async function makeTinyExrEnvironmentDataUrl() {
  const width = 8;
  const height = 4;
  const pixels = new Float32Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const x = index % width;
    const y = Math.floor(index / width);
    pixels[index * 4] = 0.15 + x / width;
    pixels[index * 4 + 1] = 0.1 + y / height;
    pixels[index * 4 + 2] = 0.35 + (width - x) / width;
    pixels[index * 4 + 3] = 1;
  }
  const texture = new DataTexture(pixels, width, height, RGBAFormat, FloatType);
  try {
    const bytes = await new EXRExporter().parse(texture, { compression: NO_COMPRESSION, type: FloatType });
    return `data:image/x-exr;base64,${Buffer.from(bytes).toString('base64')}`;
  } finally {
    texture.dispose();
  }
}

async function waitForStored3DRefs(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          return {
            modelRef: doc.layers?.find((layer: { id: string }) => layer.id === 'v036-model')?.modelSrc ?? '',
            environmentRef: doc.graph?.environmentNodes?.[0]?.environmentSrc ?? '',
          };
        }),
      { timeout: 15_000 },
    )
    .toEqual({
      modelRef: expect.stringMatching(/^artifact-model:\/\//),
      environmentRef: expect.stringMatching(/^artifact-env:\/\//),
    });
  return page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
    return {
      modelRef: doc.layers.find((layer: { id: string }) => layer.id === 'v036-model').modelSrc as string,
      environmentRef: doc.graph.environmentNodes[0].environmentSrc as string,
    };
  });
}

async function openProjectPackage(page: Page, packageJson: string) {
  await page.goto('/app?new=blank');
  await expect(page.getByRole('heading', { name: 'Artifact Cover Editor' })).toBeVisible({ timeout: 20_000 });
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open document file' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'portable-3d-assets.artifact',
    mimeType: 'application/vnd.artifact.project+json',
    buffer: Buffer.from(packageJson),
  });
  await page.getByRole('dialog', { name: 'Open artifact file' }).getByRole('button', { name: 'OPEN FILE' }).click();
}

async function waitForStored3DAssets(page: Page, refs: { modelRef: string; environmentRef: string }) {
  const readState = () =>
    page.evaluate(async (assetRefs) => {
      const readAsset = (databaseName: string, storeName: string, id: string) =>
        new Promise<Record<string, unknown> | null>((resolve, reject) => {
          const request = indexedDB.open(databaseName);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction(storeName, 'readonly');
            const getRequest = transaction.objectStore(storeName).get(id);
            getRequest.onerror = () => reject(getRequest.error);
            getRequest.onsuccess = () => resolve((getRequest.result as Record<string, unknown> | undefined) ?? null);
            transaction.oncomplete = () => database.close();
          };
        });
      const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
      const modelRef = doc.layers?.find((layer: { id: string }) => layer.id === 'v036-model')?.modelSrc ?? '';
      const environmentRef = doc.graph?.environmentNodes?.[0]?.environmentSrc ?? '';
      return {
        model: await readAsset(
          'artifact-local-model-assets',
          'models',
          assetRefs.modelRef.replace('artifact-model://', ''),
        ),
        environment: await readAsset(
          'artifact-local-environment-assets',
          'environments',
          assetRefs.environmentRef.replace('artifact-env://', ''),
        ),
        document: {
          modelRef,
          environmentRef,
          environmentStrength: doc.graph?.scene3dNodes?.[0]?.environmentStrength,
          edgeIds: doc.graph?.edges?.map((edge: { id: string }) => edge.id) ?? [],
          hasModelPayloadField: Object.hasOwn(doc, 'modelAssets'),
          hasEnvironmentPayloadField: Object.hasOwn(doc, 'envAssets'),
        },
      };
    }, refs);
  await expect
    .poll(
      async () => {
        const state = await readState();
        return Boolean(state.model && state.environment && state.document.modelRef && state.document.environmentRef);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return readState();
}

async function expectSceneOutput(page: Page) {
  const outputCanvas = page.locator('.react-flow__node[data-id="__export__"] canvas.node-thumbnail-canvas');
  await expect(outputCanvas).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => outputCanvas.evaluate(canvasHasVisiblePixels), { timeout: 25_000 }).toBe(true);
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

async function reducedCanvasPixels(locator: Locator): Promise<number[]> {
  return locator.evaluate((element) => {
    const source = element as HTMLCanvasElement;
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || source.width <= 0 || source.height <= 0) return [];
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(source, 0, 0, size, size);
    return Array.from(ctx.getImageData(0, 0, size, size).data);
  });
}

function reducedPixelsHaveVisibleColor(pixels: number[]) {
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3] ?? 0;
    const channel = Math.max(pixels[index] ?? 0, pixels[index + 1] ?? 0, pixels[index + 2] ?? 0);
    if (alpha > 8 && channel > 24) return true;
  }
  return false;
}

function meanAbsoluteDiff(a: number[], b: number[]) {
  expect(a.length).toBeGreaterThan(0);
  expect(a).toHaveLength(b.length);
  let total = 0;
  for (let index = 0; index < a.length; index += 1) total += Math.abs((a[index] ?? 0) - (b[index] ?? 0));
  return total / a.length;
}

async function storedSceneRotationY(page: Page) {
  return page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
    return doc.graph?.primitiveViewStates?.['v036-scene']?.rotationY ?? null;
  });
}

async function storedModelRotationY(page: Page) {
  return page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
    return doc.graph?.primitiveViewStates?.['v036-model']?.rotationY ?? null;
  });
}
