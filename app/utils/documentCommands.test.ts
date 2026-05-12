import { describe, expect, it } from 'vitest';
import {
  type CanvasDocument,
  type CanvasGraph,
  makeEmojiLayer,
  makeFillLayer,
  makeGraphColorNode,
  makeGraphMergeNode,
  makeTextLayer,
} from '../types/config';
import {
  addLayerToDocument,
  bootstrapDocumentGraph,
  deleteNodesFromDocument,
  duplicateLayerInDocument,
  removeLayerFromDocument,
  setDocumentAspect,
  setDocumentGraph,
  setDocumentSeed,
  updateColorNodeInDocument,
  updateDocumentExportConfig,
  updateLayerInDocument,
  updateMergeNodeInDocument,
} from './documentCommands';
import { EXPORT_NODE_ID } from './nodeGraph';

function makeDoc(graph?: CanvasGraph): CanvasDocument {
  return {
    global: { bg: '#101010', seed: 12, aspect: '1:1' },
    layers: [
      makeFillLayer({ id: 'fill-a', name: 'Fill A' }),
      makeTextLayer({ id: 'text-a', name: 'Text A', content: 'A' }),
    ],
    graph,
    export: { format: 'png', scale: 1, target: 'cover' },
  };
}

function makeGraph(): CanvasGraph {
  return {
    edges: [
      { id: 'e-fill-text', fromId: 'fill-a', fromPort: 'out', toId: 'text-a', toPort: 'bg' },
      { id: 'e-text-export', fromId: 'text-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      { id: 'e-merge-text', fromId: 'merge-a', fromPort: 'out', toId: 'text-a', toPort: 'bg' },
      { id: 'e-color-export', fromId: 'color-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
    ],
    positions: {
      'fill-a': { x: 0, y: 80 },
      'text-a': { x: 216, y: 80 },
      'merge-a': { x: 432, y: 80 },
      'color-a': { x: 648, y: 80 },
      [EXPORT_NODE_ID]: { x: 864, y: 80 },
    },
    mergeNodes: [makeGraphMergeNode({ id: 'merge-a', opacity: 80 })],
    colorNodes: [makeGraphColorNode({ id: 'color-a', brightness: 90 })],
  };
}

describe('documentCommands', () => {
  it('bootstraps a graph without mutating the layer list', () => {
    const doc = makeDoc();
    const next = bootstrapDocumentGraph(doc);

    expect(next).not.toBe(doc);
    expect(next.layers).toBe(doc.layers);
    expect(next.graph?.positions).toHaveProperty('fill-a');
    expect(next.graph?.positions).toHaveProperty(EXPORT_NODE_ID);
  });

  it('adds a layer and places it in an existing graph', () => {
    const doc = makeDoc(makeGraph());
    const layer = makeTextLayer({ id: 'text-b' });
    const next = addLayerToDocument(doc, layer);

    expect(next.layers.map((item) => item.id)).toEqual(['fill-a', 'text-a', 'text-b']);
    expect(next.graph?.positions).toHaveProperty('text-b');
    expect(doc.layers.map((item) => item.id)).toEqual(['fill-a', 'text-a']);
  });

  it('removes a layer and graph references to it', () => {
    const doc = makeDoc(makeGraph());
    const next = removeLayerFromDocument(doc, 'text-a');

    expect(next.layers.map((layer) => layer.id)).toEqual(['fill-a']);
    expect(next.graph?.positions).not.toHaveProperty('text-a');
    expect(next.graph?.edges.some((edge) => edge.fromId === 'text-a' || edge.toId === 'text-a')).toBe(false);
  });

  it('deletes selected layer, merge, and color nodes from one document operation', () => {
    const doc = makeDoc(makeGraph());
    const next = deleteNodesFromDocument(doc, ['fill-a', 'merge-a', 'color-a']);

    expect(next.layers.map((layer) => layer.id)).toEqual(['text-a']);
    expect(next.graph?.mergeNodes).toEqual([]);
    expect(next.graph?.colorNodes).toEqual([]);
    expect(Object.keys(next.graph?.positions ?? {})).not.toContain('fill-a');
    expect(next.graph?.edges.some((edge) => ['fill-a', 'merge-a', 'color-a'].includes(edge.fromId))).toBe(false);
  });

  it('updates layer, merge node, color node, global, export, and graph immutably', () => {
    const doc = makeDoc(makeGraph());
    const graph: CanvasGraph = { edges: [], positions: {}, mergeNodes: [], colorNodes: [] };

    expect(updateLayerInDocument(doc, 'text-a', { content: 'B' }).layers[1]).toMatchObject({ content: 'B' });
    expect(updateMergeNodeInDocument(doc, 'merge-a', { opacity: 25 }).graph?.mergeNodes[0]?.opacity).toBe(25);
    expect(updateColorNodeInDocument(doc, 'color-a', { saturation: 140 }).graph?.colorNodes[0]?.saturation).toBe(140);
    expect(setDocumentSeed(doc, 99).global.seed).toBe(99);
    expect(setDocumentAspect(doc, '16:9').global.aspect).toBe('16:9');
    expect(updateDocumentExportConfig(doc, { scale: 3 }).export.scale).toBe(3);
    expect(setDocumentGraph(doc, graph).graph).toBe(graph);
    expect(doc.global.seed).toBe(12);
    expect(doc.export.scale).toBe(1);
  });

  it('duplicates layers after the source and deep-clones emoji arrays', () => {
    const emoji = makeEmojiLayer({ id: 'emoji-a', emojis: ['🔥'] });
    const doc: CanvasDocument = { ...makeDoc(makeGraph()), layers: [emoji, ...makeDoc().layers] };
    const result = duplicateLayerInDocument(doc, 'emoji-a', () => 'emoji-copy');

    expect(result.layer?.id).toBe('emoji-copy');
    expect(result.doc.layers.map((layer) => layer.id).slice(0, 2)).toEqual(['emoji-a', 'emoji-copy']);
    expect(result.doc.graph?.positions).toHaveProperty('emoji-copy');

    const duplicated = result.layer;
    if (duplicated?.kind === 'emoji') duplicated.emojis.push('💀');

    expect(emoji.emojis).toEqual(['🔥']);
  });

  it('returns the original document when duplicating a missing layer', () => {
    const doc = makeDoc();
    const result = duplicateLayerInDocument(doc, 'missing');

    expect(result.doc).toBe(doc);
    expect(result.layer).toBeNull();
  });
});
