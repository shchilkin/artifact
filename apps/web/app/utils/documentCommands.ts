import {
  type AspectRatio,
  type CanvasDocument,
  type CanvasGraph,
  type EffectPreset,
  type GraphEdge,
  type Layer,
  type LayerKind,
  MATERIAL_TEXTURE_INPUT_PORTS,
  type ModelLayer,
  makeEffectPresetLayer,
  makeEmojiLayer,
  makeFillLayer,
  makeImageLayer,
  makeSourceLayer,
  makeTextLayer,
} from '../types/config';
import type { GraphEnvironmentNode } from '../utils/nodeKinds';
import type { AddAction } from './addActions';
import { makeArrayPresetLayer } from './arrayPresets';
import { canDeleteLayer, canDeleteNodeFromDocument, canReorderDocumentLayers } from './editorGuardrails';
import {
  addGraphArea,
  addGraphEdge,
  addGraphNode,
  addLayerToGraph,
  addNodesToGraphArea,
  EXPORT_NODE_ID,
  findGraphNode,
  GRAPH_AREA_COLORS,
  inferLinearGraph,
  isLayerStackGraph,
  nextDropPosition,
  removeGraphArea,
  removeGraphEdge,
  removeGraphNode,
  removeLayerFromGraph,
  removeNodesFromGraphArea,
  splitEdgeWithNode,
  updateGraphArea,
  updateGraphNode,
} from './nodeGraph';
import {
  type GraphNode,
  type GraphNodeKind,
  type GraphNodePatch,
  graphNodeModel,
  isGraphNodeKind,
  modelOfNode,
} from './nodeKinds';

export { isLayerStackGraph } from './nodeGraph';

import { makeGraphEnvironmentNode } from './nodeKinds/environment';
import { makeGraphShaderNode } from './nodeKinds/shader';
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

export function createModelLayerFromAsset({
  src,
  name,
  mime,
  bytes,
}: {
  src: string;
  name: string;
  mime: string;
  bytes: number;
}): Layer {
  return makeSourceLayer('model', {
    modelSrc: src,
    modelName: name || 'Imported model',
    modelMime: mime || 'model/gltf-binary',
    modelBytes: bytes,
  }) as ModelLayer;
}

export function addEnvironmentMapToDocument(
  doc: CanvasDocument,
  asset: Pick<GraphEnvironmentNode, 'environmentSrc' | 'environmentName' | 'environmentMime' | 'environmentBytes'>,
  position?: { x: number; y: number },
): { doc: CanvasDocument; nodeId: string } {
  const node = makeGraphEnvironmentNode({
    name: asset.environmentName ? `Environment · ${asset.environmentName}` : 'Environment Map',
    environmentSrc: asset.environmentSrc,
    environmentName: asset.environmentName,
    environmentMime: asset.environmentMime,
    environmentBytes: asset.environmentBytes,
  });
  const graph = doc.graph;
  return {
    doc: {
      ...doc,
      graph: addGraphNode(graph, node, position ?? nextDropPosition(graph)),
    },
    nodeId: node.id,
  };
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
  if (layer.kind !== 'noise' && layer.kind !== 'lineField') return layer;
  if (layer.seedOffset !== 0) return layer;
  return { ...layer, seedOffset: nodeSeedOffsetFromId(layer.id) };
}

function syncGraphToLayerStackOrder(graph: CanvasGraph, layers: Layer[]): CanvasGraph {
  const linearGraph = inferLinearGraph(layers);
  const layerOrExportIds = new Set([...layers.map((layer) => layer.id), EXPORT_NODE_ID]);
  const preservedSideInputPorts = new Set<string>(['material', ...MATERIAL_TEXTURE_INPUT_PORTS]);
  const graphOnlyEdges = graph.edges.filter(
    (edge) =>
      preservedSideInputPorts.has(edge.toPort) ||
      (!layerOrExportIds.has(edge.fromId) && !layerOrExportIds.has(edge.toId)),
  );
  return {
    ...graph,
    edges: [...graphOnlyEdges, ...linearGraph.edges],
    positions: { ...graph.positions, ...linearGraph.positions },
  };
}

function layerInputPort(layer: Layer): GraphEdge['toPort'] {
  return layer.kind === 'effect' ? 'in' : 'bg';
}

/**
 * A layer-list edit on a document whose graph is its layer stack keeps the graph equal to the new stack, the way
 * Layers mode has always behaved. Custom graphs keep the edit's own graph result.
 */
function keepStackGraphInSync(before: CanvasDocument, after: CanvasDocument): CanvasDocument {
  if (!isLayerStackGraph(before)) return after;
  return { ...after, graph: syncGraphToLayerStackOrder(after.graph, after.layers) };
}

/** Put a new layer between the current export input and export, leaving the rest of the graph untouched. */
function insertLayerBeforeExport(graph: CanvasGraph, layer: Layer): CanvasGraph {
  const exportEdge = graph.edges.find((edge) => edge.toId === EXPORT_NODE_ID && edge.toPort === 'in');
  const exportPosition = graph.positions[EXPORT_NODE_ID] ?? nextDropPosition(graph);
  const withLayer = addLayerToGraph(graph, layer.id, exportPosition);
  const edges = graph.edges.filter((edge) => edge !== exportEdge);
  if (exportEdge) {
    edges.push({
      id: `e-${exportEdge.fromId}-${layer.id}`,
      fromId: exportEdge.fromId,
      fromPort: exportEdge.fromPort,
      toId: layer.id,
      toPort: layerInputPort(layer),
    });
  }
  edges.push({
    id: `e-${layer.id}-${EXPORT_NODE_ID}`,
    fromId: layer.id,
    fromPort: 'out',
    toId: EXPORT_NODE_ID,
    toPort: 'in',
  });
  return {
    ...withLayer,
    edges,
    positions: {
      ...withLayer.positions,
      [EXPORT_NODE_ID]: { x: nextDropPosition(withLayer).x, y: exportPosition.y },
    },
  };
}

export function addLayerToDocument(doc: CanvasDocument, layer: Layer): CanvasDocument {
  const layers = [...doc.layers, layer];
  if (!isLayerStackGraph(doc)) {
    return { ...doc, layers, graph: insertLayerBeforeExport(doc.graph, layer) };
  }
  return {
    ...doc,
    layers,
    graph: syncGraphToLayerStackOrder(addLayerToGraph(doc.graph, layer.id, nextDropPosition(doc.graph)), layers),
  };
}

export function addLooseLayerNodeToDocument(
  doc: CanvasDocument,
  layer: Layer,
  position?: { x: number; y: number },
): CanvasDocument {
  const graph = doc.graph;
  return {
    ...doc,
    layers: [...doc.layers, layer],
    graph: addLayerToGraph(graph, layer.id, position ?? nextDropPosition(graph)),
  };
}

export function createGraphAreaInDocument(doc: CanvasDocument, nodeIds: string[]): CanvasDocument {
  const graph = doc.graph;
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
    graph: addNodesToGraphArea(doc.graph, areaId, layerIds),
  };
}

export function renameGraphAreaInDocument(doc: CanvasDocument, areaId: string, name: string): CanvasDocument {
  const trimmed = name.trim();
  if (!trimmed) return doc;
  return {
    ...doc,
    graph: updateGraphArea(doc.graph, areaId, { name: trimmed }),
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
    graph: removeNodesFromGraphArea(doc.graph, areaId, nodeIds),
  };
}

export function removeNodesFromAllGraphAreasInDocument(doc: CanvasDocument, nodeIds: string[]): CanvasDocument {
  if (!doc.graph.areas || nodeIds.length === 0) return doc;
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
    graph: removeGraphArea(doc.graph, areaId),
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

function connectInsertedSourceNode(
  graph: CanvasGraph,
  insertedNodeId: string,
  insertion?: DocumentInsertConnectionConfig,
  createEdgeId: CreateGraphEdgeId = defaultCreateGraphEdgeId,
): CanvasGraph {
  const replacement = insertionReplacementEdge(graph, insertion);
  const targetId = insertion?.targetId ?? replacement?.toId;
  const targetPort = insertion?.targetPort ?? replacement?.toPort;
  const next = replacement ? removeGraphEdge(graph, replacement.id) : graph;
  if (!targetId || !targetPort) return next;
  return addGraphEdge(next, {
    id: createEdgeId(insertedNodeId, targetId, 0),
    fromId: insertedNodeId,
    fromPort: 'out',
    toId: targetId,
    toPort: targetPort,
  });
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

type GraphNodeAddAction = Extract<DocumentAddAction, { kind: GraphNodeKind | 'repeatPreset' }>;

function addGraphOnlyNodeAtDocument(
  doc: CanvasDocument,
  action: GraphNodeAddAction,
  position: { x: number; y: number },
  insertion?: DocumentInsertConnectionConfig,
  createEdgeId?: CreateGraphEdgeId,
): AddNodeAtDocumentResult {
  const graph = connectInsertedGraphOnlyNode(doc, action, position, insertion, createEdgeId);
  return { doc: { ...doc, graph }, selectedLayerId: null };
}

function nodeForAddAction(action: GraphNodeAddAction): GraphNode {
  if (action.kind === 'repeatPreset') return makeRepeatPresetNode(action.preset);
  if (action.kind === 'shader') {
    return makeGraphShaderNode({
      ...(action.shaderKind ? { shaderKind: action.shaderKind } : {}),
      role: action.role,
      ...(action.shaderKind === 'aiShader' ? { name: 'AI Shader Effect' } : {}),
      ...(action.shaderKind === 'customCode' ? { name: 'Code Shader' } : {}),
    });
  }
  return graphNodeModel(action.kind).make();
}

function connectInsertedGraphOnlyNode(
  doc: CanvasDocument,
  action: GraphNodeAddAction,
  position: { x: number; y: number },
  insertion?: DocumentInsertConnectionConfig,
  createEdgeId?: CreateGraphEdgeId,
) {
  const node = nodeForAddAction(action);
  const graph = addGraphNode(doc.graph, node, position);
  const mode = modelOfNode(node).insertion(node);
  if (mode === 'source') return connectInsertedSourceNode(graph, node.id, insertion, createEdgeId);
  if (mode === 'material') {
    if (insertion?.targetId && insertion.targetPort === 'material') {
      return addGraphEdge(graph, {
        id: createEdgeId?.(node.id, insertion.targetId, 0) ?? defaultCreateGraphEdgeId(node.id, insertion.targetId, 0),
        fromId: node.id,
        fromPort: 'out',
        toId: insertion.targetId,
        toPort: 'material',
      });
    }
    return graph;
  }
  return connectInsertedNode(graph, node.id, mode.through, insertion, createEdgeId);
}

function isGraphOnlyAddAction(action: DocumentAddAction): action is GraphNodeAddAction {
  return action.kind === 'repeatPreset' || isGraphNodeKind(action.kind);
}

function layerForAddAction(action: Exclude<DocumentAddAction, GraphNodeAddAction>) {
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
  const baseGraph = doc.graph;
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
  return keepStackGraphInSync(doc, {
    ...doc,
    layers: doc.layers.filter((layer) => layer.id !== id),
    graph: removeLayerFromGraph(doc.graph, id),
  });
}

function removeDeletedGraphOnlyNodes(graph: CanvasGraph, idSet: Set<string>) {
  let next = graph;
  for (const id of idSet) {
    if (findGraphNode(next, id)) next = removeGraphNode(next, id);
  }
  return next;
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
  const nextGraph = removeDeletedLayerNodes(removeDeletedGraphOnlyNodes(doc.graph, idSet), doc.layers, idSet);
  return keepStackGraphInSync(doc, { ...doc, layers: nextLayers, graph: nextGraph });
}

export function updateLayerInDocument(doc: CanvasDocument, id: string, patch: Partial<Layer>): CanvasDocument {
  return {
    ...doc,
    layers: doc.layers.map((layer) => (layer.id === id ? applyLayerPatch(layer, patch) : layer)),
  };
}

/** Callers pass patches built for the target layer's kind, so the merge keeps that kind's shape. */
function applyLayerPatch(layer: Layer, patch: Partial<Layer>): Layer {
  return { ...layer, ...patch } as Layer;
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

/** Patch a graph-only node, then apply its model's follow-up graph changes (for example a fill shader drops `bg`). */
export function updateGraphNodeInDocument(doc: CanvasDocument, id: string, patch: GraphNodePatch): CanvasDocument {
  const graph = updateGraphNode(doc.graph, id, patch);
  const node = findGraphNode(graph, id);
  const followUp = node ? modelOfNode(node).afterUpdate : undefined;
  return { ...doc, graph: node && followUp ? followUp(graph, node, patch) : graph };
}

export function reorderDocumentLayers(doc: CanvasDocument, layers: Layer[]): CanvasDocument {
  if (!canReorderDocumentLayers(doc.layers, layers)) return doc;
  // Custom graphs define composition order through edges; a stack reorder would discard them.
  if (!isLayerStackGraph(doc)) return doc;
  return { ...doc, layers, graph: syncGraphToLayerStackOrder(doc.graph, layers) };
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

  return {
    doc: keepStackGraphInSync(doc, {
      ...doc,
      layers: nextLayers,
      graph: addLayerToGraph(doc.graph, duplicate.id, nextDropPosition(doc.graph)),
    }),
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
