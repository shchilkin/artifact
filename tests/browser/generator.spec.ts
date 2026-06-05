import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page, test } from '@playwright/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const browserFontFixture = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/System/Library/Fonts/Supplemental/Helvetica.ttf',
  '/Library/Fonts/Arial.ttf',
].find((file) => existsSync(file));

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
const threeLayerReorderDocument = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 3, aspect: '1:1' },
  layers: [
    {
      id: 'reorder-bottom',
      name: 'Reorder bottom',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#2255cc',
      opacity: 100,
      blendMode: 'normal',
    },
    {
      id: 'reorder-middle',
      name: 'Reorder middle',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#22aa66',
      opacity: 100,
      blendMode: 'normal',
    },
    {
      id: 'reorder-top',
      name: 'Reorder top',
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
const effectSeedDocument = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 11, aspect: '1:1' },
  layers: [
    {
      id: 'effect-seed-fill',
      name: 'Seed backdrop',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#777777',
      opacity: 100,
      blendMode: 'normal',
    },
    {
      id: 'effect-seed-grain',
      name: 'Seeded grain',
      visible: true,
      locked: false,
      kind: 'effect',
      preset: 'grain',
      grain: 28,
      seedOffset: 0,
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
const outputNoInputDocument = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 12, aspect: '1:1' },
  layers: [
    {
      id: 'loose-fill',
      name: 'Loose fill',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#994422',
      opacity: 100,
      blendMode: 'normal',
    },
  ],
  graph: {
    edges: [],
    positions: {
      'loose-fill': { x: 0, y: 80 },
      __export__: { x: 520, y: 80 },
    },
    mergeNodes: [],
    colorNodes: [],
  },
  export: { format: 'png', scale: 1, target: 'cover' },
};
const customGraphLayerReorderDocument = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 10, aspect: '1:1' },
  layers: [
    {
      id: 'custom-bottom-fill',
      name: 'Custom bottom',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#2255cc',
      opacity: 100,
      blendMode: 'normal',
    },
    {
      id: 'custom-top-fill',
      name: 'Custom top',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#dd3322',
      opacity: 100,
      blendMode: 'normal',
    },
  ],
  graph: {
    edges: [
      {
        id: 'e-stale-bottom-export',
        fromId: 'custom-bottom-fill',
        fromPort: 'out',
        toId: '__export__',
        toPort: 'in',
      },
    ],
    positions: {
      'custom-bottom-fill': { x: 0, y: 80 },
      'custom-top-fill': { x: 0, y: 420 },
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
const portableAssetDocument = {
  schemaVersion: 1,
  global: { bg: '#07050a', seed: 22, aspect: '1:1' },
  layers: [
    {
      id: 'portable-image',
      name: 'Portable Image',
      visible: true,
      locked: false,
      kind: 'image',
      src: testImageSrc,
      fit: 'cover',
      opacity: 92,
      blendMode: 'normal',
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
    {
      id: 'portable-type',
      name: 'Portable Type',
      visible: true,
      locked: false,
      kind: 'text',
      content: 'PORTABLE',
      font: 'BUNGEE',
      size: 88,
      color: '#fff2dd',
      opacity: 100,
      blendMode: 'normal',
      x: 0.5,
      y: 0.5,
      rotation: -3,
      align: 'center',
      scaleX: 1,
      scaleY: 1,
    },
  ],
  export: { format: 'png', scale: 1, target: 'cover' },
};
const portableAssetGraphDocument = {
  ...portableAssetDocument,
  graph: {
    edges: [
      { id: 'e-portable-image-type', fromId: 'portable-image', fromPort: 'out', toId: 'portable-type', toPort: 'bg' },
      { id: 'e-portable-type-export', fromId: 'portable-type', fromPort: 'out', toId: '__export__', toPort: 'in' },
    ],
    positions: {
      'portable-image': { x: 0, y: 80 },
      'portable-type': { x: 500, y: 80 },
      __export__: { x: 1000, y: 80 },
    },
    mergeNodes: [],
    colorNodes: [],
  },
};
const portableShareLinkDocument = {
  ...portableAssetDocument,
  layers: portableAssetDocument.layers.map((layer) =>
    layer.id === 'portable-type' ? { ...layer, font: 'artifact-font://tiny-share-font' } : layer,
  ),
  fontAssets: [
    {
      id: 'tiny-share-font',
      dataUrl: 'data:font/ttf;base64,AA==',
      mime: 'font/ttf',
      bytes: 1,
      label: 'Tiny Share Font',
      family: 'Tiny Share Font',
      createdAt: '2026-05-25T00:00:00.000Z',
    },
  ],
};
const missingImageDocument = {
  schemaVersion: 1,
  global: { bg: '#07050a', seed: 23, aspect: '1:1' },
  layers: [
    {
      id: 'missing-image',
      name: 'Missing Image',
      visible: true,
      locked: false,
      kind: 'image',
      src: 'artifact-asset://missing-browser-asset',
      fit: 'cover',
      opacity: 100,
      blendMode: 'normal',
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
  ],
  export: { format: 'png', scale: 1, target: 'cover' },
};
const missingFontDocument = {
  schemaVersion: 1,
  global: { bg: '#07050a', seed: 24, aspect: '1:1' },
  layers: [
    {
      id: 'missing-font-text',
      name: 'Missing Font Type',
      visible: true,
      locked: false,
      kind: 'text',
      content: 'FONT FALLBACK',
      font: 'artifact-font://missing-browser-font',
      size: 72,
      color: '#fff2dd',
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
    text.includes('Failed to preconnect to https://fonts.googleapis.com/') ||
    text.includes('Failed to preconnect to https://fonts.gstatic.com/') ||
    text.includes('Failed to load resource: A server with the specified hostname could not be found.') ||
    text.includes('Failed to load resource: net::ERR_NAME_NOT_RESOLVED') ||
    text.includes('Error loading route module `/app/routes/generator.tsx`, reloading page') ||
    text.includes('Importing a module script failed') ||
    text.includes('error loading dynamically imported module: http://127.0.0.1:4173/') ||
    text.includes('due to access control checks') ||
    text.includes('NS_BINDING_ABORTED') ||
    text.includes('Cannot update a component (`NodeThumbnail`) while rendering a different component (`PerfMetric`)') ||
    text === 'JSHandle@object'
  );
}

function readBrowserFontFixture() {
  if (!browserFontFixture) throw new Error('No local browser font fixture found');
  return readFileSync(browserFontFixture);
}

async function importPortableFontForLayer(page: Page, layerName = 'Portable Type') {
  await page.locator('.layer-row').filter({ hasText: layerName }).first().click();
  await page.locator('.sidebar .font-picker-trigger').click();
  await page.getByLabel('Import font').setInputFiles({
    name: 'Portable Poster.ttf',
    mimeType: 'font/ttf',
    buffer: readBrowserFontFixture(),
  });
  await expect(page.locator('.sidebar .font-picker-trigger')).toContainText('Portable Poster');
}

async function expectPortableRefsStored(page: Page) {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          const image = doc.layers?.find((layer: { id: string }) => layer.id === 'portable-image');
          const text = doc.layers?.find((layer: { id: string }) => layer.id === 'portable-type');
          const serialized = localStorage.getItem('doc') ?? '';
          return {
            imageIsAssetRef: /^artifact-asset:\/\//.test(image?.src ?? ''),
            fontIsAssetRef: /^artifact-font:\/\//.test(text?.font ?? ''),
            hasFontAssets: Boolean(doc.fontAssets?.length),
            hasImagePayload: serialized.includes('data:image/'),
            hasFontAssetsField: serialized.includes('fontAssets'),
          };
        }),
      { timeout: 15_000 },
    )
    .toEqual({
      imageIsAssetRef: true,
      fontIsAssetRef: true,
      hasFontAssets: false,
      hasImagePayload: false,
      hasFontAssetsField: false,
    });
}

async function captureCopiedShareLink(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as Window & { __artifactCopiedLink?: string }).__artifactCopiedLink = text;
        },
      },
    });
  });
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

test('rand creates cover-ready text layers with curated fonts', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(lightDocument))}`);
  await page.evaluate(() => {
    let calls = 0;
    Math.random = () => {
      calls += 1;
      return calls === 1 ? 0.123456 : 0.34;
    };
  });
  await page.getByRole('button', { name: 'RAND' }).click();
  await expectLayerCanvasToHavePixels(page);

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          return doc.layers?.filter((layer: { kind: string }) => layer.kind === 'text').length ?? 0;
        }),
      { timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(1);

  const randomizedTextLayer = await page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
    return doc.layers?.find((layer: { kind: string }) => layer.kind === 'text') ?? null;
  });
  expect(randomizedTextLayer.content.trim().length).toBeGreaterThan(0);
  expect([
    'BUNGEE',
    'ANTON',
    'ARCHIVO_BLACK',
    'RUBIK_MONO',
    'DISPLAY',
    'BEBAS',
    'STAATLICHES',
    'SPACE_MONO',
    'MONO',
    'SPECIAL',
    'VT323',
    'PRESS_START',
  ]).toContain(randomizedTextLayer.font);
  expect(randomizedTextLayer.size).toBeGreaterThanOrEqual(12);
  expect(randomizedTextLayer.size).toBeLessThanOrEqual(142);
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

test('node graph highlights the active output path and exposes output navigation', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(graphPreviewDocument))}`);
  await switchToNodeView(page);

  const connectedNode = page.locator('.react-flow__node').filter({ hasText: 'Connected fill' });
  const orphanNode = page.locator('.react-flow__node').filter({ hasText: 'Unconnected top fill' });
  await expect(connectedNode.locator('.node-shell')).toHaveClass(/node-shell-output-path/, { timeout: 15_000 });
  await expect(orphanNode.locator('.node-shell')).not.toHaveClass(/node-shell-output-path/);
  await expect(page.locator('.react-flow__edge.node-edge-output-path')).toHaveCount(1);

  const paneBox = await page.locator('.react-flow__pane').boundingBox();
  expect(paneBox).toBeTruthy();
  if (!paneBox) return;
  const viewport = page.locator('.react-flow__viewport').first();
  await page.mouse.move(paneBox.x + paneBox.width - 120, paneBox.y + paneBox.height - 120);
  await page.mouse.down();
  await page.mouse.move(paneBox.x + paneBox.width - 420, paneBox.y + paneBox.height - 300, { steps: 6 });
  await page.mouse.up();
  const panned = await viewport.evaluate((element) => getComputedStyle(element).transform);
  await page.getByRole('button', { name: 'Jump to output node' }).click();
  await expect(page.locator('.node-shell-kind-export')).toBeVisible();
  await expect
    .poll(() => viewport.evaluate((element) => getComputedStyle(element).transform), { timeout: 2_000 })
    .not.toBe(panned);

  await page.getByRole('button', { name: 'Fit output path' }).click();
  await expect(page.locator('.node-shell-kind-export')).toBeVisible();
});

test('layer visibility updates the rendered canvas', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(layeredFillDocument))}`);

  await expect.poll(async () => getCanvasCenterRgb(page), { timeout: 15_000 }).toMatchObject({ r: 221, g: 51, b: 34 });

  await page.locator('.sidebar').getByRole('button', { name: 'Hide layer' }).first().click();

  await expect.poll(async () => getCanvasCenterRgb(page), { timeout: 15_000 }).toMatchObject({ r: 34, g: 85, b: 204 });
});

test('layer properties show the active editing target and hidden state', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(layeredFillDocument))}`);

  const topFillRow = page.locator('.layer-row').filter({ hasText: 'Top fill' }).first();
  await expect(topFillRow).toBeVisible({ timeout: 15_000 });
  await topFillRow.click();
  await topFillRow.getByRole('button', { name: /Hide layer Top fill/ }).click();

  const targetHeader = page.locator('.sidebar-sections .editor-target-header').first();
  await expect(targetHeader).toContainText('Layers / Source');
  await expect(targetHeader).toContainText('Top fill');
  await expect(targetHeader).toContainText('Layer 2/2');
  await expect(targetHeader).toContainText('Hidden');
});

test('locked layer surfaces status and blocks row deletion', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(layeredFillDocument))}`);

  const topFillRow = page.locator('.layer-row').filter({ hasText: 'Top fill' }).first();
  await expect(topFillRow).toBeVisible({ timeout: 15_000 });
  await topFillRow.click();

  const lockToggle = page.getByLabel('Toggle layer delete and reorder lock');
  await expect(lockToggle).toBeVisible();
  await expect(lockToggle).toBeEnabled();
  await lockToggle.check();

  await expect(topFillRow).toHaveAttribute('data-layer-locked', 'true');
  await expect(topFillRow.locator('.layer-lock-badge')).toContainText('lock');
  const targetHeader = page.locator('.sidebar-sections .editor-target-header').first();
  await expect(targetHeader).toContainText('Locked');
  await expect(targetHeader).toContainText('Layer 2/2');

  await expect(topFillRow.getByRole('button', { name: /Delete layer Top fill/ })).toBeDisabled();
  await expect(topFillRow.getByRole('button', { name: /Drag layer Top fill/ })).toBeDisabled();
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          return doc.layers?.map((layer: { id: string; locked?: boolean }) => ({
            id: layer.id,
            locked: !!layer.locked,
          }));
        }),
      { timeout: 15_000 },
    )
    .toEqual([
      { id: 'bottom-fill', locked: false },
      { id: 'top-fill', locked: true },
    ]);
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
  await page
    .locator('.add-library-row')
    .filter({ has: page.locator('.add-library-row-label', { hasText: /^Grain$/ }) })
    .click();

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

  const bottomFillRow = page.locator('.layer-row').filter({ hasText: 'Bottom fill' }).first();
  await bottomFillRow.getByRole('button', { name: /Insert layer above Bottom fill/ }).click();
  const quickMenu = page.locator('.add-library-layer-quick-menu');
  await quickMenu.getByRole('button', { name: 'Source', exact: true }).click();
  await quickMenu
    .locator('.add-library-row')
    .filter({ has: page.locator('.add-library-row-label', { hasText: /^AI Image$/ }) })
    .click();

  await expect(page.locator('.layer-row').filter({ hasText: 'AI Image' })).toHaveCount(1, { timeout: 15_000 });
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
      { name: 'AI Image', kind: 'image' },
      { name: 'Top fill', kind: 'fill' },
      { name: 'Grain', kind: 'effect' },
    ]);

  await bottomFillRow.getByRole('button', { name: /Insert layer above Bottom fill/ }).click();
  await quickMenu.getByRole('button', { name: 'Source', exact: true }).click();
  await quickMenu
    .locator('.add-library-row')
    .filter({ has: page.locator('.add-library-row-label', { hasText: /^Array$/ }) })
    .click();

  await expect(page.locator('.layer-row').filter({ hasText: 'Array' })).toHaveCount(1, { timeout: 15_000 });
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
      { name: 'Array', kind: 'array' },
      { name: 'AI Image', kind: 'image' },
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
  await menu.getByRole('button', { name: 'Add favorite' }).click();
  await expect(menu.locator('.add-library-section').filter({ hasText: 'Favorites' })).toContainText('Pixelate');
  await expect(menu.locator('.add-library-tags')).toContainText('low-res');

  await menu.getByRole('button', { name: 'Tone', exact: true }).click();
  await expect(menu.locator('.add-library-section-header').filter({ hasText: 'Tone' })).toBeVisible();
  await expect(menu.locator('.add-library-row').filter({ hasText: 'Pixelate' })).toBeVisible();
  await expect(menu.locator('.add-library-row').filter({ hasText: /^Fill/ })).toHaveCount(0);
});

test('layer add library shows source previews and can add source presets', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(layeredFillDocument))}`);

  const header = page.locator('.layer-panel-header');
  await header.getByRole('button', { name: 'Add layer' }).click();
  const menu = page.locator('.add-library-layer-menu');
  await expect(menu).toBeVisible({ timeout: 15_000 });

  const fillRow = menu.locator('.add-library-row').filter({
    has: page.locator('.add-library-row-label', { hasText: /^Fill$/ }),
  });
  await fillRow.hover();
  await expect(menu.getByAltText('Fill preview')).toBeVisible({ timeout: 15_000 });

  const imageRow = menu.locator('.add-library-row').filter({
    has: page.locator('.add-library-row-label', { hasText: /^Image$/ }),
  });
  await imageRow.hover();
  await expect(menu.getByAltText('Image preview')).toBeVisible({ timeout: 15_000 });

  const textRow = menu.locator('.add-library-row').filter({
    has: page.locator('.add-library-row-label', { hasText: /^Text$/ }),
  });
  await textRow.hover();
  await expect(menu.getByAltText('Text preview')).toBeVisible({ timeout: 15_000 });

  await menu.getByRole('button', { name: 'Source', exact: true }).click();
  const aiRow = menu.locator('.add-library-row').filter({
    has: page.locator('.add-library-row-label', { hasText: /^AI Image$/ }),
  });
  await aiRow.hover();
  await expect(menu.getByAltText('AI Image preview')).toBeVisible({ timeout: 15_000 });

  const paperRow = menu.locator('.add-library-row').filter({
    has: page.locator('.add-library-row-label', { hasText: /^Paper$/ }),
  });
  await paperRow.hover();
  await expect(menu.getByAltText('Paper preview')).toBeVisible({ timeout: 15_000 });
  await paperRow.click();

  await expect(page.locator('.layer-row').filter({ hasText: 'Paper' })).toHaveCount(1, { timeout: 15_000 });
  await expectLayerCanvasToHavePixels(page);
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

test('layers can add title text starts with readable font controls', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(layeredFillDocument))}`);

  const header = page.locator('.layer-panel-header');
  await header.getByRole('button', { name: 'Add layer' }).click();
  const search = page.getByLabel('Search layers and effects');
  await expect(search).toBeVisible({ timeout: 15_000 });
  await search.fill('headline');
  await page.getByRole('button', { name: /^T Title Type/ }).click();

  const titleRow = page.locator('.layer-row').filter({ hasText: 'Title Type' }).first();
  await expect(titleRow).toBeVisible({ timeout: 15_000 });
  await titleRow.click();
  await expect(page.locator('.sidebar')).toContainText('Archivo Black / dense cover');
  await expect(page.locator('.sidebar')).toContainText('TITLE');
  await page.locator('.sidebar .font-picker-trigger').click();
  await page.getByLabel('Search fonts').fill('pixel');
  await page.getByRole('button', { name: /Press Start \/ arcade pixel/ }).click();
  await expect(page.locator('.sidebar')).toContainText('Press Start / arcade pixel');
  await expectLayerCanvasToHavePixels(page);

  const textLayer = await page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
    return doc.layers?.find((layer: { name: string }) => layer.name === 'Title Type');
  });
  expect(textLayer).toMatchObject({ kind: 'text', content: 'TITLE', font: 'PRESS_START' });
});

test('layers can import a local font through the shared font picker', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(layeredFillDocument))}`);

  const header = page.locator('.layer-panel-header');
  await header.getByRole('button', { name: 'Add layer' }).click();
  await page.getByLabel('Search layers and effects').fill('headline');
  await page.getByRole('button', { name: /^T Title Type/ }).click();

  const titleRow = page.locator('.layer-row').filter({ hasText: 'Title Type' }).first();
  await expect(titleRow).toBeVisible({ timeout: 15_000 });
  await titleRow.click();
  await page.locator('.sidebar .font-picker-trigger').click();
  await page.getByLabel('Import font').setInputFiles({
    name: 'Local Poster.ttf',
    mimeType: 'font/ttf',
    buffer: readBrowserFontFixture(),
  });

  await expect(page.locator('.sidebar .font-picker-trigger')).toContainText('Local Poster');
  await expect(page.locator('.sidebar .font-picker-trigger')).toContainText('Imported');
  await expectLayerCanvasToHavePixels(page);

  const importedLayer = await page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
    return doc.layers?.find((layer: { name: string }) => layer.name === 'Title Type');
  });
  expect(importedLayer.font).toMatch(/^artifact-font:\/\//);

  await page.reload();
  await page.locator('.layer-row').filter({ hasText: 'Title Type' }).first().click();
  await page.locator('.sidebar .font-picker-trigger').click();
  await page.locator('.sidebar .font-picker-option').filter({ hasText: 'Local Poster' }).click();
  await expect(page.locator('.sidebar .font-picker-trigger')).toContainText('Local Poster');
});

test('layers can import a Google font with license-aware package metadata', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Google font import coverage uses mocked network once in Chromium.');

  await page.route('https://fonts.googleapis.com/css2?*', (route) =>
    route.fulfill({
      contentType: 'text/css',
      body: `
        @font-face {
          font-family: 'Mock Google';
          src: url(https://fonts.gstatic.com/s/mockgoogle/mock.ttf) format('truetype');
          unicode-range: U+0000-00FF;
        }
      `,
    }),
  );
  await page.route('https://fonts.gstatic.com/s/mockgoogle/mock.ttf', (route) =>
    route.fulfill({
      contentType: 'font/ttf',
      body: readBrowserFontFixture(),
    }),
  );

  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(layeredFillDocument))}`);
  const header = page.locator('.layer-panel-header');
  await header.getByRole('button', { name: 'Add layer' }).click();
  await page.getByLabel('Search layers and effects').fill('headline');
  await page.getByRole('button', { name: /^T Title Type/ }).click();

  const titleRow = page.locator('.layer-row').filter({ hasText: 'Title Type' }).first();
  await expect(titleRow).toBeVisible({ timeout: 15_000 });
  await titleRow.click();
  await page.locator('.sidebar .font-picker-trigger').click();
  await page.getByLabel('Import Google font').fill('Mock Google');
  await page.locator('.sidebar .font-picker-google-action').click();

  await expect(page.locator('.sidebar .font-picker-trigger')).toContainText('Mock Google');
  await expect(page.locator('.sidebar .font-picker-trigger')).toContainText('Google');
  await expectLayerCanvasToHavePixels(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save editable project package' }).click();
  const download = await downloadPromise;
  const artifactPath = await download.path();
  expect(artifactPath).toBeTruthy();
  if (!artifactPath) return;
  const projectPackage = JSON.parse(readFileSync(artifactPath, 'utf8'));

  expect(projectPackage.manifest?.fontEmbeddingMode).toBe('license-aware');
  expect(projectPackage.manifest?.fonts?.[0]).toMatchObject({
    kind: 'imported',
    embedding: 'embedded-file',
    asset: {
      label: 'Mock Google',
      source: 'google-fonts',
      license: { name: 'SIL Open Font License 1.1', allowsEmbedding: true },
    },
  });
  expect(projectPackage.document?.fontAssets?.[0]?.dataUrl).toContain('data:font/');
});

test('portable documents save and reopen imported image and font payloads', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Portable payload download/import coverage runs once in Chromium.');

  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(portableAssetDocument))}`);
  await expectLayerCanvasToHavePixels(page);
  await importPortableFontForLayer(page);
  await expectLayerCanvasToHavePixels(page);
  await expectPortableRefsStored(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save document file' }).click();
  const download = await downloadPromise;
  const artifactPath = await download.path();
  expect(artifactPath).toBeTruthy();
  if (!artifactPath) return;
  const artifactJson = readFileSync(artifactPath, 'utf8');
  const artifactDoc = JSON.parse(artifactJson);
  const portableImage = artifactDoc.layers?.find((layer: { id: string }) => layer.id === 'portable-image');

  expect(portableImage?.src).toContain('data:image/');
  expect(artifactDoc.fontAssets?.[0]?.dataUrl).toContain('data:font/');

  await page.goto('/app?new=blank');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open document file' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'portable-assets.artifact.json',
    mimeType: 'application/json',
    buffer: Buffer.from(artifactJson),
  });

  await expect(page.locator('.layer-row').filter({ hasText: 'Portable Type' })).toBeVisible({ timeout: 15_000 });
  await expectLayerCanvasToHavePixels(page);
  await expectPortableRefsStored(page);
});

test('project packages save images with license-aware font policy by default', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Project package download/import coverage runs once in Chromium.');

  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(portableAssetDocument))}`);
  await expectLayerCanvasToHavePixels(page);
  await importPortableFontForLayer(page);
  await expectLayerCanvasToHavePixels(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save editable project package' }).click();
  const download = await downloadPromise;
  const artifactPath = await download.path();
  expect(artifactPath).toBeTruthy();
  if (!artifactPath) return;
  const packageJson = readFileSync(artifactPath, 'utf8');
  const projectPackage = JSON.parse(packageJson);
  const packagedImage = projectPackage.document?.layers?.find((layer: { id: string }) => layer.id === 'portable-image');

  expect(projectPackage.artifactPackage).toBe('project');
  expect(projectPackage.manifest?.fontEmbeddingMode).toBe('license-aware');
  expect(projectPackage.manifest?.rasterExportPolicy).toBe('pixel-only-no-font-files');
  expect(projectPackage.manifest?.editableTextPolicy).toBe('original-text-plus-font-metadata');
  expect(projectPackage.manifest?.fonts?.[0]).toMatchObject({
    kind: 'imported',
    embedding: 'metadata-only',
    recovery: 'editable-text-replace-font',
    textContents: ['PORTABLE'],
  });
  expect(packagedImage?.src).toContain('data:image/');
  expect(projectPackage.document?.fontAssets).toBeUndefined();

  const explicitDialogPromise = new Promise<string>((resolve) => {
    page.once('dialog', async (dialog) => {
      const message = dialog.message();
      await dialog.accept();
      resolve(message);
    });
  });
  const explicitDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project package with all imported font files' }).click();
  const explicitDownload = await explicitDownloadPromise;
  await expect(explicitDialogPromise).resolves.toContain('PKG+FONTS embeds imported local font files');
  const explicitArtifactPath = await explicitDownload.path();
  expect(explicitArtifactPath).toBeTruthy();
  if (explicitArtifactPath) {
    const explicitPackage = JSON.parse(readFileSync(explicitArtifactPath, 'utf8'));
    expect(explicitPackage.manifest?.fontEmbeddingMode).toBe('explicit-font-files');
    expect(explicitPackage.manifest?.fonts?.[0]).toMatchObject({
      kind: 'imported',
      embedding: 'embedded-file',
    });
    expect(explicitPackage.document?.fontAssets?.[0]?.dataUrl).toContain('data:font/');
  }

  await page.goto('/app?new=blank');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open document file' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'portable-assets.artifact',
    mimeType: 'application/vnd.artifact.project+json',
    buffer: Buffer.from(packageJson),
  });

  await expect(page.locator('.layer-row').filter({ hasText: 'Portable Type' })).toBeVisible({ timeout: 15_000 });
  await expectLayerCanvasToHavePixels(page);
});

test('project packages keep missing-font text editable for replacement', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Missing-font package coverage runs once in Chromium.');

  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(missingFontDocument))}`);
  await page.locator('.layer-row').filter({ hasText: 'Missing Font Type' }).click();
  await expectLayerCanvasToHavePixels(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save editable project package' }).click();
  const download = await downloadPromise;
  const artifactPath = await download.path();
  expect(artifactPath).toBeTruthy();
  if (!artifactPath) return;
  const packageJson = readFileSync(artifactPath, 'utf8');
  const projectPackage = JSON.parse(packageJson);

  expect(projectPackage.document?.fontAssets).toBeUndefined();
  expect(projectPackage.manifest?.fonts?.[0]).toMatchObject({
    ref: 'artifact-font://missing-browser-font',
    kind: 'imported',
    embedding: 'missing-metadata',
    recovery: 'editable-text-replace-font',
    textContents: ['FONT FALLBACK'],
  });

  await page.goto('/app?new=blank');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open document file' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'missing-font.artifact',
    mimeType: 'application/vnd.artifact.project+json',
    buffer: Buffer.from(packageJson),
  });

  await page.locator('.layer-row').filter({ hasText: 'Missing Font Type' }).click();
  await expectLayerCanvasToHavePixels(page);
  await expect(page.locator('.sidebar .font-picker-trigger')).toContainText('Missing imported font');
  await page.locator('.sidebar .font-picker-trigger').click();
  await page.getByLabel('Search fonts').fill('pixel');
  await page.getByRole('button', { name: /Press Start \/ arcade pixel/ }).click();
  await expect(page.locator('.sidebar')).toContainText('Press Start / arcade pixel');

  const textLayer = await page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
    return doc.layers?.find((layer: { id: string }) => layer.id === 'missing-font-text');
  });
  expect(textLayer).toMatchObject({ kind: 'text', content: 'FONT FALLBACK', font: 'PRESS_START' });
});

test('project packages reopen graph documents with output previews', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Graph package coverage runs once in Chromium.');

  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(portableAssetGraphDocument))}`);
  await importPortableFontForLayer(page);
  await expectLayerCanvasToHavePixels(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save editable project package' }).click();
  const download = await downloadPromise;
  const artifactPath = await download.path();
  expect(artifactPath).toBeTruthy();
  if (!artifactPath) return;
  const packageJson = readFileSync(artifactPath, 'utf8');
  const projectPackage = JSON.parse(packageJson);

  expect(projectPackage.manifest?.hasGraphExportTarget).toBe(true);
  expect(projectPackage.manifest?.missingGraphExportTarget).toBe(false);
  expect(projectPackage.document?.graph?.edges).toEqual(
    expect.arrayContaining([expect.objectContaining({ fromId: 'portable-type', toId: '__export__', toPort: 'in' })]),
  );

  await page.goto('/app?new=blank');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open document file' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'portable-graph.artifact',
    mimeType: 'application/vnd.artifact.project+json',
    buffer: Buffer.from(packageJson),
  });

  await expect(page.locator('.layer-row').filter({ hasText: 'Portable Type' })).toBeVisible({ timeout: 15_000 });
  await expectLayerCanvasToHavePixels(page);
  await switchToNodeView(page);
  await expect(page.locator('.node-shell-kind-export')).toBeVisible({ timeout: 15_000 });
});

test('portable stack documents with imported image and font export', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Portable asset export smoke runs once in Chromium.');

  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(portableAssetDocument))}`);
  await importPortableFontForLayer(page);
  await expectLayerCanvasToHavePixels(page);
  await expectPortableRefsStored(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'EXPORT' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.(png|jpe?g)$/i);
});

test('portable graph documents export imported assets through the output node', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Portable graph export smoke runs once in Chromium.');

  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(portableAssetGraphDocument))}`);
  await importPortableFontForLayer(page);
  await expectLayerCanvasToHavePixels(page);
  await expectPortableRefsStored(page);
  await switchToNodeView(page);
  await expect(page.locator('.node-shell-kind-export')).toBeVisible({ timeout: 15_000 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'EXPORT' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.(png|jpe?g)$/i);
});

test('portable share links include imported image and font payloads', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Portable share-link coverage runs once in Chromium.');

  await captureCopiedShareLink(page);
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(portableShareLinkDocument))}`);
  await expectLayerCanvasToHavePixels(page);
  await expectPortableRefsStored(page);

  await page.getByRole('button', { name: 'Copy link to current state' }).click();
  await expect
    .poll(
      async () =>
        page.evaluate(() => (window as Window & { __artifactCopiedLink?: string }).__artifactCopiedLink ?? ''),
      { timeout: 15_000 },
    )
    .toContain('/app?doc=');

  const shareUrl = await page.evaluate(
    () => (window as Window & { __artifactCopiedLink?: string }).__artifactCopiedLink ?? '',
  );
  const shareDoc = JSON.parse(new URL(shareUrl).searchParams.get('doc') ?? '{}');
  const portableImage = shareDoc.layers?.find((layer: { id: string }) => layer.id === 'portable-image');
  expect(portableImage?.src).toContain('data:image/');
  expect(shareDoc.fontAssets?.[0]?.dataUrl).toContain('data:font/');

  await page.goto('/app?new=blank');
  await page.goto(shareUrl);
  await expect(page.locator('.layer-row').filter({ hasText: 'Portable Type' })).toBeVisible({ timeout: 15_000 });
  await expectLayerCanvasToHavePixels(page);
  await expectPortableRefsStored(page);
});

test('local projects preserve imported image and font assets across save and load', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Portable local-project coverage runs once in Chromium.');

  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(portableAssetDocument))}`);
  await importPortableFontForLayer(page);
  await expectLayerCanvasToHavePixels(page);
  await expectPortableRefsStored(page);

  await page.getByRole('button', { name: 'PROJECTS' }).click();
  await page.getByLabel('Project name').fill('Portable Project');
  await page.getByRole('button', { name: 'SAVE', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Load Portable Project' })).toBeVisible({ timeout: 15_000 });

  await page.goto('/app?new=blank');
  await expect(page.locator('.empty-canvas-start')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'PROJECTS' }).click();
  await page.getByRole('button', { name: 'Load Portable Project' }).click();

  await expect(page.locator('.layer-row').filter({ hasText: 'Portable Type' })).toBeVisible({ timeout: 15_000 });
  await expectLayerCanvasToHavePixels(page);
  await expectPortableRefsStored(page);
});

test('missing imported image shows a clear replacement state', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(missingImageDocument))}`);
  await page.locator('.layer-row').filter({ hasText: 'Missing Image' }).click();

  await expect(page.getByText('Image unavailable')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Replace the source to restore this layer.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replace image' })).toBeVisible();
});

test('missing imported font keeps fallback text visible', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(missingFontDocument))}`);
  await page.locator('.layer-row').filter({ hasText: 'Missing Font Type' }).click();

  await expectLayerCanvasToHavePixels(page);
  await expect(page.locator('.sidebar .font-picker-trigger')).toContainText('Missing imported font');
});

test('effect node inspector exposes and persists local seed offsets', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(effectSeedDocument))}`);
  await switchToNodeView(page);

  const effectNode = page.locator('[data-node-id="effect-seed-grain"]');
  await expect(effectNode).toBeVisible({ timeout: 15_000 });
  await effectNode.locator('.node-shell-frame').click();

  await page.locator('.node-props-panel-open button').filter({ hasText: /^Node/ }).first().click();
  const seedControl = page.locator('.node-props-panel-open .node-inspector-control').filter({ hasText: /^Seed/ });
  const seedSlider = seedControl.locator('input[type="range"]').first();
  await expect(seedSlider).toBeVisible({ timeout: 15_000 });
  await seedSlider.evaluate((input) => {
    const slider = input as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(slider, '42');
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          return doc.layers?.find((layer: { id: string }) => layer.id === 'effect-seed-grain')?.seedOffset;
        }),
      { timeout: 15_000 },
    )
    .toBe(42);
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

test('node properties show whether the selected target feeds output', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(graphPreviewDocument))}`);
  await switchToNodeView(page);

  const orphanNode = page.locator('.react-flow__node').filter({ hasText: 'Unconnected top fill' });
  await expect(orphanNode).toBeVisible({ timeout: 15_000 });
  await orphanNode.click();

  const targetHeader = page.locator('.node-props-panel .editor-target-header').first();
  await expect(targetHeader).toContainText('Nodes / Source');
  await expect(targetHeader).toContainText('Unconnected top fill');
  await expect(targetHeader).toContainText('Layer 2/2');
  await expect(targetHeader).toContainText('Not in output');
  await expect(targetHeader).toContainText('Off output path');
});

test('locked node target stays in the graph when delete is pressed', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(graphPreviewDocument))}`);
  await switchToNodeView(page);

  const orphanNode = page.locator('.react-flow__node').filter({ hasText: 'Unconnected top fill' });
  await expect(orphanNode).toBeVisible({ timeout: 15_000 });
  await orphanNode.click();
  const nodePropsPanel = page.locator('.node-props-panel-open');
  await expect(nodePropsPanel).toBeVisible();
  await nodePropsPanel.getByLabel('Toggle node delete lock').check();

  const targetHeader = nodePropsPanel.locator('.editor-target-header').first();
  await expect(targetHeader).toContainText('Locked');
  await expect(orphanNode.getByRole('button', { name: 'Delete node' })).toBeDisabled();

  await page.keyboard.press('Delete');

  await expect(orphanNode).toBeVisible();
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          return doc.layers?.find((layer: { id: string }) => layer.id === 'graph-unconnected-fill')?.locked;
        }),
      { timeout: 15_000 },
    )
    .toBe(true);
});

test('output properties explain missing graph input', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(outputNoInputDocument))}`);
  await switchToNodeView(page);

  const outputNode = page.locator('.react-flow__node').filter({ hasText: 'OUTPUT' });
  await expect(outputNode).toBeVisible({ timeout: 15_000 });
  await outputNode.click();

  const targetHeader = page.locator('.node-props-panel .editor-target-header').first();
  await expect(targetHeader).toContainText('Nodes / Output');
  await expect(targetHeader).toContainText('No input');
  await expect(targetHeader).toContainText('Needs input');
  await expect(targetHeader).toContainText('Connect a source, effect, or utility branch to the output before export.');
});

test('graph-only utility properties show area and output context without lock controls', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(areaMergeDocument))}`);
  await switchToNodeView(page);

  const mergeNode = page.locator('.react-flow__node').filter({ hasText: 'MERGE' });
  await expect(mergeNode).toBeVisible({ timeout: 15_000 });
  await mergeNode.click();

  const nodePropsPanel = page.locator('.node-props-panel-open');
  const targetHeader = nodePropsPanel.locator('.editor-target-header').first();
  await expect(targetHeader).toContainText('Nodes / Utility');
  await expect(targetHeader).toContainText('Area: Area 1');
  await expect(targetHeader).toContainText('Output path');
  await expect(targetHeader).toContainText(
    'Graph-only utility nodes can be deleted or moved; durable locking is reserved for layer-backed targets in v0.28.',
  );
  await expect(nodePropsPanel.getByLabel('Toggle node delete lock')).toHaveCount(0);
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
  await page.locator('.view-mode-toggle-sidebar').getByRole('tab', { name: 'Switch to nodes view' }).click();
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

  await expect(page.locator('.sidebar .layer-row')).toHaveCount(1, { timeout: 15_000 });
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
  await expect(page.locator('.sidebar .layer-row')).toHaveCount(0);
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
  await expect(emptyPanel).toContainText('Fast starts');
  await expect(emptyPanel.getByRole('link', { name: 'Showcase' })).toHaveAttribute('href', '/showcase');
  await expect(emptyPanel.getByRole('button', { name: 'Open saved work' })).toBeVisible();
  await expect(emptyPanel.getByRole('button', { name: 'Texture Type' })).toBeVisible();
  await expect(page.locator('.empty-canvas-start').getByRole('link', { name: 'Open guide' })).toHaveAttribute(
    'href',
    '/docs/nodes#docs-first-cover',
  );

  await emptyPanel.getByRole('button', { name: 'Title' }).click();
  await expect(page.locator('.layer-empty-state')).toHaveCount(0);
  await expect(page.locator('.layer-row').filter({ hasText: 'Title Type' })).toHaveCount(1, { timeout: 15_000 });
  await expectLayerCanvasToHavePixels(page);
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

test('layer drag reorder shows a readable insertion target and syncs the linear graph', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(layeredFillDocument))}`);
  await expectLayerCanvasToHavePixels(page);
  await switchToNodeView(page);
  await expect.poll(async () => page.locator('.react-flow__node').count(), { timeout: 15_000 }).toBeGreaterThan(0);
  await switchToLayerView(page);

  const source = page.locator('.layer-row').filter({ hasText: 'Top fill' }).first();
  const target = page.locator('.layer-row').filter({ hasText: 'Bottom fill' }).first();
  await expect(source).toBeVisible({ timeout: 15_000 });
  await expect(target).toBeVisible({ timeout: 15_000 });

  await page.evaluate(() => {
    const source = [...document.querySelectorAll<HTMLElement>('.layer-row')].find((row) =>
      row.textContent?.includes('Top fill'),
    );
    const target = [...document.querySelectorAll<HTMLElement>('.layer-row')].find((row) =>
      row.textContent?.includes('Bottom fill'),
    );
    if (!source || !target) throw new Error('Layer rows were not found');
    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    const rect = target.getBoundingClientRect();
    target.dispatchEvent(
      new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        clientY: rect.top + rect.height * 0.75,
        dataTransfer,
      }),
    );
  });

  await expect(target).toHaveClass(/layer-row-drop-after/);

  await page.evaluate(() => {
    const target = [...document.querySelectorAll<HTMLElement>('.layer-row')].find((row) =>
      row.textContent?.includes('Bottom fill'),
    );
    if (!target) throw new Error('Target layer row was not found');
    const dataTransfer = new DataTransfer();
    const rect = target.getBoundingClientRect();
    target.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientY: rect.top + rect.height * 0.75,
        dataTransfer,
      }),
    );
    target.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
  });

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          const layerIds = doc.layers?.map((layer: { id: string }) => layer.id);
          const graphEdges = doc.graph?.edges?.map(
            (edge: { fromId: string; toId: string }) => `${edge.fromId}->${edge.toId}`,
          );
          const positions = doc.graph?.positions ?? {};
          return {
            layerIds,
            graphEdges,
            topBeforeBottom: positions['top-fill']?.x < positions['bottom-fill']?.x,
          };
        }),
      { timeout: 15_000 },
    )
    .toEqual({
      layerIds: ['top-fill', 'bottom-fill'],
      graphEdges: ['top-fill->bottom-fill', 'bottom-fill->__export__'],
      topBeforeBottom: true,
    });
  await expectLayerCanvasToHavePixels(page);
});

test('layer drag reorder uses the final drop row even after stale dragover state', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(threeLayerReorderDocument))}`);
  await expectLayerCanvasToHavePixels(page);

  await expect
    .poll(
      async () =>
        page
          .locator('.sidebar .layer-row')
          .evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.layerId)),
      { timeout: 15_000 },
    )
    .toEqual(['reorder-top', 'reorder-middle', 'reorder-bottom']);

  await page.evaluate(() => {
    const row = (id: string) => document.querySelector<HTMLElement>(`.layer-row[data-layer-id="${id}"]`);
    const source = row('reorder-top');
    const staleTarget = row('reorder-bottom');
    const finalTarget = row('reorder-middle');
    if (!source || !staleTarget || !finalTarget) throw new Error('Layer reorder rows were not found');

    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));

    const staleRect = staleTarget.getBoundingClientRect();
    staleTarget.dispatchEvent(
      new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        clientY: staleRect.top + staleRect.height * 0.75,
        dataTransfer,
      }),
    );

    const finalRect = finalTarget.getBoundingClientRect();
    finalTarget.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientY: finalRect.top + finalRect.height * 0.75,
        dataTransfer,
      }),
    );
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
  });

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          return {
            stack: doc.layers?.map((layer: { id: string }) => layer.id),
            display: [...document.querySelectorAll<HTMLElement>('.sidebar .layer-row')].map(
              (row) => row.dataset.layerId,
            ),
          };
        }),
      { timeout: 15_000 },
    )
    .toEqual({
      stack: ['reorder-bottom', 'reorder-top', 'reorder-middle'],
      display: ['reorder-middle', 'reorder-top', 'reorder-bottom'],
    });

  await switchToNodeView(page);
  await expect(page.locator('.node-canvas-root')).toBeVisible();
  await switchToLayerView(page);
  await expect
    .poll(
      async () =>
        page
          .locator('.sidebar .layer-row')
          .evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.layerId)),
      { timeout: 15_000 },
    )
    .toEqual(['reorder-middle', 'reorder-top', 'reorder-bottom']);
});

test('layer drag reorder makes a custom graph follow the layer stack', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(customGraphLayerReorderDocument))}`);
  await expectLayerCanvasToHavePixels(page);

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          return doc.graph?.edges?.map((edge: { fromId: string; toId: string }) => `${edge.fromId}->${edge.toId}`);
        }),
      { timeout: 15_000 },
    )
    .toEqual(['custom-bottom-fill->__export__']);

  const source = page.locator('.layer-row').filter({ hasText: 'Custom top' }).first();
  const target = page.locator('.layer-row').filter({ hasText: 'Custom bottom' }).first();
  await expect(source).toBeVisible({ timeout: 15_000 });
  await expect(target).toBeVisible({ timeout: 15_000 });

  await page.evaluate(() => {
    const source = [...document.querySelectorAll<HTMLElement>('.layer-row')].find((row) =>
      row.textContent?.includes('Custom top'),
    );
    const target = [...document.querySelectorAll<HTMLElement>('.layer-row')].find((row) =>
      row.textContent?.includes('Custom bottom'),
    );
    if (!source || !target) throw new Error('Custom graph layer rows were not found');
    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    const rect = target.getBoundingClientRect();
    target.dispatchEvent(
      new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        clientY: rect.top + rect.height * 0.75,
        dataTransfer,
      }),
    );
    target.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientY: rect.top + rect.height * 0.75,
        dataTransfer,
      }),
    );
    target.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
  });

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          return {
            layerIds: doc.layers?.map((layer: { id: string }) => layer.id),
            graphEdges: doc.graph?.edges?.map(
              (edge: { fromId: string; toId: string }) => `${edge.fromId}->${edge.toId}`,
            ),
            topBeforeBottom:
              doc.graph?.positions?.['custom-top-fill']?.x < doc.graph?.positions?.['custom-bottom-fill']?.x,
          };
        }),
      { timeout: 15_000 },
    )
    .toEqual({
      layerIds: ['custom-top-fill', 'custom-bottom-fill'],
      graphEdges: ['custom-top-fill->custom-bottom-fill', 'custom-bottom-fill->__export__'],
      topBeforeBottom: true,
    });
  await expectLayerCanvasToHavePixels(page);
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
  await expect(page.locator('.empty-canvas-start').getByRole('button', { name: 'Multi Font' })).toBeVisible();
  await expect(page.locator('.empty-canvas-start').getByRole('button', { name: 'Photo Stack' })).toBeVisible();

  await page
    .locator('.empty-canvas-start')
    .getByRole('button', { name: /Texture Type/i })
    .click();

  await expect(page.locator('.empty-canvas-start')).toHaveCount(0);
  await expectLayerCanvasToHavePixels(page);
  await expect(page.locator('.sidebar .layer-row')).toHaveCount(6, { timeout: 15_000 });
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

test('empty canvas can start from the multi-font type recipe', async ({ page }) => {
  await page.goto('/app?new=blank');
  await expect(page.locator('.empty-canvas-start')).toBeVisible({ timeout: 15_000 });

  await page.locator('.empty-canvas-start').getByRole('button', { name: 'Multi Font' }).click();

  await expect(page.locator('.empty-canvas-start')).toHaveCount(0);
  await expect(page.locator('.sidebar .layer-row')).toHaveCount(10, { timeout: 15_000 });
  await expectLayerCanvasToHavePixels(page);
  await expect(page.getByText('poster title')).toBeVisible();
  await expect(page.getByText('mono subtitle')).toBeVisible();
  await expect(page.getByText('pixel label')).toBeVisible();
  await expect(page.getByText('type credits')).toBeVisible();
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          const textLayers = doc.layers?.filter((layer: { kind: string }) => layer.kind === 'text') ?? [];
          return {
            aspect: doc.global?.aspect,
            hasGraph: Boolean(doc.graph),
            textFonts: textLayers.map((layer: { font: string }) => layer.font),
            layerIds: doc.layers?.map((layer: { id: string }) => layer.id) ?? [],
          };
        }),
      { timeout: 15_000 },
    )
    .toEqual({
      aspect: '4:5',
      hasGraph: false,
      textFonts: ['BUNGEE', 'SPACE_MONO', 'PRESS_START', 'SPECIAL'],
      layerIds: [
        'multi-font-plate',
        'multi-font-image',
        'multi-font-duotone',
        'multi-font-paper',
        'multi-font-title',
        'multi-font-subtitle',
        'multi-font-label',
        'multi-font-credit',
        'multi-font-registration',
        'multi-font-grain',
      ],
    });
});

test('empty canvas can start from the layer-first photo stack recipe', async ({ page }) => {
  await page.goto('/app?new=blank');
  await expect(page.locator('.empty-canvas-start')).toBeVisible({ timeout: 15_000 });

  await page.locator('.empty-canvas-start').getByRole('button', { name: 'Photo Stack' }).click();

  await expect(page.locator('.empty-canvas-start')).toHaveCount(0);
  await expectLayerCanvasToHavePixels(page);
  await expect(page.locator('.sidebar .layer-row')).toHaveCount(6, { timeout: 15_000 });
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
  await expect(page.getByRole('heading', { name: 'Artifact Docs.' })).toBeVisible();

  const recipe = page.locator('.docs-recipe').filter({ hasText: 'Photo Plus Type Recipe' });
  await expect(recipe).toBeVisible();
  await recipe.getByRole('link', { name: 'Try this' }).click();

  await expect(page).toHaveURL(/\/app(?:\?|$)/);
  await expectLayerCanvasToHavePixels(page);
  await expect(page.getByText('cover photo')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('headline type')).toBeVisible();
});

test('add-node menu exposes recipe groups and workflow search', async ({ page }) => {
  await page.goto('/app?new=blank');
  await switchToNodeView(page);
  await page.getByRole('button', { name: 'Add node' }).click();
  const recipeRail = page.locator('.add-library-recipes');
  const nodeAddRowByLabel = (label: RegExp) =>
    page.locator('.nadd-row').filter({ has: page.locator('.nadd-row-label', { hasText: label }) });

  await expect(recipeRail.getByRole('button', { name: 'Photo + Type' })).toBeVisible();
  await expect(recipeRail.getByRole('button', { name: 'Texture Type' })).toBeVisible();
  await expect(recipeRail.getByRole('button', { name: 'Print Damage' })).toBeVisible();

  await page.getByRole('button', { name: /^Tone$/ }).click();
  await expect(nodeAddRowByLabel(/^Pixelate$/)).toBeVisible();
  await expect(nodeAddRowByLabel(/^Fill$/)).toHaveCount(0);
  await page.getByRole('button', { name: /^All$/ }).click();

  await recipeRail.getByRole('button', { name: 'Print Damage' }).click();
  await expect(nodeAddRowByLabel(/^Halftone$/)).toBeVisible();
  await expect(nodeAddRowByLabel(/^Tear$/)).toBeVisible();
  await expect(nodeAddRowByLabel(/^Paper$/)).toBeVisible();

  await page.getByLabel('Search nodes and effects').fill('photo type');
  await expect(page.getByRole('button', { name: /^◧ Image/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^T Text/ })).toBeVisible();

  await page.getByLabel('Search nodes and effects').fill('ai image');
  await expect(page.getByRole('button', { name: /^◧ AI Image/ })).toBeVisible();

  await page.getByLabel('Search nodes and effects').fill('split tone');
  await expect(page.getByAltText('Split Tone preview')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.add-library-tags')).toContainText('photo');
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

test('node add menu can add poster text starts', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(wideNodeDocument))}`);
  await switchToNodeView(page);
  await page.getByRole('button', { name: 'Add node' }).click();
  await page.getByLabel('Search nodes and effects').fill('poster type');
  await expect(page.locator('.add-library-node-menu img[alt="Poster Type preview"]')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /^T Poster Type/ }).click();

  const posterNode = page.locator('.node-shell-kind-text').filter({ hasText: 'Poster Type' }).first();
  await expect(posterNode).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.node-props-panel')).toContainText('Bungee / sign painter');
  await expect(page.locator('.node-props-panel')).toContainText('POSTER');

  const textLayer = await page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
    return doc.layers?.find((layer: { name: string }) => layer.name === 'Poster Type');
  });
  expect(textLayer).toMatchObject({ kind: 'text', content: 'POSTER', font: 'BUNGEE' });
  await switchToLayerView(page);
  await expectLayerCanvasToHavePixels(page);
});

test('node add menu can drag an effect onto the canvas', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(wideNodeDocument))}`);
  await switchToNodeView(page);
  await expect(page.locator('.node-shell-kind-export')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Add node' }).click();
  await page.getByLabel('Search nodes and effects').fill('pixelate');

  const pixelateMenuRow = page.getByRole('button', { name: /^▦ Pixelate/ });
  await expect(pixelateMenuRow).toContainText('Drag');
  await page.locator('.react-flow__pane').evaluate((pane) => {
    const rect = pane.getBoundingClientRect();
    const dataTransfer = new DataTransfer();
    dataTransfer.setData(
      'application/x-artifact-add-library-action',
      JSON.stringify({ kind: 'effect', preset: 'pixelate' }),
    );
    document.documentElement.dataset.artifactAddLibraryAction = JSON.stringify({ kind: 'effect', preset: 'pixelate' });
    document.dispatchEvent(
      new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 520,
        clientY: rect.top + 320,
        dataTransfer,
      }),
    );
  });
  await expect(page.locator('.node-canvas-add-drop-ready .node-add-drop-hint-ready')).toBeVisible();
  await page.evaluate(() => {
    document.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true }));
    delete document.documentElement.dataset.artifactAddLibraryAction;
  });

  await pixelateMenuRow.dragTo(page.locator('.react-flow__pane'), {
    targetPosition: { x: 520, y: 320 },
  });

  const pixelateNode = page.locator('.node-shell-kind-effect').filter({ hasText: 'Pixelate' }).first();
  await expect(pixelateNode).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.add-library-node-menu')).toHaveCount(0);
});

test('node add menu can drag an effect onto an edge and split it', async ({ page }) => {
  await page.goto(`/app?doc=${encodeURIComponent(JSON.stringify(wideNodeDocument))}`);
  await switchToNodeView(page);
  await expect(page.locator('.node-shell-kind-export')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Add node' }).click();
  await page.getByLabel('Search nodes and effects').fill('pixelate');
  const pixelateMenuRow = page.getByRole('button', { name: /^▦ Pixelate/ });
  await expect(pixelateMenuRow).toContainText('Drag');
  const targetPosition = await page.locator('.react-flow__pane').evaluate((pane) => {
    const source = document.querySelector<HTMLElement>('.react-flow__node[data-id="wide-fill"]');
    const target = document.querySelector<HTMLElement>('.react-flow__node[data-id="__export__"]');
    if (!source || !target) throw new Error('Expected source and export nodes');
    const paneRect = pane.getBoundingClientRect();
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const clientX = (sourceRect.left + sourceRect.width / 2 + targetRect.left + targetRect.width / 2) / 2;
    const clientY = (sourceRect.top + sourceRect.height / 2 + targetRect.top + targetRect.height / 2) / 2;
    return { x: clientX - paneRect.left, y: clientY - paneRect.top };
  });
  await pixelateMenuRow.dragTo(page.locator('.react-flow__pane'), { targetPosition });

  const pixelateNode = page.locator('.node-shell-kind-effect').filter({ hasText: 'Pixelate' }).first();
  await expect(pixelateNode).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          const pixelate = doc.layers?.find((layer: { kind: string; name: string }) => layer.name === 'Pixelate');
          const edges = (doc.graph?.edges ?? []) as Array<{ id: string; fromId: string; toId: string; toPort: string }>;
          return {
            pixelateId: pixelate?.id,
            removedOriginal: !edges.some((edge) => edge.id === 'e-wide-fill-export'),
            hasBefore: Boolean(
              pixelate &&
                edges.some((edge) => edge.fromId === 'wide-fill' && edge.toId === pixelate.id && edge.toPort === 'in'),
            ),
            hasAfter: Boolean(
              pixelate && edges.some((edge) => edge.fromId === pixelate.id && edge.toId === '__export__'),
            ),
          };
        }),
      { timeout: 15_000 },
    )
    .toMatchObject({ removedOriginal: true, hasBefore: true, hasAfter: true });
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          const edges = (doc.graph?.edges ?? []) as Array<{ id: string }>;
          return {
            pixelateCount: doc.layers?.filter((layer: { name: string }) => layer.name === 'Pixelate').length ?? 0,
            restoredOriginal: edges.some((edge) => edge.id === 'e-wide-fill-export'),
          };
        }),
      { timeout: 15_000 },
    )
    .toEqual({ pixelateCount: 0, restoredOriginal: true });
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(pixelateNode).toBeVisible({ timeout: 15_000 });
  await switchToLayerView(page);
  await expectLayerCanvasToHavePixels(page);
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

test.describe('AI generated image export and polling flows', () => {
  test.skip(
    ({ browserName }) => browserName === 'webkit',
    'WebKit full-suite navigation flakes on these heavier mocked AI flows.',
  );

  test('AI-enabled user can generate an image and keep prompt provenance after reload', async ({ page }) => {
    test.setTimeout(60_000);

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
    await expect(page.locator('.sidebar .layer-row')).toHaveCount(1, { timeout: 15_000 });
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
    await page.locator('.sidebar .layer-row').first().click();
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
    await expect(page.locator('.sidebar .layer-row')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('.ai-generation-provenance p').filter({ hasText: prompt })).toBeVisible();
  });
});

test.describe('AI quota access flow', () => {
  test.skip(
    ({ browserName }) => browserName === 'webkit',
    'WebKit full-suite navigation flakes on this mocked AI flow.',
  );

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
});

test.describe('AI provider failure flow', () => {
  test.skip(
    ({ browserName }) => browserName === 'webkit',
    'WebKit full-suite navigation flakes on this mocked AI flow.',
  );

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
});

test.describe('AI failed image export flow', () => {
  test.skip(
    ({ browserName }) => browserName === 'webkit',
    'WebKit full-suite navigation flakes on this AI failed-doc flow.',
  );

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
});

test.describe('node preview aspect ratio flow', () => {
  test.skip(
    ({ browserName }) => browserName === 'webkit',
    'WebKit full-suite navigation flakes on this aspect-ratio doc flow.',
  );

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
  await page.locator('.node-menu').getByRole('menuitem', { name: /Mute/ }).click();
  await expect(fillNode).toHaveClass(/node-shell-muted/);

  await fillNode.click({ button: 'right' });
  await page
    .locator('.node-menu')
    .getByRole('menuitem', { name: /Unmute/ })
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
    .getByRole('menuitem', { name: /Add to Area 1/ })
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
          for (let y = 0; y < canvas.height; y += Math.max(1, Math.floor(canvas.height / 32))) {
            for (let x = 0; x < canvas.width; x += Math.max(1, Math.floor(canvas.width / 32))) {
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
    const nodesTab = page.getByRole('tab', { name: 'Switch to nodes view' });
    await expect(nodesTab).toBeVisible({ timeout: 2_000 });
    await nodesTab.click();
    await expect(page.locator('.node-canvas-root')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 10_000 });
}

async function switchToLayerView(page: Page) {
  await expect(async () => {
    const layersTab = page.locator('.floating-view-toggle').getByRole('tab', { name: 'Switch to layers view' });
    await expect(layersTab).toBeVisible({ timeout: 2_000 });
    await layersTab.click();
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
