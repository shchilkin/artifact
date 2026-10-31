/**
 * Every durable document edit is a named command. Each command declares its history policy, so callers cannot
 * choose one: `snapshot` is one undo step, `debounce` joins a continuous gesture into one undo step, and `silent`
 * is only for writes that keep every visible result the same (it may amend history entries the same way).
 * `useEditorDocument` runs commands through `runDocumentCommand` and records history with `documentHistoryReducer`.
 */

import type { AspectRatio, CanvasDocument, CanvasGraph, ImageLayer, Layer } from '../types/config';
import type { AddAction } from './addActions';
import {
  addEnvironmentMapToDocument,
  addLayersToGraphAreaInDocument,
  addLayerToDocument,
  addLooseLayerNodeToDocument,
  addNodeAtDocument,
  createGraphAreaInDocument,
  type DocumentInsertConnectionConfig,
  deleteNodesFromDocument,
  duplicateLayerInDocument,
  removeGraphAreaInDocument,
  removeLayerFromDocument,
  removeNodesFromAllGraphAreasInDocument,
  removeNodesFromGraphAreaInDocument,
  renameGraphAreaInDocument,
  renameLayerInDocument,
  reorderDocumentLayers,
  reorderDocumentLayersAndRemoveFromGraphArea,
  replaceSelectedImageSourceInDocument,
  setDocumentAspect,
  setDocumentGraph,
  setDocumentSeed,
  setLayersVisibilityInDocument,
  toggleLayerVisibilityInDocument,
  updateDocumentExportConfig,
  updateGraphNodeInDocument,
  updateLayerInDocument,
} from './documentCommands';
import type { DocumentUpdateMode } from './documentHistory';
import {
  addLayerWithPlacement,
  addNodeAboveTreeRow,
  type LayerAddPlacement,
  type TreeEditResult,
} from './graphTreeEdits';
import type { GraphEnvironmentNode, GraphNodePatch } from './nodeKinds';

type Position = { x: number; y: number };

/**
 * Graph edits from the node canvas, by what the user did. The kind decides the history policy (`GRAPH_EDIT_HISTORY`).
 * `place` is the automatic layout on entering Nodes: it only moves cards, and history entries get the same moves.
 */
export type GraphEditKind =
  | 'connect'
  | 'disconnect'
  | 'move'
  | 'organize'
  | 'area'
  | 'place'
  | 'cameraDrag'
  | 'cameraCommit';

export const GRAPH_EDIT_HISTORY: Record<GraphEditKind, DocumentUpdateMode> = {
  connect: 'snapshot',
  disconnect: 'snapshot',
  move: 'snapshot',
  organize: 'snapshot',
  area: 'snapshot',
  place: 'silent',
  cameraDrag: 'debounce',
  cameraCommit: 'snapshot',
};

export type DocumentCommand =
  | { type: 'replaceDocument'; doc: CanvasDocument }
  | { type: 'setSeed'; seed: number }
  | { type: 'setAspect'; aspect: AspectRatio }
  | { type: 'updateExportConfig'; patch: Partial<CanvasDocument['export']> }
  | { type: 'addLayer'; layer: Layer; placement?: LayerAddPlacement }
  | { type: 'addImportedLayer'; layer: Layer; asNode: boolean; position?: Position }
  | {
      type: 'addEnvironmentMap';
      asset: Pick<GraphEnvironmentNode, 'environmentSrc' | 'environmentName' | 'environmentMime' | 'environmentBytes'>;
      position?: Position;
    }
  | { type: 'addNodeAt'; action: AddAction; position: Position; insertion?: DocumentInsertConnectionConfig }
  | { type: 'addNodeAboveRow'; action: AddAction; anchorId: string; position: Position }
  | { type: 'removeLayer'; id: string }
  | { type: 'deleteNodes'; ids: string[] }
  | { type: 'duplicateLayer'; id: string }
  | { type: 'reorderLayers'; layers: Layer[] }
  | { type: 'reorderLayersOutOfArea'; layers: Layer[]; areaId: string; ids: string[] }
  | { type: 'updateLayer'; id: string; patch: Partial<Layer> }
  | { type: 'replaceImageSource'; id: string; src: string }
  | { type: 'storeImageAsset'; id: string; src: string; previousSrc: string }
  | { type: 'storeDocumentAssets'; source: CanvasDocument; stored: CanvasDocument }
  | { type: 'renameLayer'; id: string; name: string }
  | { type: 'toggleLayerVisibility'; id: string }
  | { type: 'setLayersVisibility'; ids: string[]; visible: boolean }
  | { type: 'updateGraphNode'; id: string; patch: GraphNodePatch }
  | { type: 'editGraph'; graph: CanvasGraph; edit: GraphEditKind }
  | { type: 'treeEdit'; edit: (doc: CanvasDocument) => TreeEditResult }
  | { type: 'createArea'; ids: string[] }
  | { type: 'addToArea'; areaId: string; ids: string[] }
  | { type: 'removeFromArea'; areaId: string; ids: string[] }
  | { type: 'removeFromAllAreas'; ids: string[] }
  | { type: 'renameArea'; areaId: string; name: string }
  | { type: 'removeArea'; areaId: string };

export type DocumentCommandType = DocumentCommand['type'];
type CommandOf<T extends DocumentCommandType> = Extract<DocumentCommand, { type: T }>;

export interface DocumentCommandResult {
  doc: CanvasDocument;
  /** The layer or node to select after the command. */
  select?: string;
  /** Ids the command removed; the selection is cleared if it is one of them. */
  removed?: readonly string[];
  /** For `treeEdit`: the edit's own result, including why it was blocked. */
  treeEdit?: TreeEditResult;
}

interface CommandSpec<C extends DocumentCommand> {
  /** History policy, or a function of the command when one command covers edits of different kinds. */
  history: DocumentUpdateMode | ((command: C) => DocumentUpdateMode);
  run: (doc: CanvasDocument, command: C) => DocumentCommandResult | CanvasDocument;
  /** For `silent` commands: the same change for history entries. */
  amend?: (command: C, before: CanvasDocument) => ((doc: CanvasDocument) => CanvasDocument) | undefined;
}

function replaceLayerSource(doc: CanvasDocument, id: string, src: string, previousSrc: string): CanvasDocument {
  const layer = doc.layers.find((item): item is ImageLayer => item.id === id && item.kind === 'image');
  if (!layer || (layer.src !== previousSrc && !layer.aiGenerationHistory?.some((v) => v.src === previousSrc))) {
    return doc;
  }
  const aiGenerationHistory = layer.aiGenerationHistory?.map((variant) =>
    variant.src === previousSrc ? { ...variant, src } : variant,
  );
  return updateLayerInDocument(doc, id, {
    src: layer.src === previousSrc ? src : layer.src,
    aiGenerationHistory,
  } as Partial<Layer>);
}

/** Positions a `place` edit changed, applied to any document that has those nodes. */
function placedPositionsAmendment(before: CanvasDocument, graph: CanvasGraph) {
  const moved = Object.entries(graph.positions).filter(([id, position]) => {
    const previous = before.graph.positions[id];
    return !previous || previous.x !== position.x || previous.y !== position.y;
  });
  if (moved.length === 0) return undefined;
  return (doc: CanvasDocument): CanvasDocument => {
    const known = new Set([...doc.layers.map((layer) => layer.id), ...Object.keys(doc.graph.nodes)]);
    const applicable = moved.filter(([id]) => known.has(id) || id in doc.graph.positions);
    if (applicable.length === 0) return doc;
    return {
      ...doc,
      graph: { ...doc.graph, positions: { ...doc.graph.positions, ...Object.fromEntries(applicable) } },
    };
  };
}

const DOCUMENT_COMMANDS: { [T in DocumentCommandType]: CommandSpec<CommandOf<T>> } = {
  replaceDocument: { history: 'snapshot', run: (_doc, { doc }) => doc },
  setSeed: { history: 'snapshot', run: (doc, { seed }) => setDocumentSeed(doc, seed) },
  setAspect: { history: 'debounce', run: (doc, { aspect }) => setDocumentAspect(doc, aspect) },
  updateExportConfig: { history: 'debounce', run: (doc, { patch }) => updateDocumentExportConfig(doc, patch) },
  addLayer: {
    history: 'snapshot',
    run: (doc, { layer, placement }) => ({ doc: addLayerWithPlacement(doc, layer, placement), select: layer.id }),
  },
  addImportedLayer: {
    history: 'snapshot',
    run: (doc, { layer, asNode, position }) => ({
      doc: asNode ? addLooseLayerNodeToDocument(doc, layer, position) : addLayerToDocument(doc, layer),
      select: layer.id,
    }),
  },
  addEnvironmentMap: {
    history: 'snapshot',
    run: (doc, { asset, position }) => addEnvironmentMapToDocument(doc, asset, position).doc,
  },
  addNodeAt: {
    history: 'snapshot',
    run: (doc, { action, position, insertion }) => {
      const result = addNodeAtDocument(doc, action, position, insertion);
      return { doc: result.doc, select: result.selectedLayerId ?? undefined };
    },
  },
  addNodeAboveRow: {
    history: 'snapshot',
    run: (doc, { action, anchorId, position }) => {
      const result = addNodeAboveTreeRow(doc, action, anchorId) ?? addNodeAtDocument(doc, action, position);
      return { doc: result.doc, select: result.selectedLayerId ?? undefined };
    },
  },
  removeLayer: {
    history: 'snapshot',
    run: (doc, { id }) => ({ doc: removeLayerFromDocument(doc, id), removed: [id] }),
  },
  deleteNodes: {
    history: 'snapshot',
    run: (doc, { ids }) => ({ doc: deleteNodesFromDocument(doc, ids), removed: ids }),
  },
  duplicateLayer: {
    history: 'snapshot',
    run: (doc, { id }) => {
      const result = duplicateLayerInDocument(doc, id);
      return result.layer ? { doc: result.doc, select: result.layer.id } : doc;
    },
  },
  reorderLayers: { history: 'snapshot', run: (doc, { layers }) => reorderDocumentLayers(doc, layers) },
  reorderLayersOutOfArea: {
    history: 'snapshot',
    run: (doc, { layers, areaId, ids }) => reorderDocumentLayersAndRemoveFromGraphArea(doc, layers, areaId, ids),
  },
  updateLayer: { history: 'debounce', run: (doc, { id, patch }) => updateLayerInDocument(doc, id, patch) },
  replaceImageSource: {
    history: 'snapshot',
    run: (doc, { id, src }) => replaceSelectedImageSourceInDocument(doc, id, src),
  },
  storeImageAsset: {
    // The stored asset reference holds the same image as the embedded source.
    history: 'silent',
    run: (doc, { id, src, previousSrc }) => replaceLayerSource(doc, id, src, previousSrc),
    amend:
      ({ id, src, previousSrc }) =>
      (doc) =>
        replaceLayerSource(doc, id, src, previousSrc),
  },
  storeDocumentAssets: {
    // Embedded payloads become references to the same bytes; a document that changed meanwhile is left alone.
    history: 'silent',
    run: (doc, { source, stored }) => (doc === source ? stored : doc),
  },
  renameLayer: { history: 'snapshot', run: (doc, { id, name }) => renameLayerInDocument(doc, id, name) },
  toggleLayerVisibility: { history: 'snapshot', run: (doc, { id }) => toggleLayerVisibilityInDocument(doc, id) },
  setLayersVisibility: {
    history: 'snapshot',
    run: (doc, { ids, visible }) => setLayersVisibilityInDocument(doc, ids, visible),
  },
  updateGraphNode: { history: 'debounce', run: (doc, { id, patch }) => updateGraphNodeInDocument(doc, id, patch) },
  editGraph: {
    history: ({ edit }) => GRAPH_EDIT_HISTORY[edit],
    run: (doc, { graph }) => setDocumentGraph(doc, graph),
    amend: ({ edit, graph }, before) => (edit === 'place' ? placedPositionsAmendment(before, graph) : undefined),
  },
  treeEdit: {
    history: 'snapshot',
    run: (doc, { edit }) => {
      const result = edit(doc);
      return { doc: result.ok ? result.doc : doc, treeEdit: result };
    },
  },
  createArea: { history: 'snapshot', run: (doc, { ids }) => createGraphAreaInDocument(doc, ids) },
  addToArea: { history: 'snapshot', run: (doc, { areaId, ids }) => addLayersToGraphAreaInDocument(doc, areaId, ids) },
  removeFromArea: {
    history: 'snapshot',
    run: (doc, { areaId, ids }) => removeNodesFromGraphAreaInDocument(doc, areaId, ids),
  },
  removeFromAllAreas: { history: 'snapshot', run: (doc, { ids }) => removeNodesFromAllGraphAreasInDocument(doc, ids) },
  renameArea: { history: 'snapshot', run: (doc, { areaId, name }) => renameGraphAreaInDocument(doc, areaId, name) },
  removeArea: { history: 'snapshot', run: (doc, { areaId }) => removeGraphAreaInDocument(doc, areaId) },
};

export interface DocumentCommandOutcome extends DocumentCommandResult {
  mode: DocumentUpdateMode;
  amend?: (doc: CanvasDocument) => CanvasDocument;
}

function runCommand<T extends DocumentCommandType>(doc: CanvasDocument, command: CommandOf<T>): DocumentCommandOutcome {
  const spec: CommandSpec<CommandOf<T>> = DOCUMENT_COMMANDS[command.type as T];
  const ran = spec.run(doc, command);
  const result: DocumentCommandResult = 'global' in ran ? { doc: ran } : ran;
  const mode = typeof spec.history === 'function' ? spec.history(command) : spec.history;
  const amend = mode === 'silent' ? spec.amend?.(command, doc) : undefined;
  return { ...result, mode, amend };
}

/** Runs a command against `doc`. The caller commits `outcome.doc` with `outcome.mode` when it differs from `doc`. */
export function runDocumentCommand(doc: CanvasDocument, command: DocumentCommand): DocumentCommandOutcome {
  return runCommand(doc, command);
}
