import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CanvasDocument } from '../types/config';
import { createLayerPreviewRenderCache } from '../utils/layerPreviewRenderCache';
import { type RenderOptions, renderDocument } from '../utils/renderer';

const DRAFT_SETTLE_MS = 120;
const DEFAULT_DEFERRED_FULL_RENDER_MS = 1800;
const DEFAULT_DEFERRED_FULL_RENDER_TIMEOUT_MS = 3200;
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
  /** Optional lower render scale for immediate preview / fast frames. */
  draftRenderScale?: number;
  /** Optional lower max dimension for immediate preview / fast frames. */
  draftMaxRenderDimension?: number;
  /** Draw a quick lower-resolution preview first, then wait for an idle slot before full quality. */
  deferFullRender?: boolean;
  /** Whether the immediate low-resolution pass should also simplify sources and skip effects. */
  deferredPreviewQuality?: 'draft' | 'full';
  /** Delay before the deferred full-quality pass is allowed to start. */
  deferredFullRenderMs?: number;
  /** requestIdleCallback timeout for the deferred full-quality pass. */
  deferredFullRenderTimeoutMs?: number;
}

interface DocumentRenderState {
  isRendering: boolean;
  hasFrame: boolean;
  showingStaleFrame: boolean;
  error: Error | null;
}

const lastGoodRenderCache = new Map<string, HTMLCanvasElement>();

function makeRenderCacheKey(cacheKey: string | undefined, pw: number, ph: number): string | null {
  return cacheKey ? `${cacheKey}:${pw}x${ph}` : null;
}

export function getRenderDimensions(
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

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
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
  const activeAbortRef = useRef<AbortController | null>(null);
  const layerGraphCacheEntriesRef = useRef(new Map<string, Promise<HTMLCanvasElement>>());
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
  const draftRenderScaleRef = useRef(options.draftRenderScale ?? options.renderScale);
  const draftMaxRenderDimensionRef = useRef(options.draftMaxRenderDimension ?? options.maxRenderDimension);
  const deferredPreviewQualityRef = useRef(options.deferredPreviewQuality ?? 'draft');
  const deferredFullRenderMsRef = useRef(options.deferredFullRenderMs ?? DEFAULT_DEFERRED_FULL_RENDER_MS);
  const deferredFullRenderTimeoutMsRef = useRef(
    options.deferredFullRenderTimeoutMs ?? DEFAULT_DEFERRED_FULL_RENDER_TIMEOUT_MS,
  );
  const draftUntilRef = useRef(0);
  const gpuFallbackUntilRef = useRef(0);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredFullRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredFullRenderIdleRef = useRef<number | null>(null);
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
    draftRenderScaleRef.current = options.draftRenderScale ?? options.renderScale;
    draftMaxRenderDimensionRef.current = options.draftMaxRenderDimension ?? options.maxRenderDimension;
    deferredPreviewQualityRef.current = options.deferredPreviewQuality ?? 'draft';
    deferredFullRenderMsRef.current = options.deferredFullRenderMs ?? DEFAULT_DEFERRED_FULL_RENDER_MS;
    deferredFullRenderTimeoutMsRef.current =
      options.deferredFullRenderTimeoutMs ?? DEFAULT_DEFERRED_FULL_RENDER_TIMEOUT_MS;
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
    options.draftRenderScale,
    options.draftMaxRenderDimension,
    options.deferredPreviewQuality,
    options.deferredFullRenderMs,
    options.deferredFullRenderTimeoutMs,
  ]);

  const cancelDeferredFullRender = useCallback(() => {
    if (deferredFullRenderTimerRef.current) {
      clearTimeout(deferredFullRenderTimerRef.current);
      deferredFullRenderTimerRef.current = null;
    }
    if (deferredFullRenderIdleRef.current !== null) {
      globalThis.cancelIdleCallback?.(deferredFullRenderIdleRef.current);
      deferredFullRenderIdleRef.current = null;
    }
  }, []);

  const doRender = useCallback(function renderNow() {
    if (!canvasRef.current) return;
    if (renderingRef.current) {
      pendingRef.current = true;
      activeAbortRef.current?.abort();
      return;
    }

    activeAbortRef.current?.abort();
    const abortController = new AbortController();
    activeAbortRef.current = abortController;
    const now = performance.now();
    const inDeferredPreviewWindow = now < draftUntilRef.current;
    const inGpuFallbackWindow = now < gpuFallbackUntilRef.current;
    const usePreviewSize = fastRef.current || inDeferredPreviewWindow || inGpuFallbackWindow;
    const useDraftQuality =
      fastRef.current ||
      inGpuFallbackWindow ||
      (inDeferredPreviewWindow && deferredPreviewQualityRef.current === 'draft');
    const [targetWidth, targetHeight] = usePreviewSize
      ? getRenderDimensions(
          pwRef.current,
          phRef.current,
          draftRenderScaleRef.current,
          draftMaxRenderDimensionRef.current,
        )
      : [renderWidthRef.current, renderHeightRef.current];
    const renderOptions: RenderOptions = {
      skipEffects: useDraftQuality,
      draft: useDraftQuality,
      graphMode: graphModeRef.current,
      signal: abortController.signal,
    };
    const drawResult = (result: HTMLCanvasElement) => {
      const displayCanvas = canvasRef.current;
      if (!displayCanvas) return;
      const ctx = displayCanvas.getContext('2d')!;
      ctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality =
        result.width < displayCanvas.width || result.height < displayCanvas.height ? 'medium' : 'high';
      ctx.drawImage(result, 0, 0, displayCanvas.width, displayCanvas.height);
      lastGoodCanvasRef.current = result;
      if (result.width === displayCanvas.width && result.height === displayCanvas.height) {
        rememberRenderFrame(cacheKeyRef.current, result);
      }
      setRenderState({
        isRendering: false,
        hasFrame: true,
        showingStaleFrame: false,
        error: null,
      });
    };
    const finishRender = () => {
      renderingRef.current = false;
      if (activeAbortRef.current === abortController) activeAbortRef.current = null;
      if (pendingRef.current && canvasRef.current) {
        pendingRef.current = false;
        renderNow();
      } else {
        pendingRef.current = false;
      }
    };
    const renderDraftFallback = (baseOptions: RenderOptions) => {
      const fallbackOptions: RenderOptions = {
        ...baseOptions,
        skipEffects: true,
        draft: true,
      };
      const [fallbackWidth, fallbackHeight] = getRenderDimensions(
        pwRef.current,
        phRef.current,
        draftRenderScaleRef.current,
        draftMaxRenderDimensionRef.current,
      );
      return withRenderTimeout(
        renderDocument(
          docRef.current,
          fallbackWidth,
          fallbackHeight,
          imageCacheRef.current,
          fallbackOptions,
          fallbackOptions.graphMode === 'stack'
            ? createLayerPreviewRenderCache(docRef.current, imageCacheRef.current, layerGraphCacheEntriesRef.current, {
                width: fallbackWidth,
                height: fallbackHeight,
                renderOptions: fallbackOptions,
              })
            : undefined,
        ),
      );
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
      targetWidth,
      targetHeight,
      imageCacheRef.current,
      renderOptions,
      renderOptions.graphMode === 'stack'
        ? createLayerPreviewRenderCache(docRef.current, imageCacheRef.current, layerGraphCacheEntriesRef.current, {
            width: targetWidth,
            height: targetHeight,
            renderOptions,
          })
        : undefined,
    );
    const timedPrimaryRender = renderOptions.skipEffects ? primaryRender : withRenderTimeout(primaryRender);

    timedPrimaryRender
      .then((result) => {
        const hasNewerRenderPending = pendingRef.current;
        if (!hasNewerRenderPending && !renderOptions.skipEffects && isLikelyBlankRender(result, docRef.current)) {
          gpuFallbackUntilRef.current = performance.now() + 5000;
          renderDraftFallback(renderOptions)
            .then((fallback) => {
              drawResult(isLikelyBlankRender(fallback, docRef.current) ? result : fallback);
              if (import.meta.env.DEV) console.warn('Canvas render produced a blank frame; used draft fallback.');
            })
            .catch((fallbackError) => {
              if (isAbortError(fallbackError) || abortController.signal.aborted) return;
              drawResult(result);
            })
            .finally(finishRender);
          return;
        }
        if (!renderOptions.skipEffects) gpuFallbackUntilRef.current = 0;
        if (!hasNewerRenderPending) drawResult(result);
        finishRender();
      })
      .catch((error) => {
        if (isAbortError(error) || abortController.signal.aborted) {
          finishRender();
          return;
        }
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
        renderDraftFallback(renderOptions)
          .then((fallback) => {
            if (!pendingRef.current) drawResult(fallback);
            if (import.meta.env.DEV) console.warn('Canvas render fell back to draft mode.', error);
          })
          .catch((fallbackError) => {
            if (isAbortError(fallbackError) || abortController.signal.aborted) {
              finishRender();
              return;
            }
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

  const scheduleDeferredFullRender = useCallback(() => {
    cancelDeferredFullRender();
    const run = () => {
      deferredFullRenderTimerRef.current = null;
      deferredFullRenderIdleRef.current = null;
      draftUntilRef.current = 0;
      scheduleRender();
    };

    deferredFullRenderTimerRef.current = setTimeout(() => {
      deferredFullRenderTimerRef.current = null;
      if (typeof globalThis.requestIdleCallback === 'function') {
        deferredFullRenderIdleRef.current = globalThis.requestIdleCallback(run, {
          timeout: deferredFullRenderTimeoutMsRef.current,
        });
        return;
      }
      run();
    }, deferredFullRenderMsRef.current);
  }, [cancelDeferredFullRender, scheduleRender]);

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
    draftUntilRef.current =
      cachedFrame && !options.deferFullRender
        ? 0
        : performance.now() +
          (options.deferFullRender
            ? (options.deferredFullRenderTimeoutMs ?? DEFAULT_DEFERRED_FULL_RENDER_TIMEOUT_MS)
            : DRAFT_SETTLE_MS);

    scheduleRender();

    return () => {
      cancelDeferredFullRender();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      activeAbortRef.current?.abort();
      activeAbortRef.current = null;
      canvasRef.current = null;
      if (container.contains(canvas)) container.removeChild(canvas);
    };
  }, [
    pw,
    ph,
    options.cacheKey,
    options.renderScale,
    options.maxRenderDimension,
    options.draftRenderScale,
    options.draftMaxRenderDimension,
    options.deferFullRender,
    options.deferredPreviewQuality,
    options.deferredFullRenderMs,
    options.deferredFullRenderTimeoutMs,
    scheduleRender,
    cancelDeferredFullRender,
  ]);

  useEffect(() => {
    const deferFullRender = options.deferFullRender && !(options.fast ?? false);
    if (!lastGoodCanvasRef.current || (options.fast ?? false) || deferFullRender) {
      draftUntilRef.current =
        performance.now() +
        (deferFullRender
          ? (options.deferredFullRenderTimeoutMs ?? DEFAULT_DEFERRED_FULL_RENDER_TIMEOUT_MS)
          : DRAFT_SETTLE_MS);
    }
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    cancelDeferredFullRender();
    scheduleRender();
    if (deferFullRender) {
      scheduleDeferredFullRender();
    } else {
      settleTimerRef.current = setTimeout(() => {
        settleTimerRef.current = null;
        draftUntilRef.current = 0;
        scheduleRender();
      }, DRAFT_SETTLE_MS + 16);
    }
  }, [
    doc,
    imageCache,
    options.fast,
    options.graphMode,
    options.cacheKey,
    options.deferFullRender,
    options.deferredPreviewQuality,
    options.deferredFullRenderMs,
    options.deferredFullRenderTimeoutMs,
    options.draftRenderScale,
    options.draftMaxRenderDimension,
    scheduleRender,
    cancelDeferredFullRender,
    scheduleDeferredFullRender,
  ]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      activeAbortRef.current?.abort();
      activeAbortRef.current = null;
      cancelDeferredFullRender();
    },
    [cancelDeferredFullRender],
  );

  return { containerRef, renderState };
}
