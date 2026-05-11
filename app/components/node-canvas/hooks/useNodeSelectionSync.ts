import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { CanvasDocument, CanvasGraph } from '../../../types/config';
import { EXPORT_NODE_ID } from '../../../utils/nodeGraph';
import { isAdditiveSelectionEvent } from '../helpers';
import type { NodeCanvasMachineEvent } from '../machine';

export interface UseNodeSelectionSyncOptions {
  send: (event: NodeCanvasMachineEvent) => void;
  /** Current machine context values. */
  selectedNodeIds: string[];
  selectedEdgeId: string | null;
  expandedNodeId: string | null;
  /** Externally controlled selected layer (from generator). */
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  doc: CanvasDocument;
  graph: CanvasGraph;
}

export interface UseNodeSelectionSyncResult {
  selectedNodeId: string | null;
  selectedNodeIdSet: Set<string>;
  /** Stable ref always pointing to the current selectedNodeId — safe in callbacks. */
  selectedNodeIdRef: React.MutableRefObject<string | null>;
  /** Stable ref always pointing to the current selectedEdgeId — safe in callbacks. */
  selectedEdgeIdRef: React.MutableRefObject<string | null>;
  activeEditorNodeId: string | null;
  handleSelectNode: (id: string, event?: React.MouseEvent) => void;
  handleToggleEditor: (id: string) => void;
  handleClosePanel: () => void;
}

/**
 * Manages node/edge selection and synchronises it with the external `selectedLayerId` prop.
 * Owns the XState machine helpers for NODE_SELECTED, NODE_EDITOR_TOGGLED, PANE_CLICKED,
 * SYNC_EXTERNAL_NODE, and FILTER_INVALID_REFERENCES events.
 */
export function useNodeSelectionSync({
  send,
  selectedNodeIds,
  selectedEdgeId,
  expandedNodeId,
  selectedLayerId,
  onSelectLayer,
  doc,
  graph,
}: UseNodeSelectionSyncOptions): UseNodeSelectionSyncResult {
  const selectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;
  const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);

  const selectedNodeIdRef = useRef(selectedNodeId);
  const selectedEdgeIdRef = useRef(selectedEdgeId);
  useLayoutEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
    selectedEdgeIdRef.current = selectedEdgeId;
  }, [selectedNodeId, selectedEdgeId]);

  // Notify parent when selection changes.
  useEffect(() => {
    onSelectLayer(selectedNodeId);
  }, [onSelectLayer, selectedNodeId]);

  // Sync externally-driven selection into the machine.
  useEffect(() => {
    if (!selectedLayerId) return;
    if (selectedNodeIdRef.current === selectedLayerId && !selectedEdgeIdRef.current) return;
    send({ type: 'SYNC_EXTERNAL_NODE', id: selectedLayerId });
  }, [selectedLayerId, send]);

  // Keep machine free of stale node/edge IDs when layers are added or removed.
  useEffect(() => {
    const validNodeIds = [
      ...doc.layers.map((layer) => layer.id),
      ...graph.mergeNodes.map((node) => node.id),
      ...(graph.colorNodes ?? []).map((node) => node.id),
      EXPORT_NODE_ID,
    ];
    const validEdgeIds = graph.edges.map((edge) => edge.id);
    send({ type: 'FILTER_INVALID_REFERENCES', validNodeIds, validEdgeIds });
  }, [doc.layers, graph.edges, graph.mergeNodes, graph.colorNodes, send]);

  const activeEditorNodeId = useMemo(() => {
    if (!expandedNodeId) return null;
    const exists =
      expandedNodeId === EXPORT_NODE_ID ||
      doc.layers.some((layer) => layer.id === expandedNodeId) ||
      graph.mergeNodes.some((node) => node.id === expandedNodeId) ||
      (graph.colorNodes ?? []).some((node) => node.id === expandedNodeId);
    return exists ? expandedNodeId : null;
  }, [doc.layers, graph.colorNodes, graph.mergeNodes, expandedNodeId]);

  const handleSelectNode = useCallback(
    (id: string, event?: React.MouseEvent) => {
      send({ type: 'NODE_SELECTED', id, additive: isAdditiveSelectionEvent(event) });
    },
    [send],
  );

  const handleToggleEditor = useCallback(
    (id: string) => {
      send({ type: 'NODE_EDITOR_TOGGLED', id });
    },
    [send],
  );

  const handleClosePanel = useCallback(() => {
    send({ type: 'PANE_CLICKED' });
  }, [send]);

  return {
    selectedNodeId,
    selectedNodeIdSet,
    selectedNodeIdRef,
    selectedEdgeIdRef,
    activeEditorNodeId,
    handleSelectNode,
    handleToggleEditor,
    handleClosePanel,
  };
}
