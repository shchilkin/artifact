import type { CanvasGraph, GraphEdge, Layer, GraphMergeNode } from '../types/config';
import type { Edge as RFEdge } from '@xyflow/react';

export const EXPORT_NODE_ID = '__export__';
const NODE_W = 160;
const COL_GAP = 56;

export function inferLinearGraph(layers: Layer[]): CanvasGraph {
  const positions: Record<string, { x: number; y: number }> = {};
  const edges: GraphEdge[] = [];

  layers.forEach((layer, i) => {
    positions[layer.id] = { x: i * (NODE_W + COL_GAP), y: 80 };
  });
  positions[EXPORT_NODE_ID] = { x: layers.length * (NODE_W + COL_GAP), y: 80 };

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

  return { edges, positions, mergeNodes: [] };
}

export function toRFEdges(graph: CanvasGraph): RFEdge[] {
  return graph.edges.map((e) => ({
    id: e.id,
    source: e.fromId,
    sourceHandle: e.fromPort,
    target: e.toId,
    targetHandle: e.toPort,
    type: 'smoothstep',
    style: { stroke: getEdgeColor(e.fromId, graph), strokeWidth: 1.5, opacity: 0.55 },
  }));
}

function getEdgeColor(fromId: string, graph: CanvasGraph): string {
  const isMerge = graph.mergeNodes.some((n) => n.id === fromId);
  if (isMerge) return 'oklch(60% 0.09 192)';
  return 'oklch(60% 0.13 298)';
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
  const filtered = graph.edges.filter(
    (e) => !(e.toId === edge.toId && e.toPort === edge.toPort),
  );
  return { ...graph, edges: [...filtered, edge] };
}

export function removeGraphEdge(graph: CanvasGraph, edgeId: string): CanvasGraph {
  return { ...graph, edges: graph.edges.filter((e) => e.id !== edgeId) };
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
  };
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

/** Returns true if adding an edge source→target would create a cycle. */
export function wouldCreateCycle(
  graph: CanvasGraph,
  sourceId: string,
  targetId: string,
): boolean {
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
