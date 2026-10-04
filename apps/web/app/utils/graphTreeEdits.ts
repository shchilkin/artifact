import type { CanvasDocument, CanvasGraph, GraphEdge, Layer } from '../types/config';
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
import { EXPORT_NODE_ID, inferLinearGraph, listGraphNodeIds, nextDropPosition } from './nodeGraph';
import {
  findIncomingSource,
  type GraphInputPort,
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

export type TreeEditCheck = { ok: true } | { ok: false; reason: string };
export type TreeEditResult = { ok: true; doc: CanvasDocument } | { ok: false; reason: string };

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

function documentGraph(doc: CanvasDocument): CanvasGraph {
  return doc.graph ?? inferLinearGraph(doc.layers);
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

function block(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

function stackOwnerName(index: GraphTreeEditIndex, place: RowPlace) {
  const ownerId = place.stack.rows[0]?.consumer?.nodeId;
  return ownerId ? nodeName(index, ownerId) : 'its node';
}

/** Whether a row can be picked up at all, and why not. */
export function checkTreeRowMovable(index: GraphTreeEditIndex, nodeId: string): TreeEditCheck {
  const place = index.places.get(nodeId);
  if (!place) return block('Shared uses can’t be moved. Move the full entry instead.');
  const { row } = place;
  if (layerById(index.doc, nodeId)?.locked) return block(`${row.name} is locked. Unlock it to move it.`);
  if (place.stack.side && place.index === 0) {
    return block(`${row.name} is an input of ${stackOwnerName(index, place)}. Change inputs in Nodes.`);
  }
  if (consumerEdges(index.graph, nodeId).length > 1) {
    return block(`${row.name} feeds more than one input. Rewire it in Nodes.`);
  }
  return { ok: true };
}

const REFERENCE_DROP_REASON = 'Rows can’t be dropped onto a shared use. Drop next to the full entry instead.';

/** A gap in a tree stack, named by the input it feeds, or by the row it sits above when nothing reads it. */
type TreeSlot = { consumer: { nodeId: string; port: GraphInputPort } } | { above: string };

interface ResolvedTarget {
  slot: TreeSlot;
  /** The gap index in the target stack: row `i` sits between gaps `i` and `i + 1`. */
  stack: TreeStack;
  gap: number;
}

function resolveTarget(
  index: GraphTreeEditIndex,
  targetId: string,
  position: TreeDropPosition,
): ResolvedTarget | { ok: false; reason: string } {
  const place = index.places.get(targetId);
  if (!place) return block(REFERENCE_DROP_REASON);
  const { row, stack } = place;
  if (position === 'above') {
    if (stack.side && place.index === 0) {
      return block(`Inputs of ${stackOwnerName(index, place)} are wired in Nodes.`);
    }
    const slot: TreeSlot = row.consumer ? { consumer: row.consumer } : { above: row.nodeId };
    return { slot, stack, gap: place.index };
  }
  if (!row.stackPort) return block(`Nothing can be placed below ${row.name}.`);
  return { slot: { consumer: { nodeId: row.nodeId, port: row.stackPort } }, stack, gap: place.index + 1 };
}

/**
 * Whether `nodeId` can move to the gap above or below `targetId`. Within its run any movable row can
 * move; across runs (another stack, or past a shared node) only rows without nested inputs can.
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
  if (!withinRun(place, target) && place.row.groups.length > 0) {
    return block(`${place.row.name} has its own inputs, so it only moves within its stack. Move it in Nodes.`);
  }
  if (!graphNodePrimaryPort(index.doc, index.graph, nodeId) && slotHasSource(index.graph, target.slot)) {
    return block(`${place.row.name} can’t sit above other rows.`);
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
  if (target.reference) return block(REFERENCE_DROP_REASON);
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

// ---- Edge edits that keep port order ----

function edgeId(edges: GraphEdge[], fromId: string, toId: string) {
  const base = `e-${fromId}-${toId}`;
  const ids = new Set(edges.map((edge) => edge.id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function newEdge(
  edges: GraphEdge[],
  fromId: string,
  fromPort: GraphEdge['fromPort'],
  toId: string,
  toPort: GraphInputPort,
) {
  return { id: edgeId(edges, fromId, toId), fromId, fromPort, toId, toPort };
}

function firstEdgeOnPort(edges: GraphEdge[], toId: string, toPort: GraphInputPort) {
  return edges.find((edge) => edge.toId === toId && edge.toPort === toPort);
}

/**
 * The renderer reads the first edge on a port. Each edge in `wired` must win its port, so it moves up
 * to just before the first other edge on that port; every other edge keeps its relative order.
 */
function promoteWiredEdges(edges: GraphEdge[], wired: Set<string>): GraphEdge[] {
  let next = edges;
  for (const id of wired) {
    const at = next.findIndex((edge) => edge.id === id);
    if (at === -1) continue;
    const edge = next[at];
    const first = next.findIndex((item) => item.toId === edge.toId && item.toPort === edge.toPort);
    if (first >= at) continue;
    next = [...next.slice(0, first), edge, ...next.slice(first, at), ...next.slice(at + 1)];
  }
  return next;
}

/**
 * Takes `nodeId` out of its stack: its consumer now reads the node's primary source on the same port,
 * through an edge in the old edge's place. The node keeps every other edge it has.
 */
function spliceOut(doc: CanvasDocument, edges: GraphEdge[], nodeId: string): GraphEdge[] {
  const graph = { ...documentGraph(doc), edges };
  const port = graphNodePrimaryPort(doc, graph, nodeId);
  const input = port ? firstEdgeOnPort(edges, nodeId, port) : undefined;
  const output = edges.find((edge) => edge.fromId === nodeId);
  let next = edges;
  if (output && input) {
    const bridge = newEdge(next, input.fromId, input.fromPort, output.toId, output.toPort);
    next = next.map((edge) => (edge === output ? bridge : edge));
  } else if (output) {
    next = next.filter((edge) => edge !== output);
  }
  return input ? next.filter((edge) => edge !== input) : next;
}

/** Places `nodeId` (which has no consumer and no primary source) into a gap. */
function spliceIn(
  doc: CanvasDocument,
  edges: GraphEdge[],
  nodeId: string,
  slot: TreeSlot,
  wired: Set<string>,
): GraphEdge[] {
  const graph = { ...documentGraph(doc), edges };
  const port = graphNodePrimaryPort(doc, graph, nodeId);
  if ('above' in slot) {
    if (!port) return edges;
    const input = newEdge(edges, slot.above, 'out', nodeId, port);
    wired.add(input.id);
    return [...edges, input];
  }
  const { nodeId: consumerId, port: consumerPort } = slot.consumer;
  const current = firstEdgeOnPort(edges, consumerId, consumerPort);
  const output = newEdge(edges, nodeId, 'out', consumerId, consumerPort);
  wired.add(output.id);
  if (!current) return [...edges, output];
  const input = port ? newEdge([...edges, output], current.fromId, current.fromPort, nodeId, port) : null;
  if (input) wired.add(input.id);
  return edges.flatMap((edge) => (edge === current ? (input ? [input, output] : [output]) : [edge]));
}

function withEdges(doc: CanvasDocument, edges: GraphEdge[]): CanvasDocument {
  return { ...doc, graph: { ...documentGraph(doc), edges } };
}

function nodePosition(doc: CanvasDocument, nodeId: string) {
  return documentGraph(doc).positions[nodeId];
}

// ---- doc.layers consistency ----

const MAX_WALK = 10_000;

function nearestLayerBelow(doc: CanvasDocument, nodeId: string, layerIds: Set<string>) {
  const graph = documentGraph(doc);
  const seen = new Set([nodeId]);
  let current: string | null = nodeId;
  for (let step = 0; current && step < MAX_WALK; step += 1) {
    const port = graphNodePrimaryPort(doc, graph, current);
    const source: string | null = port ? findIncomingSource(graph, current, port) : null;
    if (!source || seen.has(source)) return null;
    if (layerIds.has(source)) return source;
    seen.add(source);
    current = source;
  }
  return null;
}

function nearestLayerAbove(doc: CanvasDocument, nodeId: string, layerIds: Set<string>) {
  const graph = documentGraph(doc);
  const seen = new Set([nodeId]);
  let current = nodeId;
  for (let step = 0; step < MAX_WALK; step += 1) {
    const outputs = consumerEdges(graph, current);
    if (outputs.length !== 1) return null;
    const consumer = outputs[0].toId;
    if (consumer === EXPORT_NODE_ID || seen.has(consumer)) return null;
    if (layerIds.has(consumer)) return consumer;
    seen.add(consumer);
    current = consumer;
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
  const below = nearestLayerBelow(doc, layerId, layerIds);
  const above = below ? null : nearestLayerAbove(doc, layerId, layerIds);
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
  const wired = new Set<string>();
  const spliced = spliceOut(doc, index.graph.edges, nodeId);
  const edges = promoteWiredEdges(spliceIn(doc, spliced, nodeId, target.slot, wired), wired);
  return { ok: true, doc: placeLayerForTreeEdit(withEdges(doc, edges), nodeId) };
}

/** The gap one step up or down the row's own stack, for keyboard moves. */
export function treeRowStepTarget(
  index: GraphTreeEditIndex,
  nodeId: string,
  direction: 'up' | 'down',
): { targetId: string; position: TreeDropPosition } | { ok: false; reason: string } {
  const place = index.places.get(nodeId);
  if (!place) return block('Shared uses can’t be moved. Move the full entry instead.');
  const neighbor = place.stack.rows[place.index + (direction === 'up' ? -1 : 1)];
  if (!neighbor) {
    return block(`${place.row.name} is already at the ${direction === 'up' ? 'top' : 'bottom'} of its stack.`);
  }
  if (neighbor.reference) return block(`${place.row.name} can’t move past a shared use. Rewire it in Nodes.`);
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

/**
 * Wires a node that has no edges yet between `anchorId` and its consumer, on the consumer's original
 * port. The node's position lands between the two in Nodes.
 */
export function insertNodeAboveTreeRow(doc: CanvasDocument, nodeId: string, anchorId: string): TreeEditResult {
  const index = buildGraphTreeEditIndex(doc);
  const target = resolveTarget(index, anchorId, 'above');
  if ('ok' in target) return target;
  if (!graphNodePrimaryPort(doc, index.graph, nodeId)) return block('This node can’t sit above other rows.');
  const wired = new Set<string>();
  const edges = promoteWiredEdges(spliceIn(doc, index.graph.edges, nodeId, target.slot, wired), wired);
  const anchorPosition = nodePosition(doc, anchorId);
  const consumerId = 'consumer' in target.slot ? target.slot.consumer.nodeId : null;
  const consumerPosition = consumerId ? nodePosition(doc, consumerId) : undefined;
  const position =
    anchorPosition && consumerPosition
      ? { x: (anchorPosition.x + consumerPosition.x) / 2, y: (anchorPosition.y + consumerPosition.y) / 2 + 40 }
      : anchorPosition
        ? { x: anchorPosition.x + 220, y: anchorPosition.y }
        : nextDropPosition(index.graph);
  const graph = { ...index.graph, edges, positions: { ...index.graph.positions, [nodeId]: position } };
  return { ok: true, doc: placeLayerForTreeEdit({ ...doc, graph }, nodeId) };
}

function reconnects(doc: CanvasDocument, graph: CanvasGraph, edge: GraphEdge) {
  const role = graphNodeInputRole(doc, graph, edge.toId, edge.toPort);
  return role !== null && role !== 'side';
}

/**
 * Deletes a node from the tree: every image input it fed (a primary, merge `b`, mask, or pattern
 * port) now reads the node's primary source on the same port. Side inputs it fed (Scene 3D, material,
 * texture ports) and edges from its own non-primary sources are dropped.
 */
export function deleteTreeNode(doc: CanvasDocument, nodeId: string): TreeEditResult {
  if (!canDeleteNodeFromDocument(doc, nodeId)) return block('Locked layers can’t be deleted. Unlock it first.');
  const graph = documentGraph(doc);
  const port = graphNodePrimaryPort(doc, graph, nodeId);
  const input = port ? firstEdgeOnPort(graph.edges, nodeId, port) : undefined;
  // Each bridge takes the deleted edge's place, so a port's first edge stays first.
  const edges: GraphEdge[] = [];
  for (const edge of graph.edges) {
    if (edge.toId === nodeId) continue;
    if (edge.fromId !== nodeId) {
      edges.push(edge);
      continue;
    }
    if (!input || !reconnects(doc, graph, edge)) continue;
    edges.push(newEdge([...graph.edges, ...edges], input.fromId, input.fromPort, edge.toId, edge.toPort));
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
  const addedGraph = documentGraph(added.doc);
  const nodeId = listGraphNodeIds(addedGraph, added.doc.layers).find((id) => !before.has(id));
  if (!nodeId) return null;
  const result = insertNodeAboveTreeRow(added.doc, nodeId, anchorId);
  return result.ok ? { ...added, doc: result.doc } : null;
}
