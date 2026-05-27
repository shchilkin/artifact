import {
  type AspectRatio,
  type CanvasDocument,
  type CanvasGraph,
  type EffectPreset,
  type GraphColorNode,
  type GraphEdge,
  type GraphMergeNode,
  type GraphRepeatNode,
  type Layer,
  type LayerKind,
  makeEffectPresetLayer,
  makeEmojiLayer,
  makeFillLayer,
  makeGraphColorNode,
  makeGraphMergeNode,
  makeGraphRepeatNode,
  makeImageLayer,
  makeSourceLayer,
  makeTextLayer,
} from '../types/config';
import type { ArrayPresetId } from './arrayPresets';
import { makeArrayPresetLayer } from './arrayPresets';
import {
  addColorNode,
  addGraphArea,
  addGraphEdge,
  addLayerToGraph,
  addMergeNode,
  addNodesToGraphArea,
  addRepeatNode,
  EXPORT_NODE_ID,
  GRAPH_AREA_COLORS,
  inferLinearGraph,
  nextDropPosition,
  removeColorNode,
  removeGraphArea,
  removeGraphEdge,
  removeLayerFromGraph,
  removeMergeNode,
  removeNodesFromGraphArea,
  removeRepeatNode,
  splitEdgeWithNode,
  updateColorNode as updateColorNodeInGraph,
  updateGraphArea,
  updateRepeatNode as updateRepeatNodeInGraph,
} from './nodeGraph';
import type { NoisePresetId } from './noisePresets';
import { makeNoisePresetLayer } from './noisePresets';
import type { RepeatPresetId } from './repeatPresets';
import { makeRepeatPresetNode } from './repeatPresets';
import { makeTextPresetLayer, type TextPresetId } from './textPresets';

export type DocumentAddAction =
  | { kind: 'layer'; layerKind: Exclude<LayerKind, 'effect'> }
  | { kind: 'textPreset'; preset: TextPresetId }
  | { kind: 'aiImage' }
  | { kind: 'noisePreset'; preset: NoisePresetId }
  | { kind: 'arrayPreset'; preset: ArrayPresetId }
  | { kind: 'effect'; preset: EffectPreset }
  | { kind: 'merge' }
  | { kind: 'color' }
  | { kind: 'repeat' }
  | { kind: 'repeatPreset'; preset: RepeatPresetId };

export interface DocumentInsertConnectionConfig {
  sourceId?: string;
  targetId?: string;
  targetPort?: GraphEdge['toPort'];
  replaceEdgeId?: string;
}

export interface AddNodeAtDocumentResult {
  doc: CanvasDocument;
  selectedLayerId: string | null;
}

type CreateGraphEdgeId = (fromId: string, toId: string, index: number) => string;

export function ensureDocumentGraph(doc: CanvasDocument): CanvasGraph {
  return doc.graph ?? inferLinearGraph(doc.layers);
}

export function bootstrapDocumentGraph(doc: CanvasDocument): CanvasDocument {
  return doc.graph ? doc : { ...doc, graph: inferLinearGraph(doc.layers) };
}

export function createLayerOfKind(kind: Exclude<LayerKind, 'effect'>): Layer {
  const layer =
    kind === 'text'
      ? makeTextLayer()
      : kind === 'image'
        ? makeImageLayer('')
        : kind === 'fill'
          ? makeFillLayer()
          : kind === 'emoji'
            ? makeEmojiLayer()
            : makeSourceLayer(kind);
  return withGeneratedNodeSeed(layer);
}

export function createTextPresetLayer(preset: TextPresetId): Layer {
  return makeTextPresetLayer(preset);
}

export function createEffectPresetLayer(preset: EffectPreset): Layer {
  return makeEffectPresetLayer(preset);
}

export function createImageLayerFromSource(src: string): Layer {
  return makeImageLayer(src);
}

export function createAiImageLayer(): Layer {
  return makeImageLayer('', {
    name: 'AI Image',
    fit: 'cover',
  });
}

function nodeSeedOffsetFromId(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash % 9999) + 1;
}

function withGeneratedNodeSeed(layer: Layer): Layer {
  if (layer.kind !== 'noise') return layer;
  if (layer.seedOffset !== 0) return layer;
  return { ...layer, seedOffset: nodeSeedOffsetFromId(layer.id) };
}

function syncGraphToLayerStackOrder(graph: CanvasGraph, layers: Layer[]): CanvasGraph {
  const linearGraph = inferLinearGraph(layers);
  const layerOrExportIds = new Set([...layers.map((layer) => layer.id), EXPORT_NODE_ID]);
  const graphOnlyEdges = graph.edges.filter(
    (edge) => !layerOrExportIds.has(edge.fromId) && !layerOrExportIds.has(edge.toId),
  );
  return {
    ...graph,
    edges: [...graphOnlyEdges, ...linearGraph.edges],
    positions: { ...graph.positions, ...linearGraph.positions },
    mergeNodes: graph.mergeNodes ?? [],
    colorNodes: graph.colorNodes ?? [],
    repeatNodes: graph.repeatNodes ?? [],
  };
}

export function addLayerToDocument(doc: CanvasDocument, layer: Layer): CanvasDocument {
  if (!doc.graph) return { ...doc, layers: [...doc.layers, layer] };
  const layers = [...doc.layers, layer];
  return {
    ...doc,
    layers,
    graph: syncGraphToLayerStackOrder(addLayerToGraph(doc.graph, layer.id, nextDropPosition(doc.graph)), layers),
  };
}

function layerInputPort(layer: Layer): GraphEdge['toPort'] {
  return layer.kind === 'effect' ? 'in' : 'bg';
}

function expectedLinearGraphEdge(fromId: string, toLayerOrExport: Layer | string) {
  const toId = typeof toLayerOrExport === 'string' ? toLayerOrExport : toLayerOrExport.id;
  return {
    fromId,
    toId,
    toPort: typeof toLayerOrExport === 'string' ? 'in' : layerInputPort(toLayerOrExport),
  };
}

function isLinearLayerGraph(doc: CanvasDocument): boolean {
  const graph = doc.graph;
  if (!graph) return true;
  if (graph.mergeNodes.length > 0 || (graph.colorNodes?.length ?? 0) > 0 || (graph.repeatNodes?.length ?? 0) > 0)
    return false;
  if (graph.edges.length !== doc.layers.length) return false;
  if (doc.layers.length === 0) return graph.edges.length === 0;

  return doc.layers.every((layer, index) => {
    const next = doc.layers[index + 1] ?? EXPORT_NODE_ID;
    const expected = expectedLinearGraphEdge(layer.id, next);
    return graph.edges.some(
      (edge) =>
        edge.fromId === expected.fromId &&
        edge.fromPort === 'out' &&
        edge.toId === expected.toId &&
        edge.toPort === expected.toPort,
    );
  });
}

export function canInsertLayerAbove(doc: CanvasDocument, targetLayerId: string): boolean {
  return doc.layers.some((layer) => layer.id === targetLayerId);
}

function insertLayerIntoLinearGraph(doc: CanvasDocument, targetLayerId: string, layer: Layer): CanvasGraph {
  const graph = doc.graph ?? inferLinearGraph(doc.layers);
  const targetIndex = doc.layers.findIndex((item) => item.id === targetLayerId);
  const nextLayer = doc.layers[targetIndex + 1];
  const existingEdge = graph.edges.find(
    (edge) => edge.fromId === targetLayerId && edge.toId === (nextLayer?.id ?? EXPORT_NODE_ID),
  );
  const targetPosition = graph.positions[targetLayerId] ?? nextDropPosition(graph);
  const nextPosition = nextLayer ? graph.positions[nextLayer.id] : graph.positions[EXPORT_NODE_ID];
  const position = nextPosition
    ? { x: Math.round((targetPosition.x + nextPosition.x) / 2), y: Math.round((targetPosition.y + nextPosition.y) / 2) }
    : { x: targetPosition.x + 360, y: targetPosition.y };
  let nextGraph = addLayerToGraph(graph, layer.id, position);

  if (existingEdge) nextGraph = removeGraphEdge(nextGraph, existingEdge.id);
  nextGraph = addGraphEdge(nextGraph, {
    id: `e-${targetLayerId}-${layer.id}`,
    fromId: targetLayerId,
    fromPort: 'out',
    toId: layer.id,
    toPort: layerInputPort(layer),
  });
  nextGraph = addGraphEdge(nextGraph, {
    id: `e-${layer.id}-${nextLayer?.id ?? EXPORT_NODE_ID}`,
    fromId: layer.id,
    fromPort: 'out',
    toId: nextLayer?.id ?? EXPORT_NODE_ID,
    toPort: nextLayer ? layerInputPort(nextLayer) : 'in',
  });
  return nextGraph;
}

export function insertLayerAboveInDocument(doc: CanvasDocument, targetLayerId: string, layer: Layer): CanvasDocument {
  if (!canInsertLayerAbove(doc, targetLayerId)) return doc;
  const targetIndex = doc.layers.findIndex((item) => item.id === targetLayerId);
  const layers = [...doc.layers];
  layers.splice(targetIndex + 1, 0, layer);
  if (!doc.graph) return { ...doc, layers };
  if (!isLinearLayerGraph(doc)) {
    return {
      ...doc,
      layers,
      graph: syncGraphToLayerStackOrder(addLayerToGraph(doc.graph, layer.id, nextDropPosition(doc.graph)), layers),
    };
  }
  return {
    ...doc,
    layers,
    graph: insertLayerIntoLinearGraph(doc, targetLayerId, layer),
  };
}

export function createGraphAreaInDocument(doc: CanvasDocument, nodeIds: string[]): CanvasDocument {
  const graph = ensureDocumentGraph(doc);
  const areaNumber = (graph.areas?.length ?? 0) + 1;
  const color = GRAPH_AREA_COLORS[(areaNumber - 1) % GRAPH_AREA_COLORS.length];
  return {
    ...doc,
    graph: addGraphArea(graph, {
      id: `area-${Date.now().toString(36)}`,
      name: `Area ${areaNumber}`,
      color,
      nodeIds,
    }),
  };
}

export function addLayersToGraphAreaInDocument(
  doc: CanvasDocument,
  areaId: string,
  layerIds: string[],
): CanvasDocument {
  return {
    ...doc,
    graph: addNodesToGraphArea(ensureDocumentGraph(doc), areaId, layerIds),
  };
}

export function renameGraphAreaInDocument(doc: CanvasDocument, areaId: string, name: string): CanvasDocument {
  const trimmed = name.trim();
  if (!trimmed) return doc;
  return {
    ...doc,
    graph: updateGraphArea(ensureDocumentGraph(doc), areaId, { name: trimmed }),
  };
}

export function removeLayersFromGraphAreaInDocument(
  doc: CanvasDocument,
  areaId: string,
  layerIds: string[],
): CanvasDocument {
  return removeNodesFromGraphAreaInDocument(doc, areaId, layerIds);
}

export function removeNodesFromGraphAreaInDocument(
  doc: CanvasDocument,
  areaId: string,
  nodeIds: string[],
): CanvasDocument {
  return {
    ...doc,
    graph: removeNodesFromGraphArea(ensureDocumentGraph(doc), areaId, nodeIds),
  };
}

export function removeNodesFromAllGraphAreasInDocument(doc: CanvasDocument, nodeIds: string[]): CanvasDocument {
  if (!doc.graph?.areas || nodeIds.length === 0) return doc;
  const idSet = new Set(nodeIds);
  let next = doc;
  for (const area of doc.graph.areas) {
    const areaNodeIds = area.nodeIds.filter((id) => idSet.has(id));
    if (areaNodeIds.length > 0) {
      next = removeNodesFromGraphAreaInDocument(next, area.id, areaNodeIds);
    }
  }
  return next;
}

export function removeGraphAreaInDocument(doc: CanvasDocument, areaId: string): CanvasDocument {
  return {
    ...doc,
    graph: removeGraphArea(ensureDocumentGraph(doc), areaId),
  };
}

function defaultCreateGraphEdgeId(fromId: string, toId: string, index: number): string {
  return `e-${fromId}-${toId}-${Date.now() + index}`;
}

function connectInsertedNode(
  graph: CanvasGraph,
  insertedNodeId: string,
  insertedInputPort: GraphEdge['toPort'],
  insertion?: DocumentInsertConnectionConfig,
  createEdgeId: CreateGraphEdgeId = defaultCreateGraphEdgeId,
): CanvasGraph {
  if (insertion?.replaceEdgeId) {
    return splitEdgeWithNode(graph, insertion.replaceEdgeId, insertedNodeId, insertedInputPort);
  }

  let next = graph;
  if (insertion?.sourceId) {
    next = addGraphEdge(next, {
      id: createEdgeId(insertion.sourceId, insertedNodeId, 0),
      fromId: insertion.sourceId,
      fromPort: 'out',
      toId: insertedNodeId,
      toPort: insertedInputPort,
    });
  }

  if (insertion?.targetId) {
    next = addGraphEdge(next, {
      id: createEdgeId(insertedNodeId, insertion.targetId, insertion.sourceId ? 1 : 0),
      fromId: insertedNodeId,
      fromPort: 'out',
      toId: insertion.targetId,
      toPort: insertion.targetPort ?? 'in',
    });
  }

  return next;
}

function insertionLayerIndex(layers: Layer[], graph: CanvasGraph, insertion?: DocumentInsertConnectionConfig): number {
  const layerIndex = new Map(layers.map((layer, index) => [layer.id, index]));
  const edge = insertion?.replaceEdgeId ? graph.edges.find((item) => item.id === insertion.replaceEdgeId) : undefined;
  const sourceIndex = layerIndex.get(insertion?.sourceId ?? edge?.fromId ?? '');
  const targetIndex = layerIndex.get(insertion?.targetId ?? edge?.toId ?? '');

  if (sourceIndex !== undefined && targetIndex !== undefined) {
    return sourceIndex < targetIndex ? Math.min(sourceIndex + 1, targetIndex) : sourceIndex + 1;
  }
  if (sourceIndex !== undefined) return sourceIndex + 1;
  if (targetIndex !== undefined) return targetIndex;
  return layers.length;
}

function insertLayerForGraphConnection(
  layers: Layer[],
  layer: Layer,
  graph: CanvasGraph,
  insertion?: DocumentInsertConnectionConfig,
): Layer[] {
  const next = [...layers];
  next.splice(insertionLayerIndex(layers, graph, insertion), 0, layer);
  return next;
}

export function addNodeAtDocument(
  doc: CanvasDocument,
  action: DocumentAddAction,
  position: { x: number; y: number },
  insertion?: DocumentInsertConnectionConfig,
  createEdgeId?: CreateGraphEdgeId,
): AddNodeAtDocumentResult {
  if (action.kind === 'merge') {
    const node = makeGraphMergeNode();
    const graph = connectInsertedNode(
      addMergeNode(ensureDocumentGraph(doc), node, position),
      node.id,
      'a',
      insertion,
      createEdgeId,
    );
    return { doc: { ...doc, graph }, selectedLayerId: null };
  }

  if (action.kind === 'color') {
    const node = makeGraphColorNode();
    const graph = connectInsertedNode(
      addColorNode(ensureDocumentGraph(doc), node, position),
      node.id,
      'in',
      insertion,
      createEdgeId,
    );
    return { doc: { ...doc, graph }, selectedLayerId: null };
  }

  if (action.kind === 'repeat' || action.kind === 'repeatPreset') {
    const node = action.kind === 'repeatPreset' ? makeRepeatPresetNode(action.preset) : makeGraphRepeatNode();
    const graph = connectInsertedNode(
      addRepeatNode(ensureDocumentGraph(doc), node, position),
      node.id,
      'in',
      insertion,
      createEdgeId,
    );
    return { doc: { ...doc, graph }, selectedLayerId: null };
  }

  const layer =
    action.kind === 'effect'
      ? createEffectPresetLayer(action.preset)
      : action.kind === 'noisePreset'
        ? withGeneratedNodeSeed(makeNoisePresetLayer(action.preset))
        : action.kind === 'arrayPreset'
          ? makeArrayPresetLayer(action.preset)
          : action.kind === 'textPreset'
            ? createTextPresetLayer(action.preset)
            : action.kind === 'aiImage'
              ? createAiImageLayer()
              : withGeneratedNodeSeed(createLayerOfKind(action.layerKind));
  const baseGraph = ensureDocumentGraph(doc);
  const graph = connectInsertedNode(
    addLayerToGraph(baseGraph, layer.id, position),
    layer.id,
    action.kind === 'effect' ? 'in' : 'bg',
    insertion,
    createEdgeId,
  );

  return {
    doc: {
      ...doc,
      layers: insertLayerForGraphConnection(doc.layers, layer, baseGraph, insertion),
      graph,
    },
    selectedLayerId: layer.id,
  };
}

export function removeLayerFromDocument(doc: CanvasDocument, id: string): CanvasDocument {
  const layer = doc.layers.find((item) => item.id === id);
  if (layer?.locked) return doc;
  return {
    ...doc,
    layers: doc.layers.filter((layer) => layer.id !== id),
    graph: doc.graph ? removeLayerFromGraph(doc.graph, id) : undefined,
  };
}

export function deleteNodesFromDocument(doc: CanvasDocument, ids: string[]): CanvasDocument {
  const lockedLayerIds = new Set(doc.layers.filter((layer) => layer.locked).map((layer) => layer.id));
  const idSet = new Set(ids.filter((id) => !lockedLayerIds.has(id)));
  if (idSet.size === 0) return doc;
  const nextLayers = doc.layers.filter((layer) => !idSet.has(layer.id));
  let nextGraph = doc.graph;

  if (nextGraph) {
    for (const mergeNode of nextGraph.mergeNodes) {
      if (idSet.has(mergeNode.id)) nextGraph = removeMergeNode(nextGraph, mergeNode.id);
    }
    for (const colorNode of nextGraph?.colorNodes ?? []) {
      if (idSet.has(colorNode.id)) nextGraph = removeColorNode(nextGraph!, colorNode.id);
    }
    for (const repeatNode of nextGraph?.repeatNodes ?? []) {
      if (idSet.has(repeatNode.id)) nextGraph = removeRepeatNode(nextGraph!, repeatNode.id);
    }
    for (const id of idSet) {
      if (doc.layers.some((layer) => layer.id === id)) nextGraph = removeLayerFromGraph(nextGraph!, id);
    }
  }

  return { ...doc, layers: nextLayers, graph: nextGraph };
}

export function updateLayerInDocument(doc: CanvasDocument, id: string, patch: Partial<Layer>): CanvasDocument {
  return {
    ...doc,
    layers: doc.layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
  };
}

export function renameLayerInDocument(doc: CanvasDocument, id: string, name: string): CanvasDocument {
  const trimmed = name.trim();
  if (!trimmed) return doc;
  return updateLayerInDocument(doc, id, { name: trimmed });
}

export function toggleLayerVisibilityInDocument(doc: CanvasDocument, id: string): CanvasDocument {
  const layer = doc.layers.find((item) => item.id === id);
  if (!layer) return doc;
  return updateLayerInDocument(doc, id, { visible: !layer.visible });
}

export function setLayersVisibilityInDocument(doc: CanvasDocument, ids: string[], visible: boolean): CanvasDocument {
  if (ids.length === 0) return doc;
  const idSet = new Set(ids);
  return {
    ...doc,
    layers: doc.layers.map((layer) => (idSet.has(layer.id) ? { ...layer, visible } : layer)),
  };
}

export function replaceSelectedImageSourceInDocument(
  doc: CanvasDocument,
  selectedLayerId: string | null,
  src: string,
): CanvasDocument {
  if (!selectedLayerId) return doc;
  const layer = doc.layers.find((item) => item.id === selectedLayerId);
  if (layer?.kind !== 'image') return doc;
  return updateLayerInDocument(doc, selectedLayerId, { src });
}

export function updateMergeNodeInDocument(
  doc: CanvasDocument,
  id: string,
  patch: Partial<GraphMergeNode>,
): CanvasDocument {
  if (!doc.graph) return doc;
  return {
    ...doc,
    graph: {
      ...doc.graph,
      mergeNodes: doc.graph.mergeNodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
    },
  };
}

export function updateColorNodeInDocument(
  doc: CanvasDocument,
  id: string,
  patch: Partial<GraphColorNode>,
): CanvasDocument {
  if (!doc.graph) return doc;
  return { ...doc, graph: updateColorNodeInGraph(doc.graph, id, patch) };
}

export function updateRepeatNodeInDocument(
  doc: CanvasDocument,
  id: string,
  patch: Partial<GraphRepeatNode>,
): CanvasDocument {
  if (!doc.graph) return doc;
  return { ...doc, graph: updateRepeatNodeInGraph(doc.graph, id, patch) };
}

export function reorderDocumentLayers(doc: CanvasDocument, layers: Layer[]): CanvasDocument {
  const nextIndexById = new Map(layers.map((layer, index) => [layer.id, index]));
  if (doc.layers.some((layer, index) => layer.locked && nextIndexById.get(layer.id) !== index)) return doc;
  if (doc.graph) {
    return { ...doc, layers, graph: syncGraphToLayerStackOrder(doc.graph, layers) };
  }
  return { ...doc, layers };
}

export function reorderDocumentLayersAndRemoveFromGraphArea(
  doc: CanvasDocument,
  layers: Layer[],
  areaId: string,
  ids: string[],
): CanvasDocument {
  return removeLayersFromGraphAreaInDocument(reorderDocumentLayers(doc, layers), areaId, ids);
}

function cloneLayerForDuplicate(layer: Layer, id: string): Layer {
  if (layer.kind === 'emoji') {
    return {
      ...layer,
      emojis: [...layer.emojis],
      id,
      name: `${layer.name} copy`,
    };
  }
  return { ...layer, id, name: `${layer.name} copy` };
}

export function duplicateLayerInDocument(
  doc: CanvasDocument,
  id: string,
  createId: () => string = () => `layer-${Date.now()}`,
): { doc: CanvasDocument; layer: Layer | null } {
  const layer = doc.layers.find((item) => item.id === id);
  if (!layer) return { doc, layer: null };

  const duplicate = cloneLayerForDuplicate(layer, createId());
  const index = doc.layers.findIndex((item) => item.id === id);
  const nextLayers = [...doc.layers];
  nextLayers.splice(index + 1, 0, duplicate);

  if (!doc.graph) return { doc: { ...doc, layers: nextLayers }, layer: duplicate };
  return {
    doc: {
      ...doc,
      layers: nextLayers,
      graph: addLayerToGraph(doc.graph, duplicate.id, nextDropPosition(doc.graph)),
    },
    layer: duplicate,
  };
}

export function setDocumentSeed(doc: CanvasDocument, seed: number): CanvasDocument {
  return { ...doc, global: { ...doc.global, seed } };
}

export function setDocumentAspect(doc: CanvasDocument, aspect: AspectRatio): CanvasDocument {
  return { ...doc, global: { ...doc.global, aspect } };
}

export function updateGlobalInDocument(doc: CanvasDocument, patch: Partial<CanvasDocument['global']>): CanvasDocument {
  return { ...doc, global: { ...doc.global, ...patch } };
}

export function setDocumentGraph(doc: CanvasDocument, graph: CanvasGraph): CanvasDocument {
  return { ...doc, graph };
}

export function updateDocumentExportConfig(
  doc: CanvasDocument,
  patch: Partial<CanvasDocument['export']>,
): CanvasDocument {
  return { ...doc, export: { ...doc.export, ...patch } };
}
