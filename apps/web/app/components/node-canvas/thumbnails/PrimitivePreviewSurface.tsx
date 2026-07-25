import { useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_MATERIAL_CONFIG,
  type GraphMaterialNode,
  type GraphShaderNode,
  type MaterialConfig,
  type PrimitiveLayer,
} from '../../../types/config';
import { Viewport3DControlStrip } from '../../canvas-chrome/Viewport3DChrome';
import { LazyPrimitiveViewport3D } from '../../LazyViewport3D';
import {
  defaultPrimitiveViewportState,
  type PrimitiveRenderMode,
  type PrimitiveViewportState,
} from '../../PrimitiveViewportState';
import { useNodeCanvasActions, useNodeCanvasPreview } from '../context';
import { stopNodeEvent } from '../helpers';
import { EmptyThumbnailFrame } from './LiveMediaOverlay';
import { useGeneratedMaterialTextureCanvases } from './materialTextureCanvases';
import { NodeThumbnail } from './NodeThumbnail';

interface PrimitivePreviewSurfaceProps {
  layer: PrimitiveLayer;
  selected: boolean;
  primitiveViewState?: PrimitiveViewportState;
  primitiveRenderMode?: PrimitiveRenderMode;
}

export function PrimitivePreviewSurface({
  layer,
  selected,
  primitiveViewState,
  primitiveRenderMode,
}: PrimitivePreviewSurfaceProps) {
  return selected ? (
    <SelectedPrimitivePreviewSurface
      layer={layer}
      primitiveViewState={primitiveViewState}
      primitiveRenderMode={primitiveRenderMode}
    />
  ) : (
    <PrimitiveThumbnailPreviewSurface layerId={layer.id} />
  );
}

function SelectedPrimitivePreviewSurface({
  layer,
  primitiveViewState,
  primitiveRenderMode,
}: Omit<PrimitivePreviewSurfaceProps, 'selected'>) {
  const { doc, graph, imageCache, primitiveViewStates } = useNodeCanvasPreview();
  const { openGallery, updatePrimitiveView, setPrimitiveViewportActive } = useNodeCanvasActions();
  const [draftViewState, setDraftViewState] = useState<{
    baseKey: string;
    value: PrimitiveViewportState;
  } | null>(null);
  const committedViewState = useMemo(
    () => primitiveViewState ?? defaultPrimitiveViewportState(layer),
    [layer, primitiveViewState],
  );
  const committedViewStateKey = primitiveViewStateKey(committedViewState);
  const effectiveViewState = activePrimitiveViewState(draftViewState, committedViewStateKey, committedViewState);
  const effectiveRenderMode = primitiveRenderModeOrDefault(primitiveRenderMode);
  const primitiveLocked = !!effectiveViewState.locked;
  const primitiveBgPreviewTargetId = useMemo(
    () => primitiveBackgroundPreviewTargetId(graph.edges, layer.id),
    [graph.edges, layer.id],
  );
  const materialSource = useMemo(() => primitiveMaterialSource(graph, layer.id), [graph, layer.id]);
  const materialTextures = useGeneratedMaterialTextureCanvases({
    materialNode: materialSource.materialNode,
    directTextureSourceId: materialSource.shaderNode?.id ?? null,
    doc,
    graph,
    imageCache,
    primitiveViewStates,
  });

  useEffect(() => {
    return () => setPrimitiveViewportActive(layer.id, false);
  }, [layer.id, setPrimitiveViewportActive]);

  const setPrimitiveLocked = (locked: boolean) => {
    const next = { ...effectiveViewState, locked };
    setDraftViewState(null);
    updatePrimitiveView(layer.id, next, 'snapshot');
    setPrimitiveViewportActive(layer.id, !locked);
  };

  const resetPrimitiveCamera = () => {
    setDraftViewState(null);
    updatePrimitiveView(
      layer.id,
      {
        ...defaultPrimitiveViewportState(layer),
        locked: primitiveLocked,
      },
      'snapshot',
    );
  };

  return (
    <SelectedPrimitiveSurface
      layer={layer}
      bgPreviewTargetId={primitiveBgPreviewTargetId}
      materialConfig={materialSource.config}
      materialTextures={materialTextures}
      renderMode={effectiveRenderMode}
      viewState={effectiveViewState}
      locked={primitiveLocked}
      committedViewStateKey={committedViewStateKey}
      onDraftViewState={setDraftViewState}
      onOpenGallery={openGallery}
      onResetCamera={resetPrimitiveCamera}
      onToggleLocked={setPrimitiveLocked}
      onUpdatePrimitiveView={updatePrimitiveView}
      onViewportActive={setPrimitiveViewportActive}
    />
  );
}

function PrimitiveThumbnailPreviewSurface({ layerId }: { layerId: string }) {
  const { openGallery } = useNodeCanvasActions();
  const [hovered, setHovered] = useState(false);
  return (
    <PrimitiveThumbnailSurface
      layerId={layerId}
      hovered={hovered}
      onHoverChange={setHovered}
      onOpenGallery={openGallery}
    />
  );
}

function activePrimitiveViewState(
  draft: { baseKey: string; value: PrimitiveViewportState } | null,
  committedKey: string,
  committed: PrimitiveViewportState,
) {
  if (!draft) return committed;
  return draft.baseKey === committedKey ? draft.value : committed;
}

function primitiveRenderModeOrDefault(renderMode: PrimitiveRenderMode | undefined) {
  return renderMode ?? 'shaded';
}

function primitiveBackgroundPreviewTargetId(
  edges: { toId: string; toPort: string; fromId: string }[],
  layerId: string,
) {
  return edges.find((edge) => edge.toId === layerId && edge.toPort === 'bg')?.fromId ?? null;
}

function primitiveMaterialSource(
  graph: {
    edges: { toId: string; toPort: string; fromId: string }[];
    materialNodes?: GraphMaterialNode[];
    shaderNodes?: GraphShaderNode[];
  },
  layerId: string,
) {
  const materialId = graph.edges.find((edge) => edge.toId === layerId && edge.toPort === 'material')?.fromId;
  const materialNode = materialId ? (graph.materialNodes ?? []).find((node) => node.id === materialId) : undefined;
  const shaderNode = materialId ? (graph.shaderNodes ?? []).find((node) => node.id === materialId) : undefined;
  return {
    materialNode: materialNode ?? null,
    shaderNode: shaderNode ?? null,
    config: materialNode ?? (shaderNode ? shaderMaterialConfig(shaderNode.id) : undefined),
  };
}

function shaderMaterialConfig(shaderId: string): MaterialConfig {
  return {
    ...DEFAULT_MATERIAL_CONFIG,
    materialPreset: 'matte',
    materialBaseColor: '#ffffff',
    materialAccentColor: '#ffffff',
    materialRoughness: 0.32,
    materialGrain: 0,
    materialRelief: 0,
    materialAlbedoName: shaderId,
  };
}

function PrimitiveThumbnailSurface({
  layerId,
  hovered,
  onHoverChange,
  onOpenGallery,
}: {
  layerId: string;
  hovered: boolean;
  onHoverChange: (hovered: boolean) => void;
  onOpenGallery: (targetId: string) => void;
}) {
  return (
    <div
      className="node-preview-surface nodrag nopan"
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      <NodeThumbnail previewTargetId={layerId} />
      <button
        type="button"
        className={`node-preview-open${hovered ? ' node-preview-open-visible' : ''}`}
        onClick={(event) => {
          stopNodeEvent(event);
          onOpenGallery(layerId);
        }}
        aria-label="Open preview"
      >
        View
      </button>
    </div>
  );
}

function SelectedPrimitiveSurface({
  layer,
  bgPreviewTargetId,
  materialConfig,
  materialTextures,
  renderMode,
  viewState,
  locked,
  committedViewStateKey,
  onDraftViewState,
  onOpenGallery,
  onResetCamera,
  onToggleLocked,
  onUpdatePrimitiveView,
  onViewportActive,
}: {
  layer: PrimitiveLayer;
  bgPreviewTargetId: string | null;
  materialConfig?: MaterialConfig;
  materialTextures?: ReturnType<typeof useGeneratedMaterialTextureCanvases>;
  renderMode: PrimitiveRenderMode;
  viewState: PrimitiveViewportState;
  locked: boolean;
  committedViewStateKey: string;
  onDraftViewState: (draft: { baseKey: string; value: PrimitiveViewportState } | null) => void;
  onOpenGallery: (targetId: string) => void;
  onResetCamera: () => void;
  onToggleLocked: (locked: boolean) => void;
  onUpdatePrimitiveView: (layerId: string, viewState: PrimitiveViewportState, mode?: 'debounce' | 'snapshot') => void;
  onViewportActive: (layerId: string, active: boolean) => void;
}) {
  return (
    <div
      className={primitivePreviewSurfaceClassName(locked)}
      data-viewport-3d-workspace="primitive"
      data-viewport-3d-workspace-state={locked ? 'locked' : 'active'}
      onMouseEnter={() => {
        if (!locked) onViewportActive(layer.id, true);
      }}
      onMouseLeave={() => {
        onViewportActive(layer.id, false);
      }}
    >
      <PrimitiveViewportFrame
        layer={layer}
        materialConfig={materialConfig}
        materialTextures={materialTextures}
        bgPreviewTargetId={bgPreviewTargetId}
        renderMode={renderMode}
        viewState={viewState}
        interactive
        onViewStateDraft={(next) => onDraftViewState({ baseKey: committedViewStateKey, value: next })}
        onViewStateChange={(next) => {
          onDraftViewState(null);
          onUpdatePrimitiveView(layer.id, next, 'snapshot');
        }}
      />
      <Viewport3DControlStrip
        scope="camera"
        locked={locked}
        zoom={viewState.zoom}
        onOpenPreview={() => onOpenGallery(layer.id)}
        onReset={onResetCamera}
        onToggleLocked={onToggleLocked}
      />
    </div>
  );
}

function primitivePreviewSurfaceClassName(locked: boolean) {
  return locked
    ? 'node-preview-surface primitive-preview-surface primitive-preview-surface-locked'
    : 'node-preview-surface primitive-preview-surface nodrag nopan nowheel';
}

function primitiveViewStateKey(viewState: PrimitiveViewportState): string {
  return [
    viewState.rotationX,
    viewState.rotationY,
    viewState.zoom,
    viewState.panX,
    viewState.panY,
    viewState.locked ? 1 : 0,
  ].join(':');
}

function PrimitiveViewportFrame({
  layer,
  bgPreviewTargetId,
  materialConfig,
  materialTextures,
  renderMode,
  viewState,
  interactive,
  onViewStateDraft,
  onViewStateChange,
}: {
  layer: PrimitiveLayer;
  bgPreviewTargetId: string | null;
  materialConfig?: MaterialConfig;
  materialTextures?: ReturnType<typeof useGeneratedMaterialTextureCanvases>;
  renderMode: PrimitiveRenderMode;
  viewState: PrimitiveViewportState;
  interactive: boolean;
  onViewStateDraft?: (viewState: PrimitiveViewportState) => void;
  onViewStateChange: (viewState: PrimitiveViewportState) => void;
}) {
  return (
    <div
      className="node-primitive-live-frame artifact-viewport3d-frame"
      data-viewport-3d-frame="primitive"
      data-viewport-3d-frame-state={viewState.locked ? 'locked' : 'active'}
    >
      {bgPreviewTargetId ? <NodeThumbnail previewTargetId={bgPreviewTargetId} /> : <EmptyThumbnailFrame />}
      <div className="node-primitive-live-viewport-layer" style={{ pointerEvents: interactive ? 'auto' : 'none' }}>
        <LazyPrimitiveViewport3D
          layer={layer}
          mode="node"
          renderMode={renderMode}
          materialConfig={materialConfig}
          materialTextures={materialTextures}
          viewState={viewState}
          interactive={interactive}
          onViewStateDraft={onViewStateDraft}
          onViewStateChange={onViewStateChange}
          className="node-primitive-preview node-primitive-preview-transparent"
        />
      </div>
    </div>
  );
}
