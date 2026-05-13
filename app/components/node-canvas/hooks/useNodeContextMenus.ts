import type { FinalConnectionState, ReactFlowInstance, Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import { useCallback, useEffect } from 'react';
import type { CanvasGraph, GraphEdge } from '../../../types/config';
import { EXPORT_NODE_ID, removeGraphEdge } from '../../../utils/nodeGraph';
import type { NodeCanvasMachineEvent } from '../machine';
import type { AddAction, ContextMenuState, InsertConnectionConfig } from '../types';

export interface UseNodeContextMenusOptions {
  send: (event: NodeCanvasMachineEvent) => void;
  graph: CanvasGraph;
  rfInstanceRef: React.RefObject<ReactFlowInstance | null>;
  addNodeButtonRef: React.RefObject<HTMLButtonElement | null>;
  canvasSurfaceRef: React.RefObject<HTMLDivElement | null>;
  contextMenuRef: React.RefObject<HTMLDivElement | null>;
  /** Current context menu state from machine context. */
  contextMenu: ContextMenuState | null;
  selectedEdgeId: string | null;
  selectedNodeIds: string[];
  graphRef: React.RefObject<CanvasGraph>;
  onDeleteNodes: (ids: string[]) => void;
  onGraphChange: (graph: CanvasGraph) => void;
  onAddLayerAt: (action: AddAction, pos: { x: number; y: number }, insertion?: InsertConnectionConfig) => void;
}

export interface UseNodeContextMenusResult {
  openAddNodeMenu: () => void;
  onPaneContextMenu: (e: MouseEvent | React.MouseEvent) => void;
  onNodeContextMenu: (e: MouseEvent | React.MouseEvent, node: RFNode) => void;
  onEdgeContextMenu: (e: React.MouseEvent, edge: RFEdge) => void;
  onConnectEnd: (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => void;
  handleAddFromMenu: (action: AddAction, flowPos: { x: number; y: number }, insertion?: InsertConnectionConfig) => void;
}

/**
 * Owns all context-menu and keyboard-delete logic for the node canvas.
 * Handles pane, node, and edge context menus plus Delete/Backspace keyboard shortcut.
 */
export function useNodeContextMenus({
  send,
  graph,
  rfInstanceRef,
  addNodeButtonRef,
  canvasSurfaceRef,
  contextMenuRef,
  contextMenu,
  selectedEdgeId,
  selectedNodeIds,
  graphRef,
  onDeleteNodes,
  onGraphChange,
  onAddLayerAt,
}: UseNodeContextMenusOptions): UseNodeContextMenusResult {
  // Dismiss context menu on outside click or Escape.
  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => send({ type: 'CONTEXT_MENU_CLOSED' });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target;
      if (target instanceof Node && contextMenuRef.current?.contains(target)) return;
      dismiss();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [contextMenu, send, contextMenuRef]);

  // Delete/Backspace shortcut for selected nodes and edges.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (selectedEdgeId) {
        e.preventDefault();
        onGraphChange(removeGraphEdge(graphRef.current, selectedEdgeId));
        send({ type: 'EDGE_IDS_REMOVED', ids: [selectedEdgeId] });
        return;
      }
      const deletableNodeIds = selectedNodeIds.filter((id) => id !== EXPORT_NODE_ID);
      if (deletableNodeIds.length === 0) return;
      e.preventDefault();
      onDeleteNodes(deletableNodeIds);
      send({ type: 'NODE_IDS_REMOVED', ids: deletableNodeIds });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedEdgeId, selectedNodeIds, onDeleteNodes, onGraphChange, graphRef, send]);

  const openAddNodeMenu = useCallback(() => {
    const buttonRect = addNodeButtonRef.current?.getBoundingClientRect();
    const surfaceRect = canvasSurfaceRef.current?.getBoundingClientRect();
    const anchorX = buttonRect?.left ?? surfaceRect?.left ?? 0;
    const anchorY = (buttonRect?.bottom ?? surfaceRect?.top ?? 0) + 8;
    const screenPoint = surfaceRect
      ? {
          x: surfaceRect.left + surfaceRect.width / 2,
          y: surfaceRect.top + surfaceRect.height / 2,
        }
      : {
          x: (buttonRect?.left ?? 0) + (buttonRect?.width ?? 0) / 2,
          y: (buttonRect?.bottom ?? 0) + 16,
        };
    const flowPos = rfInstanceRef.current?.screenToFlowPosition(screenPoint) ?? { x: 0, y: 0 };
    send({ type: 'CONTEXT_MENU_OPENED', menu: { type: 'pane-add', x: anchorX, y: anchorY, flowPos } });
  }, [send, addNodeButtonRef, canvasSurfaceRef, rfInstanceRef]);

  const onPaneContextMenu = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      e.preventDefault();
      const flowPos = rfInstanceRef.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY }) ?? { x: 0, y: 0 };
      send({ type: 'CONTEXT_MENU_OPENED', menu: { type: 'pane-add', x: e.clientX, y: e.clientY, flowPos } });
    },
    [send, rfInstanceRef],
  );

  const onNodeContextMenu = useCallback(
    (e: MouseEvent | React.MouseEvent, node: RFNode) => {
      e.preventDefault();
      e.stopPropagation();
      const isMerge =
        graph.mergeNodes.some((n) => n.id === node.id) || (graph.colorNodes ?? []).some((n) => n.id === node.id);
      const isExport = node.id === EXPORT_NODE_ID;
      send({
        type: 'CONTEXT_MENU_OPENED',
        menu: { type: 'node', x: e.clientX, y: e.clientY, nodeId: node.id, isMerge, isExport },
      });
    },
    [graph.colorNodes, graph.mergeNodes, send],
  );

  const onEdgeContextMenu = useCallback(
    (e: React.MouseEvent, edge: RFEdge) => {
      e.preventDefault();
      e.stopPropagation();
      const flowPos = rfInstanceRef.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY }) ?? { x: 0, y: 0 };
      send({
        type: 'CONTEXT_MENU_OPENED',
        menu: {
          type: 'pane-insert',
          x: e.clientX,
          y: e.clientY,
          flowPos,
          insertion: {
            sourceId: edge.source,
            targetId: edge.target,
            targetPort: (edge.targetHandle ?? 'in') as import('../../../types/config').GraphEdge['toPort'],
            replaceEdgeId: edge.id,
          },
        },
      });
    },
    [send, rfInstanceRef],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      if (!connectionState.fromNode || !connectionState.fromHandle) return;
      if (connectionState.toHandle) return;
      const pointer = 'changedTouches' in event ? event.changedTouches[0] : event;
      if (!pointer) return;
      const fromHandle = connectionState.fromHandle;
      const flowPos = rfInstanceRef.current?.screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY }) ?? {
        x: 0,
        y: 0,
      };
      const insertion =
        fromHandle.type === 'target'
          ? {
              targetId: connectionState.fromNode.id,
              targetPort: (fromHandle.id ?? 'in') as GraphEdge['toPort'],
            }
          : {
              sourceId: connectionState.fromNode.id,
            };
      send({
        type: 'CONTEXT_MENU_OPENED',
        menu: {
          type: 'pane-insert',
          x: pointer.clientX,
          y: pointer.clientY,
          flowPos,
          insertion,
        },
      });
    },
    [send, rfInstanceRef],
  );

  const handleAddFromMenu = useCallback(
    (action: AddAction, flowPos: { x: number; y: number }, insertion?: InsertConnectionConfig) => {
      requestAnimationFrame(() => {
        onAddLayerAt(action, flowPos, insertion);
      });
    },
    [onAddLayerAt],
  );

  return {
    openAddNodeMenu,
    onPaneContextMenu,
    onNodeContextMenu,
    onEdgeContextMenu,
    onConnectEnd,
    handleAddFromMenu,
  };
}
