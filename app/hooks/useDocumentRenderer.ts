import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Renderer } from 'pixi.js';
import type { CanvasDocument } from '../types/config';
import { renderDocument } from '../utils/renderer';

const SIZE = 540;

export function useDocumentRenderer(
  doc: CanvasDocument,
  imageCache: Map<string, HTMLImageElement>,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const renderingRef = useRef(false);
  const pendingRef = useRef(false);
  const docRef = useRef(doc);
  const imageCacheRef = useRef(imageCache);

  useEffect(() => {
    docRef.current = doc;
    imageCacheRef.current = imageCache;
  }, [doc, imageCache]);

  const doRender = useCallback(function renderNow() {
    if (renderingRef.current) {
      pendingRef.current = true;
      return;
    }

    renderingRef.current = true;
    renderDocument(docRef.current, SIZE, SIZE, imageCacheRef.current, rendererRef.current ?? undefined)
      .then((result) => {
        renderingRef.current = false;
        const displayCanvas = canvasRef.current;
        if (displayCanvas) {
          const ctx = displayCanvas.getContext('2d')!;
          ctx.clearRect(0, 0, SIZE, SIZE);
          ctx.drawImage(result, 0, 0);
        }
        if (pendingRef.current) {
          pendingRef.current = false;
          renderNow();
        }
      })
      .catch(() => {
        renderingRef.current = false;
        if (pendingRef.current) {
          pendingRef.current = false;
          renderNow();
        }
      });
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);
    canvasRef.current = canvas;

    try {
      rendererRef.current = new Renderer({
        width: SIZE,
        height: SIZE,
        backgroundAlpha: 0,
        antialias: false,
      });
    } catch {
      rendererRef.current = null;
    }

    doRender();

    return () => {
      rendererRef.current?.destroy(true);
      rendererRef.current = null;
      canvasRef.current = null;
      if (container.contains(canvas)) container.removeChild(canvas);
    };
  }, [doRender]);

  useEffect(() => {
    doRender();
  }, [doc, imageCache, doRender]);

  return containerRef;
}
