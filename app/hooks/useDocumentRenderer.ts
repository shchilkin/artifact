import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { CanvasDocument } from '../types/config';
import { renderDocument } from '../utils/renderer';

const DRAFT_SETTLE_MS = 120;

interface Options {
  /** While true, renderer skips GPU effect passes for fast pointer feedback. */
  fast?: boolean;
  /** Layer canvas preview should ignore any saved node graph and use layer order. */
  graphMode?: 'auto' | 'graph' | 'stack';
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
  const graphModeRef = useRef(options.graphMode ?? 'auto');
  const draftUntilRef = useRef(0);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    docRef.current = doc;
    imageCacheRef.current = imageCache;
    pwRef.current = pw;
    phRef.current = ph;
    fastRef.current = options.fast ?? false;
    graphModeRef.current = options.graphMode ?? 'auto';
  }, [doc, imageCache, pw, ph, options.fast, options.graphMode]);

  const doRender = useCallback(function renderNow() {
    if (renderingRef.current) {
      pendingRef.current = true;
      return;
    }

    renderingRef.current = true;
    renderDocument(docRef.current, pwRef.current, phRef.current, imageCacheRef.current, {
      skipEffects: fastRef.current || performance.now() < draftUntilRef.current,
      draft: performance.now() < draftUntilRef.current,
      graphMode: graphModeRef.current,
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
    draftUntilRef.current = performance.now() + DRAFT_SETTLE_MS;
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      scheduleRender();
    }, DRAFT_SETTLE_MS + 16);
    scheduleRender();
  }, [doc, imageCache, options.fast, options.graphMode, scheduleRender]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
  }, []);

  return containerRef;
}
