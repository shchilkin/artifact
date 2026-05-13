import { useCallback, useEffect, useRef, useState } from 'react';
import { useDocumentRenderer } from '../hooks/useDocumentRenderer';
import type { CanvasDocument, ImageLayer, TextLayer } from '../types/config';
import { getPreviewDims } from '../types/config';
import { CanvasHandles } from './CanvasHandles';

const SCROLL_SCALE_SENSITIVITY = 0.002;
const FAST_PATH_RELEASE_MS = 180;
const PREVIEW_RENDER_SCALE = 2;
const PREVIEW_MAX_RENDER_DIMENSION = 1080;

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
  const [fast, setFast] = useState(false);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { containerRef } = useDocumentRenderer(doc, imageCache, pw, ph, {
    fast,
    graphMode: 'stack',
    cacheKey: 'layer-preview',
    renderScale: PREVIEW_RENDER_SCALE,
    maxRenderDimension: PREVIEW_MAX_RENDER_DIMENSION,
  });
  const selectedLayer = doc.layers.find((layer) => layer.id === selectedLayerId);
  const showHandles = selectedLayer && (selectedLayer.kind === 'text' || selectedLayer.kind === 'image');

  const enterFast = useCallback(() => {
    if (releaseTimerRef.current) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
    setFast(true);
  }, []);

  // After pointer-up, hold the fast path briefly so the final committed state
  // renders in skip-effects mode for one frame, then snap to full quality.
  // Prevents a heavy GPU pass from queueing while the cursor is still settling.
  const exitFast = useCallback(() => {
    if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = setTimeout(() => {
      releaseTimerRef.current = null;
      setFast(false);
    }, FAST_PATH_RELEASE_MS);
  }, []);

  useEffect(
    () => () => {
      if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
    },
    [],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!selectedLayer || (selectedLayer.kind !== 'image' && selectedLayer.kind !== 'text')) return;
      e.preventDefault();
      const delta = -e.deltaY * SCROLL_SCALE_SENSITIVITY;
      const newScale = Math.max(0.05, selectedLayer.scaleX + delta);
      enterFast();
      exitFast();
      onLayerUpdate(selectedLayer.id, { scaleX: newScale, scaleY: newScale });
    },
    [selectedLayer, onLayerUpdate, enterFast, exitFast],
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
          onClick={(e) => {
            if (e.target === e.currentTarget || e.target instanceof HTMLCanvasElement) onSelectLayer(null);
          }}
        />
        {showHandles && (
          <CanvasHandles
            layer={selectedLayer as TextLayer | ImageLayer}
            canvasW={pw}
            canvasH={ph}
            imageCache={imageCache}
            onChange={(updated) => onLayerUpdate(updated.id, updated)}
            onDragStart={enterFast}
            onDragEnd={exitFast}
          />
        )}
        {dragOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 border-2 border-dashed border-accent pointer-events-none z-10">
            <span className="font-mono text-accent text-xs tracking-[4px] uppercase">Drop Image</span>
          </div>
        )}
      </div>
    </div>
  );
}
