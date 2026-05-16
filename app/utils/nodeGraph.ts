import {
  ASPECT_SIZES,
  type AspectRatio,
  type CanvasGraph,
  type GraphArea,
  type GraphColorNode,
  type GraphEdge,
  type GraphMergeNode,
  type GraphRepeatNode,
  type Layer,
} from '../types/config';

export const EXPORT_NODE_ID = '__export__';
const BASE_NODE_W = 320;
const ARTWORK_NODE_W = 340;
const COL_GAP = 168;
const ROW_GAP = 72;
const TOP_PAD = 80;
const NODE_CHROME_H = 118;
const NODE_PREVIEW_MAX = 280;

function estimateNodeWidth(id: string, layers: Layer[]): number {
  const layer = layers.find((item) => item.id === id);
  if (!layer) return BASE_NODE_W;
  return ['image', 'primitive', 'noise', 'array'].includes(layer.kind) ? ARTWORK_NODE_W : BASE_NODE_W;
}

function estimatePreviewHeight(aspect: AspectRatio): number {
  const [aspectWidth, aspectHeight] = ASPECT_SIZES[aspect] ?? ASPECT_SIZES['1:1'];
  return Math.round((aspectHeight / Math.max(aspectWidth, aspectHeight)) * NODE_PREVIEW_MAX);
}

function estimateNodeHeight(aspect: AspectRatio): number {
  const previewHeight = estimatePreviewHeight(aspect);
  return previewHeight + NODE_CHROME_H;
}

export function inferLinearGraph(layers: Layer[]): CanvasGraph {
  const positions: Record<string, { x: number; y: number }> = {};
  const edges: GraphEdge[] = [];
  let x = 0;

  layers.forEach((layer) => {
    positions[layer.id] = { x, y: 80 };
    x += estimateNodeWidth(layer.id, layers) + COL_GAP;
  });
  positions[EXPORT_NODE_ID] = { x, y: 80 };

  layers.forEach((layer, i) => {
    const next = layers[i + 1];
    if (next) {
      edges.push({
        id: `e-${layer.id}-${next.id}`,
        fromId: layer.id,
        fromPort: 'out',
        toId: next.id,
        toPort: next.kind === 'effect' ? 'in' : 'bg',
      });
    } else {
      edges.push({
        id: `e-${layer.id}-${EXPORT_NODE_ID}`,
        fromId: layer.id,
        fromPort: 'out',
        toId: EXPORT_NODE_ID,
        toPort: 'in',
      });
    }
  });

  return { edges, positions, mergeNodes: [], colorNodes: [], repeatNodes: [], areas: [] };
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

export function splitEdgeWithNode(
  graph: CanvasGraph,
  edgeId: string,
  insertedNodeId: string,
  insertedInputPort: GraphEdge['toPort'],
): CanvasGraph {
  const edge = graph.edges.find((item) => item.id === edgeId);
  if (!edge) return graph;

  let next = removeGraphEdge(graph, edgeId);
  next = addGraphEdge(next, {
    id: `${edgeId}__before`,
    fromId: edge.fromId,
    fromPort: edge.fromPort,
    toId: insertedNodeId,
    toPort: insertedInputPort,
  });
  next = addGraphEdge(next, {
    id: `${edgeId}__after`,
    fromId: insertedNodeId,
    fromPort: 'out',
    toId: edge.toId,
    toPort: edge.toPort,
  });
  return next;
}

export function addMergeNode(
  graph: CanvasGraph,
  node: GraphMergeNode,
  position: { x: number; y: number },
): CanvasGraph {
  return {
    ...graph,
    mergeNodes: [...graph.mergeNodes, node],
    positions: { ...graph.positions, [node.id]: position },
  };
}

export function removeMergeNode(graph: CanvasGraph, id: string): CanvasGraph {
  return {
    ...graph,
    mergeNodes: graph.mergeNodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.fromId !== id && e.toId !== id),
    positions: Object.fromEntries(Object.entries(graph.positions).filter(([k]) => k !== id)),
    areas: removeNodeFromGraphAreas(graph.areas, id),
  };
}

export function addColorNode(
  graph: CanvasGraph,
  node: GraphColorNode,
  position: { x: number; y: number },
): CanvasGraph {
  return {
    ...graph,
    colorNodes: [...(graph.colorNodes ?? []), node],
    positions: { ...graph.positions, [node.id]: position },
  };
}

export function removeColorNode(graph: CanvasGraph, id: string): CanvasGraph {
  return {
    ...graph,
    colorNodes: (graph.colorNodes ?? []).filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.fromId !== id && e.toId !== id),
    positions: Object.fromEntries(Object.entries(graph.positions).filter(([k]) => k !== id)),
    areas: removeNodeFromGraphAreas(graph.areas, id),
  };
}

export function updateColorNode(graph: CanvasGraph, id: string, patch: Partial<GraphColorNode>): CanvasGraph {
  return {
    ...graph,
    colorNodes: (graph.colorNodes ?? []).map((n) => (n.id === id ? { ...n, ...patch } : n)),
  };
}

export function addRepeatNode(
  graph: CanvasGraph,
  node: GraphRepeatNode,
  position: { x: number; y: number },
): CanvasGraph {
  return {
    ...graph,
    repeatNodes: [...(graph.repeatNodes ?? []), node],
    positions: { ...graph.positions, [node.id]: position },
  };
}

export function removeRepeatNode(graph: CanvasGraph, id: string): CanvasGraph {
  return {
    ...graph,
    repeatNodes: (graph.repeatNodes ?? []).filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.fromId !== id && e.toId !== id),
    positions: Object.fromEntries(Object.entries(graph.positions).filter(([k]) => k !== id)),
    areas: removeNodeFromGraphAreas(graph.areas, id),
  };
}

export function updateRepeatNode(graph: CanvasGraph, id: string, patch: Partial<GraphRepeatNode>): CanvasGraph {
  return {
    ...graph,
    repeatNodes: (graph.repeatNodes ?? []).map((n) => (n.id === id ? { ...n, ...patch } : n)),
  };
}

function uniqueNodeIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => id.trim().length > 0))];
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

/** BFS backwards from nodeId, return every node id (layer/merge/color) that feeds into it, including itself. */
export function collectUpstreamNodeIds(nodeId: string, graph: CanvasGraph): Set<string> {
  const collected = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (collected.has(id)) continue;
    collected.add(id);
    for (const edge of graph.edges) {
      if (edge.toId === id && !collected.has(edge.fromId)) queue.push(edge.fromId);
    }
  }
  return collected;
}
/** BFS backwards from nodeId, collect all layer IDs that feed into it. */
export function getUpstreamLayers(nodeId: string, graph: CanvasGraph, layers: Layer[]): Layer[] {
  const layerIds = new Set(layers.map((l) => l.id));
  const collected = new Set<string>();
  const visited = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    if (layerIds.has(id)) collected.add(id);
    for (const edge of graph.edges) {
      if (edge.toId === id && !visited.has(edge.fromId)) {
        queue.push(edge.fromId);
      }
    }
  }

  return layers.filter((l) => collected.has(l.id));
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

export function organizeGraph(graph: CanvasGraph, layers: Layer[], aspect: AspectRatio = '1:1'): CanvasGraph {
  const nodeIds = [
    ...layers.map((layer) => layer.id),
    ...graph.mergeNodes.map((node) => node.id),
    ...(graph.colorNodes ?? []).map((node) => node.id),
    ...(graph.repeatNodes ?? []).map((node) => node.id),
    EXPORT_NODE_ID,
  ];
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const order = new Map<string, number>();

  nodeIds.forEach((id, index) => {
    outgoing.set(id, []);
    indegree.set(id, 0);
    order.set(id, index);
  });

  for (const edge of graph.edges) {
    if (!outgoing.has(edge.fromId) || !indegree.has(edge.toId)) continue;
    outgoing.get(edge.fromId)?.push(edge.toId);
    indegree.set(edge.toId, (indegree.get(edge.toId) ?? 0) + 1);
  }

  const compareNodeIds = (a: string, b: string) => {
    const ay = graph.positions[a]?.y ?? TOP_PAD;
    const by = graph.positions[b]?.y ?? TOP_PAD;
    if (ay !== by) return ay - by;
    const ax = graph.positions[a]?.x ?? 0;
    const bx = graph.positions[b]?.x ?? 0;
    if (ax !== bx) return ax - bx;
    return (order.get(a) ?? 0) - (order.get(b) ?? 0);
  };

  const queue = nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0).sort(compareNodeIds);
  const depth = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  let processed = 0;

  while (queue.length > 0) {
    const id = queue.shift()!;
    processed += 1;
    for (const target of outgoing.get(id) ?? []) {
      depth.set(target, Math.max(depth.get(target) ?? 0, (depth.get(id) ?? 0) + 1));
      indegree.set(target, (indegree.get(target) ?? 1) - 1);
      if ((indegree.get(target) ?? 0) === 0) {
        queue.push(target);
        queue.sort(compareNodeIds);
      }
    }
  }

  if (processed < nodeIds.length) {
    for (const id of nodeIds) {
      if ((indegree.get(id) ?? 0) > 0) depth.set(id, depth.get(id) ?? 0);
    }
  }

  const columns = new Map<number, string[]>();
  for (const id of nodeIds) {
    const column = depth.get(id) ?? 0;
    const list = columns.get(column) ?? [];
    list.push(id);
    columns.set(column, list);
  }

  const positions = { ...graph.positions };
  const orderedColumns = [...columns.entries()].sort(([a], [b]) => a - b);
  const columnX = new Map<number, number>();
  let nextX = 0;
  for (const [column, ids] of orderedColumns) {
    columnX.set(column, nextX);
    const widest = Math.max(...ids.map((id) => estimateNodeWidth(id, layers)), BASE_NODE_W);
    nextX += widest + COL_GAP;
  }

  for (const [column, ids] of orderedColumns) {
    ids.sort(compareNodeIds);
    let y = TOP_PAD;
    ids.forEach((id) => {
      positions[id] = {
        x: columnX.get(column) ?? 0,
        y,
      };
      y += estimateNodeHeight(aspect) + ROW_GAP;
    });
  }

  return { ...graph, positions };
}

/** Get set of node IDs that have at least one outgoing or incoming edge. */
export function connectedPortIds(graph: CanvasGraph): { sources: Set<string>; targets: Set<string> } {
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
