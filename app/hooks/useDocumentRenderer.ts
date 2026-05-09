import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { CanvasDocument } from '../types/config';
import { renderDocument } from '../utils/renderer';

interface Options {
  /** While true, renderer skips GPU effect passes for fast pointer feedback. */
  fast?: boolean;
}

export function useDocumentRenderer(
  doc: CanvasDocument,
  imageCache: Map<string, HTMLImageElement>,
  pw: number,
  ph: number,
  options: Options = {},
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderingRef = useRef(false);
  const pendingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const docRef = useRef(doc);
  const imageCacheRef = useRef(imageCache);
  const pwRef = useRef(pw);
  const phRef = useRef(ph);
  const fastRef = useRef(options.fast ?? false);

  useEffect(() => {
    docRef.current = doc;
    imageCacheRef.current = imageCache;
    pwRef.current = pw;
    phRef.current = ph;
    fastRef.current = options.fast ?? false;
  }, [doc, imageCache, pw, ph, options.fast]);

  const doRender = useCallback(function renderNow() {
    if (renderingRef.current) {
      pendingRef.current = true;
      return;
    }

    renderingRef.current = true;
    renderDocument(docRef.current, pwRef.current, phRef.current, imageCacheRef.current, {
      skipEffects: fastRef.current,
    })
      .then((result) => {
        renderingRef.current = false;
        const displayCanvas = canvasRef.current;
        if (displayCanvas) {
          const ctx = displayCanvas.getContext('2d')!;
          ctx.clearRect(0, 0, pwRef.current, phRef.current);
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

  // Coalesce multiple state changes within a frame into one render call.
  const scheduleRender = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      doRender();
    });
  }, [doRender]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (canvasRef.current && container.contains(canvasRef.current)) {
      container.removeChild(canvasRef.current);
    }

    const canvas = document.createElement('canvas');
    canvas.width = pw;
    canvas.height = ph;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);
    canvasRef.current = canvas;

    scheduleRender();

    return () => {
      canvasRef.current = null;
      if (container.contains(canvas)) container.removeChild(canvas);
    };
  }, [pw, ph, scheduleRender]);

  useEffect(() => {
    scheduleRender();
  }, [doc, imageCache, options.fast, scheduleRender]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  return containerRef;
}
