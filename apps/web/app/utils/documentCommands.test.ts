import { describe, expect, it } from 'vitest';
import {
  type CanvasDocument,
  type CanvasGraph,
  makeEmojiLayer,
  makeFillLayer,
  makeGraphColorNode,
  makeGraphGrimeShadowNode,
  makeGraphMaterialNode,
  makeGraphMergeNode,
  makeGraphRepeatNode,
  makeGraphScene3DNode,
  makeGraphShaderNode,
  makeGraphTransformNode,
  makeImageLayer,
  makeSourceLayer,
  makeTextLayer,
} from '../types/config';
import {
  addLayerToDocument,
  addLooseLayerNodeToDocument,
  addNodeAtDocument,
  bootstrapDocumentGraph,
  canInsertLayerAbove,
  deleteNodesFromDocument,
  duplicateLayerInDocument,
  insertLayerAboveInDocument,
  removeGraphAreaInDocument,
  removeLayerFromDocument,
  removeNodesFromAllGraphAreasInDocument,
  removeNodesFromGraphAreaInDocument,
  renameLayerInDocument,
  reorderDocumentLayers,
  replaceSelectedImageSourceInDocument,
  setDocumentAspect,
  setDocumentGraph,
  setDocumentSeed,
  setLayersVisibilityInDocument,
  toggleLayerVisibilityInDocument,
  updateColorNodeInDocument,
  updateDocumentExportConfig,
  updateGlobalInDocument,
  updateGrimeShadowNodeInDocument,
  updateLayerInDocument,
  updateMaterialNodeInDocument,
  updateMergeNodeInDocument,
  updateRepeatNodeInDocument,
  updateShaderNodeInDocument,
  updateTransformNodeInDocument,
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
      { id: 'e-transform-export', fromId: 'transform-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      { id: 'e-shadow-export', fromId: 'shadow-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
    ],
    positions: {
      'fill-a': { x: 0, y: 80 },
      'text-a': { x: 216, y: 80 },
      'merge-a': { x: 432, y: 80 },
      'color-a': { x: 648, y: 80 },
      'repeat-a': { x: 756, y: 80 },
      'transform-a': { x: 810, y: 80 },
      'shadow-a': { x: 830, y: 80 },
      'shader-a': { x: 840, y: 80 },
      [EXPORT_NODE_ID]: { x: 864, y: 80 },
    },
    mergeNodes: [makeGraphMergeNode({ id: 'merge-a', opacity: 80 })],
    colorNodes: [makeGraphColorNode({ id: 'color-a', brightness: 90 })],
    repeatNodes: [makeGraphRepeatNode({ id: 'repeat-a', count: 3 })],
    materialNodes: [makeGraphMaterialNode({ id: 'material-a', materialPreset: 'chrome' })],
    transformNodes: [makeGraphTransformNode({ id: 'transform-a', rotation: 12 })],
    grimeShadowNodes: [makeGraphGrimeShadowNode({ id: 'shadow-a', grime: 24 })],
    shaderNodes: [makeGraphShaderNode({ id: 'shader-a', distortion: 32 })],
  };
}

function makeEdgeId(fromId: string, toId: string, index: number) {
  return `edge-${index}-${fromId}-${toId}`;
}

function addNodeToFillSource(
  action: Parameters<typeof addNodeAtDocument>[1],
  connection: Parameters<typeof addNodeAtDocument>[3] = { sourceId: 'fill-a' },
) {
  return addNodeAtDocument(makeDoc(makeGraph()), action, { x: 460, y: 320 }, connection, makeEdgeId);
}

function expectInsertedLayerBackedNode(
  result: ReturnType<typeof addNodeAtDocument>,
  layer: Record<string, unknown>,
  makeEdge: (layerId: string) => Record<string, unknown>,
) {
  const layerId = result.selectedLayerId;
  expect(layerId).toBeTruthy();
  expect(result.doc.layers[1]).toMatchObject({ id: layerId, ...layer });
  expect(result.doc.graph?.positions[layerId!]).toEqual({ x: 460, y: 320 });
  expect(result.doc.graph?.edges).toContainEqual(makeEdge(layerId!));
  return layerId;
}

function expectFillBInsertedAboveFillA(doc: CanvasDocument, next: CanvasDocument) {
  expect(canInsertLayerAbove(doc, 'fill-a')).toBe(true);
  expect(next.layers.map((item) => item.id)).toEqual(['fill-a', 'fill-b', 'text-a']);
}

function expectInsertedRepeatNode(result: ReturnType<typeof addNodeAtDocument>, position: { x: number; y: number }) {
  const repeatNode = result.doc.graph?.repeatNodes?.find((node) => node.id !== 'repeat-a');
  expect(result.selectedLayerId).toBeNull();
  expect(repeatNode).toBeDefined();
  expect(result.doc.graph?.positions[repeatNode!.id]).toEqual(position);
  return repeatNode!;
}

function expectSelectedLayerInsertedAtMiddle(result: ReturnType<typeof addNodeAtDocument>) {
  const layerId = result.selectedLayerId;
  expect(layerId).toBeTruthy();
  expect(result.doc.layers.map((layer) => layer.id)).toEqual(['fill-a', layerId, 'text-a']);
  return layerId!;
}

function expectReorderedTextBeforeFill(next: CanvasDocument) {
  expect(next.layers.map((layer) => layer.id)).toEqual(['text-a', 'fill-a']);
  expect(next.graph?.edges).toEqual([
    { id: 'e-text-a-fill-a', fromId: 'text-a', fromPort: 'out', toId: 'fill-a', toPort: 'bg' },
    { id: 'e-fill-a-__export__', fromId: 'fill-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
  ]);
  expect(next.graph?.positions['text-a']?.x).toBeLessThan(next.graph?.positions['fill-a']?.x ?? 0);
}

function makeLockedFillDoc(): CanvasDocument {
  const base = makeDoc(makeGraph());
  return {
    ...base,
    layers: base.layers.map((layer) => ({ ...layer, locked: layer.id === 'fill-a' })),
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
    expect(next.graph?.edges).toEqual([
      { id: 'e-fill-a-text-a', fromId: 'fill-a', fromPort: 'out', toId: 'text-a', toPort: 'bg' },
      { id: 'e-text-a-text-b', fromId: 'text-a', fromPort: 'out', toId: 'text-b', toPort: 'bg' },
      { id: `e-text-b-${EXPORT_NODE_ID}`, fromId: 'text-b', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
    ]);
    expect(next.graph?.mergeNodes.map((node) => node.id)).toEqual(['merge-a']);
    expect(next.graph?.colorNodes.map((node) => node.id)).toEqual(['color-a']);
    expect(next.graph?.repeatNodes?.map((node) => node.id)).toEqual(['repeat-a']);
    expect(doc.layers.map((item) => item.id)).toEqual(['fill-a', 'text-a']);
  });

  it('connects the first layer created from layers view directly to export', () => {
    const doc = makeDoc({ edges: [], positions: { [EXPORT_NODE_ID]: { x: 0, y: 80 } }, mergeNodes: [] });
    const layer = makeFillLayer({ id: 'fill-b' });
    const next = addLayerToDocument({ ...doc, layers: [] }, layer);

    expect(next.layers.map((item) => item.id)).toEqual(['fill-b']);
    expect(next.graph?.edges).toEqual([
      { id: `e-fill-b-${EXPORT_NODE_ID}`, fromId: 'fill-b', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
    ]);
  });

  it('adds a loose image node in graph mode without rewiring the current output path', () => {
    const doc = makeDoc(makeGraph());
    const layer = makeImageLayer('artifact-asset://drop-a', { id: 'image-drop' });
    const next = addLooseLayerNodeToDocument(doc, layer, { x: 123, y: 456 });

    expect(next.layers.map((item) => item.id)).toEqual(['fill-a', 'text-a', 'image-drop']);
    expect(next.graph?.positions['image-drop']).toEqual({ x: 123, y: 456 });
    expect(next.graph?.edges).toEqual(doc.graph?.edges);
  });

  it('inserts a layer above a stack row without requiring a graph', () => {
    const doc = makeDoc();
    const layer = makeFillLayer({ id: 'fill-b', name: 'Fill B' });
    const next = insertLayerAboveInDocument(doc, 'fill-a', layer);

    expectFillBInsertedAboveFillA(doc, next);
    expect(next.graph).toBeUndefined();
    expect(doc.layers.map((item) => item.id)).toEqual(['fill-a', 'text-a']);
  });

  it('inserts a layer above a linear graph row and rewires the export path', () => {
    const graph: CanvasGraph = {
      edges: [
        { id: 'e-fill-a-text-a', fromId: 'fill-a', fromPort: 'out', toId: 'text-a', toPort: 'bg' },
        { id: 'e-text-a-export', fromId: 'text-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {
        'fill-a': { x: 0, y: 80 },
        'text-a': { x: 480, y: 80 },
        [EXPORT_NODE_ID]: { x: 960, y: 80 },
      },
      mergeNodes: [],
      colorNodes: [],
      repeatNodes: [],
      areas: [{ id: 'area-a', name: 'Area A', color: '#ff705f', nodeIds: ['fill-a'] }],
    };
    const doc = makeDoc(graph);
    const next = insertLayerAboveInDocument(doc, 'fill-a', makeFillLayer({ id: 'fill-b' }));

    expectFillBInsertedAboveFillA(doc, next);
    expect(next.graph?.edges).not.toContainEqual(expect.objectContaining({ id: 'e-fill-a-text-a' }));
    expect(next.graph?.edges).toContainEqual({
      id: 'e-fill-a-fill-b',
      fromId: 'fill-a',
      fromPort: 'out',
      toId: 'fill-b',
      toPort: 'bg',
    });
    expect(next.graph?.edges).toContainEqual({
      id: 'e-fill-b-text-a',
      fromId: 'fill-b',
      fromPort: 'out',
      toId: 'text-a',
      toPort: 'bg',
    });
    expect(next.graph?.areas?.[0]?.nodeIds).toEqual(['fill-a']);
  });

  it('inserts layer rows into custom graphs and syncs the stack export path', () => {
    const doc = makeDoc(makeGraph());
    const layer = makeFillLayer({ id: 'fill-b' });
    const next = insertLayerAboveInDocument(doc, 'fill-a', layer);

    expectFillBInsertedAboveFillA(doc, next);
    expect(next.graph?.edges).toEqual([
      { id: 'e-fill-a-fill-b', fromId: 'fill-a', fromPort: 'out', toId: 'fill-b', toPort: 'bg' },
      { id: 'e-fill-b-text-a', fromId: 'fill-b', fromPort: 'out', toId: 'text-a', toPort: 'bg' },
      { id: `e-text-a-${EXPORT_NODE_ID}`, fromId: 'text-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
    ]);
    expect(next.graph?.mergeNodes.map((node) => node.id)).toEqual(['merge-a']);
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
    const repeatNode = expectInsertedRepeatNode(result, { x: 380, y: 240 });

    expect(result.doc.graph?.edges).toContainEqual({
      id: `edge-0-fill-a-${repeatNode.id}`,
      fromId: 'fill-a',
      fromPort: 'out',
      toId: repeatNode.id,
      toPort: 'in',
    });
    expect(result.doc.graph?.edges).toContainEqual({
      id: `edge-1-${repeatNode.id}-${EXPORT_NODE_ID}`,
      fromId: repeatNode.id,
      fromPort: 'out',
      toId: EXPORT_NODE_ID,
      toPort: 'in',
    });
  });

  it('inserts a grime shadow node with source and target edges', () => {
    const doc = makeDoc(makeGraph());
    const result = addNodeAtDocument(
      doc,
      { kind: 'grimeShadow' },
      { x: 390, y: 250 },
      { sourceId: 'fill-a', targetId: EXPORT_NODE_ID },
      (fromId, toId, index) => `edge-${index}-${fromId}-${toId}`,
    );
    const shadowNode = result.doc.graph?.grimeShadowNodes?.find((node) => node.id !== 'shadow-a');

    expect(result.selectedLayerId).toBeNull();
    expect(shadowNode).toBeDefined();
    expect(result.doc.graph?.positions[shadowNode!.id]).toEqual({ x: 390, y: 250 });
    expect(result.doc.graph?.edges).toContainEqual({
      id: `edge-0-fill-a-${shadowNode!.id}`,
      fromId: 'fill-a',
      fromPort: 'out',
      toId: shadowNode!.id,
      toPort: 'in',
    });
    expect(result.doc.graph?.edges).toContainEqual({
      id: `edge-1-${shadowNode!.id}-${EXPORT_NODE_ID}`,
      fromId: shadowNode!.id,
      fromPort: 'out',
      toId: EXPORT_NODE_ID,
      toPort: 'in',
    });
  });

  it('inserts repeater presets as configured graph utility nodes', () => {
    const doc = makeDoc(makeGraph());
    const result = addNodeAtDocument(doc, { kind: 'repeatPreset', preset: 'orbitRings' }, { x: 420, y: 280 });
    const repeatNode = expectInsertedRepeatNode(result, { x: 420, y: 280 });

    expect(repeatNode).toMatchObject(REPEAT_PRESETS.orbitRings.patch);
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

  it('inserts text preset nodes as normal text layers', () => {
    const result = addNodeToFillSource({ kind: 'textPreset', preset: 'poster' });
    expectInsertedLayerBackedNode(
      result,
      { kind: 'text', name: 'Poster Type', content: 'POSTER', font: 'BUNGEE' },
      (layerId) => ({
        id: `edge-0-fill-a-${layerId}`,
        fromId: 'fill-a',
        fromPort: 'out',
        toId: layerId,
        toPort: 'bg',
      }),
    );
  });

  it('inserts an AI image as a normal image layer node', () => {
    const result = addNodeToFillSource({ kind: 'aiImage' }, { sourceId: 'fill-a', targetId: EXPORT_NODE_ID });
    const layerId = expectInsertedLayerBackedNode(result, { kind: 'image', name: 'AI Image', src: '' }, (id) => ({
      id: `edge-0-fill-a-${id}`,
      fromId: 'fill-a',
      fromPort: 'out',
      toId: id,
      toPort: 'bg',
    }));

    expect(result.doc.layers.map((layer) => layer.id)).toEqual(['fill-a', layerId, 'text-a']);
    expect(result.doc.graph?.edges).toContainEqual({
      id: `edge-1-${layerId}-${EXPORT_NODE_ID}`,
      fromId: layerId,
      fromPort: 'out',
      toId: EXPORT_NODE_ID,
      toPort: 'in',
    });
  });

  it('connects a dropped source node into the dragged target port', () => {
    const result = addNodeAtDocument(
      makeDoc(makeGraph()),
      { kind: 'layer', layerKind: 'noise' },
      { x: -360, y: 240 },
      { targetId: 'text-a', targetPort: 'bg' },
      makeEdgeId,
    );
    const layerId = expectSelectedLayerInsertedAtMiddle(result);

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
    const layerId = expectSelectedLayerInsertedAtMiddle(result);

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

  it('deletes selected layer, merge, color, repeat, and shadow nodes from one document operation', () => {
    const doc = makeDoc(makeGraph());
    const next = deleteNodesFromDocument(doc, ['fill-a', 'merge-a', 'color-a', 'repeat-a', 'shadow-a']);

    expect(next.layers.map((layer) => layer.id)).toEqual(['text-a']);
    expect(next.graph?.mergeNodes).toEqual([]);
    expect(next.graph?.colorNodes).toEqual([]);
    expect(next.graph?.repeatNodes).toEqual([]);
    expect(next.graph?.grimeShadowNodes).toEqual([]);
    expect(Object.keys(next.graph?.positions ?? {})).not.toContain('fill-a');
    expect(
      next.graph?.edges.some((edge) => ['fill-a', 'merge-a', 'color-a', 'repeat-a', 'shadow-a'].includes(edge.fromId)),
    ).toBe(false);
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

  it('removes nodes from every graph area without deleting graph nodes', () => {
    const graph = {
      ...makeGraph(),
      areas: [
        { id: 'area-a', name: 'Area A', color: '#ff6b5a', nodeIds: ['fill-a', 'merge-a'] },
        { id: 'area-b', name: 'Area B', color: '#63d297', nodeIds: ['text-a', 'merge-a', 'color-a'] },
      ],
    };
    const next = removeNodesFromAllGraphAreasInDocument(makeDoc(graph), ['merge-a', 'text-a']);

    expect(next.graph?.areas?.[0]?.nodeIds).toEqual(['fill-a']);
    expect(next.graph?.areas?.[1]?.nodeIds).toEqual(['color-a']);
    expect(next.graph?.mergeNodes.map((node) => node.id)).toEqual(['merge-a']);
    expect(next.graph?.edges.some((edge) => edge.fromId === 'merge-a' || edge.toId === 'merge-a')).toBe(true);
  });

  it('renames layers, toggles visibility, batches visibility, and replaces selected image sources', () => {
    const image = makeImageLayer('', { id: 'image-a' });
    const doc: CanvasDocument = { ...makeDoc(), layers: [...makeDoc().layers, image] };

    expect(renameLayerInDocument(doc, 'text-a', '  Title  ').layers[1]?.name).toBe('Title');
    expect(renameLayerInDocument(doc, 'text-a', '   ')).toBe(doc);

    const toggled = toggleLayerVisibilityInDocument(doc, 'text-a');
    expect(toggled.layers[1]?.visible).toBe(false);
    expect(doc.layers[1]?.visible).toBe(true);

    const hidden = setLayersVisibilityInDocument(doc, ['fill-a', 'text-a'], false);
    expect(hidden.layers.map((layer) => layer.visible)).toEqual([false, false, true]);

    expect(replaceSelectedImageSourceInDocument(doc, 'text-a', 'data:image/png;base64,x')).toBe(doc);
    expect(replaceSelectedImageSourceInDocument(doc, 'image-a', 'data:image/png;base64,x').layers[2]).toMatchObject({
      src: 'data:image/png;base64,x',
    });
  });

  it('reorders layers and keeps a linear graph in sync', () => {
    const doc = bootstrapDocumentGraph(makeDoc());
    const reordered = [doc.layers[1]!, doc.layers[0]!];
    const next = reorderDocumentLayers(doc, reordered);

    expectReorderedTextBeforeFill(next);
    expect(next.graph).not.toBe(doc.graph);
  });

  it('does not reorder a locked layer', () => {
    const base = bootstrapDocumentGraph(makeDoc());
    const doc = {
      ...base,
      layers: base.layers.map((layer) => ({ ...layer, locked: layer.id === 'fill-a' })),
    };
    const next = reorderDocumentLayers(doc, [doc.layers[1]!, doc.layers[0]!]);

    expect(next).toBe(doc);
  });

  it('reorders layers in custom graphs by syncing the stack export path', () => {
    const doc = makeDoc(makeGraph());
    const reordered = [doc.layers[1]!, doc.layers[0]!];
    const next = reorderDocumentLayers(doc, reordered);

    expectReorderedTextBeforeFill(next);
    expect(next.graph?.positions[EXPORT_NODE_ID]?.x).toBeGreaterThan(next.graph?.positions['fill-a']?.x ?? 0);
    expect(next.graph?.mergeNodes.map((node) => node.id)).toEqual(['merge-a']);
    expect(next.graph?.colorNodes.map((node) => node.id)).toEqual(['color-a']);
    expect(next.graph?.repeatNodes?.map((node) => node.id)).toEqual(['repeat-a']);
  });

  it('drops stale layer and export edges when syncing custom graphs to the layer stack', () => {
    const graph: CanvasGraph = {
      ...makeGraph(),
      edges: [
        { id: 'e-merge-color', fromId: 'merge-a', fromPort: 'out', toId: 'color-a', toPort: 'in' },
        { id: 'e-color-repeat', fromId: 'color-a', fromPort: 'out', toId: 'repeat-a', toPort: 'in' },
        { id: 'e-fill-merge', fromId: 'fill-a', fromPort: 'out', toId: 'merge-a', toPort: 'a' },
        { id: 'e-text-export', fromId: 'text-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
        { id: 'e-repeat-export', fromId: 'repeat-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
    };
    const doc = makeDoc(graph);
    const next = reorderDocumentLayers(doc, [doc.layers[1]!, doc.layers[0]!]);

    expect(next.graph?.edges).toEqual([
      { id: 'e-merge-color', fromId: 'merge-a', fromPort: 'out', toId: 'color-a', toPort: 'in' },
      { id: 'e-color-repeat', fromId: 'color-a', fromPort: 'out', toId: 'repeat-a', toPort: 'in' },
      { id: 'e-text-a-fill-a', fromId: 'text-a', fromPort: 'out', toId: 'fill-a', toPort: 'bg' },
      { id: 'e-fill-a-__export__', fromId: 'fill-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
    ]);
    expect(next.graph?.edges.some((edge) => edge.id === 'e-fill-merge')).toBe(false);
    expect(next.graph?.edges.some((edge) => edge.id === 'e-repeat-export')).toBe(false);
  });

  it('preserves material side-input edges when syncing custom graphs to the layer stack', () => {
    const graph: CanvasGraph = {
      ...makeGraph(),
      edges: [
        { id: 'e-material-fill', fromId: 'material-a', fromPort: 'out', toId: 'fill-a', toPort: 'material' },
        { id: 'e-fill-text', fromId: 'fill-a', fromPort: 'out', toId: 'text-a', toPort: 'bg' },
        { id: 'e-text-export', fromId: 'text-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
    };
    const doc = makeDoc(graph);
    const next = reorderDocumentLayers(doc, [doc.layers[1]!, doc.layers[0]!]);

    expect(next.graph?.edges).toContainEqual({
      id: 'e-material-fill',
      fromId: 'material-a',
      fromPort: 'out',
      toId: 'fill-a',
      toPort: 'material',
    });
    expect(next.graph?.materialNodes?.map((node) => node.id)).toEqual(['material-a']);
  });

  it('preserves material texture-map input edges when syncing custom graphs to the layer stack', () => {
    const graph: CanvasGraph = {
      ...makeGraph(),
      edges: [
        { id: 'e-fill-material-albedo', fromId: 'fill-a', fromPort: 'out', toId: 'material-a', toPort: 'albedo' },
        { id: 'e-fill-text', fromId: 'fill-a', fromPort: 'out', toId: 'text-a', toPort: 'bg' },
        { id: 'e-text-export', fromId: 'text-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
    };
    const doc = makeDoc(graph);
    const next = reorderDocumentLayers(doc, [doc.layers[1]!, doc.layers[0]!]);

    expect(next.graph?.edges).toContainEqual({
      id: 'e-fill-material-albedo',
      fromId: 'fill-a',
      fromPort: 'out',
      toId: 'material-a',
      toPort: 'albedo',
    });
    expect(next.graph?.materialNodes?.map((node) => node.id)).toEqual(['material-a']);
  });

  it('adds material nodes directly to primitive material inputs', () => {
    const primitive = makeSourceLayer('primitive', { id: 'primitive-a', name: 'Primitive A' });
    const doc: CanvasDocument = {
      ...makeDoc(),
      layers: [primitive],
      graph: {
        edges: [
          { id: 'e-primitive-export', fromId: 'primitive-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
        ],
        positions: { 'primitive-a': { x: 0, y: 80 }, [EXPORT_NODE_ID]: { x: 520, y: 80 } },
        mergeNodes: [],
        colorNodes: [],
      },
    };

    const result = addNodeAtDocument(
      doc,
      { kind: 'material' },
      { x: -260, y: 120 },
      { targetId: 'primitive-a', targetPort: 'material' },
      makeEdgeId,
    );
    const materialNode = result.doc.graph?.materialNodes?.[0];

    expect(result.selectedLayerId).toBeNull();
    expect(materialNode).toMatchObject({ name: 'PBR Material', materialPreset: 'matte', materialMetalness: 0.18 });
    expect(result.doc.graph?.edges).toContainEqual({
      id: `edge-0-${materialNode?.id}-primitive-a`,
      fromId: materialNode?.id,
      fromPort: 'out',
      toId: 'primitive-a',
      toPort: 'material',
    });
    expect(result.doc.graph?.edges).toContainEqual({
      id: 'e-primitive-export',
      fromId: 'primitive-a',
      fromPort: 'out',
      toId: EXPORT_NODE_ID,
      toPort: 'in',
    });
  });

  it('adds material nodes directly to 3D scene material inputs', () => {
    const model = makeSourceLayer('model', { id: 'model-a', name: 'Model A' });
    const scene = makeGraphScene3DNode({ id: 'scene-a', name: 'Scene A' });
    const doc: CanvasDocument = {
      ...makeDoc(),
      layers: [model],
      graph: {
        edges: [
          { id: 'e-model-scene', fromId: 'model-a', fromPort: 'out', toId: 'scene-a', toPort: 'model' },
          { id: 'e-scene-export', fromId: 'scene-a', fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
        ],
        positions: {
          'model-a': { x: 0, y: 80 },
          'scene-a': { x: 360, y: 80 },
          [EXPORT_NODE_ID]: { x: 720, y: 80 },
        },
        mergeNodes: [],
        colorNodes: [],
        scene3dNodes: [scene],
      },
    };

    const result = addNodeAtDocument(
      doc,
      { kind: 'material' },
      { x: 120, y: 520 },
      { targetId: 'scene-a', targetPort: 'material' },
      makeEdgeId,
    );
    const materialNode = result.doc.graph?.materialNodes?.[0];

    expect(result.selectedLayerId).toBeNull();
    expect(materialNode).toMatchObject({ name: 'PBR Material', materialPreset: 'matte' });
    expect(result.doc.graph?.edges).toContainEqual({
      id: `edge-0-${materialNode?.id}-scene-a`,
      fromId: materialNode?.id,
      fromPort: 'out',
      toId: 'scene-a',
      toPort: 'material',
    });
  });

  it('does not remove a locked layer', () => {
    const doc = makeLockedFillDoc();
    const next = removeLayerFromDocument(doc, 'fill-a');

    expect(next).toBe(doc);
  });

  it('skips locked layer-backed nodes when deleting a mixed node selection', () => {
    const doc = makeLockedFillDoc();
    const next = deleteNodesFromDocument(doc, ['fill-a', 'text-a']);

    expect(next.layers.map((layer) => layer.id)).toEqual(['fill-a']);
    expect(next.graph?.positions['fill-a']).toEqual(doc.graph?.positions['fill-a']);
    expect(next.graph?.edges.some((edge) => edge.fromId === 'text-a' || edge.toId === 'text-a')).toBe(false);
  });

  it('updates layer, merge node, color node, repeat node, material node, global, export, and graph immutably', () => {
    const doc = makeDoc(makeGraph());
    const graph: CanvasGraph = { edges: [], positions: {}, mergeNodes: [], colorNodes: [] };

    expect(updateLayerInDocument(doc, 'text-a', { content: 'B' }).layers[1]).toMatchObject({ content: 'B' });
    expect(updateMergeNodeInDocument(doc, 'merge-a', { opacity: 25 }).graph?.mergeNodes[0]?.opacity).toBe(25);
    expect(updateColorNodeInDocument(doc, 'color-a', { saturation: 140 }).graph?.colorNodes[0]?.saturation).toBe(140);
    expect(updateRepeatNodeInDocument(doc, 'repeat-a', { count: 8 }).graph?.repeatNodes?.[0]?.count).toBe(8);
    expect(
      updateMaterialNodeInDocument(doc, 'material-a', { materialRoughness: 0.16 }).graph?.materialNodes?.[0]
        ?.materialRoughness,
    ).toBe(0.16);
    expect(
      updateTransformNodeInDocument(doc, 'transform-a', { rotation: 45 }).graph?.transformNodes?.[0]?.rotation,
    ).toBe(45);
    expect(updateGrimeShadowNodeInDocument(doc, 'shadow-a', { grime: 66 }).graph?.grimeShadowNodes?.[0]?.grime).toBe(
      66,
    );
    expect(updateShaderNodeInDocument(doc, 'shader-a', { distortion: 70 }).graph?.shaderNodes?.[0]?.distortion).toBe(
      70,
    );
    expect(setDocumentSeed(doc, 99).global.seed).toBe(99);
    expect(setDocumentAspect(doc, '16:9').global.aspect).toBe('16:9');
    expect(updateGlobalInDocument(doc, { bg: '#ffffff' }).global.bg).toBe('#ffffff');
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
