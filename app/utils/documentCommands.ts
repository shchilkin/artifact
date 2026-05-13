import {
  type AspectRatio,
  type CanvasDocument,
  type CanvasGraph,
  type EffectPreset,
  type GraphColorNode,
  type GraphEdge,
  type GraphMergeNode,
  type Layer,
  type LayerKind,
  makeEffectPresetLayer,
  makeEmojiLayer,
  makeFillLayer,
  makeGraphColorNode,
  makeGraphMergeNode,
  makeImageLayer,
  makeSourceLayer,
  makeTextLayer,
} from '../types/config';
import {
  addColorNode,
  addGraphEdge,
  addLayerToGraph,
  addMergeNode,
  inferLinearGraph,
  nextDropPosition,
  removeColorNode,
  removeLayerFromGraph,
  removeMergeNode,
  splitEdgeWithNode,
  updateColorNode as updateColorNodeInGraph,
} from './nodeGraph';
import type { NoisePresetId } from './noisePresets';
import { makeNoisePresetLayer } from './noisePresets';

export type DocumentAddAction =
  | { kind: 'layer'; layerKind: Exclude<LayerKind, 'effect'> }
  | { kind: 'noisePreset'; preset: NoisePresetId }
  | { kind: 'effect'; preset: EffectPreset }
  | { kind: 'merge' }
  | { kind: 'color' };

export interface DocumentInsertConnectionConfig {
  sourceId: string;
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
  return kind === 'text'
    ? makeTextLayer()
    : kind === 'image'
      ? makeImageLayer('')
      : kind === 'fill'
        ? makeFillLayer()
        : kind === 'emoji'
          ? makeEmojiLayer()
          : makeSourceLayer(kind);
}

export function createEffectPresetLayer(preset: EffectPreset): Layer {
  return makeEffectPresetLayer(preset);
}

export function createImageLayerFromSource(src: string): Layer {
  return makeImageLayer(src);
}

export function addLayerToDocument(doc: CanvasDocument, layer: Layer): CanvasDocument {
  if (!doc.graph) return { ...doc, layers: [...doc.layers, layer] };
  return {
    ...doc,
    layers: [...doc.layers, layer],
    graph: addLayerToGraph(doc.graph, layer.id, nextDropPosition(doc.graph)),
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
      id: createEdgeId(insertedNodeId, insertion.targetId, 1),
      fromId: insertedNodeId,
      fromPort: 'out',
      toId: insertion.targetId,
      toPort: insertion.targetPort ?? 'in',
    });
  }

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

  const layer =
    action.kind === 'effect'
      ? createEffectPresetLayer(action.preset)
      : action.kind === 'noisePreset'
        ? makeNoisePresetLayer(action.preset)
        : createLayerOfKind(action.layerKind);
  const graph = connectInsertedNode(
    addLayerToGraph(ensureDocumentGraph(doc), layer.id, position),
    layer.id,
    action.kind === 'effect' ? 'in' : 'bg',
    insertion,
    createEdgeId,
  );

  return {
    doc: {
      ...doc,
      layers: [...doc.layers, layer],
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
