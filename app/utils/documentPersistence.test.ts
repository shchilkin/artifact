import { describe, expect, it } from 'vitest';
import { type CanvasDocument, DEFAULT_DOCUMENT, makeFillLayer, makeTextLayer } from '../types/config';
import { getInitialDocumentFromSources, normalizeDocument } from './documentPersistence';

function encodeDoc(doc: unknown) {
  return JSON.stringify(doc);
}

describe('normalizeDocument', () => {
  it('fills missing global and export defaults', () => {
    const doc = normalizeDocument({ layers: [] });

    expect(doc.global).toEqual(DEFAULT_DOCUMENT.global);
    expect(doc.export).toEqual(DEFAULT_DOCUMENT.export);
    expect(doc.layers).toEqual([]);
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

    expect(doc.layers[0]).toMatchObject({ id: 'legacy-source', kind: 'noise' });
  });

  it('adds an empty colorNodes array to older graph documents', () => {
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
