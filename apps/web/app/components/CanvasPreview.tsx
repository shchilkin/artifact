import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDocumentRenderer } from '../hooks/useDocumentRenderer';
import type { CanvasDocument, ImageLayer, TextLayer } from '../types/config';
import { getPreviewDims } from '../types/config';
import { CanvasHandles } from './CanvasHandles';
import type { PrimitiveViewportState } from './PrimitiveViewportState';

const SCROLL_SCALE_SENSITIVITY = 0.002;
const PREVIEW_RENDER_SCALE = 2;
const PREVIEW_MAX_RENDER_DIMENSION = 1080;
const PREVIEW_DRAFT_RENDER_SCALE = 1;
const PREVIEW_DRAFT_MAX_RENDER_DIMENSION = 540;
const PREVIEW_FULL_RENDER_DELAY_MS = 240;
const PREVIEW_FULL_RENDER_IDLE_TIMEOUT_MS = 900;
const PREVIEW_DISPLAY_MAX_HEIGHT = 540;

interface Props {
  doc: CanvasDocument;
  imageCache: Map<string, HTMLImageElement>;
  selectedLayerId: string | null;
  primitiveViewStates?: Record<string, PrimitiveViewportState>;
  dropPreview?: 'document' | 'file' | 'image' | null;
  onLayerUpdate: (id: string, patch: Partial<TextLayer | ImageLayer>) => void;
  onSelectLayer: (id: string | null) => void;
}

export function CanvasPreview({
  doc,
  imageCache,
  selectedLayerId,
  primitiveViewStates,
  dropPreview,
  onLayerUpdate,
  onSelectLayer,
}: Props) {
  const [pw, ph] = getPreviewDims(doc.global.aspect ?? '1:1');
  const viewStateCacheKey = useMemo(() => primitiveViewStatesSignature(primitiveViewStates), [primitiveViewStates]);
  const { frameRef, previewSize } = useContainedPreviewSize(pw, ph);
  const { containerRef } = useDocumentRenderer(doc, imageCache, pw, ph, {
    graphMode: doc.graph ? 'graph' : 'stack',
    primitiveViewStates,
    cacheKey: `layer-preview:${viewStateCacheKey}`,
    renderScale: PREVIEW_RENDER_SCALE,
    maxRenderDimension: PREVIEW_MAX_RENDER_DIMENSION,
    draftRenderScale: PREVIEW_DRAFT_RENDER_SCALE,
    draftMaxRenderDimension: PREVIEW_DRAFT_MAX_RENDER_DIMENSION,
    deferFullRender: true,
    deferredPreviewQuality: 'full',
    deferredFullRenderMs: PREVIEW_FULL_RENDER_DELAY_MS,
    deferredFullRenderTimeoutMs: PREVIEW_FULL_RENDER_IDLE_TIMEOUT_MS,
  });
  const selectedLayer = doc.layers.find((layer) => layer.id === selectedLayerId);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!isTransformablePreviewLayer(selectedLayer)) return;
      e.preventDefault();
      const delta = -e.deltaY * SCROLL_SCALE_SENSITIVITY;
      const newScale = Math.max(0.05, selectedLayer.scaleX + delta);
      onLayerUpdate(selectedLayer.id, { scaleX: newScale, scaleY: newScale });
    },
    [selectedLayer, onLayerUpdate],
  );
  const canvasAreaStyle = useMemo(
    () => ({
      aspectRatio: `${pw} / ${ph}`,
      ...(previewSize
        ? { width: `${previewSize.width}px`, height: `${previewSize.height}px` }
        : { width: 'min(100%, 540px)' }),
    }),
    [ph, previewSize, pw],
  );

  return (
    <div ref={frameRef} className="canvas-wrapper flex-1 flex items-center justify-center min-h-0 w-full">
      <div
        className="canvas-area relative max-w-full flex items-center justify-center"
        style={canvasAreaStyle}
        onWheel={handleWheel}
      >
        <div
          ref={containerRef}
          className="pixi-container checkerboard-surface flex items-center justify-center w-full h-full"
          onClick={(event) => handleCanvasPreviewSurfaceClick(event, onSelectLayer)}
        />
        <CanvasPreviewHandles
          selectedLayer={selectedLayer}
          canvasW={pw}
          canvasH={ph}
          imageCache={imageCache}
          onLayerUpdate={onLayerUpdate}
        />
        <CanvasPreviewDropOverlay dropPreview={dropPreview} />
      </div>
    </div>
  );
}

function primitiveViewStatesSignature(viewStates: Record<string, PrimitiveViewportState> | undefined) {
  if (!viewStates) return 'none';
  const entries = Object.entries(viewStates);
  if (entries.length === 0) return 'none';
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, viewState]) =>
      [
        id,
        viewState.rotationX,
        viewState.rotationY,
        viewState.zoom,
        viewState.panX,
        viewState.panY,
        viewState.locked ? 1 : 0,
      ].join(':'),
    )
    .join('|');
}

function useContainedPreviewSize(width: number, height: number) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const updateSize = () => {
      const bounds = frame.getBoundingClientRect();
      const maxWidth = bounds.width;
      const maxHeight = Math.min(bounds.height, PREVIEW_DISPLAY_MAX_HEIGHT);
      if (maxWidth <= 0 || maxHeight <= 0) return;

      const aspect = width / Math.max(1, height);
      let nextWidth = maxWidth;
      let nextHeight = nextWidth / aspect;
      if (nextHeight > maxHeight) {
        nextHeight = maxHeight;
        nextWidth = nextHeight * aspect;
      }

      setPreviewSize((current) => {
        if (current && Math.abs(current.width - nextWidth) < 0.5 && Math.abs(current.height - nextHeight) < 0.5) {
          return current;
        }
        return { width: nextWidth, height: nextHeight };
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(frame);
    window.addEventListener('resize', updateSize);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [height, width]);

  return { frameRef, previewSize };
}

function isTransformablePreviewLayer(
  layer: CanvasDocument['layers'][number] | undefined,
): layer is TextLayer | ImageLayer {
  return layer?.kind === 'text' || layer?.kind === 'image';
}

function handleCanvasPreviewSurfaceClick(
  event: React.MouseEvent<HTMLDivElement>,
  onSelectLayer: (id: string | null) => void,
) {
  if (event.target === event.currentTarget || event.target instanceof HTMLCanvasElement) onSelectLayer(null);
}

function CanvasPreviewHandles({
  selectedLayer,
  canvasW,
  canvasH,
  imageCache,
  onLayerUpdate,
}: {
  selectedLayer: CanvasDocument['layers'][number] | undefined;
  canvasW: number;
  canvasH: number;
  imageCache: Map<string, HTMLImageElement>;
  onLayerUpdate: Props['onLayerUpdate'];
}) {
  if (!isTransformablePreviewLayer(selectedLayer)) return null;
  return (
    <CanvasHandles
      layer={selectedLayer}
      canvasW={canvasW}
      canvasH={canvasH}
      imageCache={imageCache}
      onChange={(updated) => onLayerUpdate(updated.id, updated)}
    />
  );
}

function CanvasPreviewDropOverlay({ dropPreview }: { dropPreview?: Props['dropPreview'] }) {
  if (!dropPreview) return null;
  const copy = {
    document: {
      label: 'Review Artifact',
      body: 'Drop to inspect before opening.',
    },
    file: {
      label: 'Review File',
      body: 'Images import as layers. Artifact files ask first.',
    },
    image: {
      label: 'Drop Image',
      body: 'Adds a new image layer.',
    },
  }[dropPreview];
  return (
    <div className="canvas-drop-overlay">
      <span>{copy.label}</span>
      <small>{copy.body}</small>
    </div>
  );
}
