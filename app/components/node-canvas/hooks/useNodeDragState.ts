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
  removeNodesFromGraphArea,
  splitEdgeWithNode,
  updateGraphPositions,
  wouldCreateCycle,
} from '../../../utils/nodeGraph';
import { AREA_PADDING_BOTTOM, AREA_PADDING_TOP, AREA_PADDING_X } from '../areas/areaBounds';
import { EDGE_INTERCEPT_THRESHOLD, NODE_H, NODE_W } from '../constants';
import { distancePointToSegment } from '../helpers';
import type { NodeCanvasMachineEvent } from '../machine';
import { retainNodeMeasurements, stableNodeChanges } from '../nodeChanges';

const AREA_SEPARATION_GRACE = 18;

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
  const [dragNodes, setDragNodes] = useState<RFNode[]>(() =>
    retainNodeMeasurements(baseNodes, [], { width: NODE_W, height: NODE_H }),
  );
  const [dragEdges, setDragEdges] = useState<RFEdge[]>(baseEdges);
  const isDraggingRef = useRef(false);
  const dragNodesRef = useRef<RFNode[]>(dragNodes);
  const selectionSigRef = useRef('');
  useLayoutEffect(() => {
    dragNodesRef.current = dragNodes;
  }, [dragNodes]);

  // Sync shadow copy from canonical state when not dragging.
  useEffect(() => {
    if (!isDraggingRef.current) {
      setDragNodes((prev) => retainNodeMeasurements(baseNodes, prev, { width: NODE_W, height: NODE_H }));
      setDragEdges(baseEdges);
    }
  }, [baseNodes, baseEdges]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setDragNodes((prev) => {
      const relevant = stableNodeChanges(changes, prev);
      return relevant.length ? applyNodeChanges(relevant, prev) : prev;
    });
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setDragEdges((prev) => applyEdgeChanges(changes, prev));
  }, []);

  const separateMovedNodesFromAreas = useCallback(
    (graph: CanvasGraph, movedNodes: RFNode[]) => {
      if (!graph.areas?.length || movedNodes.length === 0) return graph;

      const movedIds = new Set(movedNodes.map((node) => node.id));
      const nodesById = new Map(dragNodesRef.current.map((node) => [node.id, node]));
      for (const node of movedNodes) nodesById.set(node.id, node);

      const getRect = (nodeId: string) => {
        const node = nodesById.get(nodeId);
        const position = node?.position ?? graph.positions[nodeId];
        if (!position) return null;
        const width = node?.measured?.width ?? node?.width ?? NODE_W;
        const height = node?.measured?.height ?? node?.height ?? NODE_H;
        return {
          x1: position.x,
          y1: position.y,
          x2: position.x + width,
          y2: position.y + height,
          cx: position.x + width / 2,
          cy: position.y + height / 2,
        };
      };

      let next = graph;
      for (const movedNode of movedNodes) {
        const area = (next.areas ?? []).find((item) => item.nodeIds.includes(movedNode.id));
        if (!area) continue;

        const anchorRects = area.nodeIds
          .filter((nodeId) => nodeId !== movedNode.id && !movedIds.has(nodeId))
          .map(getRect)
          .filter((rect): rect is NonNullable<typeof rect> => rect !== null);
        if (anchorRects.length === 0) continue;

        const movedRect = getRect(movedNode.id);
        if (!movedRect) continue;

        const minX = Math.min(...anchorRects.map((rect) => rect.x1)) - AREA_PADDING_X - AREA_SEPARATION_GRACE;
        const minY = Math.min(...anchorRects.map((rect) => rect.y1)) - AREA_PADDING_TOP - AREA_SEPARATION_GRACE;
        const maxX = Math.max(...anchorRects.map((rect) => rect.x2)) + AREA_PADDING_X + AREA_SEPARATION_GRACE;
        const maxY = Math.max(...anchorRects.map((rect) => rect.y2)) + AREA_PADDING_BOTTOM + AREA_SEPARATION_GRACE;
        const inside = movedRect.cx >= minX && movedRect.cx <= maxX && movedRect.cy >= minY && movedRect.cy <= maxY;
        if (!inside) next = removeNodesFromGraphArea(next, area.id, [movedNode.id]);
      }

      return next;
    },
    [dragNodesRef],
  );

  const commitNodePositions = useCallback(
    (nodes: RFNode[]) => {
      const moved = nodes.map((node) => ({ id: node.id, position: node.position }));
      if (moved.length === 0) return;
      onGraphChange(separateMovedNodesFromAreas(updateGraphPositions(graphRef.current, moved), nodes));
    },
    [onGraphChange, graphRef, separateMovedNodesFromAreas],
  );

  const getInterceptInputPort = useCallback(
    (nodeId: string) => {
      if (nodeId === EXPORT_NODE_ID) return null;
      if (graphRef.current.mergeNodes.some((mergeNode) => mergeNode.id === nodeId)) return 'a' as const;
      if ((graphRef.current.colorNodes ?? []).some((colorNode) => colorNode.id === nodeId)) return 'in' as const;
      if ((graphRef.current.repeatNodes ?? []).some((repeatNode) => repeatNode.id === nodeId)) return 'in' as const;
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
  }, []);

  const onNodeDragStop = useCallback(
    (_: unknown, node: RFNode) => {
      isDraggingRef.current = false;
      const movedGraph = updateGraphPositions(graphRef.current, [{ id: node.id, position: node.position }]);
      const areaGraph = separateMovedNodesFromAreas(movedGraph, [node]);
      const interceptEdge = findInterceptEdge(node);
      const inputPort = getInterceptInputPort(node.id);
      if (
        interceptEdge &&
        inputPort &&
        !wouldCreateCycle(removeGraphEdge(areaGraph, interceptEdge.id), interceptEdge.fromId, node.id) &&
        !wouldCreateCycle(removeGraphEdge(areaGraph, interceptEdge.id), node.id, interceptEdge.toId)
      ) {
        onGraphChange(splitEdgeWithNode(areaGraph, interceptEdge.id, node.id, inputPort));
        return;
      }
      onGraphChange(areaGraph);
    },
    [findInterceptEdge, getInterceptInputPort, onGraphChange, graphRef, separateMovedNodesFromAreas],
  );

  const onSelectionDragStop = useCallback(
    (_: React.MouseEvent, nodes: RFNode[]) => {
      isDraggingRef.current = false;
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
