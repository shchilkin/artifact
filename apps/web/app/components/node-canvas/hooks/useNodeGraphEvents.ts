import type { Connection, ReactFlowInstance, Edge as RFEdge } from '@xyflow/react';
import { useCallback } from 'react';
import type { AspectRatio, CanvasGraph, GraphEdge, Layer } from '../../../types/config';
import {
  addGraphEdge,
  EXPORT_NODE_ID,
  organizeGraph,
  removeGraphEdge,
  wouldCreateCycle,
} from '../../../utils/nodeGraph';
import type { NodeCanvasMachineEvent } from '../machine';

export interface UseNodeGraphEventsOptions {
  graphRef: React.RefObject<CanvasGraph>;
  aspect: AspectRatio;
  layers: Layer[];
  send: (event: NodeCanvasMachineEvent) => void;
  rfInstanceRef: React.RefObject<ReactFlowInstance | null>;
  onGraphChange: (graph: CanvasGraph) => void;
}

export interface UseNodeGraphEventsResult {
  isValidConnection: (connection: Connection) => boolean;
  onConnect: (connection: Connection) => void;
  onEdgesDelete: (deleted: RFEdge[]) => void;
  onEdgeClick: (e: React.MouseEvent, edge: RFEdge) => void;
  handleOrganizeNodes: (layers: Layer[]) => void;
}

/**
 * Owns graph-mutation events: connect, delete, validate connections,
 * and auto-layout organise.
 */
export function useNodeGraphEvents({
  graphRef,
  aspect,
  send,
  rfInstanceRef,
  onGraphChange,
}: UseNodeGraphEventsOptions): UseNodeGraphEventsResult {
  const isValidConnection = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;
      if (connection.source === EXPORT_NODE_ID) return false;
      return !wouldCreateCycle(graphRef.current, connection.source, connection.target);
    },
    [graphRef],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const edge: GraphEdge = {
        id: `e-${connection.source}-${connection.target}-${Date.now()}`,
        fromId: connection.source,
        fromPort: 'out',
        toId: connection.target,
        toPort: (connection.targetHandle ?? 'in') as GraphEdge['toPort'],
      };
      onGraphChange(addGraphEdge(graphRef.current, edge));
    },
    [onGraphChange, graphRef],
  );

  const onEdgesDelete = useCallback(
    (deleted: RFEdge[]) => {
      let g = graphRef.current;
      for (const e of deleted) g = removeGraphEdge(g, e.id);
      send({ type: 'EDGE_IDS_REMOVED', ids: deleted.map((edge) => edge.id) });
      onGraphChange(g);
    },
    [onGraphChange, graphRef, send],
  );

  const onEdgeClick = useCallback(
    (e: React.MouseEvent, edge: RFEdge) => {
      e.preventDefault();
      e.stopPropagation();
      send({ type: 'EDGE_SELECTED', id: edge.id });
    },
    [send],
  );

  const handleOrganizeNodes = useCallback(
    (layers: Layer[]) => {
      onGraphChange(organizeGraph(graphRef.current, layers, aspect));
      requestAnimationFrame(() => {
        rfInstanceRef.current?.fitView({ padding: 0.2, duration: 220 });
      });
    },
    [aspect, onGraphChange, rfInstanceRef, graphRef],
  );

  return {
    isValidConnection,
    onConnect,
    onEdgesDelete,
    onEdgeClick,
    handleOrganizeNodes,
  };
}
