import { memo, useEffect, useMemo, useRef, useState } from 'react';

import { PrimitiveViewport3D } from '../../PrimitiveViewport3D';
import { defaultPrimitiveViewportState } from '../../PrimitiveViewportState';
import type { Layer } from '../../../types/config';
import { useNodeCanvasActions, useNodeCanvasPreview } from '../context';
import { THUMB_SIZE } from '../constants';
import { isGalleryEligibleLayer, stopNodeEvent } from '../helpers';
import type { LayerNodeData } from '../types';
import { NodeThumbnail } from './NodeThumbnail';

type LayerPreviewSurfaceProps = Pick<LayerNodeData, 'layer' | 'previewTargetId' | 'primitiveViewState' | 'primitiveRenderMode' | 'selected'>;
const PRIMITIVE_BOX_RATIO = 360 / 540;

function DragTransformOverlay({
  layer,
  onChange,
}: {
  layer: Layer;
  onChange: (patch: Partial<Layer>) => void;
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

  const getXY = () => ({
    x: 'x' in layer ? layer.x : 0.5,
    y: 'y' in layer ? layer.y : 0.5,
  });
  const getRotation = () => ('rotation' in layer ? layer.rotation : 0);
  const getScale = () => ('scaleX' in layer ? layer.scaleX : 1);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const { x, y } = getXY();
    if (e.shiftKey) {
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
      dragRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startLayerX: x,
        startLayerY: y,
        startRotation: getRotation(),
        startAngle: angle,
        mode: 'rotate',
      };
      setRotating(true);
    } else {
      dragRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startLayerX: x,
        startLayerY: y,
        startRotation: getRotation(),
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
      onChange({ x: newX, y: newY } as Partial<Layer>);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
      let delta = angle - startAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      onChange({ rotation: startRotation + delta } as Partial<Layer>);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    setDragging(false);
    setRotating(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const current = getScale();
    const delta = -e.deltaY * 0.002;
    const next = Math.max(0.05, Math.min(8, current + delta));
    onChange({ scaleX: next, scaleY: next } as Partial<Layer>);
  };

  let cursor = 'grab';
  if (dragging) cursor = rotating ? 'alias' : 'grabbing';

  return (
    <div
      className="node-drag-overlay nodrag nopan nowheel"
      style={{ position: 'absolute', inset: 0, zIndex: 2, cursor, touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
    />
  );
}

export const LayerPreviewSurface = memo(function LayerPreviewSurface({
  layer,
  previewTargetId,
  primitiveViewState,
  primitiveRenderMode,
  selected,
}: LayerPreviewSurfaceProps) {
  const { graph } = useNodeCanvasPreview();
  const { openGallery, updatePrimitiveView, updateLayer, setPrimitiveViewportActive } = useNodeCanvasActions();
  const [hovered, setHovered] = useState(false);
  const primitiveBgPreviewTargetId = useMemo(
    () => layer.kind === 'primitive'
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
    const primitiveFrameScaleX = layer.scaleX * PRIMITIVE_BOX_RATIO;
    const primitiveFrameScaleY = layer.scaleY * PRIMITIVE_BOX_RATIO;

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
        className="node-preview-surface nodrag nopan"
        onMouseEnter={() => {
          setHovered(true);
          if (selected) setPrimitiveViewportActive(layer.id, true);
        }}
        onMouseLeave={() => {
          setHovered(false);
          if (selected) setPrimitiveViewportActive(layer.id, false);
        }}
      >
        <div style={{ position: 'relative', display: 'inline-block' }}>
          {primitiveBgPreviewTargetId ? (
            <NodeThumbnail previewTargetId={primitiveBgPreviewTargetId} />
          ) : (
            <div className="node-thumbnail node-thumbnail-primitive">
              <div className="node-thumbnail-frame" style={{ width: THUMB_SIZE, height: THUMB_SIZE }} />
            </div>
          )}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                transform: `translate(${(layer.x - 0.5) * 100}%, ${(layer.y - 0.5) * 100}%) rotate(${layer.rotation}deg) scale(${primitiveFrameScaleX}, ${primitiveFrameScaleY})`,
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
                onRotationCommit={(rotX, rotY) => updateLayer(layer.id, { tiltX: rotX, tiltY: rotY } as Partial<Layer>)}
                className="node-primitive-preview node-primitive-preview-transparent"
              />
            </div>
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
          <NodeThumbnail previewTargetId={previewTargetId} />
          {isDraggable && (
            <DragTransformOverlay
              layer={layer}
              onChange={(patch) => updateLayer(layer.id, patch)}
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
