import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { resolveImageSource } from '../../../utils/assetStore';
import { useNodeCanvasActions, useNodeCanvasPreview } from '../context';
import { isGalleryEligibleLayer, stopNodeEvent, stopNodeGestureEvent } from '../helpers';
import type { LayerTransformPatch, TransformableLayer } from '../nodes/useLayerTransformDraft';
import type { LayerNodeData } from '../types';
import { EmptyThumbnailFrame, LiveMediaOverlay } from './LiveMediaOverlay';
import { getLiveImageSource, shouldResolveLiveImageSource, shouldUseLiveMediaOverlay } from './liveMediaOverlayMode';
import { NodeThumbnail } from './NodeThumbnail';
import { PrimitivePreviewSurface } from './PrimitivePreviewSurface';

type LayerPreviewSurfaceProps = Pick<
  LayerNodeData,
  'layer' | 'previewTargetId' | 'primitiveViewState' | 'primitiveRenderMode' | 'selected'
> & {
  transformActive?: boolean;
  onTransformDraft?: (patch: LayerTransformPatch) => void;
  onTransformCommit?: () => void;
  onTransformWheelDelta?: (deltaY: number) => void;
};

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
  const dragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startLayerX: number;
    startLayerY: number;
    startRotation: number;
    startAngle: number;
    mode: 'translate' | 'rotate';
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rotating, setRotating] = useState(false);

  const clampPosition = (value: number) => Math.max(-0.5, Math.min(1.5, value));

  const stopLocalGesture = (e: React.SyntheticEvent) => {
    stopNodeGestureEvent(e);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    stopLocalGesture(e);
    onStart();
    if (e.shiftKey) {
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
      dragRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startLayerX: layer.x,
        startLayerY: layer.y,
        startRotation: layer.rotation,
        startAngle: angle,
        mode: 'rotate',
      };
      setRotating(true);
    } else {
      dragRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startLayerX: layer.x,
        startLayerY: layer.y,
        startRotation: layer.rotation,
        startAngle: 0,
        mode: 'translate',
      };
    }
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    stopLocalGesture(e);
    if (!dragRef.current) return;
    const { startClientX, startClientY, startLayerX, startLayerY, startRotation, startAngle, mode } = dragRef.current;
    if (mode === 'translate') {
      const rect = e.currentTarget.getBoundingClientRect();
      const frameWidth = Math.max(1, rect.width);
      const frameHeight = Math.max(1, rect.height);
      const dx = e.clientX - startClientX;
      const dy = e.clientY - startClientY;
      const newX = clampPosition(startLayerX + dx / frameWidth);
      const newY = clampPosition(startLayerY + dy / frameHeight);
      onChange({ x: newX, y: newY });
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
      let delta = angle - startAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      onChange({ rotation: startRotation + delta });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    stopLocalGesture(e);
    dragRef.current = null;
    setDragging(false);
    setRotating(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    onCommit();
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    stopLocalGesture(e);
    dragRef.current = null;
    setDragging(false);
    setRotating(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    onCommit();
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

function useNativeTransformWheel(
  rootRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  onWheelDelta: ((deltaY: number) => void) | undefined,
) {
  const enabledRef = useRef(enabled);
  const onWheelDeltaRef = useRef(onWheelDelta);

  useEffect(() => {
    enabledRef.current = enabled;
    onWheelDeltaRef.current = onWheelDelta;
  }, [enabled, onWheelDelta]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const handleWheel = (event: WheelEvent) => {
      if (!enabledRef.current || !onWheelDeltaRef.current) return;
      if (!root.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onWheelDeltaRef.current(event.deltaY);
    };

    const controller = new AbortController();
    const options: AddEventListenerOptions = { capture: true, passive: false, signal: controller.signal };
    root.addEventListener('wheel', handleWheel, options);
    return () => controller.abort();
  }, [rootRef]);
}

function useLiveImageSource(layer: LayerNodeData['layer'], imageCache: Map<string, HTMLImageElement>) {
  const cachedSource = layer.kind === 'image' ? getLiveImageSource(layer, imageCache) : null;
  const [resolvedSource, setResolvedSource] = useState<{ key: string; source: string | null } | null>(null);
  const sourceKey = layer.kind === 'image' ? layer.src : '';
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

  return cachedSource ?? (resolvedSource?.key === sourceKey ? resolvedSource.source : null);
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
  const isDraggableLayer = layer.kind === 'text' || layer.kind === 'image';
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
  useNativeTransformWheel(previewSurfaceRef, isDraggableLayer && selected, handleTransformWheelDelta);

  const mediaBgPreviewTargetId = useMemo(
    () =>
      layer.kind === 'text' || layer.kind === 'image'
        ? (graph.edges.find((edge) => edge.toId === layer.id && edge.toPort === 'bg')?.fromId ?? null)
        : null,
    [graph.edges, layer.id, layer.kind],
  );
  const effectHasSource = useMemo(
    () => layer.kind !== 'effect' || graph.edges.some((edge) => edge.toId === layer.id && edge.toPort === 'in'),
    [graph.edges, layer.id, layer.kind],
  );

  if (layer.kind === 'primitive') {
    return (
      <PrimitivePreviewSurface
        layer={layer}
        selected={selected}
        primitiveViewState={primitiveViewState}
        primitiveRenderMode={primitiveRenderMode}
      />
    );
  }

  if (isGalleryEligibleLayer(layer)) {
    const isDraggable = layer.kind === 'text' || layer.kind === 'image';
    const keepLiveTransformSurface = transformActive || stickyTransformLayerId === layer.id;
    const showLiveTransformOverlay =
      isDraggable &&
      shouldUseLiveMediaOverlay({
        layer,
        selected,
        transformActive: keepLiveTransformSurface,
        liveImageSource,
      });
    return (
      <div
        ref={previewSurfaceRef}
        className={`node-preview-surface nodrag nopan${isDraggable && selected ? ' nowheel' : ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="node-live-preview-frame">
          {showLiveTransformOverlay ? (
            <>
              {mediaBgPreviewTargetId ? (
                <NodeThumbnail previewTargetId={mediaBgPreviewTargetId} />
              ) : (
                <EmptyThumbnailFrame />
              )}
              <LiveMediaOverlay layer={layer} imageSrc={liveImageSource} />
            </>
          ) : (
            <NodeThumbnail previewTargetId={previewTargetId} priority={selected} />
          )}
          {isDraggable && selected && (
            <DragTransformOverlay
              layer={layer}
              onChange={onTransformDraft ?? (() => undefined)}
              onCommit={onTransformCommit ?? (() => undefined)}
              onStart={activateTransformSurface}
            />
          )}
        </div>
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

  if (!effectHasSource) return <EmptyThumbnailFrame label="Connect source" />;

  return <NodeThumbnail previewTargetId={previewTargetId} priority={selected} />;
});
