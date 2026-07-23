import type {
  FinalConnectionState,
  OnConnectStartParams,
  ReactFlowInstance,
  Edge as RFEdge,
  Node as RFNode,
} from '@xyflow/react';
import { useCallback, useEffect, useRef } from 'react';
import type { CanvasGraph, GraphEdge } from '../../../types/config';
import type { AddAction } from '../../../utils/addActions';
import { EXPORT_NODE_ID, graphUtilityNodeKind, removeGraphEdge } from '../../../utils/nodeGraph';
import type { NodeCanvasMachineEvent } from '../machine';
import type { ContextMenuState, InsertConnectionConfig } from '../types';

export interface UseNodeContextMenusOptions {
  send: (event: NodeCanvasMachineEvent) => void;
  contextMenu: ContextMenuState;
  graph: CanvasGraph;
  rfInstanceRef: React.RefObject<ReactFlowInstance | null>;
  addNodeButtonRef: React.RefObject<HTMLButtonElement | null>;
  canvasSurfaceRef: React.RefObject<HTMLDivElement | null>;
  contextMenuRef: React.RefObject<HTMLDivElement | null>;
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
  closeContextMenu: () => void;
  onPaneContextMenu: (e: MouseEvent | React.MouseEvent) => void;
  onNodeContextMenu: (e: MouseEvent | React.MouseEvent, node: RFNode) => void;
  onEdgeContextMenu: (e: React.MouseEvent, edge: RFEdge) => void;
  onConnectStart: (event: MouseEvent | TouchEvent, params: OnConnectStartParams) => void;
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
  if (buttonRect)
    return {
      x: buttonRect.left + buttonRect.width / 2,
      y: buttonRect.bottom + 12,
    };
  if (surfaceRect) return { x: surfaceRect.left + 96, y: surfaceRect.top + 96 };
  return { x: 0, y: 0 };
}

function isGraphUtilityNode(graph: CanvasGraph, id: string) {
  return graphUtilityNodeKind(graph, id) !== null;
}

function connectEndPointer(event: MouseEvent | TouchEvent) {
  return 'changedTouches' in event ? event.changedTouches[0] : event;
}

function insertionFromConnection(
  fromNodeId: string,
  fromHandle: Pick<NonNullable<FinalConnectionState['fromHandle']>, 'id' | 'type'>,
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
  return {
    fromNodeId: connectionState.fromNode.id,
    fromHandle: connectionState.fromHandle,
  };
}

function pendingConnectStart(params: OnConnectStartParams) {
  if (!params.nodeId) return null;
  if (!params.handleType) return null;
  return {
    fromNodeId: params.nodeId,
    fromHandle: {
      id: params.handleId,
      type: params.handleType,
    },
  };
}

function openDeferredConnectAddMenu(
  send: (event: NodeCanvasMachineEvent) => void,
  menu: Extract<ContextMenuState, { type: 'pane-insert' }>,
  frameRef: React.MutableRefObject<number | null>,
) {
  cancelDeferredConnectAddMenu(frameRef);
  frameRef.current = window.requestAnimationFrame(() => {
    frameRef.current = null;
    send({ type: 'CONTEXT_MENU_OPENED', menu });
  });
}

function cancelDeferredConnectAddMenu(frameRef: React.MutableRefObject<number | null>) {
  if (frameRef.current === null) return;
  window.cancelAnimationFrame(frameRef.current);
  frameRef.current = null;
}

function targetInsideElement(target: EventTarget | null, element: HTMLElement | null) {
  return typeof Node !== 'undefined' && target instanceof Node && element?.contains(target) === true;
}

function connectEndAddMenu(
  event: MouseEvent | TouchEvent,
  connectionState: FinalConnectionState,
  pendingConnection: ReturnType<typeof pendingConnectStart>,
  screenToFlowPosition: ((point: { x: number; y: number }) => { x: number; y: number }) | undefined,
): Extract<ContextMenuState, { type: 'pane-insert' }> | null {
  const request = connectEndAddRequest(event, connectionState, pendingConnection);
  if (!request) return null;
  const { connection, pointer } = request;
  const flowPos = connectEndFlowPosition(pointer, screenToFlowPosition);
  return {
    type: 'pane-insert',
    x: pointer.clientX,
    y: pointer.clientY,
    flowPos,
    insertion: insertionFromConnection(connection.fromNodeId, connection.fromHandle),
  };
}

function connectEndAddRequest(
  event: MouseEvent | TouchEvent,
  connectionState: FinalConnectionState,
  pendingConnection: ReturnType<typeof pendingConnectStart>,
) {
  if (connectionState.isValid === true) return null;
  return connectEndRequest(pendingConnectEnd(connectionState) ?? pendingConnection, connectEndPointer(event));
}

function connectEndRequest(
  connection: ReturnType<typeof pendingConnectStart>,
  pointer: MouseEvent | Touch | undefined,
) {
  if (!connection) return null;
  if (!pointer) return null;
  return { connection, pointer };
}

function connectEndFlowPosition(
  pointer: MouseEvent | Touch,
  screenToFlowPosition: ((point: { x: number; y: number }) => { x: number; y: number }) | undefined,
) {
  if (!screenToFlowPosition) return { x: 0, y: 0 };
  return screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY });
}

/**
 * Owns all context-menu and keyboard-delete logic for the node canvas.
 * Handles pane, node, and edge context menus plus Delete/Backspace keyboard shortcut.
 */
export function useNodeContextMenus({
  send,
  contextMenu,
  rfInstanceRef,
  addNodeButtonRef,
  canvasSurfaceRef,
  contextMenuRef,
  selectedEdgeId,
  selectedNodeIds,
  graphRef,
  onDeleteNodes,
  canDeleteNode,
  onGraphChange,
  onAddLayerAt,
}: UseNodeContextMenusOptions): UseNodeContextMenusResult {
  const pendingConnectionStartRef = useRef<ReturnType<typeof pendingConnectStart>>(null);
  const deferredConnectMenuFrameRef = useRef<number | null>(null);
  const contextMenuReturnFocusRef = useRef<HTMLElement | null>(null);

  const closeContextMenu = useCallback(
    (restoreFocus = true) => {
      const returnFocusTarget = contextMenuReturnFocusRef.current;
      contextMenuReturnFocusRef.current = null;
      cancelDeferredConnectAddMenu(deferredConnectMenuFrameRef);
      pendingConnectionStartRef.current = null;
      send({ type: 'CONTEXT_MENU_CLOSED' });
      if (restoreFocus && returnFocusTarget) {
        window.requestAnimationFrame(() => returnFocusTarget.focus());
      }
    },
    [send],
  );

  useEffect(() => () => cancelDeferredConnectAddMenu(deferredConnectMenuFrameRef), []);

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

  useEffect(() => {
    if (!contextMenu) return;

    const isInsideMenu = (target: EventTarget | null) => targetInsideElement(target, contextMenuRef.current);

    const closeForOutsidePointer = (event: PointerEvent) => {
      if (isInsideMenu(event.target)) return;
      closeContextMenu(false);
    };

    const closeForOutsideContextMenu = (event: MouseEvent) => {
      if (isInsideMenu(event.target)) return;
      closeContextMenu(false);
    };

    const closeForEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isInsideMenu(event.target)) return;
      event.preventDefault();
      closeContextMenu();
    };

    document.addEventListener('pointerdown', closeForOutsidePointer, true);
    document.addEventListener('contextmenu', closeForOutsideContextMenu, true);
    document.addEventListener('keydown', closeForEscape);
    const closeForWindowBlur = () => closeContextMenu(false);
    window.addEventListener('blur', closeForWindowBlur);
    return () => {
      document.removeEventListener('pointerdown', closeForOutsidePointer, true);
      document.removeEventListener('contextmenu', closeForOutsideContextMenu, true);
      document.removeEventListener('keydown', closeForEscape);
      window.removeEventListener('blur', closeForWindowBlur);
    };
  }, [closeContextMenu, contextMenu, contextMenuRef]);

  const openAddNodeMenu = useCallback(() => {
    cancelDeferredConnectAddMenu(deferredConnectMenuFrameRef);
    const buttonRect = addNodeButtonRef.current?.getBoundingClientRect();
    const surfaceRect = canvasSurfaceRef.current?.getBoundingClientRect();
    const anchor = addNodeMenuAnchor(buttonRect, surfaceRect);
    const screenPoint = addNodeMenuScreenPoint(buttonRect, surfaceRect);
    const flowPos = rfInstanceRef.current?.screenToFlowPosition(screenPoint) ?? { x: 0, y: 0 };
    contextMenuReturnFocusRef.current = addNodeButtonRef.current;
    send({
      type: 'CONTEXT_MENU_OPENED',
      menu: { type: 'pane-add', x: anchor.x, y: anchor.y, flowPos },
    });
  }, [send, addNodeButtonRef, canvasSurfaceRef, rfInstanceRef]);

  const onPaneContextMenu = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      e.preventDefault();
      cancelDeferredConnectAddMenu(deferredConnectMenuFrameRef);
      contextMenuReturnFocusRef.current = canvasSurfaceRef.current;
      const flowPos = rfInstanceRef.current?.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      }) ?? { x: 0, y: 0 };
      send({
        type: 'CONTEXT_MENU_OPENED',
        menu: { type: 'pane-add', x: e.clientX, y: e.clientY, flowPos },
      });
    },
    [canvasSurfaceRef, send, rfInstanceRef],
  );

  const onNodeContextMenu = useCallback(
    (e: MouseEvent | React.MouseEvent, node: RFNode) => {
      e.preventDefault();
      e.stopPropagation();
      cancelDeferredConnectAddMenu(deferredConnectMenuFrameRef);
      contextMenuReturnFocusRef.current = canvasSurfaceRef.current;
      const isMerge = isGraphUtilityNode(graphRef.current, node.id);
      const isExport = node.id === EXPORT_NODE_ID;
      send({
        type: 'CONTEXT_MENU_OPENED',
        menu: {
          type: 'node',
          x: e.clientX,
          y: e.clientY,
          nodeId: node.id,
          isMerge,
          isExport,
        },
      });
    },
    [canvasSurfaceRef, graphRef, send],
  );

  const onEdgeContextMenu = useCallback(
    (e: React.MouseEvent, edge: RFEdge) => {
      e.preventDefault();
      e.stopPropagation();
      cancelDeferredConnectAddMenu(deferredConnectMenuFrameRef);
      contextMenuReturnFocusRef.current = canvasSurfaceRef.current;
      const flowPos = rfInstanceRef.current?.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      }) ?? { x: 0, y: 0 };
      send({
        type: 'CONTEXT_MENU_OPENED',
        menu: {
          type: 'edge',
          x: e.clientX,
          y: e.clientY,
          edgeId: edge.id,
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
    [canvasSurfaceRef, send, rfInstanceRef],
  );

  const onConnectStart = useCallback(
    (event: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
      event.stopPropagation();
      closeContextMenu();
      pendingConnectionStartRef.current = pendingConnectStart(params);
    },
    [closeContextMenu],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      event.preventDefault();
      event.stopPropagation();
      const menu = connectEndAddMenu(
        event,
        connectionState,
        pendingConnectionStartRef.current,
        (point) => rfInstanceRef.current?.screenToFlowPosition(point) ?? { x: 0, y: 0 },
      );
      pendingConnectionStartRef.current = null;
      if (menu) {
        contextMenuReturnFocusRef.current = canvasSurfaceRef.current;
        openDeferredConnectAddMenu(send, menu, deferredConnectMenuFrameRef);
      } else cancelDeferredConnectAddMenu(deferredConnectMenuFrameRef);
    },
    [canvasSurfaceRef, send, rfInstanceRef],
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
    closeContextMenu,
    onPaneContextMenu,
    onNodeContextMenu,
    onEdgeContextMenu,
    onConnectStart,
    onConnectEnd,
    handleAddFromMenu,
  };
}
