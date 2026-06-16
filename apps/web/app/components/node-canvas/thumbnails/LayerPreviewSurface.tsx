import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ImageLayer } from '../../../types/config';
import {
  getAiGenerationStatusDetail,
  getAiGenerationStatusLabel,
  getAiGenerationUiState,
} from '../../../utils/aiGenerationStatus';
import { resolveImageSource } from '../../../utils/assetStore';
import { useNodeCanvasActions, useNodeCanvasPreview } from '../context';
import { isGalleryEligibleLayer, stopNodeEvent, stopNodeGestureEvent } from '../helpers';
import type { LayerTransformPatch, TransformableLayer } from '../nodes/useLayerTransformDraft';
import type { LayerNodeData } from '../types';
import { EmptyThumbnailFrame, LiveMediaOverlay } from './LiveMediaOverlay';
import { getLiveImageSource, shouldResolveLiveImageSource, shouldUseLiveMediaOverlay } from './liveMediaOverlayMode';
import { ModelPreviewSurface } from './ModelPreviewSurface';
import { NodeThumbnail } from './NodeThumbnail';
import { PrimitivePreviewSurface } from './PrimitivePreviewSurface';
import { useNativeTransformWheel } from './useNativeTransformWheel';

type LayerPreviewSurfaceProps = Pick<
  LayerNodeData,
  'layer' | 'previewTargetId' | 'primitiveViewState' | 'primitiveRenderMode' | 'selected'
> & {
  transformActive?: boolean;
  onTransformDraft?: (patch: LayerTransformPatch) => void;
  onTransformCommit?: () => void;
  onTransformWheelDelta?: (deltaY: number) => void;
};

type GalleryLayerPreviewSurfaceProps = {
  layer: LayerNodeData['layer'];
  previewTargetId: string;
  selected: boolean;
  transformActive: boolean;
  liveImageSource: string | null;
  mediaBgPreviewTargetId: string | null;
  stickyTransformLayerId: string | null;
  previewSurfaceRef: React.RefObject<HTMLDivElement | null>;
  hovered: boolean;
  activateTransformSurface: () => void;
  setHovered: (hovered: boolean) => void;
  openGallery: (layerId: string) => void;
  onTransformDraft?: (patch: LayerTransformPatch) => void;
  onTransformCommit?: () => void;
};

const noopTransformPatch = () => undefined;
const noopTransformCommit = () => undefined;

function pointerAngleFromElement(e: React.PointerEvent<HTMLDivElement>): number {
  const rect = e.currentTarget.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
}

function clampTransformPosition(value: number) {
  return Math.max(-0.5, Math.min(1.5, value));
}

function translateTransformPatch(
  e: React.PointerEvent<HTMLDivElement>,
  drag: NonNullable<ReturnType<typeof createDragState>>,
): LayerTransformPatch {
  const rect = e.currentTarget.getBoundingClientRect();
  const frameWidth = Math.max(1, rect.width);
  const frameHeight = Math.max(1, rect.height);
  const dx = e.clientX - drag.startClientX;
  const dy = e.clientY - drag.startClientY;
  return {
    x: clampTransformPosition(drag.startLayerX + dx / frameWidth),
    y: clampTransformPosition(drag.startLayerY + dy / frameHeight),
  };
}

function rotationTransformPatch(
  e: React.PointerEvent<HTMLDivElement>,
  drag: NonNullable<ReturnType<typeof createDragState>>,
): LayerTransformPatch {
  const angle = pointerAngleFromElement(e);
  let delta = angle - drag.startAngle;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return { rotation: drag.startRotation + delta };
}

function createDragState(
  e: React.PointerEvent<HTMLDivElement>,
  layer: TransformableLayer,
  mode: 'translate' | 'rotate',
) {
  return {
    startClientX: e.clientX,
    startClientY: e.clientY,
    startLayerX: layer.x,
    startLayerY: layer.y,
    startRotation: layer.rotation,
    startAngle: mode === 'rotate' ? pointerAngleFromElement(e) : 0,
    mode,
  };
}

function AiGenerationPreviewOverlay({ generation }: { generation: ImageLayer['aiGeneration'] }) {
  const model = aiGenerationPreviewOverlayModel(generation);
  if (!model) return null;
  return (
    <div className={`node-ai-status-overlay node-ai-status-${model.state}`} role="status" aria-live="polite">
      {model.loading && <span className="node-ai-status-spinner" aria-hidden="true" />}
      <span className="node-ai-status-label">{model.label}</span>
      {model.detail && <span className="node-ai-status-detail">{model.detail}</span>}
    </div>
  );
}

function aiGenerationPreviewOverlayModel(generation: ImageLayer['aiGeneration']) {
  const state = getAiGenerationUiState(generation);
  if (state === 'idle' || state === 'done') return null;
  return {
    state,
    loading: state === 'loading',
    label: getAiGenerationStatusLabel(generation) ?? 'Generating',
    detail: getAiGenerationStatusDetail(generation),
  };
}

function AiGenerationHistoryBadge({ layer }: { layer: ImageLayer }) {
  const model = aiGenerationHistoryBadgeModel(layer);
  if (!model) return null;
  return (
    <div className="node-ai-history-badge" aria-label={`Generated image ${model.current} of ${model.count}`}>
      {model.current}/{model.count}
    </div>
  );
}

function aiGenerationHistoryBadgeModel(layer: ImageLayer) {
  const count = aiGenerationHistoryCount(layer);
  if (count <= 1) return null;
  return { count, current: aiGenerationHistoryCurrent(layer, count) };
}

function aiGenerationHistoryCount(layer: ImageLayer) {
  return layer.aiGenerationHistory?.length ?? 0;
}

function aiGenerationHistoryCurrent(layer: ImageLayer, count: number) {
  const fallbackIndex = count - 1;
  const currentIndex = Math.min(Math.max(layer.aiGenerationHistoryIndex ?? fallbackIndex, 0), fallbackIndex);
  return currentIndex + 1;
}

function DragTransformOverlay({
  layer,
  onChange,
  onCommit,
  onStart,
}: {
  layer: TransformableLayer;
  onChange: (patch: LayerTransformPatch) => void;
  onCommit: () => void;
  onStart: () => void;
}) {
  const dragRef = useRef<ReturnType<typeof createDragState> | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rotating, setRotating] = useState(false);

  const stopLocalGesture = (e: React.SyntheticEvent) => {
    stopNodeGestureEvent(e);
  };
  const endDragGesture = (e: React.PointerEvent<HTMLDivElement>) => {
    stopLocalGesture(e);
    dragRef.current = null;
    setDragging(false);
    setRotating(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    onCommit();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    stopLocalGesture(e);
    onStart();
    if (e.shiftKey) {
      dragRef.current = createDragState(e, layer, 'rotate');
      setRotating(true);
    } else {
      dragRef.current = createDragState(e, layer, 'translate');
    }
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    stopLocalGesture(e);
    if (!dragRef.current) return;
    const patch =
      dragRef.current.mode === 'translate'
        ? translateTransformPatch(e, dragRef.current)
        : rotationTransformPatch(e, dragRef.current);
    onChange(patch);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    endDragGesture(e);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    endDragGesture(e);
  };

  let cursor = 'grab';
  if (dragging) cursor = rotating ? 'alias' : 'grabbing';

  return (
    <div
      className="node-drag-overlay nodrag nopan nowheel"
      style={{ cursor }}
      onClickCapture={stopLocalGesture}
      onDoubleClickCapture={stopLocalGesture}
      onPointerDownCapture={handlePointerDown}
      onPointerMoveCapture={handlePointerMove}
      onPointerUpCapture={handlePointerUp}
      onPointerCancelCapture={handlePointerCancel}
    />
  );
}

function useLiveImageSource(layer: LayerNodeData['layer'], imageCache: Map<string, HTMLImageElement>) {
  const cachedSource = cachedLiveImageSource(layer, imageCache);
  const [resolvedSource, setResolvedSource] = useState<{
    key: string;
    source: string | null;
  } | null>(null);
  const sourceKey = liveImageSourceKey(layer);
  const shouldResolve = shouldResolveLiveImageSource(layer, cachedSource);

  useEffect(() => {
    let cancelled = false;
    if (!shouldResolve) return () => undefined;
    void resolveImageSource(sourceKey)
      .then((source) => {
        if (!cancelled) setResolvedSource({ key: sourceKey, source });
      })
      .catch(() => {
        if (!cancelled) setResolvedSource({ key: sourceKey, source: null });
      });
    return () => {
      cancelled = true;
    };
  }, [shouldResolve, sourceKey]);

  return cachedSource ?? resolvedLiveImageSource(resolvedSource, sourceKey);
}

function cachedLiveImageSource(layer: LayerNodeData['layer'], imageCache: Map<string, HTMLImageElement>) {
  return layer.kind === 'image' ? getLiveImageSource(layer, imageCache) : null;
}

function liveImageSourceKey(layer: LayerNodeData['layer']) {
  return layer.kind === 'image' ? layer.src : '';
}

function resolvedLiveImageSource(resolvedSource: { key: string; source: string | null } | null, sourceKey: string) {
  if (resolvedSource?.key !== sourceKey) return null;
  return resolvedSource.source;
}

function isTransformableLayer(layer: LayerNodeData['layer']) {
  return layer.kind === 'text' || layer.kind === 'image';
}

function mediaBackgroundPreviewTargetId(
  layer: LayerNodeData['layer'],
  graph: ReturnType<typeof useNodeCanvasPreview>['graph'],
) {
  if (!isTransformableLayer(layer)) return null;
  return graph.edges.find((edge) => edge.toId === layer.id && edge.toPort === 'bg')?.fromId ?? null;
}

function layerHasEffectSource(layer: LayerNodeData['layer'], graph: ReturnType<typeof useNodeCanvasPreview>['graph']) {
  return layer.kind !== 'effect' || graph.edges.some((edge) => edge.toId === layer.id && edge.toPort === 'in');
}

function LiveTransformPreviewFrame({
  layer,
  previewTargetId,
  mediaBgPreviewTargetId,
  selected,
  showLiveTransformOverlay,
  liveImageSource,
  activateTransformSurface,
  onTransformDraft,
  onTransformCommit,
}: {
  layer: LayerNodeData['layer'];
  previewTargetId: string;
  mediaBgPreviewTargetId: string | null;
  selected: boolean;
  showLiveTransformOverlay: boolean;
  liveImageSource: string | null;
  activateTransformSurface: () => void;
  onTransformDraft?: (patch: LayerTransformPatch) => void;
  onTransformCommit?: () => void;
}) {
  return (
    <div className="node-live-preview-frame">
      <LiveTransformMedia
        layer={layer}
        previewTargetId={previewTargetId}
        mediaBgPreviewTargetId={mediaBgPreviewTargetId}
        selected={selected}
        showLiveTransformOverlay={showLiveTransformOverlay}
        liveImageSource={liveImageSource}
      />
      <ImageGenerationBadges layer={layer} />
      <TransformDragOverlay
        layer={layer}
        selected={selected}
        activateTransformSurface={activateTransformSurface}
        onTransformDraft={onTransformDraft}
        onTransformCommit={onTransformCommit}
      />
    </div>
  );
}

function LiveTransformMedia({
  layer,
  previewTargetId,
  mediaBgPreviewTargetId,
  selected,
  showLiveTransformOverlay,
  liveImageSource,
}: {
  layer: LayerNodeData['layer'];
  previewTargetId: string;
  mediaBgPreviewTargetId: string | null;
  selected: boolean;
  showLiveTransformOverlay: boolean;
  liveImageSource: string | null;
}) {
  if (!showLiveTransformOverlay) return <NodeThumbnail previewTargetId={previewTargetId} priority={selected} />;
  return (
    <>
      {mediaBgPreviewTargetId ? <NodeThumbnail previewTargetId={mediaBgPreviewTargetId} /> : <EmptyThumbnailFrame />}
      <LiveMediaOverlay layer={layer} imageSrc={liveImageSource} />
    </>
  );
}

function ImageGenerationBadges({ layer }: { layer: LayerNodeData['layer'] }) {
  if (layer.kind !== 'image') return null;
  return (
    <>
      <AiGenerationPreviewOverlay generation={layer.aiGeneration} />
      <AiGenerationHistoryBadge layer={layer} />
    </>
  );
}

function TransformDragOverlay({
  layer,
  selected,
  activateTransformSurface,
  onTransformDraft,
  onTransformCommit,
}: {
  layer: LayerNodeData['layer'];
  selected: boolean;
  activateTransformSurface: () => void;
  onTransformDraft?: (patch: LayerTransformPatch) => void;
  onTransformCommit?: () => void;
}) {
  if (!shouldShowTransformDragOverlay(layer, selected)) return null;
  return (
    <DragTransformOverlay
      layer={layer}
      onChange={onTransformDraft ?? noopTransformPatch}
      onCommit={onTransformCommit ?? noopTransformCommit}
      onStart={activateTransformSurface}
    />
  );
}

function shouldShowTransformDragOverlay(layer: LayerNodeData['layer'], selected: boolean) {
  return selected && isTransformableLayer(layer);
}

function galleryPreviewClassName(isDraggable: boolean, selected: boolean) {
  return `node-preview-surface nodrag nopan${isDraggable && selected ? ' nowheel' : ''}`;
}

function shouldShowLiveTransformOverlay({
  layer,
  selected,
  transformActive,
  stickyTransformLayerId,
  liveImageSource,
}: {
  layer: LayerNodeData['layer'];
  selected: boolean;
  transformActive: boolean;
  stickyTransformLayerId: string | null;
  liveImageSource: string | null;
}) {
  if (!isTransformableLayer(layer)) return false;
  return shouldUseLiveMediaOverlay({
    layer,
    selected,
    transformActive: transformActive || stickyTransformLayerId === layer.id,
    liveImageSource,
  });
}

function primitiveLayerPreviewSurface({
  layer,
  selected,
  primitiveViewState,
  primitiveRenderMode,
}: Pick<LayerPreviewSurfaceProps, 'layer' | 'selected' | 'primitiveViewState' | 'primitiveRenderMode'>) {
  if (layer.kind !== 'primitive') return null;
  return (
    <PrimitivePreviewSurface
      layer={layer}
      selected={selected}
      primitiveViewState={primitiveViewState}
      primitiveRenderMode={primitiveRenderMode}
    />
  );
}

function modelLayerPreviewSurface({ layer, selected }: Pick<LayerPreviewSurfaceProps, 'layer' | 'selected'>) {
  if (layer.kind !== 'model') return null;
  return <ModelPreviewSurface layer={layer} selected={selected} />;
}

function GalleryLayerPreviewSurface({
  layer,
  previewTargetId,
  selected,
  transformActive,
  liveImageSource,
  mediaBgPreviewTargetId,
  stickyTransformLayerId,
  previewSurfaceRef,
  hovered,
  activateTransformSurface,
  setHovered,
  openGallery,
  onTransformDraft,
  onTransformCommit,
}: GalleryLayerPreviewSurfaceProps) {
  const isDraggable = isTransformableLayer(layer);
  const showLiveTransformOverlay = shouldShowLiveTransformOverlay({
    layer,
    selected,
    transformActive,
    stickyTransformLayerId,
    liveImageSource,
  });
  return (
    <div
      ref={previewSurfaceRef}
      className={galleryPreviewClassName(isDraggable, selected)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <LiveTransformPreviewFrame
        layer={layer}
        previewTargetId={previewTargetId}
        mediaBgPreviewTargetId={mediaBgPreviewTargetId}
        selected={selected}
        showLiveTransformOverlay={showLiveTransformOverlay}
        liveImageSource={liveImageSource}
        activateTransformSurface={activateTransformSurface}
        onTransformDraft={onTransformDraft}
        onTransformCommit={onTransformCommit}
      />
      <button
        type="button"
        className={`node-preview-open${hovered ? ' node-preview-open-visible' : ''}`}
        onClick={(event) => {
          stopNodeEvent(event);
          openGallery(layer.id);
        }}
        aria-label="Open preview"
      >
        View
      </button>
    </div>
  );
}

function defaultLayerPreviewSurface({
  effectHasSource,
  previewTargetId,
  selected,
}: {
  effectHasSource: boolean;
  previewTargetId: string;
  selected: boolean;
}) {
  return effectHasSource ? (
    <NodeThumbnail previewTargetId={previewTargetId} priority={selected} />
  ) : (
    <EmptyThumbnailFrame label="Connect source" />
  );
}

export const LayerPreviewSurface = memo(function LayerPreviewSurface({
  layer,
  previewTargetId,
  primitiveViewState,
  primitiveRenderMode,
  selected,
  transformActive = false,
  onTransformDraft,
  onTransformCommit,
  onTransformWheelDelta,
}: LayerPreviewSurfaceProps) {
  const { graph, imageCache } = useNodeCanvasPreview();
  const { openGallery } = useNodeCanvasActions();
  const [hovered, setHovered] = useState(false);
  const previewSurfaceRef = useRef<HTMLDivElement>(null);
  const [stickyTransformLayerId, setStickyTransformLayerId] = useState<string | null>(null);
  const liveImageSource = useLiveImageSource(layer, imageCache);
  const activateTransformSurface = useCallback(() => setStickyTransformLayerId(layer.id), [layer.id]);
  const handleTransformWheelDelta = useCallback(
    (deltaY: number) => {
      activateTransformSurface();
      onTransformWheelDelta?.(deltaY);
    },
    [activateTransformSurface, onTransformWheelDelta],
  );
  useNativeTransformWheel(previewSurfaceRef, isTransformableLayer(layer) && selected, handleTransformWheelDelta);

  const mediaBgPreviewTargetId = useMemo(() => mediaBackgroundPreviewTargetId(layer, graph), [graph, layer]);
  const effectHasSource = useMemo(() => layerHasEffectSource(layer, graph), [graph, layer]);

  const primitiveSurface = primitiveLayerPreviewSurface({
    layer,
    selected,
    primitiveViewState,
    primitiveRenderMode,
  });
  if (primitiveSurface) return primitiveSurface;
  const modelSurface = modelLayerPreviewSurface({
    layer,
    selected,
  });
  if (modelSurface) return modelSurface;
  if (isGalleryEligibleLayer(layer)) {
    return (
      <GalleryLayerPreviewSurface
        layer={layer}
        previewTargetId={previewTargetId}
        selected={selected}
        transformActive={transformActive}
        liveImageSource={liveImageSource}
        mediaBgPreviewTargetId={mediaBgPreviewTargetId}
        stickyTransformLayerId={stickyTransformLayerId}
        previewSurfaceRef={previewSurfaceRef}
        hovered={hovered}
        activateTransformSurface={activateTransformSurface}
        setHovered={setHovered}
        openGallery={openGallery}
        onTransformDraft={onTransformDraft}
        onTransformCommit={onTransformCommit}
      />
    );
  }
  return defaultLayerPreviewSurface({
    effectHasSource,
    previewTargetId,
    selected,
  });
});
