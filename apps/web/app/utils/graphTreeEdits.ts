import type { CanvasDocument, CanvasGraph, GraphEdge, Layer } from '../types/config';
import { MATERIAL_TEXTURE_INPUT_PORTS } from '../types/config';
import {
  type AddNodeAtDocumentResult,
  addLayerToDocument,
  addLooseLayerNodeToDocument,
  addNodeAtDocument,
  type DocumentAddAction,
  deleteNodesFromDocument,
  isLayerStackGraph,
} from './documentCommands';
import { canDeleteNodeFromDocument } from './editorGuardrails';
import { buildGraphLayerTree, type GraphLayerTree, type GraphTreeRow } from './graphLayerTree';
import {
  createGraphEdge,
  documentGraph,
  EXPORT_NODE_ID,
  listGraphNodeIds,
  nextDropPosition,
  promoteGraphEdges,
  rewireGraphEdgeSource,
  splitGraphEdgeInPlace,
} from './nodeGraph';
import {
  collectGraphRenderReachModes,
  findIncomingSource,
  type GraphInputPort,
  type GraphReachMode,
  graphNodeInputRole,
  graphNodePrimaryPort,
} from './render/graphInputs';

// Layers tree edits on custom graphs. Design: docs/layers-graph-tree.md ("Editing in the tree").
//
// A run is the longest chain of rows in one tree stack joined through primary ports where each node
// has exactly one consumer. Every command here is pure, returns one new document (one undo step), and
// only rewrites the primary edges it splices; every other edge keeps its endpoints, and edges on a port
// keep their order, so the renderer's first-edge-wins lookup resolves the same way.

export type TreeDropPosition = 'above' | 'below';

type Blocked = { ok: false; reason: string };
export type TreeEditCheck = { ok: true } | Blocked;
export type TreeEditResult = { ok: true; doc: CanvasDocument } | Blocked;

const REFERENCE_MOVE_REASON = 'Shared uses can’t be moved. Move the full entry instead.';
const REFERENCE_DROP_REASON = 'Rows can’t be dropped onto a shared use. Drop next to the full entry instead.';

interface TreeStack {
  rows: GraphTreeRow[];
  /** The stack feeds a Scene 3D, primitive, or material input. Its top row is wired in Nodes. */
  side: boolean;
}

interface RowPlace {
  row: GraphTreeRow;
  stack: TreeStack;
  index: number;
  /** Inclusive row range of the run holding this row, or null when the row is not in a run. */
  run: { start: number; end: number } | null;
}

/** Where each full entry sits in the Layers tree, with its run. */
export interface GraphTreeEditIndex {
  doc: CanvasDocument;
  graph: CanvasGraph;
  places: Map<string, RowPlace>;
}

function collectStacks(tree: GraphLayerTree): TreeStack[] {
  const stacks: TreeStack[] = [];
  const visit = (rows: GraphTreeRow[], side: boolean) => {
    stacks.push({ rows, side });
    for (const row of rows) {
      for (const group of row.groups) visit(group.rows, group.kind === 'input');
    }
  };
  visit(tree.output, false);
  for (const stack of tree.notInOutput) visit(stack, false);
  return stacks;
}

function consumerEdges(graph: CanvasGraph, nodeId: string) {
  return graph.edges.filter((edge) => edge.fromId === nodeId);
}

/** How many inputs a node feeds. More than one makes it shared. */
export function graphNodeConsumerCount(doc: CanvasDocument, nodeId: string): number {
  return consumerEdges(documentGraph(doc), nodeId).length;
}

function isRunRow(graph: CanvasGraph, stack: TreeStack, index: number) {
  const row = stack.rows[index];
  if (row.reference) return false;
  if (stack.side && index === 0) return false;
  return consumerEdges(graph, row.nodeId).length <= 1;
}

function stackRuns(graph: CanvasGraph, stack: TreeStack) {
  const runs: Array<{ start: number; end: number } | null> = stack.rows.map(() => null);
  let start = -1;
  for (let index = 0; index <= stack.rows.length; index += 1) {
    const inRun = index < stack.rows.length && isRunRow(graph, stack, index);
    if (inRun && start === -1) start = index;
    if (!inRun && start !== -1) {
      const run = { start, end: index - 1 };
      for (let member = start; member < index; member += 1) runs[member] = run;
      start = -1;
    }
  }
  return runs;
}

export function buildGraphTreeEditIndex(doc: CanvasDocument, tree = buildGraphLayerTree(doc)): GraphTreeEditIndex {
  const graph = documentGraph(doc);
  const places = new Map<string, RowPlace>();
  for (const stack of collectStacks(tree)) {
    const runs = stackRuns(graph, stack);
    stack.rows.forEach((row, index) => {
      if (!row.reference) places.set(row.nodeId, { row, stack, index, run: runs[index] });
    });
  }
  return { doc, graph, places };
}

function layerById(doc: CanvasDocument, id: string): Layer | undefined {
  return doc.layers.find((layer) => layer.id === id);
}

function nodeName(index: GraphTreeEditIndex, nodeId: string) {
  return index.places.get(nodeId)?.row.name ?? nodeId;
}

function blocked(reason: string): Blocked {
  return { ok: false, reason };
}

function stackOwnerName(index: GraphTreeEditIndex, place: RowPlace) {
  const ownerId = place.stack.rows[0]?.consumer?.nodeId;
  return ownerId ? nodeName(index, ownerId) : 'its node';
}

/** Whether a row can be picked up at all, and why not. */
export function checkTreeRowMovable(index: GraphTreeEditIndex, nodeId: string): TreeEditCheck {
  const place = index.places.get(nodeId);
  if (!place) return blocked(REFERENCE_MOVE_REASON);
  const { row } = place;
  if (layerById(index.doc, nodeId)?.locked) return blocked(`${row.name} is locked. Unlock it to move it.`);
  if (place.stack.side && place.index === 0) {
    return blocked(`${row.name} is an input of ${stackOwnerName(index, place)}. Change inputs in Nodes.`);
  }
  if (consumerEdges(index.graph, nodeId).length > 1) {
    return blocked(`${row.name} feeds more than one input. Rewire it in Nodes.`);
  }
  return { ok: true };
}

/** A gap in a tree stack, named by the input it feeds, or by the row it sits above when nothing reads it. */
type TreeSlot = { consumer: { nodeId: string; port: GraphInputPort } } | { above: string };

interface ResolvedTarget {
  slot: TreeSlot;
  stack: TreeStack;
  /** The gap index in the target stack: row `i` sits between gaps `i` and `i + 1`. */
  gap: number;
}

function resolveTarget(
  index: GraphTreeEditIndex,
  targetId: string,
  position: TreeDropPosition,
): ResolvedTarget | Blocked {
  const place = index.places.get(targetId);
  if (!place) return blocked(REFERENCE_DROP_REASON);
  const { row, stack } = place;
  if (position === 'below') {
    if (!row.stackPort) return blocked(`Nothing can be placed below ${row.name}.`);
    return { slot: { consumer: { nodeId: row.nodeId, port: row.stackPort } }, stack, gap: place.index + 1 };
  }
  if (stack.side && place.index === 0) {
    return blocked(`Inputs of ${stackOwnerName(index, place)} are wired in Nodes.`);
  }
  if (row.consumer) return { slot: { consumer: row.consumer }, stack, gap: place.index };
  // The top of a stack outside Output. If that row still feeds an input the renderer ignores, a new
  // row above it would make it feed two inputs, so that wiring stays in Nodes.
  if (consumerEdges(index.graph, row.nodeId).length > 0) {
    return blocked(`${row.name} feeds an input that is not drawn. Rewire it in Nodes.`);
  }
  return { slot: { above: row.nodeId }, stack, gap: place.index };
}

function hasSideInputs(row: GraphTreeRow) {
  return row.groups.some((group) => group.kind === 'input');
}

/**
 * Whether `nodeId` can move to the gap above or below `targetId`. Within its run any movable row can
 * move. Across runs (another stack, or past a shared node) a row moves together with its group, mask,
 * or pattern source, but not with Scene 3D, primitive, or material inputs, and never into its own inputs.
 */
export function checkTreeMove(
  index: GraphTreeEditIndex,
  nodeId: string,
  targetId: string,
  position: TreeDropPosition,
): TreeEditCheck {
  const movable = checkTreeRowMovable(index, nodeId);
  if (!movable.ok) return movable;
  const target = resolveTarget(index, targetId, position);
  if ('ok' in target) return target;
  const place = index.places.get(nodeId)!;
  if (isNoOpMove(place, target)) return { ok: true };
  if (!withinRun(place, target) && hasSideInputs(place.row)) {
    return blocked(`${place.row.name} has 3D or material inputs, so it only moves within its stack. Move it in Nodes.`);
  }
  if (!graphNodePrimaryPort(index.doc, index.graph, nodeId) && slotHasSource(index.graph, target.slot)) {
    return blocked(`${place.row.name} can’t sit above other rows.`);
  }
  if (feedsOwnInputs(index, nodeId, target.slot)) {
    return blocked(`${place.row.name} can’t move into its own inputs.`);
  }
  return { ok: true };
}

/** `checkTreeMove` for a drop on a tree row: a reference row is never a drop target. */
export function checkTreeDrop(
  index: GraphTreeEditIndex,
  nodeId: string,
  target: Pick<GraphTreeRow, 'nodeId' | 'reference'>,
  position: TreeDropPosition,
): TreeEditCheck {
  if (target.reference) return blocked(REFERENCE_DROP_REASON);
  return checkTreeMove(index, nodeId, target.nodeId, position);
}

function withinRun(place: RowPlace, target: ResolvedTarget) {
  if (!place.run || target.stack !== place.stack) return false;
  return target.gap >= place.run.start && target.gap <= place.run.end + 1;
}

function isNoOpMove(place: RowPlace, target: ResolvedTarget) {
  return target.stack === place.stack && (target.gap === place.index || target.gap === place.index + 1);
}

/** Whether the gap hands the node placed there an input. */
function slotHasSource(graph: CanvasGraph, slot: TreeSlot) {
  if ('above' in slot) return true;
  return Boolean(findIncomingSource(graph, slot.consumer.nodeId, slot.consumer.port));
}

/** Every node upstream of `nodeId` through any edge. */
function upstreamNodeIds(edges: GraphEdge[], nodeId: string) {
  const upstream = new Set<string>();
  const queue = [nodeId];
  for (let current = queue.pop(); current !== undefined; current = queue.pop()) {
    for (const edge of edges) {
      if (edge.toId !== current || upstream.has(edge.fromId)) continue;
      upstream.add(edge.fromId);
      queue.push(edge.fromId);
    }
  }
  return upstream;
}

/**
 * Whether placing the node in the gap would make it feed one of its own inputs: the gap's consumer is
 * upstream of the node once the node has left its stack (its group, mask, and pattern stay attached).
 */
function feedsOwnInputs(index: GraphTreeEditIndex, nodeId: string, slot: TreeSlot) {
  if ('above' in slot) return false;
  const consumerId = slot.consumer.nodeId;
  return (
    consumerId === nodeId || upstreamNodeIds(spliceOut(index.doc, index.graph.edges, nodeId), nodeId).has(consumerId)
  );
}

// ---- Splicing ----

function primaryInputEdge(doc: CanvasDocument, edges: GraphEdge[], nodeId: string) {
  const port = graphNodePrimaryPort(doc, { ...documentGraph(doc), edges }, nodeId);
  return port ? edges.find((edge) => edge.toId === nodeId && edge.toPort === port) : undefined;
}

/**
 * Takes `nodeId` out of its stack: its consumer now reads the node's primary source on the same port,
 * through an edge in the old edge's place. The node keeps every other edge it has.
 */
function spliceOut(doc: CanvasDocument, edges: GraphEdge[], nodeId: string): GraphEdge[] {
  const input = primaryInputEdge(doc, edges, nodeId);
  const output = edges.find((edge) => edge.fromId === nodeId);
  let next = edges;
  if (output && input) next = rewireGraphEdgeSource(next, output, input.fromId, input.fromPort);
  else if (output) next = next.filter((edge) => edge !== output);
  return input ? next.filter((edge) => edge !== input) : next;
}

/**
 * Places `nodeId` (which has no consumer and no primary source) into a gap. Returns the edges and the
 * ids of the edges it wired, each of which must win its port.
 */
function spliceIn(
  doc: CanvasDocument,
  edges: GraphEdge[],
  nodeId: string,
  slot: TreeSlot,
): { edges: GraphEdge[]; wiredEdgeIds: string[] } {
  const port = graphNodePrimaryPort(doc, { ...documentGraph(doc), edges }, nodeId);
  if ('above' in slot) {
    if (!port) return { edges, wiredEdgeIds: [] };
    const input = createGraphEdge(edges, slot.above, 'out', nodeId, port);
    return { edges: [...edges, input], wiredEdgeIds: [input.id] };
  }
  const { nodeId: consumerId, port: consumerPort } = slot.consumer;
  const current = edges.find((edge) => edge.toId === consumerId && edge.toPort === consumerPort);
  if (!current) {
    const output = createGraphEdge(edges, nodeId, 'out', consumerId, consumerPort);
    return { edges: [...edges, output], wiredEdgeIds: [output.id] };
  }
  const next = splitGraphEdgeInPlace(edges, current.id, nodeId, port);
  return { edges: next, wiredEdgeIds: next.filter((edge) => !edges.includes(edge)).map((edge) => edge.id) };
}

function withEdges(doc: CanvasDocument, edges: GraphEdge[]): CanvasDocument {
  return { ...doc, graph: { ...documentGraph(doc), edges } };
}

// ---- doc.layers consistency ----

const MAX_WALK = 10_000;

function primarySource(doc: CanvasDocument, graph: CanvasGraph, nodeId: string) {
  const port = graphNodePrimaryPort(doc, graph, nodeId);
  return port ? findIncomingSource(graph, nodeId, port) : null;
}

function singleConsumer(graph: CanvasGraph, nodeId: string) {
  const outputs = consumerEdges(graph, nodeId);
  return outputs.length === 1 ? outputs[0].toId : null;
}

/**
 * The nearest other layer along the node's stack: `below` follows primary inputs, `above` follows
 * single consumers. Graph-only nodes are skipped; the walk stops at Output, a fork, or a cycle.
 */
function nearestLayerInStack(
  doc: CanvasDocument,
  nodeId: string,
  layerIds: Set<string>,
  direction: 'below' | 'above',
): string | null {
  const graph = documentGraph(doc);
  const seen = new Set([nodeId]);
  let current = nodeId;
  for (let step = 0; step < MAX_WALK; step += 1) {
    const next = direction === 'below' ? primarySource(doc, graph, current) : singleConsumer(graph, current);
    if (!next || next === EXPORT_NODE_ID || seen.has(next)) return null;
    if (layerIds.has(next)) return next;
    seen.add(next);
    current = next;
  }
  return null;
}

/**
 * The `doc.layers` rule for tree edits: a layer that moves or is inserted sits directly above the
 * nearest layer below it in its new stack, else directly below the nearest layer above it, else at the
 * top. Every other layer keeps its order. So a chain of layers stays bottom-to-top in `doc.layers`, and a
 * graph edited back into a plain layer chain is again recognized as the layer stack.
 */
export function placeLayerForTreeEdit(doc: CanvasDocument, layerId: string): CanvasDocument {
  const layer = layerById(doc, layerId);
  if (!layer) return doc;
  const rest = doc.layers.filter((item) => item.id !== layerId);
  const layerIds = new Set(rest.map((item) => item.id));
  const below = nearestLayerInStack(doc, layerId, layerIds, 'below');
  const above = below ? null : nearestLayerInStack(doc, layerId, layerIds, 'above');
  const at = below
    ? rest.findIndex((item) => item.id === below) + 1
    : above
      ? rest.findIndex((item) => item.id === above)
      : rest.length;
  return { ...doc, layers: [...rest.slice(0, at), layer, ...rest.slice(at)] };
}

// ---- Commands ----

/** Moves a row to the gap above or below another full entry. One undoable update. */
export function moveTreeRow(
  doc: CanvasDocument,
  nodeId: string,
  targetId: string,
  position: TreeDropPosition,
  index = buildGraphTreeEditIndex(doc),
): TreeEditResult {
  const check = checkTreeMove(index, nodeId, targetId, position);
  if (!check.ok) return check;
  const target = resolveTarget(index, targetId, position);
  if ('ok' in target) return target;
  const place = index.places.get(nodeId)!;
  if (isNoOpMove(place, target)) return { ok: true, doc };

  // A gap that is not a no-op never names the moved node, so it stays valid after the splice-out.
  const spliced = spliceOut(doc, index.graph.edges, nodeId);
  const placed = spliceIn(doc, spliced, nodeId, target.slot);
  const edges = promoteGraphEdges(placed.edges, placed.wiredEdgeIds);
  return { ok: true, doc: placeLayerForTreeEdit(withEdges(doc, edges), nodeId) };
}

/** The gap one step up or down the row's own stack, for keyboard moves. */
export function treeRowStepTarget(
  index: GraphTreeEditIndex,
  nodeId: string,
  direction: 'up' | 'down',
): { targetId: string; position: TreeDropPosition } | Blocked {
  const place = index.places.get(nodeId);
  if (!place) return blocked(REFERENCE_MOVE_REASON);
  const neighbor = place.stack.rows[place.index + (direction === 'up' ? -1 : 1)];
  if (!neighbor) {
    return blocked(`${place.row.name} is already at the ${direction === 'up' ? 'top' : 'bottom'} of its stack.`);
  }
  if (neighbor.reference) return blocked(`${place.row.name} can’t move past a shared use. Rewire it in Nodes.`);
  return { targetId: neighbor.nodeId, position: direction === 'up' ? 'above' : 'below' };
}

export function stepTreeRow(doc: CanvasDocument, nodeId: string, direction: 'up' | 'down'): TreeEditResult {
  const index = buildGraphTreeEditIndex(doc);
  const target = treeRowStepTarget(index, nodeId, direction);
  if ('ok' in target) return target;
  return moveTreeRow(doc, nodeId, target.targetId, target.position, index);
}

/** Whether a new node can be added between `anchorId` and its consumer. */
export function checkTreeInsertAbove(index: GraphTreeEditIndex, anchorId: string): TreeEditCheck {
  const target = resolveTarget(index, anchorId, 'above');
  return 'ok' in target ? target : { ok: true };
}

function insertedNodePosition(graph: CanvasGraph, anchorId: string, slot: TreeSlot) {
  const anchor = graph.positions[anchorId];
  const consumer = 'consumer' in slot ? graph.positions[slot.consumer.nodeId] : undefined;
  if (anchor && consumer) return { x: (anchor.x + consumer.x) / 2, y: (anchor.y + consumer.y) / 2 + 40 };
  if (anchor) return { x: anchor.x + 220, y: anchor.y };
  return nextDropPosition(graph);
}

/**
 * Wires a node that has no edges yet between `anchorId` and its consumer, on the consumer's original
 * port. The node's position lands between the two in Nodes.
 */
export function insertNodeAboveTreeRow(doc: CanvasDocument, nodeId: string, anchorId: string): TreeEditResult {
  const index = buildGraphTreeEditIndex(doc);
  const target = resolveTarget(index, anchorId, 'above');
  if ('ok' in target) return target;
  if (!graphNodePrimaryPort(doc, index.graph, nodeId)) return blocked('This node can’t sit above other rows.');
  const placed = spliceIn(doc, index.graph.edges, nodeId, target.slot);
  const graph = {
    ...index.graph,
    edges: promoteGraphEdges(placed.edges, placed.wiredEdgeIds),
    positions: { ...index.graph.positions, [nodeId]: insertedNodePosition(index.graph, anchorId, target.slot) },
  };
  return { ok: true, doc: placeLayerForTreeEdit({ ...doc, graph }, nodeId) };
}

const TEXTURE_PORTS = new Set<GraphInputPort>(MATERIAL_TEXTURE_INPUT_PORTS);

/**
 * Whether an edge feeds an image input of its consumer (a primary, merge `b`, mask, or pattern port, or
 * Output) in every way the renderer uses that consumer. A material read through a Scene 3D or primitive
 * `material` port treats `albedo` and the other texture ports as side inputs.
 */
function feedsImageInput(
  doc: CanvasDocument,
  graph: CanvasGraph,
  reach: Map<string, Set<GraphReachMode>>,
  edge: GraphEdge,
) {
  const modes = reach.get(edge.toId);
  if (modes?.has('material') && TEXTURE_PORTS.has(edge.toPort)) return false;
  if (modes && !modes.has('render')) return false;
  const role = graphNodeInputRole(doc, graph, edge.toId, edge.toPort);
  return role !== null && role !== 'side';
}

/**
 * Deletes a node from the tree: every image input it fed now reads the node's primary source on the
 * same port, in the removed edge's place. Side inputs it fed (Scene 3D, material, texture ports) and
 * edges from its own non-primary sources are dropped. A shared node's source then feeds each of the
 * node's consumers, so it becomes shared itself; that is why deleting a shared node asks first.
 */
export function deleteTreeNode(doc: CanvasDocument, nodeId: string): TreeEditResult {
  if (!canDeleteNodeFromDocument(doc, nodeId)) return blocked('Locked layers can’t be deleted. Unlock it first.');
  const graph = documentGraph(doc);
  const reach = collectGraphRenderReachModes(doc, graph);
  const input = primaryInputEdge(doc, graph.edges, nodeId);
  let edges = graph.edges.filter((edge) => edge.toId !== nodeId);
  for (const edge of graph.edges.filter((item) => item.fromId === nodeId)) {
    edges =
      input && feedsImageInput(doc, graph, reach, edge)
        ? rewireGraphEdgeSource(edges, edge, input.fromId, input.fromPort)
        : edges.filter((item) => item !== edge);
  }
  return { ok: true, doc: deleteNodesFromDocument({ ...doc, graph: { ...graph, edges } }, [nodeId]) };
}

/** Deletes several nodes in one update; locked layers are skipped. */
export function deleteTreeNodes(doc: CanvasDocument, nodeIds: string[]): CanvasDocument {
  return nodeIds.reduce((current, nodeId) => {
    const result = deleteTreeNode(current, nodeId);
    return result.ok ? result.doc : current;
  }, doc);
}

/**
 * Adds a layer between `anchorId` and its consumer, for Add while a tree row is selected. Null when the
 * row has no such gap; the caller then adds the layer the usual way.
 */
export function addLayerAboveTreeRow(doc: CanvasDocument, layer: Layer, anchorId: string): CanvasDocument | null {
  const result = insertNodeAboveTreeRow(addLooseLayerNodeToDocument(doc, layer), layer.id, anchorId);
  return result.ok ? result.doc : null;
}

/** Where Add puts a new node: above the selected row of the Layers tree. */
export interface LayerAddPlacement {
  aboveNodeId: string;
}

/**
 * Adds a layer from Layers. On a custom graph with a placement, it goes between the selected row and
 * its consumer; otherwise, or when that row has no such gap, it is added the usual way.
 */
export function addLayerWithPlacement(
  doc: CanvasDocument,
  layer: Layer,
  placement: LayerAddPlacement | undefined,
): CanvasDocument {
  const placed = placement && !isLayerStackGraph(doc) ? addLayerAboveTreeRow(doc, layer, placement.aboveNodeId) : null;
  return placed ?? addLayerToDocument(doc, layer);
}

/** As `addLayerAboveTreeRow`, for a graph-only node added through `addNodeAtDocument`. */
export function addNodeAboveTreeRow(
  doc: CanvasDocument,
  action: DocumentAddAction,
  anchorId: string,
): AddNodeAtDocumentResult | null {
  if (isLayerStackGraph(doc)) return null;
  const graph = documentGraph(doc);
  const before = new Set(listGraphNodeIds(graph, doc.layers));
  const added = addNodeAtDocument(doc, action, nextDropPosition(graph));
  const nodeId = listGraphNodeIds(documentGraph(added.doc), added.doc.layers).find((id) => !before.has(id));
  if (!nodeId) return null;
  const result = insertNodeAboveTreeRow(added.doc, nodeId, anchorId);
  return result.ok ? { ...added, doc: result.doc } : null;
}
