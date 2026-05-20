import { describe, expect, it } from 'vitest';
import {
  type CanvasDocument,
  type CanvasGraph,
  makeEmojiLayer,
  makeFillLayer,
  makeGraphColorNode,
  makeGraphMergeNode,
  makeGraphRepeatNode,
  makeTextLayer,
} from '../types/config';
import {
  addLayerToDocument,
  addNodeAtDocument,
  bootstrapDocumentGraph,
  deleteNodesFromDocument,
  duplicateLayerInDocument,
  removeGraphAreaInDocument,
  removeLayerFromDocument,
  removeNodesFromGraphAreaInDocument,
  setDocumentAspect,
  setDocumentGraph,
  setDocumentSeed,
  updateColorNodeInDocument,
  updateDocumentExportConfig,
  updateLayerInDocument,
  updateMergeNodeInDocument,
  updateRepeatNodeInDocument,
} from './documentCommands';
import { EXPORT_NODE_ID } from './nodeGraph';
import { REPEAT_PRESETS } from './repeatPresets';

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
      { id: 'e-repeat-export', fromId: 'repeat-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
    ],
    positions: {
      'fill-a': { x: 0, y: 80 },
      'text-a': { x: 216, y: 80 },
      'merge-a': { x: 432, y: 80 },
      'color-a': { x: 648, y: 80 },
      'repeat-a': { x: 756, y: 80 },
      [EXPORT_NODE_ID]: { x: 864, y: 80 },
    },
    mergeNodes: [makeGraphMergeNode({ id: 'merge-a', opacity: 80 })],
    colorNodes: [makeGraphColorNode({ id: 'color-a', brightness: 90 })],
    repeatNodes: [makeGraphRepeatNode({ id: 'repeat-a', count: 3 })],
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
    expect(next.graph?.edges).toContainEqual({
      id: `e-text-b-${EXPORT_NODE_ID}-1`,
      fromId: 'text-b',
      fromPort: 'out',
      toId: EXPORT_NODE_ID,
      toPort: 'in',
    });
    expect(next.graph?.edges.some((edge) => edge.toId === EXPORT_NODE_ID && edge.fromId !== 'text-b')).toBe(false);
    expect(doc.layers.map((item) => item.id)).toEqual(['fill-a', 'text-a']);
  });

  it('connects the first layer created from layers view directly to export', () => {
    const doc = makeDoc({ edges: [], positions: { [EXPORT_NODE_ID]: { x: 0, y: 80 } }, mergeNodes: [] });
    const layer = makeFillLayer({ id: 'fill-b' });
    const next = addLayerToDocument({ ...doc, layers: [] }, layer);

    expect(next.layers.map((item) => item.id)).toEqual(['fill-b']);
    expect(next.graph?.edges).toEqual([
      { id: `e-fill-b-${EXPORT_NODE_ID}-0`, fromId: 'fill-b', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
    ]);
  });

  it('inserts a merge node with source and target edges', () => {
    const doc = makeDoc(makeGraph());
    const result = addNodeAtDocument(
      doc,
      { kind: 'merge' },
      { x: 320, y: 180 },
      { sourceId: 'fill-a', targetId: EXPORT_NODE_ID },
      (fromId, toId, index) => `edge-${index}-${fromId}-${toId}`,
    );
    const mergeNode = result.doc.graph?.mergeNodes.find((node) => node.id !== 'merge-a');

    expect(result.selectedLayerId).toBeNull();
    expect(mergeNode).toBeDefined();
    expect(result.doc.graph?.positions[mergeNode!.id]).toEqual({ x: 320, y: 180 });
    expect(result.doc.graph?.edges).toContainEqual({
      id: `edge-0-fill-a-${mergeNode!.id}`,
      fromId: 'fill-a',
      fromPort: 'out',
      toId: mergeNode!.id,
      toPort: 'a',
    });
    expect(result.doc.graph?.edges).toContainEqual({
      id: `edge-1-${mergeNode!.id}-${EXPORT_NODE_ID}`,
      fromId: mergeNode!.id,
      fromPort: 'out',
      toId: EXPORT_NODE_ID,
      toPort: 'in',
    });
    expect(doc.graph?.mergeNodes).toHaveLength(1);
  });

  it('inserts a color node with source and target edges', () => {
    const doc = makeDoc(makeGraph());
    const result = addNodeAtDocument(
      doc,
      { kind: 'color' },
      { x: 360, y: 220 },
      { sourceId: 'fill-a', targetId: 'text-a', targetPort: 'bg' },
      (fromId, toId, index) => `edge-${index}-${fromId}-${toId}`,
    );
    const colorNode = result.doc.graph?.colorNodes.find((node) => node.id !== 'color-a');

    expect(result.selectedLayerId).toBeNull();
    expect(colorNode).toBeDefined();
    expect(result.doc.graph?.positions[colorNode!.id]).toEqual({ x: 360, y: 220 });
    expect(result.doc.graph?.edges).toContainEqual({
      id: `edge-0-fill-a-${colorNode!.id}`,
      fromId: 'fill-a',
      fromPort: 'out',
      toId: colorNode!.id,
      toPort: 'in',
    });
    expect(result.doc.graph?.edges).toContainEqual({
      id: `edge-1-${colorNode!.id}-text-a`,
      fromId: colorNode!.id,
      fromPort: 'out',
      toId: 'text-a',
      toPort: 'bg',
    });
  });

  it('inserts a repeat node with source and target edges', () => {
    const doc = makeDoc(makeGraph());
    const result = addNodeAtDocument(
      doc,
      { kind: 'repeat' },
      { x: 380, y: 240 },
      { sourceId: 'fill-a', targetId: EXPORT_NODE_ID },
      (fromId, toId, index) => `edge-${index}-${fromId}-${toId}`,
    );
    const repeatNode = result.doc.graph?.repeatNodes?.find((node) => node.id !== 'repeat-a');

    expect(result.selectedLayerId).toBeNull();
    expect(repeatNode).toBeDefined();
    expect(result.doc.graph?.positions[repeatNode!.id]).toEqual({ x: 380, y: 240 });
    expect(result.doc.graph?.edges).toContainEqual({
      id: `edge-0-fill-a-${repeatNode!.id}`,
      fromId: 'fill-a',
      fromPort: 'out',
      toId: repeatNode!.id,
      toPort: 'in',
    });
    expect(result.doc.graph?.edges).toContainEqual({
      id: `edge-1-${repeatNode!.id}-${EXPORT_NODE_ID}`,
      fromId: repeatNode!.id,
      fromPort: 'out',
      toId: EXPORT_NODE_ID,
      toPort: 'in',
    });
  });

  it('inserts repeater presets as configured graph utility nodes', () => {
    const doc = makeDoc(makeGraph());
    const result = addNodeAtDocument(doc, { kind: 'repeatPreset', preset: 'orbitRings' }, { x: 420, y: 280 });
    const repeatNode = result.doc.graph?.repeatNodes?.find((node) => node.id !== 'repeat-a');

    expect(result.selectedLayerId).toBeNull();
    expect(repeatNode).toBeDefined();
    expect(repeatNode).toMatchObject(REPEAT_PRESETS.orbitRings.patch);
    expect(result.doc.graph?.positions[repeatNode!.id]).toEqual({ x: 420, y: 280 });
  });

  it('inserts layer and effect nodes with the correct input ports', () => {
    const doc = makeDoc(makeGraph());
    const layerResult = addNodeAtDocument(
      doc,
      { kind: 'layer', layerKind: 'fill' },
      { x: 400, y: 260 },
      { sourceId: 'fill-a' },
      (fromId, toId, index) => `edge-${index}-${fromId}-${toId}`,
    );
    const layerId = layerResult.selectedLayerId;

    expect(layerId).toBeTruthy();
    expect(layerResult.doc.layers.map((layer) => layer.id)).toEqual(['fill-a', layerId, 'text-a']);
    expect(layerResult.doc.layers[1]).toMatchObject({ id: layerId, kind: 'fill' });
    expect(layerResult.doc.graph?.positions[layerId!]).toEqual({ x: 400, y: 260 });
    expect(layerResult.doc.graph?.edges).toContainEqual({
      id: `edge-0-fill-a-${layerId}`,
      fromId: 'fill-a',
      fromPort: 'out',
      toId: layerId,
      toPort: 'bg',
    });

    const effectResult = addNodeAtDocument(
      doc,
      { kind: 'effect', preset: 'grain' },
      { x: 440, y: 300 },
      { sourceId: 'fill-a' },
      (fromId, toId, index) => `edge-${index}-${fromId}-${toId}`,
    );
    const effectId = effectResult.selectedLayerId;

    expect(effectId).toBeTruthy();
    expect(effectResult.doc.layers.map((layer) => layer.id)).toEqual(['fill-a', effectId, 'text-a']);
    expect(effectResult.doc.layers[1]).toMatchObject({ id: effectId, kind: 'effect', preset: 'grain' });
    expect(effectResult.doc.graph?.edges).toContainEqual({
      id: `edge-0-fill-a-${effectId}`,
      fromId: 'fill-a',
      fromPort: 'out',
      toId: effectId,
      toPort: 'in',
    });
  });

  it('connects a dropped source node into the dragged target port', () => {
    const doc = makeDoc(makeGraph());
    const result = addNodeAtDocument(
      doc,
      { kind: 'layer', layerKind: 'noise' },
      { x: -360, y: 240 },
      { targetId: 'text-a', targetPort: 'bg' },
      (fromId, toId, index) => `edge-${index}-${fromId}-${toId}`,
    );
    const layerId = result.selectedLayerId;

    expect(layerId).toBeTruthy();
    expect(result.doc.layers.map((layer) => layer.id)).toEqual(['fill-a', layerId, 'text-a']);
    expect(result.doc.layers[1]).toMatchObject({ id: layerId, kind: 'noise' });
    expect(result.doc.layers[1]?.kind === 'noise' ? result.doc.layers[1].seedOffset : 0).toBeGreaterThan(0);
    expect(result.doc.graph?.edges).toContainEqual({
      id: `edge-0-${layerId}-text-a`,
      fromId: layerId,
      fromPort: 'out',
      toId: 'text-a',
      toPort: 'bg',
    });
  });

  it('inserts noise presets as normal noise source layers', () => {
    const doc = makeDoc(makeGraph());
    const result = addNodeAtDocument(doc, { kind: 'noisePreset', preset: 'crtDirt' }, { x: 480, y: 320 });
    const layerId = result.selectedLayerId;

    expect(layerId).toBeTruthy();
    expect(result.doc.layers.at(-1)).toMatchObject({ id: layerId, kind: 'noise', name: 'CRT Dirt' });
    expect(result.doc.layers.at(-1)?.kind === 'noise' ? result.doc.layers.at(-1)?.seedOffset : 0).toBeGreaterThan(0);
    expect(result.doc.graph?.positions[layerId!]).toEqual({ x: 480, y: 320 });
  });

  it('inserts array presets as normal array source layers', () => {
    const doc = makeDoc(makeGraph());
    const result = addNodeAtDocument(doc, { kind: 'arrayPreset', preset: 'radialBurst' }, { x: 520, y: 360 });
    const layerId = result.selectedLayerId;

    expect(layerId).toBeTruthy();
    expect(result.doc.layers.at(-1)).toMatchObject({ id: layerId, kind: 'array', name: 'Radial Burst' });
    expect(result.doc.graph?.positions[layerId!]).toEqual({ x: 520, y: 360 });
  });

  it('splits replaceEdgeId insertions without adding a separate target edge', () => {
    const doc = makeDoc(makeGraph());
    const result = addNodeAtDocument(
      doc,
      { kind: 'color' },
      { x: 500, y: 340 },
      {
        sourceId: 'fill-a',
        targetId: EXPORT_NODE_ID,
        replaceEdgeId: 'e-fill-text',
      },
    );
    const colorNode = result.doc.graph?.colorNodes.find((node) => node.id !== 'color-a');

    expect(result.doc.graph?.edges.some((edge) => edge.id === 'e-fill-text')).toBe(false);
    expect(result.doc.graph?.edges).toContainEqual({
      id: 'e-fill-text__before',
      fromId: 'fill-a',
      fromPort: 'out',
      toId: colorNode!.id,
      toPort: 'in',
    });
    expect(result.doc.graph?.edges).toContainEqual({
      id: 'e-fill-text__after',
      fromId: colorNode!.id,
      fromPort: 'out',
      toId: 'text-a',
      toPort: 'bg',
    });
    expect(result.doc.layers.map((layer) => layer.id)).toEqual(['fill-a', 'text-a']);
    expect(result.doc.graph?.edges.some((edge) => edge.fromId === colorNode!.id && edge.toId === EXPORT_NODE_ID)).toBe(
      false,
    );
  });

  it('inserts layer-backed split nodes between the replaced edge layers', () => {
    const doc = makeDoc(makeGraph());
    const result = addNodeAtDocument(
      doc,
      { kind: 'effect', preset: 'scanlines' },
      { x: 500, y: 340 },
      {
        sourceId: 'fill-a',
        targetId: 'text-a',
        targetPort: 'bg',
        replaceEdgeId: 'e-fill-text',
      },
    );
    const layerId = result.selectedLayerId;

    expect(layerId).toBeTruthy();
    expect(result.doc.layers.map((layer) => layer.id)).toEqual(['fill-a', layerId, 'text-a']);
    expect(result.doc.graph?.edges).toContainEqual({
      id: 'e-fill-text__before',
      fromId: 'fill-a',
      fromPort: 'out',
      toId: layerId,
      toPort: 'in',
    });
    expect(result.doc.graph?.edges).toContainEqual({
      id: 'e-fill-text__after',
      fromId: layerId,
      fromPort: 'out',
      toId: 'text-a',
      toPort: 'bg',
    });
  });

  it('removes a layer and graph references to it', () => {
    const doc = makeDoc(makeGraph());
    const next = removeLayerFromDocument(doc, 'text-a');

    expect(next.layers.map((layer) => layer.id)).toEqual(['fill-a']);
    expect(next.graph?.positions).not.toHaveProperty('text-a');
    expect(next.graph?.edges.some((edge) => edge.fromId === 'text-a' || edge.toId === 'text-a')).toBe(false);
  });

  it('deletes selected layer, merge, color, and repeat nodes from one document operation', () => {
    const doc = makeDoc(makeGraph());
    const next = deleteNodesFromDocument(doc, ['fill-a', 'merge-a', 'color-a', 'repeat-a']);

    expect(next.layers.map((layer) => layer.id)).toEqual(['text-a']);
    expect(next.graph?.mergeNodes).toEqual([]);
    expect(next.graph?.colorNodes).toEqual([]);
    expect(next.graph?.repeatNodes).toEqual([]);
    expect(Object.keys(next.graph?.positions ?? {})).not.toContain('fill-a');
    expect(next.graph?.edges.some((edge) => ['fill-a', 'merge-a', 'color-a', 'repeat-a'].includes(edge.fromId))).toBe(
      false,
    );
  });

  it('removes graph areas and graph-only area members without touching render graph nodes', () => {
    const graph = {
      ...makeGraph(),
      areas: [{ id: 'area-a', name: 'Area A', color: '#ff6b5a', nodeIds: ['fill-a', 'merge-a', 'color-a'] }],
    };
    const doc = makeDoc(graph);
    const withoutHelper = removeNodesFromGraphAreaInDocument(doc, 'area-a', ['merge-a']);

    expect(withoutHelper.graph?.areas?.[0]?.nodeIds).toEqual(['fill-a', 'color-a']);
    expect(withoutHelper.graph?.mergeNodes.map((node) => node.id)).toEqual(['merge-a']);
    expect(withoutHelper.graph?.edges.some((edge) => edge.fromId === 'merge-a' || edge.toId === 'merge-a')).toBe(true);

    const withoutArea = removeGraphAreaInDocument(withoutHelper, 'area-a');

    expect(withoutArea.graph?.areas).toEqual([]);
    expect(withoutArea.graph?.positions).toHaveProperty('fill-a');
    expect(withoutArea.graph?.colorNodes.map((node) => node.id)).toEqual(['color-a']);
  });

  it('updates layer, merge node, color node, repeat node, global, export, and graph immutably', () => {
    const doc = makeDoc(makeGraph());
    const graph: CanvasGraph = { edges: [], positions: {}, mergeNodes: [], colorNodes: [] };

    expect(updateLayerInDocument(doc, 'text-a', { content: 'B' }).layers[1]).toMatchObject({ content: 'B' });
    expect(updateMergeNodeInDocument(doc, 'merge-a', { opacity: 25 }).graph?.mergeNodes[0]?.opacity).toBe(25);
    expect(updateColorNodeInDocument(doc, 'color-a', { saturation: 140 }).graph?.colorNodes[0]?.saturation).toBe(140);
    expect(updateRepeatNodeInDocument(doc, 'repeat-a', { count: 8 }).graph?.repeatNodes?.[0]?.count).toBe(8);
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
