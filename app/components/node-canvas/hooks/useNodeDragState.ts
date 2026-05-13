import {
  applyEdgeChanges,
  applyNodeChanges,
  type EdgeChange,
  type NodeChange,
  type Edge as RFEdge,
  type Node as RFNode,
} from '@xyflow/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CanvasGraph, Layer } from '../../../types/config';
import {
  EXPORT_NODE_ID,
  removeGraphEdge,
  splitEdgeWithNode,
  updateGraphPositions,
  wouldCreateCycle,
} from '../../../utils/nodeGraph';
import { EDGE_INTERCEPT_THRESHOLD, NODE_H, NODE_W } from '../constants';
import { distancePointToSegment } from '../helpers';
import type { NodeCanvasMachineEvent } from '../machine';

export interface UseNodeDragStateOptions {
  baseNodes: RFNode[];
  baseEdges: RFEdge[];
  graphRef: React.RefObject<CanvasGraph>;
  layers: Layer[];
  send: (event: NodeCanvasMachineEvent) => void;
  onGraphChange: (graph: CanvasGraph) => void;
  onDeleteNodes: (ids: string[]) => void;
}

export interface UseNodeDragStateResult {
  dragNodes: RFNode[];
  dragEdges: RFEdge[];
  /** True while a node drag gesture is in progress. */
  isDraggingRef: React.MutableRefObject<boolean>;
  isDragging: boolean;
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
}: UseNodeDragStateOptions): UseNodeDragStateResult {
  const [dragNodes, setDragNodes] = useState<RFNode[]>(baseNodes);
  const [dragEdges, setDragEdges] = useState<RFEdge[]>(baseEdges);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragNodesRef = useRef<RFNode[]>(dragNodes);
  useLayoutEffect(() => {
    dragNodesRef.current = dragNodes;
  }, [dragNodes]);

  // Sync shadow copy from canonical state when not dragging.
  useEffect(() => {
    if (!isDraggingRef.current) {
      setDragNodes(baseNodes);
      setDragEdges(baseEdges);
    }
  }, [baseNodes, baseEdges]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Keep React Flow's measured dimensions internal. Feeding dimensions back
    // into the controlled nodes prop can re-trigger measurement indefinitely
    // when overlays or connection menus change the viewport tree.
    const relevant = changes.filter((c) => c.type === 'position');
    if (relevant.length) setDragNodes((prev) => applyNodeChanges(relevant, prev));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setDragEdges((prev) => applyEdgeChanges(changes, prev));
  }, []);

  const commitNodePositions = useCallback(
    (nodes: RFNode[]) => {
      const moved = nodes.map((node) => ({ id: node.id, position: node.position }));
      if (moved.length === 0) return;
      onGraphChange(updateGraphPositions(graphRef.current, moved));
    },
    [onGraphChange, graphRef],
  );

  const getInterceptInputPort = useCallback(
    (nodeId: string) => {
      if (nodeId === EXPORT_NODE_ID) return null;
      if (graphRef.current.mergeNodes.some((mergeNode) => mergeNode.id === nodeId)) return 'a' as const;
      if ((graphRef.current.colorNodes ?? []).some((colorNode) => colorNode.id === nodeId)) return 'in' as const;
      const layer = layers.find((item) => item.id === nodeId);
      if (!layer) return null;
      return layer.kind === 'effect' ? ('in' as const) : ('bg' as const);
    },
    [layers, graphRef],
  );

  const findInterceptEdge = useCallback(
    (node: RFNode) => {
      const nodeLookup = new Map(dragNodesRef.current.map((item) => [item.id, item]));
      const getCenter = (nodeId: string) => {
        const rfNode = nodeLookup.get(nodeId);
        const position = rfNode?.position ?? graphRef.current.positions[nodeId];
        if (!position) return null;
        const width = rfNode?.measured?.width ?? NODE_W;
        const height = rfNode?.measured?.height ?? NODE_H;
        return { x: position.x + width / 2, y: position.y + height / 2 };
      };
      const point = {
        x: node.position.x + (node.measured?.width ?? NODE_W) / 2,
        y: node.position.y + (node.measured?.height ?? NODE_H) / 2,
      };
      let best: { edge: import('../../../types/config').GraphEdge; distance: number } | null = null;
      for (const edge of graphRef.current.edges) {
        if (edge.fromId === node.id || edge.toId === node.id) continue;
        const start = getCenter(edge.fromId);
        const end = getCenter(edge.toId);
        if (!start || !end) continue;
        const distance = distancePointToSegment(point, start, end);
        if (distance > EDGE_INTERCEPT_THRESHOLD) continue;
        if (!best || distance < best.distance) best = { edge, distance };
      }
      return best?.edge ?? null;
    },
    [graphRef],
  );

  const onNodeDragStart = useCallback(() => {
    isDraggingRef.current = true;
    setIsDragging(true);
  }, []);

  const onNodeDragStop = useCallback(
    (_: unknown, node: RFNode) => {
      isDraggingRef.current = false;
      setIsDragging(false);
      const movedGraph = updateGraphPositions(graphRef.current, [{ id: node.id, position: node.position }]);
      const interceptEdge = findInterceptEdge(node);
      const inputPort = getInterceptInputPort(node.id);
      if (
        interceptEdge &&
        inputPort &&
        !wouldCreateCycle(removeGraphEdge(movedGraph, interceptEdge.id), interceptEdge.fromId, node.id) &&
        !wouldCreateCycle(removeGraphEdge(movedGraph, interceptEdge.id), node.id, interceptEdge.toId)
      ) {
        onGraphChange(splitEdgeWithNode(movedGraph, interceptEdge.id, node.id, inputPort));
        return;
      }
      commitNodePositions([node]);
    },
    [commitNodePositions, findInterceptEdge, getInterceptInputPort, onGraphChange, graphRef],
  );

  const onSelectionDragStop = useCallback(
    (_: React.MouseEvent, nodes: RFNode[]) => {
      isDraggingRef.current = false;
      setIsDragging(false);
      commitNodePositions(nodes);
    },
    [commitNodePositions],
  );

  const onSelectionChange = useCallback(
    ({ nodes, edges }: { nodes: RFNode[]; edges: RFEdge[] }) => {
      send({
        type: 'SELECTION_CHANGED',
        nodeIds: nodes.map((node) => node.id),
        edgeIds: edges.map((edge) => edge.id),
      });
    },
    [send],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const nonRemove = changes.filter((c) => {
        if (c.type !== 'remove') return true;
        const isExport = c.id === EXPORT_NODE_ID;
        if (!isExport) {
          onDeleteNodes([c.id]);
          send({ type: 'NODE_IDS_REMOVED', ids: [c.id] });
        }
        return false;
      });
      if (nonRemove.length) onNodesChange(nonRemove);
    },
    [onNodesChange, onDeleteNodes, send],
  );

  return {
    dragNodes,
    dragEdges,
    isDraggingRef,
    isDragging,
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
