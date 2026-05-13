import { memo, useMemo, useRef, useState } from 'react';

import { useNodeCanvasActions, useNodeCanvasPreview } from '../context';
import { isGalleryEligibleLayer, stopNodeEvent } from '../helpers';
import type { LayerTransformPatch, TransformableLayer } from '../nodes/useLayerTransformDraft';
import type { LayerNodeData } from '../types';
import { EmptyThumbnailFrame, LiveMediaOverlay } from './LiveMediaOverlay';
import { NodeThumbnail } from './NodeThumbnail';
import { PrimitivePreviewSurface } from './PrimitivePreviewSurface';

type LayerPreviewSurfaceProps = Pick<
  LayerNodeData,
  'layer' | 'previewTargetId' | 'primitiveViewState' | 'primitiveRenderMode' | 'selected'
> & {
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
  const { openGallery } = useNodeCanvasActions();
  const [hovered, setHovered] = useState(false);
  const mediaBgPreviewTargetId = useMemo(
    () =>
      layer.kind === 'text' || layer.kind === 'image'
        ? (graph.edges.find((edge) => edge.toId === layer.id && edge.toPort === 'bg')?.fromId ?? null)
        : null,
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
    return (
      <div
        className="node-preview-surface nodrag nopan"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="node-live-preview-frame">
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
