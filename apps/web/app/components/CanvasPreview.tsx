import { useCallback } from 'react';
import { useDocumentRenderer } from '../hooks/useDocumentRenderer';
import type { CanvasDocument, ImageLayer, TextLayer } from '../types/config';
import { getPreviewDims } from '../types/config';
import { CanvasHandles } from './CanvasHandles';

const SCROLL_SCALE_SENSITIVITY = 0.002;
const PREVIEW_RENDER_SCALE = 2;
const PREVIEW_MAX_RENDER_DIMENSION = 1080;
const PREVIEW_DRAFT_RENDER_SCALE = 1;
const PREVIEW_DRAFT_MAX_RENDER_DIMENSION = 540;
const PREVIEW_FULL_RENDER_DELAY_MS = 240;
const PREVIEW_FULL_RENDER_IDLE_TIMEOUT_MS = 900;

interface Props {
  doc: CanvasDocument;
  imageCache: Map<string, HTMLImageElement>;
  selectedLayerId: string | null;
  dragOver?: boolean;
  onLayerUpdate: (id: string, patch: Partial<TextLayer | ImageLayer>) => void;
  onSelectLayer: (id: string | null) => void;
}

export function CanvasPreview({ doc, imageCache, selectedLayerId, dragOver, onLayerUpdate, onSelectLayer }: Props) {
  const [pw, ph] = getPreviewDims(doc.global.aspect ?? '1:1');
  const { containerRef } = useDocumentRenderer(doc, imageCache, pw, ph, {
    graphMode: doc.graph ? 'graph' : 'stack',
    cacheKey: 'layer-preview',
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

  return (
    <div className="canvas-wrapper flex-1 flex items-center justify-center min-h-0 w-full">
      <div
        className="canvas-area relative h-full max-h-[min(100%,540px)] max-w-full flex items-center justify-center"
        style={{ aspectRatio: `${pw} / ${ph}` }}
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
        <CanvasPreviewDropOverlay dragOver={dragOver} />
      </div>
    </div>
  );
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

function CanvasPreviewDropOverlay({ dragOver }: { dragOver?: boolean }) {
  if (!dragOver) return null;
  return (
    <div className="canvas-drop-overlay">
      <span>Drop Image</span>
    </div>
  );
}
