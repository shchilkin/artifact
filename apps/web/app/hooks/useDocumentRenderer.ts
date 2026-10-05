import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CanvasDocument } from '../types/config';
import { estimateGpuPassMs } from '../utils/gpuPassCost';
import { scheduleIdle } from '../utils/idleCallback';
import { PREVIEW_FRAME_INTERVAL_MS } from '../utils/interactionTiming';
import { createLayerPreviewRenderCache } from '../utils/layerPreviewRenderCache';
import { type RenderOptions, renderDocument } from '../utils/renderer';
import { createPreviewRenderScheduler, type PreviewRenderScheduler } from './previewRenderScheduler';

const DRAFT_SETTLE_MS = 120;
const DEFAULT_DEFERRED_FULL_RENDER_MS = 1800;
const DEFAULT_DEFERRED_FULL_RENDER_TIMEOUT_MS = 3200;
const BLANK_SAMPLE_STEPS = 9;
const RENDER_TIMEOUT_MS = 1400;
const RENDER_CACHE_LIMIT = 6;
/** Interactive pass sizes, as fractions of the draft size. Few steps keep the layer prefix cache useful. */
const INTERACTIVE_SCALE_STEPS = [1, 0.75, 0.5] as const;
/** A larger interactive size is chosen again only once a pass there is expected to fit well within the budget. */
const INTERACTIVE_SCALE_UP_HEADROOM = 0.7;
const INTERACTIVE_WARMUP_IDLE_TIMEOUT_MS = 300;

export type InteractiveScale = (typeof INTERACTIVE_SCALE_STEPS)[number];

interface Options {
  /** While true, renderer skips GPU effect passes for fast pointer feedback. */
  fast?: boolean;
  /** Layer canvas preview should ignore any saved node graph and use layer order. */
  graphMode?: 'auto' | 'graph' | 'stack';
  /** 3D primitive/model/scene camera overrides used by node previews and export. */
  primitiveViewStates?: RenderOptions['primitiveViewStates'];
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
  /**
   * Longest expected GPU effect pass at the interactive size. On a slower GPU (such as software WebGL) the
   * interactive pass renders smaller, down to half the draft size, to stay within it; the full-quality pass is
   * unaffected.
   */
  interactiveGpuPassBudgetMs?: number;
}

interface DocumentRenderState {
  isRendering: boolean;
  hasFrame: boolean;
  showingStaleFrame: boolean;
  error: Error | null;
}

type RenderCanvasMountOptions = Pick<
  Options,
  'cacheKey' | 'deferFullRender' | 'renderScale' | 'maxRenderDimension' | 'deferredFullRenderTimeoutMs'
>;

const lastGoodRenderCache = new Map<string, HTMLCanvasElement>();

function makeRenderCacheKey(cacheKey: string | undefined, pw: number, ph: number): string | null {
  return cacheKey ? `${cacheKey}:${pw}x${ph}` : null;
}

/**
 * The largest interactive scale whose expected GPU pass time fits the budget, given an estimate of one pass's time
 * for a pixel count and the pixel count of the draft size. Without a budget or an estimate the current scale stays.
 */
export function chooseInteractiveScale(
  current: InteractiveScale,
  estimatePassMs: (pixels: number) => number | null,
  draftPixels: number,
  budgetMs: number | undefined,
): InteractiveScale {
  if (budgetMs === undefined || estimatePassMs(draftPixels) === null) return current;
  for (const scale of INTERACTIVE_SCALE_STEPS) {
    const limit = scale > current ? budgetMs * INTERACTIVE_SCALE_UP_HEADROOM : budgetMs;
    if ((estimatePassMs(draftPixels * scale * scale) ?? 0) <= limit) return scale;
  }
  return INTERACTIVE_SCALE_STEPS[INTERACTIVE_SCALE_STEPS.length - 1];
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

function shouldDeferFullRender(options: Options) {
  return Boolean(options.deferFullRender && !(options.fast ?? false));
}

function nextDraftWindowMs(options: Options, deferFullRender: boolean) {
  return deferFullRender
    ? (options.deferredFullRenderTimeoutMs ?? DEFAULT_DEFERRED_FULL_RENDER_TIMEOUT_MS)
    : DRAFT_SETTLE_MS;
}

function shouldRefreshDraftWindow(
  lastGoodCanvas: HTMLCanvasElement | null,
  options: Options,
  deferFullRender: boolean,
) {
  return !lastGoodCanvas || (options.fast ?? false) || deferFullRender;
}

function clearRenderTimer(timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>) {
  if (timerRef.current) clearTimeout(timerRef.current);
  timerRef.current = null;
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

type RenderStateSetter = Dispatch<SetStateAction<DocumentRenderState>>;

interface DocumentRendererRefs {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  renderingRef: MutableRefObject<boolean>;
  /** A newer request superseded the running render: drop its result instead of painting it. */
  supersededRef: MutableRefObject<boolean>;
  /** The running render is an interactive preview-size pass rather than a full-quality one. */
  interactiveRenderRef: MutableRefObject<boolean>;
  activeAbortRef: MutableRefObject<AbortController | null>;
  layerGraphCacheEntriesRef: MutableRefObject<Map<string, Promise<HTMLCanvasElement>>>;
  lastGoodCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
  docRef: MutableRefObject<CanvasDocument>;
  imageCacheRef: MutableRefObject<Map<string, HTMLImageElement>>;
  pwRef: MutableRefObject<number>;
  phRef: MutableRefObject<number>;
  renderWidthRef: MutableRefObject<number>;
  renderHeightRef: MutableRefObject<number>;
  fastRef: MutableRefObject<boolean>;
  graphModeRef: MutableRefObject<RenderOptions['graphMode']>;
  primitiveViewStatesRef: MutableRefObject<RenderOptions['primitiveViewStates']>;
  cacheKeyRef: MutableRefObject<string | null>;
  draftRenderScaleRef: MutableRefObject<number | undefined>;
  draftMaxRenderDimensionRef: MutableRefObject<number | undefined>;
  deferredPreviewQualityRef: MutableRefObject<'draft' | 'full'>;
  draftUntilRef: MutableRefObject<number>;
  gpuFallbackUntilRef: MutableRefObject<number>;
  interactiveGpuPassBudgetMsRef: MutableRefObject<number | undefined>;
  interactiveScaleRef: MutableRefObject<InteractiveScale>;
  /** Size of the last completed interactive pass: the layer prefix cache holds that size. */
  warmInteractiveSizeRef: MutableRefObject<string | null>;
  /** The scheduled or running unpainted render that fills the prefix cache at a new interactive size. */
  warmupRef: MutableRefObject<{ cancelIdle: (() => void) | null; abort: AbortController | null }>;
}

function markRenderStarted(setRenderState: RenderStateSetter) {
  setRenderState((state) => ({
    isRendering: true,
    hasFrame: state.hasFrame,
    showingStaleFrame: state.hasFrame,
    error: null,
  }));
}

function renderFailureError(error: unknown) {
  return error instanceof Error ? error : new Error('Canvas render failed.');
}

function setRenderFailure(error: unknown, setRenderState: RenderStateSetter) {
  setRenderState((state) => ({
    isRendering: false,
    hasFrame: state.hasFrame,
    showingStaleFrame: state.hasFrame,
    error: renderFailureError(error),
  }));
}

function drawRenderResult(result: HTMLCanvasElement, refs: DocumentRendererRefs, setRenderState: RenderStateSetter) {
  const displayCanvas = refs.canvasRef.current;
  if (!displayCanvas) return;
  // The display canvas takes the frame's own size and CSS scales it to the preview box. Scaling a small
  // interactive frame up into a full-resolution canvas would cost a full-resolution raster per paint.
  if (displayCanvas.width !== result.width || displayCanvas.height !== result.height) {
    displayCanvas.width = result.width;
    displayCanvas.height = result.height;
  }
  const ctx = displayCanvas.getContext('2d')!;
  ctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
  ctx.drawImage(result, 0, 0);
  refs.lastGoodCanvasRef.current = result;
  if (result.width === refs.renderWidthRef.current && result.height === refs.renderHeightRef.current) {
    rememberRenderFrame(refs.cacheKeyRef.current, result);
  }
  // Interactive frames usually leave the state as it was; keeping the same object skips a React commit per frame.
  setRenderState((state) =>
    !state.isRendering && state.hasFrame && !state.showingStaleFrame && !state.error
      ? state
      : { isRendering: false, hasFrame: true, showingStaleFrame: false, error: null },
  );
}

function finishRenderCycle(
  refs: DocumentRendererRefs,
  abortController: AbortController,
  done: (options: { cooldown: boolean }) => void,
) {
  refs.renderingRef.current = false;
  if (refs.activeAbortRef.current === abortController) refs.activeAbortRef.current = null;
  // Only interactive passes are part of a gesture; a full-quality pass must not delay the next edit.
  done({ cooldown: refs.interactiveRenderRef.current });
}

function renderCacheForMode(refs: DocumentRendererRefs, renderOptions: RenderOptions, width: number, height: number) {
  return renderOptions.graphMode === 'stack'
    ? createLayerPreviewRenderCache(
        refs.docRef.current,
        refs.imageCacheRef.current,
        refs.layerGraphCacheEntriesRef.current,
        {
          width,
          height,
          renderOptions,
        },
      )
    : undefined;
}

function renderDocumentFrame(refs: DocumentRendererRefs, width: number, height: number, renderOptions: RenderOptions) {
  return renderDocument(
    refs.docRef.current,
    width,
    height,
    refs.imageCacheRef.current,
    renderOptions,
    renderCacheForMode(refs, renderOptions, width, height),
  );
}

function renderDraftFallback(refs: DocumentRendererRefs, baseOptions: RenderOptions) {
  const fallbackOptions: RenderOptions = {
    ...baseOptions,
    skipEffects: true,
    draft: true,
  };
  const [fallbackWidth, fallbackHeight] = getRenderDimensions(
    refs.pwRef.current,
    refs.phRef.current,
    refs.draftRenderScaleRef.current,
    refs.draftMaxRenderDimensionRef.current,
  );
  return withRenderTimeout(renderDocumentFrame(refs, fallbackWidth, fallbackHeight, fallbackOptions));
}

/** Interactive pass size: the draft size, scaled down while the GPU is too slow for it. */
function interactiveRenderDimensions(refs: DocumentRendererRefs): [number, number] {
  const [width, height] = getRenderDimensions(
    refs.pwRef.current,
    refs.phRef.current,
    refs.draftRenderScaleRef.current,
    refs.draftMaxRenderDimensionRef.current,
  );
  const scale = chooseInteractiveScale(
    refs.interactiveScaleRef.current,
    estimateGpuPassMs,
    width * height,
    refs.interactiveGpuPassBudgetMsRef.current,
  );
  refs.interactiveScaleRef.current = scale;
  if (scale === 1) return [width, height];
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

function frameRenderOptions(
  refs: DocumentRendererRefs,
  draftQuality: boolean,
  interactive: boolean,
  abortController: AbortController,
): RenderOptions {
  return {
    skipEffects: draftQuality,
    draft: draftQuality,
    // Interactive passes are replaced by the full-quality pass, which keeps separate GPU passes.
    mergeGpuPasses: interactive,
    recordGpuCost: true,
    graphMode: refs.graphModeRef.current,
    primitiveViewStates: refs.primitiveViewStatesRef.current,
    signal: abortController.signal,
  };
}

function currentRenderPolicy(refs: DocumentRendererRefs, abortController: AbortController) {
  const now = performance.now();
  const inDeferredPreviewWindow = now < refs.draftUntilRef.current;
  const inGpuFallbackWindow = now < refs.gpuFallbackUntilRef.current;
  const usePreviewSize = refs.fastRef.current || inDeferredPreviewWindow || inGpuFallbackWindow;
  const useDraftQuality =
    refs.fastRef.current ||
    inGpuFallbackWindow ||
    (inDeferredPreviewWindow && refs.deferredPreviewQualityRef.current === 'draft');
  const [targetWidth, targetHeight] = usePreviewSize
    ? interactiveRenderDimensions(refs)
    : [refs.renderWidthRef.current, refs.renderHeightRef.current];

  return {
    targetWidth,
    targetHeight,
    interactive: usePreviewSize,
    renderOptions: frameRenderOptions(refs, useDraftQuality, usePreviewSize, abortController),
  };
}

function cancelInteractiveWarmup(refs: DocumentRendererRefs) {
  const warmup = refs.warmupRef.current;
  warmup.cancelIdle?.();
  warmup.abort?.abort();
  refs.warmupRef.current = { cancelIdle: null, abort: null };
}

/** Identifies a render size, for comparing the interactive size with the size the prefix cache holds. */
function renderSizeKey(width: number, height: number) {
  return `${width}x${height}`;
}

/**
 * When the interactive pass changed size since it last ran, renders it once in idle time without painting, so the
 * layer prefix cache holds the new size and the next edit re-renders only the layers above it.
 */
function scheduleInteractiveWarmup(refs: DocumentRendererRefs) {
  cancelInteractiveWarmup(refs);
  if (refs.interactiveGpuPassBudgetMsRef.current === undefined || refs.graphModeRef.current !== 'stack') return;
  const cancelIdle = scheduleIdle(() => {
    refs.warmupRef.current.cancelIdle = null;
    if (!refs.canvasRef.current || refs.renderingRef.current) return;
    if (performance.now() < refs.gpuFallbackUntilRef.current) return;
    const [width, height] = interactiveRenderDimensions(refs);
    const size = renderSizeKey(width, height);
    if (size === refs.warmInteractiveSizeRef.current) return;
    const abortController = new AbortController();
    refs.warmupRef.current.abort = abortController;
    const draftQuality = refs.fastRef.current || refs.deferredPreviewQualityRef.current === 'draft';
    renderDocumentFrame(refs, width, height, frameRenderOptions(refs, draftQuality, true, abortController))
      .then(() => {
        if (!abortController.signal.aborted) refs.warmInteractiveSizeRef.current = size;
      })
      .catch(() => undefined)
      .finally(() => {
        if (refs.warmupRef.current.abort === abortController) refs.warmupRef.current.abort = null;
      });
  }, INTERACTIVE_WARMUP_IDLE_TIMEOUT_MS);
  refs.warmupRef.current = { cancelIdle, abort: null };
}

function timedPrimaryRender(refs: DocumentRendererRefs, renderOptions: RenderOptions, width: number, height: number) {
  const primaryRender = renderDocumentFrame(refs, width, height, renderOptions);
  return renderOptions.skipEffects ? primaryRender : withRenderTimeout(primaryRender);
}

function createDisplayCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  return canvas;
}

function replaceMountedCanvas(container: HTMLDivElement, refs: DocumentRendererRefs) {
  if (refs.canvasRef.current && container.contains(refs.canvasRef.current)) {
    container.removeChild(refs.canvasRef.current);
  }
}

function restoreCachedFrame(
  canvas: HTMLCanvasElement,
  cachedFrame: HTMLCanvasElement | undefined,
  refs: DocumentRendererRefs,
  setRenderState: RenderStateSetter,
) {
  if (!cachedFrame) {
    refs.lastGoodCanvasRef.current = null;
    setRenderState({ isRendering: true, hasFrame: false, showingStaleFrame: false, error: null });
    return;
  }
  canvas.getContext('2d')?.drawImage(cachedFrame, 0, 0);
  refs.lastGoodCanvasRef.current = cachedFrame;
  setRenderState({ isRendering: true, hasFrame: true, showingStaleFrame: true, error: null });
}

function mountedDraftWindowUntil(cachedFrame: HTMLCanvasElement | undefined, options: RenderCanvasMountOptions) {
  if (cachedFrame && !options.deferFullRender) return 0;
  return performance.now() + nextDraftWindowMs(options, Boolean(options.deferFullRender));
}

function mountRenderCanvas(
  container: HTMLDivElement,
  refs: DocumentRendererRefs,
  pw: number,
  ph: number,
  options: RenderCanvasMountOptions,
  setRenderState: RenderStateSetter,
) {
  replaceMountedCanvas(container, refs);
  const [renderWidth, renderHeight] = getRenderDimensions(pw, ph, options.renderScale, options.maxRenderDimension);
  refs.renderWidthRef.current = renderWidth;
  refs.renderHeightRef.current = renderHeight;
  const canvas = createDisplayCanvas(renderWidth, renderHeight);
  container.appendChild(canvas);
  refs.canvasRef.current = canvas;
  const currentCacheKey = makeRenderCacheKey(options.cacheKey, renderWidth, renderHeight);
  refs.cacheKeyRef.current = currentCacheKey;
  const cachedFrame = currentCacheKey ? lastGoodRenderCache.get(currentCacheKey) : undefined;
  restoreCachedFrame(canvas, cachedFrame, refs, setRenderState);
  refs.draftUntilRef.current = mountedDraftWindowUntil(cachedFrame, options);
  return canvas;
}

function cleanupMountedRenderCanvas({
  container,
  canvas,
  refs,
  cancelScheduledRender,
  cancelDeferredFullRender,
}: {
  container: HTMLDivElement;
  canvas: HTMLCanvasElement;
  refs: DocumentRendererRefs;
  cancelScheduledRender: () => void;
  cancelDeferredFullRender: () => void;
}) {
  cancelDeferredFullRender();
  cancelScheduledRender();
  cancelInteractiveWarmup(refs);
  refs.activeAbortRef.current?.abort();
  refs.activeAbortRef.current = null;
  refs.canvasRef.current = null;
  if (container.contains(canvas)) container.removeChild(canvas);
}

function shouldUseBlankFallback(result: HTMLCanvasElement, refs: DocumentRendererRefs, renderOptions: RenderOptions) {
  return !refs.supersededRef.current && !renderOptions.skipEffects && isLikelyBlankRender(result, refs.docRef.current);
}

function handleBlankPrimaryRender({
  result,
  refs,
  renderOptions,
  abortController,
  setRenderState,
  finishRender,
}: {
  result: HTMLCanvasElement;
  refs: DocumentRendererRefs;
  renderOptions: RenderOptions;
  abortController: AbortController;
  setRenderState: RenderStateSetter;
  finishRender: () => void;
}) {
  refs.gpuFallbackUntilRef.current = performance.now() + 5000;
  renderDraftFallback(refs, renderOptions)
    .then((fallback) => {
      drawRenderResult(isLikelyBlankRender(fallback, refs.docRef.current) ? result : fallback, refs, setRenderState);
      if (import.meta.env.DEV) console.warn('Canvas render produced a blank frame; used draft fallback.');
    })
    .catch((fallbackError) => {
      if (isAbortError(fallbackError) || abortController.signal.aborted) return;
      drawRenderResult(result, refs, setRenderState);
    })
    .finally(finishRender);
}

function handlePrimaryRenderSuccess(
  result: HTMLCanvasElement,
  refs: DocumentRendererRefs,
  renderOptions: RenderOptions,
  abortController: AbortController,
  setRenderState: RenderStateSetter,
  finishRender: () => void,
) {
  if (shouldUseBlankFallback(result, refs, renderOptions)) {
    handleBlankPrimaryRender({ result, refs, renderOptions, abortController, setRenderState, finishRender });
    return;
  }
  if (!renderOptions.skipEffects) refs.gpuFallbackUntilRef.current = 0;
  if (!refs.supersededRef.current) drawRenderResult(result, refs, setRenderState);
  finishRender();
}

function handleDraftRenderFailure(
  error: unknown,
  refs: DocumentRendererRefs,
  setRenderState: RenderStateSetter,
  finishRender: () => void,
) {
  if (refs.lastGoodCanvasRef.current) drawRenderResult(refs.lastGoodCanvasRef.current, refs, setRenderState);
  if (import.meta.env.DEV) console.warn('Canvas render failed.', error);
  setRenderFailure(error, setRenderState);
  finishRender();
}

function handleFallbackRenderFailure(
  fallbackError: unknown,
  refs: DocumentRendererRefs,
  abortController: AbortController,
  setRenderState: RenderStateSetter,
  finishRender: () => void,
) {
  if (isAbortError(fallbackError) || abortController.signal.aborted) {
    finishRender();
    return;
  }
  if (!refs.supersededRef.current && refs.lastGoodCanvasRef.current) {
    drawRenderResult(refs.lastGoodCanvasRef.current, refs, setRenderState);
  }
  if (import.meta.env.DEV) console.warn('Canvas render failed.', fallbackError);
  setRenderFailure(fallbackError, setRenderState);
}

function handlePrimaryRenderFailure(
  error: unknown,
  refs: DocumentRendererRefs,
  renderOptions: RenderOptions,
  abortController: AbortController,
  setRenderState: RenderStateSetter,
  finishRender: () => void,
) {
  if (isAbortError(error) || abortController.signal.aborted) {
    finishRender();
    return;
  }
  if (refs.supersededRef.current) {
    if (!renderOptions.skipEffects) refs.gpuFallbackUntilRef.current = performance.now() + 5000;
    finishRender();
    return;
  }
  if (renderOptions.skipEffects) {
    handleDraftRenderFailure(error, refs, setRenderState, finishRender);
    return;
  }

  refs.gpuFallbackUntilRef.current = performance.now() + 5000;
  renderDraftFallback(refs, renderOptions)
    .then((fallback) => {
      if (!refs.supersededRef.current) drawRenderResult(fallback, refs, setRenderState);
      if (import.meta.env.DEV) console.warn('Canvas render fell back to draft mode.', error);
    })
    .catch((fallbackError) =>
      handleFallbackRenderFailure(fallbackError, refs, abortController, setRenderState, finishRender),
    )
    .finally(finishRender);
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
  const supersededRef = useRef(false);
  const interactiveRenderRef = useRef(false);
  const activeAbortRef = useRef<AbortController | null>(null);
  const layerGraphCacheEntriesRef = useRef(new Map<string, Promise<HTMLCanvasElement>>());
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
  const primitiveViewStatesRef = useRef(options.primitiveViewStates);
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
  const interactiveGpuPassBudgetMsRef = useRef(options.interactiveGpuPassBudgetMs);
  const interactiveScaleRef = useRef<InteractiveScale>(1);
  const warmInteractiveSizeRef = useRef<string | null>(null);
  const warmupRef = useRef<DocumentRendererRefs['warmupRef']['current']>({ cancelIdle: null, abort: null });
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredFullRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelDeferredFullRenderIdleRef = useRef<(() => void) | null>(null);
  const [renderState, setRenderState] = useState<DocumentRenderState>({
    isRendering: false,
    hasFrame: false,
    showingStaleFrame: false,
    error: null,
  });
  // Stable bundle of the refs above; the literal is only used on the first render.
  const rendererRefsRef = useRef<DocumentRendererRefs>({
    canvasRef,
    renderingRef,
    supersededRef,
    interactiveRenderRef,
    activeAbortRef,
    layerGraphCacheEntriesRef,
    lastGoodCanvasRef,
    docRef,
    imageCacheRef,
    pwRef,
    phRef,
    renderWidthRef,
    renderHeightRef,
    fastRef,
    graphModeRef,
    primitiveViewStatesRef,
    cacheKeyRef,
    draftRenderScaleRef,
    draftMaxRenderDimensionRef,
    deferredPreviewQualityRef,
    draftUntilRef,
    gpuFallbackUntilRef,
    interactiveGpuPassBudgetMsRef,
    interactiveScaleRef,
    warmInteractiveSizeRef,
    warmupRef,
  });
  const mountOptions: RenderCanvasMountOptions = useMemo(
    () => ({
      cacheKey: options.cacheKey,
      deferFullRender: options.deferFullRender,
      renderScale: options.renderScale,
      maxRenderDimension: options.maxRenderDimension,
      deferredFullRenderTimeoutMs: options.deferredFullRenderTimeoutMs,
    }),
    [
      options.cacheKey,
      options.deferFullRender,
      options.renderScale,
      options.maxRenderDimension,
      options.deferredFullRenderTimeoutMs,
    ],
  );
  const renderSchedulingOptions = useMemo(
    () => ({
      fast: options.fast,
      deferFullRender: options.deferFullRender,
      deferredFullRenderTimeoutMs: options.deferredFullRenderTimeoutMs,
    }),
    [options.fast, options.deferFullRender, options.deferredFullRenderTimeoutMs],
  );

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
    primitiveViewStatesRef.current = options.primitiveViewStates;
    cacheKeyRef.current = makeRenderCacheKey(options.cacheKey, renderWidthRef.current, renderHeightRef.current);
    draftRenderScaleRef.current = options.draftRenderScale ?? options.renderScale;
    draftMaxRenderDimensionRef.current = options.draftMaxRenderDimension ?? options.maxRenderDimension;
    deferredPreviewQualityRef.current = options.deferredPreviewQuality ?? 'draft';
    deferredFullRenderMsRef.current = options.deferredFullRenderMs ?? DEFAULT_DEFERRED_FULL_RENDER_MS;
    deferredFullRenderTimeoutMsRef.current =
      options.deferredFullRenderTimeoutMs ?? DEFAULT_DEFERRED_FULL_RENDER_TIMEOUT_MS;
    interactiveGpuPassBudgetMsRef.current = options.interactiveGpuPassBudgetMs;
  }, [
    doc,
    imageCache,
    pw,
    ph,
    options.fast,
    options.graphMode,
    options.primitiveViewStates,
    options.cacheKey,
    options.renderScale,
    options.maxRenderDimension,
    options.draftRenderScale,
    options.draftMaxRenderDimension,
    options.deferredPreviewQuality,
    options.deferredFullRenderMs,
    options.deferredFullRenderTimeoutMs,
    options.interactiveGpuPassBudgetMs,
  ]);

  const cancelDeferredFullRender = useCallback(() => {
    if (deferredFullRenderTimerRef.current) {
      clearTimeout(deferredFullRenderTimerRef.current);
      deferredFullRenderTimerRef.current = null;
    }
    cancelDeferredFullRenderIdleRef.current?.();
    cancelDeferredFullRenderIdleRef.current = null;
  }, []);

  const doRender = useCallback((done: (options: { cooldown: boolean }) => void) => {
    const rendererRefs = rendererRefsRef.current;
    if (!rendererRefs.canvasRef.current) {
      done({ cooldown: false });
      return;
    }

    rendererRefs.supersededRef.current = false;
    cancelInteractiveWarmup(rendererRefs);
    rendererRefs.activeAbortRef.current?.abort();
    const abortController = new AbortController();
    rendererRefs.activeAbortRef.current = abortController;
    const { targetWidth, targetHeight, interactive, renderOptions } = currentRenderPolicy(
      rendererRefs,
      abortController,
    );
    rendererRefs.interactiveRenderRef.current = interactive;
    const finishRender = () => {
      finishRenderCycle(rendererRefs, abortController, done);
    };

    rendererRefs.renderingRef.current = true;
    // While a frame is showing, interactive passes during an edit do not mark the preview busy: only a missing frame
    // or a full-quality pass does, so each interactive frame does not cost two extra React commits.
    if (!interactive || !rendererRefs.lastGoodCanvasRef.current) markRenderStarted(setRenderState);
    timedPrimaryRender(rendererRefs, renderOptions, targetWidth, targetHeight)
      .then((result) => {
        if (interactive) rendererRefs.warmInteractiveSizeRef.current = renderSizeKey(targetWidth, targetHeight);
        handlePrimaryRenderSuccess(result, rendererRefs, renderOptions, abortController, setRenderState, finishRender);
        if (!interactive && !rendererRefs.supersededRef.current) scheduleInteractiveWarmup(rendererRefs);
      })
      .catch((error) =>
        handlePrimaryRenderFailure(error, rendererRefs, renderOptions, abortController, setRenderState, finishRender),
      );
  }, []);

  // Latest-wins: one render in flight, at most one waiting, and free main-thread time between renders.
  const schedulerRef = useRef<PreviewRenderScheduler | null>(null);
  /**
   * Preview progress for the indicator: `data-preview-pending` on the render container is "true" from an edit until
   * the frame for the latest document, including its deferred full-quality pass, has painted. It is written to the
   * DOM outside React so interactive frames do not cost a commit each (see docs/state-model.md).
   */
  const syncPreviewPending = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const scheduler = schedulerRef.current;
    const pending =
      Boolean(scheduler?.running || scheduler?.pending) ||
      settleTimerRef.current !== null ||
      deferredFullRenderTimerRef.current !== null ||
      cancelDeferredFullRenderIdleRef.current !== null;
    const value = pending ? 'true' : 'false';
    if (container.dataset.previewPending !== value) container.dataset.previewPending = value;
  }, []);
  const scheduleRender = useCallback(() => {
    let scheduler = schedulerRef.current;
    if (!scheduler) {
      scheduler = createPreviewRenderScheduler({
        run: (done) =>
          doRender((options) => {
            done(options);
            syncPreviewPending();
          }),
        minIntervalMs: PREVIEW_FRAME_INTERVAL_MS,
        // A newer request aborts a running full-quality pass and drops its result. A running interactive pass is
        // allowed to finish and paint (one input behind): dropping it too left continuous drags on slow machines with
        // no preview frames at all (see docs/performance.md).
        onSupersede: () => {
          if (interactiveRenderRef.current) return;
          supersededRef.current = true;
          activeAbortRef.current?.abort();
        },
      });
      schedulerRef.current = scheduler;
    }
    scheduler.request();
    syncPreviewPending();
  }, [doRender, syncPreviewPending]);
  const cancelScheduledRender = useCallback(() => {
    schedulerRef.current?.cancelScheduled();
  }, []);

  const scheduleDeferredFullRender = useCallback(() => {
    cancelDeferredFullRender();
    const run = () => {
      deferredFullRenderTimerRef.current = null;
      cancelDeferredFullRenderIdleRef.current = null;
      draftUntilRef.current = 0;
      scheduleRender();
    };

    deferredFullRenderTimerRef.current = setTimeout(() => {
      deferredFullRenderTimerRef.current = null;
      cancelDeferredFullRenderIdleRef.current = scheduleIdle(run, deferredFullRenderTimeoutMsRef.current);
    }, deferredFullRenderMsRef.current);
  }, [cancelDeferredFullRender, scheduleRender]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const rendererRefs = rendererRefsRef.current;
    if (!container) return;
    const canvas = mountRenderCanvas(container, rendererRefs, pw, ph, mountOptions, setRenderState);
    scheduleRender();
    return () =>
      cleanupMountedRenderCanvas({
        container,
        canvas,
        refs: rendererRefs,
        cancelScheduledRender,
        cancelDeferredFullRender,
      });
  }, [
    pw,
    ph,
    options.cacheKey,
    options.renderScale,
    options.maxRenderDimension,
    options.deferFullRender,
    options.deferredFullRenderTimeoutMs,
    mountOptions,
    scheduleRender,
    cancelScheduledRender,
    cancelDeferredFullRender,
  ]);

  useEffect(() => {
    const deferFullRender = shouldDeferFullRender(renderSchedulingOptions);
    if (shouldRefreshDraftWindow(lastGoodCanvasRef.current, renderSchedulingOptions, deferFullRender)) {
      draftUntilRef.current = performance.now() + nextDraftWindowMs(renderSchedulingOptions, deferFullRender);
    }
    clearRenderTimer(settleTimerRef);
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
    syncPreviewPending();
  }, [
    doc,
    imageCache,
    options.fast,
    options.graphMode,
    options.primitiveViewStates,
    options.cacheKey,
    options.deferFullRender,
    options.deferredPreviewQuality,
    options.deferredFullRenderMs,
    options.deferredFullRenderTimeoutMs,
    options.draftRenderScale,
    options.draftMaxRenderDimension,
    renderSchedulingOptions,
    scheduleRender,
    cancelDeferredFullRender,
    scheduleDeferredFullRender,
    syncPreviewPending,
  ]);

  useEffect(
    () => () => {
      cancelScheduledRender();
      clearRenderTimer(settleTimerRef);
      cancelInteractiveWarmup(rendererRefsRef.current);
      activeAbortRef.current?.abort();
      activeAbortRef.current = null;
      cancelDeferredFullRender();
    },
    [cancelDeferredFullRender, cancelScheduledRender],
  );

  return { containerRef, renderState, retryRender: scheduleRender };
}
