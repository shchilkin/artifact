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
import { createLayerPreviewRenderCache } from '../utils/layerPreviewRenderCache';
import { type RenderOptions, renderDocument } from '../utils/renderer';
import { createPreviewRenderScheduler, type PreviewRenderScheduler } from './previewRenderScheduler';

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

let blankSampleCanvas: HTMLCanvasElement | null = null;

/**
 * Copies the BLANK_SAMPLE_STEPS x BLANK_SAMPLE_STEPS sample grid into a small canvas and reads that, so the check
 * does not read back the whole frame.
 */
function readBlankSamples(canvas: HTMLCanvasElement): Uint8ClampedArray | null {
  const width = canvas.width;
  const height = canvas.height;
  blankSampleCanvas ??= document.createElement('canvas');
  blankSampleCanvas.width = BLANK_SAMPLE_STEPS;
  blankSampleCanvas.height = BLANK_SAMPLE_STEPS;
  const ctx = blankSampleCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, BLANK_SAMPLE_STEPS, BLANK_SAMPLE_STEPS);
  for (let yStep = 0; yStep < BLANK_SAMPLE_STEPS; yStep += 1) {
    for (let xStep = 0; xStep < BLANK_SAMPLE_STEPS; xStep += 1) {
      const x = Math.min(width - 1, Math.round((xStep / (BLANK_SAMPLE_STEPS - 1)) * (width - 1)));
      const y = Math.min(height - 1, Math.round((yStep / (BLANK_SAMPLE_STEPS - 1)) * (height - 1)));
      ctx.drawImage(canvas, x, y, 1, 1, xStep, yStep, 1, 1);
    }
  }
  return ctx.getImageData(0, 0, BLANK_SAMPLE_STEPS, BLANK_SAMPLE_STEPS).data;
}

export function isLikelyBlankRender(canvas: HTMLCanvasElement, doc: CanvasDocument): boolean {
  if (!hasVisibleContentLayer(doc)) return false;
  if (canvas.width <= 0 || canvas.height <= 0) return true;

  const pixels = readBlankSamples(canvas);
  if (!pixels) return false;

  let maxChannel = 0;
  let alphaTotal = 0;
  let luminanceTotal = 0;
  const samples = BLANK_SAMPLE_STEPS * BLANK_SAMPLE_STEPS;
  for (let index = 0; index < samples * 4; index += 4) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    maxChannel = Math.max(maxChannel, r, g, b);
    alphaTotal += pixels[index + 3] ?? 0;
    luminanceTotal += 0.299 * r + 0.587 * g + 0.114 * b;
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
  pendingRef: MutableRefObject<boolean>;
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
  const ctx = displayCanvas.getContext('2d')!;
  ctx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality =
    result.width < displayCanvas.width || result.height < displayCanvas.height ? 'medium' : 'high';
  ctx.drawImage(result, 0, 0, displayCanvas.width, displayCanvas.height);
  refs.lastGoodCanvasRef.current = result;
  if (result.width === displayCanvas.width && result.height === displayCanvas.height) {
    rememberRenderFrame(refs.cacheKeyRef.current, result);
  }
  setRenderState({
    isRendering: false,
    hasFrame: true,
    showingStaleFrame: false,
    error: null,
  });
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
    ? getRenderDimensions(
        refs.pwRef.current,
        refs.phRef.current,
        refs.draftRenderScaleRef.current,
        refs.draftMaxRenderDimensionRef.current,
      )
    : [refs.renderWidthRef.current, refs.renderHeightRef.current];

  return {
    targetWidth,
    targetHeight,
    interactive: usePreviewSize,
    renderOptions: {
      skipEffects: useDraftQuality,
      draft: useDraftQuality,
      graphMode: refs.graphModeRef.current,
      primitiveViewStates: refs.primitiveViewStatesRef.current,
      signal: abortController.signal,
    } satisfies RenderOptions,
  };
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
  refs.activeAbortRef.current?.abort();
  refs.activeAbortRef.current = null;
  refs.canvasRef.current = null;
  if (container.contains(canvas)) container.removeChild(canvas);
}

function shouldUseBlankFallback(result: HTMLCanvasElement, refs: DocumentRendererRefs, renderOptions: RenderOptions) {
  return !refs.pendingRef.current && !renderOptions.skipEffects && isLikelyBlankRender(result, refs.docRef.current);
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
  if (!refs.pendingRef.current) drawRenderResult(result, refs, setRenderState);
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
  if (!refs.pendingRef.current && refs.lastGoodCanvasRef.current) {
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
  if (refs.pendingRef.current) {
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
      if (!refs.pendingRef.current) drawRenderResult(fallback, refs, setRenderState);
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
  const pendingRef = useRef(false);
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
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredFullRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredFullRenderIdleRef = useRef<number | null>(null);
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
    pendingRef,
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

  const doRender = useCallback((done: (options: { cooldown: boolean }) => void) => {
    const rendererRefs = rendererRefsRef.current;
    if (!rendererRefs.canvasRef.current) {
      done({ cooldown: false });
      return;
    }

    rendererRefs.pendingRef.current = false;
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
    markRenderStarted(setRenderState);
    timedPrimaryRender(rendererRefs, renderOptions, targetWidth, targetHeight)
      .then((result) =>
        handlePrimaryRenderSuccess(result, rendererRefs, renderOptions, abortController, setRenderState, finishRender),
      )
      .catch((error) =>
        handlePrimaryRenderFailure(error, rendererRefs, renderOptions, abortController, setRenderState, finishRender),
      );
  }, []);

  // Coalesce multiple state changes within a frame into one render call.
  const schedulerRef = useRef<PreviewRenderScheduler | null>(null);
  const scheduleRender = useCallback(() => {
    let scheduler = schedulerRef.current;
    if (!scheduler) {
      scheduler = createPreviewRenderScheduler({
        run: (done) => doRender(done),
        // An interactive pass finishes and paints, so a continuous gesture keeps showing frames; a slower
        // full-quality pass is aborted and its result dropped.
        onSupersede: () => {
          if (interactiveRenderRef.current) return;
          pendingRef.current = true;
          activeAbortRef.current?.abort();
        },
      });
      schedulerRef.current = scheduler;
    }
    scheduler.request();
  }, [doRender]);
  const cancelScheduledRender = useCallback(() => {
    schedulerRef.current?.cancelScheduled();
  }, []);

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
  ]);

  useEffect(
    () => () => {
      cancelScheduledRender();
      clearRenderTimer(settleTimerRef);
      activeAbortRef.current?.abort();
      activeAbortRef.current = null;
      cancelDeferredFullRender();
    },
    [cancelDeferredFullRender, cancelScheduledRender],
  );

  return { containerRef, renderState, retryRender: scheduleRender };
}
