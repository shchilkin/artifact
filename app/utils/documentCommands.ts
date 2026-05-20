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
  appendNodeToExportPath,
  GRAPH_AREA_COLORS,
  inferLinearGraph,
  nextDropPosition,
  removeColorNode,
  removeLayerFromGraph,
  removeMergeNode,
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

export type DocumentAddAction =
  | { kind: 'layer'; layerKind: Exclude<LayerKind, 'effect'> }
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

export function createEffectPresetLayer(preset: EffectPreset): Layer {
  return makeEffectPresetLayer(preset);
}

export function createImageLayerFromSource(src: string): Layer {
  return makeImageLayer(src);
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

export function addLayerToDocument(doc: CanvasDocument, layer: Layer): CanvasDocument {
  if (!doc.graph) return { ...doc, layers: [...doc.layers, layer] };
  const inputPort = layer.kind === 'effect' ? 'in' : 'bg';
  const graphWithLayer = addLayerToGraph(doc.graph, layer.id, nextDropPosition(doc.graph));
  return {
    ...doc,
    layers: [...doc.layers, layer],
    graph: appendNodeToExportPath(graphWithLayer, layer.id, inputPort),
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
  return {
    ...doc,
    layers: doc.layers.filter((layer) => layer.id !== id),
    graph: doc.graph ? removeLayerFromGraph(doc.graph, id) : undefined,
  };
}

export function deleteNodesFromDocument(doc: CanvasDocument, ids: string[]): CanvasDocument {
  const idSet = new Set(ids);
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
    for (const id of ids) {
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
  return { ...doc, layers };
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

export function setDocumentGraph(doc: CanvasDocument, graph: CanvasGraph): CanvasDocument {
  return { ...doc, graph };
}

export function updateDocumentExportConfig(
  doc: CanvasDocument,
  patch: Partial<CanvasDocument['export']>,
): CanvasDocument {
  return { ...doc, export: { ...doc.export, ...patch } };
}
