import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CanvasDocument } from '../types/config';
import { renderDocument } from '../utils/renderer';

const DRAFT_SETTLE_MS = 120;
const BLANK_SAMPLE_STEPS = 9;
const RENDER_TIMEOUT_MS = 1400;
const RENDER_CACHE_LIMIT = 6;

interface Options {
  /** While true, renderer skips GPU effect passes for fast pointer feedback. */
  fast?: boolean;
  /** Layer canvas preview should ignore any saved node graph and use layer order. */
  graphMode?: 'auto' | 'graph' | 'stack';
  /** Keeps the last good preview visible across component remounts. */
  cacheKey?: string;
  /** Render above CSS display resolution, then downsample in the browser. */
  renderScale?: number;
  /** Upper bound for the largest internal render dimension. */
  maxRenderDimension?: number;
}

export interface DocumentRenderState {
  isRendering: boolean;
  hasFrame: boolean;
  showingStaleFrame: boolean;
  error: Error | null;
}

const lastGoodRenderCache = new Map<string, HTMLCanvasElement>();

function makeRenderCacheKey(cacheKey: string | undefined, pw: number, ph: number): string | null {
  return cacheKey ? `${cacheKey}:${pw}x${ph}` : null;
}

function getRenderDimensions(
  pw: number,
  ph: number,
  renderScale = 1,
  maxRenderDimension = Number.POSITIVE_INFINITY,
): [number, number] {
  const safeScale = Number.isFinite(renderScale) ? Math.max(1, renderScale) : 1;
  const largest = Math.max(pw, ph, 1);
  const boundedScale = Math.min(safeScale, maxRenderDimension / largest);
  return [Math.max(1, Math.round(pw * boundedScale)), Math.max(1, Math.round(ph * boundedScale))];
}

function rememberRenderFrame(cacheKey: string | null, canvas: HTMLCanvasElement): void {
  if (!cacheKey) return;

  const clone = document.createElement('canvas');
  clone.width = canvas.width;
  clone.height = canvas.height;
  clone.getContext('2d')?.drawImage(canvas, 0, 0);

  lastGoodRenderCache.delete(cacheKey);
  lastGoodRenderCache.set(cacheKey, clone);

  while (lastGoodRenderCache.size > RENDER_CACHE_LIMIT) {
    const oldestKey = lastGoodRenderCache.keys().next().value;
    if (!oldestKey) break;
    lastGoodRenderCache.delete(oldestKey);
  }
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
  const [initialRenderWidth, initialRenderHeight] = getRenderDimensions(
    pw,
    ph,
    options.renderScale,
    options.maxRenderDimension,
  );
  const renderWidthRef = useRef(initialRenderWidth);
  const renderHeightRef = useRef(initialRenderHeight);
  const fastRef = useRef(options.fast ?? false);
  const graphModeRef = useRef(options.graphMode ?? 'auto');
  const cacheKeyRef = useRef(makeRenderCacheKey(options.cacheKey, pw, ph));
  const draftUntilRef = useRef(0);
  const gpuFallbackUntilRef = useRef(0);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [renderState, setRenderState] = useState<DocumentRenderState>({
    isRendering: false,
    hasFrame: false,
    showingStaleFrame: false,
    error: null,
  });

  useEffect(() => {
    docRef.current = doc;
    imageCacheRef.current = imageCache;
    pwRef.current = pw;
    phRef.current = ph;
    [renderWidthRef.current, renderHeightRef.current] = getRenderDimensions(
      pw,
      ph,
      options.renderScale,
      options.maxRenderDimension,
    );
    fastRef.current = options.fast ?? false;
    graphModeRef.current = options.graphMode ?? 'auto';
    cacheKeyRef.current = makeRenderCacheKey(options.cacheKey, renderWidthRef.current, renderHeightRef.current);
  }, [
    doc,
    imageCache,
    pw,
    ph,
    options.fast,
    options.graphMode,
    options.cacheKey,
    options.renderScale,
    options.maxRenderDimension,
  ]);

  const doRender = useCallback(function renderNow() {
    if (renderingRef.current) {
      pendingRef.current = true;
      return;
    }

    const now = performance.now();
    const inDraftWindow = now < draftUntilRef.current || now < gpuFallbackUntilRef.current;
    const renderOptions = {
      skipEffects: fastRef.current || inDraftWindow,
      draft: inDraftWindow,
      graphMode: graphModeRef.current,
    };
    const drawResult = (result: HTMLCanvasElement) => {
      const displayCanvas = canvasRef.current;
      if (!displayCanvas) return;
      const ctx = displayCanvas.getContext('2d')!;
      ctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
      ctx.drawImage(result, 0, 0);
      lastGoodCanvasRef.current = result;
      rememberRenderFrame(cacheKeyRef.current, result);
      setRenderState({
        isRendering: false,
        hasFrame: true,
        showingStaleFrame: false,
        error: null,
      });
    };
    const finishRender = () => {
      renderingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        renderNow();
      }
    };

    renderingRef.current = true;
    setRenderState((state) => ({
      isRendering: true,
      hasFrame: state.hasFrame,
      showingStaleFrame: state.hasFrame,
      error: null,
    }));
    const primaryRender = renderDocument(
      docRef.current,
      renderWidthRef.current,
      renderHeightRef.current,
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
            renderDocument(docRef.current, renderWidthRef.current, renderHeightRef.current, imageCacheRef.current, {
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
          if (!renderOptions.skipEffects) gpuFallbackUntilRef.current = performance.now() + 5000;
          finishRender();
          return;
        }

        if (renderOptions.skipEffects) {
          if (lastGoodCanvasRef.current) drawResult(lastGoodCanvasRef.current);
          if (import.meta.env.DEV) console.warn('Canvas render failed.', error);
          setRenderState((state) => ({
            isRendering: false,
            hasFrame: state.hasFrame,
            showingStaleFrame: state.hasFrame,
            error: error instanceof Error ? error : new Error('Canvas render failed.'),
          }));
          finishRender();
          return;
        }

        gpuFallbackUntilRef.current = performance.now() + 5000;
        withRenderTimeout(
          renderDocument(docRef.current, renderWidthRef.current, renderHeightRef.current, imageCacheRef.current, {
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
            setRenderState((state) => ({
              isRendering: false,
              hasFrame: state.hasFrame,
              showingStaleFrame: state.hasFrame,
              error: fallbackError instanceof Error ? fallbackError : new Error('Canvas render failed.'),
            }));
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

    const [renderWidth, renderHeight] = getRenderDimensions(pw, ph, options.renderScale, options.maxRenderDimension);
    renderWidthRef.current = renderWidth;
    renderHeightRef.current = renderHeight;
    const canvas = document.createElement('canvas');
    canvas.width = renderWidth;
    canvas.height = renderHeight;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);
    canvasRef.current = canvas;
    const currentCacheKey = makeRenderCacheKey(options.cacheKey, renderWidth, renderHeight);
    cacheKeyRef.current = currentCacheKey;
    const cachedFrame = currentCacheKey ? lastGoodRenderCache.get(currentCacheKey) : undefined;
    if (cachedFrame) {
      canvas.getContext('2d')?.drawImage(cachedFrame, 0, 0);
      lastGoodCanvasRef.current = cachedFrame;
      setRenderState({
        isRendering: true,
        hasFrame: true,
        showingStaleFrame: true,
        error: null,
      });
    } else {
      lastGoodCanvasRef.current = null;
      setRenderState({
        isRendering: true,
        hasFrame: false,
        showingStaleFrame: false,
        error: null,
      });
    }
    draftUntilRef.current = cachedFrame ? 0 : performance.now() + DRAFT_SETTLE_MS;

    scheduleRender();

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      canvasRef.current = null;
      if (container.contains(canvas)) container.removeChild(canvas);
    };
  }, [pw, ph, options.cacheKey, options.renderScale, options.maxRenderDimension, scheduleRender]);

  useEffect(() => {
    if (!lastGoodCanvasRef.current || (options.fast ?? false)) {
      draftUntilRef.current = performance.now() + DRAFT_SETTLE_MS;
    }
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      scheduleRender();
    }, DRAFT_SETTLE_MS + 16);
    scheduleRender();
  }, [doc, imageCache, options.fast, options.graphMode, options.cacheKey, scheduleRender]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    },
    [],
  );

  return { containerRef, renderState };
}
