import { describe, expect, it } from 'vitest';
import {
  type CanvasDocument,
  DEFAULT_DOCUMENT,
  DOCUMENT_SCHEMA_VERSION,
  makeFillLayer,
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
        },
      ],
    });

    expect(doc.layers.map((layer) => (layer.kind === 'effect' ? layer.preset : layer.kind))).toEqual([
      'scanlines',
      'grain',
      'tint',
    ]);
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
      areas: [],
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

    expect(savePreBlankDraft(doc, storage, new Date('2026-05-15T12:00:00.000Z'))).toBe(true);
    expect(writes.has(PRE_BLANK_DRAFT_KEY)).toBe(true);

    const draft = loadPreBlankDraft(storage);
    expect(draft?.savedAt).toBe('2026-05-15T12:00:00.000Z');
    expect(draft?.doc.layers[0]?.id).toBe('share-text');

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
            seedOffset: 0,
            opacity: 100,
            blendMode: 'source-over',
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
    expect(parsed.graph?.edges).toEqual(graphDoc.graph?.edges);
    expect(parsed.graph?.mergeNodes).toEqual(graphDoc.graph?.mergeNodes);
    expect(parsed.graph?.colorNodes).toEqual(graphDoc.graph?.colorNodes);
    expect(parsed.graph?.repeatNodes).toEqual(graphDoc.graph?.repeatNodes);
    expect(parsed.graph?.areas).toEqual(graphDoc.graph?.areas);
    expect(parsed.graph?.primitiveViewStates).toEqual(graphDoc.graph?.primitiveViewStates);
    expect(parsed.graph?.positions.__export__).toEqual({ x: 216, y: 80 });
  });

  it('rejects invalid artifact document JSON without throwing', () => {
    expect(parseArtifactDocument('{bad-json')).toBeNull();
  });

  it('creates deterministic artifact filenames from seed and date', () => {
    const filename = createArtifactFileName(doc, new Date('2026-05-12T10:20:30.000Z'));

    expect(filename).toBe(`artifact-30-2026-05-12${ARTIFACT_FILE_EXTENSION}`);
  });
});
