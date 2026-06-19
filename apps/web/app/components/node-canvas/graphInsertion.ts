import type { CanvasGraph, GraphEdge, Layer } from '../../types/config';
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

export interface NodeInsertionTarget {
  nodeId: string;
  insertion: InsertConnectionConfig;
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
  if (action.kind === 'material') return 'material';
  if (action.kind === 'merge') return 'a';
  if (action.kind === 'scene3d') return 'model';
  if (action.kind === 'environment') return 'env';
  if (
    action.kind === 'color' ||
    action.kind === 'repeat' ||
    action.kind === 'repeatPreset' ||
    action.kind === 'mask' ||
    action.kind === 'transform'
  )
    return 'in';
  if (action.kind === 'effect') return 'in';
  return 'bg';
}

export function resolveEdgeInsertion(action: AddAction, edge: GraphEdge): InsertConnectionConfig | null {
  if (action.kind === 'material') return null;
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

export function resolveNodeInsertionTarget({
  action,
  graph,
  layers,
  nodes,
  point,
}: {
  action: AddAction;
  graph: CanvasGraph;
  layers: readonly Layer[];
  nodes: readonly GraphInsertionNodeLike[];
  point: { x: number; y: number };
}): NodeInsertionTarget | null {
  const node = topmostNodeAtPoint(nodes, graph, point);
  if (!node) return null;
  const targetPort = nodeTargetPortForAddedAction(action, node.id, graph, layers);
  if (!targetPort) return null;
  return {
    nodeId: node.id,
    insertion: {
      targetId: node.id,
      targetPort,
    },
  };
}

function nodeTargetPortForAddedAction(
  action: AddAction,
  nodeId: string,
  graph: CanvasGraph,
  layers: readonly Layer[],
): GraphEdge['toPort'] | null {
  if (action.kind === 'material' && isMaterialTargetNode(nodeId, graph, layers)) return 'material';
  if (action.kind === 'environment' && (graph.scene3dNodes ?? []).some((node) => node.id === nodeId)) return 'env';
  if (isEnvironmentRenderSourceAction(action) && (graph.environmentNodes ?? []).some((node) => node.id === nodeId))
    return 'in';
  if (
    action.kind === 'scene3d' &&
    layers.some((layer) => layer.id === nodeId && (layer.kind === 'model' || layer.kind === 'primitive'))
  )
    return 'model';
  return null;
}

function isEnvironmentRenderSourceAction(action: AddAction) {
  return !['environment', 'material', 'scene3d'].includes(action.kind);
}

function isMaterialTargetNode(nodeId: string, graph: CanvasGraph, layers: readonly Layer[]) {
  return (
    layers.some((layer) => layer.id === nodeId && layer.kind === 'primitive') ||
    (graph.scene3dNodes ?? []).some((node) => node.id === nodeId)
  );
}

function topmostNodeAtPoint(
  nodes: readonly GraphInsertionNodeLike[],
  graph: CanvasGraph,
  point: { x: number; y: number },
): GraphInsertionNodeLike | null {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node && pointInsideGraphInsertionNode(point, node, graph)) return node;
  }
  return null;
}

function pointInsideGraphInsertionNode(
  point: { x: number; y: number },
  node: GraphInsertionNodeLike,
  graph: CanvasGraph,
) {
  const position = graphInsertionNodePosition(node, graph, node.id);
  if (!position) return false;
  const width = graphInsertionNodeWidth(node, 320);
  const height = graphInsertionNodeHeight(node, 360);
  return (
    point.x >= position.x && point.x <= position.x + width && point.y >= position.y && point.y <= position.y + height
  );
}
