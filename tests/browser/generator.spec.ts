import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page, type Route, test } from '@playwright/test';
import {
  clickEditorControl,
  expectLayerCanvasToHavePixels,
  expectNoBrowserIssues,
  expectStoredImageLayerAssetUri,
  expectStoredLayerCount,
  gotoDocument,
  setupBrowserTestPage,
  switchToLayerView,
  switchToNodeView,
} from './helpers';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const browserFontFixture = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/System/Library/Fonts/Supplemental/Helvetica.ttf',
  '/Library/Fonts/Arial.ttf',
].find((file) => existsSync(file));

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
const categoryColorNodeDocument = {
  schemaVersion: 1,
  global: { bg: '#101018', seed: 33, aspect: '1:1' },
  layers: [
    {
      id: 'category-emoji',
      name: 'Emoji source',
      visible: true,
      locked: false,
      kind: 'emoji',
      emojis: ['😂', '😭', '💔', '💀'],
      density: 22,
      minSz: 28,
      maxSz: 64,
      blur: 0,
      seedOffset: 0,
      opacity: 100,
      blendMode: 'normal',
    },
    {
      id: 'category-rays',
      name: 'Rays effect',
      visible: true,
      locked: false,
      kind: 'effect',
      preset: 'rays',
      rays: 12,
      rayInt: 60,
      rayColor: '#bb00ff',
      seedOffset: 0,
    },
  ],
  graph: {
    edges: [
      {
        id: 'e-category-emoji-rays',
        fromId: 'category-emoji',
        fromPort: 'out',
        toId: 'category-rays',
        toPort: 'in',
      },
      {
        id: 'e-category-rays-export',
        fromId: 'category-rays',
        fromPort: 'out',
        toId: '__export__',
        toPort: 'in',
      },
    ],
    positions: {
      'category-emoji': { x: 0, y: 80 },
      'category-rays': { x: 420, y: 80 },
      __export__: { x: 840, y: 80 },
    },
    mergeNodes: [],
    colorNodes: [],
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
const v035NodeSmokeDocument = {
  schemaVersion: 1,
  global: { bg: 'transparent', seed: 35, aspect: '1:1' },
  layers: [
    {
      id: 'v035-lines',
      name: 'Line Field Smoke',
      visible: true,
      locked: false,
      kind: 'lineField',
      opacity: 100,
      blendMode: 'normal',
      seedOffset: 0,
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      color: '#ff6a3d',
      accentColor: '#d9499b',
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
      lineFieldDistortion: 'wave',
      lineFieldCount: 32,
      lineFieldSpacing: 16,
      lineFieldStroke: 4,
      lineFieldStrength: 22,
      lineFieldFrequency: 4,
      lineFieldBackground: '#000000',
      lineFieldTransparent: true,
    },
    {
      id: 'v035-mask-fill',
      name: 'Mask Matte Smoke',
      visible: true,
      locked: false,
      kind: 'fill',
      color: '#ffffff',
      opacity: 100,
      blendMode: 'normal',
    },
  ],
  graph: {
    edges: [
      { id: 'e-lines-mask', fromId: 'v035-lines', fromPort: 'out', toId: 'v035-mask', toPort: 'in' },
      { id: 'e-fill-mask', fromId: 'v035-mask-fill', fromPort: 'out', toId: 'v035-mask', toPort: 'mask' },
      { id: 'e-mask-transform', fromId: 'v035-mask', fromPort: 'out', toId: 'v035-transform', toPort: 'in' },
      { id: 'e-transform-shadow', fromId: 'v035-transform', fromPort: 'out', toId: 'v035-shadow', toPort: 'in' },
      { id: 'e-shadow-repeat', fromId: 'v035-shadow', fromPort: 'out', toId: 'v035-repeat', toPort: 'in' },
      { id: 'e-repeat-export', fromId: 'v035-repeat', fromPort: 'out', toId: '__export__', toPort: 'in' },
    ],
    positions: {
      'v035-lines': { x: 0, y: 80 },
      'v035-mask-fill': { x: 0, y: 520 },
      'v035-mask': { x: 520, y: 80 },
      'v035-transform': { x: 520, y: 520 },
      'v035-shadow': { x: 1040, y: 80 },
      'v035-repeat': { x: 1040, y: 520 },
      __export__: { x: 1560, y: 80 },
    },
    mergeNodes: [],
    colorNodes: [],
    repeatNodes: [
      {
        id: 'v035-repeat',
        name: 'Repeat Smoke',
        pattern: 'line',
        count: 3,
        rows: 2,
        gap: 86,
        radius: 90,
        scale: 42,
        jitter: 0,
        rotation: 0,
        rotationMode: 'step',
        rotationStep: 18,
        rotationJitter: 0,
        seedOffset: 2,
        opacity: 100,
        blendMode: 'source-over',
      },
    ],
    maskNodes: [
      {
        id: 'v035-mask',
        name: 'Mask Smoke',
        mode: 'alpha',
        invert: false,
        threshold: 50,
        feather: 0,
        expand: 0,
        opacity: 100,
      },
    ],
    transformNodes: [
      {
        id: 'v035-transform',
        name: 'Transform Smoke',
        x: 0,
        y: 0,
        scaleX: 100,
        scaleY: 100,
        uniformScale: true,
        rotation: 12,
        pivotMode: 'visible',
        opacity: 100,
      },
    ],
    grimeShadowNodes: [
      {
        id: 'v035-shadow',
        name: 'Grime Shadow Smoke',
        x: 8,
        y: 10,
        layers: 4,
        blur: 8,
        spread: 10,
        grime: 35,
        jitter: 8,
        opacity: 54,
        color: '#090606',
        seedOffset: 1,
        shadowOnly: false,
      },
    ],
    areas: [],
  },
  export: { format: 'png', scale: 1, target: 'cover' },
};

test.beforeEach(async ({ page }) => {
  await setupBrowserTestPage(page, { captureNodeDragWarnings: true });
});

test.afterEach(async ({ page }) => {
  expectNoBrowserIssues(page);
});

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

async function selectGraphNodeById(page: Page, nodeId: string) {
  await page.locator(`.react-flow__node[data-id="${nodeId}"]`).evaluate((node) => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
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

async function expectNodeViewHasNodes(page: Page) {
  await switchToNodeView(page);
  await expect.poll(async () => page.locator('.react-flow__node').count(), { timeout: 15_000 }).toBeGreaterThan(0);
}

async function choosePixelFont(page: Page) {
  await page.locator('.sidebar .font-picker-trigger').click();
  await page.getByLabel('Search fonts').fill('pixel');
  await page.getByRole('button', { name: /Press Start \/ arcade pixel/ }).click();
  await expect(page.locator('.sidebar')).toContainText('Press Start / arcade pixel');
}

async function expectPortableTypeReady(page: Page, options: { refs?: boolean; outputNode?: boolean } = {}) {
  await expect(page.locator('.layer-row').filter({ hasText: 'Portable Type' })).toBeVisible({ timeout: 15_000 });
  await expectLayerCanvasToHavePixels(page);
  if (options.refs) await expectPortableRefsStored(page);
  if (options.outputNode) {
    await switchToNodeView(page);
    await expect(page.locator('.node-shell-kind-export')).toBeVisible({ timeout: 15_000 });
  }
}

async function expectMissingFontLayerVisible(page: Page) {
  await page.locator('.layer-row').filter({ hasText: 'Missing Font Type' }).click();
  await expectLayerCanvasToHavePixels(page);
  await expect(page.locator('.sidebar .font-picker-trigger')).toContainText('Missing imported font');
}

async function startBlankEditor(page: Page) {
  await page.goto('/app?new=blank');
  await expect(page.locator('.empty-canvas-start')).toBeVisible({ timeout: 15_000 });
}

async function openPixelateNodeAddMenu(page: Page) {
  await gotoDocument(page, wideNodeDocument);
  await openNodeAddMenuWithSearch(page, 'pixelate', { waitForExportNode: true });
  const pixelateMenuRow = page.getByRole('button', { name: /^▦ Pixelate/ });
  await expect(pixelateMenuRow).toContainText('Drag');
  return pixelateMenuRow;
}

async function expectPixelateNode(page: Page) {
  const pixelateNode = page.locator('.node-shell-kind-effect').filter({ hasText: 'Pixelate' }).first();
  await expect(pixelateNode).toBeVisible({ timeout: 15_000 });
  return pixelateNode;
}

async function waitForPixelateEdgeInsertion(page: Page, timeoutMs: number) {
  let state = await readPixelateEdgeInsertionState(page);
  const deadline = Date.now() + timeoutMs;
  while (!(state.pixelateId && state.removedOriginal && state.hasBefore && state.hasAfter) && Date.now() < deadline) {
    await page.waitForTimeout(250);
    state = await readPixelateEdgeInsertionState(page);
  }
  return state;
}

async function readPixelateEdgeInsertionState(page: Page) {
  return page.evaluate(() => {
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
      hasAfter: Boolean(pixelate && edges.some((edge) => edge.fromId === pixelate.id && edge.toId === '__export__')),
    };
  });
}

async function selectUnconnectedTopFillNode(page: Page) {
  await gotoDocument(page, graphPreviewDocument);
  await switchToNodeView(page);
  const orphanNode = page.locator('.react-flow__node').filter({ hasText: 'Unconnected top fill' });
  await expect(orphanNode).toBeVisible({ timeout: 15_000 });
  await orphanNode.click();
  return orphanNode;
}

async function selectFirstNodeByKind(page: Page, kind: string) {
  const node = page.locator(`.node-shell-kind-${kind}`).first();
  await expect(node).toBeVisible({ timeout: 15_000 });
  await node.click();
  return node;
}

async function clickGraphEdges(page: Page, count: number) {
  const edges = page.locator('.react-flow__edge-path');
  await expect.poll(async () => (await edges.first().boundingBox()) !== null, { timeout: 15_000 }).toBe(true);
  const edgeCount = await edges.count();
  for (let index = 0; index < Math.min(count, edgeCount); index += 1) {
    await edges.nth(index).click({ force: true });
  }
}

async function waitForOutputEdgeVisualContract(page: Page) {
  const readOutputEdge = () =>
    page
      .locator('.react-flow__edge.node-edge-output-path .react-flow__edge-path')
      .first()
      .evaluate((edge) => {
        const style = getComputedStyle(edge);
        return {
          opacity: Number(style.opacity),
          stroke: style.stroke,
          strokeWidth: Number.parseFloat(style.strokeWidth),
          selectionColor: style.getPropertyValue('--node-edge-selection-color').trim(),
        };
      });
  await expect.poll(async () => (await readOutputEdge()).opacity, { timeout: 2_000 }).toBeGreaterThanOrEqual(0.75);
  return readOutputEdge();
}

async function readSelectedNodeColorContract(node: Locator) {
  return node.evaluate((element) => {
    const firstColorToken = (value: string) => {
      const start = value.search(/(?:color|oklab|oklch|rgb|rgba)\(/);
      if (start < 0) return '';
      let depth = 0;
      for (let index = start; index < value.length; index += 1) {
        if (value[index] === '(') depth += 1;
        if (value[index] === ')') {
          depth -= 1;
          if (depth === 0) return value.slice(start, index + 1);
        }
      }
      return '';
    };
    const resolveColorString = (color: string) => {
      const probe = document.createElement('span');
      probe.style.color = color;
      document.body.append(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return resolved;
    };
    const shell = element as HTMLElement;
    const shellStyle = getComputedStyle(shell);
    const accent = resolveColorString(shellStyle.getPropertyValue('--node-accent').trim());
    const shadow = shellStyle.boxShadow;
    const shadowAccent = firstColorToken(shadow);
    const rail = shell.querySelector('.node-shell-accent');
    return {
      accent,
      border: shellStyle.borderColor,
      outline: shellStyle.outlineColor,
      shadow: shellStyle.boxShadow,
      shadowAccent: resolveColorString(shadowAccent),
      rail: rail ? getComputedStyle(rail).backgroundColor : '',
    };
  });
}

async function waitForSelectedNodeColorContract(node: Locator) {
  await expect
    .poll(async () => nodeSelectionUsesAccent(await readSelectedNodeColorContract(node)), { timeout: 2_000 })
    .toBe(true);
  const selection = await readSelectedNodeColorContract(node);
  expectNodeSelectionUsesAccent(selection);
  return selection;
}

function expectNodeSelectionUsesAccent(selection: Awaited<ReturnType<typeof readSelectedNodeColorContract>>) {
  expect(selection.accent).not.toBe('');
  expect(selection.border).toBe(selection.accent);
  expect(selection.outline).toBe(selection.accent);
  expect(selection.rail).toBe(selection.accent);
  expect(selection.shadowAccent).toBe(selection.accent);
  expect(selection.shadow).not.toBe('none');
  expect(selection.shadow).toContain('0px 0px 0px 2px');
  expect(selection.shadow).toContain('0px 0px 0px 7px');
}

function nodeSelectionUsesAccent(selection: Awaited<ReturnType<typeof readSelectedNodeColorContract>>) {
  return (
    selection.accent !== '' &&
    selection.border === selection.accent &&
    selection.outline === selection.accent &&
    selection.rail === selection.accent &&
    selection.shadowAccent === selection.accent &&
    selection.shadow !== 'none' &&
    selection.shadow.includes('0px 0px 0px 2px') &&
    selection.shadow.includes('0px 0px 0px 7px')
  );
}

async function dragMouseFromBoxCenter(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
  delta: { x: number; y: number },
  steps: number,
) {
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await dragMouseFromPoint(page, { x: startX, y: startY }, delta, steps);
}

async function dragMouseFromPoint(
  page: Page,
  start: { x: number; y: number },
  delta: { x: number; y: number },
  steps: number,
  options: { release?: boolean } = {},
) {
  const startX = start.x;
  const startY = start.y;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + delta.x, startY + delta.y, { steps });
  if (options.release !== false) await page.mouse.up();
}

async function visibleBoundingBox(locator: Locator) {
  await expect(locator).toBeVisible({ timeout: 15_000 });
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error('Expected visible bounding box');
  return box;
}

async function expectStarterRows(page: Page, count: number, canvas = true) {
  await expect(page.locator('.empty-canvas-start')).toHaveCount(0);
  if (canvas) await expectLayerCanvasToHavePixels(page);
  await expect(page.locator('.sidebar .layer-row')).toHaveCount(count, { timeout: 15_000 });
}

async function expectGeneratedImageLayer(
  page: Page,
  prompt: string,
  options: { canvas?: boolean; currentPrompt?: boolean; exportDownload?: boolean } = {},
) {
  await expect(page.getByText('Added image layer.')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.sidebar .layer-row')).toHaveCount(1, { timeout: 15_000 });
  if (options.canvas) await expectLayerCanvasToHavePixels(page);
  if (options.currentPrompt) await expect(page.getByText('Current image prompt')).toBeVisible();
  await expect(page.locator('.ai-generation-provenance p').filter({ hasText: prompt })).toBeVisible();
  if (options.exportDownload) await expectImageExportDownload(page);
}

test('layer canvas survives switching to nodes and back', async ({ page }) => {
  await gotoDocument(page, lightDocument);
  await expectLayerCanvasToHavePixels(page);

  await expectNodeViewHasNodes(page);

  await switchToLayerView(page);
  await expect(page.locator('.sidebar')).toBeVisible();
  await expectLayerCanvasToHavePixels(page);
});

test('editor visual hierarchy separates panels canvas and selected rows', async ({ page }) => {
  await gotoDocument(page, layeredFillDocument);
  await expectLayerCanvasToHavePixels(page);

  await page.getByText('Top fill', { exact: true }).click();
  await hideLayerFromRowMenu(page, await getVisibleLayerRow(page, 'Top fill'));

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
    const hiddenName = hiddenRow?.querySelector('.layer-row-name');
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
  await gotoDocument(page, lightDocument);
  await page.evaluate(() => {
    let calls = 0;
    Math.random = () => {
      calls += 1;
      return calls === 1 ? 0.123456 : 0.34;
    };
  });
  await page.getByRole('button', { name: 'RANDOM' }).click();
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
  await gotoDocument(page, areaMergeDocument);
  await switchToNodeView(page);
  await expect(page.locator('.node-shell-kind-fill')).toBeVisible({ timeout: 15_000 });

  await page.locator('.node-shell-kind-fill').first().click();
  await expect(page.locator('.node-shell-kind-fill').first()).toHaveClass(/node-shell-selected/);

  await page
    .locator('.node-area-select')
    .first()
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.locator('.node-area').first()).toHaveClass(/node-area-selected/);

  await clickEditorControl(page.getByRole('button', { name: 'Show performance debug overlay' }));
  const stateStyles = await page.evaluate(() => {
    const styleValue = (styles: CSSStyleDeclaration | null, name: string) =>
      styles?.getPropertyValue(name).trim() ?? '';
    const parsedStyleNumber = (value: string, pattern: RegExp, fallback: number) => {
      const match = value.match(pattern);
      return match ? Number(match[1]) : fallback;
    };
    const readLightness = (styles: CSSStyleDeclaration | null, name: string) =>
      parsedStyleNumber(styleValue(styles, name), /oklch\(([\d.]+)%/, Number.NaN);
    const readAlpha = (styles: CSSStyleDeclaration | null, name: string) =>
      parsedStyleNumber(styleValue(styles, name), /\/\s*([\d.]+)\)/, 1);
    const backgroundColor = (element: Element | null) => (element ? getComputedStyle(element).backgroundColor : '');
    const borderColor = (element: Element | null) => (element ? getComputedStyle(element).borderColor : '');
    const boxShadow = (element: Element | null) => (element ? getComputedStyle(element).boxShadow : '');

    const node = document.querySelector('.node-shell-selected');
    const nodeHeader = node?.querySelector('.node-shell-header');
    const area = document.querySelector('.node-area-selected');
    const areaLabel = area?.querySelector('.node-area-label');
    const perf = document.querySelector('.node-canvas-toolbar button[aria-pressed="true"]');
    const root = document.querySelector('.node-canvas-root');
    const rootStyles = root ? getComputedStyle(root) : null;
    return {
      canvasBg: backgroundColor(root),
      nodeBg: backgroundColor(node),
      nodeBorder: borderColor(node),
      canvasLightness: readLightness(rootStyles, '--editor-canvas-bg'),
      nodeCardLightness: readLightness(rootStyles, '--node-card-bg'),
      nodeBorderLightness: readLightness(rootStyles, '--node-card-border'),
      gridLightness: readLightness(rootStyles, '--editor-grid-dot'),
      gridAlpha: readAlpha(rootStyles, '--editor-grid-dot'),
      selectedNodeShadow: boxShadow(node),
      selectedNodeHeaderBg: backgroundColor(nodeHeader),
      selectedAreaShadow: boxShadow(area),
      selectedAreaLabelBg: backgroundColor(areaLabel),
      perfActiveShadow: boxShadow(perf),
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

test('node canvas keeps category-colored selection and stable output path visuals', async ({ page }) => {
  await gotoDocument(page, categoryColorNodeDocument);
  await switchToNodeView(page);

  const emojiNode = page.locator('.node-shell-kind-emoji').first();
  const effectNode = page.locator('.node-shell-kind-effect').first();
  await expect(emojiNode).toBeVisible({ timeout: 15_000 });
  await expect(effectNode).toBeVisible({ timeout: 15_000 });

  await emojiNode.click();
  await expect(emojiNode).toHaveClass(/node-shell-selected/);
  const emojiSelection = await waitForSelectedNodeColorContract(emojiNode);

  await effectNode.click();
  await expect(effectNode).toHaveClass(/node-shell-selected/);
  const effectSelection = await waitForSelectedNodeColorContract(effectNode);

  expect(emojiSelection.accent).not.toBe(effectSelection.accent);

  await clickGraphEdges(page, 6);
  await expect(page.locator('body')).not.toContainText('Maximum update depth exceeded');

  const outputEdge = await waitForOutputEdgeVisualContract(page);
  expect(outputEdge.opacity).toBeGreaterThanOrEqual(0.75);
  expect(outputEdge.stroke).not.toBe('');
  expect(outputEdge.stroke).not.toBe('none');
  expect(outputEdge.strokeWidth).toBeGreaterThanOrEqual(2);
  expect(outputEdge.selectionColor).not.toBe('');
});

test('node graph highlights the active output path and exposes output navigation', async ({ page }) => {
  await gotoDocument(page, graphPreviewDocument);
  await switchToNodeView(page);

  const connectedNode = page.locator('.react-flow__node').filter({ hasText: 'Connected fill' });
  const orphanNode = page.locator('.react-flow__node').filter({ hasText: 'Unconnected top fill' });
  await expect(connectedNode.locator('.node-shell')).toHaveClass(/node-shell-output-path/, { timeout: 15_000 });
  await expect(orphanNode.locator('.node-shell')).not.toHaveClass(/node-shell-output-path/);
  await expect(page.locator('.react-flow__edge.node-edge-output-path')).toHaveCount(1);

  const paneBox = await page.locator('.react-flow__pane').boundingBox();
  expect(paneBox).toBeTruthy();
  if (!paneBox) return;
  await page.mouse.move(paneBox.x + paneBox.width / 2, paneBox.y + paneBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(paneBox.x + paneBox.width / 2 - 300, paneBox.y + paneBox.height / 2 - 180, { steps: 6 });
  await page.mouse.up();
  await clickEditorControl(page.getByRole('button', { name: 'Jump to output node' }));
  await expect(page.locator('.node-shell-kind-export')).toBeVisible();
  await expect
    .poll(
      async () => {
        const pane = await page.locator('.react-flow__pane').boundingBox();
        const output = await page.locator('.node-shell-kind-export').boundingBox();
        if (!pane || !output) return false;
        return (
          output.x + output.width > pane.x &&
          output.x < pane.x + pane.width &&
          output.y + output.height > pane.y &&
          output.y < pane.y + pane.height
        );
      },
      { timeout: 2_000 },
    )
    .toBe(true);

  await expect(page.getByRole('button', { name: 'Fit output path' })).toHaveCount(0);
  await expect(page.locator('.react-flow__controls')).toBeVisible();
  await expect(page.locator('.react-flow__controls-button')).toHaveCount(3);
  await expect(page.locator('.node-shell-kind-export')).toBeVisible();
});

test('layer visibility updates the rendered canvas', async ({ page }) => {
  await gotoDocument(page, layeredFillDocument);

  await expect.poll(async () => getCanvasCenterRgb(page), { timeout: 15_000 }).toMatchObject({ r: 221, g: 51, b: 34 });

  await hideLayerFromRowMenu(page, await getVisibleLayerRow(page, 'Top fill'));

  await expect.poll(async () => getCanvasCenterRgb(page), { timeout: 15_000 }).toMatchObject({ r: 34, g: 85, b: 204 });
});

test('layer properties show the active editing target and hidden state', async ({ page }) => {
  await gotoDocument(page, layeredFillDocument);

  const topFillRow = await getVisibleLayerRow(page, 'Top fill');
  await topFillRow.click();
  await hideLayerFromRowMenu(page, topFillRow);

  const targetHeader = page.locator('.sidebar-sections .editor-target-header').first();
  await expect(targetHeader).toContainText('Layers / Source');
  await expect(targetHeader).toContainText('Top fill');
  await expect(targetHeader).toContainText('Layer 2/2');
  await expect(targetHeader).toContainText('Hidden');
});

test('locked layer surfaces status and blocks row deletion', async ({ page }) => {
  await gotoDocument(page, layeredFillDocument);

  const topFillRow = await getVisibleLayerRow(page, 'Top fill');
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

  const actionsMenu = await openLayerRowActions(page, topFillRow);
  await expect(actionsMenu.getByRole('menuitem', { name: 'Delete locked' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(topFillRow.getByRole('button', { name: /Drag layer Top fill/ })).toBeDisabled();
  await expect
    .poll(
      async () =>
        (await getStoredLayers(page)).map((layer: { id: string; locked?: boolean }) => ({
          id: layer.id,
          locked: !!layer.locked,
        })),
      { timeout: 15_000 },
    )
    .toEqual([
      { id: 'bottom-fill', locked: false },
      { id: 'top-fill', locked: true },
    ]);
});

test('layer rows expose rename duplicate visibility and delete actions', async ({ page }) => {
  await gotoDocument(page, layeredFillDocument);

  const topFillRow = await getVisibleLayerRow(page, 'Top fill');

  await chooseLayerRowAction(page, topFillRow, 'Rename');
  const renameInput = page.getByRole('textbox', { name: /Rename layer Top fill/ });
  await renameInput.fill('Cover Type');
  await renameInput.press('Enter');
  await expect(page.locator('.layer-row').filter({ hasText: 'Cover Type' })).toHaveCount(1);

  const renamedRow = page.locator('.layer-row').filter({ hasText: 'Cover Type' }).first();
  await chooseLayerRowAction(page, renamedRow, 'Duplicate');

  const duplicateRow = page.locator('.layer-row').filter({ hasText: 'Cover Type copy' }).first();
  await expect(duplicateRow).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.layer-row')).toHaveCount(3);

  await chooseLayerRowAction(page, duplicateRow, 'Hide');
  await expectStoredLayerField(page, { key: 'name', value: 'Cover Type copy' }, 'visible', false);

  await chooseLayerRowAction(page, duplicateRow, 'Delete');
  await expect(page.locator('.layer-row').filter({ hasText: 'Cover Type copy' })).toHaveCount(0);
  await expect(page.locator('.layer-row')).toHaveCount(2);
});

test('layer rows can quick-add a layer above the current row', async ({ page }) => {
  await gotoDocument(page, layeredFillDocument);

  await insertLayerAbove(page, 'Top fill', /^Grain$/);

  await expect(page.locator('.layer-row').filter({ hasText: 'Grain' })).toHaveCount(1, { timeout: 15_000 });
  await expectStoredLayerSummaries(page, [
    { name: 'Bottom fill', kind: 'fill' },
    { name: 'Top fill', kind: 'fill' },
    { name: 'Grain', kind: 'effect' },
  ]);

  await insertSourceLayerAbove(page, 'Bottom fill', /^AI Image$/);

  await expect(page.locator('.layer-row').filter({ hasText: 'AI Image' })).toHaveCount(1, { timeout: 15_000 });
  await expectStoredLayerSummaries(page, [
    { name: 'Bottom fill', kind: 'fill' },
    { name: 'AI Image', kind: 'image' },
    { name: 'Top fill', kind: 'fill' },
    { name: 'Grain', kind: 'effect' },
  ]);

  await insertSourceLayerAbove(page, 'Bottom fill', /^Array$/);

  await expect(page.locator('.layer-row').filter({ hasText: 'Array' })).toHaveCount(1, { timeout: 15_000 });
  await expectStoredLayerSummaries(page, [
    { name: 'Bottom fill', kind: 'fill' },
    { name: 'Array', kind: 'array' },
    { name: 'AI Image', kind: 'image' },
    { name: 'Top fill', kind: 'fill' },
    { name: 'Grain', kind: 'effect' },
  ]);
});

test('layer add library supports search keyboard add and recent items', async ({ page }) => {
  await gotoDocument(page, layeredFillDocument);

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
  await gotoDocument(page, layeredFillDocument);

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
  await gotoDocument(page, layeredFillDocument);

  await insertLayerAbove(page, 'Top fill', /^Pixelate$/);

  const pixelateRow = page.locator('.layer-row').filter({ hasText: 'Pixelate' }).first();
  await expect(pixelateRow).toBeVisible({ timeout: 15_000 });
  await pixelateRow.click();
  await expect(page.locator('.sidebar')).toContainText('Block Size');
  await expect(page.locator('.sidebar .node-inspector-value')).toContainText('6px');
  await expectLayerCanvasToHavePixels(page);
});

test('layers can add title text starts with readable font controls', async ({ page }) => {
  await gotoDocument(page, layeredFillDocument);

  await addTitleTypeLayer(page);
  await expect(page.locator('.sidebar')).toContainText('Archivo Black / dense cover');
  await expect(page.locator('.sidebar')).toContainText('TITLE');
  await choosePixelFont(page);
  await expectLayerCanvasToHavePixels(page);

  const textLayer = await getStoredLayerBy(page, 'name', 'Title Type');
  expect(textLayer).toMatchObject({ kind: 'text', content: 'TITLE', font: 'PRESS_START' });
});

test('layers can import a local font through the shared font picker', async ({ page }) => {
  await gotoDocument(page, layeredFillDocument);

  await addTitleTypeLayer(page);
  await page.locator('.sidebar .font-picker-trigger').click();
  await page.getByLabel('Import font').setInputFiles({
    name: 'Local Poster.ttf',
    mimeType: 'font/ttf',
    buffer: readBrowserFontFixture(),
  });

  await expect(page.locator('.sidebar .font-picker-trigger')).toContainText('Local Poster');
  await expect(page.locator('.sidebar .font-picker-trigger')).toContainText('Imported');
  await expectLayerCanvasToHavePixels(page);

  const importedLayer = await getStoredLayerBy(page, 'name', 'Title Type');
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

  await gotoDocument(page, layeredFillDocument);
  await addTitleTypeLayer(page);
  await page.locator('.sidebar .font-picker-trigger').click();
  await page.getByLabel('Import Google font').fill('Mock Google');
  await page.locator('.sidebar .font-picker-google-action').click();

  await expect(page.locator('.sidebar .font-picker-trigger')).toContainText('Mock Google');
  await expect(page.locator('.sidebar .font-picker-trigger')).toContainText('Google');
  await expectLayerCanvasToHavePixels(page);

  const { json: projectPackage } = await downloadJsonFromButton(page, 'Save editable project package');

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

  await gotoDocument(page, portableAssetDocument);
  await expectLayerCanvasToHavePixels(page);
  await importPortableFontForLayer(page);
  await expectLayerCanvasToHavePixels(page);
  await expectPortableRefsStored(page);

  const { raw: artifactJson, json: artifactDoc } = await downloadJsonFromButton(page, 'Save document file');
  const portableImage = artifactDoc.layers?.find((layer: { id: string }) => layer.id === 'portable-image');

  expect(portableImage?.src).toContain('data:image/');
  expect(artifactDoc.fontAssets?.[0]?.dataUrl).toContain('data:font/');

  await openDocumentFileFromBuffer(page, {
    name: 'portable-assets.artifact.json',
    mimeType: 'application/json',
    buffer: Buffer.from(artifactJson),
  });

  await expectPortableTypeReady(page, { refs: true });
});

test('project packages save images with license-aware font policy by default', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Project package download/import coverage runs once in Chromium.');

  await gotoDocument(page, portableAssetDocument);
  await expectLayerCanvasToHavePixels(page);
  await importPortableFontForLayer(page);
  await expectLayerCanvasToHavePixels(page);

  const { raw: packageJson, json: projectPackage } = await downloadJsonFromButton(
    page,
    'Save editable project package',
  );
  expectLicenseAwareProjectPackage(projectPackage);
  await expectExplicitFontProjectPackage(page);

  await openDocumentFileFromBuffer(page, {
    name: 'portable-assets.artifact',
    mimeType: 'application/vnd.artifact.project+json',
    buffer: Buffer.from(packageJson),
  });

  await expectPortableTypeReady(page);
});

interface DownloadedProjectPackage {
  artifactPackage?: unknown;
  manifest?: {
    fontEmbeddingMode?: unknown;
    rasterExportPolicy?: unknown;
    editableTextPolicy?: unknown;
    fonts?: unknown[];
  };
  document?: {
    layers?: Array<{ id: string; src?: string }>;
    fontAssets?: unknown[];
  };
}

function expectLicenseAwareProjectPackage(projectPackage: DownloadedProjectPackage) {
  const packagedImage = projectPackage.document?.layers?.find((layer) => layer.id === 'portable-image');

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
}

async function expectExplicitFontProjectPackage(page: Page) {
  const explicitDialogPromise = new Promise<string>((resolve) => {
    page.once('dialog', async (dialog) => {
      const message = dialog.message();
      await dialog.accept();
      resolve(message);
    });
  });
  const explicitDownloadPromise = page.waitForEvent('download');
  await clickShareMenuAction(page, 'Download package + assets + fonts');
  const explicitDownload = await explicitDownloadPromise;
  await expect(explicitDialogPromise).resolves.toContain('PKG+FONTS embeds imported local font files');
  const explicitArtifactPath = await explicitDownload.path();
  expect(explicitArtifactPath).toBeTruthy();
  if (!explicitArtifactPath) return;
  const explicitPackage = JSON.parse(readFileSync(explicitArtifactPath, 'utf8'));
  expect(explicitPackage.manifest?.fontEmbeddingMode).toBe('explicit-font-files');
  expect(explicitPackage.manifest?.fonts?.[0]).toMatchObject({
    kind: 'imported',
    embedding: 'embedded-file',
  });
  expect(explicitPackage.document?.fontAssets?.[0]?.dataUrl).toContain('data:font/');
}

test('project packages keep missing-font text editable for replacement', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Missing-font package coverage runs once in Chromium.');

  await gotoDocument(page, missingFontDocument);
  await page.locator('.layer-row').filter({ hasText: 'Missing Font Type' }).click();
  await expectLayerCanvasToHavePixels(page);

  const { raw: packageJson, json: projectPackage } = await downloadJsonFromButton(
    page,
    'Save editable project package',
  );

  expect(projectPackage.document?.fontAssets).toBeUndefined();
  expect(projectPackage.manifest?.fonts?.[0]).toMatchObject({
    ref: 'artifact-font://missing-browser-font',
    kind: 'imported',
    embedding: 'missing-metadata',
    recovery: 'editable-text-replace-font',
    textContents: ['FONT FALLBACK'],
  });

  await openDocumentFileFromBuffer(page, {
    name: 'missing-font.artifact',
    mimeType: 'application/vnd.artifact.project+json',
    buffer: Buffer.from(packageJson),
  });

  await expectMissingFontLayerVisible(page);
  await choosePixelFont(page);

  const textLayer = await getStoredLayerBy(page, 'id', 'missing-font-text');
  expect(textLayer).toMatchObject({ kind: 'text', content: 'FONT FALLBACK', font: 'PRESS_START' });
});

test('project packages reopen graph documents with output previews', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Graph package coverage runs once in Chromium.');

  await gotoDocument(page, portableAssetGraphDocument);
  await importPortableFontForLayer(page);
  await expectLayerCanvasToHavePixels(page);

  const { raw: packageJson, json: projectPackage } = await downloadJsonFromButton(
    page,
    'Save editable project package',
  );

  expect(projectPackage.manifest?.hasGraphExportTarget).toBe(true);
  expect(projectPackage.manifest?.missingGraphExportTarget).toBe(false);
  expect(projectPackage.document?.graph?.edges).toEqual(
    expect.arrayContaining([expect.objectContaining({ fromId: 'portable-type', toId: '__export__', toPort: 'in' })]),
  );

  await openDocumentFileFromBuffer(page, {
    name: 'portable-graph.artifact',
    mimeType: 'application/vnd.artifact.project+json',
    buffer: Buffer.from(packageJson),
  });

  await expectPortableTypeReady(page, { outputNode: true });
});

test('portable stack documents with imported image and font export', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Portable asset export smoke runs once in Chromium.');

  await gotoDocument(page, portableAssetDocument);
  await importPortableFontForLayer(page);
  await expectLayerCanvasToHavePixels(page);
  await expectPortableRefsStored(page);

  await expectImageExportDownload(page);
});

test('portable graph documents export imported assets through the output node', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Portable graph export smoke runs once in Chromium.');

  await gotoDocument(page, portableAssetGraphDocument);
  await importPortableFontForLayer(page);
  await expectLayerCanvasToHavePixels(page);
  await expectPortableRefsStored(page);
  await switchToNodeView(page);
  await expect(page.locator('.node-shell-kind-export')).toBeVisible({ timeout: 15_000 });

  await expectImageExportDownload(page);
});

test('portable share links include imported image and font payloads', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Portable share-link coverage runs once in Chromium.');

  await captureCopiedShareLink(page);
  await gotoDocument(page, portableShareLinkDocument);
  await expectLayerCanvasToHavePixels(page);
  await expectPortableRefsStored(page);

  await clickShareMenuAction(page, 'Copy editor link');
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

  await startBlankEditor(page);
  await page.goto(shareUrl);
  await expectPortableTypeReady(page, { refs: true });
});

test('local projects preserve imported image and font assets across save and load', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Portable local-project coverage runs once in Chromium.');

  await gotoDocument(page, portableAssetDocument);
  await importPortableFontForLayer(page);
  await expectLayerCanvasToHavePixels(page);
  await expectPortableRefsStored(page);

  await page.getByRole('button', { name: 'PROJECTS' }).click();
  await page.getByLabel('Project name').fill('Portable Project');
  await page.getByRole('button', { name: 'CREATE PROJECT', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Load Portable Project' })).toBeVisible({ timeout: 15_000 });

  await startBlankEditor(page);
  await page.getByRole('button', { name: 'PROJECTS' }).click();
  await page.getByRole('button', { name: 'Load Portable Project' }).click();

  await expectPortableTypeReady(page, { refs: true });
});

test('missing imported image shows a clear replacement state', async ({ page }) => {
  await gotoDocument(page, missingImageDocument);
  await page.locator('.layer-row').filter({ hasText: 'Missing Image' }).click();

  await expect(page.getByText('Image unavailable')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Replace the source to restore this layer.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Replace image' })).toBeVisible();
});

test('missing imported font keeps fallback text visible', async ({ page }) => {
  await gotoDocument(page, missingFontDocument);
  await expectMissingFontLayerVisible(page);
});

test('effect node inspector exposes and persists local seed offsets', async ({ page }) => {
  await gotoDocument(page, effectSeedDocument);
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

  await expectStoredLayerField(page, { key: 'id', value: 'effect-seed-grain' }, 'seedOffset', 42);
});

test('layer text drag keeps effect stack active during movement', async ({ page }) => {
  await gotoDocument(page, layerTextEffectDragDocument);
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
  await gotoDocument(page, graphPreviewDocument);

  await expect.poll(async () => getCanvasCenterRgb(page), { timeout: 15_000 }).toMatchObject({ r: 46, g: 107, b: 217 });
  await switchToNodeView(page);
  await expect(page.locator('.node-shell-kind-export')).toBeVisible({ timeout: 15_000 });
  await switchToLayerView(page);
  await expect.poll(async () => getCanvasCenterRgb(page), { timeout: 15_000 }).toMatchObject({ r: 46, g: 107, b: 217 });
});

test('node properties show whether the selected target feeds output', async ({ page }) => {
  await selectUnconnectedTopFillNode(page);
  const nodePropsPanel = page.locator('.node-props-panel-open');
  const targetOverview = nodePropsPanel.locator('.node-target-overview').first();
  const targetHeader = nodePropsPanel.locator('.editor-target-header').first();
  await expect(targetOverview).toHaveClass(/node-target-overview-source/);
  await expect(targetOverview.getByLabel('Toggle node delete lock')).toBeVisible();
  await expect(targetHeader).toContainText('Nodes / Source');
  await expect(targetHeader).toContainText('Unconnected top fill');
  await expect(targetHeader).toContainText('Layer 2/2');
  await expect(targetHeader).toContainText('Not in output');
  await expect(targetHeader).toContainText('Off output path');

  const controlSurfaceStyles = await nodePropsPanel.evaluate((panel) => {
    const read = (element: Element | null) => {
      if (!element) return null;
      const styles = getComputedStyle(element);
      return {
        background: styles.backgroundColor,
        border: styles.borderColor,
      };
    };
    return {
      panel: read(panel),
      section: read(panel.querySelector('.node-inspector-section-open')),
      control: read(panel.querySelector('.node-inspector-control, .node-inspector-row, .node-inspector-toggle')),
      summary: read(panel.querySelector('.node-inspector-section-summary')),
    };
  });
  expect(controlSurfaceStyles.section?.background).toBeTruthy();
  expect(controlSurfaceStyles.section?.background).not.toBe(controlSurfaceStyles.panel?.background);
  expect(controlSurfaceStyles.control?.border).toBeTruthy();
  expect(controlSurfaceStyles.summary?.background).toBeTruthy();
});

test('locked node target stays in the graph when delete is pressed', async ({ page }) => {
  const orphanNode = await selectUnconnectedTopFillNode(page);
  const nodePropsPanel = page.locator('.node-props-panel-open');
  await expect(nodePropsPanel).toBeVisible();
  await nodePropsPanel.getByLabel('Toggle node delete lock').check();

  const targetHeader = nodePropsPanel.locator('.editor-target-header').first();
  await expect(targetHeader).toContainText('Locked');
  await expect(orphanNode.getByRole('button', { name: 'Delete node' })).toHaveCount(0);

  await page.keyboard.press('Delete');

  await expect(orphanNode).toBeVisible();
  await expectStoredLayerField(page, { key: 'id', value: 'graph-unconnected-fill' }, 'locked', true);
});

test('output properties explain missing graph input', async ({ page }) => {
  await gotoDocument(page, outputNoInputDocument);
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
  await gotoDocument(page, areaMergeDocument);
  await switchToNodeView(page);

  const mergeNode = page.locator('.react-flow__node').filter({ hasText: 'MERGE' });
  await expect(mergeNode).toBeVisible({ timeout: 15_000 });
  await mergeNode.click();

  const nodePropsPanel = page.locator('.node-props-panel-open');
  const targetHeader = nodePropsPanel.locator('.editor-target-header').first();
  await expect(nodePropsPanel.locator('.node-target-overview').first()).toHaveClass(/node-target-overview-utility/);
  await expect(targetHeader).toContainText('Nodes / Utility');
  await expect(targetHeader).toContainText('Area: Area 1');
  await expect(targetHeader).toContainText('Output path');
  await expect(targetHeader).toContainText(
    'Graph-only utility nodes can be deleted or moved; durable locking is reserved for layer-backed targets in v0.28.',
  );
  await expect(nodePropsPanel.getByLabel('Toggle node delete lock')).toHaveCount(0);
});

test('layers added after graph bootstrap connect into the export path', async ({ page }) => {
  await gotoDocument(page, wideNodeDocument);
  await switchToNodeView(page);
  await switchToLayerView(page);

  const header = page.locator('.layer-panel-header');
  await header.getByRole('button', { name: 'Add layer' }).click();
  await page
    .locator('.add-library-row')
    .filter({ has: page.locator('.add-library-row-label', { hasText: /^Fill$/ }) })
    .first()
    .click();

  await expectStoredLayerCount(page, 2);

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
  await switchToNodeView(page);
  await page.locator('.node-shell-kind-primitive').first().click();
  await expect(page.locator('.primitive-node-camera-hint')).toContainText('camera 138%');
  await expect(page.getByText('Oops!')).toHaveCount(0);
});

test('node performance debug toggle persists', async ({ page }) => {
  await gotoDocument(page, wideNodeDocument);
  await switchToNodeView(page);

  await clickEditorControl(page.getByRole('button', { name: 'Show performance debug overlay' }));
  await expect(page.locator('.node-perf-grid')).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('artifact-debug-perf')), { timeout: 15_000 })
    .toBe('1');

  await page.reload();
  await switchToNodeView(page);
  await expect(page.getByRole('button', { name: 'Hide performance debug overlay' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.node-perf-grid')).toBeVisible();
  await clickEditorControl(page.getByRole('button', { name: 'Hide performance debug overlay' }));
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('artifact-debug-perf')), { timeout: 15_000 })
    .toBe('0');
  await page.close();
});

test('default document can export from the browser', async ({ page, browserName }) => {
  test.setTimeout(60_000);
  test.skip(
    browserName === 'firefox',
    'Firefox download events are unreliable in GitHub Actions; export download smoke runs in Chromium/WebKit.',
  );

  await page.goto('/app');
  await expectLayerCanvasToHavePixels(page);

  await expectImageExportDownload(page);
});

test('current document can be saved into local projects', async ({ page }) => {
  await gotoDocument(page, lightDocument);
  await page.getByRole('button', { name: 'PROJECTS' }).click();
  await page.getByLabel('Project name').fill('Browser Project');
  await page.getByRole('button', { name: 'CREATE PROJECT', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Save active project Browser Project' })).toBeVisible({
    timeout: 15_000,
  });
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
  await expectStoredImageLayerAssetUri(page);

  await page.reload();
  await expectLayerCanvasToHavePixels(page);
});

test('dropped artifact files stage a confirmed import and save current work as recovery', async ({ page }) => {
  const droppedDocument = {
    ...lightDocument,
    global: { ...lightDocument.global, aspect: '4:5' },
    layers: [
      {
        ...lightDocument.layers[0],
        id: 'dropped-artifact-fill',
        name: 'Dropped artifact fill',
        color: '#cc5522',
      },
    ],
  };

  await gotoDocument(page, lightDocument);
  await expectLayerCanvasToHavePixels(page);

  await page.evaluate((doc) => {
    const file = new File([JSON.stringify(doc)], 'dropped-cover.artifact.json', { type: 'application/json' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    document
      .querySelector('main')
      ?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  }, droppedDocument);

  const dialog = page.getByRole('dialog', { name: 'Open artifact file' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog).toContainText('dropped-cover.artifact.json');
  await expect(dialog).toContainText('4:5');
  expect(await getStoredLayerBy(page, 'id', 'fill-browser-smoke')).toBeTruthy();
  expect(await getStoredLayerBy(page, 'id', 'dropped-artifact-fill')).toBeFalsy();

  await dialog.getByRole('button', { name: 'OPEN FILE' }).click();
  await expect.poll(() => getStoredLayerBy(page, 'id', 'dropped-artifact-fill')).toBeTruthy();
  await expect.poll(() => getStoredRecoveryLayerId(page)).toBe('fill-browser-smoke');
});

test('new blank canvas ignores stored work and shows the empty start panel', async ({ page }) => {
  await page.goto('/app');
  await page.evaluate((storedDoc) => localStorage.setItem('doc', JSON.stringify(storedDoc)), lightDocument);

  await page.goto('/app?new=blank');

  await expect(page.locator('.empty-canvas-start')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.sidebar .layer-row')).toHaveCount(0);
  await expectCanvasCenterAlpha(page, 0);

  await page.getByRole('button', { name: 'PROJECTS' }).click();
  await expect(page.locator('.library-card-draft').getByRole('button', { name: 'Load Previous work' })).toBeVisible();
  await page.getByRole('button', { name: 'Load Previous work' }).click();
  await expectLayerCanvasToHavePixels(page);
});

test('empty layer panel offers direct layer quick starts', async ({ page }) => {
  await page.goto('/app?new=blank');

  const emptyPanel = page.locator('.layer-empty-state');
  await expect(emptyPanel).toBeVisible({ timeout: 15_000 });
  await expect(emptyPanel).toContainText('No layers yet');
  await expect(emptyPanel).toContainText('Start with image, text, AI, or a recipe.');
  await expect(page.locator('.empty-canvas-start').getByRole('link', { name: 'Open guide' })).toHaveAttribute(
    'href',
    '/docs/nodes#docs-first-cover',
  );
  await expect(page.locator('.empty-canvas-start').getByRole('link', { name: 'Showcase' })).toHaveAttribute(
    'href',
    '/showcase',
  );
  await expect(page.locator('.empty-canvas-start').getByRole('button', { name: 'Texture Type' })).toBeVisible();

  await page.locator('.empty-canvas-start').getByRole('button', { name: 'Add text' }).click();
  await expect(page.locator('.layer-empty-state')).toHaveCount(0);
  await expect(page.locator('.layer-row').filter({ hasText: 'Text' })).toHaveCount(1, { timeout: 15_000 });
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
  await gotoDocument(page, layeredFillDocument);
  await expectLayerCanvasToHavePixels(page);
  await expectNodeViewHasNodes(page);
  await switchToLayerView(page);

  const source = page.locator('.layer-row').filter({ hasText: 'Top fill' }).first();
  const target = page.locator('.layer-row').filter({ hasText: 'Bottom fill' }).first();
  await expect(source).toBeVisible({ timeout: 15_000 });
  await expect(target).toBeVisible({ timeout: 15_000 });

  await dragLayerRowOverText(page, 'Top fill', 'Bottom fill');

  await expect(target).toHaveClass(/layer-row-drop-after/);

  await dropLayerRowOnText(page, 'Bottom fill');

  await expectStoredGraphLayerOrder(page, {
    layerIds: ['top-fill', 'bottom-fill'],
    graphEdges: ['top-fill->bottom-fill', 'bottom-fill->__export__'],
    leftNodeId: 'top-fill',
    rightNodeId: 'bottom-fill',
  });
  await expectLayerCanvasToHavePixels(page);
});

test('layer drag reorder uses the final drop row even after stale dragover state', async ({ page }) => {
  await gotoDocument(page, threeLayerReorderDocument);
  await expectLayerCanvasToHavePixels(page);

  await expectVisibleLayerRowIds(page, ['reorder-top', 'reorder-middle', 'reorder-bottom']);

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
  await expectVisibleLayerRowIds(page, ['reorder-middle', 'reorder-top', 'reorder-bottom']);
});

test('layer drag reorder makes a custom graph follow the layer stack', async ({ page }) => {
  await gotoDocument(page, customGraphLayerReorderDocument);
  await expectLayerCanvasToHavePixels(page);

  await expectStoredGraphEdges(page, ['custom-bottom-fill->__export__']);

  const source = page.locator('.layer-row').filter({ hasText: 'Custom top' }).first();
  const target = page.locator('.layer-row').filter({ hasText: 'Custom bottom' }).first();
  await expect(source).toBeVisible({ timeout: 15_000 });
  await expect(target).toBeVisible({ timeout: 15_000 });

  await dragLayerRowOverText(page, 'Custom top', 'Custom bottom');
  await dropLayerRowOnText(page, 'Custom bottom');

  await expectStoredGraphLayerOrder(page, {
    layerIds: ['custom-top-fill', 'custom-bottom-fill'],
    graphEdges: ['custom-top-fill->custom-bottom-fill', 'custom-bottom-fill->__export__'],
    leftNodeId: 'custom-top-fill',
    rightNodeId: 'custom-bottom-fill',
  });
  await expectLayerCanvasToHavePixels(page);
});

test('new blank canvas action confirms before replacing current work', async ({ page }) => {
  await gotoDocument(page, lightDocument);
  await expectLayerCanvasToHavePixels(page);

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('recovery copy');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Create new project' }).click();

  await expect(page.locator('.empty-canvas-start')).toBeVisible({ timeout: 15_000 });
  await expectCanvasCenterAlpha(page, 0);
});

test('empty canvas can start from the layer-first texture recipe', async ({ page }) => {
  await startBlankEditor(page);
  await expect(page.locator('.empty-canvas-start').getByRole('button', { name: 'Multi Font' })).toBeVisible();
  await expect(page.locator('.empty-canvas-start').getByRole('button', { name: 'Photo Stack' })).toBeVisible();

  await page
    .locator('.empty-canvas-start')
    .getByRole('button', { name: /Texture Type/i })
    .click();

  await expectStarterRows(page, 6);
  await expect(page.getByText('paper clouds')).toBeVisible();
  await expect(page.getByText('paper tooth')).toBeVisible();
  await expectStoredStarterDocument(page, {
    aspect: '1:1',
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
  await startBlankEditor(page);

  await page.locator('.empty-canvas-start').getByRole('button', { name: 'Multi Font' }).click();

  await expectStarterRows(page, 10);
  await expect(page.getByText('poster title')).toBeVisible();
  await expect(page.getByText('mono subtitle')).toBeVisible();
  await expect(page.getByText('pixel label')).toBeVisible();
  await expect(page.getByText('type credits')).toBeVisible();
  await expectStoredStarterDocument(page, {
    aspect: '4:5',
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
  await startBlankEditor(page);

  await page.locator('.empty-canvas-start').getByRole('button', { name: 'Photo Stack' }).click();

  await expectStarterRows(page, 6);
  await expect(page.getByText('cover photo')).toBeVisible();
  await expect(page.getByText('headline type')).toBeVisible();
  await expectStoredStarterDocument(page, {
    aspect: '4:5',
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
  await page.goto('/docs/recipes');
  await expect(page.getByRole('heading', { name: 'Recipes.' })).toBeVisible();

  const recipe = page.locator('.docs-recipe-row').filter({ hasText: 'Photo Plus Type Recipe' });
  await expect(recipe).toBeVisible();
  await recipe.getByRole('link', { name: 'Open' }).click();

  await expect(page).toHaveURL(/\/app(?:\?|$)/);
  await expectLayerCanvasToHavePixels(page);
  await expect(page.getByText('cover photo')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('headline type')).toBeVisible();
});

test('add-node menu exposes recipe groups and workflow search', async ({ page }) => {
  await page.goto('/app?new=blank');
  await switchToNodeView(page);
  await clickEditorControl(page.getByRole('button', { name: 'Add node' }));
  const recipeRail = page.locator('.add-library-recipes');
  const nodeAddRowByLabel = (label: RegExp) =>
    page.locator('.nadd-row').filter({ has: page.locator('.nadd-row-label', { hasText: label }) });

  await expect(recipeRail.getByRole('button', { name: 'Photo + Type' })).toBeVisible();
  await expect(recipeRail.getByRole('button', { name: 'Texture Type' })).toBeVisible();
  await expect(recipeRail.getByRole('button', { name: 'Print Damage' })).toBeVisible();

  await expect(nodeAddRowByLabel(/^Fill$/)).toHaveAttribute('data-add-color-kind', 'fill');
  await expect(nodeAddRowByLabel(/^Text$/)).toHaveAttribute('data-add-color-kind', 'text');
  await expect(nodeAddRowByLabel(/^Pixelate$/)).toHaveAttribute('data-add-color-kind', 'effect');
  const addLibraryColors = await page.evaluate(() => {
    const rowSymbolColor = (label: string) => {
      const rows = [...document.querySelectorAll('.add-library-node-menu .add-library-row')];
      const row = rows.find((candidate) => candidate.querySelector('.add-library-row-label')?.textContent === label);
      const symbol = row?.querySelector('.add-library-row-symbol');
      return symbol ? getComputedStyle(symbol).color : '';
    };
    return {
      fill: rowSymbolColor('Fill'),
      text: rowSymbolColor('Text'),
      pixelate: rowSymbolColor('Pixelate'),
    };
  });
  expect(addLibraryColors.fill).not.toBe('');
  expect(addLibraryColors.text).not.toBe(addLibraryColors.fill);
  expect(addLibraryColors.pixelate).not.toBe(addLibraryColors.fill);

  await clickEditorControl(page.getByRole('button', { name: /^Tone$/ }));
  await expect(nodeAddRowByLabel(/^Pixelate$/)).toBeVisible();
  await expect(nodeAddRowByLabel(/^Fill$/)).toHaveCount(0);
  await clickEditorControl(page.getByRole('button', { name: /^All$/ }));

  await clickEditorControl(recipeRail.getByRole('button', { name: 'Print Damage' }));
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
  await gotoDocument(page, wideNodeDocument);
  await openNodeAddMenuWithSearch(page, 'pixelate', { waitForExportNode: true });
  await expect(page.locator('.add-library-node-menu img[alt="Pixelate preview"]')).toBeVisible({ timeout: 15_000 });
  await clickEditorControl(page.getByRole('button', { name: /^▦ Pixelate/ }));

  await expectPixelateNode(page);
  await expect(page.locator('.node-props-panel')).toContainText('Block Size');
  await expect(page.locator('.node-props-panel .node-inspector-value')).toContainText('6px');
  await switchToLayerView(page);
  await expectLayerCanvasToHavePixels(page);
});

test('node add menu can add Bad Stream with compression controls', async ({ page }) => {
  await gotoDocument(page, wideNodeDocument);
  await openNodeAddMenuWithSearch(page, 'bad stream', { waitForExportNode: true });
  await expect(page.locator('.add-library-node-menu img[alt="Bad Stream preview"]')).toBeVisible({ timeout: 15_000 });
  await clickEditorControl(page.getByRole('button', { name: /^▧ Bad Stream/ }));

  const badStreamNode = page.locator('.node-shell-kind-effect').filter({ hasText: 'Bad Stream' }).first();
  await expect(badStreamNode).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.node-props-panel')).toContainText('Compression');
  await expect(page.locator('.node-props-panel')).toContainText('Macroblocks');
  await expect(page.locator('.node-props-panel')).toContainText('Chroma Drift');

  const layer = await getStoredLayerBy(page, 'name', 'Bad Stream');
  expect(layer).toMatchObject({ kind: 'effect', preset: 'badStream', badStream: 72, badStreamBlockSize: 54 });
});

test('node add menu can add Macroblocks as a focused Bad Stream block', async ({ page }) => {
  await gotoDocument(page, wideNodeDocument);
  await openNodeAddMenuWithSearch(page, 'macroblocks', { waitForExportNode: true });
  await expect(page.locator('.add-library-node-menu img[alt="Macroblocks preview"]')).toBeVisible({ timeout: 15_000 });
  await clickEditorControl(page.getByRole('button', { name: /^▦ Macroblocks/ }));

  const macroblocksNode = page.locator('.node-shell-kind-effect').filter({ hasText: 'Macroblocks' }).first();
  await expect(macroblocksNode).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.node-props-panel')).toContainText('Compression');
  await expect(page.locator('.node-props-panel')).toContainText('Macroblocks');

  const layer = await getStoredLayerBy(page, 'name', 'Macroblocks');
  expect(layer).toMatchObject({ kind: 'effect', preset: 'macroblocks', badStream: 72, badStreamBlockSize: 64 });
});

test('node add menu can add poster text starts', async ({ page }) => {
  await gotoDocument(page, wideNodeDocument);
  await openNodeAddMenuWithSearch(page, 'poster type');
  await expect(page.locator('.add-library-node-menu img[alt="Poster Type preview"]')).toBeVisible({ timeout: 15_000 });
  await clickEditorControl(page.getByRole('button', { name: /^T Poster Type/ }));

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

test('v0.35 graph nodes mount and select without recursive React updates', async ({ page }) => {
  await gotoDocument(page, v035NodeSmokeDocument);
  await switchToNodeView(page);

  const lineFieldNode = page.getByRole('group', { name: /Line Field Smoke, lineField node/ });
  const maskNode = page.getByRole('group', { name: /Mask Smoke, mask node/ });
  const transformNode = page.getByRole('group', { name: /Transform Smoke, transform node/ });
  const shadowNode = page.getByRole('group', { name: /Grime Shadow Smoke, shadow node/ });
  const repeatNode = page.getByRole('group', { name: /Repeat Smoke, repeat node/ });

  await expect(lineFieldNode).toBeVisible({ timeout: 15_000 });
  await expect(maskNode).toBeVisible();
  await expect(transformNode).toBeVisible();
  await expect(shadowNode).toBeVisible();
  await expect(repeatNode).toBeVisible();

  await selectGraphNodeById(page, 'v035-mask');
  await expect(page.locator('.node-props-panel')).toContainText('Mask Smoke');
  await selectGraphNodeById(page, 'v035-transform');
  await expect(page.locator('.node-props-panel')).toContainText('Transform Smoke');
  await page.waitForTimeout(700);
  await selectGraphNodeById(page, 'v035-shadow');
  await expect(page.locator('.node-props-panel')).toContainText('Grime Shadow Smoke');
  await selectGraphNodeById(page, 'v035-repeat');
  await expect(page.locator('.node-props-panel')).toContainText('Repeat Smoke');

  await switchToLayerView(page);
  await expectLayerCanvasToHavePixels(page);
});

test('node add menu can add material nodes with previews and inspector controls', async ({ page }) => {
  await gotoDocument(page, wideNodeDocument);
  await openNodeAddMenuWithSearch(page, 'material', { waitForExportNode: true });
  const materialMenuRow = page.getByRole('button', { name: /^◒ PBR Material/ });
  await expect(materialMenuRow).toBeVisible({ timeout: 15_000 });
  await materialMenuRow.hover();
  await expect(page.locator('.add-library-node-menu img[alt="PBR Material preview"]')).toBeVisible({ timeout: 15_000 });
  await clickEditorControl(materialMenuRow);

  const materialNode = page.locator('.node-shell-kind-material').filter({ hasText: 'PBR Material' }).first();
  await expect(materialNode).toBeVisible({ timeout: 15_000 });
  await materialNode.click();
  await expect(page.locator('.node-props-panel')).toContainText('Material');
  await expect(page.locator('.node-props-panel')).toContainText('PBR Material');
  await expect(page.locator('.node-props-panel')).toContainText('Metallic');

  const graphState = await page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
    const node = doc.graph?.materialNodes?.find(
      (item: { name?: string; materialPreset?: string }) => item.name === 'PBR Material',
    );
    return {
      name: node?.name,
      preset: node?.materialPreset,
      metalness: node?.materialMetalness,
      roughness: node?.materialRoughness,
      edgeCount: doc.graph?.edges?.length ?? 0,
    };
  });

  expect(graphState).toMatchObject({ name: 'PBR Material', preset: 'matte', metalness: 0.18, roughness: 0.38 });
  expect(graphState.edgeCount).toBeGreaterThan(0);
});

test('node add menu can drag an effect onto the canvas', async ({ page }) => {
  const pixelateMenuRow = await openPixelateNodeAddMenu(page);
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

  await expectPixelateNode(page);
  await expect(page.locator('.add-library-node-menu')).toHaveCount(0);
});

test('node add menu can drag an effect onto an edge and split it', async ({ page }) => {
  let pixelateMenuRow = await openPixelateNodeAddMenu(page);
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

  let graphState = await waitForPixelateEdgeInsertion(page, 4_000);
  if (!graphState.pixelateId) {
    await openNodeAddMenuWithSearch(page, 'pixelate', { waitForExportNode: true });
    pixelateMenuRow = page.getByRole('button', { name: /^▦ Pixelate/ });
    await expect(pixelateMenuRow).toContainText('Drag');
    await pixelateMenuRow.dragTo(page.locator('.react-flow__pane'), { targetPosition });
    graphState = await waitForPixelateEdgeInsertion(page, 15_000);
  }

  const pixelateNode = await expectPixelateNode(page);
  expect(graphState).toMatchObject({ removedOriginal: true, hasBefore: true, hasAfter: true });
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
  await openNodeAddMenuWithSearch(page, 'ai image');
  await clickEditorControl(page.getByRole('button', { name: /^◧ AI Image/ }));

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
  await openNodeAddMenuWithSearch(page, 'ai image');
  await clickEditorControl(page.getByRole('button', { name: /^◧ AI Image/ }));

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
  await gotoDocument(page, aiRunningLayerDocument);
  await switchToNodeView(page);

  const aiNode = page.locator('.node-shell-kind-image').filter({ hasText: 'AI Image' }).first();
  await expect(aiNode.locator('.node-ai-status-overlay')).toContainText('Generating', { timeout: 15_000 });
});

test('AI image node keeps generation progress visible while selected', async ({ page }) => {
  await gotoDocument(page, aiReplacingLayerDocument);
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
  await gotoDocument(page, aiRunningLayerDocument);

  const row = page.locator('.layer-row').filter({ hasText: 'AI Image' }).first();
  await expect(row.locator('.layer-ai-status')).toContainText('Generating', { timeout: 15_000 });
});

test('AI image node keeps generated image history and can switch variants', async ({ page }) => {
  await gotoDocument(page, aiImageHistoryDocument);

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
  await expectStoredAiImageLayerState(page, 'ai-history-layer', {
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
  await mockEnabledAiAccess(page);
  await mockSuccessfulAiGeneration(page, prompt);

  const { panel } = await openExistingAiImageNodePanel(page);
  await panel.locator('[data-ai-generation-prompt]').fill(prompt);
  await panel.getByRole('button', { name: 'Replace Image' }).click();

  await expect(panel.locator('.ai-generation-history-count')).toHaveText('2/2', { timeout: 15_000 });
  await panel.getByRole('button', { name: 'Previous generated image' }).click();
  await expect(panel.locator('.ai-generation-history-count')).toHaveText('1/2');
  await expectStoredAiImageLayerState(page, 'ai-existing-layer', {
    index: 0,
    prompt: 'first generated cover',
    historyPrompts: ['first generated cover', prompt],
  });
});

test('AI image node supports multiple generations in the same node across reload', async ({ page }) => {
  const prompts = ['second generated cover', 'third generated cover'];
  await mockEnabledAiAccess(page);
  await mockSequentialSuccessfulAiGenerations(page, prompts);

  const { aiNode, panel } = await openExistingAiImageNodePanel(page);

  for (let index = 0; index < prompts.length; index += 1) {
    await panel.locator('[data-ai-generation-prompt]').fill(prompts[index]);
    await panel.getByRole('button', { name: 'Replace Image' }).click();
    await expect(panel.locator('.ai-generation-history-count')).toHaveText(`${index + 2}/${index + 2}`, {
      timeout: 15_000,
    });
    await expect(aiNode.locator('.node-ai-history-badge')).toHaveText(`${index + 2}/${index + 2}`);
    await expect(aiNode.locator('.node-ai-status-overlay')).toHaveCount(0);
  }

  await expectStoredAiImageLayerState(page, 'ai-existing-layer', {
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
  await expectStoredAiImageLayerState(page, 'ai-existing-layer', {
    index: 1,
    prompt: 'second generated cover',
    srcMatchesSelectedVariant: true,
  });
});

test('AI image node leaves loading state when completed asset import fails', async ({ page }) => {
  const prompt = 'replacement missing asset cover';
  await mockEnabledAiAccess(page);
  await page.route('**/api/ai/generations', async (route) => {
    const body = await readAiGenerationPost(route, prompt);
    if (!body) return;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        ...mockSucceededAiGenerationPayload(body, {
          jobId: 'browser-ai-import-failed-job',
          assetId: 'browser-ai-import-failed-asset',
          uri: '/api/generated/missing.png',
        }),
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
  const { aiNode, panel } = await openExistingAiImageNodePanel(page);
  await panel.locator('[data-ai-generation-prompt]').fill(prompt);
  await panel.getByRole('button', { name: 'Replace Image' }).click();

  await expect(aiNode.locator('.node-ai-status-overlay')).toContainText('Failed', { timeout: 15_000 });
  await expect(panel).toContainText('Only image blobs can be stored as image assets');
  await expect
    .poll(async () => (await getStoredLayerBy(page, 'id', 'ai-existing-layer'))?.aiGeneration?.status)
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
    await mockEnabledAiAccess(page);
    await mockSuccessfulAiGeneration(page, prompt);

    await generateAiImageFromSidebar(page, prompt);

    await expectGeneratedImageLayer(page, prompt, { canvas: true, currentPrompt: true, exportDownload: true });
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
    await mockEnabledAiAccess(page, { used: 4, remaining: 6 });
    await mockPolledAiGeneration(page, prompt);

    await generateAiImageFromSidebar(page, prompt);

    await expectGeneratedImageLayer(page, prompt);
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
    await page.locator('.empty-canvas-start').getByRole('button', { name: 'AI image' }).click();

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
    await mockEnabledAiAccess(page, { used: 1, remaining: 9 });
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

    const panel = await generateAiImageFromSidebar(page, 'failed noisy cover');

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
    await gotoDocument(page, aiFailedImageDocument);
    await switchToNodeView(page);

    const aiNode = page.locator('.node-shell-kind-image').filter({ hasText: 'AI Image' }).first();
    await aiNode.click();
    await expect(aiNode.locator('.node-ai-status-overlay')).toContainText('Failed');
    await expect(page.locator('.node-props-panel .ai-generation-provenance')).toHaveCount(1);

    await expectImageExportDownload(page);
    await expect(page.getByText('Oops!')).toHaveCount(0);
  });
});

test.describe('node preview aspect ratio flow', () => {
  test.skip(
    ({ browserName }) => browserName === 'webkit',
    'WebKit full-suite navigation flakes on this aspect-ratio doc flow.',
  );

  test('layer preview display preserves wide document aspect ratio', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 1000 });
    await gotoDocument(page, wideNodeDocument);
    await switchToLayerView(page);

    const canvasArea = page.locator('.canvas-area').first();
    const previewCanvas = page.locator('.pixi-container canvas').first();
    await expect(previewCanvas).toBeVisible({ timeout: 15_000 });

    await expect.poll(async () => frameRatio(canvasArea), { timeout: 15_000 }).toBeCloseTo(16 / 9, 2);
    await expect.poll(async () => frameRatio(previewCanvas), { timeout: 15_000 }).toBeCloseTo(16 / 9, 2);
    await expect
      .poll(async () => canvasArea.evaluate((element) => element.getBoundingClientRect().height))
      .toBeLessThan(400);
    await expect
      .poll(
        async () =>
          previewCanvas.evaluate((element) => {
            const canvas = element as HTMLCanvasElement;
            return canvas.width / Math.max(1, canvas.height);
          }),
        { timeout: 15_000 },
      )
      .toBeCloseTo(16 / 9, 2);
  });

  test('node previews respect document aspect ratio', async ({ page }) => {
    await gotoDocument(page, wideNodeDocument);
    await switchToNodeView(page);

    const wideFrame = page.locator('.node-shell-kind-fill .node-thumbnail-frame').first();
    await expect(wideFrame).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => frameRatio(wideFrame), { timeout: 15_000 }).toBeGreaterThan(1.5);

    await gotoDocument(page, tallNodeDocument);
    await switchToNodeView(page);

    const tallFrame = page.locator('.node-shell-kind-fill .node-thumbnail-frame').first();
    await expect(tallFrame).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => frameRatio(tallFrame), { timeout: 15_000 }).toBeLessThan(0.75);
  });
});

test('selected layer nodes can be muted with keyboard shortcut', async ({ page }) => {
  await gotoDocument(page, wideNodeDocument);
  await switchToNodeView(page);

  const fillNode = await selectFirstNodeByKind(page, 'fill');
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
  await gotoDocument(page, wideNodeDocument);
  await switchToNodeView(page);

  await selectFirstNodeByKind(page, 'fill');

  await clickEditorControl(page.getByRole('button', { name: 'Create area from selected nodes' }));
  await expect(page.locator('.node-area')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.node-area-label')).toContainText('Area 1');

  await switchToLayerView(page);
  await expect(page.locator('.layer-area-folder')).toContainText('Area 1');
});

test('layer area folders collapse and summarize graph-only nodes', async ({ page }) => {
  await gotoDocument(page, areaMergeDocument);

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
  await gotoDocument(page, areaExtendDocument);

  await page.locator('.layer-row').filter({ hasText: 'Area noise' }).click();
  await expect(page.getByText('Noise fills the canvas')).toBeVisible({ timeout: 15_000 });
});

test('layers can create areas from multi-selected rows', async ({ page }) => {
  await gotoDocument(page, layerAreaCreationDocument);

  await page.locator('.layer-row').filter({ hasText: 'Backdrop' }).click();
  await page
    .locator('.layer-row')
    .filter({ hasText: 'Type wash' })
    .click({ modifiers: ['Shift'] });

  await expect(page.locator('.layer-selection-actions')).toContainText('2 selected');
  await page.locator('.layer-selection-actions').getByRole('button', { name: 'Area' }).click();

  await expect(page.locator('.layer-area-folder')).toContainText('Area 1');
  await expect(page.locator('.layer-area-folder')).toContainText('2');
  await expectStoredAreaNodeIds(page, ['layer-area-backdrop', 'layer-area-type'], { containing: true });
});

test('layer area folders can be renamed', async ({ page }) => {
  await gotoDocument(page, areaMergeDocument);

  const folder = page.locator('.layer-area-folder').first();
  await folder.getByRole('button', { name: /Rename Area 1/ }).click();
  const input = folder.getByRole('textbox', { name: /Rename Area 1/ });
  await input.fill('Print Stack');
  await input.press('Enter');

  await expect(folder).toContainText('Print Stack');
  await expect.poll(async () => (await getStoredGraphArea(page))?.name).toBe('Print Stack');
});

test('layers can add rows to an existing area from the context menu', async ({ page }) => {
  await gotoDocument(page, areaExtendDocument);

  await addAreaNoiseToAreaFromLayerContext(page);

  await expect(page.locator('.layer-area-folder')).toHaveCount(1);
  await expect(page.locator('.layer-area-folder')).toContainText('2');
  await expect
    .poll(async () => (await getStoredGraphArea(page))?.nodeIds ?? [])
    .toEqual(expect.arrayContaining(['area-fill', 'area-noise']));
});

test('selected area can be extended without stacking memberships', async ({ page }) => {
  await gotoDocument(page, areaExtendDocument);

  await addAreaNoiseToAreaFromLayerContext(page);
  await switchToNodeView(page);

  await expect(page.locator('.node-area')).toHaveCount(1);
  await expect(page.locator('.node-area-label')).toContainText('2');

  await switchToLayerView(page);
  await expect(page.locator('.layer-area-folder')).toHaveCount(1);
  await expect(page.locator('.layer-area-folder')).toContainText('2');
  await expect(page.locator('.layer-area-more')).toHaveCount(0);

  await page.getByRole('button', { name: /Hide Area 1/ }).click();
  await expectStoredAreaLayerVisibility(page, ['area-fill', 'area-noise'], false);

  await page.getByRole('button', { name: /Show Area 1/ }).click();
  await expectStoredAreaLayerVisibility(page, ['area-fill', 'area-noise'], true);
});

test('dragging a node away from its area separates the node', async ({ page }) => {
  await gotoDocument(page, areaSeparationDocument);
  await switchToNodeView(page);

  const { nodeBox } = await getVisibleNoiseNodeBox(page);

  await dragMouseFromPoint(page, { x: nodeBox.x + 48, y: nodeBox.y + 22 }, { x: 0, y: 498 }, 10);

  await expectStoredAreaNodeIds(page, ['area-fill']);
});

test('dragging a layer row out of an area separates the layer', async ({ page }) => {
  await gotoDocument(page, areaSeparationDocument);

  const source = page.locator('.layer-area-folder .layer-row-nested').filter({ hasText: 'Area noise' }).first();
  const target = page.locator('.layer-row').filter({ hasText: 'Outside fill' }).first();
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();

  await source.dragTo(target);

  await expect(page.locator('.layer-area-folder').first().locator('.layer-area-count')).toHaveText('1 layer');
  await expectStoredAreaNodeIds(page, ['area-fill']);
});

test('nodes stay visible while dragging inside an area', async ({ page }) => {
  await gotoDocument(page, areaExtendDocument);
  await switchToNodeView(page);

  const { noiseNode, nodeBox } = await getVisibleNoiseNodeBox(page);

  await dragMouseFromPoint(page, { x: nodeBox.x + 48, y: nodeBox.y + 22 }, { x: 132, y: 48 }, 8, {
    release: false,
  });

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
  await gotoDocument(page, wideNodeDocument);
  await switchToNodeView(page);

  const fillNode = page.locator('.react-flow__node').filter({ has: page.locator('.node-shell-kind-fill') });
  await expect(fillNode).toHaveCount(1);
  const sourceHandle = fillNode.locator('.react-flow__handle-right');
  await expect(sourceHandle).toHaveCount(1);
  const box = await sourceHandle.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await dragMouseFromBoxCenter(page, box, { x: 280, y: -120 }, 8);

  const menu = page.locator('.nadd-surface');
  await expect(menu).toBeVisible({ timeout: 15_000 });
  await menu.getByRole('button', { name: /Fill/i }).click();

  await expect.poll(async () => page.locator('.react-flow__node').count(), { timeout: 15_000 }).toBeGreaterThan(2);
  await expect.poll(async () => page.locator('.react-flow__edge').count(), { timeout: 15_000 }).toBeGreaterThan(1);
});

test('connecting to a merge node inside an area does not recurse node updates', async ({ page }) => {
  await gotoDocument(page, areaMergeDocument);
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

  await dragMouseFromPoint(
    page,
    { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 },
    {
      x: targetBox.x + targetBox.width / 2 - (sourceBox.x + sourceBox.width / 2),
      y: targetBox.y + targetBox.height / 2 - (sourceBox.y + sourceBox.height / 2),
    },
    10,
  );

  await expect(page.getByText('Oops!')).toHaveCount(0);
  await expect.poll(async () => page.locator('.react-flow__edge').count(), { timeout: 15_000 }).toBeGreaterThan(1);
});

test('text node can be dragged repeatedly without crashing', async ({ page }) => {
  await gotoDocument(page, textDragDocument);
  await switchToNodeView(page);

  const textNode = page.locator('.node-shell-kind-text').first();
  await expect(textNode).toBeVisible({ timeout: 15_000 });
  await textNode.click();

  const overlay = textNode.locator('.node-drag-overlay');
  const box = await visibleBoundingBox(overlay);

  const dragStart = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  let dragStep = 0;
  while (dragStep < 12) {
    await page.mouse.move(dragStart.x + 18 * dragStep, dragStart.y + (dragStep % 2 === 0 ? 64 : -64));
    dragStep += 1;
  }
  await page.mouse.up();

  await expect(page.getByText('Oops!')).toHaveCount(0);
  await expect(page.locator('.node-canvas-root')).toBeVisible();
});

test('image transform gestures stay local to the selected node', async ({ page }) => {
  await gotoDocument(page, imageDragDocument);
  await switchToNodeView(page);

  const imageNode = page.locator('.node-shell-kind-image').first();
  await expect(imageNode).toBeVisible({ timeout: 15_000 });
  await imageNode.click();

  await expect(imageNode.locator('.node-live-media-overlay')).toHaveCount(0);
  await expect(imageNode.locator('.node-thumbnail-canvas')).toBeVisible({ timeout: 15_000 });

  const overlay = imageNode.locator('.node-drag-overlay');
  const box = await visibleBoundingBox(overlay);

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
  await gotoDocument(page, imageDragDocument);
  await expectLayerCanvasToHavePixels(page);

  await expectStoredImageLayerAssetUri(page);

  const storedDoc = await page.evaluate(() => localStorage.getItem('doc') ?? '');
  expect(storedDoc).not.toContain('data:image/');

  await page.reload();
  await expectLayerCanvasToHavePixels(page);
});

test('empty transparent documents render transparent pixels over checkerboard chrome', async ({ page }) => {
  await gotoDocument(page, emptyTransparentDocument);

  const canvas = page.locator('.pixi-container canvas').first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expectCanvasCenterAlpha(page, 0);

  await expect
    .poll(async () => page.locator('.pixi-container').evaluate((element) => getComputedStyle(element).backgroundImage))
    .toContain('linear-gradient');
});

async function expectCanvasCenterAlpha(page: Page, alpha: number) {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>('.pixi-container canvas');
          if (!canvas) return 255;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx || canvas.width <= 0 || canvas.height <= 0) return 255;
          return ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data[3] ?? 255;
        }),
      { timeout: 15_000 },
    )
    .toBe(alpha);
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

async function mockEnabledAiAccess(page: Page, quota: { used: number; remaining: number } = { used: 3, remaining: 7 }) {
  await mockAiAccess(page, {
    authenticated: true,
    enabled: true,
    providers: ['openai'],
    quota: { period: '2026-05', limit: 10, used: quota.used, remaining: quota.remaining },
    user: { id: 'dev-user', role: 'admin' },
  });
}

async function openExistingAiImageNodePanel(page: Page) {
  await gotoDocument(page, aiExistingImageDocument);
  await switchToNodeView(page);
  const aiNode = page.locator('.node-shell-kind-image').filter({ hasText: 'AI Image' }).first();
  await aiNode.click();
  const panel = page.locator('.node-props-panel');
  await expect(panel.locator('[data-ai-generation-prompt]')).toBeVisible({ timeout: 15_000 });
  return { aiNode, panel };
}

async function generateAiImageFromSidebar(page: Page, prompt: string) {
  await page.goto('/app?new=blank');
  await page.locator('.empty-canvas-start').getByRole('button', { name: 'AI image' }).click();
  const panel = page.locator('.sidebar .ai-generation-panel').first();
  await expect(panel.locator('[data-ai-generation-prompt]')).toBeVisible({ timeout: 15_000 });
  await panel.locator('[data-ai-generation-prompt]').fill(prompt);
  await panel.getByRole('button', { name: 'Generate' }).click();
  return panel;
}

async function openNodeAddMenuWithSearch(page: Page, query: string, options: { waitForExportNode?: boolean } = {}) {
  await switchToNodeView(page);
  if (options.waitForExportNode) {
    await expect(page.locator('.node-shell-kind-export')).toBeVisible({ timeout: 15_000 });
  }
  await clickEditorControl(page.getByRole('button', { name: 'Add node' }));
  await page.getByLabel('Search nodes and effects').fill(query);
}

async function readAiGenerationPost(route: Route, expectedPrompt: string) {
  const request = route.request();
  if (request.method() !== 'POST') {
    await route.fallback();
    return null;
  }
  const body = request.postDataJSON() as { prompt?: string; provider?: string; settings?: { quality?: string } };
  expect(body.prompt).toBe(expectedPrompt);
  return body;
}

async function mockSuccessfulAiGeneration(page: Page, expectedPrompt: string) {
  await page.route('**/api/ai/generations', async (route) => {
    const body = await readAiGenerationPost(route, expectedPrompt);
    if (!body) return;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(
        mockSucceededAiGenerationPayload(body, {
          jobId: 'browser-ai-job-1',
          assetId: 'browser-ai-asset-1',
          uri: generatedImageDataUrl,
        }),
      ),
    });
  });
}

async function mockSequentialSuccessfulAiGenerations(page: Page, expectedPrompts: string[]) {
  let requestIndex = 0;
  await page.route('**/api/ai/generations', async (route) => {
    const expectedPrompt = expectedPrompts[requestIndex];
    const body = await readAiGenerationPost(route, expectedPrompt ?? '');
    if (!body) return;
    requestIndex += 1;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(
        mockSucceededAiGenerationPayload(body, {
          jobId: `browser-ai-sequence-job-${requestIndex}`,
          assetId: `browser-ai-sequence-asset-${requestIndex}`,
          uri: requestIndex % 2 === 0 ? testImageSrc : generatedImageDataUrl,
          mimeType: requestIndex % 2 === 0 ? 'image/svg+xml' : 'image/png',
          createdAt: `2026-05-21T00:00:0${requestIndex}.000Z`,
          completedAt: `2026-05-21T00:00:0${requestIndex}.500Z`,
          quota: { period: '2026-05', limit: 10, used: 4 + requestIndex, remaining: 6 - requestIndex },
        }),
      ),
    });
  });
}

function mockSucceededAiGenerationPayload(
  body: { prompt?: string; provider?: string; settings?: { quality?: string } },
  options: {
    jobId: string;
    assetId: string;
    uri: string;
    mimeType?: string;
    createdAt?: string;
    completedAt?: string;
    quota?: { period: string; limit: number; used: number; remaining: number };
  },
) {
  const provider = body.provider ?? 'openai';
  const settings = { aspect: '1:1', quality: body.settings?.quality ?? 'standard' };
  const createdAt = options.createdAt ?? '2026-05-21T00:00:00.000Z';
  return {
    id: options.jobId,
    status: 'succeeded',
    provider,
    model: 'mock-image-model',
    prompt: body.prompt,
    settings,
    asset: {
      id: options.assetId,
      uri: options.uri,
      mimeType: options.mimeType ?? 'image/png',
      width: 1,
      height: 1,
      sizeBytes: 70,
      createdAt,
      metadata: {
        provider,
        model: 'mock-image-model',
        prompt: body.prompt,
        settings,
        createdAt,
      },
    },
    quota: options.quota ?? { period: '2026-05', limit: 10, used: 4, remaining: 6 },
    createdAt,
    completedAt: options.completedAt ?? '2026-05-21T00:00:01.000Z',
  };
}

async function mockPolledAiGeneration(page: Page, expectedPrompt: string) {
  let pollCount = 0;
  await page.route('**/api/ai/generations**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      await fulfillPolledGenerationPost(route, expectedPrompt);
      return;
    }

    if (request.method() === 'GET' && request.url().includes('/api/ai/generations/browser-ai-polled-job')) {
      pollCount += 1;
      await fulfillPolledGenerationGet(route, expectedPrompt, pollCount >= 2);
      return;
    }

    await route.fallback();
  });
}

async function fulfillPolledGenerationPost(route: Route, expectedPrompt: string) {
  const body = await readAiGenerationPost(route, expectedPrompt);
  if (!body) return;
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
}

function polledGenerationAsset(expectedPrompt: string) {
  return {
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
  };
}

async function fulfillPolledGenerationGet(route: Route, expectedPrompt: string, succeeded: boolean) {
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
      ...(succeeded ? { asset: polledGenerationAsset(expectedPrompt), completedAt: '2026-05-21T00:00:02.000Z' } : {}),
      createdAt: '2026-05-21T00:00:00.000Z',
      startedAt: '2026-05-21T00:00:01.000Z',
    }),
  });
}

async function getCanvasCenterRgb(page: Page) {
  return getCanvasRgbAt(page, 0.5, 0.5);
}

async function getStoredLayers(page: Page) {
  return page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
    return doc.layers ?? [];
  });
}

async function expectStoredLayerSummaries(page: Page, expected: Array<{ name: string; kind: string }>) {
  await expect
    .poll(
      async () =>
        (await getStoredLayers(page)).map((layer: { name: string; kind: string }) => ({
          name: layer.name,
          kind: layer.kind,
        })),
      { timeout: 15_000 },
    )
    .toEqual(expected);
}

async function getStoredLayerBy(page: Page, key: 'id' | 'name', value: string) {
  return (await getStoredLayers(page)).find((layer: Record<string, unknown>) => layer[key] === value);
}

async function getStoredRecoveryLayerId(page: Page) {
  return page.evaluate(
    () =>
      new Promise<string | null>((resolve) => {
        const request = indexedDB.open('artifact-local-projects');
        request.onerror = () => resolve(null);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('drafts', 'readonly');
          const getRequest = transaction.objectStore('drafts').get('pre-blank');
          getRequest.onerror = () => resolve(null);
          getRequest.onsuccess = () => {
            const record = getRequest.result as { doc?: { layers?: Array<{ id?: string }> } } | undefined;
            resolve(record?.doc?.layers?.[0]?.id ?? null);
          };
          transaction.oncomplete = () => db.close();
        };
      }),
  );
}

async function getStoredGraphArea(page: Page) {
  return page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
    return doc.graph?.areas?.[0] ?? null;
  });
}

async function expectStoredLayerField(
  page: Page,
  lookup: { key: 'id' | 'name'; value: string },
  field: string,
  expected: unknown,
) {
  await expect
    .poll(
      async () => {
        const layer = await getStoredLayerBy(page, lookup.key, lookup.value);
        return layer?.[field];
      },
      { timeout: 15_000 },
    )
    .toBe(expected);
}

async function getVisibleLayerRow(page: Page, text: string) {
  const row = page.locator('.layer-row').filter({ hasText: text }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  return row;
}

async function chooseLayerRowAction(page: Page, row: Locator, action: string) {
  const menu = await openLayerRowActions(page, row);
  await menu.getByRole('menuitem', { name: action }).click();
}

async function openLayerRowActions(page: Page, row: Locator) {
  await row.hover();
  await row
    .getByLabel(/Open actions for layer/)
    .first()
    .click();
  const menu = page.locator('.layer-context-menu');
  await expect(menu).toBeVisible({ timeout: 5_000 });
  return menu;
}

async function hideLayerFromRowMenu(page: Page, row: Locator) {
  await chooseLayerRowAction(page, row, 'Hide');
}

async function expectVisibleLayerRowIds(page: Page, expected: string[]) {
  await expect
    .poll(
      async () =>
        page
          .locator('.sidebar .layer-row')
          .evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.layerId)),
      { timeout: 15_000 },
    )
    .toEqual(expected);
}

async function expectStoredGraphEdges(page: Page, expected: string[]) {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          return doc.graph?.edges?.map((edge: { fromId: string; toId: string }) => `${edge.fromId}->${edge.toId}`);
        }),
      { timeout: 15_000 },
    )
    .toEqual(expected);
}

async function expectStoredGraphLayerOrder(
  page: Page,
  expected: { layerIds: string[]; graphEdges: string[]; leftNodeId: string; rightNodeId: string },
) {
  await expect
    .poll(
      async () =>
        page.evaluate(({ leftNodeId, rightNodeId }) => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          const positions = doc.graph?.positions ?? {};
          return {
            layerIds: doc.layers?.map((layer: { id: string }) => layer.id),
            graphEdges: doc.graph?.edges?.map(
              (edge: { fromId: string; toId: string }) => `${edge.fromId}->${edge.toId}`,
            ),
            leftBeforeRight: positions[leftNodeId]?.x < positions[rightNodeId]?.x,
          };
        }, expected),
      { timeout: 15_000 },
    )
    .toEqual({
      layerIds: expected.layerIds,
      graphEdges: expected.graphEdges,
      leftBeforeRight: true,
    });
}

async function expectStoredStarterDocument(
  page: Page,
  expected: { aspect: string; layerIds: string[]; textFonts?: string[] },
) {
  await expect
    .poll(
      async () =>
        page.evaluate((includeTextFonts) => {
          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          const state: { aspect?: string; hasGraph: boolean; layerIds: string[]; textFonts?: string[] } = {
            aspect: doc.global?.aspect,
            hasGraph: Boolean(doc.graph),
            layerIds: doc.layers?.map((layer: { id: string }) => layer.id) ?? [],
          };
          if (includeTextFonts) {
            const textLayers = doc.layers?.filter((layer: { kind: string }) => layer.kind === 'text') ?? [];
            state.textFonts = textLayers.map((layer: { font: string }) => layer.font);
          }
          return state;
        }, Boolean(expected.textFonts)),
      { timeout: 15_000 },
    )
    .toEqual({ ...expected, hasGraph: false });
}

async function addTitleTypeLayer(page: Page) {
  await page.locator('.layer-panel-header').getByRole('button', { name: 'Add layer' }).click();
  const search = page.getByLabel('Search layers and effects');
  await expect(search).toBeVisible({ timeout: 15_000 });
  await search.fill('headline');
  await page.getByRole('button', { name: /^T Title Type/ }).click();
  const titleRow = page.locator('.layer-row').filter({ hasText: 'Title Type' }).first();
  await expect(titleRow).toBeVisible({ timeout: 15_000 });
  await titleRow.click();
  return titleRow;
}

async function insertLayerAbove(page: Page, targetLayerText: string, addLibraryLabel: RegExp) {
  const targetRow = page.locator('.layer-row').filter({ hasText: targetLayerText }).first();
  await expect(targetRow).toBeVisible({ timeout: 15_000 });
  await targetRow.hover();
  await targetRow.getByRole('button', { name: new RegExp(`Insert layer above ${targetLayerText}`) }).click();
  await page
    .locator('.add-library-row')
    .filter({ has: page.locator('.add-library-row-label', { hasText: addLibraryLabel }) })
    .click();
}

async function insertSourceLayerAbove(page: Page, targetLayerText: string, label: RegExp) {
  const targetRow = page.locator('.layer-row').filter({ hasText: targetLayerText }).first();
  await targetRow.hover();
  await targetRow.getByRole('button', { name: new RegExp(`Insert layer above ${targetLayerText}`) }).click();
  const quickMenu = page.locator('.add-library-layer-quick-menu');
  await quickMenu.getByRole('button', { name: 'Source', exact: true }).click();
  await quickMenu
    .locator('.add-library-row')
    .filter({ has: page.locator('.add-library-row-label', { hasText: label }) })
    .click();
}

async function expectImageExportDownload(page: Page) {
  const exportButton = page.getByRole('button', { name: 'EXPORT' });
  await expect(exportButton).toBeEnabled({ timeout: 15_000 });
  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.(png|jpe?g)$/i);
}

async function downloadJsonFromButton(page: Page, buttonName: string) {
  const downloadPromise = page.waitForEvent('download');
  await clickDownloadAction(page, buttonName);
  const download = await downloadPromise;
  const artifactPath = await download.path();
  expect(artifactPath).toBeTruthy();
  if (!artifactPath) throw new Error('Downloaded artifact path is unavailable');
  const raw = readFileSync(artifactPath, 'utf8');
  return { raw, json: JSON.parse(raw) };
}

async function clickDownloadAction(page: Page, buttonName: string) {
  const button = page.getByRole('button', { name: buttonName }).first();
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    return;
  }
  await clickShareMenuAction(page, shareMenuItemName(buttonName));
}

async function clickShareMenuAction(page: Page, itemName: string) {
  await page.getByRole('button', { name: 'Share link or download editable files' }).click();
  await page.getByRole('menuitem', { name: itemName, exact: true }).click();
}

function shareMenuItemName(buttonName: string) {
  if (buttonName === 'Save document file') return 'Download document file';
  if (buttonName === 'Save editable project package') return 'Download package + assets';
  return buttonName;
}

async function openDocumentFileFromBuffer(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.goto('/app?new=blank');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open document file' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(file);
  await page.getByRole('dialog', { name: 'Open artifact file' }).getByRole('button', { name: 'OPEN FILE' }).click();
}

async function expectStoredAiImageLayerState(page: Page, layerId: string, expected: Record<string, unknown>) {
  await expect
    .poll(
      async () =>
        page.evaluate((targetLayerId) => {
          const layerList = (doc: { layers?: unknown }) => (Array.isArray(doc.layers) ? doc.layers : []);
          const generationHistory = (image: { aiGenerationHistory?: unknown }) =>
            Array.isArray(image.aiGenerationHistory) ? image.aiGenerationHistory : [];
          const generationHistoryIndex = (image: { aiGenerationHistoryIndex?: unknown }) =>
            typeof image.aiGenerationHistoryIndex === 'number' ? image.aiGenerationHistoryIndex : -1;
          const variantPrompt = (variant: { aiGeneration?: { prompt?: string } }) => variant.aiGeneration?.prompt;
          const matchingJob = (
            currentGeneration: { jobId?: string } | undefined,
            selectedGeneration: { jobId?: string } | undefined,
          ) => Boolean(selectedGeneration?.jobId && currentGeneration?.jobId === selectedGeneration.jobId);
          const matchingSrc = (image: { src?: string }, selectedVariant: { src?: string } | undefined) =>
            Boolean(selectedVariant?.src && image.src === selectedVariant.src);

          const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
          const image = layerList(doc).find((layer: { id: string }) => layer.id === targetLayerId);
          if (!image) return {};
          const history = generationHistory(image);
          const index = generationHistoryIndex(image);
          const selectedVariant = history[index];
          const selectedGeneration = selectedVariant?.aiGeneration;
          const currentGeneration = image.aiGeneration;
          return {
            historyCount: history.length,
            index,
            prompt: currentGeneration?.prompt,
            historyPrompts: history.map(variantPrompt),
            generationMatchesSelectedVariant: matchingJob(currentGeneration, selectedGeneration),
            srcMatchesSelectedVariant: matchingSrc(image, selectedVariant),
          };
        }, layerId),
      { timeout: 15_000 },
    )
    .toMatchObject(expected);
}

async function expectStoredAreaNodeIds(page: Page, expected: string[], options: { containing?: boolean } = {}) {
  const matcher = expect.poll(async () => (await getStoredGraphArea(page))?.nodeIds ?? [], { timeout: 15_000 });
  if (options.containing) {
    await matcher.toEqual(expect.arrayContaining(expected));
    return;
  }
  await matcher.toEqual(expected);
}

async function addAreaNoiseToAreaFromLayerContext(page: Page) {
  await page.locator('.layer-row').filter({ hasText: 'Area noise' }).click({ button: 'right' });
  await expect(page.locator('.layer-context-menu')).toBeVisible();
  await page
    .locator('.layer-context-menu')
    .getByRole('menuitem', { name: /Add to Area 1/ })
    .click();
}

async function expectStoredAreaLayerVisibility(page: Page, layerIds: string[], visible: boolean) {
  await expect
    .poll(
      async () =>
        page.evaluate(
          ({ targetIds, visible }) => {
            const doc = JSON.parse(localStorage.getItem('doc') ?? '{}');
            return doc.layers
              ?.filter((layer: { id: string }) => targetIds.includes(layer.id))
              .every((layer: { visible: boolean }) => layer.visible === visible);
          },
          { targetIds: layerIds, visible },
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
}

async function getVisibleNoiseNodeBox(page: Page) {
  const noiseNode = page
    .locator('.react-flow__node')
    .filter({ has: page.locator('.node-shell-kind-noise') })
    .first();
  await expect(noiseNode).toBeVisible({ timeout: 15_000 });
  const nodeBox = await noiseNode.boundingBox();
  expect(nodeBox).not.toBeNull();
  if (!nodeBox) throw new Error('Expected a visible noise node bounding box');
  return { noiseNode, nodeBox };
}

async function dragLayerRowOverText(page: Page, sourceText: string, targetText: string, targetYRatio = 0.75) {
  await page.evaluate(
    ({ sourceText, targetText, targetYRatio }) => {
      const findLayerRowByText = (text: string) =>
        [...document.querySelectorAll<HTMLElement>('.layer-row')].find((row) => row.textContent?.includes(text));
      const dispatchLayerRowDragEvent = (
        target: HTMLElement,
        type: 'dragover' | 'drop',
        dataTransfer: DataTransfer,
      ) => {
        const rect = target.getBoundingClientRect();
        target.dispatchEvent(
          new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            clientY: rect.top + rect.height * targetYRatio,
            dataTransfer,
          }),
        );
      };
      const source = findLayerRowByText(sourceText);
      const target = findLayerRowByText(targetText);
      if (!source || !target) throw new Error(`Layer rows were not found: ${sourceText} -> ${targetText}`);
      const dataTransfer = new DataTransfer();
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
      dispatchLayerRowDragEvent(target, 'dragover', dataTransfer, targetYRatio);
    },
    { sourceText, targetText, targetYRatio },
  );
}

async function dropLayerRowOnText(page: Page, targetText: string, targetYRatio = 0.75) {
  await page.evaluate(
    ({ targetText, targetYRatio }) => {
      const target = [...document.querySelectorAll<HTMLElement>('.layer-row')].find((row) =>
        row.textContent?.includes(targetText),
      );
      if (!target) throw new Error(`Target layer row was not found: ${targetText}`);
      const dataTransfer = new DataTransfer();
      const rect = target.getBoundingClientRect();
      target.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          clientY: rect.top + rect.height * targetYRatio,
          dataTransfer,
        }),
      );
      target.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
    },
    { targetText, targetYRatio },
  );
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
