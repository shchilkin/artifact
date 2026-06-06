import type { FinalConnectionState, ReactFlowInstance, Edge as RFEdge, Node as RFNode } from '@xyflow/react';
import { useCallback, useEffect } from 'react';
import type { CanvasGraph, GraphEdge } from '../../../types/config';
import type { AddAction } from '../../../utils/addActions';
import { EXPORT_NODE_ID, removeGraphEdge } from '../../../utils/nodeGraph';
import type { NodeCanvasMachineEvent } from '../machine';
import type { InsertConnectionConfig } from '../types';

export interface UseNodeContextMenusOptions {
  send: (event: NodeCanvasMachineEvent) => void;
  graph: CanvasGraph;
  rfInstanceRef: React.RefObject<ReactFlowInstance | null>;
  addNodeButtonRef: React.RefObject<HTMLButtonElement | null>;
  canvasSurfaceRef: React.RefObject<HTMLDivElement | null>;
  selectedEdgeId: string | null;
  selectedNodeIds: string[];
  graphRef: React.RefObject<CanvasGraph>;
  onDeleteNodes: (ids: string[]) => void;
  canDeleteNode?: (id: string) => boolean;
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

const EDITABLE_KEYBOARD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return EDITABLE_KEYBOARD_TAGS.has(target.tagName) || target.isContentEditable;
}

function getDeletableNodeIds(ids: string[], canDeleteNode: ((id: string) => boolean) | undefined) {
  return ids.filter((id) => id !== EXPORT_NODE_ID && (canDeleteNode?.(id) ?? true));
}

function isDeleteShortcutKey(key: string) {
  return key === 'Delete' || key === 'Backspace';
}

function addNodeMenuAnchor(buttonRect: DOMRect | undefined, surfaceRect: DOMRect | undefined) {
  if (buttonRect) return { x: buttonRect.left, y: buttonRect.bottom + 8 };
  if (surfaceRect) return { x: surfaceRect.left, y: surfaceRect.top + 8 };
  return { x: 0, y: 8 };
}

function addNodeMenuScreenPoint(buttonRect: DOMRect | undefined, surfaceRect: DOMRect | undefined) {
  if (buttonRect) return { x: buttonRect.left + buttonRect.width / 2, y: buttonRect.bottom + 12 };
  if (surfaceRect) return { x: surfaceRect.left + 96, y: surfaceRect.top + 96 };
  return { x: 0, y: 0 };
}

function isGraphUtilityNode(graph: CanvasGraph, id: string) {
  const utilityNodes = [...graph.mergeNodes, ...(graph.colorNodes ?? []), ...(graph.repeatNodes ?? [])];
  return utilityNodes.some((node) => node.id === id);
}

function connectEndPointer(event: MouseEvent | TouchEvent) {
  return 'changedTouches' in event ? event.changedTouches[0] : event;
}

function insertionFromConnection(
  fromNodeId: string,
  fromHandle: NonNullable<FinalConnectionState['fromHandle']>,
): InsertConnectionConfig {
  if (fromHandle.type === 'target') {
    return {
      targetId: fromNodeId,
      targetPort: (fromHandle.id ?? 'in') as GraphEdge['toPort'],
    };
  }
  return { sourceId: fromNodeId };
}

function deleteSelectedEdge(
  edgeId: string | null,
  graph: CanvasGraph,
  onGraphChange: (graph: CanvasGraph) => void,
  send: (event: NodeCanvasMachineEvent) => void,
) {
  if (!edgeId) return false;
  onGraphChange(removeGraphEdge(graph, edgeId));
  send({ type: 'EDGE_IDS_REMOVED', ids: [edgeId] });
  return true;
}

function deleteSelectedNodes(
  selectedNodeIds: string[],
  canDeleteNode: ((id: string) => boolean) | undefined,
  onDeleteNodes: (ids: string[]) => void,
  send: (event: NodeCanvasMachineEvent) => void,
) {
  const deletableNodeIds = getDeletableNodeIds(selectedNodeIds, canDeleteNode);
  if (deletableNodeIds.length === 0) return false;
  onDeleteNodes(deletableNodeIds);
  send({ type: 'NODE_IDS_REMOVED', ids: deletableNodeIds });
  return true;
}

function deleteSelectedCanvasItems({
  selectedEdgeId,
  selectedNodeIds,
  graph,
  onGraphChange,
  onDeleteNodes,
  canDeleteNode,
  send,
}: {
  selectedEdgeId: string | null;
  selectedNodeIds: string[];
  graph: CanvasGraph;
  onGraphChange: (graph: CanvasGraph) => void;
  onDeleteNodes: (ids: string[]) => void;
  canDeleteNode: ((id: string) => boolean) | undefined;
  send: (event: NodeCanvasMachineEvent) => void;
}) {
  return (
    deleteSelectedEdge(selectedEdgeId, graph, onGraphChange, send) ||
    deleteSelectedNodes(selectedNodeIds, canDeleteNode, onDeleteNodes, send)
  );
}

function handleDeleteShortcut(
  event: KeyboardEvent,
  options: {
    selectedEdgeId: string | null;
    selectedNodeIds: string[];
    graph: CanvasGraph;
    onGraphChange: (graph: CanvasGraph) => void;
    onDeleteNodes: (ids: string[]) => void;
    canDeleteNode: ((id: string) => boolean) | undefined;
    send: (event: NodeCanvasMachineEvent) => void;
  },
) {
  if (!isDeleteShortcutKey(event.key)) return;
  if (isEditableKeyboardTarget(event.target)) return;
  if (deleteSelectedCanvasItems(options)) event.preventDefault();
}

function pendingConnectEnd(connectionState: FinalConnectionState) {
  if (!connectionState.fromNode) return null;
  if (!connectionState.fromHandle) return null;
  if (connectionState.toHandle) return null;
  return {
    fromNodeId: connectionState.fromNode.id,
    fromHandle: connectionState.fromHandle,
  };
}

/**
 * Owns all context-menu and keyboard-delete logic for the node canvas.
 * Handles pane, node, and edge context menus plus Delete/Backspace keyboard shortcut.
 */
export function useNodeContextMenus({
  send,
  rfInstanceRef,
  addNodeButtonRef,
  canvasSurfaceRef,
  selectedEdgeId,
  selectedNodeIds,
  graphRef,
  onDeleteNodes,
  canDeleteNode,
  onGraphChange,
  onAddLayerAt,
}: UseNodeContextMenusOptions): UseNodeContextMenusResult {
  // Delete/Backspace shortcut for selected nodes and edges.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      handleDeleteShortcut(e, {
        selectedEdgeId,
        selectedNodeIds,
        graph: graphRef.current,
        onGraphChange,
        onDeleteNodes,
        canDeleteNode,
        send,
      });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedEdgeId, selectedNodeIds, onDeleteNodes, canDeleteNode, onGraphChange, graphRef, send]);

  const openAddNodeMenu = useCallback(() => {
    const buttonRect = addNodeButtonRef.current?.getBoundingClientRect();
    const surfaceRect = canvasSurfaceRef.current?.getBoundingClientRect();
    const anchor = addNodeMenuAnchor(buttonRect, surfaceRect);
    const screenPoint = addNodeMenuScreenPoint(buttonRect, surfaceRect);
    const flowPos = rfInstanceRef.current?.screenToFlowPosition(screenPoint) ?? { x: 0, y: 0 };
    send({ type: 'CONTEXT_MENU_OPENED', menu: { type: 'pane-add', x: anchor.x, y: anchor.y, flowPos } });
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
      const isMerge = isGraphUtilityNode(graphRef.current, node.id);
      const isExport = node.id === EXPORT_NODE_ID;
      send({
        type: 'CONTEXT_MENU_OPENED',
        menu: { type: 'node', x: e.clientX, y: e.clientY, nodeId: node.id, isMerge, isExport },
      });
    },
    [graphRef, send],
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
      const pendingConnection = pendingConnectEnd(connectionState);
      if (!pendingConnection) return;
      const pointer = connectEndPointer(event);
      if (!pointer) return;
      const flowPos = rfInstanceRef.current?.screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY }) ?? {
        x: 0,
        y: 0,
      };
      const insertion = insertionFromConnection(pendingConnection.fromNodeId, pendingConnection.fromHandle);
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
