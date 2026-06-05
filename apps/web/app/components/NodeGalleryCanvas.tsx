import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { CanvasDocument, CanvasGraph, ImageLayer, Layer, TextLayer } from '../types/config';
import { ASPECT_SIZES } from '../types/config';
import { imageCacheSignature } from '../utils/imageCacheSignature';
import { collectUpstreamNodeIds, EXPORT_NODE_ID } from '../utils/nodeGraph';
import { preloadImageSources } from '../utils/preloadImageSources';
import { type GraphRenderCache, renderDocument, renderGraphTarget } from '../utils/renderer';
import { CanvasHandles } from './CanvasHandles';
import { defaultMediaViewState, type MediaViewState } from './NodeGalleryViewState';

const GALLERY_GRAPH_RENDER_CACHE_LIMIT = 96;
const galleryGraphRenderCache = new Map<string, Promise<HTMLCanvasElement>>();

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

function galleryCanvasSize(doc: CanvasDocument) {
  const [aspectWidth, aspectHeight] = ASPECT_SIZES[doc.global.aspect ?? '1:1'];
  const maxEdge = 960;
  const scale = maxEdge / Math.max(aspectWidth, aspectHeight);
  return {
    width: Math.max(1, Math.round(aspectWidth * scale)),
    height: Math.max(1, Math.round(aspectHeight * scale)),
  };
}

function galleryRenderSessionKey(
  doc: CanvasDocument,
  graph: CanvasGraph,
  imageCache: Map<string, HTMLImageElement>,
  previewTargetId: string,
  canvasSize: { width: number; height: number },
) {
  const imageLayers = doc.layers.filter((item): item is ImageLayer => item.kind === 'image');
  return [
    previewTargetId,
    `${canvasSize.width}x${canvasSize.height}`,
    doc.global.aspect,
    doc.global.bg,
    doc.global.seed,
    JSON.stringify(doc.layers),
    JSON.stringify(graph),
    imageCacheSignature(imageLayers, imageCache),
  ].join('::');
}

function upstreamGalleryNodeIds(doc: CanvasDocument, graph: CanvasGraph, previewTargetId: string) {
  return previewTargetId === EXPORT_NODE_ID
    ? new Set(doc.layers.map((item) => item.id))
    : collectUpstreamNodeIds(previewTargetId, graph);
}

function missingGalleryImageSources(
  doc: CanvasDocument,
  upstream: Set<string>,
  effectiveImageCache: Map<string, HTMLImageElement>,
) {
  return doc.layers
    .filter((item): item is ImageLayer => item.kind === 'image' && upstream.has(item.id))
    .map((item) => item.src)
    .filter((src) => !effectiveImageCache.has(src));
}

async function renderGalleryCanvas({
  doc,
  graph,
  imageCache,
  previewTargetId,
  renderSessionKey,
  width,
  height,
}: {
  doc: CanvasDocument;
  graph: CanvasGraph;
  imageCache: Map<string, HTMLImageElement>;
  previewTargetId: string;
  renderSessionKey: string;
  width: number;
  height: number;
}) {
  const effectiveImageCache = new Map(imageCache);
  const upstream = upstreamGalleryNodeIds(doc, graph, previewTargetId);
  const missingImageSrcs = missingGalleryImageSources(doc, upstream, effectiveImageCache);
  await preloadImageSources(missingImageSrcs, imageCache, effectiveImageCache);

  const graphRenderSessionCache: GraphRenderCache = {
    namespace: renderSessionKey,
    entries: galleryGraphRenderCache,
    limit: GALLERY_GRAPH_RENDER_CACHE_LIMIT,
  };
  const graphDoc = { ...doc, graph };
  return previewTargetId === EXPORT_NODE_ID
    ? renderDocument(
        graphDoc,
        width,
        height,
        effectiveImageCache,
        { effectResolution: { width, height }, graphMode: 'graph' },
        graphRenderSessionCache,
      )
    : renderGraphTarget(
        graphDoc,
        graph,
        previewTargetId,
        width,
        height,
        effectiveImageCache,
        { effectResolution: { width, height } },
        graphRenderSessionCache,
      );
}

const GALLERY_PAN_STEP = 28;
const GALLERY_ZOOM_STEP = 0.14;
const GALLERY_KEY_UPDATERS: Record<string, (current: MediaViewState) => MediaViewState> = {
  ArrowUp: (current) => ({ ...current, offsetY: current.offsetY - GALLERY_PAN_STEP }),
  ArrowDown: (current) => ({ ...current, offsetY: current.offsetY + GALLERY_PAN_STEP }),
  ArrowLeft: (current) => ({ ...current, offsetX: current.offsetX - GALLERY_PAN_STEP }),
  ArrowRight: (current) => ({ ...current, offsetX: current.offsetX + GALLERY_PAN_STEP }),
  '+': (current) => ({ ...current, zoom: clamp(current.zoom + GALLERY_ZOOM_STEP, 0.75, 3) }),
  '=': (current) => ({ ...current, zoom: clamp(current.zoom + GALLERY_ZOOM_STEP, 0.75, 3) }),
  '-': (current) => ({ ...current, zoom: clamp(current.zoom - GALLERY_ZOOM_STEP, 0.75, 3) }),
  _: (current) => ({ ...current, zoom: clamp(current.zoom - GALLERY_ZOOM_STEP, 0.75, 3) }),
  Home: () => defaultMediaViewState(),
};

function nextGalleryViewForKey(key: string, current: MediaViewState): MediaViewState | null {
  return GALLERY_KEY_UPDATERS[key]?.(current) ?? null;
}

function drawGalleryResult(canvas: HTMLCanvasElement, result: HTMLCanvasElement, width: number, height: number) {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, width, height);
  context.drawImage(result, 0, 0, width, height);
}

function hasPositiveGalleryCanvasSize(canvasSize: { width: number; height: number }) {
  return canvasSize.width > 0 && canvasSize.height > 0;
}

function isGalleryHandleLayer(layer: Layer): layer is TextLayer | ImageLayer {
  return layer.kind === 'text' || layer.kind === 'image';
}

function canRenderGalleryHandles(
  layer: Layer,
  onLayerUpdate: ((patch: Partial<TextLayer | ImageLayer>) => void) | undefined,
  canvasSize: { width: number; height: number },
): layer is TextLayer | ImageLayer {
  if (!onLayerUpdate) return false;
  if (!hasPositiveGalleryCanvasSize(canvasSize)) return false;
  return isGalleryHandleLayer(layer);
}

function NodeGalleryCanvasHandles({
  layer,
  canvasSize,
  imageCache,
  onLayerUpdate,
}: {
  layer: Layer;
  canvasSize: { width: number; height: number };
  imageCache: Map<string, HTMLImageElement>;
  onLayerUpdate?: (patch: Partial<TextLayer | ImageLayer>) => void;
}) {
  if (!canRenderGalleryHandles(layer, onLayerUpdate, canvasSize)) return null;
  return (
    <CanvasHandles
      layer={layer}
      canvasW={canvasSize.width}
      canvasH={canvasSize.height}
      imageCache={imageCache}
      onChange={(updated) => onLayerUpdate(updated)}
    />
  );
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
  const canvasSize = useMemo(() => galleryCanvasSize(doc), [doc]);
  const renderSessionKey = useMemo(
    () => galleryRenderSessionKey(doc, graph, imageCache, previewTargetId, canvasSize),
    [canvasSize, doc, graph, imageCache, previewTargetId],
  );

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
      const result = await renderGalleryCanvas({
        doc,
        graph,
        imageCache,
        previewTargetId,
        renderSessionKey,
        width,
        height,
      });
      if (cancelled) return;
      if (!canvasRef.current) return;
      drawGalleryResult(canvasRef.current, result, width, height);
    };

    void render();
    return () => {
      cancelled = true;
    };
  }, [canvasSize, doc, graph, imageCache, previewTargetId, renderSessionKey]);

  const commitView = (next: MediaViewState) => {
    viewStateRef.current = next;
    onViewStateChange(next);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    commitView({
      ...viewStateRef.current,
      zoom: clamp(viewStateRef.current.zoom + -event.deltaY * 0.0014, 0.75, 3),
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
        const next = nextGalleryViewForKey(event.key, viewStateRef.current);
        if (!next) return;
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
        style={{
          transform: `translate(-50%, -50%) translate(${viewState.offsetX}px, ${viewState.offsetY}px) scale(${viewState.zoom})`,
        }}
      >
        <canvas ref={canvasRef} className="node-gallery-canvas" />
        <NodeGalleryCanvasHandles
          layer={layer}
          canvasSize={canvasSize}
          imageCache={imageCache}
          onLayerUpdate={onLayerUpdate}
        />
      </div>
    </div>
  );
}
