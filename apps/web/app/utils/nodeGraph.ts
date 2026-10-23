import {
  ASPECT_SIZES,
  type AspectRatio,
  type CanvasGraph,
  type GraphArea,
  type GraphEdge,
  type Layer,
} from '../types/config';
import { BASE_NODE_W, EXPORT_NODE_ID, estimateNodeWidth, linearStackEdges } from '../types/linearGraph';
import type { GraphNode, GraphNodeKind, GraphNodeOfKind, GraphNodePatch } from './nodeKinds';

export { EXPORT_NODE_ID, inferLinearGraph } from '../types/linearGraph';

export const GRAPH_AREA_COLORS = ['#ff705f', '#d987ff', '#79e3c5', '#e0bd75', '#8d5cff'];
const COL_GAP = 168;
const ROW_GAP = 72;
const TOP_PAD = 80;
const NODE_CHROME_H = 118;
const NODE_PREVIEW_MAX = 280;

/** Kind of a graph-only node. */
export type GraphUtilityNodeKind = GraphNodeKind;

type GraphLayoutState = {
  outgoing: Map<string, string[]>;
  indegree: Map<string, number>;
  order: Map<string, number>;
};

function estimatePreviewHeight(aspect: AspectRatio): number {
  const [aspectWidth, aspectHeight] = ASPECT_SIZES[aspect] ?? ASPECT_SIZES['1:1'];
  return Math.round((aspectHeight / Math.max(aspectWidth, aspectHeight)) * NODE_PREVIEW_MAX);
}

export function estimateNodeHeight(aspect: AspectRatio): number {
  const previewHeight = estimatePreviewHeight(aspect);
  return previewHeight + NODE_CHROME_H;
}

export function updateGraphPositions(
  graph: CanvasGraph,
  moved: { id: string; position: { x: number; y: number } }[],
): CanvasGraph {
  const positions = { ...graph.positions };
  for (const { id, position } of moved) {
    positions[id] = position;
  }
  return { ...graph, positions };
}

export function addGraphEdge(graph: CanvasGraph, edge: GraphEdge): CanvasGraph {
  const filtered = graph.edges.filter((e) => !(e.toId === edge.toId && e.toPort === edge.toPort));
  return { ...graph, edges: [...filtered, edge] };
}

export function removeGraphEdge(graph: CanvasGraph, edgeId: string): CanvasGraph {
  return { ...graph, edges: graph.edges.filter((e) => e.id !== edgeId) };
}

function defaultAppendEdgeId(fromId: string, toId: string, index: number): string {
  return `e-${fromId}-${toId}-${index}`;
}

export function appendNodeToExportPath(
  graph: CanvasGraph,
  nodeId: string,
  nodeInputPort: GraphEdge['toPort'],
  createEdgeId: (fromId: string, toId: string, index: number) => string = defaultAppendEdgeId,
): CanvasGraph {
  const previousExportEdge = graph.edges.findLast((edge) => edge.toId === EXPORT_NODE_ID && edge.toPort === 'in');

  if (!previousExportEdge) {
    return addGraphEdge(graph, {
      id: createEdgeId(nodeId, EXPORT_NODE_ID, 0),
      fromId: nodeId,
      fromPort: 'out',
      toId: EXPORT_NODE_ID,
      toPort: 'in',
    });
  }

  let next = removeGraphEdge(graph, previousExportEdge.id);
  next = addGraphEdge(next, {
    id: createEdgeId(previousExportEdge.fromId, nodeId, 0),
    fromId: previousExportEdge.fromId,
    fromPort: previousExportEdge.fromPort,
    toId: nodeId,
    toPort: nodeInputPort,
  });
  next = addGraphEdge(next, {
    id: createEdgeId(nodeId, EXPORT_NODE_ID, 1),
    fromId: nodeId,
    fromPort: 'out',
    toId: EXPORT_NODE_ID,
    toPort: 'in',
  });
  return next;
}

/** Ids for the two halves of a split edge: the edge into the inserted node, then the edge out of it. */
function splitEdgeIds(edgeId: string) {
  return { before: `${edgeId}__before`, after: `${edgeId}__after` };
}

export function splitEdgeWithNode(
  graph: CanvasGraph,
  edgeId: string,
  insertedNodeId: string,
  insertedInputPort: GraphEdge['toPort'],
): CanvasGraph {
  const edge = graph.edges.find((item) => item.id === edgeId);
  if (!edge) return graph;
  const ids = splitEdgeIds(edgeId);

  let next = removeGraphEdge(graph, edgeId);
  next = addGraphEdge(next, {
    id: ids.before,
    fromId: edge.fromId,
    fromPort: edge.fromPort,
    toId: insertedNodeId,
    toPort: insertedInputPort,
  });
  next = addGraphEdge(next, {
    id: ids.after,
    fromId: insertedNodeId,
    fromPort: 'out',
    toId: edge.toId,
    toPort: edge.toPort,
  });
  return next;
}

// Order-preserving edge edits. The renderer reads the first edge on a port, so these keep every other
// edge where it is and say which edges must win their port (`promoteGraphEdges`).

function uniqueEdgeId(edges: GraphEdge[], base: string) {
  const ids = new Set(edges.map((edge) => edge.id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

/** A new edge from `fromId` to `toId:toPort`, with the `e-from-to` id made unique within `edges`. */
export function createGraphEdge(
  edges: GraphEdge[],
  fromId: string,
  fromPort: GraphEdge['fromPort'],
  toId: string,
  toPort: GraphEdge['toPort'],
): GraphEdge {
  return { id: uniqueEdgeId(edges, `e-${fromId}-${toId}`), fromId, fromPort, toId, toPort };
}

/**
 * `splitEdgeWithNode` without reordering: the edge is replaced, in its place, by the edge into the
 * inserted node (when it has an input port) followed by the edge out of it to the old target.
 */
export function splitGraphEdgeInPlace(
  edges: GraphEdge[],
  edgeId: string,
  insertedNodeId: string,
  insertedInputPort: GraphEdge['toPort'] | null,
): GraphEdge[] {
  const edge = edges.find((item) => item.id === edgeId);
  if (!edge) return edges;
  const ids = splitEdgeIds(edgeId);
  const after: GraphEdge = {
    id: uniqueEdgeId(edges, ids.after),
    fromId: insertedNodeId,
    fromPort: 'out',
    toId: edge.toId,
    toPort: edge.toPort,
  };
  const before: GraphEdge | null = insertedInputPort
    ? {
        id: uniqueEdgeId([...edges, after], ids.before),
        fromId: edge.fromId,
        fromPort: edge.fromPort,
        toId: insertedNodeId,
        toPort: insertedInputPort,
      }
    : null;
  return edges.flatMap((item) => (item === edge ? (before ? [before, after] : [after]) : [item]));
}

/** Replaces `edge`, in its place, with one from a new source; the target port is unchanged. */
export function rewireGraphEdgeSource(
  edges: GraphEdge[],
  edge: GraphEdge,
  fromId: string,
  fromPort: GraphEdge['fromPort'],
): GraphEdge[] {
  const bridge = createGraphEdge(edges, fromId, fromPort, edge.toId, edge.toPort);
  return edges.map((item) => (item === edge ? bridge : item));
}

/**
 * Moves each edge in `edgeIds` ahead of any other edge on its port, so the renderer reads it. Every
 * other edge keeps its relative order.
 */
export function promoteGraphEdges(edges: GraphEdge[], edgeIds: Iterable<string>): GraphEdge[] {
  let next = edges;
  for (const id of edgeIds) {
    const at = next.findIndex((edge) => edge.id === id);
    if (at === -1) continue;
    const edge = next[at];
    const first = next.findIndex((item) => item.toId === edge.toId && item.toPort === edge.toPort);
    if (first >= at) continue;
    next = [...next.slice(0, first), edge, ...next.slice(first, at), ...next.slice(at + 1)];
  }
  return next;
}

/** A `CanvasGraph['nodes']` map from a list of nodes. */
export function graphNodesById(...nodes: GraphNode[]): CanvasGraph['nodes'] {
  return Object.fromEntries(nodes.map((node) => [node.id, node]));
}

/** Every graph-only node of one kind, in document order. */
export function graphNodesOfKind<K extends GraphNodeKind>(
  graph: Pick<CanvasGraph, 'nodes'>,
  kind: K,
): GraphNodeOfKind<K>[] {
  return Object.values(graph.nodes).filter((node): node is GraphNodeOfKind<K> => node.kind === kind);
}

/** The graph-only node with this id, if any. */
export function findGraphNode(graph: Pick<CanvasGraph, 'nodes'>, id: string): GraphNode | undefined {
  return Object.hasOwn(graph.nodes, id) ? graph.nodes[id] : undefined;
}

/** The graph-only node with this id when it has the given kind. */
export function findGraphNodeOfKind<K extends GraphNodeKind>(
  graph: Pick<CanvasGraph, 'nodes'>,
  kind: K,
  id: string,
): GraphNodeOfKind<K> | undefined {
  const node = findGraphNode(graph, id);
  return node?.kind === kind ? (node as GraphNodeOfKind<K>) : undefined;
}

/** Map every graph-only node; returns the same graph when no node changed. */
export async function mapGraphNodesAsync(
  graph: CanvasGraph,
  map: (node: GraphNode) => Promise<GraphNode>,
): Promise<CanvasGraph> {
  const entries = await Promise.all(
    Object.entries(graph.nodes).map(async ([id, node]) => [id, await map(node)] as const),
  );
  const changed = entries.some(([id, node]) => node !== graph.nodes[id]);
  return changed ? { ...graph, nodes: Object.fromEntries(entries) } : graph;
}

export function addGraphNode(graph: CanvasGraph, node: GraphNode, position: { x: number; y: number }): CanvasGraph {
  return {
    ...graph,
    nodes: { ...graph.nodes, [node.id]: node },
    positions: { ...graph.positions, [node.id]: position },
  };
}

/** Remove a graph-only node with its edges, position, and area membership. */
export function removeGraphNode(graph: CanvasGraph, id: string): CanvasGraph {
  const nodes = { ...graph.nodes };
  delete nodes[id];
  return { ...removeGraphNodeReferences(graph, id), nodes };
}

/** Patch a graph-only node; the patch cannot change its id or kind. */
export function updateGraphNode(graph: CanvasGraph, id: string, patch: GraphNodePatch): CanvasGraph {
  const node = findGraphNode(graph, id);
  if (!node) return graph;
  return { ...graph, nodes: { ...graph.nodes, [id]: { ...node, ...patch, id, kind: node.kind } as GraphNode } };
}

function uniqueNodeIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => id.trim().length > 0))];
}

function removeGraphNodeReferences(graph: CanvasGraph, id: string): CanvasGraph {
  return {
    ...graph,
    edges: graph.edges.filter((e) => e.fromId !== id && e.toId !== id),
    positions: Object.fromEntries(Object.entries(graph.positions).filter(([k]) => k !== id)),
    areas: removeNodeFromGraphAreas(graph.areas, id),
  };
}

function removeNodeFromGraphAreas(areas: GraphArea[] | undefined, nodeId: string): GraphArea[] {
  return (areas ?? []).map((area) => ({
    ...area,
    nodeIds: area.nodeIds.filter((id) => id !== nodeId),
  }));
}

function removeNodesFromOtherGraphAreas(
  areas: GraphArea[] | undefined,
  nodeIds: string[],
  targetAreaId: string,
): GraphArea[] {
  const moving = new Set(nodeIds);
  return (areas ?? [])
    .map((area) =>
      area.id === targetAreaId
        ? area
        : {
            ...area,
            nodeIds: area.nodeIds.filter((id) => !moving.has(id)),
          },
    )
    .filter((area) => area.id === targetAreaId || area.nodeIds.length > 0);
}

export function addGraphArea(graph: CanvasGraph, area: GraphArea): CanvasGraph {
  const nodeIds = uniqueNodeIds(area.nodeIds);
  const areas = removeNodesFromOtherGraphAreas(graph.areas, nodeIds, area.id);
  return {
    ...graph,
    areas: [
      ...areas,
      {
        ...area,
        nodeIds,
      },
    ],
  };
}

export function updateGraphArea(graph: CanvasGraph, id: string, patch: Partial<Omit<GraphArea, 'id'>>): CanvasGraph {
  const nextNodeIds = patch.nodeIds ? uniqueNodeIds(patch.nodeIds) : undefined;
  const areas = nextNodeIds ? removeNodesFromOtherGraphAreas(graph.areas, nextNodeIds, id) : (graph.areas ?? []);
  return {
    ...graph,
    areas: areas.map((area) =>
      area.id === id
        ? {
            ...area,
            ...patch,
            nodeIds: nextNodeIds ?? area.nodeIds,
          }
        : area,
    ),
  };
}

export function removeGraphArea(graph: CanvasGraph, id: string): CanvasGraph {
  return {
    ...graph,
    areas: (graph.areas ?? []).filter((area) => area.id !== id),
  };
}

export function assignNodesToGraphArea(graph: CanvasGraph, areaId: string, nodeIds: string[]): CanvasGraph {
  const ids = uniqueNodeIds(nodeIds);
  const areas = removeNodesFromOtherGraphAreas(graph.areas, ids, areaId);
  return {
    ...graph,
    areas: areas.map((area) => (area.id === areaId ? { ...area, nodeIds: ids } : area)),
  };
}

export function addNodesToGraphArea(graph: CanvasGraph, areaId: string, nodeIds: string[]): CanvasGraph {
  const area = (graph.areas ?? []).find((item) => item.id === areaId);
  if (!area) return graph;
  return assignNodesToGraphArea(graph, areaId, [...area.nodeIds, ...nodeIds]);
}

export function removeNodesFromGraphArea(graph: CanvasGraph, areaId: string, nodeIds: string[]): CanvasGraph {
  const ids = new Set(uniqueNodeIds(nodeIds));
  if (ids.size === 0) return graph;
  return {
    ...graph,
    areas: (graph.areas ?? [])
      .map((area) => (area.id === areaId ? { ...area, nodeIds: area.nodeIds.filter((id) => !ids.has(id)) } : area))
      .filter((area) => area.nodeIds.length > 0),
  };
}

function collectConnectedNodeIds(
  nodeId: string,
  graph: CanvasGraph,
  nextNodeForEdge: (edge: GraphEdge, id: string) => string | null,
): Set<string> {
  const collected = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (collected.has(id)) continue;
    collected.add(id);
    for (const edge of graph.edges) {
      const nextId = nextNodeForEdge(edge, id);
      if (nextId && !collected.has(nextId)) queue.push(nextId);
    }
  }
  return collected;
}

function upstreamNodeForEdge(edge: GraphEdge, id: string): string | null {
  return edge.toId === id ? edge.fromId : null;
}

function downstreamNodeForEdge(edge: GraphEdge, id: string): string | null {
  return edge.fromId === id ? edge.toId : null;
}

/** BFS backwards from nodeId, return every node id (layer/merge/color) that feeds into it, including itself. */
export function collectUpstreamNodeIds(nodeId: string, graph: CanvasGraph): Set<string> {
  return collectConnectedNodeIds(nodeId, graph, upstreamNodeForEdge);
}

/** BFS forwards from nodeId, return every node id affected by it, including itself. */
export function collectDownstreamNodeIds(nodeId: string, graph: CanvasGraph): Set<string> {
  return collectConnectedNodeIds(nodeId, graph, downstreamNodeForEdge);
}

export function resolveOutputPath(graph: CanvasGraph, targetId: string = EXPORT_NODE_ID) {
  const nodeIds = collectUpstreamNodeIds(targetId, graph);
  const edgeIds = new Set(
    graph.edges.filter((edge) => nodeIds.has(edge.fromId) && nodeIds.has(edge.toId)).map((edge) => edge.id),
  );
  return { nodeIds, edgeIds };
}

/** Resolve only the layers that feed into nodeId, in graph render order. */
export function resolveUpstreamRenderLayers(nodeId: string, graph: CanvasGraph, layers: Layer[]): Layer[] {
  const layerById = new Map(layers.map((layer) => [layer.id, layer]));
  const visited = new Set<string>();
  const result: Layer[] = [];

  function visit(currentNodeId: string) {
    if (visited.has(currentNodeId)) return;
    visited.add(currentNodeId);
    for (const edge of graph.edges) {
      if (edge.toId === currentNodeId) visit(edge.fromId);
    }
    const layer = layerById.get(currentNodeId);
    if (layer) result.push(layer);
  }

  visit(nodeId);
  return result;
}

/** Add a new layer's position to the graph without connecting edges. */
export function addLayerToGraph(graph: CanvasGraph, layerId: string, position: { x: number; y: number }): CanvasGraph {
  return {
    ...graph,
    positions: { ...graph.positions, [layerId]: position },
  };
}

/** Remove a layer from the graph, cleaning up edges and position. */
export function removeLayerFromGraph(graph: CanvasGraph, layerId: string): CanvasGraph {
  return {
    ...graph,
    edges: graph.edges.filter((e) => e.fromId !== layerId && e.toId !== layerId),
    positions: Object.fromEntries(Object.entries(graph.positions).filter(([k]) => k !== layerId)),
    areas: removeNodeFromGraphAreas(graph.areas, layerId),
  };
}

/** Find a good drop position: to the right of the rightmost node. */
export function nextDropPosition(graph: CanvasGraph): { x: number; y: number } {
  const xs = Object.values(graph.positions).map((p) => p.x);
  const maxX = xs.length > 0 ? Math.max(...xs) : 0;
  const ys = Object.values(graph.positions).map((p) => p.y);
  const avgY = ys.length > 0 ? ys.reduce((a, b) => a + b, 0) / ys.length : 80;
  return { x: maxX + BASE_NODE_W + COL_GAP, y: avgY };
}

export function listGraphNodeIds(graph: CanvasGraph, layers: Layer[]): string[] {
  return [...layers.map((layer) => layer.id), ...Object.keys(graph.nodes), EXPORT_NODE_ID];
}

/** True when the graph has any graph-only node. */
export function hasGraphNodes(graph: CanvasGraph): boolean {
  return Object.keys(graph.nodes).length > 0;
}

/** The graph-only node with this id and its kind. */
export function findGraphUtilityNode(
  graph: CanvasGraph,
  nodeId: string,
): { kind: GraphNodeKind; node: GraphNode } | null {
  const node = findGraphNode(graph, nodeId);
  return node ? { kind: node.kind, node } : null;
}

export function graphUtilityNodeKind(graph: CanvasGraph, nodeId: string): GraphNodeKind | null {
  return findGraphNode(graph, nodeId)?.kind ?? null;
}

function createEmptyGraphLayoutState(nodeIds: string[]): GraphLayoutState {
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const order = new Map<string, number>();
  nodeIds.forEach((id, index) => {
    outgoing.set(id, []);
    indegree.set(id, 0);
    order.set(id, index);
  });
  return { outgoing, indegree, order };
}

function addEdgeToGraphLayoutState(state: GraphLayoutState, edge: GraphEdge) {
  if (!state.outgoing.has(edge.fromId) || !state.indegree.has(edge.toId)) return;
  state.outgoing.get(edge.fromId)?.push(edge.toId);
  state.indegree.set(edge.toId, (state.indegree.get(edge.toId) ?? 0) + 1);
}

function createGraphLayoutState(nodeIds: string[], edges: GraphEdge[]): GraphLayoutState {
  const state = createEmptyGraphLayoutState(nodeIds);
  for (const edge of edges) addEdgeToGraphLayoutState(state, edge);
  return state;
}

function compareNumbers(a: number, b: number): number | null {
  return a === b ? null : a - b;
}

function graphNodeLayoutY(id: string, positions: CanvasGraph['positions']): number {
  const position = positions[id];
  return position ? position.y : TOP_PAD;
}

function graphNodeLayoutX(id: string, positions: CanvasGraph['positions']): number {
  const position = positions[id];
  return position ? position.x : 0;
}

function graphNodeOrder(id: string, order: Map<string, number>): number {
  return order.get(id) ?? 0;
}

function compareGraphNodeIds(
  a: string,
  b: string,
  positions: CanvasGraph['positions'],
  order: Map<string, number>,
): number {
  return (
    compareNumbers(graphNodeLayoutY(a, positions), graphNodeLayoutY(b, positions)) ??
    compareNumbers(graphNodeLayoutX(a, positions), graphNodeLayoutX(b, positions)) ??
    graphNodeOrder(a, order) - graphNodeOrder(b, order)
  );
}

function createGraphLayoutQueue(
  nodeIds: string[],
  state: GraphLayoutState,
  compareNodeIds: (a: string, b: string) => number,
): string[] {
  return nodeIds.filter((id) => (state.indegree.get(id) ?? 0) === 0).sort(compareNodeIds);
}

function updateGraphLayoutTargetDepth(
  target: string,
  source: string,
  state: GraphLayoutState,
  depth: Map<string, number>,
  queue: string[],
) {
  depth.set(target, Math.max(depth.get(target) ?? 0, (depth.get(source) ?? 0) + 1));
  state.indegree.set(target, (state.indegree.get(target) ?? 1) - 1);
  if ((state.indegree.get(target) ?? 0) === 0) queue.push(target);
}

function preserveCycleFallbackDepths(nodeIds: string[], state: GraphLayoutState, depth: Map<string, number>) {
  for (const id of nodeIds) {
    if ((state.indegree.get(id) ?? 0) > 0) depth.set(id, depth.get(id) ?? 0);
  }
}

function resolveGraphLayoutDepths(
  nodeIds: string[],
  state: GraphLayoutState,
  compareNodeIds: (a: string, b: string) => number,
): Map<string, number> {
  const queue = createGraphLayoutQueue(nodeIds, state, compareNodeIds);
  const depth = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  let processed = 0;

  while (queue.length > 0) {
    const id = queue.shift()!;
    processed += 1;
    for (const target of state.outgoing.get(id) ?? []) updateGraphLayoutTargetDepth(target, id, state, depth, queue);
    queue.sort(compareNodeIds);
  }

  if (processed < nodeIds.length) preserveCycleFallbackDepths(nodeIds, state, depth);
  return depth;
}

function rightAlignGraphLayoutDepths(
  nodeIds: string[],
  state: GraphLayoutState,
  depth: Map<string, number>,
): Map<string, number> {
  const aligned = new Map(depth);
  const ordered = [...nodeIds].sort((a, b) => (aligned.get(b) ?? 0) - (aligned.get(a) ?? 0));

  for (const id of ordered) {
    if (id === EXPORT_NODE_ID) continue;
    const targets = (state.outgoing.get(id) ?? []).filter((target) => aligned.has(target));
    if (targets.length === 0) continue;

    const desiredDepth = Math.min(...targets.map((target) => Math.max((aligned.get(target) ?? 0) - 1, 0)));
    const currentDepth = aligned.get(id) ?? 0;
    if (desiredDepth > currentDepth) aligned.set(id, desiredDepth);
  }

  return aligned;
}

function groupGraphNodesByDepth(nodeIds: string[], depth: Map<string, number>): Map<number, string[]> {
  const columns = new Map<number, string[]>();
  for (const id of nodeIds) {
    const column = depth.get(id) ?? 0;
    const list = columns.get(column) ?? [];
    list.push(id);
    columns.set(column, list);
  }
  return columns;
}

function widestGraphColumnWidth(ids: string[], layers: Layer[]): number {
  return Math.max(...ids.map((id) => estimateNodeWidth(id, layers)), BASE_NODE_W);
}

function calculateGraphColumnOffsets(orderedColumns: [number, string[]][], layers: Layer[]): Map<number, number> {
  const columnX = new Map<number, number>();
  let nextX = 0;
  for (const [column, ids] of orderedColumns) {
    columnX.set(column, nextX);
    nextX += widestGraphColumnWidth(ids, layers) + COL_GAP;
  }
  return columnX;
}

function graphNodeDownstreamY(
  id: string,
  positions: CanvasGraph['positions'],
  outgoing: Map<string, string[]>,
): number | null {
  const targets = (outgoing.get(id) ?? [])
    .map((target) => positions[target]?.y)
    .filter((y): y is number => typeof y === 'number');
  if (targets.length === 0) return null;
  return targets.reduce((sum, y) => sum + y, 0) / targets.length;
}

function compareGraphColumnNodeIds(
  a: string,
  b: string,
  positions: CanvasGraph['positions'],
  previousPositions: CanvasGraph['positions'],
  outgoing: Map<string, string[]>,
  order: Map<string, number>,
): number {
  const aDownstreamY = graphNodeDownstreamY(a, positions, outgoing);
  const bDownstreamY = graphNodeDownstreamY(b, positions, outgoing);
  return (
    compareNumbers(
      aDownstreamY ?? graphNodeLayoutY(a, previousPositions),
      bDownstreamY ?? graphNodeLayoutY(b, previousPositions),
    ) ??
    compareNumbers(graphNodeLayoutX(a, previousPositions), graphNodeLayoutX(b, previousPositions)) ??
    graphNodeOrder(a, order) - graphNodeOrder(b, order)
  );
}

function positionGraphColumn(
  positions: CanvasGraph['positions'],
  column: number,
  ids: string[],
  columnX: Map<number, number>,
  aspect: AspectRatio,
) {
  let y = TOP_PAD;
  for (const id of ids) {
    positions[id] = { x: columnX.get(column) ?? 0, y };
    y += estimateNodeHeight(aspect) + ROW_GAP;
  }
}

function organizeGraphPositions(
  graph: CanvasGraph,
  layers: Layer[],
  aspect: AspectRatio,
  depth: Map<string, number>,
  nodeIds: string[],
  state: GraphLayoutState,
): CanvasGraph['positions'] {
  const columns = groupGraphNodesByDepth(nodeIds, depth);
  const positions = { ...graph.positions };
  const orderedColumns = [...columns.entries()].sort(([a], [b]) => a - b);
  const columnX = calculateGraphColumnOffsets(orderedColumns, layers);

  for (const [column, ids] of [...orderedColumns].reverse()) {
    ids.sort((a, b) => compareGraphColumnNodeIds(a, b, positions, graph.positions, state.outgoing, state.order));
    positionGraphColumn(positions, column, ids, columnX, aspect);
  }
  return positions;
}

export function organizeGraph(graph: CanvasGraph, layers: Layer[], aspect: AspectRatio = '1:1'): CanvasGraph {
  const nodeIds = listGraphNodeIds(graph, layers);
  const state = createGraphLayoutState(nodeIds, graph.edges);
  const compareNodeIds = (a: string, b: string) => compareGraphNodeIds(a, b, graph.positions, state.order);
  const sourceDepth = resolveGraphLayoutDepths(nodeIds, state, compareNodeIds);
  const depth = rightAlignGraphLayoutDepths(nodeIds, state, sourceDepth);
  const positions = organizeGraphPositions(graph, layers, aspect, depth, nodeIds, state);

  return { ...graph, positions };
}

/** Get set of node IDs that have at least one outgoing or incoming edge. */
export function connectedPortIds(graph: CanvasGraph): {
  sources: Set<string>;
  targets: Set<string>;
} {
  const sources = new Set<string>();
  const targets = new Set<string>();
  for (const e of graph.edges) {
    sources.add(`${e.fromId}::${e.fromPort}`);
    targets.add(`${e.toId}::${e.toPort}`);
  }
  return { sources, targets };
}

/**
 * Resolve the layer render order from the graph topology.
 * Does a DFS post-order traversal backwards from EXPORT_NODE_ID,
 * following edges in reverse (predecessor-first), returning only Layer nodes.
 * Merge nodes are traversed but not included in the output (they're not layers).
 * Falls back to original doc.layers order for any unconnected layers appended last.
 */
export function resolveRenderOrder(graph: CanvasGraph, layers: Layer[]): Layer[] {
  const layerById = new Map(layers.map((l) => [l.id, l]));
  const visited = new Set<string>();
  const result: Layer[] = [];

  function visit(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    // Follow edges backwards: find all nodes that feed INTO nodeId
    for (const edge of graph.edges) {
      if (edge.toId === nodeId) visit(edge.fromId);
    }
    // Post-order: add after all predecessors
    const layer = layerById.get(nodeId);
    if (layer) result.push(layer);
  }

  visit(EXPORT_NODE_ID);

  // Append any orphan layers (not connected to the export path) at the end
  for (const layer of layers) {
    if (!visited.has(layer.id)) result.push(layer);
  }

  return result;
}

/** Returns true if adding an edge source→target would create a cycle. */
export function wouldCreateCycle(graph: CanvasGraph, sourceId: string, targetId: string): boolean {
  // DFS from targetId following outgoing edges — if we reach sourceId, cycle detected
  const visited = new Set<string>();
  const stack = [targetId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === sourceId) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const edge of graph.edges) {
      if (edge.fromId === id) stack.push(edge.toId);
    }
  }
  return false;
}

function stackEdgeKey(edge: Pick<GraphEdge, 'fromId' | 'fromPort' | 'toId' | 'toPort'>) {
  return `${edge.fromId}:${edge.fromPort}->${edge.toId}:${edge.toPort}`;
}

/**
 * True when the graph is exactly the layer stack wired to export, so Layers
 * actions can rebuild it without losing any user-authored topology.
 */
export function isLayerStackGraph(doc: { graph: CanvasGraph; layers: Layer[] }): boolean {
  const { graph } = doc;
  if (hasGraphNodes(graph)) return false;
  const expected = linearStackEdges(doc.layers);
  if (graph.edges.length !== expected.length) return false;
  const actual = new Set(graph.edges.map(stackEdgeKey));
  return expected.every((edge) => actual.has(stackEdgeKey(edge)));
}
