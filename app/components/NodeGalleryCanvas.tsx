import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { CanvasDocument, CanvasGraph, ImageLayer, Layer, TextLayer } from '../types/config';
import { ASPECT_SIZES } from '../types/config';
import { EXPORT_NODE_ID } from '../utils/nodeGraph';
import { renderDocument, renderGraphTarget } from '../utils/renderer';
import { CanvasHandles } from './CanvasHandles';
import { defaultMediaViewState, type MediaViewState } from './NodeGalleryViewState';

interface Props {
  doc: CanvasDocument;
  graph: CanvasGraph;
  imageCache: Map<string, HTMLImageElement>;
  previewTargetId: string;
  layer: Layer;
  viewState: MediaViewState;
  onViewStateChange: (viewState: MediaViewState) => void;
  onLayerUpdate?: (patch: Partial<TextLayer | ImageLayer>) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function NodeGalleryCanvas({
  doc,
  graph,
  imageCache,
  previewTargetId,
  layer,
  viewState,
  onViewStateChange,
  onLayerUpdate,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; startView: MediaViewState } | null>(null);
  const viewStateRef = useRef(viewState);
  const canvasSize = useMemo(() => {
    const [aspectWidth, aspectHeight] = ASPECT_SIZES[doc.global.aspect ?? '1:1'];
    const maxEdge = 960;
    const scale = maxEdge / Math.max(aspectWidth, aspectHeight);
    return {
      width: Math.max(1, Math.round(aspectWidth * scale)),
      height: Math.max(1, Math.round(aspectHeight * scale)),
    };
  }, [doc.global.aspect]);

  useLayoutEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const { width, height } = canvasSize;

    let cancelled = false;

    const render = async () => {
      const effectiveImageCache = new Map(imageCache);
      const result = previewTargetId === EXPORT_NODE_ID
        ? await renderDocument({ ...doc, graph }, width, height, effectiveImageCache, { graphMode: 'graph' })
        : await renderGraphTarget({ ...doc, graph }, graph, previewTargetId, width, height, effectiveImageCache);
      if (cancelled || !canvasRef.current) return;
      canvasRef.current.width = width;
      canvasRef.current.height = height;
      const context = canvasRef.current.getContext('2d');
      if (!context) return;
      context.clearRect(0, 0, width, height);
      context.drawImage(result, 0, 0, width, height);
    };

    void render();
    return () => {
      cancelled = true;
    };
  }, [canvasSize, doc, graph, imageCache, previewTargetId]);

  const commitView = (next: MediaViewState) => {
    viewStateRef.current = next;
    onViewStateChange(next);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    commitView({
      ...viewStateRef.current,
      zoom: clamp(viewStateRef.current.zoom + (-event.deltaY * 0.0014), 0.75, 3),
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target instanceof SVGElement) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startView: viewStateRef.current,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    commitView({
      ...drag.startView,
      offsetX: drag.startView.offsetX + (event.clientX - drag.startX),
      offsetY: drag.startView.offsetY + (event.clientY - drag.startY),
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.stopPropagation();
  };

  const interactiveLayer = layer.kind === 'text' || layer.kind === 'image' ? layer : null;

  return (
    <div
      className="node-gallery-canvas-shell node-interactive-viewport"
      tabIndex={0}
      role="group"
      aria-roledescription="interactive viewport"
      aria-label={`${layer.name} preview. Arrow keys pan, plus or minus zoom, Home resets the view.`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={(event) => {
        const next = { ...viewStateRef.current };
        const panStep = 28;
        const zoomStep = 0.14;
        let changed = false;

        switch (event.key) {
          case 'ArrowUp':
            next.offsetY -= panStep;
            changed = true;
            break;
          case 'ArrowDown':
            next.offsetY += panStep;
            changed = true;
            break;
          case 'ArrowLeft':
            next.offsetX -= panStep;
            changed = true;
            break;
          case 'ArrowRight':
            next.offsetX += panStep;
            changed = true;
            break;
          case '+':
          case '=':
            next.zoom = clamp(next.zoom + zoomStep, 0.75, 3);
            changed = true;
            break;
          case '-':
          case '_':
            next.zoom = clamp(next.zoom - zoomStep, 0.75, 3);
            changed = true;
            break;
          case 'Home':
            Object.assign(next, defaultMediaViewState());
            changed = true;
            break;
          default:
            break;
        }

        if (!changed) return;
        event.preventDefault();
        event.stopPropagation();
        commitView(next);
      }}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div
        ref={stageRef}
        className="node-gallery-canvas-stage"
        style={{ transform: `translate(-50%, -50%) translate(${viewState.offsetX}px, ${viewState.offsetY}px) scale(${viewState.zoom})` }}
      >
        <canvas ref={canvasRef} className="node-gallery-canvas" />
        {interactiveLayer && onLayerUpdate && canvasSize.width > 0 && canvasSize.height > 0 && (
          <CanvasHandles
            layer={interactiveLayer}
            canvasW={canvasSize.width}
            canvasH={canvasSize.height}
            imageCache={imageCache}
            onChange={(updated) => onLayerUpdate(updated)}
          />
        )}
      </div>
    </div>
  );
}
