import {
  applyEdgeChanges,
  applyNodeChanges,
  type EdgeChange,
  type NodeChange,
  type Edge as RFEdge,
  type Node as RFNode,
} from '@xyflow/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CanvasGraph, GraphArea, GraphEdge, Layer } from '../../../types/config';
import {
  EXPORT_NODE_ID,
  graphUtilityNodeKind,
  removeGraphEdge,
  removeNodesFromGraphArea,
  splitEdgeWithNode,
  updateGraphPositions,
  wouldCreateCycle,
} from '../../../utils/nodeGraph';
import { AREA_PADDING_BOTTOM, AREA_PADDING_TOP, AREA_PADDING_X } from '../areas/areaBounds';
import { EDGE_INTERCEPT_THRESHOLD, NODE_H, NODE_W } from '../constants';
import { resolveGraphInsertionNodeCenter } from '../graphInsertion';
import { distancePointToSegment } from '../helpers';
import type { NodeCanvasMachineEvent } from '../machine';
import { type AlignableNode, type NodeAlignmentGuide, snapNodeToAlignment } from '../nodeAlignment';
import { retainNodeMeasurements, sameNodeList, stableNodeChanges } from '../nodeChanges';

const AREA_SEPARATION_GRACE = 18;

type NodeRect = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx: number;
  cy: number;
};

type AreaBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type InterceptCandidate = {
  edge: GraphEdge;
  distance: number;
};

export interface UseNodeDragStateOptions {
  baseNodes: RFNode[];
  baseEdges: RFEdge[];
  graphRef: React.RefObject<CanvasGraph>;
  layers: Layer[];
  send: (event: NodeCanvasMachineEvent) => void;
  onGraphChange: (graph: CanvasGraph) => void;
  onDeleteNodes: (ids: string[]) => void;
  canDeleteNode?: (id: string) => boolean;
}

export interface UseNodeDragStateResult {
  dragNodes: RFNode[];
  dragEdges: RFEdge[];
  alignmentGuides: NodeAlignmentGuide[];
  /** True while a node drag gesture is in progress. */
  isDraggingRef: React.MutableRefObject<boolean>;
  /** Stable ref for latest dragNodes — safe to read inside callbacks. */
  dragNodesRef: React.MutableRefObject<RFNode[]>;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onNodeDragStart: () => void;
  onNodeDragStop: (_: unknown, node: RFNode) => void;
  onSelectionDragStop: (_: React.MouseEvent, nodes: RFNode[]) => void;
  onSelectionChange: (args: { nodes: RFNode[]; edges: RFEdge[] }) => void;
  handleNodesChange: (changes: NodeChange[]) => void;
  commitNodePositions: (nodes: RFNode[]) => void;
}

function toAlignableNode(node: RFNode): AlignableNode {
  return {
    id: node.id,
    position: node.position,
    width: nodeWidth(node),
    height: nodeHeight(node),
  };
}

function firstNumber(fallback: number, values: Array<number | undefined>): number {
  for (const value of values) {
    if (value !== undefined) return value;
  }
  return fallback;
}

function nodeWidth(node: RFNode | undefined): number {
  return firstNumber(NODE_W, [node?.measured?.width, node?.width]);
}

function nodeHeight(node: RFNode | undefined): number {
  return firstNumber(NODE_H, [node?.measured?.height, node?.height]);
}

function nodeRect(nodeId: string, graph: CanvasGraph, nodesById: Map<string, RFNode>): NodeRect | null {
  const node = nodesById.get(nodeId);
  const position = node?.position ?? graph.positions[nodeId];
  if (!position) return null;
  const width = nodeWidth(node);
  const height = nodeHeight(node);
  return {
    x1: position.x,
    y1: position.y,
    x2: position.x + width,
    y2: position.y + height,
    cx: position.x + width / 2,
    cy: position.y + height / 2,
  };
}

function nodesByIdWithMoved(currentNodes: RFNode[], movedNodes: RFNode[]) {
  const nodesById = new Map(currentNodes.map((node) => [node.id, node]));
  for (const node of movedNodes) nodesById.set(node.id, node);
  return nodesById;
}

function anchorRectsForArea(
  area: GraphArea,
  graph: CanvasGraph,
  nodesById: Map<string, RFNode>,
  movedIds: Set<string>,
  movedNodeId: string,
) {
  return area.nodeIds
    .filter((nodeId) => nodeId !== movedNodeId && !movedIds.has(nodeId))
    .map((nodeId) => nodeRect(nodeId, graph, nodesById))
    .filter((rect): rect is NodeRect => rect !== null);
}

function boundsForAreaAnchors(anchorRects: NodeRect[]): AreaBounds {
  return {
    minX: Math.min(...anchorRects.map((rect) => rect.x1)) - AREA_PADDING_X - AREA_SEPARATION_GRACE,
    minY: Math.min(...anchorRects.map((rect) => rect.y1)) - AREA_PADDING_TOP - AREA_SEPARATION_GRACE,
    maxX: Math.max(...anchorRects.map((rect) => rect.x2)) + AREA_PADDING_X + AREA_SEPARATION_GRACE,
    maxY: Math.max(...anchorRects.map((rect) => rect.y2)) + AREA_PADDING_BOTTOM + AREA_SEPARATION_GRACE,
  };
}

function rectCenterInsideBounds(rect: NodeRect, bounds: AreaBounds): boolean {
  return rect.cx >= bounds.minX && rect.cx <= bounds.maxX && rect.cy >= bounds.minY && rect.cy <= bounds.maxY;
}

function shouldSeparateMovedNodeFromArea(
  movedNode: RFNode,
  area: GraphArea,
  graph: CanvasGraph,
  nodesById: Map<string, RFNode>,
  movedIds: Set<string>,
) {
  const anchorRects = anchorRectsForArea(area, graph, nodesById, movedIds, movedNode.id);
  if (anchorRects.length === 0) return false;
  const movedRect = nodeRect(movedNode.id, graph, nodesById);
  if (!movedRect) return false;
  return !rectCenterInsideBounds(movedRect, boundsForAreaAnchors(anchorRects));
}

function separateMovedNodesFromGraphAreas(graph: CanvasGraph, movedNodes: RFNode[], currentNodes: RFNode[]) {
  if (!hasAreaSeparationWork(graph, movedNodes)) return graph;
  const movedIds = new Set(movedNodes.map((node) => node.id));
  const nodesById = nodesByIdWithMoved(currentNodes, movedNodes);
  let next = graph;

  for (const movedNode of movedNodes) {
    next = separateMovedNodeFromGraphArea(next, movedNode, nodesById, movedIds);
  }

  return next;
}

function hasAreaSeparationWork(graph: CanvasGraph, movedNodes: RFNode[]) {
  return Boolean(graph.areas?.length) && movedNodes.length > 0;
}

function separateMovedNodeFromGraphArea(
  graph: CanvasGraph,
  movedNode: RFNode,
  nodesById: Map<string, RFNode>,
  movedIds: Set<string>,
) {
  const area = movedNodeGraphArea(graph, movedNode.id);
  if (!area) return graph;
  if (!shouldSeparateMovedNodeFromArea(movedNode, area, graph, nodesById, movedIds)) return graph;
  return removeNodesFromGraphArea(graph, area.id, [movedNode.id]);
}

function movedNodeGraphArea(graph: CanvasGraph, nodeId: string) {
  return (graph.areas ?? []).find((item) => item.nodeIds.includes(nodeId));
}

function interceptInputPort(nodeId: string, graph: CanvasGraph, layers: Layer[]): GraphEdge['toPort'] | null {
  if (nodeId === EXPORT_NODE_ID) return null;
  const graphOnlyPort = graphOnlyNodeInputPort(nodeId, graph);
  if (graphOnlyPort) return graphOnlyPort;
  return layerNodeInputPort(nodeId, layers);
}

function layerNodeInputPort(nodeId: string, layers: Layer[]): GraphEdge['toPort'] | null {
  const layer = layers.find((item) => item.id === nodeId);
  if (!layer) return null;
  return layer.kind === 'effect' ? 'in' : 'bg';
}

function graphOnlyNodeInputPort(nodeId: string, graph: CanvasGraph): GraphEdge['toPort'] | null {
  if (graph.mergeNodes.some((mergeNode) => mergeNode.id === nodeId)) return 'a';
  if ((graph.scene3dNodes ?? []).some((sceneNode) => sceneNode.id === nodeId)) return 'model';
  return hasSingleInputGraphNode(graph, nodeId) ? 'in' : null;
}

function hasSingleInputGraphNode(graph: CanvasGraph, nodeId: string) {
  const kind = graphUtilityNodeKind(graph, nodeId);
  return kind !== null && kind !== 'merge' && kind !== 'scene3d' && kind !== 'environment';
}

function nodeCenterPoint(node: RFNode) {
  return {
    x: node.position.x + nodeWidth(node) / 2,
    y: node.position.y + nodeHeight(node) / 2,
  };
}

function graphNodeCenter(nodeId: string, graph: CanvasGraph, nodesById: Map<string, RFNode>) {
  return resolveGraphInsertionNodeCenter({
    nodeId,
    graph,
    nodesById,
    fallbackWidth: NODE_W,
    fallbackHeight: NODE_H,
  });
}

function interceptCandidateForEdge(
  edge: GraphEdge,
  node: RFNode,
  graph: CanvasGraph,
  nodesById: Map<string, RFNode>,
): InterceptCandidate | null {
  if (edgeTouchesNode(edge, node.id)) return null;
  const segment = graphEdgeSegment(edge, graph, nodesById);
  return interceptCandidateForSegment(edge, node, segment);
}

function edgeTouchesNode(edge: GraphEdge, nodeId: string) {
  return edge.fromId === nodeId || edge.toId === nodeId;
}

function interceptCandidateForSegment(edge: GraphEdge, node: RFNode, segment: ReturnType<typeof graphEdgeSegment>) {
  if (!segment) return null;
  const distance = distancePointToSegment(nodeCenterPoint(node), segment.start, segment.end);
  return distanceWithinInterceptThreshold(distance) ? { edge, distance } : null;
}

function distanceWithinInterceptThreshold(distance: number) {
  return distance <= EDGE_INTERCEPT_THRESHOLD;
}

function graphEdgeSegment(edge: GraphEdge, graph: CanvasGraph, nodesById: Map<string, RFNode>) {
  const start = graphNodeCenter(edge.fromId, graph, nodesById);
  const end = graphNodeCenter(edge.toId, graph, nodesById);
  return start && end ? { start, end } : null;
}

function closerInterceptCandidate(best: InterceptCandidate | null, candidate: InterceptCandidate | null) {
  if (!candidate) return best;
  return !best || candidate.distance < best.distance ? candidate : best;
}

function findGraphInterceptEdge(node: RFNode, graph: CanvasGraph, currentNodes: RFNode[]): GraphEdge | null {
  const nodesById = new Map(currentNodes.map((item) => [item.id, item]));
  let best: InterceptCandidate | null = null;
  for (const edge of graph.edges) {
    best = closerInterceptCandidate(best, interceptCandidateForEdge(edge, node, graph, nodesById));
  }
  return best?.edge ?? null;
}

function canSplitInterceptEdge(graph: CanvasGraph, edge: GraphEdge, nodeId: string) {
  const graphWithoutEdge = removeGraphEdge(graph, edge.id);
  return (
    !wouldCreateCycle(graphWithoutEdge, edge.fromId, nodeId) && !wouldCreateCycle(graphWithoutEdge, nodeId, edge.toId)
  );
}

function committedDragNode(node: RFNode, dragNodes: RFNode[]) {
  return dragNodes.find((item) => item.id === node.id) ?? node;
}

function splitGraphForIntercept(
  graph: CanvasGraph,
  edge: GraphEdge | null,
  nodeId: string,
  inputPort: GraphEdge['toPort'] | null,
) {
  if (!edge || !inputPort) return null;
  if (!canSplitInterceptEdge(graph, edge, nodeId)) return null;
  return splitEdgeWithNode(graph, edge.id, nodeId, inputPort);
}

function graphAfterNodeDragCommit({
  node,
  dragNodes,
  graph,
  layers,
  separateMovedNodesFromAreas,
}: {
  node: RFNode;
  dragNodes: RFNode[];
  graph: CanvasGraph;
  layers: Layer[];
  separateMovedNodesFromAreas: (graph: CanvasGraph, movedNodes: RFNode[]) => CanvasGraph;
}) {
  const committedNode = committedDragNode(node, dragNodes);
  const movedGraph = updateGraphPositions(graph, [{ id: committedNode.id, position: committedNode.position }]);
  const areaGraph = separateMovedNodesFromAreas(movedGraph, [committedNode]);
  const interceptEdge = findGraphInterceptEdge(committedNode, graph, dragNodes);
  return (
    splitGraphForIntercept(areaGraph, interceptEdge, node.id, interceptInputPort(node.id, graph, layers)) ?? areaGraph
  );
}

function positionNodeChanges(changes: NodeChange[]) {
  return changes.filter((change) => change.type === 'position' && change.position);
}

function snapSingleMovingNode(nodes: RFNode[], movingId: string) {
  const movingNode = nodes.find((node) => node.id === movingId);
  if (!movingNode) return { nodes, guides: [] };
  const snap = snapNodeToAlignment(
    toAlignableNode(movingNode),
    nodes.filter((node) => node.id !== movingId).map(toAlignableNode),
  );
  const snappedNodes = snap.guides.length
    ? nodes.map((node) => (node.id === movingId ? { ...node, position: snap.position } : node))
    : nodes;
  return { nodes: snappedNodes, guides: snap.guides };
}

function applyDragNodeChanges(
  changes: NodeChange[],
  previousNodes: RFNode[],
  dragging: boolean,
  setAlignmentGuides: (guides: NodeAlignmentGuide[]) => void,
) {
  const relevant = stableNodeChanges(changes, previousNodes);
  if (!relevant.length) return previousNodes;
  const positions = positionNodeChanges(relevant);
  const changedNodes = applyNodeChanges(relevant, previousNodes);
  return applyPositionGuides(changedNodes, positions, dragging, setAlignmentGuides);
}

function applyPositionGuides(
  nodes: RFNode[],
  positions: NodeChange[],
  dragging: boolean,
  setAlignmentGuides: (guides: NodeAlignmentGuide[]) => void,
) {
  if (dragging && positions.length === 1) return applySinglePositionGuide(nodes, positions[0].id, setAlignmentGuides);
  if (positions.length) setAlignmentGuides([]);
  return nodes;
}

function applySinglePositionGuide(
  nodes: RFNode[],
  movingId: string,
  setAlignmentGuides: (guides: NodeAlignmentGuide[]) => void,
) {
  const snap = snapSingleMovingNode(nodes, movingId);
  setAlignmentGuides(snap.guides);
  return snap.nodes;
}

function isDeletableNodeChange(change: NodeChange, canDeleteNode: UseNodeDragStateOptions['canDeleteNode']) {
  if (change.type !== 'remove') return false;
  if (change.id === EXPORT_NODE_ID) return false;
  return canDeleteNode ? canDeleteNode(change.id) : true;
}

function retainNodeChange(
  change: NodeChange,
  canDeleteNode: UseNodeDragStateOptions['canDeleteNode'],
  onDeleteNodes: (ids: string[]) => void,
  send: (event: NodeCanvasMachineEvent) => void,
) {
  if (change.type !== 'remove') return true;
  if (isDeletableNodeChange(change, canDeleteNode)) {
    onDeleteNodes([change.id]);
    send({ type: 'NODE_IDS_REMOVED', ids: [change.id] });
  }
  return false;
}

/**
 * Owns the drag-local shadow copy of nodes/edges that keeps React Flow
 * responsive during drags without writing to the document on every pointer move.
 * Also manages edge-intercept (drop-onto-edge) logic.
 */
export function useNodeDragState({
  baseNodes,
  baseEdges,
  graphRef,
  layers,
  send,
  onGraphChange,
  onDeleteNodes,
  canDeleteNode,
}: UseNodeDragStateOptions): UseNodeDragStateResult {
  const [dragNodes, setDragNodes] = useState<RFNode[]>(() =>
    retainNodeMeasurements(baseNodes, [], { width: NODE_W, height: NODE_H }),
  );
  const [dragEdges, setDragEdges] = useState<RFEdge[]>(baseEdges);
  const [alignmentGuides, setAlignmentGuides] = useState<NodeAlignmentGuide[]>([]);
  const isDraggingRef = useRef(false);
  const dragNodesRef = useRef<RFNode[]>(dragNodes);
  const selectionSigRef = useRef('');
  useLayoutEffect(() => {
    dragNodesRef.current = dragNodes;
  }, [dragNodes]);

  // Sync shadow copy from canonical state when not dragging.
  useEffect(() => {
    if (!isDraggingRef.current) {
      setDragNodes((prev) => {
        const next = retainNodeMeasurements(baseNodes, prev, {
          width: NODE_W,
          height: NODE_H,
        });
        return sameNodeList(prev, next) ? prev : next;
      });
      setDragEdges((prev) => (prev === baseEdges ? prev : baseEdges));
      setAlignmentGuides((prev) => (prev.length ? [] : prev));
    }
  }, [baseNodes, baseEdges]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setDragNodes((prev) => {
      const next = applyDragNodeChanges(changes, prev, isDraggingRef.current, setAlignmentGuides);
      dragNodesRef.current = next;
      return next;
    });
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setDragEdges((prev) => applyEdgeChanges(changes, prev));
  }, []);

  const separateMovedNodesFromAreas = useCallback(
    (graph: CanvasGraph, movedNodes: RFNode[]) =>
      separateMovedNodesFromGraphAreas(graph, movedNodes, dragNodesRef.current),
    [dragNodesRef],
  );

  const commitNodePositions = useCallback(
    (nodes: RFNode[]) => {
      const moved = nodes.map((node) => ({
        id: node.id,
        position: node.position,
      }));
      if (moved.length === 0) return;
      onGraphChange(separateMovedNodesFromAreas(updateGraphPositions(graphRef.current, moved), nodes));
    },
    [onGraphChange, graphRef, separateMovedNodesFromAreas],
  );

  const onNodeDragStart = useCallback(() => {
    isDraggingRef.current = true;
    setAlignmentGuides([]);
  }, []);

  const onNodeDragStop = useCallback(
    (_: unknown, node: RFNode) => {
      isDraggingRef.current = false;
      setAlignmentGuides([]);
      onGraphChange(
        graphAfterNodeDragCommit({
          node,
          dragNodes: dragNodesRef.current,
          graph: graphRef.current,
          layers,
          separateMovedNodesFromAreas,
        }),
      );
    },
    [onGraphChange, graphRef, layers, separateMovedNodesFromAreas],
  );

  const onSelectionDragStop = useCallback(
    (_: React.MouseEvent, nodes: RFNode[]) => {
      isDraggingRef.current = false;
      setAlignmentGuides([]);
      commitNodePositions(nodes);
    },
    [commitNodePositions],
  );

  const onSelectionChange = useCallback(
    ({ nodes, edges }: { nodes: RFNode[]; edges: RFEdge[] }) => {
      const nodeIds = nodes.map((node) => node.id);
      const edgeIds = edges.map((edge) => edge.id);
      const selectionSig = `${nodeIds.join(',')}::${edgeIds.join(',')}`;
      if (selectionSig === selectionSigRef.current) return;
      selectionSigRef.current = selectionSig;
      send({
        type: 'SELECTION_CHANGED',
        nodeIds,
        edgeIds,
      });
    },
    [send],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const nonRemove = changes.filter((change) => retainNodeChange(change, canDeleteNode, onDeleteNodes, send));
      if (nonRemove.length) onNodesChange(nonRemove);
    },
    [onNodesChange, onDeleteNodes, canDeleteNode, send],
  );

  return {
    dragNodes,
    dragEdges,
    alignmentGuides,
    isDraggingRef,
    dragNodesRef,
    onNodesChange,
    onEdgesChange,
    onNodeDragStart,
    onNodeDragStop,
    onSelectionDragStop,
    onSelectionChange,
    handleNodesChange,
    commitNodePositions,
  };
}
