import { memo, useEffect, useRef, useState } from 'react';

import type { GraphTransformNode } from '../../../types/config';
import { alphaBoundsCenter, measureVisibleAlphaBounds } from '../../../utils/render/alphaBounds';
import { useNodeCanvasPreview } from '../context';
import { stopNodeGestureEvent } from '../helpers';
import type { TransformNodePatch } from '../nodes/useTransformNodeDraft';
import { EmptyThumbnailFrame } from './LiveMediaOverlay';
import { NodeThumbnail } from './NodeThumbnail';
import { getNodePreviewSize } from './previewSizing';
import { useNativeTransformWheel } from './useNativeTransformWheel';

type TransformDragMode = 'translate' | 'rotate' | 'scale';

interface TransformPreviewSurfaceProps {
  transformNode: GraphTransformNode;
  previewTargetId: string;
  sourcePreviewTargetId: string | null;
  selected: boolean;
  transformActive?: boolean;
  onTransformDraft?: (patch: TransformNodePatch) => void;
  onTransformCommit?: () => void;
  onTransformWheelDelta?: (deltaY: number) => void;
}

interface TransformDragState {
  mode: TransformDragMode;
  pivot: TransformPivot;
  startClientX: number;
  startClientY: number;
  startNodeX: number;
  startNodeY: number;
  startScaleX: number;
  startScaleY: number;
  startRotation: number;
  startAngle: number;
  startDistance: number;
}

interface TransformPivot {
  x: number;
  y: number;
}

type TransformPreviewModel =
  | { kind: 'thumbnail' }
  | { kind: 'empty' }
  | { kind: 'live'; sourcePreviewTargetId: string; canInteract: boolean };

const CENTER_PIVOT: TransformPivot = { x: 50, y: 50 };

function pivotClientPoint(rect: DOMRect, pivot: TransformPivot) {
  return {
    x: rect.left + (rect.width * pivot.x) / 100,
    y: rect.top + (rect.height * pivot.y) / 100,
  };
}

function pointerAngleFromElement(e: React.PointerEvent<HTMLDivElement>, pivot: TransformPivot) {
  const rect = e.currentTarget.getBoundingClientRect();
  const center = pivotClientPoint(rect, pivot);
  return Math.atan2(e.clientY - center.y, e.clientX - center.x) * (180 / Math.PI);
}

function pointerDistanceFromElement(e: React.PointerEvent<HTMLDivElement>, pivot: TransformPivot) {
  const rect = e.currentTarget.getBoundingClientRect();
  const center = pivotClientPoint(rect, pivot);
  return Math.max(1, Math.hypot(e.clientX - center.x, e.clientY - center.y));
}

function isScaleHandle(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-transform-scale-handle]'));
}

function dragModeForEvent(e: React.PointerEvent<HTMLDivElement>): TransformDragMode {
  if (isScaleHandle(e.target)) return 'scale';
  return e.shiftKey ? 'rotate' : 'translate';
}

function createDragState(
  e: React.PointerEvent<HTMLDivElement>,
  node: GraphTransformNode,
  pivot: TransformPivot,
): TransformDragState {
  const mode = dragModeForEvent(e);
  return {
    mode,
    pivot,
    startClientX: e.clientX,
    startClientY: e.clientY,
    startNodeX: node.x,
    startNodeY: node.y,
    startScaleX: node.scaleX,
    startScaleY: node.scaleY,
    startRotation: node.rotation,
    startAngle: mode === 'rotate' ? pointerAngleFromElement(e, pivot) : 0,
    startDistance: mode === 'scale' ? pointerDistanceFromElement(e, pivot) : 1,
  };
}

function translatePatch(e: React.PointerEvent<HTMLDivElement>, drag: TransformDragState): TransformNodePatch {
  const rect = e.currentTarget.getBoundingClientRect();
  const frameWidth = Math.max(1, rect.width);
  const frameHeight = Math.max(1, rect.height);
  return {
    x: drag.startNodeX + ((e.clientX - drag.startClientX) / frameWidth) * 100,
    y: drag.startNodeY + ((e.clientY - drag.startClientY) / frameHeight) * 100,
  };
}

function rotationPatch(e: React.PointerEvent<HTMLDivElement>, drag: TransformDragState): TransformNodePatch {
  const angle = pointerAngleFromElement(e, drag.pivot);
  let delta = angle - drag.startAngle;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return { rotation: drag.startRotation + delta };
}

function scalePatch(e: React.PointerEvent<HTMLDivElement>, drag: TransformDragState): TransformNodePatch {
  const ratio = pointerDistanceFromElement(e, drag.pivot) / drag.startDistance;
  return {
    scaleX: drag.startScaleX * ratio,
    scaleY: drag.startScaleY * ratio,
  };
}

function transformPatchForDrag(e: React.PointerEvent<HTMLDivElement>, drag: TransformDragState): TransformNodePatch {
  if (drag.mode === 'rotate') return rotationPatch(e, drag);
  if (drag.mode === 'scale') return scalePatch(e, drag);
  return translatePatch(e, drag);
}

function transformBranchStyle(node: GraphTransformNode, pivot: TransformPivot) {
  return {
    left: `${50 + node.x}%`,
    top: `${50 + node.y}%`,
    opacity: Math.max(0, Math.min(1, node.opacity / 100)),
    transformOrigin: `${pivot.x}% ${pivot.y}%`,
    transform: `translate(-50%, -50%) rotate(${node.rotation}deg) scale(${node.scaleX / 100}, ${node.scaleY / 100})`,
  };
}

function transformCursor(mode: TransformDragMode | null, dragging: boolean) {
  if (mode === 'scale') return 'nwse-resize';
  if (mode === 'rotate') return 'alias';
  return dragging ? 'grabbing' : 'grab';
}

function TransformGestureOverlay({
  transformNode,
  pivot,
  onChange,
  onCommit,
}: {
  transformNode: GraphTransformNode;
  pivot: TransformPivot;
  onChange: (patch: TransformNodePatch) => void;
  onCommit: () => void;
}) {
  const dragRef = useRef<TransformDragState | null>(null);

  const endGesture = (e: React.PointerEvent<HTMLDivElement>) => {
    stopNodeGestureEvent(e);
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    e.currentTarget.style.cursor = transformCursor(null, false);
    onCommit();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    stopNodeGestureEvent(e);
    const drag = createDragState(e, transformNode, pivot);
    dragRef.current = drag;
    e.currentTarget.style.cursor = transformCursor(drag.mode, true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    stopNodeGestureEvent(e);
    if (!dragRef.current) return;
    onChange(transformPatchForDrag(e, dragRef.current));
  };

  return (
    <div
      className="node-transform-gesture-overlay nodrag nopan nowheel"
      onClickCapture={stopNodeGestureEvent}
      onDoubleClickCapture={stopNodeGestureEvent}
      onPointerDownCapture={handlePointerDown}
      onPointerMoveCapture={handlePointerMove}
      onPointerUpCapture={endGesture}
      onPointerCancelCapture={endGesture}
    >
      <span className="node-transform-scale-handle" data-transform-scale-handle aria-hidden="true" />
    </div>
  );
}

function useTransformLivePivot(
  rootRef: React.RefObject<HTMLDivElement | null>,
  pivotMode: GraphTransformNode['pivotMode'],
  active: boolean,
) {
  const [pivot, setPivot] = useState(CENTER_PIVOT);
  const useVisiblePivot = active && (pivotMode ?? 'canvas') === 'visible';

  useEffect(() => {
    if (!useVisiblePivot) return undefined;

    const update = () => {
      const canvas = rootRef.current?.querySelector<HTMLCanvasElement>('.node-transform-live-branch canvas');
      const next = canvas ? canvasVisibleAlphaPivot(canvas) : CENTER_PIVOT;
      setPivot((current) => (samePivot(current, next) ? current : next));
    };
    const frame = window.requestAnimationFrame(update);
    const interval = window.setInterval(update, 180);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
    };
  }, [rootRef, useVisiblePivot]);

  return useVisiblePivot ? pivot : CENTER_PIVOT;
}

function samePivot(a: TransformPivot, b: TransformPivot) {
  return Math.abs(a.x - b.x) < 0.1 && Math.abs(a.y - b.y) < 0.1;
}

function canvasVisibleAlphaPivot(canvas: HTMLCanvasElement): TransformPivot {
  if (canvas.width <= 0 || canvas.height <= 0) return CENTER_PIVOT;
  const bounds = measureVisibleAlphaBounds(canvas);
  if (!bounds) return CENTER_PIVOT;
  const center = alphaBoundsCenter(bounds);
  return {
    x: (center.x / canvas.width) * 100,
    y: (center.y / canvas.height) * 100,
  };
}

function transformPreviewModel(
  selected: boolean,
  transformActive: boolean,
  sourcePreviewTargetId: string | null,
): TransformPreviewModel {
  const showLivePreview = selected || transformActive;
  if (!showLivePreview) return { kind: 'thumbnail' };
  return sourcePreviewTargetId ? { kind: 'live', sourcePreviewTargetId, canInteract: selected } : { kind: 'empty' };
}

function transformPreviewIsLive(model: TransformPreviewModel) {
  return model.kind !== 'thumbnail';
}

function transformPreviewCanInteract(model: TransformPreviewModel) {
  return model.kind === 'live' && model.canInteract;
}

export const TransformPreviewSurface = memo(function TransformPreviewSurface({
  transformNode,
  previewTargetId,
  sourcePreviewTargetId,
  selected,
  transformActive = false,
  onTransformDraft,
  onTransformCommit,
  onTransformWheelDelta,
}: TransformPreviewSurfaceProps) {
  const { doc } = useNodeCanvasPreview();
  const previewSize = getNodePreviewSize(doc.global.aspect);
  const rootRef = useRef<HTMLDivElement>(null);
  const model = transformPreviewModel(selected, transformActive, sourcePreviewTargetId);
  const pivot = useTransformLivePivot(rootRef, transformNode.pivotMode, transformPreviewIsLive(model));
  useNativeTransformWheel(rootRef, transformPreviewCanInteract(model), onTransformWheelDelta);

  if (model.kind === 'thumbnail') return <NodeThumbnail previewTargetId={previewTargetId} priority={selected} />;
  if (model.kind === 'empty') return <EmptyThumbnailFrame label="Connect source" />;

  return (
    <div
      ref={rootRef}
      className="node-thumbnail node-transform-preview-surface nodrag nopan nowheel"
      style={{ minHeight: previewSize.display.height }}
    >
      <div
        className="node-thumbnail-frame node-transform-live-frame checkerboard-surface"
        style={{
          width: previewSize.display.width,
          height: previewSize.display.height,
        }}
      >
        <div className="node-transform-live-branch" style={transformBranchStyle(transformNode, pivot)}>
          <NodeThumbnail previewTargetId={model.sourcePreviewTargetId} priority={selected} />
        </div>
        <TransformGestureControl
          active={model.canInteract}
          transformNode={transformNode}
          pivot={pivot}
          onTransformDraft={onTransformDraft}
          onTransformCommit={onTransformCommit}
        />
      </div>
    </div>
  );
});

function TransformGestureControl({
  active,
  transformNode,
  pivot,
  onTransformDraft,
  onTransformCommit,
}: {
  active: boolean;
  transformNode: GraphTransformNode;
  pivot: TransformPivot;
  onTransformDraft?: (patch: TransformNodePatch) => void;
  onTransformCommit?: () => void;
}) {
  if (!active || !onTransformDraft || !onTransformCommit) return null;
  return (
    <TransformGestureOverlay
      transformNode={transformNode}
      pivot={pivot}
      onChange={onTransformDraft}
      onCommit={onTransformCommit}
    />
  );
}
