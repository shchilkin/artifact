import type { Connection, ReactFlowInstance, Edge as RFEdge } from '@xyflow/react';
import { useCallback } from 'react';
import {
  type AspectRatio,
  type CanvasGraph,
  type GraphEdge,
  type Layer,
  MATERIAL_TEXTURE_INPUT_PORTS,
} from '../../../types/config';
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
  layers,
  send,
  rfInstanceRef,
  onGraphChange,
}: UseNodeGraphEventsOptions): UseNodeGraphEventsResult {
  const isValidConnection = useCallback(
    (connection: Connection) => isGraphConnectionAllowed(connection, graphRef.current, layers),
    [graphRef, layers],
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

function isGraphConnectionAllowed(connection: Connection, graph: CanvasGraph, layers: Layer[]) {
  const endpoints = graphConnectionEndpoints(connection);
  if (!endpoints) return false;
  if (endpoints.source === endpoints.target) return false;
  if (endpoints.source === EXPORT_NODE_ID) return false;
  if (!isGraphPortConnectionAllowed(connection, graph, layers)) return false;
  return !wouldCreateCycle(graph, endpoints.source, endpoints.target);
}

function graphConnectionEndpoints(connection: Connection) {
  if (!connection.source) return null;
  if (!connection.target) return null;
  return { source: connection.source, target: connection.target };
}

export function isGraphPortConnectionAllowed(connection: Connection, graph: CanvasGraph, layers: Layer[]) {
  const targetPort = connection.targetHandle ?? 'in';
  const sourceIsMaterial = (graph.materialNodes ?? []).some((node) => node.id === connection.source);
  const sourceIsShader = (graph.shaderNodes ?? []).some((node) => node.id === connection.source);
  const sourceShader = (graph.shaderNodes ?? []).find((node) => node.id === connection.source);
  const targetIsMaterial = (graph.materialNodes ?? []).some((node) => node.id === connection.target);
  const targetShader = (graph.shaderNodes ?? []).find((node) => node.id === connection.target);
  if (targetPort === 'bg' && targetShader) return targetShader.role === 'effect' && !sourceIsMaterial;
  if ((MATERIAL_TEXTURE_INPUT_PORTS as readonly string[]).includes(targetPort)) {
    const sourceReady =
      !sourceShader ||
      sourceShader.role === 'fill' ||
      graph.edges.some((edge) => edge.toId === sourceShader.id && edge.toPort === 'bg');
    return targetIsMaterial && !sourceIsMaterial && sourceReady;
  }
  if (targetPort === 'material') {
    const targetIsPrimitive = layers.some((layer) => layer.id === connection.target && layer.kind === 'primitive');
    const targetIsScene3D = (graph.scene3dNodes ?? []).some((node) => node.id === connection.target);
    return (sourceIsMaterial || sourceIsShader) && (targetIsPrimitive || targetIsScene3D);
  }
  return !sourceIsMaterial;
}
