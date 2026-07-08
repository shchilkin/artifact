import { describe, expect, it } from 'vitest';
import {
  type CanvasDocument,
  DEFAULT_DOCUMENT,
  DOCUMENT_SCHEMA_VERSION,
  makeEffectLayer,
  makeFillLayer,
  makeGraphMaterialNode,
  makeGraphShaderNode,
  makeSourceLayer,
  makeTextLayer,
} from '../types/config';
import {
  ARTIFACT_FILE_EXTENSION,
  createArtifactFileName,
  createBlankDocument,
  createDocumentShareUrl,
  DOC_KEY,
  deletePreBlankDraft,
  getInitialDocumentFromSources,
  isBlankDocument,
  loadPreBlankDraft,
  normalizeDocument,
  PRE_BLANK_DRAFT_KEY,
  parseArtifactDocument,
  removeDocParamFromUrl,
  saveDocumentToStorage,
  savePreBlankDraft,
  serializeArtifactDocument,
  serializeDocument,
} from './documentPersistence';
import { EXPORT_NODE_ID } from './nodeGraph';

function encodeDoc(doc: unknown) {
  return JSON.stringify(doc);
}

describe('normalizeDocument', () => {
  it('fills missing global and export defaults', () => {
    const doc = normalizeDocument({ layers: [] });

    expect(doc.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
    expect(doc.global).toEqual(DEFAULT_DOCUMENT.global);
    expect(doc.export).toEqual(DEFAULT_DOCUMENT.export);
    expect(doc.layers).toEqual([]);
  });

  it('migrates older unversioned documents to the current schema version', () => {
    const doc = normalizeDocument({
      global: { bg: '#202020', seed: 5, aspect: '4:5' },
      layers: [makeFillLayer({ id: 'legacy-fill' })],
      export: { format: 'jpeg', scale: 2, target: 'cover' },
    });

    expect(doc.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
    expect(doc.layers[0]?.id).toBe('legacy-fill');
  });

  it('preserves supported shader kinds and normalizes legacy or unknown shader kinds', () => {
    const doc = normalizeDocument({
      layers: [],
      graph: {
        edges: [],
        positions: {},
        mergeNodes: [],
        colorNodes: [],
        shaderNodes: [
          { id: 'shader-liquid', name: 'Liquid', shaderKind: 'liquidMetal' },
          { id: 'shader-static-mesh', name: 'Static Mesh', shaderKind: 'staticMeshGradient', distortion: 44 },
          { id: 'shader-border', name: 'Border', shaderKind: 'pulsingBorder' },
          { id: 'shader-dither', name: 'Dither', shaderKind: 'imageDithering' },
          { id: 'shader-warp', name: 'Warp', shaderKind: 'warp' },
          { id: 'shader-rays', name: 'Rays', shaderKind: 'godRays' },
          { id: 'shader-tileless', name: 'Tileless', shaderKind: 'tilelessTexture' },
          { id: 'shader-unknown', name: 'Unknown', shaderKind: 'futureShader' },
        ],
      },
    });

    expect(doc.graph?.shaderNodes?.[0]?.shaderKind).toBe('liquidMetal');
    expect(doc.graph?.shaderNodes?.[0]).toMatchObject({ opacity: 58, blendMode: 'screen' });
    expect(doc.graph?.shaderNodes?.[1]?.shaderKind).toBe('meshGradient');
    expect(doc.graph?.shaderNodes?.[1]?.distortion).toBe(0);
    expect(doc.graph?.shaderNodes?.[2]?.shaderKind).toBe('borderRings');
    expect(doc.graph?.shaderNodes?.[3]?.shaderKind).toBe('dotGrid');
    expect(doc.graph?.shaderNodes?.[4]?.shaderKind).toBe('waves');
    expect(doc.graph?.shaderNodes?.[5]?.shaderKind).toBe('smokeRing');
    expect(doc.graph?.shaderNodes?.[6]?.shaderKind).toBe('tilelessTexture');
    expect(doc.graph?.shaderNodes?.[7]?.shaderKind).toBe('meshGradient');
  });

  it('normalizes custom shader specs for AI-generated shader nodes', () => {
    const doc = normalizeDocument({
      layers: [],
      graph: {
        edges: [],
        positions: {},
        mergeNodes: [],
        colorNodes: [],
        shaderNodes: [
          {
            id: 'shader-ai',
            name: 'AI Shader',
            shaderKind: 'customSpec',
            aiPrompt: 'make electric mineral smoke',
            customShaderSpec: {
              version: 1,
              palette: ['#000', 'not-a-color', '#ff00aa'],
              base: 2,
              contrast: 9,
              operations: [
                { op: 'noise', scale: 200, amount: 4, octaves: 99 },
                { op: 'rawCode', code: 'while(true){}' },
                { op: 'sourceLuma', amount: 0.45 },
                { op: 'edgeGlow', amount: 0.5, softness: 0.12 },
                { op: 'chromaticShift', amount: 0.25, angle: 42 },
                { op: 'gradientMap', amount: 0.7 },
                { op: 'posterize', steps: 999 },
              ],
            },
          },
        ],
      },
    });

    const node = doc.graph?.shaderNodes?.[0];
    expect(node?.shaderKind).toBe('customSpec');
    expect(node?.aiPrompt).toBe('make electric mineral smoke');
    expect(node?.customShaderSpec).toMatchObject({
      base: 1,
      contrast: 4,
      palette: ['#000', '#ff00aa'],
      operations: [
        { op: 'noise', scale: 40, amount: 2, octaves: 7 },
        { op: 'sourceLuma', amount: 0.45 },
        { op: 'edgeGlow', amount: 0.5, softness: 0.12 },
        { op: 'chromaticShift', amount: 0.25, angle: 42 },
        { op: 'gradientMap', amount: 0.7 },
        { op: 'posterize', steps: 16 },
      ],
    });
  });

  it('normalizes custom shader code nodes', () => {
    const doc = normalizeDocument({
      layers: [],
      graph: {
        edges: [],
        positions: {},
        mergeNodes: [],
        colorNodes: [],
        shaderNodes: [
          {
            id: 'shader-code',
            name: 'Code Shader',
            shaderKind: 'customCode',
            customShaderCode: {
              version: 3,
              language: 'javascript',
              code: 'vec4 mainImage(vec2 uv) { return vec4(uv, 0.0, 1.0); }',
            },
          },
        ],
      },
    });

    const node = doc.graph?.shaderNodes?.[0];
    expect(node?.shaderKind).toBe('customCode');
    expect(node?.customShaderCode).toEqual({
      version: 1,
      language: 'glsl-fragment',
      code: 'vec4 mainImage(vec2 uv) { return vec4(uv, 0.0, 1.0); }',
    });
  });

  it('round-trips AI custom shader nodes through artifact document JSON', () => {
    const shaderNode = makeGraphShaderNode({
      id: 'shader-ai',
      name: 'AI Waves',
      shaderKind: 'customSpec',
      aiPrompt: 'neon waves',
      customShaderSpec: {
        version: 1,
        label: 'AI Waves',
        prompt: 'neon waves',
        palette: ['#080816', '#7b61ff', '#ff4ec7', '#55f7d5'],
        operations: [
          { op: 'noise', scale: 4, amount: 0.3, octaves: 4 },
          { op: 'wave', frequency: 12, amplitude: 0.22, angle: 1.2 },
        ],
      },
    });
    const serialized = serializeArtifactDocument({
      global: { bg: 'transparent', seed: 1234, aspect: '16:9' },
      layers: [],
      graph: {
        edges: [{ id: 'e-ai-export', fromId: shaderNode.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' }],
        positions: { [shaderNode.id]: { x: 0, y: 80 }, [EXPORT_NODE_ID]: { x: 320, y: 80 } },
        mergeNodes: [],
        colorNodes: [],
        shaderNodes: [shaderNode],
      },
      export: { format: 'png', scale: 1, target: 'cover' },
    });

    const parsed = parseArtifactDocument(serialized);
    const parsedNode = parsed?.graph?.shaderNodes?.[0];

    expect(parsedNode).toMatchObject({
      id: 'shader-ai',
      name: 'AI Waves',
      shaderKind: 'customSpec',
      aiPrompt: 'neon waves',
      customShaderSpec: {
        label: 'AI Waves',
        prompt: 'neon waves',
        operations: [
          { op: 'noise', scale: 4, amount: 0.3, octaves: 4 },
          { op: 'wave', frequency: 12, amplitude: 0.22, angle: 1.2 },
        ],
      },
    });
    expect(parsed?.graph?.edges).toContainEqual({
      id: 'e-ai-export',
      fromId: 'shader-ai',
      fromPort: 'out',
      toId: EXPORT_NODE_ID,
      toPort: 'in',
    });
  });

  it('normalizes portable imported font assets without keeping invalid payloads', () => {
    const doc = normalizeDocument({
      layers: [makeTextLayer({ font: 'artifact-font://poster-local' })],
      fontAssets: [
        {
          id: 'poster-local',
          dataUrl: 'data:font/woff2;base64,AAAA',
          mime: 'font/woff2',
          bytes: 128,
          label: 'Poster Local',
          family: 'Artifact Imported Poster Local',
          createdAt: '2026-05-25T00:00:00.000Z',
        },
        { id: 'broken', dataUrl: 'not-a-data-url' },
      ],
    });

    expect(doc.fontAssets).toHaveLength(1);
    expect(doc.fontAssets?.[0]).toMatchObject({ id: 'poster-local', label: 'Poster Local' });
  });

  it('normalizes portable imported model assets without keeping invalid payloads', () => {
    const doc = normalizeDocument({
      layers: [makeSourceLayer('model', { modelSrc: 'artifact-model://model-a' })],
      modelAssets: [
        {
          id: 'model-a',
          dataUrl: 'data:model/gltf-binary;base64,AAAA',
          mime: 'model/gltf-binary',
          bytes: 512,
          label: 'skull.glb',
          createdAt: '2026-06-13T00:00:00.000Z',
        },
        { id: 'broken', dataUrl: 'not-a-data-url' },
      ],
    });

    expect(doc.modelAssets).toHaveLength(1);
    expect(doc.modelAssets?.[0]).toMatchObject({ id: 'model-a', label: 'skull.glb' });
  });

  it('normalizes portable environment assets without keeping invalid payloads', () => {
    const doc = normalizeDocument({
      layers: [],
      graph: {
        edges: [],
        positions: {},
        mergeNodes: [],
        environmentNodes: [{ id: 'env-node-a', name: 'Environment Map', environmentSrc: 'artifact-env://env-a' }],
      },
      envAssets: [
        {
          id: 'env-a',
          dataUrl: 'data:image/x-exr;base64,AAAA',
          mime: 'image/x-exr',
          bytes: 1024,
          label: 'studio.exr',
          createdAt: '2026-06-13T00:00:00.000Z',
        },
        { id: 'broken', dataUrl: 'not-a-data-url' },
      ],
    });

    expect(doc.envAssets).toHaveLength(1);
    expect(doc.envAssets?.[0]).toMatchObject({ id: 'env-a', label: 'studio.exr' });
    expect(doc.graph?.environmentNodes?.[0]).toMatchObject({
      id: 'env-node-a',
      environmentSrc: 'artifact-env://env-a',
      environmentName: '',
      environmentBytes: 0,
    });
  });

  it('falls back to the default aspect when stored aspect is invalid', () => {
    const doc = normalizeDocument({
      global: { bg: '#ffffff', seed: 7, aspect: 'poster' },
      layers: [],
    });

    expect(doc.global).toEqual({ bg: '#ffffff', seed: 7, aspect: '1:1' });
  });

  it('migrates legacy source layers to their concrete procedural kind', () => {
    const doc = normalizeDocument({
      layers: [
        {
          id: 'legacy-source',
          name: 'Legacy source',
          kind: 'source',
          sourceType: 'noise',
          visible: true,
          locked: false,
        },
      ],
    });

    expect(doc.layers[0]).toMatchObject({
      id: 'legacy-source',
      kind: 'noise',
      seedOffset: 0,
      noiseWarp: 0,
      noiseTurbulence: 0,
      noiseThreshold: 0,
    });
  });

  it('adds model source defaults when loading older model layers', () => {
    const doc = normalizeDocument({
      layers: [
        {
          id: 'model-a',
          name: 'Model',
          kind: 'model',
          visible: true,
          locked: false,
          modelSrc: 'artifact-model://asset-a',
        },
      ],
    });

    expect(doc.layers[0]).toMatchObject({
      id: 'model-a',
      kind: 'model',
      modelSrc: 'artifact-model://asset-a',
      modelName: 'Imported model',
      modelMime: 'model/gltf-binary',
      modelBytes: 0,
      opacity: 100,
    });
  });

  it('adds seed defaults to older repeat nodes', () => {
    const doc = normalizeDocument({
      layers: [],
      graph: {
        edges: [],
        positions: {},
        mergeNodes: [],
        repeatNodes: [{ id: 'repeat-a', name: 'Repeater' }],
      },
    });

    expect(doc.graph?.repeatNodes?.[0]).toMatchObject({ id: 'repeat-a', seedOffset: 0 });
  });

  it('adds interaction defaults to older transform nodes', () => {
    const doc = normalizeDocument({
      layers: [],
      graph: {
        edges: [],
        positions: {},
        mergeNodes: [],
        transformNodes: [{ id: 'transform-a', name: 'Transform' }],
      },
    });

    expect(doc.graph?.transformNodes?.[0]).toMatchObject({
      id: 'transform-a',
      scaleX: 100,
      scaleY: 100,
      uniformScale: true,
      pivotMode: 'canvas',
    });
  });

  it('adds render defaults to older grime shadow nodes', () => {
    const doc = normalizeDocument({
      layers: [],
      graph: {
        edges: [],
        positions: {},
        mergeNodes: [],
        grimeShadowNodes: [{ id: 'shadow-a', name: 'Grime Shadow' }],
      },
    });

    expect(doc.graph?.grimeShadowNodes?.[0]).toMatchObject({
      id: 'shadow-a',
      x: 8,
      y: 10,
      layers: 5,
      color: '#090606',
      shadowOnly: false,
    });
  });

  it('adds seed defaults to older emoji layers', () => {
    const doc = normalizeDocument({
      layers: [
        {
          id: 'emoji-a',
          name: 'Emoji',
          kind: 'emoji',
          emojis: ['📼'],
          density: 12,
          minSz: 20,
          maxSz: 48,
          blur: 0,
          opacity: 100,
          blendMode: 'normal',
          visible: true,
          locked: false,
        },
      ],
    });

    expect(doc.layers[0]).toMatchObject({ id: 'emoji-a', kind: 'emoji', seedOffset: 0 });
  });

  it('adds seed defaults to older effect layers', () => {
    const doc = normalizeDocument({
      layers: [
        {
          id: 'effect-a',
          name: 'Effect',
          kind: 'effect',
          preset: 'grain',
          grain: 12,
          visible: true,
          locked: false,
        },
      ],
    });

    expect(doc.layers[0]).toMatchObject({ id: 'effect-a', kind: 'effect', seedOffset: 0 });
  });

  it('splits legacy combined effect presets into focused effect layers', () => {
    const doc = normalizeDocument({
      layers: [
        {
          id: 'legacy-warp',
          name: 'Warp FX',
          kind: 'effect',
          preset: 'warp',
          visible: true,
          locked: false,
          noiseWarp: 40,
          morphAmt: 30,
          morphFreq: 7,
        },
      ],
    });

    expect(doc.layers).toHaveLength(2);
    expect(doc.layers).toMatchObject([
      { id: 'legacy-warp-morph-0', kind: 'effect', preset: 'morph', morphAmt: 30, morphFreq: 7 },
      { id: 'legacy-warp-noiseWarp-1', kind: 'effect', preset: 'noiseWarp', noiseWarp: 40 },
    ]);
  });

  it('splits custom multi-effect layers into focused effect layers', () => {
    const doc = normalizeDocument({
      layers: [
        {
          id: 'custom-fx',
          name: 'FX',
          kind: 'effect',
          visible: true,
          locked: false,
          grain: 25,
          scanlines: 12,
          tint: '#120020',
          tintOp: 40,
          seedOffset: 77,
        },
      ],
    });

    expect(doc.layers.map((layer) => (layer.kind === 'effect' ? layer.preset : layer.kind))).toEqual([
      'scanlines',
      'grain',
      'tint',
    ]);
    expect(doc.layers).toMatchObject([{ seedOffset: 77 }, { seedOffset: 77 }, { seedOffset: 77 }]);
  });

  it('fills newer effect defaults when loading older effect layers', () => {
    const doc = normalizeDocument({
      layers: [
        {
          id: 'legacy-scanlines',
          name: 'Scanlines',
          kind: 'effect',
          preset: 'scanlines',
          visible: true,
          locked: false,
          scanlines: 24,
        },
      ],
    });

    expect(doc.layers[0]).toMatchObject({
      id: 'legacy-scanlines',
      kind: 'effect',
      preset: 'scanlines',
      scanlines: 24,
      scanlineWidth: 1,
    });
  });

  it('adds empty optional graph arrays to older graph documents', () => {
    const doc = normalizeDocument({
      layers: [],
      graph: {
        edges: [],
        positions: {},
        mergeNodes: [],
      },
    });

    expect(doc.graph).toEqual({
      edges: [],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      repeatNodes: [],
      materialNodes: [],
      maskNodes: [],
      transformNodes: [],
      grimeShadowNodes: [],
      scene3dNodes: [],
      environmentNodes: [],
      shaderNodes: [],
      areas: [],
      primitiveViewStates: undefined,
    });
  });

  it('normalizes legacy material percentages to unit values', () => {
    const doc = normalizeDocument({
      layers: [
        {
          id: 'legacy-primitive',
          name: 'Legacy Primitive',
          kind: 'primitive',
          materialPreset: 'chrome',
          materialMetalness: 95,
          materialRoughness: 8,
          materialClearcoat: 70,
        },
      ],
      graph: {
        edges: [],
        positions: {},
        mergeNodes: [],
        materialNodes: [
          {
            id: 'legacy-material',
            name: 'Legacy Material',
            materialPreset: 'goldFoil',
            materialMetalness: 95,
            materialRoughness: 24,
            materialClearcoat: 34,
          },
        ],
      },
    });

    const layer = doc.layers[0];
    expect(layer).toMatchObject({
      kind: 'primitive',
      materialMetalness: 0.95,
      materialRoughness: 0.08,
      materialClearcoat: 0.7,
    });
    expect(doc.graph?.materialNodes?.[0]).toMatchObject({
      materialMetalness: 0.95,
      materialRoughness: 0.24,
      materialClearcoat: 0.34,
    });
  });
});

describe('getInitialDocumentFromSources', () => {
  const storedDoc: CanvasDocument = {
    global: { bg: '#101010', seed: 10, aspect: '1:1' },
    layers: [makeFillLayer({ id: 'stored-fill' })],
    export: { format: 'jpeg', scale: 2, target: 'cover' },
  };

  const linkedDoc: CanvasDocument = {
    global: { bg: '#202020', seed: 20, aspect: '16:9' },
    layers: [makeTextLayer({ id: 'linked-text', content: 'linked' })],
    export: { format: 'png', scale: 1, target: 'envmap' },
  };

  it('prefers a valid URL document over stored local state', () => {
    const doc = getInitialDocumentFromSources({
      search: `?doc=${encodeURIComponent(encodeDoc(linkedDoc))}`,
      storageValue: encodeDoc(storedDoc),
    });

    expect(doc.layers[0]?.id).toBe('linked-text');
    expect(doc.global.seed).toBe(20);
  });

  it('prefers an explicit blank start over stored local state', () => {
    const doc = getInitialDocumentFromSources({
      search: '?new=blank',
      storageValue: encodeDoc(storedDoc),
    });

    expect(doc.layers).toEqual([]);
    expect(doc.global.bg).toBe('transparent');
    expect(isBlankDocument(doc)).toBe(true);
  });

  it('falls back to stored local state when the URL document is invalid', () => {
    const doc = getInitialDocumentFromSources({
      search: '?doc=%7Bbad-json',
      storageValue: encodeDoc(storedDoc),
    });

    expect(doc.layers[0]?.id).toBe('stored-fill');
    expect(doc.export.format).toBe('jpeg');
  });

  it('returns independent default document clones when no source can be read', () => {
    const first = getInitialDocumentFromSources({});
    const second = getInitialDocumentFromSources({});

    first.layers.pop();

    expect(first.layers).toHaveLength(DEFAULT_DOCUMENT.layers.length - 1);
    expect(second.layers).toHaveLength(DEFAULT_DOCUMENT.layers.length);
  });
});

describe('document serialization helpers', () => {
  const doc: CanvasDocument = {
    global: { bg: '#303030', seed: 30, aspect: '4:5' },
    layers: [makeTextLayer({ id: 'share-text', content: 'share' })],
    export: { format: 'png', scale: 3, target: 'cover' },
  };

  it('saves serialized documents to the configured storage key', () => {
    const writes = new Map<string, string>();

    const didSave = saveDocumentToStorage(doc, {
      setItem: (key, value) => writes.set(key, value),
    });

    expect(didSave).toBe(true);
    expect(JSON.parse(writes.get(DOC_KEY) ?? '')).toMatchObject({
      global: { seed: 30 },
      layers: [{ id: 'share-text' }],
    });
  });

  it('reports failed storage writes without throwing', () => {
    const didSave = saveDocumentToStorage(doc, {
      setItem: () => {
        throw new Error('quota exceeded');
      },
    });

    expect(didSave).toBe(false);
  });

  it('saves and deletes a recoverable pre-blank draft', () => {
    const writes = new Map<string, string>();
    const storage = {
      getItem: (key: string) => writes.get(key) ?? null,
      setItem: (key: string, value: string) => writes.set(key, value),
      removeItem: (key: string) => writes.delete(key),
    };

    expect(savePreBlankDraft(doc, storage, new Date('2026-05-15T12:00:00.000Z'), 'data:image/webp;base64,thumb')).toBe(
      true,
    );
    expect(writes.has(PRE_BLANK_DRAFT_KEY)).toBe(true);

    const draft = loadPreBlankDraft(storage);
    expect(draft?.savedAt).toBe('2026-05-15T12:00:00.000Z');
    expect(draft?.doc.layers[0]?.id).toBe('share-text');
    expect(draft?.thumbnail).toBe('data:image/webp;base64,thumb');

    expect(deletePreBlankDraft(storage)).toBe(true);
    expect(loadPreBlankDraft(storage)).toBeNull();
  });

  it('creates share URLs that round-trip through the doc query param', () => {
    const url = createDocumentShareUrl('https://example.test', doc);
    const parsed = new URL(url);
    const decoded = normalizeDocument(JSON.parse(parsed.searchParams.get('doc') ?? '{}'));

    expect(parsed.pathname).toBe('/app');
    expect(decoded.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
    expect(decoded.layers[0]?.id).toBe('share-text');
    expect(decoded.export.scale).toBe(3);
  });

  it('removes doc query params while preserving unrelated params', () => {
    const url = removeDocParamFromUrl('https://example.test/app?doc=%7B%7D&new=blank&tab=node#preview');

    expect(url).toBe('https://example.test/app?tab=node#preview');
  });

  it('creates transparent blank documents without hidden layers', () => {
    const blank = createBlankDocument({ aspect: '16:9', seed: 818 });

    expect(blank).toMatchObject({
      global: { bg: 'transparent', aspect: '16:9', seed: 818 },
      layers: [],
      export: { format: 'png', scale: 1, target: 'cover' },
    });
    expect(isBlankDocument(blank)).toBe(true);
    expect(
      isBlankDocument({ ...blank, graph: { edges: [], positions: { __export__: { x: 0, y: 80 } }, mergeNodes: [] } }),
    ).toBe(true);
  });

  it('serializes artifact files as readable JSON that imports through normalization', () => {
    const serialized = serializeArtifactDocument({
      ...doc,
      global: { ...doc.global, aspect: '4:5' },
      graph: { edges: [], positions: {}, mergeNodes: [] } as CanvasDocument['graph'],
    });
    const parsed = parseArtifactDocument(serialized);

    expect(serialized).toContain('\n  "global":');
    expect(serialized.endsWith('\n')).toBe(true);
    expect(parsed?.layers[0]?.id).toBe('share-text');
    expect(parsed?.graph?.colorNodes).toEqual([]);
    expect(parsed?.graph?.repeatNodes).toEqual([]);
    expect(parsed?.graph?.grimeShadowNodes).toEqual([]);
    expect(parsed?.graph?.shaderNodes).toEqual([]);
    expect(parsed?.graph?.areas).toEqual([]);
  });

  it('round-trips graph documents through storage-safe JSON without losing graph fields', () => {
    const graphDoc: CanvasDocument = {
      ...doc,
      graph: {
        edges: [{ id: 'e-text-export', fromId: 'share-text', fromPort: 'out', toId: '__export__', toPort: 'in' }],
        positions: { 'share-text': { x: 0, y: 80 }, __export__: { x: 216, y: 80 } },
        mergeNodes: [{ id: 'merge-a', name: 'Merge', blendMode: 'multiply', opacity: 75 }],
        colorNodes: [{ id: 'color-a', name: 'Color', contrast: 110, brightness: 90, saturation: 120, hue: 15 }],
        repeatNodes: [
          {
            id: 'repeat-a',
            name: 'Repeater',
            pattern: 'grid',
            count: 4,
            rows: 3,
            gap: 120,
            radius: 90,
            scale: 28,
            jitter: 0,
            rotation: 0,
            rotationMode: 'fixed',
            rotationStep: 0,
            rotationJitter: 0,
            seedOffset: 0,
            opacity: 100,
            blendMode: 'source-over',
          },
        ],
        materialNodes: [],
        maskNodes: [],
        transformNodes: [],
        grimeShadowNodes: [],
        scene3dNodes: [],
        environmentNodes: [],
        shaderNodes: [
          {
            id: 'shader-a',
            name: 'Mesh Shader',
            shaderKind: 'meshGradient',
            aiPrompt: undefined,
            colorA: '#101010',
            colorB: '#ff705f',
            colorC: '#8d5cff',
            colorD: '#79e3c5',
            distortion: 48,
            swirl: 36,
            grain: 14,
            scale: 120,
            rotation: 18,
            offsetX: 4,
            offsetY: -6,
            seedOffset: 3,
            opacity: 64,
            blendMode: 'screen',
          },
        ],
        areas: [
          {
            id: 'area-main',
            name: 'Main branch',
            color: '#ff6b5a',
            nodeIds: ['share-text', 'color-a', '__export__'],
          },
        ],
        primitiveViewStates: {
          'primitive-a': { rotationX: 12, rotationY: -18, zoom: 0.22, panX: 0.4, panY: -0.2, locked: true },
        },
      },
    };

    const parsed = normalizeDocument(JSON.parse(serializeDocument(graphDoc)));

    expect(parsed.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
    expect(parsed.graph).toEqual(graphDoc.graph);
  });

  it('round-trips shader material bridge graphs with shader effects and texture-map ports', () => {
    const source = makeFillLayer({ id: 'shader-effect-source', color: '#2244ff', opacity: 100, blendMode: 'normal' });
    const effect = makeEffectLayer({
      id: 'shader-effect-a',
      preset: 'patternRefraction',
      patternRefraction: 72,
      patternRefractionScale: 24,
      patternRefractionAngle: 42,
    });
    const primitive = makeSourceLayer('primitive', {
      id: 'primitive-a',
      primitiveShape: 'sphere',
      color: '#773322',
      accentColor: '#ffd180',
    });
    const graphDoc: CanvasDocument = {
      global: { bg: 'transparent', seed: 44, aspect: '1:1' },
      layers: [source, effect, primitive],
      graph: {
        edges: [
          { id: 'e-shader-albedo', fromId: 'shader-a', fromPort: 'out', toId: 'material-a', toPort: 'albedo' },
          { id: 'e-source-effect', fromId: source.id, fromPort: 'out', toId: effect.id, toPort: 'in' },
          { id: 'e-effect-normal', fromId: effect.id, fromPort: 'out', toId: 'material-a', toPort: 'normal' },
          { id: 'e-material-primitive', fromId: 'material-a', fromPort: 'out', toId: primitive.id, toPort: 'material' },
          { id: 'e-primitive-export', fromId: primitive.id, fromPort: 'out', toId: '__export__', toPort: 'in' },
        ],
        positions: {
          'shader-a': { x: 0, y: 0 },
          'material-a': { x: 260, y: 90 },
          [primitive.id]: { x: 520, y: 90 },
          __export__: { x: 780, y: 90 },
        },
        mergeNodes: [],
        colorNodes: [],
        materialNodes: [
          makeGraphMaterialNode({
            id: 'material-a',
            materialPreset: 'plastic',
            materialRoughness: 0.38,
            materialMetalness: 0.12,
          }),
        ],
        shaderNodes: [
          makeGraphShaderNode({
            id: 'shader-a',
            shaderKind: 'waterCaustic',
            colorA: '#041c2a',
            colorB: '#4df4d0',
            colorC: '#ffcf6b',
            colorD: '#ffffff',
            distortion: 54,
            grain: 0,
          }),
        ],
      },
      export: { format: 'png', scale: 1, target: 'cover' },
    };

    const parsed = normalizeDocument(JSON.parse(serializeDocument(graphDoc)));
    const parsedEffect = parsed.layers.find((layer) => layer.id === effect.id);

    expect(parsed.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
    expect(parsed.graph?.edges).toEqual(graphDoc.graph?.edges);
    expect(parsed.graph?.materialNodes?.[0]).toMatchObject({
      id: 'material-a',
      materialPreset: 'plastic',
      materialRoughness: 0.38,
      materialMetalness: 0.12,
    });
    expect(parsed.graph?.shaderNodes?.[0]).toMatchObject({
      id: 'shader-a',
      shaderKind: 'waterCaustic',
      distortion: 54,
    });
    expect(parsedEffect).toMatchObject({
      id: effect.id,
      preset: 'patternRefraction',
      patternRefraction: 72,
      patternRefractionScale: 24,
      patternRefractionAngle: 42,
    });
  });

  it('rejects invalid artifact document JSON without throwing', () => {
    expect(parseArtifactDocument('{bad-json')).toBeNull();
  });

  it('creates deterministic artifact filenames from seed and date', () => {
    const filename = createArtifactFileName(doc, new Date('2026-05-12T10:20:30.000Z'));

    expect(filename).toBe(`artifact-30-2026-05-12${ARTIFACT_FILE_EXTENSION}`);
  });
});
