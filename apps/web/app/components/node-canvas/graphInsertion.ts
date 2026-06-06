import type { CanvasGraph, GraphEdge } from '../../types/config';
import type { AddAction } from '../../utils/addActions';
import { EXPORT_NODE_ID } from '../../utils/nodeGraph';
import { distancePointToSegment } from './helpers';
import type { InsertConnectionConfig } from './types';

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

export function resolveGraphInsertionNodeCenter({
  nodeId,
  graph,
  nodesById,
  fallbackWidth = 320,
  fallbackHeight = 360,
}: {
  nodeId: string;
  graph: CanvasGraph;
  nodesById: Map<string, GraphInsertionNodeLike>;
  fallbackWidth?: number;
  fallbackHeight?: number;
}): { x: number; y: number } | null {
  const node = nodesById.get(nodeId);
  const position = graphInsertionNodePosition(node, graph, nodeId);
  if (!position) return null;
  const width = graphInsertionNodeWidth(node, fallbackWidth);
  const height = graphInsertionNodeHeight(node, fallbackHeight);
  return { x: position.x + width / 2, y: position.y + height / 2 };
}

function graphInsertionNodePosition(node: GraphInsertionNodeLike | undefined, graph: CanvasGraph, nodeId: string) {
  return node?.position ?? graph.positions[nodeId];
}

function graphInsertionNodeWidth(node: GraphInsertionNodeLike | undefined, fallbackWidth: number) {
  return firstDefinedNumber(fallbackWidth, node?.measured?.width, node?.width);
}

function graphInsertionNodeHeight(node: GraphInsertionNodeLike | undefined, fallbackHeight: number) {
  return firstDefinedNumber(fallbackHeight, node?.measured?.height, node?.height);
}

function firstDefinedNumber(fallback: number, ...values: Array<number | undefined>) {
  for (const value of values) {
    if (value !== undefined) return value;
  }
  return fallback;
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

  let best: EdgeInsertionTarget | null = null;
  for (const edge of graph.edges) {
    const insertion = resolveEdgeInsertion(action, edge);
    if (!insertion) continue;
    const start = resolveGraphInsertionNodeCenter({ nodeId: edge.fromId, graph, nodesById });
    const end = resolveGraphInsertionNodeCenter({ nodeId: edge.toId, graph, nodesById });
    if (!start || !end) continue;
    const distance = distancePointToSegment(point, start, end);
    if (distance > threshold) continue;
    if (!best || distance < best.distance) best = { edge, insertion, distance };
  }
  return best;
}
