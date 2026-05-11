import { memo, useEffect, useMemo, useRef, useState } from 'react';

import { PrimitiveViewport3D } from '../../PrimitiveViewport3D';
import { defaultPrimitiveViewportState } from '../../PrimitiveViewportState';
import { useNodeCanvasActions, useNodeCanvasPreview } from '../context';
import { THUMB_SIZE } from '../constants';
import { isGalleryEligibleLayer, stopNodeEvent } from '../helpers';
import type { LayerNodeData } from '../types';
import type { LayerTransformPatch, TransformableLayer } from '../nodes/useLayerTransformDraft';
import { EmptyThumbnailFrame, LiveMediaOverlay } from './LiveMediaOverlay';
import { NodeThumbnail } from './NodeThumbnail';

type LayerPreviewSurfaceProps = Pick<LayerNodeData, 'layer' | 'previewTargetId' | 'primitiveViewState' | 'primitiveRenderMode' | 'selected'> & {
  onTransformDraft?: (patch: LayerTransformPatch) => void;
  onTransformCommit?: () => void;
};

function DragTransformOverlay({
  layer,
  onChange,
  onCommit,
}: {
  layer: TransformableLayer;
  onChange: (patch: LayerTransformPatch) => void;
  onCommit: () => void;
}) {
  const THUMB = THUMB_SIZE;
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

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
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
    if (!dragRef.current) return;
    const { startClientX, startClientY, startLayerX, startLayerY, startRotation, startAngle, mode } = dragRef.current;
    if (mode === 'translate') {
      const dx = e.clientX - startClientX;
      const dy = e.clientY - startClientY;
      const newX = startLayerX + (dx / THUMB) * 1.5;
      const newY = startLayerY + (dy / THUMB) * 1.5;
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
    dragRef.current = null;
    setDragging(false);
    setRotating(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    onCommit();
  };

  const handlePointerCancel = () => {
    dragRef.current = null;
    setDragging(false);
    setRotating(false);
    onCommit();
  };

  let cursor = 'grab';
  if (dragging) cursor = rotating ? 'alias' : 'grabbing';

  return (
    <div
      className="node-drag-overlay nodrag nopan"
      style={{ position: 'absolute', inset: 0, zIndex: 2, cursor, touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    />
  );
}

export const LayerPreviewSurface = memo(function LayerPreviewSurface({
  layer,
  previewTargetId,
  primitiveViewState,
  primitiveRenderMode,
  selected,
  onTransformDraft,
  onTransformCommit,
}: LayerPreviewSurfaceProps) {
  const { graph } = useNodeCanvasPreview();
  const { openGallery, updatePrimitiveView, setPrimitiveViewportActive } = useNodeCanvasActions();
  const [hovered, setHovered] = useState(false);
  const primitiveBgPreviewTargetId = useMemo(
    () => layer.kind === 'primitive'
      ? graph.edges.find((edge) => edge.toId === layer.id && edge.toPort === 'bg')?.fromId ?? null
      : null,
    [graph.edges, layer.id, layer.kind],
  );
  const mediaBgPreviewTargetId = useMemo(
    () => layer.kind === 'text' || layer.kind === 'image'
      ? graph.edges.find((edge) => edge.toId === layer.id && edge.toPort === 'bg')?.fromId ?? null
      : null,
    [graph.edges, layer.id, layer.kind],
  );

  useEffect(() => {
    if (layer.kind !== 'primitive') return undefined;
    if (!selected) setPrimitiveViewportActive(layer.id, false);
    return () => setPrimitiveViewportActive(layer.id, false);
  }, [layer.id, layer.kind, selected, setPrimitiveViewportActive]);

  if (layer.kind === 'primitive') {
    const effectiveViewState = primitiveViewState ?? defaultPrimitiveViewportState(layer);
    const effectiveRenderMode = primitiveRenderMode ?? 'shaded';
    const primitiveLocked = !!effectiveViewState.locked;
    const setPrimitiveLocked = (locked: boolean) => {
      updatePrimitiveView(layer.id, { ...effectiveViewState, locked });
      if (selected) setPrimitiveViewportActive(layer.id, !locked);
    };
    const resetPrimitiveCamera = () => {
      updatePrimitiveView(layer.id, {
        ...defaultPrimitiveViewportState(layer),
        locked: primitiveLocked,
      });
    };

    if (!selected) {
      return (
        <div
          className="node-preview-surface nodrag nopan"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <NodeThumbnail previewTargetId={previewTargetId} />
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

    return (
      <div
        className={`node-preview-surface primitive-preview-surface${primitiveLocked ? ' primitive-preview-surface-locked' : ' nodrag nopan'}`}
        onMouseEnter={() => {
          setHovered(true);
          if (selected && !primitiveLocked) setPrimitiveViewportActive(layer.id, true);
        }}
        onMouseLeave={() => {
          setHovered(false);
          if (selected) setPrimitiveViewportActive(layer.id, false);
        }}
      >
        <div className="node-primitive-live-frame">
          {primitiveBgPreviewTargetId ? (
            <NodeThumbnail previewTargetId={primitiveBgPreviewTargetId} />
          ) : (
            <EmptyThumbnailFrame />
          )}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                transform: `translate(${(layer.x - 0.5) * 100}%, ${(layer.y - 0.5) * 100}%) rotate(${layer.rotation}deg) scale(${layer.scaleX}, ${layer.scaleY})`,
                transformOrigin: 'center center',
                pointerEvents: 'auto',
              }}
            >
              <PrimitiveViewport3D
                layer={layer}
                mode="node"
                renderMode={effectiveRenderMode}
                viewState={effectiveViewState}
                onViewStateChange={(next) => updatePrimitiveView(layer.id, next)}
                className="node-primitive-preview node-primitive-preview-transparent"
              />
            </div>
          </div>
        </div>
        <div className="primitive-node-camera-strip" data-primitive-camera-control>
          <span className="primitive-node-camera-hint">
            {primitiveLocked ? 'camera locked' : `drag rotate · right drag pan · ${Math.round(effectiveViewState.zoom * 100)}%`}
          </span>
          <div className="primitive-node-camera-actions">
            <button
              type="button"
              className={`nodrag nopan nowheel primitive-camera-button${primitiveLocked ? ' primitive-camera-button-active' : ''}`}
              aria-label={primitiveLocked ? 'Unlock camera' : 'Lock camera'}
              aria-pressed={primitiveLocked}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setPrimitiveLocked(!primitiveLocked);
              }}
            >
              {primitiveLocked ? 'LOCK' : 'FREE'}
            </button>
            <button
              type="button"
              className="nodrag nopan nowheel primitive-camera-button"
              aria-label="Open preview"
              onClick={(event) => {
                stopNodeEvent(event);
                openGallery(layer.id);
              }}
            >
              VIEW
            </button>
            <button
              type="button"
              className="nodrag nopan nowheel primitive-camera-button"
              aria-label="Reset camera"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                resetPrimitiveCamera();
              }}
            >
              RESET
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isGalleryEligibleLayer(layer)) {
    const isDraggable = layer.kind === 'text' || layer.kind === 'image';
    return (
      <div
        className="node-preview-surface nodrag nopan"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div style={{ position: 'relative', display: 'inline-block' }}>
          {isDraggable && selected ? (
            <>
              {mediaBgPreviewTargetId ? (
                <NodeThumbnail previewTargetId={mediaBgPreviewTargetId} />
              ) : (
                <EmptyThumbnailFrame />
              )}
              <LiveMediaOverlay layer={layer} />
            </>
          ) : (
            <NodeThumbnail previewTargetId={previewTargetId} />
          )}
          {isDraggable && selected && (
            <DragTransformOverlay
              layer={layer}
              onChange={onTransformDraft ?? (() => undefined)}
              onCommit={onTransformCommit ?? (() => undefined)}
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

  return <NodeThumbnail previewTargetId={previewTargetId} />;
});
