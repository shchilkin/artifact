import { describe, expect, it } from 'vitest';
import { makeDocument, makeFillLayer, makeTextLayer } from '../types/config';
import { editorDocumentPath, serializeDocumentForLink } from './documentLink';
import { normalizeDocument } from './documentPersistence';
import { EXPORT_NODE_ID } from './nodeGraph';

const layerDoc = makeDocument({
  global: { bg: '#101010', seed: 4, aspect: '1:1' },
  layers: [makeFillLayer({ id: 'plate' }), makeTextLayer({ id: 'title', content: 'A' })],
  export: { format: 'png', scale: 1, target: 'cover' },
});

describe('serializeDocumentForLink', () => {
  it('leaves out a layer-stack graph and rebuilds the same topology on load', () => {
    const json = serializeDocumentForLink(layerDoc);
    expect(JSON.parse(json)).not.toHaveProperty('graph');
    expect(normalizeDocument(JSON.parse(json)).graph.edges).toEqual(layerDoc.graph.edges);
  });

  it('keeps a custom graph', () => {
    const custom = {
      ...layerDoc,
      graph: {
        ...layerDoc.graph,
        edges: [{ id: 'e', fromId: 'title', fromPort: 'out' as const, toId: EXPORT_NODE_ID, toPort: 'in' as const }],
      },
    };
    expect(JSON.parse(serializeDocumentForLink(custom)).graph.edges).toEqual(custom.graph.edges);
  });

  it('keeps a layer-stack graph that carries areas or saved camera views', () => {
    const withArea = {
      ...layerDoc,
      graph: { ...layerDoc.graph, areas: [{ id: 'a', name: 'Type', nodeIds: ['title'], color: '#fff' }] },
    };
    expect(JSON.parse(serializeDocumentForLink(withArea))).toHaveProperty('graph');
  });
});

describe('editorDocumentPath', () => {
  it('builds an editor path with extra parameters', () => {
    const path = editorDocumentPath(layerDoc, { from: 'docs' });
    expect(path.startsWith('/app?doc=')).toBe(true);
    expect(path.endsWith('&from=docs')).toBe(true);
    expect(JSON.parse(decodeURIComponent(path.slice('/app?doc='.length, -'&from=docs'.length)))).toMatchObject({
      layers: [{ id: 'plate' }, { id: 'title' }],
    });
  });
});
