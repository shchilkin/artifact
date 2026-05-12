import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { CanvasDocument } from '../types/config';
import { renderDocument } from '../utils/renderer';

const DRAFT_SETTLE_MS = 120;
const BLANK_SAMPLE_STEPS = 9;
const RENDER_TIMEOUT_MS = 1400;

interface Options {
  /** While true, renderer skips GPU effect passes for fast pointer feedback. */
  fast?: boolean;
  /** Layer canvas preview should ignore any saved node graph and use layer order. */
  graphMode?: 'auto' | 'graph' | 'stack';
}

function hasVisibleContentLayer(doc: CanvasDocument): boolean {
  return doc.layers.some((layer) => {
    if (!layer.visible) return false;
    if (layer.kind === 'effect') return false;
    if (layer.kind === 'image') return layer.src.length > 0;
    if (layer.kind === 'text') return layer.content.trim().length > 0;
    if (layer.kind === 'emoji') return layer.emojis.length > 0 && layer.density > 0 && layer.opacity > 0;
    return layer.opacity > 0;
  });
}

export function isLikelyBlankRender(canvas: HTMLCanvasElement, doc: CanvasDocument): boolean {
  if (!hasVisibleContentLayer(doc)) return false;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;

  const width = canvas.width;
  const height = canvas.height;
  if (width <= 0 || height <= 0) return true;

  let minChannel = 255;
  let maxChannel = 0;
  let alphaTotal = 0;
  let luminanceTotal = 0;
  let samples = 0;

  const pixels = ctx.getImageData(0, 0, width, height).data;
  for (let yStep = 0; yStep < BLANK_SAMPLE_STEPS; yStep += 1) {
    for (let xStep = 0; xStep < BLANK_SAMPLE_STEPS; xStep += 1) {
      const x = Math.min(width - 1, Math.round((xStep / (BLANK_SAMPLE_STEPS - 1)) * (width - 1)));
      const y = Math.min(height - 1, Math.round((yStep / (BLANK_SAMPLE_STEPS - 1)) * (height - 1)));
      const index = (y * width + x) * 4;
      const r = pixels[index] ?? 0;
      const g = pixels[index + 1] ?? 0;
      const b = pixels[index + 2] ?? 0;
      const a = pixels[index + 3] ?? 0;
      minChannel = Math.min(minChannel, r, g, b);
      maxChannel = Math.max(maxChannel, r, g, b);
      alphaTotal += a;
      luminanceTotal += 0.299 * r + 0.587 * g + 0.114 * b;
      samples += 1;
    }
  }

  const averageAlpha = alphaTotal / samples;
  const averageLuminance = luminanceTotal / samples;
  return averageAlpha < 4 || (averageLuminance < 18 && maxChannel < 56);
}

function withRenderTimeout(
  promise: Promise<HTMLCanvasElement>,
  timeoutMs = RENDER_TIMEOUT_MS,
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Canvas render timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
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
  const lastGoodCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef(doc);
  const imageCacheRef = useRef(imageCache);
  const pwRef = useRef(pw);
  const phRef = useRef(ph);
  const fastRef = useRef(options.fast ?? false);
  const graphModeRef = useRef(options.graphMode ?? 'auto');
  const draftUntilRef = useRef(0);
  const gpuFallbackUntilRef = useRef(0);
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

    const renderOptions = {
      skipEffects:
        fastRef.current || performance.now() < draftUntilRef.current || performance.now() < gpuFallbackUntilRef.current,
      draft: performance.now() < draftUntilRef.current,
      graphMode: graphModeRef.current,
    };
    const drawResult = (result: HTMLCanvasElement) => {
      const displayCanvas = canvasRef.current;
      if (!displayCanvas) return;
      const ctx = displayCanvas.getContext('2d')!;
      ctx.clearRect(0, 0, pwRef.current, phRef.current);
      ctx.drawImage(result, 0, 0);
      lastGoodCanvasRef.current = result;
    };
    const finishRender = () => {
      renderingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        renderNow();
      }
    };

    renderingRef.current = true;
    const primaryRender = renderDocument(
      docRef.current,
      pwRef.current,
      phRef.current,
      imageCacheRef.current,
      renderOptions,
    );
    const timedPrimaryRender = renderOptions.skipEffects ? primaryRender : withRenderTimeout(primaryRender);

    timedPrimaryRender
      .then((result) => {
        const hasNewerRenderPending = pendingRef.current;
        if (!hasNewerRenderPending && !renderOptions.skipEffects && isLikelyBlankRender(result, docRef.current)) {
          gpuFallbackUntilRef.current = performance.now() + 5000;
          withRenderTimeout(
            renderDocument(docRef.current, pwRef.current, phRef.current, imageCacheRef.current, {
              ...renderOptions,
              skipEffects: true,
              draft: true,
            }),
          )
            .then((fallback) => {
              drawResult(isLikelyBlankRender(fallback, docRef.current) ? result : fallback);
              if (import.meta.env.DEV) console.warn('Canvas render produced a blank frame; used draft fallback.');
            })
            .catch(() => drawResult(result))
            .finally(finishRender);
          return;
        }
        if (!renderOptions.skipEffects) gpuFallbackUntilRef.current = 0;
        if (!hasNewerRenderPending) drawResult(result);
        finishRender();
      })
      .catch((error) => {
        const hasNewerRenderPending = pendingRef.current;
        if (hasNewerRenderPending) {
          finishRender();
          return;
        }

        if (renderOptions.skipEffects) {
          if (lastGoodCanvasRef.current) drawResult(lastGoodCanvasRef.current);
          if (import.meta.env.DEV) console.warn('Canvas render failed.', error);
          finishRender();
          return;
        }

        gpuFallbackUntilRef.current = performance.now() + 5000;
        withRenderTimeout(
          renderDocument(docRef.current, pwRef.current, phRef.current, imageCacheRef.current, {
            ...renderOptions,
            skipEffects: true,
            draft: true,
          }),
        )
          .then((fallback) => {
            if (!pendingRef.current) drawResult(fallback);
            if (import.meta.env.DEV) console.warn('Canvas render fell back to draft mode.', error);
          })
          .catch((fallbackError) => {
            if (!pendingRef.current && lastGoodCanvasRef.current) drawResult(lastGoodCanvasRef.current);
            if (import.meta.env.DEV) console.warn('Canvas render failed.', fallbackError);
          })
          .finally(finishRender);
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
    lastGoodCanvasRef.current = null;

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

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    },
    [],
  );

  return containerRef;
}
