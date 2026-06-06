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
import type { AddAction } from './addActions';
import { makeArrayPresetLayer } from './arrayPresets';
import { canDeleteLayer, canDeleteNodeFromDocument, canReorderDocumentLayers } from './editorGuardrails';
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
import { makeNoisePresetLayer } from './noisePresets';
import { makeRepeatPresetNode } from './repeatPresets';
import { makeTextPresetLayer, type TextPresetId } from './textPresets';

export type DocumentAddAction = AddAction;

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

function ensureDocumentGraph(doc: CanvasDocument): CanvasGraph {
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
  return (
    graphHasOnlyLayerNodes(graph) &&
    graphHasLinearEdgeCount(graph, doc.layers) &&
    hasExpectedLinearEdges(graph, doc.layers)
  );
}

function graphHasOnlyLayerNodes(graph: CanvasGraph) {
  return (
    graph.mergeNodes.length === 0 && (graph.colorNodes?.length ?? 0) === 0 && (graph.repeatNodes?.length ?? 0) === 0
  );
}

function graphHasLinearEdgeCount(graph: CanvasGraph, layers: Layer[]) {
  return graph.edges.length === layers.length;
}

function hasExpectedLinearEdges(graph: CanvasGraph, layers: Layer[]) {
  return layers.every((layer, index) => graphHasExpectedLinearEdge(graph, layer, layers[index + 1] ?? EXPORT_NODE_ID));
}

function graphHasExpectedLinearEdge(graph: CanvasGraph, layer: Layer, next: Layer | string) {
  const expected = expectedLinearGraphEdge(layer.id, next);
  return graph.edges.some((edge) => isExpectedLinearEdge(edge, expected));
}

function isExpectedLinearEdge(edge: GraphEdge, expected: ReturnType<typeof expectedLinearGraphEdge>) {
  return (
    edge.fromId === expected.fromId &&
    edge.fromPort === 'out' &&
    edge.toId === expected.toId &&
    edge.toPort === expected.toPort
  );
}

export function canInsertLayerAbove(doc: CanvasDocument, targetLayerId: string): boolean {
  return doc.layers.some((layer) => layer.id === targetLayerId);
}

function insertLayerIntoLinearGraph(doc: CanvasDocument, targetLayerId: string, layer: Layer): CanvasGraph {
  const graph = doc.graph ?? inferLinearGraph(doc.layers);
  const targetIndex = doc.layers.findIndex((item) => item.id === targetLayerId);
  const nextLayer = doc.layers[targetIndex + 1];
  const nextNodeId = nextLayer?.id ?? EXPORT_NODE_ID;
  const existingEdge = graph.edges.find((edge) => edge.fromId === targetLayerId && edge.toId === nextNodeId);
  const targetPosition = graph.positions[targetLayerId] ?? nextDropPosition(graph);
  const nextPosition = nextLayer ? graph.positions[nextLayer.id] : graph.positions[EXPORT_NODE_ID];
  const position = insertedLinearLayerPosition(targetPosition, nextPosition);
  let nextGraph = addLayerToGraph(graph, layer.id, position);

  if (existingEdge) nextGraph = removeGraphEdge(nextGraph, existingEdge.id);
  nextGraph = addGraphEdge(nextGraph, linearGraphEdge(targetLayerId, layer.id, layerInputPort(layer)));
  nextGraph = addGraphEdge(
    nextGraph,
    linearGraphEdge(layer.id, nextNodeId, nextLayer ? layerInputPort(nextLayer) : 'in'),
  );
  return nextGraph;
}

function linearGraphEdge(fromId: string, toId: string, toPort: GraphEdge['toPort']): GraphEdge {
  return {
    id: `e-${fromId}-${toId}`,
    fromId,
    fromPort: 'out',
    toId,
    toPort,
  };
}

function insertedLinearLayerPosition(
  targetPosition: { x: number; y: number },
  nextPosition: { x: number; y: number } | undefined,
) {
  if (!nextPosition) return { x: targetPosition.x + 360, y: targetPosition.y };
  return {
    x: Math.round((targetPosition.x + nextPosition.x) / 2),
    y: Math.round((targetPosition.y + nextPosition.y) / 2),
  };
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

function removeLayersFromGraphAreaInDocument(doc: CanvasDocument, areaId: string, layerIds: string[]): CanvasDocument {
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
  const edge = insertionReplacementEdge(graph, insertion);
  const sourceIndex = layerIndex.get(insertionEndpointId(insertion?.sourceId, edge?.fromId));
  const targetIndex = layerIndex.get(insertionEndpointId(insertion?.targetId, edge?.toId));
  return insertionIndexFromEndpoints(sourceIndex, targetIndex, layers.length);
}

function insertionReplacementEdge(graph: CanvasGraph, insertion?: DocumentInsertConnectionConfig) {
  if (!insertion?.replaceEdgeId) return undefined;
  return graph.edges.find((item) => item.id === insertion.replaceEdgeId);
}

function insertionEndpointId(configuredId: string | undefined, edgeId: string | undefined) {
  return configuredId ?? edgeId ?? '';
}

function insertionIndexFromEndpoints(
  sourceIndex: number | undefined,
  targetIndex: number | undefined,
  fallback: number,
) {
  if (sourceIndex !== undefined && targetIndex !== undefined)
    return insertionIndexBetweenEndpoints(sourceIndex, targetIndex);
  if (sourceIndex !== undefined) return sourceIndex + 1;
  if (targetIndex !== undefined) return targetIndex;
  return fallback;
}

function insertionIndexBetweenEndpoints(sourceIndex: number, targetIndex: number) {
  return sourceIndex < targetIndex ? Math.min(sourceIndex + 1, targetIndex) : sourceIndex + 1;
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

function addGraphOnlyNodeAtDocument(
  doc: CanvasDocument,
  action: Extract<DocumentAddAction, { kind: 'merge' | 'color' | 'repeat' | 'repeatPreset' }>,
  position: { x: number; y: number },
  insertion?: DocumentInsertConnectionConfig,
  createEdgeId?: CreateGraphEdgeId,
): AddNodeAtDocumentResult {
  const graph = connectInsertedGraphOnlyNode(doc, action, position, insertion, createEdgeId);
  return { doc: { ...doc, graph }, selectedLayerId: null };
}

function connectInsertedGraphOnlyNode(
  doc: CanvasDocument,
  action: Extract<DocumentAddAction, { kind: 'merge' | 'color' | 'repeat' | 'repeatPreset' }>,
  position: { x: number; y: number },
  insertion?: DocumentInsertConnectionConfig,
  createEdgeId?: CreateGraphEdgeId,
) {
  if (action.kind === 'merge') {
    const node = makeGraphMergeNode();
    return connectInsertedNode(
      addMergeNode(ensureDocumentGraph(doc), node, position),
      node.id,
      'a',
      insertion,
      createEdgeId,
    );
  }
  if (action.kind === 'color') {
    const node = makeGraphColorNode();
    return connectInsertedNode(
      addColorNode(ensureDocumentGraph(doc), node, position),
      node.id,
      'in',
      insertion,
      createEdgeId,
    );
  }
  const node = action.kind === 'repeatPreset' ? makeRepeatPresetNode(action.preset) : makeGraphRepeatNode();
  return connectInsertedNode(
    addRepeatNode(ensureDocumentGraph(doc), node, position),
    node.id,
    'in',
    insertion,
    createEdgeId,
  );
}

function isGraphOnlyAddAction(
  action: DocumentAddAction,
): action is Extract<DocumentAddAction, { kind: 'merge' | 'color' | 'repeat' | 'repeatPreset' }> {
  return (
    action.kind === 'merge' || action.kind === 'color' || action.kind === 'repeat' || action.kind === 'repeatPreset'
  );
}

function layerForAddAction(
  action: Exclude<DocumentAddAction, { kind: 'merge' | 'color' | 'repeat' | 'repeatPreset' }>,
) {
  if (action.kind === 'effect') return createEffectPresetLayer(action.preset);
  if (action.kind === 'noisePreset') return withGeneratedNodeSeed(makeNoisePresetLayer(action.preset));
  if (action.kind === 'arrayPreset') return makeArrayPresetLayer(action.preset);
  if (action.kind === 'textPreset') return createTextPresetLayer(action.preset);
  if (action.kind === 'aiImage') return createAiImageLayer();
  return withGeneratedNodeSeed(createLayerOfKind(action.layerKind));
}

function insertedLayerInputPort(action: DocumentAddAction): GraphEdge['toPort'] {
  return action.kind === 'effect' ? 'in' : 'bg';
}

export function addNodeAtDocument(
  doc: CanvasDocument,
  action: DocumentAddAction,
  position: { x: number; y: number },
  insertion?: DocumentInsertConnectionConfig,
  createEdgeId?: CreateGraphEdgeId,
): AddNodeAtDocumentResult {
  if (isGraphOnlyAddAction(action)) return addGraphOnlyNodeAtDocument(doc, action, position, insertion, createEdgeId);

  const layer = layerForAddAction(action);
  const baseGraph = ensureDocumentGraph(doc);
  const graph = connectInsertedNode(
    addLayerToGraph(baseGraph, layer.id, position),
    layer.id,
    insertedLayerInputPort(action),
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
  if (!canDeleteLayer(layer)) return doc;
  return {
    ...doc,
    layers: doc.layers.filter((layer) => layer.id !== id),
    graph: doc.graph ? removeLayerFromGraph(doc.graph, id) : undefined,
  };
}

function removeMatchingGraphNodes<T extends { id: string }>(
  graph: CanvasGraph,
  nodes: T[] | undefined,
  idSet: Set<string>,
  removeNode: (next: CanvasGraph, id: string) => CanvasGraph,
) {
  let next = graph;
  for (const node of nodes ?? []) {
    if (idSet.has(node.id)) next = removeNode(next, node.id);
  }
  return next;
}

function removeDeletedGraphOnlyNodes(graph: CanvasGraph, idSet: Set<string>) {
  const withoutMerge = removeMatchingGraphNodes(graph, graph.mergeNodes, idSet, removeMergeNode);
  const withoutColor = removeMatchingGraphNodes(withoutMerge, withoutMerge.colorNodes, idSet, removeColorNode);
  return removeMatchingGraphNodes(withoutColor, withoutColor.repeatNodes, idSet, removeRepeatNode);
}

function removeDeletedLayerNodes(graph: CanvasGraph, layers: Layer[], idSet: Set<string>) {
  let next = graph;
  const layerIds = new Set(layers.map((layer) => layer.id));
  for (const id of idSet) {
    if (layerIds.has(id)) next = removeLayerFromGraph(next, id);
  }
  return next;
}

export function deleteNodesFromDocument(doc: CanvasDocument, ids: string[]): CanvasDocument {
  const idSet = new Set(ids.filter((id) => canDeleteNodeFromDocument(doc, id)));
  if (idSet.size === 0) return doc;
  const nextLayers = doc.layers.filter((layer) => !idSet.has(layer.id));
  let nextGraph = doc.graph;

  if (nextGraph) {
    nextGraph = removeDeletedGraphOnlyNodes(nextGraph, idSet);
    nextGraph = removeDeletedLayerNodes(nextGraph, doc.layers, idSet);
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
  if (!canReorderDocumentLayers(doc.layers, layers)) return doc;
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
