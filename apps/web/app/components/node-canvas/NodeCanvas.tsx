import { useMachine } from '@xstate/react';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type ReactFlowInstance,
  ViewportPortal,
} from '@xyflow/react';
import {
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import '@xyflow/react/dist/style.css';
import './node-canvas.css';

import { useArtifactAuth } from '../../hooks/useArtifactAuth';
import { useArtifactTheme } from '../../hooks/useArtifactTheme';
import type { CanvasDocument, CanvasGraph, Layer, PrimitiveLayer } from '../../types/config';
import { canDeleteNodeFromDocument } from '../../utils/editorGuardrails';
import { connectedPortIds, EXPORT_NODE_ID, inferLinearGraph, resolveOutputPath } from '../../utils/nodeGraph';
import { LazyModelViewport3D, LazyPrimitiveViewport3D } from '../LazyViewport3D';
import { NodeGalleryCanvas } from '../NodeGalleryCanvas';
import type { MediaViewState } from '../NodeGalleryViewState';
import { type PrimitiveRenderMode, type PrimitiveViewportState } from '../PrimitiveViewportState';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { GraphAreaOverlay } from './areas/GraphAreaOverlay';
import { buildRFNodes } from './buildRFNodes';
import { EDGE_INTERCEPT_THRESHOLD } from './constants';
import { NodeCanvasActionsContext, NodeCanvasPreviewContext, useNodeCanvasPreview } from './context';
import { NodePerformanceOverlay } from './debug/NodePerformanceOverlay';
import { resolveNearestEdgeInsertionTarget, resolveNodeInsertionTarget } from './graphInsertion';
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
import type { NodeAlignmentGuide } from './nodeAlignment';
import {
  ColorNodeComponent,
  EnvironmentNodeComponent,
  ExportNodeComponent,
  FallbackNodeComponent,
  GrimeShadowNodeComponent,
  LayerNodeComponent,
  MaskNodeComponent,
  MaterialNodeComponent,
  MergeNodeComponent,
  RepeatNodeComponent,
  Scene3DNodeComponent,
  TransformNodeComponent,
} from './nodes/NodeTypes';
import { NodePropertiesPanel } from './panel/NodePropertiesPanel';
import { toRFEdges } from './reactFlowEdges';
import { useGeneratedMaterialTextureCanvases } from './thumbnails/materialTextureCanvases';
import type {
  ContextMenuState,
  InsertConnectionConfig,
  NodeCanvasActionsContextValue,
  NodeCanvasPreviewContextValue,
  NodeCanvasProps,
} from './types';

const nodeTypes = {
  layerNode: LayerNodeComponent,
  colorNode: ColorNodeComponent,
  materialNode: MaterialNodeComponent,
  mergeNode: MergeNodeComponent,
  repeatNode: RepeatNodeComponent,
  maskNode: MaskNodeComponent,
  transformNode: TransformNodeComponent,
  grimeShadowNode: GrimeShadowNodeComponent,
  scene3dNode: Scene3DNodeComponent,
  environmentNode: EnvironmentNodeComponent,
  exportNode: ExportNodeComponent,
  fallbackNode: FallbackNodeComponent,
};

const RF_PRO_OPTIONS = { hideAttribution: false };
function hasFileTransfer(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes('Files');
}

function filesFromTransfer(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.files);
}

function nodeDropPosition(event: ReactDragEvent<HTMLDivElement>, instance: ReactFlowInstance | null) {
  const screenPoint = { x: event.clientX, y: event.clientY };
  return instance?.screenToFlowPosition(screenPoint) ?? screenPoint;
}

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
  onUpdateMaterialNode,
  onUpdateMaskNode,
  onUpdateTransformNode,
  onUpdateGrimeShadowNode,
  onUpdateScene3DNode,
  onUpdateEnvironmentNode,
  onUpdateExportConfig,
  onUpdateAspectRatio,
  exportBusy,
  onExport,
  onAddLayerAt,
  onImageFileDrop,
  onFilesDrop,
  onReplaceEnvironmentNodeFile,
  onDeleteNodes,
  onDuplicateLayer,
}: NodeCanvasProps) {
  const auth = useArtifactAuth();
  const { resolvedTheme } = useArtifactTheme();
  const graph = useMemo(() => doc.graph ?? inferLinearGraph(doc.layers), [doc.graph, doc.layers]);

  const graphRef = useRef(graph);
  useLayoutEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  const connected = useMemo(() => connectedPortIds(graph), [graph]);
  const outputPath = useMemo(() => resolveOutputPath(graph), [graph]);
  const canDeleteNode = useCallback((id: string) => canDeleteNodeFromDocument(doc, id), [doc]);
  const deleteUnlockedNodes = useCallback(
    (ids: string[]) => {
      const unlockedIds = ids.filter(canDeleteNode);
      if (unlockedIds.length === 0) return;
      onDeleteNodes(unlockedIds);
    },
    [canDeleteNode, onDeleteNodes],
  );

  // Stable DOM refs shared across hooks.
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const fittedRef = useRef(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const canvasSurfaceRef = useRef<HTMLDivElement>(null);
  const addNodeButtonRef = useRef<HTMLButtonElement>(null);
  const galleryReturnFocusRef = useRef<HTMLElement | null>(null);
  const [addLibraryHoverEdgeId, setAddLibraryHoverEdgeId] = useState<string | null>(null);

  // XState machine — single source of UI state.
  const [machineState, send] = useMachine(nodeCanvasMachine, {
    input: { selectedNodeIds: selectedLayerId ? [selectedLayerId] : [] },
  });
  const { selectedNodeIds, selectedEdgeId, expandedNodeId, contextMenu, galleryNodeId } = machineState.context;
  const { perfDebugEnabled, handleTogglePerfDebug } = useNodePerfDebug();

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
    galleryHint,
  } = useNodeGallery({
    send,
    doc,
    graph,
    primitiveViewStates,
    galleryNodeId,
    galleryReturnFocusRef,
  });

  const baseNodes = useMemo(
    () =>
      buildRFNodes(
        doc,
        graph,
        selectedNodeIdSet,
        activeEditorNodeId,
        outputPath.nodeIds,
        connected,
        primitiveViewStates,
        primitiveRenderModes,
      ),
    [
      doc,
      graph,
      selectedNodeIdSet,
      activeEditorNodeId,
      outputPath.nodeIds,
      connected,
      primitiveRenderModes,
      primitiveViewStates,
    ],
  );
  const baseEdges = useMemo(
    () => toRFEdges(graph).map((edge) => decorateRFEdge(edge, selectedEdgeId, outputPath.edgeIds)),
    [graph, outputPath.edgeIds, selectedEdgeId],
  );

  const {
    dragNodes,
    dragEdges,
    alignmentGuides,
    isDraggingRef,
    onEdgesChange,
    dragNodesRef,
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
    onDeleteNodes: deleteUnlockedNodes,
    canDeleteNode,
  });

  const resolveAddLibraryInsertionAtPoint = useCallback(
    (action: Parameters<NodeCanvasProps['onAddLayerAt']>[0], point: { x: number; y: number }) => {
      const flowPoint = rfInstanceRef.current?.screenToFlowPosition(point);
      if (!flowPoint) return null;
      const nodeTarget = resolveNodeInsertionTarget({
        action,
        graph: graphRef.current,
        layers: doc.layers,
        nodes: dragNodesRef.current,
        point: flowPoint,
      });
      if (nodeTarget) return nodeTarget;
      return resolveNearestEdgeInsertionTarget({
        action,
        graph: graphRef.current,
        nodes: dragNodesRef.current,
        point: flowPoint,
        threshold: EDGE_INTERCEPT_THRESHOLD,
      });
    },
    [doc.layers, dragNodesRef, graphRef, rfInstanceRef],
  );

  useNodeAddLibraryDropHint(canvasSurfaceRef, {
    resolveEdgeId: (action, point) => {
      const target = resolveAddLibraryInsertionAtPoint(action, point);
      return target && 'edge' in target ? target.edge.id : null;
    },
    onEdgeHoverChange: setAddLibraryHoverEdgeId,
  });

  const displayedDragEdges = useMemo(() => {
    if (!addLibraryHoverEdgeId) return dragEdges;
    return dragEdges.map((edge) =>
      edge.id === addLibraryHoverEdgeId
        ? { ...edge, className: `${edge.className ?? ''} node-edge-add-target`.trim() }
        : edge,
    );
  }, [addLibraryHoverEdgeId, dragEdges]);

  const { isValidConnection, onConnect, onEdgesDelete, onEdgeClick, handleOrganizeNodes } = useNodeGraphEvents({
    graphRef,
    aspect: doc.global.aspect,
    layers: doc.layers,
    send,
    rfInstanceRef,
    onGraphChange,
  });

  const {
    openAddNodeMenu,
    closeContextMenu,
    onPaneContextMenu,
    onNodeContextMenu,
    onEdgeContextMenu,
    onConnectStart,
    onConnectEnd,
    handleAddFromMenu,
  } = useNodeContextMenus({
    send,
    contextMenu,
    graph,
    rfInstanceRef,
    addNodeButtonRef,
    canvasSurfaceRef,
    contextMenuRef,
    selectedEdgeId,
    selectedNodeIds,
    graphRef,
    onDeleteNodes: deleteUnlockedNodes,
    canDeleteNode,
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
    closeContextMenu();
    send({ type: 'PANE_CLICKED' });
  }, [clearSelectedArea, closeContextMenu, send]);
  const onRFInit = useCallback((instance: ReactFlowInstance) => {
    rfInstanceRef.current = instance;
  }, []);
  const onNodeFileDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!(onFilesDrop || onImageFileDrop) || !hasFileTransfer(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'copy';
    },
    [onFilesDrop, onImageFileDrop],
  );
  const onNodeFileDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!(onFilesDrop || onImageFileDrop) || !hasFileTransfer(event.dataTransfer)) return;
      const files = filesFromTransfer(event.dataTransfer);
      if (files.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const position = nodeDropPosition(event, rfInstanceRef.current);
      if (onFilesDrop) onFilesDrop(files, position);
      else onImageFileDrop?.(files[0]!, position);
    },
    [onFilesDrop, onImageFileDrop, rfInstanceRef],
  );

  const handleJumpToOutput = useCallback(() => {
    void rfInstanceRef.current?.fitView({
      nodes: [{ id: EXPORT_NODE_ID }],
      padding: 0.42,
      maxZoom: 0.95,
      duration: 220,
    });
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
      if (shouldToggleSelectedLayerVisibility(event) && handleToggleSelectedLayerVisibility()) event.preventDefault();
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
      updateMaterialNode: onUpdateMaterialNode,
      updateMaskNode: onUpdateMaskNode,
      updateTransformNode: onUpdateTransformNode,
      updateGrimeShadowNode: onUpdateGrimeShadowNode,
      updateScene3DNode: onUpdateScene3DNode,
      updateEnvironmentNode: onUpdateEnvironmentNode,
      updateExportConfig: onUpdateExportConfig,
      updateAspectRatio: onUpdateAspectRatio,
      exportNode: onExport,
      deleteNode: (id: string) => deleteUnlockedNodes([id]),
      openGallery,
      updatePrimitiveView,
      setPrimitiveViewportActive,
    }),
    [
      handleSelectNode,
      handleToggleEditor,
      deleteUnlockedNodes,
      onExport,
      onUpdateAspectRatio,
      onUpdateColorNode,
      onUpdateExportConfig,
      onUpdateLayer,
      onUpdateMaterialNode,
      onUpdateMergeNode,
      onUpdateRepeatNode,
      onUpdateMaskNode,
      onUpdateTransformNode,
      onUpdateGrimeShadowNode,
      onUpdateScene3DNode,
      onUpdateEnvironmentNode,
      openGallery,
      setPrimitiveViewportActive,
      updatePrimitiveView,
    ],
  );

  return (
    <NodeCanvasPreviewContext.Provider value={previewContextValue}>
      <NodeCanvasActionsContext.Provider value={actionsContextValue}>
        <div className="node-canvas-root relative flex h-full w-full bg-[var(--bg)]">
          <div
            ref={canvasSurfaceRef}
            className="relative min-w-0 flex-1 overflow-hidden"
            onDragOver={onNodeFileDragOver}
            onDrop={onNodeFileDrop}
          >
            <NodeCanvasToolbar
              addNodeButtonRef={addNodeButtonRef}
              areaActionDisabled={areaActionDisabled}
              areaActionTargetId={areaActionTargetId}
              auth={auth}
              perfDebugEnabled={perfDebugEnabled}
              onAddNode={openAddNodeMenu}
              onCreateArea={handleCreateAreaFromSelection}
              onJumpToOutput={handleJumpToOutput}
              onOrganizeNodes={() => handleOrganizeNodes(doc.layers)}
              onTogglePerfDebug={handleTogglePerfDebug}
            />

            <ReactFlow
              nodes={dragNodes}
              edges={displayedDragEdges}
              onNodesChange={handleNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectStart={onConnectStart}
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
              colorMode={resolvedTheme}
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
                <NodeAlignmentGuideOverlay guides={alignmentGuides} />
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
            onUpdateMaterialNode={onUpdateMaterialNode}
            onUpdateMaskNode={onUpdateMaskNode}
            onUpdateTransformNode={onUpdateTransformNode}
            onUpdateGrimeShadowNode={onUpdateGrimeShadowNode}
            onUpdateScene3DNode={onUpdateScene3DNode}
            onUpdateEnvironmentNode={onUpdateEnvironmentNode}
            onReplaceEnvironmentNodeFile={onReplaceEnvironmentNodeFile}
            onUpdateExportConfig={onUpdateExportConfig}
            onUpdateAspectRatio={onUpdateAspectRatio}
            onExport={onExport}
            onClose={handleClosePanel}
          />

          <PaneContextMenuPortal
            contextMenu={contextMenu}
            canvasSurfaceRef={canvasSurfaceRef}
            contextMenuRef={contextMenuRef}
            rfInstanceRef={rfInstanceRef}
            onAddFromMenu={handleAddFromMenu}
            onClose={closeContextMenu}
            resolveInsertionAtPoint={resolveAddLibraryInsertionAtPoint}
          />

          <NodeContextMenuPortal
            contextMenu={contextMenu}
            areaByNodeId={areaByNodeId}
            contextMenuRef={contextMenuRef}
            graph={graph}
            layers={doc.layers}
            onClose={closeContextMenu}
            onDeleteNodes={deleteUnlockedNodes}
            onDuplicateLayer={onDuplicateLayer}
            onRemoveNodeFromArea={handleRemoveNodeFromArea}
            onUpdateLayer={onUpdateLayer}
          />
          <NodeGalleryDialog
            displayDoc={galleryDisplayDoc}
            displayLayer={galleryDisplayLayer}
            graph={graph}
            hint={galleryHint}
            imageCache={imageCache}
            mediaViewState={galleryMediaViewState}
            primitiveRenderModes={primitiveRenderModes}
            primitiveViewState={galleryPrimitiveViewState}
            returnFocusRef={galleryReturnFocusRef}
            onClose={closeGallery}
            onLayerUpdate={onUpdateLayer}
            onMediaViewChange={updateMediaView}
            onPrimitiveViewChange={updatePrimitiveView}
          />
        </div>
      </NodeCanvasActionsContext.Provider>
    </NodeCanvasPreviewContext.Provider>
  );
}

function NodeAlignmentGuideOverlay({ guides }: { guides: NodeAlignmentGuide[] }) {
  if (!guides.length) return null;
  return (
    <div className="node-alignment-guides" aria-hidden="true">
      {guides.map((guide, index) => {
        const length = Math.max(1, guide.to - guide.from);
        const style =
          guide.orientation === 'vertical'
            ? { left: guide.position - 0.5, top: guide.from, height: length }
            : { top: guide.position - 0.5, left: guide.from, width: length };
        return (
          <div
            key={`${guide.orientation}-${guide.position}-${index}`}
            className={`node-alignment-guide node-alignment-guide-${guide.orientation}`}
            style={style}
          />
        );
      })}
    </div>
  );
}

type PaneContextMenuState = Extract<ContextMenuState, { type: 'pane-add' | 'pane-insert' }>;
type AddLayerAction = Parameters<NodeCanvasProps['onAddLayerAt']>[0];
type AddLibraryInsertionTarget =
  | ReturnType<typeof resolveNearestEdgeInsertionTarget>
  | ReturnType<typeof resolveNodeInsertionTarget>;

function PaneContextMenuPortal({
  contextMenu,
  canvasSurfaceRef,
  contextMenuRef,
  rfInstanceRef,
  onAddFromMenu,
  onClose,
  resolveInsertionAtPoint,
}: {
  contextMenu: ContextMenuState;
  canvasSurfaceRef: RefObject<HTMLDivElement | null>;
  contextMenuRef: RefObject<HTMLDivElement | null>;
  rfInstanceRef: RefObject<ReactFlowInstance | null>;
  onAddFromMenu: NodeCanvasProps['onAddLayerAt'];
  onClose: () => void;
  resolveInsertionAtPoint: (
    action: AddLayerAction,
    point: { x: number; y: number },
  ) => AddLibraryInsertionTarget | null;
}) {
  if (!isPaneContextMenu(contextMenu) || typeof document === 'undefined') return null;
  return createPortal(
    <PaneContextMenu
      x={contextMenu.x}
      y={contextMenu.y}
      mode={contextMenu.type === 'pane-insert' ? 'insert' : 'add'}
      onAdd={(action) => onAddFromMenu(action, contextMenu.flowPos, paneMenuInsertion(contextMenu))}
      onDragAdd={(action, point) =>
        handlePaneMenuDragAdd({
          action,
          point,
          contextMenu,
          canvasSurfaceRef,
          rfInstanceRef,
          onAddFromMenu,
          resolveInsertionAtPoint,
        })
      }
      onClose={onClose}
      menuRef={contextMenuRef}
    />,
    document.body,
  );
}

function isPaneContextMenu(menu: ContextMenuState): menu is PaneContextMenuState {
  return menu?.type === 'pane-add' || menu?.type === 'pane-insert';
}

function paneMenuInsertion(menu: PaneContextMenuState): InsertConnectionConfig | undefined {
  return menu.type === 'pane-insert' ? menu.insertion : undefined;
}

function handlePaneMenuDragAdd({
  action,
  point,
  contextMenu,
  canvasSurfaceRef,
  rfInstanceRef,
  onAddFromMenu,
  resolveInsertionAtPoint,
}: {
  action: AddLayerAction;
  point: { x: number; y: number };
  contextMenu: PaneContextMenuState;
  canvasSurfaceRef: RefObject<HTMLDivElement | null>;
  rfInstanceRef: RefObject<ReactFlowInstance | null>;
  onAddFromMenu: NodeCanvasProps['onAddLayerAt'];
  resolveInsertionAtPoint: (
    action: AddLayerAction,
    point: { x: number; y: number },
  ) => AddLibraryInsertionTarget | null;
}) {
  const surfaceRect = canvasSurfaceRef.current?.getBoundingClientRect();
  if (!pointInsideRect(point, surfaceRect)) return false;
  onAddFromMenu(
    action,
    paneDragFlowPosition(point, contextMenu.flowPos, rfInstanceRef.current),
    paneDragInsertion(action, point, contextMenu, resolveInsertionAtPoint),
  );
  return true;
}

function paneDragFlowPosition(
  point: { x: number; y: number },
  fallback: { x: number; y: number },
  rfInstance: ReactFlowInstance | null,
) {
  if (!rfInstance) return fallback;
  return rfInstance.screenToFlowPosition(point);
}

function paneDragInsertion(
  action: AddLayerAction,
  point: { x: number; y: number },
  contextMenu: PaneContextMenuState,
  resolveInsertionAtPoint: (
    action: AddLayerAction,
    point: { x: number; y: number },
  ) => AddLibraryInsertionTarget | null,
) {
  const target = resolveInsertionAtPoint(action, point);
  return target?.insertion ?? paneMenuInsertion(contextMenu);
}

function pointInsideRect(point: { x: number; y: number }, rect: DOMRect | undefined) {
  if (!rect) return false;
  return pointInsideHorizontalBounds(point.x, rect) && pointInsideVerticalBounds(point.y, rect);
}

function pointInsideHorizontalBounds(x: number, rect: DOMRect) {
  return x >= rect.left && x <= rect.right;
}

function pointInsideVerticalBounds(y: number, rect: DOMRect) {
  return y >= rect.top && y <= rect.bottom;
}

type NodeContextMenuCommonProps = {
  areaByNodeId: Map<string, string>;
  contextMenuRef: RefObject<HTMLDivElement | null>;
  graph: CanvasGraph;
  layers: Layer[];
  onClose: () => void;
  onDeleteNodes: (ids: string[]) => void;
  onDuplicateLayer: NodeCanvasProps['onDuplicateLayer'];
  onRemoveNodeFromArea: (areaId: string, nodeId: string) => void;
  onUpdateLayer: NodeCanvasProps['onUpdateLayer'];
};

function NodeContextMenuPortal({
  contextMenu,
  areaByNodeId,
  contextMenuRef,
  graph,
  layers,
  onClose,
  onDeleteNodes,
  onDuplicateLayer,
  onRemoveNodeFromArea,
  onUpdateLayer,
}: NodeContextMenuCommonProps & {
  contextMenu: ContextMenuState;
}) {
  if (contextMenu?.type !== 'node' || typeof document === 'undefined') return null;
  return createPortal(
    <NodeContextMenu
      {...nodeContextMenuProps({
        contextMenu,
        areaByNodeId,
        contextMenuRef,
        graph,
        layers,
        onClose,
        onDeleteNodes,
        onDuplicateLayer,
        onRemoveNodeFromArea,
        onUpdateLayer,
      })}
    />,
    document.body,
  );
}

function nodeMenuArea(nodeId: string, areaByNodeId: Map<string, string>, graph: CanvasGraph) {
  const menuAreaId = areaByNodeId.get(nodeId);
  return menuAreaId ? (graph.areas ?? []).find((area) => area.id === menuAreaId) : undefined;
}

function nodeContextMenuProps({
  contextMenu,
  areaByNodeId,
  contextMenuRef,
  graph,
  layers,
  onClose,
  onDeleteNodes,
  onDuplicateLayer,
  onRemoveNodeFromArea,
  onUpdateLayer,
}: NodeContextMenuCommonProps & {
  contextMenu: Extract<ContextMenuState, { type: 'node' }>;
}) {
  const menuLayer = layers.find((layer) => layer.id === contextMenu.nodeId);
  const menuArea = nodeMenuArea(contextMenu.nodeId, areaByNodeId, graph);
  return {
    x: contextMenu.x,
    y: contextMenu.y,
    isMerge: contextMenu.isMerge,
    isExport: contextMenu.isExport,
    muted: nodeMenuMuted(menuLayer),
    removeFromArea: nodeMenuAreaRemoval(menuArea, contextMenu.nodeId),
    onDuplicate: () => onDuplicateLayer(contextMenu.nodeId),
    onToggleMuted: nodeMenuMuteHandler(menuLayer, onUpdateLayer),
    onRemoveFromArea: menuArea ? onRemoveNodeFromArea : undefined,
    onDelete: () => onDeleteNodes([contextMenu.nodeId]),
    deleteDisabled: menuLayer?.locked,
    onClose,
    menuRef: contextMenuRef,
  };
}

function nodeMenuMuted(layer: Layer | undefined) {
  return layer ? !layer.visible : undefined;
}

function nodeMenuAreaRemoval(area: NonNullable<CanvasGraph['areas']>[number] | undefined, nodeId: string) {
  return area ? { areaId: area.id, nodeId, areaName: area.name } : undefined;
}

function nodeMenuMuteHandler(layer: Layer | undefined, onUpdateLayer: NodeCanvasProps['onUpdateLayer']) {
  return layer ? () => onUpdateLayer(layer.id, { visible: !layer.visible }) : undefined;
}

function NodeGalleryDialog({
  displayDoc,
  displayLayer,
  graph,
  hint,
  imageCache,
  mediaViewState,
  primitiveRenderModes,
  primitiveViewState,
  returnFocusRef,
  onClose,
  onLayerUpdate,
  onMediaViewChange,
  onPrimitiveViewChange,
}: {
  displayDoc: CanvasDocument | null;
  displayLayer: Layer | null;
  graph: CanvasGraph;
  hint: string;
  imageCache: Map<string, HTMLImageElement>;
  mediaViewState: MediaViewState;
  primitiveRenderModes: Record<string, PrimitiveRenderMode>;
  primitiveViewState: PrimitiveViewportState | null;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onLayerUpdate: NodeCanvasProps['onUpdateLayer'];
  onMediaViewChange: (id: string, next: MediaViewState) => void;
  onPrimitiveViewChange: (id: string, next: PrimitiveViewportState) => void;
}) {
  if (!displayLayer || typeof document === 'undefined') return null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="node-gallery-modal"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <DialogClose className="node-gallery-close" aria-label="Close gallery">
          x
        </DialogClose>
        <NodeGalleryHeader displayLayer={displayLayer} hint={hint} />
        <div className="node-gallery-surface">
          <div className="node-gallery-viewport">
            <NodeGalleryViewport
              displayDoc={displayDoc}
              displayLayer={displayLayer}
              graph={graph}
              imageCache={imageCache}
              mediaViewState={mediaViewState}
              primitiveRenderModes={primitiveRenderModes}
              primitiveViewState={primitiveViewState}
              onLayerUpdate={onLayerUpdate}
              onMediaViewChange={onMediaViewChange}
              onPrimitiveViewChange={onPrimitiveViewChange}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NodeGalleryHeader({ displayLayer, hint }: { displayLayer: Layer; hint: string }) {
  return (
    <div className="node-gallery-header">
      <div className="node-gallery-heading">
        <DialogTitle className="node-gallery-title">{displayLayer.name}</DialogTitle>
        <DialogDescription className="node-gallery-subtitle">{gallerySubtitle(displayLayer)}</DialogDescription>
        <span className="node-gallery-hint">{hint}</span>
      </div>
    </div>
  );
}

function gallerySubtitle(layer: Layer) {
  if (layer.kind === 'primitive') return 'Interactive primitive viewport';
  if (layer.kind === 'model') return 'Model asset preview';
  return `${layer.kind} preview`;
}

function NodeGalleryViewport({
  displayDoc,
  displayLayer,
  graph,
  imageCache,
  mediaViewState,
  primitiveRenderModes,
  primitiveViewState,
  onLayerUpdate,
  onMediaViewChange,
  onPrimitiveViewChange,
}: {
  displayDoc: CanvasDocument | null;
  displayLayer: Layer;
  graph: CanvasGraph;
  imageCache: Map<string, HTMLImageElement>;
  mediaViewState: MediaViewState;
  primitiveRenderModes: Record<string, PrimitiveRenderMode>;
  primitiveViewState: PrimitiveViewportState | null;
  onLayerUpdate: NodeCanvasProps['onUpdateLayer'];
  onMediaViewChange: (id: string, next: MediaViewState) => void;
  onPrimitiveViewChange: (id: string, next: PrimitiveViewportState) => void;
}) {
  if (displayLayer.kind === 'primitive') {
    return (
      <PrimitiveGalleryViewport
        displayLayer={displayLayer}
        graph={graph}
        primitiveRenderModes={primitiveRenderModes}
        primitiveViewState={primitiveViewState}
        onPrimitiveViewChange={onPrimitiveViewChange}
      />
    );
  }
  if (displayLayer.kind === 'model') {
    return <ModelGalleryViewport displayLayer={displayLayer} primitiveViewState={primitiveViewState} />;
  }
  return (
    <CanvasGalleryViewport
      displayDoc={displayDoc}
      displayLayer={displayLayer}
      graph={graph}
      imageCache={imageCache}
      mediaViewState={mediaViewState}
      onLayerUpdate={onLayerUpdate}
      onMediaViewChange={onMediaViewChange}
    />
  );
}

function PrimitiveGalleryViewport({
  displayLayer,
  graph,
  primitiveRenderModes,
  primitiveViewState,
  onPrimitiveViewChange,
}: {
  displayLayer: Extract<Layer, { kind: 'primitive' }>;
  graph: CanvasGraph;
  primitiveRenderModes: Record<string, PrimitiveRenderMode>;
  primitiveViewState: PrimitiveViewportState | null;
  onPrimitiveViewChange: (id: string, next: PrimitiveViewportState) => void;
}) {
  const { doc, imageCache, primitiveViewStates } = useNodeCanvasPreview();
  const materialId = graph.edges.find((edge) => edge.toId === displayLayer.id && edge.toPort === 'material')?.fromId;
  const materialConfig = materialId ? graph.materialNodes?.find((node) => node.id === materialId) : undefined;
  const materialTextures = useGeneratedMaterialTextureCanvases({
    materialNode: materialConfig ?? null,
    doc,
    graph,
    imageCache,
    primitiveViewStates,
  });
  if (!primitiveViewState) return null;
  return (
    <LazyPrimitiveViewport3D
      layer={displayLayer as PrimitiveLayer}
      materialConfig={materialConfig}
      materialTextures={materialTextures}
      mode="modal"
      renderMode={primitiveRenderModes[displayLayer.id] ?? 'shaded'}
      viewState={primitiveViewState}
      onViewStateChange={(next) => onPrimitiveViewChange(displayLayer.id, next)}
      className="node-primitive-preview"
    />
  );
}

function ModelGalleryViewport({
  displayLayer,
  primitiveViewState,
}: {
  displayLayer: Extract<Layer, { kind: 'model' }>;
  primitiveViewState: PrimitiveViewportState | null;
}) {
  const viewState = primitiveViewState ?? defaultPrimitiveViewportState(displayLayer);
  return (
    <LazyModelViewport3D
      layer={displayLayer}
      viewState={viewState}
      interactive={false}
      autoRotatePreview
      onViewStateChange={() => undefined}
      className="node-primitive-preview"
    />
  );
}

function CanvasGalleryViewport({
  displayDoc,
  displayLayer,
  graph,
  imageCache,
  mediaViewState,
  onLayerUpdate,
  onMediaViewChange,
}: {
  displayDoc: CanvasDocument | null;
  displayLayer: Layer;
  graph: CanvasGraph;
  imageCache: Map<string, HTMLImageElement>;
  mediaViewState: MediaViewState;
  onLayerUpdate: NodeCanvasProps['onUpdateLayer'];
  onMediaViewChange: (id: string, next: MediaViewState) => void;
}) {
  if (!displayDoc) return null;
  return (
    <NodeGalleryCanvas
      doc={displayDoc}
      graph={graph}
      imageCache={imageCache}
      previewTargetId={displayLayer.id}
      layer={displayLayer}
      viewState={mediaViewState}
      onViewStateChange={(next) => onMediaViewChange(displayLayer.id, next)}
      onLayerUpdate={(patch) => onLayerUpdate(displayLayer.id, patch as Partial<Layer>)}
    />
  );
}

function NodeCanvasToolbar({
  addNodeButtonRef,
  areaActionDisabled,
  areaActionTargetId,
  auth,
  perfDebugEnabled,
  onAddNode,
  onCreateArea,
  onJumpToOutput,
  onOrganizeNodes,
  onTogglePerfDebug,
}: {
  addNodeButtonRef: RefObject<HTMLButtonElement | null>;
  areaActionDisabled: boolean;
  areaActionTargetId: string | null;
  auth: ReturnType<typeof useArtifactAuth>;
  perfDebugEnabled: boolean;
  onAddNode: () => void;
  onCreateArea: () => void;
  onJumpToOutput: () => void;
  onOrganizeNodes: () => void;
  onTogglePerfDebug: () => void;
}) {
  return (
    <div className="node-canvas-toolbar" role="toolbar" aria-label="Node editor actions">
      <div className="node-toolbar-group node-toolbar-group-build" aria-label="Build actions">
        <span className="node-toolbar-group-label" aria-hidden="true">
          Build
        </span>
        <button ref={addNodeButtonRef} type="button" onClick={onAddNode} aria-label="Add node" title="Add node">
          <span aria-hidden="true">＋</span>
          Add node
        </button>
        <button type="button" onClick={onOrganizeNodes} aria-label="Auto layout nodes" title="Auto layout nodes">
          <span aria-hidden="true">⌘</span>
          Layout
        </button>
        {!areaActionDisabled ? (
          <AreaToolbarButton
            areaActionDisabled={areaActionDisabled}
            areaActionTargetId={areaActionTargetId}
            onCreateArea={onCreateArea}
          />
        ) : null}
      </div>
      <div className="node-toolbar-group" aria-label="View actions">
        <span className="node-toolbar-group-label" aria-hidden="true">
          View
        </span>
        <button type="button" onClick={onJumpToOutput} aria-label="Jump to output node" title="Jump to output node">
          <span aria-hidden="true">◎</span>
          Output
        </button>
      </div>
      <div className="node-toolbar-group node-toolbar-group-debug" aria-label="Debug actions">
        <span className="node-toolbar-group-label" aria-hidden="true">
          Debug
        </span>
        <button
          type="button"
          onClick={onTogglePerfDebug}
          aria-label={perfDebugEnabled ? 'Hide performance debug overlay' : 'Show performance debug overlay'}
          aria-pressed={perfDebugEnabled}
          title="Show FPS, thumbnail queue, and long-task metrics"
        >
          <span aria-hidden="true">▥</span>
          Metrics
        </button>
        <NodeToolbarAccountButton auth={auth} />
      </div>
    </div>
  );
}

function AreaToolbarButton({
  areaActionDisabled,
  areaActionTargetId,
  onCreateArea,
}: {
  areaActionDisabled: boolean;
  areaActionTargetId: string | null;
  onCreateArea: () => void;
}) {
  const copy = areaToolbarButtonCopy(areaActionDisabled, areaActionTargetId);
  return (
    <button
      type="button"
      onClick={onCreateArea}
      disabled={areaActionDisabled}
      aria-label={copy.ariaLabel}
      title={copy.title}
    >
      <span aria-hidden="true">▣</span>
      {copy.label}
    </button>
  );
}

function areaToolbarButtonCopy(disabled: boolean, targetId: string | null) {
  const copy = targetId ? AREA_TOOLBAR_TARGET_COPY : AREA_TOOLBAR_CREATE_COPY;
  return {
    ...copy,
    title: disabled ? 'Select ungrouped nodes or an area with nodes to add' : copy.title,
  };
}

const AREA_TOOLBAR_CREATE_COPY = {
  ariaLabel: 'Create area from selected nodes',
  title: 'Create area',
  label: 'Create area',
};
const AREA_TOOLBAR_TARGET_COPY = {
  ariaLabel: 'Add selected nodes to area',
  title: 'Add to selected area',
  label: 'Add to area',
};

function NodeToolbarAccountButton({ auth }: { auth: ReturnType<typeof useArtifactAuth> }) {
  if (!auth.configured) return null;
  const copy = accountButtonCopy(auth);
  return (
    <button type="button" className="node-toolbar-account" onClick={copy.onClick} disabled={!auth.loaded}>
      {copy.label}
    </button>
  );
}

function accountButtonCopy(auth: ReturnType<typeof useArtifactAuth>) {
  if (!auth.loaded) return { label: 'Account', onClick: auth.openSignIn };
  return auth.signedIn
    ? { label: 'Sign out', onClick: () => void auth.signOut() }
    : { label: 'Sign in', onClick: auth.openSignIn };
}

function decorateRFEdge(
  edge: ReturnType<typeof toRFEdges>[number],
  selectedEdgeId: string | null,
  outputEdgeIds: Set<string>,
) {
  const selected = selectedEdgeId === edge.id;
  const onOutputPath = outputEdgeIds.has(edge.id);
  return {
    ...edge,
    className: edgeClassName(edge.className, { selected, onOutputPath }),
    style: {
      ...edge.style,
      '--node-edge-selection-color': edgeSelectionColor(edge.style?.stroke, onOutputPath),
      stroke: edgeStroke(edge.style?.stroke, onOutputPath),
      strokeWidth: edgeStrokeWidth(edge.style?.strokeWidth, selected, onOutputPath),
      opacity: edgeOpacity(selectedEdgeId, selected, onOutputPath),
    } as CSSProperties,
  };
}

function edgeClassName(baseClassName: string | undefined, flags: { selected: boolean; onOutputPath: boolean }) {
  return [baseClassName, flags.onOutputPath && 'node-edge-output-path', flags.selected && 'node-edge-selected']
    .filter(Boolean)
    .join(' ');
}

function edgeSelectionColor(defaultStroke: unknown, onOutputPath: boolean) {
  if (onOutputPath) return 'var(--node-edge-output)';
  return typeof defaultStroke === 'string' ? defaultStroke : 'var(--node-edge-idle)';
}

function edgeStroke(defaultStroke: unknown, onOutputPath: boolean) {
  if (onOutputPath) return 'var(--node-edge-output)';
  return defaultStroke;
}

function edgeStrokeWidth(defaultWidth: unknown, selected: boolean, onOutputPath: boolean) {
  if (selected) return 3.25;
  if (onOutputPath) return 2.35;
  return defaultWidth;
}

function edgeOpacity(selectedEdgeId: string | null, selected: boolean, onOutputPath: boolean) {
  if (selected) return 1;
  return edgeOpacityByState(selectedEdgeId === null, onOutputPath);
}

function edgeOpacityByState(visibleOutputPath: boolean, onOutputPath: boolean) {
  if (visibleOutputPath) return onOutputPath ? 0.82 : 0.36;
  return onOutputPath ? 0.5 : 0.2;
}

const EDITABLE_KEY_TARGETS = new Set(['input', 'textarea', 'select']);

function shouldToggleSelectedLayerVisibility(event: KeyboardEvent) {
  return [
    event.key.toLowerCase() === 'm',
    event.metaKey === false,
    event.ctrlKey === false,
    event.altKey === false,
    isEditableKeyTarget(event.target) === false,
  ].every(Boolean);
}

function isEditableKeyTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return EDITABLE_KEY_TARGETS.has(tagName) || target.isContentEditable;
}
