import { useCallback } from 'react';
import type { CanvasDocument, ImageLayer, TextLayer } from '../types/config';
import { useDocumentRenderer } from '../hooks/useDocumentRenderer';
import { CanvasHandles } from './CanvasHandles';

const SCROLL_SCALE_SENSITIVITY = 0.002;

interface Props {
  doc: CanvasDocument;
  imageCache: Map<string, HTMLImageElement>;
  selectedLayerId: string | null;
  dragOver?: boolean;
  onLayerUpdate: (id: string, patch: Partial<TextLayer | ImageLayer>) => void;
  onSelectLayer: (id: string | null) => void;
}

export function CanvasPreview({
  doc,
  imageCache,
  selectedLayerId,
  dragOver,
  onLayerUpdate,
  onSelectLayer,
}: Props) {
  const containerRef = useDocumentRenderer(doc, imageCache);
  const selectedLayer = doc.layers.find((layer) => layer.id === selectedLayerId);
  const showHandles = selectedLayer && (selectedLayer.kind === 'text' || selectedLayer.kind === 'image');

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!selectedLayer || (selectedLayer.kind !== 'image' && selectedLayer.kind !== 'text')) return;
    e.preventDefault();
    const delta = -e.deltaY * SCROLL_SCALE_SENSITIVITY;
    const newScale = Math.max(0.05, selectedLayer.scaleX + delta);
    onLayerUpdate(selectedLayer.id, { scaleX: newScale, scaleY: newScale });
  }, [selectedLayer, onLayerUpdate]);

  return (
    <div className="canvas-wrapper flex-1 flex items-center justify-center min-h-0 w-full">
      <div
        className="canvas-area relative aspect-square h-full max-h-[min(100%,540px)] max-w-full flex items-center justify-center"
        onWheel={handleWheel}
      >
        <div
          ref={containerRef}
          className="pixi-container flex items-center justify-center w-full h-full"
          onClick={(e) => {
            if (e.target === e.currentTarget || e.target instanceof HTMLCanvasElement) onSelectLayer(null);
          }}
        />
        {showHandles && (
          <CanvasHandles
            layer={selectedLayer as TextLayer | ImageLayer}
            canvasSize={540}
            imageCache={imageCache}
            onChange={(updated) => onLayerUpdate(updated.id, updated)}
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
