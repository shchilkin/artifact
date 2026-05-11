import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useMachine } from '@xstate/react';
import { createPortal } from 'react-dom';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge as RFEdge,
  type EdgeChange,
  type FinalConnectionState,
  type Node as RFNode,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './node-canvas.css';

import { NodeGalleryCanvas } from '../NodeGalleryCanvas';
import { defaultMediaViewState, type MediaViewState } from '../NodeGalleryViewState';
import { PrimitiveViewport3D } from '../PrimitiveViewport3D';
import { defaultPrimitiveViewportState, type PrimitiveRenderMode, type PrimitiveViewportState } from '../PrimitiveViewportState';
import type { CanvasDocument, GraphEdge, Layer } from '../../types/config';
import {
  EXPORT_NODE_ID,
  addGraphEdge,
  connectedPortIds,
  inferLinearGraph,
  organizeGraph,
  removeGraphEdge,
  splitEdgeWithNode,
  toRFEdges,
  updateGraphPositions,
  wouldCreateCycle,
} from '../../utils/nodeGraph';
import { buildRFNodes } from './buildRFNodes';
import { NODE_H, NODE_W, EDGE_INTERCEPT_THRESHOLD } from './constants';
import { NodeCanvasActionsContext, NodeCanvasPreviewContext } from './context';
import { cloneLayerSnapshot, distancePointToSegment, isAdditiveSelectionEvent, isGalleryEligibleLayer } from './helpers';
import { NodeContextMenu } from './menus/NodeContextMenu';
import { PaneContextMenu } from './menus/PaneContextMenu';
import { NodePropertiesPanel } from './panel/NodePropertiesPanel';
import {
  ColorNodeComponent,
  ExportNodeComponent,
  LayerNodeComponent,
  MergeNodeComponent,
} from './nodes/NodeTypes';
import { nodeCanvasMachine } from './machine';
import type { NodeCanvasActionsContextValue, NodeCanvasPreviewContextValue, NodeCanvasProps } from './types';

const nodeTypes = {
  layerNode: LayerNodeComponent,
  colorNode: ColorNodeComponent,
  mergeNode: MergeNodeComponent,
  exportNode: ExportNodeComponent,
};

const RF_PRO_OPTIONS = { hideAttribution: false };

export function NodeCanvas({
  doc,
  imageCache,
  initialPrimitiveViewStates,
  onPrimitiveViewStatesChange,
  selectedLayerId,
  onSelectLayer,
  onGraphChange,
  onUpdateLayer,
  onUpdateMergeNode,
  onUpdateColorNode,
  onUpdateExportConfig,
  onUpdateAspectRatio,
  exportBusy,
  onExport,
  onAddLayerAt,
  onDeleteNodes,
  onDuplicateLayer,
}: NodeCanvasProps) {
  const graph = useMemo(
    () => doc.graph ?? inferLinearGraph(doc.layers),
    [doc.graph, doc.layers],
  );

  const graphRef = useRef(graph);
  useLayoutEffect(() => { graphRef.current = graph; }, [graph]);

  const connected = useMemo(() => connectedPortIds(graph), [graph]);

  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const fittedRef = useRef(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const canvasSurfaceRef = useRef<HTMLDivElement>(null);
  const addNodeButtonRef = useRef<HTMLButtonElement>(null);
  const galleryModalRef = useRef<HTMLDivElement>(null);
  const galleryCloseButtonRef = useRef<HTMLButtonElement>(null);
  const galleryReturnFocusRef = useRef<HTMLElement | null>(null);
  const [primitiveViewStates, setPrimitiveViewStates] = useState<Record<string, PrimitiveViewportState>>(
    () => initialPrimitiveViewStates ?? {},
  );
  const primitiveRenderModes = useMemo<Record<string, PrimitiveRenderMode>>(() => ({}), []);
  const [mediaViewStates, setMediaViewStates] = useState<Record<string, MediaViewState>>({});
  const [activePrimitiveViewportId, setActivePrimitiveViewportId] = useState<string | null>(null);

  const [machineState, send] = useMachine(nodeCanvasMachine, {
    input: { selectedNodeIds: selectedLayerId ? [selectedLayerId] : [] },
  });
  const { selectedNodeIds, selectedEdgeId, expandedNodeId, contextMenu, galleryNodeId } = machineState.context;

  const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const handleSelectNode = useCallback((id: string, event?: React.MouseEvent) => {
    send({ type: 'NODE_SELECTED', id, additive: isAdditiveSelectionEvent(event) });
  }, [send]);
  const handleToggleEditor = useCallback((id: string) => {
    send({ type: 'NODE_EDITOR_TOGGLED', id });
  }, [send]);
  const handleClosePanel = useCallback(() => {
    send({ type: 'PANE_CLICKED' });
  }, [send]);
  const activeEditorNodeId = useMemo(() => {
    if (!expandedNodeId) return null;
    const exists = expandedNodeId === EXPORT_NODE_ID
      || doc.layers.some((layer) => layer.id === expandedNodeId)
      || graph.mergeNodes.some((node) => node.id === expandedNodeId)
      || (graph.colorNodes ?? []).some((node) => node.id === expandedNodeId);
    return exists ? expandedNodeId : null;
  }, [doc.layers, graph.colorNodes, graph.mergeNodes, expandedNodeId]);
  const selectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;

  const selectedNodeIdRef = useRef(selectedNodeId);
  const selectedEdgeIdRef = useRef(selectedEdgeId);
  useLayoutEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
    selectedEdgeIdRef.current = selectedEdgeId;
  }, [selectedNodeId, selectedEdgeId]);

  useEffect(() => {
    onSelectLayer(selectedNodeId);
  }, [onSelectLayer, selectedNodeId]);

  useEffect(() => {
    if (!selectedLayerId) return;
    if (selectedNodeIdRef.current === selectedLayerId && !selectedEdgeIdRef.current) return;
    send({ type: 'SYNC_EXTERNAL_NODE', id: selectedLayerId });
  }, [selectedLayerId, send]);

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

  const openGallery = useCallback((id: string) => {
    const layer = doc.layers.find((item) => item.id === id);
    if (!layer || !isGalleryEligibleLayer(layer)) return;
    send({ type: 'GALLERY_OPENED', nodeId: id });
  }, [doc.layers, send]);

  const updatePrimitiveView = useCallback((id: string, viewState: PrimitiveViewportState) => {
    setPrimitiveViewStates((current) => {
      const previous = current[id];
      if (
        previous
        && previous.rotationX === viewState.rotationX
        && previous.rotationY === viewState.rotationY
        && previous.zoom === viewState.zoom
        && previous.panX === viewState.panX
        && previous.panY === viewState.panY
      ) {
        return current;
      }
      return { ...current, [id]: viewState };
    });
  }, []);

  const setPrimitiveViewportActive = useCallback((id: string, active: boolean) => {
    setActivePrimitiveViewportId((current) => {
      if (active) {
        return current === id ? current : id;
      }
      return current === id ? null : current;
    });
  }, []);

  const primitiveViewportLockActive = activePrimitiveViewportId !== null
    && doc.layers.some((layer) => layer.id === activePrimitiveViewportId && layer.kind === 'primitive');

  useEffect(() => {
    onPrimitiveViewStatesChange?.(primitiveViewStates);
  }, [onPrimitiveViewStatesChange, primitiveViewStates]);

  const previewContextValue = useMemo<NodeCanvasPreviewContextValue>(() => ({
    doc,
    graph,
    imageCache,
    primitiveViewStates,
  }), [doc, graph, imageCache, primitiveViewStates]);

  const actionsContextValue = useMemo<NodeCanvasActionsContextValue>(() => ({
    selectNode: handleSelectNode,
    toggleNodeEditor: handleToggleEditor,
    updateLayer: onUpdateLayer,
    updateMergeNode: onUpdateMergeNode,
    updateColorNode: onUpdateColorNode,
    updateExportConfig: onUpdateExportConfig,
    updateAspectRatio: onUpdateAspectRatio,
    exportNode: onExport,
    deleteNode: (id: string) => onDeleteNodes([id]),
    openGallery,
    updatePrimitiveView,
    setPrimitiveViewportActive,
  }), [handleSelectNode, handleToggleEditor, onDeleteNodes, onExport, onUpdateAspectRatio, onUpdateColorNode, onUpdateExportConfig, onUpdateLayer, onUpdateMergeNode, openGallery, setPrimitiveViewportActive, updatePrimitiveView]);

  const baseNodes = useMemo(
    () => buildRFNodes(
      doc,
      graph,
      selectedNodeIdSet,
      activeEditorNodeId,
      connected,
      exportBusy,
      primitiveViewStates,
      primitiveRenderModes,
    ),
    [doc, graph, selectedNodeIdSet, activeEditorNodeId, connected, exportBusy, primitiveRenderModes, primitiveViewStates],
  );
  const baseEdges = useMemo(
    () => toRFEdges(graph).map((edge) => ({
      ...edge,
      selected: selectedEdgeId === edge.id,
      style: {
        ...edge.style,
        stroke: selectedEdgeId === edge.id ? 'var(--text)' : edge.style?.stroke,
        strokeWidth: selectedEdgeId === edge.id ? 2.5 : edge.style?.strokeWidth,
        opacity: selectedEdgeId === null || selectedEdgeId === edge.id ? 0.75 : 0.45,
      },
    })),
    [graph, selectedEdgeId],
  );

  const [dragNodes, setDragNodes] = useState<RFNode[]>(baseNodes);
  const [dragEdges, setDragEdges] = useState<RFEdge[]>(baseEdges);
  const isDraggingRef = useRef(false);
  const dragNodesRef = useRef<RFNode[]>(dragNodes);
  useLayoutEffect(() => { dragNodesRef.current = dragNodes; }, [dragNodes]);

  useEffect(() => {
    if (!isDraggingRef.current) {
      setDragNodes(baseNodes);
      setDragEdges(baseEdges);
    }
  }, [baseNodes, baseEdges]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const relevant = changes.filter((c) => c.type !== 'remove' && c.type !== 'select');
    if (relevant.length) setDragNodes((prev) => applyNodeChanges(relevant, prev));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setDragEdges((prev) => applyEdgeChanges(changes, prev));
  }, []);

  useEffect(() => {
    if (!fittedRef.current && dragNodes.length > 0 && rfInstanceRef.current) {
      fittedRef.current = true;
      setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.2, duration: 0 }), 0);
    }
  }, [dragNodes.length]);

  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => send({ type: 'CONTEXT_MENU_CLOSED' });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
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
  }, [contextMenu, send]);

  useEffect(() => {
    if (!galleryNodeId) return;
    galleryReturnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = requestAnimationFrame(() => {
      galleryCloseButtonRef.current?.focus();
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        send({ type: 'GALLERY_CLOSED' });
        return;
      }
      if (event.key !== 'Tab') return;
      const modal = galleryModalRef.current;
      if (!modal) return;
      const focusable = Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) {
        event.preventDefault();
        modal.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKey);
      galleryReturnFocusRef.current?.focus();
    };
  }, [galleryNodeId, send]);

  const isValidConnection = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;
      if (connection.source === EXPORT_NODE_ID) return false;
      return !wouldCreateCycle(graphRef.current, connection.source, connection.target);
    },
    [],
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
    [onGraphChange],
  );

  const onEdgesDelete = useCallback(
    (deleted: RFEdge[]) => {
      let g = graphRef.current;
      for (const e of deleted) g = removeGraphEdge(g, e.id);
      send({ type: 'EDGE_IDS_REMOVED', ids: deleted.map((edge) => edge.id) });
      onGraphChange(g);
    },
    [onGraphChange, send],
  );

  const commitNodePositions = useCallback((nodes: RFNode[]) => {
    const moved = nodes.map((node) => ({ id: node.id, position: node.position }));
    if (moved.length === 0) return;
    onGraphChange(updateGraphPositions(graphRef.current, moved));
  }, [onGraphChange]);

  const getInterceptInputPort = useCallback((nodeId: string): GraphEdge['toPort'] | null => {
    if (nodeId === EXPORT_NODE_ID) return null;
    if (graphRef.current.mergeNodes.some((mergeNode) => mergeNode.id === nodeId)) return 'a';
    if ((graphRef.current.colorNodes ?? []).some((colorNode) => colorNode.id === nodeId)) return 'in';
    const layer = doc.layers.find((item) => item.id === nodeId);
    if (!layer) return null;
    return layer.kind === 'effect' ? 'in' : 'bg';
  }, [doc.layers]);

  const findInterceptEdge = useCallback((node: RFNode) => {
    const nodeLookup = new Map(dragNodesRef.current.map((item) => [item.id, item]));
    const getCenter = (nodeId: string) => {
      const rfNode = nodeLookup.get(nodeId);
      const position = rfNode?.position ?? graphRef.current.positions[nodeId];
      if (!position) return null;
      const width = rfNode?.measured?.width ?? NODE_W;
      const height = rfNode?.measured?.height ?? NODE_H;
      return {
        x: position.x + width / 2,
        y: position.y + height / 2,
      };
    };

    const point = {
      x: node.position.x + (node.measured?.width ?? NODE_W) / 2,
      y: node.position.y + (node.measured?.height ?? NODE_H) / 2,
    };

    let best: { edge: GraphEdge; distance: number } | null = null;
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
  }, []);

  const onNodeDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const onNodeDragStop = useCallback(
    (_: unknown, node: RFNode) => {
      isDraggingRef.current = false;
      const movedGraph = updateGraphPositions(graphRef.current, [{ id: node.id, position: node.position }]);
      const interceptEdge = findInterceptEdge(node);
      const inputPort = getInterceptInputPort(node.id);

      if (
        interceptEdge
        && inputPort
        && !wouldCreateCycle(removeGraphEdge(movedGraph, interceptEdge.id), interceptEdge.fromId, node.id)
        && !wouldCreateCycle(removeGraphEdge(movedGraph, interceptEdge.id), node.id, interceptEdge.toId)
      ) {
        onGraphChange(splitEdgeWithNode(movedGraph, interceptEdge.id, node.id, inputPort));
        return;
      }

      commitNodePositions([node]);
    },
    [commitNodePositions, findInterceptEdge, getInterceptInputPort, onGraphChange],
  );

  const onSelectionDragStop = useCallback((_: React.MouseEvent, nodes: RFNode[]) => {
    isDraggingRef.current = false;
    commitNodePositions(nodes);
  }, [commitNodePositions]);

  const onPaneClick = useCallback(() => {
    send({ type: 'PANE_CLICKED' });
  }, [send]);
  const onRFInit = useCallback((instance: ReactFlowInstance) => { rfInstanceRef.current = instance; }, []);
  const onEdgeClick = useCallback((e: React.MouseEvent, edge: RFEdge) => {
    e.preventDefault();
    e.stopPropagation();
    send({ type: 'EDGE_SELECTED', id: edge.id });
  }, [send]);
  const onSelectionChange = useCallback(({ nodes, edges }: { nodes: RFNode[]; edges: RFEdge[] }) => {
    send({
      type: 'SELECTION_CHANGED',
      nodeIds: nodes.map((node) => node.id),
      edgeIds: edges.map((edge) => edge.id),
    });
  }, [send]);
  const handleOrganizeNodes = useCallback(() => {
    onGraphChange(organizeGraph(graphRef.current, doc.layers));
    requestAnimationFrame(() => {
      rfInstanceRef.current?.fitView({ padding: 0.2, duration: 220 });
    });
  }, [doc.layers, onGraphChange]);
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
  }, [send]);

  const onPaneContextMenu = useCallback((e: MouseEvent | React.MouseEvent) => {
    e.preventDefault();
    const flowPos = rfInstanceRef.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      ?? { x: 0, y: 0 };
    send({ type: 'CONTEXT_MENU_OPENED', menu: { type: 'pane-add', x: e.clientX, y: e.clientY, flowPos } });
  }, [send]);

  const onNodeContextMenu = useCallback((e: MouseEvent | React.MouseEvent, node: RFNode) => {
    e.preventDefault();
    e.stopPropagation();
    const isMerge = graph.mergeNodes.some((n) => n.id === node.id)
      || (graph.colorNodes ?? []).some((n) => n.id === node.id);
    const isExport = node.id === EXPORT_NODE_ID;
    send({ type: 'CONTEXT_MENU_OPENED', menu: { type: 'node', x: e.clientX, y: e.clientY, nodeId: node.id, isMerge, isExport } });
  }, [graph.colorNodes, graph.mergeNodes, send]);

  const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: RFEdge) => {
    e.preventDefault();
    e.stopPropagation();
    const flowPos = rfInstanceRef.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      ?? { x: 0, y: 0 };
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
          targetPort: (edge.targetHandle ?? 'in') as GraphEdge['toPort'],
          replaceEdgeId: edge.id,
        },
      },
    });
  }, [send]);

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
    if (!connectionState.fromNode || connectionState.toNode) return;
    const pointer = 'changedTouches' in event ? event.changedTouches[0] : event;
    if (!pointer) return;
    const flowPos = rfInstanceRef.current?.screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY })
      ?? { x: 0, y: 0 };
    send({
      type: 'CONTEXT_MENU_OPENED',
      menu: {
        type: 'pane-insert',
        x: pointer.clientX,
        y: pointer.clientY,
        flowPos,
        insertion: {
          sourceId: connectionState.fromNode.id,
        },
      },
    });
  }, [send]);

  const handleAddFromMenu = useCallback((action, flowPos: { x: number; y: number }, insertion?) => {
    requestAnimationFrame(() => {
      onAddLayerAt(action, flowPos, insertion);
    });
  }, [onAddLayerAt]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target;
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable)
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
  }, [selectedEdgeId, selectedNodeIds, onDeleteNodes, onGraphChange, send]);

  const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
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
  }, [onNodesChange, onDeleteNodes, send]);

  const galleryLayer = galleryNodeId
    ? doc.layers.find((layer) => layer.id === galleryNodeId && isGalleryEligibleLayer(layer)) ?? null
    : null;
  const galleryDisplayLayer = galleryLayer;
  const galleryDisplayDoc = useMemo(() => {
    if (!galleryDisplayLayer) return null;
    return {
      ...doc,
      graph,
      layers: doc.layers.map((layer) => layer.id === galleryDisplayLayer.id ? cloneLayerSnapshot(galleryDisplayLayer) : layer),
    } satisfies CanvasDocument;
  }, [doc, galleryDisplayLayer, graph]);
  const galleryPrimitiveViewState = galleryDisplayLayer?.kind === 'primitive'
    ? primitiveViewStates[galleryDisplayLayer.id] ?? defaultPrimitiveViewportState(galleryDisplayLayer)
    : null;
  const galleryMediaViewState = galleryDisplayLayer
    ? mediaViewStates[galleryDisplayLayer.id] ?? defaultMediaViewState()
    : defaultMediaViewState();
  const galleryTitleId = galleryDisplayLayer ? `node-gallery-title-${galleryDisplayLayer.id}` : undefined;
  const galleryDescriptionId = galleryDisplayLayer ? `node-gallery-description-${galleryDisplayLayer.id}` : undefined;

  const updateMediaView = useCallback((id: string, next: MediaViewState) => {
    setMediaViewStates((current) => ({ ...current, [id]: next }));
  }, []);

  const closeGallery = useCallback(() => {
    send({ type: 'GALLERY_CLOSED' });
  }, [send]);

  return (
    <NodeCanvasPreviewContext.Provider value={previewContextValue}>
      <NodeCanvasActionsContext.Provider value={actionsContextValue}>
        <div
          className="node-canvas-root relative flex h-full w-full bg-[var(--bg)]"
        >
          <div ref={canvasSurfaceRef} className="relative min-w-0 flex-1 overflow-hidden">
          <div className="node-canvas-toolbar">
            <button
              ref={addNodeButtonRef}
              type="button"
              onClick={openAddNodeMenu}
              aria-label="Add node"
            >
              <span aria-hidden="true">＋</span>
              Add node
            </button>
            <button type="button" onClick={handleOrganizeNodes} aria-label="Organize nodes">
              <span aria-hidden="true">⌘</span>
              Organize
            </button>
          </div>

          <ReactFlow
            nodes={dragNodes}
            edges={dragEdges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            onEdgesDelete={onEdgesDelete}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onSelectionDragStop={onSelectionDragStop}
            onSelectionChange={onSelectionChange}
            onPaneClick={onPaneClick}
            onPaneContextMenu={onPaneContextMenu}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeContextMenu={onEdgeContextMenu}
            onEdgeClick={onEdgeClick}
            isValidConnection={isValidConnection}
            onInit={onRFInit}
            nodeTypes={nodeTypes}
            colorMode="dark"
            elementsSelectable
            selectionKeyCode="Shift"
            selectionOnDrag={!primitiveViewportLockActive}
            selectionMode="partial"
            multiSelectionKeyCode={['Meta', 'Control']}
            minZoom={0.3}
            maxZoom={2}
            zoomOnScroll={!primitiveViewportLockActive}
            zoomOnPinch={!primitiveViewportLockActive}
            zoomOnDoubleClick={!primitiveViewportLockActive}
            panOnDrag={!primitiveViewportLockActive}
            deleteKeyCode={null}
            nodesFocusable={false}
            proOptions={RF_PRO_OPTIONS}
          >
            <Background variant={BackgroundVariant.Lines} gap={24} size={1} color="var(--node-grid)" />
            <Controls showInteractive={false} />
          </ReactFlow>
          </div>
          <NodePropertiesPanel
            open={selectedNodeId !== null}
            selectedNodeId={selectedNodeId}
            doc={doc}
            graph={graph}
            exportBusy={exportBusy}
            onUpdateLayer={onUpdateLayer}
            onUpdateMergeNode={onUpdateMergeNode}
            onUpdateColorNode={onUpdateColorNode}
            onUpdateExportConfig={onUpdateExportConfig}
            onUpdateAspectRatio={onUpdateAspectRatio}
            onExport={onExport}
            onClose={handleClosePanel}
          />

          {(contextMenu?.type === 'pane-add' || contextMenu?.type === 'pane-insert') && typeof document !== 'undefined' && createPortal(
            <PaneContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              onAdd={(action) => handleAddFromMenu(
                action,
                contextMenu.flowPos,
                contextMenu.type === 'pane-insert' ? contextMenu.insertion : undefined,
              )}
              onClose={() => send({ type: 'CONTEXT_MENU_CLOSED' })}
              menuRef={contextMenuRef}
            />,
            document.body,
          )}

          {contextMenu?.type === 'node' && typeof document !== 'undefined' && createPortal(
            <NodeContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              isMerge={contextMenu.isMerge}
              isExport={contextMenu.isExport}
              onDuplicate={() => onDuplicateLayer(contextMenu.nodeId)}
              onDelete={() => onDeleteNodes([contextMenu.nodeId])}
              onClose={() => send({ type: 'CONTEXT_MENU_CLOSED' })}
              menuRef={contextMenuRef}
            />,
            document.body,
          )}
          {galleryDisplayLayer && typeof document !== 'undefined' && createPortal(
            <div
              className="node-gallery-backdrop"
              onClick={closeGallery}
            >
              <div
                className="node-gallery-modal"
                ref={galleryModalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={galleryTitleId}
                aria-describedby={galleryDescriptionId}
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="node-gallery-close"
                  ref={galleryCloseButtonRef}
                  onClick={closeGallery}
                  aria-label="Close gallery"
                >
                  ×
                </button>
                <div className="node-gallery-header">
                  <div className="node-gallery-heading">
                    <span id={galleryTitleId} className="node-gallery-title">{galleryDisplayLayer.name}</span>
                    <span id={galleryDescriptionId} className="node-gallery-subtitle">
                      {galleryDisplayLayer.kind === 'primitive'
                        ? 'Interactive primitive viewport'
                        : `${galleryDisplayLayer.kind} preview`}
                    </span>
                  </div>
                </div>

                <div className="node-gallery-surface">
                  <div className="node-gallery-viewport">
                    {galleryDisplayLayer.kind === 'primitive' && galleryPrimitiveViewState ? (
                      <PrimitiveViewport3D
                        layer={galleryDisplayLayer}
                        mode="modal"
                        renderMode={primitiveRenderModes[galleryDisplayLayer.id] ?? 'shaded'}
                        viewState={galleryPrimitiveViewState}
                        onViewStateChange={(next) => updatePrimitiveView(galleryDisplayLayer.id, next)}
                        className="node-primitive-preview"
                      />
                    ) : galleryDisplayDoc ? (
                      <NodeGalleryCanvas
                        doc={galleryDisplayDoc}
                        graph={graph}
                        imageCache={imageCache}
                        previewTargetId={galleryDisplayLayer.id}
                        layer={galleryDisplayLayer}
                        viewState={galleryMediaViewState}
                        onViewStateChange={(next) => updateMediaView(galleryDisplayLayer.id, next)}
                        onLayerUpdate={(patch) => onUpdateLayer(galleryDisplayLayer.id, patch as Partial<Layer>)}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )}
        </div>
      </NodeCanvasActionsContext.Provider>
    </NodeCanvasPreviewContext.Provider>
  );
}
