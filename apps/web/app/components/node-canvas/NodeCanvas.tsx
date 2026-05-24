import { useMachine } from '@xstate/react';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type ReactFlowInstance,
  ViewportPortal,
} from '@xyflow/react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import '@xyflow/react/dist/style.css';
import './node-canvas.css';

import { useArtifactAuth } from '../../hooks/useArtifactAuth';
import type { Layer } from '../../types/config';
import { connectedPortIds, inferLinearGraph } from '../../utils/nodeGraph';
import { NodeGalleryCanvas } from '../NodeGalleryCanvas';
import { PrimitiveViewport3D } from '../PrimitiveViewport3D';
import { type PrimitiveRenderMode } from '../PrimitiveViewportState';
import { GraphAreaOverlay } from './areas/GraphAreaOverlay';
import { buildRFNodes } from './buildRFNodes';
import { NodeCanvasActionsContext, NodeCanvasPreviewContext } from './context';
import { NodePerformanceOverlay } from './debug/NodePerformanceOverlay';
import { useNodeAddLibraryDropHint } from './hooks/useNodeAddLibraryDropHint';
import { useNodeAreaActions } from './hooks/useNodeAreaActions';
import { useNodeContextMenus } from './hooks/useNodeContextMenus';
import { useNodeDragState } from './hooks/useNodeDragState';
import { useNodeGallery } from './hooks/useNodeGallery';
import { useNodeGraphEvents } from './hooks/useNodeGraphEvents';
import { useNodePerfDebug } from './hooks/useNodePerfDebug';
import { useNodeSelectionSync } from './hooks/useNodeSelectionSync';
import { usePrimitiveCameraState } from './hooks/usePrimitiveCameraState';
import { nodeCanvasMachine } from './machine';
import { NodeContextMenu } from './menus/NodeContextMenu';
import { PaneContextMenu } from './menus/PaneContextMenu';
import {
  ColorNodeComponent,
  ExportNodeComponent,
  LayerNodeComponent,
  MergeNodeComponent,
  RepeatNodeComponent,
} from './nodes/NodeTypes';
import { NodePropertiesPanel } from './panel/NodePropertiesPanel';
import { toRFEdges } from './reactFlowEdges';
import type { NodeCanvasActionsContextValue, NodeCanvasPreviewContextValue, NodeCanvasProps } from './types';

const nodeTypes = {
  layerNode: LayerNodeComponent,
  colorNode: ColorNodeComponent,
  mergeNode: MergeNodeComponent,
  repeatNode: RepeatNodeComponent,
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
  onUpdateRepeatNode,
  onUpdateExportConfig,
  onUpdateAspectRatio,
  exportBusy,
  onExport,
  onAddLayerAt,
  onDeleteNodes,
  onDuplicateLayer,
}: NodeCanvasProps) {
  const auth = useArtifactAuth();
  const graph = useMemo(() => doc.graph ?? inferLinearGraph(doc.layers), [doc.graph, doc.layers]);

  const graphRef = useRef(graph);
  useLayoutEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  const connected = useMemo(() => connectedPortIds(graph), [graph]);

  // Stable DOM refs shared across hooks.
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const fittedRef = useRef(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const canvasSurfaceRef = useRef<HTMLDivElement>(null);
  const addNodeButtonRef = useRef<HTMLButtonElement>(null);
  const galleryModalRef = useRef<HTMLDivElement>(null);
  const galleryCloseButtonRef = useRef<HTMLButtonElement>(null);
  const galleryReturnFocusRef = useRef<HTMLElement | null>(null);

  // XState machine — single source of UI state.
  const [machineState, send] = useMachine(nodeCanvasMachine, {
    input: { selectedNodeIds: selectedLayerId ? [selectedLayerId] : [] },
  });
  const { selectedNodeIds, selectedEdgeId, expandedNodeId, contextMenu, galleryNodeId } = machineState.context;
  const { perfDebugEnabled, handleTogglePerfDebug } = useNodePerfDebug();
  useNodeAddLibraryDropHint(canvasSurfaceRef);

  // Focused hooks.
  const { primitiveViewStates, primitiveViewportLockActive, updatePrimitiveView, setPrimitiveViewportActive } =
    usePrimitiveCameraState({
      initialPrimitiveViewStates,
      layers: doc.layers,
      onPrimitiveViewStatesChange,
    });

  const primitiveRenderModes = useMemo<Record<string, PrimitiveRenderMode>>(() => ({}), []);

  const {
    selectedNodeId,
    selectedNodeIdSet,
    activeEditorNodeId,
    handleSelectNode,
    handleToggleEditor,
    handleClosePanel,
  } = useNodeSelectionSync({
    send,
    selectedNodeIds,
    selectedEdgeId,
    expandedNodeId,
    selectedLayerId,
    onSelectLayer,
    doc,
    graph,
  });

  const {
    openGallery,
    closeGallery,
    updateMediaView,
    galleryDisplayLayer,
    galleryDisplayDoc,
    galleryPrimitiveViewState,
    galleryMediaViewState,
    galleryTitleId,
    galleryDescriptionId,
    galleryHint,
  } = useNodeGallery({
    send,
    doc,
    graph,
    primitiveViewStates,
    galleryNodeId,
    galleryModalRef,
    galleryCloseButtonRef,
    galleryReturnFocusRef,
  });

  const baseNodes = useMemo(
    () =>
      buildRFNodes(
        doc,
        graph,
        selectedNodeIdSet,
        activeEditorNodeId,
        connected,
        primitiveViewStates,
        primitiveRenderModes,
      ),
    [doc, graph, selectedNodeIdSet, activeEditorNodeId, connected, primitiveRenderModes, primitiveViewStates],
  );
  const baseEdges = useMemo(
    () =>
      toRFEdges(graph).map((edge) => ({
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

  const {
    dragNodes,
    dragEdges,
    isDraggingRef,
    onEdgesChange,
    onNodeDragStart,
    onNodeDragStop,
    onSelectionDragStop,
    onSelectionChange,
    handleNodesChange,
  } = useNodeDragState({
    baseNodes,
    baseEdges,
    graphRef,
    layers: doc.layers,
    send,
    onGraphChange,
    onDeleteNodes,
  });

  const { isValidConnection, onConnect, onEdgesDelete, onEdgeClick, handleOrganizeNodes } = useNodeGraphEvents({
    graphRef,
    aspect: doc.global.aspect,
    layers: doc.layers,
    send,
    rfInstanceRef,
    onGraphChange,
  });

  const { openAddNodeMenu, onPaneContextMenu, onNodeContextMenu, onEdgeContextMenu, onConnectEnd, handleAddFromMenu } =
    useNodeContextMenus({
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
    });

  const {
    selectedAreaId,
    areaByNodeId,
    areaActionTargetId,
    areaActionDisabled,
    clearSelectedArea,
    handleCreateAreaFromSelection,
    handleRemoveArea,
    handleRemoveNodeFromArea,
    handleSelectArea,
  } = useNodeAreaActions({
    graph,
    graphRef,
    selectedNodeIds,
    onGraphChange,
  });

  // Fit view on first render.
  useEffect(() => {
    if (!fittedRef.current && dragNodes.length > 0 && rfInstanceRef.current) {
      fittedRef.current = true;
      setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.2, duration: 0 }), 0);
    }
  }, [dragNodes.length]);

  const onPaneClick = useCallback(() => {
    clearSelectedArea();
    send({ type: 'PANE_CLICKED' });
  }, [clearSelectedArea, send]);
  const onRFInit = useCallback((instance: ReactFlowInstance) => {
    rfInstanceRef.current = instance;
  }, []);

  const handleToggleSelectedLayerVisibility = useCallback(() => {
    const selectedLayers = selectedNodeIds
      .map((id) => doc.layers.find((layer) => layer.id === id))
      .filter((layer): layer is Layer => Boolean(layer));
    if (selectedLayers.length === 0) return false;
    const nextVisible = !selectedLayers.some((layer) => layer.visible);
    selectedLayers.forEach((layer) => onUpdateLayer(layer.id, { visible: nextVisible }));
    return true;
  }, [doc.layers, onUpdateLayer, selectedNodeIds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'm' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableKeyTarget(event.target)) return;
      if (!handleToggleSelectedLayerVisibility()) return;
      event.preventDefault();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleSelectedLayerVisibility]);

  const previewContextValue = useMemo<NodeCanvasPreviewContextValue>(
    () => ({
      doc,
      graph,
      imageCache,
      primitiveViewStates,
      isGraphDraggingRef: isDraggingRef,
    }),
    [doc, graph, imageCache, primitiveViewStates, isDraggingRef],
  );

  const actionsContextValue = useMemo<NodeCanvasActionsContextValue>(
    () => ({
      selectNode: handleSelectNode,
      toggleNodeEditor: handleToggleEditor,
      updateLayer: onUpdateLayer,
      updateMergeNode: onUpdateMergeNode,
      updateColorNode: onUpdateColorNode,
      updateRepeatNode: onUpdateRepeatNode,
      updateExportConfig: onUpdateExportConfig,
      updateAspectRatio: onUpdateAspectRatio,
      exportNode: onExport,
      deleteNode: (id: string) => onDeleteNodes([id]),
      openGallery,
      updatePrimitiveView,
      setPrimitiveViewportActive,
    }),
    [
      handleSelectNode,
      handleToggleEditor,
      onDeleteNodes,
      onExport,
      onUpdateAspectRatio,
      onUpdateColorNode,
      onUpdateExportConfig,
      onUpdateLayer,
      onUpdateMergeNode,
      onUpdateRepeatNode,
      openGallery,
      setPrimitiveViewportActive,
      updatePrimitiveView,
    ],
  );

  return (
    <NodeCanvasPreviewContext.Provider value={previewContextValue}>
      <NodeCanvasActionsContext.Provider value={actionsContextValue}>
        <div className="node-canvas-root relative flex h-full w-full bg-[var(--bg)]">
          <div ref={canvasSurfaceRef} className="relative min-w-0 flex-1 overflow-hidden">
            <div className="node-canvas-toolbar">
              <button ref={addNodeButtonRef} type="button" onClick={openAddNodeMenu} aria-label="Add node">
                <span aria-hidden="true">＋</span>
                Add node
              </button>
              <button
                type="button"
                onClick={handleCreateAreaFromSelection}
                disabled={areaActionDisabled}
                aria-label={areaActionTargetId ? 'Add selected nodes to area' : 'Create area from selected nodes'}
                title={
                  areaActionDisabled
                    ? 'Select ungrouped nodes or an area with nodes to add'
                    : areaActionTargetId
                      ? 'Add to selected area'
                      : 'Create area'
                }
              >
                <span aria-hidden="true">▣</span>
                {areaActionTargetId ? 'Add to area' : 'Area'}
              </button>
              <button type="button" onClick={() => handleOrganizeNodes(doc.layers)} aria-label="Auto layout nodes">
                <span aria-hidden="true">⌘</span>
                Auto layout
              </button>
              <button
                type="button"
                onClick={handleTogglePerfDebug}
                aria-label={perfDebugEnabled ? 'Hide performance debug overlay' : 'Show performance debug overlay'}
                aria-pressed={perfDebugEnabled}
                title="Show FPS, thumbnail queue, and long-task metrics"
              >
                <span aria-hidden="true">▥</span>
                Perf
              </button>
              {auth.configured && (
                <button
                  type="button"
                  className="node-toolbar-account"
                  onClick={auth.signedIn ? () => void auth.signOut() : auth.openSignIn}
                  disabled={!auth.loaded}
                >
                  {auth.loaded ? (auth.signedIn ? 'Sign out' : 'Sign in') : 'Account'}
                </button>
              )}
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
              <Background variant={BackgroundVariant.Dots} gap={20} size={4} color="var(--node-grid)" />
              <ViewportPortal>
                <GraphAreaOverlay
                  graph={graph}
                  nodes={dragNodes}
                  selectedAreaId={selectedAreaId}
                  onSelectArea={handleSelectArea}
                  onRemoveArea={handleRemoveArea}
                />
              </ViewportPortal>
              <Controls showInteractive={false} />
            </ReactFlow>
            <NodePerformanceOverlay debugEnabled={perfDebugEnabled} nodeCount={dragNodes.length} />
            <div className="node-add-drop-hint node-add-drop-hint-idle" aria-hidden="true">
              Move over canvas
            </div>
            <div className="node-add-drop-hint node-add-drop-hint-ready" aria-hidden="true">
              Drop to place node
            </div>
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
            onUpdateRepeatNode={onUpdateRepeatNode}
            onUpdateExportConfig={onUpdateExportConfig}
            onUpdateAspectRatio={onUpdateAspectRatio}
            onExport={onExport}
            onClose={handleClosePanel}
          />

          {(contextMenu?.type === 'pane-add' || contextMenu?.type === 'pane-insert') &&
            typeof document !== 'undefined' &&
            createPortal(
              <PaneContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                mode={contextMenu.type === 'pane-insert' ? 'insert' : 'add'}
                onAdd={(action) =>
                  handleAddFromMenu(
                    action,
                    contextMenu.flowPos,
                    contextMenu.type === 'pane-insert' ? contextMenu.insertion : undefined,
                  )
                }
                onDragAdd={(action, point) => {
                  const surfaceRect = canvasSurfaceRef.current?.getBoundingClientRect();
                  if (
                    !surfaceRect ||
                    point.x < surfaceRect.left ||
                    point.x > surfaceRect.right ||
                    point.y < surfaceRect.top ||
                    point.y > surfaceRect.bottom
                  ) {
                    return false;
                  }
                  const flowPos = rfInstanceRef.current?.screenToFlowPosition(point) ?? contextMenu.flowPos;
                  handleAddFromMenu(
                    action,
                    flowPos,
                    contextMenu.type === 'pane-insert' ? contextMenu.insertion : undefined,
                  );
                  return true;
                }}
                onClose={() => send({ type: 'CONTEXT_MENU_CLOSED' })}
                menuRef={contextMenuRef}
              />,
              document.body,
            )}

          {contextMenu?.type === 'node' &&
            typeof document !== 'undefined' &&
            (() => {
              const menuLayer = doc.layers.find((layer) => layer.id === contextMenu.nodeId);
              const menuAreaId = areaByNodeId.get(contextMenu.nodeId);
              const menuArea = menuAreaId ? (graph.areas ?? []).find((area) => area.id === menuAreaId) : undefined;
              return createPortal(
                <NodeContextMenu
                  x={contextMenu.x}
                  y={contextMenu.y}
                  isMerge={contextMenu.isMerge}
                  isExport={contextMenu.isExport}
                  muted={menuLayer ? !menuLayer.visible : undefined}
                  removeFromArea={
                    menuArea ? { areaId: menuArea.id, nodeId: contextMenu.nodeId, areaName: menuArea.name } : undefined
                  }
                  onDuplicate={() => onDuplicateLayer(contextMenu.nodeId)}
                  onToggleMuted={
                    menuLayer ? () => onUpdateLayer(menuLayer.id, { visible: !menuLayer.visible }) : undefined
                  }
                  onRemoveFromArea={menuArea ? handleRemoveNodeFromArea : undefined}
                  onDelete={() => onDeleteNodes([contextMenu.nodeId])}
                  onClose={() => send({ type: 'CONTEXT_MENU_CLOSED' })}
                  menuRef={contextMenuRef}
                />,
                document.body,
              );
            })()}
          {galleryDisplayLayer &&
            typeof document !== 'undefined' &&
            createPortal(
              <div className="node-gallery-backdrop" onClick={closeGallery}>
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
                      <span id={galleryTitleId} className="node-gallery-title">
                        {galleryDisplayLayer.name}
                      </span>
                      <span id={galleryDescriptionId} className="node-gallery-subtitle">
                        {galleryDisplayLayer.kind === 'primitive'
                          ? 'Interactive primitive viewport'
                          : `${galleryDisplayLayer.kind} preview`}
                      </span>
                      <span className="node-gallery-hint">{galleryHint}</span>
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

function isEditableKeyTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
}
