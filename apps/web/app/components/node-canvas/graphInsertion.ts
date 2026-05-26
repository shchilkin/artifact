import type { CanvasGraph, GraphEdge } from '../../types/config';
import { EXPORT_NODE_ID } from '../../utils/nodeGraph';
import { distancePointToSegment } from './helpers';
import type { AddAction, InsertConnectionConfig } from './types';

export interface GraphInsertionNodeLike {
  id: string;
  position?: { x: number; y: number };
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
}

export interface EdgeInsertionTarget {
  edge: GraphEdge;
  insertion: InsertConnectionConfig;
  distance: number;
}

export function inputPortForAddedAction(action: AddAction): GraphEdge['toPort'] {
  if (action.kind === 'merge') return 'a';
  if (action.kind === 'color' || action.kind === 'repeat' || action.kind === 'repeatPreset') return 'in';
  if (action.kind === 'effect') return 'in';
  return 'bg';
}

export function resolveEdgeInsertion(action: AddAction, edge: GraphEdge): InsertConnectionConfig | null {
  if (edge.fromId === EXPORT_NODE_ID) return null;
  return {
    sourceId: edge.fromId,
    targetId: edge.toId,
    targetPort: edge.toPort,
    replaceEdgeId: edge.id,
  };
}

export function resolveNearestEdgeInsertionTarget({
  action,
  graph,
  nodes,
  point,
  threshold,
}: {
  action: AddAction;
  graph: CanvasGraph;
  nodes: readonly GraphInsertionNodeLike[];
  point: { x: number; y: number };
  threshold: number;
}): EdgeInsertionTarget | null {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const getCenter = (nodeId: string) => {
    const node = nodesById.get(nodeId);
    const position = node?.position ?? graph.positions[nodeId];
    if (!position) return null;
    const width = node?.measured?.width ?? node?.width ?? 320;
    const height = node?.measured?.height ?? node?.height ?? 360;
    return { x: position.x + width / 2, y: position.y + height / 2 };
  };

  let best: EdgeInsertionTarget | null = null;
  for (const edge of graph.edges) {
    const insertion = resolveEdgeInsertion(action, edge);
    if (!insertion) continue;
    const start = getCenter(edge.fromId);
    const end = getCenter(edge.toId);
    if (!start || !end) continue;
    const distance = distancePointToSegment(point, start, end);
    if (distance > threshold) continue;
    if (!best || distance < best.distance) best = { edge, insertion, distance };
  }
  return best;
}
